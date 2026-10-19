#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Selección pura de trabajo real para el vigilante del enjambre."""

import os
import re
import sys
import time

# (2026-09-23) El cambio pedido desde Genesis tiene que LLEGAR al agente; la regla vive
# en scripts/enjambre/cambio_pedido.py y es la misma para la Mac y para la nube.
try:
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "enjambre"))
    from cambio_pedido import aplicar_cambio_pedido
except ImportError:  # pragma: no cover
    def aplicar_cambio_pedido(tarea, entrada):
        return tarea

# El latido de la nube corre sobre un clon que puede ir por detrás: si
# `prioridad_logica` aún no existe allí, la ordenación se salta y se devuelve
# el orden del archivo, que es lo que ese latido espera hoy.
try:
    import prioridad_logica
except ImportError:  # pragma: no cover
    try:
        from scripts.puente import prioridad_logica  # type: ignore
    except ImportError:
        prioridad_logica = None


# Estos estados necesitan una decisión humana o ya cerraron la tarea. Repetirlos
# automáticamente cada 90 s solo gasta proveedores y multiplica el historial.
ESTADOS_NO_AUTOMATICOS = {
    "commit",
    "bloqueante",
    "sustituida",
    "rechazada",
    "sin_cambios",
    "fallo",
    "fallo_tsc",
    "fallo_tests",
    "conflicto",
    "reasignada",
    "pendiente_aprobacion",
    "esperando_aprobacion",
    "bloqueada",
    # (2026-09-20) Decisión humana explícita: no se relanza sola (DR0919-1, recompilar BitNet,
    # es de Alex). Se reabre poniéndola en `pendiente`.
    "descartada",
    "integrada",
    # (2026-09-29) Cierre de un sueño profundo (tarea de análisis): informe escrito, nada
    # que integrar. No es «sin cambios» ni se relanza.
    "informe",
}

# (2026-09-29) Las colas de los sueños profundos (`cola-suenos-<fecha>.json`) y su propuesta
# (`cola-suenos-propuesta-<fecha>.json`) NO son demanda del vigilante: los sueños los lanza
# `scripts/puente/suenos.py` (o Genesis) y los relanza el supervisor Claude; la propuesta
# espera a que una persona la abra en el Diseñador. Si el vigilante las cogiera, metería
# análisis en un orquestador viejo que no sabe soñar y lanzaría una propuesta sin mirar.
PREFIJO_SUENOS = "cola-suenos-"


def es_cola_fuente(nombre):
    """Las colas `auto-*` son copias de ejecución, nunca demanda nueva."""
    return (
        nombre.startswith("cola-")
        and nombre.endswith(".json")
        and not nombre.startswith("cola-auto-")
    )


def es_cola_de_codigo(nombre):
    """Cola fuente que puede alimentar al orquestador de CÓDIGO (Mac o nube).

    (2026-10-03) Los sueños quedan fuera SIEMPRE, no solo en `seleccionar_pendientes`:
    `repartir-a-nube.py` leía `es_cola_fuente` a secas y mandó la propuesta de los sueños
    (SP09294, SP092914…) a la nube, donde fallaron tres veces cada una; y un vigilante
    arrancado antes del filtro metió 84 análisis SA en `cola-auto-1001-*`. La cola de sueños
    la corre `suenos.py` y la propuesta espera a una persona: ninguna de las dos es demanda
    para quien escribe código.
    """
    return es_cola_fuente(nombre) and not nombre.startswith(PREFIJO_SUENOS)


def ultima_salida(lineas, tope=200):
    """Del registro del orquestador saca (codigo_exit, motivo) de la ÚLTIMA línea
    `__EXIT__=N`. El motivo es la última línea no vacía anterior. Si no hay
    marca `__EXIT__`, devuelve (None, "")."""
    codigo, motivo = None, ""
    anterior = ""
    for linea in lineas:
        limpia = linea.rstrip()
        if limpia.startswith("__EXIT__="):
            try:
                codigo = int(limpia.split("=", 1)[1].strip())
            except ValueError:
                codigo, motivo = None, ""
            else:
                motivo = anterior[:tope]
        elif limpia:
            anterior = limpia
    return codigo, motivo


