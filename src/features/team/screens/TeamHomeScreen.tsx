// src/features/team/screens/TeamHomeScreen.tsx — 팀 화면 간결화판
// 기존 기능은 100% 유지: 공지 CRUD, 멤버 관리(강퇴/부총무/실력), 투표, 팀 대표 지역, 로그아웃.
//
// ⚠ 수정 요약 (승인된 간결화 반영):
// 1) 카드 2개를 배너로 흡수 — 초대 코드는 배너 하단 바로, 엠블럼 설정은 연필 배지로만.
//    (독립 "팀 엠블럼 설정" 카드 + "초대 코드" 카드를 없앴다 → 총무 화면에서 카드 2개 감소)
// 2) 다른 탭과 동일하게 TabHeader를 붙였다 — 기존 marginTop:60 하드코딩 제거.
// 3) 로그아웃은 배너 안이 아니라 화면 맨 아래로 (파괴적 액션은 상단에 두지 않는다).
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../../components/nativeText';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useAuthStore } from '../../auth/stores/authStore';
import { useTeamStore } from '../stores/teamStore';
import { useAttendanceStore } from '../../attendance/stores/attendanceStore';
import { useSettlementStore } from '../../settlement/stores/settlementStore';
import { useAnnouncementsStore } from '../../announcements/stores/announcementsStore';
import { liveMatchesFrom } from '../../attendance/utils/matchWindow';
import { WEEKDAYS } from '../weekdays';
import { fetchRecentPosts, type RecentPost } from '../../board/services/boardService';
import { AnnouncementFormModal } from '../../announcements/components/AnnouncementFormModal';
import { AnnouncementListModal } from '../../announcements/components/AnnouncementListModal';
import { AnnouncementDetailModal } from '../../announcements/components/AnnouncementDetailModal';
import type { AnnouncementRow } from '../../announcements/services/announcementsService';
import { MemberListModal } from '../components/MemberListModal';
import { TeamSwitchSheet } from '../components/TeamSwitchSheet';
import { TeamHomeTab } from '../components/TeamHomeTab';
import { TeamMembersTab } from '../components/TeamMembersTab';
import { TeamNoticesTab } from '../components/TeamNoticesTab';
import { TeamBoardTab } from '../components/TeamBoardTab';
import { InviteSheet } from '../components/InviteSheet';
import { regularLabel } from '../weekdays';
import { fetchTeamSettings } from '../services/teamSettingsService';
import { relativeTime } from '../../../lib/relativeTime';
import { usePollsStore } from '../../polls/stores/pollsStore';
import { PollFormModal } from '../../polls/components/PollFormModal';
import { PollCard } from '../../polls/components/PollCard';
import { ScreenGradient, useTabBarPadding } from '../../../components/ScreenGradient';
import { alertMessage, confirmAction } from '../../../components/Dialog';
import { TabHeader } from '../../../components/TabHeader';
import { RowCard } from '../../../components/Surface';
import {
  monthlyAttendanceRate,
  lastMonthAttendanceRate,
  memberAttendanceRate,
  formatRecentAttendance,
} from '../../attendance/utils/attendanceRate';
import { PlaceSearchModal } from '../../attendance/components/PlaceSearchModal';
import type { PlaceResult } from '../../attendance/services/placeService';
import { font, radius, shadow, type Palette } from '../../../theme';
import { useThemed } from '../../../lib/useThemed';
import { clearTeamLogo, pickSquareImage, uploadTeamLogo } from '../../settings/services/avatarService';
import { toUserMessage } from '../../../lib/dbError';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;

/** teams.skill_level — CHECK 제약과 같은 세 값 */
const TEAM_SKILL_LABEL = { beginner: '입문', intermediate: '중급', advanced: '상급' } as const;


