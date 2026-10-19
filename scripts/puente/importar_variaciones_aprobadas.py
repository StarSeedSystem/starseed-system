import argparse
import os
import json
from pathlib import Path
from typing import List, Dict, Any
import requests

# Environment variable names (optional, for future Supabase integration)
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")

# Directories (can be overridden via environment or arguments)
_DEFAULT_MEMORY_ROOT = Path(__file__).resolve().parent.parent.parent / "starseed_memory_root"
_VARIATIONS_DIR_OVERRIDE = os.getenv("VARIATIONS_DIR_OVERRIDE")

def _get_variations_dir() -> Path:
    if _VARIATIONS_DIR_OVERRIDE:
        return Path(_VARIATIONS_DIR_OVERRIDE)
    return _DEFAULT_MEMORY_ROOT / "diseno" / "variaciones-aprobadas"


def load_variations(custom_dir: Path | None = None) -> List[Dict]:
    variations: List[Dict] = []
    dir_path = custom_dir or _get_variations_dir()
    if not dir_path.exists():
        return variations
    for file in dir_path.glob("*.json"):
        with file.open("r", encoding="utf-8") as f:
            data = json.load(f)
            if data.get("estado") == "aprobada":
                variations.append(data)
    return variations


def _prepare_variation_data(variation: Dict) -> Dict[str, Any]:
    """
    Prepara los datos de la variación para insertar/actualizar en Supabase.
    Esta función es pura: no tiene efectos secundarios.
    """
    # Extraemos los campos que sabemos que están en la variación.
    # También podemos incluir otros campos si el esquema de la tabla los requiere.
    data = {
        "clave": variation.get("clave"),
        "nombre": variation.get("nombre"),
        "familia": variation.get("familia"),
        "registro": variation.get("registro"),
        "fundamentos": variation.get("fundamentos", []),
        "parametros": variation.get("parametros", {}),
        "movimiento_reducido": variation.get("movimientoReducido", {}),
        "ejemplo": variation.get("ejemplo"),
        "referencias": variation.get("referencias", []),
        "licencia": variation.get("licencia"),
    }
    # Eliminamos los campos que son None para evitar insertar valores nulos no deseados.
    # Pero podemos dejar que Supabase maneje los nulos si la columna permite nulos.
    # Por ahora, dejamos todos los campos, incluso si son None.
    return data


def _get_supabase_headers() -> Dict[str, str]:
    """
    Obtiene los encabezados para las peticiones a Supabase.
    Devuelve un diccionario vacío si faltan las variables de entorno.
    """
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return {}
    return {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }


def upsert_variation(variation: Dict) -> None:
    """
    Inserta o actualiza una variación en Supabase usando la API REST.
    Primero intenta en la tabla `os_variaciones`, y si falla porque la tabla no existe,
    intenta en `library_public_items`.
    """
    headers = _get_supabase_headers()
    if not headers:
        print("[seco] No se configuraron las variables de entorno de Supabase. Saltando inserción.")
        return

    data = _prepare_variation_data(variation)
    base_url = f"{SUPABASE_URL}/rest/v1"

    # Intentamos primero en os_variaciones
    try:
        url = f"{base_url}/os_variaciones"
        response = requests.post(url, headers=headers, json=data)
        response.raise_for_status()  # Lanza una excepción para códigos de error HTTP
        print(f"[upsert] Insertada/actualizada en os_variaciones: {data.get('clave')}: {data.get('nombre')}")
        return
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 404:
            print(f"[info] La tabla os_variaciones no existe (404). Probando con library_public_items: {e}")
        else:
            print(f"[error] Error HTTP al insertar en os_variaciones: {e}")
            # Si el error no es 404, no probamos la otra tabla
            return
    except Exception as e:
        print(f"[error] Error al insertar en os_variaciones: {e}")
        return

    # Intentamos en library_public_items
    try:
        url = f"{base_url}/library_public_items"
        response = requests.post(url, headers=headers, json=data)
        response.raise_for_status()
        print(f"[upsert] Insertada/actualizada en library_public_items: {data.get('clave')}: {data.get('nombre')}")
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 404:
            print(f"[info] La tabla library_public_items tampoco existe (404).")
        else:
            print(f"[error] Error HTTP al insertar en library_public_items: {e}")
    except Exception as e:
        print(f"[error] Error al insertar en library_public_items: {e}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Importar variaciones aprobadas a la Librería")
    parser.add_argument("--seco", action="store_true", help="Modo seco: solo muestra lo que haría sin modificar la base de datos")
    args = parser.parse_args()
    variations = load_variations()
    for v in variations:
        if args.seco:
            print(f"[seco] {v.get('clave')}: {v.get('nombre')}")
        else:
            upsert_variation(v)


if __name__ == "__main__":
    main()
