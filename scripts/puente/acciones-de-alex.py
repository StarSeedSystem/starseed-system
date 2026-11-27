#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Lo único que hace falta de Alex, en un solo sitio y con el enlace o la orden ya escrita.

Alex (2026-09-20): «para todo lo que requiera de mi acción recuerda enviarme los enlaces
directos y/o los comandos para la terminal… (como lo de github para los contenedores o lo
del check-in diario para la api o verificaciones humanas)».

El sistema YA sabe cuándo hace falta: `pasarelas.py` clasifica cada pasarela y guarda su
enlace, el informe del renovador dice cuál está en `fichaje` o `sin_clave`, y `gh` dice qué
secretos faltan en el repo. Lo que no había era un sitio donde mirarlo TODO junto. Esto lo
arma y lo deja en `starseed_memory_root/mando/acciones-de-alex.json`, que Genesis pinta y
cualquier IDE puede leer.

Regla de este archivo: una acción solo entra si Claude NO puede hacerla. Todo lo que se
pueda resolver desde aquí no se le pide — y lo que se le pide viene con enlace o con la
orden lista para pegar, nunca con una descripción de lo que tendría que hacer.

  python3 scripts/puente/acciones-de-alex.py          # imprime y guarda
  python3 scripts/puente/acciones-de-alex.py --json   # solo el JSON
