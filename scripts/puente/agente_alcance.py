# -*- coding: utf-8 -*-
"""Agente de alcance (INV1025M): plan, encargo a la flota y recogida de borradores.

Cada 20 h elige ≤ 2 objetivos, funde los encargos en `olas/cola-suenos-alcance.json`
(nunca lanza un orquestador) y recoge lo que devuelve la flota. Normaliza y VALIDA:
título ≤ 200, cuerpo ≤ 8000 y mensaje ≤ 220 palabras; referencias https de la ficha o de
StarSeed; cada afirmación con fuente de la ficha; sin adjuntos, píxeles ni dirección;
importancia «alta» y estado «esperando-aprobacion» (R2, R5, R7, R8). Estado solo ids/fechas.
"""
from __future__ import annotations
import argparse, json, os, re, sys
from datetime import timedelta
from urllib.parse import urlparse
import agente_referencias_diseno as R, alcance_objetivos as AO, alcance_plan as P

AGENTE, REL_ESTADO = "alcance", "starseed_memory_root/imaginacion/agente-alcance/estado.json"
REL_OLAS, NOMBRE_COLA = "starseed_memory_root/olas", "cola-suenos-alcance.json"
CADA_HORAS, TOPE, DIAS_COLA, MAX_TITULO, MAX_CUERPO, MAX_PALABRAS = 20, 2, 7, 200, 8000, 220
STARSEED = ("starseed-os.vercel.app", "astraura-nube.vercel.app")
RE_SALIDA = re.compile(r"^alcance-(\d{4}-\d{2}-\d{2})-(\d+)\.json$")
RE_ADJUNTO = re.compile(r"(?i)(adjunt|attach|p[ií]xel de seguimiento|tracking pixel|<img|!\[)")
RAIZ = os.environ.get("STARSEED_ROOT") or os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def estado_vacio():
    return {"version": 1, "ultimo_ciclo": None, "ciclos": 0, "objetivos": {}, "salidas": {}, "pendientes": {},
            "encargos": [], "n_por_fecha": {}, "falta_carta": False}


def _solo_ids(d):
    d["objetivos"] = {k: {"ultima": (v or {}).get("ultima"), "veces": (v or {}).get("veces")} for k, v in (d.get("objetivos") or {}).items() if isinstance(v, dict)}
    d["salidas"] = {k: {"procesada": (v or {}).get("procesada"), "propuestas": (v or {}).get("propuestas"), "descartadas": (v or {}).get("descartadas")} for k, v in (d.get("salidas") or {}).items() if isinstance(v, dict)}
    d["pendientes"] = {k: {"objetivo": (v or {}).get("objetivo"), "fecha": (v or {}).get("fecha")} for k, v in (d.get("pendientes") or {}).items() if isinstance(v, dict)}
    d["encargos"] = [{"t": e.get("t"), "tareas": e.get("tareas"), "accion": e.get("accion"), "cola": e.get("cola")} for e in d.get("encargos") or [] if isinstance(e, dict)]
    return d


def cargar_estado(raiz):
    leer, _, _ = R.disco(raiz); d = R._json(leer(REL_ESTADO), {}) or {}; base = estado_vacio()
    base.update({k: v for k, v in d.items() if k in base}); return _solo_ids(base)


def _siguiente(estado, fecha): return int((estado.get("n_por_fecha") or {}).get(fecha) or 0) + 1


def _fichas(home=None):
    """Fichas privadas por `obj_id` (viven en ~/.starseed/alcance/fichas/)."""
    carpeta, fuera = os.path.join(AO.ruta_almacen(home), "fichas"), {}
    try: nombres = os.listdir(carpeta)
    except OSError: return fuera
    for nombre in nombres:
        if not nombre.endswith(".json"): continue
        try:
            with open(os.path.join(carpeta, nombre), encoding="utf-8") as f: d = json.load(f)
        except (OSError, ValueError): continue
        if isinstance(d, dict): fuera[str(d.get("obj_id") or nombre[:-5])] = d
    return fuera


def _urls(ficha):
    f = ficha if isinstance(ficha, dict) else {}; lista = []
    for clave in ("fuentes", "proyectos", "contenido_reciente"):
        lista += [str(x["url"]) for x in (f.get(clave) or []) if isinstance(x, dict) and R._https(x.get("url"))]
    canal = f.get("canal_oficial") if isinstance(f.get("canal_oficial"), dict) else {}
    if R._https(canal.get("fuente_url")): lista.append(str(canal["fuente_url"]))
    lista += [str(r["cita_url"]) for r in (f.get("resonancias") or []) if isinstance(r, dict) and R._https(r.get("cita_url"))]
    return list(dict.fromkeys(lista))


