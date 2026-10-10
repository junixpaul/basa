import { supabase } from '../lib/supabase.js'
import { MAX_LEVEL, familyNames, familyLabel, studentLabel, lessonFor } from '../lib/levels.js'
import { esc, $ } from '../app.js'

// Every student across all classes, filtered in the browser.
// ponytail: loads all rows at once; page it when a teacher has thousands of students.
export async function render(el) {
  const [{ data: students, error }, { data: sections }, { data: lessons }] = await Promise.all([
    supabase.from('students').select('id, name, level, family_no, section_id').is('archived_at', null).order('name'),
    supabase.from('sections').select('id, name').is('archived_at', null).order('name'),
    supabase.from('lessons').select('id, level, family, family_no').is('archived_at', null).order('created_at', { ascending: false }),
  ])
  if (error) { el.innerHTML = `<p class="bad">${esc(error.message)}</p>`; return }
  const className = Object.fromEntries(sections.map(s => [s.id, s.name]))
  const fams = familyNames(lessons)

  el.innerHTML = `<h1>Student List</h1>
    <div class="row">
      <input id="q" type="search" placeholder="Search name" aria-label="Search students" style="flex:1;min-width:180px">
      <select id="fc" aria-label="Filter by class"><option value="">All classes</option>${sections.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>
      <select id="fl" aria-label="Filter by level"><option value="">All levels</option>${Object.keys(fams).map(Number).sort((a, b) => a - b)
        .map(n => `<option value="${n}">${familyLabel(n, fams)}</option>`).join('')}<option value="done">All levels done</option></select>
    </div>
    <p class="muted" id="count" role="status"></p>
    <table><thead><tr><th>Student</th><th>Class</th><th>Level</th><th></th></tr></thead><tbody id="list"></tbody></table>
    <div class="row"><span class="muted">To add, move or change students:</span><a href="#/"><button class="primary">Go to Classes</button></a></div>`

  const draw = () => {
    const q = $('#q', el).value.trim().toLowerCase(), fc = $('#fc', el).value, fl = $('#fl', el).value
    const inLevel = s => !fl || (fl === 'done' ? s.level >= MAX_LEVEL : s.level < MAX_LEVEL && s.family_no === +fl)
    const shown = students.filter(s => (!q || s.name.toLowerCase().includes(q)) && (!fc || s.section_id === fc) && inLevel(s))
    $('#count', el).textContent = shown.length === students.length ? `Total students: ${students.length}` : `Showing ${shown.length} of ${students.length} students`
    $('#list', el).innerHTML = shown.map(s => {
      const l = lessonFor(lessons, s)
      return `<tr data-href="#/students/${s.id}"><td class="name"><a href="#/students/${s.id}">${esc(s.name)}</a></td><td>${esc(className[s.section_id] || '')}</td><td>${esc(studentLabel(s, fams))}</td>
        <td style="text-align:right">${l ? `<a href="#/assess/${s.id}/${l.id}"><button class="primary">Read</button></a>` : ''}</td></tr>`
    }).join('') || `<tr><td colspan="4" class="muted">${students.length ? 'No students match.' : 'No students yet.'}</td></tr>`
  }
  ;['q', 'fc', 'fl'].forEach(id => $('#' + id, el).oninput = draw)
  draw()
}
