#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""suenos · la terminal de los SUEÑOS PROFUNDOS del Puente de Mando (localhost:9002).

Una flota de analistas GRATUITOS (el enjambre, tareas `tipo: "analisis"`) sueña cada área de
StarSeed OS con seis lentes; los supervisores CLAUDE (sesiones en la nube pagadas con el
crédito de 250 $, o la sesión interactiva) dirigen, verifican y consolidan desde aquí, por la
terminal y por localhost. Nada de esto escribe código en el repositorio.

  python3 scripts/puente/suenos.py plan        [--horas N] [--areas a,b] [--lentes x,y] [--json]
  python3 scripts/puente/suenos.py lanzar      [--horas N] [--areas …] [--lentes …] [--donde mac]
                                               [--workers 3] [--tope-analisis 8] [--rehacer]
                                               [--directo] [--forzar] [--seco] [--json]
  python3 scripts/puente/suenos.py detener     [--fecha AAAA-MM-DD] [--espera 30] [--seco] [--json]
  python3 scripts/puente/suenos.py estado      [--fecha AAAA-MM-DD] [--json]
  python3 scripts/puente/suenos.py por-verificar [--n 3] [--fecha …] [--json]
  python3 scripts/puente/suenos.py veredicto   <tarea> --estado verificado|ajustado|rechazado
                                               --nota "…" --por claude-<modelo>
                                               [--hallazgo N --impacto X --esfuerzo Y --confianza Z]
                                               [--rechazar-hallazgos 2,5] [--fecha …]
  python3 scripts/puente/suenos.py consolidar  [--fecha …] [--tope 15] [--seco] [--telegram|--sin-telegram] [--sin-jev] [--json]
  python3 scripts/puente/suenos.py latido      --agente <id> --fase "<texto>" [--modelo anthropic/claude-…] [--terminar]

Dónde queda todo (nada se versiona: starseed_memory_root/ está en .gitignore):
  · starseed_memory_root/dream/profundo/<fecha>/plan.json         el plan de la sesión
  · starseed_memory_root/dream/profundo/<fecha>/<área>--<lente>.md/.json   un informe por sueño
  · starseed_memory_root/dream/profundo/<fecha>/verificaciones.jsonl       veredictos (solo se añade)
  · starseed_memory_root/dream/profundo/<fecha>/INFORME.md                 la consolidación
  · starseed_memory_root/olas/cola-suenos-<fecha>.json                     la cola que corre el orquestador
  · starseed_memory_root/olas/cola-suenos-propuesta-<fecha>.json           la propuesta (NO se lanza)

`lanzar` respeta la regla de UN orquestador: si ya hay uno vivo que sabe soñar (arrancó
después de instalar el analista), le añade las tareas a su cola viva, que relee al cambiar;
si es uno viejo, no lanza un segundo (salvo `--forzar`) y dice qué hacer. Sin orquestador,
pide el lanzamiento al Mando (`POST localhost:9002/api/mando/colas`, «aquí») y, si el Mando
no contesta, arranca el orquestador directamente, como hace el Mando.

