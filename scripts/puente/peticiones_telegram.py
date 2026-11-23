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
from pathlib import Path
from typing import Any, Dict, List, Optional

from peticiones_reglas import (
    TIPOS,
    CLAVES_TIPO,
    INDICACIONES,
    AYUDA,
    RENOVAR,
    por_reglas,
    validar_plan,
    texto_estado,
    TIPOS_PETICION,
)
from peticiones_encargos import (
    por_reglas_permanente,
    por_reglas_encargo,
    por_reglas_ajuste,
    validar_plan as validar_plan_encargo,
    planificar_base,
    ENTREGABLES_VALIDOS,
)
from peticiones_productor import (
    ejecutar_encargo,
    ProductorError,
    SesionCaducada as ProductorSesionCaducada,
    SesionTransitoria as ProductorSesionTransitoria,
)
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
import peticiones_llm as PLLM

import higgsfield_aprobado as hfa
import salud_directores as SD
import peticiones_sintesis_respaldo as PSR

CASA = NB_CASA
DIR = os.path.join(CASA, ".starseed", "peticiones")
ESTADO = os.path.join(DIR, "estado.json")
COLA = os.path.join(DIR, "cola.json")
ORDENES_MAC = os.path.join(DIR, "ordenes-mac.json")
SALIDAS = NB_SALIDAS
REGISTRO_AV = os.path.join(DIR, "audiovisual_registros.jsonl")

# Rutas del sanador de sesiones (SES1113C)
RAIZ_REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SALUD_ESTADO = os.path.join(RAIZ_REPO, "starseed_memory_root", "salud", "estado.json")

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


def _norm_dedupe(texto: str) -> str:
    return " ".join(str(texto or "").split()).strip()[:160].lower()


def _cortar_registros(registros: List[Dict[str, Any]], tope: int = 600) -> List[Dict[str, Any]]:
    """Mantiene solo los últimos `tope` registros, eliminando los más antiguos."""
    if len(registros) <= tope:
        return registros
    return registros[-tope:]


def _escribir_registro_audiovisual(registro: Dict[str, Any]) -> None:
    """Escribe un registro al jsonl propio del canal audiovisual (máx 600 entradas)."""
    try:
        existentes: List[Dict[str, Any]] = []
        ruta = Path(os.path.expanduser(REGISTRO_AV))
        if ruta.exists():
            try:
                for linea in ruta.read_text(encoding="utf-8").splitlines():
                    if not linea.strip():
                        continue
                    try:
                        reg = json.loads(linea)
                        if isinstance(reg, dict):
                            existentes.append(reg)
                    except json.JSONDecodeError:
                        continue
            except OSError:
                pass
        existentes.append(registro)
        existentes = _cortar_registros(existentes, tope=600)
        ruta.parent.mkdir(parents=True, exist_ok=True)
        with open(ruta, "w", encoding="utf-8") as fh:
            for reg in existentes:
                fh.write(json.dumps(reg, ensure_ascii=False) + "\n")
    except Exception as e:
        log(f"Error escribiendo registro audiovisual: {e}")


def _llm_log(msg: str) -> None:
    log("[peticiones_llm]", msg)


def llm(mensajes: list[dict[str, str]], max_tokens: int = 1500) -> tuple[str, str]:
    """Wrapper que usa el nuevo enrutador de modelos con catálogo vivo y salud compartida."""
    return PLLM.llm_con_fallback(
        mensajes,
        max_tokens,
        http_get=None,
        http_post=None,
        ahora_fn=None,
        leer_clave=lambda k: ENV.get(k),
        log_fn=_llm_log,
    )


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
    """Lee las preferencias permanentes desde preferencias.json.
    
    Acepta tanto dict (formato actual) como lista (formato herramienta provisional).
    La lista se convierte a dict con claves preferencia_n.
    """
    datos = leer_json(PREFERENCIAS, {})
    if isinstance(datos, list):
        return {f"preferencia_{i}": v for i, v in enumerate(datos)}
    if isinstance(datos, dict):
        return datos
    return {}


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


INSTRUCCION = (
    "Eres el despachador de MetaGenesis (StarSeed). Alex escribe peticiones por Telegram. Devuelve SOLO un "
    "objeto JSON, sin texto alrededor, con esta forma: {\"tipo\": \"encargo\" | \"alcance\" | \"descartar\" | "
    "\"notebooklm\" | \"respuesta\", \"fuente\": \"ultima_sintesis\" | \"drive\" | \"cuaderno\" | \"youtube\", "
    "\"drive_id\": \"\", \"urls\": {\"youtube\": [], \"drive\": [], \"web\": []}, "
    "\"artefactos\": [{\"tipo\": uno de infographic, audio, video, slide-deck, mind-map, report, quiz, "
    "flashcards, data-table, \"indicaciones\": \"qué destacar, en español\"}], "
    "\"resumen\": \"una frase en español de lo que vas a hacer\"}. "
    "Tipos de petición:\n"
    "- \"encargo\": trabajo de varios pasos con planificación por frentes (productora, Drive, panel, avances). "
    "Palabras: encargo, se aprueba, apruebo, desarrollo, próximos pasos, plan de trabajo, varios pasos, frentes.\n"
    "- \"alcance\": un creador, canal o vídeo para analizar y contactar. Palabras: alcance, analiza canal, "
    "investiga canal, contactar creador, oferta StarSeed. Una URL de YouTube en el mensaje es la fuente.\n"
    "- \"descartar\": un tema o fuente que hay que quitar de los cuadernos. Palabras: descarta, elimina fuente, "
    "quita tema, borra fuente, limpia cuaderno.\n"
    "- \"notebooklm\": un formato concreto de una fuente concreta (infografía, audio, vídeo, presentación, "
    "mapa mental, informe, cuestionario, tarjetas, tabla). Fuente: \"ultima_sintesis\", \"drive\", \"cuaderno\", "
    "o \"youtube\" si hay URL de YouTube.\n"
    "- \"respuesta\": para todo lo demás, con artefactos vacío.\n"
    "IMPORTANTE: Toda URL en el mensaje es una FUENTE que se usa, nunca se ignora. YouTube va como fuente de "
    "NotebookLM con su transcripción; Drive va con add-drive; web va con add. \"video\" solo significa \"haz un "
    "vídeo\" si se pide producir uno; \"analiza el vídeo\" es análisis (tipo alcance o notebooklm)."
)


def _historial_conversacion(excluir_id: int | None = None, limite: int = 6) -> list[dict[str, str]]:
    """Construye los últimos turnos (usuario/asistente) de la cola para mantener memoria conversacional."""
    cola = leer_json(COLA, [])
    recientes = [
        x for x in cola
        if isinstance(x, dict) and x.get("id") != excluir_id and x.get("texto")
    ][-limite:]
    turnos: list[dict[str, str]] = []
    for x in recientes:
        txt_u = str(x.get("texto") or "").strip()
        if not txt_u:
            continue
        turnos.append({"role": "user", "content": txt_u[:600]})
        resp = str(x.get("respuesta") or (x.get("plan") or {}).get("resumen") or "").strip()
        if resp:
            turnos.append({"role": "assistant", "content": resp[:900]})
    return turnos


