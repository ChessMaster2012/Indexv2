# Index deployment guide

## Persistent account storage

This build uses Supabase as the persistent account database when `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` are present. The server stores the account state as a compressed
Brotli blob, which is substantially smaller than storing the full JSON document directly.

Required Render environment variables:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

Run `SUPABASE-SETUP.sql` once in Supabase SQL Editor.

## What survives a Render deploy

User account records and saved account state are stored in Supabase and survive normal Render
redeploys/restarts. The in-memory login session can end on a restart, so the user may need to
sign in again, but their saved account data remains in the database.

## Free-plan capacity

Supabase Free currently includes 500 MB database size and 50,000 monthly active users.
The build minimizes database footprint and write frequency, but the Free plan still has finite
capacity and can pause after inactivity.

## Google Sign-In

`Continue with Google` uses only `openid email profile` and the callback:
`/api/auth/google/callback`

No Google Drive permissions are requested by the sign-in flow.

## School/district conduct

The build keeps the county/district first-launch acknowledgment, conduct guardrails,
academic-integrity protections, and local Review/Terms/Privacy pages. Index is an independent
educational project and does not claim district approval.


## Updated authentication + Daily Wheel
Google OAuth now reads GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET from Render environment variables. Rewards includes a server-side weighted RNG Daily Wheel, one spin per America/New_York calendar day, persisted in the same account progress and wallet, with the existing 500-coin daily earning cap shared across reward sources. Run the updated SUPABASE-SETUP.sql once and make sure Render uses the Supabase service-role key, not the anon/publishable key.
