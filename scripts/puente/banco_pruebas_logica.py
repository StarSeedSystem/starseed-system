# -*- coding: utf-8 -*-
"""Banco de pruebas: la evidencia de los aparatos, PURA (PRB1111W · contrato centro-versiones-1105.md §11).

Lee el texto del registro de enlaces (`enlaces.log` de la app nativa) y devuelve, sin tocar el disco ni la red:
las llamadas (las dos puntas, con los números que mira la dirección), los aparatos que aparecen y las sugerencias
«bien/falla» de las comprobaciones que llevan una señal. Una sugerencia NUNCA marca una comprobación.

Formato del registro (medido en la Mac, 11-11):
  <ISO> web [(Nombre)] <ISO interno> · [web · ]llamada · [bN · neurona <uuid> · ]<mensaje>
  <ISO> ble <evento> enlace=bN neurona=<uuid> · <detalle>
Las líneas de otro aparato (la tablet) llevan su nombre entre paréntesis tras «web»: `(Maggaboard)`.
Una cifra que el registro no trae es None, nunca 0.
"""
import os
import re
import unicodedata
from datetime import datetime, timezone

SENALES_USADAS = ("enlace-ble-hora", "voz-sin-corte", "llamada-ble", "video-sin-negro", "video-fps-ble",
                  "video-sin-pausa-mudo", "video-pausa-ancho", "voz-limpia-lejos", "camara-abre", "camara-cambia",
                  "camara-conserva", "arranque-limpio")
MAX_LLAMADAS = 10
MAX_LINEAS_CRUDAS = 6
HUECO_LLAMADA_S = 90          # más silencio que esto entre líneas de llamada = otra llamada
TRAS_COLGAR_S = 5             # lo que llegue más de 5 s después de colgar es otra llamada

