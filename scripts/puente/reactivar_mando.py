#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Reactivador de Genesis: TODOS los directores verifican y reparan, ya (2026-10-06).

Alex (22:56): «los agentes y procesos están detenidos y Genesis aún no está bien
diseñado, las funciones de los directores no están siendo realizadas porque aún tengo que
decirte aquí que lo repares. Genesis debería autorrepararse usando los directores
y habilidades del puente». Y luego: «debería de haber un botón hasta arriba para lanzar un
reactivador de todos los directores que verifique y repare cualquier error o situación».

Lo mismo que hacen los directores solos cada pocos minutos, pero AHORA y sin esperar sus
tiempos mínimos, con un parte paso a paso:

  1. Servicios: cada `com.starseed.*` que debe estar siempre vivo y no lo está se relanza
     (`launchctl kickstart -k`); los periódicos que salieron con error se dicen.
  2. Autocuración completa (`autocuracion_mando.revisar(forzar=True)`): el servidor de Genesis,
     el disco, los huecos de trabajadores, la capacidad en la nube, traer la nube y el
     enjambre atascado esperando proveedores que ya volvieron.
  3. Orquestador: si no hay ninguno vivo y hay trabajo, se relanza el vigilante, que lo arranca.
  4. Medidores de crédito: se leen por la terminal (Claude, Codex…) sin gastar tokens.

El parte se escribe tras cada paso en `~/.starseed/reactivador-ultimo.json` (el botón de Genesis
lo va leyendo) y al final se publica en el Chat Director. Un solo reactivador a la vez.

    python3 scripts/puente/reactivar_mando.py [--origen boton|auto] [--json]
