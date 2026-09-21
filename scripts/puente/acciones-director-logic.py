#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Lógica PURA del director de acciones de Alex: sin red, sin disco, sin procesos.

El director de acciones (`director-acciones.py`) ejecuta cada 10 minutos
`acciones-de-alex.py`, compara la lista nueva con la anterior y avisa al canal
cuando algo CAMBIA. Toda la decisión de «qué es una novedad» vive aquí, para que
su puente la pueda medir sin efectos (mismo patrón que los demás módulos de
`scripts/puente`).

Exporta:
  · ids(acciones) -> set[str]
  · novedades(antes, ahora) -> {nuevas: [...], resueltas: [...]}
  · para_anunciar(novedades, avisados) -> [(accion, "nueva"|"resuelta")]
"""

import copy


def ids(acciones):
    """Los id de una lista de acciones, sin importar el resto de cada dict."""
    return {str(a.get("id") or "") for a in (acciones or []) if a.get("id")}


def novedades(antes, ahora):
    """Qué cambió entre dos listas de acciones, comparando SOLO por id.

    Una acción que cambia de urgencia pero no de id NO es nueva: es la misma
    acción, con las mismas razones. El id es lo único que identifica una acción
    de Alex; el resto es detalle y no transforma una acción en otra.

    Devuelve {nuevas: [dict de ahora], resueltas: [dict de antes]}, sin
    reordenar: el director las pinta por urgencia.
    """
    antes, ahora = list(antes or []), list(ahora or [])
    por_id_antes = {str(a.get("id")): a for a in antes if a.get("id")}
    por_id_ahora = {str(a.get("id")): a for a in ahora if a.get("id")}

    nuevas = [
        copy.deepcopy(por_id_ahora[i]) for i in por_id_ahora if i not in por_id_antes
    ]
    resueltas = [
        copy.deepcopy(por_id_antes[i]) for i in por_id_antes if i not in por_id_ahora
    ]
    return {"nuevas": nuevas, "resueltas": resueltas}


def para_anunciar(novedades, avisados):
    """Lo que el director SÍ dice en el canal, descartando lo ya dicho.

    `avisados` es el conjunto de id que ya anunciamos (como nueva o como
    resuelta). Una acción que lleva ahí desde el principio no se vuelve a
    decir: Alex said que Telegram es solo para avisos importantes, y una lista
    que se repite cada diez minutos deja de leerse en dos días.
    """
    avisados = set(avisados or [])
    out = []
    for a in novedades.get("nuevas") or []:
        if str(a.get("id")) not in avisados:
            out.append((a, "nueva"))
    for a in novedades.get("resueltas") or []:
        if str(a.get("id")) not in avisados:
            out.append((a, "resuelta"))
    return out
