import os
import json
from pathlib import Path
from typing import List

from supabase import create_client, Client

# Environment variable names
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")

# Directories
MEMORY_ROOT = Path("../../starseed_memory_root")
VARIATIONS_DIR = MEMORY_ROOT / "diseno" / "variaciones-aprobadas"


def load_variations() -> List[dict]:
    variations: List[dict] = []
    if not VARIATIONS_DIR.exists():
        return variations
    for file in VARIATIONS_DIR.glob("*.json"):
        with file.open("r", encoding="utf-8") as f:
            data = json.load(f)
            if data.get("estado") == "aprobada":
                variations.append(data)
    return variations


def upsert_variation(client: Client, variation: dict) -> None:
    # Determinar tabla destino
    table = "os_variaciones" if "os_variaciones" in client.from_("os_variaciones")._client._realtime.socket_url else "library_public_items"
    payload = {
        "clave": variation["clave"],
        "nombre": variation["nombre"],
        "familia": variation["familia"],
        "registro": variation["registro"],
        "fundamentos": variation["fundamentos"],
        "parametros": variation["parametros"],
        "movimientoReducido": variation["movimientoReducido"],
        "ejemplo": variation["ejemplo"],
        "referencias": variation["referencias"],
        "licencia": variation["licencia"],
        "de_variacion": variation.get("clave"),
    }
    # Upsert por clave
    client.from_(table).upsert(payload, on_conflict="clave").execute()


def main() -> None:
    client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    variations = load_variations()
    for v in variations:
        upsert_variation(client, v)

if __name__ == "__main__":
    main()
