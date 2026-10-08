# -*- coding: utf-8 -*-
"""Corpus de destilación: el enjambre ya es el maestro de Astraura.

Cada tarea integrada es una demostración supervisada: encargo, respuesta de un
modelo fuerte y un diff que pasó las puertas. Este módulo recoge esos ejemplos
en starseed_memory_root/destilacion/corpus.jsonl SIN secretos: cualquier línea
sospechosa se sustituye por una marca, nunca se escribe el valor.
"""

import json
import os
import re
import subprocess

# Regla 1: nombre de variable sensible seguido de = o : (JSON, YAML, env, código)
PATRON_CLAVE_SENSIBLE = re.compile(
    r'(?i)["\']?[\w\.-]*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH)[\w\.-]*["\']?\s*[:=]'
)

# Regla 2: prefijos inequívocos de tokens conocidos (OpenAI, GitHub, Slack, Google…)
PATRON_TOKEN_EXPLICITO = re.compile(
    r"(?:sk-[a-zA-Z0-9_\-]+"
    r"|ghp_[a-zA-Z0-9_\-]+"
    r"|gho_[a-zA-Z0-9_\-]+"
    r"|github_pat_[a-zA-Z0-9_\-]+"
    r"|xox[bap]-[a-zA-Z0-9_\-]+"
    r"|AIza[0-9A-Za-z\-_]+"
    r"|eyJ[a-zA-Z0-9_\-\.]+"  # JWT
    r"|-----BEGIN [A-Z ]*PRIVATE KEY-----"
    r"|Bearer\s+\S+)"
)

# Marca que sustituye a la línea retirada: deja constancia sin filtrar el valor
MARCA_SECRETO = "# [SECRETO ELIMINADO DEL CORPUS]"


def es_linea_secreta(linea: str) -> bool:
    if not linea:
        return False
    return bool(
        PATRON_CLAVE_SENSIBLE.search(linea)
        or PATRON_TOKEN_EXPLICITO.search(linea)
    )


def limpiar_secretos(texto: str) -> str:
    """Sustituye cada línea con secreto por la marca; ante la duda, fuera."""
    if not texto:
        return ""
    return "\n".join(
        MARCA_SECRETO if es_linea_secreta(l) else l for l in texto.splitlines()
    )


def _es_revision_bloqueante(entrada_progreso: dict) -> bool:
    """Bloqueante solo por campo estructurado; las notas en prosa no deciden.

    Así «no es bloqueante» no descarta un ejemplo válido, y una objeción
    redactada con otras palabras tampoco cuela: manda el campo, no el texto.
    """
    revision = entrada_progreso.get("revision")
    if isinstance(revision, dict):
        if revision.get("bloqueante") is True:
            return True
        verdict = str(revision.get("veredicto", "")).lower()
        return verdict == "bloqueante"
    if isinstance(revision, str):
        return revision.lower() == "bloqueante"
    return str(entrada_progreso.get("revisor", "")).lower() == "bloqueante"


def ejemplo_de_tarea(tarea: dict, entrada_progreso: dict, diff: str) -> dict | None:
    """Convierte una tarea integrada en ejemplo de destilación, o None.

    Solo entra calidad demostrada: estado `commit` y revisión no bloqueante.
    Una tarea rechazada no es un mal ejemplo, es ruido: fuera.
    """
    if not isinstance(tarea, dict) or not isinstance(entrada_progreso, dict):
        return None

    estado = str(entrada_progreso.get("estado", "")).lower()
    sha = entrada_progreso.get("sha") or entrada_progreso.get("commit") or ""
    # Si hay estado registrado debe ser `commit`; sin estado, el sha lo avala
    if estado and estado != "commit":
        return None
    if not sha:
        return None
    # Validación del SHA: cierra la inyección de opciones a git show
    if not re.fullmatch(r"[0-9a-fA-F]{7,40}", str(sha)):
        return None
    if _es_revision_bloqueante(entrada_progreso):
        return None

    encargo = tarea.get("encargo") or tarea.get("titulo") or tarea.get("descripcion") or ""
    if es_linea_secreta(encargo):
        return None  # un encargo con clave contamina el par entero

    respuesta = limpiar_secretos(diff or "")
    if not respuesta.strip():
        return None

    return {
        "encargo": encargo,
        "respuesta": respuesta,
        "modelo": tarea.get("modelo") or entrada_progreso.get("modelo") or "",
        "area": tarea.get("area") or entrada_progreso.get("area") or "",
        "calidad": "cuatro-puertas",
        "sha": str(sha),
    }