_LINEA = re.compile(r"^(?P<t>\d{4}-\d\d-\d\dT[\d:.]+Z) (?P<canal>web|ble)(?: \((?P<tag>[^)]{1,40})\))? (?P<resto>.*)$")
_WEB = re.compile(r"^(?P<ti>\d{4}-\d\d-\d\dT[\d:.]+Z) · (?:web · )?(?P<tipo>[a-z-]+) · (?:(?P<enl>b\d+) · neurona (?P<n>\S+) · )?(?P<msg>.*)$")
_BLE = re.compile(r"^(?P<ev>[a-z0-9-]+)(?: enlace=(?P<enl>b\d+))?(?: neurona=\S+)?(?: · (?P<msg>.*))?$")
_KV = re.compile(r"([A-Za-zñ][\w/-]*)=([^\s]+)")
_WEB_BUILD = re.compile(r"(?:^|\s)web=([\w-]{3,64}(?:/[0-9a-f]{7,40})?)(?:\s|$)")  # ACT1113F: build de la web que corre el aparato
_UUID = re.compile(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
_RUTA = re.compile(r"(?:/Users|/home|/private|/var|/Library|~)/[^\s\"']+")
_CLAVE = re.compile(r"(sk-[A-Za-z0-9_\-]{8,}|gh[pousr]_[A-Za-z0-9]{8,}|Bearer\s+\S+|eyJ[\w\-]+\.[\w\-]+\.[\w\-]+)")


def _a_epoch(iso):
    try:
        return datetime.strptime(iso[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc).timestamp() + (
            float("0" + iso[19:-1]) if len(iso) > 20 and iso[19] == "." else 0.0)
    except (ValueError, TypeError):
        return None


def _a_iso(epoch):
    return datetime.fromtimestamp(epoch, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if epoch is not None else None


def _id_aparato(nombre):
    s = "".join(c for c in unicodedata.normalize("NFD", nombre.lower()) if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-") or "otro"


def limpiar(texto, largo=300):
    """Quita ids de neurona, rutas del disco y claves de una línea cruda antes de enseñarla."""
    t = _CLAVE.sub("[oculto]", _RUTA.sub("[ruta]", _UUID.sub("…", texto)))
    return t[:largo]


def parse_linea(linea):
    """Una línea del registro → dict o None. {t, canal, aparato, tipo, enlace, msg, raw}."""
    m = _LINEA.match(linea.rstrip("\n"))
    if not m:
        return None
    aparato = _id_aparato(m.group("tag")) if m.group("tag") else "mac"
    tag = m.group("tag")
    resto = m.group("resto")
    if m.group("canal") == "web":
        w = _WEB.match(resto)
        if not w:
            return {"t": _a_epoch(m.group("t")), "canal": "web", "aparato": aparato, "nombre": tag, "tipo": "?",
                    "enlace": None, "msg": resto, "raw": linea}
        t = _a_epoch(w.group("ti")) or _a_epoch(m.group("t"))
        return {"t": t, "canal": "web", "aparato": aparato, "nombre": tag, "tipo": w.group("tipo"),
                "enlace": w.group("enl"), "msg": w.group("msg"), "raw": linea}
    b = _BLE.match(resto)
    return {"t": _a_epoch(m.group("t")), "canal": "ble", "aparato": aparato, "nombre": tag,
            "tipo": b.group("ev") if b else "?", "enlace": b.group("enl") if b else None,
            "msg": (b.group("msg") or "") if b else resto, "raw": linea}


def _num(txt):
    """'45k' → 45.0, '8kbps' → 8.0, '0.7%' → 0.7, '+0' → 0.0, '120ms' → 120.0, None → None."""
    if txt is None:
        return None
    m = re.match(r"^[+≈]?(-?\d+(?:\.\d+)?)", str(txt))
    return float(m.group(1)) if m else None


def kv(msg):
    return {k: v for k, v in _KV.findall(msg)}


def _minmax(xs):
    xs = [x for x in xs if x is not None]
    return (min(xs), max(xs)) if xs else (None, None)


def _redondea(x, d=1):
    if x is None:
        return None
    r = round(x, d)
    return int(r) if d == 0 or r == int(r) else r


def _fps(xs):
    xs = [x for x in xs if x is not None]
    if not xs:
        return {"min": None, "med": None, "max": None}
    return {"min": _redondea(min(xs)), "med": _redondea(sum(xs) / len(xs)), "max": _redondea(max(xs))}


# ── llamadas ────────────────────────────────────────────────────────────────────────────────────────────────────

def _es_colgar(l):
    return l["tipo"] == "llamada" and l["msg"].startswith(("senal-enviada colgar", "senal-recibida colgar"))


def _es_relevante(l):
    m = l["msg"]
    return l["tipo"] == "llamada" and (
        m.startswith(("senal-enviada senal", "senal-recibida senal", "negociacion", "camara", "medio="))
        or "voz-datos" in m or "video-datos" in m or _es_colgar(l))


def agrupar_llamadas(lineas):
    """Líneas parseadas → lista de llamadas (cada una, lista de líneas ordenadas por hora)."""
    ll = sorted((l for l in lineas if l and l["tipo"] == "llamada" and l["t"] is not None), key=lambda l: l["t"])
    grupos, actual, ult, colgado = [], [], None, None
    for l in ll:
        if actual and (l["t"] - ult > HUECO_LLAMADA_S or (colgado is not None and l["t"] - colgado > TRAS_COLGAR_S)):
            grupos.append(actual)
            actual, colgado = [], None
        actual.append(l)
        ult = l["t"]
        if _es_colgar(l):
            colgado = l["t"]
    if actual:
        grupos.append(actual)
    return [g for g in grupos if any(_es_relevante(l) for l in g)]


def _espera(msg):
    """«espera=72/89ms» → (p90, máximo) en ms; «espera=89ms» → (None, 89); «espera=-/0ms» → (None, 0)."""
    m = re.search(r"espera=(?:(\d+(?:\.\d+)?|-)/)?(\d+(?:\.\d+)?)", msg)
    if not m:
        return None, None
    return (float(m.group(1)) if m.group(1) not in (None, "-") else None), float(m.group(2))


def _enlace(msg):
    """«enlace=160k+29ms/139» → (kbps, ms, ciclo) del modelo del enlace; None si no hay o es «?»."""
    m = re.search(r"enlace=(\d+(?:\.\d+)?)k\+(\d+(?:\.\d+)?)ms(?:/(\d+))?", msg)
    return (float(m.group(1)), float(m.group(2)), float(m.group(3)) if m.group(3) else None) if m else None


def _otro(msg):
    """«otro:perd=18%/tarde=57.5%» → (perd, tarde): lo que el OTRO extremo dice haber recibido de este."""
    m = re.search(r"otro:perd=([\d.]+)%/tarde=([\d.]+)%", msg)
    return (float(m.group(1)), float(m.group(2))) if m else (None, None)


def _seccion(prob, donde, fn):
    """Una sección de las métricas que no se puede leer no tumba el resto: se anota y queda en None."""
    try:
        return fn()
    except Exception as e:  # noqa: BLE001
        if prob is not None:
            prob.append({"donde": donde, "error": describir_error(e)})
        return None


def describir_error(e):
    """«TypeError: mensaje (archivo.py:línea en función)»: lo bastante para diagnosticar, sin rutas del disco."""
    import traceback
    tb = traceback.extract_tb(e.__traceback__)
    donde = ""
    if tb:
        f = tb[-1]
        donde = " (%s:%s en %s)" % (os.path.basename(f.filename), f.lineno, f.name)
    return limpiar("%s: %s%s" % (type(e).__name__, e, donde), 240)


def metricas_lado(ls, t_ini, t_fin, prob=None, nombre="", t_video0=None):
    """Las líneas de UNA punta de la llamada → voz, video, camara, lineas (None donde esa punta no tuvo ese medio).
    Lo que no se puede leer se anota en `prob` (lista) y esa sección queda en None."""
    voz, video, camara = None, None, None
    ls = list(ls)
    voz_tx, voz_rx, niveles, repartos, vtx, vrx, cam, perfiles = _separar(ls)
    voz = _seccion(prob, nombre + "/voz", lambda: _voz(ls, voz_tx, voz_rx, niveles, repartos))
    video = _seccion(prob, nombre + "/video", lambda: _video(repartos, vtx, vrx, perfiles, t_fin, t_video0))
    camara = _seccion(prob, nombre + "/camara", lambda: _camara(cam))
    elegidas = _seccion(prob, nombre + "/lineas", lambda: _crudas(ls)) or []
    return {"voz": voz, "video": video, "camara": camara, "lineas": elegidas}


def _separar(ls):
    """Reparte las líneas de una punta por tipo de registro."""
    voz_tx, voz_rx, niveles, repartos, vtx, vrx, cam, perfiles = [], [], [], [], [], [], [], []
    for l in ls:
        m = l["msg"]
        if "voz-datos tx" in m:
            voz_tx.append((l["t"], kv(m), " mudo" in (m + " ")))
        elif "voz-datos rx" in m:
            voz_rx.append((l["t"], kv(m)))
        elif "voz-datos nivel" in m:
            n = re.search(r"nivel (\d+)→(\d+)", m)
            rx = re.search(r"rx-otro=perd ([\d.]+)% tarde ([\d.]+)%", m)
            niveles.append((l["t"], int(n.group(1)) if n else None, int(n.group(2)) if n else None, kv(m), rx))
        elif "video-datos reparto" in m:
            # «reparto activo …» y «reparto pausa …» llevan el estado; otras (p. ej. «reparto carril=… escalon=…») no son un estado
            if "reparto pausa" in m or "reparto activo" in m:
                est = "pausa" if "reparto pausa" in m else "activo"
                repartos.append((l["t"], est, kv(m), (re.search(r"motivo=(\S+)", m) or [None, None])[1]))
        elif "video-datos perfil=" in m:
            pf = re.search(r"perfil=\S+ · (\d+) fps · (\d+) kbps", m)
            if pf:
                perfiles.append((l["t"], float(pf.group(1)), float(pf.group(2))))
        elif "video-datos tx" in m:
            vtx.append((l["t"], kv(m)))
        elif "video-datos rx" in m:
            vrx.append((l["t"], kv(m)))
        elif m.startswith("camara"):
            cam.append((l["t"], m))
    return voz_tx, voz_rx, niveles, repartos, vtx, vrx, cam, perfiles


def _voz(ls, voz_tx, voz_rx, niveles, repartos):
    if not (voz_tx or voz_rx or niveles):
        return None
    ns = [_num(k.get("n")) for _, k, _ in voz_tx] + [x for _, a, b, _, _ in niveles for x in (a, b)]
    ops = [_num(k.get("opus")) for _, k, _ in voz_tx] + [_num(k.get("opus")) for *_, k, _ in niveles]
    # espera=a/b: a = lo que esperó la voz para salir (percentil 90 por escritura), b = lo más que esperó (src/lib/llamadas/voz-datos/sesion.ts)
    esp_p90, esp_max = [], []
    for msg in [x["msg"] for x in ls if "voz-datos tx" in x["msg"] or "voz-datos nivel" in x["msg"]]:
        p90, mx = _espera(msg)
        esp_p90.append(p90); esp_max.append(mx)
    esp_max += [_num(k.get("espera-voz")) for _, _, k, _ in repartos]
    n_lo, n_hi = _minmax(ns)
    o_lo, o_hi = _minmax(ops)
    mudo_s = 0.0
    for i, (t, _, mudo) in enumerate(voz_tx):
        if mudo:
            mudo_s += (voz_tx[i + 1][0] - t) if i + 1 < len(voz_tx) else 5.0
    otros = [_otro(x["msg"]) for x in ls if "voz-datos tx" in x["msg"]]
    enlaces = [e for e in (_enlace(x["msg"]) for x in ls if "voz-datos tx" in x["msg"]) if e]
    entregados = [_num(k.get("entregado")) for _, k, _ in voz_tx]
    tarde = [float(rx.group(2)) for *_, rx in niveles if rx] + [t for _, t in otros if t is not None]
    suelo = sum(1 for x in ls if "voz-datos" in x["msg"] and "BAJO-SUELO" in x["msg"])
    return {"nivel_min": _redondea(n_lo, 0), "nivel_max": _redondea(n_hi, 0),
            "nivel_ultimo": _redondea(_ultimo(ns), 0),
            "opus_kbps_min": _redondea(o_lo), "opus_kbps_max": _redondea(o_hi),
            "inventado_pct_max": _redondea(_minmax([_num(k.get("inventado")) for _, k in voz_rx
                                                    if (_num(k.get("paq")) or 0) >= 20])[1]),      # sin las primeras muestras (arranque)
            "ocultadas_total": _redondea(sum(_num(k.get("ocultadas")) or 0 for _, k in voz_rx), 0) if voz_rx else None,
            "tardias_ultimo": _redondea(_ultimo([_num(k.get("tardias")) for _, k in voz_rx]), 0),
            "perdida_pct_max": _redondea(_minmax([_num(k.get("perd")) for _, k in voz_rx])[1]),
            "tarde_pct_max": _redondea(_minmax(tarde or [None])[1]),
            "otro_perdida_pct_max": _redondea(_minmax([p for p, _ in otros])[1]),
            "bajo_suelo_lineas": suelo,
            "jitter_ms_max": _redondea(_minmax([_num(k.get("jitter")) for _, k in voz_rx])[1], 0),
            "espera_voz_ms_max": _redondea(_minmax(esp_max)[1], 0),
            "espera_voz_p90_ms_max": _redondea(_minmax(esp_p90)[1], 0),
            "enlace_kbps": _redondea(_ultimo([e[0] for e in enlaces]), 0),
            "enlace_ms": _redondea(_ultimo([e[1] for e in enlaces]), 0),
            "entregado_kbps_min": _redondea(_minmax(entregados)[0], 0),
            "entregado_kbps_max": _redondea(_minmax(entregados)[1], 0),
            "mudo_s": _redondea(mudo_s, 0) if voz_tx else None}


def _ultimo(xs):
    xs = [x for x in xs if x is not None]
    return xs[-1] if xs else None


def _tasa(muestras, t_video0):
    """Imágenes por segundo a partir de un contador acumulado: con dos muestras o más, lo que subió entre la primera y la
    última; con una sola, el contador entre el arranque del vídeo en la llamada y esa muestra. None si no alcanza."""
    m = [(t, v) for t, v in muestras if v is not None]
    if len(m) >= 2 and m[-1][0] - m[0][0] >= 4:
        return _redondea((m[-1][1] - m[0][1]) / (m[-1][0] - m[0][0]))
    if m and t_video0 is not None and m[-1][0] - t_video0 >= 2:
        return _redondea(m[-1][1] / (m[-1][0] - t_video0))
    return None


def _video(repartos, vtx, vrx, perfiles, t_fin, t_video0=None):
    if not (repartos or vtx or vrx or perfiles):
        return None
    activos = [_num(k.get("fps")) for _, e, k, _ in repartos if e == "activo"]
    # una línea de «activo» sin fps (la cortó el registro) no cuenta; una pausa cuenta como 0
    todos = [f for f in ((_num(k.get("fps")) if e == "activo" else 0.0) for _, e, k, _ in repartos) if f is not None]
    pausas, cur = [], None
    for t, e, k, mot in repartos:
        if e == "pausa" and cur is None:
            cur = {"t": _a_iso(t), "motivo": mot, "_t0": t, "dur_s": None, "volvio": False}
        elif e == "activo" and cur is not None:
            cur["dur_s"] = _redondea(t - cur["_t0"], 0)
            cur["volvio"] = True
            pausas.append(cur)
            cur = None
    if cur is not None:
        fin = max([x[0] for x in repartos] + [t_fin or 0])
        cur["dur_s"] = _redondea(fin - cur["_t0"], 0)
        pausas.append(cur)
    for p in pausas:
        p.pop("_t0", None)
    vtx = [x for x in vtx if "enviados" in x[1]]          # «video-datos tx=vp8» (el arranque) no trae contadores
    vrx = [x for x in vrx if "pintados" in x[1]]
    ult_tx = vtx[-1][1] if vtx else {}
    ult_rx = vrx[-1][1] if vrx else {}
    pint = _num(ult_rx.get("pintados"))
    env = _num(ult_tx.get("enviados"))
    return {"fps_activo": _fps(activos), "fps_medio": _redondea(sum(todos) / len(todos)) if todos else None,
            "fps_perfil": _fps([f for _, f, _ in perfiles]),
            "fps_enviados_med": _tasa([(t, _num(k.get("enviados"))) for t, k in vtx], t_video0),
            "fps_recibidos_med": _tasa([(t, _num(k.get("pintados"))) for t, k in vrx], t_video0),
            "enviados": _redondea(env, 0), "descartados": _redondea(_num(ult_tx.get("descartados")), 0),
            "negros": _redondea(_num(ult_tx.get("negros")), 0), "pintados": _redondea(pint, 0),
            "errores_rx": _redondea(_num(ult_rx.get("errores")), 0),
            "otro_pausado_lineas": sum(1 for _, _, k, _ in repartos if k.get("otro") == "pausa"),
            "pausas": pausas}


def _camara(cam):
    if not cam:
        return None
    abiertas = []
    for _, m in cam:
        a = re.search(r'abierta="([^"]+)"', m) or re.search(r'abierta elegida="([^"]+)"', m)
        if a and a.group(1) not in abiertas:
            abiertas.append(a.group(1))
    errores = [m for _, m in cam if re.search(r"\b(fall[oó]|error|denegad|no-abre|NotReadable|Overconstrained)", m)]
    return {"intentos": sum(1 for _, m in cam if m.startswith("camara intento")),
            "abierta": abiertas[-1] if abiertas else None, "distintas": len(abiertas),
            "ok": bool(abiertas) and not errores, "error": limpiar(errores[0], 160) if errores else None}


def _crudas(ls):
    relevantes = [l for l in ls if _es_relevante(l) and "visibilidad" not in l["msg"]]
    elegidas, vistos = [], set()
    for l in relevantes:  # unas pocas de cada tipo, para ver de dónde salen los números
        clave = re.sub(r"[\d.]+", "#", l["msg"])[:40]
        if clave not in vistos and len(elegidas) < MAX_LINEAS_CRUDAS:
            vistos.add(clave)
            elegidas.append(limpiar(l["raw"]))
    return elegidas


def web_de(msg):
    """ACT1113F: la build de la web que dice una línea («web=mwfli3jt-ctfbyg/fbbcb6794a»), o None."""
    m = _WEB_BUILD.search(msg or "")
    return m.group(1) if m else None


def web_por_lado(grupo):
    """ACT1113F: {aparato: build} con la ÚLTIMA que dijo cada lado dentro de la llamada (sus líneas «inicio» y «fin»)."""
    out = {}
    for l in grupo:
        w = web_de(l["msg"])
        if w:
            out[l["aparato"]] = w
    return out


def notas_de_build(web):
    """ACT1113F: nota informativa (no un fallo) cuando los dos lados de una llamada corrían builds distintas."""
    distintas = sorted(set(web.values()))
    if len(web) >= 2 and len(distintas) > 1:
        return ["Los dos lados corrían builds distintas de la web (%s): informativo, no es un fallo." %
                ", ".join("%s=%s" % (a, w) for a, w in sorted(web.items()))]
    return []


def construir_llamada(grupo, lineas_ble, prob=None):
    idl = "llamada-" + datetime.fromtimestamp(grupo[0]["t"], timezone.utc).strftime("%Y%m%dT%H%M%S")
    t0, t1 = grupo[0]["t"], grupo[-1]["t"]
    por_aparato = {}
    for l in grupo:
        por_aparato.setdefault(l["aparato"], []).append(l)
    medios, enlaces = [], []
    for l in grupo:
        mm = re.search(r"medio=(\S+)", l["msg"])
        if mm and mm.group(1) not in medios:
            medios.append(mm.group(1))
        if l["enlace"] and l["enlace"] not in enlaces:
            enlaces.append(l["enlace"])
    kb = [_num(re.search(r"kbps=(\d+)", b["msg"]).group(1)) for b in lineas_ble
          if b["tipo"] == "l2cap-kbps" and t0 - 5 <= b["t"] <= t1 + 5 and re.search(r"kbps=(\d+)", b["msg"])]
    t_v0 = min([l["t"] for l in grupo if "video-datos" in l["msg"]] or [None]) if any("video-datos" in l["msg"] for l in grupo) else None
    lados = {a: metricas_lado(ls, t0, t1, prob, "%s/%s" % (idl, a), t_v0) for a, ls in por_aparato.items()}
    lados.setdefault("mac", None)
    otros = [a for a in por_aparato if a != "mac"]
    return {"id": "llamada-" + datetime.fromtimestamp(t0, timezone.utc).strftime("%Y%m%dT%H%M%S"),
            "desde": _a_iso(t0), "hasta": _a_iso(t1), "duracion_s": int(round(t1 - t0)),
            "con": otros[0] if otros else None, "terminada": any(_es_colgar(l) for l in grupo),
            "medios": medios, "enlaces": enlaces,
            "kbps_rapido": {"min": _redondea(min(kb)), "max": _redondea(max(kb)), "muestras": len(kb)} if kb else None,
            "lados": lados, "web_por_lado": web_por_lado(grupo), "notas": notas_de_build(web_por_lado(grupo))}


# ── sugerencias ─────────────────────────────────────────────────────────────────────────────────────────────────

def _lados_con(llamada, medio):
    return {a: s[medio] for a, s in llamada["lados"].items() if s and s.get(medio)}


def regla(senal, llamada, ctx):
    """PURA: (veredicto 'bien'|'falla'|None, motivo) de una señal para UNA llamada. None = esta llamada no decide."""
    dur = llamada["duracion_s"]
    voz, video, cam = _lados_con(llamada, "voz"), _lados_con(llamada, "video"), _lados_con(llamada, "camara")
    if senal == "llamada-ble":
        if "enlace-datos" in llamada["medios"] and voz:
            peor = max((v["perdida_pct_max"] or 0) for v in voz.values())
            corta = "" if dur >= 120 else " (se piden 2 min)"
            if dur >= 10 and peor <= 20:
                return "bien", "La voz fue por el enlace de datos (Bluetooth) durante %d s%s, con pérdida máxima %s %%." % (dur, corta, _redondea(peor))
            return "falla", "La voz fue por el enlace de datos pero con pérdida de hasta %s %% en %d s." % (_redondea(peor), dur)
        return None, ""
    if senal == "voz-sin-corte":
        if not voz or not ctx.get("reintento_t"):
            return None, ""
        ult = max(ctx.get("ultima_voz_t") or 0, 0)
        if ult - ctx["reintento_t"] >= 2:
            return "bien", "Tras «se reintenta WebRTC sin colgar» la voz siguió %d s más sin cortarse." % int(ult - ctx["reintento_t"])
        return "falla", "Tras «se reintenta WebRTC sin colgar» la voz dejó de llegar en menos de 2 s."
    if senal == "video-sin-negro":
        if not video:
            return None, ""
        negros = [v["negros"] for v in video.values() if v["negros"] is not None]
        pint = sum(v["pintados"] or 0 for v in video.values())
        if negros and max(negros) > 0:
            return "falla", "El vídeo registró %d fotogramas negros." % int(max(negros))
        if negros and pint > 0:
            return "bien", "Ningún fotograma negro y %d imágenes pintadas en la llamada." % int(pint)
        return None, ""
    if senal == "video-fps-ble":
        if "video-datos" not in llamada["medios"] or len(video) < 2:
            return None, ""
        # lo que cada punta PINTA de lo que le llega (lo que se ve); sin ello, lo que envía; sin ello, el reparto del control
        medias = {}
        for a, v in video.items():
            f = next((x for x in (v.get("fps_recibidos_med"), v.get("fps_enviados_med"), v.get("fps_medio")) if x is not None), None)
            if f is not None:
                medias[a] = f
        if len(medias) < 2:
            return None, ""
        dur_txt = "" if dur >= 120 else " (la llamada duró %d s, menos de los 2 min pedidos)" % dur
        resumen = ", ".join("%s %s" % (a, _redondea(f)) for a, f in sorted(medias.items()))
        if all(f >= 3 for f in medias.values()):
            return "bien", "Imágenes por segundo vistas en cada punta: %s%s." % (resumen, dur_txt)
        return "falla", "Imágenes por segundo vistas en cada punta: %s; se pedían 3 o más%s." % (resumen, dur_txt)
    if senal == "video-sin-pausa-mudo":
        mudos = ctx.get("mudo_tramos") or []
        if sum(h - d for d, h in mudos) < 20 or not video:
            return None, ""
        dentro = [p for v in video.values() for p in v["pausas"]
                  if any(d <= (_a_epoch(p["t"]) or 0) <= h for d, h in mudos)]
        if dentro:
            return "falla", "El vídeo se pausó (%s) con el micrófono mudo." % (dentro[0]["motivo"] or "sin motivo")
        return "bien", "Con el micrófono mudo %d s el vídeo no se pausó." % int(sum(h - d for d, h in mudos))
    if senal == "video-pausa-ancho":
        pausas = [p for v in video.values() for p in v["pausas"]]
        if not pausas:
            return None, ""
        if all(p["volvio"] for p in pausas):
            return "bien", "El vídeo se pausó por «%s» %d vez/veces y volvió solo (la más larga, %s s)." % (
                pausas[0]["motivo"], len(pausas), max((p["dur_s"] or 0) for p in pausas))
        return "falla", "El vídeo se pausó por «%s» y no volvió antes de acabar la llamada." % pausas[0]["motivo"]
    if senal == "voz-limpia-lejos":
        pausas = [p for v in video.values() for p in v["pausas"] if (p["motivo"] or "") == "suelo"]
        suelo = sum(v.get("bajo_suelo_lineas") or 0 for v in voz.values())
        if not voz or not (pausas or suelo):
            return None, ""
        inv = max((v["inventado_pct_max"] or 0) for v in voz.values())
        quien = "vídeo en pausa por «suelo»" if pausas else "voz en BAJO-SUELO, %d registros" % suelo
        if inv <= 10:
            return "bien", "Con el enlace justo (%s) la voz inventada llegó como mucho a %s %%." % (quien, _redondea(inv))
        return "falla", "Con el enlace justo (%s) la voz inventada llegó al %s %%." % (quien, _redondea(inv))
    if senal in ("camara-abre", "camara-cambia", "camara-conserva"):
        if not cam:
            return None, ""
        c = next(iter(cam.values()))
        if senal == "camara-abre":
            if c["error"]:
                return "falla", "La cámara dio error: %s." % c["error"]
            if c["abierta"]:
                return "bien", "La Mac abrió «%s» al encender el vídeo (%d intento/s)." % (c["abierta"], c["intentos"])
        if senal == "camara-cambia" and c["distintas"] >= 2 and not c["error"]:
            return "bien", "Se abrieron %d cámaras distintas en la misma llamada." % c["distintas"]
        if senal == "camara-conserva" and c["error"]:
            return ("bien" if c["abierta"] else "falla"), "Una cámara no abrió («%s») y %s." % (
                c["error"], "quedó la anterior abierta" if c["abierta"] else "no quedó ninguna abierta")
        return None, ""
    return None, ""


def contexto_llamada(grupo):
    mudo, ult_voz, reintento = [], None, None
    for l in grupo:
        if "voz-datos tx" in l["msg"]:
            ult_voz = max(ult_voz or 0, l["t"])
            if " mudo" in l["msg"] + " ":
                if mudo and l["t"] - mudo[-1][1] <= 8:
                    mudo[-1][1] = l["t"] + 5
                else:
                    mudo.append([l["t"], l["t"] + 5])
        if "se reintenta WebRTC sin colgar" in l["msg"] and reintento is None:
            reintento = l["t"]
    return {"mudo_tramos": [tuple(x) for x in mudo], "ultima_voz_t": ult_voz, "reintento_t": reintento}


PRODUCIRIA = {
    "enlace-ble-hora": "una hora seguida de registro del enlace Bluetooth con la Mac y la tablet abiertas, ya con esta versión",
    "voz-sin-corte": "una llamada entre la Mac y la tablet, hecha con esta versión, en la que se reintente WebRTC sin colgar",
    "llamada-ble": "una llamada entre la Mac y la tablet, solo por Bluetooth, hecha con esta versión",
    "video-sin-negro": "una llamada con vídeo hecha con esta versión",
    "video-fps-ble": "una llamada de vídeo entre la Mac y la tablet por Bluetooth, hecha con esta versión",
    "video-sin-pausa-mudo": "una llamada entre la Mac y la tablet con vídeo y el micrófono mudo más de 20 s, hecha con esta versión",
    "video-pausa-ancho": "una llamada entre la Mac y la tablet en la que el vídeo se pause por ancho de banda, hecha con esta versión",
    "voz-limpia-lejos": "una llamada entre la Mac y la tablet con el enlace justo (vídeo en pausa por «suelo»), hecha con esta versión",
    "camara-abre": "una llamada con vídeo en la Mac, hecha con esta versión",
    "camara-cambia": "una llamada en la Mac en la que se cambie de cámara, hecha con esta versión",
    "camara-conserva": "una llamada en la Mac en la que una cámara no abra, hecha con esta versión",
    "arranque-limpio": "abrir la app de nuevo después de actualizar, sin errores en el arranque",
}
# señales que juzgan algo ENTRE la Mac y la tablet: sin señal de vida de las dos puntas no hay sugerencia
DOS_APARATOS = frozenset(("enlace-ble-hora", "voz-sin-corte", "llamada-ble", "video-fps-ble", "video-sin-pausa-mudo",
                          "video-pausa-ancho", "voz-limpia-lejos"))
TRAMOS_VIDA = 6               # la hora del enlace se mira en 6 tramos de 10 min
TRAMOS_MIN_TABLET = 3         # la tablet debe dar señal en la mitad de ellos


def _hora(epoch):
    return _a_iso(epoch) if epoch else "—"


def relacion_version(llamada_desde, version_desde_epoch):
    """'esta' si la llamada se hizo cuando la Mac ya corría la versión instalada; 'otra' si fue antes; 'desconocida' si
    no se sabe desde cuándo la corre."""
    if version_desde_epoch is None:
        return "desconocida"
    t = _a_epoch(llamada_desde)
    return "esta" if (t is not None and t >= version_desde_epoch) else "otra"


def ambas_puntas(llamada):
    """La llamada tiene líneas de la Mac y de la tablet (las dos dieron señal mientras duró)."""
    lados = llamada.get("lados") or {}
    return bool(lados.get("mac")) and any(v for a, v in lados.items() if a != "mac")


def vida_en_ventana(lineas, ini, fin):
    """→ {'mac': (n, ult, tramos), 'tablet': (...)}: líneas de cada punta dentro de [ini, fin]."""
    largo = max((fin - ini) / TRAMOS_VIDA, 1.0)
    out = {"mac": [0, None, set()], "tablet": [0, None, set()]}
    for l in lineas:
        if l["t"] is None or not (ini <= l["t"] <= fin):
            continue
        o = out["mac" if l["aparato"] == "mac" else "tablet"]
        o[0] += 1
        o[1] = max(o[1] or 0, l["t"])
        o[2].add(min(int((l["t"] - ini) / largo), TRAMOS_VIDA - 1))
    return {k: (v[0], v[1], len(v[2])) for k, v in out.items()}


def _ultima_vez(lineas, aparato_tablet, hasta):
    ts = [l["t"] for l in lineas if l["t"] is not None and l["t"] <= hasta and ((l["aparato"] != "mac") == aparato_tablet)]
    return max(ts) if ts else None


def _regla_ble(ble, lineas, desde_epoch):
    """enlace-ble-hora: en la última hora del enlace (ya con esta versión y con las dos puntas vivas), ¿se cerró alguna vez?
    → (veredicto | None, texto). Con None el texto es la razón de que no haya evidencia."""
    if desde_epoch is None:
        return None, "no se sabe desde cuándo la Mac corre esta versión"
    ev = [b for b in ble if b["t"] is not None and b["t"] >= desde_epoch]
    if not ev:
        return None, "no hay registro del enlace Bluetooth desde que la Mac corre esta versión (%s)" % _hora(desde_epoch)
    fin = max(b["t"] for b in ev)
    ini = max(desde_epoch, min(b["t"] for b in ev))
    if fin - ini < 3600:
        return None, "desde que la Mac corre esta versión solo hay %d min de registro del enlace; se piden 60" % int((fin - ini) // 60)
    v0 = fin - 3600
    vida = vida_en_ventana(lineas, v0, fin)
    if vida["mac"][0] == 0:
        return None, "la Mac no da señal en la última hora del registro"
    if vida["tablet"][0] == 0:
        return None, ("la tablet no da señal desde %s" % _hora(_ultima_vez(lineas, True, fin))) if _ultima_vez(lineas, True, fin) else "la tablet no da señal en todo el registro"
    if vida["tablet"][2] < TRAMOS_MIN_TABLET:
        return None, "la tablet solo dio señal en %d de %d tramos de diez minutos de la última hora (última a las %s)" % (
            vida["tablet"][2], TRAMOS_VIDA, _hora(vida["tablet"][1]))
    cierres = [b for b in ev if b["t"] >= v0 and b["tipo"] in ("enlace-cerrado", "conexion-vencida", "envio-fallido")]
    if cierres:
        return "falla", "En la última hora del registro el enlace Bluetooth se cerró o falló %d veces." % len(cierres)
    return "bien", "En la última hora del registro el enlace Bluetooth no se cerró ni falló."


def sugerir(comprobaciones, pares, llamadas_todas, version_mac, ble_eventos, mac, lineas=(), prob=None):
    """PURA. `pares` = [(llamada, grupo)] de más reciente a más antigua; `mac` lleva `version_desde` (ISO | None).
    Una comprobación solo se juzga con evidencia hecha mientras la Mac corría esa versión.
    → (sugerencias, sin_evidencia, nota)."""
    sugerencias, sin, nota = [], [], None
    pruebas = (comprobaciones or {}).get("pruebas") or {}
    nums_mac = re.search(r"prueba\.(\d+)$", version_mac or "")
    instalada = nums_mac.group(1) if nums_mac else None
    con_senal = [(n, c) for n, p in pruebas.items() for c in p.get("comprobaciones", []) if c.get("senal")]
    if not con_senal:
        return [], [], "Ninguna comprobación lleva señal todavía (comprobaciones_prueba.py senales N)."
    desde = _a_epoch(mac.get("version_desde")) if mac.get("version_desde") else None

    def sin_ev(n, c, razon):
        sin.append({"prueba": int(n), "comprobacion": c["id"], "senal": c["senal"], "razon": razon[:1].upper() + razon[1:] + ".",
                    "produciria": PRODUCIRIA.get(c["senal"], "evidencia hecha con esta versión")})

    if instalada is None:
        for n, c in con_senal:
            sin_ev(n, c, "la versión instalada de la Mac no se conoce")
        return [], sin, "La versión instalada de la Mac no se conoce: no se propone nada."
    ajenas = sorted({n for n, _ in con_senal if n != instalada}, key=int)
    if ajenas and not any(n == instalada for n, _ in con_senal):
        for n, c in con_senal:
            sin_ev(n, c, "la Mac tiene instalada la %s y esta comprobación es de la %s" % (version_mac, n))
        return [], sin, "La Mac tiene instalada la %s; las comprobaciones son de la %s." % (version_mac, " y la ".join(ajenas))
    pares = [(ll, g) for ll, g in pares if not ll.get("ilegible")]          # las que no se pudieron construir no deciden
    propias = [(ll, g) for ll, g in pares if ll.get("version_relacion") == "esta"]
    ajenas_ll = [ll for ll, _ in pares if ll.get("version_relacion") != "esta"]
    for n, c in con_senal:
        if n != instalada:
            sin_ev(n, c, "la Mac tiene instalada la %s y esta comprobación es de la %s" % (version_mac, n))
            continue
        s = c["senal"]
        if desde is None:
            sin_ev(n, c, "no se sabe desde cuándo la Mac corre la %s" % version_mac)
            continue
        veredicto, motivo, usada, razon = None, "", None, ""
        try:
            if s == "arranque-limpio":
                arr = _a_epoch(mac.get("ultimo_arranque")) if mac.get("ultimo_arranque") else None
                if arr is None or arr < desde:
                    razon = "el último arranque registrado (%s) es anterior a la actualización a la %s (%s)" % (
                        mac.get("ultimo_arranque") or "ninguno", version_mac, _hora(desde))
                elif mac.get("errores_arranque"):
                    veredicto, motivo = "falla", "El arranque dejó %d error(es): %s" % (len(mac["errores_arranque"]), mac["errores_arranque"][0]["texto"][:120])
                elif mac.get("app_abierta"):
                    veredicto, motivo = "bien", "La app arrancó a las %s, después de actualizar, y el registro de arranque no tiene errores." % mac["ultimo_arranque"]
                else:
                    razon = "la app está cerrada y no se puede confirmar que el arranque siga limpio"
            elif s == "enlace-ble-hora":
                veredicto, motivo = _regla_ble(ble_eventos, list(lineas), desde)
                if veredicto is None:
                    razon, motivo = motivo, ""
            else:
                sin_dos = None
                for ll, g in propias:
                    if s in DOS_APARATOS and not ambas_puntas(ll):
                        sin_dos = sin_dos or ll
                        continue
                    v, mo = regla(s, ll, contexto_llamada(g))
                    if v:
                        veredicto, motivo, usada = v, mo, ll["id"]
                        break
                if not veredicto:
                    if sin_dos:
                        tab = _ultima_vez(list(lineas), True, _a_epoch(sin_dos["hasta"]) or 0)
                        razon = "en la llamada %s solo hay líneas de la Mac: la tablet no da señal %s" % (
                            sin_dos["id"], "desde " + _hora(tab) if tab else "en el registro")
                    elif propias:
                        razon = "ninguna llamada hecha con la %s permite decidirlo" % version_mac
                    elif ajenas_ll:
                        razon = "las llamadas del registro (la última, %s) son de otra versión; ninguna se hizo con la %s" % (
                            ajenas_ll[0]["id"], version_mac)
                    else:
                        razon = "no hay llamadas en el registro"
        except Exception as e:  # noqa: BLE001 — una señal que no se puede leer no tumba las demás
            veredicto, razon = None, "no se pudo leer la evidencia de esta señal (%s)" % describir_error(e)
            if prob is not None:
                prob.append({"donde": "%s/%s" % (n, s), "error": describir_error(e)})
        if veredicto:
            sugerencias.append({"prueba": int(n), "comprobacion": c["id"], "senal": s, "veredicto": veredicto,
                                "motivo": motivo, "llamada": usada})
        else:
            sin_ev(n, c, razon)
    if not sugerencias:
        nota = "Ninguna comprobación con señal de la %s tiene evidencia hecha con esta versión." % instalada
    return sugerencias, sin, nota


# ── todo junto ──────────────────────────────────────────────────────────────────────────────────────────────────

def aparatos_vistos(lineas, mac):
    """Mac primero; después cada nombre entre paréntesis que aparece en el registro."""
    vistos = {}
    for l in lineas:
        if l and l["nombre"]:
            a = vistos.setdefault(l["aparato"], {"nombre": l["nombre"], "visto": l["t"]})
            a["visto"] = max(a["visto"], l["t"])
    web_ult = {}
    for l in lineas:
        w = web_de(l["msg"]) if l else None
        if w and (l["aparato"] not in web_ult or l["t"] >= web_ult[l["aparato"]][1]):
            web_ult[l["aparato"]] = (w, l["t"])
    ult_mac = max([l["t"] for l in lineas if l and l["aparato"] == "mac"] or [0]) or None
    lista = [{"id": "mac", "nombre": "Esta Mac", "esta": True, "version": mac.get("version"),
              "version_de": "app-instalada" if mac.get("version") else None, "app_abierta": mac.get("app_abierta"),
              "ultimo_arranque": mac.get("ultimo_arranque"), "errores_arranque": mac.get("errores_arranque") or [],
              "visto": _a_iso(ult_mac), "version_desde": mac.get("version_desde"),
              "version_desde_fuente": mac.get("version_desde_fuente"),
              "web": (web_ult.get("mac") or (None, None))[0], "web_visto": _a_iso((web_ult.get("mac") or (None, None))[1])}]
    for a, d in sorted(vistos.items()):
        lista.append({"id": a, "nombre": "Tablet (%s)" % d["nombre"], "esta": False, "version": None, "version_de": None,
                      "app_abierta": None, "ultimo_arranque": None, "errores_arranque": [], "visto": _a_iso(d["visto"]),
                      "version_desde": None, "version_desde_fuente": None,
                      "web": (web_ult.get(a) or (None, None))[0], "web_visto": _a_iso((web_ult.get(a) or (None, None))[1])})
    return lista


def _llamada_ilegible(g, error):
    t0, t1 = g[0]["t"], g[-1]["t"]
    return {"id": "llamada-" + datetime.fromtimestamp(t0, timezone.utc).strftime("%Y%m%dT%H%M%S"),
            "desde": _a_iso(t0), "hasta": _a_iso(t1), "duracion_s": int(round(t1 - t0)), "con": None, "terminada": False,
            "medios": [], "enlaces": [], "kbps_rapido": None, "lados": {}, "ilegible": True, "error": error}


def construir(texto_log, mac, comprobaciones, ahora_epoch):
    """El archivo de evidencia completo (sin `t` ni `cada_s`, que pone quien escribe). Nunca se cae por una línea o una
    llamada: lo que no se puede leer se cuenta y se nombra (`fuente.ilegibles`, `problemas`) y lo demás se escribe."""
    prob = []
    validas, ilegibles, ejemplo = [], 0, None
    for x in texto_log.splitlines():
        if not x.strip():
            continue
        try:
            l = parse_linea(x)
        except Exception:  # noqa: BLE001
            l = None
        if l is None or l.get("t") is None:
            ilegibles += 1
            ejemplo = ejemplo or limpiar(x, 160)
        else:
            validas.append(l)
    ble = [l for l in validas if l["canal"] == "ble"]
    llamadas, grupos_rec = [], []
    try:
        grupos = agrupar_llamadas(validas)
        grupos_rec = sorted(grupos, key=lambda g: g[0]["t"], reverse=True)[:MAX_LLAMADAS]
    except Exception as e:  # noqa: BLE001
        prob.append({"donde": "llamadas/agrupar", "error": describir_error(e)})
    desde = _a_epoch(mac.get("version_desde")) if mac.get("version_desde") else None
    for g in grupos_rec:
        try:
            ll = construir_llamada(g, ble, prob)
        except Exception as e:  # noqa: BLE001
            ll = _llamada_ilegible(g, describir_error(e))
            prob.append({"donde": ll["id"], "error": ll["error"]})
        rel = relacion_version(ll["desde"], desde)
        ll["version_relacion"] = rel
        ll["version_mac"] = mac.get("version") if rel == "esta" else (mac.get("version_anterior") if rel == "otra" else None)
        llamadas.append(ll)
    try:
        sug, sin, nota = sugerir(comprobaciones, list(zip(llamadas, grupos_rec)), llamadas, mac.get("version"), ble, mac, validas, prob)
    except Exception as e:  # noqa: BLE001
        prob.append({"donde": "sugerencias", "error": describir_error(e)})
        sug, sin, nota = [], [], "No se pudieron calcular las sugerencias: %s" % describir_error(e)
    try:
        aparatos = aparatos_vistos(validas, mac)
    except Exception as e:  # noqa: BLE001
        prob.append({"donde": "aparatos", "error": describir_error(e)})
        aparatos = []
    ts = [l["t"] for l in validas]
    return {"formato": 1,
            "fuente": {"lineas": len(validas), "desde": _a_iso(min(ts)) if ts else None, "hasta": _a_iso(max(ts)) if ts else None,
                       "ilegibles": {"lineas": ilegibles, "ejemplo": ejemplo}},
            "aparatos": aparatos, "llamadas": llamadas, "sugerencias": sug, "sin_evidencia": sin,
            "sugerencias_nota": nota, "problemas_total": len(prob), "problemas": prob[:5]}


MEMORIA_REFRESCO_S = 600


def actualizar_memoria(mem, version, sello_epoch, ahora_epoch):
    """PURA. La memoria de «desde cuándo corre esta Mac la versión X» → (memoria nueva, ¿hay que escribirla?).
    Vive en un archivo propio, así que sobrevive a reinicios de la Mac y del servicio y a las actualizaciones.
    - misma versión que la memoria: se conserva `desde` (solo se refresca `visto`, a lo sumo cada 10 min);
    - versión nueva: `desde` = el instante en que se instaló el paquete (`sello_epoch`), pero nunca antes de la última
      vez que se vio la versión anterior; sin sello (o sin memoria ni sello) = ahora, que es lo prudente."""
    if not version:
        return mem, False
    ahora_iso = _a_iso(ahora_epoch)
    if isinstance(mem, dict) and mem.get("version") == version and mem.get("desde"):
        visto = _a_epoch(mem.get("visto")) or 0
        if ahora_epoch - visto < MEMORIA_REFRESCO_S:
            return mem, False
        return dict(mem, visto=ahora_iso), True
    anterior = None
    piso = None
    if isinstance(mem, dict) and mem.get("version"):
        anterior = mem["version"]
        piso = _a_epoch(mem.get("visto"))
    if sello_epoch is None:
        desde, fuente = ahora_epoch, "primera-vez-visto"
    elif piso is not None and sello_epoch < piso:
        desde, fuente = piso, "ultima-vez-vista-la-anterior"
    else:
        desde, fuente = sello_epoch, "paquete-instalado"
    return {"formato": 1, "version": version, "desde": _a_iso(desde), "fuente": fuente, "visto": ahora_iso,
            "anterior": anterior}, True


def resumen_texto(banco, prueba=None, cid=None):
    """Para «pedir arreglo»: dos o tres líneas con lo que sabe el banco (sin rutas ni claves)."""
    if not banco:
        return "Sin evidencia de aparatos todavía."
    lin = []
    for a in banco.get("aparatos", []):
        lin.append("%s: versión %s%s" % (a["nombre"], a.get("version") or "desconocida",
                                         "" if a.get("app_abierta") is None else (", app abierta" if a["app_abierta"] else ", app cerrada")))
    ll = banco.get("llamadas") or []
    if ll:
        u = ll[0]
        lin.append("Última llamada %s (%d s, medios %s, enlaces %s)" % (u["desde"], u["duracion_s"], "/".join(u["medios"]) or "—", "/".join(u["enlaces"]) or "—"))
    else:
        lin.append("Sin llamadas en el registro.")
    for s in banco.get("sugerencias", []):
        if (prueba is None or s["prueba"] == prueba) and (cid is None or s["comprobacion"] == cid):
            lin.append("El banco propone «%s» para %s: %s" % (s["veredicto"], s["comprobacion"], s["motivo"]))
    for e in banco.get("sin_evidencia") or []:
        if (prueba is None or e["prueba"] == prueba) and (cid is None or e["comprobacion"] == cid):
            lin.append("Sin evidencia aún con esta versión para %s: %s" % (e["comprobacion"], e["razon"]))
    return "\n".join(lin)


# ── arranque de la app (servidor-local.log) ─────────────────────────────────────────────────────────────────────

_EPOCH_MS = re.compile(r"^(\d{13}) (.*)$")
_ERROR = re.compile(r"(error|panic|fatal|no se pudo|fall[oó]|EADDRINUSE|ENOENT|EACCES|cannot|can't)", re.I)
VENTANA_ARRANQUE_S = 300


def info_arranque(texto):
    """PURA. Texto de `servidor-local.log` → (ultimo_arranque ISO | None, errores de los 5 min siguientes).
    El registro empieza cada línea con los milisegundos del sistema; las del servidor de Next no llevan hora y
    se cuentan con la última línea con hora que las precede."""
    lineas = texto.splitlines()
    inicio = None
    for i, l in enumerate(lineas):
        m = _EPOCH_MS.match(l)
        if m and "lanzando" in m.group(2):
            inicio = i
    if inicio is None:
        return None, []
    t0 = int(_EPOCH_MS.match(lineas[inicio]).group(1)) / 1000.0
    errores, t_actual = [], t0
    for l in lineas[inicio + 1:]:
        m = _EPOCH_MS.match(l)
        if m:
            t_actual = int(m.group(1)) / 1000.0
            cuerpo = m.group(2)
        else:
            cuerpo = l
        if t_actual - t0 > VENTANA_ARRANQUE_S:
            break
        if _ERROR.search(cuerpo) and len(errores) < 5:
            errores.append({"t": _a_iso(t_actual), "texto": limpiar(cuerpo, 200)})
    return _a_iso(t0), errores


def firma_de(*partes):
    import hashlib
    return hashlib.sha1("|".join(str(p) for p in partes).encode("utf-8")).hexdigest()[:16]
