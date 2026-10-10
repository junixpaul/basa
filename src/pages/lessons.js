import { supabase } from '../lib/supabase.js'
import { LEVELS, familyNames, familyLabel, stageLabel } from '../lib/levels.js'
import { synthCeb } from '../lib/speech.js'
import { esc, $, ask } from '../app.js'

const LANGS = { 'en-US': 'English', 'fil-PH': 'Tagalog / Filipino', 'ceb-PH': 'Bisaya / Cebuano' }
let pending = null // draft handed over from the file drop (Task 7)
export const openDraft = draft => { pending = draft; location.hash = '#/lessons/new' }

export function render(el, [id]) { return id ? editor(el, id) : list(el) }

async function list(el) {
  const { data } = await supabase.from('lessons').select('*').is('archived_at', null).order('family_no', { nullsFirst: true }).order('level').order('created_at')
  const fams = familyNames(data), mine = data.filter(l => l.teacher_id)
  let show = ''
  try { show = sessionStorage.getItem('lessonFilter') ?? '' } catch {}
  // no saved choice: your own lessons first if you have any, else start teachers at built-in Level 1
  if (!show || (show === 'mine' && !mine.length)) show = mine.length ? 'all' : '1'
  el.innerHTML = `<div class="row head"><h1>Lessons</h1>
      <button id="newBtn" class="primary" aria-expanded="false" aria-controls="newPanel" style="margin-left:auto">+ New lesson</button></div>
    <div id="newPanel" class="addbox" hidden>
      <b>Make a new lesson</b>
      <div class="row" style="margin:0"><a href="#/lessons/new"><button>Type the words myself</button></a><span class="muted">or make it from a file:</span></div>
      <div id="drop"></div>
    </div>
    <div class="row"><label for="lf">Show</label><select id="lf">
      <option value="mine">My lessons (${mine.length})</option>
      ${Object.keys(fams).map(Number).sort((a, b) => a - b).map(n => `<option value="${n}">${esc(familyLabel(n, fams))}</option>`).join('')}
      <option value="all">All lessons</option></select></div>
    <div id="lrows"></div>`
  // one card per level, its stages in order: "Level 1 · -at" → Stage 1 · Words … Stage 4 · Short Story — title
  const name = l => !l.family_no ? esc(l.title) // own lesson: its title is the name
    : l.level === 4 ? `“${esc(l.title)}”` : ''
  const row = l => `<tr data-href="#/play/${l.id}"><td><b>${stageLabel(l.level)}</b>${name(l) ? `<br><span class="muted">${name(l)}</span>` : ''}</td>
      <td class="nowrap" style="text-align:right">${l.teacher_id ? `<a href="#/lessons/${l.id}"><button>Edit</button></a> ` : ''}<a href="#/play/${l.id}"><button class="primary">Open</button></a></td></tr>`
  const group = (title, ls) => `<section class="lvl"><h2>${title}</h2><table><tbody>${ls.map(row).join('')}</tbody></table></section>`
  const draw = () => {
    // "My lessons" with none of your own yet → show the built-in ones instead of nothing
    const fallback = show === 'mine' && !mine.length
    const rows = fallback ? data.filter(l => !l.teacher_id)
      : data.filter(l => show === 'all' || (show === 'mine' ? l.teacher_id : l.family_no === +show))
    const own = rows.filter(l => !l.family_no), byLevel = {}
    for (const l of rows.filter(l => l.family_no)) (byLevel[l.family_no] ??= []).push(l)
    $('#lrows', el).innerHTML = (fallback ? `<p class="muted">You haven't made any lessons yet. Here are the lessons that come with Basa, ready to use.</p>` : '')
      + (own.length ? group('My lessons <span class="muted small">· any level</span>', own) : '')
      + Object.keys(byLevel).map(Number).sort((a, b) => a - b).map(n => group(esc(familyLabel(n, fams)), byLevel[n])).join('')
      || `<p class="muted">${show === 'mine' ? "You haven't made any lessons yet." : 'No lessons.'}</p>`
  }
  $('#lf', el).value = show
  $('#lf', el).onchange = e => { show = e.target.value; try { sessionStorage.setItem('lessonFilter', show) } catch {} draw() }
  draw()
  ;(await import('./drop.js')).mountDrop($('#drop', el), openDraft)
  const panel = $('#newPanel', el), btn = $('#newBtn', el)
  const open = on => { panel.hidden = !on; btn.textContent = on ? '✕ Close' : '+ New lesson'; btn.setAttribute('aria-expanded', on) }
  btn.onclick = () => open(panel.hidden)
  if (!mine.length && show === 'mine') open(true) // no own lessons yet: show how to make one
}

