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

import datetime, importlib.util, json, os, shutil, subprocess, sys, time

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)
from curacion_logica import (
    colgados_a_matar,
    clasificar_arbol_sucio,
    debe_reintentar_ya,
)
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
# Un trabajador sin escribir NADA en este tiempo se da por colgado. Más largo
# que el COLGADO_S del orquestador (300 s) a propósito: el vigilante es la
# última instancia, no la primera, y una escritura larga legítima no debe
# pagar la duda.
COLGADO_S = int(os.environ.get("STARSEED_VIGILANTE_COLGADO_S", "1800"))
# Estorbos sin seguimiento se apartan aquí (NUNCA se borran): si alguien
# necesitaba uno, ahí sigue, con la fecha en que se movió.
APARTADO = os.path.join(OLAS, "_apartado")

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
            json.dump(
                nuevo, open(tmp, "w", encoding="utf-8"), ensure_ascii=False, indent=1
            )
            os.replace(tmp, ruta)
        os.replace(CORRECCIONES, CORRECCIONES + ".aplicado")
        if aplicadas:
            print(
                "correcciones aplicadas a progreso.json:",
                ", ".join(aplicadas),
                flush=True,
            )
        return aplicadas
    except Exception as e:  # noqa: BLE001
        print("correcciones: %s: %s" % (type(e).__name__, e), flush=True)
        return []


_AVISADAS = set()
_REABIERTAS = set()  # ya se pidió `reabrir` en esta tanda: no repetir la orden


def cola_viva():
    """La cola que corre AHORA, leída de los argumentos del orquestador vivo.

    (2026-09-20) Antes se adivinaba por el latido más reciente y eso escribió seis
    tareas en `cola-auto-0913-193908.json`, una cola de hace una semana que ni
    siquiera existía ya. Los argumentos del proceso no se equivocan."""
    try:
        salida = subprocess.run(
            ["ps", "-axo", "args="], capture_output=True, text=True, timeout=20
        ).stdout
    except Exception:
        return None
    for linea in salida.splitlines():
        if "starseed-enjambre.py" not in linea or "grep" in linea:
            continue
        for trozo in linea.split():
            if trozo.endswith(".json") and os.path.basename(trozo).startswith("cola-"):
                ruta = (
                    trozo
                    if os.path.isabs(trozo)
                    else os.path.join(OLAS, os.path.basename(trozo))
                )
                return ruta if os.path.exists(ruta) else None
    return None


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
                    json.dump(
                        nuevo,
                        open(tmp, "w", encoding="utf-8"),
                        ensure_ascii=False,
                        indent=1,
                    )
                    os.replace(tmp, ruta_p)
                    restantes = {
                        k: v for k, v in correcciones.items() if k not in aplicadas
                    }
                    if restantes:
                        json.dump(
                            restantes,
                            open(CORRECCIONES, "w", encoding="utf-8"),
                            ensure_ascii=False,
                            indent=1,
                        )
                    else:
                        os.replace(CORRECCIONES, CORRECCIONES + ".aplicado")
                    print(
                        "correcciones aplicadas (fuera de la tanda viva):",
                        ", ".join(aplicadas),
                        flush=True,
                    )
        except Exception as e:  # noqa: BLE001
            print("correcciones (vivo): %s: %s" % (type(e).__name__, e), flush=True)
    # 1b) correcciones de tareas que SÍ están en la cola viva: orden de control `reabrir`
    #     (su estado en progreso.json no basta: manda la copia en memoria del orquestador).
    if os.path.exists(CORRECCIONES):
        try:
            correcciones = json.load(open(CORRECCIONES, encoding="utf-8"))
            propias = {
                k: v
                for k, v in correcciones.items()
                if k in en_cola
                and str((v or {}).get("estado")) == "pendiente"
                and k not in _REABIERTAS
            }
            if propias:
                ruta_ctrl = os.path.join(OLAS, "control-" + os.path.basename(ruta))
                try:
                    ordenes = json.load(open(ruta_ctrl, encoding="utf-8"))
                except Exception:
                    ordenes = {}
                for tid, v in propias.items():
                    ordenes[tid] = {
                        "accion": "reabrir",
                        "quien": "director",
                        "motivo": str((v or {}).get("nota") or "")[:160],
                        "t": time.strftime("%Y-%m-%d %H:%M:%S"),
                    }
                tmp = ruta_ctrl + ".tmp"
                json.dump(
                    ordenes,
                    open(tmp, "w", encoding="utf-8"),
                    ensure_ascii=False,
                    indent=1,
                )
                os.replace(tmp, ruta_ctrl)
                # La corrección NO se borra: un orquestador anterior a `reabrir` se traga
                # la orden sin entenderla, y la tarea se perdería en silencio. Se queda
                # para aplicarse cuando la tanda muera (2026-09-20).
                _REABIERTAS.update(propias)
                print(
                    "reabrir pedido en la tanda viva:", ", ".join(propias), flush=True
                )
        except Exception as e:  # noqa: BLE001
            print("reabrir (vivo): %s: %s" % (type(e).__name__, e), flush=True)

    # 2) pendientes nuevas → a la cola viva
    nuevas = [
        t for t in _pendientes_sin_correcciones() if str(t.get("id")) not in en_cola
    ]
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
    print(
        "tanda viva alimentada (%s): %s" % (os.path.basename(ruta), ", ".join(ids)),
        flush=True,
    )
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
            print(
                "aviso: %s trae ids que otra ola ya integró (se saltan; renómbralos): %s"
                % (nombre, ", ".join(chocan)),
                flush=True,
            )
    # (2026-09-21) Aquí faltaba `ahora`, y costó DIEZ HORAS de Mac parada.
    # `seleccionar_pendientes` solo aplica el orden por importancia —y solo aparta
    # las tareas bloqueadas por dependencias abiertas— cuando se le pasa la hora;
    # sin ella devuelve la lista cruda. p318Jb declara `depende: [p318I]` y p318I
    # NO EXISTE: ni tarea, ni entrada en progreso, ni en ninguna cola. Así que el
    # vigilante lanzaba una ola cada tres minutos con esa única tarea imposible,
    # el orquestador no podía hacer nada y salía dejando dos commits de memoria.
    # 120 olas, 240 commits de ruido y cero trabajo entre las 04:00 y las 14:26.
    # Con la hora puesta, esa tarea cae en «bloqueadas», la lista queda vacía y
    # `decidir_relanzamiento` ya no relanza (n_pendientes <= 0). De paso entra el
    # orden por importancia que pidió Alex: primero lo que amplía capacidad.
    return seleccionar_pendientes(
        colas, prog, asuntos, ahora=datetime.datetime.now()
    )


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


