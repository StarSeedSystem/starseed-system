# -*- coding: utf-8 -*-
"""Agentes que siguen escribiendo para un orquestador que ya no existe.

POR QUÉ (2026-09-16, 23:00)
---------------------------
Reinicié el orquestador tres veces esta noche. Cada vez quedaron procesos
`codex exec` adoptados por init (ppid 1), escribiendo tan tranquilos. Medido
justo después del tercer reinicio:

    pid=45192  ppid=1  20:03  codex exec -m gpt-5.6-sol …
    pid=75186  ppid=1  01:31  codex exec -m gpt-5.6-sol …

Veinte minutos de la suscripción de ChatGPT gastados para NADIE: su
orquestador estaba muerto, así que nadie iba a recoger su trabajo, ni
commitearlo, ni pasarlo por las puertas. Tokens quemados sin ningún destino.

Y es reproducible: pasa cada vez que el orquestador se reinicia, algo que
ocurre solo (el vigilante lo relanza si se cae). Así que no era un accidente
mío, era una fuga abierta.

UN AVISO SOBRE CONTAR PROCESOS
------------------------------
Esta misma noche conté agentes con `ps | grep -c` y vi dos donde había uno: un
agente lanza subprocesos y el conteo los cuenta a todos. Casi arreglo un
problema inexistente. La regla de oro del proyecto para contar orquestadores
vale igual aquí: **se cuenta por pid y ppid, nunca por líneas de grep.** Por eso
esta función recibe filas ya estructuradas y no un texto que grepear.
"""

#: Cómo se reconoce un proceso de escritura de agente en la línea de comandos.
FIRMAS = ("codex exec", "opencode run")


def es_agente(args):
    """¿Esta línea de comandos es un agente escribiendo una tarea?"""
    linea = args or ""
    return any(f in linea for f in FIRMAS)


def huerfanos(filas, vivos=()):
    """Los pids de agentes que ya no cuelgan de ningún orquestador vivo.

    `filas`: iterable de (pid, ppid, args), tal cual los da `ps -eo pid,ppid,args`.
    `vivos`: pids de los orquestadores que sí existen ahora mismo.

    Huérfano = es un agente, y su ppid no es ninguno de los orquestadores vivos.
    El caso normal es ppid 1 (lo adoptó init), pero se cubre también el de un
    padre intermedio que ya murió.

    Se devuelven en el orden en que llegaron, sin repetir.
    """
    vivos = {int(v) for v in (vivos or ()) if str(v).isdigit() or isinstance(v, int)}
    fuera, visto = [], set()
    for pid, ppid, args in filas or ():
        try:
            pid, ppid = int(pid), int(ppid)
        except (TypeError, ValueError):
            continue
        if pid in visto or not es_agente(args):
            continue
        if ppid in vivos:
            continue        # tiene dueño: no se toca
        visto.add(pid)
        fuera.append(pid)
    return fuera


def resumen(filas, pids):
    """Una línea por huérfano para el evento de Genesis, sin volcar la orden entera."""
    porque = {int(p): a for p, _, a in (filas or ()) if str(p).isdigit()}
    salida = []
    for p in pids or ():
        linea = porque.get(int(p), "")
        cual = "codex" if "codex exec" in linea else "opencode"
        salida.append("%s (pid %d)" % (cual, int(p)))
    return ", ".join(salida)


# ─────────────────────────────────────────────────────────────────────────────
# (2026-09-23, 00:15) TRABAJADORES DE PUERTA HUÉRFANOS
#
# Alex: «no está cargando, autoreparándose Genesis». Medido: cinco
# `node (vitest N)` con ppid 1, 49 minutos vivos, ~2,2 GB cada uno: 11 GB de una
# Mac de 8. Swap a 13,3 GB, disco a 2,7 GB y el `next-server` de Genesis en estado
# U (esperando página) sin contestar en 20 s. Su vitest principal había muerto
# (una puerta cortada por tiempo mata solo al hijo directo, no a sus nietos), así
# que nadie iba a leer sus resultados. Matarlos devolvió Genesis en el acto
# (307 en 0,27 s) y el swap bajó a 5,4 GB.
#
# Regla segura: un trabajador de vitest («node (vitest N)») lo crea SU vitest
# principal; si su padre es init (ppid 1), ese principal ya no existe y el
# trabajador no sirve a nadie. No hay falso positivo posible: nadie lanza a mano un
# proceso con ese título.
# ─────────────────────────────────────────────────────────────────────────────
import re as _re

_TRABAJADOR_VITEST = _re.compile(r"^\S*node \(vitest(?: \d+)?\)")


def es_trabajador_de_puerta(args):
    """¿Es un trabajador de vitest (título «node (vitest N)»)?"""
    return bool(_TRABAJADOR_VITEST.match((args or "").strip()))


