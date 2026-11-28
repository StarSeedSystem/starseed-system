#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Director de flujo (AUT1121B) — vigila que el trabajo arranca y aplica el remedio.

Lanza launchd cada 5 min (ligero). Mide eventos.jsonl y los medidores: listas, en curso con
latido vivo, inicios y commits de los últimos 30 y 120 min, agentes libres por medio (Mac, A1,
Actions, Cloudroom, agy) y la causa del último «no arranco». Decide con la función PURA
`diagnosticar(foto)` entre causas cerradas y medibles, aplica el remedio YA EXISTIENTE de esa
causa y comprueba a los 10 min si funcionó. Apunta causa, remedio y resultado en
`flujo-libro.jsonl`; con ese libro ordena los remedios por lo que de verdad funcionó y propone
cada día una tarea para la causa más repetida. Solo habla cuando actúa o necesita a Alex: una
línea en el canal común.

  python3 scripts/puente/director_flujo.py            # una pasada de diagnóstico (solo lee)
  python3 scripts/puente/director_flujo.py --aplicar   # aplica el remedio del turno
"""
from __future__ import annotations

import json
import os
import shlex
import shutil
import subprocess
import sys
import time

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)
RAIZ = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(DIRECTORIO))
OLAS = os.path.join(RAIZ, "starseed_memory_root", "olas")
MANDO = os.path.join(RAIZ, "starseed_memory_root", "mando")
DOT = os.path.expanduser("~/.starseed")
LIBRO = os.path.join(DOT, "flujo-libro.jsonl")
ESTADO_LIBRO = os.path.join(DOT, "flujo-estado.json")
BUSCAR_CAPACIDAD = os.path.join(DOT, "buscar-capacidad.json")
RENOVACIONES_ESTADO = os.path.join(DOT, "renovaciones-directores.json")
RENOVACIONES_LOG = os.path.join(DOT, "renovaciones-directores.log")

# ── Renovaciones que «Buscar capacidad» pide y los directores hacen solos ───
#: Lista blanca EXACTA: nada de texto libre. Cada comando va como argv, sin shell.
RENOVACIONES_PERMITIDAS = (
    ("python3", "scripts/puente/explabs_promos.py", "actualizar"),
    ("python3", "scripts/puente/renovador-pasarelas.py"),
)
RENOVACIONES_ESPERA_S = 60 * 60
RENOVACIONES_TOPE_S = 300

# ── Causas cerradas (diagnosticar solo devuelve una de estas) ────────────────
CAUSA_DISCO = "disco"
CAUSA_MEMORIA = "memoria"
CAUSA_NUBE_ATRASO = "nube_atraso"
CAUSA_FANTASMA = "fantasma"
CAUSA_MODELOS_CAIDOS = "modelos_caidos"
CAUSA_CI_ROJO = "ci_rojo"
CAUSA_ORQ_SIN_LATIDO = "orquestador_sin_latido"
CAUSA_ESPERA_ALEX = "espera_alex"
CAUSA_COLA_VACIA = "cola_vacia"
TODAS_CAUSAS = (
    CAUSA_DISCO, CAUSA_MEMORIA, CAUSA_NUBE_ATRASO, CAUSA_FANTASMA,
    CAUSA_MODELOS_CAIDOS, CAUSA_CI_ROJO, CAUSA_ORQ_SIN_LATIDO, CAUSA_ESPERA_ALEX,
    CAUSA_COLA_VACIA,
)

# ── Remedios existentes (del enjambre, nunca se inventan aquí) ───────────────
REMEDIO_ALIVIO = "alivio_temporales"
REMEDIO_BUSCAR = "buscar_capacidad_aplicar"
REMEDIO_NUBE_CEDER = "lanzar_nube_ceder"
REMEDIO_FANTASMA = "reabrir_fantasma"
REMEDIO_CUARENTENA = "cuarentena_modelo"
REMEDIO_PUBLICAR = "reintento_publicacion"
REMEDIO_ORQ = "arrancar_orquestador"
REMEDIO_ALEX = "avisar_alex"
REMEDIO_NINGUNO = "ninguno"

# Umbrales (segundos, salvo disco en GB)
VENTANA_INICIOS_S = 30 * 60
VENTANA_COMMITS_S = 120 * 60
FANTASMA_QUIETO_S = 5 * 60
COMPROBAR_DESPUES_S = 10 * 60
RESULTADO_VIGENTE_S = 15 * 60
DISCO_LIBRE_AVISO_GB = 5.0
LATIDO_FRESCO_S = 5 * 60


def _ahora(ahora=None):
    return time.time() if ahora is None else float(ahora)


def _epocho(texto):
    """Cadena ISO o epoch → epoch; lo que no se entiende, None."""
    if texto is None:
        return None
    if isinstance(texto, (int, float)):
        return float(texto)
    from datetime import datetime

    txt = str(texto).strip()[:32]
    try:
        return datetime.fromisoformat(txt).timestamp()
    except ValueError:
        pass
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(txt[:19], fmt).timestamp()
        except ValueError:
            continue
    return None


# ── Publicar / ejecutar (inyectables en pruebas; en producción son reales) ────
def _decir_real(texto, quien="director-flujo", tipo="informe"):
    try:
        import puente

        puente.decir(texto, quien=quien, tipo=tipo)
    except Exception:
        pass


def _correr_real(cmd, segundos=30):
    return subprocess.run(
        cmd, capture_output=True, text=True, timeout=segundos, stdin=subprocess.DEVNULL
    )


# ── Lectura de fuentes (solo E/S; todo lo demás es puro) ─────────────────────
def _leer_json(ruta, defecto):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def _leer_jsonl(ruta):
    """Últimas líneas de un jsonl, una por una (no trae todo el archivo a memoria)."""
    salida = []
    try:
        with open(ruta, encoding="utf-8") as f:
            for linea in f:
                linea = linea.strip()
                if not linea:
                    continue
                try:
                    salida.append(json.loads(linea))
                except ValueError:
                    continue
    except OSError:
        pass
    return salida


# ── La foto (todo lo que diagnosticar necesita) ──────────────────────────────
def leer_foto(ahora=None, leer=None):
    """Lee eventos.jsonl y los medidores. `leer` se inyecta en pruebas; si es un
    callable que devuelve un dict, se usa como foto completa (aislamiento total)."""
    ahora = _ahora(ahora)
    if callable(leer):
        try:
            foto = leer()
        except TypeError:
            foto = None
        if isinstance(foto, dict):
            foto["ahora"] = ahora
            return foto

    def fuente(nombre, ruta, defecto):
        if leer is not None:
            return leer(nombre)
        return _leer_json(ruta, defecto)

    progreso = fuente("progreso", os.path.join(OLAS, "progreso.json"), {})
    colas = fuente("colas", os.path.join(OLAS, "colas.json"), {})
    medios = fuente("medios", os.path.join(MANDO, "contenedores.json"), {})
    gobernador = fuente("gobernador", os.path.join(DOT, "gobernador.json"), {})
    salud = fuente("salud", os.path.join(DOT, "salud-proveedores.json"), {})
    nube_pausada = fuente("nube_pausada", os.path.join(DOT, "nube-pausada.json"), {})

    # eventos.jsonl: inicios, commits y la causa del último «no arranco».
    eventos = []
    if leer is None:
        eventos = _leer_jsonl(os.path.join(OLAS, "eventos.jsonl"))
    elif callable(leer):
        ev = leer("eventos")
        eventos = ev if isinstance(ev, list) else []

    inicios_30 = inicios_120 = commits_30 = commits_120 = 0
    causa_no_arranco = None
    t_no_arranco = 0.0
    for ev in eventos if isinstance(eventos, list) else []:
        if not isinstance(ev, dict):
            continue
        t = _epocho(ev.get("t"))
        if t is None:
            continue
        tipo = str(ev.get("tipo") or "").lower()
        motivo = str(ev.get("motivo") or ev.get("causa") or ev.get("texto") or "")
        if ahora - t <= VENTANA_INICIOS_S and tipo in ("inicio", "arranque", "inicio_tarea"):
            inicios_30 += 1
        if ahora - t <= VENTANA_COMMITS_S and tipo in ("inicio", "arranque", "inicio_tarea"):
            inicios_120 += 1
        if ahora - t <= VENTANA_COMMITS_S and tipo == "commit":
            commits_30 += 1
        if ahora - t <= VENTANA_COMMITS_S * 4 and tipo == "commit":
            commits_120 += 1
        if ("no arranco" in motivo or tipo == "no_arranco") and t > t_no_arranco:
            t_no_arranco = t
            causa_no_arranco = motivo or "no arranco"

    # Listas y en curso de progreso + colas.
    listas = []
    en_curso = []
    commits_recientes = 0
    espera_alex = 0
    for tid, e in (progreso or {}).items():
        if not isinstance(e, dict):
            continue
        est = str(e.get("estado") or "")
        if est == "pendiente":
            listas.append(tid)
        elif est == "en_curso":
            en_curso.append(tid)
        elif est in ("commit", "hecho", "integrada"):
            tfin = _epocho(e.get("fin"))
            if tfin is not None and ahora - tfin <= VENTANA_COMMITS_S:
                commits_recientes += 1
        nota = str(e.get("nota") or "").lower()
        if est == "pendiente_aprobacion" or "alex" in nota or "maggasukha" in nota:
            espera_alex += 1
    # Listas que solo aparecen en las colas vivas.
    if isinstance(colas, dict):
        for _nombre, tareas in colas.items():
            if isinstance(tareas, list):
                for t in tareas:
                    if isinstance(t, dict) and t.get("id") and str(t["id"]) not in listas:
                        if str((t.get("estado") or "")).lower() in ("", "pendiente"):
                            listas.append(str(t["id"]))

    # Latidos: en curso con latido vivo y fantasmas (en curso sin latido).
    latidos = {}
    if leer is None:
        for nombre in os.listdir(OLAS):
            if nombre.startswith("latidos-") and nombre.endswith(".json"):
                d = _leer_json(os.path.join(OLAS, nombre), {})
                if isinstance(d, dict):
                    latidos.setdefault(os.path.basename(nombre), d)
    elif callable(leer):
        ld = leer("latidos")
        latidos = ld if isinstance(ld, dict) else {}
    en_curso_con_latido = 0
    fantasmas = 0
    for tid in en_curso:
        vivo = False
        for _cola, d in latidos.items():
            tareas = d.get("tareas") if isinstance(d, dict) else None
            if not isinstance(tareas, dict):
                continue
            lv = tareas.get(tid)
            if isinstance(lv, dict):
                quieto = lv.get("quieto_segundos")
                fase = str(lv.get("fase") or "")
                if fase and fase not in ("hecho", "commit"):
                    en_curso_con_latido += 1
                    vivo = True
                    if isinstance(quieto, (int, float)) and quieto > FANTASMA_QUIETO_S:
                        fantasmas += 1
                    break
        if not vivo:
            fantasmas += 1

    # Agentes libres por medio.
    agentes_libres = {"mac": 0, "a1": 0, "actions": 0, "cloudroom": 0, "agy": 0}
    if isinstance(medios, dict):
        resumen = medios.get("resumen") if isinstance(medios.get("resumen"), dict) else {}
        agentes_libres["mac"] = int(resumen.get("mac_libres", 0) or 0)
        agentes_libres["a1"] = int(resumen.get("a1_libres", 0) or 0)
        agentes_libres["actions"] = int(resumen.get("actions_libres", 0) or 0)
        agentes_libres["cloudroom"] = int(resumen.get("cloudroom_libres", 0) or 0)
        agentes_libres["agy"] = int(resumen.get("agy_libres", 0) or 0)

    # Nube.
    runs_vivos = 0
    elegibles = 0
    agotadas = 0
    if isinstance(nube_pausada, dict):
        pausada = bool(nube_pausada.get("pausada"))
    else:
        pausada = False
    if isinstance(colas, dict):
        for _nombre, tareas in colas.items():
            if isinstance(tareas, list):
                for t in tareas:
                    if not isinstance(t, dict):
                        continue
                    est = str(t.get("estado") or "")
                    if est == "elegible":
                        elegibles += 1
                    elif est == "agotada":
                        agotadas += 1
    # Runs vivos de la nube: se cuenta de los propios latidos de runs si los hay.
    for _nombre, d in latidos.items():
        if isinstance(d, dict) and str(d.get("donde") or "") == "nube-gh":
            runs_vivos += 1

    # Disco.
    disco_libre_gb = None
    guardia = "libre"
    try:
        disco_libre_gb = shutil.disk_usage(RAIZ).free / (1024 ** 3)
    except OSError:
        disco_libre_gb = None
    try:
        import importlib.util

        ruta_gd = os.path.join(os.path.dirname(DIRECTORIO), "enjambre", "guardia_disco.py")
        spec = importlib.util.spec_from_file_location("guardia_disco_flujo", ruta_gd)
        gd = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(gd)
        guardia = gd.FRENO.consultar()
    except Exception:
        guardia = "libre"
    disco_frenado = guardia != "libre" or (
        isinstance(disco_libre_gb, (int, float)) and disco_libre_gb < DISCO_LIBRE_AVISO_GB
    )

    # Gobernador / tope por memoria.
    tope_memoria = 0
    motivo_memoria = ""
    if isinstance(gobernador, dict):
        try:
            tope_memoria = int(gobernador.get("trabajadores") or 0)
        except (TypeError, ValueError):
            tope_memoria = 0
        motivo_memoria = str(gobernador.get("motivo") or "")

    # Salud de proveedores: cuántos escriben y cuántos están caídos/sin cupo.
    escriben = 0
    caidos = 0
    colgados = 0
    if isinstance(salud, dict):
        ahora_txt = time.strftime("%Y-%m-%d %H:%M:%S")
        for nombre, v in salud.items():
            if not isinstance(v, dict) or nombre in ("claves", "ultimo_revisor_ok"):
                continue
            estado = str(v.get("estado") or "")
            hasta = str(v.get("sin_cupo_hasta") or "")
            if estado in ("caido", "caído"):
                caidos += 1
            elif hasta and hasta > ahora_txt:
                colgados += 1
            else:
                escriben += 1
    todos_caidos = escriben == 0 and (caidos + colgados) > 0

    # CI rojo: último despliegue de la nube con fallo.
    ci_rojo = False
    estado_prev = _leer_json(ESTADO_LIBRO, {})  # reutiliza el estado del director de flujo
    ud = estado_prev.get("ultimo_despliegue") if isinstance(estado_prev, dict) else None
    if isinstance(ud, dict) and ud.get("fallo"):
        ci_rojo = True

    # Orquestador: vivo y latido fresco.
    orq_vivo = False
    orq_latido_fresco = False
    orq_pid = None
    try:
        salida = subprocess.run(
            ["ps", "-axo", "pid=,args="], capture_output=True, text=True, timeout=20
        ).stdout
        for linea in salida.splitlines():
            if "starseed-enjambre.py" in linea and "python" in linea.lower():
                partes = linea.split(None, 1)
                if partes and partes[0].isdigit():
                    orq_vivo = True
                    orq_pid = int(partes[0])
                    break
    except Exception:
        pass
    # Latido del orquestador: su archivo de latidos más reciente.
    try:
        for nombre in os.listdir(OLAS):
            if nombre.startswith("latidos-") and nombre.endswith(".json"):
                d = _leer_json(os.path.join(OLAS, nombre), {})
                if isinstance(d, dict):
                    mt = d.get("mtime") or d.get("t") or 0
                    if isinstance(mt, (int, float)) and ahora - mt <= LATIDO_FRESCO_S:
                        orq_latido_fresco = True
                        break
    except OSError:
        pass

    cola_vacia = not listas and not en_curso

    return {
        "ahora": ahora,
        "listas": listas,
        "en_curso": en_curso,
        "en_curso_con_latido": en_curso_con_latido,
        "fantasmas": fantasmas,
        "inicios_30": inicios_30,
        "inicios_120": inicios_120,
        "commits_30": commits_30 + commits_recientes,
        "commits_120": commits_120,
        "agentes_libres": agentes_libres,
        "causa_no_arranco": causa_no_arranco,
        "disco_libre_gb": disco_libre_gb,
        "disco_frenado": disco_frenado,
        "guardia": guardia,
        "tope_memoria": tope_memoria,
        "motivo_memoria": motivo_memoria,
        "runs_vivos": runs_vivos,
        "elegibles": elegibles,
        "agotadas": agotadas,
        "nube_pausada": pausada,
        "escriben": escriben,
        "caidos": caidos,
        "colgados": colgados,
        "todos_caidos": todos_caidos,
        "ci_rojo": ci_rojo,
        "orq_vivo": orq_vivo,
        "orq_latido_fresco": orq_latido_fresco,
        "orq_pid": orq_pid,
        "espera_alex": espera_alex,
        "cola_vacia": cola_vacia,
    }


# ── La decisión pura ─────────────────────────────────────────────────────────
def diagnosticar(foto):
    """PURA. (causa, remedio, motivo) de la foto del sistema.

    Las causas son CERRADAS y medibles; nunca se inventa una fuera de TODAS_CAUSAS.
    El orden importa: la primera causa que se confirma gana, y es la más acciónable
    (lo que frena el arranque de trabajo nuevo antes que lo cosmético).
    """
    ahora = foto.get("ahora") or time.time()

    # 1 · Guardia de disco: con poco disco no arranca ninguna tarea nueva.
    disco_frenado = bool(foto.get("disco_frenado")) or (
        isinstance(foto.get("disco_libre_gb"), (int, float))
        and foto.get("disco_libre_gb") < DISCO_LIBRE_AVISO_GB
    )
    if disco_frenado:
        libre = foto.get("disco_libre_gb")
        detalle = (
            "quedan %.1f GB libres (%s)" % (libre, foto.get("guardia") or "")
            if isinstance(libre, (int, float))
            else "disco sin medida"
        )
        return (CAUSA_DISCO, REMEDIO_ALIVIO,
                "guardia de disco frena los arranques (%s)" % detalle)

    # 2 · Tope por memoria: la Mac está en su techo y hay trabajo listo sin empezar.
    tope = foto.get("tope_memoria") or 0
    ocupados = len(foto.get("en_curso") or [])
    if tope and ocupados >= tope and foto.get("listas"):
        return (CAUSA_MEMORIA, REMEDIO_ALIVIO,
                "tope de memoria (%d/%d trabajadores) con %d lista(s) sin arrancar"
                % (ocupados, tope, len(foto.get("listas") or [])))

    # 3 · Atraso de la nube en 0 con huecos libres: trabajo que la nube podría coger.
    if (not foto.get("nube_pausada") and foto.get("runs_vivos", 0) == 0
            and (foto.get("elegibles", 0) > 0 or foto.get("agotadas", 0) > 0)):
        return (CAUSA_NUBE_ATRASO, REMEDIO_BUSCAR,
                "nube sin runs (%d) con %d elegible(s) y %d agotada(s)"
                % (foto.get("runs_vivos", 0), foto.get("elegibles", 0),
                   foto.get("agotadas", 0)))

    # 4 · Fantasma: tareas en curso sin latido vivo (nadie las mueve).
    if foto.get("fantasmas", 0) > 0:
        return (CAUSA_FANTASMA, REMEDIO_FANTASMA,
                "%d tarea(s) en curso sin latido vivo" % foto.get("fantasmas", 0))

    # 5 · Todos los modelos caídos o colgados: sin escritor no hay arranque.
    if foto.get("todos_caidos"):
        return (CAUSA_MODELOS_CAIDOS, REMEDIO_CUARENTENA,
                "todos los escritores caídos o sin cupo (caídos %d, colgados %d)"
                % (foto.get("caidos", 0), foto.get("colgados", 0)))

    # 6 · CI en rojo: la publicación no sale.
    if foto.get("ci_rojo"):
        return (CAUSA_CI_ROJO, REMEDIO_PUBLICAR, "último despliegue de la nube falló")

    # 7 · Orquestador sin latido: no hay quien meta trabajo en la tanda.
    if not foto.get("orq_vivo") or not foto.get("orq_latido_fresco"):
        return (CAUSA_ORQ_SIN_LATIDO, REMEDIO_ORQ,
                "orquestador sin latido vivo (vivo=%s, latido=%s)"
                % (foto.get("orq_vivo"), foto.get("orq_latido_fresco")))

    # 8 · Espera de decisión de Alex: tareas listas pero bloqueadas por aprobación.
    if foto.get("espera_alex", 0) > 0 and not foto.get("listas"):
        return (CAUSA_ESPERA_ALEX, REMEDIO_ALEX,
                "%d tarea(s) esperando decisión de Maggasukha" % foto.get("espera_alex", 0))

    # 9 · Cola vacía: no hay trabajo que arrancar; no es una causa que remediar.
    if foto.get("cola_vacia"):
        return (CAUSA_COLA_VACIA, REMEDIO_NINGUNO, "no hay listas ni tareas en curso")

    return (None, REMEDIO_NINGUNO, "sistema en marcha: %d lista(s), %d en curso"
            % (len(foto.get("listas") or []), len(foto.get("en_curso") or [])))


# ── Libro de remedios (flujo-libro.jsonl) ────────────────────────────────────
def _cargar_libro():
    """Lee todo el historial de entradas (puede estar vacío)."""
    salida = []
    try:
        with open(LIBRO, encoding="utf-8") as f:
            for linea in f:
                linea = linea.strip()
                if not linea:
                    continue
                try:
                    salida.append(json.loads(linea))
                except ValueError:
                    continue
    except OSError:
        pass
    return salida


def _apendar_libro(entrada):
    try:
        os.makedirs(DOT, exist_ok=True)
        with open(LIBRO, "a", encoding="utf-8") as f:
            f.write(json.dumps(entrada, ensure_ascii=False) + "\n")
    except OSError:
        pass


def registrar(causa, remedio, resultado, detalle="", ahora=None):
    """Anota una entrada en el libro: causa, remedio, resultado y detalle."""
    ahora = _ahora(ahora)
    entrada = {
        "t": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ahora)),
        "epoch": ahora,
        "causa": causa,
        "remedio": remedio,
        "resultado": resultado,  # esperando | funciona | no_funciona | no_aplicable
        "detalle": detalle,
    }
    _apendar_libro(entrada)
    return entrada


def _estado_libro():
    return _leer_json(ESTADO_LIBRO, {})


def _guardar_estado_libro(datos):
    try:
        os.makedirs(DOT, exist_ok=True)
        tmp = ESTADO_LIBRO + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False, indent=1)
        os.replace(tmp, ESTADO_LIBRO)
    except OSError:
        pass


def estadisticas_remedios():
    """{causa: {remedio: {total, exitos, tasa}}} calculado del libro."""
    stats = {}
    for e in _cargar_libro():
        c = e.get("causa"); r = e.get("remedio"); res = e.get("resultado")
        if not c or not r:
            continue
        por_causa = stats.setdefault(c, {})
        fila = por_causa.setdefault(r, {"total": 0, "exitos": 0})
        fila["total"] += 1
        if res == "funciona":
            fila["exitos"] += 1
    for por_causa in stats.values():
        for fila in por_causa.values():
            t = fila["total"] or 1
            fila["tasa"] = round(fila["exitos"] / t, 2)
    return stats


def ordenar_remedios(causa):
    """Remedios de `causa` ordenados por tasa de éxito (mayor primero); si no hay
    historial, el orden por defecto del remedio de esa causa."""
    stats = estadisticas_remedios().get(causa, {})
    remedios_defecto = {
        CAUSA_DISCO: [REMEDIO_ALIVIO],
        CAUSA_MEMORIA: [REMEDIO_ALIVIO],
        CAUSA_NUBE_ATRASO: [REMEDIO_BUSCAR, REMEDIO_NUBE_CEDER],
        CAUSA_FANTASMA: [REMEDIO_FANTASMA],
        CAUSA_MODELOS_CAIDOS: [REMEDIO_CUARENTENA],
        CAUSA_CI_ROJO: [REMEDIO_PUBLICAR],
        CAUSA_ORQ_SIN_LATIDO: [REMEDIO_ORQ],
        CAUSA_ESPERA_ALEX: [REMEDIO_ALEX],
        CAUSA_COLA_VACIA: [REMEDIO_NINGUNO],
    }.get(causa, [REMEDIO_NINGUNO])
    con_historial = [(r, datos.get("tasa", 0), datos.get("total", 0))
                     for r, datos in stats.items()]
    con_historial.sort(key=lambda x: (-x[1], -x[2], x[0]))
    ordenados = [r for r, _t, _n in con_historial]
    for r in remedios_defecto:
        if r not in ordenados:
            ordenados.append(r)
    return ordenados


def causa_mas_repetida():
    """La causa que más veces aparece en el libro (para proponer una tarea diaria)."""
    cuentas = {}
    for e in _cargar_libro():
        c = e.get("causa")
        if c:
            cuentas[c] = cuentas.get(c, 0) + 1
    if not cuentas:
        return None, 0
    causa = max(cuentas, key=lambda c: (cuentas[c], c))
    return causa, cuentas[causa]


def proponer_tarea_diaria():
    """Propone una tarea para la causa más repetida (None si no hay historial)."""
    causa, n = causa_mas_repetida()
    if causa is None:
        return None
    motivos = {
        CAUSA_DISCO: "automatizar la limpieza de temporales y build antes de que el disco frene",
        CAUSA_MEMORIA: "revisar el tope del gobernador y liberar RAM de la Mac",
        CAUSA_NUBE_ATRASO: "reforzar los escritores de la nube para que no se quede en 0 runs",
        CAUSA_FANTASMA: "detectar antes los fantasmas de latido y reabrir solos",
        CAUSA_MODELOS_CAIDOS: "ampliar el catálogo de escritores gratuitos de repuesto",
        CAUSA_CI_ROJO: "asegurar que las puertas (tsc, vitest) pasen antes de publicar",
        CAUSA_ORQ_SIN_LATIDO: "reforzar el reinicio automático del orquestador",
        CAUSA_ESPERA_ALEX: "resolver las esperas de decisión de Maggasukha sin demora",
        CAUSA_COLA_VACIA: "generar más tareas listas para trabajar",
    }.get(causa, "investigar la causa %s" % causa)
    return {"causa": causa, "veces": n, "propuesta": motivos}


# ── Aplicación de remedios (los remedios YA EXISTEN; aquí solo se invocan) ────
def aplicar_alivio(foto, ahora, correr):
    """Alivio de temporales: borra cachés regenerables y builds viejos de la Mac."""
    liberados = 0
    candidatos = [
        os.path.join(RAIZ, ".next"),
        os.path.join(RAIZ, "node_modules", ".cache"),
        os.path.join(DOT, "cache"),
    ]
    for ruta in candidatos:
        if not os.path.exists(ruta):
            continue
        try:
            salida = subprocess.run(
                ["du", "-s", ruta], capture_output=True, text=True, timeout=20
            ).stdout
            mb = int((salida.split()[0] if salida.split() else "0")) / 1024
            if os.path.isdir(ruta):
                for raiz, _dirs, archivos in os.walk(ruta):
                    for a in archivos:
                        try:
                            os.remove(os.path.join(raiz, a))
                        except OSError:
                            pass
            liberados += int(mb)
        except (OSError, ValueError, IndexError):
            continue
    return {"liberados_mb": liberados}


def aplicar_buscar_capacidad(ahora, correr):
    """`buscar_capacidad.py buscar --aplicar --json --origen boton`: busca capacidad en
    todos los medios y la aplica. Devuelve lo que sumó."""
    r = correr([sys.executable, os.path.join(DIRECTORIO, "buscar_capacidad.py"),
                "buscar", "--aplicar", "--json", "--origen", "boton"], segundos=300)
    try:
        datos = json.loads((r.stdout or "").strip())
    except (ValueError, json.JSONDecodeError):
        datos = {"ok": False, "resumen": r.stdout or r.stderr or "sin salida"}
    return datos


def comando_de_linea(linea):
    """PURA: argv que sigue a «ejecutar:» en una línea de buscar-capacidad, o None.

    Nunca interpreta el texto: solo lo trocea en argumentos (`shlex`), sin shell.
    """
    texto = str(linea or "")
    pos = texto.find("ejecutar:")
    if pos < 0:
        return None
    resto = texto[pos + len("ejecutar:"):].strip().strip("`").strip()
    if not resto:
        return None
    try:
        argv = shlex.split(resto)
    except ValueError:
        return None
    return argv or None


def _guardar_renovaciones(estado):
    directorio = os.path.dirname(RENOVACIONES_ESTADO)
    if directorio:
        os.makedirs(directorio, exist_ok=True)
    tmp = RENOVACIONES_ESTADO + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(estado, f, ensure_ascii=False, indent=1)
    os.replace(tmp, RENOVACIONES_ESTADO)


def _registrar_renovacion(ahora, clave, codigo, salida):
    """Una línea con el resultado, para que quede rastro de lo que hizo solo."""
    try:
        os.makedirs(os.path.dirname(RENOVACIONES_LOG) or ".", exist_ok=True)
        with open(RENOVACIONES_LOG, "a", encoding="utf-8") as f:
            f.write("%s · %s · código=%s · %s\n" % (
                time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ahora)),
                clave, codigo, (salida or "")[-200:]))
    except OSError:
        pass


def aplicar_renovaciones(ahora, correr):
    """Ejecuta lo que «Buscar capacidad» marca como «te necesita · ejecutar».

    Lee las líneas de `~/.starseed/buscar-capacidad.json`, saca el argv tras
    «ejecutar:» y corre SOLO la lista blanca exacta, como lista de argumentos y sin
    shell. Cada comando como mucho una vez por hora (marca en
    `renovaciones-directores.json`) y con tope de 300 s. Cualquier otro comando se
    ignora; nunca se ejecuta texto libre. Devuelve qué se ejecutó, omitió e ignoró.
    """
    ahora = _ahora(ahora)
    foto = _leer_json(BUSCAR_CAPACIDAD, {})
    lineas = foto.get("lineas") if isinstance(foto, dict) else None
    if not isinstance(lineas, list):
        lineas = []
    estado = _leer_json(RENOVACIONES_ESTADO, {})
    if not isinstance(estado, dict):
        estado = {}
    ejecutadas, omitidas, ignoradas = [], [], []
    vistos = set()
    for linea in lineas:
        argv = comando_de_linea(linea)
        if argv is None:
            continue
        clave = " ".join(argv)
        if clave in vistos:
            continue
        vistos.add(clave)
        if tuple(argv) not in RENOVACIONES_PERMITIDAS:
            ignoradas.append(clave)
            continue
        previo = estado.get(clave)
        ultima = 0.0
        if isinstance(previo, dict) and isinstance(previo.get("ultima"), (int, float)):
            ultima = float(previo["ultima"])
        if ultima and ahora - ultima < RENOVACIONES_ESPERA_S:
            omitidas.append(clave)
            continue
        salida, codigo = "", None
        try:
            r = correr(list(argv), segundos=RENOVACIONES_TOPE_S)
            codigo = getattr(r, "returncode", None)
            salida = "%s%s" % (getattr(r, "stdout", "") or "",
                               getattr(r, "stderr", "") or "")
        except (OSError, subprocess.TimeoutExpired) as e:
            codigo = None
            salida = "%s: %s" % (type(e).__name__, e)
        salida = (salida or "").strip()
        estado[clave] = {"ultima": ahora, "codigo": codigo, "salida": salida[-200:]}
        ejecutadas.append({"comando": clave, "codigo": codigo, "salida": salida[-200:]})
        _registrar_renovacion(ahora, clave, codigo, salida)
    if ejecutadas:
        try:
            _guardar_renovaciones(estado)
        except OSError:
            pass
    return {"ejecutadas": ejecutadas, "omitidas": omitidas, "ignoradas": ignoradas}


def aplicar_nube_ceder(foto, ahora, correr):
    """Lanza la nube con --ceder (la Mac cede lo que no alcanza pronto)."""
    runs = max(1, min(2, foto.get("elegibles", 0) // 2 + 1))
    r = correr([sys.executable, os.path.join(DIRECTORIO, "buscar_capacidad.py"),
                "desplegar", "--runs", str(runs), "--trabajadores", "2", "--ceder"],
               segundos=600)
    return {"ok": r.returncode == 0, "runs": runs, "salida": (r.stdout or "")[-200:]}


def aplicar_reabrir_fantasma(foto, ahora):
    """Reabre los fantasmas: marca en_curso sin latido como pendiente en progreso.json."""
    progreso = foto.get("progreso")
    if not isinstance(progreso, dict):
        ruta = os.path.join(OLAS, "progreso.json")
        progreso = _leer_json(ruta, {})
    reabiertos = []
    for tid in foto.get("en_curso") or []:
        e = progreso.get(tid)
        if not isinstance(e, dict):
            continue
        if str(e.get("estado") or "") != "en_curso":
            continue
        reabiertos.append(tid)
        e["estado"] = "pendiente"
        e["nota"] = "reabierto por director-flujo (fantasma de latido)"
        e["fin"] = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ahora))
        progreso[tid] = e
    if reabiertos and not isinstance(foto.get("progreso"), dict):
        ruta = os.path.join(OLAS, "progreso.json")
        try:
            tmp = ruta + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(progreso, f, ensure_ascii=False, indent=1)
            os.replace(tmp, ruta)
        except OSError:
            pass
    return {"reabiertos": len(reabiertos), "ids": reabiertos}


def aplicar_cuarentena(foto, ahora):
    """Cuarentena del modelo: aparta el proveedor caído de la salud compartida."""
    salud = foto.get("salud")
    if not isinstance(salud, dict):
        ruta = os.path.join(DOT, "salud-proveedores.json")
        salud = _leer_json(ruta, {})
    if not isinstance(salud, dict):
        return {"cuarentenados": 0}
    ahora_txt = time.strftime("%Y-%m-%d %H:%M:%S")
    cuarentenados = []
    for nombre, v in salud.items():
        if not isinstance(v, dict) or nombre in ("claves", "ultimo_revisor_ok"):
            continue
        estado = str(v.get("estado") or "")
        hasta = str(v.get("sin_cupo_hasta") or "")
        if estado in ("caido", "caído") or (hasta and hasta > ahora_txt):
            v["estado"] = "cuarentena"
            v["cuarentena_desde"] = ahora_txt
            salud[nombre] = v
            cuarentenados.append(nombre)
    if cuarentenados and not isinstance(foto.get("salud"), dict):
        ruta = os.path.join(DOT, "salud-proveedores.json")
        try:
            tmp = ruta + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(salud, f, ensure_ascii=False, indent=1)
            os.replace(tmp, ruta)
        except OSError:
            pass
    return {"cuarentenados": len(cuarentenados), "ids": cuarentenados}


def aplicar_reintento_publicacion(ahora, correr):
    """Reintento de la publicación: lanza `publicar.py` (las cuatro puertas)."""
    r = correr([sys.executable, os.path.join(DIRECTORIO, "publicar.py")], segundos=600)
    return {"ok": r.returncode == 0, "salida": (r.stdout or "")[-200:]}


def aplicar_arrancar_orquestador(ahora, correr):
    """Arranca el orquestador por su launchd (vigilante relanza la tanda)."""
    uid = os.getuid()
    r = correr(
        ["launchctl", "kickstart", "-k", "gui/%d/com.starseed.vigilante" % uid],
        segundos=30,
    )
    if r.returncode != 0:
        r = correr(["launchctl", "start", "com.starseed.mando"], segundos=30)
    return {"ok": r.returncode == 0, "salida": (r.stdout or r.stderr or "")[-200:]}


def aplicar_avisar_alex(motivo, decir):
    """Solo habla cuando necesita a Alex: una línea en el canal común."""
    decir("director-flujo: %s" % motivo, quien="director-flujo", tipo="aviso")


def aplicar_remedio(remedio, foto, ahora, correr, decir):
    """Ejecuta el remedio y devuelve (resultado_inmediato, detalle)."""
    if remedio == REMEDIO_ALIVIO:
        return "funciona", aplicar_alivio(foto, ahora, correr)
    if remedio == REMEDIO_BUSCAR:
        datos = aplicar_buscar_capacidad(ahora, correr)
        ok = bool(datos.get("ok"))
        return ("funciona" if ok else "no_funciona", datos)
    if remedio == REMEDIO_NUBE_CEDER:
        datos = aplicar_nube_ceder(foto, ahora, correr)
        return ("funciona" if datos.get("ok") else "no_funciona", datos)
    if remedio == REMEDIO_FANTASMA:
        datos = aplicar_reabrir_fantasma(foto, ahora)
        return ("funciona" if datos.get("reabiertos", 0) > 0 else "no_funciona", datos)
    if remedio == REMEDIO_CUARENTENA:
        datos = aplicar_cuarentena(foto, ahora)
        return ("funciona" if datos.get("cuarentenados", 0) > 0 else "no_funciona", datos)
    if remedio == REMEDIO_PUBLICAR:
        datos = aplicar_reintento_publicacion(ahora, correr)
        return ("funciona" if datos.get("ok") else "no_funciona", datos)
    if remedio == REMEDIO_ORQ:
        datos = aplicar_arrancar_orquestador(ahora, correr)
        return ("funciona" if datos.get("ok") else "no_funciona", datos)
    if remedio == REMEDIO_ALEX:
        aplicar_avisar_alex(foto.get("causa_no_arranco") or "necesita decisión de Maggasukha", decir)
        return "no_funciona", {"aviso": True}  # Alex debe actuar; no se resuelve solo
    if remedio == REMEDIO_NINGUNO:
        return "no_aplicable", {}
    return "no_funciona", {"remedio_desconocido": remedio}


def _mejoró(foto_antes, foto_despues):
    """¿La situación mejoró tras el remedio? (más inicios/commits, menos fantasmas)."""
    antes = foto_antes or {}
    desp = foto_despues or {}
    if desp.get("cola_vacia") and not antes.get("cola_vacia"):
        return True
    if (desp.get("inicios_30", 0) > antes.get("inicios_30", 0)
            or desp.get("commits_30", 0) > antes.get("commits_30", 0)):
        return True
    if desp.get("fantasmas", 0) < antes.get("fantasmas", 0):
        return True
    if desp.get("en_curso_con_latido", 0) > antes.get("en_curso_con_latido", 0):
        return True
    if desp.get("runs_vivos", 0) > antes.get("runs_vivos", 0):
        return True
    return False


# ── Turno del director ───────────────────────────────────────────────────────
def turno(aplicar=False, ahora=None, correr=None, decir=None, leer=None):
    """Una pasada del director de flujo.

    `correr(cmd, segundos)` y `decir(texto, quien, tipo)` se inyectan en pruebas;
    si no, se usan los reales. `leer(nombre)` inyecta la foto en pruebas.
    Devuelve el resumen del turno (qué causó, qué remedio, qué resultado).
    """
    ahora = _ahora(ahora)
    correr = correr or _correr_real
    decir = decir or _decir_real

    # 0 · Renovaciones que «Buscar capacidad» marca como «te necesita · ejecutar»:
    # los directores las hacen solos (lista blanca exacta, una vez por hora cada una).
    renovaciones = {"ejecutadas": [], "omitidas": [], "ignoradas": []}
    if aplicar:
        try:
            renovaciones = aplicar_renovaciones(ahora, correr)
        except Exception:  # noqa: BLE001 — una renovación rota no frena el turno
            renovaciones = {"ejecutadas": [], "omitidas": [], "ignoradas": [],
                            "error": True}

    estado = _estado_libro()
    pendiente = estado.get("pendiente") if isinstance(estado, dict) else None

    # 1 · Si hay un remedio aplicado hace ≥ 10 min, comprobar si funcionó.
    if pendiente and ahora - float(pendiente.get("aplicado_en", 0)) >= COMPROBAR_DESPUES_S:
        foto_despues = leer_foto(ahora=ahora, leer=leer)
        funcionó = _mejoró(pendiente.get("foto_antes"), foto_despues)
        resultado = "funciona" if funcionó else "no_funciona"
        registrar(
            pendiente["causa"], pendiente["remedio"], resultado,
            "comprobación a los 10 min: %s" % pendiente.get("detalle", ""), ahora=ahora,
        )
        _guardar_estado_libro({"pendiente": None})
        if funcionó:
            decir("director-flujo: %s → %s funcionó (%s)" % (
                pendiente["causa"], pendiente["remedio"], pendiente.get("detalle", "")),
                quien="director-flujo", tipo="hecho")
        else:
            decir("director-flujo: %s → %s no funcionó (%s)" % (
                pendiente["causa"], pendiente["remedio"], pendiente.get("detalle", "")),
                quien="director-flujo", tipo="aviso")
        return {
            "causa": pendiente["causa"], "remedio": pendiente["remedio"],
            "resultado": resultado, "comprobado": True,
            "renovaciones": renovaciones,
        }

    # 2 · Leer la foto y diagnosticar.
    foto = leer_foto(ahora=ahora, leer=leer)
    causa, remedio, motivo = diagnosticar(foto)

    # Sin causa accionable: nada que hacer, no se habla.
    if causa is None or remedio == REMEDIO_NINGUNO:
        return {
            "causa": causa, "remedio": remedio, "resultado": "no_aplicable",
            "motivo": motivo, "foto": foto, "renovaciones": renovaciones,
        }

    # 3 · Espera de Alex: solo se avisa, no se aplica remedio automático.
    if causa == CAUSA_ESPERA_ALEX:
        if aplicar:
            decir("director-flujo: %s" % motivo, quien="director-flujo", tipo="aviso")
        return {
            "causa": causa, "remedio": remedio, "resultado": "espera_alex",
            "motivo": motivo, "foto": foto, "renovaciones": renovaciones,
        }

    # 4 · Aplicar el mejor remedio para esta causa (ordenado por lo que funcionó).
    for candidato in ordenar_remedios(causa):
        if candidato == REMEDIO_NINGUNO:
            continue
        remedio = candidato
        break

    resultado_inmediato, detalle = aplicar_remedio(remedio, foto, ahora, correr, decir)

    # Registrar y programar la comprobación a los 10 min.
    entrada = registrar(causa, remedio, "esperando",
                        "%s · %s" % (motivo, json.dumps(detalle, ensure_ascii=False)), ahora=ahora)
    _guardar_estado_libro({
        "pendiente": {
            "causa": causa, "remedio": remedio, "aplicado_en": ahora,
            "detalle": detalle if isinstance(detalle, str) else str(detalle),
            "foto_antes": foto,
        }
    })

    if aplicar and resultado_inmediato == "funciona":
        decir("director-flujo: %s → %s aplicado (%s)" % (
            causa, remedio, motivo), quien="director-flujo", tipo="hecho")
    elif aplicar:
        decir("director-flujo: %s → %s intentado (%s)" % (
            causa, remedio, motivo), quien="director-flujo", tipo="aviso")

    return {
        "causa": causa, "remedio": remedio, "resultado": resultado_inmediato,
        "motivo": motivo, "detalle": detalle, "comprobado": False, "foto": foto,
        "renovaciones": renovaciones,
    }


def resumen_turno(resultado):
    """Texto de una línea para el resumen del turno."""
    partes = []
    if resultado.get("causa"):
        partes.append("causa=%s" % resultado["causa"])
    if resultado.get("remedio"):
        partes.append("remedio=%s" % resultado["remedio"])
    partes.append("resultado=%s" % resultado.get("resultado", "?"))
    if resultado.get("motivo"):
        partes.append(resultado["motivo"])
    return "director-flujo · " + " · ".join(partes)


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    aplicar = "--aplicar" in argv
    ver = "--ver" in argv or "-v" in argv
    res = turno(aplicar=aplicar)
    if ver:
        import json as _json
        print(_json.dumps(res, ensure_ascii=False, default=str, indent=1))
    else:
        print(resumen_turno(res))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