def _mensaje(c):
    return re.sub(r"(?im)^\s*[*_#]*\s*(mensaje|message)\s*[*_]*\s*:\s*", "",
                  re.sub(r"(?im)^\s*[*_#]*\s*(asunto|subject)\s*[*_]*\s*:.*$", "", str(c or "")))


def normalizar_propuesta(p, objetivo, ficha, fecha, n, i, ahora):
    """Normaliza y valida una variante; None si incumple R5/R7/R8. PURA."""
    if not isinstance(p, dict): return None
    d = p.get("destino") if isinstance(p.get("destino"), dict) else {}
    oid, titulo, cuerpo = str(objetivo or d.get("objetivo") or ""), R._limpio(p.get("titulo"), MAX_TITULO), R._bloque(p.get("cuerpo"), MAX_CUERPO)
    if not titulo or not cuerpo or len(re.findall(r"\S+", _mensaje(cuerpo))) > MAX_PALABRAS: return None
    if RE_ADJUNTO.search(cuerpo) or P.RE_EMAIL.search(json.dumps(p, ensure_ascii=False)): return None
    urls, dominios, refs = _urls(ficha), {urlparse(u).netloc.lower() for u in _urls(ficha)} | set(STARSEED), []
    for r in p.get("referencias") or []:
        url = r if isinstance(r, str) else (r.get("url") if isinstance(r, dict) else "")
        if not R._https(url) or urlparse(str(url)).netloc.lower() not in dominios: return None
        refs.append({"titulo": R._limpio((r.get("titulo") if isinstance(r, dict) else "") or url, MAX_TITULO), "url": url})
    af = []
    for a in p.get("afirmaciones") or []:
        if not isinstance(a, dict) or not R._https(a.get("fuente_url")) or a["fuente_url"] not in urls or not R._limpio(a.get("texto"), 300): return None
        af.append({"texto": R._limpio(a.get("texto"), 300), "fuente_url": a["fuente_url"]})
    tipo = "otro" if R._norm(p.get("tipo")) == "otro" else "contenido"
    return {"id": "agentes:alcance:%s-%d-%d" % (fecha, int(n), i), "fuente": "agentes", "agente": AGENTE, "tipo": tipo,
            "ambito": "metagenesis", "titulo": titulo, "cuerpo": cuerpo, "referencias": refs, "importancia": "alta",
            "estado": "esperando-aprobacion", "motivo": "", "t": R._iso(ahora), "version": 1,
            "destino": {"objetivo": oid, "medio": R._limpio(d.get("medio"), 80), "asunto": R._limpio(d.get("asunto") or titulo, MAX_TITULO)},
            "afirmaciones": af, "origen": {"objetivo": oid}}


def normalizar_salida(dato, fecha, n, ahora, objetivo="", ficha=None):
    """El archivo `alcance-<fecha>-<n>.json` normalizado; descarta variantes no válidas."""
    lista = (dato.get("propuestas") or []) if isinstance(dato, dict) else (dato if isinstance(dato, list) else [])
    objetivo = objetivo or (str(dato.get("objetivo") or "") if isinstance(dato, dict) else "")
    props = []
    for i, p in enumerate([x for x in lista if isinstance(x, dict)][:3], 1):
        oid = objetivo or (str((p.get("destino") or {}).get("objetivo") or "") if isinstance(p.get("destino"), dict) else "")
        v = normalizar_propuesta(p, oid, ficha or {}, fecha, n, i, ahora)
        if v: props.append(v)
    return {"formato": "starseed-imaginacion-agentes", "version": 1, "fuente": "agentes", "agente": AGENTE,
            "fecha": fecha, "n": int(n), "tarea": dato.get("tarea") if isinstance(dato, dict) else None,
            "objetivo": objetivo or None, "generado": R._iso(ahora), "propuestas": props}


