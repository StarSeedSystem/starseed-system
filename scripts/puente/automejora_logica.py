# -*- coding: utf-8 -*-
"""Lógica de la noche de la automejora Meta^n (MTN1027D). PURO: sin red, sin
reloj, sin disco. Contrato: architecture/automejora-meta-n.md §3 — Meta^n
PROPONE dentro de la caja; el juez de StarSeed decide fuera, sin ejecutar
nada suyo; las funciones de ayuda nunca se cargan en caliente."""

import hashlib
import json
import re

CAPAS_JUICIO = ("jev", "bitnet", "needle", "laya")
LIMITE_CARACTERES = 1200

# Sanear con las MISMAS reglas que `sanearDirectiva`
# (src/lib/astraura/capas/directivas.ts): una pauta es TEXTO de estrategia.
RE_URL = re.compile(r"(?:https?://|www\.)\S+", re.I)
RE_DOMINIO = re.compile(r"\b[\w-]{2,}\.(?:com|net|org|io|dev|app|ai|xyz|info)\b", re.I)
RE_CODIGO = re.compile(r"```")
RE_CLAVE = re.compile(r"\b(?:sk-|mv2_|ghp_)|AIza|\b[A-Za-z0-9]{20,}\b", re.I)
RE_ENV = re.compile(r"\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b")  # en el TS no va con /i
RE_TEMAS = re.compile(
    r"\b(?:permisos?|permissions?|n[úu]cleos?|kernels?|contrase[ñn]as?|passwords?|passwd)\b", re.I)
RE_IGNORA = re.compile(
    r"\b(?:ignor\w*|olv[íi]d\w*|desobedezc\w*|disregard\w*|bypass\w*|override)\b"
    r"[^.;]{0,32}?\b(?:instrucciones|instrucci[óo]n|instructions?|reglas?|rules?"
    r"|[óo]rdenes|orders?|prompts?|directivas|directives?)\b", re.I)


def sanear_pauta(texto):
    """Las mismas causas y el mismo orden que el TS; None entra y se rechaza."""
    p = (texto or "").strip()
    if not p:
        return {"ok": False, "texto": "", "motivo": "vacía"}
    if len(p) > LIMITE_CARACTERES:
        return {"ok": False, "texto": "", "motivo": "supera %d caracteres" % LIMITE_CARACTERES}
    if RE_URL.search(p) or RE_DOMINIO.search(p):
        return {"ok": False, "texto": "", "motivo": "contiene una URL"}
    if RE_CODIGO.search(p):
        return {"ok": False, "texto": "", "motivo": "contiene un bloque de código"}
    if RE_CLAVE.search(p):
        return {"ok": False, "texto": "", "motivo": "contiene algo con forma de clave"}
    if RE_ENV.search(p):
        return {"ok": False, "texto": "", "motivo": "contiene un nombre de variable de entorno"}
    if RE_TEMAS.search(p):
        return {"ok": False, "texto": "", "motivo": "habla de permisos, núcleo o contraseñas"}
    if RE_IGNORA.search(p):
        return {"ok": False, "texto": "", "motivo": "pide ignorar instrucciones"}
    return {"ok": True, "texto": p}


def _texto(x):
    """La salida como texto: tal cual si es str, JSON si es otra cosa."""
    return x if isinstance(x, str) else json.dumps(x, ensure_ascii=False, sort_keys=True)


def _huella(id_):
    """0–9 por SHA-256 del id: la misma partición siempre."""
    return int(hashlib.sha256(str(id_).encode("utf-8")).hexdigest(), 16) % 10


def _cerrar(experiencias):
    """Aplica las líneas `ref` a las experiencias, como hace `leer`."""
    por_id, orden = {}, []
    for e in experiencias or []:
        if not isinstance(e, dict):
            continue
        if "ref" in e:
            original = por_id.get(e["ref"])
            if original is not None:
                original["resultado"] = e.get("resultado")
        elif e.get("id"):
            por_id[e["id"]] = e
            orden.append(e["id"])
    return [por_id[i] for i in orden]


def _tarea_de(e):
    """Tarea de Meta^n: la pregunta (entrada), el estado y las opciones en
    texto; verification_script que comprueba la opción acertada en
    /work/salida/<task_id>.txt. Si se sabe que falló no se sabe cuál acertó:
    sin verificación."""
    tid = str(e.get("id"))
    opciones = e.get("opciones") or []
    salida = _texto(e.get("salida")) or ""
    estado = "La capa contestó «%s».%s" % (
        salida, " Se confirmó que acertó." if e.get("resultado") else " Se confirmó que falló.")
    partes = [p for p in (
        _texto(e.get("entrada")),
        ("Opciones: " + " | ".join(str(o) for o in opciones)) if opciones else "",
        estado,
        "Escribe solo la opción correcta en /work/salida/%s.txt" % tid,
    ) if p]
    script = None
    if e.get("resultado"):
        correcta = salida.replace("'", "'\\''")
        script = 'test "$(cat /work/salida/%s.txt | tr -d \'\\n\')" = \'%s\'' % (tid, correcta)
    return {"task_id": tid, "description": "\n".join(partes),
            "verification_script": script, "etiqueta": salida if e.get("resultado") else None}


