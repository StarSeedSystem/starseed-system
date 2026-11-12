#!/usr/bin/env python3
"""Actividad · inicio e historial de YouTube con sesión (NAV1112F).

Con la sesión google-alex lee los primeros 40 recomendados de www.youtube.com
y las entradas del día de www.youtube.com/feed/history.
Fichas: título, canal, enlace, origen ('recomendado' | 'historial'), privado: true.
Son candidatos para SDP1111S; este módulo no ve ni transcribe vídeos.
Extractor puro con pruebas sobre HTML de muestra. Máximo 120 líneas.
"""
import json, os, re, sys
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

DIR_FICHAS = os.path.expanduser("~/.starseed/actividad/fichas")
DIR_REPARAR = os.path.expanduser("~/.starseed/navegador/reparar")
TOPE_RECOMENDADOS = 40

_REC_PAT = re.compile(r'<ytd-rich-item-renderer[^>]*>.*?<a[^>]*id="video-title"[^>]*href="(/watch\?v=[^"]*)"[^>]*title="([^"]*)"[^>]*>.*?</a>.*?<ytd-channel-name[^>]*>.*?<a[^>]*href="(/channel/[^"]*)"[^>]*>([^<]*)</a>', re.DOTALL | re.IGNORECASE)
_HIST_PAT = re.compile(r'<ytd-video-renderer[^>]*>.*?<a[^>]*id="video-title"[^>]*href="(/watch\?v=[^"]*)"[^>]*title="([^"]*)"[^>]*>.*?</a>.*?<ytd-channel-name[^>]*>.*?<a[^>]*href="(/channel/[^"]*)"[^>]*>([^<]*)</a>', re.DOTALL | re.IGNORECASE)


def ficha(titulo: str, canal: str, enlace: str, origen: str) -> Dict[str, Any]:
    return {"fuente": "youtube_web", "cuenta": "google-alex", "titulo": titulo, "canal": canal,
            "enlace": enlace, "origen": origen,
            "fecha": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "privado": True}


def extraer_recomendados(html: str) -> List[Dict[str, str]]:
    return [{"titulo": t.strip(), "canal": c.strip(), "enlace": f"https://www.youtube.com{v}"}
            for v, t, _, c in _REC_PAT.findall(html)]


def extraer_historial(html: str) -> List[Dict[str, str]]:
    return [{"titulo": t.strip(), "canal": c.strip(), "enlace": f"https://www.youtube.com{v}"}
            for v, t, _, c in _HIST_PAT.findall(html)]


def _guardar_esqueleto(html: str, origen: str) -> str:
    os.makedirs(DIR_REPARAR, exist_ok=True)
    ruta = os.path.join(DIR_REPARAR, f"esqueleto-{origen}-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}.html")
    with open(ruta, "w", encoding="utf-8") as f: f.write(html)
    return ruta


def _escribir_fichas(fichas: List[Dict[str, Any]]) -> Optional[str]:
    if not fichas: return None
    os.makedirs(DIR_FICHAS, exist_ok=True)
    ruta = os.path.join(DIR_FICHAS, f"{datetime.now(timezone.utc).strftime('%Y-%m-%d')}-youtube-web-google-alex.json")
    with open(ruta, "w", encoding="utf-8") as f: json.dump(fichas, f, ensure_ascii=False, indent=1)
    os.chmod(ruta, 0o600)
    return ruta


def leer_youtube_web(abrir_url: Any, extraer_html: Any, esperar: Any, desplazar: Any, cerrar: Any) -> Dict[str, Any]:
    try:
        abrir_url("https://www.youtube.com"); esperar(2.0)
        html_rec = extraer_html()
        rec = extraer_recomendados(html_rec)
        if not rec: _guardar_esqueleto(html_rec, "recomendados"); cerrar(); return {"ok": False, "motivo": "pagina cambiada", "origen": "recomendados"}
        abrir_url("https://www.youtube.com/feed/history"); esperar(2.0)
        html_hist = extraer_html()
        hist = extraer_historial(html_hist)
        if not hist: _guardar_esqueleto(html_hist, "historial"); cerrar(); return {"ok": False, "motivo": "pagina cambiada", "origen": "historial"}
        fichas = [ficha(r["titulo"], r["canal"], r["enlace"], "recomendado") for r in rec[:TOPE_RECOMENDADOS]] + \
                 [ficha(h["titulo"], h["canal"], h["enlace"], "historial") for h in hist]
        cerrar()
        return {"ok": True, "fichas": len(fichas), "destino": _escribir_fichas(fichas)}
    except Exception as e:
        try: cerrar()
        except Exception: pass
        return {"ok": False, "motivo": f"error: {type(e).__name__}"}


def main(argv: List[str]) -> int:
    try: import navegador_cliente as NC
    except ImportError: print("navegador_cliente no disponible"); return 1
    if NC.apagado(None, "google-alex"): print("Navegador apagado por variable de entorno"); return 0
    r = leer_youtube_web(NC.abrir, lambda: (NC.extraer("ytd-rich-item-renderer", ["href", "text"])[0]["html"] if NC.extraer("ytd-rich-item-renderer", ["href", "text"]) else NC.esqueleto()), NC.esperar, NC.desplazar, NC.cerrar)
    print(f"OK: {r['fichas']} fichas -> {r['destino']}" if r["ok"] else f"Fallo: {r['motivo']} ({r.get('origen', '?')})")
    return 0 if r["ok"] else 1


if __name__ == "__main__": raise SystemExit(main(sys.argv))