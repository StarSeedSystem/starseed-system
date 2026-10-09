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
from typing import Callable, Dict, List, Tuple, Optional

CONFIG_PATH = Path(__file__).parents[2] / "config" / "capas-astraura.json"
ESTADO_PATH = Path(os.path.expanduser("~/.starseed/capas-estado.json"))
ESPEJO_DIR = Path(os.environ.get("CAPAS_ESPEJO_DIR", os.path.expanduser("~/.starseed/espejo/capas")))

HF_BASE = "https://huggingface.co/api"

def elegir_archivo(capa: Dict, arbol: List[Dict]) -> Optional[Tuple[str, str, int]]:
    """
    Elegir archivo del árbol del repo para una capa dada.
    
    Returns: (path, sha256, size) o None si no se puede determinar (ambigüedad).
    """
    archivo = capa.get("archivo")
    if archivo:
        return (archivo, capa.get("sha256", ""), capa.get("tamano_bytes", 0))
    
    formato = capa.get("formato", "").lower()
    candidatos: List[Dict] = []
    
    for entry in arbol:
        path = entry.get("path", "")
        if not path:
            continue
        
        nombre_archivo = Path(path).name
        extension = Path(nombre_archivo).suffix.lower()
        
        if formato == "cact" and extension == ".cact":
            candidatos.append((entry, nombre_archivo, extension))
        elif formato == "gguf" and extension == ".gguf":
            candidatos.append((entry, nombre_archivo, extension))
        elif formato == "onnx" and extension == ".onnx":
            candidatos.append((entry, nombre_archivo, extension))
        elif formato == "cact" and (extension == ".gguf" or extension == ".onnx" or extension == ".safetensors"):
            candidatos.append((entry, nombre_archivo, extension))
    
    if not candidatos:
        return None
    
    if len(candidatos) == 1:
        entry, nombre_archivo, extension = candidatos[0]
        sha256_archivo = entry.get("oid") or entry.get("lfs", {}).get("oid") if isinstance(entry.get("lfs"), dict) else None
        size = entry.get("size", 0)
        return (f"{nombre_archivo}", sha256_archivo or "", size)
    
    ggufs = [(e, n, ext) for e, n, ext in candidatos if ext == ".gguf"]
    if ggufs:
        if len(ggufs) == 1:
            entry, nombre_archivo, extension = ggufs[0]
            sha256_archivo = entry.get("oid") or entry.get("lfs", {}).get("oid") if isinstance(entry.get("lfs"), dict) else None
            size = entry.get("size", 0)
            return (f"{nombre_archivo}", sha256_archivo or "", size)
        
        i2s = [(e, n, ext) for e, n, ext in ggufs if "i2_s" in n]
        if len(i2s) == 1:
            entry, nombre_archivo, extension = i2s[0]
            sha256_archivo = entry.get("oid") or entry.get("lfs", {}).get("oid") if isinstance(entry.get("lfs"), dict) else None
            size = entry.get("size", 0)
            return (f"{nombre_archivo}", sha256_archivo or "", size)
        
        q4 = [(e, n, ext) for e, n, ext in ggufs if "q4" in n]
        if len(q4) == 1:
            entry, nombre_archivo, extension = q4[0]
            sha256_archivo = entry.get("oid") or entry.get("lfs", {}).get("oid") if isinstance(entry.get("lfs"), dict) else None
            size = entry.get("size", 0)
            return (f"{nombre_archivo}", sha256_archivo or "", size)
    
    return None
    
    if len(candidatos) == 1:
        entry, nombre_archivo, extension = candidatos[0]
        lfs_oid = entry.get("lfs", {}).get("oid") if isinstance(entry.get("lfs"), dict) else entry.get("lfs_oid")
        size = entry.get("size", 0)
        return (f"{nombre_archivo}", lfs_oid or "", size)
    
    ggufs = [(e, n, ext) for e, n, ext in candidatos if ext == ".gguf"]
    if ggufs:
        if len(ggufs) == 1:
            entry, nombre_archivo, extension = ggufs[0]
            lfs_oid = entry.get("lfs", {}).get("oid") if isinstance(entry.get("lfs"), dict) else entry.get("lfs_oid")
            size = entry.get("size", 0)
            return (f"{nombre_archivo}", lfs_oid or "", size)
        
        i2s = [(e, n, ext) for e, n, ext in ggufs if "i2_s" in n]
        if len(i2s) == 1:
            entry, nombre_archivo, extension = i2s[0]
            lfs_oid = entry.get("lfs", {}).get("oid") if isinstance(entry.get("lfs"), dict) else entry.get("lfs_oid")
            size = entry.get("size", 0)
            return (f"{nombre_archivo}", lfs_oid or "", size)
        
        q4 = [(e, n, ext) for e, n, ext in ggufs if "q4" in n]
        if len(q4) == 1:
            entry, nombre_archivo, extension = q4[0]
            lfs_oid = entry.get("lfs", {}).get("oid") if isinstance(entry.get("lfs"), dict) else entry.get("lfs_oid")
            size = entry.get("size", 0)
            return (f"{nombre_archivo}", lfs_oid or "", size)
    
    return None


