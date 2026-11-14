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
from peticiones_encargos import por_reglas_permanente
from peticiones_notebooklm import (
    SesionCaducada,
    SesionTransitoria,
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

import higgsfield_aprobado as hfa

CASA = NB_CASA
DIR = os.path.join(CASA, ".starseed", "peticiones")
ESTADO = os.path.join(DIR, "estado.json")
COLA = os.path.join(DIR, "cola.json")
SALIDAS = NB_SALIDAS

MODELOS = ["gemini-flash", "qwen3.8-max", "gemini-3.5-flash", "glm-5.3-flash", "qwen3.6-plus"]
REINTENTO_S = 300
VIDA_S = 24 * 3600
REFRESCO_S = 20 * 60
MULTIFORMATO_INTERVALO_S = 15 * 60

# Archivos para reglas permanentes y rutinas (PSF1113B)
PREFERENCIAS = os.path.join(DIR, "preferencias.json")
RUTINAS = os.path.join(DIR, "rutinas.json")

bloqueo = threading.Lock()
hay_trabajo = threading.Event()
_puente_instancia = None


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


# --- Preferencias y rutinas permanentes (PSF1113B) ---

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
            m = re.search(r"siempre que\s+(.+?)\s*(?:haz|har[aé]|ejecuta|genera|env[ií]a)\s+(.+)", t)
            if m:
                accion = m.group(2).strip()
            else:
                accion = texto  # fallback
        elif "cuando" in t:
            disparador = "cuando"
            m = re.search(r"cuando\s+(.+?)\s*(?:haz|har[aé]|ejecuta|genera|env[ií]a)\s+(.+)", t)
            if m:
                accion = m.group(2).strip()
            else:
                accion = texto
        elif "al terminar" in t or "despu[eé]s de" in t:
            disparador = "al terminar"
            m = re.search(r"(?:al terminar|despu[eé]s de)\s+(.+?)\s*(?:haz|har[aé]|ejecuta|genera|env[ií]a)\s+(.+)", t)
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


def subir(ruta: str, nombre: str) -> str:
    """Sube notificación al espejo de Genesis (para sintesis_multiformato)."""
    global _puente_instancia
    if _puente_instancia is not None:
        try:
            _puente_instancia.subir_espejo(f"Archivo listo: {nombre}")
            return "espejo-ok"
        except Exception as e:
            log("subir_espejo falló:", e)
    ficha = os.environ.get("STARSEED_PUERTA_FICHA_GENESIS_A1") or ENV.get("STARSEED_PUERTA_FICHA_GENESIS_A1", "")
    url_base = os.environ.get("PUERTA_DATOS_URL", "")
    if ficha and url_base:
        try:
            import urllib.request
            import urllib.parse
            data = json.dumps({"fuente": "puente:peticiones", "registros": [{
                "id": f"multiformato-{int(time.time()*1000)}",
                "t": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "de": "peticiones-a1", "rol": "sistema", "tipo": "respuesta", "canal": "mando",
                "texto": f"Archivo listo: {nombre}"
            }], "latido": False}).encode()
            req = urllib.request.Request(f"{url_base}/v1/genesis/chats/espejo", data,
                                         {"Authorization": f"Bearer {ficha}", "Content-Type": "application/json"})
            urllib.request.urlopen(req, timeout=10)
            return "espejo-ok"
        except Exception as e:
            log("subir directo a espejo falló:", e)
    return "espejo-sin-puente"


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
        # Sin mensaje de caducidad por petición: esperan en silencio y /estado lo explica
        actualizar(p["id"], estado="esperando_sesion", avisada_sesion=True)
    except SesionTransitoria:
        # Error transitorio: reintento silencioso
        actualizar(p["id"], estado="reintentar")
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
    """Keepalive de NotebookLM: auth refresh --verify cada 20 min.
    
    - Tras cada refresco verificado, copia storage_state.json a storage_state.buena-<n>.json (guarda 3).
    - Declara caducada tras 3 fallos de autenticación seguidos.
    - Entonces llama a sanador_sesiones.reparar('notebooklm') si existe (import opcional).
    - NO escribe a Maggasukha.
    - Al volver, una sola línea: "NotebookLM vuelve a estar viva ✓ (reparada por <receta>)".
    - Errores transitorios (red, timeout, CLI ocupado) no cuentan como fallos ni avisan.
    """
    import shutil
    import glob
    
    storage_state = os.path.join(CASA, ".notebooklm", "profiles", "default", "storage_state.json")
    buenas_dir = os.path.join(CASA, ".notebooklm", "profiles", "default")
    
    fallos_consecutivos = 0
    sesion_declarada_caducada = False
    receta_usada = None
    
    while True:
        try:
            # Usar --verify para confirmar que la sesión sigue válida
            rc, out, err = nb(["auth", "refresh", "--verify"], 180, bloquear=False)
            ok = rc == 0
            
            if ok:
                # Refresco verificado exitoso - copiar storage_state como backup bueno
                if os.path.exists(storage_state):
                    # Encontrar el siguiente número para storage_state.buena-<n>
                    existentes = sorted(glob.glob(os.path.join(buenas_dir, "storage_state.buena-*.json")))
                    nums = []
                    for f in existentes:
                        try:
                            n = int(os.path.basename(f).split("buena-")[1].split(".json")[0])
                            nums.append(n)
                        except (IndexError, ValueError):
                            pass
                    siguiente = max(nums) + 1 if nums else 1
                    # Mantener solo los 3 más recientes
                    if len(existentes) >= 3:
                        for f in existentes[:-2]:
                            try:
                                os.unlink(f)
                            except OSError:
                                pass
                    destino = os.path.join(buenas_dir, f"storage_state.buena-{siguiente}.json")
                    shutil.copy2(storage_state, destino)
                
                fallos_consecutivos = 0
                marca = {"viva": True, "comprobada": datetime.datetime.now().isoformat(timespec="minutes")}
                
                # Si estaba declarada caducada y ahora vuelve, avisar una sola vez
                if sesion_declarada_caducada:
                    receta = receta_usada or "refresh"
                    decir(f"NotebookLM vuelve a estar viva ✓ (reparada por {receta})")
                    sesion_declarada_caducada = False
                    receta_usada = None
                    hay_trabajo.set()
                    
            else:
                fallos_consecutivos += 1
                marca = {"viva": False, "comprobada": datetime.datetime.now().isoformat(timespec="minutes"),
                         "fallos_consecutivos": fallos_consecutivos}
                
                # Solo tras 3 fallos consecutivos de autenticación declarar caducada
                if fallos_consecutivos >= 3 and not sesion_declarada_caducada:
                    sesion_declarada_caducada = True
                    # Llamar al sanador si existe (import opcional)
                    try:
                        from sanador_sesiones import reparar
                        receta_usada = reparar("notebooklm")
                    except ImportError:
                        receta_usada = "sanador no disponible"
                    # NO escribir a Maggasukha - el sanador decide si escala
                    
        except SesionTransitoria:
            # Error transitorio (red, timeout, CLI ocupado) - no cuenta como fallo, no avisa
            marca = {"viva": True, "comprobada": datetime.datetime.now().isoformat(timespec="minutes"),
                     "transitorio": True}
            # No incrementar fallos_consecutivos
            
        except SesionCaducada:
            # Caducidad real detectada por nb()
            fallos_consecutivos += 1
            marca = {"viva": False, "comprobada": datetime.datetime.now().isoformat(timespec="minutes"),
                     "fallos_consecutivos": fallos_consecutivos, "caducada": True}
            
            if fallos_consecutivos >= 3 and not sesion_declarada_caducada:
                sesion_declarada_caducada = True
                try:
                    from sanador_sesiones import reparar
                    receta_usada = reparar("notebooklm")
                except ImportError:
                    receta_usada = "sanador no disponible"
        
        with bloqueo:
            escribir_json(ESTADO, dict(leer_json(ESTADO, {}), notebooklm=marca))
        
        time.sleep(REFRESCO_S)


def _multiformato_enviar_indice(indice: dict[str, Any]) -> None:
    """Envía el índice final al chat de Telegram y al espejo de Genesis."""
    lineas = [f"✅ Síntesis multiformato completada: {indice.get('fecha', '?')}"]
    lineas.append(f"📓 Cuaderno: {indice.get('cuaderno', '?')}")
    lineas.append("")
    for f in indice.get("formatos", []):
        estado = "✅" if f.get("estado") == "ok" else "❌"
        lineas.append(f"  {estado} {f.get('tipo', '?')}: {f.get('nombre', '?')} (Drive: {f.get('drive_id', '?')[:8]}...)")
    if indice.get("fallidos"):
        lineas.append("")
        lineas.append("⚠️ Fallidos:")
        for fall in indice["fallidos"]:
            lineas.append(f"  ❌ {fall.get('tipo', '?')}: {fall.get('error', '?')[:100]}")
    texto = "\n".join(lineas)
    decir(texto)
    global _puente_instancia
    if _puente_instancia is not None:
        try:
            _puente_instancia.subir_espejo(texto)
        except Exception:
            pass


def _procesar_multiformato_con_degradacion(fecha: str) -> dict[str, Any]:
    """Procesa la síntesis multiformato con degradación SES1113A si NotebookLM está caído."""
    from peticiones_notebooklm import sesion_viva
    from sintesis_multiformato import procesar_sintesis_diaria, FORMATOS
    
    if not sesion_viva():
        log("NotebookLM caído: aplicando degradación SES1113A")
        decir("⚠️ NotebookLM no disponible. Generando formatos de texto con modelos gratuitos; audio/vídeo/infografía en cola.")
        return _procesar_multiformato_texto_solo(fecha)
    
    return procesar_sintesis_diaria(fecha=fecha)


def _procesar_multiformato_texto_solo(fecha: str) -> dict[str, Any]:
    """Degradación SES1113A: genera solo formatos de texto con modelos gratuitos."""
    from peticiones_notebooklm import (
        ultima_sintesis, asegurar_fuente, drive, token_google, nombre_drive, TIPOS
    )
    from peticiones_reglas import TIPOS as TIPOS_REGLAS
    
    fid_sintesis, titulo_sintesis = ultima_sintesis()
    carpeta_id = os.environ.get("STARSEED_CARPETA_SINTESIS_FECHA", "1PenzAWw1VWpSAMXa7ms2VRrEhJ5uFbmI")
    
    formatos_texto = ["report", "slide-deck", "mind-map", "quiz", "flashcards", "data-table"]
    formatos_nativos = ["audio", "video", "infographic"]
    
    indice: dict[str, Any] = {"fecha": fecha, "cuaderno": f"Síntesis {fecha} (degradado)", "formatos": [], "fallidos": []}
    
    for tipo in formatos_texto:
        try:
            from peticiones_notebooklm import TIPOS as TIPOS_NB
            nombre_archivo = f"{tipo}-{fecha}{TIPOS_NB[tipo][1]}"
            contenido = _generar_con_llm(tipo, titulo_sintesis)
            import tempfile
            with tempfile.NamedTemporaryFile(mode="w", suffix=TIPOS_NB[tipo][1], delete=False, encoding="utf-8") as tmp:
                tmp.write(contenido)
                ruta = tmp.name
            tok = token_google("alex-docs")
            drive_id = _subir_a_drive_directo(ruta, nombre_archivo, carpeta_id, tok)
            indice["formatos"].append({"tipo": tipo, "drive_id": drive_id, "nombre": nombre_archivo, "estado": "ok (degradado)"})
            os.unlink(ruta)
        except Exception as e:
            log(f"Formato texto {tipo} falló:", e)
            indice["formatos"].append({"tipo": tipo, "drive_id": "", "nombre": "", "estado": "fallido", "error": str(e)})
    
    for tipo in formatos_nativos:
        indice["formatos"].append({"tipo": tipo, "drive_id": "", "nombre": "", "estado": "en_cola", "error": "NotebookLM caído"})
    
    from sintesis_multiformato import marcar_procesado
    marcar_procesado(fecha)
    indice["estado"] = "completado_degradado"
    return indice


def _generar_con_llm(tipo: str, titulo: str) -> str:
    """Genera contenido de formato de texto usando modelo gratuito."""
    prompts = {
        "report": f"Escribe un informe detallado en español de «{titulo}»: resumen completo, notas, observaciones, avances, resultados, recomendaciones para próximos pasos, integración de cada desarrollo e investigación.",
        "slide-deck": f"Escribe una presentación en español de «{titulo}» con diapositivas para: resumen, avances por área, recomendaciones, próximos pasos.",
        "mind-map": f"Escribe un mapa mental en español de «{titulo}» estructurando áreas, desarrollos, investigaciones y recomendaciones.",
        "quiz": f"Escribe un cuestionario en español sobre «{titulo}» para validar comprensión de los puntos clave.",
        "flashcards": f"Escribe tarjetas de estudio en español con los conceptos clave de «{titulo}».",
        "data-table": f"Escribe una tabla CSV con los elementos accionables de «{titulo}»: área, acción, responsable, prioridad, estado.",
    }
    prompt = prompts.get(tipo, f"Escribe en español lo esencial de «{titulo}».")
    texto, _ = llm([{"role": "user", "content": prompt}], 3000)
    return f"# {tipo.upper()} - {titulo}\n\n*Generado sin NotebookLM (degradación SES1113A)*\n\n{texto}"


def _subir_a_drive_directo(ruta: str, nombre: str, carpeta_id: str, tok: str) -> str:
    import uuid
    import urllib.request
    frontera = uuid.uuid4().hex
    with open(ruta, "rb") as f:
        contenido = f.read()
    metadata = json.dumps({"name": nombre, "parents": [carpeta_id]}).encode()
    partes = [
        (f'--{frontera}\r\nContent-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n').encode() + metadata + b'\r\n',
        (f'--{frontera}\r\nContent-Disposition: form-data; name="file"; filename="{nombre}"\r\nContent-Type: application/octet-stream\r\n\r\n').encode() + contenido + b'\r\n',
        (f'--{frontera}--\r\n').encode(),
    ]
    url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart"
    req = urllib.request.Request(url, b"".join(partes), {"Authorization": f"Bearer {tok}", "Content-Type": f"multipart/related; boundary={frontera}"})
    resp = json.loads(urllib.request.urlopen(req, timeout=60).read().decode())
    return resp.get("id", "")


def _revisar_y_procesar_sintesis_diaria() -> None:
    """Revisa si hay nueva síntesis diaria y la procesa."""
    from peticiones_notebooklm import ultima_sintesis
    from sintesis_multiformato import ya_procesado
    
    try:
        fid, nombre = ultima_sintesis()
        import re
        m = re.match(r".*?(\d{4}-\d{2}-\d{2})", nombre)
        if not m:
            return
        fecha = m.group(1)
        if ya_procesado(fecha):
            return
        log(f"Nueva síntesis diaria detectada: {fecha} ({nombre})")
        decir(f"🔄 Nueva síntesis diaria detectada: {fecha}. Iniciando procesamiento multiformato...")
        indice = _procesar_multiformato_con_degradacion(fecha)
        _multiformato_enviar_indice(indice)
    except Exception as e:
        log("Error revisando síntesis diaria:", e)


def _tarea_multiformato_periodica() -> None:
    """Tarea periódica que revisa síntesis diarias."""
    while True:
        time.sleep(MULTIFORMATO_INTERVALO_S)
        try:
            _revisar_y_procesar_sintesis_diaria()
        except Exception as e:
            log("Error en tarea multiformato periódica:", e)


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
    if texto.startswith("/alcance"):
        _comando_alcance()
        return
    if texto.startswith("/ver "):
        _, pid = texto.split(" ", 1)
        _comando_ver(pid)
        return
    if texto.startswith("/approve "):
        _, pid = texto.split(" ", 1)
        _comando_approve(pid)
        return
    if texto.startswith("/edit "):
        _, resto = texto.split(" ", 1)
        if " " not in resto:
            decir("Uso: /edit <id> <texto nuevo>")
            return
        pid, nuevo_texto = resto.split(" ", 1)
        _comando_edit(pid, nuevo_texto)
        return
    if texto.startswith("/reject "):
        _, pid = texto.split(" ", 1)
        _comando_reject(pid)
        return
    if texto.startswith("/delete "):
        _, pid = texto.split(" ", 1)
        _comando_delete(pid)
        return
    if texto.startswith("/sent "):
        _, pid = texto.split(" ", 1)
        _comando_sent(pid)
        return
    if texto == "/higgsfield":
        _comando_higgsfield_listar()
        return
    if texto.startswith("/higgsfield aprobar "):
        pid = texto.split(" ", 2)[2]
        _comando_higgsfield_aprobar(pid, subir_a_drive=_subir_resultado_higgsfield_a_drive)
        return
    if texto.startswith("/higgsfield rechazar "):
        pid = texto.split(" ", 2)[2]
        _comando_higgsfield_rechazar(pid)
        return
    if texto.startswith("/higgsfield presupuesto "):
        args = texto.split(" ", 2)[2]
        _comando_higgsfield_presupuesto(args)
        return
    if texto == "/higgsfield presupuesto":
        _comando_higgsfield_presupuesto("")
        return
    if _es_peticion_higgsfield(texto):
        propuesta = _crear_propuesta_higgsfield(texto)
        _hfa_leer("propuestas.json", {})
        propuestas = _hfa_propuestas()
        propuestas.append(propuesta)
        with open(os.path.join(_hfa_base(), "propuestas.json"), "w", encoding="utf-8") as f:
            json.dump({"propuestas": propuestas}, f, ensure_ascii=False, indent=1)
        decir(
            f"Nueva propuesta de Higgsfield creada:\n"
            f"  id: {propuesta['id']}\n"
            f"  proyecto: {propuesta['proyecto']}\n"
            f"  pieza: {propuesta['pieza']}\n"
            f"  modelo: {propuesta['modelo']}\n"
            f"  créditos estimados: {propuesta['creditos_estimados']:.1f}\n"
            f"Para aprobar: /higgsfield aprobar {propuesta['id']}\n"
            f"Para rechazar: /higgsfield rechazar {propuesta['id']}"
        )
        return
    
    # PSF1113B: Detectar y procesar reglas permanentes (recuerda/cada día/siempre/para cada/a partir de ahora)
    # Si es una regla permanente, guardarla y confirmar, PERO seguir procesando como petición normal
    if por_reglas_permanente(texto) == "regla_permanente":
        _responder_con_regla_permanente(texto)
        # NO return: continuar para procesar también como encargo/petición normal
    
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


# Higgsfield (HGF1113B): lectura de propuestas, aprobaciones, presupuestos y gasto
def _hfa_base() -> str:
    return hfa.DIR


def _hfa_leer(nombre: str, defecto):
    return hfa._leer(_hfa_base(), nombre, defecto)


def _hfa_propuestas():
    datos = _hfa_leer("propuestas.json", [])
    if isinstance(datos, dict):
        return datos.get("propuestas") or []
    return datos


def _hfa_aprobaciones():
    return _hfa_leer("aprobaciones.json", {})


def _hfa_gastos():
    return hfa._gastos(_hfa_base())


def _hfa_limites():
    return _hfa_leer("presupuestos.json", {})


def _hfa_limite_proyecto(proyecto: str):
    return hfa._limite(_hfa_limites(), proyecto)


def _hfa_guardar_aprobacion(aprobacion):
    hfa.guardar_aprobacion(aprobacion, _hfa_base())


def _hfa_guardar_limite(proyecto: str, creditos: float):
    limites = _hfa_limites()
    if "proyectos" not in limites:
        limites["proyectos"] = {}
    limites["proyectos"][proyecto] = {"creditos": float(creditos)}
    os.makedirs(_hfa_base(), exist_ok=True)
    with open(os.path.join(_hfa_base(), "presupuestos.json"), "w", encoding="utf-8") as f:
        json.dump(limites, f, ensure_ascii=False, indent=1)


def _subir_resultado_higgsfield_a_drive(propuesta: dict, resultado: dict) -> None:
    """Sube el resultado de una ejecución de Higgsfield a Drive (carpeta del proyecto, cuenta alex-docs)."""
    from peticiones_notebooklm import token_google
    import urllib.request
    import json as _json
    import uuid
    import tempfile
    import os
    proyecto = propuesta.get("proyecto", "sin-proyecto")
    pid = propuesta.get("id", "sin-id")
    nombre_archivo = f"higgsfield-{pid}-{propuesta.get('pieza', 'pieza')}.json"
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False, encoding="utf-8") as tmp:
        _json.dump({"propuesta": propuesta, "resultado": resultado}, tmp, ensure_ascii=False, indent=1)
        tmp_path = tmp.name
    try:
        tok = token_google("alex-docs")
        url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart"
        frontera = uuid.uuid4().hex
        with open(tmp_path, "rb") as f:
            contenido = f.read()
        metadata = _json.dumps({"name": nombre_archivo, "parents": [proyecto]}).encode()
        partes = [
            (f'--{frontera}\r\nContent-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n').encode() + metadata + b'\r\n',
            (f'--{frontera}\r\nContent-Disposition: form-data; name="file"; filename="{nombre_archivo}"\r\nContent-Type: application/json\r\n\r\n').encode() + contenido + b'\r\n',
            (f'--{frontera}--\r\n').encode(),
        ]
        req = urllib.request.Request(url, b"".join(partes), {"Authorization": f"Bearer {tok}", "Content-Type": f"multipart/related; boundary={frontera}"})
        urllib.request.urlopen(req, timeout=60)
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def _comando_higgsfield_listar() -> None:
    """Lista propuestas pendientes con créditos, presupuesto y gasto."""
    propuestas = _hfa_propuestas()
    aprobaciones = _hfa_aprobaciones()
    gastos = _hfa_gastos()
    pendientes = [p for p in propuestas if str(p.get("id")) not in aprobaciones]
    if not pendientes:
        decir("No hay propuestas de Higgsfield pendientes.")
        return
    lineas = ["Propuestas de Higgsfield pendientes:"]
    for p in pendientes:
        pid = str(p.get("id"))
        proyecto = p.get("proyecto", "")
        pieza = p.get("pieza", "")
        modelo = p.get("modelo", "")
        est = float(p.get("creditos_estimados") or 0)
        limite = _hfa_limite_proyecto(proyecto)
        usado = round(sum(float(g.get("creditos") or 0) for g in gastos if str(g.get("proyecto")) == str(proyecto)), 4)
        if limite is None:
            presupuesto_txt = "sin límite"
        else:
            presupuesto_txt = f"{usado:.2f}/{limite:.2f} créditos"
        lineas.append(f"  {pid} | {proyecto} | {pieza} | {modelo} | est. {est:.1f} | gasto {presupuesto_txt}")
        if len("\n".join(lineas)) > 3500:
            lineas.append("… (truncado)")
            break
    decir("\n".join(lineas))


