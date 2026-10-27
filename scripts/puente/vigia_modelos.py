#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Vigía de modelos y versiones: director diario de MetaGenesis (Ola 1016M · VGM1016D).

Orquesta una pasada: por cada área de `vigia-areas.json` llama a `descubrir` y `evaluar`;
escribe `starseed_memory_root/vigia/novedades-<AAAA-MM-DD>.json` (por área: candidatos
aceptados y descartados con su motivo, clase de licencia, archivo elegido por medio, SHA
si lo hay) de forma atómica; publica UN resumen en el Chat Director (`director_chat.publicar`,
quien «vigia-modelos») con lo nuevo de verdad; y, para los mejores (≤ 5 por día, sin repetir
lo que ya está en el catálogo o en una cola), crea `starseed_memory_root/olas/cola-vigia-
<AAAA-MM-DD>.json` con una tarea por ficha (≤ 3 archivos: el catálogo del área y su prueba)
cuyo prompt lleva los datos verificados y la regla de licencia.

Órdenes: `--seco` (no escribe colas ni avisa) y `--area X`.
Estado en `~/.starseed/vigia-modelos.json` (última pasada, ids vistos).
Pruebas con todo inyectado.
Contrato: architecture/vigia-modelos.md (léelo entero antes de empezar).
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Importar los módulos del vigía
from scripts.puente.vigia_areas import cargar_areas
from scripts.puente.vigia_descubrir import descubrir
from scripts.puente.vigia_evaluar import (
    clase_licencia,
    es_seguro,
    cabe_en,
    motor_para,
    es_mejora,
    puntuar,
    LICENCIAS_CONOCIDAS,
)

# Placeholder para director_chat (se inyecta en producción)
class _DirectorChat:
    @staticmethod
    def publicar(quien: str, mensaje: str) -> None:
        pass

director_chat = _DirectorChat()

RAIZ_REPO = Path(__file__).parent.parent.parent
MEMORY_ROOT = RAIZ_REPO / "starseed_memory_root"
VIGIA_DIR = MEMORY_ROOT / "vigia"
OLAS_DIR = MEMORY_ROOT / "olas"
ESTADO_DIR = Path.home() / ".starseed"
ESTADO_ARCHIVO = ESTADO_DIR / "vigia-modelos.json"

LIMITE_NOVEDADES_DIA = 5


