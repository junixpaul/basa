import { supabase } from '../lib/supabase.js'
import { LEVELS } from '../lib/levels.js'
import { speak } from '../lib/speech.js'
import { esc, $ } from '../app.js'

export async function render(el, [id]) {
  const [{ data: lesson }, { data: items }] = await Promise.all([
    supabase.from('lessons').select('*').eq('id', id).single(),
    supabase.from('lesson_items').select('*').eq('lesson_id', id).order('position'),
  ])
  if (!lesson) {
    el.innerHTML = `<h1>Lesson not found</h1><p class="muted">It may have been deleted, or it belongs to another account.</p>
      <div class="row"><a href="#/lessons"><button>All lessons</button></a> <a href="#/lessons/new"><button class="primary">+ New lesson</button></a></div>`
    return
  }
  const paths = items.flatMap(i => [i.image_path, i.audio_path]).filter(Boolean)
  const { data: signed } = paths.length ? await supabase.storage.from('lesson-images').createSignedUrls(paths, 3600) : { data: [] }
  const url = Object.fromEntries((signed ?? []).map(s => [s.path, s.signedUrl]))

  const where = (lesson.family_no ? `Level ${lesson.family_no} · CVC ${esc(lesson.family)} · ` : '') + `Stage ${lesson.level} · ${LEVELS[lesson.level]}`
  el.innerHTML = `<div class="row" style="margin-top:0"><a href="#/lessons"><button>← All lessons</button></a>
      <a href="#/lessons/new" style="margin-left:auto"><button>+ New lesson</button></a></div>
    <p class="muted">${where}</p><h1>${esc(lesson.title)}</h1>
    <div class="row"><button class="primary" id="all">▶ Read all</button>${lesson.teacher_id ? `<a href="#/lessons/${id}"><button>Edit</button></a>` : ''}</div>
    <p id="note" class="note" hidden></p>
    <div class="big${lesson.level < 4 ? ' stack' : ''}">${items.map((it, i) => `<button class="item${it.image_path ? '' : ' txt'}" data-i="${i}" style="border:0;background:none" aria-label="Hear: ${esc(it.text)}">
      ${it.image_path ? `<img src="${esc(url[it.image_path])}" alt="${esc(it.text)}">` : esc(it.text)}</button>`).join('')}</div>`

  let audio
  const say = it => new Promise(done => {
    audio?.pause(); speechSynthesis.cancel()
    if (it.audio_path && url[it.audio_path]) { audio = new Audio(url[it.audio_path]); audio.onended = done; audio.onerror = done; return audio.play().catch(done) }
    const { fallback, ended } = speak(it.text, lesson.language)
    if (fallback) { const n = $('#note', el); n.hidden = false; n.textContent = `No ${lesson.language} voice on this device; using the closest available voice.` }
    ended.then(done)
  })
  el.querySelectorAll('[data-i]').forEach(b => { b.onclick = () => say(items[+b.dataset.i]) })
  $('#all', el).onclick = async () => { for (const it of items) { if (!el.isConnected) break; await say(it); await new Promise(r => setTimeout(r, 400)) } }
}
