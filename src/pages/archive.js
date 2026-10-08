import { supabase } from '../lib/supabase.js'
import { esc, $, ask } from '../app.js'

const day = t => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

// Everything removed or deleted lands here (archived_at set). Restore brings it back; Delete forever is final.
export async function render(el) {
  const [{ data: classes }, { data: students }, { data: lessons }] = await Promise.all([
    supabase.from('sections').select('id, name, archived_at').not('archived_at', 'is', null).order('archived_at', { ascending: false }),
    supabase.from('students').select('id, name, section_id, archived_at, sections(name, archived_at)').not('archived_at', 'is', null).order('archived_at', { ascending: false }),
    supabase.from('lessons').select('id, title, archived_at').not('archived_at', 'is', null).order('archived_at', { ascending: false }),
  ])
  const table = (kind, rows, label) => rows?.length ? `<table><tbody>${rows.map(r => `<tr data-kind="${kind}" data-id="${r.id}">
      <td><b>${esc(label(r))}</b><br><span class="muted small">Archived ${day(r.archived_at)}</span></td>
      <td class="nowrap" style="text-align:right"><button data-restore class="primary">Restore</button> <button data-forever>Delete forever</button></td></tr>`).join('')}</tbody></table>`
    : '<p class="muted">Nothing here.</p>'

  el.innerHTML = `<div class="row" style="margin-top:0"><a href="#/setup"><button>← Setup</button></a></div>
    <h1>Archive</h1>
    <p class="muted">Removed classes, students and lessons stay here. Restore brings them back with their readings.</p>
    <p id="msg" role="status" aria-live="polite"></p>
    <h2>Classes</h2>${table('class', classes, r => r.name)}
    <h2>Students</h2>${table('student', students, r => `${r.name} · ${r.sections?.name ?? ''}`)}
    <h2>Lessons</h2>${table('lesson', lessons, r => r.title)}`

  const msg = $('#msg', el)
  const fail = text => { msg.textContent = text; msg.className = 'bad' }
  const table_ = { class: 'sections', student: 'students', lesson: 'lessons' }

  el.querySelectorAll('tr[data-kind]').forEach(tr => {
    const { kind, id } = tr.dataset, name = tr.querySelector('b').textContent
    $('[data-restore]', tr).onclick = async () => {
      let error
      if (kind === 'class') {
        // bring back the students that were archived together with the class
        const at = classes.find(c => c.id === id).archived_at
        ;({ error } = await supabase.from('sections').update({ archived_at: null }).eq('id', id))
        if (!error) ({ error } = await supabase.from('students').update({ archived_at: null }).eq('section_id', id).eq('archived_at', at))
      } else if (kind === 'student') {
        // a student whose class is archived would stay hidden, so restore the class too
        const st = students.find(s => s.id === id)
        if (st.sections?.archived_at) ({ error } = await supabase.from('sections').update({ archived_at: null }).eq('id', st.section_id))
        if (!error) ({ error } = await supabase.from('students').update({ archived_at: null }).eq('id', id))
      } else ({ error } = await supabase.from('lessons').update({ archived_at: null }).eq('id', id))
      if (error) return fail(error.code === '23505' ? `A class named "${name}" already exists. Rename it in Setup first.` : error.message)
      render(el)
    }
    $('[data-forever]', tr).onclick = async () => {
      const what = { class: 'class, its students and all their readings', student: 'student and all their readings', lesson: 'lesson' }[kind]
      if (!await ask(`Delete "${name}" forever?`, `This permanently deletes the ${what}. It can't be undone.`, 'Delete forever')) return
      const { error } = await supabase.from(table_[kind]).delete().eq('id', id)
      error ? fail(error.message) : render(el)
    }
  })
}
