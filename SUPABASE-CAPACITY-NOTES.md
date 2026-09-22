# Index account storage capacity notes

This build keeps account data compact while keeping the signed-in account as the source of truth.

- Identity/auth fields are stored as normal database columns.
- Index account state is stored as one Brotli-compressed Base64 blob.
- Auth lookups omit the state blob and fetch it only when account state is loaded.
- With Supabase configured, the server does not maintain a second permanent users.json copy.
- Account-state sync is debounced to reduce database write traffic.
- Large binary files should not be embedded in account state.

Supabase Free currently provides 500 MB of database size, 1 GB of file storage, and 50,000
monthly active users. These are plan limits, not a guarantee for any particular county population.
Monitor usage as the app grows. See the included deployment notes and current Supabase docs.
