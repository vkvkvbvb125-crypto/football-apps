// src/features/settlement/screens/SettlementScreen.tsx — 시안 적용판 (카드 리스트 + 상세 모달)
// 20260727 마이그레이션의 settlements/settlement_shares 스키마 기반.
// store는 "진행 중인 정산 하나(current)"만 추적한다 — 한 번에 하나씩 정산하는
// 일반적인 사용 흐름에 맞춘 단순화이며, 여러 경기를 동시에 미정산 상태로 열어두면
// 가장 최근 것만 current로 보인다(나머지는 status='open'인 채로 DB엔 남아있음).
//
// 구성: 전체/진행중/완료 탭 → 카드 리스트(진행률 링 + 배지 + 빠른 액션 아이콘) →
// 카드를 누르면 상세 모달(입금 계좌·참석자별 입금 현황·총무 액션)이 뜬다.
// 계좌는 팀당 하나만 저장하는 기존 구조를 그대로 쓴다 — 여러 계좌 관리로 확장하려면
// team_bank_accounts 같은 새 테이블과 마이그레이션이 필요해서 이번엔 범위 밖으로 뒀다.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  AppState,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text, TextInput } from '../../../components/nativeText';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { ScreenGradient, useTabBarPadding } from '../../../components/ScreenGradient';
import { alertMessage, confirmAction } from '../../../components/Dialog';
import { TabHeader } from '../../../components/TabHeader';
import { colors, radius } from '../../../theme';
import { useTeamStore } from '../../team/stores/teamStore';
import { useAttendanceStore } from '../../attendance/stores/attendanceStore';
import { useSettlementStore, type Settlement } from '../stores/settlementStore';
import { settlementTitle, settlementPlace } from '../utils';
import { shareSettlement, settlementLink, settlementShareMessage } from '../links';
import { useSettlementRealtime } from '../hooks/useSettlementRealtime';
import { fetchTeamSettings, upsertTeamSettings } from '../../team/services/teamSettingsService';
import { notifyTeam } from '../../notifications/services/pushService';
import { BankPicker } from '../components/BankPicker';
import { SendMoneySheet } from '../components/SendMoneySheet';
import { SettlementCard } from '../components/SettlementCard';
import { CreateSettlementSheet } from '../components/CreateSettlementSheet';
import { SettlementDetailSettings } from '../components/SettlementDetailSettings';
import { ShareLinkSheet } from '../components/ShareLinkSheet';
import { SettlementEmpty } from '../components/SettlementEmpty';
import { SettlementProgressPanel } from '../components/SettlementProgressPanel';
import { SettlementDonePanel, SummaryBox, SummaryRow } from '../components/SettlementSummary';

/** "보낸 시간" — 날짜까지 적어야 어제 보낸 건지 오늘인지 구분된다 */
function sentAtLabel(iso: string | null) {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(
    d.getHours()
  ).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

interface AccountDraft {
  bankName: string;
  accountNo: string;
  accountHolder: string;
}

// 정산 탭은 "끝난 경기의 돈"을 전부 관리한다 — 미등록도 예외가 아니라 상태 중 하나다.
type Tab = 'all' | 'pending' | 'ongoing' | 'done';
const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'pending', label: '미등록' },
  { key: 'ongoing', label: '진행중' },
  { key: 'done', label: '완료' },
];

const TAB_EMPTY: Record<Tab, string> = {
  all: '정산할 경기가 없어요',
  pending: '정산 안 한 경기가 없어요',
  ongoing: '진행 중인 정산이 없어요',
  done: '완료된 정산이 없어요',
};

type OuterTab = 'history' | 'account';
const OUTER_TABS: { key: OuterTab; label: string }[] = [
  { key: 'history', label: '정산 내역' },
  { key: 'account', label: '계좌 관리' },
];

const EMPTY_ACCOUNT: AccountDraft = { bankName: '', accountNo: '', accountHolder: '' };

/** 처리 거절 사유를 알린다 — 조용히 삼키면 버튼이 안 눌린 것처럼 보인다 */
function showError(message: string) {
  alertMessage('처리하지 못했어요', message);
}

/** "7/25" — 짧은 날짜 표기 */
function shortDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatDueDate(iso: string) {
  return shortDate(iso);
}

