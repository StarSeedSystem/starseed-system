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


def metricas_lado(ls, t_ini, t_fin):
    """Las líneas de UNA punta de la llamada → voz, video, camara, lineas (None donde esa punta no tuvo ese medio)."""
    voz_tx, voz_rx, niveles, repartos, vtx, vrx, cam = [], [], [], [], [], [], []
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
            est = "pausa" if "reparto pausa" in m else "activo"
            repartos.append((l["t"], est, kv(m), (re.search(r"motivo=(\S+)", m) or [None, None])[1]))
        elif "video-datos tx" in m:
            vtx.append((l["t"], kv(m)))
        elif "video-datos rx" in m:
            vrx.append((l["t"], kv(m)))
        elif m.startswith("camara"):
            cam.append((l["t"], m))
    voz = None
    if voz_tx or voz_rx or niveles:
        ns = [_num(k.get("n")) for _, k, _ in voz_tx] + [x for _, a, b, _, _ in niveles for x in (a, b)]
        ops = [_num(k.get("opus")) for _, k, _ in voz_tx] + [_num(k.get("opus")) for *_, k, _ in niveles]
        esp = [_num(k.get("espera")) for _, k, _ in voz_tx] + [_num(k.get("espera-voz")) for _, _, k, _ in repartos] + \
              [_num(k.get("espera")) for *_, k, _ in niveles]
        n_lo, n_hi = _minmax(ns)
        o_lo, o_hi = _minmax(ops)
        mudo_s = 0.0
        for i, (t, _, mudo) in enumerate(voz_tx):
            if mudo:
                mudo_s += (voz_tx[i + 1][0] - t) if i + 1 < len(voz_tx) else 5.0
        voz = {"nivel_min": _redondea(n_lo, 0), "nivel_max": _redondea(n_hi, 0),
               "opus_kbps_min": _redondea(o_lo), "opus_kbps_max": _redondea(o_hi),
               "inventado_pct_max": _redondea(_minmax([_num(k.get("inventado")) for _, k in voz_rx])[1]),
               "perdida_pct_max": _redondea(_minmax([_num(k.get("perd")) for _, k in voz_rx])[1]),
               "tarde_pct_max": _redondea(_minmax([float(rx.group(2)) for *_, rx in niveles if rx] or [None])[1]),
               "jitter_ms_max": _redondea(_minmax([_num(k.get("jitter")) for _, k in voz_rx])[1], 0),
               "espera_voz_ms_max": _redondea(_minmax(esp)[1], 0),
               "mudo_s": _redondea(mudo_s, 0) if voz_tx else None}
    video = None
    if repartos or vtx or vrx:
        activos = [_num(k.get("fps")) for _, e, k, _ in repartos if e == "activo"]
        todos = [(_num(k.get("fps")) if e == "activo" else 0.0) for _, e, k, _ in repartos]
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
        ult_tx = vtx[-1][1] if vtx else {}
        ult_rx = vrx[-1][1] if vrx else {}
        t0 = min([x[0] for x in repartos + vtx + vrx])
        t1 = max([x[0] for x in repartos + vtx + vrx])
        dur = max(t1 - t0, 1.0)
        pint = _num(ult_rx.get("pintados"))
        video = {"fps_activo": _fps(activos), "fps_medio": _redondea(sum(todos) / len(todos)) if todos else None,
                 "fps_recibidos_med": _redondea(pint / dur) if pint is not None else None,
                 "enviados": _redondea(_num(ult_tx.get("enviados")), 0), "descartados": _redondea(_num(ult_tx.get("descartados")), 0),
                 "negros": _redondea(_num(ult_tx.get("negros")), 0), "pintados": _redondea(pint, 0),
                 "errores_rx": _redondea(_num(ult_rx.get("errores")), 0), "pausas": pausas}
    camara = None
    if cam:
        abiertas = []
        for _, m in cam:
            a = re.search(r'abierta="([^"]+)"', m) or re.search(r'abierta elegida="([^"]+)"', m)
            if a and a.group(1) not in abiertas:
                abiertas.append(a.group(1))
        errores = [m for _, m in cam if re.search(r"\b(fall[oó]|error|denegad|no-abre|NotReadable|Overconstrained)", m)]
        camara = {"intentos": sum(1 for _, m in cam if m.startswith("camara intento")),
                  "abierta": abiertas[-1] if abiertas else None, "distintas": len(abiertas),
                  "ok": bool(abiertas) and not errores, "error": limpiar(errores[0], 160) if errores else None}
    relevantes = [l for l in ls if _es_relevante(l) and "visibilidad" not in l["msg"]]
    elegidas, vistos = [], set()
    for l in relevantes:  # unas pocas de cada tipo, para ver de dónde salen los números
        clave = re.sub(r"[\d.]+", "#", l["msg"])[:40]
        if clave not in vistos and len(elegidas) < MAX_LINEAS_CRUDAS:
            vistos.add(clave)
            elegidas.append(limpiar(l["raw"]))
    return {"voz": voz, "video": video, "camara": camara, "lineas": elegidas}


