#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""TurboFieldfare — lanzar y vigilar servidor local (RIA1023H)."""

from __future__ import annotations

import json
import os
import platform
import socket
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


LOG_PATH = Path("/tmp/starseed-turbo-fieldfare.log")
DEFAULT_MODEL_REL = "scratch/gemma4.gturbo"
SERVER_BINARY_NAME = "TurboFieldfareServer"
HEALTH_ENDPOINT = "http://127.0.0.1:8080/health"
SERVER_PORT = 8080
MIN_FREE_MEMORY_GB = 2
MIN_MACOS_VERSION = (26, 0)


@dataclass
class TurboFieldfareStatus:
    instalado: bool
    binario: Optional[Path]
    modelo: Optional[Path]
    macos_ok: bool
    puerto_ocupado: bool
    memoria_libre_gb: float
    servidor_activo: bool
    mensaje: str


def _log(mensaje: str) -> None:
    """Escribe en el log con marca de tiempo."""
    marca = time.strftime("%Y-%m-%d %H:%M:%S")
    with LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(f"[{marca}] {mensaje}\n")


def _macos_version() -> tuple[int, ...]:
    """Devuelve la versión de macOS como tupla de enteros."""
    try:
        ver = platform.mac_ver()[0]
        return tuple(int(x) for x in ver.split("."))
    except Exception:
        return (0, 0)


def _memoria_libre_gb() -> float:
    """Devuelve memoria libre en GB (macOS)."""
    try:
        resultado = subprocess.run(
            ["vm_stat"], capture_output=True, text=True, check=True
        )
        lineas = resultado.stdout.strip().split("\n")
        pagina_bytes = 4096
        libre_paginas = 0
        for linea in lineas:
            if "Pages free" in linea:
                libre_paginas = int(linea.split(":")[1].strip().rstrip("."))
                break
        return (libre_paginas * pagina_bytes) / (1024**3)
    except Exception:
        return 0.0


def _puerto_ocupado(puerto: int = SERVER_PORT) -> bool:
    """Verifica si el puerto está en uso en 127.0.0.1."""
    try:
        with socket.create_connection(("127.0.0.1", puerto), timeout=1):
            return True
    except Exception:
        return False


def _servidor_responde() -> bool:
    """Verifica si el servidor TurboFieldfare responde en /health."""
    try:
        import urllib.request
        req = urllib.request.Request(HEALTH_ENDPOINT, method="GET")
        with urllib.request.urlopen(req, timeout=2) as resp:
            return resp.status == 200
    except Exception:
        return False


def _buscar_binario() -> Optional[Path]:
    """Busca el binario TurboFieldfareServer en ubicaciones comunes."""
    # 1. En PATH
    ruta_path = shutil.which(SERVER_BINARY_NAME)
    if ruta_path:
        return Path(ruta_path)

    # 2. En repositorios clonados típicos
    bases = [
        Path.home() / "Documents",
        Path.home() / "Development",
        Path.home() / "Projects",
        Path.home() / "src",
        Path("/opt"),
    ]
    for base in bases:
        if not base.exists():
            continue
        for repo in base.glob("turbo-fieldfare*"):
            binario = repo / ".build" / "release" / SERVER_BINARY_NAME
            if binario.exists():
                return binario
    return None


def _buscar_modelo(binario: Optional[Path]) -> Optional[Path]:
    """Busca el modelo .gturbo asociado al binario."""
    if binario is None:
        return None

    # 1. Ubicación por defecto relativa al repo del binario
    repo_root = binario.parent.parent.parent  # .build/release/ -> repo root
    modelo_defecto = repo_root / DEFAULT_MODEL_REL
    if _modelo_valido(modelo_defecto):
        return modelo_defecto

    # 2. Configuración de la Mac app
    config_app = (
        Path.home()
        / "Library"
        / "Application Support"
        / "TurboFieldfare"
        / "mac-app-settings.json"
    )
    if config_app.exists():
        try:
            with config_app.open("r", encoding="utf-8") as f:
                data = json.load(f)
            ruta_modelo = data.get("modelPath") or data.get("model_path")
            if ruta_modelo:
                modelo = Path(ruta_modelo).expanduser()
                if _modelo_valido(modelo):
                    return modelo
        except Exception:
            pass

    # 3. Buscar cualquier .gturbo en el repo del binario
    if repo_root.exists():
        for candidato in repo_root.glob("**/*.gturbo"):
            if _modelo_valido(candidato):
                return candidato
    return None


