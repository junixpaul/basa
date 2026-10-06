const NO_TEXT = { ok: false, error: "Couldn't find readable text" }
const flat = s => s.replace(/\s+/g, ' ').trim()

// Split extracted text into lesson items for the chosen level.
// ponytail: rule-based split, add an AI step if teachers fix most drafts by hand
export function splitDraft(text, level, language, title) {
  let parts
  if (level === 1) {
    const seen = new Set()
    parts = (text.match(/[\p{L}\p{M}'-]+/gu) ?? []).filter(w => !seen.has(w.toLowerCase()) && seen.add(w.toLowerCase()))
  } else if (level === 2) {
    parts = flat(text).split(/[,;.!?]/).flatMap(chunk => {
      const w = chunk.trim().split(' ').filter(Boolean)
      if (w.length <= 4) return [w.join(' ')]
      return Array.from({ length: Math.ceil(w.length / 3) }, (_, i) => w.slice(i * 3, i * 3 + 3).join(' '))
    })
  } else if (level === 3) {
    parts = flat(text).match(/[^.!?]+[.!?]*/g) ?? []
  } else {
    parts = text.split(/\n\s*\n/).map(flat)
  }
  const items = parts.map(p => p.trim().slice(0, 500)).filter(Boolean).slice(0, 200).map(text => ({ text }))
  return items.length ? { ok: true, draft: { title, level, language, items } } : NO_TEXT
}
