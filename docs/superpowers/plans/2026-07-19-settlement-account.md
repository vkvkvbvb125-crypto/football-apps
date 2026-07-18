# 정산 계좌 등록 + 알림 + 본인 입금 체크 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 정산 등록 시 계좌 정보를 함께 저장/표시하고, 등록 즉시 팀원에게 알림을 보내고, 입금 체크를 본인도 할 수 있게 한다.

**Architecture:** 기존 정산 기능(경기별 총 비용 → 참석자 수 자동 분배)에 계좌 3필드를 `settlements` 테이블에 얹고, 등록 성공 시 기존 `notifyTeam` 알림 유틸을 재사용하며, `payments` 테이블 RLS에 "본인 행 수정 가능" 정책을 추가한다. 새 테이블이나 새 알림 인프라 없이 기존 패턴(`attendanceStore.ts`의 `createMatch`, `pushService.ts`)을 그대로 확장한다.

**Tech Stack:** React Native (Expo, web 타겟), zustand, Supabase(Postgres + RLS), `expo-clipboard`(기설치).

## Global Constraints

- 테스트 프레임워크 없음 — 각 태스크 검증은 `npx tsc --noEmit` (앱 루트: `c:\dev\football\app`) + 수동 확인(설명 제공)으로 대체한다.
- Supabase SQL 마이그레이션 자동화 없음 — 스키마/RLS 변경은 사용자가 Supabase 대시보드 SQL Editor에서 직접 실행해야 하며, 실행 확인 후 다음 태스크로 진행한다.
- 브랜치: `feature/nav-and-announcements` (이미 체크아웃됨). 커밋은 이 브랜치에 쌓는다.
- 기존 코드 패턴을 최대한 재사용한다: 알림은 `notifyTeam`(실패 시 조용히 무시), 클립보드 복사는 `TeamHomeScreen.tsx`의 `handleCopyInviteCode` 패턴(복사 후 1.5초 "복사됨" 표시).

---

### Task 1: DB 스키마 + RLS 변경 (Supabase SQL 실행)

**Files:**
- 참고: `app/supabase/schema.sql` (레퍼런스 문서 — 실제 DB는 Supabase 대시보드에서 수동 실행. 이 저장소엔 마이그레이션 자동화가 없으므로, 아래 SQL을 이 파일 `settlements`/`payments` 정의 바로 아래에도 손으로 추가해 두어 스키마 문서를 최신 상태로 유지한다)

**Interfaces:**
- Produces: `settlements.bank_name`, `settlements.account_number`, `settlements.account_holder` (모두 `text not null`), `payments` 테이블에 `payments_write_self` RLS 정책 추가. Task 2 이후의 모든 타입/쿼리가 이 컬럼을 전제로 한다.

- [ ] **Step 1: 사용자에게 아래 SQL을 Supabase 대시보드 → SQL Editor에서 실행해달라고 요청**

```sql
alter table settlements
  add column bank_name text not null default '',
  add column account_number text not null default '',
  add column account_holder text not null default '';

alter table settlements alter column bank_name drop default;
alter table settlements alter column account_number drop default;
alter table settlements alter column account_holder drop default;

create policy "payments_write_self" on payments for update
  using (
    exists (
      select 1 from team_members tm
      where tm.id = team_member_id and tm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from team_members tm
      where tm.id = team_member_id and tm.user_id = auth.uid()
    )
  );
```

- [ ] **Step 2: 실행 완료 확인**

사용자가 "실행했어" 등으로 확인해줄 때까지 대기. 확인 전에는 Task 2로 넘어가지 않는다 (프론트엔드가 없는 컬럼을 참조하면 모든 정산 등록이 즉시 실패함).

- [ ] **Step 3: `app/supabase/schema.sql` 문서에 반영**

