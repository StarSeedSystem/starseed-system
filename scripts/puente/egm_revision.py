# -*- coding: utf-8 -*-
"""egm_revision.py · revisión con peces del EGM.

§2 del contrato (architecture/repos-libreria-1104.md):
- prompt_de_pez, leer_objeciones, ola_pasa, revisar.
Módulo puro: sin `node:*`, sin red, sin disco ni claves.
"""

import re
from typing import Any, Callable, Dict, List, Optional, Tuple

_LINEA_CON_GRAVEDAD = re.compile(
    r"^\s*(?:[-*•]\s*)?(?:\d+[.)]\s*)?(?:\[|[*_]{1,2})?\s*(?:gravedad\s*[:=]\s*)?"
    r"(?:\[|[*_]{1,2})?\s*(bloquea|importa|menor)(?![a-z0-9áéíóúñ])[\s*_\]]*[:：.,;–—-]?\s*(.*)$",
    re.IGNORECASE,
)


def prompt_de_pez(artefacto: str, tipo: str) -> str:
    """Prompt para un revisor sin contexto del artefacto."""
    descripcion = {
        "respuesta": "una respuesta larga que se entregará a una persona",
        "plan": "un plan de trabajo",
        "ola": "una ola de tareas del enjambre",
        "pagina": "una página publicada",
        "app": "una aplicación",
    }
    lineas = [
        "Eres un revisor «pez»: no tienes contexto, memoria ni conversación previa.",
        f"Solo puedes juzgar el artefacto (tipo: {tipo}): {descripcion.get(tipo, tipo)}.",
        "No supongas nada que no esté escrito en él.", "",
        "Devuelve SOLO objeciones, una por línea:",
        "bloquea: <qué impide usar el artefacto tal como está>",
        "importa: <qué debería corregirse antes de usarlo>",
        "menor: <detalle opcional de estilo, precisión o redacción>",
        "", "Reglas: una objeción por línea; sin listas anidadas.",
        "- Usa«bloquea» solo si el artefacto no puede usarse; «importa» si debe corregirse.",
        "- No repitas objeciones ni inventes contexto. Si no ves objeciones: sin objeciones.",
        "", f"Artefacto ({tipo}):", "---", artefacto, "---",
    ]
    return "\n".join(lineas)


def _normalizar(texto: str) -> str:
    """Quita adornos de markdown/espacios sobrantes."""
    return re.sub(r"^[\s*_`]+", "", re.sub(r"[\s*_`]+$", "", re.sub(r"\s+", " ", texto.strip())))


def _clave_de(objecion: Tuple[str, str]) -> str:
    """Clave para no repetir objeciones (gravedad + texto normalizado)."""
    g, t = objecion
    return f"{g}|{_normalizar(t).lower().rstrip('.;,')}"


def leer_objeciones(texto: str) -> List[Dict[str, str]]:
    """Lee el texto de un pez y devuelve sus objeciones (tolerante y sin duplicados)."""
    vistas = set()
    objeciones = []
    for linea in texto.split("\n"):
        m = _LINEA_CON_GRAVEDAD.match(linea)
        if not m:
            continue
        g, c = m.group(1).lower(), _normalizar(m.group(2))
        if not c:
            continue
        clave = _clave_de((g, c))
        if clave in vistas:
            continue
        vistas.add(clave)
        objeciones.append({"gravedad": g, "texto": c})
    return objeciones


def ola_pasa(objeciones: List[Dict[str, str]]) -> Dict[str, Any]:
    """Pasa si no hay ninguna objeción `bloquea`."""
    b = [o for o in objeciones if o.get("gravedad") == "bloquea"]
    return {"pasa": len(b) == 0, "bloqueantes": b}


def _fusionar_objeciones(todas: List[List[Dict[str, str]]]) -> List[Dict[str, str]]:
    """Fundir objeciones de múltiples modelos, manteniendo primera aparición por clave."""
    vistas, resultado = set(), []
    for lista in todas:
        for obj in lista:
            k = _clave_de((obj.get("gravedad", ""), obj.get("texto", "")))
            if k not in vistas:
                vistas.add(k)
                resultado.append(obj)
    return resultado


def revisar(artefacto: str, tipo: str, llamar: Callable[[str, str], str],
            modelos: Optional[List[Tuple[str, str]]] = None, n: int = 2) -> Dict[str, Any]:
    """Llama a n modelos gratuitos y funde sus objeciones."""
    prompt = prompt_de_pez(artefacto, tipo)
    m = modelos if modelos is not None else []
    if len(m) < n:
        provs = [("freellmapi", "auto"), ("ollama", "gemma3:12b-instruct-q4_k_m"),
                 ("gemini", "gemini-2.5-flash"), ("nim", "moonshotai/kimi-k3")]
        for p in provs:
            if len(m) >= n:
                break
            m.append(p)
    respuestas: List[List[Dict[str, str]]] = []
    por_modelo: Dict[str, List[Dict[str, str]]] = {}
    for prov, mod in m[:n]:
        try:
            texto = llamar(prompt, f"{prov}/{mod}")
            obj = leer_objeciones(texto)
            respuestas.append(obj)
            por_modelo[f"{prov}/{mod}"] = obj
        except Exception:
            pass
    obj_fundidas = _fusionar_objeciones(respuestas)
    r = ola_pasa(obj_fundidas)
    r["objeciones"] = obj_fundidas
    r["por_modelo"] = por_modelo
    return r