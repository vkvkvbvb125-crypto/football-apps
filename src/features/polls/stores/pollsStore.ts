import { create } from 'zustand';
import { useTeamStore } from '../../team/stores/teamStore';
import {
  castPollVote as castPollVoteRequest,
  createPoll as createPollRequest,
  deletePoll as deletePollRequest,
  fetchPolls,
  type PollWithResponses,
} from '../services/pollsService';
import { toUserMessage } from '../../../lib/dbError';

interface PollsState {
  polls: PollWithResponses[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
  loadPolls: () => Promise<void>;
  createPoll: (input: { question: string; options: string[]; deadline: string | null }) => Promise<void>;
  deletePoll: (id: string) => Promise<void>;
  vote: (pollId: string, optionIndex: number) => Promise<void>;
}

export const usePollsStore = create<PollsState>((set, get) => ({
  polls: [],
  loaded: false,
  loading: false,
  error: null,
  loadPolls: async () => {
    const activeTeam = useTeamStore.getState().activeTeam;
    if (!activeTeam) return;
    set({ loading: true, error: null });
    try {
      const polls = await fetchPolls(activeTeam.team.id);
      set({ polls, loaded: true });
    } catch (err) {
      set({ error: toUserMessage(err, {}, 'loadPolls'), loaded: true });
    } finally {
      set({ loading: false });
    }
  },
  createPoll: async (input) => {
    const activeTeam = useTeamStore.getState().activeTeam;
    if (!activeTeam) return;
    set({ loading: true, error: null });
    try {
      await createPollRequest({ ...input, teamId: activeTeam.team.id, authorId: activeTeam.membershipId });
      await get().loadPolls();
    } catch (err) {
      set({ error: toUserMessage(err, { '23505': '같은 투표가 이미 있어요' }, 'createPoll'), loading: false });
    }
  },
  deletePoll: async (id) => {
    set({ loading: true, error: null });
    try {
      await deletePollRequest(id);
      await get().loadPolls();
    } catch (err) {
      set({ error: toUserMessage(err, {}, 'deletePoll'), loading: false });
    }
  },
  vote: async (pollId, optionIndex) => {
    const activeTeam = useTeamStore.getState().activeTeam;
    if (!activeTeam) return;
    try {
      await castPollVoteRequest(pollId, activeTeam.membershipId, optionIndex);
      await get().loadPolls();
    } catch (err) {
      set({ error: toUserMessage(err, { '23505': '이미 투표하셨어요' }, 'vote') });
    }
  },
}));
