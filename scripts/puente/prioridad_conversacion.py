#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Mientras Alex habla con Astraura, la conversación manda sobre todo lo demás.

Alex (2026-09-22): «debe utilizar la mayor cantidad de capacidad de cómputo disponible del
dispositivo inteligentemente deteniendo otros procesos del resto del sistema para dar
prioridad a la interacción inmediata de las conversaciones».

Lo medido esa noche explica el porqué. Alex conversó de 20:11 a 20:39 con el enjambre de la
Mac escribiendo. El guardia de memoria, cumpliendo su regla, CONGELÓ (SIGSTOP) la voz
(`tts-server`) y BitNet (`llama-server`) para dar RAM a los agentes: la voz se detenía a
mitad, el daemon levantaba otro servidor en otro puerto (4500 → 4501 → 4502 → 4503: «recarga
el modelo»), y BitNet llevaba DOS DÍAS congelado reteniendo el puerto 8790, así que Astraura
no podía ni arrancar otro: «couldn't bind HTTP server socket» en bucle. Por eso «no responde
con el sistema nativo».

La regla ahora se invierte mientras dura la CONCESIÓN (`~/.starseed/conversacion.json`, la
escribe el servidor de voz en tiempo real con cada frase y cada latido del cliente):
  · los motores de la conversación (BitNet, la voz) NUNCA se congelan; si estaban congelados
    por el guardia, se reanudan;
  · lo que se congela es el ENJAMBRE de la Mac (agentes `opencode`, el orquestador, las
    builds y pruebas que lanza) para que sus páginas vayan a disco y la RAM quede para hablar;
  · al acabar la concesión, se reanuda exactamente lo que se congeló aquí, nada más.

Nada en la nube se toca (no ocupa RAM de la Mac). Nada que el dueño parara a mano se reanuda.

    python3 scripts/puente/prioridad_conversacion.py aplicar   # lo llaman la voz y el guardia
    python3 scripts/puente/prioridad_conversacion.py estado