"""
import importlib.util
import json
import os
import re
import subprocess
import sys

# cupo_codex: para detectar si la cuenta de ChatGPT no admite Codex
try:
    _spec_cupo = importlib.util.spec_from_file_location(
        "cupo_codex", os.path.join(os.path.dirname(os.path.abspath(__file__)), "cupo_codex.py"))
    _cupo = importlib.util.module_from_spec(_spec_cupo)
    _spec_cupo.loader.exec_module(_cupo)
except Exception:
    _cupo = None

RAIZ = os.environ.get("STARSEED_ROOT") or "/Users/alex/Documents/starseed-os-main"
INFORME = os.path.expanduser("~/.starseed/pasarelas-informe.json")
SALIDA = os.path.join(RAIZ, "starseed_memory_root", "mando", "acciones-de-alex.json")
#: (CAP1119A) UN pedido de fichaje por día y pasarela. La tarjeta sigue en la lista
#: mientras la sonda diga «fichaje»; lo que no se repite es el aviso de petición.
PEDIDOS = os.path.join(RAIZ, "starseed_memory_root", "mando", "fichajes-diarios.json")

_spec = importlib.util.spec_from_file_location(
    "pasarelas", os.path.join(os.path.dirname(os.path.abspath(__file__)), "pasarelas.py"))
_pas = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_pas)

# Higgsfield (HGF1113B): leer propuestas pendientes para acciones-de-alex
try:
    _spec_hfa = importlib.util.spec_from_file_location(
        "higgsfield_aprobado", os.path.join(os.path.dirname(os.path.abspath(__file__)), "higgsfield_aprobado.py"))
    _hfa = importlib.util.module_from_spec(_spec_hfa)
    _spec_hfa.loader.exec_module(_hfa)
except Exception:
    _hfa = None

#: Los nombres que el workflow de la nube lee. Solo NOMBRES, jamás un valor.
#:
#: (2026-09-21) Esta lista estaba ESCRITA DOS VECES —aquí y en `nube-gh.py`— y las dos
#: se desincronizaron: aquí seguía NVIDIA_SHARED_KEY, que no existe en ninguna máquina,
#: así que el medidor «Te toca a ti» le pedía a Alex, con urgencia alta y para siempre,
#: subir una clave que nadie tiene. Ahora la lista es UNA y vive en `nube-gh.py`, que es
#: quien de verdad las sube. Si la importación falla, se cae a una copia mínima para no
#: dejar el medidor mudo, pero la fuente buena es siempre la otra.
try:
    _spec_nube = importlib.util.spec_from_file_location(
        "nube_gh", os.path.join(os.path.dirname(os.path.abspath(__file__)), "nube-gh.py"))
    _nube = importlib.util.module_from_spec(_spec_nube)
    _spec_nube.loader.exec_module(_nube)
    CLAVES_DEL_ENJAMBRE = set(_nube.SECRETOS)
except Exception:
    CLAVES_DEL_ENJAMBRE = {
        "GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "NVIDIA_API_KEY",
        "OPENROUTER_API_KEY", "XKIRO_API_KEY", "AIHUBMIX_API_KEY", "TOKENROUTER_API_KEY",
        "GROQ_API_KEY", "STARSEED_PASARELA_GROQ_KEY",
    }

#: (2026-09-21) Los comandos de esta lista eran RELATIVOS —«python3 scripts/puente/…»— y Alex
#: los pega en la terminal desde su carpeta personal, donde no existe esa ruta:
#:
#:     can't open file '/Users/alex/scripts/puente/nube-gh.py': No such file or directory
#:
#: Una orden que solo funciona si ya estabas en el sitio correcto no es una orden, es un acertijo.
#: Desde aqui todas llevan el `cd` delante, de una pieza, para pegar y ejecutar donde sea.
PREFIJO = "cd %s && " % RAIZ


#: Las que de verdad hacen escribir al enjambre. Si alguna de estas falta, la nube no
#: trabaja y el aviso es urgente. Las demás (AIHUBMIX, TOKENROUTER) son pasarelas de
#: repuesto para cuando las de siempre se quedan sin cupo: útiles, no urgentes.
ESENCIALES_DEL_ENJAMBRE = {
    "OPENROUTER_API_KEY", "GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY",
    "NVIDIA_API_KEY", "GROQ_API_KEY", "STARSEED_PASARELA_GROQ_KEY", "XKIRO_API_KEY",
}

#: (IND1029I, 2026-10-30) El token de grano fino con el que la autopublicación del líder
#: publica sin esta Mac y sin sesión de `gh`. Lo crea Alex UNA vez; el A1 lo guarda en su
#: bóveda. Este medidor solo comprueba si ESTÁ: nunca lee ni imprime su valor.
TOKEN_DESPLIEGUE = "STARSEED_DESPLIEGUE_GH_TOKEN"
#: Enlace directo a crear el token, con nombre y permisos ya puestos en la URL (GitHub los
#: rellena cuando la versión de su web los admite; si no, se marcan a mano en la misma página).
ENLACE_TOKEN_DESPLIEGUE = (
    "https://github.com/settings/personal-access-tokens/new"
    "?name=starseed-despliegue&description=MetaGenesis+publica+sin+la+Mac"
    "&target_name=StarSeedSystem&expires_in=90&contents=write&actions=read&workflows=write"
)
#: (1103 · J) Paso a paso de la página de GitHub: qué repositorio y qué permisos, sin jerga.
PASOS_TOKEN_DESPLIEGUE = (
    "En la página de GitHub: "
    "1) Resource owner: StarSeedSystem. "
    "2) Expiration: 90 days. "
    "3) Repository access: «Only select repositories» y elige SOLO starseed-system. "
    "4) Permissions › Repository permissions: Contents = Read and write (para subir los commits), "
    "Workflows = Read and write (algunos commits tocan .github/workflows y sin esto GitHub los rechaza), "
    "Actions = Read-only (para leer si la CI pasó); Metadata = Read-only se pone sola. "
    "Todo lo demás en «No access» y nada en Account permissions. "
    "5) «Generate token», cópialo (solo se ve una vez) y pégalo cuando lo pida la orden de la terminal "
    "(no se ve al escribir; se guarda en la Mac y en el A1, nunca en el repo)."
)
#: El guion pide el valor sin enseñarlo (no pasa por la línea de órdenes ni por el historial)
#: y después lo sube a la bóveda del A1. Es la misma orden que Alex pega en su terminal.
COMANDO_TOKEN_DESPLIEGUE = (
    PREFIJO + "bash scripts/puente/guardar-clave.sh %s --ambos && "
    "python3 scripts/puente/oracle_claves.py starseed-a1 %s" % (TOKEN_DESPLIEGUE, TOKEN_DESPLIEGUE)
)


def _nombre_valido(nombre):
    """PURA: solo NOMBRES de variable ([A-Z][A-Z0-9_]*), nunca un valor ni una cadena rara."""
    return bool(re.match(r"^[A-Z][A-Z0-9_]*$", str(nombre or "")))


def dice_que_esta(salida):
    """PURA: interpreta la marca SI/NO de la comprobación remota. None si no se pudo mirar."""
    lineas = [l.strip() for l in str(salida or "").splitlines() if l.strip()]
    ultima = lineas[-1] if lineas else ""
    if ultima == "SI":
        return True
    if ultima == "NO":
        return False
    return None


def a1_tiene_clave(nombre=TOKEN_DESPLIEGUE, ssh=None):
    """¿La bóveda del A1 tiene esa variable? Solo sí/no: el valor no se lee ni se imprime.

    La comprobación remota es un `grep -q` (mira si la línea existe y calla el contenido) y
    contesta con la marca `SI` o `NO`. Se miran las dos bóvedas del A1: la del nodo
    (`~/.starseed/env`) y la de la raíz (`/etc/starseed/env`). Si el A1 no responde, None:
    no se le pide a Alex un token que quizá ya está, pero tampoco se inventa que falta.
    """
    if not _nombre_valido(nombre):
        return None
    if ssh is None:
        try:
            spec = importlib.util.spec_from_file_location(
                "oracle_nodo", os.path.join(os.path.dirname(os.path.abspath(__file__)), "oracle_nodo.py"))
            on = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(on)
            ssh = on.ssh
        except Exception:  # noqa: BLE001 — sin A1 no hay comprobación
            return None
    patron = "^(export )?%s=" % nombre
    orden = (
        # (1103 · L) También /etc/starseed/direccion.env (donde lo deja oracle_claves), y sin `[ -e ]`: en /etc/starseed
        # (root 750) el usuario del ssh no puede ni mirar si existe; `sudo -n grep` sobre un archivo que falta solo falla.
        "for f in \"$HOME/.starseed/env\" /etc/starseed/env /etc/starseed/direccion.env; do "
        "if grep -qE '%s' \"$f\" 2>/dev/null; then echo SI; exit 0; fi; "
        "if sudo -n grep -qE '%s' \"$f\" 2>/dev/null; then echo SI; exit 0; fi; "
        "done; echo NO" % (patron, patron)
    )
    try:
        _codigo, salida = ssh(orden, timeout=6)
    except TypeError:
        try:
            _codigo, salida = ssh(orden)
        except Exception:  # noqa: BLE001
            return None
    except Exception:  # noqa: BLE001
        return None
    return dice_que_esta(salida)


def accion_token_despliegue(a1_lo_tiene):
    """PURA: la acción del token de despliegue, solo si el A1 NO lo tiene.

    `a1_lo_tiene` es True (ya está), False (falta) o None (no se pudo comprobar). Con None
    no se pide: una lista que pide cosas que quizá ya están deja de leerse.
    """
    if a1_lo_tiene is not False:
        return None
    return {
        "id": "token-despliegue-a1",
        "titulo": "Token de despliegue para que MetaGenesis publique sin tu Mac",
        "por_que": ("la autopublicación del líder necesita publicar en GitHub sin sesión de "
                    "`gh` y sin esta Mac; con este token, el A1 empuja sus propios commits"),
        "urgencia": "media",
        "comando": COMANDO_TOKEN_DESPLIEGUE,
        "enlace": ENLACE_TOKEN_DESPLIEGUE,
        "por_que_no_lo_hago_yo": ("es un permiso de tu cuenta de GitHub: solo tú puedes "
                                  "crearlo, y el guion lo pide sin que se vea"),
        "detalle": PASOS_TOKEN_DESPLIEGUE,
        "variable": TOKEN_DESPLIEGUE,
    }

#: Qué estados de pasarela necesitan a un humano, y con qué urgencia. `sin_cupo` NO está:
#: una cuota se repone sola y mandarle a hacer algo por eso es hacerle perder el tiempo.
ESTADOS_HUMANOS = {
    _pas.FICHAJE: ("alta", "exige un fichaje diario en su web; sin él, cada tarea que caiga ahí vuelve sin cambios"),
    _pas.SIN_CLAVE: ("alta", "la clave falta, caducó o fue revocada: hay que renovarla"),
    # (2026-09-21) `caida` faltaba, y Alex lo notó: «aún falta que me envíe lo de las apps
    # que hagan falta de renovarse». Una pasarela que no responde DE NINGUNA FORMA no se
    # arregla sola como un cupo: o cambió su API, o la cuenta necesita algo en su web. Va
    # con urgencia media, no alta: el enjambre sigue escribiendo con las demás.
    _pas.CAIDA: ("media", "no responde de ninguna forma: mira su panel por si la cuenta o la API han cambiado"),
}


#: (ACC1126A, 26-11) Pasarelas que Alex decidió RETIRAR en vez de recargar: `{clave: {cuando, por, firma}}`.
#: La firma es la respuesta del servidor que se le enseñó: si la pasarela cambia de respuesta, se vuelve a preguntar.
RETIRADAS = os.path.join(RAIZ, "starseed_memory_root", "mando", "pasarelas-retiradas.json")

#: Qué desbloquea pagar en cada pasarela que hoy pide recarga. Solo hechos medidos o publicados por ellas.
DESBLOQUEA_RECARGA = {
    "apinex": "una recarga ÚNICA de 5 $ o más desbloquea 25 M de tokens gratis al día para siempre (lo dice su propia API)",
    "deepseek": "saldo de pago por uso para deepseek-v4-pro (no hay cupo gratuito: cada tarea gasta del saldo)",
    "xai": "créditos de pago del equipo para grok (se gastan rápido: el 16-09 se acabaron en una tarde)",
    "huggingface": "créditos de Inference Providers (el gratuito, 0,10 $/mes, se repone solo al empezar el mes)",
    "aihubmix": "saldo para seguir usando sus recursos gratuitos",
}

#: Enlace exacto de pago cuando la respuesta del servidor no trae uno. Nunca se paga por él: es para Alex.
ENLACE_PAGO = {
    "deepseek": "https://platform.deepseek.com/top_up",
    "huggingface": "https://huggingface.co/settings/billing",
}


def firma_respuesta(mensaje):
    """PURA: la respuesta del servidor sin lo que cambia en cada llamada (ids de petición, tid, uuids)."""
    texto = re.sub(r"\((?:request_id|tid)[^)]*\)", "", str(mensaje or ""), flags=re.I)
    texto = re.sub(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", "#", texto, flags=re.I)
    return re.sub(r"\s+", " ", texto).strip()[:200]


def enlace_de_pago(clave, mensaje, catalogo=None):
    """PURA: el enlace que da la propia respuesta («Top up at https://…»); si no, el conocido; si no, el del catálogo."""
    hallado = re.search(r"https?://[^\s\"'<>)]+", str(mensaje or ""))
    if hallado:
        return hallado.group(0).rstrip(".,;")
    if clave in ENLACE_PAGO:
        return ENLACE_PAGO[clave]
    return ((catalogo if catalogo is not None else _pas.CATALOGO).get(clave) or {}).get("enlace", "")


def accion_recarga(p, info, retiradas=None, uso=None):
    """PURA (ACC1126A). La tarjeta «decide la recarga» de una pasarela que pide pagar, o None.

    Sale cuando la sonda dice «sin cupo» y la respuesta es de las de «paga para seguir». No sale si Alex ya la
    retiró con esa MISMA respuesta (una sola vez por pasarela hasta que cambie lo que contesta).
    """
    estado = str(p.get("estado") or "")
    mensaje = str(p.get("mensaje") or "").strip()
    if estado != _pas.SIN_CUPO or not _pas.pide_recarga(mensaje):
        return None
    clave = str(p.get("clave") or "")
    if info.get("humano") is False:
        return None
    firma = firma_respuesta(mensaje)
    retirada = (retiradas or {}).get(clave)
    if isinstance(retirada, dict) and str(retirada.get("firma") or "") == firma:
        return None
    nombre = info.get("nombre", clave)
    usadas = int((uso or {}).get(clave) or 0)
    enlace = enlace_de_pago(clave, mensaje)
    desbloquea = DESBLOQUEA_RECARGA.get(clave, "seguir usando esta pasarela")
    modelo = str(p.get("modelo") or "?")
    return {
        "id": "pasarela-%s-recarga" % clave,
        "categoria": "pago",
        "titulo": "%s pide una recarga de pago: ¿recargar o retirar?" % nombre,
        "por_que": "Su API contesta (http %s): «%s». Mientras no decidas, está fuera de la rotación y no se repone sola."
                   % (p.get("http"), mensaje),
        "urgencia": "media",
        "como_hacerlo": ("1. Mira lo que pide y lo que desbloquea. 2. Si quieres pagarlo, hazlo tú en el enlace y pulsa "
                         "«Ya recargué»: la sonda la mide al momento y, si escribe, vuelve a la rotación. 3. Si no, pulsa "
                         "«Retirar»: sale de la rotación y no se vuelve a preguntar mientras conteste lo mismo."),
        "comando": PREFIJO + "python3 scripts/puente/acciones-de-alex.py --aprobar pasarela-%s-recarga" % clave,
        "comando_rechazar": PREFIJO + "python3 scripts/puente/acciones-de-alex.py --rechazar pasarela-%s-recarga" % clave,
        "enlace": enlace,
        "aprobable": True,
        "rechazable": True,
        "etiqueta_aprobar": "Ya recargué",
        "etiqueta_rechazar": "Retirar",
        "por_que_no_lo_hago_yo": "es un pago con tu dinero: la decisión es tuya y el sistema nunca paga nada",
        "detalle": "Desbloquea: %s · aporta a la rotación: %s · tareas hechas antes con ella: %d · firma: %s"
                   % (desbloquea, modelo, usadas, firma[:80]),
        "firma": firma,
    }


def leer_retiradas(ruta=None):
    try:
        with open(ruta or RETIRADAS, encoding="utf-8") as f:
            datos = json.load(f)
        return datos if isinstance(datos, dict) else {}
    except Exception:
        return {}


def retirar_pasarela(clave, firma, por="Alex (MetaGenesis)", ruta=None):
    """Anota la retirada (con la respuesta que se le enseñó). Nunca borra nada: solo añade o actualiza su entrada."""
    ruta = ruta or RETIRADAS
    datos = leer_retiradas(ruta)
    datos[clave] = {"cuando": __import__("time").strftime("%Y-%m-%d %H:%M"), "por": por, "firma": firma}
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    tmp = ruta + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    os.replace(tmp, ruta)
    return datos[clave]


def uso_por_pasarela(ruta=None):
    """Cuántas tareas del enjambre escribió cada pasarela (por el prefijo del modelo en progreso.json). Nunca lanza."""
    ruta = ruta or os.path.join(RAIZ, "starseed_memory_root", "olas", "progreso.json")
    try:
        with open(ruta, encoding="utf-8") as f:
            datos = json.load(f)
    except Exception:
        return {}
    tareas = datos.get("tareas", datos) if isinstance(datos, dict) else {}
    cuenta = {}
    for t in (tareas.values() if isinstance(tareas, dict) else []):
        if not isinstance(t, dict) or t.get("estado") not in ("commit", "integrada"):
            continue
        modelo = str(t.get("modelo") or "")
        if "/" in modelo:
            pref = modelo.split("/", 1)[0]
            cuenta[pref] = cuenta.get(pref, 0) + 1
    return cuenta


def _entorno_con_env():
    """El entorno del proceso MÁS `~/.starseed/env`, que es donde viven de verdad las
    variables del enjambre: el director corre desde launchd y no las hereda."""
    datos = dict(os.environ)
    # Los MISMOS sitios de los que tiran los servicios. El de Telegram arranca con
    # `source ~/.hermes/.env` (ver com.starseed.telegram.plist), así que mirar solo
    # `~/.starseed/env` daba una falsa alarma: decía que no había canal habiéndolo.
    for archivo in ("~/.starseed/env", "~/.hermes/.env"):
        try:
            with open(os.path.expanduser(archivo), encoding="utf-8") as f:
                for linea in f:
                    linea = linea.strip()
                    if linea.startswith("export "):
                        linea = linea[7:]
                    if "=" in linea and not linea.startswith("#"):
                        k, _, v = linea.partition("=")
                        datos.setdefault(k.strip(), v.strip().strip('"').strip("'"))
        except OSError:
            continue
    return datos


def accion_sin_canal(entorno):
    """PURA: la acción que aparece cuando NO hay forma de avisar a Alex. O None.

    (2026-09-22) Alex: «el "te toca a ti" no me ha avisado del fichaje de la api ni de
    nada». Y era cierto, pero no porque no lo detectara: el canal quedó medido así:

        canal.jsonl       → «nueva: NVIDIA Build (NIM): renovar la clave» (10:04 y 10:10)
                            «nueva: apinex: renovar la clave»             (10:54)
        ~/.starseed/env   → sin TELEGRAM_BOT_TOKEN ni TELEGRAM_CHAT_ID
        /tmp/starseed-telegram.log → 0 bytes desde el 20 de septiembre

    O sea: el aviso se escribía en un archivo del disco que nadie lee, el puente de
    Telegram llevaba dos días vivo sin poder mandar nada, y el director marcaba la acción
    como «avisada» —así que no la repetía nunca más—. Avisar a un archivo no es avisar.

    Esto no lo puedo arreglar yo: el token y el chat son credenciales suyas y no las toco.
    Lo que sí puedo es dejar de fingir que le avisé y ponerle el comando delante.
    """
    e = entorno or {}
    faltan = [v for v in ("TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID") if not str(e.get(v) or "").strip()]
    if not faltan:
        return None
    return {
        "id": "canal-de-avisos-sin-configurar",
        "titulo": "No hay forma de avisarte: falta el canal de Telegram",
        "por_que": ("los avisos («renovar la clave», «fichaje diario») se escriben en "
                    "canal.jsonl y ahí se quedan: falta %s, así que el puente de Telegram "
                    "no puede mandarte nada" % " y ".join(faltan)),
        "urgencia": "alta",
        "comando": PREFIJO + "bash scripts/puente/telegram-alta.sh",
        "enlace": "https://t.me/BotFather",
        "por_que_no_lo_hago_yo": "son credenciales tuyas: yo no escribo tokens de terceros",
        "detalle": "sin esto, todo lo de esta lista te lo tienes que encontrar tú mirando Genesis",
        "variable": None,
    }


def accion_codex_cuenta(ahora=None):
    """PURA: la acción que aparece cuando la cuenta de ChatGPT no admite Codex.

    Se lee `cupo_codex.leer()` y si hay una marca vigente cuyo `motivo` empieza por
    "cuenta de ChatGPT sin Codex", se devuelve la acción. Si no hay marca, o la marca
    es por cuota agotada, o está vencida, se devuelve None.

    `ahora` es opcional y solo se usa en pruebas para simular el tiempo actual.
    """
    if _cupo is None:
        return None
    marca = _cupo.leer()
    if not marca:
        return None
    if ahora is None:
        ahora = __import__("time").time()
    if not _cupo.sigue_agotado(marca, ahora):
        return None
    motivo = str(marca.get("motivo") or "")
    if not motivo.lower().startswith("cuenta de chatgpt sin codex"):
        return None
    desde = marca.get("desde", "")
    return {
        "id": "codex-cuenta",
        "titulo": "Codex: tu cuenta de ChatGPT ya no deja usarlo",
        "por_que": (
            "desde %s cada intento devuelve \"model not supported when using Codex "
            "with a ChatGPT account\"; el enjambre lo ha apartado y sigue con los demás"
            % desde
        ),
        "urgencia": "media",
        "comando": "",
        "enlace": "https://chatgpt.com/#settings/Account",
        "por_que_no_lo_hago_yo": "es tu cuenta y tu suscripción",
        "detalle": (
            "1) Abre https://chatgpt.com/#settings/Account y mira en Ajustes › Plan "
            "si la suscripción sigue activa.\n"
            "2) Si lo está, actualiza la CLI: `npm i -g @openai/codex` y vuelve a entrar "
            "con `codex login`.\n"
            "3) Si el problema persiste, la cuenta de ChatGPT no da acceso a Codex: "
            "el enjambre seguirá sin él."
        ),
        "variable": None,
    }


def prompt_de_propuesta(propuesta):
    """PURA: el prompt real de una propuesta (`--prompt …`), venga en lista o en cadena."""
    comando = (propuesta or {}).get("comando") or []
    partes = comando if isinstance(comando, (list, tuple)) else str(comando).split()
    for i, token in enumerate(partes):
        if str(token) == "--prompt" and i + 1 < len(partes):
            return " ".join(str(partes[i + 1]).split())
    return ""


def clave_higgsfield(propuesta):
    """PURA: la identidad de una pieza es `pieza + modelo + prompt`.

    (SES1122C) El 22-11 había diez acciones y las diez eran las mismas dos piezas
    propuestas otra vez cada día desde el 17-11. Cambiar la fecha o el id no cambia
    la pieza; cambiar la terna sí.
    """
    p = propuesta or {}
    return (
        " ".join(str(p.get("pieza") or "pieza visual").split()),
        " ".join(str(p.get("modelo") or "seedance-2.0").split()),
        prompt_de_propuesta(p),
    )


def agrupar_propuestas_higgsfield(propuestas):
    """PURA: una entrada por pieza, con todos sus IDs y «N veces desde <fecha>».

    Conserva el orden cronológico y elige como representante la propuesta más
    antigua: su id es el que sigue abriendo la aprobación de siempre.
    """
    grupos, orden = {}, []
    for p in propuestas or []:
        if not isinstance(p, dict) or not p.get("id"):
            continue
        clave = clave_higgsfield(p)
        if clave not in grupos:
            grupos[clave] = []
            orden.append(clave)
        grupos[clave].append(p)
    fuera = []
    for clave in orden:
        miembros = sorted(
            grupos[clave],
            key=lambda p: (str(p.get("fecha") or "9999-99-99"), str(p.get("id") or "")),
        )
        fechas = [str(p.get("fecha")) for p in miembros if p.get("fecha")]
        fuera.append({
            "pieza": clave[0],
            "modelo": clave[1],
            "prompt": clave[2],
            "propuesta_ids": [str(p.get("id")) for p in miembros],
            "desde": min(fechas) if fechas else "",
            "veces": len(miembros),
            "representante": miembros[0],
        })
    fuera.sort(key=lambda g: (g["desde"] or "9999-99-99", str(g["representante"].get("id") or "")))
    return fuera


def ids_del_mismo_grupo(propuestas, pid):
    """PURA: todos los ids que comparten pieza+modelo+prompt con `pid` (o solo `pid`)."""
    objetivo = next((p for p in propuestas or [] if str(p.get("id") or "") == str(pid)), None)
    if objetivo is None:
        return [str(pid)]
    clave = clave_higgsfield(objetivo)
    return [str(p.get("id")) for p in propuestas or []
            if p.get("id") and clave_higgsfield(p) == clave]


def _cuentas_google(dir_cuentas=None, sondear=False):
    """Lee las fichas `~/.starseed/cuentas/*.json` sin imprimir tokens ni secretos."""
    base = dir_cuentas or os.path.expanduser("~/.starseed/cuentas")
    salida = {}
    try:
        nombres = sorted(os.listdir(base))
    except OSError:
        return salida
    if sondear:
        try:
            import cuentas_google as _cg
            from cuentas_google_env import pedir_http as _pedir_http
            for nombre in nombres:
                if not nombre.endswith(".json") or nombre.startswith(".") or nombre == "cliente-oauth.json":
                    continue
                _cg.token(nombre[:-5], _pedir_http, dir_cuentas=base, forzar=True)
        except Exception:
            pass
    for nombre in nombres:
        if not nombre.endswith(".json") or nombre.startswith(".") or nombre == "cliente-oauth.json":
            continue
        alias = nombre[:-5]
        try:
            with open(os.path.join(base, nombre), encoding="utf-8") as f:
                ficha = json.load(f)
        except (OSError, ValueError):
            continue
        if isinstance(ficha, dict):
            salida[alias] = {
                "correo": ficha.get("correo"),
                "error_renovacion": ficha.get("error_renovacion"),
            }
    return salida


def construir_acciones(pasarelas, secretos_repo, catalogo=None, entorno=None, a1_tiene_token=None, ahora=None,
                       cuentas_google=None, retiradas=None, uso=None):
    """Función PURA: la lista de acciones, ordenada por urgencia. Sin red, sin disco.

    `a1_tiene_token` llega ya medido (True/False/None): aquí no se sale a la red. Con None
    la acción del token no aparece, porque no hay prueba de que falte.

    `ahora` es opcional y solo se usa en pruebas para simular el tiempo actual.
    `cuentas_google` es opcional (`{alias: {correo, error_renovacion}}`); con None no toca disco.
    """
    catalogo = catalogo if catalogo is not None else _pas.CATALOGO
    acciones = []

    token = accion_token_despliegue(a1_tiene_token)
    if token:
        acciones.append(token)

    # El canal de avisos es una preocupación aparte de la lista de tareas: solo se mira
    # cuando quien llama pasa un entorno. Así esta función sigue siendo pura y quien solo
    # quiere saber «qué pasarelas piden mano de Alex» no se lleva nada de propina.
    sin_canal = accion_sin_canal(entorno) if entorno is not None else None
    if sin_canal:
        acciones.append(sin_canal)

    # codex-cuenta: no depende del entorno, es un estado global de la máquina
    codex_cuenta = accion_codex_cuenta(ahora)
    if codex_cuenta:
        acciones.append(codex_cuenta)

    if isinstance(cuentas_google, dict):
        for alias in sorted(cuentas_google):
            ficha = cuentas_google.get(alias)
            if not isinstance(ficha, dict):
                continue
            err = str(ficha.get("error_renovacion") or "").strip()
            if not err:
                continue
            correo = str(ficha.get("correo") or alias)
            acciones.append({
                "id": "google-oauth-%s" % alias,
                "titulo": "Google OAuth (%s): renovar acceso a Drive y actividad" % alias,
                "por_que": (
                    "la ficha %s (%s) devolvió «%s»; sin renovarla fallan la síntesis diaria en Drive "
                    "y NotebookLM en Telegram (@StarSeed_Design_bot)"
                    % (alias, correo, err)
                ),
                "urgencia": "alta" if alias in ("alex", "alex-docs") else "media",
                "comando": (
                    "%s~/.starseed/herramientas/alta-cuentas-google.py %s && "
                    "python3 scripts/puente/cuentas_google.py estado --verificar && "
                    "python3 scripts/puente/oracle_nodo.py claves && "
                    "python3 scripts/puente/acciones-de-alex.py --verificar google-oauth-%s"
                    % (PREFIJO, alias, alias)
                ),
                "enlace": "https://console.cloud.google.com/apis/credentials/consent",
                "por_que_no_lo_hago_yo": "requiere autorizar el consentimiento OAuth de tu cuenta Google en navegador",
                "detalle": (
                    "Cuenta: %s · error: %s · Para que no caduque cada 7 días, publica la app OAuth "
                    "«StarSeed actividad» en Google Cloud (de Prueba a Producción) y repite el alta."
                    % (correo, err)
                ),
                "variable": None,
            })

    # Si `secretos_repo` es None, `gh secret list` falló temporalmente (red/timeout): no fingimos que faltan todas.
    faltan = sorted(CLAVES_DEL_ENJAMBRE - set(secretos_repo)) if secretos_repo is not None else []
    # (2026-10-28, DEC1028A) Alex: «¿lo de github-secretos se debe hacer?». Si solo faltan claves de repuesto
    # y esta Mac no tiene valor para ninguna, `nube-gh.py secretos` no sube nada: pedirlo es pedir algo que no
    # se puede hacer. Sin entorno (pruebas puras) la regla es la de siempre.
    if faltan and entorno is not None and not (ESENCIALES_DEL_ENJAMBRE & set(faltan)) \
            and not any(str(entorno.get(c) or "").strip() for c in faltan):
        faltan = []
    if faltan:
        # (2026-09-21) La urgencia era SIEMPRE «alta» y el porqué decía que sin esas claves
        # la nube «arranca, instala y muere». Eso dejó de ser verdad el día 20, cuando Alex
        # subió las siete que de verdad escriben: el run 35568545557 trabajó 36 minutos con
        # ellas. Seguir pidiéndoselo en rojo por dos pasarelas de repuesto es gastarle la
        # atención, y una lista que pide cosas que no hacen falta deja de leerse.
        criticas = sorted(ESENCIALES_DEL_ENJAMBRE & set(faltan))
        acciones.append({
            "id": "github-secretos",
            "titulo": (
                "Subir las claves de proveedor a los secretos del repo"
                if criticas
                else "Añadir dos pasarelas de repuesto a los secretos del repo"
            ),
            "por_que": (
                ("sin ellas la nube arranca, instala y muere en el paso de claves: "
                 "faltan las que de verdad escriben (%s)" % ", ".join(criticas))
                if criticas
                else ("la nube YA funciona con las que subiste; estas dos solo añaden "
                      "pasarelas de repuesto para cuando las de siempre se queden sin cupo")
            ),
            "urgencia": "alta" if criticas else "baja",
            "comando": PREFIJO + "python3 scripts/puente/nube-gh.py secretos",
            "enlace": "https://github.com/StarSeedSystem/starseed-system/settings/secrets/actions",
            "por_que_no_lo_hago_yo": "mueve valores de claves tuyas a un tercero: esa decisión es tuya",
            "detalle": "faltan %d: %s" % (len(faltan), ", ".join(faltan)),
        })

    for p in pasarelas or []:
        estado = str(p.get("estado") or "")
        # ACC1126A: «sin cupo» que en realidad es «paga para seguir» → decisión de pago (recargar o retirar).
        recarga = accion_recarga(p, catalogo.get(str(p.get("clave") or "")) or {}, retiradas=retiradas, uso=uso)
        if recarga:
            acciones.append(recarga)
            continue
        if estado not in ESTADOS_HUMANOS:
            continue
        clave = str(p.get("clave") or "")
        info = catalogo.get(clave) or {}
        # DIR1121H: una pasarela que el catálogo marca `humano: False` (Ollama del A1, OpenCode Zen) no tiene nada que una
        # persona pueda renovar: su fallo es del sistema y lo arregla el sistema, no es una acción de Alex.
        if info.get("humano") is False:
            continue
        # CAIDA necesita racha
        if estado == _pas.CAIDA:
            caidas = int(p.get("caidas_seguidas") or 0)
            caida_desde = str(p.get("caida_desde") or "")
            if not caidas or not caida_desde:
                continue
            # comprobar >=3 pruebas y >=6h
            from datetime import datetime, timedelta
            try:
                desde_dt = datetime.strptime(caida_desde, "%Y-%m-%d %H:%M")
                ahora_dt = datetime.now()
                horas = (ahora_dt - desde_dt).total_seconds() / 3600
            except Exception:
                continue
            if caidas < 3 or horas < 6:
                continue
            urgencia = "media"
            titulo = "%s: mira su panel" % info.get("nombre", clave)
            por_que = "lleva más de 6 horas sin responder de ninguna forma; puede que la cuenta o la API hayan cambiado"
            detalle = "sin respuesta desde %s · %d pruebas · modelo %s" % (caida_desde, caidas, p.get("modelo"))
            acciones.append({
                "id": "pasarela-%s-%s" % (clave, estado),
                "titulo": titulo,
                "por_que": por_que,
                "urgencia": urgencia,
                "comando": (PREFIJO + "bash scripts/puente/guardar-clave.sh %s --ambos" % p["variable"]
                            if p.get("variable") else ""),
                "enlace": info.get("enlace", ""),
                "por_que_no_lo_hago_yo": "Claude no teclea claves de terceros; el guion las pide sin que se vean",
                "detalle": detalle,
            })
            continue
        urgencia, porque = ESTADOS_HUMANOS[estado]
        mensaje_srv = str(p.get("mensaje") or "").strip()
        acciones.append({
            "id": "pasarela-%s-%s" % (clave, estado),
            "titulo": "%s: %s" % (info.get("nombre", clave), "fichaje diario" if estado == _pas.FICHAJE else "renovar la clave"),
            "por_que": info.get("nota") or porque,
            "urgencia": urgencia,
            "comando": (PREFIJO + "bash scripts/puente/guardar-clave.sh %s --ambos" % p["variable"]
                        if estado != _pas.FICHAJE and p.get("variable") else ""),
            "enlace": info.get("enlace", ""),
            "por_que_no_lo_hago_yo": ("hay que pulsar un botón en su web con tu sesión"
                                      if estado == _pas.FICHAJE
                                      else "Claude no teclea claves de terceros; el guion las pide sin que se vean"),
            "detalle": "http %s · modelo %s%s" % (
                p.get("http"), p.get("modelo"), (" · %s" % mensaje_srv) if mensaje_srv else ""),
        })

    # Higgsfield (HGF1113B, SES1122C): propuestas pendientes agrupadas por pieza.
    # Misma pieza+modelo+prompt es la misma pieza: una tarjeta, con todos sus IDs
    # dentro para que aprobar o rechazar siga funcionando.
    if _hfa is not None:
        try:
            propuestas = _hfa._leer(_hfa.DIR, "propuestas.json", [])
            if isinstance(propuestas, dict):
                propuestas = propuestas.get("propuestas") or []
            aprobaciones = _hfa._leer(_hfa.DIR, "aprobaciones.json", {})
            pendientes = [p for p in propuestas
                          if str(p.get("id") or "") and str(p.get("id")) not in aprobaciones]
            for grupo in agrupar_propuestas_higgsfield(pendientes):
                p = grupo["representante"]
                pid = str(p.get("id") or "")
                ids = grupo["propuesta_ids"]
                veces = grupo["veces"]
                desde = grupo["desde"]
                proyecto = str(p.get("proyecto") or "starseed")
                pieza = str(p.get("pieza") or "pieza visual")
                modelo = str(p.get("modelo") or "seedance-2.0")
                motivo_hf = str(p.get("motivo") or "Propuesta audiovisual de StarSeed OS")
                tomas = int(p.get("tomas") or 1)
                fecha_hf = str(p.get("fecha") or "")
                est = float(p.get("creditos_estimados") or 0)
                cmd_raw = p.get("comando") or []
                prompt_hf = prompt_de_propuesta(p)
                cmd_preview = (" ".join(str(x) for x in cmd_raw)
                               if isinstance(cmd_raw, list) else str(cmd_raw))
                repeticion = ""
                if veces > 1:
                    repeticion = " · propuesta %d veces%s" % (
                        veces, (" desde %s" % desde) if desde else "")
                acciones.append({
                    "id": "higgsfield-%s" % pid,
                    "categoria": "higgsfield",
                    "propuesta_id": pid,
                    "propuesta_ids": ids,
                    "ids_acciones": ["higgsfield-%s" % x for x in ids],
                    "veces": veces,
                    "desde": desde,
                    "proyecto": proyecto,
                    "pieza": pieza,
                    "modelo": modelo,
                    "tomas": tomas,
                    "fecha": fecha_hf,
                    "creditos_estimados": est,
                    "motivo": motivo_hf,
                    "prompt": prompt_hf,
                    "aprobable": True,
                    "rechazable": True,
                    "titulo": "Higgsfield · %s: %s (%s)" % (proyecto, pieza, modelo),
                    "por_que": "%s · Modelo %s · %d toma(s) · est. %.1f créditos%s" % (
                        motivo_hf, modelo, tomas, est, repeticion),
                    "urgencia": "media",
                    "como_hacerlo": (
                        "1. Revisa el proyecto, modelo, coste (%.1f créditos) y el prompt que se enviará. "
                        "2. Pulsa «Aprobar» si autorizas ejecutar esta generación (también vale `/higgsfield aprobar %s` en Telegram). "
                        "3. Pulsa «Rechazar» si no quieres gastar créditos ni ver esta propuesta."
                    ) % (est, pid),
                    "comando": PREFIJO + "python3 scripts/puente/acciones-de-alex.py --aprobar higgsfield-%s" % pid,
                    "comando_rechazar": PREFIJO + "python3 scripts/puente/acciones-de-alex.py --rechazar higgsfield-%s" % pid,
                    "comando_higgsfield": cmd_preview,
                    "comando_telegram": "/higgsfield aprobar %s" % pid,
                    "enlace": "https://higgsfield.ai",
                    "por_que_no_lo_hago_yo": "solo Alex puede aprobar o rechazar gastos de Higgsfield",
                    "detalle": "ID %s%s · Comando real: %s%s%s" % (
                        pid,
                        " (%s)" % fecha_hf if fecha_hf else "",
                        cmd_preview,
                        (" · Prompt: %s" % prompt_hf) if prompt_hf else "",
                        repeticion,
                    ),
                })
        except Exception:
            pass

    orden = {"alta": 0, "media": 1, "baja": 2}
    acciones.sort(key=lambda a: (orden.get(a["urgencia"], 9), a["id"]))
    return acciones


def _pasarelas():
    try:
        with open(INFORME, encoding="utf-8") as f:
            return (json.load(f) or {}).get("pasarelas") or []
    except Exception:
        return []


def _secretos():
    try:
        r = subprocess.run(["gh", "secret", "list", "--json", "name", "--jq", ".[].name"],
                           cwd=RAIZ, capture_output=True, text=True, timeout=60)
        if r.returncode != 0:
            return None
        return [l.strip() for l in (r.stdout or "").splitlines() if l.strip()]
    except Exception:
        return None


def clave_de_accion(id_accion):
    """PURA: «pasarela-apinex-fichaje» → «apinex». None si la acción no es de una pasarela.
    El estado va al final y puede llevar guion bajo (`sin_clave`), nunca guion."""
    texto = str(id_accion or "")
    if not texto.startswith("pasarela-"):
        return None
    resto = texto[len("pasarela-"):]
    clave, _, estado = resto.rpartition("-")
    return clave or None


def es_id_de_fichaje(id_accion):
    """PURA: identifica el aviso diario de una pasarela (id estable, sin día)."""
    texto = str(id_accion or "")
    return texto.startswith("pasarela-") and texto.endswith("-fichaje")


def _dia_local(ahora=None):
    """PURA: día local del momento inyectado (o de ahora) como «AAAA-MM-DD»."""
    import time as _t
    import datetime as _dt
    if ahora is None:
        return _t.strftime("%Y-%m-%d")
    if isinstance(ahora, (int, float)):
        return _dt.datetime.fromtimestamp(ahora).strftime("%Y-%m-%d")
    if isinstance(ahora, _dt.datetime):
        return ahora.strftime("%Y-%m-%d")
    return str(ahora)[:10]


def pedido_diario(acciones, pedidos, ahora=None):
    """PURA: (acciones, marcas) con UN pedido de fichaje por día y pasarela.

    La tarjeta NO se esconde: mientras la sonda siga pidiendo fichaje debe verse
    en Genesis y seguir teniendo su botón «Ya lo hice». Lo que cambia es el campo
    `nuevo_hoy`, que solo vale True en el primer pedido del día. Cuando la sonda
    vuelve a escribir no hay tarjeta y la marca se retira: si mañana vuelve a
    hacer falta, vuelve a pedirse.
    """
    dia = _dia_local(ahora)
    marcas = {k: v for k, v in (pedidos or {}).items() if es_id_de_fichaje(k)}
    visibles = []
    for accion in acciones or []:
        if es_id_de_fichaje(accion.get("id")):
            id_accion = str(accion["id"])
            visibles.append(dict(accion, nuevo_hoy=marcas.get(id_accion) != dia, dia=dia))
            marcas[id_accion] = dia
        else:
            visibles.append(accion)
    presentes = {str(a.get("id")) for a in visibles if es_id_de_fichaje(a.get("id"))}
    return visibles, {k: v for k, v in marcas.items() if k in presentes}


def _leer_pedidos(ruta):
    try:
        with open(ruta, encoding="utf-8") as f:
            dato = json.load(f)
        return dato if isinstance(dato, dict) else {}
    except (OSError, ValueError):
        return {}


def registrar_pedido_diario(acciones, ahora=None, ruta=PEDIDOS):
    """Guarda la marca del día (atómico) y devuelve las acciones con su marca."""
    visibles, marcas = pedido_diario(acciones, _leer_pedidos(ruta), ahora)
    try:
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        tmp = ruta + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(marcas, f, ensure_ascii=False, indent=1)
        os.replace(tmp, ruta)
    except OSError:
        pass
    return visibles


def actualizar_pasarela(pasarelas, clave, medida):
    """PURA: la lista de pasarelas con la entrada de `clave` sustituida por la medida nueva
    (http, estado, segundos, comprobado). Si no estaba, se añade."""
    fuera, vista = [], False
    for p in pasarelas or []:
        if isinstance(p, dict) and p.get("clave") == clave:
            nueva = dict(p)
            nueva.update(medida)
            fuera.append(nueva)
            vista = True
        else:
            fuera.append(p)
    if not vista:
        fuera.append(dict(medida, clave=clave))
    return fuera


def resondear(clave, segundos=20):
    """Mide AHORA una pasarela con la misma sonda del renovador (ocho tokens) y deja el
    resultado en el informe, para que Genesis y el enjambre vean lo mismo que el botón.

    (2026-09-23) Alex: «no funciona la comprobación del check-in de apinex: responde error
    cuando compruebo que ya lo hice». Medido: el informe era de las 15:51, él fichó y pulsó
    «Ya lo hice» a las 15:53, y `verificar` —que decía «vuelve a MEDIR»— leía ese informe
    viejo: contestaba «http 402 · modelo free/glm-5.3-flash» con apinex escribiendo ya
    (HTTP 200 al sondearla a mano). Un botón de comprobar que no comprueba.

    Devuelve la medida {http, estado, segundos, comprobado} o None si no hay sonda para esa
    clave. Nunca imprime ni guarda el valor de ninguna clave."""
    import time as _t

    try:
        spec = importlib.util.spec_from_file_location(
            "renovador", os.path.join(os.path.dirname(os.path.abspath(__file__)), "renovador-pasarelas.py"))
        renovador = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(renovador)
    except Exception:
        return None
    sonda = next((s for s in renovador.SONDAS if s[0] == clave), None)
    if sonda is None:
        return None
    _nombre, url, variable, modelo = sonda
    entorno = renovador.entorno_con_claves()
    t0 = _t.time()
    # DIR1121I: con el NOMBRE. Sin él, «Ya lo hice» medía Experiential Labs con un chat (400 → «caída») y ninguna
    # pasarela local (agy, Ollama del A1, codex) se podía volver a medir: «sigue pendiente» para siempre.
    http, cuerpo, tokens = renovador.sondear(url, entorno.get(variable) if variable else None, modelo, segundos,
                                             nombre=clave)
    medida = {
        "modelo": modelo,
        "variable": variable,
        "tiene_clave": bool(entorno.get(variable)) if variable else True,
        "http": http,
        "estado": _pas.clasificar(http, cuerpo, tokens),
        "segundos": round(_t.time() - t0, 1),
        "comprobado": _t.strftime("%Y-%m-%d %H:%M:%S"),
        "mensaje": "" if tokens else _pas.extraer_mensaje_error(cuerpo),
    }
    try:
        informe = json.load(open(INFORME, encoding="utf-8")) or {}
    except Exception:
        informe = {}
    informe["pasarelas"] = actualizar_pasarela(informe.get("pasarelas") or [], clave, medida)
    try:
        tmp = INFORME + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(informe, f, ensure_ascii=False, indent=1)
        os.replace(tmp, INFORME)
    except OSError:
        pass
    return medida


def verificar(id_accion=None, pasarelas=None, secretos_repo=None, entorno=None, medir=None,
              a1_tiene_token=None, ahora=None, cuentas_google=None):
    """¿Sigue haciendo falta esa accion? Vuelve a MEDIR, no consulta un archivo viejo.

    (2026-09-21, pedido por Alex) «en Genesis en su ventana debe haber un boton
    de verificar para cuando sea realizada la tarea». El boton llama aqui.

    La gracia esta en que NO se cree nada de lo guardado: recoge los hechos otra vez
    —pasarelas vivas y secretos que hay hoy en el repo— y reconstruye la lista. Si la
    accion ya no sale, es que esta hecha, y se dice con lo que se comprobo. Un boton que
    solo marcara una casilla no serviria de nada: es justo la forma de mentir que nos ha
    costado el dia entero.

    Devuelve {id, hecha, titulo, detalle, comprobado, quedan}. Sin `id_accion`, informa de
    todas.

    `ahora` es opcional y solo se usa en pruebas para simular el tiempo actual.
    """
    # Solo en una comprobación de verdad (sin datos inyectados) se reescribe la lista que pinta
    # Genesis: si no, «Ya lo hice» decía «hecho» y la tarjeta seguía ahí hasta la siguiente
    # vuelta del director (hasta 3 min), que es otra forma de no creerse el botón.
    real = pasarelas is None and secretos_repo is None
    # Si la acción es de una pasarela, se MIDE de nuevo esa pasarela antes de nada.
    # `medir` se inyecta en las pruebas; por defecto es la sonda real.
    medida = None
    clave = clave_de_accion(id_accion)
    if clave and pasarelas is None:
        medida = (medir or resondear)(clave)
    pasarelas = pasarelas if pasarelas is not None else _pasarelas()
    if medida:
        pasarelas = actualizar_pasarela(pasarelas, clave, medida)
    secretos_repo = secretos_repo if secretos_repo is not None else _secretos()
    # El token de despliegue también se vuelve a comprobar en la bóveda del A1: si Alex pulse
    # «Ya lo hice», la tarjeta desaparece solo cuando el token está de verdad allí.
    if a1_tiene_token is None and real:
        a1_tiene_token = a1_tiene_clave()
    es_oauth_google = bool(id_accion and str(id_accion).startswith("google-oauth-"))
    cuentas = cuentas_google if cuentas_google is not None else (_cuentas_google(sondear=es_oauth_google) if real else None)
    if real and es_oauth_google:
        alias_oauth = str(id_accion)[len("google-oauth-"):]
        if isinstance(cuentas, dict) and not (cuentas.get(alias_oauth) or {}).get("error_renovacion"):
            try:
                import oracle_nodo as _on
                _on.claves()
            except Exception:
                pass
    # (2026-09-22) Sin el entorno, `canal-de-avisos-sin-configurar` no se reconstruía y el
    # botón «Ya lo hice» contestaba «ya no hace falta» para algo que seguía sin arreglar.
    # Un botón que dice que algo está hecho porque él mismo no sabe mirarlo es justo la
    # forma de mentir que llevamos toda la sesión quitando.
    vivas = construir_acciones(
        pasarelas, secretos_repo,
        entorno=entorno if entorno is not None else _entorno_con_env(),
        a1_tiene_token=a1_tiene_token,
        ahora=ahora,
        cuentas_google=cuentas,
        retiradas=leer_retiradas() if real else None,
        uso=uso_por_pasarela() if real else None,
    )
    por_id = {a["id"]: a for a in vivas}
    momento = __import__("time").strftime("%Y-%m-%d %H:%M:%S")
    if real:
        guardar_lista(registrar_pedido_diario(vivas, ahora))
    if id_accion is None:
        return {
            "comprobado": momento,
            "quedan": len(vivas),
            "acciones": [
                {"id": a["id"], "hecha": False, "titulo": a["titulo"], "detalle": a.get("detalle", "")}
                for a in vivas
            ],
        }
    if id_accion == "github-secretos" and secretos_repo is None:
        return {
            "id": id_accion,
            "hecha": False,
            "titulo": "Subir las claves de proveedor a los secretos del repo",
            "detalle": "no se pudo consultar GitHub (`gh secret list` falló o caducó): vuelve a intentarlo",
            "comprobado": momento,
            "quedan": len(vivas),
        }
    viva = por_id.get(id_accion)
    medido = ""
    if medida:
        mensaje = str(medida.get("mensaje") or "").strip()
        medido = "medido ahora: http %s con %s → %s%s" % (
            medida.get("http"),
            medida.get("modelo"),
            str(medida.get("estado")).replace("_", " "),
            (" · %s" % mensaje) if mensaje else "",
        )
    if viva is None:
        return {
            "id": id_accion,
            "hecha": True,
            "titulo": "",
            "detalle": ("hecho: %s" % medido) if medido else "comprobado de nuevo: ya no hace falta",
            "comprobado": momento,
            "quedan": len(vivas),
        }
    return {
        "id": id_accion,
        "hecha": False,
        "titulo": viva["titulo"],
        "detalle": ("sigue pendiente · %s" % medido) if medido else (viva.get("detalle", "") or viva.get("por_que", "")),
        "comprobado": momento,
        "quedan": len(vivas),
    }


def guardar_lista(acciones):
    """Deja la lista donde la lee Genesis (`/api/mando/acciones`). Nunca lanza."""
    try:
        datos = {"generado": __import__("time").strftime("%Y-%m-%d %H:%M"), "acciones": acciones}
        os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
        tmp = SALIDA + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False, indent=1)
        os.replace(tmp, SALIDA)
    except OSError:
        pass


