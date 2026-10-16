import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { pickVoice, listen, PAUSE_MS } from '../src/lib/speech.js'
const V = [{ lang: 'en-US', name: 'en' }, { lang: 'fil-PH', name: 'fil' }]
test('exact match', () => assert.deepEqual(pickVoice(V, 'en-US'), { voice: V[0], fallback: false }))
test('Bisaya falls back to Filipino', () => assert.deepEqual(pickVoice(V, 'ceb-PH'), { voice: V[1], fallback: true }))
test('nothing usable -> default voice, flagged', () => assert.deepEqual(pickVoice([V[0]], 'ceb-PH'), { voice: null, fallback: true }))
test('underscore lang codes (Android) still match', () =>
  assert.deepEqual(pickVoice([{ lang: 'fil_PH', name: 'a' }], 'fil-PH'), { voice: { lang: 'fil_PH', name: 'a' }, fallback: false }))
test('listen rejects when browser lacks SpeechRecognition', async () =>
  await assert.rejects(listen('fil-PH'), /unsupported/))
test('listen keeps going after a pause (slow reader) and joins the sessions', async () => {
  const said = ['ang', 'bata']
  globalThis.SpeechRecognition = class {
    start() { const w = said.shift(); queueMicrotask(() => {
      if (w) this.onresult({ results: [[{ transcript: w }]] }); else this.onerror({ error: 'no-speech' })
      this.onend() // browser ends the session on its own after each pause
    }) }
    stop() {}
  }
  try { assert.equal(await listen('fil-PH', 60000, undefined, false, t => t === 'ang bata'), 'ang bata') }
  finally { delete globalThis.SpeechRecognition }
})
test('listen ends after a long pause once reading started (last word misheard)', async () => {
  mock.timers.enable(['setTimeout'])
  globalThis.SpeechRecognition = class {
    start() { queueMicrotask(() => this.onresult({ results: [[{ transcript: 'ang' }]] })) }
    stop() { queueMicrotask(() => this.onend()) }
  }
  try {
    const heard = listen('fil-PH', 180000)
    await Promise.resolve()
    mock.timers.tick(PAUSE_MS)
    assert.equal(await heard, 'ang')
  } finally { mock.timers.reset(); delete globalThis.SpeechRecognition }
})
