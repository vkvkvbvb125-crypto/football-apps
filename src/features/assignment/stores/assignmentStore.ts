import { create } from 'zustand';
import { useAttendanceStore } from '../../attendance/stores/attendanceStore';
import { updateMatchTeamCount } from '../../attendance/services/attendanceService';
import { useTeamStore } from '../../team/stores/teamStore';
import { fetchAssignments, groupLabelsFor, saveAssignments, updateAssignment } from '../services/assignmentService';
import type { Database } from '../../../types/database';

type AssignmentRow = Database['public']['Tables']['team_assignments']['Row'];

interface AssignmentState {
  assignments: AssignmentRow[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
  loadAssignments: () => Promise<void>;
  /** includeAll: 참석 투표를 무시하고 팀원 전체로 나눈다 (총무가 화면에서 고른 경우) */
  randomize: (matchId: string, includeAll?: boolean) => Promise<void>;
  moveMember: (matchId: string, teamMemberId: string) => Promise<void>;
  addGroup: (matchId: string) => Promise<void>;
  removeLastGroup: (matchId: string) => Promise<void>;
}

const SKILL_BUCKET_ORDER = ['상', '중', '하', '미지정'] as const;

export const useAssignmentStore = create<AssignmentState>((set, get) => ({
  assignments: [],
  loaded: false,
  loading: false,
  error: null,
  loadAssignments: async () => {
    const matchIds = useAttendanceStore.getState().matches.map((m) => m.id);
    set({ loading: true, error: null });
    try {
      const assignments = await fetchAssignments(matchIds);
      set({ assignments, loaded: true });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '팀분배를 불러오지 못했습니다.', loaded: true });
    } finally {
      set({ loading: false });
    }
  },
  randomize: async (matchId, includeAll = false) => {
    const match = useAttendanceStore.getState().matches.find((m) => m.id === matchId);
    const members = useTeamStore.getState().members;

    /**
     * 기본은 "참석"을 찍은 사람만 나눈다.
     *
     * includeAll은 총무가 화면에서 직접 고른 경우다 — 급하게 잡힌 경기라 투표가 없거나,
     * 투표와 상관없이 나오는 팀이 있다. 몰래 전원을 끼워 넣지는 않는다.
     * 안 온다고 찍은 사람(absent)은 그때도 뺀다 — 명시적으로 안 온다고 했다.
     */
    const attendeeIds = includeAll
      ? members
          .filter((m) => !match?.votes.some((v) => v.team_member_id === m.id && v.status === 'absent'))
          .map((m) => m.id)
      : (match?.votes ?? []).filter((v) => v.status === 'attend').map((v) => v.team_member_id);

    const buckets: Record<(typeof SKILL_BUCKET_ORDER)[number], string[]> = {
      상: [],
      중: [],
      하: [],
      미지정: [],
    };
    attendeeIds.forEach((teamMemberId) => {
      const skillTag = members.find((m) => m.id === teamMemberId)?.skillTag;
      buckets[skillTag ?? '미지정'].push(teamMemberId);
    });
    SKILL_BUCKET_ORDER.forEach((key) => {
      buckets[key] = [...buckets[key]].sort(() => Math.random() - 0.5);
    });

    const teamCount = match?.team_count ?? 2;
    const labels = groupLabelsFor(teamCount);
    const assignments: { teamMemberId: string; groupLabel: string }[] = [];
    SKILL_BUCKET_ORDER.forEach((key) => {
      buckets[key].forEach((teamMemberId, i) => {
        assignments.push({ teamMemberId, groupLabel: labels[i % teamCount] });
      });
    });

    set({ loading: true, error: null });
    try {
      await saveAssignments(matchId, assignments);
      await get().loadAssignments();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '팀분배에 실패했습니다.', loading: false });
    }
  },
  moveMember: async (matchId, teamMemberId) => {
    const match = useAttendanceStore.getState().matches.find((m) => m.id === matchId);
    const labels = groupLabelsFor(match?.team_count ?? 2);
    const current = get().assignments.find((a) => a.match_id === matchId && a.team_member_id === teamMemberId);
    const currentIndex = current ? labels.indexOf(current.group_label) : -1;
    const nextLabel = labels[(currentIndex + 1) % labels.length];
    try {
      await updateAssignment(matchId, teamMemberId, nextLabel);
      await get().loadAssignments();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '조정에 실패했습니다.' });
    }
  },
  addGroup: async (matchId) => {
    const match = useAttendanceStore.getState().matches.find((m) => m.id === matchId);
    if (!match || match.team_count >= 5) return;
    try {
      await updateMatchTeamCount(matchId, match.team_count + 1);
      await useAttendanceStore.getState().loadMatches();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '팀 추가에 실패했습니다.' });
    }
  },
  removeLastGroup: async (matchId) => {
    const match = useAttendanceStore.getState().matches.find((m) => m.id === matchId);
    if (!match || match.team_count <= 2) return;
    const labels = groupLabelsFor(match.team_count);
    const lastLabel = labels[labels.length - 1];
    const prevLabel = labels[labels.length - 2];
    const membersInLastGroup = get().assignments.filter(
      (a) => a.match_id === matchId && a.group_label === lastLabel
    );

    set({ loading: true, error: null });
    try {
      for (const a of membersInLastGroup) {
        await updateAssignment(matchId, a.team_member_id, prevLabel);
      }
      await updateMatchTeamCount(matchId, match.team_count - 1);
      await useAttendanceStore.getState().loadMatches();
      await get().loadAssignments();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '팀 삭제에 실패했습니다.', loading: false });
    }
  },
}));
