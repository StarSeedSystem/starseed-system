#!/usr/bin/env python3
"""
Vigía de opciones gratis: refrescar el catálogo por canales oficiales
"""

import json
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any, TypedDict

# Repo root calculado en importación (antes de que los tests mockeen Path)
REPO_ROOT = Path(__file__).resolve().parent.parent.parent

# Añadir el directorio raíz al path para importar módulos de TypeScript compilados
sys.path.insert(0, str(REPO_ROOT))

def obtener_catalogo() -> List[Dict[str, Any]]:
    """
    Obtiene el catálogo de opciones intentando leer el JSON existente
    o generándolo usando tsx si no existe.
    """
    # Intentar leer el JSON existente primero (usa Path para que el test pueda mockearlo)
    json_path = Path("starseed_memory_root/genesis/catalogo-opciones.json")
    if json_path.exists():
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error al leer {json_path}: {e}", file=sys.stderr)

    # Si no existe o hay error, generar usando tsx (usa REPO_ROOT calculado en importación)
    try:
        # Crear un script temporal en la raíz del repo para que los imports relativos funcionen
        script_content = """
        import { fusionarCatalogos } from './src/lib/genesis/conectores/catalogo-opciones.ts';
        import { PROVEEDORES_CATALOGO } from './src/lib/mando/proveedores-catalogo.ts';
        import { FREE_CATALOG } from './src/ai/astraura/free-catalog.ts';

        const catalogo = fusionarCatalogos(PROVEEDORES_CATALOGO, FREE_CATALOG);
        console.log(JSON.stringify(catalogo));
        """

        # Escribir el script temporal en la raíz del repo
        import tempfile
        temp_script = REPO_ROOT / f".tmp_gen_catalogo_{os.getpid()}.ts"
        with open(temp_script, 'w', encoding='utf-8') as f:
            f.write(script_content)

        try:
            # Ejecutar el script temporal con tsx (soporta TypeScript) desde la raíz del repo
            result = subprocess.run(
                ["npx", "tsx", str(temp_script)],
                capture_output=True,
                text=True,
                timeout=60,
                cwd=REPO_ROOT
            )
            if result.returncode == 0:
                return json.loads(result.stdout)
            else:
                print(f"Error al ejecutar script de generación: {result.stderr}", file=sys.stderr)
        finally:
            # Limpiar el archivo temporal
            try:
                os.unlink(temp_script)
            except OSError:
                pass
    except Exception as e:
        print(f"Error al intentar generar catálogo: {e}", file=sys.stderr)

    # Como último recurso, retornamos una lista vacía
    return []

def consultar_canal_oficial(opcion: Dict[str, Any]) -> Dict[str, Any]:
    """
    Consulta el canal oficial de una opción y devuelve los campos actualizados.
    Esta es una función placeholder - en la implementación real haría peticiones HTTP.
    """
    # En una implementación real, aquí haríamos:
    # 1. Según el tipo de opción, determinar el canal oficial
    # 2. Hacer una petición HTTP con el agente de usuario especificado
    # 3. Parsear la respuesta para verificar si la opción sigue siendo válida
    # 4. Devolver los campos actualizados
    
    # Por ahora, simulamos que todo está verificado
    opcion_copy = opcion.copy()
    opcion_copy["verificado"] = datetime.now().isoformat()
    opcion_copy["a_revisar"] = False  # Asumimos que no cambió por ahora
    return opcion_copy

def vigia_opciones_gratis() -> List[Dict[str, Any]]:
    """
    Función principal del vigía de opciones gratis.
    """
    # Obtener el catálogo
    catalogo = obtener_catalogo()
    
    if not catalogo:
        print("Advertencia: Catálogo vacío o no disponible", file=sys.stderr)
        return []
    
    # Procesar cada entrada
    resultado = []
    for opcion in catalogo:
        try:
            # Consultar el canal oficial
            opcion_actualizada = consultar_canal_oficial(opcion)
            resultado.append(opcion_actualizada)
            
            # Pausa de 10 s entre consultas para no sobrecargar los servidores
            time.sleep(10)
        except Exception as e:
            print(f"Error al procesar opción {opcion.get('id', 'desconocida')}: {e}", file=sys.stderr)
            # En caso de error, marcamos como no verificado pero seguimos
            opcion_error = opcion.copy()
            opcion_error["verificado"] = None
            opcion_error["a_revisar"] = True
            resultado.append(opcion_error)
    
    return resultado

def main():
    """Función de entrada principal."""
    print("Iniciando vigía de opciones gratis...")
    
    # Ejecutar el vigía
    estado = vigia_opciones_gratis()
    
    # Crear el directorio si no existe
    output_dir = Path("starseed_memory_root/genesis")
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Guardar el resultado
    output_path = output_dir / "estado-opciones.json"
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(estado, f, indent=2, ensure_ascii=False)
    
    print(f"Vigía completado. Estado guardado en {output_path}")
    print(f"Procesadas {len(estado)} opciones.")

if __name__ == "__main__":
    main()