import { describe, expect, it } from "vitest";
import { getPreparedBy } from "./preparedBy";

describe("getPreparedBy", () => {
  it("returns null when nothing is set (block hidden)", () => {
    expect(getPreparedBy({})).toBeNull();
    expect(getPreparedBy({ PREPARED_BY_NAME: "  " })).toBeNull();
  });
  it("reads name, email and URL from env", () => {
    expect(getPreparedBy({ PREPARED_BY_NAME: "Abdul Rafy", PREPARED_BY_EMAIL: "rafy@example.com", PREPARED_BY_URL: "https://linkedin.com/in/rafy" })).toEqual({
      name: "Abdul Rafy",
      email: "rafy@example.com",
      url: "https://linkedin.com/in/rafy",
    });
  });
  it("drops an invalid email or URL but keeps the rest", () => {
    expect(getPreparedBy({ PREPARED_BY_NAME: "Rafy", PREPARED_BY_EMAIL: "not-an-email", PREPARED_BY_URL: "javascript:alert(1)" })).toEqual({ name: "Rafy" });
  });
});
