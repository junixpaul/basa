import { supabase } from '../lib/supabase.js'
import { LEVELS, MAX_LEVEL, PASS_SCORE } from '../lib/levels.js'
import { esc, $ } from '../app.js'

const DAY = 864e5
const pct = x => `${Math.round(x * 100)}%`
const avg = xs => xs.reduce((a, b) => a + b, 0) / xs.length
const remembered = () => { try { return localStorage.getItem('dashClass') || '' } catch { return '' } }

// ponytail: loads all attempts from the last 30 days in one query; add a date-bucketed view when a teacher has many thousands.
export async function render(el) {
  const since = new Date(Date.now() - 30 * DAY).toISOString()
  const [{ data: sections }, { data: allStudents }, { data: allAttempts }] = await Promise.all([
    supabase.from('sections').select('id, name').order('name'),
    supabase.from('students').select('id, name, level, section_id').order('name'),
    supabase.from('attempts').select('student_id, score, passed, created_at').gte('created_at', since),
  ])
  const cls = sections.some(s => s.id === remembered()) ? remembered() : ''
  const students = allStudents.filter(s => !cls || s.section_id === cls)
  const ids = new Set(students.map(s => s.id))
  const attempts = allAttempts.filter(a => ids.has(a.student_id))
  const week = attempts.filter(a => Date.parse(a.created_at) > Date.now() - 7 * DAY)
  const className = Object.fromEntries(sections.map(s => [s.id, s.name]))

  // per-student stats over 30 days
  const stats = students.map(s => {
    const mine = attempts.filter(a => a.student_id === s.id)
    const last = mine.reduce((m, a) => Math.max(m, Date.parse(a.created_at)), 0)
    return { ...s, n: mine.length, avg: mine.length ? avg(mine.map(a => a.score)) : null, last }
  })
  const top = stats.filter(s => s.n).sort((a, b) => b.level - a.level || b.avg - a.avg).slice(0, 5)
  const help = stats.filter(s => s.level < MAX_LEVEL && (s.avg === null || s.avg < PASS_SCORE || s.last < Date.now() - 14 * DAY))
    .sort((a, b) => (a.avg ?? -1) - (b.avg ?? -1)).slice(0, 5)
  const perLevel = Array.from({ length: MAX_LEVEL }, (_, i) => students.filter(s => s.level === i + 1).length)
  const maxLevelCount = Math.max(1, ...perLevel)

  const tile = (label, value, note = '') => `<div class="tile"><span class="muted">${label}</span><b>${value}</b>${note ? `<span class="muted small">${note}</span>` : ''}</div>`
  const who = s => `<a href="#/students/${s.id}">${esc(s.name)}</a><span class="muted small"> · ${esc(className[s.section_id] ?? '')}</span>`

  el.innerHTML = `<h1>Dashboard</h1>
    <div class="row">
      <label for="dc">Class</label>
      <select id="dc"><option value="">All classes</option>${sections.map(s => `<option value="${s.id}" ${s.id === cls ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
    </div>

    <div class="tiles">
      ${tile('Students', students.length)}
      ${tile('Readings this week', week.length)}
      ${tile('Pass rate this week', week.length ? pct(week.filter(a => a.passed).length / week.length) : '—')}
      ${tile('Average score this week', week.length ? pct(avg(week.map(a => a.score))) : '—', `pass mark ${pct(PASS_SCORE)}`)}
    </div>

    <h2>Students per level</h2>
    <div class="bars" role="table" aria-label="Students per level">
      ${perLevel.map((n, i) => `<div class="bar-row" role="row">
        <span role="rowheader">${i + 1 < MAX_LEVEL ? `Level ${i + 1} · ${LEVELS[i + 1]}` : 'Finished'}</span>
        <span class="bar-track" title="${n} student${n === 1 ? '' : 's'}">${n ? `<span class="bar" style="width:${(n / maxLevelCount) * 100}%"></span>` : ''}</span>
        <b role="cell">${n}</b></div>`).join('')}
    </div>

    <div class="cols">
      <section><h2>Top students</h2><p class="muted small">Highest level, then best average score (last 30 days).</p>
        ${top.length ? `<table><thead><tr><th>Student</th><th>Level</th><th>Avg</th></tr></thead><tbody>
          ${top.map(s => `<tr><td>${who(s)}</td><td>${s.level < MAX_LEVEL ? s.level : 'Done'}</td><td>${pct(s.avg)}</td></tr>`).join('')}</tbody></table>`
          : '<p class="muted">No readings yet.</p>'}</section>
      <section><h2>Needs help</h2><p class="muted small">Below the pass mark, or no reading in 14 days.</p>
        ${help.length ? `<table><thead><tr><th>Student</th><th>Level</th><th>Avg</th></tr></thead><tbody>
          ${help.map(s => `<tr><td>${who(s)}</td><td>${s.level}</td><td>${s.avg === null ? '<span class="muted">no reading</span>' : pct(s.avg)}</td></tr>`).join('')}</tbody></table>`
          : '<p class="muted">Everyone is on track.</p>'}</section>
    </div>`

  $('#dc', el).onchange = e => { try { localStorage.setItem('dashClass', e.target.value) } catch {} render(el) }
}