`create table settlements (...)` 블록의 컬럼 목록에 `bank_name text not null,` / `account_number text not null,` / `account_holder text not null,` 3줄을 추가하고, `payments` RLS 정책들 바로 아래(`payments_write_admin` 다음)에 위 `payments_write_self` 정책 SQL을 그대로 추가한다. (신규 설치 시 한 번에 올바른 스키마가 만들어지도록 문서를 최신 상태로 유지 — alter 문이 아니라 최종 상태로 작성)

- [ ] **Step 4: 커밋**

```bash
cd app
git add supabase/schema.sql
git commit -m "feat: 정산 계좌 필드 + 본인 입금체크 RLS 정책 추가"
```

---

### Task 2: 타입 + 서비스 레이어

**Files:**
- Modify: `app/src/types/database.ts` (settlements 타입, 라인 101-116 부근)
- Modify: `app/src/features/settlement/services/settlementService.ts`

**Interfaces:**
- Consumes: Task 1에서 추가된 DB 컬럼(`bank_name`, `account_number`, `account_holder`).
- Produces:
  - `export interface SettlementAccount { bankName: string; accountNumber: string; accountHolder: string }` (`settlementService.ts`)
  - `createSettlement(matchId: string, totalAmount: number, memberIds: string[], account: SettlementAccount): Promise<SettlementRow>` — 시그니처 변경 (기존에 `account` 파라미터 없었음)
  - `fetchLatestAccount(teamId: string): Promise<SettlementAccount | null>` — 신규 함수
  - Task 3(`settlementStore.ts`)이 이 두 함수와 타입을 그대로 가져다 쓴다.

- [ ] **Step 1: `database.ts`의 settlements 타입에 계좌 필드 추가**

`app/src/types/database.ts`에서 아래 블록을 찾아:

```typescript
      settlements: {
        Row: {
          id: string;
          match_id: string;
          total_amount: number;
          per_person_amount: number | null;
          created_at: string;
        };
        Insert: {
          match_id: string;
          total_amount: number;
          per_person_amount?: number | null;
        };
        Update: Partial<Database['public']['Tables']['settlements']['Insert']>;
        Relationships: [];
      };
```

다음으로 교체:

```typescript
      settlements: {
        Row: {
          id: string;
          match_id: string;
          total_amount: number;
          per_person_amount: number | null;
          bank_name: string;
          account_number: string;
          account_holder: string;
          created_at: string;
        };
        Insert: {
          match_id: string;
          total_amount: number;
          per_person_amount?: number | null;
          bank_name: string;
          account_number: string;
          account_holder: string;
        };
        Update: Partial<Database['public']['Tables']['settlements']['Insert']>;
        Relationships: [];
      };
```

- [ ] **Step 2: `settlementService.ts`에 `SettlementAccount` 타입 추가 + `createSettlement` 시그니처 변경**

`app/src/features/settlement/services/settlementService.ts`에서:

```typescript
export async function createSettlement(matchId: string, totalAmount: number, memberIds: string[]) {
  const perPerson = memberIds.length > 0 ? Math.ceil(totalAmount / memberIds.length) : 0;

  const { data: settlement, error } = await supabase
    .from('settlements')
    .insert({ match_id: matchId, total_amount: totalAmount, per_person_amount: perPerson })
    .select()
    .single();
  if (error) throw error;

  if (memberIds.length > 0) {
    const { error: paymentsError } = await supabase
      .from('payments')
      .insert(memberIds.map((teamMemberId) => ({ settlement_id: settlement.id, team_member_id: teamMemberId })));
    if (paymentsError) throw paymentsError;
  }

  return settlement;
}
```

다음으로 교체:

```typescript
export interface SettlementAccount {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
}

export async function createSettlement(
  matchId: string,
  totalAmount: number,
  memberIds: string[],
  account: SettlementAccount
) {
  const perPerson = memberIds.length > 0 ? Math.ceil(totalAmount / memberIds.length) : 0;

  const { data: settlement, error } = await supabase
    .from('settlements')
    .insert({
      match_id: matchId,
      total_amount: totalAmount,
      per_person_amount: perPerson,
      bank_name: account.bankName,
      account_number: account.accountNumber,
      account_holder: account.accountHolder,
    })
    .select()
    .single();
  if (error) throw error;

  if (memberIds.length > 0) {
    const { error: paymentsError } = await supabase
      .from('payments')
      .insert(memberIds.map((teamMemberId) => ({ settlement_id: settlement.id, team_member_id: teamMemberId })));
    if (paymentsError) throw paymentsError;
  }

  return settlement;
}
```

