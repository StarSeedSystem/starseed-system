"""
Módulo roles_agente.py
Selección pura de roles expertos de agency-agents para tareas del enjambre.
"""

import os
import re
from typing import Dict, List, Optional

# Palabras vacías o sin significado para el filtrado del título
PALABRAS_VACIAS = {
    "para",
    "como",
    "este",
    "esta",
    "estos",
    "estas",
    "desde",
    "sobre",
    "pero",
    "donde",
    "cuando",
    "entre",
    "hacia",
    "hasta",
    "segun",
    "sin",
    "tras",
    "modo",
    "cada",
    "todo",
    "toda",
    "todos",
    "todas",
    "otro",
    "otra",
    "otros",
    "otras",
    "del",
    "los",
    "las",
    "que",
    "con",
    "por",
    "the",
    "and",
    "for",
    "with",
    "that",
    "this",
    "from",
    "have",
    "your",
    "about",
    "task",
    "tarea",
    "hacer",
    "crear",
    "un",
    "una",
    "unos",
    "unas",
}


def _palabras_significativas(texto: str) -> List[str]:
    """Extrae palabras de más de 3 letras que no sean vacías para afinar la puntuación."""
    if not texto:
        return []
    palabras = re.findall(r"[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ0-9]+", texto.lower())
    return [p for p in palabras if len(p) >= 4 and p not in PALABRAS_VACIAS]


def division_de(archivos: List[str]) -> str:
    """Clasifica una lista de rutas de archivos en la división de agencia adecuada."""
    if not archivos:
        return "engineering"

    rutas = [a.replace("\\", "/").lower() for a in archivos]

    # Regla 1: mayoría de archivos de pruebas
    pruebas = 0
    for r in rutas:
        nombre = os.path.basename(r)
        if (
            nombre.startswith("test_")
            or nombre.startswith("spec_")
            or ".test." in nombre
            or ".spec." in nombre
        ):
            pruebas += 1
    if pruebas > len(rutas) / 2:
        return "testing"

    # Regla 2: seguridad si contiene palabras clave de seguridad
    palabras_seguridad = ("auth", "clave", "guardian", "rls")
    for r in rutas:
        if any(p in r for p in palabras_seguridad):
            return "security"

    # Regla 3: diseño si hay componentes o páginas .tsx en src/components o src/app
    for r in rutas:
        if (
            "src/components/" in r
            or "src/app/" in r
            or r.startswith("src/components/")
            or r.startswith("src/app/")
        ) and r.endswith(".tsx"):
            return "design"

    # Regla 4: ingeniería si toca backend, apis o scripts de puente/enjambre
    for r in rutas:
        if (
            "scripts/puente/" in r
            or "scripts/enjambre/" in r
            or "src/app/api/" in r
            or r.startswith("scripts/puente/")
            or r.startswith("scripts/enjambre/")
            or r.startswith("src/app/api/")
        ):
            return "engineering"

    return "engineering"


def elegir_rol(
    titulo: str, archivos: List[str], catalogo: List[Dict[str, str]]
) -> Optional[str]:
    """Elige el id del rol más adecuado del catálogo basándose en puntuación y desempate alfabético."""
    if not catalogo:
        return None

    div_meta = division_de(archivos)
    palabras_titulo = _palabras_significativas(titulo)

    candidatos = []
    for cand in catalogo:
        cid = cand.get("id", "")
        cdiv = cand.get("division", "")
        cname = cand.get("name", "").lower()
        cdesc = cand.get("description", "").lower()

        puntuacion = 0

        # +3 por coincidencia de división
        if cdiv == div_meta:
            puntuacion += 3

        # +2 por palabra en nombre, +1 por palabra en descripción
        for p in palabras_titulo:
            if p in cname:
                puntuacion += 2
            if p in cdesc:
                puntuacion += 1

        candidatos.append((puntuacion, cid))

    # Filtrar solo opciones con puntuación positiva
    candidatos_validos = [c for c in candidatos if c[0] > 0]
    if not candidatos_validos:
        return None

    # Ordenar por mayor puntuación y desempate alfabético menor por id
    candidatos_validos.sort(key=lambda x: (-x[0], x[1]))
    return candidatos_validos[0][1]


