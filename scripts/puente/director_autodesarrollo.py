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
import argparse, fcntl, json, os, shutil, subprocess, sys, tempfile, urllib.error, urllib.request
from collections import Counter
from contextlib import contextmanager
from datetime import datetime, timedelta

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import autodesarrollo_logica as AL, autodesarrollo_decidir as AD, autodesarrollo_fuentes as AF
import autodesarrollo_reimaginar as AR, autodesarrollo_entregables as AE

RAIZ = os.path.dirname(os.path.dirname(AQUI))
ESTADOS_ALEX = ("aprobada", "rechazada", "pospuesta", "hecha", "descartada")
#: Lo que el automático vuelve a mirar cuando cambian sus ajustes (nunca lo que decidió Alex).
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


def medir_capacidad(home):
    """Gobernador + salud de proveedores. Claves no halladas = sin dato (None): nunca se inventa.
    El A1 y la nube no se miden aquí: cuentan 0 huecos."""
    g, s = _json(os.path.join(home, "gobernador.json"), None), _json(os.path.join(home, "salud-proveedores.json"), None)
    if not isinstance(g, dict) or not isinstance(g.get("maximo"), int) or not isinstance(s, dict): return None
    ocupados = g.get("trabajando", g.get("en_curso", 0)) or 0
    vivos = [k for k, v in s.items() if isinstance(v, dict) and not (v.get("caido") or v.get("estado") in ("caido", "caído", "sin_cupo"))]
    return {"huecos_mac": max(0, g["maximo"] - ocupados), "huecos_a1": 0, "huecos_nube": 0,
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


def _consejo_jev(p):
    """Jev de consejero por la puerta común (decidir.py): ¿se integra sola? Solo puede vetar (p ≥ 0,8);
    si calla (sin motor, sin crédito, apagado), None y manda la regla."""
    try:
        import decidir
        estado = {k: p.get(k) for k in ("titulo", "fuente", "tipo", "archivos", "utilidad", "importancia", "motivo")}
        estado["cuerpo"] = str(p.get("cuerpo") or "")[:1500]
        d = decidir.consultar("si-no", estado, "¿Debe StarSeed integrar SOLA esta propuesta de la imaginación, sin que "
                              "Alex la mire? Sí = integrarla.", regla="sí", quien="director-autodesarrollo",
                              dominio="imaginacion", espera_turno=5)
    except Exception:
        return None
    if d.get("medio") == "regla" or d.get("p") is None: return None
    return {"p": round(1 - float(d["p"]), 4), "veta": True} if d.get("respuesta") == "no" else {"p": float(d["p"])}


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
    p["utilidad"], p["motivo"] = AD.utilidad_propuesta(p, existe)
    p["importancia"] = AD.importancia_visible(AD.importancia(p))
    p["via"] = AD.via(p, existe)
    return AD.automatica(p, aj, existe, consejo)


def _aplicar(p, dest, ahora_iso, firma=None):
    """Aplica un destino; la reimaginación automática lleva la crítica y lo aprobado solo, quién y cuándo."""
    antes = p.get("estado")
    p.update(aprobacion_diff=dest["aprobacion_diff"], motivo_destino=dest["motivo"])
    if dest["destino"] == "reimaginando": AR.pedir(p, dest["notas"], p.get("referencias") or [], "automatica", ahora_iso)
    else: p["estado"] = dest["destino"]
    # Ola 1028: un estado y su motivo no pueden contradecirse; una descartada dice POR QUÉ se descartó.
    if dest["destino"] == "descartada" and dest["motivo"]: p["motivo"] = dest["motivo"]
    if dest["destino"] == "aprobada": p.update(aprobada_por="automatica", decidida=ahora_iso)
    if p["estado"] != antes or not p.get("t"): p["t"] = ahora_iso
    if firma: p["auto_firma"] = firma
    return p


def _aplazar(p, motivo, ahora_iso):
    """Le toca reimaginarse sola pero no tiene turno: «nueva» y SIN firma, así se vuelve a mirar el próximo ciclo."""
    antes = p.get("estado")
    p.update(estado="nueva", aprobacion_diff=False, motivo_destino=motivo)
    if antes != "nueva" or not p.get("t"): p["t"] = ahora_iso
    return p


def _en_vuelo_automatico(propuestas):
    return sum(1 for p in propuestas if p.get("estado") == "reimaginando"
               and (p.get("reimaginacion") or {}).get("por") != "alex" and not (p.get("reimaginacion") or {}).get("recibida"))


def _agrupar_familias(previas):
    """La misma idea repetida por archivo es UNA decisión (Ola 1028): la cabeza de familia guarda sus
    `variantes` (id, título, archivos; máx. 20) y cuenta `n_variantes`; las demás pasan a «agrupada» con
    `agrupada_en` (dejan de contar en «por decidir»). Nada se rechaza ni se borra; Alex decide la familia."""
    cabeceras, variantes = AD.familias(previas.values())
    for cid, listado in cabeceras.items():
        cabeza = previas.get(cid)
        if cabeza and listado: cabeza.update(variantes=listado, n_variantes=len(listado))
    n = 0
    for pid, cid in variantes:
        p = previas.get(pid)
        if p: p.update(estado="agrupada", agrupada_en=cid); n += 1
    return n


def _decidir_lote(previas, nuevas, aj, existe, consejo, iso, firma):
    """Decide lo nuevo y, con el botón encendido, lo pendiente con otra firma; antes, las duplicadas. Las
    reimaginaciones automáticas nuevas tienen tope por ciclo y en vuelo (las de más importancia y más
    recientes primero); lo que no cabe se aplaza. Devuelve el reparto de lo decidido."""
    reparto, candidatas = Counter(), []
    for p in nuevas:
        if p["id"] in previas: continue
        AR.enlazar(p, previas, iso)  # una versión reimaginada: v n+1 y la vieja pasa a «reimaginada»
        p.setdefault("estado", "nueva")
        previas[p["id"]] = p; candidatas.append(p)
    if firma:  # el botón encendido (o cambiado) también decide lo que ya esperaba en la lista
        for p, queda in AD.duplicadas(list(previas.values())):
            _aplicar(p, {"destino": "descartada", "aprobacion_diff": False, "notas": "", "motivo": "duplicada de %s" % queda}, iso, firma)
            p["duplicada_de"] = queda; reparto["duplicadas"] += 1
        ya = {id(p) for p in candidatas}
        candidatas += [p for p in previas.values() if id(p) not in ya and p.get("estado") in REVISABLES
                       and p.get("fuente") in AD.FUENTES_AUTO and p.get("auto_firma") != firma]
    # Ola 1028: una descartada ya no arrastra un «→ pregunta» heredado; y la familia se agrupa siempre
    # (con o sin firma), también las que ya esperaban de una pasada anterior.
    for p in previas.values():
        m = AD.motivo_descartada(p)
        if m: p["motivo"] = m
    n_agrupadas = _agrupar_familias(previas)
    if n_agrupadas: reparto["agrupadas"] += n_agrupadas
    evaluadas = [(p, _evaluar(p, aj, existe, consejo)) for p in candidatas
                 if p.get("estado") not in ("descartada", "agrupada")]
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


def ciclo(seco=False, ahora=None, capacidad=-1, home=None, raiz=None, lanzador_diario=None, lanzador_profundo=None,
          existe_ruta=None, datos=None, avisar=None, consejo=None, agente_referencias=None, aplicar_astraura=None,
          a_la_flota=None):
    """Un ciclo (§5). `datos`: {diaria, profunda, astraura, directores, agentes} para no leer disco ni red.
    `consejo(p)`: Jev para el veto de lo que se integraría solo (None = solo la regla). `agente_referencias(raiz,
    ahora)`: el agente de referencias de diseño (por defecto, el módulo si existe); devuelve None si no hay agente.
    `aplicar_astraura(item)`: aplica una creación en el backend 1.58 (None si lo hizo, o el error); por defecto, HTTP.
    `a_la_flota(raiz, tareas)`: entrega el análisis encolado al orquestador vivo (por defecto `AR.a_la_flota`).
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
            _escribir(est_ruta, est)
        d, f = datos or {}, aj["fuentes"]
        enc = _json(os.path.join(home, "dream-encargado.json"), {}); claves = enc.get("claves", []) if isinstance(enc, dict) else list(enc)
        if "diaria" not in d and f["diaria"]:
            try: d["diaria"] = open(os.path.join(mem, "dream", f"sugerencias-{hoy}.md"), encoding="utf-8").read()
            except OSError: pass
        if "profunda" not in d and f["profunda"]:
            d["profunda"] = _json(os.path.join(mem, "dream", "profundo", hoy, "consolidado.json"), {})
        if "astraura" not in d and f["astraura"]: d["astraura"] = _astraura()
        if "agentes" not in d and f["agentes"]: d["agentes"] = leer_agentes(mem)
        pr = os.path.join(mem, "imaginacion", "propuestas.json")
        crudo = _json(pr, {})  # lista o {propuestas: [...]}: se respeta la forma que haya (contrato §1)
        lista = crudo if isinstance(crudo, list) else (crudo.get("propuestas") if isinstance(crudo, dict) else None) or []
        previas = {p["id"]: p for p in lista if isinstance(p, dict) and p.get("id")}
        nuevas = (AF.de_diaria(d.get("diaria", ""), hoy, claves) if f["diaria"] else []) + \
                 (AF.de_profunda(d.get("profunda") or {}, hoy, claves) if f["profunda"] else []) + \
                 (AF.de_astraura(d.get("astraura") or {}, hoy, claves) if f["astraura"] else []) + \
                 (AF.de_directores(d.get("directores") or {}, hoy, claves) if f["directores"] else []) + \
                 (AF.de_agentes(d.get("agentes") or {}, hoy, claves, AR.esperadas(previas.values())) if f["agentes"] else [])
        existe = existe_ruta or (lambda r: os.path.isfile(r if os.path.isabs(r) else os.path.join(raiz, r)))
        iso, au = ahora.isoformat(), aj["auto"]
        firma = AD.firma(aj) if au["aprobar"] or au["reimaginar"] else None
        decisiones = _decidir_lote(previas, nuevas, aj, existe, consejo, iso, firma)
        for p in AR.caducadas(previas.values(), ahora):
            AR.devolver(p, f"la reimaginación no llegó en {AR.CADUCA_H} h: queda en tu lista", iso)
        propuestas = list(previas.values())
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
            if p.get("estado") == "aprobada" and not p.get("tarea"):
                aprobadas[p.get("via") if p.get("via") in AD.VIAS else AD.via(p, existe)].append(p)
        for p in aprobadas["astraura"]:  # integrada por Alex desde Genesis: el servidor ya la aplicó en su backend
            if p.get("aprobada_por") != "automatica":
                p.update(estado="hecha", aplicada=p.get("decidida") or iso, t=iso, motivo_destino="aplicada en Astraura al integrarla desde Genesis")
        astraura = [p for p in aprobadas["astraura"] if p.get("estado") == "aprobada"]
        aplicadas = _aplicar_en_astraura(astraura, aplicar_astraura, iso) if toca and not seco else 0
        cupo_e = max(0, min(AD.TOPE_POR_CICLO, AD.MAX_EN_VUELO - AE.en_vuelo(propuestas))) if toca_an else 0
        ent = AD.orden_reimaginar(aprobadas["entregable"])[:cupo_e]
        tareas_e = [AE.tarea(p, ahora) for p in ent]
        cola = (auto + aprobadas["codigo"]) if toca else []
        fr = [x for x in aj["horario"]["franjas"] if x["desde"] > ahora.strftime("%H:%M")] if aj["horario"]["modo"] == "franjas" else []
        if cola and aj["horario"]["repartir"] and fr: cola = cola[:AL.lotes(len(cola), len(fr) + 1)[0]]
        nombre = f"cola-imaginacion-{ahora.strftime('%Y%m%d-%H%M')}"
        tareas = [{"id": "IMG-" + p["id"].replace(":", "-")[:40], "titulo": p["titulo"], "area": "imaginacion",
                   "archivos": (p.get("archivos") or [])[:3], "depende": [], "prompt": PROMPT.format(t=p["titulo"], c=p.get("cuerpo", "")[:600]),
                   **({"aprobacion": True} if p.get("aprobacion_diff") else {})} for p in cola]
        esperan = [p for p in propuestas if p.get("estado") == "esperando-aprobacion"]
        cola_r = cola_e = flota = None
        if not seco:
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
            _escribir(pr, propuestas if isinstance(crudo, list) else {**crudo, "actualizado": iso, "propuestas": propuestas})
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
                "flota": flota, "estados": dict(Counter(p.get("estado") or "nueva" for p in propuestas))}


def _avisar_real(texto, telegram):
    try:
        import puente; puente.decir(texto, "imaginacion", "hecho")
    except Exception: pass
    h = telegram and (shutil.which("hermes") or os.path.expanduser("~/.local/bin/hermes"))
    if h and os.path.exists(h):
        subprocess.run([h, "send", "-t", os.environ.get("STARSEED_TELEGRAM_DESTINO", "telegram:Maggasukha"), "-s", "Imaginación · StarSeed OS", texto], timeout=40, capture_output=True)


def main(argv=None):
    ap = argparse.ArgumentParser(); ap.add_argument("orden", choices=["ciclo"]); ap.add_argument("--seco", action="store_true"); ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv); r = ciclo(seco=a.seco, avisar=_avisar_real, consejo=_consejo_jev)
    print(json.dumps(r, ensure_ascii=False, indent=1) if a.json else f"{r['motivo_toca']} · {r.get('autodesarrolladas', 0)} tarea(s) · {r.get('esperando_aprobacion', 0)} esperando")


if __name__ == "__main__":
    main()
