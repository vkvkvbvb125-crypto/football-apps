import { useEffect, useState } from 'react';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../../../components/nativeText';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { ScreenGradient } from '../../../components/ScreenGradient';
import { EmptyState } from '../../../components/EmptyState';
import { TabHeader } from '../../../components/TabHeader';
import { useTeamStore } from '../../team/stores/teamStore';
import { useAttendanceStore } from '../../attendance/stores/attendanceStore';
import { useSettlementStore } from '../stores/settlementStore';
import { BankPicker } from '../components/BankPicker';
import type { SettlementAccount } from '../services/settlementService';

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

  const [amountDrafts, setAmountDrafts] = useState<Record<string, string>>({});
  const [accountDrafts, setAccountDrafts] = useState<Record<string, SettlementAccount>>({});
  const [copiedMatchId, setCopiedMatchId] = useState<string | null>(null);

  const latestAccount = useSettlementStore((s) => s.latestAccount);
  const loadLatestAccount = useSettlementStore((s) => s.loadLatestAccount);

  useEffect(() => {
    if (!activeTeam) return;
    (async () => {
      await loadMatches();
      await loadSettlements();
    })();
  }, [activeTeam?.team.id]);

  useEffect(() => {
    if (!activeTeam) return;
    loadLatestAccount();
  }, [activeTeam?.team.id]);

  const nameFor = (teamMemberId: string) => members.find((m) => m.id === teamMemberId)?.displayName ?? '멤버';

  const accountFor = (matchId: string): SettlementAccount =>
    accountDrafts[matchId] ?? { bankName: '', accountNumber: '', accountHolder: '' };

  const updateAccountField = (matchId: string, field: keyof SettlementAccount, value: string) => {
    setAccountDrafts((prev) => ({ ...prev, [matchId]: { ...accountFor(matchId), [field]: value } }));
  };

  const applyLatestAccount = (matchId: string) => {
    if (!latestAccount) return;
    setAccountDrafts((prev) => ({ ...prev, [matchId]: latestAccount }));
  };

  const isAccountComplete = (account: SettlementAccount) =>
    !!account.bankName.trim() && !!account.accountNumber.trim() && !!account.accountHolder.trim();

  const matchesWithAttendees = matches.filter((m) => m.votes.some((v) => v.status === 'attend'));

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
        <ActivityIndicator style={{ marginTop: 40 }} color="#4ADE80" />
      ) : matchesWithAttendees.length === 0 ? (
        <EmptyState
          emoji="💰"
          title="아직 정산할 경기가 없어요"
          subtitle={'참석투표가 있는 경기가 생기면\n여기서 회비를 정산할 수 있어요'}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {error && <Text style={styles.errorText}>{error}</Text>}
          {matchesWithAttendees.map((match) => {
            const settlement = settlements.find((s) => s.match_id === match.id);
            const attendeeIds = match.votes.filter((v) => v.status === 'attend').map((v) => v.team_member_id);
            const attendeeCount = attendeeIds.length;
            const draftAmount = Number(amountDrafts[match.id]) || 0;
            const perPersonPreview = attendeeCount > 0 ? Math.ceil(draftAmount / attendeeCount) : 0;

            return (
              <View key={match.id} style={styles.card}>
                <Text style={styles.cardDate}>
                  {new Date(match.match_date).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}
                  {match.location ? ` · ${match.location}` : ''}
                </Text>
                <Text style={styles.attendeeCount}>참석 {attendeeCount}명</Text>

                {settlement ? (
                  <>
                    <View style={styles.amountRow}>
                      <Text style={styles.totalAmount}>총 {settlement.total_amount.toLocaleString()}원</Text>
                      <Text style={styles.perPersonAmount}>
                        1인당 {settlement.per_person_amount?.toLocaleString()}원
                      </Text>
                    </View>

                    <View style={styles.accountRow}>
                      <Text style={styles.accountText}>
                        {settlement.bank_name} {settlement.account_number} ({settlement.account_holder})
                      </Text>
                      <Pressable
                        hitSlop={8}
                        onPress={async () => {
                          await Clipboard.setStringAsync(settlement.account_number);
                          setCopiedMatchId(match.id);
                          setTimeout(() => setCopiedMatchId((cur) => (cur === match.id ? null : cur)), 1500);
                        }}
                      >
                        <Ionicons
                          name={copiedMatchId === match.id ? 'checkmark' : 'copy-outline'}
                          size={15}
                          color="#4ADE80"
                        />
                      </Pressable>
                    </View>

                    <View style={styles.paymentList}>
                      {settlement.payments.map((p) => (
                        <Pressable
                          key={p.id}
                          style={styles.paymentRow}
                          disabled={!isAdmin && p.team_member_id !== activeTeam.membershipId}
                          onPress={() => togglePayment(p.id, !p.is_paid)}
                        >
                          <Text style={styles.paymentName}>{nameFor(p.team_member_id)}</Text>
                          <Text style={[styles.paymentStatus, p.is_paid && styles.paymentStatusPaid]}>
                            {p.is_paid ? '입금완료' : '미입금'}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                ) : isAdmin ? (
                  <View style={styles.createForm}>
                    <TextInput
                      style={styles.amountInput}
                      placeholder="총 비용 (원)"
                      placeholderTextColor="#5A625E"
                      keyboardType="number-pad"
                      value={amountDrafts[match.id] ?? ''}
                      onChangeText={(t) => setAmountDrafts((prev) => ({ ...prev, [match.id]: t }))}
                    />

                    {draftAmount > 0 && (
                      <View style={styles.previewList}>
                        {attendeeIds.map((id) => (
                          <View key={id} style={styles.previewRow}>
                            <Text style={styles.previewName}>{nameFor(id)}</Text>
                            <Text style={styles.previewAmount}>{perPersonPreview.toLocaleString()}원</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {latestAccount && (
                      <Pressable style={styles.latestAccountChip} onPress={() => applyLatestAccount(match.id)}>
                        <Ionicons name="time-outline" size={13} color="#4ADE80" />
                        <Text style={styles.latestAccountChipText}>
                          최근 사용: {latestAccount.bankName} {latestAccount.accountNumber} ({latestAccount.accountHolder})
                        </Text>
                      </Pressable>
                    )}

                    <BankPicker
                      value={accountFor(match.id).bankName}
                      onChange={(name) => updateAccountField(match.id, 'bankName', name)}
                    />
                    <TextInput
                      style={styles.amountInput}
                      placeholder="계좌번호"
                      placeholderTextColor="#5A625E"
                      keyboardType="number-pad"
                      value={accountFor(match.id).accountNumber}
                      onChangeText={(t) => updateAccountField(match.id, 'accountNumber', t)}
                    />
                    <TextInput
                      style={styles.amountInput}
                      placeholder="예금주"
                      placeholderTextColor="#5A625E"
                      value={accountFor(match.id).accountHolder}
                      onChangeText={(t) => updateAccountField(match.id, 'accountHolder', t)}
                    />

                    <Pressable
                      style={[styles.createButton, !isAccountComplete(accountFor(match.id)) && styles.createButtonDisabled]}
                      disabled={!isAccountComplete(accountFor(match.id))}
                      onPress={() => {
                        const amount = Number(amountDrafts[match.id]);
                        if (!amount) return;
                        createSettlement(match.id, amount, accountFor(match.id));
                      }}
                    >
                      <Text style={styles.createButtonText}>정산 등록</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Text style={styles.waitingText}>총무가 정산을 등록하면 표시돼요</Text>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </ScreenGradient>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 12,
  },
  errorText: {
    color: '#F87171',
    textAlign: 'center',
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#141A17',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#22302A',
    padding: 16,
  },
  cardDate: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  attendeeCount: {
    marginTop: 4,
    color: '#8A9490',
    fontSize: 12,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  totalAmount: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  perPersonAmount: {
    color: '#4ADE80',
    fontWeight: '700',
    fontSize: 14,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#0F1512',
  },
  accountText: {
    color: '#8A9490',
    fontSize: 12,
    fontWeight: '600',
  },
  previewList: {
    marginTop: 4,
    gap: 6,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#1B231F',
  },
  previewName: {
    color: '#FFFFFF',
    fontSize: 13,
  },
  previewAmount: {
    color: '#4ADE80',
    fontWeight: '700',
    fontSize: 13,
  },
  paymentList: {
    marginTop: 12,
    gap: 6,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#1B231F',
  },
  paymentName: {
    color: '#FFFFFF',
    fontSize: 13,
  },
  paymentStatus: {
    fontSize: 12,
    fontWeight: '600',
    color: '#D2A34C',
  },
  paymentStatusPaid: {
    color: '#4ADE80',
  },
  createForm: {
    gap: 8,
    marginTop: 12,
  },
  latestAccountChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#1B231F',
  },
  latestAccountChipText: {
    color: '#4ADE80',
    fontSize: 11,
    fontWeight: '600',
  },
  createButtonDisabled: {
    opacity: 0.4,
  },
  amountInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#22302A',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#FFFFFF',
    backgroundColor: '#0F1512',
  },
  createButton: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 4,
    backgroundColor: '#4ADE80',
  },
  createButtonText: {
    color: '#0F1512',
    fontWeight: '700',
    fontSize: 15,
  },
  waitingText: {
    marginTop: 12,
    color: '#5A625E',
    fontSize: 12,
  },
});
