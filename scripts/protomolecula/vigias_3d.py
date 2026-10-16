#!/usr/bin/env python3
"""Vigías de la Biblioteca para herramientas 3D: UniMate, Filigree3D, BTC3D.

Comprueba, como mucho una vez al día:
1. UniMate (GitHub y Hugging Face): código de inferencia y pesos con licencia.
2. Filigree3D y BTC3D (arXiv): aparición de enlaces a código.

Cuando algo cambia, escribe una cola en starseed_memory_root/olas/ y avisa al Chat Director.
Se integra con la ejecución diaria de actualizar_catalogo.py.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

RAIZ = Path(__file__).resolve().parents[2]
ESTADO_DIR = RAIZ / "starseed_memory_root" / "olas"
UA = "starseed-vigias-3d/1.0"


@dataclass
class EstadoVigia:
    """Estado último visto de cada herramienta."""
    unmate_github: bool = False  # ¿Hay código de inferencia en GitHub?
    unmate_hf_license: bool = False  # ¿Los pesos en HF tienen licencia declarada?
    filigree3d_code: bool = False  # ¿Hay enlace a código en arXiv?
    btc3d_code: bool = False  # ¿Hay enlace a código en arXiv?


def leer_estado() -> EstadoVigia:
    """Lee el último estado visto desde un archivo de estado."""
    estado_file = RAIZ / ".vigias_3d_estado.json"
    if estado_file.exists():
        try:
            data = json.loads(estado_file.read_text("utf-8"))
            return EstadoVigia(**data)
        except (json.JSONDecodeError, TypeError):
            pass
    return EstadoVigia()


def guardar_estado(estado: EstadoVigia) -> None:
    """Guarda el estado actual para futuras comparaciones."""
    estado_file = RAIZ / ".vigias_3d_estado.json"
    estado_file.write_text(json.dumps(estado.__dict__, indent=2), "utf-8")


def http_get(url: str, cabeceras: Optional[Dict[str, str]] = None, plazo: int = 30) -> Tuple[int, Dict[str, str], str]:
    """Realiza una petición HTTP GET."""
    peticion = urllib.request.Request(url, headers={"User-Agent": UA, **(cabeceras or {})})
    try:
        with urllib.request.urlopen(peticion, timeout=plazo) as r:
            cab = {k.lower(): v for k, v in r.headers.items()}
            return r.status, cab, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in (e.headers or {}).items()}, ""
    except (urllib.error.URLError, TimeoutError, OSError):
        return 0, {}, ""


def verificar_unmate_github() -> bool:
    """
    Verifica si UniMate tiene código de inferencia en GitHub.
    Busca: archivos de inferencia o demo, o que desaparezca la nota "[TODO] Training and inference code will be released".
    """
    status, _, cuerpo = http_get("https://api.github.com/repos/Friedrich-M/UniMate/readme")
    if status != 200:
        return False

    try:
        data = json.loads(cuerpo)
        # El contenido está en base64
        import base64
        readme_content = base64.b64decode(data["content"]).decode("utf-8")
        
        # Verificar si la nota TODO ha desaparecido
        todo_nota = "[TODO] Training and inference code will be released"
        if todo_nota not in readme_content:
            # Además, buscar evidencia de código de inferencia
            inferencia_patterns = [
                r"inference",
                r"demo",
                r"\.py$",  # archivos Python
                r"model.*\.(pth|pt|bin)",  # pesos de modelo
                r"predict",
                r"generate.*motion"
            ]
            for pattern in inferencia_patterns:
                if re.search(pattern, readme_content, re.IGNORECASE):
                    return True
            # Si no hay patrones específicos pero desapareció la nota, asumimos que hay código
            return True
        return False
    except (json.JSONDecodeError, KeyError):
        return False


def verificar_unmate_hf_license() -> bool:
    """
    Verifica si los pesos de UniMate en Hugging Face tienen licencia declarada.
    """
    status, _, cuerpo = http_get("https://huggingface.co/api/models/Linzhan/UniMate")
    if status != 200:
        return False

    try:
        data = json.loads(cuerpo)
        # Buscar información de licencia en el modelo
        # Los modelos en HF pueden tener licencia en diferentes campos
        licencia = data.get("license") or data.get("cardData", {}).get("license")
        if licencia and licencia.lower() not in ["", "unknown", "not a license", "nosource"]:
            return True
        # También verificar si hay un archivo LICENSE en el repo
        status2, _, cuerpo2 = http_get("https://huggingface.co/api/models/Linzhan/UniMate/tree/main")
        if status2 == 200:
            try:
                files_data = json.loads(cuerpo2)
                # Buscar archivos que puedan contener licencia
                for item in files_data:
                    if isinstance(item, dict) and item.get("type") == "file":
                        filename = item.get("path", "").lower()
                        if "license" in filename or "copying" in filename:
                            return True
            except (json.JSONDecodeError, TypeError):
                pass
        return False
    except (json.JSONDecodeError, KeyError):
        return False


def verificar_arxiv_enlace_codigo(arxiv_id: str) -> bool:
    """
    Verifica si un artículo de arXiv tiene enlaces a código.
    Busca en la página de resumen enlaces a repositorios (GitHub, GitLab, etc.) o menciones de código.
    """
    # Usar la API de arXiv
    status, _, cuerpo = http_get(f"http://export.arxiv.org/api/query?id_list={arxiv_id}")
    if status != 200:
        # Fallback a la página web
        status, _, cuerpo = http_get(f"https://arxiv.org/abs/{arxiv_id}")
        if status != 200:
            return False

    # Buscar indicadores de código
    codigo_patterns = [
        r"github\.com",
        r"gitlab\.com",
        r"bitbucket\.org",
        r"code.*available",
        r"repository",
        r"implementation",
        r"source.*code",
        r"code.*https?://",
        r"https?://.*\.(git|github|gitlab)"
    ]
    
    for pattern in codigo_patterns:
        if re.search(pattern, cuerpo, re.IGNORECASE):
            return True
            
    return False


def verificar_cambios() -> Tuple[EstadoVigia, List[str]]:
    """
    Verifica todos los cambios y retorna el nuevo estado y una lista de mensajes de cambios.
    """
    estado_actual = leer_estado()
    nuevo_estado = EstadoVigia(
        unmate_github=estado_actual.unmate_github,
        unmate_hf_license=estado_actual.unmate_hf_license,
        filigree3d_code=estado_actual.filigree3d_code,
        btc3d_code=estado_actual.btc3d_code
    )
    
    cambios = []
    
    # Verificar UniMate GitHub
    unmate_github_now = verificar_unmate_github()
    if unmate_github_now and not estado_actual.unmate_github:
        nuevo_estado.unmate_github = True
        cambios.append("UniMate: publicado código de inferencia en GitHub")
    
    # Verificar UniMate HF License
    unmate_hf_license_now = verificar_unmate_hf_license()
    if unmate_hf_license_now and not estado_actual.unmate_hf_license:
        nuevo_estado.unmate_hf_license = True
        cambios.append("UniMate: pesos en Hugging Face con licencia declarada")
    
    # Verificar Filigree3D
    filigree3d_now = verificar_arxiv_enlace_codigo("2609.34900")
    if filigree3d_now and not estado_actual.filigree3d_code:
        nuevo_estado.filigree3d_code = True
        cambios.append("Filigree3D: detectado enlace a código en arXiv")
    
    # Verificar BTC3D
    btc3d_now = verificar_arxiv_enlace_codigo("2609.39709")
    if btc3d_now and not estado_actual.btc3d_code:
        nuevo_estado.btc3d_code = True
        cambios.append("BTC3D: detectado enlace a código en arXiv")
    
    return nuevo_estado, cambios


def crear_cola_tarea(mensaje: str, fecha: str) -> None:
    """Crea una nueva cola de tarea en starseed_memory_root/olas/."""
    # Generar un ID único basado en timestamp
    timestamp = int(time.time())
    cola_id = f"vigia-3d-{timestamp}-{fecha}"
    cola_file = ESTADO_DIR / f"cola-vigia-3d-{cola_id}.json"
    
    # Asegurarse de que el directorio existe
    ESTADO_DIR.mkdir(parents=True, exist_ok=True)
    
    # Formato de cola basado en lo visto en otras colas del sistema
    cola_data = {
        "tarea": {
            "tipo": "vigia-3d-detected",
            "descripcion": mensaje,
            "timestamp": timestamp,
            "fecha": fecha
        },
        "cola": f"vigia-3d-{fecha}",
        "prioridad": "media",
        "intentos": 0,
        "maxIntentos": 3
    }
    
    cola_file.write_text(json.dumps(cola_data, indent=2), "utf-8")
    print(f"Cola creada: {cola_file}")


def avisar_chat_director(mensaje: str) -> None:
    """Avisa al Chat Director usando el mecanismo de los scripts de scripts/puente/."""
    try:
        # Importar y usar el puente para enviar un mensaje al chat principal
        sys.path.append(str(RAIZ / "scripts" / "puente"))
        from puente import decir  # type: ignore
        
        decir(
            mensaje,
            tipo="aviso",
            tarea="vigia-3d"
        )
    except ImportError:
        # Fallback: usar el comando starseed-puente si está disponible
        import subprocess
        try:
            subprocess.run([
                "starseed-puente", "decir",
                mensaje,
                "--tipo", "aviso",
                "--tarea", "vigia-3d"
            ], check=True, capture_output=True)
            print("Aviso enviado al Chat Director")
        except (subprocess.CalledProcessError, FileNotFoundError):
            print(f"AVISO (no se pudo enviar automáticamente): {mensaje}")


def main() -> int:
    """Función principal del script de vigilancia."""
    print("Ejecutando vigías de herramientas 3D...")
    
    # Verificar cambios
    nuevo_estado, cambios = verificar_cambios()
    
    if cambios:
        fecha_actual = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        
        for cambio in cambios:
            print(f"Cambio detectado: {cambio}")
            crear_cola_tarea(cambio, fecha_actual)
            avisar_chat_director(f"🔍 Vigía 3D: {cambio}")
        
        # Guardar el nuevo estado
        guardar_estado(nuevo_estado)
        print(f"Estado actualizado y guardado. Cambios detectados: {len(cambios)}")
    else:
        print("No se detectaron cambios.")
        # Aún así, guardar el estado para mantener actualizado el timestamp de revisión
        guardar_estado(nuevo_estado)
    
    return 0


if __name__ == "__main__":
    sys.exit(main())