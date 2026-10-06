import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickVoice, listen } from '../src/lib/speech.js'
const V = [{ lang: 'en-US', name: 'en' }, { lang: 'fil-PH', name: 'fil' }]
test('exact match', () => assert.deepEqual(pickVoice(V, 'en-US'), { voice: V[0], fallback: false }))
test('Bisaya falls back to Filipino', () => assert.deepEqual(pickVoice(V, 'ceb-PH'), { voice: V[1], fallback: true }))
test('nothing usable -> default voice, flagged', () => assert.deepEqual(pickVoice([V[0]], 'ceb-PH'), { voice: null, fallback: true }))
test('underscore lang codes (Android) still match', () =>
  assert.deepEqual(pickVoice([{ lang: 'fil_PH', name: 'a' }], 'fil-PH'), { voice: { lang: 'fil_PH', name: 'a' }, fallback: false }))
test('listen rejects when browser lacks SpeechRecognition', async () =>
  await assert.rejects(listen('fil-PH'), /unsupported/))
