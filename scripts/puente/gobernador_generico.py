"""Governador genérico para medir la capacidad de un aparato como contenedor (COL1012L) — FUNCIONES PURAS.

Contrato: architecture/colmena-relevo-contenedores.md. Solo biblioteca estándar.
"""
import os
import platform
import re
import subprocess
import sys
from typing import Dict, Any, Optional, List


# Funciones puras que interpretan texto ya leído
def de_meminfo(texto: str) -> Dict[str, float]:
    """Devuelve memoria total y disponible en MB a partir de /proc/meminfo."""
    total = 0.0
    available = 0.0
    for line in texto.splitlines():
        if line.startswith("MemTotal:"):
            # MemTotal:       8037024 kB
            parts = line.split()
            if len(parts) >= 2:
                total = float(parts[1]) / 1024.0  # kB to MB
        elif line.startswith("MemAvailable:"):
            # MemAvailable:   6220416 kB
            parts = line.split()
            if len(parts) >= 2:
                available = float(parts[1]) / 1024.0  # kB to MB
    return {"total": total, "available": available}


def de_sysctl(texto: str) -> Dict[str, float]:
    """Devuelve memoria total en MB a partir de la salida de `sysctl -n hw.memsize`."""
    # hw.mensize devuelve bytes
    try:
        bytes_total = float(texto.strip())
        mb_total = bytes_total / (1024.0 * 1024.0)
        return {"total": mb_total}
    except ValueError:
        return {"total": 0.0}


def de_bateria_linux(dir_listado: str) -> Dict[str, Any]:
    """Devuelve estado y nivel de batería a partir de un listado que contiene
    líneas con el formato 'ruta/status: valor' y 'ruta/capacity: valor'.
    Extrae el estado y el nivel de la primera batería que tenga ambos archivos.
    """
    # Diccionario para almacenar el estado y capacidad de cada batería
    batteries = {}  # key: nombre de la batería (ej: "BAT0"), value: dict con keys 'status' y 'capacity'
    # Lista para recordar el orden en que vemos las baterías por primera vez
    battery_order = []
    for line in dir_listado.splitlines():
        line = line.strip()
        if not line:
            continue
        # Dividir por el primer ':' para separar la ruta y el valor
        if ':' not in line:
            continue
        parts = line.split(':', 1)
        key = parts[0].strip()
        value = parts[1].strip()
        if key.endswith('/status'):
            # Extraer el nombre de la batería: todo lo que está antes de '/status'
            battery_name = key[:-len('/status')]
            # Quitar cualquier ruta y quedarnos con el último componente
            battery_name = battery_name.split('/')[-1]
            if battery_name not in batteries:
                batteries[battery_name] = {}
                battery_order.append(battery_name)
            batteries[battery_name]['status'] = value.lower()
        elif key.endswith('/capacity'):
            battery_name = key[:-len('/capacity')]
            battery_name = battery_name.split('/')[-1]
            if battery_name not in batteries:
                batteries[battery_name] = {}
                battery_order.append(battery_name)
            try:
                batteries[battery_name]['capacity'] = int(value)
            except ValueError:
                pass
    # Ahora, iteramos en el orden en que vimos las baterías y devolvemos la primera que tenga tanto status como capacity
    for battery_name in battery_order:
        info = batteries.get(battery_name, {})
        status = info.get('status')
        capacity = info.get('capacity')
        if status is not None and capacity is not None:
            # Determinar si está cargando: solo se considera cargando si el status es exactamente "charging"
            cargando = (status == "charging")
            nivel = capacity / 100.0  # convertir a rango [0,1]
            return {"cargando": cargando, "nivel": nivel}
    return {}


