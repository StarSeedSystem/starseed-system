#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Aviso de versión nueva por ntfy — puerta 7 del director de producción.

Tras publicar un lote (puerta 5 y 6 del contrato `architecture/director-produccion.md`),
el director avisa a los clientes abiertos (web, PWA, Genesis) con un POST a un TEMA FIJO
de ntfy. El tema no es secreto: el cliente nunca confía en el aviso — solo lo toma como
señal para comprobar `/version.json`—, así que un aviso falso no hace nada.
Sin Supabase Realtime, para no gastar créditos.

El cliente HTTP es INYECTABLE (pruebas sin red) y este módulo NUNCA lanza: si ntfy no
responde, el ciclo de producción sigue igual (los clientes tienen el sondeo de 5 min
de reserva). No hay claves por ningún sitio.

CLI: `produccion_avisar.py <sha> <medio1,medio2>` → devuelve 0 haya o no haya aviso.
"""

import json
import sys
import urllib.request

TEMA_VERSION = "starseed-os-version-7f3a"  # el mismo que en src/lib/pwa/aviso-version.ts
URL_TEMA = "https://ntfy.sh/%s" % TEMA_VERSION
TIMEOUT_S = 10


def avisar_version(sha, medios=None, cliente=None):
    """POST `{"sha", "medios"}` a ntfy con título «Nueva versión». Devuelve True/False.

    `cliente` es un objeto con `urlopen(request, timeout=...)` (por defecto
    `urllib.request`). Nunca lanza: cualquier fallo de red o del servidor es False.
    """
    if cliente is None:
        cliente = urllib.request
    try:
        cuerpo = json.dumps({"sha": sha or "", "medios": list(medios or [])}).encode("utf-8")
        req = urllib.request.Request(
            URL_TEMA,
            data=cuerpo,
            headers={
                "Content-Type": "application/json",
                "Title": "Nueva versión",
                "Tags": "rocket",
            },
            method="POST",
        )
        with cliente.urlopen(req, timeout=TIMEOUT_S) as resp:
            estado = getattr(resp, "status", getattr(resp, "code", 200))
            return 200 <= int(estado) < 300
    except Exception:
        return False


def main(argv, cliente=None):
    """`produccion_avisar.py <sha> [medio1,medio2,...]`: avisa y NUNCA falla el ciclo."""
    if len(argv) < 2:
        print("uso: produccion_avisar.py <sha> [medio1,medio2,...]")
        return 2
    sha = argv[1]
    medios = [m for m in (argv[2].split(",") if len(argv) > 2 else []) if m]
    ok = avisar_version(sha, medios, cliente=cliente)
    print("aviso de versión enviado" if ok else "aviso de versión NO enviado (el ciclo sigue)")
    return 0  # el aviso es propagación, no puerta: nunca rompe el ciclo


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
