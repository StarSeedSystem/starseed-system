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
import math
import os
import re
import time

import urgencia_tarea
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


#: (2026-10-26, CAP1026E) Cuánto tiempo una tarea mandada a la nube se da por EN VUELO aunque el
#: progreso diga otra cosa: el job más largo (60 min los de «Buscar más capacidad», 45 los del
#: director) más un margen para que GitHub lo arranque.
EN_VUELO_S = 75 * 60


#: (1103 · I) Lo que dice que la tarea YA volvió de la nube (o se cerró): ya no está en vuelo.
NOTAS_DE_VUELTA = ("devuelta de la nube", "devuelta del carril", "traída de la nube", "reparación desde la nube",
                   "el carril en la nube no dio sesión")
ESTADOS_DE_VUELTA = ("commit", "integrada", "sustituida", "descartada", "rechazada", "informe")


def ya_volvio(entrada):
    """PURA (1103 · I). ¿La entrada de progreso dice que la tarea ya volvió de la nube o se cerró?"""
    if not isinstance(entrada, dict):
        return False
    if str(entrada.get("estado") or "") in ESTADOS_DE_VUELTA:
        return True
    nota = str(entrada.get("nota") or "").strip().lower()
    return any(nota.startswith(n) for n in NOTAS_DE_VUELTA)


def en_vuelo(colas_nube, ahora_ts, ventana_s=EN_VUELO_S, progreso=None):
    """PURA (CAP1026E): ids de las colas `cola-nube-AAAAMMDD-HHMM*` mandadas hace menos de `ventana_s`.

    MEDIDO el 26-10 entre las 12:04 y las 12:08 (hora de la Mac): «Buscar más capacidad» lanzó 8 jobs
    en 4 minutos y 11 tareas viajaron en 2 o 3 de ellos (GUI1021K1b, RTOPS1024Ed y RLB1020Sb en las
    colas de 12:05, 12:05-2 y 12:06-2). El reparto las marca «reasignada · nube», pero el orquestador
    de la Mac, que aún las tiene en su tanda, guarda su foto (`fusionar_progreso`: en las propias manda
    la memoria) y las deja «pendiente» hasta procesar el «soltar»; el reparto de un minuto después
    las ve libres otra vez. El mismo trabajo en tres jobs, y cada envío cuenta para los 3 que llevan a
    Bloqueadas. Lo que viaja en una cola reciente no se vuelve a mandar, diga lo que diga el progreso.
    La hora sale del nombre (hora local, como `leer_colas_nube`), con un minuto de holgura."""
    import datetime as _dt

    salida = set()
    for nombre, ids in colas_nube or []:
        m = re.match(r"cola-nube-(\d{8})-(\d{4})", str(nombre or ""))
        if not m:
            continue
        try:
            cuando = _dt.datetime.strptime(m.group(1) + m.group(2), "%Y%m%d%H%M").timestamp()
        except ValueError:
            continue
        if -120 <= ahora_ts - cuando < ventana_s:
            salida.update(str(i) for i in ids or [] if i)
    if progreso:  # (1103 · I) lo que ya volvió (su job terminó) no sigue en vuelo
        salida = {i for i in salida if not ya_volvio(progreso.get(i))}
    return salida


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

        if self.f is not None:
            try:
                fcntl.flock(self.f, fcntl.LOCK_UN)
            finally:
                self.f.close()
        return False


#: Memoria del nodo de MetaGenesis de ESTA máquina (sus préstamos a otros medios).
MEMORIA_METAGENESIS = os.path.expanduser("~/.starseed/nodo-metagenesis/memoria.json")
#: Lo mismo que `GRACIA_ASIGNACION_S` del nodo: un préstamo de hace menos de 6 h sigue vivo.
GRACIA_PRESTAMO_S = 6 * 3600


def nombre_cola(cola):
    """PURA: el nombre de una cola sin carpeta y sin la extensión.

    (2026-10-20, CAP1020A) El A1 llama a la cola que le presta la Mac `cola-mg-oracle-1020-1223.json`
    y el préstamo la guarda como `cola-mg-oracle-1020-1223`: para saber si una cola terminó hay que
    comparar los dos nombres, y para eso tienen que ser el mismo."""
    nombre = str(cola or "").strip()
    if "/" in nombre:
        nombre = nombre.rsplit("/", 1)[-1]
    if nombre.endswith(".json"):
        nombre = nombre[:-len(".json")]
    return nombre


