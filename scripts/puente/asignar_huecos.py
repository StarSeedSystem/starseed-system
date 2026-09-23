#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Comprobar y asignar: ¿cabe más trabajo en los trabajadores que hay? Y si cabe, meterlo YA.

POR QUÉ (2026-09-23)
--------------------
Alex: «agrega botones para buscar y asignar tareas faltantes … en Tareas en curso, en
Agentes y en Listas para trabajar, en cada una y en general, para comprobar si es posible
activar o asignar tareas o agentes automáticamente».

El reparto automático ya existe: el vigilante, cada 90 s, mete en la tanda viva las
pendientes nuevas (`alimentar_tanda_viva`) o lanza una tanda si no hay ninguna, y el
orquestador coge la siguiente de su cola cuando queda un trabajador libre. Lo que faltaba
era poder PREGUNTAR y ACTUAR desde el Mando sin esperar la vuelta, y sobre todo saber POR
QUÉ no entra una tarea: trabajadores llenos, tope del gobernador por RAM, pausa, una
conversación con Astraura, disco lleno, una tanda manual (`--solo`) o una dependencia.

Reglas que NO se rompen aquí:
  · Nada en marcha se interrumpe: esto solo añade tareas a la cola viva o reordena las que
    aún no han empezado.
  · Un solo lanzador: si no hay tanda, se despierta al VIGILANTE (que es quien lanza), nunca
    se lanza un orquestador desde aquí. Dos lanzadores a la vez son dos orquestadores.
  · El tope del gobernador (RAM) no se salta: se explica.

Uso:
  python3 asignar_huecos.py comprobar [--tarea ID]    → JSON, sin tocar nada
  python3 asignar_huecos.py asignar   [--tarea ID]    → JSON, mete/adelanta/despierta
