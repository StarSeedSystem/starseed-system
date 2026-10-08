#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Renovador de capas Astraura. Consulta Hugging Face, compara con config/capas-astraura.json
y gestiona espejo y estado para Genesis.
"""
from __future__ import annotations
import argparse
import json
import hashlib
import os
from pathlib import Path
from datetime import datetime
from typing import Callable, Dict, List

CONFIG_PATH = Path(__file__).parents[2] / "config" / "capas-astraura.json"
ESTADO_PATH = Path(os.path.expanduser("~/.starseed/capas-estado.json"))
ESPEJO_DIR = Path(os.environ.get("CAPAS_ESPEJO_DIR", os.path.expanduser("~/.starseed/espejo/capas")))

HF_BASE = "https://huggingface.co/api"

def cargar_config() -> Dict:
    with CONFIG_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)

def guardar_estado(estado: Dict) -> None:
    ESTADO_PATH.parent.mkdir(parents=True, exist_ok=True)
    with ESTADO_PATH.open("w", encoding="utf-8") as f:
        json.dump(estado, f, ensure_ascii=False, indent=2)

def fetch_json(url: str, getter: Callable[[str], object] | None = None) -> object:
    import urllib.request
    if getter:
        data = getter(url)
        if isinstance(data, bytes):
            return json.loads(data.decode("utf-8"))
        return data
    with urllib.request.urlopen(url) as resp:
        return json.loads(resp.read().decode("utf-8"))

def sha256_stream(url: str, dest: Path, getter: Callable[[str], bytes] | None = None) -> str:
    import urllib.request
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    h = hashlib.sha256()
    if getter:
        data = getter(url)
        with tmp.open("wb") as f:
            f.write(data)
        h.update(data)
    else:
        with urllib.request.urlopen(url) as resp, tmp.open("wb") as f:
            while True:
                chunk = resp.read(8192)
                if not chunk:
                    break
                f.write(chunk)
                h.update(chunk)
    tmp.replace(dest)
    return h.hexdigest()

def detectar_nuevas(config: Dict, getter: Callable[[str], Dict] | None = None) -> List[Dict]:
    import fnmatch
    familias = [
        ("Cactus-Compute", "needle*"),
        ("prism-ml", "*"),
        ("microsoft", "BitNet*"),
        ("onnx-community", "*Bonsai*"),
    ]
    existentes = {c["fuente_oficial"] for c in config.get("capas", [])}
    nuevas = []
    for autor, patron in familias:
        url = f"{HF_BASE}/models?author={autor}&limit=100"
        try:
            modelos = fetch_json(url, getter) if getter else fetch_json(url)
            if not isinstance(modelos, list):
                continue
        except Exception:
            continue
        for m in modelos:
            repo = m.get("id")
            if not repo or not fnmatch.fnmatch(repo, f"{autor}/{patron.lstrip('*')}*"):
                # filtro simple por autor y patrón
                if not repo.startswith(f"{autor}/"):
                    continue
                if patron != "*" and not fnmatch.fnmatch(repo.split("/",1)[1], patron):
                    continue
            fuente = f"https://huggingface.co/{repo}"
            if fuente in existentes:
                continue
            # detalle
            try:
                detalle = fetch_json(f"{HF_BASE}/models/{repo}", getter)
                last = detalle.get("lastModified") or ""
            except Exception:
                last = ""
            nuevas.append({"repo": repo, "fuente_oficial": fuente, "lastModified": last, "estado": "en-banco"})
    return nuevas

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--descargar", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    config = cargar_config()
    nuevas = detectar_nuevas(config)
    estado = {"actualizado": datetime.utcnow().isoformat(), "nuevas": nuevas}
    if args.descargar:
        # ejemplo simple: descargar un archivo placeholder por repo
        for n in nuevas:
            repo = n["repo"]
            dest = ESPEJO_DIR / repo.replace("/", "_") / "model.bin"
            # URL de ejemplo, en producción sería el archivo real
            url = f"https://huggingface.co/{repo}/resolve/main/model.bin"
            try:
                sha = sha256_stream(url, dest)
                n["sha256"] = sha
                n["espejo"] = str(dest)
            except Exception:
                n["error"] = "descarga fallida"
    if args.json:
        guardar_estado(estado)

if __name__ == "__main__":
    main()
