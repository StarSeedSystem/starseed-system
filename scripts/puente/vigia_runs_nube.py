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
#: (AUT1116A) Una `cola-nube-*.json` sin run en la nota de sus tareas: pasado este tiempo desde que se escribió, si
#: ningún run vivo la lleva, sus tareas vuelven. Es la ventana de «en vuelo» del reparto (`repartir_nube.EN_VUELO_S`):
#: el job más largo (60 min) más margen para que el run aparezca en GitHub.
COLA_NUBE_VIDA_S = 75 * 60
#: «commit»/«integrada» dicho por la nube sobre una tarea que está «pendiente» en la Mac: pasado este tiempo sin que
#: nadie la trabaje, se da por integrada en su rama y `traer_nube` la trae (en vez de esperar sin fin).
ESPERA_COMMIT_OLVIDADO_S = 60 * 60
_DIJO_COMMIT = re.compile(r"la nube dijo «(commit|integrada)»")
VEREDICTOS_CACHE = os.path.expanduser("~/.starseed/nube-veredictos")
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
    reciente nunca parece vieja.

    (AUT1116A) Con `t_reasignada` (la hora exacta que ahora escribe `marcar`) se usa esa, no el final del día:
    contar «24 h» desde las 24:00 de la nota dejaba una reasignación de las 14:50 hasta 33 h sin volver."""
    if not isinstance(v, dict):
        return None
    try:
        exacta = float(v.get("t_reasignada") or 0)
    except (TypeError, ValueError):
        exacta = 0
    candidatos = [exacta] if exacta > 0 else []
    if exacta > 0:
        try:
            candidatos.append(time.mktime(time.strptime(str(v.get("t") or ""), "%Y-%m-%d %H:%M:%S")))
        except (ValueError, OverflowError):
            pass
        return max(candidatos)
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
    («completed», con la conclusión que sea), None sin dato o con un estado que no conocemos.
    Acepta tanto string (status) como tupla (status, conclusion) para compatibilidad."""
    if isinstance(estado_api, tuple):
        status = str(estado_api[0] or "").strip().lower()
    else:
        status = str(estado_api or "").strip().lower()
    if status == "completed":
        return False
    return True if status in RUN_EN_MARCHA else None


def runs_a_consultar(progreso, vivos, maximo=MAX_RUNS_CONSULTA):
    """PURA. Los runs de las notas de las «reasignada · nube» que el resumen NO da en marcha y hay
    que preguntar a GitHub: los más nuevos primero (número mayor), como mucho `maximo`."""
    runs = {run_de_la_nota(v.get("nota")) for v in (progreso or {}).values() if es_reasignada_a_la_nube(v)}
    runs = sorted((r for r in runs if r and r not in vivos), key=int, reverse=True)
    return runs[:maximo]


