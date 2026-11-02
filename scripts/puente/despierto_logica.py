# -*- coding: utf-8 -*-
"""¿Se queda despierta la neurona al cerrar la tapa? (KAL1101B · «1101 Neuronas despiertas»).

Alex (01-11): «que funcionen los procesos en segundo plano de los dispositivos aun con las
pantallas cerradas o desconectadas…». VERDAD respetada: en un portátil Mac cerrar la tapa DUERME
el sistema aunque haya aserciones de energía (`caffeinate` o keepalive no sirven entonces); solo
no duerme en modo clamshell (corriente + pantalla externa) o con `pmset -a disablesleep 1`
(requiere admin). Si la neurona va a dormir, la colmena pasa sus tareas al A1 con la orden
`desconectar` (ya existente): la neurona se anuncia «se va a dormir» vía `anuncio_de_dormir`.

Todo es PURA: los textos de `pmset -g`, `pmset -g batt` y `pmset -g assertions` (del SO; el
SOP que los llama en vivo va en otra tarea) y el ajuste de `~/.starseed/despierto.json` entran
por argumento. SOP: architecture/metagenesis-autonoma.md
"""
from __future__ import annotations

import re
from typing import Any, Optional

#: Estados de la tapa: la neurona sabe si al cerrarla duerme ('duerme'), queda en clamshell
#: (corriente + pantalla externa), no tiene tapa (sobremesa) o el sueño está desactivado.
TAPAS = ("duerme", "clamshell", "sin-tapa", "desactivada")
#: Umbral de batería (0-1) bajo el que una neurona con tapa que duerme se anuncia: antes,
#: para que el líder pase sus tareas al A1 con margen (la orden llega en el latido).
UMBRAL_BATERIA = 0.25


def desactivada_de(texto_pmset: str) -> bool:
    """PURA. ¿`pmset -g` declara `disablesleep = 1`? (el sueño está desactivado, requiere admin)."""
    return bool(re.search(r"disablesleep\s*(?:=\s*)?1\b", texto_pmset or ""))


def bateria_de(texto_batt: str) -> dict:
    """PURA. `pmset -g batt` a {nivel 0-1, enchufada}; nivel None y enchufada True si no hay batería (sobremesa)."""
    if "InternalBattery" not in (texto_batt or ""):
        return {"nivel": None, "enchufada": True}
    m = re.search(r"(\d{1,3})%", texto_batt)
    nivel = min(1.0, int(m.group(1)) / 100.0) if m else None
    return {"nivel": nivel, "enchufada": "AC Power" in texto_batt}


def herramienta_de(texto_assertions: str, ajuste: dict) -> str:
    """PURA. Qué mantiene el sistema despierto: el ajuste de despierto.json manda; si calla,
    la aserción que se vea (`keepalive` o `caffeinate`); sin ninguna, 'ninguna'."""
    nombrada = str((ajuste or {}).get("herramienta") or "").strip().lower()
    if nombrada:
        return nombrada
    texto = (texto_assertions or "").lower()
    if "keepalive" in texto:
        return "keepalive"
    if "caffeinate" in texto:
        return "caffeinate"
    return "ninguna"


def tapa_de(texto_pmset: str, bateria: dict, ajuste: dict) -> str:
    """PURA. La tapa por orden de verdad: desactivada › sin-tapa (sobremesa) › clamshell (corriente
    + pantalla externa, como declara el ajuste) › duerme (lo demás, aserciones incluidas)."""
    if desactivada_de(texto_pmset):
        return "desactivada"
    declarada = str((ajuste or {}).get("tapa") or "").strip().lower()
    if declarada in TAPAS:
        return declarada
    if not (ajuste or {}).get("portatil", True):
        return "sin-tapa"
    if bateria.get("enchufada") and (ajuste or {}).get("pantalla_externa"):
        return "clamshell"
    return "duerme"


def estado_de(texto_pmset: str, texto_batt: str, texto_assertions: str, ajuste: Any) -> dict:
    """PURA. {'despierta', 'herramienta', 'bateria', 'enchufada', 'tapa'}: lo que dice la neurona.
    Claves exactas del ajuste de `~/.starseed/despierto.json`: herramienta, portatil, pantalla_externa,
    tapa y umbral_bateria."""
    ajuste = ajuste if isinstance(ajuste, dict) else {}
    batt = bateria_de(texto_batt)
    tapa = tapa_de(texto_pmset, batt, ajuste)
    herramienta = herramienta_de(texto_assertions, ajuste)
    # Mientras la tapa está abierta, una aserción activa la mantiene despierta; sin aserción ni
    # tapa suave, ya está dormida. Si 'tapa' es 'duerme' la garantía es frágil: lo cubre el anuncio.
    despierta = tapa != "duerme" or herramienta != "ninguna"
    return {"despierta": despierta, "herramienta": herramienta,
            "bateria": batt.get("nivel"), "enchufada": batt.get("enchufada"), "tapa": tapa}


def anuncio_de_dormir(estado: Any, umbral: float = UMBRAL_BATERIA) -> bool:
    """PURA. «Se va a dormir»: la tapa duerme (las aserciones no la salvan), va a batería y baja del umbral."""
    e = estado if isinstance(estado, dict) else {}
    if e.get("tapa") != "duerme" or e.get("enchufada"):
        return False
    nivel = e.get("bateria")
    return isinstance(nivel, (int, float)) and not isinstance(nivel, bool) and nivel < umbral
