#!/usr/bin/env python3
"""Configuración y prueba local de OpenCode Zen (CAP1119).

Sin sondeo HTTP: los modelos gratis solo responden dentro de opencode (403 FreeTierError).
Jamás se escribe ni imprime el valor de la clave.
"""
from __future__ import annotations
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import entorno as E  # noqa: E402

RUTA_POR_DEFECTO = "~/.config/opencode/opencode.json"
NOMBRE = "zen"
CLAVE = "OPENCODE_API_KEY"
BASE_URL = "https://opencode.ai/zen/v1"
MODELOS_GRATIS = ("glm-5.3-flash-free", "deepseek-v4.1-flash-free",
                  "minimax-m3.1-flash-free", "big-pickle")


def bloque_zen() -> dict:
    """PURA. Bloque `provider` de Zen con la clave como variable, nunca su valor."""
    return {
        "npm": "@ai-sdk/openai-compatible",
        "name": "OpenCode Zen (modelos gratuitos)",
        "options": {"baseURL": BASE_URL, "apiKey": "{env:%s}" % CLAVE},
        "models": {modelo: {"name": modelo} for modelo in MODELOS_GRATIS},
    }


def config_con_zen(config: dict | None) -> tuple[dict, bool]:
    """PURA. Añade o repara el bloque Zen sin mutar `config`."""
    actual = config if isinstance(config, dict) else {}
    crudo = actual.get("provider")
    proveedores = crudo if isinstance(crudo, dict) else {}
    deseado = bloque_zen()
    if proveedores.get(NOMBRE) == deseado:
        return actual, False
    nuevo = json.loads(json.dumps(actual))
    nuevo["provider"] = {**proveedores, NOMBRE: deseado}
    return nuevo, True


def tiene_clave(entorno: dict | None = None, auth: dict | None = None) -> bool:
    """PURA. ¿Hay clave en el entorno o sesión de Zen en auth.json? Sin leer archivos."""
    return (bool(str((entorno or {}).get(CLAVE) or "").strip())
            or "opencode" in (auth or {}))


def leer_clave_zen(ruta_auth: str | None = None) -> bool:
    """Clave en el entorno o archivos, o sesión «opencode» en auth.json."""
    if E.leer_clave(CLAVE):
        return True
    try:
        ruta = ruta_auth or os.path.expanduser("~/.local/share/opencode/auth.json")
        with open(ruta, encoding="utf-8") as f:
            return "opencode" in (json.load(f) or {})
    except Exception:
        return False


def comprobar(config: dict | None, clave: bool) -> dict:
    """PURA. Prueba local de la configuración: qué falta para que Zen esté listo."""
    prov = config.get("provider") if isinstance(config, dict) else None
    proveedores = prov if isinstance(prov, dict) else {}
    bloque = proveedores.get(NOMBRE) or {}
    opciones = bloque.get("options") or {}
    modelos = bloque.get("models") or {}
    faltan = [m for m in MODELOS_GRATIS if m not in modelos]
    problemas: list[str] = []
    if not bloque:
        problemas.append("Falta el proveedor zen en opencode.json.")
    if opciones.get("baseURL") != BASE_URL:
        problemas.append("El baseURL de Zen debe ser el de opencode.ai/zen/v1.")
    if opciones.get("apiKey") != "{env:%s}" % CLAVE:
        problemas.append("La apiKey debe ser la sintaxis literal {env:%s}." % CLAVE)
    if faltan:
        problemas.append("Faltan modelos gratuitos: %s." % ", ".join(faltan))
    if not clave:
        problemas.append("Falta la clave de Zen (OPENCODE_API_KEY o sesión en auth.json).")
    return {"listo": not problemas, "faltan": faltan, "problemas": problemas}


def escribir_config(config: dict, ruta: str) -> None:
    """Escribe el JSON de forma atómica para no dejar la config a medias."""
    destino = os.path.expanduser(ruta)
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    temporal = "%s.%d.tmp" % (destino, os.getpid())
    with open(temporal, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=2)
    os.replace(temporal, destino)


def main(argv=None, clave: bool | None = None) -> int:
    """Configura o comprueba Zen; imprime un informe JSON y devuelve 0 si está listo."""
    args = list(sys.argv[1:] if argv is None else argv)
    seco, probar = "--seco" in args, "--probar" in args
    ruta = next((a for a in args if not a.startswith("--")), RUTA_POR_DEFECTO)
    try:
        with open(os.path.expanduser(ruta), encoding="utf-8") as f:
            cfg = json.load(f)
    except Exception:
        cfg = {}
    if not isinstance(cfg, dict):
        cfg = {}
    if not probar:
        cfg, _ = config_con_zen(cfg)
        if not seco:
            escribir_config(cfg, ruta)
    if clave is None:
        clave = leer_clave_zen()
    resultado = comprobar(cfg, clave)
    print(json.dumps({**resultado, "ruta": ruta}, ensure_ascii=False))
    return 0 if resultado["listo"] else 1


if __name__ == "__main__": sys.exit(main())
