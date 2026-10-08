export const LEVELS = { 1: 'Words', 2: 'Phrases', 3: 'Sentences', 4: 'Short Story' }
export const MAX_LEVEL = 5
export const PASS_SCORE = 0.8
// Per-language override, set from the Task 0 Bisaya spike result (e.g. { 'ceb-PH': 0.7 }).
export const PASS_SCORE_BY_LANG = {}
// Recognizer language used when a lesson is Bisaya; set from the Task 0 spike.
export const CEB_LISTEN_LANG = 'fil-PH'
export const passScore = lang => PASS_SCORE_BY_LANG[lang] ?? PASS_SCORE
export const levelLabel = n => (n >= MAX_LEVEL ? 'Finished' : `Level ${n} · ${LEVELS[n]}`)

// CVC families: a student's level is a family (Level 1 = -at, Level 2 = -an, ...) and their step inside it
// is Words → Phrases → Sentences → Short Story (students.level 1-4; 5 = every family done).
// `fams` maps family_no → family name, built from the lessons list.
export const familyNames = lessons => Object.fromEntries((lessons ?? []).filter(l => l.family_no).map(l => [l.family_no, l.family]))
export const familyLabel = (no, fams) => `Level ${no}${fams?.[no] ? ` · CVC ${fams[no]}` : ''}`
export const stageLabel = n => n >= MAX_LEVEL ? 'Level complete' : `Stage ${n} · ${LEVELS[n]}`
export const studentLabel = (s, fams) => s.level >= MAX_LEVEL ? 'All levels done' : `${familyLabel(s.family_no, fams)} · ${stageLabel(s.level)}`
// The lesson a student reads next: their family + step; a teacher's own lesson without a family at that step as fallback.
export const lessonFor = (lessons, s, skipId) => s.level >= MAX_LEVEL ? null
  : (lessons ?? []).find(l => l.id !== skipId && l.family_no === s.family_no && l.level === s.level)
    ?? (lessons ?? []).find(l => l.id !== skipId && l.family_no == null && l.level === s.level)
// Where a pass takes the student (mirrors record_attempt, used while offline when the server can't say).
export const nextAfterPass = (s, lesson, lastFamily) => {
  if (s.level >= MAX_LEVEL || lesson.level !== s.level || (lesson.family_no ?? s.family_no) !== s.family_no) return s
  if (s.level < 4) return { ...s, level: s.level + 1 }
  return s.family_no < lastFamily ? { ...s, family_no: s.family_no + 1, level: 1 } : { ...s, level: MAX_LEVEL }
}