def prestamo_vigente(p, ahora_ts, gracia_s=GRACIA_PRESTAMO_S, colas_terminadas=()):
    """PURA: ¿sigue vivo este préstamo?

    (2026-10-20, CAP1020A) UN PRÉSTAMO TERMINA CUANDO TERMINA SU COLA. Medido el 20-10 a las 13:30
    (hora de la Mac): el A1 terminó su cola `cola-mg-oracle-1020-1223` a las 19:24 UTC (55 min, 2
    entregas) y se quedó parado, mientras 10 de las 25 tareas listas seguían «prestadas» a él
    durante 6 h: ni la Mac, ni la nube, ni el propio A1 podían cogerlas. Un préstamo deja de vivir
    por tres cosas: que el préstamo lleve `fin` (ya se sabe que terminó), que su cola esté en
    `colas_terminadas` (el medio la terminó) o que haya pasado la gracia."""
    if not isinstance(p, dict):
        return False
    if p.get("fin"):
        return False
    cola = nombre_cola(p.get("cola"))
    terminadas = {nombre_cola(c) for c in (colas_terminadas or ())}
    if cola and cola in terminadas:
        return False
    try:
        ts = float(p.get("ts") or 0)
    except (TypeError, ValueError):
        ts = 0.0
    return ahora_ts - ts < gracia_s


def prestadas_vigentes(memoria, ahora_ts, gracia_s=GRACIA_PRESTAMO_S, colas_terminadas=()):
    """PURA: ids que el líder de MetaGenesis prestó a otro medio y el préstamo SIGUE VIVO.

    (2026-10-10, CAP1010, medido) MetaGenesis prestó al A1 a las 15:13 S1010-TU-LL1cobj,
    RTOPO1011T1b, S1010-EV-WIDGET y S1010-ES1 sin marcarlas en progreso.json, y la primera
    cesión de la tanda de la Mac mandó tres de ellas también a la nube: el mismo trabajo en dos
    medios. Lo prestado no se cede ni se reparte.

    (2026-10-20, CAP1020A) UN PRÉSTAMO TERMINA CUANDO TERMINA SU COLA: `prestamo_vigente` corta el
    préstamo si la cola del medio ya terminó (`colas_terminadas`), si el préstamo lleva `fin` o si
    pasó la gracia. Lo que se corta NO se borra: los medidores de resultados lo siguen contando."""
    salida = set()
    for p in ((memoria or {}).get("prestamos") or []) if isinstance(memoria, dict) else []:
        if prestamo_vigente(p, ahora_ts, gracia_s, colas_terminadas):
            salida.update(str(i) for i in p.get("ids") or [])
    return salida


def leer_prestadas(ahora_ts=None, ruta=None, colas_terminadas=()):
    """`prestadas_vigentes` de la memoria de MetaGenesis en disco. Nunca lanza.

    (2026-10-20, CAP1020A) `colas_terminadas`: las colas que el medio ya terminó (las que el
    nodo marca con `fin`). Sin ellas, manda el `fin` que el nodo dejó anotado en la memoria."""
    try:
        with open(ruta or MEMORIA_METAGENESIS, encoding="utf-8") as f:
            memoria = json.load(f)
    except (OSError, ValueError):
        return set()
    return prestadas_vigentes(memoria, time.time() if ahora_ts is None else ahora_ts,
                              colas_terminadas=colas_terminadas)


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
    # AUT1116A: una tarea con prioridad (URGENTE) que la Mac aún puede coger no se cede a la nube.
    ("urgente", "son urgentes y la Mac las coge antes que ninguna otra cosa"),
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
                 max_archivos=MAX_ARCHIVOS_NUBE, max_envios=MAX_ENVIOS_NUBE, mismo_lote=(), ahora=None):
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
    # (AUT1116A, MEDIDO el 16-11) VOZ01, FRN01 y DSB01 («URGENTE») salieron a la nube a las 14:50 como
    # cualquier otra, porque la nube cogía todo lo que no estuviera en la tanda viva de la Mac; allí
    # quedaron horas. Lo urgente se queda en la Mac mientras la Mac pueda cogerlo (`retiene_la_mac`).
    if urgencia_tarea.retiene_la_mac(tarea, entrada, ahora):
        return "urgente"
    if envios_de_cadena(tid, envios) >= max_envios:
        return "agotada"
    if es_privada(tarea):
        return "privada"
    return None


def elegir(colas, progreso, asuntos_main, ola_actual, tope=20, max_archivos=MAX_ARCHIVOS_NUBE,
           envios=None, max_envios=MAX_ENVIOS_NUBE, mismo_lote=(), ahora=None):
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
                            max_envios, mismo_lote, ahora):
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
    # (AUT1116A) Lo urgente va primero al cortar por `tope`; después, el criterio de siempre.
    salida.sort(key=lambda t: (-urgencia_tarea.prioridad_de_tarea(t), _n_archivos(t)))
    return salida[:tope]