def construir_llamada(grupo, lineas_ble):
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
    lados = {a: metricas_lado(ls, t0, t1) for a, ls in por_aparato.items()}
    lados.setdefault("mac", None)
    otros = [a for a in por_aparato if a != "mac"]
    return {"id": "llamada-" + datetime.fromtimestamp(t0, timezone.utc).strftime("%Y%m%dT%H%M%S"),
            "desde": _a_iso(t0), "hasta": _a_iso(t1), "duracion_s": int(round(t1 - t0)),
            "con": otros[0] if otros else None, "terminada": any(_es_colgar(l) for l in grupo),
            "medios": medios, "enlaces": enlaces,
            "kbps_rapido": {"min": _redondea(min(kb)), "max": _redondea(max(kb)), "muestras": len(kb)} if kb else None,
            "lados": lados}


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
            if dur >= 10 and peor <= 20:
                return "bien", "La voz fue por el enlace de datos (Bluetooth) durante %d s, con pérdida máxima %s %%." % (dur, _redondea(peor))
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
        medias = {a: v["fps_medio"] for a, v in video.items() if v["fps_medio"] is not None}
        if len(medias) < 2:
            return None, ""
        dur_txt = "" if dur >= 120 else " (la llamada duró %d s, menos de los 2 min pedidos)" % dur
        resumen = ", ".join("%s %s" % (a, _redondea(f)) for a, f in sorted(medias.items()))
        if all(f >= 3 for f in medias.values()):
            return "bien", "Imágenes por segundo medias por punta: %s%s." % (resumen, dur_txt)
        return "falla", "Imágenes por segundo medias por punta: %s; se pedían 3 o más%s." % (resumen, dur_txt)
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
        if not voz or not pausas:
            return None, ""
        inv = max((v["inventado_pct_max"] or 0) for v in voz.values())
        if inv <= 10:
            return "bien", "Con el enlace justo (vídeo en pausa por «suelo») la voz inventada llegó como mucho a %s %%." % _redondea(inv)
        return "falla", "Con el enlace justo la voz inventada llegó al %s %%." % _redondea(inv)
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


def sugerir(comprobaciones, grupos, llamadas, version_mac, ble_eventos, mac, ahora_epoch):
    """PURA. `comprobaciones` = datos normalizados de pruebas-comprobaciones.json. → (sugerencias, nota)."""
    sugerencias, nota = [], None
    pruebas = (comprobaciones or {}).get("pruebas") or {}
    nums_mac = re.search(r"prueba\.(\d+)$", version_mac or "")
    instalada = nums_mac.group(1) if nums_mac else None
    con_senal = [(n, c) for n, p in pruebas.items() for c in p.get("comprobaciones", []) if c.get("senal")]
    if not con_senal:
        return [], "Ninguna comprobación lleva señal todavía (comprobaciones_prueba.py senales N)."
    if instalada is None:
        return [], "La versión instalada de la Mac no se conoce: no se propone nada."
    ajenas = sorted({n for n, _ in con_senal if n != instalada}, key=int)
    if ajenas and not any(n == instalada for n, _ in con_senal):
        return [], "La Mac tiene instalada la %s; las comprobaciones son de la %s." % (
            version_mac, " y la ".join(ajenas))
    # las llamadas, de la más reciente a la más antigua, con su contexto
    pares = list(zip(llamadas, grupos))
    for n, c in con_senal:
        if n != instalada:
            continue
        s = c["senal"]
        veredicto, motivo, usada = None, "", None
        if s == "arranque-limpio":
            if mac.get("app_abierta") and not mac.get("errores_arranque"):
                veredicto, motivo = "bien", "La app está abierta y el registro de arranque no tiene errores."
            elif mac.get("errores_arranque"):
                veredicto, motivo = "falla", "El arranque dejó %d error(es): %s" % (len(mac["errores_arranque"]), mac["errores_arranque"][0]["texto"][:120])
        elif s == "enlace-ble-hora":
            veredicto, motivo = _regla_ble(ble_eventos, ahora_epoch)
        else:
            for ll, g in pares:
                v, mo = regla(s, ll, contexto_llamada(g))
                if v:
                    veredicto, motivo, usada = v, mo, ll["id"]
                    break
        if veredicto:
            sugerencias.append({"prueba": int(n), "comprobacion": c["id"], "senal": s, "veredicto": veredicto,
                                "motivo": motivo, "llamada": usada})
    if not sugerencias:
        nota = "Ninguna llamada del registro permite decidir las comprobaciones con señal de la %s." % instalada
    return sugerencias, nota


