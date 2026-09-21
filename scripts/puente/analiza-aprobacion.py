#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Analista de aprobación de tareas en la flota GRATUITA (p320Fb).

Ejecuta el análisis sobre el diff de una tarea usando exclusivamente
modelos gratuitos. Devuelve UN objeto JSON por stdout con el veredicto.
"""

import glob
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, "..", ".."))
OLAS = os.path.join(RAIZ, "starseed_memory_root", "olas")

if AQUI not in sys.path:
    sys.path.insert(0, AQUI)

from analisis_aprobacion import construir_prompt, leer_veredicto  # noqa: E402


def output_json(veredicto_dict):
    """Imprime por stdout el objeto JSON y sale con 0."""
    print(json.dumps(veredicto_dict, ensure_ascii=False))
    sys.exit(0)


def sin_modelo_gratis():
    """Salida fija cuando no hay modelos gratuitos disponibles."""
    output_json(
        {
            "veredicto": "dudoso",
            "confianza": "baja",
            "razones": ["sin modelo gratuito disponible"],
            "riesgos": [],
            "que_revisar": [],
        }
    )


def sanitizar_id(tid):
    """Valida y sanitiza el ID de la tarea."""
    if not tid or not isinstance(tid, str):
        return None
    tid = tid.strip()
    if not re.match(r"^[a-zA-Z0-9_\-\.]+$", tid):
        return None
    return tid


def leer_tarea(tid):
    """Lee la información de la tarea de progreso.json y de las colas."""
    prog = {}
    prog_path = os.path.join(OLAS, "progreso.json")
    if os.path.exists(prog_path):
        try:
            with open(prog_path, "r", encoding="utf-8") as f:
                prog = json.load(f)
        except Exception:
            prog = {}

    ent = prog.get(tid) or {}

    # Buscar información extendida en las colas
    info_cola = {}
    for f_cola in sorted(glob.glob(os.path.join(OLAS, "cola-*.json"))):
        if "cola-auto-" in os.path.basename(f_cola):
            continue
        try:
            with open(f_cola, "r", encoding="utf-8") as f:
                d = json.load(f)
            tareas = d if isinstance(d, list) else d.get("tareas", [])
            for t in tareas:
                if isinstance(t, dict) and str(t.get("id")) == tid:
                    info_cola = t
                    break
        except Exception:
            continue
        if info_cola:
            break

    if not ent and not info_cola:
        return None

    rama = ent.get("rama") or info_cola.get("rama") or f"ola/{tid}"
    sha = ent.get("sha") or info_cola.get("sha") or ""
    estado = ent.get("estado") or info_cola.get("estado") or "pendiente"
    modelo = ent.get("modelo") or info_cola.get("modelo") or ""
    contexto = (
        info_cola.get("prompt")
        or info_cola.get("instrucciones")
        or ent.get("prompt")
        or ent.get("nota")
        or ""
    )

    ficha = {
        "id": tid,
        "titulo": info_cola.get("titulo") or ent.get("titulo") or f"Tarea {tid}",
        "rama": rama,
        "sha": sha,
        "estado": estado,
        "modelo": modelo,
        "dificultad": info_cola.get("dificultad") or "media",
        "revisor": info_cola.get("revisor") or "pendiente",
        "faltan": info_cola.get("faltan") or [],
        "motivo_vb": info_cola.get("motivo_vb") or "",
    }
    return ficha, contexto


def obtener_diff(sha, rama):
    """Obtiene el diff usando sha o rama (nunca sintaxis invalida rama^sha)."""
    ref = str(sha).strip() if sha else str(rama).strip()
    if not ref:
        return None, "sin referencia git (sin sha ni rama)"

    try:
        r_stat = subprocess.run(
            ["git", "show", "--stat", ref],
            cwd=RAIZ,
            capture_output=True,
            text=True,
            timeout=30,
        )
        r_diff = subprocess.run(
            ["git", "show", ref],
            cwd=RAIZ,
            capture_output=True,
            text=True,
            timeout=30,
        )
        if r_diff.returncode != 0:
            err = r_diff.stderr.strip() or "fallo git show"
            return None, f"git show fallo para {ref}: {err}"

        stat_str = r_stat.stdout if r_stat.returncode == 0 else ""
        diff_completo = (stat_str + "\n\n" + r_diff.stdout).strip()
        return diff_completo, None
    except subprocess.TimeoutExpired:
        return None, f"timeout de git show para {ref}"
    except Exception as e:
        return None, f"error al ejecutar git show para {ref}: {str(e)}"


def elegir_modelo_gratis():
    """Elige un modelo gratuito disponible. NUNCA devuelve modelos anthropic o de pago."""
    candidatos_raw = []
    try:
        ruta_enjambre = os.path.join(
            RAIZ, "scripts", "enjambre", "starseed-enjambre.py"
        )
        if os.path.exists(ruta_enjambre):
            spec = importlib.util.spec_from_file_location("enjambre", ruta_enjambre)
            enjambre = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(enjambre)
            if hasattr(enjambre, "candidatos_revision"):
                cands, _ = enjambre.candidatos_revision()
                for item in cands:
                    if isinstance(item, tuple) and len(item) >= 2:
                        candidatos_raw.append(item)
            elif hasattr(enjambre, "REVISORES"):
                for item in enjambre.REVISORES:
                    if isinstance(item, tuple) and len(item) >= 2:
                        candidatos_raw.append(item)
    except Exception:
        pass

    for prov, mod in candidatos_raw:
        prov_str = str(prov).strip()
        mod_str = str(mod).strip()
        if prov_str and not mod_str.startswith(f"{prov_str}/"):
            comb = f"{prov_str}/{mod_str}"
        else:
            comb = mod_str
        comb_lower = comb.lower()

        # REGLA INNEGOCIABLE: NUNCA anthropic
        if "anthropic" in comb_lower:
            continue

        return comb

    return None


def main():
    if len(sys.argv) < 2:
        output_json(
            {
                "veredicto": "dudoso",
                "confianza": "baja",
                "razones": ["no se proporcionó ID de tarea"],
                "riesgos": [],
                "que_revisar": [],
            }
        )

    raw_id = sys.argv[1]
    tid = sanitizar_id(raw_id)
    if not tid:
        output_json(
            {
                "veredicto": "dudoso",
                "confianza": "baja",
                "razones": [f"ID de tarea inválido: {raw_id}"],
                "riesgos": [],
                "que_revisar": [],
            }
        )

    res = leer_tarea(tid)
    if not res:
        output_json(
            {
                "veredicto": "dudoso",
                "confianza": "baja",
                "razones": [f"tarea {tid} no encontrada"],
                "riesgos": [],
                "que_revisar": [],
            }
        )

    ficha, contexto = res

    diff, err_git = obtener_diff(ficha.get("sha"), ficha.get("rama"))
    if err_git or not diff:
        output_json(
            {
                "veredicto": "dudoso",
                "confianza": "baja",
                "razones": [err_git or "diff vacío"],
                "riesgos": [],
                "que_revisar": [],
            }
        )

    modelo = elegir_modelo_gratis()
    if not modelo:
        sin_modelo_gratis()

    prompt_analista = construir_prompt(ficha, diff, contexto)

    opencode_bin = (
        shutil.which("opencode")
        or os.path.expanduser("~/.opencode/bin/opencode")
        or "opencode"
    )
    cmd = [opencode_bin, "run", prompt_analista, "--model", modelo, "--dir", "/tmp"]

    try:
        r_open = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
        salida = (r_open.stdout or "") + "\n" + (r_open.stderr or "")
        veredicto = leer_veredicto(salida)
        output_json(veredicto)
    except subprocess.TimeoutExpired:
        output_json(
            {
                "veredicto": "dudoso",
                "confianza": "baja",
                "razones": ["timeout al ejecutar opencode run"],
                "riesgos": [],
                "que_revisar": [],
            }
        )
    except Exception as e:
        output_json(
            {
                "veredicto": "dudoso",
                "confianza": "baja",
                "razones": [f"error al ejecutar opencode run: {str(e)}"],
                "riesgos": [],
                "que_revisar": [],
            }
        )


if __name__ == "__main__":
    main()
