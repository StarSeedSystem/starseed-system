# -*- coding: utf-8 -*-
"""El turno de lo pesado: UN tsc/vitest/build a la vez en toda la máquina.

POR QUÉ EXISTE ESTE ARCHIVO (2026-09-16, tarde)
-----------------------------------------------
La Mac tiene 8 GB de RAM. Un `tsc --noEmit`, un `vitest` y un `next build`
piden entre 1,5 y 4 GB cada uno. El enjambre ya se serializaba a sí mismo con
el cerrojo «pesado» del orquestador... pero `publicar.py` NO lo tomaba. Así que
hoy pasó esto, medido, no supuesto:

    swap usado = 10.412 MB de 11.264       (93 %)
    memoria libre = 25 %
    un `tsc` de la tarea DR3 llevaba 26 MINUTOS sin terminar

Veintiséis minutos de un tsc que en una máquina descansada tarda 54 segundos.
No estaba colgado: estaba paginando. El coste no fue de créditos, fue de una
hora de reloj y de una tarea que el vigilante habría dado por muerta.

La lección, que es la misma de siempre en este proyecto: el recurso escaso no
es el modelo, es la máquina. Y un recurso escaso sin turno se reparte a
empujones.

FORMATO DEL CERROJO
-------------------
Directorio atómico `~/.starseed/cerrojos/pesado.lock` con un archivo `dueno`
dentro que dice «<pid> <epoch>». Es EXACTAMENTE el mismo formato que usan
`scripts/enjambre/tsc-turno.sh` y `cerrojo_pesado()` del orquestador, para que
los tres compitan por el mismo turno. Si algún día cambia, cambia en los tres.

Un directorio y no un flock porque `mkdir` es atómico en cualquier sistema de
archivos y sobrevive a que el dueño muera sin cerrar nada: el siguiente lee el
`dueno`, ve que ese pid ya no existe, y se lo queda.

Las funciones de arriba son PURAS (texto y números, sin disco) para que las
pruebas cubran justo lo que se rompe: decidir si un turno está huérfano.
"""

import contextlib
import os
import shutil
import time

CERROJOS = os.path.expanduser("~/.starseed/cerrojos")
NOMBRE = "pesado.lock"

#: Cuánto se espera a que el dueño suelte antes de forzar el turno. Una build
#: lenta con swap tarda 10-12 min; 20 min es «esto ya no vuelve».
ESPERA_S = 20 * 60
#: Cada cuánto se vuelve a intentar. 3 s: ni quema CPU ni se duerme el turno.
REINTENTO_S = 3.0
#: Un dueño cuyo pid ya no existe es huérfano al instante. Uno vivo pero
#: parado más de esto también: nadie tarda dos horas en un tsc.
VIEJO_S = 2 * 60 * 60


def texto_dueno(pid, epoch):
    """El contenido del archivo `dueno`. Un solo sitio que decide el formato."""
    return "%d %d" % (int(pid), int(epoch))


def dueno_de(texto):
    """Lee «<pid> <epoch>» y devuelve (pid, epoch). (0, 0) si no se entiende.

    Devuelve (0, 0) y no una excepción a propósito: un `dueno` a medio escribir
    (el proceso murió entre el `open` y el `write`) tiene que leerse como
    «nadie manda aquí», que es justo lo que pasó.
    """
    partes = (texto or "").split()
    if len(partes) < 2:
        return 0, 0
    try:
        return int(partes[0]), int(float(partes[1]))
    except (TypeError, ValueError):
        return 0, 0


def esta_vivo(pid, vivos):
    """¿Sigue existiendo ese pid? `vivos` es el conjunto de pids del sistema."""
    return bool(pid) and int(pid) in set(vivos or ())


def es_huerfano(texto_dueno_actual, vivos, ahora, viejo_s=VIEJO_S):
    """¿Se puede quitar este turno sin robárselo a nadie?

    Sí en tres casos, y en ninguno más:
      1. el `dueno` no se entiende (escritura a medias),
      2. su pid ya no existe,
      3. su pid existe pero lleva más de `viejo_s` con el turno.

    El caso 3 es una red de seguridad, no la vía normal: si se dispara a
    menudo, lo que hay que arreglar es lo que tarda dos horas.
    """
    pid, epoch = dueno_de(texto_dueno_actual)
    if not pid:
        return True
    if not esta_vivo(pid, vivos):
        return True
    return (ahora - epoch) > viejo_s


def puedo_soltar(texto_dueno_actual, mi_pid):
    """Solo suelta el turno quien lo tiene.

    Sin esta comprobación pasa lo siguiente: A fuerza el turno de B por espera
    agotada, B despierta, termina, y en su `finally` borra el turno de A — que
    está a mitad de una build. Le costó una publicación a la Ola 261.
    """
    pid, _ = dueno_de(texto_dueno_actual)
    return pid == int(mi_pid)


# ── la parte que sí toca el disco ───────────────────────────────────────────


def _pids_vivos():
    try:
        salida = os.popen("ps -eo pid=").read()
    except Exception:
        return ()
    fuera = []
    for linea in salida.split():
        try:
            fuera.append(int(linea))
        except ValueError:
            pass
    return tuple(fuera)


def _leer_dueno(ruta):
    try:
        with open(os.path.join(ruta, "dueno"), encoding="utf-8") as f:
            return f.read()
    except Exception:
        return ""


@contextlib.contextmanager
def turno(espera_s=ESPERA_S, reintento_s=REINTENTO_S, avisar=None):
    """Toma el turno de lo pesado, lo suelta pase lo que pase.

        with turno():
            subprocess.run(["npx", "tsc", "--noEmit"])

    `avisar(segundos_esperando)` se llama una vez por minuto mientras espera,
    para que quien mira el Mando sepa que no está colgado, está haciendo cola.
    """
    os.makedirs(CERROJOS, exist_ok=True)
    ruta = os.path.join(CERROJOS, NOMBRE)
    if os.path.isfile(ruta):
        try:
            os.remove(ruta)  # formato viejo (flock sobre archivo)
        except OSError:
            pass

    t0 = time.time()
    ultimo_aviso = t0
    while True:
        if os.path.isdir(ruta) and es_huerfano(_leer_dueno(ruta), _pids_vivos(), time.time()):
            shutil.rmtree(ruta, ignore_errors=True)
        try:
            os.mkdir(ruta)
            break
        except FileExistsError:
            pass
        except OSError:
            break  # sin disco o sin permisos: mejor seguir que bloquearse
        esperando = time.time() - t0
        if esperando > espera_s:
            shutil.rmtree(ruta, ignore_errors=True)
            try:
                os.mkdir(ruta)
            except OSError:
                pass
            break
        if avisar and time.time() - ultimo_aviso >= 60:
            ultimo_aviso = time.time()
            try:
                avisar(int(esperando))
            except Exception:
                pass
        time.sleep(reintento_s)

    try:
        with open(os.path.join(ruta, "dueno"), "w", encoding="utf-8") as f:
            f.write(texto_dueno(os.getpid(), time.time()))
    except OSError:
        pass
    try:
        yield
    finally:
        if puedo_soltar(_leer_dueno(ruta), os.getpid()):
            shutil.rmtree(ruta, ignore_errors=True)
