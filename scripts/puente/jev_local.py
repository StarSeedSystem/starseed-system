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


def _prompt(estado, pregunta, opciones=None):
    """Construye un prompt con el estado al principio y respuesta tipada."""
    opciones = opciones if opciones is not None else _opciones(pregunta)
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
    # (2026-10-09) Dos formatos de llama-server: el actual da por posición un dict con
    # `top_logprobs` ([{token, logprob}]); el antiguo, una lista (o `probs`: [{tok_str, prob}]).
    # Aquí solo se aceptaba la lista, y el BitNet de la Mac usa el actual: Jev local devolvía
    # SIEMPRE None («local 0» en Genesis) y cada decisión acababa en OpenRouter o en la caché.
    if isinstance(primeras, dict):
        primeras = primeras.get("top_logprobs") or primeras.get("probs") or []
    if not isinstance(primeras, list):
        return None
    valores = {}
    for item in primeras[:20]:
        if not isinstance(item, dict):
            continue
        token = item.get("token")
        if not isinstance(token, str):
            token = item.get("tok_str")
        logprob = item.get("logprob")
        if not isinstance(logprob, (int, float)) and isinstance(item.get("prob"), (int, float)):
            logprob = math.log(max(float(item["prob"]), 1e-12))
        letra = token.strip() if isinstance(token, str) else ""
        if letra not in letras or not isinstance(logprob, (int, float)):
            continue
        valor = float(logprob)
        if not math.isfinite(valor):
            continue
        if letra not in valores:  # la primera aparición es la más probable
            valores[letra] = valor
    if not valores:
        return None
    letras_validas = [l for l in letras if l in valores]
    normalizadas = _softmax([valores[l] for l in letras_validas])
    if len(normalizadas) != len(letras_validas):
        return None
    return {l: p for l, p in zip(letras_validas, normalizadas)}


#: (2026-10-09) Se pregunta en los DOS órdenes de opciones y se promedia por opción. Medido en
#: la Mac con BitNet b1.58-2B: «¿es urgente que producción no responda?» daba «no» (0,82) con
#: [sí, no] y «sí» (0,97) con [no, sí]; el modelo favorece la última opción. En 10 preguntas de
#: sí/no el promedio de los dos órdenes da la MISMA respuesta en cualquier orden (8/10 en
#: castellano; 9/10 en inglés). Cuesta un segundo paso de un token. STARSEED_JEV_SIMETRICO=0 lo quita.
SIMETRICO = os.environ.get("STARSEED_JEV_SIMETRICO", "1").strip().lower() not in ("0", "no", "false")


def _consulta(prompt, transporte):
    return transporte(
        {
            "prompt": prompt,
            "n_predict": 1,
            "n_probs": 20,
            "temperature": 0,
            "cache_prompt": True,
        }
    )


def probabilidades_simetricas(por_orden):
    """PURA. Promedia por OPCIÓN las probabilidades medidas en varios órdenes.
    `por_orden` = [(opciones_en_ese_orden, {letra: prob})]. Devuelve {opcion: prob} o None."""
    sumas, cuentas = {}, {}
    for opciones, probs in por_orden:
        if not probs:
            return None
        for letra, opcion in zip(_letras(len(opciones)), opciones):
            sumas[opcion] = sumas.get(opcion, 0.0) + float(probs.get(letra, 0.0))
            cuentas[opcion] = cuentas.get(opcion, 0) + 1
    if not sumas:
        return None
    medias = {o: sumas[o] / cuentas[o] for o in sumas}
    total = sum(medias.values())
    return {o: v / total for o, v in medias.items()} if total else None


def _resuelve_pregunta(nombre, pregunta, prompt, transporte, estado=None):
    """Consulta una pregunta y devuelve su respuesta tipada, o None."""
    opciones = _opciones(pregunta)
    if opciones is None:
        return None
    letras = _letras(len(opciones))
    ordenes = [list(opciones)]
    if SIMETRICO and estado is not None and len(opciones) > 1:
        ordenes.append(list(reversed(opciones)))
    por_orden = []
    for orden in ordenes:
        texto = prompt if orden == list(opciones) else _prompt(estado, pregunta, orden)
        try:
            respuesta = _consulta(texto, transporte)
        except Exception:
            return None
        probs = _probabilidades(respuesta, letras)
        if not probs:
            return None
        por_orden.append((orden, probs))
    por_opcion = probabilidades_simetricas(por_orden)
    if not por_opcion:
        return None
    # De vuelta a las letras del orden original, que es lo que esperan los llamadores.
    probabilidades = {letra: por_opcion.get(opcion, 0.0) for letra, opcion in zip(letras, opciones)}
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
        respuesta = _resuelve_pregunta(nombre, pregunta, prompt, transporte, estado)
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
