#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""El autoenrutamiento de modelos gratuitos, aplicado a Hermes.

POR QUÉ (2026-09-19)
--------------------
Alex: «he intentado usar Hermes en el chat oficial del Puente de Mando, pero
han surgido tantos errores que no he podido completar ninguna tarea, porque no
funciona el autoenrutamiento». Medido en ~/.hermes/logs/gateway.error.log:

    5.192 × 401 Invalid API key  provider=apinex
    4.474 × 401                  provider=tokenrouter
    y al final, siempre: «every provider in the fallback chain kept failing over»

Dos causas, las dos ajenas al chat:

1. La clave de apinex en ~/.hermes/.env era una VIEJA; la buena estaba en
   ~/.starseed/env. Nuestro renovador carga los dos y gana el segundo; Hermes
   solo lee el primero. Arreglado copiándola (sin imprimirla, con respaldo).
2. La cadena de respaldo de Hermes era una LISTA FIJA en config.yaml:
   xkiro (sin cupo) → tokenrouter (sin canal) → apinex (5 peticiones/minuto)
   → openrouter (sin cupo) → aihubmix (sin cupo)… y groq —el único que escribe
   con holgura— NO ESTABA. Es la misma enfermedad que apinex en el Dream, que
   `modelos_utiles` en el enjambre, que Codex en `SIEMPRE`: una lista que no
   sabe lo que está vivo.

QUÉ HACE
--------
Lee ~/.starseed/pasarelas-informe.json (lo mide el renovador) y reescribe en
~/.hermes/config.yaml SOLO dos cosas, dejando el resto del archivo y sus
comentarios intactos:

  · `model.default` / `model.provider`: el mejor modelo de la mejor pasarela
    VIVA que Hermes tenga configurada;
  · `fallback_providers`: la cadena entera, ordenada escribe → lenta → resto,
    y solo con proveedores que Hermes conoce.

Nunca descarta un candidato: cambia el turno. Si el informe está viejo o se
equivoca, el orden es peor pero la cadena sigue completa.

Se ejecuta a mano, y lo llama el renovador cada vez que mide, para que Hermes
siga a la realidad sin que nadie edite un YAML.

    python3 scripts/puente/enrutar-hermes.py [--seco]
