// src/features/team/services/memberProfileService.ts
// 명단 시트 / 팀 분배가 필요한 멤버 필드(position, attendanceRate, role, skillLevel)를
// 한 번에 가져온다. team_members + team_member_stats 뷰를 조인.
import { supabase } from '../../../lib/supabase';
import type { SkillLevel } from '../../../types/database';

export interface MemberProfile {
  id: string; // team_members.id
  userId: string;
  name: string;
  role: 'admin' | 'member';
  position: string | null;
  /** 1 하 / 2 중 / 3 상 — 총무가 설정 */
  skillLevel: SkillLevel;
  /** team_member_stats 뷰에서 계산 (투표 이력 없으면 null) */
  attendanceRate: number | null;
}

export async function fetchMemberProfiles(teamId: string): Promise<MemberProfile[]> {
  // 참석률은 임베드로 못 가져온다.
  //
  // team_member_stats는 집계 뷰라 FK가 없고, PostgREST는 FK가 있어야 관계를 추론한다.
  // 이 뷰를 select 안에 임베드하면 늘 PGRST200 400이 났다 — 즉 이 함수는
  // 여태 한 번도 성공한 적이 없다. 팀 설정의 실력 레벨 목록이 비어 있던 이유다.
  // 두 번 나눠 받아서 JS에서 붙인다.
  const [{ data, error }, { data: stats }] = await Promise.all([
    supabase
      .from('team_members')
      .select('id, user_id, role, position, skill_level, profiles ( display_name )')
      .eq('team_id', teamId)
      .order('role', { ascending: true }),
    supabase.from('team_member_stats').select('team_member_id, attendance_rate').eq('team_id', teamId),
  ]);

  if (error) throw error;

  // 참석률은 부가 정보다 — 뷰가 비어도 명단은 나와야 한다
  const rateOf = new Map((stats ?? []).map((s: any) => [s.team_member_id, s.attendance_rate]));

  return (data ?? []).map((m: any) => ({
    id: m.id,
    userId: m.user_id,
    name: m.profiles?.display_name ?? '멤버',
    role: m.role,
    position: m.position,
    skillLevel: (m.skill_level ?? 2) as SkillLevel,
    attendanceRate: rateOf.get(m.id) ?? null,
  }));
}

/** 총무가 실력 레벨을 바꿀 때 */
export async function updateSkillLevel(teamMemberId: string, level: SkillLevel) {
  const { error } = await supabase.from('team_members').update({ skill_level: level }).eq('id', teamMemberId);
  if (error) throw error;
}

export async function updatePosition(teamMemberId: string, position: string | null) {
  const { error } = await supabase.from('team_members').update({ position }).eq('id', teamMemberId);
  if (error) throw error;
}

/** 부총무 임명 / 해제 */
export async function updateRole(teamMemberId: string, role: 'admin' | 'member') {
  const { error } = await supabase.from('team_members').update({ role }).eq('id', teamMemberId);
  if (error) throw error;
}

// ─────────────────────────────────────────────
// 팀 분배 — 실력 레벨 기준 균형 배분 (2팀 전용 간단 버전)
// 여러 팀(3팀 이상) 분배는 useAssignmentStore.randomize()가 이미 skill_tag 기준으로
// 처리하고 있어서 건드리지 않았다 — 여긴 나중에 skill_level 기반 도구가 필요할 때 쓸 유틸.
// ─────────────────────────────────────────────

export interface BalancedTeams {
  teamA: MemberProfile[];
  teamB: MemberProfile[];
  avgA: number;
  avgB: number;
  /** 평균 차이가 0.3 이하면 "균형 좋음" */
  balanced: boolean;
}

/**
 * 실력 레벨 내림차순으로 정렬한 뒤 뱀 배분(serpentine)으로 나눈다.
 * seed를 바꾸면 같은 레벨 안에서 순서가 섞여 재분배 결과가 달라진다.
 */
export function balanceTeams(members: MemberProfile[], seed = 0): BalancedTeams {
  const shuffled = members
    .map((m, i) => ({ m, k: (i * 7 + seed * 13) % Math.max(1, members.length) }))
    .sort((a, b) => b.m.skillLevel - a.m.skillLevel || a.k - b.k)
    .map((x) => x.m);

  const teamA: MemberProfile[] = [];
  const teamB: MemberProfile[] = [];
  shuffled.forEach((m, i) => {
    // 0,3,4,7… → A / 1,2,5,6… → B (뱀 배분)
    const toA = i % 4 === 0 || i % 4 === 3;
    (toA ? teamA : teamB).push(m);
  });

  const avg = (arr: MemberProfile[]) => (arr.length ? arr.reduce((t, m) => t + m.skillLevel, 0) / arr.length : 0);
  const avgA = avg(teamA);
  const avgB = avg(teamB);

  return { teamA, teamB, avgA, avgB, balanced: Math.abs(avgA - avgB) <= 0.3 };
}

/** UI 문구: "실력 균형 좋음" / "A팀이 조금 강해요" */
export function balanceLabel(b: BalancedTeams) {
  if (b.balanced) return '실력 균형 좋음';
  return b.avgA > b.avgB ? 'A팀이 조금 강해요' : 'B팀이 조금 강해요';
}

export const SKILL_LABEL: Record<SkillLevel, string> = { 3: '상', 2: '중', 1: '하' };

/**
 * 내 표시 이름 변경.
 *
 * profiles.display_name은 팀 전체가 보는 이름이다 — 팀마다 다르게 둘 수 없다.
 * (팀별 별명이 필요해지면 team_members에 별도 컬럼을 두는 게 맞다)
 */
export async function updateDisplayName(userId: string, displayName: string) {
  const { error } = await supabase.from('profiles').update({ display_name: displayName }).eq('id', userId);
  if (error) throw error;
}