Protocolo de un supervisor Claude: `scripts/puente/supervisor_suenos.md`. SOP:
`architecture/suenos-profundos.md`.
"""

import argparse
import contextlib
import datetime
import json
import os
import re
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import director_suenos  # noqa: E402
import suenos_areas  # noqa: E402

RAIZ_REPO = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(DIRECTORIO))
MANDO_URL = os.environ.get("STARSEED_MANDO_URL", "http://localhost:9002").rstrip("/")
PATRON_ORQ = re.compile(r"^[^ ]*[Pp]ython[0-9.]* +-u +.*starseed-enjambre\.py")
MARCA_ANALISIS = "_ejecutar_analisis"
ESTADOS_VEREDICTO = ("verificado", "ajustado", "rechazado")
# El mismo flock con el que el orquestador escribe progreso.json (cerrojo("progreso")).
CERROJO_PROGRESO = os.path.expanduser("~/.starseed/cerrojos/progreso.lock")
LATIDO_FRESCO_S = 180


# ─────────────────────────────── rutas ───────────────────────────────

def rutas(raiz):
    mem = os.path.join(raiz, "starseed_memory_root")
    return {"mem": mem, "profundo": os.path.join(mem, "dream", "profundo"), "olas": os.path.join(mem, "olas")}


def ruta_orquestador():
    """La copia INSTALADA del orquestador (la que se lanza), no la del repo."""
    env = os.environ.get("STARSEED_ORQUESTADOR")
    if env:
        return env
    mac = os.path.expanduser("~/.local/bin/starseed-enjambre.py")
    linux = os.path.expanduser("~/bin/starseed-enjambre.py")
    return mac if os.path.exists(mac) or sys.platform == "darwin" else linux


def nombre_cola(sesion):
    return "cola-suenos-%s.json" % sesion


def sesiones(raiz):
    try:
        return sorted(n for n in os.listdir(rutas(raiz)["profundo"]) if re.match(r"^\d{4}-\d{2}-\d{2}$", n))
    except OSError:
        return []


def sesion_elegida(raiz, fecha=None):
    if fecha:
        return fecha
    todas = sesiones(raiz)
    return todas[-1] if todas else datetime.date.today().isoformat()


def _leer_json(ruta, defecto):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def _escribir_json(ruta, datos):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    tmp = "%s.%d.tmp" % (ruta, os.getpid())
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
        f.write("\n")
    os.replace(tmp, ruta)


def _lista(valor):
    return [x.strip() for x in (valor or "").split(",") if x.strip()]


# ─────────────────────────────── procesos ───────────────────────────────

def _segundos_etime(e):
    """«[[dd-]hh:]mm:ss» de `ps -o etime` → segundos."""
    try:
        dias = 0
        if "-" in e:
            d, e = e.split("-", 1)
            dias = int(d)
        partes = [int(x) for x in e.split(":")]
        while len(partes) < 3:
            partes.insert(0, 0)
        return dias * 86400 + partes[0] * 3600 + partes[1] * 60 + partes[2]
    except (TypeError, ValueError):
        return 0


def orquestadores_de(lineas):
    """Orquestadores vivos a partir de `ps -axo pid=,etime=,args=`. Solo cuenta una orden que
    EMPIEZA por python -u (la misma regla que el vigilante: el texto de un prompt que nombra
    el script no es un orquestador). Nunca devuelve la línea entera: solo cola y banderas."""
    fuera = []
    for linea in lineas or []:
        partes = linea.strip().split(None, 2)
        if len(partes) < 3 or not PATRON_ORQ.match(partes[2]):
            continue
        trozos = partes[2].split()
        cola = next((os.path.basename(t) for t in trozos if t.endswith(".json") and os.path.basename(t).startswith("cola-")), "")
        fuera.append({"pid": int(partes[0]), "segundos": _segundos_etime(partes[1]), "cola": cola,
                      "solo": "--solo" in trozos})
    return fuera


def orquestadores_vivos():
    try:
        salida = subprocess.run(["ps", "-axo", "pid=,etime=,args="], capture_output=True, text=True, timeout=20).stdout
    except Exception:
        return []
    return orquestadores_de(salida.splitlines())


def _pid_vivo(pid):
    try:
        os.kill(int(pid), 0)
        return True
    except ProcessLookupError:
        return False
    except (PermissionError, OSError, TypeError, ValueError):
        return True


@contextlib.contextmanager
def cerrojo_progreso(ruta=None, espera_s=60, dormir=time.sleep):
    """Toma el flock de progreso.json. Mientras lo tenemos, ningún orquestador puede estar a
    medio escribir el progreso: si le llega SIGTERM, muere antes o después de escribir, nunca
    en medio (guardar_prog no escribe con renombrado atómico). Sin fcntl, sigue sin él."""
    ruta = ruta or CERROJO_PROGRESO
    try:
        import fcntl
    except ImportError:
        yield False
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
                dormir(0.5)
        yield tomado
    finally:
        if tomado:
            try:
                fcntl.flock(f, fcntl.LOCK_UN)
            except OSError:
                pass
        f.close()


def detener_orquestadores(objetivos, matar=os.kill, vivo=_pid_vivo, dormir=time.sleep, espera_s=30,
                          cerrojo=None, reloj=time.time):
    """SIGTERM a cada orquestador de `objetivos` con el flock del progreso tomado y espera a que
    salgan (≤ espera_s). No manda SIGKILL: lo que siga vivo se devuelve en `siguen`."""
    cerrojo = cerrojo or cerrojo_progreso
    enviados, siguen = [], []
    with cerrojo() as tomado:
        for o in objetivos:
            try:
                matar(int(o["pid"]), signal.SIGTERM)
                enviados.append(int(o["pid"]))
            except ProcessLookupError:
                continue
        t0 = reloj()
        while True:
            siguen = [p for p in enviados if vivo(p)]
            if not siguen or reloj() - t0 >= espera_s:
                break
            dormir(0.5)
    return {"enviados": enviados, "siguen": siguen, "cerrojo": bool(tomado)}


def orquestador_instalado_apto(ruta=None):
    """(apto, mtime): ¿la copia instalada sabe soñar? (lleva la rama de análisis)."""
    ruta = ruta or ruta_orquestador()
    try:
        with open(ruta, encoding="utf-8") as f:
            return MARCA_ANALISIS in f.read(), os.path.getmtime(ruta)
    except OSError:
        return False, 0.0


def puede_sonar(orq, instalado_mtime, ahora=None):
    """Un orquestador vivo sabe soñar si arrancó DESPUÉS de instalar la copia con el analista
    (Python carga el archivo al arrancar: uno anterior sigue con el código viejo)."""
    ahora = time.time() if ahora is None else ahora
    return bool(instalado_mtime) and (ahora - orq["segundos"]) >= instalado_mtime - 1 and not orq["solo"]


def lanzar_por_mando(nombre, workers):
    """POST /api/mando/colas {accion: lanzar, donde: mac}. None si el Mando no contesta."""
    cuerpo = json.dumps({"accion": "lanzar", "nombre": nombre, "donde": "mac", "workers": workers}).encode()
    req = urllib.request.Request(MANDO_URL + "/api/mando/colas", data=cuerpo, method="POST",
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read().decode("utf-8") or "{}")
        except Exception:
            return {"ok": False, "error": "HTTP %s" % e.code}
    except Exception:
        return None


def lanzar_directo(raiz, cola_rel, workers, tope_analisis=None, medio=None):
    """Como `lanzarAqui` del Mando: python3 -u <orquestador> <cola> --workers N, desacoplado."""
    r = rutas(raiz)
    os.makedirs(os.path.join(r["olas"], "logs"), exist_ok=True)
    registro = open(os.path.join(r["olas"], "logs", "lanzamiento-%s.log" % os.path.basename(cola_rel)[5:-5]), "a")
    env = dict(os.environ, STARSEED_ROOT=raiz, STARSEED_DONDE="mac",
               STARSEED_MEDIO=medio or os.environ.get("STARSEED_MEDIO") or "terminal")
    if tope_analisis:
        env["STARSEED_TOPE_ANALISIS"] = str(tope_analisis)
    p = subprocess.Popen([sys.executable or "python3", "-u", ruta_orquestador(), cola_rel, "--workers", str(workers)],
                         cwd=raiz, stdin=subprocess.DEVNULL, stdout=registro, stderr=registro,
                         start_new_session=True, env=env)
    return p.pid


# ─────────────────────────────── plan y colas ───────────────────────────────

def horas_de(raiz, a):
    """Las horas pedidas o, al RELANZAR una sesión que ya existe, las de su último
    lanzamiento: con otras horas cambiarían los archivos de cada área y la lectura ya hecha
    (dream/profundo/<fecha>/.mapa) no se aprovecharía."""
    if getattr(a, "horas", None) is not None:
        return float(a.horas)
    if getattr(a, "fecha", None):
        plan = _leer_json(os.path.join(rutas(raiz)["profundo"], a.fecha, "plan.json"), {})
        lanz = (plan.get("lanzamientos") or [{}])[-1] if isinstance(plan, dict) else {}
        try:
            return float(lanz.get("horas") or 0)
        except (TypeError, ValueError, AttributeError):
            return 0.0
    return 0.0


def construir(raiz, a):
    a.horas = horas_de(raiz, a)
    fecha = datetime.date.fromisoformat(a.fecha) if getattr(a, "fecha", None) else datetime.date.today()
    return suenos_areas.construir_plan(
        suenos_areas.cargar_areas(raiz), suenos_areas.listar_repo(raiz), fecha, a.horas,
        _lista(a.areas), _lista(a.lentes), getattr(a, "tope_analisis", None) or suenos_areas.TOPE_ANALISIS_POR_DEFECTO)


def fundir_tareas(previas, nuevas, rehacer=False):
    """Las tareas de la cola: se conservan las ajenas y las que ya estaban; las del plan nuevo
    sustituyen a las de su mismo id (mismo área × lente, mismo día)."""
    por_id = {t.get("id"): i for i, t in enumerate(previas) if isinstance(t, dict)}
    fuera = [dict(t) for t in previas if isinstance(t, dict)]
    for t in nuevas:
        t = dict(t)
        if rehacer:
            t["rehacer"] = True
        if t["id"] in por_id:
            fuera[por_id[t["id"]]] = t
        else:
            fuera.append(t)
    return fuera


def guardar_plan(raiz, plan, a, por):
    r = rutas(raiz)
    dir_sesion = os.path.join(r["profundo"], plan["sesion"])
    previo = _leer_json(os.path.join(dir_sesion, "plan.json"), {})
    tareas = fundir_tareas(previo.get("tareas") or [], plan["tareas"])
    lanzamientos = list(previo.get("lanzamientos") or [])
    lanzamientos.append({"t": time.strftime("%Y-%m-%d %H:%M:%S"), "horas": plan["horas"], "areas": _lista(a.areas),
                         "lentes": _lista(a.lentes), "tareas": len(plan["tareas"]), "por": por})
    datos = dict(plan, tareas=tareas, lanzamientos=lanzamientos[-20:])
    _escribir_json(os.path.join(dir_sesion, "plan.json"), datos)
    return datos


def tareas_de_la_sesion(raiz, sesion):
    """Tareas de análisis de la sesión: del plan.json o, si no hay, de su cola."""
    r = rutas(raiz)
    plan = _leer_json(os.path.join(r["profundo"], sesion, "plan.json"), {})
    tareas = plan.get("tareas") if isinstance(plan, dict) else None
    if not tareas:
        cola = _leer_json(os.path.join(r["olas"], nombre_cola(sesion)), [])
        tareas = cola if isinstance(cola, list) else cola.get("tareas", [])
    return [t for t in tareas or [] if isinstance(t, dict) and t.get("tipo") == "analisis"]


# ─────────────────────────────── estado ───────────────────────────────

def _latidos_frescos(dir_olas, ahora):
    fuera = {}
    try:
        nombres = [n for n in os.listdir(dir_olas) if n.startswith("latidos-") and n.endswith(".json")]
    except OSError:
        return fuera
    for n in nombres:
        ruta = os.path.join(dir_olas, n)
        try:
            if ahora - os.path.getmtime(ruta) > LATIDO_FRESCO_S:
                continue
        except OSError:
            continue
        d = _leer_json(ruta, {})
        for tid, lat in (d.get("tareas") or {}).items() if isinstance(d, dict) else []:
            if isinstance(lat, dict) and lat.get("fase") not in (None, "", "hecho"):
                fuera[tid] = lat
    return fuera


def estado_sesion(raiz, sesion, ahora=None, vivos=None):
    """Una fila por área × lente con estado, proveedor, tokens, tiempo y veredicto. Lee solo
    archivos locales (el Mando hace lo mismo desde TypeScript)."""
    ahora = time.time() if ahora is None else ahora
    r = rutas(raiz)
    dir_sesion = os.path.join(r["profundo"], sesion)
    tareas = tareas_de_la_sesion(raiz, sesion)
    informes = {i["id"]: i for i in director_suenos.leer_informes(dir_sesion)}
    veredictos = director_suenos.leer_veredictos(dir_sesion)
    progreso = _leer_json(os.path.join(r["olas"], "progreso.json"), {})
    latidos = _latidos_frescos(r["olas"], ahora)
    vivos = orquestadores_vivos() if vivos is None else vivos
    filas = []
    for t in tareas:
        tid = t["id"]
        inf = informes.get(tid)
        v = veredictos.get(tid)
        lat = latidos.get(tid)
        prog = progreso.get(tid) if isinstance(progreso, dict) and isinstance(progreso.get(tid), dict) else {}
        if v:
            estado = v["estado"]
        elif inf:
            estado = "informe"
        elif lat and lat.get("fase") == "analizando":
            estado = "analizando"
        elif str(prog.get("estado") or "").startswith("fallo"):
            estado = "fallo"
        elif prog.get("estado") == "en_curso" and not vivos:
            estado = "interrumpida"
        elif prog.get("estado") == "en_curso":
            estado = "analizando"
        else:
            estado = "pendiente"
        modelos = (inf or {}).get("modelos") or {}
        tokens = (inf or {}).get("tokens") or (lat or {}).get("tokens") or {}
        modelo = modelos.get("sintesis") or (lat or {}).get("modelo") or prog.get("modelo") or ""
        base = "%s--%s" % (t.get("area"), t.get("lente"))
        filas.append({
            "id": tid, "area": t.get("area"), "lente": t.get("lente"), "estado": estado,
            "privado": bool(t.get("privado")), "modelo": modelo, "proveedor": modelo.split("/", 1)[0] if modelo else "",
            "subfase": (lat or {}).get("subfase") or "",
            "tokens": int(tokens.get("entrada", 0) or 0) + int(tokens.get("salida", 0) or 0),
            "llamadas": int(tokens.get("llamadas", 0) or 0),
            "segundos": int((inf or {}).get("segundos") or prog.get("segundos") or
                            ((ahora - float(lat.get("desde"))) if lat and lat.get("desde") else 0)),
            "hallazgos": len((inf or {}).get("hallazgos") or []),
            "veredicto": v["estado"] if v else "", "por": (v or {}).get("por", ""),
            "nota": (prog.get("nota") or "")[:160] if estado in ("fallo", "interrumpida") else "",
            "informe": os.path.join("starseed_memory_root", "dream", "profundo", sesion, base + ".md") if inf else "",
        })
    cuentas = {}
    for f in filas:
        cuentas[f["estado"]] = cuentas.get(f["estado"], 0) + 1
    propia = [o for o in vivos if o["cola"] == nombre_cola(sesion)]
    return {
        "sesion": sesion, "total": len(filas), "cuentas": cuentas, "filas": filas,
        "orquestador": propia[0] if propia else (vivos[0] if vivos else None),
        "orquestador_propio": bool(propia),
        "tokens": sum(f["tokens"] for f in filas),
        "completa": bool(filas) and all(f["estado"] in ESTADOS_VEREDICTO for f in filas),
        "informe_final": os.path.exists(os.path.join(dir_sesion, "INFORME.md")),
        "propuesta": os.path.exists(os.path.join(r["olas"], "cola-suenos-propuesta-%s.json" % sesion)),
    }


def por_verificar(raiz, sesion, n=3):
    """Los próximos informes a verificar: sin veredicto, el de más peso primero."""
    r = rutas(raiz)
    dir_sesion = os.path.join(r["profundo"], sesion)
    veredictos = director_suenos.leer_veredictos(dir_sesion)
    candidatos = []
    for inf in director_suenos.leer_informes(dir_sesion):
        if inf["id"] in veredictos:
            continue
        hs = inf.get("hallazgos") or []
        peso = max([director_suenos.puntuar(dict(h, verificacion="verificado")) for h in hs] or [0])
        base = "%s--%s" % (inf.get("area"), inf.get("lente"))
        candidatos.append({
            "id": inf["id"], "area": inf.get("area"), "lente": inf.get("lente"), "privado": bool(inf.get("privado")),
            "peso": peso, "hallazgos": len(hs),
            "md": os.path.join("starseed_memory_root", "dream", "profundo", sesion, base + ".md"),
            "json": os.path.join("starseed_memory_root", "dream", "profundo", sesion, base + ".json"),
            "citas": [{"n": i, "titulo": h.get("titulo"), "cita": "%s:%s" % (h.get("archivo"), h.get("linea")),
                       "impacto": h.get("impacto"), "esfuerzo": h.get("esfuerzo"), "confianza": h.get("confianza"),
                       "contraste": h.get("contraste", "")} for i, h in enumerate(hs, 1)],
        })
    candidatos.sort(key=lambda c: (-c["peso"], c["id"]))
    return candidatos[: max(1, int(n or 3))]


# ─────────────────────────────── órdenes ───────────────────────────────

def cmd_plan(a, raiz):
    plan = construir(raiz, a)
    return 0, plan


def cmd_lanzar(a, raiz):
    if a.donde != "mac":
        return 2, {"ok": False, "error": "Los sueños corren en la Mac: allí están las claves de la flota gratuita y la lente "
                                         "de seguridad no puede salir de ella. Usa --donde mac."}
    plan = construir(raiz, a)
    if not plan["tareas"]:
        return 2, {"ok": False, "error": "El plan salió vacío (¿áreas o lentes desconocidas? %s)" % ", ".join(plan["desconocidas"])}
    r = rutas(raiz)
    sesion = plan["sesion"]
    cola = nombre_cola(sesion)
    cola_rel = os.path.join("starseed_memory_root", "olas", cola)
    fuera = {"ok": True, "sesion": sesion, "tareas": len(plan["tareas"]), "cola": cola_rel, "pausa_s": plan["pausa_s"],
             "llamadas_estimadas": plan["llamadas"], "desconocidas": plan["desconocidas"]}
    vivos = orquestadores_vivos()
    apto, mtime = orquestador_instalado_apto()
    propio = [o for o in vivos if o["cola"] == cola]
    otros = [o for o in vivos if o["cola"] != cola]
    if a.seco:
        fuera.update(seco=True, orquestadores=vivos, instalado_apto=apto)
        return 0, fuera
    guardar_plan(raiz, plan, a, a.por)
    ruta_cola = os.path.join(r["olas"], cola)
    previas = _leer_json(ruta_cola, [])
    _escribir_json(ruta_cola, fundir_tareas(previas if isinstance(previas, list) else previas.get("tareas", []),
                                            plan["tareas"], a.rehacer))
    if not apto:
        fuera.update(ok=False, accion="instalar", error=(
            "El orquestador instalado (%s) no sabe soñar todavía. En la Mac: "
            "bash scripts/enjambre/instalar.sh && bash scripts/enjambre/instalar.sh --comprobar" % ruta_orquestador()))
        return 3, fuera
    if propio:
        fuera.update(accion="releida", pid=propio[0]["pid"],
                     mensaje="Ya hay un orquestador soñando esta sesión: releerá la cola al quedar un hueco.")
    elif otros and not a.forzar:
        o = otros[0]
        if puede_sonar(o, mtime):
            viva = os.path.join(r["olas"], o["cola"])
            previas = _leer_json(viva, [])
            lista = previas if isinstance(previas, list) else previas.get("tareas", [])
            _escribir_json(viva, fundir_tareas(lista, plan["tareas"], a.rehacer) if isinstance(previas, list)
                           else dict(previas, tareas=fundir_tareas(lista, plan["tareas"], a.rehacer)))
            fuera.update(accion="tanda_viva", pid=o["pid"], cola_viva=o["cola"], mensaje=(
                "Un solo orquestador: añadidas a su cola viva (%s); los sueños van con su propio tope y no "
                "quitan huecos a los agentes de código." % o["cola"]))
        else:
            fuera.update(ok=False, accion="esperar", pid=o["pid"], cola_viva=o["cola"], error=(
                "Hay un orquestador vivo (pid %d, %s) %s. La regla es UN orquestador: espera a que termine y "
                "repite, o usa --forzar para lanzar uno aparte solo de análisis (HTTP, ~80 MB)."
                % (o["pid"], o["cola"], "en tanda manual (--solo)" if o["solo"] else "que arrancó antes de instalar el analista")))
            return 4, fuera
    else:
        workers = max(1, min(8, a.workers))
        respuesta = None if a.directo else lanzar_por_mando("suenos-%s" % sesion, workers)
        if respuesta and respuesta.get("ok"):
            fuera.update(accion="mando", pid=respuesta.get("pid"), mensaje="Lanzado por el Puente de Mando (localhost:9002).")
        else:
            if respuesta and not respuesta.get("ok"):
                fuera["aviso_mando"] = respuesta.get("error") or "el Mando no lo lanzó"
            pid = lanzar_directo(raiz, cola_rel, workers, a.tope_analisis, "claude" if os.environ.get("CLAUDECODE") else None)
            fuera.update(accion="directo", pid=pid, mensaje="El Mando no contestó: orquestador lanzado desde la terminal.")
    try:
        director_suenos.anunciar("Sueños profundos %s: %d tareas en marcha (%s) · hasta %d a la vez · "
                                 "verificación por supervisores Claude." % (sesion, len(plan["tareas"]), fuera["accion"],
                                                                            a.tope_analisis))
    except Exception:
        pass
    return 0, fuera


def cmd_detener(a, raiz):
    """Para con seguridad el orquestador de UNA sesión de sueños (solo el de su cola): SIGTERM
    con el flock del progreso tomado. Lo escrito se conserva: al relanzar con la misma
    --fecha, los informes hechos se saltan, la lectura compartida (.mapa/) se reutiliza y los
    reclamos del proceso muerto se rompen solos."""
    sesion = sesion_elegida(raiz, a.fecha)
    cola = nombre_cola(sesion)
    objetivos = [o for o in orquestadores_vivos() if o["cola"] == cola]
    fuera = {"ok": True, "sesion": sesion, "cola": cola, "pids": [o["pid"] for o in objetivos]}
    if not objetivos:
        return 1, dict(fuera, ok=False, error="No hay ningún orquestador vivo con %s en esta máquina." % cola)
    if a.seco:
        return 0, dict(fuera, seco=True)
    r = detener_orquestadores(objetivos, espera_s=a.espera)
    fuera.update(r)
    if r["siguen"]:
        fuera.update(ok=False, error="Siguen vivos tras %d s: %s. Espera un poco y repite (no mando SIGKILL)."
                     % (a.espera, ", ".join(str(p) for p in r["siguen"])))
        return 5, fuera
    return 0, fuera


def cmd_estado(a, raiz):
    return 0, estado_sesion(raiz, sesion_elegida(raiz, a.fecha))


def cmd_por_verificar(a, raiz):
    sesion = sesion_elegida(raiz, a.fecha)
    return 0, {"sesion": sesion, "por_verificar": por_verificar(raiz, sesion, a.n)}


def cmd_veredicto(a, raiz):
    sesion = sesion_elegida(raiz, a.fecha)
    dir_sesion = os.path.join(rutas(raiz)["profundo"], sesion)
    informes = {i["id"]: i for i in director_suenos.leer_informes(dir_sesion)}
    if a.tarea not in informes:
        return 2, {"ok": False, "error": "No hay informe de %s en la sesión %s: no se verifica lo que no existe." % (a.tarea, sesion)}
    por = (a.por or "").strip()
    if not por or len(por) > 60 or not re.match(r"^[A-Za-z0-9._:/-]+$", por):
        return 2, {"ok": False, "error": "--por debe decir quién verificó, p. ej. claude-opus-5.5 (sin espacios)."}
    if not (a.nota or "").strip():
        return 2, {"ok": False, "error": "--nota es obligatoria: qué comprobaste en el código."}
    n_hall = len(informes[a.tarea].get("hallazgos") or [])
    ajustes = {}
    if a.hallazgo is not None:
        if not 1 <= a.hallazgo <= n_hall:
            return 2, {"ok": False, "error": "--hallazgo fuera de rango (1…%d)." % n_hall}
        cambios = {}
        if a.impacto is not None:
            cambios["impacto"] = max(1, min(5, a.impacto))
        if a.esfuerzo is not None:
            cambios["esfuerzo"] = max(1, min(5, a.esfuerzo))
        if a.confianza is not None:
            cambios["confianza"] = round(max(0.0, min(1.0, a.confianza)), 2)
        if not cambios:
            return 2, {"ok": False, "error": "--hallazgo sin --impacto/--esfuerzo/--confianza no ajusta nada."}
        ajustes[str(a.hallazgo)] = cambios
    rechazados = []
    for x in _lista(a.rechazar_hallazgos):
        if not x.isdigit() or not 1 <= int(x) <= n_hall:
            return 2, {"ok": False, "error": "--rechazar-hallazgos: «%s» fuera de rango (1…%d)." % (x, n_hall)}
        rechazados.append(int(x))
    estado = a.estado
    if (ajustes or rechazados) and estado == "verificado":
        estado = "ajustado"  # verificar con correcciones es ajustar: que el orden lo refleje
    fila = {"t": time.strftime("%Y-%m-%d %H:%M:%S"), "tarea": a.tarea, "estado": estado, "nota": a.nota.strip()[:600],
            "por": por, "ajustes": ajustes, "rechazados": rechazados}
    os.makedirs(dir_sesion, exist_ok=True)
    with open(os.path.join(dir_sesion, "verificaciones.jsonl"), "a", encoding="utf-8") as f:
        f.write(json.dumps(fila, ensure_ascii=False) + "\n")
    return 0, {"ok": True, "sesion": sesion, "veredicto": fila}


def cmd_consolidar(a, raiz):
    sesion = sesion_elegida(raiz, a.fecha)
    r = rutas(raiz)
    est = estado_sesion(raiz, sesion, vivos=[])
    telegram = (est["completa"] or a.telegram) and not a.sin_telegram
    extra = {"consejero": None} if a.sin_jev else {}
    res = director_suenos.ejecutar(os.path.join(r["profundo"], sesion), r["olas"], sesion, tope=a.tope, seco=a.seco,
                                   planificadas=est["total"], telegram=telegram, **extra)
    res["completa"] = est["completa"]
    return 0, res


def cmd_latido(a, raiz):
    import latido_externo as L  # noqa: E402
    agente = "suenos"
    ns = argparse.Namespace(id=a.agente, titulo=a.titulo or ("Supervisor Claude de los sueños · " + a.agente),
                            modelo=a.modelo, proveedor="anthropic", donde=a.donde, medio="claude",
                            fase=a.fase, minutos=a.minutos, agente=agente)
    if a.terminar:
        L.terminar(ns)
        return 0, {"ok": True, "agente": a.agente, "terminado": True}
    actual = L.leer(agente)["tareas"].get(a.agente)
    t = L.fase(ns) if actual else L.empezar(ns)
    return 0, {"ok": True, "agente": a.agente, "fase": t.get("fase"), "hasta": t.get("hasta")}


# ─────────────────────────────── salida ───────────────────────────────

def _miles(n):
    return "{:,}".format(int(n or 0)).replace(",", ".")


def pintar(orden, codigo, d):
    if not isinstance(d, dict):
        print(d)
        return
    if d.get("error"):
        print("✗ " + d["error"])
    if orden == "plan":
        print("%s · %d tareas · ~%d llamadas · pausa %d s · %d archivos por área" % (
            d["ola"], len(d["tareas"]), d["llamadas"], d["pausa_s"], d["archivos_por_area"]))
        for t in d["tareas"]:
            print("  %-9s %-12s %-24s %3d archivos%s" % (t["id"], t["area"], t["lente"], len(t["archivos"]),
                                                         " · privado" if t["privado"] else ""))
    elif orden == "lanzar":
        if d.get("seco"):
            print("(seco) %d tareas en %s · ~%d llamadas · pausa %d s · orquestadores vivos: %d · instalado sabe soñar: %s"
                  % (d["tareas"], d["cola"], d["llamadas_estimadas"], d["pausa_s"], len(d.get("orquestadores") or []),
                     "sí" if d.get("instalado_apto") else "no"))
        elif d.get("ok"):
            print("✓ %s · %d tareas · %s%s" % (d["sesion"], d["tareas"], d.get("mensaje", ""),
                                               (" (pid %s)" % d["pid"]) if d.get("pid") else ""))
            print("  cola: %s · sigue con: python3 scripts/puente/suenos.py estado" % d["cola"])
    elif orden == "estado":
        c = d["cuentas"]
        print("Sueños profundos %s · %d tareas · %s · %s tokens estimados" % (
            d["sesion"], d["total"], " · ".join("%d %s" % (v, k) for k, v in sorted(c.items())) or "sin tareas",
            _miles(d["tokens"])))
        o = d.get("orquestador")
        print("Orquestador: %s" % (("vivo · pid %d · %s · %d min%s" % (o["pid"], o["cola"], o["segundos"] // 60,
                                                                        "" if d["orquestador_propio"] else " (otra cola)")) if o else "parado"))
        print("%-9s %-12s %-24s %-11s %-34s %9s %6s  %s" % ("tarea", "área", "lente", "estado", "modelo", "tokens", "min", "veredicto"))
        for f in d["filas"]:
            print("%-9s %-12s %-24s %-11s %-34s %9s %6d  %s" % (
                f["id"], f["area"], f["lente"], f["estado"], (f["modelo"] or f["subfase"])[:34], _miles(f["tokens"]),
                f["segundos"] // 60, (f["por"] or f["nota"])[:40]))
        sig = next((f for f in d["filas"] if f["estado"] == "informe"), None)
        if sig:
            print("Siguiente a verificar: %s (%s × %s) → %s" % (sig["id"], sig["area"], sig["lente"], sig["informe"]))
        if d["completa"]:
            print("Todo verificado: python3 scripts/puente/suenos.py consolidar")
    elif orden == "por-verificar":
        if not d["por_verificar"]:
            print("Nada por verificar en %s." % d["sesion"])
        for c in d["por_verificar"]:
            print("%s · %s × %s%s · %d hallazgos · peso %.2f\n  %s" % (
                c["id"], c["area"], c["lente"], " · 🔒 privado" if c["privado"] else "", c["hallazgos"], c["peso"], c["md"]))
            for h in c["citas"][:6]:
                print("   %d. %s — %s (I%s E%s C%s%s)" % (h["n"], h["titulo"], h["cita"], h["impacto"], h["esfuerzo"],
                                                         h["confianza"], (", " + h["contraste"]) if h["contraste"] else ""))
    elif orden == "veredicto":
        if d.get("ok"):
            v = d["veredicto"]
            print("✓ %s → %s por %s" % (v["tarea"], v["estado"], v["por"]))
    elif orden == "consolidar":
        print(d.get("resumen", ""))
        if not d.get("seco"):
            print("  %s\n  %s" % (d.get("informe"), d.get("cola") or "(sin propuestas nuevas)"))
    elif orden == "detener":
        if d.get("seco"):
            print("Pararía %s: pid %s" % (d["cola"], ", ".join(str(p) for p in d["pids"])))
        elif d.get("ok"):
            print("✓ %s parado (pid %s)%s" % (d["cola"], ", ".join(str(p) for p in d["enviados"]),
                                               "" if d.get("cerrojo") else " · sin el cerrojo del progreso"))
    elif orden == "latido":
        print("✓ latido de %s%s" % (d.get("agente"), " terminado" if d.get("terminado") else " · " + str(d.get("fase"))))


def parser():
    ap = argparse.ArgumentParser(prog="suenos.py", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--raiz", default=None, help=argparse.SUPPRESS)
    sub = ap.add_subparsers(dest="orden", required=True)

    def comunes_plan(p):
        p.add_argument("--horas", type=float, default=None,
                       help="profundidad (archivos por área); al relanzar una sesión, por defecto la de su último lanzamiento")
        p.add_argument("--areas", default="")
        p.add_argument("--lentes", default="")
        p.add_argument("--fecha", default="")
        p.add_argument("--tope-analisis", type=int, default=suenos_areas.TOPE_ANALISIS_POR_DEFECTO)
        p.add_argument("--json", action="store_true")

    p = sub.add_parser("plan")
    comunes_plan(p)
    p = sub.add_parser("lanzar")
    comunes_plan(p)
    p.add_argument("--donde", default="mac")
    p.add_argument("--workers", type=int, default=3)
    p.add_argument("--rehacer", action="store_true")
    p.add_argument("--directo", action="store_true", help="no pedirlo al Mando: arrancar el orquestador aquí")
    p.add_argument("--forzar", action="store_true", help="lanzar aunque haya otro orquestador vivo")
    p.add_argument("--seco", action="store_true")
    p.add_argument("--por", default=os.environ.get("STARSEED_MEDIO") or "terminal")
    p = sub.add_parser("detener")
    p.add_argument("--fecha", default="")
    p.add_argument("--espera", type=int, default=30)
    p.add_argument("--seco", action="store_true")
    p.add_argument("--json", action="store_true")
    p = sub.add_parser("estado")
    p.add_argument("--fecha", default="")
    p.add_argument("--json", action="store_true")
    p = sub.add_parser("por-verificar")
    p.add_argument("--n", type=int, default=3)
    p.add_argument("--fecha", default="")
    p.add_argument("--json", action="store_true")
    p = sub.add_parser("veredicto")
    p.add_argument("tarea")
    p.add_argument("--estado", required=True, choices=ESTADOS_VEREDICTO)
    p.add_argument("--nota", required=True)
    p.add_argument("--por", required=True)
    p.add_argument("--hallazgo", type=int)
    p.add_argument("--impacto", type=int)
    p.add_argument("--esfuerzo", type=int)
    p.add_argument("--confianza", type=float)
    p.add_argument("--rechazar-hallazgos", default="")
    p.add_argument("--fecha", default="")
    p.add_argument("--json", action="store_true")
    p = sub.add_parser("consolidar")
    p.add_argument("--fecha", default="")
    p.add_argument("--tope", type=int, default=director_suenos.TOPE_PROPUESTA)
    p.add_argument("--seco", action="store_true")
    p.add_argument("--telegram", action="store_true", help="mandar el resumen aunque la sesión no esté completa")
    p.add_argument("--sin-telegram", action="store_true")
    p.add_argument("--sin-jev", action="store_true", help="solo la regla determinista, sin consultar a Jev")
    p.add_argument("--json", action="store_true")
    p = sub.add_parser("latido")
    p.add_argument("--agente", required=True)
    p.add_argument("--fase", default="supervisando")
    p.add_argument("--titulo", default="")
    p.add_argument("--modelo", default="anthropic/claude")
    p.add_argument("--donde", default="claude")
    p.add_argument("--minutos", type=int, default=70)
    p.add_argument("--terminar", action="store_true")
    p.add_argument("--json", action="store_true")
    return ap


ORDENES = {"plan": cmd_plan, "lanzar": cmd_lanzar, "detener": cmd_detener, "estado": cmd_estado, "por-verificar": cmd_por_verificar,
           "veredicto": cmd_veredicto, "consolidar": cmd_consolidar, "latido": cmd_latido}


def main(argv=None):
    a = parser().parse_args(argv)
    raiz = a.raiz or RAIZ_REPO
    codigo, datos = ORDENES[a.orden](a, raiz)
    if getattr(a, "json", False):
        print(json.dumps(datos, ensure_ascii=False, indent=1, default=list))
    else:
        pintar(a.orden, codigo, datos)
    return codigo


if __name__ == "__main__":
    sys.exit(main())
