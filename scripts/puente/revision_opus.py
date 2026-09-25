#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Revisión de dirección con Opus: cada pocas horas, si algo cambió y si hay Opus con cupo.

El director de orquestación la lanza en segundo plano con su parte horario; esta decide sola
si toca (cada STARSEED_OPUS_REVISION_H horas, 4 por defecto, y solo si el estado cambió).
Lee los medidores del Mando, pide a Opus (CLI de Claude Code, suscripción, con tope en
`opus_director.py`) hasta tres decisiones de dirección y las deja:
  · en starseed_memory_root/mando/revision-opus.json (lo último),
  · en el canal del director (Reportes del Mando),
  · y mientras piensa, como agente «director-opus» en Agentes y Tareas del Mando.
Sin Opus o sin cupo no hace nada: el director sigue con sus reglas y Jev.
"""
import hashlib, importlib.util, json, os, subprocess, sys, time, urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import opus_director  # noqa: E402

RAIZ = os.environ.get("STARSEED_ROOT") or os.path.abspath(os.path.join(AQUI, "..", ".."))
SALIDA = os.path.join(RAIZ, "starseed_memory_root", "mando", "revision-opus.json")
ESTADO = os.path.expanduser("~/.starseed/opus-revision.json")
CADA_S = float(os.environ.get("STARSEED_OPUS_REVISION_H", "4")) * 3600
MANDO = os.environ.get("STARSEED_MANDO_LOCAL", "http://127.0.0.1:9002")
CLAVES = ("ola-activa", "en-curso", "listas", "bloqueadas", "sin-publicar", "proveedores", "contenedores", "disco")
PREGUNTA = (
    "Eres el director de StarSeed OS (un sistema operativo social; un enjambre de agentes con modelos "
    "gratuitos escribe el código y tú diriges). Abajo va el estado del Puente de Mando. Da como máximo "
    "TRES decisiones de dirección para las próximas horas: qué desbloquear, qué lanzar o frenar, qué "
    "verificar, y qué tarea de diseño o animación compleja reservar para Opus. Español llano, sin jerga. "
    "Formato por línea: «- decisión · por qué · cómo comprobarlo». Si todo va bien, responde «sin cambios»."
)


def medidor(clave):
    with urllib.request.urlopen("%s/api/mando/medidores?clave=%s" % (MANDO, clave), timeout=60) as r:
        d = json.loads(r.read().decode("utf-8"))
    filas = [{"titulo": f.get("titulo"), "estado": f.get("estado"), "porque": str(f.get("porque") or "")[:140]}
             for f in (d.get("filas") or [])[:4]]
    return {"medidor": d.get("titulo") or clave, "resumen": d.get("resumen"), "filas": filas}


def estado_compacto(leer=medidor):
    fuera = []
    for c in CLAVES:
        try:
            fuera.append(leer(c))
        except Exception:
            continue
    return fuera


def huella(estado):
    return hashlib.sha256(json.dumps([e.get("resumen") for e in estado], ensure_ascii=False).encode()).hexdigest()[:16]


def _leer(ruta):
    try:
        return json.load(open(ruta, encoding="utf-8"))
    except Exception:
        return {}


def _escribir(ruta, datos):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta + ".tmp", "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    os.replace(ruta + ".tmp", ruta)


def _latir(accion, modelo="anthropic/claude-opus"):
    args = [sys.executable, os.path.join(AQUI, "latido_externo.py"), accion, "opus-revision"]
    if accion == "empezar":
        args += ["Revisión de dirección con Opus", "--modelo", modelo, "--proveedor", "anthropic",
                 "--donde", "mac", "--medio", "claude", "--fase", "pensando", "--minutos", "10"]
    subprocess.run(args + ["--agente", "director-opus"], capture_output=True, timeout=30)


def _decir(texto):
    spec = importlib.util.spec_from_file_location("puente", os.path.join(AQUI, "puente.py"))
    p = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(p)
    p.decir("REVISIÓN DE DIRECCIÓN (Opus)\n" + texto[:1500], "director-opus", "mensaje")


def revisar(ahora=None, leer=medidor, consultar=None, decir=_decir, latir=_latir):
    """El texto de Opus, o None si no tocaba, no había Opus o no contestó."""
    ahora = ahora or time.time()
    previo = _leer(ESTADO)
    if ahora - previo.get("corriendo", 0) < 900 or ahora - previo.get("t", 0) < CADA_S:
        return None
    if not opus_director.disponible(ahora)[0] and consultar is None:
        return None
    estado = estado_compacto(leer)
    h = huella(estado)
    if not estado or h == previo.get("huella"):
        return None
    _escribir(ESTADO, dict(previo, corriendo=ahora))
    latir("empezar")
    try:
        r = (consultar or opus_director.consultar)(PREGUNTA, json.dumps(estado, ensure_ascii=False))
    finally:
        latir("terminar")
    _escribir(ESTADO, {"t": ahora, "huella": h, "ok": bool(r), "corriendo": 0})
    if not r:
        return None
    _escribir(SALIDA, {"t": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ahora)),
                       "modelo": r.get("modelo"), "texto": r["texto"], "huella": h})
    if "sin cambios" not in r["texto"].lower()[:40]:
        decir(r["texto"])
    return r["texto"]


if __name__ == "__main__":
    t = revisar()
    print(t if t else "no tocaba (o sin Opus con cupo)")
    print(opus_director.resumen_uso())