def de_pmset(texto: str) -> Dict[str, Any]:
    """Devuelve estado y nivel de batería a partir de la salida de `pmset -g batt`."""
    # Ejemplo de salida de pmset -g batt:
    # Now drawing from 'Battery Power'
    # -InternalBattery-0	95%; charged; charging       (rate: ...) 
    # Pero el formato puede variar.
    # Vamos a buscar el porcentaje y el estado de carga.
    cargando = False
    nivel = 0.0
    for line in texto.splitlines():
        if '%' in line:
            # Extraer el porcentaje
            match = re.search(r'(\d+)%', line)
            if match:
                nivel = int(match.group(1)) / 100.0
            # Determinar si está cargando usando expresiones regulares para palabras completas
            line_lower = line.lower()
            if re.search(r'\bcharging\b', line_lower):
                cargando = True
            elif re.search(r'\bdischarging\b', line_lower):
                cargando = False
            elif re.search(r'\bcharged\b', line_lower):
                # Si está cargada y conectada, podría no estar cargando en ese momento.
                # Pero el governor solo necesita saber si está cargando en este momento.
                # Vamos a asumir que si dice 'charged' y no 'charging', entonces no está cargando.
                cargando = False
            # Si no encontramos ninguno, dejamos cargando como False por defecto.
    return {"cargando": cargando, "nivel": nivel}


def herramientas(versiones: Dict[str, Optional[str]]) -> Dict[str, Any]:
    """Devuelve un diccionario que indica la presencia y versión de las herramientas requeridas.
    Se espera que versiones sea un diccionario con las herramientas como claves y la versión como valor (o None si no se encuentra).
    Devolvemos el mismo diccionario pero solo con las herramientas que encontramos (versión no None).
    """
    # Devolvemos un diccionario con las mismas claves pero solo si la versión no es None.
    # El gobernador solo necesita saber si la herramienta está presente (valor truthy).
    # Devolver la versión (string) es truthy, y None es falsy.
    return {k: v for k, v in versiones.items() if v is not None}