"""

import datetime
import json
import os
import re
import shutil
import subprocess
import sys
import time

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

RAIZ = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(DIRECTORIO))
OLAS = os.path.join(RAIZ, "starseed_memory_root", "olas")
PROGRESO = os.path.join(OLAS, "progreso.json")
GOBERNADOR = os.path.expanduser("~/.starseed/gobernador.json")
PATRON_ORQ = re.compile(r"^[^ ]*[Pp]ython[0-9.]* +-u +.*starseed-enjambre\.py")
FRESCURA_GOBERNADOR_S = 900
DISCO_BLOQUEA_GB = 2.0
DISCO_AVISA_GB = 5.0
WORKERS_POR_DEFECTO = 5
SERVICIO_VIGILANTE = "com.starseed.vigilante"

# Estados que ya no ocupan trabajador ni esperan turno en la tanda.
CERRADOS = {
    "commit", "hecho", "integrada", "sin_cambios", "fallo", "fallo_tsc", "fallo_tests",
    "conflicto", "reasignada", "rechazada", "pendiente_aprobacion", "esperando_aprobacion",
    "bloqueada", "bloqueante", "sustituida", "descartada",
}


# ─────────────────────────────── puro ───────────────────────────────

def tanda_de_procesos(lineas_args):
    """Del `ps -axo args=` saca la tanda viva: {cola, workers, solo} o None.

    Solo cuenta una orden que EMPIEZA por python (un grep o el prompt de un agente que
    mencione el script no es un orquestador: esa trampa ya dio orquestadores fantasma)."""
    for linea in lineas_args or ():
        if not PATRON_ORQ.match(linea or ""):
            continue
        trozos = linea.split()
        cola = next(
            (os.path.basename(t) for t in trozos if t.endswith(".json") and os.path.basename(t).startswith("cola-")),
            None,
        )
        workers = WORKERS_POR_DEFECTO
        if "--workers" in trozos:
            try:
                workers = int(trozos[trozos.index("--workers") + 1])
            except (ValueError, IndexError):
                pass
        return {"cola": cola, "workers": max(1, workers), "solo": "--solo" in trozos}
    return None


def tope_efectivo(workers, gobernador, ahora):
    """(tope, motivo). El gobernador solo puede BAJAR el máximo, y uno muerto (archivo de
    hace más de 15 min) no frena nada: la misma regla que aplica el orquestador."""
    if not isinstance(gobernador, dict):
        return workers, "sin gobernador: vale el máximo de la tanda"
    t = gobernador.get("_mtime")
    if t is not None and ahora - t > FRESCURA_GOBERNADOR_S:
        return workers, "el gobernador no escribe desde hace más de 15 min: vale el máximo de la tanda"
    try:
        n = max(1, int(gobernador.get("trabajadores") or workers))
    except (TypeError, ValueError):
        return workers, "gobernador ilegible: vale el máximo de la tanda"
    motivo = str(gobernador.get("motivo") or "").strip()
    if n < workers:
        return n, "el gobernador lo baja a %d: %s" % (n, motivo or "sin motivo escrito")
    return workers, motivo or "máximo de la tanda"


def _estado(progreso, tid):
    e = progreso.get(tid) if isinstance(progreso, dict) else None
    return str(e.get("estado") or "") if isinstance(e, dict) else ""


def porque_no_esta_lista(tid, progreso, tareas_por_id, en_cola_viva):
    """Una frase: por qué `tid` no está entre las que se pueden coger."""
    estado = _estado(progreso, tid)
    if estado == "en_curso":
        return "ya está en curso"
    if estado in ("commit", "hecho", "integrada"):
        return "ya está integrada en main"
    if estado in ("pendiente_aprobacion", "esperando_aprobacion"):
        return "está esperando visto bueno, no trabajador"
    if estado in CERRADOS:
        nota = ""
        e = progreso.get(tid)
        if isinstance(e, dict) and e.get("nota"):
            nota = ": %s" % str(e["nota"])[:140]
        return "está «%s»%s (se reabre con «Reintentar» en Bloqueadas)" % (estado, nota)
    tarea = tareas_por_id.get(tid)
    if tarea is None:
        return "no la encuentro en ninguna cola"
    deps = tarea.get("depende") or []
    if isinstance(deps, str):
        deps = [deps]
    abiertas = [d for d in deps if _estado(progreso, d) not in ("commit", "hecho", "integrada")]
    if abiertas:
        return "espera a %s, que aún no está integrada" % ", ".join(abiertas)
    if tid in en_cola_viva:
        return "ya está en la cola de la tanda viva, esperando trabajador"
    return "no entra en la selección automática"


def decidir(estado, pedida=None):
    """La decisión entera, sin tocar nada. `estado`:

      tanda: None | {cola, workers, solo, ids: [..], pendientes: [..]}
      ocupados: [ids en_curso de esa tanda]
      tope, motivo_tope
      listas: [ids ordenados que se pueden coger ya] (sin las que están en curso)
      progreso, tareas_por_id
      pausado, conversando, disco_gb

    Devuelve {puede, huecos, meter, adelantar, despertar_vigilante, resumen, motivos}.
    """
    tanda = estado.get("tanda")
    listas = list(estado.get("listas") or [])
    progreso = estado.get("progreso") or {}
    tareas_por_id = estado.get("tareas_por_id") or {}
    motivos = []
    salida = {
        "puede": False,
        "huecos": 0,
        "meter": [],
        "adelantar": None,
        "despertar_vigilante": False,
        "resumen": "",
        "motivos": motivos,
    }

    disco = estado.get("disco_gb")
    if isinstance(disco, (int, float)) and disco < DISCO_BLOQUEA_GB:
        salida["resumen"] = (
            "No asigno nada: quedan %.1f GB de disco y las puertas (tsc, pruebas) fallan con "
            "«disco lleno». Libera espacio y vuelve a pulsar." % disco
        )
        return salida
    if isinstance(disco, (int, float)) and disco < DISCO_AVISA_GB:
        motivos.append("disco justo (%.1f GB): puede fallar alguna puerta" % disco)
    if estado.get("pausado"):
        salida["resumen"] = (
            "El enjambre está EN PAUSA desde el Mando: nadie coge trabajo hasta reanudarlo "
            "(Ajustes → Director)."
        )
        return salida
    if estado.get("conversando"):
        motivos.append(
            "hay una conversación con Astraura: el enjambre está congelado hasta 90 s después de la última frase"
        )

    en_cola = set((tanda or {}).get("ids") or [])
    if pedida:
        if pedida not in listas:
            salida["resumen"] = "%s no se puede asignar ahora: %s." % (
                pedida,
                porque_no_esta_lista(pedida, progreso, tareas_por_id, en_cola),
            )
            return salida

    if tanda is None:
        if not listas:
            salida["resumen"] = "No hay tanda en la Mac y no queda trabajo que se pueda coger ahora."
            return salida
        salida["puede"] = True
        salida["despertar_vigilante"] = True
        if pedida:
            salida["adelantar"] = pedida
        salida["resumen"] = (
            "No hay tanda en la Mac: despierto al vigilante para que lance una ya con %d lista(s)%s, "
            "sin esperar su vuelta de 90 s." % (len(listas), " (%s la primera)" % pedida if pedida else "")
        )
        return salida

    if tanda.get("solo"):
        salida["resumen"] = (
            "La tanda de ahora es manual (--solo) y no admite tareas nuevas: las %d lista(s) "
            "entrarán en la siguiente, que el vigilante lanza sola al acabar esta." % len(listas)
        )
        return salida

    tope = int(estado.get("tope") or tanda.get("workers") or 1)
    ocupados = list(estado.get("ocupados") or [])
    huecos = max(0, tope - len(ocupados))
    salida["huecos"] = huecos
    meter = [t for t in listas if t not in en_cola]
    salida["meter"] = meter
    if pedida:
        salida["adelantar"] = pedida
    esperando = [t for t in (tanda.get("pendientes") or []) if t in listas or t in meter]
    total_espera = len(set(esperando) | set(meter))

    if not meter and not pedida and total_espera == 0:
        salida["resumen"] = (
            "No hay nada que asignar: la tanda viva tiene %d/%d trabajadores ocupados y no queda "
            "trabajo que se pueda coger ahora." % (len(ocupados), tope)
        )
        return salida

    salida["puede"] = True
    partes = []
    if meter:
        partes.append("meto %s en la tanda viva" % ", ".join(meter[:8]) + (" y %d más" % (len(meter) - 8) if len(meter) > 8 else ""))
    elif total_espera:
        partes.append("las %d lista(s) ya están en la cola de la tanda viva" % total_espera)
    if pedida:
        partes.append("%s pasa la primera de la cola" % pedida)
    if huecos > 0:
        partes.append(
            "hay %d trabajador(es) libre(s) de %d: arrancan en cuanto el orquestador relea la cola (≤ 20 s)"
            % (huecos, tope)
        )
    else:
        partes.append(
            "los %d trabajador(es) están ocupados (%s): entran en cuanto uno termine"
            % (tope, estado.get("motivo_tope") or "tope de la tanda")
        )
    frase = "; ".join(partes)
    # Solo la primera letra: `capitalize()` pasaba «LY2» a «ly2».
    salida["resumen"] = frase[:1].upper() + frase[1:] + "."
    return salida


def reordenar_cola(lista, meter_tareas, adelantar):
    """Nueva lista de la cola viva: la de siempre + las nuevas al final, y `adelantar` delante
    de TODAS las que aún no empezaron. Las que corren no se mueven (el orquestador las lleva
    en memoria; moverlas en el archivo no las afecta, pero así el archivo sigue legible)."""
    nueva = [t for t in lista if isinstance(t, dict)]
    ids = {str(t.get("id")) for t in nueva}
    for t in meter_tareas:
        if str(t.get("id")) not in ids:
            nueva.append(t)
            ids.add(str(t.get("id")))
    if adelantar:
        elegida = [t for t in nueva if str(t.get("id")) == adelantar]
        resto = [t for t in nueva if str(t.get("id")) != adelantar]
        nueva = elegida + resto
    return nueva


# ─────────────────────────────── lectura ───────────────────────────────

def _leer_json(ruta, defecto):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def _args_de_procesos():
    try:
        return subprocess.run(["ps", "-axo", "args="], capture_output=True, text=True, timeout=20).stdout.splitlines()
    except Exception:
        return []


def _asuntos_git():
    try:
        return subprocess.run(
            ["git", "log", "main", "--format=%s"], cwd=RAIZ, capture_output=True, text=True, timeout=30
        ).stdout.splitlines()
    except Exception:
        return []


def _colas_fuente():
    from vigilante_logica import es_cola_fuente

    colas = []
    try:
        nombres = sorted(os.listdir(OLAS), reverse=True)
    except OSError:
        nombres = []
    for f in nombres:
        if not es_cola_fuente(f):
            continue
        d = _leer_json(os.path.join(OLAS, f), None)
        if d is None:
            continue
        colas.append((f, d if isinstance(d, list) else d.get("tareas", [])))
    return colas


def reunir(ahora=None):
    """Todo lo que `decidir` necesita, leído de disco y procesos. Nunca lanza."""
    ahora = time.time() if ahora is None else ahora
    from vigilante_logica import seleccionar_pendientes

    progreso = _leer_json(PROGRESO, {})
    if not isinstance(progreso, dict):
        progreso = {}
    colas = _colas_fuente()
    tareas_por_id = {}
    for _nombre, tareas in colas:
        for t in tareas:
            if isinstance(t, dict) and t.get("id") and str(t["id"]) not in tareas_por_id:
                tareas_por_id[str(t["id"])] = t
    seleccion = seleccionar_pendientes(colas, progreso, _asuntos_git(), ahora=datetime.datetime.now())
    listas_tareas = [t for t in seleccion if _estado(progreso, str(t.get("id"))) != "en_curso"]
    listas = [str(t.get("id")) for t in listas_tareas]

    tanda = tanda_de_procesos(_args_de_procesos())
    ocupados = []
    if tanda and tanda.get("cola"):
        ruta = os.path.join(OLAS, tanda["cola"])
        d = _leer_json(ruta, [])
        lista = d if isinstance(d, list) else (d.get("tareas") or [] if isinstance(d, dict) else [])
        ids = [str(t.get("id")) for t in lista if isinstance(t, dict) and t.get("id")]
        tanda["ruta"] = ruta
        tanda["ids"] = ids
        ocupados = [i for i in ids if _estado(progreso, i) == "en_curso"]
        tanda["pendientes"] = [i for i in ids if _estado(progreso, i) not in CERRADOS and i not in ocupados]

    gob = _leer_json(GOBERNADOR, None)
    if isinstance(gob, dict):
        try:
            gob["_mtime"] = os.path.getmtime(GOBERNADOR)
        except OSError:
            pass
    tope, motivo_tope = tope_efectivo((tanda or {}).get("workers", WORKERS_POR_DEFECTO), gob, ahora)

    pausado = False
    try:
        import config_director

        cfg, _ = config_director.cargar()
        pausado = bool(cfg.get("pausado"))
    except Exception:
        pass
    conversando = False
    try:
        import prioridad_conversacion as conv

        conversando = bool(conv.activa(conv.leer_concesion()))
    except Exception:
        pass
    try:
        disco_gb = shutil.disk_usage(RAIZ).free / (1024 ** 3)
    except OSError:
        disco_gb = None

    return {
        "tanda": tanda,
        "ocupados": ocupados,
        "tope": tope,
        "motivo_tope": motivo_tope,
        "listas": listas,
        "listas_tareas": listas_tareas,
        "progreso": progreso,
        "tareas_por_id": tareas_por_id,
        "pausado": pausado,
        "conversando": conversando,
        "disco_gb": disco_gb,
    }


# ─────────────────────────────── efectos ───────────────────────────────

def _escribir_json_atomico(ruta, datos):
    tmp = "%s.tmp-%d" % (ruta, os.getpid())
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    os.replace(tmp, ruta)


def marcar_adelantada(tid, ahora_txt=None):
    """`adelantar` en progreso.json: prioridad_logica la pone la primera en la próxima
    selección (tanda nueva o reparto a la nube). Solo toca ESA entrada."""
    progreso = _leer_json(PROGRESO, None)
    if not isinstance(progreso, dict):
        return False
    entrada = progreso.get(tid) if isinstance(progreso.get(tid), dict) else {}
    entrada["adelantar"] = ahora_txt or time.strftime("%Y-%m-%d %H:%M:%S")
    progreso[tid] = entrada
    _escribir_json_atomico(PROGRESO, progreso)
    return True


def despertar_vigilante():
    """Reinicia el servicio del vigilante: al arrancar hace una pasada en el acto (y es él,
    no nosotros, quien lanza la tanda: un solo lanzador)."""
    try:
        uid = os.getuid()
        r = subprocess.run(
            ["launchctl", "kickstart", "-k", "gui/%d/%s" % (uid, SERVICIO_VIGILANTE)],
            capture_output=True,
            text=True,
            timeout=20,
        )
        return r.returncode == 0
    except Exception:
        return False


def aplicar(estado, decision):
    """Ejecuta la decisión. Devuelve la lista de cosas hechas (frases cortas)."""
    hechas = []
    if not decision.get("puede"):
        return hechas
    if decision.get("adelantar"):
        if marcar_adelantada(decision["adelantar"]):
            hechas.append("%s marcada para ir la primera" % decision["adelantar"])
    tanda = estado.get("tanda")
    if tanda and tanda.get("ruta") and (decision.get("meter") or decision.get("adelantar")):
        d = _leer_json(tanda["ruta"], None)
        if d is not None:
            lista = d if isinstance(d, list) else d.get("tareas") or []
            por_id = {str(t.get("id")): t for t in estado.get("listas_tareas") or []}
            meter_tareas = [por_id[i] for i in decision.get("meter") or [] if i in por_id]
            nueva = reordenar_cola(lista, meter_tareas, decision.get("adelantar"))
            if isinstance(d, list):
                d = nueva
            else:
                d["tareas"] = nueva
            _escribir_json_atomico(tanda["ruta"], d)
            hechas.append("cola viva %s actualizada" % os.path.basename(tanda["ruta"]))
    if decision.get("despertar_vigilante"):
        hechas.append("vigilante despertado" if despertar_vigilante() else "no pude despertar al vigilante")
    return hechas


def _anunciar(texto):
    try:
        import importlib.util

        spec = importlib.util.spec_from_file_location("puente", os.path.join(DIRECTORIO, "puente.py"))
        p = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(p)
        p.decir(texto, "mando", "hecho")
    except Exception:
        pass


def main(argv):
    orden = argv[1] if len(argv) > 1 else "comprobar"
    pedida = None
    if "--tarea" in argv:
        try:
            pedida = argv[argv.index("--tarea") + 1].strip() or None
        except IndexError:
            pedida = None
    estado = reunir()
    decision = decidir(estado, pedida)
    hechas = aplicar(estado, decision) if orden == "asignar" else []
    if orden == "asignar" and hechas:
        _anunciar("Asignar desde el Mando: %s" % decision["resumen"])
    tanda = estado.get("tanda")
    print(
        json.dumps(
            {
                "ok": True,
                "orden": orden,
                "puede": decision["puede"],
                "resumen": decision["resumen"]
                + ("" if not decision["motivos"] else " Además: " + "; ".join(decision["motivos"]) + "."),
                "huecos": decision["huecos"],
                "tope": estado.get("tope"),
                "ocupados": estado.get("ocupados"),
                "listas": estado.get("listas"),
                "meter": decision["meter"],
                "hechas": hechas,
                "tanda": None if not tanda else {"cola": tanda.get("cola"), "workers": tanda.get("workers"), "solo": tanda.get("solo")},
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
