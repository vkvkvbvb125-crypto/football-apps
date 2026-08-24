// src/features/team/screens/TeamHomeScreen.tsx — 팀 화면 간결화판
// 기존 기능은 100% 유지: 공지 CRUD, 멤버 관리(강퇴/부총무/실력), 투표, 팀 대표 지역, 로그아웃.
//
// ⚠ 수정 요약 (승인된 간결화 반영):
// 1) 카드 2개를 배너로 흡수 — 초대 코드는 배너 하단 바로, 엠블럼 설정은 연필 배지로만.
//    (독립 "팀 엠블럼 설정" 카드 + "초대 코드" 카드를 없앴다 → 총무 화면에서 카드 2개 감소)
// 2) 다른 탭과 동일하게 TabHeader를 붙였다 — 기존 marginTop:60 하드코딩 제거.
// 3) 로그아웃은 배너 안이 아니라 화면 맨 아래로 (파괴적 액션은 상단에 두지 않는다).
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../../../components/nativeText';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useAuthStore } from '../../auth/stores/authStore';
import { useTeamStore } from '../stores/teamStore';
import { useAttendanceStore } from '../../attendance/stores/attendanceStore';
import { useSettlementStore } from '../../settlement/stores/settlementStore';
import { useAnnouncementsStore } from '../../announcements/stores/announcementsStore';
import { AnnouncementFormModal } from '../../announcements/components/AnnouncementFormModal';
import { AnnouncementListModal } from '../../announcements/components/AnnouncementListModal';
import { AnnouncementDetailModal } from '../../announcements/components/AnnouncementDetailModal';
import type { AnnouncementRow } from '../../announcements/services/announcementsService';
import { MemberListModal } from '../components/MemberListModal';
import { InviteSheet } from '../components/InviteSheet';
import { regularLabel } from '../weekdays';
import { fetchTeamSettings } from '../services/teamSettingsService';
import { BoardPanel } from '../../board/components/BoardPanel';
import { fetchPosts, resolveAuthor, type Post } from '../../board/services/boardService';
import { relativeTime } from '../../../lib/relativeTime';
import { usePollsStore } from '../../polls/stores/pollsStore';
import { PollFormModal } from '../../polls/components/PollFormModal';
import { PollCard } from '../../polls/components/PollCard';
import { ScreenGradient, useTabBarPadding } from '../../../components/ScreenGradient';
import { alertMessage, confirmAction } from '../../../components/Dialog';
import { TabHeader } from '../../../components/TabHeader';
import { RowCard, StatRow, StatTile } from '../../../components/Surface';
import {
  monthlyAttendanceRate,
  memberAttendanceRate,
  formatRate,
  formatMemberRate,
  MEMBER_RATE_MONTHS,
} from '../../attendance/utils/attendanceRate';
import { PlaceSearchModal } from '../../attendance/components/PlaceSearchModal';
import type { PlaceResult } from '../../attendance/services/placeService';
import { colors, font, radius, shadow } from '../../../theme';
import { POSITION_COLOR, POSITION_INFO, positionLabel, toPosition } from '../positions';
import { clearTeamLogo, pickSquareImage, uploadTeamLogo } from '../../settings/services/avatarService';
import { SoftTint } from '../../../components/BentoCard';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;

function initialOf(name: string) {
  return name.length > 2 ? name.slice(1) : name;
}

/**
 * 팀 홈의 진입 타일. 총무만 멤버 관리로 들어간다.
 *
 * 칸마다 색을 달리 쓰던 것을 초록 하나로 모았다.
 *
 * 예전 의도는 「색으로 입구를 기억하게 한다」였는데, 실제로는 gold·blue·회색이 앱의 다른
 * 의미와 부딪혔다 — gold는 확인 대기 배지, blue는 정보성 표시, 회색은 비활성이다.
 * 팀 홈 네 칸만 그 규칙 밖에서 놀아서, 이 화면에서 색이 무엇을 뜻하는지 알 수 없었다.
 *
 * 구분은 색이 아니라 아이콘 모양과 그 아래 글자가 맡는다 — 확성기·말풍선·톱니바퀴·사람은
 * 이미 서로 안 닮았고, 라벨까지 붙어 있다. 색까지 동원할 일이 아니었다.
 */
/** teams.skill_level — CHECK 제약과 같은 세 값 */
const TEAM_SKILL_LABEL = { beginner: '입문', intermediate: '중급', advanced: '상급' } as const;

const MEMBER_TILES = [
  { key: 'notices' as const, icon: 'megaphone-outline', label: '공지사항', tint: colors.green },
  { key: 'board' as const, icon: 'chatbubbles-outline', label: '게시판', tint: colors.green },
  { key: 'settings' as const, icon: 'settings-outline', label: '설정', tint: colors.green },
];
const ADMIN_TILES = [
  { key: 'members' as const, icon: 'people-outline', label: '멤버 관리', tint: colors.green },
  ...MEMBER_TILES,
];