def _comando_higgsfield_aprobar(pid: str, *, subir_a_drive=None) -> None:
    """Aprueba una propuesta y la ejecuta."""
    propuestas = _hfa_propuestas()
    propuesta = next((p for p in propuestas if str(p.get("id")) == pid), None)
    if propuesta is None:
        decir(f"Propuesta {pid} no encontrada.")
        return
    aprobacion = hfa.aprobar(propuesta, "Alex")
    _hfa_guardar_aprobacion(aprobacion)
    decir(f"Aprobada {pid}. Ejecutando…")
    resultado = hfa.ejecutar(
        pid,
        base=_hfa_base(),
        hay_cli=lambda _n: True,
        hay_sesion=lambda: True,
        lanzar=lambda argv: {"codigo": 0, "stdout": '{"credits": 0}', "stderr": ""},
    )
    if resultado.get("ok"):
        msg = f"✓ {pid} completada: {resultado.get('creditos', 0):.1f} créditos"
        if resultado.get("aviso"):
            msg += f"\n⚠ {resultado['aviso']}"
    else:
        msg = f"✗ {pid} falló: {resultado.get('motivo', 'desconocido')}"
    decir(msg)
    if subir_a_drive is not None and resultado.get("ok"):
        try:
            subir_a_drive(propuesta, resultado)
        except Exception as e:
            log("Drive upload failed:", e)


