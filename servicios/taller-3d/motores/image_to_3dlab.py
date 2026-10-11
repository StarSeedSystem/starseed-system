"""
image-to-3dlab · Motor del taller de avatares (AV1011F).
Imagen → modelo 3D con textura PBR (GLB) en local en Mac Apple Silicon.
Requiere: Apple Silicon y 32 GB de RAM o más.
No genera en la Mac actual de Alex (8 GB) ni en la A1 (sin GPU).
"""
import subprocess
import json
import os
import platform
from typing import Tuple, Dict, Any


def disponible() -> Tuple[bool, str]:
    """Comprueba si image-to-3dlab está disponible en este sistema."""
    if platform.system() != "Darwin":
        return False, "Solo disponible en macOS"
    if platform.machine() != "arm64":
        return False, "Requiere Apple Silicon (ARM64)"
    try:
        result = subprocess.run(
            ["sysctl", "-n", "hw.memsize"], 
            capture_output=True, 
            text=True, 
            timeout=5
        )
        if result.returncode != 0:
            return False, "No se pudo determinar la memoria RAM"
        total_gb = int(result.stdout.strip()) / (1024 ** 3)
        if total_gb < 32:
            return False, f"Requiere 32 GB de RAM o más (actual: {total_gb:.1f} GB)"
    except (ValueError, subprocess.TimeoutExpired, FileNotFoundError):
        return False, "No se pudo determinar la memoria RAM"
    return False, "image-to-3dlab no instalado (requiere instalación explícita)"


def generar(
    entrada_png: str, 
    carpeta_salida: str, 
    resolucion: int, 
    poca_memoria: bool
) -> Dict[str, Any]:
    """Genera un modelo 3D desde una imagen PNG usando image-to-3dlab."""
    disp, motivo = disponible()
    if not disp:
        return {
            "ok": False,
            "glb": None,
            "procedencia": None,
            "fallo": "no-instalado",
            "segundos": 0,
            "pico_memoria_gb": 0
        }
    # TODO: Implementar llamada real a image-to-3dlab
    # Por ahora, resultado simulado
    return {
        "ok": True,
        "glb": os.path.join(carpeta_salida, "modelo.glb"),
        "procedencia": {
            "herramienta": "trellis2",
            "licencia": "MIT + licencia de DINOv3",
            "uso": "condicionado"
        },
        "fallo": None,
        "segundos": 5,
        "pico_memoria_gb": 4
    }


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python3 image_to_3dlab.py --entrada <ruta_png> o --test")
        sys.exit(1)
    if sys.argv[1] == "--test":
        # Modo de prueba
        disp, motivo = disponible()
        print(f"Disponible: {disp}")
        print(f"Motivo: {motivo}")
    elif sys.argv[1] == "--entrada":
        if len(sys.argv) != 3:
            print("Usage: python3 image_to_3dlab.py --entrada <ruta_png>")
            sys.exit(1)
        # Modo de generación
        entrada_png = sys.argv[2]
        # En una implementación real, tomaríamos los otros parámetros de la línea de comandos
        # Por ahora, solo mostramos que se llamó
        print(f"Generando modelo desde {entrada_png}")
        resultado = generar(entrada_png, "/tmp/salida", 1024, False)
        print(json.dumps(resultado, indent=2))
    else:
        print("Argumento no reconocido")
        sys.exit(1)