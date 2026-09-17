#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Manda por el chat de Hermes el enlace para abrir y vincular el Puente de Mando.

Pedido por Alex (2026-09-17). Lee ~/.starseed/tunel-mando.json (lo escribe
tunel-mando.sh) y envía, por el mismo canal y con la misma hora al final que el
resto de avisos, los dos enlaces: el público (cualquier navegador) y el local.

La URL pública NO se escribe en el repo ni en documentos: cambia con cada
reinicio del túnel y es lo único que protege el acceso. Vive en ese JSON y en el
chat privado de Alex, y en ningún otro sitio.
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

ESTADO = os.path.expanduser("~/.starseed/tunel-mando.json")


def _cargar_env():
    """Las claves de Telegram viven en ~/.hermes/.env y ~/.starseed/env."""
    for ruta in ("~/.hermes/.env", "~/.starseed/env"):
        p = os.path.expanduser(ruta)
        try:
            with open(p, encoding="utf-8") as f:
                for linea in f:
                    linea = linea.strip()
                    if not linea or linea.startswith("#") or "=" not in linea:
                        continue
                    if linea.startswith("export "):
                        linea = linea[7:]
                    k, v = linea.split("=", 1)
                    v = v.strip().strip('"').strip("'")
                    os.environ.setdefault(k.strip(), v)
        except OSError:
            pass


def texto(estado):
    publico = estado.get("mando") or (estado.get("url", "") + "/mando")
    local = estado.get("local") or "http://localhost:9002/mando"
    return (
        "🛸 *Puente de Mando · vinculado*\n\n"
        "Desde cualquier navegador:\n%s\n\n"
        "En esta Mac:\n%s\n\n"
        "Es el mismo Mando que usan Claude, Hermes y los IDEs: mismas colas, "
        "mismo chat, mismos permisos (`maggasukha@star.seed`). Si el túnel se "
        "reinicia, sale un enlace nuevo por aquí." % (publico, local)
    )


def main():
    try:
        estado = json.load(open(ESTADO, encoding="utf-8"))
    except Exception:
        print("no hay túnel: lanza antes scripts/puente/tunel-mando.sh")
        return 1
    _cargar_env()
    import importlib.util
    ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), "telegram-puente.py")
    spec = importlib.util.spec_from_file_location("tp", ruta)
    tp = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(tp)
    r = tp._telegram_send(tp._token(), tp._chat_id(), texto(estado))
    print("enviado" if r.get("ok") else "fallo: %s" % r.get("description"))
    return 0 if r.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
