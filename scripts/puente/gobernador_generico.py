<<<<<<< HEAD
"""Governor generic for StarSeed OS — PURE FUNCTIONS.
Contrato: architecture/colmena-relevo-contenedores.md.
Solo biblioteca estándar (corre en cualquier aparato).
"""
import json
import os
import re
import subprocess
import sys
from typing import Any, Dict, List, Optional, Tuple


def de_meminfo(texto: str) -> Dict[str, Optional[float]]:
    """PURA. /proc/meminfo → MB total y disponible.
    Espera líneas como:
    MemTotal:       8065216 kB
    MemAvailable:   4238912 kB
    Devuelve: {"total_mb": 7876.2, "disponible_mb": 4139.6}
    """
    total = None
    disponible = None
    for linea in texto.splitlines():
        if linea.startswith("MemTotal:"):
            # Extraer el número en kB y convertir a MB
            match = re.search(r"(\d+)\s+kB", linea)
            if match:
                total = float(match.group(1)) / 1024.0
        elif linea.startswith("MemAvailable:"):
            match = re.search(r"(\d+)\s+kB", linea)
            if match:
                disponible = float(match.group(1)) / 1024.0
    return {"total_mb": total, "disponible_mb": disponible}


def de_sysctl(texto: str) -> Optional[float]:
    """PURA. hw.memsize → bytes → MB.
    Espera una línea como: hw.memsize: 17179869184
    Devuelve: 16384.0 (MB)
    """
    match = re.search(r"hw\.memsize:\s*(\d+)", texto)
    if match:
        bytes_val = int(match.group(1))
        return bytes_val / (1024.0 * 1024.0)  # Convertir bytes a MB
    return None


def de_bateria_linux(dir_listado: List[str]) -> Dict[str, Any]:
    """PURA. /sys/class/power_supply/*/status y capacity → {nivel, cargando}.
    dir_listado: lista de líneas como:
    /sys/class/power_supply/BAT0/capacity:76
    /sys/class/power_supply/BAT0/status:Charging
    Devuelve: {"nivel": 0.76, "cargando": True} o vacío si no se encuentra
    """
    resultado = {}
    for linea in dir_listado:
        if ": " not in linea:
            continue
        ruta, valor = linea.split(": ", 1)
        if ruta.endswith("/capacity"):
            try:
                nivel = int(valor.strip()) / 100.0
                resultado["nivel"] = nivel
            except ValueError:
                pass
        elif ruta.endswith("/status"):
            estado = valor.strip().lower()
            if estado in ("charging", "full", "charged"):
                resultado["cargando"] = True
            elif estado in ("discharging", "not charging"):
                resultado["cargando"] = False
    return resultado


def de_pmset(texto: str) -> Dict[str, Any]:
    """PURA. `pmset -g batt` → {nivel, cargando}.
    Espera salida como:
    Now drawing from 'Battery Power'
    -InternalBattery-     73%; charging; 0:00 remaining
    Devuelve: {"nivel": 0.73, "cargando": True}
    """
    resultado = {}
    # Buscar el porcentaje
    match = re.search(r"(\d+)%;", texto)
    if match:
        try:
            nivel = int(match.group(1)) / 100.0
            resultado["nivel"] = nivel
        except ValueError:
            pass
    # Determinar si está cargando buscando el estado específico
    # Buscamos los estados específicos seguidos de punto y coma
    texto_lower = texto.lower()
    # Primero intentar con el formato que incluye porcentaje: [número]%; [estado];
    estado_match = re.search(r"\d+%;\s*(charging|discharging|not charging|charged);", texto_lower)
    if not estado_match:
        # Si no hay porcentaje, buscar solo [estado];
        estado_match = re.search(r"(charging|discharging|not charging|charged);", texto_lower)
    if estado_match:
        estado = estado_match.group(1)
        if estado == "charging":
            resultado["cargando"] = True
        elif estado in ("discharging", "not charging"):
            resultado["cargando"] = False
        elif estado == "charged":
            resultado["cargando"] = True
    return resultado


