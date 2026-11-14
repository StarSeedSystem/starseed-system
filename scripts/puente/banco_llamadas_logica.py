# -*- coding: utf-8 -*-
"""Serie de llamadas de prueba automáticas: la lógica PURA (BAN1114C · architecture/ronda-automatica-llamadas.md, fase 1).

Nada de aquí toca el disco, la red, el reloj ni un shell. `banco_llamadas.py` reúne los hechos y actúa.

Qué hay aquí: la gramática de las marcas `banco …` del registro (`parse_marca`, apéndice §9 del contrato), la orden
`orden.json` v1, los umbrales de calma (§5), el juicio de una llamada (§3) y el veredicto de una serie (§3.3).
Regla de honestidad (§2): todo veredicto lleva `medio_real:false` y la palabra «simulado»; el banco SUGIERE, nunca marca.
"""
import os
import re

import banco_pruebas_logica as BL

ESCENARIOS = {
    # c2 y c3: vídeo de 2 min solo por Bluetooth, cuelga la Mac. «sin-ip-desde-inicio» es un sustituto del medio (§2).
    "ble-video-2min": {"tipo": "video", "medio": "sin-ip-desde-inicio", "dur_s": 120, "rep": 10,
                       "guion": [{"t_s": 120, "quien": "mac", "accion": "colgar"}], "cuelga": "mac",
                       "comprobaciones": ("c2", "c3"), "simulado": True},
}
REP_MAX = 10
EVENTOS = ("armada", "apagada", "sondeo", "inicio", "contesta", "fin", "calma", "rechaza")
EVENTOS_DE_LLAMADA = ("inicio", "contesta", "fin", "rechaza")      # llevan esc, serie y n
MOTIVOS_RECHAZO = {
    "modo-apagado": "el modo banco está apagado en la tableta",
    "falta-permiso": "falta el permiso de cámara o micrófono en la tableta",
    "otra-llamada": "la tableta tiene otra llamada en curso",
    "orden-caducada": "la orden llegó caducada",
}
_ID = re.compile(r"^[a-z0-9][a-z0-9-]{2,39}$")
_MARCA = re.compile(r"^banco (?P<ev>[a-z]+)(?: (?P<resto>.*))?$")


def _num(txt):
    return BL._num(txt)


# ── la gramática de las marcas (apéndice §9 del contrato) ───────────────────────────────────────────────────────

def parse_marca(msg):
    """PURA. El mensaje de una línea `llamada` → {evento, esc, serie, n, campos, motivo} o None si no es una marca válida.
    Una marca con un id mal formado, un `n` fuera de 1…999, un motivo de rechazo desconocido o sin los campos de su
    evento NO es una marca: se descarta (nunca se interpreta a medias)."""
    m = _MARCA.match((msg or "").strip())
    if not m or m.group("ev") not in EVENTOS:
        return None
    ev = m.group("ev")
    campos = {k: v for k, v in BL._KV.findall(m.group("resto") or "")}
    out = {"evento": ev, "esc": campos.get("esc"), "serie": campos.get("serie"), "n": None, "campos": campos, "motivo": None}
    if ev in EVENTOS_DE_LLAMADA:
        n = campos.get("n")
        if not (out["esc"] and _ID.match(out["esc"]) and out["serie"] and _ID.match(out["serie"]) and n and n.isdigit() and 1 <= int(n) <= 999):
            return None
        out["n"] = int(n)
    if ev == "rechaza":
        if campos.get("motivo") not in MOTIVOS_RECHAZO:
            return None
        out["motivo"] = campos["motivo"]
    if ev == "armada" and not (campos.get("con") and BL._UUID.fullmatch(campos["con"])):
        return None
    if ev == "fin" and campos.get("cuelga") not in ("mac", "tableta"):
        return None
    if ev == "contesta" and campos.get("camara") not in ("si", "no"):
        return None
    return out


def marcas_de_lineas(lineas):
    """PURA. Líneas parseadas (`banco_pruebas_logica.parse_linea`) → [{…parse_marca, t, aparato}] por hora."""
    fuera = []
    for l in lineas or []:
        if l and l.get("tipo") == "llamada" and l.get("t") is not None:
            mk = parse_marca(l["msg"])
            if mk:
                mk["t"], mk["aparato"] = l["t"], l["aparato"]
                fuera.append(mk)
    return sorted(fuera, key=lambda x: x["t"])


