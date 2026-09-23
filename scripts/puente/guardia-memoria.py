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
MARCA = "/tmp/starseed-%s-congelado-por-el-guardia"  # un marcador por motor
# Se compara el EJECUTABLE (`comm`), no la linea de ordenes. Un patron sobre los
# argumentos detecta como motor el propio shell que lo busca, porque su orden menciona
# el nombre — esa trampa ya nos hizo matar nuestro shell, contar orquestadores fantasma
# y creer que habia un puente de Telegram encendido cuando no habia ninguno. Y aqui
# ademas el binario vive en una ruta CON ESPACIOS, que rompe cualquier patron por campos.
# Motores pesados vigilados: BitNet (~800 MB) y la voz (`tts-server`, ~900 MB); el
# 2026-09-12 la Mac hizo kernel panic con voz + BitNet + build + enjambre a la vez.
MOTORES = ["llama-server", "tts-server"]
PATRON_ORQ = re.compile(r"^[^ ]*[Pp]ython[0-9.]* +-u +.*starseed-enjambre\.py")

_spec = importlib.util.spec_from_file_location(
    "puente", os.path.join(os.path.dirname(os.path.abspath(__file__)), "puente.py")
)
_p = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_p)

# (2026-09-22) La conversación con Astraura manda: ver prioridad_conversacion.py. Mientras
# dura, este guardia NO congela la voz ni BitNet (los reanuda si estaban congelados) y es el
# enjambre el que cede la RAM. Congelarlos en plena conversación era lo que partía la voz y
# dejaba a BitNet dos días parado reteniendo su puerto.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import prioridad_conversacion as _conv  # noqa: E402
import agentes_huerfanos as _huerf  # noqa: E402


def barrer_trabajadores_huerfanos():
    """(2026-09-23) Mata los `node (vitest N)` adoptados por init: su vitest ya murió y
    nadie leerá sus resultados, pero cada uno retiene ~2,2 GB. Cinco de ellos dejaron la
    Mac sin RAM y el Puente de Mando sin contestar. Devuelve los pids cortados."""
    try:
        s = subprocess.run(
            ["ps", "-eo", "pid=,ppid=,args="], capture_output=True, text=True, timeout=20
        ).stdout
    except Exception:
        return []
    filas = []
    for l in s.splitlines():
        partes = l.split(None, 2)
        if len(partes) == 3:
            filas.append(tuple(partes))
    cortados = []
    for pid in _huerf.trabajadores_huerfanos(filas):
        try:
            os.kill(pid, signal.SIGKILL)
            cortados.append(pid)
        except Exception:
            pass
    return cortados


def libres_mb():
    """Memoria realmente disponible: libre + inactiva (el sistema la reclama sola)."""
    try:
        s = subprocess.run(
            ["vm_stat"], capture_output=True, text=True, timeout=20
        ).stdout
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
    """({motor: {pid: estado}}, orquestador_vivo, ps_ok), solo de los motores vigilados.

    Antes habia UN solo motor y se miraba el ultimo de la lista de `ps`. El 2026-09-20
    la Mac tenia CINCO `llama-server` y el guardia vigilaba uno que no servia el puerto;
    el motor real quedo congelado cuatro horas. Ahora se guarda por nombre y por pid.
    """
    motores, orq, ps_ok = {m: {} for m in MOTORES}, True, False
    try:
        # `comm` es la ruta del ejecutable, sin argumentos: inmune al texto de un prompt.
        s = subprocess.run(
            ["ps", "-eo", "pid=,state=,comm="],
            capture_output=True,
            text=True,
            timeout=20,
        ).stdout
        ps_ok = True
    except Exception:
        return motores, True, False
    for l in s.splitlines():
        partes = l.split(None, 2)
        if len(partes) < 3:
            continue
        pid, estado, ejecutable = partes
        nombre = os.path.basename(ejecutable.strip())
        if nombre in motores:
            motores[nombre][int(pid)] = estado
    try:
        a = subprocess.run(
            ["ps", "-eo", "args="], capture_output=True, text=True, timeout=20
        ).stdout
        orq = any(PATRON_ORQ.match(l) for l in a.splitlines())
    except Exception:
        orq = True  # ante la duda, no reanudar nada
    return motores, orq, ps_ok


def ruta_marca(motor):
    return MARCA % motor


def leer_marca(motor):
    """Los pids de ESTE motor que congelo este guardia; conjunto vacio si no consta."""
    try:
        crudo = open(ruta_marca(motor), encoding="utf-8").read().split()
    except Exception:
        return set()
    return {int(t) for t in crudo if t.isdigit()}


def guardar_marca(motor, pids):
    if not pids:
        try:
            os.remove(ruta_marca(motor))
        except Exception:
            pass
        return
    with open(ruta_marca(motor), "w", encoding="utf-8") as f:
        f.write("\n".join(str(p) for p in sorted(pids)))


def obtener_congelados(
    motores_dict, leer_marca_fn=leer_marca, guardar_marca_fn=guardar_marca
):
    """Devuelve los motores con al menos un PID en estado «T» en la marca.

    Un marcador solo vale si su pid sigue vivo Y parado («T»). Si el motor
    murió congelado y arrancó de nuevo, o su dueño lo reanudó a mano, el
    marcador es basura: dejarlo dejaría al motor nuevo marcado como
    «congelado» sin estarlo, no se le mandaría SIGCONT por no estar en «T»,
    y jamás volvería a congelarse. Se borra aquí, en cada ciclo.
    """
    congelados = set()
    for motor in MOTORES:
        marcados = leer_marca_fn(motor)
        if not marcados:
            continue
        parados = {p for p in marcados if "T" in motores_dict.get(motor, {}).get(p, "")}
        if parados:
            congelados.add(motor)
            if parados != marcados:
                guardar_marca_fn(motor, parados)
        else:
            guardar_marca_fn(motor, set())
    return congelados


