#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Envío de la síntesis al chat propio de Telegram (SDP1111B).

Texto plano a sendMessage troceado a 3.500 caracteres por límites de párrafo; solo admite
el chat de TELEGRAM_SINTESIS_CHAT_ID; nunca imprime el token (tacha URLs con /bot).
Variables: TELEGRAM_SINTESIS_BOT_TOKEN, TELEGRAM_SINTESIS_CHAT_ID. Uso: prueba.
"""

import json
import os
import sys
import urllib.request

RUTA_ENV = os.path.expanduser("~/.starseed/env")
API_BASE = "https://api.telegram.org"
TOPE_TROZO = 3500
CLAVES = ("TELEGRAM_SINTESIS_BOT_TOKEN", "TELEGRAM_SINTESIS_CHAT_ID")


def partir(texto, tope=TOPE_TROZO):
    """Trocea por límites de párrafo; un párrafo más largo que el tope se corta."""
    if not texto:
        return []
    trozos, actual = [], ""
    for parrafo in texto.split("\n\n"):
        while len(parrafo) > tope:
            if actual:
                trozos.append(actual)
                actual = ""
            trozos.append(parrafo[:tope])
            parrafo = parrafo[tope:]
        if not actual:
            actual = parrafo
        elif len(actual) + 2 + len(parrafo) <= tope:
            actual += "\n\n" + parrafo
        else:
            trozos.append(actual)
            actual = parrafo
    return trozos + ([actual] if actual else [])


def tachar(texto):
    """Sustituye el token de cualquier URL /bot<token>/ por una marca."""
    salida, i = [], 0
    while True:
        j = texto.find("/bot", i)
        if j == -1:
            return "".join(salida) + texto[i:]
        fin = texto.find("/", j + 4)
        salida.append(texto[i : j + 4] + "***")
        if fin == -1:
            return "".join(salida)
        i = fin


def _pedir(url, cuerpo=None):
    """Petición real con urllib; devuelve (código, datos)."""
    cabeceras = {"Content-Type": "application/json"}
    with urllib.request.urlopen(
        urllib.request.Request(url, data=cuerpo, headers=cabeceras), timeout=30
    ) as respuesta:
        return respuesta.status, json.loads(respuesta.read().decode("utf-8"))


def _leer_env(ruta=RUTA_ENV):
    """Lee pares K=V de un archivo de entorno; el entorno del proceso manda."""
    datos = {}
    try:
        with open(ruta, encoding="utf-8") as f:
            for linea in f:
                linea = linea.strip()
                if not linea or linea.startswith("#") or "=" not in linea:
                    continue
                if linea.startswith("export "):
                    linea = linea[7:]
                clave, valor = linea.split("=", 1)
                datos[clave.strip()] = valor.strip().strip('"').strip("'")
    except OSError:
        pass
    datos.update({c: os.environ[c] for c in CLAVES if os.environ.get(c)})
    return datos


def _enviar_con(env, texto, boton_url, pedir):
    """Envía con credenciales ya leídas; `pedir` es inyectable para las pruebas."""
    pedir = pedir or _pedir
    token = env.get(CLAVES[0], "")
    chat_id = env.get(CLAVES[1], "")
    if not token or not chat_id:
        return {"ok": False, "motivo": "sin token"}
    trozos = partir(texto, TOPE_TROZO)
    for trozo in trozos:
        cuerpo = {"chat_id": chat_id, "text": trozo, "disable_web_page_preview": True}
        if boton_url:
            cuerpo["reply_markup"] = {
                "inline_keyboard": [[{"text": "Abrir", "url": boton_url}]]
            }
        try:
            codigo, datos = pedir(
                f"{API_BASE}/bot{token}/sendMessage", json.dumps(cuerpo).encode("utf-8")
            )
        except Exception as error:  # el mensaje puede llevar la URL con token
            return {"ok": False, "motivo": tachar(str(error))}
        if codigo != 200 or not datos.get("ok"):
            descripcion = tachar(str(datos.get("description", "")))
            return {"ok": False, "motivo": f"telegram {codigo}: {descripcion}".strip(": ")}
    return {"ok": True, "trozos": len(trozos), "chat_id": chat_id}


def enviar(texto, boton_url=None, pedir=None):
    """Envía el texto al chat de las síntesis. Devuelve {ok, motivo|trozos}."""
    return _enviar_con(_leer_env(), texto, boton_url, pedir)


def enviar_desde(ruta_env, texto, boton_url=None, pedir=None):
    return _enviar_con(_leer_env(ruta_env), texto, boton_url, pedir)


def main(argv):
    if len(argv) >= 2 and argv[1] == "prueba":
        resultado = enviar("Comprobación de la síntesis de producción StarSeed.")
        print(json.dumps(resultado, ensure_ascii=False))
        return 0 if resultado.get("ok") else 1
    print("Uso: python3 sintesis_telegram.py prueba")
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))