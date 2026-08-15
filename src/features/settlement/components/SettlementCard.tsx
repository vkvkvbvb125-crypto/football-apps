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
import Svg, { Circle } from 'react-native-svg';
import { colors, font, radius } from '../../../theme';

export type SettlementCardVariant = 'active' | 'pending';

/**
 * 카드 오른쪽의 진행률 링 — 참석자 대비 입금 완료 비율.
 * label을 주면 퍼센트 대신 그 글자를 넣는다 (미등록처럼 아직 비율이 없는 상태용).
 */
export function ProgressRing({ pct, label, size = 56 }: { pct: number; label?: string; size?: number }) {
  // 큰 링에서 테두리가 실처럼 가늘어지지 않게 지름에 맞춰 두께를 키운다
  const stroke = Math.max(6, Math.round(size * 0.09));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.divider} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.green}
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
}: SettlementCardProps) {
  // 아이콘 버튼은 카드 Pressable 안에 중첩된다 — 웹(RNW)에서는 DOM 이벤트가 그대로
  // 버블링돼서 stopPropagation 없이는 아이콘을 눌러도 카드의 onPress(상세 열기)까지 같이 탄다.
  const stop = (fn: () => void) => (e: { stopPropagation?: () => void }) => {
    e.stopPropagation?.();
    fn();
  };

  const pending = variant === 'pending';

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.sCard, pressed && styles.pressed]}>
      {/* 1단 — 좌측 배지 = 정산 상태, 우측 텍스트 = 미납 인원.
          미납을 배지로 만들면 둘 다 배지라 무엇이 상태고 무엇이 카운트인지 구분이 안 된다. */}
      <View style={styles.sCardHead}>
        <View style={[styles.sBadge, pending && styles.sBadgeOutline]}>
          {/* 진행중과 완납은 같은 초록이라 색만으로는 안 갈린다 — 완납에만 체크를 붙인다 */}
          {!pending && unpaidCount === 0 && <Ionicons name="checkmark" size={12} color={colors.green} />}
          <Text style={styles.sBadgeText}>{statusLabel}</Text>
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
          </View>
          <Text style={styles.sAmount}>{amount.toLocaleString()}원</Text>
          <Text style={styles.sPerPerson}>1인당 {perPerson.toLocaleString()}원</Text>
        </View>
        {/* 미등록은 아직 비율이 없다 — 퍼센트 자리에 상태를 넣는다 */}
        <ProgressRing pct={pct} label={pending ? '미등록' : undefined} />
      </View>

      {/* 3단 — 액션 아이콘 행. 원형 배경 없이 아이콘 + 캡션.
          미등록은 보낼 링크도 계좌도 없어 "정산 만들기 / 상세" 둘만 둔다. */}
      <View style={styles.sIconRow}>
        <Pressable
          disabled={!onPrimaryAction}
          onPress={onPrimaryAction ? stop(onPrimaryAction) : undefined}
          style={[styles.sIconBtn, !onPrimaryAction && styles.sIconBtnOff]}
        >
          <Ionicons
            name={pending ? 'calculator-outline' : 'card-outline'}
            size={22}
            color={pending ? colors.green : colors.textStrong}
          />
          <Text style={[styles.sIconLabel, pending && styles.sIconLabelOn]}>
            {pending ? '정산 만들기' : '계좌 송금'}
          </Text>
        </Pressable>

        {!pending && (
          <Pressable
            disabled={!onShare}
            onPress={onShare ? stop(onShare) : undefined}
            style={[styles.sIconBtn, !onShare && styles.sIconBtnOff]}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.textStrong} />
            <Text style={styles.sIconLabel}>카톡 공유</Text>
          </Pressable>
        )}

        <Pressable onPress={stop(onPress)} style={styles.sIconBtn}>
          <Ionicons name="list-outline" size={22} color={colors.textStrong} />
          <Text style={styles.sIconLabel}>상세</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.85 },

  sCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
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
  sBadgeOutline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.greenDeep },
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
  ringLabel: { color: colors.textMuted, fontSize: 10.5, fontWeight: '800' },

  sIconRow: {
    flexDirection: 'row',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  // 탭 타겟 세로 44px 이상 — 아이콘 22 + 캡션 + 여백으로 확보한다
  sIconBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 },
  sIconBtnOff: { opacity: 0.35 },
  sIconLabel: { color: colors.textBody, fontSize: 11, fontWeight: '700' },
  sIconLabelOn: { color: colors.green },
});
