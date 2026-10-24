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

(OPS1024E, 2026-10-24, MEDIDO EN LA MAC) Decenas de tareas seguían «reasignada · nube» con la nota
«movida a nube-gh (run N) desde Genesis» días después de que su run terminara (VZF1015Q, VZR1011B y
DGM1018I desde el 21-10, runs 39588171249 y 39576180546): `reclamar_varadas_de_la_nube` no devuelve
NADA mientras algún run vivo no diga su cola, y casi siempre hay alguno. `devolver_varadas` mira el
run de CADA tarea por su número: si la API dice que ese RUN ya terminó (nunca por sus pasos), o la
nota no lleva run y no cambia desde hace 24 h, vuelve a pendiente sin gastar envío. Run vivo o API
sin dato: no se toca.
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
#: (OPS1024E) Estados del RUN (dato de la API, no de sus pasos) en que aún lleva sus tareas.
RUN_EN_MARCHA = ("in_progress",) + ESPERAN
#: Una reasignación sin número de run que no cambia en tanto tiempo ya no la lleva nadie: un job
#: de GitHub muere a las 6 h (`timeout-minutes: 355`).
SIN_RUN_MAX_S = 24 * 3600
#: Como mucho tantos runs distintos se preguntan a GitHub en una pasada (cada 240 s).
MAX_RUNS_CONSULTA = 12
_RUN_EN_NOTA = re.compile(r"\(run (\d+)\)")
_FECHA_EN_NOTA = re.compile(r"reasignada a la nube (\d{8})\b")


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


def devolver(progreso, ids, run, motivo, fecha, nota=None):
    """PURA. Copia del progreso con las que siguen «reasignada · nube» de vuelta a pendiente. → (nuevo, ids).
    `nota` (OPS1024E) sustituye a la de siempre, que dice que el director canceló el run."""
    salida, hechas = dict(progreso or {}), []
    for tid in ids:
        v = salida.get(tid)
        de_la_nube = (v.get("medio") or "") == "nube" or "(run %s)" % run in str(v.get("nota") or "") \
            if isinstance(v, dict) else False
        if isinstance(v, dict) and v.get("estado") == "reasignada" and de_la_nube:
            v = dict(v)
            v.update(estado="pendiente", medio=None,
                     nota=nota or "devuelta de la nube %s: el run %s %s y el director lo canceló; no cuenta como envío"
                     % (fecha, run, motivo))
            salida[tid] = v
            hechas.append(tid)
    return salida, hechas


def run_de_la_nota(nota):
    """PURA. El run de nube-gh al que apunta una reasignación («movida a nube-gh (run N) desde
    Genesis»), como texto, o None si la nota no lo dice («reasignada a la nube AAAAMMDD»)."""
    m = _RUN_EN_NOTA.search(str(nota or ""))
    return m.group(1) if m else None


def es_reasignada_a_la_nube(v) -> bool:
    """PURA. ¿Está «reasignada» a la nube de GitHub? Medio «nube», o sin medio con la nota de la tanda
    y su run («movida a nube-gh (run N)…»): lo mismo que `devolver` sabe devolver. Las del A1
    («oracle») o del carril Opus («claude-nube») tienen sus propios directores."""
    if not isinstance(v, dict) or v.get("estado") != "reasignada":
        return False
    medio = v.get("medio") or ""
    nota = str(v.get("nota") or "")
    return medio == "nube" or (not medio and nota.startswith("movida a nube") and run_de_la_nota(nota) is not None)


def ultimo_cambio(v):
    """PURA. Epoch (hora local) del último cambio conocido de una entrada del progreso, o None.

    El MAYOR entre `t` y el final del día de la nota («reasignada a la nube AAAAMMDD»): `marcar` no
    reescribe `t`, así que `t` puede ser de antes de la reasignación; con el mayor, una reasignación
    reciente nunca parece vieja."""
    if not isinstance(v, dict):
        return None
    candidatos = []
    try:
        candidatos.append(time.mktime(time.strptime(str(v.get("t") or ""), "%Y-%m-%d %H:%M:%S")))
    except (ValueError, OverflowError):
        pass
    m = _FECHA_EN_NOTA.search(str(v.get("nota") or ""))
    if m:
        try:
            candidatos.append(time.mktime(time.strptime(m.group(1), "%Y%m%d")) + 86400)
        except (ValueError, OverflowError):
            pass
    return max(candidatos) if candidatos else None


def run_vivo(estado_api):
    """PURA. Del `status` de un RUN según la API: True si sigue en marcha, False si terminó
    («completed», con la conclusión que sea), None sin dato o con un estado que no conocemos."""
    e = str(estado_api or "").strip().lower()
    if e == "completed":
        return False
    return True if e in RUN_EN_MARCHA else None


def runs_a_consultar(progreso, vivos, maximo=MAX_RUNS_CONSULTA):
    """PURA. Los runs de las notas de las «reasignada · nube» que el resumen NO da en marcha y hay
    que preguntar a GitHub: los más nuevos primero (número mayor), como mucho `maximo`."""
    runs = {run_de_la_nota(v.get("nota")) for v in (progreso or {}).values() if es_reasignada_a_la_nube(v)}
    runs = sorted((r for r in runs if r and r not in vivos), key=int, reverse=True)
    return runs[:maximo]


