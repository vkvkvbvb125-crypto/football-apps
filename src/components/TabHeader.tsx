// src/components/TabHeader.tsx — 알림 읽음 처리 수정판
// 화면 제목 + 팀명 + 알림 벨(배지). 알림 목록 패널은 이 컴포넌트가 자체적으로 들고 있다.
//
// ⚠ 수정 요약:
// 1) 벨을 누르는 순간 markAllRead()를 호출해서, 패널이 열리기도 전에 안 읽은 표시가 사라졌다.
//    → 열 때 안 읽은 id 목록을 스냅샷으로 잡아두고, 그 항목에만 초록 점을 그린다.
//    실제 읽음 처리는 패널을 닫을 때 한 번 한다(사용자가 새 알림을 확인한 뒤).
// 2) 안 읽은 알림과 읽은 알림이 시각적으로 완전히 동일했다 → 안 읽은 항목에 점 + 밝은 제목.
// 3) 패널이 top:56에 고정돼 있어 노치 기기에서 헤더에 겹쳤다 → 인셋 반영.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './nativeText';
import { alertMessage } from './Dialog';
import { radius, type Palette } from '../theme';
import { useThemed } from '../lib/useThemed';
import { relativeTime } from '../lib/relativeTime';
import { toPlainText } from '../lib/mentions';
import { SwipeToDelete } from './SwipeToDelete';
import { useTeamStore } from '../features/team/stores/teamStore';
import { useNotificationsStore } from '../features/notifications/stores/notificationsStore';
import { useAnnouncementsStore } from '../features/announcements/stores/announcementsStore';

interface TabHeaderProps {
  title: string;
  /**
   * 제목을 누를 수 있게 한다. 넘긴 화면에서만 셰브론이 붙는다 —
   * 다른 탭의 제목은 그냥 화면 이름이라 누를 것이 없다.
   */
  onPressTitle?: () => void;
}

/**
 * 알림 종류를 아이콘으로 구분한다.
 *
 * 알림 행에 종류 컬럼이 없어서 제목으로 짐작한다 — 틀려도 기본 아이콘이 나올 뿐이라
 * 손해가 없고, 종류 컬럼을 추가하는 마이그레이션까지 갈 일은 아니다.
 */
function iconFor(item: { kind: string; title: string }): keyof typeof Ionicons.glyphMap {
  if (item.kind === 'announcement') return 'megaphone-outline';
  const t = item.title;
  if (/정산|입금|회비/.test(t)) return 'wallet-outline';
  if (/투표|참석/.test(t)) return 'checkmark-circle-outline';
  if (/경기|우천|날씨/.test(t)) return 'football-outline';
  return 'notifications-outline';
}

/** 벨 말고 다른 곳(홈의 공지 카드 등)에서 패널을 열 때 쓴다 */
export interface NotificationBellHandle {
  open: () => void;
}

/**
 * 알림 벨 + 알림 패널. 홈 화면은 헤더 대신 히어로 안에 벨만 놓기 때문에
 * TabHeader에서 떼어내 따로 쓸 수 있게 했다 (패널 로직을 두 벌 만들지 않으려고).
 *
 * 여는 방법을 ref로 내보낸다. 전역 상태로 두면 탭 네비게이터에 함께 살아 있는
 * 다른 화면의 벨까지 반응해서 패널이 두 개 열린다.
 */