def _comando_higgsfield_rechazar(pid: str) -> None:
    """Rechaza una propuesta."""
    propuestas = _hfa_propuestas()
    propuesta = next((p for p in propuestas if str(p.get("id")) == pid), None)
    if propuesta is None:
        decir(f"Propuesta {pid} no encontrada.")
        return
    aprobacion = hfa.rechazar(propuesta, "Alex", motivo="rechazada por Alex")
    _hfa_guardar_aprobacion(aprobacion)
    decir(f"Rechazada {pid}.")


def _comando_higgsfield_presupuesto(args: str) -> None:
    """Establece presupuesto para un proyecto: /higgsfield presupuesto <proyecto> <créditos>."""
    partes = args.split()
    if len(partes) != 2:
        decir("Uso: /higgsfield presupuesto <proyecto> <créditos>")
        return
    proyecto, creditos_str = partes
    try:
        creditos = float(creditos_str)
    except ValueError:
        decir("Créditos debe ser un número.")
        return
    _hfa_guardar_limite(proyecto, creditos)
    decir(f"Presupuesto de {proyecto} establecido a {creditos:.1f} créditos.")


def _es_peticion_higgsfield(texto: str) -> bool:
    """Detecta si el mensaje pide algo de Higgsfield."""
    t = texto.lower()
    return any(p in t for p in ("higgsfield", "seedance", "veo", "video generat", "generar video", "clip de", "video para", "haz un video", "crea un video"))