"""

import argparse
import json
import os
import re
import shutil
import sys
import time

CONFIG = os.path.expanduser("~/.hermes/config.yaml")
INFORME = os.path.expanduser("~/.starseed/pasarelas-informe.json")

#: Nombre de pasarela en el informe → nombre de proveedor en Hermes.
ALIAS = {"nvidia": "nvidia", "nim": "nvidia", "neurona": "ollama", "google": "gemini"}

#: Proveedores que Hermes trae DE SERIE (no van bajo `providers:` en su config;
#: la clave la lee él del entorno) y los modelos con los que nos sirven.
#: (2026-09-19, 17:28) `hermes chat --provider gemini -m gemini-3.6-flash` contestó
#: «ok» en la Mac con GEMINI_API_KEY de ~/.hermes/.env. Es el único gratuito de
#: hoy con 1M de contexto y herramientas: la sesión del Mando pesa ~100k tokens
#: y con 128k de ventana la compresión se quedaba colgada 120 s en cada turno.
NATIVOS = {
    "gemini": ["gemini-3.6-flash"],
    # (2026-09-20) OpenRouter también es nativo en Hermes (OPENROUTER_API_KEY). Con los 10 $
    # de crédito sus gratuitos vuelven a escribir; el modelo real lo pone EXTRA/SONDADOS
    # del informe, este es solo el respaldo si el informe no dice nada. Siempre `:free`.
    "openrouter": ["deepseek/deepseek-v4-flash-0731:free"],
}

#: Lo que Hermes debe pedir a un proveedor AUNQUE la sonda del renovador haya
#: contestado con otro modelo: la sonda de google es `gemini-3.5-flash-lite`
#: porque los modelos con razonamiento devuelven vacío a 16 tokens (medido
#: 2026-09-19: gemini-3.6-flash → sin contenido, flash-lite → «ok» en 0,9 s),
#: pero para dirigir el Mando hace falta el grande.
HERMES_PREFIERE = {"gemini": "gemini-3.6-flash"}

#: Desempate entre proveedores en el MISMO estado: contexto grande y herramientas
#: primero. freellmapi/auto reparte entre gratuitos pero eligió Qwen3-235B por HF
#: y devolvió basura («0.14.02 0.14.02…») a un prompt de 10k tokens.
AFINIDAD = {"gemini": 0, "nvidia": 1, "freellmapi": 2, "apinex": 3}

#: Qué modelo pedirle a cada proveedor, por orden de preferencia. Solo se usan
#: los que estén declarados en el config de Hermes; si ninguno, el primero que
#: Hermes tenga para ese proveedor.
PREFERIDOS = {
    "groq": ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"],
    "apinex": ["free/glm-5.3-flash", "free/deepseek-v4-flash-0731", "free/gemini-3.8-flash"],
    "nvidia": ["moonshotai/kimi-k3", "deepseek-ai/deepseek-v4-flash-0731"],
    # (2026-09-20) SOLO `:free`: hay 10 $ de crédito en la cuenta y un id de pago aquí
    # los gastaría sin que nadie lo pidiera. El renovador trae además `modelos_extra`
    # (gratuitos con herramientas, los de más contexto primero) y esos mandan.
    "openrouter": ["deepseek/deepseek-v4-flash-0731:free", "nex-agi/nex-n2.5-pro:free", "poolside/laguna-xs-2.1:free"],
    "xkiro": ["qwen/qwen3-coder-plus:free"],
    "tokenrouter": ["z-ai/glm-5.3-free"],
    "aihubmix": ["z-ai/glm-5.3-free"],
}

ORDEN_ESTADO = {"escribe": 0, "lenta": 1, "sin_cupo": 2, "sin_canal": 3,
                "modelo_fuera": 4, "fichaje": 5, "sin_clave": 6, "caida": 7}

#: Tokens por minuto que admite el tier gratuito de cada pasarela, cuando se
#: sabe. Medido el 2026-09-19 en el log de Hermes: groq «Limit 8000, Requested
#: 9218». El prompt base de Hermes (skills, memoria, herramientas) pasa de 9k,
#: así que groq NO PUEDE servirle una sola conversación aunque esté vivo — la
#: sonda de 16 tokens dice «escribe» y una charla real no cabe. Una pasarela
#: por debajo de este umbral va al final de la cadena de Hermes; para el
#: enjambre, que hace llamadas cortas, sigue siendo la primera.
TPM_GRATUITO = {"groq": 8000}
TOKENS_QUE_PIDE_HERMES = 12000


def proveedores_de_hermes(texto):
    """{proveedor: [modelos declarados]} leído del YAML sin parsearlo entero."""
    fuera, actual = {}, None
    en_providers = False
    for linea in texto.splitlines():
        if re.match(r"^providers:\s*$", linea):
            en_providers = True; continue
        if en_providers and re.match(r"^\S", linea):
            break
        if not en_providers:
            continue
        m = re.match(r"^  ([a-z0-9_-]+):\s*$", linea)
        if m:
            actual = m.group(1); fuera[actual] = []; continue
        m = re.match(r"^      ([^\s:][^:]*):\s*$", linea)
        if m and actual:
            fuera[actual].append(m.group(1).strip())
    return fuera


SONDADOS = {}   # proveedor -> modelo que DE VERDAD contestó a la sonda
EXTRA = {}      # proveedor -> gratuitos con herramientas que anuncia hoy (del renovador)


def estados_del_informe():
    try:
        d = json.load(open(INFORME, encoding="utf-8"))
    except Exception:
        return {}
    fuera = {}
    for f in d.get("pasarelas", []):
        clave = ALIAS.get(f.get("clave"), f.get("clave"))
        fuera[clave] = f.get("estado", "caida")
        if f.get("estado") in ("escribe", "lenta") and f.get("modelo"):
            SONDADOS[clave] = f["modelo"]
        extra = [str(x) for x in (f.get("modelos_extra") or []) if str(x).endswith(":free")]
        if extra:
            EXTRA[clave] = extra
    return fuera


def modelo_para(prov, declarados):
    # (2026-09-19) Primero el modelo que contestó a la sonda del renovador: es la
    # única prueba de que ese id existe y esa clave puede usarlo. xkiro daba 403
    # a `qwen3.7-plus` (de pago) mientras `qwen3-coder-plus:free` escribía.
    if prov in HERMES_PREFIERE and HERMES_PREFIERE[prov] in declarados:
        return HERMES_PREFIERE[prov]
    if EXTRA.get(prov):
        return EXTRA[prov][0]          # el gratuito con herramientas de más contexto de hoy
    if prov in SONDADOS:
        return SONDADOS[prov]
    for m in PREFERIDOS.get(prov, []):
        if m in declarados:
            return m
    return declarados[0] if declarados else None


def cadena(provs_hermes, estados):
    """[(proveedor, modelo)] ordenados por lo que escribe hoy."""
    filas = []
    for prov, modelos in provs_hermes.items():
        m = modelo_para(prov, modelos)
        if not m:
            continue
        est = estados.get(prov, "desconocido")
        orden = ORDEN_ESTADO.get(est, 8)
        if TPM_GRATUITO.get(prov, 10**9) < TOKENS_QUE_PIDE_HERMES:
            orden += 10                      # vivo, pero no le cabe una charla
            est = est + " (tpm %d < %d)" % (TPM_GRATUITO[prov], TOKENS_QUE_PIDE_HERMES)
        filas.append((orden, AFINIDAD.get(prov, 5), prov, m, est))
    filas.sort(key=lambda x: (x[0], x[1], x[2]))
    return [(p, m, e) for _, _, p, m, e in filas]


def con_nativos(provs):
    """Los proveedores de serie de Hermes entran aunque no estén en `providers:`."""
    fuera = dict(provs)
    for prov, modelos in NATIVOS.items():
        fuera.setdefault(prov, list(modelos))
    return fuera


def con_prefijo(prov, mod):
    """El id de modelo SIN el prefijo del proveedor.

    Medido en el log del gateway (2026-09-19): Hermes manda el campo `model`
    tal cual a la API, y apinex contestó 404 «Model 'apinex/free/deepseek-…'
    not found». Su propio config traía nvidia sin prefijo y apinex con él —
    inconsistente—, y el que funcionaba era el que no lo llevaba. Así que aquí
    se QUITA si viene, y nunca se añade. El nombre de la función se conserva
    para no tocar a quien la llama.
    """
    return mod[len(prov) + 1:] if mod.startswith(prov + "/") else mod


def reescribir(texto, primero, cad):
    """Solo toca `model.default`, `model.provider` y `fallback_providers`."""
    prov, mod = primero
    texto = re.sub(r"(?m)^(  default:\s*).*$", r"\g<1>%s" % con_prefijo(prov, mod), texto, count=1)
    texto = re.sub(r"(?m)^(  provider:\s*).*$", r"\g<1>%s" % prov, texto, count=1)
    bloque = ["fallback_providers:"]
    for p, m, _ in cad:
        bloque.append("  - provider: %s" % p)
        bloque.append("    model: %s" % con_prefijo(p, m))
    nuevo = "\n".join(bloque) + "\n"
    patron = re.compile(r"(?ms)^fallback_providers:\s*\n(?:  .*\n|\n)*?(?=^\S)")
    if patron.search(texto):
        texto = patron.sub(nuevo, texto, count=1)
    else:
        texto = texto.rstrip("\n") + "\n" + nuevo
    return texto


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seco", action="store_true")
    args = ap.parse_args()
    texto = open(CONFIG, encoding="utf-8").read()
    provs = con_nativos(proveedores_de_hermes(texto))
    estados = estados_del_informe()
    cad = cadena(provs, estados)
    if not cad:
        print("Hermes no tiene proveedores declarados: no toco nada"); return 1
    primero = (cad[0][0], cad[0][1])
    print("por defecto:", "%s/%s" % primero, "[%s]" % cad[0][2])
    for p, m, e in cad:
        print("  %-12s %-40s [%s]" % (p, m, e))
    if args.seco:
        print("(seco)"); return 0
    shutil.copy2(CONFIG, CONFIG + ".bak-" + time.strftime("%Y%m%d-%H%M%S"))
    open(CONFIG, "w", encoding="utf-8").write(reescribir(texto, primero, cad))
    print("config.yaml reescrito (respaldo al lado)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