def clasificar(colas, progreso, asuntos_main, ola_actual, envios=None,
               max_archivos=MAX_ARCHIVOS_NUBE, max_envios=MAX_ENVIOS_NUBE, mismo_lote=(), ahora=None):
    """PURA. {"elegibles": [ids], <motivo>: [ids], ...} del trabajo que queda, en el orden de
    las colas. No cuenta lo cerrado ni lo que ya está en main (no es trabajo pendiente).

    `mismo_lote` (2026-10-13): las cadenas que la Mac cede ENTERAS (`cedibles_y_lote`). Sin él,
    sus dependientes salían «esperan a otra tarea» y el botón contaba 0 elegibles aunque el
    reparto sí las habría mandado: «Buscar más capacidad» decidía con otra regla que el reparto.

    Una «agotada» que con la cuenta a cero seguiría fuera por otra razón (privada, por
    ejemplo) sale con ESA razón: reabrirla no la llevaría a la nube."""
    elegidas = {str(t["id"]) for t in elegir(colas, progreso, asuntos_main, ola_actual, tope=10 ** 6,
                                              max_archivos=max_archivos, envios=envios,
                                              max_envios=max_envios, mismo_lote=mismo_lote, ahora=ahora)}
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
                                  mismo_lote, ahora)
            if motivo == "agotada":
                motivo = motivo_fuera(tarea, progreso, asuntos_main, n_actual, {}, max_archivos,
                                      max_envios, mismo_lote, ahora) or "agotada"
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


#: (2026-10-14) Lo que un fallo del MEDIO puede devolver: como el botón, dos envíos por cadena en dos días.
MAX_DEVUELTOS_POR_MEDIO = 2


def envio_a_devolver(tid, envios_brutos, reaperturas, tope=MAX_DEVUELTOS_POR_MEDIO):
    """PURA. ¿A qué id de la cadena de `tid` se le devuelve un envío tras un fallo del MEDIO?

    `envios_brutos`: envíos sin descontar ({id: n}); `reaperturas`: las vigentes ({id: [ts]}).
    None si la cadena no fue a la nube, si ya no le queda envío que devolver o si ya se le
    devolvieron `tope` en estos dos días: un medio que falla siempre no la manda al infinito.
    (2026-10-14, medido) FLU1014A y D cayeron por «tsc no terminó (sin memoria)» en los runners; el
    revisor las devolvió «sin gastar un intento», pero sus tres envíos contaron igual: «agotadas».
    Con 120 así, el reparto daba 0 elegibles y la nube se quedó parada."""
    base = base_cadena(tid)
    reap = reaperturas or {}
    cadena = [k for k in (envios_brutos or {}) if base_cadena(k) == base]
    if sum(len(reap.get(k) or []) for k in cadena) >= tope:
        return None
    quedan = {k: int(envios_brutos[k] or 0) - len(reap.get(k) or []) for k in cadena}
    con_envio = sorted((k for k in cadena if quedan[k] > 0), key=lambda k: (-quedan[k], k))
    return con_envio[0] if con_envio else None


def devolver_envio_por_el_medio(tid, carpeta_colas, ahora_ts=None, ruta_reaperturas=None):
    """Anota la reapertura que decide `envio_a_devolver`. Devuelve el id o None. Nunca lanza."""
    try:
        ahora_ts = time.time() if ahora_ts is None else ahora_ts
        brutos = envios_por_tarea(leer_colas_nube(carpeta_colas, ahora_ts))
        k = envio_a_devolver(tid, brutos, leer_reaperturas(ahora_ts, ruta_reaperturas))
        if k:
            anotar_reaperturas([k], ahora_ts, ruta_reaperturas)
        return k
    except Exception:  # noqa: BLE001 — un fallo aquí nunca frena al revisor
        return None


#: (2026-10-26, CAP1026B) Lo que la nube integró en su rama espera a `traer_nube` (cada 30 min) como
#: «integrada · nube». Si en este plazo no llegó a main, algo pasa con su rama: se reclama y, al
#: devolverla, va a Bloqueadas con el motivo (no a otra vuelta igual).
ESPERA_TRAER_S = 24 * 3600
#: Estados con que la nube dice que la tarea quedó integrada en su rama `nube/<run>`.
VEREDICTOS_INTEGRADA = ("commit", "integrada")


def combinar_veredictos(por_run, ids=None):
    """PURA (CAP1026B). `por_run`: [(run, {id: (estado, nota)})] del run más NUEVO al más viejo →
    {id: (estado, nota, run)}. Un «commit» de cualquier run gana: ese trabajo ya está en su rama
    `nube/<run>` y `traer_nube` lo trae; si no hay ninguno, manda lo que dijo el run más nuevo.

    (2026-10-26, MEDIDO) Con el veredicto de SOLO el último run terminado, AGF1023E (commit en los runs
    40287793488 y 40291799281), AGF1023G y GUI1021Id-d2 volvían a «pendiente» y a la nube: tres envíos,
    dos commits y ninguno en main, porque mientras la tarea figura «reasignada» `traer_nube` espera."""
    fuera = {}
    quiero = None if ids is None else {str(i) for i in ids}
    for run, datos in por_run or []:
        for tid, v in (datos or {}).items():
            if quiero is not None and str(tid) not in quiero:
                continue
            if not isinstance(v, (list, tuple)) or not v:
                continue
            estado, nota = str(v[0]), str(v[1] if len(v) > 1 else "")
            previo = fuera.get(tid)
            if previo is None:
                fuera[tid] = (estado, nota, str(run))
            elif previo[0] not in VEREDICTOS_INTEGRADA and estado in VEREDICTOS_INTEGRADA:
                fuera[tid] = (estado, nota, str(run))
    return fuera


