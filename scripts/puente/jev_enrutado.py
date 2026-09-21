"""Módulo de enrutado de tareas del enjambre usando jevkit (hermes-jev-skills).

Proporciona funciones para convertir tareas a texto, enrutar tareas con jevkit
y verificar la disponibilidad de jevkit en el entorno.
"""

from pathlib import Path
import json
import os
import subprocess
import sys
from typing import Any, Callable, Dict, Optional, Tuple

# Proveedores permitidos en la flota del enjambre de StarSeed OS
PROVEEDORES_NUESTROS = {
    "openrouter",
    "xkiro",
    "nim",
    "aihubmix",
    "tokenrouter",
    "llm7",
    "freetheai",
    "gemini",
    "groq",
    "cerebras",
    "anthropic",
    "ollama",
}

# Directorio raíz del repositorio
ROOT_DIR = Path(__file__).resolve().parent.parent.parent


def texto_de_tarea(tarea: Dict[str, Any]) -> str:
    """Convierte la tarea del enjambre en un prompt corto para jev route.
    
    Extrae el título de la tarea, cantidad y extensiones de archivos,
    y determina si se requieren pruebas o tests.
    """
    if not isinstance(tarea, dict):
        return str(tarea)

    # Extraemos el título buscando claves comunes de las colas del enjambre
    titulo = tarea.get("titulo") or tarea.get("title") or tarea.get("id") or "Sin título"
    
    # Procesamos los archivos involucrados para obtener número y extensión
    archivos = tarea.get("archivos") or tarea.get("files") or []
    if isinstance(archivos, str):
        archivos = [archivos]

    num_archivos = len(archivos)
    extensiones = sorted(list(set(
        f".{f.rsplit('.', 1)[-1]}" if "." in f else "sin-ext"
        for f in archivos if f
    )))
    ext_str = ", ".join(extensiones) if extensiones else "ninguna"

    # Evaluamos si la tarea exige pruebas
    prompt_txt = str(tarea.get("prompt") or tarea.get("descripcion") or "").lower()
    pide_pruebas = (
        bool(tarea.get("pruebas") or tarea.get("tests"))
        or "test" in prompt_txt
        or "prueba" in prompt_txt
        or "vitest" in prompt_txt
        or "unittest" in prompt_txt
    )
    pruebas_str = "sí" if pide_pruebas else "no"

    return f"Tarea: {titulo}. Archivos ({num_archivos}): {ext_str}. Pruebas: {pruebas_str}."


def disponible() -> bool:
    """Verifica si jevkit está instalado y con la clave OPENROUTER_API_KEY lista."""
    # Verificamos primero la presencia de la clave de API obligatoria
    if not os.environ.get("OPENROUTER_API_KEY"):
        return False

    env = os.environ.copy()
    # Si existe hermes-jev-skills en externos, lo añadimos a PYTHONPATH
    hermes_dir = ROOT_DIR / "externos" / "hermes-jev-skills"
    if hermes_dir.exists():
        existing_path = env.get("PYTHONPATH", "")
        env["PYTHONPATH"] = f"{hermes_dir}:{existing_path}" if existing_path else str(hermes_dir)

    try:
        # Ejecutamos 'doctor' para confirmar que jevkit responde correctamente
        res = subprocess.run(
            [sys.executable, "-m", "jevkit", "doctor"],
            capture_output=True,
            text=True,
            timeout=3,
            env=env,
        )
        return res.returncode == 0
    except Exception:
        # Cualquier fallo o tiempo agotado significa que no está disponible
        return False


def _ejecutar_cmd(cmd: list) -> Tuple[int, str, str]:
    """Ejecuta el comando jevkit con tiempo límite de 10 segundos."""
    env = os.environ.copy()
    hermes_dir = ROOT_DIR / "externos" / "hermes-jev-skills"
    if hermes_dir.exists():
        existing_path = env.get("PYTHONPATH", "")
        env["PYTHONPATH"] = f"{hermes_dir}:{existing_path}" if existing_path else str(hermes_dir)

    res = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=10,
        env=env,
    )
    return res.returncode, res.stdout, res.stderr


def enrutar(
    tarea: Dict[str, Any],
    modelo_actual: str,
    correr: Optional[Callable[..., Any]] = None,
) -> Tuple[str, str]:
    """Enruta la tarea con jevkit.
    
    Si el CLI no está, falla, tarda más de 10 s, devuelve routed: false o un
    proveedor no permitido, devuelve (modelo_actual, motivo) sin lanzar excepción.
    """
    # Preparamos el texto de la tarea para el prompt de jev route
    if isinstance(tarea, dict):
        prompt_texto = texto_de_tarea(tarea)
    else:
        prompt_texto = str(tarea)

    # Adaptamos el modelo actual de formato enjambre (prov/mod) a jevkit (prov:mod)
    actual_jev = modelo_actual.replace("/", ":", 1) if ("/" in modelo_actual and ":" not in modelo_actual) else modelo_actual

    cmd = [
        sys.executable,
        "-m",
        "jevkit",
        "route",
        "--prompt",
        prompt_texto,
        "--current",
        actual_jev,
    ]

    # Inyectamos el ejecutor por defecto si no se pasa uno personalizado para tests
    runner = correr if correr is not None else _ejecutar_cmd

    try:
        resultado = runner(cmd)
        if isinstance(resultado, (tuple, list)):
            rc = resultado[0]
            stdout = resultado[1] if len(resultado) > 1 else ""
        elif isinstance(resultado, str):
            rc = 0
            stdout = resultado
        elif isinstance(resultado, dict):
            rc = 0
            stdout = json.dumps(resultado)
        else:
            rc = 0
            stdout = str(resultado)
    except Exception as exc:
        # El enrutado es una mejora opcional; devolvemos el modelo actual ante fallos
        return modelo_actual, f"Excepción al ejecutar jev route: {exc}"

    if rc != 0:
        return modelo_actual, "Error de ejecución en jev route"

    try:
        data = json.loads(stdout)
    except Exception:
        # Si el JSON está roto, mantenemos el modelo actual sin fallar
        return modelo_actual, "Respuesta JSON no válida de jevkit"

    if not isinstance(data, dict):
        return modelo_actual, "Formato JSON de respuesta no válido"

    routed = data.get("routed")
    motivo = data.get("reason") or "Sin motivo especificado"

    if not routed:
        # Si jevkit decide no enrutar (routed: false), conservamos el modelo actual
        return modelo_actual, motivo

    raw_model = data.get("model")
    if not raw_model or not isinstance(raw_model, str):
        return modelo_actual, motivo

    # jevkit devuelve "proveedor:modelo". Traducimos a "proveedor/modelo" para el enjambre
    if ":" in raw_model:
        prov, mod_id = raw_model.split(":", 1)
    elif "/" in raw_model:
        prov, mod_id = raw_model.split("/", 1)
    else:
        prov, mod_id = "", raw_model

    prov_clean = prov.strip().lower()
    if prov_clean not in PROVEEDORES_NUESTROS:
        # Si el proveedor sugerido no está en nuestra lista de permitidos, NO enrutamos
        return modelo_actual, motivo

    modelo_enjambre = f"{prov_clean}/{mod_id.strip()}"
    return modelo_enjambre, motivo
