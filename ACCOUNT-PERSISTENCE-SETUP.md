# Index account persistence + lightweight storage

This build treats a signed-in Index account as the canonical owner of the user's saved Index data.
The browser keeps a local cache for speed and offline-friendly rendering, but the server account record
in Supabase is the source of truth after sign-in.

## Saved account data

The account stores compact JSON state containing: notes, study sets, custom topics, XP/progress,
coins/reward progress, profile settings, county/district context, and equipped profile settings.
Passwords are never stored in plain text; email/username passwords use salted server-side hashes.

## Lightweight design

- Account state is compressed with Brotli before it is written to Supabase.
- Authentication lookups request only identity/password fields; the saved state blob is fetched only when needed.
- The server does not keep a second permanent copy of user accounts in Render's ephemeral filesystem when Supabase is enabled.
- Account state sync is debounced to reduce database writes.
- Large binary files are not stored in the database.

This is important for a large county because the database quota is per project, not per county. Keep user-created
study data reasonably text-sized and avoid storing images or other large binary files in account state.

## Supabase Free

Supabase currently lists its Free plan at $0/month with a 500 MB database quota, 1 GB file storage, and 50,000 monthly active users.
Free projects can be paused after a period of low activity.

The app is designed to use the database efficiently, but no free service can guarantee unlimited users or unlimited storage.
See the current Supabase limits before opening the app to a very large population.

## One-time setup

1. Create a Supabase project on the Free plan.
2. Open SQL Editor.
3. Run `SUPABASE-SETUP.sql` once. It is written to be safe to rerun.
4. Copy the Supabase Project URL.
5. Copy the server-side service-role key.
6. In Render -> Index -> Environment, add:

   `SUPABASE_URL` = your Supabase project URL

   `SUPABASE_SERVICE_ROLE_KEY` = your service-role key

7. Keep your existing `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` variables.
8. Redeploy Index.

Never place the Supabase service-role key or Google client secret in GitHub or browser JavaScript.

## Google Sign-In

The app uses Google's basic OpenID Connect identity scopes only:
`openid email profile`. It does not request Google Drive permissions.
The callback is `/api/auth/google/callback`.

## County / school guidance

The first-launch county/district acknowledgment and local Review/Terms/Privacy pages remain in the build.
Index presents official district guidance links where configured and does not claim district endorsement or approval.