async function editor(el, id) {
  let lesson = { title: '', level: 1, language: 'fil-PH' }, items = []
  if (id === 'new' && pending) { ({ items, ...lesson } = pending); pending = null }
  else if (id !== 'new') {
    const [{ data: l }, { data: its }] = await Promise.all([
      supabase.from('lessons').select('*').eq('id', id).single(),
      supabase.from('lesson_items').select('*').eq('lesson_id', id).order('position'),
    ])
    lesson = l; items = its
    if (l && !l.teacher_id) { // built-in lessons are shared by every teacher, so they are read-only
      el.innerHTML = `<div class="row" style="margin-top:0"><a href="#/lessons"><button>← All lessons</button></a></div>
        <h1>Basa lesson</h1><p class="muted">"${esc(l.title)}" comes with Basa and can't be edited. Make your own with <b>+ New lesson</b>.</p>
        <div class="row"><a href="#/play/${l.id}"><button class="primary">Open lesson</button></a></div>`
      return
    }
  }
  const texts = items.filter(i => !i.image_path && !i.image).map(i => i.text).join('\n')
  const pics = items.filter(i => i.image_path || i.image)
  const other = !(lesson.language in LANGS)

  el.innerHTML = `<div class="row" style="margin-top:0"><a href="#/lessons"><button>← All lessons</button></a></div>
    <h1>${id === 'new' ? 'New lesson' : 'Edit lesson'}</h1>
    <form id="f">
      <div class="row"><label style="flex:1">Title<br><input name="title" required value="${esc(lesson.title)}" placeholder="e.g. Animal words" style="width:100%"></label></div>
      <div class="row"><label>Stage <select name="level">${Object.keys(LEVELS).map(n =>
        `<option value="${n}" ${+n === lesson.level ? 'selected' : ''}>${stageLabel(+n)}</option>`).join('')}</select></label>
        <label>Language <select name="lang">${Object.entries(LANGS).map(([c, t]) =>
          `<option value="${c}" ${c === lesson.language ? 'selected' : ''}>${t}</option>`).join('')}
          <option value="other" ${other ? 'selected' : ''}>Other…</option></select></label>
        <input name="langOther" placeholder="Language code, e.g. ilo-PH" value="${other ? esc(lesson.language) : ''}" ${other ? '' : 'hidden'} aria-label="Other language code"></div>
      <label>Words / phrases / sentences — one per line<br><textarea name="items" rows="8" style="width:100%">${esc(texts)}</textarea></label>
      <h3>Pictures <span class="muted">(tap in the lesson to hear the label)</span></h3>
      <div id="pics"></div>
      <div class="row"><button type="button" id="addPic">Add picture</button></div>
      <div class="row"><button class="primary">Save lesson</button>${id !== 'new' ? '<button type="button" id="del">Delete lesson</button>' : ''}<span id="msg" class="muted"></span></div>
    </form>`

  const f = $('#f', el), picsEl = $('#pics', el)
  f.lang.onchange = () => { f.langOther.hidden = f.lang.value !== 'other' }
  const addPic = (p = {}) => {
    const row = document.createElement('div'); row.className = 'row'; row.pic = p
    row.innerHTML = `${p.image_path ? '<span class="muted">saved picture</span>' : '<input type="file" accept="image/*" aria-label="Picture">'}
      <input placeholder="What is this? e.g. aso" value="${esc(p.text ?? '')}" aria-label="Picture label" required><button type="button">✕</button>`
    if (p.image) row.querySelector('input[type=file]')?.replaceWith(Object.assign(document.createElement('span'), { className: 'muted', textContent: p.image.name }))
    row.querySelector('button').onclick = () => row.remove()
    picsEl.append(row)
  }
  pics.forEach(addPic)
  $('#addPic', el).onclick = () => addPic()
  $('#del', el)?.addEventListener('click', async () => {
    if (!await ask('Delete this lesson?', 'Are you sure? It moves to the Archive, where you can restore it.', 'Delete lesson')) return
    await supabase.from('lessons').update({ archived_at: new Date().toISOString() }).eq('id', id); location.hash = '#/lessons'
  })

  f.onsubmit = async e => {
    e.preventDefault()
    const msg = $('#msg', el), btn = f.querySelector('button.primary')
    const draft = {
      id: id === 'new' ? undefined : id,
      title: f.title.value.trim(), level: +f.level.value,
      language: f.lang.value === 'other' ? f.langOther.value.trim() || 'en-US' : f.lang.value,
      items: [
        ...f.items.value.split('\n').map(t => t.trim()).filter(Boolean).map(text => ({ text })),
        ...[...picsEl.children].map(r => ({ ...r.pic, text: r.querySelector('input:not([type=file])').value.trim(), image: r.pic.image ?? r.querySelector('input[type=file]')?.files[0] }))
          .filter(p => p.text && (p.image || p.image_path)),
      ],
    }
    if (!draft.items.length) return (msg.textContent = 'Add at least one word, sentence or picture.')
    btn.disabled = true
    try {
      const newId = await saveLesson(draft, (n, N) => (msg.textContent = `Preparing Bisaya audio ${n}/${N}`))
      location.hash = `#/play/${newId}`
    } catch (err) { msg.textContent = err.message; btn.disabled = false }
  }
}

