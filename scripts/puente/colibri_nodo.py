# -*- coding: utf-8 -*-
"""Colibri en las capas de Astraura (CLB1027E; plan de CLB1028G según docs/laya.md y docs/gliner_decide.md
de Colibri v2.0.0): qué modelos caben en esta neurona y cómo se instalarían.
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
#: (CLB1028G) La ruta del clon NO sale de `carpeta`: `starseed-colibri.service` da por hecho el motor
#: en /home/starseed/colibri (deploy/oracle/nodo/systemd), así que el clon va SIEMPRE allí.
RUTA_CLON = "/home/starseed/colibri"
#: (CLB1028G) Los modelos de JUICIO no van por `setup`: `c/setup_catalog.py` no los tiene. Según los
#: docs de Colibri v2.0.0 se descargan de Hugging Face y se compilan con `make`.
#: Tupla: (repo de HF, subcarpeta destino, objetivo de make, archivos a descargar).
MODELOS_JUICIO = {
    "colibri-laya": ("convaiinnovations/laya", "laya", "laya",
                     ("model.safetensors", "rl_agent_config.json", "encoder/*", "tokenizer/*")),
    "colibri-gliner-decide": ("fastino/GLiNER2.5-Decide", "GLiNER2.5-Decide", "gliner_decide",
                              ("model.safetensors", "config.json", "encoder_config/*", "tokenizer.json",
                               "tokenizer_config.json", "special_tokens_map.json")),
}
#: (CLB1028G) Los de chat van por `./start-here.sh` (que es `coli setup`), cuyo `--model` pide el id
#: de SU catálogo (c/setup_catalog.py), sin el prefijo `colibri-` de StarSeed: mapa id StarSeed → id Colibri.
MAPA_SETUP = {
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


def _clon() -> dict[str, Any]:
    """Primer paso común: el motor Apache-2.0 en su etiqueta verificada, en la RUTA_CLON de la unidad."""
    return {"porque": f"clona el motor Apache-2.0 en su etiqueta verificada {ETIQUETA}, en la ruta que "
                      "da por hecha starseed-colibri.service",
            "args": ["git", "clone", "--depth", "1", "--branch", ETIQUETA, REPO_COLIBRI, RUTA_CLON]}


def plan_instalacion(id_modelo: str, carpeta: str) -> list[dict[str, Any]]:
    """Las órdenes para instalar `id_modelo` en `carpeta`, como LISTAS de argumentos, sin ejecutar.

    (CLB1028G) Según los docs de Colibri v2.0.0: los de JUICIO (Laya, GLiNER2.5-Decide) se descargan
    con `hf` y se compilan con `make` — `setup` NO los tiene en su catálogo— y los de chat van por
    `./start-here.sh` con el id de Colibri. NINGUNO incluye un paso de «serve»: quien sirve en
    127.0.0.1:4480 es la unidad `starseed-colibri.service` (ya en main). Clef no cabe en esta neurona."""
    ids = {e["id"] for e in entradas()}
    if id_modelo not in ids:
        raise ValueError(f"id desconocido «{id_modelo}»: no está en config/capas-colibri-1027.json")
    if id_modelo == "colibri-clef":
        raise ValueError("no cabe en esta neurona: Clef pide 52 GB de disco y 19-55 GB de RAM "
                         "(config/capas-colibri-1027.json)")
    if id_modelo in MODELOS_JUICIO:
        repo_hf, subcarpeta, objetivo, archivos = MODELOS_JUICIO[id_modelo]
        destino = f"{carpeta}/{subcarpeta}"
        return [
            _clon(),
            {"porque": "si falta hf, instala el cliente de Hugging Face (idempotente)",
             "args": ["python3", "-m", "pip", "install", "--user", "huggingface_hub[cli]"]},
            {"porque": f"descarga el modelo de {repo_hf} en {destino}",
             "args": ["hf", "download", repo_hf, *archivos, "--local-dir", destino]},
            {"porque": f"compila el binario {objetivo} del motor",
             "args": ["make", "-C", "c", objetivo]},
            {"porque": "anota el SHA-256 del model.safetensors descargado (las capas no pasan a «recomendado» sin él)",
             "args": ["sha256sum", f"{destino}/model.safetensors"]},
        ]
    if id_modelo in MAPA_SETUP:
        return [
            _clon(),
            {"porque": f"compila y prepara {MAPA_SETUP[id_modelo]} en la carpeta de la neurona, sin GPU, "
                       "sin arrancar servidor ni abrir navegador: sirve la unidad starseed-colibri.service",
             "args": ["./start-here.sh", "--model", MAPA_SETUP[id_modelo], "--dir", carpeta,
                      "--yes", "--no-gpu", "--no-start", "--no-browser"]},
        ]
    raise ValueError(f"no hay pasos verificados para «{id_modelo}»: su conversión es a mano "
                     "(config/capas-colibri-1027.json)")


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
        except ValueError as e:
            print(f"  · {e}")
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
