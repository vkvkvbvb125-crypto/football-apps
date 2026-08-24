// src/features/home/components/bannerSlides.ts — 배너에 무엇을 올릴지
//
// HomeScreen에서 뺐다. 거기는 react-native를 import해서 검사 스크립트가 부를 수 없는데,
// 여기 있는 건 전부 분기다 — 어떤 슬라이드가 들어가고 빠지는지, D-day를 며칠로 세는지,
// 지난달과 비교할 수 있는지. 값이 아니라 조건이라 돌려봐야 안다.
//
// 값이 없는 슬라이드는 배열에서 뺀다. 「-」나 「아직 없어요」로 자리를 채우면 넘길수록
// 빈 화면만 나오는 캐러셀이 된다. 브랜드는 항상 있어서 최소 한 장은 남는다.
import type { BannerSlide } from './HomeBanner';

export interface BannerInput {
  /** 이번 달 팀 참석률. rate가 null이면 셀 경기가 없었다는 뜻 */
  thisMonth: { rate: number | null };
  /** 지난달 — 기준선이 없으면 증감을 말하지 않는다 */
  lastMonth: { rate: number | null };
  /** 다음 예정 경기. 없으면 D-day 슬라이드가 빠진다 */
  nextMatch: { matchDate: string; location?: string | null } | null;
  now?: Date;
}

/** 자정 기준 일수 — 시각까지 넣으면 오늘 저녁 경기가 반올림에 따라 D-1로도 보인다 */
function daysUntil(target: Date, now: Date) {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((startOfDay(target) - startOfDay(now)) / 86400000);
}

export function buildBannerSlides(input: BannerInput): BannerSlide[] {
  const now = input.now ?? new Date();
  const slides: BannerSlide[] = [{ kind: 'brand' }];

  if (input.thisMonth.rate != null) {
    const pct = Math.round(input.thisMonth.rate * 100);
    // 지난달에 셀 경기가 없으면 증감을 말할 수 없다. 0%p로 적으면 「그대로」라는 거짓말이 된다.
    const diff = input.lastMonth.rate == null ? null : pct - Math.round(input.lastMonth.rate * 100);
    slides.push({
      kind: 'stat',
      label: '이번 달 팀 참석률',
      value: `${pct}%`,
      sub:
        diff == null
          ? undefined
          : diff === 0
            ? '지난달과 같아요'
            : `지난달보다 ${diff > 0 ? '+' : ''}${diff}%p`,
    });
  }

  if (input.nextMatch) {
    const days = daysUntil(new Date(input.nextMatch.matchDate), now);
    slides.push({
      kind: 'stat',
      label: '다음 경기',
      // 지난 경기가 next로 잡히는 유예 구간이 있어(NEXT_MATCH_GRACE_MS) 음수도 나온다
      value: days === 0 ? 'D-DAY' : days > 0 ? `D-${days}` : `D+${-days}`,
      sub: input.nextMatch.location ?? undefined,
    });
  }

  return slides;
}
