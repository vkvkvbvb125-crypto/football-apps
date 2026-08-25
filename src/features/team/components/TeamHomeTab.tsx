// src/features/team/components/TeamHomeTab.tsx
// 팀 홈 탭 — 멤버 미리보기, 내 기록, 팀 설정 진입, 팀 나가기.
//
// TeamHomeScreen에서 갈라져 나왔다. 옮기기만 했고 내용은 손대지 않았다.
// tab === 'home' 조건은 부모가 이미 보장하므로 이 안에서는 상수가 됐다.
//
// 가로 로스터(rosterRow)는 STEP 3의 제거 후보다 — 스탯 바의 「멤버 N명」과 역할이
// 겹치는지 판단이 남아 있어서, 지금은 옮기기만 하고 다듬지 않았다.
import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SoftTint } from '../../../components/BentoCard';
import { StatRow, StatTile } from '../../../components/Surface';
import { Text } from '../../../components/nativeText';
import { colors, font, radius, shadow } from '../../../theme';
import { POSITION_COLOR, POSITION_INFO, toPosition } from '../positions';
import { initialOf } from '../initials';
import { formatMemberRate, memberAttendanceRate, type MemberRateMatch } from '../../attendance/utils/attendanceRate';
import type { TeamMemberWithProfile } from '../services/teamService';

interface Props {
  members: TeamMemberWithProfile[];
  /** 미리보기용으로 부모가 추린 목록 */
  visibleMembers: TeamMemberWithProfile[];
  me: TeamMemberWithProfile | null;
  /** 내 team_members.id — 「(나)」 표시에 쓴다 (멤버 탭과 같은 표현) */
  selfMemberId: string;
  isAdmin: boolean;
  /** 팀 프로필에서 채워진 항목. 비어 있으면 총무에게 채우라고 권한다 */
  profileBits: (string | null)[];
  myUnpaid: number;
  myRateLabel: string;
  memberRateMatches: MemberRateMatch[];
  onOpenMemberList: () => void;
  onGoMembers: () => void;
  onOpenTeamSettings: () => void;
  onLeaveTeam: () => void;
}

export function TeamHomeTab({
  members,
  visibleMembers,
  me,
  selfMemberId,
  isAdmin,
  profileBits,
  myUnpaid,
  myRateLabel,
  memberRateMatches,
  onOpenMemberList,
  onGoMembers,
  onOpenTeamSettings,
  onLeaveTeam,
}: Props) {
  return (
    /* 팀 홈에서는 카드 껍데기를 벗긴다. 배너 아래로 똑같은 상자만 쌓이면
       화면에 리듬이 없다 — 가로로 흐르는 아바타 줄이 상자들 사이에서 숨통이 된다.
       (멤버 탭은 목록이 주인공이라 카드를 유지한다) */
    <View style={[styles.rosterStrip, { gap: 12 }]}>
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
                <Pressable
                  onPress={onGoMembers}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`멤버 ${members.length}명 전체 보기`}
                  style={({ pressed }) => [styles.sectionHeadLink, pressed && styles.pressed]}
                >
                  <Text style={styles.sectionTitle}>멤버 {members.length}명</Text>
                  <Ionicons name="chevron-forward" size={15} color={colors.textFaint} />
                </Pressable>
            </View>

            {/* 팀 홈은 "누가 있나"만 훑는 자리라 가로로 늘어놓는다.
                멤버 탭은 포지션·실력을 견주고 관리까지 하는 자리라 세로 목록이 맞다. */}
            {/*
              멤버가 한둘이면 가로 스트립을 쓰지 않는다.
              62px짜리 아바타 칸 하나가 화면 폭에 혼자 놓이면 오른쪽이 통째로 비어서
              "아직 안 만든 화면"처럼 읽혔다. 같은 정보를 가로로 눕히면 폭을 다 쓴다.
              셋부터는 스트립이 줄로 채워지니 그대로 둔다 — 미리보기라 가로가 맞다.
            */}
            {visibleMembers.length <= 2 ? (
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
                      onPress={onOpenMemberList}
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
                          {m.id === selfMemberId ? ' (나)' : ''}
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
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rosterRow}>
                {visibleMembers.map((m) => {
                  const pos = toPosition(m.position);
                  return (
                    <Pressable key={m.id} onPress={onGoMembers} style={styles.rosterItem}>
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
                        {m.id === selfMemberId ? ' (나)' : ''}
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
                  <Pressable onPress={onGoMembers} style={styles.rosterItem}>
                    <View style={[styles.rosterAvatar, styles.rosterMore]}>
                      <Text style={styles.rosterMoreText}>+{members.length - 5}</Text>
                    </View>
                  </Pressable>
                )}
              </ScrollView>
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
            {!!me && (
              <View style={styles.myRecord}>
                <SoftTint tone="green" radius={radius.card} />
                <Text style={styles.myRecordTitle}>내 기록</Text>
                <StatRow>
                  {/* 값이 「최근 6경기 중 4회」라 라벨에 「최근」을 또 쓰면 겹친다.
                      기간은 값의 「최근 N경기」가 이미 말한다 (최근 3개월 창) */}
                  <StatTile
                    label="참석"
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
            {isAdmin && (
              <Pressable
                onPress={onOpenTeamSettings}
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
            {(
              <Pressable
                onPress={onLeaveTeam}
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
            {isAdmin && profileBits.length === 0 && (
              <Pressable
                onPress={onOpenTeamSettings}
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

            {members.length <= 3 && (
              <Text style={styles.growHint}>멤버가 모이면 참석률과 기록이 쌓여요</Text>
            )}
    </View>
  );
}

const styles = StyleSheet.create({
  rosterStrip: { paddingHorizontal: 4, paddingTop: 4 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionHeadLink: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  sectionTitle: { color: colors.text, ...font.section },
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
  avatarPhoto: { width: '100%', height: '100%', borderRadius: 999 },
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
  rowTitle: { color: colors.text, fontSize: 13, fontWeight: '800' },
  rowSub: { color: colors.textMuted, fontSize: 11, fontWeight: '500' },
  leaveRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  leaveText: { color: colors.danger, fontSize: 13, fontWeight: '700' },
  growHint: {
    marginHorizontal: 20,
    marginTop: 14,
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  pressed: { opacity: 0.85 },
});
