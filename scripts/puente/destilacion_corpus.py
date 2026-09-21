#!/usr/bin/env python3
"""
scripts/puente/destilacion_corpus.py
Destilación on-policy: recolecta demostraciones del enjambre para entrenar BitNet b1.58.
"""

import json
import os
import re
import subprocess
from typing import Callable, Dict, List, Any, Optional

PATRON_SENSIBLES = re.compile(
    r'[A-Za-z0-9_]*(KEY|TOKEN|SECRET|PASSWORD)[A-Za-z0-9_]*\s*=',
    re.IGNORECASE
)

def limpiar_sensibles(texto: str) -> str:
    """Elimina líneas que contengan asignaciones de información sensible."""
    if not texto:
        return ""
    lineas_limpias = []
    for linea in texto.splitlines():
        if PATRON_SENSIBLES.search(linea):
            lineas_limpias.append("[FILTRADO: linea con clave o secreto omitida]")
        else:
            lineas_limpias.append(linea)
    return "\n".join(lineas_limpias)

def ejemplo_de_tarea(
    tarea: Dict[str, Any],
    entrada_progreso: Dict[str, Any],
    diff: str
) -> Optional[Dict[str, Any]]:
    """Devuelve un dict con el ejemplo o None si la tarea no tiene calidad suficiente."""
    if not isinstance(entrada_progreso, dict):
        return None
    if not isinstance(tarea, dict):
        tarea = {}

    # Solo entran las tareas con estado 'commit'
    estado = entrada_progreso.get("estado")
    if estado != "commit":
        return None

    # Comprobar si la revisión es bloqueante
    revision = entrada_progreso.get("revision")
    if isinstance(revision, dict):
        if revision.get("bloqueante") is True or revision.get("tipo") == "bloqueante":
            return None
    elif isinstance(revision, str):
        if "bloqueante" in revision.lower():
            return None
    if entrada_progreso.get("bloqueante") is True:
        return None

    sha = entrada_progreso.get("sha") or entrada_progreso.get("commit") or tarea.get("sha")
    if not sha or not isinstance(sha, str) or not sha.strip():
        return None

    encargo = tarea.get("encargo") or tarea.get("prompt") or tarea.get("titulo") or ""
    if not encargo or not str(encargo).strip():
        return None

    respuesta = limpiar_sensibles(str(diff) if diff else "")
    modelo = entrada_progreso.get("modelo") or tarea.get("modelo") or "desconocido"
    area = tarea.get("area") or entrada_progreso.get("area") or "mando"
    calidad = entrada_progreso.get("calidad") or "demostrada"

    return {
        "encargo": str(encargo).strip(),
        "respuesta": respuesta,
        "modelo": str(modelo).strip(),
        "area": str(area).strip(),
        "calidad": str(calidad).strip(),
        "sha": str(sha).strip()
    }

def recoger(
    progreso: Any,
    tareas: Any,
    leer_diff: Callable[[str], str]
) -> List[Dict[str, Any]]:
    """Recorre el progreso y devuelve la lista de ejemplos sin duplicados por sha."""
    ejemplos: List[Dict[str, Any]] = []
    shas_vistos = set()

    entradas_progreso = []
    if isinstance(progreso, dict):
        for id_t, entrada in progreso.items():
            if isinstance(entrada, dict):
                copia = dict(entrada)
                if "id" not in copia:
                    copia["id"] = id_t
                entradas_progreso.append(copia)
    elif isinstance(progreso, list):
        entradas_progreso = [e for e in progreso if isinstance(e, dict)]

    mapa_tareas = {}
    if isinstance(tareas, dict):
        mapa_tareas = tareas
    elif isinstance(tareas, list):
        for t in tareas:
            if isinstance(t, dict) and "id" in t:
                mapa_tareas[t["id"]] = t

    for entrada in entradas_progreso:
        id_tarea = entrada.get("id") or entrada.get("tarea_id")
        tarea = mapa_tareas.get(id_tarea, {}) if id_tarea else {}

        sha = entrada.get("sha") or entrada.get("commit") or tarea.get("sha")
        if not sha or sha in shas_vistos:
            continue

        diff_texto = ""
        try:
            diff_texto = leer_diff(sha)
        except Exception:
            diff_texto = ""

        ejemplo = ejemplo_de_tarea(tarea, entrada, diff_texto)
        if ejemplo is not None:
            sha_ejemplo = ejemplo["sha"]
            if sha_ejemplo not in shas_vistos:
                shas_vistos.add(sha_ejemplo)
                ejemplos.append(ejemplo)

    return ejemplos

