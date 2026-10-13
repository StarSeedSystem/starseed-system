#!/usr/bin/env python3
"""Explorador diario de modelos de imagen para Astraura.

Consulta Hugging Face (modelos text-to-image en tendencia y con más me gusta)
y GitHub (versiones de stable-diffusion.cpp y ComfyUI) para proponer
actualizaciones al catálogo de modelos de imagen.
"""

import json
import os
import sys
import re
from datetime import datetime, timezone
from urllib import request, error
from pathlib import Path

# Constants
HF_API_URL = "https://huggingface.co/api"
GH_API_URL = "https://api.github.com"
MODELS_TS_PATH = Path("src/lib/imagenes/modelos.ts")
PROPOSALS_DIR = Path("../../starseed_memory_root/olas")
TODAY = datetime.now(timezone.utc).strftime("%Y-%m-%d")

def http_get_json(url: str) -> dict | None:
    """Make a GET request and return JSON data or None on error."""
    try:
        req = request.Request(url, headers={"User-Agent": "Astraura-Explorer/1.0"})
        with request.urlopen(req, timeout=30) as response:
            if response.status == 200:
                data = response.read().decode("utf-8")
                return json.loads(data)
            else:
                print(f"HTTP {response.status} for {url}", file=sys.stderr)
                return None
    except error.URLError as e:
        print(f"Error fetching {url}: {e}", file=sys.stderr)
        return None
    except json.JSONDecodeError as e:
        print(f"Error decoding JSON from {url}: {e}", file=sys.stderr)
        return None

def leer_modelos_imagenes() -> list[dict]:
    """Extract model IDs and Hugging Face IDs from modelos.ts."""
    # Due to complexity of parsing TypeScript, we hardcode the list based on the current file.
    # TODO: Replace with proper parsing when time allows.
    return [
        {"id": "sd-turbo", "hf": "stabilityai/sd-turbo"},
        {"id": "sd15", "hf": "stable-diffusion-v1-5/stable-diffusion-v1-5"},
        {"id": "pixart-sigma", "hf": "PixArt-alpha/PixArt-Sigma-XL-2-1024-MS"},
        {"id": "sana-1600m", "hf": "Efficient-Large-Model/Sana_1600M_1024px"},
        {"id": "sdxl", "hf": "stabilityai/stable-diffusion-xl-base-1.0"},
        {"id": "sd35-medium", "hf": "stabilityai/stable-diffusion-3.5-medium"},
        {"id": "sd35-large", "hf": "stabilityai/stable-diffusion-3.5-large"},
        {"id": "flux1-schnell", "hf": "black-forest-labs/FLUX.1-schnell"},
        {"id": "flux1-dev", "hf": "black-forest-labs/FLUX.1-dev"},
        {"id": "qwen-image", "hf": "Qwen/Qwen-Image"},
        {"id": "qwen-image-2.1", "hf": "Qwen/Qwen-Image-2.1"},
        {"id": "krea-2-turbo", "hf": "krea/Krea-2-Turbo"},
    ]


def obtener_modelos_tendencia() -> list[dict]:
    """Get trending text-to-image models from Hugging Face."""
    # Use lastModified as a proxy for trending (most recently updated)
    url = f"{HF_API_URL}/models?pipeline_tag=text-to-image&sort=lastModified&direction=-1&limit=10"
    data = http_get_json(url)
    if not data:
        return []
    modelos = []
    for item in data:
        modelo_id = item.get("modelId")
        if not modelo_id:
            continue
        # Get more details if needed
        modelos.append({
            "id": modelo_id,
            "likes": item.get("likes", 0),
            "lastModified": item.get("lastModified"),
            "tags": item.get("tags", []),
            "pipeline_tag": item.get("pipeline_tag"),
        })
    return modelos


