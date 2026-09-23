#!/usr/bin/env python3
"""Jev local: decisiones tipadas sobre el servidor BitNet de Astraura."""

import json
import math
import os
import urllib.request

URL = os.environ.get("STARSEED_JEV_LOCAL_URL", "http://127.0.0.1:8790").rstrip("/")
TIEMPO_S = 6
TRANSPORTE = None
# (Astraura en vivo · 2026-09-23) Mientras Alex conversa con Astraura, el único
# hueco del llama-server (--parallel 1) es de la conversación: un prompt de
# Jev de ~650 tokens a 12 tok/s lo ocupaba 50 s y la respuesta hablada caía a
# la nube. Con la concesión activa, Jev local se aparta (devuelve None y Jev
# sigue con su siguiente medio).
CONCESION = os.path.expanduser(
    os.environ.get("STARSEED_CONVERSACION", "~/.starseed/conversacion.json")
)


def conversando(ruta=None, ahora=None):
    """True si hay una conversación en vivo con Astraura ahora mismo."""
    import time

    try:
        with open(ruta or CONCESION, encoding="utf-8") as f:
            hasta = float((json.load(f) or {}).get("hasta") or 0)
    except (OSError, ValueError, TypeError, AttributeError):
        return False
    return hasta > (time.time() if ahora is None else ahora)


def _transporte_real(cuerpo, timeout=TIEMPO_S):
    """POST local sin claves ni persistencia de uso."""
    req = urllib.request.Request(
        URL + "/completion",
        data=json.dumps(cuerpo).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    return json.load(urllib.request.urlopen(req, timeout=timeout))


def _letras(cuantas):
    """Etiquetas A, B, C... para las opciones."""
    fuera = []
    n = 0
    while len(fuera) < cuantas:
        n += 1
        letra = ""
        resto = n
        while resto:
            resto, indice = divmod(resto - 1, 26)
            letra = chr(ord("A") + indice) + letra
        fuera.append(letra)
    return fuera


def _softmax(logprobs):
    """Softmax estable sobre log-probabilidades."""
    if not logprobs:
        return []
    maximo = max(logprobs)
    pesos = [math.exp(v - maximo) for v in logprobs]
    total = sum(pesos)
    return [p / total for p in pesos] if total else []


def _opciones(pregunta):
    tipo = pregunta.get("type")
    criterios = pregunta.get("criteria")
    if tipo == "noul":
        return ["sí", "no"]
    if tipo == "choice" and isinstance(criterios, dict):
        return list(criterios)
    if tipo == "score" and isinstance(criterios, list):
        return list(criterios)
    return None


def _prompt(estado, pregunta):
    """Construye un prompt con el estado al principio y respuesta tipada."""
    opciones = _opciones(pregunta)
    if opciones is None:
        return None
    estado_json = json.dumps(estado, ensure_ascii=False, sort_keys=True)
    lineas = [estado_json, "", pregunta.get("instructions", ""), "", "Opciones:"]
    for letra, opcion in zip(_letras(len(opciones)), opciones):
        lineas.append("%s. %s" % (letra, opcion))
    lineas.append("Respuesta: ")
    return "\n".join(lineas)


def _probabilidades(respuesta, letras):
    """Extrae y normaliza las letras válidas de la primera posición."""
    if not isinstance(respuesta, dict):
        return None
    try:
        completions = respuesta.get("completion_probabilities")
        primeras = completions[0]
    except (IndexError, TypeError):
        return None
    if not isinstance(primeras, list):
        return None
    valores = {}
    for item in primeras[:20]:
        if not isinstance(item, dict):
            continue
        token = item.get("token")
        logprob = item.get("logprob")
        letra = token.strip() if isinstance(token, str) else ""
        if letra not in letras or not isinstance(logprob, (int, float)):
            continue
        valor = float(logprob)
        if not math.isfinite(valor):
            continue
        valores[letra] = valor
    if not valores:
        return None
    letras_validas = [l for l in letras if l in valores]
    normalizadas = _softmax([valores[l] for l in letras_validas])
    if len(normalizadas) != len(letras_validas):
        return None
    return {l: p for l, p in zip(letras_validas, normalizadas)}


def _resuelve_pregunta(nombre, pregunta, prompt, transporte):
    """Consulta una pregunta y devuelve su respuesta tipada, o None."""
    try:
        respuesta = transporte(
            {
                "prompt": prompt,
                "n_predict": 1,
                "n_probs": 20,
                "temperature": 0,
                "cache_prompt": True,
            }
        )
    except Exception:
        return None
    opciones = _opciones(pregunta)
    if opciones is None:
        return None
    letras = _letras(len(opciones))
    probabilidades = _probabilidades(respuesta, letras)
    if not probabilidades:
        return None
    maxima = max(probabilidades, key=probabilidades.get)
    indice = letras.index(maxima)
    tipo = pregunta.get("type")
    if tipo == "noul":
        return {"type": "noul", "noul": probabilidades[letras[0]]}
    if tipo == "choice":
        return {
            "type": "choice",
            "choice": opciones[indice],
            "probabilities": {
                opcion: probabilidades.get(letra, 0.0)
                for letra, opcion in zip(letras, opciones)
            },
            "confidence": probabilidades[maxima],
        }
    return {
        "type": "score",
        "score": float(indice),
        "probabilities": {
            str(i): probabilidades.get(letra, 0.0) for i, letra in enumerate(letras)
        },
        "confidence": probabilidades[maxima],
    }


def decidir(estado, preguntas, tiempo_s=6):
    """Devuelve respuestas tipadas locales, o None si el medio no contesta."""
    if not isinstance(preguntas, dict) or not preguntas:
        return None
    if TRANSPORTE is None and conversando():
        return None
    transporte = TRANSPORTE or (lambda cuerpo: _transporte_real(cuerpo, tiempo_s))
    respuestas = {}
    for nombre, pregunta in preguntas.items():
        if not isinstance(pregunta, dict):
            return None
        prompt = _prompt(estado, pregunta)
        if prompt is None:
            return None
        respuesta = _resuelve_pregunta(nombre, pregunta, prompt, transporte)
        if respuesta is None:
            return None
        respuestas[nombre] = respuesta
    return respuestas


def disponible():
    """Comprueba /health con un plazo corto, sin esperar una inferencia."""
    if conversando():
        return False
    try:
        req = urllib.request.Request(URL + "/health")
        with urllib.request.urlopen(req, timeout=2) as respuesta:
            return respuesta.getcode() == 200
    except Exception:
        return False


if __name__ == "__main__":
    print("disponible" if disponible() else "no disponible")
