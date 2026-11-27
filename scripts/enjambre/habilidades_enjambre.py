#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tarjetas de habilidad de Matt Pocock para los escritores del enjambre (Ola 1018L · L).
Contrato: architecture/laya-y-habilidades.md §5. Cada escritor del enjambre recibe la TARJETA
(≤ 60 palabras) de la habilidad de ingeniería que encaja con su tarea: las mismas de
`src/ai/astraura/habilidades/` (MIT, Matt Pocock), copiadas aquí como datos. Si el local de
Laya (/v1/systemone) responde en ≤ 3 s, `elegir_con_laya` decide con `answer_confidence`
(la calibrada, §1) y no las palabras del título/prompt (`tarjeta_para`). `con_habilidad(prompt, tarea)` añade la tarjeta al FINAL del prompt. Módulo PURO con red, reloj y respuesta de Laya inyectables: las pruebas no usan red ni cargan modelos. (LAY1127C) Si Laya no llega al plazo porque se descargó por inactividad, `calentar_si_toca` la deja cargando en un hilo daemon sin bloquear al escritor.
"""
import json
import os
import threading
import time
import unicodedata
import urllib.request

TITULO_BLOQUE = "Cómo trabajar (habilidad de Matt Pocock, MIT)"
UMBRAL_LAYA = 0.5
PLAZO_LAYA_S = 3.0

# (LAY1127C) Laya se descarga tras 10 min sin uso y su primera petición tarda ~28 s: no llega
# al plazo de 3 s y el enjambre nunca la usa. Al fallar por plazo se lanza un calentamiento en
# un hilo daemon (no bloquea) como mucho una vez cada 10 min; la marca es la misma que usará Jev.
URL_LAYA = "http://127.0.0.1:4470/v1/systemone"
RUTA_CALENTAR = "~/.starseed/laya-calentar.json"
RUTA_GOBERNADOR = "~/.starseed/gobernador.json"
VENTANA_CALENTAR_S = 600.0
RAM_MINIMA_MB = 1500
PRESION_MAXIMA = 2
PLAZO_CALENTAR_S = 60.0

# Palabras ya sin acentos, se comparan contra el texto normalizado.
PALABRAS = {
    "tdd": ("prueba", "tests", "tdd"),
    "diagnosing-bugs": ("error", "fallo", "arreglar"),
    "codebase-design": ("modulo", "interfaz", "refactor"),
    "to-spec": ("contrato", "especificacion"),
}

# Tarjetas (≤ 60 palabras) copiadas de src/ai/astraura/habilidades y fieles al original.
HABILIDADES = (
    {"id": "tdd", "nombre": "TDD · Desarrollo guiado por pruebas",
     "cuando": "Construir una función o arreglar un fallo escribiendo primero la prueba.",
     "tarjeta": "Bucle rojo → verde: escribe primero una prueba que falle y luego solo el código justo para pasarla. Una costura, una prueba y una implementación mínima por ciclo, en rebanadas verticales. Prueba comportamiento por la interfaz pública, solo en costuras acordadas con el usuario. Nada de pruebas tautológicas ni acopladas a la implementación. Refactorizar va en la revisión."},
    {"id": "diagnosing-bugs", "nombre": "Diagnóstico de fallos difíciles",
     "cuando": "Algo está roto, lanza errores, falla o va lento.",
     "tarjeta": "Primero un bucle de realimentación: una orden ya ejecutada, rápida, determinista y capaz de ponerse en rojo con el síntoma exacto del usuario; sin ella no hay hipótesis. Reproduce y minimiza. Ordena 3–5 hipótesis falsables. Instrumenta cambiando una variable cada vez, con registros etiquetados [DEBUG-xxxx]. Prueba de regresión antes del arreglo, si hay costura correcta. Limpia. Secretos siempre como <REDACTED>."},
    {"id": "codebase-design", "nombre": "Diseño de módulos profundos",
     "cuando": "Diseñar la interfaz de un módulo o decidir dónde va una costura.",
     "tarjeta": "Diseña módulos profundos: mucho comportamiento tras una interfaz pequeña, en una costura limpia y probado por esa interfaz. La interfaz es todo lo que el llamador debe saber: tipos, invariantes, errores, configuración y rendimiento. Prueba del borrado: si al quitarlo la complejidad reaparece en los llamadores, merecía existir. Un adaptador es una costura hipotética; dos, una real."},
    {"id": "to-spec", "nombre": "De la conversación a la especificación",
     "cuando": "Convertir lo ya discutido en una especificación publicada.",
     "tarjeta": "Convierte la conversación en una especificación, sin entrevista: solo síntesis de lo ya discutido. Explora el repositorio con el vocabulario del glosario, esboza las costuras de prueba, cuantas menos mejor y en el punto más alto, confírmalas con la persona y escribe la especificación con la plantilla: problema, solución, historias de usuario, decisiones y fuera de alcance. Publica con ready-for-agent."},
)
_POR_ID = {h["id"]: h for h in HABILIDADES}

def _sin_acentos(texto):
    return "".join(c for c in unicodedata.normalize("NFKD", texto.lower()) if not unicodedata.combining(c))

def _texto_tarea(t):
    return "%s %s" % (t.get("titulo", ""), t.get("prompt", "")) if isinstance(t, dict) else ""

def tarjeta_para(tarea):
    """Elige por palabras del título/prompt; None si nada encaja (función pura)."""
    texto = _sin_acentos(_texto_tarea(tarea))
    return next((_POR_ID[i] for i, ps in PALABRAS.items() if any(p in texto for p in ps)),
                None) if texto.strip() else None


def _preguntas_laya():
    """Pregunta `choice` entre habilidades y «ninguna» (contrato §5: Laya elige)."""
    criterios = {"ninguna": "La tarea no encaja con ninguna de las anteriores."}
    criterios.update({h["id"]: h["cuando"] for h in HABILIDADES})
    return {"habilidad": {"type": "choice", "criteria": criterios,
                          "instructions": "Elige la habilidad de ingeniería que conviene a la tarea; «ninguna» vale si no encaja con ninguna."}}


def _transporte_laya(url, cuerpo, plazo):
    """POST real al `/v1/systemone` del local (formato de Jev); (codigo, texto)."""
    peticion = urllib.request.Request(url, data=cuerpo,
                                      headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(peticion, timeout=plazo) as respuesta:
        return respuesta.status, respuesta.read().decode("utf-8")

# ── calentamiento de Laya sin bloquear (LAY1127C) ───────────────────────────
def puede_calentar(gobernador, marca, ahora, ventana=VENTANA_CALENTAR_S):
    """PURA. Nunca con presión ≥ 2 ni RAM libre < 1500 MB; como mucho una vez por ventana."""
    if isinstance(gobernador, dict):
        presion = gobernador.get("presion")
        if isinstance(presion, (int, float)) and presion >= PRESION_MAXIMA:
            return False
        ram = gobernador.get("ram_libre_mb")
        if isinstance(ram, (int, float)) and ram < RAM_MINIMA_MB:
            return False
    if isinstance(marca, dict):
        marca = marca.get("t")
    ultimo = float(marca) if isinstance(marca, (int, float)) else None
    return ultimo is None or ahora - ultimo >= ventana

def raiz_descargada(texto):
    """PURA. ¿La raíz o el estado del servidor dicen `cargado: false`?"""
    try:
        datos = json.loads(texto)
    except (TypeError, ValueError):
        return False
    return isinstance(datos, dict) and datos.get("cargado") is False

def _leer_json(ruta):
    """Lee un JSON de disco; {} si no está, no se puede o no es un objeto."""
    try:
        with open(os.path.expanduser(ruta), encoding="utf-8") as f:
            datos = json.load(f)
        return datos if isinstance(datos, dict) else {}
    except (OSError, ValueError):
        return {}

def _escribir_marca(ruta, ahora):
    """Escribe la marca compartida {t: epoch} de forma atómica; False si no se pudo."""
    try:
        destino = os.path.expanduser(ruta)
        os.makedirs(os.path.dirname(destino), exist_ok=True)
        tmp = destino + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"t": float(ahora)}, f)
        os.replace(tmp, destino)
        return True
    except OSError:
        return False

def _lanzar_daemon(trabajo):
    """Arranca `trabajo` en un hilo daemon: el escritor nunca espera a Laya."""
    threading.Thread(target=trabajo, daemon=True).start()

def calentar_si_toca(url=None, transporte=None, reloj=None, gobernador=None,
                     marca=None, ruta_marca=None, lanzador=None,
                     ventana=VENTANA_CALENTAR_S):
    """Lanza SIN BLOQUEAR una petición mínima a Laya si toca; True si la lanzó.
    No calienta con presión ≥ 2 ni RAM libre < 1500 MB, ni más de una vez por ventana;
    deja la marca {t: epoch} compartida (la misma que usará Jev).
    """
    ahora = (reloj or time.time)()
    url = url or URL_LAYA
    if gobernador is None:
        gobernador = _leer_json(RUTA_GOBERNADOR)
    if marca is None:
        marca = _leer_json(ruta_marca or RUTA_CALENTAR)
    if not puede_calentar(gobernador, marca, ahora, ventana):
        return False
    transporte = transporte or _transporte_laya
    cuerpo = json.dumps({"state": "calentamiento", "questions": {}},
                        ensure_ascii=False).encode("utf-8")

    def trabajo():
        try:
            transporte(url, cuerpo, PLAZO_CALENTAR_S)
        except Exception:
            pass

    _escribir_marca(ruta_marca or RUTA_CALENTAR, ahora)
    (lanzador or _lanzar_daemon)(trabajo)
    return True

def elegir_con_laya(tarea, transporte=None, url=None, reloj=None, plazo=PLAZO_LAYA_S,
                    calentador=None):
    """Decisión de Laya local (/v1/systemone); None si no llega a tiempo o responde mal.
    Devuelve {"tarjeta": dict|None, "motor": str}: tarjeta None = respondió y eligió «ninguna».
    El umbral usa `answer_confidence` (calibrada, §1), NUNCA `confidence`; si llega tarde o duda,
    None: se decide con las palabras (nunca bloqueando, §2).
    """
    url = url or URL_LAYA
    # Con transporte inyectado (pruebas) no se calienta salvo que se inyecte `calentador`:
    # el calentamiento es un efecto de producción y jamás debe tocar la red en una prueba.
    transporte_real = transporte is None
    transporte = transporte or _transporte_laya
    reloj = reloj or time.time

    def _calienta():
        if calentador is None and not transporte_real:
            return
        try:
            (calentador or calentar_si_toca)(url)
        except Exception:
            pass

    cuerpo = json.dumps(
        {"state": _texto_tarea(tarea).strip(), "questions": _preguntas_laya()},
        ensure_ascii=False,
    ).encode("utf-8")
    t0 = reloj()
    try:
        codigo, texto = transporte(url, cuerpo, plazo)
    except Exception as error:
        texto_error = ("%s" % error).lower()
        if isinstance(error, TimeoutError) or "timed out" in texto_error or "timeout" in texto_error:
            _calienta()
        return None
    if reloj() - t0 > plazo:
        _calienta()
        return None
    if raiz_descargada(texto):
        _calienta()
        return None
    if codigo != 200:
        return None
    try:
        res = json.loads(texto)
        elegida = res["answers"]["habilidad"]
    except Exception:
        return None
    id = elegida.get("choice")
    if elegida.get("type") != "choice" or (id not in _POR_ID and id != "ninguna"):
        return None
    confianza = elegida.get("answer_confidence")
    if not isinstance(confianza, (int, float)) or confianza < UMBRAL_LAYA:
        return None
    return {"tarjeta": _POR_ID.get(id), "motor": res.get("motor", "laya-local")}

def con_habilidad(prompt, tarea, transporte=None, url=None, reloj=None):
    """Añade la tarjeta al FINAL del prompt del escritor; sin tarjeta, el prompt tal cual.
    Si Laya local respondió a tiempo es quien decide (§5): su «ninguna» con confianza no lleva
    tarjeta; si no llegó, dudó o falló, deciden las palabras del título/prompt.
    """
    try:
        res = elegir_con_laya(tarea, transporte=transporte, url=url, reloj=reloj)
    except Exception:
        res = None
    tarjeta = tarjeta_para(tarea) if res is None else res["tarjeta"]
    if tarjeta is None:
        return prompt
    fuente = ("elegida por Laya local (%s)" % res["motor"] if res
              else "elegida por las palabras del título y el prompt")
    bloque = "%s\n%s · %s\n%s" % (TITULO_BLOQUE, tarjeta["id"], fuente, tarjeta["tarjeta"])
    return prompt.rstrip() + "\n\n" + bloque
