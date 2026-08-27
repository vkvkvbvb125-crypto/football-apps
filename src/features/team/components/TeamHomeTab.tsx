// src/features/team/components/TeamHomeTab.tsx
// 팀 홈 탭 — 멤버 미리보기, 내 기록, 팀 설정 진입, 팀 나가기.
//
// TeamHomeScreen에서 갈라져 나왔다. 옮기기만 했고 내용은 손대지 않았다.
// tab === 'home' 조건은 부모가 이미 보장하므로 이 안에서는 상수가 됐다.
//
// 가로 로스터(rosterRow)는 STEP 3의 제거 후보다 — 스탯 바의 「멤버 N명」과 역할이
// 겹치는지 판단이 남아 있어서, 지금은 옮기기만 하고 다듬지 않았다.
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SoftTint } from '../../../components/BentoCard';
import { StatRow, StatTile } from '../../../components/Surface';
import { Text, TextInput } from '../../../components/nativeText';
import { colors, font, radius, shadow } from '../../../theme';
import { positionLabel, toPosition } from '../positions';
import { avatarLetterOf, initialOf } from '../initials';
import {
  type AttendanceRate,
  formatRate,
  memberAttendanceRate,
  type MemberRateMatch,
} from '../../attendance/utils/attendanceRate';
import type { TeamMembership, TeamMemberWithProfile } from '../services/teamService';
import type { MatchWithVotes } from '../../attendance/services/attendanceService';

/**
 * 팀 화면 하단의 진입 타일 넷.
 *
 * 한 번 걷어냈다가 되살렸다. 걷어낸 근거는 「넷 다 다른 화면으로 보내기라 팀 화면에서
 * 끝나는 일이 없다」였는데, 두 가지가 그 판단을 뒤집었다.
 *
 *   하나. 팀 화면은 팀에 관한 화면들의 허브다. 나가는 것이 결함이 아니라 그 역할이다.
 *   둘.  그 근거가 사실과 반쯤 달랐다. 공지사항은 나가지 않는다 —
 *        같은 화면의 내부 탭(setTab)이라 여기서 끝난다.
 *
 * 색은 초록 하나다. 아래는 타일이 있던 시절 TeamHomeScreen에 적혀 있던 판단을 그대로
 * 옮겨 온 것이다. 타일은 지워졌는데 판단만 그 파일에 남아 있었다 —
 * 판단과 그 판단이 적용되는 코드가 다른 파일에 있으면 다음 사람이 못 본다.
 *
 *   칸마다 색을 달리 쓰던 것을 초록 하나로 모았다.
 *
 *   예전 의도는 「색으로 입구를 기억하게 한다」였는데, 실제로는 gold·blue·회색이 앱의 다른
 *   의미와 부딪혔다 — gold는 확인 대기 배지, blue는 정보성 표시, 회색은 비활성이다.
 *   팀 홈 네 칸만 그 규칙 밖에서 놀아서, 이 화면에서 색이 무엇을 뜻하는지 알 수 없었다.
 *
 *   구분은 색이 아니라 아이콘 모양과 그 아래 글자가 맡는다 — 확성기·말풍선·톱니바퀴·사람은
 *   이미 서로 안 닮았고, 라벨까지 붙어 있다. 색까지 동원할 일이 아니었다.
 *
 * 「경기운영」은 붙여 쓴다. 그 화면이 스스로를 그렇게 부르고(AssignmentScreen의 TabHeader),
 * 하단 탭에는 라벨이 없어서 이 타일이 그 이름을 처음 보여주는 자리다.
 *
 * 역할 조건을 걸지 않는다. 넷 다 팀원이 들어갈 수 있는 화면이고, isAdmin은 그 안의
 * 쓰기 동작에만 걸려 있다. 여기서 가리면 팀원이 볼 수 있는 화면을 못 보게 된다 —
 * 팀 설정 진입을 총무 전용으로 감쌌다가 팀원이 팀을 나갈 수 없게 됐던 것과 같은 실수다.
 */
/**
 * 카드 QR의 한 변(pt). 기존 토큰에 없는 새 상수다 — 근거가 시각 균형이 아니라
 * **스캔 가능성**이라서, 여백이나 폭 램프에서 고를 값이 아니다.
 *
 * inviteUrl이 83바이트다 → ECC M 기준 버전 5 → 37×37 모듈.
 * 412pt 폭 기기에서 124pt는 약 42mm이고 모듈 하나가 약 1.1mm가 된다. 넉넉하다.
 * 60pt(≈20mm)면 모듈이 0.55mm까지 내려가 근거리에서 겨우 읽히는 수준이다.
 *
 * 레퍼런스의 두 조건이 서로 안 맞았다 — 「카드 폭의 1/3」(≈124)과 「높이가 제목+설명
 * 두 줄만큼」(≈60)이 정사각형에서 동시에 성립하지 않는다. 「실제로 스캔되는 크기」가
 * 함께 명시돼 있어 폭 쪽을 남겼다.
 *
 * 줄이려면 이 계산부터 다시 하라. 그리고 inviteUrl이 길어지면(프로젝트 URL이 바뀌거나
 * 파라미터가 붙으면) 버전이 6·7로 올라가 같은 크기에서 모듈이 더 작아진다 —
 * 지금 여유는 URL 길이에 매여 있다.
 */
const QR_SIZE = 124;

export type TileKey = 'schedule' | 'assignment' | 'settlement' | 'notices';

