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
    # (2026-10-07) Un marcador de documentación (`STARSEED_MOTOR_TOKEN=<token>`, `=${VAR}`,
    # `=$(…)`, `={…}`) no es una clave: frenaba la autopublicación de 81 commits por un texto de ayuda.
    # (2026-10-10) `[A-Z][A-Z0-9_]*` y no `{2,}`: `DB_PASSWORD=…` o `X_TOKEN=…` (prefijo de 1-2
    # letras) se escapaban sin que nadie lo viera.
    ("variable-entorno", re.compile(
        r"\b[A-Z][A-Z0-9_]*(?:_KEY|_TOKEN|_SECRET|_PASSWORD)\s*=\s*[\"']?(?![<$({%\[])[^\s\"']{8,}")),
]

_ENV_NOMBRE = re.compile(r"(^|/)\.env(\.|$)")
# (2026-10-08) Una PLANTILLA de variables (`.env.example`) no es un `.env`: se revisa línea a
# línea como cualquier archivo, no se frena entera por el nombre.
_ENV_PLANTILLA = re.compile(r"(^|/)\.env\.(example|sample|template|dist)$")
# (2026-10-08) Las pruebas y las plantillas llevan claves FALSAS a propósito («sk-test…»,
# «sk-proj-…» con dígitos en serie, «AKIA…EXAMPLE») para comprobar que se tachan. Frenaban la autopublicación
# de 43 commits por `test_destilacion_corpus.py`. En esos archivos —y solo en ellos— un valor
# con forma de marcador no cuenta; un valor aleatorio de verdad sigue frenando.
_ARCHIVO_DE_PRUEBA = re.compile(
    r"(^|/)(test_[^/]*\.py|[^/]*_test\.py|__tests__/.*|[^/]*\.(test|spec)\.[cm]?[jt]sx?)$")
_MARCADOR = re.compile(
    r"test|prueba|fake|falso|ejemplo|example|dummy|sample|placeholder|changeme|cambia|your|"
    r"tu[-_]?clave|aqu[ií]|here|abcdef|123456|456789|987654|654321|xxxx|0000|\.\.\.|…", re.I)


def _es_marcador(coincidencia: str) -> bool:
    """El VALOR (lo que va tras `=` si lo hay) tiene forma de marcador, no de clave."""
    valor = coincidencia.split("=", 1)[-1]
    return bool(_MARCADOR.search(valor))


# (2026-10-10, DSB1010) `PROTO_ORB_POS_KEY = "starseed.protomolecula.orbe.pos.v1"` frenó la
# autopublicación de 6 commits: el patrón `NOMBRE_KEY = valor` no distinguía una CLAVE DE
# ALMACENAMIENTO (localStorage) ni el NOMBRE de una variable de un secreto. Medido sobre el repo
# entero: 278 coincidencias de «variable-entorno», todas de ese tipo. Solo se libran cuatro formas
# que un secreto real no tiene; todo lo demás sigue frenando como antes.
_NOMBRES_CON_VALOR = ("variable-entorno", "next-public-clave")
# Un trozo legible: palabra en minúsculas o camelCase con hasta 3 dígitos al final, «v12» o un
# número corto. Un trozo aleatorio («Zq8vR2mL9p», «a1b2c3d4») no encaja.
_TROZO_PALABRA = re.compile(r"^(?:[a-z]+(?:[A-Z][a-z]+)*[0-9]{0,3}|v[0-9]{1,3}|[0-9]{1,3})$")
_TROZO_CORTO = re.compile(r"^[a-z0-9]{1,4}$")
_TROZO_MAYUS = re.compile(r"^[A-Z]+[0-9]{0,2}$")
_SEPARADORES = re.compile(r"[._:/\-]")
_LECTURA_DE_ENTORNO = re.compile(
    r"^(?:process\.env|import\.meta\.env|os\.environ|os\.getenv\(|Deno\.env|Bun\.env|env\[|env\.)")
_LLAMADA_DE_CODIGO = re.compile(r"^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*(?:\(|\[)")


def _trozo_legible(trozo: str) -> bool:
    if not trozo or len(trozo) > 24:
        return False
    if _TROZO_CORTO.match(trozo):  # «n8n», «a11y», «p2p», «3d»
        return True
    if not _TROZO_PALABRA.match(trozo):
        return False
    # Una tira larga de letras sin vocales es ruido, no una palabra («qwrtzpkd»).
    letras = re.sub(r"[^a-z]", "", trozo.lower())
    return len(letras) < 5 or bool(re.search(r"[aeiouy]", letras))


def _identificador_legible(valor: str, minimo_trozos: int) -> bool:
    """Palabras separadas por `. : _ / -`, todas legibles, al menos una con 3 letras y ningún
    trozo de 4 o más cifras seguidas (un año o un PIN sí pueden ser parte de una contraseña)."""
    trozos = _SEPARADORES.split(valor)
    return (len(trozos) >= minimo_trozos and all(_trozo_legible(t) for t in trozos)
            and any(len(re.sub(r"[^a-zA-Z]", "", t)) >= 3 for t in trozos)
            and not any(re.fullmatch(r"[0-9]{4,}", t) for t in trozos))