def varadas_tras_su_run(progreso, estados, vivos, ahora, ids_vivos=()):
    """PURA. Las «reasignada · nube» que ya no lleva ningún run → [(tid, run o None, motivo)].

    `estados`: {run: status de la API o None}; `vivos`: runs en marcha según el resumen;
    `ids_vivos`: ids de las colas de esos runs (no se tocan nunca). Con run en la nota: vuelve solo
    si la API dice que ese RUN terminó; en marcha o sin dato, se queda. Sin run: vuelve si su último
    cambio tiene más de `SIN_RUN_MAX_S`; sin fecha legible, se queda."""
    salida = []
    for tid, v in sorted((progreso or {}).items()):
        if not es_reasignada_a_la_nube(v) or tid in ids_vivos:
            continue
        run = run_de_la_nota(v.get("nota"))
        if run:
            if run not in vivos and run_vivo((estados or {}).get(run)) is False:
                salida.append((tid, run, "su run %s ya terminó según GitHub" % run))
            continue
        cambio = ultimo_cambio(v)
        if cambio is not None and ahora - cambio > SIN_RUN_MAX_S:
            salida.append((tid, None, "no dice su run y no cambia desde hace %d h" % ((ahora - cambio) // 3600)))
    return salida


def texto_varadas(devueltas):
    """PURA. La línea del Chat Director: cuántas volvieron y cuáles (las 8 primeras)."""
    ids = [d[0] for d in devueltas]
    return ("Nube · devolví %d tarea(s) «reasignada» que ya no llevaba ningún run (su run terminó según "
            "GitHub, o sin run y más de 24 h sin cambios) a la cola sin gastarles un envío: %s%s."
            % (len(ids), ", ".join(ids[:8]), "…" if len(ids) > 8 else ""))


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


def estado_del_run(run, raiz, timeout=30):
    """El `status` del RUN según la API de GitHub («completed», «in_progress»…), o None sin dato.
    Nunca lanza. Es el dato del run, el mismo que da `gh run list`; jamás el de sus pasos."""
    try:
        p = subprocess.run(["gh", "api", "/repos/{owner}/{repo}/actions/runs/%s" % run, "--jq", ".status"],
                           cwd=raiz, capture_output=True, text=True, timeout=timeout)
    except Exception:
        return None
    if p.returncode != 0:
        return None
    return (p.stdout or "").strip() or None


def devolver_varadas(resumen, raiz, ahora=None, estado_run=None):
    """Devuelve a pendiente, sin gastarles un envío, las «reasignada · nube» cuyo run ya terminó (o
    sin run y 24 h quietas). Una línea en el Chat Director. → el texto, o None. Nunca lanza.
    `estado_run(run)` se inyecta en las pruebas; por defecto pregunta a GitHub."""
    import repartir_nube as RN

    ahora = time.time() if ahora is None else ahora
    estado_run = estado_run or (lambda r: estado_del_run(r, raiz))
    ruta_prog = os.path.join(raiz, "starseed_memory_root", "olas", "progreso.json")
    prog = _leer(ruta_prog, {})
    tareas = prog.get("tareas") if isinstance(prog, dict) and "tareas" in prog else prog
    if not isinstance(tareas, dict) or not tareas:
        return None
    runs_resumen = [f for f in (resumen or {}).get("runs") or [] if isinstance(f, dict)]
    vivos = {str(f.get("run")) for f in runs_resumen if f.get("run") is not None}
    ids_vivos = set()
    for f in runs_resumen:
        cola = str(f.get("cola") or "")
        if cola and ".." not in cola and not os.path.isabs(cola):
            ids_vivos |= set(ids_de_cola(_leer(os.path.join(raiz, cola), [])))
    estados = {r: estado_run(r) for r in runs_a_consultar(tareas, vivos)}
    elegidas = varadas_tras_su_run(tareas, estados, vivos, ahora, ids_vivos)
    if not elegidas:
        return None
    fecha, hechas = time.strftime("%Y%m%d", time.localtime(ahora)), []
    for tid, run, motivo in elegidas:
        nota = "devuelta de la nube %s: %s y nadie la devolvía; no cuenta como envío" % (fecha, motivo)
        tareas, una = devolver(tareas, [tid], run or "", motivo, fecha, nota=nota)
        hechas.extend(una)
    if not hechas:
        return None
    if isinstance(prog, dict) and "tareas" in prog:
        prog["tareas"] = tareas
    else:
        prog = tareas
    _escribir(ruta_prog, prog)
    RN.anotar_reaperturas(hechas, ahora)
    texto = texto_varadas([d for d in elegidas if d[0] in set(hechas)])
    _avisar(texto)
    return texto


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
    # (OPS1024E) Las que se quedaron «reasignada» con su run ya terminado: nadie más las devolvía.
    try:
        texto = devolver_varadas(resumen, raiz, ahora)
        if texto:
            hecho.append(texto)
    except Exception as e:  # noqa: BLE001 — el vigía nunca tumba la pasada del director
        print("director-nube: no pude devolver las varadas: %s: %s" % (type(e).__name__, e), flush=True)
    try:
        os.makedirs(os.path.dirname(MEMORIA), exist_ok=True)
        _escribir(MEMORIA, memoria)
    except OSError:
        pass
    return hecho