def _resolver_higgsfield(id_accion, aprobada, por="Alex (MetaGenesis)", motivo="", base_hf=None, regenerar=True):
    """Aprueba o rechaza una propuesta Higgsfield desde MetaGenesis / CLI y actualiza acciones-de-alex.json."""
    if _hfa is None:
        return {"ok": False, "error": "Módulo higgsfield_aprobado no disponible"}
    texto_id = str(id_accion or "").strip()
    pid = texto_id[len("higgsfield-"):] if texto_id.startswith("higgsfield-") else texto_id
    if not pid:
        return {"ok": False, "error": "Falta el identificador de la propuesta"}
    base = base_hf or _hfa.DIR
    propuestas = _hfa._leer(base, "propuestas.json", [])
    if isinstance(propuestas, dict):
        propuestas = propuestas.get("propuestas") or []
    propuesta = next((p for p in propuestas if str(p.get("id") or "") == pid), None)
    if propuesta is None:
        return {"ok": False, "error": "No existe la propuesta %s" % pid}
    # (SES1122C) Una tarjeta agrupada representa toda la pieza: aprobar o rechazar
    # resuelve también las copias pendientes con la misma pieza+modelo+prompt.
    aprobaciones = _hfa._leer(base, "aprobaciones.json", {})
    pendientes_ids = {str(p.get("id")) for p in propuestas
                      if p.get("id") and str(p.get("id")) not in aprobaciones}
    ids = [x for x in ids_del_mismo_grupo(propuestas, pid)
           if x == pid or x in pendientes_ids]
    registros = []
    for p in propuestas:
        if str(p.get("id") or "") in ids:
            r = _hfa.aprobar(p, por=por, aprobada=aprobada, motivo=motivo)
            _hfa.guardar_aprobacion(r, base=base)
            registros.append(r)
    if not registros:
        registro = _hfa.aprobar(propuesta, por=por, aprobada=aprobada, motivo=motivo)
        _hfa.guardar_aprobacion(registro, base=base)
        registros = [registro]
    registro = next((r for r in registros if r["id"] == pid), registros[0])
    quedan = None
    if regenerar:
        vivas = registrar_pedido_diario(
            construir_acciones(_pasarelas(), _secretos(), entorno=_entorno_con_env(),
                               a1_tiene_token=a1_tiene_clave(), cuentas_google=_cuentas_google(),
                               retiradas=leer_retiradas(), uso=uso_por_pasarela()))
        guardar_lista(vivas)
        quedan = len(vivas)
    return {
        "ok": True,
        "id": "higgsfield-%s" % pid,
        "propuesta_id": pid,
        "propuesta_ids": ids,
        "estado": registro["estado"],
        "por": registro["por"],
        "cuando": registro["cuando"],
        "quedan": quedan,
    }


