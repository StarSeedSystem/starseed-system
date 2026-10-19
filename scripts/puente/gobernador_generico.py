#!/usr/bin/env python3
"""Gobernador genérico: funciones de medición de hardware multiplataforma."""

import platform
import shutil
import subprocess
import os


def de_meminfo(texto: str) -> dict | None:
    """Parsea la salida de /proc/meminfo y devuelve memoria total y disponible en MB."""
    if not texto.strip():
        return None
    
    result = {"total_mb": None, "disponible_mb": None}
    lines = texto.splitlines()
    
    for line in lines:
        if line.startswith("MemTotal:"):
            try:
                # Format: "MemTotal:       8065216 kB"
                value = int(line.split()[1])
                result["total_mb"] = value // 1024  # Convert kB to MB
            except (IndexError, ValueError):
                pass
        elif line.startswith("MemAvailable:"):
            try:
                # Format: "MemAvailable:    123456 kB"
                value = int(line.split()[1])
                result["disponible_mb"] = value // 1024  # Convert kB to MB
            except (IndexError, ValueError):
                pass
    
    # Si no encontramos MemAvailable, devolvemos None para disponible_mb
    # Según los tests, cuando no hay MemAvailable, disponible_mb debería ser None
    
    # Solo devolver resultado si tenemos al menos total_mb
    if result["total_mb"] is not None:
        return result
    return None


def de_sysctl(texto: str) -> float | None:
    """Parsea la salida de sysctl hw.memsize y devuelve memoria total en MB."""
    if not texto.strip():
        return None
    
    lines = texto.splitlines()
    for line in lines:
        if line.startswith("hw.memsize:"):
            try:
                # Format: "hw.memsize: 17179869184"
                value = int(line.split()[1])
                return value / (1024 * 1024)  # Convert bytes to MB
            except (IndexError, ValueError):
                return None
    
    return None


def de_bateria_linux(lineas: list[str]) -> dict:
    """Parsea las líneas de sysfs de batería Linux y devuelve nivel y estado de carga."""
    resultado = {}
    
    for linea in lineas:
        if not linea.strip():
            continue
            
        partes = linea.split(":", 1)
        if len(partes) != 2:
            continue
            
        clave = partes[0].strip()
        valor = partes[1].strip()
        
        if clave.endswith("/capacity"):
            try:
                nivel = int(valor)
                if 0 <= nivel <= 100:
                    resultado["nivel"] = nivel / 100.0
                else:
                    # Valor inválido
                    return {}
            except ValueError:
                return {}
        elif clave.endswith("/status"):
            if valor == "Charging":
                resultado["cargando"] = True
            elif valor == "Discharging":
                resultado["cargando"] = False
            elif valor == "Full":
                resultado["cargando"] = True  # Full se considera cargando
            else:
                # Estado desconocido
                return {}
    
    return resultado


def de_pmset(texto: str) -> dict:
    """Parsea la salida de pmset y devuelve estado de carga."""
    if not texto.strip():
        return {}
    
    resultado = {}
    
    if "Now drawing from 'AC Power'" in texto:
        # Conectado a AC, considerando que está cargando
        resultado["cargando"] = True
    elif "Now drawing from 'Battery Power'" in texto:
        # Usando batería, considerando que está descargando
        resultado["cargando"] = False
    
    # Extraer porcentaje si está presente
    # Busca patrones como "XX%" en el texto
    import re
    porcentaje_match = re.search(r'(\d+)%', texto)
    if porcentaje_match:
        try:
            porcentaje = int(porcentaje_match.group(1))
            if 0 <= porcentaje <= 100:
                resultado["porcentaje"] = porcentaje / 100.0
        except ValueError:
            pass
    
    return resultado


def _version_a_numero(version: str) -> tuple[int, int, int]:
    """Convierte una cadena de versión a una tupla de tres enteros."""
    if not version:
        return (0, 0, 0)
    
    # Eliminar prefijos no numéricos como 'v'
    version = version.lstrip('v')
    
    # Tomar solo los primeros tres componentes
    partes_raw = version.split('.')[:3]
    partes = []
    
    for parte in partes_raw:
        # Extraer solo los dígitos iniciales de cada parte
        num_str = ''
        for char in parte:
            if char.isdigit():
                num_str += char
            else:
                break
        if num_str:
            try:
                partes.append(int(num_str))
            except ValueError:
                partes.append(0)
        else:
            partes.append(0)
    
    # Asegurar que tenemos exactamente 3 componentes
    while len(partes) < 3:
        partes.append(0)
    
    # Tomar solo los primeros 3
    return tuple(partes[:3])


