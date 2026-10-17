import { supabase } from '../lib/supabase.js'
import { listen, localSpeechReady, recordAndTranscribe, speak } from '../lib/speech.js'
import { saveAttempt } from '../lib/offline.js'
import { getPassing } from '../lib/passing.js'
import { scoreReading } from '../lib/score.js'
import { passFor, MAX_LEVEL, familyNames, familyLabel, studentLabel, lessonFor, nextAfterPass } from '../lib/levels.js'
import { esc, $ } from '../app.js'

const ERRORS = {
  unsupported: 'Reading check needs Chrome, Edge or Safari.',
  denied: 'Please allow the microphone, then try again.',
  'no-speech': "I didn't hear anything — try again.",
  // Chrome sends speech to Google; Brave/Arc/Chromium or a VPN/firewall that blocks it also reports "network"
  network: "Can't reach Google's speech service. Try another network (e.g. a phone hotspot) or turn off VPN.",
  model: "Couldn't download the offline speech model. This network may block Hugging Face — try a phone hotspot once; after that it works offline.",
}

export async function render(el, [studentId, lessonId]) {
  const [{ data: student }, { data: lesson }, { data: items }, { data: lessons }] = await Promise.all([
    supabase.from('students').select('*').eq('id', studentId).single(),
    supabase.from('lessons').select('*').eq('id', lessonId).single(),
    supabase.from('lesson_items').select('text').eq('lesson_id', lessonId).is('image_path', null).order('position'),
    supabase.from('lessons').select('id, level, family, family_no').is('archived_at', null).order('created_at', { ascending: false }),
  ])
  const fams = familyNames(lessons)
  const need = passFor(await getPassing(), lesson.level, lesson.language)
  const target = items.map(i => i.text).join(' ')
  // Stages 1-3 (Words, Phrases, Sentences): one item per line. Stage 4 (Short Story) stays a paragraph.
  const stacked = lesson.level < 4
  const lineEnds = new Set() // index of the last word of each item
  items.reduce((n, i) => (n += i.text.split(/\s+/).filter(Boolean).length, lineEnds.add(n - 1), n), 0)
  el.innerHTML = `<div class="row" style="margin-top:0"><a href="#/"><button>← Back to classes</button></a></div>
    <p class="muted">${esc(student.name)} · ${esc(studentLabel(student, fams))}</p><h1>${esc(lesson.title)}</h1>
    <section class="stage">
      <div class="stage-top"><p class="hint" id="hint"></p><button class="primary go" id="go">🎤 Start reading</button></div>
      <div class="meter" aria-hidden="true"><span id="bar"></span></div><p class="count" id="count"></p>
      <div class="result" id="result" hidden></div>
      <p class="big${stacked ? ' stack' : ''}" id="text"></p>
    </section>
    <div class="row controls"><span id="msg" role="status"></span><button id="hear">🔊 Read the words</button><button class="danger" id="stop" hidden><span class="rec" aria-hidden="true"></span>Stop</button><button id="finish" hidden>✓ Finish &amp; score</button></div>`
  const go = $('#go', el), stop = $('#stop', el), msg = $('#msg', el), hear = $('#hear', el), finish = $('#finish', el)
  const hint = $('#hint', el), result = $('#result', el), first = esc(student.name.split(/\s+/)[0])

  // Model reading like a teacher pointing: one word at a time, slowly, each word lit blue while it is said,
  // a short gap between words and a longer one after each line or sentence. Tap again to stop.
  // Never runs while the mic listens. `run` stops an old loop when Stop then Read are tapped quickly.
  let speaking = false, run = 0
  const hush = () => {
    speechSynthesis.cancel(); speaking = false; run++; hear.textContent = '🔊 Read the words'
    spans.forEach(s => s.classList.remove('say'))
  }
  const wait = ms => new Promise(r => setTimeout(r, ms))
  hear.onclick = async () => {
    if (speaking) return hush()
    speaking = true; hear.textContent = '■ Stop voice'
    const me = ++run
    for (const [i, s] of spans.entries()) {
      s.classList.add('say'); s.scrollIntoView({ block: 'nearest' })
      const { fallback, ended } = speak(all[i], lesson.language, 0.7) // calibration knob: voice speed
      if (fallback && !i) msg.textContent = `No ${lesson.language} voice on this device; using the closest one.`
      await ended
      s.classList.remove('say')
      if (me !== run) return
      await wait((stacked && lineEnds.has(i)) || /[.!?]$/.test(all[i]) ? 900 : 300) // calibration knob: pauses
      if (me !== run) return
    }
    hush()
  }
  // leaving the page stops the voice and the mic, and the half-read reading is not saved
  let ctl, left = false
  addEventListener('hashchange', () => { left = true; speaking && hush(); ctl?.abort() }, { once: true })
  // Words are drawn once; after that only their class changes, so just the newly read word plays its pop.
  // In stacked mode a line break follows the last word of each item.
  const all = target.split(/\s+/).filter(Boolean)
  $('#text', el).innerHTML = all.map((t, i) => `<span class="w">${esc(t)}</span>${stacked && lineEnds.has(i) ? '<br>' : ''}`).join('')
  const spans = [...el.querySelectorAll('#text .w')]
  const CHEERS = ['Yay!', 'Nice!', 'Great!', 'Wow!', 'Keep going!']
  let best = 0
  // cls per word: 'ok' read, 'bad' skipped, 'next' the yellow word to read now, '' waiting
  const show = cls => {
    cls.forEach((c, i) => { if (spans[i].dataset.c !== c) { spans[i].dataset.c = c; spans[i].className = `w ${c}` } })
    const done = cls.filter(c => c === 'ok').length, next = cls.indexOf('next')
    $('#bar', el).style.width = `${(done / all.length) * 100}%`
    $('#count', el).textContent = `⭐ ${done} of ${all.length} words`
    if (next >= 0) hint.innerHTML = `${done > best ? CHEERS[done % CHEERS.length] + ' ' : ''}Read the yellow word: <b>${esc(all[next])}</b>`
    best = Math.max(best, done)
  }
  show(all.map((_, i) => (i ? '' : 'next'))) // before starting, point at the first word
  if (all.length) hint.innerHTML = `Tap <b class="tap">Start reading</b>, then read the yellow word first: <b>${esc(all[0])}</b>`

  // Live: heard words turn ✓; words the reader already passed without a match turn ✗; the next word turns
  // yellow and is scrolled into view (long lists on phones); the rest wait.
  // Returns true once the last word is read, which stops listening.
  const live = heard => {
    const { words } = scoreReading(target, heard)
    const reached = words.findLastIndex(w => w.ok)
    show(words.map((w, i) => (w.ok ? 'ok' : i < reached ? 'bad' : i === reached + 1 ? 'next' : '')))
    $('#text .next', el)?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    return words.length > 0 && words.at(-1).ok
  }

  // tap a practice word to hear it
  result.onclick = e => { const b = e.target.closest('[data-say]'); if (b) speak(b.dataset.say, lesson.language) }

  // A long pause turns the mic off but keeps what was read; Continue adds to it, for a break of any length.
  // ponytail: kept in the page only, leaving the page drops a paused reading.
  let sofar = ''
  finish.onclick = () => { finish.hidden = go.hidden = true; score(sofar) }

  go.onclick = async () => {
    ctl = new AbortController()
    stop.onclick = () => ctl.abort()
    hush(); hear.disabled = true // the computer's voice must not be scored as the child's reading
    go.hidden = finish.hidden = true; stop.hidden = false; msg.textContent = 'Listening… read the words out loud.'
    let heard
    const live2 = t => live(`${sofar} ${t}`)
    const maxMs = lesson.level === 4 ? 300000 : 180000
    try {
      try {
        if (!navigator.onLine) throw new Error('network') // no signal: go straight to on-device listening
        heard = await listen(lesson.language, maxMs, ctl.signal, false, live2)
      } catch (e) {
        // Google's speech service unreachable (no signal, VPN, firewall) → try Chrome's on-device recognition
        if (e.message !== 'network') throw e
        msg.textContent = 'Switching to offline listening…'
        if (await localSpeechReady(lesson.language)) {
          msg.textContent = 'Listening (offline)… read the words out loud.'
          heard = await listen(lesson.language, maxMs, ctl.signal, true, live2)
        } else {
          // no Chrome on-device model for this language → record, then transcribe in the browser
          stop.hidden = false
          heard = await recordAndTranscribe(lesson.language, maxMs, ctl.signal, t => { msg.textContent = t }, live2)
        }
      }
    } catch (e) {
      msg.textContent = ERRORS[e.message] ?? `Microphone problem: ${e.message}`
      go.hidden = false; finish.hidden = !sofar; stop.hidden = true; return
    } finally { stop.hidden = true; hear.disabled = false }
    if (left) return
    heard = `${sofar} ${heard ?? ''}`.trim()
    if (!heard) { msg.textContent = ERRORS['no-speech']; go.hidden = false; return }
    // Stopped by a long pause or the time limit with words left: keep progress, mic off until Continue.
    if (!ctl.signal.aborted && !scoreReading(target, heard).words.at(-1)?.ok) {
      sofar = heard; go.textContent = '▶ Continue reading'; go.hidden = finish.hidden = false
      hint.innerHTML = 'Take a little break! Tap <b>Continue</b> when you are ready.'
      msg.textContent = 'Paused. Tap Continue when ready, or Finish to score.'; return
    }
    score(heard)
  }

  const score = async heard => {
    const r = scoreReading(target, heard)
    const passed = r.score >= need
    show(r.words.map(w => (w.ok ? 'ok' : 'bad')))
    // The child's result: stars, a cheer, and the missed words to practice (tap to hear)
    const missed = [...new Set(r.words.filter(w => !w.ok).map(w => w.text.replace(/[^\p{L}\p{N}'-]/gu, '')))].filter(Boolean)
    const stars = r.score >= 0.95 ? 3 : passed ? 2 : 1
    hint.parentElement.hidden = true
    result.hidden = false
    result.innerHTML = `<p class="stars" role="img" aria-label="${stars} of 3 stars">${'★'.repeat(stars)}<span>${'★'.repeat(3 - stars)}</span></p>
      <h2>${passed ? `Great reading, ${first}!` : `Good try, ${first}!`}</h2>
      ${missed.length ? `<p>Let's practice these words. Tap a word to hear it.</p>
        <div class="row practice">${missed.map(w => `<button data-say="${esc(w)}">🔊 ${esc(w)}</button>`).join('')}</div>`
        : '<p>You read every word!</p>'}
      ${passed ? `<div class="confetti" aria-hidden="true">${'🎉⭐🌟✨🎈'.repeat(3).match(/\p{Extended_Pictographic}/gu).map((c, i) => `<span style="left:${(i * 37) % 100}%;animation-delay:${(i % 5) * 0.15}s">${c}</span>`).join('')}</div>` : ''}`
    result.scrollIntoView({ block: 'nearest' })
    msg.textContent = `Score ${Math.round(r.score * 100)}% — saving…`
    let saved
    try {
      saved = await saveAttempt({ p_student: studentId, p_lesson: lessonId, p_score: r.score, p_passed: passed, p_result: { heard, words: r.words } })
    } catch (error) { msg.textContent = `Could not save: ${error.message}`; return }
    // after = the student's level/step after this reading (server says; offline we work it out the same way)
    const { queued } = saved
    const lastFamily = Math.max(1, ...Object.keys(fams).map(Number))
    const after = saved.after ?? nextAfterPass(student, lesson, lastFamily)
    const movedUp = after.family_no !== student.family_no || after.level !== student.level
    msg.innerHTML = `Score ${Math.round(r.score * 100)}%. ` + (queued
      ? `${passed ? '<b class="ok">Passed!</b> ' : ''}Saved on this device — it uploads when there's signal.`
        + (passed ? '' : ` <button id="again">Try again</button>`)
      : movedUp
      ? `<b class="ok">Pasado! ${esc(studentLabel(after, fams))}</b>`
      : passed ? 'Passed.' : `<span>Keep practicing — ${Math.round(need * 100)}% needed.</span> <button id="again">Try again</button>`)
    $('#again', el)?.addEventListener('click', () => render(el, [studentId, lessonId]))
    if (passed) msg.insertAdjacentHTML('beforeend', ' ' + nextStep(student, after, lessons, fams, lesson.id))
  }
}

// After a pass: link to the lesson the student is now on (next step, or the next family's Words);
// if they stayed where they were, another lesson at the same step.
function nextStep(before, after, lessons, fams, currentId) {
  if (after.level >= MAX_LEVEL) return '<b class="ok">All levels finished!</b>'
  const next = lessonFor(lessons, after, currentId)
  const label = after.family_no !== before.family_no ? `Next level: ${familyLabel(after.family_no, fams)} →`
    : after.level !== before.level ? 'Next step →' : 'Next lesson →'
  return next ? `<a href="#/assess/${before.id}/${next.id}"><button class="primary">${esc(label)}</button></a>`
    : `<span class="muted">No lesson for ${esc(studentLabel(after, fams))} yet.</span>`
}
