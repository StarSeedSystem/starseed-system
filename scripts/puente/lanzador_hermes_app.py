#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Lanzador propio de Hermes («StarSeed Hermes.app») para permisos de macOS.

Subórdenes:
  construir --seco    Muestra qué haría sin escribir nada
  construir           Crea ~/Applications/StarSeed Hermes.app
  instalar --seco     Muestra qué haría sin tocar el sistema
  instalar            Instala la app y cambia el LaunchAgent
  deshacer            Revierte al plist original
  estado              Qué ejecuta hoy el servicio y si la app existe
"""
import argparse
import plistlib
import shutil
import subprocess
import sys
import os
from datetime import datetime
from pathlib import Path

# Constantes
RUTA_APP = Path.home() / "Applications" / "StarSeed Hermes.app"
RUTA_PLIST = Path.home() / "Library" / "LaunchAgents" / "ai.hermes.gateway.plist"
IDENTIFICADOR_BUNDLE = "org.starseed.hermes-lanzador"
NOMBRE_BUNDLE = "StarSeed Hermes"
EJECUTABLE_NOMBRE = "starseed-hermes"


# ─── Funciones puras (sin efectos de sistema) ───

def extraer_comando_desde_plist(ruta_plist: Path) -> list[str]:
    """Extrae el comando real tras 'exec ' del argumento de osascript en el plist."""
    with open(ruta_plist, "rb") as f:
        data = plistlib.load(f)

    args = data.get("ProgramArguments", [])
    if not args or args[0] != "/usr/bin/osascript":
        raise ValueError("El plist no usa /usr/bin/osascript como programa")

    # Buscar el argumento que contiene 'exec '
    script_arg = None
    for i, arg in enumerate(args):
        if arg == "-e" and i + 1 < len(args):
            script_arg = args[i + 1]
            break
        elif arg.startswith("-e"):
            script_arg = arg[2:]
            break

    if not script_arg:
        raise ValueError("No se encontró argumento -e en osascript")

    script_arg = script_arg.strip()
    if not script_arg.startswith("exec "):
        raise ValueError("El script de osascript no comienza con 'exec '")

    comando_str = script_arg[5:].strip()  # quitar 'exec '
    # Dividir respetando comillas simples/dobles
    import shlex
    return shlex.split(comando_str)


def generar_info_plist() -> dict:
    """Genera el diccionario para Info.plist del bundle."""
    return {
        "CFBundleIdentifier": IDENTIFICADOR_BUNDLE,
        "CFBundleName": NOMBRE_BUNDLE,
        "CFBundleDisplayName": NOMBRE_BUNDLE,
        "CFBundleExecutable": EJECUTABLE_NOMBRE,
        "CFBundlePackageType": "APPL",
        "CFBundleVersion": "1.0",
        "CFBundleShortVersionString": "1.0",
        "LSUIElement": True,
        "CFBundleInfoDictionaryVersion": "6.0",
        "CFBundleSupportedPlatforms": ["MacOSX"],
        "LSMinimumSystemVersion": "13.0",
    }


def generar_swift_ejecutable(comando: list[str]) -> str:
    """Genera código Swift mínimo que hace execv del comando dado."""
    # Escapar para string literal Swift
    args_escaped = [arg.replace("\\", "\\\\").replace('"', '\\"') for arg in comando]
    args_swift = '", "'.join(args_escaped)

    return f'''import Foundation

@main
struct LanzadorHermes {{
    static func main() {{
        let args: [String] = ["{args_swift}"]
        let argv = args.map {{ $0.withCString {{ strdup($0) }} }} + [nil]
        defer {{ argv.forEach {{ if let p = $0 {{ free(p) }} }} }}
        execv(argv[0], argv)
        // Si execv vuelve, hubo error
        perror("execv failed")
        exit(1)
    }}
}}
'''


def decidir_nuevos_program_arguments() -> list[str]:
    """Devuelve los nuevos ProgramArguments para el LaunchAgent."""
    return [str(RUTA_APP / "Contents" / "MacOS" / EJECUTABLE_NOMBRE)]


def leer_plist_actual() -> dict | None:
    """Lee el plist actual si existe."""
    if not RUTA_PLIST.exists():
        return None
    with open(RUTA_PLIST, "rb") as f:
        return plistlib.load(f)


def escribir_plist(data: dict) -> None:
    """Escribe el plist (crea directorio si hace falta)."""
    RUTA_PLIST.parent.mkdir(parents=True, exist_ok=True)
    with open(RUTA_PLIST, "wb") as f:
        plistlib.dump(data, f)


def ruta_backup_plist() -> Path:
    """Ruta del backup con timestamp."""
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    return RUTA_PLIST.with_suffix(f".plist.antes-lanzador-{ts}")


# ─── Funciones con efectos de sistema ───

def construir_app(seco: bool = False) -> dict:
    """Crea la app bundle en ~/Applications/StarSeed Hermes.app."""
    resultado = {"ok": True, "pasos": [], "seco": seco}

    # 1. Leer comando del plist actual
    if not RUTA_PLIST.exists():
        resultado["ok"] = False
        resultado["error"] = f"Plist no encontrado: {RUTA_PLIST}"
        return resultado

    try:
        comando = extraer_comando_desde_plist(RUTA_PLIST)
        resultado["pasos"].append(f"Comando extraído: {' '.join(comando)}")
    except Exception as e:
        resultado["ok"] = False
        resultado["error"] = f"Error leyendo plist: {e}"
        return resultado

    # 2. Preparar rutas
    contents = RUTA_APP / "Contents"
    macos = contents / "MacOS"
    resources = contents / "Resources"

    if seco:
        resultado["pasos"].append(f"[SECO] Crearía directorios: {contents}, {macos}, {resources}")
        resultado["pasos"].append(f"[SECO] Escribiría Info.plist en {contents}/Info.plist")
        resultado["pasos"].append(f"[SECO] Generaría Swift en {macos}/{EJECUTABLE_NOMBRE}.swift")
        resultado["pasos"].append(f"[SECO] Compilaría con xcrun swiftc a {macos}/{EJECUTABLE_NOMBRE}")
        resultado["pasos"].append(f"[SECO] Firmaría ad-hoc con codesign --force --sign - {RUTA_APP}")
        return resultado

    # 3. Crear directorios
    for d in (contents, macos, resources):
        d.mkdir(parents=True, exist_ok=True)
        resultado["pasos"].append(f"Creado directorio: {d}")

    # 4. Escribir Info.plist
    info_plist = generar_info_plist()
    info_path = contents / "Info.plist"
    with open(info_path, "wb") as f:
        plistlib.dump(info_plist, f)
    resultado["pasos"].append(f"Escrito Info.plist: {info_path}")

    # 5. Generar y compilar Swift
    swift_code = generar_swift_ejecutable(comando)
    swift_path = macos / f"{EJECUTABLE_NOMBRE}.swift"
    with open(swift_path, "w") as f:
        f.write(swift_code)
    resultado["pasos"].append(f"Escrito Swift: {swift_path}")

    # Compilar
    bin_path = macos / EJECUTABLE_NOMBRE
    try:
        subprocess.run(
            ["xcrun", "swiftc", "-o", str(bin_path), str(swift_path)],
            check=True,
            capture_output=True,
            text=True,
        )
        resultado["pasos"].append(f"Compilado: {bin_path}")
    except subprocess.CalledProcessError as e:
        resultado["ok"] = False
        resultado["error"] = f"Error compilando Swift: {e.stderr}"
        return resultado

    # 6. Firmar ad-hoc
    try:
        subprocess.run(
            ["codesign", "--force", "--sign", "-", str(RUTA_APP)],
            check=True,
            capture_output=True,
            text=True,
        )
        resultado["pasos"].append(f"Firmado ad-hoc: {RUTA_APP}")
    except subprocess.CalledProcessError as e:
        resultado["ok"] = False
        resultado["error"] = f"Error firmando: {e.stderr}"
        return resultado

    # Limpiar .swift
    swift_path.unlink(missing_ok=True)
    resultado["pasos"].append("Limpiado archivo .swift temporal")

    return resultado


def instalar_app(seco: bool = False) -> dict:
    """Instala la app y actualiza el LaunchAgent."""
    resultado = {"ok": True, "pasos": [], "seco": seco}

    if not RUTA_APP.exists():
        resultado["ok"] = False
        resultado["error"] = f"App no existe: {RUTA_APP}. Ejecuta 'construir' primero."
        return resultado

    if not RUTA_PLIST.exists():
        resultado["ok"] = False
        resultado["error"] = f"Plist no encontrado: {RUTA_PLIST}"
        return resultado

    # Backup del plist actual
    backup = ruta_backup_plist()
    if seco:
        resultado["pasos"].append(f"[SECO] Haría backup a: {backup}")
    else:
        shutil.copy2(RUTA_PLIST, backup)
        resultado["pasos"].append(f"Backup guardado: {backup}")

    # Leer plist actual
    with open(RUTA_PLIST, "rb") as f:
        plist_data = plistlib.load(f)

    # Cambiar ProgramArguments
    nuevos_args = decidir_nuevos_program_arguments()
    plist_data["ProgramArguments"] = nuevos_args
    resultado["pasos"].append(f"Nuevos ProgramArguments: {nuevos_args}")

    if seco:
        resultado["pasos"].append(f"[SECO] Escribiría plist modificado a {RUTA_PLIST}")
        resultado["pasos"].append("[SECO] Ejecutaría: launchctl bootout gui/$(id -u) ai.hermes.gateway")
        resultado["pasos"].append("[SECO] Ejecutaría: launchctl bootstrap gui/$(id -u) <plist>")
        return resultado

    # Escribir plist modificado
    escribir_plist(plist_data)
    resultado["pasos"].append(f"Plist actualizado: {RUTA_PLIST}")

    # Recargar launchd
    uid = os.getuid()
    label = "ai.hermes.gateway"
    try:
        subprocess.run(["launchctl", "bootout", f"gui/{uid}", label], check=False, capture_output=True)
        resultado["pasos"].append(f"launchctl bootout gui/{uid} {label}")
    except Exception as e:
        resultado["pasos"].append(f"Aviso bootout: {e}")

    try:
        subprocess.run(["launchctl", "bootstrap", f"gui/{uid}", str(RUTA_PLIST)], check=True, capture_output=True, text=True)
        resultado["pasos"].append(f"launchctl bootstrap gui/{uid} {RUTA_PLIST}")
    except subprocess.CalledProcessError as e:
        resultado["ok"] = False
        resultado["error"] = f"Error en bootstrap: {e.stderr}"
        return resultado

    return resultado


def deshacer_instalacion(seco: bool = False) -> dict:
    """Revierte al plist original usando el backup más reciente."""
    resultado = {"ok": True, "pasos": [], "seco": seco}

    # Buscar backups
    backups = sorted(RUTA_PLIST.parent.glob("ai.hermes.gateway.plist.antes-lanzador-*"))
    if not backups:
        resultado["ok"] = False
        resultado["error"] = "No hay backup para revertir"
        return resultado

    backup_mas_reciente = backups[-1]
    resultado["pasos"].append(f"Backup encontrado: {backup_mas_reciente}")

    if seco:
        resultado["pasos"].append(f"[SECO] Restauraría {backup_mas_reciente} a {RUTA_PLIST}")
        resultado["pasos"].append("[SECO] Recargaría launchd")
        return resultado

    # Restaurar
    shutil.copy2(backup_mas_reciente, RUTA_PLIST)
    resultado["pasos"].append(f"Restaurado: {RUTA_PLIST}")

    # Recargar launchd
    uid = os.getuid()
    label = "ai.hermes.gateway"
    try:
        subprocess.run(["launchctl", "bootout", f"gui/{uid}", label], check=False, capture_output=True)
        subprocess.run(["launchctl", "bootstrap", f"gui/{uid}", str(RUTA_PLIST)], check=True, capture_output=True, text=True)
        resultado["pasos"].append("Launchd recargado")
    except subprocess.CalledProcessError as e:
        resultado["ok"] = False
        resultado["error"] = f"Error recargando launchd: {e.stderr}"
        return resultado

    return resultado


def estado_servicio() -> dict:
    """Devuelve el estado actual del servicio y la app."""
    resultado = {
        "app_existe": RUTA_APP.exists(),
        "app_ruta": str(RUTA_APP),
        "plist_existe": RUTA_PLIST.exists(),
        "plist_ruta": str(RUTA_PLIST),
        "ejecutable_actual": None,
        "usa_launcher": False,
    }

    if RUTA_PLIST.exists():
        try:
            with open(RUTA_PLIST, "rb") as f:
                data = plistlib.load(f)
            args = data.get("ProgramArguments", [])
            resultado["ejecutable_actual"] = args[0] if args else None
            resultado["program_arguments_completos"] = args
            # Verificar si ya usa nuestra app
            esperado = str(RUTA_APP / "Contents" / "MacOS" / EJECUTABLE_NOMBRE)
            resultado["usa_launcher"] = args == [esperado]
        except Exception as e:
            resultado["error_leyendo_plist"] = str(e)

    # Verificar si el servicio está cargado
    try:
        out = subprocess.run(["launchctl", "list", "ai.hermes.gateway"], capture_output=True, text=True)
        resultado["servicio_cargado"] = out.returncode == 0
        if out.returncode == 0:
            resultado["launchctl_list"] = out.stdout.strip()
    except Exception:
        resultado["servicio_cargado"] = False

    return resultado


# ─── CLI ───

def main():
    parser = argparse.ArgumentParser(description="Lanzador StarSeed Hermes para permisos macOS")
    sub = parser.add_subparsers(dest="comando", required=True)

    sub.add_parser("construir", help="Crea la app bundle").add_argument("--seco", action="store_true")
    sub.add_parser("instalar", help="Instala la app y actualiza LaunchAgent").add_argument("--seco", action="store_true")
    sub.add_parser("deshacer", help="Revierte al plist original").add_argument("--seco", action="store_true")
    sub.add_parser("estado", help="Muestra estado del servicio y la app")

    args = parser.parse_args()

    if args.comando == "construir":
        res = construir_app(seco=args.seco)
    elif args.comando == "instalar":
        res = instalar_app(seco=args.seco)
    elif args.comando == "deshacer":
        res = deshacer_instalacion(seco=args.seco)
    elif args.comando == "estado":
        res = estado_servicio()
    else:
        parser.error(f"Comando desconocido: {args.comando}")
        return 1

    # Imprimir resultado
    import json
    print(json.dumps(res, ensure_ascii=False, indent=2))
    return 0 if res.get("ok", True) else 1


if __name__ == "__main__":
    sys.exit(main())