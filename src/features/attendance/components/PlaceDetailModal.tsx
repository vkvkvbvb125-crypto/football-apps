import { Linking, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../components/nativeText';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../../theme';

const KAKAO_MAPS_JS_KEY = process.env.EXPO_PUBLIC_KAKAO_MAPS_JS_KEY;

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
    <script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_MAPS_JS_KEY}&autoload=false"></script>
    <script>
      kakao.maps.load(function () {
        var center = new kakao.maps.LatLng(${latitude}, ${longitude});
        new kakao.maps.StaticMap(document.getElementById('map'), {
          center: center,
          level: 3,
          marker: { position: center }
        });
      });
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
  const openDirections = () => {
    const url = `https://map.kakao.com/link/to/${encodeURIComponent(name)},${latitude},${longitude}`;
    Linking.openURL(url);
  };

  /*
    키가 없으면 지도를 안 그린다.

    EXPO_PUBLIC_KAKAO_MAPS_JS_KEY는 .env.example에만 있고 .env에는 없다(2026-08-29
    확인). 없는 채로 그리면 SDK 스크립트가 appkey=undefined로 로드돼 조용히 실패하고
    **빈 상자**가 남는다 — 「지도를 못 불러왔다」와 「원래 이런 화면이다」가 구별되지 않는다.

    그럴 때는 카카오맵으로 바로 여는 버튼만 둔다. 길찾기 링크는 키가 필요 없어서
    (map.kakao.com/link/to) 그건 언제나 동작한다.
  */
  if (!KAKAO_MAPS_JS_KEY) {
    return (
      <Pressable style={styles.webFallback} onPress={openDirections}>
        <Ionicons name="map-outline" size={20} color={colors.green} />
        <Text style={styles.webFallbackText}>여기를 눌러 카카오맵으로 열기</Text>
      </Pressable>
    );
  }

  // react-native-webview는 웹 플랫폼을 지원하지 않아서(자체적으로 에러 문구만 렌더링),
  // 웹에서는 지도 미리보기 대신 카카오맵으로 바로 여는 버튼만 보여준다. 앱(iOS/Android)에서는 지도 미리보기가 뜬다.
  if (Platform.OS === 'web') {
    return (
      <Pressable style={styles.webFallback} onPress={openDirections}>
        <Ionicons name="map-outline" size={20} color={colors.green} />
        <Text style={styles.webFallbackText}>지도 미리보기는 앱에서 볼 수 있어요{'\n'}여기를 눌러 카카오맵으로 열기</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.mapContainer}>
      <WebView
        source={{ html: buildMapHtml(latitude, longitude) }}
        style={styles.mapWebview}
        scrollEnabled={false}
        pointerEvents="none"
        javaScriptEnabled
        originWhitelist={['*']}
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

const styles = StyleSheet.create({
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
