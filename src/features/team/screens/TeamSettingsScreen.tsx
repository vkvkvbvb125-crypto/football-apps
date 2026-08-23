// src/features/team/screens/TeamSettingsScreen.tsx — 신규
// 정기모임 기본값 / 회비 / 실력 레벨 / 게스트 / 가입 승인.
// 실력 레벨은 누르는 즉시 저장되고(팀 분배에 바로 반영), 나머지 필드는 "저장" 버튼으로
// team_settings 테이블에 upsert된다. 원본 핸드오프엔 "팀 삭제" 위험 구역이 있었는데
// 실제로는 navigation.goBack()만 하고 아무것도 지우지 않는 가짜 버튼이었다 — 팀 삭제를
// 되돌릴 수 없게 실제로 처리하려면 별도 RPC/cascade 설계가 필요해서 여기선 뺐다.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../../../components/nativeText';
import { ScreenGradient } from '../../../components/ScreenGradient';
import { colors, font, radius } from '../../../theme';
import { useTeamStore } from '../stores/teamStore';
import { PlaceSearchModal } from '../../attendance/components/PlaceSearchModal';
import type { PlaceResult } from '../../attendance/services/placeService';
import { fetchMemberProfiles, updateSkillLevel, SKILL_LABEL, type MemberProfile } from '../services/memberProfileService';
import { fetchTeamSettings, upsertTeamSettings, diffSettings, hhmm } from '../services/teamSettingsService';
import type { TeamSettings } from '../services/teamSettingsService';
import { toUserMessage } from '../../../lib/dbError';
import type { FeeMode, SkillLevel } from '../../../types/database';

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];
// team_settings.default_weekdays는 0=월…6=일로 저장 (DB 스키마 comment 기준)
const TIMES = ['19:00', '20:00', '21:00'];