const TILES: { key: TileKey; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { key: 'schedule', icon: 'calendar-outline', label: '일정' },
  { key: 'assignment', icon: 'football-outline', label: '경기운영' },
  { key: 'settlement', icon: 'card-outline', label: '정산' },
  { key: 'notices', icon: 'megaphone-outline', label: '공지사항' },
];

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
  /** invite-redirect 함수 URL — 카드의 QR에 담긴다. 시트가 쓰는 것과 같은 값이다 */
  inviteUrl: string;
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
  /** 내가 아직 안 낸 돈 — unpaid.ts가 세 곳과 같은 정의로 낸 값이다 */
  myUnpaid: number;
  memberRateMatches: MemberRateMatch[];
  onOpenMemberList: () => void;
  onGoMembers: () => void;
  onOpenTeamSettings: () => void;
  /**
   * 타일이 갈 곳. 어디로 가는지는 부모가 정한다 — 셋은 하단 탭으로 나가고 공지사항만
   * 이 화면 안에 머물러서, 그 분기를 한 곳에 둔다. 타일마다 onPress를 따로 두면
   * 넷이 같은 모양인데 하나만 다르게 동작하는 것이 어디서 갈리는지 안 보인다.
   */
  onGoTile: (key: TileKey) => void;
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
  inviteUrl,
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
  memberRateMatches,
  onOpenMemberList,
  onGoMembers,
  onOpenTeamSettings,
  onGoTile,
}: Props) {
  /* 기준 안내는 ⓘ를 눌러 편다 — 레퍼런스가 값 옆에 아이콘만 두기 때문이다 */
  const [rateNoteOpen, setRateNoteOpen] = useState(false);

  /* 내 행에 나온 사람을 뺀 나머지 — 아바타 줄이 쓴다 */
  const others = visibleMembers.filter((m) => m.id !== selfMemberId);

  return (
    <>
        {/* ── 배너: 엠블럼 + 팀명 + 초대 코드 ── 팀 홈에서만 */}
        {(
        <View style={styles.banner}>
          {/*
            배경.

            팀 로고가 있으면 그걸 깔고 검정 60%를 덮는다 — 별도 배경 이미지 컬럼이 없어서
            이미 있는 값을 쓴다. 로고는 정사각 엠블럼이라 cover로 채우면 가장자리가 잘리는데,
            어차피 60%에 덮여 색감만 남는 자리라 구도가 문제되지 않는다.

            로고가 없으면(대부분의 팀이 그렇다) 짙은 그린 그라데이션이다. 대각선으로 흐르게
            둬서 카드가 평평한 색 한 장으로 보이지 않게 한다.

            오버레이가 없으면 로고 색에 따라 글자가 읽히지 않는다. 평평한 검정 60%로 시작했는데
            채도 높은 로고(카카오 노랑으로 시험)에서 아래쪽 지역·정기모임 줄이 그대로 묻혔다 —
            위아래로 글자 밝기가 다른데 덮개가 균일해서다. 위 45% → 아래 85%로 흐르게 바꿨다.
            팀명은 위쪽이라 이미지가 남고, 작고 흐린 글자가 오는 아래는 거의 검정이 된다.
            그라데이션 폴백에는 덮개가 없다 — 이미 어둡다.
          */}
          {activeTeam.team.logo_url ? (
            <View style={StyleSheet.absoluteFill}>
              <Image source={{ uri: activeTeam.team.logo_url }} style={styles.bannerBg} blurRadius={12} />
              <LinearGradient
                colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0.85)']}
                style={styles.bannerScrim}
                pointerEvents="none"
              />
            </View>
          ) : (
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              {/*
                밑색. 방향이 우상 → 좌하다 — 예전엔 반대(좌상 → 우하)였다.
                오른쪽 위가 밝고 왼쪽 아래로 갈수록 어두워진다.
              */}
              <LinearGradient
                colors={[colors.greenDeep, colors.cardRaised]}
                start={{ x: 1, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              {/*
                우상단에서 대각으로 뻗는 빛줄기. 밑색 위에 한 겹 더 얹는다.

                알파는 재서 정했다. 눈대중으로 잡았다가 「안 보인다」를 두 번 들은 자리가
                있어서다(배경 L* 2.81에 +2.3을 얹은 적이 있다 — 매끈한 그라디언트에는
                비교할 경계가 없어 확실히 안 보이는 크기였다).

                이 카드의 밑색은 우상단 L* 25.83 → 좌하단 12.69다. 카드 자신의 명도 폭이
                13.1이라, 얹는 빛이 그보다 한참 작으면 밑색의 기울기에 묻힌다.

                  greenTint (0.12)  ΔL* 5.76   「오른쪽이 조금 밝다」로만 읽혔다
                  green   에 0.22   ΔL* 10.45  줄기는 서지만 폭이 없다 — 모서리에서 바로 꺼진다
                  green   에 0.40   ΔL* 17.51  띠로 읽힌다. 이걸 쓴다

                토큰 재사용(greenTint)이 새 값 0이라 먼저 그려 봤는데, 두 번 렌더해서
                나란히 놓고 보니 줄기가 안 섰다. 새로 정한 값은 알파 하나뿐이다 —
                색은 colors.green 그대로고, 이 파일이 이미 일회성 오버레이를 인라인
                rgba로 쓰고 있다(스크림 0.45/0.85, 엠블럼 바탕 0.55).

                스톱이 셋인 이유는 **띠에 폭을 주기 위해서**다. 둘이면 모서리가 가장 밝고
                거기서 바로 꺼져서 「모서리가 밝다」로만 보인다. 0.30까지 0.40 → 0.16으로
                빠르게 떨어뜨려 밝은 코어를 만들고, 거기서 0.72까지 길게 끌어 꼬리를 둔다.
                코어가 띠의 폭이고 꼬리가 방향이다.

                마지막 스톱 0.72는 줄기의 길이다. 1.0이면 카드 전체가 초록으로 물들어
                밑색의 어두운 쪽이 사라진다 — 대각선이 아니라 그냥 밝은 카드가 된다.

                0.40을 쓸 수 있게 된 건 「팀 설정 ›」이 우상단에서 내려왔기 때문이다.
                그 초록 글자가 모서리에 있을 때는 대비가 3.34:1까지 떨어졌다.
                지금 자리에서는 4.75:1로 본문 기준(4.5)을 넘는다.
              */}
              <LinearGradient
                colors={['rgba(34,197,94,0.40)', 'rgba(34,197,94,0.16)', 'transparent']}
                start={{ x: 1, y: 0 }}
                end={{ x: 0, y: 1 }}
                locations={[0, 0.3, 0.72]}
                style={StyleSheet.absoluteFill}
              />
            </View>
          )}
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
              <View style={styles.teamNameRow}>
                <Text style={[styles.teamName, { flexShrink: 1 }]} numberOfLines={1}>
                  {activeTeam.team.name}
                </Text>
                {/* 내 역할 — 팀 화면 어디에도 「나는 여기서 무엇인가」가 없었다.
                    총무는 금색, 팀원은 무채색이다. 총무만 색을 쓰는 건 할 수 있는 일이
                    달라서고, 팀원 뱃지까지 물들이면 둘 다 강조가 아니게 된다 */}
                <View style={[styles.roleTag, isAdmin && styles.roleTagAdmin]}>
                  <Text style={[styles.roleTagText, isAdmin && styles.roleTagTextAdmin]}>
                    {isAdmin ? '총무' : '팀원'}
                  </Text>
                </View>
              </View>
              {/*
                Since를 지역·풋살에서 떼어 낸다.

                셋을 「·」로 이으면 「언제부터 있는 팀인가」가 장소·종목과 같은 무게로 읽힌다.
                팀을 처음 보는 사람에게 그 셋은 층위가 다르다 — 앞의 둘은 어디서 무엇을 하는지고,
                Since는 얼마나 됐는지다.

                ⚠ 이미지 대조 전 임시값이다. 두 줄 다 기존 teamMeta 토큰을 그대로 쓰고 새 값을
                  정하지 않았다. 크기·색·간격과 지역·풋살 줄의 자리는 레퍼런스를 읽고 맞춘다 —
                  레퍼런스 히어로에는 지역·풋살 줄이 아예 없어서 순서를 여기서 단정하지 않는다.
              */}
              <Text style={styles.teamMeta} numberOfLines={1}>
                {`Since ${createdAt.getFullYear()}.${String(createdAt.getMonth() + 1).padStart(2, '0')}`}
              </Text>
              {/*
                「풋살」을 지웠다 — 상수라 정보가 0이다.

                이 앱에 풋살 아닌 팀은 없다. 종목 컬럼도, 고를 자리도 없다. 구장명이
                없는 팀에서는 이 줄이 「풋살」 한 단어만 남았고(렌더에서 확인했다),
                있는 팀에서도 뒤 절반은 모두에게 같은 말이었다.

                구장명은 지표 카드의 소개 줄로 갔다. 지역·구장·정기·평균·실력은 전부
                「이 팀은 어떤 팀인가」라 층위가 같다 — 히어로에 남겨 두면 그 줄 하나만
                다른 데 속한 채로 떠 있게 된다.
              */}
              {/*
                소개는 팀명 바로 아래다 — 헤더 블록에 속한다.
                예전엔 엠블럼 아래 별도 줄이라 통계 3칸과 붙어서, 팀 소개인지
                지표의 설명인지 자리로는 알 수 없었다.
              */}

              {/*
                소개 줄과 「팀 설정」이 한 행이다. 소개가 없는 팀원에게도 이 행은 남는다 —
                링크가 소개 유무에 따라 자리를 옮기면 그 화면으로 가는 문이 매번 다른 데 있다.
              */}
              <View style={styles.sloganLine}>
                <View style={{ flex: 1 }}>
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
                {/*
                  팀 설정 진입 — 소개 줄 오른쪽 끝이다.

                  4버튼 그리드를 걷어낼 때 「설정」 타일을 헤더 톱니와 중복으로 보고 지웠는데,
                  헤더 톱니는 개인 설정(MySettings)이고 그 타일은 팀 운영 설정이었다.
                  서로 다른 화면이라 진입로가 통째로 사라졌다 — 라우트와 호출부는 살아 있고
                  그 호출부에 갈 방법만 없는 상태였다.

                  되살릴 때 isAdmin으로 감쌌던 것이 두 번째 구멍이었다. 그 뒤 팀 나가기를
                  팀 설정 맨 아래로 옮겼는데, 그 화면으로 가는 문이 여기 하나뿐이라
                  팀원은 팀을 나갈 방법이 없었다. 조건을 걸지 않는다 — 총무·팀원 모두 연다.

                  라벨은 「팀 설정」이다. 「운영 설정」이었던 이유는 헤더 톱니(개인 설정)와
                  헷갈리지 않으려는 것이었는데, 「팀」이 붙으면 그 구분이 더 곧게 선다.
                  가는 화면의 제목도 「팀 설정」이라 이름이 갈리지 않는다.

                  전체 폭 행이던 것을 링크로 줄이면서 부제(총무는 「정기모임 · 회비 …」,
                  팀원은 「팀 나가기」)를 뺐다. 한 줄짜리 링크에는 담을 자리가 없고,
                  팀명 줄 오른쪽에 두 줄이 들어가면 팀명이 밀린다.
                  ⚠ 팀원에게 그 화면이 「팀 나가기」 한 줄뿐이라는 안내가 이 자리에서 사라진다.
                    팀 설정 화면을 팀원용으로 다시 설계하는 일이라 서랍에 있고, 여기서는 안 푼다.

                  자리가 팀명 줄에서 소개 줄로 내려왔다. 두 가지가 같이 풀린다 —
                  팀명 줄이 팀명+뱃지만 갖게 되어 세 줄의 무게가 위에서 아래로 고르게 눕고,
                  이 링크가 히어로 우상단에서 빠진다. 거기는 빛줄기가 가장 밝은 자리라
                  초록 글자의 대비가 무너지던 곳이다(재 봤다: 지금 자리 3.96:1 → 옮긴 자리
                  5.33:1, 본문 기준 4.5:1). 빛줄기를 더 세게 쓸 수 있게 된 것도 이 이동 덕이다.
                */}
                <Pressable
                  onPress={onOpenTeamSettings}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="팀 설정"
                  style={({ pressed }) => [styles.sectionHeadLink, { marginLeft: 'auto' }, pressed && styles.pressed]}
                >
                  <Text style={styles.moreText}>팀 설정 ›</Text>
                </Pressable>
              </View>
            </View>
          </View>


          {/* 초대 코드 공유는 총무 전용이 아니다 — 홈의 "친구 초대하기"가 멤버를 여기로 보내는데
              총무만 볼 수 있으면 멤버는 눌러도 아무것도 못 하는 막다른 길이 된다. */}
          {/* 「초대 공유 / 팀 설정」 버튼 줄은 뺐다 — 바로 아래 상자의 설정·멤버 관리와 겹친다.
              초대는 멤버 관리 화면의 + 버튼이 맡는다. */}

        </View>

        )}

      {/* 배너는 content 밖이다 — banner의 marginHorizontal 20이 content의 padding 20과
          겹치면 여백이 두 겹이 된다. 초대 카드도 같은 이유로 여기 있었는데, 순서를 바꾸며
          content 안으로 들어가면서 자기 여백을 뺐다. 지금 밖에 있는 것은 배너 하나다. */}
      <View style={styles.content}>
        {/*
          팀 지표 카드 — 히어로 밖이다.

          히어로 안에 있을 때 카드 높이 211px 중 아래 80px을 이 블록이 먹었다. 그 위에
          팀명·역할·설정·Since·구장·소개까지 다섯 줄이 쌓여서, 무엇이 주인공인지 자리로는
          알 수 없었다. 히어로는 「이 팀이 누구인가」고 여기는 「어떻게 굴러가는가」다.

          팀 소개 줄(지역·정기·평균·실력)도 같이 왔다. 히어로에서 그 줄은 혼자만 전체 폭인
          데다 바로 아래 스탯 바가 훨씬 무거워서, 두 덩어리 사이에 낀 자투리로 보였다 —
          카드 밖으로 넘친 게 아니라(재 봤다: 카드 top 50/bottom 261, 그 줄 153~181)
          속한 데가 없어서 떠 보인 것이다. 지표와 한 카드에 두면 성격이 같아 붙는다.
        */}
        <View style={styles.teamProfileCard}>
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
      <StatTile label="경기" value={String(matches.length)} icon="calendar-outline" accent />
      {/*
        「멤버」는 하단 탭 「팀」의 people-outline을 쓰지 않는다.
        거기는 눌러서 가는 화면 이름이고 여기는 아무 데도 안 가는 지표다 —
        스탯 바에 진입이 없다는 건 검사가 이미 붙들고 있다. 같은 그림을 쓰면
        그림이 「누를 수 있다」고 거짓말한다. 한 겹 안쪽인 person-outline을 쓴다.
      */}
      <StatTile label="멤버" value={String(members.length)} icon="person-outline" accent />
      {/*
        trending-up이 아니다 — 값이 내려가도 화살표가 위를 가리켜 거짓말이 된다.
        checkmark 계열도 아니다. 앱에서 그건 「했다」는 동작 완료를 뜻해서
        지표 칸에 쓰면 이미 끝난 일로 읽힌다.
      */}
      <StatTile
        label="참여율"
        value={formatRate(teamRate)}
        icon="stats-chart-outline"
        accent
        hint
        onPressHint={() => setRateNoteOpen((v: boolean) => !v)}
      />
    </StatRow>

    {/*
      기준 안내 — 자리를 옮겼다. 레퍼런스에 맞춰 뒤집은 판단이다.

      예전 근거는 이랬고 지금도 사실이다: 「이 화면에는 참석률 창이 둘 있다. 위는
      monthlyAttendanceRate(이번 달)이고 아래 멤버 행과 「내 기록」은
      memberAttendanceRate(최근 3개월)다. 둘 다 근거가 있어 합치지 않는다
      (attendanceRate.ts 머리말). 그래서 접어두지 않는다 — 눌러야 보이는 안내는
      안 누른 사람이 계속 오해하는데, 두 창이 한 화면에 같이 서 있어서 오해가
      기본값이 된다.」

      레퍼런스는 「참여율 67% ⓘ」로 값 옆에 아이콘만 둔다. 자리를 그렇게 옮기되,
      아무 일도 안 하는 아이콘은 두지 않았다 — 누르면 이 줄이 펼쳐진다.
      상시 노출을 잃은 만큼 라벨을 「참석」에서 「참여율」로 바꿨다. 이름에 「율」이
      들어가면 적어도 「비율이다」는 안 눌러도 읽힌다.
    */}
    {rateNoteOpen && (
      <View style={styles.statNote}>
        <Ionicons name="information-circle-outline" size={13} color={colors.textFaint} />
        <Text style={styles.statNoteText}>이번 달 치른 경기 기준이에요</Text>
      </View>
    )}
  </View>
        </View>

          {/* 다음 경기 카드를 걷어냈다 — 홈이 같은 경기를 더 자세히(참여 현황·CTA까지) 보여준다.
              팀 화면의 주인공은 멤버다. */}

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

                    「전체보기」 글자를 붙였다. 셰브론만 있으면 표적이 18px이 되는데,
                    홈에서 같은 문제를 한 번 겪고 sectionLinkRow가 44px를 만들게 고쳤다.
                    앱에 이미 있는 표현이라 새 종류를 만드는 것도 아니다.
                  */}
                    {/*
                      숫자를 제목에 적는다 — 레퍼런스에 맞춰 뒤집은 판단이다.

                      한때 뺐다. 근거는 「스탯 바가 같은 수를 이미 말한다」였고 그것도
                      사실이다. 레퍼런스는 겹침을 알면서 둘 다 뒀고, 재보니 두 수가
                      다른 것을 말한다 — 스탯 바의 「멤버 6」은 팀 지표고, 여기 「6명」은
                      바로 옆 「전체보기 ›」가 여는 목록의 크기다. 아바타 줄이 다섯에서
                      끊기고 「+N」으로 접히는 구조라, 전체 수를 말하는 자리가 제목뿐이다.
                    */}
                    <Text style={styles.sectionTitle}>멤버 {members.length}명</Text>
                    <Pressable
                      onPress={onGoMembers}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel="멤버 전체 보기"
                      style={({ pressed }) => [styles.sectionHeadLink, pressed && styles.pressed]}
                    >
                      <Text style={styles.moreText}>전체보기</Text>
                      <Ionicons name="chevron-forward" size={15} color={colors.textFaint} />
                    </Pressable>
                </View>

                {/*
                  내 행 — 명단 속의 나.

                  soloList(2명 이하)와 가로 로스터(3명 이상) 두 갈래를 이 한 모양으로 합쳤다.
                  soloList가 생긴 근거는 「62px 아바타 칸 하나가 화면 폭에 혼자 놓이면 오른쪽이
                  통째로 비어서 아직 안 만든 화면처럼 읽힌다」였는데, 내 행이 항상 전체 폭을
                  쓰므로 그 원인이 사라진다. 1명 팀도 이 행 하나로 폭이 찬다.

                  메타는 「포지션 · 최근 N경기 중 M회」 둘이다. 포지션은 바로 위 「내 정보」
                  카드에도 있는데 그대로 둔다 — ⑵에서 「멤버 6」과 「팀원 6명」을 없앤 것과는
                  다른 경우다. 그때는 같은 값이 **같은 역할**(멤버 수를 세는 일)로 두 번
                  나왔고, 여기는 역할이 갈린다: 「내 정보」는 고치는 자리(수정 ›)이고
                  이 행은 명단 속의 나다. 빼면 이 행이 이름과 뱃지뿐이 된다.

                  등번호·주발은 안 넣는다 — 「내 정보」가 맡고 있고 명단 맥락에서 값이 없다.
                  실력 등급도 안 넣는다(본인이 자기 등급을 보면 팀 분위기가 깨진다).
                */}
                {!!me && (
                  <Pressable
                    onPress={onOpenMemberList}
                    accessibilityRole="button"
                    accessibilityLabel={`${me.displayName} 내 정보 보기`}
                    style={({ pressed }) => [styles.selfRow, pressed && styles.pressed]}
                  >
                    <View style={styles.selfAvatar}>
                      {me.avatarUrl ? (
                        <Image source={{ uri: me.avatarUrl }} style={styles.selfPhoto} />
                      ) : (
                        <Text style={styles.selfInitial}>{initialOf(me.displayName)}</Text>
                      )}
                    </View>

                    <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
                      <View style={styles.selfNameRow}>
                        <Text style={styles.selfName} numberOfLines={1}>
                          {me.displayName} (나)
                        </Text>
                        <View style={[styles.roleTag, isAdmin && styles.roleTagAdmin]}>
                          <Text style={[styles.roleTagText, isAdmin && styles.roleTagTextAdmin]}>
                            {isAdmin ? '총무' : '팀원'}
                          </Text>
                        </View>
                      </View>
                      {/*
                        레퍼런스는 「공격 · 골키퍼 · 참여율 67%」다. 이 자리에서만
                        표기를 뒤집는다.

                        옛 판단: 「최근 N경기 중 M회」로 앱 전체를 통일했다. 근거는
                        퍼센트가 표본 크기를 감춘다는 것이었다 — 2경기 중 1회도 50%고
                        100경기 중 50회도 50%다. 그 근거는 지금도 맞고, 「내 기록」
                        카드와 멤버 목록은 그대로 둔다.

                        여기만 바꾸는 이유는 한 줄에 셋이 들어가기 때문이다.
                        「골레이로 · 골키퍼 · 최근 6경기 중 4회」는 폭을 넘겨 잘리고,
                        잘린 「최근 6경기 중…」은 표본을 보여주지도 못한다.
                        표본이 3 미만이면 memberAttendanceRate가 애초에 「-」를 준다.
                      */}
                      <Text style={styles.selfMeta} numberOfLines={1}>
                        {[
                          toPosition(me.position) ? positionLabel(toPosition(me.position)) : null,
                          `참여율 ${formatRate(memberAttendanceRate(memberRateMatches, me))}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>

                    <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
                  </Pressable>
                )}

                {/*
                  나머지 아바타 줄.

                  내 행에 나온 사람은 여기서 뺀다 — 같은 사람을 한 카드에 두 번 그리지 않는다.
                  그래서 「+N」은 7명부터 뜬다(나 + 5명까지는 줄에 다 보인다). 레퍼런스는
                  5개 + 「+1」이라 6명처럼 보이지만, 그건 줄이 나를 포함할 때의 그림이다.
                  「몇 명인가」는 스탯 바가 말하므로 이 줄이 수를 책임지지 않는다.

                  0명이면 그리지 않는다 — 빈 가로줄이 「아직 안 만든 화면」으로 읽히던
                  그 문제가 여기서만 남는다.
                */}
                {others.length > 0 && (
                  <View style={styles.avatarRow}>
                    {others.slice(0, 5).map((m, i) => (
                      <Pressable
                        key={m.id}
                        onPress={onGoMembers}
                        accessibilityRole="button"
                        accessibilityLabel={`${m.displayName} 멤버 보기`}
                        style={[styles.avatarChip, i > 0 && styles.avatarChipOverlap]}
                      >
                        {m.avatarUrl ? (
                          <Image source={{ uri: m.avatarUrl }} style={styles.avatarPhoto} />
                        ) : (
                          <Text style={styles.avatarInitial}>{avatarLetterOf(m.displayName)}</Text>
                        )}
                      </Pressable>
                    ))}
                    {others.length > 5 && (
                      /* +N도 눌린다. 눌리는 원 옆에 안 눌리는 원이 서면 그게 더 나쁘다 */
                      <Pressable
                        onPress={onGoMembers}
                        accessibilityRole="button"
                        accessibilityLabel={`나머지 ${others.length - 5}명 보기`}
                        style={[styles.avatarChip, styles.avatarChipOverlap, styles.avatarMore]}
                      >
                        <Text style={styles.avatarMoreText}>+{others.length - 5}</Text>
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
                {!!me && (
                  <View style={styles.myRecord}>
                    <SoftTint tone="green" radius={radius.card} />
                    {/*
                      「내 기록」이었다. 레퍼런스가 「팀 기록」이고 칸 구성도 다르다 —
                      좌: 최근 경기 성적, 우: 미납 금액. 참석은 이 카드에서 빠졌다.
                      레퍼런스가 그 값을 위 멤버 행(「참여율 67%」)으로 옮겼기 때문이다.
                    */}
                    <Text style={styles.myRecordTitle}>팀 기록</Text>
                    <View style={styles.recordCols}>
                      {/*
                        성적 — 빈 칸이다. 빈 칸을 만들지 않는다는 기존 판단을 여기서만
                        접는다: 레퍼런스에 이 칸이 있고 카드 모양이 레퍼런스와 같아야 한다.

                        채울 수 없는 이유는 데이터다. 승패를 내려면 「내가 어느 조였나」
                        (team_assignments)와 「그 조가 몇 점이었나」(match_scores)가 한
                        경기에서 만나야 하는데 프로덕션에서 그 교집합이 0이었다.
                        완료 경기도 0이다(6/6이 open). 어떤 정의를 골라도 한 경기도
                        계산되지 않는다.

                        그래서 「없음」이 아니라 「무엇을 하면 쌓이는지」를 적는다.
                        빈 칸이 할 수 있는 일은 그것뿐이다.
                      */}
                      <View style={styles.recordCol}>
                        <View style={styles.statLabelRow}>
                          <Ionicons name="trophy-outline" size={13} color={colors.textMuted} />
                          <Text style={styles.recordLabel}>최근 경기 성적</Text>
                        </View>
                        <Text style={styles.recordEmpty}>경기 결과를 기록하면{'\n'}성적이 쌓여요</Text>
                      </View>

                      {/*
                        미납이 돌아왔다.

                        「돈 이야기는 정산 화면의 일이고 여기 두면 팀 홈이 독촉장이 된다」며
                        하단 탭의 빨간 점으로 옮겼던 값이다. 점은 그대로 둔다 — 둘은 다른
                        일을 한다. 점은 알림이라 어느 화면에 있든 「볼 것이 있다」만 말하고,
                        이 칸은 확인이라 얼마인지를 말한다. 액수를 탭 뱃지에 적으면
                        「무슨 숫자지」가 되고 자릿수에 따라 탭 폭이 흔들린다.

                        ⚠ 레퍼런스는 이 자리에 「최근 30일 기준」을 적는다. 그대로 옮기지
                          않았다 — myUnpaidAmount는 날짜로 안 자른다(unpaid.ts: 「지난
                          정산에 미납이 남아 있어도 그건 여전히 내가 낼 돈이다」). 30일을
                          적으면 31일 전 미납이 그 숫자에 들어 있으므로 화면이 자기 값을
                          두고 거짓말을 한다. 창을 실제로 30일로 자르는 쪽도 안 골랐다:
                          같은 함수를 하단 탭 뱃지와 팀 나가기 경고가 함께 보고 있어서
                          한 화면 때문에 자르면 세 자리의 값이 갈린다.
                          자리는 레퍼런스대로 두고 문장만 사실로 적는다.

                        tone="danger" — 크면 나쁜 숫자에 초록이 붙으면 색이 뜻을 뒤집는다.
                        0원이면 accent를 끈다. 낼 돈이 없는 것은 강조할 일이 아니다.
                      */}
                      <View style={styles.recordCol}>
                        <StatTile
                          label="미납 금액"
                          value={`${myUnpaid.toLocaleString()}원`}
                          icon="card-outline"
                          accent={myUnpaid > 0}
                          tone="danger"
                        />
                        <Text style={styles.recordCaption}>지난 정산까지 전부</Text>
                      </View>
                    </View>
                  </View>
                )}

                {/*
                  총무에게도 보인다. 예전엔 !isAdmin 조건이 붙어 있었는데, 바로 아래 「내 기록」이
                  「총무도 선수다. 역할과 무관하게 항상 보인다」고 적어 둔 것과 같은 파일 안에서
                  어긋났다. 총무도 자기 포지션·등번호가 필요하다.
                */}
                {!!me && (
                  <Pressable
                    onPress={onOpenMemberList}
                    accessibilityRole="button"
                    accessibilityLabel="내 정보 수정"
                    style={({ pressed }) => [styles.myInfoRow, pressed && styles.pressed]}
                  >
                    <Text style={styles.myInfoRowTitle}>내 정보</Text>
                    {/*
                      값은 요약만 — 「골레이로 · 하 · 7번」. 고치는 건 이 행이 여는
                      화면이 한다. 카드였을 때는 라벨·칩·유니폼이 세 칸으로 서 있었는데,
                      셋 다 여기서 못 고치는 값이라 칸만 차지했다.

                      빈 값은 안 적는다. 「미지정」을 채우면 줄이 정보가 아니라 빈칸
                      목록이 되고, 그건 팀 소개 줄에서 이미 안 하기로 한 것이다.
                      전부 비면 아래 「설정하기」가 대신 선다.
                    */}
                    <Text style={styles.myInfoRowValue} numberOfLines={1}>
                      {[
                        toPosition(me.position) ? positionLabel(toPosition(me.position)) : null,
                        me.skillTag,
                        me.jerseyNumber ? `${me.jerseyNumber}번` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || '설정하기'}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
                  </Pressable>
                )}


                {/*
                  초대 블록은 팀 프로필 카드 밖이다.
                  안에 있으면 카드 안에 카드가 되어 경계가 어디까지인지 알 수 없었다 —
                  엠블럼·팀명·통계는 「이 팀은 무엇인가」이고 초대는 「지금 할 일」이라 성격도 다르다.

                  그 「지금 할 일」이 화면 위쪽을 차지할 이유는 아니었다. 초대는 한 번 하고
                  끝나는 일이고 멤버·기록은 매번 보는 것이다 — 갓 만든 팀에서도 초대는
                  며칠이면 끝나지만 그 자리는 팀이 사라질 때까지 남는다. 일시적 과업에
                  첫 화면을 내주면 남은 기간 내내 손해다. 그래서 멤버·내 기록 아래로 내렸다.
                  (배너 바로 아래였을 때는 6명 팀에서 멤버 섹션과 내 기록이 둘 다 스크롤 밖이었다)

                  제목·설명이 돌아왔다. 뺐던 근거는 「상시 권유는 소음이고, 이미 여섯 명인 팀 홈이
                  그만큼 길어진다」였는데, 그건 조건 분기(셋 이하만 큰 카드)를 없애면서 큰 쪽을
                  버린 판단이었다. 조건을 안 두고 항상 카드로 노출하기로 정해졌으니 그 근거는
                  더 이상 이 자리의 것이 아니다 — 카드가 길어지는 값은 QR이 대면 초대를 그 자리에서
                  끝내주는 것으로 돌려받는다.

                  QR을 아이콘에서 실물로 바꿨다. 뺐던 근거는 「작게 그리면 스캔이 안 된다」였고
                  그건 지금도 맞다 — 그래서 22px 아이콘이었다. 크게 그리면 그 근거가 해소된다.
                  아래 QR_SIZE 주석에 얼마나 커야 하는지의 계산이 있다.

                  카드의 QR은 누르는 것이 아니다. 대면 초대는 여기서 끝난다 — 상대가 그 자리에서
                  찍으면 되고, 시트를 한 번 더 열 이유가 없다. 시트로 가는 문은 공유 버튼이 맡는다.
                  그래서 카드는 대면, 시트는 원격 공유와 링크 복사로 역할이 갈린다.
                */}
                <View style={styles.inviteCard}>
                  {/* 초록 기운 — 앱의 다른 카드가 쓰는 것과 같은 방식이다 */}
                  <SoftTint tone="green" radius={radius.card} />

                  <View style={styles.inviteTop}>
                    <View style={styles.inviteCopy}>
                      <Text style={styles.inviteTitle}>팀에 친구를 초대해보세요!</Text>
                      <Text style={styles.inviteDesc}>
                        {'링크나 코드를 공유하면\n친구가 바로 팀에 참여할 수 있어요.'}
                      </Text>
                    </View>

                    {/* 흰 판 위에 그린다. QR은 명암 대비로 읽히는데 다크 표면 위에서는 못 읽는다 */}
                    <View style={styles.inviteQrPlate}>
                      <QRCode value={inviteUrl} size={QR_SIZE} backgroundColor="#FFFFFF" color="#000000" />
                    </View>
                  </View>

                  <View style={styles.inviteBottom}>
                    <Pressable
                      onPress={onCopyInviteCode}
                      style={({ pressed }) => [styles.inviteCodeBox, pressed && styles.pressed]}
                      accessibilityRole="button"
                      accessibilityLabel={`초대 코드 ${activeTeam.team.invite_code} 복사`}
                    >
                      <Text style={styles.inviteLabel}>초대 코드</Text>
                      <View style={styles.inviteCodeRow}>
                        <Text style={styles.inviteCode} numberOfLines={1}>
                          {inviteCodeDisplay}
                        </Text>
                        <Ionicons
                          name={copied ? 'checkmark' : 'copy-outline'}
                          size={15}
                          color={copied ? colors.green : colors.textDim}
                        />
                      </View>
                    </Pressable>

                    <Pressable
                      onPress={onOpenInvite}
                      accessibilityRole="button"
                      accessibilityLabel="초대 링크 공유하기"
                      style={({ pressed }) => [styles.inviteShare, pressed && styles.pressed]}
                    >
                      <Ionicons name="share-social-outline" size={16} color={colors.bgRoot} />
                      <Text style={styles.inviteShareText}>링크 공유하기</Text>
                    </Pressable>
                  </View>
                </View>

                {/* 팀 나가기는 팀 설정 맨 아래로 옮겼다 — 되돌리기 어려운 동작이라
                    매일 보는 홈에 둘 이유가 없다. 나가기 확인에서 미납액도 함께 경고한다 */}

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

                {/* 정의는 파일 위 TILES에 있다. 넷을 같은 모양으로 그린다 */}
                <View style={styles.tiles}>
                  {TILES.map((t) => (
                    <Pressable
                      key={t.key}
                      onPress={() => onGoTile(t.key)}
                      accessibilityRole="button"
                      accessibilityLabel={t.label}
                      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
                    >
                      <Ionicons name={t.icon} size={22} color={colors.green} />
                      <Text style={styles.tileLabel}>{t.label}</Text>
                    </Pressable>
                  ))}
                </View>

                {members.length <= 3 && (
                  <Text style={styles.growHint}>멤버가 모이면 참석률과 기록이 쌓여요</Text>
                )}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  /*
    카드 사이 10, 카드 안 20. 레퍼런스가 그 비율이다 — 카드가 붙어 있고 안이 넓다.

    14였을 때는 20:14 = 1.4라 안팎이 비슷해서, 카드 여럿이 쌓인 화면이 「상자 목록」으로
    읽혔다. 10이면 2.0이 되어 각 카드가 자기 안에서 숨 쉬고 카드끼리는 한 덩어리가 된다.

    안쪽(padding)을 올려서 같은 비를 만드는 방법도 있는데 안 골랐다 — 320px 기기에서
    내용 폭을 좌우 합쳐 8px 더 깎는다. 바깥을 줄이는 쪽은 아무것도 안 깎는다.
  */
  content: { padding: 20, gap: 10 },
  banner: {
    ...shadow.raised,
    // 배경 레이어가 절대배치로 깔린다 — 안 막으면 모서리 밖으로 칠해져 radius가 사라진다
    overflow: 'hidden',
    marginHorizontal: 20,
    marginTop: 4,
    borderRadius: radius.hero,
    backgroundColor: colors.cardRaised,
  },
  bannerBg: { width: '100%', height: '100%' },
  /* 검정 60% — 밝은 로고 위에서도 흰 글자가 읽히는 최소선이다 */
  bannerScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' },
  /* 팀명 · 역할 뱃지 · 팀 설정 링크. 링크만 오른쪽 끝으로 민다 (marginLeft: 'auto') */
  teamNameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  roleTag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  roleTagAdmin: { borderColor: '#6B5426' },
  roleTagText: { color: colors.textFaint, fontSize: 10, fontWeight: '800' },
  roleTagTextAdmin: { color: colors.gold },
  /*
    상하 여백이 대칭이다. paddingTop만 20이고 아래가 0이던 시절엔 엠블럼과 소개 줄이
    카드 바닥에 그대로 닿았다(재 봤다: 카드 y50~136, 엠블럼 바닥 136 — 여백 0px).
    카드가 낮아서 빽빽했던 게 아니라 아래가 잘려 있었다.
  */
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 20 },
  /* 6은 세 줄이 한 덩어리로 뭉쳐 보였다. 12면 줄마다 숨이 생기고 엠블럼 높이와도 맞는다 */
  bannerBody: { flex: 1, gap: 12 },
  emblem: {
    // rounded-square. 원형은 인스타 프로필을 그대로 옮긴 모양이었는데, 이건 사람 사진이
    // 아니라 팀 로고다 — 엠블럼은 방패·사각이 원형보다 자연스럽고, 아래 Bento 격자의
    // 사각 타일들과도 모양이 맞는다.
    // 76은 본문 세 줄(25 + 12 + 13 + 12 + 14 = 76)과 같은 높이다. 둘이 나란히 서면
    // 위아래가 딱 맞아 카드 안이 두 덩어리로 정돈된다. 66일 땐 본문보다 10px 짧았다.
    width: 76,
    height: 76,
    // tile(16)에서 hero(20)로. 66 기준 24%에서 30%가 된다 — 사각형 정체성은 남기면서
    // 모서리가 눈에 띄게 둥글어진다. 카드 자신과 같은 곡률이라 안에 든 요소로 묶인다.
    // pill(원형)은 위 근거를 뒤집는 것이라 안 간다.
    borderRadius: radius.hero,
    overflow: 'hidden',
    backgroundColor: 'rgba(7,16,13,0.55)',
    // 내 행 아바타(selfAvatar)와 같은 링이다 — 값도 같다. 앱에서 「이 동그라미가
    // 주인공이다」를 이미 그렇게 말하고 있어서 새 어휘를 만들 이유가 없다.
    //
    // dashed였다. 이 앱에서 dashed는 「비었으니 채워라」라는 뜻을 이미 갖고 있고
    // (HomeScreen의 emptyNoteBtn, 멤버 탭·팀 전환 시트의 빈 자리), 엠블럼도 그 뜻으로
    // 읽혔다. 문제는 로고가
    // **있을 때까지** dashed였다는 것이다 — 다 채운 자리에 채우라는 표시가 남았다.
    // 빈 상태의 안내는 안에 있는 EMBLEM 글자가 이미 하고 있으니 테두리에서 뺀다.
    borderWidth: 2,
    borderColor: colors.green,
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
  /* 소개(남는 폭 전부) + 「팀 설정 ›」(오른쪽 끝) */
  sloganLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
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
  },
  /* 히어로에서 나온 지표 카드. 자기 여백은 카드가 갖고, 안의 두 블록은 gap으로 띄운다 */
  teamProfileCard: {
    ...shadow.card,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderCurve: 'continuous',
    padding: 16,
    gap: 10,
  },
  teamStats: { gap: 10 },
  /* 코드·QR·공유 세 칸. 코드가 폭을 다 먹고 QR이 오른쪽에 붙는다 — 공유는 아래 한 줄 */
  inviteCard: {
    /* content(padding 20, gap 14) 안으로 들어왔다 — 자기 marginHorizontal·marginTop을
       그대로 두면 여백이 두 겹이 된다 */
    padding: 14,
    gap: 12,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    borderWidth: 1,
    /* 테두리에도 초록이 돈다 — 면의 SoftTint와 같은 계열이라야 카드가 한 덩어리로 읽힌다 */
    borderColor: colors.greenDeep,
    backgroundColor: colors.cardAlt,
    overflow: 'hidden',
  },
  /* 상단 — 좌 글, 우 QR. QR이 텍스트보다 크므로 위로 맞춘다 */
  inviteTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  inviteCopy: { flex: 1, gap: 6 },
  inviteTitle: { ...font.section, color: colors.textStrong },
  inviteDesc: { color: colors.textMuted, fontSize: 11, fontWeight: '600', lineHeight: 17 },
  inviteQrPlate: {
    backgroundColor: '#FFFFFF',
    padding: 8,
    borderRadius: radius.button,
    borderCurve: 'continuous',
  },

  /* 하단 — 좌 코드, 우 공유. 둘 다 44 표적이라 바닥이 맞는다 */
  inviteBottom: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  /* 코드 전체가 복사 버튼이다 — 표적이 버튼만큼 커야 한다 */
  inviteCodeBox: {
    flex: 1,
    gap: 2,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.button,
    borderCurve: 'continuous',
    backgroundColor: colors.inputBg,
  },
  inviteCodeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inviteShare: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    height: 44, flex: 1,
    borderRadius: radius.button, borderCurve: 'continuous',
    backgroundColor: colors.green,
  },
  inviteShareText: { color: colors.bgRoot, fontSize: 14, fontWeight: '800' },
  inviteLabel: { color: colors.textDim, fontSize: 11, fontWeight: '700' },
  inviteCode: {
    flex: 1,
    color: colors.green,
    fontSize: 15,
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
  /*
    내 정보 — 카드가 아니라 한 줄 행이다.

    카드였을 때 「내 기록」 바로 아래 같은 어두운 상자가 연달아 서서, 이 파일이 이미
    적어 둔 「배너 아래로 똑같은 상자만 쌓이면 리듬이 없다」가 그대로 벌어졌다.
    면을 갈라 구분하는 수단은 이미 썼다 — 둘 다 SoftTint tone="green"이라 또 가르려면
    새 톤을 만들어야 하고, 그러면 「모든 카드에 같은 결」이라는 판단이 무너진다.
    합치는 것도 아니다: 「내 기록」은 쌓인 값이고 이쪽은 내가 설정하는 값이다.

    행으로 낮춘 근거는 주 동작이 하나라는 것이다. 안에 있던 세 값(포지션·실력·등번호)은
    전부 여기서 못 고치고 여는 화면에서 고친다 — 카드 안에서 칸을 차지할 이유가 없었다.
  */
  myInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.control,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardAlt,
  },
  myInfoRowTitle: { color: colors.text, fontSize: 13, fontWeight: '800' },
  /* 값이 남는 폭을 다 쓰고 셰브론 앞에서 끊는다 */
  myInfoRowValue: { color: colors.textDim, fontSize: 12, fontWeight: '600', flex: 1, textAlign: 'right' },
  rosterStrip: { paddingHorizontal: 4, paddingTop: 4 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionHeadLink: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  sectionTitle: { color: colors.text, ...font.section },
  /*
    내 행 — 전체 폭 한 줄. 카드보다 한 단계 밝은 면이라 명단에서 떠 있다.
    soloList(2명 이하 전용)를 대신한다: 그건 「62px 아바타 하나가 폭에 혼자 놓이면
    오른쪽이 빈다」를 풀려던 것이었고, 이 행이 항상 폭을 다 쓰므로 그 원인이 사라졌다.
  */
  selfRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    backgroundColor: colors.cardRaised,
  },
  /* 아바타 줄(36)보다 확실히 크다 — 대략 1.5배. 초록 링으로 「나」를 표시한다 */
  selfAvatar: {
    width: 54,
    height: 54,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.inputBg,
    borderWidth: 2,
    borderColor: colors.green,
  },
  selfPhoto: { width: '100%', height: '100%' },
  selfInitial: { color: colors.textStrong, fontSize: 16, fontWeight: '800' },
  selfNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  selfName: { color: colors.textStrong, fontSize: 15, fontWeight: '800', flexShrink: 1 },
  selfMeta: { color: colors.textDim, fontSize: 12, fontWeight: '600' },

  /*
    아바타 줄 — 서로 파고든다.

    앱의 첫 겹침 UI다. absolute + left 누적이 아니라 음수 마진을 쓴다 — row 안에서
    그냥 흐르게 두고 마진만 당기면 되고, absolute는 개수마다 좌표를 계산해야 한다.

    -9는 지름 36의 25%다. 그 이상 당기면 이니셜 두 글자가 가려지기 시작한다.

    각 칸에 배경색과 같은 테두리를 두른다. 안 두르면 뒤 아바타의 원이 앞 아바타에
    그대로 얹혀 경계가 사라진다 — 겹침이 「겹쳤다」가 아니라 「뭉갰다」로 보인다.

    쌓임 방향은 **뒤 칸이 위**다. 나중에 그린 형제가 위로 오는 게 기본이라 zIndex를
    따로 주지 않아도 그렇게 된다 — 화면에서 확인했다(서준 위에 도윤이 얹힌다).
    반대로 하려면(앞이 위) 각 칸에 내림차순 zIndex를 줘야 하는데, 그렇게 하면 왼쪽
    끝 사람만 온전히 보이고 오른쪽으로 갈수록 잘린다. 지금 방향이 명단 순서와 맞는다.
  */
  avatarRow: { flexDirection: 'row', alignItems: 'center' },
  avatarChip: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.inputBg,
    borderWidth: 2,
    borderColor: colors.bgRoot,
  },
  /*
    -12는 지름 36의 33%다. 이 값에는 천장이 있다.

    한 글자(11.1px)가 36px 칸 가운데 놓이므로 오른쪽 끝이 23.55px다. 뒤 칸이 위로
    얹혀서 이 칸의 **오른쪽부터** 가려지니, 보이는 폭 36 - m이 23.55보다 커야 글자가
    안 잘린다 → m ≤ 12.45. 정수로 12가 최대다.

    예전엔 -9(25%)였고 근거가 「더 당기면 이니셜 두 글자가 가려진다」였다. 그 두 글자를
    한 글자로 줄이면서(avatarLetterOf) 근거가 통째로 바뀌었다 — 같은 계산을 다시 해서
    나온 값이지 눈대중으로 더 당긴 게 아니다.
  */
  avatarChipOverlap: { marginLeft: -12 },
  avatarPhoto: { width: '100%', height: '100%' },
  avatarInitial: { color: colors.textStrong, fontSize: 12, fontWeight: '800' },
  avatarMore: { backgroundColor: colors.greenTint },
  avatarMoreText: { color: colors.green, fontSize: 12, fontWeight: '800' },

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
  /* 좌우 두 칸 — 레퍼런스 구성이다. 성적(빈 칸)과 미납 */
  recordCols: { flexDirection: 'row', gap: 12 },
  recordCol: { flex: 1, gap: 4 },
  statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  recordLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  /* 빈 칸의 글자는 값이 아니라 안내다 — 숫자 자리의 크기·색을 쓰지 않는다 */
  recordEmpty: { color: colors.textFaint, fontSize: 12, fontWeight: '600', lineHeight: 17 },
  /* 값 아래 한 줄. 레퍼런스의 「최근 30일 기준」 자리인데 문장은 사실로 적는다 */
  recordCaption: { color: colors.textFaint, fontSize: 11, fontWeight: '600' },
  /* 기준 안내 — 스탯 바 바로 아래. 값보다 물러나야 하므로 가장 옅은 글자색이다 */
  statNote: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 },
  statNoteText: { color: colors.textFaint, fontSize: 11, fontWeight: '600' },

  /*
    1×4다. 한 줄에 넷.

    2×2였고 근거가 「1×4는 412px에서 칸당 88px이라 「공지사항」 네 글자가 잘린다」였다.
    재 봤더니 안 잘린다 — 그 88px은 맞는데 글자 폭을 안 잰 값이었다.

      그리드 폭 372, gap 10  →  칸 폭 (372 - 30) / 4 = 85.5px
      「공지사항」 실제 렌더 폭 = 45px (13px / weight 800, Noto Sans KR)
      여유 40.5px — 칸의 절반이 남는다

    타일이 세로 배치(아이콘 위, 글자 아래)라 글자는 자기 폭만 필요하다. 가로 배치였다면
    아이콘 22 + gap 8 + 글자 45 = 75로 빠듯했겠지만 그건 지금 모양이 아니다.

    paddingVertical을 18에서 14로 줄였다. 칸이 좁아지면서 85×85 정사각이 되는데,
    네 개가 나란한 줄에서는 칸이 세로로 긴 것보다 납작한 쪽이 한 덩어리로 읽힌다.

    칸 크기는 비율로 잡는다 — 고정 px를 두면 폭이 다른 기기에서 한 칸이 밀린다.
    flexBasis 0 + flexGrow 1이면 넷이 남는 폭을 똑같이 나눈다.
  */
  tiles: { flexDirection: 'row', gap: 10 },
  tile: {
    flexBasis: 0,
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardRaised,
  },
  tileLabel: { color: colors.text, fontSize: 13, fontWeight: '800' },

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
