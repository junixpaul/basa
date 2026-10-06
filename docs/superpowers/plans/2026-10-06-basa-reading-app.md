# Basa Reading App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A web app where a teacher manages sections and students, builds leveled reading lessons (words → phrases → sentences → short story) that are read aloud in English or a PH language, and assesses each student's reading by microphone, with words marked green or red and students moved up a level when they pass.

**Architecture:** 100% free, everything runs in the browser. A React SPA talks to Supabase Free (Auth, Postgres + RLS, Storage); there is no server code. Browser Web Speech handles listening and en/fil read-aloud. Bisaya audio is generated in the browser with Meta MMS (Transformers.js) when a lesson is saved, then stored in Storage. PDF and image text is extracted with pdf.js and Tesseract.js, then split into a draft lesson by a pure function.

**Tech Stack:** Vite + React 18 + TS, React Router, Supabase JS v2, Vitest, Supabase CLI (pgTAP), `@huggingface/transformers` (`Xenova/mms-tts-ceb`), `pdfjs-dist`, `tesseract.js` (`eng+tgl+ceb`), Vercel Hobby.

**Licensing:** Non-commercial use only (Vercel Hobby terms, MMS CC-BY-NC 4.0). Selling the app requires swapping both.

**Spec:** None written. This plan is derived from the requirements in chat on 2026-10-06, restated below.

## Requirements (from chat)

1. **Class list:** sections, each containing students. Each student shows their **level** (their current learning stage), so the teacher sees which lesson they are on.
2. **Lessons:** added by the teacher. Levels progress as follows: **1 = words, 2 = phrases, 3 = sentences, 4 = short story**. Text is read aloud automatically in English, Tagalog, Bisaya, or another PH language.
3. **Images in lessons:** tapping an image speaks what it is.
4. **Reading assessment:** the student reads into the mic. Each word turns green if read correctly and red if missed or mispronounced. If the student meets the standard, they move to the next level and the class list updates.
5. **Lesson from file:** the teacher drops in a PDF or image and a lesson is created from it right away.

## Assumptions (defaults taken; correct any of these before execution)

- **One device, teacher-operated.** The teacher logs in, picks a student, and the student reads on that device. Students have no logins. Separate student logins can be added later without changing the schema.
- **Passing standard:** at least **80%** of words read correctly (`PASS_SCORE = 0.8`).
- **Promotion rule:** passing any lesson at the student's *current* level promotes them one level. Level 5 means all four levels are complete.
- **Mispronounced = not recognized.** The browser recognizer returns words, not pronunciation scores, so a mispronounced word shows up as a missing or different word and is marked red.
- **Target browser:** Chrome or Edge (desktop or Android). These are the only mainstream browsers with `SpeechRecognition` that supports `fil-PH`.

## Global Constraints

- Language codes (BCP-47) stored on each lesson: `en-US`, `fil-PH`, `ceb-PH`, plus any other code the teacher types.
- Levels: integers `1..4` for lessons; `1..5` for students (`5` = finished). Labels: `1 Words`, `2 Phrases`, `3 Sentences`, `4 Short Story`.
- `PASS_SCORE = 0.8`, defined once in `src/lib/levels.ts`.
- Every table has `teacher_id uuid not null default auth.uid()` (or reaches one through a parent), with RLS `teacher_id = auth.uid()`. No table is readable by other teachers.
- $0 running cost: no paid APIs and no server functions.
- Uploads are limited to 10 MB and must be `application/pdf`, `image/png`, `image/jpeg`, or `image/webp`.

## Review Focus

1. **A PH language with no browser voice or recognizer (Bisaya / `ceb-PH` on most devices):** read-aloud falls back to a `fil-PH` voice, then to the default voice, and the screen shows "No Bisaya voice on this device; using Filipino." It never stays silent. Pinned in Task 3 (`pickVoice` tests).
2. **Mic denied, or a browser without `SpeechRecognition` (Firefox, iOS Safari):** the assessment screen shows a clear message and nothing is saved. Pinned in Task 3 (`listen` rejects with `'unsupported'` / `'denied'`) and Task 6.
3. **Case, punctuation, and accents differ between the lesson text and what was heard** ("Niño!" vs "nino"): these still count as correct. Pinned in Task 2.
4. **Re-reading a lower-level lesson, or submitting the same result twice:** the student's level never goes down and is bumped at most once per level. Pinned in Task 1 (pgTAP).
5. **A blank or scanned PDF, or an image with no text:** the teacher sees "Couldn't find readable text"; no empty lesson is saved, and the draft stays editable before saving. A scanned PDF (no text layer) falls back to OCR on the rendered pages. Pinned in Task 7 (`splitDraft` tests).