export function TeamSettingsScreen({ navigation }: any) {
  const activeTeam = useTeamStore((s) => s.activeTeam);
  const updateHomeLocation = useTeamStore((s) => s.updateHomeLocation);
  const teamId = activeTeam?.team.id;

  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
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

  const baseRef = useRef<TeamSettings | null>(null);

  const load = useCallback(async () => {
    if (!teamId) return;
    setLoadError(null);
    // 설정과 멤버는 따로 받는다.
    // 예전엔 Promise.all이었다 — 멤버 쿼리가 400을 내면 설정 setter가 한 줄도 실행되지
    // 않은 채 catch로 빠졌고, 폼은 빈 기본값으로 떴다. 그 상태로 저장하면 계좌가 날아갔다.
    try {
      const settings = await fetchTeamSettings(teamId);
      baseRef.current = settings && { ...settings, defaultTime: hhmm(settings.defaultTime) };
      if (settings) {
        setWeekdays(Object.fromEntries(settings.defaultWeekdays.map((d) => [d, true])));
        setTime(hhmm(settings.defaultTime));
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
      // settings === null은 "아직 설정 안 한 팀" — 오류가 아니다. 기본값 그대로 둔다.
    } catch (err) {
      setLoadError(toUserMessage(err, {}, 'loadTeamSettings'));
    }

    // 명단은 부가 정보 — 실패해도 설정 화면은 쓸 수 있어야 한다
    try {
      setMembers(await fetchMemberProfiles(teamId));
    } catch (err) {
      console.error('[loadMemberProfiles]', err);
    }
    setLoaded(true);
  }, [teamId]);

  useEffect(() => {
    load();
  }, [load]);

  const setLevel = async (m: MemberProfile, level: SkillLevel) => {
    setMembers((prev) => prev.map((p) => (p.id === m.id ? { ...p, skillLevel: level } : p)));
    try {
      await updateSkillLevel(m.id, level);
    } catch {
      // 실패 시 다음 로드에서 되돌아옵니다
    }
  };

  const handleSave = async () => {
    // 못 읽은 상태를 덮어쓰지 않는다 — 이게 마지막 방어선이다
    if (!teamId || loadError) return;

    const next: Partial<Omit<TeamSettings, 'teamId'>> = {
      defaultWeekdays: Object.keys(weekdays)
        .filter((k) => weekdays[Number(k)])
        .map(Number)
        .sort((a, b) => a - b),
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
    };

    const base = baseRef.current;
    const patch = diffSettings(next, base);

    setSaveError(null);
    if (Object.keys(patch).length === 0) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
      return;
    }

    setSaving(true);
    try {
      await upsertTeamSettings(teamId, patch);
      baseRef.current = { ...(base ?? ({} as TeamSettings)), ...next, teamId };
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (err) {
      setSaveError(toUserMessage(err, {}, 'saveTeamSettings'));
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
        <Text style={styles.headerTitle}>설정</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* 정기모임 */}
        {/*
          팀 대표 지역 — 팀 화면 설정 탭에서 옮겨 왔다.

          경기 없는 날의 예상 날씨를 이 좌표로 조회한다. 활동 지역(region_code)과는
          다른 값이다 — 저쪽은 매칭에서 구/군 단위로 거르는 코드고 이쪽은 날씨용 지점이다.
          둘 다 필요해서 통합하지 않는다.
        */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>팀 대표 지역</Text>
            <Text style={styles.cardSub}>{activeTeam?.team.home_place_name ?? '미설정'}</Text>
          </View>
          <PlaceSearchModal
            value={activeTeam?.team.home_place_name ? { name: activeTeam.team.home_place_name } : null}
            onSelect={(place: PlaceResult) =>
              updateHomeLocation({
                placeName: place.name,
                address: place.address,
                latitude: place.latitude,
                longitude: place.longitude,
              })
            }
          />
          <Text style={styles.hint}>경기 없는 날의 예상 날씨를 이 위치 기준으로 보여줘요</Text>
        </View>


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

        {loadError ? (
          // 저장 버튼을 아예 치운다. 이 상태의 폼은 DB가 아니라 기본값을 보여주고 있어서,
          // 누르는 순간 멀쩡한 값이 지워진다.
          <View style={styles.loadErr}>
            <Text style={styles.loadErrTitle}>설정을 불러오지 못했어요</Text>
            <Text style={styles.loadErrBody} selectable>{loadError}</Text>
            <Text style={styles.loadErrBody}>지금 저장하면 저장돼 있던 값이 지워질 수 있어 저장을 잠갔어요.</Text>
            <Pressable onPress={load} style={styles.retryBtn} accessibilityRole="button">
              <Text style={styles.retryText}>다시 시도</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {saveError && <Text style={styles.saveErr} selectable>{saveError}</Text>}
            <Pressable onPress={handleSave} disabled={saving} style={[styles.saveBtn, saving && { opacity: 0.6 }]}>
              <Text style={styles.saveBtnText}>{saving ? '저장 중…' : saved ? '저장됐어요' : '저장'}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </ScreenGradient>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 12 },
  headerTitle: { color: colors.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  scroll: { padding: 20, paddingBottom: 60, gap: 14 },

  loadErr: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.danger,
    padding: 16,
    gap: 8,
  },
  loadErrTitle: { color: colors.danger, ...font.section },
  loadErrBody: { color: colors.textDim, fontSize: 12, fontWeight: '600', lineHeight: 18 },
  retryBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
  },
  retryText: { color: colors.text, fontSize: 12, fontWeight: '800' },
  saveErr: { color: colors.danger, fontSize: 12, fontWeight: '700', textAlign: 'center' },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 9,
  },
  cardHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  cardTitle: { color: colors.text, ...font.section },
  cardSub: { color: colors.green, fontSize: 11, fontWeight: '700' },
  label: { color: colors.textDim, fontSize: 11, fontWeight: '700', marginTop: 4 },
  hint: { color: colors.textFaint, fontSize: 11, fontWeight: '600', lineHeight: 17, marginTop: 2 },

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
  chipSoft: { backgroundColor: 'rgba(34,197,94,0.12)', borderColor: colors.greenDeep },
  chipText: { color: colors.textMuted, fontSize: 12, fontWeight: '800' },
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
    fontSize: 13,
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
  segItemOn: { backgroundColor: 'rgba(34,197,94,0.10)', borderWidth: 1, borderColor: colors.greenDeep },
  segText: { color: '#7C8A85', fontSize: 12, fontWeight: '800' },

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
  avatarText: { color: '#8FA69C', fontSize: 10, fontWeight: '800' },
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
  lvBtnText: { color: colors.textDim, fontSize: 11, fontWeight: '800' },

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
