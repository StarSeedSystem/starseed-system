# -*- coding: utf-8 -*-
"""Destilación de respuestas del enjambre para el entrenamiento de Astraura.

Extrae diffs limpios de git y filtra cualquier secreto o revisión bloqueante
para garantizar la seguridad y calidad del corpus de entrenamiento.
"""

import json
import os
import re
import subprocess

# Regla 1: Nombres de claves sensibles seguidos de : o =
PATRON_CLAVE_SENSIBLE = re.compile(
    r'(?i)["\']?[\w\.-]*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH)[\w\.-]*["\']?\s*[:=]'
)

# Regla 2: Prefijos explícitos de tokens conocidos
PATRON_TOKEN_EXPLICITO = re.compile(
    r"(?:sk-[a-zA-Z0-9_\-]*"
    r"|ghp_[a-zA-Z0-9_\-]*"
    r"|gho_[a-zA-Z0-9_\-]*"
    r"|github_pat_[a-zA-Z0-9_\-]*"
    r"|xoxb-[a-zA-Z0-9_\-]*"
    r"|AIza[0-9A-Za-z\-_]*"
    r"|Bearer\s+\S+)"
)

# Regla 3: Hashes o base64 de 32+ caracteres asociados a credenciales
PATRON_HASH_LARGO = re.compile(
    r"(?i)(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH|Bearer).*?[a-zA-Z0-9_\-/+=]{32,}"
)


def es_linea_secreta(linea: str) -> bool:
    """Comprueba si una línea contiene alguna forma de secreto o clave.

    Aplica tres capas de filtrado:
    1. Presencia de nombres clave de credenciales (KEY, TOKEN, SECRET, etc.) con = o :
    2. Prefijos explícitos de tokens conocidos (sk-, ghp_, gho_, github_pat_, xoxb-, AIza, Bearer)
    3. Cadenas de 32+ caracteres asociadas a términos sensibles.
    """
    if not linea:
        return False
    if PATRON_CLAVE_SENSIBLE.search(linea):
        return True
    if PATRON_TOKEN_EXPLICITO.search(linea):
        return True
    if PATRON_HASH_LARGO.search(linea):
        return True
    return False


def filtrar_lineas_secretas(texto: str) -> str:
    """Elimina del texto cualquier línea que contenga secretos.

    Ante la duda, descarta la línea completa para evitar fuga de secretos al corpus.
    """
    if not texto:
        return ""
    lineas = texto.splitlines()
    lineas_limpias = [l for l in lineas if not es_linea_secreta(l)]
    return "\n".join(lineas_limpias)


def contiene_secreto(texto: str) -> bool:
    """Indica si el texto contiene alguna línea con secreto."""
    if not texto:
        return False
    return any(es_linea_secreta(l) for l in texto.splitlines())


def obtener_diff_limpio(sha: str, cwd: str = ".") -> str:
    """Obtiene el diff de código sin cabecera de commit usando git show --format=.

    El parámetro --format= suprime el mensaje de commit y metadatos de git show,
    dejando únicamente los cambios de código puros.
    """
    if not sha or not isinstance(sha, str):
        return ""
    try:
        resultado = subprocess.run(
            ["git", "show", "--format=", sha],
            cwd=cwd,
            capture_output=True,
            text=True,
            check=True,
        )
        return resultado.stdout.strip()
    except Exception:
        return ""


def procesar_entrada_progreso(entrada: dict, cwd: str = ".") -> dict | None:
    """Procesa un registro de progreso.json excluyendo bloqueantes y secretos.

    Usa el campo estricto 'revisor' (debe no ser 'bloqueante') y filtra
    el diff obtenido excluyendo cualquier línea con potenciales secretos.
    """
    if not isinstance(entrada, dict):
        return None

    # Exclusión de revisiones bloqueantes usando el campo exacto del registro
    if entrada.get("revisor") == "bloqueante":
        return None

    sha = entrada.get("commit") or entrada.get("sha")
    if not sha:
        return None

    diff_raw = obtener_diff_limpio(sha, cwd=cwd)
    if not diff_raw:
        return None

    # Si la descripción de la tarea contiene secretos, descartamos la entrada
    descripcion = entrada.get("tarea") or entrada.get("descripcion") or ""
    if contiene_secreto(descripcion):
        return None

    # Filtramos líneas con secretos dentro del diff
    diff_limpio = filtrar_lineas_secretas(diff_raw)
    if not diff_limpio:
        return None

    return {
        "id": entrada.get("id", ""),
        "tarea": descripcion,
        "sha": sha,
        "diff": diff_limpio,
    }


def generar_corpus(progreso_path: str, output_path: str, cwd: str = ".") -> int:
    """Genera el corpus de destilación en formato JSONL a partir de progreso.json.

    Lee el archivo de progreso, filtra entradas bloqueantes o inseguras,
    y escribe los ejemplos válidos en un archivo JSONL.

    Retorna el número de ejemplos exportados.
    """
    if not os.path.exists(progreso_path):
        return 0

    try:
        with open(progreso_path, "r", encoding="utf-8") as f:
            datos = json.load(f)
    except Exception:
        return 0

    if isinstance(datos, dict):
        entradas = datos.get("tareas", []) or datos.get("registros", []) or [datos]
    elif isinstance(datos, list):
        entradas = datos
    else:
        return 0

    ejemplos_validos = []
    for entrada in entradas:
        ejemplo = procesar_entrada_progreso(entrada, cwd=cwd)
        if ejemplo:
            ejemplos_validos.append(ejemplo)

    if ejemplos_validos and output_path:
        dir_salida = os.path.dirname(output_path)
        if dir_salida:
            os.makedirs(dir_salida, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            for ex in ejemplos_validos:
                f.write(json.dumps(ex, ensure_ascii=False) + "\n")

    return len(ejemplos_validos)