---

## File Structure

```
supabase/migrations/0001_init.sql        schema, RLS, record_attempt()
supabase/tests/record_attempt.test.sql   pgTAP tests for promotion rule
spike/bisaya.html                        Task 0 throwaway test page
src/lib/supabase.ts                      client singleton
src/lib/levels.ts                        LEVELS, PASS_SCORE
src/lib/score.ts                         scoreReading()  (pure)
src/lib/speech.ts                        pickVoice(), speak(), listen(), synthCeb()
src/lib/extract.ts                       extractText(file) via pdf.js / tesseract.js
src/lib/lessonDraft.ts                   splitDraft()  (pure)
src/pages/Sections.tsx                   class list: sections + students + levels
src/pages/Lessons.tsx                    lesson list + editor + file drop
src/pages/LessonPlayer.tsx               read-aloud, tap-to-speak images
src/pages/Assess.tsx                     mic reading assessment
src/App.tsx, src/main.tsx                router + auth gate
tests/*.test.ts                          Vitest for the four src/lib modules
```

---

### Task 0: Bisaya spike (throwaway, 1 hour, decides Task 3)

**Files:** `spike/bisaya.html` (one file, not kept)

- [ ] **Step 1:** Build one page with a mic button that runs `webkitSpeechRecognition` with `lang` set to `ceb-PH`, then `fil-PH`, and prints the transcript. Add a button that runs `pipeline('text-to-speech','Xenova/mms-tts-ceb')` and plays "Maayong buntag".
- [ ] **Step 2:** On Chrome (Android + desktop), read 5 Bisaya sentences under each `lang`. Record word accuracy for each.
- [ ] **Step 3:** Write down the decisions:
  - (a) `CEB_LISTEN_LANG`: whichever of `ceb-PH`/`fil-PH` scored higher.
  - (b) If `Xenova/mms-tts-ceb` does not exist, convert `facebook/mms-tts-ceb` to ONNX (`optimum-cli export onnx`) and host it in Supabase Storage.
  - (c) If Bisaya accuracy is under 70%, tell the teacher and lower the Bisaya pass score using the `PASS_SCORE_BY_LANG` override in Task 1.

---

### Task 1: Project scaffold, schema, and promotion rule

**Files:**
- Create: `package.json` (via `npm create vite@latest . -- --template react-ts`), `supabase/` (via `supabase init`)
- Create: `supabase/migrations/0001_init.sql`
- Create: `src/lib/supabase.ts`, `src/lib/levels.ts`
- Test: `supabase/tests/record_attempt.test.sql`

**Interfaces:**
- Produces tables:
  - `sections(id uuid pk, teacher_id uuid, name text)`
  - `students(id uuid pk, teacher_id uuid, section_id uuid fk on delete cascade, name text, level int not null default 1 check (level between 1 and 5))`
  - `lessons(id uuid pk, teacher_id uuid, title text, level int check (level between 1 and 4), language text not null default 'en-US', created_at timestamptz)`
  - `lesson_items(id uuid pk, lesson_id uuid fk on delete cascade, position int, text text not null, image_path text null)`, where an item with `image_path` is an image whose `text` is spoken when tapped
  - `attempts(id uuid pk, teacher_id uuid, student_id uuid fk, lesson_id uuid fk, score real, passed bool, result jsonb, created_at timestamptz)`
  - Storage bucket `lesson-images` (private, RLS by teacher folder `${auth.uid()}/...`)
