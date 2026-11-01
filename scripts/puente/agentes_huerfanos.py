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
    """Pids de trabajadores de vitest adoptados por init y de tsc de un turno sin lector.

    `filas`: (pid, ppid, args) como da `ps -eo pid=,ppid=,args=`."""
    filas = list(filas or ())
    fuera = []
    for fila in filas:
        try:
            pid, ppid, args = fila
            pid, ppid = int(pid), int(ppid)
        except (TypeError, ValueError):
            continue
        if ppid == 1 and es_trabajador_de_puerta(args) and pid not in fuera:
            fuera.append(pid)
    for pid in tsc_huerfanos(filas):
        if pid not in fuera:
            fuera.append(pid)
    return fuera


# ─────────────────────────────────────────────────────────────────────────────
# (SUP0111K, 2026-11-01) EL TSC DE UN TURNO QUE YA NADIE LEE
#
# El 31-10 a las 20:41 un agente lanzó `zsh -c 'bash scripts/enjambre/tsc-turno.sh
# 2>&1 | tail -40'`, murió, launchd adoptó el zsh (ppid 1) y su `npm exec tsc` →
# `node …/bin/tsc` siguió 3 h con 4,6 GB en una Mac de 8 GB. SUP0111J ya lo evita
# desde dentro del turno, pero no cubre un tsc-turno matado con SIGKILL ni los que
# corrían con el guion viejo. Se reconoce por la cadena de padres, nunca por grep:
# la puerta del orquestador (cadena a starseed-enjambre.py) y el tsc de una
# terminal con padre vivo NUNCA entran.
# ─────────────────────────────────────────────────────────────────────────────
_SHELLS = {"sh", "-sh", "bash", "-bash", "zsh", "-zsh", "dash", "-dash", "ksh", "-ksh"}


def _mapa_de_padres(filas):
    """{pid: (ppid, args)} de las filas válidas; la basura de ps se descarta."""
    mapa = {}
    for fila in filas or ():
        try:
            pid, ppid, args = fila
            mapa[int(pid)] = (int(ppid), args or "")
        except (TypeError, ValueError):
            continue
    return mapa


def _nombre(args):
    partes = (args or "").split()
    return partes[0].rsplit("/", 1)[-1] if partes else ""


def _es_tsc(args):
    """¿La línea es `npm exec tsc` o un `node …/bin/tsc`? (nunca un shell que los nombra)."""
    partes = (args or "").split()
    exe = _nombre(args)
    if exe in ("npm", "npx"):
        return "tsc" in partes[1:]
    if exe.startswith("node"):
        if any(p.endswith("/bin/tsc") for p in partes[1:]):
            return True
        # `npx` puede aparecer como `node …/npm-cli.js exec tsc`.
        return "exec" in partes[1:3] and "tsc" in partes[1:]
    return False


def _es_tsc_turno(args):
    """¿Es el `bash …scripts/enjambre/tsc-turno.sh` (no el shell -c que lo envuelve)?"""
    partes = (args or "").split()
    if not partes or _nombre(args) not in _SHELLS:
        return False
    for p in partes[1:]:
        if p.startswith("-"):
            continue
        return p.endswith("tsc-turno.sh")
    return False


def _es_shell_con_c(args):
    """¿Es un shell lanzado con `-c` (el `zsh -c '… | tail -40'` del agente)?"""
    partes = (args or "").split()
    if not partes or _nombre(args) not in _SHELLS:
        return False
    return any(p.startswith("-") and not p.startswith("--") and "c" in p for p in partes[1:])


def _es_orquestador(args):
    return "starseed-enjambre.py" in (args or "")


def _ancestros(mapa, pid, tope=64):
    """Los ancestros de `pid`, de hijo a padre; corta ciclos, muertes y cadenas absurdas."""
    actual = mapa.get(pid, (None, ""))[0]
    vistos = set()
    while actual in mapa and actual not in vistos and len(vistos) < tope:
        vistos.add(actual)
        yield actual
        actual = mapa[actual][0]


def _de_un_turno_sin_quien_espere(mapa, pid):
    """(b) Arriba hay un tsc-turno cuyo padre es un shell -c con ppid 1: nadie lee."""
    for anc in _ancestros(mapa, pid):
        ppid, args = mapa[anc]
        if _es_orquestador(args):
            return False
        if _es_tsc_turno(args):
            padre = mapa.get(ppid)
            return bool(padre) and padre[0] == 1 and _es_shell_con_c(padre[1])
    return False


def tsc_huerfanos(filas):
    """Pids del árbol de tsc (`npm exec tsc` y `node …/bin/tsc`) que ya nadie leerá.

    `filas`: (pid, ppid, args) como da `ps -eo pid=,ppid=,args=`. Entra un tsc cuyo
    padre es init (a) y el de un tsc-turno cuyo shell -c fue adoptado por init (b).
    No entra la puerta del orquestador ni un tsc con padre vivo distinto de init."""
    mapa = _mapa_de_padres(filas)
    fuera, visto = [], set()
    for pid in mapa:
        if pid in visto or not _es_tsc(mapa[pid][1]):
            continue
        if mapa[pid][0] == 1 or _de_un_turno_sin_quien_espere(mapa, pid):
            visto.add(pid)
            fuera.append(pid)
    return fuera
