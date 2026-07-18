# 정산 계좌 등록 + 알림 + 본인 입금 체크 설계

## 배경

정산 기능(경기별 총 비용 → 참석자 수로 자동 분배)은 이미 구현돼 있다. 이번 스펙은 여기에 세 가지를 더한다: (1) 정산 등록 시 계좌 정보를 함께 입력해서 팀원에게 보여주기, (2) 정산 등록 시 팀원에게 알림 발송, (3) 입금 체크를 총무뿐 아니라 본인도 할 수 있게 하기.

카카오페이 실연동(총무가 정산 올리면 팀원 계좌에서 실제 송금 요청/자동 확인)은 검토했으나 제외한다. 카카오페이의 "정산하기"는 카카오톡 내부 전용 기능이고, 외부에 공개된 카카오페이 API는 사업자가 자사 결제를 받을 때 쓰는 결제 API라 개인 간 송금 요청에는 애초에 접근할 수 없다. 은행 입금 자동 감지(오픈뱅킹 연동, SMS 파싱)도 같은 이유로 이번 스펙 범위 밖이다.

## 1. 데이터 모델

`settlements` 테이블에 계좌 컬럼 3개를 추가한다. 계좌는 정산마다 새로 입력하며(팀 단위로 고정 저장하지 않음), 화면에서는 가장 최근 정산의 계좌를 "최근 계좌"로 제안한다.

```sql
alter table settlements
  add column bank_name text not null default '',
  add column account_number text not null default '',
  add column account_holder text not null default '';

alter table settlements alter column bank_name drop default;
alter table settlements alter column account_number drop default;
alter table settlements alter column account_holder drop default;
```

(기존 행이 없거나 있어도 무방하도록 `default ''`로 컬럼을 추가한 뒤 default를 제거하는 2단계로 실행 — 이미 등록된 정산이 있을 경우를 대비.)

## 2. 권한(RLS) 변경

`payments`는 현재 총무만 쓸 수 있다(`payments_write_admin`). 여기에 "본인 행은 본인이 수정 가능" 정책을 추가한다. 총무 정책은 그대로 둬서 총무도 계속 전원의 입금 상태를 체크/해제할 수 있다.

```sql
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

## 3. 클라이언트 데이터 레이어

### `src/types/database.ts`
`settlements` 테이블 `Row`/`Insert`에 `bank_name: string`, `account_number: string`, `account_holder: string` 추가.

### `src/features/settlement/services/settlementService.ts`
- `createSettlement(matchId, totalAmount, memberIds, account)` — `account: { bankName: string; accountNumber: string; accountHolder: string }` 파라미터 추가, insert 시 `bank_name`/`account_number`/`account_holder` 컬럼에 반영.
- `fetchLatestAccount(teamId)` 신규 함수 — 해당 팀의 경기(matches.team_id)에 속한 settlements 중 `created_at` 기준 최신 1건에서 계좌 3필드만 조회. 없으면 `null` 반환.

### `src/features/settlement/stores/settlementStore.ts`
- `createSettlement(matchId, totalAmount, account)` — 참석자 id 목록 계산은 기존과 동일, 계좌 정보를 서비스 함수에 전달. 성공 후 `notifyTeam`(아래 4번) 호출.
- `latestAccount: { bankName: string; accountNumber: string; accountHolder: string } | null`, `loadLatestAccount()` 상태/액션 추가 — `SettlementScreen`이 정산 등록 폼을 열 때 호출.
- `togglePayment`는 시그니처 변경 없음 (이미 `checkedBy`를 받아 누가 체크했는지 기록하는 구조라 본인 체크에도 그대로 재사용 가능).

## 4. 알림

`createSettlement` 성공 후 기존 `notifyTeam(teamId, title, body, excludeUserId)`(`pushService.ts`)를 재사용한다. `excludeUserId`는 등록한 총무 본인.

- title: `${팀 이름} 정산 등록`
- body: `${경기 날짜(월 일)} 정산이 등록됐어요 · 1인당 ${perPerson.toLocaleString()}원`

발송 실패는 `createMatch`와 동일하게 조용히 무시(정산 등록 자체는 이미 성공).

## 5. UI/UX

### 정산 등록 폼 (`SettlementScreen.tsx`)
- 기존 총 비용 입력칸 아래에 계좌 입력 3칸 추가: 은행명, 계좌번호, 예금주 (모두 `TextInput`, 기존 `styles.amountInput` 스타일 재사용).
- 폼이 열려 있는 동안(해당 경기에 정산이 아직 없고 총무인 카드) `loadLatestAccount()`로 가져온 값이 있으면 입력칸 위에 "최근 사용: OO은행 123-456 (홍길동)" 칩을 표시. 칩을 탭하면 3칸에 그 값을 그대로 채워 넣는다(직접 수정 가능).
- "정산 등록" 버튼은 계좌 3칸이 모두 채워져 있어야 활성화(빈 문자열이면 비활성 — 서버 컬럼이 `not null`이기 때문).

### 정산 카드
- 계좌 정보(은행/계좌번호/예금주)를 총액/1인당 금액 아래에 표시.
- 계좌번호 옆에 복사 아이콘 버튼 추가 — `expo-clipboard`의 `setStringAsync`로 계좌번호만 클립보드에 복사(이미 설치된 패키지, 새 의존성 없음).

### 결제 행
- 기존: `disabled={!isAdmin}`.
- 변경: `disabled={!isAdmin && p.team_member_id !== activeTeam.membershipId}` — 총무는 계속 전원 토글 가능, 팀원은 본인 행만 토글 가능.

## 범위 밖

- 카카오페이/오픈뱅킹 등 실제 송금·입금 자동화 (위 배경 설명 참고 — 접근 자체가 불가능).
- 정산 등록 후 수정/삭제.
- 미입금자에게 리마인더 알림 재발송.
- 계좌번호 외 은행 선택 UI(드롭다운 등) — 자유 텍스트 입력으로 충분.