- Produces SQL function `record_attempt(p_student uuid, p_lesson uuid, p_score real, p_result jsonb) returns int`, which returns the student's new level.
- Produces `supabase` (client) from `src/lib/supabase.ts`.
- Produces `LEVELS: Record<1|2|3|4, string>`, `PASS_SCORE = 0.8`, `PASS_SCORE_BY_LANG: Record<string, number> = {}` (filled only if the Task 0 spike says so), and `MAX_LEVEL = 5` from `src/lib/levels.ts`. `record_attempt` takes `p_passed bool`, computed client-side as `score >= (PASS_SCORE_BY_LANG[lang] ?? PASS_SCORE)`, instead of a hard-coded 0.8. The pgTAP tests pass `p_passed` to match.
- Adds column `lesson_items.audio_path text null` (Bisaya clip in Storage).

- [ ] **Step 1: Scaffold.** Run `npm create vite@latest . -- --template react-ts && npm i @supabase/supabase-js react-router-dom && npm i -D vitest && npx supabase init`. Expected: `npm run build` succeeds.

- [ ] **Step 2: Write the failing pgTAP test** in `supabase/tests/record_attempt.test.sql`. Seed one teacher (set `request.jwt.claims` sub), one student at level 2, and lessons L1 (level 1), L2a and L2b (level 2), then assert:

```sql
select plan(5);
select is(record_attempt(:stu, :l2a, 0.79, '{}'), 2, 'below 0.8 does not promote');
select is(record_attempt(:stu, :l2a, 0.80, '{}'), 3, 'exactly 0.8 promotes');
select is(record_attempt(:stu, :l2b, 1.00, '{}'), 3, 'passing another level-2 lesson after promotion does not double-bump');
select is(record_attempt(:stu, :l1, 1.00, '{}'), 3, 'passing a lower level never changes level');
select is((select count(*)::int from attempts where student_id = :stu), 4, 'every attempt is recorded');
select * from finish();
```

- [ ] **Step 3: Run `npx supabase start && npx supabase test db`.** Expected: FAIL because `record_attempt` does not exist.

- [ ] **Step 4: Write `0001_init.sql`.** Include the tables above, RLS policies `using (teacher_id = auth.uid())` on `sections`, `students`, `lessons`, and `attempts`, a `lesson_items` policy that checks through `lessons`, and the bucket. `record_attempt` is `security invoker`, inserts the attempt with `passed = p_score >= 0.8`, then runs `update students set level = level + 1 where id = p_student and level = (select level from lessons where id = p_lesson) and p_score >= 0.8 and level < 5 returning level` (or selects the current level if no row was updated). The `level = lesson.level` guard is what makes items 4 and 3 hold.

- [ ] **Step 5: Run `npx supabase db reset && npx supabase test db`.** Expected: PASS, 5/5.

- [ ] **Step 6: Commit** `feat: schema, RLS and record_attempt promotion rule`.

---

### Task 2: Word-level reading score

**Files:**
- Create: `src/lib/score.ts`
- Test: `tests/score.test.ts`

**Interfaces:**
- Produces `scoreReading(target: string, heard: string): { words: { text: string; ok: boolean }[]; score: number }`. `words` keeps the target's original spelling in order. `score` is the number of correct words divided by the total, between 0 and 1; it is `0` for an empty target.

- [ ] **Step 1: Write the failing tests:**

```ts
import { scoreReading } from '../src/lib/score'
test('all correct', () => expect(scoreReading('The cat sat', 'the cat sat').score).toBe(1))
test('missing word is red', () => {
  const r = scoreReading('The cat sat', 'the sat')
  expect(r.words.map(w => w.ok)).toEqual([true, false, true])
  expect(r.score).toBeCloseTo(2 / 3)
})
test('wrong word is red, order respected', () =>
  expect(scoreReading('ang bata ay masaya', 'ang bata ay malungkot').words.map(w => w.ok)).toEqual([true, true, true, false]))
test('case, punctuation, accents ignored', () => expect(scoreReading('Niño, kumain ka!', 'nino kumain ka').score).toBe(1))
test('extra words heard do not add credit', () => expect(scoreReading('aso', 'aso aso pusa').score).toBe(1))
test('empty target scores 0, keeps no words', () => expect(scoreReading('', 'hello')).toEqual({ words: [], score: 0 }))
test('preserves original spelling for display', () => expect(scoreReading('Niño!', 'nino').words[0].text).toBe('Niño!'))
```

- [ ] **Step 2: Run `npx vitest run tests/score.test.ts`.** Expected: FAIL, module not found.

