# Index security & student-privacy baseline

What the code does (verify in `security.js`, `server.js`, `canvas.js`):

**Transport & browser protections**
- HSTS (HTTPS only), `Content-Security-Policy` (no third-party scripts/frames/objects, same-origin connections), `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` (camera, mic, location, payment, USB off), COOP.
- `X-Powered-By` removed; `Cache-Control: no-store` on every `/api/` response; JSON error handler (no stack traces).
- Session cookie: `HttpOnly`, `SameSite=Lax`, `Secure` in production.
- State-changing API calls from another website's origin are rejected (same-origin check), and live-game sockets accept same-origin only.

**Abuse protection**
- Rate limits: global per IP, sign-in/sign-up/reset per IP, AI per session, Canvas per session (limits are generous because a whole school can share one IP).
- Sign-in lockout: 8 wrong passwords for one account name locks that name for 15 minutes.
- Passwords hashed with scrypt + per-user salt; password-reset tokens are hashed, single-use, 1-hour expiry; recovery emails are rate limited and never confirm whether an account exists.

**Student data**
- Account deletion endpoint removes the account and any Canvas connection.
- Canvas: read-only API calls, tokens AES-256-GCM encrypted at rest, never sent back to the browser, SSRF-protected host checks. Google Drive access exists in code but is **off** (`CANVAS_GOOGLE_DRIVE=1` to enable).
- Content moderation for names/chat/AI prompts; AI is proxied server-side so no API keys reach the browser.
- Dependencies: `npm audit` reports 0 known vulnerabilities.

## What code cannot certify (needs the school district / a lawyer)
No software can "follow all guidelines for all counties" by itself. Before relying on Index in a district:
1. **District approval / data-privacy agreement** (Maryland districts review tools through their digital-tools lists; e.g. MCPS blocks unapproved apps).
2. **COPPA / FERPA / Maryland Student Data Privacy Act**: privacy policy review by counsel, a parental-consent path for students under 13, and a documented process for data requests and deletion.
3. **Vendor review** of subprocessors (Render hosting, Supabase database, the AI provider, Stripe, email provider).
4. Optional accessibility review (WCAG 2.1 AA) and a third-party penetration test.

## Known limitations
- `'unsafe-inline'` remains in the CSP script/style policy because the app uses inline scripts and handlers; removing it requires refactoring to nonces.
- Rate-limit counters are in memory (reset on restart, per instance).
- With Supabase-backed sessions, a signed session cookie stays valid until it expires even after logout elsewhere or a password reset.