def _porcelain_lineas():
    """`git status --porcelain` en RAIZ, línea a línea y sin recortar."""
    try:
        salida = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=RAIZ,
            capture_output=True,
            text=True,
            timeout=15,
        ).stdout.splitlines()
    except Exception:
        return []
    return [l for l in salida if l.strip()]


def _segundos_etime(etexto):
    """`etime` de ps ([[DD-]HH:]MM:SS) → segundos; 0 si no se entiende."""
    try:
        dias, _, resto = etexto.partition("-")
        if not resto:
            dias, resto = "0", dias
        piezas = [int(x) for x in resto.split(":")]
        piezas = ([0] * (3 - len(piezas))) + piezas
        return int(dias) * 86400 + piezas[0] * 3600 + piezas[1] * 60 + piezas[2]
    except (ValueError, IndexError):
        return 0


def _worktree_de_args(args):
    """La ruta absoluta del worktree dentro de la línea de órdenes, si aparece
    (el prompt de cada agente empieza nombrando su raíz)."""
    for token in args.split():
        ruta = token.strip("`\"'.,:;")
        if ruta.startswith("/") and os.path.isdir(ruta):
            return ruta
    return ""


def _ultimo_byte_de(ruta):
    """La mtime MÁS RECIENTE de todo lo que cuelga de `ruta`, recorrida
    recursivamente (saltando .git y node_modules), igual que `_firma_trabajo`
    del orquestador mide el trabajo real. La mtime del DIRECTORIO raíz no sirve:
    solo cambia al crear o borrar entradas en él, no al escribir dentro de
    subcarpetas, y fiarse de ella mataba trabajadores sanos que llevaban media
    hora editando `src/lib/x.ts` (objeción de revisión de 2026-09-14)."""
    try:
        if os.path.isfile(ruta):
            return os.path.getmtime(ruta)
    except OSError:
        return 0
    mas_reciente = 0.0
    for base, carpetas, archivos in os.walk(ruta):
        carpetas[:] = [c for c in carpetas if c not in (".git", "node_modules")]
        for nombre in carpetas + archivos:
            try:
                m = os.path.getmtime(os.path.join(base, nombre))
            except OSError:
                continue
            if m > mas_reciente:
                mas_reciente = m
    return mas_reciente


def listar_trabajadores(ahora=None):
    """Los `opencode run` vivos, cada uno con pid, tarea (nombre del worktree),
    instante de arranque y `ultimo_byte` medido de verdad. Jamás con pkill ni
    grep del prompt: solo se miran líneas de `ps`."""
    ahora = ahora or time.time()
    try:
        salida = subprocess.run(
            ["ps", "-eo", "pid,etime,args"], capture_output=True, text=True, timeout=20
        ).stdout
    except Exception:
        return []  # sin lista fiable no se mata a nadie
    procesos = []
    for linea in salida.splitlines():
        partes = linea.split(None, 2)
        if len(partes) < 3 or not partes[0].isdigit():
            continue
        pid, args = int(partes[0]), partes[2]
        if "opencode" not in args or "run" not in args.split():
            continue
        trabajo = _worktree_de_args(args)
        procesos.append(
            {
                "pid": pid,
                "tarea": os.path.basename(trabajo) if trabajo else "?",
                "inicio": ahora - _segundos_etime(partes[1]),
                "ultimo_byte": _ultimo_byte_de(trabajo) if trabajo else 0,
                "propio": pid == os.getpid(),
            }
        )
    return procesos


