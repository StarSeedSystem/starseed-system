"""captura.py — el obturador del Estudio MetaGeminis.

Abre la página de la escena en un Chromium sin cabeza (WebGL por SwiftShader, sin GPU), fija el instante t con
`window.__render(t)` y captura el fotograma. No hay reloj real: t = i / fps, así que dos pasadas dan los mismos píxeles.

Un solo Chromium a la vez (el contenedor tiene 2 CPU). `esperar_carga_pesada()` cede el turno si otro agente está
compilando (next build) o probando (vitest): el render es largo y compite por CPU.
"""
from __future__ import annotations

import base64
import io
import json
import math
import subprocess
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ARGS_CHROMIUM = [
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
    "--use-gl=angle",
    "--force-color-profile=srgb",
    "--font-render-hinting=none",
    "--hide-scrollbars",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--no-sandbox",
]


def procesos_pesados() -> int:
    """Cuántos `next build` y `vitest` hay corriendo ahora mismo."""
    try:
        salida = subprocess.run(["ps", "-eo", "args"], capture_output=True, text=True, timeout=10).stdout
    except Exception:
        return 0
    n = 0
    for linea in salida.splitlines():
        if ("next build" in linea or "vitest" in linea) and "grep" not in linea and "estudio" not in linea:
            n += 1
    return n


def esperar_carga_pesada(max_minutos: float = 20.0, avisar=print, dormir=time.sleep) -> bool:
    """Espera (hasta `max_minutos`) a que no haya `next build` ni `vitest`. Devuelve True si quedó libre."""
    limite = time.time() + max_minutos * 60
    avisado = False
    while procesos_pesados() > 0:
        if time.time() > limite:
            avisar("aviso: sigue habiendo carga pesada tras la espera; se continúa de todos modos")
            return False
        if not avisado:
            avisar("hay next build o vitest en marcha: espero para no competir por la CPU…")
            avisado = True
        dormir(60)
    return True


