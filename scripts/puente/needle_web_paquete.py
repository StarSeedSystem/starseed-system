# -*- coding: utf-8 -*-
"""Construye el paquete web de Needle 3 y anota sus SHA en el catálogo.

(CONTRATO: architecture/capas-autoadaptables.md §1, §6 y §9, tarea CPA1007E).

Con el CLI oficial `needle` instalado en la Mac (repo Cactus-Compute/needle3),
construye `needle.js` + `needle.wasm` y descarga los pesos `needle3.cact`,
calcula los SHA-256 de cada archivo y actualiza la entrada `needle3-reflejo`
de `config/capas-astraura.json` (sha256 de los pesos + mapa `archivos`).

Nada sube a la red y los binarios NO van al repo: quedan en
`.transfer/capas/needle-web/` para que el espejo los recoja.

La lógica es pura e inyectable: todas las pruebas usan un CLI falso.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
from typing import Callable, Optional

ARCHIVOS_PAQUETE = ("needle.js", "needle.wasm", "needle3.cact")
ID_CAPA = "needle3-reflejo"
CMD_BUILD = ["build", "--platform", "web", "--out"]
CMD_PESOS = ["weights", "--out"]

Ejecutar = Callable[[list], None]


def sha256_de(ruta: str) -> str:
    """SHA-256 de un archivo en hexadecimal."""
    resumen = hashlib.sha256()
    with open(ruta, "rb") as f:
        for bloque in iter(lambda: f.read(1 << 20), b""):
            resumen.update(bloque)
    return resumen.hexdigest()


def construir_paquete(destino: str, cli: str = "needle",
                      ejecutar: Optional[Ejecutar] = None) -> dict:
    """Corre el CLI y deja el paquete en `destino`. Devuelve ruta → SHA-256.

    Lanza RuntimeError si falta el CLI o algún archivo del paquete; en ese
    caso NO se toca el catálogo (una capa sin su SHA no se anota jamás).
    """
    correr = ejecutar or _ejecutar_real

    def disponible() -> bool:
        if ejecutar is not None:
            return True
        return shutil.which(cli) is not None

    if not disponible():
        raise RuntimeError(f"El CLI `{cli}` no está instalado en esta máquina")

    os.makedirs(destino, exist_ok=True)
    correr([cli] + CMD_BUILD + [destino])
    pesos = os.path.join(destino, "needle3.cact")
    if not os.path.exists(pesos):
        correr([cli] + CMD_PESOS + [pesos])

    shas = {}
    for nombre in ARCHIVOS_PAQUETE:
        ruta = os.path.join(destino, nombre)
        if not os.path.exists(ruta):
            raise RuntimeError(
                f"El paquete quedó incompleto: falta {nombre} en {destino}")
        shas[nombre] = sha256_de(ruta)
    return shas


def entrada_catalogo(shas: dict, version: str, fecha: str,
                     fuente_oficial: str) -> dict:
    """Entrada `needle3-reflejo` con el SHA de los pesos y de cada archivo."""
    return {
        "id": ID_CAPA,
        "familia": "Cactus-Compute/needle3",
        "capa": "reflejo",
        "modelo": "Cactus Needle 3",
        "version": version,
        "formato": "cact",
        "runtime": "needle-wasm",
        "parametros": "121 M",
        "disco_mb": 29,
        "ram_min_mb": 256,
        "profundidades": [
            {"capas": 2, "disco_mb": 8},
            {"capas": 6, "disco_mb": 12},
            {"capas": 12, "disco_mb": 20},
            {"capas": 20, "disco_mb": 29},
        ],
        "sha256": shas["needle3.cact"],
        "archivos": dict(shas),
        "fuente_oficial": fuente_oficial,
        "espejos": [],
        "estado": "recomendado",
        "medios": ["web", "pwa", "nativo", "servidor"],
        "paquete_web_verificado": fecha,
    }


def actualizar_catalogo(ruta_json: str, entrada: dict) -> dict:
    """Sustituye o inserta la entrada en el catálogo y lo reescribe."""
    with open(ruta_json, "r", encoding="utf-8") as f:
        catalogo = json.load(f)
    capas = [c for c in catalogo.get("capas", []) if c.get("id") != entrada["id"]]
    capas.insert(0, entrada)
    catalogo["capas"] = capas
    with open(ruta_json, "w", encoding="utf-8") as f:
        json.dump(catalogo, f, ensure_ascii=False, indent=2)
        f.write("\n")
    return catalogo


def _ejecutar_real(args: list) -> None:
    resultado = subprocess.run(args, capture_output=True, text=True)
    if resultado.returncode != 0:
        raise RuntimeError(
            f"`{' '.join(args)}` falló ({resultado.returncode}): "
            f"{resultado.stderr.strip()[:200]}")


def main(argv: Optional[list] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--destino", default=".transfer/capas/needle-web",
                        help="Carpeta de salida del paquete (no va al repo)")
    parser.add_argument("--catalogo", default="config/capas-astraura.json")
    parser.add_argument("--cli", default="needle")
    parser.add_argument("--version", default="3.1.2")
    parser.add_argument("--fecha", default="")
    args = parser.parse_args(argv)

    try:
        shas = construir_paquete(args.destino, cli=args.cli)
    except RuntimeError as err:
        print(f"no-disponible: {err}", file=sys.stderr)
        return 1

    fuente = "https://huggingface.co/Cactus-Compute/needle3"
    entrada = entrada_catalogo(shas, args.version, args.fecha or "hoy", fuente)
    actualizar_catalogo(args.catalogo, entrada)
    for nombre, sha in shas.items():
        print(f"{nombre}: {sha}")
    print(f"Catálogo actualizado: {args.catalogo} (id {ID_CAPA})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
