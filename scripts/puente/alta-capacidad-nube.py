#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Carril de alta capacidad en la nube: lanzar, seguir y ver sesiones de Claude (ola 1022B).

La lógica pura vive en `alta_capacidad_nube_logica.py` (1022A). Aquí solo se lee el disco, se
lanza `claude --cloud` dentro de una pseudoterminal y se anota lo que pasa. Nunca imprime el
entorno ni claves.

Uso:
  alta-capacidad-nube.py lanzar --ids A,B [--modelo claude-opus-5-5] [--seco]
  alta-capacidad-nube.py seguir [--aplicar]
  alta-capacidad-nube.py ver [--json]
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import alta_capacidad_nube_logica as L  # noqa: E402
import traer_nube as T  # noqa: E402

RAIZ = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(DIRECTORIO))
PLANTILLA = os.path.join(DIRECTORIO, "plantillas", "alta-capacidad-nube.md")
CREDITO = os.path.expanduser("~/.starseed/credito-claude-nube.json")
REGISTRO = os.path.expanduser("~/.starseed/alta-capacidad-nube.json")
BRIEFS = os.path.expanduser("~/.starseed/alta-capacidad-nube")
MODELO = "claude-opus-5-5"
ESPERA_S = 90.0


def _leer_json(ruta: str, defecto):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def _guardar_json(ruta: str, datos) -> None:
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    tmp = ruta + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    os.chmod(tmp, 0o600)
    os.replace(tmp, ruta)


def buscar_tarea(tid: str, raiz: str = RAIZ) -> tuple[dict | None, str | None]:
    """La tarea en la cola más reciente que la tenga (por fecha de modificación)."""
    patron = os.path.join(raiz, "starseed_memory_root", "olas", "cola-*.json")
    rutas = sorted(glob.glob(patron), key=lambda p: (os.path.getmtime(p), p), reverse=True)
    for ruta in rutas:
        datos = _leer_json(ruta, {})
        for tarea in (datos.get("tareas") if isinstance(datos, dict) else None) or []:
            if isinstance(tarea, dict) and tarea.get("id") == tid:
                return tarea, ruta
    return None, None


def _registro_limpio(datos) -> dict:
    reg = dict(datos) if isinstance(datos, dict) else {}
    reg["sesiones"] = [s for s in (reg.get("sesiones") or []) if isinstance(s, dict)]
    return reg


def _fecha_de(ahora: float) -> str:
    return datetime.fromtimestamp(float(ahora), timezone.utc).strftime("%Y%m%d")


def _matar(proc) -> None:
    if proc is None:
        return
    try:
        proc.terminate()
        proc.wait(timeout=5)
    except Exception:  # noqa: BLE001 — el proceso ya murió o no es nuestro
        try:
            proc.kill()
        except Exception:  # noqa: BLE001
            pass


