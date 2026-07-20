# 팀분배 - 팀 개수 자유화 + 실력태그 밸런싱 설계

## 배경

경기운영 탭의 "분배" 화면은 이미 랜덤 분배 + 수동 재배치가 동작하지만, 두 가지 제약이 있다:
1. 그룹이 A/B 2개로 고정되어 있음 (스펙 문서상 목표는 2~5팀 자유설정)
2. 랜덤 분배가 순수 셔플이라 실력태그(상/중/하)를 고려하지 않음

이번 작업으로 이 두 가지를 함께 개선한다. 타이머, 라운드별 재섞기, 출전시간 관리, 번호뽑기, 스코어보드 등 스펙 문서의 다른 항목은 이번 범위에 포함하지 않는다.

## 목표

- 총무가 분배 화면에서 그룹 컬럼을 직접 추가/삭제해서 팀 개수(2~5팀)를 조정할 수 있다.
- 랜덤 분배 시 상/중/하 실력태그가 각 그룹에 고르게 섞이도록 분배한다.
- 멤버를 다른 그룹으로 옮기는 수동 조정은 기존처럼 탭 한 번으로 가능하되, 그룹이 3개 이상이 될 수 있으므로 "다음 그룹으로 순환 이동" 방식으로 확장한다.

## 데이터 모델

`matches` 테이블에 컬럼 추가:

```sql
alter table matches add column team_count int not null default 2 check (team_count between 2 and 5);
```

기존 `quarter_minutes int not null default 10`과 동일한 패턴 — 경기별 설정값. `team_assignments.group_label`은 그대로 text이므로 스키마 변경 없이 'A'~'E'까지 저장 가능.

## 동작 변경: 그룹 컬럼이 항상 보임

현재는 `matchAssignments.length === 0`일 때 "아직 분배되지 않았어요" 텍스트만 보여주고 그룹 컬럼 자체를 렌더링하지 않는다. 이번 변경으로 **분배 여부와 무관하게 `match.team_count`만큼의 그룹 컬럼을 항상 렌더링**한다 (아직 분배 전이면 컬럼이 비어있는 채로). 이래야 총무가 랜덤 분배를 누르기 전에도 그룹을 추가/삭제해서 팀 개수를 정할 수 있다.

## 서비스 레이어

`src/features/attendance/services/attendanceService.ts`에 추가:

```typescript
export async function updateMatchTeamCount(matchId: string, teamCount: number) {
  const { error } = await supabase.from('matches').update({ team_count: teamCount }).eq('id', matchId);
  if (error) throw error;
}
```

기존 `updateMatch`는 모든 경기 필드를 요구하는 전체 업데이트용이라, team_count 하나만 가볍게 바꾸는 이 용도엔 맞지 않아 별도 함수로 분리한다.

`src/features/assignment/services/assignmentService.ts`에 그룹 라벨 생성 헬퍼 추가 (스토어와 화면 양쪽에서 공용으로 사용):

```typescript
export function groupLabelsFor(teamCount: number): string[] {
  return Array.from({ length: teamCount }, (_, i) => String.fromCharCode(65 + i));
}
```

## 스토어 로직 (`assignmentStore.ts`)

### `randomize(matchId)` — 실력태그 밸런싱으로 교체

의사코드:

```
match = attendanceStore.matches에서 matchId로 찾기
teamCount = match.team_count
attendeeIds = match.votes 중 status==='attend'인 team_member_id 목록

buckets = { 상: [], 중: [], 하: [], 미지정: [] }
각 attendeeId에 대해 teamStore.members에서 skill_tag 조회 후 해당 버킷에 push
  (skill_tag가 null이면 '미지정' 버킷)

각 버킷을 무작위로 섞음 (기존과 동일한 sort(() => Math.random() - 0.5) 방식)

labels = groupLabelsFor(teamCount)
assignments = []
버킷 순서(상 → 중 → 하 → 미지정)대로, 버킷 내 인덱스 i에 대해
  assignments.push({ teamMemberId, groupLabel: labels[i % teamCount] })

saveAssignments(matchId, assignments) 호출 (기존과 동일)
```

버킷마다 라운드로빈을 인덱스 0부터 다시 시작하므로 그룹 간 인원 편차는 최대 버킷 개수(4)만큼 생길 수 있지만, 실력 분포는 고르게 섞인다. 소규모 동호회 캐주얼 매칭 목적에는 이 정도면 충분하다.

### `moveMember(matchId, teamMemberId)` — 순환 이동으로 시그니처 변경

