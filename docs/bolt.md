# Luma on Bolt

## Preview the full app

Import this version of the repository into Bolt. The repository's StackBlitz start command is `npm run dev:bolt`. If the preview does not start automatically, run `npm install` and then `npm run dev:bolt` in Bolt's terminal. Open preview port 3000. This development script uses the JavaScript build of SQLite with in-memory demo data. Restarting the preview resets appointments, conversations, and dashboard edits.

Chat defaults to the built-in receptionist when no model key is configured. To test the dashboard, set a temporary `ADMIN_PASSWORD` and `SESSION_SECRET` in Bolt's server-side development environment, then restart the preview. Use demo data in the preview.

## Publish with persistent appointments

Bolt hosting supports Next.js server rendering. This version can publish the Next.js frontend on Bolt, with its `/api/*` requests forwarded server-side to one persistent Luma backend. This keeps the browser on the same origin for API calls and dashboard cookies.

1. Run this version on a persistent Node.js host with Node 22.13+ or 24 using `npm ci`, `npm run build`, and `npm start`. Run one application instance and mount a persistent volume. Set `LUMA_DATA_DIR` to the mounted directory. Leave `LUMA_BACKEND_URL` unset on this server. If you have an existing SQLite database and Google Calendar token, place `app.db` and `google-token.json` in that directory before starting. Stop writers or use a consistent SQLite backup when copying an existing database.
2. On the backend, set strong `ADMIN_PASSWORD` and `SESSION_SECRET` values, and set `APP_URL` to the public Bolt HTTPS origin. Set `SEED_DEMO=false` for a new production database without demo bookings. Configure any AI keys, Google OAuth credentials, or webhook credentials on the backend. For Google OAuth, register the published Bolt URL with `/api/google/callback` appended and ensure `GOOGLE_REDIRECT_URI` matches it.
3. In the Bolt deployment build environment, set `LUMA_BACKEND_URL` to the persistent backend's HTTPS origin with no trailing path. Run the normal `npm run build` and publish. Rebuild and republish if you change that value.
4. Check `/api/health`, chat, admin sign-in, and a test booking on the published URL. Restart the backend and verify that the test booking remains. If using Calendar sync, verify the Google callback and a test event.

The project can also run entirely on the persistent Node.js host. Keep `LUMA_BACKEND_URL` unset and set `APP_URL` and the OAuth callback to that host's public URL.

[Bolt publishing documentation](https://support.bolt.new/troubleshooting/publish-issues.md#contains-no-html-file-error)