def tareas_desde_experiencias(experiencias, capa):
    """Tareas de la noche a partir de experiencias cerradas (con resultado);
    la capa juicio usa las de jev, bitnet, needle o laya. 70 % entrenamiento,
    30 % apartadas por huella del id (siempre las mismas). Las apartadas van
    con etiqueta para el juez y sin verification_script para la caja."""
    capas_buscadas = set(CAPAS_JUICIO) if capa == "juicio" else {capa}
    cerradas = [e for e in _cerrar(experiencias)
                if e.get("resultado") is not None and e.get("capa") in capas_buscadas]
    entrenamiento, apartadas = [], []
    for e in cerradas:
        t = _tarea_de(e)
        if _huella(e.get("id")) >= 7:
            apartadas.append(t)  # con etiqueta: para el juez
        else:
            del t["etiqueta"]
            entrenamiento.append(t)  # para la caja, como las demás
    caja = [{"task_id": t["task_id"], "description": t["description"]}
            for t in apartadas]
    return {"entrenamiento": entrenamiento,
            "apartadas_juez": apartadas,
            "apartadas_caja": caja}


def pauta_fija(textos_por_caso):
    """El texto si es exactamente el mismo (sin bordes) en todos los casos.
    Si depende del caso, o es vacío, es código: None."""
    if isinstance(textos_por_caso, dict):
        textos = list(textos_por_caso.values())
    else:
        textos = list(textos_por_caso or [])
    limpios = [t.strip() for t in textos if isinstance(t, str)]
    if (limpios and len(limpios) == len(textos) and len(set(limpios)) == 1
            and limpios[0]):
        return limpios[0]
    return None


AYUDA = "scripts/puente/ayudantes_%s.py"
PRUEBA_AYUDA = "scripts/puente/test_ayudantes_%s.py"
PROMPT_AYUDA = (
    "Comprueba primero si sigue haciendo falta; si ya está resuelto, responde NO APLICA.\n"
    "TAREA: Meta^n propuso una función de ayuda para la capa «%s». Intégrala revisada y con\n"
    "prueba, como mucho 3 archivos: scripts/puente/ayudantes_%s.py y su prueba. NUNCA se carga\n"
    "en caliente: Meta^n ejecuta su código solo dentro de la caja, aquí pasa por puertas.\n"
    "Referencia (propuesta de Meta^n):\n```python\n%s\n```"
)


def propuestas_de_ayuda(injected_codes, capa, fecha):
    """Cada función de `code_library` → una propuesta de tarea del enjambre
    (id AMJ<fecha><n>). `task_solution_map` se ignora: es memorizar."""
    fuera = []
    for candidato in injected_codes or []:
        biblioteca = (candidato or {}).get("code_library") or {}
        for nombre, codigo in biblioteca.items():
            fuera.append({
                "id": "AMJ%s%d" % (fecha, len(fuera) + 1),
                "titulo": "Ayudante de automejora Meta^n: %s" % nombre,
                "capa": capa, "origen": "meta-n",
                "archivos": [AYUDA % capa, PRUEBA_AYUDA % capa],
                "prompt": PROMPT_AYUDA % (capa, capa, codigo),
            })
    return fuera


def veredicto(acierto_base, acierto_con, n, margen=0.03, n_min=20):
    """El juez: pasa si acierta más que la activa por ≥ margen con ≥ n_min
    casos. Las puntuaciones internas de Meta^n no deciden nada."""
    n = int(n)
    mejora = float(acierto_con) - float(acierto_base)
    if n < n_min:
        return {"aceptado": False, "motivo": "solo %d casos (menos de %d)" % (n, n_min)}
    if mejora < margen - 1e-9:
        return {"aceptado": False, "motivo": "mejora %.3f < %.3f" % (mejora, margen)}
    return {"aceptado": True, "motivo": "mejora %.3f con %d casos" % (mejora, n)}


def nueva_version(archivo_directivas, pauta, acierto, base, n, fecha, origen, preguntar):
    """Añade la directiva nueva al historial del archivo (mismo formato que
    `starseed.capas.directivas.v1`): entra en «activa» o en «propuesta» según
    `preguntar`; la activa anterior pasa a «anterior». Devuelve el archivo
    NUEVO; si la pauta no se sanea, ValueError (el juez la rechaza antes)."""
    sana = sanear_pauta(pauta)
    if not sana["ok"]:
        raise ValueError("pauta rechazada: " + sana["motivo"])
    viejo = archivo_directivas or {}
    archivo = {"v": 1, "capa": viejo.get("capa", ""), "activa": viejo.get("activa"),
               "historial": [dict(d) for d in viejo.get("historial") or []]}
    version = max([d.get("version", 0) for d in archivo["historial"]] or [0]) + 1
    directiva = {
        "capa": archivo["capa"], "version": version, "texto": sana["texto"],
        "sha256": hashlib.sha256(sana["texto"].encode("utf-8")).hexdigest(),
        "acierto": round(float(acierto), 4), "base": round(float(base), 4),
        "n": int(n), "fecha": fecha, "origen": origen,
        "estado": "propuesta" if preguntar else "activa",
    }
    if preguntar:
        archivo["historial"].append(directiva)
        return archivo
    for d in archivo["historial"]:
        if d.get("estado") in ("activa", "propuesta"):
            d["estado"] = "anterior"
    archivo["historial"].append(directiva)
    archivo["activa"] = version
    return archivo
