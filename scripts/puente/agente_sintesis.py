#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Agente de síntesis diaria de producción audiovisual (SDP1111D).

Máquina de tres fases por día (recolectar→redactar→entregar) guardada en
starseed_memory_root/produccion-audiovisual/estado.json. Horas en
America/Mexico_City (00:30, 06:30, 07:54). Encola con encargar_por_flota en
olas/cola-suenos-sintesis.json, nunca lanza orquestador. Puntúa con
decidir.consultar('puntuar') y entrega con sintesis_telegram.enviar: primero
resumen 1500-3000 caracteres y luego síntesis completa. Guarda markdown en
starseed_memory_root/produccion-audiovisual/sintesis/AAAA-MM-DD.md con escritura
atómica. Una sola entrega al día. Cerrojo en ~/.starseed/cerrojos/.
CLI plan|ciclo|estado [--seco --json].
"""
from __future__ import annotations
import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import sintesis_fuentes as SF
import sintesis_tareas as ST
import sintesis_telegram as SG
import suenos as S

def _navegador_estado(raiz: str) -> dict:
    """Estado del navegador propio: sesiones vivas y última comprobación."""
    ruta_estado = os.path.expanduser("~/.starseed/navegador/estado.json")
    try:
        with open(ruta_estado, encoding="utf-8") as f:
            datos = json.load(f)
        sesiones = datos.get("sesiones", {})
        vivas = [nombre for nombre, datos in sesiones.items() if datos.get("estado") == "viva"]
        return {"ok": True, "vivas": vivas, "total": len(sesiones), "detalle": sesiones}
    except (OSError, ValueError):
        return {"ok": False, "vivas": [], "total": 0, "detalle": {}, "motivo": "sin_estado"}

RAIZ = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(DIRECTORIO))
AGENTE = "sintesis-produccion"
REL_ESTADO = "starseed_memory_root/produccion-audiovisual/estado.json"
REL_OLAS = "starseed_memory_root/olas"
NOMBRE_COLA = "cola-suenos-sintesis.json"
REL_SINTESIS = "starseed_memory_root/produccion-audiovisual/sintesis"
CERROJO_DIR = os.path.expanduser("~/.starseed/cerrojos")
HORAS_RECOLECTAR = 0.5  # 00:30
HORAS_REDACTAR = 6.5    # 06:30
HORAS_ENTREGAR = 7.9    # 07:54
RESUMEN_MIN, RESUMEN_MAX = 1500, 3000
ZONA = "America/Mexico_City"
CADA_HORAS = 0.25  # el director llama cada 15 min

FECHA_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})\.md$")


def _como_fecha(ahora=None):
    if ahora is None:
        return datetime.now(timezone.utc)
    if isinstance(ahora, datetime):
        return ahora.replace(tzinfo=timezone.utc) if ahora.tzinfo is None else ahora.astimezone(timezone.utc)
    if isinstance(ahora, (int, float)):
        return datetime.fromtimestamp(float(ahora), timezone.utc)
    try:
        d = datetime.fromisoformat(str(ahora).replace("Z", "+00:00"))
        return d.replace(tzinfo=timezone.utc) if d.tzinfo is None else d.astimezone(timezone.utc)
    except ValueError:
        return datetime.now(timezone.utc)


def _iso(ahora):
    return _como_fecha(ahora).strftime("%Y-%m-%dT%H:%M:%SZ")


def _fecha_cdmx(ahora):
    """Fecha en zona horaria de Ciudad de México."""
    try:
        import zoneinfo
        tz = zoneinfo.ZoneInfo(ZONA)
        return _como_fecha(ahora).astimezone(tz).date().isoformat()
    except Exception:
        return _como_fecha(ahora).date().isoformat()


def _hora_cdmx(ahora):
    """Hora decimal en zona horaria de Ciudad de México."""
    try:
        import zoneinfo
        tz = zoneinfo.ZoneInfo(ZONA)
        dt = _como_fecha(ahora).astimezone(tz)
        return dt.hour + dt.minute / 60.0
    except Exception:
        dt = _como_fecha(ahora)
        return dt.hour + dt.minute / 60.0


def _dentro(iso, ahora, horas=0):
    if not iso:
        return False
    try:
        t = _como_fecha(datetime.fromisoformat(str(iso).replace("Z", "+00:00")))
    except ValueError:
        return False
    return abs((_como_fecha(ahora) - t).total_seconds()) < timedelta(hours=horas).total_seconds()


def estado_vacio():
    return {"version": 1, "fecha": None, "fase": "recolectar", "ultimo_ciclo": None, "ciclos": 0,
            "entregada": False, "tareas_encoladas": {}, "sintesis_path": None, "puntuacion": None}


def _leer_json(ruta, defecto):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def _escribir_json(ruta, datos):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    tmp = f"{ruta}.{os.getpid()}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
        f.write("\n")
    os.replace(tmp, ruta)


def _escribir_texto(ruta, texto):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    tmp = f"{ruta}.{os.getpid()}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(texto)
    os.replace(tmp, ruta)


def _cerrojo(ruta=None, espera_s=60):
    import fcntl
    ruta = ruta or os.path.join(CERROJO_DIR, "sintesis.lock")
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    f = open(ruta, "a")
    tomado = False
    try:
        t0 = time.time()
        while True:
            try:
                fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
                tomado = True
                break
            except BlockingIOError:
                if time.time() - t0 > espera_s:
                    break
                time.sleep(0.5)
        yield tomado
    finally:
        if tomado:
            try:
                fcntl.flock(f, fcntl.LOCK_UN)
            except OSError:
                pass
        f.close()


def cargar_estado(raiz):
    ruta = os.path.join(raiz, REL_ESTADO)
    d = _leer_json(ruta, {}) or {}
    base = estado_vacio()
    base.update({k: v for k, v in d.items() if k in base})
    return base


def guardar_estado(raiz, estado):
    _escribir_json(os.path.join(raiz, REL_ESTADO), estado)


def _siguiente_n(estado, fecha):
    return int((estado.get("tareas_encoladas") or {}).get(fecha, 0)) + 1


def _fase_actual(ahora):
    """Determina la fase según la hora en CDMX."""
    h = _hora_cdmx(ahora)
    if h < HORAS_RECOLECTAR:
        return "recolectar"
    if h <= HORAS_REDACTAR:
        return "redactar"
    return "entregar"


def _debe_entregar(estado, ahora):
    """True si toca entregar (fase entregar y no entregada hoy)."""
    fecha = _fecha_cdmx(ahora)
    return _fase_actual(ahora) == "entregar" and not (estado.get("fecha") == fecha and estado.get("entregada"))


def _recolectar(raiz, estado, ahora, encargar, jev, seco, home=None):
    """Fase 1: arma contexto y encola tareas de análisis."""
    fecha = _fecha_cdmx(ahora)
    ctx = SF.contexto(raiz, hoy=fecha, ahora=ahora.timestamp(), casa=home)
    tareas = ST.generar_tareas_analisis(ctx, raiz, ahora=_iso(ahora))
    if seco:
        return {"accion": "seco", "mensaje": "(seco) nada se escribe ni se encarga", "tareas": []}
    if not tareas:
        return {"accion": "nada", "mensaje": "Sin tareas de análisis hoy.", "tareas": []}
    try:
        encargo = (encargar or S.fundir_tareas)(
            _leer_json(os.path.join(raiz, REL_OLAS, NOMBRE_COLA), []), tareas
        )
        _escribir_json(os.path.join(raiz, REL_OLAS, NOMBRE_COLA), encargo)
    except Exception as e:
        return {"ok": False, "accion": "error", "mensaje": f"No se pudo encargar: {type(e).__name__}"}
    estado["tareas_encoladas"][fecha] = len(tareas)
    return {"accion": "cola_lista", "cola": f"{REL_OLAS}/{NOMBRE_COLA}",
            "tareas": [t["id"] for t in tareas], "mensaje": f"Cola de síntesis lista ({len(tareas)} tareas)."}


def _redactar(raiz, estado, ahora, jev, seco):
    """Fase 2: recoge salidas, funde en síntesis y pide revisión (inyectable en tests)."""
    # En implementación real, el director de autodesarrollo recoge salidas y encarga redacción+revisión.
    # Aquí solo marcamos que la fase avanza; la redacción real se hace via tareas encoladas.
    return {"accion": "esperando_salidas", "mensaje": "Esperando salidas de análisis para redactar."}


def _puntuar(estado_sintesis, jev):
    """Consulta a Jev para puntuar la calidad."""
    if jev is False:
        return {"respuesta": "medio", "p": None, "medio": "regla"}
    try:
        import decidir
        return decidir.consultar(
            "puntuar",
            {"sintesis": estado_sintesis},
            "¿La síntesis tiene todo dato con fuente y fecha, nada inventado y secciones completas?",
            niveles="bajo,medio,alto",
            regla="medio",
            quien=AGENTE,
        )
    except Exception:
        return {"respuesta": "medio", "p": None, "medio": "regla"}


def _resumen_1500_3000(texto):
    """Extrae un resumen de 1500-3000 caracteres."""
    if len(texto) <= RESUMEN_MAX:
        return texto
    # Busca corte en párrafo
    for i in range(RESUMEN_MIN, min(RESUMEN_MAX, len(texto))):
        if texto[i] == "\n":
            return texto[:i]
    return texto[:RESUMEN_MAX]


def _entregar(raiz, estado, ahora, enviar, jev, seco):
    """Fase 3: puntúa, guarda markdown, envía a Telegram."""
    fecha = _fecha_cdmx(ahora)
    ruta_md = os.path.join(raiz, REL_SINTESIS, f"{fecha}.md")
    if not os.path.exists(ruta_md):
        return {"ok": False, "accion": "sin_sintesis", "mensaje": f"No existe {ruta_md}"}
    with open(ruta_md, encoding="utf-8") as f:
        texto = f.read()
    if seco:
        return {"accion": "seco", "mensaje": "(seco) no se envía ni se marca entregada", "resumen": _resumen_1500_3000(texto)}
    puntuacion = _puntuar({"texto": texto[:6000]}, jev)
    estado["puntuacion"] = puntuacion
    resumen = _resumen_1500_3000(texto)
    r1 = enviar(resumen)
    r2 = enviar(texto)
    if r1.get("ok") and r2.get("ok"):
        estado["entregada"] = True
        estado["sintesis_path"] = ruta_md
        return {"ok": True, "accion": "entregada", "resumen": resumen, "puntuacion": puntuacion,
                "telegram": {"resumen": r1, "completa": r2}}
    return {"ok": False, "accion": "error_envio", "resumen": r1, "completa": r2}


def ciclo(raiz, ahora=None, encargar=None, jev=None, enviar=None, forzar=False, seco=False, home=None):
    """Un ciclo: decide fase, ejecuta y guarda estado. Todo inyectable; `seco` no escribe."""
    momento = _como_fecha(ahora)
    fecha = _fecha_cdmx(momento)
    estado = cargar_estado(raiz)
    jev = False if seco else jev
    # Reinicio diario
    if estado.get("fecha") != fecha:
        estado = estado_vacio()
        estado["fecha"] = fecha
    if not forzar and _dentro(estado.get("ultimo_ciclo"), momento, horas=CADA_HORAS):
        return {"ok": True, "agente": AGENTE, "fecha": fecha, "seco": seco, "toca": False,
                "motivo": f"ya hubo ciclo hace menos de {CADA_HORAS} h", "fase": estado.get("fase")}
    fase = _fase_actual(momento)
    estado["fase"] = fase
    if fase == "recolectar":
        res = _recolectar(raiz, estado, momento, encargar, jev, seco, home)
    elif fase == "redactar":
        res = _redactar(raiz, estado, momento, jev, seco)
    else:  # entregar
        if _debe_entregar(estado, momento):
            res = _entregar(raiz, estado, momento, enviar or SG.enviar, jev, seco)
        else:
            res = {"accion": "ya_entregada", "mensaje": "Síntesis ya entregada hoy."}
    if not seco:
        estado["ultimo_ciclo"] = _iso(momento)
        estado["ciclos"] = int(estado.get("ciclos") or 0) + 1
        guardar_estado(raiz, estado)
    return {"ok": True, "agente": AGENTE, "fecha": fecha, "seco": seco, "toca": True,
            "fase": fase, "resultado": res}


def _plan(raiz, ahora, home):
    ctx = SF.contexto(raiz, hoy=_fecha_cdmx(ahora), ahora=ahora.timestamp(), casa=home)
    tareas = ST.generar_tareas_analisis(ctx, raiz, ahora=_iso(ahora))
    return {"ok": True, "seco": True, "fecha": _fecha_cdmx(ahora), "fase": _fase_actual(ahora),
            "tareas": len(tareas), "detalle": [{"id": t["id"], "rama": t["rama"]} for t in tareas]}


def _estado(raiz):
    e = cargar_estado(raiz)
    return {"ok": True, "fecha": e.get("fecha"), "fase": e.get("fase"),
            "ultimo_ciclo": e.get("ultimo_ciclo"), "ciclos": e.get("ciclos"),
            "entregada": e.get("entregada"), "tareas_encoladas": e.get("tareas_encoladas"),
            "sintesis_path": e.get("sintesis_path"), "puntuacion": e.get("puntuacion")}


def parser():
    p = argparse.ArgumentParser(description="Agente de síntesis diaria de producción")
    p.add_argument("orden", choices=("plan", "ciclo", "estado", "navegador-estado"))
    p.add_argument("--raiz", default=RAIZ)
    p.add_argument("--home")
    p.add_argument("--seco", action="store_true")
    p.add_argument("--forzar", action="store_true")
    p.add_argument("--sin-jev", action="store_true")
    p.add_argument("--json", action="store_true")
    return p


def main(argv=None, salida=None):
    a = parser().parse_args(argv)
    ahora = _como_fecha(None)
    if a.orden == "plan":
        d = _plan(a.raiz, ahora, a.home)
    elif a.orden == "ciclo":
        d = ciclo(a.raiz, ahora, encargar=None, jev=False if a.sin_jev else None,
                  enviar=None, forzar=a.forzar, seco=a.seco, home=a.home)
    elif a.orden == "navegador-estado":
        d = _navegador_estado(a.raiz)
    else:
        d = _estado(a.raiz)
    salida = salida or sys.stdout
    if a.json:
        print(json.dumps(d, ensure_ascii=False, indent=1), file=salida)
    else:
        print(json.dumps(d, ensure_ascii=False), file=salida)
    return 0 if d.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())