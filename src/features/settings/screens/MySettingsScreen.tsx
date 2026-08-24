// src/features/settings/screens/MySettingsScreen.tsx — 내 설정
//
// 계정에 딸린 값만 둔다. 팀에 딸린 값(회비·정원·정기모임)은 팀 설정 화면 몫이다.
// 팀을 옮겨도 따라오는 것 = 여기, 지금 보는 팀에만 해당하는 것 = 저기.
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, TextInput } from '../../../components/nativeText';
import { ScreenGradient } from '../../../components/ScreenGradient';
import { alertMessage, confirmAction } from '../../../components/Dialog';
import { useAuthStore } from '../../auth/stores/authStore';
import { TERMS, type TermDoc } from '../../auth/terms';
import { TermsDocModal } from '../../auth/components/TermsDocModal';
import { useTeamStore } from '../../team/stores/teamStore';
import { updateDisplayName } from '../../team/services/memberProfileService';
import { POSITIONS, POSITION_INFO, toPosition } from '../../team/positions';
import { pickSquareImage, setAvatarUrl, updateProfileFields, uploadAvatar } from '../services/avatarService';
import { deleteAccount, describeBlockers, fetchDeletionStatus } from '../services/accountService';
import { colors, radius } from '../../../theme';
import type { SkillTag } from '../../../types/database';

const SKILLS: SkillTag[] = ['상', '중', '하'];

/** 주발 — 값은 DB check 제약과 같아야 한다 */
const FEET = [
  { value: 'left' as const, label: '왼발' },
  { value: 'right' as const, label: '오른발' },
  { value: 'both' as const, label: '양발' },
];