"""

import json
import os
import re
import signal
import subprocess
import sys
import time
import urllib.request

CONCESION = os.path.expanduser(
    os.environ.get("STARSEED_CONCESION", "~/.starseed/conversacion.json")
)
MARCA = os.environ.get(
    "STARSEED_MARCA_CONVERSACION", "/tmp/starseed-congelados-por-la-conversacion"
)
MARCA_GUARDIA = "/tmp/starseed-%s-congelado-por-el-guardia"
ASTRAURA = os.environ.get("STARSEED_ASTRAURA_URL", "http://127.0.0.1:8000")

#: Los motores de la conversación, por ejecutable (`comm`), igual que el guardia.
MOTORES = ("llama-server", "tts-server")
#: El trabajo de fondo de la Mac que cede su RAM a la conversación. Se compara la línea de
#: órdenes COMPLETA con patrones anclados al ejecutable, nunca se imprime (puede llevar un
#: prompt), y nunca casa con el propio servidor de Genesis (`next start`), ni con este guion.
PATRONES_ENJAMBRE = (
    re.compile(r"^\S*opencode(\.exe)?\s+run\b"),
    re.compile(r"^\S*[Pp]ython[0-9.]*\s+(-u\s+)?\S*starseed-enjambre\.py\b"),
    re.compile(r"^\S*node\S*\s+\S*next\S*\s+build\b"),
    re.compile(r"^\S*node\S*\s+\S*tsc\b.*--noEmit"),
    re.compile(r"^\S*node\S*\s+\S*vitest\s"),
    re.compile(r"^\S*vitest\s"),
)


def leer_concesion(ruta=CONCESION):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def activa(concesion, ahora=None):
    """PURA: ¿dura aún la conversación?"""
    ahora = time.time() if ahora is None else ahora
    try:
        return float((concesion or {}).get("hasta") or 0) > ahora
    except (TypeError, ValueError):
        return False


def es_enjambre(linea):
    """PURA: ¿esta línea de órdenes es trabajo de fondo que puede ceder la RAM?"""
    return any(p.match(linea or "") for p in PATRONES_ENJAMBRE)


def decidir(conversando, procesos, marcados, daemon_vivo=True):
    """PURA: lo que hay que hacer. `procesos` = [(pid, estado, comm, args)].

    Devuelve {"congelar": [pids del enjambre], "reanudar": [pids], "motores": [pids de
    motores que hay que reanudar], "reiniciar": [nombres de motores muertos]}. Con conversación:
    se congela el enjambre suelto y se reanudan/reinician los motores. Sin conversación:
    se reanuda SOLO lo que marcó esta regla (lo congelado por el guardia o a mano no es asunto suyo).
    """
    congelar, reanudar, motores, reiniciar = [], [], [], []
    vivos = {pid for pid, _, _, _ in procesos}
    if conversando:
        motores_vivos = set()
        for pid, estado, comm, args in procesos:
            nombre = os.path.basename(comm or "")
            if nombre in MOTORES:
                motores_vivos.add(nombre)
                if "T" in estado:
                    motores.append(pid)
            elif es_enjambre(args) and "T" not in estado:
                congelar.append(pid)
        if daemon_vivo:
            motores_muertos = [m for m in MOTORES if m not in motores_vivos]
            reiniciar.extend(motores_muertos)
    else:
        reanudar = sorted(p for p in marcados if p in vivos)
    return {
        "congelar": sorted(congelar),
        "reanudar": sorted(reanudar),
        "motores": sorted(motores),
        "reiniciar": sorted(reiniciar),
    }


def procesos():
    """[(pid, estado, comm, args)] de los procesos del usuario. Nunca imprime args."""
    try:
        a = subprocess.run(
            ["ps", "-xo", "pid=,state=,comm="],
            capture_output=True,
            text=True,
            timeout=20,
        ).stdout
        b = subprocess.run(
            ["ps", "-xo", "pid=,args="], capture_output=True, text=True, timeout=20
        ).stdout
    except (OSError, subprocess.SubprocessError):
        return []
    args = {}
    for l in b.splitlines():
        p = l.strip().split(None, 1)
        if len(p) == 2 and p[0].isdigit():
            args[int(p[0])] = p[1]
    fuera = []
    for l in a.splitlines():
        p = l.strip().split(None, 2)
        if len(p) == 3 and p[0].isdigit():
            pid = int(p[0])
            if pid != os.getpid():
                fuera.append((pid, p[1], p[2], args.get(pid, "")))
    return fuera


def leer_marca(ruta=MARCA):
    try:
        with open(ruta, encoding="utf-8") as f:
            return {int(t) for t in f.read().split() if t.isdigit()}
    except OSError:
        return set()


def guardar_marca(pids, ruta=MARCA):
    if not pids:
        try:
            os.remove(ruta)
        except OSError:
            pass
        return
    with open(ruta, "w", encoding="utf-8") as f:
        f.write("\n".join(str(p) for p in sorted(pids)))


def despertar_bitnet(timeout=3):
    try:
        urllib.request.urlopen(
            urllib.request.Request(
                ASTRAURA + "/api/bitnet/despertar",
                data=b"{}",
                headers={"Content-Type": "application/json"},
            ),
            timeout=timeout,
        ).read()
        return True
    except Exception:
        return False


def _daemon_esta_vivo(timeout=2):
    """PURA: ¿el daemon de voz (ASTRAURA en 4444 o tts-server en 4500) está vivo?"""
    try:
        req = urllib.request.Request(ASTRAURA + "/status", method="GET")
        urllib.request.urlopen(req, timeout=timeout).read()
        return True
    except Exception:
        return False


def _reiniciar_motor(motor):
    """PURA: pide al daemon Astraura que relance el motor vía /warm."""
    try:
        urllib.request.urlopen(
            urllib.request.Request(
                ASTRAURA + "/warm",
                method="POST",
                data=b"{}",
                headers={"Content-Type": "application/json"},
            ),
            timeout=5,
        ).read()
    except Exception:
        pass


def aplicar():
    """Lo decide y lo hace. Devuelve un resumen legible (sin líneas de órdenes)."""
    conversando = activa(leer_concesion())
    marcados = leer_marca()
    daemon_vivo = _daemon_esta_vivo()
    d = decidir(conversando, procesos(), marcados, daemon_vivo=daemon_vivo)
    hechos = []
    for pid in d["motores"]:
        try:
            os.kill(pid, signal.SIGCONT)
            hechos.append("motor %d reanudado" % pid)
        except OSError:
            pass
    if d["motores"]:
        for m in MOTORES:
            try:
                os.remove(MARCA_GUARDIA % m)
            except OSError:
                pass
    nuevos = set()
    for pid in d["congelar"]:
        guardar_marca(marcados | nuevos | {pid})
        try:
            os.kill(pid, signal.SIGSTOP)
            nuevos.add(pid)
        except OSError:
            pass
    if nuevos:
        hechos.append("%d proceso(s) del enjambre en pausa" % len(nuevos))
    for pid in d["reanudar"]:
        try:
            os.kill(pid, signal.SIGCONT)
        except OSError:
            pass
    if d["reanudar"] or (not conversando and marcados):
        guardar_marca(set())
        if d["reanudar"]:
            hechos.append("%d proceso(s) del enjambre reanudados" % len(d["reanudar"]))
    else:
        guardar_marca(marcados | nuevos)
    if conversando:
        despertar_bitnet()
    for motor in d["reiniciar"]:
        _reiniciar_motor(motor)
        hechos.append("motor %s reiniciado" % motor)
    return "%s · %s" % (
        "conversando" if conversando else "sin conversación",
        ", ".join(hechos) or "nada que hacer",
    )


def main():
    orden = sys.argv[1] if len(sys.argv) > 1 else "estado"
    if orden == "aplicar":
        print(aplicar(), flush=True)
        return 0
    c = leer_concesion()
    print(
        json.dumps(
            {
                "conversando": activa(c),
                "concesion": c,
                "congelados": sorted(leer_marca()),
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