export const NotificationBell = forwardRef<NotificationBellHandle>(function NotificationBell(_props, ref) {
  const { colors, styles } = useThemed(makeStyles);
  const notifications = useNotificationsStore((s) => s.notifications);
  const loading = useNotificationsStore((s) => s.loading);
  const load = useNotificationsStore((s) => s.load);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);
  const removeNotification = useNotificationsStore((s) => s.remove);
  // 공지 작성자는 notify-team에서 본인이 제외돼 자기 공지가 알림에 안 뜬다 —
  // 그래서 알림 화면엔 공지사항 목록도 같이 섞어서 보여준다 (읽음 상태는 알림에만 있다)
  const announcements = useAnnouncementsStore((s) => s.announcements);
  const loadAnnouncements = useAnnouncementsStore((s) => s.loadAnnouncements);
  const deleteAnnouncement = useAnnouncementsStore((s) => s.deleteAnnouncement);
  const markAnnouncementsRead = useAnnouncementsStore((s) => s.markRead);
  const readCounts = useAnnouncementsStore((s) => s.readCounts);
  const isAdmin = useTeamStore((s) => s.activeTeam?.role) === 'admin';
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();

  const [panelVisible, setPanelVisible] = useState(false);
  /** 패널을 연 시점의 "안 읽음" 스냅샷 — 읽음 처리 후에도 어느 게 새 알림이었는지 보여준다 */
  const [unreadSnapshot, setUnreadSnapshot] = useState<Set<string>>(new Set());
  const hasUnreadOnOpen = useRef(false);
  /** 오른쪽에서 화면이 밀고 들어오는 슬라이드 — 열릴 땐 screenW→0, 닫힐 땐 0→screenW */
  const translateX = useRef(new Animated.Value(screenW)).current;

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  type FeedItem =
    | { kind: 'notification'; id: string; title: string; body: string; created_at: string }
    | { kind: 'announcement'; id: string; title: string; body: string; created_at: string };

  const feed: FeedItem[] = [
    ...notifications.map((n) => ({ kind: 'notification' as const, id: n.id, title: n.title, body: n.body, created_at: n.created_at })),
    ...announcements.map((a) => ({ kind: 'announcement' as const, id: a.id, title: a.title, body: a.body, created_at: a.created_at })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  useEffect(() => {
    load();
    loadAnnouncements();
  }, []);

  const handleOpenBell = () => {
    load();
    loadAnnouncements();
    // 패널을 열면 목록의 공지를 본 것으로 친다 — 총무의 "N명 읽음"이 여기서 쌓인다
    markAnnouncementsRead(announcements);
    setUnreadSnapshot(new Set(notifications.filter((n) => !n.is_read).map((n) => n.id)));
    hasUnreadOnOpen.current = unreadCount > 0;
    setPanelVisible(true);
    translateX.setValue(screenW);
    Animated.timing(translateX, { toValue: 0, duration: 260, useNativeDriver: true }).start();
  };

  useImperativeHandle(ref, () => ({ open: handleOpenBell }));

  /**
   * 공지 삭제 — 팀 전원의 화면에서 사라지고 되돌릴 수 없다. 그래서 한 번 묻는다.
   * 개인 알림은 나만 안 보게 되는 것이라 묻지 않는다.
   */
  /**
   * 공지 삭제 — 확인창 없이 바로 지운다.
   *
   * 쭉 밀어야(행 폭의 45%) 실행되는 동작이라 실수로 닿을 일이 거의 없고,
   * 밀 때마다 창이 뜨면 지우는 맛이 사라진다. 폰 알림 지우는 것과 같은 감각으로 둔다.
   *
   * 다만 공지는 팀 전원에게서 사라지고 되돌릴 수 없다 — 되돌리기가 필요해지면
   * 확인창보다 "실행취소" 쪽이 맞다(지운 뒤 몇 초간 되살릴 기회를 주는 방식).
   */
  const handleDeleteNotice = async (id: string): Promise<boolean> => {
    try {
      await deleteAnnouncement(id);
      return true;
    } catch {
      alertMessage('삭제하지 못했어요', '공지를 지우지 못했어요');
      return false; // 실패하면 행을 되살린다 — 지운 척하고 넘어가면 안 된다
    }
  };

  const handleDelete = (id: string): Promise<boolean> =>
    // 스토어가 먼저 지우고, 실패하면 되살리면서 던진다 — 그때 사용자에게 알리고
    // 밀려 나갔던 행도 제자리로 돌린다
    removeNotification(id)
      .then(() => true)
      .catch((e) => {
        /*
          ⚠ **오류 원문을 사용자에게 보이지 않는다.** `e.message`는 PostgREST·네트워크가
            쓴 영어 개발자 문구라, 사용자는 읽어도 할 수 있는 일이 없다(서랍 3).
            원문은 콘솔로 보내고 화면에는 **할 수 있는 일**을 적는다.
          ⓘ 서랍 3은 이런 자리가 7곳이라고 적어 뒀는데, 재 보니 **여기 하나만** 남아 있었다.
        */
        console.warn('[removeNotification]', e);
        alertMessage('삭제하지 못했어요', '잠시 후 다시 시도해주세요');
        return false;
      });

  const handleClosePanel = () => {
    Animated.timing(translateX, { toValue: screenW, duration: 220, useNativeDriver: true }).start(() => {
      setPanelVisible(false);
      // 읽음 처리는 닫을 때 — 열자마자 지우면 무엇이 새 알림이었는지 알 수 없다
      if (hasUnreadOnOpen.current) {
        markAllRead();
        hasUnreadOnOpen.current = false;
      }
    });
  };

  return (
    <>
      <Pressable
        onPress={handleOpenBell}
        hitSlop={10}
        style={styles.bell}
        accessibilityRole="button"
        accessibilityLabel={unreadCount > 0 ? `알림, 새 알림 ${unreadCount}건` : '알림'}
      >
        <Ionicons name="notifications-outline" size={21} color={colors.textStrong} />
        {/* 숫자 대신 점 하나 — 몇 건인지는 패널을 열면 "새 알림 N건"으로 나온다.
            벨에서 알아야 하는 건 "볼 게 있다" 하나뿐이다. */}
        {unreadCount > 0 && <View style={styles.badge} />}
      </Pressable>

      <Modal visible={panelVisible} transparent animationType="none" onRequestClose={handleClosePanel}>
        <Animated.View style={[styles.screen, { paddingTop: insets.top, transform: [{ translateX }] }]}>
          <View style={styles.screenHead}>
            <Pressable
              onPress={handleClosePanel}
              hitSlop={10}
              style={styles.backBtn}
              accessibilityRole="button"
              accessibilityLabel="닫기"
            >
              <Ionicons name="chevron-back" size={24} color={colors.textStrong} />
            </Pressable>
            <Text style={styles.screenTitle}>알림</Text>
            {unreadSnapshot.size > 0 && <Text style={styles.panelNew}>새 알림 {unreadSnapshot.size}건</Text>}
          </View>

          <ScrollView contentContainerStyle={styles.panelList}>
            {loading && feed.length === 0 ? (
              <ActivityIndicator color={colors.green} style={styles.loadingIndicator} />
            ) : feed.length === 0 ? (
              <Text style={styles.emptyText}>알림이 없어요</Text>
            ) : (
              feed.map((item, i) => {
                const isAnnouncement = item.kind === 'announcement';
                const isNew = !isAnnouncement && unreadSnapshot.has(item.id);
                // 새 알림과 지난 알림 사이에 한 번만 구분선을 넣는다
                const prev = feed[i - 1];
                const startsOld =
                  i > 0 && prev.kind === 'notification' && unreadSnapshot.has(prev.id) && !isNew;
                const icon = iconFor(item);
                const card = (
                  <View style={[styles.item, isNew && styles.itemNew]}>
                      <View style={[styles.itemIcon, isNew && styles.itemIconNew]}>
                        <Ionicons name={icon} size={16} color={isNew ? colors.green : colors.textMuted} />
                      </View>

                      <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
                        <View style={styles.itemTitleRow}>
                          <Text style={[styles.itemTitle, !isNew && styles.itemTitleRead]} numberOfLines={1}>
                            {item.title}
                          </Text>
                          {isAnnouncement && (
                            <View style={styles.tag}>
                              <Text style={styles.tagText}>공지</Text>
                            </View>
                          )}
                          {/* 시간은 오른쪽 끝에 — 제목 길이와 상관없이 자리가 일정해야 훑기 쉽다 */}
                          <Text style={styles.itemTime}>{relativeTime(item.created_at)}</Text>
                        </View>
                        <Text style={styles.itemBody} numberOfLines={3}>
                          {/* 두 줄 미리보기라 색을 입히지 않고 @이름으로만 되돌린다 */}
                          {toPlainText(item.body)}
                        </Text>
                        {/* 총무만 — 팀원에게는 몇 명이 읽었는지가 필요 없고, 안 읽은 사람에게
                            압박으로 읽힐 수도 있다 */}
                        {isAnnouncement && isAdmin && (
                          <Text style={styles.readCount}>
                            {readCounts[item.id] ? `${readCounts[item.id]}명 읽음` : '아직 읽은 사람 없음'}
                          </Text>
                        )}
                      </View>
                  </View>
                );

                return (
                  <View key={`${item.kind}-${item.id}`}>
                    {startsOld && <Text style={styles.groupLabel}>이전 알림</Text>}
                    {/* 공지는 지우면 팀 전원에게서 사라져서 총무만 지울 수 있다.
                        내 알림은 나만 안 보게 되는 것이라 누구나 지운다. */}
                    {isAnnouncement && !isAdmin ? (
                      card
                    ) : (
                      <SwipeToDelete
                        onDelete={() => (isAnnouncement ? handleDeleteNotice(item.id) : handleDelete(item.id))}
                      >
                        {card}
                      </SwipeToDelete>
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>
        </Animated.View>
      </Modal>
    </>
  );
});

/**
 * 톱니 아이콘. 누르면 설정 화면으로 바로 간다.
 *
 * 예전엔 여기서 오른쪽에서 밀고 들어오는 패널이 열리고, 그 안에 「내 설정」과
 * 「로그아웃」 두 줄이 있었다. 「내 설정」을 누르면 다시 설정 화면이 열렸다 —
 * 제목이 「설정」인 화면이 둘 겹쳐서, 설정을 눌렀는데 설정이 나오고 거기 또
 * 설정이 있었다. 패널이 하는 일은 한 번 더 누르게 하는 것뿐이었다.
 *
 * 로그아웃도 그 패널과 설정 화면 양쪽에 있었다. 패널을 걷으면 자리가 하나로 준다 —
 * 같은 파괴적 동작이 두 곳에 있으면 어느 쪽이 진짜인지 아무도 모른다.
 */
export function SettingsButton() {
  const { colors, styles } = useThemed(makeStyles);
  const navigation = useNavigation<any>();

  return (
    <Pressable
      onPress={() => navigation.navigate('MySettings')}
      hitSlop={10}
      style={styles.bell}
      accessibilityRole="button"
      accessibilityLabel="설정"
    >
      {/* 햄버거(≡)는 "목록이 열린다"로 읽힌다 — 여기서 열리는 건 설정이라 톱니바퀴가 맞다 */}
      <Ionicons name="settings-outline" size={21} color={colors.textStrong} />
    </Pressable>
  );
}
export function TabHeader({ title, onPressTitle }: TabHeaderProps) {
  const { colors, styles } = useThemed(makeStyles);
  const teamName = useTeamStore((s) => s.activeTeam?.team.name);
  // 팀이 하나뿐이면 화면마다 같은 이름을 되풀이할 뿐이다 — 여러 팀에 속했을 때만
  // "지금 어느 팀을 보고 있나"가 정보가 된다
  const hasMultipleTeams = useTeamStore((s) => s.memberships.length > 1);

  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        {onPressTitle ? (
          <Pressable
            onPress={onPressTitle}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`${title} — 팀 바꾸기`}
            style={({ pressed }) => [styles.titleTap, pressed && styles.titlePressed]}
          >
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
          </Pressable>
        ) : (
          <Text style={styles.title}>{title}</Text>
        )}
        {/* 제목이 이미 팀 이름이면(팀 화면) 옆에 또 붙이지 않는다 */}
        {hasMultipleTeams && !!teamName && teamName !== title && (
          <Text style={styles.team} numberOfLines={1}>
            {teamName}
          </Text>
        )}
      </View>
      {/* 알림이 왼쪽, 설정이 오른쪽 — 자주 누르는 쪽(알림)을 먼저 둔다 */}
      <View style={styles.headerIcons}>
        <NotificationBell />
        <SettingsButton />
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  titleTap: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  titlePressed: { opacity: 0.6 },
  titleRow: { flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 8, minWidth: 0 },
  title: { color: colors.text, fontSize: 21, fontWeight: '800', letterSpacing: -0.4 },
  team: { color: colors.textFaint, fontSize: 12, fontWeight: '600', flexShrink: 1 },
  headerIcons: { flexDirection: 'row', alignItems: 'center', gap: 14 },

  bell: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: 1,
    right: 1,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.green,
    // 벨 아이콘 획과 붙어 보이지 않게 배경색으로 테두리를 둘러 띄운다
    borderWidth: 1.5,
    borderColor: colors.bgRoot,
  },

  screen: {
    flex: 1,
    backgroundColor: colors.bgRoot,
  },
  screenHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 14,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  screenTitle: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '800' },
  panelNew: { color: colors.green, fontSize: 11, fontWeight: '700' },
  panelList: { gap: 12, paddingHorizontal: 20, paddingBottom: 24 },
  emptyText: { color: colors.textMuted, fontSize: 13, paddingVertical: 12, textAlign: 'center' },
  loadingIndicator: { paddingVertical: 20 },

  /** 항목마다 카드 — 구분선만 있으면 어디까지가 한 알림인지 흐릿하다 */
  item: {
    flexDirection: 'row',
    gap: 11,
    padding: 13,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  /** 안 읽은 것만 초록 테두리 — 배경까지 바꾸면 목록이 얼룩덜룩해진다 */
  itemNew: { borderColor: colors.greenDeep },

  itemIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.inputBg,
  },
  itemIconNew: { backgroundColor: colors.greenTint },

  itemTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: colors.greenTint,
  },
  tagText: { color: colors.green, fontSize: 10, fontWeight: '800' },
  itemTitle: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '800' },
  itemTitleRead: { color: colors.textStrong, fontWeight: '700' },
  itemBody: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  itemTime: { color: colors.textFaint, fontSize: 11, fontWeight: '600' },
  /** 총무만 보는 읽음 집계 — 본문보다 작고 흐리게, 눈에 먼저 들어오면 안 된다 */
  readCount: { color: colors.textDim, fontSize: 10, fontWeight: '700', marginTop: 2 },

  /** "이전 알림" — 새 알림과 지난 것 사이 구분 */
  groupLabel: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 10,
    marginBottom: 8,
  },
  });
