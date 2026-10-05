"""Puertas 2 (seguridad) y 3 (coherencia) del director de producción.

Funciones puras, sin red ni archivos: todo lo externo se inyecta.
Contrato: architecture/director-produccion.md §3.
Regla rectora: Jev frena, nunca empuja; una puerta determinista en rojo
nunca se salva. Nunca imprime valores de secretos, solo archivo/línea/tipo.
"""
from __future__ import annotations

import json
import re
from typing import Any, Callable, Dict, List, Optional

MAX_PREGUNTAS_LOTE = 24
PREGUNTAS_POR_CANDIDATA = 3
MAX_PAQUETE_BYTES = 6 * 1024

_SECRETOS = [
    ("archivo-env", None),
    ("sk", re.compile(r"\bsk-[A-Za-z0-9_\-]{12,}")),
    ("ghp", re.compile(r"\bghp_[A-Za-z0-9]{20,}")),
    ("github_pat", re.compile(r"\bgithub_pat_[A-Za-z0-9_]{20,}")),
    ("jwt", re.compile(r"\beyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+")),
    ("akia", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("xox", re.compile(r"\bxox[baprs]-[A-Za-z0-9\-]{8,}")),
    ("pem", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("next-public-clave", re.compile(
        r"\bNEXT_PUBLIC_[A-Z0-9_]*(?:SECRET|KEY|TOKEN)[A-Z0-9_]*\s*=\s*[\"']?[^\s\"']+")),
    ("variable-entorno", re.compile(
        r"\b[A-Z][A-Z0-9_]{2,}(?:_KEY|_TOKEN|_SECRET|_PASSWORD)\s*=\s*[\"']?[^\s\"']{8,}")),
]

_ENV_NOMBRE = re.compile(r"(^|/)\.env(\.|$)")


def escanear_secretos(diff: str) -> List[Dict[str, Any]]:
    """Recorre un diff unificado y devuelve hallazgos SIN valor:
    [{"archivo", "linea", "tipo"}]. Solo se revisan líneas añadidas (+)
    y las cabeceras de archivo (.env*)."""
    hallazgos: List[Dict[str, Any]] = []
    archivo = ""
    linea_nueva = 0
    env_reportado = False
    for bruta in str(diff or "").splitlines():
        if bruta.startswith("+++ "):
            archivo = bruta[4:].strip()
            if archivo.startswith("b/"):
                archivo = archivo[2:]
            linea_nueva = 0
            env_reportado = False
            if _ENV_NOMBRE.search(archivo):
                hallazgos.append({"archivo": archivo, "linea": 0, "tipo": "archivo-env"})
                env_reportado = True
            continue
        if bruta.startswith("--- ") or bruta.startswith("diff ") or bruta.startswith("index "):
            continue
        if bruta.startswith("@@"):
            m = re.search(r"\+(\d+)(?:,(\d+))?", bruta)
            linea_nueva = int(m.group(1)) - 1 if m else 0
            continue
        if bruta.startswith("+") and not bruta.startswith("+++"):
            linea_nueva += 1
            texto = bruta[1:]
            if env_reportado:
                continue
            for tipo, patron in _SECRETOS:
                if patron is None:
                    continue
                if patron.search(texto):
                    hallazgos.append({"archivo": archivo, "linea": linea_nueva, "tipo": tipo})
                    break  # una línea, un hallazgo
        elif not bruta.startswith("-"):
            linea_nueva += 1
    return hallazgos


_COMENT_LINEA = re.compile(r"--[^\n]*")
_COMENT_BLOQUE = re.compile(r"/\*.*?\*/", re.S)
_PATRONES_DESTRUCTIVOS = [
    ("DROP", re.compile(r"\bDROP\b", re.I)),
    ("TRUNCATE", re.compile(r"\bTRUNCATE\b", re.I)),
    ("DELETE", re.compile(r"\bDELETE\b", re.I)),
    ("RENAME", re.compile(r"\bRENAME\b", re.I)),
    ("ALTER_TYPE", re.compile(r"\bALTER\b[\s\S]*?\bTYPE\b", re.I)),
]
_ADD_NOT_NULL = re.compile(r"\bADD\s+COLUMN\b[\s\S]*?\bNOT\s+NULL\b", re.I)
_DEFAULT = re.compile(r"\bDEFAULT\b", re.I)


def migracion_destructiva(sql: str) -> "tuple[bool, Optional[str]]":
    """(True, motivo) si la migración es destructiva; (False, None) si no."""
    limpio = _COMENT_BLOQUE.sub(" ", _COMENT_LINEA.sub(" ", str(sql or "")))
    for sentencia in limpio.split(";"):
        trozo = sentencia.strip()
        if not trozo:
            continue
        for nombre, patron in _PATRONES_DESTRUCTIVOS:
            if patron.search(trozo):
                return True, "migración destructiva: %s" % nombre
        if _ADD_NOT_NULL.search(trozo) and not _DEFAULT.search(trozo):
            return True, "migración destructiva: ADD COLUMN NOT NULL sin DEFAULT"
    return False, None


def _bytes(paquete: Dict[str, Any]) -> int:
    return len(json.dumps(paquete, ensure_ascii=False).encode("utf-8"))


def paquete_contexto(candidata: Dict[str, Any], contexto: Any) -> Dict[str, Any]:
    """Paquete de §3 para juzgar una candidata: título, prompt recortado,
    motivo de la ola, petición de Alex, diffstat, archivos, contexto del área
    y veredictos. El JSON serializado nunca pasa de MAX_PAQUETE_BYTES."""
    c = candidata if isinstance(candidata, dict) else {}
    ctx = contexto if isinstance(contexto, str) else json.dumps(contexto, ensure_ascii=False)
    paquete = {
        "tid": str(c.get("id") or c.get("tid") or ""),
        "titulo": str(c.get("titulo") or "")[:300],
        "prompt_tarea": str(c.get("prompt") or c.get("prompt_tarea") or "")[:800],
        "motivo_ola": str(c.get("motivo_ola") or "")[:500],
        "peticion_alex": str(c.get("peticion_alex") or "")[:500],
        "diffstat": str(c.get("diffstat") or "")[:1000],
        "archivos": [str(a)[:300] for a in (c.get("archivos") or [])][:40],
        "contexto_area": ctx[:2000],
        "veredictos": c.get("veredictos") or {},
    }
    for clave, tope in (("contexto_area", 1000), ("prompt_tarea", 400),
                        ("motivo_ola", 200), ("peticion_alex", 200)):
        while _bytes(paquete) > MAX_PAQUETE_BYTES and paquete[clave]:
            paquete[clave] = paquete[clave][: max(0, min(tope, len(paquete[clave]) - 500))]
            if len(paquete[clave]) > tope:
                paquete[clave] = paquete[clave][:tope]
    while _bytes(paquete) > MAX_PAQUETE_BYTES and paquete["archivos"]:
        paquete["archivos"].pop()
    if _bytes(paquete) > MAX_PAQUETE_BYTES:
        paquete["diffstat"] = ""
        paquete["veredictos"] = {}
    return paquete


def _tid(candidata: Dict[str, Any]) -> str:
    return str(candidata.get("id") or candidata.get("tid") or "")


def preguntas_lote(candidatas: List[Dict[str, Any]]) -> List[Dict[str, Dict[str, Any]]]:
    """Las tres preguntas de §3.3 por candidata, en el formato de
    decidir.consultar_lote ({id: {tipo, pregunta, opciones?, niveles?}}),
    troceadas a un máximo de MAX_PREGUNTAS_LOTE por lote."""
    preguntas: Dict[str, Dict[str, Any]] = {}
    for c in candidatas or []:
        paquete = paquete_contexto(c, c.get("contexto_area", ""))
        tid = paquete["tid"] or "?"
        base = "Candidata %s (%s). %s" % (tid, paquete["titulo"], paquete["motivo_ola"] or "sin motivo")
        preguntas["coherente_%s" % tid] = {
            "tipo": "si-no",
            "pregunta": "%s ¿Cumple el propósito declarado y es coherente con StarSeed?" % base,
        }
        preguntas["mejora_%s" % tid] = {
            "tipo": "puntuar", "niveles": ["1", "2", "3", "4", "5"],
            "pregunta": "%s ¿Mejora el sistema, sin empeorar nada visible?" % base,
        }
        preguntas["riesgo_%s" % tid] = {
            "tipo": "elegir", "opciones": ["bajo", "medio", "alto"],
            "pregunta": "%s ¿Riesgo de regresión en producción?" % base,
        }
    lotes = []
    items = list(preguntas.items())
    for i in range(0, len(items), MAX_PREGUNTAS_LOTE):
        lotes.append(dict(items[i:i + MAX_PREGUNTAS_LOTE]))
    return lotes


def _es_si(ans: Optional[Dict[str, Any]], umbral_jev: float) -> bool:
    if not isinstance(ans, dict):
        return False
    if str(ans.get("respuesta") or "").lower() not in ("sí", "si", "yes"):
        return False
    try:
        return float(ans.get("p")) >= umbral_jev
    except (TypeError, ValueError):
        return False


def _mejora(ans: Optional[Dict[str, Any]]) -> int:
    if not isinstance(ans, dict):
        return 0
    valor = ans.get("valor", ans.get("mejora", ans.get("respuesta")))
    try:
        return int(valor)
    except (TypeError, ValueError):
        return 0


def _riesgo(ans: Optional[Dict[str, Any]]) -> str:
    if not isinstance(ans, dict):
        return ""
    return str(ans.get("respuesta") or "").lower()


def _mediana(numeros: List[int]) -> int:
    orden = sorted(numeros)
    return orden[len(orden) // 2]


def _regla_jev(coherente_ok: bool, mejora: int, riesgo: str,
               pruebas_completas: bool) -> "tuple[bool, str]":
    """Regla exacta de §3.3."""
    if not coherente_ok:
        return False, "Jev no confirma coherencia con p suficiente"
    if mejora < 3:
        return False, "mejora < 3"
    if riesgo == "alto":
        return False, "riesgo alto"
    if riesgo == "medio" and not pruebas_completas:
        return False, "riesgo medio sin pruebas completas"
    return True, "pasa la regla de §3.3"


def _mayoria_panel(votos: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Mayoría de 3 votos {coherente: 'sí'/'no', mejora: 1..5, riesgo: str}."""
    validos = [v for v in votos or [] if isinstance(v, dict)]
    if len(validos) < 3:
        return None
    validos = validos[:3]
    si = sum(1 for v in validos if str(v.get("coherente") or "").lower() in ("sí", "si", "yes"))
    riesgos = [_riesgo(v) for v in validos]
    moda = max(("bajo", "medio", "alto"), key=riesgos.count)
    return {
        "coherente": "sí" if si >= 2 else "no",
        "p": 1.0 if si >= 2 else 0.0,
        "mejora": _mediana([_mejora(v) for v in validos]),
        "riesgo": moda,
    }


Panel = Callable[[Dict[str, Any]], Optional[List[Dict[str, Any]]]]


def decidir_lote(respuestas: Dict[str, Any], candidatas: List[Dict[str, Any]],
                 umbral_jev: float, panel: Optional[Panel] = None) -> Dict[str, Dict[str, Any]]:
    """Regla exacta de §3.3 por candidata. `respuestas` acepta el dict completo
    de decidir.consultar_lote o solo su subdict "respuestas". Si falta la
    respuesta de Jev decide `panel` (mayoría de 3); sin panel, no publica.
    Una puerta determinista en rojo (candidata['puertas'][n] == 'rojo') nunca
    se salva: Jev frena, nunca empuja."""
    resp = respuestas.get("respuestas") if isinstance(respuestas, dict) else None
    if resp is None:
        resp = respuestas if isinstance(respuestas, dict) else {}
    resultados: Dict[str, Dict[str, Any]] = {}
    for c in candidatas or []:
        tid = _tid(c)
        rojas = [n for n, v in (c.get("puertas") or {}).items() if v == "rojo"]
        if rojas:
            resultados[tid] = {"publica": False, "via": "determinista",
                               "motivo": "puerta determinista en rojo: %s" % rojas[0]}
            continue
        ans_c = resp.get("coherente_%s" % tid)
        ans_m = resp.get("mejora_%s" % tid)
        ans_r = resp.get("riesgo_%s" % tid)
        completa = bool(c.get("pruebas_completas"))
        if None not in (ans_c, ans_m, ans_r):
            ok, motivo = _regla_jev(_es_si(ans_c, umbral_jev), _mejora(ans_m),
                                    _riesgo(ans_r), completa)
            resultados[tid] = {"publica": ok, "via": "jev", "motivo": motivo}
            continue
        sintesis = _mayoria_panel(list(panel(c) or [])) if panel else None
        if sintesis is None:
            resultados[tid] = {"publica": False, "via": "sin_panel",
                               "motivo": "Jev no respondió y no hay panel"}
            continue
        ok, motivo = _regla_jev(sintesis["coherente"] == "sí", sintesis["mejora"],
                                sintesis["riesgo"], completa)
        resultados[tid] = {"publica": ok, "via": "panel", "motivo": motivo}
    return resultados


def juzgar_lote(candidatas: List[Dict[str, Any]], decidir: Any, umbral_jev: float,
                panel: Optional[Panel] = None) -> Dict[str, Dict[str, Any]]:
    """Ciclo completo de la puerta 3: arma las preguntas, llama a
    decidir.consultar_lote UNA vez por lote (troceado a 24 preguntas) y
    aplica la regla. `decidir` se inyecta para probar sin red."""
    respuestas: Dict[str, Any] = {}
    for lote in preguntas_lote(candidatas):
        estado = {"candidatas": [_tid(c) for c in candidatas]}
        r = decidir.consultar_lote(estado, lote, quien="produccion",
                                   dominio="produccion")
        if isinstance(r, dict):
            parcial = r.get("respuestas") or {}
            if isinstance(parcial, dict):
                respuestas.update(parcial)
    return decidir_lote(respuestas, candidatas, umbral_jev, panel=panel)

