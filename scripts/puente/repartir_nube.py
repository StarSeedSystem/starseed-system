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

from vigilante_logica import id_en_asuntos

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


def dependencias_pendientes(tarea, progreso=None, asuntos_main=""):
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
        if not tid:
            continue
        entrada = progreso.get(tid)
        estado = entrada.get("estado") if isinstance(entrada, dict) else None
        if estado in _HECHAS:
            continue
        if asuntos_main and id_en_asuntos(tid, asuntos_main):
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
#: «Buscar más capacidad» del Mando enseña este recuento en vez de un «0 tareas» sin explicar.
MOTIVOS_FUERA = (
    ("ola-actual", "son de la ola que corre en la Mac"),
    ("estado", "no están pendientes ni fallidas"),
    ("en-main", "ya están en main"),
    ("grande", "piden más de %d archivos y se quedan en la Mac, donde hay revisor" % MAX_ARCHIVOS_NUBE),
    ("espera", "esperan a otra tarea"),
    ("agotada", "ya se mandaron %d veces sin integrarse" % MAX_ENVIOS_NUBE),
    ("privada", "son privadas y no salen de la Mac"),
)


def motivo_fuera(tarea, progreso, asuntos_main, n_ola_actual, envios=None,
                 max_archivos=MAX_ARCHIVOS_NUBE, max_envios=MAX_ENVIOS_NUBE):
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
    if dependencias_pendientes(tarea, progreso, asuntos_main):
        return "espera"
    if (envios or {}).get(tid, 0) >= max_envios:
        return "agotada"
    if es_privada(tarea):
        return "privada"
    return None


def elegir(colas, progreso, asuntos_main, ola_actual, tope=20, max_archivos=MAX_ARCHIVOS_NUBE,
           envios=None, max_envios=MAX_ENVIOS_NUBE):
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
            if motivo_fuera(tarea, progreso, asuntos_main, n_actual, envios, max_archivos, max_envios):
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
                candidata["depende"] = []
                candidata.pop("depende_de", None)
                candidata["dependencias_ya_en_main"] = list(deps) if isinstance(deps, list) else [deps]
            salida.append(candidata)
    # Estable: a igual numero de archivos manda el orden de las colas (la prioridad
    # que ya calcularon los directores). Solo se reordena por tamano.
    salida.sort(key=_n_archivos)
    return salida[:tope]


def clasificar(colas, progreso, asuntos_main, ola_actual, envios=None,
               max_archivos=MAX_ARCHIVOS_NUBE, max_envios=MAX_ENVIOS_NUBE):
    """PURA. {"elegibles": [ids], <motivo>: [ids], ...} del trabajo que queda, en el orden de
    las colas. No cuenta lo cerrado ni lo que ya está en main (no es trabajo pendiente).

    Una «agotada» que con la cuenta a cero seguiría fuera por otra razón (privada, por
    ejemplo) sale con ESA razón: reabrirla no la llevaría a la nube."""
    elegidas = {str(t["id"]) for t in elegir(colas, progreso, asuntos_main, ola_actual, tope=10 ** 6,
                                              max_archivos=max_archivos, envios=envios,
                                              max_envios=max_envios)}
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
            motivo = motivo_fuera(tarea, progreso, asuntos_main, n_actual, envios, max_archivos, max_envios)
            if motivo == "agotada":
                motivo = motivo_fuera(tarea, progreso, asuntos_main, n_actual, {}, max_archivos,
                                      max_envios) or "agotada"
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
    RM7. El Puente enseñaba «LISTAS PARA TRABAJAR 5» y ningún agente podía coger ninguna:
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
        and (v.get("medio") or "") == "nube"
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

