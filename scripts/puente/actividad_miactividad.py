#!/usr/bin/env python3
"""Actividad · Mi actividad de Google a diario (NAV1112E).

Lee myactivity.google.com (YouTube, Búsqueda, Gemini) últimos 36 h.
Fichas {fuente, cuenta, fecha, titulo, enlace, privado: true} en ~/.starseed/actividad/fichas/.
Incremental por marca de tiempo. Si página cambiada → esqueleto en reparar/.
"""
import datetime
import json
import os
import re
from pathlib import Path
from typing import Any

RUTA_FICHAS = os.path.expanduser("~/.starseed/actividad/fichas")
RUTA_REPARAR = os.path.expanduser("~/.starseed/navegador/reparar")
URL_MIACTIVIDAD = "https://myactivity.google.com/"
HORAS_VENTANA = 36
MESES = {"ene": 1, "feb": 2, "mar": 3, "abr": 4, "may": 5, "jun": 6,
         "jul": 7, "ago": 8, "sep": 9, "oct": 10, "nov": 11, "dic": 12}


def extraer_entradas(html: str) -> list[dict[str, Any]]:
    """Extractor puro: de HTML de myactivity.google.com a lista de entradas."""
    entradas = []
    for m in re.finditer(
        r'<div[^>]*class="[^"]*activity-item[^"]*"[^>]*data-type="(youtube|search|gemini)"[^>]*>.*?'
        r'<a[^>]*href="([^"]*)"[^>]*class="[^"]*content-link[^"]*"[^>]*>(.*?)</a>.*?'
        r'<span[^>]*class="[^"]*timestamp[^"]*"[^>]*>(.*?)</span>',
        html, re.DOTALL | re.IGNORECASE,
    ):
        tipo, enlace, titulo, fecha_str = m.groups()
        titulo = re.sub(r'<[^>]+>', '', titulo).strip()
        if (fecha := _parsear_fecha(fecha_str.strip())) and titulo:
            entradas.append({"fuente": {"youtube": "youtube", "search": "busqueda", "gemini": "gemini"}.get(tipo, tipo),
                             "titulo": titulo, "enlace": enlace, "fecha": fecha.isoformat()})
    return entradas


def _parsear_fecha(s: str) -> datetime.datetime | None:
    try:
        p = re.split(r'[\s,]+', s.lower())
        if len(p) >= 4:
            return datetime.datetime(int(p[2]), MESES.get(p[1][:3], 1), int(p[0]),
                                     int(p[3].split(":")[0]), int(p[3].split(":")[1]) if ":" in p[3] else 0,
                                     tzinfo=datetime.timezone.utc)
    except (ValueError, IndexError):
        pass
    return None


def filtrar_por_ventana(entradas: list[dict], ahora: datetime.datetime, horas: int = HORAS_VENTANA) -> list[dict]:
    """Filtra entradas dentro de la ventana de horas."""
    limite = ahora - datetime.timedelta(hours=horas)
    return [e for e in entradas
            if (datetime.datetime.fromisoformat(e["fecha"].replace("Z", "+00:00")) >= limite)]


def _clave_unica(e: dict) -> str:
    return f"{e.get('fuente')}|{e.get('fecha')}|{e.get('titulo')}"


def guardar_fichas(entradas: list[dict], alias: str, ahora: datetime.datetime) -> None:
    """Guarda fichas por día en JSON, incremental sin duplicados."""
    ruta = Path(RUTA_FICHAS) / f"{ahora:%Y-%m-%d}-miactividad-{alias}.json"
    ruta.parent.mkdir(parents=True, exist_ok=True)
    existentes = []
    if ruta.exists():
        try:
            existentes = json.loads(ruta.read_text(encoding="utf-8"))
        except Exception:
            pass
    nuevas = [e for e in entradas if _clave_unica(e) not in {_clave_unica(x) for x in existentes}]
    if nuevas:
        tmp = ruta.with_suffix(".tmp")
        tmp.write_text(json.dumps(existentes + nuevas, ensure_ascii=False, indent=1), encoding="utf-8")
        os.replace(tmp, ruta)


def _guardar_esqueleto(html: str, alias: str, ahora: datetime.datetime) -> None:
    Path(RUTA_REPARAR).mkdir(parents=True, exist_ok=True)
    ruta = Path(RUTA_REPARAR) / f"{ahora:%Y%m%d-%H%M%S}-miactividad-{alias}.html"
    esqueleto = re.sub(r'<(pre|script|style)[^>]*>.*?</\1>', '', html, flags=re.DOTALL)
    esqueleto = re.sub(r'>[^<]+<', '><', re.sub(r'>\s+<', '><', esqueleto))
    ruta.write_text(esqueleto, encoding="utf-8")


def procesar_pagina(html: str, alias: str, ahora: datetime.datetime) -> dict:
    """Procesa HTML de myactivity: extrae, filtra, guarda. Devuelve {ok, motivo?}."""
    if not (entradas := extraer_entradas(html)):
        _guardar_esqueleto(html, alias, ahora)
        return {"ok": False, "motivo": "pagina cambiada"}
    for e in filtrar_por_ventana(entradas, ahora):
        e.update(cuenta=alias, privado=True)
    guardar_fichas(entradas, alias, ahora)
    return {"ok": True, "guardadas": len(entradas)}


def main() -> dict:
    """Punto de entrada: usa navegador_cliente para las dos sesiones Google."""
    try:
        import navegador_cliente as NC, navegador_reglas as NR
    except ImportError:
        return {"ok": False, "motivo": "dependencias no disponibles"}
    ahora = datetime.datetime.now(datetime.timezone.utc)
    resultados = {}
    for sesion in ("google-alex", "google-fundacion"):
        if NR.apagado(sesion=sesion) or not NR.dentro_de_tope(sesion, ahora):
            resultados[sesion] = {"ok": False, "motivo": "apagado o fuera de tope"}
            continue
        try:
            NC.abrir(URL_MIACTIVIDAD); NC.esperar(2.0)
            for _ in range(5): NC.desplazar(1); NC.esperar(1.0)
            html = NC._page.content() if NC._page else ""
            NC.cerrar()
            resultados[sesion] = procesar_pagina(html, NR.SESIONES[sesion]["cuenta"], ahora)
        except Exception as e:
            resultados[sesion] = {"ok": False, "motivo": f"error: {e}"}
            try: NC.cerrar()
            except Exception: pass
    return {"ok": all(r.get("ok") for r in resultados.values()), "resultados": resultados}