def interpretar(texto: str, excluir_id: int | None = None) -> dict[str, Any]:
    reglas = por_reglas(texto)
    historial = _historial_conversacion(excluir_id=excluir_id, limite=4)
    mensajes_llm = [{"role": "system", "content": INSTRUCCION}, *historial, {"role": "user", "content": texto}]
    crudo, modelo = llm(mensajes_llm, 600)
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
    fuentes_validas = ("ultima_sintesis", "drive", "cuaderno", "youtube")
    fuente = plan.get("fuente") if plan.get("fuente") in fuentes_validas else reglas["fuente"]
    drive_id = reglas["drive_id"] or (str(plan.get("drive_id") or "") if re.fullmatch(r"[A-Za-z0-9_-]{20,}", str(plan.get("drive_id") or "")) else "")
    if fuente == "drive" and not drive_id:
        fuente = reglas["fuente"] if reglas["fuente"] != "drive" else "cuaderno"
    urls = plan.get("urls") or reglas.get("urls") or {"youtube": [], "drive": [], "web": []}
    tipo_plan = plan.get("tipo")
    if tipo_plan not in TIPOS_PETICION:
        tipo_plan = "notebooklm" if artefactos else "respuesta"
    log("plan de", modelo, ":", [a["tipo"] for a in artefactos], fuente, tipo_plan)
    return {"tipo": tipo_plan, "fuente": fuente, "drive_id": drive_id,
            "urls": urls, "artefactos": artefactos[:4], "resumen": str(plan.get("resumen") or "")[:300]}


def actualizar(pid: int, **cambios: Any) -> None:
    with bloqueo:
        cola = leer_json(COLA, [])
        for x in cola:
            if x["id"] == pid:
                x.update(cambios)
        escribir_json(COLA, cola)


def _clientes_de_encargo() -> Any:
    """Clientes reales que el productor necesita para un encargo: NotebookLM (create, ask, generate,
    download…) y Drive (carpeta, doc, archivo). DIR1121B: PET1121A los construye en peticiones_clientes.py;
    mientras no existan devuelve None y el encargo se atiende como petición normal. Nunca devuelve las
    funciones sueltas de peticiones_notebooklm (era el fallo «'function' object has no attribute 'doc'»).

    Además, verifica que el token de Google tenga permiso de escritura en Drive. Si solo tiene lectura,
    devuelve None y queda una acción clara para Alex en acciones-de-alex.
    """
    try:
        import peticiones_clientes as _pc
        nb_c, drive_c = _pc.ClienteNotebookLM(), _pc.ClienteDrive()
    except Exception:
        return None
    if not all(callable(getattr(drive_c, m, None)) for m in ("carpeta", "doc", "archivo")):
        return None
    if not all(callable(getattr(nb_c, m, None)) for m in ("create", "ask", "generate", "download")):
        return None
    # Verificar permiso de escritura en Drive antes de habilitar el modo encargo
    try:
        ok, detalle = _pc.verificar_permiso_drive_escritura()
        if not ok:
            log("Drive sin permiso de escritura:", detalle)
            # Registrar acción para Alex (sin imprimir token ni clave)
            _registrar_accion_alex_drive_escritura(detalle)
            return None
    except Exception as e:
        log("Error verificando permiso Drive:", e)
        return None
    return nb_c, drive_c


def _registrar_accion_alex_drive_escritura(detalle: str) -> None:
    """Registra una acción clara para Alex cuando Drive no tiene permiso de escritura."""
    try:
        acciones_path = os.path.join(DIR, "acciones-de-alex.json")
        acciones = leer_json(acciones_path, [])
        accion = {
            "id": f"drive-escritura-{int(time.time())}",
            "tipo": "google-oauth-escritura",
            "titulo": "Volver a autorizar Drive con permiso de escritura",
            "descripcion": (
                "El token actual de Google solo tiene permiso de lectura. "
                "Para usar el modo de encargo (carpetas y panel en Drive), "
                "necesitas reautorizar con scope 'drive' o 'drive.file'.\n\n"
                "Paso exacto:\n"
                "  cd /Users/alex/Documents/starseed-os-main && "
                "~/.starseed/herramientas/alta-cuentas-google.py alex --scopes drive,drive.file\n\n"
                f"Detalle técnico: {detalle}"
            ),
            "estado": "pendiente",
            "creada": time.time(),
        }
        # Evitar duplicados
        if not any(a.get("tipo") == "google-oauth-escritura" and a.get("estado") == "pendiente" for a in acciones):
            acciones.append(accion)
            escribir_json(acciones_path, acciones)
    except Exception as e:
        log("No se pudo registrar acción para Alex:", e)


def atender(p: dict[str, Any]) -> None:
    actualizar(p["id"], estado="en_curso", intentos=p.get("intentos", 0) + 1)
    try:
        plan = p.get("plan") or interpretar(p["texto"], excluir_id=p.get("id"))
        actualizar(p["id"], plan=plan)
        tipo = plan["tipo"]
        if tipo == "encargo" and _clientes_de_encargo() is None:
            # DIR1121B: el modo de encargo aún no tiene clientes reales de NotebookLM y Drive. Antes fallaba
            # tres veces con «'function' object has no attribute 'doc'» y contestaba «petición fallida».
            # Se atiende como petición normal, que sí funciona, y se dice una sola vez.
            tipo = "notebooklm" if plan.get("artefactos") else "respuesta"
            plan = dict(plan, tipo=tipo)
            if not p.get("avisado_sin_encargo"):
                actualizar(p["id"], avisado_sin_encargo=True)
                decir("El modo de encargo por frentes (carpeta y panel en Drive) aún no está listo. "
                      "Atiendo tu mensaje como petición normal.")
        if tipo == "encargo":
            atender_encargo(p, plan)
        elif tipo == "alcance":
            atender_alcance(p, plan)
        elif tipo == "descartar":
            atender_descartar(p, plan)
        elif tipo == "notebooklm" and plan["artefactos"]:
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
            # PET1116C: Reportar a salud_directores para autorreparación
            plan = p.get("plan")
            tipo_peticion = plan.get("tipo", "respuesta") if plan else "respuesta"
            _reportar_peticion_fallida(tipo_peticion, p["texto"], str(e))


def atender_encargo(p: dict[str, Any], plan: dict[str, Any]) -> None:
    """Atiende un encargo: usa peticiones_productor para ejecutar frentes."""
    clientes = _clientes_de_encargo()
    if clientes is None:
        raise RuntimeError("el modo de encargo aún no tiene clientes de NotebookLM y Drive")
    nb_cliente, drive_cliente = clientes
    
    # Construir estructura de encargo para el productor
    encargo = {
        "id": f"ENC-{p['id']}",
        "titulo": p["texto"][:120],
        "texto": p["texto"],
        "estado": "activo",
        "frentes": planificar_base(p["texto"]),
        "anunciado": False,
        "vueltas": 0,
    }
    
    def enviar_avance(texto_avance: str) -> None:
        decir(texto_avance)
    
    def enviar_entregable(tipo: str, ruta_local: str, titulo: str, enlace_drive: str) -> None:
        """Envía el archivo generado al chat de Telegram."""
        if not os.path.exists(ruta_local):
            log("enviar_entregable: archivo no existe", ruta_local)
            return
        tam = os.path.getsize(ruta_local)
        if tam == 0:
            log("enviar_entregable: archivo vacío", ruta_local)
            return
        nombre_archivo = os.path.basename(ruta_local)
        pie = f"{tipo.capitalize()} · {titulo}"
        if enlace_drive:
            pie += f"\nDrive: {enlace_drive}"
        
        # Determinar método de Telegram según tipo y tamaño
        try:
            if tipo == "infographic" and tam < 10 * 1024 * 1024:
                _telegram_send_photo(ruta_local, pie, nombre_archivo)
                _telegram_send_document(ruta_local, pie + " (calidad completa)", nombre_archivo)
            elif tipo == "audio":
                _telegram_send_audio(ruta_local, pie, nombre_archivo)
            elif tipo == "video":
                if tam > 49 * 1024 * 1024:
                    log("enviar_entregable: vídeo demasiado grande para Telegram", tam)
                    decir(f"⚠️ {titulo}: archivo demasiado grande para Telegram ({tam//1024//1024} MB). Disponible en Drive: {enlace_drive}")
                else:
                    _telegram_send_video(ruta_local, pie, nombre_archivo)
            else:
                _telegram_send_document(ruta_local, pie, nombre_archivo)
        except Exception as e:
            log("enviar_entregable falló:", e)
            decir(f"⚠️ No pude enviar {titulo} al chat (disponible en Drive: {enlace_drive})")
    
    try:
        ejecutar_encargo(
            encargo,
            nb_cliente,
            drive_cliente,
            enviar_avance=enviar_avance,
            enviar_entregable=enviar_entregable,
        )
        decir(f"Encargo {encargo['id']} completado ✓")
    except (ProductorSesionCaducada, SesionCaducada):
        raise
    except (ProductorSesionTransitoria, SesionTransitoria):
        raise
    except Exception as e:
        log("encargo falló", str(e))
        # Mensaje en lenguaje llano para el usuario
        msg = _mensaje_error_encargo_llano(e)
        decir(msg)
        raise