def estado_app(marcas, ahora, viva_s=90):
    """PURA. Lo que se sabe de la app de la Mac por sus marcas (las del aparato `mac`). → dict
    {armada, viva, con, hasta, ultima_t, motivo}. Prueba de vida: la marca más reciente de la Mac entre armada, sondeo,
    inicio, fin y calma; vale si tiene ≤ `viva_s`. Armada: la más reciente entre armada y apagada es «armada» y su
    `hasta` (ISO, si lo trae) no ha pasado."""
    mac = [x for x in marcas if x["aparato"] == "mac"]
    vida = [x for x in mac if x["evento"] in ("armada", "sondeo", "inicio", "fin", "calma")]
    ult = vida[-1]["t"] if vida else None
    estado = [x for x in mac if x["evento"] in ("armada", "apagada")]
    armada = bool(estado) and estado[-1]["evento"] == "armada"
    con = hasta = None
    if armada:
        con = estado[-1]["campos"]["con"]
        hasta = BL._a_epoch(estado[-1]["campos"].get("hasta") or "")
        if hasta is not None and hasta <= ahora:
            armada = False
    viva = ult is not None and ahora - ult <= viva_s
    if not armada:
        motivo = ("la app de la Mac no está en modo banco o no sondea desde las %s" % _hhmm(ult)) if ult else \
                 "la app de la Mac no está en modo banco o no sondea: no hay ninguna marca «banco» suya en el registro"
    elif not viva:
        motivo = "la app de la Mac no está en modo banco o no sondea desde las %s" % _hhmm(ult)
    else:
        motivo = None
    return {"armada": armada, "viva": viva, "con": con, "hasta": hasta, "ultima_t": ult, "motivo": motivo}


def _hhmm(epoch):
    import time
    return time.strftime("%H:%M", time.localtime(epoch)) if epoch is not None else "?"


# ── la orden (§1.2, orden.json v1) ──────────────────────────────────────────────────────────────────────────────

def id_serie(ahora):
    return "s" + BL._a_iso(ahora).replace("-", "").replace(":", "").replace("T", "-")[:13].lower()


def construir_orden(esc, serie, n, de_n, para, ahora, caduca_s):
    """PURA. La orden `orden.json` v1 con lista cerrada de acciones; sin texto libre."""
    e = ESCENARIOS[esc]
    return {"v": 1, "serie": serie, "n": n, "de_n": de_n, "escenario": esc, "para": para, "tipo": e["tipo"], "medio": e["medio"],
            "guion": [dict(g) for g in e["guion"]], "dur_s": e["dur_s"], "creada": BL._a_iso(ahora), "caduca": BL._a_iso(ahora + caduca_s)}


# ── calma (§5) ──────────────────────────────────────────────────────────────────────────────────────────────────

class Umbrales(object):
    """Los umbrales de §5. `STARSEED_BANCO_<NOMBRE>` los cambia (las pruebas)."""
    DEFECTO = {"carga_ini": None, "carga_dur": 6.0, "libre_pct": 25.0, "swap_pct": 85.0, "swapouts_ini": 2000.0,
               "swapouts_dur": 4000.0, "disco_ini_gb": 8.0, "disco_dur_gb": 6.0,
               "lecturas": 3, "ventana_s": 120.0, "cada_s": 30.0, "espera_calma_s": 7200.0}

    def __init__(self, env=None, nucleos=None):
        env = os.environ if env is None else env
        import ronda as R
        v = dict(self.DEFECTO)
        v["carga_ini"] = R.carga_maxima(nucleos or 8)
        for k in list(v):
            try:
                v[k] = float(env["STARSEED_BANCO_" + k.upper()])
            except (KeyError, ValueError):
                pass
        v["lecturas"] = int(v["lecturas"])
        self.__dict__.update(v)


def _f(x, d=1):
    return ("%.*f" % (d, x)).replace(".", ",") if isinstance(x, (int, float)) else "sin dato"


