#!/usr/bin/env python3
"""Actividad · NotebookLM por la web (NAV1112G).

Con las sesiones de Google lee en notebooklm.google.com la lista de cuadernos
(título y fecha de modificación) y, de los modificados desde la última pasada,
los títulos de sus fuentes y de sus notas. Fichas privado: true.
No crea, edita ni borra nada. Extractor puro.
"""
import os, time
from typing import Callable, Dict, List, Optional

try:
    import navegador_cliente as NC
    NAVEGADOR_DISPONIBLE = True
except ImportError:
    NAVEGADOR_DISPONIBLE = False

SESIONES = ("google-alex", "google-fundacion")
URL_LISTA = "https://notebooklm.google.com/"
PERFILES_DEF = {"google-alex": "alexbordongarrigos@gmail.com", "google-fundacion": "fundacionstarseed@gmail.com"}

def _ahora(ahora=None):
    from datetime import datetime, timezone
    if isinstance(ahora, datetime):
        return ahora.astimezone(timezone.utc) if ahora.tzinfo else ahora.replace(tzinfo=timezone.utc)
    return datetime.fromtimestamp(float(ahora if ahora is not None else time.time()), timezone.utc)

def _iso(ahora=None):
    return _ahora(ahora).strftime("%Y-%m-%dT%H:%M:%SZ")

def _extraer_cuadernos(cliente) -> List[Dict[str, str]]:
    cliente["abrir"](URL_LISTA); cliente["esperar"](2.0)
    tarjetas = cliente["extraer"](".notebook-card", ["text", "data-id"])
    fechas = cliente["extraer"](".notebook-modified", ["text"])
    return [{"id": t.get("data-id", f"nb{i}"), "titulo": t.get("text", "").strip(),
             "modificado": f.get("text", "").strip()}
            for i, (t, f) in enumerate(zip(tarjetas, fechas))
            if t.get("text", "").strip() and f.get("text", "").strip()]

def _extraer_fuentes_y_notas(cliente, cuaderno_id: str) -> Dict[str, List[Dict]]:
    cliente["abrir"](f"https://notebooklm.google.com/notebook/{cuaderno_id}"); cliente["esperar"](2.0)
    fuentes = [{"titulo": t.get("text", "").strip(), "enlace": ""}
               for t in cliente["extraer"](".source-title", ["text"]) if t.get("text", "").strip()]
    notas = [{"titulo": t.get("text", "").strip(), "id": ""}
             for t in cliente["extraer"](".note-title", ["text"]) if t.get("text", "").strip()]
    return {"fuentes": fuentes, "notas": notas}

def _ficha(cuenta: str, cuaderno: Dict, tipo: str, item: Dict, hoy: str) -> Dict:
    return {"fuente": "notebooklm", "cuenta": cuenta, "tipo": tipo,
            "cuaderno": cuaderno["titulo"], "cuaderno_id": cuaderno["id"], "privado": True,
            "fecha": item.get("fecha", hoy)[:40], "titulo": item.get("titulo", "")[:300],
            "enlace": item.get("enlace", f"https://notebooklm.google.com/notebook/{cuaderno['id']}")[:300]}

def leer(
    cliente: Optional[Callable] = None,
    estado: Optional[Dict] = None,
    sesiones: Optional[List[str]] = None,
    perfiles: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    if not NAVEGADOR_DISPONIBLE and cliente is None:
        return {"ok": False, "motivo": "navegador_cliente no disponible"}
    perfiles = perfiles or PERFILES_DEF
    sesiones = list(sesiones or SESIONES)
    estado = dict(estado or {})
    ultima = estado.get("ultima_pasada", "1970-01-01T00:00:00Z")
    hoy = _iso()
    cuadernos_totales, fichas, errores = [], [], []
    for sesion in sesiones:
        if sesion not in perfiles:
            continue
        try:
            c = NC if cliente is None else cliente(sesion)
            cli = c if isinstance(c, dict) else c
            cuadernos = _extraer_cuadernos(cli)
            cuadernos_totales.extend([{**c, "sesion": sesion, "cuenta": perfiles[sesion]} for c in cuadernos])
            for cuaderno in cuadernos:
                if cuaderno["modificado"] <= ultima:
                    continue
                try:
                    datos = _extraer_fuentes_y_notas(cli, cuaderno["id"])
                    for f in datos["fuentes"]:
                        f["fecha"] = cuaderno["modificado"]
                        fichas.append(_ficha(perfiles[sesion], cuaderno, "fuente", f, hoy))
                    for n in datos["notas"]:
                        n["fecha"] = cuaderno["modificado"]
                        fichas.append(_ficha(perfiles[sesion], cuaderno, "nota", n, hoy))
                except Exception as e:
                    errores.append(f"{sesion}/{cuaderno['id']}: {e}")
            cli["cerrar"]()
        except RuntimeError as e:
            if "sesión" in str(e).lower() or "activa" in str(e).lower():
                return {"ok": False, "motivo": f"sesión no activa: {e}"}
            errores.append(f"{sesion}: {e}")
        except Exception as e:
            errores.append(f"{sesion}: {e}")
    return {"ok": True, "cuadernos": cuadernos_totales, "fichas": fichas,
            "estado": {"ultima_pasada": hoy, "sesiones": sesiones}, "errores": errores}