"""codificar.py — ffmpeg y Pillow: del fotograma al archivo publicable.

Estrategia: los fotogramas PNG van por una tubería a un maestro H.264 de muy alta calidad (CRF 12, sin guardar secuencias de
imágenes: el disco es poco). De ese maestro salen todos los derivados: escalado exacto al tamaño de cada formato, H.264 High
yuv420p bt709 +faststart con tope de peso (maxrate + comprobación), WebM VP9, y para banners GIF/APNG con paleta propia.
El audio se normaliza a −14 LUFS (dos pasadas de loudnorm) y se mezcla como AAC 128 kb/s a 48 kHz.
"""
from __future__ import annotations

import io
import json
import re
import subprocess
from pathlib import Path

from PIL import Image

COLOR_TAGS = ["-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv"]
VF_RGB_A_YUV = "scale=in_range=full:out_range=tv:out_color_matrix=bt709:flags=lanczos,format=yuv420p"


class ErrorCodificar(RuntimeError):
    pass


def _correr(cmd: list[str], timeout: int = 900) -> subprocess.CompletedProcess:
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0:
        raise ErrorCodificar(f"{' '.join(cmd[:3])}… falló ({r.returncode}): {r.stderr[-600:]}")
    return r


# ───────────────────────── maestro (tubería de PNG) ─────────────────────────

class Maestro:
    """Proceso ffmpeg que recibe PNG por la entrada estándar. Uso: with Maestro(ruta, fps) as m: m.escribir(png)."""

    def __init__(self, ruta: Path, fps: int, crf: int = 12, preset: str = "veryfast"):
        self.ruta = Path(ruta)
        self.fps = fps
        self.crf = crf
        self.preset = preset
        self.p: subprocess.Popen | None = None
        self.n = 0

    def __enter__(self):
        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", str(self.fps), "-c:v", "png", "-i", "-",
               "-vf", VF_RGB_A_YUV, "-c:v", "libx264", "-preset", self.preset, "-crf", str(self.crf), "-pix_fmt", "yuv420p",
               "-g", str(self.fps * 2), "-bf", "2", *COLOR_TAGS, "-movflags", "+faststart", str(self.ruta)]
        self.p = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
        return self

    def escribir(self, png: bytes) -> None:
        try:
            self.p.stdin.write(png)
        except BrokenPipeError as e:
            err = self.p.stderr.read().decode("utf8", "replace")[-500:]
            raise ErrorCodificar("ffmpeg cerró la tubería: " + err) from e
        self.n += 1

    def __exit__(self, tipo, valor, tb):
        try:
            self.p.stdin.close()
        except Exception:
            pass
        err = self.p.stderr.read().decode("utf8", "replace")
        rc = self.p.wait()
        if tipo is None and rc != 0:
            raise ErrorCodificar(f"el maestro no se cerró bien ({rc}): {err[-500:]}")
        return False


# ───────────────────────── sonido ─────────────────────────

def normalizar_wav(entrada: Path, salida: Path, objetivo: float = -14.0, pico: float = -1.5) -> dict:
    """loudnorm de dos pasadas (modo lineal) → WAV de 48 kHz a −14 LUFS integrados, pico real ≤ −1,5 dBTP."""
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(entrada), "-af", f"loudnorm=I={objetivo}:TP={pico}:LRA=11:print_format=json", "-f", "null", "-"],
                       capture_output=True, text=True, timeout=300)
    m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", r.stderr, flags=re.S)
    if not m:
        raise ErrorCodificar("loudnorm no devolvió medidas: " + r.stderr[-300:])
    med = json.loads(m.group(0))
    filtro = (f"loudnorm=I={objetivo}:TP={pico}:LRA=11:measured_I={med['input_i']}:measured_LRA={med['input_lra']}:"
              f"measured_TP={med['input_tp']}:measured_thresh={med['input_thresh']}:offset={med['target_offset']}:linear=true")
    _correr(["ffmpeg", "-y", "-loglevel", "error", "-i", str(entrada), "-af", filtro, "-ar", "48000", "-ac", "2", str(salida)], 300)
    return {"antes_lufs": float(med["input_i"]), "pico_antes": float(med["input_tp"])}


def medir_lufs(ruta: Path) -> dict:
    """Sonoridad integrada (LUFS) y pico real (dBTP) del audio de un archivo."""
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(ruta), "-vn", "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True, timeout=300)
    txt = r.stderr
    ult = txt[txt.rfind("Summary:"):] if "Summary:" in txt else txt
    i = re.search(r"I:\s+(-?[\d.]+)\s+LUFS", ult)
    p = re.search(r"Peak:\s+(-?[\d.]+)\s+dBFS", ult)
    return {"lufs": float(i.group(1)) if i else None, "pico_dbtp": float(p.group(1)) if p else None}


