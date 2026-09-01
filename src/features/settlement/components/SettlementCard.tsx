// src/features/settlement/components/SettlementCard.tsx
// 정산 카드 — 정산 탭 목록과 홈 "내 정산 현황"이 함께 쓴다.
//
// 하나의 컴포넌트에 variant만 둔다 (Reference 규칙):
//   active  — 진행중/완료된 정산. 우상단 "N명 미납", 액션은 계좌 송금 / 카톡 공유 / 상세
//   pending — 아직 정산이 등록되지 않은 경기. 우상단 "정산 미등록", 첫 액션이 정산 만들기
//
// 3단 구조·토큰은 design.md 「정산 카드」를 따른다.
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../components/nativeText';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { font, radius, shadow, type Palette } from '../../../theme';
import { useThemed } from '../../../lib/useThemed';
import { SoftTint } from '../../../components/BentoCard';

export type SettlementCardVariant = 'active' | 'pending';

/**
 * 카드 오른쪽의 진행률 링 — 참석자 대비 입금 완료 비율.
 * label을 주면 퍼센트 대신 그 글자를 넣는다 (미등록처럼 아직 비율이 없는 상태용).
 */
export function ProgressRing({ pct, label, size = 56 }: { pct: number; label?: string; size?: number }) {
  const { colors, styles } = useThemed(makeStyles);
  // 큰 링에서 테두리가 실처럼 가늘어지지 않게 지름에 맞춰 두께를 키운다
  const stroke = Math.max(6, Math.round(size * 0.09));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        {/* 타이머 링과 같은 결 — 시작은 깊고 끝은 밝다. 아이콘 공의 심이 그렇게 탄다 */}
        <Defs>
          <SvgGradient id="settleArc" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.greenCore} />
            <Stop offset="1" stopColor={colors.green} />
          </SvgGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.greenTrack} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="url(#settleArc)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * (1 - pct)}
          fill="none"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.ringCenter}>
        <Text
          style={[
            label ? styles.ringLabel : styles.ringText,
            size > 56 && { fontSize: Math.round(size * 0.22) },
          ]}
        >
          {label ?? `${Math.round(pct * 100)}%`}
        </Text>
      </View>
    </View>
  );
}

export interface SettlementCardProps {
  variant?: SettlementCardVariant;
  title: string;
  /** 장소 — 길면 잘린다. 제목에 이미 장소가 들어간 경우엔 비워서 중복을 피한다 */
  place?: string;
  /** 참석 인원 — 장소와 달리 절대 잘리지 않는다 */
  attendCount: number;
  /** 좌측 상태 배지 */
  statusLabel: string;
  /** active에서만 쓰인다 — 우상단 "N명 미납" */
  unpaidCount?: number;
  /** active 전용 — pending은 아직 금액도 진행률도 없다 */
  pct?: number;
  amount?: number;
  perPerson?: number;
  onPress: () => void;
  /** active면 계좌 송금, pending이면 정산 만들기. 없으면(팀원) 비활성으로 그린다 */
  onPrimaryAction?: () => void;
  /** pending은 공유할 링크가 아직 없어 비활성이다 */
  onShare?: () => void;
  /**
   * 미등록 카드의 「참석자 N명 ›」 — 누가 나눠 내게 되는지 미리 본다.
   *
   * 이 자리를 두 번 갈아엎었다. 처음엔 「상세」였는데 화면이 onPress와 같은 함수를 줘서
   * 눌러도 정산 생성 시트가 다시 떴고, 다음엔 「경기 상세」로 일정 탭에 보냈지만
   * 정산을 만들려던 사람을 다른 탭으로 내보내는 셈이었다.
   * 여기서 알고 싶은 건 "이 금액이 누구한테 나뉘나"다.
   */
  onOpenTargets?: () => void;
  /** 위 링크에 적을 인원 — 눌러보기 전에 몇 명인지 알 수 있어야 한다 */
  targetCount?: number;
}