def _ids_de_asunto(asunto):
    """Los textos que `(?:^|·\\s*)<id>\\s*:` reconocería en un asunto: lo que va del principio,
    o de cada «·» (saltando espacios), hasta los primeros dos puntos, sin espacios al final."""
    asunto = str(asunto or "")
    trozos = [asunto] + [p.lstrip() for p in asunto.split("·")[1:]]
    ids = set()
    for t in trozos:
        if ":" in t:
            ids.add(t.split(":", 1)[0].rstrip())
    return ids


# (2026-10-19) Índice de los últimos asuntos vistos. Antes cada llamada compilaba una regex y
# recorría TODOS los asuntos: 2.770 llamadas × ~4.000 asuntos = 11 millones de búsquedas y
# ~100 s de «Buscar más capacidad», que pasaba del tope de 150 s del botón con la Mac cargada.
# Se guarda la referencia al objeto para que su id() no pueda reutilizarse mientras está aquí.
_INDICES_ASUNTOS = []


def _indice_asuntos(asuntos):
    for obj, largo, indice in _INDICES_ASUNTOS:
        if obj is asuntos and largo == len(asuntos):
            return indice
    indice = set()
    for asunto in asuntos:
        indice |= _ids_de_asunto(asunto)
    _INDICES_ASUNTOS.insert(0, (asuntos, len(asuntos), indice))
    del _INDICES_ASUNTOS[4:]
    return indice


def id_en_asuntos(tid, asuntos):
    """Reconoce el id INTEGRADO: el asunto de un commit de integración («Ola 228 · V2: …»,
    «345 · NE3-1: …», «salvavidas · NE3-1: …»), con el id justo antes de los dos puntos.
    Una mención en otro asunto («reparto a la nube (CC2, MD1)») no cuenta (2026-09-21).
    Con listas o tuplas usa un índice (misma respuesta que la regex, en tiempo constante)."""
    if not tid:
        return False
    if isinstance(asuntos, (list, tuple)):
        return str(tid) in _indice_asuntos(asuntos)
    patron = re.compile(r"(?:^|·\s*)%s\s*:" % re.escape(tid))
    return any(patron.search(asunto) for asunto in asuntos)


def base_de_cadena(tid):
    """«CAMR1005Db» → «CAMR1005D»: la misma regla que `obtenerBaseId` de Genesis (una letra
    minúscula b-z al final, detrás de mayúscula o cifra, marca un reintento de la cadena)."""
    tid = str(tid or "")
    if len(tid) > 1 and tid[-1] in "bcdefghijklmnopqrstuvwxyz" and (tid[-2].isdigit() or tid[-2].isupper()):
        return tid[:-1]
    return tid


def sucesora_integrada(dep, progreso, asuntos_git=()):
    """La sucesora de `dep` (misma cadena, letra posterior) ya integrada, o None.

    (2026-10-08) CAMR1005F esperaba a CAMR1005Db; si Db falla y la repara CAMR1005Dc, la
    integración llega con el id «Dc» y la dependencia «Db» no se cumplía NUNCA: la cadena
    quedaba muerta aunque el trabajo estuviera en main. Una sucesora integrada la cumple."""
    base = base_de_cadena(dep)
    for k, v in sorted((progreso or {}).items() if isinstance(progreso, dict) else []):
        if k == dep or k <= dep or base_de_cadena(k) != base:
            continue
        est = v.get("estado") if isinstance(v, dict) else ""
        if est in ("commit", "hecho") or id_en_asuntos(k, asuntos_git or []):
            return k
    return None


