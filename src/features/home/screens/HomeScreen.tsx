// src/features/home/screens/HomeScreen.tsx — 시안 적용판
// 구성: 공지 배너 / 히어로 카드 / 이번주 경기 / 내 정산 현황 / 최근 공지.
// 홈에서는 투표하지 않는다. 참여 현황만 보여주고 투표는 일정 탭으로 보낸다 —
// 홈은 다음 경기 하나만 다루기 때문에, 여기서 투표하면 그 경기 말고는 찍을 방법이 없어진다.
// 경기 카드 하단은 버튼 이름만 역할에 따라 갈린다(총무: 경기 관리 / 팀원: 투표하러 가기).
//
// ⚠ 훅 순서 주의: `if (!activeTeam) return null;` 뒤에서 훅을 부르면 activeTeam이
// null → 로드 완료로 바뀌는 순간 훅 개수가 달라져 앱이 죽는다("Rendered more hooks").
// 모든 훅은 조기 리턴보다 위에 두고 activeTeam은 옵셔널 체이닝으로 접근한다.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Text } from '../../../components/nativeText';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ScreenGradient, useTabBarPadding } from '../../../components/ScreenGradient';
import { NotificationBell, SettingsMenu, type NotificationBellHandle } from '../../../components/TabHeader';
import { colors, radius } from '../../../theme';
import { useTeamStore } from '../../team/stores/teamStore';
import { useAuthStore } from '../../auth/stores/authStore';
import { useAttendanceStore } from '../../attendance/stores/attendanceStore';
import { useSettlementStore } from '../../settlement/stores/settlementStore';
import { settlementTitle, settlementPlace } from '../../settlement/utils';
import { shareSettlement } from '../../settlement/links';
import { useSettlementRealtime } from '../../settlement/hooks/useSettlementRealtime';
import { SettlementCard } from '../../settlement/components/SettlementCard';
import { SendMoneySheet } from '../../settlement/components/SendMoneySheet';
import { useAnnouncementsStore } from '../../announcements/stores/announcementsStore';
import { AnnouncementDetailModal } from '../../announcements/components/AnnouncementDetailModal';
import type { AnnouncementRow } from '../../announcements/services/announcementsService';
import { notifyTeam } from '../../notifications/services/pushService';
import { fetchMatchWeather, weatherEmoji, weatherLabel } from '../../attendance/services/weatherService';
import { RosterSheet, type RosterMember } from '../../attendance/components/RosterSheet';
import type { MatchWithVotes } from '../../attendance/services/attendanceService';
import { isVotingOpen, votingLockNote } from '../../attendance/utils/voting';
import { relativeTime } from '../../../lib/relativeTime';

/** 킥오프 3시간 뒤까지는 "다음 경기"로 본다 (경기운영 탭 MATCH_GRACE_MS와 같은 기준) */
const NEXT_MATCH_GRACE_MS = 3 * 60 * 60 * 1000;

// ── 히어로 이미지 ─────────────────────────────────────────────
// 크기 기준을 화면 폭이 아니라 "히어로 높이"로 잡고 위치도 비율로 준다. px로 고정하면
// 폭이 넓어질수록 이미지만 커지고 창은 그대로라 구도가 밀려난다(iPad에서 공이 사라졌다).
// 아래 상수 네 개로 크기·위치·농도가 결정된다.
const HERO_IMG = require('../../../../assets/축구공.png');
/** 원본 세로/가로 (축구공.png는 512x512 정사각) */
const HERO_IMG_RATIO = 512 / 512;
/** 공이 히어로 높이의 몇 배를 차지할지 — 1보다 크면 카드 위아래로 자연스럽게 잘린다 */
const HERO_ZOOM = 1.55;
/** 원본에서 공 중심의 세로 위치(0~1). 이 지점을 히어로 세로 중앙에 맞춘다 */
const HERO_FOCUS_Y = 0.33;
/** 공이 카드 오른쪽 밖으로 걸치는 비율 — 오른쪽 끝이 카드 테두리에 잘려 나가는 느낌을 낸다 */
const HERO_OVERHANG = -0.04;
/** 참고 이미지처럼 공은 또렷하게 — 흐릿하게 누르지 않는다 */
const HERO_OPACITY = 1;

/** 히어로는 좌우 20씩 여백을 둔 카드다 — 기준 폭은 화면 폭이 아니라 카드 폭 */
function heroLayout(screenW: number) {
  const cardW = screenW - 40;
  const height = Math.min(Math.max(cardW * 0.3, 96), 112);
  const imgH = height * HERO_ZOOM;
  return {
    height,
    img: {
      width: imgH / HERO_IMG_RATIO,
      height: imgH,
      top: height / 2 - HERO_FOCUS_Y * imgH,
      right: -imgH * HERO_OVERHANG,
      opacity: HERO_OPACITY,
    },
  };
}

