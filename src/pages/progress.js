import { supabase } from '../lib/supabase.js'
import { LEVELS, MAX_LEVEL, passFor, familyNames, familyLabel, studentLabel, lessonFor } from '../lib/levels.js'
import { getPassing } from '../lib/passing.js'
import { esc, $, ask } from '../app.js'

const pct = x => `${Math.round(x * 100)}%`
const day = t => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

// One student's progress tracker: level stepper, score trend, reading history.
export async function render(el, [id]) {
  const PASS_SCORE = passFor(await getPassing()) // overall passing average from Setup, else the default
  const [{ data: s }, { data: attempts }, { data: lessons }] = await Promise.all([
    supabase.from('students').select('id, name, level, family_no, sections(name)').eq('id', id).maybeSingle(),
    supabase.from('attempts').select('score, passed, result, created_at, lessons(title, level)').eq('student_id', id).order('created_at'),
    supabase.from('lessons').select('id, level, family, family_no').is('archived_at', null).order('created_at', { ascending: false }),
  ])
  const fams = familyNames(lessons)
  if (!s) { el.innerHTML = '<h1>Student not found</h1><div class="row"><a href="#/students"><button>Student List</button></a></div>'; return }

  const steps = Array.from({ length: MAX_LEVEL }, (_, i) => i + 1)
  const missed = a => (a.result?.words ?? []).filter(w => !w.ok).map(w => w.text)
  // words this student misses most, across every reading (punctuation/case ignored)
  const counts = {}
  for (const a of attempts) for (const w of missed(a)) { const k = w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''); if (k) counts[k] = (counts[k] ?? 0) + 1 }
  const practice = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 12)
  const next = lessonFor(lessons, s)
  el.innerHTML = `<div class="row" style="margin-top:0"><a href="#/students"><button>← Student List</button></a>
      <button id="remove" style="margin-left:auto">Remove student</button></div>
    <p class="muted" style="margin-bottom:0">${esc(s.sections?.name ?? '')}</p><h1>${esc(s.name)}</h1>
    <div class="row now-on" role="status">
      <span><span class="muted">Now on</span><br><b>${esc(studentLabel(s, fams))}</b></span>
      ${next ? `<a href="#/assess/${s.id}/${next.id}" style="margin-left:auto"><button class="primary">Read</button></a>`
        : `<span class="muted" style="margin-left:auto">${s.level >= MAX_LEVEL ? '🎉 Finished every level' : 'No lesson for this stage yet'}</span>`}
    </div>
    ${s.level >= MAX_LEVEL ? '' : `<ol class="stepper" aria-label="Stages in ${esc(familyLabel(s.family_no, fams))}">
      ${steps.map(n => `<li class="${n < s.level ? 'done' : n === s.level ? 'now' : ''}" ${n === s.level ? 'aria-current="step"' : ''}>
        <span class="dot" aria-hidden="true">${n < s.level ? '✓' : n}</span>${n < MAX_LEVEL ? `Stage ${n}<br>${LEVELS[n]}` : 'Level<br>complete'}</li>`).join('')}
    </ol>`}

    <div class="tiles">
      <div class="tile"><span class="muted">Readings</span><b>${attempts.length}</b></div>
      <div class="tile"><span class="muted">Passed</span><b>${attempts.filter(a => a.passed).length}</b></div>
      <div class="tile"><span class="muted">Overall score</span><b>${attempts.length ? pct(attempts.reduce((t, a) => t + a.score, 0) / attempts.length) : '—'}</b><span class="muted small">average of all readings</span></div>
      <div class="tile"><span class="muted">Best score</span><b>${attempts.length ? pct(Math.max(...attempts.map(a => a.score))) : '—'}</b></div>
      <div class="tile"><span class="muted">Last reading</span><b>${attempts.length ? day(attempts.at(-1).created_at) : '—'}</b></div>
    </div>

    <h2>Score trend</h2>
    ${attempts.length > 1 ? trend(attempts, PASS_SCORE) : `<p class="muted">${attempts.length ? 'One reading so far. The trend shows after two.' : 'No readings yet.'}</p>`}

    ${practice.length ? `<h2>Words to practice</h2><p class="muted small">Most often missed, across all readings.</p>
      <div class="row">${practice.map(([w, n]) => `<span class="chip">${esc(w)} <b>×${n}</b></span>`).join('')}</div>` : ''}

    <h2>Reading history</h2>
    ${attempts.length ? `<table><thead><tr><th>Date</th><th>Lesson</th><th>Score</th><th>Result</th><th>Missed words</th></tr></thead><tbody>
      ${[...attempts].reverse().map(a => `<tr><td>${day(a.created_at)}</td><td>${esc(a.lessons?.title ?? '')} <span class="muted small">Stage ${a.lessons?.level ?? ''}</span></td>
        <td>${pct(a.score)}</td><td class="${a.passed ? 'ok' : 'muted'}">${a.passed ? '✓ Passed' : '✗ Not yet'}</td>
        <td>${missed(a).length ? `<span class="bad-words">${missed(a).map(esc).join(', ')}</span>` : '<span class="muted">none</span>'}
          ${a.result?.heard ? `<details><summary class="muted small">What was heard</summary>“${esc(a.result.heard)}”</details>` : ''}</td></tr>`).join('')}
    </tbody></table>` : ''}
    <div class="row" style="margin-top:24px"><a href="#/students"><button>Student List</button></a></div>`

  // Remove = archive (restorable from the Archive page); readings stay with the student
  $('#remove', el).onclick = async e => {
    if (!await ask(`Remove ${s.name}?`, 'Are you sure you want to remove this student? They move to the Archive, where you can restore them with all their readings.', 'Remove student')) return
    const { error } = await supabase.from('students').update({ archived_at: new Date().toISOString() }).eq('id', s.id)
    if (error) { e.currentTarget.textContent = 'Could not remove: ' + error.message; return }
    location.hash = '#/students'
  }

  // tooltip: one shared box follows the hovered/focused point
  const tip = $('#tip', el)
  el.querySelectorAll('.pt').forEach(p => {
    const show = () => { tip.hidden = false; tip.textContent = p.dataset.tip; tip.style.left = `${p.dataset.x}%`; tip.style.top = `${p.dataset.y}%` }
    p.onmouseenter = p.onfocus = show
    p.onmouseleave = p.onblur = () => { tip.hidden = true }
  })
}

