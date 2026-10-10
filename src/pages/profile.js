import { supabase } from '../lib/supabase.js'
import { GRADES } from '../lib/levels.js'
import { saveAvatar, avatarHtml } from '../lib/avatar.js'
import { prepareOffline } from '../lib/offline.js'
import { esc, $, askSignOut } from '../app.js'

// Teacher details live in the account's user_metadata (name, handling, advisory, avatar): no extra table.
export async function render(el) {
  const { data } = await supabase.auth.getSession()
  const user = data.session?.user, m = user?.user_metadata ?? {}
  const face = await avatarHtml(user)
  let ready = 0
  try { ready = +localStorage.getItem('offlineReady') || 0 } catch {}
  const dark = () => document.documentElement.dataset.theme === 'dark'
  el.innerHTML = `<h1>Profile</h1>
    <form id="pf" class="prof" novalidate>
      <div class="who">${face}
        <div><b>${esc(user?.email ?? '')}</b><br><span class="muted small">Your sign-in email</span></div></div>
      <div><label for="name">Your name</label>
        <input id="name" value="${esc(m.name ?? '')}" autocomplete="name" required></div>
      <div><label for="handling">Classes you handle</label>
        <input id="handling" value="${esc(m.handling ?? '')}" placeholder="e.g. Sampaguita, Rosal" required></div>
      <div><label for="advisory">Advisory level</label>
        <select id="advisory" required><option value="">Choose…</option>${[...GRADES, 'No advisory class'].map(g => `<option ${g === m.advisory ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
      <div><label for="photo">Picture <span class="muted">(optional)</span></label>
        <input id="photo" type="file" accept="image/*"></div>
      <div class="row wide"><button class="primary">Save profile</button><span id="msg" role="status"></span></div>
    </form>
    <div class="cols">
      <section><h2>Appearance</h2><p class="muted">Choose light or dark mode. Basa remembers it on this device.</p><div class="row"><button id="themeBtn" type="button"></button></div></section>
      <section><h2>Offline use</h2><p class="muted">Save your classes on this device so Basa works without internet.</p>
        <div class="row"><button id="prep" type="button">${ready ? 'Update offline copy' : 'Get ready for offline'}</button></div>
        <p id="prepMsg" class="muted small" role="status">${ready ? `✓ Ready for offline · ${new Date(ready).toLocaleDateString()}` : ''}</p></section>
      <section><h2>Account</h2><p class="muted">Signing out also clears the saved offline copy on this device.</p>
        <div class="row"><button id="out" class="danger" type="button">Sign out</button></div></section>
    </div>`

  const msg = $('#msg', el), say = (t, kind = '') => { msg.textContent = t; msg.className = kind }
  const paint = () => { $('#themeBtn', el).textContent = dark() ? '☀ Switch to light mode' : '🌙 Switch to dark mode' }
  paint()
  $('#themeBtn', el).onclick = () => {
    const t = dark() ? 'light' : 'dark'
    document.documentElement.dataset.theme = t
    try { localStorage.setItem('theme', t) } catch {}
    paint()
  }
  $('#out', el).onclick = askSignOut
  $('#prep', el).onclick = async e => {
    const btn = e.currentTarget, pm = $('#prepMsg', el), tell = t => { pm.textContent = t }
    if (!navigator.onLine) return tell('Connect to the internet first.')
    btn.disabled = true
    try { await prepareOffline(tell); tell(`✓ Ready for offline · ${new Date().toLocaleDateString()}`); btn.textContent = 'Update offline copy' }
    catch (err) { tell(`Stopped: ${err.message}. Try again with a stronger signal.`) }
    btn.disabled = false
  }
  $('#pf', el).onsubmit = async e => {
    e.preventDefault()
    const name = $('#name', el).value.trim(), handling = $('#handling', el).value.trim(), advisory = $('#advisory', el).value
    if (!name) return say('Enter your name.', 'bad')
    if (!handling) return say('Enter the classes you handle.', 'bad')
    if (!advisory) return say('Choose your advisory level.', 'bad')
    say('Saving…')
    const { error } = await supabase.auth.updateUser({ data: { name, handling, advisory } })
    if (error) return say(error.message, 'bad')
    const file = $('#photo', el).files[0]
    try { if (file) await saveAvatar(user.id, file) } catch (err) { return say(`Saved, but the picture failed: ${err.message}`, 'bad') }
    $('#me span').textContent = name.split(/\s+/)[0]
    file ? render(el) : say('Saved.', 'ok')
  }
}