def obtener_modelos_me_gusta() -> list[dict]:
    """Get most liked text-to-image models from Hugging Face."""
    url = f"{HF_API_URL}/models?pipeline_tag=text-to-image&sort=likes&direction=-1&limit=10"
    data = http_get_json(url)
    if not data:
        return []
    modelos = []
    for item in data:
        modelo_id = item.get("modelId")
        if not modelo_id:
            continue
        modelos.append({
            "id": modelo_id,
            "likes": item.get("likes", 0),
            "lastModified": item.get("lastModified"),
            "tags": item.get("tags", []),
            "pipeline_tag": item.get("pipeline_tag"),
        })
    return modelos


def comprobar_actualizaciones(modelos: list[dict]) -> list[dict]:
    """Check if existing models have updates."""
    # For each model, get its Hugging Face info and compare lastModified with FECHA_VERIFICACION_IMAGENES
    # FECHA_VERIFICACION_IMAGENES is "2026-10-11"
    verification_date = datetime(2026, 10, 11, tzinfo=timezone.utc)
    actualizaciones = []
    for modelo in modelos:
        hf_id = modelo.get("hf")
        if not hf_id:
            continue
        url = f"{HF_API_URL}/models/{hf_id}"
        data = http_get_json(url)
        if not data:
            continue
        last_modified_str = data.get("lastModified")
        if not last_modified_str:
            continue
        try:
            last_modified = datetime.fromisoformat(last_modified_str.replace("Z", "+00:00"))
        except ValueError:
            continue
        if last_modified > verification_date:
            actualizaciones.append({
                "id": modelo["id"],
                "hf": hf_id,
                "last_modified": last_modified_str,
                "current_verification": "2026-10-11",
                "license": data.get("license"),
                "gated": data.get("gated", False),
            })
    return actualizaciones


def obtener_versiones_motores() -> dict:
    """Get latest versions of stable-diffusion.cpp and ComfyUI from GitHub."""
    motores = {}
    # stable-diffusion.cpp: get latest release tag, if none then latest version-like tag
    url = f"{GH_API_URL}/repos/leejet/stable-diffusion.cpp/releases/latest"
    data = http_get_json(url)
    if data and data.get("tag_name"):
        motores["stable-diffusion.cpp"] = data["tag_name"]
    else:
        # Fallback to tags
        url = f"{GH_API_URL}/repos/leejet/stable-diffusion.cpp/tags?per_page=100"
        data = http_get_json(url)
        if data and isinstance(data, list):
            # Look for version-like tags (e.g., v1.0.0)
            version_tags = [tag["name"] for tag in data if re.match(r'^v?\d+\.\d+\.\d+', tag["name"])]
            if version_tags:
                # Sort by version number (simple)
                version_tags.sort(key=lambda x: list(map(int, re.findall(r'\d+', x))), reverse=True)
                motores["stable-diffusion.cpp"] = version_tags[0]
            else:
                motores["stable-diffusion.cpp"] = "unknown"
    # ComfyUI
    url = f"{GH_API_URL}/repos/comfyanonymous/ComfyUI/releases/latest"
    data = http_get_json(url)
    if data and data.get("tag_name"):
        motores["comfyui"] = data["tag_name"]
    else:
        url = f"{GH_API_URL}/repos/comfyanonymous/ComfyUI/tags?per_page=100"
        data = http_get_json(url)
        if data and isinstance(data, list):
            version_tags = [tag["name"] for tag in data if re.match(r'^v?\d+\.\d+\.\d+', tag["name"])]
            if version_tags:
                version_tags.sort(key=lambda x: list(map(int, re.findall(r'\d+', x))), reverse=True)
                motores["comfyui"] = version_tags[0]
            else:
                motores["comfyui"] = "unknown"
    return motores


def escribir_propuesta(propuesta: dict) -> None:
    """Write proposal to propositas-imagenes.json."""
    PROPOSALS_DIR.mkdir(parents=True, exist_ok=True)
    filepath = PROPOSALS_DIR / "propuestas-imagenes.json"
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(propuesta, f, indent=2, ensure_ascii=False)
    print(f"Proposal written to {filepath}")