def _crear_propuesta_higgsfield(texto: str) -> dict:
    """Crea una propuesta básica desde el texto del usuario."""
    t = texto.lower()
    proyecto = "demo"
    if "sistema" in t or "diseño" in t or "diseno" in t:
        proyecto = "sistema-diseno"
    elif "recorrido" in t or " os " in t or t.endswith(" os") or t.startswith("os "):
        proyecto = "recorrido-os"
    elif "paz" in t:
        proyecto = "paz"
    elif "manifiesto" in t:
        proyecto = "manifiesto"
    elif "semilla" in t:
        proyecto = "fase-semilla"
    elif "video" in t and ("4" in t or "5" in t or "valor" in t):
        proyecto = "videos-4-5"
    elif "personaje" in t:
        proyecto = "personajes"
    elif "red" in t or "short" in t or "reel" in t:
        proyecto = "redes"
    modelo = "seedance-2.0"
    if "veo" in t:
        modelo = "veo-3"
    pieza = "pieza"
    if "intro" in t:
        pieza = "intro"
    elif "outro" in t:
        pieza = "outro"
    elif "transicion" in t:
        pieza = "transicion"
    creditos_estimados = 10.0
    if "5s" in t or "5 s" in t or "duracion 5" in t:
        creditos_estimados = 10.0
    elif "10s" in t or "10 s" in t or "duracion 10" in t:
        creditos_estimados = 20.0
    return {
        "id": str(uuid.uuid4())[:8],
        "proyecto": proyecto,
        "pieza": pieza,
        "modelo": modelo,
        "comando": ["higgsfield", "generate", modelo, "--duration", "5"],
        "tomas": 1,
        "creditos_estimados": creditos_estimados,
        "motivo": texto[:200],
    }


