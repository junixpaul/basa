import { supabase } from './supabase.js'
import { warmWhisper } from './speech.js'

// Offline-first helpers: readings saved on the device while offline and uploaded later,
// the header status pill, and "Get ready for offline" (pre-loads every page's data + speech model).
const KEY = 'pendingAttempts'
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || [] } catch { return [] } }
const write = q => { try { localStorage.setItem(KEY, JSON.stringify(q)) } catch {} paint() }
export const pending = () => read().length
const isNetwork = e => !navigator.onLine || /fetch|network|load failed/i.test(e?.message ?? '')

// Saves a reading. Online: straight to Supabase, returns { level }. Offline: queued, returns { queued: true }.
export async function saveAttempt(args) {
  const row = { ...args, p_at: args.p_at ?? new Date().toISOString() }
  if (navigator.onLine) {
    const { data, error } = await supabase.rpc('record_attempt', row)
    if (!error) return { level: data }
    if (!isNetwork(error)) throw error
  }
  write([...read(), row])
  return { queued: true }
}

let flushing = false
export async function flush() {
  if (flushing || !navigator.onLine || !pending()) return
  flushing = true
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return // signed out or login expired: keep readings until the teacher signs in again
    for (let q = read(); q.length; q = read()) {
      const { error } = await supabase.rpc('record_attempt', q[0])
      // only drop a reading the server can never accept (student/lesson deleted = 42501, bad data = 22xxx/23xxx);
      // anything else (no signal, server hiccup) keeps it for the next try
      if (error && !(error.code === '42501' || /^2[23]/.test(error.code ?? ''))) break
      if (error) console.warn('Dropped a saved reading the server rejected:', error.message, q[0])
      write(read().slice(1))
    }
  } finally { flushing = false }
}

function paint() {
  const el = document.getElementById('offline')
  if (!el) return
  const n = pending(), s = n === 1 ? '' : 's'
  el.hidden = navigator.onLine && !n
  el.textContent = navigator.onLine ? `Uploading ${n} reading${s}…` : n ? `Offline · ${n} reading${s} to upload` : 'Offline'
}

export function startOffline() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(e => console.warn('Offline mode unavailable:', e))
  addEventListener('online', () => { paint(); flush() })
  addEventListener('offline', paint)
  paint(); flush()
}

// Opens every page once in the background so its data is saved for offline use, then loads the speech model.
export async function prepareOffline(say) {
  const box = () => document.createElement('div')
  const page = async (name, args = []) => { try { await (await import(`../pages/${name}.js`)).render(box(), args) } catch {} }
  say('Saving classes, students and lessons…')
  for (const p of ['dashboard', 'students', 'lessons', 'setup']) await page(p)
  const [{ data: secs }, { data: lessons }, { data: studs }] = await Promise.all([
    supabase.from('sections').select('id'),
    supabase.from('lessons').select('id, level').order('created_at', { ascending: false }),
    supabase.from('students').select('id, level'),
  ])
  let prev = null
  try { prev = localStorage.getItem('class') } catch {}
  for (const s of secs ?? []) { try { localStorage.setItem('class', s.id) } catch {} await page('sections') }
  try { prev ? localStorage.setItem('class', prev) : localStorage.removeItem('class') } catch {}
  for (const [i, l] of (lessons ?? []).entries()) { say(`Saving lessons ${i + 1}/${lessons.length}…`); await page('player', [l.id]) }
  for (const [i, st] of (studs ?? []).entries()) {
    say(`Saving students ${i + 1}/${studs.length}…`)
    const l = lessons?.find(x => x.level === st.level) // the lesson the Read button opens
    if (l) await page('assess', [st.id, l.id])
    await page('progress', [st.id])
  }
  say('Downloading the speech checker (about 80 MB, one time)…')
  await warmWhisper()
  try { localStorage.setItem('offlineReady', Date.now()) } catch {}
}