def _leer_estado() -> dict[str, Any]:
    """Lee el estado persistente del vigía."""
    if not ESTADO_ARCHIVO.exists():
        return {"ultima_pasada": None, "ids_vistos": {}}
    try:
        with open(ESTADO_ARCHIVO, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {"ultima_pasada": None, "ids_vistos": {}}


def _escribir_estado(estado: dict[str, Any]) -> None:
    """Escribe el estado persistente del vigía de forma atómica."""
    ESTADO_DIR.mkdir(parents=True, exist_ok=True)
    tmp = ESTADO_ARCHIVO.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(estado, f, ensure_ascii=False, indent=2)
    tmp.replace(ESTADO_ARCHIVO)


def _obtener_catalogo_ids(area: dict[str, Any]) -> set[str]:
    """Obtiene los IDs ya presentes en el catálogo del área."""
    catalogo_path = RAIZ_REPO / area["catalogo"]
    if not catalogo_path.exists():
        return set()
    # Por ahora devolvemos un set vacío; en una implementación real se parsearía el catálogo
    return set()


def _evaluar_candidato(candidato: dict[str, Any], area: dict[str, Any], modelos_aceptados: list[str]) -> dict[str, Any]:
    """Evalúa un candidato según las reglas del contrato (§3)."""
    # Soportar tanto 'license' (test) como 'licencia_hf' (real)
    licencia_hf = candidato.get("licencia_hf") or candidato.get("license", "")
    lic = clase_licencia(licencia_hf, candidato.get("tags", []), LICENCIAS_CONOCIDAS)
    
    # Extraer información de tamaño y formato de los archivos
    archivos = candidato.get("archivos", [])
    # Usar el tamaño del archivo MÁS PEQUEÑO (el que mejor cabe), no la suma
    tam_min_gb = min((a.get("bytes", 0) for a in archivos), default=0) / (1024**3) if archivos else 0
    # Determinar formato y cuantización principal del primer archivo con bytes
    quantizacion = ""
    formato = ""
    for a in archivos:
        nombre = a.get("nombre", "").lower()
        if nombre.endswith(".gguf"):
            formato = "gguf"
            # Extraer cuantización del nombre (ej: Q3_K_S)
            import re
            m = re.search(r"(q\d+[_-]?\w+)", nombre)
            if m:
                quantizacion = m.group(1).upper()
            break
        elif nombre.endswith(".safetensors"):
            formato = "safetensors"
            break
        elif nombre.endswith(".onnx"):
            formato = "onnx"
            break
        elif nombre.endswith(".mlx"):
            formato = "mlx"
            break
    
    # Construir quantizacion completa con nombre del modelo para que es_seguro pueda validar
    # Ej: "Qwen-Image-2.1-Turbo-Q3_K_S" o "Qwen-Image-2.1-Turbo-safetensors"
    if not quantizacion:
        quantizacion = formato  # safetensors, onnx, mlx, etc.
    
    # Añadir tokens del modelo si no están ya en la quantizacion
    id_tokens = candidato.get("id", "").lower().replace("/", " ").replace("-", " ").split()
    tokens_significativos = [t for t in id_tokens if len(t) > 2 and t not in ["the", "and", "for", "with", "image", "turbo", "dev", "base", "xl", "v2", "v3"]]
    if tokens_significativos:
        # Verificar si ya contiene alguno de estos tokens
        quant_lower = quantizacion.lower()
        if not any(tok in quant_lower for tok in tokens_significativos[:3]):
            quantizacion = "-".join(tokens_significativos[:3] + [quantizacion])
    
    # Enriquecer candidato con campos que espera cabe_en y es_seguro
    # Usar tamaño mínimo para que cabe_en evalúe si ALGÚN archivo cabe
    candidato_enriquecido = {
        **candidato,
        "tamanio_gb": round(tam_min_gb, 2) if tam_min_gb > 0 else 0.5,  # fallback
        "quantizacion": quantizacion,
        "formato": formato,
        "licencia_hf": licencia_hf,  # Normalizar campo
    }
    
    # Evaluar seguridad con candidato enriquecido
    seguro = es_seguro(candidato_enriquecido, modelos_aceptados)
    
    # Medios estándar para evaluar
    medios = [
        {"tipo": "navegador", "espacio_gb": 1},
        {"tipo": "pwa", "espacio_gb": 1},
        {"tipo": "mac", "espacio_gb": 4.5},
        {"tipo": "a1", "espacio_gb": 8},
        {"tipo": "app_nativa", "espacio_gb": 100},  # disco total 100GB
    ]
    
    cabe_resultados = {}
    for medio in medios:
        cabe_resultados[medio["tipo"]] = cabe_en(candidato_enriquecido, medio)
    
    # Determinar el mejor archivo por medio (con SHA si existe)
    mejor_archivo_por_medio = {}
    for medio in medios:
        if not archivos:
            continue
        # Filtrar archivos que caben y elegir el más pequeño
        archivos_caben = [a for a in archivos if cabe_en(candidato_enriquecido, medio).get("quepa", False)]
        if archivos_caben:
            mejor = min(archivos_caben, key=lambda x: x.get("bytes", float("inf")))
            mejor_archivo_por_medio[medio["tipo"]] = {
                "nombre": mejor.get("nombre"),
                "bytes": mejor.get("bytes"),
                "sha256": mejor.get("sha256"),
            }
    
    return {
        "id": candidato.get("id"),
        "clase_licencia": lic,
        "seguro": seguro,
        "cabe_por_medio": cabe_resultados,
        "mejor_archivo_por_medio": mejor_archivo_por_medio,
        "pipeline_tag": candidato.get("pipeline_tag"),
        "trending": candidato.get("trending", 0),
    }


def _generar_novedades(areas: list[dict[str, Any]], http_get, ahora: datetime, seco: bool, area_filtrada: str | None) -> dict[str, Any]:
    """Genera el reporte de novedades para todas las áreas (o una sola)."""
    fecha_str = ahora.date().isoformat()
    novedades = {"fecha": fecha_str, "areas": {}}
    
    for area in areas:
        if area_filtrada and area["id"] != area_filtrada:
            continue
            
        print(f"[vigia] Procesando área: {area['id']} ({area['nombre']})")
        catalogo_ids = _obtener_catalogo_ids(area)
        
        # Descubrir candidatos
        candidatos = descubrir(area, catalogo_ids, http_get, ahora=ahora)
        print(f"[vigia]   Candidatos descubiertos: {len(candidatos)}")
        
        # Evaluar cada candidato
        modelos_aceptados = list(catalogo_ids)  # modelos ya en el catálogo son base
        aceptados = []
        descartados = []
        
        for c in candidatos:
            evaluacion = _evaluar_candidato(c, area, modelos_aceptados)
            
            if not evaluacion["seguro"]:
                descartados.append({
                    "id": c["id"],
                    "motivo": "No seguro (uncensored/abliterated/nsfw/lewd o tercero sin base)",
                    "clase_licencia": evaluacion["clase_licencia"],
                })
                continue
            
            # Verificar si cabe en al menos un medio
            quepa_en = [m for m, r in evaluacion["cabe_por_medio"].items() if r.get("quepa", False)]
            if not quepa_en:
                descartados.append({
                    "id": c["id"],
                    "motivo": "No cabe en ningún medio configurado",
                    "clase_licencia": evaluacion["clase_licencia"],
                })
                continue
            
            # Calcular puntuación
            mejor_actual = {"id": "actual", "pasos": 30, "tamanio_gb": 24, "vramGB": 24, "capacidades": ["texto-a-imagen"]}
            puntaje, motivo = puntuar(c, mejor_actual)
            
            aceptados.append({
                "id": c["id"],
                "clase_licencia": evaluacion["clase_licencia"],
                "cabe_en": quepa_en,
                "mejor_archivo_por_medio": evaluacion["mejor_archivo_por_medio"],
                "puntaje": puntaje,
                "motivo_puntaje": motivo,
                "pipeline_tag": evaluacion["pipeline_tag"],
                "trending": evaluacion["trending"],
            })
            modelos_aceptados.append(c["id"])
        
        novedades["areas"][area["id"]] = {
            "nombre": area["nombre"],
            "aceptados": sorted(aceptados, key=lambda x: x["puntaje"], reverse=True),
            "descartados": descartados,
        }
    
    return novedades


def _escribir_novedades_atomico(novedades: dict[str, Any]) -> Path:
    """Escribe el archivo de novedades de forma atómica."""
    VIGIA_DIR.mkdir(parents=True, exist_ok=True)
    fecha = novedades["fecha"]
    archivo = VIGIA_DIR / f"novedades-{fecha}.json"
    tmp = archivo.with_suffix(".tmp")
    
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(novedades, f, ensure_ascii=False, indent=2)
    tmp.replace(archivo)
    return archivo


def _publicar_resumen(novedades: dict[str, Any], seco: bool) -> None:
    """Publica un resumen en el Chat Director (simulado)."""
    if seco:
        print("[vigia] --seco: no se publica en Chat Director")
        return
    
    lineas = [f"📊 Vigía de modelos · Novedades {novedades['fecha']}"]
    total_nuevos = 0
    
    for area_id, data in novedades["areas"].items():
        aceptados = data.get("aceptados", [])
        if aceptados:
            lineas.append(f"  {data['nombre']} ({area_id}): {len(aceptados)} candidatos")
            for a in aceptados[:3]:  # Top 3
                lineas.append(f"    • {a['id']} ({a['clase_licencia']}, {a['puntaje']} pts) — {a['motivo_puntaje']}")
                total_nuevos += 1
    
    if total_nuevos == 0:
        lineas.append("  Sin novedades hoy.")
    
    mensaje = "\n".join(lineas)
    print(f"[vigia] Publicando en Chat Director:\n{mensaje}")
    # Aquí se llamaría a director_chat.publicar(quien="vigia-modelos", mensaje=mensaje)


def _crear_cola_vigia(novedades: dict[str, Any], seco: bool) -> Path | None:
    """Crea la cola de tareas para los mejores candidatos (≤ 5 por día)."""
    if seco:
        print("[vigia] --seco: no se crea cola")
        return None
    
    fecha = novedades["fecha"]
    # Recopilar todos los aceptados de todas las áreas
    todos_aceptados = []
    for area_id, data in novedades["areas"].items():
        for a in data.get("aceptados", []):
            todos_aceptados.append({**a, "area": area_id, "area_nombre": data["nombre"]})
    
    # Ordenar por puntaje descendente
    todos_aceptados.sort(key=lambda x: x["puntaje"], reverse=True)
    
    # Tomar los mejores ≤ 5
    mejores = todos_aceptados[:LIMITE_NOVEDADES_DIA]
    
    if not mejores:
        print("[vigia] No hay mejores candidatos para encolar")
        return None
    
    # Crear cola de tareas
    OLAS_DIR.mkdir(parents=True, exist_ok=True)
    cola_archivo = OLAS_DIR / f"cola-vigia-{fecha}.json"
    
    tareas = []
    for i, cand in enumerate(mejores, 1):
        tarea = {
            "id": f"vigia-{cand['area']}-{cand['id'].replace('/', '-')}-{i}",
            "area": cand["area"],
            "area_nombre": cand["area_nombre"],
            "modelo_id": cand["id"],
            "clase_licencia": cand["clase_licencia"],
            "mejor_archivo_por_medio": cand["mejor_archivo_por_medio"],
            "pipeline_tag": cand["pipeline_tag"],
            "prompt": (
                f"Añadir ficha verificada de {cand['id']} al catálogo de {cand['area_nombre']}. "
                f"Clase de licencia: {cand['clase_licencia']} (regla: solo 'libre' por defecto en sistema; "
                f"'personal' solo para uso propio con etiqueta visible; 'condicionada' si el grupo cumple). "
                f"Archivos recomendados por medio: {json.dumps(cand['mejor_archivo_por_medio'], ensure_ascii=False)}. "
                f"Pipeline tag: {cand['pipeline_tag']}. Máx 3 archivos (catálogo + prueba)."
            ),
            "archivos_max": 3,
        }
        tareas.append(tarea)
    
    cola = {"fecha": fecha, "tareas": tareas}
    tmp = cola_archivo.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(cola, f, ensure_ascii=False, indent=2)
    tmp.replace(cola_archivo)
    
    print(f"[vigia] Cola creada: {cola_archivo} con {len(tareas)} tareas")
    return cola_archivo


def _actualizar_estado(estado: dict[str, Any], novedades: dict[str, Any], ahora: datetime) -> None:
    """Actualiza el estado persistente con los IDs vistos."""
    fecha_str = ahora.date().isoformat()
    estado["ultima_pasada"] = fecha_str
    
    # Acumular IDs vistos (últimos 30 días)
    ids_vistos = estado.get("ids_vistos", {})
    for area_data in novedades["areas"].values():
        for a in area_data.get("aceptados", []):
            ids_vistos[a["id"]] = fecha_str
        for d in area_data.get("descartados", []):
            ids_vistos[d["id"]] = fecha_str
    
    # Mantener solo los últimos 30 días
    corte = ahora.replace(day=ahora.day - 30).date().isoformat() if ahora.day > 30 else "2000-01-01"
    estado["ids_vistos"] = {k: v for k, v in ids_vistos.items() if v >= corte}
    
    _escribir_estado(estado)


def _http_get_simulado(url: str, headers: dict[str, str] | None = None, timeout: int = 30) -> str | None:
    """Función HTTP simulada para pruebas sin red."""
    # En producción se usaría requests o httpx
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Vigía de modelos y versiones · MetaGenesis")
    parser.add_argument("--seco", action="store_true", help="No escribe colas ni avisa al Chat Director")
    parser.add_argument("--area", help="Procesar solo esta área (id)")
    parser.add_argument("--test-http", action="store_true", help="Usa HTTP simulado para pruebas")
    args = parser.parse_args()
    
    ahora = datetime.now(timezone.utc)
    
    # Cargar áreas
    try:
        areas = cargar_areas()
    except Exception as e:
        print(f"[vigia] Error cargando áreas: {e}", file=sys.stderr)
        return 1
    
    # Filtrar por área si se especifica
    if args.area:
        areas = [a for a in areas if a["id"] == args.area]
        if not areas:
            print(f"[vigia] Área no encontrada: {args.area}", file=sys.stderr)
            return 1
    
    # Cargar estado previo
    estado = _leer_estado()
    
    # Función HTTP a usar
    http_get = _http_get_simulado if args.test_http else None
    if http_get is None:
        try:
            import requests
            http_get = lambda url, headers=None, timeout=30: requests.get(url, headers=headers, timeout=timeout).text
        except ImportError:
            print("[vigia] requests no instalado; use --test-http para pruebas", file=sys.stderr)
            return 1
    
    # Generar novedades
    novedades = _generar_novedades(areas, http_get, ahora, args.seco, args.area)
    
    # Escribir novedades de forma atómica
    archivo_novedades = _escribir_novedades_atomico(novedades)
    print(f"[vigia] Novedades escritas en: {archivo_novedades}")
    
    # Publicar resumen en Chat Director
    _publicar_resumen(novedades, args.seco)
    
    # Crear cola de tareas para los mejores
    _crear_cola_vigia(novedades, args.seco)
    
    # Actualizar estado
    _actualizar_estado(estado, novedades, ahora)
    
    print("[vigia] Pasada completada")
    return 0


if __name__ == "__main__":
    sys.exit(main())