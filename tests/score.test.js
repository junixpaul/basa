import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scoreReading } from '../src/lib/score.js'
const oks = r => r.words.map(w => w.ok)
test('all correct', () => assert.equal(scoreReading('The cat sat', 'the cat sat').score, 1))
test('missing word is red', () => {
  const r = scoreReading('The cat sat', 'the sat')
  assert.deepEqual(oks(r), [true, false, true])
  assert.ok(Math.abs(r.score - 2 / 3) < 1e-9)
})
test('wrong word is red, order respected', () =>
  assert.deepEqual(oks(scoreReading('ang bata ay masaya', 'ang bata ay malungkot')), [true, true, true, false]))
test('case, punctuation, accents ignored', () => assert.equal(scoreReading('Niño, kumain ka!', 'nino kumain ka').score, 1))
test('extra words heard do not add credit', () => assert.equal(scoreReading('aso', 'aso aso pusa').score, 1))
test('empty target scores 0, keeps no words', () => assert.deepEqual(scoreReading('', 'hello'), { words: [], score: 0 }))
test('preserves original spelling for display', () => assert.equal(scoreReading('Niño!', 'nino').words[0].text, 'Niño!'))
