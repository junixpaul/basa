import { supabase } from './supabase.js'

// Profile picture: one file per teacher in their own folder of the existing private bucket (migration 0001 policy covers it).
export async function saveAvatar(userId, file) {
  const path = `${userId}/avatar`
  const up = await supabase.storage.from('lesson-images').upload(path, file, { upsert: true, contentType: file.type })
  if (up.error) throw up.error
  const { error } = await supabase.auth.updateUser({ data: { avatar: path } })
  if (error) throw error
}
export const avatarUrl = async path => (await supabase.storage.from('lesson-images').createSignedUrl(path, 3600)).data?.signedUrl

// The teacher's picture if they added one, else their initials ("Maria Santos" → MS, "pauldo@…" → P).
export async function avatarHtml(user, cls = 'avatar') {
  const m = user?.user_metadata ?? {}
  const pic = m.avatar ? await avatarUrl(m.avatar).catch(() => '') : '' // offline: no URL, initials instead
  if (pic) return `<img class="${cls}" src="${pic.replace(/"/g, '&quot;')}" alt="">`
  const words = (m.name?.trim() || user?.email?.split('@')[0] || '?').split(/\s+/)
  const initials = (words[0][0] + (words.length > 1 ? words.at(-1)[0] : '')).toUpperCase()
  return `<span class="${cls}" aria-hidden="true">${initials.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)}</span>`
}
