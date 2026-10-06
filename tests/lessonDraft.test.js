import { test } from 'node:test'
import assert from 'node:assert/strict'
import { splitDraft } from '../src/lib/lessonDraft.js'
const items = (t, l) => { const r = splitDraft(t, l, 'fil-PH', 'x'); return r.ok ? r.draft.items.map(i => i.text) : r.error }
test('words: unique, ordered, no punctuation', () => assert.deepEqual(items('Aso, pusa. Aso!', 1), ['Aso', 'pusa']))
test('words: case-insensitive unique', () => assert.deepEqual(items('Aso aso ASO', 1), ['Aso']))
test('phrases: cut at commas', () => assert.deepEqual(items('ang pulang bola, sa ilalim ng mesa', 2), ['ang pulang bola', 'sa ilalim ng mesa']))
test('phrases: no commas -> every 3 words', () => assert.deepEqual(items('isa dalawa tatlo apat lima', 2), ['isa dalawa tatlo', 'apat lima']))
test('sentences', () => assert.deepEqual(items('Si Ana ay masaya. Kumain siya!', 3), ['Si Ana ay masaya.', 'Kumain siya!']))
test('sentences: OCR line breaks joined', () => assert.deepEqual(items('Si Ana ay\nmasaya. Kumain siya!', 3), ['Si Ana ay masaya.', 'Kumain siya!']))
test('story: paragraphs', () => assert.deepEqual(items('Una.\n\nIkalawa.', 4), ['Una.', 'Ikalawa.']))
test('blank text fails', () => assert.equal(items('  \n ', 3), "Couldn't find readable text"))
test('caps at 200 items x 500 chars', () => {
  assert.equal(items(Array.from({ length: 300 }, (_, i) => [...i.toString(26)].map(c => String.fromCharCode(97 + parseInt(c, 26))).join('') + 'x').join(' '), 1).length, 200)
  assert.equal(items('a'.repeat(900) + '.', 3)[0].length, 500)
})
test('draft carries title, level, language', () => assert.deepEqual(splitDraft('aso', 1, 'ceb-PH', 'Hayop'),
  { ok: true, draft: { title: 'Hayop', level: 1, language: 'ceb-PH', items: [{ text: 'aso' }] } }))
