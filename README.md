# Rijal al-Fajr

Check in for Fajr at your mosque, keep your streak, win your mosque's podium, and compete with mosques around the world.

- **The app** is at `/`. It is a web app that works in any phone browser.
- **The about page** is at `/about/`. It explains the features.
- Native iPhone and Android apps are the next iteration. The web app is built so it can be wrapped for the stores.

## What it does

**Check-in**
- A QR code on the mosque's screen that changes every 30 seconds.
- A printed poster whose code only works while the phone is at the mosque.
- An attendance list for children and anyone without a phone: type a name to tick it, or add and mark a new name in one tap. Ticks made with no signal are kept on the phone and sent when it returns.
- Printed member cards a volunteer can scan, and a parent checking in their children on the same scan.
- Open only around Fajr: from shortly before the adhan until sunrise, worked out from the mosque's location, or from the Fajr and iqamah times the mosque enters itself.
- One check-in per person per Fajr, at any registered mosque.
- A mosque can excuse a member's day (illness, travel) so it does not break a streak. A member can also ask from the app, with a reason, and staff approve in one tap.

**Competition**
- A podium (1st, 2nd, 3rd) and leaderboard at each mosque, by week, month and all time, for everyone or by group.
- Challenges with dates and prizes set by the mosque admin. When one ends, winners are shown and certificates can be printed.
- A shared target for the whole mosque, with a reward and an optional sponsor.
- Classes, each with its own leaderboard and attendance list.
- Squads of up to 10 friends inside a mosque.
- Organisations that group several mosques under one leaderboard, with their own challenges and prizes.
- A world leaderboard of approved mosques, by total check-ins or by consistency, added up by city and by country, with worldwide seasons the owner starts.
- Weekly awards for the last finished week: most consistent, most improved and best newcomer, for the people at each mosque and for mosques across the world.
- Families (a parent and children on one account) ranked together by days per member, with a family of the month.
- A friendly match between two mosques for one week, scored by the share of each mosque's members at Fajr.
- A roll of honour at each mosque for everyone who reaches forty dawns in a row. The name stays.

**For each person**: streaks, a weekly goal, a calendar, ten badges, family members, a star chart for children, Fajr buddies with nudges, invitation links, a year in review, share cards, light and dark mode, hiding your name, deleting your account. Also: an "I'm awake" tap before Fajr that buddies and squad-mates see, milestones on the mosque's page that others can say Masha'Allah to, "my patterns" (the weekday you miss most, and whether you arrive earlier than last month), and a guide to adding the app to the home screen on iPhone and Android.

**Sharing**: a mosque's page opens from a link without an account (names shown as a first name and an initial; a mosque can turn this off), a leaderboard to embed on the mosque's website, and a weekly poster image.

**For mosque staff**: the mosque screen, attendance list, poster and cards to print, events after Fajr with a count of who is staying, a 14-day chart, CSV export, sponsor offers, admins and volunteers, practice mode. Also: "Who haven't we seen?" (regulars who have missed three dawns or more), requests to be excused, and adding many names at once by pasting from a spreadsheet or choosing a CSV file.

**Sponsors**: anyone can offer to sponsor, choose how (prizes, breakfast, funds, vouchers), and choose who may contact them: every mosque in their country, or one mosque. Only mosque and organisation admins see their contact details. A mosque can also keep a prize wish-list ("2 bicycles"): a sponsor offers an item, and once the admin confirms the gift their name is thanked on the mosque's page, its challenges and the mosque screen.

**For the owner**: approve mosques for the world leaderboard, suspend a mosque, start seasons, handle reports, remove sponsor offers.

## Languages

The app and the about page are in 15 languages: English, Arabic, Urdu, Persian, Turkish, Indonesian, Malay, Bengali, Hindi, French, Spanish, Portuguese, Russian, Chinese and Swahili. Arabic, Urdu and Persian are laid out right to left. The app starts in the phone's language; people change it on the welcome screen or in Me.

- The English text is the key: `t('Check in for Fajr')`, `tn(n, '{n} day', '{n} days')` for counts, `tx(...)` for a sentence with bold parts.
- Each language is one file in `src/locales/` (app) and one in `about/locales/` (about page).
- `npm run i18n` collects the app's text into `src/locales/en.json` and checks every translation for missing entries, placeholders and plural forms. After changing text on the about page, run `node scripts/about-keys.cjs` with the site running.
- To add a language: add it to `LANGS` in `src/lib/i18n.tsx` and `about/about.ts`, and add the two files.

The translations were written by AI and have not been checked by native speakers. The hadith on the Today screen is shown in English only until someone qualified has checked a translation.

## Run it

```bash
npm install
npm run seed     # optional: demo mosques and six weeks of check-ins
npm run dev      # app on http://localhost:5173, API on http://localhost:8787
```

With no `DATABASE_URL`, data is kept in an embedded Postgres under `.data/`, so there is nothing else to install.

The seed creates a demo account: `demo@rijalalfajr.app` / `fajr-demo-1`. To give it the owner console, start the server with `OWNER_EMAILS=demo@rijalalfajr.app`.

Check-in and the "I'm awake" button only open around Fajr. To see the demo as it looks at dawn at any hour, start the local server with a pretend time, a few minutes after Fajr at the demo mosque: `DEMO_NOW=2026-11-27T05:58:00Z npm start` (use today's date).

To try check-in outside Fajr hours, turn on **Practice mode** in the mosque's settings.

```bash
npm test         # API tests: check-in rules, QR expiry, location, leaderboards, challenges and the rest
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

Steps:

1. In Vercel, choose **Add New → Project** and import this repository. The build settings come from `vercel.json`.
2. In the project, open **Storage**, create a Postgres database (Neon) and connect it. That sets `DATABASE_URL`.
3. Under **Settings → Environment Variables**, add `OWNER_EMAILS` with your email.
4. Redeploy.

Without a database the site still opens, and the app says it is not connected yet. `/api/health` answers `{"ok":true}` once the database is reached; until then it says which build is running and whether a database address reached it.

## How it is put together

| Path | What is there |
| --- | --- |
| `server/app.ts` | Every API route |
| `server/fajr.ts` | Fajr time, the check-in window, distance |
| `server/security.ts` | Passwords, sessions, the signed QR codes |
| `server/board.ts` | Streaks, ranking, badges, milestones, weekly awards, attendance patterns |
| `server/db.ts` | The schema and the two database drivers |
| `src/pages/` | One file per screen (`Social.tsx` and `Staff.tsx` hold the community and staff features) |
| `src/ui.tsx` | Shared pieces: session, podium, QR display, camera scanner |
| `src/lib/i18n.tsx` | The language list and the translation functions |
| `src/locales/`, `about/locales/` | One file per language |
| `src/lib/offline.ts` | Attendance ticks kept on the phone when there is no signal |
| `public/sw.js` | Keeps the app shell on the phone so it opens offline |
| `about/` | The about page |
| `tests/` | API tests |

Ranking is by days attended, then longest streak, then earliest average arrival.

## Before a public launch

- Add rate limiting to sign-up and sign-in.
- Add password reset by email (needs an email service and a domain).
- Have the privacy and rules pages checked for your country.

## Next

Native apps for the App Store and Google Play, Fajr reminder notifications (nudges are in-app only for now), a review of the translations by native speakers, sign in with Google or Apple, a map of mosques.
