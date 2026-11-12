#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""«Ronda de aparatos»: mientras dura, nada pesado EMPIEZA en la Mac (RON1112C · contrato §12 de centro-versiones-1105.md).

POR QUÉ EXISTE
--------------
El 11-11 a las 22:22 la autopublicación tomó un candidato nuevo y arrancó sus puertas locales; la carga de la Mac
fue de 34 a 60 durante veinte minutos, justo mientras Alex hacía las llamadas de prueba con la tableta. La voz y el
vídeo dependen de temporizadores: los números de esas llamadas no valen y una llamada se cayó. Nada avisaba a los
trabajos pesados de que había una ronda, ni a la persona de que la Mac no estaba tranquila.

QUÉ ES
------
Un archivo, `~/.starseed/produccion/ronda-aparatos.json` (`STARSEED_PRODUCCION_DIR` lo cambia en las pruebas), que
escribe SOLO el director de pruebas, a petición (`director_pruebas.py pedir ronda-iniciar|ronda-terminar …`, que es lo
mismo que pulsa el panel «Pruebas» de Genesis). Dice quién la pidió, por qué, desde cuándo y hasta cuándo.

  · Caduca sola: 30 minutos por defecto, renovable, y NUNCA más de 90 desde que empezó (el tope se vuelve a calcular
    al leer: un archivo con un `hasta` más lejano no alarga nada).
  · Quien admite trabajos pesados NO se fía de la bandera `activa` del archivo: mira la hora (`hasta` frente al reloj),
    de modo que, aunque el director esté parado, la ronda se acaba sola.
  · No mata nada. Un trabajo que ya corre sigue; solo se le pide a los que van a EMPEZAR que esperen.
  · Un archivo que falta, vacío o ilegible significa «sin ronda» (se deja pasar): una ronda que nadie puede leer no debe
    parar la fábrica.

LA PUERTA DE ADMISIÓN (cada lugar que lanza tsc, vitest o pruebas locales la consulta)
--------------------------------------------------------------------------------------
  python3 scripts/puente/ronda.py activa     una línea; código 0 = HAY ronda (espera), 1 = no hay (adelante)
  python3 scripts/puente/ronda.py esperar    se queda hasta que no haya ronda; una línea por minuto; código 0
  python3 scripts/puente/ronda.py estado     lo que se sabe ahora, para una persona (--json para máquinas)
  ronda.activa() / ronda.esperar()           lo mismo, para código Python

Lo que espera por una ronda NO gasta el plazo de nada: los plazos de cada trabajo empiezan cuando por fin arranca.

LO QUE EL ESTADO SABE DE «LA MAC ESTÁ TRANQUILA» (y lo que no)
---------------------------------------------------------------
Sabe: si un trabajo pesado que empezó antes sigue vivo (el cerrojo `pesado.lock` con su dueño vivo y la tabla de
procesos: tsc, vitest, pytest, unittest, next build), cuánto lleva y cuánto suele tardar (la mediana de las veces que
este mismo servicio los vio terminar), la carga de la Mac y la presión de memoria. No sabe: qué hace la tableta, apps
ajenas que no sean de esa lista, el disco ni la red; si la carga está alta sin un trabajo conocido lo dice y no adivina.