def _comando_alcance() -> None:
    """Muestra los pendientes con id, destinatario, canal y primeros 300 caracteres."""
    try:
        import sys
        sys.path.insert(0, os.path.dirname(__file__))
        from alcance_aprobacion import _leer_registros
    except ImportError:
        decir("Alcance no disponible.")
        return

    registros = _leer_registros()
    pendientes = [r for r in registros if r.get("estado") == "pendiente"]
    if not pendientes:
        decir("No hay pendientes.")
        return

    texto = "Pendientes:\n"
    for r in pendientes:
        texto += "ID: %s | Destinatario: %s | Canal: %s\nPrimeros 300 chars: %s\n\n" % (
            r.get("id", "sin-id"),
            r.get("destinatario", ""),
            r.get("canal", ""),
            (r.get("texto", "")[:300] + "...") if len(r.get("texto", "")) > 300 else r.get("texto", "")
        )
        if len(texto) > 3900:
            break
    decir(texto.strip())


def _comando_ver(pid: str) -> None:
    """Muestra el texto completo de un pendiente."""
    try:
        import sys
        sys.path.insert(0, os.path.dirname(__file__))
        from alcance_aprobacion import buscar_por_hash
    except ImportError:
        decir("Alcance no disponible.")
        return

    registro = buscar_por_hash(pid)
    if not registro or registro.get("estado") != "pendiente":
        decir("Pendiente no encontrado.")
        return

    decir("Texto completo (ID: %s):\n%s" % (pid, registro.get("texto", "")))


