#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Recolector de medidores de crédito (MC1007D · contrato architecture/medidores-credito.md §4.1).

Une los adaptadores (claude_terminal, codex_terminal, http_json, declarado), escribe
~/.starseed/medidores-credito.json, puentea a limites_claude y a la salud de proveedores.
Cero tokens, solo números y fechas; un fallo no borra lo bueno.
"""
from __future__ import annotations

import fcntl
import json
import os
import shutil
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

import limites_claude
import medidor_claude_terminal
import medidor_codex_terminal
import medidor_http_json

DIR = os.path.expanduser("~/.starseed")
ARCHIVO_SALIDA = os.path.join(DIR, "medidores-credito.json")
ARCHIVO_CONFIG = os.path.join(DIR, "medidores.json")
ARCHIVO_STATUSLINE = os.path.join(DIR, "medidores-entrada", "claude-statusline.json")
ARCHIVO_SALUD = os.path.join(DIR, "salud-proveedores.json")
ARCHIVO_CERROJO = os.path.join(DIR, "cerrojos", "salud.lock")

TOPES_S = {"claude_terminal": 60, "codex_terminal": 30}  # el resto: 20
HISTORIAL_MAX = 300

ADAPTADORES = {
    "claude_terminal": lambda cfg, ahora: medidor_claude_terminal.leer(cfg, ahora),
    "codex_terminal": lambda cfg, ahora: medidor_codex_terminal.leer(cfg, ahora),
    "http_json": lambda cfg, ahora: medidor_http_json.leer_http_json(cfg, ahora),
    "declarado": lambda cfg, ahora: medidor_http_json.leer_declarado(cfg, ahora),
}


def _iso(ahora: datetime) -> str:
    return ahora.astimezone().isoformat()


def _fecha(valor) -> datetime | None:
    if not isinstance(valor, str):
        return None
    try:
        return datetime.fromisoformat(valor.replace("Z", "+00:00"))
    except ValueError:
        return None


def _binario_existe(nombre: str) -> bool:
    if shutil.which(nombre):
        return True
    return os.path.exists(os.path.expanduser(os.path.join("~", ".local", "bin", nombre)))


def cargar_config(ruta: str = ARCHIVO_CONFIG) -> list[dict]:
    """Lee medidores.json y añade claude/codex por terminal si existe su binario (§2.3)."""
    try:
        with open(os.path.expanduser(ruta), encoding="utf-8") as f:
            entradas = json.load(f).get("medidores", [])
    except (OSError, ValueError, AttributeError):
        entradas = []
    entradas = [dict(e) for e in entradas if isinstance(e, dict) and e.get("id")]
    ids_activos = {e["id"] for e in entradas if e.get("activo", True)}
    apagados = {e["id"] for e in entradas if e.get("activo") is False}
    if "claude" not in ids_activos and "claude" not in apagados and _binario_existe("claude"):
        entradas.append({"id": "claude", "tipo": "claude_terminal"})
    if "codex" not in ids_activos and "codex" not in apagados and _binario_existe("codex"):
        entradas.append({"id": "codex", "tipo": "codex_terminal"})
    return [e for e in entradas if e.get("activo", True) is not False]


def _completar(med: dict, cfg: dict, previo: dict | None, ahora: datetime) -> dict:
    """Da a cada medidor la forma entera de §3, rellenando lo que falte del previo o la config."""
    med = dict(med) if isinstance(med, dict) else {}
    previo = previo or {}
    ok = bool(med.get("ok"))
    if ok:
        ventanas = med.get("ventanas") if isinstance(med.get("ventanas"), list) else previo.get("ventanas", [])
        saldo = med.get("saldo", previo.get("saldo"))
        obsoleto, error = False, None
    else:
        # Un fallo no borra lo bueno: se conservan ventanas y saldo del previo
        ventanas = previo.get("ventanas") or med.get("ventanas") or []
        saldo = previo.get("saldo") if previo.get("saldo") is not None else med.get("saldo")
        obsoleto, error = True, str(med.get("error") or "lectura fallida")[:120]
    estructura = {"id": cfg.get("id") or med.get("id") or previo.get("id"),
                  "proveedor": cfg.get("proveedor") or med.get("proveedor") or previo.get("proveedor"),
                  "nombre": cfg.get("nombre") or med.get("nombre") or previo.get("nombre"),
                  "tipo": med.get("tipo") or previo.get("tipo") or "saldo",
                  "plan": med.get("plan", previo.get("plan")),
                  "ventanas": ventanas, "saldo": saldo,
                  "extras": med.get("extras") if isinstance(med.get("extras"), dict)
                            else previo.get("extras", {}),
                  "fuente": med.get("fuente") or previo.get("fuente") or cfg.get("tipo"),
                  "leido": med.get("leido") or previo.get("leido") or _iso(ahora),
                  "ok": ok, "obsoleto": obsoleto, "error": error,
                  "enlace": med.get("enlace") or previo.get("enlace"),
                  "cada_min": cfg.get("cada_min")}
    return estructura


def _toque_lectura(prev_med: dict | None, cfg: dict, ahora: datetime) -> bool:
    """True si toca llamar al adaptador; cada_min conserva la lectura previa buena y reciente."""
    cada = cfg.get("cada_min")
    if not isinstance(cada, (int, float)) or not prev_med or not prev_med.get("ok"):
        return True
    leido = _fecha(prev_med.get("leido"))
    if not leido:
        return True
    return (ahora.astimezone() - leido).total_seconds() >= cada * 60


def _punto_historial(med: dict) -> dict | None:
    v = {w["id"]: w.get("usado_pct") for w in med.get("ventanas", [])
         if isinstance(w, dict) and "id" in w and isinstance(w.get("usado_pct"), (int, float))}
    if not v and med.get("saldo") is None:
        return None
    if med.get("saldo") is not None:
        v = dict(v); v["saldo"] = med["saldo"].get("valor")
    return {"t": med["leido"], "v": v}


def recoger(config: list[dict], previo: dict, ahora: datetime, adaptadores=ADAPTADORES) -> dict:
    """Corre los adaptadores (aislados, con tope), fusiona con previo, añade historial."""
    prev_med = (previo or {}).get("medidores", {}) or {}
    historial = {k: list(v) for k, v in ((previo or {}).get("historial", {}) or {}).items()}

    def llamar(cfg: dict) -> dict:
        adaptador = adaptadores.get(cfg.get("tipo"))
        prev_uno = prev_med.get(cfg["id"])
        if adaptador is None or not _toque_lectura(prev_uno, cfg, ahora):
            return dict(prev_uno) if isinstance(prev_uno, dict) else {
                "ok": False, "error": "tipo desconocido", "id": cfg.get("id")}
        tope = TOPES_S.get(str(cfg.get("tipo")), 20)
        # Sin `with`: al salir, `with` espera al hilo y un adaptador colgado colgaría el
        # recolector entero; así el tope corta de verdad (el hilo huérfano muere con el proceso).
        pool = ThreadPoolExecutor(max_workers=1)
        try:
            resultado = pool.submit(adaptador, cfg, ahora).result(timeout=tope)
        except Exception as e:
            return {"ok": False, "error": type(e).__name__, "id": cfg.get("id")}
        finally:
            pool.shutdown(wait=False, cancel_futures=True)
        return resultado

    with ThreadPoolExecutor(max_workers=max(1, len(config))) as pool:
        resultados = list(pool.map(llamar, config))

    medidores = {}
    for cfg, res in zip(config, resultados):
        lista = res if isinstance(res, list) else [res]
        for med in lista:
            mid = (med or {}).get("id") or cfg.get("id")
            if not isinstance(mid, str) or not mid:
                continue
            nuevo = _completar(med, cfg, prev_med.get(mid), ahora)
            anterior = prev_med.get(mid)
            if nuevo["ok"] or anterior is None:
                punto = _punto_historial(nuevo)
                ultimo = (historial.get(mid) or [None])[-1]
                if punto and (not ultimo or ultimo.get("v") != punto["v"]):
                    historial[mid] = (historial.get(mid) or [])[-(HISTORIAL_MAX - 1):] + [punto]
            elif anterior:
                nuevo["fuente"] = nuevo["fuente"] or anterior.get("fuente")
            medidores[mid] = nuevo
    return {"version": 1, "t": _iso(ahora), "medidores": medidores, "historial": historial}


def fusionar_statusline(med_claude: dict, ruta: str = ARCHIVO_STATUSLINE) -> dict:
    """Si la línea de estado es más reciente que la lectura, actualiza sesion y semana (§4.2)."""
    med = dict(med_claude)
    try:
        with open(os.path.expanduser(ruta), encoding="utf-8") as f:
            sl = json.load(f)
    except (OSError, ValueError):
        return med
    t_sl = _fecha(sl.get("t"))
    t_med = _fecha(med.get("leido"))
    if not t_sl or (t_med and t_med >= t_sl):
        return med
    parejas = (("five_hour", "sesion"), ("seven_day", "semana"))
    ventanas = {w.get("id"): dict(w) for w in med.get("ventanas", []) if isinstance(w, dict)}
    for clave, vid in parejas:
        datos = sl.get(clave)
        if not isinstance(datos, dict) or not isinstance(datos.get("usado_pct"), (int, float)):
            continue
        if vid in ventanas:
            ventanas[vid]["usado_pct"] = datos["usado_pct"]
            if datos.get("reinicia"):
                ventanas[vid]["reinicia"] = datos["reinicia"]
        else:
            ventanas[vid] = {"id": vid, "etiqueta": "Sesión (5 h)" if vid == "sesion"
                             else "Semana (todos los modelos)", "usado_pct": datos["usado_pct"],
                             "reinicia": datos.get("reinicia")}
    med["ventanas"] = list(ventanas.values())
    med["fuente"] = str(med.get("fuente") or "") + " + línea de estado"
    med["leido"] = sl["t"]
    med["ok"] = True
    med["obsoleto"] = False
    return med


def guardar(doc: dict, ruta: str = ARCHIVO_SALIDA) -> None:
    """Escritura atómica (.tmp + os.replace) con permisos 0600 (§3)."""
    ruta = os.path.expanduser(ruta)
    os.makedirs(os.path.dirname(ruta) or ".", exist_ok=True)
    temporal = ruta + ".tmp"
    with open(temporal, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.chmod(temporal, 0o600)
    os.replace(temporal, ruta)


def _ventana(med: dict, vid: str) -> dict | None:
    for w in med.get("ventanas", []):
        if isinstance(w, dict) and w.get("id") == vid:
            return w
    return None


def puente_limites_claude(med: dict, ahora: datetime, leer_datos=limites_claude.leer,
                          guardar_datos=None, ruta=None) -> bool:
    """Añade una lectura a limites-claude.json si cambió algo o pasaron > 30 min (§4.1)."""
    if not med or not med.get("ok"):
        return False
    datos = leer_datos() or {}
    lecturas = datos.get("lecturas", [])
    ultima = lecturas[-1] if lecturas else None
    sesion, semana = _ventana(med, "sesion"), _ventana(med, "semana")
    if ultima:
        t_ult = _fecha(ultima.get("t"))
        if (t_ult and (ahora.astimezone() - t_ult).total_seconds() < 30 * 60
                and ultima.get("sesion_pct") == (sesion or {}).get("usado_pct")
                and ultima.get("semana_pct") == (semana or {}).get("usado_pct")):
            return False
    lectura = {"t": med.get("leido") or _iso(ahora), "fuente": "terminal"}
    for v, clave in ((sesion, "sesion"), (semana, "semana")):
        if v:
            lectura[clave + "_pct"] = v.get("usado_pct")
            lectura[clave + "_reinicio"] = v.get("reinicia")
    for w in med.get("ventanas", []):
        if isinstance(w, dict) and str(w.get("id", "")).startswith("semana-"):
            lectura["modelo_nombre"] = str(w["id"][len("semana-"):]).capitalize()
            lectura["modelo_pct"] = w.get("usado_pct")
            lectura["modelo_reinicio"] = w.get("reinicia")
            break
    if "sesion_pct" not in lectura and "semana_pct" not in lectura:
        return False
    nuevos = limites_claude.anadir_lectura(datos, lectura)
    destino = ruta or limites_claude.ARCHIVO
    if guardar_datos:
        guardar_datos(nuevos, destino)
    else:
        guardar(nuevos, destino)
    return True


def alimentar_salud(medidores: dict, ruta_salud: str = ARCHIVO_SALUD,
                    ruta_cerrojo: str = ARCHIVO_CERROJO, ahora: datetime | None = None) -> None:
    """Marca/limpia la entrada codex de salud-proveedores bajo flock, solo sus dos claves (§4.1)."""
    med = (medidores or {}).get("codex") or {}
    llena = None
    for w in med.get("ventanas", []):
        if isinstance(w, dict) and isinstance(w.get("usado_pct"), (int, float)) \
                and w["usado_pct"] >= 100:
            llena = w
            break
    os.makedirs(os.path.dirname(os.path.expanduser(ruta_cerrojo)) or ".", exist_ok=True)
    with open(os.path.expanduser(ruta_cerrojo), "w") as cerrojo:
        fcntl.flock(cerrojo, fcntl.LOCK_EX)
        try:
            with open(os.path.expanduser(ruta_salud), encoding="utf-8") as f:
                salud = json.load(f)
        except OSError:
            salud = {}
        except ValueError:
            # Archivo a medio escribir o roto: NUNCA se reescribe con `{}` (borraría la salud de
            # todos los proveedores); la próxima pasada lo intenta otra vez.
            fcntl.flock(cerrojo, fcntl.LOCK_UN)
            return
        if not isinstance(salud, dict):
            fcntl.flock(cerrojo, fcntl.LOCK_UN)
            return
        antes = json.dumps(salud, sort_keys=True)
        entrada = salud.get("codex")
        if not isinstance(entrada, dict):
            entrada = {}
            if llena:
                salud["codex"] = entrada
        if llena:
            reinicia = _fecha(llena.get("reinicia"))
            base = reinicia or ahora or datetime.now().astimezone()
            hasta = base.astimezone() if base.tzinfo is None else base
            entrada["sin_cupo_hasta"] = hasta.strftime("%Y-%m-%d %H:%M:%S")
            entrada["motivo"] = f"medidor: {llena.get('id')} 100 %"
            salud["codex"] = entrada
        elif str(entrada.get("motivo", "")).startswith("medidor:"):
            entrada.pop("sin_cupo_hasta", None)
            entrada.pop("motivo", None)
        if json.dumps(salud, sort_keys=True) != antes:
            destino = os.path.expanduser(ruta_salud)
            temporal = destino + ".tmp-medidores"
            with open(temporal, "w", encoding="utf-8") as f:
                json.dump(salud, f, ensure_ascii=False, indent=1)
            os.replace(temporal, destino)
        fcntl.flock(cerrojo, fcntl.LOCK_UN)


def _a_txt(valor) -> str:
    if isinstance(valor, float):
        return f"{valor:g}"
    return str(valor)


def resumen_linea(med: dict) -> str:
    """Una línea por medidor, sin secretos: nombre, % de cada ventana, ok/error."""
    partes = [str(med.get("nombre") or med.get("id"))]
    for w in med.get("ventanas", []):
        if isinstance(w, dict) and isinstance(w.get("usado_pct"), (int, float)):
            partes.append(f"{w.get('id')} {_a_txt(round(w['usado_pct']))}%")
    if med.get("saldo") is not None and isinstance(med.get("saldo"), dict):
        partes.append(f"saldo {_a_txt(med['saldo'].get('valor'))} {med['saldo'].get('unidad', '')}".strip())
    partes.append("ok" if med.get("ok") else f"error: {med.get('error')}")
    if med.get("obsoleto"):
        partes.append("(obsoleto)")
    return " · ".join(partes)


def main(argv=None) -> int:
    import sys
    args = list(sys.argv[1:] if argv is None else argv)
    ahora = datetime.now().astimezone()
    if not args or args[0] not in ("recoger", "ver"):
        print("uso: medidores_credito.py recoger [--solo claude,codex] | ver", file=sys.stderr)
        return 2
    if args[0] == "ver":
        try:
            with open(os.path.expanduser(ARCHIVO_SALIDA), encoding="utf-8") as f:
                print(f.read())
        except OSError as e:
            print(f"sin salida: {e}", file=sys.stderr)
            return 1
        return 0
    solo = None
    if "--solo" in args:
        i = args.index("--solo")
        if i + 1 < len(args):
            solo = set(args[i + 1].split(","))
    config = cargar_config()
    if solo is not None:
        config = [c for c in config if c.get("id") in solo]
    try:
        with open(os.path.expanduser(ARCHIVO_SALIDA), encoding="utf-8") as f:
            previo = json.load(f)
    except (OSError, ValueError):
        previo = {}
    doc = recoger(config, previo, ahora)
    if "claude" in doc["medidores"]:
        doc["medidores"]["claude"] = fusionar_statusline(doc["medidores"]["claude"])
        puente_limites_claude(doc["medidores"]["claude"], ahora)
    alimentar_salud(doc["medidores"], ARCHIVO_SALUD, ARCHIVO_CERROJO, ahora)
    guardar(doc)
    for mid in sorted(doc["medidores"]):
        print(resumen_linea(doc["medidores"][mid]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())



