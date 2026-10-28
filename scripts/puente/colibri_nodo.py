# -*- coding: utf-8 -*-
"""Colibri en las capas de Astraura (CLB1027E): qué modelos caben en esta neurona y cómo se instalarían.
Puro salvo main: nada se descarga ni se ejecuta NUNCA (contrato architecture/colibri-multicapas.md);
instalar SIEMPRE necesita el visto bueno. Datos: config/capas-colibri-1027.json; puerto 127.0.0.1:4480 (el 8000 es de Astraura 1.58). Órdenes como LISTAS de argumentos, nunca strings de shell.
"""
from __future__ import annotations

import json
import os
import shutil
import sys
from pathlib import Path
from typing import Any

RAIZ = Path(__file__).resolve().parents[2]
CATALOGO = RAIZ / "config" / "capas-colibri-1027.json"
REPO_COLIBRI = "https://github.com/JustVugg/colibri"
ETIQUETA = "v2.0.0"
PUERTO_STARSEED = 4480
# Margen medido en el A1 (orquestación §10): 3 trabajadores + BitNet + el OS piden ~4,5 GB sobre
# la RAM recomendada de cada modelo. En una neurona DEDICADA a Colibri quien llama pasa margen_gb=0.
MARGEN_SISTEMA_GB = 4.5
CARPETA_DEFECTO = str(Path.home() / "Colibri-modelos")
#: La ruta que da por hecha `deploy/oracle/nodo/systemd/starseed-colibri.service`: de ese
#: checkout sale su `c/coli`. No es `colibri-modelos`: el motor y los pesos viven aparte.
REPO_EN_A1 = "/home/starseed/colibri"
#: Los modelos de DECISIÓN no están en el catálogo de `coli setup`: se bajan de Hugging Face
#: y se compilan a mano, según docs/laya.md y docs/gliner_decide.md de Colibri v2.0.0.
DESCARGAS: dict[str, dict[str, Any]] = {
    "colibri-laya": {
        "carpeta": "laya",
        "repo_hf": "convaiinnovations/laya",
        "ficheros": ["model.safetensors", "rl_agent_config.json", "encoder/*", "tokenizer/*"],
        "compila": "laya",
    },
    "colibri-gliner-decide": {
        "carpeta": "GLiNER2.5-Decide",
        "repo_hf": "fastino/GLiNER2.5-Decide",
        "ficheros": ["model.safetensors", "config.json", "encoder_config/*", "tokenizer.json",
                     "tokenizer_config.json", "special_tokens_map.json"],
        "compila": "gliner_decide",
    },
}
#: `start-here.sh` es `coli setup` y solo conoce los ids de SU catálogo (`c/setup_catalog.py`),
#: sin el prefijo `colibri-` de StarSeed. Laya y GLiNER2.5-Decide no están ahí.
MAPA_CHAT = {
    "colibri-qwen36-35b": "qwen36-35b",
    "colibri-qwen3-coder-30b": "qwen3-coder-30b",
    "colibri-deepseek-v4-flash-reap": "deepseek-v4-flash-reap",
    "colibri-qwen38-flash-next": "qwen38-flash-next",
    "colibri-glm-5.2": "glm-5.2",
}


def entradas() -> list[dict[str, Any]]:
    """Las entradas verificadas del catálogo, en su orden."""
    return json.loads(CATALOGO.read_text(encoding="utf-8"))["entradas"]


def _g(x: float) -> str:
    return f"{round(x, 2):g}".replace(".", ",")


def _veredicto(e: dict[str, Any], ram: float, disco: float, margen: float) -> tuple[str, str]:
    """Veredicto de una entrada con su porqué: disco primero, RAM mínima después."""
    d, rmin, rok = e["disco_gb"], e["ram_min_gb"], e["ram_ok_gb"]
    descarga = e.get("descarga_gb")
    if disco < d:
        extra = f"; la descarga temporal pide {_g(descarga)} GB" if descarga and disco < descarga else ""
        return "no cabe", f"disco insuficiente: {_g(d)} GB frente a {_g(disco)} GB libres{extra}"
    if ram < rmin:
        return "no cabe", f"RAM insuficiente: pide mínimo {_g(rmin)} GB y el medio tiene {_g(ram)} GB"
    if ram < rok + margen and e.get("streaming_disco"):
        return ("cabe en streaming (disco rápido)",
            f"con {_g(ram)} GB lee los expertos del disco ({_g(d)} GB densificables con {_g(rmin)} GB de RAM); "
            f"ideal {_g(rok)} GB, rinde menos")
    if ram < rok + margen:
        return ("no cabe", f"sin margen: {_g(ram)} GB frente a {_g(rok + margen)} GB "
            f"({_g(rok)} GB recomendados más {_g(margen)} GB del resto del sistema)")
    return "cabe", f"{_g(d)} GB de disco y {_g(rok)} GB de RAM recomendados con margen en {_g(ram)} GB"


def caben(lista: list[dict[str, Any]], ram_gb: float, disco_libre_gb: float,
          presion_alta: bool = False, margen_gb: float = MARGEN_SISTEMA_GB) -> list[dict[str, Any]]:
    """Por cada entrada: «cabe» / «cabe en streaming (disco rápido)» / «no cabe», con el porqué."""
    filas = []
    for e in lista:
        if presion_alta:
            veredicto, porque = "no cabe", f"presión de memoria alta con {_g(ram_gb)} GB: ningún modelo de Colibri tiene margen"
        else:
            veredicto, porque = _veredicto(e, ram_gb, disco_libre_gb, margen_gb)
        filas.append({"id": e["id"], "capa": e["capa"], "veredicto": veredicto, "porque": porque})
    return filas


