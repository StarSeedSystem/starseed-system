#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Decisión pura: en qué orden coge el enjambre lo pendiente, y por qué.

El porqué (2026-09-13). Hasta aquí, las tareas se cogían EN EL ORDEN EN QUE APARECÍAN en
los archivos de cola. Consecuencia: una tarea de la que dependen otras cinco podía quedarse
la última, el frente de trabajo no se ensanchaba nunca, y la cola avanzaba por capricho del
nombre del archivo. Alex pide que los directores ORDENEN lo pendiente de forma inteligente.

«Inteligente» aquí NO significa llamar a un modelo: significa una puntuación DETERMINISTA,
barata y explicable, que cueste cero y se pueda probar y defender. Cada sumando deja una
razón en español, para que el Mando pueda enseñar no solo el orden sino su motivo.

La puntuación junta cinco ideas muy simples:
  · desbloqueo: quien libera a otros va antes (el frente se ensancha);
  · continuidad: lo ya empezado cuesta nada de terminar y devuelve contexto;
  · lo corto va antes: libera al trabajador rápido;
  · antigüedad con tope: evita que algo se pudra al fondo para siempre;
  · castigos: lo que ya falló no acapara trabajadores, y lo que toca a los
    directores va cuando el enjambre esté en calma.

Módulo PURO: sin red, sin disco, sin procesos.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple

PESOS = {
    "desbloqueo_por_tarea": 10.0,
    "desbloqueo_tope": 5,
    "continuidad": 15.0,
    "corta": {1: 12.0, 2: 8.0, 3: 4.0},
    "antiguedad_por_hora": 1.0,
    "antiguedad_tope": 24.0,
    "castigo_intento": 8.0,
    "castigo_riesgo": 10.0,
    # (2026-09-20, Alex) «activar la mayor cantidad de agentes simultaneos y seleccionar
    # sus modelos para agilizar y mejorar los procesos debe ser PRIORIDAD». Y tiene razon
    # aritmetica, no solo de criterio: una tarea que suma un medio o arregla el
    # enrutamiento de modelos no vale por si misma, vale por todo lo que vendra despues.
    # Hoy mismo se vio: el medio de la nube llevaba dias apagado por un fallo de tres
    # lineas, y mientras tanto la Mac iba al limite con tres agentes.
    "capacidad": 30.0,
}

#: Los archivos que deciden CUANTOS agentes corren y CON QUE MODELOS. No es una lista de
#: palabras sueltas en el titulo —eso acierta por casualidad—: son las rutas que gobiernan
#: la capacidad del sistema, y tocarlas cambia el techo de todo lo demas.
RUTAS_CAPACIDAD = (
    "scripts/puente/gobernador",      # cuantos trabajadores caben en cada maquina
    "scripts/puente/medios",          # que medios hay y cuales estan encendidos
    "scripts/puente/nube",            # el medio de la nube
    "scripts/puente/director-nube",   # quien lo enciende solo
    "scripts/puente/pasarelas",       # que proveedores estan vivos
    "scripts/puente/renovador",       # que claves siguen valiendo
    "scripts/puente/modelos",         # que modelo escribe cada tarea
    "scripts/puente/repartir-a-nube", # como se reparte entre medios
    ".github/workflows/enjambre-nube",
)

ESTADOS_EMPEZADOS = ("interrumpida", "fallo_tsc", "fallo_tests")
ESTADOS_CERRADOS = ("commit", "hecho")
RUTAS_RIESGO = ("scripts/puente/", "scripts/enjambre/")


def _a_datetime(valor: Any) -> Optional[datetime]:
    """Convierte `t` (ISO 8601) en datetime; si no se entiende, None.

    La antigüedad no puede tumbar el orden por una fecha rara en la cola.
    """
    if isinstance(valor, datetime):
        return valor
    if isinstance(valor, str):
        texto = valor.strip().replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(texto)
        except ValueError:
            return None
    return None


