// src/lib/webViewport.ts — 웹에서만 필요한 뷰포트 보정 (네이티브에서는 no-op)
import { Platform } from 'react-native';

/**
 * 두 가지를 잡는다.
 *
 * 1) html/body 배경이 투명이라, 앱 루트가 창을 전부 덮지 못하는 순간 브라우저 기본
 *    흰색이 가장자리로 비친다. 배경색을 앱과 같은 색으로 깔아 그 틈을 없앤다.
 *
 * 2) Expo web 기본 루트 높이는 100%다. 모바일 브라우저에서 100%는 주소창까지 포함한
 *    "큰 뷰포트" 기준이라, 하단에 붙는 탭바가 브라우저 UI 밑으로 들어가 잘려 보인다.
 *    dvh(실제로 보이는 높이)를 1차 방어선으로 깔아두지만, dvh는 구형 모바일 브라우저
 *    (iOS 15.3 이하 Safari 등)에서 아예 지원되지 않아 조용히 무시될 수 있다 — 그 경우
 *    100%로 되돌아가 버그가 재발한다. 그래서 실제 정답인 visualViewport.height를
 *    JS로 직접 읽어 인라인 스타일로 덮어쓴다. 인라인 스타일이 스타일시트보다 우선하므로
 *    dvh를 지원하든 안 하든 이쪽이 항상 이긴다. 주소창이 나타나거나 사라질 때마다
 *    resize 이벤트가 다시 불려서 높이가 실시간으로 따라간다.
 */
export function applyWebViewportFix() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  if (document.getElementById('kickday-viewport-fix')) return;

  const style = document.createElement('style');
  style.id = 'kickday-viewport-fix';
  style.textContent = [
    'html, body { background-color: #0F1411; }',
    'html, body, #root { height: 100dvh; }',
  ].join('\n');
  document.head.appendChild(style);

  const vv = window.visualViewport;
  if (!vv) return; // 극히 오래된 브라우저 — dvh 규칙에 맡긴다

  const applyHeight = () => {
    const px = `${vv.height}px`;
    document.documentElement.style.height = px;
    document.body.style.height = px;
    const root = document.getElementById('root');
    if (root) root.style.height = px;
  };

  applyHeight();
  vv.addEventListener('resize', applyHeight);
}
