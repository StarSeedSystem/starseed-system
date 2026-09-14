#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Telegram → Puente de Mando y viceversa.

Saca lo que pasa por Telegram y mete lo que el dueño escribe en el canal común
que leen Claude, Codex, Hermes y Antigravity. Reutiliza todo lo que ya existe:
el CLI `starseed-puente` (decir + CANAL) y el API del Mando en localhost:9002.

Arrancarlo:
  export TELEGRAM_BOT_TOKEN=tu_token
  export TELEGRAM_CHAT_ID=tu_chat_id
  python3 scripts/puente/telegram-puente.py

Si faltan las variables, arranca, lo dice por consola y no hace nada más.

El bot hace dos cosas:

1. Consume el canal compartido (CANAL) y reenvía cada línea nueva al chat de
   Telegram. Además, vigila por su cuenta y avisa sin que nadie pregunte:
     · un proveedor se queda sin cuota o devuelve 429/402 → aviso con el nombre;
     · una tarea lleva más de 300 s con los bytes parados → «API colgada, no modelo lento»;
     · una tarea llega a la puerta de aprobación humana → avisa con botones;
     · una ola termina, un commit se integra o las puertas se ponen en rojo.

   Agrupa: nunca mandes dos mensajes seguidos de lo mismo y nunca reenvíes el
   latido que se repite cada 20 s.

2. Escucha Telegram y reconoce órdenes. Todo lo que no empiece por «/» también
   va al canal, para que los cuatro entornos lo lean.

   Órdenes cortas en español:
     /estado /agentes /olas /cola /puertas /ayuda
     /aprobar <id...>   /rechazar <id...>   /soltar <id...>
     /reasignar <id> <modelo>
     /decir <texto>        → canal común, lo ven los cuatro IDE
     /a <agente> <texto>   → canal dirigiéndose a un agente concreto

   Antes de aprobar / soltar / reasignar, comprueba que quien escribe es el
   TELEGRAM_CHAT_ID autorizado. Cualquier otro chat: se ignora en silencio.

