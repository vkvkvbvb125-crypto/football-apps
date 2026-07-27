// src/features/settlement/screens/SettlementScreen.tsx — 리디자인 v3
// 20260727 마이그레이션의 settlements/settlement_shares 스키마 기반.
// store는 "진행 중인 정산 하나(current)"만 추적한다 — 한 번에 하나씩 정산하는
// 일반적인 사용 흐름에 맞춘 단순화이며, 여러 경기를 동시에 미정산 상태로 열어두면
// 가장 최근 것만 current로 보인다(나머지는 status='open'인 채로 DB엔 남아있음).
import { useEffect, useMemo, useState } from 'react';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../../../components/nativeText';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { ScreenGradient } from '../../../components/ScreenGradient';
import { EmptyState } from '../../../components/EmptyState';
import { TabHeader } from '../../../components/TabHeader';
import { colors, radius } from '../../../theme';
import { useTeamStore } from '../../team/stores/teamStore';
import { useAttendanceStore } from '../../attendance/stores/attendanceStore';
import { useSettlementStore } from '../stores/settlementStore';
import { fetchTeamSettings } from '../../team/services/teamSettingsService';
import { notifyTeam } from '../../notifications/services/pushService';
import { BankPicker } from '../components/BankPicker';
import { SendMoneySheet } from '../components/SendMoneySheet';
import { CreateSettlementSheet } from '../components/CreateSettlementSheet';
import { PendingSettlementCard, SettlementEmpty } from '../components/PendingSettlementCard';

interface AccountDraft {
  bankName: string;
  accountNo: string;
  accountHolder: string;
}

const EMPTY_ACCOUNT: AccountDraft = { bankName: '', accountNo: '', accountHolder: '' };

function initialOf(name: string) {
  return name.length > 2 ? name.slice(1) : name;
}

