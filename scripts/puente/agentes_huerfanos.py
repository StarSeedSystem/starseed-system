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


# ─────────────────────────────────────────────────────────────────────────────
# (2026-11-03, SUP0111K) EL tsc DE UN AGENTE QUE YA MURIÓ
#
# El 31-10 a las 20:41 un agente lanzó `zsh -c 'bash scripts/enjambre/tsc-turno.sh 2>&1 | tail -40'`
# y murió: el zsh quedó adoptado por launchd (ppid 1) y su `npm exec tsc` → `node …/bin/tsc` siguió
# 3 h con 4,6 GB en una Mac de 8. tsc-turno.sh ya no deja vivo a su tsc (SUP0111J), pero no cubre un
# tsc-turno matado con SIGKILL ni los que corrían con el guion viejo; y el barrido del orquestador
# pide `ps -o etimes`, que el ps de macOS no tiene («keyword not found»).
#
# Solo se corta el tsc (npm exec tsc y su node …/bin/tsc), nunca el shell ni el guion: sin tsc,
# tsc-turno sale solo (rc 137) y suelta su cerrojo con el trap. Un tsc no tiene a quién entregar su
# resultado si (a) la cabeza de su árbol tsc es hija de init, o (b) lo lanzó un `bash …/tsc-turno.sh`
# cuyo padre es un shell `-c` (la herramienta del agente) adoptado por init. Quedan a salvo por
# construcción: la puerta del orquestador (cuelga de starseed-enjambre.py, aunque este tenga ppid 1),
# el tsc de una terminal o de un agente vivo (su padre vive y no es init) y un tsc-turno lanzado
# directamente por init (como `_sin_quien_espere` del guion: «lo lanzó launchd: sí espera alguien»).
# ─────────────────────────────────────────────────────────────────────────────
_TSC_NPM = _re.compile(r"^(?:\S*/)?(?:npm\s+exec|npx)\s+tsc(?:\s|$)")
_TSC_NODE = _re.compile(r"^(?:\S*/)?node(?:\s+-\S+)*\s+\S*[/.]bin/tsc(?:\s|$)")
_TSC_TURNO = _re.compile(r"^(?:\S*/)?(?:ba|z|da|k)?sh(?:\s+-\S+)*\s+\S*scripts/enjambre/tsc-turno\.sh(?:\s|$)")
_SHELLS = ("sh", "bash", "zsh", "dash", "ksh")


def es_tsc(args):
    """¿Es `npm exec tsc` (o `npx tsc`) o el `node …/bin/tsc` que este lanza?"""
    linea = (args or "").strip()
    return bool(_TSC_NPM.match(linea) or _TSC_NODE.match(linea))


def _es_shell_con_c(args):
    """¿Es un shell lanzado con `-c` (`zsh -c '…'`, `bash -lc '…'`), como el de la herramienta de un agente?"""
    piezas = (args or "").split()
    if not piezas or piezas[0].rsplit("/", 1)[-1].lstrip("-") not in _SHELLS:
        return False
    for opcion in piezas[1:]:
        if not opcion.startswith("-"):
            return False                    # ya es el programa: no quedan opciones por mirar
        if _re.fullmatch(r"-[A-Za-z]*c[A-Za-z]*", opcion):
            return True
    return False


def _tabla(filas):
    """{pid: (ppid, args)} de las filas válidas, en el orden en que llegaron; la basura se ignora."""
    tabla = {}
    for fila in filas or ():
        try:
            pid, ppid, args = fila
            tabla[int(pid)] = (int(ppid), str(args or "").strip())
        except (TypeError, ValueError):
            continue
    return tabla


def _antepasados(tabla, pid):
    """Los pids de los padres de `pid`, del más cercano al más lejano, sin llegar a init y sin dar vueltas."""
    cadena, visto, padre = [], {pid}, tabla[pid][0]
    while padre > 1 and padre in tabla and padre not in visto:
        cadena.append(padre)
        visto.add(padre)
        padre = tabla[padre][0]
    return cadena


def _tsc_sin_agente(tabla, pid):
    """¿A este tsc ya no lo espera nadie? Casos (a) y (b) de arriba."""
    cadena = [pid] + _antepasados(tabla, pid)
    i = 0
    while i + 1 < len(cadena) and es_tsc(tabla[cadena[i + 1]][1]):
        i += 1                              # npm exec tsc es el padre de node …/bin/tsc: un solo árbol
    if tabla[cadena[i]][0] == 1:
        return True                         # (a)
    for p in cadena[i + 1:]:
        if _TSC_TURNO.match(tabla[p][1]):   # (b): el primer tsc-turno que lo lanzó
            shell = tabla[p][0]
            return shell in tabla and tabla[shell][0] == 1 and _es_shell_con_c(tabla[shell][1])
    return False


def tsc_huerfanos(filas):
    """Pids de los `npm exec tsc` y `node …/bin/tsc` que ya no tienen a quién entregar su resultado.

    `filas`: (pid, ppid, args) como da `ps -eo pid=,ppid=,args=`. Salen en el orden en que llegaron."""
    tabla = _tabla(filas)
    return [p for p, (_, args) in tabla.items() if es_tsc(args) and _tsc_sin_agente(tabla, p)]


def trabajadores_huerfanos(filas):
    """Pids de lo que ya no sirve a nadie y retiene RAM: los trabajadores de vitest adoptados por
    init (su vitest ya murió) y, desde SUP0111K, el árbol de un tsc sin agente (`tsc_huerfanos`).

    `filas`: (pid, ppid, args) como da `ps -eo pid=,ppid=,args=`."""
    filas = list(filas or ())               # se recorre más de una vez
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