// Single-series line chart, 0–100% y axis, dashed pass line. Inline SVG; no library.
export function trend(attempts, PASS_SCORE) {
  const W = 600, H = 200, L = 36, R = 12, T = 12, B = 24
  const x = i => L + (i / (attempts.length - 1)) * (W - L - R)
  const y = v => T + (1 - v) * (H - T - B)
  const pts = attempts.map((a, i) => [x(i), y(a.score)])
  const grid = [0, 0.5, 1].map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${pct(v)}</text>`).join('')
  return `<figure class="chart">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Score for each reading, oldest to newest">
      ${grid}
      <line x1="${L}" x2="${W - R}" y1="${y(PASS_SCORE)}" y2="${y(PASS_SCORE)}" class="pass"/>
      <text x="${W - R}" y="${y(PASS_SCORE) - 8}" text-anchor="end" class="pass-label">pass ${pct(PASS_SCORE)}</text>
      <polyline points="${pts.map(p => p.join(',')).join(' ')}" class="line"/>
      ${attempts.map((a, i) => `<g class="pt" tabindex="0" data-x="${(pts[i][0] / W) * 100}" data-y="${(pts[i][1] / H) * 100}"
          data-tip="${day(a.created_at)} · ${esc(a.lessons?.title ?? '')} · ${pct(a.score)} ${a.passed ? '✓' : '✗'}">
        <circle cx="${pts[i][0]}" cy="${pts[i][1]}" r="14" class="hit"/><circle cx="${pts[i][0]}" cy="${pts[i][1]}" r="5" class="mark"/></g>`).join('')}
      <text x="${L}" y="${H - 4}">${day(attempts[0].created_at)}</text>
      <text x="${W - R}" y="${H - 4}" text-anchor="end">${day(attempts.at(-1).created_at)}</text>
    </svg>
    <div id="tip" class="tip" role="status" hidden></div>
  </figure>`
}