def matar_colgados(decir=None):
    """Mata SOLO los trabajadores que `colgados_a_matar` marca, con kill por pid.

    `pkill -f` está prohibido aquí y para siempre: el texto del prompt de un
    agente cita el nombre de otros procesos y el patrón mata lo que no debe;
    ya nos llevamos por delante el propio vigilante una vez. Cada matanza se
    anuncia con UNA línea en el canal."""
    avisar = decir or _p.decir
    ahora = time.time()
    procesos = listar_trabajadores(ahora)
    por_pid = {p["pid"]: p for p in procesos}
    for pid in colgados_a_matar(procesos, ahora, COLGADO_S):
        p = por_pid.get(pid) or {}
        ultimo = p.get("ultimo_byte") or p.get("inicio") or ahora
        minutos = int((ahora - ultimo) // 60)
        try:
            subprocess.run(["kill", "-TERM", str(pid)], capture_output=True, timeout=10)
            time.sleep(5)
            try:
                os.kill(pid, 0)
            except ProcessLookupError:
                pass  # el TERM bastó: salió limpio
            else:
                subprocess.run(
                    ["kill", "-9", str(pid)], capture_output=True, timeout=10
                )
        except Exception as e:  # noqa: BLE001
            print("matar %s: %s: %s" % (pid, type(e).__name__, e), flush=True)
            continue
        avisar(
            "mato el trabajador de %s: %d min sin escribir un byte"
            % (p.get("tarea", "?"), minutos),
            "vigilante",
            "aviso",
        )


def curar_arbol_sucio(decir=None):
    """Clasifica lo que ensucia `main` y aparta el estorbo; el trabajo no se toca.

    Devuelve True si tras la cura el árbol queda limpio: el arranque puede
    reintentarse en la misma pasada. Devuelve False si queda trabajo real, y
    entonces se avisa con la lista de archivos, para que nadie vuelva a perder
    dos horas averiguando QUÉ bloqueaba el arranque."""
    avisar = decir or _p.decir
    grupos = clasificar_arbol_sucio(_porcelain_lineas())
    if grupos["estorbo"]:
        destino = os.path.join(APARTADO, time.strftime("%Y-%m-%d"))
        os.makedirs(destino, exist_ok=True)
        movidos = []
        for ruta in grupos["estorbo"]:
            origen = os.path.join(RAIZ, ruta)
            if not os.path.exists(origen):
                continue
            shutil.move(origen, os.path.join(destino, os.path.basename(ruta)))
            movidos.append(ruta)
        if movidos:
            avisar(
                "estorbo sin seguimiento apartado en _apartado/%s (NO borrado): %s"
                % (os.path.basename(destino), ", ".join(movidos)),
                "vigilante",
                "aviso",
            )
    if grupos["trabajo"]:
        avisar(
            "cambios sin commit que bloquean el arranque (NO los toco; hay que "
            "decidir sobre ellos): %s" % ", ".join(grupos["trabajo"]),
            "vigilante",
            "fallo",
        )
        return False
    return not _porcelain_lineas()


def esperar_reintento(motivo):
    """Espera tras un fallo de arranque, pero DESPIERTA cada INTERVALO_S.

    Antes dormía PAUSA_TRAS_FALLO_S de una pieza: un árbol que se limpiaba al
    minuto seguía parado nueve más. Ahora cada despertar recalcula si la causa
    sigue (`git status` fresco si el motivo fue el árbol sucio) y
    `debe_reintentar_ya` decide. El techo duro es la pausa entera, así aunque
    la causa nunca desaparezca el vigilante no se queda dormido para siempre
    (objeción de revisión de 2026-09-14)."""
    inicio = time.time()
    while time.time() - inicio < PAUSA_TRAS_FALLO_S:
        causa_sigue = (
            bool(_porcelain_lineas())
            if "cambios sin commit" in (motivo or "")
            else True
        )
        if debe_reintentar_ya(
            motivo, causa_sigue, time.time() - inicio, PAUSA_TRAS_FALLO_S
        ):
            return
        time.sleep(INTERVALO_S)


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
                    matar_colgados()
                except Exception as e:  # noqa: BLE001
                    print("matar_colgados: %s: %s" % (type(e).__name__, e), flush=True)
                try:
                    alimentar_tanda_viva()
                except Exception as e:  # noqa: BLE001
                    print(
                        "alimentar_tanda_viva: %s: %s" % (type(e).__name__, e),
                        flush=True,
                    )
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
                    if "cambios sin commit" in motivo:
                        # Si era SOLO estorbo, el árbol queda limpio ya mismo y el
                        # arranque se reintenta en la próxima pasada, no en 10 min.
                        if curar_arbol_sucio():
                            continue
                    esperar_reintento(motivo)
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
