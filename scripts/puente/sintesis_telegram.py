#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Envío de la síntesis al chat propio de Telegram (SDP1111B · relevo SDP1111P).

Texto plano a sendMessage troceado a 3.500 caracteres por límites de párrafo; solo admite
el chat de TELEGRAM_SINTESIS_CHAT_ID; nunca imprime el token (tacha URLs con /bot).
Variables: TELEGRAM_SINTESIS_BOT_TOKEN y TELEGRAM_SINTESIS_CHAT_ID. Si falta el token propio
(2026-11-11: en la Mac no hay bot de síntesis) usa el bot ya conectado TELEGRAM_BOT_TOKEN
(@starseed_puente_bot, de ~/.starseed/env o ~/.hermes/.env) con TELEGRAM_SINTESIS_CHAT_ID y,
si falta, TELEGRAM_CHAT_ID, antepone la cabecera «Síntesis de Producción StarSeed · AAAA-MM-DD»
para que se distinga en ese chat y, si un día existe el token propio, manda ese.
Con `cuentas` (filas de cuentas_google.estado), si una cuenta dejó de renovarse avisa UNA vez
al día con la orden exacta para rehacer el alta; nunca registra tokens ni secretos.
Uso: prueba.
"""

import json
import os
import sys
import time
import urllib.request

RUTA_ENV = os.path.expanduser("~/.starseed/env")
API_BASE = "https://api.telegram.org"
TOPE_TROZO = 3500
CLAVES = ("TELEGRAM_SINTESIS_BOT_TOKEN", "TELEGRAM_SINTESIS_CHAT_ID")
CLAVES_RELEVO = ("TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID")
CABECERA = "Síntesis de Producción StarSeed · "
RUTA_AVISOS = os.path.expanduser("~/.starseed/cuentas/.avisos-caducidad.json")
ORDEN_ALTA = ("~/.starseed/venv-cuentas/bin/python "
              "~/.starseed/herramientas/alta-cuentas-google.py {alias}")


def _resolver(env, fecha=None):
    """Token, chat y prefijo a usar: el bot de síntesis si existe; si no, el del Puente."""
    token = env.get(CLAVES[0], "")
    chat = env.get(CLAVES[1], "")
    if token and chat:
        return token, chat, ""
    token = env.get(CLAVES_RELEVO[0], "")
    chat = chat or env.get(CLAVES_RELEVO[1], "")
    if token and chat:
        return token, chat, CABECERA + (fecha or time.strftime("%Y-%m-%d")) + "\n\n"
    return "", "", ""


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
    datos.update({c: os.environ[c] for c in CLAVES + CLAVES_RELEVO if os.environ.get(c)})
    return datos


def texto_aviso(fila):
    """Aviso de caducidad con la orden exacta para rehacer el alta; sin tokens ni secretos."""
    alias = fila.get("alias") or "cuenta"
    motivo = fila.get("motivo") or "sin token"
    return ("El token de Google de «%s» dejó de renovarse (%s). Rehaz el alta con:\n%s"
            % (alias, motivo, ORDEN_ALTA.format(alias=alias)))


def avisos_pendientes(filas, fecha=None, ruta=RUTA_AVISOS):
    """Textos de las cuentas no vivas aún sin avisar HOY; marca la fecha en `ruta` (1 vez al día)."""
    fecha = fecha or time.strftime("%Y-%m-%d")
    try:
        previos = json.load(open(ruta, encoding="utf-8"))
    except (OSError, ValueError):
        previos = {}
    pendientes = []
    for fila in filas or []:
        alias = fila.get("alias") or ""
        if fila.get("vivo", True) or not alias or previos.get(alias) == fecha:
            continue
        pendientes.append(texto_aviso(fila))
        previos[alias] = fecha
    if pendientes:
        try:
            os.makedirs(os.path.dirname(ruta), exist_ok=True)
            open(ruta + ".tmp", "w", encoding="utf-8").write(json.dumps(previos))
            os.replace(ruta + ".tmp", ruta)
        except OSError:
            pass
    return pendientes


def _enviar_con(env, texto, boton_url, pedir, fecha=None):
    """Envía con credenciales ya resueltas; `pedir` es inyectable para las pruebas."""
    pedir = pedir or _pedir
    token, chat_id, prefijo = _resolver(env, fecha)
    if not token or not chat_id:
        return {"ok": False, "motivo": "sin token"}
    if prefijo:
        texto = prefijo + texto
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


def enviar(texto, boton_url=None, pedir=None, leer_env=None, fecha=None, cuentas=None,
           ruta_avisos=RUTA_AVISOS):
    """Envía el texto al chat de las síntesis. Devuelve {ok, motivo|trozos}.

    `cuentas`: filas de cuentas_google.estado(); si alguna no está viva, avisa UNA vez al día
    al mismo chat con la orden exacta para rehacer el alta y la síntesis sigue con lo demás.
    """
    lector = leer_env or _leer_env
    resultado = _enviar_con(lector(), texto, boton_url, pedir, fecha)
    avisos = avisos_pendientes(cuentas, fecha, ruta_avisos) if cuentas is not None else []
    for aviso in avisos:
        _enviar_con(lector(), aviso, None, pedir, fecha)
    if avisos:
        resultado["avisos"] = len(avisos)
    return resultado


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