# -*- coding: utf-8 -*-
"""Carril de alta capacidad en la nube · decisiones PURAS (Ola 1022C, ALT1022A).

`memory/orquestacion-economica.md` §0, «Carril de alta capacidad», peldaño 4a: Alex tiene un
crédito (250 $ el 2026-10-22) que SOLO gastan las sesiones de Claude Code en la nube
(`claude --model <m> --cloud <descripción>`). Medido ese día: dos sesiones lanzadas a mano desde
la Mac bajaron el crédito de 250 a 248 $ sin mover la semana del plan. Este módulo decide; el CLI
`alta-capacidad-nube.py` lanza, sigue y trae. Aquí no hay red, ni disco, ni reloj propio: `ahora`
entra como argumento (epoch en segundos) y todo se prueba en `test_alta_capacidad_nube_logica.py`.

Mientras una sesión trabaja, su tarea está `reasignada` con `medio: "claude-nube"` (ningún
reclamador toca ese medio). La sesión empuja `nube/cc-<AAAAMMDD>/ola/<ID>`, que `traer_nube.py`
reconoce por el sufijo `/ola/<ID>`.
"""
from __future__ import annotations

import re
from datetime import datetime

MEDIO = "claude-nube"
ESTADO_PRESTADA = "reasignada"
#: Estados de una dependencia ya cumplida.
CUMPLIDAS = {"commit", "hecho", "integrada"}
#: Coste estimado por sesión, para el ritmo; el saldo real lo corrige `credito_claude_nube.py declarar`.
COSTE_USD = {"claude-opus-5-5": 3.0, "sonnet": 1.0}
MODELO_CAPAZ = "claude-opus-5-5"
MODELO_ECONOMICO = "sonnet"

_ANSI = re.compile(r"\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\)|[@-Z\\-_])")
_VIEW = re.compile(r"View:\s*(https://claude\.ai/code/(session_[A-Za-z0-9]+))")
_TITULO = re.compile(r"Created cloud session:\s*(.+)")


def _vence_epoch(vence):
    """Epoch de una fecha ISO con zona, o None si falta, no se entiende o no lleva zona."""
    texto = str(vence or "").strip()
    if not texto:
        return None
    try:
        d = datetime.fromisoformat(texto.replace("Z", "+00:00"))
    except ValueError:
        return None
    if d.tzinfo is None:
        return None
    return d.timestamp()


def cupo_nube(credito, ahora, vivas, max_vivas=3, reserva_usd=10.0):
    """(se puede lanzar, motivo, presupuesto de hoy en $).

    Presupuesto de hoy = (restante − reserva) / días que faltan hasta `vence` (mínimo 1 día)."""
    credito = credito if isinstance(credito, dict) else {}
    vence = _vence_epoch(credito.get("vence"))
    if vence is None:
        return False, "el crédito no dice cuándo vence (o la fecha no lleva zona): no lanzo a ciegas", 0.0
    if vence <= ahora:
        return False, "el crédito de la nube venció (%s)" % credito.get("vence"), 0.0
    try:
        restante = float(credito.get("restante_usd") or 0)
    except (TypeError, ValueError):
        restante = 0.0
    if restante <= reserva_usd:
        return False, "quedan %.2f $ y la reserva es %.2f $: no se gasta más" % (restante, reserva_usd), 0.0
    dias = max(1.0, (vence - ahora) / 86400.0)
    hoy = round((restante - reserva_usd) / dias, 2)
    if vivas >= max_vivas:
        return False, "ya hay %d sesiones vivas (tope %d)" % (vivas, max_vivas), hoy
    return True, "hay cupo: %d de %d vivas, %.2f $ para hoy" % (vivas, max_vivas, hoy), hoy


def rama_pedida(tid, fecha_aaaammdd):
    return "nube/cc-%s/ola/%s" % (fecha_aaaammdd, tid)


def orden_cli(modelo, descripcion):
    """La orden exacta: `--cloud` toma un valor opcional, así que va la última con su descripción."""
    modelo = str(modelo or "").strip()
    if not modelo or modelo.startswith("-"):
        raise ValueError("modelo no válido: %r" % modelo)
    if not str(descripcion or "").strip():
        raise ValueError("la descripción de la sesión no puede ir vacía")
    return ["claude", "--model", modelo, "--cloud", descripcion]


def brief(plantilla, tarea, fecha):
    """Sustituye {ID}, {TITULO}, {FECHA}, {ARCHIVOS} y, la última, {PROMPT}: las llaves que traiga
    el prompt de la tarea no se tocan."""
    tarea = tarea if isinstance(tarea, dict) else {}
    archivos = tarea.get("archivos") or []
    if isinstance(archivos, str):
        archivos = [archivos]
    texto = str(plantilla or "")
    for clave, valor in (("{ID}", tarea.get("id") or ""), ("{TITULO}", tarea.get("titulo") or ""),
                         ("{FECHA}", fecha), ("{ARCHIVOS}", ", ".join(str(a) for a in archivos))):
        texto = texto.replace(clave, str(valor))
    return texto.replace("{PROMPT}", str(tarea.get("prompt") or ""))


def limpiar_terminal(texto):
    """Quita secuencias ANSI y retornos de carro de la salida de una pseudoterminal."""
    return _ANSI.sub("", str(texto or "")).replace("\r", "")


