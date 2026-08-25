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
import { Text, TextInput } from '../../../components/nativeText';
import { colors, font, radius, shadow } from '../../../theme';
import { POSITION_COLOR, POSITION_INFO, positionLabel, toPosition } from '../positions';
import { initialOf } from '../initials';
import {
  type AttendanceRate,
  formatMemberRate,
  formatRate,
  memberAttendanceRate,
  type MemberRateMatch,
} from '../../attendance/utils/attendanceRate';
import type { TeamMembership, TeamMemberWithProfile } from '../services/teamService';
import type { MatchWithVotes } from '../../attendance/services/attendanceService';

interface Props {
  activeTeam: TeamMembership;
  /** 「Since YYYY.MM」에 쓴다 — 부모가 만든 Date를 그대로 받는다 */
  createdAt: Date;
  /** 팀명 두 글자. 사람 이름 규칙(initialOf)과 다르다 — 팀명은 성을 뗄 것이 없다 */
  emblemInitials: string;
  logoUploading: boolean;
  sloganEditing: boolean;
  sloganText: string;
  /** 스탯 바의 「총 경기」 — 팀 생성 이래 전부다 */
  matches: MatchWithVotes[];
  teamRate: AttendanceRate;
  /** 4자리씩 끊은 초대 코드. 복사·QR은 원문을 쓴다 */
  inviteCodeDisplay: string;
  copied: boolean;
  onPickEmblem: () => void;
  onClearEmblem: () => void;
  onEditSlogan: (v: boolean) => void;
  onChangeSloganText: (v: string) => void;
  onSaveSlogan: () => void;
  onCopyInviteCode: () => void;
  onOpenInvite: () => void;
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
  activeTeam,
  createdAt,
  emblemInitials,
  logoUploading,
  sloganEditing,
  sloganText,
  matches,
  teamRate,
  inviteCodeDisplay,
  copied,
  onPickEmblem,
  onClearEmblem,
  onEditSlogan,
  onChangeSloganText,
  onSaveSlogan,
  onCopyInviteCode,
  onOpenInvite,
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
    <>
        {/* ── 배너: 엠블럼 + 팀명 + 초대 코드 ── 팀 홈에서만 */}
        {(
        <View style={styles.banner}>
          {/* 이 카드에만 있던 SoftTint를 뺐다 — 지금은 앱의 모든 카드에 같은 결이 깔려 있어서
              여기만 따로 강조할 이유가 없어졌다. 혼자 빛이 두 겹이라 팀 탭만 톤이 튀었다. */}
          <View style={styles.bannerRow}>
            <View>
              <Pressable
                onPress={isAdmin ? onPickEmblem : undefined}
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
                  onPress={onPickEmblem}
                  onLongPress={activeTeam.team.logo_url ? onClearEmblem : undefined}
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
                    onChangeText={onChangeSloganText}
                    placeholder="한 줄 소개"
                    placeholderTextColor={colors.textFaint}
                    maxLength={40}
                    autoFocus
                  />
                  <Pressable
                    onPress={onSaveSlogan}
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
                      onChangeSloganText(activeTeam.team.slogan ?? '');
                      onEditSlogan(true);
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
              {/*
                「경기」는 matches.length — 팀 생성 이래 전부다. 라벨을 「이번 달 경기」로
                바꾸려면 계산도 바꿔야 하고, 그러면 참석률의 「이번 달」·멤버 지표의
                「최근 3개월」에 이어 세 번째 창이 생긴다. 계산을 두고 라벨을 값에 맞춘다.

                0은 「-」로 바꾸지 않는다. 경기 0회와 멤버 0명은 실제로 0이지 데이터가
                없는 게 아니다. 「-」는 셀 것이 없어 비율을 못 내는 참석률에만 쓴다.

                「멤버」에는 진입을 걸지 않는다 — 아래 로스터 카드 제목이 이미 멤버 탭의
                문이고, 같은 화면에 같은 곳으로 가는 입구가 둘이면 어느 쪽이 무엇인지
                흐려진다. 여기는 지표, 저기는 명단이다.
              */}
              <StatTile label="총 경기" value={String(matches.length)} accent />
              <StatTile label="멤버" value={String(members.length)} accent />
              <StatTile label="참석" value={formatRate(teamRate)} accent />
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

          예전엔 멤버 셋 이하면 큰 카드(제목+부제+초록 버튼), 넷부터는 코드 줄만이었다.
          조건을 없애고 하나로 합치면서 큰 카드 쪽을 그대로 쓰지 않았다 —
          「멤버를 초대해보세요」가 상시로 뜨면 권유가 아니라 소음이고, 이미 여섯 명인 팀
          홈이 그만큼 길어진다. 제목·부제를 빼고 코드·QR·공유만 남긴 납작한 카드로 간다.
          갓 만든 팀에 필요한 안내는 아래 「멤버가 모이면…」 줄이 이미 맡고 있다.

          셋 다 InviteSheet를 연다. 시트가 QR·코드·링크 공유·복사를 이미 갖고 있어서
          여기서 다시 만들 것이 없다.

          QR은 아이콘이다. 실제 QR을 작게 그리면 스캔이 안 된다 — 시트가 흰 판 위에
          여백(quiet zone)까지 두고 그리는 이유가 그것이다. 읽히지 않는 QR을 보여주면
          카메라를 들이대게 만들어 놓고 실패시킨다.
        */}
        <View style={styles.inviteCard}>
          <Pressable
            onPress={onCopyInviteCode}
            style={({ pressed }) => [styles.inviteCodeBox, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`초대 코드 ${activeTeam.team.invite_code} 복사`}
          >
            <Text style={styles.inviteLabel}>초대 코드</Text>
            <Text style={styles.inviteCode} numberOfLines={1}>
              {inviteCodeDisplay}
            </Text>
            <Ionicons
              name={copied ? 'checkmark' : 'copy-outline'}
              size={15}
              color={copied ? colors.green : colors.textDim}
            />
          </Pressable>

          <Pressable
            onPress={onOpenInvite}
            style={({ pressed }) => [styles.inviteQr, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="QR 코드 보여주기"
          >
            <Ionicons name="qr-code-outline" size={22} color={colors.green} />
          </Pressable>

          <Pressable
            onPress={onOpenInvite}
            accessibilityRole="button"
            accessibilityLabel="초대 링크 공유하기"
            style={({ pressed }) => [styles.inviteShare, pressed && styles.pressed]}
          >
            <Ionicons name="person-add-outline" size={16} color={colors.bgRoot} />
            <Text style={styles.inviteShareText}>링크 공유하기</Text>
          </Pressable>
        </View>

      {/* 배너·초대는 content 밖이다 — banner의 marginHorizontal 20이 content의 padding 20과
          겹치면 여백이 두 겹이 된다. 부모에서도 이 둘만 ScrollView 직속이었다. */}
      <View style={styles.content}>
          {/* 다음 경기 카드를 걷어냈다 — 홈이 같은 경기를 더 자세히(참여 현황·CTA까지) 보여준다.
              팀 화면의 주인공은 멤버다. */}

          {/*
            총무에게도 보인다. 예전엔 !isAdmin 조건이 붙어 있었는데, 바로 아래 「내 기록」이
            「총무도 선수다. 역할과 무관하게 항상 보인다」고 적어 둔 것과 같은 파일 안에서
            어긋났다. 총무도 자기 포지션·등번호가 필요하다.
          */}
          {!!me && (
            <View style={[styles.card, { gap: 12 }]}>
              {/* 카드 면의 결 — 정산 카드와 같은 값·같은 방향. 목록에서 조명이 하나로 읽힌다 */}
              <SoftTint tone="green" radius={radius.card} />
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>내 정보</Text>
                <Pressable
                  onPress={onOpenMemberList}
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
                  {/* 값이 없으면 「미지정」이 아니라 「설정하기」다. 「미지정」은 상태를 알려줄 뿐
                      할 일을 가리키지 않는다 — 어디서 정하는지 모르면 그대로 비어 있다 */}
                  {toPosition(me.position) ? (
                    <View style={styles.myInfoChip}>
                      <Text style={styles.myInfoChipText}>{positionLabel(toPosition(me.position))}</Text>
                    </View>
                  ) : (
                    <Pressable
                      onPress={onOpenMemberList}
                      accessibilityRole="button"
                      accessibilityLabel="주 포지션 설정하기"
                      style={({ pressed }) => [styles.myInfoChip, styles.myInfoChipEmpty, pressed && styles.pressed]}
                    >
                      <Text style={styles.myInfoChipEmptyText}>설정하기</Text>
                    </Pressable>
                  )}
                </View>
                <View style={{ flex: 1, gap: 5 }}>
                  <Text style={styles.myInfoLabel}>실력</Text>
                  {/* 실력은 총무가 매기는 값이라 본인에게 「설정하기」를 주지 않는다 —
                      누르면 못 바꾸는 곳으로 보내는 셈이다. 비어 있으면 그냥 「-」 */}
                  <View style={[styles.myInfoChip, styles.myInfoChipAlt]}>
                    <Text style={[styles.myInfoChipText, styles.myInfoChipTextAlt]}>{me.skillTag ?? '-'}</Text>
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


        {/* 팀 홈에서는 카드 껍데기를 벗긴다. 배너 아래로 똑같은 상자만 쌓이면
            화면에 리듬이 없다 — 가로로 흐르는 아바타 줄이 상자들 사이에서 숨통이 된다.
            (멤버 탭은 목록이 주인공이라 카드를 유지한다) */}
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
                      accessibilityLabel={`팀원 ${members.length}명 전체 보기`}
                      style={({ pressed }) => [styles.sectionHeadLink, pressed && styles.pressed]}
                    >
                      <Text style={styles.sectionTitle}>팀원 {members.length}명</Text>
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
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 14 },
  banner: {
    ...shadow.raised,
    marginHorizontal: 20,
    marginTop: 4,
    borderRadius: radius.hero,
    backgroundColor: colors.cardRaised,
  },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 20 },
  bannerBody: { flex: 1, gap: 6 },
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
  teamName: { color: '#FFFFFF', fontSize: 21, fontWeight: '800', letterSpacing: -0.4 },
  teamMeta: { color: colors.textDim, fontSize: 11, fontWeight: '600' },
  slogan: { color: colors.textBody, fontSize: 12, fontWeight: '600' },
  sloganRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
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
  profileLine: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  teamStats: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4 },
  /* 코드·QR·공유 세 칸. 코드가 폭을 다 먹고 QR이 오른쪽에 붙는다 — 공유는 아래 한 줄 */
  inviteCard: {
    marginHorizontal: 20,
    marginTop: 12,
    padding: 14,
    gap: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    borderRadius: radius.card,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardAlt,
  },
  /* 코드 전체가 복사 버튼이다 — 표적이 버튼만큼 커야 한다 */
  inviteCodeBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: radius.button,
    borderCurve: 'continuous',
    backgroundColor: colors.inputBg,
  },
  inviteQr: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.button,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.border,
  },
  inviteShare: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    height: 44, width: '100%',
    borderRadius: radius.button, borderCurve: 'continuous',
    backgroundColor: colors.green,
  },
  inviteShareText: { color: colors.bgRoot, fontSize: 14, fontWeight: '800' },
  inviteLabel: { color: colors.textDim, fontSize: 11, fontWeight: '700' },
  inviteCode: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.5,
    fontVariant: ['tabular-nums'],
  },
  moreText: { color: colors.green, fontSize: 12, fontWeight: '700' },
  card: {
    ...shadow.card,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderCurve: 'continuous',
    padding: 20,
  },
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
  myInfoChipText: { color: colors.green, fontSize: 12, fontWeight: '800' },
  myInfoChipEmpty: { borderStyle: 'dashed', borderWidth: 1, borderColor: colors.border, backgroundColor: 'transparent' },
  myInfoChipEmptyText: { color: colors.green, fontSize: 13, fontWeight: '700' },
  myInfoChipAlt: { backgroundColor: colors.inputBg, borderColor: colors.border },
  myInfoChipTextAlt: { color: colors.textStrong },
  jersey: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  jerseyNumber: {
    position: 'absolute',
    color: colors.green,
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
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
