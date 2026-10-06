import { supabase } from './lib/supabase.js'

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)
export const $ = (sel, el = document) => el.querySelector(sel)

const routes = [
  [/^#\/$/, () => import('./pages/sections.js')],
  [/^#\/lessons$/, () => import('./pages/lessons.js')],
  [/^#\/lessons\/([\w-]+)$/, () => import('./pages/lessons.js')],
  [/^#\/play\/([\w-]+)$/, () => import('./pages/player.js')],
  [/^#\/assess\/([\w-]+)\/([\w-]+)$/, () => import('./pages/assess.js')],
]

async function login(el) {
  el.innerHTML = `<h1>Teacher sign in</h1>
    <form class="row"><input type="email" required placeholder="you@school.edu.ph" aria-label="Email"><button class="primary">Email me a sign-in link</button></form><p id="msg" class="muted"></p>`
  $('form', el).onsubmit = async e => {
    e.preventDefault()
    const { error } = await supabase.auth.signInWithOtp({ email: $('input', el).value, options: { emailRedirectTo: location.origin + location.pathname } })
    $('#msg', el).textContent = error ? error.message : 'Check your email for the sign-in link.'
  }
}

async function route() {
  const el = $('#app'), hash = location.hash || '#/'
  const { data: { session } } = await supabase.auth.getSession()
  $('#out').hidden = !session
  if (!session) return login(el)
  for (const [re, load] of routes) {
    const m = hash.match(re)
    if (m) return (await load()).render(el, m.slice(1))
  }
  el.innerHTML = '<p>Page not found. <a href="#/">Go to classes</a></p>'
}

$('#out').onclick = () => supabase.auth.signOut()
supabase.auth.onAuthStateChange(() => setTimeout(route)) // setTimeout: awaiting supabase inside this callback can deadlock
addEventListener('hashchange', route)