def trabajadores_huerfanos(filas):
    """Pids de trabajadores de puerta adoptados por init: su dueño ya murió.

    Incluye los `node (vitest N)` (su vitest principal ya no existe) y los tsc de
    un `tsc-turno.sh` huérfano (ver `tsc_huerfanos`). `filas`: (pid, ppid, args)
    como da `ps -eo pid=,ppid=,args=`."""
    tsc = set(tsc_huerfanos(filas))
    fuera, visto = [], set()
    for fila in filas or ():
        try:
            pid, ppid, args = fila
            pid, ppid = int(pid), int(ppid)
        except (TypeError, ValueError):
            continue
        if pid in visto:
            continue
        if (ppid == 1 and es_trabajador_de_puerta(args)) or pid in tsc:
            visto.add(pid)
            fuera.append(pid)
    return fuera


# ─────────────────────────────────────────────────────────────────────────────
# (2026-11-01) TSC DE UN tsc-turno MUERTO
#
# El 31-10 a las 20:41 un agente lanzó `zsh -c 'bash scripts/enjambre/tsc-turno.sh
# … | tail -40'` y murió. Launchd adoptó el zsh (ppid 1), y su `npm exec tsc` →
# `node …/bin/tsc --noEmit` siguió 3 h con 4,6 GB en una Mac de 8 GB. SUP0111J ya
# pone plazo y vigilancia dentro del guion, pero no cubre un tsc-turno matado con
# SIGKILL ni los que ya corrían con el guion viejo.
#
# Solo se corta el árbol cuando quien iba a leer el resultado ya no existe:
#   (a) el propio tsc tiene a init por padre, o
#   (b) su cadena sube a un `tsc-turno.sh` cuyo padre es un shell `-c` con ppid 1.
# Nunca la puerta del orquestador: su cadena sube a `starseed-enjambre.py`.
# ─────────────────────────────────────────────────────────────────────────────
_NPM_TSC = _re.compile(r"(?:^|\s)npm\s+exec\s+tsc(?:\s|$)")
_NODE_TSC = _re.compile(r"(?:^|\s)node\s+\S*/bin/tsc(?:\s|$)")
_TURNO = _re.compile(r"scripts/enjambre/tsc-turno\.sh")
_ORQUESTADOR = _re.compile(r"starseed-enjambre\.py")
_SHELLS_C = ("zsh", "bash", "sh", "dash", "ksh")


def es_tsc(args):
    """¿Es el envoltorio (`npm exec tsc`) o el propio `node …/bin/tsc`?"""
    linea = args or ""
    return bool(_NPM_TSC.search(linea) or _NODE_TSC.search(linea))


def es_tsc_turno(args):
    """¿Es el guion que pide el turno de compilación?"""
    return bool(_TURNO.search(args or ""))


def es_shell_con_c(args):
    """¿Es un shell lanzado con `-c` (zsh/bash/sh…), como el de la herramienta?"""
    partes = (args or "").strip().split(None, 1)
    if len(partes) < 2:
        return False
    nombre = partes[0].rsplit("/", 1)[-1]
    bandera = partes[1].split(None, 1)[0]
    return nombre in _SHELLS_C and bandera.startswith("-") and "c" in bandera


def _cuelga_de_turno_adoptado(ppid, mapa):
    """Sube por ppid hasta un tsc-turno con shell `-c` huérfano; corta en el orquestador."""
    vistos = set()
    while ppid in mapa and ppid not in vistos:
        vistos.add(ppid)
        su_ppid, args = mapa[ppid]
        if _ORQUESTADOR.search(args):
            return False
        if es_tsc_turno(args):
            padre = mapa.get(su_ppid)
            return bool(padre and padre[0] == 1 and es_shell_con_c(padre[1]))
        ppid = su_ppid
    return False


def tsc_huerfanos(filas):
    """Pids de `npm exec tsc`/`node …/bin/tsc` que ya no sirven a nadie.

    (a) su padre es init (ppid 1); o (b) su cadena sube a un tsc-turno cuyo padre
    es un shell `-c` adoptado por init. Nunca la puerta del orquestador ni un tsc
    con un padre vivo distinto de init. Devuelve en el orden de `filas`, sin repetir."""
    mapa = {}
    for fila in filas or ():
        try:
            pid, ppid, args = fila
            mapa[int(pid)] = (int(ppid), args or "")
        except (TypeError, ValueError):
            continue
    fuera = []
    for pid, (ppid, args) in mapa.items():
        if not es_tsc(args):
            continue
        if ppid == 1 or _cuelga_de_turno_adoptado(ppid, mapa):
            fuera.append(pid)
    return fuera
