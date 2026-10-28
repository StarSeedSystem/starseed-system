"""Lógica pura de la noche de automejora Meta^n (MTN1027D). Sin red ni disco:
recibe ya leídas las experiencias, la cadena de capas y el archivo de directivas.
Meta^n propone dentro de la caja; el juez de StarSeed decide fuera, sin ejecutar nada suyo."""
import copy, hashlib, json, re, shlex

CAPAS_JUICIO = ("jev", "bitnet", "needle", "laya"); MAX_PAUTA = 1200; _CLAVE = re.compile(r"(?:sk-|mv2_|ghp_|AIza|[A-Za-z0-9]{20,})")
_ENTORNO = re.compile(r"\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b"); _URL = re.compile(r"(?:https?://|www\.|\b[\w-]+\.(?:com|es|org|net|io|ai|dev)\b)")
_PROHIBIDO = re.compile(r"(?i)\b(permisos?|permissions?|n[uú]cleo|core|contrase[nñ]as?|passwords?|ignora(?:r)?"
                        r"\s+(?:las\s+)?(?:instrucciones|reglas)|ignore\s+(?:the\s+)?instructions|override\s+instructions)\b")

def _con_resultado(experiencias):
    por_id, orden = {}, []
    for d in experiencias or []:
        if isinstance(d, dict) and "ref" in d and d["ref"] in por_id: por_id[d["ref"]]["resultado"] = d.get("resultado")
        elif isinstance(d, dict) and d.get("id"): por_id[d["id"]] = dict(d); orden.append(d["id"])
    return [por_id[i] for i in orden if por_id[i].get("resultado") is not None]

def _entrada(e):
    bruto = e.get("entrada")
    if isinstance(bruto, str):
        try: bruto = json.loads(bruto)
        except ValueError: return bruto, ""
    if not isinstance(bruto, dict): return ("" if bruto is None else str(bruto)), ""
    estado = bruto.get("estado")
    return str(bruto.get("pregunta") or ""), estado if isinstance(estado, str) else (json.dumps(estado, ensure_ascii=False, sort_keys=True) if estado else "")

def _acierto(e):
    salida = e.get("salida")
    if isinstance(salida, dict):
        if salida.get("opcion") is not None: respuesta = str(salida["opcion"])
        elif isinstance(salida.get("p"), (int, float)): respuesta = "si" if salida["p"] >= 0.5 else "no"
        else: respuesta = json.dumps(salida, ensure_ascii=False, sort_keys=True)
    else: respuesta = "" if salida is None else str(salida)
    if e.get("resultado") is not False: return respuesta
    ops = e.get("opciones")
    if isinstance(ops, str): ops = [x.strip() for x in ops.split(",") if x.strip()]
    if not ops and isinstance(salida, dict) and isinstance(salida.get("p"), (int, float)): ops = ["si", "no"]
    otras = [str(x) for x in (ops or []) if str(x) != respuesta]
    return otras[0] if len(otras) == 1 else None

def _tarea(e, acierto, caja=False, etiqueta=False):
    pregunta, estado = _entrada(e)
    ops = e.get("opciones"); ops = [x.strip() for x in ops.split(",") if x.strip()] if isinstance(ops, str) else ops
    if not ops and isinstance(e.get("salida"), dict) and isinstance(e["salida"].get("p"), (int, float)): ops = ["si", "no"]
    lineas = ["Pregunta: %s" % (pregunta or "(sin pregunta)")]
    if estado: lineas.append("Estado: %s" % estado)
    if ops: lineas.append("Opciones: " + " | ".join(str(x) for x in ops))
    lineas.append("Escribe solo la respuesta acertada en /work/salida/%s.txt." % e["id"])
    t = {"task_id": e["id"], "description": "\n".join(lineas), "verification_script": None, "metadata": {}}
    if not caja: t["verification_script"] = "test \"$(tr -d '\\n' < /work/salida/%s.txt)\" = %s" % (e["id"], shlex.quote(acierto))
    if etiqueta: t["metadata"] = {"capa": e.get("capa"), "respuesta": acierto, "resultado": bool(e.get("resultado"))}
    return t

