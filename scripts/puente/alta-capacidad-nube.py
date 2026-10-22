#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Carril de alta capacidad en la nube (ola 1022B): CLI fino sobre la lógica de 1022A.

Lanza sesiones de Claude Code en la nube (`claude --model … --cloud <brief>`), las sigue y las
trae. Nunca imprime el entorno ni claves; los datos de la cuenta viven en `~/.starseed`.

Uso: alta-capacidad-nube.py lanzar --ids A,B [--modelo claude-opus-5-5] [--seco]
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

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)
import alta_capacidad_nube_logica as L  # noqa: E402

RAIZ = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(DIRECTORIO))
OLAS = os.path.join(RAIZ, "starseed_memory_root", "olas")
CREDITO = os.path.expanduser("~/.starseed/credito-claude-nube.json")
REGISTRO = os.path.expanduser("~/.starseed/alta-capacidad-nube.json")
BRIEFS = os.path.expanduser("~/.starseed/alta-capacidad-nube")
PLANTILLA = os.path.join(DIRECTORIO, "plantillas", "alta-capacidad-nube.md")
MODELO = "claude-opus-5-5"
ESPERA_S = 90.0


def _leer_json(ruta, defecto):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def _guardar_json(ruta, datos):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    tmp = "%s.tmp-%d" % (ruta, os.getpid())
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    os.replace(tmp, ruta)


def _leer_texto(ruta):
    try:
        with open(ruta, encoding="utf-8", errors="replace") as f:
            return f.read()
    except OSError:
        return ""


def normalizar_ids(texto):
    return [p.strip() for p in str(texto or "").split(",") if p.strip()]


def rutas_de_cola(olas=OLAS):
    rutas = glob.glob(os.path.join(olas, "cola-*.json"))
    return sorted(rutas, key=lambda r: (os.path.getmtime(r), r), reverse=True)


def buscar_tarea(tid, rutas, leer=_leer_json):
    for ruta in rutas:
        d = leer(ruta, {})
        for t in (d.get("tareas") if isinstance(d, dict) else None) or []:
            if isinstance(t, dict) and str(t.get("id")) == str(tid):
                return t, ruta
    return None, None


def registrar_sesion(registro, entrada):
    reg = dict(registro) if isinstance(registro, dict) else {}
    tid = str(entrada.get("tarea"))
    sesiones = [e for e in reg.get("sesiones") or []
                if isinstance(e, dict) and str(e.get("tarea")) != tid]
    sesiones.insert(0, dict(entrada))
    reg["sesiones"] = sesiones
    return reg


def quitar_sesion(registro, tid):
    reg = dict(registro) if isinstance(registro, dict) else {}
    reg["sesiones"] = [e for e in reg.get("sesiones") or []
                       if isinstance(e, dict) and str(e.get("tarea")) != str(tid)]
    return reg


def ramas_de_ls_remote(texto):
    ramas = set()
    for linea in str(texto or "").splitlines():
        partes = linea.split()
        if len(partes) >= 2 and partes[1].startswith("refs/heads/"):
            ramas.add(partes[1][len("refs/heads/"):])
    return ramas


def nota_devolucion(gracia_h, url):
    return "devuelta del carril en la nube: sin rama tras %g h (sesión %s)" % (
        gracia_h, url or "sin url")


def _traer():
    import traer_nube
    return traer_nube


def _esperar_sesion(log, espera_s=ESPERA_S, dormir=time.sleep, reloj=time.time, leer=None):
    leer = leer or _leer_texto
    t0 = reloj()
    while True:
        texto = leer(log)
        if L.sesion_de_salida(texto) or (reloj() - t0) >= espera_s:
            return texto
        dormir(2.0)


class _Lanzada:
    def __init__(self, cola):
        self.cola = cola

    def terminar(self):
        try:
            self.cola.terminate()
        except OSError:
            pass


