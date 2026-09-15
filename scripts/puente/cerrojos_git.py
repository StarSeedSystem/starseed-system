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
mira solo el archivo: se exige que sea VIEJO (nadie tarda media hora en un
commit de tres archivos) y que no quede ningún proceso git vivo. Ante la duda se
conserva: una tarea atascada se arregla; un índice corrupto se paga en horas.
"""

import os
import re
import time

#: Un commit del enjambre tarda segundos. Media hora solo puede ser un muerto.
VIEJO_S = 1800

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