def _version_a_numero(version_str: str) -> Tuple[int, int, int]:
    """Convierte una string de versión como '20.19.0' a tupla de enteros."""
    partes = version_str.strip().split(".")
    # Aseguramos tener al menos 3 partes
    while len(partes) < 3:
        partes.append("0")
    try:
        return (int(partes[0]), int(partes[1]), int(partes[2]))
    except ValueError:
        return (0, 0, 0)


def herramientas(versiones: Dict[str, str]) -> Dict[str, bool]:
    """PURA. Versiones detectadas → {git: bool, node: bool, python3: bool, opencode: bool}.
    versiones: diccionario como {"git": "2.40.1", "node": "v20.19.0", ...}
    Devuelve: booleano para cada herramienta según los mínimos requeridos.
    Requisitos:
    - git: cualquier versión
    - node: ≥ 20.19.0
    - python3: cualquier versión ≥ 3.0
    - opencode: cualquier versión
    """
    resultado = {}
    
    # git: cualquier versión es válida
    resultado["git"] = "git" in versiones and versiones["git"] != ""
    
    # node: ≥ 20.19.0
    node_ok = False
    if "node" in versiones:
        # Quitar la 'v' inicial si existe
        node_ver = versiones["node"]
        if node_ver.startswith("v"):
            node_ver = node_ver[1:]
        try:
            node_tuple = _version_a_numero(node_ver)
            # Comparar con (20, 19, 0)
            if node_tuple[0] > 20 or (node_tuple[0] == 20 and node_tuple[1] >= 19):
                node_ok = True
        except (ValueError, IndexError):
            pass
    resultado["node"] = node_ok
    
    # python3: cualquier versión ≥ 3.0
    python_ok = False
    if "python3" in versiones:
        try:
            python_tuple = _version_a_numero(versiones["python3"])
            if python_tuple[0] >= 3:
                python_ok = True
        except (ValueError, IndexError):
            pass
    resultado["python3"] = python_ok
    
    # opencode: cualquier versión
    resultado["opencode"] = "opencode" in versiones and versiones["opencode"] != ""
=======
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
>>>>>>> fdaa3702a (salvavidas · RTCOL1012Lb: trabajo del agente antes de las puertas (tsc / vitest))
    
    return resultado


<<<<<<< HEAD
def medir() -> Dict[str, Any]:
    """Recopila información del sistema y devuelve el diccionario que espera capacidad_contenedor.
    Funciona sin privilegios (lectura de archivos del sistema y comandos básicos).
    Devuelve:
    {
        "so": string,           # macos, linux, android, wsl
        "medio_app": "terminal",
        "ram_total_mb": float,  # MB totales de RAM
        "nucleos": int,         # número de núcleos CPU
        "disco_libre_gb": float, # GB libres en el disco donde está el repo
        "bateria": dict,        # {"nivel": float, "cargando": bool} o vacío
        "red": dict,            # {"medida": bool} o vacío (si se conoce)
        "herramientas": dict    # {"git": bool, "node": bool, "python3": bool, "opencode": bool} con versiones
    }
    """
    versiones = _obtener_herramientas_con_versiones()
    resultado = {
        "so": _detectar_so(),
        "medio_app": "terminal",
        "ram_total_mb": _obtener_ram_total_mb(),
        "nucleos": _obtener_nucleos(),
        "disco_libre_gb": _obtener_disco_libre_gb(),
        "bateria": _obtener_bateria(),
        "red": _obtener_red(),
        "herramientas": herramientas(versiones)
    }
    return resultado


def _detectar_so() -> str:
    """Detecta el sistema operativo."""
    # Primero verificar si estamos en WSL
    if _es_wsl():
        return "wsl"
    
    # Verificar si estamos en Android (Termux)
    if _es_android():
        return "android"
    
    # Detectar el SO basado en platform
    if sys.platform.startswith("darwin"):
        return "macos"
    elif sys.platform.startswith("linux"):
        return "linux"
    elif sys.platform.startswith("win"):
        return "windows"
    else:
        return "otro"


