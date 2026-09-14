#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Desatasca solo lo que hoy paraba el enjambre y nadie recogía.

Por qué existe (medido el 2026-09-13, tres veces en un día):

  1. El orquestador se negaba a arrancar por «working tree de main con cambios
     sin commit» y el estorbo era un fichero suelto sin seguimiento (`.new`,
     `error.log`). 23 tareas pendientes paradas por eso, y el vigilante
     durmiendo su pausa de 10 minutos.
  2. El orquestador se quedaba VIVO al 0 % de CPU con cero trabajadores porque
     una tarea esperaba visto bueno con revisión bloqueante. El vigilante solo
     relanza cuando está PARADO y el director se retira cuando está VIVO: nadie
     cubría «vivo pero sin avanzar», que es el peor caso porque parece normal.
  3. Un trabajador `opencode run` estuvo 17 h 50 min sin escribir un byte.

Las tres decisiones son puras y se prueban; las acciones van aparte y devuelven
frases para el canal, de modo que el director solo tenga que decirlas.

REGLA QUE NO SE TOCA: aquí NUNCA se aprueba una puerta. Rechazar una revisión
bloqueante es ejecutar un veredicto que ya existe; aprobar sin mirar es
exactamente lo que la puerta impide (Ola 261).
"""

import os
import shutil
import subprocess
import time

SUFIJOS_ESTORBO = (".log", ".new", ".tmp", ".orig", ".rej", ".bak", "~")
NOMBRES_ESTORBO = {".DS_Store"}
ESTADOS_CERRADOS = {"commit", "hecho"}


# ---------------------------------------------------------------- decisiones puras

def clasificar_sucio(lineas):
    """Separa el árbol sucio en («estorbo», «trabajo»).

    Estorbo = sin seguimiento (`??`) Y con pinta de residuo. Todo lo demás es
    trabajo de alguien. Ante la duda, trabajo: apartar lo de otro es peor que
    no arrancar.
    """
    estorbo, trabajo = [], []
    for linea in lineas:
        if not linea or len(linea) < 4:
            continue
        marca, ruta = linea[:2], linea[3:].strip().strip('"')
        if not ruta:
            continue
        base = os.path.basename(ruta)
        if marca == "??" and (ruta.endswith(SUFIJOS_ESTORBO) or base in NOMBRES_ESTORBO):
            estorbo.append(ruta)
        else:
            trabajo.append(ruta)
    return estorbo, trabajo


def puertas_a_rechazar(progreso, ahora, tope_min=20):
    """Puertas cuyo veredicto ya está dado y solo falta ejecutarlo.

    Devuelve [(id, motivo)]. Solo entran las que llevan más de `tope_min` en la
    puerta Y tienen revisión bloqueante o alcance incompleto. Una puerta en
    verde no se toca: esa la decide una persona.
    """
    fuera = []
    for tid, e in sorted((progreso or {}).items()):
        if not isinstance(e, dict) or e.get("estado") != "esperando_aprobacion":
            continue
        if _minutos(e.get("t"), ahora) < tope_min:
            continue
        if e.get("revisor") == "bloqueante":
            fuera.append((tid, "revisión bloqueante confirmada"))
        elif e.get("faltan"):
            faltan = ", ".join(str(x) for x in list(e["faltan"])[:3])
            fuera.append((tid, "alcance incompleto: faltan %s" % faltan))
    return fuera


def orquestador_atascado(vivo, n_agentes, minutos_sin_avance, tope_min=25):
    """Vivo, sin trabajadores y sin avanzar = atascado, aunque parezca normal."""
    if not vivo or n_agentes > 0:
        return False, ""
    if minutos_sin_avance < tope_min:
        return False, ""
    return True, "vivo, 0 trabajadores y %d min sin avanzar" % int(minutos_sin_avance)


def colgados_a_matar(procesos, ahora, tope_s=1800):
    """Pids de trabajadores que llevan `tope_s` sin escribir un byte."""
    fuera = []
    for pr in procesos or []:
        pid = pr.get("pid")
        if not isinstance(pid, int) or pid <= 1 or pr.get("propio"):
            continue
        ultimo = pr.get("ultimo_byte") or pr.get("inicio") or 0
        if ultimo and ahora - ultimo > tope_s:
            fuera.append(pid)
    return sorted(fuera)


def _minutos(t, ahora):
    if isinstance(t, (int, float)):
        return max(0.0, (ahora - t) / 60.0)
    if isinstance(t, str) and t.strip():
        try:
            return max(0.0, (ahora - time.mktime(time.strptime(t.strip(), "%Y-%m-%d %H:%M:%S"))) / 60.0)
        except Exception:
            return 0.0
    return 0.0


# ---------------------------------------------------------------- acciones

def limpiar_arbol(raiz, ahora=None):
    """Aparta (NUNCA borra) los estorbos que impiden arrancar. Devuelve frases."""
    try:
        salida = subprocess.run(
            ["git", "status", "--porcelain"], cwd=raiz,
            capture_output=True, text=True, timeout=30,
        ).stdout.splitlines()
    except Exception as e:
        return ["no pude mirar el árbol: %s" % type(e).__name__]
    estorbo, trabajo = clasificar_sucio(salida)
    frases = []
    if estorbo:
        destino = os.path.join(
            raiz, "starseed_memory_root", "olas", "_apartado",
            time.strftime("%Y%m%d", time.localtime(ahora or time.time())),
        )
        os.makedirs(destino, exist_ok=True)
        movidos = []
        for ruta in estorbo:
            try:
                origen = os.path.join(raiz, ruta)
                if os.path.exists(origen):
                    shutil.move(origen, os.path.join(destino, os.path.basename(ruta)))
                    movidos.append(ruta)
            except Exception:
                pass
        if movidos:
            frases.append("aparto %d estorbo(s) que impedían arrancar: %s (en olas/_apartado/)"
                          % (len(movidos), ", ".join(movidos[:5])))
    if trabajo:
        frases.append("el árbol tiene trabajo sin commitear y NO lo toco: %s"
                      % ", ".join(trabajo[:5]))
    return frases


def minutos_sin_integrar(progreso, ahora, ruta_estado):
    """Minutos desde la última integración, recordando el conteo entre pasadas.

    No hay un «último commit» fiable en progreso.json, así que se cuenta cuántas
    tareas están en `commit` y se recuerda cuándo cambió ese número. Si no
    cambia, el reloj corre: eso es exactamente «no avanza».
    """
    n = sum(1 for v in (progreso or {}).values()
            if isinstance(v, dict) and v.get("estado") in ESTADOS_CERRADOS)
    previo = {}
    try:
        import json
        with open(ruta_estado, encoding="utf-8") as fh:
            previo = json.load(fh)
    except Exception:
        previo = {}
    if previo.get("n") != n or not previo.get("t"):
        _guardar_estado(ruta_estado, {"n": n, "t": ahora})
        return 0.0
    return max(0.0, (ahora - float(previo["t"])) / 60.0)


def _guardar_estado(ruta, datos):
    try:
        import json
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        tmp = ruta + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(datos, fh)
        os.replace(tmp, ruta)
    except Exception:
        pass


def rechazar_puertas(puertas, binario="starseed-puente"):
    """Ejecuta el veredicto que ya estaba dado. NUNCA aprueba."""
    frases = []
    for tid, motivo in puertas:
        try:
            r = subprocess.run([binario, "rechazar", tid],
                               capture_output=True, text=True, timeout=30)
            ok = r.returncode == 0
        except Exception:
            ok = False
        frases.append("rechazo %s solo (%s)" % (tid, motivo) if ok
                      else "no pude rechazar %s (%s)" % (tid, motivo))
    return frases


def trabajadores_opencode(ahora):
    """Lista de {pid, tarea, ultimo_byte} de los `opencode run` vivos."""
    try:
        salida = subprocess.run(["ps", "-eo", "pid,etime,args"],
                                capture_output=True, text=True, timeout=20).stdout
    except Exception:
        return []
    fuera = []
    for linea in salida.splitlines():
        if "opencode run" not in linea or "grep" in linea:
            continue
        partes = linea.split(None, 2)
        if len(partes) < 3 or not partes[0].isdigit():
            continue
        pid = int(partes[0])
        tarea, ultimo = "?", 0.0
        for trozo in partes[2].split():
            if "starseed-wt/" in trozo:
                tarea = trozo.split("starseed-wt/")[-1].strip("`'\"")
                try:
                    ultimo = os.path.getmtime(trozo.strip("`'\""))
                except Exception:
                    ultimo = 0.0
                break
        fuera.append({"pid": pid, "tarea": tarea, "ultimo_byte": ultimo or ahora})
    return fuera


def matar_colgados(procesos, ahora, tope_s=1800):
    frases = []
    for pid in colgados_a_matar(procesos, ahora, tope_s):
        tarea = next((p.get("tarea") for p in procesos if p.get("pid") == pid), "?")
        try:
            os.kill(pid, 15)
            frases.append("mato el trabajador de %s: media hora sin escribir un byte" % tarea)
        except Exception:
            pass
    return frases


def despertar_vigilante():
    """Corta la pausa de 10 min del vigilante cuando la causa ya no está."""
    try:
        uid = os.getuid()
        subprocess.run(["launchctl", "kickstart", "-k",
                        "gui/%d/com.starseed.vigilante" % uid],
                       capture_output=True, timeout=20)
        return True
    except Exception:
        return False


def desatascar(raiz, vivo, n_agentes, progreso, ahora=None, ruta_estado=None):
    """Una pasada completa. Devuelve las frases para el canal."""
    ahora = ahora or time.time()
    ruta_estado = ruta_estado or os.path.join(
        os.path.expanduser("~"), ".starseed", "desatascar-estado.json")
    frases = []

    procesos = trabajadores_opencode(ahora)
    frases += matar_colgados(procesos, ahora)

    quieto = minutos_sin_integrar(progreso, ahora, ruta_estado)

    if not vivo:
        limpieza = limpiar_arbol(raiz, ahora)
        frases += limpieza
        if any(f.startswith("aparto") for f in limpieza):
            despertar_vigilante()
            frases.append("despierto al vigilante: la causa ya no está")
        return frases

    atascado, razon = orquestador_atascado(vivo, len(procesos), quieto)
    if not atascado:
        return frases

    puertas = puertas_a_rechazar(progreso, ahora)
    if puertas:
        frases.append("orquestador %s → ejecuto los veredictos pendientes" % razon)
        frases += rechazar_puertas(puertas)
    else:
        frases.append("ATASCO: orquestador %s y no hay nada que yo pueda resolver solo" % razon)
    return frases