def _lanzar_pty(orden: list[str], log: str, teclas: str):
    """`script -q <log> <orden…>` con la entrada de un `tail -f` para que no se cierre."""
    os.makedirs(os.path.dirname(log), exist_ok=True)
    with open(teclas, "w", encoding="utf-8") as f:
        f.write("\n")
    tail = subprocess.Popen(["tail", "-f", teclas], stdout=subprocess.PIPE,
                            stderr=subprocess.DEVNULL)
    try:
        proc = subprocess.Popen(["script", "-q", log] + list(orden), stdin=tail.stdout,
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    finally:
        tail.stdout.close()
    return proc, tail


def _esperar_sesion(log: str, segundos: float):
    fin = time.monotonic() + max(0.0, float(segundos))
    while True:
        if os.path.exists(log):
            try:
                with open(log, encoding="utf-8", errors="ignore") as f:
                    dato = L.sesion_de_salida(f.read())
            except OSError:
                dato = None
            if dato:
                return dato
        if time.monotonic() >= fin:
            return None
        time.sleep(1.0)


def lanzar(ids: list[str], modelo: str = MODELO, seco: bool = False, *,
           ahora: float | None = None, fecha: str | None = None, raiz: str = RAIZ,
           credito: dict | None = None, registro: dict | None = None,
           progreso: dict | None = None, marcar=None, leer_progreso=None,
           lanzador=None, esperar=None, espera_s: float = ESPERA_S,
           guardar_registro=None, briefs_dir: str = BRIEFS, plantilla: str | None = None):
    """Lanza una sesión por id. Devuelve un resumen por tarea (nunca lanza si no hay cupo)."""
    ahora = time.time() if ahora is None else float(ahora)
    fecha = fecha or _fecha_de(ahora)
    credito = _leer_json(CREDITO, {}) if credito is None else credito
    if registro is None:
        registro = _registro_limpio(_leer_json(REGISTRO, {}))
    else:
        limpio = _registro_limpio(registro)
        registro.clear()
        registro.update(limpio)
    leer_progreso = leer_progreso or T._progreso
    progreso = leer_progreso() if progreso is None else progreso
    marcar = marcar or T._actualizar_progreso
    lanzador = lanzador or _lanzar_pty
    esperar = esperar or _esperar_sesion
    guardar_registro = guardar_registro or (lambda r: _guardar_json(REGISTRO, r))
    if plantilla is None:
        with open(PLANTILLA, encoding="utf-8") as f:
            plantilla = f.read()

    vivas = L.sesiones_vivas(registro, progreso)
    resumen = []
    for tid in ids:
        se_lanza, motivo, presupuesto = L.cupo_nube(credito, ahora, vivas)
        if not se_lanza:
            resumen.append({"id": tid, "accion": "sin_cupo", "motivo": motivo,
                            "presupuesto": presupuesto})
            continue
        tarea, ruta = buscar_tarea(tid, raiz)
        if tarea is None:
            resumen.append({"id": tid, "accion": "sin_tarea",
                            "motivo": "no está en ninguna cola"})
            continue
        texto = L.brief(plantilla, tarea, fecha)
        os.makedirs(briefs_dir, exist_ok=True)
        ruta_brief = os.path.join(briefs_dir, "%s.md" % tid)
        with open(ruta_brief, "w", encoding="utf-8") as f:
            f.write(texto)
        rama = L.rama_pedida(tid, fecha)
        if seco:
            resumen.append({"id": tid, "accion": "seco", "brief": ruta_brief,
                            "rama": rama, "presupuesto": presupuesto})
            continue

        try:
            orden = L.orden_cli(modelo, texto)
        except ValueError as e:
            resumen.append({"id": tid, "accion": "error", "motivo": str(e)})
            continue
        marcar({tid: {"estado": "reasignada", "medio": "claude-nube",
                      "nota": "en el carril de alta capacidad en la nube"}})
        log = os.path.join(briefs_dir, "%s.log" % tid)
        teclas = os.path.join(briefs_dir, "%s.teclas" % tid)
        try:
            _proc, tail = lanzador(orden, log, teclas)
            dato = esperar(log, espera_s)
        except Exception as e:  # noqa: BLE001 — sin `claude` o sin `script` no hay sesión
            marcar({tid: {"estado": "pendiente", "medio": "",
                          "nota": "no se pudo lanzar el carril en la nube: %s" % e}})
            resumen.append({"id": tid, "accion": "error", "brief": ruta_brief,
                            "motivo": "no se pudo lanzar: %s" % e})
            continue
        _matar(tail)
        if not dato:
            marcar({tid: {"estado": "pendiente", "medio": "",
                          "nota": "el carril en la nube no dio sesión: vuelve a pendiente"}})
            resumen.append({"id": tid, "accion": "sin_sesion", "brief": ruta_brief,
                            "motivo": "la salida no trajo ninguna sesión"})
            continue
        registro["sesiones"].append({"tarea": tid, "sesion": dato["sesion"], "url": dato["url"],
                                     "rama_pedida": rama, "modelo": modelo, "t": ahora})
        guardar_registro(registro)
        vivas += 1
        resumen.append({"id": tid, "accion": "lanzada", "brief": ruta_brief,
                        "sesion": dato["sesion"], "url": dato["url"], "rama": rama})
    return resumen


def _ramas_remotas() -> set[str]:
    r = subprocess.run(["git", "ls-remote", "origin", "refs/heads/nube/cc-*"],
                       capture_output=True, text=True, timeout=120)
    ramas = set()
    for linea in (r.stdout or "").splitlines():
        if "\t" not in linea:
            continue
        ref = linea.split("\t", 1)[1].strip()
        ramas.add(ref.replace("refs/heads/", "", 1))
    return ramas


def _correr_traer_nube() -> int:
    orden = [sys.executable, os.path.join(DIRECTORIO, "traer_nube.py"), "revisar", "--aplicar"]
    return subprocess.run(orden).returncode


def _url_de(registro: dict, tid: str) -> str:
    for s in reversed(registro.get("sesiones") or []):
        if s.get("tarea") == tid:
            return str(s.get("url") or "")
    return ""


def seguir_carril(aplicar: bool = False, *, ahora: float | None = None,
                  registro: dict | None = None, progreso: dict | None = None,
                  ramas: set[str] | None = None, marcar=None, leer_progreso=None,
                  guardar_registro=None, traer=None, gracia_h: float = L.GRACIA_H):
    """Informa de cada sesión y, con `--aplicar`, trae, devuelve u olvida."""
    ahora = time.time() if ahora is None else float(ahora)
    if registro is None:
        registro = _registro_limpio(_leer_json(REGISTRO, {}))
    else:
        limpio = _registro_limpio(registro)
        registro.clear()
        registro.update(limpio)
    leer_progreso = leer_progreso or T._progreso
    progreso = leer_progreso() if progreso is None else progreso
    ramas = _ramas_remotas() if ramas is None else ramas
    marcar = marcar or T._actualizar_progreso
    guardar_registro = guardar_registro or (lambda r: _guardar_json(REGISTRO, r))
    traer = traer or _correr_traer_nube

    acciones = L.seguir(registro, ramas, progreso, ahora, gracia_h)
    resumen = [{"id": tid, "accion": accion} for tid, accion in acciones.items()]
    if not aplicar:
        return resumen

    hubo_cambios = False
    hubo_traer = False
    for entrada in resumen:
        tid, accion = entrada["id"], entrada["accion"]
        if accion == "traer":
            hubo_traer = True
            entrada["nota"] = "vuelve a pendiente para traerla de la nube"
            marcar({tid: {"estado": "pendiente", "medio": "",
                          "nota": "traída del carril en la nube"}})
        elif accion == "devolver":
            entrada["nota"] = "devuelta del carril en la nube"
            nota = ("devuelta del carril en la nube: sin rama tras %g h (sesión %s)"
                    % (gracia_h, _url_de(registro, tid)))
            marcar({tid: {"estado": "pendiente", "medio": "", "nota": nota}})
        elif accion == "olvidar":
            registro["sesiones"] = [s for s in registro["sesiones"] if s.get("tarea") != tid]
            hubo_cambios = True
    if hubo_cambios:
        guardar_registro(registro)
    if hubo_traer:
        entrada = {"codigo": traer()}
        resumen.append({"id": "*", "accion": "traer_nube", "codigo": entrada["codigo"]})
    return resumen


def ver(como_json: bool = False, *, ahora: float | None = None,
        credito: dict | None = None, registro: dict | None = None,
        progreso: dict | None = None, leer_progreso=None) -> dict:
    """Crédito restante, presupuesto de hoy y sesiones vivas con su URL y estado."""
    ahora = time.time() if ahora is None else float(ahora)
    credito = _leer_json(CREDITO, {}) if credito is None else credito
    registro = _registro_limpio(_leer_json(REGISTRO, {}) if registro is None else registro)
    leer_progreso = leer_progreso or T._progreso
    progreso = leer_progreso() if progreso is None else progreso
    vivas = L.sesiones_vivas(registro, progreso)
    _, motivo, presupuesto = L.cupo_nube(credito, ahora, vivas)
    sesiones = []
    for s in registro["sesiones"]:
        tid = str(s.get("tarea") or "")
        if not tid or not L.viva(progreso, tid):
            continue
        e = progreso.get(tid) or {}
        sesiones.append({"tarea": tid, "url": s.get("url") or "",
                         "estado": "%s · %s" % (e.get("estado"), e.get("medio")),
                         "t": s.get("t")})
    datos = {"credito": {"total_usd": credito.get("total_usd"),
                         "restante_usd": credito.get("restante_usd"),
                         "vence": credito.get("vence")},
             "presupuesto_hoy": round(float(presupuesto), 2), "cupo": motivo,
             "sesiones_vivas": len(sesiones), "sesiones": sesiones}
    if como_json:
        print(json.dumps(datos, ensure_ascii=False, indent=1))
        return datos
    c = datos["credito"]
    print("Crédito nube: %s de %s $ (vence %s)" % (c["restante_usd"], c["total_usd"], c["vence"]))
    print("Presupuesto de hoy: %.2f $" % datos["presupuesto_hoy"])
    print("Cupo: %s" % datos["cupo"])
    print("Sesiones vivas: %d" % datos["sesiones_vivas"])
    for s in sesiones:
        print("  - %s · %s · %s" % (s["tarea"], s["estado"], s["url"]))
    return datos


def _imprimir_lanzar(resumen: list[dict]) -> None:
    for r in resumen:
        if r["accion"] == "lanzada":
            print("%s: sesión %s (%s)" % (r["id"], r["sesion"], r["url"]))
        elif r["accion"] == "seco":
            print("%s: en seco; brief en %s y rama %s" % (r["id"], r["brief"], r["rama"]))
        elif r["accion"] == "sin_cupo":
            print("%s: sin cupo · %s" % (r["id"], r["motivo"]))
        else:
            print("%s: %s · %s" % (r["id"], r["accion"], r.get("motivo") or ""))


def _imprimir_seguir(resumen: list[dict]) -> None:
    for r in resumen:
        if r["accion"] == "traer_nube":
            print("traer_nube terminó con código %s" % r["codigo"])
        else:
            print("%s: %s%s" % (r["id"], r["accion"],
                                (" · " + r["nota"]) if r.get("nota") else ""))


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest="orden", required=True)

    lan = sub.add_parser("lanzar", help="lanza una sesión de Claude en la nube por tarea")
    lan.add_argument("--ids", required=True, help="ids separados por comas")
    lan.add_argument("--modelo", default=MODELO)
    lan.add_argument("--seco", action="store_true", help="hace todo menos lanzar y marcar")

    seg = sub.add_parser("seguir", help="mira las ramas de la nube y trae, devuelve u olvida")
    seg.add_argument("--aplicar", action="store_true", help="trae de verdad (sin esto solo informa)")

    ver_p = sub.add_parser("ver", help="crédito, presupuesto de hoy y sesiones vivas")
    ver_p.add_argument("--json", action="store_true")

    a = ap.parse_args(argv)
    if a.orden == "lanzar":
        ids = [x.strip() for x in a.ids.split(",") if x.strip()]
        _imprimir_lanzar(lanzar(ids, a.modelo, a.seco))
        return 0
    if a.orden == "seguir":
        _imprimir_seguir(seguir_carril(a.aplicar))
        return 0
    ver(a.json)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
