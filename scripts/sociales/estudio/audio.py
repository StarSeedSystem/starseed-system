"""audio.py — el sonido del Estudio MetaGeminis: síntesis propia con numpy (sin muestras, sin música de nadie).

Una pieza = una cama (drone en 432 Hz con quinta y octava, lento y cálido) + notas puntuales en los pulsos del guion
(escala justa sobre 432 Hz) + eventos (germinación = golpe grave y barrido, campana en 528 Hz al llamado) + reverberación
sintética. Todo con envolventes y fundidos: nada empieza ni acaba en seco. La mezcla se normaliza a −14 LUFS con
loudnorm de dos pasadas (codificar.normalizar_wav). Determinista: la misma semilla da el mismo audio.
"""
from __future__ import annotations

import wave
from pathlib import Path

import numpy as np
from scipy.signal import fftconvolve

SR = 48000
RAIZ_HZ = 432.0
ESCALA_JUSTA = [1.0, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2.0, 9 / 4, 5 / 2]  # mayor pentatónica + octava, afinación justa


def _t(n: int) -> np.ndarray:
    return np.arange(n) / SR


def _env_ad(n: int, ataque: float, caida: float) -> np.ndarray:
    t = _t(n)
    a = np.clip(t / max(ataque, 1e-4), 0, 1) ** 2
    return a * np.exp(-t / max(caida, 1e-3))


def cama(dur: float, estilo: str, rng: np.random.Generator) -> np.ndarray:
    """Drone: raíz + quinta + octava con vibrato lento; el estilo cambia el brillo y el movimiento."""
    n = int(dur * SR)
    t = _t(n)
    cfg = {
        "semilla": (RAIZ_HZ / 2, [1.0, 1.5, 2.0, 3.0], [1.0, 0.55, 0.38, 0.12], 0.07),
        "malla": (RAIZ_HZ / 2, [1.0, 1.5, 2.0, 2.25], [1.0, 0.5, 0.4, 0.2], 0.1),
        "cristal": (RAIZ_HZ / 2, [1.0, 1.5, 2.0, 4.0], [0.9, 0.5, 0.5, 0.22], 0.05),
        "espiral": (RAIZ_HZ / 2, [1.0, 1.5, 2.0, 2.5], [1.0, 0.6, 0.35, 0.25], 0.12),
    }.get(estilo, (RAIZ_HZ / 2, [1.0, 1.5, 2.0], [1.0, 0.5, 0.3], 0.08))
    f0, ratios, amps, lfo_hz = cfg
    y = np.zeros(n)
    for r, a in zip(ratios, amps):
        for det in (-0.9, 0.0, 0.9):  # tres voces desafinadas ~1 Hz: efecto coral
            fase = rng.uniform(0, 2 * np.pi)
            vib = 1 + 0.0015 * np.sin(2 * np.pi * (lfo_hz + rng.uniform(-0.02, 0.02)) * t + fase)
            y += a * np.sin(2 * np.pi * (f0 * r + det) * vib * t + fase) / 3
    lfo = 0.75 + 0.25 * np.sin(2 * np.pi * lfo_hz * t - 1.2)
    fade = np.clip(t / 1.6, 0, 1) ** 2 * np.clip((dur - t) / 1.8, 0, 1) ** 2
    return y * lfo * fade * 0.5


def nota(hz: float, dur: float, brillo: float = 1.0) -> np.ndarray:
    """Nota tipo kalimba/campana de cristal: senoidal + parciales inarmónicos suaves, caída exponencial."""
    n = int(dur * SR)
    t = _t(n)
    env = _env_ad(n, 0.004, dur / 4.5)
    y = np.sin(2 * np.pi * hz * t) + 0.35 * brillo * np.sin(2 * np.pi * hz * 2.76 * t) * np.exp(-t * 7) + 0.18 * brillo * np.sin(2 * np.pi * hz * 5.4 * t) * np.exp(-t * 11)
    return y * env * 0.42


def golpe_grave(dur: float = 2.4) -> np.ndarray:
    """Germinación: golpe sub-grave con barrido descendente (54→36 Hz) y un soplo de aire filtrado."""
    n = int(dur * SR)
    t = _t(n)
    f = 36 + 18 * np.exp(-t * 3.0)
    ph = 2 * np.pi * np.cumsum(f) / SR
    y = np.sin(ph) * _env_ad(n, 0.01, 0.55) * 0.9
    rng = np.random.default_rng(5)
    aire = rng.standard_normal(n)
    aire = np.convolve(aire, np.ones(40) / 40, mode="same")
    y += aire * _env_ad(n, 0.25, 0.4) * 0.07
    return y


