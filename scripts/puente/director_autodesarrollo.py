#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Director de autodesarrollo: imagina cuando toca, decide y asigna (IMN1021Db, §5 de
architecture/imaginacion-autodesarrollo.md). Reloj, disco y lanzadores por parámetro (las pruebas
no lanzan nada real); escrituras atómicas (tmp + os.replace) y cerrojo propio."""
from __future__ import annotations
import argparse, fcntl, json, os, shutil, subprocess, sys, tempfile, urllib.request
from contextlib import contextmanager
from datetime import datetime, timedelta

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import autodesarrollo_logica as AL, autodesarrollo_decidir as AD, autodesarrollo_fuentes as AF

RAIZ = os.path.dirname(os.path.dirname(AQUI))
ESTADOS_ALEX = ("aprobada", "rechazada", "pospuesta", "hecha", "descartada")
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


def ciclo(seco=False, ahora=None, capacidad=-1, home=None, raiz=None, lanzador_diario=None, lanzador_profundo=None,
          existe_ruta=None, datos=None, avisar=None):
    """Un ciclo (§5). `datos`: {diaria, profunda, astraura, directores} para no leer disco ni red."""
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
            _escribir(est_ruta, est)
        d, f = datos or {}, aj["fuentes"]
        enc = _json(os.path.join(home, "dream-encargado.json"), {}); claves = enc.get("claves", []) if isinstance(enc, dict) else list(enc)
        if "diaria" not in d and f["diaria"]:
            try: d["diaria"] = open(os.path.join(mem, "dream", f"sugerencias-{hoy}.md"), encoding="utf-8").read()
            except OSError: pass
        if "profunda" not in d and f["profunda"]:
            d["profunda"] = _json(os.path.join(mem, "dream", "profundo", hoy, "consolidado.json"), {})
        if "astraura" not in d and f["astraura"]: d["astraura"] = _astraura()
        nuevas = (AF.de_diaria(d.get("diaria", ""), hoy, claves) if f["diaria"] else []) + \
                 (AF.de_profunda(d.get("profunda") or {}, hoy, claves) if f["profunda"] else []) + \
                 (AF.de_astraura(d.get("astraura") or {}, hoy, claves) if f["astraura"] else []) + \
                 (AF.de_directores(d.get("directores") or {}, hoy, claves) if f["directores"] else [])
        pr = os.path.join(mem, "imaginacion", "propuestas.json")
        previas = {p["id"]: p for p in _json(pr, {}).get("propuestas", []) if isinstance(p, dict) and p.get("id")}
        existe = existe_ruta or (lambda r: os.path.isfile(r if os.path.isabs(r) else os.path.join(raiz, r)))
        for p in nuevas:
            if p["id"] in previas: continue
            p["utilidad"], p["motivo"] = AD.utilidad(p, existe); p["importancia"] = AD.importancia(p)
            dest = AD.destino(p, aj["automatico"], existe)
            p.update(estado=dest["destino"], aprobacion_diff=dest["aprobacion_diff"], motivo_destino=dest["motivo"], t=ahora.isoformat())
            previas[p["id"]] = p
        propuestas = list(previas.values())
        auto = AD.cuantas([p for p in propuestas if p.get("estado") == "autodesarrollo"], aj["rango"])["elegidas"]
        aprobadas = [p for p in propuestas if p.get("estado") == "aprobada" and not p.get("tarea")]
        cola = (auto + aprobadas) if toca else []
        fr = [x for x in aj["horario"]["franjas"] if x["desde"] > ahora.strftime("%H:%M")] if aj["horario"]["modo"] == "franjas" else []
        if cola and aj["horario"]["repartir"] and fr: cola = cola[:AL.lotes(len(cola), len(fr) + 1)[0]]
        nombre = f"cola-imaginacion-{ahora.strftime('%Y%m%d-%H%M')}"
        tareas = [{"id": "IMG-" + p["id"].replace(":", "-")[:40], "titulo": p["titulo"], "area": "imaginacion",
                   "archivos": (p.get("archivos") or [])[:3], "depende": [], "prompt": PROMPT.format(t=p["titulo"], c=p.get("cuerpo", "")[:600]),
                   **({"aprobacion": True} if p.get("aprobacion_diff") else {})} for p in cola]
        esperan = [p for p in propuestas if p.get("estado") == "esperando-aprobacion"]
        if not seco:
            for p, t in zip(cola, tareas): p["estado"], p["tarea"] = "encargada", t["id"]
            if tareas:
                _escribir(os.path.join(mem, "olas", nombre + ".json"), tareas)
                _escribir(os.path.join(home, "dream-encargado.json"), {"claves": sorted(set(claves) | {p["id"].split(":", 1)[-1] for p in cola})})
            _escribir(pr, {"actualizado": ahora.isoformat(), "propuestas": propuestas})
            if avisar and (tareas or esperan):
                avisar(f"Imaginación: {len(tareas)} tarea(s) encargada(s), {len(esperan)} esperando tu aprobación.", bool(esperan))
        return {"toca_ejecutar": toca, "motivo_toca": motivo, "lanzado": lanzo, "propuestas": len(propuestas), "autodesarrolladas": len(tareas),
                "esperando_aprobacion": len(esperan), "cola": nombre + ".json" if tareas and not seco else None}


def _avisar_real(texto, telegram):
    try:
        import puente; puente.decir(texto, "imaginacion", "hecho")
    except Exception: pass
    h = telegram and (shutil.which("hermes") or os.path.expanduser("~/.local/bin/hermes"))
    if h and os.path.exists(h):
        subprocess.run([h, "send", "-t", os.environ.get("STARSEED_TELEGRAM_DESTINO", "telegram:Maggasukha"), "-s", "Imaginación · StarSeed OS", texto], timeout=40, capture_output=True)


def main(argv=None):
    ap = argparse.ArgumentParser(); ap.add_argument("orden", choices=["ciclo"]); ap.add_argument("--seco", action="store_true"); ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv); r = ciclo(seco=a.seco, avisar=_avisar_real)
    print(json.dumps(r, ensure_ascii=False, indent=1) if a.json else f"{r['motivo_toca']} · {r['autodesarrolladas']} tarea(s) · {r['esperando_aprobacion']} esperando")


if __name__ == "__main__":
    main()
