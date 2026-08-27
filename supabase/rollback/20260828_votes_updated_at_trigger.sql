-- 20260828_votes_updated_at_trigger.sql 되돌리기.
--
-- ⚠ 되돌려도 그 사이에 올라간 updated_at은 못 되돌린다.
--   트리거가 도는 동안 상태를 바꾼 투표는 「마지막으로 바꾼 시각」을 갖게 됐고,
--   이 파일은 트리거만 떼지 값을 원래대로 내리지 않는다. 내릴 재료도 없다 —
--   「처음 응답한 시각」은 어디에도 안 남아 있다.
--   되돌린 뒤 그 행들의 대기 순번은 롤백 전 순서 그대로다.
--
-- 트리거를 뗀 뒤에는 재투표해도 updated_at이 안 오른다(원래 동작).
-- 검사대는 그것을 동작으로 확인한다.

drop trigger if exists attendance_votes_touch_updated_at on attendance_votes;
drop function if exists touch_vote_updated_at();
