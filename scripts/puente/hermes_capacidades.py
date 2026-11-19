#!/usr/bin/env python3
"""Comprobación de capacidades de Hermes en macOS: pantalla, control, registros y lanzador.

Escribe resultado en ~/.starseed/hermes-capacidades.json y publica informe en el Chat Director.
Lógica de interpretación pura con pruebas unitarias (salidas de ejemplo; sin ejecutar nada real).
"""
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any


MAGGABOX_HOST = "maggabox"
MAGGABOX_LOG = "~/Library/Logs/app.starseed.os/enlaces.log"
SSH_TIMEOUT_S = 8


def _ruta_resultado() -> Path:
    return Path.home() / ".starseed" / "hermes-capacidades.json"


def _ruta_log_mac() -> Path:
    return Path.home() / "Library" / "Logs" / "app.starseed.os" / "enlaces.log"


def interpretar_captura(
    codigo_salida: int,
    stderr: str,
    ruta_archivo: str,
    tamano_bytes: int,
    es_negro: bool,
) -> dict[str, Any]:
    """Interpreta resultado de screencapture (lógica pura)."""
    if codigo_salida != 0 or "could not create image from display" in stderr:
        return {
            "disponible": False,
            "falta": "grabacion_pantalla",
            "detalle": "Permiso de grabación de pantalla denegado",
            "ruta_ajustes": "Ajustes del Sistema → Privacidad y seguridad → Grabación de pantalla",
        }
    if tamano_bytes == 0:
        return {
            "disponible": False,
            "falta": "grabacion_pantalla",
            "detalle": "Archivo de captura no creado o vacío",
            "ruta_ajustes": "Ajustes del Sistema → Privacidad y seguridad → Grabación de pantalla",
        }
    if es_negro:
        return {
            "disponible": False,
            "falta": "grabacion_pantalla",
            "detalle": "Captura creada pero imagen negra (vacía)",
            "ruta_ajustes": "Ajustes del Sistema → Privacidad y seguridad → Grabación de pantalla",
        }
    return {
        "disponible": True,
        "falta": "",
        "detalle": f"Captura OK ({tamano_bytes // 1024} KB)",
        "ruta_ajustes": "",
    }


def _es_imagen_negra(ruta: str) -> bool:
    """Detecta si una imagen PNG es mayormente negra (heurística simple)."""
    try:
        from PIL import Image  # type: ignore[import-not-found]
        with Image.open(ruta) as img:
            img = img.convert("RGB")
            pixeles = list(img.getdata())
            if not pixeles:
                return True
            negros = sum(1 for r, g, b in pixeles if r < 10 and g < 10 and b < 10)
            return negros / len(pixeles) > 0.95
    except Exception:
        return False


def ejecutar_captura() -> dict[str, Any]:
    """Ejecuta screencapture y devuelve datos brutos para interpretar."""
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        ruta_tmp = tmp.name
    try:
        resultado = subprocess.run(
            ["screencapture", "-x", ruta_tmp],
            capture_output=True,
            text=True,
            timeout=10,
        )
        tamano = os.path.getsize(ruta_tmp) if os.path.exists(ruta_tmp) else 0
        es_negro = _es_imagen_negra(ruta_tmp) if tamano > 0 else False
        return {
            "codigo_salida": resultado.returncode,
            "stderr": resultado.stderr.strip(),
            "ruta_archivo": ruta_tmp,
            "tamano_bytes": tamano,
            "es_negro": es_negro,
        }
    finally:
        if os.path.exists(ruta_tmp):
            try:
                os.unlink(ruta_tmp)
            except Exception:
                pass


def interpretar_control(codigo_salida: int, stdout: str, stderr: str) -> dict[str, Any]:
    """Interpreta resultado de osascript para Accesibilidad (lógica pura)."""
    if codigo_salida == 0 and stdout.strip():
        return {
            "disponible": True,
            "falta": "",
            "detalle": f"Control OK ({stdout.strip()})",
            "ruta_ajustes": "",
        }
    if "not allowed" in stderr.lower() or "not authorized" in stderr.lower() or "accesibilidad" in stderr.lower():
        return {
            "disponible": False,
            "falta": "accesibilidad",
            "detalle": "Permiso de Accesibilidad denegado",
            "ruta_ajustes": "Ajustes del Sistema → Privacidad y seguridad → Accesibilidad",
        }
    return {
        "disponible": False,
        "falta": "accesibilidad",
        "detalle": f"Error osascript: {stderr.strip() or 'desconocido'}",
        "ruta_ajustes": "Ajustes del Sistema → Privacidad y seguridad → Accesibilidad",
    }


