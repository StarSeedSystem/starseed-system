#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Revisor automático de bloqueadas: ninguna tarea se queda quieta (servicio, cualquier medio).

Cada pasada (cada 5 min con `--bucle`) reúne el criterio de los directores —supervisor
(cadenas y orden), verificador (¿ya está en main?), revisor (clase del fallo), productor
(medios y escalera) y diseño (las tareas de interfaz pasan por las mismas puertas)— y transforma
cada tarea quieta con la acción que le toca (`revisor_bloqueadas_logica.decidir`). Sin Claude.

  python3 scripts/puente/revisor_bloqueadas.py            # una pasada, aplica
  python3 scripts/puente/revisor_bloqueadas.py --seco     # una pasada, solo dice qué haría
  python3 scripts/puente/revisor_bloqueadas.py --json     # informe en JSON (Genesis)
  python3 scripts/puente/revisor_bloqueadas.py --bucle [--cada 300]
  python3 scripts/puente/revisor_bloqueadas.py decidir <id> rehacer|descartar   # botón de Genesis
  python3 scripts/puente/revisor_bloqueadas.py instalar   # launchd (macOS) o systemd --user (Linux/A1)

Por dónde llega cada cambio (los caminos que ya existen, ninguno nuevo para el orquestador):
  · tarea de la TANDA VIVA → orden de control `reabrir` (`olas/control-<cola>.json`), que el
    orquestador atiende en ≤ 20 s con su contador; cerrar (commit/sustituida) va a progreso.json,
    donde esos estados son irreversibles y mandan sobre su copia en memoria;
  · tarea FUERA de la tanda → progreso.json con el flock `~/.starseed/cerrojos/progreso.lock`;
  · contexto de hoy para el agente → `olas/mensajes/<id>.jsonl` (lo lee antes de escribir);
  · orden, dependencias y traslados → los archivos de cola (escritura atómica): el orquestador
    los relee al cambiar su fecha y reordena lo pendiente.
