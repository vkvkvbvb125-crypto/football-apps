import { supabase } from '../../../lib/supabase';
import type { Database } from '../../../types/database';

type TeamMemberRow = Database['public']['Tables']['team_members']['Row'];
type TeamRow = Database['public']['Tables']['teams']['Row'];

export interface TeamMembership {
  membershipId: string;
  role: TeamMemberRow['role'];
  team: TeamRow;
}

export async function fetchMyMemberships(): Promise<TeamMembership[]> {
  const { data: memberships, error } = await supabase
    .from('team_members')
    .select('*')
    .order('joined_at', { ascending: true });
  if (error) throw error;
  if (!memberships || memberships.length === 0) return [];

  const teamIds = memberships.map((m) => m.team_id);
  const { data: teams, error: teamsError } = await supabase.from('teams').select('*').in('id', teamIds);
  if (teamsError) throw teamsError;

  const teamsById = new Map((teams ?? []).map((t) => [t.id, t]));
  return memberships
    .map((m) => {
      const team = teamsById.get(m.team_id);
      if (!team) return null;
      return { membershipId: m.id, role: m.role, team };
    })
    .filter((m): m is TeamMembership => m !== null);
}

export async function createTeam(name: string) {
  const { data, error } = await supabase.rpc('create_team', { p_name: name });
  if (error) throw error;
  return data;
}

export async function joinTeamByInvite(inviteCode: string) {
  const { data, error } = await supabase.rpc('join_team_by_invite', { p_invite_code: inviteCode });
  if (error) throw error;
  return data;
}

export interface TeamMemberWithProfile {
  id: string;
  userId: string;
  role: TeamMemberRow['role'];
  skillTag: TeamMemberRow['skill_tag'];
  /** 선호 포지션 — 팀 분배 포메이션이 이 값을 쓴다 */
  position: string | null;
  /** 팀 안에서만 유일한 등번호 (0~999). 안 정했으면 null */
  jerseyNumber: number | null;
  /** 알림 설정 — 이 팀에서 받을 알림 종류 */
  notifyNewMatch: boolean;
  notifyAnnouncement: boolean;
  notifyDeadline: boolean;
  displayName: string;
  avatarUrl: string | null;
  phone: string | null;
  dominantFoot: string | null;
}

export interface TeamHomeLocation {
  placeName: string;
  address: string;
  latitude: number;
  longitude: number;
}

/** 팀 슬로건 — 헤더에 한 줄로 보인다. 비우면 null로 저장해 자리 자체를 없앤다 */
export async function updateTeamSlogan(teamId: string, slogan: string | null) {
  const { error } = await supabase.from('teams').update({ slogan }).eq('id', teamId);
  if (error) throw error;
}

export async function updateTeamHomeLocation(teamId: string, location: TeamHomeLocation) {
  const { error } = await supabase
    .from('teams')
    .update({
      home_place_name: location.placeName,
      home_address: location.address,
      home_latitude: location.latitude,
      home_longitude: location.longitude,
    })
    .eq('id', teamId);
  if (error) throw error;
}

export async function fetchTeamMembers(teamId: string): Promise<TeamMemberWithProfile[]> {
  const { data: members, error } = await supabase.from('team_members').select('*').eq('team_id', teamId);
  if (error) throw error;
  if (!members || members.length === 0) return [];

  const userIds = members.map((m) => m.user_id);
  const { data: profiles, error: profilesError } = await supabase.from('profiles').select('*').in('id', userIds);
  if (profilesError) throw profilesError;

  const profilesById = new Map((profiles ?? []).map((p) => [p.id, p]));
  return members.map((m) => {
    const profile = profilesById.get(m.user_id);
    return {
      id: m.id,
      userId: m.user_id,
      role: m.role,
      skillTag: m.skill_tag,
      position: m.position ?? null,
      jerseyNumber: m.jersey_number ?? null,
      notifyNewMatch: m.notify_new_match ?? true,
      notifyAnnouncement: m.notify_announcement ?? true,
      notifyDeadline: m.notify_deadline ?? true,
      displayName: profile?.display_name ?? '멤버',
      avatarUrl: profile?.avatar_url ?? null,
      phone: profile?.phone ?? null,
      dominantFoot: profile?.dominant_foot ?? null,
    };
  });
}

export async function updateMemberSkillTag(teamMemberId: string, skillTag: TeamMemberRow['skill_tag']) {
  const { error } = await supabase.from('team_members').update({ skill_tag: skillTag }).eq('id', teamMemberId);
  if (error) throw error;
}

/** 선호 포지션 — team_members.position(text). 값은 features/team/positions.ts가 정한다 */
export async function updateMemberPosition(teamMemberId: string, position: string | null) {
  const { error } = await supabase.from('team_members').update({ position }).eq('id', teamMemberId);
  if (error) throw error;
}

/** 등번호 — 팀 안에서 중복되면 DB 유니크 인덱스가 막는다 */
export async function updateMemberJersey(teamMemberId: string, jerseyNumber: number | null) {
  const { error } = await supabase.from('team_members').update({ jersey_number: jerseyNumber }).eq('id', teamMemberId);
  if (error) throw error;
}

/**
 * 알림 설정 한 항목 켜기/끄기.
 *
 * 컬럼 이름을 string으로 받으면 오타가 그대로 나가 조용히 실패한다 —
 * 실제 컬럼 셋으로 좁혀 컴파일 때 걸리게 한다.
 */
export type NotifyPrefColumn = 'notify_new_match' | 'notify_announcement' | 'notify_deadline';

export async function updateNotifyPref(teamMemberId: string, column: NotifyPrefColumn, value: boolean) {
  const { error } = await supabase
    .from('team_members')
    .update({ [column]: value } as Record<NotifyPrefColumn, boolean>)
    .eq('id', teamMemberId);
  if (error) throw error;
}

export async function updateMemberRole(teamMemberId: string, role: TeamMemberRow['role']) {
  const { error } = await supabase.from('team_members').update({ role }).eq('id', teamMemberId);
  if (error) throw error;
}

export async function removeMember(teamMemberId: string) {
  const { error } = await supabase.from('team_members').delete().eq('id', teamMemberId);
  if (error) throw error;
}