def evaluar_calma(lec, u, fase):
    """PURA. Una lectura → (ok, fallos, notas). `fase` = 'inicio' (para empezar) o 'durante' (dentro de una llamada).
    Un valor que no se pudo leer es un fallo al empezar y una nota durante la llamada: nunca pasa en silencio."""
    fallos, notas = [], []
    ini = fase == "inicio"
    if lec.get("pesados"):
        fallos.append("hay trabajo pesado en marcha (%s)" % ", ".join(lec["pesados"]))
    c = lec.get("carga1")
    tope = u.carga_ini if ini else u.carga_dur
    if c is None:
        fallos.append("no pude leer la carga de la Mac")
    elif c > tope:
        fallos.append("carga 1 min %s > %s" % (_f(c), _f(tope)))
    p = lec.get("presion")
    if p is None:
        (fallos if ini else notas).append("no pude leer la presión de memoria")
    elif ini and p != 1:
        fallos.append("presión de memoria %d (se pide 1, normal)" % p)
    elif not ini and p >= 4:
        fallos.append("presión de memoria crítica (%d)" % p)
    elif not ini and p == 2:
        notas.append("presión de memoria en aviso (2)")
    lib = lec.get("libre_pct")
    if lib is None:
        (fallos if ini else notas).append("no pude leer la memoria libre")
    elif lib < u.libre_pct:
        (fallos if ini else notas).append("memoria libre %s %% < %s %%" % (_f(lib, 0), _f(u.libre_pct, 0)))
    sw = lec.get("swap_pct")
    if sw is None:
        (fallos if ini else notas).append("no pude leer el swap en uso")
    elif sw > u.swap_pct:
        (fallos if ini else notas).append("swap en uso %s %% > %s %%" % (_f(sw, 0), _f(u.swap_pct, 0)))
    so = lec.get("swapouts_min")
    tope_so = u.swapouts_ini if ini else u.swapouts_dur
    if so is None:
        (fallos if ini else notas).append("aún sin dato de swap activo (hacen falta dos lecturas)")
    elif so > tope_so:
        fallos.append("swap activo %s páginas/min > %s" % (_f(so, 0), _f(tope_so, 0)))
    d = lec.get("disco_gb")
    tope_d = u.disco_ini_gb if ini else u.disco_dur_gb
    if d is None:
        (fallos if ini else notas).append("no pude leer el disco libre")
    elif d < tope_d:
        fallos.append("disco libre %s GB < %s GB" % (_f(d), _f(tope_d)))
    return (not fallos), fallos, notas


def calma_para_empezar(historial, u):
    """PURA. `historial` = [{t, ok, fallos}] (las lecturas de fase 'inicio', antiguas primero).
    ¿Las últimas `lecturas` son buenas y caben en `ventana_s`? → (bool, motivo del último fallo | None)."""
    if not historial:
        return False, "todavía no hay lecturas"
    ult = historial[-1]
    if not ult["ok"]:
        return False, "; ".join(ult["fallos"])
    ult_n = historial[-u.lecturas:]
    if len(ult_n) < u.lecturas or not all(x["ok"] for x in ult_n):
        return False, "faltan lecturas buenas seguidas (%d de %d)" % (sum(1 for _ in _racha(historial)), u.lecturas)
    if ult_n[-1]["t"] - ult_n[0]["t"] > u.ventana_s:
        return False, "las %d lecturas buenas no caben en %d s" % (u.lecturas, u.ventana_s)
    return True, None


def _racha(historial):
    for x in reversed(historial):
        if not x["ok"]:
            return
        yield x


def tasa_swapouts(muestras, t, valor, minimo_s=45.0):
    """PURA. Páginas por minuto de «Swapouts» de vm_stat: contra la muestra más reciente con ≥ `minimo_s` de antigüedad.
    `muestras` = [(t, valor)] (la lista se amplía). None si aún no hay una muestra tan vieja o falta el valor."""
    if valor is None:
        return None
    muestras.append((t, valor))
    del muestras[:-40]
    viejas = [m for m in muestras if t - m[0] >= minimo_s]
    if not viejas:
        return None
    t0, v0 = viejas[-1]
    return max(0.0, (valor - v0) * 60.0 / (t - t0))


def parse_swapusage(texto):
    """«vm.swapusage: total = 10240.00M  used = 8905.00M …» → % usado, o None."""
    mt = re.search(r"total = ([\d.]+)M", texto or "")
    mu = re.search(r"used = ([\d.]+)M", texto or "")
    if not (mt and mu) or float(mt.group(1)) <= 0:
        return None
    return 100.0 * float(mu.group(1)) / float(mt.group(1))


def parse_memoria_libre(texto):
    """Último renglón de `memory_pressure -Q`: «System-wide memory free percentage: 39%» → 39.0, o None."""
    m = re.findall(r"free percentage:\s*(\d+)%", texto or "")
    return float(m[-1]) if m else None


def parse_swapouts(texto):
    """`vm_stat`: «Swapouts:   123456.» → páginas acumuladas, o None."""
    m = re.search(r"^Swapouts:\s*(\d+)", texto or "", re.M)
    return float(m.group(1)) if m else None