Estado y aprendizaje: `olas/revisor-bloqueadas.json` (Genesis lo pinta en «Bloqueadas»).
Nunca claves ni rutas de secretos en nada de lo que escribe.
"""

from __future__ import annotations

import contextlib
import json
import os
import platform
import re
import socket
import subprocess
import sys
import time

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import revisor_bloqueadas_logica as logica  # noqa: E402

RAIZ = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(DIRECTORIO))
OLAS = os.path.join(RAIZ, "starseed_memory_root", "olas")
PROGRESO = os.path.join(OLAS, "progreso.json")
CORRECCIONES = os.path.join(OLAS, "progreso-correcciones.json")
EVENTOS = os.path.join(OLAS, "eventos.jsonl")
ESTADO = os.path.join(OLAS, "revisor-bloqueadas.json")
CERROJOS = os.path.expanduser("~/.starseed/cerrojos")
CERROJO_PROGRESO = os.path.join(CERROJOS, "progreso.lock")
CERROJO_REVISOR = os.path.join(CERROJOS, "revisor-bloqueadas.lock")
CADA_S = int(os.environ.get("STARSEED_REVISOR_CADA_S", "300") or 300)
COLA_EVENTOS_BYTES = 3_000_000
TIPOS_FALLO = ("fallo", "conflicto", "sin_cambios", "rechazada", "interrumpida", "estancado",
               "fallo_tsc", "fallo_tests", "bloqueada")
MEDIO = os.environ.get("STARSEED_MEDIO") or socket.gethostname().split(".")[0] or "medio"


# ── utilidades ───────────────────────────────────────────────────────────────────────────
def _leer(ruta, defecto):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def _escribir(ruta, datos):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    tmp = "%s.tmp-%d" % (ruta, os.getpid())
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    os.replace(tmp, ruta)


@contextlib.contextmanager
def _flock(ruta, espera_s=60):
    """flock de archivo (el MISMO formato que el orquestador). Sin fcntl, sigue sin él."""
    try:
        import fcntl
    except ImportError:  # pragma: no cover
        yield True
        return
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    f = open(ruta, "a")
    tomado = False
    try:
        t0 = time.time()
        while True:
            try:
                fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
                tomado = True
                break
            except BlockingIOError:
                if time.time() - t0 > espera_s:
                    break
                time.sleep(0.5)
        yield tomado
    finally:
        if tomado:
            try:
                fcntl.flock(f, fcntl.LOCK_UN)
            except OSError:
                pass
        f.close()


def _sh(orden, timeout=30):
    try:
        r = subprocess.run(orden, cwd=RAIZ, capture_output=True, text=True, timeout=timeout)
        return r.returncode, r.stdout
    except Exception:
        return 1, ""


def _lista_de(d):
    if isinstance(d, list):
        return d
    if isinstance(d, dict):
        return d.get("tareas") or []
    return []


def _es_cola_de_codigo(nombre):
    """Colas de código: las FUENTE y también las copias de ejecución `cola-auto-*` (la tanda viva
    suele ser una de ellas). Nunca las de sueños."""
    if not (nombre.startswith("cola-") and nombre.endswith(".json")):
        return False
    try:
        from vigilante_logica import es_cola_de_codigo
        return es_cola_de_codigo(nombre) or nombre.startswith("cola-auto-")
    except Exception:
        return not nombre.startswith("cola-suenos")


def _cola_viva():
    """La cola que corre AHORA el orquestador de esta máquina (argumentos del proceso)."""
    rc, salida = _sh(["ps", "-axo", "args="], timeout=20)
    for linea in (salida or "").splitlines():
        if "starseed-enjambre.py" not in linea or "grep" in linea:
            continue
        for trozo in linea.split():
            nombre = os.path.basename(trozo)
            if nombre.startswith("cola-") and nombre.endswith(".json"):
                if os.path.exists(os.path.join(OLAS, nombre)):
                    return nombre
    return None


def _fallos_recientes(ahora, ventana_s=72 * 3600):
    """{id: [eventos de fallo]} del final de eventos.jsonl (los últimos 6 por tarea)."""
    salida = {}
    reabiertas = {}
    try:
        tam = os.path.getsize(EVENTOS)
        with open(EVENTOS, "rb") as f:
            f.seek(max(0, tam - COLA_EVENTOS_BYTES))
            bruto = f.read().decode("utf-8", "replace")
    except OSError:
        return salida, reabiertas
    for linea in bruto.splitlines():
        try:
            e = json.loads(linea)
        except ValueError:
            continue
        if not isinstance(e, dict):
            continue
        tid = str(e.get("tarea") or "")
        if not tid:
            continue
        t = logica._t_epoch(e.get("t"))
        if ahora - t > ventana_s:
            continue
        texto = str(e.get("texto") or "")
        if e.get("tipo") in TIPOS_FALLO:
            salida.setdefault(tid, []).append({"t": e.get("t"), "tipo": e.get("tipo"), "texto": texto[:600]})
        elif e.get("tipo") == "aviso" and "vuelve a la tanda" in texto:
            reabiertas[tid] = max(reabiertas.get(tid, 0.0), t)
    return {k: v[-6:] for k, v in salida.items()}, reabiertas


def _codex_ok():
    try:
        import importlib.util

        spec = importlib.util.spec_from_file_location(
            "director_orquestacion", os.path.join(DIRECTORIO, "director-orquestacion.py"))
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return bool(mod.codex_puede_escribir())
    except Exception:
        return False


def _definiciones_archivadas(ids, tope_archivos=250):
    """{id: tarea} de las colas archivadas (`colas-fuente/`), de la más nueva a la más vieja, solo
    para los ids pedidos y parando en cuanto aparecen todos: el archivo tiene más de 1.600 colas."""
    faltan = set(ids or ())
    salida = {}
    if not faltan:
        return salida
    carpeta = os.path.join(RAIZ, "starseed_memory_root", "colas-fuente")
    try:
        rutas = [os.path.join(carpeta, n) for n in os.listdir(carpeta) if n.startswith("cola-") and n.endswith(".json")]
        rutas.sort(key=lambda r: os.path.getmtime(r), reverse=True)
    except OSError:
        return salida
    for ruta in rutas[:tope_archivos]:
        for t in _lista_de(_leer(ruta, [])):
            if isinstance(t, dict) and str(t.get("id")) in faltan:
                salida[str(t["id"])] = t
                faltan.discard(str(t["id"]))
        if not faltan:
            break
    return salida


# ── foto ─────────────────────────────────────────────────────────────────────────────────
def reunir(ahora=None):
    """Todo lo que `logica.decidir` necesita, leído de disco y procesos. Nunca lanza."""
    ahora = time.time() if ahora is None else ahora
    try:
        nombres = sorted(os.listdir(OLAS))
    except OSError:
        nombres = []
    colas, tareas = {}, {}
    # Las colas FUENTE definen la tarea; las copias `cola-auto-*` solo si no hay otra definición.
    for fuente_primero in (True, False):
        for nombre in nombres:
            if not _es_cola_de_codigo(nombre):
                continue
            es_auto = nombre.startswith("cola-auto-")
            if fuente_primero == es_auto:
                continue
            lista = _lista_de(_leer(os.path.join(OLAS, nombre), []))
            ids = []
            for t in lista:
                if isinstance(t, dict) and t.get("id"):
                    tid = str(t["id"])
                    ids.append(tid)
                    tareas.setdefault(tid, t)
            colas[nombre] = ids
    progreso = _leer(PROGRESO, {})
    progreso = progreso if isinstance(progreso, dict) else {}
    # Lo que el director ya decidió y aún no se aplicó cuenta como hecho: si no, el revisor
    # «arreglaría» lo que la escalera ya está arreglando.
    correcciones = _leer(CORRECCIONES, {})
    if isinstance(correcciones, dict):
        for tid, c in correcciones.items():
            if isinstance(c, dict) and c.get("estado"):
                e = dict(progreso.get(tid) or {})
                if logica._t_epoch(c.get("t")) >= logica._t_epoch(e.get("t")):
                    for k in ("estado", "nota", "intentos_auto", "modelo_siguiente"):
                        if k in c:
                            e[k] = c[k]
                    progreso[tid] = e
    _, asuntos = _sh(["git", "log", "main", "--format=%s"], timeout=60)
    _, head = _sh(["git", "rev-parse", "--short", "main"])
    cola_viva = _cola_viva()
    fallos, reabiertas = _fallos_recientes(ahora)
    try:
        mtime_viva = os.path.getmtime(os.path.join(OLAS, cola_viva)) if cola_viva else 0
    except OSError:
        mtime_viva = 0
    ids_viva = set(colas.get(cola_viva) or [])
    definiciones = _definiciones_archivadas(
        [tid for tid, e in progreso.items()
         if isinstance(e, dict) and e.get("estado") in logica.QUIETOS and tid not in tareas
         and ahora - logica._t_epoch(e.get("t")) < 3 * 24 * 3600])
    estado = _leer(ESTADO, {})
    return {
        "tareas": tareas,
        "colas": colas,
        "cola_viva": cola_viva,
        "progreso": progreso,
        "asuntos": (asuntos or "").splitlines(),
        "head": (head or "").strip(),
        "fallos": fallos,
        "reabiertas_tras_cola": any(t > mtime_viva for tid, t in reabiertas.items() if tid in ids_viva),
        "memoria": (estado or {}).get("memoria") or {},
        "definiciones": definiciones,
        "ahora": ahora,
        "codex_ok": _codex_ok() if platform.system() == "Darwin" else False,
        "modelos_mejores": [],
    }


# ── efectos ──────────────────────────────────────────────────────────────────────────────
def _cambiar_progreso(cambios):
    """Funde {tid: campos} en progreso.json con el flock del orquestador. Devuelve los aplicados."""
    if not cambios:
        return []
    with _flock(CERROJO_PROGRESO) as tomado:
        if not tomado:
            return []
        p = _leer(PROGRESO, None)
        if not isinstance(p, dict):
            return []
        hechos = []
        ahora = time.strftime("%Y-%m-%d %H:%M:%S")
        for tid, campos in cambios.items():
            e = dict(p.get(tid) or {})
            e.update(campos)
            e["t"] = ahora
            e["revisado_por"] = "revisor-bloqueadas"
            p[tid] = e
            hechos.append(tid)
        _escribir(PROGRESO, p)
        return hechos


def _orden_control(cola, ordenes):
    """Órdenes `reabrir` para la tanda viva (`olas/control-<cola>.json`, con su flock)."""
    if not cola or not ordenes:
        return []
    ruta = os.path.join(OLAS, "control-" + cola)
    with _flock(os.path.join(CERROJOS, "control-" + os.path.basename(ruta) + ".lock"), espera_s=30):
        actuales = _leer(ruta, {})
        actuales = actuales if isinstance(actuales, dict) else {}
        actuales.update(ordenes)
        _escribir(ruta, actuales)
    return list(ordenes)


def _editar_colas(editar):
    """Aplica `editar(nombre, lista) -> lista|None` a cada cola de código viva (atómico)."""
    tocadas = []
    try:
        nombres = sorted(os.listdir(OLAS))
    except OSError:
        return tocadas
    for nombre in nombres:
        if not _es_cola_de_codigo(nombre):
            continue
        ruta = os.path.join(OLAS, nombre)
        d = _leer(ruta, None)
        if d is None:
            continue
        lista = _lista_de(d)
        nueva = editar(nombre, [dict(t) if isinstance(t, dict) else t for t in lista])
        if nueva is None:
            continue
        if isinstance(d, list):
            d = nueva
        else:
            d["tareas"] = nueva
        _escribir(ruta, d)
        tocadas.append(nombre)
    return tocadas


def _mensaje(tid, texto):
    try:
        sys.path.insert(0, os.path.join(RAIZ, "scripts", "enjambre"))
        import mensajes_agente

        mensajes_agente.anotar(OLAS, tid, texto, de="revisor")
        return True
    except Exception:
        return False


def _veto_jev(accion, foto):
    """(vetada, nota). Jev solo frena, y solo con p ≥ 0,8; si calla o duda, manda la regla."""
    if os.environ.get("STARSEED_REVISOR_SIN_JEV") == "1":
        return False, "jev: apagado"
    try:
        import decidir

        tid = accion.get("tid")
        t = (foto.get("tareas") or {}).get(tid) or {}
        estado = {
            "tarea": tid,
            "titulo": str(t.get("titulo") or "")[:200],
            "archivos": list(t.get("archivos") or [])[:6],
            "estado": logica._estado(foto.get("progreso") or {}, tid),
            "accion": accion.get("accion"),
            "motivo": accion.get("motivo"),
        }
        r = decidir.consultar(
            "si-no", estado,
            "¿Es correcto que el revisor de bloqueadas haga «%s» con %s? Motivo: %s" % (
                accion.get("accion"), tid, accion.get("motivo")),
            quien="revisor-bloqueadas", regla="si", dominio="bloqueadas", espera_turno=5)
        p = float(r.get("p") or 0)
        nota = "jev: %s p=%.2f (%s)" % (r.get("respuesta"), p, r.get("medio"))
        if r.get("medio") != "regla" and str(r.get("respuesta")).lower() == "no" and p >= logica.UMBRAL_JEV:
            return True, nota
        return False, nota
    except Exception as e:  # noqa: BLE001
        return False, "jev: sin respuesta (%s)" % type(e).__name__


def _hoy_cola_revisor():
    return "cola-revisor-%s.json" % time.strftime("%Y%m%d")


def aplicar(decision, foto, seco=False, jev=True):
    """Ejecuta las acciones. Devuelve la lista de registros {t, tid, accion, motivo, resultado}."""
    ahora_txt = time.strftime("%Y-%m-%d %H:%M:%S")
    tareas = foto.get("tareas") or {}
    progreso = foto.get("progreso") or {}
    cola_viva = foto.get("cola_viva")
    ids_viva = set((foto.get("colas") or {}).get(cola_viva) or [])
    hay_tanda = bool(cola_viva)
    registros = []
    a_progreso, a_control = {}, {}
    for a in decision.get("acciones") or []:
        tid, acc = a.get("tid"), a.get("accion")
        datos = a.get("datos") or {}
        reg = {"t": ahora_txt, "tid": tid, "accion": acc, "motivo": a.get("motivo"),
               "clase": a.get("clase"), "medio": MEDIO}
        if seco:
            reg["resultado"] = "seco"
            registros.append(reg)
            continue
        if jev and a.get("veto_jev"):
            vetada, nota = _veto_jev(a, foto)
            reg["jev"] = nota
            if vetada:
                reg["resultado"] = "vetada por Jev"
                registros.append(reg)
                continue
        en_tanda = hay_tanda and tid in ids_viva
        try:
            if acc in ("ya_hecha", "fusionar"):
                campos = {"estado": datos.get("estado") or "sustituida",
                          "nota": "revisor: %s" % a.get("motivo")}
                if datos.get("por"):
                    campos["sustituida_por"] = datos["por"]
                a_progreso[tid] = campos
                if acc == "fusionar" and datos.get("por"):
                    _recablear(tid, datos["por"])
                reg["resultado"] = "aplicada"
            elif acc in ("reintentar", "reintegrar", "reescribir", "reasignar"):
                entrada = progreso.get(tid) if isinstance(progreso.get(tid), dict) else {}
                if datos.get("enlistar"):
                    _enlistar_en_cola_revisor([datos["enlistar"]])
                    reg["enlistada"] = _hoy_cola_revisor()
                n = entrada.get("intentos_auto")
                nota = "revisor: %s" % a.get("motivo")
                if datos.get("mensaje"):
                    _mensaje(tid, datos["mensaje"])
                if en_tanda:
                    orden = {"accion": "reabrir", "quien": "revisor", "motivo": nota[:160], "t": ahora_txt}
                    if isinstance(n, int) and not isinstance(n, bool):
                        orden["intentos_auto"] = n
                    if datos.get("modelo_siguiente"):
                        orden["modelo"] = datos["modelo_siguiente"]
                    a_control[tid] = orden
                else:
                    campos = {"estado": "pendiente", "nota": nota}
                    if datos.get("modelo_siguiente"):
                        campos["modelo_siguiente"] = datos["modelo_siguiente"]
                    a_progreso[tid] = campos
                reg["resultado"] = "aplicada"
            elif acc == "relajar":
                quitar = [str(d) for d in datos.get("quitar") or []]

                def _sin_deps(nombre, lista, tid=tid, quitar=quitar):
                    cambio = False
                    for t in lista:
                        if isinstance(t, dict) and str(t.get("id")) == tid:
                            for clave in ("depende", "dependencias"):
                                if isinstance(t.get(clave), list):
                                    antes = list(t[clave])
                                    t[clave] = [d for d in antes if str(d) not in quitar]
                                    if t[clave] != antes:
                                        cambio = True
                            if cambio:
                                t["revisor_quitadas"] = sorted(set((t.get("revisor_quitadas") or []) + quitar))
                    return lista if cambio else None

                _editar_colas(_sin_deps)
                _mensaje(tid, "REVISOR DE BLOQUEADAS: se soltó tu dependencia de %s (%s). Si necesitas algo "
                         "suyo, créalo dentro de tus archivos o adáptate a lo que ya hay en main."
                         % (", ".join(quitar), a.get("motivo")))
                if logica._estado(progreso, tid) == "bloqueada":
                    a_progreso[tid] = {"estado": "pendiente", "nota": "revisor: %s" % a.get("motivo"),
                                       "quitar_dependencias": quitar}
                reg["resultado"] = "aplicada"
            elif acc == "trasladar":
                if datos.get("estado"):
                    if en_tanda:
                        a_control[tid] = {"accion": "reabrir", "quien": "revisor",
                                          "motivo": ("revisor: %s" % a.get("motivo"))[:160], "t": ahora_txt}
                    else:
                        a_progreso[tid] = {"estado": datos["estado"], "nota": "revisor: %s" % a.get("motivo")}
                if cola_viva and tid not in ids_viva and tid in tareas:
                    def _meter(nombre, lista, tid=tid):
                        if nombre != cola_viva or any(isinstance(t, dict) and str(t.get("id")) == tid for t in lista):
                            return None
                        return lista + [dict(tareas[tid])]
                    _editar_colas(_meter)
                reg["resultado"] = "aplicada"
            elif acc == "dividir":
                partes = datos.get("tareas_nuevas") or []
                _enlistar_en_cola_revisor(partes)
                ultima = partes[-1]["id"] if partes else None
                a_progreso[tid] = {"estado": "sustituida",
                                   "nota": "revisor: dividida en %s (%s)" % (", ".join(datos.get("partes") or []),
                                                                           a.get("motivo")),
                                   "sustituida_por": ultima}
                if ultima:
                    _recablear(tid, ultima)
                reg["resultado"] = "aplicada"
            elif acc == "priorizar":
                orden = [str(x) for x in datos.get("orden") or []]

                def _ordenar(nombre, lista, orden=orden):
                    if nombre != cola_viva:
                        return None
                    # Solo importa el orden de lo PENDIENTE (lo empezado o cerrado lo lleva el
                    # orquestador en memoria): las pendientes ordenadas van delante y el resto
                    # detrás, en su orden de siempre.
                    pos = {tid: i for i, tid in enumerate(orden)}
                    libres = sorted((t for t in lista if isinstance(t, dict) and str(t.get("id")) in pos),
                                    key=lambda t: pos[str(t.get("id"))])
                    resto = [t for t in lista if not isinstance(t, dict) or str(t.get("id")) not in pos]
                    return libres + resto

                if cola_viva:
                    _editar_colas(_ordenar)
                reg["resultado"] = "aplicada"
            elif acc == "pedir_a_alex":
                reg["resultado"] = "preguntada"
                reg["pregunta"] = datos.get("pregunta")
                reg["opciones"] = datos.get("opciones") or ["rehacer", "descartar"]
            else:
                reg["resultado"] = "desconocida"
        except Exception as e:  # noqa: BLE001
            reg["resultado"] = "error: %s" % type(e).__name__
        registros.append(reg)
    if not seco:
        hechos = _cambiar_progreso(a_progreso)
        controlados = _orden_control(cola_viva, a_control) if a_control else []
        for r in registros:
            if r.get("resultado") == "aplicada" and r["tid"] in a_progreso and r["tid"] not in hechos:
                r["resultado"] = "pendiente: progreso ocupado"
            if r["tid"] in controlados:
                r["via"] = "orden reabrir a la tanda viva"
    return registros


def _enlistar_en_cola_revisor(tareas_nuevas):
    """Añade tareas a `cola-revisor-<AAAAMMDD>.json` (cola de código: la lee el vigilante)."""
    ruta = os.path.join(OLAS, _hoy_cola_revisor())
    lista = _lista_de(_leer(ruta, []))
    ya = {str(t.get("id")) for t in lista if isinstance(t, dict)}
    nuevas = [dict(t) for t in tareas_nuevas or [] if isinstance(t, dict) and str(t.get("id")) not in ya]
    if nuevas:
        _escribir(ruta, lista + nuevas)
    return [str(t.get("id")) for t in nuevas]


def _recablear(viejo, nuevo):
    """Quien dependía de `viejo` pasa a depender de `nuevo` (división o fusión)."""
    def _cambiar(nombre, lista):
        cambio = False
        for t in lista:
            if not isinstance(t, dict) or str(t.get("id")) in (viejo, nuevo) or str(t.get("id")).startswith(viejo + "-d"):
                continue
            for clave in ("depende", "dependencias"):
                deps = t.get(clave)
                if isinstance(deps, list) and viejo in [str(d) for d in deps]:
                    t[clave] = [nuevo if str(d) == viejo else d for d in deps]
                    cambio = True
        return lista if cambio else None
    return _editar_colas(_cambiar)


# ── cerrojo de git del repo principal ────────────────────────────────────────────────────
def barrer_cerrojo_principal():
    """Quita `.git/index.lock` del repo principal si es huérfano (nadie que pudiera tenerlo vive).

    (2026-10-10, medido) El reinicio de la Mac dejó uno a las 23:31: cuatro integraciones ya
    revisadas (PM1010F0A, F0B, F2B, F0K) fallaron al hacer el merge y la escalera las mandó a
    repetir; el barrido de siempre solo miraba los worktrees y exigía CERO gits vivos, y
    Genesis lanza `git log` cada pocos segundos. Regla: un git que arrancó DESPUÉS de que se
    creara el cerrojo no puede ser su dueño."""
    try:
        import cerrojos_git
    except Exception:
        return None
    ruta = os.path.join(RAIZ, ".git", "index.lock")
    rc, salida = _sh(["ps", "-axo", "etime=,args="], timeout=20)
    if rc != 0:
        return None
    return cerrojos_git.quitar_si_huerfano(ruta, salida.splitlines())


# ── estado, informe y avisos ─────────────────────────────────────────────────────────────
def _publicar_chat(texto):
    try:
        import director_chat

        director_chat.publicar(texto, de="revisor-bloqueadas")
        return True
    except Exception:
        return False


def pasada(seco=False, jev=True, ahora=None):
    """UNA pasada completa: foto → aprendizaje → decisión → efectos → estado. Devuelve el informe."""
    ahora = time.time() if ahora is None else ahora
    cerrojo_quitado = None if seco else barrer_cerrojo_principal()
    foto = reunir(ahora)
    memoria, aprendido = logica.evaluar_historial(foto["memoria"], foto["progreso"], foto["tareas"],
                                                  foto["asuntos"], ahora)
    foto["memoria"] = memoria
    decision = logica.decidir(foto)
    registros = aplicar(decision, foto, seco=seco, jev=jev)
    estado = _leer(ESTADO, {})
    estado = estado if isinstance(estado, dict) else {}
    hoy = time.strftime("%Y-%m-%d", time.localtime(ahora))
    if not seco:
        hist = list(memoria.get("historial") or [])
        for r in registros:
            if r.get("resultado") in ("aplicada", "preguntada") and r.get("accion") != "priorizar":
                hist.append({k: r.get(k) for k in ("t", "tid", "accion", "clase", "motivo")})
        memoria["historial"] = hist[-400:]
        transformadas = [r for r in (estado.get("transformadas_hoy") or [])
                         if str(r.get("t") or "").startswith(hoy)]
        transformadas += [r for r in registros if r.get("accion") not in ("pedir_a_alex",)]
        alex = dict(estado.get("necesitan_alex") or {})
        for r in registros:
            if r.get("accion") == "pedir_a_alex" and r.get("tid") not in alex:
                alex[r["tid"]] = {"pregunta": r.get("pregunta"), "opciones": r.get("opciones"),
                                  "motivo": r.get("motivo"), "desde": r.get("t"),
                                  "titulo": str((foto["tareas"].get(r["tid"]) or {}).get("titulo") or r["tid"])[:200]}
        # Lo que ya no está quieto deja de preguntar.
        for tid in list(alex):
            if logica._estado(foto["progreso"], tid) not in logica.QUIETOS:
                alex.pop(tid, None)
        estado.update({
            "version": 1,
            "t": time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(ahora)),
            "medio": MEDIO,
            "cola_viva": foto.get("cola_viva"),
            "memoria": memoria,
            "transformadas_hoy": transformadas[-200:],
            "necesitan_alex": alex,
            "cadenas": decision["cadenas"],
            "en_cadena": decision["en_cadena"],
            "cuentas": dict(decision["cuentas"], necesitan_alex=len(alex),
                            transformadas_hoy=sum(1 for r in transformadas if r.get("accion") != "priorizar"
                                                  and r.get("resultado") == "aplicada")),
            "resumen": decision["resumen"],
            "cerrojo_principal": cerrojo_quitado,
            "aprendido": (estado.get("aprendido") or [])[-20:] + aprendido,
        })
        _escribir(ESTADO, estado)
        utiles = [r for r in registros if r.get("resultado") in ("aplicada", "preguntada")
                  and r.get("accion") not in ("priorizar",)]
        if utiles or cerrojo_quitado:
            lineas = ["*Revisor de bloqueadas* (%s): ninguna tarea se queda quieta." % MEDIO]
            if cerrojo_quitado:
                lineas.append("· cerrojo de git huérfano del repo principal quitado (%s)" % cerrojo_quitado)
            for r in utiles[:12]:
                lineas.append("· %s → %s: %s" % (r["tid"], r["accion"], str(r.get("motivo") or "")[:160]))
            if len(utiles) > 12:
                lineas.append("· y %d más (Genesis › Bloqueadas › Transformadas hoy)" % (len(utiles) - 12))
            _publicar_chat("\n".join(lineas))
    return {
        "ok": True,
        "seco": seco,
        "medio": MEDIO,
        "cola_viva": foto.get("cola_viva"),
        "resumen": decision["resumen"],
        "cuentas": decision["cuentas"],
        "cadenas": decision["cadenas"],
        "acciones": registros,
        "aprendido": aprendido,
        "cerrojo_principal": cerrojo_quitado,
    }


def decidir_alex(tid, opcion):
    """El botón de «Necesitan a Alex»: rehacer (vuelve a transformarse, contador a cero) o
    descartar (rechazada con el motivo de Alex; la rama se conserva)."""
    estado = _leer(ESTADO, {})
    estado = estado if isinstance(estado, dict) else {}
    memoria = dict(estado.get("memoria") or {})
    raiz = logica._raiz_de_cadena(tid)
    dec = dict(memoria.get("decisiones_alex") or {})
    dec[raiz] = {"opcion": opcion, "t": time.strftime("%Y-%m-%d %H:%M:%S")}
    memoria["decisiones_alex"] = dec
    if opcion == "rehacer":
        memoria["historial"] = [h for h in (memoria.get("historial") or [])
                                if logica._raiz_de_cadena((h or {}).get("tid")) != raiz]
        _cambiar_progreso({tid: {"estado": "pendiente", "nota": "Alex: rehacer con otro enfoque (revisor)"}})
        _mensaje(tid, "ALEX pidió rehacer esta tarea con OTRO enfoque: no repitas el intento anterior; "
                      "parte de main tal como está hoy y acota el cambio a tus archivos.")
    elif opcion == "descartar":
        _cambiar_progreso({tid: {"estado": "rechazada", "nota": "descartada por Alex desde Genesis (rama conservada)",
                                 "quien_decidio": "alex"}})
    else:
        return {"ok": False, "error": "opción desconocida: %s" % opcion}
    alex = dict(estado.get("necesitan_alex") or {})
    alex.pop(tid, None)
    estado["necesitan_alex"] = alex
    estado["memoria"] = memoria
    _escribir(ESTADO, estado)
    return {"ok": True, "tid": tid, "opcion": opcion}


# ── servicio ─────────────────────────────────────────────────────────────────────────────
PLANTILLA_SYSTEMD = """[Unit]
Description=StarSeed · revisor automático de bloqueadas (ninguna tarea se desperdicia)
After=network-online.target