def seleccionar_pendientes(colas, progreso, asuntos_git, ahora=None):
    """Deduplica por id y excluye cierres, copias automáticas e integradas en git.

    Si progreso[tid] tiene `modelo_siguiente`, devuelve una COPIA de la tarea con ese modelo.
    `colas` llega ordenada de más nueva a más antigua como pares
    `(nombre, tareas)`, de modo que ante deuda histórica gana la definición nueva.

    Con `ahora` (datetime) la salida se reordena con `prioridad_logica.ordenar`:
    primero lo que desbloquea más trabajo, y fuera lo bloqueado por dependencias
    abiertas (no es ejecutable, así que no se ofrece). Sin `ahora` el orden es
    exactamente el del archivo, para no moverle el suelo a quien ya llama.
    """
    vistas, salida = set(), []
    # (2026-09-24) Una dependencia que YA está en main cuenta como hecha aunque el progreso
    # no la conozca. p318I se integró el 13 («… · p318I: …») y no tiene entrada en
    # progreso.json: aquí, en el orquestador y en la nube salía «(?)» y p318Jb/p318Jc se
    # bloqueaban para siempre, mientras Genesis las daba por libres. Se quita de `depende`
    # en la copia que se reparte: lo mismo que ya hacía el reparto a la nube para decidir.
    integradas = {}

    def _ya_en_main(dep):
        if dep not in integradas:
            e = progreso.get(dep) if isinstance(progreso, dict) else None
            est = e.get("estado") if isinstance(e, dict) else ""
            integradas[dep] = (est in ("commit", "hecho") or id_en_asuntos(dep, asuntos_git or [])
                               or sucesora_integrada(dep, progreso, asuntos_git) is not None)
        return integradas[dep]

    for nombre, tareas in colas:
        if not es_cola_de_codigo(nombre):
            continue
        for tarea in tareas:
            if not isinstance(tarea, dict) or not tarea.get("id"):
                continue
            tid = str(tarea["id"])
            if tid in vistas:
                continue
            vistas.add(tid)
            estado = progreso.get(tid, {})
            actual = estado.get("estado") if isinstance(estado, dict) else ""
            if actual in ESTADOS_NO_AUTOMATICOS or id_en_asuntos(tid, asuntos_git):
                continue
            # Si el progreso indica un modelo_siguiente, devolver copia con ese modelo
            seleccionada = tarea
            modelo_siguiente = (
                estado.get("modelo_siguiente") if isinstance(estado, dict) else None
            )
            if modelo_siguiente:
                seleccionada = dict(tarea)
                seleccionada["modelo"] = modelo_siguiente
            # (2026-09-23) «Reintentar con un cambio» escribía `cambio_pedido` y nadie lo
            # leía: la tarea salía con su prompt de siempre. Y una bloqueada por una
            # dependencia muerta seguía fuera por esa dependencia. Ahora el cambio va en el
            # prompt y `quitar_dependencias` sale de `depende` ANTES de ordenar.
            seleccionada = aplicar_cambio_pedido(seleccionada, estado)
            deps = seleccionada.get("depende") or []
            if isinstance(deps, str):
                deps = [deps]
            ya = [str(d) for d in deps if _ya_en_main(str(d))]
            if ya:
                seleccionada = dict(seleccionada)
                seleccionada["depende"] = [d for d in deps if str(d) not in ya]
                seleccionada["dependencias_ya_en_main"] = ya
            salida.append(seleccionada)
    if ahora is not None and prioridad_logica is not None:
        listas, _bloqueadas = prioridad_logica.ordenar(salida, progreso, ahora)
        return [tarea for tarea, _puntos, _razones in listas]
    return salida


def decidir_relanzamiento(cfg, hay_orquestador, n_pendientes):
    """Decisión pura de relanzar sin tocar disco ni procesos.

    Devuelve (relanzar, trabajadores, tope). No relanza si el orquestador ya
    vive, si no queda trabajo o si Genesis puso `pausado` para ajustar.
    """
    trabajadores = int(cfg.get("trabajadores", 5))
    tope = int(cfg.get("tope_por_relanzamiento", 20))
    if hay_orquestador or n_pendientes <= 0 or cfg.get("pausado"):
        return (False, trabajadores, tope)
    return (True, trabajadores, tope)


#: (2026-10-08) `intentos_auto`: la escalera del director (libre×2 → … → bloqueante) llega
#: también por aquí con el orquestador vivo; sin su cuenta repetiría «libre» para siempre.
#: (2026-10-10) `reintentos_medio`: los reintentos por fallo del MEDIO no suben la escalera, pero
#: tienen tope; sin viajar aquí el contador se perdía en la tanda viva y no habría tope.
CAMPOS_CORRECCION = ("estado", "nota", "medio", "modelo_siguiente", "intentos_auto", "reintentos_medio")