def resumen_calma(lecturas):
    """PURA. Mín./máx. de lo medido durante una llamada, para `banco-llamadas.json`."""
    def mm(k):
        xs = [x[k] for x in lecturas if isinstance(x.get(k), (int, float))]
        return {"min": min(xs), "max": max(xs)} if xs else None
    return {"lecturas": len(lecturas), "carga1": mm("carga1"), "presion": mm("presion"), "libre_pct": mm("libre_pct"),
            "swap_pct": mm("swap_pct"), "swapouts_min": mm("swapouts_min"), "disco_gb": mm("disco_gb"),
            "notas": sorted({n for x in lecturas for n in x.get("notas", [])})}


def texto_calma_marca(lec, serie, n, fase):
    """El texto de la marca `banco calma` que escribe la app de la Mac a partir de `calma.json` (§5, última viñeta)."""
    def v(x, d=1):
        return "?" if x is None else ("%.*f" % (d, x))
    return "banco calma serie=%s n=%d fase=%s carga1=%s presion=%s libre=%s%% swap=%s%% swapouts_min=%s" % (
        serie, n, fase, v(lec.get("carga1")), "?" if lec.get("presion") is None else lec["presion"], v(lec.get("libre_pct"), 0),
        v(lec.get("swap_pct"), 0), v(lec.get("swapouts_min"), 0))


# ── el juicio de una llamada (§3) ───────────────────────────────────────────────────────────────────────────────

def ventana_de_llamada(lineas, serie, n):
    """PURA. Las líneas `llamada` de la llamada n de la serie, por MARCAS y no por huecos: desde 2 s antes de su
    `banco inicio` (Mac) hasta 8 s después de su `banco fin` (o, sin fin, hasta 60 s tras el inicio más la duración).
    → (lineas, marcas de esa llamada {evento: [marca]}). Sin `inicio` → ([], {})."""
    todas = [l for l in lineas if l and l.get("tipo") == "llamada" and l.get("t") is not None]
    mias = {}
    for mk in marcas_de_lineas(todas):
        if mk["serie"] == serie and mk["n"] == n:
            mias.setdefault(mk["evento"], []).append(mk)
    ini = [x for x in mias.get("inicio", []) if x["aparato"] == "mac"]
    if not ini:
        return [], mias
    t0 = ini[0]["t"] - 2
    fin = [x for x in mias.get("fin", []) if x["aparato"] == "mac"]
    t1 = fin[0]["t"] + 8 if fin else ini[0]["t"] + 60 + 120
    return sorted((l for l in todas if t0 <= l["t"] <= t1), key=lambda l: l["t"]), mias


def _conexion_webrtc(l):
    m = l["msg"]
    return m.startswith("medio=webrtc") and not any(x in m for x in ("ice=failed", "ruta IP nueva", "se reintenta"))


def _evidencia_tableta(grupo, t_mitad):
    """(hay `video-datos rx`, hay `voz-datos rx`) de la tableta DESPUÉS de la mitad de la llamada (§3)."""
    tab = [l for l in grupo if l["aparato"] != "mac" and l["t"] >= t_mitad]
    return (any("video-datos rx" in l["msg"] for l in tab), any("voz-datos rx" in l["msg"] for l in tab))


def evidencia_completa(lineas, serie, n):
    """PURA. ¿Ya llegaron las líneas de la tableta que el juicio necesita? → (bool, qué falta). La espera del paso 14."""
    grupo, mias = ventana_de_llamada(lineas, serie, n)
    ini = [x for x in mias.get("inicio", []) if x["aparato"] == "mac"]
    fin = [x for x in mias.get("fin", []) if x["aparato"] == "mac"]
    if not ini or not fin:
        return False, "falta la marca de inicio o de fin de la Mac"
    v, z = _evidencia_tableta(grupo, (ini[0]["t"] + fin[0]["t"]) / 2.0)
    falta = [n_ for n_, ok in (("video-datos rx", v), ("voz-datos rx", z)) if not ok]
    return (not falta), ("faltan líneas de la tableta: %s" % ", ".join(falta)) if falta else None