class Sesion:
    """Una página abierta con su configuración. Uso: `with Sesion(servidor, cfg) as s: s.render(t); png = s.captura()`."""

    def __init__(self, servidor, cfg: dict, factor_captura: float = 1.0):
        self.servidor = servidor
        self.cfg = cfg
        self.factor = factor_captura
        self._pw = None
        self._nav = None
        self._pag = None
        self._cdp = None

    def __enter__(self):
        ancho, alto = self.cfg["formato"]["ancho"], self.cfg["formato"]["alto"]
        self._pw = sync_playwright().start()
        self._nav = self._pw.chromium.launch(args=ARGS_CHROMIUM)
        self.dpr = int(self.cfg["formato"].get("dpr", 1))
        ctx = self._nav.new_context(viewport={"width": ancho, "height": alto}, device_scale_factor=self.factor if self.dpr == 1 else 1.0)
        self._pag = ctx.new_page()
        self._errores: list[str] = []
        self._pag.on("console", lambda m: self._errores.append(f"{m.type}: {m.text}") if m.type in ("error", "warning") else None)
        self._pag.on("pageerror", lambda e: self._errores.append(f"pageerror: {e}"))
        self._pag.add_init_script("window.__CFG = " + json.dumps(self.cfg, ensure_ascii=False) + ";")
        self._pag.goto(self.servidor.base + "/plantilla/escena.html", wait_until="load")
        try:
            self._pag.wait_for_function("window.__listo === true || window.__error", timeout=120_000)
        except Exception as e:  # noqa: BLE001
            raise RuntimeError(f"la escena no cargó: {e}\n" + "\n".join(self._errores[-8:])) from e
        err = self._pag.evaluate("window.__error || null")
        if err:
            raise RuntimeError("error en la escena: " + err)
        self._cdp = ctx.new_cdp_session(self._pag)
        return self

    def __exit__(self, *a):
        try:
            if self._nav:
                self._nav.close()
        finally:
            if self._pw:
                self._pw.stop()

    @property
    def consola(self) -> list[str]:
        return list(self._errores)

    def render(self, t: float, sin_texto: bool = False) -> None:
        self._pag.evaluate("([t, s]) => window.__render(t, { sinTexto: s })", [float(t), bool(sin_texto)])

    def captura(self, formato: str = "png", calidad: int = 92) -> bytes:
        params: dict = {"format": formato, "optimizeForSpeed": formato == "png"}
        if formato == "jpeg":
            params["quality"] = calidad
        escala = self.factor * self.dpr
        if escala != 1.0:
            f = self.cfg["formato"]
            a, h = f.get("px_ancho", f["ancho"]) / self.dpr, f.get("px_alto", f["alto"]) / self.dpr
            if self.dpr > 1:  # Chromium redondea el alto del clip a pares: se pide por encima y se recorta al tamaño exacto
                a, h = float(math.ceil(a)), float(math.ceil(h))
            params["clip"] = {"x": 0, "y": 0, "width": a, "height": h, "scale": escala}
        r = self._cdp.send("Page.captureScreenshot", params)
        datos = base64.b64decode(r["data"])
        if self.dpr > 1:
            datos = self._recortar(datos, formato, calidad)
        return datos

    def _recortar(self, datos: bytes, formato: str, calidad: int) -> bytes:
        """Deja el archivo en el tamaño exacto del formato (recorta o repite el borde si Chromium se pasó o se quedó corto)."""
        from PIL import Image

        f = self.cfg["formato"]
        meta = (f["px_ancho"], f["px_alto"])
        img = Image.open(io.BytesIO(datos))
        if img.size == meta:
            return datos
        lienzo = img.crop((0, 0, min(img.width, meta[0]), min(img.height, meta[1]))).convert("RGB")
        if lienzo.size != meta:
            ext = Image.new("RGB", meta)
            ext.paste(lienzo, (0, 0))
            if lienzo.height < meta[1]:
                ext.paste(lienzo.crop((0, lienzo.height - 1, lienzo.width, lienzo.height)).resize((meta[0], meta[1] - lienzo.height)), (0, lienzo.height))
            lienzo = ext
        salida = io.BytesIO()
        lienzo.save(salida, format="PNG" if formato == "png" else "JPEG", **({"quality": calidad} if formato != "png" else {"compress_level": 1}))
        return salida.getvalue()

    def capas(self) -> list[dict]:
        """Capas de texto medidas en la página, en píxeles del ARCHIVO (se multiplican por dpr si el DOM va a mitad de tamaño)."""
        capas = self._pag.evaluate("window.__capas()")
        if self.dpr == 1:
            return capas
        k = float(self.dpr)
        return [dict(c, rects=[[x * k, y * k, w * k, h * k] for x, y, w, h in c["rects"]], tam=c["tam"] * k) for c in capas]

    def evaluar(self, js: str, arg=None):
        return self._pag.evaluate(js, arg) if arg is not None else self._pag.evaluate(js)

    def pdf(self, ruta: Path, ancho_mm: float, alto_mm: float) -> None:
        """PDF de una página con el texto como vector. La página mide `ancho_px` píxeles CSS; el PDF, `ancho_mm`: se escala para que encaje."""
        ancho_px = self.cfg["formato"]["ancho"]
        escala = (ancho_mm / 25.4 * 96.0) / ancho_px
        self._pag.emulate_media(media="screen")
        self._pag.add_style_tag(content="@page { margin: 0 } html, body { width: %dpx; height: %dpx; }" % (ancho_px, self.cfg["formato"]["alto"]))
        self._pag.pdf(path=str(ruta), width=f"{ancho_mm}mm", height=f"{alto_mm}mm", print_background=True, scale=escala,
                      margin={"top": "0", "bottom": "0", "left": "0", "right": "0"}, page_ranges="1")
