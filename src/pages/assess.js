import { supabase } from '../lib/supabase.js'
import { listen } from '../lib/speech.js'
import { scoreReading } from '../lib/score.js'
import { passScore, levelLabel } from '../lib/levels.js'
import { esc, $ } from '../app.js'

const ERRORS = {
  unsupported: 'Reading check needs Chrome, Edge or Safari.',
  denied: 'Please allow the microphone, then try again.',
  'no-speech': "I didn't hear anything — try again.",
  network: 'Reading check needs an internet connection.',
}

export async function render(el, [studentId, lessonId]) {
  const [{ data: student }, { data: lesson }, { data: items }] = await Promise.all([
    supabase.from('students').select('*').eq('id', studentId).single(),
    supabase.from('lessons').select('*').eq('id', lessonId).single(),
    supabase.from('lesson_items').select('text').eq('lesson_id', lessonId).is('image_path', null).order('position'),
  ])
  const target = items.map(i => i.text).join(' ')
  el.innerHTML = `<p class="muted">${esc(student.name)} · ${esc(levelLabel(student.level))}</p><h1>${esc(lesson.title)}</h1>
    <p class="big" id="text">${esc(target)}</p>
    <div class="row"><button class="primary" id="go">🎤 Start reading</button><button id="stop" hidden>■ Stop</button><span id="msg" role="status"></span></div>
    <p><a href="#/">Back to classes</a></p>`
  const go = $('#go', el), stop = $('#stop', el), msg = $('#msg', el)

  go.onclick = async () => {
    const ctl = new AbortController()
    stop.onclick = () => ctl.abort()
    go.hidden = true; stop.hidden = false; msg.textContent = 'Listening… read the words out loud.'
    let heard
    try {
      heard = await listen(lesson.language, lesson.level === 4 ? 180000 : 60000, ctl.signal)
    } catch (e) {
      msg.textContent = ERRORS[e.message] ?? `Microphone problem: ${e.message}`
      go.hidden = false; stop.hidden = true; return
    } finally { stop.hidden = true }
    if (!heard) { msg.textContent = ERRORS['no-speech']; go.hidden = false; return }

    const r = scoreReading(target, heard)
    const passed = r.score >= passScore(lesson.language)
    $('#text', el).innerHTML = r.words.map(w =>
      `<span class="w ${w.ok ? 'ok' : 'bad'}">${esc(w.text)}<sup aria-label="${w.ok ? 'correct' : 'missed'}">${w.ok ? '✓' : '✗'}</sup></span>`).join('')
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