def ejecutar_control() -> dict[str, Any]:
    """Ejecuta osascript para comprobar Accesibilidad."""
    resultado = subprocess.run(
        ["osascript", "-e", 'tell application "System Events" to get name of first process'],
        capture_output=True,
        text=True,
        timeout=10,
    )
    return {
        "codigo_salida": resultado.returncode,
        "stdout": resultado.stdout.strip(),
        "stderr": resultado.stderr.strip(),
    }


def interpretar_registros_mac(ruta_log: str) -> dict[str, Any]:
    """Interpreta archivo de log local de la Mac (lógica pura)."""
    path = Path(ruta_log)
    if not path.exists():
        return {
            "disponible": False,
            "falta": "archivo_log_mac",
            "detalle": f"Archivo no encontrado: {ruta_log}",
            "ruta_ajustes": "",
        }
    try:
        tamano = path.stat().st_size
        lineas = path.read_text(encoding="utf-8", errors="replace").strip().splitlines()
        ultima = lineas[-1] if lineas else "(vacío)"
        return {
            "disponible": True,
            "falta": "",
            "detalle": f"Log Mac: {tamano} bytes, última: {ultima[:80]}",
            "ruta_ajustes": "",
            "tamano_bytes": tamano,
            "ultima_linea": ultima,
        }
    except Exception as e:
        return {
            "disponible": False,
            "falta": "archivo_log_mac",
            "detalle": f"Error leyendo log: {e}",
            "ruta_ajustes": "",
        }


def ejecutar_registros_mac() -> dict[str, Any]:
    """Lee el log local de la Mac."""
    return interpretar_registros_mac(str(_ruta_log_mac()))


def interpretar_registros_ssh(codigo_salida: int, stdout: str, stderr: str) -> dict[str, Any]:
    """Interpreta resultado de SSH a Maggabox (lógica pura)."""
    if codigo_salida == 0 and stdout.strip():
        lineas = stdout.strip().splitlines()
        tamano = 0
        ultima = ""
        if lineas:
            try:
                tamano = int(lineas[0])
            except ValueError:
                pass
            if len(lineas) > 1:
                ultima = lineas[1]
        return {
            "disponible": True,
            "falta": "",
            "detalle": f"Log Maggabox: {tamano} bytes, última: {ultima[:80]}",
            "ruta_ajustes": "",
            "tamano_bytes": tamano,
            "ultima_linea": ultima,
        }
    return {
        "disponible": False,
        "falta": "ssh_maggabox",
        "detalle": f"SSH falló (código {codigo_salida}): {stderr.strip()[:120]}",
        "ruta_ajustes": "",
    }


def ejecutar_registros_ssh() -> dict[str, Any]:
    """Ejecuta SSH a Maggabox para leer su log."""
    cmd = [
        "ssh",
        "-o", "BatchMode=yes",
        "-o", f"ConnectTimeout={SSH_TIMEOUT_S}",
        "-o", f"ServerAliveInterval={SSH_TIMEOUT_S}",
        "-o", "ServerAliveCountMax=1",
        MAGGABOX_HOST,
        f"stat -c%s {MAGGABOX_LOG} 2>/dev/null && tail -1 {MAGGABOX_LOG} 2>/dev/null",
    ]
    try:
        resultado = subprocess.run(cmd, capture_output=True, text=True, timeout=SSH_TIMEOUT_S + 2)
        return {
            "codigo_salida": resultado.returncode,
            "stdout": resultado.stdout.strip(),
            "stderr": resultado.stderr.strip(),
        }
    except subprocess.TimeoutExpired:
        return {
            "codigo_salida": 255,
            "stdout": "",
            "stderr": "SSH timeout",
        }
    except Exception as e:
        return {
            "codigo_salida": 255,
            "stdout": "",
            "stderr": str(e),
        }


def interpretar_lanzador(estado: dict[str, Any]) -> dict[str, Any]:
    """Interpreta estado del lanzador Hermes (lógica pura)."""
    if not estado.get("app_existe"):
        return {
            "disponible": False,
            "falta": "lanzador_app",
            "detalle": "App StarSeed Hermes no instalada",
            "ruta_ajustes": "",
        }
    if not estado.get("servicio_cargado"):
        return {
            "disponible": False,
            "falta": "lanzador_servicio",
            "detalle": "Servicio launchd no cargado",
            "ruta_ajustes": "",
        }
    if not estado.get("usa_launcher"):
        return {
            "disponible": False,
            "falta": "lanzador_no_usado",
            "detalle": "Servicio usa osascript directo, no el launcher",
            "ruta_ajustes": "",
        }
    return {
        "disponible": True,
        "falta": "",
        "detalle": "Lanzador OK (app + servicio + launcher activo)",
        "ruta_ajustes": "",
    }


