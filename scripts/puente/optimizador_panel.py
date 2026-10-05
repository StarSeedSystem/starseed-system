# -*- coding: utf-8 -*-
"""optimizador_panel · §7 del contrato director-optimizador (StarSeed OS).

Panel propio de K modelos gratuitos con autoenrutado por pesos: elige los de mejor
`tasa` entre los útiles, les pide propuestas en JSON, fusiona las repetidas y convierte
las altas en tareas de la cola del optimizador (`OPZ<MMDD>-<n>`).

Las funciones de lógica son PURAS: sin red, sin archivos, sin reloj. La única que toca
la red es `llamar_modelo_real`, y toma la clave SOLO de `os.environ`.
"""

from __future__ import annotations

import json
import os
import urllib.request
import urllib.error

AREAS = {
    "habilidades", "memorias", "contextos", "recuerdos",
    "herramientas", "conectores", "enrutamiento", "capacidad",
}

PESO_MIN, PESO_MAX = 0.05, 1.0
PASO_PESO = 0.1

REGLAS_CASA = (
    "Reglas de la casa: el silencio no es aprobación, integrado no es aplicado, "
    "y si una prueba falla se arregla el código y no la prueba."
)


def elegir_panel(pesos, utiles, k=3, exploracion=0.2, azar=None):
    """K modelos de `utiles`: el de mejor peso primero y, con probabilidad
    `exploracion`, uno al azar para seguir probando (autoenrutado, §7).

    `azar` es un módulo/objeto con `random()` y `choice(seq)` (por defecto `random`).
    """
    import random as _random
    azar = azar or _random
    candidatos = [m for m in (utiles or []) if isinstance(m, str) and m]
    elegidos = []
    while candidatos and len(elegidos) < k:
        if azar.random() < exploracion:
            modelo = azar.choice(candidatos)
        else:
            modelo = max(candidatos, key=lambda m: float(
                (pesos.get(m) or {}).get("peso", 0.5)
            ))
        elegidos.append(modelo)
        candidatos.remove(modelo)
    return elegidos


def validar_propuesta(propuesta):
    """Propuesta parseada válida o None: área conocida, ≤ 3 archivos y prompt."""
    if not isinstance(propuesta, dict):
        return None
    area = propuesta.get("area")
    archivos = propuesta.get("archivos")
    titulo = propuesta.get("titulo")
    prompt = propuesta.get("prompt")
    if area not in AREAS:
        return None
    if not isinstance(titulo, str) or not titulo.strip():
        return None
    if not isinstance(prompt, str) or not prompt.strip():
        return None
    if not isinstance(archivos, list) or not archivos or len(archivos) > 3:
        return None
    if not all(isinstance(a, str) and a.strip() for a in archivos):
        return None
    return {
        "area": area,
        "titulo": titulo.strip(),
        "por_que": str(propuesta.get("por_que") or "").strip(),
        "archivos": [a.strip() for a in archivos],
        "prompt": prompt.strip(),
    }


def _extraer_json(texto):
    """El primer objeto JSON del texto de salida del modelo, o None."""
    if not isinstance(texto, str) or "{" not in texto:
        return None
    principio = texto.find("{")
    fin = texto.rfind("}")
    if fin <= principio:
        return None
    try:
        return json.loads(texto[principio:fin + 1])
    except (json.JSONDecodeError, ValueError):
        return None


def prompt_peticion(resumen):
    """El texto que se le da a cada modelo del panel: métricas y hallazgos, y el
    formato JSON pedido por el contrato (§7)."""
    return (
        "Eres el panel del director optimizador de StarSeed OS. Con este resumen de "
        "métricas y hallazgos propone mejoras. Responde SOLO con un JSON: "
        '{\"propuestas\": [{\"area\": \"habilidades|memorias|contextos|recuerdos|'
        'herramientas|conectores|enrutamiento|capacidad\", \"titulo\": \"...\", '
        '\"por_que\": \"...\", \"archivos\": [\"...\"], \"prompt\": \"...\"}]} '
        "(como mucho 3 archivos por propuesta).\n\nResumen:\n" + str(resumen)
    )


def pedir_propuestas(modelos, resumen, llamar):
    """Pregunta a cada modelo con `llamar(modelo, prompt) -> texto` (inyectable).

    Valida el JSON pedido y descarta lo que no cumpla el contrato (más de 3
    archivos, área desconocida, sin prompt o JSON roto). Cada propuesta sale con
    `modelos: [<modelo>]` para el autoenrutado.
    """
    propuestas = []
    if llamar is None:
        return propuestas
    texto_peticion = prompt_peticion(resumen)
    for modelo in modelos or []:
        try:
            texto = llamar(modelo, texto_peticion)
        except Exception:
            continue
        datos = _extraer_json(texto)
        if not isinstance(datos, dict):
            continue
        crudas = datos.get("propuestas")
        if not isinstance(crudas, list):
            continue
        for cruda in crudas:
            valida = validar_propuesta(cruda)
            if valida is not None:
                valida["modelos"] = [modelo]
                propuestas.append(valida)
    return propuestas