- [ ] **Step 3: Implement `scoreReading`.** Normalize with `s.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu,'')`, split on whitespace, then mark target words that fall in the longest common subsequence with the heard words. The LCS uses a standard O(n·m) DP table plus a backtrack. Add `// ponytail: O(n·m) LCS, fine up to short-story length (~300 words)`.

- [ ] **Step 4: Run `npx vitest run tests/score.test.ts`.** Expected: PASS, 7/7.

- [ ] **Step 5: Commit** `feat: word-level reading score`.

---

### Task 3: Speech (read-aloud and listen)

**Files:**
- Create: `src/lib/speech.ts`
- Test: `tests/speech.test.ts`

**Interfaces:**
- Produces `pickVoice(voices: { lang: string; name: string }[], lang: string): { voice: { lang: string; name: string } | null; fallback: boolean }`. Order of preference: an exact `lang` match, then the same base language (`ceb-*`), then `fil-*`/`tl-*`, then `null` (the browser default). `fallback` is true unless there is an exact or base-language match.
- Produces `speak(text: string, lang: string): { fallback: boolean }`, which uses `speechSynthesis` with `rate = 0.85` for young readers.
- Produces `listen(lang: string, maxMs = 30000): Promise<string>`. It rejects with `Error('unsupported')` when there is no `SpeechRecognition`/`webkitSpeechRecognition`, and with `Error('denied')` on a `not-allowed` error. It sets `continuous = true` and `interimResults = false`, and resolves with the joined transcript on `end`. For `ceb-PH` it listens with `CEB_LISTEN_LANG` from Task 0.
- Produces `synthCeb(text: string): Promise<Blob>` (WAV). It lazy-loads the MMS pipeline on first call only, so the ~30 MB model is downloaded once and cached by the browser. It is only called at lesson save (Task 5), never during playback.

- [ ] **Step 1: Write the failing tests:**

```ts
import { pickVoice, listen } from '../src/lib/speech'
const V = [{ lang: 'en-US', name: 'en' }, { lang: 'fil-PH', name: 'fil' }]
test('exact match', () => expect(pickVoice(V, 'en-US')).toEqual({ voice: V[0], fallback: false }))
test('Bisaya falls back to Filipino', () => expect(pickVoice(V, 'ceb-PH')).toEqual({ voice: V[1], fallback: true }))
test('nothing usable -> default voice, flagged', () => expect(pickVoice([V[0]], 'ceb-PH')).toEqual({ voice: null, fallback: true }))
test('listen rejects when browser lacks SpeechRecognition', async () =>
  await expect(listen('fil-PH')).rejects.toThrow('unsupported'))
```

- [ ] **Step 2: Run `npx vitest run tests/speech.test.ts`.** Expected: FAIL.
- [ ] **Step 3: Implement the three functions** in `src/lib/speech.ts`. `speak` and `listen` are thin wrappers that are only tested through `pickVoice`, the unsupported path, and the manual check in Task 6.
- [ ] **Step 4: Run `npx vitest run tests/speech.test.ts`.** Expected: PASS, 4/4.
- [ ] **Step 5: Commit** `feat: speech helpers with PH language fallback`.

---

### Task 4: Auth and class list (sections, students, levels)

**Files:**
- Create: `src/App.tsx` (router plus an auth gate using Supabase email magic link), `src/pages/Sections.tsx`
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes `supabase` and `LEVELS` (Task 1).
- Produces routes `/` (Sections), `/lessons`, `/lessons/:id`, and `/assess/:studentId/:lessonId`.
- Sections page: add and rename sections; add and remove students; each student row shows `Level N · <label>` (or "Finished" at 5) plus a **Read** button linking to `/assess/:studentId/:lessonId`, using the newest lesson at the student's level. The button is disabled with the text "No lesson for this level yet" when no such lesson exists. The teacher can also set a student's level by hand from a `<select>`.

- [ ] **Step 1: Build the page** using plain `<form>`/`<select>`/`<table>`. No UI library.
- [ ] **Step 2: Verify manually** against the local stack (`npm run dev`). Sign in, create section "Grade 1 – Sampaguita", and add 2 students. Expected: both show "Level 1 · Words". Sign in as a second email. Expected: the section is not visible (RLS).
- [ ] **Step 3: Commit** `feat: class list with student levels`.

