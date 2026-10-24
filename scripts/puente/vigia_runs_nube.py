#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Vigía de los runs de la nube: que ningún agente se quede «preparando su máquina» sin que nadie lo vea.

POR QUÉ (2026-10-13, MEDIDO)
---------------------------
Alex: «la mayoría de agentes en proceso están "preparando su máquina" desde hace mucho y aún no se
autoverifica por los directores». Medido en GitHub ese mismo minuto, eran tres cosas distintas:

  · Dos runs llevaban 25-30 min en «Enjambre» (escribiendo) y Genesis decía «preparando»: GitHub
    deja «Set up job» en «in_progress» y `paso_actual` tomaba el PRIMER paso en curso. Arreglado en
    `agentes_nube.paso_actual` (manda el más avanzado) y `paso_monotono` (no vuelve atrás).
  · Un run DUPLICADO: el director y «Buscar más capacidad» lanzaron en el mismo minuto; el reparto
    del director no creó cola, `cola_creada` tomó la cola recién creada por el otro y la lanzó otra
    vez. Quedó «pending» (mismo grupo de concurrencia) para repetir las 6 tareas al acabar el primero.
    Arreglado en `nube-gh.py` (cerrojo + sin adivinar la cola) y aquí se detecta y se cancela.
  · Ningún director miraba si un run se atasca antes de escribir: con `timeout-minutes: 355`, un
    `npm ci` colgado ocupaba la máquina seis horas.