def juzgar_llamada(esc, serie, n, lineas, ble, lecturas, u):
    """PURA. Juzga la llamada n de una serie con las líneas parseadas del registro (§3 + §5).
    `lecturas` = las lecturas de calma (fase 'durante') tomadas mientras duró.
    → {serie, esc, n, id, valida, motivos_invalida, cumple, fallos, c3, numeros, calma, medio_real:False, simulado:True}.
    `valida` False = la llamada no cuenta ni a favor ni en contra y dice por qué (§3)."""
    e = ESCENARIOS[esc]
    lecturas = [dict(x, notas=x.get("notas") or evaluar_calma(x, u, "durante")[2]) for x in (lecturas or [])]
    res = {"serie": serie, "esc": esc, "n": n, "id": None, "valida": False, "motivos_invalida": [], "cumple": None, "fallos": [],
           "c3": {"cumple": None, "fallos": []}, "numeros": {}, "calma": resumen_calma(lecturas),
           "medio_real": False, "simulado": True, "cuelga": None}
    inv = res["motivos_invalida"]
    grupo, mias = ventana_de_llamada(lineas, serie, n)
    ini = [x for x in mias.get("inicio", []) if x["aparato"] == "mac"]
    fin = [x for x in mias.get("fin", []) if x["aparato"] == "mac"]
    cont = [x for x in mias.get("contesta", []) if x["aparato"] != "mac"]
    for mk in mias.get("rechaza", []):
        inv.append("la tableta rechazó la orden: %s" % MOTIVOS_RECHAZO[mk["motivo"]])
    if not ini:
        inv.append("falta la marca «banco inicio» de la Mac")
    if not fin:
        inv.append("falta la marca «banco fin» de la Mac")
    if not cont:
        inv.append("falta la marca «banco contesta» de la tableta (no se sabe que contestó)")
    # calma durante la llamada
    for lec in lecturas or []:
        ok, fallos, _ = evaluar_calma(lec, u, "durante")
        if not ok:
            inv.append("la Mac no estuvo en calma durante la llamada: %s" % "; ".join(fallos))
            break
    if not lecturas:
        inv.append("no hubo ninguna lectura de calma durante la llamada")
    if not grupo or not ini or not fin:
        return res
    try:
        ll = BL.construir_llamada(grupo, ble or [])
    except Exception as ex:  # noqa: BLE001 — una llamada que no se puede leer no cuenta y lo dice
        inv.append("no se pudo leer la llamada: %s" % BL.describir_error(ex))
        return res
    res["id"] = ll["id"]
    if not (set(ll["lados"]) - {"mac"}):
        inv.append("el registro no trae ninguna línea de la tableta")
    else:
        v, z = _evidencia_tableta(grupo, (ini[0]["t"] + fin[0]["t"]) / 2.0)
        if not (v and z):
            inv.append("evidencia de la tableta incompleta: faltan líneas %s después de la mitad de la llamada" % (
                " y ".join(n_ for n_, ok in (("video-datos rx", v), ("voz-datos rx", z)) if not ok)))
    res["cuelga"] = fin[0]["campos"]["cuelga"]
    lados = {a: s for a, s in ll["lados"].items() if s}
    for a in ("mac",) + tuple(sorted(set(lados) - {"mac"})):
        s = lados.get(a)
        res["numeros"][a] = None if not s else {
            "fps_recibidos_med": (s.get("video") or {}).get("fps_recibidos_med"), "negros": (s.get("video") or {}).get("negros"),
            "inventado_pct_max": (s.get("voz") or {}).get("inventado_pct_max"), "perdida_pct_max": (s.get("voz") or {}).get("perdida_pct_max"),
            "bajo_suelo_lineas": (s.get("voz") or {}).get("bajo_suelo_lineas"), "mudo_s": (s.get("voz") or {}).get("mudo_s")}
    # los números que faltan en cualquier lado: sin dato no se juzga a favor ni en contra
    for a, nums in sorted(res["numeros"].items()):
        for k in ("fps_recibidos_med", "negros", "inventado_pct_max", "perdida_pct_max"):
            if nums is None or nums[k] is None:
                inv.append("falta el dato «%s» del lado %s" % (k, a))
    if inv:
        return res
    res["valida"] = True
    f = res["fallos"]
    if ll["duracion_s"] < e["dur_s"]:
        f.append("duró %d s (se piden %d)" % (ll["duracion_s"], e["dur_s"]))
    dur_app = _num(fin[0]["campos"].get("dur_s"))
    if dur_app is not None and dur_app < e["dur_s"]:
        f.append("la app dice que duró %d s (se piden %d)" % (dur_app, e["dur_s"]))
    if any(_conexion_webrtc(l) for l in grupo):
        f.append("hubo una conexión «medio=webrtc» (se pedía solo Bluetooth)")
    for a, nums in sorted(res["numeros"].items()):
        if nums["fps_recibidos_med"] < 3:
            f.append("%s: %s fps recibidos (se piden 3 o más)" % (a, BL._redondea(nums["fps_recibidos_med"])))
        if nums["negros"] != 0:
            f.append("%s: %d fotogramas negros" % (a, nums["negros"]))
        if nums["inventado_pct_max"] > 10:
            f.append("%s: voz inventada hasta %s %% (máximo 10)" % (a, BL._redondea(nums["inventado_pct_max"])))
        if nums["perdida_pct_max"] > 20:
            f.append("%s: pérdida de voz hasta %s %% (máximo 20)" % (a, BL._redondea(nums["perdida_pct_max"])))
        if nums["bajo_suelo_lineas"]:
            f.append("%s: %d registros BAJO-SUELO de la voz" % (a, nums["bajo_suelo_lineas"]))
    if not ll["terminada"]:
        f.append("la llamada no terminó (ninguna señal de colgar)")
    if res["cuelga"] != e["cuelga"]:
        f.append("colgó %s y el guion dice que cuelga %s" % (res["cuelga"], e["cuelga"]))
    res["cumple"] = not f
    # c3: cero «Reconectando…» y cero «ruta IP nueva» en la llamada
    c3 = res["c3"]["fallos"]
    rec = sum(1 for l in grupo if "Reconectando" in l["msg"])
    ruta = sum(1 for l in grupo if "ruta IP nueva" in l["msg"])
    if rec:
        c3.append("%d líneas «Reconectando…»" % rec)
    if ruta:
        c3.append("%d líneas «ruta IP nueva»" % ruta)
    res["c3"]["cumple"] = not c3
    return res


