// src/features/team/screens/TeamHomeScreen.tsx — 팀 화면 간결화판
// 기존 기능은 100% 유지: 공지 CRUD, 멤버 관리(강퇴/부총무/실력), 투표, 팀 대표 지역, 로그아웃.
//
// ⚠ 수정 요약 (승인된 간결화 반영):
// 1) 카드 2개를 배너로 흡수 — 초대 코드는 배너 하단 바로, 엠블럼 설정은 연필 배지로만.
//    (독립 "팀 엠블럼 설정" 카드 + "초대 코드" 카드를 없앴다 → 총무 화면에서 카드 2개 감소)
// 2) 다른 탭과 동일하게 TabHeader를 붙였다 — 기존 marginTop:60 하드코딩 제거.
// 3) 로그아웃은 배너 안이 아니라 화면 맨 아래로 (파괴적 액션은 상단에 두지 않는다).
import { useEffect, useState } from 'react';
import { Alert, Image, Platform, Pressable, Share, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../../../components/nativeText';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useAuthStore } from '../../auth/stores/authStore';
import { useTeamStore } from '../stores/teamStore';
import { useAttendanceStore } from '../../attendance/stores/attendanceStore';
import { useAnnouncementsStore } from '../../announcements/stores/announcementsStore';
import { AnnouncementFormModal } from '../../announcements/components/AnnouncementFormModal';
import { AnnouncementListModal } from '../../announcements/components/AnnouncementListModal';
import { AnnouncementDetailModal } from '../../announcements/components/AnnouncementDetailModal';
import type { AnnouncementRow } from '../../announcements/services/announcementsService';
import { MemberListModal } from '../components/MemberListModal';
import { BoardPanel } from '../../board/components/BoardPanel';
import { fetchPosts, resolveAuthor, type Post } from '../../board/services/boardService';
import { relativeTime } from '../../../lib/relativeTime';
import { usePollsStore } from '../../polls/stores/pollsStore';
import { PollFormModal } from '../../polls/components/PollFormModal';
import { PollCard } from '../../polls/components/PollCard';
import { ScreenGradient, useTabBarPadding } from '../../../components/ScreenGradient';
import { TabHeader } from '../../../components/TabHeader';
import { PlaceSearchModal } from '../../attendance/components/PlaceSearchModal';
import type { PlaceResult } from '../../attendance/services/placeService';
import { colors, font, radius } from '../../../theme';
import { POSITION_COLOR, POSITION_INFO, positionLabel, toPosition } from '../positions';
import { clearTeamLogo, pickSquareImage, uploadTeamLogo } from '../../settings/services/avatarService';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;

function initialOf(name: string) {
  return name.length > 2 ? name.slice(1) : name;
}

export function TeamHomeScreen({ navigation }: any) {
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
  const loadMatches = useAttendanceStore((s) => s.loadMatches);

  const [memberListVisible, setMemberListVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  /** 팀 탭 안의 네 화면. 총무·팀원 모두 같은 탭을 쓰고, 안에서 할 수 있는 일만 달라진다 */
  const [tab, setTab] = useState<'home' | 'members' | 'notices' | 'board' | 'settings'>('home');
  const [memberQuery, setMemberQuery] = useState('');
  const [logoUploading, setLogoUploading] = useState(false);
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
    // 헤더의 "경기 N" 지표에 쓴다 — 일정 탭을 한 번도 안 들렀으면 비어 있다
    loadMatches();
    if (myUserId) {
      fetchPosts(activeTeam.team.id, myUserId)
        .then((list) => setRecentPosts(list.slice(0, 2)))
        .catch(() => setRecentPosts([])); // 미리보기라 실패하면 섹션만 사라진다
    }
  }, [activeTeam?.team.id, myUserId]);

  const confirm = (title: string, message: string, onYes: () => void, confirmLabel = '삭제') => {
    if (Platform.OS === 'web') {
      if (window.confirm(message)) onYes();
      return;
    }
    Alert.alert(title, message, [
      { text: '아니오', style: 'cancel' },
      { text: confirmLabel, style: 'destructive', onPress: onYes },
    ]);
  };

  if (!activeTeam) return null;

  const isAdmin = activeTeam.role === 'admin';
  const me = members.find((m) => m.id === activeTeam.membershipId) ?? null;
  const inviteUrl = `${SUPABASE_URL}/functions/v1/invite-redirect?code=${activeTeam.team.invite_code}`;
  const createdAt = new Date(activeTeam.team.created_at ?? Date.now());

  const handleCopyInviteCode = async () => {
    await Clipboard.setStringAsync(activeTeam.team.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleShareInvite = () => {
    Share.share({
      message: `${activeTeam.team.name}에 초대할게요! 아래 링크를 눌러 참여해주세요.\n${inviteUrl}`,
    });
  };

  const handleSaveSlogan = async () => {
    const trimmed = sloganText.trim();
    setSloganEditing(false);
    // 빈 문자열 대신 null — "빈 슬로건"과 "안 정함"을 굳이 구분할 이유가 없다
    await updateSlogan(trimmed || null);
  };

  const handleLeaveTeam = () => {
    confirm('팀 나가기', `${activeTeam.team.name}에서 나갈까요?`, () => {
      leaveTeam().catch((err) => {
        const msg = err instanceof Error ? err.message : '팀을 나가지 못했어요';
        if (Platform.OS === 'web') window.alert(msg);
        else Alert.alert('나갈 수 없어요', msg);
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
      const msg = err instanceof Error ? err.message : '로고를 올리지 못했어요';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('저장 실패', msg);
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
  /** 이 팀에 등록된 경기 수 — 스토어의 matches는 활성 팀 것만 담긴다 */
  const teamMatchCount = matches.length;

  /** 다음 경기 — 킥오프 3시간 뒤까지는 "다음"으로 본다 (홈·경기운영과 같은 기준) */
  const nextMatch =
    matches
      .filter((m) => new Date(m.match_date).getTime() >= Date.now() - 3 * 60 * 60 * 1000)
      .sort((a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime())[0] ?? null;
  const attendCount = nextMatch?.votes.filter((v) => v.status === 'attend').length ?? 0;

  /** 팀 홈은 앞의 다섯만, 멤버 탭은 전체(검색어가 있으면 걸러서) */
  const visibleMembers =
    tab === 'members'
      ? members.filter((m) => m.displayName.toLowerCase().includes(memberQuery.trim().toLowerCase()))
      : members.slice(0, 5);

  return (
    <ScreenGradient>
      {/* 팀 화면에서는 "팀"이라는 제목이 아무것도 알려주지 않는다 — 팀 이름을 제목으로 쓴다 */}
      <TabHeader title={activeTeam.team.name} />

      {/* 팀 홈이 허브다 — 아래 격자에서 각 화면으로 들어가고, 들어가면 뒤로가기로 돌아온다.
          탭 바를 위에 상시로 두면 격자와 같은 곳으로 가는 입구가 둘이 된다. */}
      {tab !== 'home' && (
        <View style={styles.subHeader}>
          <Pressable onPress={() => setTab('home')} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color={colors.textStrong} />
          </Pressable>
          <Text style={styles.subHeaderTitle}>
            {tab === 'members' ? '멤버 관리' : tab === 'notices' ? '공지사항' : tab === 'board' ? '게시판' : '설정'}
          </Text>
          {/* 그 화면에서 새로 만드는 동작 — 없는 화면은 자리만 비워 제목이 가운데 오게 한다 */}
          {tab === 'notices' && isAdmin ? (
            <Pressable
              onPress={() => {
                setEditingAnnouncement(null);
                setFormVisible(true);
              }}
              hitSlop={10}
            >
              <Ionicons name="add" size={24} color={colors.green} />
            </Pressable>
          ) : tab === 'members' ? (
            <Pressable onPress={handleShareInvite} hitSlop={10}>
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
          {/* 잔디 배경(FieldBackground)을 걷어냈다 — 초록 줄무늬와 원형 얼룩이 이름·지표 뒤에 깔려
              글자가 배경에 묻혔다. 팀 로고가 이 카드의 색을 정해야지 배경이 정하면 안 된다. */}
          <View style={styles.bannerRow}>
            <View>
              <Pressable
                onPress={isAdmin ? handlePickEmblem : undefined}
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
                  hitSlop={8}
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
            </View>
          </View>

          {/* 지표 — 로고·이름 아래 전체 폭. 인스타 프로필의 게시물/팔로워 줄과 같은 자리다 */}
          <View style={styles.statsRow}>
            {[
              { n: teamMatchCount, label: '경기' },
              { n: members.length, label: '멤버' },
              { n: announcements.length, label: '공지' },
            ].map((s) => (
              <View key={s.label} style={styles.statItem}>
                <Text style={styles.statNumber}>{s.n}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.bannerBelow}>
            <View style={styles.bannerBody}>

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
                  <Pressable onPress={handleSaveSlogan} hitSlop={8}>
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
                    hitSlop={6}
                  >
                    <Text style={styles.slogan} numberOfLines={1}>
                      {activeTeam.team.slogan || '한 줄 소개를 적어보세요'}
                    </Text>
                    {isAdmin && <Ionicons name="settings-outline" size={12} color={colors.textDim} />}
                  </Pressable>
                )
              )}
            </View>
          </View>

          {/* 초대 코드 공유는 총무 전용이 아니다 — 홈의 "친구 초대하기"가 멤버를 여기로 보내는데
              총무만 볼 수 있으면 멤버는 눌러도 아무것도 못 하는 막다른 길이 된다. */}
          {/* 「초대 공유 / 팀 설정」 버튼 줄은 뺐다 — 바로 아래 상자의 설정·멤버 관리와 겹친다.
              초대는 멤버 관리 화면의 + 버튼이 맡는다. */}

          {/* 코드 자체를 눌러도 복사된다 — 옆의 작은 아이콘만 노리게 하지 않는다 */}
          <Pressable onPress={handleCopyInviteCode} style={styles.inviteBar} hitSlop={6}>
            <Text style={styles.inviteLabel}>초대 코드</Text>
            <Text style={styles.inviteCode} numberOfLines={1}>
              {activeTeam.team.invite_code}
            </Text>
            <Ionicons
              name={copied ? 'checkmark' : 'copy-outline'}
              size={14}
              color={copied ? colors.green : colors.textDim}
            />
          </Pressable>
        </View>
        )}

        <View style={styles.content}>
          {/* 기능 입구 — 팀 홈에서 각 화면으로 들어가는 유일한 길이다 */}
          {tab === 'home' && (
            <View style={styles.quickGrid}>
              {[
                { key: 'members' as const, icon: 'people-outline', label: '멤버 관리' },
                { key: 'notices' as const, icon: 'megaphone-outline', label: '공지사항' },
                { key: 'board' as const, icon: 'chatbubbles-outline', label: '게시판' },
                { key: 'settings' as const, icon: 'settings-outline', label: '설정' },
              ].map((q) => (
                <Pressable
                  key={q.key}
                  onPress={() => setTab(q.key)}
                  style={({ pressed }) => [styles.quickItem, pressed && styles.pressed]}
                >
                  <Ionicons name={q.icon as any} size={20} color={colors.green} />
                  <Text style={styles.quickLabel}>{q.label}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {tab === 'board' && !!myUserId && (
            <BoardPanel teamId={activeTeam.team.id} myUserId={myUserId} isAdmin={isAdmin} />
          )}

          {/* 다음 경기 — 팀 화면에서 "언제 모이지"가 가장 먼저 궁금하다.
              투표는 일정 탭에서만 한다(홈과 같은 규칙) — 여기선 눌러서 넘어간다. */}
          {tab === 'home' && !!nextMatch && (
            <Pressable
              onPress={() =>
                navigation.navigate('Attendance', { focusDate: new Date(nextMatch.match_date).toISOString() })
              }
              style={({ pressed }) => [styles.card, { gap: 10 }, pressed && styles.pressed]}
            >
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>다음 경기</Text>
                <Text style={styles.sectionLink}>전체 일정 ›</Text>
              </View>
              <View style={styles.nextMatchRow}>
                <Ionicons name="football-outline" size={17} color={colors.green} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.nextMatchDate}>
                    {new Date(nextMatch.match_date).toLocaleDateString('ko-KR', {
                      month: 'long',
                      day: 'numeric',
                      weekday: 'short',
                    })}{' '}
                    {new Date(nextMatch.match_date).toLocaleTimeString('ko-KR', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                    })}
                  </Text>
                  <Text style={styles.nextMatchPlace} numberOfLines={1}>
                    {nextMatch.location ?? '장소 미정'}
                  </Text>
                </View>
                <View style={styles.attendBadge}>
                  <Text style={styles.attendBadgeText}>참석 {attendCount}</Text>
                </View>
              </View>
            </Pressable>
          )}

          {/* 내 정보 (팀원) — 총무는 「멤버」 탭에서 전원을 한 번에 본다.
              포지션·실력은 팀 분배와 포메이션이 그대로 쓰는 값이라 본인이 확인할 자리가 필요하다. */}
          {tab === 'home' && !isAdmin && !!me && (
            <View style={[styles.card, { gap: 12 }]}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>내 정보</Text>
                <Pressable onPress={() => setMemberListVisible(true)} hitSlop={8}>
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
          {tab === 'settings' && (
            <View style={[styles.card, { gap: 0 }]}>
              <Text style={[styles.sectionTitle, { marginBottom: 10 }]}>팀 정보</Text>

              <View style={styles.infoRow}>
                <Text style={styles.infoRowLabel}>팀 이름</Text>
                <Text style={styles.infoRowValue}>{activeTeam.team.name}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoRowLabel}>팀 지역</Text>
                <Text style={styles.infoRowValue}>{activeTeam.team.home_place_name ?? '미설정'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoRowLabel}>팀 소개</Text>
                <Text style={styles.infoRowValue} numberOfLines={1}>
                  {activeTeam.team.slogan ?? '미설정'}
                </Text>
              </View>
              <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
                <Text style={styles.infoRowLabel}>개설일</Text>
                <Text style={styles.infoRowValue}>
                  {createdAt.getFullYear()}.{String(createdAt.getMonth() + 1).padStart(2, '0')}
                </Text>
              </View>

              {isAdmin && (
                <Pressable
                  onPress={() => navigation.navigate('TeamSettings')}
                  style={({ pressed }) => [styles.settingsLink, pressed && styles.pressed]}
                >
                  <Ionicons name="options-outline" size={17} color={colors.green} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.rowTitle}>운영 설정</Text>
                    <Text style={styles.rowSub}>정기모임 · 회비 · 계좌 · 실력 레벨 · 게스트</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
                </Pressable>
              )}
            </View>
          )}

          {/* 알림 설정 — 사람마다 다른 값이라 총무도 자기 것만 바꾼다.
              끄면 실제로 안 온다: notify-team 함수가 이 컬럼으로 수신자를 거른다. */}
          {tab === 'settings' && !!me && (
            <View style={[styles.card, { gap: 2 }]}>
              <Text style={[styles.sectionTitle, { marginBottom: 6 }]}>알림 설정</Text>
              {(
                [
                  { col: 'notify_new_match' as const, label: '새 일정 알림', on: me.notifyNewMatch },
                  { col: 'notify_announcement' as const, label: '공지 알림', on: me.notifyAnnouncement },
                  { col: 'notify_deadline' as const, label: '참석 마감 알림', on: me.notifyDeadline },
                ]
              ).map((row) => (
                <Pressable
                  key={row.col}
                  onPress={() => updateNotifyPref(me.id, row.col, !row.on)}
                  style={({ pressed }) => [styles.toggleRow, pressed && styles.pressed]}
                >
                  <Text style={styles.toggleLabel}>{row.label}</Text>
                  <View style={[styles.toggle, row.on && styles.toggleOn]}>
                    <View style={[styles.toggleKnob, row.on && styles.toggleKnobOn]} />
                  </View>
                </Pressable>
              ))}
              <Text style={styles.hint}>이 팀에서 오는 알림만 조절해요. 다른 팀은 따로 설정합니다</Text>
            </View>
          )}

          {/* 관리 — 되돌리기 어려운 동작이라 설정 맨 아래에 따로 둔다 */}
          {tab === 'settings' && (
            <View style={[styles.card, { gap: 4 }]}>
              <Text style={[styles.sectionTitle, { marginBottom: 6 }]}>관리</Text>
              <Pressable
                onPress={handleLeaveTeam}
                style={({ pressed }) => [styles.leaveRow, pressed && styles.pressed]}
              >
                <Ionicons name="exit-outline" size={17} color={colors.danger} />
                <Text style={styles.leaveText}>팀 나가기</Text>
              </Pressable>
              <Text style={styles.hint}>
                나가면 이 팀의 경기·정산을 볼 수 없어요. 다시 들어오려면 초대 코드가 필요합니다.
              </Text>
            </View>
          )}

          {/* 팀 대표 지역 — 설정 탭으로 옮겼다. 팀 홈은 "우리 팀이 누구인지"를 보는 자리고,
              지역은 한 번 정해두고 거의 안 건드리는 값이라 설정이 맞다. */}
          {tab === 'settings' && isAdmin && (
            <View style={[styles.card, { gap: 10 }]}>
              <Text style={styles.label}>팀 대표 지역</Text>
              <PlaceSearchModal
                value={activeTeam.team.home_place_name ? { name: activeTeam.team.home_place_name } : null}
                onSelect={(place: PlaceResult) =>
                  updateHomeLocation({
                    placeName: place.name,
                    address: place.address,
                    latitude: place.latitude,
                    longitude: place.longitude,
                  })
                }
              />
              <Text style={styles.hint}>경기 없는 날의 예상 날씨를 이 위치 기준으로 보여줘요</Text>
            </View>
          )}

          {/* 멤버 — 팀 정보·멤버 관리 두 탭에서 보인다 (팀원은 탭이 없어 항상) */}
          {(tab === 'home' || tab === 'members') && (
          <View style={[styles.card, { gap: 12 }]}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>
                {tab === 'members' ? '전체' : '멤버'} {members.length}명
              </Text>
              {tab === 'home' ? (
                <Pressable onPress={() => setTab('members')} hitSlop={8}>
                  <Text style={styles.sectionLink}>전체 보기 ›</Text>
                </Pressable>
              ) : (
                isAdmin && (
                  <Pressable onPress={() => setMemberListVisible(true)} hitSlop={8}>
                    <Text style={styles.sectionLink}>관리 ›</Text>
                  </Pressable>
                )
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
            {tab === 'home' ? (
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
                  <View key={m.id} style={styles.memberRow}>
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
                      {/* 포지션과 실력은 팀 분배·포메이션이 그대로 쓰는 값이라
                          목록에서 바로 보여야 누가 비어 있는지 알 수 있다 */}
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
                        <Text style={styles.memberMeta}>{m.skillTag ?? '실력 미지정'}</Text>
                      </View>
                    </View>
                    {isTeamAdmin ? (
                      <View style={styles.adminBadge}>
                        <Text style={styles.adminBadgeText}>총무</Text>
                      </View>
                    ) : (
                      <Text style={styles.memberRole}>멤버</Text>
                    )}
                  </View>
                );
              })}
              {visibleMembers.length === 0 && (
                <Text style={styles.empty}>{memberQuery ? '찾는 이름이 없어요' : '아직 멤버가 없어요'}</Text>
              )}
            </View>
            )}

            {/* 초대는 멤버 탭의 주된 행동이라 버튼으로 세운다 */}
            {tab === 'members' && (
              <Pressable
                onPress={handleShareInvite}
                style={({ pressed }) => [styles.inviteCta, pressed && styles.pressed]}
              >
                <Ionicons name="person-add-outline" size={16} color={colors.bgRoot} />
                <Text style={styles.inviteCtaText}>멤버 초대하기</Text>
              </Pressable>
            )}
          </View>
          )}

          {/* 최근 게시글 — 팀 홈에서 "요즘 무슨 얘기가 오가나"를 보여준다.
              두 개만 — 더 보여주면 미리보기가 아니라 목록이 되고, 그건 게시판 화면 몫이다. */}
          {tab === 'home' && recentPosts.length > 0 && (
            <View style={[styles.card, { gap: 12 }]}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>최근 게시글</Text>
                <Pressable onPress={() => setTab('board')} hitSlop={8}>
                  <Text style={styles.sectionLink}>전체 보기 ›</Text>
                </Pressable>
              </View>
              {recentPosts.map((p) => {
                const author = resolveAuthor(p, members);
                return (
                <Pressable
                  key={p.id}
                  onPress={() => setTab('board')}
                  style={({ pressed }) => [styles.recentPost, pressed && styles.pressed]}
                >
                  <View style={styles.avatar}>
                    {author.avatar ? (
                      <Image source={{ uri: author.avatar }} style={styles.avatarPhoto} />
                    ) : (
                      <Text style={styles.avatarText}>{author.name.slice(0, 1)}</Text>
                    )}
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.recentPostBody} numberOfLines={2}>
                      {p.body}
                    </Text>
                    <Text style={styles.recentPostMeta}>
                      {author.name} · {relativeTime(p.createdAt)}
                    </Text>
                  </View>
                  {!!p.imageUrl && <Image source={{ uri: p.imageUrl }} style={styles.recentPostThumb} />}
                </Pressable>
                );
              })}
            </View>
          )}

          {/* 공지사항 — 팀 홈에서는 "최근 공지" 미리보기, 공지 탭에서는 전체 */}
          {(tab === 'home' || tab === 'notices') && (
          <View style={[styles.card, { gap: 12 }]}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>{tab === 'home' ? '최근 공지' : '공지사항'}</Text>
              <View style={styles.sectionHeadRight}>
                {isAdmin && (
                  <Pressable
                    hitSlop={8}
                    onPress={() => {
                      setEditingAnnouncement(null);
                      setFormVisible(true);
                    }}
                  >
                    <Ionicons name="add-circle-outline" size={20} color={colors.green} />
                  </Pressable>
                )}
                {/* 팀 홈에서는 공지 화면으로 들어가고, 공지 화면에서는 전체 목록 모달을 연다 */}
                <Pressable onPress={() => (tab === 'home' ? setTab('notices') : setListVisible(true))} hitSlop={8}>
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
          {(tab === 'home' || tab === 'notices') && (
          <View style={[styles.card, { gap: 12 }]}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>투표</Text>
              {isAdmin && (
                <Pressable onPress={() => setPollFormVisible(true)} hitSlop={8}>
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
    marginHorizontal: 20,
    marginTop: 4,
    borderRadius: radius.hero,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    // 배경 무늬 대신 카드색 — 로고와 초록 지표가 이 위에서 또렷하게 읽힌다
    backgroundColor: colors.card,
  },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 20 },
  emblem: {
    // 원형 — 인스타 프로필 사진과 같은 형태. 사각형 로고보다 이름·지표와 어울린다
    width: 66,
    height: 66,
    borderRadius: 33,
    overflow: 'hidden',
    backgroundColor: 'rgba(7,16,13,0.55)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.28)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** 인스타 프로필처럼 로고 오른쪽에 지표 세 개 */
  statsRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  statItem: { flex: 1, alignItems: 'center', gap: 2 },
  statNumber: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
  statLabel: { color: colors.textDim, fontSize: 10.5, fontWeight: '700' },
  bannerBelow: { paddingHorizontal: 20, paddingBottom: 4 },
  emblemImage: { width: '100%', height: '100%' },
  emblemInitials: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', letterSpacing: -0.5 },
  emblemHint: { color: 'rgba(255,255,255,0.5)', fontSize: 8, fontWeight: '800' },
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
  teamName: { color: '#FFFFFF', fontSize: 19, fontWeight: '800', letterSpacing: -0.4 },
  teamMeta: { color: colors.textDim, fontSize: 11, fontWeight: '600' },
  bannerMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  roleBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  roleBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  bannerMeta: { color: 'rgba(255,255,255,0.7)', fontSize: 11.5, fontWeight: '600' },

  /** 하위 화면 헤더 — 뒤로가기 + 제목 + (있으면) 새로 만들기 */
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  subHeaderTitle: { color: colors.textStrong, fontSize: 16, fontWeight: '800' },

  /** 팀 홈 기능 입구 — 상자 하나에 네 칸. 카드 네 장으로 쪼개면 여백만 늘어난다 */
  quickGrid: {
    flexDirection: 'row',
    paddingVertical: 14,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.greenDeep,
  },
  quickItem: { flex: 1, alignItems: 'center', gap: 6 },
  quickLabel: { color: colors.textStrong, fontSize: 11, fontWeight: '700' },

  /** 최근 게시글 미리보기 */
  recentPost: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  recentPostBody: { color: colors.textStrong, fontSize: 12.5, fontWeight: '600', lineHeight: 17 },
  recentPostMeta: { color: colors.textFaint, fontSize: 10.5, fontWeight: '600' },
  recentPostThumb: { width: 46, height: 46, borderRadius: 8, backgroundColor: colors.inputBg },

  /** 다음 경기 */
  nextMatchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  nextMatchDate: { color: colors.text, fontSize: 13, fontWeight: '800' },
  nextMatchPlace: { color: colors.textDim, fontSize: 11.5, fontWeight: '600' },
  attendBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.greenTint },
  attendBadgeText: { color: colors.green, fontSize: 11, fontWeight: '800' },

  /** 주발 배지 — R/L 한 글자 */
  footBadge: {
    minWidth: 20,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: colors.inputBg,
    alignItems: 'center',
  },
  footBadgeText: { color: colors.textDim, fontSize: 9.5, fontWeight: '800' },

  /** 나란한 액션 버튼 — 인스타 프로필의 편집/공유 자리 */
  actionRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 10 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 34,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  actionBtnText: { color: colors.textStrong, fontSize: 12, fontWeight: '800' },

  inviteBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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

  /** 종목·개설월 배지 */
  tag: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.inputBg,
  },
  tagText: { color: '#FFFFFF', fontSize: 10.5, fontWeight: '700' },

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
  topTabs: { flexDirection: 'row', paddingHorizontal: 14, marginTop: 2 },
  topTabItem: { flex: 1, alignItems: 'center', gap: 7, paddingTop: 4 },
  topTabText: { color: colors.textDim, fontSize: 12.5, fontWeight: '700' },
  topTabTextOn: { color: colors.green, fontWeight: '800' },
  topTabBar: { height: 2, width: '100%', backgroundColor: 'transparent' },
  topTabBarOn: { backgroundColor: colors.green },

  /** 멤버 검색 */
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 42,
    paddingHorizontal: 12,
    borderRadius: radius.button,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 13 },

  /** 팀 홈 가로 명단 */
  rosterRow: { gap: 14, paddingVertical: 2 },
  rosterItem: { width: 62, alignItems: 'center', gap: 5 },
  rosterAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
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
  rosterAdminText: { color: colors.bgRoot, fontSize: 8, fontWeight: '800' },
  rosterName: { color: colors.textStrong, fontSize: 11, fontWeight: '700' },
  rosterMeta: { color: colors.textDim, fontSize: 9.5, fontWeight: '600' },
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
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11 },
  toggleLabel: { color: colors.textStrong, fontSize: 12.5, fontWeight: '600' },
  toggle: { width: 42, height: 24, borderRadius: 12, backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', paddingHorizontal: 2 },
  toggleOn: { backgroundColor: colors.greenTint, borderColor: colors.greenDeep },
  toggleKnob: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.textFaint },
  toggleKnobOn: { backgroundColor: colors.green, alignSelf: 'flex-end' },

  /** 멤버 초대 버튼 */
  inviteCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 46,
    borderRadius: radius.button,
    backgroundColor: colors.green,
  },
  inviteCtaText: { color: colors.bgRoot, fontSize: 13.5, fontWeight: '800' },

  /** 설정 탭 — 라벨/값 한 줄 */
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  infoRowLabel: { color: colors.textDim, fontSize: 12.5, fontWeight: '700' },
  infoRowValue: { flexShrink: 1, color: colors.textStrong, fontSize: 12.5, fontWeight: '600', textAlign: 'right' },
  settingsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: radius.button,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
  },

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
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },

  rowCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.greenTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { color: colors.text, fontSize: 13.5, fontWeight: '800' },
  rowSub: { color: colors.textMuted, fontSize: 11.5, fontWeight: '500' },

  label: { color: colors.textDim, fontSize: 11, fontWeight: '700' },
  hint: { color: colors.textFaint, fontSize: 11, fontWeight: '600' },

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionHeadRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  // 다른 탭의 섹션 제목은 15/-0.2였다 — 팀 탭만 14.5라 나란히 놓으면 어긋나 보인다
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
  /** 포지션이 정해진 사람만 초록 — 비어 있는 사람이 한눈에 보인다 */
  memberPos: { color: colors.green, fontWeight: '700' },
  memberMetaDot: { color: colors.textFaint, fontSize: 11 },
  memberRole: { color: colors.textFaint, fontSize: 10.5, fontWeight: '800' },
  moreRow: {
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    alignItems: 'center',
  },
  moreText: { color: colors.green, fontSize: 12, fontWeight: '700' },
  adminBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#6B5426',
  },
  adminBadgeText: { color: colors.gold, fontSize: 10.5, fontWeight: '800' },

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
    backgroundColor: 'rgba(74,222,128,0.14)',
    marginTop: 1,
  },
  pinBadgeText: { color: colors.green, fontSize: 9.5, fontWeight: '800' },
  noticeTitle: { color: colors.textStrong, fontSize: 13, fontWeight: '700' },
  noticeBody: { color: colors.textDim, fontSize: 11.5, fontWeight: '500' },

  signOut: {
    height: 48,
    borderRadius: radius.button,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  signOutText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
});
