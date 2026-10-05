#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Webhooks firmados (HMAC) del director de producción — §9 del contrato.

`architecture/director-produccion.md` §9: emite eventos (`produccion.publicada`,
`produccion.revertida`, `produccion.pieza_lista`) como POST JSON firmado hacia n8n,
Dify o cualquier URL lista en el entorno. Nada de esto corre en el Mac: las URLs son
de instancias externas y, hasta que existan en el entorno, el emisor no envía nada.

Reglas de la casa:
- El cliente HTTP es INYECTABLE (`http=...`): pruebas sin red ni archivos reales.
- La clave solo sale de `os.environ` (`PRODUCCION_WEBHOOK_SECRETO`) y nunca se
  imprime; en el resultado solo aparece el HOST de cada URL, nunca la URL completa.
- Timeout de 5 s por URL y UN reintento; este módulo NUNCA lanza: un webhook caído
  no frena el ciclo de producción.
"""

import hashlib
import hmac
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone

TIMEOUT_S = 5
REINTENTOS = 2  # un intento + un reintento
CABECERA_FIRMA = "X-StarSeed-Firma"
EVENTOS_VALIDOS = {
    "produccion.publicada",
    "produccion.revertida",
    "produccion.pieza_lista",
}


def firmar(cuerpo, secreto):
    """HMAC-SHA256 del cuerpo (bytes) con el secreto (str). Devuelve el hexdigest."""
    return hmac.new(secreto.encode("utf-8"), cuerpo, hashlib.sha256).hexdigest()


def verificar_firma(cuerpo, cabecera, secreto):
    """Lado receptor: True si `cabecera` («sha256=<hex>») firma `cuerpo` con `secreto`.

    `cuerpo` es bytes o str. Nunca lanza: cabecera ausente, secreto vacío o formato
    inesperado son simplemente False. Comparación en tiempo constante.
    """
    if not secreto or not cabecera:
        return False
    if isinstance(cuerpo, str):
        cuerpo = cuerpo.encode("utf-8")
    prefijo = "sha256="
    if not isinstance(cabecera, str) or not cabecera.startswith(prefijo):
        return False
    esperada = hmac.new(
        secreto.encode("utf-8"), cuerpo, hashlib.sha256
    ).hexdigest()
    recibida = cabecera[len(prefijo):].strip().lower()
    try:
        recibida_bytes = bytes.fromhex(recibida)
        esperada_bytes = bytes.fromhex(esperada)
    except ValueError:
        return False
    return hmac.compare_digest(recibida_bytes, esperada_bytes)


def _host(url):
    """Solo el host (con puerto si lo hay) para el resultado; nunca la ruta ni la clave."""
    try:
        return urllib.parse.urlsplit(url).netloc or "(url inválida)"
    except Exception:
        return "(url inválida)"


def _urls_configuradas(entorno):
    """URLs de webhook presentes en el entorno, sin duplicados y en orden estable."""
    urls = []
    for nombre in ("N8N_WEBHOOK_URL", "DIFY_WEBHOOK_URL"):
        url = (entorno.get(nombre) or "").strip()
        if url and url not in urls:
            urls.append(url)
    lista = (entorno.get("PRODUCCION_WEBHOOKS") or "").split(",")
    for url in lista:
        url = url.strip()
        if url and url not in urls:
            urls.append(url)
    return urls


def _cuerpo_evento(evento, datos):
    """Cuerpo JSON del POST: evento, sha, medios, tareas, momento y los datos extra."""
    datos = dict(datos or {})
    return json.dumps(
        {
            "evento": evento,
            "sha": datos.pop("sha", "") or "",
            "medios": list(datos.pop("medios", []) or []),
            "tareas": list(datos.pop("tareas", []) or []),
            "momento": datetime.now(timezone.utc).isoformat(),
            "datos": datos,
        },
        ensure_ascii=False,
    ).encode("utf-8")


def _enviar_uno(url, cuerpo, secreto, http):
    """POST firmado a una URL con reintento único. Devuelve el dict de resultado."""
    resultado = {"host": _host(url), "enviado": False, "estado": None, "error": None}
    if http is None:
        http = urllib.request
    req = urllib.request.Request(
        url,
        data=cuerpo,
        headers={
            "Content-Type": "application/json",
            CABECERA_FIRMA: "sha256=%s" % firmar(cuerpo, secreto),
        },
        method="POST",
    )
    for _ in range(REINTENTOS):
        try:
            with http.urlopen(req, timeout=TIMEOUT_S) as resp:
                estado = int(getattr(resp, "status", getattr(resp, "code", 200)))
                resultado["estado"] = estado
                resultado["enviado"] = 200 <= estado < 300
                return resultado
        except Exception as exc:  # red caída o timeout: se reintenta una vez
            resultado["error"] = type(exc).__name__
    return resultado


def emitir(evento, datos=None, entorno=None, http=None):
    """Emite `evento` firmado a todas las URLs del entorno. Nunca lanza.

    Devuelve `{"evento", "enviado", "urls": [resultados], "motivo"}`: si no hay
    secreto o no hay URL configurada no se envía nada y el motivo lo dice.
    """
    if entorno is None:
        entorno = os.environ
    secreto = (entorno.get("PRODUCCION_WEBHOOK_SECRETO") or "").strip()
    if not secreto:
        return {
            "evento": evento,
            "enviado": False,
            "urls": [],
            "motivo": "sin PRODUCCION_WEBHOOK_SECRETO: webhooks apagados",
        }
    urls = _urls_configuradas(entorno)
    if not urls:
        return {
            "evento": evento,
            "enviado": False,
            "urls": [],
            "motivo": "sin URLs de webhook en el entorno",
        }
    cuerpo = _cuerpo_evento(evento, datos)
    resultados = [_enviar_uno(u, cuerpo, secreto, http) for u in urls]
    return {
        "evento": evento,
        "enviado": any(r["enviado"] for r in resultados),
        "urls": resultados,
        "motivo": "",
    }


def main(argv):
    """`produccion_webhooks.py <evento> [datos-json]`: emite y nunca falla el ciclo."""
    if len(argv) < 2:
        print("uso: produccion_webhooks.py <evento> [datos-json]")
        return 2
    evento = argv[1]
    try:
        datos = json.loads(argv[2]) if len(argv) > 2 else {}
    except ValueError:
        print("datos-json inválido")
        return 2
    resultado = emitir(evento, datos)
    if resultado["motivo"]:
        print(resultado["motivo"])
    for r in resultado["urls"]:
        estado = r["estado"] if r["estado"] is not None else r["error"]
        print("%s: %s" % (r["host"], "ok" if r["enviado"] else "fallo (%s)" % estado))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