Qué hace: `diagnosticar` (PURA) mira cada run vivo con los números de `agentes-nube.json`, y
`actuar` (lo llama `director-nube.py` en cada pasada) lo dice UNA vez en el Chat Director.
SOLO CANCELA con datos fiables del RUN (no de sus pasos): el duplicado de una cola que ya lleva
otro run y el que lleva 30 min sin máquina; devuelve sus tareas sin gastarles un envío. Lo que
sale de los PASOS de GitHub (preparación larga, «sin dato del paso», pasado de tope) solo se
avisa: el 13-10 a las 16:21 la primera versión canceló por los pasos dos runs que escribían.
(2026-10-24, MEDIDO) Las «reasignada» con nota «movida a nube-gh (run N)» cuyo run N terminó hace
más de 6 h vuelven a «pendiente» con la misma devolución, sin envío (VZF1015Q, VZR1011B, DGM1018I).
"""
from __future__ import annotations

import datetime as _dt
import json
import os
import re
import subprocess
import time

#: Lo normal es menos de 1 min de preparación (checkout, node, dependencias): medido 34-44 s.
PREPARACION_MAX_S = 12 * 60
#: Un run que espera máquina más de esto no la va a tener pronto: sus tareas, mejor en otro medio.
ESPERA_MAX_S = 30 * 60
#: Sin ningún dato de paso durante tanto tiempo: se avisa, no se cancela (podría estar trabajando).
SIN_PASOS_AVISO_S = 25 * 60
#: Margen sobre el tope de minutos con que se lanzó (el enjambre sale solo a su tope; entregar tarda 1 min).
MARGEN_TOPE_MIN = 20
ESPERAN = ("queued", "pending", "waiting", "requested")
TRABAJO = ("enjambre",)
FINALES = ("entregar", "tachar", "rastro", "post ", "complete job")
MEMORIA = os.path.expanduser("~/.starseed/nube-vigia.json")
#: Un atasco que pide confirmación se actúa solo si se ve igual en otra pasada, al menos tanto después.
CONFIRMAR_S = 200
#: (2026-10-24) La nota del «soltar» de Genesis lleva el run en que la tarea se fue a la nube.
RUN_EN_NOTA = re.compile(r"movida a nube[- ]gh.*?\(run\s*(\d+)\)")
#: Más que esto desde su ÚLTIMO cambio (campo `t` del progreso) con su run ya muerto: varada.
VIEJO_VARADA_S = 6 * 3600
#: Estados del RUN (API de GitHub, la misma fuente que alimenta `diagnosticar`) que aún
#: pudieran estar haciendo la tarea. NUNCA se miran los pasos: con ellos se cortó lo vivo.
RUN_VIVO = ("in_progress",) + ESPERAN


def _segundos_desde(iso, ahora):
    try:
        return ahora - _dt.datetime.fromisoformat(str(iso).replace("Z", "+00:00")).timestamp()
    except (TypeError, ValueError):
        return None


def es_preparacion(paso) -> bool:
    """PURA. ¿El paso es de preparación (antes de escribir)? «sin dato» y «esperando» no lo son."""
    p = str(paso or "").strip().lower()
    if not p or p in ("sin dato del paso", "esperando máquina"):
        return False
    return not any(p.startswith(t) for t in TRABAJO) and not any(p.startswith(f) for f in FINALES)


def diagnosticar(fila, filas, ahora):
    """PURA. El atasco de un run vivo, o None. → {tipo, motivo, cancelar, devolver}."""
    if not isinstance(fila, dict):
        return None
    estado = str(fila.get("estado") or "")
    minutos = fila.get("minutos")
    edad_s = (minutos or 0) * 60 if isinstance(minutos, (int, float)) else None
    cola = fila.get("cola")
    if estado in ESPERAN:
        otro = next((f for f in filas or [] if isinstance(f, dict) and f is not fila and f.get("cola") == cola
                     and cola and str(f.get("estado")) == "in_progress"), None)
        if otro is not None:
            return {"tipo": "duplicado", "cancelar": True, "devolver": False,
                    "motivo": "repite la cola del run %s, que ya la está haciendo" % otro.get("run")}
        if edad_s is not None and edad_s > ESPERA_MAX_S:
            return {"tipo": "sin-maquina", "cancelar": True, "devolver": True,
                    "motivo": "lleva %d min sin máquina de GitHub" % (edad_s // 60)}
        return None
    if estado != "in_progress":
        return None
    try:
        tope = int(str(fila.get("minutos_tope") or "").strip())
    except ValueError:
        tope = None
    # Solo aviso: los minutos cuentan desde que se CREÓ el run (con su espera de máquina incluida).
    if tope and isinstance(minutos, (int, float)) and minutos > tope + MARGEN_TOPE_MIN:
        return {"tipo": "pasado-de-tope", "cancelar": False, "devolver": False,
                "motivo": "lleva %d min desde que se lanzó con un tope de %d" % (minutos, tope)}
    paso = fila.get("paso")
    # (2026-10-13, 16:21 en la Mac, MEDIDO EN CARNE PROPIA) La primera versión CANCELABA aquí y
    # cortó dos runs que estaban escribiendo: GitHub devolvió la lista de pasos sin «Enjambre» y el
    # más avanzado era «Claves» (hecho hace 35 min). Los pasos de un job en marcha NO son fiables
    # (listas incompletas, «Set up job» y «Dependencias» que siguen «in_progress» ya terminados), así
    # que con ellos solo se AVISA, y solo de un paso de preparación EN CURSO que no sea el primero.
    # El cuelgue de verdad lo corta el propio workflow (`timeout-minutes: 12` en «Dependencias»).
    if (es_preparacion(paso) and fila.get("paso_estado") == "in_progress" and not fila.get("paso_de_antes")
            and str(paso).strip().lower() != "set up job"):
        en_paso = _segundos_desde(fila.get("paso_desde"), ahora)
        if en_paso is not None and en_paso > PREPARACION_MAX_S:
            # (2026-10-13, 22:44, MEDIDO) Ni una lista COMPLETA y coherente basta: el run 38478394570
            # salió 10 min con «setup-node» en curso y todo lo de detrás sin empezar, y estaba escribiendo
            # desde las 22:32:47. GitHub sirve fotos viejas de los pasos durante minutos. Con pasos, NUNCA
            # se corta: el cuelgue real lo cortan los topes por paso del workflow (5, 6 y 12 min).
            return {"tipo": "preparacion-larga", "cancelar": False, "devolver": False,
                    "motivo": "GitHub dice que lleva %d min en «%s» (lo normal es menos de 1 min; el workflow lo "
                              "corta solo)" % (en_paso // 60, paso)}
    if str(paso or "") == "sin dato del paso" and edad_s is not None and edad_s > SIN_PASOS_AVISO_S:
        return {"tipo": "sin-pasos", "cancelar": False, "devolver": False,
                "motivo": "GitHub no da ningún paso de este job desde hace %d min" % (edad_s // 60)}
    return None


def ids_de_cola(datos) -> list:
    """PURA. Los ids de una cola (lista de tareas o {tareas: [...]})."""
    tareas = datos if isinstance(datos, list) else (datos or {}).get("tareas") if isinstance(datos, dict) else []
    return [str(t.get("id")) for t in tareas or [] if isinstance(t, dict) and t.get("id")]


def devolver(progreso, ids, run, motivo, fecha):
    """PURA. Copia del progreso con las que siguen «reasignada · nube» de vuelta a pendiente. → (nuevo, ids)."""
    salida, hechas = dict(progreso or {}), []
    for tid in ids:
        v = salida.get(tid)
        de_la_nube = (v.get("medio") or "") == "nube" or "(run %s)" % run in str(v.get("nota") or "") \
            if isinstance(v, dict) else False
        if isinstance(v, dict) and v.get("estado") == "reasignada" and de_la_nube:
            v = dict(v)
            v.update(estado="pendiente", medio=None,
                     nota="devuelta de la nube %s: el run %s %s y el director lo canceló; no cuenta como envío"
                     % (fecha, run, motivo))
            salida[tid] = v
            hechas.append(tid)
    return salida, hechas


def candidatas_varadas(tareas, ahora, viejo_s=VIEJO_VARADA_S):
    """PURA. [(tid, run)] de las «reasignada» que se fueron a nube-gh (run N) y llevan MÁS de
    `viejo_s` desde su último cambio (el `t` que el orquestador anota). El run sale de la nota;
    sin nota con run, o sin `t` legible, NO entra. La nube por medio «nube» o soltada con la
    nota «movida a nube…» sin medio (la misma condición de `repartir_nube.reclamar_varadas`)."""
    salida = []
    for tid, v in (tareas or {}).items():
        if not isinstance(v, dict) or str(v.get("estado") or "") != "reasignada":
            continue
        nota = str(v.get("nota") or "")
        if not ((v.get("medio") or "") == "nube" or (not v.get("medio") and nota.startswith("movida a nube"))):
            continue
        m = RUN_EN_NOTA.search(nota)
        edad = _segundos_desde(v.get("t"), ahora)
        if m is not None and edad is not None and edad > viejo_s:
            salida.append((str(tid), m.group(1)))
    return salida


def varadas(tareas, estados, ahora, viejo_s=VIEJO_VARADA_S):
    """PURA. Las de `candidatas_varadas` cuyo run N YA NO está en marcha: [(tid, run)].
    `estados` es {run: estado} tal cual lo devuelve la API del RUN (nunca los pasos).
    Sin estado para un run —o `estados` None, «no se pudo consultar»— se queda."""
    if not estados:
        return []
    salida = []
    for tid, run in candidatas_varadas(tareas, ahora, viejo_s):
        estado = str(estados.get(run) or "").strip().lower()
        if not estado or estado in RUN_VIVO:
            continue
        salida.append((tid, run))
    return salida


def devolver_varadas(progreso, pares, fecha):
    """PURA. La MISMA devolución que `devolver` (runs cancelados), para las varadas:
    a «pendiente» sin gastar envío y sin mutar lo recibido."""
    salida, hechas = dict(progreso or {}), []
    for tid, run in (pares or []):
        v = salida.get(tid)
        de_la_nube = (v.get("medio") or "") == "nube" or ("(run %s)" % run in str(v.get("nota") or "")
            if isinstance(v, dict) else False)
        if isinstance(v, dict) and v.get("estado") == "reasignada" and de_la_nube:
            v = dict(v)
            v.update(estado="pendiente", medio=None,
                     nota="devuelta de la nube %s: el run %s terminó hace más de 6 h y nadie la estaba "
                          "haciendo; no cuenta como envío" % (fecha, run))
            salida[tid] = v
            hechas.append(tid)
    return salida, hechas


def _leer(ruta, defecto):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def _escribir(ruta, datos):
    tmp = ruta + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    os.replace(tmp, ruta)


def _avisar(texto):
    try:
        import director_chat

        director_chat.publicar(texto, de="director-nube", rol="director", tipo="aviso")
    except Exception:
        print("director-nube: no pude avisar en el Chat Director", flush=True)


def _estado_del_run(run, raiz):
    """El estado del RUN entero por la API de GitHub (`gh run view`), o None si no respondió.
    Es el dato del RUN que ya usa `diagnosticar` (el `status` del resumen de `agentes_nube`);
    NUNCA los pasos: con pasos de un job en marcha se llegó a cortar lo vivo. Sin dato no se toca."""
    try:
        p = subprocess.run(
            ["gh", "run", "view", str(run), "--json", "status", "--jq", ".status"],
            cwd=raiz, capture_output=True, text=True, timeout=45,
        )
    except Exception:
        return None
    salida = (p.stdout or "").strip() if p.returncode == 0 else ""
    return salida or None


def _varadas_a_pendiente(raiz, ahora):
    """(OPS1024E, 2026-10-24) Devuelve a la cola las «reasignada · nube» VARADAS: la nota dice
    con qué run N se fueron y ese run ya terminó, nadie las va a hacer. Medido: VZF1015Q,
    VZR1011B y DGM1018I, movidas el 21-10, el 24 seguían «reasignada» con sus runs muertos.
    Regla: run N ya no en marcha (dato del RUN de la API, nunca de los pasos) y más de 6 h del
    último cambio → «pendiente» con la MISMA devolución de los cancelados, sin gastar envío.
    Run vivo o sin dato, no se toca. UNA línea en el Chat Director con cuántas. Nunca lanza."""
    import repartir_nube as RN

    ruta_prog = os.path.join(raiz, "starseed_memory_root", "olas", "progreso.json")
    prog = _leer(ruta_prog, {})
    tareas = prog.get("tareas") if isinstance(prog, dict) and "tareas" in prog else prog
    if not isinstance(tareas, dict):
        return []
    runs = sorted({run for _tid, run in candidatas_varadas(tareas, ahora)})
    if not runs:
        return []
    estados = {str(run): _estado_del_run(run, raiz) for run in runs}
    pares = varadas(tareas, estados, ahora)
    if not pares:
        return []
    nuevas, devueltas = devolver_varadas(tareas, pares, time.strftime("%Y%m%d"))
    if not devueltas:
        return []
    if isinstance(prog, dict) and "tareas" in prog:
        prog["tareas"] = nuevas
    else:
        prog = nuevas
    _escribir(ruta_prog, prog)
    try:
        RN.anotar_reaperturas(devueltas, ahora)
    except OSError:
        print("director-nube: no pude anotar las reaperturas: %s" % ", ".join(devueltas), flush=True)
    texto = ("Nube · %d tarea(s) «reasignada · nube» llevaban más de 6 h con su run ya terminado: "
             "devueltas a la cola sin gastarles un envío (%s)"
             % (len(devueltas), ", ".join(devueltas[:10])))
    _avisar(texto)
    return [texto]


def actuar(resumen, raiz, ahora=None):
    """Cancela, devuelve y avisa UNA vez por run. Nunca lanza. → lista de textos de lo hecho."""
    import repartir_nube as RN

    ahora = time.time() if ahora is None else ahora
    memoria = _leer(MEMORIA, {})
    memoria = {k: v for k, v in memoria.items() if isinstance(v, dict) and ahora - float(v.get("t") or 0) < 2 * 86400}
    hecho = []
    for fila in (resumen or {}).get("runs") or []:
        a = fila.get("atasco") if isinstance(fila, dict) else None
        run = str(fila.get("run")) if isinstance(fila, dict) else ""
        if not a or not run or run in memoria:
            continue
        # Un aviso no impide una acción después (otra clave): solo evita repetir el mismo aviso.
        if not a.get("cancelar") and "aviso:%s:%s" % (run, a.get("tipo")) in memoria:
            continue
        if a.get("confirmar"):
            visto = memoria.get("confirmar:" + run)
            if not visto or visto.get("tipo") != a.get("tipo"):
                memoria["confirmar:" + run] = {"t": ahora, "tipo": a.get("tipo")}
                continue
            if ahora - float(visto.get("t") or 0) < CONFIRMAR_S:
                continue
        texto = "Nube · run %s: %s." % (run, a.get("motivo"))
        if a.get("cancelar"):
            p = subprocess.run(["gh", "run", "cancel", run], cwd=raiz, capture_output=True, text=True, timeout=60)
            if p.returncode != 0:
                print("director-nube: no pude cancelar el run %s: %s" % (run, (p.stderr or "")[-200:]), flush=True)
                continue
            texto += " Lo cancelé"
            vivos_misma_cola = [f for f in resumen.get("runs") or [] if f is not fila and f.get("cola") == fila.get("cola")
                                and not f.get("atasco")]
            if a.get("devolver") and fila.get("cola") and not vivos_misma_cola:
                ruta_prog = os.path.join(raiz, "starseed_memory_root", "olas", "progreso.json")
                prog = _leer(ruta_prog, {})
                tareas = prog.get("tareas") if isinstance(prog, dict) and "tareas" in prog else prog
                ids = ids_de_cola(_leer(os.path.join(raiz, str(fila["cola"])), []))
                nuevas, devueltas = devolver(tareas, ids, run, "se atascó (%s)" % a.get("tipo"), time.strftime("%Y%m%d"))
                if devueltas:
                    if isinstance(prog, dict) and "tareas" in prog:
                        prog["tareas"] = nuevas
                    else:
                        prog = nuevas
                    _escribir(ruta_prog, prog)
                    RN.anotar_reaperturas(devueltas, ahora)
                    texto += " y devolví sus %d tarea(s) a la cola sin gastarles un envío (%s)" % (
                        len(devueltas), ", ".join(devueltas[:8]))
            texto += "."
        else:
            texto += " Solo aviso: puede estar trabajando y no lo corto."
        _avisar(texto)
        clave = run if a.get("cancelar") else "aviso:%s:%s" % (run, a.get("tipo"))
        memoria[clave] = {"t": ahora, "tipo": a.get("tipo")}
        hecho.append(texto)
    hecho.extend(_varadas_a_pendiente(raiz, ahora))
    try:
        os.makedirs(os.path.dirname(MEMORIA), exist_ok=True)
        _escribir(MEMORIA, memoria)
    except OSError:
        pass
    return hecho