export function MySettingsScreen({ navigation }: any) {
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);

  const activeTeam = useTeamStore((s) => s.activeTeam);
  const members = useTeamStore((s) => s.members);
  const loadMembers = useTeamStore((s) => s.loadMembers);
  const updateMemberPosition = useTeamStore((s) => s.updateMemberPosition);
  const updateMemberSkillTag = useTeamStore((s) => s.updateMemberSkillTag);
  const updateMemberJersey = useTeamStore((s) => s.updateMemberJersey);
  const updateNotifyPref = useTeamStore((s) => s.updateNotifyPref);

  const me = members.find((m) => m.id === activeTeam?.membershipId) ?? null;

  const [jersey, setJersey] = useState('');
  const [openDoc, setOpenDoc] = useState<TermDoc | null>(null);
  const [phone, setPhone] = useState('');
  const [uploading, setUploading] = useState(false);
  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [savedName, setSavedName] = useState(false);

  // 서버에서 이름이 늦게 오면 빈 칸이 남는다 — 도착하면 한 번 채운다
  useEffect(() => {
    if (me && !name) setName(me.displayName);
  }, [me?.displayName]);

  useEffect(() => {
    setJersey(String(me?.jerseyNumber ?? ''));
  }, [me?.jerseyNumber]);

  useEffect(() => {
    setPhone(me?.phone ?? '');
  }, [me?.phone]);

  const handleSaveName = async () => {
    const trimmed = name.trim();
    if (!session || !trimmed || trimmed === me?.displayName) return;
    setSavingName(true);
    try {
      await updateDisplayName(session.user.id, trimmed);
      await loadMembers();
      setSavedName(true);
      setTimeout(() => setSavedName(false), 1500);
    } catch {
      alertFail('이름을 바꾸지 못했어요');
    } finally {
      setSavingName(false);
    }
  };

  const alertFail = (msg: string) => alertMessage('저장 실패', msg);

  /** 연락처·주발은 값이 하나뿐이라 저장 즉시 반영한다 */
  const saveProfile = async (fields: { phone?: string | null; dominantFoot?: 'left' | 'right' | 'both' | null }) => {
    if (!session) return;
    try {
      await updateProfileFields(session.user.id, fields);
      await loadMembers();
    } catch {
      alertFail('저장하지 못했어요');
    }
  };

  const handlePickPhoto = async () => {
    if (!session) return;
    try {
      const asset = await pickSquareImage();
      if (!asset) return;
      setUploading(true);
      const url = await uploadAvatar(session.user.id, asset.uri);
      await setAvatarUrl(session.user.id, url);
      await loadMembers();
    } catch (err) {
      alertFail(err instanceof Error ? err.message : '사진을 올리지 못했어요');
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (!session) return;
    try {
      // 스토리지 파일은 남겨둔다 — 지우는 순간 이미 캐시된 화면에서 깨진 이미지가 뜬다.
      // 프로필에서 연결만 끊으면 화면상으로는 사라진다.
      await setAvatarUrl(session.user.id, null);
      await loadMembers();
    } catch {
      alertFail('사진을 지우지 못했어요');
    }
  };

  const handleSaveJersey = async () => {
    if (!me) return;
    try {
      await updateMemberJersey(me.id, jersey === '' ? null : Number(jersey));
    } catch {
      // 스토어가 사유를 담아둔다 — 중복이면 "이미 쓰고 있는 등번호예요"
      alertFail(useTeamStore.getState().error ?? '등번호를 바꾸지 못했어요');
      setJersey(String(me.jerseyNumber ?? ''));
    }
  };

  const [deleting, setDeleting] = useState(false);

  /**
   * 탈퇴. 판정은 서버가 하고 여기서는 물어보기만 한다 —
   * 화면이 따로 계산하면 화면은 된다고 하고 서버는 거절하는 상태가 생긴다.
   */
  const confirmDeleteAccount = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const status = await fetchDeletionStatus();

      if (!status.can_delete) {
        const { message, handoverTeam } = describeBlockers(status);
        // 총무를 넘겨야 하는 경우에만 갈 곳이 있다. 미납은 본인이 송금하면 끝나서
        // 보낼 화면이 따로 없다.
        if (handoverTeam) {
          const go = await confirmAction({
            title: '아직 탈퇴할 수 없어요',
            message,
            confirmLabel: '총무 넘기러 가기',
          });
          if (go) navigation.navigate('Main', { screen: 'Team', params: { tab: 'members' } });
        } else {
          alertMessage('아직 탈퇴할 수 없어요', message);
        }
        return;
      }

      const ok = await confirmAction({
        title: '정말 탈퇴할까요?',
        message:
          '계정과 프로필, 참석 기록이 지워지고 되돌릴 수 없어요.\n\n' +
          '내가 만든 경기와 공지는 팀에 남습니다 — 팀의 기록이라 지우면 남은 멤버들의 과거가 같이 사라져요.',
        confirmLabel: '탈퇴하기',
        destructive: true,
      });
      if (!ok) return;

      await deleteAccount();
      // 계정이 없어졌으니 세션도 버린다. 안 하면 죽은 토큰으로 화면이 계속 돈다.
      signOut();
    } catch (e: any) {
      alertMessage('탈퇴하지 못했어요', e?.message ?? '잠시 후 다시 시도해 주세요');
    } finally {
      setDeleting(false);
    }
  };

  const confirmSignOut = async () => {
    const ok = await confirmAction({
      title: '로그아웃',
      message: '로그아웃할까요?',
      confirmLabel: '로그아웃',
      destructive: true,
    });
    if (ok) signOut();
  };

  return (
    <ScreenGradient>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.textStrong} />
        </Pressable>
        <Text style={styles.headerTitle}>설정</Text>
        <View style={{ width: 24 }} />
      </View>


      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>프로필</Text>

          {/* 사진 — 누르면 갤러리에서 정사각으로 잘라 올린다.
              경로가 `{userId}/…`라 스토리지 정책이 남의 사진 덮어쓰기를 막는다. */}
          <View style={styles.photoRow}>
            <Pressable onPress={handlePickPhoto} disabled={uploading}>
              {me?.avatarUrl ? (
                <Image source={{ uri: me.avatarUrl }} style={styles.photo} />
              ) : (
                <View style={[styles.photo, styles.photoEmpty]}>
                  <Ionicons name="person" size={26} color={colors.textFaint} />
                </View>
              )}
            </Pressable>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={styles.hint}>{uploading ? '올리는 중…' : '사진을 눌러서 변경'}</Text>
              {!!me?.avatarUrl && (
                <Pressable onPress={handleRemovePhoto} hitSlop={6}>
                  <Text style={styles.removePhoto}>사진 삭제</Text>
                </Pressable>
              )}
            </View>
          </View>

          <Text style={styles.label}>이름</Text>
          <View style={styles.nameRow}>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="이름"
              placeholderTextColor={colors.textFaint}
              maxLength={20}
            />
            <Pressable
              disabled={savingName || !name.trim() || name.trim() === me?.displayName}
              onPress={handleSaveName}
              style={({ pressed }) => [
                styles.saveBtn,
                (savingName || !name.trim() || name.trim() === me?.displayName) && styles.saveBtnOff,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.saveBtnText}>{savedName ? '저장됨' : '저장'}</Text>
            </Pressable>
          </View>
          <Text style={styles.hint}>팀원 모두에게 이 이름으로 보여요</Text>

          <Text style={[styles.label, { marginTop: 14 }]}>연락처</Text>
          <View style={styles.nameRow}>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={(t) => setPhone(t.replace(/[^0-9-]/g, ''))}
              keyboardType="phone-pad"
              placeholder="010-0000-0000"
              placeholderTextColor={colors.textFaint}
              maxLength={13}
            />
            <Pressable
              disabled={phone === (me?.phone ?? '')}
              onPress={() => saveProfile({ phone: phone || null })}
              style={({ pressed }) => [
                styles.saveBtn,
                phone === (me?.phone ?? '') && styles.saveBtnOff,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.saveBtnText}>저장</Text>
            </Pressable>
          </View>
          <Text style={styles.hint}>총무가 급할 때 연락할 수 있어요. 비워둬도 됩니다</Text>
        </View>

        {/* 포지션·실력은 팀 안에서의 값이라 팀에 들어와 있을 때만 뜬다 */}
        {!!me && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>플레이 스타일</Text>

            <Text style={styles.label}>주발</Text>
            <View style={styles.chipRow}>
              {FEET.map((f) => {
                const on = me.dominantFoot === f.value;
                return (
                  <Pressable
                    key={f.value}
                    onPress={() => saveProfile({ dominantFoot: on ? null : f.value })}
                    style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{f.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* 등번호 — 팀 안에서 유일해야 한다. 겹치면 DB가 막고 그 사유를 그대로 보여준다 */}
            <Text style={[styles.label, { marginTop: 14 }]}>등번호</Text>
            <View style={styles.nameRow}>
              <TextInput
                style={[styles.input, { flex: 0, width: 96 }]}
                value={jersey}
                onChangeText={(t) => setJersey(t.replace(/[^0-9]/g, '').slice(0, 3))}
                keyboardType="number-pad"
                placeholder="미설정"
                placeholderTextColor={colors.textFaint}
              />
              <Pressable
                disabled={jersey === String(me.jerseyNumber ?? '')}
                onPress={handleSaveJersey}
                style={({ pressed }) => [
                  styles.saveBtn,
                  jersey === String(me.jerseyNumber ?? '') && styles.saveBtnOff,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.saveBtnText}>저장</Text>
              </Pressable>
            </View>
            <Text style={styles.hint}>0~999 사이 숫자 · 팀 안에서 중복 불가. 비우면 해제돼요</Text>

            <Text style={[styles.label, { marginTop: 14 }]}>주 포지션</Text>
            <View style={styles.chipRow}>
              {POSITIONS.map((p) => {
                const on = toPosition(me.position) === p;
                return (
                  <Pressable
                    key={p}
                    onPress={() => updateMemberPosition(me.id, on ? null : p)}
                    style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>
                      {POSITION_INFO[p].ko} · {POSITION_INFO[p].short}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.hint}>팀 분배와 포메이션이 이 값을 씁니다. 다시 누르면 해제돼요</Text>

            <Text style={[styles.label, { marginTop: 14 }]}>실력</Text>
            <View style={styles.chipRow}>
              {SKILLS.map((s) => {
                const on = me.skillTag === s;
                return (
                  <Pressable
                    key={s}
                    // 실력은 총무가 매기는 값이다 — 본인이 올리고 내리면 팀 분배 균형이 무너진다
                    disabled={activeTeam?.role !== 'admin'}
                    onPress={() => updateMemberSkillTag(me.id, on ? null : s)}
                    style={({ pressed }) => [
                      styles.chip,
                      on && styles.chipOn,
                      activeTeam?.role !== 'admin' && styles.chipLocked,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{s}</Text>
                  </Pressable>
                );
              })}
            </View>
            {activeTeam?.role !== 'admin' && <Text style={styles.hint}>실력은 총무가 정합니다</Text>}
          </View>
        )}

        {/*
          알림 설정 — 팀 화면에서 옮겨 왔다.

          team_members.notify_* 에 저장되는 개인 설정인데 팀 화면의 설정 탭에 있었고,
          그 탭 입구(4버튼 그리드)를 걷어내면서 도달 불가가 됐다. 알림을 끌 방법이
          아예 없는 상태였다. 계정에 딸린 값이라 자리는 여기가 맞다.
        */}
        {!!me && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>알림</Text>
            {(
              [
                { col: 'notify_new_match' as const, label: '새 일정 알림', on: me.notifyNewMatch },
                { col: 'notify_announcement' as const, label: '공지 알림', on: me.notifyAnnouncement },
                { col: 'notify_deadline' as const, label: '참석 마감 알림', on: me.notifyDeadline },
              ]
            ).map((row) => (
              <Pressable
                key={row.col}
                onPress={() => updateNotifyPref(me.id, row.col, !row.on)}
                accessibilityRole="switch"
                accessibilityState={{ checked: row.on }}
                style={({ pressed }) => [styles.toggleRow, pressed && { opacity: 0.85 }]}
              >
                <Text style={styles.toggleLabel}>{row.label}</Text>
                <View style={[styles.toggle, row.on && styles.toggleOn]}>
                  <View style={[styles.toggleKnob, row.on && styles.toggleKnobOn]} />
                </View>
              </Pressable>
            ))}
            <Text style={styles.notifyHint}>이 팀에서 오는 알림만 조절해요. 다른 팀은 따로 설정합니다</Text>
          </View>
        )}


        {/*
          약관·개인정보처리방침 — 가입할 때 한 번 보고 나면 앱 안에서 다시 볼
          방법이 없었다. 심사에서 요구하는 자리이기도 하다.

          웹(kickday.app/terms)으로 보내지 않는다 — 배포본이 앱 빌드보다 뒤처질 수
          있고 지하철에서 안 열린다. 본문이 terms.ts에 있으니 그대로 띄운다.
        */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>약관 및 정책</Text>
          {TERMS.map((t) => (
            <Pressable
              key={t.key}
              onPress={() => setOpenDoc(t)}
              accessibilityRole="button"
              accessibilityLabel={`${t.title} 전문 보기`}
              style={({ pressed }) => [styles.docRow, pressed && styles.pressed]}
            >
              {/* label이 아니라 title이다 — label은 가입 화면 체크박스의 문장("…에 동의")이라
                  이미 동의한 사람에게 보여주면 다시 동의하라는 말로 읽힌다. 모달 제목도 title이라
                  label을 쓰면 줄과 제목이 서로 다른 이름이 된다. */}
              <Text style={styles.docRowText}>{t.title}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
            </Pressable>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>계정</Text>
          <Text style={styles.accountEmail}>{session?.user.email ?? ''}</Text>
          <Pressable onPress={confirmSignOut} style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}>
            <Ionicons name="log-out-outline" size={16} color={colors.textMuted} />
            <Text style={styles.signOutText}>로그아웃</Text>
          </Pressable>
          {/*
            탈퇴는 앱 안에 있어야 한다 (App Store 5.1.1(v)). 「고객센터 문의」로는 안 된다.
            로그아웃 아래, 구분선 뒤에 둔다 — 둘 다 「나가기」로 보여서 붙여 놓으면 잘못 누른다.
          */}
          <View style={styles.dangerDivider} />
          <Pressable
            onPress={confirmDeleteAccount}
            disabled={deleting}
            accessibilityRole="button"
            accessibilityLabel="계정 삭제"
            style={({ pressed }) => [styles.signOut, pressed && styles.pressed, deleting && styles.pressed]}
          >
            <Ionicons name="trash-outline" size={16} color={colors.danger} />
            <Text style={[styles.signOutText, styles.deleteText]}>
              {deleting ? '확인 중…' : '계정 삭제'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
      <TermsDocModal doc={openDoc} onClose={() => setOpenDoc(null)} />
    </ScreenGradient>
  );
}

const styles = StyleSheet.create({
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  toggleLabel: { color: colors.textBody, fontSize: 14, fontWeight: '600' },
  toggle: {
    width: 42, height: 24, borderRadius: radius.pill, padding: 2,
    backgroundColor: colors.neutralFill, justifyContent: 'center',
  },
  toggleOn: { backgroundColor: colors.green },
  toggleKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.bgRoot },
  toggleKnobOn: { alignSelf: 'flex-end' },
  notifyHint: { color: colors.textMuted, fontSize: 11, fontWeight: '600', marginTop: 4 },
  dangerDivider: { height: 1, backgroundColor: colors.divider, marginVertical: 10 },
  deleteText: { color: colors.danger },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
  },
  docRowText: { color: colors.textBody, fontSize: 14, fontWeight: '600' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 12,
  },
  headerTitle: { color: colors.textStrong, fontSize: 17, fontWeight: '800' },
  pressed: { opacity: 0.8 },

  body: { padding: 20, paddingBottom: 60, gap: 14 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 8,
  },
  cardTitle: { color: colors.textStrong, fontSize: 14, fontWeight: '800', marginBottom: 4 },
  label: { color: colors.textDim, fontSize: 11, fontWeight: '700' },
  hint: { color: colors.textFaint, fontSize: 11, fontWeight: '600' },

  /** 프로필 사진 */
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 6 },
  photo: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.inputBg },
  photoEmpty: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  removePhoto: { color: colors.danger, fontSize: 11, fontWeight: '700' },

  nameRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    height: 46,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.inputBg,
    color: colors.text,
    fontSize: 14,
  },
  saveBtn: {
    height: 46,
    paddingHorizontal: 18,
    borderRadius: radius.button,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnOff: { opacity: 0.35 },
  saveBtnText: { color: colors.bgRoot, fontSize: 13, fontWeight: '800' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: colors.inputBg,
  },
  chipOn: { backgroundColor: colors.greenTint, borderColor: colors.greenDeep },
  chipLocked: { opacity: 0.5 },
  chipText: { color: colors.textDim, fontSize: 12, fontWeight: '700' },
  chipTextOn: { color: colors.green, fontWeight: '800' },

  accountEmail: { color: colors.textDim, fontSize: 12, fontWeight: '600' },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 46,
    marginTop: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  signOutText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
});
