// src/components/Surface.tsx — 카드 4단계 · 배지 · 통계 타일
//
// 카드 껍데기가 29개 파일에 각자 정의돼 있었고 배지 스타일은 27벌이었다. 같은 것을
// 스물아홉 번 적으면 스물아홉 번 조금씩 어긋난다 — 실제로 반경 14종, 여백 9종으로 갈라져 있었다.
// 껍데기를 여기 한 곳에 모으고, 화면은 "무엇을 담을지"만 정한다.
//
// 4단계는 정보 중요도다. 모든 카드를 같은 크기로 만들지 않는다는 게 핵심이다:
//
//   hero    브랜드·핵심 정보. 화면에 하나. 가장 밝고 가장 크게 뜬다.
//   primary 그 화면이 존재하는 이유(다음 경기, 정산 하나). 화면에 한둘.
//   bento   통계·바로가기 타일. 격자로 여러 개.
//   list    공지·게시글처럼 줄줄이 쌓이는 것. 가라앉혀서 위 셋을 방해하지 않는다.
import type { ReactNode } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from './nativeText';
import { colors, font, radius, shadow } from '../theme';

export type CardTier = 'hero' | 'primary' | 'bento' | 'list';

interface CardProps {
  tier?: CardTier;
  children: ReactNode;
  onPress?: () => void;
  /** 레이아웃만 덮어쓴다 (flex, margin). 면·반경·그림자는 단계가 정한다 */
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function Card({ tier = 'primary', children, onPress, style, accessibilityLabel }: CardProps) {
  const base = [styles.base, styles[tier], style];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [base, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

/**
 * 초록 면에 아이콘의 결을 넣는다.
 *
 * 아이콘 공의 초록은 한 색이 아니다 — 타오르는 심(L58)에서 그늘진 면(L36)으로 떨어진다.
 * 단색으로 칠한 버튼은 그 결이 없어서 초록 스티커처럼 보인다.
 *
 * 쓰는 쪽은 두 가지만 지키면 된다:
 *   1. 부모에 overflow:'hidden'과 반경 (안 그러면 사각형이 모서리 밖으로 샌다)
 *   2. 이 컴포넌트를 첫 자식으로 (라벨보다 뒤에 깔려야 한다)
 * backgroundColor는 남겨 둔다 — 폴백이자, 그라디언트가 못 그려져도 버튼은 보여야 한다.
 */
export function GreenFill() {
  return (
    <LinearGradient
      colors={[colors.green, colors.greenCore]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
  );
}

/**
 * 줄 카드의 왼쪽 앵커 — 초록 월 / 큰 일 / 요일.
 *
 * 일정 목록(ScheduleRow)과 홈 경기 카드가 각자 같은 걸 그리고 있었고, 값이 조금씩
 * 갈라져 있었다(월 10 vs 12px, 요일색 textDim vs textMuted). 두 화면에 나란히 놓이면
 * 같은 날짜인데 다른 물건처럼 보인다.
 *
 * 초록은 월에만 쓴다. 날짜 숫자가 주인공이라 그건 흰색이어야 하고,
 * 월까지 흰색이면 세 줄이 한 덩어리로 뭉쳐 어디가 날짜인지 안 잡힌다.
 */
export function DateBlock({ month, day, dow }: { month: string; day: string; dow: string }) {
  return (
    <View style={styles.dateBlock}>
      <Text style={styles.dateMonth}>{month}</Text>
      <Text style={styles.dateDay}>{day}</Text>
      <Text style={styles.dateDow}>{dow}</Text>
    </View>
  );
}

/**
 * [앵커 | 본문 | 상태] 세 칸짜리 줄 카드.
 *
 * 일정 목록의 생김새를 그대로 쓴다 — 왼쪽에 눈이 걸리는 앵커(날짜·아바타),
 * 가운데에 제목과 보조 한 줄, 오른쪽에 숫자와 배지. 목록을 세로로 훑을 때
 * 각 칸이 같은 x축에 서 있어서 비교가 된다.
 *
 * left/right는 무엇이 오든 상관하지 않는다 — 날짜든 아바타든, 배지든 화살표든
 * 자리와 정렬만 이 컴포넌트가 잡는다.
 */
export function RowCard({
  left,
  title,
  sub,
  right,
  onPress,
  selected,
  flat,
  divider,
  accessibilityLabel,
}: {
  left?: ReactNode;
  title: string;
  sub?: string;
  right?: ReactNode;
  /**
   * 앵커와 본문 사이 세로 실선.
   *
   * 처음엔 left가 있으면 자동으로 넣었는데, 앵커가 날짜 블록(42px)일 때만 말이 된다.
   * 공지 줄처럼 앵커가 8px 점 하나면 점 + 여백 + 선 + 여백이 쌓여 제목이 25px 밀린다.
   * 선이 가를 만한 덩어리가 왼쪽에 있을 때만 켠다.
   */
  divider?: boolean;
  onPress?: () => void;
  /** 선택된 줄만 초록 — 스펙 10절, 나머지는 조용한 dark surface */
  selected?: boolean;
  /**
   * 껍데기 없이 배치만.
   *
   * 이 줄이 이미 카드 안에 있을 때 쓴다 — 그대로 두면 카드 안에 카드가 되고,
   * 면이 두 겹 쌓여 안쪽이 붕 뜬다(스펙 09절이 최소화하라고 한 구조다).
   * 좋아 보이는 건 껍데기가 아니라 [앵커 | 본문 | 상태] 리듬이라, 그것만 남긴다.
   */
  flat?: boolean;
  accessibilityLabel?: string;
}) {
  const body = (
    <>
      {left}
      {!!left && !!divider && <View style={styles.rowDivider} />}
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{title}</Text>
        {!!sub && (
          <Text style={styles.rowSub} numberOfLines={1}>
            {sub}
          </Text>
        )}
      </View>
      {right}
    </>
  );
  const style = [flat ? styles.rowFlat : [styles.base, styles.row], selected && styles.rowOn];
  if (!onPress) return <View style={style}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      style={({ pressed }) => [style, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

/**
 * 상태 배지. 초록은 「진행중·완료」처럼 실제 상태에만 쓴다 —
 * 배지마다 초록을 칠하면 초록이 상태를 뜻하지 않게 된다.
 */
export function Badge({ label, tone = 'muted' }: { label: string; tone?: 'green' | 'muted' | 'warn' }) {
  return (
    <View style={[styles.badge, styles[`badge_${tone}`]]}>
      <Text style={[styles.badgeText, styles[`badgeText_${tone}`]]}>{label}</Text>
    </View>
  );
}

/**
 * 통계 타일 — 「진행중 2건」처럼 숫자 하나와 그게 무엇인지.
 * 라벨이 위, 숫자가 아래다. 숫자를 먼저 읽고 라벨로 확인하는 순서라야
 * 격자를 훑을 때 숫자끼리 같은 높이에서 비교된다.
 */
export function StatTile({
  label,
  value,
  icon,
  accent,
  tone = 'green',
  hint,
  onPressHint,
}: {
  label: string;
  value: string;
  /**
   * 라벨 앞 아이콘 — 선택이다.
   *
   * 「격자 안에서 서로 구분해야 할 때만 붙인다」가 규칙이다. 칸이 하나뿐인 자리
   * (팀 홈의 「내 기록」)나 칸마다 이미 카드로 갈려 있는 자리(홈 Bento 3칸)에서는
   * 구분할 대상이 없어서 장식만 남는다 — 타일 색을 초록 하나로 모을 때와 같은 논리다.
   * 그래서 전부에 붙이지 않고, 안 넘기면 예전 모양 그대로다.
   */
  icon?: keyof typeof Ionicons.glyphMap;
  /** 숫자를 강조할지 — 0이거나 뜻이 없으면 끈다 */
  accent?: boolean;
  /**
   * 강조색.
   *
   * 초록만 있었는데, 미납 금액처럼 「크면 나쁜 숫자」에도 초록이 붙어 좋아 보였다.
   * 색이 숫자의 뜻을 뒤집으면 안 된다.
   */
  tone?: 'green' | 'danger';
  /**
   * 값 옆에 붙는 ⓘ — 선택이다.
   *
   * 레퍼런스가 「참여율 67% ⓘ」로 값과 같은 줄에 둔다. 예전엔 격자 아래 별도 줄로
   * 「ⓘ 이번 달 치른 경기 기준이에요」를 상시로 적었다. 레퍼런스에 맞춰 자리를 옮기되,
   * 아무 일도 안 하는 아이콘은 두지 않는다 — 눌러서 그 문장을 펼친다.
   */
  hint?: boolean;
  onPressHint?: () => void;
}) {
  return (
    <View style={styles.stat}>
      <View style={styles.statLabelRow}>
        {!!icon && <Ionicons name={icon} size={13} color={colors.textMuted} />}
        <Text style={styles.statLabel}>{label}</Text>
      </View>
      <View style={styles.statValueRow}>
        <Text
          style={[styles.statValue, accent && { color: tone === 'danger' ? colors.danger : colors.green }]}
          numberOfLines={1}
        >
          {value}
        </Text>
        {hint && (
          <Pressable onPress={onPressHint} hitSlop={10} accessibilityRole="button" accessibilityLabel="기준 안내">
            <Ionicons name="information-circle-outline" size={13} color={colors.textFaint} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

/** 통계 타일을 가로로 나누는 줄. 칸 사이는 선이 아니라 여백이 가른다 */
export function StatRow({ children }: { children: ReactNode }) {
  return <View style={styles.statRow}>{children}</View>;
}

const styles = StyleSheet.create({
  /*
   * 모든 단계에 얇고 낮은 대비의 테두리를 둔다 (스펙 04절).
   *
   * 한동안 테두리를 걷고 그림자만으로 카드를 띄웠는데, 그건 카드 면이 배경보다
   * 확실히 밝을 때만 통한다. 배경이 Deep Black(#080B09)으로 내려가면서 카드도 같이
   * 내려갔고(#141A17), 검정 위의 검정 그림자로는 경계가 서지 않는다.
   * border(#222B26)는 카드보다 아주 조금 밝을 뿐이라 선이 도드라지지 않는다.
   */
  base: { borderCurve: 'continuous', borderWidth: 1, borderColor: colors.border },
  pressed: { opacity: 0.85 },

  hero: {
    ...shadow.raised,
    backgroundColor: colors.cardRaised,
    borderColor: colors.borderRaised,
    borderRadius: radius.hero,
    padding: 20,
    gap: 14,
  },
  primary: {
    ...shadow.card,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: 20,
    gap: 14,
  },
  bento: {
    ...shadow.card,
    backgroundColor: colors.card,
    borderRadius: radius.tile,
    padding: 16,
    gap: 10,
  },
  // 목록은 그림자도 테두리도 주지 않는다 — 줄마다 뜨고 선까지 두르면
  // 화면이 격자가 되고, 위 카드들의 높이가 죽는다. 면 밝기만으로 가른다.
  list: {
    backgroundColor: colors.cardAlt,
    borderColor: 'transparent',
    borderRadius: radius.control,
    padding: 14,
    gap: 8,
  },

  // ── 줄 카드 ─────────────────────────────────────────────
  row: {
    ...shadow.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: radius.tile,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  /*
   * 카드 안에 놓이는 줄 — 배치만 같고 면은 부모 카드가 갖는다.
   *
   * 바깥 줄(row)보다 얇다. 저쪽은 카드 하나가 한 줄이라 여백이 카드의 몸집이지만,
   * 이쪽은 이미 카드 안이라 여백이 두 겹으로 쌓인다. 한 줄짜리 공지에 위아래 11씩
   * 주니 39px이 됐다 — 글자는 13px인데 줄이 세 배였다.
   */
  rowFlat: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 8 },
  /** 선택된 줄에만 초록 — 면은 아주 옅게, 테두리로 확실히 (스펙 10절) */
  rowOn: { backgroundColor: colors.greenTint, borderColor: colors.greenDeep },
  rowBody: { flex: 1, gap: 3, minWidth: 0 },
  // 700이었다 — 13px에서 700은 목록으로 쌓이면 줄마다 굵게 외치는 꼴이 된다.
  // 제목이 눈에 걸리는 건 굵기가 아니라 오른쪽 메타(textMuted)와의 밝기 차가 한다.
  rowTitle: { ...font.body, ...font.num, color: colors.textStrong, fontWeight: '600' },
  rowSub: { ...font.label, color: colors.textMuted, fontWeight: '600' },
  /** 앵커와 본문 사이 세로 실선 — 두 칸이 붙어 보이지 않게 */
  rowDivider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border },

  dateBlock: { width: 42, alignItems: 'center', gap: 1 },
  dateMonth: { ...font.micro, color: colors.green },
  dateDay: { ...font.title, ...font.num, color: colors.text },
  dateDow: { ...font.micro, color: colors.textDim, fontWeight: '700' },

  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  badge_green: { backgroundColor: colors.greenTint },
  badge_muted: { backgroundColor: 'rgba(255,255,255,0.06)' },
  badge_warn: { backgroundColor: colors.goldTint },
  badgeText: { ...font.micro },
  badgeText_green: { color: colors.green },
  badgeText_muted: { color: colors.textMuted },
  badgeText_warn: { color: colors.gold },

  statRow: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, gap: 4 },
  /* 값과 ⓘ가 같은 줄 — 레퍼런스가 그 자리다. 아이콘은 값 뒤에 붙어 따라 움직인다 */
  statValueRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  /* 아이콘은 라벨과 같은 줄, 같은 색이다 — 숫자보다 물러나 있어야 숫자끼리 비교된다 */
  statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statLabel: { ...font.micro, color: colors.textMuted, fontWeight: '700' },
  statValue: { ...font.title, ...font.num, color: colors.text },
});
