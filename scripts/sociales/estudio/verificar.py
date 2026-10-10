"""verificar.py — el control de calidad del Estudio MetaGeminis. Nada sale a «para aprobar» sin pasar estas puertas.

  contraste     cada texto frente al fondo REAL de la escena (fotograma renderizado con el texto oculto): WCAG AA
                (≥ 4,5 texto normal, ≥ 3 texto grande: ≥ 24 px, o ≥ 18,66 px en negrita).
  zona segura   ningún texto sale de los márgenes del formato ni cae sobre la interfaz de la plataforma.
  destellos     como mucho 3 destellos por segundo (WCAG 2.3.1) medido sobre la luminancia media de cada fotograma.
  vídeo         códec, píxeles, duración, fps, peso, +faststart, audio y sonoridad (−14 LUFS ±1,5).
  QR            el código impreso se decodifica y lleva la dirección esperada.
Las funciones puras (razón de contraste, intersecciones, destellos) están probadas en test_estudio.py.
"""
from __future__ import annotations

import io
import re
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image

import codificar

UMBRAL_NORMAL = 4.5
UMBRAL_GRANDE = 3.0


def parse_color(css: str) -> tuple[int, int, int]:
    m = re.match(r"rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)", css or "")
    if not m:
        raise ValueError(f"color no reconocido: {css!r}")
    return tuple(int(round(float(x))) for x in m.groups())  # type: ignore[return-value]


def _lin(c: np.ndarray | float) -> np.ndarray | float:
    c = np.asarray(c, dtype=np.float64) / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def luminancia(rgb: tuple[int, int, int]) -> float:
    r, g, b = (float(_lin(x)) for x in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def razon_contraste(l1: float, l2: float) -> float:
    a, b = max(l1, l2), min(l1, l2)
    return (a + 0.05) / (b + 0.05)


def es_texto_grande(px: float, peso: str | int) -> bool:
    p = int(peso) if str(peso).isdigit() else (700 if str(peso) == "bold" else 400)
    return px >= 24 or (px >= 18.66 and p >= 700)


def luminancia_de_imagen(img: Image.Image) -> np.ndarray:
    a = np.asarray(img.convert("RGB"), dtype=np.float64)
    lin = _lin(a)
    return 0.2126 * lin[..., 0] + 0.7152 * lin[..., 1] + 0.0722 * lin[..., 2]


def medir_contraste(png_sin_texto: bytes, capas: list[dict], ancho_css: int, alto_css: int, percentil: float = 95.0) -> list[dict]:
    """Por cada capa de texto: contraste del color del texto frente al percentil 95 de luminancia del fondo bajo sus rectángulos.
    El percentil alto es el caso difícil (texto claro sobre lo más brillante que tenga debajo)."""
    img = Image.open(io.BytesIO(png_sin_texto))
    L = luminancia_de_imagen(img)
    sx, sy = img.width / ancho_css, img.height / alto_css
    out = []
    for c in capas:
        try:
            lt = luminancia(parse_color(c["color"]))
        except ValueError:
            continue
        peor_bg = 0.0
        for x, y, w, h in c["rects"]:
            x0, y0 = max(0, int(x * sx)), max(0, int(y * sy))
            x1, y1 = min(img.width, int((x + w) * sx) + 1), min(img.height, int((y + h) * sy) + 1)
            if x1 <= x0 or y1 <= y0:
                continue
            peor_bg = max(peor_bg, float(np.percentile(L[y0:y1, x0:x1], percentil)))
        r = razon_contraste(lt, peor_bg)
        grande = es_texto_grande(c["tam"], c["peso"])
        umbral = UMBRAL_GRANDE if grande else UMBRAL_NORMAL
        out.append({"id": c["id"], "rol": c["rol"], "texto": c["texto"], "razon": round(r, 2), "umbral": umbral, "grande": grande, "ok": r >= umbral, "fondo_p95": round(peor_bg, 3)})
    return out


# ───────────────────────── zona segura ─────────────────────────

def interseccion(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    w = min(ax + aw, bx + bw) - max(ax, bx)
    h = min(ay + ah, by + bh) - max(ay, by)
    return max(0.0, w) * max(0.0, h)


def comprobar_zona_segura(capas: list[dict], formato: dict, tolerancia: float = 2.0) -> list[dict]:
    """Devuelve las infracciones: texto fuera de los márgenes o encima de una zona que la interfaz tapa."""
    m = formato["margenes"]
    x0, y0 = m["izquierda"] - tolerancia, m["arriba"] - tolerancia
    x1, y1 = formato["ancho"] - m["derecha"] + tolerancia, formato["alto"] - m["abajo"] + tolerancia
    malas = []
    for c in capas:
        for r in c["rects"]:
            x, y, w, h = r
            if x < x0 or y < y0 or x + w > x1 or y + h > y1:
                malas.append({"id": c["id"], "texto": c["texto"], "motivo": "fuera de la zona segura", "rect": [round(v, 1) for v in r]})
                break
            for z in formato.get("evitar") or []:
                if interseccion((x, y, w, h), (z["izquierda"], z["arriba"], z["ancho"], z["alto"])) > 4:
                    malas.append({"id": c["id"], "texto": c["texto"], "motivo": f"tapado por la interfaz ({z['motivo']})", "rect": [round(v, 1) for v in r]})
                    break
    return malas


# ───────────────────────── destellos (WCAG 2.3.1) ─────────────────────────

def luminancias_por_fotograma(video: Path) -> list[float]:
    """Luminancia media (0–1, sobre el valor de luma del códec) de cada fotograma, con ffmpeg/signalstats."""
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(video), "-vf", "scale=96:-2,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-", "-an", "-f", "null", "-"],
                       capture_output=True, text=True, timeout=900)
    vals = [float(x) / 255.0 for x in re.findall(r"YAVG=([\d.]+)", r.stdout)]
    return vals


