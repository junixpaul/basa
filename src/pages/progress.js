import { supabase } from '../lib/supabase.js'
import { LEVELS, MAX_LEVEL, PASS_SCORE } from '../lib/levels.js'
import { esc, $ } from '../app.js'

const pct = x => `${Math.round(x * 100)}%`
const day = t => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

// One student's progress tracker: level stepper, score trend, reading history.
export async function render(el, [id]) {
  const [{ data: s }, { data: attempts }] = await Promise.all([
    supabase.from('students').select('id, name, level, sections(name)').eq('id', id).maybeSingle(),
    supabase.from('attempts').select('score, passed, result, created_at, lessons(title, level)').eq('student_id', id).order('created_at'),
  ])
  if (!s) { el.innerHTML = '<h1>Student not found</h1><div class="row"><a href="#/students"><button>Student List</button></a></div>'; return }

  const steps = Array.from({ length: MAX_LEVEL }, (_, i) => i + 1)
  const missed = a => (a.result?.words ?? []).filter(w => !w.ok).map(w => w.text)
  // words this student misses most, across every reading (punctuation/case ignored)
  const counts = {}
  for (const a of attempts) for (const w of missed(a)) { const k = w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''); if (k) counts[k] = (counts[k] ?? 0) + 1 }
  const practice = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 12)
  el.innerHTML = `<p class="muted">${esc(s.sections?.name ?? '')}</p><h1>${esc(s.name)}</h1>
    <ol class="stepper" aria-label="Reading level">
      ${steps.map(n => `<li class="${n < s.level ? 'done' : n === s.level ? 'now' : ''}" ${n === s.level ? 'aria-current="step"' : ''}>
        <span class="dot" aria-hidden="true">${n < s.level ? '✓' : n}</span>${n < MAX_LEVEL ? LEVELS[n] : 'Finished'}</li>`).join('')}
    </ol>

    <div class="tiles">
      <div class="tile"><span class="muted">Readings</span><b>${attempts.length}</b></div>
      <div class="tile"><span class="muted">Passed</span><b>${attempts.filter(a => a.passed).length}</b></div>
      <div class="tile"><span class="muted">Overall score</span><b>${attempts.length ? pct(attempts.reduce((t, a) => t + a.score, 0) / attempts.length) : '—'}</b><span class="muted small">average of all readings</span></div>
      <div class="tile"><span class="muted">Best score</span><b>${attempts.length ? pct(Math.max(...attempts.map(a => a.score))) : '—'}</b></div>
      <div class="tile"><span class="muted">Last reading</span><b>${attempts.length ? day(attempts.at(-1).created_at) : '—'}</b></div>
    </div>

    <h2>Score trend</h2>
    ${attempts.length > 1 ? trend(attempts) : `<p class="muted">${attempts.length ? 'One reading so far. The trend shows after two.' : 'No readings yet.'}</p>`}

    ${practice.length ? `<h2>Words to practice</h2><p class="muted small">Most often missed, across all readings.</p>
      <div class="row">${practice.map(([w, n]) => `<span class="chip">${esc(w)} <b>×${n}</b></span>`).join('')}</div>` : ''}

    <h2>Reading history</h2>
    ${attempts.length ? `<table><thead><tr><th>Date</th><th>Lesson</th><th>Score</th><th>Result</th><th>Missed words</th></tr></thead><tbody>
      ${[...attempts].reverse().map(a => `<tr><td>${day(a.created_at)}</td><td>${esc(a.lessons?.title ?? '')} <span class="muted small">L${a.lessons?.level ?? ''}</span></td>
        <td>${pct(a.score)}</td><td class="${a.passed ? 'ok' : 'muted'}">${a.passed ? '✓ Passed' : '✗ Not yet'}</td>
        <td>${missed(a).length ? `<span class="bad-words">${missed(a).map(esc).join(', ')}</span>` : '<span class="muted">none</span>'}
          ${a.result?.heard ? `<details><summary class="muted small">What was heard</summary>“${esc(a.result.heard)}”</details>` : ''}</td></tr>`).join('')}
    </tbody></table>` : ''}
    <div class="row" style="margin-top:24px"><a href="#/students"><button>Student List</button></a></div>`

  // tooltip: one shared box follows the hovered/focused point
  const tip = $('#tip', el)
  el.querySelectorAll('.pt').forEach(p => {
    const show = () => { tip.hidden = false; tip.textContent = p.dataset.tip; tip.style.left = `${p.dataset.x}%`; tip.style.top = `${p.dataset.y}%` }
    p.onmouseenter = p.onfocus = show
    p.onmouseleave = p.onblur = () => { tip.hidden = true }
  })
}

// Single-series line chart, 0–100% y axis, dashed pass line. Inline SVG; no library.
export function trend(attempts) {
  const W = 600, H = 200, L = 36, R = 12, T = 12, B = 24
  const x = i => L + (i / (attempts.length - 1)) * (W - L - R)
  const y = v => T + (1 - v) * (H - T - B)
  const pts = attempts.map((a, i) => [x(i), y(a.score)])
  const grid = [0, 0.5, 1].map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${pct(v)}</text>`).join('')
  return `<figure class="chart">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Score for each reading, oldest to newest">
      ${grid}
      <line x1="${L}" x2="${W - R}" y1="${y(PASS_SCORE)}" y2="${y(PASS_SCORE)}" class="pass"/>
      <text x="${L + 6}" y="${y(PASS_SCORE) - 6}" class="pass-label">pass ${pct(PASS_SCORE)}</text>
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
