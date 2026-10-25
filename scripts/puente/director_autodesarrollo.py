#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Director de autodesarrollo: imagina cuando toca, decide y asigna (IMN1021Db, §5 de
architecture/imaginacion-autodesarrollo.md). Desde la Ola 1024I (IMG1024C) además recoge las
propuestas libres de los agentes imaginativos (`imaginacion/agentes/*.json`), aplica el automático
(§3: integra solo lo bajo/medio que llega al umbral, reimagina solo lo que no llega, lo demás a la
lista manual; alta y crítica NUNCA solas), encarga las reimaginaciones al enjambre y llama al agente
de referencias de diseño si existe. Reloj, disco, lanzadores, Jev y agentes por parámetro (las pruebas
no lanzan nada real); escrituras atómicas (tmp + os.replace) y cerrojo propio."""
from __future__ import annotations
import argparse, fcntl, json, os, shutil, subprocess, sys, tempfile, urllib.request
from contextlib import contextmanager
from datetime import datetime, timedelta

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import autodesarrollo_logica as AL, autodesarrollo_decidir as AD, autodesarrollo_fuentes as AF
import autodesarrollo_reimaginar as AR

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
    try: nombres = [n for n in os.listdir(carpeta) if n.endswith(".json") and not n.startswith(".")]
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


def _decidir(p, aj, existe, consejo, ahora_iso, firma=None):
    """Utilidad, importancia y destino con el automático; la reimaginación automática lleva la crítica."""
    antes = p.get("estado")
    p["utilidad"], p["motivo"] = AD.utilidad(p, existe); p["importancia"] = AD.importancia_visible(AD.importancia(p))
    dest = AD.automatica(p, aj, existe, consejo)
    p.update(aprobacion_diff=dest["aprobacion_diff"], motivo_destino=dest["motivo"])
    if dest["destino"] == "reimaginando": AR.pedir(p, dest["notas"], p.get("referencias") or [], "automatica", ahora_iso)
    else: p["estado"] = dest["destino"]
    if p["estado"] != antes or not p.get("t"): p["t"] = ahora_iso
    if firma: p["auto_firma"] = firma
    return p


def ciclo(seco=False, ahora=None, capacidad=-1, home=None, raiz=None, lanzador_diario=None, lanzador_profundo=None,
          existe_ruta=None, datos=None, avisar=None, consejo=None, agente_referencias=None):
    """Un ciclo (§5). `datos`: {diaria, profunda, astraura, directores, agentes} para no leer disco ni red.
    `consejo(p)`: Jev para el veto de lo que se integraría solo (None = solo la regla). `agente_referencias(raiz,
    ahora)`: el agente de referencias de diseño (por defecto, el módulo si existe); devuelve None si no hay agente."""
    ahora, home, raiz = ahora or datetime.now(), home or os.path.expanduser("~/.starseed"), raiz or RAIZ
    mem, hoy = os.path.join(raiz, "starseed_memory_root"), (ahora or datetime.now()).strftime("%Y-%m-%d")
    with cerrojo(os.path.join(home, "cerrojos", "autodesarrollo.lock")) as libre:
        if not libre: return {"toca_ejecutar": False, "motivo_toca": "otro ciclo en marcha", "autodesarrolladas": 0}
        aj = AL.validar_ajustes(_json(os.path.join(home, "autodesarrollo.json"), {}))
        cap = medir_capacidad(home) if capacidad == -1 else capacidad
        if cap is None and aj["horario"]["modo"] == "inteligente":
            toca, motivo = False, "sin dato de capacidad: en modo inteligente no se ejecuta"
        else: toca, motivo = AL.toca_ejecutar(ahora, aj["horario"], cap or {})
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
        for p in nuevas:
            if p["id"] in previas: continue
            AR.enlazar(p, previas, iso)  # una versión reimaginada: v n+1 y la vieja pasa a «reimaginada»
            previas[p["id"]] = _decidir(p, aj, existe, consejo, iso, firma)
        if firma:  # el botón encendido (o cambiado) también decide lo que ya esperaba en la lista
            for p in list(previas.values()):
                if p.get("estado") in REVISABLES and p.get("fuente") in AD.FUENTES_AUTO and p.get("auto_firma") != firma:
                    _decidir(p, aj, existe, consejo, iso, firma)
        for p in AR.caducadas(previas.values(), ahora):
            AR.devolver(p, f"la reimaginación no llegó en {AR.CADUCA_H} h: queda en tu lista", iso)
        propuestas = list(previas.values())
        reim, devueltas = AR.pendientes(propuestas, au["max_reimaginaciones"], ahora)
        for p in devueltas:
            AR.devolver(p, f"tope de {au['max_reimaginaciones']} reimaginación(es) por cadena: queda en tu lista", iso)
        reim = reim if toca else []
        auto = AD.cuantas([p for p in propuestas if p.get("estado") == "autodesarrollo"], aj["rango"], AD.umbral_efectivo(aj))["elegidas"]
        aprobadas = [p for p in propuestas if p.get("estado") == "aprobada" and not p.get("tarea")]
        cola = (auto + aprobadas) if toca else []
        fr = [x for x in aj["horario"]["franjas"] if x["desde"] > ahora.strftime("%H:%M")] if aj["horario"]["modo"] == "franjas" else []
        if cola and aj["horario"]["repartir"] and fr: cola = cola[:AL.lotes(len(cola), len(fr) + 1)[0]]
        nombre = f"cola-imaginacion-{ahora.strftime('%Y%m%d-%H%M')}"
        tareas = [{"id": "IMG-" + p["id"].replace(":", "-")[:40], "titulo": p["titulo"], "area": "imaginacion",
                   "archivos": (p.get("archivos") or [])[:3], "depende": [], "prompt": PROMPT.format(t=p["titulo"], c=p.get("cuerpo", "")[:600]),
                   **({"aprobacion": True} if p.get("aprobacion_diff") else {})} for p in cola]
        esperan = [p for p in propuestas if p.get("estado") == "esperando-aprobacion"]
        cola_r = None
        if not seco:
            for p, t in zip(cola, tareas): p["estado"], p["tarea"] = "encargada", t["id"]
            if tareas:
                _escribir(os.path.join(mem, "olas", nombre + ".json"), tareas)
                _escribir(os.path.join(home, "dream-encargado.json"), {"claves": sorted(set(claves) | {p["id"].split(":", 1)[-1] for p in cola})})
            if reim:
                cola_r = AR.encolar(mem, reim, ahora)
                por_tarea = {AR.id_tarea(p): p for p in propuestas if p.get("estado") == "reimaginando"}
                for t in reim: AR.marcar_encolada(por_tarea[t["id"]], t, cola_r, iso)
            _escribir(pr, propuestas if isinstance(crudo, list) else {**crudo, "actualizado": iso, "propuestas": propuestas})
            if avisar and (tareas or esperan or reim):
                avisar(f"Imaginación: {len(tareas)} tarea(s) encargada(s), {len(esperan)} esperando tu aprobación"
                       + (f", {len(reim)} reimaginándose." if reim else "."), bool(esperan))
        return {"toca_ejecutar": toca, "motivo_toca": motivo, "lanzado": lanzo, "propuestas": len(propuestas), "autodesarrolladas": len(tareas),
                "esperando_aprobacion": len(esperan), "cola": nombre + ".json" if tareas and not seco else None,
                "reimaginando": sum(1 for p in propuestas if p.get("estado") == "reimaginando"),
                "reimaginaciones_encargadas": len(reim) if not seco else 0, "cola_reimaginar": cola_r}


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