def fusionar(propuestas):
    """Propuestas con las repetidas fusionadas: mismas (área, título) suman votos
    y acumulan los modelos que las propusieron. PURA."""
    por_clave = {}
    for p in propuestas or []:
        clave = (p.get("area"), str(p.get("titulo") or "").strip().lower())
        if clave not in por_clave:
            copia = dict(p)
            copia["modelos"] = list(copia.get("modelos") or [])
            copia["votos"] = 1
            por_clave[clave] = copia
        else:
            por_clave[clave]["votos"] += 1
            por_clave[clave]["modelos"].extend(p.get("modelos") or [])
    salida = list(por_clave.values())
    salida.sort(key=lambda p: -p["votos"])
    return salida


def a_tareas(propuestas_alto, fecha, ya_hoy=0, max_tareas_dia=6):
    """Propuestas `alto` → tareas para `cola-optimizador-<AAAAMMDD>.json` (§7).

    `fecha` viene en AAAAMMDD; ids `OPZ<MMDD>-<n>` continuando tras `ya_hoy`;
    `ola` es «Optimizador <fecha>»; el prompt lleva la línea de reglas de la casa.
    Nunca más de `max_tareas_dia` en el día. PURA.
    """
    disponibles = max(0, int(max_tareas_dia) - int(ya_hoy))
    mmdd = str(fecha)[4:8] if len(str(fecha)) == 8 else str(fecha)
    tareas = []
    for i, p in enumerate((propuestas_alto or [])[:disponibles]):
        n = int(ya_hoy) + i + 1
        tareas.append({
            "id": f"OPZ{mmdd}-{n}",
            "ola": f"Optimizador {fecha}",
            "estado": "pendiente",
            "titulo": p["titulo"],
            "area": p["area"],
            "archivos": list(p["archivos"]),
            "prompt": p["prompt"].rstrip() + "\n\n" + REGLAS_CASA,
        })
    return tareas


def actualizar_pesos(pesos, resultados):
    """Sube o baja el peso según el destino de cada propuesta (autoenrutado, §7).

    `resultados` es `[{\"modelos\": [modelo…], \"resultado\": \"integrada\"|
    \"confirmada\"|\"rechazada\"}]`. Integrada o confirmada sube; rechazada baja.
    El peso nunca sale de [0.05, 1]. PURA (no muta `pesos`).
    """
    nuevos = {}
    for modelo, entrada in (pesos or {}).items():
        nuevos[modelo] = dict(entrada or {})
    for r in resultados or []:
        resultado = r.get("resultado")
        for modelo in r.get("modelos") or []:
            e = nuevos.setdefault(modelo, {
                "propuestas": 0, "integradas": 0, "confirmadas": 0, "peso": 0.5,
            })
            peso = float(e.get("peso", 0.5))
            if resultado in ("integrada", "confirmada"):
                peso = min(PESO_MAX, peso + PASO_PESO)
                if resultado == "integrada":
                    e["integradas"] = int(e.get("integradas", 0)) + 1
                else:
                    e["confirmadas"] = int(e.get("confirmadas", 0)) + 1
            elif resultado == "rechazada":
                peso = max(PESO_MIN, peso - PASO_PESO)
            else:
                continue
            e["peso"] = round(peso, 4)
    return nuevos


def llamar_modelo_real(modelo, prompt, base=None, clave=None, tiempo=90):
    """Producción: una llamada OpenAI-compatible `chat/completions` con urllib.

    Base y clave vienen del entorno: `OPTIMIZADOR_BASE_URL` (por defecto la base
    de OpenRouter) y `OPTIMIZADOR_API_KEY` (o `OPENROUTER_API_KEY`). Devuelve el
    texto de la primera elección o None ante cualquier fallo.
    """
    base = base or os.environ.get(
        "OPTIMIZADOR_BASE_URL", "https://openrouter.ai/api/v1/chat/completions"
    )
    clave = clave or os.environ.get("OPTIMIZADOR_API_KEY") or os.environ.get(
        "OPENROUTER_API_KEY"
    )
    if not clave:
        return None
    cuerpo = {
        "model": modelo,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 1000,
        "temperature": 0.2,
    }
    cabeceras = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {clave}",
    }
    peticion = urllib.request.Request(
        base, data=json.dumps(cuerpo).encode("utf-8"),
        headers=cabeceras, method="POST",
    )
    try:
        with urllib.request.urlopen(peticion, timeout=int(tiempo)) as respuesta:
            datos = json.loads(respuesta.read().decode("utf-8"))
        return datos["choices"][0]["message"]["content"]
    except (urllib.error.URLError, KeyError, IndexError, TypeError, ValueError, OSError):
        return None
