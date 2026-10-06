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
  return { fallback }
}

// Resolves with everything heard until stop (signal abort), silence end, or maxMs.
export function listen(lang, maxMs = 30000, signal) {
  const R = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition
  if (!R) return Promise.reject(new Error('unsupported'))
  return new Promise((resolve, reject) => {
    const r = new R()
    r.lang = lang === 'ceb-PH' ? CEB_LISTEN_LANG : lang
    r.continuous = true
    r.interimResults = false
    let text = '', failed = false
    r.onresult = e => { text = [...e.results].map(x => x[0].transcript).join(' ') }
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
