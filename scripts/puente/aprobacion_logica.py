#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Decisión pura: ¿puede una puerta de visto bueno abrirse SOLA?

Módulo puro (sin red, sin disco, sin procesos) para que su puerta lo pueda medir sin
efectos, igual que `vigilante_logica.py`. Lo usa `director-orquestacion.py`.

El fondo del asunto (2026-09-12). El orquestador anotaba en `progreso.json` una `nota` de
prosa: «rama ola/X (sha) lista · revisión ok», y ese «ok» se escribía con solo que el
revisor **hubiese contestado algo** —`"ok" if rev else "sin revisor"`—, no porque la
revisión fuese buena. El director aprobaba sola cualquier rama cuya `nota` contuviera esa
subcadena. Consecuencia medida en el árbol: `debe_pedir_visto_bueno()` levanta la puerta
también por **alcance incompleto** (`faltan`), con `bloqueante=False`; esa rama traía
«revisión ok» y se integraba en `main` a los diez minutos sin que nadie la mirase — que es
exactamente lo que la Ola 261 puso la puerta para impedir.

Regla del área: **el motivo que levanta una puerta tiene que viajar con ella.** Si el
consumidor no puede leer por qué está cerrada, la abre por la razón equivocada.
"""

# Lo único que se abre solo: la puerta que la cola pide como POLÍTICA (`--aprobacion`),
# donde el visto bueno es un trámite acordado. Un bloqueo confirmado y un alcance
# incompleto son justo aquello para lo que la puerta existe.
MOTIVO_RUTINA = "pedido por la cola"

# Valores de `revisor` que escribe el orquestador. «respondio» NO es «aprobó»: dice que el
# revisor contestó algo. Se nombra así a propósito para que nadie lo vuelva a leer como
# veredicto favorable.
REVISOR_RESPONDIO = "respondio"
REVISOR_BLOQUEANTE = "bloqueante"


def porque_no_verde(entrada):
    """"" si la puerta puede abrirse sola; si no, la razón corta de por qué no.

    Se decide por CAMPOS (`revisor`, `faltan`, `motivo_vb`), nunca por la prosa de `nota`.
    Una entrada sin `revisor` —escrita antes de este cambio— tampoco se aprueba sola: ante
    la duda, la puerta se queda cerrada y lo dice. Cada razón se devuelve redactada para
    que el aviso del canal sirva para decidir; un validador que solo dice «no» enseña a
    saltárselo.
    """
    if not isinstance(entrada, dict):
        return "entrada ilegible"
    revisor = entrada.get("revisor")
    if not revisor:
        return "sin veredicto en campo propio (entrada anterior a este cambio): la mira una persona"
    if revisor == REVISOR_BLOQUEANTE:
        return "la revisión es bloqueante"
    if revisor != REVISOR_RESPONDIO:
        return "no hubo revisor (%s)" % revisor
    faltan = entrada.get("faltan") or []
    if faltan:
        return "alcance incompleto: faltan %s" % ", ".join(str(x) for x in list(faltan)[:6])
    motivo = str(entrada.get("motivo_vb") or "")
    if not motivo.startswith(MOTIVO_RUTINA):
        return "la puerta se levantó por «%s», no por política de la cola" % motivo[:80]
    return ""


def revision_ok(entrada):
    """Verde = no queda ninguna razón para no aprobarla sola."""
    return porque_no_verde(entrada) == ""
