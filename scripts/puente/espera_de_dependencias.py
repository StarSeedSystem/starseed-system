# -*- coding: utf-8 -*-
"""Esperar a una dependencia no es lo mismo que rendirse con ella.

POR QUÉ EXISTE (2026-09-16, 22:45)
----------------------------------
Alex preguntó por qué solo había dos agentes trabajando. La respuesta corta era
«porque solo hay dos tareas que coger». La larga es esta, y estaba en dos
líneas del orquestador:

    if not ok:                          # una dependencia aún no está integrada
        set_estado(tid, estado="bloqueada", ...)
        pendientes.pop(tid)
        hechas.add(tid)                 # ← la da por TERMINADA, para siempre

`hechas` es el conjunto de las que ya no se vuelven a mirar. Así que bastaba
que una dependencia fuera un minuto más lenta para que la tarea que la esperaba
muriera en el sitio, aunque la dependencia se integrara justo después. Medido
esta noche: SA3, ID2, CU2 y CU3 seguían «bloqueadas» con SA1, SA2, ID1 y CU1 ya
en `commit`. Cuatro tareas listas y nadie que las cogiera, mientras el enjambre
se quedaba sin trabajo teniendo trabajo.

LA DISTINCIÓN QUE FALTABA
-------------------------
No todas las dependencias sin integrar son iguales:

  · una que sigue viva (en curso, pendiente, reintentándose) es una ESPERA —
    la tarea se queda en la cola y se vuelve a mirar en la siguiente vuelta;
  · una que ya no va a cambiar (rechazada, bloqueante, bloqueada) es un
    BLOQUEO de verdad — ahí sí hay que parar y decirlo.

Y hay un tercer caso que hay que cerrar o el enjambre se queda esperando a
nadie: si NADIE está trabajando y todo lo que queda son esperas, la espera ya
no puede resolverse sola. Entonces es bloqueo.

Todo aquí es puro: estados de texto, sin disco ni reloj.
"""

#: Estados de los que una dependencia ya no sale por sí sola.
MUERTOS = ("rechazada", "bloqueante", "bloqueada", "cancelada")

#: Estados que cuentan como dependencia cumplida.
CUMPLIDOS = ("commit", "integrada", "hecho", "hecha")


def cumplida(estado):
    """¿Esta dependencia ya está integrada de verdad?

    «Terminada» no basta: la Ola 264 integró G3 con J1 en «sin_cambios» y G3
    buscó un archivo que nunca llegó a main.
    """
    return (estado or "") in CUMPLIDOS


def veredicto(estados, hay_alguien_trabajando=True):
    """«sigue», «espera» o «bloqueo», a partir de los estados de las dependencias.

    - «sigue»   → todas cumplidas: la tarea puede arrancar.
    - «espera»  → alguna sigue viva; se deja en la cola y se vuelve a mirar.
    - «bloqueo» → alguna está muerta, o nadie trabaja ya y la espera no puede
                  resolverse sola.

    `estados` son los estados de las dependencias, en cualquier orden.
    """
    estados = list(estados or [])
    if all(cumplida(e) for e in estados):
        return "sigue"
    if any((e or "") in MUERTOS for e in estados):
        return "bloqueo"
    return "espera" if hay_alguien_trabajando else "bloqueo"


def motivo(ids, estados, veredicto_dado):
    """La frase para el Mando, que dice la verdad sobre lo que pasa."""
    malas = [
        "%s (%s)" % (i, e or "?")
        for i, e in zip(list(ids or []), list(estados or []))
        if not cumplida(e)
    ]
    if not malas:
        return ""
    if veredicto_dado == "espera":
        return "esperando a que se integre: " + ", ".join(malas)
    return "dependencia no integrada: " + ", ".join(malas)
