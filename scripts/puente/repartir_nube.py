#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Lógica pura del reparto a la nube: elegir el atraso y marcarlo.

El atraso candidato es una tarea que (1) no está en main, (2) no está cerrada
ni viva en el progreso y (3) no pertenece a la ola que corre ahora mismo; la
ola actual se queda en la Mac. Está mal invertir en reintentar en local lo que
el estado ya declaró agotado (`fallo*`) o innecesario (`sin_cambios`) y lo que
nunca se tocó: eso es justo lo que la nube puede hacer gratis con LLM7.
"""

import re

from vigilante_logica import id_en_asuntos

MODELO_NUBE = "llm7/minimax-m2.7"
#: (2026-09-22) «pendiente» FALTABA, y era el último candado de la nube. Con solo estados
#: de fallo aquí, a los contenedores solo podía ir lo que YA se había roto en la Mac:
#: trabajo nuevo, jamás. Medido esta noche, con doce huecos libres: la Mac cogió W1,
#: LCOMPA y AG1, se quedó 35 minutos en «esperando proveedor» sin escribir una línea, y
#: la nube no pudo cogerlas —primero por estar «en_curso», y al soltarlas, por estar
#: «pendiente»—. Alex lo preguntó tres veces: «¿y los de los demás contenedores?».
#: Una tarea pendiente es exactamente lo que un contenedor libre debería poder coger.
ESTADOS_REPARTIBLES = {None, "", "pendiente", "sin_cambios", "fallo", "fallo_tests", "fallo_tsc"}

# (2026-09-21) En la nube NO HAY NADIE que apruebe: solo sobrevive lo que pasa las
# cuatro puertas solo. Lo que falla ahi no falla por poco: falla TARDE, despues de
# 40-60 min de agente. Anoche cayeron NE1c (3 archivos), R6b (6) y R7b (9) y las tres
# por lo mismo: el agente no llego a tocarlos todos. Cuantos mas archivos pide una
# tarea, mas probable es que se quede a medias, y a medias en la nube es a la basura.
# Las grandes se quedan en la Mac, donde hay revisor. Y entre las que caben, primero
# las de un solo archivo.
MAX_ARCHIVOS_NUBE = 3

#: (2026-09-24, MEDIDO) Alex: «cuando terminan los agentes vuelven a entrar 4 más pero no
#: dice que haya más listas para trabajar, no sé de qué olas son». Eran SIEMPRE las mismas
#: tres —CU3br (ola 362, rescate de accesos) y p318Jb/p318Jc (Ola 318, reintentos)—,
#: mandadas a la nube 22 veces seguidas entre las 04:03 y las 14:07, cuatro agentes cada
#: vez. En la nube CU3br salía «rechazada» (no tocó los archivos declarados) y las otras
#: dos «bloqueadas» (p318I «(?)»: está en main desde el 13, pero la nube no lo sabe); el
#: veredicto no volvía a la Mac, el run acababa, `reclamar_varadas` las devolvía a
#: «pendiente» y el director las volvía a mandar. Tres envíos sin integrar bastan para
#: saber que repetir no sirve: a partir de ahí van a «Bloqueadas», donde se ven y se
#: pueden reintentar con un cambio.
MAX_ENVIOS_NUBE = 3


def leer_colas_nube(carpeta, ahora_ts, dias=2):
    """[(nombre, ids)] de las `cola-nube-AAAAMMDD-HHMM*.json` de los últimos `dias` días.
    La única función con disco de este módulo: el resto sigue siendo puro. Nunca lanza."""
    import datetime as _dt
    import json as _json
    import os as _os

    limite = _dt.datetime.fromtimestamp(ahora_ts) - _dt.timedelta(days=dias)
    salida = []
    try:
        nombres = sorted(_os.listdir(carpeta))
    except OSError:
        return salida
    for nombre in nombres:
        m = re.match(r"cola-nube-(\d{8})-(\d{4})", nombre)
        if not m or not nombre.endswith(".json"):
            continue
        try:
            cuando = _dt.datetime.strptime(m.group(1) + m.group(2), "%Y%m%d%H%M")
        except ValueError:
            continue
        if cuando < limite:
            continue
        try:
            with open(_os.path.join(carpeta, nombre), encoding="utf-8") as f:
                d = _json.load(f)
        except (OSError, ValueError):
            continue
        tareas = d.get("tareas", []) if isinstance(d, dict) else d
        salida.append((nombre, [t.get("id") for t in tareas if isinstance(t, dict) and t.get("id")]))
    return salida


def envios_por_tarea(colas_nube):
    """PURA: cuántas veces se mandó cada tarea a la nube. `colas_nube`: [(nombre, ids)] de
    las colas `cola-nube-*` recientes (quien llama decide cuáles cuentan)."""
    cuenta = {}
    for _nombre, ids in colas_nube or []:
        for tid in set(str(i) for i in ids or []):
            cuenta[tid] = cuenta.get(tid, 0) + 1
    return cuenta


def _n_archivos(tarea):
    return len(tarea.get("archivos") or [])


#: Estados en los que una dependencia ya esta hecha y no frena a nadie.
_HECHAS = ("commit", "hecho")


def dependencias_pendientes(tarea, progreso=None, asuntos_main=""):
    """Las dependencias de esta tarea que AUN NO estan integradas. PURA.

    (2026-09-21) Nacio como «¿tiene dependencias?» y descartaba todas: la nube hacia
    checkout de `origin/main` y ahi se quedaba, sin ver lo que la Mac tenia sin publicar.
    Medido en el run 35568545557: de seis tareas, CUATRO se bloquearon por dependencias
    que en la nube no existian. Treinta y seis minutos de runner para un commit.

    (2026-09-22) Esa razon YA NO VALE, y por eso esto cambia. Desde que el lanzamiento
    empuja la cola y el codigo a su propia rama y dispara el workflow con esa referencia,
    el runner ve EXACTAMENTE lo mismo que la Mac, publicado o no. Mantener el descarte
    costaba la nube entera: con doce huecos libres, casi todo el atraso tiene alguna
    dependencia y a la nube no iba nunca nada. Ahora solo se descarta lo que espera a algo
    que de verdad no esta hecho.
    """
    progreso = progreso or {}
    fuera = []
    for dep in tarea.get("depende") or tarea.get("depende_de") or []:
        tid = str(dep or "").strip()
        if not tid:
            continue
        entrada = progreso.get(tid)
        estado = entrada.get("estado") if isinstance(entrada, dict) else None
        if estado in _HECHAS:
            continue
        if asuntos_main and id_en_asuntos(tid, asuntos_main):
            continue
        fuera.append(tid)
    return fuera


def _tiene_dependencias(tarea):
    """Compatibilidad: ¿declara alguna dependencia, esté hecha o no?"""
    deps = tarea.get("depende") or tarea.get("depende_de") or []
    if isinstance(deps, str):
        deps = [deps]
    return bool(deps)


def numero_ola(texto):
    """Número de ola: `Ola 317` o guarismo suelto; None si no hay."""
    m = re.search(r"Ola (\d+)", texto, re.IGNORECASE) or re.search(r"(\d+)", texto)
    return int(m.group(1)) if m else None


def elegir(colas, progreso, asuntos_main, ola_actual, tope=20, max_archivos=MAX_ARCHIVOS_NUBE,
           envios=None, max_envios=MAX_ENVIOS_NUBE):
    """Hasta `tope` candidatas, deduplicadas, con modelo nube y ordenadas por tamano.

    Se descartan las de mas de `max_archivos` archivos declarados —esas necesitan un
    revisor y la nube no lo tiene— y las que DEPENDEN de otra tarea, porque la nube
    solo ve `origin/main` y no puede saber si la dependencia esta hecha en la Mac.
    Entre las que quedan van primero las de un solo archivo, que son las que de
    verdad llegan a commit. Si no queda ninguna, la nube no recibe nada ese ciclo
    — que es lo correcto, no un fallo.
    """
    salida, vistas = [], set()
    n_actual = numero_ola(str(ola_actual)) if ola_actual else None
    for nombre, tareas in colas:
        for tarea in tareas:
            if not isinstance(tarea, dict) or not tarea.get("id"):
                continue
            tid = str(tarea["id"])
            if tid in vistas:
                continue
            ola = str(tarea.get("ola") or "")
            n_ola = numero_ola(ola)
            if n_actual is not None and n_ola is not None and n_ola == n_actual:
                continue
            entrada = progreso.get(tid)
            estado = entrada.get("estado") if isinstance(entrada, dict) else None
            if estado not in ESTADOS_REPARTIBLES:
                continue
            if id_en_asuntos(tid, asuntos_main):
                continue
            if _n_archivos(tarea) > max_archivos:
                continue
            if dependencias_pendientes(tarea, progreso, asuntos_main):
                continue
            if (envios or {}).get(tid, 0) >= max_envios:
                continue
            vistas.add(tid)
            candidata = dict(tarea)
            candidata["modelo"] = MODELO_NUBE
            # (2026-09-24) Aquí TODAS sus dependencias están ya en main (si no, no se
            # elegiría), pero la nube arranca sin el progreso de la Mac: p318I está
            # integrada desde el 13 y allí salía «(?)», y la tarea se bloqueaba en cada run.
            # Lo que la Mac ya comprobó no se le pide comprobar otra vez.
            deps = candidata.get("depende") or candidata.get("depende_de") or []
            if deps:
                candidata["depende"] = []
                candidata.pop("depende_de", None)
                candidata["dependencias_ya_en_main"] = list(deps) if isinstance(deps, list) else [deps]
            salida.append(candidata)
    # Estable: a igual numero de archivos manda el orden de las colas (la prioridad
    # que ya calcularon los directores). Solo se reordena por tamano.
    salida.sort(key=_n_archivos)
    return salida[:tope]


def reclamar_varadas(progreso, runs_en_marcha):
    """PURA. Las que se mandaron a la nube y allí ya no queda nadie que las haga.

    (2026-09-22, MEDIDO) RM3 y RM4 llevaban horas en «reasignada · nube» con CERO runs en
    marcha. Detrás de ellas, RM5 esperaba a RM3 y RM4; RM6 a RM5; RM7 a RM5 y RM6; RM8 a
    RM7. El Puente enseñaba «LISTAS PARA TRABAJAR 5» y ningún agente podía coger ninguna:
    la cadena entera colgaba de dos tareas que ya no iba a hacer nadie. El vigía lo veía
    («cadena_rota») y solo sabía avisar —y ni eso: «no pude avisar»—.

    Reasignar a la nube es un préstamo, no un traspaso: si en la nube no queda ningún run
    en marcha, lo prestado vuelve a `pendiente` y la Mac puede cogerlo. Mientras haya UN
    run vivo no se toca nada: podría ser el que las está haciendo.
    """
    if runs_en_marcha != 0:
        return []
    return sorted(
        tid for tid, v in (progreso or {}).items()
        if isinstance(v, dict)
        and v.get("estado") == "reasignada"
        and (v.get("medio") or "") == "nube"
    )


def devolver_a_pendiente(progreso, ids, fecha, envios=None, veredictos=None,
                         max_envios=MAX_ENVIOS_NUBE):
    """Copia del progreso con esos ids de vuelta a `pendiente`, sin perder su historia.

    (2026-09-24) Con lo que dijo la nube (`veredictos`: {id: (estado, nota)} del último run)
    y, si ya se mandó `max_envios` veces sin integrarse, a `bloqueada` en vez de a
    `pendiente`: devolverla otra vez era mandarla otra vez, y así 22 veces seguidas."""
    salida = dict(progreso or {})
    for tid in ids:
        v = dict(salida.get(tid) or {})
        n = int((envios or {}).get(tid, 0))
        dicho = (veredictos or {}).get(tid)
        motivo = ""
        if dicho:
            motivo = " · la nube dijo «%s»%s" % (dicho[0], (": %s" % dicho[1][:200]) if dicho[1] else "")
        if n >= max_envios:
            v.update(
                estado="bloqueada", medio=None,
                nota=("la nube la intentó %d veces sin integrarla%s. Repetirla igual no sirve: "
                      "«Reintentar con un cambio» en Bloqueadas" % (n, motivo)),
            )
        else:
            v.update(
                estado="pendiente", medio=None,
                nota="devuelta de la nube %s: no quedaba ningún run en marcha (envío %d de %d)%s"
                % (fecha, n, max_envios, motivo),
            )
        salida[tid] = v
    return salida


def marcar(progreso, ids, fecha):
    """Copia del progreso con esos ids como `reasignada · nube`."""
    p = {k: dict(v) if isinstance(v, dict) else v for k, v in progreso.items()}
    for tid in ids:
        entrada = p.get(tid)
        p[tid] = dict(entrada) if isinstance(entrada, dict) else {}
        p[tid].update(
            estado="reasignada", medio="nube", nota="reasignada a la nube %s" % fecha
        )
    return p
