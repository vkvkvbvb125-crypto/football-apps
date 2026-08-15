// src/features/settings/services/avatarService.ts — 프로필 사진 업로드
//
// 경로는 항상 `{userId}/파일명`이다. 스토리지 정책이 첫 폴더를 auth.uid()와 대조해
// 남의 사진을 덮어쓰지 못하게 막고 있어서, 이 규칙을 어기면 업로드 자체가 거부된다.
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../../lib/supabase';

/** 갤러리에서 정사각으로 잘라 고른다. 취소하면 null */
export async function pickSquareImage() {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error('사진 접근을 허용해야 바꿀 수 있어요');

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    // 원본 그대로 올리면 몇 MB짜리가 그대로 올라간다 — 아바타는 작아도 충분하다
    quality: 0.6,
  });
  return result.canceled ? null : result.assets[0];
}

/**
 * 고른 이미지를 올리고 공개 URL을 돌려준다.
 *
 * 파일 이름에 시각을 붙인다 — 같은 이름으로 덮어쓰면 CDN 캐시 때문에 한동안 옛 사진이
 * 그대로 보인다. 새 이름으로 올리고 profiles.avatar_url을 바꾸는 편이 확실하다.
 */
export async function uploadAvatar(userId: string, uri: string) {
  const response = await fetch(uri);
  const blob = await response.blob();
  const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  const path = `${userId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from('avatars').upload(path, blob, {
    contentType: blob.type || 'image/jpeg',
  });
  if (error) throw error;

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl;
}

/** 업로드 후 프로필에 반영. url이 null이면 사진 삭제 */
export async function setAvatarUrl(userId: string, url: string | null) {
  const { error } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId);
  if (error) throw error;
}

/**
 * 팀 로고 업로드 → teams.logo_url.
 *
 * 버킷이 아바타와 다르다 — 정책이 "내 uid 폴더"가 아니라 "내가 총무인 팀 폴더"를 본다.
 * 총무가 아니면 업로드 단계에서 거부된다(화면에서도 막지만 그것만 믿지 않는다).
 */
export async function uploadTeamLogo(teamId: string, uri: string) {
  const response = await fetch(uri);
  const blob = await response.blob();
  const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  const path = `${teamId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from('team-logos').upload(path, blob, {
    contentType: blob.type || 'image/jpeg',
  });
  if (error) throw error;

  const { data } = supabase.storage.from('team-logos').getPublicUrl(path);
  const { error: updateError } = await supabase.from('teams').update({ logo_url: data.publicUrl }).eq('id', teamId);
  if (updateError) throw updateError;
  return data.publicUrl;
}

/** 로고 내리기 — 파일은 남기고 연결만 끊는다(아바타와 같은 이유) */
export async function clearTeamLogo(teamId: string) {
  const { error } = await supabase.from('teams').update({ logo_url: null }).eq('id', teamId);
  if (error) throw error;
}

/** 연락처·주발 — 팀이 달라져도 그대로인 값이라 profiles에 있다 */
export async function updateProfileFields(
  userId: string,
  fields: { phone?: string | null; dominantFoot?: 'left' | 'right' | 'both' | null }
) {
  const patch: { phone?: string | null; dominant_foot?: string | null } = {};
  if ('phone' in fields) patch.phone = fields.phone ?? null;
  if ('dominantFoot' in fields) patch.dominant_foot = fields.dominantFoot ?? null;
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
  if (error) throw error;
}
