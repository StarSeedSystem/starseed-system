# -*- coding: utf-8 -*-
"""Cerrojos `index.lock` huérfanos: detectarlos y quitarlos sin riesgo.

POR QUÉ EXISTE ESTO. Cuando un agente muere a media escritura —se le acaba el
tiempo, lo mata el guardia de memoria, se cae el proveedor— git puede dejar
atrás un `index.lock` de cero bytes en su worktree. A partir de ese momento,
TODOS los intentos siguientes de esa tarea mueren con un mensaje que no dice
nada útil («commit: … a git process may have crashed in this repository
earlier»), y la tarea quema sus ocho reintentos gratuitos sin que ninguno
pudiera funcionar. El 2026-09-14 había tres cerrojos así (p320M, p323A, p324F),
de casi dos horas, y las tres tareas llevaban desde entonces fallando en bucle.

EL CUIDADO QUE HAY QUE TENER. Un cerrojo también puede ser legítimo: hay un git
trabajando AHORA mismo. Quitarlo entonces corrompe el índice. Por eso aquí no se
mira solo el archivo: se exige que no quede ningún proceso git vivo Y que el
cerrojo lleve un rato largo ahí (nadie tarda cinco minutos en un commit de tres
archivos). Ante la duda se
conserva: una tarea atascada se arregla; un índice corrupto se paga en horas.
"""

import os
import re
import time

#: Un commit del enjambre tarda segundos. Cinco minutos, con la comprobación de
#: «no queda ningún git vivo» ya hecha, solo puede ser un muerto. Empezó en media
#: hora y era demasiado prudente: p324F volvió a morir con un cerrojo de 16
#: minutos que el barrido no tocaba, después de quince minutos de escritura, tsc
#: y pruebas en verde. Lo que hace segura esta cifra no es su tamaño, es el
#: guardia de «ningún git vivo» que la acompaña.
VIEJO_S = 300

_GIT_VIVO = re.compile(r"(^|/)git(\s|$)")


def hay_git_vivo(lineas_ps):
    """¿Queda algún proceso git corriendo? `lineas_ps` son líneas de `ps -eo args`.

    Se descarta la propia línea del `ps` y cualquier orden que solo MENCIONE git
    (un prompt de agente, un grep): cuenta si el ejecutable ES git.
    """
    for linea in lineas_ps:
        orden = linea.strip()
        if not orden:
            continue
        primero = orden.split()[0]
        if _GIT_VIVO.search(primero):
            return True
    return False


def cerrojos_huerfanos(dir_worktrees, lineas_ps, ahora=None, viejo_s=VIEJO_S):
    """Rutas de `index.lock` que se pueden quitar sin riesgo.

    Devuelve lista vacía —no «todas»— si hay un git vivo: con un git trabajando
    no se puede distinguir el cerrojo muerto del que está en uso, y equivocarse
    hacia el lado de borrar es el error caro.
    """
    if hay_git_vivo(lineas_ps):
        return []
    ahora = time.time() if ahora is None else ahora
    salida = []
    try:
        nombres = sorted(os.listdir(dir_worktrees))
    except OSError:
        return []
    for nombre in nombres:
        ruta = os.path.join(dir_worktrees, nombre, "index.lock")
        try:
            edad = ahora - os.path.getmtime(ruta)
        except OSError:
            continue
        if edad >= viejo_s:
            salida.append(ruta)
    return salida


def quitar(rutas):
    """Quita los cerrojos y devuelve los que de verdad desaparecieron.

    Tolerante a propósito: si otro proceso se adelantó, o el permiso falla, se
    sigue con los demás. Este barrido nunca debe tumbar al vigilante.
    """
    quitados = []
    for ruta in rutas:
        try:
            os.remove(ruta)
        except OSError:
            continue
        quitados.append(ruta)
    return quitados


# ── el cerrojo del repo PRINCIPAL (2026-10-10) ──────────────────────────────────────────
# El barrido de arriba mira solo `.git/worktrees/*/index.lock` y exige que NO quede ningún git
# vivo. En el repo principal eso no se cumple casi nunca: Genesis lanza `git log` y
# `git status` cada pocos segundos. Medido el 2026-10-10: el reinicio de la Mac dejó un
# `.git/index.lock` de 0 bytes a las 23:31 y durante cinco horas cada integración del enjambre
# («merge ff falló: … index.lock») se tiró a la basura. La regla que lo resuelve sin riesgo:
# un proceso que ARRANCÓ después de crearse el cerrojo no puede ser su dueño (cuando arrancó,
# el cerrojo ya estaba, y git no lo comparte). Solo cuenta un git más viejo que el cerrojo.

def segundos_de_etime(etime):
    """`ps -o etime` → segundos. Formatos: «mm:ss», «hh:mm:ss», «d-hh:mm:ss». None si no se entiende."""
    texto = str(etime or "").strip()
    dias = 0
    if "-" in texto:
        d, texto = texto.split("-", 1)
        try:
            dias = int(d)
        except ValueError:
            return None
    partes = texto.split(":")
    try:
        nums = [int(p) for p in partes]
    except ValueError:
        return None
    if len(nums) == 2:
        h, m, s = 0, nums[0], nums[1]
    elif len(nums) == 3:
        h, m, s = nums
    else:
        return None
    return dias * 86400 + h * 3600 + m * 60 + s


def git_que_puede_tenerlo(lineas_etime_args, edad_cerrojo_s, margen_s=5):
    """¿Hay un git vivo que arrancó ANTES de crearse el cerrojo (y por tanto podría ser su dueño)?

    `lineas_etime_args` son líneas de `ps -axo etime=,args=`. Ante una línea de git que no se
    entiende, se responde True: ante la duda se conserva."""
    for linea in lineas_etime_args or []:
        trozos = str(linea).split(None, 1)
        if len(trozos) < 2:
            continue
        etime, orden = trozos
        primero = orden.split()[0] if orden.split() else ""
        if not _GIT_VIVO.search(primero):
            continue
        vivo_s = segundos_de_etime(etime)
        if vivo_s is None or vivo_s + margen_s >= edad_cerrojo_s:
            return True
    return False


def quitar_si_huerfano(ruta, lineas_etime_args, ahora=None, viejo_s=VIEJO_S):
    """Quita `ruta` (un index.lock) si lleva ≥ viejo_s y ningún git vivo pudo crearlo.

    Devuelve la edad en minutos del cerrojo quitado (texto) o None si no se tocó nada."""
    ahora = time.time() if ahora is None else ahora
    try:
        edad = ahora - os.path.getmtime(ruta)
    except OSError:
        return None
    if edad < viejo_s or git_que_puede_tenerlo(lineas_etime_args, edad):
        return None
    if quitar([ruta]):
        return "%d min" % int(edad // 60)
    return None
