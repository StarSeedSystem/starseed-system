#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""alcance_fuentes.py · R1–R10. Lista blanca; rechaza sesión; presupuesto 12/120 s."""
from __future__ import annotations
import json, os, subprocess, time

CANALES_PERMITIDOS = {"lectura-puntual", "rss", "sitemap", "github", "agent-reach"}
RECHAZADOS = {"reddit", "twitter", "linkedin", "facebook", "instagram", "xiaohongshu", "boss"}
TOPE_LECTURAS = 12
PRESUPUESTO_SEGUNDOS = 120.0

try:
    import lector_cortes as LC
except Exception:
    LC = None

try:
    import vigia_referencias as VR
except Exception:
    VR = None


def _canales_de(obj: dict):
    canales = []
    for u in obj.get("urls_oficiales", []) or []:
        canales.append({"tipo": "lectura-puntual", "url": u})
    for u in obj.get("rss", []) or []:
        canales.append({"tipo": "rss", "url": u})
    for u in obj.get("sitemap", []) or []:
        canales.append({"tipo": "sitemap", "url": u})
    return canales


def leer_fuente(obj: dict, ctx: dict) -> dict:
    id_obj = obj.get("id", obj.get("nombre", ""))
    errores, pistas, lecturas = [], [], 0
    registros = ctx.get("registros") or {}
    obtener_url = ctx.get("obtener_url")
    dormir = ctx.get("dormir") or (lambda s: None)
    t0 = time.time()
    for canal_rechazado in obj.get("canales_extra", []) or []:
        if canal_rechazado in RECHAZADOS:
            errores.append(f"rechazado_canal_sesion:{canal_rechazado}")
    for canal in _canales_de(obj):
        if lecturas >= TOPE_LECTURAS or (time.time() - t0) > PRESUPUESTO_SEGUNDOS:
            return {"id": id_obj, "lecturas": lecturas, "pistas": pistas,
                    "errores": errores + ["presupuesto_cortado"], "cortado": True}
        tipo = canal.get("tipo", "")
        if tipo not in CANALES_PERMITIDOS:
            errores.append(f"canal_rechazado:{tipo}")
            continue
        if tipo == "lectura-puntual" and LC is not None:
            resultado = LC.leer(canal["url"], {"obtener_url": obtener_url, "dormir": dormir, "registros": registros})
            lecturas += 1
            if resultado and resultado.get("ok"):
                pistas.append({"url": canal["url"], "tipo": tipo,
                              "titulo": (resultado.get("html") or b"")[:200]})
            elif resultado:
                errores.append(f"bloqueado:{resultado.get('bloqueado_por') or 'desconocido'}")
        elif tipo in ("rss", "sitemap") and VR is not None:
            cuerpo = None
            if getattr(VR, "obtener_url_http", None):
                cuerpo = VR.obtener_url_http(canal["url"], timeout=12)
            lecturas += 1
            if cuerpo:
                items = (VR.parsear_rss(cuerpo) if tipo == "rss" else VR.parsear_sitemap(cuerpo))
                pistas.extend({"url": canal["url"], "tipo": tipo,
                              "titulo": str(i.get("titulo", ""))[:200]}
                             for i in (items if isinstance(items, list) else list((items or {}).values())))
        elif tipo == "agent-reach":
            binario = os.environ.get("STARSEED_AGENT_REACH_BIN", os.path.expanduser("~/.local/bin/agent-reach"))
            if os.path.isfile(binario):
                try:
                    salida = subprocess.run([binario, "web", "search", obj.get("nombre", "")],
                                            capture_output=True, text=True, timeout=30)
                    lecturas += 1
                    pistas.append({"url": binario, "tipo": tipo, "titulo": (salida.stdout or "")[:200]})
                except Exception as exc:
                    errores.append(f"agent-reach_error:{exc}")
            else:
                errores.append("agent-reach_no_disponible")
    return {"id": id_obj, "lecturas": lecturas, "pistas": pistas, "errores": errores, "cortado": False}


def buscar(q: str, ctx: dict) -> dict:
    errores, items = [], []
    registros = ctx.get("registros") or {}
    binario = os.environ.get("STARSEED_AGENT_REACH_BIN", os.path.expanduser("~/.local/bin/agent-reach"))
    if os.path.isfile(binario) and q:
        try:
            for orden in ("web search", "read", "github read", "github search", "youtube subtitle", "youtube search"):
                salida = subprocess.run([binario, orden, q], capture_output=True, text=True, timeout=30)
                datos = salida.stdout or salida.stderr or ""
                try:
                    datos_json = json.loads(datos)
                    if isinstance(datos_json.get("items"), list):
                        items.extend(datos_json["items"])
                except Exception:
                    pass
            if not items:
                errores.append("agent-reach_sin_items")
        except Exception as exc:
            errores.append(f"agent-reach_error:{exc}")
    else:
        errores.append("agent-reach_no_disponible")
    for canal_rechazado in RECHAZADOS:
        if canal_rechazado in (q or "").lower():
            errores.append(f"rechazado_canal_sesion:{canal_rechazado}")
    return {"consulta": q, "items": items[:12], "errores": errores, "cortado": False}


if __name__ == "__main__":
    pass