// Saves a lesson and its items (replacing old items). Returns the lesson id.
export async function saveLesson({ id, title, level, language, items }, onProgress = () => {}) {
  const { data: { user } } = await supabase.auth.getUser()
  const ok = ({ data, error }) => { if (error) throw error; return data }
  const row = { title, level, language }
  const lesson = ok(id ? await supabase.from('lessons').update(row).eq('id', id).select().single()
                       : await supabase.from('lessons').insert(row).select().single())
  const rows = []
  for (const [position, it] of items.entries()) {
    let image_path = it.image_path ?? null
    if (it.image) {
      if (it.image.size > 10e6) throw new Error(`${it.image.name} is over 10 MB`)
      image_path = `${user.id}/${crypto.randomUUID()}-${it.image.name.replace(/[^\w.-]/g, '_')}`
      ok(await supabase.storage.from('lesson-images').upload(image_path, it.image))
    }
    rows.push({ lesson_id: lesson.id, position, text: it.text, image_path })
  }
  const saved = ok(await supabase.from('lesson_items').insert(rows).select())
  // Old items are removed only after the new ones are safely in, so a failed save never empties a lesson.
  // ponytail: old audio files stay in Storage (clean up if the 1 GB free limit gets close)
  if (id) ok(await supabase.from('lesson_items').delete().eq('lesson_id', id).not('id', 'in', `(${saved.map(i => i.id).join(',')})`))
  if (language === 'ceb-PH') {
    for (const [n, it] of saved.entries()) {
      onProgress(n + 1, saved.length)
      const blob = await synthCeb(it.text)
      if (!blob) break // no Bisaya model configured: player falls back to the Filipino voice
      const audio_path = `${user.id}/audio/${it.id}.wav`
      ok(await supabase.storage.from('lesson-images').upload(audio_path, blob, { upsert: true }))
      ok(await supabase.from('lesson_items').update({ audio_path }).eq('id', it.id))
    }
  }
  return lesson.id
}