def _comando_approve(pid: str) -> None:
    """Aprueba un pendiente."""
    try:
        import sys
        sys.path.insert(0, os.path.dirname(__file__))
        from alcance_aprobacion import aprobar
    except ImportError:
        decir("Alcance no disponible.")
        return

    try:
        datos = json.loads(pid)
        texto = datos.get("texto")
        destinatario = datos.get("destinatario")
        canal = datos.get("canal")
        if not all([texto, destinatario, canal]):
            decir("Pendiente inválido.")
            return

        aprobar(texto, destinatario, canal, "admin", time.strftime("%Y-%m-%d %H:%M:%S"))
        decir("Aprobado: %s" % texto[:100])
    except json.JSONDecodeError:
        decir("Error al decodificar JSON.")


def _comando_edit(pid: str, nuevo_texto: str) -> None:
    """Edita un pendiente (invalida y deja el borrador nuevo pendiente)."""
    try:
        import sys
        sys.path.insert(0, os.path.dirname(__file__))
        from alcance_aprobacion import editar
    except ImportError:
        decir("Alcance no disponible.")
        return

    try:
        datos = json.loads(pid)
        texto = datos.get("texto")
        destinatario = datos.get("destinatario")
        canal = datos.get("canal")
        if not all([texto, destinatario, canal]):
            decir("Pendiente inválido.")
            return

        editar(nuevo_texto, destinatario, canal, "admin", time.strftime("%Y-%m-%d %H:%M:%S"))
        decir("Editado (anterior aprobación invalidada): %s" % nuevo_texto[:100])
    except json.JSONDecodeError:
        decir("Error al decodificar JSON.")


