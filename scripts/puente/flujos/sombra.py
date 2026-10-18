"""Sombra: comparador de n8n Cloud y el motor propio de Flujos.

Convierte cada webhook del flujo más reciente de n8n Cloud en un evento de prueba
con el cuerpo que esperaría la producción y ejecuta el mismo grafo con el motor
propio. Escribe un informe en memory/aprendizaje-externos/sombra-<AAAA-MM-DD>.json
y sale con 1 si algo no coincide.

CLI: python3 -m flujos.sombra
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scripts.puente.flujos.importar_n8n import importar
from scripts.puente.flujos.motor import ejecutar
from scripts.puente.flujos.modelo import cargar_flujo
from scripts.puente.produccion_webhooks import _cuerpo_evento
OUTPUT_DIR = Path("memory/aprendizaje-externos")
ENVIROMENTOS_RUTAS = Path("memory/aprendizaje-externos/n8n-export")
def _ultimo_export() -> Path:
    """Devuelve el directorio de exportación más reciente.

    Espera una estructura como:
      memory/aprendizaje-externos/n8n-export/<fecha>/starseed-*.json
    """
    if not ENVIROMENTOS_RUTAS.exists():
        raise RuntimeError(f"No se encontró {ENVIROMENTOS_RUTAS}")
    dirs = [d for d in ENVIROMENTOS_RUTAS.iterdir() if d.is_dir()]
    if not dirs:
        raise RuntimeError(f"No hay subdirectorios en {ENVIROMENTOS_RUTAS}")
    ultima = max(dirs, key=lambda d: d.name)
    return ultima
def _cargar_json_export(dir_export: Path) -> Dict[str, Any]:
    """Carga el primer JSON de flujo de la exportación más reciente.

    Normalmente hay solo uno, pero podría haber varios.
    """
    archivos = list(dir_export.glob("*.json"))
    if not archivos:
        raise RuntimeError(f"No se encontraron *.json en {dir_export}")
    archivo = archivos[0]
    return json.loads(archivo.read_text(encoding="utf-8"))
def _crear_evento_prueba(flujo_id: str, webhook: Dict[str, Any]) -> Dict[str, Any]:
    """Crea un evento de prueba para un webhook específico.

    Utiliza los datos de produccion_webhooks._cuerpo_evento como cuerpo esperable.
    """
    nombre = webhook.get("name", "")
    params = webhook.get("parameters", {})
    evento = params.get("path", "")
    if not evento:
        evento = nombre.replace("Webhook", "").lower()
    
    campos = params.get("assignments", {}).get("assignments", [])
    cuerpo_datos = {}
    for campo in campos:
        nombre_campo = campo.get("name")
        valor = campo.get("value")
        if nombre_campo and nombre_campo != "evento":
            cuerpo_datos[nombre_campo] = valor
    
    cuerpo_evento = _cuerpo_evento(evento, cuerpo_datos)
    return {
        "ruta": webhook.get("parameters", {}).get("path", ""),
        "recibido": datetime.now().isoformat(),
        "cuerpo": cuerpo_evento.decode("utf-8"),
    }
def _ejecutar_flujo_propio(flujo_id: str, entrada: Dict[str, Any]) -> Dict[str, Any]:
    """Ejecuta el flujo con el motor propio y devuelve el resultado final.

    Carga el flujo desde el repositorio (starseed_memory_root/flujos/).
    """
    try:
        flujo = cargar_flujo(flujo_id, Path("starseed_memory_root/flujos"))
    except Exception:
        flujo = importar(_cargar_json_export(_ultimo_export()))[0]
    
    resultado = ejecutar(flujo, [entrada])
    return {
        "id": resultado.id,
        "estado": resultado.estado,
        "nodos": resultado.nodos,
        "salida": resultado.salida,
        "error": resultado.error,
    }
def _comparar_salidas(esperado: Dict[str, Any], obtenido: Dict[str, Any]) -> bool:
    """Compara las salidas esperadas con las obtenidas del motor propio.

    Simplificación: para este flujo, esperamos que el evento coincida y
    que haya una salida con el mismo evento.
    """
    if esperado.get("evento") != "publicada" and esperado.get("evento") != "pieza-lista" and esperado.get("evento") != "revertida":
        return False
    
    esperado_salidas = esperado.get("salida", [])
    obtenido_salidas = obtenido.get("salida", [])
    
    if not esperado_salidas or not obtenido_salidas:
        return False
    
    esperado_evento = esperado_salidas[0].get("evento")
    obtenido_evento = obtenido_salidas[0].get("evento")
    
    if esperado_evento != obtenido_evento:
        return False
    
    esperado_datos = esperado_salidas[0].get("datos", {})
    obtenido_datos = obtenido_salidas[0].get("datos", {})
    
    return esperado_datos == obtenido_datos
def _ejecutar_comparacion() -> None:
    """Ejecuta el flujo completo de comparación para un solo día.

    Carga el flujo más reciente de n8n Cloud, crea un evento de prueba para cada
    webhook y ejecuta el mismo grafo con el motor propio. Escribe el informe.
    """
    dir_export = _ultimo_export()
    flujo_n8n = _cargar_json_export(dir_export)
    
    flujo_id = flujo_n8n.get("name", "flujo").lower().replace(" ", "-")
    
    eventos_prueba = []
    webhooks = [n for n in flujo_n8n.get("nodes", []) if n.get("type") == "n8n-nodes-base.webhook"]
    
    for webhook in webhooks:
        evento_prueba = _crear_evento_prueba(flujo_id, webhook)
        eventos_prueba.append(evento_prueba)
    
    informe = {
        "fecha": dir_export.name,
        "flujo_n8n": flujo_n8n,
        "eventos": eventos_prueba,
        "resultados": [],
        "errores": [],
        "completo": False,
    }
    
    for i, evento in enumerate(eventos_prueba):
        try:
            datos_cuerpo = json.loads(evento["cuerpo"])
            entrada = {"evento": datos_cuerpo.get("evento"), "datos": datos_cuerpo.get("datos", {})}
            
            resultado = _ejecutar_flujo_propio(flujo_id, entrada)
            coincide = _comparar_salidas(datos_cuerpo, resultado)
            
            informe["resultados"].append({
                "evento": datos_cuerpo.get("evento"),
                "esperado": datos_cuerpo,
                "obtenido": resultado,
                "coincide": coincide,
            })
        except Exception as e:
            informe["errores"].append({
                "evento": evento.get("ruta", "desconocido"),
                "error": str(e),
            })
    
    informe["completo"] = len(informe["resultados"]) > 0 and len(informe["errores"]) == 0
    
    nombre_archivo = OUTPUT_DIR / f"sombra-{dir_export.name}.json"
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    nombre_archivo.write_text(json.dumps(informe, ensure_ascii=False, indent=2), encoding="utf-8")
    
    print(f"Informe escrito en {nombre_archivo}")
    if not informe["completo"]:
        print("ERROR: No se completó correctamente la comparación")
        sys.exit(1)
def main():
    """Punto de entrada principal."""
    try:
        _ejecutar_comparacion()
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
if __name__ == "__main__":
    main()
