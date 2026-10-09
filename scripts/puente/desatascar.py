#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Desatasca solo lo que hoy paraba el enjambre y nadie recogía.

Por qué existe (medido el 2026-09-13, tres veces en un día):

  1. El orquestador se negaba a arrancar por «working tree de main con cambios
     sin commit» y el estorbo era un fichero suelto sin seguimiento (`.new`,
     `error.log`). 23 tareas pendientes paradas por eso, y el vigilante
     durmiendo su pausa de 10 minutos.
  2. El orquestador se quedaba VIVO al 0 % de CPU con cero trabajadores porque
     una tarea esperaba visto bueno con revisión bloqueante. El vigilante solo
     relanza cuando está PARADO y el director se retira cuando está VIVO: nadie
     cubría «vivo pero sin avanzar», que es el peor caso porque parece normal.
  3. Un trabajador `opencode run` estuvo 17 h 50 min sin escribir un byte.

Las tres decisiones son puras y se prueban; las acciones van aparte y devuelven
frases para el canal, de modo que el director solo tenga que decirlas.

REGLA: aquí no se aprueba nada sin mirar. Rechazar una revisión bloqueante es
ejecutar un veredicto que ya existe; aprobar a ciegas es exactamente lo que la
puerta impide (Ola 261).

La única aprobación que sale de aquí (2026-09-21) es la de una rama con las
CUATRO PUERTAS EN VERDE, revisión sin pegas y un solo defecto: le faltan
archivos de su alcance. Esa se integra y lo que falta sale como tarea de
seguimiento. No es relajar el listón —el listón lo puso tsc, vitest, unittest y
next build, y lo pasó—: es dejar de tirar código verde. Anoche costó 2 h 30 min
de agentes (NE1c, R6b, R7b). Si la revisión pone una pega, o si el agente no
tocó ninguno de sus archivos, se sigue rechazando.
"""

import json
import os
import re
import shutil
import subprocess
import time

from arbol_de_trabajo import PROPIAS

import director_chat

RAIZ = os.environ.get("STARSEED_ROOT") or os.path.expanduser(
    "~/Documents/starseed-os-main"
)

SUFIJOS_ESTORBO = (".log", ".new", ".tmp", ".orig", ".rej", ".bak", "~")
NOMBRES_ESTORBO = {".DS_Store"}
ESTADOS_CERRADOS = {"commit", "hecho"}


# ---------------------------------------------------------------- decisiones puras


def clasificar_sucio(lineas):
    """Separa el árbol sucio en («estorbo», «propias», «trabajo»).

    Estorbo = sin seguimiento (`??`) Y con pinta de residuo. Propias = rutas
    que el propio enjambre regenera (PROPIAS de arbol_de_trabajo): no son
    trabajo de nadie y no se nombran como tal. Todo lo demás es trabajo de
    alguien. Ante la duda, trabajo: apartar lo de otro es peor que no arrancar.

    Devuelve (estorbo, propias, trabajo).
    """
    conocidas = set(PROPIAS)
    estorbo, propias, trabajo = [], [], []
    for linea in lineas:
        if not linea or len(linea) < 4:
            continue
        marca, ruta = linea[:2], linea[3:].strip().strip('"')
        if not ruta:
            continue
        base = os.path.basename(ruta)
        if ruta in conocidas:
            propias.append(ruta)
        elif marca == "??" and (
            ruta.endswith(SUFIJOS_ESTORBO) or base in NOMBRES_ESTORBO
        ):
            estorbo.append(ruta)
        else:
            trabajo.append(ruta)
    return estorbo, propias, trabajo


def clasificar_puertas(progreso, ahora, declarados_por_id=None, tope_min=6):
    """Reparte las puertas paradas en (rechazar, aprobar_con_seguimiento).

    El tope es corto (6 min) a propósito: una revisión bloqueante es un
    veredicto YA dado, y esperar no añade información — solo congela el
    enjambre entero. Con 20 min cada atasco costaba media hora de agentes
    parados (medido el 2026-09-14). Una puerta en VERDE no la toca nadie: esa
    sí espera a una persona, el tiempo que haga falta.

    (2026-09-21) El «alcance incompleto» ya NO es motivo de rechazo por sí
    solo, y esta es la corrección más cara del mes. Anoche se tiraron NE1c
    (3672 s de agente, faltaba 1 archivo de 3), R6b (2920 s, faltaban 2 de 6) y
    R7b (2882 s, faltaban 4 de 9): dos horas y media de trabajo con las cuatro
    puertas EN VERDE y la revisión sin pegas, a la basura por no haber tocado
    todos los archivos declarados. Tirar código verde y útil para volver a
    pedirlo entero es la peor economía posible. Desde hoy:

      · revisión bloqueante           → rechazar (hay un defecto de verdad)
      · no tocó NINGÚN archivo suyo   → rechazar (hizo otra cosa)
      · tocó algunos pero no todos    → APROBAR e integrar lo verde, y el resto
                                        sale como tarea de seguimiento, pequeña
                                        y con los archivos que faltan escritos
      · verde y completa              → no se toca: la decide una persona

    `declarados_por_id` es {id: [archivos declarados]}, de la cola viva. Sin él
    no se puede saber si tocó algo, y entonces se es prudente: se aprueba con
    seguimiento en vez de tirar el trabajo.

    (2026-10-05) La revisión bloqueante ya NO se rechaza: se repara (ver
    `architecture/bloqueadas-reparacion.md` §4). Casi todo lo rechazado podía
    ser útil con cambios coherentes; rechazar es la excepción, no la regla.

    Devuelve ([(id, motivo)], [(id, motivo, faltan)], [(id, objecion)]).
    """
    declarados_por_id = declarados_por_id or {}
    a_rechazar, a_aprobar, bloqueantes = [], [], []
    for tid, e in sorted((progreso or {}).items()):
        if not isinstance(e, dict) or e.get("estado") != "esperando_aprobacion":
            continue
        if _minutos(e.get("t"), ahora) < tope_min:
            continue
        if e.get("revisor") == "bloqueante":
            objecion = str(e.get("objecion") or e.get("motivo") or "")
            bloqueantes.append((tid, objecion or "revisión bloqueante confirmada"))
            continue
        faltan = [str(x) for x in (e.get("faltan") or [])]
        if not faltan:
            continue
        declarados = [str(x) for x in (declarados_por_id.get(tid) or [])]
        tocados = len(declarados) - len(faltan)
        if declarados and tocados <= 0:
            a_rechazar.append(
                (tid, "no tocó ninguno de sus %d archivos" % len(declarados))
            )
            continue
        resumen = ", ".join(faltan[:3])
        if declarados:
            motivo = "alcance parcial: %d de %d archivos hechos; falta %s" % (
                tocados,
                len(declarados),
                resumen,
            )
        else:
            motivo = "alcance parcial: falta %s" % resumen
        a_aprobar.append((tid, motivo, faltan))
    return a_rechazar, a_aprobar, bloqueantes


#: Estados de una sucesora que todavía va a salir (o ya salió).
_SUCESORA_VIVA = (None, "", "pendiente", "en_curso", "escribiendo", "esperando", "esperando_aprobacion",
                  "pendiente_aprobacion", "reasignada", "commit")


def _base_id(tid):
    """El id de la cadena: «RM6b» → «RM6» (misma regla que `obtenerBaseId` de Genesis)."""
    return tid[:-1] if len(tid) > 1 and tid[-1] in "bcdefghijklmnopqrstuvwxyz" and tid[-2].isalnum() \
        and not tid[-2].islower() else tid


def sucesora_viva(tid, progreso, tareas):
    """La sucesora de `tid` en su cadena (mismo id base, letra posterior) que sigue viva."""
    base = _base_id(tid)
    for k in sorted(set(progreso or {}) | set(tareas or {})):
        if k == tid or _base_id(k) != base or k <= tid:
            continue
        if ((progreso or {}).get(k) or {}).get("estado") in _SUCESORA_VIVA:
            return k
    return None


#: Estados de un eslabón que todavía cuesta: va a correr, ocupa un trabajador esperando un visto
#: bueno, o falló y alguien lo repararía creando OTRA copia más.
_RETIRABLES = ("pendiente", "bloqueada", "fallo", "fallo_motor", "fallo_tsc", "fallo_tests", "sin_cambios",
               "interrumpida", "conflicto", "bloqueante", "esperando_aprobacion", "pendiente_aprobacion")


def _asunto_integra(tid, asuntos):
    patron = re.compile(r"(?:^|·\s*)%s\s*:" % re.escape(tid))
    return any(patron.search(a) for a in (asuntos or ()))


def redundantes_de_cadena(progreso, tareas, asuntos=()):
    """PURA. [(id, integrada, estado)]: eslabones que repiten un encargo que YA entró en main
    por otro eslabón de su cadena.

    (2026-10-09, medido) CAMR1005F se integró (ab6023ce) mientras sus copias CAMR1005Fb (fallo
    tsc) y CAMR1005Fc (esperando visto bueno con revisión bloqueante, ocupando un trabajador)
    seguían vivas: «Fallidas» las enseñaba sin dueño y el desatascador iba a crear CAMR1005Fd
    para «reparar» la objeción de Fc. Rehacer lo que ya está en main es gasto puro.

    Prudente a propósito: solo cuenta como copia la que declara EXACTAMENTE los mismos archivos
    que la integrada, y nunca una tarea de seguimiento (esa lleva lo que faltó)."""
    progreso = progreso or {}
    tareas = tareas or {}
    por_base = {}
    for k in set(progreso) | set(tareas):
        por_base.setdefault(_base_id(k), []).append(k)
    salida = []
    for _base, ids in sorted(por_base.items()):
        if len(ids) < 2:
            continue
        integradas = [k for k in sorted(ids)
                      if (progreso.get(k) or {}).get("estado") in ("commit", "hecho") or _asunto_integra(k, asuntos)]
        if not integradas:
            continue
        for k in sorted(ids):
            if k in integradas or _asunto_integra(k, asuntos):
                continue
            est = (progreso.get(k) or {}).get("estado") or "pendiente"
            if est not in _RETIRABLES:
                continue
            t = tareas.get(k) or {}
            if str(t.get("origen") or "").startswith("seguimiento") or str(t.get("prompt") or "").startswith("SEGUIMIENTO"):
                continue
            mios = sorted({str(x) for x in (t.get("archivos") or [])})
            if not mios:
                continue
            for i in integradas:
                suyos = sorted({str(x) for x in ((tareas.get(i) or {}).get("archivos") or [])})
                if suyos == mios:
                    salida.append((k, i, est))
                    break
    return salida


def retirar_redundantes(raiz=None, ahora=None, progreso=None, tareas=None, asuntos=None,
                        binario="starseed-puente", correr=None):
    """Retira las copias de `redundantes_de_cadena`: quedan «sustituidas» (rama conservada) y,
    si están en la tanda viva, se les da la orden que libera su trabajador (`rechazar` a la que
    espera un visto bueno, `soltar` a la que aún no empezó). Devuelve (frases, ids)."""
    raiz = raiz or RAIZ
    ahora = ahora or time.time()
    olas = os.path.join(raiz, "starseed_memory_root", "olas")
    if progreso is None:
        try:
            with open(os.path.join(olas, "progreso.json"), encoding="utf-8") as f:
                progreso = json.load(f)
        except Exception:
            return [], set()
    tareas = tareas if tareas is not None else _tareas_de_las_colas(olas)
    if asuntos is None:
        try:
            asuntos = subprocess.run(["git", "log", "main", "-n", "3000", "--format=%s"], cwd=raiz,
                                     capture_output=True, text=True, timeout=30).stdout.splitlines()
        except Exception:
            asuntos = []
    correr = correr or (lambda orden: subprocess.run(orden, capture_output=True, text=True, timeout=30,
                                                     env=dict(os.environ, STARSEED_IDE="desatascador")))
    try:
        with open(os.path.join(olas, "progreso-correcciones.json"), encoding="utf-8") as f:
            ya = json.load(f)
    except Exception:
        ya = {}
    ya = ya if isinstance(ya, dict) else {}
    frases, correcciones, ids = [], {}, set()
    for tid, integrada, est in redundantes_de_cadena(progreso, tareas, asuntos):
        ids.add(tid)
        if (ya.get(tid) or {}).get("estado") == "sustituida":
            continue  # ya decidido en una pasada anterior: falta solo que el vigilante lo aplique
        accion = "rechazar" if est in ("esperando_aprobacion",) else "soltar" if est in ("pendiente", "bloqueada") else None
        if accion:
            try:
                correr([binario, accion, tid])
            except Exception:
                pass
        sha = str((progreso.get(integrada) or {}).get("nota") or "").split(" ")[0]
        correcciones[tid] = {
            "estado": "sustituida",
            "t": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ahora)),
            "nota": "superada: el mismo encargo entró en main con %s%s; esta copia ya no hace falta "
                    "(rama ola/%s conservada)" % (integrada, (" (%s)" % sha) if re.match(r"^[0-9a-f]{7,40}$", sha) else "", tid),
        }
        frases.append("retiro %s (%s): copia de %s, que ya está en main" % (tid, est, integrada))
    if correcciones:
        ruta = os.path.join(olas, "progreso-correcciones.json")
        ya.update(correcciones)
        tmp = ruta + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(ya, f, ensure_ascii=False, indent=1)
        os.replace(tmp, ruta)
        try:
            director_chat.publicar(
                "*Copias retiradas*\n" + "\n".join("· " + f for f in frases)
                + "\n\nEl encargo ya está integrado por otro eslabón de su cadena; rehacerlo era gasto. "
                  "Las ramas quedan conservadas.",
                de="desatascador", rol="sistema", tipo="hecho", canal="mando", canales=["claude-cowork"])
        except Exception:
            pass
    return frases, ids


def aprobaciones_pendientes_a_reparar(progreso, tareas, ahora, tope_min=5):
    """PURA. [(id, objecion)] de las ramas en «pendiente_aprobacion» con revisión BLOQUEANTE.

    (2026-10-08) Alex: «los directores no revisan bien… nada se autorrepara». El orquestador
    espera 20 min el visto bueno y, si nadie decide, deja la rama en `pendiente_aprobacion`.
    `clasificar_puertas` solo miraba `esperando_aprobacion`, así que esas ramas se quedaban
    ahí para siempre y bloqueaban su cadena (RM6 → RM7, RM8; PRD1005S → PRD1005U). Con
    revisión bloqueante el veredicto ya está dado: se reparan con la objeción, como en la
    puerta viva. Una rama EN VERDE sigue esperando a una persona: eso no se toca."""
    salida = []
    for tid, e in sorted((progreso or {}).items()):
        if not isinstance(e, dict) or e.get("estado") != "pendiente_aprobacion":
            continue
        if e.get("revisor") != "bloqueante" or _minutos(e.get("t"), ahora) < tope_min:
            continue
        if sucesora_viva(tid, progreso, tareas):
            continue
        objecion = str(e.get("objecion") or e.get("motivo_vb") or e.get("motivo") or "")
        salida.append((tid, objecion or "revisión bloqueante confirmada"))
    return salida


def reparar_aprobaciones_pendientes(raiz=None, ahora=None, enviar=None, progreso=None, tareas=None):
    """Repara (Genesis → `POST /api/mando/reintentar`) las de `aprobaciones_pendientes_a_reparar`
    y deja la original como «sustituida» para no repetir. Devuelve frases para el canal."""
    raiz = raiz or RAIZ
    ahora = ahora or time.time()
    enviar = enviar or post_reparar
    olas = os.path.join(raiz, "starseed_memory_root", "olas")
    if progreso is None:
        try:
            with open(os.path.join(olas, "progreso.json"), encoding="utf-8") as f:
                progreso = json.load(f)
        except Exception:
            return []
    tareas = tareas if tareas is not None else _tareas_de_las_colas(olas)
    frases, correcciones = [], {}
    for tid, objecion in aprobaciones_pendientes_a_reparar(progreso, tareas, ahora):
        sucesor = enviar(tid)
        if sucesor and isinstance(sucesor, str):
            try:
                asegurar_en_cola_fuente(olas, sucesor)
            except Exception:
                pass
        if sucesor:
            correcciones[tid] = {
                "estado": "sustituida", "t": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ahora)),
                "nota": "reparada automáticamente por el desatascador: la objeción del revisor pasa a %s "
                        "(rama ola/%s conservada)" % (sucesor if isinstance(sucesor, str) else "su sucesora", tid),
            }
            frases.append("reparo %s → %s (rama esperando aprobación con revisión bloqueante)"
                          % (tid, sucesor if isinstance(sucesor, str) else "sucesora"))
            try:
                director_chat.publicar("*Reparación automática · %s*\nLa rama esperaba un visto bueno con "
                                       "revisión bloqueante; su objeción pasa a una sucesora.\n\n%s"
                                       % (tid, objecion[:600]),
                                       de="desatascador", rol="sistema", tipo="aviso", canal="mando",
                                       canales=["claude-cowork"], tarea=tid)
            except Exception:
                pass
        else:
            # Genesis no creó sucesora (no responde, o la cadena va por su tercer intento y
            # escala): no se marca nada y se vuelve a mirar en la próxima pasada.
            frases.append("no reparo %s todavía: %s" % (tid, motivo_sin_sucesora(tid)))
    if correcciones:
        ruta = os.path.join(olas, "progreso-correcciones.json")
        try:
            with open(ruta, encoding="utf-8") as f:
                actuales = json.load(f)
        except Exception:
            actuales = {}
        actuales = actuales if isinstance(actuales, dict) else {}
        actuales.update(correcciones)
        tmp = ruta + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(actuales, f, ensure_ascii=False, indent=1)
        os.replace(tmp, ruta)
    return frases


def asegurar_en_cola_fuente(olas, tid):
    """Genesis mete la sucesora en la cola VIVA (`cola-auto-*`), que es una copia: si la tanda
    acaba antes de cogerla, el reconciliador la cierra como «huérfana». Se copia también a
    `cola-reintentos-<fecha>.json` (cola fuente de código) si ninguna fuente la define."""
    import glob

    fuentes, encontrada = set(), None
    for ruta in sorted(glob.glob(os.path.join(olas, "cola-*.json")), key=os.path.getmtime):
        nombre = os.path.basename(ruta)
        try:
            with open(ruta, encoding="utf-8") as f:
                datos = json.load(f)
        except Exception:
            continue
        lista = datos if isinstance(datos, list) else (datos or {}).get("tareas", []) if isinstance(datos, dict) else []
        for t in lista:
            if isinstance(t, dict) and t.get("id") == tid:
                encontrada = t
                if not nombre.startswith(("cola-auto-", "cola-suenos-")):
                    fuentes.add(nombre)
    if fuentes or not encontrada:
        return None
    ruta = os.path.join(olas, "cola-reintentos-%s.json" % time.strftime("%Y-%m-%d"))
    try:
        with open(ruta, encoding="utf-8") as f:
            actuales = json.load(f)
    except Exception:
        actuales = []
    actuales = actuales if isinstance(actuales, list) else []
    actuales.append(encontrada)
    tmp = ruta + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(actuales, f, ensure_ascii=False, indent=1)
    os.replace(tmp, ruta)
    return ruta


#: Estados de fallo que se reparan solos cuando BLOQUEAN a otra tarea. «rechazada» no: esa ya
#: la decidió alguien (para eso está «Borrar las que no se pueden reaplicar»).
FALLOS_REPARABLES = ("fallo", "fallo_motor", "fallo_tsc", "fallo_tests", "sin_cambios", "interrumpida",
                     "conflicto", "bloqueante")


def eslabones_rotos(progreso, tareas, ahora, tope_min=5):
    """PURA. Dependencias en FALLO que tienen a alguien esperando y ninguna sucesora viva.

    (2026-10-08) CAMR1005F y G esperaban a CAMR1005Db, que acabó en `fallo_tsc`: nadie lo
    reparaba (la reparación solo saltaba con el botón) y la cadena entera se quedaba muerta.
    Devuelve [(dep, [quienes esperan])]."""
    progreso = progreso or {}
    esperan = {}
    for tid, t in (tareas or {}).items():
        if (progreso.get(tid) or {}).get("estado") not in (None, "", "pendiente", "bloqueada"):
            continue
        deps = (t or {}).get("depende") or []
        for dep in [deps] if isinstance(deps, str) else deps:
            e = progreso.get(dep) or {}
            if e.get("estado") in FALLOS_REPARABLES and _minutos(e.get("t"), ahora) >= tope_min \
                    and not sucesora_viva(dep, progreso, tareas):
                esperan.setdefault(dep, []).append(tid)
    return sorted((dep, sorted(q)) for dep, q in esperan.items())


def reparar_eslabones_rotos(raiz=None, ahora=None, enviar=None, progreso=None, tareas=None):
    """Pide a Genesis la reparación automática de cada eslabón roto (sucesora con el cambio que
    dicta su fallo). La cadena sigue sola: una sucesora integrada cumple la dependencia."""
    raiz = raiz or RAIZ
    ahora = ahora or time.time()
    enviar = enviar or post_reparar
    olas = os.path.join(raiz, "starseed_memory_root", "olas")
    if progreso is None:
        try:
            with open(os.path.join(olas, "progreso.json"), encoding="utf-8") as f:
                progreso = json.load(f)
        except Exception:
            return []
    tareas = tareas if tareas is not None else _tareas_de_las_colas(olas)
    frases = []
    for dep, quienes in eslabones_rotos(progreso, tareas, ahora):
        sucesor = enviar(dep)
        if sucesor and isinstance(sucesor, str):
            try:
                asegurar_en_cola_fuente(olas, sucesor)
            except Exception:
                pass
        if sucesor:
            frases.append("reparo %s → %s: %s esperaban a una tarea en %s" % (
                dep, sucesor, ", ".join(quienes[:4]), (progreso.get(dep) or {}).get("estado")))
            try:
                director_chat.publicar("*Eslabón roto reparado · %s → %s*\n%s esperaban a %s, que acabó en «%s». "
                                       "La sucesora lleva el cambio que dicta su fallo; cuando se integre, la "
                                       "cadena sigue sola." % (dep, sucesor, ", ".join(quienes[:6]), dep,
                                                               (progreso.get(dep) or {}).get("estado")),
                                       de="desatascador", rol="sistema", tipo="aviso", canal="mando",
                                       canales=["claude-cowork"], tarea=dep)
            except Exception:
                pass
        else:
            frases.append("no reparo %s todavía: %s" % (dep, motivo_sin_sucesora(dep)))
    return frases


def puertas_a_rechazar(progreso, ahora, tope_min=6):
    """Solo las que hay que tirar. Ver `clasificar_puertas`."""
    return clasificar_puertas(progreso, ahora, None, tope_min)[0]


# --------------------------------------------------- reparación de bloqueadas

URL_REINTENTAR = "http://127.0.0.1:9002/api/mando/reintentar"
TOPE_INTENTOS_REPARACION = 3


def accion_bloqueante(intentos):
    """PURA: reparar hasta `TOPE_INTENTOS_REPARACION`; luego escalar, nunca rechazar."""
    return "escalar" if intentos >= TOPE_INTENTOS_REPARACION else "reparar"


#: Lo que contestó Genesis la última vez que no creó sucesora, por id: para decir POR QUÉ.
#: (2026-10-08) El vigía repetía cada 2 min «Genesis no creó sucesora (caído o la cadena
#: escala)» sin saber cuál de las dos: con CAMR1005Dc en su tercer eslabón era «escalada», y
#: eso lo retoma la escalera del director (`continuar_estancadas`), no un caído.
ULTIMO_MOTIVO = {}


def motivo_sin_sucesora(tid):
    """La frase de por qué Genesis no creó sucesora para `tid`."""
    m = ULTIMO_MOTIVO.get(tid)
    if not m:
        return "Genesis no respondió"
    accion, motivo = m
    if accion == "escalada":
        return "la cadena va por su tercer intento; la retoma la escalera del director (%s)" % motivo[:120]
    return "Genesis dice «%s»%s" % (accion, (": " + motivo[:120]) if motivo else "")


def post_reparar(tid, url=URL_REINTENTAR, timeout=30):
    """Como `post_reintentar`, pero devuelve el id de la SUCESORA creada (o None). Un 200 que
    dice «esperando» o «escalada» no es una reparación: no se marca nada como hecho."""
    ULTIMO_MOTIVO.pop(tid, None)
    try:
        import urllib.request

        datos = json.dumps({"ids": [tid], "automatico": True}).encode("utf-8")
        peticion = urllib.request.Request(url, data=datos, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(peticion, timeout=timeout) as r:
            cuerpo = json.loads(r.read().decode("utf-8") or "{}")
        for res in cuerpo.get("resultados") or []:
            if res.get("accion") == "reintentada" and res.get("sucesor"):
                return res["sucesor"]
            ULTIMO_MOTIVO[tid] = (str(res.get("accion") or ""), str(res.get("motivo") or ""))
        return None
    except Exception:
        return None


def post_reintentar(tid, url=URL_REINTENTAR, timeout=15):
    """Pide a Genesis la reparación automática. Devuelve True/False, nunca lanza."""
    try:
        import urllib.request

        datos = json.dumps({"ids": [tid], "automatico": True}).encode("utf-8")
        peticion = urllib.request.Request(
            url,
            data=datos,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(peticion, timeout=timeout) as r:
            return 200 <= r.status < 300
    except Exception:
        return False


def _ruta_reparaciones_estado(raiz):
    return os.path.join(
        raiz, "starseed_memory_root", "mando", "desatascar-reparaciones.json"
    )


def _ruta_reparaciones_pendientes(raiz):
    return os.path.join(
        raiz, "starseed_memory_root", "mando", "reparaciones-pendientes.jsonl"
    )


def intentos_reparacion(raiz, tid, incrementar=False):
    """Veces que el desatascador ya pidió reparar `tid` (cadena de intentos)."""
    ruta = _ruta_reparaciones_estado(raiz)
    try:
        with open(ruta, encoding="utf-8") as fh:
            datos = json.load(fh)
    except Exception:
        datos = {}
    n = int(datos.get(tid) or 0)
    if incrementar:
        n += 1
        datos[tid] = n
        _guardar_estado(ruta, datos)
    return n


def registrar_reparacion_pendiente(raiz, tid, objecion, ahora=None):
    """Genesis no respondió: la petición queda escrita para el director."""
    ruta = _ruta_reparaciones_pendientes(raiz)
    try:
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        with open(ruta, "a", encoding="utf-8") as fh:
            fh.write(
                json.dumps(
                    {
                        "tarea": tid,
                        "objecion": objecion,
                        "automatico": True,
                        "t": ahora or time.time(),
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )
        return True
    except Exception:
        # ValueError por ruta con byte nulo, OSError por disco lleno, etc.:
        # ninguno puede tumbar el desatasco; la frase de aviso sale igual.
        return False


def seguimiento_de(tid, entrada, tarea, faltan):
    """La tarea pequeña que recoge lo que la grande dejó sin tocar.

    Lleva los archivos que faltan y NADA más: el resto ya está integrado. El
    encargo dice qué se integró y con qué sha, para que el agente no rehaga lo
    hecho ni dé por supuesto que el archivo está vacío.
    """
    faltan = [str(x) for x in (faltan or [])]
    base = dict(tarea or {})
    nid = "%ss" % tid
    sha = str((entrada or {}).get("sha") or "")[:12]
    titulo = str(base.get("titulo") or tid)
    encargo = (
        "SEGUIMIENTO de %s, que ya está integrada%s. Las cuatro puertas pasaron "
        "en verde y la revisión no puso pegas, pero el agente no llegó a tocar "
        "estos archivos: %s.\n\n"
        "Tu encargo es SOLO esos archivos. No rehagas lo que ya está: léelo "
        "primero y engánchate a lo que hay. Tarea original: %s"
        % (tid, (" (sha %s)" % sha) if sha else "", ", ".join(faltan), titulo)
    )
    if base.get("prompt"):
        encargo += (
            "\n\n--- encargo original, como contexto ---\n%s"
            % str(base["prompt"])[:2000]
        )
    base.update(
        {
            "id": nid,
            "titulo": "%s · lo que faltó: %s" % (titulo, ", ".join(faltan[:2])),
            "archivos": faltan,
            "prompt": encargo,
            "depende_de": [],
            "origen": "seguimiento de alcance parcial",
        }
    )
    return base


def orquestador_atascado(vivo, n_agentes, minutos_sin_avance, tope_min=8):
    """Vivo, sin trabajadores y sin avanzar = atascado, aunque parezca normal."""
    if not vivo or n_agentes > 0:
        return False, ""
    if minutos_sin_avance < tope_min:
        return False, ""
    return True, "vivo, 0 trabajadores y %d min sin avanzar" % int(minutos_sin_avance)


def colgados_a_matar(procesos, ahora, tope_s=1800):
    """Pids de trabajadores que llevan `tope_s` sin escribir un byte."""
    fuera = []
    for pr in procesos or []:
        pid = pr.get("pid")
        if not isinstance(pid, int) or pid <= 1 or pr.get("propio"):
            continue
        ultimo = pr.get("ultimo_byte") or pr.get("inicio") or 0
        if ultimo and ahora - ultimo > tope_s:
            fuera.append(pid)
    return sorted(fuera)


def _minutos(t, ahora):
    if isinstance(t, (int, float)):
        return max(0.0, (ahora - t) / 60.0)
    if isinstance(t, str) and t.strip():
        try:
            return max(
                0.0,
                (ahora - time.mktime(time.strptime(t.strip(), "%Y-%m-%d %H:%M:%S")))
                / 60.0,
            )
        except Exception:
            return 0.0
    return 0.0


# ---------------------------------------------------------------- acciones


def limpiar_arbol(raiz, ahora=None):
    """Aparta (NUNCA borra) los estorbos que impiden arrancar. Devuelve frases."""
    try:
        salida = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=raiz,
            capture_output=True,
            text=True,
            timeout=30,
        ).stdout.splitlines()
    except Exception as e:
        return ["no pude mirar el árbol: %s" % type(e).__name__]
    estorbo, _propias, trabajo = clasificar_sucio(salida)
    frases = []
    if estorbo:
        destino = os.path.join(
            raiz,
            "starseed_memory_root",
            "olas",
            "_apartado",
            time.strftime("%Y%m%d", time.localtime(ahora or time.time())),
        )
        os.makedirs(destino, exist_ok=True)
        movidos = []
        for ruta in estorbo:
            try:
                origen = os.path.join(raiz, ruta)
                if os.path.exists(origen):
                    shutil.move(origen, os.path.join(destino, os.path.basename(ruta)))
                    movidos.append(ruta)
            except Exception:
                pass
        if movidos:
            frases.append(
                "aparto %d estorbo(s) que impedían arrancar: %s (en olas/_apartado/)"
                % (len(movidos), ", ".join(movidos[:5]))
            )
    if trabajo:
        frase = "el árbol tiene trabajo sin commitear y NO lo toco: %s" % ", ".join(
            trabajo[:5]
        )
        if _conviene_avisar_trabajo(raiz, frase, ahora or time.time()):
            frases.append(frase)
    return frases


PAUSA_AVISO_TRABAJO_S = 3600


def _ruta_estado_trabajo(raiz):
    return os.path.join(raiz, "starseed_memory_root", "mando", "desatascar-estado.json")


def _conviene_avisar_trabajo(raiz, frase, ahora):
    """Una vez por hora con el mismo conjunto de rutas; si cambia, enseguida.

    El director publicaba la misma línea cada 3 minutos y llenaba el Chat
    Director de ruido (medido 2026-10-04). Se guarda la última frase y su hora
    y no se repite antes de 3600 s si no ha cambiado.
    """
    ruta = _ruta_estado_trabajo(raiz)
    previo = {}
    try:
        with open(ruta, encoding="utf-8") as fh:
            previo = json.load(fh)
    except Exception:
        previo = {}
    if (
        previo.get("frase") == frase
        and ahora - float(previo.get("t") or 0) < PAUSA_AVISO_TRABAJO_S
    ):
        return False
    _guardar_estado(ruta, {"frase": frase, "t": ahora})
    return True


def minutos_sin_integrar(progreso, ahora, ruta_estado):
    """Minutos desde la última integración, recordando el conteo entre pasadas.

    No hay un «último commit» fiable en progreso.json, así que se cuenta cuántas
    tareas están en `commit` y se recuerda cuándo cambió ese número. Si no
    cambia, el reloj corre: eso es exactamente «no avanza».
    """
    n = sum(
        1
        for v in (progreso or {}).values()
        if isinstance(v, dict) and v.get("estado") in ESTADOS_CERRADOS
    )
    previo = {}
    try:
        import json

        with open(ruta_estado, encoding="utf-8") as fh:
            previo = json.load(fh)
    except Exception:
        previo = {}
    if previo.get("n") != n or not previo.get("t"):
        _guardar_estado(ruta_estado, {"n": n, "t": ahora})
        return 0.0
    return max(0.0, (ahora - float(previo["t"])) / 60.0)


def _guardar_estado(ruta, datos):
    try:
        import json

        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        tmp = ruta + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(datos, fh)
        os.replace(tmp, ruta)
    except Exception:
        pass


def clave_de_lineas(lineas, nombre):
    """El valor de `nombre` en un archivo tipo `.env`, o None.

    PURA a propósito: el archivo de claves se lee fuera y aquí solo se interpreta,
    para poder probarlo sin tener secretos delante. Acepta `export NOMBRE=valor`,
    comillas alrededor del valor y comentarios.
    """
    for linea in lineas or []:
        linea = (linea or "").strip()
        if not linea or linea.startswith("#") or "=" not in linea:
            continue
        izquierda, _, valor = linea.partition("=")
        izquierda = izquierda.strip()
        if izquierda.startswith("export "):
            izquierda = izquierda[len("export ") :].strip()
        if izquierda != nombre:
            continue
        valor = valor.strip()
        if len(valor) >= 2 and valor[0] == valor[-1] and valor[0] in "\"'":
            valor = valor[1:-1]
        return valor or None
    return None


def aviso_de_rechazo(tid, motivo, ok=True):
    """El texto que le llega a Alex cuando el desatascador ejecuta un veredicto.

    PURA. Lleva las tres cosas que pidió: qué tarea, por qué, y dónde está el
    trabajo para rescatarlo. La rama se conserva SIEMPRE, y decirlo importa: el
    aviso no es «se ha perdido esto», es «esto te espera si no estás de acuerdo».
    """
    cabeza = "Rechazo automático" if ok else "No pude rechazar"
    return (
        "*%s · %s*\n%s\n\nRama conservada: `ola/%s`\n"
        "Si no estás de acuerdo, ahí sigue el trabajo." % (cabeza, tid, motivo, tid)
    )


def _clave(nombre, ruta=None):
    """Lee una clave del entorno o de `~/.hermes/.env`. Nunca la imprime.

    El director corre bajo launchd sin cargar el archivo de claves (solo el
    servicio de Telegram lo hace), así que aquí hay que leerlo a mano.
    """
    valor = os.environ.get(nombre)
    if valor:
        return valor.strip()
    ruta = ruta or os.path.expanduser("~/.hermes/.env")
    try:
        with open(ruta, encoding="utf-8", errors="replace") as f:
            return clave_de_lineas(f.readlines(), nombre)
    except Exception:
        return None


def avisar_por_telegram(texto):
    """Manda el aviso. Devuelve True/False y NUNCA lanza: avisar es un extra.

    Tampoco registra el token ni el chat, ni siquiera al fallar.
    """
    token = _clave("TELEGRAM_BOT_TOKEN")
    chat = _clave("TELEGRAM_CHAT_ID")
    if not token or not chat:
        return False
    try:
        import json as _json
        import urllib.request as _url

        datos = _json.dumps(
            {"chat_id": str(chat), "text": texto, "parse_mode": "Markdown"}
        ).encode("utf-8")
        peticion = _url.Request(
            "https://api.telegram.org/bot%s/sendMessage" % token,
            data=datos,
            headers={"Content-Type": "application/json"},
        )
        with _url.urlopen(peticion, timeout=20) as r:
            return r.status == 200
    except Exception:
        return False


def reparar_bloqueantes(
    bloqueantes, raiz=None, enviar=post_reintentar, ahora=None,
):
    """Una revisión bloqueante no se rechaza: se repara con la objeción como cambio.

    (2026-10-05, `architecture/bloqueadas-reparacion.md` §4) Llama a
    `POST /api/mando/reintentar` con `{ids:[tid], automatico:true}`. Si Genesis no responde, la petición queda en `reparaciones-pendientes.jsonl`
    para que la levante el director. Solo al tercer intento con objeción de la
    misma cadena marca `escalar` — nunca `rechazada`. El aviso va al Chat
    Director en una línea.
    """
    raiz = raiz or RAIZ
    frases = []
    for tid, objecion in bloqueantes:
        intentos = intentos_reparacion(raiz, tid, incrementar=True)
        accion = accion_bloqueante(intentos)
        if accion == "escalar":
            frases.append(
                "escalo %s al director: tercer intento con objeción de la misma cadena"
                % tid
            )
            texto = (
                "*Escalado · %s*\nTercer intento con objeción de la misma cadena. "
                "No se rechaza: la decide el director.\n\n%s" % (tid, objecion)
            )
        else:
            ok = enviar(tid) if enviar else False
            if ok:
                frases.append(
                    "reparación automática de %s con la objeción del revisor" % tid
                )
            else:
                registrar_reparacion_pendiente(raiz, tid, objecion, ahora)
                frases.append(
                    "reparación de %s pendiente en archivo: Genesis no responde" % tid
                )
            texto = (
                "*Reparación automática · %s*\n%s"
                % (tid, objecion)
            )
        try:
            director_chat.publicar(
                texto,
                de="desatascador",
                rol="sistema",
                tipo="aviso",
                canal="mando",
                canales=["claude-cowork"],
                tarea=tid,
            )
        except Exception:
            pass
    return frases


def rechazar_puertas(puertas, binario="starseed-puente", avisar=avisar_por_telegram):
    """Ejecuta el veredicto que ya estaba dado. NUNCA aprueba.

    (2026-09-16, decisión de Alex) Y avisa: el rechazo sigue siendo firme, pero
    le llega por Telegram con el motivo y el nombre de la rama, para que pueda
    rescatarla si no está de acuerdo. Si el aviso falla, el rechazo se mantiene;
    lo que no puede pasar es que un fallo de red deshaga un veredicto.
    """
    frases = []
    for tid, motivo in puertas:
        try:
            r = subprocess.run(
                [binario, "rechazar", tid],
                capture_output=True,
                text=True,
                timeout=30,
                env=dict(os.environ, STARSEED_IDE="desatascador"),
            )
            ok = r.returncode == 0
        except Exception:
            ok = False
        frases.append(
            "rechazo %s solo (%s)" % (tid, motivo)
            if ok
            else "no pude rechazar %s (%s)" % (tid, motivo)
        )
        if ok:
            texto = aviso_de_rechazo(tid, motivo, ok)
            try:
                director_chat.publicar(
                    texto,
                    de="desatascador",
                    rol="sistema",
                    tipo="aviso",
                    canal="mando",
                    canales=["claude-cowork"],
                    tarea=tid,
                )
            except Exception:
                pass
        try:
            if avisar and not avisar(aviso_de_rechazo(tid, motivo, ok)):
                frases.append("(a %s no pude avisarte por Telegram)" % tid)
        except Exception:
            frases.append("(a %s no pude avisarte por Telegram)" % tid)
    return frases


def _tareas_de_las_colas(olas=None):
    """{id: tarea} de todas las colas. Para saber qué archivos declaró cada una."""
    olas = olas or os.path.join(RAIZ, "starseed_memory_root", "olas")
    fuera = {}
    try:
        nombres = sorted(os.listdir(olas))
    except OSError:
        return fuera
    for n in nombres:
        if not (n.startswith("cola-") and n.endswith(".json")):
            continue
        try:
            d = json.load(open(os.path.join(olas, n), encoding="utf-8"))
        except Exception:
            continue
        tareas = d if isinstance(d, list) else (d.get("tareas") or d.get("trabajos"))
        if not isinstance(tareas, list):
            continue
        for t in tareas:
            if isinstance(t, dict) and t.get("id"):
                fuera.setdefault(str(t["id"]), t)
    return fuera


def aprobar_con_seguimiento(
    puertas, progreso=None, tareas=None, binario="starseed-puente", olas=None
):
    """Integra lo verde y deja escrito, como tarea, lo que quedó sin tocar.

    Aprobar aquí no es relajar el listón: las cuatro puertas ya pasaron y la
    revisión no puso pegas. Lo único que faltaba era alcance, y el alcance se
    recupera con una tarea pequeña — no tirando el trabajo hecho.
    """
    olas = olas or os.path.join(RAIZ, "starseed_memory_root", "olas")
    tareas = tareas if tareas is not None else _tareas_de_las_colas(olas)
    progreso = progreso or {}
    frases, seguimientos = [], []
    for tid, motivo, faltan in puertas:
        try:
            r = subprocess.run(
                [binario, "aprobar", tid], capture_output=True, text=True, timeout=30
            )
            ok = r.returncode == 0
        except Exception:
            ok = False
        if not ok:
            frases.append("no pude aprobar %s (%s)" % (tid, motivo))
            continue
        frases.append("integro %s y encolo lo que faltó (%s)" % (tid, motivo))
        seguimientos.append(
            seguimiento_de(tid, progreso.get(tid) or {}, tareas.get(tid) or {}, faltan)
        )
    if seguimientos:
        ruta = os.path.join(olas, "cola-seguimientos.json")
        try:
            with open(ruta, encoding="utf-8") as f:
                previas = json.load(f)
            if not isinstance(previas, list):
                previas = []
        except Exception:
            previas = []
        ya = {t.get("id") for t in previas if isinstance(t, dict)}
        previas += [t for t in seguimientos if t.get("id") not in ya]
        try:
            with open(ruta, "w", encoding="utf-8") as f:
                json.dump(previas, f, ensure_ascii=False, indent=1)
            frases.append(
                "seguimientos en cola-seguimientos.json: %s"
                % ", ".join(t["id"] for t in seguimientos)
            )
        except OSError as exc:
            frases.append("no pude escribir los seguimientos (%s)" % exc)
    return frases


def trabajadores_opencode(ahora):
    """Lista de {pid, tarea, ultimo_byte} de los `opencode run` vivos."""
    try:
        salida = subprocess.run(
            ["ps", "-eo", "pid,etime,args"], capture_output=True, text=True, timeout=20
        ).stdout
    except Exception:
        return []
    fuera = []
    for linea in salida.splitlines():
        if "opencode run" not in linea or "grep" in linea:
            continue
        partes = linea.split(None, 2)
        if len(partes) < 3 or not partes[0].isdigit():
            continue
        pid = int(partes[0])
        tarea, ultimo = "?", 0.0
        for trozo in partes[2].split():
            if "starseed-wt/" in trozo:
                tarea = trozo.split("starseed-wt/")[-1].strip("`'\"")
                try:
                    ultimo = os.path.getmtime(trozo.strip("`'\""))
                except Exception:
                    ultimo = 0.0
                break
        fuera.append({"pid": pid, "tarea": tarea, "ultimo_byte": ultimo or ahora})
    return fuera


def matar_colgados(procesos, ahora, tope_s=1800):
    frases = []
    for pid in colgados_a_matar(procesos, ahora, tope_s):
        tarea = next((p.get("tarea") for p in procesos if p.get("pid") == pid), "?")
        try:
            os.kill(pid, 15)
            frases.append(
                "mato el trabajador de %s: media hora sin escribir un byte" % tarea
            )
        except Exception:
            pass
    return frases


def despertar_vigilante():
    """Corta la pausa de 10 min del vigilante cuando la causa ya no está."""
    try:
        uid = os.getuid()
        subprocess.run(
            ["launchctl", "kickstart", "-k", "gui/%d/com.starseed.vigilante" % uid],
            capture_output=True,
            timeout=20,
        )
        return True
    except Exception:
        return False


def desatascar(raiz, vivo, n_agentes, progreso, ahora=None, ruta_estado=None):
    """Una pasada completa. Devuelve las frases para el canal."""
    ahora = ahora or time.time()
    ruta_estado = ruta_estado or os.path.join(
        os.path.expanduser("~"), ".starseed", "desatascar-estado.json"
    )
    frases = []

    # (2026-10-09) Antes que nada, las copias de algo ya integrado salen de en medio: si no, las
    # reparaciones de abajo crearían OTRA copia más para «arreglar» lo que ya está en main.
    try:
        retiradas, ids_retirados = retirar_redundantes(raiz=raiz, ahora=ahora, progreso=progreso)
        frases += retiradas
        if ids_retirados and isinstance(progreso, dict):
            progreso = {k: (dict(v, estado="sustituida") if k in ids_retirados and isinstance(v, dict) else v)
                        for k, v in progreso.items()}
    except Exception as e:  # noqa: BLE001
        frases.append("no pude revisar las copias de cadena: %s" % type(e).__name__)

    procesos = trabajadores_opencode(ahora)
    frases += matar_colgados(procesos, ahora)

    quieto = minutos_sin_integrar(progreso, ahora, ruta_estado)

    if not vivo:
        limpieza = limpiar_arbol(raiz, ahora)
        frases += limpieza
        if any(f.startswith("aparto") for f in limpieza):
            despertar_vigilante()
            frases.append("despierto al vigilante: la causa ya no está")
        return frases

    # Las puertas con veredicto dado se ejecutan SIEMPRE, no solo cuando el
    # orquestador ya lleva rato congelado: esperar a que se note el atasco es
    # regalar minutos de enjambre parado. (2026-09-14: R7 llevaba 11 min en la
    # puerta con alcance incompleto y el desatascador no la miraba porque el
    # reloj del atasco se había reiniciado con un commit mío.)
    tareas_conocidas = _tareas_de_las_colas()
    declarados = {i: list(t.get("archivos") or []) for i, t in tareas_conocidas.items()}
    puertas, parciales, bloqueantes = clasificar_puertas(progreso, ahora, declarados)
    if bloqueantes:
        frases += reparar_bloqueantes(bloqueantes, raiz=raiz, ahora=ahora)
    frases += reparar_aprobaciones_pendientes(raiz=raiz, ahora=ahora, progreso=progreso,
                                              tareas=tareas_conocidas)
    if puertas:
        frases += rechazar_puertas(puertas)
    if parciales:
        frases += aprobar_con_seguimiento(
            parciales, progreso=progreso, tareas=tareas_conocidas
        )

    atascado, razon = orquestador_atascado(vivo, len(procesos), quieto)
    if atascado and not puertas and not parciales and not bloqueantes:
        frases.append(
            "ATASCO: orquestador %s y no hay nada que yo pueda resolver solo" % razon
        )
    return frases
