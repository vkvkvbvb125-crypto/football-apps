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
  Linking,
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
import { font, radius, shadow, type Palette } from '../../../theme';
import { useThemed } from '../../../lib/useThemed';
import { useTeamStore } from '../../team/stores/teamStore';
import { useAttendanceStore } from '../../attendance/stores/attendanceStore';
import { useSettlementStore, type Settlement } from '../stores/settlementStore';
import { settlementTitle, settlementPlace } from '../utils';
import { shareSettlement, settlementLink, settlementShareMessage } from '../links';
import { useSettlementRealtime } from '../hooks/useSettlementRealtime';
import { fetchTeamSettings, upsertTeamSettings } from '../../team/services/teamSettingsService';
import { notifyTeam } from '../../notifications/services/pushService';
import { remindMessage, type RemindMessage } from '../../notifications/remindMessage';
import { BankPicker } from '../components/BankPicker';
import { SendMoneySheet, getRememberedSendApp } from '../components/SendMoneySheet';
import { SEND_APPS, directSend } from '../sendApps';
import { SettlementCard } from '../components/SettlementCard';
import { CreateSettlementSheet } from '../components/CreateSettlementSheet';
import { SettleTargetsSheet } from '../components/SettleTargetsSheet';
import { isAccountComplete as accountComplete } from '../account';
import { SettlementDetailSettings } from '../components/SettlementDetailSettings';
import { ShareLinkSheet } from '../components/ShareLinkSheet';
import { SettlementEmpty } from '../components/SettlementEmpty';
import { SettlementProgressPanel } from '../components/SettlementProgressPanel';
import { DetailBreakdown, MyDueRow, SettlementDonePanel, SummaryBox, SummaryRow } from '../components/SettlementSummary';
import { GreenFill } from '../../../components/Surface';
import { toUserMessage } from '../../../lib/dbError';
import { useTourTarget } from '../../tour/TourProvider';

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

