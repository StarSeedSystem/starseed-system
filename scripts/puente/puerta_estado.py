#!/usr/bin/env python3
"""Estado de la puerta de integración (MED1111E) · lo que Genesis lee sin adivinar.

La puerta (`~/.starseed/opus1031/aplicar-*.py`, del supervisor) fusiona las ramas de los agentes en main, corre
las pruebas, el tsc y la comprobación del service worker, y deshace la fusión si algo sale rojo. Su único rastro
era un log libre. Este módulo escribe en cada paso `~/.starseed/produccion/puerta-estado.json`, que lee
`src/lib/mando/puerta-integracion.ts` (si falta, Genesis cae al `aplicar-*.log` más nuevo).

Campos (todos opcionales salvo `paso` y `resultado`):
  nombre      nombre corto de la puerta («1111e»)
  ramas       lista de ramas que integra
  base        commit de partida (hasta 10 caracteres)
  paso        esperando | integrando | pruebas | tipos | final | terminado
  inicio      ISO 8601, cuando arrancó
  actualizado ISO 8601, cuando empezó el paso actual (Genesis lo usa como «lleva N min en este paso»)
  fin         ISO 8601, cuando terminó (solo con resultado verde o rojo)
  resultado   en_curso | verde | rojo
  pruebas     {archivos, pruebas, falladas, omitidas}
  fallo       una frase corta (sin rutas) si el resultado es rojo

NUNCA rompe la puerta: toda función devuelve False en vez de lanzar si no pudo escribir.
Uso desde la puerta (Python):  pe.iniciar("1111e", PICKS, BASE); pe.paso("pruebas"); pe.cerrar("verde")
Uso por línea de órdenes:      python3 puerta_estado.py paso pruebas
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime
from typing import Any, Dict, Iterable, Optional

PASOS = ("esperando", "integrando", "pruebas", "tipos", "final", "terminado")
RESULTADOS = ("en_curso", "verde", "rojo")


def ruta_estado(ruta: Optional[str] = None) -> str:
    """`ruta` explícita (pruebas) > STARSEED_PUERTA_ESTADO > ~/.starseed/produccion/puerta-estado.json."""
    return ruta or os.environ.get("STARSEED_PUERTA_ESTADO") or os.path.join(
        os.path.expanduser("~"), ".starseed", "produccion", "puerta-estado.json")


def _ahora(ahora: Optional[datetime]) -> str:
    return (ahora or datetime.now().astimezone()).isoformat()


def leer(ruta: Optional[str] = None) -> Dict[str, Any]:
    try:
        with open(ruta_estado(ruta), encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def _guardar(datos: Dict[str, Any], ruta: Optional[str]) -> bool:
    destino = ruta_estado(ruta)
    try:
        os.makedirs(os.path.dirname(destino), exist_ok=True)
        tmp = destino + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False, indent=1)
        os.replace(tmp, destino)
        return True
    except OSError:
        return False


def _sin_rutas(texto: Any, tope: int = 240) -> str:
    """Una frase sin rutas absolutas del disco ni saltos de línea."""
    t = re.sub(r"(?:[A-Za-z]:\\|/(?:Users|home|tmp|var|private|mnt|opt|root)/)[^\s\"')\]]*", "[ruta]", str(texto or ""))
    return re.sub(r"\s+", " ", t).strip()[:tope]


def iniciar(nombre: str, ramas: Iterable[str], base: str = "", ruta: Optional[str] = None,
            ahora: Optional[datetime] = None) -> bool:
    """Una puerta nueva: sustituye el estado anterior (el log sigue guardando la historia)."""
    t = _ahora(ahora)
    return _guardar({
        "nombre": _sin_rutas(nombre, 40), "ramas": [str(r)[:80] for r in list(ramas)[:20]],
        "base": str(base)[:10], "paso": "esperando", "inicio": t, "actualizado": t, "fin": None,
        "resultado": "en_curso",
    }, ruta)


def paso(nuevo: str, ruta: Optional[str] = None, ahora: Optional[datetime] = None) -> bool:
    """Entra en un paso. `actualizado` es el momento en que empezó: Genesis calcula de ahí «lleva N min»."""
    if nuevo not in PASOS:
        return False
    d = leer(ruta)
    if not d:
        return False
    d.update(paso=nuevo, actualizado=_ahora(ahora))
    return _guardar(d, ruta)


def contar_vitest(salida: str) -> Dict[str, int]:
    """De las líneas `Test Files  939 passed (939)` y `Tests  10673 passed | 13 skipped (10686)` a cuentas."""
    def num(patron: str, texto: str) -> int:
        m = re.search(patron, texto)
        return int(m.group(1)) if m else 0
    archivos = next((l for l in salida.splitlines() if "Test Files" in l), "")
    tests = next((l for l in salida.splitlines() if re.search(r"\bTests\b", l) and "Test Files" not in l), "")
    return {
        "archivos": num(r"\((\d+)\)", archivos) or num(r"(\d+) passed", archivos),
        "pruebas": num(r"(\d+) passed", tests),
        "falladas": num(r"(\d+) failed", tests) or num(r"(\d+) failed", archivos),
        "omitidas": num(r"(\d+) skipped", tests),
    }


def pruebas(cuentas: Dict[str, int], ruta: Optional[str] = None) -> bool:
    """Anota las cuentas de vitest (`contar_vitest(salida)` o un dict con las mismas claves)."""
    d = leer(ruta)
    if not d:
        return False
    d["pruebas"] = {k: int(cuentas.get(k, 0) or 0) for k in ("archivos", "pruebas", "falladas", "omitidas")}
    return _guardar(d, ruta)


def cerrar(resultado: str, fallo: str = "", ruta: Optional[str] = None, ahora: Optional[datetime] = None) -> bool:
    """La puerta terminó: `verde` o `rojo` (con una frase de fallo corta)."""
    if resultado not in ("verde", "rojo"):
        return False
    d = leer(ruta)
    if not d:
        return False
    t = _ahora(ahora)
    d.update(paso="terminado", resultado=resultado, fin=t, actualizado=t)
    if fallo:
        d["fallo"] = _sin_rutas(fallo)
    else:
        d.pop("fallo", None)
    return _guardar(d, ruta)


def main(argv: Optional[list] = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="orden", required=True)
    i = sub.add_parser("iniciar"); i.add_argument("nombre"); i.add_argument("--ramas", default=""); i.add_argument("--base", default="")
    s = sub.add_parser("paso"); s.add_argument("nuevo", choices=PASOS)
    c = sub.add_parser("cerrar"); c.add_argument("resultado", choices=("verde", "rojo")); c.add_argument("--fallo", default="")
    a = p.parse_args(argv)
    if a.orden == "iniciar":
        ok = iniciar(a.nombre, [r for r in a.ramas.split(",") if r], a.base)
    elif a.orden == "paso":
        ok = paso(a.nuevo)
    else:
        ok = cerrar(a.resultado, a.fallo)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