def filtrar_modelos_dignos(modelos: list[dict]) -> list[dict]:
    """Filter models worthy of entering the catalog."""
    dignos = []
    for modelo in modelos:
        # Skip if not text-to-image (though we filtered by pipeline_tag, double-check)
        if "text-to-image" not in modelo.get("pipeline_tag", []):
            continue
        # Get more details to check license and size
        hf_id = modelo.get("id")
        if not hf_id:
            continue
        url = f"{HF_API_URL}/models/{hf_id}"
        data = http_get_json(url)
        if not data:
            continue
        # Check license: we want models that allow commercial use or are at least not restricted
        license_str = data.get("license", "")
        # We'll consider a model worthy if the license is not explicitly non-commercial without exception
        # This is a simplification; we should check the license string for terms like "non-commercial"
        # but for now, we'll accept any license that is not empty and not marked as non-commercial in a way that forbids commercial use.
        # We'll skip if the license contains "non-commercial" and does not have a commercial exception.
        # This is a placeholder.
        if "non-commercial" in license_str.lower() and "exception" not in license_str.lower():
            continue
        # Check gated: we skip gated models because the user would need to accept terms
        if data.get("gated", False):
            continue
        # Check size: we want models that are not too large (e.g., less than 20 GB)
        # We don't have size in the model info, so we skip this check for now.
        # We'll assume the model is worthy if it passes the above.
        dignos.append(modelo)
    return dignos


def crear_cola_catalogo(modelos: list[dict]) -> None:
    """Create a new queue file for adding models to the catalog."""
    # The queue file should be named cola-imagenes-catalogo-<fecha>.json
    # and placed in the same directory as proposals? Or in starseed_memory_root/olas?
    # We'll put it in the same directory.
    fecha = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    filename = f"cola-imagenes-catalogo-{fecha}.json"
    filepath = PROPOSALS_DIR / filename
    # The queue file should contain a list of tasks to add the model.
    # Each task might be: { "tipo": "añadir_modelo", "modelo": <modelo_info> }
    # We'll keep it simple: a list of model IDs to add.
    task_list = [{"id": m["id"], "hf": m.get("hf")} for m in modelos]
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(task_list, f, indent=2, ensure_ascii=False)
    print(f"Queue file written to {filepath}")


def main() -> None:
    """Main entry point."""
    # 1. Read MODELOS_IMAGEN from TypeScript file
    modelos = leer_modelos_imagenes()
    print(f"Leídos {len(modelos)} modelos del catálogo")

    # 2. Get trending and most liked text-to-image models from Hugging Face
    trending = obtener_modelos_tendencia()
    most_liked = obtener_modelos_me_gusta()
    print(f"Encontrados {len(trending)} modelos en tendencia y {len(most_liked)} con más me gusta")

    # 3. Check for updates in existing models
    actualizaciones = comprobar_actualizaciones(modelos)
    print(f"Encontradas {len(actualizaciones)} actualizaciones potenciales")

    # 4. Get latest versions of engines
    versiones_motores = obtener_versiones_motores()
    print(f"Versiones de motores: {versiones_motores}")

    # 5. Create proposal
    propuesta = {
        "fecha": TODAY,
        "modelos_tendencia": trending,
        "modelos_me_gusta": most_liked,
        "actualizaciones_modelos": actualizaciones,
        "versiones_motores": versiones_motores,
    }

    # 6. Write proposal
    escribir_propuesta(propuesta)

    # 7. Create queue for worthy models
    modelos_dignos = filtrar_modelos_dignos(trending + most_liked)
    if modelos_dignos:
        crear_cola_catalogo(modelos_dignos)
        print(f"Creada cola para {len(modelos_dignos)} modelos dignos")
    else:
        print("No se encontraron modelos dignos para entrar al catálogo")


if __name__ == "__main__":
    main()