export function SettlementCard({
  variant = 'active',
  title,
  place = '',
  attendCount,
  statusLabel,
  unpaidCount = 0,
  pct = 0,
  amount = 0,
  perPerson = 0,
  onPress,
  onPrimaryAction,
  onShare,
  onOpenTargets,
  targetCount = 0,
}: SettlementCardProps) {
  const { colors, styles } = useThemed(makeStyles);
  // 아이콘 버튼은 카드 Pressable 안에 중첩된다 — 웹(RNW)에서는 DOM 이벤트가 그대로
  // 버블링돼서 stopPropagation 없이는 아이콘을 눌러도 카드의 onPress(상세 열기)까지 같이 탄다.
  const stop = (fn: () => void) => (e: { stopPropagation?: () => void }) => {
    e.stopPropagation?.();
    fn();
  };

  const pending = variant === 'pending';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.sCard, pending && styles.sCardGhost, pressed && styles.pressed]}
    >
      {/*
        카드에 빛을 깐다 — 색은 그 카드의 상태를 따라간다.

        예전엔 진행중에만 초록 틴트를 깔고 미등록·완료는 비워 뒀다. "지나간 일은
        조용해야 한다"는 이유였는데, 실제로는 미등록 카드만 면이 밋밋해서 같은 목록에
        결이 다른 카드가 섞인 것처럼 보였다.

        미등록은 앰버다. 배지가 앰버인데 면에 초록 빛이 돌면 한 카드가 두 색을 주장한다 —
        틴트는 면을 물들이는 것이라 상태색을 따라가야 맞다.
        완료(미납 0)는 그대로 비워 둔다. 끝난 일에는 강조할 게 없다.
      */}
      {pending ? (
        <SoftTint tone="gold" radius={radius.card} />
      ) : (
        unpaidCount > 0 && <SoftTint tone="green" radius={radius.card} />
      )}

      {/* 1단 — 좌측 배지 = 정산 상태, 우측 텍스트 = 미납 인원.
          미납을 배지로 만들면 둘 다 배지라 무엇이 상태고 무엇이 카운트인지 구분이 안 된다. */}
      <View style={styles.sCardHead}>
        <View style={[styles.sBadge, pending && styles.sBadgeWarn]}>
          {/* 진행중과 완납은 같은 초록이라 색만으로는 안 갈린다 — 완납에만 체크를 붙인다 */}
          {!pending && unpaidCount === 0 && <Ionicons name="checkmark" size={12} color={colors.green} />}
          {pending && <Ionicons name="alert-circle-outline" size={12} color={colors.gold} />}
          <Text style={[styles.sBadgeText, pending && styles.sBadgeTextWarn]}>{statusLabel}</Text>
        </View>
        {pending ? (
          <Text style={styles.sHeadSub}>경기 종료</Text>
        ) : (
          unpaidCount > 0 && <Text style={styles.sUnpaidText}>{unpaidCount}명 미납</Text>
        )}
      </View>

      {/* 2단 — 좌측 세로 스택 + 우측 링 게이지 */}
      <View style={styles.sCardBody}>
        <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
          <Text style={styles.sTitle} numberOfLines={1}>
            {title}
          </Text>
          {/* 장소만 줄이고 참석 인원은 그대로 둔다 — 한 Text로 합치면 인원까지 잘린다.
              제목에 이미 장소가 있으면 place가 비어 오고, 그때는 인원만 보여준다. */}
          <View style={styles.sSubRow}>
            {!!place && (
              <>
                <Text style={styles.sSub} numberOfLines={1}>
                  {place}
                </Text>
                <View style={styles.sSubDivider} />
              </>
            )}
            <Text style={styles.sSubFixed}>참석 {attendCount}명</Text>
            {/*
              미등록의 「회비 미정」은 여기 붙는다.
              한 줄을 통째로 쓰고 있었는데(+marginTop 6), 담긴 정보는 "아직 안 정했다"
              하나뿐이라 줄값을 못 했다. 같은 보조 정보인 시간·장소·참석과 한 줄에 둔다.
            */}
            {pending && (
              <>
                <View style={styles.sSubDivider} />
                <Text style={styles.sSubFixed}>회비 미정</Text>
              </>
            )}
          </View>
          {/*
            미등록은 아직 회비를 정하지 않은 상태다 — amount가 없어서 0이 들어온다.
            그 0을 카드에서 가장 큰 글자(30px)로 찍고 있었다. 미등록 경기가 세 건이면
            정산 탭 전체가 「0원 0원 0원」으로 읽힌다. 0원짜리 정산이 세 개 있는 게 아니라
            아직 아무것도 안 정한 것이므로, 금액 자리에는 금액이 없다는 사실을 적는다.
          */}
          {/* 금액은 진행중·완료에만 있다. 미등록의 「회비 미정」은 위 보조 줄로 옮겼다 */}
          {!pending && (
            <>
              <Text style={styles.sAmount}>{amount.toLocaleString()}원</Text>
              <Text style={styles.sPerPerson}>1인당 {perPerson.toLocaleString()}원</Text>
            </>
          )}
        </View>
        {/*
          미등록에는 링을 그리지 않는다.
          퍼센트가 없어서 「미등록」 글자를 링 가운데에 넣고 있었는데, 링은 진행률을
          그리는 물건이라 진행률이 없는 상태가 그 자리를 차지하면 두 가지가 어긋난다:
            1. 상태를 이미 왼쪽 위 배지가 말하고 있다 — 같은 말이 한 카드에 두 번
            2. 56px 원 + 글자는 누르는 것처럼 보인다. 실제로는 아무 동작이 없다
          미등록 카드에서 눌러야 할 건 아래 「정산 만들기」 하나뿐이라 그쪽만 남긴다.
        */}
        {!pending && <ProgressRing pct={pct} />}
      </View>

      {/*
        3단 — 액션.

        미등록과 나머지는 액션의 성격이 다르다.
        미등록 카드에서 할 일은 「정산 만들기」 하나뿐이고 상세는 곁가지다. 그런데 둘을
        같은 아이콘+캡션 칸으로 나란히 두니 크기·모양·글자 무게가 똑같아서, 초록 틴트를
        얹어도 "왼쪽 게 좀 초록한 칸" 정도로만 읽혔다. 위계는 색이 아니라 형태로 갈라야 한다.
        그래서 미등록만 채워진 버튼 하나로 바꾼다.
        진행중·완료는 계좌 송금 / 카톡 공유 / 상세 셋이 대등한 선택지라 기존 행을 그대로 둔다.

        「상세」는 미등록에서 뺐다. 정산이 아직 없으니 펼칠 상세도 없다 — 화면 쪽에서
        onPress와 onPrimaryAction에 같은 함수(정산 만들기 시트 열기)를 주고 있었고,
        그래서 상세를 눌러도 같은 시트가 떴다. 같은 곳으로 가는 버튼을 둘 둘 이유가 없다.
        (카드 몸통을 눌러도 여전히 같은 시트가 열린다 — 그 경로는 그대로다.)
      */}
      {pending ? (
        <View style={styles.sPendWrap}>
          {/*
            안내 스트립을 걷어냈다.
            레퍼런스는 카드 하나짜리 목업이라 설명 두 줄이 친절하게 읽혔는데, 실제 목록은
            미등록 카드가 넷이다. 같은 문장이 네 번 반복되면 그건 안내가 아니라 벽지다 —
            게다가 바로 위 배지가 이미 「정산 미등록」이라고 말하고 있었다.
            앰버는 배지와 버튼에만 남긴다. 뜻은 그대로고 면적만 줄어든다.
          */}
          <View style={styles.sPendRow}>
            <Pressable
              disabled={!onPrimaryAction}
              onPress={onPrimaryAction ? stop(onPrimaryAction) : undefined}
              accessibilityRole="button"
              accessibilityLabel="정산 등록하기"
              style={({ pressed }) => [styles.sPendCta, !onPrimaryAction && styles.sIconBtnOff, pressed && styles.pressed]}
            >
              {/*
                채운 초록이었다가 앰버 아웃라인으로 되돌렸다.
                「상태는 앰버, 누를 것은 초록」이라는 규칙 자체는 맞다 — 다만 그건 카드
                한 장 안에서의 색 규칙이고, 여기서 부딪힌 건 카드 사이의 위계다.
                미등록이 네 건이면 채운 초록 버튼이 세로로 네 개 선다. 같은 강조가
                목록에서 세 번 넘게 반복되면 그건 더 이상 강조가 아니다.
                진행중 카드 하나가 떠오르려면 나머지가 물러나야 한다.
              */}
              <Ionicons name="calculator-outline" size={16} color={colors.gold} />
              <Text style={styles.sPendCtaText}>정산 등록하기</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.gold} />
            </Pressable>

            {!!onOpenTargets && (
              <Pressable
                onPress={stop(onOpenTargets)}
                accessibilityRole="button"
                accessibilityLabel={`정산 대상 ${targetCount}명 보기`}
                style={({ pressed }) => [styles.sPendLink, pressed && styles.pressed]}
              >
                <Text style={styles.sPendLinkText}>참석자 {targetCount}명</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
              </Pressable>
            )}
          </View>
        </View>
      ) : (
      <View style={styles.sIconRow}>
        <Pressable
          disabled={!onPrimaryAction}
          onPress={onPrimaryAction ? stop(onPrimaryAction) : undefined}
          accessibilityRole="button"
          /* label을 안 붙인다 — 안에 「계좌 송금」 글자가 있어서 붙이면 두 번 읽힌다 */
          style={[styles.sIconBtn, !onPrimaryAction && styles.sIconBtnOff]}
        >
          <Ionicons name="card-outline" size={22} color={colors.textStrong} />
          <Text style={styles.sIconLabel}>계좌 송금</Text>
        </Pressable>

        <Pressable
          disabled={!onShare}
          onPress={onShare ? stop(onShare) : undefined}
          accessibilityRole="button"
          style={[styles.sIconBtn, !onShare && styles.sIconBtnOff]}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.textStrong} />
          <Text style={styles.sIconLabel}>카톡 공유</Text>
        </Pressable>

        <Pressable onPress={stop(onPress)} accessibilityRole="button" style={styles.sIconBtn}>
          <Ionicons name="list-outline" size={22} color={colors.textStrong} />
          <Text style={styles.sIconLabel}>상세</Text>
        </Pressable>
      </View>
      )}
    </Pressable>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  pressed: { opacity: 0.85 },

  /*
   * 미등록은 ghost — 면을 한 단 내리고 그림자를 뺀다.
   *
   * 진행중과 같은 card 면이라 목록에서 넷이 똑같은 무게로 서 있었다.
   * 지금 돈이 오가는 건 진행중 하나뿐인데 그게 안 드러났다.
   */
  sCardGhost: { backgroundColor: colors.cardAlt, boxShadow: 'none' },
  sCard: {
    ...shadow.card,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderCurve: 'continuous',
    padding: 16,
    gap: 10,
  },
  sCardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 22,
    paddingHorizontal: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.greenTint,
  },
  // 미등록은 아직 아무 일도 시작되지 않은 상태 — 채우지 않고 테두리로만 표시한다
  /*
   * 미등록 배지는 앰버다.
   * 초록 아웃라인이었는데, 초록은 이 앱에서 「진행중·완료·활성」을 뜻한다 —
   * 아직 시작도 안 한 상태에 같은 색을 쓰니 목록에서 무엇이 남은 일인지 안 갈렸다.
   * 빨강(danger)은 아니다. 실패가 아니라 아직 안 끝낸 일이다.
   */
  sBadgeWarn: { backgroundColor: colors.goldTint, borderWidth: 1, borderColor: colors.goldLine },
  sBadgeTextWarn: { color: colors.gold },
  sBadgeText: { color: colors.green, fontSize: 11, fontWeight: '800' },
  // 미납은 배지가 아니라 순수 텍스트 — 상태 배지와 역할을 구분한다
  sUnpaidText: { color: colors.danger, fontSize: 12, fontWeight: '800' },
  sHeadSub: { color: colors.textDim, fontSize: 12, fontWeight: '600' },

  sCardBody: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  sSubRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  sSub: { flexShrink: 1, color: colors.textMuted, fontSize: 13, fontWeight: '500' },
  sSubDivider: { width: 1, height: 11, backgroundColor: colors.border },
  sSubFixed: { flexShrink: 0, color: colors.textMuted, fontSize: 13, fontWeight: '500' },
  sAmount: {
    color: colors.text,
    ...font.amount,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  sPerPerson: { color: colors.textMuted, fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },

  ringCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  ringText: { color: colors.text, fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  // "미등록"은 세 글자라 퍼센트보다 작게 잡아야 56px 링 안에 들어간다
  ringLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '800' },

  /* 진행중·완료 — 대등한 선택지 셋 */
  sIconRow: {
    flexDirection: 'row',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },

  /** 미등록 카드의 액션 줄 */
  sPendWrap: { paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.divider },
  /*
   * 버튼은 왼쪽 끝, 링크는 오른쪽 끝.
   * gap만 주니 둘이 왼쪽에 붙고 오른쪽 절반이 통째로 비었다.
   */
  sPendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  /*
   * 내용만큼만 넓힌다. flex:1로 늘렸더니 267px짜리 막대가 되어
   * 카드에서 금액보다 버튼이 커졌다 — 액션은 콘텐츠 다음이다(§20).
   *
   * 면을 채우지 않고 앰버 아웃라인으로 둔다. 목록에 미등록 카드가 셋이면
   * 채운 버튼 셋이 나란히 서서 화면이 버튼 목록이 된다.
   */
  sPendCta: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 16,
    borderRadius: radius.button,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.goldLine,
    backgroundColor: colors.goldTint,
  },
  sPendCtaText: { color: colors.gold, fontSize: 13, fontWeight: '800' },
  /** 곁가지 — 껍데기 없이 글자와 화살표만. 표적은 44 확보 */
  sPendLink: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44, paddingHorizontal: 8 },
  sPendLinkText: { color: colors.textBody, fontSize: 12, fontWeight: '700' },
  // 탭 타겟 세로 44px 이상 — 아이콘 22 + 캡션 + 여백으로 확보한다
  sIconBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 },
  sIconBtnOff: { opacity: 0.35 },
  sIconLabel: { color: colors.textBody, fontSize: 11, fontWeight: '700' },
  });
