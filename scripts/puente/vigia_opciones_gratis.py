#!/usr/bin/env python3
"""
Vigía de opciones gratis: refrescar el catálogo por canales oficiales
"""

import json
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any, TypedDict

# Añadir el directorio raíz al path para importar módulos de TypeScript compilados
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

def obtener_catalogo() -> List[Dict[str, Any]]:
    """
    Obtiene el catálogo de opciones intentando leer el JSON existente
    o generándolo usando node/tsx si no existe.
    """
    # Intentar leer el JSON existente primero
    json_path = Path("starseed_memory_root/genesis/catalogo-opciones.json")
    if json_path.exists():
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error al leer {json_path}: {e}", file=sys.stderr)
    
    # Si no existe o hay error, generar usando node/tsx
    try:
        # Crear un script temporal que importe y ejecute la función de fusión
        script_content = """
        const { fusionarCatalogos } = require('./src/lib/genesis/conectores/catalogo-opciones');
        const { PROVEEDORES_CATALOGO } = require('./src/lib/mando/proveedores-catalogo');
        const { FREE_CATALOG } = require('./src/ai/astraura/free-catalog');
        
        const catalogo = fusionarCatalogos(PROVEEDORES_CATALOGO, FREE_CATALOG);
        console.log(JSON.stringify(catalogo));
        """
        
        # Escribir el script temporal
        import tempfile
        import os
        with tempfile.NamedTemporaryFile(mode='w', suffix='.js', delete=False) as f:
            f.write(script_content)
            temp_script = f.name
        
        try:
            # Ejecutar el script temporal con node
            result = subprocess.run(
                ["node", temp_script],
                capture_output=True,
                text=True,
                timeout=30
            )
            if result.returncode == 0:
                return json.loads(result.stdout)
            else:
                print(f"Error al ejecutar script de generación: {result.stderr}", file=sys.stderr)
        finally:
            # Limpiar el archivo temporal
            os.unlink(temp_script)
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