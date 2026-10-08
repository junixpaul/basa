import { supabase } from '../lib/supabase.js'
import { esc, $, ask } from '../app.js'

const GRADES = ['Kinder', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6']

// Grade level + section setup. Required and unique are enforced by the DB (migration 0002).
export async function render(el) {
  const { data: sections, error } = await supabase.from('sections').select('id, grade, section').is('archived_at', null).order('section')
  if (error) { el.innerHTML = `<p class="bad">${esc(error.message)}</p>`; return }

  el.innerHTML = `<div class="row head"><h1>Setup</h1><a href="#/archive" style="margin-left:auto"><button>Archive</button></a></div>
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
    ${sections.length ? '<div class="row" style="margin-top:24px"><a href="#/"><button class="primary">Next: add students →</button></a></div>' : ''}`

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