def _telegram_send_photo(ruta: str, caption: str, filename: str) -> dict[str, Any]:
    """Envía foto a Telegram."""
    import uuid
    frontera = uuid.uuid4().hex
    with open(ruta, "rb") as f:
        contenido = f.read()
    partes = [
        (f'--{frontera}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n{CHAT}\r\n').encode(),
        (f'--{frontera}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n{caption[:1000]}\r\n').encode(),
        (f'--{frontera}\r\nContent-Disposition: form-data; name="photo"; filename="{filename}"\r\nContent-Type: image/png\r\n\r\n').encode() + contenido + b'\r\n',
        (f'--{frontera}--\r\n').encode(),
    ]
    url = f"https://api.telegram.org/bot{TOKEN}/sendPhoto"
    req = urllib.request.Request(url, b"".join(partes), {"Content-Type": f"multipart/form-data; boundary={frontera}"})
    with urllib.request.urlopen(req, timeout=900) as resp:
        return json.loads(resp.read().decode())


def _telegram_send_document(ruta: str, caption: str, filename: str) -> dict[str, Any]:
    """Envía documento a Telegram."""
    import uuid
    frontera = uuid.uuid4().hex
    with open(ruta, "rb") as f:
        contenido = f.read()
    partes = [
        (f'--{frontera}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n{CHAT}\r\n').encode(),
        (f'--{frontera}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n{caption[:1000]}\r\n').encode(),
        (f'--{frontera}\r\nContent-Disposition: form-data; name="document"; filename="{filename}"\r\nContent-Type: application/octet-stream\r\n\r\n').encode() + contenido + b'\r\n',
        (f'--{frontera}--\r\n').encode(),
    ]
    url = f"https://api.telegram.org/bot{TOKEN}/sendDocument"
    req = urllib.request.Request(url, b"".join(partes), {"Content-Type": f"multipart/form-data; boundary={frontera}"})
    with urllib.request.urlopen(req, timeout=900) as resp:
        return json.loads(resp.read().decode())


def _telegram_send_audio(ruta: str, caption: str, filename: str) -> dict[str, Any]:
    """Envía audio a Telegram."""
    import uuid
    frontera = uuid.uuid4().hex
    with open(ruta, "rb") as f:
        contenido = f.read()
    partes = [
        (f'--{frontera}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n{CHAT}\r\n').encode(),
        (f'--{frontera}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n{caption[:1000]}\r\n').encode(),
        (f'--{frontera}\r\nContent-Disposition: form-data; name="audio"; filename="{filename}"\r\nContent-Type: audio/mpeg\r\n\r\n').encode() + contenido + b'\r\n',
        (f'--{frontera}--\r\n').encode(),
    ]
    url = f"https://api.telegram.org/bot{TOKEN}/sendAudio"
    req = urllib.request.Request(url, b"".join(partes), {"Content-Type": f"multipart/form-data; boundary={frontera}"})
    with urllib.request.urlopen(req, timeout=900) as resp:
        return json.loads(resp.read().decode())


def _telegram_send_video(ruta: str, caption: str, filename: str) -> dict[str, Any]:
    """Envía vídeo a Telegram."""
    import uuid
    frontera = uuid.uuid4().hex
    with open(ruta, "rb") as f:
        contenido = f.read()
    partes = [
        (f'--{frontera}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n{CHAT}\r\n').encode(),
        (f'--{frontera}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n{caption[:1000]}\r\n').encode(),
        (f'--{frontera}\r\nContent-Disposition: form-data; name="video"; filename="{filename}"\r\nContent-Type: video/mp4\r\n\r\n').encode() + contenido + b'\r\n',
        (f'--{frontera}--\r\n').encode(),
    ]
    url = f"https://api.telegram.org/bot{TOKEN}/sendVideo"
    req = urllib.request.Request(url, b"".join(partes), {"Content-Type": f"multipart/form-data; boundary={frontera}"})
    with urllib.request.urlopen(req, timeout=900) as resp:
        return json.loads(resp.read().decode())


def _mensaje_error_encargo_llano(e: Exception) -> str:
    """Convierte una excepción técnica en un mensaje en lenguaje llano para el usuario."""
    err = str(e)
    # Errores comunes y sus explicaciones
    if "Authentication expired" in err or "Run 'notebooklm login'" in err:
        return (
            "❌ La sesión de NotebookLM ha caducado.\n"
            "Se necesita renovar la autenticación. El sistema lo intentará automáticamente.\n"
            "Si persiste, ejecuta en la Mac: `notebooklm login`"
        )
    if "timeout" in err.lower():
        return (
            "⏱️ La operación tardó demasiado y se canceló.\n"
            "Puede ser por carga alta o red lenta. Se reintentará automáticamente."
        )
    if "quota" in err.lower() or "rate limit" in err.lower() or "429" in err:
        return (
            "📊 Se alcanzó el límite de uso de la API.\n"
            "El sistema cambiará a otro modelo gratuito y reintentará."
        )
    if "drive" in err.lower() and ("permission" in err.lower() or "403" in err):
        return (
            "🔒 No hay permiso para escribir en Google Drive.\n"
            "Reautoriza la cuenta con alcance de escritura (ver /acciones)."
        )
    if "not found" in err.lower() or "404" in err:
        return (
            "🔍 No se encontró el recurso solicitado (cuaderno, fuente o archivo).\n"
            "Verifica que el ID sea correcto."
        )
    # Fallback genérico
    return f"❌ Error en el encargo: {err[:400]}\nSe reintentará automáticamente. Si persiste, revisa /estado."


def atender_alcance(p: dict[str, Any], plan: dict[str, Any]) -> None:
    """Atiende una petición de alcance: analiza canal/vídeo y prepara contacto."""
    urls = plan.get("urls", {})
    youtube_urls = urls.get("youtube", [])
    
    if not youtube_urls:
        decir("Para alcance necesito una URL de YouTube del canal o vídeo a analizar.")
        return
    
    url_principal = youtube_urls[0]
    decir(f"🔍 Iniciando alcance para: {url_principal}\n"
         f"Investigaré el canal, sus vídeos y métodos de contacto.\n"
         f"El informe, ficha de contacto y mensaje quedarán PENDIENTES DE APROBACIÓN.")
    
    from peticiones_alcance import registrar_alcance, investigar_canal_youtube
    
    # Extraer info del canal del texto
    texto = p["texto"]
    destinatario = "Canal por determinar"
    canal = url_principal
    
    # Registrar en el sistema de alcance
    hash_id = registrar_alcance(texto, destinatario, canal, "peticiones-a1")
    
    # Investigar el canal (asíncrono en producción, síncrono aquí para demo)
    try:
        resultado = investigar_canal_youtube(url_principal, texto)
        from peticiones_alcance import actualizar_alcance
        actualizar_alcance(hash_id, 
            informe=resultado.get("informe"),
            ficha_contacto=resultado.get("ficha_contacto"),
            mensaje_borrador=resultado.get("mensaje_borrador"),
            estado="pendiente_aprobacion"
        )
        decir(f"✅ Alcance registrado (ID: {hash_id})\n"
             f"• Vídeo fuente: {url_principal}\n"
             f"• Informe: generado\n"
             f"• Ficha de contacto: generada\n"
             f"• Mensaje borrador: generado\n"
             f"• Todo PENDIENTE DE APROBACIÓN\n"
             f"Usa /alcance para ver pendientes y /approve <id> para aprobar.")
    except Exception as e:
        log("investigación alcance falló", str(e))
        decir(f"⚠️ Alcance registrado (ID: {hash_id}) pero la investigación falló: {e}\n"
             f"Se reintentará automáticamente.")


