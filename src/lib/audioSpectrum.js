// 재생 중인 소리의 세기(진폭)에 맞춰 스펙트럼 막대의 높이를 움직인다.
// - 가운데 막대가 낮은 소리(목소리의 중심)를, 바깥쪽 막대가 높은 소리를 나타내서 소리가 커질수록 마름모 모양이 부풀어 오른다.
// - 멈추면 막대가 천천히 원래의 마름모 모양(idle)으로 돌아온다.
// - 오디오가 막혀 분석할 수 없으면(예: 브라우저 제한) 막대는 그대로 두고 소리 재생에는 영향을 주지 않는다.

const FFT_SIZE = 256;
const BIN_SPAN = 48; // 가운데→가장자리에 쓰는 주파수 칸 수(사람 목소리가 모여 있는 낮은 쪽)

/** 오디오 요소와 분석기를 공유하는 상자(한 요소에는 소스를 한 번만 만들 수 있어서 기억해 둔다) */
export function createSpectrumState() {
  return { ctx: null, el: null, analyser: null };
}

function connect(state, audio) {
  const Ctx = typeof window !== "undefined" ? window.AudioContext || window.webkitAudioContext : null;
  if (!Ctx || !audio) return null;
  try {
    if (!state.ctx) state.ctx = new Ctx();
    if (state.el !== audio) {
      const source = state.ctx.createMediaElementSource(audio);
      const analyser = state.ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.6;
      analyser.minDecibels = -90; // 작은 소리도 막대에 보이고
      analyser.maxDecibels = -10; // 큰 소리에서도 꽉 차 버리지 않게 폭을 넓게 잡는다
      source.connect(analyser);
      analyser.connect(state.ctx.destination);
      state.el = audio;
      state.analyser = analyser;
    }
    state.ctx.resume?.().catch(() => {});
    return state.analyser;
  } catch {
    return state.el === audio ? state.analyser : null;
  }
}

/**
 * @param state createSpectrumState() 가 만든 상자
 * @param audio <audio> 요소
 * @param bars 막대 DOM 목록(가운데가 배열의 가운데)
 * @param idle 막대마다 멈췄을 때의 높이(%)
 * @param playing 재생 중인지
 * @returns 정리 함수
 */
export function runSpectrum(state, audio, bars, idle, playing) {
  const analyser = playing ? connect(state, audio) : null;
  const data = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
  const heights = bars.map((bar, index) => (bar ? parseFloat(bar.style.height) || idle[index] : idle[index]));
  const mid = (bars.length - 1) / 2;
  let frame = 0;
  const tick = () => {
    if (analyser) analyser.getByteFrequencyData(data);
    let moving = false;
    bars.forEach((bar, index) => {
      if (!bar) return;
      const edge = Math.abs(index - mid) / mid; // 0(가운데) → 1(가장자리)
      const level = data ? data[Math.min(data.length - 1, 1 + Math.floor(edge * BIN_SPAN))] / 255 : 0;
      const target = data
        ? Math.min(100, Math.max(6, idle[index] * 0.22 + Math.pow(level, 0.85) * 100 * (0.35 + 0.65 * (1 - edge))))
        : idle[index];
      const next = heights[index] + (target - heights[index]) * (data ? 0.45 : 0.12);
      if (Math.abs(next - heights[index]) > 0.05) moving = true;
      heights[index] = next;
      bar.style.height = `${next}%`;
    });
    if (data || moving) frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}