---

### Task 5: Lesson editor and player

**Files:**
- Create: `src/pages/Lessons.tsx`, `src/pages/LessonPlayer.tsx`

**Interfaces:**
- Consumes `supabase`, `LEVELS`, and `speak()` (Task 3).
- The editor saves one `lessons` row plus ordered `lesson_items`. Inputs: title, level (`<select>` 1–4), language (`<select>` with en-US / fil-PH / ceb-PH / "Other…" free text), and items (one per line; image items get a file upload to `lesson-images/${uid}/${uuid}` plus a "what is this?" text field).
- Produces `saveLesson(draft: { title: string; level: 1|2|3|4; language: string; items: { text: string; image?: File }[] }): Promise<string>` (returns the lesson id). Task 7 uses this function.
- On save of a `ceb-PH` lesson, each item gets `synthCeb(text)`, the result is uploaded to `lesson-images/${uid}/audio/${itemId}.wav`, and `audio_path` is set. Show a "Preparing Bisaya audio n/N" progress counter.
- The player shows the items large and auto-reads each one on display. Tapping any text or image plays `audio_path` via `new Audio(signedUrl)` if present, else calls `speak(item.text, lesson.language)`. When `fallback` is true, it shows the notice from Review Focus item 1.

- [ ] **Step 1: Build the editor and player.**
- [ ] **Step 2: Verify manually.** Create "Mga Hayop" (Level 1, `fil-PH`) with items `aso`, `pusa`, and an image of a dog labeled "aso". Open the player. Expected: words are spoken, and tapping the image says "aso". Create "Mga Mananap" (`ceb-PH`) with `iro`, `iring`. Expected: the progress counter reaches 2/2, and the player plays the stored Bisaya audio on a device with no Bisaya voice installed.
- [ ] **Step 3: Commit** `feat: lesson editor and read-aloud player`.

---

### Task 6: Reading assessment

**Files:**
- Create: `src/pages/Assess.tsx`

**Interfaces:**
- Consumes `listen()`, `scoreReading()`, `PASS_SCORE`, and the RPC `record_attempt`.
- Flow: show the lesson text (all items joined) → **Start reading** → `listen(lesson.language)` → **Stop** → `scoreReading(target, heard)` → render each word in green (`#15803d`) or red (`#b91c1c`) along with an icon (✓/✗) so the result does not rely on color alone → show the score % → call `supabase.rpc('record_attempt', {...})` once → if the level went up, show "Pasado! Level N" and link back to the class list.
- Errors: `'unsupported'` → "Reading check needs Chrome or Edge." `'denied'` → "Please allow the microphone." An empty transcript → "I didn't hear anything — try again." Nothing is saved in any of these cases.

- [ ] **Step 1: Build the page.** Disable the Stop/Save button after the first RPC call to prevent double submits (backed by the Task 1 guard).
- [ ] **Step 2: Verify manually** in Chrome. Read "aso pusa" correctly. Expected: both green, 100%, the student moves to Level 2, and the class list shows "Level 2 · Phrases". Read only "aso". Expected: "pusa" is red, 50%, and the level is unchanged. Block the mic in site settings. Expected: the "allow the microphone" message appears and no attempt row is created. Open the page in Firefox. Expected: the "needs Chrome or Edge" message.
- [ ] **Step 3: Commit** `feat: mic reading assessment with level promotion`.

---

### Task 7: Create a lesson from a PDF or image (free, in-browser)

**Files:**
- Create: `src/lib/extract.ts`, `src/lib/lessonDraft.ts`
- Modify: `src/pages/Lessons.tsx` (drop zone)
- Test: `tests/lessonDraft.test.ts`

