# Basa

Reading practice for early-grade learners. Teachers manage classes, build leveled lessons (Words → Phrases → Sentences → Short Story) read aloud in English, Tagalog or Bisaya, and check each student's reading by microphone. Each word is marked ✓ or ✗, and students who pass move up a level.

Free stack, no build step: static HTML and ES modules, Supabase Free, and libraries loaded from a CDN. **Non-commercial use only** (Vercel Hobby terms; Meta MMS voice is CC-BY-NC 4.0).

## Setup

1. Create a free project at supabase.com. In the SQL editor, run every file in `supabase/migrations/` in order (`0001` to `0008`; `0005` also adds the built-in CVC lessons).
2. Under Authentication → URL Configuration, add your site URL (and `http://localhost:5173` for local work).
3. Create the administrator: Authentication → Users → **Add user** → **Create new user**. Enter the admin email and a strong password, and tick **Auto Confirm User**. The admin then logs in with email + password, and stays signed in on that device until they sign out. Teachers can create their own account on the sign-up form, or you can add them here the same way.
4. Put the project URL and anon key in `config.js`.
5. Run locally with `npm run dev` (Python static server), then open http://localhost:5173 in **Chrome or Edge**.
6. Deploy by importing the repo into Vercel (Hobby). No build command; the output directory is `.`

## Offline use (rural schools)

Basa installs as an app (Chrome menu → **Install Basa** / **Add to Home screen**) and keeps working without signal:

1. While online, sign in and tap **Get ready for offline** in Profile. It saves every class, student and lesson on the device and downloads the speech checker (~80 MB, once).
2. Offline, teachers can open those pages and run readings. Scores are saved on the device; the header shows how many are waiting.
3. When there is signal again, saved readings upload by themselves with their real date. Sign-out waits until they have uploaded.

Adding or editing classes, students and lessons still needs a connection.

## Bisaya voice (optional)

Browsers have no Bisaya voice, so Bisaya lessons use the Filipino voice until you add one. To add it:

```sh
pip install "optimum[onnxruntime]"
optimum-cli export onnx --model facebook/mms-tts-ceb mms-tts-ceb-onnx
# upload the folder to your Hugging Face account as <you>/mms-tts-ceb-onnx (public)
```

Then set `CEB_TTS_MODEL = '<you>/mms-tts-ceb-onnx'` in `config.js`. Audio is generated when a Bisaya lesson is saved.

## Bisaya mic test (do this first)

Open `spike/bisaya.html` in Chrome on the phone or laptop the class will use. Read 5 Bisaya sentences with **Listen ceb-PH** and 5 with **Listen fil-PH**. In `src/lib/levels.js`:

- set `CEB_LISTEN_LANG` to whichever scored better;
- if Bisaya accuracy is under 70%, add `PASS_SCORE_BY_LANG = { 'ceb-PH': 0.7 }`.

## Tests

```sh
npm test                                         # scoring, speech fallback, lesson splitting (node:test)
PGHOST=... PGPORT=... npm run test:db            # schema + level-up rule + RLS on a local Postgres
```

## Free-tier notes

- Supabase Free **pauses after 1 week of inactivity**. Restore it from the dashboard after school breaks.
- Limits: 500 MB database and 1 GB files. A Bisaya word clip is about 30 KB.
- Speech recognition needs internet and works in Chrome, Edge and Safari, but not Firefox.