[Service]
Type=simple
WorkingDirectory=%(raiz)s
Environment=STARSEED_ROOT=%(raiz)s
ExecStart=%(py)s -u %(guion)s --bucle --cada %(cada)d
Restart=always
RestartSec=30

[Install]
WantedBy=default.target
"""


def instalar():
    """Instala el servicio en ESTE medio: launchd en macOS (vía instalar-servicios.py, con el
    envoltorio TCC de la casa) o systemd --user en Linux (contenedor, A1 de Oracle)."""
    py = sys.executable
    if platform.system() == "Darwin":
        env = dict(os.environ, STARSEED_SOLO="revisor")
        r = subprocess.run([py, os.path.join(DIRECTORIO, "instalar-servicios.py"), RAIZ, py],
                           capture_output=True, text=True, env=env, timeout=120)
        return {"ok": r.returncode == 0, "medio": "launchd", "salida": (r.stdout or r.stderr)[-400:]}
    unidad = os.path.expanduser("~/.config/systemd/user/starseed-revisor-bloqueadas.service")
    os.makedirs(os.path.dirname(unidad), exist_ok=True)
    with open(unidad, "w", encoding="utf-8") as f:
        f.write(PLANTILLA_SYSTEMD % {"raiz": RAIZ, "py": py, "guion": os.path.abspath(__file__), "cada": CADA_S})
    pasos = [["systemctl", "--user", "daemon-reload"],
             ["systemctl", "--user", "enable", "--now", "starseed-revisor-bloqueadas.service"]]
    ok = True
    for orden in pasos:
        try:
            ok = subprocess.run(orden, capture_output=True, timeout=60).returncode == 0 and ok
        except Exception:
            ok = False
    return {"ok": ok, "medio": "systemd --user", "unidad": unidad}


def bucle(cada=CADA_S):
    """Una pasada cada `cada` segundos, para siempre, con un único revisor por máquina."""
    with _flock(CERROJO_REVISOR, espera_s=1) as tomado:
        if not tomado:
            print("revisor-bloqueadas: ya hay otro revisor en esta máquina; salgo", flush=True)
            return 0
        while True:
            try:
                inf = pasada()
                print("%s · %s · %d acción(es)" % (time.strftime("%H:%M:%S"), inf["resumen"],
                                                   len(inf["acciones"])), flush=True)
            except Exception as e:  # noqa: BLE001
                print("revisor-bloqueadas: %s: %s" % (type(e).__name__, e), flush=True)
            time.sleep(max(60, int(cada)))


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    if argv[:1] == ["decidir"] and len(argv) >= 3:
        print(json.dumps(decidir_alex(argv[1], argv[2]), ensure_ascii=False))
        return 0
    if argv[:1] == ["instalar"]:
        print(json.dumps(instalar(), ensure_ascii=False))
        return 0
    if "--bucle" in argv:
        cada = CADA_S
        if "--cada" in argv:
            try:
                cada = int(argv[argv.index("--cada") + 1])
            except (IndexError, ValueError):
                pass
        return bucle(cada)
    seco = "--seco" in argv
    inf = pasada(seco=seco, jev="--sin-jev" not in argv)
    if "--json" in argv:
        print(json.dumps(inf, ensure_ascii=False))
    else:
        print(inf["resumen"])
        for c in inf["cadenas"][:8]:
            print("  en cadena: %d esperan a %s (%s)" % (c["n"], c["raiz"], c["va_por"]))
        for r in inf["acciones"]:
            print("  %-22s %-12s %-10s %s" % (r.get("tid") or "(cola)", r.get("accion"), r.get("resultado"),
                                              str(r.get("motivo") or "")[:110]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
