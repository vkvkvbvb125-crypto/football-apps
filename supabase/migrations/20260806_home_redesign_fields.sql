-- 20260806_home_redesign_fields.sql
-- 홈 화면 시안에 있는데 스키마엔 없던 두 필드를 추가한다.
--
-- 1) matches.match_type — 경기 카드의 "정기전" 칩.
--    기존 행이 전부 정기전 취급이 되도록 default를 주고 not null로 잡는다(표시용 라벨).
-- 2) settlements.due_date — "납부 기한 ~7/25".
--    기한은 총무가 실제로 정하는 약속이라 임의로 채우지 않는다. nullable로 두고,
--    값이 없으면 홈에서 그 줄을 그리지 않는다.

alter table matches
  add column if not exists match_type text not null default '정기전';

alter table matches
  drop constraint if exists matches_match_type_check;
alter table matches
  add constraint matches_match_type_check
  check (match_type in ('정기전', '친선전', '연습'));

alter table settlements
  add column if not exists due_date date;
