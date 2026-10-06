import { supabase } from '../lib/supabase.js'
import { LEVELS, MAX_LEVEL, levelLabel } from '../lib/levels.js'
import { esc, $ } from '../app.js'

// Every student across all classes, filtered in the browser.
// ponytail: loads all rows at once; page it when a teacher has thousands of students.
export async function render(el) {
  const [{ data: students, error }, { data: sections }, { data: lessons }] = await Promise.all([
    supabase.from('students').select('id, name, level, section_id').order('name'),
    supabase.from('sections').select('id, name').order('name'),
    supabase.from('lessons').select('id, level').order('created_at', { ascending: false }),
  ])
  if (error) { el.innerHTML = `<p class="bad">${esc(error.message)}</p>`; return }
  const className = Object.fromEntries(sections.map(s => [s.id, s.name]))
  const newest = lv => lessons.find(l => l.level === lv)

  el.innerHTML = `<h1>Student List</h1>
    <div class="row">
      <input id="q" type="search" placeholder="Search name" aria-label="Search students" style="flex:1;min-width:180px">
      <select id="fc" aria-label="Filter by class"><option value="">All classes</option>${sections.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>
      <select id="fl" aria-label="Filter by level"><option value="">All levels</option>${Array.from({ length: MAX_LEVEL }, (_, i) => i + 1)
        .map(n => `<option value="${n}">${n < MAX_LEVEL ? `Level ${n} · ${LEVELS[n]}` : 'Finished'}</option>`).join('')}</select>
    </div>
    <p class="muted" id="count" role="status"></p>
    <table><thead><tr><th>Student</th><th>Class</th><th>Level</th><th></th></tr></thead><tbody id="list"></tbody></table>
    <p class="muted">Add, move or change students in <a href="#/">Classes</a>.</p>`

  const draw = () => {
    const q = $('#q', el).value.trim().toLowerCase(), fc = $('#fc', el).value, fl = +$('#fl', el).value
    const shown = students.filter(s => (!q || s.name.toLowerCase().includes(q)) && (!fc || s.section_id === fc) && (!fl || s.level === fl))
    $('#count', el).textContent = `${shown.length} of ${students.length} students`
    $('#list', el).innerHTML = shown.map(s => {
      const l = s.level < MAX_LEVEL && newest(s.level)
      return `<tr><td><a href="#/students/${s.id}">${esc(s.name)}</a></td><td>${esc(className[s.section_id] || '')}</td><td>${esc(levelLabel(s.level))}</td>
        <td style="text-align:right">${l ? `<a href="#/assess/${s.id}/${l.id}"><button class="primary">Read</button></a>` : ''}</td></tr>`
    }).join('') || `<tr><td colspan="4" class="muted">${students.length ? 'No students match.' : 'No students yet.'}</td></tr>`
  }
  ;['q', 'fc', 'fl'].forEach(id => $('#' + id, el).oninput = draw)
  draw()
}