/** 경기 날씨 — 온도와 습도를 따로 쓰려고 값 자체를 돌려준다 */
function useMatchWeather(match?: MatchWithVotes | null) {
  const [data, setData] = useState<{ emoji: string; label: string; temp: string; humidity?: string } | null>(null);

  useEffect(() => {
    setData(null);
    if (!match || match.latitude == null || match.longitude == null) return;
    const hours = (new Date(match.match_date).getTime() - Date.now()) / 3600000;
    if (hours > 240 || hours < -3) return;

    let cancelled = false;
    fetchMatchWeather(match.latitude, match.longitude, match.match_date)
      .then((weather) => {
        if (cancelled || !weather.available) return;
        if (weather.range === 'mid') {
          const rain = weather.amWeather?.includes('비') || weather.pmWeather?.includes('비');
          setData({
            emoji: rain ? '🌧️' : '⛅',
            label: rain ? '비' : '흐림',
            temp: `${weather.minTemp}~${weather.maxTemp}°C`,
          });
        } else {
          const pty = weather.precipitationType ?? '0';
          const sky = weather.sky ?? '1';
          setData({
            emoji: weatherEmoji(pty, sky),
            label: weatherLabel(pty, sky),
            temp: `${weather.temperature}°C`,
            humidity: weather.humidity,
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [match?.id, match?.latitude, match?.longitude, match?.match_date]);

  return data;
}

/** "7/25" — 납부 기한 표기 */
function formatDueDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

interface SectionCardProps {
  /** 보여줄 데이터가 없는가 */
  empty: boolean;
  emptyIcon: keyof typeof Ionicons.glyphMap;
  emptyTitle: string;
  emptySub: string;
  /** 아이콘을 위에 두고 가운데 정렬 (경기 카드처럼 빈 상태가 화면의 주인공일 때) */
  emptyCentered?: boolean;
  /** 카드 전체를 눌렀을 때 (없으면 정적 카드) */
  onPress?: () => void;
  /** 빈 상태에서도 함께 보여줄 행동 버튼 */
  emptyAction?: ReactNode;
  /** 데이터가 있을 때 그릴 내용 */
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * 홈의 섹션 카드. 데이터 유무 판단을 이 한 곳에서 하고, 같은 카드가
 * 빈 상태(아이콘 + 안내 + 선택적 행동)와 채워진 상태를 모두 그린다.
 * 섹션마다 삼항 연산자를 따로 두면 카드 껍데기·여백·눌림 처리가 조금씩 어긋난다.
 */
function SectionCard({
  empty,
  emptyIcon,
  emptyTitle,
  emptySub,
  emptyCentered,
  onPress,
  emptyAction,
  children,
  style,
}: SectionCardProps) {
  const body = empty ? (
    <>
      <View style={emptyCentered ? styles.emptyBlock : styles.emptyLine}>
        <View style={[styles.emptyLineIcon, emptyCentered && styles.emptyBlockIcon]}>
          <Ionicons name={emptyIcon} size={emptyCentered ? 26 : 19} color={colors.green} />
        </View>
        <View style={emptyCentered ? styles.emptyBlockText : { flex: 1, gap: 3, minWidth: 0 }}>
          <Text style={[styles.emptyLineTitle, emptyCentered && styles.emptyBlockTitle]}>{emptyTitle}</Text>
          <Text style={[styles.emptyLineSub, emptyCentered && styles.emptyBlockSub]}>{emptySub}</Text>
        </View>
      </View>
      {emptyAction}
    </>
  ) : (
    children
  );

  // 빈 상태에서는 카드를 눌러도 보여줄 게 없다 — 눌림 효과도 주지 않는다
  if (!onPress || empty) return <View style={[styles.card, style]}>{body}</View>;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, style, pressed && styles.pressed]}>
      {body}
    </Pressable>
  );
}

export function HomeScreen({ navigation }: BottomTabScreenProps<any>) {
  const hero = heroLayout(useWindowDimensions().width);
  const bottomPad = useTabBarPadding();
  const activeTeam = useTeamStore((s) => s.activeTeam);
  const hasMultipleTeams = useTeamStore((s) => s.memberships.length > 1);
  const members = useTeamStore((s) => s.members);
  const loadMembers = useTeamStore((s) => s.loadMembers);
  const myUserId = useAuthStore((s) => s.session?.user.id);

  const matches = useAttendanceStore((s) => s.matches);
  const loadMatches = useAttendanceStore((s) => s.loadMatches);

  const current = useSettlementStore((s) => s.current);
  const past = useSettlementStore((s) => s.past);
  const pendingMatches = useSettlementStore((s) => s.pendingMatches);
  const loadSettlements = useSettlementStore((s) => s.load);

  const announcements = useAnnouncementsStore((s) => s.announcements);
  const loadAnnouncements = useAnnouncementsStore((s) => s.loadAnnouncements);

  const [rosterOpen, setRosterOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [reminded, setReminded] = useState(false);
  /** 공지를 누르면 이 벨의 알림 패널을 연다 — 공지와 알림을 한 곳에서 본다 */
  const bellRef = useRef<NotificationBellHandle>(null);
  const [noticeDetail, setNoticeDetail] = useState<AnnouncementRow | null>(null);

  const membershipId = activeTeam?.membershipId;
  const isAdmin = activeTeam?.role === 'admin';

  useEffect(() => {
    if (!activeTeam) return;
    loadMatches();
    loadMembers();
    loadAnnouncements();
    loadSettlements(activeTeam.team.id, activeTeam.membershipId);
  }, [activeTeam?.team.id]);

  /** 정산만 다시 불러온다 — 남이 입금 상태를 바꾸면 이 카드의 숫자가 달라진다 */
  const reloadSettlements = useCallback(() => {
    if (!activeTeam) return;
    loadSettlements(activeTeam.team.id, activeTeam.membershipId);
  }, [activeTeam?.team.id, activeTeam?.membershipId]);

  // 홈에 돌아올 때마다 갱신 — 팀 변경 시에만 불러서 예전 숫자가 남아 있었다
  useFocusEffect(reloadSettlements);
  // 홈을 보고 있는 동안 팀원이 입금했다고 누르면 진행률이 저절로 따라간다
  useSettlementRealtime(current?.id ?? null, reloadSettlements);

  // ── 여기부터 모든 훅은 조기 리턴보다 위에 있어야 한다 ──────────────
  const next = useMemo(() => {
    const from = Date.now() - NEXT_MATCH_GRACE_MS;
    return (
      matches
        .filter((m) => new Date(m.match_date).getTime() >= from)
        .sort((a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime())[0] ?? null
    );
  }, [matches]);

  const weather = useMatchWeather(next);

  const myShare = useMemo(() => current?.shares.find((s) => s.isMe) ?? null, [current]);

  /** 상단 배너에 띄울 공지 — 고정 공지 우선, 없으면 최신 */
  const topNotice = useMemo(() => {
    if (announcements.length === 0) return null;
    return announcements.find((a) => a.is_pinned) ?? announcements[0];
  }, [announcements]);

  const rosterMembers: RosterMember[] = useMemo(() => {
    if (!next) return [];
    return members.map((m) => {
      const v = next.votes.find((vv) => vv.team_member_id === m.id)?.status;
      return {
        id: m.id,
        name: m.displayName,
        position: m.skillTag ? `실력 ${m.skillTag}` : null,
        role: m.role,
        status: v ?? 'pending',
        isMe: m.id === membershipId,
      };
    });
  }, [next, members, membershipId]);
  // ── 훅 끝 ────────────────────────────────────────────────────

  if (!activeTeam) return null;

  const attendCount = next ? next.votes.filter((v) => v.status === 'attend').length : 0;
  const absentCount = next ? next.votes.filter((v) => v.status === 'absent').length : 0;
  // 미정 = 아직 투표 안 한 사람 + 미정으로 찍은 사람
  const undecidedCount = Math.max(0, members.length - attendCount - absentCount);
  const myVote = next?.votes.find((v) => v.team_member_id === activeTeam.membershipId)?.status ?? null;

  /** 참여율 — 투표에 잡힌 전체 인원 대비 참석 비율 */
  const voteTotal = attendCount + undecidedCount + absentCount;
  const attendRate = voteTotal > 0 ? Math.round((attendCount / voteTotal) * 100) : 0;

  // 일정 화면과 같은 판정을 쓴다 (utils/voting.ts) — 여기서 따로 계산하면 또 어긋난다
  const voteOpen = next ? isVotingOpen(next) : false;
  const lockNote = next ? votingLockNote(next, isAdmin ?? false) : null;

  // ── 정산 집계 ────────────────────────────────────────────────
  const shares = current?.shares ?? [];
  const paidCount = shares.filter((s) => s.paid).length;
  const unpaidCount = shares.filter((s) => !s.paid).length;
  const unpaidAmount = shares.filter((s) => !s.paid).reduce((t, s) => t + s.amount, 0);
  const openCount = current ? 1 : 0;
  // useMemo를 쓰지 않는다 — 이 아래는 조기 리턴 뒤라 훅을 두면 렌더마다 훅 개수가 달라진다
  const thisMonthNow = new Date();
  const thisMonthTotal = [...(current ? [current] : []), ...past]
    .filter((s) => {
      const d = new Date(s.createdAt);
      return d.getFullYear() === thisMonthNow.getFullYear() && d.getMonth() === thisMonthNow.getMonth();
    })
    .reduce((t, s) => t + s.totalAmount, 0);

  /** 정산 링크를 팀에 공유 — 정산 탭과 같은 메시지를 쓴다 (links.ts) */
  const handleShare = () => {
    if (!current) return;
    shareSettlement(current, settlementTitle(current, matches));
  };

  const remindNotVoted = () => {
    if (!next) return;
    const notVotedUserIds = members
      .filter((m) => !next.votes.some((v) => v.team_member_id === m.id))
      .map((m) => m.userId);
    if (notVotedUserIds.length === 0) return;
    const dateLabel = new Date(next.match_date).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
    notifyTeam(
      activeTeam.team.id,
      `${activeTeam.team.name} 참석 투표 독촉`,
      `${dateLabel} 경기 참석 투표를 아직 안 하셨어요 — 지금 투표해주세요`,
      myUserId,
      notVotedUserIds,
      'deadline'
    ).catch(() => {
      // 알림 전송 실패는 조용히 무시
    });
    setReminded(true);
    setTimeout(() => setReminded(false), 2000);
  };

  const matchDate = next ? new Date(next.match_date) : null;

  /**
   * 일정 탭의 그 경기로 보낸다.
   *
   * 날짜를 실어 보내야 한다 — 일정 화면은 기본이 오늘이라, 다음 경기가 내일이면
   * 그냥 넘어갔을 때 빈 날짜가 열려서 정작 투표할 카드가 안 보인다.
   */
  const goToMatchSchedule = () =>
    navigation.navigate('Attendance', matchDate ? { focusDate: matchDate.toISOString() } : undefined);

  return (
    // flat을 뗐다 — 히어로 카드가 불투명해서 배경 그라데이션과 겹칠 일이 없고,
    // 홈만 배경이 밋밋하면 탭을 옮길 때 화면이 바뀐 것처럼 보인다
    <ScreenGradient>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
        showsVerticalScrollIndicator={false}
      >
        {/* 상단 바 — 다른 탭(TabHeader)과 같은 자리에 화면 이름 + 팀명, 오른쪽엔 설정 메뉴 + 알림 벨 */}
        <View style={styles.topBar}>
          <View style={styles.topBarTitleRow}>
            <Text style={styles.topBarTitle}>홈</Text>
            {/* TabHeader와 같은 규칙 — 팀이 둘 이상일 때만 어느 팀인지 밝힌다 */}
            {hasMultipleTeams && !!activeTeam?.team.name && (
              <Text style={styles.topBarTeam} numberOfLines={1}>
                {activeTeam.team.name}
              </Text>
            )}
          </View>
          {/* 다른 탭 헤더와 같은 순서 — 알림이 왼쪽, 설정이 오른쪽 */}
          <View style={styles.topBarIcons}>
            <NotificationBell ref={bellRef} />
            <SettingsMenu />
          </View>
        </View>

        {/* 공지 배너 — 아래 「최근 공지」와 같은 곳(알림 패널)으로 보낸다 */}
        {!!topNotice && (
          <Pressable
            onPress={() => bellRef.current?.open()}
            style={({ pressed }) => [styles.noticeBar, pressed && styles.pressed]}
          >
            <Ionicons name="megaphone-outline" size={19} color={colors.green} />
            <Text style={styles.noticeTag}>공지</Text>
            <Text style={styles.noticeText} numberOfLines={1}>
              {topNotice.title}
            </Text>
            <Ionicons name="chevron-forward" size={17} color={colors.textDim} />
          </Pressable>
        )}

        {/* 히어로 카드 */}
        <View style={[styles.heroCard, { height: hero.height }]}>
          {/* 공 혼자면 카드가 밋밋해 보여서, 공이 있는 자리를 중심으로 은은한 초록 글로우를 깐다.
              RN엔 원형(radial) 그라디언트가 없어 대각선 LinearGradient로 근사한다 —
              로그인 화면 히어로 글로우와 같은 기법. */}
          <LinearGradient
            colors={['rgba(74,222,128,0.45)', 'rgba(74,222,128,0.1)', 'rgba(74,222,128,0)']}
            locations={[0, 0.3, 0.6]}
            start={{ x: 0.9, y: 0.05 }}
            end={{ x: 0.05, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          {/* 알파가 있는 이미지라 뒤의 배경색이 그대로 비친다.
              aspectRatio + 절대배치는 RNW에서 크기가 안 잡혀 사라지므로 직접 계산한다. */}
          <Image
            source={HERO_IMG}
            style={[styles.heroImage, hero.img]}
            resizeMode="cover"
          />
          <View style={styles.heroText}>
            <Text style={styles.brand}>
              <Text style={{ color: colors.green }}>Kick</Text>Day
            </Text>
            <Text style={styles.brandSub}>풋살, 연결의 시작</Text>
          </View>
        </View>

        {/* 이번주 경기 */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>이번주 경기</Text>
          <Pressable onPress={() => navigation.navigate('Attendance')} hitSlop={8} style={styles.sectionLinkRow}>
            <Text style={styles.sectionLink}>전체보기</Text>
            <Ionicons name="chevron-forward" size={15} color={colors.textDim} />
          </Pressable>
        </View>

        <SectionCard
          empty={!next || !matchDate}
          emptyIcon="calendar-outline"
          emptyCentered
          emptyTitle="예정된 경기가 없습니다"
          emptySub={
            isAdmin ? '일정 탭에서 새 경기를 만들 수 있어요' : '팀장이 경기를 등록하면 여기에 표시됩니다'
          }
          emptyAction={
            /* 경기 만들기는 일정 탭 소관이다 — 홈은 "다음 경기 하나"만 보여주는 자리라
               만드는 입구까지 두면 같은 기능이 두 곳에 있는 것으로 보인다.
               총무는 일정 탭으로 보내고, 팀원에게는 안내만 남긴다. */
            isAdmin ? (
              <Pressable
                onPress={() => navigation.navigate('Attendance')}
                style={({ pressed }) => [styles.attendBtn, styles.emptyBtn, pressed && styles.pressed]}
              >
                <Ionicons name="calendar-outline" size={18} color={colors.green} />
                <Text style={styles.attendText}>일정으로 가기</Text>
              </Pressable>
            ) : (
              <View style={[styles.attendBtn, styles.emptyBtn, styles.emptyNoteBtn]}>
                <Ionicons name="people-outline" size={16} color={colors.green} />
                <Text style={styles.emptyNoteText}>팀원으로 참여하면 일정을 확인할 수 있어요!</Text>
              </View>
            )
          }
          style={styles.matchCard}
        >
          {next && matchDate && (
            <>
              <Pressable
                onPress={goToMatchSchedule}
                style={({ pressed }) => [styles.matchHead, pressed && styles.pressed]}
              >
              <View style={styles.dateBox}>
                <Text style={styles.dateMon}>{matchDate.getMonth() + 1}월</Text>
                <Text style={styles.dateDay}>{matchDate.getDate()}</Text>
                <Text style={styles.dateDow}>
                  {matchDate.toLocaleDateString('ko-KR', { weekday: 'long' })}
                </Text>
              </View>

              <View style={styles.matchInfo}>
                <View style={styles.timeRow}>
                  {/* 시안은 "오후 07:00" — hour:'numeric'이면 "오후 7:00"이 된다 */}
                  <Text style={styles.matchTime}>
                    {matchDate.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  {/* match_type은 20260806 마이그레이션 전이면 없다 */}
                  {!!next.match_type && (
                    <View style={styles.typeChip}>
                      <Text style={styles.typeChipText}>{next.match_type}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.matchPlace} numberOfLines={1}>
                  {next.location ?? '장소 미정'}
                </Text>
                {!!weather && (
                  <View style={styles.weatherRow}>
                    {/* 일정 탭과 같은 표기 — 예전엔 날씨와 상관없이 구름 아이콘이라
                        비 오는 날에도 구름이 떠서 홈만 보고는 우천을 알 수 없었다 */}
                    <Text style={styles.weatherEmoji}>{weather.emoji}</Text>
                    <Text style={styles.weatherItem}>{weather.temp}</Text>
                    <Text style={styles.weatherItem}>{weather.label}</Text>
                    {!!weather.humidity && (
                      <>
                        <View style={styles.weatherDivider} />
                        <Ionicons name="water-outline" size={15} color={colors.textMuted} />
                        <Text style={styles.weatherItem}>습도 {weather.humidity}</Text>
                      </>
                    )}
                  </View>
                )}
              </View>

              <Ionicons name="chevron-forward" size={19} color={colors.textDim} />
            </Pressable>

            <View style={styles.cardDivider} />

            {/* 참여 현황은 총무·팀원이 똑같이 본다. 투표는 일정 화면에서만 한다 —
                홈은 다음 경기 하나만 보여주므로, 여기서 투표하면 그 경기 말고는 찍을 수가 없다. */}
            <View style={styles.statsHead}>
              <Text style={styles.statsTitle}>참여 현황</Text>
              <Text style={styles.statsRate}>참여율 {attendRate}%</Text>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Ionicons name="person-outline" size={17} color={colors.green} />
                <Text style={styles.statText}>{attendCount}명</Text>
              </View>
              <View style={styles.statItem}>
                <Ionicons name="ellipse-outline" size={17} color={colors.textMuted} />
                <Text style={styles.statText}>{undecidedCount}명</Text>
              </View>
              <View style={styles.statItem}>
                <Ionicons name="close-circle" size={17} color={colors.danger} />
                <Text style={styles.statText}>{absentCount}명</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${attendRate}%` }]} />
              </View>
            </View>

            <View style={styles.cardBtnRow}>
              <Pressable
                onPress={() => setRosterOpen(true)}
                style={({ pressed }) => [styles.ghostBtn, pressed && styles.pressed]}
              >
                <Text style={styles.ghostBtnText}>참여 현황 보기</Text>
              </Pressable>
              {/* 총무는 마감 뒤에도 경기를 관리한다. 팀원에게는 투표가 열려 있을 때만 보낸다 —
                  마감된 경기에 "투표하러 가기"는 눌러봐야 아무것도 못 하는 거짓 안내다. */}
              {(isAdmin || voteOpen) && (
                <Pressable
                  onPress={goToMatchSchedule}
                  style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
                >
                  <Ionicons name={isAdmin ? 'people' : 'checkmark-circle'} size={17} color={colors.bgRoot} />
                  {/* 이미 찍은 사람에게 "투표하러 가기"는 안 한 것처럼 읽힌다 */}
                  <Text style={styles.primaryBtnText}>
                    {isAdmin ? '경기 관리' : myVote ? '투표 변경하기' : '투표하러 가기'}
                  </Text>
                </Pressable>
              )}
            </View>

            {/* 버튼이 그냥 없으면 왜 없는지 알 수 없다 */}
            {!isAdmin && !voteOpen && !!lockNote && <Text style={styles.cardNote}>{lockNote}</Text>}
            </>
          )}
        </SectionCard>

        {/* 내 정산 현황 */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>내 정산 현황</Text>
          <Pressable onPress={() => navigation.navigate('Settlement')} hitSlop={8} style={styles.sectionLinkRow}>
            <Text style={styles.sectionLink}>전체보기</Text>
            <Ionicons name="chevron-forward" size={15} color={colors.textDim} />
          </Pressable>
        </View>

        {current && isAdmin ? (
          /* ── 총무: 정산 탭과 같은 카드(배지+링+빠른 액션) — 홈에서도 바로 송금/공유할 수 있게 */
          <View style={styles.settlementCardWrap}>
            <SettlementCard
              title={settlementTitle(current, matches)}
              place={settlementPlace(current, matches)}
              attendCount={current.shares.length}
              statusLabel="진행중"
              unpaidCount={unpaidCount}
              pct={current.shares.length ? paidCount / current.shares.length : 0}
              amount={current.totalAmount}
              perPerson={current.perPerson}
              onPress={() => navigation.navigate('Settlement')}
              onPrimaryAction={() => setSendOpen(true)}
              onShare={handleShare}
            />
          </View>
        ) : (
          <SectionCard
            empty={!current}
            emptyIcon="wallet-outline"
            /* 바로 아래 "이번달 정산"에 금액이 떠 있는데 "내역이 없습니다"라고 하면 서로 어긋난다.
               진행 중인 게 없는 것과 아예 없는 것은 다른 상태다. */
            emptyTitle={past.length > 0 ? '진행 중인 정산이 없어요' : '정산 내역이 없습니다'}
            emptySub={
              past.length > 0
                ? '지난 정산은 전체보기에서 볼 수 있어요'
                : '경기 후 정산 내역이 여기에 표시됩니다'
            }
            emptyAction={
              /* 빈 상태에도 숫자는 보여준다 — 화면이 죽지 않고, 이번 달 흐름을 알 수 있다 */
              <View style={styles.miniStatRow}>
                <View style={styles.miniStat}>
                  <Text style={styles.miniStatLabel}>진행중</Text>
                  <Text style={styles.miniStatValue}>{openCount}건</Text>
                </View>
                <View style={styles.miniStat}>
                  <Text style={styles.miniStatLabel}>미납 금액</Text>
                  <Text style={styles.miniStatValue}>{unpaidAmount.toLocaleString()}원</Text>
                </View>
                <View style={styles.miniStat}>
                  <Text style={styles.miniStatLabel}>이번달 정산</Text>
                  <Text style={styles.miniStatValue}>{thisMonthTotal.toLocaleString()}원</Text>
                </View>
              </View>
            }
            onPress={() => navigation.navigate('Settlement')}
          >
            {current && myShare ? (
              /* ── 팀원: 내 몫 ── */
              <View style={styles.dueRow}>
                <View style={styles.walletIcon}>
                  <Ionicons name="wallet-outline" size={21} color={colors.green} />
                </View>
                <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
                  <Text style={styles.dueLabel} numberOfLines={1}>
                    {current.memo || '경기 정산'}
                  </Text>
                  <Text style={styles.dueAmount}>{myShare.amount.toLocaleString()}원</Text>
                </View>
                <View style={styles.dueRight}>
                  <View style={[styles.dueChip, myShare.paid ? styles.dueChipPaid : styles.dueChipUnpaid]}>
                    <Text style={[styles.dueChipText, { color: myShare.paid ? colors.green : colors.danger }]}>
                      {myShare.paid ? '완납' : myShare.markedPaid ? '확인 대기' : '미납'}
                    </Text>
                  </View>
                  {/* due_date는 총무가 정했을 때만 있다 (20260806 마이그레이션) */}
                  {!!current.dueDate && (
                    <View style={styles.dueDateRow}>
                      {/* 시안은 "~7/25" — ko-KR 로캘은 "7. 25."로 찍혀서 직접 만든다 */}
                      <Text style={styles.dueDateText}>납부 기한 ~{formatDueDate(current.dueDate)}</Text>
                    </View>
                  )}
                </View>
              </View>
            ) : null}
          </SectionCard>
        )}

        {/* 최근 공지 */}
        {/* 공지를 누르면 알림 패널을 연다 — 그 패널이 이미 공지와 알림을 함께 보여준다.
            따로 공지 목록을 띄우면 같은 내용을 두 화면으로 나눠 보게 된다. */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>최근 공지</Text>
          <Pressable onPress={() => bellRef.current?.open()} hitSlop={8} style={styles.sectionLinkRow}>
            <Text style={styles.sectionLink}>전체보기</Text>
            <Ionicons name="chevron-forward" size={15} color={colors.textDim} />
          </Pressable>
        </View>

        <SectionCard
          empty={announcements.length === 0}
          emptyIcon="megaphone-outline"
          emptyTitle="등록된 공지가 없습니다"
          emptySub="새로운 공지가 등록되면 여기에 표시됩니다"
        >
          {announcements.slice(0, 3).map((a, i) => (
            <Pressable
              key={a.id}
              onPress={() => bellRef.current?.open()}
              style={({ pressed }) => [styles.noticeRow, i > 0 && styles.noticeRowDivided, pressed && styles.pressed]}
            >
              <View style={styles.noticeDot} />
              <Text style={styles.noticeRowText} numberOfLines={1}>
                {a.title}
              </Text>
              <Text style={styles.noticeTime}>{relativeTime(a.created_at)}</Text>
            </Pressable>
          ))}
        </SectionCard>

        {/* 경기가 없을 때만 — 화면 아래를 비워두지 않고 다음 행동을 안내한다 */}
        {!next &&
          (isAdmin ? (
            <View style={styles.tipCard}>
              <Image source={HERO_IMG} style={styles.tipBall} resizeMode="contain" />
              <Text style={styles.tipTitle}>KickDay TIP</Text>
              <Text style={styles.tipBody}>경기를 만들면 참석 투표, 날씨 정보, 정산이 자동으로 생성돼요!</Text>
            </View>
          ) : (
            <Pressable
              onPress={() => navigation.navigate('Team')}
              style={({ pressed }) => [styles.card, styles.inviteCard, pressed && styles.pressed]}
            >
              <View style={styles.emptyLineIcon}>
                <Ionicons name="people-outline" size={19} color={colors.green} />
              </View>
              <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
                <Text style={styles.emptyLineTitle}>친구 초대하기</Text>
                <Text style={styles.emptyLineSub}>친구를 초대하고 함께 풋살을 즐겨보세요!</Text>
              </View>
              <Ionicons name="chevron-forward" size={17} color={colors.textDim} />
            </Pressable>
          ))}
      </ScrollView>

      {/* 공지 목록 모달은 걷어냈다 — 홈의 공지를 누르면 알림 패널이 열리고,
          그 패널이 공지와 알림을 시간순으로 함께 보여준다. 목록을 두 벌 두지 않는다.
          (작성·수정·삭제는 팀 탭이 담당한다) */}
      <AnnouncementDetailModal
        announcement={noticeDetail}
        isAdmin={false}
        onClose={() => setNoticeDetail(null)}
        onEdit={() => {}}
        onDelete={() => {}}
      />

      {!!next && (
        <RosterSheet
          visible={rosterOpen}
          onClose={() => setRosterOpen(false)}
          matchLabel={`${new Date(next.match_date).toLocaleDateString('ko-KR', {
            month: 'long',
            day: 'numeric',
            weekday: 'short',
          })} ${new Date(next.match_date).toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          })}${next.location ? ` · ${next.location}` : ''}`}
          capacity={next.capacity ?? 12}
          deadlineLabel={undefined}
          members={rosterMembers}
          isAdmin={!!isAdmin}
        />
      )}

      {/* 정산 카드의 "계좌 송금" — 정산 탭과 같은 시트를 그대로 쓴다 */}
      <SendMoneySheet
        visible={sendOpen}
        onClose={() => setSendOpen(false)}
        bankName={current?.bankName ?? ''}
        accountNo={current?.accountNo ?? ''}
        holder={current?.accountHolder ?? ''}
        amount={myShare?.amount ?? 0}
      />
    </ScreenGradient>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 8, gap: 16 },
  pressed: { opacity: 0.85 },

  // ── 상단 바 ───────────────────────────────────────────────
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  topBarTitleRow: { flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 8, minWidth: 0 },
  topBarTitle: { color: colors.text, fontSize: 21, fontWeight: '800', letterSpacing: -0.4 },
  topBarTeam: { color: '#5F6B66', fontSize: 12, fontWeight: '600', flexShrink: 1 },
  topBarIcons: { flexDirection: 'row', alignItems: 'center', gap: 14 },

  // ── 히어로 카드 ───────────────────────────────────────────
  heroCard: {
    marginHorizontal: 20,
    borderRadius: radius.hero,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#0A100D',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  heroImage: { position: 'absolute', right: 0 },
  heroText: { paddingHorizontal: 22, gap: 6 },
  brand: { color: colors.text, fontSize: 34, fontWeight: '800', letterSpacing: -1.2 },
  brandSub: { color: colors.textBody, fontSize: 13.5, fontWeight: '600' },

  // ── 공지 배너 ─────────────────────────────────────────────
  noticeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginHorizontal: 20,
    paddingHorizontal: 16,
    paddingVertical: 15,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noticeTag: { color: colors.green, fontSize: 13.5, fontWeight: '800' },
  noticeText: { flex: 1, color: colors.textStrong, fontSize: 13, fontWeight: '600' },

  // ── 공통 ──────────────────────────────────────────────────
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.4 },
  sectionLink: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  sectionLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginTop: 4,
  },
  card: {
    marginHorizontal: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: 16,
    gap: 10,
  },
  cardEmpty: { color: colors.textFaint, fontSize: 12.5, fontWeight: '600' },

  emptyLine: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  emptyLineIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    // 아이콘만 초록으로 두면 회색 원 안에서 떠 보인다 — 받침도 같은 계열로 깔아준다
    backgroundColor: colors.greenTint,
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyLineTitle: { color: colors.textStrong, fontSize: 13.5, fontWeight: '700' },
  emptyLineSub: { color: colors.textDim, fontSize: 12, fontWeight: '500' },

  // 가운데 정렬 변형 — 아이콘이 위로 가고 글자가 커진다
  emptyBlock: { alignItems: 'center', gap: 12, paddingVertical: 12 },
  emptyBlockIcon: { width: 58, height: 58, borderRadius: 18 },
  emptyBlockText: { alignItems: 'center', gap: 5 },
  emptyBlockTitle: { fontSize: 15.5, color: colors.text },
  emptyBlockSub: { fontSize: 12.5, textAlign: 'center' },

  // 팀원 빈 상태의 안내 배너 — 버튼처럼 생겼지만 누르는 게 아니다
  emptyNoteBtn: { borderStyle: 'dashed', gap: 7 },
  emptyNoteText: { color: colors.green, fontSize: 12.5, fontWeight: '700' },

  // 미정산이 쌓여 있는 상태 — 빈 상태가 아니라 밀린 할 일이라 색을 달리 쓴다
  walletIconTodo: { backgroundColor: 'rgba(210,163,76,0.12)' },
  todoLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  todoLinkText: { color: colors.gold, fontSize: 12.5, fontWeight: '700' },

  // ── 경기 카드 ─────────────────────────────────────────────
  matchCard: {
    marginHorizontal: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: 16,
    gap: 12,
  },
  matchHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  // 날짜는 시안대로 별도의 어두운 서브카드에 넣는다
  dateBox: {
    width: 66,
    paddingVertical: 12,
    borderRadius: radius.tile,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    alignItems: 'center',
    gap: 2,
  },
  dateMon: { color: colors.green, fontSize: 12, fontWeight: '800' },
  dateDay: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -1.2,
    fontVariant: ['tabular-nums'],
  },
  dateDow: { color: colors.textMuted, fontSize: 11.5, fontWeight: '700' },

  matchInfo: { flex: 1, gap: 6, minWidth: 0 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  matchTime: { color: colors.text, fontSize: 19, fontWeight: '800', letterSpacing: -0.5 },
  typeChip: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.greenDeep,
    backgroundColor: colors.greenTint,
  },
  typeChipText: { color: colors.green, fontSize: 11.5, fontWeight: '800' },
  matchPlace: { color: colors.textStrong, fontSize: 14, fontWeight: '600' },
  weatherRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  weatherItem: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  /** 이모지는 폰트 크기로만 조절된다 — 아이콘처럼 색을 줄 수 없다 */
  weatherEmoji: { fontSize: 15 },
  weatherDivider: { width: 1, height: 11, backgroundColor: colors.border, marginHorizontal: 5 },

  attendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.green,
    backgroundColor: 'transparent',
  },
  attendBtnOn: { backgroundColor: colors.green, borderColor: colors.green },
  attendText: { color: colors.green, fontSize: 17, fontWeight: '800' },
  attendTextOn: { color: colors.bgRoot },
  /** 경기 카드 안 가로 구분선 */
  cardDivider: { height: 1, backgroundColor: colors.divider, marginHorizontal: -16 },

  countRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  countItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  countDot: { width: 8, height: 8, borderRadius: 4 },
  countText: { color: colors.textBody, fontSize: 13.5, fontWeight: '600' },

  // ── 총무: 참여 현황 ───────────────────────────────────────
  statsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statsTitle: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  statsRate: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statText: { color: colors.text, fontSize: 14.5, fontWeight: '700', fontVariant: ['tabular-nums'] },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.greenTrack,
    overflow: 'hidden',
    marginLeft: 4,
  },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: colors.green },

  cardBtnRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ghostBtn: {
    flex: 1,
    height: 48,
    borderRadius: radius.button,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostBtnText: { color: colors.textStrong, fontSize: 14, fontWeight: '700' },
  /** 버튼이 없는 이유를 적는 자리 (예: 투표 마감) */
  cardNote: { color: colors.textMuted, fontSize: 12, fontWeight: '700', textAlign: 'center' },

  // 카드 안 3열 숫자 요약 (1인당·완료·대기 / 진행중·미납·이번달)
  miniStatRow: {
    flexDirection: 'row',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  miniStat: { flex: 1, alignItems: 'center', gap: 4 },
  miniStatLabel: { color: colors.textDim, fontSize: 11.5, fontWeight: '600' },
  miniStatValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },

  // 경기가 없을 때만 나오는 안내 카드
  tipCard: {
    marginHorizontal: 20,
    padding: 16,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.greenDeep,
    backgroundColor: colors.greenTint,
    gap: 5,
    overflow: 'hidden',
  },
  tipBall: { position: 'absolute', right: -18, bottom: -22, width: 96, height: 96, opacity: 0.18 },
  tipTitle: { color: colors.green, fontSize: 13.5, fontWeight: '800' },
  tipBody: { color: colors.textBody, fontSize: 12.5, fontWeight: '500', lineHeight: 19, paddingRight: 60 },
  inviteCard: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    height: 48,
    borderRadius: radius.button,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  primaryBtnText: { color: colors.bgRoot, fontSize: 14, fontWeight: '800' },

  // ── 빈 상태 ───────────────────────────────────────────────
  // 카드 껍데기는 SectionCard가 styles.card로 그린다 — 여기엔 행동 버튼 여백만 남는다
  emptyBtn: { marginTop: 4 },

  // ── 내 정산 현황 ──────────────────────────────────────────
  // SettlementCard는 정산 탭의 리스트(자체 좌우 패딩 있는 ScrollView) 안에서 쓰도록
  // marginHorizontal 없이 만들어져 있다 — 홈에서는 이 래퍼로 카드 여백을 맞춘다.
  settlementCardWrap: { marginHorizontal: 20 },
  dueRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  walletIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.greenTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dueLabel: { color: colors.textMuted, fontSize: 12.5, fontWeight: '600' },
  dueAmount: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  dueRight: { alignItems: 'flex-end', gap: 7 },
  dueDateRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  dueDateText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  dueChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1 },
  dueChipUnpaid: { backgroundColor: 'rgba(248,113,113,0.12)', borderColor: 'rgba(248,113,113,0.45)' },
  dueChipPaid: { backgroundColor: colors.greenTint, borderColor: colors.greenDeep },
  dueChipText: { fontSize: 11, fontWeight: '800' },

  // ── 최근 공지 ─────────────────────────────────────────────
  noticeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  noticeRowDivided: { borderTopWidth: 1, borderTopColor: colors.borderSoft },
  noticeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  noticeRowText: { flex: 1, color: colors.textStrong, fontSize: 13.5, fontWeight: '600' },
  noticeTime: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },

});
