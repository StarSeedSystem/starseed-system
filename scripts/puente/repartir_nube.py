#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Lógica pura del reparto a la nube: elegir el atraso y marcarlo.

El atraso candidato es una tarea que (1) no está en main, (2) no está cerrada
ni viva en el progreso y (3) no pertenece a la ola que corre ahora mismo; la
ola actual se queda en la Mac. Está mal invertir en reintentar en local lo que
el estado ya declaró agotado (`fallo*`) o innecesario (`sin_cambios`) y lo que
nunca se tocó: eso es justo lo que la nube puede hacer gratis con LLM7.
"""

import json
import os
import re
import time

from vigilante_logica import id_en_asuntos, sucesora_integrada

#: (2026-10-03) Antes se clavaba «llm7/minimax-m2.7» a TODA tarea de la nube: llm7 está
#: caído desde el 09-09 y la tarea gastaba su primer intento (6+ min, medido en el run
#: 36712114201) en un modelo que no escribía. Vacío = sin modelo clavado: el orquestador de
#: la nube usa su rotación por mérito (cabeza: gemini-3.6-flash, kimi-k3, deepseek-v4-pro).
MODELO_NUBE = ""
#: (2026-09-22) «pendiente» FALTABA, y era el último candado de la nube. Con solo estados
#: de fallo aquí, a los contenedores solo podía ir lo que YA se había roto en la Mac:
#: trabajo nuevo, jamás. Medido esta noche, con doce huecos libres: la Mac cogió W1,
#: LCOMPA y AG1, se quedó 35 minutos en «esperando proveedor» sin escribir una línea, y
#: la nube no pudo cogerlas —primero por estar «en_curso», y al soltarlas, por estar
#: «pendiente»—. Alex lo preguntó tres veces: «¿y los de los demás contenedores?».
#: Una tarea pendiente es exactamente lo que un contenedor libre debería poder coger.
ESTADOS_REPARTIBLES = {None, "", "pendiente", "sin_cambios", "fallo", "fallo_tests", "fallo_tsc"}

# (2026-09-21) En la nube NO HAY NADIE que apruebe: solo sobrevive lo que pasa las
# cuatro puertas solo. Lo que falla ahi no falla por poco: falla TARDE, despues de
# 40-60 min de agente. Anoche cayeron NE1c (3 archivos), R6b (6) y R7b (9) y las tres
# por lo mismo: el agente no llego a tocarlos todos. Cuantos mas archivos pide una
# tarea, mas probable es que se quede a medias, y a medias en la nube es a la basura.
# Las grandes se quedan en la Mac, donde hay revisor. Y entre las que caben, primero
# las de un solo archivo.
MAX_ARCHIVOS_NUBE = 3

#: (2026-09-24, MEDIDO) Alex: «cuando terminan los agentes vuelven a entrar 4 más pero no
#: dice que haya más listas para trabajar, no sé de qué olas son». Eran SIEMPRE las mismas
#: tres —CU3br (ola 362, rescate de accesos) y p318Jb/p318Jc (Ola 318, reintentos)—,
#: mandadas a la nube 22 veces seguidas entre las 04:03 y las 14:07, cuatro agentes cada
#: vez. En la nube CU3br salía «rechazada» (no tocó los archivos declarados) y las otras
#: dos «bloqueadas» (p318I «(?)»: está en main desde el 13, pero la nube no lo sabe); el
#: veredicto no volvía a la Mac, el run acababa, `reclamar_varadas` las devolvía a
#: «pendiente» y el director las volvía a mandar. Tres envíos sin integrar bastan para
#: saber que repetir no sirve: a partir de ahí van a «Bloqueadas», donde se ven y se
#: pueden reintentar con un cambio.
MAX_ENVIOS_NUBE = 3


def ids_de_la_tanda_viva(args_procesos, olas):
    """Ids de la cola que está leyendo AHORA el orquestador de la Mac (por sus argumentos).

    (2026-10-08, medido) RM6b estaba en la tanda viva de la Mac (Genesis mete ahí cada
    reparación) y el reparto la mandó también a la nube: dos agentes rehaciendo la misma
    tarea y su progreso pisado a «reasignada · nube» mientras la Mac la escribía. El filtro
    «ola-actual» no la veía porque una cola `cola-auto-*` no lleva número de ola. Lo que ya
    está en la tanda de la Mac no se reparte. `args_procesos`: la salida de `ps -axo args=`."""
    import json as _json
    import os as _os

    ids = set()
    for linea in str(args_procesos or "").splitlines():
        if "starseed-enjambre.py" not in linea or "grep" in linea:
            continue
        for trozo in linea.split():
            nombre = _os.path.basename(trozo)
            if not (trozo.endswith(".json") and nombre.startswith("cola-")):
                continue
            ruta = trozo if _os.path.isabs(trozo) else _os.path.join(olas, nombre)
            try:
                with open(ruta, encoding="utf-8") as f:
                    d = _json.load(f)
            except (OSError, ValueError):
                continue
            lista = d if isinstance(d, list) else (d or {}).get("tareas") or []
            ids.update(str(t.get("id")) for t in lista if isinstance(t, dict) and t.get("id"))
    return ids


#: (2026-10-10, CAP1010) Rondas de trabajo que la Mac se guarda de su propia tanda antes de
#: ceder el resto a otro medio: con 3 trabajadores, sus 6 listas siguientes.
RONDAS_RESERVA_MAC = 2
#: (2026-10-13) Una cadena cedible cabe ENTERA en un job de la nube: 3 trabajadores × 2 tareas
#: (`buscar_capacidad.TAREAS_POR_RUN`). Con 4, las cadenas de 5-6 tareas se quedaban en una Mac
#: que con la memoria en aviso solo corre 2 agentes a la vez.
MAX_CADENA_CEDIBLE = 6
#: Estados con los que una tarea ya no espera a nadie ni nadie la espera a ella.
_CERRADAS = ("commit", "sustituida", "descartada", "rechazada", "informe")


def colas_de_la_tanda_viva(args_procesos, olas):
    """[(nombre_de_la_cola, [ids en su orden])] de cada orquestador vivo (por sus argumentos).
    Lo mismo que `ids_de_la_tanda_viva`, pero sabiendo de qué cola es cada id: una orden
    `soltar` va al archivo de control de ESA cola. Nunca lanza."""
    import json as _json
    import os as _os

    salida, vistas = [], set()
    for linea in str(args_procesos or "").splitlines():
        if "starseed-enjambre.py" not in linea or "grep" in linea:
            continue
        for trozo in linea.split():
            nombre = _os.path.basename(trozo)
            if not (trozo.endswith(".json") and nombre.startswith("cola-")) or nombre in vistas:
                continue
            ruta = trozo if _os.path.isabs(trozo) else _os.path.join(olas, nombre)
            try:
                with open(ruta, encoding="utf-8") as f:
                    d = _json.load(f)
            except (OSError, ValueError):
                continue
            lista = d if isinstance(d, list) else (d or {}).get("tareas") or []
            vistas.add(nombre)
            salida.append((nombre, [str(t.get("id")) for t in lista if isinstance(t, dict) and t.get("id")]))
    return salida


def esperadas_por_otras(colas, progreso, solo_de=None):
    """PURA: ids de los que depende alguna tarea que aún no se cerró. Ceder una de esas a otro
    medio dejaría su cadena de la Mac esperando a un medio que quizá no la entrega.

    `solo_de` (2026-10-13): cuenta solo a quien espera DESDE ese conjunto (la tanda de la Mac).
    Medido a las 15:40 (hora de la Mac): de 57 listas en la tanda, 43 las esperaba alguien que
    NO estaba en la tanda (tareas de otras colas que aún no están listas). Esas no se quedan
    varadas si la nube se lleva su dependencia: siguen pendientes en su cola y entran solas
    cuando la dependencia llega a main (`traer_nube.py`). Contarlas dejaba a la nube con 0
    elegibles y a MetaGenesis con 2 agentes."""
    solo_de = None if solo_de is None else {str(x) for x in solo_de}
    salida = set()
    for _nombre, tareas in colas or []:
        for t in tareas or []:
            if not isinstance(t, dict) or not t.get("id"):
                continue
            if solo_de is not None and str(t["id"]) not in solo_de:
                continue
            e = ((progreso or {}).get(str(t["id"])) or {})
            if isinstance(e, dict) and e.get("estado") in _CERRADAS:
                continue
            deps = t.get("depende") or t.get("depende_de") or []
            salida.update(str(d) for d in (deps if isinstance(deps, list) else [deps]) if d)
    return salida


def cedibles_de_la_tanda(tanda_ids, listas_mac, tope_mac, esperadas=(), rondas=RONDAS_RESERVA_MAC):
    """PURA. Ids de la tanda viva de la Mac que otro medio puede coger SIN quitarle trabajo.

    (2026-10-10, CAP1010, medido a las 15:07) La tanda viva de la Mac tenía 118 tareas, 32
    listas, y la Mac trabajaba 3 a la vez (su tope con 8 GB). Como `ids_de_la_tanda_viva`
    deja en la Mac TODO lo que está en su tanda, el reparto a la nube y al A1 daba «0 tareas»
    y los dos medios se quedaban parados con trabajo de sobra; el botón decía «lanzo 2 jobs»
    y contaba dos jobs fantasma 5 minutos. La Mac se queda las `tope_mac × rondas` primeras
    listas de su tanda (en SU orden de prioridad, `listas_mac`); de las demás listas, se ceden
    las que ninguna otra tarea espera (`esperadas`)."""
    tanda = set(str(t) for t in tanda_ids or ())
    en_tanda = [str(t) for t in listas_mac or () if str(t) in tanda]
    reserva = max(0, int(tope_mac or 0)) * max(1, int(rondas or 1))
    esperadas = set(str(t) for t in esperadas or ())
    return [t for t in en_tanda[reserva:] if t not in esperadas]


def cadenas_cedibles(tareas_tanda, listas_mac, tope_mac, esperadas_por,
                     rondas=RONDAS_RESERVA_MAC, max_cadena=MAX_CADENA_CEDIBLE):
    """PURA. Cadenas completas (cabeza esperada + sus dependientes transitivos) de la tanda de
    la Mac que otro medio puede llevarse ENTERAS sin romper el orden. Determinista: el orden
    es el de `listas_mac` (la prioridad de la Mac).

    (2026-10-11, CAPC1011A, medido a las 13:55) La tanda viva (`cola-auto-1009-233520`, 193
    tareas) tenía 40 listas; la Mac trabaja 2-3 a la vez (8 GB) y se quedaba 32, porque
    `cedibles_de_la_tanda` solo cede las que NINGUNA tarea espera. Resultado: el A1 («no hay
    atraso que pueda ir al A1») y Actions (tope 6 jobs) parados con 26 listas esperando en la
    Mac. La regla existe por algo real: ceder solo la cabeza deja `reasignada` lo cedido y a
    sus dependientes, varados. La solución es ceder la cadena ENTERA. Una cadena es cedible
    solo si: (a) tiene como mucho `max_cadena` tareas; (b) ningún miembro depende de algo
    abierto (presente en la tanda) fuera de la cadena; (c) ningún miembro es esperado por una
    tarea de fuera de la cadena; (d) ningún miembro está en la reserva de la Mac
    (`tope_mac × rondas` primeras listas)."""
    tareas = {str(k): v for k, v in (tareas_tanda or {}).items() if isinstance(v, dict)}
    en_tanda = [str(t) for t in listas_mac or ()]
    reserva = set(en_tanda[: max(0, int(tope_mac or 0)) * max(1, int(rondas or 1))])
    esperadas_por = {str(k): set(map(str, v or ())) for k, v in (esperadas_por or {}).items()}
    salida, vistas = [], set()
    for cabeza in en_tanda:
        if cabeza in reserva or cabeza in vistas or cabeza not in esperadas_por:
            continue
        cadena, pend, vistas_cadena = [cabeza], [cabeza], {cabeza}
        while pend:
            for m in (esperadas_por.get(pend.pop()) or ()):
                if m in tareas and m not in vistas_cadena:
                    vistas_cadena.add(m)
                    cadena.append(m)
                    pend.append(m)
        miembros = set(cadena)
        if len(cadena) > max_cadena or any(m in reserva for m in cadena):
            continue
        if any(x not in miembros for m in cadena for x in esperadas_por.get(m, ())):
            continue  # (c) alguien de fuera de la cadena espera a un miembro
        # (b) `tareas.get(m) or {}`: con listas desincronizadas un miembro puede no estar
        # en tareas_tanda y un acceso directo reventaba el reparto entero en producción.
        if any(str(d) in tareas and str(d) not in miembros
               for m in cadena
               for d in (lambda x: x if isinstance(x, list) else [x])(
                   (tareas.get(m) or {}).get("depende") or (tareas.get(m) or {}).get("depende_de") or [])
               if d):
            continue  # (b) depende de algo abierto fuera de la cadena
        # Solo se marcan como vistas las cadenas que SÍ se ceden: una cadena descartada
        # aquí no puede impedir que otra cabeza posterior incluya a sus miembros.
        vistas |= vistas_cadena
        salida.append(cadena)  # orden de dependencias: cabeza primero
    return salida


def cedibles_y_lote(tanda, estado_mac, colas, progreso, ajenas=()):
    """PURA. (cedibles, lote) del reparto con cesión de la tanda de la Mac.

    (2026-10-12, CAPC1011Bc, medido el 11 a las 21:15) Con solo `cedibles_de_la_tanda`
    la tanda de la Mac tenía 202 tareas, se quedaba 27 y cedía 1: GitHub Actions y el A1
    sin trabajo, porque «lo cedible» era solo lo que NADIE esperaba y casi todo el atraso
    cuelga de alguien. Aquí se unen las sueltas (`cedibles_de_la_tanda`) con los miembros
    de `cadenas_cedibles` (cabeza esperada + dependientes de la tanda, viajan enteras).
    `lote` = solo los miembros de cadenas: se pasa como `mismo_lote` a `elegir`, que les
    conserva el `depende` interno para que el orquestador de allí respete su orden."""
    ajenas = {str(x) for x in ajenas or ()}
    tanda = {str(t) for t in tanda or ()}
    estado_mac = estado_mac or {}
    listas_mac = [str(t) for t in (estado_mac.get("listas") or [])]
    tope_mac = estado_mac.get("tope") or 0
    # Solo frena lo que espera una tarea que SE QUEDA en la tanda de la Mac (2026-10-13).
    esperadas = esperadas_por_otras(colas, progreso, solo_de=tanda)
    sueltas = [t for t in cedibles_de_la_tanda(tanda, listas_mac, tope_mac, esperadas)
               if t not in ajenas]
    # Tareas de la tanda con su dict (de las colas) y quién espera a quién DENTRO de la
    # tanda: `esperadas_por` de `cadenas_cedibles` son los dependientes directos de cada id.
    tareas_tanda = {}
    for _nombre, ts in colas or []:
        for t in ts or []:
            if isinstance(t, dict) and t.get("id") and str(t["id"]) in tanda:
                tareas_tanda.setdefault(str(t["id"]), t)
    esperadas_por = {}
    for tid, t in tareas_tanda.items():
        deps = t.get("depende") or t.get("depende_de") or []
        for d in (deps if isinstance(deps, list) else [deps]):
            if d:
                esperadas_por.setdefault(str(d), set()).add(tid)
    lote = set()
    for cadena in cadenas_cedibles(tareas_tanda, listas_mac, tope_mac, esperadas_por):
        lote.update(m for m in cadena if m not in ajenas)
    cedibles, vistas = [], set()
    for tid in list(sueltas) + sorted(lote):
        if tid not in vistas and tid not in ajenas:
            vistas.add(tid)
            cedibles.append(tid)
    return cedibles, lote


def sin_cadenas_partidas(elegidas, lote, colas):
    """PURA. `elegidas` sin las cadenas del `lote` que no van ENTERAS en este envío.

    (2026-10-13) Mandar la mitad de una cadena deja `reasignada` la cabeza y varados los
    dependientes. Antes se quitaba TODO el lote si faltaba un solo miembro de cualquier
    cadena: una cadena que no cabía dejaba sin envío a todas las demás. Ahora se mira cadena
    por cadena: las cadenas son las componentes conexas del lote por `depende` (en
    `cadenas_cedibles` ningún miembro depende ni es esperado por nadie de fuera)."""
    lote = {str(x) for x in lote or ()}
    if not lote:
        return list(elegidas or [])
    padre = {x: x for x in lote}

    def raiz(x):
        while padre[x] != x:
            padre[x] = padre[padre[x]]
            x = padre[x]
        return x

    for _nombre, tareas in colas or []:
        for t in tareas or []:
            tid = str((t or {}).get("id") or "") if isinstance(t, dict) else ""
            if tid not in lote:
                continue
            deps = t.get("depende") or t.get("depende_de") or []
            for d in (deps if isinstance(deps, list) else [deps]):
                if str(d) in lote:
                    padre[raiz(tid)] = raiz(str(d))
    elegidos = {str(t.get("id")) for t in elegidas or []}
    partidas = set()
    componentes = {}
    for x in lote:
        componentes.setdefault(raiz(x), set()).add(x)
    for miembros in componentes.values():
        if (miembros & elegidos) and not miembros <= elegidos:
            partidas |= miembros
    return [t for t in elegidas or [] if str(t.get("id")) not in partidas]


def sin_lo_de_la_mac(colas, tanda_ids, cedibles=(), ajenas=()):
    """PURA: las colas sin lo que se queda en la tanda viva de la Mac (todo menos lo cedible) y sin
    lo que ya trabaja OTRO medio (`ajenas`: lo que MetaGenesis prestó al A1, por ejemplo)."""
    ajenas = set(str(t) for t in ajenas or ())
    fuera = (set(str(t) for t in tanda_ids or ()) - set(str(t) for t in cedibles or ())) | ajenas
    if not fuera:
        return list(colas or [])
    return [(n, [t for t in ts if str((t or {}).get("id")) not in fuera]) for n, ts in colas or []]


class CerrojoReparto:
    """Un solo repartidor a la vez (2026-10-13, medido). El reparto a la nube (21:56:41) y el
    préstamo al A1 (21:56:59) leyeron el mismo progreso y se llevaron IMG1011F, IMG1011G e
    IMG1011I los DOS: el mismo trabajo en dos medios. Quien reparte toma este cerrojo desde que
    lee el progreso hasta que lo marca. Mismo directorio que los demás cerrojos del puente."""

    def __init__(self, espera_s=300, ruta=None):
        self.ruta = ruta or os.path.expanduser("~/.starseed/cerrojos/reparto.lock")
        self.espera_s, self.f = espera_s, None

    def __enter__(self):
        import fcntl

        os.makedirs(os.path.dirname(self.ruta), exist_ok=True)
        self.f = open(self.ruta, "a")
        t0 = time.time()
        while True:
            try:
                fcntl.flock(self.f, fcntl.LOCK_EX | fcntl.LOCK_NB)
                return self
            except BlockingIOError:
                if time.time() - t0 >= self.espera_s:
                    self.f.close()
                    raise TimeoutError("otro reparto lleva más de %d s en marcha" % self.espera_s)
                time.sleep(1)

    def __exit__(self, *exc):
        import fcntl

        try:
            fcntl.flock(self.f, fcntl.LOCK_UN)
        finally:
            self.f.close()
        return False


#: Memoria del nodo de MetaGenesis de ESTA máquina (sus préstamos a otros medios).
MEMORIA_METAGENESIS = os.path.expanduser("~/.starseed/nodo-metagenesis/memoria.json")
#: Lo mismo que `GRACIA_ASIGNACION_S` del nodo: un préstamo de hace menos de 6 h sigue vivo.
GRACIA_PRESTAMO_S = 6 * 3600


def prestadas_vigentes(memoria, ahora_ts, gracia_s=GRACIA_PRESTAMO_S):
    """PURA: ids que el líder de MetaGenesis prestó a otro medio hace menos de `gracia_s`.

    (2026-10-10, CAP1010, medido) MetaGenesis prestó al A1 a las 15:13 S1010-TU-LL1cobj,
    RTOPO1011T1b, S1010-EV-WIDGET y S1010-ES1 sin marcarlas en progreso.json, y la primera
    cesión de la tanda de la Mac mandó tres de ellas también a la nube: el mismo trabajo en dos
    medios. Lo prestado no se cede ni se reparte."""
    salida = set()
    for p in ((memoria or {}).get("prestamos") or []) if isinstance(memoria, dict) else []:
        if isinstance(p, dict) and ahora_ts - float(p.get("ts") or 0) < gracia_s:
            salida.update(str(i) for i in p.get("ids") or [])
    return salida


def leer_prestadas(ahora_ts=None, ruta=None):
    """`prestadas_vigentes` de la memoria de MetaGenesis en disco. Nunca lanza."""
    try:
        with open(ruta or MEMORIA_METAGENESIS, encoding="utf-8") as f:
            memoria = json.load(f)
    except (OSError, ValueError):
        return set()
    return prestadas_vigentes(memoria, time.time() if ahora_ts is None else ahora_ts)


def ordenes_soltar(cedidas, colas_mac, donde, quien="capacidad", t=None):
    """PURA: {nombre_cola_mac: {id: orden}} para que el orquestador de la Mac suelte lo que se
    llevó otro medio (la misma orden «soltar» que «Reasignar → otro servidor» de Genesis)."""
    t = t or time.strftime("%Y-%m-%d %H:%M:%S")
    cedidas = set(str(x) for x in cedidas or ())
    salida = {}
    for nombre, ids in colas_mac or []:
        for tid in ids:
            if tid in cedidas:
                salida.setdefault(nombre, {})[tid] = {"accion": "soltar", "donde": donde, "quien": quien, "t": t}
    return salida


def soltar_en_la_mac(ordenes, olas, cerrojos=None):
    """Escribe las órdenes `soltar` en `olas/control-<cola>.json` con el MISMO flock que el
    orquestador (`~/.starseed/cerrojos/control-control-<cola>.json.lock`). → ids escritos."""
    import fcntl
    import json as _json
    import os as _os

    cerrojos = cerrojos or _os.path.expanduser("~/.starseed/cerrojos")
    hechos = []
    for nombre, por_id in (ordenes or {}).items():
        if not por_id:
            continue
        ruta = _os.path.join(olas, "control-" + nombre)
        _os.makedirs(cerrojos, exist_ok=True)
        with open(_os.path.join(cerrojos, "control-" + _os.path.basename(ruta) + ".lock"), "a") as cer:
            fcntl.flock(cer, fcntl.LOCK_EX)
            try:
                try:
                    with open(ruta, encoding="utf-8") as f:
                        actuales = _json.load(f)
                except (OSError, ValueError):
                    actuales = {}
                actuales = actuales if isinstance(actuales, dict) else {}
                actuales.update(por_id)
                tmp = ruta + ".tmp-%d" % _os.getpid()
                with open(tmp, "w", encoding="utf-8") as f:
                    _json.dump(actuales, f, ensure_ascii=False, indent=1)
                _os.replace(tmp, ruta)
                hechos += list(por_id)
            finally:
                fcntl.flock(cer, fcntl.LOCK_UN)
    return hechos


def leer_colas_nube(carpeta, ahora_ts, dias=2):
    """[(nombre, ids)] de las `cola-nube-AAAAMMDD-HHMM*.json` de los últimos `dias` días.
    La única función con disco de este módulo: el resto sigue siendo puro. Nunca lanza."""
    import datetime as _dt
    import json as _json
    import os as _os

    limite = _dt.datetime.fromtimestamp(ahora_ts) - _dt.timedelta(days=dias)
    salida = []
    try:
        nombres = sorted(_os.listdir(carpeta))
    except OSError:
        return salida
    for nombre in nombres:
        m = re.match(r"cola-nube-(\d{8})-(\d{4})", nombre)
        if not m or not nombre.endswith(".json"):
            continue
        try:
            cuando = _dt.datetime.strptime(m.group(1) + m.group(2), "%Y%m%d%H%M")
        except ValueError:
            continue
        if cuando < limite:
            continue
        try:
            with open(_os.path.join(carpeta, nombre), encoding="utf-8") as f:
                d = _json.load(f)
        except (OSError, ValueError):
            continue
        tareas = d.get("tareas", []) if isinstance(d, dict) else d
        salida.append((nombre, [t.get("id") for t in tareas if isinstance(t, dict) and t.get("id")]))
    return salida


def envios_por_tarea(colas_nube):
    """PURA: cuántas veces se mandó cada tarea a la nube. `colas_nube`: [(nombre, ids)] de
    las colas `cola-nube-*` recientes (quien llama decide cuáles cuentan)."""
    cuenta = {}
    for _nombre, ids in colas_nube or []:
        for tid in set(str(i) for i in ids or []):
            cuenta[tid] = cuenta.get(tid, 0) + 1
    return cuenta


def es_privada(tarea):
    """PURA. (2026-10-03) Lo marcado privado (lente seguridad-privacidad de los sueños) no
    sale de la Mac: SP09294 se repartió a la nube tres veces porque aquí nadie lo miraba."""
    if not isinstance(tarea, dict):
        return False
    if tarea.get("privado"):
        return True
    return str(tarea.get("prompt") or "").lstrip().startswith("🔒 PRIVADO")


def _n_archivos(tarea):
    return len(tarea.get("archivos") or [])


#: Estados en los que una dependencia ya esta hecha y no frena a nadie.
_HECHAS = ("commit", "hecho")


def dependencias_pendientes(tarea, progreso=None, asuntos_main="", mismo_lote=()):
    # (2026-10-11, CAPC1011A) `mismo_lote`: ids que viajan JUNTOS a otro medio (una cadena
    # cedida entera). Una dependencia dentro del lote no frena: el orquestador de allí
    # respeta el orden dentro del lote. Sin `mismo_lote`, el comportamiento no cambia.
    lote = set(str(x) for x in mismo_lote or ())
    """Las dependencias de esta tarea que AUN NO estan integradas. PURA.

    (2026-09-21) Nacio como «¿tiene dependencias?» y descartaba todas: la nube hacia
    checkout de `origin/main` y ahi se quedaba, sin ver lo que la Mac tenia sin publicar.
    Medido en el run 35568545557: de seis tareas, CUATRO se bloquearon por dependencias
    que en la nube no existian. Treinta y seis minutos de runner para un commit.

    (2026-09-22) Esa razon YA NO VALE, y por eso esto cambia. Desde que el lanzamiento
    empuja la cola y el codigo a su propia rama y dispara el workflow con esa referencia,
    el runner ve EXACTAMENTE lo mismo que la Mac, publicado o no. Mantener el descarte
    costaba la nube entera: con doce huecos libres, casi todo el atraso tiene alguna
    dependencia y a la nube no iba nunca nada. Ahora solo se descarta lo que espera a algo
    que de verdad no esta hecho.
    """
    progreso = progreso or {}
    fuera = []
    for dep in tarea.get("depende") or tarea.get("depende_de") or []:
        tid = str(dep or "").strip()
        if not tid or tid in lote:
            continue
        entrada = progreso.get(tid)
        estado = entrada.get("estado") if isinstance(entrada, dict) else None
        if estado in _HECHAS:
            continue
        if asuntos_main and id_en_asuntos(tid, asuntos_main):
            continue
        # (2026-10-11) La MISMA regla que el vigilante (`seleccionar_pendientes`): una sucesora
        # integrada cumple la dependencia. Sin esto la Mac cedía PM1010F2E y CPA1007Kb-d2
        # («nadie las espera», su dependencia la cumplían PM1010F0Ab y CPA1007Kb-d1b) y aquí
        # salían «esperan a otra tarea»: la nube con 0 jobs y cuatro tareas listas en el limbo.
        if sucesora_integrada(tid, progreso, asuntos_main) is not None:
            continue
        fuera.append(tid)
    return fuera


def _tiene_dependencias(tarea):
    """Compatibilidad: ¿declara alguna dependencia, esté hecha o no?"""
    deps = tarea.get("depende") or tarea.get("depende_de") or []
    if isinstance(deps, str):
        deps = [deps]
    return bool(deps)


def numero_ola(texto):
    """Número de ola: `Ola 317` o guarismo suelto; None si no hay."""
    m = re.search(r"Ola (\d+)", texto, re.IGNORECASE) or re.search(r"(\d+)", texto)
    return int(m.group(1)) if m else None


#: (2026-10-05) Por qué una tarea NO va a la nube, en el orden en que se comprueba. El botón
#: «Buscar más capacidad» de Genesis enseña este recuento en vez de un «0 tareas» sin explicar.
MOTIVOS_FUERA = (
    ("ola-actual", "son de la ola que corre en la Mac"),
    ("estado", "no están pendientes ni fallidas"),
    ("en-main", "ya están en main"),
    ("grande", "piden más de %d archivos y se quedan en la Mac, donde hay revisor" % MAX_ARCHIVOS_NUBE),
    ("espera", "esperan a otra tarea"),
    ("agotada", "ya se mandaron %d veces sin integrarse" % MAX_ENVIOS_NUBE),
    ("privada", "son privadas y no salen de la Mac"),
)


_SUCESOR = re.compile(r"[A-Z0-9][b-z]$")


def base_cadena(tid):
    """PURA: el id base de una cadena de reintentos o reparaciones (`RSC1006Qe` → `RSC1006Q`)."""
    tid = str(tid or "")
    return tid[:-1] if _SUCESOR.search(tid) else tid


def envios_de_cadena(tid, envios):
    """PURA: envíos a la nube de TODA la cadena de `tid`. (2026-10-06) Contarlos por id dejaba que
    cada reparación (`Xb`, `Xc`…) estrenara tres envíos nuevos: RSC1006Q fue a la nube 5 veces
    seguidas por el mismo fallo."""
    base = base_cadena(tid)
    return sum(int(n or 0) for k, n in (envios or {}).items() if base_cadena(k) == base)


def motivo_fuera(tarea, progreso, asuntos_main, n_ola_actual, envios=None,
                 max_archivos=MAX_ARCHIVOS_NUBE, max_envios=MAX_ENVIOS_NUBE, mismo_lote=()):
    """PURA. None si la nube puede coger esta tarea; si no, la clave de MOTIVOS_FUERA del
    primer filtro que la deja fuera. Es EL filtro de `elegir`: los dos no pueden discrepar."""
    tid = str(tarea.get("id"))
    n_ola = numero_ola(str(tarea.get("ola") or ""))
    if n_ola_actual is not None and n_ola is not None and n_ola == n_ola_actual:
        return "ola-actual"
    entrada = (progreso or {}).get(tid)
    estado = entrada.get("estado") if isinstance(entrada, dict) else None
    if estado not in ESTADOS_REPARTIBLES:
        return "estado"
    if id_en_asuntos(tid, asuntos_main):
        return "en-main"
    if _n_archivos(tarea) > max_archivos:
        return "grande"
    if dependencias_pendientes(tarea, progreso, asuntos_main, mismo_lote):
        return "espera"
    if envios_de_cadena(tid, envios) >= max_envios:
        return "agotada"
    if es_privada(tarea):
        return "privada"
    return None


def elegir(colas, progreso, asuntos_main, ola_actual, tope=20, max_archivos=MAX_ARCHIVOS_NUBE,
           envios=None, max_envios=MAX_ENVIOS_NUBE, mismo_lote=()):
    """Hasta `tope` candidatas, deduplicadas, con modelo nube y ordenadas por tamano.

    Se descartan las de mas de `max_archivos` archivos declarados —esas necesitan un
    revisor y la nube no lo tiene— y las que DEPENDEN de otra tarea, porque la nube
    solo ve `origin/main` y no puede saber si la dependencia esta hecha en la Mac.
    Entre las que quedan van primero las de un solo archivo, que son las que de
    verdad llegan a commit. Si no queda ninguna, la nube no recibe nada ese ciclo
    — que es lo correcto, no un fallo. El filtro entero vive en `motivo_fuera`.
    """
    salida, vistas = [], set()
    n_actual = numero_ola(str(ola_actual)) if ola_actual else None
    for nombre, tareas in colas:
        for tarea in tareas:
            if not isinstance(tarea, dict) or not tarea.get("id"):
                continue
            tid = str(tarea["id"])
            if tid in vistas:
                continue
            if motivo_fuera(tarea, progreso, asuntos_main, n_actual, envios, max_archivos,
                            max_envios, mismo_lote):
                continue
            vistas.add(tid)
            candidata = dict(tarea)
            if MODELO_NUBE:
                candidata["modelo"] = MODELO_NUBE
            # (2026-09-24) Aquí TODAS sus dependencias están ya en main (si no, no se
            # elegiría), pero la nube arranca sin el progreso de la Mac: p318I está
            # integrada desde el 13 y allí salía «(?)», y la tarea se bloqueaba en cada run.
            # Lo que la Mac ya comprobó no se le pide comprobar otra vez.
            deps = candidata.get("depende") or candidata.get("depende_de") or []
            if deps:
                deps = list(deps) if isinstance(deps, list) else [deps]
                lote = set(str(x) for x in mismo_lote or ())
                en_lote = [d for d in deps if str(d) in lote]
                # (2026-10-11) Las dependencias que viajan en el mismo lote NO se vacían: el
                # orquestador de la nube o del A1 tiene que respetar su orden dentro del lote.
                hechas = [d for d in deps if str(d) not in lote]
                candidata["depende"] = en_lote
                candidata.pop("depende_de", None)
                if hechas:
                    candidata["dependencias_ya_en_main"] = hechas
            salida.append(candidata)
    # Estable: a igual numero de archivos manda el orden de las colas (la prioridad
    # que ya calcularon los directores). Solo se reordena por tamano.
    salida.sort(key=_n_archivos)
    return salida[:tope]


def clasificar(colas, progreso, asuntos_main, ola_actual, envios=None,
               max_archivos=MAX_ARCHIVOS_NUBE, max_envios=MAX_ENVIOS_NUBE, mismo_lote=()):
    """PURA. {"elegibles": [ids], <motivo>: [ids], ...} del trabajo que queda, en el orden de
    las colas. No cuenta lo cerrado ni lo que ya está en main (no es trabajo pendiente).

    `mismo_lote` (2026-10-13): las cadenas que la Mac cede ENTERAS (`cedibles_y_lote`). Sin él,
    sus dependientes salían «esperan a otra tarea» y el botón contaba 0 elegibles aunque el
    reparto sí las habría mandado: «Buscar más capacidad» decidía con otra regla que el reparto.

    Una «agotada» que con la cuenta a cero seguiría fuera por otra razón (privada, por
    ejemplo) sale con ESA razón: reabrirla no la llevaría a la nube."""
    elegidas = {str(t["id"]) for t in elegir(colas, progreso, asuntos_main, ola_actual, tope=10 ** 6,
                                              max_archivos=max_archivos, envios=envios,
                                              max_envios=max_envios, mismo_lote=mismo_lote)}
    n_actual = numero_ola(str(ola_actual)) if ola_actual else None
    salida, vistas = {"elegibles": []}, set()
    for _nombre, tareas in colas:
        for tarea in tareas:
            if not isinstance(tarea, dict) or not tarea.get("id"):
                continue
            tid = str(tarea["id"])
            if tid in vistas:
                continue
            vistas.add(tid)
            if tid in elegidas:
                salida["elegibles"].append(tid)
                continue
            motivo = motivo_fuera(tarea, progreso, asuntos_main, n_actual, envios, max_archivos, max_envios,
                                  mismo_lote)
            if motivo == "agotada":
                motivo = motivo_fuera(tarea, progreso, asuntos_main, n_actual, {}, max_archivos,
                                      max_envios, mismo_lote) or "agotada"
            if motivo in (None, "estado", "en-main"):
                continue
            salida.setdefault(motivo, []).append(tid)
    return salida


#: (2026-10-05) SEGUNDA OPORTUNIDAD EN LA NUBE. Medido a las 12:58: 12 tareas listas, la Mac
#: llena (3 de 3) y la nube con CERO elegibles, 16 de ellas solo por «tres envíos sin
#: integrarse». Y esos envíos no fallaron por la tarea: el run 37336355273 pasó DR0929-1 por
#: siete modelos y todos contestaron «saturado (429)» o «apartado por cuota». Reabrir una
#: tarea le devuelve UN envío (se descuenta de su cuenta); la historia de las colas no se toca
#: y el tope sigue mandando. {id: [marcas de tiempo]}.
REAPERTURAS_NUBE = os.path.expanduser("~/.starseed/nube-reaperturas.json")
#: Como la cuenta de envíos: lo de hace más de dos días ya no cuenta.
DIAS_REAPERTURAS = 2


def reaperturas_vigentes(datos, ahora_ts, dias=DIAS_REAPERTURAS):
    """PURA: {id: [ts, ...]} con solo las reaperturas de los últimos `dias` días."""
    limite = ahora_ts - dias * 86400
    salida = {}
    for tid, marcas in (datos or {}).items() if isinstance(datos, dict) else []:
        vivas = sorted(float(m) for m in (marcas or []) if isinstance(m, (int, float)) and m >= limite)
        if vivas:
            salida[str(tid)] = vivas
    return salida


def envios_efectivos(envios, reaperturas):
    """PURA: los envíos que cuentan contra MAX_ENVIOS_NUBE, una reapertura menos cada vez."""
    return {tid: max(0, int(n) - len((reaperturas or {}).get(tid) or []))
            for tid, n in (envios or {}).items()}


def leer_reaperturas(ahora_ts=None, ruta=None, dias=DIAS_REAPERTURAS):
    """Reaperturas vigentes del disco. Nunca lanza: sin archivo, ninguna."""
    try:
        with open(ruta or REAPERTURAS_NUBE, encoding="utf-8") as f:
            datos = json.load(f)
    except (OSError, ValueError):
        datos = {}
    return reaperturas_vigentes(datos, time.time() if ahora_ts is None else ahora_ts, dias)


def anotar_reaperturas(ids, ahora_ts=None, ruta=None):
    """Anota una reapertura para cada id (escritura atómica). Devuelve las vigentes."""
    ahora_ts = time.time() if ahora_ts is None else ahora_ts
    ruta = ruta or REAPERTURAS_NUBE
    datos = leer_reaperturas(ahora_ts, ruta)
    for tid in ids or []:
        datos.setdefault(str(tid), []).append(ahora_ts)
    os.makedirs(os.path.dirname(ruta) or ".", exist_ok=True)
    tmp = "%s.tmp-%d" % (ruta, os.getpid())
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    os.replace(tmp, ruta)
    return datos


def envios_vigentes(carpeta_colas, ahora_ts=None, ruta_reaperturas=None):
    """Lo que cuenta de verdad contra el tope: envíos de los dos últimos días menos las
    reaperturas. Lo usan el reparto y el director de la nube, para que no discrepen."""
    ahora_ts = time.time() if ahora_ts is None else ahora_ts
    return envios_efectivos(envios_por_tarea(leer_colas_nube(carpeta_colas, ahora_ts)),
                            leer_reaperturas(ahora_ts, ruta_reaperturas))


def reclamar_varadas(progreso, runs_en_marcha):
    """PURA. Las que se mandaron a la nube y allí ya no queda nadie que las haga.

    (2026-09-22, MEDIDO) RM3 y RM4 llevaban horas en «reasignada · nube» con CERO runs en
    marcha. Detrás de ellas, RM5 esperaba a RM3 y RM4; RM6 a RM5; RM7 a RM5 y RM6; RM8 a
    RM7. Genesis enseñaba «LISTAS PARA TRABAJAR 5» y ningún agente podía coger ninguna:
    la cadena entera colgaba de dos tareas que ya no iba a hacer nadie. El vigía lo veía
    («cadena_rota») y solo sabía avisar —y ni eso: «no pude avisar»—.

    Reasignar a la nube es un préstamo, no un traspaso: si en la nube no queda ningún run
    en marcha, lo prestado vuelve a `pendiente` y la Mac puede cogerlo. Mientras haya UN
    run vivo no se toca nada: podría ser el que las está haciendo.
    """
    if runs_en_marcha != 0:
        return []
    return sorted(
        tid for tid, v in (progreso or {}).items()
        if isinstance(v, dict)
        and v.get("estado") == "reasignada"
        and ((v.get("medio") or "") == "nube"
             # (2026-10-13) Las que soltó la tanda de la Mac al lanzar el run: «movida a nube-gh (run …)»,
             # sin medio hasta este día. Quedaban «reasignada» para siempre si su run moría.
             or (not v.get("medio") and str(v.get("nota") or "").startswith("movida a nube")))
    )


def devolver_a_pendiente(progreso, ids, fecha, envios=None, veredictos=None,
                         max_envios=MAX_ENVIOS_NUBE):
    """Copia del progreso con esos ids de vuelta a `pendiente`, sin perder su historia.

    (2026-09-24) Con lo que dijo la nube (`veredictos`: {id: (estado, nota)} del último run)
    y, si ya se mandó `max_envios` veces sin integrarse, a `bloqueada` en vez de a
    `pendiente`: devolverla otra vez era mandarla otra vez, y así 22 veces seguidas."""
    salida = dict(progreso or {})
    for tid in ids:
        v = dict(salida.get(tid) or {})
        n = int((envios or {}).get(tid, 0))
        dicho = (veredictos or {}).get(tid)
        motivo = ""
        if dicho:
            motivo = " · la nube dijo «%s»%s" % (dicho[0], (": %s" % dicho[1][:200]) if dicho[1] else "")
        if n >= max_envios:
            v.update(
                estado="bloqueada", medio=None,
                nota=("la nube la intentó %d veces sin integrarla%s. Repetirla igual no sirve: "
                      "«Reintentar con un cambio» en Bloqueadas" % (n, motivo)),
            )
        else:
            v.update(
                estado="pendiente", medio=None,
                nota="devuelta de la nube %s: no quedaba ningún run en marcha (envío %d de %d)%s"
                % (fecha, n, max_envios, motivo),
            )
        salida[tid] = v
    return salida


def marcar(progreso, ids, fecha):
    """Copia del progreso con esos ids como `reasignada · nube`."""
    p = {k: dict(v) if isinstance(v, dict) else v for k, v in progreso.items()}
    for tid in ids:
        entrada = p.get(tid)
        p[tid] = dict(entrada) if isinstance(entrada, dict) else {}
        p[tid].update(
            estado="reasignada", medio="nube", nota="reasignada a la nube %s" % fecha
        )
    return p


#: (2026-10-04) Interruptor de la nube. Siete corridas seguidas de GitHub Actions acabaron
#: con «cero commits» mientras el reparto les quitaba las tareas a la Mac (CDA1004, CDC1004,
#: CDF1004) y CC1003F quedó bloqueada tras tres envíos. Apagar el servicio launchd no basta:
#: el vigía de medidores también despliega la nube, y un reinicio vuelve a cargar el servicio.
#: Con este archivo NADIE reparte: {"motivo": "...", "hasta": "AAAA-MM-DD HH:MM:SS" | null}.
PAUSA_NUBE = os.path.expanduser("~/.starseed/nube-pausada.json")


def motivo_pausa(datos, ahora_local=None):
    """PURA: el motivo de la pausa si sigue vigente (sin `hasta` = hasta que se quite), o None."""
    if not isinstance(datos, dict):
        return None
    hasta = str(datos.get("hasta") or "").strip()
    if hasta:
        try:
            limite = time.strptime(hasta, "%Y-%m-%d %H:%M:%S")
        except ValueError:
            return None
        if limite <= (ahora_local or time.localtime()):
            return None
    return str(datos.get("motivo") or "pausada a mano").strip()


def nube_pausada(ruta=PAUSA_NUBE):
    """Motivo de la pausa de la nube, o None si se puede repartir. Nunca lanza."""
    try:
        with open(ruta, encoding="utf-8") as f:
            return motivo_pausa(json.load(f))
    except (OSError, ValueError):
        return None

