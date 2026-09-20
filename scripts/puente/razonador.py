"""Razonador de la Trinidad de Astraura: reflejo (Needle 3) · juicio (Jev) · deliberación (BitNet).

(2026-09-20) Tres motores, tres papeles medidos, una sola puerta para el Mando y los directores:

- **Needle 3 = reflejo** (local, gratis, 0,1–0,3 s): intención del usuario → herramienta +
  argumentos, extracción. Medido hoy: «abre la app Café» → abrir_app(Café) fiable en español.
  NO juzga entre opciones abstractas: con «veredicto entre 4 acciones» copió cadenas de la
  entrada y acertó 1–2 de 5 con confianza 0,14–0,58. Por eso aquí solo hace `intencion()`.
- **Jev = juicio** (remoto, $0,00002, 0,5 s): elegir con criterio, sí/no y puntuar con
  probabilidad y conocimiento del mundo. `juicio()`, `si_no()`, `puntuar()`.
- **BitNet 1.58 = deliberación** (local en un medio con RAM, ~9 tok/s): generar y planificar.
  `deliberar()` pasa por la puerta de cognición de Astraura; si BitNet no está en RAM, la
  puerta cae sola a su enrutador económico.

Cada respuesta se anota como experiencia (ver `experiencias.py`): de ahí aprende la
conciencia colectiva. Sin Astraura o sin clave, cada capa devuelve None y el que llama
sigue con su regla determinista.
"""
import json
import os
import time
import urllib.request

import experiencias
import jev

ASTRAURA = os.environ.get("STARSEED_ASTRAURA_URL", "http://127.0.0.1:8000")
TIEMPO_S = 20
UMBRAL_REFLEJO = 0.6      # por debajo, la intención pasa a juicio (Jev) o a una persona

#: Transportes sustituibles en las pruebas (nunca red en unittest).
TRANSPORTE_NEEDLE = None
TRANSPORTE_BITNET = None


def _post(url, cuerpo, timeout=TIEMPO_S):
    req = urllib.request.Request(url, data=json.dumps(cuerpo).encode("utf-8"), headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=timeout))


def intencion(texto, herramientas, dominio="", sistema=None):
    """Reflejo: {llamadas, confianza, zona, ms, capa: 'needle'} o None si Needle no está.

    `zona`: ejecutar (≥ UMBRAL_REFLEJO y una sola llamada) · confirmar (0,4–0,6) · escalar."""
    transporte = TRANSPORTE_NEEDLE or (lambda c: _post(ASTRAURA + "/api/needle/decidir", c))
    t0 = time.time()
    try:
        r = transporte({"consulta": texto, "herramientas": herramientas, "sistema": sistema})
    except Exception:
        return None
    if not isinstance(r, dict) or not r.get("ok"):
        return None
    llamadas = r.get("llamadas") or []
    conf = r.get("confianza")
    zona = "escalar"
    if len(llamadas) == 1 and conf is not None:
        zona = "ejecutar" if conf >= UMBRAL_REFLEJO else ("confirmar" if conf >= 0.4 else "escalar")
    fuera = {"capa": "needle", "llamadas": llamadas, "confianza": conf, "zona": zona,
             "razonamiento": r.get("razonamiento"), "ms": r.get("ms") or int((time.time() - t0) * 1000)}
    fuera["experiencia"] = experiencias.anotar(experiencias.nueva(
        "needle", "intencion", texto, {"herramientas": herramientas, "llamadas": llamadas, "razonamiento": r.get("razonamiento")},
        conf, fuera["ms"], dominio=dominio))
    return fuera


def juicio(estado, pregunta, opciones, dominio=""):
    """Juicio: (opcion, probabilidades, confianza, experiencia_id) o None. `opciones` = {clave: significado}."""
    t0 = time.time()
    r = jev.elegir(estado, pregunta, opciones)
    if not r:
        return None
    opcion, probs, conf = r
    eid = experiencias.anotar(experiencias.nueva("jev", "eleccion", {"estado": estado, "pregunta": pregunta}, {"opcion": opcion, "probabilidades": probs},
                                                 conf, (time.time() - t0) * 1000, opciones=list(opciones), dominio=dominio))
    return opcion, probs, conf, eid


def si_no(estado, pregunta, dominio=""):
    """Juicio binario: (p, experiencia_id) o None."""
    t0 = time.time()
    p = jev.si_no(estado, pregunta)
    if p is None:
        return None
    eid = experiencias.anotar(experiencias.nueva("jev", "si_no", {"estado": estado, "pregunta": pregunta}, {"p": p}, p, (time.time() - t0) * 1000, dominio=dominio))
    return p, eid


def deliberar(prompt, dominio="", max_tokens=400):
    """Deliberación: texto generado por BitNet (o por el enrutador económico de Astraura) o None."""
    transporte = TRANSPORTE_BITNET or (lambda c: _post(ASTRAURA + "/api/chat", c, timeout=180))
    t0 = time.time()
    try:
        r = transporte({"message": prompt, "max_tokens": max_tokens})
    except Exception:
        return None
    texto = (r or {}).get("response") or (r or {}).get("text") or ""
    if not texto:
        return None
    modo = (r or {}).get("mode") or (r or {}).get("engine") or "bitnet"
    ms = int((time.time() - t0) * 1000)
    eid = experiencias.anotar(experiencias.nueva("bitnet" if "bitnet" in str(modo) else "llm", "texto", prompt, texto[:400], None, ms, dominio=dominio))
    return {"capa": "bitnet" if "bitnet" in str(modo) else "llm", "texto": texto, "ms": ms, "experiencia": eid}


def confirmar(experiencia_id, acierto, nota=""):
    """Cierra el ciclo: lo que pasó de verdad. Sin esto no hay aprendizaje."""
    return experiencias.resultado(experiencia_id, acierto, nota)
