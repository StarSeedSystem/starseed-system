#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Síntesis → Telegram (SDP1111B): envía al chat propio de las síntesis (§3.3).
Variables (solo NOMBRES): TELEGRAM_SINTESIS_BOT_TOKEN y TELEGRAM_SINTESIS_CHAT_ID, en
~/.starseed/env y en el entorno. Solo admite ese chat. Nunca imprime el token.
"""

import json
import os
import re
import sys
import urllib.error
import urllib.request

TOPE_TROZO = 3500
CHAT_PERMITIDO = "8670436815"
ARCHIVO_ENV = os.path.expanduser("~/.starseed/env")


def _leer_env(ruta: str = ARCHIVO_ENV) -> dict:
    """Lee ~/.starseed/env y el entorno; el entorno manda."""
    datos: dict = {}
    try:
        with open(ruta, encoding="utf-8") as f:
            for linea in f:
                linea = linea.strip()
                if linea.startswith("export "):
                    linea = linea[7:]
                if linea and not linea.startswith("#") and "=" in linea:
                    k, v = linea.split("=", 1)
                    datos[k.strip()] = v.strip().strip('"').strip("'")
    except OSError:
        pass
    for clave in ("TELEGRAM_SINTESIS_BOT_TOKEN", "TELEGRAM_SINTESIS_CHAT_ID"):
        valor = os.environ.get(clave)
        if valor:
            datos[clave] = valor
    return datos


def partir(texto: str, tope: int = TOPE_TROZO) -> list:
    """Parte el texto en trozos ≤ tope, por párrafos; párrafo largo, corte duro."""
    if not texto:
        return []
    trozos = []
    for parrafo in (p.strip() for p in texto.split("\n\n")):
        if parrafo:
            trozos.extend(parrafo[i : i + tope] for i in range(0, len(parrafo), tope))
    return trozos


def _tacha(texto: str, token: str = "") -> str:
    """Tacha el token en cualquier URL con /bot."""
    return re.sub(r"/bot[0-9A-Za-z:_\-]+", "/bot***", texto.replace(token, "***") if token else texto)


def _pedir_telegram(token: str):
    """Devuelve pedir(url, cuerpo) con urllib; nunca lanza."""
    def pedir(url, cuerpo):
        datos = json.dumps(cuerpo, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(url, data=datos, method="POST",
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.status, json.loads(r.read().decode("utf-8", "replace") or "null")
        except urllib.error.HTTPError as e:
            try:
                return e.code, json.loads(e.read().decode("utf-8", "replace") or "null")
            except ValueError:
                return e.code, None
        except Exception:
            return None, None
    return pedir


def enviar(texto: str, boton_url=None, pedir=None, env=None) -> dict:
    """Envía el texto troceado a sendMessage. Devuelve {ok: bool, ...} sin lanzar."""
    config = env if env is not None else _leer_env()
    token = config.get("TELEGRAM_SINTESIS_BOT_TOKEN") or ""
    chat_id = config.get("TELEGRAM_SINTESIS_CHAT_ID") or CHAT_PERMITIDO
    if not token:
        return {"ok": False, "motivo": "sin token"}
    if chat_id != CHAT_PERMITIDO:
        return {"ok": False, "motivo": "chat no permitido"}
    if pedir is None:
        pedir = _pedir_telegram(token)
    url = "https://api.telegram.org/bot%s/sendMessage" % token
    trozos = partir(texto)
    total = len(trozos)
    for indice, trozo in enumerate(trozos):
        cuerpo = {"chat_id": chat_id, "text": trozo}
        if boton_url and indice == total - 1:
            cuerpo["reply_markup"] = {"inline_keyboard": [[{"text": "Abrir", "url": boton_url}]]}
        estado, datos = pedir(url, cuerpo)
        if estado is None or not (200 <= estado < 300):
            detalle = _tacha(json.dumps(datos, ensure_ascii=False) if datos else "sin respuesta", token)
            return {"ok": False, "motivo": "fallo de Telegram: %s" % detalle[:300]}
    return {"ok": True, "trozos": total}


def main(argv=None) -> int:
    """CLI: `prueba` envía una línea de comprobación."""
    import argparse

    p = argparse.ArgumentParser(prog="sintesis_telegram", description="Síntesis → Telegram")
    p.add_argument("orden", nargs="?", default=None, help="prueba")
    args = p.parse_args(argv)
    if args.orden != "prueba":
        print("uso: sintesis_telegram.py prueba")
        return 2
    ahora = __import__("datetime").datetime.now().isoformat(timespec="seconds")
    resultado = enviar("Prueba de sintesis_telegram a las %s" % ahora)
    print("enviada: %s trozo(s)" % resultado.get("trozos") if resultado.get("ok") else "no enviada: %s" % resultado.get("motivo"))
    return 0 if resultado.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