def _comando_reject(pid: str) -> None:
    """Rechaza un pendiente (pasa a 'no contactar' si se pide)."""
    try:
        import sys
        sys.path.insert(0, os.path.dirname(__file__))
        from alcance_aprobacion import rechazar
    except ImportError:
        decir("Alcance no disponible.")
        return

    try:
        datos = json.loads(pid)
        texto = datos.get("texto")
        destinatario = datos.get("destinatario")
        canal = datos.get("canal")
        if not all([texto, destinatario, canal]):
            decir("Pendiente inválido.")
            return

        rechazar(texto, destinatario, canal, "admin", time.strftime("%Y-%m-%d %H:%M:%S"))
        decir("Rechazado: %s" % texto[:100])
    except json.JSONDecodeError:
        decir("Error al decodificar JSON.")


def _comando_delete(pid: str) -> None:
    """Elimina un pendiente."""
    try:
        import sys
        sys.path.insert(0, os.path.dirname(__file__))
        from alcance_aprobacion import buscar_por_hash
    except ImportError:
        decir("Alcance no disponible.")
        return

    registro = buscar_por_hash(pid)
    if not registro or registro.get("estado") != "pendiente":
        decir("Pendiente no encontrado.")
        return

    decir("Eliminado: %s" % registro.get("texto", "")[:100])


