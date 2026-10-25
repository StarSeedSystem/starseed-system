#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Reimaginar propuestas de la imaginación (Ola 1024I · IMG1024C, contrato §1–§3).

Una propuesta en «reimaginando» (la pidió Alex con sus notas y referencias, o la automática con
la crítica de por qué no llegó) se convierte en UNA tarea de análisis para el enjambre
(`tipo: "analisis"`, `modo: "reimaginar"`): leer la propuesta, sus notas, referencias y archivos y
devolver una versión nueva en formato libre, que se guarda en
`starseed_memory_root/imaginacion/agentes/reimaginada-<id seguro>-v<n>.json` (n = la versión que se
reimagina). La recoge la fuente «agentes»: la nueva entra con `version = n + 1` y `version_de = id`
y la vieja pasa a «reimaginada». Diseño, contenido e investigación piden el rol de diseño
(`rol: "diseno"`, `capacidad: "alta"`) para que el orquestador elija su mejor modelo de diseño.

PURO salvo `encolar` (la única función de E/S, fina y atómica). El tope `max_reimaginaciones` corta
la cadena de la AUTOMÁTICA; lo que pide Alex se hace siempre (es su decisión, una a una).
"""
from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime, timedelta

import autodesarrollo_decidir as AD
import autodesarrollo_fuentes as AF

CARPETA_AGENTES = os.path.join("starseed_memory_root", "imaginacion", "agentes")
#: `cola-suenos-`: los orquestadores de CÓDIGO no toman estas colas (vigilante_logica.PREFIJO_SUENOS);
#: un análisis en un orquestador que no sabe reimaginar acabaría en «fallo». Una cola por día.
PREFIJO_COLA = "cola-suenos-reimaginar-"
POR = ("alex", "automatica")
TIPOS_DISENO = ("diseno", "contenido", "investigacion")
LECTURAS_DISENO = ("memory/diseno/identidades.md", "memory/diseno/armonia.md", "memory/diseno/referencias.md")
CADUCA_H = 72
MAX_CUERPO_PROMPT = 4000


def nombre_salida(p):
    """`reimaginada-<id seguro>-v<n>.json`: el id lleva «:», espacios y acentos; el nombre, no (y lleva un
    resumen del id: dos ids que se escriben igual sin acentos no comparten archivo)."""
    return "reimaginada-%s-v%d.json" % (AF.id_seguro(p.get("id") or "x", 60, unico=True), AD.version(p))


def ruta_salida(p):
    """Relativa a la raíz del repositorio (como `archivos` de una tarea)."""
    return "/".join((CARPETA_AGENTES.replace(os.sep, "/"), nombre_salida(p)))


def id_tarea(p):
    return "RIM-%s-v%d" % (AF.id_seguro(p.get("id") or "x", 44, unico=True), AD.version(p) + 1)


def pedir(p, notas, referencias, por, ahora_iso):
    """Pasa `p` a «reimaginando» con lo que se pide (notas ≤ 2000, referencias https ≤ 20)."""
    antes = p.get("estado") if p.get("estado") not in (None, "reimaginando") else "nueva"
    p["estado"] = "reimaginando"
    p["reimaginacion"] = {"notas": str(notas or "")[:AD.MAX_NOTAS], "referencias": AF.referencias(referencias),
                          "pedida": ahora_iso, "por": por if por in POR else "automatica", "antes": antes}
    return p


def _reim(p):
    r = p.get("reimaginacion")
    return r if isinstance(r, dict) else {}


def _prompt(p, notas, refs, diseno):
    lineas = [
        "IMAGINACIÓN · reimaginar, NO escritura: no edites ningún archivo del repositorio ni hagas commits.",
        "",
        "Reimagina esta propuesta con estas notas y referencias; devuelve una versión nueva en formato libre.",
    ]
    if diseno:
        lineas.append("Hazlo como profesional del diseño gráfico, con la identidad de StarSeed OS "
                      "(lee " + ", ".join(LECTURAS_DISENO) + ").")
    lineas += ["", "Propuesta v%d (tipo %s, ámbito %s): «%s»" % (AD.version(p), p.get("tipo") or "codigo",
                                                                 p.get("ambito") or "metagenesis", p.get("titulo") or ""),
               str(p.get("cuerpo") or "")[:MAX_CUERPO_PROMPT], "", "Notas para mejorarla:", notas or "(sin notas)"]
    if refs:
        lineas += ["", "Referencias:"] + ["- %s — %s" % (r["titulo"], r["url"]) for r in refs]
    if p.get("archivos"):
        lineas += ["", "Archivos citados: " + ", ".join(p["archivos"][:20])]
    lineas += ["", "Devuelve SOLO JSON: una lista con UNA propuesta {titulo (≤ 200), cuerpo (Markdown libre ≤ 8000), "
               "tipo (codigo·diseno·contenido·investigacion·otro), referencias [{titulo, url}] solo https y ≤ 20, "
               "archivos [rutas relativas que existan hoy], accion?, impacto? (1-5), esfuerzo? (1-5), importancia?, "
               "version_de: \"%s\"}. Se guarda en %s." % (p.get("id"), ruta_salida(p))]
    return "\n".join(lineas)


def tarea(p, ahora):
    """La tarea de análisis que reimagina `p`. PURA (el reloj entra por `ahora`)."""
    r = _reim(p)
    refs = AF.referencias((r.get("referencias") or []) + list(p.get("referencias") or []))
    notas = str(r.get("notas") or "")[:AD.MAX_NOTAS]
    diseno = (p.get("tipo") or "codigo") in TIPOS_DISENO
    t = {"id": id_tarea(p), "ola": "Imaginación · reimaginar %s" % ahora.strftime("%Y-%m-%d"),
         "titulo": ("Reimaginar · %s" % (p.get("titulo") or p.get("id")))[:200], "tipo": "analisis",
         "modo": "reimaginar", "area": "imaginacion", "archivos": list(p.get("archivos") or [])[:3], "depende": [],
         "propuesta": {k: p.get(k) for k in ("id", "fuente", "agente", "tipo", "ambito", "titulo", "cuerpo",
                                             "referencias", "archivos", "version") if p.get(k) is not None},
         "notas": notas, "referencias": refs, "por": r.get("por") or "automatica",
         "salida": ruta_salida(p), "version_de": p.get("id"), "version": AD.version(p) + 1,
         "prompt": _prompt(p, notas, refs, diseno)}
    if diseno:
        t.update(rol="diseno", capacidad="alta", lecturas=list(LECTURAS_DISENO))
    return t


def pendientes(propuestas, maximo, ahora):
    """(tareas, devueltas). Cada «reimaginando» sin tarea da una; la AUTOMÁTICA que ya no tiene
    reimaginaciones libres (p. ej., porque bajaste el tope) vuelve a la lista manual en vez de
    encargarse. No toca nada: quien llama aplica `devolver` y `marcar_encolada`."""
    tareas, devueltas = [], []
    for p in propuestas:
        if not isinstance(p, dict) or p.get("estado") != "reimaginando" or _reim(p).get("tarea"):
            continue
        if _reim(p).get("por") != "alex" and AD.reimaginaciones_libres(p, maximo) <= 0:
            devueltas.append(p)
            continue
        tareas.append(tarea(p, ahora))
    return tareas, devueltas


def devolver(p, motivo, ahora_iso):
    """Vuelve a la lista manual (el estado de antes si era decidible; si no, «nueva»)."""
    r = _reim(p)
    antes = r.get("antes")
    p["estado"] = antes if antes in ("nueva", "esperando-aprobacion", "pregunta", "pospuesta", "descartada") else "nueva"
    p["motivo_destino"] = str(motivo)[:300]
    if r:
        r["devuelta"] = ahora_iso
    return p


def marcar_encolada(p, t, cola, ahora_iso):
    r = p.setdefault("reimaginacion", {})
    r.update(tarea=t["id"], salida=t["salida"], cola=cola, encolada=ahora_iso)
    return p


def esperadas(propuestas):
    """{nombre del archivo de salida: {id, version}} de las reimaginaciones encargadas (para la fuente)."""
    fuera = {}
    for p in propuestas:
        r = _reim(p) if isinstance(p, dict) else {}
        if p.get("estado") == "reimaginando" and r.get("salida"):
            fuera[os.path.basename(str(r["salida"]))] = {"id": p.get("id"), "version": AD.version(p)}
    return fuera


def enlazar(nueva, previas, ahora_iso):
    """Si `nueva` es la versión de una propuesta conocida: `version = n + 1`, hereda el ámbito (una
    reimaginación nunca cambia de dueño), el tipo y la verificación del hallazgo (lo que se verificó fue
    el problema, no la redacción), y la vieja pasa de «reimaginando» a «reimaginada». Devuelve la vieja."""
    vieja = previas.get(nueva.get("version_de")) if isinstance(previas, dict) else None
    if not isinstance(vieja, dict) or vieja is nueva:
        return None
    nueva["version"] = AD.version(vieja) + 1
    nueva["ambito"] = vieja.get("ambito") or "metagenesis"
    nueva["tipo"] = vieja.get("tipo") or nueva.get("tipo") or "codigo"
    # Ola 1025S: una versión nueva nunca baja la importancia de la cadena (reimaginar no «lava» una alta o una
    # crítica para que la automática la integre sola): la de la vieja entra como declarada si es mayor.
    piso, declarada = AD.importancia(vieja), AD.nivel(nueva.get("importancia_declarada"))
    if AD.NIVELES.index(piso) > AD.NIVELES.index(declarada or "baja"):
        nueva["importancia_declarada"] = piso
    if vieja.get("verificacion"):
        nueva["verificacion"] = vieja["verificacion"]
    for k in ("impacto", "esfuerzo"):
        if nueva.get(k) is None and vieja.get(k) is not None:
            nueva[k] = vieja[k]
    if vieja.get("estado") == "reimaginando":
        vieja["estado"] = "reimaginada"
        vieja.setdefault("reimaginacion", {}).update(recibida=ahora_iso, version_nueva=nueva.get("id"))
    return vieja


def caducadas(propuestas, ahora, horas=CADUCA_H):
    """Las «reimaginando» encargadas hace más de `horas` sin versión nueva (el análisis no llegó)."""
    fuera = []
    for p in propuestas:
        r = _reim(p) if isinstance(p, dict) else {}
        if p.get("estado") != "reimaginando" or not r.get("encolada"):
            continue
        try:
            t = datetime.fromisoformat(str(r["encolada"]))
        except ValueError:
            continue
        if t.tzinfo is not None and ahora.tzinfo is None:
            t = t.replace(tzinfo=None)
        if ahora - t >= timedelta(hours=horas):
            fuera.append(p)
    return fuera


#: Las colas de análisis de la Imaginación que la flota recoge (reimaginar y entregables, Ola 1025S).
PREFIJOS_FLOTA = (PREFIJO_COLA, "cola-suenos-entregables-")
#: Marca de que el analista instalado junto al orquestador sabe hacer análisis libres (IMG1024D).
MARCA_ANALISIS_LIBRE = "_analisis_libre"
DIAS_FLOTA = 3


def tareas_esperadas(mem, ids, ahora, dias=DIAS_FLOTA, listar=os.listdir):
    """Las tareas de las colas de análisis de los últimos `dias` cuyo id sigue esperado (`ids`). Una cola de
    hace tres días cuya propuesta ya volvió (o caducó) no se ofrece: su id ya no está en `ids`."""
    carpeta = os.path.join(mem, "olas")
    try:
        nombres = sorted(listar(carpeta))
    except OSError:
        return []
    limite = (ahora - timedelta(days=dias)).strftime("%Y-%m-%d")
    fuera, vistos = [], set()
    for n in nombres:
        pref = next((p for p in PREFIJOS_FLOTA if n.startswith(p) and n.endswith(".json")), None)
        if not pref or n[len(pref):-5] < limite:
            continue
        try:
            with open(os.path.join(carpeta, n), encoding="utf-8") as f:
                lista = json.load(f)
        except (OSError, ValueError):
            continue
        for t in lista if isinstance(lista, list) else []:
            if isinstance(t, dict) and t.get("id") in ids and t["id"] not in vistos:
                vistos.add(t["id"]); fuera.append(t)
    return fuera


def a_la_flota(raiz, tareas, vivos=None, apto=None, libre=None):
    """Ola 1025S: entrega las tareas de análisis de la Imaginación al orquestador VIVO (la «tanda viva» de
    `suenos.py lanzar` y del agente de referencias de diseño). Antes nadie lanzaba las colas
    `cola-suenos-reimaginar-*`/`-entregables-*` (el prefijo aparta a los orquestadores de código, a
    propósito): la reimaginación esperaba hasta caducar.
    · Nunca arranca un orquestador (la regla es UNO) ni sustituye una tarea que ya está en su cola.
    · Solo si el instalado sabe analizar y hacer análisis libres, y el vivo arrancó DESPUÉS de instalar el analista.
    `vivos`, `apto` (bool, mtime) y `libre` (bool, mtime) son inyectables (pruebas)."""
    if not tareas:
        return {"accion": "nada", "tareas": 0}
    import suenos as S  # noqa: WPS433  (vía común de los sueños; import perezoso: pesa)
    vivos = S.orquestadores_vivos() if vivos is None else vivos
    apto_orq, mtime_orq = S.orquestador_instalado_apto() if apto is None else apto
    if libre is None:
        ruta = os.path.join(os.path.dirname(S.ruta_orquestador()), "analista.py")
        try:
            with open(ruta, encoding="utf-8") as f:
                libre = (MARCA_ANALISIS_LIBRE in f.read(), os.path.getmtime(ruta))
        except OSError:
            libre = (False, 0.0)
    sabe_libre, mtime_libre = libre
    n = len(tareas)
    if not apto_orq or not sabe_libre:
        return {"accion": "cola_lista", "tareas": n, "motivo": "el orquestador instalado no sabe hacer análisis libres "
                "(bash scripts/enjambre/instalar.sh): las tareas esperan en su cola"}
    # Cuenta la instalación del ANALISTA, no la del orquestador: el orquestador solo pasa la tarea de análisis
    # a `analista.py` (que cargó al arrancar). Reinstalar el orquestador por otro arreglo no debe dejar la
    # reimaginación esperando a que el vivo termine su tanda.
    capaces = [o for o in vivos if S.puede_sonar(o, float(mtime_libre or 0))]
    if not capaces:
        return {"accion": "esperar" if vivos else "cola_lista", "tareas": n, "motivo": (
            "el orquestador vivo arrancó antes de instalar el analista o va en tanda manual: espera a que termine"
            if vivos else "no hay orquestador vivo: el vigilante lo arranca y el próximo ciclo se las da")}
    o = capaces[0]
    viva = os.path.join(S.rutas(raiz)["olas"], o["cola"])
    prev = S._leer_json(viva, [])
    lista = prev if isinstance(prev, list) else (prev.get("tareas") or [] if isinstance(prev, dict) else [])
    ya = {t.get("id") for t in lista if isinstance(t, dict)}
    nuevas = [t for t in tareas if t.get("id") not in ya]
    if nuevas:
        S._escribir_json(viva, S.fundir_tareas(lista, nuevas) if isinstance(prev, list)
                         else dict(prev, tareas=S.fundir_tareas(lista, nuevas)))
    return {"accion": "tanda_viva", "tareas": len(nuevas), "ya_estaban": n - len(nuevas), "pid": o.get("pid"),
            "cola_viva": o["cola"], "motivo": "añadidas a la cola viva (%s), con el tope de análisis propio" % o["cola"]}


def encolar(mem, tareas, ahora, prefijo=PREFIJO_COLA):
    """E/S: añade `tareas` a `olas/<prefijo><fecha>.json` (por defecto `cola-suenos-reimaginar-`) sin repetir
    ids (escritura atómica). Devuelve el nombre de la cola (None si no hay tareas; si ya estaban todas, no
    reescribe). Los entregables de la Ola 1025S usan la misma vía con `cola-suenos-entregables-`."""
    if not tareas:
        return None
    nombre = prefijo + ahora.strftime("%Y-%m-%d") + ".json"
    ruta = os.path.join(mem, "olas", nombre)
    try:
        with open(ruta, encoding="utf-8") as f:
            previas = json.load(f)
    except (OSError, ValueError):
        previas = []
    previas = previas if isinstance(previas, list) else []
    ids = {t.get("id") for t in previas if isinstance(t, dict)}
    nuevas = [t for t in tareas if t["id"] not in ids]
    if not nuevas:
        return nombre
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(ruta), prefix=".tmp_")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(previas + nuevas, f, ensure_ascii=False, indent=1)
            f.write("\n")
        os.replace(tmp, ruta)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise
    return nombre