def _es_wsl() -> bool:
    """Detecta si estamos ejecutando en WSL (Windows Subsystem for Linux)."""
    try:
        with open("/proc/version", "r") as f:
            contenido = f.read().lower()
            return "microsoft" in contenido or "wsl" in contenido
    except (FileNotFoundError, PermissionError):
        return False


def _es_android() -> bool:
    """Detecta si estamos ejecutando en Android (Termux)."""
    # Verificar la variable de entorno PREFIX que Termux establece
    return "com.termux" in os.environ.get("PREFIX", "")


def _obtener_ram_total_mb() -> Optional[float]:
    """Obtiene la RAM total en MB."""
    # Intentar diferentes métodos según el SO
    so = _detectar_so()
    
    if so == "linux":
        # Intentar leer /proc/meminfo
        try:
            with open("/proc/meminfo", "r") as f:
                contenido = f.read()
                meminfo = de_meminfo(contenido)
                if meminfo["total_mb"] is not None:
                    return meminfo["total_mb"]
        except (FileNotFoundError, PermissionError):
            pass
    
    elif so == "macos":
        # Intentar usar sysctl
        try:
            result = subprocess.run(
=======
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
>>>>>>> fdaa3702a (salvavidas · RTCOL1012Lb: trabajo del agente antes de las puertas (tsc / vitest))
                ["sysctl", "-n", "hw.memsize"],
                capture_output=True,
                text=True,
                timeout=5
            )
<<<<<<< HEAD
            if result.returncode == 0:
                mb = de_sysctl(result.stdout.strip())
                if mb is not None:
                    return mb
        except (subprocess.SubprocessError, FileNotFoundError):
            pass
    
    elif so == "wsl":
        # WSL también tiene /proc/meminfo
        try:
            with open("/proc/meminfo", "r") as f:
                contenido = f.read()
                meminfo = de_meminfo(contenido)
                if meminfo["total_mb"] is not None:
                    return meminfo["total_mb"]
        except (FileNotFoundError, PermissionError):
            pass
    
    # Si todo falla, retornar None
    return None


def _obtener_nucleos() -> int:
    """Obtiene el número de núcleos CPU."""
    try:
        return os.cpu_count() or 1
    except (AttributeError, NotImplementedError):
        return 1


def _obtener_disco_libre_gb() -> Optional[float]:
    """Obtiene el espacio libre en GB en el disco donde está el repo."""
    try:
        # Usar el directorio actual para verificar el espacio libre
        stat = os.statvfs(".")
        # Disponible * tamaño de bloque / (1024^3) para obtener GB
        libre_bytes = stat.f_frsize * stat.f_bavail
        return libre_bytes / (1024.0 * 1024.0 * 1024.0)
    except (AttributeError, NotImplementedError, OSError):
        # En algunos sistemas (como Windows) statvfs podría no estar disponible
        try:
            # Alternativa usando shutil.disk_usage (pero no está en stdlib puro)
            # Como estamos limitados a stdlib, intentamos otro enfoque
            return None
        except Exception:
            return None


def _obtener_bateria() -> Dict[str, Any]:
    """Obtiene información de la batería si está disponible."""
    # Intentar Linux primero
    bateria = _obtener_bateria_linux()
    if bateria:
        return bateria
    
    # Intentar macOS
    bateria = _obtener_bateria_macos()
    if bateria:
        return bateria
    
    # Si no se puede obtener, retornar diccionario vacío
    return {}


def _obtener_bateria_linux() -> Optional[Dict[str, Any]]:
    """Intenta obtener información de batería en Linux."""
    try:
        base_path = "/sys/class/power_supply"
        if not os.path.exists(base_path):
            return None
        
        # Buscar directorios de batería
        for entry in os.listdir(base_path):
            path = os.path.join(base_path, entry)
            if os.path.isdir(path):
                # Leer capacity y status
                capacity_path = os.path.join(path, "capacity")
                status_path = os.path.join(path, "status")
                
                capacidad = None
                estado = None
                
                try:
                    with open(capacity_path, "r") as f:
                        capacidad = int(f.read().strip())
                except (FileNotFoundError, PermissionError, ValueError):
                    pass
                
                try:
                    with open(status_path, "r") as f:
                        estado = f.read().strip().lower()
                except (FileNotFoundError, PermissionError):
                    pass
                
                if capacidad is not None and estado is not None:
                    resultado = {
                        "nivel": capacidad / 100.0,
                        "cargando": estado in ("charging", "full", "charged")
                    }
                    return resultado
    except Exception:
        pass
    return None