def es_id_de_recarga(id_accion):
    """PURA: «pasarela-apinex-recarga» es la decisión de pago de apinex."""
    texto = str(id_accion or "")
    return texto.startswith("pasarela-") and texto.endswith("-recarga")


def aprobar_accion(id_accion, por="Alex (MetaGenesis)", base_hf=None, regenerar=True, medir=None):
    if str(id_accion or "").startswith("higgsfield-"):
        return _resolver_higgsfield(id_accion, True, por=por, base_hf=base_hf, regenerar=regenerar)
    if es_id_de_recarga(id_accion):
        # «Ya recargué»: no se cree el botón; se MIDE la pasarela otra vez y la lista se rehace con esa medida.
        res = verificar(id_accion, medir=medir)
        res["ok"] = True
        res["vuelve_a_la_rotacion"] = bool(res.get("hecha"))
        return res
    return {"ok": False, "error": "Esta acción se comprueba con --verificar, no se aprueba aquí"}


def rechazar_accion(id_accion, por="Alex (MetaGenesis)", motivo="Rechazada por Alex desde MetaGenesis", base_hf=None, regenerar=True,
                    ruta_retiradas=None):
    if str(id_accion or "").startswith("higgsfield-"):
        return _resolver_higgsfield(id_accion, False, por=por, motivo=motivo, base_hf=base_hf, regenerar=regenerar)
    if es_id_de_recarga(id_accion):
        # «Retirar»: se anota con la respuesta que tenía; no se vuelve a preguntar mientras conteste lo mismo.
        clave = clave_de_accion(id_accion)
        medida = next((p for p in _pasarelas() if str(p.get("clave") or "") == clave), {})
        anotada = retirar_pasarela(clave, firma_respuesta(medida.get("mensaje")), por=por, ruta=ruta_retiradas)
        quedan = None
        if regenerar:
            vivas = registrar_pedido_diario(
                construir_acciones(_pasarelas(), _secretos(), entorno=_entorno_con_env(), a1_tiene_token=a1_tiene_clave(),
                                   cuentas_google=_cuentas_google(), retiradas=leer_retiradas(), uso=uso_por_pasarela()))
            guardar_lista(vivas)
            quedan = len(vivas)
        return {"ok": True, "id": id_accion, "estado": "retirada", "por": por, "cuando": anotada["cuando"], "quedan": quedan}
    return {"ok": False, "error": "Esta acción solo se resuelve al corregir su causa y recomprobar"}