def _valor_de(coincidencia: str) -> "tuple[str, bool]":
    """(valor sin comillas ni puntuación final, iba entre comillas)."""
    crudo = coincidencia.split("=", 1)[-1].lstrip()
    entre_comillas = crudo[:1] in ("'", '"')
    return crudo.strip("\"'").rstrip(";,)"), entre_comillas


_NOMBRE_DE_CREDENCIAL = re.compile(r"SECRET|PASSWORD|PASSWD|PRIVATE|SERVICE_ROLE|TOKEN$")
_SUFIJO_DE_VARIABLE = ("KEY", "TOKEN", "SECRET", "PASSWORD", "URL", "ID", "ENV", "NAME", "HOST",
                       "PORT", "PATH", "DIR", "USER", "MODEL", "MODELS", "RPM", "BASE", "REGION")
_PALABRA_DE_CLAVE = re.compile(r"clave|secret|passw|contrase|token|pwd", re.I)


def _nombre_de_variable(valor: str, nombre: str) -> bool:
    """`OPENAI_API_KEY`, `STARSEED_PASARELA_X_URL`: MAYÚSCULAS con guiones bajos y palabras con
    vocales (`QZXW_PLMK_RTVB` no). Bajo un nombre de credencial (`…_SECRET`, `…_PASSWORD`) solo
    si además acaba como acaba una variable: «MI_CLAVE_SECRETA» puede ser una contraseña."""
    trozos = valor.split("_")
    if len(trozos) < 2 or not all(_TROZO_MAYUS.match(t) for t in trozos):
        return False
    sin_vocal = sum(1 for t in trozos if not re.search(r"[AEIOUY]", t))
    if sin_vocal * 2 > len(trozos):
        return False
    if _NOMBRE_DE_CREDENCIAL.search(nombre):
        return trozos[-1] in _SUFIJO_DE_VARIABLE
    return True


# (2026-10-25, PRO1025A) Los textos de ayuda de una habilidad (`HIGGSFIELD_API_KEY=your_key_id:
# your_key_secret`, `…=key_id:key_secret`) frenaron la autopublicación de 77 commits desde el 24-10:
# cinco archivos de `.agent/skills/claude-video-studio/` (README, questions, media.md, doctor.sh,
# higgsfield.py). `_es_marcador` solo se libraba en archivos de prueba; la documentación vive en
# cualquier archivo. Dos formas de MARCADOR EVIDENTE, que un secreto real no tiene, se libran en
# todos los archivos y sin distinguir mayúsculas:
#   a) el valor EMPIEZA por un prefijo de «pon aquí lo tuyo» (`your_`, `tu_`, `my_`, `mi_`,
#      `insert_`, `paste_`, `pega_`, `pon_`) y lo que sigue es legible (palabras, no una tira
#      aleatoria: `my_Zq8vR2mL9pXw` sigue frenando);
#   b) el valor está formado SOLO por palabras de marcador (`key_id:key_secret`, `TOKEN-HERE`).
# Una contraseña de palabras con guiones («mi», «clave», «secreta» unidas por `-`) sigue
# frenando: `mi-` no es un prefijo con guion bajo y «mi» no es una palabra de marcador.
_PREFIJO_DE_MARCADOR = re.compile(r"^(?:your|tu|my|mi|insert|paste|pega|pon)_", re.I)
_SEPARADORES_DE_MARCADOR = re.compile(r"[_:\-.]+")
_PALABRAS_DE_MARCADOR = frozenset((
    "key", "keys", "id", "ids", "secret", "secrets", "secreto", "secreta", "token", "tokens",
    "value", "values", "valor", "clave", "claves", "api", "apikey", "here", "aqui", "aquí",
    "placeholder", "example", "ejemplo", "client", "access"))
_PUNTUACION_FINAL = "`.,;:)]}>*!?"


def _chunk_de_marcador(trozo: str) -> bool:
    """Una palabra de marcador, una racha de `x`/`X`, o un trozo legible (palabra, MAYÚSCULAS,
    Capitalizada o camelCase con hasta 3 dígitos). Un trozo aleatorio no encaja."""
    bajo = trozo.lower()
    if bajo in _PALABRAS_DE_MARCADOR or re.fullmatch(r"x{3,}", bajo):
        return True
    if trozo.isupper() or (trozo[:1].isupper() and trozo[1:].islower()):
        trozo = bajo
    return _trozo_legible(trozo)


