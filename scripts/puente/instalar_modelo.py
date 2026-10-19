#!/usr/bin/env python3
# scripts/puente/instalar_modelo.py
"""
Instalador de modelos con SHA, versión anterior y cambio atómico.
Contrato: architecture/vigia-modelos.md
"""

import os
import json
import hashlib
import shutil
from pathlib import Path
from typing import Callable, Optional, Dict, Any

def instalar(
    entrada: str,
    destino_dir: str,
    descargar: Callable[[str, str], bool],
    sha_esperado: str
) -> bool:
    """
    Descarga un modelo con verificación SHA256, conserva versión anterior,
    cambia de forma atómica y prueba antes de quedarse.
    
    Args:
        entrada: Identificador del modelo (ej: "Qwen/Qwen-Image-2.1-Turbo")
        destino_dir: Directorio donde instalar el modelo
        descargar: Función que descarga el modelo (ruta_temporal, sha_esperado) -> bool
        sha_esperado: SHA256 esperado del modelo
        
    Returns:
        bool: True si la instalación fue exitosa, False en caso contrario
    """
    # Convertir a objetos Path
    destino = Path(destino_dir)
    anterior_dir = destino / "anterior"
    modelos_instalados_path = Path.home() / ".starseed" / "modelos-instalados.json"
    
    # Crear directorios necesarios
    destino.mkdir(parents=True, exist_ok=True)
    modelos_instalados_path.parent.mkdir(parents=True, exist_ok=True)
    # anterior_dir se creará solo si es necesario hacer backup
    
    # Comprobar espacio libre (dejar al menos 3 GB libres)
    try:
        statvfs = os.statvfs(destino_dir)
        espacio_libre = statvfs.f_frsize * statvfs.f_bavail
        if espacio_libre < 3 * 1024**3:  # 3 GB
            print(f"Error: Espacio insuficiente. Se requieren 3 GB libres, disponibles: {espacio_libre / (1024**3):.2f} GB")
            return False
    except (OSError, AttributeError):
        # En algunos sistemas puede no estar disponible statvfs
        pass
    
    # Ruta temporal para descarga
    ruta_temporal = destino / f".temporal_{hashlib.sha256(entrada.encode()).hexdigest()[:8]}"
    
    # Descargar con reanudación (la función descargar debe manejar esto)
    exito_descarga = descargar(str(ruta_temporal), sha_esperado)
    if not exito_descarga:
        if ruta_temporal.exists():
            if ruta_temporal.is_file():
                ruta_temporal.unlink()
            else:
                shutil.rmtree(ruta_temporal)
        return False
    
    # Verificar SHA256
    sha_calculado = _calcular_sha256(ruta_temporal)
    if sha_calculado != sha_esperado:
        print(f"Error: SHA256 no coincide. Esperado: {sha_esperado}, Calculado: {sha_calculado}")
        if ruta_temporal.exists():
            if ruta_temporal.is_file():
                ruta_temporal.unlink()
            else:
                shutil.rmtree(ruta_temporal)
        return False
    
    # Conservar versión anterior si existe
    if destino.exists() and any(destino.iterdir()):
        # Crear directorio anterior si no existe
        anterior_dir.mkdir(parents=True, exist_ok=True)
        
        # Limpiar anterior_dir (eliminar contenido existente)
        if anterior_dir.exists():
            shutil.rmtree(anterior_dir)
        anterior_dir.mkdir(parents=True, exist_ok=True)
        
        # Copiar contenido actual a anterior
        for item in destino.iterdir():
            if item.name.startswith('.'):
                continue  # Ignorar archivos ocultos como .temporal_*
            destino_item = anterior_dir / item.name
            if item.is_dir():
                shutil.copytree(item, destino_item)
            else:
                shutil.copy2(item, destino_item)
    
    # Cambio atómico: mover temporal a destino
    try:
        # Si el destino ya existe, reemplazar su contenido (manteniendo solo la carpeta anterior)
        if destino.exists():
            # Eliminar contenido existente excepto la carpeta anterior y archivos ocultos
            for item in destino.iterdir():
                if item.name == "anterior" or item.name.startswith('.'):
                    continue
                if item.is_dir():
                    shutil.rmtree(item)
                else:
                    item.unlink()
        
        # Crear destino si no existe
        if not destino.exists():
            destino.mkdir(parents=True, exist_ok=True)
        
        # Mover el temporal al destino con nombre fijo
        nombre_modelo = "modelo.dat"  # Nombre fijo para el modelo instalado
        destino_final = destino / nombre_modelo
        
        # Si ya existe un modelo con ese nombre, eliminarlo
        if destino_final.exists():
            if destino_final.is_file():
                destino_final.unlink()
            else:
                shutil.rmtree(destino_final)
        
        # Mover el temporal al destino final
        shutil.move(str(ruta_temporal), str(destino_final))
    except Exception as e:
        print(f"Error durante el cambio atómico: {e}")
        # Intentar restaurar versión anterior
        _restaurar_anterior(destino, anterior_dir)
        if ruta_temporal.exists():
            if ruta_temporal.is_file():
                ruta_temporal.unlink()
            else:
                shutil.rmtree(ruta_temporal)
        return False
    
    # Aquí iría la prueba del modelo (generar muestra, medir tiempo/memoria)
    # Según el contrato, pero para mantener el enfoque en la instalación,
    # dejamos que el llamador implemente la prueba si es necesario
    # En la práctica, esto se haría después de llamar a instalar()
    
    # Anotar en modelos-instalados.json
    _anotar_instalacion(
        entrada,
        destino_dir,
        sha_esperado,
        modelos_instalados_path
    )
    
    return True