export function SettlementScreen({ navigation, route }: BottomTabScreenProps<any>) {
  const bottomPad = useTabBarPadding();
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
  const updateDetails = useSettlementStore((s) => s.updateDetails);
  const exemptShare = useSettlementStore((s) => s.exemptShare);
  const markPaid = useSettlementStore((s) => s.markPaid);
  const confirmPaid = useSettlementStore((s) => s.confirmPaid);
  const completeSettlement = useSettlementStore((s) => s.complete);

  const [outerTab, setOuterTab] = useState<OuterTab>('history');
  const [tab, setTab] = useState<Tab>('all');
  const [defaultAccount, setDefaultAccount] = useState<AccountDraft | null>(null);
  const [accountDraft, setAccountDraft] = useState<AccountDraft>(EMPTY_ACCOUNT);
  const [copied, setCopied] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [createSheetMatchId, setCreateSheetMatchId] = useState<string | null>(null);
  /** 정산을 만든 직후 뜨는 링크 공유 화면 (Reference 총무④) */
  const [shareLinkOpen, setShareLinkOpen] = useState(false);
  const [selectedShareIds, setSelectedShareIds] = useState<Record<string, boolean>>({});
  const [reminded, setReminded] = useState(false);
  /** 상세 모달로 열려 있는 정산 — 'current' 또는 지난 정산의 id */
  const [detailTarget, setDetailTarget] = useState<'current' | string | null>(null);
  /** 송금 앱으로 나간 뒤 돌아오면 여기에 앱 이름이 담긴다 — 입금 확인을 한 번 물어보려고 */
  const [sentVia, setSentVia] = useState<string | null>(null);
  const [pendingReturn, setPendingReturn] = useState<string | null>(null);

  // 정산 링크(kickday://settlement/{id})로 들어왔다 — 해당 정산 상세를 연다.
  // 목록이 아직 안 불렸어도 detailTarget만 세워두면 로드가 끝나는 순간 모달이 뜬다.
  const openSettlementId = (route?.params as { openSettlementId?: string } | undefined)?.openSettlementId;
  useEffect(() => {
    if (!openSettlementId) return;
    setOuterTab('history');
    setDetailTarget(openSettlementId);
    // 소비했으면 지운다 — 남겨두면 모달을 닫아도 다시 열린다
    navigation.setParams({ openSettlementId: undefined });
  }, [openSettlementId]);

  // 경기 종료 직후 넘어왔다 — 그 경기의 정산 생성 시트를 바로 연다.
  // (계좌가 아직 없으면 아래 계좌 등록 오버레이가 대신 뜬다 — 최초 1회 등록 단계)
  const createForMatchId = (route?.params as { createForMatchId?: string } | undefined)?.createForMatchId;
  useEffect(() => {
    if (!createForMatchId) return;
    setOuterTab('history');
    setCreateSheetMatchId(createForMatchId);
    navigation.setParams({ createForMatchId: undefined });
  }, [createForMatchId]);

  // 딥링크로 송금 앱에 다녀오면 "입금했어요"를 손으로 다시 찾아 눌러야 했다.
  // 돌아온 시점(background → active)을 잡아 확인 줄을 띄워 루프를 닫는다.
  useEffect(() => {
    if (!pendingReturn) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      setSentVia(pendingReturn);
      setPendingReturn(null);
    });
    return () => sub.remove();
  }, [pendingReturn]);

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

  /** 정산 목록만 다시 불러온다 — 화면 복귀·실시간 변경에서 함께 쓴다 */
  const reloadSettlements = useCallback(() => {
    if (!activeTeam) return;
    load(activeTeam.team.id, activeTeam.membershipId);
  }, [activeTeam?.team.id, activeTeam?.membershipId]);

  // 탭을 떠났다 돌아오면 다시 부른다. 팀 변경 시에만 부르고 있어서, 팀원이 입금했다고
  // 눌러도 총무가 다른 탭에 다녀오면 예전 숫자가 그대로 남아 있었다.
  useFocusEffect(reloadSettlements);

  // 보고 있는 동안 팀원이 "송금 완료"를 누르면 진행률이 저절로 갱신된다.
  // (DB 마이그레이션 20260807_settlement_realtime.sql 적용 시 동작 — 미적용이면 조용히 무동작)
  useSettlementRealtime(current?.id ?? null, reloadSettlements);

  // 팀 설정에 계좌가 없으면 가장 최근 정산(진행중이든 완료든)의 계좌를 대신 제안한다
  const latestAccount = useMemo<AccountDraft | null>(() => {
    if (defaultAccount) return defaultAccount;
    const latest = current ?? past[0];
    if (!latest?.bankName || !latest.accountNo || !latest.accountHolder) return null;
    return { bankName: latest.bankName, accountNo: latest.accountNo, accountHolder: latest.accountHolder };
  }, [defaultAccount, current, past]);

  const nameFor = (teamMemberId: string | null) => members.find((m) => m.id === teamMemberId)?.displayName ?? '멤버';
  const isAccountComplete = (a: AccountDraft) => !!a.bankName.trim() && !!a.accountNo.trim() && !!a.accountHolder.trim();

  /** 카드/상세 헤더에 쓸 제목·장소 — utils.ts의 공용 규칙(홈 카드와 동일) */
  const titleOf = (s: Settlement) => settlementTitle(s, matches);
  const placeOf = (s: Settlement) => settlementPlace(s, matches);

  const copyAccount = async (accountNo: string) => {
    await Clipboard.setStringAsync(accountNo);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleShare = (s: Settlement) => shareSettlement(s, titleOf(s));

  const toggleSelectShare = (shareId: string) => setSelectedShareIds((prev) => ({ ...prev, [shareId]: !prev[shareId] }));

  const confirmSelected = async () => {
    const ids = Object.keys(selectedShareIds).filter((id) => selectedShareIds[id]);
    if (ids.length === 0) return;
    setSelectedShareIds({});
    await confirmPaid(ids);
  };

  const remindUnpaid = (s: Settlement) => {
    if (!activeTeam) return;
    const unpaidUserIds = s.shares
      .filter((sh) => !sh.paid && sh.teamMemberId)
      .map((sh) => members.find((m) => m.id === sh.teamMemberId)?.userId)
      .filter((id): id is string => !!id);
    if (unpaidUserIds.length === 0) return;
    notifyTeam(activeTeam.team.id, `${activeTeam.team.name} 회비 독촉`, '아직 회비를 입금하지 않으셨어요', undefined, unpaidUserIds).catch(
      () => {}
    );
    setReminded(true);
    setTimeout(() => setReminded(false), 2000);
  };

  const handleSaveAccount = async (draft: AccountDraft) => {
    if (!activeTeam) return;
    await upsertTeamSettings(activeTeam.team.id, {
      bankName: draft.bankName,
      accountNo: draft.accountNo,
      accountHolder: draft.accountHolder,
    });
    setDefaultAccount(draft);
  };

  const handleSkip = async (matchId: string) => {
    const ok = await confirmAction({
      title: '정산 없이 종료',
      message: '이 경기는 회비를 걷지 않고 종료할까요? 나중에 다시 정산 만들기로 되돌릴 수 없어요.',
      confirmLabel: '종료하기',
      destructive: true,
    });
    if (ok) skipSettlement(matchId);
  };

  const createSheetMatch = useMemo(
    () => (createSheetMatchId ? matches.find((m) => m.id === createSheetMatchId) ?? null : null),
    [createSheetMatchId, matches]
  );

  /**
   * 정산 대상 후보 — 참석 투표한 사람. 아무도 투표하지 않았으면 팀 전원으로 폴백한다.
   *
   * 투표 없이 그냥 모여서 뛰는 팀은 참석자가 0명으로 잡혀 "분배 대상 0명 / 1인당 0원"에서
   * 버튼이 영구히 잠겼다 — 총무가 정산을 아예 만들 수 없는 막다른 길이었다.
   * 전원으로 채운 뒤 안 온 사람을 시트에서 탭해 면제하는 쪽이 실제 사용 흐름에 맞다.
   */
  const settleCandidates = useMemo(() => {
    if (!createSheetMatch) return [];
    const voted = createSheetMatch.votes.filter((v) => v.status === 'attend').map((v) => v.team_member_id);
    const ids = voted.length > 0 ? voted : members.map((m) => m.id);
    return ids.map((id) => ({ id, name: members.find((m) => m.id === id)?.displayName ?? '멤버' }));
  }, [createSheetMatch, members]);

  const hasAnySettlement = !!current || past.length > 0 || pendingMatches.length > 0;

  if (!activeTeam) {
    return (
      <ScreenGradient>
        <TabHeader title="정산" />
        <SettlementEmpty isAdmin={false} />
      </ScreenGradient>
    );
  }

  // 미등록과 진행중은 서로 다른 상태다 — 한 숫자로 합치면 탭 개수가 실제와 어긋난다
  const countOf: Record<Tab, number> = {
    pending: pendingMatches.length,
    ongoing: current ? 1 : 0,
    done: past.length,
    all: pendingMatches.length + (current ? 1 : 0) + past.length,
  };

  // 딥링크는 id로 들어오는데 그 id가 진행중 정산일 수 있다 — past만 뒤지면 못 찾고 빈 화면이 된다.
  // 그래서 id로도 current를 먼저 확인한다.
  const detailSettlement: Settlement | null =
    detailTarget === 'current'
      ? current
      : detailTarget
        ? (current?.id === detailTarget ? current : past.find((s) => s.id === detailTarget) ?? null)
        : null;
  // 총무 액션(입금 확인·독촉·완료)은 진행중 정산에만 있다 — 어떤 경로로 열렸든 실제 대상으로 판단한다
  const isDetailCurrent = !!detailSettlement && detailSettlement.id === current?.id;

  return (
    <ScreenGradient>
      <TabHeader title="정산" />

      <View style={styles.segment}>
        {OUTER_TABS.map((t) => {
          const on = outerTab === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => setOuterTab(t.key)}
              style={({ pressed }) => [styles.segmentItem, on && styles.segmentItemOn, pressed && styles.pressed]}
            >
              <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {outerTab === 'account' ? (
        <AccountManageTab isAdmin={!!isAdmin} account={defaultAccount} onSave={handleSaveAccount} />
      ) : loading && !loaded ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.green} />
      ) : !hasAnySettlement ? (
        // 로드가 실패해도 목록이 비어 보이던 문제 — 빈 상태로 위장하지 말고 원인을 보여준다
        <>
          {!!error && <Text style={styles.errorText}>{error}</Text>}
          <SettlementEmpty isAdmin={!!isAdmin} />
        </>
      ) : (
        <View style={{ flex: 1 }}>
          <View style={styles.tabRow}>
            {TABS.map((t) => {
              const on = tab === t.key;
              const count = countOf[t.key];
              return (
                <Pressable
                  key={t.key}
                  onPress={() => setTab(t.key)}
                  style={({ pressed }) => [styles.tabChip, on && styles.tabChipOn, pressed && styles.pressed]}
                >
                  <Text style={[styles.tabChipText, on && styles.tabChipTextOn]}>
                    {t.label}
                    {count > 0 ? ` ${count}` : ''}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <ScrollView
            contentContainerStyle={[styles.list, { paddingBottom: bottomPad }]}
            showsVerticalScrollIndicator={false}
          >
            {!!error && <Text style={styles.errorText}>{error}</Text>}

            {(tab === 'all' || tab === 'pending') &&
              pendingMatches.map((m) => (
                <SettlementCard
                  key={m.matchId}
                  variant="pending"
                  title={m.title}
                  place={m.where}
                  attendCount={m.attendCount}
                  statusLabel={m.daysSince >= 3 ? `${m.daysSince}일 지남` : '정산 미등록'}
                  onPress={() => isAdmin && setCreateSheetMatchId(m.matchId)}
                  onPrimaryAction={isAdmin ? () => setCreateSheetMatchId(m.matchId) : undefined}
                />
              ))}

            {(tab === 'all' || tab === 'ongoing') && current && (
              <SettlementCard
                title={titleOf(current)}
                place={placeOf(current)}
                attendCount={current.shares.length}
                statusLabel="진행중"
                unpaidCount={current.shares.filter((s) => !s.paid).length}
                pct={current.shares.length ? current.shares.filter((s) => s.paid).length / current.shares.length : 0}
                amount={current.totalAmount}
                perPerson={current.perPerson}
                onPress={() => setDetailTarget('current')}
                onPrimaryAction={() => setSendOpen(true)}
                onShare={() => handleShare(current)}
              />
            )}

            {(tab === 'all' || tab === 'done') &&
              past.map((s) => (
                <SettlementCard
                  key={s.id}
                  title={titleOf(s)}
                  place={placeOf(s)}
                  attendCount={s.shares.length}
                  statusLabel="완료"
                  unpaidCount={0}
                  pct={1}
                  amount={s.totalAmount}
                  perPerson={s.perPerson}
                  onPress={() => setDetailTarget(s.id)}
                  onPrimaryAction={() => s.accountNo && copyAccount(s.accountNo)}
                  onShare={() => handleShare(s)}
                />
              ))}

            {countOf[tab] === 0 && <Text style={styles.tabEmpty}>{TAB_EMPTY[tab]}</Text>}
          </ScrollView>

        </View>
      )}

      {/* 상세 모달 — current는 입금 확인/독촉 등 총무 액션이 있고, 지난 정산은 조회만 된다 */}
      <SettlementDetailModal
        visible={!!detailSettlement}
        settlement={detailSettlement}
        isCurrent={isDetailCurrent}
        isAdmin={!!isAdmin}
        copied={copied}
        selectedShareIds={selectedShareIds}
        reminded={reminded}
        sentVia={isDetailCurrent ? sentVia : null}
        nameFor={nameFor}
        onClose={() => setDetailTarget(null)}
        onCopyAccount={(no) => copyAccount(no)}
        onToggleSelectShare={toggleSelectShare}
        onConfirmSelected={confirmSelected}
        onMarkPaid={(id, on) => markPaid(id, on)}
        onSendMoney={() => setSendOpen(true)}
        onRemindUnpaid={() => current && remindUnpaid(current)}
        onComplete={() => current && completeSettlement(current.id)}
        onConfirmSentVia={(id) => {
          markPaid(id, true);
          setSentVia(null);
        }}
        onRefresh={reloadSettlements}
        refreshing={loading}
        onUpdateDetails={(patch) => {
          if (!current) return;
          updateDetails(current.id, patch).catch((e) => showError(e?.message ?? '저장하지 못했어요'));
        }}
        onExemptShare={(shareId) => {
          if (!current) return;
          // "이미 입금 확인된 사람" 같은 거절 사유는 사용자에게 보여야 한다 — 조용히 삼키면 안 눌린 걸로 보인다
          exemptShare(current.id, shareId).catch((e) => showError(e?.message ?? '제외하지 못했어요'));
        }}
      />

      <SendMoneySheet
        visible={sendOpen}
        onClose={() => setSendOpen(false)}
        bankName={current?.bankName ?? ''}
        accountNo={current?.accountNo ?? ''}
        holder={current?.accountHolder ?? ''}
        amount={current?.shares.find((s) => s.isMe)?.amount ?? 0}
        onCopied={() => setCopied(true)}
        onOpened={(appName) => setPendingReturn(appName)}
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
        attendees={settleCandidates}
        onSkip={
          isAdmin && createSheetMatch
            ? () => {
                const id = createSheetMatch.id;
                setCreateSheetMatchId(null);
                handleSkip(id);
              }
            : undefined
        }
        account={{
          bank: (latestAccount ?? accountDraft).bankName,
          no: (latestAccount ?? accountDraft).accountNo,
          holder: (latestAccount ?? accountDraft).accountHolder,
        }}
        onSubmit={({ total, targetIds, memo, dueDate }) => {
          if (!createSheetMatch || !activeTeam) return;
          const account = latestAccount ?? accountDraft;
          if (!isAccountComplete(account)) return;
          // 시트가 보여준 후보와 반드시 같은 목록이어야 한다 — 따로 계산하면 면제 처리가 어긋난다
          const allAttendeeIds = settleCandidates.map((c) => c.id);
          createSettlement({
            matchId: createSheetMatch.id,
            teamId: activeTeam.team.id,
            totalAmount: total,
            targets: allAttendeeIds.map((id) => ({ teamMemberId: id })),
            exemptIds: allAttendeeIds.filter((id) => !targetIds.includes(id)),
            memo: memo || undefined,
            dueDate,
            account: { bankName: account.bankName, accountNo: account.accountNo, accountHolder: account.accountHolder },
            createdBy: activeTeam.membershipId,
          })
            // 만들자마자 링크 공유 화면으로 — Reference 총무②→④ 순서.
            // create()가 끝나면 store의 load()도 끝나 current가 방금 만든 정산이다.
            .then(() => setShareLinkOpen(true))
            .catch((e) => showError(e?.message ?? '정산을 만들지 못했어요'));
        }}
      />

      {/* 총무④ — 만든 직후 링크 공유 */}
      <ShareLinkSheet
        visible={shareLinkOpen && !!current}
        onClose={() => setShareLinkOpen(false)}
        link={current ? settlementLink(current.id) : ''}
        message={current ? settlementShareMessage(current, titleOf(current)) : ''}
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

/** "계좌 관리" 탭 — 팀이 정산에 쓰는 계좌 하나를 등록/수정한다 (team_settings에 저장) */
function AccountManageTab({
  isAdmin,
  account,
  onSave,
}: {
  isAdmin: boolean;
  account: AccountDraft | null;
  onSave: (draft: AccountDraft) => Promise<void>;
}) {
  const bottomPad = useTabBarPadding();
  const [editing, setEditing] = useState(!account);
  const [draft, setDraft] = useState<AccountDraft>(account ?? EMPTY_ACCOUNT);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(account ?? EMPTY_ACCOUNT);
  }, [account, editing]);

  const isComplete = !!draft.bankName.trim() && !!draft.accountNo.trim() && !!draft.accountHolder.trim();

  const handleSave = async () => {
    if (!isComplete) return;
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.list, { paddingBottom: bottomPad }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.accountSectionLabel}>입금 받을 계좌</Text>

      {!editing && account ? (
        <View style={styles.accountManageCard}>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={styles.accountManageBank}>
              {account.bankName} {account.accountNo}
            </Text>
            <Text style={styles.accountManageHolder}>{account.accountHolder}</Text>
          </View>
          {isAdmin && (
            <Pressable onPress={() => setEditing(true)} hitSlop={8}>
              <Text style={styles.accountEditLink}>변경</Text>
            </Pressable>
          )}
        </View>
      ) : isAdmin ? (
        <View style={styles.accountEditCard}>
          <BankPicker value={draft.bankName} onChange={(name) => setDraft((p) => ({ ...p, bankName: name }))} />
          <TextInput
            style={styles.input}
            placeholder="계좌번호"
            placeholderTextColor={colors.placeholder}
            keyboardType="number-pad"
            value={draft.accountNo}
            onChangeText={(t) => setDraft((p) => ({ ...p, accountNo: t }))}
          />
          <TextInput
            style={styles.input}
            placeholder="예금주"
            placeholderTextColor={colors.placeholder}
            value={draft.accountHolder}
            onChangeText={(t) => setDraft((p) => ({ ...p, accountHolder: t }))}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {!!account && (
              <Pressable
                onPress={() => setEditing(false)}
                style={({ pressed }) => [styles.accountCancelBtn, pressed && styles.pressed]}
              >
                <Text style={styles.accountCancelText}>취소</Text>
              </Pressable>
            )}
            <Pressable
              onPress={handleSave}
              disabled={!isComplete || saving}
              style={({ pressed }) => [
                styles.accountSaveBtn,
                (!isComplete || saving) && { opacity: 0.5 },
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.accountSaveText}>{saving ? '저장 중…' : '저장'}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Text style={styles.tabEmpty}>아직 등록된 계좌가 없어요</Text>
      )}

      <View style={styles.accountNotice}>
        <Text style={styles.accountNoticeText}>· 정산을 만들면 이 계좌로 송금 링크가 생성돼요</Text>
        <Text style={styles.accountNoticeText}>· 총무 본인 명의의 계좌를 등록해주세요</Text>
      </View>
    </ScrollView>
  );
}

interface SettlementDetailModalProps {
  visible: boolean;
  settlement: Settlement | null;
  isCurrent: boolean;
  isAdmin: boolean;
  copied: boolean;
  selectedShareIds: Record<string, boolean>;
  reminded: boolean;
  sentVia: string | null;
  nameFor: (id: string | null) => string;
  onClose: () => void;
  onCopyAccount: (accountNo: string) => void;
  onToggleSelectShare: (id: string) => void;
  onConfirmSelected: () => void;
  onMarkPaid: (shareId: string, on: boolean) => void;
  onSendMoney: () => void;
  onRemindUnpaid: () => void;
  onComplete: () => void;
  onConfirmSentVia: (shareId: string) => void;
  /** 「현황 새로고침」 — 실시간 구독이 끊겼을 때 총무가 직접 당겨온다 */
  onRefresh: () => void;
  refreshing: boolean;
  /** 상세 설정 — 납부 기한·메모 (생성 화면에서 옮겨온 항목) */
  onUpdateDetails: (patch: { memo?: string | null; dueDate?: string | null }) => void;
  /** 상세 설정 — 정산 대상에서 제외 */
  onExemptShare: (shareId: string) => void;
}

/** 정산 상세 — current는 입금 확인/독촉/완료 처리가 있고, 지난 정산은 조회만 된다 */
function SettlementDetailModal({
  visible,
  settlement,
  isCurrent,
  isAdmin,
  copied,
  selectedShareIds,
  reminded,
  sentVia,
  nameFor,
  onClose,
  onCopyAccount,
  onToggleSelectShare,
  onConfirmSelected,
  onMarkPaid,
  onSendMoney,
  onRemindUnpaid,
  onComplete,
  onConfirmSentVia,
  onRefresh,
  refreshing,
  onUpdateDetails,
  onExemptShare,
}: SettlementDetailModalProps) {
  if (!settlement) return null;

  const paidCount = settlement.shares.filter((s) => s.paid).length;
  const unpaidShares = settlement.shares.filter((s) => !s.paid);
  const myShare = settlement.shares.find((s) => s.isMe);
  const selectedIds = unpaidShares.map((s) => s.id).filter((id) => selectedShareIds[id]);
  const allPaid = settlement.shares.length > 0 && paidCount === settlement.shares.length;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={[styles.sheet, styles.detailSheet]}>
          <View style={styles.handle} />
          <View style={styles.detailHead}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {settlement.memo || '정산 상세'}
              </Text>
              <Text style={styles.cardSub}>
                참석 {settlement.shares.length}명 · 1인당 {settlement.perPerson.toLocaleString()}원
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.close}>닫기</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ gap: 14 }} showsVerticalScrollIndicator={false}>
            {/* Reference 「팀원③ 정산 내역」 — 내 금액 앞에 전체 그림을 먼저 보여준다.
                얼마를 왜 내는지 모르는 채로 금액만 보면 따질 방법이 없다. */}
            {isCurrent && myShare && (
              <SummaryBox>
                <SummaryRow label="총 정산 금액" value={`${settlement.totalAmount.toLocaleString()}원`} />
                <SummaryRow label="1인당 금액" value={`${settlement.perPerson.toLocaleString()}원`} />
                <SummaryRow label="참여 인원" value={`${settlement.shares.length}명`} />
                <SummaryRow label="본인 이름" value={myShare.guestName ?? nameFor(myShare.teamMemberId)} />
              </SummaryBox>
            )}

            {isCurrent && myShare && (!isAdmin || !myShare.paid) && (
              <View style={styles.myDue}>
                <Text style={styles.myDueLabel}>{myShare.paid ? '입금 완료' : '내 정산 금액'}</Text>
                <View style={styles.myDueRow}>
                  <Text style={[styles.myDueAmount, myShare.paid && styles.myDuePaid]}>
                    {myShare.amount.toLocaleString()}
                  </Text>
                  <Text style={styles.myDueUnit}>원</Text>
                </View>

                {!!sentVia && !myShare.markedPaid && (
                  <View style={styles.returnRow}>
                    <Text style={styles.returnText}>{sentVia}에서 송금을 마치셨나요?</Text>
                    <Pressable
                      onPress={() => onConfirmSentVia(myShare.id)}
                      style={({ pressed }) => [styles.returnBtn, pressed && styles.pressed]}
                    >
                      <Text style={styles.returnBtnText}>네, 보냈어요</Text>
                    </Pressable>
                  </View>
                )}

                {!myShare.paid && (
                  <Pressable onPress={onSendMoney} style={({ pressed }) => [styles.sendBtn, pressed && styles.pressed]}>
                    <Ionicons name="arrow-forward" size={16} color={colors.bgRoot} />
                    <Text style={styles.sendText}>송금하기</Text>
                  </Pressable>
                )}

                <Pressable
                  onPress={() => onMarkPaid(myShare.id, !myShare.markedPaid)}
                  style={({ pressed }) => [styles.paidBtn, myShare.markedPaid && styles.paidBtnDone, pressed && styles.pressed]}
                >
                  <Text style={[styles.paidText, myShare.markedPaid && { color: colors.green }]}>
                    {myShare.markedPaid ? '입금했어요 · 총무 확인 대기' : '입금했어요'}
                  </Text>
                </Pressable>
              </View>
            )}

            <Pressable
              onPress={() => settlement.accountNo && onCopyAccount(settlement.accountNo)}
              style={({ pressed }) => [styles.accountBox, pressed && styles.pressed]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.accountLabel}>입금 계좌</Text>
                <Text style={styles.accountText}>
                  {settlement.bankName} {settlement.accountNo}
                </Text>
                <Text style={styles.accountHolder}>예금주 {settlement.accountHolder}</Text>
              </View>
              <View style={[styles.copyBtn, copied && styles.copyBtnDone]}>
                <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={13} color={copied ? colors.green : colors.bgRoot} />
                <Text style={[styles.copyText, copied && { color: colors.green }]}>{copied ? '복사됨' : '복사'}</Text>
              </View>
            </Pressable>

            {/* Reference 「팀원⑤ 정산 완료」 — 보냈다고 알린 직후의 확인 화면 */}
            {isCurrent && !isAdmin && myShare?.markedPaid && !myShare.paid && (
              <SettlementDonePanel
                title="입금을 알렸어요"
                sub="총무가 확인하면 완료로 바뀝니다"
                rows={[
                  { label: '정산 금액', value: `${myShare.amount.toLocaleString()}원` },
                  { label: '보낸 시간', value: sentAtLabel(myShare.markedPaidAt) },
                ]}
                actionLabel="확인"
                onAction={onClose}
              />
            )}

            {/* Reference 「총무⑥ 정산 완료」 — 전원이 완료됐을 때 */}
            {isAdmin && allPaid && (
              <SettlementDonePanel
                title="모든 팀원의 정산이 완료되었습니다!"
                rows={[
                  { label: '총 정산 금액', value: `${settlement.totalAmount.toLocaleString()}원` },
                  { label: '1인당 금액', value: `${settlement.perPerson.toLocaleString()}원` },
                  { label: '참여 인원', value: `${settlement.shares.length}명` },
                  { label: '완료 인원', value: `${paidCount}명` },
                ]}
                actionLabel={isCurrent ? '정산 완료 처리' : undefined}
                onAction={isCurrent ? onComplete : undefined}
              />
            )}

            {/* Reference 「총무⑤ 정산 진행 현황」 — 완료/미완료를 갈라서 보여준다 */}
            {!allPaid && (
              <SettlementProgressPanel
                shares={settlement.shares}
                totalAmount={settlement.totalAmount}
                perPerson={settlement.perPerson}
                nameFor={(s) => s.guestName ?? nameFor(s.teamMemberId)}
                isAdmin={isAdmin && isCurrent}
                selectedIds={selectedShareIds}
                onToggleSelect={onToggleSelectShare}
                onRefresh={onRefresh}
                refreshing={refreshing}
              />
            )}

            {isCurrent && isAdmin && selectedIds.length > 0 && (
              <Pressable onPress={onConfirmSelected} style={({ pressed }) => [styles.bulkBtn, pressed && styles.pressed]}>
                <Text style={styles.bulkText}>{selectedIds.length}명 입금 확인</Text>
              </Pressable>
            )}

            {/* 생성 화면(Reference)에서 걷어낸 납부 기한·메모·면제가 여기로 왔다 */}
            {isCurrent && isAdmin && (
              <SettlementDetailSettings
                settlement={settlement}
                nameFor={nameFor}
                onUpdate={onUpdateDetails}
                onExempt={onExemptShare}
              />
            )}

            {/* 완료 처리 버튼은 위 완료 패널이 들고 있다 — 여기선 아직 안 낸 사람 독촉만 */}
            {isCurrent && isAdmin && !allPaid && unpaidShares.length > 0 && (
              <Pressable
                onPress={onRemindUnpaid}
                style={({ pressed }) => [styles.remindBtn, reminded && styles.remindBtnDone, pressed && styles.pressed]}
              >
                <Text style={[styles.remindText, reminded && { color: colors.green }]}>
                  {reminded ? '독촉 알림을 보냈어요' : `미입금 ${unpaidShares.length}명에게 알림`}
                </Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 20, paddingTop: 4, gap: 12 },
  pressed: { opacity: 0.85 },
  errorText: { color: colors.danger, textAlign: 'center', marginBottom: 8, paddingHorizontal: 20 },

  // ── 전체/진행중/완료 탭 ───────────────────────────────────
  segment: {
    flexDirection: 'row',
    gap: 6,
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: 12,
    padding: 4,
    borderRadius: radius.button,
    backgroundColor: '#0E1512',
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 11,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  segmentItemOn: { backgroundColor: '#1B2A22', borderColor: colors.greenDeep },
  segmentText: { color: '#7C8A85', fontSize: 12.5, fontWeight: '800' },
  segmentTextOn: { color: colors.green },
  tabEmpty: { color: colors.textFaint, fontSize: 12.5, fontWeight: '600', textAlign: 'center', paddingVertical: 32 },

  // ── 전체/진행중/완료 필터 칩 (활성만 알약, 나머진 텍스트) ──
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: 12,
  },
  tabChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  tabChipOn: { backgroundColor: colors.green },
  tabChipText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  tabChipTextOn: { color: colors.bgRoot, fontWeight: '800' },
  tabFilterBtn: {
    marginLeft: 'auto',
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: '#26332D',
  },

  // 진행중/완료 카드 자체 스타일은 components/SettlementCard.tsx로 옮겼다 (홈 화면과 공용).

  // ── 시트 공통 ─────────────────────────────────────────────
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' },
  sheet: {
    maxHeight: '86%',
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderColor: colors.border,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 26,
    gap: 14,
  },
  handle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: '#2C3833', marginBottom: 4 },
  close: { color: colors.textDim, fontSize: 13, fontWeight: '700' },

  // 상세 모달
  detailSheet: { gap: 10 },
  detailHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  cardSub: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },

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

  returnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.greenDeep,
    backgroundColor: colors.greenTint,
  },
  returnText: { flex: 1, color: colors.textBody, fontSize: 12, fontWeight: '700' },
  returnBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.green,
  },
  returnBtnText: { color: colors.bgRoot, fontSize: 12, fontWeight: '800' },

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


  bulkBtn: { marginLeft: 'auto', paddingHorizontal: 13, paddingVertical: 9, borderRadius: 999, backgroundColor: colors.green },
  bulkText: { color: colors.bgRoot, fontSize: 11.5, fontWeight: '800' },



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

  // ── 계좌 관리 탭 ──────────────────────────────────────────
  accountSectionLabel: { color: colors.textDim, fontSize: 12, fontWeight: '700', marginBottom: 8 },
  accountManageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  accountManageBank: { color: colors.text, fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  accountManageHolder: { color: colors.textMuted, fontSize: 12.5, fontWeight: '600' },
  accountEditLink: { color: colors.green, fontSize: 12.5, fontWeight: '800' },
  accountEditCard: {
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  accountCancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: '#26332D',
  },
  accountCancelText: { color: colors.textMuted, fontSize: 13.5, fontWeight: '800' },
  accountSaveBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.green,
  },
  accountSaveText: { color: colors.bgRoot, fontSize: 13.5, fontWeight: '800' },
  accountNotice: { marginTop: 16, gap: 4, paddingHorizontal: 4 },
  accountNoticeText: { color: colors.textFaint, fontSize: 11.5, fontWeight: '600' },
});