def main():
    if "--aprobar" in sys.argv:
        i = sys.argv.index("--aprobar")
        cual = sys.argv[i + 1] if len(sys.argv) > i + 1 else ""
        res = aprobar_accion(cual)
        print(json.dumps(res, ensure_ascii=False, indent=1))
        return 0 if res.get("ok") else 1
    if "--rechazar" in sys.argv:
        i = sys.argv.index("--rechazar")
        cual = sys.argv[i + 1] if len(sys.argv) > i + 1 else ""
        motivo = "Rechazada por Alex desde MetaGenesis"
        if "--motivo" in sys.argv:
            j = sys.argv.index("--motivo")
            if len(sys.argv) > j + 1:
                motivo = sys.argv[j + 1]
        res = rechazar_accion(cual, motivo=motivo)
        print(json.dumps(res, ensure_ascii=False, indent=1))
        return 0 if res.get("ok") else 1
    if "--verificar" in sys.argv:
        i = sys.argv.index("--verificar")
        cual = sys.argv[i + 1] if len(sys.argv) > i + 1 else None
        print(json.dumps(verificar(cual), ensure_ascii=False, indent=1))
        return 0
    acciones = registrar_pedido_diario(
        construir_acciones(_pasarelas(), _secretos(), entorno=_entorno_con_env(),
                           a1_tiene_token=a1_tiene_clave(), cuentas_google=_cuentas_google(),
                           retiradas=leer_retiradas(), uso=uso_por_pasarela()))
    datos = {"generado": __import__("time").strftime("%Y-%m-%d %H:%M"), "acciones": acciones}
    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    json.dump(datos, open(SALIDA, "w"), ensure_ascii=False, indent=1)
    if "--json" in sys.argv:
        print(json.dumps(datos, ensure_ascii=False, indent=1))
        return 0
    if not acciones:
        print("Nada que necesite a Alex ahora mismo.")
        return 0
    print("ACCIONES QUE SOLO PUEDE HACER ALEX (%d)\n" % len(acciones))
    for a in acciones:
        print("· %s  [%s]" % (a["titulo"], a["urgencia"]))
        print("  por qué: %s" % a["por_que"])
        if a.get("enlace"):
            print("  enlace : %s" % a["enlace"])
        if a.get("comando"):
            print("  orden  : %s" % a["comando"])
        print("  (yo no: %s)\n" % a["por_que_no_lo_hago_yo"])
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