def recoger_salidas(raiz, estado, ahora, home=None, fichas=None, leer=None, listar=None, escribir=True):
    """Normaliza lo devuelto por la flota; lo inválido se descarta. Sin contenido de terceros en el estado."""
    leer = leer or R.disco(raiz)[0]; listar = listar or R.disco(raiz)[1]; fichas = fichas if fichas is not None else _fichas(home)
    procesadas = validas = descartadas = 0
    for nombre in listar(P.REL_SALIDAS):
        m = RE_SALIDA.match(nombre)
        if not m or nombre in (estado.get("salidas") or {}): continue
        fecha, n = m.group(1), int(m.group(2)); dato = R._json(leer("%s/%s" % (P.REL_SALIDAS, nombre)), None)
        if dato is None: continue
        oid = str((estado.get("pendientes") or {}).get(nombre, {}).get("objetivo") or (dato.get("objetivo") if isinstance(dato, dict) else "") or "")
        doc = normalizar_salida(dato, fecha, n, ahora, oid, fichas.get(oid) or {})
        lista = dato.get("propuestas") if isinstance(dato, dict) else dato; total = len(lista) if isinstance(lista, list) else 0
        procesadas += 1; validas += len(doc["propuestas"]); descartadas += total - len(doc["propuestas"])
        if escribir: R._escribir_json(os.path.join(raiz, P.REL_SALIDAS, nombre), doc)
        estado.setdefault("salidas", {})[nombre] = {"procesada": R._iso(ahora), "propuestas": len(doc["propuestas"]), "descartadas": total - len(doc["propuestas"])}
        estado.setdefault("pendientes", {}).pop(nombre, None)
    return {"procesadas": procesadas, "validas": validas, "descartadas": descartadas}


def registrar(estado, tareas, ahora, encargo=None, fecha=None, n_final=0):
    """Anota ids y fechas (nunca contenido de terceros) en el estado que recibe. PURA sobre el dict."""
    t = R._iso(ahora); fecha = fecha or R._como_fecha(ahora).date().isoformat()
    for tarea in tareas:
        oid = str(tarea.get("objetivo") or ""); o = estado.setdefault("objetivos", {}).setdefault(oid, {}) if oid else {}
        if oid: o.update(ultima=t, veces=int(o.get("veces") or 0) + 1)
        estado.setdefault("pendientes", {})[os.path.basename(tarea["salida"])] = {"objetivo": oid, "fecha": fecha}
    if n_final: estado.setdefault("n_por_fecha", {})[fecha] = max(int((estado.get("n_por_fecha") or {}).get(fecha) or 0), int(n_final))
    if encargo is not None:
        estado.setdefault("encargos", []).append({"t": t, "tareas": [x.get("id") for x in tareas], "accion": encargo.get("accion"), "cola": encargo.get("cola")})
        estado["encargos"] = estado["encargos"][-20:]
    estado["ultimo_ciclo"] = t; estado["ciclos"] = int(estado.get("ciclos") or 0) + 1; return estado


def encargar_por_flota(raiz, tareas, fecha=None, ahora=None):
    """Funde en `cola-suenos-alcance.json` por la vía de los sueños; nunca lanza un orquestador."""
    import suenos as S
    momento = R._como_fecha(ahora); ruta = os.path.join(S.rutas(raiz)["olas"], NOMBRE_COLA); prev = S._leer_json(ruta, [])
    lista = prev if isinstance(prev, list) else (prev.get("tareas") or []) if isinstance(prev, dict) else []
    limite = R._iso(momento - timedelta(days=DIAS_COLA))
    S._escribir_json(ruta, S.fundir_tareas([x for x in lista if isinstance(x, dict) and (x.get("agente") != AGENTE or str(x.get("creada") or "") >= limite)], tareas))
    return {"ok": True, "accion": "cola_lista", "cola": "%s/%s" % (REL_OLAS, NOMBRE_COLA),
            "tareas": [t["id"] for t in tareas], "mensaje": "Cola de alcance lista (nunca lanza un orquestador)."}