export function TeamHomeScreen({ navigation, route }: any) {
  const bottomPad = useTabBarPadding();
  const activeTeam = useTeamStore((s) => s.activeTeam);
  const signOut = useAuthStore((s) => s.signOut);
  const myUserId = useAuthStore((s) => s.session?.user.id);
  const updateHomeLocation = useTeamStore((s) => s.updateHomeLocation);
  const members = useTeamStore((s) => s.members);
  const loadMembers = useTeamStore((s) => s.loadMembers);
  const updateMemberSkillTag = useTeamStore((s) => s.updateMemberSkillTag);
  const updateMemberPosition = useTeamStore((s) => s.updateMemberPosition);
  const updateSlogan = useTeamStore((s) => s.updateSlogan);
  const promoteToAdmin = useTeamStore((s) => s.promoteToAdmin);
  const removeMember = useTeamStore((s) => s.removeMember);
  const leaveTeam = useTeamStore((s) => s.leaveTeam);
  const updateNotifyPref = useTeamStore((s) => s.updateNotifyPref);
  const loadMemberships = useTeamStore((s) => s.loadMemberships);
  const matches = useAttendanceStore((s) => s.matches);
  const settlementCurrent = useSettlementStore((s) => s.current);
  const settlementPast = useSettlementStore((s) => s.past);
  const loadMatches = useAttendanceStore((s) => s.loadMatches);

  const [memberListVisible, setMemberListVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  /** 팀 탭 안의 네 화면. 총무·팀원 모두 같은 탭을 쓰고, 안에서 할 수 있는 일만 달라진다.
      route.params.tab으로 열 화면을 지정할 수 있다 — 탈퇴 거부 메시지가 「총무 넘기러 가기」로
      멤버 화면을 바로 연다. 없으면 여느 때처럼 홈이다. */
  const [tab, setTab] = useState<'home' | 'members' | 'notices' | 'board' | 'settings'>(
    route?.params?.tab ?? 'home',
  );
  const [memberQuery, setMemberQuery] = useState('');
  const [logoUploading, setLogoUploading] = useState(false);
  // 정기 일정은 teams가 아니라 team_settings에 있다 — 배열이라 「매주 화·목」이 되고,
  // teams에 단일 int로 또 두면 같은 뜻의 저장소가 둘이 된다. SettlementScreen도
  // 같은 식으로 화면에서 직접 읽는다.
  const [regular, setRegular] = useState<string | null>(null);
  const [inviteVisible, setInviteVisible] = useState(false);
  const [sloganEditing, setSloganEditing] = useState(false);
  const [sloganText, setSloganText] = useState('');
  /** 팀 홈 미리보기용 최근 글 2개 — 게시판 화면과 달리 목록 전체를 들고 있지 않는다 */
  const [recentPosts, setRecentPosts] = useState<Post[]>([]);

  const announcements = useAnnouncementsStore((s) => s.announcements);
  const loadAnnouncements = useAnnouncementsStore((s) => s.loadAnnouncements);
  const createAnnouncement = useAnnouncementsStore((s) => s.createAnnouncement);
  const updateAnnouncement = useAnnouncementsStore((s) => s.updateAnnouncement);
  const deleteAnnouncement = useAnnouncementsStore((s) => s.deleteAnnouncement);
  const [formVisible, setFormVisible] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<AnnouncementRow | null>(null);
  const [listVisible, setListVisible] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<AnnouncementRow | null>(null);

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
    if (myUserId) {
      fetchPosts(activeTeam.team.id, myUserId)
        .then((list) => setRecentPosts(list.slice(0, 2)))
        .catch(() => setRecentPosts([])); // 미리보기라 실패하면 섹션만 사라진다
    }
  }, [activeTeam?.team.id, myUserId]);

  const confirm = (title: string, message: string, onYes: () => void, confirmLabel = '삭제') => {
    confirmAction({ title, message, confirmLabel, destructive: true }).then((ok) => {
      if (ok) onYes();
    });
  };

  if (!activeTeam) return null;

  const isAdmin = activeTeam.role === 'admin';
  const me = members.find((m) => m.id === activeTeam.membershipId) ?? null;
  /** 내가 아직 안 낸 돈 — 진행중·지난 정산에서 내 몫 중 미납만 */
  const myUnpaid = [...(settlementCurrent ? [settlementCurrent] : []), ...settlementPast]
    .flatMap((st) => st.shares)
    .filter((sh) => sh.teamMemberId === activeTeam.membershipId && !sh.paid && !sh.exempt)
    .reduce((t, sh) => t + sh.amount, 0);
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

  const handleLeaveTeam = () => {
    confirm('팀 나가기', `${activeTeam.team.name}에서 나갈까요?`, () => {
      leaveTeam().catch((err) => {
        alertMessage('나갈 수 없어요', err instanceof Error ? err.message : '팀을 나가지 못했어요');
      });
    }, '나가기');
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
      alertMessage('저장 실패', err instanceof Error ? err.message : '로고를 올리지 못했어요');
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
  /** 다음 경기 — 킥오프 3시간 뒤까지는 "다음"으로 본다 (홈·경기운영과 같은 기준) */
  const nextMatch =
    matches
      .filter((m) => new Date(m.match_date).getTime() >= Date.now() - 3 * 60 * 60 * 1000)
      .sort((a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime())[0] ?? null;
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
   * 「4회 (67%)」 — 멤버 행의 「3개월 67%」와 같은 값이다.
   * 횟수만 적으면 옆 목록의 비율과 같은 것인지 사용자가 알 수 없다.
   * 표본이 모자라 비율이 없으면(3회 미만) 괄호를 생략한다 — 「-」를 괄호에 넣으면
   * 무엇이 없다는 건지 더 헷갈린다.
   */
  const myRate = me ? memberAttendanceRate(memberRateMatches, me) : null;
  const myRateLabel = myRate
    ? myRate.rate == null
      ? `${myRate.attended}회`
      : `${myRate.attended}회 (${Math.round(myRate.rate * 100)}%)`
    : '-';

  return (
    <ScreenGradient>
      {/* 팀 화면에서는 "팀"이라는 제목이 아무것도 알려주지 않는다 — 팀 이름을 제목으로 쓴다 */}
      <TabHeader title={activeTeam.team.name} />

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
        {/* ── 배너: 엠블럼 + 팀명 + 초대 코드 ── 팀 홈에서만 */}
        {tab === 'home' && (
        <View style={styles.banner}>
          {/* 이 카드에만 있던 SoftTint를 뺐다 — 지금은 앱의 모든 카드에 같은 결이 깔려 있어서
              여기만 따로 강조할 이유가 없어졌다. 혼자 빛이 두 겹이라 팀 탭만 톤이 튀었다. */}
          <View style={styles.bannerRow}>
            <View>
              <Pressable
                onPress={isAdmin ? handlePickEmblem : undefined}
                accessibilityRole={isAdmin ? 'button' : 'image'}
                accessibilityLabel={isAdmin ? '팀 엠블럼 변경' : '팀 엠블럼'}
                style={({ pressed }) => [styles.emblem, pressed && isAdmin && styles.pressed]}
              >
                {activeTeam.team.logo_url ? (
                  <Image source={{ uri: activeTeam.team.logo_url }} style={styles.emblemImage} />
                ) : (
                  <>
                    <Text style={styles.emblemInitials}>{emblemInitials}</Text>
                    <Text style={styles.emblemHint}>{logoUploading ? '올리는 중' : 'EMBLEM'}</Text>
                  </>
                )}
              </Pressable>
              {isAdmin && (
                // 길게 누르면 지운다 — 지우기 버튼을 따로 세우면 배너가 복잡해지고,
                // 로고를 내리는 일은 자주 있는 동작이 아니다
                <Pressable
                  onPress={handlePickEmblem}
                  onLongPress={activeTeam.team.logo_url ? handleClearEmblem : undefined}
                  style={styles.emblemEdit}
                  hitSlop={14}
                >
                  <Ionicons name="pencil" size={11} color={colors.bgRoot} />
                </Pressable>
              )}
            </View>

            {/* 로고 오른쪽엔 이름만 — 긴 팀명이 지표를 밀어내지 않게 지표는 아래 전체 폭으로 뺐다 */}
            <View style={styles.bannerBody}>
              <Text style={styles.teamName} numberOfLines={1}>
                {activeTeam.team.name}
              </Text>
              <Text style={styles.teamMeta} numberOfLines={1}>
                {[activeTeam.team.home_place_name, '풋살', `Since ${createdAt.getFullYear()}.${String(createdAt.getMonth() + 1).padStart(2, '0')}`]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              {/*
                소개는 팀명 바로 아래다 — 헤더 블록에 속한다.
                예전엔 엠블럼 아래 별도 줄이라 통계 3칸과 붙어서, 팀 소개인지
                지표의 설명인지 자리로는 알 수 없었다.
              */}

              {/* 슬로건 — 총무만 고친다. 비어 있으면 총무에게만 "한 줄 소개" 자리를 보여주고,
                  팀원에게는 아예 안 띄운다(빈 줄이 있는지도 알 필요가 없다). */}
              {sloganEditing ? (
                <View style={styles.sloganEditRow}>
                  <TextInput
                    style={styles.sloganInput}
                    value={sloganText}
                    onChangeText={setSloganText}
                    placeholder="한 줄 소개"
                    placeholderTextColor={colors.textFaint}
                    maxLength={40}
                    autoFocus
                  />
                  <Pressable
                    onPress={handleSaveSlogan}
                    hitSlop={14}
                    accessibilityRole="button"
                    accessibilityLabel="한 줄 소개 저장"
                  >
                    <Ionicons name="checkmark" size={18} color={colors.green} />
                  </Pressable>
                </View>
              ) : (
                (!!activeTeam.team.slogan || isAdmin) && (
                  <Pressable
                    disabled={!isAdmin}
                    onPress={() => {
                      setSloganText(activeTeam.team.slogan ?? '');
                      setSloganEditing(true);
                    }}
                    style={styles.sloganRow}
                    hitSlop={10}
                    accessibilityRole={isAdmin ? 'button' : undefined}
                    accessibilityLabel={isAdmin ? '한 줄 소개 수정' : undefined}
                  >
                    <Text style={styles.slogan} numberOfLines={1}>
                      {activeTeam.team.slogan || '한 줄 소개를 적어보세요'}
                    </Text>
                    {/* 톱니를 뺐다 — 줄 전체가 이미 눌리는데 12px 아이콘을 옆에 두면
                        그 아이콘만 표적처럼 보인다. 헤더 우측 톱니와도 뜻이 겹쳤다. */}
                  </Pressable>
                )
              )}
            </View>
          </View>

          {profileBits.length > 0 && (
            <Text style={styles.profileLine} numberOfLines={2}>
              {profileBits.join(' · ')}
            </Text>
          )}

          {/* 경기 / 멤버 / 이번 달 참석률 — 팀 프로필의 요약 지표.
              「공지」였다. 공지 개수는 팀이 어떤지 말해주지 않는다 — 세 개든 서른 개든
              그 팀이 잘 모이는지와 무관하다. 참석률로 바꾼다.
              계산은 홈의 통계 타일과 같은 함수(attendanceRate)를 쓴다.
              공통 StatTile을 쓴다: 라벨이 위, 숫자가 아래라 격자를 훑을 때 숫자끼리 같은
              높이에서 비교된다. 숫자만 초록으로 둬서 라벨은 조용히 물러난다. */}
          <View style={styles.teamStats}>
            <StatRow>
              <StatTile label="경기" value={String(matches.length)} accent />
              <StatTile label="멤버" value={String(members.length)} accent />
              <StatTile label="이번 달 참석률" value={formatRate(teamRate)} accent />
            </StatRow>
          </View>

          {/* 초대 코드 공유는 총무 전용이 아니다 — 홈의 "친구 초대하기"가 멤버를 여기로 보내는데
              총무만 볼 수 있으면 멤버는 눌러도 아무것도 못 하는 막다른 길이 된다. */}
          {/* 「초대 공유 / 팀 설정」 버튼 줄은 뺐다 — 바로 아래 상자의 설정·멤버 관리와 겹친다.
              초대는 멤버 관리 화면의 + 버튼이 맡는다. */}

        </View>

        )}

        {/*
          초대 블록은 팀 프로필 카드 밖이다.
          안에 있으면 카드 안에 카드가 되어 경계가 어디까지인지 알 수 없었다 —
          엠블럼·팀명·통계는 「이 팀은 무엇인가」이고 초대는 「지금 할 일」이라 성격도 다르다.

          멤버가 셋 이하면 초대가 이 화면에서 가장 급한 일이라 큰 카드로 세운다.
          코드만 작게 두면 총무가 그걸 손으로 불러줘야 한다 — 카톡 링크가 실용적이라
          공유 버튼이 주(主), 코드가 부(副)다. 넷부터는 상시 과제가 아니라서 코드 줄만.
        */}
        {tab === 'home' &&
          (members.length <= 3 ? (
            <View style={styles.inviteBig}>
            <Text style={styles.inviteBigTitle}>멤버를 초대해보세요</Text>
            <Text style={styles.inviteBigSub}>링크를 보내면 코드를 불러주지 않아도 돼요</Text>
            <Pressable
            onPress={openInvite}
            accessibilityRole="button"
            accessibilityLabel="멤버 초대"
            style={({ pressed }) => [styles.inviteShare, pressed && styles.pressed]}
            >
            <Ionicons name="person-add-outline" size={16} color={colors.bgRoot} />
            <Text style={styles.inviteShareText}>초대하기</Text>
            </Pressable>
            <Pressable
            onPress={handleCopyInviteCode}
            accessibilityRole="button"
            accessibilityLabel={`초대 코드 ${activeTeam.team.invite_code} 복사`}
            style={styles.inviteCodeLine}
            >
            <Text style={styles.inviteLabel}>초대 코드</Text>
            <Text style={styles.inviteCode} numberOfLines={1}>
            {inviteCodeDisplay}
            </Text>
            <Ionicons
            name={copied ? 'checkmark' : 'copy-outline'}
            size={14}
            color={copied ? colors.green : colors.textDim}
            />
            </Pressable>
            </View>
          ) : (
            <Pressable
            onPress={handleCopyInviteCode}
            style={styles.inviteBar}
            accessibilityRole="button"
            accessibilityLabel={`초대 코드 ${activeTeam.team.invite_code} 복사`}
            >
            <Text style={styles.inviteLabel}>초대 코드</Text>
            <Text style={styles.inviteCode} numberOfLines={1}>
            {inviteCodeDisplay}
            </Text>
            <Ionicons
            name={copied ? 'checkmark' : 'copy-outline'}
            size={14}
            color={copied ? colors.green : colors.textDim}
            />
            </Pressable>
          ))}

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
            게시판 — 화면에서만 걷어냈다. 코드와 DB(posts·post_likes·post_comments·post_pins)는
            그대로 둔다: 이미 쌓인 글이 있고, 되살릴 때 마이그레이션부터 다시 보게 되면
            비용이 훨씬 크다. tab이 'board'가 되는 경로가 없어져서 이 줄은 지금 안 그려진다.
          */}
          {/*
          {tab === 'board' && !!myUserId && (
            <BoardPanel teamId={activeTeam.team.id} myUserId={myUserId} isAdmin={isAdmin} />
          )}
          */}

          {/* 다음 경기 카드를 걷어냈다 — 홈이 같은 경기를 더 자세히(참여 현황·CTA까지) 보여준다.
              팀 화면의 주인공은 멤버다. */}

          {tab === 'home' && !isAdmin && !!me && (
            <View style={[styles.card, { gap: 12 }]}>
              {/* 카드 면의 결 — 정산 카드와 같은 값·같은 방향. 목록에서 조명이 하나로 읽힌다 */}
              <SoftTint tone="green" radius={radius.card} />
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>내 정보</Text>
                <Pressable
                  onPress={() => setMemberListVisible(true)}
                  hitSlop={14}
                  accessibilityRole="button"
                  accessibilityLabel="내 정보 수정"
                >
                  <Text style={styles.moreText}>수정 ›</Text>
                </Pressable>
              </View>
              <View style={styles.myInfoRow}>
                <View style={{ flex: 1, gap: 5 }}>
                  <Text style={styles.myInfoLabel}>주 포지션</Text>
                  <View style={styles.myInfoChip}>
                    <Text style={styles.myInfoChipText}>{positionLabel(toPosition(me.position))}</Text>
                  </View>
                </View>
                <View style={{ flex: 1, gap: 5 }}>
                  <Text style={styles.myInfoLabel}>실력</Text>
                  <View style={[styles.myInfoChip, styles.myInfoChipAlt]}>
                    <Text style={[styles.myInfoChipText, styles.myInfoChipTextAlt]}>{me.skillTag ?? '미지정'}</Text>
                  </View>
                </View>

                {/* 등번호 — 숫자만 두면 무슨 숫자인지 모른다. 유니폼 안에 넣어 뜻이 드러나게 */}
                <View style={styles.jersey}>
                  <Ionicons name="shirt-outline" size={44} color={colors.greenDeep} />
                  <Text style={styles.jerseyNumber}>{me.jerseyNumber ?? '–'}</Text>
                </View>
              </View>
            </View>
          )}

          {/* 설정 탭 — 팀 정보 요약과 깊은 설정으로 가는 입구.
              정기모임·회비·계좌 같은 건 이미 팀 설정 화면에 있어 여기서 복제하지 않는다. */}

          {/* 알림 설정 — 사람마다 다른 값이라 총무도 자기 것만 바꾼다.
              끄면 실제로 안 온다: notify-team 함수가 이 컬럼으로 수신자를 거른다. */}

          {/* 관리 — 되돌리기 어려운 동작이라 설정 맨 아래에 따로 둔다 */}

          {/* 팀 대표 지역 — 설정 탭으로 옮겼다. 팀 홈은 "우리 팀이 누구인지"를 보는 자리고,
              지역은 한 번 정해두고 거의 안 건드리는 값이라 설정이 맞다. */}

          {/* 멤버 — 팀 정보·멤버 관리 두 탭에서 보인다 (팀원은 탭이 없어 항상) */}
          {(tab === 'home' || tab === 'members') && (
          // 팀 홈에서는 카드 껍데기를 벗긴다. 배너 아래로 똑같은 상자만 쌓이면
          // 화면에 리듬이 없다 — 가로로 흐르는 아바타 줄이 상자들 사이에서 숨통이 된다.
          // (멤버 탭은 목록이 주인공이라 카드를 유지한다)
          <View style={[tab === 'members' ? styles.card : styles.rosterStrip, { gap: 12 }]}>
            <View style={styles.sectionHead}>
              {/*
                홈에서는 제목이 멤버 탭으로 가는 문이다.

                멤버 탭에 들어가는 길이 가로 로스터 아바타(3명 이상)와 +N 타일(6명
                이상)뿐이었다. 즉 2명 이하 팀은 멤버 탭에 도달할 방법이 아예 없었고,
                하필 초대가 제일 급한 갓 만든 팀이 정확히 거기 걸렸다. 초대 진입을
                그 목록 끝에 넣었으니 더더욱 막히면 안 된다.

                그래서 멤버 수를 조건으로 걸지 않는다 — 3명이든 6명이든 임계값을
                두면 같은 함정이 다시 생긴다. 0명이어도 열린다.

                멤버 탭에서는 제목이 그냥 제목이다. 이미 그 화면이라 갈 곳이 없다.
              */}
              {tab === 'members' ? (
                <Text style={styles.sectionTitle}>전체 {members.length}명</Text>
              ) : (
                <Pressable
                  onPress={() => setTab('members')}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`멤버 ${members.length}명 전체 보기`}
                  style={({ pressed }) => [styles.sectionHeadLink, pressed && styles.pressed]}
                >
                  <Text style={styles.sectionTitle}>멤버 {members.length}명</Text>
                  <Ionicons name="chevron-forward" size={15} color={colors.textFaint} />
                </Pressable>
              )}
            </View>

            {/* 이름 검색 — 멤버 탭에서만. 팀 홈은 미리보기라 검색할 게 없다 */}
            {tab === 'members' && members.length > 6 && (
              <View style={styles.searchRow}>
                <Ionicons name="search" size={15} color={colors.textFaint} />
                <TextInput
                  style={styles.searchInput}
                  value={memberQuery}
                  onChangeText={setMemberQuery}
                  placeholder="이름 검색"
                  placeholderTextColor={colors.textFaint}
                />
              </View>
            )}

            {/* 팀 홈은 "누가 있나"만 훑는 자리라 가로로 늘어놓는다.
                멤버 탭은 포지션·실력을 견주고 관리까지 하는 자리라 세로 목록이 맞다. */}
            {/*
              멤버가 한둘이면 가로 스트립을 쓰지 않는다.
              62px짜리 아바타 칸 하나가 화면 폭에 혼자 놓이면 오른쪽이 통째로 비어서
              "아직 안 만든 화면"처럼 읽혔다. 같은 정보를 가로로 눕히면 폭을 다 쓴다.
              셋부터는 스트립이 줄로 채워지니 그대로 둔다 — 미리보기라 가로가 맞다.
            */}
            {tab === 'home' && visibleMembers.length <= 2 ? (
              <View style={styles.soloList}>
                {visibleMembers.map((m) => {
                  const pos = toPosition(m.position);
                  /*
                    이름 → 역할 → 포지션 → 참석률.
                    끝에 실력 등급(상/중/하)을 붙이고 있었다 — 본인이 자기 등급을 보면
                    팀 분위기가 깨진다. 값과 팀 분배 로직은 그대로 두고 표시만 뺀다.
                    (아래 memberRow 경로에서도 같은 이유로 뺐다.)
                  */
                  const meta = [
                    m.role === 'admin' ? '총무' : null,
                    pos ? POSITION_INFO[pos].ko : null,
                    formatMemberRate(memberAttendanceRate(memberRateMatches, m)),
                  ].filter(Boolean);
                  return (
                    <Pressable
                      key={m.id}
                      onPress={() => setMemberListVisible(true)}
                      accessibilityRole="button"
                      accessibilityLabel={`${m.displayName} 멤버 관리`}
                      style={({ pressed }) => [styles.soloRow, pressed && styles.pressed]}
                    >
                      <View style={styles.soloAvatar}>
                        {m.avatarUrl ? (
                          <Image source={{ uri: m.avatarUrl }} style={styles.avatarPhoto} />
                        ) : (
                          <Text style={styles.rosterInitial}>{initialOf(m.displayName)}</Text>
                        )}
                      </View>
                      <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
                        <Text style={styles.soloName} numberOfLines={1}>
                          {m.displayName}
                          {m.id === activeTeam.membershipId ? ' (나)' : ''}
                        </Text>
                        <Text style={styles.rosterMeta} numberOfLines={1}>
                          {meta.length > 0 ? meta.join(' · ') : '포지션 미지정'}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                    </Pressable>
                  );
                })}
              </View>
            ) : tab === 'home' ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rosterRow}>
                {visibleMembers.map((m) => {
                  const pos = toPosition(m.position);
                  return (
                    <Pressable key={m.id} onPress={() => setTab('members')} style={styles.rosterItem}>
                      <View style={styles.rosterAvatar}>
                        {/* 사진이 있으면 사진, 없으면 이니셜 */}
                        {m.avatarUrl ? (
                          <Image source={{ uri: m.avatarUrl }} style={styles.rosterPhoto} />
                        ) : (
                          <Text style={styles.rosterInitial}>{initialOf(m.displayName)}</Text>
                        )}
                        {m.role === 'admin' && (
                          <View style={styles.rosterAdminDot}>
                            <Text style={styles.rosterAdminText}>총무</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.rosterName} numberOfLines={1}>
                        {m.displayName}
                        {m.id === activeTeam.membershipId ? ' (나)' : ''}
                      </Text>
                      <Text style={styles.rosterMeta} numberOfLines={1}>
                        <Text style={pos ? { color: POSITION_COLOR[pos] } : undefined}>
                          {pos ? POSITION_INFO[pos].ko : '미지정'}
                        </Text>
                        {m.skillTag ? ` · ${m.skillTag}` : ''}
                      </Text>
                    </Pressable>
                  );
                })}
                {members.length > 5 && (
                  <Pressable onPress={() => setTab('members')} style={styles.rosterItem}>
                    <View style={[styles.rosterAvatar, styles.rosterMore]}>
                      <Text style={styles.rosterMoreText}>+{members.length - 5}</Text>
                    </View>
                  </Pressable>
                )}
              </ScrollView>
            ) : (
            <View>
              {visibleMembers.map((m) => {
                const isMe = m.id === activeTeam.membershipId;
                const isTeamAdmin = m.role === 'admin';
                return (
                  /*
                    행을 누르면 멤버 관리가 열린다.
                    4버튼 그리드의 「멤버 관리」 타일이 하던 일이다 — 타일은 없앴지만
                    MemberListModal은 이미 실력 등급·포지션·부총무 임명·내보내기를
                    전부 갖고 있어서 새로 만들 게 없었다. 목록에서 사람을 보고 그 자리에서
                    누르는 쪽이 타일을 거치는 것보다 짧다.
                  */
                  <Pressable
                    key={m.id}
                    onPress={() => setMemberListVisible(true)}
                    accessibilityRole="button"
                    accessibilityLabel={`${m.displayName} 멤버 관리`}
                    style={({ pressed }) => [styles.memberRow, pressed && styles.pressed]}
                  >
                    <View style={styles.avatar}>
                      {m.avatarUrl ? (
                        <Image source={{ uri: m.avatarUrl }} style={styles.avatarPhoto} />
                      ) : (
                        <Text style={styles.avatarText}>{initialOf(m.displayName)}</Text>
                      )}
                    </View>
                    {/* 주발 — 내 설정에 저장은 되는데 여태 어디서도 안 보였다.
                        R/L 한 글자면 이름 옆에서 자리를 거의 안 먹는다 */}
                    {!!m.dominantFoot && (
                      <View style={styles.footBadge}>
                        <Text style={styles.footBadgeText}>
                          {m.dominantFoot === 'left' ? 'L' : m.dominantFoot === 'right' ? 'R' : 'LR'}
                        </Text>
                      </View>
                    )}
                    <View style={{ flex: 1, gap: 1 }}>
                      <Text style={styles.memberName} numberOfLines={1}>
                        {m.displayName}
                        {isMe ? ' (나)' : ''}
                      </Text>
                      {/*
                        실력 등급(skill_tag: 상/중/하)을 목록에서 뺐다.
                        본인이 자기 등급을 보면 팀 분위기가 깨진다 — 「하」로 찍힌 채
                        매주 나오는 사람에게 그걸 계속 보여줄 이유가 없다.
                        값과 팀 분배 로직은 그대로다. 바꾸는 UI도 총무 전용
                        MemberListModal에 그대로 남아 있다. 여기서 표시만 숨긴다.

                        자리에는 참석률이 온다 — 목록을 훑을 때 「누가 꾸준한가」가
                        「누가 잘하나」보다 총무에게 쓸모 있는 정보다.
                      */}
                      <View style={styles.memberMetaRow}>
                        {/* 포지션마다 색이 달라 목록에서 자리를 색으로 먼저 읽는다 */}
                        <Text
                          style={[
                            styles.memberMeta,
                            !!toPosition(m.position) && {
                              color: POSITION_COLOR[toPosition(m.position)!],
                              fontWeight: '700',
                            },
                          ]}
                        >
                          {positionLabel(toPosition(m.position))}
                        </Text>
                        <Text style={styles.memberMetaDot}>·</Text>
                        <Text style={styles.memberMeta}>
                          {formatMemberRate(memberAttendanceRate(memberRateMatches, m))}
                        </Text>
                      </View>
                    </View>
                    {isTeamAdmin ? (
                      <View style={styles.adminBadge}>
                        <Text style={styles.adminBadgeText}>총무</Text>
                      </View>
                    ) : (
                      <Text style={styles.memberRole}>멤버</Text>
                    )}
                  </Pressable>
                );
              })}
              {visibleMembers.length === 0 && (
                <Text style={styles.empty}>{memberQuery ? '찾는 이름이 없어요' : '아직 멤버가 없어요'}</Text>
              )}

              {/*
                초대가 목록의 마지막 행이다.

                아래에 초록 버튼이 따로 있었는데, 목록을 끝까지 훑고 「이 사람도
                없네」 하는 지점이 목록의 끝이다. 거기서 눈을 떼고 버튼을 찾게 하는
                대신 그 자리에 둔다 — 연락처 앱이 「새 연락처 추가」를 목록 끝에
                두는 것과 같은 이유다.

                검색 중에는 감춘다. 이름을 거르는 중에 초대 행이 남아 있으면
                검색 결과처럼 읽힌다.
              */}
              {!memberQuery && (
                <Pressable
                  onPress={openInvite}
                  accessibilityRole="button"
                  accessibilityLabel="멤버 초대하기"
                  style={({ pressed }) => [styles.memberRow, pressed && styles.pressed]}
                >
                  <View style={[styles.avatar, styles.inviteAvatar]}>
                    <Ionicons name="person-add-outline" size={17} color={colors.green} />
                  </View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text style={styles.inviteRowName}>멤버 초대하기</Text>
                    <Text style={styles.memberMeta}>링크를 보내면 코드를 불러주지 않아도 돼요</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
                </Pressable>
              )}
            </View>
            )}

            {/*
              내 기록 — 총무도 선수다. 역할과 무관하게 항상 보인다.

              카드로 감쌌다. 멤버 목록과 같은 들여쓰기라 김범준 항목의 하위 항목처럼
              읽혔다 — 경계가 있어야 「목록」과 「내 것」이 끊긴다.

              참석률을 횟수와 나란히 적는다. 멤버 행은 「3개월 67%」, 여기는 「4회」였다.
              같은 값인데 표현이 달라 사용자가 검산할 수 없었다. 기준을 맞춘다.

              득점 칸은 없다. match_scores는 팀 단위라 개인 득점 데이터가 없고,
              빈 칸을 만들어 두면 채울 때까지 계속 미완성으로 보인다.
            */}
            {tab === 'home' && !!me && (
              <View style={styles.myRecord}>
                <SoftTint tone="green" radius={radius.card} />
                <Text style={styles.myRecordTitle}>내 기록</Text>
                <StatRow>
                  <StatTile
                    label={`최근 ${MEMBER_RATE_MONTHS}개월 참석`}
                    value={myRateLabel}
                    accent
                  />
                  {/* 미납은 크면 나쁜 숫자다 — 초록이면 좋아 보인다 */}
                  <StatTile
                    label="미납 금액"
                    value={`${myUnpaid.toLocaleString()}원`}
                    accent={myUnpaid > 0}
                    tone="danger"
                  />
                </StatRow>
              </View>
            )}

            {/*
              총무 동작 — 홈 탭 하단에 모은다.

              4버튼 그리드를 걷어낼 때 「설정」 타일을 헤더 톱니와 중복으로 보고 지웠는데,
              헤더 톱니는 개인 설정(MySettings)이고 그 타일은 팀 운영 설정이었다.
              서로 다른 화면이라 진입로가 통째로 사라졌다 — 라우트와 호출부는 살아 있고
              그 호출부에 갈 방법만 없는 상태였다.

              라벨을 「설정」이 아니라 「운영 설정」으로 둔다. 하위 항목까지 적어 두면
              헤더 톱니와 헷갈릴 여지가 없다 — 혼동은 둘 다 「설정」이라 불러서 생겼다.
            */}
            {tab === 'home' && isAdmin && (
              <Pressable
                onPress={() => navigation.navigate('TeamSettings')}
                accessibilityRole="button"
                style={({ pressed }) => [styles.adminRow, pressed && styles.pressed]}
              >
                <Ionicons name="options-outline" size={17} color={colors.green} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.rowTitle}>운영 설정</Text>
                  <Text style={styles.rowSub}>정기모임 · 회비 · 계좌 · 실력 레벨 · 게스트</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
              </Pressable>
            )}

            {/* 팀 나가기는 총무만이 아니다 — 멤버가 팀을 떠날 유일한 길이다 */}
            {tab === 'home' && (
              <Pressable
                onPress={handleLeaveTeam}
                accessibilityRole="button"
                style={({ pressed }) => [styles.leaveRow, pressed && styles.pressed]}
              >
                <Ionicons name="exit-outline" size={17} color={colors.danger} />
                <Text style={styles.leaveText}>팀 나가기</Text>
              </Pressable>
            )}

            {/*
              멤버가 적을 때 아래가 비는 것에 대한 안내.
              구조를 늘려 채우지 않는다 — 지금 비어 보이는 건 레이아웃이 아니라
              데이터가 없어서다. 왜 비었는지만 한 줄로 말한다.
            */}
            {/*
              프로필이 비었을 때. 총무에게만 보인다 — 팀원은 채울 권한이 없고,
              고칠 수 없는 빈칸을 알려주면 할 일처럼 보이기만 한다.
            */}
            {tab === 'home' && isAdmin && profileBits.length === 0 && (
              <Pressable
                onPress={() => navigation.navigate('TeamSettings')}
                accessibilityRole="button"
                style={({ pressed }) => [styles.adminRow, pressed && styles.pressed]}
              >
                <Ionicons name="sparkles-outline" size={17} color={colors.green} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.rowTitle}>팀 정보를 채워주세요</Text>
                  <Text style={styles.rowSub}>지역 · 정기 일정 · 평균 인원 · 실력</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
              </Pressable>
            )}

            {tab === 'home' && members.length <= 3 && (
              <Text style={styles.growHint}>멤버가 모이면 참석률과 기록이 쌓여요</Text>
            )}
          </View>
          )}

          {/* 공지사항 — 팀 홈에서는 "최근 공지" 미리보기, 공지 탭에서는 전체 */}
          {/*
            공지는 홈이 맡는다 — 팀 홈에서 미리보기를 지웠다.
            notices 탭 자체는 남겨 둔다(총무의 공지 CRUD가 여기 있다). 다만 지금은
            여기로 오는 입구가 없다 — 작성은 홈의 「최근 공지」 + 가 연다.
          */}
          {tab === 'notices' && (
          <View style={[styles.card, { gap: 12 }]}>
            {/* 카드 면의 결 — 정산 카드와 같은 값·같은 방향. 목록에서 조명이 하나로 읽힌다 */}
            <SoftTint tone="green" radius={radius.card} />
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>공지사항</Text>
              <View style={styles.sectionHeadRight}>
                {isAdmin && (
                  <Pressable
                    hitSlop={14}
                    onPress={() => {
                      setEditingAnnouncement(null);
                      setFormVisible(true);
                    }}
                  >
                    <Ionicons name="add-circle-outline" size={20} color={colors.green} />
                  </Pressable>
                )}
                <Pressable
                  onPress={() => setListVisible(true)}
                  hitSlop={14}
                  accessibilityRole="link"
                  accessibilityLabel="공지 전체 보기"
                >
                  <Text style={styles.sectionLink}>전체 보기 ›</Text>
                </Pressable>
              </View>
            </View>

            {/* 공지 탭에서는 고정 공지를 본문까지 펼쳐 맨 위에 세운다 —
                "지금 모두가 알아야 하는" 내용이라 제목만 보여주면 한 번 더 눌러야 한다.
                팀 홈에서는 목록에 배지로만 표시한다(자리를 많이 먹으면 미리보기가 아니게 된다). */}
            {tab === 'notices' &&
              announcements
                .filter((a) => a.is_pinned)
                .map((a) => (
                  <Pressable
                    key={`pinned-${a.id}`}
                    onPress={() => setSelectedAnnouncement(a)}
                    style={({ pressed }) => [styles.pinnedCard, pressed && styles.pressed]}
                  >
                    <View style={styles.pinnedHead}>
                      <Ionicons name="pin" size={13} color={colors.green} />
                      <Text style={styles.pinnedTitle} numberOfLines={1}>
                        {a.title}
                      </Text>
                    </View>
                    <Text style={styles.pinnedBody} numberOfLines={3}>
                      {a.body}
                    </Text>
                  </Pressable>
                ))}

            {announcements.length === 0 ? (
              <Text style={styles.empty}>등록된 공지가 없어요</Text>
            ) : (
              <View>
                {(tab === 'notices' ? announcements : announcements.slice(0, 3)).map((a) => (
                  <Pressable
                    key={a.id}
                    onPress={() => setSelectedAnnouncement(a)}
                    style={({ pressed }) => [styles.noticeRow, pressed && styles.pressed]}
                  >
                    {a.is_pinned && (
                      <View style={styles.pinBadge}>
                        <Text style={styles.pinBadgeText}>고정</Text>
                      </View>
                    )}
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.noticeTitle} numberOfLines={1}>
                        {a.title}
                      </Text>
                      <Text style={styles.noticeBody} numberOfLines={1}>
                        {a.body}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
          )}

          {/* 투표 — 공지와 같은 성격이라 같은 탭에 둔다 */}
          {/*
            공지는 홈이 맡는다 — 팀 홈에서 미리보기를 지웠다.
            notices 탭 자체는 남겨 둔다(총무의 공지 CRUD가 여기 있다). 다만 지금은
            여기로 오는 입구가 없다 — 작성은 홈의 「최근 공지」 + 가 연다.
          */}
          {tab === 'notices' && (
          <View style={[styles.card, { gap: 12 }]}>
            {/* 카드 면의 결 — 정산 카드와 같은 값·같은 방향. 목록에서 조명이 하나로 읽힌다 */}
            <SoftTint tone="green" radius={radius.card} />
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>투표</Text>
              {isAdmin && (
                <Pressable
                  onPress={() => setPollFormVisible(true)}
                  hitSlop={14}
                  accessibilityRole="button"
                  accessibilityLabel="투표 만들기"
                >
                  <Ionicons name="add-circle-outline" size={20} color={colors.green} />
                </Pressable>
              )}
            </View>
            {polls.length === 0 ? (
              <Text style={styles.empty}>등록된 투표가 없어요</Text>
            ) : (
              polls.map((poll) => (
                <PollCard
                  key={poll.id}
                  poll={poll}
                  selfMemberId={activeTeam.membershipId}
                  isAdmin={isAdmin}
                  onVote={(optionIndex) => votePoll(poll.id, optionIndex)}
                  onDelete={() => confirm('투표 삭제', '이 투표를 삭제하시겠어요?', () => deletePoll(poll.id))}
                />
              ))
            )}
          </View>
          )}

          {/* 로그아웃은 「내 설정」으로 옮겼다 — 계정에 딸린 동작이라 팀 화면에 있을 이유가 없다 */}
        </View>
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

const styles = StyleSheet.create({
  pressed: { opacity: 0.85 },

  banner: {
    ...shadow.raised,
    marginHorizontal: 20,
    marginTop: 4,
    borderRadius: radius.hero,
    backgroundColor: colors.cardRaised,
  },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 20 },
  emblem: {
    // rounded-square. 원형은 인스타 프로필을 그대로 옮긴 모양이었는데, 이건 사람 사진이
    // 아니라 팀 로고다 — 엠블럼은 방패·사각이 원형보다 자연스럽고, 아래 Bento 격자의
    // 사각 타일들과도 모양이 맞는다.
    width: 66,
    height: 66,
    borderRadius: radius.tile,
    overflow: 'hidden',
    backgroundColor: 'rgba(7,16,13,0.55)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.28)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamStats: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4 },
  emblemImage: { width: '100%', height: '100%' },
  emblemInitials: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', letterSpacing: -0.5 },
  emblemHint: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: '800' },
  emblemEdit: {
    position: 'absolute',
    right: -5,
    bottom: -5,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.green,
    borderWidth: 2,
    borderColor: '#12211A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerBody: { flex: 1, gap: 6 },
  teamName: { color: '#FFFFFF', fontSize: 21, fontWeight: '800', letterSpacing: -0.4 },
  teamMeta: { color: colors.textDim, fontSize: 11, fontWeight: '600' },
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
  footBadge: {
    minWidth: 20,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: colors.inputBg,
    alignItems: 'center',
  },
  footBadgeText: { color: colors.textDim, fontSize: 10, fontWeight: '800' },

  /** 나란한 액션 버튼 — 인스타 프로필의 편집/공유 자리 */
  /** 멤버 3명 이하 — 공유 버튼이 주, 코드가 부 */
  inviteBig: {
    marginHorizontal: 20,
    marginTop: 12,
    padding: 16,
    gap: 8,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardAlt,
  },
  inviteBigTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  inviteBigSub: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  inviteShare: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    height: 44, marginTop: 4,
    borderRadius: radius.button, borderCurve: 'continuous',
    backgroundColor: colors.green,
  },
  inviteShareText: { color: colors.bgRoot, fontSize: 14, fontWeight: '800' },
  inviteCodeLine: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 },

  /*
   * 카드로 감싼다 — 멤버 목록과 같은 들여쓰기면 마지막 멤버의 하위 항목처럼 읽힌다.
   * 면·테두리·반경은 다른 카드와 같은 값이라 목록에서 따로 놀지 않는다.
   */
  myRecord: {
    marginHorizontal: 20,
    marginTop: 16,
    padding: 16,
    gap: 12,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  myRecordTitle: { color: colors.text, ...font.title },
  /** 총무 동작 — 카드가 아니라 줄이다. 그리드 넷을 걷어낸 자리에 블록을 다시 세우지 않는다 */
  adminRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 20,
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.control,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardAlt,
  },

  /** 멤버가 적을 때 아래가 왜 비었는지 — 한 줄이면 충분하다 */
  profileLine: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  growHint: {
    marginHorizontal: 20,
    marginTop: 14,
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },

  inviteBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 46, // 코드 전체가 복사 버튼이다 — 표적도 버튼만큼 커야 한다
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.inputBg,
  },
  inviteLabel: { color: colors.textDim, fontSize: 11, fontWeight: '700' },
  inviteCode: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.5,
    fontVariant: ['tabular-nums'],
  },

  /** 슬로건 — 팀명 아래 한 줄 */
  sloganRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  slogan: { color: colors.textBody, fontSize: 12, fontWeight: '600' },
  sloganEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sloganInput: {
    flex: 1,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.35)',
    color: '#FFFFFF',
    fontSize: 12,
  },

  /** 등번호 유니폼 — 숫자를 옷 안에 얹는다 */
  jersey: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  jerseyNumber: {
    position: 'absolute',
    color: colors.green,
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },

  /** 총무 상단 탭 */

  /** 멤버 검색 */
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 42,
    paddingHorizontal: 12,
    borderRadius: radius.button,
    backgroundColor: colors.inputBg,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 13 },

  /** 팀 홈 가로 명단 */
  /** 카드 없이 흐르는 멤버 줄 — 좌우 여백만 카드와 맞춘다 */
  /* 멤버 한둘일 때의 가로 행 — 아바타는 스트립(52)과 같게 두고 배치만 눕힌다 */
  soloList: { gap: 4 },
  soloRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 4 },
  soloAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardAlt,
  },
  soloName: { color: colors.textStrong, fontSize: 14, fontWeight: '700' },

  rosterStrip: { paddingHorizontal: 4, paddingTop: 4 },
  rosterRow: { gap: 14, paddingVertical: 2 },
  rosterItem: { width: 62, alignItems: 'center', gap: 5 },
  rosterAvatar: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.inputBg,
  },
  rosterPhoto: { width: 52, height: 52, borderRadius: 26 },
  avatarPhoto: { width: '100%', height: '100%', borderRadius: 999 },
  rosterInitial: { color: colors.textStrong, fontSize: 14, fontWeight: '800' },
  rosterAdminDot: {
    position: 'absolute',
    bottom: -3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 999,
    backgroundColor: colors.gold,
  },
  rosterAdminText: { color: colors.bgRoot, fontSize: 10, fontWeight: '800' },
  rosterName: { color: colors.textStrong, fontSize: 11, fontWeight: '700' },
  rosterMeta: { color: colors.textDim, fontSize: 10, fontWeight: '600' },
  rosterMore: { backgroundColor: colors.greenTint, borderColor: colors.greenDeep },
  rosterMoreText: { color: colors.green, fontSize: 13, fontWeight: '800' },

  /** 고정 공지 — 공지 탭 맨 위 */
  pinnedCard: {
    gap: 6,
    padding: 13,
    borderRadius: radius.button,
    backgroundColor: colors.greenTint,
    borderWidth: 1,
    borderColor: colors.greenDeep,
  },
  pinnedHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pinnedTitle: { flex: 1, color: colors.textStrong, fontSize: 13, fontWeight: '800' },
  pinnedBody: { color: colors.textDim, fontSize: 12, lineHeight: 18 },

  /** 팀 나가기 */
  leaveRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  leaveText: { color: colors.danger, fontSize: 13, fontWeight: '700' },

  /** 알림 토글 */

  /** 멤버 초대 버튼 */
  inviteAvatar: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.greenLine,
  },
  inviteRowName: { color: colors.green, fontSize: 14, fontWeight: '700' },

  /** 설정 탭 — 라벨/값 한 줄 */

  /** 내 정보 (팀원) */
  myInfoRow: { flexDirection: 'row', gap: 12 },
  myInfoLabel: { color: colors.textDim, fontSize: 11, fontWeight: '700' },
  myInfoChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.greenTint,
    borderWidth: 1,
    borderColor: colors.greenDeep,
  },
  myInfoChipAlt: { backgroundColor: colors.inputBg, borderColor: colors.border },
  myInfoChipText: { color: colors.green, fontSize: 12, fontWeight: '800' },
  myInfoChipTextAlt: { color: colors.textStrong },

  content: { padding: 20, gap: 14 },
  card: {
    ...shadow.card,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderCurve: 'continuous',
    padding: 20,
  },

  rowTitle: { color: colors.text, fontSize: 13, fontWeight: '800' },
  rowSub: { color: colors.textMuted, fontSize: 11, fontWeight: '500' },

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionHeadRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  // 다른 탭의 섹션 제목은 15/-0.2였다 — 팀 탭만 14.5라 나란히 놓으면 어긋나 보인다
  sectionHeadLink: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  sectionTitle: { color: colors.text, ...font.section },
  sectionLink: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  empty: { color: colors.textFaint, fontSize: 12, fontWeight: '600' },

  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#8FA69C', fontSize: 11, fontWeight: '800' },
  memberName: { color: colors.textStrong, fontSize: 13, fontWeight: '700' },
  memberMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  memberMeta: { color: colors.textDim, fontSize: 11, fontWeight: '600' },
  memberMetaDot: { color: colors.textFaint, fontSize: 11 },
  memberRole: { color: colors.textFaint, fontSize: 10, fontWeight: '800' },
  moreText: { color: colors.green, fontSize: 12, fontWeight: '700' },
  adminBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#6B5426',
  },
  adminBadgeText: { color: colors.gold, fontSize: 10, fontWeight: '800' },

  noticeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  pinBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: 'rgba(34,197,94,0.14)',
    marginTop: 1,
  },
  pinBadgeText: { color: colors.green, fontSize: 10, fontWeight: '800' },
  noticeTitle: { color: colors.textStrong, fontSize: 13, fontWeight: '700' },
  noticeBody: { color: colors.textDim, fontSize: 11, fontWeight: '500' },
});