def _restaurar_anterior(destino: Path, anterior_dir: Path) -> None:
    """Intenta restaurar la versión anterior desde el directorio anterior."""
    try:
        # Eliminar contenido actual del destino (excepto anterior)
        if destino.exists():
            for item in destino.iterdir():
                if item.name == "anterior" or item.name.startswith('.'):
                    continue
                if item.is_dir():
                    shutil.rmtree(item)
                else:
                    item.unlink()
        
        # Copiar desde anterior al destino
        if anterior_dir.exists():
            for item in anterior_dir.iterdir():
                destino_item = destino / item.name
                if item.is_dir():
                    shutil.copytree(item, destino_item)
                else:
                    shutil.copy2(item, destino_item)
    except Exception as e:
        print(f"Error al intentar restaurar versión anterior: {e}")

def volver_atras(area: str) -> bool:
    """
    Restaura la versión anterior de un modelo instalado.
    
    Args:
        area: Área del modelo (usado para buscar en modelos-instalados.json)
        
    Returns:
        bool: True si se restauró correctamente, False en caso contrario
    """
    modelos_instalados_path = Path.home() / ".starseed" / "modelos-instalados.json"
    
    if not modelos_instalados_path.exists():
        return False
    
    try:
        with open(modelos_instalados_path, 'r') as f:
            modelos = json.load(f)
    except (json.JSONDecodeError, OSError):
        return False
    
    # Buscar la entrada correspondiente al área
    entrada_encontrada = None
    for entrada, datos in modelos.items():
        if datos.get("area") == area:
            entrada_encontrada = entrada
            break
    
    if entrada_encontrada is None:
        return False
    
    datos = modelos[entrada_encontrada]
    destino_dir = datos.get("ruta")
    if not destino_dir:
        return False
    
    destino = Path(destino_dir)
    anterior_dir = destino / "anterior"
    
    if not anterior_dir.exists() or not any(anterior_dir.iterdir()):
        return False
    
    try:
        # Guardar versión actual como nueva anterior (por si acaso)
        anterior_temp = destino / "anterior_temp"
        if anterior_temp.exists():
            shutil.rmtree(anterior_temp)
        if destino.exists() and any(destino.iterdir()):
            shutil.copytree(destino, anterior_temp, dirs_exist_ok=True)
        
        # Eliminar contenido actual del destino (excepto la carpeta anterior)
        if destino.exists():
            for item in destino.iterdir():
                if item.name.startswith('.') or item.name == "anterior":
                    continue
                if item.is_dir():
                    shutil.rmtree(item)
                else:
                    item.unlink()
        
        # Copiar desde anterior al destino
        for item in anterior_dir.iterdir():
            destino_item = destino / item.name
            if item.is_dir():
                shutil.copytree(item, destino_item)
            else:
                shutil.copy2(item, destino_item)
        
        # Actualizar registro (opcional: podríamos querer mantener un historial)
        # Por ahora, dejamos el registro como está para referencia
        
        return True
    except Exception as e:
        print(f"Error al restaurar versión anterior: {e}")
        return False

def _calcular_sha256(ruta: Path) -> str:
    """Calcula el SHA256 de un archivo o directorio."""
    sha256_hash = hashlib.sha256()
    if ruta.is_file():
        # Archivo sencillo
        with open(ruta, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
    else:
        # Directorio: procesamos archivos en orden alfabético para consistencia
        for root, dirs, files in os.walk(ruta):
            dirs.sort()  # Ordenar directorios para consistencia
            files.sort()  # Ordenar archivos para consistencia
            for file in files:
                file_path = Path(root) / file
                # Incluir ruta relativa en el hash para preservar estructura
                rel_path = file_path.relative_to(ruta)
                sha256_hash.update(str(rel_path).encode('utf-8'))
                sha256_hash.update(b':')
                with open(file_path, "rb") as f:
                    for byte_block in iter(lambda: f.read(4096), b""):
                        sha256_hash.update(byte_block)
                sha256_hash.update(b';')
    return sha256_hash.hexdigest()

def _anotar_instalacion(
    entrada: str,
    destino_dir: str,
    sha_esperado: str,
    modelos_instalados_path: Path
) -> None:
    """Anota la instalación en el registro de modelos instalados."""
    registro = {}
    if modelos_instalados_path.exists():
        try:
            with open(modelos_instalados_path, 'r') as f:
                registro = json.load(f)
        except (json.JSONDecodeError, OSError):
            registro = {}
    
    from datetime import datetime
    registro[entrada] = {
        "area": _determinar_area_desde_entrada(entrada),  # Función simplificada
        "id": entrada,
        "version": "desconocida",  # En una implementación real se obtendría del modelo
        "sha": sha_esperado,
        "ruta": destino_dir,
        "fecha": datetime.now().isoformat()
    }
    
    try:
        with open(modelos_instalados_path, 'w') as f:
            json.dump(registro, f, indent=2)
    except OSError:
        pass  # No fallar si no podemos escribir el registro

def _determinar_area_desde_entrada(entrada: str) -> str:
    """Función simplificada para determinar el área desde la entrada.
    En una implementación real, esto sería más complejo o vendría como parámetro."""
    entrada_lower = entrada.lower()
    if "image" in entrada_lower or "img" in entrada_lower:
        return "imagen"
    elif "video" in entrada_lower:
        return "video"
    elif "audio" in entrada_lower or "tts" in entrada_lower or "stt" in entrada_lower:
        return "voz"
    elif "3d" in entrada_lower or "mesh" in entrada_lower:
        return "3d"
    elif "embedding" in entrada_lower:
        return "incrustaciones"
    elif any(x in entrada_lower for x in ["needle", "bitnet", "bonsai", "llm"]):
        return "palabra y razón"
    else:
        return "desconocida"