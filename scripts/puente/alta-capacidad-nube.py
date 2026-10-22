#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Carril de alta capacidad en la nube: lanzar, seguir y traer sesiones de Claude Code.

Alex tiene un crédito de sesiones en la nube que SOLO gastan las sesiones de `claude --cloud`
(no Cowork, no las tareas programadas). Medido el 2026-10-22: dos sesiones a mano bajaron el
crédito de 250 a 248 $ sin mover la semana. Esto lo deja automático:

  python3 alta-capacidad-nube.py lanzar --ids A,B [--modelo claude-opus-5-5] [--seco]
  python3 alta-capacidad-nube.py seguir [--aplicar]
  python3 alta-capacidad-nube.py ver [--json]

Nunca imprime el entorno ni claves. Las órdenes de estado usan `ps -o pid=,comm=` (en macOS
`pgrep -l` y `ps -E` imprimen el entorno) y el registro vive en `~/.starseed/`, fuera del repo.
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
RAIZ = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(DIRECTORIO))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import alta_capacidad_nube_logica as L  # noqa: E402
import credito_claude_nube as credito_mod  # noqa: E402
import traer_nube  # noqa: E402

OLAS = os.path.join(RAIZ, "starseed_memory_root", "olas")
PROGRESO = os.path.join(OLAS, "progreso.json")
CREDITO = os.path.expanduser("~/.starseed/credito-claude-nube.json")
REGISTRO = os.path.expanduser("~/.starseed/alta-capacidad-nube.json")
CARPETA = os.path.expanduser("~/.starseed/alta-capacidad-nube")
PLANTILLA = os.path.join(DIRECTORIO, "plantillas", "alta-capacidad-nube.md")
MODELO_POR_DEFECTO = "claude-opus-5-5"
ESPERA_SESION_S = 90


# ── disco (lo justo, sin tocar progreso.json a mano) ───────────────────────────

def _leer_json(ruta, defecto):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def _escribir_json(ruta, datos, modo=None):
    carpeta = os.path.dirname(ruta)
    if carpeta:
        os.makedirs(carpeta, exist_ok=True)
    tmp = "%s.tmp-%d" % (ruta, os.getpid())
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    if modo is not None:
        os.chmod(tmp, modo)
    os.replace(tmp, ruta)


def leer_credito():
    return credito_mod.leer(CREDITO)


def leer_registro():
    d = _leer_json(REGISTRO, {})
    if not isinstance(d, dict) or not isinstance(d.get("sesiones"), list):
        return {"sesiones": []}
    return d


def guardar_registro(d):
    _escribir_json(REGISTRO, d, modo=0o600)


def leer_progreso():
    d = _leer_json(PROGRESO, {})
    return d if isinstance(d, dict) else {}


def marcar_progreso(cambios):
    """Marca el estado con el cerrojo de `traer_nube` (nunca se escribe progreso.json a mano)."""
    traer_nube._actualizar_progreso(cambios)


def rutas_de_cola():
    """Las colas vivas, de la más reciente a la más vieja (la primera que tenga el id manda).

    Manda `starseed_memory_root/olas/` (las colas vivas de la Mac). Solo si allí no hay ninguna
    se mira `enjambre/colas/`, que es lo versionado y puede ser una copia más vieja.
    """
    rutas = glob.glob(os.path.join(OLAS, "cola-*.json"))
    if not rutas:
        rutas = glob.glob(os.path.join(RAIZ, "enjambre", "colas", "cola-*.json"))
    try:
        rutas.sort(key=os.path.getmtime, reverse=True)
    except OSError:
        rutas.sort(reverse=True)
    return rutas


def buscar_tarea(tid):
    """La tarea `tid` en la cola más reciente que la tenga, o None."""
    for ruta in rutas_de_cola():
        datos = _leer_json(ruta, [])
        tareas = datos.get("tareas", datos) if isinstance(datos, dict) else datos
        for t in tareas if isinstance(tareas, list) else []:
            if isinstance(t, dict) and str(t.get("id")) == str(tid):
                return t
    return None


