/**
 * Google Analytics (GA4) 연동 모듈
 * 사용자 테스트 기록 동의(계정마다 따로)가 켜진 동안에만 구글로 보낸다. 동의 전에는 스크립트도 받지 않는다.
 */

export const GA_TRACKING_ID = import.meta.env.VITE_GA_TRACKING_ID;

/**
 * 동의 상태에 맞춰 GA4를 켜고 끈다. 처음 켤 때 스크립트를 넣고, 끄면 GA 표준 차단 플래그(ga-disable-<ID>)로 이후 전송을 막는다.
 * @param {boolean} enabled 지금 로그인한 계정의 사용자 테스트 기록 동의
 */
export function setGAEnabled(enabled) {
  if (!GA_TRACKING_ID) return;
  window[`ga-disable-${GA_TRACKING_ID}`] = !enabled;
  if (!enabled || window.gtag) return;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_TRACKING_ID}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', GA_TRACKING_ID);
}

/** 지금 GA 로 보내도 되는가(ID 가 있고, 켜졌고, 끄지 않았다) */
export const gaActive = () => Boolean(GA_TRACKING_ID && window.gtag && !window[`ga-disable-${GA_TRACKING_ID}`]);

/**
 * GA4 이벤트 하나를 보낸다. 값은 코어의 UT 기록 허용 목록을 거친 것만 넘긴다(App 의 대기열 비우기).
 * @param {string} action 이벤트 이름
 * @param {Record<string, any>} [params] 추가 매개변수
 */
export function trackEvent(action, params = {}) {
  if (gaActive()) window.gtag('event', action, params);
}