- [ ] **Step 3: `fetchLatestAccount` 함수 추가**

같은 파일(`settlementService.ts`) 끝에 추가:

```typescript
export async function fetchLatestAccount(teamId: string): Promise<SettlementAccount | null> {
  const { data, error } = await supabase
    .from('settlements')
    .select('bank_name, account_number, account_holder, matches!inner(team_id)')
    .eq('matches.team_id', teamId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    bankName: data.bank_name,
    accountNumber: data.account_number,
    accountHolder: data.account_holder,
  };
}
```

- [ ] **Step 4: 타입체크**

Run: `cd app && npx tsc --noEmit`
Expected: 에러 없음 (`createSettlement` 호출부는 아직 Task 3에서 수정 전이라 이 시점엔 `settlementStore.ts`에서 인자 개수 불일치 에러가 날 수 있음 — 그 경우 에러 메시지에 `settlementStore.ts`만 나오는지 확인하고 Task 3으로 진행)

- [ ] **Step 5: 커밋**

```bash
cd app
git add src/types/database.ts src/features/settlement/services/settlementService.ts
git commit -m "feat: 정산 계좌 필드 타입 + fetchLatestAccount 추가"
```

---

### Task 3: 스토어 레이어 (알림 + 최근 계좌)

**Files:**
- Modify: `app/src/features/settlement/stores/settlementStore.ts`

**Interfaces:**
- Consumes: `createSettlement(matchId, totalAmount, memberIds, account: SettlementAccount)`, `fetchLatestAccount(teamId): Promise<SettlementAccount | null>` (Task 2), `notifyTeam(teamId, title, body, excludeUserId?)` (`app/src/features/notifications/services/pushService.ts`, 기존), `useAuthStore.getState().session?.user.id` (기존, `attendanceStore.ts`의 `createMatch`에서 쓰는 것과 동일한 패턴).
- Produces:
  - `createSettlement: (matchId: string, totalAmount: number, account: SettlementAccount) => Promise<void>` — 스토어 액션 시그니처 변경(계좌 인자 추가, `memberIds`는 스토어 내부에서 계산하므로 외부에 안 드러남 — 기존과 동일)
  - `latestAccount: SettlementAccount | null`
  - `loadLatestAccount: () => Promise<void>`
  - Task 4(`SettlementScreen.tsx`)이 이 셋을 그대로 훅으로 가져다 쓴다.

- [ ] **Step 1: 전체 파일 교체**

`app/src/features/settlement/stores/settlementStore.ts`를 아래 내용으로 교체:

```typescript
import { create } from 'zustand';
import { useAttendanceStore } from '../../attendance/stores/attendanceStore';
import { useTeamStore } from '../../team/stores/teamStore';
import { useAuthStore } from '../../auth/stores/authStore';
import { notifyTeam } from '../../notifications/services/pushService';
import {
  createSettlement as createSettlementRequest,
  fetchLatestAccount,
  fetchSettlements,
  togglePayment as togglePaymentRequest,
  type SettlementAccount,
  type SettlementWithPayments,
} from '../services/settlementService';

interface SettlementState {
  settlements: SettlementWithPayments[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
  latestAccount: SettlementAccount | null;
  loadSettlements: () => Promise<void>;
  loadLatestAccount: () => Promise<void>;
  createSettlement: (matchId: string, totalAmount: number, account: SettlementAccount) => Promise<void>;
  togglePayment: (paymentId: string, isPaid: boolean) => Promise<void>;
}

export const useSettlementStore = create<SettlementState>((set, get) => ({
  settlements: [],
  loaded: false,
  loading: false,
  error: null,
  latestAccount: null,
  loadSettlements: async () => {
    const matchIds = useAttendanceStore.getState().matches.map((m) => m.id);
    set({ loading: true, error: null });
    try {
      const settlements = await fetchSettlements(matchIds);
      set({ settlements, loaded: true });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '정산 내역을 불러오지 못했습니다.', loaded: true });
    } finally {
      set({ loading: false });
    }
  },
  loadLatestAccount: async () => {
    const activeTeam = useTeamStore.getState().activeTeam;
    if (!activeTeam) return;
    try {
      const latestAccount = await fetchLatestAccount(activeTeam.team.id);
      set({ latestAccount });
    } catch {
      // 최근 계좌 조회 실패는 조용히 무시 (편의 기능이라 정산 등록 자체엔 영향 없음)
    }
  },
  createSettlement: async (matchId, totalAmount, account) => {
    const activeTeam = useTeamStore.getState().activeTeam;
    const match = useAttendanceStore.getState().matches.find((m) => m.id === matchId);
    const attendeeIds = (match?.votes ?? []).filter((v) => v.status === 'attend').map((v) => v.team_member_id);
    set({ loading: true, error: null });
    try {
      await createSettlementRequest(matchId, totalAmount, attendeeIds, account);
      await get().loadSettlements();

      if (activeTeam && match) {
        const perPerson = attendeeIds.length > 0 ? Math.ceil(totalAmount / attendeeIds.length) : 0;
        const dateLabel = new Date(match.match_date).toLocaleDateString('ko-KR', {
          month: 'long',
          day: 'numeric',
        });
        const myUserId = useAuthStore.getState().session?.user.id;
        notifyTeam(
          activeTeam.team.id,
          `${activeTeam.team.name} 정산 등록`,
          `${dateLabel} 정산이 등록됐어요 · 1인당 ${perPerson.toLocaleString()}원`,
          myUserId
        ).catch(() => {
          // 알림 전송 실패는 조용히 무시 (정산 등록 자체는 이미 성공)
        });
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '정산 생성에 실패했습니다.', loading: false });
    }
  },
  togglePayment: async (paymentId, isPaid) => {
    const membershipId = useTeamStore.getState().activeTeam?.membershipId;
    if (!membershipId) return;
    try {
      await togglePaymentRequest(paymentId, isPaid, membershipId);
      await get().loadSettlements();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '입금 확인 처리에 실패했습니다.' });
    }
  },
}));
```

- [ ] **Step 2: 타입체크**

Run: `cd app && npx tsc --noEmit`
Expected: `SettlementScreen.tsx`에서 `createSettlement(matchId, amount)` 2개 인자만 호출하는 부분에서 에러 발생 (아직 Task 4 전) — 에러가 정확히 그 위치를 가리키는지만 확인하고 Task 4로 진행.

- [ ] **Step 3: 커밋**

```bash
cd app
git add src/features/settlement/stores/settlementStore.ts
git commit -m "feat: 정산 등록 시 알림 발송 + 최근 계좌 조회 추가"
```

---

### Task 4: 정산 등록 폼 UI (계좌 입력 + 최근 계좌 칩)

**Files:**
- Modify: `app/src/features/settlement/screens/SettlementScreen.tsx`

**Interfaces:**
- Consumes: `useSettlementStore`의 `latestAccount`, `loadLatestAccount`, `createSettlement(matchId, totalAmount, account: SettlementAccount)` (Task 3). `SettlementAccount` 타입은 `../services/settlementService`에서 import.
- Produces: 정산 등록 폼에 계좌 3칸 입력 상태(`accountDrafts`)와 제출 로직. Task 5가 같은 파일의 정산 카드/결제 행 부분을 이어서 수정한다.

- [ ] **Step 1: import 및 상태 추가**

`app/src/features/settlement/screens/SettlementScreen.tsx` 상단 import 블록:

