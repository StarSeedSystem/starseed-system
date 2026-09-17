# -*- coding: utf-8 -*-
"""La hora al final de cada mensaje de Hermes, pedida por Alex el 2026-09-17.

Un mensaje de Telegram lleva hora, pero la del cliente: si se lee horas después,
o desde otra zona, o se reenvía, se pierde CUÁNDO pasó lo que dice. Y en este
proyecto el «cuándo» es la mitad del dato: «Codex agotado» a las 14:00 y a las
17:00 son dos avisos distintos.

Puro: recibe el texto y la hora, devuelve el texto. Sin reloj dentro para poder
probarlo; el reloj lo pone quien llama.
"""

import time

#: Separador visible pero discreto. Va en su propia línea para no romper el
#: Markdown del cuerpo (un «*» al final de una línea en negrita lo rompería).
FORMATO = "\n\n· %s"


def hora_local(epoch=None):
    """«HH:MM» en hora local de la máquina, que es la de Alex."""
    return time.strftime("%H:%M", time.localtime(epoch if epoch is not None else time.time()))


def ya_lleva_hora(texto):
    """¿Termina ya con una marca «· HH:MM»? Así un reintento no la duplica."""
    t = (texto or "").rstrip()
    if len(t) < 7:
        return False
    cola = t[-7:]
    return cola[:2] == "· " and cola[4] == ":" and cola[2:4].isdigit() and cola[5:7].isdigit()


def con_hora(texto, epoch=None):
    """El mismo texto con la hora al final, una sola vez."""
    t = (texto or "").rstrip()
    if not t or ya_lleva_hora(t):
        return t
    return t + FORMATO % hora_local(epoch)
