// src/features/assignment/components/FormationView.tsx — 풋살 코트 위에 배치를 그린다.
//
// ⚠ **2026-09-28에 방향을 바꿨다.** 전에는 분배 카드 **안에** 줄과 골대선만으로 그렸다.
//   지금은 팀 블록을 탭하면 열리는 **상세 화면**에서 코트 위에 그린다.
//
// ── ⚠ 스펙 §02 「모든 배경에 Green 금지」와 부딪히는 자리다 ───────
// 그 규칙은 **배경이 초록이면 강조해야 할 CTA·활성 탭의 초록이 바탕에 섞인다**는
// 것을 막는다(ScreenGradient.tsx 머리말). 코트는 화면 배경이 아니라
// **경계가 있는 물체**지만, 안 지키면 규칙 위반이 맞다. 그래서 못 박는다:
//
//     코트 면   greenTrack   (다크 #0E2E1A · 라이트 #DCFCE7) — **가라앉은 초록**
//     선        greenLine    (알파 0.25~0.28) — 선수 이름보다 튀면 안 된다
//     선수 칩   card         — **중립색**
//
//   → 화면에서 **채도 높은 초록은 선택된 포메이션 칩 하나**만 남는다.
//   ⚠ 여기에 colors.green / greenBright를 쓰지 마라. formation.check가 막는다.
//
// ── 코트 비율 ─────────────────────────────────────────────────────
// 실제 풋살 코트는 40×20m(2:1)지만 **쓰지 않는다.** 세로 2:1이면 너비 980에 높이
// 1960이라 작은 화면(1080x1920)을 넘는다. **남는 높이를 채우고** 비율은
// 기기에서 4명(4줄)과 7명(4줄) 양쪽을 재서 정한다 — 줄 수가 다르면 같은 비율이
// 한쪽에서 답답해진다. 배치를 읽는 그림이지 축척 도면이 아니다.
import { StyleSheet, View } from 'react-native';
import { Text } from '../../../components/nativeText';
import { radius, type Palette } from '../../../theme';
import { useThemed } from '../../../lib/useThemed';
import { initialOf } from '../../team/initials';
import { POSITION_INFO, toPosition, type Formation, type Position } from '../../team/positions';

export interface FormationPlayer {
  id: string;
  name: string;
  /** 선호 포지션 (team_members.position) */
  position: string | null;
  /** 나 — 코트에서 나를 먼저 찾게 한다 */
  isMe?: boolean;
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

/** 코트만 그린다 — 안내를 얹을 때도 같은 그림을 쓴다(무엇이 채워질 자리인지 보인다) */
function Pitch({ children }: { children?: React.ReactNode }) {
  const { styles } = useThemed(makeStyles);
  return (
    <View style={styles.pitch}>
      {/* 상대 골대 — 위 */}
      <View style={[styles.goal, styles.goalTop]} />
      <View style={[styles.box, styles.boxTop]} />
      {/* 하프라인 + 센터서클 */}
      <View style={styles.halfLine} />
      <View style={styles.centerCircle} />
      {/* 우리 골대 — 아래 */}
      <View style={[styles.box, styles.boxBottom]} />
      <View style={[styles.goal, styles.goalBottom]} />
      {children}
    </View>
  );
}

export function FormationField({ players, formation }: { players: FormationPlayer[]; formation: Formation }) {
  const { styles } = useThemed(makeStyles);

  const slots = formation.rows.flat();
  const filled = assignToFormation(players, slots);
  let cursor = 0;
  const rows = formation.rows.map((row) => filled.slice(cursor, (cursor += row.length)));

  return (
    <Pitch>
      <View style={styles.rowsWrap}>
        {/* rows는 우리 골대 → 상대 골대 순서다. 화면은 상대 골대가 위라 뒤집어 그린다 */}
        {[...rows].reverse().map((row, ri) => (
          <View key={ri} style={styles.row}>
            {row.map(({ slot, player }, ci) => (
              <View key={ci} style={styles.slot}>
                <View
                  style={[
                    styles.chip,
                    slot === 'GOLEIRO' && styles.chipKeeper,
                    player?.isMe && styles.chipMe,
                  ]}
                >
                  <Text style={styles.chipInitial} numberOfLines={1}>
                    {player ? initialOf(player.name) : '—'}
                  </Text>
                </View>
                <Text style={styles.chipName} numberOfLines={1}>
                  {player?.name ?? '—'}
                </Text>
                {/* 용어만 두면 어디 서는지 모른다 — 한글 이름을 붙인다(positions.ts) */}
                <Text style={styles.chipPos} numberOfLines={1}>
                  {POSITION_INFO[slot].ko}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </Pitch>
  );
}

/** 4명 미만·8명 이상 — **코트는 그리고** 가운데에 한 줄만 얹는다 */
export function FormationEmptyField({ text }: { text: string }) {
  const { styles } = useThemed(makeStyles);
  return (
    <Pitch>
      <View style={styles.hintWrap}>
        <Text style={styles.hintText}>{text}</Text>
      </View>
    </Pitch>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    /* ⚠ 남는 높이를 채운다. 비율은 기기에서 재서 정한다 — 머리말 참고 */
    pitch: {
      flex: 1,
      borderRadius: radius.card,
      borderWidth: 1,
      borderColor: colors.greenLine,
      backgroundColor: colors.greenTrack,
      overflow: 'hidden',
    },

    /* 선은 전부 greenLine — 이름보다 튀면 안 된다 */
    goal: {
      position: 'absolute',
      left: '38%',
      right: '38%',
      height: 6,
      borderColor: colors.greenLine,
      borderWidth: 2,
    },
    /* ⚠ 0에 두면 둥근 모서리에 잘린다(overflow:hidden) — 안쪽으로 들인다 */
    goalTop: { top: 6, borderBottomWidth: 2, borderTopWidth: 0 },
    goalBottom: { bottom: 6, borderTopWidth: 2, borderBottomWidth: 0 },
    box: {
      position: 'absolute',
      left: '22%',
      right: '22%',
      height: '11%',
      borderColor: colors.greenLine,
      borderWidth: 1,
    },
    boxTop: { top: 6, borderTopWidth: 0 },
    boxBottom: { bottom: 6, borderBottomWidth: 0 },
    halfLine: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: '50%',
      height: 1,
      backgroundColor: colors.greenLine,
    },
    centerCircle: {
      position: 'absolute',
      alignSelf: 'center',
      top: '42%',
      width: '32%',
      aspectRatio: 1,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.greenLine,
    },

    rowsWrap: { flex: 1, justifyContent: 'space-evenly', paddingVertical: 10 },
    row: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center' },
    slot: { alignItems: 'center', gap: 3, maxWidth: '31%' },

    /* ⚠ 칩은 **중립색**이다. 초록으로 칠하면 코트와 섞이고 §02 규칙도 깨진다 */
    chip: {
      width: 46,
      height: 46,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    /* 골키퍼만 색을 달리한다 — 한 명뿐이라 줄 위치보다 색이 빨리 읽힌다 */
    chipKeeper: { borderColor: colors.gold, borderWidth: 2 },
    /* 나 — 코트에서 나를 먼저 찾게 한다 */
    chipMe: { borderColor: colors.green, borderWidth: 2 },
    chipInitial: { color: colors.textStrong, fontSize: 13, fontWeight: '800' },
    chipName: { color: colors.textStrong, fontSize: 11, fontWeight: '700' },
    chipPos: { color: colors.textDim, fontSize: 10, fontWeight: '600' },

    hintWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
    hintText: { color: colors.textDim, fontSize: 13, fontWeight: '600', textAlign: 'center', lineHeight: 20 },
  });