def reclamar_varadas(progreso, runs_en_marcha, ids_vivos=None, colas_jovenes=(), ahora=None):
    """PURA. Las que se mandaron a la nube y allí ya no queda nadie que las haga.

    (2026-09-22, MEDIDO) RM3 y RM4 llevaban horas en «reasignada · nube» con CERO runs en
    marcha. Detrás de ellas, RM5 esperaba a RM3 y RM4; RM6 a RM5; RM7 a RM5 y RM6; RM8 a
    RM7. Genesis enseñaba «LISTAS PARA TRABAJAR 5» y ningún agente podía coger ninguna: la
    cadena entera colgaba de dos tareas que ya no iba a hacer nadie. El vigía lo veía
    («cadena_rota») y solo sabía avisar —y ni eso: «no pude avisar»—.

    Reasignar a la nube es un préstamo, no un traspaso: si en la nube no queda ningún run
    en marcha, lo prestado vuelve a `pendiente` y la Mac puede cogerlo. Mientras haya UN
    run vivo no se toca nada: podría ser el que las está haciendo.

    (2026-10-21, MEDIDO) Casi siempre hay ALGÚN run vivo, y mientras haya uno no se
    reclamaba NADA: 43 tareas (IMG1020A, PES1020A, TRD1020A, LSD1020A, OHS1020A,
    CNX1020A, GUI1021A…) llevaban horas en «reasignada · nube» con su run terminado en
    «failure» y cero commits — el préstamo se había vuelto traspaso. Ahora quien llama
    puede decir QUÉ lleva cada run vivo: `ids_vivos` son los ids de las colas de los runs
    en marcha y `colas_jovenes` los de las `cola-nube-*.json` de menos de 30 min, cuyo run
    quizá aún no arranca. Si `ids_vivos` es un conjunto, se devuelven las varadas que NO
    estén en él ni en `colas_jovenes`; el llamador solo pasa un conjunto cuando conoce la
    cola de TODOS los runs vivos. `ids_vivos=None` conserva el comportamiento de siempre:
    solo reclamar cuando hayan quedado las colas vacías.

    (2026-10-26, CAP1026B) También las «integrada · nube» que pasaron `ESPERA_TRAER_S` sin llegar a main.
    """
    if ids_vivos is None:
        if runs_en_marcha != 0:
            return []
        prestadas = set()
    else:
        prestadas = {str(i) for i in ids_vivos} | {str(i) for i in colas_jovenes or ()}
    ahora = time.time() if ahora is None else ahora
    return sorted(
        tid for tid, v in (progreso or {}).items()
        if isinstance(v, dict)
        and ((v.get("estado") == "reasignada"
              and ((v.get("medio") or "") == "nube"
                   # (2026-10-13) Las que soltó la tanda de la Mac al lanzar el run: «movida a nube-gh (run …)»,
                   # sin medio hasta este día. Quedaban «reasignada» para siempre si su run moría.
                   or (not v.get("medio") and str(v.get("nota") or "").startswith("movida a nube"))))
             or _integrada_sin_traer(v, ahora))
        and tid not in prestadas
    )


def _integrada_sin_traer(entrada, ahora):
    """PURA: «integrada · nube» desde hace más de `ESPERA_TRAER_S` (traer_nube no la llevó a main)."""
    if entrada.get("estado") != "integrada" or (entrada.get("medio") or "") != "nube":
        return False
    try:
        desde = float(entrada.get("integrada_nube_t") or 0)
    except (TypeError, ValueError):
        return False
    return desde > 0 and ahora - desde > ESPERA_TRAER_S