def _modelo_valido(ruta: Path) -> bool:
    """Verifica que la ruta es un modelo .gturbo válido (tiene manifest.json)."""
    if not ruta.exists() or not ruta.is_dir():
        return False
    return (ruta / "manifest.json").exists()


def _encontrar_proceso_servidor() -> Optional[int]:
    """Encuentra el PID del proceso TurboFieldfareServer que escucha en 8080."""
    try:
        resultado = subprocess.run(
            ["lsof", "-ti", f"tcp:127.0.0.1:{SERVER_PORT}"],
            capture_output=True,
            text=True,
        )
        pids = resultado.stdout.strip().split()
        for pid_str in pids:
            try:
                pid = int(pid_str)
                # Verificar que es TurboFieldfareServer
                cmd = subprocess.run(
                    ["ps", "-p", str(pid), "-o", "comm="],
                    capture_output=True,
                    text=True,
                )
                if SERVER_BINARY_NAME in cmd.stdout:
                    return pid
            except Exception:
                continue
    except Exception:
        pass
    return None


def obtener_estado() -> TurboFieldfareStatus:
    """Obtiene el estado completo de TurboFieldfare."""
    binario = _buscar_binario()
    modelo = _buscar_modelo(binario)
    instalado = binario is not None and modelo is not None
    macos_ver = _macos_version()
    macos_ok = macos_ver >= MIN_MACOS_VERSION
    puerto_ocupado = _puerto_ocupado()
    memoria_libre = _memoria_libre_gb()
    servidor_activo = _servidor_responde()

    partes = []
    if not instalado:
        partes.append("TurboFieldfare NO instalado")
    else:
        partes.append("TurboFieldfare instalado")
        if binario:
            partes.append(f"binario: {binario}")
        if modelo:
            partes.append(f"modelo: {modelo}")
    if not macos_ok:
        partes.append(f"macOS {macos_ver[0]}.{macos_ver[1]} < 26 (requerido)")
    if puerto_ocupado:
        partes.append("puerto 8080 ocupado")
    if servidor_activo:
        partes.append("servidor ACTIVO en 127.0.0.1:8080")
    partes.append(f"memoria libre: {memoria_libre:.1f} GB")

    return TurboFieldfareStatus(
        instalado=instalado,
        binario=binario,
        modelo=modelo,
        macos_ok=macos_ok,
        puerto_ocupado=puerto_ocupado,
        memoria_libre_gb=memoria_libre,
        servidor_activo=servidor_activo,
        mensaje="; ".join(partes),
    )


def puede_encender(estado: TurboFieldfareStatus) -> tuple[bool, str]:
    """Decide si se puede encender el servidor (lógica pura)."""
    if not estado.instalado:
        return False, "TurboFieldfare no está instalado (falta binario o modelo)"
    if not estado.macos_ok:
        return False, "macOS < 26 (requerido macOS 26+)"
    if estado.puerto_ocupado or estado.servidor_activo:
        return False, "El puerto 8080 ya está en uso (otro dueño)"
    if estado.memoria_libre_gb < MIN_FREE_MEMORY_GB:
        return False, f"Memoria libre insuficiente: {estado.memoria_libre_gb:.1f} GB < {MIN_FREE_MEMORY_GB} GB"
    return True, "OK"


