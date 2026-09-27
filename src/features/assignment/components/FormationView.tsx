// src/features/assignment/components/FormationView.tsx
// 나뉜 팀 하나를 포메이션으로 그린다. 5명 1-2-1, 6명 2-2-1 (features/team/positions.ts).
//
// 코트 그림을 그리지 않는다 — 골대 표시와 줄 간격만으로 위아래(우리 골대 → 상대 골대)가 읽힌다.
// 잔디·라인까지 그리면 이름이 묻히고, 여기서 알고 싶은 건 "누가 어디 서나" 하나다.
import { StyleSheet, View } from 'react-native';
import { Text } from '../../../components/nativeText';
import { radius, type Palette } from '../../../theme';
import { useThemed } from '../../../lib/useThemed';
import { POSITION_INFO, toPosition, type Formation, type Position } from '../../team/positions';

export interface FormationPlayer {
  id: string;
  name: string;
  /** 선호 포지션 (team_members.position) */
  position: string | null;
}

/**
 * 선호 포지션대로 자리를 채운다.
 *
 * 같은 자리를 여럿이 원하면 먼저 온 사람이 앉고 나머지는 남은 자리로 간다 —
 * 실력이나 참석 횟수로 우선순위를 매기지 않는다. 그건 사람이 정할 일이고,
 * 여기서 자동으로 정하면 왜 저 사람이 밀렸는지 설명할 수 없다.
 */
export function assignToFormation(players: FormationPlayer[], slots: Position[]) {
  const remaining = [...players];
  const take = (want: Position) => {
    const i = remaining.findIndex((p) => toPosition(p.position) === want);
    return remaining.splice(i >= 0 ? i : 0, 1)[0] ?? null;
  };
  return slots.map((slot) => ({ slot, player: remaining.length ? take(slot) : null }));
}

/*
  ⚠ **어느 포메이션을 그릴지는 이 컴포넌트가 안 정한다.** 부르는 쪽(AssignmentScreen)이
    고른 것을 넘긴다 — 선택이 화면 상태이기 때문이다(저장하지 않는다).
*/
export function FormationView({ players, formation }: { players: FormationPlayer[]; formation: Formation }) {
  const { colors, styles } = useThemed(makeStyles);

  // rows는 우리 골대 → 상대 골대 순서다. 화면은 상대 골대가 위라 뒤집어 그린다.
  const slots = formation.rows.flat();
  const filled = assignToFormation(players, slots);
  let cursor = 0;
  const rows = formation.rows.map((row) => filled.slice(cursor, (cursor += row.length)));

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        {/* ⚠ 배지가 **골키퍼를 뺀** 배치라(「2-2-1」=5) 헤더도 갈라서 적는다.
            전에는 「6명 · 골키퍼 포함」이었는데 2+2+1=5와 6이 나란히 놓여
            읽는 사람이 하나를 잃어버렸다(positions.ts 표기 규칙). */}
        <Text style={styles.headText}>
          골키퍼 1 · 필드 {players.length - 1}
        </Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{formation.label}</Text>
        </View>
      </View>

      <Text style={styles.goalLabel}>상대 골대</Text>
      <View style={styles.goalLine} />

      {[...rows].reverse().map((row, ri) => (
        <View key={ri} style={styles.row}>
          {row.map(({ slot, player }, ci) => (
            <View key={ci} style={styles.slot}>
              <View style={[styles.dot, slot === 'GOLEIRO' && styles.dotKeeper]} />
              <Text style={styles.slotName} numberOfLines={1}>
                {player?.name ?? '—'}
              </Text>
              <Text style={styles.slotPos}>
                {slot} · {POSITION_INFO[slot].ko}
              </Text>
              {/* 용어 아래 역할을 반드시 붙인다 — PIVO만 보고 어디 서는지 아는 사람은 드물다.
                  같은 자리가 둘이면 역할 대신 좌/우로 갈라야 서로 겹치지 않는다. */}
              <Text style={styles.slotRole}>
                {row.length > 1 ? (ci === 0 ? '좌측' : '우측') : POSITION_INFO[slot].role}
              </Text>
            </View>
          ))}
        </View>
      ))}

      <View style={styles.goalLine} />
      <Text style={styles.goalLabel}>우리 골대</Text>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  wrap: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardAlt,
    padding: 14,
    gap: 10,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headText: { flex: 1, color: colors.textStrong, fontSize: 12, fontWeight: '800' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.chip, backgroundColor: colors.greenTint },
  badgeText: { color: colors.green, fontSize: 11, fontWeight: '800', fontVariant: ['tabular-nums'] },

  goalLabel: { color: colors.textFaint, fontSize: 10, fontWeight: '700', textAlign: 'center' },
  goalLine: { height: 1, marginHorizontal: 60, backgroundColor: colors.greenDeep },

  row: { flexDirection: 'row', justifyContent: 'center', gap: 24 },
  slot: { alignItems: 'center', gap: 3, minWidth: 76 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.green },
  // 골키퍼만 색을 달리한다 — 한 명뿐이라 줄 위치보다 색이 빨리 읽힌다
  dotKeeper: { backgroundColor: colors.gold },
  slotName: { color: colors.text, fontSize: 12, fontWeight: '700' },
  slotPos: { color: colors.textDim, fontSize: 10, fontWeight: '600' },
  slotRole: { color: colors.textFaint, fontSize: 10, fontWeight: '600' },
  });