Funciones puras arriba, el mundo (disco, reloj, procesos) abajo en `Mundo`, que las pruebas sustituyen entero.
"""
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone

ARCHIVO = "ronda-aparatos.json"
DURACIONES = "ronda-duraciones.json"
MINUTOS_DEF = 30
MINUTOS_MAX = 90                 # desde que EMPIEZA la ronda, contando las renovaciones
MOTIVO_MAX = 200
CADA_S = 60
VIEJO_S = 3 * CADA_S             # una lectura del silencio más vieja que esto ya no se da por buena
SONDEO_S = 5                     # cada cuánto mira esperar() si la ronda sigue
AVISO_S = 60                     # y cada cuánto lo dice

#: Lo que cuenta como «trabajo pesado» en la tabla de procesos (lista cerrada). (tipo, texto, patrón sobre la orden)
PESADOS = (
    ("tsc", "el type check", re.compile(r"(?:^|[\s/])tsc(?:\s|$)")),
    ("vitest", "las pruebas unitarias (vitest)", re.compile(r"vitest")),
    ("pytest", "las pruebas del puente (pytest)", re.compile(r"-m\s+pytest")),
    ("unittest", "las pruebas del puente (unittest)", re.compile(r"-m\s+unittest")),
    ("build", "la compilación (next build)", re.compile(r"next(?:/dist/bin/next)?\s+build")),
)
NOMBRE_DE = {t: n for t, n, _ in PESADOS}
NOMBRE_DE["turno"] = "un trabajo con el turno de lo pesado"
_PROPIOS = re.compile(r"ronda\.py|test_ronda|tsc-turno|grep|\bps\b")


def a_iso(epoch):
    return datetime.fromtimestamp(epoch, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if epoch is not None else None


def de_iso(texto):
    try:
        return datetime.strptime(str(texto)[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc).timestamp()
    except (ValueError, TypeError):
        return None


def hora_local(epoch):
    return time.strftime("%H:%M", time.localtime(epoch))


def minutos_texto(seg):
    m = max(1, int(round(seg / 60.0)))
    if m < 60:
        return "%d min" % m
    return "%d h %02d min" % (m // 60, m % 60)


# ── la ronda: estado y transiciones (puras) ──────────────────────────────────────────────────────────────────────

def archivo_vacio():
    return {"formato": 1, "t": None, "cada_s": CADA_S, "ronda": None, "silencio": None}


def normalizar(d):
    """Lo leído del disco → archivo válido; lo que no encaja se descarta (nunca rompe)."""
    e = archivo_vacio()
    if not isinstance(d, dict):
        return e
    if isinstance(d.get("t"), str):
        e["t"] = d["t"][:25]
    r = d.get("ronda")
    if isinstance(r, dict) and de_iso(r.get("desde")) is not None and de_iso(r.get("hasta")) is not None:
        e["ronda"] = {
            "activa": bool(r.get("activa")),
            "quien": str(r.get("quien") or "?")[:40],
            "motivo": str(r.get("motivo") or "")[:MOTIVO_MAX],
            "desde": r["desde"], "hasta": r["hasta"],
            "tope": r.get("tope") if de_iso(r.get("tope")) is not None else a_iso(de_iso(r["desde"]) + MINUTOS_MAX * 60),
            "renovaciones": r["renovaciones"] if isinstance(r.get("renovaciones"), int) and not isinstance(r.get("renovaciones"), bool) else 0,
            "renovada_por": r.get("renovada_por") if isinstance(r.get("renovada_por"), str) else None,
            "peticion": r.get("peticion") if isinstance(r.get("peticion"), str) else None,
            "fin": r.get("fin") if de_iso(r.get("fin")) is not None else None,
            "fin_por": r.get("fin_por") if isinstance(r.get("fin_por"), str) else None,
        }
    if isinstance(d.get("silencio"), dict):
        e["silencio"] = d["silencio"]
    return e


def hasta_efectivo(r):
    """Cuándo acaba DE VERDAD una ronda (epoch): el `hasta` escrito, pero nunca pasado el tope de 90 min desde que empezó."""
    desde, hasta = de_iso(r.get("desde")), de_iso(r.get("hasta"))
    if desde is None or hasta is None:
        return None
    return min(hasta, desde + MINUTOS_MAX * 60)


def vista(datos, ahora):
    """PURA. {activa, quedan_s, hasta, quien, motivo, …} a la hora de `ahora`. La hora manda; la bandera no."""
    r = (datos or {}).get("ronda") if isinstance(datos, dict) else None
    if not isinstance(r, dict) or r.get("fin"):
        return {"activa": False, "quedan_s": 0, "ronda": r if isinstance(r, dict) else None}
    fin = hasta_efectivo(r)
    if fin is None or ahora >= fin:
        return {"activa": False, "quedan_s": 0, "ronda": r}
    return {"activa": True, "quedan_s": int(fin - ahora), "hasta": fin, "ronda": r}


def linea_activa(v):
    r = v["ronda"]
    return "ronda de aparatos activa (%s: %s): nada pesado empieza; termina a las %s, quedan %s" % (
        r.get("quien") or "?", r.get("motivo") or "sin motivo", hora_local(v["hasta"]), minutos_texto(v["quedan_s"]))


def iniciar(datos, quien, motivo, minutos, ahora, peticion=None):
    """PURA. Empieza una ronda o, si ya hay una activa, la renueva. → (datos nuevos, 'hecha'|'rechazada', texto)."""
    datos = normalizar(datos)
    if not isinstance(quien, str) or not quien.strip():
        return datos, "rechazada", "falta quién pide la ronda"
    motivo = " ".join(str(motivo or "").split())
    if not motivo:
        return datos, "rechazada", "la ronda necesita un motivo (qué se va a probar)"
    if len(motivo) > MOTIVO_MAX:
        return datos, "rechazada", "el motivo pasa de %d caracteres" % MOTIVO_MAX
    if minutos is None:
        minutos = MINUTOS_DEF
    if isinstance(minutos, bool) or not isinstance(minutos, int) or not 1 <= minutos <= MINUTOS_MAX:
        return datos, "rechazada", "los minutos deben ser de 1 a %d" % MINUTOS_MAX
    v = vista(datos, ahora)
    if v["activa"]:
        r = dict(datos["ronda"])
        tope = de_iso(r["desde"]) + MINUTOS_MAX * 60
        nuevo = min(ahora + minutos * 60, tope)
        if nuevo <= v["hasta"] + 0.5:
            if v["hasta"] >= tope - 0.5:
                return datos, "hecha", "la ronda ya está en su máximo de %d min (termina a las %s); no se alarga más" % (MINUTOS_MAX, hora_local(v["hasta"]))
            return datos, "hecha", "la ronda ya dura hasta las %s; no hace falta renovarla" % hora_local(v["hasta"])
        r.update(hasta=a_iso(nuevo), tope=a_iso(tope), activa=True, renovaciones=r["renovaciones"] + 1, renovada_por=quien.strip().lower()[:40],
                 peticion=peticion or r.get("peticion"))
        datos["ronda"] = r
        recorte = " (recortada al máximo de %d min)" % MINUTOS_MAX if nuevo < ahora + minutos * 60 else ""
        return datos, "hecha", "ronda renovada hasta las %s%s" % (hora_local(nuevo), recorte)
    datos["ronda"] = {"activa": True, "quien": quien.strip().lower()[:40], "motivo": motivo, "desde": a_iso(ahora),
                      "hasta": a_iso(ahora + minutos * 60), "tope": a_iso(ahora + MINUTOS_MAX * 60), "renovaciones": 0,
                      "renovada_por": None, "peticion": peticion, "fin": None, "fin_por": None}
    return datos, "hecha", "ronda de aparatos iniciada hasta las %s (%d min); nada pesado empieza mientras dure" % (hora_local(ahora + minutos * 60), minutos)


def terminar(datos, quien, ahora):
    """PURA. Termina la ronda activa. Idempotente. → (datos nuevos, 'hecha', texto)."""
    datos = normalizar(datos)
    v = vista(datos, ahora)
    if not v["activa"]:
        return datos, "hecha", "no había ninguna ronda activa"
    r = dict(datos["ronda"])
    r.update(activa=False, fin=a_iso(ahora), fin_por=str(quien or "?").strip().lower()[:40])
    datos["ronda"] = r
    return datos, "hecha", "ronda terminada: los trabajos pesados que esperaban pueden empezar"


def caducar(datos, ahora):
    """PURA. Si la ronda pasó su hora, la marca terminada por caducidad. → (datos, cambió)."""
    datos = normalizar(datos)
    r = datos["ronda"]
    if not r or r.get("fin") or vista(datos, ahora)["activa"]:
        return datos, False
    fin = hasta_efectivo(r) or ahora
    r = dict(r)
    r.update(activa=False, fin=a_iso(min(fin, ahora)), fin_por="caducó")
    datos["ronda"] = r
    return datos, True


# ── el silencio de la Mac (puro) ─────────────────────────────────────────────────────────────────────────────────

def mediana(xs):
    xs = sorted(x for x in xs if isinstance(x, (int, float)) and x > 0)
    if not xs:
        return None
    n = len(xs)
    return xs[n // 2] if n % 2 else (xs[n // 2 - 1] + xs[n // 2]) / 2.0


def etime_a_s(texto):
    """'[[dd-]hh:]mm:ss' de `ps` → segundos, o None."""
    m = re.match(r"^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$", str(texto or "").strip())
    if not m:
        return None
    d, h, mi, s = (int(x) if x else 0 for x in m.groups())
    return ((d * 24 + h) * 60 + mi) * 60 + s


def pesados_de_procesos(procesos):
    """PURA. [(pid, lleva_s, orden)] → [{tipo, n, lleva_s}] (un renglón por tipo, con el proceso más antiguo)."""
    por = {}
    for _pid, lleva, orden in procesos or []:
        orden = str(orden or "")
        if _PROPIOS.search(orden):
            continue
        for tipo, _n, patron in PESADOS:
            if patron.search(orden):
                f = por.setdefault(tipo, {"tipo": tipo, "n": 0, "lleva_s": None})
                f["n"] += 1
                if lleva is not None and (f["lleva_s"] is None or lleva > f["lleva_s"]):
                    f["lleva_s"] = lleva
                break
    return [por[t] for t, _n, _p in PESADOS if t in por]


def juzgar(pesados, dueno, carga, nucleos, presion, carga_max, duraciones, ahora):
    """PURA. Lo que se sabe de «la Mac está tranquila». `dueno` = (pid_vivo: bool, epoch) del cerrojo pesado o None."""
    pesados = [dict(p) for p in pesados or []]
    if dueno and dueno[0] and not pesados:
        pesados.append({"tipo": "turno", "n": 1, "lleva_s": max(0, int(ahora - dueno[1])) if dueno[1] else None})
    filas = []
    for p in pesados:
        suele = mediana((duraciones or {}).get(p["tipo"]) or [])
        faltan = max(0, suele - p["lleva_s"]) if suele and p["lleva_s"] is not None else None
        filas.append({"tipo": p["tipo"], "que": NOMBRE_DE.get(p["tipo"], p["tipo"]), "n": p["n"], "lleva_s": p["lleva_s"],
                      "suele_s": int(suele) if suele else None, "faltan_s": int(faltan) if faltan is not None else None})
    c1 = carga[0] if carga else None
    if filas:
        partes = []
        for f in filas:
            t = f["que"]
            if f["faltan_s"] is not None:
                t += ", unos %s" % minutos_texto(max(f["faltan_s"], 60))
            elif f["lleva_s"] is not None:
                t += " (lleva %s; no sé cuánto suele tardar)" % minutos_texto(f["lleva_s"])
            else:
                t += " (no sé desde cuándo corre)"
            partes.append(t)
        tranquila = False
        linea = "espera a que termine " + " y ".join(partes)
    elif c1 is None:
        tranquila = None
        linea = "no pude leer la carga de la Mac: no sé si está tranquila"
    elif c1 > carga_max:
        tranquila = False
        linea = ("no veo ningún trabajo pesado de los que conozco, pero la carga es %s (tranquila es %s o menos con %s núcleos): "
                 "algo más trabaja; espera a que baje" % (_n1(c1), _n1(carga_max), nucleos if nucleos else "?"))
    elif presion is not None and presion >= 2:
        tranquila = False
        linea = "la presión de memoria de macOS está en aviso o peor: espera a que baje"
    else:
        tranquila = True
        linea = "la Mac está tranquila: ningún trabajo pesado conocido y carga %s" % _n1(c1)
    return {"t": a_iso(ahora), "tranquila": tranquila, "carga1": c1, "carga5": carga[1] if carga and len(carga) > 1 else None,
            "nucleos": nucleos, "carga_max": round(carga_max, 1), "presion": presion, "pesados": filas, "linea": linea}


def _n1(x):
    return ("%.1f" % x).replace(".", ",")


def anotar_duraciones(datos_dur, pesados, ahora):
    """PURA. Aprende cuánto tardan: si un tipo visto en la pasada anterior ya no está (o su `lleva` bajó = arrancó otro),
    lo último que se vio vale como duración (con la cadencia de la pasada de margen). → archivo nuevo."""
    d = datos_dur if isinstance(datos_dur, dict) else {}
    vistos = dict(d.get("vistos") or {})
    durs = {k: list(v)[-8:] for k, v in (d.get("duraciones") or {}).items() if isinstance(v, list)}
    ahora_por = {p["tipo"]: p for p in pesados or [] if p.get("lleva_s") is not None}
    for tipo, antes in vistos.items():
        act = ahora_por.get(tipo)
        previo = antes.get("lleva_s") if isinstance(antes, dict) else None
        if not isinstance(previo, (int, float)):
            continue
        if act is None or act["lleva_s"] < previo - 5:
            if previo >= 20:
                durs.setdefault(tipo, []).append(int(previo))
                durs[tipo] = durs[tipo][-8:]
    nuevos = {t: {"lleva_s": p["lleva_s"], "t": a_iso(ahora)} for t, p in ahora_por.items()}
    return {"formato": 1, "vistos": nuevos, "duraciones": durs}


# ── el mundo (disco, reloj, procesos): las pruebas lo sustituyen ─────────────────────────────────────────────────

def carpeta():
    return os.environ.get("STARSEED_PRODUCCION_DIR") or os.path.expanduser("~/.starseed/produccion")


class Mundo(object):
    def __init__(self, dir_estado=None, cerrojos=None):
        self.dir = dir_estado or carpeta()
        self.cerrojos = cerrojos or os.environ.get("STARSEED_CERROJOS_DIR") or os.path.expanduser("~/.starseed/cerrojos")

    def ahora(self):
        return time.time()

    def ruta(self, nombre):
        return os.path.join(self.dir, nombre)

    def leer_json(self, nombre):
        try:
            with open(self.ruta(nombre), encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError):
            return None

    def escribir_json(self, nombre, datos):
        os.makedirs(self.dir, exist_ok=True)
        ruta = self.ruta(nombre)
        tmp = "%s.tmp-%d" % (ruta, os.getpid())
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False, indent=2)
            f.write("\n")
        os.replace(tmp, ruta)

    def carga(self):
        try:
            return tuple(os.getloadavg())
        except (OSError, AttributeError):
            return None

    def nucleos(self):
        return os.cpu_count()

    def presion(self):
        if sys.platform != "darwin":
            return None
        try:
            r = subprocess.run(["sysctl", "-n", "kern.memorystatus_vm_pressure_level"], capture_output=True, text=True, timeout=5)
            return int(r.stdout.strip()) if r.returncode == 0 else None
        except Exception:  # noqa: BLE001
            return None

    def procesos(self):
        """[(pid, lleva_s, orden)] de la tabla de procesos; [] si no se pudo leer (y entonces no se afirma nada)."""
        try:
            r = subprocess.run(["ps", "-axo", "pid=,etime=,args="], capture_output=True, text=True, timeout=15)
        except Exception:  # noqa: BLE001
            return []
        fuera = []
        for linea in r.stdout.splitlines():
            m = re.match(r"^\s*(\d+)\s+(\S+)\s+(.*)$", linea)
            if m:
                fuera.append((int(m.group(1)), etime_a_s(m.group(2)), m.group(3)))
        return fuera

    def dueno_pesado(self):
        """(vivo, epoch) del dueño del cerrojo de lo pesado, o None si nadie lo tiene."""
        try:
            with open(os.path.join(self.cerrojos, "pesado.lock", "dueno"), encoding="utf-8") as f:
                pid, epoch = f.read().split()[:2]
            pid, epoch = int(pid), int(epoch)
        except (OSError, ValueError):
            return None
        try:
            os.kill(pid, 0)
            vivo = True
        except PermissionError:
            vivo = True
        except OSError:
            vivo = False
        return (vivo, epoch)


def carga_maxima(nucleos):
    try:
        return float(os.environ["STARSEED_RONDA_CARGA_MAX"])
    except (KeyError, ValueError):
        return max(2.0, 0.5 * (nucleos or 4))


def leer(mundo=None):
    mundo = mundo or Mundo()
    return normalizar(mundo.leer_json(ARCHIVO))


def silencio_ahora(mundo, duraciones=None):
    """Mide ahora (sin escribir nada) → (silencio, pesados crudos)."""
    ahora = mundo.ahora()
    pesados = pesados_de_procesos(mundo.procesos())
    nuc = mundo.nucleos()
    dur = (duraciones if duraciones is not None else (mundo.leer_json(DURACIONES) or {})).get("duraciones") or {}
    return juzgar(pesados, mundo.dueno_pesado(), mundo.carga(), nuc, mundo.presion(), carga_maxima(nuc), dur, ahora), pesados


def pasada(mundo=None):
    """Una pasada del director: caduca lo vencido, mide el silencio, aprende duraciones y escribe el archivo. → archivo."""
    mundo = mundo or Mundo()
    ahora = mundo.ahora()
    datos, _ = caducar(mundo.leer_json(ARCHIVO), ahora)
    if datos["ronda"] and not datos["ronda"].get("fin"):
        datos["ronda"]["activa"] = vista(datos, ahora)["activa"]
    dur = mundo.leer_json(DURACIONES)
    sil, pesados = silencio_ahora(mundo, dur if isinstance(dur, dict) else {})
    try:
        mundo.escribir_json(DURACIONES, anotar_duraciones(dur, pesados, ahora))
    except OSError:
        pass
    datos["t"], datos["cada_s"], datos["silencio"] = a_iso(ahora), CADA_S, sil
    mundo.escribir_json(ARCHIVO, datos)
    return datos


def aplicar(mundo, accion, quien, motivo, minutos, peticion=None):
    """Lo que hace el director con una petición `ronda-iniciar` / `ronda-terminar`. Escribe y devuelve (estado, texto)."""
    ahora = mundo.ahora()
    datos, _ = caducar(mundo.leer_json(ARCHIVO), ahora)
    if accion == "ronda-iniciar":
        datos, estado, texto = iniciar(datos, quien, motivo, minutos, ahora, peticion)
    else:
        datos, estado, texto = terminar(datos, quien, ahora)
    if datos["ronda"] and not datos["ronda"].get("fin"):
        datos["ronda"]["activa"] = vista(datos, ahora)["activa"]
    datos["t"] = a_iso(ahora)
    mundo.escribir_json(ARCHIVO, datos)
    return estado, texto


# ── la puerta de admisión ────────────────────────────────────────────────────────────────────────────────────────

def activa(mundo=None):
    """(hay_ronda, una línea). Nunca lanza: lo que no se puede leer es «sin ronda»."""
    try:
        mundo = mundo or Mundo()
        v = vista(normalizar(mundo.leer_json(ARCHIVO)), mundo.ahora())
        return (True, linea_activa(v)) if v["activa"] else (False, "sin ronda de aparatos: se puede empezar")
    except Exception as e:  # noqa: BLE001 — fallar abierto
        return False, "sin ronda (no pude leer su estado: %s)" % type(e).__name__


def esperar(nombre="un trabajo pesado", mundo=None, avisar=None, dormir=time.sleep, sondeo_s=None, aviso_s=None):
    """Se queda mientras haya ronda. → segundos que esperó (0 si no había). El llamante empieza sus plazos DESPUÉS."""
    mundo = mundo or Mundo()
    sondeo_s = SONDEO_S if sondeo_s is None else sondeo_s
    aviso_s = AVISO_S if aviso_s is None else aviso_s
    t0 = mundo.ahora()
    ultimo = t0
    primera = True
    while True:
        hay, linea = activa(mundo)
        if not hay:
            return max(0, mundo.ahora() - t0)
        ahora = mundo.ahora()
        if avisar and (primera or ahora - ultimo >= aviso_s):
            ultimo = ahora
            try:
                avisar("%s espera: %s" % (nombre, linea), int(ahora - t0))
            except Exception:  # noqa: BLE001
                pass
        primera = False
        dormir(sondeo_s)


# ── línea de órdenes ─────────────────────────────────────────────────────────────────────────────────────────────

def texto_estado(datos, sil, ahora):
    v = vista(datos, ahora)
    if v["activa"]:
        r = v["ronda"]
        cab = "Ronda de aparatos: activa, pedida por %s (%s). Termina a las %s, quedan %s%s." % (
            r.get("quien"), r.get("motivo"), hora_local(v["hasta"]), minutos_texto(v["quedan_s"]),
            ", renovada %d vez/veces" % r["renovaciones"] if r.get("renovaciones") else "")
        return cab + "\nRonda pedida: " + sil["linea"]
    r = v["ronda"]
    if r and r.get("fin"):
        cab = "Ronda de aparatos: sin ronda activa (la última terminó a las %s, %s)." % (hora_local(de_iso(r["fin"])), r.get("fin_por") or "?")
    else:
        cab = "Ronda de aparatos: sin ronda activa."
    return cab + "\nMac: " + sil["linea"]


def main(argv=None):
    import argparse
    ap = argparse.ArgumentParser(description="Ronda de aparatos: puerta de admisión de los trabajos pesados")
    sub = ap.add_subparsers(dest="orden", required=True)
    sub.add_parser("activa", help="código 0 = hay ronda (espera); 1 = no hay (adelante)")
    e = sub.add_parser("esperar", help="se queda mientras haya ronda")
    e.add_argument("--nombre", default="un trabajo pesado")
    s = sub.add_parser("estado")
    s.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)
    mundo = Mundo()
    if a.orden == "activa":
        hay, linea = activa(mundo)
        print(linea)
        return 0 if hay else 1
    if a.orden == "esperar":
        espera = esperar(a.nombre, mundo, avisar=lambda t, seg: print(t, flush=True))
        print("sin ronda: sigo%s" % ((" (esperé %s)" % minutos_texto(espera)) if espera else ""))
        return 0
    datos = leer(mundo)
    sil, _ = silencio_ahora(mundo)
    if a.json:
        print(json.dumps({"ronda": vista(datos, mundo.ahora()), "silencio": sil}, ensure_ascii=False, indent=2, default=str))
    else:
        print(texto_estado(datos, sil, mundo.ahora()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
