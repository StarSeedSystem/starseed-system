#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Selección pura de trabajo real para el vigilante del enjambre."""

import re

# El latido de la nube corre sobre un clon que puede ir por detrás: si
# `prioridad_logica` aún no existe allí, la ordenación se salta y se devuelve
# el orden del archivo, que es lo que ese latido espera hoy.
try:
    import prioridad_logica
except ImportError:  # pragma: no cover
    try:
        from scripts.puente import prioridad_logica  # type: ignore
    except ImportError:
        prioridad_logica = None


# Estos estados necesitan una decisión humana o ya cerraron la tarea. Repetirlos
# automáticamente cada 90 s solo gasta proveedores y multiplica el historial.
ESTADOS_NO_AUTOMATICOS = {
    "commit",
    "bloqueante",
    "sustituida",
    "rechazada",
    "sin_cambios",
    "fallo",
    "fallo_tsc",
    "fallo_tests",
    "conflicto",
    "reasignada",
    "pendiente_aprobacion",
    "esperando_aprobacion",
    "bloqueada",
    # (2026-09-20) Decisión humana explícita: no se relanza sola (DR0919-1, recompilar BitNet,
    # es de Alex). Se reabre poniéndola en `pendiente`.
    "descartada",
    "integrada",
}


def es_cola_fuente(nombre):
    """Las colas `auto-*` son copias de ejecución, nunca demanda nueva."""
    return (
        nombre.startswith("cola-")
        and nombre.endswith(".json")
        and not nombre.startswith("cola-auto-")
    )


def ultima_salida(lineas, tope=200):
    """Del registro del orquestador saca (codigo_exit, motivo) de la ÚLTIMA línea
    `__EXIT__=N`. El motivo es la última línea no vacía anterior. Si no hay
    marca `__EXIT__`, devuelve (None, "")."""
    codigo, motivo = None, ""
    anterior = ""
    for linea in lineas:
        limpia = linea.rstrip()
        if limpia.startswith("__EXIT__="):
            try:
                codigo = int(limpia.split("=", 1)[1].strip())
            except ValueError:
                codigo, motivo = None, ""
            else:
                motivo = anterior[:tope]
        elif limpia:
            anterior = limpia
    return codigo, motivo


def id_en_asuntos(tid, asuntos):
    """Reconoce el id INTEGRADO: el asunto de un commit de integración («Ola 228 · V2: …»,
    «345 · NE3-1: …», «salvavidas · NE3-1: …»), con el id justo antes de los dos puntos.
    Una mención en otro asunto («reparto a la nube (CC2, MD1)») no cuenta (2026-09-21)."""
    patron = re.compile(r"(?:^|·\s*)%s\s*:" % re.escape(tid))
    return any(patron.search(asunto) for asunto in asuntos)


def seleccionar_pendientes(colas, progreso, asuntos_git, ahora=None):
    """Deduplica por id y excluye cierres, copias automáticas e integradas en git.

    Si progreso[tid] tiene `modelo_siguiente`, devuelve una COPIA de la tarea con ese modelo.
    `colas` llega ordenada de más nueva a más antigua como pares
    `(nombre, tareas)`, de modo que ante deuda histórica gana la definición nueva.

    Con `ahora` (datetime) la salida se reordena con `prioridad_logica.ordenar`:
    primero lo que desbloquea más trabajo, y fuera lo bloqueado por dependencias
    abiertas (no es ejecutable, así que no se ofrece). Sin `ahora` el orden es
    exactamente el del archivo, para no moverle el suelo a quien ya llama.
    """
    vistas, salida = set(), []
    for nombre, tareas in colas:
        if not es_cola_fuente(nombre):
            continue
        for tarea in tareas:
            if not isinstance(tarea, dict) or not tarea.get("id"):
                continue
            tid = str(tarea["id"])
            if tid in vistas:
                continue
            vistas.add(tid)
            estado = progreso.get(tid, {})
            actual = estado.get("estado") if isinstance(estado, dict) else ""
            if actual in ESTADOS_NO_AUTOMATICOS or id_en_asuntos(tid, asuntos_git):
                continue
            # Si el progreso indica un modelo_siguiente, devolver copia con ese modelo
            seleccionada = tarea
            modelo_siguiente = (
                estado.get("modelo_siguiente") if isinstance(estado, dict) else None
            )
            if modelo_siguiente:
                seleccionada = dict(tarea)
                seleccionada["modelo"] = modelo_siguiente
            salida.append(seleccionada)
    if ahora is not None and prioridad_logica is not None:
        listas, _bloqueadas = prioridad_logica.ordenar(salida, progreso, ahora)
        return [tarea for tarea, _puntos, _razones in listas]
    return salida


def decidir_relanzamiento(cfg, hay_orquestador, n_pendientes):
    """Decisión pura de relanzar sin tocar disco ni procesos.

    Devuelve (relanzar, trabajadores, tope). No relanza si el orquestador ya
    vive, si no queda trabajo o si el Mando puso `pausado` para ajustar.
    """
    trabajadores = int(cfg.get("trabajadores", 5))
    tope = int(cfg.get("tope_por_relanzamiento", 20))
    if hay_orquestador or n_pendientes <= 0 or cfg.get("pausado"):
        return (False, trabajadores, tope)
    return (True, trabajadores, tope)


CAMPOS_CORRECCION = ("estado", "nota", "medio", "modelo_siguiente")


def aplicar_correcciones(progreso, correcciones):
    """Funde `correcciones` ({tid: {estado, nota, medio, modelo_siguiente}}) en una COPIA
    de `progreso`. Solo esos campos; el resto de la entrada se conserva. Devuelve
    (progreso_nuevo, aplicadas). Se llama con el orquestador PARADO: con él vivo, su
    copia en memoria pisaría el cambio (2026-09-20)."""
    if not isinstance(correcciones, dict) or not correcciones:
        return progreso, []
    salida = {k: (dict(v) if isinstance(v, dict) else v) for k, v in (progreso or {}).items()}
    aplicadas = []
    for tid, c in correcciones.items():
        if not isinstance(c, dict) or not str(c.get("estado") or "").strip():
            continue
        e = salida.get(tid) if isinstance(salida.get(tid), dict) else {}
        for campo in CAMPOS_CORRECCION:
            if campo in c:
                e[campo] = c[campo]
        e["corregido"] = str(c.get("t") or "director")
        salida[str(tid)] = e
        aplicadas.append(str(tid))
    return salida, aplicadas


def ids_colisionados(tareas, asuntos, progreso=None):
    """Ids de una cola que YA figuran integrados en main (otra ola los usó) y cuya tarea no
    consta integrada en progreso: el vigilante los saltaría en silencio para siempre.
    Un id vive en UNA sola cola (2026-09-20: MD1, MD2, AG1, AG2, W1 y W2 repetidos)."""
    salida = []
    for t in tareas or []:
        tid = str((t or {}).get("id") or "")
        if not tid:
            continue
        e = (progreso or {}).get(tid) if isinstance(progreso, dict) else None
        estado = e.get("estado") if isinstance(e, dict) else None
        if estado in ("commit", "integrada", "sustituida"):
            continue
        if id_en_asuntos(tid, asuntos):
            salida.append(tid)
    return salida
