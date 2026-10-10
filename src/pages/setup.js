import { supabase } from '../lib/supabase.js'
import { GRADES, LEVELS } from '../lib/levels.js'
import { getPassing, savePassing } from '../lib/passing.js'
import { esc, $, ask } from '../app.js'

const pctVal = x => x == null ? '' : Math.round(x * 100)

// Grade level + section setup. Required and unique are enforced by the DB (migration 0002).
export async function render(el) {
  const [{ data: sections, error }, passing] = await Promise.all([
    supabase.from('sections').select('id, grade, section').is('archived_at', null).order('section'),
    getPassing(),
  ])
  if (error) { el.innerHTML = `<p class="bad">${esc(error.message)}</p>`; return }

  el.innerHTML = `<div class="row head"><h1>Setup</h1><a href="#/archive" style="margin-left:auto"><button>Archive</button></a></div>
    <div class="tabs" role="tablist">
      <button type="button" role="tab" id="t-sec" aria-controls="tab-sec" aria-selected="true">Level &amp; Section</button>
      <button type="button" role="tab" id="t-pass" aria-controls="tab-pass" aria-selected="false">Passing Average</button>
    </div>
    <div id="tab-sec" role="tabpanel" aria-labelledby="t-sec">
    <p class="muted">Add each grade level and section you teach. Every section becomes a class.</p>
    <form id="add" class="row" novalidate>
      <select name="grade" required aria-label="Grade level"><option value="">Grade level</option>${GRADES.map(g => `<option>${g}</option>`).join('')}</select>
      <input name="section" required placeholder="Section, e.g. Sampaguita" aria-label="Section name" autocomplete="off">
      <button class="primary">Add section</button>
    </form>
    <p id="msg" role="status" aria-live="polite"></p>
    ${GRADES.filter(g => sections.some(s => s.grade === g)).map(g => `<h2>${g}</h2>
      <table><tbody>${sections.filter(s => s.grade === g).map(s => `<tr data-id="${s.id}" data-grade="${esc(g)}">
        <td>${esc(s.section)}</td>
        <td style="text-align:right"><button data-rename>Rename</button> <button data-del>Delete</button></td></tr>`).join('')}
      </tbody></table>`).join('') || '<p class="muted">No sections yet.</p>'}
    ${sections.length ? '<div class="row" style="margin-top:24px"><a href="#/"><button class="primary">Next: add students →</button></a></div>' : ''}
    </div>
    <div id="tab-pass" role="tabpanel" aria-labelledby="t-pass" hidden>
    <p class="muted">The average a student needs to pass a reading. Leave a box empty to use the default (80%). A stage box beats the overall one.</p>
    <form id="pass" class="prof" novalidate>
      <div class="wide"><label for="p-overall">Overall average (%) <span class="muted">(used for every stage without its own)</span></label>
        <input id="p-overall" type="number" min="1" max="100" inputmode="numeric" placeholder="80 (default)" value="${pctVal(passing.overall)}"></div>
      <div class="wide"><b>Per stage</b> <span class="muted">(optional, e.g. Words 70%, Short Story 90%)</span></div>
      ${Object.entries(LEVELS).map(([n, name]) => `<div><label for="p-s${n}">Stage ${n} · ${name} (%)</label>
        <input id="p-s${n}" data-stage="${n}" type="number" min="1" max="100" inputmode="numeric" placeholder="default" value="${pctVal(passing.stage?.[n])}"></div>`).join('')}
      <div class="row wide"><button class="primary">Save passing average</button><span id="pmsg" role="status"></span></div>
    </form>
    </div>`

  for (const tab of el.querySelectorAll('[role=tab]')) tab.onclick = () => {
    for (const t of el.querySelectorAll('[role=tab]')) {
      t.setAttribute('aria-selected', t === tab)
      $('#' + t.getAttribute('aria-controls'), el).hidden = t !== tab
    }
  }
  const pmsg = $('#pmsg', el)
  $('#pass', el).onsubmit = async e => {
    e.preventDefault()
    const say = (t, k = '') => { pmsg.textContent = t; pmsg.className = k }
    const cfg = { stage: {} }
    for (const input of e.target.querySelectorAll('input')) {
      const raw = input.value.trim()
      if (!raw) continue // empty = use the default
      const v = Number(raw)
      if (!(v >= 1 && v <= 100)) { input.focus(); return say('Use a number from 1 to 100, or leave it empty.', 'bad') }
      if (input.id === 'p-overall') cfg.overall = v / 100
      else cfg.stage[input.dataset.stage] = v / 100
    }
    say('Saving…')
    const { error } = await savePassing(cfg)
    error ? say(error.message, 'bad') : say('Saved.', 'ok')
  }
  const msg = $('#msg', el)
  const fail = (text, input) => { msg.textContent = text; msg.className = 'bad'; if (input) { input.setAttribute('aria-invalid', 'true'); input.focus() } }
  const why = (e, grade, section) => e.code === '23505' ? `${grade} – ${section} already exists.` : e.message
  el.querySelectorAll('#add [name]').forEach(i => i.oninput = () => { i.removeAttribute('aria-invalid'); msg.textContent = '' })

  $('#add', el).onsubmit = async e => {
    e.preventDefault()
    const f = e.target, grade = f.grade.value, section = f.section.value.trim()
    if (!grade) return fail('Choose a grade level.', f.grade)
    if (!section) return fail('Enter a section name.', f.section)
    const { error } = await supabase.from('sections').insert({ grade, section })
    error ? fail(why(error, grade, section), f.section) : render(el)
  }
  el.querySelectorAll('tr[data-id]').forEach(tr => {
    const id = tr.dataset.id, grade = tr.dataset.grade
    // inline rename: the name cell becomes a text box; Enter saves, Escape cancels
    $('[data-rename]', tr).onclick = () => {
      const old = tr.cells[0].textContent
      tr.cells[1].innerHTML = ''
      tr.cells[0].innerHTML = `<form class="row" style="margin:0"><input value="${esc(old)}" aria-label="New section name" required>
        <button class="primary">Save</button><button type="button">Cancel</button></form>`
      const form = $('form', tr), input = $('input', form)
      input.focus(); input.select()
      $('[type=button]', form).onclick = () => render(el)
      input.onkeydown = e => e.key === 'Escape' && render(el)
      form.onsubmit = async e => {
        e.preventDefault()
        const section = input.value.trim()
        if (!section) return fail('Enter a section name.', input)
        if (section === old) return render(el)
        const { error } = await supabase.from('sections').update({ section }).eq('id', id)
        error ? fail(why(error, grade, section), input) : render(el)
      }
    }
    $('[data-del]', tr).onclick = async () => {
      const name = `${grade} – ${tr.cells[0].textContent}`
      if (!await ask(`Delete ${name}?`, 'Are you sure? The class and its students move to the Archive, where you can restore them.', 'Delete class')) return
      const at = new Date().toISOString()
      const { error } = await supabase.from('sections').update({ archived_at: at }).eq('id', id)
      if (error) return fail(error.message)
      await supabase.from('students').update({ archived_at: at }).eq('section_id', id).is('archived_at', null)
      render(el)
    }
  })
}
