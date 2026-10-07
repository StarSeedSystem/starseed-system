#!/usr/bin/env python3
"""Apps de IA propias de Genesis: prompt, conocimiento, registro y anotaciones."""
from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.request
import uuid
RAIZ = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
APPS = os.path.join(RAIZ, "starseed_memory_root", "apps-ia")
ID_SEGURO = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
VARIABLE = re.compile(r"{{\s*([a-zA-Z_][a-zA-Z0-9_.-]*)\s*}}")
def cargar_app(app, raiz=None):
    if isinstance(app, dict):
        return dict(app)
    if not isinstance(app, str) or not ID_SEGURO.fullmatch(app):
        raise ValueError("Identificador de app no válido.")
    with open(os.path.join(raiz or APPS, f"{app}.json"), encoding="utf-8") as archivo:
        datos = json.load(archivo)
    datos.setdefault("id", app)
    return datos
def renderizar_prompt(plantilla, entradas):
    def valor(coincidencia):
        nombre = coincidencia.group(1)
        if nombre not in entradas:
            raise ValueError(f"Falta la variable {nombre!r}.")
        dato = entradas[nombre]
        return dato if isinstance(dato, str) else json.dumps(dato, ensure_ascii=False)
    return VARIABLE.sub(valor, str(plantilla or ""))
def _leer_jsonl(ruta):
    try:
        with open(ruta, encoding="utf-8") as archivo:
            return [json.loads(linea) for linea in archivo if linea.strip()]
    except (OSError, ValueError):
        return []
def _modelo_real(mensajes, modelo="auto", temperatura=0.7, limite_salida=512):
    base = os.environ.get("STARSEED_APPS_IA_BASE_URL", "http://127.0.0.1:3001/v1")
    clave = os.environ.get("STARSEED_APPS_IA_API_KEY") or os.environ.get("FREELLMAPI_KEY")
    cabeceras = {"Content-Type": "application/json", "User-Agent": "StarSeed-OS/1.0"}
    if clave:
        cabeceras["Authorization"] = f"Bearer {clave}"
    cuerpo = {"model": modelo, "messages": mensajes, "temperature": temperatura,
              "max_tokens": limite_salida, "stream": False}
    peticion = urllib.request.Request(base.rstrip("/") + "/chat/completions",
                                      json.dumps(cuerpo).encode(), cabeceras)
    with urllib.request.urlopen(peticion, timeout=120) as respuesta:
        datos = json.load(respuesta)
    return {"answer": datos["choices"][0]["message"]["content"], "usage": datos.get("usage", {})}
def _fragmentos(resultado):
    return [r.get("segment", {}).get("content", "") for r in (resultado or {}).get("records", [])]
def responder(app, entradas, consulta, llamar_modelo=None, recuperar_fn=None,
              raiz=None, conversation_id=None):
    """Responde con modelo y recuperación inyectables; registra el turno en JSONL."""
    if not isinstance(entradas, dict) or not isinstance(consulta, str) or not consulta.strip():
        raise ValueError("Entradas o consulta no válidas.")
    cfg = cargar_app(app, raiz)
    app_id = app if isinstance(app, str) else cfg.get("id")
    if not isinstance(app_id, str) or not ID_SEGURO.fullmatch(app_id):
        raise ValueError("Identificador de app no válido.")
    carpeta = os.path.join(raiz or APPS, app_id)
    sistema = renderizar_prompt(cfg.get("prompt_sistema", cfg.get("prompt", "")), entradas)
    mensajes = [{"role": "system", "content": sistema}]
    base = cfg.get("base_conocimiento", cfg.get("base"))
    if base:
        if recuperar_fn is None:
            from conocimiento import recuperar as recuperar_fn
        contexto = "\n\n".join(_fragmentos(recuperar_fn(base, consulta, top=3)))
        if contexto:
            mensajes.append({"role": "system", "content": "Contexto recuperado:\n" + contexto})
    for ejemplo in _leer_jsonl(os.path.join(carpeta, "anotaciones.jsonl"))[-5:]:
        mensajes.extend([{"role": "user", "content": ejemplo["query"]},
                         {"role": "assistant", "content": ejemplo["answer"]}])
    mensajes.append({"role": "user", "content": consulta})
    opciones = {"modelo": cfg.get("modelo", cfg.get("model", "auto")),
                "temperatura": max(0.0, min(2.0, float(cfg.get("temperatura", 0.7)))),
                "limite_salida": max(1, min(8192, int(cfg.get("limite_salida", 512))))}
    resultado = (llamar_modelo or _modelo_real)(mensajes, **opciones)
    answer = resultado if isinstance(resultado, str) else str(resultado.get("answer", ""))
    uso = {} if isinstance(resultado, str) else dict(resultado.get("usage") or {})
    uso["total_tokens"] = int(uso.get("total_tokens") or
                               int(uso.get("prompt_tokens", 0)) + int(uso.get("completion_tokens", 0)))
    registro = {"id": uuid.uuid4().hex, "conversation_id": conversation_id or uuid.uuid4().hex,
                "created_at": int(time.time()), "inputs": entradas, "query": consulta,
                "answer": answer, "usage": uso}
    os.makedirs(carpeta, exist_ok=True)
    with open(os.path.join(carpeta, "registro.jsonl"), "a", encoding="utf-8") as archivo:
        archivo.write(json.dumps(registro, ensure_ascii=False) + "\n")
    return {"answer": answer, "conversation_id": registro["conversation_id"],
            "message_id": registro["id"], "metadata": {"usage": uso}}
def anotar(id_registro, respuesta_buena, raiz=None):
    """Guarda una respuesta corregida para usarla como ejemplo en turnos futuros."""
    if not isinstance(respuesta_buena, str) or not respuesta_buena.strip():
        raise ValueError("La respuesta buena debe contener texto.")
    for nombre in os.listdir(raiz or APPS):
        carpeta = os.path.join(raiz or APPS, nombre)
        for registro in _leer_jsonl(os.path.join(carpeta, "registro.jsonl")):
            if registro.get("id") == id_registro:
                nota = {"id": uuid.uuid4().hex, "registro_id": id_registro,
                        "query": registro["query"], "answer": respuesta_buena.strip()}
                with open(os.path.join(carpeta, "anotaciones.jsonl"), "a", encoding="utf-8") as archivo:
                    archivo.write(json.dumps(nota, ensure_ascii=False) + "\n")
                return nota
    raise KeyError("Registro no encontrado.")
def main(argv=None):
    argv = argv or sys.argv
    try:
        cuerpo = json.load(sys.stdin)
        salida = responder(argv[1], cuerpo.get("inputs", {}), cuerpo.get("query", ""),
                           conversation_id=cuerpo.get("conversation_id"))
        print(json.dumps(salida, ensure_ascii=False))
        return 0
    except Exception as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False))
        return 1
if __name__ == "__main__":
    raise SystemExit(main())
