const norm = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '')
const split = s => s.split(/\s+/).filter(Boolean)

// Mark each target word correct if it is part of the longest common subsequence with what was heard.
// ponytail: O(n·m) LCS, fine up to short-story length (~300 words)
export function scoreReading(target, heard) {
  const raw = split(target), t = raw.map(norm), h = split(norm(heard))
  const n = t.length, m = h.length
  if (!n) return { words: [], score: 0 }
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = t[i] === h[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const ok = new Array(n).fill(false)
  for (let i = 0, j = 0; i < n && j < m;) {
    if (t[i] === h[j]) { ok[i] = true; i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++
    else j++
  }
  return { words: raw.map((text, i) => ({ text, ok: ok[i] })), score: ok.filter(Boolean).length / n }
}