def dependientes_transitivos(tareas: Iterable[Dict[str, Any]]) -> Dict[str, Set[str]]:
    """{id: ids que dependen de él, directa o indirectamente}.

    Los ciclos no cuelgan (se marcan visitados) y las dependencias a ids que no
    existen se ignoran: una cola vieja no puede romper el orden del resto.
    """
    ids = {t.get("id") for t in tareas if isinstance(t, dict) and t.get("id")}
    depende: Dict[str, List[str]] = {}
    for t in tareas:
        if not isinstance(t, dict) or not t.get("id"):
            continue
        bruto = t.get("depende") or []
        if isinstance(bruto, str):
            bruto = [bruto]
        depende[t["id"]] = [d for d in bruto if d in ids and d != t["id"]]

    resultado: Dict[str, Set[str]] = {i: set() for i in ids}
    for origen in ids:
        vistos: Set[str] = set()
        pila = list(depende.get(origen, []))
        while pila:
            actual = pila.pop()
            if actual in vistos:
                continue
            vistos.add(actual)
            pila.extend(depende.get(actual, []))
        for descendiente in vistos:
            resultado[descendiente].add(origen)
    return resultado


def es_de_capacidad(tarea: Dict[str, Any]) -> bool:
    """¿Esta tarea sube el techo del sistema (mas agentes a la vez o mejores modelos)?

    Se marca a mano con `importancia: "capacidad"`, o se deduce de los archivos: son las
    rutas que gobiernan cuantos trabajadores caben y con que modelos escriben.
    """
    if not isinstance(tarea, dict):
        return False
    if str(tarea.get("importancia") or "").strip().lower() == "capacidad":
        return True
    archivos = tarea.get("archivos") or []
    if not isinstance(archivos, (list, tuple)):
        archivos = [archivos]
    return any(
        isinstance(a, str) and any(p in a for p in RUTAS_CAPACIDAD) for a in archivos
    )


def puntuar(
    tarea: Dict[str, Any],
    entrada_progreso: Optional[Dict[str, Any]],
    n_dependientes: int,
    ahora: Optional[datetime],
    pesos: Optional[Dict[str, Any]] = None,
) -> Tuple[float, List[str]]:
    """Devuelve (puntos, razones). Nunca lanza: lo que falta vale 0."""
    w = dict(PESOS)
    if pesos:
        w.update(pesos)
    puntos = 0.0
    razones: List[str] = []
    if not isinstance(tarea, dict):
        return 0.0, ["tarea ilegible"]

    progreso = entrada_progreso if isinstance(entrada_progreso, dict) else {}
    estado = str(progreso.get("estado") or "")

    n = int(n_dependientes or 0)
    if n > 0:
        sumando = w["desbloqueo_por_tarea"] * min(n, w["desbloqueo_tope"])
        puntos += sumando
        razones.append("desbloquea %d tareas" % min(n, w["desbloqueo_tope"]))

    if estado in ESTADOS_EMPEZADOS:
        puntos += w["continuidad"]
        razones.append("ya tiene trabajo hecho, le falta poco")

    archivos = tarea.get("archivos") or []
    if not isinstance(archivos, (list, tuple)):
        archivos = [archivos]
    try:
        n_archivos = len(archivos)
    except TypeError:
        n_archivos = 0
    corta = w.get("corta") or {}
    if 1 <= n_archivos <= 3 and n_archivos in corta:
        puntos += corta[n_archivos]
        razones.append("corta: libera antes al trabajador")

    creada = tarea.get("t")
    if creada and ahora:
        try:
            momento = _a_datetime(creada)
            if momento is not None:
                horas = (ahora - momento).total_seconds() / 3600.0
                if horas > 0:
                    sumando = min(
                        horas * w["antiguedad_por_hora"], w["antiguedad_tope"]
                    )
                    puntos += sumando
                    razones.append("lleva %d h esperando" % int(horas))
        except Exception:
            pass

    intentos = int(progreso.get("intentos_auto") or tarea.get("intentos_auto") or 0)
    if intentos > 0:
        puntos -= w["castigo_intento"] * intentos
        razones.append("ha fallado %d veces: no acapara trabajadores" % intentos)

    # La capacidad va ANTES que el castigo por riesgo: si una tarea sube el techo de
    # agentes o arregla el enrutamiento de modelos, vale la pena aunque toque a los
    # directores. El castigo de abajo la frenaria justo cuando mas falta hace.
    if es_de_capacidad(tarea):
        puntos += w["capacidad"]
        razones.append(
            "sube el techo del sistema (mas agentes o mejores modelos): vale por todo lo que venga despues"
        )

    toca_riesgo = any(
        isinstance(a, str) and any(a.startswith(p) for p in RUTAS_RIESGO)
        for a in (archivos if isinstance(archivos, (list, tuple)) else [])
    )
    if toca_riesgo:
        puntos -= w["castigo_riesgo"]
        razones.append("toca a los directores: mejor con el enjambre en calma")

    return puntos, razones


