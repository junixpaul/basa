import { supabase } from '../lib/supabase.js'
import { listen, localSpeechReady, recordAndTranscribe } from '../lib/speech.js'
import { scoreReading } from '../lib/score.js'
import { passScore, levelLabel } from '../lib/levels.js'
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
    <div class="row"><button class="primary" id="go">🎤 Start reading</button><button id="stop" hidden>■ Stop</button><span id="msg" role="status"></span></div>`
  const go = $('#go', el), stop = $('#stop', el), msg = $('#msg', el)
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
    go.hidden = true; stop.hidden = false; msg.textContent = 'Listening… read the words out loud.'
    let heard
    const maxMs = lesson.level === 4 ? 180000 : 60000
    try {
      try {
        heard = await listen(lesson.language, maxMs, ctl.signal, false, live)
      } catch (e) {
        // Google's speech service blocked (work network, VPN, firewall) → try Chrome's on-device recognition
        if (e.message !== 'network') throw e
        msg.textContent = 'Speech service blocked — switching to offline listening…'
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
    } finally { stop.hidden = true }
    if (!heard) { msg.textContent = ERRORS['no-speech']; go.hidden = false; return }

    const r = scoreReading(target, heard)
    const passed = r.score >= passScore(lesson.language)
    $('#text', el).innerHTML = r.words.map(w => mark({ text: w.text, cls: w.ok ? 'ok' : 'bad' })).join('')
    msg.textContent = `Score ${Math.round(r.score * 100)}% — saving…`
    const { data: level, error } = await supabase.rpc('record_attempt',
      { p_student: studentId, p_lesson: lessonId, p_score: r.score, p_passed: passed, p_result: { heard, words: r.words } })
    if (error) { msg.textContent = `Could not save: ${error.message}`; return }
    msg.innerHTML = `Score ${Math.round(r.score * 100)}%. ` + (level > student.level
      ? `<b class="ok">Pasado! ${esc(levelLabel(level))}</b>`
      : passed ? 'Passed.' : `<span>Keep practicing — ${Math.round(passScore(lesson.language) * 100)}% needed.</span> <button id="again">Try again</button>`)
    $('#again', el)?.addEventListener('click', () => render(el, [studentId, lessonId]))
  }
}
