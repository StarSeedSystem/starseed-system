#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bot Telegram para peticiones de Alex: getUpdates, cola durable, worker, refresh NotebookLM."""
import datetime
import json
import os
import re
import subprocess
import threading
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
import uuid
from typing import Any

from peticiones_reglas import (
    TIPOS,
    CLAVES_TIPO,
    INDICACIONES,
    AYUDA,
    RENOVAR,
    por_reglas,
    validar_plan,
    texto_estado,
)
from peticiones_notebooklm import (
    SesionCaducada,
    CUADERNO,
    NBLM,
    CASA as NB_CASA,
    SALIDAS as NB_SALIDAS,
    ENLACE_CUADERNO,
    nb,
    json_de,
    sesion_viva,
    asegurar_fuente,
    lanzar,
    esperar_y_bajar,
    enviar_resultado,
    ultima_sintesis,
    nombre_drive,
    token_google,
    drive,
)

CASA = NB_CASA
DIR = os.path.join(CASA, ".starseed", "peticiones")
ESTADO = os.path.join(DIR, "estado.json")
COLA = os.path.join(DIR, "cola.json")
SALIDAS = NB_SALIDAS

MODELOS = ["gemini-flash", "qwen3.8-max", "gemini-3.5-flash", "glm-5.3-flash", "qwen3.6-plus"]
REINTENTO_S = 300
VIDA_S = 24 * 3600
REFRESCO_S = 20 * 60

bloqueo = threading.Lock()
hay_trabajo = threading.Event()


def leer_env(ruta: str = os.path.join(CASA, ".starseed", "env")) -> dict[str, str]:
    datos = {}
    try:
        with open(ruta) as f:
            for linea in f:
                linea = linea.strip()
                if not linea or linea.startswith("#") or "=" not in linea:
                    continue
                k, v = linea.split("=", 1)
                datos[k.replace("export ", "").strip()] = v.strip().strip('"').strip("'")
    except OSError:
        pass
    return datos


ENV = leer_env()
TOKEN = ENV.get("TELEGRAM_SINTESIS_BOT_TOKEN", "")
CHAT = str(ENV.get("TELEGRAM_SINTESIS_CHAT_ID", ""))


