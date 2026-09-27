// src/features/ads/HomeAdCard.tsx — 홈 「최근 공지」 아래 네이티브 광고 카드 하나.
//
// ── ⚠ 우리 카드처럼 보이면 안 된다 ────────────────────────────────
// 네이티브 광고는 **우리가 그린다.** 그래서 가만두면 SectionCard와 똑같이 생긴다 —
// 그러면 사용자가 공지인 줄 안다. AdMob 정책이자 표시광고 법의 요구이기도 하다.
// 구별을 **세 겹**으로 만든다:
//
//   ㉮ 초록 결(SoftTint)을 **안 깐다.** SectionCard는 tone이 plain이어도 결을 깐다
//      (HomeScreen의 SectionCard 머리말) — 결이 없는 것이 재질의 1차 구별이다
//   ㉯ 위에 **우리 구역 제목을 안 붙인다.** 「최근 공지」처럼 제목을 주면 우리 것이 된다
//   ㉰ 좌상단에 **「광고」 배지**. 문구는 「광고」 하나다 —
//      `AD`·`Sponsored`는 안 쓴다(한국 한정 출시다)
//
// ── ⚠ 못 받으면 **자리를 접는다** ─────────────────────────────────
// 미채움·망 없음·실패는 전부 `null`이다. 카드도 제목도 **빈 칸도** 안 남긴다 —
// 채워지지 않는 플레이스홀더는 앱이 고장 나 보인다.
//
// ⚠ **재시도하지 않는다.** 망이 끊긴 동안 요청이 쌓인다. 한 번 실패하면 그 화면에서는
//   끝이다. 홈에 다시 들어오면 그때 한 번 더 시도한다.
//
// ⚠ 늦게 도착하면 스크롤 중에 카드가 **끼어든다**(레이아웃 점프). 그걸 감수할 수 있는
//   이유는 이 카드가 **홈의 마지막**이기 때문이다 — 위 내용(경기·정산·공지)을 안 밀어낸다.
//   「최근 공지 아래」를 고른 이유가 이것이기도 하다(docs/admob.md ③).
import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import {
  NativeAd,
  NativeAdView,
  NativeAsset,
  NativeAssetType,
} from 'react-native-google-mobile-ads';
import { Text } from '../../components/nativeText';
import { radius, type Palette } from '../../theme';
import { useThemed } from '../../lib/useThemed';
import { HOME_NATIVE_UNIT_ID, ensureAdsReady } from './adUnits';

export function HomeAdCard() {
  const { styles } = useThemed(makeStyles);
  const [ad, setAd] = useState<NativeAd | null>(null);

  useEffect(() => {
    let alive = true;
    let loaded: NativeAd | null = null;

    void (async () => {
      try {
        await ensureAdsReady();
        const next = await NativeAd.createForAdRequest(HOME_NATIVE_UNIT_ID);
        /*
          ⚠ **떠난 화면에 붙이지 마라.** 받아 오는 사이에 홈을 벗어났으면
            상태를 세우는 대신 **광고를 버린다** — 안 버리면 네이티브 쪽 객체가 남는다.
        */
        if (!alive) {
          next.destroy();
          return;
        }
        loaded = next;
        setAd(next);
      } catch {
        /* 미채움·망 없음·실패 — 전부 조용히 접는다. 사용자에게 할 말이 없다 */
      }
    })();

    return () => {
      alive = false;
      loaded?.destroy();
    };
  }, []);

  if (!ad) return null;

  return (
    <NativeAdView nativeAd={ad} style={styles.card}>
      <View style={styles.head}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>광고</Text>
        </View>
        {!!ad.advertiser && (
          <Text style={styles.advertiser} numberOfLines={1}>
            {ad.advertiser}
          </Text>
        )}
      </View>

      <View style={styles.body}>
        {!!ad.icon?.url && (
          /* ⚠ 아이콘 뒤에 배경을 깔지 않는다. 소재가 흰 바탕이면 다크에서 튀는데,
             우리가 못 정하는 부분이라 **덧칠하지 않고 모서리만 자른다** */
          <NativeAsset assetType={NativeAssetType.ICON}>
            <Image source={{ uri: ad.icon.url }} style={styles.icon} resizeMode="cover" />
          </NativeAsset>
        )}
        <View style={styles.texts}>
          <NativeAsset assetType={NativeAssetType.HEADLINE}>
            <Text style={styles.headline} numberOfLines={2}>
              {ad.headline}
            </Text>
          </NativeAsset>
          {!!ad.body && (
            <NativeAsset assetType={NativeAssetType.BODY}>
              <Text style={styles.bodyText} numberOfLines={2}>
                {ad.body}
              </Text>
            </NativeAsset>
          )}
        </View>
      </View>

      {!!ad.callToAction && (
        <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
          <View style={styles.cta}>
            <Text style={styles.ctaText} numberOfLines={1}>
              {ad.callToAction}
            </Text>
          </View>
        </NativeAsset>
      )}
    </NativeAdView>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    /* ⚠ SoftTint 없음 — 그게 우리 카드와 갈리는 첫째 신호다 */
    card: {
      borderRadius: radius.card,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      backgroundColor: colors.cardAlt,
      padding: 14,
      gap: 10,
    },
    head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    /* 「광고」 배지 — 우리 초록을 안 쓴다. 초록은 우리 것이라는 신호다 */
    badge: {
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: radius.chip,
      backgroundColor: colors.neutralFill,
    },
    badgeText: { color: colors.textBody, fontSize: 10, fontWeight: '800' },
    advertiser: { flex: 1, color: colors.textFaint, fontSize: 11, fontWeight: '600' },

    body: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    icon: { width: 44, height: 44, borderRadius: radius.chip },
    texts: { flex: 1, gap: 3, minWidth: 0 },
    headline: { color: colors.text, fontSize: 14, fontWeight: '700' },
    bodyText: { color: colors.textDim, fontSize: 12, fontWeight: '500' },

    cta: {
      alignSelf: 'flex-start',
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: radius.button,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.neutralFill,
    },
    ctaText: { color: colors.textStrong, fontSize: 12, fontWeight: '700' },
  });