def _marcador_de_documentacion(valor: str) -> bool:
    """True si el VALOR es, a todas luces, un texto de ayuda («your_key_id:your_key_secret»)."""
    valor = valor.strip().rstrip(_PUNTUACION_FINAL)
    if not valor:
        return False
    trozos = [t for t in _SEPARADORES_DE_MARCADOR.split(valor) if t]
    if not trozos:
        return False
    # b) solo palabras de marcador.
    if all(t.lower() in _PALABRAS_DE_MARCADOR or re.fullmatch(r"[xX]{3,}", t) for t in trozos):
        return True
    # a) prefijo de «pon aquí» y el resto legible.
    if _PREFIJO_DE_MARCADOR.match(valor):
        resto = [t for t in _SEPARADORES_DE_MARCADOR.split(_PREFIJO_DE_MARCADOR.sub("", valor)) if t]
        return all(_chunk_de_marcador(t) for t in resto)
    return False


def _no_es_secreto(tipo: str, coincidencia: str) -> bool:
    """True si el VALOR de `NOMBRE_KEY = valor` es, sin duda, otra cosa que un secreto.
    Nunca se aplica a los patrones con forma de clave (sk-, ghp_, eyJ…, AKIA, PEM)."""
    if tipo not in _NOMBRES_CON_VALOR:
        return False
    valor, entre_comillas = _valor_de(coincidencia)
    if not valor or len(valor) > 96:
        return False
    nombre = coincidencia.split("=", 1)[0].strip().upper()
    # 0) Referencia o marcador (`=$VAR`, `=<token>`, `={{ secrets.X }}`): la misma regla que ya
    #    tenía «variable-entorno» en su patrón, ahora también para `NEXT_PUBLIC_…`.
    if valor[:1] in ("$", "<", "{", "%", "["):
        return True
    # 0b) Marcador evidente de documentación, en cualquier archivo (PRO1025A).
    if _marcador_de_documentacion(valor):
        return True
    de_almacenamiento = nombre.endswith("_KEY") and not _NOMBRE_DE_CREDENCIAL.search(nombre)
    # 1) Clave de almacenamiento del OS bajo un nombre `…_KEY`: «starseed.<palabras>.v1»,
    #    «starseed:hub:mapa», «starseed_dock_items». (Un `…_TOKEN = "starseed-2024"` sigue frenando.)
    if de_almacenamiento and re.match(r"^starseed[._:/\-]", valor, re.I) \
            and _identificador_legible(valor[9:], 1):
        return True
    # 2) El NOMBRE de otra variable, no su valor.
    if _nombre_de_variable(valor, nombre):
        return True
    # 3) Código que LEE el valor de otro sitio (sin comillas): `process.env.X`, `cfg.get(…)`.
    if not entre_comillas and (_LECTURA_DE_ENTORNO.match(valor) or _LLAMADA_DE_CODIGO.match(valor)):
        return True
    # 3b) Una expresión regular como valor (`/^[A-Za-z0-9_-]{20}$/`): lleva `^ [ ] { } ( ) \`,
    #     que ninguna clave en base64 ni hexadecimal puede llevar.
    if not entre_comillas and re.fullmatch(r"/.*[\\^\[\]{}()\\\\].*/[dgimsuy]*", valor):
        return True
    # 4) Solo bajo un nombre `…_KEY` de almacenamiento: palabras separadas que no hablan de
    #    claves («aurora-guide-seen», «hub:mapa», «omni_last_session»). Para `_TOKEN`, `_SECRET`
    #    y `_PASSWORD` NO se libra: una contraseña puede ser «caballo-correcto-pila».
    if de_almacenamiento and _identificador_legible(valor, 2) and not _PALABRA_DE_CLAVE.search(valor):
        return True
    # 5) Un valor recortado con puntos suspensivos («xkeysib-...», «tu_clave_…») es un ejemplo
    #    de documentación: con lo que queda delante no se entra en ninguna parte.
    if (valor.endswith("...") or valor.endswith("…")) and len(valor.rstrip(".…")) <= 16:
        return True
    return False


def escanear_secretos(diff: str) -> List[Dict[str, Any]]:
    """Recorre un diff unificado y devuelve hallazgos SIN valor:
    [{"archivo", "linea", "tipo"}]. Solo se revisan líneas añadidas (+)
    y las cabeceras de archivo (.env*)."""
    hallazgos: List[Dict[str, Any]] = []
    archivo = ""
    linea_nueva = 0
    env_reportado = False
    de_prueba = False
    for bruta in str(diff or "").splitlines():
        if bruta.startswith("+++ "):
            archivo = bruta[4:].strip()
            if archivo.startswith("b/"):
                archivo = archivo[2:]
            linea_nueva = 0
            env_reportado = False
            de_prueba = bool(_ARCHIVO_DE_PRUEBA.search(archivo) or _ENV_PLANTILLA.search(archivo))
            if _ENV_NOMBRE.search(archivo) and not _ENV_PLANTILLA.search(archivo):
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
                # Todas las coincidencias de la línea: librar la primera (una clave de
                # almacenamiento) no puede tapar un secreto que venga detrás en la misma línea.
                m = next((c for c in patron.finditer(texto)
                          if not (de_prueba and _es_marcador(c.group(0)))
                          and not _no_es_secreto(tipo, c.group(0))), None)
                if m:
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

