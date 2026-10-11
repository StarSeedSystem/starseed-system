# -*- coding: utf-8 -*-
"""Copia en la puerta de datos del A1 lo que los publicadores de Astraura dejan en Supabase.

(PDA1012 · fase 2, architecture/puerta-datos-a1.md §10.1.5) El servidor de Next resolvía el
destino de la nube leyendo `astraura_state` en Supabase (8–10 lecturas cada 30 min, medido el
10-10). Ahora lo lee primero de la puerta (`GET /v1/astraura/estado/<clave>`, ficha `astraura`)
y, para que esté allí, `publicar_tunel_astraura.py` y `publicar_destino_astraura.py` lo copian
con `PUT` tras escribir Supabase, que sigue siendo la verdad.

Solo se copia si cambió o cada 30 min (la puerta cuenta cada petición servida como «ahorrada»:
copiar cada 5 min inflaría esa cifra sin ahorrar nada). Sin puerta configurada no hace nada.
Nunca imprime la URL de la puerta ni la ficha. Solo biblioteca estándar.
"""
import json
import os
import time

LATIDO_S = 30 * 60


def ruta_estado(clave):
    """Marca de la última copia de `clave` en la puerta (archivo propio: los publicadores reescriben el suyo)."""
    return os.path.join(os.path.expanduser("~"), ".starseed", "puerta-espejo-%s.json" % clave)


def decidir_espejo(url, previo, ahora, latido_s=LATIDO_S):
    """PURA. ¿Hay que copiar `url` (o su retirada, `None`) en la puerta? (sí/no, motivo)."""
    previo = previo if isinstance(previo, dict) else {}
    if "puerta_t" not in previo:
        return True, "nunca copiado"
    if (previo.get("puerta_url") or None) != (url or None):
        return True, "cambió"
    try:
        if ahora - float(previo.get("puerta_t") or 0) >= latido_s:
            return True, "latido"
    except (TypeError, ValueError):
        return True, "marca ilegible"
    return False, "sin cambios"


def espejar(clave, url, estado_ruta=None, maquina="", puerta=None, ahora=None):
    """Copia `{url, maquina, publicado}` en la puerta bajo `clave` si toca. Devuelve la vía
    (`puerta`, `sin-puerta`, `sin-cambios`, `fallo`). Nunca lanza."""
    ahora = time.time() if ahora is None else ahora
    estado_ruta = estado_ruta or ruta_estado(clave)
    try:
        with open(estado_ruta, encoding="utf-8") as f:
            previo = json.load(f)
    except (OSError, ValueError):
        previo = {}
    toca, _ = decidir_espejo(url, previo, ahora)
    if not toca:
        return "sin-cambios"
    try:
        if puerta is None:
            from puerta_datos_cliente import Puerta  # noqa: PLC0415 — mismo directorio

            puerta = Puerta.desde_entorno(rol="astraura")
        if not puerta.configurada():
            return "sin-puerta"
        datos = {"url": url or None, "maquina": maquina or None,
                 "publicado": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ahora))}
        # Respaldo nulo: Supabase ya lo tiene; si la puerta no responde, no se encola nada viejo.
        r = puerta.astraura_poner(clave, datos, respaldo=lambda _c: None)
    except Exception:  # noqa: BLE001
        return "fallo"
    if (r or {}).get("via") != "puerta" or (r or {}).get("error"):
        return "fallo"
    nuevo = dict(previo, puerta_url=url or None, puerta_t=ahora)
    try:
        os.makedirs(os.path.dirname(estado_ruta), exist_ok=True)
        tmp = estado_ruta + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(nuevo, f)
        os.chmod(tmp, 0o600)
        os.replace(tmp, estado_ruta)
    except OSError:
        pass
    return "puerta"
