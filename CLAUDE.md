# LeadLeak — Local SEO & Lead Audit for Contractors

## What this project is
A web app where a user enters a contractor's website URL and gets an audit report that explains **why the site is losing leads** (calls and quote requests), with an overall score and AI-written fixes in plain English.

Portfolio project: it must be real, deployed on Vercel with a live link, with a clean README and screenshots. I will also use it to send free audits to freelance clients.

## About me (the developer)
- Software Engineering graduate; I know JavaScript, React, Node.js, Express, MongoDB, PHP/Laravel, Git, WordPress/Elementor.
- **New to me: Next.js (App Router) and TypeScript.** I am learning them through this project and must understand every part for job interviews.
- I work in SEO (GA4, Search Console, Google Ads) for a US flooring contractor, so I know the contractor niche.

## How to work with me (IMPORTANT)
- **Keep replies short and simple, in Roman Urdu bullet points.** No long explanations.
- **One step / one feature at a time.** Before coding, show the plan in 3–5 short bullets and wait for my OK.
- When you use a new Next.js or TypeScript concept, explain it in 1–2 simple lines.
- After each step, tell me exactly how to test it in the browser.
- Make small git commits with clear messages after each working feature, and push.
- **Only free tools and free API tiers.** Never add anything that needs a credit card.
- Never put API keys in code. Use `.env.local` (git-ignored) and keep `.env.example` with placeholders. Never print keys.
- This is Next.js 16: follow `AGENTS.md` in this repo and check the bundled Next.js docs before using an API you are unsure about.

## Tech stack
- Next.js (App Router) + TypeScript, Tailwind CSS v4
- Server-side Route Handlers (`app/api/.../route.ts`) to fetch and parse pages with `cheerio`
- Google PageSpeed Insights API (free) for performance + Core Web Vitals (LCP, CLS, INP), mobile and desktop
- Groq API (free tier) for the AI report
- PDF export (react-pdf or jsPDF — choose the simpler one that works on Vercel)
- Tests: Vitest for the check functions (pure functions, no network)
- Deploy: Vercel (free), code on GitHub (Rafy987/seo-audit-tool)

## Design rules (IMPORTANT)
- Inspired by the **Ahrefs Site Audit** dashboard feel — NOT a copy (no Ahrefs logo, name or assets).
  - Dark top bar, light gray page background, clean white panels with thin borders, small clean font (Inter), dense and data-focused.
  - A health score (0–100) and issue lists with status colors: Error (red), Warning (orange/amber), Notice (blue), Passed (green).
- Our brand: name **LeadLeak**, accent color construction orange `#f26b1d`. Colors are defined as tokens in `app/globals.css` (`@theme`).
- **Must NOT look AI-generated:** no purple/blue gradients, no emojis in the UI, no "✨ Powered by AI" badges, no generic filler text. Use real contractor-specific wording (e.g. "Your phone number isn't clickable on mobile").
- Mobile-friendly. Professional, like an audit report.

## What the audit checks
1. **Lead capture:** click-to-call `tel:` links (header / mobile), quote/contact form (exists, number of fields), "Free estimate / Get a quote" CTA above the fold.
2. **Local SEO:** LocalBusiness (or subtype) JSON-LD schema and its fields (name, address, phone, areaServed); city/service pages (from sitemap.xml and internal links, max ~20 pages crawled); NAP consistency **within the site** (header, footer, contact page, schema); Google Maps embed / service area.
3. **Trust signals:** reviews/testimonials, rating schema, Google review link, license number ("Lic #", "CSLB"), "licensed & insured", BBB, warranty, project gallery.
4. **On-page SEO:** title, meta description, H1/H2 structure, image alt text, canonical, robots meta, Open Graph, word count, internal/external links.
5. **Speed:** PageSpeed Insights mobile + desktop score, LCP, CLS, INP.
6. **Score:** each check = pass / warning / fail with a weight → overall 0–100 plus a category score.
7. **AI report (Groq):** plain English, prioritized: "Your site is losing leads because…", top fixes first. Send only the audit results (not the whole HTML) to save tokens.

## Honest limits (state these in the README)
- NAP consistency is checked only **inside the website**. Checking Google Business Profile/Yelp needs paid APIs (card required).
- No Google review count for the same reason; only on-site review signals.
- Some sites block automated fetches; show a clear friendly error.

## Build phases (in order)
1. ✅ Setup + design foundation + URL form (done: globals.css tokens, layout top bar, `lib/url.ts`, `components/AuditForm.tsx`)
2. API route: fetch the page HTML safely (timeout, size limit, user agent, block localhost/private IPs) + return basic info
3. On-page SEO checks (pure functions + Vitest tests)
4. Lead capture checks
5. Local SEO checks (schema, NAP, mini crawl of sitemap/city pages)
6. Trust signal checks
7. Scoring system + results dashboard UI (Ahrefs-style)
8. PageSpeed Insights API
9. Groq AI report
10. PDF download
11. Error handling, loading states, rate limiting (protect free API limits)
12. Deploy on Vercel, README (live link, screenshots, honest limits), then CV bullet, LinkedIn post, Upwork portfolio text