def devolver_a_pendiente(progreso, ids, fecha, envios=None, veredictos=None,
                         max_envios=MAX_ENVIOS_NUBE, ahora=None):
    """Copia del progreso con esos ids de vuelta a `pendiente`, sin perder su historia.

    (2026-09-24) Con lo que dijo la nube (`veredictos`: {id: (estado, nota)} del último run)
    y, si ya se mandó `max_envios` veces sin integrarse, a `bloqueada` en vez de a
    `pendiente`: devolverla otra vez era mandarla otra vez, y así 22 veces seguidas.

    (2026-10-26, CAP1026B) Si la nube la INTEGRÓ en su rama (veredicto «commit» de cualquier run reciente,
    ver `combinar_veredictos`), no vuelve a pendiente: queda «integrada · nube» y `traer_nube` la trae a main
    con sus puertas (para él, «integrada» que main no tiene se trae comprobada). Mandarla otra vez solo
    repetía el trabajo y gastaba un envío. Si ya llevaba así más de `ESPERA_TRAER_S`, a Bloqueadas.
    """
    salida = dict(progreso or {})
    ahora = time.time() if ahora is None else ahora
    for tid in ids:
        v = dict(salida.get(tid) or {})
        n = int((envios or {}).get(tid, 0))
        dicho = (veredictos or {}).get(tid)
        motivo = ""
        if dicho:
            motivo = " · la nube dijo «%s»%s" % (dicho[0], (": %s" % dicho[1][:200]) if len(dicho) > 1 and dicho[1] else "")
        if _integrada_sin_traer(v, ahora):
            v.update(
                estado="bloqueada", medio=None,
                nota=("la nube la integró en su rama hace más de %d h y traer_nube no la ha traído a main: "
                      "mira su rama (traer_nube.py revisar) o «Reintentar con un cambio» en Bloqueadas%s"
                      % (ESPERA_TRAER_S // 3600, motivo)),
            )
            salida[tid] = v
            continue
        if dicho and str(dicho[0]) in VEREDICTOS_INTEGRADA:
            run = dicho[2] if len(dicho) > 2 and dicho[2] else ""
            v.update(
                estado="integrada", medio="nube", integrada_nube_t=ahora,
                nota=("la nube la integró en su rama%s (%s): traer_nube la trae a main con sus puertas; "
                      "no se vuelve a mandar" % ((" nube/%s" % run) if run else "", (dicho[1] or "commit")[:160])),
            )
            salida[tid] = v
            continue
        if n >= max_envios:
            v.update(
                estado="bloqueada", medio=None,
                nota=("la nube la intentó %d veces sin integrarla%s. Repetirla igual no sirve: "
                      "«Reintentar con un cambio» en Bloqueadas" % (n, motivo)),
            )
        else:
            v.update(
                estado="pendiente", medio=None,
                nota="devuelta de la nube %s: no quedaba ningún run en marcha que la llevara (envío %d de %d)%s"
                % (fecha, n, max_envios, motivo),
                # AUT1116A: desde ahora espera a la Mac (`urgencia_tarea.retiene_la_mac` cuenta desde `t`).
                t=time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ahora)),
            )
        salida[tid] = v
    return salida


def marcar(progreso, ids, fecha, ahora=None):
    """Copia del progreso con esos ids como `reasignada · nube`.

    (AUT1116A) Con `t_reasignada` (epoch): la nota solo lleva el DÍA y quien decidía «lleva demasiado»
    contaba hasta el final de ese día más 24 h (hasta 48 h de limbo, medido el 16-11 con VOZ01/FRN01/DSB01)."""
    ahora = time.time() if ahora is None else ahora
    p = {k: dict(v) if isinstance(v, dict) else v for k, v in progreso.items()}
    for tid in ids:
        entrada = p.get(tid)
        p[tid] = dict(entrada) if isinstance(entrada, dict) else {}
        p[tid].update(
            estado="reasignada", medio="nube", nota="reasignada a la nube %s" % fecha,
            t_reasignada=ahora,
        )
    return p


# ── Cloudroom ───────────────────────────────────────────────────────────────────
#: (CRM1024I, CAP1119B) Cloudroom: 100 hilos de la nube cada 30 días en el plan gratis.
#: El reparto a Cloudroom usa la MISMA lógica de elegibilidad que GitHub Actions
#: (estado repartible, sin dependencias abiertas, ≤3 archivos, no privada, no urgente),
#: pero con su propio cupo mensual y su propia rueda de modelos (opencode/pi gratis,
#: Codex < 80 %, Claude Code semana < 30 %). Lo que coge Cloudroom NO se reparte a GitHub.
CLOUDROOM_CICLO_DIAS = 30
CLOUDROOM_CUPO_CICLO = 100
CLOUDROOM_MAX_VIVOS = 3
CLOUDROOM_TOPE_DIA = 6
CLOUDROOM_PAUSA_MEDIO_H = 12
CLOUDROOM_REPETIR_TRAS_H = 24
CLOUDROOM_MAX_POR_TAREA = 2
CLOUDROOM_GRACIA_H = 12
CLOUDROOM_GRACIA_SIN_EMPEZAR_H = 2
CLOUDROOM_MIN_PARCHE_S = 600
CLOUDROOM_REGISTRO = os.path.expanduser("~/.starseed/cloudroom-hilos.json")
CLOUDROOM_MEDIDORES = os.path.expanduser("~/.starseed/medidores-credito.json")
CLOUDROOM_LIMITES = os.path.expanduser("~/.starseed/limites-claude.json")
CLOUDROOM_SALUD = os.path.expanduser("~/.starseed/salud-proveedores.json")


def _cloudroom_leer_registro(ruta=None):
    """PURA salvo disco: lee el registro de hilos de Cloudroom. Nunca lanza."""
    try:
        with open(ruta or CLOUDROOM_REGISTRO, encoding="utf-8") as f:
            d = json.load(f)
    except (OSError, ValueError):
        return []
    return d if isinstance(d, list) else []