def leer_plantilla():
    try:
        with open(PLANTILLA, encoding="utf-8") as f:
            return f.read()
    except OSError:
        return ""


def fecha_de(ahora):
    return time.strftime("%Y%m%d", time.localtime(ahora))


def iso_de(ahora):
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ahora))


def sesion_de_salida(texto):
    return L.sesion_de_salida(texto)


def _leer_texto(ruta):
    try:
        with open(ruta, encoding="utf-8", errors="replace") as f:
            return f.read()
    except OSError:
        return ""


def lanzar_orden(orden, log, teclas, esperar_s=ESPERA_SESION_S):
    """Lanza la orden dentro de una pseudoterminal (`script`) con `tail -f teclas` de entrada.

    Sin TTY `claude --cloud` falla con «requires an interactive terminal»; `script -q <log>
    <orden…>` le da uno y guarda la salida en `log`. Se espera hasta `esperar_s` a que aparezca
    la sesión, se mata el `tail` y se devuelve el texto de la salida.
    """
    os.makedirs(os.path.dirname(log) or ".", exist_ok=True)
    os.close(os.open(teclas, os.O_CREAT | os.O_WRONLY, 0o600))
    os.close(os.open(log, os.O_CREAT | os.O_WRONLY | os.O_TRUNC, 0o600))
    cola = subprocess.Popen(["tail", "-f", teclas], stdout=subprocess.PIPE,
                            stderr=subprocess.DEVNULL)
    try:
        subprocess.Popen(["script", "-q", log, *orden], stdin=cola.stdout,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        fin = time.time() + max(1, int(esperar_s))
        while time.time() < fin:
            if sesion_de_salida(_leer_texto(log)):
                break
            time.sleep(1)
    finally:
        try:
            cola.terminate()
            cola.wait(timeout=5)
        except Exception:  # noqa: BLE001 — el tail es auxiliar: nunca debe tumbar el lanzamiento
            try:
                cola.kill()
            except OSError:
                pass
    return _leer_texto(log)


def _anotar_sesion(registro, tarea, info, rama, modelo, ahora):
    sesiones = [s for s in registro.get("sesiones") or []
                if not (isinstance(s, dict) and s.get("tarea") == tarea)]
    sesiones.append({"tarea": tarea, "sesion": info["sesion"], "url": info["url"],
                     "rama_pedida": rama, "modelo": modelo, "t": iso_de(ahora)})
    registro["sesiones"] = sesiones
    return registro


def lanzar(ids, modelo=MODELO_POR_DEFECTO, seco=False, ahora=None):
    """Lanza una sesión de la nube por id. `--seco` decide y comprueba, pero no toca nada."""
    ahora = time.time() if ahora is None else ahora
    credito = leer_credito()
    registro = leer_registro()
    progreso = leer_progreso()
    fecha = fecha_de(ahora)
    plantilla = leer_plantilla()
    lineas = []
    lanzadas = 0
    for tid in ids:
        tarea = buscar_tarea(tid)
        if not tarea:
            lineas.append("%s: no está en ninguna cola viva; no se lanza." % tid)
            continue
        cabe, motivo, presupuesto = L.cupo_nube(credito, ahora,
                                               L.sesiones_vivas(registro, progreso) + lanzadas)
        if not cabe:
            lineas.append("%s: sin cupo · %s. No se lanza." % (tid, motivo))
            continue
        rama = L.rama_pedida(tid, fecha)
        texto = L.brief(plantilla, tarea, fecha)
        try:
            orden = L.orden_cli(modelo, texto)
        except ValueError as e:
            lineas.append("%s: %s. No se lanza." % (tid, e))
            continue
        if seco:
            lineas.append("%s: listo en seco · rama %s · cupo %.2f $/día · brief de %d caracteres "
                          "(no se guarda, no se marca y no se lanza)." % (tid, rama, presupuesto,
                                                                          len(texto)))
            continue
        os.makedirs(CARPETA, exist_ok=True)
        with open(os.path.join(CARPETA, tid + ".md"), "w", encoding="utf-8") as f:
            f.write(texto)
        marcar_progreso({tid: {
            "estado": "reasignada", "medio": "claude-nube",
            "nota": "reasignada al carril de alta capacidad en la nube (%s)" % rama}})
        lanzadas += 1
        log = os.path.join(CARPETA, tid + ".log")
        teclas = os.path.join(CARPETA, tid + ".teclas")
        fallo = ""
        try:
            salida = lanzar_orden(orden, log, teclas)
        except Exception as e:  # noqa: BLE001 — sin `script` o sin TTY se devuelve a la cola
            salida, fallo = "", "no se pudo lanzar (%s: %s)" % (type(e).__name__, e)
        info = sesion_de_salida(salida)
        if not info:
            nota = fallo or "el carril en la nube no devolvió sesión (sin «View:»)"
            marcar_progreso({tid: {"estado": "pendiente", "medio": None,
                                   "nota": nota + ": vuelve a la cola"}})
            lanzadas -= 1
            lineas.append("%s: %s; vuelve a pendiente." % (tid, nota))
            continue
        guardar_registro(_anotar_sesion(registro, tid, info, rama, modelo, ahora))
        lineas.append("%s: sesión %s · %s · rama pedida %s"
                      % (tid, info["sesion"], info["url"], rama))
    return lineas


def ramas_remotas():
    """Las ramas `nube/cc-*` del remoto (sin `refs/heads/`); conjunto vacío si git falla."""
    try:
        r = subprocess.run(["git", "ls-remote", "origin", "refs/heads/nube/cc-*"],
                           cwd=RAIZ, capture_output=True, text=True, timeout=60)
    except Exception:  # noqa: BLE001 — sin red o sin git se informa, no se rompe
        return set()
    ramas = set()
    for linea in (r.stdout or "").splitlines():
        partes = linea.split()
        if len(partes) >= 2 and partes[1].startswith("refs/heads/"):
            ramas.add(partes[1][len("refs/heads/"):])
    return ramas


def correr_traer():
    """Una sola pasada de `traer_nube.py revisar --aplicar` para todas las ramas listas."""
    try:
        return subprocess.run([sys.executable, os.path.join(DIRECTORIO, "traer_nube.py"),
                               "revisar", "--aplicar"], cwd=RAIZ, timeout=3600)
    except Exception as e:  # noqa: BLE001
        print("traer_nube no se pudo ejecutar: %s: %s" % (type(e).__name__, e))
        return None


def _horas(gracia_h):
    return ("%g" % float(gracia_h))


def seguir(aplicar=False, ahora=None, gracia_h=8):
    """Mira el registro contra el remoto y, con `--aplicar`, trae, devuelve u olvida."""
    ahora = time.time() if ahora is None else ahora
    registro = leer_registro()
    progreso = leer_progreso()
    plan = L.seguir(registro, ramas_remotas(), progreso, ahora, gracia_h)
    urls = {s.get("tarea"): s.get("url") for s in registro.get("sesiones") or []
            if isinstance(s, dict)}
    lineas, cambios, olvidar, traer = [], {}, [], []
    for tid, accion in plan.items():
        if accion == "traer":
            traer.append(tid)
            cambios[tid] = {"estado": "pendiente", "medio": None,
                            "nota": "vuelve del carril en la nube con su rama lista"}
            lineas.append("%s: traer · la rama ya está en el remoto." % tid)
        elif accion == "devolver":
            cambios[tid] = {
                "estado": "pendiente", "medio": None,
                "nota": "devuelta del carril en la nube: sin rama tras %s h (sesión %s)"
                        % (_horas(gracia_h), urls.get(tid) or "sin url")}
            lineas.append("%s: devolver · sin rama tras %s h (sesión %s)."
                          % (tid, _horas(gracia_h), urls.get(tid) or "sin url"))
        elif accion == "olvidar":
            olvidar.append(tid)
            lineas.append("%s: olvidar · la tarea ya no está en el carril." % tid)
        else:
            lineas.append("%s: esperar · la sesión sigue trabajando." % tid)
    if not aplicar:
        if lineas:
            lineas.append("(sin --aplicar: solo se informa, no se toca nada)")
        return lineas
    if cambios:
        marcar_progreso(cambios)
    if olvidar:
        registro["sesiones"] = [s for s in registro.get("sesiones") or []
                                if not (isinstance(s, dict) and s.get("tarea") in olvidar)]
        guardar_registro(registro)
    if traer:
        correr_traer()
    return lineas


def ver(como_json=False, ahora=None):
    """Crédito restante, presupuesto de hoy y sesiones del registro con su URL y estado."""
    ahora = time.time() if ahora is None else ahora
    credito = leer_credito()
    registro = leer_registro()
    progreso = leer_progreso()
    vivas = L.sesiones_vivas(registro, progreso)
    cabe, motivo, presupuesto = L.cupo_nube(credito, ahora, vivas)
    sesiones = []
    for s in registro.get("sesiones") or []:
        if not isinstance(s, dict):
            continue
        tid = s.get("tarea")
        entrada = progreso.get(tid) if isinstance(progreso.get(tid), dict) else {}
        viva = (entrada.get("estado") == "reasignada"
                and (entrada.get("medio") or "") == "claude-nube")
        sesiones.append({"tarea": tid, "sesion": s.get("sesion"), "url": s.get("url"),
                         "estado": entrada.get("estado") or "?", "viva": viva,
                         "rama_pedida": s.get("rama_pedida")})
    datos = {
        "credito_usd": credito.get("restante_usd"),
        "total_usd": credito.get("total_usd"),
        "vence": credito.get("vence"),
        "presupuesto_hoy_usd": presupuesto,
        "hay_cupo": cabe,
        "motivo": motivo,
        "sesiones_vivas": vivas,
        "sesiones": sesiones,
    }
    if como_json:
        print(json.dumps(datos, ensure_ascii=False, indent=1))
        return 0
    print("Crédito Claude en la nube: %s $ de %s $ · vence %s"
          % (datos["credito_usd"], datos["total_usd"], datos["vence"]))
    print("Presupuesto de hoy: %.2f $ · %s" % (presupuesto, motivo))
    print("Sesiones vivas: %d" % vivas)
    for s in sesiones:
        print("- %s · %s · %s%s" % (s["tarea"], s["url"], s["estado"],
                                    " (viva)" if s["viva"] else ""))
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest="orden", required=True)
    lan = sub.add_parser("lanzar", help="lanza sesiones de Claude en la nube para esas tareas")
    lan.add_argument("--ids", required=True, help="ids separados por comas")
    lan.add_argument("--modelo", default=MODELO_POR_DEFECTO)
    lan.add_argument("--seco", action="store_true", help="comprueba y decide, pero no toca nada")
    seg = sub.add_parser("seguir", help="mira qué sesiones ya tienen rama, o se devuelven")
    seg.add_argument("--aplicar", action="store_true")
    seg.add_argument("--gracia-h", type=float, default=8.0)
    verp = sub.add_parser("ver", help="crédito, presupuesto de hoy y sesiones vivas")
    verp.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)
    if a.orden == "lanzar":
        ids = [x.strip() for x in str(a.ids).split(",") if x.strip()]
        for linea in lanzar(ids, a.modelo, a.seco):
            print(linea)
        return 0
    if a.orden == "seguir":
        for linea in seguir(a.aplicar, gracia_h=a.gracia_h):
            print(linea)
        return 0
    return ver(a.json)


if __name__ == "__main__":
    sys.exit(main())