def sesion_de_salida(texto):
    """{"sesion", "url" (sin query), "titulo"} de la salida del CLI, o None si no hay `View:`."""
    limpio = limpiar_terminal(texto)
    m = _VIEW.search(limpio)
    if not m:
        return None
    t = _TITULO.search(limpio)
    return {"sesion": m.group(2), "url": m.group(1), "titulo": t.group(1).strip() if t else ""}


def _prestada(progreso, tid):
    e = progreso.get(tid) if isinstance(progreso, dict) else None
    return isinstance(e, dict) and e.get("estado") == ESTADO_PRESTADA and e.get("medio") == MEDIO


def _sesiones(registro):
    s = registro.get("sesiones") if isinstance(registro, dict) else None
    return [x for x in s if isinstance(x, dict) and x.get("tarea")] if isinstance(s, list) else []


def abiertas(registro):
    """Las sesiones del registro sin estado final (`traida`, `devuelta`)."""
    return [s for s in _sesiones(registro) if not s.get("final")]


def seguir(registro, ramas_remotas, progreso, ahora, gracia_h=8):
    """{tarea: «traer» | «devolver» | «esperar» | «olvidar»} por cada sesión abierta del registro."""
    salida = {}
    for s in abiertas(registro):
        tid = str(s["tarea"])
        if not _prestada(progreso, tid):
            salida[tid] = "olvidar"
        elif s.get("rama_pedida") in ramas_remotas:
            salida[tid] = "traer"
        elif ahora - float(s.get("t") or 0) > gracia_h * 3600:
            salida[tid] = "devolver"
        else:
            salida[tid] = "esperar"
    return salida


def sesiones_vivas(registro, progreso):
    return sum(1 for s in abiertas(registro) if _prestada(progreso, str(s["tarea"])))


def _num_archivos(tarea):
    a = tarea.get("archivos") or []
    return 1 if isinstance(a, str) else len(a)


def ya_fallo(tarea, entrada=None):
    """Falló con otros modelos: `intentos_auto` ≥ 2 o `modelos_fallidos` no vacío (tarea o progreso)."""
    for d in (tarea, entrada or {}):
        if not isinstance(d, dict):
            continue
        try:
            if int(d.get("intentos_auto") or 0) >= 2:
                return True
        except (TypeError, ValueError):
            pass
        if d.get("modelos_fallidos"):
            return True
    return False


def modelo_para(tarea, entrada=None):
    """Opus si es de alta capacidad, toca ≥ 3 archivos o ya falló con otros; si no, Sonnet."""
    tarea = tarea if isinstance(tarea, dict) else {}
    if tarea.get("alta_capacidad") or _num_archivos(tarea) >= 3 or ya_fallo(tarea, entrada):
        return MODELO_CAPAZ
    return MODELO_ECONOMICO


def coste_estimado(modelo):
    return COSTE_USD.get(modelo, COSTE_USD[MODELO_CAPAZ])


def candidatas(colas, progreso, registro):
    """Tareas que el carril puede tomar, en su orden: [(tarea, nombre de la cola)].

    `colas`: [(nombre, [tareas])] de la más reciente a la más vieja; la primera que tiene un id
    manda. Fuera: no pendientes, dependencias sin cumplir, privadas y las que ya están en el
    registro. Orden: `alta_capacidad`, ≥ 3 archivos, ya fallidas y, al final, antigüedad en su cola."""
    progreso = progreso if isinstance(progreso, dict) else {}
    vistas, en_registro, filas = set(), {str(s["tarea"]) for s in _sesiones(registro)}, []
    for nombre, tareas in colas:
        for pos, t in enumerate(tareas or []):
            if not isinstance(t, dict) or not t.get("id"):
                continue
            tid = str(t["id"])
            if tid in vistas:
                continue
            vistas.add(tid)
            entrada = progreso.get(tid) if isinstance(progreso.get(tid), dict) else {}
            if (entrada.get("estado") or "pendiente") != "pendiente":
                continue
            if t.get("privada") or tid in en_registro:
                continue
            depende = t.get("depende") or []
            if isinstance(depende, str):
                depende = [depende]
            if any((progreso.get(d) or {}).get("estado") not in CUMPLIDAS for d in depende):
                continue
            clave = (0 if t.get("alta_capacidad") else 1, 0 if _num_archivos(t) >= 3 else 1,
                     0 if ya_fallo(t, entrada) else 1, pos)
            filas.append((clave, t, nombre))
    filas.sort(key=lambda f: f[0])
    return [(t, nombre) for _, t, nombre in filas]


def gastado_hoy(registro, inicio_dia):
    """Coste estimado de las sesiones lanzadas desde `inicio_dia` (epoch)."""
    return sum(float(s.get("coste_usd") or 0) for s in _sesiones(registro) if float(s.get("t") or 0) >= inicio_dia)


def elegir_auto(cands, vivas, max_vivas, presupuesto_hoy, gastado, maximo=None):
    """De las candidatas, las que caben: hasta llenar `max_vivas` sin pasar el presupuesto de hoy.

    Devuelve [(tarea, cola, modelo, coste)]."""
    huecos = max(0, max_vivas - vivas)
    if maximo is not None:
        huecos = min(huecos, max(0, int(maximo)))
    elegidas, gasto = [], float(gastado)
    for t, cola in cands:
        if len(elegidas) >= huecos:
            break
        modelo = modelo_para(t)
        coste = coste_estimado(modelo)
        if gasto + coste > presupuesto_hoy:
            continue  # una más barata detrás puede caber
        gasto += coste
        elegidas.append((t, cola, modelo, coste))
    return elegidas