def _cloudroom_filas(registro):
    """PURA: filas del registro con tarea e hilo válidos."""
    return [x for x in (registro or []) if isinstance(x, dict) and x.get("tarea") and x.get("hilo")]


def _cloudroom_abiertos(registro):
    """PURA: hilos del registro sin estado final ('traida', 'parche', 'devuelta', 'olvidada', 'medio')."""
    return [x for x in _cloudroom_filas(registro) if not x.get("final")]


def _cloudroom_medianoche(ahora):
    """PURA salvo zona horaria: inicio del día local de `ahora`."""
    t = time.localtime(ahora)
    return time.mktime((t.tm_year, t.tm_mon, t.tm_mday, 0, 0, 0, 0, 0, -1))


def _cloudroom_t(x):
    """PURA: timestamp de una fila del registro."""
    try:
        return float(x.get("t") or 0)
    except (TypeError, ValueError):
        return 0.0


def cloudroom_ritmo(registro, ahora, total=CLOUDROOM_CUPO_CICLO, usados_cuenta=0,
                    max_vivos=CLOUDROOM_MAX_VIVOS, tope_dia=CLOUDROOM_TOPE_DIA, potenciado=False):
    """PURA. {"hoy", "quedan", "motivo", "por_dia"}: cuántos hilos de Cloudroom caben AHORA sin agotar el ciclo.

    Cada hilo cuenta 30 días (ventana móvil); lo usado es lo mayor entre el registro y lo que diga la cuenta.
    El cupo de HOY (el día local) = lo que quedaba al empezar el día ÷ días hasta que el hilo más viejo salga del ciclo (30 sin ninguno), hacia ARRIBA y con `tope_dia`, menos lo lanzado hoy.
    Con menos de uno al día, uno cada 1/ritmo días desde el último.
    Si `potenciado` (Alex lo pidió desde "Buscar más capacidad"), ignora el reparto por día y usa solo el tope a la vez.
    """
    ventana = sorted(_cloudroom_t(x) for x in _cloudroom_filas(registro) if ahora - _cloudroom_t(x) < CLOUDROOM_CICLO_DIAS * 86400)
    usados = max(len(ventana), int(usados_cuenta or 0))
    quedan = max(0, int(total) - usados)
    if quedan <= 0:
        return {"hoy": 0, "quedan": 0, "por_dia": 0.0,
                "motivo": "sin cupo: %d de %d hilos de la nube usados en %d días" % (usados, total, CLOUDROOM_CICLO_DIAS)}
    vivos = len(_cloudroom_abiertos(registro))
    hoy_ya = sum(1 for t in ventana if t >= _cloudroom_medianoche(ahora))
    dias = max(1.0, (ventana[0] + CLOUDROOM_CICLO_DIAS * 86400 - ahora) / 86400) if ventana else float(CLOUDROOM_CICLO_DIAS)
    crudo = (quedan + hoy_ya) / dias
    por_dia = float(min(int(tope_dia), int(math.ceil(crudo)))) if crudo >= 1 else crudo
    reparto = "quedan %d para %.0f día(s): %s, tope %d" % (
        quedan, dias, ("%d al día" % por_dia) if por_dia >= 1 else ("1 cada %.0f días" % (1 / por_dia)), int(tope_dia))
    if vivos >= max_vivos:
        return {"hoy": 0, "quedan": quedan, "por_dia": por_dia,
                "motivo": "sin cupo ahora: %d hilos abiertos (tope %d)" % (vivos, max_vivos)}
    if potenciado:
        hoy = max(0, min(quedan, max_vivos - vivos))
        return {"hoy": hoy, "quedan": quedan, "por_dia": por_dia, "potenciado": True,
                "motivo": "potenciado: caben %d ahora (quedan %d del ciclo, sin reparto por día)" % (hoy, quedan)}
    if por_dia >= 1:
        hoy = int(por_dia) - hoy_ya
    else:
        hoy = 1 if not hoy_ya and (not ventana or ahora - ventana[-1] >= 86400 / por_dia) else 0
    hoy = max(0, min(hoy, quedan, max_vivos - vivos))
    motivo = ("caben %d (%s)" % (hoy, reparto)) if hoy else ("sin cupo hoy: ya van %d hoy (%s)" % (hoy_ya, reparto))
    return {"hoy": hoy, "quedan": quedan, "por_dia": por_dia, "motivo": motivo}


def cloudroom_frena_el_ritmo(n_ids, r):
    """PURA. ¿Lo que deja tareas fuera es el REPARTO por día del ciclo (que Alex puede potenciar) y no
    el tope de hilos a la vez del plan ni el ciclo agotado?"""
    if not n_ids or (r or {}).get("potenciado"):
        return False
    quedan, hoy = int((r or {}).get("quedan") or 0), int((r or {}).get("hoy") or 0)
    if quedan <= hoy or int(n_ids) <= hoy:
        return False
    return not str((r or {}).get("motivo") or "").startswith(("sin cupo ahora", "sin cupo:"))


