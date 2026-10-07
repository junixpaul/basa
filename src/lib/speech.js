import { CEB_LISTEN_LANG } from './levels.js'
import { CEB_TTS_MODEL } from '../../config.js'

const base = l => l.replace('_', '-').toLowerCase().split('-')[0]
const same = (a, b) => a.replace('_', '-').toLowerCase() === b.toLowerCase()

// Best voice for lang: exact → same language → Filipino/Tagalog → browser default.
export function pickVoice(voices, lang) {
  const exact = voices.find(v => same(v.lang, lang))
  if (exact) return { voice: exact, fallback: false }
  const b = voices.find(v => base(v.lang) === base(lang))
  if (b) return { voice: b, fallback: false }
  return { voice: voices.find(v => ['fil', 'tl'].includes(base(v.lang))) ?? null, fallback: true }
}

export function speak(text, lang) {
  const u = new SpeechSynthesisUtterance(text)
  const { voice, fallback } = pickVoice(speechSynthesis.getVoices(), lang)
  if (voice) u.voice = voice
  u.lang = voice?.lang ?? lang
  u.rate = 0.85
  speechSynthesis.cancel()
  speechSynthesis.speak(u)
  return { fallback, ended: new Promise(r => { u.onend = u.onerror = r }) }
}

// Resolves with everything heard until stop (signal abort), silence end, maxMs,
// or onText(textSoFar) returning true (e.g. the reader reached the last word).
export function listen(lang, maxMs = 30000, signal, local = false, onText = () => false) {
  const R = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition
  if (!R) return Promise.reject(new Error('unsupported'))
  return new Promise((resolve, reject) => {
    const r = new R()
    r.lang = lang === 'ceb-PH' ? CEB_LISTEN_LANG : lang
    if (local) r.processLocally = true
    r.continuous = true
    r.interimResults = true // live words for highlighting
    let text = '', failed = false
    r.onresult = e => { text = [...e.results].map(x => x[0].transcript).join(' '); if (onText(text)) r.stop() }
    r.onerror = e => {
      failed = true
      reject(new Error(['not-allowed', 'service-not-allowed'].includes(e.error) ? 'denied' : e.error))
    }
    r.onend = () => { clearTimeout(timer); if (!failed) resolve(text.trim()) }
    const timer = setTimeout(() => r.stop(), maxMs)
    signal?.addEventListener('abort', () => r.stop())
    r.start()
  })
}

// On-device recognition (newer Chrome): no Google servers needed, so it works where a network blocks them.
// Downloads the language pack on first use. Resolves true when ready, false when this browser/language can't.
export async function localSpeechReady(lang) {
  const R = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition
  const opts = { langs: [lang === 'ceb-PH' ? CEB_LISTEN_LANG : lang], processLocally: true }
  if (!R?.available) return false
  try {
    const state = await R.available(opts)
    if (state === 'available') return true
    if (state === 'downloadable' || state === 'downloading') return await R.install(opts)
  } catch {}
  return false
}

// Last resort: record with the mic, then transcribe in the browser with Whisper (no speech servers at all).
// First use downloads the model (~80 MB) from Hugging Face; the browser caches it after that.
// ponytail: Whisper has no Bisaya, so Bisaya is transcribed as Tagalog; swap the model if accuracy matters there.
let asrPipeline
const WHISPER_LANG = { en: 'english', fil: 'tagalog', tl: 'tagalog', ceb: 'tagalog' }
// While recording it re-transcribes the audio so far (~every 2 s) and calls onText for live highlighting;
// onText returning true stops early. ponytail: re-transcribes from the start each pass, fine for
// lesson-length reads (< ~1 min); switch to a sliding window if short stories feel slow.
// Loads (first time: downloads) the Whisper model. Also used by "Get ready for offline".
export function warmWhisper() {
  if (!asrPipeline) {
    asrPipeline = import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3')
      .then(({ pipeline }) => pipeline('automatic-speech-recognition', 'Xenova/whisper-base', { dtype: 'q8' }))
    asrPipeline.catch(() => { asrPipeline = null }) // let a later try re-download after a failure
  }
  return asrPipeline
}

export async function recordAndTranscribe(lang, maxMs, signal, onStatus = () => {}, onText = () => false) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported')
  const pipe = warmWhisper()

  let stream
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }) }
  catch { throw new Error('denied') }
  const rec = new MediaRecorder(stream), chunks = []
  rec.ondataavailable = e => chunks.push(e.data)
  const stopped = new Promise(r => { rec.onstop = r })
  const stop = () => rec.state !== 'inactive' && rec.stop()
  rec.start(1000) // a chunk every second so we can transcribe while recording
  onStatus('Recording… read the words out loud.')
  const timer = setTimeout(stop, maxMs)
  signal?.addEventListener('abort', stop)

  const opts = { language: WHISPER_LANG[base(lang)] ?? 'english', task: 'transcribe', chunk_length_s: 30, stride_length_s: 5 }
  const transcribe = async () => {
    const ctx = new AudioContext({ sampleRate: 16000 }) // Whisper expects 16 kHz mono
    try {
      const audio = (await ctx.decodeAudioData(await new Blob(chunks).arrayBuffer())).getChannelData(0)
      return (await (await pipe)(audio, opts)).text.trim()
    } finally { ctx.close() }
  }

  // live passes until recording ends (skipped while the model is still downloading)
  let ready = false
  pipe.then(() => { ready = true }, () => {})
  let recording = true
  stopped.then(() => { recording = false })
  while (recording) {
    await Promise.race([stopped, new Promise(r => setTimeout(r, 2000))])
    if (!recording || !ready || !chunks.length) continue
    try { if (onText(await transcribe())) stop() } catch {} // a partial chunk can fail to decode; next pass catches up
  }
  clearTimeout(timer); stream.getTracks().forEach(t => t.stop())

  onStatus('Checking the reading… (first time downloads the speech model, about a minute)')
  try { await pipe } catch { throw new Error('model') }
  return transcribe()
}

let cebPipeline
// Bisaya audio as a WAV Blob, generated in the browser. Null when no model is configured.
export async function synthCeb(text) {
  if (!CEB_TTS_MODEL) return null
  cebPipeline ??= import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3')
    .then(({ pipeline }) => pipeline('text-to-speech', CEB_TTS_MODEL))
  const { audio, sampling_rate } = await (await cebPipeline)(text)
  return wav(audio, sampling_rate)
}

function wav(samples, rate) {
  const v = new DataView(new ArrayBuffer(44 + samples.length * 2))
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVEfmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  str(36, 'data'); v.setUint32(40, samples.length * 2, true)
  samples.forEach((s, i) => v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true))
  return new Blob([v], { type: 'audio/wav' })
}
