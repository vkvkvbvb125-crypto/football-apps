import { useState } from 'react';
import { Linking, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../components/nativeText';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { type Palette } from '../../../theme';
import { useThemed } from '../../../lib/useThemed';

const KAKAO_MAPS_JS_KEY = process.env.EXPO_PUBLIC_KAKAO_MAPS_JS_KEY;

/**
 * WebView 문서의 origin.
 *
 * ⚠ 이 값은 **카카오 개발자 콘솔의 JS SDK 도메인에 등록된 것과 일치해야 한다.**
 *   바꾸면 콘솔도 함께 고쳐야 하고, 안 그러면 지도가 조용히 안 뜬다.
 *
 * 왜 필요한가: 이 WebView는 `source={{ html }}`로 문자열을 직접 그린다. baseUrl을 안
 * 주면 문서가 about:blank가 되어 **origin이 없고**, 그러면 도메인을 아무리 등록해도
 * 소용이 없다 — 등록은 「이 도메인에서 온 요청을 허용한다」인데 보낼 도메인이 없다.
 *
 *   react-native-webview 레퍼런스:
 *     "baseUrl is used for any relative links in the HTML and is also used for
 *      the origin header with CORS requests made from the WebView."
 *   카카오 데브톡:
 *     「등록을 안 하고 직접 html을 생성하여 요청할 수 있지만, 정적인 지도만 생성
 *      가능하고 라이브러리의 사용이 불가합니다.」
 *
 * 우리는 kakao.maps.StaticMap을 쓴다 — 이름이 「Static」이지만 JS SDK **라이브러리**다.
 * 이미지 URL을 부르는 방식이 아니라 SDK가 캔버스를 그리는 것이라 등록이 필요하다.
 */
const MAP_BASE_URL = 'https://kickday.app';

/*
  지도를 그리는 HTML.

  SDK가 실패했을 때를 RN 쪽에 알린다. 실패 경로가 여럿인데 **전부 조용하다**:
    · 스크립트 자체가 안 받아짐        → onerror
    · 받았는데 kakao.maps가 없음        → 등록 안 된 도메인에서 흔한 모양
    · load 콜백이 영영 안 불림          → 타임아웃
    · 그리다가 던짐                     → try/catch
  넷 다 잡아서 postMessage로 보낸다. 안 보내면 빈 상자가 남고, 사용자는
  「지도를 못 불러왔다」와 「원래 이런 화면이다」를 구별할 수 없다.

  window.onerror를 먼저 걸어 두는 이유는, SDK 스크립트 안에서 나는 오류가
  아래 try/catch에 안 잡히기 때문이다.
*/
function buildMapHtml(latitude: number, longitude: number) {
  return `
<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <style>html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #161D18; }</style>
  </head>
  <body>
    <div id="map"></div>
    <script>
      var reported = false;
      function fail(why) {
        if (reported) return;
        reported = true;
        if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage('mapfail:' + why);
      }
      window.onerror = function () { fail('script-error'); };
      setTimeout(function () { fail('timeout'); }, 8000);
    </script>
    <script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_MAPS_JS_KEY}&autoload=false" onerror="fail('script-load')"></script>
    <script>
      try {
        if (!window.kakao || !window.kakao.maps) {
          fail('no-sdk');
        } else {
          kakao.maps.load(function () {
            try {
              var center = new kakao.maps.LatLng(${latitude}, ${longitude});
              new kakao.maps.StaticMap(document.getElementById('map'), {
                center: center,
                level: 3,
                marker: { position: center }
              });
              reported = true; // 성공 — 타임아웃이 나중에 fail을 못 부르게 막는다
            } catch (e) {
              fail('render');
            }
          });
        }
      } catch (e) {
        fail('load');
      }
    </script>
  </body>
</html>`;
}

interface KakaoMapPreviewProps {
  latitude: number;
  longitude: number;
  name: string;
}

function KakaoMapPreview({ latitude, longitude, name }: KakaoMapPreviewProps) {
  const { colors, styles } = useThemed(makeStyles);
  /*
    지도가 안 그려진 경우로 떨어졌는지.

    「키가 없다」는 아래에서 미리 걸러지는데, **「키는 있는데 도메인이 등록 안 됐다」**는
    걸러지지 않았다. 그때 SDK는 스크립트를 200으로 내려주고 kakao.maps만 안 만들어서
    빈 상자가 남는다 — 실패와 「원래 이런 화면」의 출력이 같아진다.
    HTML 쪽에서 네 경로를 다 잡아 postMessage로 보내고, 여기서 폴백으로 떨어뜨린다.
  */
  const [mapFailed, setMapFailed] = useState(false);

  const openDirections = () => {
    const url = `https://map.kakao.com/link/to/${encodeURIComponent(name)},${latitude},${longitude}`;
    Linking.openURL(url);
  };

  const fallback = (note: string) => (
    <Pressable style={styles.webFallback} onPress={openDirections}>
      <Ionicons name="map-outline" size={20} color={colors.green} />
      <Text style={styles.webFallbackText}>{note}</Text>
    </Pressable>
  );

  /*
    키가 없으면 지도를 안 그린다.

    EXPO_PUBLIC_KAKAO_MAPS_JS_KEY 없이 그리면 SDK 스크립트가 appkey=undefined로
    로드돼 조용히 실패하고 빈 상자가 남는다.
    길찾기 링크(map.kakao.com/link/to)는 키가 필요 없어 언제나 동작한다.
  */
  if (!KAKAO_MAPS_JS_KEY) return fallback('여기를 눌러 카카오맵으로 열기');

  // react-native-webview는 웹 플랫폼을 지원하지 않아서(자체적으로 에러 문구만 렌더링),
  // 웹에서는 지도 미리보기 대신 카카오맵으로 바로 여는 버튼만 보여준다. 앱(iOS/Android)에서는 지도 미리보기가 뜬다.
  if (Platform.OS === 'web') {
    return fallback('지도 미리보기는 앱에서 볼 수 있어요\n여기를 눌러 카카오맵으로 열기');
  }

  if (mapFailed) return fallback('지도를 불러오지 못했어요\n여기를 눌러 카카오맵으로 열기');

  return (
    <View style={styles.mapContainer}>
      <WebView
        source={{ html: buildMapHtml(latitude, longitude), baseUrl: MAP_BASE_URL }}
        style={styles.mapWebview}
        scrollEnabled={false}
        pointerEvents="none"
        javaScriptEnabled
        originWhitelist={['*']}
        onMessage={(e) => {
          if (e.nativeEvent.data.startsWith('mapfail:')) setMapFailed(true);
        }}
        /* 네트워크·HTTP 단계의 실패는 WebView가 직접 알려준다 */
        onError={() => setMapFailed(true)}
        onHttpError={() => setMapFailed(true)}
      />
      <Pressable style={StyleSheet.absoluteFill} onPress={openDirections} />
    </View>
  );
}

interface PlaceDetailModalProps {
  visible: boolean;
  onClose: () => void;
  name: string;
  category: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
}

export function PlaceDetailModal({ visible, onClose, name, category, address, latitude, longitude }: PlaceDetailModalProps) {
  const { colors, styles } = useThemed(makeStyles);
  const showMap = latitude != null && longitude != null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>경기 장소</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={20} color="#8A9490" />
            </Pressable>
          </View>

          <Text style={styles.placeName}>{name}</Text>
          {!!category && (
            <View style={styles.categoryTag}>
              <Text style={styles.categoryTagText}>{category}</Text>
            </View>
          )}
          {!!address && <Text style={styles.address}>{address}</Text>}

          {showMap && <KakaoMapPreview latitude={latitude as number} longitude={longitude as number} name={name} />}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: 320,
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  placeName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 8,
  },
  categoryTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.cardRaised,
  },
  categoryTagText: {
    color: colors.green,
    fontSize: 10,
    fontWeight: '700',
  },
  address: {
    color: '#8A9490',
    fontSize: 13,
  },
  mapContainer: {
    marginTop: 12,
    height: 180,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.card,
  },
  mapWebview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  webFallback: {
    marginTop: 12,
    height: 96,
    borderRadius: 12,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  webFallbackText: {
    color: '#8A9490',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
  },
  });
