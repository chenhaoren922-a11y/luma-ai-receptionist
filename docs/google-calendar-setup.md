# Connect Google Calendar

Luma uses a Google OAuth **Web application** client. The app only needs permission to view and edit events, not to manage the whole Google account. Credentials are optional: without them the studio runs entirely on local SQLite scheduling.

## 1. Create a Google Cloud project

1. Open <https://console.cloud.google.com/>.
2. Create a project (for example, `Luma Studio Receptionist`).
3. Go to **APIs & Services → Library**.
4. Find **Google Calendar API** and click **Enable**.

## 2. Configure the OAuth consent screen

1. Go to **APIs & Services → OAuth consent screen**.
2. Choose **External** (or **Internal** if you use Google Workspace).
3. Fill in the app name, support email, and developer contact.
4. Add the scope `https://www.googleapis.com/auth/calendar.events`.
5. While testing, add the Google account that owns the studio calendar under **Test users**.
6. Save.

The app requests only:

```text
https://www.googleapis.com/auth/calendar.events
```

## 3. Create the OAuth client

1. Go to **APIs & Services → Credentials**.
2. Click **Create credentials → OAuth client ID**.
3. Application type: **Web application**.
4. Name: `Luma Studio local` (or similar).
5. Add an authorized redirect URI:

```text
http://localhost:3000/api/google/callback
```

If you deploy the app, add the production URI as well, for example:

```text
https://reception.example.com/api/google/callback
```

6. Click **Create** and copy the **Client ID** and **Client secret**.

## 4. Add credentials to the app

Edit `.env.local`:

```env
APP_URL=http://localhost:3000
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/callback
GOOGLE_CALENDAR_ID=primary
```

Restart the app:

```powershell
npm run dev
```

## 5. Connect the calendar

1. Sign in at <http://localhost:3000/admin>.
2. Open **Settings → Google Calendar**.
3. Click **Connect**.
4. Choose the Google account that owns the studio calendar.
5. Approve the calendar events permission.
6. You will return to the dashboard with **connected** shown.

Use **Test** to verify the calendar is reachable. Use **Backfill** to push confirmed local-only appointments into Google. **Disconnect** revokes the local token.

## 6. How the integration behaves

- New confirmed appointments create an event with:
  - title `Appointment · Service · Customer`
  - the booking code and phone number in the description
  - private extended properties for the booking code, service, and team member
  - a 1-day email reminder and a 1-hour popup reminder
- Cancelling deletes the event. Rescheduling updates it.
- The provider searches by booking code before creating, so a retried request does not duplicate an event.
- One unified calendar is supported. All appointments are written to `GOOGLE_CALENDAR_ID`.
- External events on that calendar are treated as busy:
  - all-day events block the whole day for everyone
  - timed events block all staff unless they carry a private `staffId` property
  - events created by the app are tagged and skipped, because local SQLite already knows which team member is booked
- If Google is temporarily unavailable while checking availability, the app refuses to guess and asks the customer to call the studio.

## 7. Token storage

The OAuth token is stored at:

```text
data/google-token.json
```

It is gitignored. Protect it like a password. The app refreshes access tokens automatically and writes the refreshed token back.

If authorization fails with `invalid_grant` or the connection stops working, click **Connect** again to re-authorize.

## 8. Testing-mode expiry

Google OAuth apps in **Testing** mode may issue refresh tokens that expire after about seven days. Reconnect when that happens. For production:

1. Complete the OAuth consent screen verification if Google requires it.
2. Publish the app.
3. Use HTTPS and add the production redirect URI.
4. Set `APP_URL` and `GOOGLE_REDIRECT_URI` to the production values.

For a Google Workspace-only studio, **Internal** user type avoids public verification.

## 9. Troubleshooting

| Symptom | Fix |
|---|---|
| `redirect_uri_mismatch` | Match the redirect URI in Google Cloud exactly, including port and path |
| `Access blocked` | Add the Google account as a test user, or use an Internal app |
| Connect button shows setup checklist | `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` is missing; restart after editing `.env.local` |
| `invalid_grant` | Reconnect the calendar; the refresh token expired or was revoked |
| Event created but not visible | Check `GOOGLE_CALENDAR_ID`; an event can be written to a secondary calendar |
| 403 from Calendar API | Enable the Calendar API and confirm the `calendar.events` scope is granted |
| Local bookings are not in Google | Use **Backfill** after connecting, or click **Sync** on an appointment |

## 10. Calendar choice

`primary` means the main calendar of the Google account that authorized the app. To use a different calendar:

1. Open Google Calendar → the calendar's settings → **Integrate calendar**.
2. Copy the **Calendar ID** (usually an email-like address).
3. Paste it into **Admin → Settings → Calendar ID**.
4. Save, then click **Test**.
5. If the calendar is not owned by the authorizing account, share it with that account with permission to make changes to events.