"""
from __future__ import annotations

import argparse
import fcntl
import json
import os
import plistlib
import subprocess
import sys
import time

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)
RAIZ = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(DIRECTORIO))
INFORME = os.path.expanduser("~/.starseed/reactivador-ultimo.json")
CERROJO = os.path.expanduser("~/.starseed/cerrojos/reactivador.lock")
AGENTES = os.path.expanduser("~/Library/LaunchAgents")
PREFIJO = "com.starseed."


# ── decisiones (puras) ──────────────────────────────────────────────────────────

def es_persistente(plist):
    """PURA. ¿El servicio debe estar SIEMPRE vivo? (KeepAlive, o RunAtLoad sin calendario)."""
    if not isinstance(plist, dict):
        return False
    if plist.get("StartInterval") or plist.get("StartCalendarInterval"):
        return bool(plist.get("KeepAlive"))
    keep = plist.get("KeepAlive")
    if keep:
        return True
    return bool(plist.get("RunAtLoad")) and keep is None


def decidir_servicio(etiqueta, cargado, pid, salida, plist):
    """PURA. → (acción, por qué) con acción ∈ ok | relanzar | avisar.

    `cargado`: si aparece en `launchctl list`; `pid`: None si no corre; `salida`: último código."""
    if isinstance(plist, dict) and plist.get("_ilegible"):
        return "avisar", "su plist no se puede leer (XML mal formado): launchd no lo relanzará bien"
    persistente = es_persistente(plist)
    if not cargado:
        return "avisar", "no está cargado en launchd (no lo cargo sin ti: pudo apagarse a propósito)"
    if persistente and not pid:
        return "relanzar", "debía estar siempre vivo y no corre (última salida %s)" % salida
    if not persistente and salida not in (0, None, "0", "-"):
        return "avisar", "periódico: su última pasada salió con %s" % salida
    return "ok", "vivo" if pid else "periódico, última pasada bien"


def resumen(pasos):
    """PURA. Una línea con el balance del parte."""
    cuenta = {}
    for p in pasos:
        cuenta[p.get("estado")] = cuenta.get(p.get("estado"), 0) + 1
    partes = []
    for clave, nombre in (("reparado", "reparado(s)"), ("aviso", "aviso(s)"), ("fallo", "fallo(s)"),
                          ("ok", "bien")):
        if cuenta.get(clave):
            partes.append("%d %s" % (cuenta[clave], nombre))
    return " · ".join(partes) or "nada que revisar"


#: Hechos de la autocuración que son una REPARACIÓN (no una comprobación de rutina).
REPARACIONES = ("Genesis reiniciado", "disco con", "capacidad:", "capacidad fuera de la Mac", "servicios:")


def estado_autocuracion(r):
    """PURA. Estado del paso a partir de lo que devolvió `autocuracion_mando.revisar`."""
    hechos = [str(h) for h in (r or {}).get("hechos") or []]
    if not (r or {}).get("responde"):
        return "fallo"
    if any(h.startswith(REPARACIONES) or (h.startswith("enjambre:") and ("refrescar" in h or "reinicio" in h))
           for h in hechos):
        return "reparado"
    if any(h.startswith("no pude") for h in hechos) or any(h.startswith("enjambre:") for h in hechos):
        return "aviso"
    return "ok"


def parsear_launchctl(texto):
    """PURA. `launchctl list` → {etiqueta: (pid|None, salida)} solo de com.starseed.*."""
    salida = {}
    for linea in (texto or "").splitlines():
        trozos = linea.split()
        if len(trozos) < 3 or not trozos[2].startswith(PREFIJO):
            continue
        pid = int(trozos[0]) if trozos[0].isdigit() else None
        try:
            codigo = int(trozos[1])
        except ValueError:
            codigo = trozos[1]
        salida[trozos[2]] = (pid, codigo)
    return salida


# ── la máquina ──────────────────────────────────────────────────────────────────

def _correr(orden, tope_s=30):
    return subprocess.run(orden, capture_output=True, text=True, timeout=tope_s)


def _plists():
    datos = {}
    try:
        nombres = sorted(os.listdir(AGENTES))
    except OSError:
        return datos
    for n in nombres:
        if n.startswith(PREFIJO) and n.endswith(".plist"):
            try:
                with open(os.path.join(AGENTES, n), "rb") as f:
                    datos[n[: -len(".plist")]] = plistlib.load(f)
            except Exception:
                datos[n[: -len(".plist")]] = {"_ilegible": True}
    return datos


def paso_servicios(correr=_correr, plists_fn=_plists):
    vivos = parsear_launchctl(correr(["launchctl", "list"]).stdout)
    uid = os.getuid()
    relanzados, avisos, mal = [], [], []
    for etiqueta, plist in plists_fn().items():
        cargado = etiqueta in vivos
        pid, salida = vivos.get(etiqueta, (None, None))
        accion, porque = decidir_servicio(etiqueta, cargado, pid, salida, plist)
        corto = etiqueta[len(PREFIJO):]
        if accion == "relanzar":
            r = correr(["launchctl", "kickstart", "-k", "gui/%d/%s" % (uid, etiqueta)])
            (relanzados if r.returncode == 0 else mal).append(
                corto if r.returncode == 0 else "%s (%s)" % (corto, (r.stderr or "").strip()[:80]))
        elif accion == "avisar":
            avisos.append("%s: %s" % (corto, porque))
    if mal:
        estado = "fallo"
    elif relanzados:
        estado = "reparado"
    elif avisos:
        estado = "aviso"
    else:
        estado = "ok"
    partes = []
    if relanzados:
        partes.append("relanzados: " + ", ".join(relanzados))
    if mal:
        partes.append("no pude relanzar: " + ", ".join(mal))
    if avisos:
        partes.append("; ".join(avisos[:6]))
    return {"paso": "Servicios de Genesis", "estado": estado,
            "detalle": " · ".join(partes) or "%d servicios vivos" % len(vivos)}


def paso_autocuracion():
    import autocuracion_mando
    r = autocuracion_mando.revisar(forzar=True)
    hechos = r.get("hechos") or []
    enj = r.get("enjambre") or {}
    detalle = []
    detalle.append("Genesis %s" % ("responde" if r.get("responde") else "NO responde"))
    if r.get("libre_gb") is not None:
        detalle.append("disco %.1f GB libres" % r["libre_gb"])
    if enj:
        detalle.append("enjambre: %d trabajando, %d esperando proveedor" % (
            enj.get("trabajando", 0), enj.get("esperando", 0)))
    detalle += hechos
    estado = estado_autocuracion(r)
    return {"paso": "Directores de autocuración", "estado": estado, "detalle": " · ".join(detalle)}


def paso_orquestador(correr=_correr):
    import autocuracion_mando
    vivos = autocuracion_mando._procesos_orquestador()
    if vivos:
        return {"paso": "Orquestador", "estado": "ok",
                "detalle": "vivo (%s)" % ", ".join(str(p) for p, _ in vivos)}
    try:
        import asignar_huecos
        listas = len((asignar_huecos.reunir() or {}).get("listas") or [])
    except Exception:
        listas = -1
    if listas == 0:
        return {"paso": "Orquestador", "estado": "ok", "detalle": "parado y sin trabajo listo"}
    r = correr(["launchctl", "kickstart", "-k", "gui/%d/com.starseed.vigilante" % os.getuid()])
    return {"paso": "Orquestador", "estado": "reparado" if r.returncode == 0 else "fallo",
            "detalle": "no había ninguno vivo con %s tarea(s) lista(s): relancé el vigilante, que lo arranca"
            % ("varias" if listas < 0 else listas)}


def paso_medidores(correr=_correr):
    recolector = os.path.join(DIRECTORIO, "medidores_credito.py")
    if os.path.exists(recolector):
        r = correr([sys.executable, recolector, "recoger"], tope_s=150)
        lineas = [l for l in (r.stdout or "").splitlines() if l.strip()]
        return {"paso": "Medidores de crédito", "estado": "ok" if r.returncode == 0 else "aviso",
                "detalle": " · ".join(lineas[-4:]) or "recogidos"}
    try:
        import limites_claude
        import medidor_claude_terminal
        m = medidor_claude_terminal.leer()
        if not m.get("ok"):
            return {"paso": "Medidores de crédito", "estado": "aviso",
                    "detalle": "Claude por terminal: %s" % m.get("error")}
        v = {x["id"]: x for x in m.get("ventanas") or []}
        lectura = {"t": m["leido"], "fuente": "terminal",
                   "sesion_pct": v["sesion"]["usado_pct"], "sesion_reinicio": v["sesion"]["reinicia"],
                   "semana_pct": v["semana"]["usado_pct"], "semana_reinicio": v["semana"]["reinicia"]}
        modelo = next((x for x in m["ventanas"] if x["id"].startswith("semana-")), None)
        if modelo:
            lectura.update({"modelo_nombre": modelo["etiqueta"][len("Semana ("):-1],
                            "modelo_pct": modelo["usado_pct"], "modelo_reinicio": modelo["reinicia"]})
        limites_claude._guardar(limites_claude.anadir_lectura(limites_claude.leer(), lectura))
        return {"paso": "Medidores de crédito", "estado": "ok",
                "detalle": "Claude: sesión %s %% · semana %s %% (leído por terminal; el recolector "
                           "completo llega con la ola 1007M)" % (lectura["sesion_pct"], lectura["semana_pct"])}
    except Exception as e:
        return {"paso": "Medidores de crédito", "estado": "aviso", "detalle": "%s: %s" % (type(e).__name__, e)}


def _guardar(informe):
    try:
        os.makedirs(os.path.dirname(INFORME), exist_ok=True)
        tmp = INFORME + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(informe, f, ensure_ascii=False, indent=1)
        os.replace(tmp, INFORME)
    except OSError:
        pass


def _publicar(texto):
    try:
        import director_chat
        director_chat.publicar(texto, de="director-reactivador", rol="director", tipo="informe")
    except Exception:
        pass


PASOS = (paso_servicios, paso_autocuracion, paso_orquestador, paso_medidores)


def reactivar(origen="boton", pasos=PASOS, guardar=_guardar, publicar=_publicar, reloj=time.time):
    """Corre los pasos en orden; un paso que lanza no para a los demás."""
    t0 = reloj()
    informe = {"t": time.strftime("%Y-%m-%d %H:%M:%S"), "origen": origen, "enMarcha": True,
               "pasos": [], "resumen": "en marcha…"}
    guardar(informe)
    for paso in pasos:
        try:
            r = paso()
        except Exception as e:
            r = {"paso": getattr(paso, "__name__", "paso"), "estado": "fallo",
                 "detalle": "%s: %s" % (type(e).__name__, e)}
        informe["pasos"].append(r)
        guardar(informe)
    informe.update({"enMarcha": False, "resumen": resumen(informe["pasos"]),
                    "segundos": round(reloj() - t0, 1)})
    guardar(informe)
    lineas = ["Reactivador de directores (%s): %s" % (origen, informe["resumen"])]
    lineas += ["· %s — %s: %s" % (p["paso"], p["estado"], str(p.get("detalle") or "")[:300])
               for p in informe["pasos"]]
    publicar("\n".join(lineas))
    return informe


def main(argv=None):
    ap = argparse.ArgumentParser(description="Reactivador de todos los directores de Genesis")
    ap.add_argument("--origen", default="terminal")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)
    os.makedirs(os.path.dirname(CERROJO), exist_ok=True)
    with open(CERROJO, "a+") as f:
        try:
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            print(json.dumps({"enMarcha": True, "resumen": "ya hay un reactivador en marcha"},
                             ensure_ascii=False))
            return 0
        try:
            informe = reactivar(args.origen)
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)
    print(json.dumps(informe, ensure_ascii=False) if args.json else
          informe["resumen"] + "\n" + "\n".join("· %s: %s" % (p["paso"], p["estado"]) for p in informe["pasos"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
