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
#: Con el enjambre parado, un motor congelado no espera la holgura para siempre.
ESPERA_MAX_S = int(os.environ.get("STARSEED_GUARDIA_ESPERA_S", "600"))
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
        # None, no un número gordo. Un centinela alto solo es prudente en UN sentido: no
        # congela, pero cumple `libres > REANUDAR_SOBRE_MB` y por tanto REANUDABA el motor
        # cuando `vm_stat` fallaba. «Ante la duda, no tocar nada» tiene que valer en los dos
        # sentidos, y un solo número no puede hacerlo. (2026-09-12)
        return None


def procesos():
    """(motores, orquestador_vivo). `motores` es una LISTA de (pid, estado).

    Antes esta funcion devolvia UN motor y se quedaba con el ultimo de la lista de `ps`.
    El 2026-09-20 la Mac tenia CINCO `llama-server`: uno sirviendo en el 8790 y otros
    cuatro que el renovador habia lanzado, que no pudieron enlazar el puerto porque el
    primero seguia ahi, y que el guardia congelo antes de que terminaran de salir. El
    guardia vigilaba al ultimo, que no era el del puerto, asi que el motor real se quedo
    congelado CUATRO HORAS y `verificar-neurona` decia «bitnet apagado» sin que nadie
    supiera por que. Con la lista entera se congela y se reanuda a todos los que este
    guardia marco, y los que sobran salen solos en cuanto se les reanuda.
    """
    motores, orq = [], False
    try:
        # `comm` es la ruta del ejecutable, sin argumentos: inmune al texto de un prompt.
        s = subprocess.run(["ps", "-eo", "pid=,state=,comm="], capture_output=True,
                           text=True, timeout=20).stdout
    except Exception:
        return [], False
    for l in s.splitlines():
        partes = l.split(None, 2)
        if len(partes) < 3:
            continue
        pid, estado, ejecutable = partes
        if os.path.basename(ejecutable.strip()) == NOMBRE_MOTOR:
            motores.append((int(pid), estado))
    try:
        a = subprocess.run(["ps", "-eo", "args="], capture_output=True,
                           text=True, timeout=20).stdout
        orq = any(PATRON_ORQ.match(l) for l in a.splitlines())
    except Exception:
        orq = True            # ante la duda, no reanudar nada
    return motores, orq


def pids_marcados():
    """Los pids que ESTE guardia congelo. Un pid por linea; conjunto vacio si no hay.

    La marca guarda IDENTIDAD, no un si/no: con `os.path.exists` bastaba que el archivo
    existiera para creer «este lo congelamos nosotros», y el pid cambia (BitNet se
    reinicia). Con esa marca sobrante, un motor que el dueno hubiera parado el mismo se
    reanudaba solo — justo lo que la cabecera promete que no pasa jamas. (2026-09-12)
    Desde el 2026-09-20 son VARIOS pids: puede haber mas de un motor a la vez.
    """
    try:
        crudo = open(MARCA, encoding="utf-8").read().split()
    except Exception:
        return set()
    marcados = set()
    for trozo in crudo:
        try:
            marcados.add(int(trozo))
        except ValueError:
            continue
    return marcados


def guardar_marcados(pids):
    if not pids:
        try:
            os.remove(MARCA)
        except Exception:
            pass
        return
    with open(MARCA, "w", encoding="utf-8") as f:
        f.write("\n".join(str(p) for p in sorted(pids)))


def decidir(motores, orq, libres, marcados, congelados_desde, ahora, espera_s=600):
    """Que hacer, sin tocar nada: (a_congelar, a_reanudar). Funcion pura y probada.

    Reglas, en este orden:
      · Sin medida de memoria (`libres is None`) no se congela NI se reanuda. Un centinela
        alto solo era prudente en un sentido: no congelaba, pero cumplia el umbral de
        reanudar y devolvia el motor cuando `vm_stat` fallaba. (2026-09-12)
      · Con el enjambre vivo y poca memoria, se congela todo motor suelto.
      · Con el enjambre PARADO se reanuda lo que congelamos nosotros: en cuanto hay
        holgura, o pasada `espera_s` aunque la holgura no llegue. Esa segunda salida es
        nueva (2026-09-20): la primera vez que la Mac se quedo en 2.148 MB libres con el
        enjambre parado, el umbral de 2.600 no se alcanzaba nunca y BitNet se quedo
        congelado cuatro horas. Un proceso congelado no reserva nada al volver: sus
        paginas ya estan en disco y el sistema se las devuelve segun las pida.
      · Nunca se reanuda un motor que no figure en la marca: si lo paro su dueno, se queda
        parado.
    """
    if libres is None:
        return [], []
    a_congelar, a_reanudar = [], []
    for pid, estado in motores:
        congelado = "T" in estado
        if orq and not congelado and libres < CONGELAR_BAJO_MB:
            a_congelar.append(pid)
        elif congelado and pid in marcados and not orq:
            desde = congelados_desde.get(pid)
            harto = desde is not None and (ahora - desde) >= espera_s
            if libres > REANUDAR_SOBRE_MB or harto:
                a_reanudar.append(pid)
    return a_congelar, a_reanudar


def main():
    print("Guardia de memoria · congela bajo %d MB con el enjambre vivo, "
          "reanuda sobre %d MB (o a los %d min si el enjambre paro)"
          % (CONGELAR_BAJO_MB, REANUDAR_SOBRE_MB, ESPERA_MAX_S // 60))
    _p.decir("Guardia de memoria en marcha: BitNet y el enjambre se turnan en vez de "
             "pelearse por la RAM.", "guardia", "hecho")
    congelados_desde = {}
    while True:
        try:
            motores, orq = procesos()
            vivos = {pid for pid, _ in motores}
            marcados = pids_marcados()
            # Un pid marcado que ya no existe es basura: BitNet se reinicia solo y la
            # marca vieja autorizaria a reanudar al siguiente que alguien pare a mano.
            if marcados - vivos:
                marcados &= vivos
                guardar_marcados(marcados)
            for pid in list(congelados_desde):
                if pid not in vivos:
                    congelados_desde.pop(pid, None)

            libres = libres_mb()
            ahora = time.time()
            a_congelar, a_reanudar = decidir(
                motores, orq, libres, marcados, congelados_desde, ahora, ESPERA_MAX_S)

            for pid in a_congelar:
                # La marca se escribe ANTES de la senal: si el guardia muere entre las dos,
                # lo peor que queda es una marca sobrante (que no casara ningun pid), no un
                # motor congelado que nadie volvera a reanudar nunca.
                marcados.add(pid)
                guardar_marcados(marcados)
                try:
                    os.kill(pid, signal.SIGSTOP)
                except Exception:
                    marcados.discard(pid)
                    guardar_marcados(marcados)
                    continue
                congelados_desde[pid] = ahora
                _p.decir("BitNet congelado (pid %d): %d MB libres con el enjambre "
                         "trabajando. Vuelve solo cuando pare." % (pid, libres),
                         "guardia", "aviso")

            for pid in a_reanudar:
                try:
                    os.kill(pid, signal.SIGCONT)
                except Exception:
                    pass
                marcados.discard(pid)
                guardar_marcados(marcados)
                congelados_desde.pop(pid, None)
                _p.decir("BitNet reanudado (pid %d): el enjambre paro y hay %d MB "
                         "libres. Astraura recupera su motor local." % (pid, libres),
                         "guardia", "hecho")
        except Exception as e:
            print("guardia: %s: %s" % (type(e).__name__, e), flush=True)
        time.sleep(INTERVALO_S)


if __name__ == "__main__":
    sys.exit(main() or 0)