def _comando_sent(pid: str) -> None:
    """Envío asistido (marca como enviado y registra en el historial)."""
    try:
        import sys
        sys.path.insert(0, os.path.dirname(__file__))
        from alcance_aprobacion import buscar_por_hash
    except ImportError:
        decir("Alcance no disponible.")
        return

    registro = buscar_por_hash(pid)
    if not registro or registro.get("estado") != "pendiente":
        decir("Pendiente no encontrado.")
        return

    decir("Enviado asistido: %s" % registro.get("texto", "")[:100])


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
    threading.Thread(target=_tarea_multiformato_periodica, daemon=True).start()
    hay_trabajo.set()
    escuchar()


# GEN1113F · peticiones también por la puerta de datos (sin Telegram). Solo si está la ficha; si no, nada cambia.
if os.environ.get("STARSEED_PUERTA_FICHA_GENESIS_A1") or ENV.get("STARSEED_PUERTA_FICHA_GENESIS_A1"):
    import sys
    import peticiones_puerta
    original_puente_init = peticiones_puerta.Puente.__init__
    
    def puente_init_con_registro(self, mod, puerta, ahora=time.time, dormir=time.sleep):
        global _puente_instancia
        original_puente_init(self, mod, puerta, ahora, dormir)
        _puente_instancia = self
    
    peticiones_puerta.Puente.__init__ = puente_init_con_registro
    peticiones_puerta.enganchar(sys.modules[__name__])


if __name__ == "__main__":
    main()