def _normalizar_registros(datos) -> list[dict]:
    """Acepta lista de entradas o dict con colección y devuelve lista plana."""
    if isinstance(datos, list):
        return [d for d in datos if isinstance(d, dict)]
    if isinstance(datos, dict):
        for clave in ("tareas", "registros", "entradas"):
            if isinstance(datos.get(clave), list):
                return [d for d in datos[clave] if isinstance(d, dict)]
        return [datos]
    return []


def recoger(progreso, tareas, leer_diff) -> list[dict]:
    """Recorre el progreso y devuelve ejemplos, sin duplicados por sha.

    Pura salvo por `leer_diff(sha)`, que se inyecta: así las pruebas no
    tocan git y el orquestador decide cómo leer el diff.
    """
    entradas = _normalizar_registros(progreso)
    catalogo = {t.get("id"): t for t in _normalizar_registros(tareas) if t.get("id")}

    ejemplos: list[dict] = []
    shas_vistos: set[str] = set()
    for entrada in entradas:
        tarea = catalogo.get(entrada.get("id"), entrada)
        sha = str(entrada.get("sha") or entrada.get("commit") or "")
        if sha and sha in shas_vistos:
            continue  # un sha = un ejemplo; el primero gana
        diff = leer_diff(sha) if sha else ""
        ejemplo = ejemplo_de_tarea(tarea, entrada, diff)
        if ejemplo is None:
            continue
        shas_vistos.add(ejemplo["sha"])
        ejemplos.append(ejemplo)
    return ejemplos


RAIZ_MEMORIA = os.environ.get(
    "STARSEED_MEMORY_ROOT",
    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
        os.path.abspath(__file__)))), "starseed_memory_root"),
)
RUTA_CORPUS = os.path.join(RAIZ_MEMORIA, "destilacion", "corpus.jsonl")


def obtener_diff_limpio(sha: str, cwd: str = ".") -> str:
    """git show --format= : solo el diff, sin mensaje de commit ni metadatos,
    porque el corpus debe contener código y no prosa de integración."""
    if not re.fullmatch(r"[0-9a-fA-F]{7,40}", str(sha or "")):
        return ""
    try:
        r = subprocess.run(
            ["git", "show", "--format=", sha],
            cwd=cwd, capture_output=True, text=True, check=True,
        )
        return r.stdout.strip()
    except Exception:
        return ""


def _leer_json(ruta: str):
    if not ruta or not os.path.exists(ruta):
        return []
    try:
        with open(ruta, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def _shas_ya_en_corpus(ruta: str) -> set[str]:
    shas: set[str] = set()
    if not os.path.exists(ruta):
        return shas
    with open(ruta, "r", encoding="utf-8") as f:
        for linea in f:
            try:
                sha = json.loads(linea).get("sha")
                if sha:
                    shas.add(sha)
            except Exception:
                continue
    return shas


def main() -> None:
    """Añade al corpus solo los ejemplos nuevos y resume área y maestro."""
    destino = os.path.join(RAIZ_MEMORIA, "olas", "destilacion")
    progreso = _leer_json(os.path.join(destino, "progreso.json"))
    if not progreso:
        progreso = _leer_json(os.path.join(RAIZ_MEMORIA, "olas", "progreso.json"))
    tareas = _leer_json(os.path.join(destino, "tareas.json"))

    nuevos = recoger(progreso, tareas, obtener_diff_limpio)
    existentes = _shas_ya_en_corpus(RUTA_CORPUS)
    anadir = [e for e in nuevos if e["sha"] not in existentes]

    os.makedirs(os.path.dirname(RUTA_CORPUS), exist_ok=True)
    with open(RUTA_CORPUS, "a", encoding="utf-8") as f:
        for e in anadir:
            f.write(json.dumps(e, ensure_ascii=False) + "\n")

    # Resumen por área y por modelo maestro sobre TODO el corpus
    por_area: dict[str, int] = {}
    por_modelo: dict[str, int] = {}
    total = 0
    with open(RUTA_CORPUS, "r", encoding="utf-8") as f:
        for linea in f:
            try:
                e = json.loads(linea)
            except Exception:
                continue
            total += 1
            por_area[e.get("area") or "sin-area"] = por_area.get(e.get("area") or "sin-area", 0) + 1
            mod = e.get("modelo") or "sin-modelo"
            por_modelo[mod] = por_modelo.get(mod, 0) + 1

    print(f"Corpus: {total} ejemplos ({len(anadir)} nuevos) en {RUTA_CORPUS}")
    for area, n in sorted(por_area.items()):
        print(f"  área {area}: {n}")
    for modelo, n in sorted(por_modelo.items()):
        print(f"  maestro {modelo}: {n}")


if __name__ == "__main__":
    main()
