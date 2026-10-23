#!/usr/bin/env python3
"""Promociones de Experiential Labs para MetaGenesis (2026-10-23).

Alex: «lo gratis y lo promocional usando los créditos de la cuenta; si hay modelos gratis, que se
autoactualice para usarlos». La pasarela (https://api.experientiallabs.ai) publica sus promociones
en `GET /api/models` (`promotions`): modelos GRATIS (p. ej. Clef Flash y Jev para decisiones) y con
DESCUENTO (p. ej. un DeepSeek al 50 %). Medido hoy: ningún modelo de chat es gratis; los de
decisión sí (coste 0 en la respuesta).

Este guion, cada 6 h desde la autocuración:
- guarda la foto en `~/.starseed/explabs-promos.json` (Jev lee de ahí sus modelos gratis de
  decisión, `jev.modelos_explabs()`);
- reescribe SOLO la línea `STARSEED_PASARELA_EXPLABS_MODELOS=` de `~/.starseed/env` con los
  modelos de chat gratis o en promoción (el orquestador los usa como revisores). Nunca añade ni
  toca la clave, que va en `EXPLABS_API_KEY` y `STARSEED_PASARELA_EXPLABS_KEY` (la puso Alex).

Uso: python3 scripts/puente/explabs_promos.py actualizar [--forzar] | ver
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

API = "https://api.experientiallabs.ai/api/models?limit=1000"
ESTADO = os.path.expanduser("~/.starseed/explabs-promos.json")
ENV = os.path.expanduser("~/.starseed/env")
ARCHIVOS_DE_CLAVES = ("~/.starseed/env", "~/.hermes/.env")
REFRESCO_S = 6 * 3600
#: Como mucho estos modelos de chat como revisores (los de descuento gastan créditos de la cuenta).
MAX_CHAT = 3
#: Si no hay foto, los gratis de decisión medidos el 2026-10-23 (coste 0 en la respuesta).
DECISIONES_POR_DEFECTO = ("jev-latest", "clef-flash")
LINEA_MODELOS = "STARSEED_PASARELA_EXPLABS_MODELOS"


def clave():
    """La clave de la pasarela, del entorno o de los archivos de claves. Nunca se imprime."""
    v = os.environ.get("EXPLABS_API_KEY")
    if v:
        return v
    for ruta in ARCHIVOS_DE_CLAVES:
        try:
            for linea in open(os.path.expanduser(ruta), encoding="utf-8"):
                m = re.match(r"^\s*(?:export\s+)?EXPLABS_API_KEY=(.+?)\s*$", linea)
                if m:
                    return m.group(1).strip().strip('"').strip("'")
        except OSError:
            continue
    return None


def _api_de_decision(modelo):
    """¿Por qué API sirve decisiones tipadas? PURA.

    "systemone" (el contrato openjev que ya habla Jev: Jev, Clef, Clef Flash), "otra" (decisiones
    por otra API, p. ej. GPT-6 Luna en `/v1/decisions` con la forma de OpenAI: la pasarela le
    contesta 400 a /v1/systemone, medido 2026-10-23) o None (chat)."""
    m = modelo or {}
    texto = " ".join(str(m.get(k) or "") for k in ("slug", "display_name", "description")).lower()
    if "systemone" in texto:
        return "systemone"
    if "/v1/decisions" in texto or "decisions api" in texto or "decision model" in texto:
        return "otra"
    return None


def _es_decision(modelo):
    """¿Es un modelo de decisiones (por la API que sea) y no de chat? PURA."""
    return _api_de_decision(modelo) is not None


def clasificar(datos):
    """De la respuesta de `/api/models` a lo que usa MetaGenesis. PURA.

    {decisiones_gratis, decisiones_promocion:[{slug, descuento}], decisiones_otra_api:[…],
    chat_gratis, chat_promocion:[{slug, descuento}], promos:[…]}. Jev usa las de /v1/systemone:
    primero las gratis y, mientras quede presupuesto, las de descuento (gastan créditos de la
    cuenta). Las de otra API se anotan para verlas, no se usan. Una promo que pide método de pago
    se marca (`requiere_pago`): se intenta igual, y si la cuenta no lo tiene la pasarela contesta
    con error y se pasa al siguiente."""
    datos = datos if isinstance(datos, dict) else {}
    modelos = {}
    for fila in datos.get("data") or datos.get("models") or []:
        m = (fila or {}).get("model") or {}
        if m.get("slug"):
            modelos[m["slug"]] = m
    decisiones, decision_promo, otra_api, chat_gratis, chat_promo, promos = [], [], [], [], [], []
    for p in datos.get("promotions") or []:
        if not isinstance(p, dict):
            continue
        gratis = bool(p.get("free"))
        descuento = float(p.get("percent_off") or 0)
        slugs = [s for s in (p.get("slugs") or []) if isinstance(s, str)]
        etiqueta = str(p.get("label") or "")[:120]
        promos.append({
            "etiqueta": etiqueta,
            "slugs": slugs,
            "gratis": gratis,
            "descuento": descuento,
            "requiere_pago": bool(p.get("requires_payment_method") or p.get("requires_payment")),
            "tokens_dia": p.get("free_input_tokens_per_day"),
        })
        for s in slugs:
            api = _api_de_decision(modelos.get(s) or {"slug": s})
            if api == "otra":
                if all(o["slug"] != s for o in otra_api):
                    otra_api.append({"slug": s, "gratis": gratis, "descuento": descuento, "etiqueta": etiqueta})
            elif api == "systemone" and gratis:
                if s not in decisiones:
                    decisiones.append(s)
            elif api == "systemone" and descuento > 0:
                if all(c["slug"] != s for c in decision_promo):
                    decision_promo.append({"slug": s, "descuento": descuento})
            elif api is None and gratis:
                if s not in chat_gratis:
                    chat_gratis.append(s)
            elif api is None and descuento > 0:
                if all(c["slug"] != s for c in chat_promo):
                    chat_promo.append({"slug": s, "descuento": descuento})
    # Jev primero (es el mismo contrato que ya usa el OS), luego el resto en orden de la pasarela.
    decisiones.sort(key=lambda s: (0 if s.startswith("jev") else 1))
    decision_promo.sort(key=lambda c: -c["descuento"])
    chat_promo.sort(key=lambda c: -c["descuento"])
    return {
        "decisiones_gratis": decisiones,
        "decisiones_promocion": decision_promo,
        "decisiones_otra_api": otra_api,
        "chat_gratis": chat_gratis,
        "chat_promocion": chat_promo,
        "promos": promos,
    }


def modelos_pasarela(clasif):
    """Revisores para la pasarela: primero lo gratis, luego lo de más descuento. PURA."""
    fuera = list(clasif.get("chat_gratis") or [])
    fuera += [c["slug"] for c in clasif.get("chat_promocion") or [] if c["slug"] not in fuera]
    return fuera[:MAX_CHAT]


def actualizar_env(texto, modelos):
    """Reescribe SOLO la línea de modelos de la pasarela (si existe). PURA. Sin modelos, no toca."""
    if not modelos:
        return texto
    nueva = "%s=%s" % (LINEA_MODELOS, ",".join(modelos))
    patron = re.compile(r"^%s=.*$" % re.escape(LINEA_MODELOS), re.M)
    return patron.sub(nueva, texto, count=1) if patron.search(texto) else texto


def _leer(ruta, defecto):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def _escribir_atomico(ruta, texto, modo=0o600):
    tmp = "%s.tmp-%d" % (ruta, os.getpid())
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(texto)
    os.chmod(tmp, modo)
    os.replace(tmp, ruta)


def _pedir(k, url=API, tope_s=25):
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + k, "Accept": "application/json",
                                               "User-Agent": "starseed-metagenesis/1.0"})
    with urllib.request.urlopen(req, timeout=tope_s) as r:
        return json.loads(r.read().decode("utf-8"))


def actualizar(forzar=False, ahora=None, pedir=_pedir):
    ahora = time.time() if ahora is None else ahora
    previo = _leer(ESTADO, {})
    if not forzar and ahora - float(previo.get("t") or 0) < REFRESCO_S:
        return {"hecho": False, "motivo": "foto de hace menos de 6 h", **previo}
    k = clave()
    if not k:
        return {"hecho": False, "motivo": "sin EXPLABS_API_KEY"}
    try:
        clasif = clasificar(pedir(k))
    except (urllib.error.URLError, OSError, ValueError) as e:
        return {"hecho": False, "motivo": "la pasarela no contestó: %s" % type(e).__name__, **previo}
    foto = {"t": ahora, "visto": time.strftime("%Y-%m-%d %H:%M:%S"), **clasif}
    os.makedirs(os.path.dirname(ESTADO), exist_ok=True)
    _escribir_atomico(ESTADO, json.dumps(foto, ensure_ascii=False, indent=1))
    modelos = modelos_pasarela(clasif)
    try:
        texto = open(ENV, encoding="utf-8").read()
        nuevo = actualizar_env(texto, modelos)
        if nuevo != texto:
            _escribir_atomico(ENV, nuevo)
    except OSError:
        pass
    return {"hecho": True, **foto, "revisores": modelos}


def resumen(r):
    if not r.get("decisiones_gratis") and not r.get("chat_promocion") and not r.get("hecho"):
        return "Experiential Labs: %s" % r.get("motivo", "sin datos")
    con_desc = lambda xs: ", ".join("%s (-%d %%)" % (c["slug"], c["descuento"]) for c in xs or [])
    texto = "Experiential Labs: decisiones gratis %s · decisiones en promoción %s · chat gratis %s · chat en promoción %s" % (
        ", ".join(r.get("decisiones_gratis") or []) or "ninguna",
        con_desc(r.get("decisiones_promocion")) or "ninguna",
        ", ".join(r.get("chat_gratis") or []) or "ninguno",
        con_desc(r.get("chat_promocion")) or "ninguno",
    )
    otras = r.get("decisiones_otra_api") or []
    if otras:
        texto += " · por otra API (sin usar): %s" % ", ".join(
            o["slug"] + (" gratis" if o.get("gratis") else "") for o in otras)
    return texto + ("" if r.get("hecho") else " (%s)" % r.get("motivo", ""))


def main(argv):
    if len(argv) > 1 and argv[1] == "ver":
        print(resumen(_leer(ESTADO, {"motivo": "aún sin foto"})))
        return 0
    print(resumen(actualizar(forzar="--forzar" in argv)))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