def aplicar_correcciones(progreso, correcciones):
    """Funde `correcciones` ({tid: {estado, nota, medio, modelo_siguiente}}) en una COPIA
    de `progreso`. Solo esos campos; el resto de la entrada se conserva. Devuelve
    (progreso_nuevo, aplicadas). Se llama con el orquestador PARADO: con él vivo, su
    copia en memoria pisaría el cambio (2026-09-20)."""
    if not isinstance(correcciones, dict) or not correcciones:
        return progreso, []
    salida = {k: (dict(v) if isinstance(v, dict) else v) for k, v in (progreso or {}).items()}
    aplicadas = []
    for tid, c in correcciones.items():
        if not isinstance(c, dict) or not str(c.get("estado") or "").strip():
            continue
        e = salida.get(tid) if isinstance(salida.get(tid), dict) else {}
        # (2026-10-08) Una corrección de una tarea de la tanda viva espera a que la tanda
        # muera; si entretanto la tarea se INTEGRÓ, aplicarla la devolvería a «pendiente»
        # (la escalera del director reabrió PT1009Cb y CPA1007Kb a las 17:22 y su
        # corrección seguía en el archivo). Una corrección ANTERIOR a la integración no la
        # deshace; una posterior (alguien la reabre a propósito) sí manda.
        t_c, t_e = str(c.get("t") or ""), str(e.get("t") or "")
        if (e.get("estado") in ("commit", "hecho") and c.get("estado") not in ("commit", "hecho")
                and t_c and t_e and t_c < t_e):
            continue
        for campo in CAMPOS_CORRECCION:
            if campo in c:
                e[campo] = c[campo]
        e["corregido"] = str(c.get("t") or "director")
        salida[str(tid)] = e
        aplicadas.append(str(tid))
    return salida, aplicadas


#: Estados en disco de una tarea de la tanda viva que una corrección «pendiente» sí debe sacar de
#: su sitio (la tarea está QUIETA en la memoria del orquestador). Pendiente, en curso, integrada o
#: cerrada no: o ya volvió, o trabaja, o está hecha.
QUIETAS_REABRIBLES = frozenset({
    "fallo", "fallo_tsc", "fallo_tests", "fallo_motor", "sin_cambios", "conflicto",
    "interrumpida", "estancado", "bloqueante", "bloqueada",
})


def _norma(texto):
    return re.sub(r"\W+", " ", str(texto or "")).strip().lower()


def es_sucesora(k, tid, tareas=None):
    """¿`k` rehace a `tid` (Xb → Xc, X → Xb, «S1010-EV-ORACLE-1a» → «…-1ab», X → X-d1)?

    (2026-10-10, medido) «S1010-EV-ORACLE-1b» NO es la sucesora de «S1010-EV-ORACLE-1a»: son dos
    tareas distintas de la misma ola que comparten base por casualidad (1b depende de 1a). Por
    eso no basta la base de la cadena: hace falta que el id de `k` empiece por el de `tid`, o
    que las dos digan lo mismo (título o archivos)."""
    k, tid = str(k or ""), str(tid or "")
    if not k or not tid or k == tid or k <= tid:
        return False
    if k.startswith(tid):
        resto = k[len(tid):]
        return bool(re.fullmatch(r"[a-z]{1,2}|-d\d+[a-z]?", resto))
    if base_de_cadena(k) != base_de_cadena(tid) or base_de_cadena(tid) == tid:
        return False
    tk = (tareas or {}).get(k) or {}
    tt = (tareas or {}).get(tid) or {}
    if _norma(tk.get("titulo")) and _norma(tk.get("titulo")) == _norma(tt.get("titulo")):
        return True
    fk = sorted(str(a) for a in (tk.get("archivos") or []))
    ft = sorted(str(a) for a in (tt.get("archivos") or []))
    return bool(fk) and fk == ft


def tiene_sucesora_viva(tid, progreso, tareas=None):
    """La sucesora de `tid` que sigue en juego (no rechazada ni descartada), o None."""
    candidatas = set(progreso or {}) | set(tareas or {})
    for k in sorted(candidatas):
        if not es_sucesora(k, tid, tareas):
            continue
        e = (progreso or {}).get(k)
        est = e.get("estado") if isinstance(e, dict) else ""
        if est in ("rechazada", "descartada"):
            continue
        return k
    return None


