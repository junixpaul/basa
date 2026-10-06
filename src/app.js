import { supabase } from './lib/supabase.js'

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)
export const $ = (sel, el = document) => el.querySelector(sel)

// Two-tap confirm for destructive buttons. Native confirm()/prompt() are blocked in some
// embedded browsers, so never use them. Returns true on the second tap within 3 s.
export function armed(btn) {
  if (btn.dataset.armed) return true
  const label = btn.textContent
  btn.dataset.armed = 1; btn.textContent = 'Tap again to confirm'; btn.classList.add('danger')
  setTimeout(() => { delete btn.dataset.armed; btn.textContent = label; btn.classList.remove('danger') }, 3000)
  return false
}

const routes = [
  [/^#\/$/, () => import('./pages/sections.js')],
  [/^#\/setup$/, () => import('./pages/setup.js')],
  [/^#\/students$/, () => import('./pages/students.js')],
  [/^#\/students\/([\w-]+)$/, () => import('./pages/progress.js')],
  [/^#\/dashboard$/, () => import('./pages/dashboard.js')],
  [/^#\/lessons$/, () => import('./pages/lessons.js')],
  [/^#\/lessons\/([\w-]+)$/, () => import('./pages/lessons.js')],
  [/^#\/play\/([\w-]+)$/, () => import('./pages/player.js')],
  [/^#\/assess\/([\w-]+)\/([\w-]+)$/, () => import('./pages/assess.js')],
]

const GOOGLE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z"/></svg>`
const FACEBOOK = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#1877F2"/><path fill="#fff" d="M15.1 15.5l.5-3.5h-3.3V9.8c0-1 .5-1.9 2-1.9h1.5v-3s-1.4-.2-2.7-.2c-2.8 0-4.6 1.7-4.6 4.7V12H5.4v3.5h3.1V24a12 12 0 0 0 3.8 0v-8.5h2.8z"/></svg>`

async function login(el) {
  el.innerHTML = `<section class="auth">
      <svg class="auth-logo" viewBox="0 0 32 32" aria-hidden="true">${$('.brand svg').innerHTML}</svg>
      <h1>Welcome, teacher</h1>
      <p class="muted" id="sub">Sign in to manage your classes and lessons.</p>
      <button class="social" data-p="google">${GOOGLE}Continue with Google</button>
      <button class="social" data-p="facebook">${FACEBOOK}Continue with Facebook</button>
      <p class="or"><span>or use email</span></p>
      <form novalidate>
        <label for="email">Email</label>
        <input id="email" type="email" autocomplete="email" required placeholder="you@school.edu.ph" aria-describedby="msg">
        <label for="pw">Password</label>
        <div class="pw"><input id="pw" type="password" autocomplete="current-password" required aria-describedby="msg">
          <button type="button" id="eye" aria-label="Show password" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path class="slash" d="M3 3l18 18"/></svg></button></div>
        <button class="primary">Log in</button>
        <button type="button" id="link">Email me a sign-in link instead</button>
      </form>
      <p id="msg" role="status" aria-live="polite"></p>
      <p class="switch"><span id="ask">New to Basa?</span> <button type="button" class="linkish" id="mode">Create an account</button></p>
      <p class="muted small">Students don't need an account. Open a lesson for them after you sign in.</p>
    </section>`
  const msg = $('#msg', el)
  // msg moves next to whatever it is about, so errors sit under their field
  const say = (text, kind = '', near = $('#link', el)) => { (near.closest('.pw') || near).after(msg); msg.textContent = text; msg.className = kind }
  el.querySelectorAll('[data-p]').forEach(b => b.onclick = async () => {
    b.disabled = true; say('Opening ' + b.textContent.replace('Continue with ', '') + '…', '', b)
    const { error } = await supabase.auth.signInWithOAuth({ provider: b.dataset.p, options: { redirectTo: location.origin + location.pathname } })
    if (error) { b.disabled = false; say(error.message, 'bad', b) }
  })
  const email = $('#email', el), pw = $('#pw', el)
  $('#eye', el).onclick = e => {
    const show = pw.type === 'password'
    pw.type = show ? 'text' : 'password'
    e.currentTarget.setAttribute('aria-pressed', show)
    e.currentTarget.setAttribute('aria-label', show ? 'Hide password' : 'Show password')
  }
  const bad = (input, text) => { input.setAttribute('aria-invalid', 'true'); input.focus(); say(text, 'bad', input) }
  const emailOk = () => email.checkValidity() || bad(email, 'Enter a valid email, like you@school.edu.ph.')
  const busy = (btn, label) => { const old = btn.textContent; btn.disabled = true; btn.textContent = label; say(''); return () => { btn.disabled = false; btn.textContent = old } }
  el.querySelectorAll('input').forEach(i => i.oninput = () => { i.removeAttribute('aria-invalid'); say('') })

  let signup = false
  $('#mode', el).onclick = () => {
    signup = !signup
    $('h1', el).textContent = signup ? 'Create your account' : 'Welcome, teacher'
    $('form .primary', el).textContent = signup ? 'Create account' : 'Log in'
    $('#sub', el).textContent = signup ? 'Free for teachers. Set up your classes in minutes.' : 'Sign in to manage your classes and lessons.'
    $('#link', el).hidden = signup
    pw.autocomplete = signup ? 'new-password' : 'current-password'
    pw.placeholder = signup ? 'At least 8 characters' : ''
    $('#ask', el).textContent = signup ? 'Already have an account?' : 'New to Basa?'
    $('#mode', el).textContent = signup ? 'Log in' : 'Create an account'
    say(''); email.focus(); countdown()
  }

  // ponytail: browser-side lockout is UX only (attackers can call the API directly);
  // the real limit is Supabase Auth's per-IP rate limit (Dashboard → Auth → Rate Limits).
  const MAX_FAILS = 5, LOCK_MS = 60_000
  const lock = { get: () => { try { return JSON.parse(localStorage.getItem('loginLock')) || { fails: 0, until: 0 } } catch { return { fails: 0, until: 0 } } },
                 set: v => { try { localStorage.setItem('loginLock', JSON.stringify(v)) } catch {} } }
  const loginBtn = $('form .primary', el)
  const countdown = () => {
    const left = Math.ceil((lock.get().until - Date.now()) / 1000)
    if (left > 0 && el.isConnected && !signup) { loginBtn.disabled = true; say(`Too many tries. Try again in ${left}s.`, 'bad', pw); setTimeout(countdown, 1000) }
    else if (loginBtn.disabled) { loginBtn.disabled = false; say('') }
  }
  countdown()

  $('form', el).onsubmit = async e => {
    e.preventDefault()
    if (!signup && lock.get().until > Date.now()) return countdown()
    if (!emailOk()) return
    if (!pw.value) return bad(pw, 'Enter your password.')
    if (signup) {
      if (pw.value.length < 8) return bad(pw, 'Use at least 8 characters.')
      const done = busy($('form .primary', el), 'Creating account…')
      const { data, error } = await supabase.auth.signUp({ email: email.value, password: pw.value, options: { emailRedirectTo: location.origin + location.pathname } })
      done()
      if (error) return /registered/i.test(error.message) ? bad(email, 'This email already has an account. Log in instead.') : say(error.message, 'bad', $('form .primary', el))
      // with email confirmation on there is no session yet; onAuthStateChange routes in when there is
      if (!data.session) say(`Almost done! Check ${email.value} to confirm your account.`, 'ok', $('form .primary', el))
      return
    }
    const done = busy($('form .primary', el), 'Logging in…')
    const { error } = await supabase.auth.signInWithPassword({ email: email.value, password: pw.value })
    done()
    if (!error) return lock.set({ fails: 0, until: 0 })
    if (error.message !== 'Invalid login credentials') return bad(pw, error.message) // incl. Supabase's own rate-limit message
    const fails = lock.get().fails + 1
    if (fails >= MAX_FAILS) { lock.set({ fails: 0, until: Date.now() + LOCK_MS }); return countdown() }
    lock.set({ fails, until: 0 })
    bad(pw, `Wrong email or password. ${MAX_FAILS - fails} ${MAX_FAILS - fails === 1 ? 'try' : 'tries'} left.`)
  }
  $('#link', el).onclick = async e => {
    if (!emailOk()) return
    const done = busy(e.target, 'Sending…')
    const { error } = await supabase.auth.signInWithOtp({ email: email.value, options: { emailRedirectTo: location.origin + location.pathname } })
    done()
    error ? say(error.message, 'bad') : say(`Check ${email.value} for your sign-in link.`, 'ok')
  }
}

let seq = 0
async function route() {
  const el = $('#app'), hash = location.hash || '#/', mine = ++seq
  const { data: { session } } = await supabase.auth.getSession()
  if (mine !== seq) return
  $('#out').hidden = !session
  document.body.classList.toggle('signed-out', !session)
  if (!session) return login(el)
  // highlight the menu item for this page; reading pages belong to their section
  const page = { assess: '#/', play: '#/lessons', students: '#/students' }[hash.split('/')[1]] || hash.match(/^#\/\w*/)[0]
  document.querySelectorAll('header nav a').forEach(a =>
    a.getAttribute('href') === page ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'))
  for (const [re, load] of routes) {
    const m = hash.match(re)
    if (!m) continue
    // render off-screen, then swap in only if the user hasn't moved on; a slow page can't overwrite a newer one
    const box = document.createElement('div')
    await (await load()).render(box, m.slice(1))
    if (mine === seq) el.replaceChildren(box)
    return
  }
  el.innerHTML = '<h1>Page not found</h1><div class="row"><a href="#/"><button class="primary">Go to classes</button></a></div>'
}

$('#out').onclick = e => armed(e.currentTarget) && supabase.auth.signOut()
supabase.auth.onAuthStateChange(() => setTimeout(route)) // setTimeout: awaiting supabase inside this callback can deadlock
addEventListener('hashchange', route)
