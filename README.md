# Rijal al-Fajr

Check in for Fajr at your mosque, keep your streak, win your mosque's podium, and compete with mosques around the world.

- **The app** is at `/`. It is a web app that works in any phone browser.
- **The about page** is at `/about/`. It explains the features.
- Native iPhone and Android apps are the next iteration. The web app is built so it can be wrapped for the stores.

## What it does

**Check-in**
- A QR code on the mosque's screen that changes every 30 seconds.
- A printed poster whose code only works while the phone is at the mosque.
- An attendance list for children and anyone without a phone: type a name to tick it, or add and mark a new name in one tap, and printed member cards a volunteer can scan.
- A parent checks in their children on the same scan.
- Open only around Fajr: from shortly before the adhan until sunrise, worked out from the mosque's location.
- One check-in per person per Fajr, at any registered mosque.

**Competition**
- A podium (1st, 2nd, 3rd) and leaderboard at each mosque, by week, month and all time, for everyone or by group.
- Challenges with dates and prizes set by the mosque admin: a prize per place, and rewards for reaching a number of days.
- Organisations that group several mosques under one leaderboard, with their own challenges and prizes.
- A world leaderboard of approved mosques, by total check-ins or by consistency.
- Squads of up to 10 friends inside a mosque.

**Sponsors**: anyone can offer to sponsor, choose how (prizes, breakfast, funds, vouchers), and choose who may contact them: every mosque in their country, or one mosque. Only mosque and organisation admins see their contact details.

**For each person**: streaks, a calendar, nine badges, family members, a share card, light and dark mode, hiding your name, deleting your account.

**For mosque staff**: the mosque screen, attendance list, poster and cards to print, a 14-day chart, CSV export, admins and volunteers, practice mode.

**For the owner**: approve mosques for the world leaderboard, suspend a mosque, handle reports.

## Run it

```bash
npm install
npm run seed     # optional: demo mosques and six weeks of check-ins
npm run dev      # app on http://localhost:5173, API on http://localhost:8787
```

With no `DATABASE_URL`, data is kept in an embedded Postgres under `.data/`, so there is nothing else to install.

The seed creates a demo account: `demo@rijalalfajr.app` / `fajr-demo-1`. To give it the owner console, start the server with `OWNER_EMAILS=demo@rijalalfajr.app`.

To try check-in outside Fajr hours, turn on **Practice mode** in the mosque's settings.

```bash
npm test         # API tests: check-in rules, QR expiry, location, leaderboards, challenges
npm run build    # type-check and build to dist/
npm start        # serve the built app and the API together on port 8787
```

## Deploy

The repo is set up for Vercel: the web app is static, and `api/index.ts` runs the API as a function.

Set these environment variables:

| Variable | What it is |
| --- | --- |
| `DATABASE_URL` | A Postgres connection string (Neon, Supabase or any other). Tables are created on first run. |
| `OWNER_EMAILS` | Comma-separated emails that get the owner console. |

The Vercel setup has not been deployed yet, so treat the first deployment as a test.

## How it is put together

| Path | What is there |
| --- | --- |
| `server/app.ts` | Every API route |
| `server/fajr.ts` | Fajr time, the check-in window, distance |
| `server/security.ts` | Passwords, sessions, the signed QR codes |
| `server/board.ts` | Streaks, ranking, badges |
| `server/db.ts` | The schema and the two database drivers |
| `src/pages/` | One file per screen |
| `src/ui.tsx` | Shared pieces: session, podium, QR display, camera scanner |
| `about/` | The about page |
| `tests/` | API tests |

Ranking is by days attended, then longest streak, then earliest average arrival.

## Before a public launch

- Add rate limiting to sign-up and sign-in.
- Add password reset by email (needs an email service and a domain).
- Have the privacy and rules pages checked for your country.

## Next

Native apps for the App Store and Google Play, Fajr reminder notifications, Arabic and other languages, sign in with Google or Apple, a map of mosques, certificates.
