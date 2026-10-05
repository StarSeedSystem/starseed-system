"""Reglas puras de verificación de diseño (§4 del contrato director-diseno).

`puntuar(informe, diff_texto)` convierte el JSON de diseno_verificar.mjs y el
diff de la tarea en una nota de 0 a 100 y una lista de arreglos concretos.
Sin disco, sin red, sin procesos: solo entrada -> salida.
"""
from __future__ import annotations

import re
from typing import Any

UMBRAL_DEFECTO = 75

PESOS = {
    "desborde": -20,
    "contraste_bajo": -15,
    "diana_chica": -10,
    "error_consola": -10,
    "fuera_horizontal": -20,
    "hex_suelto": -8,
    "important": -5,
    "zindex_alto": -5,
}

MAX_DESCUENTO_POR_TIPO = -40

RE_HEX = re.compile(r"#[0-9a-fA-F]{6}\b")
RE_IMPORTANT = re.compile(r"!important")
RE_ZINDEX = re.compile(r"z-index\s*:\s*(\d{3,})")
RE_TOKEN = re.compile(r"var\(--[a-zA-Z0-9-]+\)")

_CONTRASTE_MINIMO = 4.5


def _lista(informe: dict[str, Any], clave: str) -> list[Any]:
    valor = informe.get(clave)
    return valor if isinstance(valor, list) else []


def _donde(informe: dict[str, Any]) -> str:
    return f"{informe.get('ruta', '?')} @ {informe.get('tamano', '?')}"


def _aplicar(fallos: list[dict[str, str]], tipo: str, entradas: list[Any],
             arreglo: str) -> int:
    """Un fallo por entrada, con tope de descuento por tipo."""
    if not entradas:
        return 0
    peso = PESOS[tipo]
    total = peso * len(entradas)
    if total < MAX_DESCUENTO_POR_TIPO:
        total = MAX_DESCUENTO_POR_TIPO
    for entrada in entradas:
        fallos.append({"tipo": tipo, "donde": str(entrada), "arreglo": arreglo})
    return total


def _puntuar_diff(diff_texto: str, fallos: list[dict[str, str]]) -> int:
    """Hex sueltos que no son token, `!important` y z-index disparatados."""
    descuento = 0
    if not diff_texto:
        return descuento
    lineas = [l for l in diff_texto.splitlines() if l.startswith("+") and not l.startswith("+++")]
    texto = "\n".join(lineas)
    for coincidencia in RE_HEX.finditer(texto):
        trozo = texto[max(0, coincidencia.start() - 80):coincidencia.end() + 5]
        if RE_TOKEN.search(trozo):
            continue
        fallos.append({
            "tipo": "hex_suelto",
            "donde": coincidencia.group(0).lower(),
            "arreglo": "Usa el token de la identidad (var(--...)) en vez del hex suelto",
        })
        descuento += PESOS["hex_suelto"]
    for _ in RE_IMPORTANT.finditer(texto):
        fallos.append({
            "tipo": "important",
            "donde": "!important",
            "arreglo": "Sube la especificidad del selector en vez de usar !important",
        })
        descuento += PESOS["important"]
    for coincidencia in RE_ZINDEX.finditer(texto):
        if int(coincidencia.group(1)) >= 1000:
            fallos.append({
                "tipo": "zindex_alto",
                "donde": f"z-index: {coincidencia.group(1)}",
                "arreglo": "Acota z-index a la escala del sistema (≤ 100)",
            })
            descuento += PESOS["zindex_alto"]
    return descuento


def puntuar(informe: dict[str, Any], diff_texto: str = "",
            umbral: int = UMBRAL_DEFECTO) -> dict[str, Any]:
    """Nota 0-100 del informe de una pantalla más los fallos del diff."""
    fallos: list[dict[str, str]] = []
    donde = _donde(informe)
    nota = 100
    nota += _aplicar(fallos, "desborde", _lista(informe, "desbordes"),
                     f"{donde}: acorta el texto o permite que crezca/fluya el contenedor")
    nota += _aplicar(fallos, "contraste_bajo", _lista(informe, "contraste_bajo"),
                     f"{donde}: sube el contraste a ≥ {_CONTRASTE_MINIMO}:1 con los tokens de la identidad")
    nota += _aplicar(fallos, "diana_chica", _lista(informe, "dianas_chicas"),
                     f"{donde}: amplía la diana táctil a 44×44 px (padding o hit-area)")
    nota += _aplicar(fallos, "error_consola", _lista(informe, "errores_consola"),
                     f"{donde}: corrige el error de consola antes de integrar")
    fuera = _lista(informe, "fuera_horizontal")
    nota += _aplicar(fallos, "fuera_horizontal", fuera,
                     f"{donde}: el elemento se sale del viewport en horizontal; revisa anchuras fijas")
    nota += _puntuar_diff(diff_texto, fallos)
    nota = max(0, min(100, nota))
    return {"nota": nota, "umbral": umbral, "aprobado": nota >= umbral, "fallos": fallos}
