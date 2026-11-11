#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Síntesis diaria autónoma (SDP1111B): envío al chat propio de Telegram (§3.3 de
architecture/sintesis-diaria-autonoma.md). API de bots con urllib, texto plano, troceando
a 3.500 caracteres por párrafos. Solo admite el chat de TELEGRAM_SINTESIS_CHAT_ID.
Variables (solo NOMBRES): TELEGRAM_SINTESIS_BOT_TOKEN, TELEGRAM_SINTESIS_CHAT_ID.
"""

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import date

TOPE_TROZO = 3500
API_BASE = "https://api.telegram.org"
TOKEN_SINTESIS = "TELEGRAM_SINTESIS_BOT_TOKEN"
CHAT_SINTESIS = "TELEGRAM_SINTESIS_CHAT_ID"


def _leer_env():
    """Lee ~/.starseed/env; el entorno manda sobre el archivo."""
    datos = {}
    ruta = os.path.expanduser("~/.starseed/env")
    try:
        with open(ruta, encoding="utf-8") as f:
            for linea in f:
                linea = linea.strip()
                if not linea or linea.startswith("#") or "=" not in linea:
                    continue
                if linea.startswith("export "):
                    linea = linea[7:]
                k, v = linea.split("=", 1)
                datos[k.strip()] = v.strip().strip('"').strip("'")
    except OSError:
        pass
    for nombre in (TOKEN_SINTESIS, CHAT_SINTESIS):
        valor = os.environ.get(nombre)
        if valor:
            datos[nombre] = valor
    return datos


def partir(texto: str, tope: int = TOPE_TROZO) -> list[str]:
    """Trocea por párrafos (línea en blanco); un párrafo mayor que el tope se corta duro."""
    if not texto:
        return []
    trozos: list[str] = []
    for p in [x.strip() for x in texto.split("\n\n") if x.strip()]:
        while len(p) > tope:
            trozos.append(p[:tope])
            p = p[tope:]
        trozos.append(p)
    return trozos


def _tachar_url(url: str) -> str:
    """Tacha el token en toda URL con /bot, para registros y errores."""
    return re.sub(r"/bot[^/\s]+", "/bot***", url)


def _pedir_telegram(url: str, cuerpo: dict, timeout: int = 20):
    """POST a la API de bots de Telegram; devuelve (estado, datos). Nunca lanza."""
    req = urllib.request.Request(
        url, data=json.dumps(cuerpo, ensure_ascii=False).encode("utf-8"), method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            texto = r.read().decode("utf-8", "replace")
            return r.status, (json.loads(texto) if texto else None)
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode("utf-8", "replace") or "null")
        except ValueError:
            return e.code, None
    except Exception:
        return None, None


def enviar(texto: str, boton_url: str | None = None, pedir=None) -> dict:
    """Envía el texto al chat de la síntesis. `pedir` inyectable para pruebas sin red.
    Solo admite el chat de TELEGRAM_SINTESIS_CHAT_ID; sin token, {ok: False, motivo: 'sin token'} sin lanzar.
    """
    pedir = pedir or _pedir_telegram
    env = _leer_env()
    token = env.get(TOKEN_SINTESIS)
    chat_id = env.get(CHAT_SINTESIS)
    if not token:
        return {"ok": False, "motivo": "sin token"}
    if not chat_id:
        return {"ok": False, "motivo": "sin chat_id"}
    trozos = partir(texto)
    for i, trozo in enumerate(trozos):
        cuerpo: dict = {"chat_id": chat_id, "text": trozo, "disable_web_page_preview": True}
        if boton_url and i == len(trozos) - 1:
            cuerpo["reply_markup"] = {"inline_keyboard": [[{"text": "Abrir", "url": boton_url}]]}
        estado, _ = pedir(f"{API_BASE}/bot{token}/sendMessage", cuerpo)
        if estado is None or not 200 <= estado < 300:
            motivo = "error de red" if estado is None else f"HTTP {estado}"
            return {"ok": False, "motivo": motivo, "trozos": i}
    return {"ok": True, "trozos": len(trozos)}


def main(argv=None) -> int:
    """CLI: `prueba` envía una línea de comprobación al chat de la síntesis."""
    p = argparse.ArgumentParser(prog="sintesis_telegram", description="Envío de la síntesis a Telegram")
    p.add_argument("orden", choices=["prueba"], help="prueba: envía una línea de comprobación")
    args = p.parse_args(argv)
    linea = f"Síntesis de Producción StarSeed · línea de comprobación ({date.today().isoformat()})"
    r = enviar(linea)
    print(json.dumps(r, ensure_ascii=False))
    return 0 if r.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