def barrido(dur: float = 2.4, f0: float = 220, f1: float = 880) -> np.ndarray:
    """Subida tonal (riser) que anuncia el llamado final."""
    n = int(dur * SR)
    t = _t(n)
    f = f0 * (f1 / f0) ** (t / dur)
    ph = 2 * np.pi * np.cumsum(f) / SR
    env = (t / dur) ** 2.2 * np.clip((dur - t) / 0.06, 0, 1)
    return np.sin(ph) * env * 0.12


def campana(hz: float = 528.0, dur: float = 4.5) -> np.ndarray:
    n = int(dur * SR)
    t = _t(n)
    y = np.zeros(n)
    for r, a, d in [(1.0, 1.0, 3.2), (2.0, 0.45, 2.2), (2.76, 0.3, 1.5), (4.1, 0.15, 1.0), (5.4, 0.1, 0.7)]:
        y += a * np.sin(2 * np.pi * hz * r * t) * np.exp(-t / d)
    return y * np.clip(t / 0.006, 0, 1) * 0.35


def reverberacion(y: np.ndarray, seg: float = 2.2, mezcla: float = 0.3, semilla: int = 3) -> np.ndarray:
    """Reverb por convolución con una respuesta sintética estéreo (ruido filtrado con caída exponencial)."""
    rng = np.random.default_rng(semilla)
    n = int(seg * SR)
    t = _t(n)
    out = []
    for _ in range(2):
        ir = rng.standard_normal(n) * np.exp(-t * 3.1)
        ir = np.convolve(ir, np.ones(6) / 6, mode="same")  # paso bajo suave
        ir[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))
        ir /= np.sqrt(np.sum(ir**2)) + 1e-9
        out.append(fftconvolve(y, ir)[: len(y)])
    humedo = np.stack(out, axis=1)
    seco = np.stack([y, y], axis=1)
    return seco * (1 - mezcla) + humedo * mezcla


def _mezclar(destino: np.ndarray, fuente: np.ndarray, t0: float, ganancia: float = 1.0, pan: float = 0.0) -> None:
    i0 = int(t0 * SR)
    if i0 >= len(destino):
        return
    f = fuente[: len(destino) - i0] * ganancia
    destino[i0 : i0 + len(f), 0] += f * (0.5 - pan * 0.5) * 1.4
    destino[i0 : i0 + len(f), 1] += f * (0.5 + pan * 0.5) * 1.4


def sintetizar(duracion: float, pulsos: list[float], estilo: str = "semilla", eventos: list[dict] | None = None, semilla: int = 11) -> np.ndarray:
    """Devuelve la mezcla estéreo (n, 2) en float32 [-1, 1], con fundidos de entrada y salida."""
    rng = np.random.default_rng(semilla)
    n = int(duracion * SR)
    base = cama(duracion, estilo, rng)
    notas = np.zeros((n, 2))
    for k, tp in enumerate(pulsos):
        grado = ESCALA_JUSTA[(k * 2 + (1 if estilo == "malla" else 0)) % len(ESCALA_JUSTA)]
        hz = RAIZ_HZ * grado * (1 if k % 3 else 2) / (2 if estilo in ("cristal",) else 1)
        _mezclar(notas, nota(hz, 2.6, 1.0 if estilo != "malla" else 0.6), tp, 0.55, pan=np.sin(k * 1.7) * 0.5)
    for ev in eventos or []:
        t0 = float(ev["t"])
        tipo = ev.get("tipo")
        if tipo == "germinar":
            _mezclar(notas, golpe_grave(), t0, 0.95)
        elif tipo == "barrido":
            _mezclar(notas, barrido(float(ev.get("dur", 2.4))), t0 - float(ev.get("dur", 2.4)) + 0.02, 1.0)
        elif tipo == "campana":
            _mezclar(notas, campana(float(ev.get("hz", 528.0))), t0, 0.9)
    humedo = reverberacion(notas.mean(axis=1), mezcla=1.0)
    y = np.stack([base, base], axis=1) * 0.6 + notas * 0.8 + humedo * 0.55
    t = _t(n)
    fade = np.clip(t / 0.5, 0, 1) * np.clip((duracion - t) / 0.9, 0, 1)
    y *= fade[:, None]
    pico = np.max(np.abs(y)) + 1e-9
    return (y / pico * 0.8).astype(np.float32)


def escribir_wav(ruta: Path, y: np.ndarray) -> None:
    pcm = np.clip(y, -1, 1)
    pcm = (pcm * 32767).astype("<i2")
    with wave.open(str(ruta), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
