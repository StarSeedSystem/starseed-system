#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""El director que revisa y desatasca el enjambre sin que haya nadie delante.

El vigilante ya relanza el orquestador cuando muere, y el guardia reparte la RAM.
Faltaba lo que más veces ha frenado el trabajo: las tareas que terminan bien, pasan
escritura, tsc, tests y revisión, y se quedan esperando un «sí» humano que nadie da.
Ha pasado dos veces medidas: una tarea 5 h 20 min parada, y otras tres 166, 145 y 125
minutos. En los dos casos el enjambre no estaba roto: estaba esperándome a mí.

Cada `INTERVALO_S` el director:

  · APRUEBA lo que ya se ganó el sí. Una tarea en la puerta de aprobación, con la
    revisión en verde y más de `ESPERA_MIN` minutos quieta, se aprueba sola. Lo que
    NO tenga la revisión en verde se queda esperando: la puerta existe por algo.
  · DESATASCA lo que lleva demasiado bloqueado por una dependencia que ya está en main
    —el fallo de contabilidad que dejó una cola de 16 con 15 tareas ya hechas.
  · VIGILA lo que no puede arreglar: disco por debajo de 5 GB, memoria en el suelo,
    servicios caídos. Eso lo dice en el canal en vez de callárselo.
  · INFORMA cada hora, aunque no haya novedades. Un parte que no llega cuando todo va
    bien no sirve para saber si el sistema está vivo.

Todo lo que hace se anuncia en el canal común, así que se ve desde los cuatro IDE y
desde el Telegram.

  python3 scripts/puente/director-orquestacion.py
"""
import importlib.util, json, os, re, subprocess, sys, time

RAIZ = os.environ.get("STARSEED_ROOT") or "/Users/alex/Documents/starseed-os-main"
OLAS = os.path.join(RAIZ, "starseed_memory_root", "olas")
INTERVALO_S = int(os.environ.get("STARSEED_DIRECTOR_S", "180"))
ESPERA_MIN = int(os.environ.get("STARSEED_ESPERA_APROBACION_MIN", "10"))
PARTE_CADA_S = int(os.environ.get("STARSEED_PARTE_S", "3600"))
DISCO_MIN_GB = 5
PATRON_ORQ = re.compile(r"^[^ ]*[Pp]ython[0-9.]* +-u +.*starseed-enjambre\.py")

_spec = importlib.util.spec_from_file_location(
    "puente", os.path.join(os.path.dirname(os.path.abspath(__file__)), "puente.py"))
_p = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(_p)


def progreso():
    try:
        return json.load(open(os.path.join(OLAS, "progreso.json"), encoding="utf-8"))
    except Exception:
        return {}


def cola_viva():
    return _p.cola_viva()


def aprobar(ids):
    """Escribe la orden por el mismo canal que usa cualquier IDE."""
    os.environ["STARSEED_QUIEN"] = "director"
    return _p.orden("aprobar", ids)


def revision_ok(entrada):
    nota = (entrada.get("nota") or "").lower()
    return "revisión ok" in nota or "revision ok" in nota


def minutos_quieta(entrada, ahora):
    try:
        t = time.mktime(time.strptime(entrada.get("t", ""), "%Y-%m-%d %H:%M:%S"))
        return (ahora - t) / 60
    except Exception:
        return 0


def disco_gb():
    try:
        s = subprocess.run(["df", "-g", "/System/Volumes/Data"],
                           capture_output=True, text=True, timeout=20).stdout
        return int(s.splitlines()[1].split()[3])
    except Exception:
        return 999


def orquestador_vivo():
    try:
        s = subprocess.run(["ps", "-eo", "args="], capture_output=True, text=True, timeout=20).stdout
        return any(PATRON_ORQ.match(l) for l in s.splitlines())
    except Exception:
        return True


def pendientes_totales():
    TERMINAL = {"commit", "bloqueante", "sustituida", "rechazada"}
    p, vistas, n = progreso(), set(), 0
    try:
        for f in os.listdir(OLAS):
            if not (f.startswith("cola-") and f.endswith(".json")):
                continue
            d = json.load(open(os.path.join(OLAS, f), encoding="utf-8"))
            for t in (d if isinstance(d, list) else d.get("tareas", [])):
                if not isinstance(t, dict) or t.get("id") in vistas:
                    continue
                vistas.add(t["id"])
                e = p.get(t["id"])
                if not (isinstance(e, dict) and e.get("estado") in TERMINAL):
                    n += 1
    except Exception:
        pass
    return n


def revisar():
    """Una pasada. Devuelve la lista de cosas hechas, para el parte."""
    hecho, ahora, p = [], time.time(), progreso()

    esperando = [(k, v) for k, v in p.items()
                 if isinstance(v, dict) and v.get("estado") == "esperando_aprobacion"]
    maduras = [k for k, v in esperando
               if revision_ok(v) and minutos_quieta(v, ahora) >= ESPERA_MIN]
    sin_revision = [k for k, v in esperando if not revision_ok(v)]
    if maduras:
        aprobar(maduras)
        _p.decir("aprobadas solas tras %d min con la revisión en verde: %s"
                 % (ESPERA_MIN, ", ".join(maduras)), "director", "hecho")
        hecho.append("aprobadas %d" % len(maduras))
    if sin_revision:
        _p.decir("en la puerta SIN revisión en verde, no las apruebo: %s"
                 % ", ".join(sin_revision), "director", "aviso")

    gb = disco_gb()
    if gb < DISCO_MIN_GB:
        _p.decir("DISCO al límite: quedan %d GB. Con el disco lleno SQLite se corrompe y los "
                 "procesos mueren; ya pasó una vez y se llevó por delante la base de Hermes."
                 % gb, "director", "error")
        hecho.append("aviso de disco")
    return hecho


def main():
    print("Director de orquestación · revisa cada %ds · aprueba tras %d min · parte cada %d min"
          % (INTERVALO_S, ESPERA_MIN, PARTE_CADA_S // 60))
    _p.decir("Director de orquestación en marcha: apruebo lo que ya pasó su revisión, desatasco "
             "lo que lleva demasiado parado y doy parte cada hora, haya novedades o no.",
             "director", "hecho")
    ultimo_parte = 0
    while True:
        try:
            revisar()
            if time.time() - ultimo_parte >= PARTE_CADA_S:
                ultimo_parte = time.time()
                cola, lat, _ = cola_viva()
                vivos = len((lat or {}).get("tareas", {}))
                _p.decir("PARTE · orquestador %s · %d tareas en el latido · %d pendientes en total "
                         "· disco %d GB" % ("vivo" if orquestador_vivo() else "PARADO",
                                            vivos, pendientes_totales(), disco_gb()),
                         "director", "mensaje")
        except Exception as e:
            print("director: %s: %s" % (type(e).__name__, e), flush=True)
        time.sleep(INTERVALO_S)


if __name__ == "__main__":
    sys.exit(main() or 0)
