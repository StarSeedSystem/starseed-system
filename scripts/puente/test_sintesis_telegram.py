#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas sin red para sintesis_telegram (SDP1111B)."""
import importlib.util
import pathlib


RUTA = pathlib.Path(__file__).with_name("sintesis_telegram.py")
SPEC = importlib.util.spec_from_file_location("sintesis_telegram", RUTA)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("No se pudo cargar sintesis_telegram.py")
ST = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ST)

FALLAS = []
PRUEBAS = 0


def comprobar(nombre, obtenido, esperado):
    global PRUEBAS
    PRUEBAS += 1
    if obtenido != esperado:
        FALLAS.append("FALLA %s: esperado %r, obtenido %r" % (nombre, esperado, obtenido))


def pedir_falsa(registro):
    def pedir(url, cuerpo):
        registro.append((url, cuerpo))
        return 200, {"ok": True}
    return pedir


# partir: párrafos cortos, uno por trozo
comprobar("partir vacío", ST.partir(""), [])
comprobar("partir un párrafo", ST.partir("hola\n\nadiós"), ["hola", "adiós"])
largo = "a" * (ST.TOPE_TROZO + 10)
trozos = ST.partir(largo)
comprobar("partir párrafo largo, corta duro", len(trozos), 2)
comprobar("partir trozos ≤ tope", all(len(t) <= ST.TOPE_TROZO for t in ST.partir("x\n\n" + largo)), True)

# _tacha: nunca el token en claro
comprobar(
    "_tacha quita el token de la URL",
    ST._tacha("https://api.telegram.org/bot123:ABC/sendMessage"),
    "https://api.telegram.org/bot***/sendMessage",
)
comprobar("_tacha sin token, no cambia", ST._tacha("https://ejemplo.org/x"), "https://ejemplo.org/x")

# sin token: {ok: False, motivo: 'sin token'} sin lanzar ni llamar a pedir
llamadas: list = []
resultado = ST.enviar("hola", pedir=pedir_falsa(llamadas), env={})
comprobar("sin token, ok False", resultado, {"ok": False, "motivo": "sin token"})
comprobar("sin token, no llama", len(llamadas), 0)

# envío correcto: URL, chat_id fijo, texto plano, un trozo
registro2: list = []
res = ST.enviar(
    "resumen del día",
    pedir=pedir_falsa(registro2),
    env={"TELEGRAM_SINTESIS_BOT_TOKEN": "123:XYZ", "TELEGRAM_SINTESIS_CHAT_ID": ST.CHAT_PERMITIDO},
)
comprobar("envío ok", res.get("ok"), True)
url, cuerpo = registro2[0]
comprobar("url sendMessage", url, "https://api.telegram.org/bot123:XYZ/sendMessage")
comprobar("chat permitido", cuerpo.get("chat_id"), ST.CHAT_PERMITIDO)
comprobar("texto plano, sin parse_mode", "parse_mode" in cuerpo, False)
comprobar("texto enviado", cuerpo.get("text"), "resumen del día")

# chat distinto al permitido: rechazo
res_chat = ST.enviar(
    "hola",
    pedir=pedir_falsa([]),
    env={"TELEGRAM_SINTESIS_BOT_TOKEN": "123:XYZ", "TELEGRAM_SINTESIS_CHAT_ID": "999"},
)
comprobar("chat no permitido", res_chat, {"ok": False, "motivo": "chat no permitido"})

# texto largo: varios trozos, mismo número de llamadas
registro3: list = []
grande = "\n\n".join("p%d %s" % (i, "x" * 2000) for i in range(4))
res3 = ST.enviar(grande, pedir=pedir_falsa(registro3), env={"TELEGRAM_SINTESIS_BOT_TOKEN": "t", "TELEGRAM_SINTESIS_CHAT_ID": ST.CHAT_PERMITIDO})
comprobar("largo: nº llamadas", len(registro3), len(ST.partir(grande)))
comprobar("largo: ok", res3.get("ok"), True)

# boton_url va en el último trozo como reply_markup
registro4: list = []
ST.enviar("a\n\nb", boton_url="https://ejemplo.org/s", pedir=pedir_falsa(registro4), env={"TELEGRAM_SINTESIS_BOT_TOKEN": "t", "TELEGRAM_SINTESIS_CHAT_ID": ST.CHAT_PERMITIDO})
comprobar("primer trozo sin markup", "reply_markup" in registro4[0][1], False)
comprobar(
    "último trozo con markup",
    registro4[-1][1].get("reply_markup"),
    {"inline_keyboard": [[{"text": "Abrir", "url": "https://ejemplo.org/s"}]]},
)

# error de la API: mensaje tachado, sin token en claro
def pedir_mala(url, cuerpo):
    return 400, {"description": "error en https://api.telegram.org/bot123:XYZ/sendMessage"}

res5 = ST.enviar("hola", pedir=pedir_mala, env={"TELEGRAM_SINTESIS_BOT_TOKEN": "123:XYZ", "TELEGRAM_SINTESIS_CHAT_ID": ST.CHAT_PERMITIDO})
comprobar("fallo de API, ok False", res5.get("ok"), False)
comprobar("fallo tachado, sin token", "123:XYZ" in str(res5), False)

print("Pruebas: %d" % PRUEBAS)
if FALLAS:
    print("\n".join(FALLAS))
    raise SystemExit(1)
print("OK · sintesis_telegram")