def cargar_config() -> Dict:
    with CONFIG_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)

def verificar_capas(config: Dict, getter: Callable[[str], object] | None = None) -> Tuple[Dict, List[str]]:
    """
    Verificar capas con SHA por-verificar / por-verificar contra Hugging Face.
    
    Returns: (config_nueva, informe) donde informe es una línea por capa.
    Nunca lanza.
    """
    informe: List[str] = []
    capas = config.get("capas", [])
    config_nueva = dict(config)
    config_nueva["capas"] = []
    
    def get_json(url: str) -> object:
        if getter:
            return getter(url)
        return fetch_json(url)
    
    for capa in capas:
        sha256 = capa.get("sha256", "")
        if sha256 not in ("", "por-verificar"):
            config_nueva["capas"].append(capa)
            informe.append(f"{capa['id']}: verificada")
            continue
        
        repo = capa.get("fuente_oficial", "")
        if not repo or not repo.startswith("https://huggingface.co/"):
            config_nueva["capas"].append(capa)
            informe.append(f"{capa['id']}: sin-red")
            continue
        
        nombre_repo = repo[19:]
        arbol_url = f"{HF_BASE}/models/{nombre_repo}/tree/main?recursive=1"
        
        try:
            arbol = get_json(arbol_url)
        except Exception:
            config_nueva["capas"].append(capa)
            informe.append(f"{capa['id']}: sin-red")
            continue
        
        if not isinstance(arbol, list):
            config_nueva["capas"].append(capa)
            informe.append(f"{capa['id']}: sin-red")
            continue
        
        archivo_sel = elegir_archivo(capa, arbol)
        if not archivo_sel:
            formato_ext = f".{capa.get('formato', '').lower()}"
            candidatos_paths = [
                entry.get("path", "") for entry in arbol
                if entry.get("oid") and entry.get("path", "").endswith(formato_ext)
            ]
            info = " y ".join(candidatos_paths[:3]) if candidatos_paths else "desconocido"
            config_nueva["capas"].append(capa)
            informe.append(f"{capa['id']}: ambigua (candidatos: {info})")
            continue
        
        path_archivo, sha256_archivo, size_archivo = archivo_sel
        
        nueva_capa = dict(capa)
        nueva_capa["archivo"] = path_archivo
        nueva_capa["sha256"] = sha256_archivo
        nueva_capa["tamano_bytes"] = size_archivo
        nueva_capa["verificado"] = datetime.utcnow().isoformat()[:10]
        config_nueva["capas"].append(nueva_capa)
        informe.append(f"{capa['id']}: verificada")
    
    return (config_nueva, informe)


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
    parser.add_argument("--verificar", action="store_true")
    parser.add_argument("--escribir", action="store_true")
    args = parser.parse_args()
    
    if args.verificar:
        config = cargar_config()
        config_nueva, informe = verificar_capas(config)
        for linea in informe:
            print(linea)
        if args.escribir:
            tmp = CONFIG_PATH.with_suffix(CONFIG_PATH.suffix + ".tmp")
            with tmp.open("w", encoding="utf-8") as f:
                json.dump(config_nueva, f, ensure_ascii=False, indent=1)
            tmp.replace(CONFIG_PATH)
        return
    
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
