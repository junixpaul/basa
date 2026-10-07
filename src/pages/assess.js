import { supabase } from '../lib/supabase.js'
import { listen, localSpeechReady, recordAndTranscribe, speak } from '../lib/speech.js'
import { saveAttempt } from '../lib/offline.js'
import { scoreReading } from '../lib/score.js'
import { passScore, levelLabel, MAX_LEVEL } from '../lib/levels.js'
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
  const [{ data: student }, { data: lesson }, { data: items }] = await Promise.all([
    supabase.from('students').select('*').eq('id', studentId).single(),
    supabase.from('lessons').select('*').eq('id', lessonId).single(),
    supabase.from('lesson_items').select('text').eq('lesson_id', lessonId).is('image_path', null).order('position'),
  ])
  const target = items.map(i => i.text).join(' ')
  el.innerHTML = `<div class="row" style="margin-top:0"><a href="#/"><button>← Back to classes</button></a></div>
    <p class="muted">${esc(student.name)} · ${esc(levelLabel(student.level))}</p><h1>${esc(lesson.title)}</h1>
    <p class="big" id="text">${esc(target)}</p>
    <div class="row"><button class="primary" id="go">🎤 Start reading</button><button id="hear">🔊 Read the words</button><button id="stop" hidden>■ Stop</button><span id="msg" role="status"></span></div>`
  const go = $('#go', el), stop = $('#stop', el), msg = $('#msg', el), hear = $('#hear', el)

  // Text-to-speech model reading; tap again to stop. Never runs while the mic listens.
  let speaking = false
  const hush = () => { speechSynthesis.cancel(); speaking = false; hear.textContent = '🔊 Read the words' }
  hear.onclick = () => {
    if (speaking) return hush()
    speaking = true; hear.textContent = '■ Stop voice'
    const { fallback, ended } = speak(target, lesson.language)
    if (fallback) msg.textContent = `No ${lesson.language} voice on this device; using the closest one.`
    ended.then(() => { if (speaking) hush() })
  }
  addEventListener('hashchange', () => speaking && hush(), { once: true }) // leaving the page stops the voice
  const mark = w => `<span class="w ${w.cls}">${esc(w.text)}${w.cls ? `<sup aria-label="${w.cls === 'ok' ? 'correct' : 'missed'}">${w.cls === 'ok' ? '✓' : '✗'}</sup>` : ''}</span>`

  // Live: heard words turn ✓; words the reader already passed without a match turn ✗; the rest wait.
  // Returns true once the last word is read, which stops listening.
  const live = heard => {
    const { words } = scoreReading(target, heard)
    const reached = words.findLastIndex(w => w.ok)
    $('#text', el).innerHTML = words.map((w, i) => mark({ text: w.text, cls: w.ok ? 'ok' : i < reached ? 'bad' : '' })).join('')
    return words.length > 0 && words.at(-1).ok
  }

  go.onclick = async () => {
    const ctl = new AbortController()
    stop.onclick = () => ctl.abort()
    hush(); hear.disabled = true // the computer's voice must not be scored as the child's reading
    go.hidden = true; stop.hidden = false; msg.textContent = 'Listening… read the words out loud.'
    let heard
    const maxMs = lesson.level === 4 ? 180000 : 60000
    try {
      try {
        if (!navigator.onLine) throw new Error('network') // no signal: go straight to on-device listening
        heard = await listen(lesson.language, maxMs, ctl.signal, false, live)
      } catch (e) {
        // Google's speech service unreachable (no signal, VPN, firewall) → try Chrome's on-device recognition
        if (e.message !== 'network') throw e
        msg.textContent = 'Switching to offline listening…'
        if (await localSpeechReady(lesson.language)) {
          msg.textContent = 'Listening (offline)… read the words out loud.'
          heard = await listen(lesson.language, maxMs, ctl.signal, true, live)
        } else {
          // no Chrome on-device model for this language → record, then transcribe in the browser
          stop.hidden = false
          heard = await recordAndTranscribe(lesson.language, maxMs, ctl.signal, t => { msg.textContent = t }, live)
        }
      }
    } catch (e) {
      msg.textContent = ERRORS[e.message] ?? `Microphone problem: ${e.message}`
      go.hidden = false; stop.hidden = true; return
    } finally { stop.hidden = true; hear.disabled = false }
    if (!heard) { msg.textContent = ERRORS['no-speech']; go.hidden = false; return }

    const r = scoreReading(target, heard)
    const passed = r.score >= passScore(lesson.language)
    $('#text', el).innerHTML = r.words.map(w => mark({ text: w.text, cls: w.ok ? 'ok' : 'bad' })).join('')
    msg.textContent = `Score ${Math.round(r.score * 100)}% — saving…`
    let saved
    try {
      saved = await saveAttempt({ p_student: studentId, p_lesson: lessonId, p_score: r.score, p_passed: passed, p_result: { heard, words: r.words } })
    } catch (error) { msg.textContent = `Could not save: ${error.message}`; return }
    const { level, queued } = saved
    msg.innerHTML = `Score ${Math.round(r.score * 100)}%. ` + (queued
      ? `${passed ? '<b class="ok">Passed!</b> ' : ''}Saved on this device — it uploads when there's signal.`
        + (passed ? '' : ` <button id="again">Try again</button>`)
      : level > student.level
      ? `<b class="ok">Pasado! ${esc(levelLabel(level))}</b>`
      : passed ? 'Passed.' : `<span>Keep practicing — ${Math.round(passScore(lesson.language) * 100)}% needed.</span> <button id="again">Try again</button>`)
    $('#again', el)?.addEventListener('click', () => render(el, [studentId, lessonId]))
    if (passed) msg.insertAdjacentHTML('beforeend', ' ' + await nextStep(student, lesson, queued ? null : level))
  }
}

// After a pass: link to the next lesson for this student. Moved up → newest lesson at the new level;
// same level → another lesson at that level. Offline (level unknown) assumes the usual one-level move-up.
async function nextStep(student, lesson, level) {
  const to = level ?? (lesson.level === student.level ? student.level + 1 : student.level)
  if (to >= MAX_LEVEL) return '<b class="ok">All levels finished!</b>'
  const { data: lessons } = await supabase.from('lessons').select('id, level').order('created_at', { ascending: false })
  const next = (lessons ?? []).find(l => l.level === to && l.id !== lesson.id)
  const label = to > student.level ? `Next level: ${levelLabel(to)} →` : 'Next lesson →'
  return next ? `<a href="#/assess/${student.id}/${next.id}"><button class="primary">${esc(label)}</button></a>`
    : `<span class="muted">No lesson for ${esc(levelLabel(to))} yet.</span>`
}
