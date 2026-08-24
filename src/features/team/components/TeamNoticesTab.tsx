// src/features/team/components/TeamNoticesTab.tsx
// 공지사항 + 투표 — 팀 탭의 notices 화면.
//
// ⚠ 현재 진입점이 없다. TeamHomeScreen에서 tab이 'notices'가 되는 경로가 없어서
//   이 화면은 그려지지 않는다. TeamHomeScreen에 있던 주석을 그대로 옮겨 적는다:
//
//     공지는 홈이 맡는다 — 팀 홈에서 미리보기를 지웠다.
//     notices 탭 자체는 남겨 둔다(총무의 공지 CRUD가 여기 있다). 다만 지금은
//     여기로 오는 입구가 없다 — 작성은 홈의 「최근 공지」 + 가 연다.
//
//   지우지 않는 이유가 그것이다. 총무의 공지 작성·수정·삭제와 투표 CRUD가 전부
//   여기 있고, 다시 필요해질 때 만들기보다 되살리는 쪽이 싸다.
//
// TeamHomeScreen 1550줄에서 갈라져 나왔다. 옮기기만 했고 내용은 손대지 않았다.
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { SoftTint } from '../../../components/BentoCard';
import { Text } from '../../../components/nativeText';
import { PollCard } from '../../polls/components/PollCard';
import { colors, font, radius, shadow } from '../../../theme';
import type { AnnouncementRow } from '../../announcements/services/announcementsService';
import type { PollWithResponses } from '../../polls/services/pollsService';

interface Props {
  announcements: AnnouncementRow[];
  polls: PollWithResponses[];
  isAdmin: boolean;
  /** 내 team_members.id — 투표 카드가 내 응답을 표시하는 데 쓴다 */
  selfMemberId: string;
  onCreateAnnouncement: () => void;
  onOpenAnnouncementList: () => void;
  onSelectAnnouncement: (a: AnnouncementRow) => void;
  onEditAnnouncement: (a: AnnouncementRow) => void;
  onCreatePoll: () => void;
  onVotePoll: (pollId: string, optionIndex: number) => void;
  onDeletePoll: (pollId: string) => void;
  /** 삭제 확인 — 화면마다 다른 문구를 쓰지 않으려고 부르는 쪽 것을 받는다 */
  confirm: (title: string, message: string, onYes: () => void, confirmLabel?: string) => void;
}

export function TeamNoticesTab({
  announcements,
  polls,
  isAdmin,
  selfMemberId,
  onCreateAnnouncement,
  onOpenAnnouncementList,
  onSelectAnnouncement,
  onEditAnnouncement,
  onCreatePoll,
  onVotePoll,
  onDeletePoll,
  confirm,
}: Props) {
  return (
    <>
      {/* 공지사항 — 팀 홈에서는 "최근 공지" 미리보기, 공지 탭에서는 전체 */}
      {/*
        공지는 홈이 맡는다 — 팀 홈에서 미리보기를 지웠다.
        notices 탭 자체는 남겨 둔다(총무의 공지 CRUD가 여기 있다). 다만 지금은
        여기로 오는 입구가 없다 — 작성은 홈의 「최근 공지」 + 가 연다.
      */}
      <>
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
                  onCreateAnnouncement();
                }}
              >
                <Ionicons name="add-circle-outline" size={20} color={colors.green} />
              </Pressable>
            )}
            <Pressable
              onPress={onOpenAnnouncementList}
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
        {
          announcements
            .filter((a) => a.is_pinned)
            .map((a) => (
              <Pressable
                key={`pinned-${a.id}`}
                onPress={() => onSelectAnnouncement(a)}
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
            {announcements.map((a) => (
              <Pressable
                key={a.id}
                onPress={() => onSelectAnnouncement(a)}
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
      </>

      {/* 투표 — 공지와 같은 성격이라 같은 탭에 둔다 */}
      {/*
        공지는 홈이 맡는다 — 팀 홈에서 미리보기를 지웠다.
        notices 탭 자체는 남겨 둔다(총무의 공지 CRUD가 여기 있다). 다만 지금은
        여기로 오는 입구가 없다 — 작성은 홈의 「최근 공지」 + 가 연다.
      */}
      <>
      <View style={[styles.card, { gap: 12 }]}>
        {/* 카드 면의 결 — 정산 카드와 같은 값·같은 방향. 목록에서 조명이 하나로 읽힌다 */}
        <SoftTint tone="green" radius={radius.card} />
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>투표</Text>
          {isAdmin && (
            <Pressable
              onPress={onCreatePoll}
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
              selfMemberId={selfMemberId}
              isAdmin={isAdmin}
              onVote={(optionIndex) => onVotePoll(poll.id, optionIndex)}
              onDelete={() => confirm('투표 삭제', '이 투표를 삭제하시겠어요?', () => onDeletePoll(poll.id))}
            />
          ))
        )}
      </View>
      </>
    </>
  );
}

const styles = StyleSheet.create({
  noticeBody: { color: colors.textDim, fontSize: 11, fontWeight: '500' },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  noticeTitle: { color: colors.textStrong, fontSize: 13, fontWeight: '700' },
  pinBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: 'rgba(34,197,94,0.14)',
    marginTop: 1,
  },
  pinBadgeText: { color: colors.green, fontSize: 10, fontWeight: '800' },
  pinnedBody: { color: colors.textDim, fontSize: 12, lineHeight: 18 },
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
  sectionHeadRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  sectionLink: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  card: {
    ...shadow.card,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderCurve: 'continuous',
    padding: 20,
  },
  empty: { color: colors.textFaint, fontSize: 12, fontWeight: '600' },
  pressed: { opacity: 0.85 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: colors.text, ...font.section },
});