def cloudroom_no_relanzar(registro, ahora):
    """PURA: tareas con hilo abierto, lanzadas hace menos de 24 h o ya MAX_POR_TAREA veces.
    Un hilo que acabó por fallo del medio ('medio') no cuenta: la tarea no tuvo su oportunidad."""
    from repartir_nube import ESTADOS_REPARTIBLES
    FALLO_MEDIO = "medio"
    contadas = [x for x in _cloudroom_filas(registro) if x.get("final") != FALLO_MEDIO]
    return ({str(x["tarea"]) for x in contadas
            if (ahora - _cloudroom_t(x) < CLOUDROOM_REPETIR_TRAS_H * 3600)
               or (int(x.get("intentos") or 0) >= CLOUDROOM_MAX_POR_TAREA)}
            | {str(x["tarea"]) for x in _cloudroom_abiertos(registro)})


def cloudroom_pausa_por_medio(registro, ahora, horas=CLOUDROOM_PAUSA_MEDIO_H):
    """PURA: por qué no se lanza nada ahora ("" si se lanza): los dos últimos hilos cerrados acabaron
    sin el repo en su sandbox hace menos de `horas`. Sin esta pausa, devolver sin gastar la tarea
    haría que la siguiente pasada la relanzara una y otra vez contra el mismo medio roto."""
    def t_final(x):
        try:
            return float(x.get("t_final") or x.get("t") or 0)
        except (TypeError, ValueError):
            return 0.0
    ultimas = sorted((x for x in _cloudroom_filas(registro) if x.get("final")), key=t_final)[-2:]
    if len(ultimas) < 2 or any(x.get("final") != "medio" for x in ultimas) or ahora - t_final(ultimas[-1]) >= horas * 3600:
        return ""
    return ("pausa: los 2 últimos hilos acabaron sin el repo en su sandbox (revisa el proyecto conectado en la app "
            "Cloudroom); vuelve a probar a las %s" % time.strftime("%H:%M", time.localtime(t_final(ultimas[-1]) + horas * 3600)))


def cloudroom_motivo_medio(medio):
    """PURA: por qué no se puede usar Cloudroom (vacío si se puede), en las palabras del parte."""
    medio = medio if isinstance(medio, dict) else {}
    estado, detalle = medio.get("estado"), str(medio.get("detalle") or "")
    if estado in ("usable", "listo"):
        return ""
    if estado == "requiere_alex":
        return "sin sesión (%s)" % (medio.get("siguiente_paso") or detalle or "inicia sesión en la app Cloudroom")
    return "app sin instalar" if "sin instalar" in detalle or not detalle else "no disponible (%s)" % detalle


def cloudroom_elegir(colas, progreso, asuntos_main, ola_actual, ahora,
                     envios=None, max_archivos=MAX_ARCHIVOS_NUBE, max_envios=MAX_ENVIOS_NUBE,
                     mismo_lote=(), registro=None, medio=None, usados_cuenta=0, potenciado=False):
    """PURA. Selecciona tareas para Cloudroom con la MISMA elegibilidad que GitHub Actions,
    pero filtrando por el ritmo de Cloudroom y su registro de hilos.

    Devuelve {"lanzadas": [tareas], "quedan": int, "motivo": str, "ritmo": dict, "modelos": {tarea: "harness/modelo"}}.
    `registro`: hilos de Cloudroom (lista de dicts); `medio`: resultado de `medios_disponibles.sondear_cloudroom()`;
    `usados_cuenta`: hilos que la cuenta dice que usó (de `cloud status`); `potenciado`: si Alex lo pidió.
    """
    import math
    from repartir_nube import motivo_fuera, ESTADOS_REPARTIBLES

    res = {"lanzadas": [], "quedan": 0, "motivo": "", "ritmo": {}, "modelos": {}}
    if medio is None:
        res["motivo"] = "sin sonda de Cloudroom"
        return res
    motivo_m = cloudroom_motivo_medio(medio)
    if motivo_m:
        res["motivo"] = motivo_m
        return res
    registro = registro or _cloudroom_leer_registro()
    res["motivo"] = cloudroom_pausa_por_medio(registro, ahora)
    if res["motivo"]:
        return res
    # Calcular ritmo
    r = cloudroom_ritmo(registro, ahora, usados_cuenta=usados_cuenta, potenciado=potenciado)
    res["ritmo"] = r
    res["quedan"] = r["quedan"]
    if r["hoy"] <= 0:
        res["motivo"] = r["motivo"]
        return res
    # Elegir tareas con la misma lógica que GitHub Actions
    n_actual = numero_ola(str(ola_actual)) if ola_actual else None
    envios = envios or {}
    elegibles = []
    for nombre, tareas in colas:
        for tarea in tareas:
            if not isinstance(tarea, dict) or not tarea.get("id"):
                continue
            tid = str(tarea["id"])
            if motivo_fuera(tarea, progreso, asuntos_main, n_actual, envios, max_archivos, max_envios, mismo_lote, ahora):
                continue
            elegibles.append(tarea)
    # Ordenar por prioridad (urgente primero, luego menos archivos)
    elegibles.sort(key=lambda t: (-urgencia_tarea.prioridad_de_tarea(t), len(t.get("archivos") or [])))
    # Filtrar no relanzar
    no_relanzar = cloudroom_no_relanzar(registro, ahora)
    elegibles = [t for t in elegibles if str(t["id"]) not in no_relanzar]
    # Filtrar privadas
    elegibles = [t for t in elegibles if not es_privada(t)]
    # Tomar hasta el cupo de hoy
    lanzadas = elegibles[:r["hoy"]]
    # Asignar modelos usando la rueda de Cloudroom (simplificado: delega a cloudroom_lanzar)
    # Aquí solo devolvemos las tareas seleccionadas; la asignación de modelos la hace cloudroom_lanzar
    res["lanzadas"] = lanzadas
    res["motivo"] = "caben %d (%s)" % (len(lanzadas), r["motivo"]) if lanzadas else "0 lanzadas: ninguna de las %d elegibles cabe" % len(elegibles)
    return res


