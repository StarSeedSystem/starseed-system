#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""El que hace que la orquestación sea AUTOMÁTICA de verdad.

Hasta hoy faltaba justo esto. El orquestador terminaba su cola, salía con éxito…
y ahí se quedaba. El Mando enseñaba «0 tareas en curso» con decenas de pendientes,
y no porque nada funcionara: porque nadie volvía a arrancarlo. La automatización
se apoyaba en que yo estuviera delante para relanzarlo a mano, y eso no es
automatización.

Este vigilante mira cada `INTERVALO_S` segundos:

  · ¿Hay un orquestador vivo?  Si sí, no toca nada.
  · Si no, ¿queda trabajo real?  Reúne las tareas pendientes de TODAS las colas,
    descarta las que ya están en `main` según progreso.json, escribe una cola nueva
    y lanza el orquestador con ella.
  · Si no queda trabajo, calla y espera. No inventa tareas.

Cada decisión se anuncia en el canal común, así que los cuatro entornos y el
Telegram se enteran de por qué arrancó o por qué está callado.

  python3 scripts/puente/vigilante-enjambre.py
"""

import importlib.util, json, os, subprocess, sys, time

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)
from vigilante_logica import (
    decidir_relanzamiento,
    aplicar_correcciones,
    ids_colisionados,
    es_cola_fuente,
    seleccionar_pendientes,
    ultima_salida,
)
import cerrojos_git
import config_director

RAIZ = os.environ.get("STARSEED_ROOT") or "/Users/alex/Documents/starseed-os-main"
OLAS = os.path.join(RAIZ, "starseed_memory_root", "olas")
INTERVALO_S = int(os.environ.get("STARSEED_VIGILANTE_S", "90"))
TRABAJADORES = os.environ.get("STARSEED_TRABAJADORES", "5")
# Un tope por tanda: una cola de noventa tareas es inmanejable y el orquestador
# se pasa la vida releyendo el progreso en vez de escribir.
TOPE = int(os.environ.get("STARSEED_TOPE_COLA", "20"))
REGISTRO = "/tmp/enjambre.log"
ESPERA_ARRANQUE_S = int(os.environ.get("STARSEED_ESPERA_ARRANQUE_S", "45"))
PAUSA_TRAS_FALLO_S = int(os.environ.get("STARSEED_PAUSA_FALLO_S", "600"))

_spec = importlib.util.spec_from_file_location(
    "puente", os.path.join(DIRECTORIO, "puente.py")
)
_p = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_p)


def orquestador_vivo():
    """Cuenta SOLO procesos cuya orden EMPIEZA por un python.

    Un `grep` suelto cuenta como orquestador el TEXTO DEL PROMPT de un agente,
    porque ahí dentro aparece la ruta del script. Esa trampa ya nos hizo matar
    nuestro propio shell y ver orquestadores fantasma tres veces en un día."""
    try:
        salida = subprocess.run(
            ["ps", "-eo", "args"], capture_output=True, text=True, timeout=20
        ).stdout
    except Exception:
        return True  # ante la duda, no lanzar: dos orquestadores es peor
    import re

    patron = re.compile(r"^[^ ]*[Pp]ython[0-9.]* +-u +.*starseed-enjambre\.py")
    return any(patron.match(l) for l in salida.splitlines())


def barrer_cerrojos():
    """Quita los `index.lock` que dejó atrás un git muerto.

    Sin esto, un agente que muere a media escritura condena su tarea: cada
    intento posterior choca con el cerrojo y se gasta un reintento gratuito sin
    haber podido escribir una línea. Se avisa solo cuando se quita alguno; un
    barrido silencioso cada 90 s no es noticia.
    """
    try:
        salida = subprocess.run(
            ["ps", "-eo", "args"], capture_output=True, text=True, timeout=20
        ).stdout.splitlines()
    except Exception:
        return  # sin poder mirar los procesos no se toca ningún cerrojo
    rutas = cerrojos_git.cerrojos_huerfanos(
        os.path.join(RAIZ, ".git", "worktrees"), salida
    )
    quitados = cerrojos_git.quitar(rutas)
    if quitados:
        tareas = ", ".join(os.path.basename(os.path.dirname(r)) for r in quitados)
        _p.decir(
            "cerrojos de git huérfanos quitados en %s: sus tareas volvían a fallar "
            "en cada intento sin poder escribir nada" % tareas,
            "vigilante",
            "aviso",
        )


CORRECCIONES = os.path.join(OLAS, "progreso-correcciones.json")


def aplicar_correcciones_pendientes():
    """Con el orquestador parado, funde `progreso-correcciones.json` (lo deja el director:
    reencolar, descartar, cambiar medio) en progreso.json y retira el archivo. Con el
    orquestador vivo NO se toca: su copia en memoria pisaría el cambio (2026-09-20)."""
    if not os.path.exists(CORRECCIONES):
        return []
    if orquestador_vivo():
        return []  # con el orquestador vivo su copia en memoria pisaría el cambio: se espera
    try:
        correcciones = json.load(open(CORRECCIONES, encoding="utf-8"))
        ruta = os.path.join(OLAS, "progreso.json")
        try:
            prog = json.load(open(ruta, encoding="utf-8"))
        except Exception:
            prog = {}
        nuevo, aplicadas = aplicar_correcciones(prog, correcciones)
        if aplicadas:
            tmp = ruta + ".tmp"
            json.dump(nuevo, open(tmp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            os.replace(tmp, ruta)
        os.replace(CORRECCIONES, CORRECCIONES + ".aplicado")
        if aplicadas:
            print("correcciones aplicadas a progreso.json:", ", ".join(aplicadas), flush=True)
        return aplicadas
    except Exception as e:  # noqa: BLE001
        print("correcciones: %s: %s" % (type(e).__name__, e), flush=True)
        return []


_AVISADAS = set()


def cola_viva():
    """La cola auto-* cuyos latidos son más recientes (la que corre el orquestador)."""
    mejor, mejor_t = None, 0.0
    for f in os.listdir(OLAS):
        if f.startswith("latidos-cola-auto-") and f.endswith(".json"):
            t = os.path.getmtime(os.path.join(OLAS, f))
            if t > mejor_t:
                mejor, mejor_t = f[len("latidos-"):], t
    if not mejor or time.time() - mejor_t > 600:
        return None
    ruta = os.path.join(OLAS, mejor)
    return ruta if os.path.exists(ruta) else None


def alimentar_tanda_viva():
    """Con el orquestador VIVO: correcciones de tareas ajenas a la cola viva y pendientes
    nuevas añadidas a esa cola, para que ningún trabajador se quede parado esperando a
    que muera la tanda (2026-09-20). Devuelve los ids añadidos."""
    ruta = cola_viva()
    if not ruta:
        return []
    try:
        d = json.load(open(ruta, encoding="utf-8"))
    except Exception:
        return []
    lista = d if isinstance(d, list) else d.get("tareas") or []
    en_cola = {str(t.get("id")) for t in lista if isinstance(t, dict)}
    # 1) correcciones solo de tareas que NO están en la cola viva
    if os.path.exists(CORRECCIONES):
        try:
            correcciones = json.load(open(CORRECCIONES, encoding="utf-8"))
            ajenas = {k: v for k, v in correcciones.items() if k not in en_cola}
            if ajenas:
                ruta_p = os.path.join(OLAS, "progreso.json")
                prog = json.load(open(ruta_p, encoding="utf-8"))
                nuevo, aplicadas = aplicar_correcciones(prog, ajenas)
                if aplicadas:
                    tmp = ruta_p + ".tmp"
                    json.dump(nuevo, open(tmp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
                    os.replace(tmp, ruta_p)
                    restantes = {k: v for k, v in correcciones.items() if k not in aplicadas}
                    if restantes:
                        json.dump(restantes, open(CORRECCIONES, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
                    else:
                        os.replace(CORRECCIONES, CORRECCIONES + ".aplicado")
                    print("correcciones aplicadas (fuera de la tanda viva):", ", ".join(aplicadas), flush=True)
        except Exception as e:  # noqa: BLE001
            print("correcciones (vivo): %s: %s" % (type(e).__name__, e), flush=True)
    # 2) pendientes nuevas → a la cola viva
    nuevas = [t for t in _pendientes_sin_correcciones() if str(t.get("id")) not in en_cola]
    if not nuevas:
        return []
    lista.extend(nuevas)
    if isinstance(d, list):
        d = lista
    else:
        d["tareas"] = lista
    tmp = ruta + ".tmp"
    json.dump(d, open(tmp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    os.replace(tmp, ruta)
    ids = [str(t.get("id")) for t in nuevas]
    print("tanda viva alimentada (%s): %s" % (os.path.basename(ruta), ", ".join(ids)), flush=True)
    return ids


def pendientes():
    """Trabajo real: sin copias `auto-*`, duplicados ni commits ya integrados."""
    aplicar_correcciones_pendientes()
    return _pendientes_sin_correcciones()


def _pendientes_sin_correcciones():
    try:
        prog = json.load(open(os.path.join(OLAS, "progreso.json"), encoding="utf-8"))
    except Exception:
        prog = {}
    try:
        asuntos = subprocess.run(
            ["git", "log", "main", "--format=%s"],
            cwd=RAIZ,
            capture_output=True,
            text=True,
            timeout=30,
        ).stdout.splitlines()
    except Exception:
        asuntos = []
    colas = []
    for f in sorted(os.listdir(OLAS), reverse=True):  # las colas nuevas primero
        if not es_cola_fuente(f):
            continue
        try:
            d = json.load(open(os.path.join(OLAS, f), encoding="utf-8"))
        except Exception:
            continue
        colas.append((f, d if isinstance(d, list) else d.get("tareas", [])))
    for nombre, tareas in colas:
        chocan = ids_colisionados(tareas, asuntos, prog)
        if chocan and not _AVISADAS.issuperset(chocan):
            _AVISADAS.update(chocan)
            print("aviso: %s trae ids que otra ola ya integró (se saltan; renómbralos): %s"
                  % (nombre, ", ".join(chocan)), flush=True)
    return seleccionar_pendientes(colas, prog, asuntos)


def lanzar(tareas, trabajadores=None):
    trabajadores = trabajadores or TRABAJADORES
    nombre = "cola-auto-%s.json" % time.strftime("%m%d-%H%M%S")
    ruta = os.path.join(OLAS, nombre)
    json.dump(tareas, open(ruta, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    guion = os.path.join(RAIZ, "scripts", "puente", "lanzar-enjambre.sh")
    demonio = os.path.join(RAIZ, "scripts", "puente", "demonio.py")
    subprocess.run(
        [
            "python3",
            demonio,
            REGISTRO,
            RAIZ,
            "/bin/zsh",
            guion,
            os.path.join("starseed_memory_root", "olas", nombre),
            str(trabajadores),
        ],
        timeout=60,
    )
    return nombre


def comprobar_arranque():
    """Tras `lanzar` espera hasta ESPERA_ARRANQUE_S. Si el orquestador NO sigue
    vivo y el registro cerró con `__EXIT__=N` distinto de 0, devuelve el motivo;
    en cualquier otro caso, None (arrancó bien o aún no sabemos)."""
    limite = time.time() + ESPERA_ARRANQUE_S
    while time.time() < limite:
        if orquestador_vivo():
            return None
        time.sleep(3)
    try:
        with open(REGISTRO, encoding="utf-8", errors="replace") as f:
            lineas = f.read().splitlines()
    except OSError:
        return None
    codigo, motivo = ultima_salida(lineas)
    if codigo or orquestador_vivo():
        return motivo or "salió con código %s sin dejar motivo" % codigo
    return None


def detalle_cambios_sin_commit():
    """Primeras filas del `git status --porcelain` para que el aviso diga qué
    ensucia `main` sin obligar a nadie a abrir una terminal."""
    try:
        salida = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=RAIZ,
            capture_output=True,
            text=True,
            timeout=15,
        ).stdout.splitlines()
    except Exception:
        return ""
    return "\n".join(salida[:5])[:300]


def main():
    print(
        "Vigilante del enjambre · cada %ss · tope %d tareas por tanda"
        % (INTERVALO_S, TOPE)
    )
    _p.decir(
        "Vigilante del enjambre en marcha: si el orquestador termina o muere y queda "
        "trabajo, lo relanzo solo.",
        "vigilante",
        "hecho",
    )
    callado_desde = None
    pausa_avisada = 0.0
    while True:
        try:
            hay = orquestador_vivo()
            barrer_cerrojos()
            if hay:
                try:
                    alimentar_tanda_viva()
                except Exception as e:  # noqa: BLE001
                    print("alimentar_tanda_viva: %s: %s" % (type(e).__name__, e), flush=True)
            cola = [] if hay else pendientes()
            cfg, _avisos = config_director.cargar()
            relanzar, trabajadores, tope = decidir_relanzamiento(cfg, hay, len(cola))
            if relanzar:
                callado_desde = None
                tanda = cola[:tope]
                nombre = lanzar(tanda, trabajadores)
                _p.decir(
                    "orquestador parado con %d pendientes → relanzo con %d en %s"
                    % (len(cola), len(tanda), nombre),
                    "vigilante",
                    "aviso",
                )
                motivo = comprobar_arranque()
                if motivo is not None:
                    aviso = (
                        "el orquestador se negó a arrancar y salió con "
                        "error: %s — NO lo reintento en 90s; espero %d min"
                        % (motivo, PAUSA_TRAS_FALLO_S // 60)
                    )
                    if "cambios sin commit" in motivo:
                        detalle = detalle_cambios_sin_commit()
                        if detalle:
                            aviso += "\nworking tree:\n" + detalle
                    _p.decir(aviso, "vigilante", "fallo")
                    time.sleep(PAUSA_TRAS_FALLO_S)
            elif cfg.get("pausado"):
                callado_desde = None
                ahora = time.time()
                if ahora - pausa_avisada >= 3600:
                    pausa_avisada = ahora
                    _p.decir(
                        "vigilante en pausa por ajuste del Mando",
                        "vigilante",
                        "aviso",
                    )
            elif callado_desde is None:
                callado_desde = time.time()
                _p.decir(
                    "orquestador parado y NO queda trabajo pendiente: espero sin inventar tareas.",
                    "vigilante",
                    "mensaje",
                )
        except Exception as e:
            print("vigilante: %s: %s" % (type(e).__name__, e), flush=True)
        time.sleep(INTERVALO_S)


if __name__ == "__main__":
    sys.exit(main() or 0)
