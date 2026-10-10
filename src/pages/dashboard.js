import { supabase } from '../lib/supabase.js'
import { MAX_LEVEL, passFor, familyNames, familyLabel, stageLabel } from '../lib/levels.js'
import { esc, $ } from '../app.js'

const DAY = 864e5
const pct = x => `${Math.round(x * 100)}%`
const avg = xs => xs.reduce((a, b) => a + b, 0) / xs.length
const remembered = () => { try { return localStorage.getItem('dashClass') || '' } catch { return '' } }

// ponytail: loads every attempt and filters to 30 days here, so the query URL never changes and the
// offline copy always matches; add a server-side date view when a teacher has many thousands.
export async function render(el) {
  const since = Date.now() - 30 * DAY
  const [{ data: sections }, { data: allStudents }, { data: everyAttempt }, { data: lessons }, { data: auth }] = await Promise.all([
    supabase.from('sections').select('id, name').is('archived_at', null).order('name'),
    supabase.from('students').select('id, name, level, family_no, section_id').is('archived_at', null).order('name'),
    supabase.from('attempts').select('student_id, score, passed, created_at'),
    supabase.from('lessons').select('id, level, family, family_no').is('archived_at', null).order('created_at', { ascending: false }),
    supabase.auth.getSession(),
  ])
  const u = auth.session?.user, h = new Date().getHours()
  const name = u?.user_metadata?.name?.trim() || u?.email?.split('@')[0] || '' // offline: no session, so no name
  const PASS_SCORE = passFor(u?.user_metadata?.passing) // overall passing average from Setup, else the default
  const hello = `Good ${h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'}${name ? `, ${esc(name)}` : ''}!`
  const fams = familyNames(lessons)
  const progress = s => s.family_no * 10 + s.level // further family first, then further step
  const allAttempts = everyAttempt.filter(a => Date.parse(a.created_at) > since)
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
  const top = stats.filter(s => s.n && s.avg >= PASS_SCORE).sort((a, b) => progress(b) - progress(a) || b.avg - a.avg).slice(0, 5)
  const help = stats.filter(s => s.level < MAX_LEVEL && (s.avg === null || s.avg < PASS_SCORE || s.last < Date.now() - 14 * DAY))
    .sort((a, b) => (a.avg ?? -1) - (b.avg ?? -1)).slice(0, 5)
  // one bar per word family that has students (32 families would be too many bars), plus "All levels done"
  const perLevel = [...new Set(students.filter(s => s.level < MAX_LEVEL).map(s => s.family_no))].sort((a, b) => a - b)
    .map(no => [familyLabel(no, fams), students.filter(s => s.level < MAX_LEVEL && s.family_no === no).length])
  const done = students.filter(s => s.level >= MAX_LEVEL).length
  if (done) perLevel.push(['All levels done', done])
  const maxLevelCount = Math.max(1, ...perLevel.map(([, n]) => n))

  const tile = (label, value, note = '') => `<div class="tile"><span class="muted">${label}</span><b>${value}</b>${note ? `<span class="muted small">${note}</span>` : ''}</div>`
  // name over class, level over stage: two short lines instead of one long line that wraps mid-phrase
  const who = s => `<a href="#/students/${s.id}">${esc(s.name)}</a><br><span class="muted small nowrap">${esc(className[s.section_id] ?? '')}</span>`
  const keep = t => t.split(' · ').map(p => `<span class="nw">${esc(p)}</span>`).join(' · ') // wrap only between parts, never inside "CVC -at"
  const lvl = s => s.level >= MAX_LEVEL ? '<b>All levels done</b>' : `<b>${keep(familyLabel(s.family_no, fams))}</b><br><span class="muted">${keep(stageLabel(s.level))}</span>`

  el.innerHTML = `<h1>${hello}</h1>
    <p class="muted" style="margin-top:-8px">${sections.length ? "Welcome back. Here is how your classes are doing." : 'Welcome to Basa. Start by adding your class in <b>Setup</b>.'}</p>
    <div class="row head" style="margin-top:28px">
      <h2>Class overview</h2>
      <span class="row" style="margin:0 0 0 auto"><label for="dc">Class</label>
        <select id="dc"><option value="">All classes</option>${sections.map(s => `<option value="${s.id}" ${s.id === cls ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></span>
    </div>

    <div class="tiles">
      ${tile('Students', students.length)}
      ${tile('Readings this week', week.length)}
      ${tile('Pass rate this week', week.length ? pct(week.filter(a => a.passed).length / week.length) : '—')}
      ${tile('Average score this week', week.length ? pct(avg(week.map(a => a.score))) : '—', `pass mark ${pct(PASS_SCORE)}`)}
    </div>

    <div class="cols">
      <section><h2>Needs help</h2><p class="muted small">Below the pass mark, or no reading in 14 days.</p>
        ${help.length ? `<table><thead><tr><th>Student</th><th>Level</th><th>Avg</th></tr></thead><tbody>
          ${help.map(s => `<tr data-href="#/students/${s.id}"><td>${who(s)}</td><td>${lvl(s)}</td><td>${s.avg === null ? '<span class="muted">no reading</span>' : pct(s.avg)}</td></tr>`).join('')}</tbody></table>`
          : '<p class="muted">Everyone is on track.</p>'}</section>
      <section><h2>Top students</h2><p class="muted small">At or above the pass mark: highest level first (last 30 days).</p>
        ${top.length ? `<table><thead><tr><th>Student</th><th>Level</th><th>Avg</th></tr></thead><tbody>
          ${top.map(s => `<tr data-href="#/students/${s.id}"><td>${who(s)}</td><td>${lvl(s)}</td><td>${pct(s.avg)}</td></tr>`).join('')}</tbody></table>`
          : '<p class="muted">No one at the pass mark yet.</p>'}</section>
    </div>

    <h2>Students per level</h2>
    <div class="bars" role="table" aria-label="Students per level">
      ${perLevel.map(([label, n]) => `<div class="bar-row" role="row">
        <span role="rowheader">${esc(label)}</span>
        <span class="bar-track" title="${n} student${n === 1 ? '' : 's'}">${n ? `<span class="bar" style="width:${(n / maxLevelCount) * 100}%"></span>` : ''}</span>
        <b role="cell">${n}</b></div>`).join('')}
    </div>${perLevel.length ? '' : '<p class="muted">No students yet.</p>'}`

  $('#dc', el).onchange = e => { try { localStorage.setItem('dashClass', e.target.value) } catch {} render(el) }
}