def encender() -> tuple[bool, str]:
    """Enciende el servidor TurboFieldfare."""
    _log("Intento de encendido")
    estado = obtener_estado()
    _log(f"Estado: {estado.mensaje}")

    ok, motivo = puede_encender(estado)
    if not ok:
        _log(f"Encendido denegado: {motivo}")
        return False, motivo

    if estado.binario is None or estado.modelo is None:
        _log("Error interno: binario o modelo None tras verificar instalado")
        return False, "Error interno: binario o modelo no encontrado"

    # Lanzar servidor en background
    cmd = [
        str(estado.binario),
        "--model",
        str(estado.modelo),
        "--port",
        str(SERVER_PORT),
    ]
    _log(f"Lanzando: {' '.join(cmd)}")

    try:
        with LOG_PATH.open("a", encoding="utf-8") as log_file:
            proc = subprocess.Popen(
                cmd,
                stdout=log_file,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
        _log(f"Proceso iniciado con PID {proc.pid}")

        # Esperar a que el servidor responda (máx 30 s)
        for _ in range(60):
            time.sleep(0.5)
            if _servidor_responde():
                _log("Servidor listo y respondiendo en /health")
                return True, "Servidor TurboFieldfare encendido en 127.0.0.1:8080/v1"
        _log("Timeout: servidor no respondió en 30 s")
        return False, "Timeout: servidor no respondió en 30 s"

    except Exception as e:
        _log(f"Error al lanzar servidor: {e}")
        return False, f"Error al lanzar: {e}"


def apagar() -> tuple[bool, str]:
    """Apaga el servidor TurboFieldfare."""
    _log("Intento de apagado")
    pid = _encontrar_proceso_servidor()
    if pid is None:
        _log("No se encontró proceso TurboFieldfare en puerto 8080")
        return True, "No había servidor TurboFieldfare corriendo"

    try:
        os.kill(pid, 15)  # SIGTERM
        _log(f"SIGTERM enviado a PID {pid}")
        # Esperar a que termine (máx 10 s)
        for _ in range(20):
            time.sleep(0.5)
            if not _puerto_ocupado():
                _log("Servidor apagado correctamente")
                return True, "Servidor TurboFieldfare apagado"
        # Forzar si no termina
        os.kill(pid, 9)  # SIGKILL
        _log(f"SIGKILL enviado a PID {pid}")
        return True, "Servidor TurboFieldfare forzado a cerrar"
    except ProcessLookupError:
        _log("Proceso ya no existía")
        return True, "Servidor ya no estaba corriendo"
    except Exception as e:
        _log(f"Error al apagar: {e}")
        return False, f"Error al apagar: {e}"


def cmd_estado() -> int:
    """Comando estado: imprime estado y sale 0."""
    estado = obtener_estado()
    print(estado.mensaje)
    if not estado.instalado:
        print("NOTA: TurboFieldfare no está instalado. Clona el repo y compila:")
        print("  git clone https://github.com/drumih/turbo-fieldfare.git")
        print("  cd turbo-fieldfare && swift build -c release --product TurboFieldfareServer")
        print("  Luego instala el modelo con la Mac app o TurboFieldfareRepack")
    return 0


def cmd_encender() -> int:
    """Comando encender: intenta encender el servidor."""
    ok, msg = encender()
    print(msg)
    return 0 if ok else 1


def cmd_apagar() -> int:
    """Comando apagar: apaga el servidor."""
    ok, msg = apagar()
    print(msg)
    return 0 if ok else 1


def main() -> int:
    if len(sys.argv) < 2:
        print("Uso: turbo_fieldfare.py estado|encender|apagar", file=sys.stderr)
        return 1

    comando = sys.argv[1].lower()
    if comando == "estado":
        return cmd_estado()
    elif comando == "encender":
        return cmd_encender()
    elif comando == "apagar":
        return cmd_apagar()
    else:
        print(f"Comando desconocido: {comando}", file=sys.stderr)
        print("Uso: turbo_fieldfare.py estado|encender|apagar", file=sys.stderr)
        return 1


if __name__ == "__main__":
    import shutil  # noqa: E402 — usado en _buscar_binario
    sys.exit(main())