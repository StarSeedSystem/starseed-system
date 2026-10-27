#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Director de la nube: mantiene encendido el medio de GitHub Actions sin que nadie lo pida.

Alex (2026-09-20): «sincroniza la mayor cantidad posible de agentes simultáneos que los
directores puedan manejar y que los servicios gratuitos nos ofrezcan». El medio de la nube
existía desde el día 20 y NUNCA se encendió solo: había que lanzarlo a mano con
`nube-gh.py lanzar`, y como nadie lo lanzaba, tres agentes gratuitos de 4 vCPU / 16 GB
estuvieron apagados mientras la Mac iba al límite con tres.

Alex (2026-09-21): «aun no veo que suba el numero de agentes, son las capacidades de los
contenedores en la nube de todos los proveedores». Tenía razón y la culpa estaba AQUÍ, en
dos topes que no medían nada real:

  · `runs_en_marcha > 0` cortaba en seco. El comentario decía «un job por vez basta: el
    tope real son las pasarelas, no las máquinas». Medido el día 21: el grupo de
    concurrencia del workflow va por cola, así que DOS runs de colas distintas corrieron a
    la vez y entregaron 4 ramas `nube/*` — 9 agentes en total. El tope de un job era una
    creencia, no una medida.
  · `TOPE_DIA = 8` se agotaba a media tarde (log del 21: «tope del día alcanzado» desde las
    16:40 hasta las 20:21, cuatro horas sin nube con atraso en la cola).

Ahora el tope es el único que sí es real: **cuántos agentes simultáneos aguantan las
pasarelas gratuitas**, `TOPE_AGENTES`. Los jobs se lanzan en paralelo mientras quepan
agentes, y el número de agentes se MIDE de los runs vivos (no se supone) con
`agentes_nube.resumir`, el mismo lector que alimenta el medidor de Genesis.

Lo que NO hace, a propósito:
  · No toca `main` con código: `nube-gh.py lanzar` solo publica el commit de la cola.
  · No lanza un run a medias: si el atraso no llena otro job, espera. Un agente sin tarea
    no es capacidad, es ruido.
  · No interrumpe nada de la Mac: la nube trabaja sobre tareas marcadas «reasignada · nube».

  python3 scripts/puente/director-nube.py