def lanzar_en_pty(orden, log, teclas):
    """`script -q <log> <orden…>` con stdin de `tail -f <teclas>`: sin TTY, `--cloud` falla."""
    os.makedirs(os.path.dirname(log), exist_ok=True)
    open(teclas, "a", encoding="utf-8").close()
    cola = subprocess.Popen(["tail", "-f", teclas], stdout=subprocess.PIPE)
    subprocess.Popen(["script", "-q", log, *orden], stdin=cola.stdout,
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if cola.stdout:
        cola.stdout.close()
    return _Lanzada(cola)


def lanzar(ids, modelo=MODELO, seco=False, *, ahora=None, olas=OLAS, credito_ruta=CREDITO,
           registro_ruta=REGISTRO, briefs=BRIEFS, plantilla_ruta=PLANTILLA,
           traer=None, launcher=lanzar_en_pty, espera_s=ESPERA_S, dormir=time.sleep,
           reloj=time.time, decir=print):
    """Lanza una sesión por id con cupo; `seco` compone el brief pero no lanza ni marca."""
    ahora = reloj() if ahora is None else ahora
    traer = traer or _traer()
    credito = _leer_json(credito_ruta, {})
    registro = _leer_json(registro_ruta, {"sesiones": []})
    progreso = traer._progreso()
    vivas = L.sesiones_vivas(registro, progreso)
    plantilla = _leer_texto(plantilla_ruta)
    fecha = time.strftime("%Y%m%d", time.localtime(ahora))
    resumen = {"lanzadas": [], "saltadas": [], "fallidas": []}
    for tid in ids:
        cabe, motivo, _ = L.cupo_nube(credito, ahora, vivas)
        if not cabe:
            decir("%s: %s" % (tid, motivo))
            resumen["saltadas"].append(tid)
            continue
        tarea, _ruta = buscar_tarea(tid, rutas_de_cola(olas))
        if tarea is None:
            decir("%s: no está en ninguna cola de %s" % (tid, olas))
            resumen["fallidas"].append(tid)
            continue
        texto = L.brief(plantilla, tarea, fecha)
        os.makedirs(briefs, exist_ok=True)
        ruta_brief = os.path.join(briefs, "%s.md" % tid)
        with open(ruta_brief, "w", encoding="utf-8") as f:
            f.write(texto)
        if seco:
            decir("%s: en seco; brief en %s, no se lanza ni se marca" % (tid, ruta_brief))
            resumen["saltadas"].append(tid)
            continue
        traer._actualizar_progreso({tid: {"estado": "reasignada", "medio": L.MEDIO_NUBE}})
        orden = L.orden_cli(modelo, texto)
        log = os.path.join(briefs, "%s.log" % tid)
        teclas = os.path.join(briefs, "%s.teclas" % tid)
        lanzada = launcher(orden, log, teclas)
        try:
            salida = _esperar_sesion(log, espera_s, dormir, reloj)
        finally:
            if lanzada is not None:
                lanzada.terminar()
        dato = L.sesion_de_salida(salida)
        if not dato:
            traer._actualizar_progreso({tid: {"estado": "pendiente"}})
            decir("%s: la sesión no dijo su enlace; vuelve a pendiente" % tid)
            resumen["fallidas"].append(tid)
            continue
        rama = L.rama_pedida(tid, fecha)
        registro = registrar_sesion(registro, {
            "tarea": tid, "sesion": dato["sesion"], "url": dato["url"],
            "rama_pedida": rama, "modelo": modelo, "t": ahora})
        _guardar_json(registro_ruta, registro)
        vivas += 1
        decir("%s: sesión %s · %s · rama pedida %s" % (tid, dato["sesion"], dato["url"], rama))
        resumen["lanzadas"].append(tid)
    return resumen


def _rama_remota():
    r = subprocess.run(["git", "ls-remote", "origin", "refs/heads/nube/cc-*"],
                       cwd=RAIZ, capture_output=True, text=True, timeout=60)
    return r.stdout if r.returncode == 0 else ""


def _correr_traer():
    return subprocess.run(["python3", os.path.join(DIRECTORIO, "traer_nube.py"),
                           "revisar", "--aplicar"], cwd=RAIZ)


def seguir(aplicar=False, *, ahora=None, registro_ruta=REGISTRO, traer=None,
           ls_remote=_rama_remota, runner=_correr_traer, gracia_h=L.GRACIA_H_DEFECTO,
           decir=print):
    """Con rama: a `pendiente` y un solo `traer_nube revisar --aplicar`. Sin rama: devuelve."""
    ahora = time.time() if ahora is None else ahora
    traer = traer or _traer()
    registro = _leer_json(registro_ruta, {"sesiones": []})
    progreso = traer._progreso()
    acciones = L.seguir(registro, ramas_de_ls_remote(ls_remote()), progreso, ahora, gracia_h)
    por_tarea = {str(e.get("tarea")): e for e in registro.get("sesiones") or []
                 if isinstance(e, dict)}
    cambios, traer_algo, tocar_registro = {}, False, False
    for tid, accion in acciones.items():
        if accion == "traer":
            cambios[tid] = {"estado": "pendiente"}
            traer_algo = True
            decir("%s: rama lista; se trae" % tid)
        elif accion == "devolver":
            url = (por_tarea.get(tid) or {}).get("url") or ""
            cambios[tid] = {"estado": "pendiente", "nota": nota_devolucion(gracia_h, url)}
            registro = quitar_sesion(registro, tid)
            tocar_registro = True
            decir("%s: sin rama tras %g h; vuelve a pendiente" % (tid, gracia_h))
        elif accion == "olvidar":
            registro = quitar_sesion(registro, tid)
            tocar_registro = True
            decir("%s: ya no está en el carril; se olvida" % tid)
        else:
            decir("%s: esperar" % tid)
    if not aplicar:
        decir("(sin --aplicar: solo se informa, no se toca nada)")
        return acciones
    if cambios:
        traer._actualizar_progreso(cambios)
    if tocar_registro:
        _guardar_json(registro_ruta, registro)
    if traer_algo:
        runner()
    return acciones


def ver(json_salida=False, *, ahora=None, credito_ruta=CREDITO, registro_ruta=REGISTRO,
        traer=None, decir=print):
    ahora = time.time() if ahora is None else ahora
    traer = traer or _traer()
    credito = _leer_json(credito_ruta, {})
    registro = _leer_json(registro_ruta, {"sesiones": []})
    progreso = traer._progreso()
    vivas = L.sesiones_vivas(registro, progreso)
    cabe, motivo, presupuesto = L.cupo_nube(credito, ahora, vivas)
    acciones = L.seguir(registro, set(), progreso, ahora)
    sesiones = [{"tarea": str(e.get("tarea")), "url": e.get("url") or "",
                 "sesion": e.get("sesion") or "",
                 "estado": "terminada" if acciones.get(str(e.get("tarea"))) == "olvidar" else "viva"}
                for e in registro.get("sesiones") or [] if isinstance(e, dict)]
    d = {"credito_restante_usd": credito.get("restante_usd"),
         "credito_total_usd": credito.get("total_usd"), "vence": credito.get("vence"),
         "presupuesto_hoy_usd": round(presupuesto, 2), "sesiones_vivas": vivas,
         "cupo": cabe, "motivo": motivo, "sesiones": sesiones}
    if json_salida:
        decir(json.dumps(d, ensure_ascii=False, indent=1))
        return d
    decir("Crédito nube: %s $ de %s $ (vence %s)" % (
        d["credito_restante_usd"], d["credito_total_usd"], d["vence"]))
    decir("Presupuesto de hoy: %.2f $ · cupo: %s · %s" % (
        d["presupuesto_hoy_usd"], "sí" if cabe else "no", motivo))
    decir("Sesiones vivas: %d" % vivas)
    for s in sesiones:
        decir("  %s · %s · %s" % (s["tarea"], s["url"] or "sin url", s["estado"]))
    return d


def main(argv):
    ap = argparse.ArgumentParser(description="Carril de alta capacidad en la nube")
    sub = ap.add_subparsers(dest="orden", required=True)
    lan = sub.add_parser("lanzar")
    lan.add_argument("--ids", required=True)
    lan.add_argument("--modelo", default=MODELO)
    lan.add_argument("--seco", action="store_true")
    seg = sub.add_parser("seguir")
    seg.add_argument("--aplicar", action="store_true")
    ver_p = sub.add_parser("ver")
    ver_p.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)
    if a.orden == "lanzar":
        lanzar(normalizar_ids(a.ids), a.modelo, a.seco)
    elif a.orden == "seguir":
        seguir(a.aplicar)
    else:
        ver(a.json)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