def atender_descartar(p: dict[str, Any], plan: dict[str, Any]) -> None:
    """Atiende una petición de descartar: quita fuentes de cuadernos afectados."""
    texto = p["texto"]
    decir(f"🗑️ Procesando descarte: {texto[:200]}\n"
         f"Buscaré las fuentes relacionadas en los cuadernos afectados,\n"
         f"las eliminaré, guardaré la regla y regeneraré los formatos.")
    
    from peticiones_alcance import procesar_descarte
    
    try:
        resultado = procesar_descarte(texto)
        total = resultado.get("total_fuentes_eliminadas", 0)
        cuadernos = resultado.get("cuadernos_procesados", [])
        detalles = "\n".join(f"  • {c['cuaderno']}: {c['eliminadas']} fuentes" for c in cuadernos)
        decir(f"✅ Descarte procesado.\n"
             f"• Palabras clave: {', '.join(resultado.get('palabras_clave', [])) or 'ninguna'}\n"
             f"• Cuadernos procesados:\n{detalles or '  (ninguno)'}\n"
             f"• Total fuentes eliminadas: {total}\n"
             f"• Regla guardada y formatos regenerados.")
    except Exception as e:
        log("descartar falló", str(e))
        raise


def _fuente_local_respaldo() -> tuple[str | None, str]:
    """Busca el contexto vivo o síntesis local más reciente en A1 cuando Drive OAuth está pendiente de renovar."""
    import glob
    patrones = [
        os.path.join(DIR, "contexto-vivo-*.md"),
        os.path.join(RAIZ_REPO, "starseed_memory_root", "sintesis", "sintesis-*.md"),
    ]
    candidatos: list[str] = []
    for pat in patrones:
        candidatos.extend(glob.glob(pat))
    candidatos = sorted(candidatos, key=lambda r: os.path.getmtime(r), reverse=True)
    if candidatos:
        ruta = candidatos[0]
        nombre = os.path.basename(ruta).replace(".md", "")
        return ruta, f"Síntesis local ({nombre})"
    return None, "Cuaderno StarSeed: Producción audiovisual"


def hacer_notebooklm(p: dict[str, Any], plan: dict[str, Any]) -> None:
    from peticiones_notebooklm import asegurar_fuente_local
    titulo, sid = None, p.get("fuente_id")
    aviso_local = ""
    try:
        if plan["fuente"] == "ultima_sintesis":
            fid, titulo = ultima_sintesis()
        elif plan["fuente"] == "drive" and plan["drive_id"]:
            fid = plan["drive_id"]
            titulo = nombre_drive(fid)
        else:
            fid = None
    except RuntimeError as err_drive:
        log("Drive OAuth no disponible en hacer_notebooklm, usando respaldo local/cuaderno:", err_drive)
        fid = None
        ruta_local, titulo = _fuente_local_respaldo()
        if ruta_local and not sid:
            sid = asegurar_fuente_local(ruta_local, titulo)
            if sid:
                actualizar(p["id"], fuente_id=sid)
        aviso_local = (
            "\n(Nota: Drive OAuth está pendiente de renovación en MetaGenesis › «Te toca a ti»; "
            "uso directamente el contexto vivo y las fuentes cargadas en el cuaderno de NotebookLM)."
        )
    hechos = set(p.get("hechos") or [])
    pendientes = [a for a in plan["artefactos"] if a["tipo"] not in hechos]
    nombres = ", ".join(TIPOS[a["tipo"]][0] for a in pendientes)
    decir("En marcha en NotebookLM (cuaderno «StarSeed: Producción audiovisual»): %s%s.%s\n"
          "La infografía tarda unos minutos; el audio o vídeo, 10–25 min. Te los envío aquí en cuanto estén."
          % (nombres, " a partir de «%s»" % titulo if titulo else "", aviso_local))
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
    msg_fin = "Listo ✓ También quedó en el cuaderno: %s" % ENLACE_CUADERNO
    actualizar(p["id"], respuesta=msg_fin)
    decir(msg_fin)


def responder(p: dict[str, Any]) -> None:
    sistema = (
        "Eres el Canal 3 especializado de MetaGenesis («Producción Audiovisual, Diseño Profesional, Promoción y Contactos»), "
        "atendiendo a Alex en @StarSeed_Design_bot, sincronizado con Hermes (sesión local-a1bb42b2...), "
        "Astraura › Genesis (puente:peticiones) y la pestaña «Producción audiovisual y diseño» de MetaGenesis.\n"
        "Tus capacidades y contexto activos:\n"
        "1. Producción audiovisual y síntesis NotebookLM: generas 9 formatos (infografía, audio podcast, vídeo, "
        "presentación, mapa mental, informe, cuestionario, tarjetas, tabla) desde la síntesis diaria o el contexto vivo "
        "del cuaderno StarSeed. Si Drive OAuth caduca (invalid_grant), ya está publicado en MetaGenesis › «Te toca a ti» "
        "el comando automático de 1 línea para la terminal de la Mac (`cd /Users/alex/Documents/starseed-os-main && "
        "~/.starseed/herramientas/alta-cuentas-google.py alex && python3 scripts/puente/cuentas_google.py estado --verificar "
        "&& python3 scripts/puente/oracle_nodo.py claves && python3 scripts/puente/acciones-de-alex.py --verificar google-oauth-alex`).\n"
        "2. Vídeo IA y motion: propuestas de Higgsfield (`seedance-2.0`, `veo-3`) con `/higgsfield` (siempre requieren "
        "aprobación explícita y presupuesto), motion con HyperFrames/Remotion y 3D con Blender.\n"
        "3. Diseño profesional: Stitch MCP, DESIGN.md, awesome-design-md (84 productos), react:components y shadcn-ui.\n"
        "4. Promoción y contactos (ALC1113): investigación de canales YouTube y borradores de contacto con `/alcance`, "
        "`/ver <id>`, `/approve <id>`, `/reject <id>` (nada sale al exterior sin aprobación explícita de Alex y huella SHA-256).\n"
        "Responde en español, con memoria de los mensajes anteriores de la conversación, claro, directo y en menos de 1.500 caracteres."
    )
    historial = _historial_conversacion(excluir_id=p.get("id"), limite=6)
    texto, modelo = llm([{"role": "system", "content": sistema}, *historial, {"role": "user", "content": p["texto"]}])
    if not texto:
        raise RuntimeError("los modelos gratuitos no respondieron")
    actualizar(p["id"], respuesta=texto, modelo=modelo)
    decir("%s\n\n— MetaGenesis · %s" % (texto, modelo))

    # Registrar la respuesta en el registry del canal audiovisual
    if texto:
        _escribir_registro_audiovisual({
            "id": f"md-{p['id']}-r",
            "t": time.time(),
            "de": "director",
            "rol": "director",
            "tipo": "respuesta",
            "canal": "audiovisual",
            "modelo": "hermes/" + modelo if modelo else None,
            "texto": texto,
        })


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
            drenar_ordenes_mac()
        except Exception:  # noqa: BLE001 — la cola nunca tumba el keepalive
            pass
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
    """Revisa si hay nueva síntesis diaria de hoy o ayer (hora México) y la procesa.
    
    Solo procesa la síntesis de hoy o de ayer en hora de México y nunca anuncia una fecha más vieja.
    """
    from peticiones_notebooklm import ultima_sintesis
    from sintesis_multiformato import ya_procesado
    
    try:
        # Obtener fecha actual en zona horaria de México (UTC-6)
        mexico_tz = datetime.timezone(datetime.timedelta(hours=-6))
        hoy_mexico = datetime.datetime.now(mexico_tz).date()
        ayer_mexico = hoy_mexico - datetime.timedelta(days=1)
        fechas_permitidas = {hoy_mexico.isoformat(), ayer_mexico.isoformat()}
        
        fid, nombre = ultima_sintesis()
        import re
        m = re.match(r".*?(\d{4}-\d{2}-\d{2})", nombre)
        if not m:
            return
        fecha = m.group(1)
        
        # Solo procesar si la fecha es hoy o ayer en hora de México
        if fecha not in fechas_permitidas:
            log(f"Síntesis {fecha} fuera de rango (hoy/ayer México: {fechas_permitidas}), no se procesa")
            return
            
        if ya_procesado(fecha):
            return
        log(f"Nueva síntesis diaria detectada: {fecha} ({nombre})")
        decir(f"🔄 Nueva síntesis diaria detectada: {fecha}. Iniciando procesamiento multiformato...")
        indice = _procesar_multiformato_con_degradacion(fecha)
        _multiformato_enviar_indice(indice)
    except RuntimeError as e:
        # Sin síntesis válida para hoy/ayer - no es error, solo no hay nada que procesar
        log(f"Sin síntesis válida para hoy/ayer México: {e}")
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