def ejecutar_lanzador() -> dict[str, Any]:
    """Obtiene estado del lanzador Hermes."""
    try:
        import lanzador_hermes_app
        return lanzador_hermes_app.estado_servicio()
    except Exception as e:
        return {
            "app_existe": False,
            "servicio_cargado": False,
            "usa_launcher": False,
            "ejecutable_actual": "",
            "error": str(e),
        }


def escribir_resultado(datos: dict[str, Any], ruta: Path | None = None) -> None:
    """Escribe el resultado JSON en disco."""
    ruta = ruta or _ruta_resultado()
    ruta.parent.mkdir(parents=True, exist_ok=True)
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=2)


def generar_informe(datos: dict[str, Any]) -> str:
    """Genera texto del informe para el Chat Director."""
    lineas = ["📋 Informe de capacidades de Hermes (MetaGenesis)"]
    for clave, etiqueta in [
        ("captura", "Captura de pantalla"),
        ("control", "Control (Accesibilidad)"),
        ("registros_mac", "Registros Mac"),
        ("registros_maggabox", "Registros Maggabox (SSH)"),
        ("lanzador", "Lanzador Hermes"),
    ]:
        item = datos.get(clave, {})
        if item.get("disponible"):
            lineas.append(f"✅ {etiqueta}: {item.get('detalle', 'OK')}")
        else:
            falta = item.get("falta", "desconocido")
            detalle = item.get("detalle", "No disponible")
            ruta = item.get("ruta_ajustes", "")
            lineas.append(f"❌ {etiqueta}: {detalle} — falta: {falta}")
            if ruta:
                lineas.append(f"   → Habilitar en: {ruta}")
    return "\n".join(lineas)


def publicar_informe(texto: str, raiz: str | None = None) -> dict[str, Any] | None:
    """Publica el informe en el Chat Director."""
    try:
        import director_chat
        return director_chat.publicar(
            texto=texto,
            de="director-presidente",
            rol="director",
            tipo="informe",
            canal="mando",
            raiz=raiz,
        )
    except Exception:
        return None


def comprobar(raiz: str | None = None) -> dict[str, Any]:
    """Ejecuta todas las comprobaciones y devuelve resultado consolidado."""
    # 1. Captura de pantalla
    datos_captura = ejecutar_captura()
    captura = interpretar_captura(**datos_captura)

    # 2. Control (Accesibilidad)
    datos_control = ejecutar_control()
    control = interpretar_control(**datos_control)

    # 3. Registros Mac
    registros_mac = ejecutar_registros_mac()

    # 4. Registros Maggabox (SSH)
    datos_ssh = ejecutar_registros_ssh()
    registros_maggabox = interpretar_registros_ssh(**datos_ssh)

    # 5. Lanzador Hermes
    datos_lanzador = ejecutar_lanzador()
    lanzador = interpretar_lanzador(datos_lanzador)

    resultado = {
        "timestamp": time.time(),
        "captura": captura,
        "control": control,
        "registros_mac": registros_mac,
        "registros_maggabox": registros_maggabox,
        "lanzador": lanzador,
    }

    # Escribir JSON
    ruta_salida = Path(raiz) / ".starseed" / "hermes-capacidades.json" if raiz else _ruta_resultado()
    escribir_resultado(resultado, ruta_salida)

    # Publicar informe
    informe = generar_informe(resultado)
    publicar_informe(informe, raiz)

    return resultado


def main() -> int:
    """CLI: python -m hermes_capacidades"""
    import argparse
    parser = argparse.ArgumentParser(description="Comprobar capacidades de Hermes")
    parser.add_argument("--raiz", help="Raíz del repo (para pruebas)")
    args = parser.parse_args()

    res = comprobar(raiz=args.raiz)
    print(json.dumps(res, ensure_ascii=False, indent=2))
    return 0 if all(
        res[k]["disponible"] for k in ("captura", "control", "registros_mac", "registros_maggabox", "lanzador")
    ) else 1


if __name__ == "__main__":
    sys.exit(main())