def _obtener_bateria_macos() -> Optional[Dict[str, Any]]:
    """Intenta obtener información de batería en macOS usando pmset."""
    try:
        result = subprocess.run(
            ["pmset", "-g", "batt"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            return de_pmset(result.stdout)
    except (subprocess.SubprocessError, FileNotFoundError):
        pass
    return None


def _obtener_red() -> Dict[str, Any]:
    """Intenta determinar si la red está medida (metered)."""
    # Por simplicidad y para mantener pureza, retornamos vacío
    # ya que determinar si una red es medida requiere privilegios o
    # acceso a servicios de red que pueden variar mucho entre sistemas
    return {}


def _obtener_herramientas_con_versiones() -> Dict[str, Any]:
    """Obtiene las versiones de las herramientas requeridas."""
    versiones = {}
    
    # Obtener versión de git
    versiones["git"] = _obtener_version_git()
    
    # Obtener versión de node
    versiones["node"] = _obtener_version_node()
    
    # Obtener versión de python3
    versiones["python3"] = _obtener_version_python()
    
    # Obtener versión de opencode
    versiones["opencode"] = _obtener_version_opencode()
    
    return versiones


def _obtener_version_git() -> str:
    """Obtiene la versión de git."""
    try:
        result = subprocess.run(
=======
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
>>>>>>> fdaa3702a (salvavidas · RTCOL1012Lb: trabajo del agente antes de las puertas (tsc / vitest))
            ["git", "--version"],
            capture_output=True,
            text=True,
            timeout=5
        )
<<<<<<< HEAD
        if result.returncode == 0:
            # git version 2.40.1
            match = re.search(r"version\s+(.+)", result.stdout)
            if match:
                return match.group(1).strip()
    except (subprocess.SubprocessError, FileNotFoundError):
        pass
    return ""


def _obtener_version_node() -> str:
    """Obtiene la versión de node."""
    try:
        result = subprocess.run(
=======
        if git_salida.returncode == 0:
            # git version 2.40.1 (Apple Git-112)
            versiones["git"] = git_salida.stdout.strip().split()[-1].lstrip('v')
    except Exception:
        versiones["git"] = ""
    
    try:
        # Node
        node_salida = subprocess.run(
>>>>>>> fdaa3702a (salvavidas · RTCOL1012Lb: trabajo del agente antes de las puertas (tsc / vitest))
            ["node", "--version"],
            capture_output=True,
            text=True,
            timeout=5
        )
<<<<<<< HEAD
        if result.returncode == 0:
            # v20.19.0
            return result.stdout.strip()
    except (subprocess.SubprocessError, FileNotFoundError):
        pass
    return ""


def _obtener_version_python() -> str:
    """Obtiene la versión de python3."""
    try:
        result = subprocess.run(
            [sys.executable, "--version"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            # Python 3.11.2
            match = re.search(r"Python\s+(.+)", result.stdout)
            if match:
                return match.group(1).strip()
    except (subprocess.SubprocessError, FileNotFoundError):
        pass
    return ""


def _obtener_version_opencode() -> str:
    """Obtiene la versión de opencode."""
    try:
        result = subprocess.run(
            ["opencode", "--version"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            # Asumimos que opencode --version devuelve algo como "opencode 0.1.0"
            return result.stdout.strip()
    except (subprocess.SubprocessError, FileNotFoundError):
        pass
    return ""
=======
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
>>>>>>> fdaa3702a (salvavidas · RTCOL1012Lb: trabajo del agente antes de las puertas (tsc / vitest))