def cargar_datos_reales(
    raiz_memoria: str
) -> tuple[Dict[str, Any], Dict[str, Any]]:
    """Carga tareas y progreso desde la memoria del proyecto."""
    progreso: Dict[str, Any] = {}
    tareas: Dict[str, Any] = {}

    progreso_path = os.path.join(raiz_memoria, "olas", "progreso.json")
    if os.path.exists(progreso_path):
        try:
            with open(progreso_path, "r", encoding="utf-8") as f:
                progreso = json.load(f)
        except Exception:
            pass

    olas_dir = os.path.join(raiz_memoria, "olas")
    if os.path.exists(olas_dir) and os.path.isdir(olas_dir):
        for nombre in os.listdir(olas_dir):
            if nombre.startswith("control-") or nombre.startswith("cola-") or nombre.endswith(".json"):
                ruta = os.path.join(olas_dir, nombre)
                try:
                    with open(ruta, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        if isinstance(data, dict):
                            t_lista = data.get("tareas") or data.get("cola")
                            if isinstance(t_lista, list):
                                for t in t_lista:
                                    if isinstance(t, dict) and "id" in t:
                                        tareas[t["id"]] = t
                except Exception:
                    pass

    return progreso, tareas

def leer_diff_git(sha: str) -> str:
    """Lee el diff de un commit dado utilizando git show."""
    if not sha or not isinstance(sha, str):
        return ""
    try:
        resultado = subprocess.run(
            ["git", "show", "--no-color", sha],
            capture_output=True,
            text=True,
            timeout=10,
            check=False
        )
        if resultado.returncode == 0:
            return resultado.stdout
    except Exception:
        pass
    return ""

def main() -> None:
    """Genera el corpus de destilación y escribe el resumen en consola."""
    raiz_proyecto = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    destilacion_dir = os.path.join(raiz_proyecto, "starseed_memory_root", "destilacion")
    os.makedirs(destilacion_dir, exist_ok=True)

    corpus_path = os.path.join(destilacion_dir, "corpus.jsonl")

    shas_existentes = set()
    ejemplos_existentes = []
    if os.path.exists(corpus_path):
        try:
            with open(corpus_path, "r", encoding="utf-8") as f:
                for linea in f:
                    linea_str = linea.strip()
                    if linea_str:
                        data = json.loads(linea_str)
                        if isinstance(data, dict):
                            ejemplos_existentes.append(data)
                            if "sha" in data:
                                shas_existentes.add(data["sha"])
        except Exception:
            pass

    progreso, tareas = cargar_datos_reales(os.path.join(raiz_proyecto, "starseed_memory_root"))
    ejemplos_nuevos = recoger(progreso, tareas, leer_diff_git)

    agregados = 0
    if ejemplos_nuevos:
        with open(corpus_path, "a", encoding="utf-8") as f:
            for ej in ejemplos_nuevos:
                if ej["sha"] not in shas_existentes:
                    f.write(json.dumps(ej, ensure_ascii=False) + "\n")
                    shas_existentes.add(ej["sha"])
                    ejemplos_existentes.append(ej)
                    agregados += 1

    conteo_areas: Dict[str, int] = {}
    conteo_modelos: Dict[str, int] = {}

    for ej in ejemplos_existentes:
        a = ej.get("area", "mando")
        m = ej.get("modelo", "desconocido")
        conteo_areas[a] = conteo_areas.get(a, 0) + 1
        conteo_modelos[m] = conteo_modelos.get(m, 0) + 1

    print("=== CORPUS DE DESTILACION PARA ASTRAURA ===")
    print(f"Total de ejemplos en corpus: {len(ejemplos_existentes)} (nuevos agregados: {agregados})")
    print("\nEjemplos por Área:")
    for area, cnt in sorted(conteo_areas.items()):
        print(f"  - {area}: {cnt}")
    print("\nEjemplos por Modelo Maestro:")
    for mod, cnt in sorted(conteo_modelos.items()):
        print(f"  - {mod}: {cnt}")

if __name__ == "__main__":
    main()
