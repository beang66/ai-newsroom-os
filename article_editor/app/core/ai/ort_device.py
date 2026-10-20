"""로컬 ONNX 모델의 실행 장치 고르기 — Windows 는 DirectML(GPU) → CPU.

기준: DirectML 을 쓸 수 있고(onnxruntime-directml) 가장 큰 그래픽 카드의 전용 메모리가
모델 파일 크기 × 1.5 + 512MB 이상이면 GPU, 아니면 CPU. GPU 로 열거나 첫 실행이 실패하면 CPU 로 다시 연다.
측정(2026-10-20, GTX 1060 3GB): 경계 모델(0.4GB) CPU 7.8초 → GPU 1.1초, 판정기(2.4GB)는 메모리가 빠듯해 이점 없음
(CPU 1.7초/쌍, GPU 1.9초/쌍) → 판정기는 이 기준으로 CPU. 결과는 CPU 와 같음(30쌍 라벨 30/30).
제목(KeT5 BeamSearch 그래프)은 DirectML 에서 프로세스가 죽고, 부제(KoBART 토큰별 디코딩)는 GPU 가 더 느려 둘 다 늘 CPU(gpu=False).
AI_NEWSROOM_ONNX_DEVICE=cpu|gpu 로 강제할 수 있다(gpu 는 메모리 기준을 건너뛴다. 실패하면 그래도 CPU).
ponytail: Windows 만. 맥(CoreML)은 측정 후 선택이 필요해 아직 CPU.
"""
from __future__ import annotations

import os
import sys
import threading
from pathlib import Path

ENV = 'AI_NEWSROOM_ONNX_DEVICE'
DML, CPU = 'DmlExecutionProvider', 'CPUExecutionProvider'
_state: dict[str, dict] = {}  # 모델 파일 → {device, reason} (진단 화면용)


def gpu_memory() -> int:
    """가장 큰 그래픽 카드의 전용 메모리(바이트). 모르면 0. WMI 의 AdapterRAM 은 4GB 에서 잘리므로 레지스트리를 읽는다."""
    if sys.platform != 'win32':
        return 0
    import winreg
    best = 0
    key = r'SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}'
    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key) as root:
            for i in range(winreg.QueryInfoKey(root)[0]):
                try:
                    with winreg.OpenKey(root, winreg.EnumKey(root, i)) as sub:
                        best = max(best, int(winreg.QueryValueEx(sub, 'HardwareInformation.qwMemorySize')[0]))
                except (OSError, ValueError):
                    continue
    except OSError:
        return 0
    return best


def model_bytes(path: Path) -> int:
    """model.onnx + 바깥 가중치(model.onnx.data 등) 크기."""
    path = Path(path)
    return sum(f.stat().st_size for f in path.parent.glob(path.name + '*') if f.is_file())


def choose(path: Path, gpu: bool = True) -> tuple[str, str]:
    """('gpu'|'cpu', 이유). gpu=False 면 늘 CPU(DirectML 에서 프로세스가 죽는 그래프 — 잡을 수 없는 오류라 미리 막는다)."""
    import onnxruntime as ort
    if not gpu:
        return 'cpu', 'GPU 를 쓰지 않는 모델'
    forced = os.environ.get(ENV, 'auto').strip().lower()
    if forced == 'cpu':
        return 'cpu', f'{ENV}=cpu'
    if DML not in ort.get_available_providers():
        return 'cpu', 'DirectML 없음(onnxruntime-directml 미설치 또는 Windows 아님)'
    if forced == 'gpu':
        return 'gpu', f'{ENV}=gpu'
    need, have = model_bytes(path) * 1.5 + (512 << 20), gpu_memory()
    if have < need:
        return 'cpu', f'그래픽 메모리 {have / 2**30:.1f}GB < 필요 {need / 2**30:.1f}GB'
    return 'gpu', f'그래픽 메모리 {have / 2**30:.1f}GB ≥ 필요 {need / 2**30:.1f}GB'


class _Session:
    """InferenceSession 대역. GPU 는 동시 실행을 막고(DirectML 은 한 세션의 동시 run 미지원), 첫 실행이 실패하면 CPU 로 바꾼다."""

    def __init__(self, path, make, gpu=True):
        self._path, self._make = str(path), make
        self._lock = threading.Lock()
        self._ok = False
        device, reason = choose(path, gpu)
        self._sess = None
        if device == 'gpu':
            try:
                self._sess = make([DML, CPU])
            except Exception as exc:  # 드라이버·메모리 문제 등
                reason = f'GPU 로 열기 실패 → CPU ({type(exc).__name__})'
        if self._sess is None:
            self._sess = make([CPU])
            device = 'cpu'
        self._gpu = device == 'gpu'
        _state[self._path] = {'device': device, 'reason': reason}

    def run(self, *args, **kwargs):
        if not self._gpu:
            return self._sess.run(*args, **kwargs)
        with self._lock:
            try:
                out = self._sess.run(*args, **kwargs)
                self._ok = True
                return out
            except Exception as exc:
                if self._ok:
                    raise
                self._sess, self._gpu = self._make([CPU]), False
                _state[self._path] = {'device': 'cpu', 'reason': f'GPU 첫 실행 실패 → CPU ({type(exc).__name__})'}
        return self._sess.run(*args, **kwargs)

    def __getattr__(self, name):  # get_inputs() 등은 그대로
        return getattr(self._sess, name)


def session(path, options=None, gpu=True):
    """ort.InferenceSession(path, options, providers=…) 대신 쓴다. gpu=False: 늘 CPU."""
    import onnxruntime as ort
    options = options or ort.SessionOptions()

    def make(providers):
        if providers[0] == DML:  # DirectML 권장 설정
            options.enable_mem_pattern = False
            options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        return ort.InferenceSession(str(path), options, providers=providers)
    return _Session(path, make, gpu)


def status() -> dict:
    """진단용: {모델 파일: {device, reason}} + 그래픽 메모리."""
    return {'gpu_memory_gb': round(gpu_memory() / 2**30, 1), 'models': dict(_state)}
