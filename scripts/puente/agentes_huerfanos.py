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
    """Pids de trabajadores de vitest y de tsc huérfanos (su principal ya murió).

    `filas`: (pid, ppid, args) como da `ps -eo pid=,ppid=,args=`.
    Un trabajador de vitest lo es si su padre es init; un tsc, si `tsc_huerfanos`
    lo reconoce (árbol de `tsc-turno.sh` colgado o tsc adoptado por init)."""
    fuera = []
    for fila in filas or ():
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
# (2026-10-31, 20:41) EL TSC QUE SOBREVIVIÓ A SU TURNO
#
# Un agente lanzó `zsh -c 'bash scripts/enjambre/tsc-turno.sh | tail -40'`, el
# agente murió, launchd adoptó el zsh (ppid 1) y el `npm exec tsc` → `node
# …/bin/tsc` siguió tres horas con 4,6 GB en una Mac de 8. Es el mismo patrón
# de los `node (vitest N)`: la puerta de arriba ya no existe y nadie leerá el
# resultado. Pero aquí no basta con mirar el ppid del tsc, porque entre medias
# quedan el shell `-c` y el propio `tsc-turno.sh`.
#
# Regla segura: se corta el árbol de tsc cuando (a) algún tsc del árbol lo
# adoptó init, o (b) hay un `tsc-turno.sh` cuyo padre es un shell `-c` con
# ppid 1. NUNCA el tsc de la puerta del orquestador: su cadena sube a
# `starseed-enjambre.py`, aunque el orquestador tenga ppid 1. Y un tsc sin
# `tsc-turno.sh` con un padre vivo distinto de init es de una terminal: se deja.
# ─────────────────────────────────────────────────────────────────────────────
_ORQUESTADOR = "starseed-enjambre.py"
_NPM_TSC = _re.compile(r"\bnpm\s+exec\b.*\btsc\b")
_NODE_TSC = _re.compile(r"\bnode\b.*?[./]bin/tsc\b")
_SHELL_C = _re.compile(r"^\S*(?:zsh|bash|sh)\b.*\s-c(?:\s|$)")
_TURNO = _re.compile(r"^\S*(?:bash|sh)\b.*tsc-turno\.sh")


def es_tsc(args):
    """¿Es `npm exec tsc` o un `node …/bin/tsc`?"""
    linea = args or ""
    return bool(_NPM_TSC.search(linea) or _NODE_TSC.search(linea))


def _es_turno(args):
    return bool(_TURNO.match((args or "").strip()))


def _es_shell_c(args):
    return bool(_SHELL_C.match((args or "").strip()))


def _padres(filas):
    mapa = {}
    for fila in filas or ():
        try:
            pid, ppid, args = fila
            pid, ppid = int(pid), int(ppid)
        except (TypeError, ValueError):
            continue
        mapa[pid] = (ppid, args or "")
    return mapa


def _cadena(mapa, pid):
    """Pids, ppid y args subiendo por el árbol; un ciclo o un padre ausente la corta."""
    cadena, visto = [], set()
    while pid in mapa and pid not in visto:
        visto.add(pid)
        ppid, args = mapa[pid]
        cadena.append((pid, ppid, args))
        pid = ppid
    return cadena


def _es_huerfano(mapa, pid):
    cadena = _cadena(mapa, pid)
    if any(_ORQUESTADOR in a for _, _, a in cadena):
        return False
    if any(ppid == 1 and es_tsc(a) for _, ppid, a in cadena):
        return True
    for _, ppid, args in cadena:
        if _es_turno(args):
            padre = mapa.get(ppid)
            if padre and padre[0] == 1 and _es_shell_c(padre[1]):
                return True
    return False


def tsc_huerfanos(filas):
    """Pids de tsc cuyo `tsc-turno.sh` ya no cuelga de nadie vivo.

    `filas`: (pid, ppid, args) como da `ps -eo pid=,ppid=,args=`. Devuelve los
    pids de los `npm exec tsc` y `node …/bin/tsc` del árbol, sin repetir y en el
    orden en que llegaron. La puerta del orquestador queda fuera siempre."""
    mapa = _padres(filas)
    fuera = []
    for pid in mapa:
        if es_tsc(mapa[pid][1]) and _es_huerfano(mapa, pid) and pid not in fuera:
            fuera.append(pid)
    return fuera