def tareas_desde_experiencias(experiencias, capa):
    """Parte las cerradas: 70 % entrenamiento y 30 % apartadas. Solo entran las que
    tienen etiqueta fiable: las acertadas y, en un no acertado binario, la otra opción."""
    validas = (capa,) if capa in CAPAS_JUICIO else (CAPAS_JUICIO if capa in ("juicio", "", None) else ())
    fuera = {"entrenamiento": [], "apartadas": [], "apartadas_caja": []}
    for e in _con_resultado(experiencias):
        if e.get("capa") not in validas: continue
        acierto = _acierto(e)
        if acierto is None: continue
        if int(hashlib.sha256(str(e["id"]).encode()).hexdigest(), 16) % 100 < 30:
            fuera["apartadas"].append(_tarea(e, acierto, etiqueta=True)); fuera["apartadas_caja"].append(_tarea(e, acierto, caja=True))
        else: fuera["entrenamiento"].append(_tarea(e, acierto))
    return fuera

def pauta_fija(textos_por_caso):
    """El texto si es el mismo en todos los casos; si no, None."""
    textos = list(textos_por_caso.values()) if isinstance(textos_por_caso, dict) else list(textos_por_caso or [])
    return textos[0] if textos and all(isinstance(t, str) and t == textos[0] for t in textos) else None
def sanear_pauta(texto):
    """Pauta limpia, o None si incumple las reglas de directivas.ts."""
    if not isinstance(texto, str): return None
    limpio = texto.strip()
    if not limpio or len(limpio) > MAX_PAUTA or "```" in limpio: return None
    malo = _URL.search(limpio) or _CLAVE.search(limpio) or _ENTORNO.search(limpio) or _PROHIBIDO.search(limpio)
    return None if malo else limpio

def propuestas_de_ayuda(injected_codes, capa, fecha):
    """Cada función de code_library, una tarea del enjambre; ignora task_solution_map."""
    vistos, tareas = set(), []
    limpia = re.sub(r"[^0-9A-Za-z]", "", str(fecha))
    for inyectada in injected_codes or []:
        if not isinstance(inyectada, dict): continue
        for nombre, codigo in (inyectada.get("code_library") or {}).items():
            if nombre in vistos or not isinstance(codigo, str): continue
            vistos.add(nombre)
            prompt = ("Comprueba primero si sigue haciendo falta; si ya está resuelto, responde NO APLICA y no toques nada.\n\n"
                      "La automejora Meta^n propuso esta función de ayuda para la capa %s. Nunca se carga en caliente: "
                      "si sirve, intégrala como código normal con sus pruebas.\n\nFunción `%s`:\n```python\n%s\n```\n\n"
                      "Reglas: como mucho los archivos listados, ≤ 120 líneas por archivo, español con acentos y sin `any`." % (capa, nombre, codigo.rstrip()))
            tareas.append({"id": "AMJ%s%03d" % (limpia, len(tareas) + 1), "titulo": "Automejora · ayudante %s para la capa %s" % (nombre, capa),
                           "ola": "Automejora Meta^n · ayudantes", "archivos": ["scripts/puente/ayudantes_%s.py" % capa, "scripts/puente/test_ayudantes_%s.py" % capa], "prompt": prompt})
    return tareas

def veredicto(acierto_base, acierto_con, n, margen=0.03, n_min=20):
    """True si la pauta mejora la base por ≥ margen con al menos n_min casos."""
    try: base, con, casos = float(acierto_base), float(acierto_con), int(n)
    except (TypeError, ValueError): return False
    return casos >= n_min and (con - base) >= margen - 1e-9

def nueva_version(archivo_directivas, pauta, acierto, base, n, fecha, origen, preguntar):
    """Añade la pauta al historial y la activa o la deja propuesta. No muta el original."""
    archivo = copy.deepcopy(archivo_directivas) if isinstance(archivo_directivas, dict) else {}
    archivo.setdefault("v", 1); archivo.setdefault("capa", ""); archivo.setdefault("activa", None)
    historial = archivo.get("historial"); historial = archivo["historial"] = [] if not isinstance(historial, list) else historial
    texto = sanear_pauta(pauta)
    if texto is None: return archivo
    version = max([int(h.get("version") or 0) for h in historial if isinstance(h, dict)] or [0]) + 1
    estado = "propuesta" if preguntar else "activa"
    if estado == "activa":
        for h in historial:
            if isinstance(h, dict) and h.get("estado") == "activa": h["estado"] = "anterior"
            elif isinstance(h, dict) and h.get("estado") == "anterior": h["estado"] = "retirada"
        archivo["activa"] = version
    historial.append({"capa": archivo.get("capa", ""), "version": version, "texto": texto,
                      "sha256": hashlib.sha256(texto.encode("utf-8")).hexdigest(), "acierto": float(acierto),
                      "base": float(base), "n": int(n), "fecha": fecha, "origen": origen, "estado": estado})
    return archivo
