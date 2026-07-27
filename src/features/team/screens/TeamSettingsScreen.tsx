// src/features/team/screens/TeamSettingsScreen.tsx — 신규
// 정기모임 기본값 / 회비 / 실력 레벨 / 게스트 / 가입 승인.
// 실력 레벨은 누르는 즉시 저장되고(팀 분배에 바로 반영), 나머지 필드는 "저장" 버튼으로
// team_settings 테이블에 upsert된다. 원본 핸드오프엔 "팀 삭제" 위험 구역이 있었는데
// 실제로는 navigation.goBack()만 하고 아무것도 지우지 않는 가짜 버튼이었다 — 팀 삭제를
// 되돌릴 수 없게 실제로 처리하려면 별도 RPC/cascade 설계가 필요해서 여기선 뺐다.
import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../../../components/nativeText';
import { ScreenGradient } from '../../../components/ScreenGradient';
import { colors, radius } from '../../../theme';
import { useTeamStore } from '../stores/teamStore';
import { fetchMemberProfiles, updateSkillLevel, SKILL_LABEL, type MemberProfile } from '../services/memberProfileService';
import { fetchTeamSettings, upsertTeamSettings, type TeamSettings } from '../services/teamSettingsService';
import type { FeeMode, SkillLevel } from '../../../types/database';

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];
// team_settings.default_weekdays는 0=월…6=일로 저장 (DB 스키마 comment 기준)
const TIMES = ['19:00', '20:00', '21:00'];

