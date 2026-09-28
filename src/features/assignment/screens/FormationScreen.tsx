// src/features/assignment/screens/FormationScreen.tsx — 팀 하나의 배치를 코트 위에 본다.
//
// 팀 분배 카드의 **팀 블록 헤더를 탭하면** 열린다. 카드 안에 인라인으로 그리던 것을
// 2026-09-28에 이리로 옮겼다 — 코트가 있어야 「누가 어디 서나」가 그림으로 읽힌다.
//
// ── ⚠ params로 id만 받는다 ────────────────────────────────────────
// 명단을 통째로 넘기지 않는다. 넘기면 **그 순간의 사진**이 되어, 열어 둔 사이에
// 총무가 다시 나눠도 화면이 안 따라간다. 스토어에서 읽으면 따라간다.
//
// ── ⚠ 고른 포메이션은 스토어에 있다 ───────────────────────────────
// 이 화면의 `useState`가 아니다 — 분배 카드의 읽기 전용 배지가 **같은 값**을 봐야 한다
// (formationPickStore). 저장은 안 한다.
import { useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Text } from '../../../components/nativeText';
import { ScreenGradient } from '../../../components/ScreenGradient';
import { radius, type Palette } from '../../../theme';
import { useThemed } from '../../../lib/useThemed';
import { useTeamStore } from '../../team/stores/teamStore';
import { useAttendanceStore } from '../../attendance/stores/attendanceStore';
import { formationHint, formationsFor } from '../../team/positions';
import { matchLabel } from '../../attendance/utils/matchLabel';
import { useAssignmentStore } from '../stores/assignmentStore';
import { formationKey, useFormationPickStore } from '../stores/formationPickStore';
import { FormationEmptyField, FormationField } from '../components/FormationView';

export function FormationScreen() {
  const navigation = useNavigation<{ goBack: () => void }>();
  const route = useRoute<{ key: string; name: string; params: { matchId: string; group: string } }>();
  const { matchId, group } = route.params;
  const { colors, styles } = useThemed(makeStyles);

  const activeTeam = useTeamStore((s) => s.activeTeam);
  const members = useTeamStore((s) => s.members);
  const memberNames = useTeamStore((s) => s.memberNames);
  const isAdmin = activeTeam?.role === 'admin';

  const assignments = useAssignmentStore((s) => s.assignments);
  const matches = useAttendanceStore((s) => s.matches);
  const picks = useFormationPickStore((s) => s.picks);
  const pick = useFormationPickStore((s) => s.pick);

  const match = matches.find((m) => m.id === matchId);
  const list = useMemo(
    () => assignments.filter((a) => a.match_id === matchId && a.group_label === group),
    [assignments, matchId, group]
  );

  const players = list.map((a) => ({
    id: a.team_member_id,
    /* ⚠ 나간 사람의 분배 기록도 남는다. 이름은 memberNames에서 찾는다 */
    name: memberNames.get(a.team_member_id) ?? '멤버',
    position: members.find((m) => m.id === a.team_member_id)?.position ?? null,
    isMe: a.team_member_id === activeTeam?.membershipId,
  }));

  const options = formationsFor(players.length);
  const key = formationKey(matchId, group);
  const picked = picks[key] ?? 0;
  const hint = options ? null : formationHint(players.length);

  return (
    <ScreenGradient>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="뒤로"
        >
          <Ionicons name="chevron-back" size={22} color={colors.textStrong} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.headerTitle}>{group}팀 포메이션</Text>
          {!!match && (
            <Text style={styles.headerSub} numberOfLines={1}>
              {matchLabel(match.match_date, match.location)}
            </Text>
          )}
        </View>
        {/*
          ⚠ **포메이션을 그릴 때만 적는다.** 1명짜리 팀에 「골키퍼 1 · 필드 0」이
            찍혔다(2026-09-28 기기) — 자리를 못 나눈 상태인데 골키퍼가 있다고 말한 셈이다.
            범위 밖에서는 인원만 적는다.
        */}
        <Text style={styles.headCount}>
          {options ? `골키퍼 1 · 필드 ${players.length - 1}` : players.length > 0 ? `${players.length}명` : ''}
        </Text>
      </View>

      {/*
        ⚠ 칩 줄은 **범위 안일 때만** 그린다. 후보가 하나뿐이어도 안 그린다 —
          고를 것이 없는데 줄이 있으면 누를 수 있는 줄 안다.
      */}
      {!!options && options.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          /*
            ⚠ **`flexGrow: 0`이 없으면 세로로 늘어나 화면을 먹는다.**
              가로 ScrollView도 flex 자식이라 남는 높이를 다 가져간다 —
              2026-09-28 기기에서 칩 줄이 화면 절반을 차지하고 코트가 잘렸다.
          */
          style={styles.chipsBar}
          contentContainerStyle={styles.chips}
        >
          {options.map((opt, i) => (
            <Pressable
              key={opt.label}
              onPress={() => pick(key, i)}
              accessibilityRole="button"
              accessibilityState={{ selected: i === picked }}
              accessibilityLabel={`포메이션 ${opt.label}`}
              style={({ pressed }) => [
                styles.chip,
                i === picked && styles.chipOn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.chipText, i === picked && styles.chipTextOn]}>{opt.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <View style={styles.field}>
        {options ? (
          <FormationField players={players} formation={options[picked] ?? options[0]} />
        ) : (
          /*
            ⚠ 총무 전용 안내(8명 이상)는 팀원에게 안 보인다 — 팀을 나누는 것은
              총무만 할 수 있다. 대신 **빈 코트는 그린다**: 화면이 통째로 비면
              뭘 보러 들어왔는지 모른다.
          */
          <FormationEmptyField text={hint && (!hint.adminOnly || isAdmin) ? hint.text : ''} />
        )}
      </View>
    </ScreenGradient>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    pressed: { opacity: 0.6 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    headerTitle: { color: colors.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
    headerSub: { color: colors.textDim, fontSize: 12, fontWeight: '600', marginTop: 2 },
    headCount: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },

    chipsBar: { flexGrow: 0, flexShrink: 0 },
    chips: { paddingHorizontal: 20, paddingBottom: 10, gap: 6, alignItems: 'center' },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: radius.chip,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.cardAlt,
    },
    /* ⚠ 화면에서 **채도 높은 초록은 여기 하나**다(스펙 §02) */
    chipOn: { borderColor: colors.green, backgroundColor: colors.greenTint },
    chipText: { color: colors.textDim, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
    chipTextOn: { color: colors.green },

    /* 코트가 남는 높이를 채운다 — 비율은 기기에서 재서 정한다(FormationView 머리말) */
    field: { flex: 1, paddingHorizontal: 20, paddingBottom: 20 },
  });
