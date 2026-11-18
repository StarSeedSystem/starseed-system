#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Lanzador propio de Hermes para macOS (StarSeed Hermes.app).

Permite que macOS conceda permisos de «Grabación de pantalla y audio del sistema»
y «Accesibilidad» a la app con nombre de StarSeed, en lugar de a /usr/bin/osascript.

Subórdenes:
  construir --seco    Muestra lo que haría sin escribir en disco
  construir           Crea ~/Applications/StarSeed Hermes.app firmada ad-hoc
  instalar --seco     Muestra cambios en el plist sin aplicarlos
  instalar            Respaldar plist, cambiar ProgramArguments, recargar launchd
  deshacer            Restaurar plist original y recargar launchd
  estado              Qué ejecuta el servicio hoy y si la app existe
"""

import argparse
import os
import plistlib
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Tuple


# ─── Rutas y constantes ──────────────────────────────────────────────
PLIST_SISTEMA = os.path.expanduser("~/Library/LaunchAgents/ai.hermes.gateway.plist")
APP_NOMBRE = "StarSeed Hermes.app"
BUNDLE_ID = "org.starseed.hermes-lanzador"
EJECUTABLE_NOMBRE = "starseed-hermes"


def ruta_app_por_defecto() -> str:
    """Ruta por defecto de la app en ~/Applications."""
    return os.path.expanduser(f"~/Applications/{APP_NOMBRE}")


def ruta_ejecutable(ruta_app: str) -> str:
    """Ruta al ejecutable Mach-O dentro del bundle."""
    return f"{ruta_app}/Contents/MacOS/{EJECUTABLE_NOMBRE}"


def ruta_info_plist(ruta_app: str) -> str:
    """Ruta al Info.plist dentro del bundle."""
    return f"{ruta_app}/Contents/Info.plist"


def ruta_swift(ruta_app: str) -> str:
    """Ruta al archivo .swift generado (fuente temporal)."""
    return f"{ruta_app}/Contents/Resources/{EJECUTABLE_NOMBRE}.swift"


# ─── Funciones puras (sin tocar el sistema) ──────────────────────────

def extraer_comando_del_plist(ruta_plist: str) -> List[str]:
    """Extrae el comando real tras 'exec ' del argumento de osascript en el plist.

    El plist actual usa ProgramArguments = ["/usr/bin/osascript", "-e", 'exec <comando>'].
    Esta función busca 'exec ' en los argumentos y devuelve el comando parseado.
    Maneja el caso donde 'exec ' está dentro de comillas anidadas.
    """
    with open(ruta_plist, "rb") as f:
        plist = plistlib.load(f)

    args = plist.get("ProgramArguments")
    if not isinstance(args, list):
        raise ValueError("ProgramArguments no es una lista")

    # Buscar el argumento que contiene 'exec '
    for arg in args:
        if isinstance(arg, str) and "exec " in arg:
            # Encontrar la última ocurrencia de 'exec ' (por si hay anidamiento)
            idx = arg.rindex("exec ") + len("exec ")
            comando_str = arg[idx:].strip()
            # Limpiar comillas de cierre sin apertura (caso anidado: ...script "exec cmd"')
            comando_str = _limpiar_comillas_dangling(comando_str)
            # Parsear respetando comillas (shlex maneja comillas internas correctamente)
            return _parsear_comando(comando_str)

    raise ValueError("No se encontró 'exec ' en los argumentos de osascript")


def _limpiar_comillas_dangling(s: str) -> str:
    """Quita comillas de cierre al final que no tienen apertura correspondiente."""
    # Si termina en comilla doble y el total de comillas es impar (hay una sin cerrar)
    if s.endswith('"') and _tiene_comilla_sin_cerrar(s, '"'):
        s = s[:-1]
    # Lo mismo para comilla simple
    if s.endswith("'") and _tiene_comilla_sin_cerrar(s, "'"):
        s = s[:-1]
    return s


def _tiene_comilla_sin_cerrar(s: str, quote: str) -> bool:
    """True si hay un número impar de esta comilla (una sin cerrar)."""
    count = 0
    for ch in s:
        if ch == quote:
            count += 1
    return count % 2 == 1


def _parsear_comando(s: str) -> List[str]:
    """Parsea un string de comando respetando comillas dobles y simples."""
    import shlex

    return shlex.split(s, posix=True)


def generar_info_plist() -> dict:
    """Genera el diccionario del Info.plist para la app."""
    return {
        "CFBundleIdentifier": BUNDLE_ID,
        "CFBundleName": "StarSeed Hermes",
        "CFBundleDisplayName": "StarSeed Hermes",
        "CFBundleExecutable": EJECUTABLE_NOMBRE,
        "CFBundlePackageType": "APPL",
        "CFBundleVersion": "1.0.0",
        "CFBundleShortVersionString": "1.0.0",
        "LSUIElement": True,
        "NSHighResolutionCapable": True,
        "CFBundleInfoDictionaryVersion": "6.0",
        "CFBundleSignature": "????",
    }


def generar_swift(comando: List[str]) -> str:
    """Genera el código Swift que hace execv del comando dado."""
    if not comando:
        raise ValueError("Comando vacío")

    # Escapar para string literal de Swift
    def esc(s: str) -> str:
        return s.replace("\\", "\\\\").replace('"', '\\"')

    ruta_binario = esc(comando[0])
    args_escaped = [esc(a) for a in comando[1:]]

    # Construir array de C strings terminado en nil
    args_swift = [f'"{ruta_binario}"'] + [f'"{a}"' for a in args_escaped]
    args_array = ", ".join(args_swift + ["nil"])

    return f'''import Foundation
import Darwin

let argv: [UnsafeMutablePointer<CChar>?] = [
    {args_array}
]
execv("{ruta_binario}", argv)
_exit(1)
'''


def nuevo_programarguments(ruta_app: str) -> List[str]:
    """Devuelve el nuevo ProgramArguments para el plist del servicio."""
    return [ruta_ejecutable(ruta_app)]


def ruta_respaldo_plist() -> str:
    """Ruta donde se guarda la copia del plist original antes de instalar."""
    fecha = datetime.now().strftime("%Y%m%d-%H%M%S")
    return f"{PLIST_SISTEMA}.antes-lanzador-{fecha}"


# ─── Operaciones con efectos (tocan el sistema) ──────────────────────

def construir(seco: bool = False, ruta_app: Optional[str] = None) -> dict:
    """Crea la app bundle con Info.plist, compila Swift y firma ad-hoc."""
    ruta_app = ruta_app or ruta_app_por_defecto()
    info = {
        "app": ruta_app,
        "info_plist": ruta_info_plist(ruta_app),
        "ejecutable": ruta_ejecutable(ruta_app),
        "swift": ruta_swift(ruta_app),
        "seco": seco,
        "pasos": [],
    }

    # 1. Leer comando del plist actual
    if not os.path.exists(PLIST_SISTEMA):
        raise FileNotFoundError(f"No existe el plist del servicio: {PLIST_SISTEMA}")

    comando = extraer_comando_del_plist(PLIST_SISTEMA)
    info["comando_extraido"] = comando
    info["pasos"].append(f"Comando extraído: {' '.join(comando)}")

    # 2. Generar Info.plist
    info_plist_dict = generar_info_plist()
    info["pasos"].append("Info.plist generado")

    # 3. Generar .swift
    swift_code = generar_swift(comando)
    info["pasos"].append("Código Swift generado")

    if seco:
        info["pasos"].append("(seco) No se escribe en disco")
        return info

    # 4. Crear estructura de directorios
    os.makedirs(os.path.dirname(ruta_ejecutable(ruta_app)), exist_ok=True)
    os.makedirs(os.path.dirname(ruta_swift(ruta_app)), exist_ok=True)

    # 5. Escribir Info.plist
    with open(ruta_info_plist(ruta_app), "wb") as f:
        plistlib.dump(info_plist_dict, f)
    info["pasos"].append(f"Info.plist escrito en {ruta_info_plist(ruta_app)}")

    # 6. Escribir .swift
    with open(ruta_swift(ruta_app), "w") as f:
        f.write(swift_code)
    info["pasos"].append(f"Swift escrito en {ruta_swift(ruta_app)}")

    # 7. Compilar con swiftc
    cmd_compile = [
        "xcrun",
        "swiftc",
        "-o",
        ruta_ejecutable(ruta_app),
        ruta_swift(ruta_app),
    ]
    result = subprocess.run(cmd_compile, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"Error compilando Swift: {result.stderr}")
    info["pasos"].append(f"Compilado: {' '.join(cmd_compile)}")

    # 8. Firmar ad-hoc
    cmd_sign = ["codesign", "--force", "--sign", "-", ruta_app]
    result = subprocess.run(cmd_sign, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"Error firmando: {result.stderr}")
    info["pasos"].append(f"Firmado ad-hoc: {' '.join(cmd_sign)}")

    info["pasos"].append("App creada correctamente")
    return info


def instalar(seco: bool = False, ruta_app: Optional[str] = None) -> dict:
    """Respaldar plist, cambiar ProgramArguments al ejecutable de la app, recargar launchd."""
    ruta_app = ruta_app or ruta_app_por_defecto()
    info = {
        "plist": PLIST_SISTEMA,
        "app": ruta_app,
        "seco": seco,
        "pasos": [],
    }

    if not os.path.exists(PLIST_SISTEMA):
        raise FileNotFoundError(f"No existe el plist del servicio: {PLIST_SISTEMA}")

    if not os.path.exists(ruta_ejecutable(ruta_app)):
        raise FileNotFoundError(f"No existe el ejecutable de la app: {ruta_ejecutable(ruta_app)}. Ejecuta 'construir' primero.")

    # 1. Leer plist actual
    with open(PLIST_SISTEMA, "rb") as f:
        plist = plistlib.load(f)

    args_originales = plist.get("ProgramArguments", [])
    info["programarguments_original"] = args_originales
    info["pasos"].append(f"ProgramArguments original: {args_originales}")

    # 2. Respaldar plist
    ruta_respaldo = ruta_respaldo_plist()
    info["respaldo"] = ruta_respaldo
    if not seco:
        shutil.copy2(PLIST_SISTEMA, ruta_respaldo)
    info["pasos"].append(f"Respaldo en {ruta_respaldo}")

    # 3. Cambiar ProgramArguments
    nuevos_args = nuevo_programarguments(ruta_app)
    plist["ProgramArguments"] = nuevos_args
    info["programarguments_nuevo"] = nuevos_args
    info["pasos"].append(f"ProgramArguments nuevo: {nuevos_args}")

    if not seco:
        with open(PLIST_SISTEMA, "wb") as f:
            plistlib.dump(plist, f)
        info["pasos"].append("Plist actualizado")

        # 4. Recargar launchd
        uid = os.getuid()
        subprocess.run(["launchctl", "bootout", f"gui/{uid}", PLIST_SISTEMA], capture_output=True)
        subprocess.run(["launchctl", "bootstrap", f"gui/{uid}", PLIST_SISTEMA], capture_output=True)
        info["pasos"].append(f"launchd recargado (gui/{uid})")
    else:
        info["pasos"].append("(seco) No se escribe ni recarga")

    return info


def deshacer(seco: bool = False) -> dict:
    """Restaura el plist original desde el respaldo más reciente y recarga launchd."""
    info = {"plist": PLIST_SISTEMA, "seco": seco, "pasos": []}

    # Buscar el respaldo más reciente
    directorio = os.path.dirname(PLIST_SISTEMA)
    patron = os.path.basename(PLIST_SISTEMA) + ".antes-lanzador-"
    respaldos = sorted([
        f for f in os.listdir(directorio)
        if f.startswith(patron)
    ], reverse=True)

    if not respaldos:
        raise FileNotFoundError("No hay respaldo del plist original")

    ruta_respaldo = os.path.join(directorio, respaldos[0])
    info["respaldo_usado"] = ruta_respaldo
    info["pasos"].append(f"Usando respaldo: {ruta_respaldo}")

    if not seco:
        shutil.copy2(ruta_respaldo, PLIST_SISTEMA)
        info["pasos"].append("Plist restaurado")

        uid = os.getuid()
        subprocess.run(["launchctl", "bootout", f"gui/{uid}", PLIST_SISTEMA], capture_output=True)
        subprocess.run(["launchctl", "bootstrap", f"gui/{uid}", PLIST_SISTEMA], capture_output=True)
        info["pasos"].append(f"launchd recargado (gui/{uid})")
    else:
        info["pasos"].append("(seco) No se restaura ni recarga")

    return info


def estado() -> dict:
    """Devuelve qué ejecuta el servicio hoy y si la app existe."""
    info = {
        "plist_existe": os.path.exists(PLIST_SISTEMA),
        "app_existe": os.path.exists(ruta_app_por_defecto()),
        "app_ruta": ruta_app_por_defecto(),
        "ejecutable_existe": os.path.exists(ruta_ejecutable(ruta_app_por_defecto())),
    }

    if info["plist_existe"]:
        with open(PLIST_SISTEMA, "rb") as f:
            plist = plistlib.load(f)
        info["programarguments_actual"] = plist.get("ProgramArguments", [])
        info["label"] = plist.get("Label", "")
    else:
        info["programarguments_actual"] = []
        info["label"] = ""

    # Buscar respaldos
    directorio = os.path.dirname(PLIST_SISTEMA)
    patron = os.path.basename(PLIST_SISTEMA) + ".antes-lanzador-"
    respaldos = sorted([
        f for f in os.listdir(directorio)
        if f.startswith(patron)
    ], reverse=True)
    info["respaldos_disponibles"] = respaldos[:5]  # últimos 5

    return info


# ─── CLI ─────────────────────────────────────────────────────────────

def _imprimir_resultado(resultado: dict, titulo: str) -> None:
    print(f"=== {titulo} ===")
    for k, v in resultado.items():
        if k == "pasos":
            for paso in v:
                print(f"  - {paso}")
        elif isinstance(v, list):
            print(f"{k}:")
            for item in v:
                print(f"  - {item}")
        else:
            print(f"{k}: {v}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Lanzador propio de Hermes (StarSeed Hermes.app)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Subórdenes:
  construir --seco    Muestra lo que haría sin escribir en disco
  construir           Crea ~/Applications/StarSeed Hermes.app firmada ad-hoc
  instalar --seco     Muestra cambios en el plist sin aplicarlos
  instalar            Respaldar plist, cambiar ProgramArguments, recargar launchd
  deshacer            Restaurar plist original y recargar launchd
  estado              Qué ejecuta el servicio hoy y si la app existe
        """,
    )
    parser.add_argument("suborden", choices=["construir", "instalar", "deshacer", "estado"])
    parser.add_argument("--seco", action="store_true", help="Simular sin tocar el sistema")
    parser.add_argument("--app", help="Ruta personalizada de la app (por defecto ~/Applications/StarSeed Hermes.app)")

    args = parser.parse_args()

    try:
        if args.suborden == "construir":
            resultado = construir(seco=args.seco, ruta_app=args.app)
            _imprimir_resultado(resultado, "CONSTRUIR")
        elif args.suborden == "instalar":
            resultado = instalar(seco=args.seco, ruta_app=args.app)
            _imprimir_resultado(resultado, "INSTALAR")
        elif args.suborden == "deshacer":
            resultado = deshacer(seco=args.seco)
            _imprimir_resultado(resultado, "DESHACER")
        elif args.suborden == "estado":
            resultado = estado()
            _imprimir_resultado(resultado, "ESTADO")
        return 0
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())