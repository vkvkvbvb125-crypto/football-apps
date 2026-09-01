// src/features/team/screens/TeamSettingsScreen.tsx — 신규
// 팀 프로필 / 정기모임 기본값 / 회비 / 실력 레벨 / 게스트.
// 실력 레벨은 누르는 즉시 저장되고(팀 분배에 바로 반영), 나머지 필드는 "저장" 버튼으로
// team_settings 테이블에 upsert된다. 원본 핸드오프엔 "팀 삭제" 위험 구역이 있었는데
// 실제로는 navigation.goBack()만 하고 아무것도 지우지 않는 가짜 버튼이었다 — 팀 삭제를
// 되돌릴 수 없게 실제로 처리하려면 별도 RPC/cascade 설계가 필요해서 여기선 뺐다.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../../../components/nativeText';
import { ScreenGradient } from '../../../components/ScreenGradient';
import { font, radius, type Palette } from '../../../theme';
import { useThemed } from '../../../lib/useThemed';
import { useTeamStore } from '../stores/teamStore';
import { PlaceSearchModal } from '../../attendance/components/PlaceSearchModal';
import { RegionPickerModal } from '../components/RegionPickerModal';
import * as Clipboard from 'expo-clipboard';
import { regionLabelOf } from '../regions';
import { WEEKDAYS } from '../weekdays';
import { recentAvgHeadcount } from '../../attendance/utils/attendanceRate';
import { useAttendanceStore } from '../../attendance/stores/attendanceStore';
import type { PlaceResult } from '../../attendance/services/placeService';
import { fetchMemberProfiles, updateSkillLevel, SKILL_LABEL, type MemberProfile } from '../services/memberProfileService';
import { fetchTeamSettings, upsertTeamSettings, diffSettings, hhmm } from '../services/teamSettingsService';
import { alertMessage, confirmAction } from '../../../components/Dialog';
import { useSettlementStore } from '../../settlement/stores/settlementStore';
import { myUnpaidAmount } from '../../settlement/utils/unpaid';
import type { TeamSettings } from '../services/teamSettingsService';
import { toUserMessage } from '../../../lib/dbError';
import type { FeeMode, SkillLevel } from '../../../types/database';

const TIMES = ['19:00', '20:00', '21:00'];
const SKILL_OPTIONS = [
  ['beginner', '입문'],
  ['intermediate', '중급'],
  ['advanced', '상급'],
] as const;