"""
import json
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import repartir_nube as RN  # noqa: E402  (lógica pura del reparto: elegir, marcar, reclamar)

RAIZ = os.environ.get("STARSEED_ROOT") or "/Users/alex/Documents/starseed-os-main"
INTERVALO_S = int(os.environ.get("STARSEED_NUBE_S", "240"))
#: Backstop, no política: con repo público los minutos de Actions son gratis, así que el
#: tope del día solo existe para no ensuciar el historial si algo se vuelve loco.
#: (2026-10-26, CAP1026D) 30 es el SUELO, no el tope: el tope del día sale de la capacidad medida
#: (`tope_dia_por_capacidad`). Con 30 fijos se alcanzaba TODOS los días desde el 14-10 (ese día a
#: las 12:00) y la nube se quedaba parada el resto del día con 300 tareas listas. Si se fija
#: STARSEED_NUBE_TOPE_DIA a mano, manda ese número.
TOPE_DIA = int(os.environ.get("STARSEED_NUBE_TOPE_DIA", "30"))
TOPE_DIA_FIJO = bool(os.environ.get("STARSEED_NUBE_TOPE_DIA"))
#: 4 y no 3: el runner es de 4 vCPU / 16 GB. El 3 de la Mac es su límite de RAM (8 GB),
#: no una propiedad del enjambre; en la nube no hay gobernador que recorte, así que
#: `--workers 4` es un trabajador por vCPU.
TRABAJADORES = os.environ.get("STARSEED_NUBE_TRABAJADORES", "4")
#: El tope que SÍ mide algo: agentes simultáneos que aguantan las pasarelas gratuitas.
#: 12 = 3 jobs de 4. Si las pasarelas empiezan a devolver 429, este es el número a bajar.
TOPE_AGENTES = int(os.environ.get("STARSEED_NUBE_TOPE_AGENTES", "12"))
#: 45 y no 300: los logs de un job EN MARCHA no se pueden descargar, asi que el tope
#: es tambien el tiempo que tardamos en poder diagnosticar un cuelgue. (2026-09-20)
MINUTOS = os.environ.get("STARSEED_NUBE_MINUTOS", "45")
CUENTA = os.path.expanduser("~/.starseed/nube-lanzamientos.json")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


#: (2026-10-26, CAP1026A) Lo que ESTE director sabe lanzar: GitHub Actions, con `nube-gh.py lanzar`.
#: Cloudroom (`cloudroom_lanzar.py`) y las sesiones de Claude en la nube (`alta-capacidad-nube.py`, en
#: pausa por decisión de Alex) tienen su propio lanzador y su propio director. MEDIDO a las 09:00 UTC:
#: con GitHub «lleno» (4 jobs = 2 escritores vivos × 2), el inventario daba como primer desplegable
#: «Sesiones de Claude Code en la nube» (4 libres, 1 agente por job) y este director lanzaba igualmente
#: un job de GitHub con `--trabajadores 1`: seis jobs de UN agente (más allá del tope de jobs) en vez
#: de cuatro de cuatro.
LANZABLES = frozenset({"nube-gh"})


def tope_dia_por_capacidad(jobs_simultaneos, minutos=None, suelo=None, fijo=None):
    """PURA (CAP1026D): cuántos lanzamientos al día puede llegar a usar el medio que se lanza.

    Jobs que el medio admite a la vez (nube-gh: 3 de 4 agentes, del catálogo de contenedores) por
    los relevos que caben en 24 h con jobs de `minutos`: 3 × ⌈1440/45⌉ = 3 × 32 = 96. Sigue siendo
    un backstop (un bucle que lanzara cada 240 s se para a las ~6 h), pero ya no deja la nube
    parada a mediodía. Nunca baja del suelo (TOPE_DIA) y un tope fijado a mano (`fijo`) manda.
    """
    suelo = TOPE_DIA if suelo is None else int(suelo)
    fijo = TOPE_DIA_FIJO if fijo is None else fijo
    if fijo:
        return suelo
    try:
        jobs = max(1, int(jobs_simultaneos or 0))
        m = max(1, int(minutos or MINUTOS))
    except (TypeError, ValueError):
        return suelo
    return max(suelo, jobs * -(-24 * 60 // m))


def _jobs_del_lanzable(contenedores, lanzables=LANZABLES):
    """Jobs a la vez del medio que el director sabe lanzar (aunque ahora esté lleno)."""
    for c in contenedores or []:
        if isinstance(c, dict) and str(c.get("id") or "") in lanzables and int(c.get("jobs_simultaneos") or 0) > 0:
            return int(c["jobs_simultaneos"])
    return max(1, TOPE_AGENTES // max(1, int(TRABAJADORES)))


def decidir_lanzamiento(atraso, runs_en_marcha, lanzados_hoy, tope_dia=TOPE_DIA,
                        hay_claves=True, agentes_en_marcha=0, trabajadores=None,
                        tope_agentes=TOPE_AGENTES):
    """Función PURA: (lanzar: bool, motivo: str). Aquí vive toda la política.

    Se lanza si el medio PUEDE trabajar (tiene las claves de proveedor en los secretos del
    repo), hay trabajo que la Mac no está tocando, CABEN más agentes bajo el tope de las
    pasarelas y el atraso llena el job que se va a lanzar. El orden de las comprobaciones
    es el orden en que importan.

    Lo de las claves es lo primero por una razón medida (2026-09-20): sin ellas el workflow
    arranca, instala todo y muere en el paso de claves. Lanzar cada pocos minutos un job que
    ya sabemos que va a morir no es insistir, es ensuciar el historial.

    `runs_en_marcha` ya no corta: solo decide si exigimos que el atraso llene el job (el
    primer run se lanza aunque solo haya una tarea; el segundo, no).
    """
    n = int(trabajadores or TRABAJADORES)
    if not hay_claves:
        return False, "sin claves de proveedor en los secretos del repo (las sube Alex: nube-gh.py secretos)"
    if lanzados_hoy >= tope_dia:
        return False, "tope del día alcanzado (%d)" % tope_dia
    if atraso <= 0:
        return False, "no hay atraso que repartir"
    libres = tope_agentes - max(0, agentes_en_marcha)
    if libres < n:
        return False, "%d agente(s) de nube ya en marcha: no caben %d más (tope %d)" % (
            agentes_en_marcha, n, tope_agentes)
    if runs_en_marcha > 0 and atraso < n:
        return False, "%d tarea(s) de atraso no llenan otro job de %d agentes" % (atraso, n)
    return True, "%d tarea(s) de atraso y sitio para %d agente(s) más (%d/%d en marcha)" % (
        atraso, n, agentes_en_marcha, tope_agentes)


def _sh(orden, timeout=120):
    try:
        r = subprocess.run(orden, cwd=RAIZ, capture_output=True, text=True, timeout=timeout)
        return r.stdout or ""
    except Exception:
        return ""


def _sh_rc(orden, timeout=120):
    """(returncode, stdout+stderr). `_sh` se come stderr y el código de salida, y por eso
    un lanzamiento abortado se contaba como lanzamiento hecho."""
    try:
        r = subprocess.run(orden, cwd=RAIZ, capture_output=True, text=True, timeout=timeout)
        return r.returncode, (r.stdout or "") + (r.stderr or "")
    except Exception as e:
        return 1, "%s: %s" % (type(e).__name__, e)


def atraso():
    """Cuántas tareas repartiría el reparto AHORA (simulación, no toca nada)."""
    salida = _sh([sys.executable, os.path.join(RAIZ, "scripts", "puente", "repartir-a-nube.py"),
                  "--tope", "6", "--simular"])
    for trozo in salida.split():
        if trozo.isdigit():
            return int(trozo)
    return 0


#: Los nombres que lee el paso de claves del workflow. Solo NOMBRES, jamás un valor.
CLAVES_DEL_ENJAMBRE = {
    "GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "NVIDIA_API_KEY", "NVIDIA_SHARED_KEY",
    "OPENROUTER_API_KEY", "XKIRO_API_KEY", "AIHUBMIX_API_KEY", "TOKENROUTER_API_KEY",
    "GROQ_API_KEY", "STARSEED_PASARELA_GROQ_KEY",
}


def hay_claves():
    salida = _sh(["gh", "secret", "list", "--json", "name", "--jq", ".[].name"])
    return any(l.strip() in CLAVES_DEL_ENJAMBRE for l in salida.splitlines())


def medir_nube():
    """(runs_en_marcha, agentes_en_marcha), medido de GitHub y ESCRITO en el bus.

    Es el mismo lector del medidor de Genesis (`agentes_nube`), a propósito: si el director
    y el medidor contaran por su cuenta volveríamos a la enfermedad de dos sitios que
    calculan el mismo número de forma distinta. Aquí se mide una vez y se escribe una vez.
    """
    try:
        import agentes_nube as AN

        # `AN.escribir` es el único escritor del bus, y no por elegancia: escribir aquí la
        # salida cruda de `resumir()` borraba los lanzamientos anotados y hacía que un run
        # de 4 agentes se contase como 1. (2026-09-22)
        resumen = AN.escribir(AN.resumir(AN._runs_de_github(), time.time()))
        _ULTIMO_RESUMEN[:] = [resumen]
        return len(resumen.get("runs") or []), int(resumen.get("agentes") or 0)
    except Exception as e:
        print("director-nube: no pude medir la nube: %s: %s" % (type(e).__name__, e), flush=True)
        # (2026-10-22) Sin medición no queda foto: ni el vigía ni la reclamación de varadas
        # deben actuar sobre la de la pasada anterior, ni tomar «0 runs» por cierto.
        _ULTIMO_RESUMEN.clear()
        return 0, 0


#: (2026-10-13) La última medición, para que el vigía actúe sobre lo mismo que acaba de escribirse.
_ULTIMO_RESUMEN = []


def vigilar_runs():
    """(2026-10-13) Alex: «la mayoría de agentes están "preparando su máquina" desde hace mucho y
    no se autoverifica por los directores». Cada pasada: un run duplicado, sin máquina, atascado
    preparándose o pasado de su tope se cancela, sus tareas vuelven sin gastar envío y se dice en
    el Chat Director (una vez por run). Regla y números en `vigia_runs_nube.py`. Nunca lanza."""
    if not _ULTIMO_RESUMEN:
        return []
    try:
        import vigia_runs_nube as VR

        return VR.actuar(_ULTIMO_RESUMEN[0], RAIZ)
    except Exception as e:
        print("director-nube: el vigía de runs falló: %s: %s" % (type(e).__name__, e), flush=True)
        return []


def elegir_contenedor(contenedores, lanzables=LANZABLES):
    """PURA: en qué contenedor desplegar ahora, o None si en ninguno cabe nada.

    (2026-09-22) Alex: «que los directores de los agentes también usen esa información
    para enrutar procesos a agentes en todos los contenedores y siempre se aproveche la
    mayor cantidad disponible». Esto es ese enrutado: se elige el contenedor desplegable
    con más sitio libre. El inventario ya viene ordenado por estado y sitio, así que aquí
    no se vuelve a ordenar — un solo criterio, en un solo lugar.

    Solo los que este director sabe lanzar (`lanzables`): elegir otro y lanzar GitHub con sus
    agentes por job mezclaba el tope de uno con la máquina del otro.
    """
    for c in contenedores or []:
        if (isinstance(c, dict) and str(c.get("id") or "") in lanzables and c.get("desplegable")
                and int(c.get("agentes_libres") or 0) > 0):
            return c
    return None


def inventario_de_contenedores():
    """El inventario medido (y escrito) de los contenedores de nube.

    Los topes salen de aquí y no de constantes del director: antes `TOPE_AGENTES = 12` y
    `TRABAJADORES = 4` eran suposiciones escritas a mano que no tenían por qué coincidir
    con lo que Genesis enseñaba en pantalla. Ahora la pantalla y la decisión leen el
    mismo archivo.
    """
    try:
        import contenedores_nube as CN

        return CN.escribir(CN.inventario())
    except Exception as e:
        print("director-nube: no pude inventariar contenedores: %s: %s"
              % (type(e).__name__, e), flush=True)
        return {"contenedores": [], "resumen": {}}


def _ids_de_ruta(ruta):
    """Ids de un archivo de cola (lista o {"tareas": [...]}). None si no se puede leer."""
    try:
        with open(ruta, encoding="utf-8") as f:
            d = json.load(f)
    except (OSError, ValueError):
        return None
    tareas = d if isinstance(d, list) else (d or {}).get("tareas") or []
    return {str(t.get("id")) for t in tareas if isinstance(t, dict) and t.get("id")}


def ids_de_una_cola(rel):
    """Los ids de la cola de un run vivo: `inputs.cola` es una ruta relativa a RAIZ del
    tipo `enjambre/colas/cola-nube-*.json` (la que `nube-gh.py lanzar` escribió al lanzar).
    None si la ruta falta, es rara o su archivo no se lee: para un run vivo eso significa
    «no se sabe qué lleva», y con un run en el aire no se devuelve nada esta pasada."""
    ruta = str(rel or "").strip()
    if not ruta or ".." in ruta or os.path.isabs(ruta):
        return None
    return _ids_de_ruta(os.path.join(RAIZ, ruta))


#: (2026-10-21) Menos de 30 min es joven: su run quizá aún no arranca (el disco ya tiene
#: la cola, el lanzamiento va detrás), y devolver sus tareas sería arrebatárselas.
COLA_JOVEN_S = 30 * 60


def ids_de_colas_jovenes(carpeta, ahora_ts, max_s=COLA_JOVEN_S):
    """Ids de las `cola-nube-*.json` de menos de `max_s` segundos de antigüedad. Nunca lanza."""
    try:
        nombres = os.listdir(carpeta)
    except OSError:
        return set()
    jovenes = set()
    for nombre in nombres:
        if not (nombre.startswith("cola-nube-") and nombre.endswith(".json")):
            continue
        try:
            edad = ahora_ts - os.path.getmtime(os.path.join(carpeta, nombre))
        except OSError:
            continue
        if edad >= max_s:
            continue
        ids = _ids_de_ruta(os.path.join(carpeta, nombre))
        if ids:
            jovenes |= ids
    return jovenes


def ordenar_reapertura_en_colas_vivas(ids):
    """Pide al orquestador local que retome las tareas devueltas por la nube."""
    if not ids:
        return
    try:
        import nodo_metagenesis_medio as NM

        colas = NM.colas_vivas()
    except Exception as e:
        print("director-nube: no pude detectar colas vivas: %s: %s" % (type(e).__name__, e), flush=True)
        return
    por_cola = {}
    for nombre in colas:
        ruta_cola = os.path.join(RAIZ, "starseed_memory_root", "olas", nombre)
        ids_cola = _ids_de_ruta(ruta_cola)
        if ids_cola is None:
            continue
        for tid in ids:
            if tid in ids_cola:
                por_cola.setdefault(nombre, []).append(tid)
    marca_tiempo = time.strftime("%Y-%m-%d %H:%M:%S")
    olas = os.path.join(RAIZ, "starseed_memory_root", "olas")
    for nombre, tareas in por_cola.items():
        ruta = os.path.join(olas, "control-" + nombre)
        try:
            with open(ruta, encoding="utf-8") as f:
                ordenes = json.load(f)
            if not isinstance(ordenes, dict):
                ordenes = {}
        except (OSError, ValueError):
            ordenes = {}
        for tid in tareas:
            ordenes[tid] = {
                "accion": "reabrir",
                "quien": "director-nube",
                "motivo": "devuelta de la nube: su run terminó",
                "t": marca_tiempo,
            }
        tmp = ruta + ".tmp"
        try:
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(ordenes, f, ensure_ascii=False, indent=1)
            os.replace(tmp, ruta)
        except OSError as e:
            print("director-nube: no pude pedir reapertura en %s: %s" % (nombre, e), flush=True)


def reclamar_varadas_de_la_nube(runs_vivos):
    """Devuelve a `pendiente` lo que se prestó a la nube y allí ya no lo hace nadie.

    (2026-09-22) Ver `repartir_nube.reclamar_varadas`. Esto es la mitad impura: leer el
    progreso, aplicar la regla y escribirlo. Se hace en cada pasada del director porque
    justo esto —una cadena colgando de dos tareas varadas— es lo que Alex ve como «5
    listas y ningún agente», y arreglarlo a mano cada vez no es un sistema.

    (2026-10-21, MEDIDO) Con casi siempre ALGÚN run vivo —de otra cola—, 43 tareas
    llevaban horas en «reasignada · nube» con su run terminado en «failure» y cero
    commits: la reclamación solo salía con CERO runs y el préstamo se volvía traspaso.
    Ahora se construye `ids_vivos` con los ids de las colas de los runs en marcha (del
    resumen que acaba de medir `agentes_nube`, que trae `cola` por run) y `colas_jovenes`
    con las `cola-nube-*.json` de menos de 30 min. Si un run vivo no dice su cola —o su
    cola no se lee—, NO se devuelve nada en esta pasada: mejor esperar un ciclo que
    devolver lo que alguien está haciendo. Envíos y veredictos, como hoy.
    """
    ruta = os.path.join(RAIZ, "starseed_memory_root", "olas", "progreso.json")
    try:
        with open(ruta, encoding="utf-8") as f:
            progreso = json.load(f)
    except (OSError, ValueError):
        return []
    tareas = progreso.get("tareas") if isinstance(progreso, dict) and "tareas" in progreso else progreso
    if not isinstance(tareas, dict):
        return []
    resumen = _ULTIMO_RESUMEN[0] if _ULTIMO_RESUMEN else None
    if resumen is None:
        # La medición falló: «0 runs» no es un dato, es no saber. No se devuelve nada.
        return []
    runs = [r for r in ((resumen or {}).get("runs") or []) if isinstance(r, dict)]
    # Cada run vivo debe decir qué cola lleva. Si lo medido no coincide con lo que puedo
    # enumerar, no lo sé entero: no se devuelve nada.
    if runs_vivos > 0 and len(runs) != runs_vivos:
        return []
    ids_vivos = set()
    for r in runs:
        ids = ids_de_una_cola(r.get("cola"))
        if ids is None:
            return []
        ids_vivos |= ids
    jovenes = ids_de_colas_jovenes(os.path.join(RAIZ, "enjambre", "colas"), time.time())
    ids = RN.reclamar_varadas(tareas, runs_vivos, ids_vivos=ids_vivos, colas_jovenes=jovenes)
    if not ids:
        return []
    ordenar_reapertura_en_colas_vivas(ids)
    # (2026-09-24) Con cuántas veces se mandó y con lo que dijo la nube: si ya van tres,
    # a «Bloqueadas» con el motivo, no otra vez a «pendiente» (y otra vez a la nube).
    # (2026-10-05) Con las reaperturas descontadas: la misma cuenta que usa el reparto.
    envios = RN.envios_vigentes(os.path.join(RAIZ, "enjambre", "colas"), time.time())
    nuevas = RN.devolver_a_pendiente(tareas, ids, time.strftime("%Y%m%d"),
                                     envios=envios, veredictos=veredictos_del_ultimo_run(ids))
    if isinstance(progreso, dict) and "tareas" in progreso:
        progreso["tareas"] = nuevas
        salida = progreso
    else:
        salida = nuevas
    tmp = ruta + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(salida, f, ensure_ascii=False, indent=1)
        os.replace(tmp, ruta)
    except OSError:
        return []
    return ids


#: (CAP1026B) El progreso de un run TERMINADO no cambia: se guarda aquí y no se vuelve a descargar.
VEREDICTOS_CACHE = os.path.expanduser("~/.starseed/nube-veredictos")
#: Cuántos runs terminados se miran (el que llevó la tarea casi nunca es el último) y cuántos se
#: descargan como mucho por pasada (cada descarga son unos segundos de `gh run download`).
VEREDICTOS_RUNS = int(os.environ.get("STARSEED_NUBE_VEREDICTOS_RUNS", "16"))
DESCARGAS_POR_PASADA = 4


def _progreso_de_run(run, timeout=90):
    """{id: [estado, nota]} del progreso.json que subió un run TERMINADO, o None si no se pudo leer
    (un fallo no se guarda: se reintenta en otra pasada)."""
    import shutil
    import tempfile

    ruta = os.path.join(VEREDICTOS_CACHE, "%s.json" % run)
    try:
        with open(ruta, encoding="utf-8") as f:
            d = json.load(f)
        if isinstance(d, dict):
            return d
    except (OSError, ValueError):
        pass
    carpeta = tempfile.mkdtemp(prefix="nube-veredictos-")
    try:
        _sh(["gh", "run", "download", str(run), "-D", carpeta], timeout=timeout)
        datos, leido = {}, False
        for raiz, _dirs, archivos in os.walk(carpeta):
            if "progreso.json" not in archivos:
                continue
            try:
                with open(os.path.join(raiz, "progreso.json"), encoding="utf-8") as f:
                    prog = json.load(f)
            except (OSError, ValueError):
                continue
            leido = True
            for tid, e in (prog.items() if isinstance(prog, dict) else []):
                if isinstance(e, dict) and e.get("estado"):
                    datos[str(tid)] = [str(e.get("estado")), str(e.get("nota") or "")[:300]]
        if not leido:
            return None
        os.makedirs(VEREDICTOS_CACHE, exist_ok=True)
        with open(ruta + ".tmp", "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False)
        os.replace(ruta + ".tmp", ruta)
        return datos
    except Exception:
        return None
    finally:
        shutil.rmtree(carpeta, ignore_errors=True)


def veredictos_del_ultimo_run(ids, timeout=90):
    """{id: (estado, nota, run)} de lo que dijo la nube sobre esas tareas en sus últimos runs
    terminados (`VEREDICTOS_RUNS`), leído del artefacto que sube el workflow (progreso.json).
    Un «commit» de cualquiera de ellos gana (`repartir_nube.combinar_veredictos`). Nunca lanza: si
    no se puede leer, {} y se devuelven sin motivo, como antes.

    (2026-10-26, CAP1026B) Antes miraba SOLO el último run terminado: el que llevó la tarea casi
    nunca es ese, así que una tarea integrada en su rama volvía a «pendiente», se mandaba otra vez y
    `traer_nube` la veía «reasignada» y esperaba: AGF1023E, dos commits en dos runs y ninguno en main."""
    if not ids:
        return {}
    try:
        salida = _sh(["gh", "run", "list", "--workflow", "enjambre-nube.yml", "--status", "completed",
                      "-L", str(VEREDICTOS_RUNS), "--json", "databaseId", "--jq", ".[].databaseId"], timeout=60)
        runs = [x.strip() for x in salida.split() if x.strip().isdigit()]
        por_run, descargas = [], 0
        for run in runs:  # gh los da del más nuevo al más viejo
            en_cache = os.path.exists(os.path.join(VEREDICTOS_CACHE, "%s.json" % run))
            if not en_cache:
                if descargas >= DESCARGAS_POR_PASADA:
                    continue
                descargas += 1
            datos = _progreso_de_run(run, timeout=timeout)
            if datos:
                por_run.append((run, {k: tuple(v) for k, v in datos.items() if isinstance(v, (list, tuple))}))
        return RN.combinar_veredictos(por_run, ids)
    except Exception:
        return {}


def _cuenta_hoy():
    hoy = time.strftime("%Y-%m-%d")
    try:
        d = json.load(open(CUENTA, encoding="utf-8"))
    except Exception:
        d = {}
    return hoy, int(d.get(hoy, 0)), d


def _anotar():
    hoy, n, d = _cuenta_hoy()
    d[hoy] = n + 1
    os.makedirs(os.path.dirname(CUENTA), exist_ok=True)
    json.dump({k: v for k, v in sorted(d.items())[-14:]}, open(CUENTA, "w"))


def huellas_del_puente(modulos=None, directorio=None) -> dict:
    """{archivo: (mtime, tamaño)} de los módulos de `scripts/puente/` que este proceso ya cargó (él incluido).

    (2026-10-27, CAP1026Q) MEDIDO: este director vive horas en el mismo proceso (`KeepAlive`) y Python guarda
    cada `import` para siempre: arrancado a las 13:16, a las 22:37 seguía midiendo Cloudroom con el
    `contenedores_nube` de antes de CAP1026O («30 libres» con un tope del día de 6). Como el vigía de medidores
    (OPO1011), entre pasadas mira si cambió el código que ya cargó y, si cambió, se vuelve a ejecutar."""
    directorio = directorio or os.path.dirname(os.path.abspath(__file__))
    salida = {}
    for m in list((modulos if modulos is not None else sys.modules).values()):
        ruta = getattr(m, "__file__", None) or ""
        if not ruta.endswith(".py") or os.path.dirname(os.path.abspath(ruta)) != directorio:
            continue
        try:
            st = os.stat(ruta)
        except OSError:
            continue
        salida[os.path.abspath(ruta)] = (int(st.st_mtime), st.st_size)
    return salida


def codigo_cambiado(antes: dict, ahora: dict) -> list:
    """PURA. Los archivos ya cargados cuyo contenido cambió en disco (o desaparecieron)."""
    return sorted(r for r, h in (antes or {}).items() if (ahora or {}).get(r) != h)


def main():
    huellas = {}
    print("Director de la nube · cada %d s · %s agentes por job · tope %d agentes / %d lanzamientos al día%s"
          % (INTERVALO_S, TRABAJADORES, TOPE_AGENTES, tope_dia_por_capacidad(_jobs_del_lanzable(None)),
             " (fijado a mano)" if TOPE_DIA_FIJO else " (según capacidad; suelo %d)" % TOPE_DIA), flush=True)
    while True:
        try:
            _, hoy_n, _ = _cuenta_hoy()
            runs_vivos, agentes_vivos = medir_nube()
            acciones = vigilar_runs()
            for texto in acciones:
                print("[%s] %s" % (time.strftime("%H:%M"), texto), flush=True)
            if acciones:
                runs_vivos, agentes_vivos = medir_nube()
            devueltas = reclamar_varadas_de_la_nube(runs_vivos)
            if devueltas:
                print("[%s] devueltas de la nube a pendiente (allí no quedaba nadie): %s"
                      % (time.strftime("%H:%M"), ", ".join(devueltas)), flush=True)
            # El inventario MIDE la capacidad; el director ya no la supone. Si mañana se
            # abre Colab o Cloud Run, el tope sube solo y sin tocar este archivo.
            inv = inventario_de_contenedores()
            destino = elegir_contenedor(inv.get("contenedores"))
            res = inv.get("resumen") or {}
            trabajadores = str(destino["agentes_por_job"]) if destino else TRABAJADORES
            tope_agentes = int(res.get("agentes_tope") or TOPE_AGENTES)
            lanzar, motivo = decidir_lanzamiento(
                atraso(), runs_vivos, hoy_n, hay_claves=hay_claves(),
                tope_dia=tope_dia_por_capacidad(_jobs_del_lanzable(inv.get("contenedores"))),
                agentes_en_marcha=int(res.get("agentes_ahora") or agentes_vivos),
                trabajadores=trabajadores,
                tope_agentes=tope_agentes)
            if lanzar and not destino:
                lanzar, motivo = False, "ningún contenedor con sitio libre (%d usable(s) de %d)" % (
                    res.get("usables", 0), res.get("contenedores", 0))
            print("[%s] %s: %s%s" % (time.strftime("%H:%M"), "LANZO" if lanzar else "espero",
                                     motivo, (" → %s" % destino["servicio"]) if lanzar and destino else ""),
                  flush=True)
            if lanzar:
                # `_sh` se comía stderr y el código de salida, así que un lanzamiento que
                # abortaba se contaba como hecho: el 21 a las 22:05, 22:09 y 22:13 dijo
                # «LANZO» y GitHub no recibió un solo run. Ahora se mira el resultado, se
                # enseña el motivo y no se anota un lanzamiento que no lanzó nada.
                rc, salida = _sh_rc(
                    [sys.executable, os.path.join(RAIZ, "scripts", "puente", "nube-gh.py"),
                     "lanzar", "--tope", str(2 * int(trabajadores)),
                     "--trabajadores", trabajadores, "--minutos", MINUTOS,
                     # (2026-10-13, MEDIDO) Sin «--ceder» el reparto del director solo miraba lo que
                     # está FUERA de la tanda de la Mac (nada: la tanda lo tiene todo) y decía
                     # «0 tareas» con 404 de atraso y 18 cedibles: la nube solo recibía trabajo
                     # cuando alguien pulsaba «Buscar más capacidad». Misma cesión que el botón.
                     "--ceder"], timeout=300)
                print(salida.strip()[-500:], flush=True)
                if rc != 0:
                    print("[%s] el lanzamiento FALLÓ (rc=%d): no lo cuento como lanzado"
                          % (time.strftime("%H:%M"), rc), flush=True)
                else:
                    _anotar()
                    medir_nube()
        except Exception as e:
            print("director-nube: %s: %s" % (type(e).__name__, e), flush=True)
        # (CAP1026Q) Código nuevo en algo que ya importó: se vuelve a ejecutar (mismo PID para launchd, mismo
        # python con su permiso de disco) y la próxima pasada ya mide y decide con él.
        ahora = huellas_del_puente()
        cambiados = codigo_cambiado(huellas, ahora) if huellas else []
        if cambiados:
            print("[%s] código nuevo en %s: me recargo" % (time.strftime("%H:%M"), ", ".join(
                os.path.basename(c) for c in cambiados[:6])), flush=True)
            os.execv(sys.executable, [sys.executable] + sys.argv)
        huellas = {**ahora, **{r: h for r, h in huellas.items() if r not in ahora}}
        time.sleep(INTERVALO_S)


if __name__ == "__main__":
    sys.exit(main() or 0)
