# -*- coding: utf-8 -*-
"""Voz en tiempo real de Astraura · la parte PURA (sin modelo, sin red, sin disco).

Por qué existe (medido el 2026-09-22 en la Mac de Alex, M1 de 8 GB):
  · OmniVoice (el motor natural de la voz de Astraura) tarda ~4 veces lo que dura el audio
    (RTF ≈ 4). Una respuesta de 10 s de voz necesita 40 s de cálculo: en una conversación eso
    son pausas largas entre frases, no una voz continua.
  · Y cada frase salía con una semilla distinta (721120 / 752548) y un `instruct` distinto
    («female, young adult» / «young adult» / «teenager»), que ese modelo ni siquiera usa
    (`capabilities.instruct: false`): la voz cambiaba de timbre entre mensajes.
  · Supertonic 3 (66M, ONNX, 31 idiomas, español incluido) en la MISMA Mac, con swap: RTF 0,26
    —cuatro veces MÁS RÁPIDO que el tiempo real— y una voz fija por estilo (F1…M5).

Aquí vive lo que decide sin tocar nada, para poder probarlo: cuántos pasos de difusión usar
según lo que aguanta la máquina, cómo limpiar el texto que se va a decir, el contrato de la
concesión de conversación (el «estoy hablando con Alex» que los demás procesos respetan) y
el WAV que se devuelve.
"""
import io
import json
import re
import struct
import time

#: El pipeline va por delante del oído si calcular una cláusula cuesta menos de ~35 % de lo
#: que dura. Por encima de 0,45 se baja calidad; por debajo de 0,20 se sube.
RTF_OBJETIVO_MAX = 0.45
RTF_OBJETIVO_MIN = 0.20
PASOS_MIN = 3
PASOS_MAX = 8
#: Cuánto dura la concesión desde el último latido o la última frase dicha.
CONCESION_S = 90


def ajustar_pasos(rtf, pasos, minimo=PASOS_MIN, maximo=PASOS_MAX):
    """PURA: los pasos de difusión para la siguiente frase según el RTF medido.

    Menos pasos = más rápido y algo menos fino. Es la «calidad relativa al procesador
    disponible» que pidió Alex: la voz nunca se corta por falta de cálculo; como mucho suena
    un poco menos pulida en una máquina cargada, y vuelve a pulirse sola cuando hay holgura.
    """
    try:
        rtf = float(rtf)
    except (TypeError, ValueError):
        return pasos
    if rtf > RTF_OBJETIVO_MAX and pasos > minimo:
        return pasos - 1
    if rtf < RTF_OBJETIVO_MIN and pasos < maximo:
        return pasos + 1
    return pasos


def media_movil(anterior, nuevo, peso=0.4):
    """PURA: media exponencial; sin anterior, el nuevo valor."""
    if anterior is None:
        return float(nuevo)
    return anterior * (1 - peso) + float(nuevo) * peso


_URL = re.compile(r"https?://\S+")
_MARCAS = re.compile(r"[*_#`>|~\[\]{}]")
_ESPACIOS = re.compile(r"\s+")
# Emojis y pictogramas: se leerían como «cara sonriente» o como nada; mejor quitarlos.
_EMOJI = re.compile("[\U0001F000-\U0001FAFF\U00002600-\U000027BF\U0001F1E6-\U0001F1FF‍️]")


def limpiar_para_voz(texto, tope=600):
    """PURA: lo que de verdad se pronuncia. Sin markdown, sin enlaces, sin emojis."""
    t = str(texto or "")
    t = _URL.sub(" enlace ", t)
    t = _EMOJI.sub(" ", t)
    t = _MARCAS.sub(" ", t)
    t = _ESPACIOS.sub(" ", t).strip()
    return t[:tope]


def concesion_activa(concesion, ahora=None):
    """PURA: ¿hay una conversación en curso según la concesión leída?"""
    ahora = time.time() if ahora is None else ahora
    try:
        return float((concesion or {}).get("hasta") or 0) > ahora
    except (TypeError, ValueError):
        return False


def renovar_concesion(concesion, quien, ahora=None, segundos=CONCESION_S):
    """PURA: la concesión alargada. Conserva `desde` si ya estaba activa."""
    ahora = time.time() if ahora is None else ahora
    activa = concesion_activa(concesion, ahora)
    return {
        "desde": float(concesion["desde"]) if activa and concesion.get("desde") else ahora,
        "hasta": ahora + max(5, float(segundos)),
        "quien": str(quien or "astraura")[:60],
        "motor": "voz-rt",
    }


def cabecera_wav(n_bytes, frecuencia):
    """PURA: cabecera RIFF de un WAV PCM mono de 16 bits con `n_bytes` de datos."""
    cab = io.BytesIO()
    cab.write(b"RIFF")
    cab.write(struct.pack("<I", 36 + int(n_bytes)))
    cab.write(b"WAVEfmt ")
    cab.write(struct.pack("<IHHIIHH", 16, 1, 1, int(frecuencia), int(frecuencia) * 2, 2, 16))
    cab.write(b"data")
    cab.write(struct.pack("<I", int(n_bytes)))
    return cab.getvalue()


def wav_pcm16(muestras, frecuencia):
    """PURA: WAV mono de 16 bits a partir de muestras float en [-1, 1] (lista o iterable).

    El servidor usa la vía rápida de numpy con la misma `cabecera_wav`; esta existe para
    poder probar el formato sin numpy.
    """
    datos = bytearray()
    for m in muestras:
        v = max(-1.0, min(1.0, float(m)))
        datos += struct.pack("<h", int(v * 32767))
    return cabecera_wav(len(datos), frecuencia) + bytes(datos)


def leer_json(ruta):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}