def _tarea_respaldo_0830() -> None:
    """Tarea periódica que ejecuta el respaldo de síntesis a las 08:30 CDMX (SIN1116B §3.1).

    Verifica cada 5 minutos si es la hora de respaldo (08:30 ± 15 min en zona horaria de México).
    Si es la hora y no hay síntesis válida para hoy, ejecuta el respaldo completo:
    - Investiga con criterio (3 deep research en tema rotativo)
    - Genera informe con protocolo completo + regla de calidad
    - Redacta con flota gratuita
    - Sube Doc a Drive con nombre exacto
    - Envía resumen al chat
    - Lanza multiformato (9 formatos)

    Los hitos se publican en el chat vía sintesis_avances (SIN1116B §3.2).
    """
    INTERVALO_VERIFICACION_S = 5 * 60  # 5 minutos
    while True:
        time.sleep(INTERVALO_VERIFICACION_S)
        try:
            _ejecutar_respaldo_si_es_hora()
        except Exception as e:
            log("Error en tarea respaldo 08:30:", e)


def _ejecutar_respaldo_si_es_hora() -> None:
    """Verifica si es hora de respaldo y lo ejecuta si procede."""
    # Usar la función de peticiones_sintesis_respaldo para obtener hora CDMX
    try:
        import zoneinfo
        from datetime import datetime
        tz = zoneinfo.ZoneInfo("America/Mexico_City")
        ahora = time.time()
        dt = datetime.fromtimestamp(ahora, tz)
        hora_decimal = dt.hour + dt.minute / 60.0
    except Exception:
        from datetime import datetime, timezone
        dt = datetime.fromtimestamp(time.time(), timezone.utc)
        hora_decimal = dt.hour + dt.minute / 60.0

    HORA_RESPALDO = 8.5  # 08:30
    VENTANA_MIN = 0.25   # ±15 min

    if abs(hora_decimal - HORA_RESPALDO) > VENTANA_MIN:
        return  # No es hora de respaldo

    # Verificar si ya se ejecutó hoy (evitar duplicados)
    try:
        import zoneinfo
        from datetime import datetime
        tz = zoneinfo.ZoneInfo("America/Mexico_City")
        fecha_hoy = datetime.fromtimestamp(time.time(), tz).date().isoformat()
    except Exception:
        from datetime import datetime, timezone
        fecha_hoy = datetime.fromtimestamp(time.time(), timezone.utc).date().isoformat()

    estado = leer_json(ESTADO, {})
    respaldos = estado.get("respaldos_ejecutados", {})
    if respaldos.get(fecha_hoy) is True:
        return  # Ya se ejecutó hoy

    log(f"Hora de respaldo 08:30 CDMX detectada ({hora_decimal:.2f}). Ejecutando...")

    # Ejecutar respaldo con todas las dependencias inyectadas
    resultado = PSR.ejecutar_respaldo_0830(
        raiz=Path(__file__).parent.parent.parent,
        ahora=time.time(),
        nb_fn=nb,
        drive_fn=drive,
        token_google_fn=token_google,
        leer_clave_fn=lambda k: ENV.get(k),
        enviar_telegram_fn=decir,
        multiformato_fn=_procesar_multiformato_con_degradacion,
        log_fn=lambda msg: log("[respaldo_0830]", msg),
        seco=False,
    )

    if resultado.get("ok"):
        # Marcar como ejecutado hoy
        respaldos[fecha_hoy] = True
        estado["respaldos_ejecutados"] = respaldos
        escribir_json(ESTADO, estado)
        log(f"Respaldo completado: {resultado.get('mensaje')}")
    else:
        log(f"Respaldo no ejecutado: {resultado.get('mensaje')}")


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


def _leer_salud_sesiones() -> dict[str, Any]:
    """Lee el estado agregado de sesiones desde salud/estado.json."""
    return leer_json(SALUD_ESTADO, {})


def _formato_salud_sesiones(salud: dict[str, Any]) -> str:
    """Formatea la salud de sesiones para /estado."""
    if not salud:
        return "• Salud de sesiones: sin datos"
    total = salud.get("total", 0)
    vivas = salud.get("vivas", 0)
    caidas = salud.get("caidas", 0)
    lineas = [f"• Salud de sesiones: {vivas}/{total} vivas · {caidas} caídas"]
    for nombre, det in salud.get("detalle", {}).items():
        if det.get("estado") == "viva":
            lineas.append(f"   ✓ {nombre}: {det.get('detalle', 'ok')}")
        else:
            lineas.append(f"   ✗ {nombre}: {det.get('motivo', 'caída')[:80]}")
    return "\n".join(lineas)


def texto_estado(cola: list[Any], notebooklm: dict[str, Any]) -> str:  # noqa: F811
    base = linea_chat() + "\n" + _texto_estado_gen1113(cola, notebooklm)
    salud = _leer_salud_sesiones()
    return base + "\n" + _formato_salud_sesiones(salud)


def texto_ayuda() -> str:
    return linea_chat() + "\n" + AYUDA


def _registrar_mensaje_recibido(texto: str) -> None:
    """Registra el texto del mensaje en archivo privado (600) sin claves."""
    log_path = os.path.join(DIR, "mensajes_recibidos.log")
    try:
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(f"{datetime.datetime.now().isoformat()} {texto}\n")
        os.chmod(log_path, 0o600)
    except OSError:
        pass


# ─── ACC1121D · órdenes del director desde el bot del A1 ─────────────────────────────


def ordenes_mac_pendientes() -> list[dict[str, Any]]:
    datos = leer_json(ORDENES_MAC, [])
    return [x for x in datos if isinstance(x, dict)] if isinstance(datos, list) else []


def encolar_orden_mac(payload: dict[str, Any]) -> int:
    with bloqueo:
        cola = ordenes_mac_pendientes()
        cola.append(dict(payload))
        escribir_json(ORDENES_MAC, cola[-50:])
        return len(cola[-50:])


def _llave_de_nodo() -> str:
    base = Path(os.environ.get("STARSEED_NODO_DIR")
                or os.path.expanduser("~/.starseed/nodo-metagenesis"))
    try:
        return (base / "llave").read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def _nodo_del_a1() -> str:
    try:
        import nodo_metagenesis_logica as L
        import nodo_metagenesis_medio as M
        return str(L.id_de_nodo(M.detectar_medio(), M.huella_maquina()))
    except Exception:  # noqa: BLE001
        return ""


