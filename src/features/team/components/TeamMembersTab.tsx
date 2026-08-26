// src/features/team/components/TeamMembersTab.tsx
// 멤버 탭 — 명단, 이름 검색, 행을 눌러 멤버 관리.
//
// TeamHomeScreen에서 갈라져 나왔다. 옮기기만 했고 내용은 손대지 않았다.
// tab === 'members' 조건은 부모가 이미 보장하므로 이 안에서는 상수가 됐다.
//
// 팀 홈의 미리보기(TeamHomeTab)와는 다른 목록이다 — 저쪽은 읽기 전용 줄이고
// 여기는 눌러서 MemberListModal을 여는 줄이다. 같은 것의 변형이 아니라 다른 물건이라
// 공유하지 않는다.
import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../../../components/nativeText';
import { colors, font, radius, shadow } from '../../../theme';
import { POSITION_COLOR, positionLabel, toPosition } from '../positions';
import { initialOf } from '../initials';
import { formatRecentAttendance, memberAttendanceRate, type MemberRateMatch } from '../../attendance/utils/attendanceRate';
import type { TeamMemberWithProfile } from '../services/teamService';

interface Props {
  members: TeamMemberWithProfile[];
  /** 검색어로 걸러진 목록 — 부모가 만든 것을 그대로 받는다 */
  visibleMembers: TeamMemberWithProfile[];
  /** 내 team_members.id — 「(나)」 표시와 셰브론 조건에 쓴다 */
  selfMemberId: string;
  /** 총무인가 — 셰브론(편집 가능 신호)을 어디에 붙일지 정한다 */
  isAdmin: boolean;
  memberQuery: string;
  memberRateMatches: MemberRateMatch[];
  onChangeQuery: (v: string) => void;
  onOpenMemberList: () => void;
  onOpenInvite: () => void;
}

export function TeamMembersTab({
  members,
  visibleMembers,
  selfMemberId,
  isAdmin,
  memberQuery,
  memberRateMatches,
  onChangeQuery,
  onOpenMemberList,
  onOpenInvite,
}: Props) {
  return (
          <View style={[styles.card, { gap: 12 }]}>
            <View style={styles.sectionHead}>
              {/* 멤버 탭에서는 제목이 그냥 제목이다. 이미 그 화면이라 갈 곳이 없다.
                  (팀 홈에서는 같은 자리가 멤버 탭으로 가는 문이다 — TeamHomeTab 참고) */}
              <Text style={styles.sectionTitle}>전체 {members.length}명</Text>
            </View>

            {/* 이름 검색 — 멤버 탭에서만. 팀 홈은 미리보기라 검색할 게 없다 */}
            {members.length > 6 && (
              <View style={styles.searchRow}>
                <Ionicons name="search" size={15} color={colors.textFaint} />
                <TextInput
                  style={styles.searchInput}
                  value={memberQuery}
                  onChangeText={onChangeQuery}
                  placeholder="이름 검색"
                  placeholderTextColor={colors.textFaint}
                />
              </View>
            )}

            <View>
              {visibleMembers.map((m) => {
                const isMe = m.id === selfMemberId;
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
                    onPress={onOpenMemberList}
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
                      {/*
                        포지션은 값이 있을 때만 적는다.

                        예전엔 positionLabel이 빈 값을 「미지정」으로 채웠다. 팀 대부분이
                        포지션을 안 정해서 목록 전체가 「미지정 · 미지정 · 미지정」이 됐고,
                        그러면 이 줄은 정보가 아니라 빈칸 목록이다. 빈 값은 적지 않는다.

                        참석은 퍼센트가 아니라 횟수다 — 「67%」는 분모를 모르면 못 읽는다.
                        세 경기 중 두 번과 아홉 경기 중 여섯 번이 같은 숫자로 보인다.

                        둘 다 없으면 줄을 통째로 그리지 않는다.
                      */}
                      {(() => {
                        const pos = toPosition(m.position);
                        const recent = formatRecentAttendance(memberAttendanceRate(memberRateMatches, m));
                        if (!pos && !recent) return null;
                        return (
                          <View style={styles.memberMetaRow}>
                            {!!pos && (
                              /* 포지션마다 색이 달라 목록에서 자리를 색으로 먼저 읽는다 */
                              <Text style={[styles.memberMeta, { color: POSITION_COLOR[pos], fontWeight: '700' }]}>
                                {positionLabel(pos)}
                              </Text>
                            )}
                            {!!pos && !!recent && <Text style={styles.memberMetaDot}>·</Text>}
                            {!!recent && <Text style={styles.memberMeta}>{recent}</Text>}
                          </View>
                        );
                      })()}
                    </View>
                    {isTeamAdmin ? (
                      <View style={styles.adminBadge}>
                        <Text style={styles.adminBadgeText}>총무</Text>
                      </View>
                    ) : (
                      <Text style={styles.memberRole}>팀원</Text>
                    )}
                    {/*
                      셰브론은 「눌러서 바꿀 수 있다」는 신호다. 그래서 조건이 모달의
                      편집 권한과 같아야 한다 — MemberListModal은 포지션을
                      disabled={!isAdmin && !isSelf}로 막는다. 즉 총무이거나 자기 행이면
                      바꿀 수 있다.

                      총무에게만 붙이면 일반 멤버는 정작 바꿀 수 있는 유일한 행(자기 행)에서
                      신호를 못 받는다. 탭 자체는 전원에게 열어 둔다 — 남의 행을 눌러도
                      모달에서 조회는 되고, 막을 이유가 없다.
                    */}
                    {(isAdmin || isMe) && (
                      <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
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
                  onPress={onOpenInvite}
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
          </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...shadow.card,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderCurve: 'continuous',
    padding: 20,
  },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: colors.text, ...font.section },
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
  avatarPhoto: { width: '100%', height: '100%', borderRadius: 999 },
  avatarText: { color: '#8FA69C', fontSize: 11, fontWeight: '800' },
  memberName: { color: colors.textStrong, fontSize: 13, fontWeight: '700' },
  adminBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#6B5426',
  },
  adminBadgeText: { color: colors.gold, fontSize: 10, fontWeight: '800' },
  memberMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  memberMeta: { color: colors.textDim, fontSize: 11, fontWeight: '600' },
  memberMetaDot: { color: colors.textFaint, fontSize: 11 },
  memberRole: { color: colors.textFaint, fontSize: 10, fontWeight: '800' },
  footBadge: {
    minWidth: 20,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: colors.inputBg,
    alignItems: 'center',
  },
  footBadgeText: { color: colors.textDim, fontSize: 10, fontWeight: '800' },
  inviteAvatar: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.greenLine,
  },
  inviteRowName: { color: colors.green, fontSize: 14, fontWeight: '700' },
  empty: { color: colors.textFaint, fontSize: 12, fontWeight: '600' },
  pressed: { opacity: 0.85 },
});
