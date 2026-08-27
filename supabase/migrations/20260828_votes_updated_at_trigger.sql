-- 투표 상태가 바뀔 때 updated_at을 서버가 올린다.
--
-- 지금은 아무도 이 컬럼을 갱신하지 않는다. default now()가 INSERT 때 한 번 찍고
-- 그걸로 끝이다 — castVote의 upsert payload에 updated_at이 없어서 재투표해도
-- 처음 찍은 시각 그대로다.
--
-- 그런데 이 컬럼은 값을 만드는 데 쓰인다. capacity.ts가 대기 순번을 updated_at
-- 순으로 매긴다. 「먼저 응답한 사람이 앞」이라는 뜻인데, 지금은 재투표가 순서를
-- 안 바꾼다. 불참했다가 마음을 바꿔 참석으로 돌린 사람이 처음 응답 시각을
-- 그대로 들고 정원 안에 남는다 — 그 자리는 그 사이에 참석으로 응답한 사람 것이다.
--
-- ⚠ when 절이 이 트리거의 전부다.
--   같은 pill을 다시 누르는 경로가 있다(상태가 안 바뀌는 UPDATE). 조건 없이 올리면
--   그 탭 하나로 대기 순번이 맨 뒤로 밀린다 — 아무것도 안 바꿨는데 자리를 잃는다.
--   old.status is distinct from new.status로 「실제로 바뀐 때만」 올린다.
--   status는 not null이라 <>로도 되지만, null이 들어오는 날 조용히 안 도는 것보다
--   is distinct from이 낫다.
--
-- 백필은 안 한다. 기존 값은 「처음 응답한 시각」으로 이미 맞고, 재투표 이력이
-- 남아 있지 않아 「마지막으로 바꾼 시각」을 만들 재료가 없다. 없는 값을 지어내면
-- 대기 순번이 근거 없이 섞인다.
--
-- 이 트리거는 updated_at을 **설정**하지 보호하지는 않는다. 상태가 같은 UPDATE에서는
-- 안 돌므로, 클라이언트가 updated_at을 직접 실어 보내면 그 값이 그대로 들어간다.
-- 앱은 안 보낸다(castVote payload는 세 컬럼뿐). 보내기 시작하면 여기서 막을 게 아니라
-- 그 호출을 고쳐야 한다 — 컬럼 권한 문제지 트리거 문제가 아니다.
--
-- INSERT에는 안 건다. default now()가 이미 처리하고, before insert까지 걸면
-- 「기본값과 트리거 중 무엇이 찍었나」가 두 곳이 된다.

create or replace function touch_vote_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists attendance_votes_touch_updated_at on attendance_votes;
create trigger attendance_votes_touch_updated_at
  before update on attendance_votes
  for each row
  when (old.status is distinct from new.status)
  execute function touch_vote_updated_at();