Tests: los casos que se pueden probar sin red van en funciones puras
(parsear una orden, decidir si un aviso es repetido, formatear un mensaje) y
están cubiertos por test_telegram_puente.py. Los tests NO tocan Telegram.
"""
import json, os, sys, time, urllib.error, urllib.parse, urllib.request

# ── no dependencias nuevas: solo biblioteca estándar ───────────────────────

MANDO = os.environ.get("STARSEED_MANDO_URL") or "http://localhost:9002"

# Constantes visibles para los tests puramente lógicos.
MURMURIO_MAX = 300          # segundos quietos con bytes parados → API colgada
SECUENCIA_REPITO = 3        # avisos del mismo tipo seguidos antes de enviar otro
SIN_CREDITO_TIEMPO = 600    # segundos que algo estuvo sin cuota antes de notificar
CERROJO = "/tmp/starseed-telegram-puente.lock"


def _token():
    return os.environ.get("TELEGRAM_BOT_TOKEN")


def _chat_id():
    return os.environ.get("TELEGRAM_CHAT_ID")


def _autorizado(quien, impuestos=None):
    """Devuelve True solo si el chat id de Telegram coincide con el dueño."""
    cfg = impuestos if impuestos is not None else _chat_id()
    return bool(quien and cfg and str(quien) == str(cfg))


def debe_reenviar_linea(linea):
    """Evita que una entrada originada en Telegram regrese al mismo chat."""
    if not isinstance(linea, dict):
        return False
    return not str(linea.get("quien") or "").startswith("telegram-")


def _etiqueta_ola(etiqueta, prefijo="Ola"):
    """Añade el prefijo únicamente cuando el Mando no lo incluyó ya."""
    nombre = str(etiqueta or "—").strip()
    if nombre.casefold() == "ola" or nombre.casefold().startswith("ola "):
        return nombre
    return "%s %s" % (prefijo, nombre)


def _pid_vivo(pid):
    """Comprueba la existencia de un proceso sin enviarle ninguna señal real."""
    if not isinstance(pid, int) or pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except OSError:
        return False
    return True


def adquirir_cerrojo(ruta=CERROJO, pid=None, proceso_vivo=None):
    """Toma con O_EXCL el cerrojo PID o recupera uno huérfano."""
    pid = os.getpid() if pid is None else pid
    proceso_vivo = _pid_vivo if proceso_vivo is None else proceso_vivo
    for _ in range(5):
        try:
            descriptor = os.open(ruta, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            try:
                with open(ruta, encoding="utf-8") as archivo:
                    anterior = os.fstat(archivo.fileno())
                    contenido = archivo.read().strip()
            except FileNotFoundError:
                continue
            except OSError as error:
                return False, "No se pudo inspeccionar el cerrojo de Telegram: %s" % error
            try:
                pid_anterior = int(contenido)
            except (TypeError, ValueError):
                pid_anterior = 0
            if pid_anterior and proceso_vivo(pid_anterior):
                return False, (
                    "Telegram-Puente no arranca: ya hay una instancia viva (PID %s)."
                    % pid_anterior
                )
            try:
                actual = os.stat(ruta)
                if (actual.st_dev, actual.st_ino) == (anterior.st_dev, anterior.st_ino):
                    os.unlink(ruta)
            except FileNotFoundError:
                pass
            except OSError as error:
                return False, "No se pudo recuperar el cerrojo huérfano: %s" % error
            continue
        except OSError as error:
            return False, "No se pudo crear el cerrojo de Telegram: %s" % error

        try:
            try:
                os.write(descriptor, ("%s\n" % pid).encode("ascii"))
            except OSError as error:
                try:
                    os.unlink(ruta)
                except OSError:
                    pass
                return False, "No se pudo escribir el cerrojo de Telegram: %s" % error
        finally:
            os.close(descriptor)
        return True, "Cerrojo de Telegram tomado por PID %s." % pid
    return False, "No se pudo tomar el cerrojo de Telegram por contención."


def liberar_cerrojo(ruta=CERROJO, pid=None):
    """Libera solo el cerrojo que pertenece al proceso llamador."""
    pid = os.getpid() if pid is None else pid
    try:
        with open(ruta, encoding="utf-8") as archivo:
            propietario = int(archivo.read().strip())
        if propietario == pid:
            os.unlink(ruta)
    except (FileNotFoundError, OSError, TypeError, ValueError):
        pass


def _api_mando(ruta, espera=8):
    """Wraps puente.api without importing it, to keep la dependencia explícita."""
    try:
        url = "%s/api/mando/%s" % (MANDO, ruta)
        with urllib.request.urlopen(url, timeout=espera) as r:
            return json.load(r)
    except Exception as e:
        return {"_error": "%s: %s" % (type(e).__name__, e)}


def _status():
    try:
        req = urllib.request.Request("%s/api/mando/estado" % MANDO,
                                      headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=8) as r:
            return json.load(r)
    except Exception:
        return None


def parsear_orden(texto):
    """Devuelve (tipo, args, fragmento) o None cuando no es una orden de Telegram.

    Un texto suelto también se reconoce: cuando no empieza por «/», se devuelve
    ("mensaje", [texto], None) para que el dueño se pueda comunicar con los cuatro
    entornos sin tener que aprender sintaxis.

    Ejemplos:
      "/aprobar zN4 zN5"      → ("aprobar", ["zN4", "zN5"], None)
      "/a Claude avisa que..."  → ("personal", ["Claude", "avisa que..."], None)
      "cambia el color a rojo"  → ("mensaje", ["cambia el color a rojo"], None)
      "/xyz"                   → ("desconocida", ["/xyz"], "/xyz")
    """
    # Desconfía de la entrada ANTES de tocarla: un mensaje de Telegram puede llegar
    # sin `text` (una foto, un sticker, un audio) y ahí `texto` es None.
    if not isinstance(texto, str):
        return None
    # Corta el primer token para distinguir una orden del chat suelto.
    s = texto.strip()
    if not s:
        return None
    primer = s.split()[0] if s.split() else s
    if not primer.startswith("/"):
        return ("mensaje", [s], None)
    partes = s.split(maxsplit=1)
    orden = partes[0][1:]
    args = partes[1].split() if len(partes) > 1 else []
    if orden == "ayuda":
        return ("ayuda", [], None)
    if orden == "estado":
        return ("estado", [], None)
    if orden == "agentes":
        return ("agentes", [], None)
    if orden == "olas":
        n = args[0] if args else None
        return ("olas", [n] if n else [], None)
    if orden == "cola":
        return ("cola", [], None)
    if orden == "puertas":
        return ("puertas", [], None)
    if orden == "decir":
        argumento = partes[1].strip() if len(partes) > 1 else ""
        if (len(argumento) >= 2 and argumento[0] == argumento[-1]
                and argumento[0] in ("'", '"')):
            argumento = argumento[1:-1]
        if not argumento:
            return ("error", [], "decir <texto>")
        return ("decir", [argumento], None)
    if orden == "a" and args:
        quien = args[0]
        resto = " ".join(args[1:])
        if resto:
            return ("personal", [quien, resto], None)
        return ("error", [], "a <agente> <texto>")
    if orden in ("aprobar", "rechazar", "soltar"):
        if not args:
            return ("error", [], "%s <id...>" % orden)
        return (orden, args, None)
    if orden == "reasignar" and len(args) >= 2:
        return ("reasignar", [args[0], args[1]], None)
    if orden == "reasignar":
        return ("error", [], "reasignar <id> <modelo>")
    return ("desconocida", [s], orden)


def es_repetido(linea, ultimo, umbral_secuencias=SECUENCIA_REPITO,
                umbral_murmurio=MURMURIO_MAX, umbral_sincredito=SIN_CREDITO_TIEMPO):
    """Responde «¿me callo?» para un evento candidato.

    Un evento válido sin último mensaje nunca se calla: devuelve False. Los
    murmullos y entradas inválidas no son eventos publicables y se descartan.
    Con historial, solo se calla el mismo tipo y el mismo asunto. Los avisos
    recurrentes caducan: cuota usa ``umbral_sincredito`` y API colgada usa
    ``umbral_murmurio``; dentro del plazo devuelve True y al vencer, False.
    Los demás mensajes idénticos consecutivos se consideran repetidos.

    ``umbral_secuencias`` se conserva por compatibilidad con los llamadores;
    comparar una sola línea anterior no permite contar una secuencia.
    """
    if not isinstance(linea, dict) or not linea:
        return True
    if linea.get("tipo") == "murmurio":
        return True
    if not isinstance(ultimo, dict) or not ultimo:
        return False

    linea_tipo = linea.get("tipo", "")
    linea_texto = str(linea.get("texto") or "")
    ultimo_tipo = ultimo.get("tipo", "")
    ultimo_texto = str(ultimo.get("texto") or "")
    mismo_tipo = linea_tipo == ultimo_tipo
    misma_tarea = (linea.get("tarea") or "") == (ultimo.get("tarea") or "")
    mismo_texto = linea_texto == ultimo_texto

    # En cuota el texto incluye el proveedor, así que identifica el asunto.
    es_cuota = "cuota" in linea_texto.lower() and "cuota" in ultimo_texto.lower()
    if mismo_tipo and linea_tipo == "aviso" and es_cuota and mismo_texto:
        ultimo_epoch = ultimo.get("epoch")
        linea_epoch = linea.get("epoch")
        if isinstance(ultimo_epoch, (int, float)) and isinstance(linea_epoch, (int, float)):
            lapso = linea_epoch - ultimo_epoch
            return 0 <= lapso < umbral_sincredito
        return False

    # En API colgada la tarea identifica el asunto; los segundos del texto cambian.
    es_colgada = "colgada" in linea_texto.lower() and "colgada" in ultimo_texto.lower()
    if mismo_tipo and linea_tipo == "aviso" and es_colgada and misma_tarea:
        ultimo_epoch = ultimo.get("epoch")
        linea_epoch = linea.get("epoch")
        if isinstance(ultimo_epoch, (int, float)) and isinstance(linea_epoch, (int, float)):
            lapso = linea_epoch - ultimo_epoch
            return 0 <= lapso < umbral_murmurio
        return False

    # Para el resto, solo el duplicado consecutivo completo se silencia.
    mismo_quien = linea.get("quien") == ultimo.get("quien")
    if mismo_tipo and mismo_texto and misma_tarea and mismo_quien:
        return True

    return False


def _pinta_json(linea):
    """Formatea un objeto del canal para que se lea bien en Telegram (plain).

    Devuelve un string plano, sin markdown complejo, con acentos y nombres
    españoles. Es función pura.
    """
    if not isinstance(linea, dict):
        return ""
    marca = {"error": "✗", "aviso": "!", "hecho": "✓", "mensaje": "·"}.get(
        linea.get("tipo", ""), "·")
    quien = linea.get("quien") or "?"
    tarea = (" [%s]" % linea["tarea"]) if linea.get("tarea") else ""
    momento = linea.get("t")
    msj = linea.get("texto") or ""
    if momento and len(momento) > 11:
        ts = momento[11:]   # HH:MM:SS
    else:
        ts = momento or ""
    return "%s *%s* _%s_%s %s" % (marca, quien, ts, tarea, msj)


def mensajes_canal_desde(nombre_archivo=None, desde_epoch=None, max_lineas=2000):
    """Lee el canal CANAL y devuelve las líneas (json) que no se han enviado.

    Es una función utilitaria, no pura: lee del disco. Se usa desde el ciclo del
    bot; los tests usan las funciones puras parsear_orden / es_repetido / _pinta.
    """
    if nombre_archivo is None:
        nombre_archivo = os.path.join(
            os.environ.get("STARSEED_ROOT") or "/Users/alex/Documents/starseed-os-main",
            "starseed_memory_root", "mando", "canal.jsonl")
    try:
        lineas = open(nombre_archivo, encoding="utf-8").read().splitlines()
    except Exception:
        return []
    resultado = []
    for l in lineas[-max_lineas:]:
        try:
            fila = json.loads(l)
        except Exception:
            continue
        epoch = fila.get("epoch")
        if desde_epoch is None or epoch is None or epoch > desde_epoch:
            resultado.append(fila)
    return resultado


def _telegram_get(token, offset=None, timeout=20, limite=100):
    """Long polling sencillo: GET /bot<token>/getUpdates.

    Devuelve (lista_de_updates, nuevo_offset). Es la única función que habla
    con Telegram salvo enviar mensajes; los tests la evitan.
    """
    params = urllib.parse.urlencode({
        "timeout": timeout,
        "limit": limite,
        "allowed_updates": json.dumps(["message", "edited_message"]),
    })
    url = "https://api.telegram.org/bot%s/getUpdates?%s" % (token, params)
    if offset is not None:
        url += "&offset=%d" % (offset + 1)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "starseed-telegram-puente/1.0"})
        with urllib.request.urlopen(req, timeout=timeout + 10) as r:
            datos = json.load(r)
    except Exception:
        return [], offset or 0
    if not datos.get("ok"):
        return [], offset or 0
    respuestas = datos.get("result") or []
    if respuestas:
        nuevo_offset = max(u.get("update_id", 0) for u in respuestas)
    else:
        nuevo_offset = offset or 0
    return respuestas, nuevo_offset


def _telegram_send(token, chat_id, texto, reply_markup=None, disable_notification=False):
    """POST /bot<token>/sendMessage.

    El único efecto externo de escribir una orden; los tests NO lo llaman.
    Devuelve un dict con ok / error.
    """
    if not chat_id:
        return {"ok": False, "description": "sin chat_id"}
    payload = {
        "chat_id": str(chat_id),
        "text": texto,
        "parse_mode": "Markdown",
        "disable_notification": disable_notification,
    }
    if reply_markup:
        payload["reply_markup"] = json.dumps(reply_markup)
    try:
        datos = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            "https://api.telegram.org/bot%s/sendMessage" % token,
            data=datos, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        return {"ok": False, "description": "%s: %s" % (e.code, e.reason)}
    except Exception as e:
        return {"ok": False, "description": "%s: %s" % (type(e).__name__, e)}


def _marcos_aprobacion(ids):
    """Keyboard de Telegram con un botón por tarea para aprobar / rechazar."""
    filas = []
    for i in ids:
        filas.append([
            {"text": "Aprobar %s" % i, "callback_data": "telegram-aprobar-%s" % i},
            {"text": "Rechazar %s" % i, "callback_data": "telegram-rechazar-%s" % i},
        ])
    return {"inline_keyboard": filas}


def _mensajes_resumen(estado):
    """Construye los fragmentos de texto que saca el bot por su cuenta, sin
    que nadie pregunte. Recibe lo que devolvió _status() (puede ser None o el
    dict del Mando) y devuelve una lista de objetos canal listos para reenviar.

    Es puramente descriptiva: no decide qué reenviar, solo prepara textos
    candidatos. El filtro de repetición está en es_repetido().
    """
    if not estado or estado.get("_error"):
        return []

    cuentas = estado.get("cuentas") or {}
    ola = str(cuentas.get("ola", ""))
    integradas = cuentas.get("integradas", 0)
    en_curso = cuentas.get("enCurso", 0)
    aprobacion = cuentas.get("esperandoAprobacion", 0)

    frases = []
    # puertas en rojo: cambios recientes entre el estado y lo que ya sabíamos.
    # El bot compara con su propio último estado guardado; aquí solo devuelve el
    # fragmento que el ciclo de arriba decide si es repetido.
    if integradas:
        frases.append({
            "tipo": "hecho",
            "quien": "telegram",
            "texto": "%s integrada · %s tareas cruzadas a main"
                      % (_etiqueta_ola(ola), integradas),
        })

    # puertas rojas: si hay tareas esperando aprobación, avisa.
    if aprobacion:
        ids = []
        for t in (estado.get("tareas") or []):
            if (t.get("fase") or "").lower() in ("esperando-aprobacion", "espera-aprobacion",
                                                  "aprobacion"):
                ids.append(t.get("id") or t.get("tarea") or "?")
        if ids:
            frases.append({
                "tipo": "aviso",
                "quien": "telegram",
                "tarea": ids[0],
                "texto": "Puerta de aprobación humana: %s tarea(s) — /aprobar las libera"
                          % aprobacion,
                "ids_referencia": ids,
            })

    # proveedores sin cuota: el Mando lista cuentas críticas.
    cuentas_criticas = cuentas.get("cuentasCriticas") or []
    for c in cuentas_criticas:
        frases.append({
            "tipo": "aviso",
            "quien": "telegram",
            "texto": "Proveedor sin cuota o 429/402 repetido: %s"
                      % (c.get("nombre") or c.get("motor", "desconocido")),
        })

    # tareas colgadas: quieto > MURMURIO_MAX con bytes parados.
    ahora = time.time()
    colgadas = []
    for t in (estado.get("tareas") or []):
        avance = t.get("avance") or ahora
        quieto = ahora - avance
        bytes_ = t.get("bytes", 0)
        if quieto > MURMURIO_MAX and bytes_ == 0:
            colgadas.append(t)
        elif quieto > MURMURIO_MAX and bytes_ < (t.get("bytesMax", 1) or 1) * 0.01:
            colgadas.append(t)
    if colgadas:
        frases.append({
            "tipo": "aviso",
            "quien": "telegram",
            "tarea": colgadas[0].get("id") or colgadas[0].get("tarea") or "?",
            "texto": "API colgada, no modelo lento: %s lleva %d s sin bytes"
                      % ((colgadas[0].get("id") or colgadas[0].get("tarea") or "?"),
                         int(ahora - (colgadas[0].get("avance") or ahora))),
        })

    return frases


def _formatear_orden_completa(accion, args, extra=None):
    """Convierte la salida de parsear_orden en texto para el canal común.

    Devuelve el texto que se escribe en canal.jsonl cuando el dueño da una
    orden o envía un mensaje suelto. Es puramente textual: no escribe en disco.
    """
    if accion == "mensaje":
        return args[0] if args else ""
    if accion == "decir":
        return "/decir %s" % (" ".join(args) if args else "")
    if accion in ("aprobar", "rechazar", "soltar", "reasignar"):
        base = "/%s %s" % (accion, " ".join(args))
        if extra:
            kvs = " ".join("%s=%s" % kv for kv in extra.items())
            return "%s %s" % (base, kvs)
        return base
    if accion == "personal":
        if len(args) >= 2:
            return "/a %s %s" % (args[0], " ".join(args[1:]))
        return "/a %s" % args[0] if args else "/a"
    if accion == "desconocida":
        return "%s: orden no reconocida" % args[0]
    if accion == "error":
        return args[0] or "orden incompleta"
    return "/%s" % accion


def arranque_completo(entorno=None):
    """Devuelve el texto de arranque que el bot escribe por consola y, si
    puede, al chat de Telegram.

    Se usa al iniciar: detecta si faltan las claves y corta sin tocar nada.
    """
    entorno = os.environ if entorno is None else entorno
    token = entorno.get("TELEGRAM_BOT_TOKEN")
    chat = entorno.get("TELEGRAM_CHAT_ID")
    faltan = []
    if not token:
        faltan.append("TELEGRAM_BOT_TOKEN")
    if not chat:
        faltan.append("TELEGRAM_CHAT_ID")
    return {
        "ok": not faltan,
        "token": bool(token),
        "chat": bool(chat),
        "faltan": faltan,
        "texto": ("Telegram-Puente listo para el chat %s." % chat) if not faltan
                 else ("Telegram-Puente parado: hacen falta %s como variables de entorno."
                       % ", ".join(faltan)),
    }


def _ejecutar_puente():
    print(__doc__[:600])
    print("\n--- arranque ---")
    conf = arranque_completo()
    print(conf["texto"])
    if not conf["ok"]:
        print("Sin arrancar. Define TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID.")
        return 1
    token = _token()
    chat_id = _chat_id()
    canal = os.path.join(
        os.environ.get("STARSEED_ROOT") or "/Users/alex/Documents/starseed-os-main",
        "starseed_memory_root", "mando", "canal.jsonl")

    # Persistencia mínima del último offset y del último estado known para
    # filtrar repetidos. Se guarda en /tmp para no versionar nada.
    BASE = "/tmp/starseed-telegram-puente"
    os.makedirs(BASE, exist_ok=True)
    offset_path = os.path.join(BASE, "offset.json")
    state_path = os.path.join(BASE, "ultimo-enviado.json")

    try:
        offset = json.load(open(offset_path, encoding="utf-8")).get("offset", 0)
    except Exception:
        offset = 0
    try:
        ultimo_enviado = json.load(open(state_path, encoding="utf-8"))
    except Exception:
        ultimo_enviado = {}

    # posición inicial en el canal: no reenviar lo que ya se escribió antes de
    # arrancar el bot.
    try:
        if os.path.exists(canal):
            lineas = open(canal, encoding="utf-8").read().splitlines()
            if lineas:
                last = json.loads(lineas[-1])
                desde = last.get("epoch", 0)
            else:
                desde = 0
        else:
            desde = 0
    except Exception:
        desde = 0

    print("Escuchando Telegram y canal común (%s)…" % canal)
    while True:
        try:
            # 1. Revisar Telegram.
            updates, nuevo_offset = _telegram_get(token, offset, timeout=20)
            for u in updates:
                msg = u.get("message") or u.get("edited_message")
                if not msg:
                    continue
                texto = msg.get("text", "").strip()
                from_info = msg.get("from", {})
                quien = msg.get("chat", {}).get("id")
                if not texto:
                    continue
                parsed = parsear_orden(texto)
                if parsed is None:
                    continue
                accion, args, extra = parsed
                # Ordenes que cambian algo: solo el dueño.
                if accion in ("aprobar", "rechazar", "soltar", "reasignar"):
                    if not _autorizado(quien):
                        print("Ignorada orden %s->%s de chat no autorizado %s"
                              % (accion, args, quien))
                        continue
                if accion == "mensaje":
                    texto_canal = args[0]
                    if texto_canal:
                        import importlib.util as _imp
                        _spec = _imp.spec_from_file_location(
                            "puente", os.path.join(os.path.dirname(__file__), "puente.py"))
                        _p = _imp.module_from_spec(_spec); _spec.loader.exec_module(_p)
                        _p.decir(texto_canal, quien="telegram-%s" % quien, tipo="mensaje")
                        print("→ canal: %s" % texto_canal[:80])
                    continue
                # enviar respuesta al chat:
                if accion == "estado":
                    e = _status()
                    if not e or e.get("_error"):
                        txt = "Mando apagado: no hay qué snapshotear."
                    else:
                        c = e.get("cuentas") or {}
                        txt = "%s · integradas %s · en curso %s · aprobación %s · pendientes %s" % (
                            _etiqueta_ola(c.get("ola", "—"), "OLA"),
                            c.get("integradas", 0),
                            c.get("enCurso", 0),
                            c.get("esperandoAprobacion", 0),
                            c.get("pendientes", 0))
                    res = _telegram_send(token, msg.get("chat", {}).get("id"), txt)
                    print("estado → %s" % (res.get("ok") if res else "?"))
                elif accion == "agentes":
                    txt = "Consulta el Mando: /agentes"
                    _telegram_send(token, msg.get("chat", {}).get("id"), txt)
                elif accion == "puertas":
                    _telegram_send(token, msg.get("chat", {}).get("id"),
                                   "Tres puertas: tsc · vitest · next build (nunca con el enjambre vivo).")
                elif accion == "cola":
                    _telegram_send(token, msg.get("chat", {}).get("id"),
                                   "La cola viva la muestra el Mando; /estado lo trae.")
                elif accion == "ayuda":
                    txt = ("Órdenes Telegram → Puente:\n"
                           "/estado /agentes /olas /cola /puertas /ayuda\n"
                           "/aprobar <id...>   /rechazar <id...>   /soltar <id...>\n"
                           "/reasignar <id> <modelo>\n"
                           '/decir <texto>        → canal común (lo ven los cuatro IDE)\n'
                           '/a <agente> <texto>  → canal dirigiéndose a un agente concreto\n'
                           "Cualquier texto suelto también va al canal.")
                    _telegram_send(token, msg.get("chat", {}).get("id"), txt)
                elif accion in ("aprobar", "rechazar", "soltar"):
                    import importlib.util as _imp2
                    _spec2 = _imp2.spec_from_file_location(
                        "puente", os.path.join(os.path.dirname(__file__), "puente.py"))
                    _p2 = _imp2.module_from_spec(_spec2); _spec2.loader.exec_module(_p2)
                    ids = args
                    accion_orden = accion
                    extra_orden = {}
                    if accion == "soltar":
                        extra_orden["donde"] = "agentes-ia"
                    _p2.orden(accion_orden, ids, extra_orden)
                    _telegram_send(token, msg.get("chat", {}).get("id"),
                                   "Orden «%s» para %s" % (accion, ", ".join(ids)))
                elif accion == "reasignar":
                    import importlib.util as _imp3
                    _spec3 = _imp3.spec_from_file_location(
                        "puente", os.path.join(os.path.dirname(__file__), "puente.py"))
                    _p3 = _imp3.module_from_spec(_spec3); _spec3.loader.exec_module(_p3)
                    _p3.orden("reasignar", [args[0]], {"modelo": args[1]})
                    _telegram_send(token, msg.get("chat", {}).get("id"),
                                   "Reasignado %s → %s" % (args[0], args[1]))
                elif accion == "decir":
                    import importlib.util as _imp4
                    _spec4 = _imp4.spec_from_file_location(
                        "puente", os.path.join(os.path.dirname(__file__), "puente.py"))
                    _p4 = _imp4.module_from_spec(_spec4); _spec4.loader.exec_module(_p4)
                    msg_chat = msg.get("chat", {}).get("id")
                    _p4.decir(args[0], quien="telegram-%s" % msg_chat, tipo="mensaje")
                    _telegram_send(token, msg_chat, "Dicho en el canal común.")
                elif accion == "personal":
                    import importlib.util as _imp5
                    _spec5 = _imp5.spec_from_file_location(
                        "puente", os.path.join(os.path.dirname(__file__), "puente.py"))
                    _p5 = _imp5.module_from_spec(_spec5); _spec5.loader.exec_module(_p5)
                    _p5.decir(args[1], quien="telegram-%s|%s" % (quien, args[0]),
                              tipo="mensaje", tarea=None)
                    _telegram_send(token, msg.get("chat", {}).get("id"),
                                   "Dicho a %s en el canal." % args[0])
                elif accion == "olas":
                    n = int(args[0]) if args and args[0] else 5
                    e = _status()
                    if e and not e.get("_error"):
                        olas = e.get("olas") or []
                        txt = "\n".join("· %s" % (o.get("id") or "?") for o in olas[-n:])
                        _telegram_send(token, msg.get("chat", {}).get("id"), txt or "Sin olas recientes.")
                    else:
                        _telegram_send(token, msg.get("chat", {}).get("id"), "Mando apagado.")
                elif accion == "desconocida":
                    _telegram_send(token, msg.get("chat", {}).get("id"),
                                   "Orden «%s» no reconocida. Escribe /ayuda." % extra)
                elif accion == "error":
                    _telegram_send(token, msg.get("chat", {}).get("id"), args[0] or "¿?")
                else:
                    _telegram_send(token, msg.get("chat", {}).get("id"),
                                   "Instrucción no implementada en Telegram: /%s" % accion)
            if updates:
                offset = nuevo_offset
                with open(offset_path, "w", encoding="utf-8") as f:
                    json.dump({"offset": offset}, f)

            # 2. Vacía el canal común hacia Telegram.
            nuevas = mensajes_canal_desde(canal, desde_epoch=desde)
            for linea in nuevas:
                desde = max(desde, linea.get("epoch", 0) or 0)
                if not debe_reenviar_linea(linea):
                    continue
                if es_repetido(linea, ultimo_enviado):
                    continue
                txt = _pinta_json(linea)
                if not txt:
                    continue
                res = _telegram_send(token, chat_id, txt, disable_notification=True)
                print("canal → %s: %s" % (("OK" if res and res.get("ok") else "NO"), txt[:60]))
                ultimo_enviado = {"tipo": linea.get("tipo"), "texto": linea.get("texto"),
                                  "quien": linea.get("quien"), "tarea": linea.get("tarea"),
                                  "epoch": linea.get("epoch")}
                with open(state_path, "w", encoding="utf-8") as f:
                    json.dump(ultimo_enviado, f)

            # 3. Vigilia propia: ¿qué pasa ahora que merezca un aviso?
            estado = _status()
            candidatos = _mensajes_resumen(estado)
            for c in candidatos:
                # ajustar el candidato para que es_repetido lo juzgue con el
                # último enviado.
                c["epoch"] = time.time()
                if es_repetido(c, ultimo_enviado):
                    continue
                txt = _pinta_json(c)
                if not txt:
                    continue
                ids = c.get("ids_referencia")
                reply = None
                if ids:
                    reply = _marcos_aprobacion(ids)
                res = _telegram_send(token, chat_id, txt, reply_markup=reply)
                print("vigilancia → %s: %s" % (("OK" if res and res.get("ok") else "NO"), txt[:60]))
                ultimo_enviado = {"tipo": c.get("tipo"), "texto": c.get("texto"),
                                  "quien": c.get("quien"),
                                  "tarea": c.get("tarea"),
                                  "epoch": c.get("epoch")}
                with open(state_path, "w", encoding="utf-8") as f:
                    json.dump(ultimo_enviado, f)
        except KeyboardInterrupt:
            print("\nAdiós.")
            return 0
        except Exception as e:
            print("Error de ciclo: %s: %s" % (type(e).__name__, e))
        time.sleep(1)
    return 0


def main():
    conf = arranque_completo()
    if not conf["ok"]:
        return _ejecutar_puente()
    adquirido, motivo = adquirir_cerrojo()
    if not adquirido:
        print(motivo)
        return 1
    try:
        return _ejecutar_puente()
    finally:
        liberar_cerrojo()


if __name__ == "__main__":
    sys.exit(main() or 0)
