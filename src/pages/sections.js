import { supabase } from '../lib/supabase.js'
import { LEVELS, MAX_LEVEL, levelLabel } from '../lib/levels.js'
import { esc, $ } from '../app.js'

export async function render(el) {
  const [{ data: sections }, { data: students }, { data: lessons }] = await Promise.all([
    supabase.from('sections').select('*').order('name'),
    supabase.from('students').select('*').order('name'),
    supabase.from('lessons').select('id, level').order('created_at', { ascending: false }),
  ])
  const newest = lv => lessons.find(l => l.level === lv)
  const levelOpts = cur => Array.from({ length: MAX_LEVEL }, (_, i) => i + 1)
    .map(n => `<option value="${n}" ${n === cur ? 'selected' : ''}>${n < MAX_LEVEL ? `${n} · ${LEVELS[n]}` : 'Finished'}</option>`).join('')

  el.innerHTML = `<h1>Classes</h1>
    <form id="addSec" class="row"><input required name="name" placeholder="New section, e.g. Grade 1 – Sampaguita" aria-label="Section name"><button class="primary">Add section</button></form>
    ${sections.map(s => `<section data-sec="${s.id}">
      <div class="row"><h2 style="margin:16px 0 0">${esc(s.name)}</h2>
        <button data-rename>Rename</button><button data-delsec>Delete</button></div>
      <table><thead><tr><th>Student</th><th>Level</th><th></th></tr></thead><tbody>
      ${students.filter(st => st.section_id === s.id).map(st => {
        const l = st.level < MAX_LEVEL && newest(st.level)
        return `<tr data-stu="${st.id}"><td>${esc(st.name)}</td>
          <td><select data-level aria-label="Level of ${esc(st.name)}">${levelOpts(st.level)}</select> <span class="muted">${esc(levelLabel(st.level))}</span></td>
          <td>${l ? `<a href="#/assess/${st.id}/${l.id}"><button class="primary">Read</button></a>`
                 : `<button disabled>${st.level < MAX_LEVEL ? 'No lesson for this level yet' : 'Finished'}</button>`}
            <button data-delstu aria-label="Remove ${esc(st.name)}">✕</button></td></tr>`
      }).join('')}
      </tbody></table>
      <form data-addstu class="row"><input required name="name" placeholder="Student name" aria-label="Student name"><button>Add student</button></form>
    </section>`).join('') || '<p class="muted">No sections yet.</p>'}`

  const reload = () => render(el)
  const run = async q => { const { error } = await q; if (error) alert(error.message); reload() }
  $('#addSec', el).onsubmit = e => { e.preventDefault(); run(supabase.from('sections').insert({ name: e.target.name.value.trim() })) }
  el.querySelectorAll('section[data-sec]').forEach(sec => {
    const id = sec.dataset.sec
    $('[data-rename]', sec).onclick = () => { const n = prompt('New name'); if (n?.trim()) run(supabase.from('sections').update({ name: n.trim() }).eq('id', id)) }
    $('[data-delsec]', sec).onclick = () => confirm('Delete this section and all its students?') && run(supabase.from('sections').delete().eq('id', id))
    $('[data-addstu]', sec).onsubmit = e => { e.preventDefault(); run(supabase.from('students').insert({ section_id: id, name: e.target.name.value.trim() })) }
  })
  el.querySelectorAll('tr[data-stu]').forEach(tr => {
    const id = tr.dataset.stu
    $('[data-level]', tr).onchange = e => run(supabase.from('students').update({ level: +e.target.value }).eq('id', id))
    $('[data-delstu]', tr).onclick = () => confirm('Remove this student?') && run(supabase.from('students').delete().eq('id', id))
  })
}