```typescript
import { useEffect, useState } from 'react';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { ScreenGradient } from '../../../components/ScreenGradient';
import { EmptyState } from '../../../components/EmptyState';
import { TabHeader } from '../../../components/TabHeader';
import { useTeamStore } from '../../team/stores/teamStore';
import { useAttendanceStore } from '../../attendance/stores/attendanceStore';
import { useSettlementStore } from '../stores/settlementStore';
import type { SettlementAccount } from '../services/settlementService';
```

컴포넌트 내부 상태 선언부(`const [amountDrafts, setAmountDrafts] = useState<Record<string, string>>({});` 바로 아래)에 추가:

```typescript
  const [accountDrafts, setAccountDrafts] = useState<Record<string, SettlementAccount>>({});
  const [copiedMatchId, setCopiedMatchId] = useState<string | null>(null);

  const latestAccount = useSettlementStore((s) => s.latestAccount);
  const loadLatestAccount = useSettlementStore((s) => s.loadLatestAccount);
```

기존 `useEffect(() => { if (!activeTeam) return; (async () => { await loadMatches(); await loadSettlements(); })(); }, [activeTeam?.team.id]);` 바로 아래에 추가:

```typescript
  useEffect(() => {
    if (!activeTeam) return;
    loadLatestAccount();
  }, [activeTeam?.team.id]);
```

- [ ] **Step 2: 계좌 입력칸 헬퍼 함수 추가**

`nameFor` 함수 바로 아래에 추가:

```typescript
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
```

- [ ] **Step 3: 정산 등록 폼(`createRow`) 교체**

기존:

```typescript
                ) : isAdmin ? (
                  <View style={styles.createRow}>
                    <TextInput
                      style={styles.amountInput}
                      placeholder="총 비용 (원)"
                      placeholderTextColor="#5A625E"
                      keyboardType="number-pad"
                      value={amountDrafts[match.id] ?? ''}
                      onChangeText={(t) => setAmountDrafts((prev) => ({ ...prev, [match.id]: t }))}
                    />
                    <Pressable
                      style={styles.createButton}
                      onPress={() => {
                        const amount = Number(amountDrafts[match.id]);
                        if (!amount) return;
                        createSettlement(match.id, amount);
                      }}
                    >
                      <Text style={styles.createButtonText}>정산 등록</Text>
                    </Pressable>
                  </View>
                ) : (
```

다음으로 교체:

```typescript
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

                    {latestAccount && (
                      <Pressable style={styles.latestAccountChip} onPress={() => applyLatestAccount(match.id)}>
                        <Ionicons name="time-outline" size={13} color="#39D98A" />
                        <Text style={styles.latestAccountChipText}>
                          최근 사용: {latestAccount.bankName} {latestAccount.accountNumber} ({latestAccount.accountHolder})
                        </Text>
                      </Pressable>
                    )}

                    <TextInput
                      style={styles.amountInput}
                      placeholder="은행명"
                      placeholderTextColor="#5A625E"
                      value={accountFor(match.id).bankName}
                      onChangeText={(t) => updateAccountField(match.id, 'bankName', t)}
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
```

- [ ] **Step 4: 새 스타일 추가**

`styles.createRow` 정의를 찾아 이름을 `createForm`으로 바꾸고 `flexDirection: 'row'`를 제거(세로 배치로 변경), 아래 스타일들을 그 옆에 추가:

기존:

```typescript
  createRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
```

다음으로 교체 + 추가:

```typescript
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
    color: '#39D98A',
    fontSize: 11,
    fontWeight: '600',
  },
  createButtonDisabled: {
    opacity: 0.4,
  },
```

- [ ] **Step 5: 타입체크**

