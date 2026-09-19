#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""renovador-pasarelas · prueba cada pasarela con OCHO tokens y dice qué hacer.

    python3 scripts/puente/renovador-pasarelas.py            → informe en pantalla
    python3 scripts/puente/renovador-pasarelas.py --telegram → además te lo manda
    python3 scripts/puente/renovador-pasarelas.py --abrir    → abre en el navegador
                                                               SOLO lo que pide una persona

Por qué existe (2026-09-16). El enjambre pasó un día «trabajando» sin escribir una línea:
sin clave, las pasarelas no dan error, dan SILENCIO, y el silencio se parece a un agente
pensando. Ocho tokens y dos segundos bastan para distinguir «no tengo llave» de «estoy
pensando», y eso es lo que antes costaba un día de suscripción de ChatGPT.

Lo que este agente NO hace, y no es un descuido:
  · no crea cuentas,
  · no escribe ni guarda ninguna clave,
  · no rellena formularios ni resuelve verificaciones.
Cuando hace falta una persona, abre la página o te deja el enlace, y tú pegas la clave
nueva en `~/.hermes/.env`. Después vuelve a probar y te confirma si quedó viva.

Las decisiones viven en `pasarelas.py` (puro, con pruebas). Aquí solo hay red y efectos.
"""

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import pasarelas as P

INFORME = os.path.expanduser("~/.starseed/pasarelas-informe.json")

# Una pasarela, un modelo barato con el que probarla y la variable donde vive su clave.
# NUNCA el valor: solo el NOMBRE de la variable.
SONDAS = [
    # La neurona local (Ollama) es una pasarela más: OpenAI-compatible, sin clave,
    # sin cupo y sin red. Va primera porque nada puede dejarla sin créditos.
    ("neurona", "http://127.0.0.1:11434/v1", None, "qwen2.5:0.5b"),
    ("openrouter", "https://openrouter.ai/api/v1", "OPENROUTER_API_KEY", "nex-agi/nex-n2.5-pro:free"),
    # (2026-09-19) kimi-k3 y deepseek-v4-flash-0731 se cuelgan en NIM sin emitir (40 s
    # sin respuesta); nemotron-3-super contestó en 0,7 s. La sonda mide lo que escribe.
    ("nvidia", "https://integrate.api.nvidia.com/v1", "NVIDIA_API_KEY", "nvidia/nemotron-3-super-120b-a12b"),
    # Gemini directo por su endpoint OpenAI-compatible. Se sonda con flash-lite a
    # propósito: los modelos con razonamiento (3.6-flash) devuelven contenido VACÍO a
    # 16 tokens y saldrían «mudos» sin estarlo. Hermes y opencode usan gemini-3.6-flash.
    ("google", "https://generativelanguage.googleapis.com/v1beta/openai", "GEMINI_API_KEY", "gemini-3.5-flash-lite"),
    ("groq", "https://api.groq.com/openai/v1", "GROQ_API_KEY", "openai/gpt-oss-20b"),
    ("xkiro", "https://api.xkiro.com/v1", "XKIRO_API_KEY", "qwen/qwen3-coder-plus:free"),
    ("tokenrouter", "https://api.tokenrouter.com/v1", "TOKENROUTER_API_KEY", "z-ai/glm-5.3-free"),
    ("aihubmix", "https://aihubmix.com/v1", "AIHUBMIX_API_KEY", "gpt-4o-mini"),
    # OJO: se sonda con un modelo que apinex SÍ sirve. Con `gpt-4o-mini` devolvía
    # 404 y lo clasificábamos «modelo_fuera» — es decir, «el modelo ya no existe»,
    # cuando la verdad era «la pasarela entera está esperando tu fichaje diario».
    # Con el modelo correcto sale el mensaje real y el informe te da el enlace.
    ("apinex", "https://apinex.bond/v1", "STARSEED_PASARELA_APINEX_KEY", "free/glm-5.3-flash"),
    ("deepseek", "https://api.deepseek.com/v1", "DEEPSEEK_API_KEY", "deepseek-v4-pro"),
    ("xai", "https://api.x.ai/v1", "XAI_API_KEY", "grok-4.6"),
    # (2026-09-19) Hugging Face tenía clave (HF_TOKEN) y no estaba en la rotación.
    ("huggingface", "https://router.huggingface.co/v1", "HF_TOKEN", "Qwen/Qwen2.5-72B-Instruct"),
    # FreeLLMAPI local: reparte entre todo lo gratuito; su clave la crea Alex en :3001.
    ("freellmapi", "http://127.0.0.1:3001/v1", "FREELLMAPI_KEY", "auto"),
]

ARCHIVOS_DE_CLAVES = ("~/.hermes/.env", "~/.starseed/env")


def entorno_con_claves():
    """Lee los archivos de claves a un dict. No imprime ni guarda ningún valor.

    Se leen línea a línea, NO con `source`: así una línea con comillas mal puestas
    estropea como mucho su propia variable. Esa comilla nos costó un día entero.
    """
    fuera = dict(os.environ)
    for ruta in ARCHIVOS_DE_CLAVES:
        ruta = os.path.expanduser(ruta)
        if not os.path.exists(ruta):
            continue
        try:
            with open(ruta, encoding="utf-8", errors="replace") as f:
                for linea in f:
                    linea = linea.strip()
                    if not linea or linea.startswith("#") or "=" not in linea:
                        continue
                    nombre, _, valor = linea.partition("=")
                    nombre = nombre.strip()
                    if nombre.startswith("export "):
                        nombre = nombre[len("export "):].strip()
                    valor = valor.strip()
                    if len(valor) >= 2 and valor[0] == valor[-1] and valor[0] in "\"'":
                        valor = valor[1:-1]
                    if nombre and valor:
                        fuera[nombre] = valor
        except Exception:
            continue
    return fuera


def sondear(url, clave, modelo, segundos=25):
    """Ocho tokens. Devuelve (http, cuerpo_recortado, hubo_tokens)."""
    if not clave and not url.startswith("http://127.0.0.1"):
        # Sin llave no es «lenta»: es exactamente el caso que hay que renovar.
        return 401, "no hay clave en el entorno para esta pasarela", False
    cuerpo = json.dumps({
        "model": modelo,
        "messages": [{"role": "user", "content": "di ok"}],
        "max_tokens": 16,
    }).encode("utf-8")
    # El User-Agent NO es decorativo: con el de urllib por defecto, groq, xkiro y apinex
    # devolvían 403 a los 0,2 s (Cloudflare) y el informe acusaba a las claves de estar
    # caducadas cuando estaban perfectas. Un agente que miente así es peor que ninguno.
    peticion = urllib.request.Request(
        url.rstrip("/") + "/chat/completions", data=cuerpo,
        headers={"Authorization": "Bearer %s" % (clave or "local"),
                 "Content-Type": "application/json",
                 "Accept": "application/json",
                 "User-Agent": "starseed-renovador/1.0"})
    try:
        with urllib.request.urlopen(peticion, timeout=segundos) as r:
            texto = r.read().decode("utf-8", "replace")
            # Vale con que devuelva una respuesta formada. Exigir texto visible daba
            # falsos muertos: un modelo de razonamiento se gasta los ocho tokens
            # pensando y deja `content` vacío — pero la pasarela ha funcionado.
            try:
                d = json.loads(texto)
                opciones = d.get("choices") or []
                viva = bool(opciones) and not d.get("error")
            except Exception:
                viva = False
            return r.status, texto[:400], viva
    except urllib.error.HTTPError as e:
        try:
            return e.code, e.read().decode("utf-8", "replace")[:400], False
        except Exception:
            return e.code, "", False
    except Exception as e:
        # Incluye el silencio: conexión aceptada y ni un byte de vuelta.
        return 0, "%s: %s" % (type(e).__name__, e), False


def pasada(segundos=25):
    entorno = entorno_con_claves()
    fuera = []
    for nombre, url, var, modelo in SONDAS:
        t0 = time.time()
        http, cuerpo, tokens = sondear(url, entorno.get(var), modelo, segundos)
        fuera.append({
            "clave": nombre,
            "modelo": modelo,
            "variable": var,                       # el NOMBRE, nunca el valor
            "tiene_clave": bool(entorno.get(var)),
            "http": http,
            "estado": P.clasificar(http, cuerpo, tokens),
            "segundos": round(time.time() - t0, 1),
        })
    return fuera


def guardar(resultados):
    try:
        os.makedirs(os.path.dirname(INFORME), exist_ok=True)
        tmp = INFORME + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"t": time.strftime("%Y-%m-%d %H:%M:%S"), "pasarelas": resultados},
                      f, ensure_ascii=False, indent=2)
        os.replace(tmp, INFORME)
    except Exception:
        pass


def abrir(enlaces):
    """Abre en el navegador SOLO lo que necesita a una persona delante."""
    for e in enlaces:
        try:
            subprocess.run(["open", e], timeout=15, capture_output=True)
        except Exception:
            pass
    return enlaces


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--telegram", action="store_true", help="manda el informe al chat")
    ap.add_argument("--abrir", action="store_true", help="abre las páginas que piden una persona")
    ap.add_argument("--segundos", type=int, default=25, help="margen por sonda")
    args = ap.parse_args()

    resultados = pasada(args.segundos)
    guardar(resultados)
    texto = P.informe(resultados)
    print(texto)

    pendientes = P.para_abrir(resultados)
    sin_clave = [r for r in resultados if not r["tiene_clave"]]
    if sin_clave:
        print("\nSin clave configurada (la creas tú; yo no abro cuentas):")
        for r in sin_clave:
            ficha = P.CATALOGO.get(r["clave"], {})
            print("   %-12s %s  → %s" % (r["clave"], r["variable"], ficha.get("enlace", "")))
            if ficha.get("enlace") and ficha["enlace"] not in pendientes:
                pendientes.append(ficha["enlace"])

    if args.abrir and pendientes:
        abrir(pendientes)
        print("\nAbiertas en el navegador: %d página(s)." % len(pendientes))
    elif pendientes:
        print("\nPáginas que piden tus manos (lánzalo con --abrir para abrirlas):")
        for e in pendientes:
            print("   %s" % e)

    if args.telegram:
        try:
            import desatascar
            extra = ("\n\nPara renovar:\n" + "\n".join(pendientes)) if pendientes else ""
            print("aviso enviado:" , desatascar.avisar_por_telegram(texto + extra))
        except Exception as e:
            print("no pude avisar por Telegram: %s" % type(e).__name__)

    vivas = [r for r in resultados if r["estado"] == P.ESCRIBE]
    return 0 if vivas else 1


if __name__ == "__main__":
    sys.exit(main())