**Interfaces:**
- Produces `extractText(file: File, lang: string): Promise<string>`. For a PDF it uses `pdfjs-dist` `getTextContent()` per page. If the result is under 20 characters (a scanned PDF), it renders each page to a canvas and OCRs it. For an image it uses `tesseract.js` `recognize(file, 'eng+tgl+ceb')`. It rejects files over 10 MB or of a wrong type before reading them.
- Produces `splitDraft(text: string, level: 1|2|3|4, language: string, title: string): { ok: true; draft: { title: string; level: 1|2|3|4; language: string; items: { text: string }[] } } | { ok: false; error: string }`. The teacher picks the level before dropping the file; the split depends on it:
  - 1 (words): unique words in their first-seen order, letters only.
  - 2 (phrases): chunks of 2–4 words cut at commas, else every 3 words.
  - 3 (sentences): split on `.`, `!`, `?`.
  - 4 (story): paragraphs (blank-line separated); a text with no blank lines is one item.
  - In all cases items are trimmed, empty items are dropped, the list is capped at 200 items × 500 characters, and zero items returns `{ ok: false, error: "Couldn't find readable text" }`.
  - Add `// ponytail: rule-based split, add an AI step if teachers fix most drafts by hand`.
- The drop zone (`<input type="file" accept=".pdf,image/*">` plus drag events) runs `extractText`, then `splitDraft`, and opens the draft in the Task 5 editor. It saves through `saveLesson()`. A dropped image is also attached as the first image item, and the teacher types its label.

- [ ] **Step 1: Write the failing tests:**

```ts
import { splitDraft } from '../src/lib/lessonDraft'
const items = (t: string, l: 1|2|3|4) => { const r = splitDraft(t, l, 'fil-PH', 'x'); return r.ok ? r.draft.items.map(i => i.text) : r.error }
test('words: unique, ordered, no punctuation', () => expect(items('Aso, pusa. Aso!', 1)).toEqual(['Aso', 'pusa']))
test('phrases: cut at commas', () => expect(items('ang pulang bola, sa ilalim ng mesa', 2)).toEqual(['ang pulang bola', 'sa ilalim ng mesa']))
test('sentences', () => expect(items('Si Ana ay masaya. Kumain siya!', 3)).toEqual(['Si Ana ay masaya.', 'Kumain siya!']))
test('story: paragraphs', () => expect(items('Una.\n\nIkalawa.', 4)).toEqual(['Una.', 'Ikalawa.']))
test('blank text fails', () => expect(items('  \n ', 3)).toBe("Couldn't find readable text"))
```

- [ ] **Step 2: Run `npx vitest run tests/lessonDraft.test.ts`.** Expected: FAIL.
- [ ] **Step 3: Implement `splitDraft`, `extractText`, and the drop zone.** Lazy-load `pdfjs-dist` and `tesseract.js` with `import()` so they don't bloat the first page load.
- [ ] **Step 4: Run `npx vitest run`.** Expected: all suites pass.
- [ ] **Step 5: Verify manually.**
  - Drop a 1-page Filipino reading PDF at level 3. Expected: the editor opens with one item per sentence.
  - Drop a phone photo of a Bisaya page at level 1. Expected: a word list appears (some OCR typos are fine, since the teacher edits the draft).
  - Drop a blank PDF. Expected: "Couldn't find readable text".
  - Drop a 15 MB file. Expected: rejected before it is read.
- [ ] **Step 6: Commit** `feat: create lesson from PDF or image`.

---

### Task 8: Deploy (free)

**Files:**
- Create: `vercel.json` (SPA rewrite: all routes → `/index.html`)
- Modify: `README.md` (env vars `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; the free-tier notes below)

- [ ] **Step 1:** Create a Supabase Free project, then run `npx supabase db push`.
- [ ] **Step 2:** Create a Vercel Hobby project from the repo with the two `VITE_` env vars.
- [ ] **Step 3: Smoke test on an Android phone in Chrome:** run Task 6 Step 2 and Task 7 Step 5 against production. Expected: same results as local.
- [ ] **Step 4:** In the README, note that Supabase Free pauses after 1 week of inactivity (restore it from the dashboard after a school break) and has limits of 500 MB database and 1 GB files. Bisaya clips are about 30 KB each, so roughly 30,000 items fit.
- [ ] **Step 5: Commit** `chore: deploy config and README`.

---

**Skipped (add when needed):** student logins and per-student devices (add a `student_accounts` table when one device per student is needed), paid speech recognition for Bisaya (swap `listen()` for Google Chirp 2 if the Task 0 accuracy is too low; the interface stays the same), true pronunciation scoring (no service supports fil/ceb today), AI image labels and AI lesson splitting, teacher-recorded audio for languages without a voice, and reports/charts on attempts.