export function SettlementScreen({ navigation, route }: BottomTabScreenProps<any>) {
  const { colors, styles } = useThemed(makeStyles);
  const bottomPad = useTabBarPadding();
  const activeTeam = useTeamStore((s) => s.activeTeam);
  const members = useTeamStore((s) => s.members);
  const memberNames = useTeamStore((s) => s.memberNames);
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
  /* 독촉 결과 한 줄. null이면 아직 안 눌렀다는 뜻이다 */
  const [remindNote, setRemindNote] = useState<RemindMessage | null>(null);
  const [reminding, setReminding] = useState(false);
  /** 상세 모달로 열려 있는 정산 — 'current' 또는 지난 정산의 id */
  const [detailTarget, setDetailTarget] = useState<'current' | string | null>(null);
  /** 송금 앱으로 나간 뒤 돌아오면 여기에 앱 이름이 담긴다 — 입금 확인을 한 번 물어보려고 */
  const [sentVia, setSentVia] = useState<string | null>(null);
  const [pendingReturn, setPendingReturn] = useState<string | null>(null);
  /** 기억해 둔 송금 앱 이름 — 버튼에 박아서 어디로 나가는지 누르기 전에 보이게 한다 */
  const [sendAppName, setSendAppName] = useState<string | null>(null);

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

  // 시트가 닫힐 때도 다시 읽는다 — 거기서 앱을 바꾸거나 기억을 껐을 수 있다.
  useEffect(() => {
    let cancelled = false;
    getRememberedSendApp().then((id) => {
      if (!cancelled) setSendAppName(SEND_APPS.find((a) => a.id === id)?.name ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [sendOpen]);

  /**
   * 송금 버튼. 기억해 둔 앱이 있으면 선택 시트를 건너뛰고 곧장 그 앱을 연다.
   *
   * 시트에 「다음부터 이 앱으로 바로 열기」가 있는데 정작 여기서 항상 시트를 띄우고 있었다 —
   * 체크해도 매번 같은 시트를 한 번 더 지나야 했으니 약속이 지켜지지 않았다.
   * 열 수 없으면(앱 삭제·스킴 변경) 조용히 시트로 떨어뜨려 계좌 복사까지 갈 길을 남긴다.
   */
  const openSendMoney = useCallback(async () => {
    const target = directSend(await getRememberedSendApp(), {
      bankName: current?.bankName,
      accountNo: current?.accountNo,
      amount: current?.shares.find((s) => s.isMe)?.amount ?? 0,
    });
    if (!target) return setSendOpen(true);
    try {
      if (!(await Linking.canOpenURL(target.url))) return setSendOpen(true);
      await Linking.openURL(target.url);
      setPendingReturn(target.app.name);
    } catch {
      setSendOpen(true);
    }
  }, [current]);

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

  /*
    ⚠ **이름은 memberNames에서 찾는다. members에는 나간 사람이 없다.**
      정산 몫은 나간 뒤에도 남아서(소프트 삭제), members로 찾으면 폴백 「멤버」가 뜬다 —
      **총무가 누가 안 냈는지 알 수 없게 된다.** 2026-09-18에 기기에서 그 화면을 봤다.
      합계는 멀쩡했다(20,000원·1명 미납). 금액은 남고 사람만 지워진 모양이었다.
  */
  const nameFor = (teamMemberId: string | null) =>
    (teamMemberId ? memberNames.get(teamMemberId) : undefined) ?? '멤버';
  // 판정은 account.ts가 갖는다 — 시트의 버튼 활성 조건과 반드시 같아야 한다
  const isAccountComplete = (a: AccountDraft) =>
    accountComplete({ bank: a.bankName, no: a.accountNo, holder: a.accountHolder });

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

  /*
    ⚠ **전에 이 함수는 결과를 통째로 버렸다.** `.catch(() => {})`라 실패해도 아무 말이
      없었고, 성공 여부와 무관하게 `setReminded(true)`로 2초 동안 「보냈어요」가 떴다.
      즉 **안 갔는데 갔다고 보이는** 상태가 이미 있었다 — 서버 쿨다운을 붙이면
      그게 일상이 된다(막힌 만큼 매번 안 간다).

    ⚠ 그래서 이 작업의 본체는 막는 것이 아니라 **막았다고 말하는 것**이다.
      `reminded` 불리언을 걷어내고 문구를 담는 자리로 바꾼다. 성공·부분 차단·전면 차단·
      실패가 전부 같은 자리에 뜬다.
  */
  const remindUnpaid = async (s: Settlement) => {
    if (!activeTeam) return;
    const unpaidUserIds = s.shares
      .filter((sh) => !sh.paid && sh.teamMemberId)
      /*
        ⚠ **푸시 대상은 members(현재 멤버)에서 찾는다 — 여기서는 memberNames를 쓰면 안 된다.**
          팀을 떠난 사람에게 독촉 알림이 가는 것은 과하다. 총무 화면에는 이름이 보이되
          (nameFor는 memberNames를 쓴다) 푸시 대상에서는 빠지는 것이 맞다.
          members에 없으면 userId가 undefined가 되고 아래 filter가 걸러 낸다 —
          **결과는 전과 같지만 이제 의도한 것이다.** 전에는 우연히 그랬다(2026-09-18).
      */
      .map((sh) => members.find((m) => m.id === sh.teamMemberId)?.userId)
      .filter((id): id is string => !!id);
    if (unpaidUserIds.length === 0) return;
    setRemindNote(null);
    setReminding(true);
    try {
      const r = await notifyTeam(
        activeTeam.team.id,
        `${activeTeam.team.name} 회비 독촉`,
        '아직 회비를 입금하지 않으셨어요',
        undefined,
        unpaidUserIds,
        'settlement',
        { settlementId: s.id }
      );
      setRemindNote(remindMessage(r));
    } catch (e) {
      /*
        ⚠ 삼키지 않는다. 조용히 넘어가면 「눌렀는데 아무 일도 안 난다」가 된다.
        ⚠ 다만 **오류 원문을 그대로 쓰지 않는다.** usererror.check가 이 화면을 그 목록에
          두고 있다 — 서버 문구는 사용자에게 아무 뜻이 없고 때로 내부를 드러낸다.
          원인은 로그로 남기고 화면에는 할 일을 적는다.
      */
      console.warn('[remindUnpaid]', e);
      setRemindNote({ tone: 'none', text: '독촉을 보내지 못했어요. 잠시 뒤 다시 시도해 주세요' });
    }
    setReminding(false);
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
  /*
   * 정산 시트와 「참석자 N명」 미리보기가 반드시 같은 목록을 봐야 한다 —
   * 따로 계산하면 미리보기에서 본 사람과 실제로 청구되는 사람이 갈린다.
   */
  const candidatesFor = useCallback(
    (match: (typeof matches)[number] | null | undefined) => {
      if (!match) return { list: [] as { id: string; name: string }[], fromAllMembers: false };
      const voted = match.votes.filter((v) => v.status === 'attend').map((v) => v.team_member_id);
      const fromAllMembers = voted.length === 0;
      const ids = fromAllMembers ? members.map((m) => m.id) : voted;
      return {
        list: ids.map((id) => ({ id, name: nameFor(id) })),
        fromAllMembers,
      };
    },
    [members]
  );

  const settleCandidates = useMemo(() => candidatesFor(createSheetMatch).list, [candidatesFor, createSheetMatch]);

  const [targetsMatchId, setTargetsMatchId] = useState<string | null>(null);
  const targetsMatch = useMemo(
    () => (targetsMatchId ? matches.find((m) => m.id === targetsMatchId) ?? null : null),
    [targetsMatchId, matches]
  );
  const targetsView = useMemo(() => candidatesFor(targetsMatch), [candidatesFor, targetsMatch]);

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
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
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
          {/* 총무에게만 「할 일」이 간다 — 정산을 만드는 것은 총무이고,
              그 앞 단계가 경기다. 경기가 없으면 정산도 있을 수 없다 */}
          <SettlementEmpty isAdmin={!!isAdmin} onGoSchedule={() => navigation.navigate('Attendance')} />
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
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
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
                  // 정산이 없으니 정산 상세도 없다 — 대신 "누구한테 나뉘나"를 미리 본다
                  onOpenTargets={() => setTargetsMatchId(m.matchId)}
                  targetCount={m.attendCount}
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
                onPrimaryAction={openSendMoney}
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
        title={detailSettlement ? titleOf(detailSettlement) : ''}
        sendAppName={sendAppName}
        isCurrent={isDetailCurrent}
        isAdmin={!!isAdmin}
        copied={copied}
        selectedShareIds={selectedShareIds}
        remindNote={remindNote}
        reminding={reminding}
        sentVia={isDetailCurrent ? sentVia : null}
        nameFor={nameFor}
        onClose={() => setDetailTarget(null)}
        onCopyAccount={(no) => copyAccount(no)}
        onToggleSelectShare={toggleSelectShare}
        onConfirmSelected={confirmSelected}
        onMarkPaid={(id, on) => markPaid(id, on)}
        onSendMoney={openSendMoney}
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
          updateDetails(current.id, patch).catch((e) => showError(toUserMessage(e, {}, 'updateDetails')));
        }}
        onExemptShare={(shareId) => {
          if (!current) return;
          // "이미 입금 확인된 사람" 같은 거절 사유는 사용자에게 보여야 한다 — 조용히 삼키면 안 눌린 걸로 보인다
          /*
            ⚠ 실패하면 **목록을 다시 읽는다.** 낙관적 잠금에 걸렸다는 건 내 화면의
              금액이 낡았다는 뜻이라, 문구만 띄우면 같은 낡은 값으로 또 누르게 된다.
              문구가 「다시 해주세요」인데 그냥 다시 하면 또 걸리는 상태를 만들지 않는다.
              23505(정산 중복)도 같은 모양이다.
          */
          exemptShare(current.id, shareId).catch((e) => {
            showError(toUserMessage(e, {}, 'exemptShare'));
            reloadSettlements();
          });
        }}
      />

      {/*
        카톡 링크로 막 들어온 순간 — 목록이 아직 안 왔으면 상세 모달은 null을 돌려주므로
        받은 사람은 자기가 누른 링크와 상관없어 보이는 정산 목록을 먼저 본다.
        불러오는 중인지, 못 찾은 건지를 그 자리에서 말해준다.
      */}
      <Modal
        visible={!!detailTarget && !detailSettlement}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailTarget(null)}
      >
        <View style={styles.linkStatusOverlay}>
          <View style={styles.linkStatus}>
            {!loaded ? (
              <>
                <ActivityIndicator color={colors.green} />
                <Text style={styles.linkStatusText}>정산 내역을 불러오는 중이에요</Text>
                {/*
                  불러오는 동안에도 나갈 길을 준다.
                
                  이 모달은 앱에서 유일하게 출구가 하드웨어 뒤로가기뿐이었다. 감싼 것이
                  Pressable이 아니라 View라 스크림 탭이 안 되고, 「확인」은 loaded 뒤에만
                  생긴다. 조회가 오래 걸리거나 매달리면 기다리는 것 말고 할 수 있는 게
                  없다 — 뒤로가기를 모르는 사용자는 갇힌다.
                */}
                <Pressable
                  onPress={() => setDetailTarget(null)}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.linkStatusBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.linkStatusBtnText}>닫기</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.linkStatusTitle}>정산을 찾을 수 없어요</Text>
                <Text style={styles.linkStatusText}>이미 완료됐거나 다른 팀의 정산일 수 있어요</Text>
                <Pressable
                  onPress={() => setDetailTarget(null)}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.linkStatusBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.linkStatusBtnText}>확인</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>

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

      <SettleTargetsSheet
        visible={!!targetsMatch}
        onClose={() => setTargetsMatchId(null)}
        matchLabel={
          targetsMatch
            ? `${new Date(targetsMatch.match_date).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} 경기`
            : ''
        }
        targets={targetsView.list}
        fromAllMembers={targetsView.fromAllMembers}
        onCreate={
          isAdmin && targetsMatch
            ? () => {
                const id = targetsMatch.id;
                setTargetsMatchId(null);
                setCreateSheetMatchId(id);
              }
            : undefined
        }
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
        onEditAccount={() => {
          setCreateSheetMatchId(null);
          setOuterTab('account');
        }}
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
            /*
              같은 경기로 정산을 두 번 만들면 23505다 — 그 자리에서만 뜻이 있는 말이라
              known으로 준다. 제약은 DB에 있다(20260727 리디자인의 `unique (match_id)`).

              ⚠ **목록을 다시 읽는다.** 이 오류가 났다는 건 내 화면의 「미등록」 카드가
                낡았다는 뜻이다 — 다른 총무가 만들었거나, 내가 연타했거나.
                문구만 띄우고 말면 그 카드가 그대로 남아서 또 누르게 된다.

              ⚠ **그 정산을 강제로 열지는 않는다.** 방금 실패한 동작 위에 새 화면을
                얹으면 「내가 만든 건가?」가 된다. 목록이 스스로 고쳐져서 그 경기가
                「미등록」에서 「진행중」으로 옮겨 가는 것이 이미 답이다.
            */
            .catch((e) => {
              showError(toUserMessage(e, { '23505': '이 경기는 이미 정산이 있어요' }, 'createSettlement'));
              reloadSettlements();
            });
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
            <Pressable
              onPress={() => setCreateSheetMatchId(null)}
              accessibilityRole="button"
              /* 안의 글자가 안내문이라 그대로 읽으면 「무엇을 누르는지」가 안 나온다 */
              accessibilityLabel="닫기"
              style={styles.accountModalClose}
            >
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
  const { colors, styles } = useThemed(makeStyles);
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
          <View style={{ flex: 1, gap: 4 }}>
            <Text selectable style={styles.accountManageBank}>
              {account.bankName} {account.accountNo}
            </Text>
            <Text style={styles.accountManageHolder}>{account.accountHolder}</Text>
          </View>
          {isAdmin && (
            <Pressable onPress={() => setEditing(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel="계좌 변경">
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
                accessibilityRole="button"
                style={({ pressed }) => [styles.accountCancelBtn, pressed && styles.pressed]}
              >
                <Text style={styles.accountCancelText}>취소</Text>
              </Pressable>
            )}
            <Pressable
              onPress={handleSave}
              disabled={!isComplete || saving}
              accessibilityRole="button"
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
  /** 경기 제목 — 카드와 같은 규칙(utils.settlementTitle). 어느 경기의 정산인지 알려준다 */
  title: string;
  /** 기억해 둔 송금 앱 이름. 없으면 버튼은 앱 선택 시트를 연다 */
  sendAppName: string | null;
  isCurrent: boolean;
  isAdmin: boolean;
  copied: boolean;
  selectedShareIds: Record<string, boolean>;
  remindNote: RemindMessage | null;
  reminding: boolean;
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
  title,
  sendAppName,
  isCurrent,
  isAdmin,
  copied,
  selectedShareIds,
  remindNote,
  reminding,
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
  /* 튜토리얼이 짚는 자리 — 팀원 코스의 마지막이자 제일 중요한 단계 */
  const paidTourRef = useTourTarget('settlement.markPaid');
  const { colors, styles } = useThemed(makeStyles);
  if (!settlement) return null;

  const paidCount = settlement.shares.filter((s) => s.paid).length;
  const unpaidShares = settlement.shares.filter((s) => !s.paid);
  const myShare = settlement.shares.find((s) => s.isMe);
  const selectedIds = unpaidShares.map((s) => s.id).filter((id) => selectedShareIds[id]);
  const allPaid = settlement.shares.length > 0 && paidCount === settlement.shares.length;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        {/* 시트 밖을 눌러 닫는 자리 */}
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityRole="button" accessibilityLabel="닫기" />
        <View style={[styles.sheet, styles.detailSheet]}>
          <View style={styles.handle} />
          <View style={styles.detailHead}>
            <View style={{ flex: 1, gap: 4 }}>
              {/* memo는 총무가 남기는 선택 메모다 — 제목 자리에 두면 카톡으로 들어온 사람이
                  어느 경기인지 알 수 없다. 카드와 같은 규칙의 경기 제목을 먼저 보여준다. */}
              <Text style={styles.cardTitle} numberOfLines={1}>
                {title || settlement.memo || '정산 상세'}
              </Text>
              <Text style={styles.cardSub}>
                참석 {settlement.shares.length}명 · 1인당 {settlement.perPerson.toLocaleString()}원
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={16} accessibilityRole="button" accessibilityLabel="정산 상세 닫기">
              <Text style={styles.close}>닫기</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ gap: 14 }} showsVerticalScrollIndicator={false}>
            {/*
              카톡 링크로 들어온 사람이 알고 싶은 건 딱 하나 — 얼마를 내야 하는가.
              전에는 이 숫자 위에 4행짜리 요약표가 먼저 있어서, 정작 핵심 숫자가 두 번째 블록으로
              밀렸다(1인당 금액은 헤더·요약표·여기까지 세 번 나왔다). 순서를 뒤집는다.

              요약표를 없애지는 않았다 — 「얼마를 왜 내는지 모르는 채로 금액만 보면 따질 방법이 없다」는
              Reference 「팀원③ 정산 내역」의 이유는 그대로 유효하다. 근거를 지우는 게 아니라 숫자 뒤로 옮긴다.
            */}
            {isCurrent && myShare && (!isAdmin || !myShare.paid) && (
              <View style={styles.myDue}>
                <Text style={styles.myDueLabel}>{myShare.paid ? '입금 완료' : '내 정산 금액'}</Text>
                <View style={styles.myDueRow}>
                  {/* 복사 버튼을 따로 붙일 만큼 옮겨적을 일이 잦은 값이다 — 길게 눌러 선택되게 둔다 */}
                  <Text selectable style={[styles.myDueAmount, myShare.paid && styles.myDuePaid]}>
                    {myShare.amount.toLocaleString()}
                  </Text>
                  <Text style={styles.myDueUnit}>원</Text>
                </View>

                {!!sentVia && !myShare.markedPaid && (
                  <View style={styles.returnRow}>
                    <Text style={styles.returnText}>{sentVia}에서 송금을 마치셨나요?</Text>
                    <Pressable
                      onPress={() => onConfirmSentVia(myShare.id)}
                      accessibilityRole="button"
                      style={({ pressed }) => [styles.returnBtn, pressed && styles.pressed]}
                    >
                      <Text style={styles.returnBtnText}>네, 보냈어요</Text>
                    </Pressable>
                  </View>
                )}

                {/* 이 화면의 유일한 강조 버튼. 기억해 둔 앱이 있으면 이름을 박아
                    누르기 전에 어디로 나가는지 보이게 한다. */}
                {!myShare.paid && (
                  <Pressable
                    onPress={onSendMoney}
                    accessibilityRole="button"
                    accessibilityLabel={sendAppName ? `${sendAppName}로 송금하기` : '송금할 앱 고르기'}
                    style={({ pressed }) => [styles.sendBtn, pressed && styles.pressed]}
                  >
            <GreenFill />
                    <Ionicons name="arrow-forward" size={16} color={colors.bgRoot} />
                    <Text style={styles.sendText}>{sendAppName ? `송금하기 · ${sendAppName}` : '송금하기'}</Text>
                  </Pressable>
                )}

                {/*
                  「입금했어요」는 송금 뒤에 누르는 자기 신고다. 송금 버튼과 같은 크기로 붙어 있으니
                  처음 온 사람이 아무것도 안 보내고 먼저 누를 수 있었다 — 강조를 걷어 텍스트로 내린다.
                  없애지는 않는다: 창구·타 계좌로 이미 보낸 사람에게는 이게 유일한 길이다.
                  이미 눌렀을 때는 버튼이 아니라 상태 표시라서 면을 그대로 둔다.
                */}
                <Pressable
                  ref={paidTourRef}
                  onPress={() => onMarkPaid(myShare.id, !myShare.markedPaid)}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    myShare.markedPaid ? styles.paidBtnDone : styles.paidLink,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={myShare.markedPaid ? styles.paidDoneText : styles.paidLinkText}>
                    {myShare.markedPaid ? '입금했어요 · 총무 확인 대기' : '입금했어요'}
                  </Text>
                </Pressable>
              </View>
            )}

            {/*
              요약 표 — 총액부터 본인 이름까지.
              isCurrent 조건을 뗐다. 끝난 정산을 열었을 때 숫자가 하나도 안 나와서
              "이 정산이 얼마였더라"를 확인할 길이 없었다. 지난 내역도 내역이다.
            */}
            {!!myShare && (
              <SummaryBox>
                <SummaryRow label="총 정산 금액" value={`${settlement.totalAmount.toLocaleString()}원`} />
                <SummaryRow label="1인당 금액" value={`${settlement.perPerson.toLocaleString()}원`} />
                <SummaryRow label="참여 인원" value={`${settlement.shares.length}명`} />
                <SummaryRow label="본인 이름" value={myShare.guestName ?? nameFor(myShare.teamMemberId)} />
              </SummaryBox>
            )}

            {/* 위 넷의 결론 — 그래서 내가 얼마. 같은 무게로 섞이지 않게 떼어 낸다 */}
            {!!myShare && !myShare.exempt && <MyDueRow amount={myShare.amount} paid={myShare.paid} />}

            {/* 누가 얼마를 내고 누가 냈는지. 접어 두고 필요할 때만 편다 */}
            <DetailBreakdown
              rows={settlement.shares.map((sh) => ({
                id: sh.id,
                name: sh.guestName ?? nameFor(sh.teamMemberId),
                amount: sh.amount,
                paid: sh.paid,
                exempt: sh.exempt,
                isMe: sh.id === myShare?.id,
              }))}
            />

            <Pressable
              onPress={() => settlement.accountNo && onCopyAccount(settlement.accountNo)}
              accessibilityRole="button"
              accessibilityLabel="입금 계좌번호 복사"
              style={({ pressed }) => [styles.accountBox, pressed && styles.pressed]}
            >
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.accountLabel}>입금 계좌</Text>
                {/* 계좌번호는 복사 버튼이 옆에 따로 있을 만큼 복사 수요가 명백한 데이터다 */}
                <Text selectable style={styles.accountText}>
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
              <Pressable onPress={onConfirmSelected} accessibilityRole="button" style={({ pressed }) => [styles.bulkBtn, pressed && styles.pressed]}>
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
              <>
                {/*
                  ⚠ **누른 뒤에도 계속 눌린다.** 막는 것은 서버다 —
                    화면 상태로 막으면 시트를 닫았다 열거나 다른 기기에서 또 눌린다.
                    여기서는 「보내는 중」에만 막고, 나머지는 결과를 말로 알린다.
                */}
                {/*
                  성공·부분 차단·전면 차단·실패가 전부 여기 뜬다.

                  ⚠ **버튼 위다. 아래에 두었다가 화면 밖으로 밀렸다.**
                    이 버튼은 스크롤 내용의 맨 끝이라, 그 아래에 뭘 붙이면 시트의
                    아래 여백을 넘어 잘린다. 기기에서 확인했다 — uiautomator 트리에는
                    「이미 보냈어요…」가 있는데 화면에는 홈 인디케이터만 보였다.
                    **값은 있는데 안 보이는 것은 안 만든 것과 같다** — 이 작업이
                    막으려던 바로 그 상태(「눌렀는데 아무 일도 안 난다」)다.
                */}
                {!!remindNote && (
                  <Text
                    style={[
                      styles.remindNote,
                      remindNote.tone === 'ok' && { color: colors.green },
                      remindNote.tone === 'none' && { color: colors.danger },
                    ]}
                  >
                    {remindNote.text}
                  </Text>
                )}
                <Pressable
                  onPress={onRemindUnpaid}
                  disabled={reminding}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.remindBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.remindText}>
                    {reminding ? '보내는 중…' : `미입금 ${unpaidShares.length}명에게 알림`}
                  </Text>
                </Pressable>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  /*
    gap 12는 근거 없이 흘러온 값이다. 이력을 남긴다.

    6d7d639에서 14 → 12로 바뀌었는데, 그 커밋은 다른 다섯 건을 고치면서
    「이전 세션의 미커밋 작업 약 3500줄이 함께 담겨 분리할 수 없었다」고
    스스로 적어 둔 것이다. 간격을 왜 12로 했는지는 아무 데도 없다.

    그래도 유지한다. 지금 바꿀 이유가 없어서다 — 재보니 카드 수가 홈(넷)과
    팀(여덟) 사이라 12가 어정쩡하게 맞는다. 값을 정당화하는 게 아니라,
    「근거가 없다는 사실」을 적어 두는 것이다. 나중에 셋을 맞출 일이 생기면
    여기가 제일 먼저 움직여도 되는 자리다.

    세 화면이 다른 것을 scripts/screengap.check.ts가 붙들고 있다.
  */
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
    borderCurve: 'continuous',
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.control, // 11 리터럴
    borderCurve: 'continuous',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  segmentItemOn: { backgroundColor: colors.greenTint, borderColor: colors.greenDeep },
  segmentText: { ...font.meta, color: colors.navIdle, fontWeight: '800' }, // 12.5 → 램프 12, #7C8A85 = navIdle
  segmentTextOn: { color: colors.green },
  tabEmpty: { ...font.meta, color: colors.textFaint, textAlign: 'center', paddingVertical: 32 },

  // ── 전체/진행중/완료 필터 칩 (활성만 알약, 나머진 텍스트) ──
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: 12,
  },
  // 알약(pill)은 borderCurve를 주지 않는다 — 연속 곡률은 모서리가 있는 사각형에만 의미가 있다
  tabChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill },
  tabChipOn: { backgroundColor: colors.green },
  tabChipText: { ...font.body, color: colors.textMuted, fontWeight: '700' },
  tabChipTextOn: { color: colors.bgRoot, fontWeight: '800' },

  // 진행중/완료 카드 자체 스타일은 components/SettlementCard.tsx로 옮겼다 (홈 화면과 공용).

  // ── 시트 공통 ─────────────────────────────────────────────
  overlay: { flex: 1, backgroundColor: colors.scrim },
  sheet: {
    ...shadow.overlay,
    maxHeight: '86%',
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderColor: colors.border,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderCurve: 'continuous',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24, // 26 → 4pt 그리드
    gap: 14,
  },
  handle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: colors.neutralFill, marginBottom: 4 },
  close: { ...font.body, color: colors.textMuted, fontWeight: '700' },

  // ── 딥링크 진입 상태 (불러오는 중 / 못 찾음) ───────────────
  linkStatusOverlay: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'center', padding: 32 },
  linkStatus: {
    ...shadow.overlay,
    gap: 10,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderCurve: 'continuous',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  linkStatusTitle: { ...font.section, color: colors.text },
  linkStatusText: { ...font.meta, color: colors.textMuted, textAlign: 'center' },
  linkStatusBtn: {
    minHeight: 44,
    alignSelf: 'stretch',
    marginTop: 4,
    borderRadius: radius.button,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.green,
  },
  linkStatusBtnText: { ...font.cardTitle, color: colors.bgRoot, fontWeight: '800' },

  // 상세 모달
  detailSheet: { gap: 10 },
  detailHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardTitle: { ...font.section, color: colors.text },
  cardSub: { ...font.meta, color: colors.textMuted },

  myDue: { gap: 10 },
  // textDim(#6F7B76)은 카드 면(#18201B) 위에서 3.78:1 — 11px 본문에 WCAG AA(4.5:1) 미달이다.
  // textMuted는 같은 팔레트 안에서 5.33:1로 통과한다. 38px 숫자가 무엇인지 말해주는 라벨이라
  // 여기서 읽히지 않으면 금액만 덩그러니 남는다.
  myDueLabel: { ...font.meta, color: colors.textMuted, fontWeight: '700' },
  myDueRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  myDueAmount: { ...font.amountLg, ...font.num, color: colors.text }, // 38 리터럴 → 램프
  myDuePaid: { color: colors.green },
  myDueUnit: { ...font.section, color: colors.textMuted, fontWeight: '700', paddingBottom: 4 },

  sendBtn: {
    overflow: 'hidden', // GreenFill을 모서리 안에 가둔다
    height: 48,
    borderRadius: radius.button,
    borderCurve: 'continuous',
    backgroundColor: colors.green,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8, // 7 → 4pt 그리드
  },
  sendText: { ...font.cardTitle, color: colors.bgRoot, fontWeight: '800' },

  returnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.chip,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.greenDeep,
    backgroundColor: colors.greenTint,
  },
  returnText: { ...font.meta, flex: 1, color: colors.textBody, fontWeight: '700' },
  returnBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.green,
  },
  returnBtnText: { ...font.meta, color: colors.bgRoot, fontWeight: '800' },

  // 강조를 걷은 「입금했어요」 — 면도 테두리도 없이 텍스트만. 높이는 44를 지킨다.
  paidLink: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  paidLinkText: { ...font.body, color: colors.textMuted, fontWeight: '700' },

  // 이미 눌러 「총무 확인 대기」가 된 상태 — 버튼이 아니라 상태 표시라 면을 유지한다
  paidBtnDone: {
    minHeight: 46,
    borderRadius: radius.button,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderWidth: 1,
    borderColor: colors.greenDeep,
  },
  paidDoneText: { ...font.cardTitle, color: colors.green, fontWeight: '800' },

  accountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.control, // 13 리터럴
    borderCurve: 'continuous',
    backgroundColor: colors.inputBg,
  },
  // 위 myDueLabel과 같은 이유로 textDim에서 올린다 — 계좌를 눈으로 확인하는 자리라 더 중요하다
  accountLabel: { ...font.label, color: colors.textMuted },
  accountText: { ...font.body, ...font.num, color: colors.textStrong, fontWeight: '700' },
  accountHolder: { ...font.meta, color: colors.textMuted }, // 11.5 → 램프 12
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4, // 5 → 4pt 그리드
    height: 46,
    paddingHorizontal: 14,
    borderRadius: radius.pill, // 11 리터럴
    borderCurve: 'continuous',
    backgroundColor: colors.green,
  },
  copyBtnDone: { backgroundColor: colors.greenTint, borderWidth: 1, borderColor: colors.greenDeep },
  copyText: { ...font.meta, color: colors.bgRoot, fontWeight: '800' },

  bulkBtn: {
    marginLeft: 'auto',
    paddingHorizontal: 12, // 13 → 4pt 그리드
    paddingVertical: 8, // 9 → 4pt 그리드
    borderRadius: radius.pill,
    backgroundColor: colors.green,
  },
  bulkText: { ...font.meta, color: colors.bgRoot, fontWeight: '800' },

  remindBtn: {
    height: 46,
    borderRadius: radius.button,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlaySoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  remindText: { ...font.body, color: colors.textStrong, fontWeight: '800' },
  /* 독촉 결과 한 줄 — 버튼 바로 아래. 성공은 초록, 실패는 빨강, 차단은 기본색이다.
     ⚠ 차단을 빨강으로 하지 않는다. 고장이 아니라 「아직 이르다」라서 그렇다 */
  remindNote: { ...font.meta, color: colors.textDim, textAlign: 'center', marginBottom: 8 },

  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderCurve: 'continuous',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: font.cardTitle.fontSize,
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
    ...shadow.overlay,
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderCurve: 'continuous',
    borderTopWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 10,
  },
  // 16은 램프에 없는 사이값이었다 — 시트 제목은 섹션 제목과 같은 위계다
  accountModalTitle: { ...font.section, color: colors.text },
  accountModalSub: { ...font.meta, color: colors.textMuted, marginBottom: 4 },
  accountModalClose: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  accountModalCloseText: { ...font.meta, color: colors.green, fontWeight: '700' },

  // ── 계좌 관리 탭 ──────────────────────────────────────────
  accountSectionLabel: { ...font.meta, color: colors.textDim, fontWeight: '700', marginBottom: 8 },
  accountManageCard: {
    ...shadow.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderCurve: 'continuous',
    padding: 20,
  },
  accountManageBank: { ...font.section, ...font.num, color: colors.text },
  accountManageHolder: { ...font.meta, color: colors.textMuted },
  accountEditLink: { ...font.meta, color: colors.green, fontWeight: '800' },
  accountEditCard: {
    ...shadow.card,
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderCurve: 'continuous',
    padding: 20,
  },
  accountCancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: radius.pill,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlaySoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  accountCancelText: { ...font.cardTitle, color: colors.textMuted, fontWeight: '800' },
  accountSaveBtn: {
    flex: 1,
    height: 46,
    borderRadius: radius.pill,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.green,
  },
  accountSaveText: { ...font.cardTitle, color: colors.bgRoot, fontWeight: '800' },
  accountNotice: { marginTop: 16, gap: 4, paddingHorizontal: 4 },
  accountNoticeText: { ...font.meta, color: colors.textFaint },
  });