export function TeamSettingsScreen({ navigation }: any) {
  const activeTeam = useTeamStore((s) => s.activeTeam);
  const teamId = activeTeam?.team.id;

  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [weekdays, setWeekdays] = useState<Record<number, boolean>>({});
  const [time, setTime] = useState<string | null>(null);
  const [capacity, setCapacity] = useState('12');
  const [feeMode, setFeeMode] = useState<FeeMode>('per_match');
  const [fee, setFee] = useState('');
  const [bank, setBank] = useState('');
  const [accountNo, setAccountNo] = useState('');
  const [holder, setHolder] = useState('');
  const [guestAllowed, setGuestAllowed] = useState(true);
  const [guestFee, setGuestFee] = useState('');
  const [approval, setApproval] = useState(false);
  const [members, setMembers] = useState<MemberProfile[]>([]);

  useEffect(() => {
    if (!teamId) return;
    (async () => {
      try {
        const [settings, profiles] = await Promise.all([fetchTeamSettings(teamId), fetchMemberProfiles(teamId)]);
        if (settings) {
          setWeekdays(Object.fromEntries(settings.defaultWeekdays.map((d) => [d, true])));
          setTime(settings.defaultTime?.slice(0, 5) ?? null);
          setCapacity(String(settings.defaultCapacity));
          setFeeMode(settings.feeMode);
          setFee(settings.defaultFee != null ? String(settings.defaultFee) : '');
          setBank(settings.bankName ?? '');
          setAccountNo(settings.accountNo ?? '');
          setHolder(settings.accountHolder ?? '');
          setGuestAllowed(settings.guestAllowed);
          setGuestFee(settings.guestFee != null ? String(settings.guestFee) : '');
          setApproval(settings.joinApprovalRequired);
        }
        setMembers(profiles);
      } catch {
        // 처음 설정하는 팀이면 team_settings 행이 아예 없을 수 있음 — 기본값 그대로 둔다
      } finally {
        setLoaded(true);
      }
    })();
  }, [teamId]);

  const setLevel = async (m: MemberProfile, level: SkillLevel) => {
    setMembers((prev) => prev.map((p) => (p.id === m.id ? { ...p, skillLevel: level } : p)));
    try {
      await updateSkillLevel(m.id, level);
    } catch {
      // 실패 시 다음 로드에서 되돌아옵니다
    }
  };

  const handleSave = async () => {
    if (!teamId) return;
    setSaving(true);
    try {
      await upsertTeamSettings(teamId, {
        defaultWeekdays: Object.keys(weekdays)
          .filter((k) => weekdays[Number(k)])
          .map(Number),
        defaultTime: time,
        defaultCapacity: Number(capacity) || 12,
        feeMode,
        defaultFee: fee ? Number(fee) : null,
        bankName: bank || null,
        accountNo: accountNo || null,
        accountHolder: holder || null,
        guestAllowed,
        guestFee: guestFee ? Number(guestFee) : null,
        joinApprovalRequired: approval,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } finally {
      setSaving(false);
    }
  };

  const selectedDays = Object.keys(weekdays).filter((k) => weekdays[Number(k)]);

  if (!loaded) {
    return (
      <ScreenGradient>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
            <Ionicons name="chevron-back" size={22} color={colors.textStrong} />
          </Pressable>
          <Text style={styles.headerTitle}>팀 설정</Text>
        </View>
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.green} />
      </ScreenGradient>
    );
  }

  return (
    <ScreenGradient>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={colors.textStrong} />
        </Pressable>
        <Text style={styles.headerTitle}>팀 설정</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* 정기모임 */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>정기모임</Text>
            <Text style={styles.cardSub}>
              {selectedDays.length && time ? `매주 ${selectedDays.map((d) => WEEKDAYS[Number(d)]).join('·')} ${time}` : '미설정'}
            </Text>
          </View>

          <Text style={styles.label}>요일</Text>
          <View style={styles.row}>
            {WEEKDAYS.map((w, i) => {
              const on = !!weekdays[i];
              return (
                <Pressable key={w} onPress={() => setWeekdays((p) => ({ ...p, [i]: !p[i] }))} style={[styles.chip, on && styles.chipOn]}>
                  <Text
                    style={[
                      styles.chipText,
                      i === 5 && !on && { color: '#7093C8' },
                      i === 6 && !on && { color: '#C86D6D' },
                      on && styles.chipTextOn,
                    ]}
                  >
                    {w}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>시간</Text>
          <View style={styles.row}>
            {TIMES.map((t) => (
              <Pressable key={t} onPress={() => setTime(t)} style={[styles.chip, time === t && styles.chipSoft]}>
                <Text style={[styles.chipText, time === t && { color: colors.green }]}>{t}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>기본 정원</Text>
          <View style={styles.inputRow}>
            <TextInput style={styles.input} value={capacity} onChangeText={setCapacity} keyboardType="number-pad" placeholderTextColor={colors.placeholder} />
            <Text style={styles.unit}>명</Text>
          </View>
          <Text style={styles.hint}>경기를 만들 때 이 값이 기본으로 채워지고, 초과 참석은 대기자로 넘어가요.</Text>
        </View>

        {/* 회비 */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>회비</Text>

          <View style={styles.segment}>
            {(['per_match', 'monthly'] as const).map((m) => (
              <Pressable key={m} onPress={() => setFeeMode(m)} style={[styles.segItem, feeMode === m && styles.segItemOn]}>
                <Text style={[styles.segText, feeMode === m && { color: colors.green }]}>{m === 'per_match' ? '경기별' : '월 회비'}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>{feeMode === 'per_match' ? '기본 1인당' : '월 회비'}</Text>
          <View style={styles.inputRow}>
            <TextInput style={styles.input} value={fee} onChangeText={setFee} keyboardType="number-pad" placeholder="10000" placeholderTextColor={colors.placeholder} />
            <Text style={styles.unit}>원</Text>
          </View>

          <Text style={styles.label}>기본 입금 계좌</Text>
          <TextInput style={styles.inputFull} value={bank} onChangeText={setBank} placeholder="은행" placeholderTextColor={colors.placeholder} />
          <TextInput
            style={styles.inputFull}
            value={accountNo}
            onChangeText={setAccountNo}
            placeholder="계좌번호"
            placeholderTextColor={colors.placeholder}
            keyboardType="number-pad"
          />
          <TextInput style={styles.inputFull} value={holder} onChangeText={setHolder} placeholder="예금주" placeholderTextColor={colors.placeholder} />
          <Text style={styles.hint}>정산 만들 때 이 계좌가 기본으로 채워져요.</Text>
        </View>

        {/* 실력 레벨 */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>실력 레벨</Text>
            <Text style={styles.cardSub}>팀 분배 균형에 사용</Text>
          </View>
          <View style={{ borderTopWidth: 1, borderTopColor: colors.divider }}>
            {members.map((m) => (
              <View key={m.id} style={styles.memberRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{m.name.slice(1)}</Text>
                </View>
                <Text style={styles.memberName} numberOfLines={1}>
                  {m.name}
                </Text>
                <View style={{ flexDirection: 'row', gap: 5 }}>
                  {([3, 2, 1] as const).map((v) => (
                    <Pressable key={v} onPress={() => setLevel(m, v)} style={[styles.lvBtn, m.skillLevel === v && styles.lvBtnOn]}>
                      <Text style={[styles.lvBtnText, m.skillLevel === v && { color: colors.bgRoot }]}>{SKILL_LABEL[v]}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </View>
          <Text style={styles.hint}>상 3점 · 중 2점 · 하 1점으로 균형을 맞춰요. 누르면 바로 저장돼요.</Text>
        </View>

        {/* 게스트 / 가입 */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>게스트 · 가입</Text>

          <Pressable onPress={() => setGuestAllowed((v) => !v)} style={styles.toggleRow}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.toggleTitle}>게스트 초대 허용</Text>
              <Text style={styles.toggleSub}>멤버가 외부 인원을 데려올 수 있어요</Text>
            </View>
            <View style={[styles.switch, guestAllowed && styles.switchOn]}>
              <View style={[styles.knob, guestAllowed && styles.knobOn]} />
            </View>
          </Pressable>

          {guestAllowed && (
            <>
              <Text style={styles.label}>게스트 회비</Text>
              <View style={styles.inputRow}>
                <TextInput style={styles.input} value={guestFee} onChangeText={setGuestFee} keyboardType="number-pad" placeholder="12000" placeholderTextColor={colors.placeholder} />
                <Text style={styles.unit}>원</Text>
              </View>
            </>
          )}

          <Pressable onPress={() => setApproval((v) => !v)} style={styles.toggleRow}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.toggleTitle}>가입 승인 필요</Text>
              <Text style={styles.toggleSub}>초대 코드를 입력해도 총무 승인 후 가입돼요</Text>
            </View>
            <View style={[styles.switch, approval && styles.switchOn]}>
              <View style={[styles.knob, approval && styles.knobOn]} />
            </View>
          </Pressable>
          <Text style={styles.hint}>
            가입 승인은 아직 실제로 심사하는 화면이 없어서, 켜도 지금은 기존과 동일하게 바로 가입돼요.
          </Text>
        </View>

        <Pressable onPress={handleSave} disabled={saving} style={[styles.saveBtn, saving && { opacity: 0.6 }]}>
          <Text style={styles.saveBtnText}>{saving ? '저장 중…' : saved ? '저장됐어요' : '저장'}</Text>
        </Pressable>
      </ScrollView>
    </ScreenGradient>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 12 },
  headerTitle: { color: colors.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  scroll: { padding: 20, paddingBottom: 60, gap: 14 },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 9,
  },
  cardHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  cardTitle: { color: colors.text, fontSize: 14.5, fontWeight: '800' },
  cardSub: { color: colors.green, fontSize: 11.5, fontWeight: '700' },
  label: { color: colors.textDim, fontSize: 11, fontWeight: '700', marginTop: 4 },
  hint: { color: '#5F6B66', fontSize: 11, fontWeight: '600', lineHeight: 17, marginTop: 2 },

  row: { flexDirection: 'row', gap: 5 },
  chip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 11,
    borderRadius: 11,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.green, borderColor: colors.green },
  chipSoft: { backgroundColor: 'rgba(74,222,128,0.12)', borderColor: '#2F4A3A' },
  chipText: { color: colors.textMuted, fontSize: 12.5, fontWeight: '800' },
  chipTextOn: { color: colors.bgRoot },

  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  input: {
    flex: 1,
    height: 46,
    paddingHorizontal: 13,
    borderRadius: 12,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  inputFull: {
    height: 46,
    paddingHorizontal: 13,
    borderRadius: 12,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 13.5,
  },
  unit: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },

  segment: {
    flexDirection: 'row',
    gap: 6,
    padding: 4,
    borderRadius: 13,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10 },
  segItemOn: { backgroundColor: 'rgba(74,222,128,0.10)', borderWidth: 1, borderColor: '#2F4A3A' },
  segText: { color: '#7C8A85', fontSize: 12.5, fontWeight: '800' },

  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#161F1B',
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#1E2A25',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#8FA69C', fontSize: 10.5, fontWeight: '800' },
  memberName: { flex: 1, color: colors.textStrong, fontSize: 13, fontWeight: '700' },
  lvBtn: {
    width: 34,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  lvBtnOn: { backgroundColor: colors.green, borderColor: colors.green },
  lvBtnText: { color: colors.textDim, fontSize: 11.5, fontWeight: '800' },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  toggleTitle: { color: colors.textStrong, fontSize: 13, fontWeight: '700' },
  toggleSub: { color: colors.textDim, fontSize: 11, fontWeight: '600' },
  switch: { width: 44, height: 26, borderRadius: 13, backgroundColor: '#1E2A25', padding: 3, justifyContent: 'center' },
  switchOn: { backgroundColor: colors.green },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#4A544F' },
  knobOn: { backgroundColor: colors.bgRoot, marginLeft: 18 },

  saveBtn: {
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  saveBtnText: { color: colors.bgRoot, fontSize: 15, fontWeight: '800' },
});
