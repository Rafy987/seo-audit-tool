"use client";

import { useEffect, useMemo, useState } from "react";

// State of one request to our API.
export type Remote<T> =
  | { status: "idle" } // not started (waiting for something else first)
  | { status: "loading" }
  | { status: "done"; data: T }
  | { status: "failed"; error: string };

const GENERIC_ERROR = "Something went wrong. Please try again.";

/**
 * POSTs `body` as JSON to `url` and tracks the result.
 * - `body === null` means "don't start yet".
 * - `initial` is a result we already have (e.g. from the browser cache); it's used
 *   instead of a request until the body changes or `retry()` is called.
 * - When `body` changes, the request runs again (and the old one is cancelled).
 */
export function usePost<T>(url: string, body: unknown, initial: T | null = null) {
  const bodyJson = body === null ? null : JSON.stringify(body);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; state: Remote<T> } | null>(null);
  const [firstBody] = useState(bodyJson); // the body we had on first render

  const useInitial = initial !== null && attempt === 0 && bodyJson === firstBody;
  const key = `${attempt}:${bodyJson}`;

  useEffect(() => {
    if (bodyJson === null || useInitial) return;
    const controller = new AbortController();
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: bodyJson, signal: controller.signal })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as T & { error?: string };
        if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : GENERIC_ERROR);
        setResult({ key, state: { status: "done", data } });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return; // cancelled on purpose
        setResult({ key, state: { status: "failed", error: err instanceof Error && err.message ? err.message : GENERIC_ERROR } });
      });
    return () => controller.abort();
  }, [url, bodyJson, key, useInitial]);

  // Work out what to show without extra state updates. useMemo keeps the same
  // object between renders, so components that depend on it don't redo work.
  const state = useMemo<Remote<T>>(() => {
    if (useInitial) return { status: "done", data: initial as T };
    if (bodyJson === null) return { status: "idle" };
    if (result?.key === key) return result.state;
    return { status: "loading" }; // request for this body/attempt is in flight
  }, [useInitial, initial, bodyJson, result, key]);

  return { state, retry: () => setAttempt((a) => a + 1) };
}
