"""opencode-zen_config · Configura y prueba el proveedor OpenCode Zen.

OpenCode Zen provee modelos gratuitos (glm-5.3-flash-free, deepseek-v4.1-flash-free,
minimax-m3.1-flash-free, big-pickle) cuando existe OPENCODE_API_KEY.
Este módulo verifica la configuración y comprueba que los modelos están disponibles.
"""

import json
import os
import subprocess
from pathlib import Path
from typing import Any

MODELOS_ZEN_GRATIS = (
    "opencode/glm-5.3-flash-free",
    "opencode/deepseek-v4.1-flash-free",
    "opencode/minimax-m3.1-flash-free",
    "opencode/big-pickle",
)

RUTAS_CONFIG = (
    Path("opencode.json"),
    Path("deploy/nube/opencode.json"),
    Path("deploy/hf-space/opencode.json"),
    Path.home() / ".config" / "opencode" / "opencode.json",
)


def leer_config(ruta: Path) -> dict[str, Any]:
    """Lee un archivo de configuración de opencode."""
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}


def hay_clave_zen(entorno: dict[str, str] | None = None) -> bool:
    """Verifica si OPENCODE_API_KEY está disponible en el entorno o archivos de config."""
    if entorno is None:
        entorno = dict(os.environ)
    if str(entorno.get("OPENCODE_API_KEY") or "").strip():
        return True
    for ruta in (Path("~/.starseed/env").expanduser(), Path("~/.hermes/.env").expanduser()):
        try:
            with open(ruta, encoding="utf-8") as f:
                if any("OPENCODE_API_KEY" in linea and "=" in linea for linea in f):
                    return True
        except OSError:
            pass
    auth_path = Path("~/.local/share/opencode/auth.json").expanduser()
    try:
        with open(auth_path, encoding="utf-8") as f:
            data = json.load(f)
            return "opencode" in (data or {})
    except (OSError, json.JSONDecodeError):
        return False


def proveedor_zen_configurado(config: dict[str, Any]) -> bool:
    """Verifica si el proveedor 'opencode' está configurado en opencode.json."""
    proveedores = config.get("providers", {})
    return "opencode" in proveedores


def modelos_zen_disponibles(config: dict[str, Any]) -> list[str]:
    """Devuelve la lista de modelos zen disponibles en la configuración."""
    proveedores = config.get("providers", {})
    opencode_provider = proveedores.get("opencode", {})
    modelos = opencode_provider.get("models", {})
    return [m for m in MODELOS_ZEN_GRATIS if m.split("/", 1)[1] in modelos]


def test_clave_zen() -> tuple[bool, str]:
    """Prueba si la clave de Zen está disponible."""
    if hay_clave_zen():
        return True, "OPENCODE_API_KEY encontrada"
    return False, "OPENCODE_API_KEY no encontrada en entorno, ~/.starseed/env, ~/.hermes/.env ni auth.json"


def test_configuracion() -> tuple[bool, str]:
    """Prueba si la configuración de opencode tiene el proveedor zen."""
    for ruta in RUTAS_CONFIG:
        if ruta.exists():
            config = leer_config(ruta)
            if proveedor_zen_configurado(config):
                return True, f"Proveedor 'opencode' configurado en {ruta}"
    return False, "Proveedor 'opencode' no encontrado en ningún opencode.json"


def test_modelos() -> tuple[bool, str]:
    """Prueba si los modelos zen están disponibles en la configuración."""
    for ruta in RUTAS_CONFIG:
        if ruta.exists():
            config = leer_config(ruta)
            disponibles = modelos_zen_disponibles(config)
            if disponibles:
                return True, f"Modelos zen disponibles: {', '.join(disponibles)}"
    return False, "Ningún modelo zen encontrado en la configuración"


def test_opencode_cli() -> tuple[bool, str]:
    """Prueba si el CLI de opencode responde y lista modelos zen."""
    try:
        resultado = subprocess.run(
            ["opencode", "models"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if resultado.returncode == 0:
            salida = resultado.stdout
            encontrados = [m for m in MODELOS_ZEN_GRATIS if m in salida]
            if encontrados:
                return True, f"CLI opencode lista modelos zen: {', '.join(encontrados)}"
            return False, "CLI opencode no lista modelos zen (¿falta OPENCODE_API_KEY?)"
        return False, f"CLI opencode falló: {resultado.stderr}"
    except FileNotFoundError:
        return False, "CLI opencode no instalado"
    except subprocess.TimeoutExpired:
        return False, "CLI opencode timeout"


def main() -> int:
    """Ejecuta todas las pruebas y reporta resultados."""
    pruebas = [
        ("Clave Zen", test_clave_zen),
        ("Configuración", test_configuracion),
        ("Modelos en config", test_modelos),
        ("CLI opencode", test_opencode_cli),
    ]

    todos_ok = True
    for nombre, prueba in pruebas:
        ok, mensaje = prueba()
        estado = "✓" if ok else "✗"
        print(f"{estado} {nombre}: {mensaje}")
        if not ok:
            todos_ok = False

    return 0 if todos_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())