def decidir(orquestador_vivo, libre_mb, congelados, motores, conversando=False):
    """Que hacer, pura: lista de (motor, 'congelar'|'descongelar').

    `congelados` son los motores que el guardia tiene marcados Y verificados como
    parados (estado «T») en este ciclo — nunca solo porque quede un archivo en /tmp.

    Reglas:
      · Sin medida de memoria (`libre_mb is None`) no se toca nada, en ningun sentido.
      · Enjambre vivo y menos de CONGELAR_BAJO_MB libres: se congela todo motor suelto.
      · Sin enjambre y mas de REANUDAR_SOBRE_MB libres: se reanuda lo congelado por
        nosotros. Entre ambos umbrales no se hace nada (histeresis): sin esa banda el
        motor iria y volveria en cada ciclo.
      · Un motor marcado cuyo proceso ya no esta parado («T») NO es `congelado`: no se
        le manda SIGCONT a un proceso vivo y el marcador se borra fuera, asi un motor
        nuevo con el mismo nombre vuelve a poder congelarse. Ver `main`.
    """
    acciones = []
    if conversando:
        # Con Alex hablando, los motores de la conversación no se tocan salvo para
        # devolverles la vida. Da igual cuánta memoria quede: la cede el enjambre.
        return [(m, "descongelar") for m in motores if m in congelados]
    if libre_mb is None:
        return acciones
    for motor in motores:  # orden estable = el de la lista viva
        if motor not in congelados:
            if orquestador_vivo and libre_mb < CONGELAR_BAJO_MB:
                acciones.append((motor, "congelar"))
        elif not orquestador_vivo and libre_mb > REANUDAR_SOBRE_MB:
            acciones.append((motor, "descongelar"))
    return acciones


def main():
    print(
        "Guardia de memoria · vigilados: %s · congela bajo %d MB con el enjambre "
        "vivo, reanuda sobre %d MB"
        % (", ".join(MOTORES), CONGELAR_BAJO_MB, REANUDAR_SOBRE_MB)
    )
    _p.decir(
        "Guardia de memoria en marcha: los motores locales (%s) y el enjambre se "
        "turnan en vez de pelearse por la RAM." % ", ".join(MOTORES),
        "guardia",
        "hecho",
    )
    while True:
        try:
            cortados = barrer_trabajadores_huerfanos()
            if cortados:
                print("huérfanos de vitest cortados: %s" % cortados, flush=True)
                _p.decir(
                    "Cortados %d trabajadores de pruebas huérfanos (su vitest ya había muerto; "
                    "retenían ~2 GB cada uno)." % len(cortados),
                    "guardia",
                    "aviso",
                )
        except Exception as e:
            print("guardia huérfanos: %s: %s" % (type(e).__name__, e), flush=True)
        try:
            motores, orq, ps_ok = procesos()
            vivos = [m for m in MOTORES if motores[m]]

            congelados = obtener_congelados(motores) if ps_ok else set()

            conversando = _conv.activa(_conv.leer_concesion())
            acciones = decidir(orq, libres_mb(), congelados, vivos, conversando)
            # El enjambre cede la RAM mientras dura la conversación y vuelve al acabar.
            if conversando or _conv.leer_marca():
                print("conversación: %s" % _conv.aplicar(), flush=True)

            for motor, accion in acciones:
                if accion == "congelar":
                    # La marca se escribe ANTES de la senal: si el guardia muere entre
                    # las dos, lo peor que queda es una marca sobrante (que la limpieza
                    # de arriba borra), no un motor congelado que nadie reanudara.
                    sueltos = {p for p, e in motores[motor].items() if "T" not in e}
                    hechos = set()
                    for pid in sueltos:
                        guardar_marca(motor, leer_marca(motor) | {pid})
                        try:
                            os.kill(pid, signal.SIGSTOP)
                        except Exception:
                            marcados = leer_marca(motor)
                            marcados.discard(pid)
                            guardar_marca(motor, marcados)
                            continue
                        hechos.add(pid)
                    if hechos:
                        _p.decir(
                            "%s congelado (pids %s) con el enjambre trabajando. "
                            "Vuelve solo cuando pare y haya holgura."
                            % (motor, ", ".join(map(str, sorted(hechos)))),
                            "guardia",
                            "aviso",
                        )
                else:
                    for pid in leer_marca(motor):
                        try:
                            os.kill(pid, signal.SIGCONT)
                        except Exception:
                            pass
                    guardar_marca(motor, set())
                    _p.decir(
                        "%s reanudado: el enjambre paro y hay memoria de sobra."
                        % motor,
                        "guardia",
                        "hecho",
                    )
        except Exception as e:
            print("guardia: %s: %s" % (type(e).__name__, e), flush=True)
        # Se duerme a tramos de 5 s: si una conversación empieza o acaba, se reacciona ya
        # y no a los 45 s (la voz también avisa al empezar, pero esto es la red de abajo).
        antes = _conv.activa(_conv.leer_concesion())
        for _ in range(max(1, INTERVALO_S // 5)):
            time.sleep(5)
            if _conv.activa(_conv.leer_concesion()) != antes:
                break


if __name__ == "__main__":
    sys.exit(main() or 0)