def varadas_tras_su_run(progreso, estados, vivos, ahora, ids_vivos=(), colas_nube=None, colas_completas=False):
    """PURA. Las «reasignada · nube» que ya no lleva ningún run → [(tid, run o None, motivo)].

    `estados`: {run: (status, conclusion) de la API o None}; `vivos`: runs en marcha según el resumen;
    `ids_vivos`: ids de las colas de esos runs (no se tocan nunca). Con run en la nota: vuelve solo
    si la API dice que ese RUN terminó; en marcha o sin dato, se queda. Sin run: vuelve si su último
    cambio tiene más de `SIN_RUN_MAX_S`; sin fecha legible, se queda.

    (AUT1116A) `colas_nube`: {id: epoch de la `cola-nube-*.json` más nueva que la lleva}. Sin run en la nota (lo
    normal: «reasignada a la nube AAAAMMDD», del reparto), si `colas_completas` (todos los runs vivos dicen su cola,
    así que `ids_vivos` es entero) y esa cola se escribió hace más de `COLA_NUBE_VIDA_S` sin que ningún run vivo la
    lleve, vuelve: a los ~75 min, no a las 24 h. VOZ01, FRN01 y DSB01 llevaban 5 h con diez runs terminados.

    (AUT1121C) Incluye la conclusión del run (success/failure/cancelled) en el motivo para diagnóstico."""
    salida = []
    for tid, v in sorted((progreso or {}).items()):
        if not es_reasignada_a_la_nube(v) or tid in ids_vivos:
            continue
        run = run_de_la_nota(v.get("nota"))
        if run:
            if run not in vivos and run_vivo((estados or {}).get(run)) is False:
                # Incluir conclusión si está disponible
                estado_info = (estados or {}).get(run)
                conclusion = ""
                if isinstance(estado_info, tuple) and len(estado_info) >= 2 and estado_info[1]:
                    conclusion = " (conclusión: %s)" % estado_info[1]
                salida.append((tid, run, "su run %s ya terminó según GitHub%s" % (run, conclusion)))
            continue
        cola_t = (colas_nube or {}).get(tid)
        if colas_completas and cola_t is not None and ahora - cola_t > COLA_NUBE_VIDA_S:
            salida.append((tid, None, "su cola viajó a la nube hace %d min y ningún run vivo la lleva"
                           % ((ahora - cola_t) // 60)))
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


def _ps_args():
    return subprocess.run(["ps", "-axo", "args="], capture_output=True, text=True, timeout=20).stdout


def _avisar(texto):
    try:
        import director_chat

        director_chat.publicar(texto, de="director-nube", rol="director", tipo="aviso")
    except Exception:
        print("director-nube: no pude avisar en el Chat Director", flush=True)


def colas_de_la_nube(carpeta):
    """{id: epoch de la `cola-nube-*.json` más nueva que lo lleva} de `enjambre/colas/`. Nunca lanza."""
    salida = {}
    try:
        nombres = sorted(os.listdir(carpeta))
    except OSError:
        return salida
    for nombre in nombres:
        if not (nombre.startswith("cola-nube-") and nombre.endswith(".json")):
            continue
        ruta = os.path.join(carpeta, nombre)
        try:
            t = os.path.getmtime(ruta)
        except OSError:
            continue
        for tid in ids_de_cola(_leer(ruta, [])):
            salida[tid] = max(t, salida.get(tid, 0))
    return salida


def veredictos_en_cache(ids, carpeta=None, maximo=16):
    """{id: (estado, nota, run)} de lo que dijeron los últimos runs terminados, leído SOLO de la caché que ya dejó
    `director-nube.py` (`~/.starseed/nube-veredictos/<run>.json`): sin llamar a GitHub. El «commit» de cualquier run gana."""
    import repartir_nube as RN

    carpeta = carpeta or VEREDICTOS_CACHE
    try:
        archivos = sorted((os.path.join(carpeta, n) for n in os.listdir(carpeta) if n.endswith(".json")),
                          key=os.path.getmtime, reverse=True)[:maximo]
    except OSError:
        return {}
    por_run = []
    for ruta in archivos:
        datos = _leer(ruta, {})
        if isinstance(datos, dict):
            por_run.append((os.path.basename(ruta)[:-5],
                            {k: tuple(v) for k, v in datos.items() if isinstance(v, (list, tuple))}))
    return RN.combinar_veredictos(por_run, ids)


def commits_olvidados(progreso, ahora, en_tanda=(), espera_s=ESPERA_COMMIT_OLVIDADO_S):
    """PURA (AUT1116A). Las «pendiente» cuya nota dice que la nube las dio por hechas («la nube dijo «commit»») y que
    ninguna tanda de la Mac lleva: su trabajo está en la rama `nube/<run>` y esperar a que alguien las repita no
    lo trae a main. LAT01 llevaba así desde las 00:21 del 16-11. Pasada `espera_s` desde su último cambio (`t`; sin
    `t`, ya) se dan por «integrada · nube»: `traer_nube` las trae por las mismas puertas y, si en 24 h no llegan, van a
    Bloqueadas con el motivo (`repartir_nube.devolver_a_pendiente`)."""
    en_tanda = {str(i) for i in en_tanda or ()}
    salida = []
    for tid, v in sorted((progreso or {}).items()):
        if not isinstance(v, dict) or v.get("estado") != "pendiente" or tid in en_tanda:
            continue
        if not _DIJO_COMMIT.search(str(v.get("nota") or "").lower()):
            continue
        try:
            cambio = time.mktime(time.strptime(str(v.get("t") or ""), "%Y-%m-%d %H:%M:%S"))
        except (ValueError, OverflowError):
            cambio = None
        if cambio is None or ahora - cambio > espera_s:
            salida.append(tid)
    return salida


def estado_del_run(run, raiz, timeout=30):
    """El `status` y `conclusion` del RUN según la API de GitHub.
    Devuelve (status, conclusion) o (None, None) sin dato. Nunca lanza.
    Es el dato del run, el mismo que da `gh run list`; jamás el de sus pasos.
    conclusion: 'success', 'failure', 'cancelled', 'skipped', 'timed_out', 'action_required' o None.
    """
    try:
        p = subprocess.run(
            ["gh", "api", "/repos/{owner}/{repo}/actions/runs/%s" % run, "--jq", "[.status, .conclusion]"],
            cwd=raiz, capture_output=True, text=True, timeout=timeout)
    except Exception:
        return (None, None)
    if p.returncode != 0:
        return (None, None)
    try:
        datos = json.loads(p.stdout or "[]")
        if isinstance(datos, list) and len(datos) >= 2:
            status = str(datos[0] or "").strip() or None
            conclusion = str(datos[1] or "").strip() or None
            return (status, conclusion)
    except (json.JSONDecodeError, ValueError):
        pass
    return (None, None)


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
    # (AUT1116A) Los ids de los runs vivos solo valen si CADA run vivo dijo su cola.
    # Sin resumen medido, «ningún run vivo» no es un dato: no se aplica la regla de la cola.
    colas_completas = (isinstance(resumen, dict) and isinstance(resumen.get("runs"), list)
                       and all(str(f.get("cola") or "") for f in runs_resumen))
    elegidas = varadas_tras_su_run(tareas, estados, vivos, ahora, ids_vivos,
                                   colas_nube=colas_de_la_nube(os.path.join(raiz, "enjambre", "colas")),
                                   colas_completas=colas_completas)
    fecha, hechas, integradas = time.strftime("%Y%m%d", time.localtime(ahora)), [], []
    veredictos = veredictos_en_cache([d[0] for d in elegidas]) if elegidas else {}
    for tid, run, motivo in elegidas:
        dicho = veredictos.get(tid)
        if dicho and dicho[0] in RN.VEREDICTOS_INTEGRADA:
            # (AUT1116A) La nube la dio por hecha: no vuelve a la cola de la Mac, queda «integrada · nube».
            tareas = RN.devolver_a_pendiente(tareas, [tid], fecha, veredictos={tid: dicho}, ahora=ahora)
            integradas.append(tid)
            continue
        nota = "devuelta de la nube %s: %s y nadie la devolvía; no cuenta como envío" % (fecha, motivo)
        tareas, una = devolver(tareas, [tid], run or "", motivo, fecha, nota=nota)
        for u in una:
            tareas[u]["t"] = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ahora))
        hechas.extend(una)
    # (AUT1116A) Y las que YA volvieron como «pendiente» con el «commit» de la nube en la nota.
    try:
        en_tanda = {i for _n, ids in RN.colas_de_la_tanda_viva(_ps_args(), os.path.join(raiz, "starseed_memory_root", "olas"))
                    for i in ids}
    except Exception:  # noqa: BLE001 — sin saber qué lleva la Mac, no se toca ninguna
        en_tanda = None
    olvidadas = commits_olvidados(tareas, ahora, en_tanda) if en_tanda is not None else []
    if olvidadas:
        tareas = RN.devolver_a_pendiente(tareas, olvidadas, fecha,
                                         veredictos={t: ("commit", "", "") for t in olvidadas}, ahora=ahora)
        integradas.extend(olvidadas)
    if not hechas and not integradas:
        return None
    if isinstance(prog, dict) and "tareas" in prog:
        prog["tareas"] = tareas
    else:
        prog = tareas
    _escribir(ruta_prog, prog)
    partes = []
    if hechas:
        RN.anotar_reaperturas(hechas, ahora)
        partes.append(texto_varadas([d for d in elegidas if d[0] in set(hechas)]))
    if integradas:
        partes.append("Nube · %d tarea(s) que la nube dio por hechas («commit») quedan «integrada · nube» para que "
                      "traer_nube las traiga a main en vez de esperar: %s%s." % (
                          len(integradas), ", ".join(integradas[:8]), "…" if len(integradas) > 8 else ""))
    texto = " ".join(partes)
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