기존: `moveMember(matchId, teamMemberId, groupLabel)` — 화면에서 목표 그룹을 직접 계산해서 전달.
변경: `moveMember(matchId, teamMemberId)` — 스토어 내부에서 현재 그룹과 `match.team_count`를 보고 다음 그룹을 계산.

```
match = attendanceStore.matches에서 matchId로 찾기
labels = groupLabelsFor(match.team_count)
currentLabel = 현재 assignments에서 이 teamMemberId의 group_label
nextLabel = labels[(labels.indexOf(currentLabel) + 1) % labels.length]
updateAssignment(matchId, teamMemberId, nextLabel) 호출 (기존과 동일)
```

### `addGroup(matchId)` / `removeLastGroup(matchId)` — 신규 액션

```
addGroup(matchId):
  match = attendanceStore.matches에서 찾기
  if match.team_count >= 5: 아무것도 하지 않음
  updateMatchTeamCount(matchId, match.team_count + 1) 호출
  attendanceStore의 loadMatches() 호출 (team_count 갱신 반영)

removeLastGroup(matchId):
  match = attendanceStore.matches에서 찾기
  if match.team_count <= 2: 아무것도 하지 않음
  labels = groupLabelsFor(match.team_count)
  lastLabel = labels의 마지막, prevLabel = labels의 마지막 바로 앞
  현재 assignments 중 group_label === lastLabel인 멤버들을 각각
    updateAssignment(matchId, teamMemberId, prevLabel)로 prevLabel로 이동
  updateMatchTeamCount(matchId, match.team_count - 1) 호출
  attendanceStore의 loadMatches() 호출
  loadAssignments() 호출 (이동된 배치 반영)
```

## UI (`AssignmentScreen.tsx`)

- 하드코딩된 `const GROUPS = ['A', 'B']` 제거, 렌더링 시 `groupLabelsFor(match.team_count)` 사용.
- `matchAssignments.length === 0` 분기 제거 — 그룹 컬럼을 항상 렌더링 (분배 전엔 빈 컬럼).
- `groupsRow`에 `flexWrap: 'wrap'` 적용, 컬럼 `flexBasis`를 약 45%로 지정해 한 줄에 2개씩 감싸지도록 함 (2팀=1줄, 3팀=2+1, 4팀=2줄×2, 5팀=2+3).
- 그룹 컬럼 헤더(`groupTitle` 옆)에 총무 전용 삭제 아이콘 — `isAdmin && match.team_count > 2 && 이 컬럼이 마지막 그룹일 때`만 표시, 누르면 `removeLastGroup(match.id)` 호출.
- 그룹 행 끝에 "+ 팀 추가" 칩 — `isAdmin && match.team_count < 5`일 때만 표시, 누르면 `addGroup(match.id)` 호출.
- 멤버 칩 `onPress`를 `moveMember(match.id, a.team_member_id, ...)` 3번째 인자 제거하고 `moveMember(match.id, a.team_member_id)`로 변경.

## 제약사항

- 팀 개수는 2~5 사이로 고정 (DB CHECK 제약 + UI에서 버튼 비활성화 이중 방어).
- 실력태그 밸런싱은 참석 확정 인원 기준으로만 계산 (미정/불참 제외 — 기존과 동일).
- 그룹 삭제 시 멤버 자동 이동은 "바로 앞 그룹으로 병합"만 지원 (더 복잡한 재배치 UI는 범위 밖).

## 검증 방법

이 프로젝트는 테스트 프레임워크가 없으므로, 각 구현 단계는 `npx tsc --noEmit` + 수동 확인으로 검증한다. 수동 확인 시나리오:
1. 총무 계정으로 분배 화면에서 경기 카드 확인 → 기본 2팀(A/B) 컬럼이 분배 전에도 보이는지
2. "+ 팀 추가"를 3번 눌러 5팀까지 늘어나는지, 5팀 상태에서 버튼이 사라지는지
3. "랜덤 분배" 실행 후 각 그룹에 상/중/하 태그가 고르게 섞였는지 (완전히 균등하진 않아도 한 그룹에 태그가 몰리지 않는지)
4. 멤버 칩을 여러 번 탭해서 그룹을 순환하며 마지막 그룹 다음에 다시 A로 돌아오는지
5. 마지막 그룹에 멤버가 있는 상태에서 삭제 아이콘을 눌러 그 멤버들이 바로 앞 그룹으로 이동하고 컬럼이 사라지는지
6. 2팀 상태에서 삭제 아이콘이 안 보이는지 (최소 2팀 보장)
