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
  displayName: string;
  avatarUrl: string | null;
}

export interface TeamHomeLocation {
  placeName: string;
  address: string;
  latitude: number;
  longitude: number;
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
      displayName: profile?.display_name ?? '멤버',
      avatarUrl: profile?.avatar_url ?? null,
    };
  });
}

export async function updateMemberSkillTag(teamMemberId: string, skillTag: TeamMemberRow['skill_tag']) {
  const { error } = await supabase.from('team_members').update({ skill_tag: skillTag }).eq('id', teamMemberId);
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
