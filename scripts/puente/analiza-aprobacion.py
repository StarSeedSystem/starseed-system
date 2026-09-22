#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Analista de aprobación de tareas en la flota GRATUITA (p320Fb).

Ejecuta el análisis sobre el diff de una tarea usando exclusivamente
modelos gratuitos. Devuelve UN objeto JSON por stdout con el veredicto.
"""

import ast
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, "..", ".."))
OLAS = os.path.join(RAIZ, "starseed_memory_root", "olas")
RUTA_ENJAMBRE = os.path.join(RAIZ, "scripts", "enjambre", "starseed-enjambre.py")
SALUD_PROVEEDORES = os.path.expanduser("~/.starseed/salud-proveedores.json")

if AQUI not in sys.path:
    sys.path.insert(0, AQUI)

from analisis_aprobacion import construir_prompt, leer_veredicto  # noqa: E402


def output_json(veredicto_dict):
    """Imprime por stdout el objeto JSON y sale con 0."""
    print(json.dumps(veredicto_dict, ensure_ascii=False, separators=(",", ":")))
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
    """Obtiene el cambio sin permitir que una referencia se interprete como opción."""
    sha_limpio = str(sha or "").strip()
    rama_limpia = str(rama or "").strip()
    if sha_limpio:
        if not re.fullmatch(r"[0-9a-fA-F]{7,40}", sha_limpio):
            return None, "sha git inválido"
        ref = sha_limpio
    elif rama_limpia:
        rama_valida = re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._/-]*", rama_limpia)
        partes_invalidas = (
            ".." in rama_limpia
            or "@{" in rama_limpia
            or "//" in rama_limpia
            or rama_limpia.endswith(("/", ".", ".lock"))
        )
        if not rama_valida or partes_invalidas:
            return None, "rama git inválida"
        ref = rama_limpia
    else:
        return None, "sin referencia git (sin sha ni rama)"

    try:
        r_stat = subprocess.run(
            ["git", "show", "--stat", ref],
            cwd=RAIZ,
            capture_output=True,
            text=True,
            timeout=30,
        )
        if r_stat.returncode != 0:
            return None, "git show --stat falló"
        r_diff = subprocess.run(
            ["git", "show", ref],
            cwd=RAIZ,
            capture_output=True,
            text=True,
            timeout=30,
        )
        if r_diff.returncode != 0:
            return None, "git show falló"

        diff_completo = ((r_stat.stdout or "") + "\n\n" + (r_diff.stdout or "")).strip()
        return diff_completo, None
    except subprocess.TimeoutExpired:
        return None, "timeout de git show"
    except OSError:
        return None, "no se pudo ejecutar git show"


def candidatos_del_enjambre():
    """Reutiliza REVISORES sin ejecutar el orquestador ni sus efectos laterales."""
    try:
        with open(RUTA_ENJAMBRE, "r", encoding="utf-8") as archivo:
            arbol = ast.parse(archivo.read(), filename=RUTA_ENJAMBRE)
    except (OSError, SyntaxError):
        return []
    for nodo in arbol.body:
        if not isinstance(nodo, ast.Assign):
            continue
        if not any(isinstance(t, ast.Name) and t.id == "REVISORES" for t in nodo.targets):
            continue
        try:
            valor = ast.literal_eval(nodo.value)
        except (ValueError, TypeError):
            return []
        return [
            (str(item[0]), str(item[1]))
            for item in valor
            if isinstance(item, (tuple, list)) and len(item) >= 2
        ]
    return []


def leer_salud_proveedores():
    """Lee solo metadatos de salud; nunca expone valores de claves."""
    try:
        with open(SALUD_PROVEEDORES, "r", encoding="utf-8") as archivo:
            salud = json.load(archivo)
        return salud if isinstance(salud, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _fecha_futura(valor, ahora=None):
    """Reconoce las fechas locales que escribe el orquestador."""
    if not isinstance(valor, str) or not valor:
        return False
    try:
        instante = time.mktime(time.strptime(valor, "%Y-%m-%d %H:%M:%S"))
    except ValueError:
        return False
    return instante > (time.time() if ahora is None else ahora)


def _proveedor_disponible(proveedor, salud, ahora=None):
    """Aplica las mismas exclusiones de caída, cuota y enfriamiento del enjambre."""
    entrada = salud.get(proveedor) or {}
    if not isinstance(entrada, dict) or entrada.get("estado") == "caido":
        return False
    if _fecha_futura(entrada.get("sin_cupo_hasta"), ahora):
        return False
    ultimo_429 = entrada.get("ultimo_429")
    if isinstance(ultimo_429, str) and ultimo_429:
        try:
            instante = time.mktime(time.strptime(ultimo_429, "%Y-%m-%d %H:%M:%S"))
            if (time.time() if ahora is None else ahora) - instante < 600:
                return False
        except ValueError:
            pass
    return True


def _es_modelo_gratis(proveedor, modelo):
    """Acepta únicamente proveedores cuyo catálogo de revisores es gratuito."""
    prov = proveedor.strip().lower()
    mod = modelo.strip().lower()
    if not prov or not mod or "anthropic" in prov or "anthropic" in mod:
        return False
    if prov in {"openrouter", "xkiro"}:
        return mod.endswith(":free")
    if prov in {"aihubmix", "tokenrouter"}:
        return "free" in mod
    return prov in {"nim", "llm7", "gemini", "freetheai"}


def elegir_modelo_gratis():
    """Elige el primer revisor gratis que no esté apartado por salud."""
    salud = leer_salud_proveedores()
    for proveedor, modelo in candidatos_del_enjambre():
        if not _es_modelo_gratis(proveedor, modelo):
            continue
        if not _proveedor_disponible(proveedor, salud):
            continue
        return f"{proveedor.strip()}/{modelo.strip()}"
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

    opencode_bin = shutil.which("opencode") or "opencode"
    try:
        with tempfile.TemporaryDirectory(prefix=".analista-", dir=RAIZ) as solo_lectura:
            os.chmod(solo_lectura, 0o555)
            cmd = [
                opencode_bin,
                "run",
                prompt_analista,
                "--model",
                modelo,
                "--dir",
                solo_lectura,
            ]
            try:
                r_open = subprocess.run(
                    cmd,
                    cwd=RAIZ,
                    capture_output=True,
                    text=True,
                    timeout=180,
                )
            finally:
                os.chmod(solo_lectura, 0o700)
        if r_open.returncode != 0:
            output_json(
                {
                    "veredicto": "dudoso",
                    "confianza": "baja",
                    "razones": ["opencode run falló"],
                    "riesgos": [],
                    "que_revisar": [],
                }
            )
        # stderr puede contener avisos con llaves; solo stdout pertenece al modelo.
        veredicto = leer_veredicto(r_open.stdout or "")
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
    except OSError:
        output_json(
            {
                "veredicto": "dudoso",
                "confianza": "baja",
                "razones": ["no se pudo ejecutar opencode run"],
                "riesgos": [],
                "que_revisar": [],
            }
        )


if __name__ == "__main__":
    main()
