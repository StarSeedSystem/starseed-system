import argparse
import os
import json
from pathlib import Path
from typing import List, Dict

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


def upsert_variation(variation: Dict) -> None:
    """
    Stub: implementar inserción/actualización en Supabase cuando esté disponible.
    Actualmente solo registra la operación por consola.
    """
    print(f"[upsert] {variation.get('clave')}: {variation.get('nombre')}")


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
