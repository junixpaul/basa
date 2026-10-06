export const LEVELS = { 1: 'Words', 2: 'Phrases', 3: 'Sentences', 4: 'Short Story' }
export const MAX_LEVEL = 5
export const PASS_SCORE = 0.8
// Per-language override, set from the Task 0 Bisaya spike result (e.g. { 'ceb-PH': 0.7 }).
export const PASS_SCORE_BY_LANG = {}
// Recognizer language used when a lesson is Bisaya; set from the Task 0 spike.
export const CEB_LISTEN_LANG = 'fil-PH'
export const passScore = lang => PASS_SCORE_BY_LANG[lang] ?? PASS_SCORE
export const levelLabel = n => (n >= MAX_LEVEL ? 'Finished' : `Level ${n} · ${LEVELS[n]}`)
