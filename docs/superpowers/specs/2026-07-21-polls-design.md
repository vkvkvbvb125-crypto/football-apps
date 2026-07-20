# 투표(설문) 기능 설계

## 배경

스펙 문서 "8단계: 공지사항 + 투표" 중 공지사항은 완료했고, 투표(자유 질문+선택지, 마감시간, 실시간 득표 반영, 공지사항 리스트에 함께 노출)가 남아있었다. 자리 비우신 동안 이어서 진행하며 아래 결정들을 내 판단으로 정했다.

## 결정한 것들 (근거 포함)

1. **단일 선택(single-select)만 지원**, 복수 선택은 안 만듦.
   - 근거: "이날 참석 가능하세요?" "다음 정기 요일은?" 같은 캐주얼 팀 투표는 대부분 단일 선택이고, 스펙에도 복수 선택 요구가 명시되어 있지 않다.
2. **선택지는 자유 텍스트 배열(jsonb)로 저장**, 별도 정규화 테이블 안 만듦.
   - 근거: 선택지 개수가 적고(보통 2~5개) 수정 빈도도 낮아서, 배열 하나로 저장하는 게 훨씬 간단하다.
3. **투표는 익명 아님 — 누가 뭘 찍었는지 총무/팀원 모두 조회 가능** (참석투표와 동일한 패턴).
   - 근거: 이미 있는 `attendance_votes`가 익명이 아니고, 캐주얼 동호회 투표에 익명성이 필요하다는 요구도 없었다.
4. **생성만 가능, 수정은 안 만듦(삭제는 가능)** — 질문/선택지를 만든 후 바꾸는 기능은 없음.
   - 근거: 이미 투표가 들어온 상태에서 선택지를 바꾸면 데이터 정합성이 꼬여서, 범위를 좁혀 "다시 만들기"만 가능하게 함.
5. **마감시간은 선택사항(nullable)** — 있으면 지난 후 투표 버튼 비활성화, 없으면 계속 투표 가능.
   - 근거: 기존 `matches.vote_deadline`과 동일한 선택적 마감 패턴을 재사용.
6. **팀 홈 화면에 공지사항 섹션 바로 아래에 별도의 "투표" 섹션**(미리보기 + 전체보기 모달), 공지사항과 통합 리스트로 섞지 않음.
   - 근거: 스펙 문구가 "공지사항 리스트에 함께 노출"이라고 되어있지만, 데이터 구조가 달라서(공지는 텍스트, 투표는 선택지+득표) 하나의 리스트에 섞으면 UI가 복잡해진다. 대신 같은 화면에 나란히 배치해서 "같이 보인다"는 의도는 살리되 구현은 분리했다.

## 데이터 모델

```sql
create table polls (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  author_id uuid not null references team_members(id),
  question text not null,
  options jsonb not null,
  deadline timestamptz,
  created_at timestamptz not null default now()
);

create table poll_responses (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references polls(id) on delete cascade,
  team_member_id uuid not null references team_members(id) on delete cascade,
  option_index int not null,
  updated_at timestamptz not null default now(),
  unique (poll_id, team_member_id)
);
```

RLS: `polls`는 팀원 조회/총무만 작성·삭제, `poll_responses`는 팀원 조회 가능(득표 집계 위해)/본인 응답만 작성·수정 가능 (참석투표와 동일 패턴).

## 검증 방법

`npx tsc --noEmit` + 수동 확인 (사용자 복귀 후):
1. 총무 계정에서 투표 만들기(질문 + 선택지 2개 이상 + 마감시간 선택사항)
2. 일반 멤버 계정에서 선택지 하나를 탭해 투표, 실시간으로 득표수 반영되는지
3. 마감시간이 지난 투표는 선택 버튼이 비활성화되는지
4. 총무가 투표를 삭제하면 목록에서 사라지는지
5. 팀 홈 화면에 공지사항 섹션 아래 투표 섹션이 별도로 보이는지