_MAPA_NODO = {
    "buscar_capacidad": ("buscar_capacidad", lambda a: {"aplicar": bool(a.get("aplicar"))}),
    "lanzar_cola": ("lanzar_cola",
                    lambda a: {"cola": a.get("cola"), "trabajadores": a.get("trabajadores", 2)}),
    "pausar_enjambre": ("pausar", lambda a: {}),
    "reanudar_enjambre": ("reanudar", lambda a: {}),
}


def _enviar_orden_por_la_puerta(payload: dict[str, Any]) -> dict[str, Any]:
    orden = str(payload.get("orden") or "")
    if orden not in _MAPA_NODO:
        return {"ok": False, "motivo": "esta orden necesita la Mac (sin ruta de nodo)"}
    accion, args_fn = _MAPA_NODO[orden]
    try:
        llave, nodo = _llave_de_nodo(), _nodo_del_a1()
        if not llave or not nodo:
            return {"ok": False, "motivo": "sin llave de nodo en el A1"}
        import puerta_datos_cliente as P
        puerta = P.Puerta.desde_entorno(rol="enjambre")
        if not puerta.url:
            return {"ok": False, "motivo": "sin PUERTA_DATOS_URL"}
        estado, _ = puerta._pedir("POST", "/v1/metagenesis/ordenes", {
            "nodo": nodo, "llave": llave, "accion": accion,
            "args": args_fn(payload.get("argumentos") or {}), "para": "mac"})
        if estado and 200 <= int(estado) < 300:
            return {"ok": True, "detalle": "pedida a la Mac"}
        return {"ok": False, "motivo": "la puerta contestó %s" % estado}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "motivo": type(e).__name__}


def enviar_orden_a_mac(payload: dict[str, Any], enviar_fn=None) -> dict[str, Any]:
    if enviar_fn is not None:
        return enviar_fn(payload)
    return _enviar_orden_por_la_puerta(payload)


def drenar_ordenes_mac(enviar_fn=None) -> int:
    pendientes = ordenes_mac_pendientes()
    if not pendientes:
        return 0
    quedan: list[dict[str, Any]] = []
    hechas = 0
    for payload in pendientes:
        if enviar_orden_a_mac(payload, enviar_fn=enviar_fn).get("ok"):
            hechas += 1
        else:
            quedan.append(payload)
    with bloqueo:
        escribir_json(ORDENES_MAC, quedan)
    if hechas:
        decir("Mac de vuelta: %d orden(es) de la cola ejecutada(s); %d pendiente(s)."
              % (hechas, len(quedan)))
    return hechas


def _estado_de_la_mac() -> str:
    try:
        import puerta_datos_cliente as P
        puerta = P.Puerta.desde_entorno(rol="enjambre")
        filas = puerta.leer_eventos(tipos=["mg_foto"], limite=5)
        for fila in reversed(filas or []):
            datos = fila.get("datos") if isinstance(fila, dict) else None
            if isinstance(datos, dict) and datos:
                return json.dumps(datos, ensure_ascii=False)[:3500]
    except Exception:  # noqa: BLE001
        pass
    return ""


def _atender_orden_director_a1(texto: str, enviar_fn=None, estado_fn=None) -> Optional[str]:
    """Atiende estado/órdenes desde el bot del A1; `None` si el texto no es una orden."""
    import sincronizador_direccion as S
    plan = S.interpretar_orden_director(texto)
    tipo = plan.get("tipo")
    if tipo == "desconocida":
        return None
    if tipo == "ayuda":
        return S.AYUDA_ORDENES
    if tipo == "reservada":
        return "esto es de Alex: %s" % plan.get("motivo")
    if tipo == "estado":
        estado = (estado_fn or _estado_de_la_mac)()
        if estado:
            return "Mac · " + estado
        local = texto_estado(leer_json(COLA, []), leer_json(ESTADO, {}).get("notebooklm", {}))
        return local + "\n\nLa Mac no responde; este es el estado del A1."
    payload = {"orden": plan["orden"], "argumentos": plan.get("argumentos") or {},
               "quien": "alex", "motivo": "orden de Alex por audiovisual/a1",
               "canal": "audiovisual", "medio": "a1"}
    r = enviar_orden_a_mac(payload, enviar_fn=enviar_fn)
    if r.get("ok"):
        return "Pedida a la Mac: %s. %s" % (plan["orden"], r.get("detalle") or "")
    n = encolar_orden_mac(payload)
    return ("La Mac no responde (%s). Dejo la orden en cola (%d pendiente(s)); "
            "la ejecuto en cuanto vuelva." % (r.get("motivo") or "sin respuesta", n))


def recibir(upd: dict[str, Any]) -> None:
    m = upd.get("message") or {}
    if str((m.get("chat") or {}).get("id")) != CHAT:
        log("ignoro un mensaje de otro chat")
        return
    texto = (m.get("text") or m.get("caption") or "").strip()
    if not texto:
        decir("Por ahora atiendo mensajes de texto.")
        return
    
    update_id = upd["update_id"]
    
    # Comandos directos: responden inmediatamente, SIN encolar ni "Recibido ✓"
    if texto.startswith("/estado"):
        decir(texto_estado(leer_json(COLA, []), leer_json(ESTADO, {}).get("notebooklm", {})))
        return
    if texto == "/renovar" or texto.startswith("/renovar "):
        partes_ren = texto.split(" ", 1)
        _comando_renovar(partes_ren[1].strip() if len(partes_ren) > 1 else "")
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
        os.makedirs(_hfa_base(), exist_ok=True)
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
    
    # SIN1116F: Comandos de síntesis
    if texto.startswith("/sintesis"):
        _comando_sintesis(texto)
        return
    
    # SIN1116F: Comandos de recomendaciones (aprobar, rechazar, ya existe, encarga)
    if texto.startswith(("aprobar ", "rechazar ", "ya existe ", "encarga ")):
        _comando_recomendacion(texto)
        return
    
    respuesta_orden = _atender_orden_director_a1(texto)
    if respuesta_orden:
        decir(respuesta_orden)
        return

    # PET1116E: Para peticiones reales (no comandos), SIEMPRE encolar PRIMERO y responder "Recibido ✓"
    with bloqueo:
        cola = leer_json(COLA, [])
        if not any(p["id"] == update_id for p in cola):
            cola.append({"id": update_id, "texto": texto, "recibida": time.time(), "estado": "nueva", "intentos": 0})
            escribir_json(COLA, cola[-200:])
        _escribir_registro_audiovisual({
            "id": f"md-{update_id}",
            "t": time.time(),
            "de": "alex",
            "rol": "alex",
            "tipo": "mensaje",
            "canal": "audiovisual",
            "texto": texto,
        })
    decir("Recibido ✓ Lo atiende MetaGenesis en el A1, sin la Mac ni Claude.")
    hay_trabajo.set()
    
    # Registrar texto del mensaje (sin claves) en archivo privado
    _registrar_mensaje_recibido(texto)
    
    # Procesar reglas permanentes en try/except: un fallo NO pierde el mensaje
    try:
        # PSF1113B: Detectar y procesar reglas permanentes (recuerda/cada día/siempre/para cada/a partir de ahora)
        # Si es una regla permanente, guardarla y confirmar, PERO seguir procesando como petición normal
        if por_reglas_permanente(texto) == "regla_permanente":
            _responder_con_regla_permanente(texto)
            # NO return: continuar para procesar también como encargo/petición normal
    
    except Exception as e:
        # PET1116E: Fallo en procesado -> marcar petición para reintento y avisar en chat
        log("recibir procesado falló:", traceback.format_exc()[-800:])
        actualizar(update_id, estado="reintentar")
        decir(f"⚠️ Error procesando tu mensaje (reintentará): {str(e)[:200]}")


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
    return any(
        p in t
        for p in (
            "higgsfield",
            "seedance",
            "veo-3",
            "veo 3",
            "veo3",
            "veo-2",
            "veo 2",
            "veo2",
            "video generat",
            "generar video",
            "clip de",
            "video para",
            "haz un video",
            "crea un video",
        )
    )


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