# ───────────────────────── derivados de vídeo ─────────────────────────

def sondear(ruta: Path) -> dict:
    r = _correr(["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(ruta)], 60)
    d = json.loads(r.stdout)
    v = next((s for s in d["streams"] if s["codec_type"] == "video"), None)
    a = next((s for s in d["streams"] if s["codec_type"] == "audio"), None)
    fps = None
    if v and v.get("avg_frame_rate") not in (None, "0/0"):
        num, den = v["avg_frame_rate"].split("/")
        fps = float(num) / float(den) if float(den) else None
    return {
        "codec": v and v["codec_name"], "perfil": v and v.get("profile"), "pix_fmt": v and v.get("pix_fmt"), "ancho": v and v["width"], "alto": v and v["height"],
        "fps": fps, "duracion": float(d["format"].get("duration", 0)), "bytes": int(d["format"].get("size", 0)), "bitrate": int(d["format"].get("bit_rate", 0) or 0),
        "audio": a and a["codec_name"], "audio_hz": a and int(a["sample_rate"]), "audio_canales": a and a["channels"],
        "color_space": v and v.get("color_space"), "color_primaries": v and v.get("color_primaries"), "color_transfer": v and v.get("color_transfer"),
        "contenedor": d["format"]["format_name"], "fotogramas": v and int(v.get("nb_frames") or 0),
    }


def faststart_ok(ruta: Path) -> bool:
    """True si el átomo `moov` va antes que `mdat` (reproducción sin descargar todo)."""
    datos = Path(ruta).read_bytes()[:4_000_000]
    i_moov, i_mdat = datos.find(b"moov"), datos.find(b"mdat")
    return i_moov != -1 and (i_mdat == -1 or i_moov < i_mdat)


def derivar_mp4(maestro: Path, destino: Path, ancho: int, alto: int, fps: int, duracion: float, wav: Path | None, tope_bytes: int,
                crf: int = 18, techo_bitrate: int = 9_000_000, preset: str = "slow") -> dict:
    """H.264 High yuv420p bt709 +faststart desde el maestro. Baja bitrate/CRF hasta quedar bajo `tope_bytes`."""
    audio_bps = 128_000 if wav else 0
    presupuesto = int(tope_bytes * 8 / duracion * 0.93) - audio_bps
    maxrate = max(400_000, min(techo_bitrate, presupuesto))
    info = sondear(maestro)
    vf = []
    if (info["ancho"], info["alto"]) != (ancho, alto):
        vf.append(f"scale={ancho}:{alto}:flags=lanczos")
    vf.append("format=yuv420p")
    intento = 0
    while True:
        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(maestro)]
        if wav:
            cmd += ["-i", str(wav)]
        cmd += ["-vf", ",".join(vf), "-c:v", "libx264", "-profile:v", "high", "-level", "4.2", "-preset", preset, "-crf", str(crf),
                "-maxrate", str(maxrate), "-bufsize", str(maxrate * 2), "-pix_fmt", "yuv420p", "-g", str(fps * 2), "-bf", "2", "-r", str(fps), *COLOR_TAGS]
        if wav:
            cmd += ["-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2", "-map", "0:v:0", "-map", "1:a:0"]
        else:
            cmd += ["-an"]
        cmd += ["-t", f"{duracion:.3f}", "-movflags", "+faststart", str(destino)]
        _correr(cmd, 1800)
        tam = Path(destino).stat().st_size
        if tam <= tope_bytes or intento >= 6:
            break
        intento += 1
        maxrate = int(maxrate * 0.8)
        crf += 1
    return {"bytes": tam, "crf": crf, "maxrate": maxrate, "intentos": intento + 1, "bajo_tope": tam <= tope_bytes}


def derivar_webm(maestro: Path, destino: Path, ancho: int, alto: int, duracion: float, wav: Path | None, crf: int = 33, tope_bytes: int = 15_000_000) -> dict:
    """VP9 + Opus. Calidad constante con tope de bitrate, row-mt para aprovechar los dos núcleos."""
    maxrate = int(tope_bytes * 8 / duracion * 0.9)
    info = sondear(maestro)
    vf = f"scale={ancho}:{alto}:flags=lanczos,format=yuv420p" if (info["ancho"], info["alto"]) != (ancho, alto) else "format=yuv420p"
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(maestro)]
    if wav:
        cmd += ["-i", str(wav)]
    cmd += ["-vf", vf, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", str(crf), "-maxrate", str(maxrate), "-bufsize", str(maxrate * 2), "-row-mt", "1", "-cpu-used", "3", "-deadline", "good", "-pix_fmt", "yuv420p", *COLOR_TAGS]
    if wav:
        cmd += ["-c:a", "libopus", "-b:a", "96k", "-ar", "48000", "-map", "0:v:0", "-map", "1:a:0"]
    cmd += ["-t", f"{duracion:.3f}", str(destino)]
    _correr(cmd, 3000)
    return {"bytes": Path(destino).stat().st_size}


def extraer_fotograma(video: Path, t: float, destino: Path, ancho: int | None = None) -> None:
    vf = f"scale={ancho}:-2" if ancho else "null"
    _correr(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{t:.3f}", "-i", str(video), "-frames:v", "1", "-vf", vf, str(destino)], 120)


# ───────────────────────── estáticos y animados ligeros ─────────────────────────

def a_imagen(png: bytes) -> Image.Image:
    return Image.open(io.BytesIO(png)).convert("RGB")


def guardar_png(img: Image.Image, destino: Path, tope_bytes: int | None = None) -> int:
    """PNG optimizado. Si hay tope de peso (banners IAB: 150 KB) y no entra, pasa a paleta de 256 → 128 → 64 colores con tramado."""
    img.save(destino, format="PNG", optimize=True)
    tam = Path(destino).stat().st_size
    if tope_bytes and tam > tope_bytes:
        for c in (256, 192, 128, 96, 64, 48, 32):
            img.quantize(colors=c, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG).save(destino, format="PNG", optimize=True)
            tam = Path(destino).stat().st_size
            if tam <= tope_bytes:
                break
    return tam


def guardar_jpg(img: Image.Image, destino: Path, calidad: int = 92, tope_bytes: int | None = None) -> int:
    """JPEG 4:4:4 (el texto fino no se mancha). Con tope de peso, baja la calidad de 4 en 4 hasta que entre."""
    q = calidad
    while True:
        img.save(destino, format="JPEG", quality=q, subsampling=0, optimize=True, progressive=False)
        tam = Path(destino).stat().st_size
        if not tope_bytes or tam <= tope_bytes or q <= 60:
            return tam
        q -= 4


def _paleta_global(imgs: list[Image.Image], colores: int) -> Image.Image:
    w, h = imgs[0].size
    mosaico = Image.new("RGB", (w, h * len(imgs)))
    for i, im in enumerate(imgs):
        mosaico.paste(im, (0, i * h))
    return mosaico.quantize(colors=colores, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)


def gif_animado(frames: list[Image.Image], destino: Path, duraciones_ms: list[int], tope_bytes: int, colores: int = 128, bucles: int = 0) -> dict:
    """GIF con paleta global. Baja colores (y quita el tramado) hasta entrar en `tope_bytes`; última defensa: menos cuadros."""
    imgs = list(frames)
    durs = list(duraciones_ms)
    intentos = []
    while True:
        for c in [colores, 96, 64, 48, 32, 24, 16]:
            if c > colores:
                continue
            pal = _paleta_global(imgs, c)
            for tramado in (Image.Dither.FLOYDSTEINBERG, Image.Dither.NONE):
                cuadros = [im.quantize(palette=pal, dither=tramado) for im in imgs]
                cuadros[0].save(destino, save_all=True, append_images=cuadros[1:], duration=durs, loop=bucles, optimize=True, disposal=1)
                tam = Path(destino).stat().st_size
                intentos.append((c, tramado == Image.Dither.FLOYDSTEINBERG, len(imgs), tam))
                if tam <= tope_bytes:
                    return {"bytes": tam, "colores": c, "cuadros": len(imgs), "tramado": tramado == Image.Dither.FLOYDSTEINBERG, "intentos": len(intentos)}
        if len(imgs) <= 2:
            return {"bytes": Path(destino).stat().st_size, "colores": 16, "cuadros": len(imgs), "tramado": False, "intentos": len(intentos), "sobre_tope": True}
        # quita el cuadro intermedio menos importante (el del medio) y suma su duración al anterior
        k = len(imgs) // 2
        durs[k - 1] += durs[k]
        del imgs[k], durs[k]


def apng_animado(frames: list[Image.Image], destino: Path, duraciones_ms: list[int]) -> dict:
    frames[0].save(destino, format="PNG", save_all=True, append_images=frames[1:], duration=duraciones_ms, loop=0, optimize=True)
    return {"bytes": Path(destino).stat().st_size, "cuadros": len(frames)}


def pdf_de_imagenes(imgs: list[Image.Image], destino: Path, resolucion: int = 150) -> int:
    imgs[0].save(destino, format="PDF", save_all=True, append_images=imgs[1:], resolution=resolucion)
    return Path(destino).stat().st_size
