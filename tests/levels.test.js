import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextAfterPass, lessonFor, studentLabel, passFor, PASS_SCORE } from '../src/lib/levels.js'

test('passing average: stage beats overall beats default', () => {
  assert.equal(passFor({}, 1, 'en-US'), PASS_SCORE)
  assert.equal(passFor({ overall: .7 }, 1), .7)
  assert.equal(passFor({ overall: .7, stage: { 1: .5 } }, 1), .5)
  assert.equal(passFor({ overall: .7, stage: { 1: .5 } }, 2), .7)
  assert.equal(passFor({ stage: { 1: .5 } }, 2), PASS_SCORE)
})

const L = (id, family_no, level) => ({ id, family_no, level, family: family_no ? ['', '-at', '-an'][family_no] : null })

test('passing moves step by step, then to the next family, then finished', () => {
  const s = { family_no: 1, level: 1 }
  assert.deepEqual(nextAfterPass(s, L('a', 1, 1), 32), { family_no: 1, level: 2 })
  assert.deepEqual(nextAfterPass({ family_no: 1, level: 4 }, L('b', 1, 4), 32), { family_no: 2, level: 1 })
  assert.deepEqual(nextAfterPass({ family_no: 32, level: 4 }, L('c', 32, 4), 32), { family_no: 32, level: 5 })
})

test('re-reading an old step or another family changes nothing', () => {
  const s = { family_no: 2, level: 3 }
  assert.deepEqual(nextAfterPass(s, L('a', 1, 3), 32), s)
  assert.deepEqual(nextAfterPass(s, L('b', 2, 1), 32), s)
})

test('a teacher lesson without a family counts for the student\'s current family', () => {
  assert.deepEqual(nextAfterPass({ family_no: 2, level: 2 }, L('t', null, 2), 32), { family_no: 2, level: 3 })
})

test('lessonFor picks the family lesson, falls back to an own lesson, skips one id', () => {
  const lessons = [L('own2', null, 2), L('an2', 2, 2), L('at2', 1, 2)]
  assert.equal(lessonFor(lessons, { family_no: 2, level: 2 }).id, 'an2')
  assert.equal(lessonFor(lessons, { family_no: 2, level: 2 }, 'an2').id, 'own2')
  assert.equal(lessonFor(lessons, { family_no: 2, level: 5 }), null)
})

test('labels', () => {
  assert.equal(studentLabel({ family_no: 2, level: 1 }, { 2: '-an' }), 'Level 2 · CVC -an · Stage 1 · Words')
  assert.equal(studentLabel({ family_no: 2, level: 5 }, {}), 'All levels done')
})