export function TeamSettingsScreen({ navigation }: any) {
  const { colors, styles } = useThemed(makeStyles);
  const activeTeam = useTeamStore((s) => s.activeTeam);
  const leaveTeam = useTeamStore((s) => s.leaveTeam);
  const settlementCurrent = useSettlementStore((st) => st.current);
  const settlementPast = useSettlementStore((st) => st.past);

  /*
   * 팀 나가기 — 팀 홈에서 옮겨 왔다.
   *
   * 미납이 있으면 확인 문구에 같이 적는다. 나가면 team_members 행이 지워지고
   * settlement_shares가 cascade로 따라가서, 안 낸 돈의 기록이 조용히 사라진다.
   * 총무는 누가 얼마를 안 냈는지 알 방법이 없어진다 — 막지는 않되 말은 해준다.
   *
   * 마지막 총무 가드는 여기서 다시 쓰지 않는다. teamStore.leaveTeam()이 던지고,
   * 그 문구를 그대로 보여준다 — 조건을 두 곳에 두면 언젠가 갈린다.
   */
  const handleLeaveTeam = () => {
    if (!activeTeam) return;
    const unpaid = myUnpaidAmount(settlementCurrent, settlementPast, activeTeam.membershipId);
    const warn = unpaid > 0 ? `

아직 내지 않은 회비 ${unpaid.toLocaleString()}원이 있어요. 나가면 그 기록도 함께 사라져요.` : '';
    confirmAction({
      title: '팀 나가기',
      message: `${activeTeam.team.name}에서 나갈까요?${warn}`,
      confirmLabel: '나가기',
      destructive: true,
    }).then((ok) => {
      if (!ok) return;
      leaveTeam().catch((err) => {
        /* 「마지막 총무는…」은 UserFacingError라 그대로, RLS·FK 원문은 덮인다 */
        alertMessage('나갈 수 없어요', toUserMessage(err, {}, 'leaveTeam'));
      });
    });
  };
  const updateHomeLocation = useTeamStore((s) => s.updateHomeLocation);
  const updateTeamProfile = useTeamStore((s) => s.updateTeamProfile);
  const matches = useAttendanceStore((s) => s.matches);
  const teamId = activeTeam?.team.id;

  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [headcount, setHeadcount] = useState('');
  const [profileError, setProfileError] = useState(false);
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

    const saved = useTeamStore.getState().activeTeam?.team.avg_headcount;
    setHeadcount(saved != null ? String(saved) : '');

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

  /*
    읽기 전용 값은 편집 폼과 **같은 상태**에서 나온다.

    load()가 isAdmin 밖에 있어 팀원에게도 폼 상태가 채워진다. 그래서 baseRef(서버 원본)를
    따로 읽지 않는다 — 그러면 편집과 읽기가 다른 식에서 나오고, 한쪽만 고치는 날 두 화면이
    다른 값을 말한다. baseRef는 ref라 바뀌어도 다시 그려지지도 않는다.
    팀원은 편집하지 않으므로 폼 값 = 서버 값이다.

    빈 값은 「0원」이 아니라 「아직 정하지 않았어요」다. 폼이 「정하지 않음」을 빈 문자열로,
    「0」을 '0'으로 들고 있어서 둘이 갈린다(load에서 defaultFee != null ? String(...) : '').
  */
  const NOT_SET = '아직 정하지 않았어요';
  const won = (v: string) => (v === '' ? NOT_SET : `${Number(v).toLocaleString()}원`);
  const [copiedAccount, setCopiedAccount] = useState(false);
  const hasAccount = !!bank || !!accountNo || !!holder;
  const copyAccount = async () => {
    /* 은행명을 같이 넣는다 — 번호만 복사하면 붙여넣는 쪽에서 어느 은행인지 모른다.
       SendMoneySheet가 이미 그렇게 한다. 여기서 다르게 하면 같은 값을 두 화면이 다르게 다룬다 */
    await Clipboard.setStringAsync(`${bank} ${accountNo}`.trim());
    setCopiedAccount(true);
    setTimeout(() => setCopiedAccount(false), 1500);
  };

  const team = activeTeam?.team;
  /**
   * 이 화면의 카드들은 전부 총무가 고치는 값이다. 팀원에게 그대로 보여주면 RLS가 거절할
   * 폼을 채우게 만든다 — 「저장」을 눌러야 안 되는 걸 아는 화면이 된다.
   *
   * 그래도 팀원이 이 화면에 와야 한다. 맨 아래 「팀 나가기」가 여기 말고는 없다.
   */
  const isAdmin = activeTeam?.role === 'admin';
  const profileFilled = !!(team?.region_code && team?.avg_headcount && team?.skill_level);

  // 자동 계산값은 placeholder로만 보여준다 — 총무가 안 건드린 값이 DB에 들어가면
  // 나중에 사람이 넣은 값인지 앱이 넣은 값인지 구분할 방법이 없다.
  // 「12」만 뜨면 이미 저장된 값처럼 보이므로 출처를 같이 적는다.
  const autoHeadcount = recentAvgHeadcount(
    matches.map((m) => ({
      matchDate: m.match_date,
      attendCount: m.votes.filter((v) => v.status === 'attend').length,
    }))
  );
  const headcountHint = autoHeadcount == null ? '평균 인원' : `${autoHeadcount} (최근 경기 평균)`;

  /** 즉시 저장이라 저장 버튼이 없다 — 실패를 알릴 자리가 여기밖에 없다 */
  const saveProfile = async (input: Parameters<typeof updateTeamProfile>[0]) => {
    setProfileError(!(await updateTeamProfile(input)));
  };

  const saveHeadcount = () => {
    const next = headcount.trim() === '' ? null : Number(headcount);
    // CHECK 제약이 1~99다. 범위 밖이면 DB가 거절하니 보내기 전에 되돌린다.
    if (next != null && (!Number.isFinite(next) || next < 1 || next > 99)) {
      setHeadcount(team?.avg_headcount != null ? String(team.avg_headcount) : '');
      return;
    }
    if (next === (team?.avg_headcount ?? null)) return;
    saveProfile({ avgHeadcount: next });
  };

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
        {isAdmin && (
          <>
        {/* 정기모임 */}
        {/*
          팀 대표 지역 — 팀 화면 설정 탭에서 옮겨 왔다.

          「경기 없는 날의 예상 날씨를 이 좌표로 조회한다」고 적혀 있었는데 **그 조회가
          없다.** 날씨를 부르는 곳은 경기 좌표를 쓰는 셋뿐이고(AttendanceScreen ·
          HomeScreen · WeatherBadge) 이 좌표를 읽는 코드는 0건이었다. 만들려다 만
          기능의 전제가 주석에 남아, 값이 쓰이는 것처럼 보이게 하고 있었다.

          지금 이 값이 하는 일은 이름 하나를 팀 화면에 적는 것이다(히어로의
          「구장 · 풋살」 줄). 주소·좌표는 저장을 멈췄다 — 카카오 응답이고 쓰는 데가 없다.

          활동 지역(region_code)과는 다른 값이다 — 저쪽은 매칭에서 구/군 단위로 거르는
          코드고 이쪽은 사람이 읽는 구장 이름이다. 둘 다 필요해서 통합하지 않는다.
        */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>팀 대표 지역</Text>
            <Text style={styles.cardSub}>{activeTeam?.team.home_place_name ?? '미설정'}</Text>
          </View>
          <PlaceSearchModal
            value={activeTeam?.team.home_place_name ? { name: activeTeam.team.home_place_name } : null}
            onSelect={(place: PlaceResult) => updateHomeLocation({ placeName: place.name })}
          />
          {/*
            힌트를 고쳤다. 「경기 없는 날의 예상 날씨를 이 위치 기준으로 보여줘요」였는데
            **그 기능이 없다.** 날씨를 부르는 곳은 경기 좌표를 쓰는 셋뿐이고
            (AttendanceScreen · HomeScreen · WeatherBadge), 팀 대표 지역 좌표를 읽는
            코드는 0건이었다. 화면이 없는 기능을 약속하고 있었다.

            좌표 저장도 멈췄다 — 쓰는 데가 없는데 카카오 응답을 저장만 하고 있었다.
            그래서 지금 이 값이 하는 일은 이름 하나를 팀 화면에 적는 것이다.
          */}
          <Text style={styles.hint}>팀 화면에 이 이름이 보여요</Text>
        </View>


        {/*
          팀 프로필 — 활동 지역 · 평균 인원 · 실력.

          아래 「정기모임」 카드와 달리 저장 버튼이 없다. 셋 다 고르는 입력이고,
          저장 버튼 쪽 diff에 필드를 더 얹으면 그만큼 덮어쓸 표면이 늘어난다.

          정기 요일·시간은 여기 없다 — 바로 아래 카드가 이미 그것이다.
        */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>팀 프로필</Text>
            <Text style={styles.cardSub}>{profileFilled ? '작성됨' : '미작성'}</Text>
          </View>

          <Text style={styles.label}>활동 지역</Text>
          <RegionPickerModal
            value={team?.region_code ?? null}
            onSelect={(code) => saveProfile({ regionCode: code, regionLabel: regionLabelOf(code) })}
          />

          <Text style={styles.label}>평균 인원</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={headcount}
              onChangeText={setHeadcount}
              onBlur={saveHeadcount}
              onSubmitEditing={saveHeadcount}
              keyboardType="number-pad"
              placeholder={headcountHint}
              placeholderTextColor={colors.placeholder}
            />
            <Text style={styles.unit}>명</Text>
          </View>

          <Text style={styles.label}>실력</Text>
          <View style={styles.row}>
            {SKILL_OPTIONS.map(([value, text]) => {
              const on = team?.skill_level === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => saveProfile({ skillLevel: on ? null : value })}
                  style={[styles.chip, on && styles.chipSoft]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.chipText, on && { color: colors.green }]}>{text}</Text>
                </Pressable>
              );
            })}
          </View>
          {profileError && <Text style={styles.saveErr}>저장하지 못했어요. 잠시 후 다시 시도해주세요</Text>}
          <Text style={styles.hint}>나중에 팀 대 팀 매칭을 열 때 상대 팀이 보는 정보예요. 지금은 어디에도 공개되지 않아요.</Text>
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
                      i === 5 && !on && { color: colors.weekSat },
                      i === 6 && !on && { color: colors.weekSun },
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

        {/* 게스트 */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>게스트</Text>

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

          {/*
            「가입 승인 필요」 토글은 여기 있었다. 감춘 이유:

            join_approval_required를 읽는 곳이 이 화면뿐이다. 실제 가입은
            join_team_by_invite RPC가 하는데 security definer라 RLS를 우회하고
            설정을 조회하지도 않는다 — 켜도 초대 코드만 알면 즉시 멤버가 된다.
            즉 스위치가 「막고 있다」고 거짓말을 하고 있었다. 비활성 + 「준비 중」으로
            두는 것도 같은 문제다. 총무는 언제 켜지나 계속 기다리게 된다.

            ⚠ 승인을 안 쓰기로 한 게 아니다. 심사 화면이 없어서 감춘 것이다.
              되살리려면 화면보다 RLS가 먼저다 — is_team_member(team_id)가 정책
              곳곳에 쓰여서, 대기 상태인 사람이 거기서 true가 되면 승인 전에
              공지·정산·경기를 다 본다. 승인 기능이 정보 노출 구멍이 된다.
              그 전수 확인은 대시보드 SQL로 해야 한다(앱 경로는 RLS에 가려진다).

            컬럼과 approval 상태는 남겨둔다. 저장은 바뀐 칸만 보내므로 손대지
            않는 한 DB 값이 그대로 유지되고, 토글을 되살릴 때 이 파일만 고치면 된다.
          */}
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
          </>
        )}


        {/*
          팀원이 보는 것 — 읽기 전용.

          A에서 이 화면으로 오는 문을 팀원에게 열었는데 안이 「팀 나가기」 한 줄뿐이었다.
          문을 열어놓고 안을 안 채운 상태였다.

          다섯 카드를 보여주고 「실력 레벨」 하나만 뺀다. 그 카드는 상 3점 / 중 2점 / 하 1점
          배점표인데, 보여주면 자기 등급을 역산한다. 「본인이 자기 등급을 보면 팀 분위기가
          깨진다」는 판단이 이미 두 곳(TeamHomeTab의 가로 로스터, 멤버 행)에서 표시를 빼게
          했고, 여기가 세 번째 자리다. 빠뜨린 게 아니라 뺀 것이다.

          나머지 다섯은 팀원이 알아야 하는 값이다 — 어디서 모이나(지역), 언제 모이나(정기모임),
          얼마 내나(회비), 친구를 데려와도 되나(게스트), 우리 팀은 어떤 팀인가(프로필).
          RLS도 team_settings_select가 is_team_member라 다 읽힌다.

          편집 위젯을 안 쓴다. 읽기로 바꾸면 전부 Text 한 줄이 되어 공유할 껍데기가
          카드 스타일뿐이다 — 이 코드베이스에서 다섯 번째로 「공유 단위 0」이 나온 자리다.
        */}
        {!isAdmin && (
          <>
            {!!loadError && (
              /* 팀원에게는 「저장을 잠갔어요」를 안 띄운다 — 저장할 게 없다 */
              <View style={styles.loadErr}>
                <Text style={styles.loadErrTitle}>설정을 불러오지 못했어요</Text>
                <Text style={styles.loadErrBody} selectable>{loadError}</Text>
                <Pressable onPress={load} style={styles.retryBtn} accessibilityRole="button">
                  <Text style={styles.retryText}>다시 시도</Text>
                </Pressable>
              </View>
            )}

            <View style={styles.card}>
              <Text style={styles.cardTitle}>팀 대표 지역</Text>
              <Text style={styles.readValue}>{team?.home_place_name || NOT_SET}</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>팀 프로필</Text>
              <Text style={styles.label}>활동 지역</Text>
              <Text style={styles.readValue}>{team?.region_code ? regionLabelOf(team.region_code) : NOT_SET}</Text>
              <Text style={styles.label}>평균 인원</Text>
              <Text style={styles.readValue}>{headcount === '' ? NOT_SET : `${headcount}명`}</Text>
              <Text style={styles.label}>실력</Text>
              <Text style={styles.readValue}>
                {SKILL_OPTIONS.find(([v]) => v === team?.skill_level)?.[1] ?? NOT_SET}
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>정기모임</Text>
              <Text style={styles.readValue}>
                {selectedDays.length && time
                  ? `매주 ${selectedDays.map((d) => WEEKDAYS[Number(d)]).join('·')} ${time}`
                  : NOT_SET}
              </Text>
              <Text style={styles.label}>기본 정원</Text>
              <Text style={styles.readValue}>{capacity}명</Text>
              <Text style={styles.hint}>정원을 넘겨 참석하면 대기자로 넘어가요.</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>회비</Text>
              <Text style={styles.label}>{feeMode === 'per_match' ? '경기별 1인당' : '월 회비'}</Text>
              <Text style={styles.readValue}>{won(fee)}</Text>

              <Text style={styles.label}>입금 계좌</Text>
              {hasAccount ? (
                <Pressable onPress={copyAccount} style={styles.readAccount} accessibilityRole="button" accessibilityLabel="계좌 복사">
                  <View style={{ flex: 1, gap: 2 }}>
                    {/* 은행과 번호를 한 줄에 — SendMoneySheet의 「받는 곳」과 같은 모양이다 */}
                    <Text style={styles.readValue}>{`${bank} ${accountNo}`.trim()}</Text>
                    {!!holder && <Text style={styles.hint}>예금주 {holder}</Text>}
                  </View>
                  <Ionicons
                    name={copiedAccount ? 'checkmark' : 'copy-outline'}
                    size={16}
                    color={copiedAccount ? colors.green : colors.textDim}
                  />
                </Pressable>
              ) : (
                <Text style={styles.readValue}>{NOT_SET}</Text>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>게스트</Text>
              <Text style={styles.readValue}>{guestAllowed ? '초대할 수 있어요' : '초대할 수 없어요'}</Text>
              {guestAllowed && (
                <>
                  <Text style={styles.label}>게스트 회비</Text>
                  <Text style={styles.readValue}>{won(guestFee)}</Text>
                </>
              )}
            </View>
          </>
        )}

        {/*
          관리 — 되돌리기 어려운 동작이라 설정 맨 아래에 따로 둔다.
          팀원에게는 이 화면에서 유일하게 남는 것이기도 하다 — 위 카드들은 전부 총무 것이다.
          저장 버튼 아래, 구분선 뒤다. 위쪽 카드들과 붙여 놓으면 값을 고치다가 손이 미끄러진다.

          「팀 삭제하기」는 두지 않는다. role이 admin/member 둘뿐이라 팀장을 가릴 기준이
          없고(teams.created_by는 생성자가 탈퇴하면 null이 된다), 삭제를 만들면 D-4에서
          안 만들기로 한 cascade 설계가 되살아난다. 멤버가 0명이 되면 teams_select가
          is_team_member(id)라 그 팀은 아무에게도 안 보인다 — 지운 것과 같다.
        */}
        <View style={styles.dangerZone}>
          <Pressable
            onPress={handleLeaveTeam}
            accessibilityRole="button"
            accessibilityLabel="팀 나가기"
            style={({ pressed }) => [styles.leaveRow, pressed && styles.leavePressed]}
          >
            <Ionicons name="exit-outline" size={17} color={colors.danger} />
            <Text style={styles.leaveText}>팀 나가기</Text>
          </Pressable>
        </View>
      </ScrollView>
    </ScreenGradient>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
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
  segText: { color: colors.navIdle, fontSize: 12, fontWeight: '800' },

  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardRaised,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.textMuted, fontSize: 10, fontWeight: '800' },
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
  switch: { width: 44, height: 26, borderRadius: 13, backgroundColor: colors.borderSoft, padding: 3, justifyContent: 'center' },
  switchOn: { backgroundColor: colors.green },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.neutralFill },
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

  /* 읽기 전용 값 — 편집 폼의 input과 같은 자리에 오지만 입력이 아니다 */
  readValue: { color: colors.textStrong, fontSize: 14, fontWeight: '700' },
  readAccount: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dangerZone: { marginTop: 24, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.divider },
  leaveRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  leavePressed: { opacity: 0.6 },
  leaveText: { color: colors.danger, fontSize: 14, fontWeight: '700' },
  });
