// Walkthrough: a small card that points at the menu, one stop at a time.
// Shows once per device; Skip or Done remembers it. "Run walkthrough" on the Guide page starts it again.
const KEY = 'tourDone'
const STEPS = [
  [null, 'Welcome to Basa!', "Let's take a quick look around. It only takes a minute."],
  ['#/setup', '1. Setup', 'Start here. Add your grade and section, like "Grade 1 – Sampaguita". Each one becomes a class.'],
  ['#/', '2. Classes', 'Add your students here. Type their names, one per row.'],
  ['#/lessons', '3. Lessons', 'Reading lessons are already made for you. You can also make your own.'],
  ['#/students', '4. Students', 'Find a student and press Read. The student reads out loud, and Basa listens and marks each word right or wrong.'],
  ['#/dashboard', '5. Dashboard', 'See how your class is doing, and who needs a little help.'],
  ['#/profile', 'Profile', 'Your name, picture, dark mode and Sign out are here.'],
  ['#/guide', 'Need help later?', 'Open Guide any time. You can run this walkthrough again there.'],
]
const seen = () => { try { return localStorage.getItem(KEY) } catch { return '1' } } // no storage: don't nag every load
const mark = () => { try { localStorage.setItem(KEY, '1') } catch {} }

export function autoTour() { if (!seen()) startTour() }

export function startTour() {
  document.getElementById('tour')?.remove()
  const box = document.createElement('aside')
  box.id = 'tour'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Walkthrough')
  document.body.append(box)
  let i = 0, lit
  const close = () => { lit?.classList.remove('tour-hit'); box.remove(); removeEventListener('keydown', esc); mark() }
  const esc = e => e.key === 'Escape' && close()
  addEventListener('keydown', esc)
  const show = () => {
    const [href, title, text] = STEPS[i], last = i === STEPS.length - 1
    lit?.classList.remove('tour-hit')
    lit = href && document.querySelector(`header nav a[href="${href}"], .tools a[href="${href}"]`)
    lit?.classList.add('tour-hit'); lit?.scrollIntoView({ block: 'nearest' })
    box.innerHTML = `<p class="muted small">Step ${i + 1} of ${STEPS.length}</p><h2>${title}</h2><p>${text}</p>
      <div class="row"><button class="primary" id="tNext">${last ? 'Done' : 'Next'}</button>
      ${i ? '<button id="tBack">Back</button>' : ''}${last ? '' : '<button class="linkish" id="tSkip">Skip</button>'}</div>`
    box.querySelector('#tNext').onclick = () => last ? close() : (i++, show())
    box.querySelector('#tBack')?.addEventListener('click', () => { i--; show() })
    box.querySelector('#tSkip')?.addEventListener('click', close)
    // sit under the lit menu item (centered on screen when a step points at nothing)
    const r = lit?.getBoundingClientRect(), w = box.offsetWidth, h = box.offsetHeight
    const clamp = (v, max) => Math.max(16, Math.min(v, max - 16))
    box.style.left = clamp(r ? r.left + r.width / 2 - w / 2 : (innerWidth - w) / 2, innerWidth - w) + 'px'
    box.style.top = clamp(r ? r.bottom + 16 : (innerHeight - h) / 2, innerHeight - h) + 'px'
    box.querySelector('#tNext').focus()
  }
  show()
}