def ciclo(raiz, ahora=None, encargar=None, jev=None, home=None, forzar=False, seco=False, objetivos=None, fichas=None):
    """Un ciclo: recoge, elige ≤ 2 objetivos, encarga y anota. Todo inyectable; `seco` no escribe."""
    momento = R._como_fecha(ahora); fecha = momento.date().isoformat(); estado = cargar_estado(raiz)
    jev = False if seco else jev
    carta = R.disco(raiz)[0](P.REL_CARTA) or ""
    if not carta:
        resumen = {"ok": True, "agente": AGENTE, "fecha": fecha, "seco": bool(seco), "toca": False,
                   "motivo": "falta_carta", "tareas": [], "propuesta": "Falta la carta de StarSeed"}
        if not seco and not estado.get("falta_carta"):
            n = _siguiente(estado, fecha)
            doc = normalizar_salida({"propuestas": [{"tipo": "otro", "titulo": "Falta la carta de StarSeed", "importancia": "alta",
                                                     "cuerpo": "No hay `memory/alcance/carta-starseed.md`: el agente de alcance no encarga borradores hasta que Alex la escriba."}]}, fecha, n, momento)
            ruta = "%s/alcance-%s-%d.json" % (P.REL_SALIDAS, fecha, n); R._escribir_json(os.path.join(raiz, ruta), doc)
            estado.setdefault("salidas", {})[os.path.basename(ruta)] = {"procesada": R._iso(momento), "propuestas": len(doc["propuestas"])}
            estado["falta_carta"] = True; registrar(estado, [], momento, {"accion": "falta_carta"}, n_final=n)
            R._escribir_json(os.path.join(raiz, REL_ESTADO), estado)
        return resumen
    cambiado = bool(estado.get("falta_carta")); estado["falta_carta"] = False; recogida = recoger_salidas(raiz, estado, momento, home, fichas, escribir=not seco)
    if not forzar and R._dentro(estado.get("ultimo_ciclo"), momento, horas=CADA_HORAS):
        if not seco and (recogida["procesadas"] or cambiado): R._escribir_json(os.path.join(raiz, REL_ESTADO), estado)
        return {"ok": True, "agente": AGENTE, "fecha": fecha, "seco": bool(seco), "toca": False, "recogidas": recogida["procesadas"],
                "motivo": "ya hubo ciclo hace menos de %d h" % CADA_HORAS, "tareas": []}
    objetivos = objetivos if objetivos is not None else AO.leer("objetivos", home=home); fichas = fichas if fichas is not None else _fichas(home)
    n = _siguiente(estado, fecha); tareas = []
    for o in P.elegir_objetivos(objetivos, estado, momento, tope=TOPE, jev=jev):
        ficha = fichas.get(str(o.get("id"))) or {}
        if ficha: tareas.append(P.tarea_de(o, ficha, carta, momento, n)); n += 1
    if seco: encargo = {"accion": "seco", "mensaje": "(seco) nada se escribe ni se encarga"}
    elif not tareas: encargo = {"accion": "nada", "mensaje": "Sin encargos hoy."}
    else:
        try: encargo = (encargar or encargar_por_flota)(raiz, tareas, fecha=fecha, ahora=momento)
        except Exception as e: encargo = {"ok": False, "accion": "error", "mensaje": "No se pudo encargar: %s" % type(e).__name__}
    if not seco: registrar(estado, tareas, momento, encargo, n_final=n - 1); R._escribir_json(os.path.join(raiz, REL_ESTADO), estado)
    return {"ok": True, "agente": AGENTE, "fecha": fecha, "seco": bool(seco), "toca": True, "recogidas": recogida["procesadas"],
            "tareas": [{"id": t["id"], "objetivo": t["objetivo"], "salida": t["salida"]} for t in tareas], "encargo": encargo,
            "mensaje": "Alcance %s: %d encargo(s). %s" % (fecha, len(tareas), encargo.get("mensaje") or "")}


def _plan(raiz, ahora, home):
    objetivos, fichas, carta = AO.leer("objetivos", home=home), _fichas(home), R.disco(raiz)[0](P.REL_CARTA) or ""
    tareas, n = [], 1
    for o in (P.elegir_objetivos(objetivos, {}, ahora, tope=TOPE, jev=False) if carta else []):
        ficha = fichas.get(str(o.get("id"))) or {}
        if ficha: tareas.append(P.tarea_de(o, ficha, carta, ahora, n)); n += 1
    return {"ok": True, "seco": True, "fecha": ahora.date().isoformat(), "carta": bool(carta), "tareas": tareas}


def _estado(raiz):
    e = cargar_estado(raiz)
    return {"ok": True, "ultimo_ciclo": e.get("ultimo_ciclo"), "ciclos": e.get("ciclos"), "objetivos_mirados": len(e.get("objetivos") or {}),
            "salidas": len(e.get("salidas") or {}), "falta_carta": bool(e.get("falta_carta")), "cola": "%s/%s" % (REL_OLAS, NOMBRE_COLA)}


def parser():
    p = argparse.ArgumentParser(description="Agente de alcance")
    p.add_argument("orden", choices=("plan", "ciclo", "estado")); p.add_argument("--raiz", default=RAIZ); p.add_argument("--home")
    p.add_argument("--seco", action="store_true"); p.add_argument("--forzar", action="store_true"); p.add_argument("--sin-jev", action="store_true")
    return p


def main(argv=None, salida=None):
    a = parser().parse_args(argv); ahora = R._como_fecha(None)
    d = _plan(a.raiz, ahora, a.home) if a.orden == "plan" else (ciclo(a.raiz, ahora, jev=False if a.sin_jev else None, home=a.home, seco=a.seco, forzar=a.forzar) if a.orden == "ciclo" else _estado(a.raiz))
    print(json.dumps(d, ensure_ascii=False, indent=1), file=salida or sys.stdout); return 0 if d.get("ok") else 1