def medir() -> Dict[str, Any]:
    """Recopila información del sistema y devuelve el diccionario esperado por `capacidad_contenedor`."""
    # Información básica
    so = "otro"
    medio_app = "terminal"
    ram_total_mb = 0
    nucleos = 0
    disco_libre_gb = 0.0
    bateria = {}
    red = {}
    herramientas_dict = {}

    # Detectar SO
    sistema = platform.system().lower()
    if sistema == "darwin":
        so = "macos"
    elif sistema == "linux":
        # Verificar si estamos en WSL2
        if "microsoft" in platform.uname()[2].lower():
            so = "windows"
        else:
            so = "linux"
            # Verificar si estamos en Android (Termux)
            if "com.termux" in os.getenv("PREFIX", ""):
                so = "android"
    elif sistema == "windows":
        so = "windows"
    elif sistema == "ios":  # Esto no ocurrirá en platform.system, pero por si acaso
        so = "ios"

    # Memoria total
    if so == "linux" and os.path.exists("/proc/meminfo"):
        with open("/proc/meminfo", "r") as f:
            meminfo_texto = f.read()
        mem = de_meminfo(meminfo_texto)
        ram_total_mb = int(mem["total"])
    elif so == "macos":
        try:
            # Usamos sysctl para obtener hw.memsize
            result = subprocess.run(["sysctl", "-n", "hw.memsize"], capture_output=True, text=True, timeout=5)
            if result.returncode == 0:
                mem = de_sysctl(result.stdout.strip())
                ram_total_mb = int(mem["total"])
        except Exception:
            pass
    # Para otros SO, intentamos /proc/meminfo si existe
    elif os.path.exists("/proc/meminfo"):
        with open("/proc/meminfo", "r") as f:
            meminfo_texto = f.read()
        mem = de_meminfo(meminfo_texto)
        ram_total_mb = int(mem["total"])

    # Número de núcleos
    try:
        nucleos = os.cpu_count() or 0
    except Exception:
        nucleos = 0

    # Espacio libre en disco (en GB) del disco donde está el repo
    try:
        # Usamos el directorio actual
        stat = os.statvfs(".")
        libre_bytes = stat.f_frsize * stat.f_bavail
        disco_libre_gb = libre_bytes / (1024.0 * 1024.0 * 1024.0)
    except Exception:
        # Si falla, intentamos con el directorio raíz
        try:
            stat = os.statvfs("/")
            libre_bytes = stat.f_frsize * stat.f_bavail
            libre_gb = libre_bytes / (1024.0 * 1024.0 * 1024.0)
            # Pero queremos el disco del repo, así que si no podemos, usamos raíz como aproximación
            disco_libre_gb = libre_gb
        except Exception:
            disco_libre_gb = 0.0

    # Batería
    if so == "linux" and os.path.exists("/sys/class/power_supply/"):
        try:
            # Listamos los directorios de baterías
            batteries = os.listdir("/sys/class/power_supply/")
            for bat in batteries:
                status_path = f"/sys/class/power_supply/{bat}/status"
                capacity_path = f"/sys/class/power_supply/{bat}/capacity"
                if os.path.exists(status_path) and os.path.exists(capacity_path):
                    with open(status_path, "r") as f:
                        status_texto = f.read().strip().lower()
                    with open(capacity_path, "r") as f:
                        capacity_texto = f.read().strip()
                    # Crearemos un string que simule el dir_listado para pasar a de_bateria_linux
                    # Vamos a pasar: f"{bat}/status: {status_texto}\n{bat}/capacity: {capacity_texto}"
                    dir_listado = f"{bat}/status: {status_texto}\n{bat}/capacity: {capacity_texto}"
                    bateria = de_bateria_linux(dir_listado)
                    if bateria:  # Si encontramos una batería válida, salimos
                        break
        except Exception:
            pass
    elif so == "macos":
        try:
            result = subprocess.run(["pmset", "-g", "batt"], capture_output=True, text=True, timeout=5)
            if result.returncode == 0:
                bateria = de_pmset(result.stdout)
        except Exception:
            pass

    # Red: medido si NetworkManager dice metered o, en Termux, datos móviles; si no se sabe, no se pone
    # Vamos a dejarlo vacío por ahora, ya que es complejo y el gobernador solo lo usa si está presente.
    # Intentamos detectar si estamos en una red medida en Linux usando NetworkManager
    if so == "linux":
        try:
            # Verificamos si NetworkManager está corriendo y obtenemos la estado de la conexión
            # Esto es complejo y requiere privilegios o acceso a dbus. Vamos a dejarlo vacío.
            pass
        except Exception:
            pass
    elif so == "android" and "com.termux" in os.getenv("PREFIX", ""):
        # En Termux, podemos intentar obtener el estado de la red móvil? Pero es complejo.
        # Vamos a dejarlo vacío.
        pass

    # Herramientas: git, node ≥ 20.19, python3, opencode
    versiones = {}
    # git
    try:
        result = subprocess.run(["git", "--version"], capture_output=True, text=True, timeout=5)
        if result.returncode == 0:
            # Ejemplo: git version 2.39.0
            match = re.search(r'(\d+\.\d+\.\d+)', result.stdout)
            if match:
                versiones["git"] = match.group(1)
            else:
                versiones["git"] = "unknown"
    except Exception:
        versiones["git"] = None
    # node
    try:
        result = subprocess.run(["node", "--version"], capture_output=True, text=True, timeout=5)
        if result.returncode == 0:
            # Ejemplo: v20.19.0
            match = re.search(r'v?(\d+\.\d+\.\d+)', result.stdout)
            if match:
                versiones["node"] = match.group(1)
            else:
                versiones["node"] = "unknown"
    except Exception:
        versiones["node"] = None
    # python3
    try:
        result = subprocess.run(["python3", "--version"], capture_output=True, text=True, timeout=5)
        if result.returncode == 0:
            # Ejemplo: Python 3.11.5
            match = re.search(r'(\d+\.\d+\.\d+)', result.stdout)
            if match:
                versiones["python3"] = match.group(1)
            else:
                versiones["python3"] = "unknown"
    except Exception:
        versiones["python3"] = None
    # opencode
    try:
        result = subprocess.run(["opencode", "--version"], capture_output=True, text=True, timeout=5)
        if result.returncode == 0:
            # Asumimos que opencode devuelve una versión
            match = re.search(r'(\d+\.\d+\.\d+)', result.stdout)
            if match:
                versiones["opencode"] = match.group(1)
            else:
                versiones["opencode"] = "unknown"
    except Exception:
        versiones["opencode"] = None
    herramientas_dict = herramientas(versiones)

    # Construir el diccionario de retorno
    resultado = {
        "so": so,
        "medio_app": medio_app,
        "ram_total_mb": ram_total_mb,
        "nucleos": nucleos,
        "disco_libre_gb": disco_libre_gb,
        "herramientas": herramientas_dict,
    }
    if bateria:
        resultado["bateria"] = bateria
    if red:
        resultado["red"] = red

    return resultado