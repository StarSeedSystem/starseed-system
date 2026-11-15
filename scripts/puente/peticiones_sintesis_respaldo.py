#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Peticiones del bot del repo para backups del A1 (reimplementación de peticiones_telegram.py original de la herramienta).

A las 08:30 de México: si no hay una «Síntesis diaria <hoy>» válida, el A1 la hace con NotebookLM
(investigación profunda, informe con el protocolo completo y el resumen a Telegram) y dispara el multiformato.
El bot registra cada envío («→ telegram: <primeros 90 caracteres>») y cada fallo con su traza.

Referencia: scripts/puente/peticiones_telegram.py (200 KB original) → reimplementación ligera.
"""
import datetime
import json
import os
import re
import subprocess
import tempfile
import time
import threading
import traceback
import urllib.error
import urllib.parse
import urllib.request
import uuid
from typing import Any

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))

# Importar el módulo principal de NotebookLM (el mismo que en el A1)
from peticiones_notebooklm import (
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

# También importar las utilidades que usan las peticiones_telegram originales
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

import higgsfield_aprobado as hfa

CASA = NB_CASA
DIR = os.path.join(CASA, ".starseed", "peticiones")
ESTADO = os.path.join(DIR, "estado.json")
COLA = os.path.join(DIR, "cola.json")
SALIDAS = NB_SALIDAS

# Rutas del sanador de sesiones (SES1113C)
RAIZ_REPO = os.path.dirname(os.path.dirname(DIRECTORIO))
SALUD_ESTADO = os.path.join(RAIZ_REPO, "starseed_memory_root", "salud", "estado.json")

MODELOS = ["gemini-flash", "qwen3.8-max", "gemini-3.5-flash", "glm-5.3-flash", "qwen3.6-plus"]
REINTENTO_S = 300
VIDA_S = 24 * 3600
REFRESCO_S = 20 * 60
MULTIFORMATO_INTERVALO_S = 15 * 60

bloqueo = threading.Lock()
hay_trabajo = threading.Event()

# Archivos para reglas permanentes y rutinas (PSF1113B)
PREFERENCIAS = os.path.join(DIR, "preferencias.json")
RUTINAS = os.path.join(DIR, "rutinas.json")

# Grupo DIS1122D: las peticiones se registran en starseed_memory_root/olas/cola-sin1114.json (sin disparo)
COLA_SIN1114 = os.path.join(RAIZ_REPO, "starseed_memory_root", "olas", "cola-sin1114.json")

# IDs de la cola SIN1114 (mismo que el del enjambre original)
ID_SIN1114 = "SIN1114"

# Configuración del chat para registros (DE1111D)
CHAT_CONFIG_FILE = os.path.join(DIR, "chat-a1.json")
CHAT_ID = os.environ.get("TELEGRAM_SINTESIS_CHAT_ID", "")
TOKEN = os.environ.get("TELEGRAM_SINTESIS_BOT_TOKEN", "")


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
    d = leer_privado(CHAT_CONFIG_FILE)
    if not (isinstance(d, dict) and d.get("v") == 1 and isinstance(d.get("id"), str) and re.compile(r"^[a-z0-9][a-z0-9._-]{1,62}$").match(d["id"])):
        return None
    nombre = re.sub(r"[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]", "", d.get("nombre") if isinstance(d.get("nombre"), str) else "").strip()[:80]
    alias = [re.sub(r"[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]", "", a).strip()[:80] for a in d.get("alias") or [] if isinstance(a, str)][:20]
    return {"id": d["id"], "nombre": nombre, "alias": alias} if nombre else None


def decir(texto: str) -> None:
    for i in range(0, max(len(texto), 1), 3900):
        r = tg("sendMessage", {"chat_id": CHAT_ID, "text": texto[i:i + 3900], "disable_web_page_preview": "true"})
        if not r.get("ok"):
            log("sendMessage falló:", r.get("description"))


def tg(metodo: str, datos: dict[str, Any] | None = None, timeout: int = 70) -> dict[str, Any]:
    url = "https://api.telegram.org/bot%s/%s" % (TOKEN, metodo)
    cuerpo = urllib.parse.urlencode(datos or {}).encode()
    return _respuesta_http(lambda: urllib.request.urlopen(url, cuerpo, timeout=timeout))


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


def _leer_preferencias() -> dict[str, Any]:
    """Lee las preferencias permanentes desde preferencias.json."""
    return leer_json(PREFERENCIAS, {})


def _guardar_preferencia(clave: str, valor: str) -> None:
    """Guarda una preferencia permanente."""
    prefs = _leer_preferencias()
    prefs[clave] = valor
    escribir_json(PREFERENCIAS, prefs)


def _leer_rutinas() -> list[dict[str, Any]]:
    """Lee las rutinas desde rutinas.json."""
    return leer_json(RUTINAS, [])


def _guardar_rutina(rutina: dict[str, Any]) -> None:
    """Guarda una rutina en rutinas.json."""
    rutinas = _leer_rutinas()
    # Evitar duplicados por nombre
    rutinas = [r for r in rutinas if r.get("nombre") != rutina.get("nombre")]
    rutinas.append(rutina)
    escribir_json(RUTINAS, rutinas)


def _es_rutina(texto: str) -> bool:
    """Detecta si el texto describe una rutina (acción repetitiva con disparador)."""
    t = texto.lower()
    # Palabras que indican rutina: "cada día", "diario", "siempre que", "cuando", "al terminar"
    return bool(re.search(r"cada d[ií]a|diario|siempre que|cuando|al terminar|despu[eé]s de", t))


def _extraer_regla_permanente(texto: str) -> dict[str, Any] | None:
    """Extrae la información de una regla permanente del texto.
    
    Devuelve dict con: tipo ('preferencia' o 'rutina'), clave, valor, 
    disparador (para rutinas), accion (para rutinas), texto_original.
    """
    t = texto.lower()
    
    # Detectar si es una rutina
    if _es_rutina(texto):
        # Intentar extraer disparador y acción
        # Patrones simples: "cada día X" -> disparador="cada día", accion="X"
        # "cuando X, haz Y" -> disparador="cuando X", accion="Y"
        disparador = ""
        accion = ""
        
        if "cada d" in t or "diario" in t:
            disparador = "cada día"
            # La acción es lo que sigue después de "cada día" o "diario"
            for pat in [r"cada d[ií]a\s*[,:]?\s*(.+)", r"diario\s*[,:]?\s*(.+)"]:
                m = re.search(pat, t)
                if m:
                    accion = m.group(1).strip()
                    break
        elif "siempre que" in t:
            disparador = "siempre que"
            m = re.search(r"siempre que\s+(.+?)\s*(?:haz|har[eacute]|ejecuta|genera|env[ié]a)\s+(.+)", t)
            if m:
                accion = m.group(2).strip()
            else:
                accion = texto  # fallback
        elif "cuando" in t:
            disparador = "cuando"
            m = re.search(r"cuando\s+(.+?)\s*(?:haz|har[eacute]|ejecuta|genera|env[ié]a)\s+(.+)", t)
            if m:
                accion = m.group(2).strip()
            else:
                accion = texto
        elif "al terminar" in t or "despu[eacute]s de" in t:
            disparador = "al terminar"
            m = re.search(r"(?:al terminar|despu[eacute]s de)\s+(.+?)\s*(?:haz|har[eacute]|ejecuta|genera|env[ié]a)\s+(.+)", t)
            if m:
                accion = m.group(2).strip()
            else:
                accion = texto
        
        if not accion:
            accion = texto
        
        return {
            "tipo": "rutina",
            "nombre": f"rutina_{len(_leer_rutinas()) + 1}",
            "disparador": disparador,
            "accion": accion,
            "texto_original": texto,
            "creada": time.time(),
        }
    
    # Es una preferencia simple
    # Extraer clave-valor: "recuerda que X" -> clave="recuerda", valor="X"
    # "mi nombre es X" -> clave="nombre", valor="X"
    # "llámame X" -> clave="nombre", valor="X"
    # "siempre X" -> clave="siempre", valor="X"
    # "a partir de ahora X" -> clave="a_partir_de_ahora", valor="X"
    
    clave = "preferencia"
    valor = texto
    
    if "mi nombre es" in t:
        clave = "nombre"
        m = re.search(r"mi nombre es\s+(.+)", t)
        if m:
            valor = m.group(1).strip()
    elif re.search(r"ll[aá]mame", t):
        clave = "nombre"
        m = re.search(r"ll[aá]mame\s+(.+)", t)
        if m:
            valor = m.group(1).strip()
    elif re.search(r"recu[eé]rd", t):
        clave = "recordatorio"
        m = re.search(r"recu[eé]rd[a-z]*\s*[,:]?\s*(.+)", t)
        if m:
            valor = m.group(1).strip()
    elif "siempre" in t:
        clave = "siempre"
        m = re.search(r"siempre\s+(.+)", t)
        if m:
            valor = m.group(1).strip()
    elif "a partir de ahora" in t:
        clave = "a_partir_de_ahora"
        m = re.search(r"a partir de ahora\s*[,:]?\s*(.+)", t)
        if m:
            valor = m.group(1).strip()
    
    return {
        "tipo": "preferencia",
        "clave": clave,
        "valor": valor,
        "texto_original": texto,
        "creada": time.time(),
    }


def _procesar_regla_permanente(texto: str) -> tuple[str, bool]:
    """Procesa una regla permanente: guarda en preferencias/rutinas y devuelve mensaje de confirmación.
    
    Devuelve (mensaje_confirmacion, es_rutina).
    """
    regla = _extraer_regla_permanente(texto)
    if not regla:
        return "", False
    
    if regla["tipo"] == "rutina":
        _guardar_rutina(regla)
        msg = (
            f"✅ Rutina registrada:\n"
            f"  Nombre: {regla['nombre']}\n"
            f"  Disparador: {regla['disparador']}\n"
            f"  Acción: {regla['accion'][:100]}"
        )
        return msg, True
    else:
        _guardar_preferencia(regla["clave"], regla["valor"])
        msg = f"✅ Preferencia guardada: {regla['clave']} = {regla['valor'][:100]}"
        return msg, False


def _responder_con_regla_permanente(texto: str) -> None:
    """Procesa el mensaje como regla permanente y también como petición normal si aplica."""
    # Primero procesar la regla permanente
    msg_confirmacion, es_rutina = _procesar_regla_permanente(texto)
    if msg_confirmacion:
        decir(msg_confirmacion)
    
    # Luego procesar como petición normal (encargo o notebooklm)
    # Esto permite que "recuerda cada día: genera todos los formatos"
    # tanto guarde la rutina COMO ejecute la generación hoy
    # La lógica normal de recibir() seguirá ejecutándose


def registrar_chat_sintesis() -> None:
    """Registra el envío de la síntesis diaria en la cola de la ola SIN1114 para que el enjambre pueda leerlo."""
    try:
        # Usar chat_a1() para obtener la configuración del chat
        config = chat_a1()
        if not config:
            log("No hay configuración de chat A1; omitiendo registro en SIN1114")
            return
        
        # Preparar el registro para la ola SIN1114
        registro = {
            "id": f"{ID_SIN1114}-{int(time.time())}",
            "ola": ID_SIN1114,
            "titulo": f"Síntesis de producción StarSeed {datetime.datetime.now().strftime('%Y-%m-%d')}",
            "archivos": [],
            "depende": [],
            "prompt": "Síntesis diaria completada por el A1 y enviada al bot",
            "origen": "telegram_a1",
            "timestamp": datetime.datetime.now().isoformat(),
            "hechos": ["síntesis_generada", "enviada_telegram"],
            "aprobado": False
        }
        
        # Asegurar que existe el directorio para la cola de la ola
        os.makedirs(os.path.dirname(COLA_SIN1114), exist_ok=True)
        
        # Cargar la cola existente
        cola = leer_json(COLA_SIN1114, [])
        
        # Agregar el registro al final de la cola
        cola.append(registro)
        
        # Escribir la cola actualizada
        escribir_json(COLA_SIN1114, cola)
        
        log(f"Registro de síntesis añadido a cola SIN1114: {registro['id']}")
        
    except Exception as e:
        log(f"Error al registrar la síntesis en SIN1114: {e}")
        traceback.print_exc()


def procesar_sintesis_diaria_hoy() -> dict[str, Any] | None:
    """Procesa la síntesis diaria de hoy (o de ayer si hoy no existe).
    
    Devuelve un dict con la síntesis procesada o None si no existe.
    """
    try:
        # Usar la función ultima_sintesis del módulo notebooklm para obtener la síntesis de hoy
        fid, titulo = ultima_sintesis()
        
        # Extraer la fecha del título
        m = re.match(r".*? (\d{4}-\d{2}-\d{2})", titulo)
        if not m:
            log(f"No se pudo extraer la fecha del título de la síntesis: {titulo}")
            return None
        
        fecha = m.group(1)
        
        # Obtener la fecha de hoy en zona horaria de México (UTC-6)
        mexico_tz = datetime.timezone(datetime.timedelta(hours=-6))
        hoy_mexico = datetime.datetime.now(mexico_tz).date().isoformat()
        ayer_mexico = (datetime.datetime.now(mexico_tz).date() - datetime.timedelta(days=1)).isoformat()
        
        # Solo procesar si la fecha es hoy o ayer en hora de México
        if fecha not in (hoy_mexico, ayer_mexico):
            log(f"Síntesis {fecha} fuera de rango (hoy/ayer México: {hoy_mexico}, {ayer_mexico}), no se procesa")
            return None
        
        # Ahora necesitamos leer la síntesis del cuaderno de NotebookLM
        # El módulo notebooklm ya debería tener cargada la síntesis
        # Si hay un error al cargar, retornar None
        try:
            # Usar json_de para obtener el contenido en formato markdown
            contenido_md = json_de(fid)
            
            # Escribir la síntesis en el repositorio
            ruta_sintesis = os.path.join(DIR, f"sintesis-{fecha}.md")
            os.makedirs(os.path.dirname(ruta_sintesis), exist_ok=True)
            
            with open(ruta_sintesis, "w", encoding="utf-8") as f:
                f.write(f"# Síntesis diaria {fecha}\n\n")
                f.write(f"**Fuente:** {titulo}\n\n")
                f.write(f"**ID de fuente:** {fid}\n\n")
                f.write(f"**Fecha generada:** {datetime.datetime.now().isoformat()}\n\n")
                f.write("## Contenido\n\n")
                f.write(contenido_md)
            
            log(f"Síntesis diaria procesada: {fecha} desde NotebookLM")
            
            return {
                "fecha": fecha,
                "titulo": titulo,
                "fid": fid,
                "ruta": ruta_sintesis,
                "procesada": datetime.datetime.now().isoformat()
            }
            
        except Exception as e:
            log(f"Error al leer o guardar la síntesis de NotebookLM: {e}")
            traceback.print_exc()
            return None
            
    except Exception as e:
        log(f"Error al procesar la síntesis diaria: {e}")
        traceback.print_exc()
        return None


def disparar_multiformato_sintesis(fecha: str) -> dict[str, Any]:
    """Dispara el procesamiento multiformato para una síntesis diaria."""
    try:
        log(f"Disparando multiformato para síntesis {fecha}")
        
        # Importar el módulo de multiformato y disparar el procesamiento
        from sintesis_multiformato import procesar_sintesis_diaria
        
        # Procesar la síntesis en el repositorio
        indice = procesar_sintesis_diaria(fecha)
        
        if indice:
            log(f"Multiformato completado: {indice.get('fecha', fecha)}")
            
            # Registrar el envío del multiformato
            registrar_envio_multiformato(indice)
            
            return {
                "ok": True,
                "indice": indice,
                "mensaje": f"Multiformato completado para {fecha}"
            }
        else:
            return {
                "ok": False,
                "mensaje": f"No se pudo completar el multiformato para {fecha}"
            }
            
    except Exception as e:
        log(f"Error al disparar el multiformato: {e}")
        traceback.print_exc()
        return {
            "ok": False,
            "mensaje": f"Error al disparar el multiformato: {e}"
        }


def registrar_envio_multiformato(indice: dict[str, Any]) -> None:
    """Registra el envío del multiformato en la cola de la ola SIN1114."""
    try:
        log(f"→ multiformato: {indice.get('fecha', '?')}")
        
        # Usar chat_a1() para obtener la configuración del chat
        config = chat_a1()
        if not config:
            log("No hay configuración de chat A1; omitiendo registro de envío de multiformato")
            return
        
        # Preparar el registro para la ola SIN1114
        registro = {
            "id": f"{ID_SIN1114}-multiformato-{int(time.time())}",
            "ola": ID_SIN1114,
            "titulo": f"Multiformato completado: Síntesis diaria {indice.get('fecha', '?')}",
            "archivos": [],
            "depende": [],
            "prompt": "Multiformato completado para la síntesis diaria",
            "origen": "multiformato",
            "timestamp": datetime.datetime.now().isoformat(),
            "hechos": ["multiformato_completado"],
            "aprobado": False
        }
        
        # Asegurar que existe el directorio para la cola de la ola
        os.makedirs(os.path.dirname(COLA_SIN1114), exist_ok=True)
        
        # Cargar la cola existente
        cola = leer_json(COLA_SIN1114, [])
        
        # Agregar el registro al final de la cola
        cola.append(registro)
        
        # Escribir la cola actualizada
        escribir_json(COLA_SIN1114, cola)
        
    except Exception as e:
        log(f"Error al registrar el envío del multiformato: {e}")
        traceback.print_exc()


def revisar_y_disparar_sintesis() -> dict[str, Any]:
    """Revisa si hay nueva síntesis diaria de hoy o de ayer (hora de México) y la dispara."""
    try:
        # Primero intentar procesar la síntesis de hoy
        resultado = procesar_sintesis_diaria_hoy()
        
        if resultado:
            # Si se procesó una síntesis, disparar el multiformato
            disparo = disparar_multiformato_sintesis(resultado["fecha"])
            
            if disparo["ok"]:
                return {
                    "ok": True,
                    "accion": "procesada_y_disparada",
                    "fecha": resultado["fecha"],
                    "indice": disparo["indice"]
                }
            else:
                return {
                    "ok": False,
                    "accion": "procesada_solo",
                    "fecha": resultado["fecha"],
                    "error": disparo["mensaje"]
                }
        else:
            # No hay síntesis que procesar
            log("No hay nueva síntesis para procesar hoy o ayer")
            
            # Registrar la revisión
            registrar_revision("no_nueva_sintesis")
            
            return {
                "ok": True,
                "accion": "sin_sintesis",
                "mensaje": "No hay nueva síntesis para procesar hoy o ayer"
            }
            
    except Exception as e:
        log(f"Error al revisar y disparar la síntesis diaria: {e}")
        traceback.print_exc()
        return {
            "ok": False,
            "accion": "error",
            "error": str(e)
        }


def registrar_revision(accion: str, extras: dict = None) -> None:
    """Registra una revisión en el log para trazabilidad."""
    try:
        registro = {
            "timestamp": datetime.datetime.now().isoformat(),
            "accion": accion,
            "extras": extras or {}
        }
        
        # Escribir el registro en un archivo de log
        ruta_log = os.path.join(DIR, "revisiones.log")
        os.makedirs(os.path.dirname(ruta_log), exist_ok=True)
        
        with open(ruta_log, "a", encoding="utf-8") as f:
            f.write(json.dumps(registro, ensure_ascii=False) + "\n")
            
    except Exception as e:
        log(f"Error al registrar la revisión: {e}")
        traceback.print_exc()


def escuchar() -> None:
    """Escucha los mensajes entrantes y procesa las peticiones."""
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


def recibir(mensaje: dict[str, Any]) -> None:
    """Procesa un mensaje entrante."""
    m = mensaje.get("message") or {}
    if str((m.get("chat") or {}).get("id")) != CHAT_ID:
        log("ignoro un mensaje de otro chat")
        return
    texto = (m.get("text") or m.get("caption") or "").strip()
    if not texto:
        decir("Por ahora atiendo mensajes de texto.")
        return
    
    # Registrar el mensaje entrante
    registrar_mensaje_entrante(mensaje)
    
    # Procesar comandos
    if texto.startswith("/estado"):
        decir(texto_estado(leer_json(COLA, []), leer_json(ESTADO, {}).get("notebooklm", {})))
        return
    if texto.startswith("/renovar "):
        _, sesion = texto.split(" ", 1)
        _comando_renovar(sesion.strip())
        return
    if texto.startswith(("/start", "/ayuda", "/help")):
        decir(texto_ayuda())
        return
    if texto.startswith("/sintesis "):
        _, fecha_str = texto.split(" ", 1)
        _comando_sintesis(fecha_str.strip())
        return
    if texto.startswith("/sintesis_hoy"):
        _comando_sintesis_hoy()
        return
    
    # Procesar como petición normal (regla permanente o normal)
    if _es_peticion_regla_permanente(texto):
        _responder_con_regla_permanente(texto)
        # NO return: continuar para procesar también como petición normal
    
    with bloqueo:
        cola = leer_json(COLA, [])
        if any(p["id"] == mensaje["update_id"] for p in cola):
            return
        cola.append({"id": mensaje["update_id"], "texto": texto, "recibida": time.time(), "estado": "nueva", "intentos": 0})
        escribir_json(COLA, cola[-200:])
    decir("Recibido ✓ Lo atiene MetaGenesis en el A1, sin la Mac ni Claude.")
    hay_trabajo.set()


def registrar_mensaje_entrante(mensaje: dict[str, Any]) -> None:
    """Registra un mensaje entrante para trazabilidad."""
    try:
        m = mensaje.get("message") or {}
        texto = (m.get("text") or m.get("caption") or "").strip()[:90]
        
        log(f"→ telegram: {texto}")
        
    except Exception as e:
        log(f"Error al registrar el mensaje entrante: {e}")
        traceback.print_exc()


def _es_peticion_regla_permanente(texto: str) -> bool:
    """Detecta si el texto pide una regla permanente (recuerda/cada día/siempre/para cada/a partir de ahora)."""
    t = texto.lower()
    return any(p in t for p in ("recuerda", "cada d[ií]a", "diario", "siempre que", "cuando", "al terminar", "despu[eé]s de"))


def _comando_renovar(sesion: str) -> None:
    """Renueva la sesión de NotebookLM."""
    try:
        log(f"Renovando sesión de NotebookLM: {sesion}")
        
        # Intentar renovar la sesión usando el módulo notebooklm
        from peticiones_notebooklm import nb
        
        # Llamar a nb con los argumentos de renovación
        rc, out, err = nb(["auth", "refresh", "--verify"], 180, bloquear=False)
        
        if rc == 0:
            decir(f"Sesión {sesion} renovada con éxito ✓")
        else:
            decir(f"Error al renovar la sesión {sesion}: {err}")
            
    except Exception as e:
        log(f"Error al renovar la sesión: {e}")
        traceback.print_exc()


def _comando_sintesis(fecha: str) -> None:
    """Procesa la síntesis para una fecha específica."""
    try:
        log(f"Procesando la síntesis para la fecha: {fecha}")
        
        # Validar el formato de la fecha
        if not re.match(r"\d{4}-\d{2}-\d{2}", fecha):
            decir(f"Fecha {fecha} inválida. Use el formato YYYY-MM-DD.")
            return
        
        # Procesar la síntesis usando el módulo de NotebookLM
        from sintesis_multiformato import procesar_sintesis_diaria
        
        # Procesar la síntesis
        indice = procesar_sintesis_diaria(fecha)
        
        if indice:
            decir(f"✅ Síntesis {fecha} completada y enviada a Drive")
            
            # Registrar el envío del multiformato
            registrar_envio_multiformato(indice)
        else:
            decir(f"❌ No se encontró la síntesis {fecha} o no hay un título válido.")
            
    except Exception as e:
        log(f"Error al procesar la síntesis para la fecha {fecha}: {e}")
        traceback.print_exc()


def _comando_sintesis_hoy() -> None:
    """Procesa la síntesis de hoy (o de ayer si hoy no existe)."""
    try:
        log("Procesando la síntesis de hoy (o de ayer si hoy no existe)")
        
        # Revisar y disparar la síntesis diaria
        resultado = revisar_y_disparar_sintesis()
        
        if resultado["ok"]:
            if resultado["accion"] == "procesada_y_disparada":
                decir(f"✅ Síntesis {resultado['fecha']} procesada y multiformato disparado")
            elif resultado["accion"] == "procesada_solo":
                decir(f"⚠️ Síntesis {resultado['fecha']} procesada, pero el multiformato falló: {resultado.get('error', 'desconocido')}")
            elif resultado["accion"] == "sin_sintesis":
                decir(f"ℹ {resultado['mensaje']}")
        else:
            decir(f"❌ Error al procesar la síntesis de hoy: {resultado.get('error', 'desconocido')}")
            
    except Exception as e:
        log(f"Error al procesar la síntesis de hoy: {e}")
        traceback.print_exc()


def texto_estado(cola: list[Any], notebooklm: dict[str, Any]) -> str:
    """Devuelve el texto de estado del bot."""
    base = f"Bot de respaldo del A1 en el repo\nSíntesis más reciente: {ultima_sintesis()[1] if ultima_sintesis() else 'Ninguna'}"
    return base


def texto_ayuda() -> str:
    """Devuelve el texto de ayuda."""
    return "Bot de respaldo del A1 en el repo\nComandos disponibles:\n/sintesis_hoy - Procesa la síntesis de hoy (o de ayer si hoy no existe)\n/sintesis YYYY-MM-DD - Procesa la síntesis para una fecha específica\n/estado - Muestra el estado actual\n/renovar notebooklm - Renueva la sesión de NotebookLM"


def main() -> None:
    """Función principal."""
    print("Bot de respaldo del A1 iniciado")
    
    # Verificar si hay un token y un chat ID válidos
    if not TOKEN or not CHAT_ID:
        log("ADVERTENCIA: No hay token de bot o chat ID válidos. El bot no puede funcionar correctamente.")
    
    # Iniciar el bucle de escucha
    escuchar()

if __name__ == "__main__":
    main()