Run: `cd app && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 6: 커밋**

```bash
cd app
git add src/features/settlement/screens/SettlementScreen.tsx
git commit -m "feat: 정산 등록 폼에 계좌 입력 + 최근 계좌 자동입력 추가"
```

---

### Task 5: 정산 카드 표시(계좌 + 복사) + 결제 행 본인 체크 허용

**Files:**
- Modify: `app/src/features/settlement/screens/SettlementScreen.tsx` (Task 4에서 이어서 같은 파일)

**Interfaces:**
- Consumes: `activeTeam.membershipId` (`useTeamStore`, 기존), `Clipboard.setStringAsync` (`expo-clipboard`, Task 4에서 이미 import).
- Produces: 없음 (최종 UI 단계).

- [ ] **Step 1: 정산 카드에 계좌 표시 + 복사 버튼 추가**

기존:

```typescript
                {settlement ? (
                  <>
                    <View style={styles.amountRow}>
                      <Text style={styles.totalAmount}>총 {settlement.total_amount.toLocaleString()}원</Text>
                      <Text style={styles.perPersonAmount}>
                        1인당 {settlement.per_person_amount?.toLocaleString()}원
                      </Text>
                    </View>
                    <View style={styles.paymentList}>
```

다음으로 교체:

```typescript
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
                          color="#39D98A"
                        />
                      </Pressable>
                    </View>

                    <View style={styles.paymentList}>
```

- [ ] **Step 2: 결제 행 `disabled` 조건 변경**

기존:

```typescript
                      {settlement.payments.map((p) => (
                        <Pressable
                          key={p.id}
                          style={styles.paymentRow}
                          disabled={!isAdmin}
                          onPress={() => togglePayment(p.id, !p.is_paid)}
                        >
```

다음으로 교체:

```typescript
                      {settlement.payments.map((p) => (
                        <Pressable
                          key={p.id}
                          style={styles.paymentRow}
                          disabled={!isAdmin && p.team_member_id !== activeTeam.membershipId}
                          onPress={() => togglePayment(p.id, !p.is_paid)}
                        >
```

- [ ] **Step 3: 계좌 표시용 스타일 추가**

`styles.paymentList` 정의 바로 위에 추가:

```typescript
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
```

- [ ] **Step 4: 타입체크**

Run: `cd app && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 5: 수동 확인 (설명 제공, 실제 확인은 사용자가 브라우저에서)**

확인할 흐름:
1. 총무 계정으로 정산 등록 폼에서 계좌 3칸을 채우고 "정산 등록" — 카드에 총액/1인당 금액/계좌가 표시되고, 팀원들에게 알림이 가는지 (다른 계정 또는 알림벨에서 확인)
2. "최근 사용" 칩을 탭했을 때 계좌 3칸이 자동으로 채워지는지 (두 번째 정산부터)
3. 계좌 옆 복사 아이콘을 눌렀을 때 아이콘이 체크 표시로 잠깐 바뀌고, 다른 곳에 붙여넣기했을 때 계좌번호가 복사됐는지
4. 총무가 아닌 팀원 계정으로 본인 행은 누를 수 있고, 다른 사람 행은 안 눌리는지

- [ ] **Step 6: 커밋**

```bash
cd app
git add src/features/settlement/screens/SettlementScreen.tsx
git commit -m "feat: 정산 카드 계좌 표시/복사 + 본인 입금 체크 허용"
```

---

## Self-Review 결과

- **스펙 커버리지:** 데이터 모델(Task 1,2) / RLS(Task 1) / 서비스·스토어(Task 2,3) / 알림(Task 3) / 등록 폼+최근계좌(Task 4) / 카드 표시+복사+본인체크(Task 5) — 스펙의 5개 섹션 모두 태스크로 매핑됨.
- **플레이스홀더 스캔:** 없음 — 모든 스텝에 실제 코드/SQL 포함.
- **타입 일관성:** `SettlementAccount`(`bankName`/`accountNumber`/`accountHolder`)를 Task 2에서 정의한 그대로 Task 3(스토어 시그니처), Task 4(폼 상태), Task 5(카드 표시)까지 동일하게 사용. `createSettlement` 서비스 시그니처(`matchId, totalAmount, memberIds, account`)와 스토어 액션 시그니처(`matchId, totalAmount, account` — `memberIds`는 내부 계산)가 서로 다른 레이어임을 명확히 구분해 표기함.