def ordenar(
    tareas: Sequence[Dict[str, Any]],
    progreso: Dict[str, Any],
    ahora: Optional[datetime],
    pesos: Optional[Dict[str, Any]] = None,
) -> Tuple[
    List[Tuple[Dict[str, Any], float, List[str]]], List[Tuple[Dict[str, Any], str]]
]:
    """Devuelve (listas, bloqueadas).

    Bloqueadas: las que tienen alguna dependencia sin cerrar, con la razón y el id
    que falta; no estorban en la cola. Listas: el resto, de más puntos a menos,
    con desempate por id ascendente para que el orden sea estable y comprobable.
    """
    if not tareas:
        return [], []
    if not isinstance(progreso, dict):
        progreso = {}

    trans = dependientes_transitivos(tareas)
    listas: List[Tuple[Dict[str, Any], float, List[str]]] = []
    bloqueadas: List[Tuple[Dict[str, Any], str]] = []

    for tarea in tareas:
        if not isinstance(tarea, dict):
            continue
        tid = tarea.get("id")
        cuenta = len(trans.get(tid, set())) if tid else 0
        entrada = progreso.get(tid, {}) if tid else {}

        deps = tarea.get("depende") or []
        if isinstance(deps, str):
            deps = [deps]
        abierta = None
        for dep in deps:
            estado_dep = str((progreso.get(dep) or {}).get("estado") or "")
            if estado_dep not in ESTADOS_CERRADOS:
                abierta = dep
                break
        if abierta is not None:
            bloqueadas.append(
                (tarea, "espera a «%s», que aún no está cerrada" % abierta)
            )
            continue

        puntos, razones = puntuar(tarea, entrada, cuenta, ahora, pesos)
        listas.append((tarea, puntos, razones))

    # La capacidad va en su propio TRAMO, delante de todo lo demas. Como peso no bastaba:
    # el tope de antiguedad (24 puntos) hacia que cualquier tarea de ayer adelantase a la
    # que sube el techo del sistema. Alex lo dijo como prioridad, y una prioridad que se
    # puede perder por acumular horas no es una prioridad. (2026-09-20)
    # (2026-09-23) «Asignar esta ya» desde el Mando escribe `adelantar` en su progreso: esa va
    # delante de TODO, capacidad incluida. Es una orden de Alex, no un peso que se negocia.
    def _adelantada(tarea):
        entrada = progreso.get(tarea.get("id")) if tarea.get("id") else None
        return isinstance(entrada, dict) and bool(entrada.get("adelantar"))

    for tarea, _puntos, razones in listas:
        if _adelantada(tarea):
            razones.insert(0, "Alex la pidió primero desde el Mando")
    listas.sort(
        key=lambda x: (
            0 if _adelantada(x[0]) else 1,
            0 if es_de_capacidad(x[0]) else 1,
            -x[1],
            str(x[0].get("id") or ""),
        )
    )
    bloqueadas.sort(key=lambda x: str(x[0].get("id") or ""))
    return listas, bloqueadas