export function SettlementScreen({ navigation }: BottomTabScreenProps<any>) {
  const activeTeam = useTeamStore((s) => s.activeTeam);
  const members = useTeamStore((s) => s.members);
  const isAdmin = activeTeam?.role === 'admin';

  const matches = useAttendanceStore((s) => s.matches);
  const loadMatches = useAttendanceStore((s) => s.loadMatches);

  const pendingMatches = useSettlementStore((s) => s.pendingMatches);
  const current = useSettlementStore((s) => s.current);
  const past = useSettlementStore((s) => s.past);
  const loaded = useSettlementStore((s) => s.loaded);
  const loading = useSettlementStore((s) => s.loading);
  const error = useSettlementStore((s) => s.error);
  const load = useSettlementStore((s) => s.load);
  const createSettlement = useSettlementStore((s) => s.create);
  const skipSettlement = useSettlementStore((s) => s.skip);
  const markPaid = useSettlementStore((s) => s.markPaid);
  const confirmPaid = useSettlementStore((s) => s.confirmPaid);
  const completeSettlement = useSettlementStore((s) => s.complete);

  const [defaultAccount, setDefaultAccount] = useState<AccountDraft | null>(null);
  const [accountDraft, setAccountDraft] = useState<AccountDraft>(EMPTY_ACCOUNT);
  const [copied, setCopied] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [createSheetMatchId, setCreateSheetMatchId] = useState<string | null>(null);
  const [onlyUnpaid, setOnlyUnpaid] = useState(false);
  const [selectedShareIds, setSelectedShareIds] = useState<Record<string, boolean>>({});
  const [reminded, setReminded] = useState(false);

  useEffect(() => {
    if (!activeTeam) return;
    (async () => {
      await loadMatches();
      await load(activeTeam.team.id, activeTeam.membershipId);
      try {
        const settings = await fetchTeamSettings(activeTeam.team.id);
        if (settings?.bankName && settings.accountNo && settings.accountHolder) {
          setDefaultAccount({
            bankName: settings.bankName,
            accountNo: settings.accountNo,
            accountHolder: settings.accountHolder,
          });
        }
      } catch {
        // 팀 설정을 아직 안 만들었으면 그냥 무시 (계좌 직접 입력으로 폴백)
      }
    })();
  }, [activeTeam?.team.id]);

  // 팀 설정에 계좌가 없으면 가장 최근 정산(진행중이든 완료든)의 계좌를 대신 제안한다
  const latestAccount = useMemo<AccountDraft | null>(() => {
    if (defaultAccount) return defaultAccount;
    const latest = current ?? past[0];
    if (!latest?.bankName || !latest.accountNo || !latest.accountHolder) return null;
    return { bankName: latest.bankName, accountNo: latest.accountNo, accountHolder: latest.accountHolder };
  }, [defaultAccount, current, past]);

  const nameFor = (teamMemberId: string | null) => members.find((m) => m.id === teamMemberId)?.displayName ?? '멤버';
  const isAccountComplete = (a: AccountDraft) => !!a.bankName.trim() && !!a.accountNo.trim() && !!a.accountHolder.trim();

  const copyAccount = async (accountNo: string) => {
    await Clipboard.setStringAsync(accountNo);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const toggleSelectShare = (shareId: string) => setSelectedShareIds((prev) => ({ ...prev, [shareId]: !prev[shareId] }));

  const confirmSelected = async () => {
    const ids = Object.keys(selectedShareIds).filter((id) => selectedShareIds[id]);
    if (ids.length === 0) return;
    setSelectedShareIds({});
    await confirmPaid(ids);
  };

  const remindUnpaid = () => {
    if (!current || !activeTeam) return;
    const unpaidUserIds = current.shares
      .filter((s) => !s.paid && s.teamMemberId)
      .map((s) => members.find((m) => m.id === s.teamMemberId)?.userId)
      .filter((id): id is string => !!id);
    if (unpaidUserIds.length === 0) return;
    notifyTeam(activeTeam.team.id, `${activeTeam.team.name} 회비 독촉`, '아직 회비를 입금하지 않으셨어요', undefined, unpaidUserIds).catch(
      () => {}
    );
    setReminded(true);
    setTimeout(() => setReminded(false), 2000);
  };

  const handleSkip = (matchId: string) => {
    const message = '이 경기는 회비를 걷지 않고 종료할까요? 나중에 다시 정산 만들기로 되돌릴 수 없어요.';
    const doSkip = () => skipSettlement(matchId);
    if (Platform.OS === 'web') {
      if (window.confirm(message)) doSkip();
      return;
    }
    Alert.alert('정산 없이 종료', message, [
      { text: '취소', style: 'cancel' },
      { text: '종료하기', style: 'destructive', onPress: doSkip },
    ]);
  };

  const createSheetMatch = useMemo(
    () => (createSheetMatchId ? matches.find((m) => m.id === createSheetMatchId) ?? null : null),
    [createSheetMatchId, matches]
  );

  const hasAnySettlement = !!current || past.length > 0 || pendingMatches.length > 0;

  if (!activeTeam) {
    return (
      <ScreenGradient>
        <TabHeader title="정산" />
        <EmptyState
          emoji="💰"
          title="팀에 가입하면 정산이 표시돼요"
          subtitle="먼저 팀을 만들거나 가입해보세요"
          actionLabel="팀 만들기 / 가입"
          onAction={() => navigation.navigate('Team')}
        />
      </ScreenGradient>
    );
  }

  const paidCount = current ? current.shares.filter((s) => s.paid).length : 0;
  const unpaidShares = current ? current.shares.filter((s) => !s.paid) : [];
  const collected = current ? current.shares.filter((s) => s.paid).reduce((t, s) => t + s.amount, 0) : 0;
  const myShare = current?.shares.find((s) => s.isMe);
  const visibleShares = current ? (isAdmin && onlyUnpaid ? unpaidShares : current.shares) : [];
  const selectedIds = unpaidShares.map((s) => s.id).filter((id) => selectedShareIds[id]);
  const allPaid = !!current && current.shares.length > 0 && paidCount === current.shares.length;

  return (
    <ScreenGradient>
      <TabHeader title="정산" />

      {loading && !loaded ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.green} />
      ) : !hasAnySettlement ? (
        <SettlementEmpty isAdmin={!!isAdmin} />
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {!!error && <Text style={styles.errorText}>{error}</Text>}

          {pendingMatches.map((m) => (
            <View key={m.matchId} style={{ gap: 10 }}>
              <PendingSettlementCard
                matchLabel={m.label}
                attendeeCount={m.attendCount}
                daysSince={m.daysSince}
                isAdmin={!!isAdmin}
                onCreate={() => setCreateSheetMatchId(m.matchId)}
                onSkip={isAdmin ? () => handleSkip(m.matchId) : undefined}
              />
            </View>
          ))}

          {current && (
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {current.memo || '이번 정산'}
                  </Text>
                  <Text style={styles.cardSub}>
                    참석 {current.shares.length}명 · 1인당 {current.perPerson.toLocaleString()}원
                  </Text>
                </View>
                <View style={[styles.statusChip, allPaid ? styles.statusDone : styles.statusOngoing]}>
                  <Text style={[styles.statusText, { color: allPaid ? colors.green : colors.gold }]}>
                    {allPaid ? '완료 대기' : '진행중'}
                  </Text>
                </View>
              </View>

              {!isAdmin && myShare && (
                <View style={styles.myDue}>
                  <Text style={styles.myDueLabel}>{myShare.paid ? '입금 완료' : '내가 낼 금액'}</Text>
                  <View style={styles.myDueRow}>
                    <Text style={[styles.myDueAmount, myShare.paid && styles.myDuePaid]}>
                      {myShare.amount.toLocaleString()}
                    </Text>
                    <Text style={styles.myDueUnit}>원</Text>
                  </View>

                  {!myShare.paid && (
                    <Pressable onPress={() => setSendOpen(true)} style={({ pressed }) => [styles.sendBtn, pressed && styles.pressed]}>
                      <Ionicons name="arrow-forward" size={16} color={colors.bgRoot} />
                      <Text style={styles.sendText}>송금하기</Text>
                    </Pressable>
                  )}

                  <Pressable
                    onPress={() => markPaid(myShare.id, !myShare.markedPaid)}
                    style={({ pressed }) => [styles.paidBtn, myShare.markedPaid && styles.paidBtnDone, pressed && styles.pressed]}
                  >
                    <Text style={[styles.paidText, myShare.markedPaid && { color: colors.green }]}>
                      {myShare.markedPaid ? '입금했어요 · 총무 확인 대기' : '입금했어요'}
                    </Text>
                  </Pressable>
                </View>
              )}

              <Pressable
                onPress={() => current.accountNo && copyAccount(current.accountNo)}
                style={({ pressed }) => [styles.accountBox, pressed && styles.pressed]}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.accountLabel}>입금 계좌</Text>
                  <Text style={styles.accountText}>
                    {current.bankName} {current.accountNo}
                  </Text>
                  <Text style={styles.accountHolder}>예금주 {current.accountHolder}</Text>
                </View>
                <View style={[styles.copyBtn, copied && styles.copyBtnDone]}>
                  <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={13} color={copied ? colors.green : colors.bgRoot} />
                  <Text style={[styles.copyText, copied && { color: colors.green }]}>{copied ? '복사됨' : '복사'}</Text>
                </View>
              </Pressable>

              <View style={{ gap: 8 }}>
                <View style={styles.progressRow}>
                  <View style={styles.progressAmountRow}>
                    <Text style={styles.progressAmount}>{collected.toLocaleString()}</Text>
                    <Text style={styles.progressTotal}>/ {current.totalAmount.toLocaleString()}원</Text>
                  </View>
                  <Text style={styles.progressCount}>
                    {paidCount}/{current.shares.length}명 입금
                  </Text>
                </View>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${current.shares.length ? Math.round((paidCount / current.shares.length) * 100) : 0}%` }]} />
                </View>
              </View>

              {isAdmin && (
                <View style={styles.filterRow}>
                  <Pressable
                    onPress={() => setOnlyUnpaid((v) => !v)}
                    style={({ pressed }) => [styles.filterChip, onlyUnpaid && styles.filterChipOn, pressed && styles.pressed]}
                  >
                    <Text style={[styles.filterText, onlyUnpaid && { color: colors.green }]}>미입금만 {unpaidShares.length}</Text>
                  </Pressable>
                  {selectedIds.length > 0 && (
                    <Pressable onPress={confirmSelected} style={({ pressed }) => [styles.bulkBtn, pressed && styles.pressed]}>
                      <Text style={styles.bulkText}>{selectedIds.length}명 입금 확인</Text>
                    </Pressable>
                  )}
                </View>
              )}

              <View style={styles.payments}>
                {visibleShares.map((s) => {
                  const canToggle = isAdmin || s.isMe;
                  const isSelected = !!selectedShareIds[s.id];
                  const handlePress = () => {
                    if (!canToggle) return;
                    if (s.isMe) markPaid(s.id, !s.markedPaid);
                    else if (isAdmin && !s.paid) toggleSelectShare(s.id);
                  };
                  const label = s.guestName ?? nameFor(s.teamMemberId);
                  return (
                    <Pressable
                      key={s.id}
                      disabled={!canToggle}
                      onPress={handlePress}
                      style={({ pressed }) => [styles.paymentRow, pressed && canToggle && styles.pressed]}
                    >
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{initialOf(label)}</Text>
                      </View>
                      <Text style={styles.paymentName} numberOfLines={1}>
                        {label}
                        {s.isMe ? ' (나)' : ''}
                      </Text>
                      <Text style={styles.paymentAmount}>{s.amount.toLocaleString()}원</Text>
                      <View style={[styles.check, s.paid ? styles.checkOn : isSelected ? styles.checkSelected : null]}>
                        {s.paid && <Ionicons name="checkmark" size={13} color={colors.bgRoot} />}
                        {!s.paid && isSelected && <Ionicons name="checkmark" size={13} color={colors.green} />}
                      </View>
                    </Pressable>
                  );
                })}
              </View>

              {isAdmin &&
                (allPaid ? (
                  <Pressable
                    onPress={() => completeSettlement(current.id)}
                    style={({ pressed }) => [styles.completeBtn, pressed && styles.pressed]}
                  >
                    <Ionicons name="checkmark-circle" size={17} color={colors.bgRoot} />
                    <Text style={styles.completeText}>정산 완료 처리</Text>
                  </Pressable>
                ) : (
                  unpaidShares.length > 0 && (
                    <Pressable onPress={remindUnpaid} style={({ pressed }) => [styles.remindBtn, reminded && styles.remindBtnDone, pressed && styles.pressed]}>
                      <Text style={[styles.remindText, reminded && { color: colors.green }]}>
                        {reminded ? '독촉 알림을 보냈어요' : `미입금 ${unpaidShares.length}명에게 알림`}
                      </Text>
                    </Pressable>
                  )
                ))}
            </View>
          )}

          {past.length > 0 && (
            <View style={{ gap: 10 }}>
              <Text style={styles.pastTitle}>지난 정산</Text>
              {past.map((s) => (
                <View key={s.id} style={styles.pastCard}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.pastLabel} numberOfLines={1}>
                      {s.memo || '정산'}
                    </Text>
                    <Text style={styles.pastSub}>
                      참석 {s.shares.length}명 · 1인당 {s.perPerson.toLocaleString()}원
                    </Text>
                  </View>
                  <Text style={styles.pastAmount}>{s.totalAmount.toLocaleString()}원</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      <SendMoneySheet
        visible={sendOpen}
        onClose={() => setSendOpen(false)}
        bankName={current?.bankName ?? ''}
        accountNo={current?.accountNo ?? ''}
        holder={current?.accountHolder ?? ''}
        amount={myShare?.amount ?? 0}
        onCopied={() => setCopied(true)}
      />

      <CreateSettlementSheet
        visible={!!createSheetMatch}
        onClose={() => setCreateSheetMatchId(null)}
        matchLabel={
          createSheetMatch
            ? `${new Date(createSheetMatch.match_date).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}${
                createSheetMatch.location ? ` · ${createSheetMatch.location}` : ''
              }`
            : ''
        }
        attendees={
          createSheetMatch
            ? createSheetMatch.votes.filter((v) => v.status === 'attend').map((v) => ({ id: v.team_member_id, name: nameFor(v.team_member_id) }))
            : []
        }
        account={{
          bank: (latestAccount ?? accountDraft).bankName,
          no: (latestAccount ?? accountDraft).accountNo,
          holder: (latestAccount ?? accountDraft).accountHolder,
        }}
        onSubmit={({ total, targetIds, memo }) => {
          if (!createSheetMatch || !activeTeam) return;
          const account = latestAccount ?? accountDraft;
          if (!isAccountComplete(account)) return;
          const allAttendeeIds = createSheetMatch.votes.filter((v) => v.status === 'attend').map((v) => v.team_member_id);
          createSettlement({
            matchId: createSheetMatch.id,
            teamId: activeTeam.team.id,
            totalAmount: total,
            targets: allAttendeeIds.map((id) => ({ teamMemberId: id })),
            exemptIds: allAttendeeIds.filter((id) => !targetIds.includes(id)),
            memo: memo || undefined,
            account: { bankName: account.bankName, accountNo: account.accountNo, accountHolder: account.accountHolder },
            createdBy: activeTeam.membershipId,
          });
        }}
      />

      {/* 팀 설정에 계좌를 아직 안 넣었을 때만 — 정산 만들기 전에 계좌를 한 번은 입력해야 한다 */}
      {isAdmin && !!createSheetMatch && !latestAccount && (
        <View style={styles.accountModalOverlay} pointerEvents="box-none">
          <View style={styles.accountModal}>
            <Text style={styles.accountModalTitle}>입금 계좌를 먼저 등록해주세요</Text>
            <Text style={styles.accountModalSub}>팀 탭 → 팀 설정에서 한 번만 등록하면 다음부턴 자동으로 채워져요</Text>
            <BankPicker value={accountDraft.bankName} onChange={(name) => setAccountDraft((p) => ({ ...p, bankName: name }))} />
            <TextInput
              style={styles.input}
              placeholder="계좌번호"
              placeholderTextColor={colors.placeholder}
              keyboardType="number-pad"
              value={accountDraft.accountNo}
              onChangeText={(t) => setAccountDraft((p) => ({ ...p, accountNo: t }))}
            />
            <TextInput
              style={styles.input}
              placeholder="예금주"
              placeholderTextColor={colors.placeholder}
              value={accountDraft.accountHolder}
              onChangeText={(t) => setAccountDraft((p) => ({ ...p, accountHolder: t }))}
            />
            <Pressable onPress={() => setCreateSheetMatchId(null)} style={styles.accountModalClose}>
              <Text style={styles.accountModalCloseText}>입력 완료 후 다시 "정산 만들기"를 눌러주세요</Text>
            </Pressable>
          </View>
        </View>
      )}
    </ScreenGradient>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 20, paddingBottom: 110, gap: 14 },
  pressed: { opacity: 0.85 },
  errorText: { color: colors.danger, textAlign: 'center', marginBottom: 8 },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.hero,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    gap: 14,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  cardSub: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  statusChip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  statusDone: { backgroundColor: 'rgba(74,222,128,0.14)' },
  statusOngoing: { backgroundColor: 'rgba(210,163,76,0.14)' },
  statusText: { fontSize: 11, fontWeight: '800' },

  myDue: { gap: 10 },
  myDueLabel: { color: colors.textDim, fontSize: 11, fontWeight: '700' },
  myDueRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  myDueAmount: {
    color: colors.text,
    fontSize: 38,
    fontWeight: '800',
    letterSpacing: -1.4,
    lineHeight: 42,
    fontVariant: ['tabular-nums'],
  },
  myDuePaid: { color: colors.green },
  myDueUnit: { color: colors.textMuted, fontSize: 15, fontWeight: '700', paddingBottom: 4 },

  sendBtn: {
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.green,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  sendText: { color: colors.bgRoot, fontSize: 13.5, fontWeight: '800' },

  paidBtn: {
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: '#26332D',
  },
  paidBtnDone: { backgroundColor: 'rgba(74,222,128,0.12)', borderColor: '#2F4A3A' },
  paidText: { color: colors.textStrong, fontSize: 13.5, fontWeight: '800' },

  accountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 13,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  accountLabel: { color: colors.textDim, fontSize: 10.5, fontWeight: '700' },
  accountText: { color: colors.textStrong, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  accountHolder: { color: colors.textDim, fontSize: 11, fontWeight: '600' },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 36,
    paddingHorizontal: 13,
    borderRadius: 11,
    backgroundColor: colors.green,
  },
  copyBtnDone: { backgroundColor: '#1B2A22', borderWidth: 1, borderColor: colors.greenDeep },
  copyText: { color: colors.bgRoot, fontSize: 12.5, fontWeight: '800' },

  progressRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  progressAmountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  progressAmount: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  progressTotal: { color: colors.textDim, fontSize: 13, fontWeight: '700' },
  progressCount: { color: colors.green, fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.divider, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4, backgroundColor: colors.green },

  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: '#26332D',
  },
  filterChipOn: { backgroundColor: 'rgba(74,222,128,0.10)', borderColor: '#2F4A3A' },
  filterText: { color: colors.textMuted, fontSize: 11.5, fontWeight: '800' },
  bulkBtn: { marginLeft: 'auto', paddingHorizontal: 13, paddingVertical: 9, borderRadius: 999, backgroundColor: colors.green },
  bulkText: { color: colors.bgRoot, fontSize: 11.5, fontWeight: '800' },

  payments: { borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 2 },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#8FA69C', fontSize: 10, fontWeight: '800' },
  paymentName: { flex: 1, color: colors.textStrong, fontSize: 13, fontWeight: '600' },
  paymentAmount: { color: colors.textDim, fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#2C3833',
  },
  checkOn: { backgroundColor: colors.green, borderColor: colors.green },
  checkSelected: { backgroundColor: 'rgba(74,222,128,0.3)', borderColor: 'transparent' },

  completeBtn: {
    height: 48,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: colors.green,
  },
  completeText: { color: colors.bgRoot, fontSize: 13.5, fontWeight: '800' },

  remindBtn: {
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: '#26332D',
  },
  remindBtnDone: { backgroundColor: 'rgba(74,222,128,0.10)', borderColor: '#2F4A3A' },
  remindText: { color: colors.textStrong, fontSize: 13, fontWeight: '800' },

  pastTitle: { color: colors.textDim, fontSize: 12.5, fontWeight: '800', marginTop: 4 },
  pastCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.tile,
    padding: 14,
  },
  pastLabel: { color: colors.textStrong, fontSize: 13, fontWeight: '700' },
  pastSub: { color: colors.textMuted, fontSize: 11.5, fontWeight: '600' },
  pastAmount: { color: colors.text, fontSize: 13.5, fontWeight: '800', fontVariant: ['tabular-nums'] },

  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 14,
    backgroundColor: colors.inputBg,
  },

  accountModalOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  accountModal: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 10,
  },
  accountModalTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  accountModalSub: { color: colors.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 4 },
  accountModalClose: { marginTop: 8, alignItems: 'center' },
  accountModalCloseText: { color: colors.green, fontSize: 12.5, fontWeight: '700' },
});