def _t_epoch(t):
    if isinstance(t, (int, float)):
        return float(t)
    s = str(t or "")[:19].replace("T", " ")
    try:
        return time.mktime(time.strptime(s, "%Y-%m-%d %H:%M:%S"))
    except ValueError:
        return 0.0


def clave_reapertura(correccion):
    """El PELDAÑO de la escalera que pide una corrección: (intentos, reintentos del medio, modelo).
    El director reescribe la misma corrección en cada pasada con otra hora; el peldaño no cambia."""
    c = correccion if isinstance(correccion, dict) else {}
    return "%s|%s|%s" % (
        int(c.get("intentos_auto") or 0),
        int(c.get("reintentos_medio") or 0),
        str(c.get("modelo_siguiente") or ""),
    )


def reaperturas_de_la_tanda(correcciones, progreso, en_cola, pedidas, ahora, tareas=None,
                            perdida_s=1800):
    """PURA. {tid: clave} de las correcciones que hay que pedir a la tanda viva con `reabrir`.

    (2026-10-10, medido) El vigilante recordaba en memoria «ya pedí reabrir X en esta tanda» y no
    lo volvía a pedir NUNCA: la escalera reabría PM1010F0Bc (1/8), volvía a fallar y su «2/8»
    se quedaba en `progreso-correcciones.json` para siempre. La tanda llevaba 14 h viva: 77
    tareas en cadena detrás de raíces que nadie volvía a coger, y Genesis y el revisor las veían
    «pendientes» porque leían la corrección. Ahora se pide cada PELDAÑO una vez:

    - la corrección pide «pendiente» y la tarea es de la tanda viva;
    - en disco sigue QUIETA (fallo, sin cambios…): si ya está pendiente o trabajando, ya volvió;
    - la corrección es posterior a ese fallo (responde a ESTE fallo, no a uno viejo);
    - no tiene una sucesora en juego (Xb, Xc): si la tiene, la cadena sigue por ella y reabrir
      la vieja era hacer el mismo trabajo dos veces;
    - ese peldaño no se pidió ya, salvo que se pidiera hace más de `perdida_s` y la tarea no se
      haya movido desde entonces (la orden se perdió: p. ej. el orquestador se reinició).

    `pedidas`: {tid: {"clave": str, "t": epoch}} de lo ya pedido (persistido por quien llama)."""
    salida = {}
    en_cola = set(en_cola or ())
    for tid, c in (correcciones or {}).items():
        if not isinstance(c, dict) or str(c.get("estado")) != "pendiente" or tid not in en_cola:
            continue
        e = (progreso or {}).get(tid)
        e = e if isinstance(e, dict) else {}
        if e.get("estado") not in QUIETAS_REABRIBLES:
            continue
        t_disco = _t_epoch(e.get("t"))
        if _t_epoch(c.get("t")) + 5 < t_disco:
            continue
        if tiene_sucesora_viva(tid, progreso, tareas):
            continue
        clave = clave_reapertura(c)
        previa = (pedidas or {}).get(tid) if isinstance(pedidas, dict) else None
        if isinstance(previa, dict) and previa.get("clave") == clave:
            t_previa = float(previa.get("t") or 0)
            if not (ahora - t_previa > perdida_s and t_disco < t_previa):
                continue
        salida[tid] = clave
    return salida


def ids_colisionados(tareas, asuntos, progreso=None):
    """Ids de una cola que YA figuran integrados en main (otra ola los usó) y cuya tarea no
    consta integrada en progreso: el vigilante los saltaría en silencio para siempre.
    Un id vive en UNA sola cola (2026-09-20: MD1, MD2, AG1, AG2, W1 y W2 repetidos)."""
    salida = []
    for t in tareas or []:
        tid = str((t or {}).get("id") or "")
        if not tid:
            continue
        e = (progreso or {}).get(tid) if isinstance(progreso, dict) else None
        estado = e.get("estado") if isinstance(e, dict) else None
        if estado in ("commit", "integrada", "sustituida"):
            continue
        if id_en_asuntos(tid, asuntos):
            salida.append(tid)
    return salida