def recortar_rol(texto: str, tope: int = 3000) -> str:
    """Recorta el cuerpo del rol a tope de caracteres por párrafos u oraciones enteras."""
    cuerpo = texto.strip()
    if cuerpo.startswith("---"):
        partes = cuerpo.split("---", 2)
        if len(partes) >= 3:
            cuerpo = partes[2].strip()

    if len(cuerpo) <= tope:
        return cuerpo

    parrafos = [p.strip() for p in cuerpo.split("\n\n") if p.strip()]
    acumulado = []
    longitud_actual = 0

    for p in parrafos:
        longitud_nueva = longitud_actual + (2 if acumulado else 0) + len(p)
        if longitud_nueva <= tope:
            acumulado.append(p)
            longitud_actual = longitud_nueva
        else:
            break

    if acumulado:
        return "\n\n".join(acumulado)

    # Si incluso el primer párrafo supera el tope, recortar por oraciones
    oraciones = re.split(r"(?<=\.)\s+", parrafos[0])
    acum_oraciones = []
    len_oraciones = 0

    for o in oraciones:
        len_nueva = len_oraciones + (1 if acum_oraciones else 0) + len(o)
        if len_nueva <= tope:
            acum_oraciones.append(o)
            len_oraciones = len_nueva
        else:
            break

    if acum_oraciones:
        return " ".join(acum_oraciones)

    # Último recurso si no hay ni oraciones cortas: recortar por palabra
    corte = parrafos[0][:tope]
    if " " in corte:
        return corte.rsplit(" ", 1)[0]
    return corte


def leer_catalogo(
    raiz: str = os.path.expanduser("~/.starseed/repos/agency-agents"),
) -> List[Dict[str, str]]:
    """Lee y parsea el catálogo de agency-agents desde el disco sin explotar si no existe."""
    try:
        raiz_abs = os.path.expanduser(raiz)
        if not os.path.exists(raiz_abs) or not os.path.isdir(raiz_abs):
            return []

        resultado = []
        for root, dirs, files in os.walk(raiz_abs):
            dirs[:] = [
                d
                for d in dirs
                if d not in ("examples", "scripts") and not d.startswith(".")
            ]

            for f in files:
                if not f.endswith(".md"):
                    continue

                ruta_completa = os.path.join(root, f)
                rel_path = os.path.relpath(ruta_completa, raiz_abs)
                partes_rel = rel_path.split(os.sep)

                division = partes_rel[0] if len(partes_rel) > 1 else "engineering"
                cid = rel_path[:-3].replace("\\", "/")

                try:
                    with open(
                        ruta_completa, "r", encoding="utf-8", errors="ignore"
                    ) as fp:
                        contenido = fp.read()
                except Exception:
                    continue

                name = ""
                description = ""
                if contenido.strip().startswith("---"):
                    partes = contenido.strip().split("---", 2)
                    if len(partes) >= 3:
                        yaml_bloque = partes[1]
                        for linea in yaml_bloque.splitlines():
                            linea_clean = linea.strip()
                            if linea_clean.startswith("name:"):
                                name = (
                                    linea_clean.split("name:", 1)[1]
                                    .strip()
                                    .strip("'\"")
                                )
                            elif linea_clean.startswith("description:"):
                                description = (
                                    linea_clean.split("description:", 1)[1]
                                    .strip()
                                    .strip("'\"")
                                )

                if not name:
                    name = os.path.splitext(f)[0].replace("-", " ").title()

                resultado.append(
                    {
                        "id": cid,
                        "division": division,
                        "name": name,
                        "description": description,
                    }
                )

        resultado.sort(key=lambda x: x["id"])
        return resultado
    except Exception:
        return []