# ── Oracle A1: escalado de agentes ──────────────────────────────────────────────
#: (OC1010, CAP1119B) El A1 sube agentes mientras tenga CPU y memoria libres, con su propio tope.
#: Capacidad base del A1 (Always Free): 2 OCPU · 12 GB. El gobernador de la Mac no manda allí.
CAPACIDAD_A1_OCPU = 2
CAPACIDAD_A1_GB = 12
#: Tope de agentes en el A1: 1 agente por OCPU libre (mínimo 1, máximo 4 por hardware).
MAX_AGENTES_A1 = 4
MIN_AGENTES_A1 = 1


def a1_escalar_agentes(consumo, ahora=None, tope_max=MAX_AGENTES_A1, tope_min=MIN_AGENTES_A1):
    """PURA. Cuántos agentes puede correr el A1 AHORA según su consumo medido.

    `consumo`: dict de `~/.starseed/oracle-consumo.json` (lo escribe `medidor_oracle.py` cada 30 min).
    Devuelve {"agentes": int, "capacidad": str, "motivo": str}.
    Si hay freno por gasto (> 0), devuelve 0 agentes.
    """
    ahora = time.time() if ahora is None else ahora
    if not isinstance(consumo, dict) or not consumo.get("leido"):
        return {"agentes": tope_min, "capacidad": "A1 2 OCPU · 12 GB (sin medidor: tope mínimo)",
                "motivo": "sin medidor de consumo: usa tope mínimo (%d)" % tope_min}
    freno = consumo.get("freno") or {}
    if freno.get("activo"):
        return {"agentes": 0, "capacidad": "A1 2 OCPU · 12 GB",
                "motivo": "freno: %s" % (freno.get("motivo") or "el gasto del mes pasó de 0")}
    margen = consumo.get("margen") or {}
    cpu_libre = margen.get("cpu_libre_pct")
    mem_libre = margen.get("mem_libre_gb")
    if cpu_libre is None or mem_libre is None:
        return {"agentes": tope_min, "capacidad": "A1 2 OCPU · 12 GB (margen desconocido: tope mínimo)",
                "motivo": "margen sin datos: usa tope mínimo (%d)" % tope_min}
    # 1 agente por OCPU libre (2 OCPU * cpu_libre_pct / 100), redondeado arriba, mínimo 1, máximo tope_max
    ocpu_libres = max(0.0, CAPACIDAD_A1_OCPU * float(cpu_libre) / 100.0)
    agentes_por_cpu = max(tope_min, int(math.ceil(ocpu_libres)))
    # También limitado por memoria: 1 agente necesita ~3 GB
    agentes_por_mem = max(tope_min, int(float(mem_libre) / 3.0))
    agentes = min(tope_max, agentes_por_cpu, agentes_por_mem)
    if agentes < tope_min:
        agentes = tope_min
    cap_str = "A1 2 OCPU · 12 GB · libre ahora: %.1f %% CPU · %.1f GB" % (float(cpu_libre), float(mem_libre))
    return {"agentes": agentes, "capacidad": cap_str,
            "motivo": "%d agente(s) (CPU: %d, RAM: %d, tope %d)" % (agentes, agentes_por_cpu, agentes_por_mem, tope_max)}


def a1_motivo_medio(medio):
    """PURA: por qué no se puede usar el A1 (vacío si se puede), en las palabras del parte."""
    medio = medio if isinstance(medio, dict) else {}
    estado, detalle = medio.get("estado"), str(medio.get("detalle") or "")
    if estado in ("usable", "listo"):
        return ""
    if estado == "requiere_alex":
        return "sin A1 listo (%s)" % (medio.get("siguiente_paso") or detalle or "vincula la cuenta y despliega el A1")
    return "no disponible (%s)" % (detalle or "estado desconocido")


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