def _regla_ble(ble, ahora_epoch):
    """enlace-ble-hora: en la última hora de registro del enlace, ¿se cerró alguna vez?"""
    if not ble:
        return None, ""
    fin = max(b["t"] for b in ble)
    ini = min(b["t"] for b in ble)
    if fin - ini < 3600:
        return None, ""
    ventana = [b for b in ble if b["t"] >= fin - 3600]
    cierres = [b for b in ventana if b["tipo"] in ("enlace-cerrado", "conexion-vencida", "envio-fallido")]
    if cierres:
        return "falla", "En la última hora del registro el enlace Bluetooth se cerró o falló %d veces." % len(cierres)
    return "bien", "En la última hora del registro el enlace Bluetooth no se cerró ni falló."


# ── todo junto ──────────────────────────────────────────────────────────────────────────────────────────────────

def aparatos_vistos(lineas, mac):
    """Mac primero; después cada nombre entre paréntesis que aparece en el registro."""
    vistos = {}
    for l in lineas:
        if l and l["nombre"]:
            a = vistos.setdefault(l["aparato"], {"nombre": l["nombre"], "visto": l["t"]})
            a["visto"] = max(a["visto"], l["t"])
    ult_mac = max([l["t"] for l in lineas if l and l["aparato"] == "mac"] or [0]) or None
    lista = [{"id": "mac", "nombre": "Esta Mac", "esta": True, "version": mac.get("version"),
              "version_de": "app-instalada" if mac.get("version") else None, "app_abierta": mac.get("app_abierta"),
              "ultimo_arranque": mac.get("ultimo_arranque"), "errores_arranque": mac.get("errores_arranque") or [],
              "visto": _a_iso(ult_mac)}]
    for a, d in sorted(vistos.items()):
        lista.append({"id": a, "nombre": "Tablet (%s)" % d["nombre"], "esta": False, "version": None, "version_de": None,
                      "app_abierta": None, "ultimo_arranque": None, "errores_arranque": [], "visto": _a_iso(d["visto"])})
    return lista


def construir(texto_log, mac, comprobaciones, ahora_epoch):
    """El archivo de evidencia completo (sin `t` ni `cada_s`, que pone quien escribe)."""
    lineas = [parse_linea(x) for x in texto_log.splitlines()]
    validas = [l for l in lineas if l]
    grupos = agrupar_llamadas(validas)
    ble = [l for l in validas if l["canal"] == "ble"]
    grupos_rec = sorted(grupos, key=lambda g: g[0]["t"], reverse=True)[:MAX_LLAMADAS]
    llamadas = [construir_llamada(g, ble) for g in grupos_rec]
    sug, nota = sugerir(comprobaciones, grupos_rec, llamadas, mac.get("version"), ble, mac, ahora_epoch)
    ts = [l["t"] for l in validas if l["t"] is not None]
    return {"formato": 1,
            "fuente": {"lineas": len(validas), "desde": _a_iso(min(ts)) if ts else None, "hasta": _a_iso(max(ts)) if ts else None},
            "aparatos": aparatos_vistos(validas, mac), "llamadas": llamadas, "sugerencias": sug, "sugerencias_nota": nota}


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
