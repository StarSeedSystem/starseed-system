#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Hace convivir al motor local de Astraura con el enjambre, en una Mac de 8 GB.

El problema, medido: `llama-server` de BitNet ocupa ~800 MB y no los suelta nunca.
Con el enjambre trabajando, la máquina se queda por debajo del umbral de 1400 MB y
los agentes se pasan la vida esperando: 38 avisos de «esperando memoria» en una sola
corrida. Y apagarlo a mano no es respuesta: cuando el enjambre para, Astraura
debería tener su motor otra vez.

Así que no se elige. Se turnan:

  · Si el orquestador está vivo Y queda poca memoria → SIGSTOP a BitNet. Congelado,
    no muerto: no pierde el modelo cargado ni su estado, y el sistema puede llevarse
    sus páginas a disco. Vuelve entero con SIGCONT.
  · Si el orquestador para y hay holgura → SIGCONT. Astraura recupera su motor sola.

Un proceso congelado por nosotros se anota, para no reanudar jamás uno que el dueño
hubiera parado él mismo.

  python3 scripts/puente/guardia-memoria.py
"""
import importlib.util, os, re, signal, subprocess, sys, time

RAIZ = os.environ.get("STARSEED_ROOT") or "/Users/alex/Documents/starseed-os-main"
INTERVALO_S = int(os.environ.get("STARSEED_GUARDIA_S", "45"))
# El umbral del orquestador es 1400 MB. Congelamos por debajo de eso con margen,
# y solo devolvemos el motor cuando hay holgura de verdad, para no ir y venir.
CONGELAR_BAJO_MB = int(os.environ.get("STARSEED_CONGELAR_MB", "1600"))
REANUDAR_SOBRE_MB = int(os.environ.get("STARSEED_REANUDAR_MB", "2600"))
MARCA = "/tmp/starseed-bitnet-congelado-por-el-guardia"
# Se compara el EJECUTABLE (`comm`), no la linea de ordenes. Un patron sobre los
# argumentos detecta como motor el propio shell que lo busca, porque su orden menciona
# el nombre — esa trampa ya nos hizo matar nuestro shell, contar orquestadores fantasma
# y creer que habia un puente de Telegram encendido cuando no habia ninguno. Y aqui
# ademas el binario vive en una ruta CON ESPACIOS, que rompe cualquier patron por campos.
NOMBRE_MOTOR = "llama-server"
PATRON_ORQ = re.compile(r"^[^ ]*[Pp]ython[0-9.]* +-u +.*starseed-enjambre\.py")

_spec = importlib.util.spec_from_file_location(
    "puente", os.path.join(os.path.dirname(os.path.abspath(__file__)), "puente.py"))
_p = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(_p)


def libres_mb():
    """Memoria realmente disponible: libre + inactiva (el sistema la reclama sola)."""
    try:
        s = subprocess.run(["vm_stat"], capture_output=True, text=True, timeout=20).stdout
        pagina = int(re.search(r"page size of (\d+)", s).group(1))
        def n(clave):
            m = re.search(clave + r":\s+(\d+)", s)
            return int(m.group(1)) * pagina if m else 0
        return (n("Pages free") + n("Pages inactive")) // (1024 * 1024)
    except Exception:
        return 99999          # ante la duda, no tocar nada


def procesos():
    motor, orq = None, False
    try:
        # `comm` es la ruta del ejecutable, sin argumentos: inmune al texto de un prompt.
        s = subprocess.run(["ps", "-eo", "pid=,state=,comm="], capture_output=True,
                           text=True, timeout=20).stdout
    except Exception:
        return None, False
    for l in s.splitlines():
        partes = l.split(None, 2)
        if len(partes) < 3:
            continue
        pid, estado, ejecutable = partes
        if os.path.basename(ejecutable.strip()) == NOMBRE_MOTOR:
            motor = (int(pid), estado)
    try:
        a = subprocess.run(["ps", "-eo", "args="], capture_output=True,
                           text=True, timeout=20).stdout
        orq = any(PATRON_ORQ.match(l) for l in a.splitlines())
    except Exception:
        orq = True            # ante la duda, no reanudar nada
    return motor, orq


def main():
    print("Guardia de memoria · congela bajo %d MB con el enjambre vivo, "
          "reanuda sobre %d MB" % (CONGELAR_BAJO_MB, REANUDAR_SOBRE_MB))
    _p.decir("Guardia de memoria en marcha: BitNet y el enjambre se turnan en vez de "
             "pelearse por la RAM.", "guardia", "hecho")
    while True:
        try:
            motor, orq = procesos()
            if motor:
                pid, estado = motor
                congelado = "T" in estado
                libres = libres_mb()
                nuestro = os.path.exists(MARCA)
                if orq and not congelado and libres < CONGELAR_BAJO_MB:
                    os.kill(pid, signal.SIGSTOP)
                    open(MARCA, "w").write(str(pid))
                    _p.decir("BitNet congelado (pid %d): %d MB libres con el enjambre "
                             "trabajando. Vuelve solo cuando pare." % (pid, libres),
                             "guardia", "aviso")
                elif congelado and nuestro and (not orq) and libres > REANUDAR_SOBRE_MB:
                    os.kill(pid, signal.SIGCONT)
                    try: os.remove(MARCA)
                    except Exception: pass
                    _p.decir("BitNet reanudado (pid %d): el enjambre paró y hay %d MB "
                             "libres. Astraura recupera su motor local." % (pid, libres),
                             "guardia", "hecho")
        except Exception as e:
            print("guardia: %s: %s" % (type(e).__name__, e), flush=True)
        time.sleep(INTERVALO_S)


if __name__ == "__main__":
    sys.exit(main() or 0)
