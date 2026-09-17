# -*- coding: utf-8 -*-
"""Distinguir «tu código está mal» de «la máquina no pudo».

POR QUÉ (2026-09-16, 20:45)
--------------------------
El Puente de Mando acababa de decir, en rojo:

    no se publicó: los tipos no compilan

Y era mentira. Esto es lo que había de verdad en la salida de la puerta:

    node::Realm::ExecuteBootstrapper(char const*)
    node::LoadEnvironment(node::Environment*, ...)
    start [/usr/lib/dyld]

Eso no es un error de tipos: es node reventando ANTES de arrancar, sin memoria.
Con tres agentes escribiendo y el swap en 6 GB, el proceso no llegó ni a leer un
`.ts`. Un `rc != 0` se estaba traduciendo siempre a «tu código está mal», y eso
manda a buscar durante media hora un error de tipos que no existe.

La diferencia importa porque la reacción es OPUESTA:
  · error de verdad  → arreglar el código, y hasta entonces no publicar;
  · reventón         → esperar a que haya memoria y volver a intentarlo.

Todo lo de aquí es texto y números, sin disco ni red, para que las pruebas
cubran exactamente lo que falla: leer una salida y decidir cuál de las dos es.
"""

#: Rastros de que el proceso murió en vez de terminar con un veredicto.
#: Están en minúsculas; la comparación también.
SENALES = (
    # V8 / node se quedan sin memoria o revientan
    "javascript heap out of memory",
    "fatal error: reached heap limit",
    "allocation failed - javascript heap",
    "node::loadenvironment",
    "node::realm::executebootstrapper",
    "node::nodemaininstance::run",
    "v8::internal::heap",
    "abort trap",
    "segmentation fault",
    "bus error",
    "killed: 9",
    # el sistema entero se queda sin sitio
    "cannot allocate memory",
    "enomem",
    "no space left on device",
    "err_worker_out_of_memory",
)

#: Códigos de salida que en macOS significan «te mataron», no «fallaste».
#: 137 = SIGKILL (el matón de memoria), 139 = SIGSEGV, 134 = SIGABRT.
CODIGOS = (134, 137, 139)


def es_reventon(rc, salida=""):
    """¿Murió el proceso (máquina) o terminó con un veredicto (código)?

    `rc == 0` nunca es reventón: si terminó bien, terminó bien.
    """
    try:
        rc = int(rc)
    except (TypeError, ValueError):
        rc = 1
    if rc == 0:
        return False
    if rc in CODIGOS or rc < 0:
        return True
    texto = (salida or "").lower()
    return any(s in texto for s in SENALES)


def motivo(clave, rc, salida=""):
    """La frase honesta para el Mando. Ni adorna ni acusa al código sin pruebas."""
    nombres = {
        "tsc": "los tipos",
        "vitest": "las pruebas del OS",
        "python": "las pruebas del puente",
        "build": "la build",
    }
    que = nombres.get(clave, clave)
    try:
        rc_i = int(rc)
    except (TypeError, ValueError):
        rc_i = 1
    if rc_i == 124 or "sin terminar" in (salida or ""):
        return "%s se pasó de tiempo: la máquina va ahogada, no es el código" % que
    if es_reventon(rc, salida):
        return ("%s no llegó a ejecutarse: el proceso murió sin memoria. "
                "No es un fallo del código; hay que esperar a que la máquina respire" % que)
    if clave == "tsc":
        return "los tipos no compilan"
    if clave in ("vitest", "python"):
        return "hay %s en rojo" % que
    return "%s falló" % que


def hay_que_reintentar(rc, salida="", intento=1, tope=2):
    """Un reventón se reintenta una vez; un fallo de verdad, jamás.

    Reintentar un error de tipos sería tapar el error. Reintentar un proceso
    muerto de hambre es lo único sensato: en la segunda pasada la máquina suele
    haber soltado memoria.
    """
    return intento < tope and es_reventon(rc, salida)
