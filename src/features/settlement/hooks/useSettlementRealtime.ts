// src/features/settlement/hooks/useSettlementRealtime.ts
// 진행중 정산의 입금 상태가 바뀌면 화면이 저절로 따라가게 한다.
// settlement-flow.md 「진행률」 — 총무가 보고 있는 동안 팀원이 "송금 완료"를 누르면
// 새로고침 없이 진행률이 갱신되어야 한다.
//
// ⚠ DB 설정 의존: supabase/migrations/20260807_settlement_realtime.sql 을 적용해야 동작한다.
//   (settlement_shares가 supabase_realtime 발행 대상에 없으면 이벤트가 오지 않는다.)
//   적용 전이라도 화면은 정상 동작한다 — 자동 갱신만 안 될 뿐이라 조용히 실패해도 안전하다.
import { useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabase';

/**
 * @param settlementId 구독할 정산. null이면 구독하지 않는다.
 * @param onChange 변경이 감지됐을 때 호출 — 보통 목록 다시 불러오기.
 */
export function useSettlementRealtime(settlementId: string | null, onChange: () => void) {
  // onChange가 매 렌더 새 함수로 와도 구독을 다시 만들지 않도록 ref에 담아둔다.
  // (구독을 다시 만들면 소켓이 계속 끊겼다 붙는다)
  const handler = useRef(onChange);
  handler.current = onChange;

  /**
   * 구독마다 다른 채널 이름을 쓴다.
   *
   * 홈과 정산 화면은 탭 네비게이터라 동시에 살아 있고, 같은 정산을 함께 구독한다.
   * 이름이 같으면 두 번째가 이미 subscribe()된 채널에 핸들러를 붙이려다
   * "cannot add postgres_changes callbacks after subscribe()"로 터진다.
   * 개발 모드의 이펙트 재실행에서도 같은 충돌이 났다.
   */
  const instanceId = useRef<string | null>(null);
  if (!instanceId.current) instanceId.current = Math.random().toString(36).slice(2, 10);

  useEffect(() => {
    if (!settlementId) return;

    // 실시간은 있으면 좋은 기능이다 — 여기서 뭐가 잘못돼도 정산 화면 자체는 살아 있어야 한다
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`settlement-shares:${settlementId}:${instanceId.current}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'settlement_shares',
            filter: `settlement_id=eq.${settlementId}`,
          },
          () => handler.current()
        )
        .subscribe();
    } catch (e) {
      console.warn('[settlement] 실시간 구독 실패 — 화면 복귀 시 갱신으로 동작합니다', e);
    }

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [settlementId]);
}