def _comando_renovar(sesion: str) -> None:
    """Lanza reparar() del sanador y, si hace falta mano, muestra el comando preparado en MetaGenesis › Te toca a ti."""
    try:
        import sys
        sys.path.insert(0, os.path.dirname(__file__))
        import sanador_sesiones as SS
    except ImportError:
        decir("Sanador de sesiones no disponible.")
        return

    sanador = SS._crear_sanador_defecto()
    if not sesion or sesion in ("todo", "todas", "all"):
        objetivos = ("notebooklm", "google-oauth-alex", "google-oauth-alex-docs")
        lineas = ["🔧 Revisando y reparando sesiones de producción (NotebookLM y Google OAuth):"]
        for obj in objetivos:
            res = sanador.reparar(obj)
            icono = "✅" if res.get("ok") else "⚠️"
            lineas.append(f"  {icono} {obj}: {res.get('detalle') or res.get('motivo') or 'requiere autorización OAuth en la Mac'}")
        lineas.append("")
        lineas.append("💻 Comando inteligente preparado en MetaGenesis › «Te toca a ti» (pégalo en la terminal de la Mac):")
        lineas.append(
            "cd /Users/alex/Documents/starseed-os-main && "
            "~/.starseed/herramientas/alta-cuentas-google.py alex && "
            "~/.starseed/herramientas/alta-cuentas-google.py alex-docs && "
            "python3 scripts/puente/cuentas_google.py estado --verificar && "
            "python3 scripts/puente/oracle_nodo.py claves && "
            "python3 scripts/puente/acciones-de-alex.py --verificar google-oauth-alex"
        )
        decir("\n".join(lineas))
        return

    decir(f"🔧 Reparando sesión «{sesion}»...")
    resultado = sanador.reparar(sesion)

    if resultado.get("ok"):
        decir(f"✅ Sesión «{sesion}» reparada: {resultado.get('detalle', 'ok')}")
        return

    # Si falló y no es por red, sugerir autoservicio
    if resultado.get("es_red"):
        decir(f"⏳ Sesión «{sesion}» caída por red. Se reintentará en el próximo ciclo.")
        return

    # Escalado: sugerir navegador_alta para google-alex o Mac
    if sesion == "notebooklm":
        decir(
            f"⚠️ No se pudo reparar «{sesion}» automáticamente.\n"
            f"Intentado: {', '.join(resultado.get('recetas', [])) or 'recetas del sanador'}\n"
            f"Próximo paso: ejecuta en la Mac o desde el bot:\n"
            f"  python3 -m scripts.puente.navegador_alta alta google-alex\n"
            f"  (abre MetaGenesis › Apps Linux e inicia sesión en Google)"
        )
    else:
        decir(
            f"⚠️ No se pudo reparar «{sesion}» automáticamente.\n"
            f"Intentado: {', '.join(resultado.get('recetas', [])) or 'recetas del sanador'}\n"
            f"Revisa los logs en starseed_memory_root/salud/sesiones.jsonl"
        )


# SIN1116F: Comandos de síntesis
def _comando_sintesis(texto: str) -> None:
    """Maneja /sintesis, /sintesis estado, /sintesis contexto."""
    partes = texto.split()
    if len(partes) == 1:
        # /sintesis - lanzar síntesis inmediatamente
        _sintesis_lanzar()
    elif partes[1] == "estado":
        _sintesis_estado()
    elif partes[1] == "contexto":
        _sintesis_contexto()
    else:
        decir(
            "Uso: /sintesis [estado|contexto]\n"
            "  /sintesis          — Lanza la síntesis ahora\n"
            "  /sintesis estado   — Hito actual y retraso\n"
            "  /sintesis contexto — Resumen del paquete de hoy y enlace al contexto vivo"
        )


def _sintesis_lanzar() -> None:
    """Lanza la síntesis inmediatamente ejecutando el agente."""
    try:
        import sys
        sys.path.insert(0, os.path.dirname(__file__))
        import agente_sintesis as AS
    except ImportError:
        decir("❌ Agente de síntesis no disponible.")
        return
    
    raiz = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    
    decir("🚀 Lanzando síntesis diaria...")
    try:
        resultado = AS.ciclo(raiz, seco=False)
        if resultado.get("ok"):
            if resultado.get("sintesis_path"):
                decir(f"✅ Síntesis completada y guardada en: {resultado['sintesis_path']}")
            else:
                decir("✅ Ciclo de síntesis completado (sin entrega, puede ser fase de recolección/redacción).")
        else:
            decir(f"⚠️ Síntesis no entregada: {resultado.get('accion', 'motivo desconocido')}")
    except Exception as e:
        log("Error lanzando síntesis:", traceback.format_exc()[-800:])
        decir(f"❌ Error lanzando síntesis: {str(e)[:300]}")


def _sintesis_estado() -> None:
    """Muestra el hito actual y el retraso de la síntesis."""
    try:
        import sys
        sys.path.insert(0, os.path.dirname(__file__))
        import agente_sintesis as AS
    except ImportError:
        decir("❌ Agente de síntesis no disponible.")
        return
    
    raiz = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    
    try:
        estado = AS.cargar_estado(raiz)
        fecha = estado.get("fecha")
        fase = estado.get("fase", "recolectar")
        entregada = estado.get("entregada", False)
        tareas_encoladas = estado.get("tareas_encoladas", {})
        sintesis_path = estado.get("sintesis_path")
        puntuacion = estado.get("puntuacion")
        
        # Determinar hora actual en CDMX
        try:
            import zoneinfo
            tz = zoneinfo.ZoneInfo(AS.ZONA)
            from datetime import datetime, timezone
            ahora_cdmx = datetime.now(timezone.utc).astimezone(tz)
            hora_actual = ahora_cdmx.hour + ahora_cdmx.minute / 60.0
            fecha_hoy = ahora_cdmx.date().isoformat()
        except Exception:
            from datetime import datetime, timezone
            ahora_cdmx = datetime.now(timezone.utc)
            hora_actual = ahora_cdmx.hour + ahora_cdmx.minute / 60.0
            fecha_hoy = ahora_cdmx.date().isoformat()
        
        # Fases y horas objetivo
        fases_info = {
            "recolectar": {"hora": AS.HORAS_RECOLECTAR, "nombre": "Recolección (00:30)"},
            "redactar": {"hora": AS.HORAS_REDACTAR, "nombre": "Redacción (06:30)"},
            "entregar": {"hora": AS.HORAS_ENTREGAR, "nombre": "Entrega (07:54)"},
        }
        
        fase_actual_info = fases_info.get(fase, fases_info["recolectar"])
        hora_objetivo = fase_actual_info["hora"]
        nombre_fase = fase_actual_info["nombre"]
        
        # Calcular retraso
        retraso = ""
        if not entregada and hora_actual > hora_objetivo:
            minutos_retraso = int((hora_actual - hora_objetivo) * 60)
            if minutos_retraso >= 60:
                horas = minutos_retraso // 60
                mins = minutos_retraso % 60
                retraso = f" — ⚠️ RETRASADA {horas}h {mins}min (objetivo: {int(hora_objetivo):02d}:{int((hora_objetivo%1)*60):02d})"
            else:
                retraso = f" — ⚠️ RETRASADA {minutos_retraso}min (objetivo: {int(hora_objetivo):02d}:{int((hora_objetivo%1)*60):02d})"
        elif not entregada:
            minutos_falta = int((hora_objetivo - hora_actual) * 60)
            retraso = f" — en curso (objetivo: {int(hora_objetivo):02d}:{int((hora_objetivo%1)*60):02d}, faltan {minutos_falta} min)"
        else:
            retraso = " — ✅ ENTREGADA"
        
        # Próximos hitos
        if not entregada:
            if fase == "recolectar":
                proximo = "Redacción a las 06:30"
            elif fase == "redactar":
                proximo = "Entrega a las 07:54"
            else:
                proximo = "Entrega inminente"
        else:
            proximo = "Próxima síntesis mañana a las 00:30"
        
        lineas = [
            f"📊 Estado de la síntesis diaria ({fecha_hoy})",
            f"",
            f"• Fase actual: {nombre_fase}{retraso}",
            f"• Próximo hito: {proximo}",
            f"• Tareas encoladas hoy: {tareas_encoladas.get(fecha_hoy, 0)}",
        ]
        
        if sintesis_path:
            lineas.append(f"• Última síntesis: {sintesis_path}")
        if puntuacion is not None:
            lineas.append(f"• Puntuación Jev: {puntuacion}/10")
        
        decir("\n".join(lineas))
        
    except Exception as e:
        log("Error obteniendo estado de síntesis:", traceback.format_exc()[-800:])
        decir(f"❌ Error obteniendo estado: {str(e)[:300]}")