def herramientas(versiones: dict[str, str]) -> dict[str, bool]:
    """Verifica si las versiones de las herramientas cumplen con los mínimos requeridos."""
    # Versiones mínimas requeridas
    minimos = {
        "git": (0, 0, 0),  # Cualquier versión sirve
        "node": (20, 19, 0),
        "python3": (0, 0, 0),  # Asumimos que cualquier versión sirve por ahora
        "opencode": (0, 0, 0),  # Asumimos que cualquier versión sirve
    }
    
    resultado = {}
    for herramienta, version_str in versiones.items():
        if herramienta not in minimos:
            # Herramienta desconocida, asumimos que no es requerida
            resultado[herramienta] = False
            continue
            
        if not version_str:
            resultado[herramienta] = False
            continue
            
        version_tuple = _version_a_numero(version_str)
        min_version = minimos[herramienta]
        
        # Comparar versión actual con mínima requerida
        resultado[herramienta] = version_tuple >= min_version
    
    # Asegurar que las herramientas esperadas estén presentes
    for herramienta in minimos:
        if herramienta not in resultado:
            resultado[herramienta] = False
    
    return resultado


def medir() -> dict:
    """Mide los recursos del sistema y devuelve un diccionario con la información."""
    resultado = {
        "so": "",
        "medio_app": "terminal",
        "ram_total_mb": None,
        "nucleos": 1,
        "disco_libre_gb": None,
        "bateria": {},
        "red": {},
        "herramientas": {}
    }
    
    # Detectar sistema operativo
    sistema = platform.system().lower()
    if sistema == "darwin":
        resultado["so"] = "macos"
    elif sistema == "linux":
        resultado["so"] = "linux"
    elif sistema == "windows":
        resultado["so"] = "windows"
    elif sistema == "android":
        resultado["so"] = "android"
    else:
        resultado["so"] = "otro"
    
    # Obtener número de núcleos
    try:
        resultado["nucleos"] = max(1, os.cpu_count() or 1)
    except Exception:
        resultado["nucleos"] = 1
    
    # Medir memoria total según el plataforma
    if resultado["so"] == "linux":
        try:
            with open("/proc/meminfo", "r") as f:
                meminfo = f.read()
            mem_data = de_meminfo(meminfo)
            if mem_data and mem_data["total_mb"] is not None:
                resultado["ram_total_mb"] = mem_data["total_mb"]
        except Exception:
            pass
    elif resultado["so"] == "macos":
        try:
            salida = subprocess.run(
                ["sysctl", "-n", "hw.memsize"],
                capture_output=True,
                text=True,
                timeout=5
            )
            if salida.returncode == 0:
                mem_mb = de_sysctl(salida.stdout.strip())
                if mem_mb is not None:
                    resultado["ram_total_mb"] = mem_mb
        except Exception:
            pass
    
    # Medir espacio en disco libre
    try:
        disco_uso = shutil.disk_usage(os.path.expanduser("~"))
        resultado["disco_libre_gb"] = disco_uso.free / (1024 * 1024 * 1024)  # Convert to GB
    except Exception:
        pass
    
    # Medir batería (Linux)
    if resultado["so"] == "linux":
        try:
            bateria_info = []
            ruta_base = "/sys/class/power_supply"
            if os.path.exists(ruta_base):
                for entrada in os.listdir(ruta_base):
                    if entrada.startswith("BAT"):
                        ruta_capacidad = os.path.join(ruta_base, entrada, "capacity")
                        ruta_estado = os.path.join(ruta_base, entrada, "status")
                        
                        if os.path.exists(ruta_capacidad):
                            try:
                                with open(ruta_capacidad, "r") as f:
                                    bateria_info.append(f"{ruta_capacidad}: {f.read().strip()}")
                            except Exception:
                                pass
                        
                        if os.path.exists(ruta_estado):
                            try:
                                with open(ruta_estado, "r") as f:
                                    bateria_info.append(f"{ruta_estado}: {f.read().strip()}")
                            except Exception:
                                pass
            
            if bateria_info:
                resultado["bateria"] = de_bateria_linux(bateria_info)
        except Exception:
            pass
    
    # Medir batería (macOS) usando pmset
    if resultado["so"] == "macos":
        try:
            salida = subprocess.run(
                ["pmset", "-g", "ps"],
                capture_output=True,
                text=True,
                timeout=5
            )
            if salida.returncode == 0:
                resultado["bateria"] = de_pmset(salida.stdout.strip())
        except Exception:
            pass
    
    # Verificar herramientas
    versiones = {}
    try:
        # Git
        git_salida = subprocess.run(
            ["git", "--version"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if git_salida.returncode == 0:
            # git version 2.40.1 (Apple Git-112)
            versiones["git"] = git_salida.stdout.strip().split()[-1].lstrip('v')
    except Exception:
        versiones["git"] = ""
    
    try:
        # Node
        node_salida = subprocess.run(
            ["node", "--version"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if node_salida.returncode == 0:
            versiones["node"] = node_salida.stdout.strip()
    except Exception:
        versiones["node"] = ""
    
    try:
        # Python
        versiones["python3"] = f"{platform.python_version()}"
    except Exception:
        versiones["python3"] = ""
    
    try:
        # Opencode (asumimos que está disponible si estamos ejecutando esto)
        versiones["opencode"] = "0.1.0"  # Valor por defecto
    except Exception:
        versiones["opencode"] = ""
    
    resultado["herramientas"] = herramientas(versiones)
    
    # Red (placeholder)
    resultado["red"] = {"conectada": True}  # Simplificado
    
    return resultado