export function TeamHomeScreen({ navigation, route }: any) {
  const { colors, styles } = useThemed(makeStyles);
  const bottomPad = useTabBarPadding();
  const activeTeam = useTeamStore((s) => s.activeTeam);
  const myUserId = useAuthStore((s) => s.session?.user.id);
  const updateHomeLocation = useTeamStore((s) => s.updateHomeLocation);
  const members = useTeamStore((s) => s.members);
  const loadMembers = useTeamStore((s) => s.loadMembers);
  const updateMemberSkillTag = useTeamStore((s) => s.updateMemberSkillTag);
  const updateMemberPosition = useTeamStore((s) => s.updateMemberPosition);
  const updateSlogan = useTeamStore((s) => s.updateSlogan);
  const promoteToAdmin = useTeamStore((s) => s.promoteToAdmin);
  const removeMember = useTeamStore((s) => s.removeMember);
  const updateNotifyPref = useTeamStore((s) => s.updateNotifyPref);
  const loadMemberships = useTeamStore((s) => s.loadMemberships);
  const matches = useAttendanceStore((s) => s.matches);
  const settlementCurrent = useSettlementStore((s) => s.current);
  const settlementPast = useSettlementStore((s) => s.past);
  const loadMatches = useAttendanceStore((s) => s.loadMatches);

  const [memberListVisible, setMemberListVisible] = useState(false);
  const [teamSwitchVisible, setTeamSwitchVisible] = useState(false);
  const memberships = useTeamStore((s) => s.memberships);
  const setActiveTeam = useTeamStore((s) => s.setActiveTeam);
  /* 팀이 하나면 고를 게 없다 — 셰브론도 시트도 없이 지금 동작 그대로다 */
  const hasMultipleTeams = memberships.length > 1;
  const [copied, setCopied] = useState(false);
  /** 팀 탭 안의 네 화면. 총무·팀원 모두 같은 탭을 쓰고, 안에서 할 수 있는 일만 달라진다.
      route.params.tab으로 열 화면을 지정한다 — 탈퇴 안내의 「총무 넘기러 가기」와
      알림 라우팅(공지 → notices, 언급·댓글 → board)이 쓴다. 없으면 홈이다. */
  const [tab, setTab] = useState<'home' | 'members' | 'notices' | 'board'>(
    route?.params?.tab ?? 'home',
  );
  const [memberQuery, setMemberQuery] = useState('');
  const [logoUploading, setLogoUploading] = useState(false);

  /*
    ⚠ **초기값만으로는 안 된다.** 위 useState는 이 화면이 **처음 마운트될 때** 한 번만
      읽는다. 그런데 팀은 하단 탭이라 한 번 열리면 계속 살아 있어서, 두 번째부터
      들어오는 파라미터는 아무 일도 안 일으킨다.

      실제로 그랬다 — 탈퇴 안내의 「총무 넘기러 가기」가 팀 화면을 이미 본 뒤에는
      멤버 칸을 안 열었다. 그 자리는 같은 날 `navigate`를 `popTo`로 고친 참이었는데,
      **스택은 안 쌓이게 됐지만 파라미터는 여전히 안 먹었다.** 고장이 둘이었고
      하나만 고친 상태가 「고쳤는데 여전히 안 된다」로 보였다.

      ⚠ 초기값을 남겨 둔 이유: effect는 그려진 뒤에 돌아서, 초기값이 없으면 첫 프레임에
        홈 칸이 한 번 번쩍인다. 둘 다 있는 것이 맞다 — 초기값은 첫 마운트, effect는 그 뒤.

      규칙: **route.params는 effect로 받는다.** useState 초기값은 첫 마운트용 보조다.
      (같은 패턴을 AttendanceScreen의 focusDate와 SettlementScreen의 openSettlementId가
       이미 effect로 받고 있다 — 훑어서 확인했고, 깨져 있던 것은 이 화면뿐이었다.)
    ⚠ 소비했으면 지운다. 남겨두면 홈 칸으로 옮겨도 다시 끌려온다.
  */
  const paramTab = route?.params?.tab as 'home' | 'members' | 'notices' | 'board' | undefined;
  useEffect(() => {
    if (!paramTab) return;
    setTab(paramTab);
    navigation.setParams({ tab: undefined });
  }, [paramTab]);

  /* 팀을 바꾸면 홈으로 되돌린다. 멤버 탭에 서서 팀을 바꾸면 제목만 바뀐 채
     「멤버 관리」에 남아, 방금 무엇이 바뀐 건지 안 보인다 */
  useEffect(() => {
    setTab('home');
  }, [activeTeam?.team.id]);
  // 정기 일정은 teams가 아니라 team_settings에 있다 — 배열이라 「매주 화·목」이 되고,
  // teams에 단일 int로 또 두면 같은 뜻의 저장소가 둘이 된다. SettlementScreen도
  // 같은 식으로 화면에서 직접 읽는다.
  const [regular, setRegular] = useState<string | null>(null);
  const [inviteVisible, setInviteVisible] = useState(false);
  const [sloganEditing, setSloganEditing] = useState(false);
  const [sloganText, setSloganText] = useState('');
  /*
    최근 게시글 — 카드가 쓸 요약 셋.

    이 자리에 「팀 홈 미리보기용 최근 글 2개」라는 state가 남아 있었다. 게시판을
    화면에서 걷어낼 때 그 state만 안 지워졌고, 이후 아무도 set 하지도 읽지도 않았다 —
    죽은 함수 셋(nextPromotion · attendButtonLabel · markAnnouncementsRead)과 같은
    종류다. 되살리면서 그 자리를 대체한다.

    작성자 이름은 이미 들고 있는 멤버 목록에서 찾는다. profiles를 또 읽으면 왕복이
    하나 더 드는데 그 값이 화면에 이미 있다(BoardPanel도 같은 방식이다).

    ⚠ 훅은 전부 `if (!activeTeam) return null` 위에 있어야 한다(이 파일 머리말).
      그래서 activeTeam은 옵셔널 체이닝으로 읽고, 팀이 없으면 효과가 아무것도 안 한다.
  */
  const nameByUserId = useMemo(
    () => new Map(members.map((m) => [m.userId, m.displayName])),
    [members],
  );
  const [recentPosts, setRecentPosts] = useState<RecentPost[]>([]);
  const recentTeamId = activeTeam?.team.id;
  useEffect(() => {
    if (!recentTeamId) return;
    let cancelled = false;
    void (async () => {
      try {
        const rows = await fetchRecentPosts(recentTeamId, 3, nameByUserId);
        if (!cancelled) setRecentPosts(rows);
      } catch {
        // 카드가 비는 것으로 끝난다 — 게시판 탭은 자기 오류를 자기가 말한다
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [recentTeamId, nameByUserId]);

  const announcements = useAnnouncementsStore((s) => s.announcements);
  const announcementsLoaded = useAnnouncementsStore((s) => s.loaded);
  const loadAnnouncements = useAnnouncementsStore((s) => s.loadAnnouncements);
  const myReadIds = useAnnouncementsStore((s) => s.myReadIds);
  const loadMyReads = useAnnouncementsStore((s) => s.loadMyReads);
  const markAnnouncementsRead = useAnnouncementsStore((s) => s.markRead);
  const createAnnouncement = useAnnouncementsStore((s) => s.createAnnouncement);
  const updateAnnouncement = useAnnouncementsStore((s) => s.updateAnnouncement);
  const deleteAnnouncement = useAnnouncementsStore((s) => s.deleteAnnouncement);

  /*
    안 읽은 공지가 있는가 — 팀 홈 「공지사항」 타일의 붉은 점.

    announcement_reads 표는 처음부터 있었는데 **읽는 쪽도 쓰는 쪽도 없었다.**
    markAnnouncementsRead는 만들어 두고 호출자가 0이었고(작성자 제외 로직까지 들어
    있는 채로), 스토어는 총무용 집계(readCounts)만 들고 있었다.

    그래서 점 하나를 붙이는 데 세 가지가 같이 필요하다:
      ① 내가 읽은 id를 읽어오는 조회      (loadMyReads)
      ② 목록을 실제로 볼 때 읽음을 남기는 곳 (아래 notices 탭 진입)
      ③ 그 둘의 차                          (여기)
    ②가 없으면 점이 영원히 켜져 있고, ①이 없으면 켤지 말지를 모른다.

    내가 쓴 공지는 안 센다 — markAnnouncementsRead가 작성자를 제외하므로 읽음 기록이
    영영 안 생기고, 그러면 총무는 자기 공지 때문에 점이 안 꺼진다.
  */
  const hasUnreadNotice = announcements.some(
    (a) => a.author_id !== activeTeam?.membershipId && !myReadIds.has(a.id),
  );

  useEffect(() => {
    if (announcements.length > 0) void loadMyReads();
  }, [announcements.length]);

  // 목록을 여는 것이 읽는 것이다 — 그 화면에 도착하면 남긴다
  useEffect(() => {
    if (tab === 'notices' && announcements.length > 0) void markAnnouncementsRead(announcements);
  }, [tab, announcements.length]);

  const [formVisible, setFormVisible] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<AnnouncementRow | null>(null);
  const [listVisible, setListVisible] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<AnnouncementRow | null>(null);

  /*
    공지 알림에서 넘어왔다 — 그 공지를 편다.

    ⚠ 목록이 아직 안 불렸을 수 있어서 id를 들고 기다린다. 정산이 detailTarget만
      세워두고 로드가 끝나면 뜨는 것과 같은 모양이다(SettlementScreen:145).
    ⚠ **못 찾으면 그냥 접는다.** 지워진 공지면 모달이 안 뜨고 공지 목록만 남는다 —
      「없어졌어요」를 띄우지 않는다. 정산이 같은 자리에서 그렇게 하고, 목록에 그
      공지가 없다는 것이 이미 답이다.
  */
  const openAnnouncementId = route?.params?.openAnnouncementId as string | undefined;
  const [pendingAnnouncementId, setPendingAnnouncementId] = useState<string | null>(null);
  useEffect(() => {
    if (!openAnnouncementId) return;
    setPendingAnnouncementId(openAnnouncementId);
    navigation.setParams({ openAnnouncementId: undefined });
  }, [openAnnouncementId]);
  useEffect(() => {
    if (!pendingAnnouncementId || !announcementsLoaded) return;
    const found = announcements.find((a) => a.id === pendingAnnouncementId);
    if (found) setSelectedAnnouncement(found);
    setPendingAnnouncementId(null);
  }, [pendingAnnouncementId, announcementsLoaded, announcements]);


  const polls = usePollsStore((s) => s.polls);
  const loadPolls = usePollsStore((s) => s.loadPolls);
  const createPoll = usePollsStore((s) => s.createPoll);
  const deletePoll = usePollsStore((s) => s.deletePoll);
  const votePoll = usePollsStore((s) => s.vote);
  const [pollFormVisible, setPollFormVisible] = useState(false);

  useEffect(() => {
    if (!activeTeam) return;
    loadAnnouncements();
    loadMembers();
    loadPolls();
    // 아래 「다음 경기」 카드가 쓴다 — 일정 탭을 한 번도 안 들렀으면 비어 있다
    loadMatches();
    fetchTeamSettings(activeTeam.team.id)
      .then((st) => setRegular(regularLabel(st?.defaultWeekdays, st?.defaultTime)))
      .catch(() => setRegular(null)); // 프로필 줄의 한 조각이라 실패하면 그 조각만 빠진다
    /* 최근 글은 위 전용 효과가 좁은 조회로 가져온다 — 여기서 fetchPosts를 부르던
       것을 뺐다. 그건 왕복 다섯(posts + likes + comments + profiles + pins)을 쓰고
       2개만 남긴 뒤, 그 2개를 그리는 화면이 없어진 뒤에도 계속 돌고 있었다. */
  }, [activeTeam?.team.id, myUserId]);

  const confirm = (title: string, message: string, onYes: () => void, confirmLabel = '삭제') => {
    confirmAction({ title, message, confirmLabel, destructive: true }).then((ok) => {
      if (ok) onYes();
    });
  };

  if (!activeTeam) return null;

  const isAdmin = activeTeam.role === 'admin';
  const me = members.find((m) => m.id === activeTeam.membershipId) ?? null;
  const inviteUrl = `${SUPABASE_URL}/functions/v1/invite-redirect?code=${activeTeam.team.invite_code}`;
  /*
   * 「7248-6805」 — 8자리를 연속으로 두면 읽다가 자리를 놓친다.
   * 전화로 불러 주거나 눈으로 옮겨 적는 값이라 네 자리씩 끊는다.
   * 복사·링크에는 원본을 쓴다 — 하이픈이 섞이면 서버가 못 찾는다.
   */
  const inviteCodeDisplay = activeTeam.team.invite_code.replace(/(.{4})(?=.)/g, '$1-');
  const createdAt = new Date(activeTeam.team.created_at ?? Date.now());

  /*
    팀 프로필 한 줄 — 「서울 강남구 · 매주 수요일 20:00 · 평균 12명 · 중급」

    있는 조각만 잇는다. 빈 항목을 「미설정」으로 채우면 줄이 정보가 아니라 빈칸
    목록이 되고, 팀원에게는 고칠 수도 없는 빈칸이라 알려줄 이유가 없다.

    자리는 bannerRow 밖 전체 폭이다 — 로고 오른쪽 칸은 팀명이 길어지면 좁아져서
    28자짜리 줄이 잘린다. 이 파일이 이미 지표를 같은 이유로 아래로 뺐다.
  */
  const profileBits = [
    activeTeam.team.region_label,
    regular,
    activeTeam.team.avg_headcount ? `평균 ${activeTeam.team.avg_headcount}명` : null,
    activeTeam.team.skill_level ? TEAM_SKILL_LABEL[activeTeam.team.skill_level] : null,
  ].filter(Boolean);

  const handleCopyInviteCode = async () => {
    await Clipboard.setStringAsync(activeTeam.team.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  /*
    초대 진입 셋(홈 블록 / 얇은 바 / 멤버 목록 끝 행)이 전부 이걸 부른다.

    예전엔 여기서 Share.share를 바로 열었다. QR을 놓을 자리가 없었고, 무엇보다
    QR은 대면용인데 Share는 원격 공유라 — 눈앞의 사람에게 화면을 보여주려는
    총무가 시스템 공유 시트를 먼저 통과해야 했다. 시트로 모아 「보낼지 /
    보여줄지」를 그 자리에서 고르게 한다.
  */
  const openInvite = () => setInviteVisible(true);

  const handleSaveSlogan = async () => {
    const trimmed = sloganText.trim();
    setSloganEditing(false);
    // 빈 문자열 대신 null — "빈 슬로건"과 "안 정함"을 굳이 구분할 이유가 없다
    await updateSlogan(trimmed || null);
  };

  const handlePickEmblem = async () => {
    if (!isAdmin) return;
    try {
      const asset = await pickSquareImage();
      if (!asset) return;
      setLogoUploading(true);
      await uploadTeamLogo(activeTeam.team.id, asset.uri);
      await loadMemberships(); // teams 행이 바뀌었으니 활성 팀 정보를 다시 읽는다
    } catch (err) {
      alertMessage('저장 실패', toUserMessage(err, {}, 'uploadTeamLogo'));
    } finally {
      setLogoUploading(false);
    }
  };

  const handleClearEmblem = () =>
    confirm('팀 로고', '로고를 지울까요? 다시 이니셜로 보여요.', async () => {
      await clearTeamLogo(activeTeam.team.id);
      await loadMemberships();
    }, '지우기');

  const emblemInitials = activeTeam.team.name.replace(/\s/g, '').slice(0, 2).toUpperCase();
  /*
    다음 경기 — 킥오프 3시간 뒤까지는 「다음」으로 본다.

    이 식이 3 * 60 * 60 * 1000을 손으로 들고 있었다. matchWindow.ts로 유예를 모을 때
    AssingmentScreen·HomeScreen의 **이름 붙은 상수** 둘만 잡혔고, 여기는 인라인이라
    검색에 안 걸렸다 — 「사본이 둘인 줄 알았는데 셋이었다」가 이 자리다.
  */
  const nextMatch = liveMatchesFrom(matches)[0] ?? null;
  const attendCount = nextMatch?.votes.filter((v) => v.status === 'attend').length ?? 0;
  /** 오늘 0시 기준 남은 날 — 시각까지 빼면 저녁 경기가 "D-0"과 "D-1"을 오간다 */
  const daysUntil = nextMatch
    ? Math.round(
        (new Date(nextMatch.match_date).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000
      )
    : 0;

  /*
   * 팀 홈은 멤버 전원을 보여준다.
   *
   * slice(0, 5)였다. 여섯 번째부터는 「전체 보기 ›」로 다른 화면에 가야 했는데,
   * 팀 화면에서 끝나는 일이 하나도 없던 원인 중 하나다. 20~30명이어도 그냥 스크롤한다 —
   * 이 화면의 주인공이 멤버라면 명단이 여기서 끝나야 한다.
   */
  const visibleMembers =
    tab === 'members'
      ? members.filter((m) => m.displayName.toLowerCase().includes(memberQuery.trim().toLowerCase()))
      : members;

  /*
   * 팀 참석률(이번 달) — 홈 통계와 같은 함수. 두 화면이 따로 계산하면 값이 갈린다.
   * 개인 참석률(최근 3개월)은 멤버 행마다 따로 낸다 — 기간이 다른 건 의도다:
   * 팀 지표는 「이번 달 어땠나」, 개인 지표는 「요즘 꾸준한가」를 말한다.
   */
  const rateMatches = matches.map((m) => ({
    matchDate: m.match_date,
    attendCount: m.votes.filter((v) => v.status === 'attend').length,
  }));
  const teamRate = monthlyAttendanceRate(rateMatches, members);
  const memberRateMatches = matches.map((m) => ({
    matchDate: m.match_date,
    attendIds: m.votes.filter((v) => v.status === 'attend').map((v) => v.team_member_id),
  }));

  /*
   * 멤버 행과 같은 문구를 쓴다 — formatRecentAttendance 하나가 두 곳을 적는다.
   *
   * 창도 이미 같다: 둘 다 memberAttendanceRate(memberRateMatches, ...)이라
   * 최근 3개월 · 가입 후 경기라는 분모가 동일하다. 그래서 표기만 맞추면 두 숫자가
   * 서로 검산된다 — 목록에서 「최근 6경기 중 4회」를 보고 여기서 같은 문장을 본다.
   *
   * 예전엔 여기가 「4회 (67%)」, 멤버 행이 「3개월 67%」였다. 같은 값을 다르게 적으면
   * 사용자는 두 숫자가 같은 것인지 알 수 없다. 한 번 맞췄다가 STEP 2에서 멤버 행만
   * 바꾸며 다시 갈렸고, 이번에 되돌린다.
   *
   * 셀 경기가 없으면 null이 온다 — 「0경기 중 0회」는 정보가 아니라 빈칸이라 「-」로 둔다.
   */
  /*
    이번 달 활동 카드의 재료.

    지난 달은 monthlyAttendanceRate를 안 고치고 now만 지난달 말일로 넘긴다
    (lastMonthAttendanceRate). sameMonth가 연·월만 비교하므로 그것으로 충분하다 —
    자세한 근거는 그 함수 머리말에 있다.

    내 참석 횟수는 팀 지표와 창이 같아야 한다(둘 다 이번 달). 다른 창을 쓰면 「경기
    4회 중 3회 참여」가 서로 다른 4와 3이 된다. 그래서 여기서 따로 센다 —
    memberAttendanceRate는 최근 3개월이라 이 자리에 못 쓴다.
  */
  const thisMonthRate = teamRate;
  const lastMonthRate = lastMonthAttendanceRate(rateMatches, members);
  const myMonthCount = me
    ? matches.filter((m) => {
        const d = new Date(m.match_date);
        const now = new Date();
        if (d.getFullYear() !== now.getFullYear() || d.getMonth() !== now.getMonth()) return false;
        if (d.getTime() > now.getTime()) return false;
        return m.votes.some((v) => v.team_member_id === me.id && v.status === 'attend');
      }).length
    : 0;

  /*
    다음 경기 — 「지금 다루는 경기」 중 가장 가까운 것이다(matchWindow).
    홈 카드·경기운영과 같은 경계를 쓴다: 킥오프 3시간까지는 아직 다음 경기다.
  */
  /*
    다음 경기 카드의 재료.

    응답 셋은 정원을 안 본다 — 이 카드가 말하는 것은 「몇 명이 뭐라고 했나」이지
    「몇 명이 확정인가」가 아니다. 정원 대비 확정은 홈 카드가 맡고, 거기는
    resolveCapacity를 쓴다. 여기서 같은 함수를 쓰면 참석 수가 정원에서 잘려
    「참석 15명」이 「참석 12명」으로 보이는데, 세 수를 나란히 놓은 줄에서는
    그 잘림이 「불참·미정과 합이 안 맞는다」로 보인다.

    미정은 「미정으로 찍은 사람 + 아직 안 찍은 사람」이다. 멤버 수에서 나머지를 뺀다.
  */
  const nextAttend = nextMatch?.votes.filter((v) => v.status === 'attend').length ?? 0;
  const nextAbsent = nextMatch?.votes.filter((v) => v.status === 'absent').length ?? 0;
  const nextPending = nextMatch ? Math.max(0, members.length - nextAttend - nextAbsent) : 0;
  const nextMatchWhenLabel = nextMatch
    ? (() => {
        const d = new Date(nextMatch.match_date);
        return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[(d.getDay() + 6) % 7]}) ${d
          .toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
      })()
    : '';

  const nextMatchDateLabel = nextMatch
    ? (() => {
        const d = new Date(nextMatch.match_date);
        /* Date.getDay()는 0=일이고 WEEKDAYS는 0=월이다(DB가 그렇게 저장한다).
           그 둘을 그냥 이으면 요일이 하루씩 밀린다 — 여기서 옮겨 맞춘다 */
        return `${d.getMonth() + 1}/${d.getDate()} (${WEEKDAYS[(d.getDay() + 6) % 7]})`;
      })()
    : null;
  const nextMatchPlaceLabel = nextMatch
    ? [
        new Date(nextMatch.match_date).toLocaleTimeString('ko-KR', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }),
        nextMatch.location,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;

  const myRate = me ? memberAttendanceRate(memberRateMatches, me) : null;

  return (
    <ScreenGradient>
      {/* 팀 화면에서는 "팀"이라는 제목이 아무것도 알려주지 않는다 — 팀 이름을 제목으로 쓴다 */}
      <TabHeader title={activeTeam.team.name} onPressTitle={hasMultipleTeams ? () => setTeamSwitchVisible(true) : undefined} />

      {/* 팀 홈이 허브다 — 아래 격자에서 각 화면으로 들어가고, 들어가면 뒤로가기로 돌아온다.
          탭 바를 위에 상시로 두면 격자와 같은 곳으로 가는 입구가 둘이 된다. */}
      {tab !== 'home' && (
        <View style={styles.subHeader}>
          <Pressable onPress={() => setTab('home')} hitSlop={12} accessibilityRole="button" accessibilityLabel="팀 홈으로">
            <Ionicons name="chevron-back" size={24} color={colors.textStrong} />
          </Pressable>
          <Text style={styles.subHeaderTitle}>
            {/* 팀원 화면에서 "관리"라고 부르면 없는 기능을 약속하는 셈이다 */}
            {tab === 'members'
              ? isAdmin
                ? '멤버 관리'
                : '멤버'
              : tab === 'notices'
                ? '공지사항'
                : tab === 'board'
                  ? '게시판'
                  : '설정'}
          </Text>
          {/* 그 화면에서 새로 만드는 동작 — 없는 화면은 자리만 비워 제목이 가운데 오게 한다 */}
          {tab === 'notices' && isAdmin ? (
            <Pressable
              onPress={() => {
                setEditingAnnouncement(null);
                setFormVisible(true);
              }}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="공지 작성"
            >
              <Ionicons name="add" size={24} color={colors.green} />
            </Pressable>
          ) : tab === 'members' ? (
            <Pressable
              onPress={openInvite}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="멤버 초대 링크 공유"
            >
              <Ionicons name="person-add-outline" size={21} color={colors.green} />
            </Pressable>
          ) : (
            <View style={{ width: 24 }} />
          )}
        </View>
      )}

      <ScrollView contentContainerStyle={{ paddingBottom: bottomPad }} showsVerticalScrollIndicator={false}>


        {/* 팀 홈은 배너가 이 래퍼 밖에 있어야 한다 — banner의 marginHorizontal 20이
            content의 padding 20과 겹치면 여백이 두 겹이 된다. 그래서 홈은 TeamHomeTab이
            자기 content를 갖고, 여기서는 감싸지 않는다. 감싸면 빈 래퍼의 padding이 남는다. */}
        {tab === 'home' && (
          <TeamHomeTab
            activeTeam={activeTeam}
            createdAt={createdAt}
            emblemInitials={emblemInitials}
            logoUploading={logoUploading}
            sloganEditing={sloganEditing}
            sloganText={sloganText}
            matches={matches}
            teamRate={teamRate}
            thisMonthRate={thisMonthRate}
            lastMonthRate={lastMonthRate}
            myMonthCount={myMonthCount}
            nextMatchDateLabel={nextMatchDateLabel}
            nextMatchPlaceLabel={nextMatchPlaceLabel}
            onGoSchedule={() => navigation.navigate('Attendance')}
            nextMatch={nextMatch}
            nextMatchWhenLabel={nextMatchWhenLabel}
            nextAttend={nextAttend}
            nextPending={nextPending}
            nextAbsent={nextAbsent}
            /* 참석 현황은 일정 화면이 명단 시트로 연다 — 팀 화면에 같은 시트를 또
               두면 두 벌이 되고, 거기서 투표까지 되면 홈·일정과 경로가 셋이 된다 */
            onOpenRoster={() => navigation.navigate('Attendance')}
            inviteCodeDisplay={inviteCodeDisplay}
            copied={copied}
            onPickEmblem={handlePickEmblem}
            onClearEmblem={handleClearEmblem}
            onEditSlogan={setSloganEditing}
            onChangeSloganText={setSloganText}
            onSaveSlogan={handleSaveSlogan}
            onCopyInviteCode={handleCopyInviteCode}
            onOpenInvite={openInvite}
            members={members}
            visibleMembers={visibleMembers}
            me={me}
            selfMemberId={activeTeam.membershipId}
            isAdmin={isAdmin}
            profileBits={profileBits}
            memberRateMatches={memberRateMatches}
            onOpenMemberList={() => setMemberListVisible(true)}
            onGoMembers={() => setTab('members')}
            onOpenTeamSettings={() => navigation.navigate('TeamSettings')}
            /*
              타일 넷이 갈 곳. 셋은 하단 탭으로 나가고 공지사항만 이 화면 안에 머문다 —
              그래서 목적지를 타일이 아니라 부모가 정한다. 타일 쪽에 navigate와 setTab이
              섞이면 「왜 하나만 다르지」가 그 자리에서 안 읽힌다.
            */
            onGoTile={(key) => {
              if (key === 'settings') navigation.navigate('TeamSettings');
              else setTab(key);
            }}
            hasUnreadNotice={hasUnreadNotice}
            recentPosts={recentPosts}
          />
        )}

        {tab !== 'home' && (
        <View style={styles.content}>
          {/* 기능 입구 — 팀 홈에서 각 화면으로 들어가는 유일한 길이다 */}
          {/*
            4버튼 그리드(멤버 관리 · 공지사항 · 게시판 · 설정)를 걷어냈다.
            네 개가 전부 「다른 화면으로 보내기」였고, 그래서 팀 화면에서 끝나는 일이
            하나도 없었다. 각각 갈 곳을 옮겼다:
              설정      헤더 우측 톱니와 중복이었다
              멤버 관리  아래 멤버 목록의 행을 탭하면 열린다
              공지사항   홈의 「최근 공지」 헤더 + 로 옮겼다
              게시판     제거 (코드는 남겨 뒀다 — 아래 board 블록)
          */}

          {/*
            게시판.

            ⚠ **전에 여기 「tab이 'board'가 되는 경로가 없어져서 이 줄은 지금 안 그려진다」고
              적혀 있었다. 지금은 사실이 아니다.** 걷어냈다가 팀 홈의 「최근 게시글」 카드로
              되살아났고(TeamHomeTab의 onGoTile('board')), 2026-09-10부터는 언급·댓글
              알림도 여기로 온다.
              전제가 무너졌는데 주석이 남아 「안 그려지는 코드」로 읽히게 하고 있었다 —
              그런 주석은 없느니만 못하다(AGENTS.md 「주석은 결론이 아니라 전제를 적는다」).

            걷어낼 때 「코드와 DB(posts·post_likes·post_comments·post_pins)는 그대로 둔다:
            이미 쌓인 글이 있고, 되살릴 때 마이그레이션부터 다시 보게 되면 비용이 훨씬
            크다」고 적어 뒀는데 그 판단이 값을 했다 — 되살리는 데 든 것이 주석 두 줄이다.
          */}
          {tab === 'board' && !!myUserId && (
            <TeamBoardTab teamId={activeTeam.team.id} myUserId={myUserId} isAdmin={isAdmin} />
          )}


          {/* 설정 탭 — 팀 정보 요약과 깊은 설정으로 가는 입구.
              정기모임·회비·계좌 같은 건 이미 팀 설정 화면에 있어 여기서 복제하지 않는다. */}

          {/* 알림 설정 — 사람마다 다른 값이라 총무도 자기 것만 바꾼다.
              끄면 실제로 안 온다: notify-team 함수가 이 컬럼으로 수신자를 거른다. */}

          {/* 관리 — 되돌리기 어려운 동작이라 설정 맨 아래에 따로 둔다 */}

          {/* 팀 대표 지역 — 설정 탭으로 옮겼다. 팀 홈은 "우리 팀이 누구인지"를 보는 자리고,
              지역은 한 번 정해두고 거의 안 건드리는 값이라 설정이 맞다. */}

          {/* 멤버 — 팀 정보·멤버 관리 두 탭에서 보인다 (팀원은 탭이 없어 항상) */}

          {tab === 'members' && (
            <TeamMembersTab
              members={members}
              visibleMembers={visibleMembers}
              selfMemberId={activeTeam.membershipId}
              isAdmin={isAdmin}
              memberQuery={memberQuery}
              memberRateMatches={memberRateMatches}
              onChangeQuery={setMemberQuery}
              onOpenMemberList={() => setMemberListVisible(true)}
              onOpenInvite={openInvite}
            />
          )}

          {tab === 'notices' && (
            <TeamNoticesTab
              announcements={announcements}
              polls={polls}
              isAdmin={isAdmin}
              selfMemberId={activeTeam.membershipId}
              onCreateAnnouncement={() => {
                setEditingAnnouncement(null);
                setFormVisible(true);
              }}
              onOpenAnnouncementList={() => setListVisible(true)}
              onSelectAnnouncement={setSelectedAnnouncement}
              onEditAnnouncement={setEditingAnnouncement}
              onCreatePoll={() => setPollFormVisible(true)}
              onVotePoll={votePoll}
              onDeletePoll={deletePoll}
              confirm={confirm}
            />
          )}

          {/* 로그아웃은 「내 설정」으로 옮겼다 — 계정에 딸린 동작이라 팀 화면에 있을 이유가 없다 */}
        </View>
        )}
      </ScrollView>

      <AnnouncementFormModal
        visible={formVisible}
        editing={editingAnnouncement}
        onClose={() => setFormVisible(false)}
        onSubmit={(input) => {
          if (editingAnnouncement) updateAnnouncement(editingAnnouncement.id, input);
          else createAnnouncement(input);
          setFormVisible(false);
        }}
      />
      <AnnouncementListModal
        visible={listVisible}
        announcements={announcements}
        isAdmin={isAdmin}
        onClose={() => setListVisible(false)}
        onSelect={(a) => {
          setListVisible(false);
          setSelectedAnnouncement(a);
        }}
        onCreate={() => {
          setListVisible(false);
          setEditingAnnouncement(null);
          setFormVisible(true);
        }}
      />
      <AnnouncementDetailModal
        announcement={selectedAnnouncement}
        isAdmin={isAdmin}
        onClose={() => setSelectedAnnouncement(null)}
        onEdit={(a) => {
          setSelectedAnnouncement(null);
          setEditingAnnouncement(a);
          setFormVisible(true);
        }}
        onDelete={(a) =>
          confirm('공지 삭제', '이 공지를 삭제하시겠어요?', () => {
            deleteAnnouncement(a.id);
            setSelectedAnnouncement(null);
          })
        }
      />
      <InviteSheet
        visible={inviteVisible}
        onClose={() => setInviteVisible(false)}
        teamName={activeTeam.team.name}
        inviteCode={activeTeam.team.invite_code}
        inviteUrl={inviteUrl}
      />
      <TeamSwitchSheet
        visible={teamSwitchVisible}
        onClose={() => setTeamSwitchVisible(false)}
        memberships={memberships}
        activeTeamId={activeTeam.team.id}
        onSelect={setActiveTeam}
        onCreateOrJoin={() => navigation.navigate('TeamAddAnother')}
      />

      <MemberListModal
        visible={memberListVisible}
        members={members}
        selfMemberId={activeTeam.membershipId}
        isAdmin={isAdmin}
        onClose={() => setMemberListVisible(false)}
        onChangeSkillTag={updateMemberSkillTag}
        onChangePosition={updateMemberPosition}
        onPromote={promoteToAdmin}
        onRemove={removeMember}
      />
      <PollFormModal
        visible={pollFormVisible}
        onClose={() => setPollFormVisible(false)}
        onSubmit={(input) => {
          createPoll(input);
          setPollFormVisible(false);
        }}
      />
    </ScreenGradient>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({

  /** 하위 화면 헤더 — 뒤로가기 + 제목 + (있으면) 새로 만들기 */
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  subHeaderTitle: { color: colors.textStrong, fontSize: 17, fontWeight: '800' },

  /** 팀 홈 기능 입구 — 상자 하나에 네 칸. 카드 네 장으로 쪼개면 여백만 늘어난다 */
  /** 아이콘을 색 칩에 담는다 — 맨 아이콘보다 덩어리로 읽혀서 눈이 먼저 잡는다 */

  /** 최근 게시글 미리보기 */

  /** 다음 경기 — 2열 타일 + 진행 막대 */

  /** 주발 배지 — R/L 한 글자 */

  /** 나란한 액션 버튼 — 인스타 프로필의 편집/공유 자리 */
  /** 멤버 3명 이하 — 공유 버튼이 주, 코드가 부 */

  /*
   * 카드로 감싼다 — 멤버 목록과 같은 들여쓰기면 마지막 멤버의 하위 항목처럼 읽힌다.
   * 면·테두리·반경은 다른 카드와 같은 값이라 목록에서 따로 놀지 않는다.
   */
  /** 총무 동작 — 카드가 아니라 줄이다. 그리드 넷을 걷어낸 자리에 블록을 다시 세우지 않는다 */

  /** 멤버가 적을 때 아래가 왜 비었는지 — 한 줄이면 충분하다 */


  /** 슬로건 — 팀명 아래 한 줄 */

  /** 등번호 유니폼 — 숫자를 옷 안에 얹는다 */

  /** 총무 상단 탭 */

  /** 멤버 검색 */

  /** 팀 홈 가로 명단 */
  /** 카드 없이 흐르는 멤버 줄 — 좌우 여백만 카드와 맞춘다 */
  /* 멤버 한둘일 때의 가로 행 — 아바타는 스트립(52)과 같게 두고 배치만 눕힌다 */


  /** 고정 공지 — 공지 탭 맨 위 */

  /** 팀 나가기 */

  /** 알림 토글 */

  /** 멤버 초대 버튼 */

  /** 설정 탭 — 라벨/값 한 줄 */

  /** 내 정보 (팀원) */

  /*
    카드 사이 10, 카드 안 20. 레퍼런스가 그 비율이다 — 카드가 붙어 있고 안이 넓다.

    14였을 때는 20:14 = 1.4라 안팎이 비슷해서, 카드 여럿이 쌓인 화면이 「상자 목록」으로
    읽혔다. 10이면 2.0이 되어 각 카드가 자기 안에서 숨 쉬고 카드끼리는 한 덩어리가 된다.

    안쪽(padding)을 올려서 같은 비를 만드는 방법도 있는데 안 골랐다 — 320px 기기에서
    내용 폭을 좌우 합쳐 8px 더 깎는다. 바깥을 줄이는 쪽은 아무것도 안 깎는다.

    paddingTop만 8이다. 히어로는 이 컨테이너 밖이라(자기 marginHorizontal이 있다)
    이 값이 곧 히어로와 첫 카드 사이가 되는데, 레퍼런스에서 스탯 바는 히어로에 붙어
    한 덩어리로 읽힌다 — 원래 히어로 안에 있던 블록이고 뜻도 이어진다.
    20이면 다른 카드 사이(10)보다 오히려 넓어서 둘이 남처럼 떨어져 있었다.
  */
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20, gap: 10 },


  // 다른 탭의 섹션 제목은 15/-0.2였다 — 팀 탭만 14.5라 나란히 놓으면 어긋나 보인다


  });
