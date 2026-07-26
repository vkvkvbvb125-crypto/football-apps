// src/features/settlement/screens/SettlementScreen.tsx — 리디자인 v2 적용판
// 멤버: 큰 금액 + 송금 딥링크 + 입금 완료 체크. 총무: 입금 현황 + 미입금 필터 + 여러 명 한 번에 확인.
// store API(createSettlement, togglePayment, latestAccount) 그대로 사용 - 실제 매치/정산 데이터 기반.
import { useEffect, useMemo, useState } from 'react';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
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
import { BankPicker } from '../components/BankPicker';
import { SendMoneySheet } from '../components/SendMoneySheet';
import type { SettlementAccount } from '../services/settlementService';

const EMPTY_ACCOUNT: SettlementAccount = { bankName: '', accountNumber: '', accountHolder: '' };

function initialOf(name: string) {
  return name.length > 2 ? name.slice(1) : name;
}

export function SettlementScreen({ navigation }: BottomTabScreenProps<any>) {
  const activeTeam = useTeamStore((s) => s.activeTeam);
  const members = useTeamStore((s) => s.members);
  const isAdmin = activeTeam?.role === 'admin';

  const matches = useAttendanceStore((s) => s.matches);
  const loadMatches = useAttendanceStore((s) => s.loadMatches);

  const settlements = useSettlementStore((s) => s.settlements);
  const loaded = useSettlementStore((s) => s.loaded);
  const loading = useSettlementStore((s) => s.loading);
  const error = useSettlementStore((s) => s.error);
  const loadSettlements = useSettlementStore((s) => s.loadSettlements);
  const createSettlement = useSettlementStore((s) => s.createSettlement);
  const togglePayment = useSettlementStore((s) => s.togglePayment);
  const latestAccount = useSettlementStore((s) => s.latestAccount);
  const loadLatestAccount = useSettlementStore((s) => s.loadLatestAccount);

  const [amountDrafts, setAmountDrafts] = useState<Record<string, string>>({});
  const [accountDrafts, setAccountDrafts] = useState<Record<string, SettlementAccount>>({});
  const [copiedMatchId, setCopiedMatchId] = useState<string | null>(null);
  const [sendMatchId, setSendMatchId] = useState<string | null>(null);
  const [onlyUnpaidByMatch, setOnlyUnpaidByMatch] = useState<Record<string, boolean>>({});
  const [selectedPayments, setSelectedPayments] = useState<Record<string, boolean>>({});
  const [remindedMatches, setRemindedMatches] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!activeTeam) return;
    (async () => {
      await loadMatches();
      await loadSettlements();
      loadLatestAccount();
    })();
  }, [activeTeam?.team.id]);

  const nameFor = (teamMemberId: string) => members.find((m) => m.id === teamMemberId)?.displayName ?? '멤버';
  const accountFor = (matchId: string) => accountDrafts[matchId] ?? EMPTY_ACCOUNT;
  const updateAccountField = (matchId: string, field: keyof SettlementAccount, value: string) =>
    setAccountDrafts((prev) => ({ ...prev, [matchId]: { ...accountFor(matchId), [field]: value } }));
  const isAccountComplete = (a: SettlementAccount) =>
    !!a.bankName.trim() && !!a.accountNumber.trim() && !!a.accountHolder.trim();

  const copyAccount = async (matchId: string, accountNumber: string) => {
    await Clipboard.setStringAsync(accountNumber);
    setCopiedMatchId(matchId);
    setTimeout(() => setCopiedMatchId((cur) => (cur === matchId ? null : cur)), 1500);
  };

  const toggleOnlyUnpaid = (matchId: string) =>
    setOnlyUnpaidByMatch((prev) => ({ ...prev, [matchId]: !prev[matchId] }));

  const toggleSelectPayment = (paymentId: string) =>
    setSelectedPayments((prev) => ({ ...prev, [paymentId]: !prev[paymentId] }));

  const confirmSelected = async (paymentIds: string[]) => {
    setSelectedPayments((prev) => {
      const next = { ...prev };
      paymentIds.forEach((id) => delete next[id]);
      return next;
    });
    for (const id of paymentIds) {
      await togglePayment(id, true);
    }
  };

  const remindMatch = (matchId: string) => {
    setRemindedMatches((prev) => ({ ...prev, [matchId]: true }));
    setTimeout(() => setRemindedMatches((prev) => ({ ...prev, [matchId]: false })), 2000);
  };

  const matchesWithAttendees = useMemo(
    () =>
      matches
        .filter((m) => m.votes.some((v) => v.status === 'attend'))
        .sort((a, b) => new Date(b.match_date).getTime() - new Date(a.match_date).getTime()),
    [matches]
  );

  const sendSettlement = useMemo(
    () => (sendMatchId ? settlements.find((s) => s.match_id === sendMatchId) ?? null : null),
    [sendMatchId, settlements]
  );

  return (
    <ScreenGradient>
      <TabHeader title="정산" />

      {!activeTeam ? (
        <EmptyState
          emoji="💰"
          title="팀에 가입하면 정산이 표시돼요"
          subtitle={'먼저 팀을 만들거나 가입해보세요'}
          actionLabel="팀 만들기 / 가입"
          onAction={() => navigation.navigate('Team')}
        />
      ) : loading && !loaded ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.green} />
      ) : matchesWithAttendees.length === 0 ? (
        <EmptyState
          emoji="💰"
          title="아직 정산할 경기가 없어요"
          subtitle={'참석투표가 있는 경기가 생기면\n여기서 회비를 정산할 수 있어요'}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {!!error && <Text style={styles.errorText}>{error}</Text>}

          {matchesWithAttendees.map((match) => {
            const settlement = settlements.find((s) => s.match_id === match.id);
            const attendeeIds = match.votes.filter((v) => v.status === 'attend').map((v) => v.team_member_id);
            const draftAmount = Number(amountDrafts[match.id]) || 0;
            const perPersonPreview = attendeeIds.length > 0 ? Math.ceil(draftAmount / attendeeIds.length) : 0;
            const d = new Date(match.match_date);
            const dateLabel = `${d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}${
              match.location ? ` · ${match.location}` : ''
            }`;

            // ── 정산 완료본
            if (settlement) {
              const paid = settlement.payments.filter((p) => p.is_paid).length;
              const unpaidPayments = settlement.payments.filter((p) => !p.is_paid);
              const totalCount = settlement.payments.length || 1;
              const pct = Math.round((paid / totalCount) * 100);
              const collected = paid * (settlement.per_person_amount ?? 0);
              const myPayment = settlement.payments.find((p) => p.team_member_id === activeTeam.membershipId);
              const done = paid === settlement.payments.length;
              const onlyUnpaid = !!onlyUnpaidByMatch[match.id];
              const visiblePayments = isAdmin && onlyUnpaid ? unpaidPayments : settlement.payments;
              const selectedIds = unpaidPayments.map((p) => p.id).filter((id) => selectedPayments[id]);

              return (
                <View key={match.id} style={styles.card}>
                  <View style={styles.cardHead}>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {dateLabel}
                      </Text>
                      <Text style={styles.cardSub}>
                        참석 {attendeeIds.length}명 · 1인당 {settlement.per_person_amount?.toLocaleString()}원
                      </Text>
                    </View>
                    <View style={[styles.statusChip, done ? styles.statusDone : styles.statusOngoing]}>
                      <Text style={[styles.statusText, { color: done ? colors.green : colors.gold }]}>
                        {done ? '완료' : '진행중'}
                      </Text>
                    </View>
                  </View>

                  {/* 멤버: 내가 낼 금액이 제일 크게 + 송금 딥링크 */}
                  {!isAdmin && myPayment && (
                    <View style={styles.myDue}>
                      <Text style={styles.myDueLabel}>{myPayment.is_paid ? '입금 완료' : '내가 낼 금액'}</Text>
                      <View style={styles.myDueRow}>
                        <Text style={[styles.myDueAmount, myPayment.is_paid && styles.myDuePaid]}>
                          {settlement.per_person_amount?.toLocaleString()}
                        </Text>
                        <Text style={styles.myDueUnit}>원</Text>
                      </View>

                      {!myPayment.is_paid && (
                        <Pressable
                          onPress={() => setSendMatchId(match.id)}
                          style={({ pressed }) => [styles.sendBtn, pressed && styles.pressed]}
                        >
                          <Ionicons name="arrow-forward" size={16} color={colors.bgRoot} />
                          <Text style={styles.sendText}>송금하기</Text>
                        </Pressable>
                      )}

                      <Pressable
                        onPress={() => togglePayment(myPayment.id, !myPayment.is_paid)}
                        style={({ pressed }) => [
                          styles.paidBtn,
                          myPayment.is_paid && styles.paidBtnDone,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={[styles.paidText, myPayment.is_paid && { color: colors.green }]}>
                          {myPayment.is_paid ? '입금 완료 취소' : '입금했어요'}
                        </Text>
                      </Pressable>
                    </View>
                  )}

                  <Pressable
                    onPress={() => copyAccount(match.id, settlement.account_number)}
                    style={({ pressed }) => [styles.accountBox, pressed && styles.pressed]}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.accountLabel}>입금 계좌</Text>
                      <Text style={styles.accountText}>
                        {settlement.bank_name} {settlement.account_number}
                      </Text>
                      <Text style={styles.accountHolder}>예금주 {settlement.account_holder}</Text>
                    </View>
                    <View style={[styles.copyBtn, copiedMatchId === match.id && styles.copyBtnDone]}>
                      <Ionicons
                        name={copiedMatchId === match.id ? 'checkmark' : 'copy-outline'}
                        size={13}
                        color={copiedMatchId === match.id ? colors.green : colors.bgRoot}
                      />
                      <Text style={[styles.copyText, copiedMatchId === match.id && { color: colors.green }]}>
                        {copiedMatchId === match.id ? '복사됨' : '복사'}
                      </Text>
                    </View>
                  </Pressable>

                  <View style={{ gap: 8 }}>
                    <View style={styles.progressRow}>
                      <View style={styles.progressAmountRow}>
                        <Text style={styles.progressAmount}>{collected.toLocaleString()}</Text>
                        <Text style={styles.progressTotal}>/ {settlement.total_amount.toLocaleString()}원</Text>
                      </View>
                      <Text style={styles.progressCount}>
                        {paid}/{settlement.payments.length}명 입금
                      </Text>
                    </View>
                    <View style={styles.track}>
                      <View style={[styles.fill, { width: `${pct}%` }]} />
                    </View>
                  </View>

                  {isAdmin && (
                    <View style={styles.filterRow}>
                      <Pressable
                        onPress={() => toggleOnlyUnpaid(match.id)}
                        style={({ pressed }) => [
                          styles.filterChip,
                          onlyUnpaid && styles.filterChipOn,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={[styles.filterText, onlyUnpaid && { color: colors.green }]}>
                          미입금만 {unpaidPayments.length}
                        </Text>
                      </Pressable>
                      {selectedIds.length > 0 && (
                        <Pressable
                          onPress={() => confirmSelected(selectedIds)}
                          style={({ pressed }) => [styles.bulkBtn, pressed && styles.pressed]}
                        >
                          <Text style={styles.bulkText}>{selectedIds.length}명 입금 확인</Text>
                        </Pressable>
                      )}
                    </View>
                  )}

                  <View style={styles.payments}>
                    {visiblePayments.map((p) => {
                      const isMe = p.team_member_id === activeTeam.membershipId;
                      const canToggle = isAdmin || isMe;
                      const isSelected = !!selectedPayments[p.id];
                      const handlePress = () => {
                        if (!canToggle) return;
                        if (isMe) {
                          togglePayment(p.id, !p.is_paid);
                        } else if (isAdmin && !p.is_paid) {
                          toggleSelectPayment(p.id);
                        }
                      };
                      return (
                        <Pressable
                          key={p.id}
                          disabled={!canToggle}
                          onPress={handlePress}
                          style={({ pressed }) => [styles.paymentRow, pressed && canToggle && styles.pressed]}
                        >
                          <View style={styles.avatar}>
                            <Text style={styles.avatarText}>{initialOf(nameFor(p.team_member_id))}</Text>
                          </View>
                          <Text style={styles.paymentName} numberOfLines={1}>
                            {nameFor(p.team_member_id)}
                            {isMe ? ' (나)' : ''}
                          </Text>
                          <Text style={styles.paymentAmount}>
                            {settlement.per_person_amount?.toLocaleString()}원
                          </Text>
                          <View
                            style={[
                              styles.check,
                              p.is_paid ? styles.checkOn : isSelected ? styles.checkSelected : null,
                            ]}
                          >
                            {p.is_paid && <Ionicons name="checkmark" size={13} color={colors.bgRoot} />}
                            {!p.is_paid && isSelected && <Ionicons name="checkmark" size={13} color={colors.green} />}
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>

                  {isAdmin && unpaidPayments.length > 0 && (
                    <Pressable
                      onPress={() => remindMatch(match.id)}
                      style={({ pressed }) => [
                        styles.remindBtn,
                        remindedMatches[match.id] && styles.remindBtnDone,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={[styles.remindText, remindedMatches[match.id] && { color: colors.green }]}>
                        {remindedMatches[match.id] ? '독촉 알림을 보냈어요' : `미입금 ${unpaidPayments.length}명에게 알림`}
                      </Text>
                    </Pressable>
                  )}
                </View>
              );
            }

            // ── 정산 등록 전
            return (
              <View key={match.id} style={styles.card}>
                <View style={styles.cardHead}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {dateLabel}
                    </Text>
                    <Text style={styles.cardSub}>참석 {attendeeIds.length}명</Text>
                  </View>
                  <View style={[styles.statusChip, styles.statusWaiting]}>
                    <Text style={[styles.statusText, { color: colors.textMuted }]}>정산 전</Text>
                  </View>
                </View>

                {isAdmin ? (
                  <View style={{ gap: 16 }}>
                    <View style={styles.formSection}>
                      <View style={styles.formSectionHead}>
                        <View style={styles.formIcon}>
                          <Ionicons name="cash-outline" size={15} color={colors.green} />
                        </View>
                        <Text style={styles.formSectionTitle}>총 비용</Text>
                      </View>
                      <TextInput
                        style={styles.input}
                        placeholder="총 비용 (원)"
                        placeholderTextColor={colors.placeholder}
                        keyboardType="number-pad"
                        value={amountDrafts[match.id] ?? ''}
                        onChangeText={(t) => setAmountDrafts((prev) => ({ ...prev, [match.id]: t }))}
                      />
                      {draftAmount > 0 && (
                        <View style={styles.preview}>
                          <Text style={styles.previewLabel}>참석 {attendeeIds.length}명 · 1인당</Text>
                          <Text style={styles.previewAmount}>{perPersonPreview.toLocaleString()}원</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.formSection}>
                      <View style={styles.formSectionHead}>
                        <View style={styles.formIcon}>
                          <Ionicons name="card-outline" size={15} color={colors.green} />
                        </View>
                        <Text style={styles.formSectionTitle}>입금 계좌</Text>
                        {!!latestAccount && (
                          <Pressable
                            onPress={() => setAccountDrafts((prev) => ({ ...prev, [match.id]: latestAccount }))}
                            style={({ pressed }) => [styles.recentChip, pressed && styles.pressed]}
                          >
                            <Ionicons name="time-outline" size={12} color={colors.green} />
                            <Text style={styles.recentText} numberOfLines={1}>
                              최근 계좌 쓰기
                            </Text>
                          </Pressable>
                        )}
                      </View>
                      <BankPicker
                        value={accountFor(match.id).bankName}
                        onChange={(name) => updateAccountField(match.id, 'bankName', name)}
                      />
                      <TextInput
                        style={styles.input}
                        placeholder="계좌번호"
                        placeholderTextColor={colors.placeholder}
                        keyboardType="number-pad"
                        value={accountFor(match.id).accountNumber}
                        onChangeText={(t) => updateAccountField(match.id, 'accountNumber', t)}
                      />
                      <TextInput
                        style={styles.input}
                        placeholder="예금주"
                        placeholderTextColor={colors.placeholder}
                        value={accountFor(match.id).accountHolder}
                        onChangeText={(t) => updateAccountField(match.id, 'accountHolder', t)}
                      />
                    </View>

                    <Pressable
                      disabled={!isAccountComplete(accountFor(match.id)) || draftAmount <= 0}
                      onPress={() => createSettlement(match.id, draftAmount, accountFor(match.id))}
                      style={({ pressed }) => [
                        styles.submit,
                        (!isAccountComplete(accountFor(match.id)) || draftAmount <= 0) && styles.submitDisabled,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Ionicons name="checkmark-circle" size={17} color={colors.bgRoot} />
                      <Text style={styles.submitText}>정산 등록</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.waitingBox}>
                    <Ionicons name="hourglass-outline" size={16} color={colors.textFaint} />
                    <Text style={styles.waiting}>총무가 정산을 등록하면 알려드릴게요</Text>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      <SendMoneySheet
        visible={!!sendSettlement}
        onClose={() => setSendMatchId(null)}
        bankName={sendSettlement?.bank_name ?? ''}
        accountNo={sendSettlement?.account_number ?? ''}
        holder={sendSettlement?.account_holder ?? ''}
        amount={sendSettlement?.per_person_amount ?? 0}
        onCopied={() => sendMatchId && setCopiedMatchId(sendMatchId)}
      />
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
  statusWaiting: { backgroundColor: 'rgba(255,255,255,0.06)' },
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

  formSection: {
    gap: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  formSectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  formIcon: {
    width: 26,
    height: 26,
    borderRadius: 9,
    backgroundColor: colors.greenTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formSectionTitle: { flex: 1, color: colors.textStrong, fontSize: 12.5, fontWeight: '800' },
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
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(74,222,128,0.07)',
    borderWidth: 1,
    borderColor: colors.greenDeep,
  },
  previewLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  previewAmount: { color: colors.green, fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  recentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '45%',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#1B231F',
  },
  recentText: { color: colors.green, fontSize: 10.5, fontWeight: '700', flexShrink: 1 },
  submit: {
    height: 52,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: colors.green,
  },
  submitDisabled: { opacity: 0.4 },
  submitText: { color: colors.bgRoot, fontSize: 14.5, fontWeight: '800' },
  waitingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  waiting: { color: colors.textFaint, fontSize: 12.5, fontWeight: '600' },
});