def log(*partes: Any) -> None:
    texto = " ".join(str(p) for p in partes)
    if TOKEN:
        texto = texto.replace(TOKEN, "***")
    print(datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"), texto, flush=True)


def leer_json(ruta: str, defecto: Any) -> Any:
    try:
        with open(ruta) as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def escribir_json(ruta: str, datos: Any) -> None:
    tmp = ruta + ".tmp"
    with open(tmp, "w") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    os.replace(tmp, ruta)


def _respuesta_http(abrir):
    try:
        with abrir() as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        try:
            return json.load(e)
        except Exception:
            return {"ok": False, "description": "HTTP %s" % e.code}
    except Exception as e:
        return {"ok": False, "description": type(e).__name__}


def tg(metodo: str, datos: dict[str, Any] | None = None, timeout: int = 70) -> dict[str, Any]:
    url = "https://api.telegram.org/bot%s/%s" % (TOKEN, metodo)
    cuerpo = urllib.parse.urlencode(datos or {}).encode()
    return _respuesta_http(lambda: urllib.request.urlopen(url, cuerpo, timeout=timeout))


def decir(texto: str) -> None:
    for i in range(0, max(len(texto), 1), 3900):
        r = tg("sendMessage", {"chat_id": CHAT, "text": texto[i:i + 3900], "disable_web_page_preview": "true"})
        if not r.get("ok"):
            log("sendMessage falló:", r.get("description"))


def llm(mensajes: list[dict[str, str]], max_tokens: int = 1500) -> tuple[str, str]:
    clave = ENV.get("FREELLMAPI_KEY", "")
    for modelo in MODELOS:
        cuerpo = json.dumps({"model": modelo, "messages": mensajes, "max_tokens": max_tokens, "temperature": 0.2}).encode()
        req = urllib.request.Request(ENV.get("STARSEED_LLM_URL", "http://127.0.0.1:3001/v1/chat/completions"), cuerpo,
                                     {"Authorization": "Bearer " + clave, "Content-Type": "application/json"})
        d = _respuesta_http(lambda: urllib.request.urlopen(req, timeout=150))
        usado = str(d.get("model") or modelo)
        texto = ((d.get("choices") or [{}])[0].get("message") or {}).get("content") or ""
        if "claude" in usado.lower():
            continue
        if texto.strip():
            return texto.strip(), usado
        log("llm sin respuesta de", modelo, (d.get("error") or {}).get("message", "") if isinstance(d.get("error"), dict) else "")
    return "", ""


INSTRUCCION = (
    "Eres el despachador de MetaGenesis (StarSeed). Alex escribe peticiones por Telegram. Devuelve SOLO un "
    "objeto JSON, sin texto alrededor, con esta forma: {\"tipo\": \"notebooklm\" o \"respuesta\", "
    "\"fuente\": \"ultima_sintesis\" | \"drive\" | \"cuaderno\", \"drive_id\": \"\", "
    "\"artefactos\": [{\"tipo\": uno de infographic, audio, video, slide-deck, mind-map, report, quiz, "
    "flashcards, data-table, \"indicaciones\": \"qué destacar, en español\"}], "
    "\"resumen\": \"una frase en español de lo que vas a hacer\"}. "
    "Usa \"notebooklm\" si pide algo que se genera en NotebookLM (infografía, audio, podcast, resumen de audio, "
    "vídeo, presentación, diapositivas, mapa mental, informe, cuestionario, tarjetas, tabla). Fuente "
    "\"ultima_sintesis\" si habla de la última síntesis o de la síntesis diaria; \"drive\" si da un enlace o id de "
    "Drive (ponlo en drive_id); \"cuaderno\" si no da una fuente concreta. \"respuesta\" para todo lo demás, con "
    "artefactos vacío."
)


def interpretar(texto: str) -> dict[str, Any]:
    reglas = por_reglas(texto)
    crudo, modelo = llm([{"role": "system", "content": INSTRUCCION}, {"role": "user", "content": texto}], 600)
    plan = None
    m = re.search(r"\{.*\}", crudo or "", re.S)
    if m:
        try:
            plan = json.loads(m.group(0))
        except ValueError:
            plan = None
    if not isinstance(plan, dict):
        log("interpretación por reglas (modelo no dio JSON)")
        return reglas
    artefactos = []
    for a in plan.get("artefactos") or []:
        if isinstance(a, dict) and a.get("tipo") in TIPOS and a["tipo"] not in [x["tipo"] for x in artefactos]:
            artefactos.append({"tipo": a["tipo"], "indicaciones": str(a.get("indicaciones") or "")[:800]})
    if not artefactos and reglas["artefactos"]:
        artefactos = reglas["artefactos"]
    fuente = plan.get("fuente") if plan.get("fuente") in ("ultima_sintesis", "drive", "cuaderno") else reglas["fuente"]
    drive_id = reglas["drive_id"] or (str(plan.get("drive_id") or "") if re.fullmatch(r"[A-Za-z0-9_-]{20,}", str(plan.get("drive_id") or "")) else "")
    if fuente == "drive" and not drive_id:
        fuente = reglas["fuente"] if reglas["fuente"] != "drive" else "cuaderno"
    log("plan de", modelo, ":", [a["tipo"] for a in artefactos], fuente)
    return {"tipo": "notebooklm" if artefactos else "respuesta", "fuente": fuente, "drive_id": drive_id,
            "artefactos": artefactos[:4], "resumen": str(plan.get("resumen") or "")[:300]}


def actualizar(pid: int, **cambios: Any) -> None:
    with bloqueo:
        cola = leer_json(COLA, [])
        for x in cola:
            if x["id"] == pid:
                x.update(cambios)
        escribir_json(COLA, cola)


def atender(p: dict[str, Any]) -> None:
    actualizar(p["id"], estado="en_curso", intentos=p.get("intentos", 0) + 1)
    try:
        plan = p.get("plan") or interpretar(p["texto"])
        actualizar(p["id"], plan=plan)
        if plan["tipo"] == "notebooklm" and plan["artefactos"]:
            hacer_notebooklm(p, plan)
        else:
            responder(p)
        actualizar(p["id"], estado="hecha", terminada=time.time())
    except SesionCaducada:
        actualizar(p["id"], estado="esperando_sesion")
        if not p.get("avisada_sesion"):
            actualizar(p["id"], avisada_sesion=True)
            decir("La sesión de NotebookLM del A1 caducó. Tu petición queda en cola y se hará sola en cuanto vuelva "
                  "(hasta 24 h). " + RENOVAR)
    except Exception as e:
        log("falló", p["id"], traceback.format_exc()[-1500:])
        n = p.get("intentos", 0) + 1
        if n < 3:
            actualizar(p["id"], estado="reintentar")
            decir("Un paso falló (%s). Lo reintento en 5 min (%d/3)." % (str(e)[:300], n))
        else:
            actualizar(p["id"], estado="fallida")
            decir("No pude completar tu petición tras 3 intentos: %s" % str(e)[:500])


def hacer_notebooklm(p: dict[str, Any], plan: dict[str, Any]) -> None:
    titulo, sid = None, p.get("fuente_id")
    if plan["fuente"] == "ultima_sintesis":
        fid, titulo = ultima_sintesis()
    elif plan["fuente"] == "drive" and plan["drive_id"]:
        fid = plan["drive_id"]
        titulo = nombre_drive(fid)
    else:
        fid = None
    hechos = set(p.get("hechos") or [])
    pendientes = [a for a in plan["artefactos"] if a["tipo"] not in hechos]
    nombres = ", ".join(TIPOS[a["tipo"]][0] for a in pendientes)
    decir("En marcha en NotebookLM (cuaderno «StarSeed: Producción audiovisual»): %s%s.\n"
          "La infografía tarda unos minutos; el audio, 10–25 min. Te los envío aquí en cuanto estén."
          % (nombres, " a partir de «%s»" % titulo if titulo else ""))
    if fid and not sid:
        sid = asegurar_fuente(fid, titulo)
        actualizar(p["id"], fuente_id=sid)
    tareas = []
    for a in pendientes:
        tareas.append((a["tipo"], lanzar(a["tipo"], a.get("indicaciones", ""), sid)))
    tareas.sort(key=lambda t: TIPOS[t[0]][3])
    for tipo, tarea in tareas:
        ruta = esperar_y_bajar(tipo, tarea, p["id"])
        enviar_resultado(tipo, ruta, titulo)
        hechos.add(tipo)
        actualizar(p["id"], hechos=sorted(hechos))
    decir("Listo ✓ También quedó en el cuaderno: %s" % ENLACE_CUADERNO)


def responder(p: dict[str, Any]) -> None:
    sistema = ("Eres MetaGenesis, el sistema de agentes de StarSeed, respondiendo a Alex por Telegram. Responde en "
               "español, claro y útil, en menos de 1.500 caracteres. Si la petición exige algo que no puedes hacer "
               "desde aquí (publicar, escribir código del OS, tocar cuentas o enviar mensajes a terceros), dilo y "
               "propón cómo encargarlo a MetaGenesis.")
    texto, modelo = llm([{"role": "system", "content": sistema}, {"role": "user", "content": p["texto"]}])
    if not texto:
        raise RuntimeError("los modelos gratuitos no respondieron")
    decir("%s\n\n— MetaGenesis · %s" % (texto, modelo))


def trabajar() -> None:
    while True:
        hay_trabajo.wait(timeout=REINTENTO_S)
        hay_trabajo.clear()
        with bloqueo:
            cola = leer_json(COLA, [])
        for p in cola:
            if p.get("estado") not in ("nueva", "en_curso", "reintentar", "esperando_sesion"):
                continue
            if time.time() - p.get("recibida", 0) > VIDA_S:
                actualizar(p["id"], estado="caducada")
                decir("Retiro de la cola tras 24 h sin poder hacerla: «%s»" % p["texto"][:120])
                continue
            if p.get("estado") == "esperando_sesion" and not sesion_viva():
                continue
            atender(p)


def mantener_sesion() -> None:
    avisado = False
    while True:
        try:
            rc, out, err = nb(["auth", "refresh"], 180)
            ok = rc == 0
        except SesionCaducada:
            ok = False
        marca = {"viva": ok, "comprobada": datetime.datetime.now().isoformat(timespec="minutes")}
        with bloqueo:
            escribir_json(ESTADO, dict(leer_json(ESTADO, {}), notebooklm=marca))
        if not ok and not avisado:
            decir("Aviso de MetaGenesis: la sesión de NotebookLM del A1 caducó. Las peticiones esperan en cola. "
                  + RENOVAR)
            avisado = True
        if ok:
            if avisado:
                hay_trabajo.set()
            avisado = False
        time.sleep(REFRESCO_S)


# GEN1114D · /estado y /ayuda empiezan con «Este chat: <nombre> · id <id>», leído de chat-a1.json (lo lleva la Mac
# por ssh con `llevar-a1`), NUNCA del catálogo de la puerta, que no es de confianza. Sin él no se inventa nombre.
ID_CHAT = re.compile(r"^[a-z0-9][a-z0-9._-]{1,62}$")
RAROS = re.compile("[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]")


def leer_privado(ruta: str, defecto: Any = None) -> Any:
    """El JSON de un archivo solo si es de este usuario y nadie más puede leerlo ni escribirlo (600)."""
    try:
        st = os.stat(ruta)
    except OSError:
        return defecto
    if st.st_uid != os.getuid() or st.st_mode & 0o077:
        return defecto
    return leer_json(ruta, defecto)


def chat_a1() -> dict[str, Any] | None:
    """{id, nombre, alias} del chat canónico de este bot (§5.1), o None si falta o no vale."""
    d = leer_privado(os.path.join(DIR, "chat-a1.json"))
    if not (isinstance(d, dict) and d.get("v") == 1 and isinstance(d.get("id"), str) and ID_CHAT.match(d["id"])):
        return None
    nombre = RAROS.sub("", d.get("nombre") if isinstance(d.get("nombre"), str) else "").strip()[:80]
    alias = [RAROS.sub("", a).strip()[:80] for a in d.get("alias") or [] if isinstance(a, str)][:20]
    return {"id": d["id"], "nombre": nombre, "alias": alias} if nombre else None


def linea_chat() -> str:
    c = chat_a1()
    if c is None:
        return "Este chat: nombre aún no publicado por la Mac"
    return "Este chat: %s · id %s" % (c["nombre"], c["id"])


_texto_estado_gen1113 = texto_estado


def texto_estado(cola: list[Any], notebooklm: dict[str, Any]) -> str:  # noqa: F811 · la de peticiones_reglas + la línea
    return linea_chat() + "\n" + _texto_estado_gen1113(cola, notebooklm)


def texto_ayuda() -> str:
    return linea_chat() + "\n" + AYUDA


def recibir(upd: dict[str, Any]) -> None:
    m = upd.get("message") or {}
    if str((m.get("chat") or {}).get("id")) != CHAT:
        log("ignoro un mensaje de otro chat")
        return
    texto = (m.get("text") or m.get("caption") or "").strip()
    if not texto:
        decir("Por ahora atiendo mensajes de texto.")
        return
    if texto.startswith("/estado"):
        decir(texto_estado(leer_json(COLA, []), leer_json(ESTADO, {}).get("notebooklm", {})))
        return
    if texto.startswith(("/start", "/ayuda", "/help")):
        decir(texto_ayuda())   # GEN1114D
        return
    with bloqueo:
        cola = leer_json(COLA, [])
        if any(p["id"] == upd["update_id"] for p in cola):
            return
        cola.append({"id": upd["update_id"], "texto": texto, "recibida": time.time(), "estado": "nueva", "intentos": 0})
        escribir_json(COLA, cola[-200:])
    decir("Recibido ✓ Lo atiende MetaGenesis en el A1, sin la Mac ni Claude.")
    hay_trabajo.set()


def escuchar() -> None:
    offset = leer_json(ESTADO, {}).get("offset", 0)
    while True:
        r = tg("getUpdates", {"timeout": 50, "offset": offset, "allowed_updates": json.dumps(["message"])}, 75)
        if not r.get("ok"):
            log("getUpdates:", r.get("description"))
            time.sleep(15)
            continue
        for u in r.get("result") or []:
            try:
                recibir(u)
            except Exception:
                log("recibir falló", traceback.format_exc()[-800:])
            offset = u["update_id"] + 1
            with bloqueo:
                escribir_json(ESTADO, dict(leer_json(ESTADO, {}), offset=offset))


def main() -> None:
    if not TOKEN or not CHAT:
        raise SystemExit("faltan TELEGRAM_SINTESIS_BOT_TOKEN o TELEGRAM_SINTESIS_CHAT_ID en ~/.starseed/env")
    os.makedirs(SALIDAS, exist_ok=True)
    for x in leer_json(COLA, []):
        if x.get("estado") == "en_curso":
            actualizar(x["id"], estado="reintentar")
    log("escuchando @StarSeed_Design_bot")
    threading.Thread(target=trabajar, daemon=True).start()
    threading.Thread(target=mantener_sesion, daemon=True).start()
    hay_trabajo.set()
    escuchar()


# GEN1113F · peticiones también por la puerta de datos (sin Telegram). Solo si está la ficha; si no, nada cambia.
if os.environ.get("STARSEED_PUERTA_FICHA_GENESIS_A1") or ENV.get("STARSEED_PUERTA_FICHA_GENESIS_A1"):
    import sys
    import peticiones_puerta
    peticiones_puerta.enganchar(sys.modules[__name__])


if __name__ == "__main__":
    main()