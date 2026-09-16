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


def puertas_a_rechazar(progreso, ahora, tope_min=6):
    """Puertas cuyo veredicto ya está dado y solo falta ejecutarlo.

    El tope es corto (6 min) a propósito: una revisión bloqueante o un alcance
    incompleto son veredictos YA dados, y esperar no añade información — solo
    congela el enjambre entero. Con 20 min cada atasco costaba media hora de
    agentes parados (medido el 2026-09-14). Una puerta en VERDE no la toca
    nadie: esa sí espera a una persona, el tiempo que haga falta.

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


def orquestador_atascado(vivo, n_agentes, minutos_sin_avance, tope_min=8):
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


def clave_de_lineas(lineas, nombre):
    """El valor de `nombre` en un archivo tipo `.env`, o None.

    PURA a propósito: el archivo de claves se lee fuera y aquí solo se interpreta,
    para poder probarlo sin tener secretos delante. Acepta `export NOMBRE=valor`,
    comillas alrededor del valor y comentarios.
    """
    for linea in lineas or []:
        linea = (linea or "").strip()
        if not linea or linea.startswith("#") or "=" not in linea:
            continue
        izquierda, _, valor = linea.partition("=")
        izquierda = izquierda.strip()
        if izquierda.startswith("export "):
            izquierda = izquierda[len("export "):].strip()
        if izquierda != nombre:
            continue
        valor = valor.strip()
        if len(valor) >= 2 and valor[0] == valor[-1] and valor[0] in "\"'":
            valor = valor[1:-1]
        return valor or None
    return None


def aviso_de_rechazo(tid, motivo, ok=True):
    """El texto que le llega a Alex cuando el desatascador ejecuta un veredicto.

    PURA. Lleva las tres cosas que pidió: qué tarea, por qué, y dónde está el
    trabajo para rescatarlo. La rama se conserva SIEMPRE, y decirlo importa: el
    aviso no es «se ha perdido esto», es «esto te espera si no estás de acuerdo».
    """
    cabeza = "Rechazo automático" if ok else "No pude rechazar"
    return (
        "*%s · %s*\n%s\n\nRama conservada: `ola/%s`\n"
        "Si no estás de acuerdo, ahí sigue el trabajo." % (cabeza, tid, motivo, tid)
    )


def _clave(nombre, ruta=None):
    """Lee una clave del entorno o de `~/.hermes/.env`. Nunca la imprime.

    El director corre bajo launchd sin cargar el archivo de claves (solo el
    servicio de Telegram lo hace), así que aquí hay que leerlo a mano.
    """
    valor = os.environ.get(nombre)
    if valor:
        return valor.strip()
    ruta = ruta or os.path.expanduser("~/.hermes/.env")
    try:
        with open(ruta, encoding="utf-8", errors="replace") as f:
            return clave_de_lineas(f.readlines(), nombre)
    except Exception:
        return None


def avisar_por_telegram(texto):
    """Manda el aviso. Devuelve True/False y NUNCA lanza: avisar es un extra.

    Tampoco registra el token ni el chat, ni siquiera al fallar.
    """
    token = _clave("TELEGRAM_BOT_TOKEN")
    chat = _clave("TELEGRAM_CHAT_ID")
    if not token or not chat:
        return False
    try:
        import json as _json
        import urllib.request as _url

        datos = _json.dumps(
            {"chat_id": str(chat), "text": texto, "parse_mode": "Markdown"}
        ).encode("utf-8")
        peticion = _url.Request(
            "https://api.telegram.org/bot%s/sendMessage" % token,
            data=datos,
            headers={"Content-Type": "application/json"},
        )
        with _url.urlopen(peticion, timeout=20) as r:
            return r.status == 200
    except Exception:
        return False


def rechazar_puertas(puertas, binario="starseed-puente", avisar=avisar_por_telegram):
    """Ejecuta el veredicto que ya estaba dado. NUNCA aprueba.

    (2026-09-16, decisión de Alex) Y avisa: el rechazo sigue siendo firme, pero
    le llega por Telegram con el motivo y el nombre de la rama, para que pueda
    rescatarla si no está de acuerdo. Si el aviso falla, el rechazo se mantiene;
    lo que no puede pasar es que un fallo de red deshaga un veredicto.
    """
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
        try:
            if avisar and not avisar(aviso_de_rechazo(tid, motivo, ok)):
                frases.append("(a %s no pude avisarte por Telegram)" % tid)
        except Exception:
            frases.append("(a %s no pude avisarte por Telegram)" % tid)
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

    # Las puertas con veredicto dado se ejecutan SIEMPRE, no solo cuando el
    # orquestador ya lleva rato congelado: esperar a que se note el atasco es
    # regalar minutos de enjambre parado. (2026-09-14: R7 llevaba 11 min en la
    # puerta con alcance incompleto y el desatascador no la miraba porque el
    # reloj del atasco se había reiniciado con un commit mío.)
    puertas = puertas_a_rechazar(progreso, ahora)
    if puertas:
        frases += rechazar_puertas(puertas)

    atascado, razon = orquestador_atascado(vivo, len(procesos), quieto)
    if atascado and not puertas:
        frases.append("ATASCO: orquestador %s y no hay nada que yo pueda resolver solo" % razon)
    return frases
