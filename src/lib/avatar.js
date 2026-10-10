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