def destellos_por_segundo(luma: list[float], fps: float, umbral: float = 0.05) -> int:
    """Máximo de destellos (un par subida+bajada, cada cambio ≥ umbral) en cualquier ventana de 1 s. Función pura.
    Usa un zigzag con histéresis: solo cuentan los cambios de sentido con salto ≥ umbral."""
    if len(luma) < 3:
        return 0
    pivotes: list[int] = []
    direccion = 0
    i_ext, v_ext = 0, luma[0]
    for i in range(1, len(luma)):
        v = luma[i]
        if direccion == 0:
            if v - v_ext >= umbral:
                direccion, i_ext, v_ext = 1, i, v
            elif v_ext - v >= umbral:
                direccion, i_ext, v_ext = -1, i, v
        elif direccion == 1:
            if v > v_ext:
                i_ext, v_ext = i, v
            elif v_ext - v >= umbral:
                pivotes.append(i_ext)
                direccion, i_ext, v_ext = -1, i, v
        else:
            if v < v_ext:
                i_ext, v_ext = i, v
            elif v - v_ext >= umbral:
                pivotes.append(i_ext)
                direccion, i_ext, v_ext = 1, i, v
    if direccion != 0:
        pivotes.append(i_ext)
    # Cada cambio de sentido separa dos transiciones: n pivotes = n+1 transiciones (con la primera).
    ventana = max(1, int(round(fps)))
    peor = 0
    for k, p0 in enumerate(pivotes):
        n = sum(1 for q in pivotes[k:] if q - p0 < ventana)
        peor = max(peor, n)
    return peor // 2


# ───────────────────────── vídeo ─────────────────────────

def verificar_video(ruta: Path, esperado: dict) -> dict:
    """`esperado`: ancho, alto, fps, duracion, tope_bytes, con_audio. Devuelve {ok, problemas, sonda, sonoridad}."""
    s = codificar.sondear(ruta)
    p = []
    if s["codec"] != "h264" and esperado.get("codec", "h264") == "h264":
        p.append(f"códec {s['codec']} (se esperaba h264)")
    if s["pix_fmt"] != "yuv420p" and esperado.get("codec", "h264") == "h264":
        p.append(f"pix_fmt {s['pix_fmt']}")
    if (s["ancho"], s["alto"]) != (esperado["ancho"], esperado["alto"]):
        p.append(f"tamaño {s['ancho']}x{s['alto']} ≠ {esperado['ancho']}x{esperado['alto']}")
    if abs(s["duracion"] - esperado["duracion"]) > 0.25:
        p.append(f"duración {s['duracion']:.2f}s ≠ {esperado['duracion']}s")
    if s["fps"] and abs(s["fps"] - esperado["fps"]) > 0.1:
        p.append(f"fps {s['fps']:.2f} ≠ {esperado['fps']}")
    if esperado.get("tope_bytes") and s["bytes"] > esperado["tope_bytes"]:
        p.append(f"pesa {s['bytes']/1e6:.1f} MB (tope {esperado['tope_bytes']/1e6:.0f} MB)")
    if esperado.get("codec", "h264") == "h264" and not codificar.faststart_ok(ruta):
        p.append("no es +faststart")
    son = None
    if esperado.get("con_audio"):
        if not s["audio"]:
            p.append("sin pista de audio")
        else:
            son = codificar.medir_lufs(ruta)
            if son["lufs"] is None or abs(son["lufs"] + 14.0) > 1.5:
                p.append(f"sonoridad {son['lufs']} LUFS (objetivo −14 ±1,5)")
            if son["pico_dbtp"] is not None and son["pico_dbtp"] > -1.0:
                p.append(f"pico {son['pico_dbtp']} dBTP")
    return {"ok": not p, "problemas": p, "sonda": s, "sonoridad": son}


def verificar_estatico(ruta: Path, esperado: dict) -> dict:
    p = []
    with Image.open(ruta) as img:
        tam_img = img.size
    if tam_img != (esperado["ancho"], esperado["alto"]):
        p.append(f"tamaño {tam_img} ≠ {(esperado['ancho'], esperado['alto'])}")
    tam = Path(ruta).stat().st_size
    if esperado.get("tope_bytes") and tam > esperado["tope_bytes"]:
        p.append(f"pesa {tam/1000:.0f} KB (tope {esperado['tope_bytes']/1000:.0f} KB)")
    return {"ok": not p, "problemas": p, "bytes": tam, "tamano": list(tam_img)}


# ───────────────────────── QR ─────────────────────────

def decodificar_qr(png: bytes | Path, esperado: str | None = None) -> dict:
    import cv2

    datos = Path(png).read_bytes() if isinstance(png, (str, Path)) else png
    arr = cv2.imdecode(np.frombuffer(datos, np.uint8), cv2.IMREAD_COLOR)
    det = cv2.QRCodeDetector()
    texto, _pts, _ = det.detectAndDecode(arr)
    if not texto:
        # segundo intento: ampliar x2 y escala de grises (los QR pequeños cuestan al detector)
        g = cv2.cvtColor(cv2.resize(arr, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC), cv2.COLOR_BGR2GRAY)
        texto, _pts, _ = det.detectAndDecode(g)
    return {"texto": texto, "ok": bool(texto) and (esperado is None or texto == esperado)}