# ── el veredicto de una serie (§3.3) ────────────────────────────────────────────────────────────────────────────

def veredicto_serie(juicios, rep, clave="cumple", comprobacion="c2", incompleta_k=None):
    """PURA. Los juicios de las llamadas hechas → {comprobacion, veredicto, sugerencia, validas, cumplen, ...}.
    «bien» sugerido: ≥ 8 válidas y todas menos una cumplen (con 10); con menos repeticiones, todas válidas y todas cumplen.
    «falla» sugerido: 2 o más válidas no cumplen. «sin veredicto» en lo demás. Siempre «simulado», nunca marca.
    `clave` = 'cumple' (c2) o 'c3'."""
    def cumple(j):
        return j["cumple"] if clave == "cumple" else j["c3"]["cumple"]
    validas = [j for j in juicios if j["valida"]]
    malas = [j for j in validas if cumple(j) is False]
    buenas = [j for j in validas if cumple(j) is True]
    minimo = 8 if rep >= 10 else rep
    permitidas = 1 if rep >= 10 else 0
    nov = [j for j in juicios if not j["valida"]]
    por_que = "; ".join("llamada %d: %s" % (j["n"], j["motivos_invalida"][0]) for j in nov[:3]) if nov else ""
    out = {"comprobacion": comprobacion, "rep": rep, "hechas": len(juicios), "validas": len(validas), "cumplen": len(buenas),
           "incumplen": len(malas), "no_validas": len(nov), "medio_real": False, "simulado": True, "incompleta": None}
    if incompleta_k is not None:
        out["incompleta"] = "serie incompleta: %d de %d" % (incompleta_k, rep)
    if len(malas) >= 2:
        p = malas[0]
        fallo = (p["fallos"] if clave == "cumple" else p["c3"]["fallos"])[0]
        out.update(veredicto="falla", sugerencia="falla (simulado): %d de %d llamadas válidas no cumplen; la primera, %s (%s): %s"
                   % (len(malas), len(validas), p["id"] or "n=%d" % p["n"], p["esc"], fallo))
    elif len(validas) >= minimo and len(malas) <= permitidas and incompleta_k is None:
        out.update(veredicto="bien", sugerencia="bien (simulado): %d de %d llamadas válidas cumplen; la comprobación sigue pendiente "
                   "de una repetición de Alex con las manos (el medio fue un sustituto)" % (len(buenas), len(validas)))
    else:
        partes = ["%d llamadas válidas de %d pedidas" % (len(validas), rep)]
        if malas:
            partes.append("%d incumple (con menos de 2 no se sugiere «falla»)" % len(malas))
        if por_que:
            partes.append("no valieron: " + por_que)
        if out["incompleta"]:
            partes.append(out["incompleta"])
        out.update(veredicto="sin-veredicto", sugerencia="sin veredicto (simulado): " + "; ".join(partes))
    return out
