# Canvas integration setup

Students can already connect with a personal **access token** (Canvas > Account > Settings > + New Access Token). No server setup needed.

To switch on the one-click **Sign in with Canvas** button, a Canvas admin at the school/district creates a Developer Key
(Admin > Developer Keys > + API Key) with redirect URI `https://YOUR-INDEX-DOMAIN/api/canvas/oauth/callback`, then set in Render:

- `CANVAS_CLIENT_ID` and `CANVAS_CLIENT_SECRET` — one key used for any school host, **or**
- `CANVAS_OAUTH_KEYS` — JSON per school, e.g. `{"myschool.instructure.com":{"id":"123","secret":"abc"}}`
- `PUBLIC_BASE_URL` — your public Index URL (already used by Google sign-in)
- optional `CANVAS_TOKEN_SECRET` — passphrase for encrypting stored tokens (otherwise a key file is created in DATA_DIR)
- optional `CANVAS_USE_SCOPES=1` — request read-only scopes (only if the Developer Key enforces scopes)

Tokens are stored encrypted in `DATA_DIR/canvas.json` and never sent to the browser. If DATA_DIR is not persistent, students simply reconnect after a redeploy.