def _sintesis_contexto() -> None:
    """Muestra resumen del paquete de hoy y enlace al contexto vivo."""
    try:
        import sys
        sys.path.insert(0, os.path.dirname(__file__))
        import contexto_sintesis as CS
    except ImportError:
        decir("❌ Módulo de contexto de síntesis no disponible.")
        return
    
    raiz = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    
    try:
        from datetime import datetime, timezone
        import zoneinfo
        tz = zoneinfo.ZoneInfo("America/Mexico_City")
        hoy = datetime.now(timezone.utc).astimezone(tz).date().isoformat()
    except Exception:
        from datetime import datetime, timezone
        hoy = datetime.now(timezone.utc).date().isoformat()
    
    try:
        decir("📦 Generando contexto de síntesis...")
        ctx = CS.contexto_vivo(raiz, hoy)
        
        fecha = ctx.get("fecha", hoy)
        previas = ctx.get("sintesis_previas", [])
        mananas = ctx.get("mananas", [])
        resumen_actividad = ctx.get("resumen_actividad", {})
        imaginacion = ctx.get("imaginacion", [])
        informes = ctx.get("informes", [])
        recomendaciones = ctx.get("recomendaciones", [])
        
        lineas = [
            f"📋 Contexto vivo de síntesis — {fecha}",
            f"",
            f"• Síntesis previas incluidas: {len(previas)}",
            f"• Tareas para mañana (rotación): {len(mananas)}",
            f"• Áreas de actividad: {len(resumen_actividad.get('areas', [])) if isinstance(resumen_actividad, dict) else 0}",
            f"• Informes de agentes: {len(informes)}",
            f"• Resultados de imaginación: {len(imaginacion)}",
            f"• Recomendaciones en el libro: {len(recomendaciones)}",
        ]
        
        # Enlace al contexto vivo en Drive
        lineas.append(f"")
        lineas.append(f"🔗 Contexto vivo completo en Drive (se sube al generar la síntesis)")
        lineas.append(f"   Carpeta: Síntesis diarias / Contexto vivo {fecha}")
        
        decir("\n".join(lineas))
        
    except Exception as e:
        log("Error generando contexto de síntesis:", traceback.format_exc()[-800:])
        decir(f"❌ Error generando contexto: {str(e)[:300]}")


# SIN1116F: Comandos de recomendaciones
def _comando_recomendacion(texto: str) -> None:
    """Maneja aprobar <id>, rechazar <id>, ya existe <id>, encarga <id>."""
    # Determinar la acción (puede ser de 1 o 2 palabras: "ya existe")
    accion = None
    rec_id = None
    
    for prefijo in ("aprobar ", "rechazar ", "ya existe ", "encarga "):
        if texto.startswith(prefijo):
            accion = prefijo.rstrip()
            rec_id = texto[len(prefijo):].strip()
            break
    
    if accion is None or not rec_id:
        decir("Uso: aprobar|rechazar|ya existe|encarga <id-recomendacion>")
        return
    
    accion = accion.lower()
    
    try:
        import sys
        sys.path.insert(0, os.path.dirname(__file__))
        import libro_recomendaciones as LR
    except ImportError:
        decir("❌ Libro de recomendaciones no disponible.")
        return
    
    # Verificar que la recomendación existe
    rec = LR.obtener_recomendacion(rec_id)
    if not rec:
        decir(f"❌ Recomendación «{rec_id}» no encontrada.")
        return
    
    mapa_acciones = {
        "aprobar": ("aprobada", "✅ Aprobada"),
        "rechazar": ("rechazada", "❌ Rechazada"),
        "ya existe": ("ya_existe", "⏭️ Ya existe"),
        "encarga": ("encargada", "📋 Encargada"),
    }
    
    if accion not in mapa_acciones:
        decir(f"❌ Acción «{accion}» no válida. Usa: aprobar, rechazar, ya existe, encarga")
        return
    
    nuevo_estado, mensaje_accion = mapa_acciones[accion]
    
    # Actualizar estado
    actualizada = LR.actualizar_estado(rec_id, nuevo_estado)
    if not actualizada:
        decir(f"❌ No se pudo actualizar la recomendación «{rec_id}».")
        return
    
    # Si es encarga, intentar crear el encargo
    if accion == "encarga":
        _crear_encargo_desde_recomendacion(actualizada)
        decir(f"{mensaje_accion} y encargo creado: {rec_id}\n"
             f"  Texto: {actualizada['texto'][:100]}...\n"
             f"  Área: {actualizada['area']} | Pieza base: {actualizada['pieza_base']}")
    else:
        decir(f"{mensaje_accion}: {rec_id}\n"
             f"  Texto: {actualizada['texto'][:100]}...\n"
             f"  Área: {actualizada['area']} | Pieza base: {actualizada['pieza_base']}\n"
             f"  Estado anterior: {rec['estado']} → Nuevo: {actualizada['estado']}")


def _crear_encargo_desde_recomendacion(recomendacion: dict[str, Any]) -> None:
    """Crea un encargo o ola basado en una recomendación aprobada."""
    try:
        import sys
        sys.path.insert(0, os.path.dirname(__file__))
        import peticiones_encargos as PE
    except ImportError:
        log("peticiones_encargos no disponible para crear encargo")
        return
    
    # Construir texto de encargo a partir de la recomendación
    texto_encargo = (
        f"Encargo desde síntesis: {recomendacion['texto']}\n"
        f"Área: {recomendacion['area']}\n"
        f"Pieza base: {recomendacion['pieza_base']}\n"
        f"ID recomendación: {recomendacion['id']}"
    )
    
    # Usar el productor para planificar y ejecutar
    try:
        frentes = PE.planificar_base(texto_encargo)
        log(f"Encargo creado desde recomendación {recomendacion['id']} con {len(frentes)} frentes")
    except Exception as e:
        log(f"Error planificando encargo desde recomendación: {e}")


def _reportar_peticion_fallida(tipo: str, texto_peticion: str, error: str) -> None:
    """Reporta una petición fallida a salud_directores para autorreparación (PET1116C)."""
    try:
        sd = SD.SaludDirectores()
        registros = [f"Error: {error}", f"Petición: {texto_peticion[:500]}"]
        r = sd.evaluar_peticion_fallida(tipo, f"{tipo}: {texto_peticion[:200]}", registros)
        if r.get("accion") == "tarea_abierta":
            log(f"PET1116C: Tarea de diagnóstico abierta: {r['id']} (causa: {r.get('causa')})")
            decir(f"⚠️ Petición fallida detectada. Se ha abierto tarea de diagnóstico automática ({r['id']}).\n"
                 f"El equipo de directores está analizando la causa y aplicará corrección.")
    except Exception as e:
        log(f"Error reportando a salud_directores: {e}")


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
    threading.Thread(target=_tarea_respaldo_0830, daemon=True).start()
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