def _paso(porque: str, args: list[str]) -> dict[str, Any]:
    return {"porque": porque, "args": args}


def _clon() -> dict[str, Any]:
    """El checkout, en la ruta exacta que da por hecha la unidad systemd del A1."""
    return _paso(f"clona el motor Apache-2.0 en su etiqueta verificada {ETIQUETA}, en la ruta "
                 f"que pide starseed-colibri.service",
                 ["git", "clone", "--depth", "1", "--branch", ETIQUETA, REPO_COLIBRI, REPO_EN_A1])


def _cliente_hf() -> dict[str, Any]:
    """`hf` viene con huggingface_hub[cli]; pip no reinstala lo que ya está."""
    return _paso("deja instalado el cliente «hf» (si ya está, pip no hace nada)",
                 ["python3", "-m", "pip", "install", "--user", "huggingface_hub[cli]"])


def _descarga(definicion: dict[str, Any], carpeta: str) -> list[dict[str, Any]]:
    """Baja los pesos de decisión, compila su variante y saca la huella del archivo grande."""
    destino = f"{carpeta}/{definicion['carpeta']}"
    return [
        _paso(f"descarga los pesos de {definicion['repo_hf']} en {destino} (solo los baja)",
              ["hf", "download", definicion["repo_hf"], *definicion["ficheros"],
               "--local-dir", destino]),
        _paso(f"compila la variante «{definicion['compila']}» del motor en el checkout",
              ["make", "-C", "c", definicion["compila"]]),
        _paso("anota la huella SHA-256 de los pesos descargados",
              ["sha256sum", f"{destino}/model.safetensors"]),
    ]


def _chat(id_colibri: str, carpeta: str) -> dict[str, Any]:
    """Prepara un modelo del catálogo de Colibri sin servirlo: lo sirve la unidad."""
    return _paso(f"prepara «{id_colibri}» en {carpeta} sin arrancarlo ni abrir el navegador",
                 ["./start-here.sh", "--model", id_colibri, "--dir", carpeta,
                  "--yes", "--no-gpu", "--no-start", "--no-browser"])


def plan_instalacion(id_modelo: str, carpeta: str) -> list[dict[str, Any]]:
    """Las órdenes para instalar `id_modelo` en `carpeta`, como LISTAS de argumentos, sin ejecutar.

    Sigue lo que dice Colibri v2.0.0: `start-here.sh` es `coli setup` y solo acepta los ids de SU
    catálogo (sin el prefijo `colibri-`); Laya y GLiNER2.5-Decide se bajan de Hugging Face y se
    compilan aparte. Ningún paso sirve el modelo: eso es de `starseed-colibri.service`."""
    ids = {e["id"] for e in entradas()}
    if id_modelo not in ids:
        raise ValueError(f"id desconocido «{id_modelo}»: no está en config/capas-colibri-1027.json")
    if id_modelo == "colibri-clef":
        raise ValueError("«colibri-clef» no cabe en esta neurona: pide 52 GB de disco y 55 GB de RAM")
    if id_modelo in DESCARGAS:
        return [_clon(), _cliente_hf(), *_descarga(DESCARGAS[id_modelo], carpeta)]
    if id_modelo in MAPA_CHAT:
        return [_clon(), _cliente_hf(), _chat(MAPA_CHAT[id_modelo], carpeta)]
    raise ValueError(f"«{id_modelo}» no está en el catálogo de setup de Colibri: se instala a mano")


def medir_maquina() -> tuple[float, float, bool]:
    """RAM total y disco libre de esta máquina en GB; presión si la memoria disponible es poca cosa."""
    ram = os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES") / 2**30
    disco = shutil.disk_usage(str(RAIZ)).free / 2**30
    proc, disponible = Path("/proc/meminfo"), 0.0
    for linea in proc.read_text(encoding="utf-8").splitlines() if proc.is_file() else []:
        if linea.startswith("MemAvailable:"):
            disponible = float(linea.split()[1]) / 2**20  # kB → GB
            break
    return ram, disco, disponible < 1.5 if disponible else False


def _plan_maquina(carpeta: str) -> None:
    ram, disco, presion = medir_maquina()
    print(f"Esta máquina: RAM {_g(ram)} GB · disco libre {_g(disco)} GB · presión de memoria: {'sí' if presion else 'no'}")
    filas = caben(entradas(), ram, disco, presion)
    for fila in filas:
        print(f"[{fila['capa']}] {fila['id']}: {fila['veredicto']} — {fila['porque']}")
    for fila in (f for f in filas if f["veredicto"] == "cabe"):
        print(f"\nPlan de instalación de {fila['id']} en {carpeta} (listas de argumentos, sin ejecutar):")
        try:
            pasos = plan_instalacion(fila["id"], carpeta)
        except ValueError as exc:
            print(f"  · {exc}")
            continue
        for paso in pasos:
            print(f"  · {paso['porque']}: {' '.join(paso['args'])}")
    print("\nNada de esto se descarga ni se ejecuta: instalar necesita SIEMPRE el visto bueno.")


def main(argv: list[str]) -> int:
    if "--plan" not in argv:
        print("uso: python3 scripts/puente/colibri_nodo.py --plan [--carpeta <carpeta>]")
        print("  qué modelos de Colibri caben en esta máquina y cómo se instalarían (sin ejecutar nada).")
        return 2
    indice = argv.index("--carpeta") if "--carpeta" in argv else -1
    _plan_maquina(argv[indice + 1] if 0 <= indice < len(argv) - 1 else CARPETA_DEFECTO)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
