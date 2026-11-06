#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Director de autodesarrollo: imagina cuando toca, decide y asigna (IMN1021Db, §5 de
architecture/imaginacion-autodesarrollo.md). Desde la Ola 1024I (IMG1024C) además recoge las
propuestas libres de los agentes imaginativos (`imaginacion/agentes/*.json`), aplica el automático
(§3: integra solo lo bajo/medio que llega al umbral, reimagina solo lo que no llega, lo demás a la
lista manual; alta y crítica NUNCA solas), encarga las reimaginaciones al enjambre y llama al agente
de referencias de diseño si existe. Desde la Ola 1025S (IMG1025A) el automático decide también Astraura y lo
que no es código, descarta duplicadas, reparte las reimaginaciones con tope por ciclo y manda cada aprobada por
su vía: código → cola de código; Astraura → su backend 1.58; lo demás → entregable del analista en modo libre.
Decidir se hace y se escribe siempre (no cuesta memoria); lanzar trabajo, solo cuando toca. Reloj, disco,
lanzadores, Jev, Astraura y agentes por parámetro (las pruebas no lanzan nada real); escrituras atómicas
(tmp + os.replace) y cerrojo propio."""
from __future__ import annotations
import argparse, fcntl, json, os, shutil, subprocess, sys, tempfile, time, urllib.error, urllib.request
from collections import Counter
import re, unicodedata
from contextlib import contextmanager
from datetime import datetime, timedelta

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import autodesarrollo_logica as AL, autodesarrollo_decidir as AD, autodesarrollo_fuentes as AF
import autodesarrollo_reimaginar as AR, autodesarrollo_entregables as AE
import egm_revision as EGM

RAIZ = os.path.dirname(os.path.dirname(AQUI))
ESTADOS_ALEX = ("aprobada", "rechazada", "pospuesta", "hecha", "descartada")
#: Lo que el automático vuelve a mirar cuando cambian sus ajustes; «nueva» lo es y además se mira en
#: CADA ciclo aunque la firma no cambie (Ola 1029B). Nunca lo que decidió Alex.
REVISABLES = ("nueva", "pregunta", "esperando-aprobacion", "autodesarrollo")
MAX_ARCHIVOS_AGENTES, MAX_BYTES_AGENTE = 300, 1_000_000
PROMPT = ("Comprueba si sigue haciendo falta; si ya está hecho, responde NO APLICA. Si hace falta: {t}. {c} "
          "Máximo 3 archivos y 120 líneas por archivo; tsc y pruebas en verde.")


def _json(ruta, defecto):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def _escribir(ruta, datos):
    os.makedirs(os.path.dirname(ruta) or ".", exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(ruta) or ".", prefix=".tmp_")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False, indent=1); f.write("\n")
        os.replace(tmp, ruta)
    except BaseException:
        if os.path.exists(tmp): os.unlink(tmp)
        raise


@contextmanager
def cerrojo(ruta):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, "w") as f:
        try: fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError: yield False; return
        try: yield True
        finally: fcntl.flock(f, fcntl.LOCK_UN)


#: (1103) El inventario de medios que mide `contenedores_nube` (Genesis › Contenedores); vale si tiene < 45 min.
CONTENEDORES = os.path.join(RAIZ, "starseed_memory_root", "mando", "contenedores.json")
CONTENEDORES_VIGENTE_S = 45 * 60
#: Medios cuyos agentes libres cuentan como sitio fuera de la Mac (Claude en la nube no: necesita al CLI con sesión).
MEDIOS_NUBE, MEDIO_A1 = ("nube-gh", "cloudroom"), "oracle"


def huecos_fuera(inventario, ahora=None, vigente_s=CONTENEDORES_VIGENTE_S, mtime=None):
    """PURA (1103). (huecos_a1, huecos_nube) del inventario de contenedores; (0, 0) si falta o está viejo."""
    ahora = time.time() if ahora is None else ahora
    if not isinstance(inventario, dict) or (mtime is not None and ahora - mtime > vigente_s):
        return 0, 0
    a1 = nube = 0
    for m in inventario.get("contenedores") or []:
        if not isinstance(m, dict) or m.get("estado") not in ("listo", "usable"):
            continue
        libres = max(0, int(m.get("agentes_libres") or 0))
        if m.get("id") == MEDIO_A1:
            a1 += libres
        elif m.get("id") in MEDIOS_NUBE:
            nube += libres
    return a1, nube


def ultima_profunda(carpeta, ahora, dias=7):
    """(1103) (fecha, consolidado) de la sesión de sueños profundos consolidada más reciente de los últimos `dias`
    (las sesiones se fechan el día que empiezan y se consolidan días después); ("", {}) si no hay."""
    try:
        nombres = sorted((n for n in os.listdir(carpeta) if len(n) == 10 and n[4] == "-" and n[7] == "-"), reverse=True)
    except OSError:
        return "", {}
    limite = (ahora - timedelta(days=dias)).strftime("%Y-%m-%d")
    for n in nombres:
        if n < limite:
            break
        c = _json(os.path.join(carpeta, n, "consolidado.json"), None)
        if isinstance(c, (dict, list)) and c:
            return n, c
    return "", {}


def medir_capacidad(home, contenedores=None):
    """Gobernador + salud de proveedores + (1103) el sitio libre del A1 y la nube según el inventario de
    contenedores. Claves no halladas = sin dato (None): nunca se inventa. Con un `home` de pruebas y sin
    `contenedores`, el A1 y la nube cuentan 0 (no se lee el inventario real)."""
    g, s = _json(os.path.join(home, "gobernador.json"), None), _json(os.path.join(home, "salud-proveedores.json"), None)
    if not isinstance(g, dict) or not isinstance(g.get("maximo"), int) or not isinstance(s, dict): return None
    ocupados = g.get("trabajando", g.get("en_curso", 0)) or 0
    vivos = [k for k, v in s.items() if isinstance(v, dict) and not (v.get("caido") or v.get("estado") in ("caido", "caído", "sin_cupo"))]
    if contenedores is None and os.path.realpath(home) == os.path.realpath(os.path.expanduser("~/.starseed")):
        contenedores = CONTENEDORES
    a1 = nube = 0
    if contenedores and os.path.exists(contenedores):
        try:
            a1, nube = huecos_fuera(_json(contenedores, None), mtime=os.path.getmtime(contenedores))
        except OSError:
            a1 = nube = 0
    return {"huecos_mac": max(0, g["maximo"] - ocupados), "huecos_a1": a1, "huecos_nube": nube,
            "proveedores_con_cupo": len(vivos), "presion_mac": g.get("presion") or 0}


def _lanzar_real(*orden):
    return subprocess.Popen(orden, cwd=RAIZ, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True) and True


def _astraura():
    try:
        url = os.environ.get("ASTRAURA_IMAGINATION_URL", "http://127.0.0.1:8000/api/imagination/status")
        return json.load(urllib.request.urlopen(url, timeout=3))
    except Exception:
        return {}


def leer_agentes(mem, tope=MAX_ARCHIVOS_AGENTES, max_bytes=MAX_BYTES_AGENTE):
    """{nombre: JSON} de `imaginacion/agentes/*.json` (los `tope` más nuevos; ilegibles o enormes, fuera)."""
    carpeta = os.path.join(mem, "imaginacion", "agentes")
    try: nombres = [n for n in os.listdir(carpeta) if n.endswith(".json") and not n.startswith((".", AF.PREFIJO_ENTREGABLE))]
    except OSError: return {}
    def mtime(n):
        try: return os.path.getmtime(os.path.join(carpeta, n))
        except OSError: return 0
    fuera = {}
    for n in sorted(sorted(nombres, key=mtime, reverse=True)[:tope]):
        ruta = os.path.join(carpeta, n)
        try:
            if os.path.getsize(ruta) > max_bytes: continue
            with open(ruta, encoding="utf-8") as f: fuera[n] = json.load(f)
        except (OSError, ValueError): continue
    return fuera


def _agente_referencias(raiz, ahora):
    """`agente_referencias_diseno.ciclo(raiz, ahora)` si ese módulo existe; None si no hay agente."""
    try:
        import agente_referencias_diseno as A
    except Exception:
        return None
    f = getattr(A, "ciclo", None)
    if not callable(f): return None
    r = f(raiz, ahora)
    return {"ok": True} if r is None else r


def _agente_alcance(raiz, ahora):
    """`agente_alcance.ciclo(raiz, ahora)` si ese módulo existe; None si no hay agente de alcance."""
    try:
        import agente_alcance as A
    except Exception:
        return None
    f = getattr(A, "ciclo", None)
    if not callable(f): return None
    r = f(raiz, ahora)
    return {"ok": True} if r is None else r


def _es_alcance(p):
    """Un borrador del agente de alcance: su destino es SIEMPRE la aprobación de una persona (R2, R8)."""
    return str(p.get("agente") or "").strip().lower() == "alcance"


def _consejo_jev(p):
    """Jev de consejero por la puerta común (decidir.py): ¿se integra sola? Solo puede vetar (p ≥ 0,8);
    si calla (sin motor, sin crédito, apagado), None y manda la regla."""
    try:
        import decidir
        estado = {k: p.get(k) for k in ("titulo", "fuente", "tipo", "archivos", "utilidad", "importancia", "motivo")}
        estado["cuerpo"] = str(p.get("cuerpo") or "")[:1500]
        # (1103) Se pregunta por el MÉRITO. Antes: «¿integrarla SOLA, sin que Alex la mire?», y un modelo casi siempre dice
        # «no» (p ≈ 0,92 en las 23 buenas del 02-11). Lo de Alex, lo alto y lo crítico ya lo apartan las reglas antes.
        d = decidir.consultar("si-no", estado, "¿Esta propuesta de la imaginación es concreta y útil para StarSeed, y la puede "
                              "hacer el enjambre con sus puertas (tsc, pruebas y revisión)? Responde «no» solo si es ruido, "
                              "repetida, inventada o dañina. Sí = es buena.", regla="sí", quien="director-autodesarrollo",
                              dominio="imaginacion", espera_turno=5)
    except Exception:
        return None
    if d.get("medio") == "regla" or d.get("p") is None: return None
    return {"p": round(1 - float(d["p"]), 4), "veta": True} if d.get("respuesta") == "no" else {"p": float(d["p"])}


def _consejo_con_memoria(consejo, firma):
    """Jev con memoria (Ola 1029B): toda «nueva» se revisa cada ciclo, y si Jev ya respondió a esta
    propuesta con la misma firma de reglas no se le vuelve a preguntar (se repite su respuesta, veta o
    calla); con otra firma se vuelve a consultar. La respuesta queda en `p["jev"]` y sobrevive al ciclo."""
    def consejero(p):
        memo = p.get("jev")
        if isinstance(memo, dict) and memo.get("firma") == firma: return memo.get("aviso")
        try: aviso = consejo(p)
        except Exception: aviso = None
        # solo lo que la decisión lee (p, veta, prioridad, ajuste): JSON seguro por si el consejo mete algo raro
        p["jev"] = {"firma": firma, "aviso": {k: aviso[k] for k in ("p", "prob", "veta", "veto", "acc", "accion", "prioridad", "ajuste")
                                              if isinstance(aviso, dict) and k in aviso} if isinstance(aviso, dict) else None}
        return aviso
    return consejero


TIPO_ASTRAURA = {"creacion": "creation", "rama": "branch", "creation": "creation", "branch": "branch"}  # director → backend 1.58


def item_astraura(p):
    """{item_id, item_type} del backend 1.58 (como `itemAstraura` en imaginacion-servidor.ts), o None."""
    o = p.get("origen") if isinstance(p.get("origen"), dict) else {}
    tipo = TIPO_ASTRAURA.get(str(o.get("tipo") or ""))
    return {"item_id": o["id"], "item_type": tipo} if p.get("fuente") == "astraura" and isinstance(o.get("id"), str) and o["id"] and tipo else None


def _aplicar_astraura_real(item):
    """POST /api/imagination/action {…, action: apply} al backend 1.58 local: None si lo aplicó, o el error honesto."""
    base = os.environ.get("ASTRAURA_158_URL", "http://127.0.0.1:8000").rstrip("/")
    peticion = urllib.request.Request(base + "/api/imagination/action", data=json.dumps(dict(item, action="apply")).encode("utf-8"),
                                      headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(peticion, timeout=8) as r:
            try: j = json.load(r)
            except ValueError: j = None
    except urllib.error.HTTPError as e:
        return "el backend 1.58 respondió HTTP %d" % e.code
    except Exception:
        return "el backend 1.58 no responde"
    if isinstance(j, dict) and (j.get("success") is False or j.get("ok") is False):
        return "el backend 1.58 no la aplicó (%s)" % (str(j.get("error") or "sin motivo")[:160])
    return None


def _evaluar(p, aj, existe, consejo):
    """Utilidad (la de su vía), importancia y destino con el automático. No cambia el estado."""
    if _es_alcance(p):  # R2/R8: ni el automático ni Jev mueven un borrador de mensaje
        p["utilidad"], p["motivo"] = AD.utilidad_propuesta(p, existe)
        p["importancia"], p["via"] = "alta", "entregable"
        return {"destino": "esperando-aprobacion", "aprobacion_diff": False, "notas": "",
                "motivo": "borrador de alcance: siempre espera la aprobación de una persona y nunca se envía solo (R2/R8)"}
    p["utilidad"], p["motivo"] = AD.utilidad_propuesta(p, existe)
    p["importancia"] = AD.importancia_visible(AD.importancia(p, existe))  # Ola 1102: la misma que decide `automatica`
    p["via"] = AD.via(p, existe)
    return AD.automatica(p, aj, existe, consejo)


def _aplicar(p, dest, ahora_iso, firma=None):
    """Aplica un destino; la reimaginación automática lleva la crítica y lo aprobado solo, quién y cuándo."""
    antes = p.get("estado")
    p.update(aprobacion_diff=dest["aprobacion_diff"], motivo_destino=dest["motivo"])
    if dest["destino"] == "descartada": p["motivo"] = dest["motivo"]  # estado y motivo, sin contradecirse
    if dest["destino"] == "reimaginando": AR.pedir(p, dest["notas"], p.get("referencias") or [], "automatica", ahora_iso)
    else: p["estado"] = dest["destino"]
    if dest["destino"] == "aprobada": p.update(aprobada_por="automatica", decidida=ahora_iso)
    if p["estado"] != antes or not p.get("t"): p["t"] = ahora_iso
    if firma: p["auto_firma"] = firma
    return p


def _motivo_de_pregunta(p, d):
    """Una «nueva» cuyo motivo ya dice «→ pregunta» (lo escribió otro proceso o una decisión anterior)
    acaba en «pregunta»: el estado no contradice lo que ya se sabía, aunque el destino la siga haciendo
    girar (con el automático entero apagado, por ejemplo). PURA."""
    if d["destino"] == "pregunta" or p.get("estado") != "nueva" or "→ pregunta" not in str(p.get("motivo") or ""):
        return d
    return {"destino": "pregunta", "aprobacion_diff": False, "notas": "", "motivo": p["motivo"]}


def _aplazar(p, motivo, ahora_iso):
    """Le toca reimaginarse sola pero no tiene turno: «nueva» y SIN firma, así se vuelve a mirar el próximo ciclo."""
    antes = p.get("estado")
    p.update(estado="nueva", aprobacion_diff=False, motivo_destino=motivo)
    if antes != "nueva" or not p.get("t"): p["t"] = ahora_iso
    return p


def _en_vuelo_automatico(propuestas):
    return sum(1 for p in propuestas if p.get("estado") == "reimaginando"
               and (p.get("reimaginacion") or {}).get("por") != "alex" and not (p.get("reimaginacion") or {}).get("recibida"))


def _arreglar_estados(propuestas, iso):
    """Un estado y su motivo no pueden contradecirse: una descartada vieja que solo decía «→ pregunta»
    se explica por qué se descartó o vuelve a «pregunta». Devuelve cuántas arregló."""
    n = 0
    for p in propuestas:
        arreglo = AD.arreglo_de_estado(p)
        if not arreglo: continue
        antes = p.get("estado"); p.update(arreglo)
        if p.get("estado") != antes: p["t"] = iso
        n += 1
    return n


def _agrupar_familias(propuestas, iso):
    """La misma idea repetida por archivo no crea otra decisión: la nueva se añade a `variantes` de la
    primera y queda «agrupada» (sin contar en «por decidir»). Devuelve cuántas agrupó."""
    n = 0
    for p, prim in AD.agrupar(propuestas):
        if _es_alcance(p) or _es_alcance(prim): continue  # ningún borrador de alcance se agrupa solo
        variantes = prim.setdefault("variantes", [])
        if p.get("id") and not any(v.get("id") == p.get("id") for v in variantes) and len(variantes) < AD.MAX_VARIANTES:
            variantes.append({"id": p.get("id"), "titulo": p.get("titulo"), "archivos": AD._archivos(p)[:3]})
        prim["n_variantes"] = len(variantes)
        p.update(estado="agrupada", agrupada_en=prim.get("id"), t=iso,
                 motivo_destino="misma idea que %s con otro archivo: la decides una sola vez" % prim.get("id"))
        n += 1
    return n


def _decidir_lote(previas, nuevas, aj, existe, consejo, iso, firma):
    """Decide lo nuevo y lo pendiente: toda «nueva», cada ciclo; lo demás, con el botón encendido y otra
    firma; antes, las duplicadas y las variantes de una misma familia. Las reimaginaciones automáticas
    nuevas tienen tope por ciclo y en vuelo (las de más importancia y más recientes primero); lo que no
    cabe se aplaza."""
    reparto, candidatas = Counter(), []
    for p in nuevas:
        if p["id"] in previas: continue
        AR.enlazar(p, previas, iso)  # una versión reimaginada: v n+1 y la vieja pasa a «reimaginada»
        p.setdefault("estado", "nueva")
        previas[p["id"]] = p; candidatas.append(p)
    _arreglar_estados(previas.values(), iso)
    if firma:  # el botón encendido (o cambiado) también decide lo que ya esperaba en la lista
        for p, queda in AD.duplicadas(list(previas.values())):
            if _es_alcance(p) or _es_alcance(previas.get(queda) or {}): continue  # cada borrador espera su visto bueno
            _aplicar(p, {"destino": "descartada", "aprobacion_diff": False, "notas": "", "motivo": "duplicada de %s" % queda}, iso, firma)
            p["duplicada_de"] = queda; reparto["duplicadas"] += 1
    agrupadas = _agrupar_familias(previas.values(), iso)
    if agrupadas: reparto["agrupadas"] += agrupadas
    if firma:
        ya = {id(p) for p in candidatas}
        candidatas += [p for p in previas.values() if id(p) not in ya and p.get("estado") in REVISABLES
                       and p.get("fuente") in AD.FUENTES_AUTO and p.get("auto_firma") != firma]
    # Ola 1029B: toda «nueva» entra a decidirse en cada ciclo, cambie o no la firma: lo que otro proceso
    # escribió como «nueva» (o un aplazamiento) no se queda sin decisión más de un ciclo.
    ya_n = {id(p) for p in candidatas}
    candidatas += [p for p in previas.values() if id(p) not in ya_n and p.get("estado") == "nueva"
                   and p.get("fuente") in AD.FUENTES_AUTO]
    evaluadas = [(p, _motivo_de_pregunta(p, _evaluar(p, aj, existe, consejo)))
                 for p in candidatas if p.get("estado") not in ("descartada", "agrupada")]
    cupo = max(0, min(AD.TOPE_POR_CICLO, AD.MAX_EN_VUELO - _en_vuelo_automatico(previas.values())))
    turno = {id(p) for p in AD.orden_reimaginar([p for p, d in evaluadas if d["destino"] == "reimaginando"])[:cupo]}
    for p, d in evaluadas:
        if d["destino"] == "reimaginando" and id(p) not in turno:
            _aplazar(p, "le toca reimaginarse sola; espera turno (como mucho %d nuevas por ciclo y %d en vuelo)"
                     % (AD.TOPE_POR_CICLO, AD.MAX_EN_VUELO), iso)
            reparto["aplazadas"] += 1
            continue
        _aplicar(p, d, iso, firma); reparto[d["destino"]] += 1
    return reparto


def _revisar_entregables(propuestas, raiz, ahora, iso):
    """Lo que el analista ya dejó para cada entregable encargado (o lo que caducó)."""
    hechos = Counter()
    for p in propuestas:
        e = p.get("entregable") if isinstance(p.get("entregable"), dict) else {}
        if p.get("estado") != "encargada" or not e.get("tarea") or e.get("recibido"): continue
        salida = str(e.get("salida") or "")
        segura = salida.startswith(AR.CARPETA_AGENTES.replace(os.sep, "/") + "/") and ".." not in salida.split("/")
        doc = _json(os.path.join(raiz, salida), None) if segura else None
        hechos[AE.revisar(p, doc, ahora, iso)] += 1
    return hechos


def _aplicar_en_astraura(lista, aplicar, iso):
    """Aplica en el backend 1.58 lo que integró la automática (≤ tope por ciclo). Si no responde es un fallo del
    medio: no cuenta contra la propuesta y el resto espera al próximo ciclo. Tres rechazos de verdad (o sin ítem
    del backend) → vuelve a la lista de Alex. Devuelve cuántas se aplicaron."""
    n = 0
    for p in lista[:AD.TOPE_POR_CICLO]:
        item = item_astraura(p)
        fallo = (aplicar or _aplicar_astraura_real)(item) if item else "no trae su ítem del backend 1.58"
        if fallo is None:
            p.update(estado="hecha", aplicada=iso, t=iso, motivo_destino="aplicada en Astraura por la automática"); n += 1
            continue
        if "no responde" in fallo:
            p["motivo_destino"] = "Astraura no responde: se aplica cuando vuelva"
            break
        p["intentos_aplicar"] = int(p.get("intentos_aplicar") or 0) + 1
        if not item or p["intentos_aplicar"] >= 3:
            p.pop("aprobada_por", None)
            p.update(estado="pregunta", t=iso, motivo_destino="Astraura no la aplicó (%s): queda en tu lista" % fallo)
        else:
            p["motivo_destino"] = "Astraura no la aplicó todavía (%s): se reintenta en el próximo ciclo" % fallo
    return n


def _artefacto_ola(tareas, propuestas):
    """Serializa la ola como texto para la revisión EGM."""
    lineas = ["OLA DE TAREAS PROPUESTA POR LA IMAGINACIÓN", "=" * 50, ""]
    for i, (tarea, prop) in enumerate(zip(tareas, propuestas), 1):
        lineas.append(f"TAREA {i}: {tarea['titulo']} (ID: {tarea['id']})")
        lineas.append(f"  Archivos: {', '.join(tarea['archivos']) if tarea['archivos'] else '(ninguno)'}")
        lineas.append(f"  Prompt: {tarea['prompt'][:200]}...")
        if prop.get("cuerpo"):
            lineas.append(f"  Contexto: {prop['cuerpo'][:300]}...")
        lineas.append("")
    return "\n".join(lineas)


def _revision_egm(artefacto, llamar_egm):
    """Ejecuta la revisión EGM con peces. Devuelve dict con pasa, bloqueantes, error."""
    if llamar_egm is None:
        # Sin función de llamada = sin modelos disponibles = pasa como hoy
        return {"pasa": True, "bloqueantes": [], "error": None, "objeciones": [], "por_modelo": {}}
    try:
        return EGM.revisar(artefacto, "ola", llamar_egm, n=2)
    except Exception:
        return {"pasa": True, "bloqueantes": [], "error": "error de red o modelo", "objeciones": [], "por_modelo": {}}


def id_de_tarea(pid, tope=40):
    """PURA (1106I): id de la tarea de una propuesta, solo [A-Za-z0-9_-]. Con espacios, Cloudroom rechazaba el
    `--request-id` (HTTP 400, «must match pattern /^[a-zA-Z0-9_-]{1,64}$/») y git no admite la rama."""
    s = unicodedata.normalize("NFKD", str(pid)).encode("ascii", "ignore").decode()
    s = re.sub(r"-{2,}", "-", re.sub(r"[^A-Za-z0-9_-]+", "-", s)).strip("-")
    return ("IMG-" + s[:tope]).rstrip("-")


def _canon(x):
    if isinstance(x, float) and x.is_integer():
        return int(x)
    if isinstance(x, dict):
        return {k: _canon(v) for k, v in x.items()}
    if isinstance(x, list):
        return [_canon(v) for v in x]
    return x


def huella_propuesta(p):
    """PURA (1106): huella estable de una propuesta (1.0 de Python y 1 de JavaScript valen lo mismo)."""
    return json.dumps(_canon(p), sort_keys=True, ensure_ascii=False)


def fusionar_con_disco(inicial, propuestas, disco_crudo):
    """PURA (1106): lo que otro cambió en propuestas.json MIENTRAS corría el ciclo (Alex integrando, rechazando o
    reimaginando desde Genesis) manda sobre la copia del ciclo, y lo que nació en el disco se conserva. Sin esto, el
    ciclo (minutos: Jev, EGM, Astraura) reescribía el archivo entero y esas decisiones se perdían.
    `inicial` = {id: huella_propuesta(p)} al leer; `disco_crudo` = lo que hay ahora (lista o {propuestas: [...]})."""
    disco = disco_crudo if isinstance(disco_crudo, list) else (
        disco_crudo.get("propuestas") if isinstance(disco_crudo, dict) else None) or []
    en_disco = {p["id"]: p for p in disco if isinstance(p, dict) and p.get("id")}
    salida, vistos = [], set()
    for p in propuestas:
        pid = p.get("id") if isinstance(p, dict) else None
        d = en_disco.get(pid) if pid else None
        cambiada_fuera = d is not None and pid in inicial and huella_propuesta(d) != inicial[pid]
        salida.append(d if cambiada_fuera else p)
        if pid:
            vistos.add(pid)
    salida += [d for i, d in en_disco.items() if i not in vistos and i not in inicial]
    return salida


def ciclo(seco=False, ahora=None, capacidad=-1, home=None, raiz=None, lanzador_diario=None, lanzador_profundo=None,
          existe_ruta=None, datos=None, avisar=None, consejo=None, agente_referencias=None, aplicar_astraura=None,
          a_la_flota=None, agente_alcance=None, llamar_egm=None):
    """Un ciclo (§5). `datos`: {diaria, profunda, astraura, directores, agentes} para no leer disco ni red.
    `consejo(p)`: Jev para el veto de lo que se integraría solo (None = solo la regla). `agente_referencias(raiz,
    ahora)`: el agente de referencias de diseño (por defecto, el módulo si existe); devuelve None si no hay agente.
    `agente_alcance(raiz, ahora)`: el agente de alcance (por defecto, `agente_alcance.ciclo` si existe).
    `aplicar_astraura(item)`: aplica una creación en el backend 1.58 (None si lo hizo, o el error); por defecto, HTTP.
    `a_la_flota(raiz, tareas)`: entrega el análisis encolado al orquestador vivo (por defecto `AR.a_la_flota`).
    `llamar_egm(prompt, modelo)`: función para llamar a modelos en la revisión EGM (None = usa modelos por defecto).
    Ola 1025S: reimaginar y preparar entregables se encargan con `AL.toca_analizar` (análisis por HTTP con su
    propio tope), no con `toca_ejecutar`: la presión de memoria de la Mac frenaba toda reimaginación."""
    ahora, home, raiz = ahora or datetime.now(), home or os.path.expanduser("~/.starseed"), raiz or RAIZ
    mem, hoy = os.path.join(raiz, "starseed_memory_root"), (ahora or datetime.now()).strftime("%Y-%m-%d")
    with cerrojo(os.path.join(home, "cerrojos", "autodesarrollo.lock")) as libre:
        if not libre: return {"toca_ejecutar": False, "motivo_toca": "otro ciclo en marcha", "autodesarrolladas": 0}
        aj = AL.validar_ajustes(_json(os.path.join(home, "autodesarrollo.json"), {}))
        cap = medir_capacidad(home) if capacidad == -1 else capacidad
        if cap is None and aj["horario"]["modo"] == "inteligente":
            toca, motivo = False, "sin dato de capacidad: en modo inteligente no se ejecuta"
        else: toca, motivo = AL.toca_ejecutar(ahora, aj["horario"], cap or {})
        # Liderazgo: en Mac solo se encarga si es líder; en A1 el arriendo lo garantiza
        try:
            import lider_direccion as LD, autocuracion_mando as AC
            lider_info = LD.soy_lider()
        except Exception:
            lider_info = None
        try:
            dirijo, porque_lider = AC.decidir_lider(lider_info, ahora.timestamp())
        except Exception:
            dirijo, porque_lider = False, "error al decidir liderazgo"
        if toca and not dirijo:
            toca = False
            motivo = "no soy líder de dirección (%s): no se encarga en Mac" % porque_lider
        toca_an, motivo_an = (True, motivo) if toca else AL.toca_analizar(ahora, aj["horario"], cap)
        est_ruta = os.path.join(home, "autodesarrollo-estado.json"); est = _json(est_ruta, {})
        lanzo = []
        if toca and not seco:
            informe = os.path.join(mem, "dream", f"sugerencias-{hoy}.md")
            if est.get("diaria") != hoy and not os.path.isfile(informe):
                if (lanzador_diario or (lambda: _lanzar_real("bash", os.path.expanduser("~/.hermes/scripts/starseed-dream.sh"))))():
                    est["diaria"] = hoy; lanzo.append("diaria")
            dias, ult = aj["profunda"]["cada_dias"], est.get("profunda")
            lp = lanzador_profundo or (lambda *a: _lanzar_real("python3", os.path.join(AQUI, "suenos.py"), *a))
            if est.get("consolidar_pendiente") and lp("consolidar", "--sin-telegram"):
                est["consolidar_pendiente"] = False; lanzo.append("consolidar")
            elif dias > 0 and (not ult or ahora - datetime.fromisoformat(ult) >= timedelta(days=dias)) and lp("lanzar"):
                est["profunda"], est["consolidar_pendiente"] = ahora.isoformat(), True; lanzo.append("profunda")
            try: ref = (agente_referencias or _agente_referencias)(raiz, ahora)
            except Exception as e: ref = {"ok": False, "error": type(e).__name__}
            if ref is not None: lanzo.append("referencias-diseno")
            try: alc = (agente_alcance or _agente_alcance)(raiz, ahora)
            except Exception as e: alc = {"ok": False, "error": type(e).__name__}
            if alc is not None: lanzo.append("alcance")
            _escribir(est_ruta, est)
        d, f = datos or {}, aj["fuentes"]
        enc = _json(os.path.join(home, "dream-encargado.json"), {}); claves = enc.get("claves", []) if isinstance(enc, dict) else list(enc)
        if "diaria" not in d and f["diaria"]:
            try: d["diaria"] = open(os.path.join(mem, "dream", f"sugerencias-{hoy}.md"), encoding="utf-8").read()
            except OSError: pass
        fecha_profunda = hoy
        if "profunda" not in d and f["profunda"]:
            # (1103) La última sesión consolidada de la semana, con SU fecha (antes solo la de HOY: nunca entraba).
            fp, d["profunda"] = ultima_profunda(os.path.join(mem, "dream", "profundo"), ahora)
            fecha_profunda = fp or hoy
        if "astraura" not in d and f["astraura"]: d["astraura"] = _astraura()
        if "agentes" not in d and f["agentes"]: d["agentes"] = leer_agentes(mem)
        pr = os.path.join(mem, "imaginacion", "propuestas.json")
        crudo = _json(pr, {})  # lista o {propuestas: [...]}: se respeta la forma que haya (contrato §1)
        lista = crudo if isinstance(crudo, list) else (crudo.get("propuestas") if isinstance(crudo, dict) else None) or []
        previas = {p["id"]: p for p in lista if isinstance(p, dict) and p.get("id")}
        inicial = {k: huella_propuesta(v) for k, v in previas.items()}  # (1106) para fusionar con el disco al final
        astr, filtro = (AF.de_astraura(d.get("astraura") or {}, hoy, claves) if f["astraura"] else []), None
        if astr:  # Ola 1102 (IMG1102A): el filtro de entrada de Astraura decide antes de crear la propuesta
            astr, filtro = AF.filtrar_astraura(astr, previas.values(), hoy, crudo.get("filtro_astraura") if isinstance(crudo, dict) else None)
        nuevas = (AF.de_diaria(d.get("diaria", ""), hoy, claves) if f["diaria"] else []) + \
                 (AF.de_profunda(d.get("profunda") or {}, fecha_profunda, claves) if f["profunda"] else []) + astr + \
                 (AF.de_directores(d.get("directores") or {}, hoy, claves) if f["directores"] else []) + \
                 (AF.de_agentes(d.get("agentes") or {}, hoy, claves, AR.esperadas(previas.values())) if f["agentes"] else [])
        existe = existe_ruta or (lambda r: os.path.isfile(r if os.path.isabs(r) else os.path.join(raiz, r)))
        iso, au = ahora.isoformat(), aj["auto"]
        firma = AD.firma(aj) if au["aprobar"] or au["reimaginar"] else None
        decisiones = _decidir_lote(previas, nuevas, aj, existe, _consejo_con_memoria(consejo, firma) if consejo else None, iso, firma)
        for p in AR.caducadas(previas.values(), ahora):
            AR.devolver(p, f"la reimaginación no llegó en {AR.CADUCA_H} h: queda en tu lista", iso)
        propuestas = list(previas.values())
        if au["reimaginar"]:  # (1106) Alex pidió otra versión sin notas: con la automática activa, las escribe el director
            for p in propuestas:
                if AR.necesita_notas(p):
                    AR.notas_del_director(p, AD.critica(p, au["umbral"], existe))
        reim, devueltas = AR.pendientes(propuestas, au["max_reimaginaciones"], ahora)
        for p in devueltas:
            AR.devolver(p, f"tope de {au['max_reimaginaciones']} reimaginación(es) por cadena: queda en tu lista", iso)
        # Lo que pidió Alex se encarga siempre; lo de la automática, como mucho el tope por ciclo.
        por_tarea = {AR.id_tarea(p): p for p in propuestas if p.get("estado") == "reimaginando"}
        auto_r = AD.orden_reimaginar([por_tarea[t["id"]] for t in reim if t.get("por") != "alex" and t["id"] in por_tarea])
        elegidas_r = {AR.id_tarea(p) for p in auto_r[:AD.TOPE_POR_CICLO]}
        reim = [t for t in reim if t.get("por") == "alex" or t["id"] in elegidas_r] if toca_an else []
        entregables = _revisar_entregables(propuestas, raiz, ahora, iso)
        auto = AD.cuantas([p for p in propuestas if p.get("estado") == "autodesarrollo"], aj["rango"], AD.umbral_efectivo(aj))["elegidas"]
        aprobadas = {v: [] for v in AD.VIAS}
        for p in propuestas:
            if p.get("estado") != "aprobada":
                continue
            if _es_alcance(p):  # aprobada es «lista para el panel de alcance», nunca una tarea (R2)
                if not p.get("envio"): p["envio"] = "pendiente"
                p["motivo_destino"] = "borrador de alcance aprobado: espera el envío del panel (R2)"
                continue
            if not p.get("tarea"):
                aprobadas[p.get("via") if p.get("via") in AD.VIAS else AD.via(p, existe)].append(p)
        for p in aprobadas["astraura"]:  # integrada por Alex desde Genesis: el servidor ya la aplicó en su backend
            if p.get("aprobada_por") != "automatica":
                p.update(estado="hecha", aplicada=p.get("decidida") or iso, t=iso, motivo_destino="aplicada en Astraura al integrarla desde Genesis")
        astraura = [p for p in aprobadas["astraura"] if p.get("estado") == "aprobada"]
        aplicadas = _aplicar_en_astraura(astraura, aplicar_astraura, iso) if toca and not seco else 0
        cupo_e = max(0, min(AD.TOPE_POR_CICLO, AD.MAX_EN_VUELO - AE.en_vuelo(propuestas))) if toca_an else 0
        ent = AD.orden_reimaginar(aprobadas["entregable"])[:cupo_e]
        tareas_e = [AE.tarea(p, ahora) for p in ent]
        # Ola 1102: lo que aprobó sola la automática (carril de bajo riesgo) entra con el máximo del rango y una por archivo.
        aprobadas_c = AD.turno_de_las_solas(aprobadas["codigo"], aj["rango"]["max"] - len(auto))
        cola = [p for p in (auto + aprobadas_c) if not _es_alcance(p)] if toca else []
        fr = [x for x in aj["horario"]["franjas"] if x["desde"] > ahora.strftime("%H:%M")] if aj["horario"]["modo"] == "franjas" else []
        if cola and aj["horario"]["repartir"] and fr: cola = cola[:AL.lotes(len(cola), len(fr) + 1)[0]]
        nombre = f"cola-imaginacion-{ahora.strftime('%Y%m%d-%H%M')}"
        tareas = [{"id": id_de_tarea(p["id"]), "titulo": p["titulo"], "area": "imaginacion",
                   "archivos": (p.get("archivos") or [])[:3], "depende": [], "prompt": PROMPT.format(t=p["titulo"], c=p.get("cuerpo", "")[:600]),
                   **({"aprobacion": True} if p.get("aprobacion_diff") else {})} for p in cola]
        esperan = [p for p in propuestas if p.get("estado") == "esperando-aprobacion"]
        cola_r = cola_e = flota = None
        ola_bloqueada = False
        if tareas and not seco:
            # Revisión EGM (Elefante-Goldfish-Model) antes de encolar la ola (§2 architecture/repos-libreria-1104.md)
            artefacto = _artefacto_ola(tareas, cola)
            revision = _revision_egm(artefacto, llamar_egm)
            if revision.get("error"):
                # Error de red/modelo: se encola como hoy
                pass
            elif not revision.get("pasa", True):
                # Hay objeciones 'bloquea': no se encola, se anota en las propuestas
                bloqueantes = revision.get("bloqueantes", [])
                for p in cola:
                    p["estado"] = "descartada"
                    p["motivo_destino"] = "EGM: " + "; ".join(b["texto"] for b in bloqueantes)
                ola_bloqueada = True
                tareas = []  # no se encola nada
        if not seco and not ola_bloqueada:
            if tareas_e:
                cola_e = AE.encolar(mem, tareas_e, ahora)
                for p, t in zip(ent, tareas_e): AE.marcar_encargada(p, t, cola_e, iso)
            for p, t in zip(cola, tareas): p["estado"], p["tarea"] = "encargada", t["id"]
            if tareas:
                _escribir(os.path.join(mem, "olas", nombre + ".json"), tareas)
                _escribir(os.path.join(home, "dream-encargado.json"), {"claves": sorted(set(claves) | {p["id"].split(":", 1)[-1] for p in cola})})
            if reim:
                cola_r = AR.encolar(mem, reim, ahora)
                por_tarea = {AR.id_tarea(p): p for p in propuestas if p.get("estado") == "reimaginando"}
                for t in reim: AR.marcar_encolada(por_tarea[t["id"]], t, cola_r, iso)
        # Las propuestas se escriben siempre (incluso si la ola fue bloqueada por EGM)
        if not seco:
            propuestas = fusionar_con_disco(inicial, propuestas, _json(pr, {}))  # (1106) no pisar lo decidido entretanto
            _escribir(pr, propuestas if isinstance(crudo, list) else {**crudo, "actualizado": iso, "propuestas": propuestas,
                                                                   **({"filtro_astraura": filtro} if filtro else {})})
            # Ola 1025S: lo encolado (de este ciclo y de los anteriores que siguen esperando) va al orquestador vivo.
            ids_f = {(p.get("reimaginacion") or {}).get("tarea") for p in propuestas if p.get("estado") == "reimaginando"}
            ids_f |= {(p.get("entregable") or {}).get("tarea") for p in propuestas if p.get("estado") == "encargada"}
            ids_f.discard(None)
            if toca_an and ids_f:
                try: flota = (a_la_flota or AR.a_la_flota)(raiz, AR.tareas_esperadas(mem, ids_f, ahora))
                except Exception as e: flota = {"accion": "error", "motivo": type(e).__name__}
            if avisar and (tareas or esperan or reim or tareas_e or aplicadas):
                avisar(f"Imaginación: {len(tareas)} tarea(s) encargada(s), {len(esperan)} esperando tu aprobación"
                       + (f", {len(reim)} reimaginándose" if reim else "") + (f", {len(tareas_e)} entregable(s) encargado(s)" if tareas_e else "")
                       + (f", {aplicadas} aplicada(s) en Astraura" if aplicadas else "") + ".", bool(esperan))
        return {"toca_ejecutar": toca, "motivo_toca": motivo, "lanzado": lanzo, "propuestas": len(propuestas), "autodesarrolladas": len(tareas),
                "esperando_aprobacion": len(esperan), "cola": nombre + ".json" if tareas and not seco else None,
                "reimaginando": sum(1 for p in propuestas if p.get("estado") == "reimaginando"),
                "reimaginaciones_encargadas": len(reim) if not seco else 0, "cola_reimaginar": cola_r,
                "decisiones": dict(decisiones), "entregables": dict(entregables),
                "entregables_encargados": len(tareas_e) if not seco else 0, "cola_entregables": cola_e,
                "aplicadas_astraura": aplicadas, "toca_analizar": toca_an, "motivo_analisis": motivo_an,
                "flota": flota, "estados": dict(Counter(p.get("estado") or "nueva" for p in propuestas)),
                "filtro_astraura": {k: v for k, v in filtro.items() if k not in ("por_id", "inventadas")} if filtro else None}


def _avisar_real(texto, telegram):
    try:
        import puente; puente.decir(texto, "imaginacion", "hecho")
    except Exception: pass
    h = telegram and (shutil.which("hermes") or os.path.expanduser("~/.local/bin/hermes"))
    if h and os.path.exists(h):
        try:  # (1102) un Telegram lento no tumba el ciclo: antes salía con rc 1 cada 15 min
            subprocess.run([h, "send", "-t", os.environ.get("STARSEED_TELEGRAM_DESTINO", "telegram:Maggasukha"), "-s", "Imaginación · StarSeed OS", texto], timeout=40, capture_output=True)
        except (subprocess.TimeoutExpired, OSError) as e:
            print("aviso a Telegram sin enviar: %s" % type(e).__name__, flush=True)


def main(argv=None):
    ap = argparse.ArgumentParser(); ap.add_argument("orden", choices=["ciclo"]); ap.add_argument("--seco", action="store_true"); ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv); r = ciclo(seco=a.seco, avisar=_avisar_real, consejo=_consejo_jev)
    print(json.dumps(r, ensure_ascii=False, indent=1) if a.json else f"{r['motivo_toca']} · {r.get('autodesarrolladas', 0)} tarea(s) · {r.get('esperando_aprobacion', 0)} esperando")


if __name__ == "__main__":
    main()
