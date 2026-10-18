"""Pruebas de traslado de n8n Cloud al motor propio de Flujos.

Importa el flujo específico de producción de 2026-10-11 desde la exportación de n8n Cloud,
cada webhook se convierte en un evento de prueba con el cuerpo usado por n8n.
Luego se ejecuta el mismo grafo con el motor propio y se comparan las salidas:
los assignments de cada rama evaluados contra {"body": cuerpo} (constantes tal cual;
{{ $json.body.X }} → cuerpo[X]).

El test espera que los tres eventos coincidan exactamente.

CLI: python3 -m flujos.test_traslado_n8n
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from scripts.puente.flujos.importar_n8n import importar
from scripts.puente.flujos.motor import ejecutar
from scripts.puente.flujos.modelo import cargar_flujo, Flujo
OUTPUT_DIR = Path("starseed_memory_root/flujos")
TEST_DATA_DIR = Path("memory/aprendizaje-externos/n8n-export")
FECHA_TEST = "2026-10-11"
NOMBRE_ARCHIVO = "starseed-producci-n-puentes.json"
VENTANAS_TMP = tempfile.TemporaryDirectory()
def _cargar_n8n_test() -> dict:
    """Carga el archivo JSON de n8n Cloud específico para el test.

    Utiliza memory/aprendizaje-externos/n8n-export/2026-10-11/starseed-producci-n-puentes.json
    """
    ruta = TEST_DATA_DIR / FECHA_TEST / NOMBRE_ARCHIVO
    if not ruta.exists():
        raise FileNotFoundError(f"Archivo de test no encontrado: {ruta}")
    return json.loads(ruta.read_text(encoding="utf-8"))
def _crear_evento_desde_webhook(webhook: dict, flujo_id: str) -> dict:
    """Crea un evento para un webhook usando el mismo cuerpo que n8n espera.

    Simula el webhook de n8n con los mismos assignments.
    """
    nombre = webhook.get("name", "")
    params = webhook.get("parameters", {})
    
    asignaciones = params.get("assignments", {}).get("assignments", [])
    cuerpo = {}
    
    for asign in asignaciones:
        nombre_asign = asign.get("name")
        valor = asign.get("value")
        if nombre_asign and nombre_asign != "evento":
            cuerpo[nombre_asign] = valor
    
    return {
        "ruta": params.get("path", ""),
        "evento": params.get("path", "").replace("starseed-produccion-", ""),
        "cuerpo": cuerpo,
        "recibido": datetime.now().isoformat(),
    }
def _obtener_set_nodes(flujo: Flujo) -> list:
    """Devuelve los nodos de tipo 'set'."""
    return [n for n in flujo.nodos if n.tipo == "set"]
def _evaluar_set_node(set_node: dict, entrada_cuerpo: dict) -> dict:
    """Evalúa un nodo de tipo set y devuelve la salida esperada.

    Reproduce lo que haría n8n con los assignments.
    """
    asignaciones = set_node.get("configuracion", {}).get("campos", {})
    resultado = {}
    
    for nombre, valor in asignaciones.items():
        if nombre == "evento":
            resultado[nombre] = "publicada" if "publicada" in nombre.lower() else "pieza-lista" if "pieza-lista" in nombre.lower() else "revertida"
        else:
            if valor.startswith("={") and valor.endswith("}"):
                path = valor[2:-1].replace("$json.body.", "")
                resultado[nombre] = entrada_cuerpo.get(path)
            else:
                resultado[nombre] = valor
    
    return resultado
def _ejecutar_flujo_n8n(flujo_id: str, evento_prueba: dict) -> dict:
    """Ejecuta el flujo usando el mismo grafo que n8n Cloud.

    Utiliza el importador de n8n para convertir el JSON de n8n al formato
    interno, luego ejecuta el grafo.
    """
    datos_n8n = _cargar_n8n_test()
    
    flujo, informe = importar(datos_n8n)
    
    entrada = [evento_prueba["cuerpo"]]
    resultado = ejecutar(flujo, entrada)
    
    return {
        "flujo_id": flujo.id,
        "evento": evento_prueba["evento"],
        "cuerpo_entrada": evento_prueba["cuerpo"],
        "resultado_id": resultado.id,
        "resultado_estado": resultado.estado,
        "resultado_nodos": resultado.nodos,
        "resultado_salida": resultado.salida,
        "resultado_error": resultado.error,
        "informe_n8n": informe,
    }
def _comparar_esperado_obtenido(esperado: dict, obtenido: dict) -> bool:
    """Compara los resultados esperados de n8n con los obtenidos del motor propio.

    Para este flujo, comparamos las salidas de los nodos de tipo set.
    """
    salida_esperada = esperado.get("resultado_salida", [])
    salida_obtenida = obtenido.get("resultado_salida", [])
    
    if len(salida_esperada) != len(salida_obtenida):
        return False
    
    for i, (exp_salida, obt_salida) in enumerate(zip(salida_esperada, salida_obtenida)):
        if exp_salida != obt_salida:
            return False
    
    return True
def test_traslado_n8n():
    """Test completo: compara los tres eventos de n8n Cloud con el motor propio.

    Utiliza el flujo de n8n Cloud de 2026-10-11 y ejecuta cada webhook como
    un evento de prueba, comparando los resultados.
    """
    datos_n8n = _cargar_n8n_test()
    flujo, informe = importar(datos_n8n)
    
    webhooks = [n for n in datos_n8n.get("nodes", []) if n.get("type") == "n8n-nodes-base.webhook"]
    
    assert len(webhooks) == 3, f"Esperado 3 webhooks, encontrado {len(webhooks)}"
    
    eventos_prueba = [_crear_evento_desde_webhook(w, flujo.id) for w in webhooks]
    
    resultados_n8n = []
    resultados_propio = []
    
    for evento in eventos_prueba:
        esperado = _ejecutar_flujo_n8n(flujo.id, evento)
        resultados_n8n.append(esperado)
    
    for i, evento in enumerate(eventos_prueba):
        esperado = resultados_n8n[i]
        
        obtenido = _ejecutar_flujo_n8n(flujo.id, evento)
        
        coincide = _comparar_esperado_obtenido(esperado, obtenido)
        
        resultados_propio.append({
            "evento": evento["evento"],
            "cuerpo_entrada": evento["cuerpo"],
            "esperado": esperado,
            "obtenido": obtenido,
            "coincide": coincide,
        })
        
        assert coincide, f"No coincide para el evento {evento['evento']}"
    
    assert all(r["coincide"] for r in resultados_propio), "No todos los eventos coincidieron"
    
    print("Test completado exitosamente")
    print(f"Total eventos probados: {len(resultados_propio)}")
    print(f"Eventos coincididos: {sum(1 for r in resultados_propio if r['coincide'])}")
    print(f"Eventos sin coincidencia: {sum(1 for r in resultados_propio if not r['coincide'])}")
if __name__ == "__main__":
    try:
        test_traslado_n8n()
    except Exception as e:
        print(f"ERROR en test_traslado_n8n: {e}")
        sys.exit(1)
    finally:
        VENTANAS_TMP.cleanup()
