"""Servicio de Flujos de Genesis: bucle, reanudación y avisos."""
from __future__ import annotations
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

from .disparadores import pendientes
from .modelo import RAIZ_FLUJOS
from .motor import ejecutar, reanudar

MAX_CONCURRENTES = 2
INTERVALO = 10

def _reanudar_pendientes() -> None:
    ejecuciones = Path(RAIZ_FLUJOS) / "ejecuciones"
    if not ejecuciones.exists():
        return
    for flujo_dir in ejecuciones.iterdir():
        if not flujo_dir.is_dir():
            continue
        for archivo in flujo_dir.glob("*.json"):
            try:
                reanudar(archivo.stem)
            except Exception:
                pass

def _avisar_fallo(flujo_id: str, ejec_id: str, error: str) -> None:
    try:
        from scripts.puente.director_chat import publicar
        texto = (
            f"Flujo falló: {flujo_id}\n"
            f"Ejecución: {ejec_id}\n"
            f"Error: {error}"
        )
        publicar(texto, de="flujos-servicio", rol="sistema", tipo="aviso")
    except Exception:
        pass

def _ejecutar_pares(pares: list[tuple[Any, list[dict[str, Any]]]]) -> None:
    def trabajo(flujo, entrada):
        try:
            res = ejecutar(flujo, entrada)
            if res.estado == "fallida":
                _avisar_fallo(flujo.id, res.id, res.error or "desconocido")
        except Exception as exc:
            _avisar_fallo(flujo.id, "", str(exc))
    with ThreadPoolExecutor(max_workers=MAX_CONCURRENTES) as pool:
        for flujo, entrada in pares:
            pool.submit(trabajo, flujo, entrada)

def main() -> None:
    _reanudar_pendientes()
    while True:
        try:
            pares = pendientes()
            if pares:
                _ejecutar_pares(pares)
        except Exception:
            pass
        time.sleep(INTERVALO)

if __name__ == "__main__":
    main()

