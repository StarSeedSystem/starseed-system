# -*- coding: utf-8 -*-
"""Director presidente del Chat Director de Genesis (DIR1111G).

Alex (2026-11-11): «un canal principal, el Director presidente, que se autoenrute entre
modelos, contigo [Claude] así como con Hermes y otros medios y proveedores… el que debe
responder lo principal de los chats de dirección».

El cartero (`cartero_director.py`) llama a `atender` por cada mensaje con entrega
pendiente en el canal «director-presidente». Aquí se decide QUIÉN contesta, sin listas
nuevas de modelos: se reutiliza lo que Genesis ya tiene.

  1. Claude Opus 5.5 en la Mac (`claude -p`, el motor de «claude-mac»), solo si sus límites
     lo permiten: lectura reciente de `limites_claude.py` sin la sesión ni la semana en
     «peligro», y el tope diario de Opus del cartero sin agotar.
  2. Hermes (`hermes -z`), que ya se autoenruta por los proveedores gratuitos vivos
     (`enrutar-hermes.py` ordena su cadena con el informe de pasarelas).
  3. ChatGPT por Codex (`codex exec`), si está instalado.

Si el primero no está o falla, se prueba el siguiente y la respuesta dice por qué. Si
nadie puede, el mensaje queda EN COLA (entrega «pendiente» con su detalle visible) y se
reintenta solo; nunca se tira ni se contesta con una frase hecha.

Todo lo que toca el mundo (ejecutar órdenes, leer límites, ver si hay CLI) se inyecta:
las pruebas usan falsos y carpetas temporales.
"""

import os
import shutil
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import director_chat
import motores_director

#: Mismo orden e ids que `PROVEEDORES_PRESIDENTE` de `src/lib/mando/chat-director-tipos.ts`.
PROVEEDORES = ("claude", "hermes", "chatgpt")
NOMBRES = {"claude": "Claude", "hermes": "Hermes", "chatgpt": "ChatGPT"}
MODELOS = {
    "claude": "claude-mac/" + motores_director.MODELO_DIRECTOR,
    "hermes": "hermes/predeterminado",
    "chatgpt": "codex/gpt-5-codex",
}
CANAL = "director-presidente"
REINTENTO_COLA_S = 120  # primer reintento; los siguientes crecen (DIR1111N)
#: DIR1111N · intervalos entre reintentos de un mensaje que nadie puede contestar: crecen y se paran en
#: el techo (15 min). Una señal de que un proveedor volvió (lectura nueva de límites, una respuesta de
#: cualquier proveedor, la sesión de Hermes reabierta) adelanta el reintento y reinicia la cuenta.
INTERVALOS_COLA_S = (120, 240, 480, 900)
ENFRIAMIENTO_S = 600
MAX_COLA = 200
RAIZ = Path(__file__).resolve().parent.parent.parent

#: Lo que Hermes escribe cuando NINGÚN proveedor de su cadena contestó: no es una respuesta.
_FALLOS_HERMES = motores_director._FALLOS_HERMES
#: HER1111K · tope del prompt de una sesión nueva de Hermes (caracteres) y aviso de pausa repetido a diario.
TOPE_PROMPT_FRESCO = 24000
REAVISO_PAUSA_S = 24 * 3600


# ── Qué cuenta como dirección (igual que `esDireccion` de chat-director-feed.ts) ──────

def es_director_de_conversacion(de):
    q = (de or "").lower()
    return q in ("director-presidente", "hermes", "chatgpt", "codex", "antigravity") or q.startswith("claude")


def es_direccion(r, por_id=None):
    """PURA. ¿El registro es conversación de dirección (no rutina del enjambre)?"""
    if not isinstance(r, dict) or r.get("tipo") == "entrega":
        return False
    if r.get("rol") == "alex":
        return True
    if r.get("canal") == CANAL or r.get("sintesis") is True:
        return True
    if r.get("tipo") in ("uso", "actualizacion"):
        return False
    original = (por_id or {}).get(r.get("respondeA")) if r.get("respondeA") else None
    if r.get("tipo") == "respuesta" and original and original.get("rol") != "alex":
        return False
    if es_director_de_conversacion(r.get("de")):
        return True
    return r.get("tipo") == "respuesta" and r.get("rol") == "director" and bool(original) \
        and original.get("rol") == "alex"


def hilo_direccion(registros, excluir_id=None, maximo=20):
    """PURA. Los últimos `maximo` mensajes de dirección (sin el que se contesta)."""
    por_id = {r.get("id"): r for r in registros if isinstance(r, dict) and r.get("id")}
    hilo = [r for r in registros if r.get("id") != excluir_id and es_direccion(r, por_id)]
    hilo.sort(key=director_chat._epoch_de)
    return hilo[-maximo:]


def prompt_presidente(pregunta, hilo, contexto="", rol_texto=None):
    """PURA. El prompt del presidente: reglas, contexto del proyecto y el hilo de dirección."""
    partes = [
        rol_texto or "Eres el Director presidente de Genesis (StarSeed OS): la voz principal de la "
        "dirección. Responde en español, claro y breve, con la síntesis de lo que han dicho "
        "los demás directores cuando venga al caso.",
        "Reglas: no escribes código (lo escribe el enjambre tarea a tarea); propones olas, "
        "verificas puertas y decides rumbo. Si no sabes algo, dilo.",
    ]
    if contexto:
        partes.append("Contexto del proyecto:\n" + contexto[:8000])
    if hilo:
        lineas = []
        for r in hilo:
            quien = "Alex" if r.get("rol") == "alex" else (r.get("de") or "director")
            marca = " (síntesis)" if r.get("sintesis") else ""
            tipo = r.get("tipo") or "mensaje"
            lineas.append("[%s · %s%s] %s" % (quien, tipo, marca, (r.get("texto") or "")[:1500]))
        partes.append("Hilo de dirección (lo más reciente al final):\n" + "\n".join(lineas))
    partes.append("Mensaje de Alex al Director presidente: " + (pregunta or ""))
    return "\n\n".join(partes)


def prompt_sesion_fresca(pregunta, hilo, contexto="", rol_texto=None, tope=TOPE_PROMPT_FRESCO):
    """PURA. (HER1111K) Prompt para una sesión NUEVA de Hermes: no recuerda nada, así que lleva el
    mismo contexto y el mismo hilo de dirección que se le daría al presidente, acotado a `tope`
    caracteres (se descartan primero los mensajes más antiguos del hilo y luego se recorta el contexto)."""
    nota = ("Nota: esta es una sesión nueva de Hermes (la sesión de dirección está en pausa). No "
            "recuerdas la conversación: lo que sigue es el contexto y el hilo reciente.")
    hilo = list(hilo or [])
    contexto = contexto or ""
    while True:
        prompt = nota + "\n\n" + prompt_presidente(pregunta, hilo, contexto, rol_texto)
        exceso = len(prompt) - tope
        if exceso <= 0:
            return prompt
        if len(contexto) > 1500:  # primero el contexto del proyecto (el hilo vale más)
            contexto = contexto[: max(1500, len(contexto) - exceso)]
        elif hilo:
            hilo = hilo[1:]
        elif contexto:
            contexto = ""
        else:
            return prompt[:tope]


# ── Quién puede contestar ahora ──────────────────────────────────────────────────

def _hoy(ahora):
    return datetime.fromtimestamp(ahora, timezone.utc).astimezone().strftime("%Y-%m-%d")


def _horas(minutos):
    if minutos is None:
        return "?"
    if minutos >= 48 * 60:
        return "%d días" % round(minutos / 1440)
    if minutos >= 120:
        return "%d h" % round(minutos / 60)
    return "%d min" % round(minutos)


def disponibilidad_claude(datos_limites, ahora, opus_hoy, tope_opus):
    """PURA. (puede, motivo) de Claude según `limites_claude.estado` y el tope diario de Opus."""
    import limites_claude  # noqa: PLC0415 — mismo directorio

    if opus_hoy >= tope_opus:
        return False, "tope de Opus del día alcanzado (%d de %d)" % (opus_hoy, tope_opus)
    if not isinstance(datos_limites, dict) or not datos_limites.get("lecturas"):
        return False, "no hay lecturas de sus límites (limites_claude.py declarar)"
    est = limites_claude.estado(datos_limites, datetime.fromtimestamp(ahora, timezone.utc))
    if est.get("desactualizada"):
        return False, "su última lectura de límites es de hace %s; sin lectura no se arriesga" % _horas(
            est.get("lectura_hace_min"))
    for campo, nombre in (("sesion", "sesión"), ("semana", "semana")):
        v = est.get(campo) or {}
        if v.get("tono") == "peligro":
            pct = v.get("pct")
            return False, "límite de la %s al %s %%" % (nombre, "?" if pct is None else int(round(pct)))
    return True, ""


def ordenar(disponibilidad, enfriados, ahora):
    """PURA. Orden de intento y descartes.

    `disponibilidad`: {proveedor: (puede, motivo)}; `enfriados`: {proveedor: {hasta, motivo}}
    (los que fallaron hace poco). Devuelve (candidatos, [(proveedor, motivo), …]).
    """
    candidatos, descartes = [], []
    for p in PROVEEDORES:
        puede, motivo = disponibilidad.get(p, (False, "no configurado"))
        frio = (enfriados or {}).get(p) or {}
        if not puede:
            descartes.append((p, motivo or "no disponible"))
        elif float(frio.get("hasta") or 0) > ahora:
            descartes.append((p, "falló hace poco (%s)" % (frio.get("motivo") or "sin detalle")))
        else:
            candidatos.append(p)
    return candidatos, descartes


def texto_descartes(descartes):
    """PURA. «Claude: …; Hermes: …» para la respuesta o el detalle de la cola."""
    return "; ".join("%s: %s" % (NOMBRES.get(p, p), m) for p, m in descartes)


def intervalo_cola(intentos):
    """PURA. Segundos hasta el siguiente reintento tras `intentos` intentos fallidos (≥ 1)."""
    i = max(1, int(intentos or 1)) - 1
    return INTERVALOS_COLA_S[min(i, len(INTERVALOS_COLA_S) - 1)]


def _en_min(segundos):
    m = max(1, int(round(segundos / 60.0)))
    return "%d min" % m


def detalle_cola(descartes, intentos=1, proximo=None, ahora=None):
    """El motivo visible de «En cola»: quién no pudo y por qué, cuántos intentos y cuándo es el siguiente."""
    base = "En cola: ningún director puede contestar ahora (%s)." % (texto_descartes(descartes) or "sin proveedores")
    if proximo is None:
        return base + " Se reintenta solo."
    espera = intervalo_cola(intentos)
    return "%s Intento %d; el siguiente hacia las %s (en %s), cada vez más espaciado hasta %s. " \
           "Si un director vuelve antes, se contesta en cuanto se note." % (
               base, intentos, _hora_corta(proximo), _en_min(espera), _en_min(INTERVALOS_COLA_S[-1]))


def _hora_corta(epoch):
    return datetime.fromtimestamp(epoch, timezone.utc).astimezone().strftime("%H:%M")


def huella_proveedores(datos_limites, sesion_hermes):
    """PURA. Lo que cambia cuando un proveedor puede haber vuelto: la última lectura de límites de Claude y
    la sesión de dirección de Hermes. Si cambia, un mensaje en cola se reintenta sin esperar."""
    lecturas = (datos_limites or {}).get("lecturas") if isinstance(datos_limites, dict) else None
    ultima = lecturas[-1].get("t") if lecturas and isinstance(lecturas[-1], dict) else None
    return "%s|%s" % (ultima or "", sesion_hermes or "")


def despertar_cola(estado, ahora=None):
    """Un proveedor contestó: los mensajes en cola se reintentan ya, sin esperar su intervalo."""
    ahora = time.time() if ahora is None else ahora
    estado.setdefault("presidente", {})["despertar"] = ahora


# ── Llamadas (con `correr` inyectado) ────────────────────────────────────────────

def _llamar_claude(prompt, correr):
    rc, salida = correr(
        motores_director.orden_claude(prompt, motores_director.MODELO_DIRECTOR, None),
        env=motores_director.entorno_sin_claves_api(os.environ),
        cwd=str(RAIZ),
        segundos=motores_director.SEGUNDOS_PROVEEDOR_PRESIDENTE,
    )
    if "Credit balance is too low" in (salida or ""):
        return None, "la cuenta de Claude Code no tiene saldo", {}
    lectura = motores_director.leer_claude(salida)
    if lectura.get("error") or not lectura.get("texto"):
        return None, director_chat.tachar((lectura.get("error") or salida or "sin salida")[:200]), {}
    uso = {"tokensEntrada": lectura["tokens_entrada"], "tokensSalida": lectura["tokens_salida"],
           "coste": lectura["coste"]}
    return lectura["texto"].strip(), "", uso


def _ejecutar_hermes(correr, segundos=None):
    """`ejecutar(prompt, sesion) -> (rc, salida, uso)` con el archivo de uso temporal de Hermes."""
    segundos = segundos or motores_director.SEGUNDOS_PROVEEDOR_PRESIDENTE
    import json  # noqa: PLC0415

    def ejecutar(prompt, sesion):
        with tempfile.NamedTemporaryFile(mode="r", suffix=".json", delete=False, encoding="utf-8") as f:
            archivo_uso = f.name
        try:
            rc, salida = correr(motores_director.orden_hermes(prompt, None, archivo_uso, sesion), segundos=segundos)
            try:
                datos = json.loads(Path(archivo_uso).read_text(encoding="utf-8"))
            except (OSError, ValueError):
                datos = {}
        finally:
            try:
                os.unlink(archivo_uso)
            except OSError:
                pass
        return rc, salida, datos

    return ejecutar


def _llamar_hermes(prompt, correr, sesion=None, prompt_fresco=None, info=None):
    """(HER1111K) Con `sesion` en pausa, reintenta en una sesión nueva con `prompt_fresco()`.
    `info` (dict) recibe {"pausa": …, "fresca": bool} para que `atender` avise y atribuya."""
    res = motores_director.hermes_con_pausa(
        _ejecutar_hermes(correr), prompt, prompt_fresco or (lambda: prompt), sesion)
    if info is not None:
        info["pausa"], info["fresca"] = res["pausa"], res["fresca"]
    rc, datos = res["rc"], res["uso"] or {}
    texto = (res["salida"] or "").strip()
    if res["pausa"] and not res["fresca"]:
        return None, "la sesión de dirección de Hermes está en pausa y la sesión nueva tampoco contestó", {}
    if (rc != 0 and not texto) or not texto or motores_director.es_fallo_hermes(texto):
        return None, director_chat.tachar((texto or "sin salida (rc=%s)" % rc)[:200]), {}
    uso = {"tokensEntrada": datos.get("input_tokens", 0), "tokensSalida": datos.get("output_tokens", 0),
           "coste": datos.get("cost_usd", 0.0)}
    return texto, "", uso


def _llamar_chatgpt(prompt, correr):
    rc, salida = correr(motores_director.orden_codex("gpt-5-codex", str(RAIZ)), entrada=prompt,
                        segundos=motores_director.SEGUNDOS_PROVEEDOR_PRESIDENTE)
    texto = (salida or "").strip()
    if rc != 0 or not texto:
        return None, director_chat.tachar((texto or "sin salida (rc=%s)" % rc)[:200]), {}
    return texto, "", {}


# ── HER1111K · avisos de la sesión de Hermes en pausa ────────────────────────────

def _hora_local(epoch):
    return datetime.fromtimestamp(epoch, timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M")


def texto_aviso_pausa(sesion, desde):
    """PURA. El aviso para Alex: qué sesión, desde cuándo, qué significa, qué hace Genesis, cómo se reabre."""
    return (
        "La sesión de dirección de Hermes (%s) está en pausa, detectada el %s. Hermes la bloqueó porque no "
        "pudo confirmar cómo terminó su último turno (suele pasar si se reinicia a mitad de turno) y no la "
        "usa hasta que una persona lo confirme; el mensaje que llegue a esa sesión no se envía. Mientras "
        "tanto Genesis sigue contestando desde sesiones nuevas de Hermes, con el hilo de dirección como "
        "contexto, y cada respuesta lo dice. Para reabrirla, en la Mac: %s (descarta ese turno perdido; "
        "no se repite). Al siguiente mensaje Genesis vuelve a ella solo y te lo dirá."
        % (sesion, _hora_local(desde), motores_director.orden_reabrir_hermes(sesion))
    )


def texto_aviso_recuperada(sesion):
    return ("La sesión de dirección de Hermes (%s) vuelve a estar abierta: Genesis ha vuelto a contestar "
            "desde ella." % sesion)


def _publicar_aviso(texto, raiz):
    director_chat.publicar(texto, de="cartero", rol="sistema", tipo="aviso", canal="mando", raiz=raiz)


def avisar_pausa_hermes(estado, pausa, raiz=None, ahora=None):
    """Avisa a Alex UNA vez por sesión en pausa (otra vez solo si pasa un día y sigue). Guarda en
    `estado["hermes_pausas"]` {sesión: {desde, avisado}}. Devuelve True si publicó el aviso."""
    ahora = time.time() if ahora is None else ahora
    sesion = (pausa or {}).get("sesion")
    if not sesion:
        return False
    pausas = estado.setdefault("hermes_pausas", {})
    reg = pausas.setdefault(sesion, {"desde": ahora, "avisado": 0})
    if reg.get("avisado") and ahora - float(reg["avisado"]) < REAVISO_PAUSA_S:
        return False
    try:
        _publicar_aviso(texto_aviso_pausa(sesion, float(reg.get("desde") or ahora)), raiz)
    except (OSError, ValueError):
        return False  # sin aviso publicado no se anota: se intenta en el siguiente mensaje
    reg["avisado"] = ahora
    return True


def hermes_reabierta(estado, sesion, raiz=None):
    """Si la sesión estaba anotada en pausa y ya contesta, lo dice UNA vez y borra la anotación."""
    pausas = (estado or {}).get("hermes_pausas")
    if not pausas or not sesion or sesion not in pausas:
        return False
    try:
        _publicar_aviso(texto_aviso_recuperada(sesion), raiz)
    except (OSError, ValueError):
        return False
    pausas.clear()  # otras anotaciones eran de sesiones que ya no son la de dirección
    return True


def descripcion_sesion_nueva(sesion_pausada):
    return "sesión nueva de Hermes: la de dirección%s está en pausa" % (
        " (%s)" % sesion_pausada if sesion_pausada else "")


def fuera_de_vista(estado, ids_vistos):
    """PURA. Mensajes en cola que ya no están en la ventana del cartero (para no perderlos)."""
    cola = ((estado or {}).get("presidente") or {}).get("cola") or {}
    vistos = set(ids_vistos or ())
    return [e["mensaje"] for i, e in cola.items()
            if i not in vistos and isinstance(e, dict) and isinstance(e.get("mensaje"), dict)]


def existe_cli(nombre):
    """¿Está instalada la orden? (también en ~/.local/bin, donde vive Hermes)."""
    return bool(shutil.which(nombre)) or os.path.exists(os.path.expanduser("~/.local/bin/" + nombre))


def leer_limites():
    import limites_claude  # noqa: PLC0415

    return limites_claude.leer()


def atender(mensaje, estado, raiz=None, correr=None, existe=None, limites=None,
            contexto="", tope_opus=40, ahora=None, sesion_hermes=None, registros=None):
    """Contesta un mensaje al presidente o lo deja en cola.

    Devuelve «respondido», «cola» (nadie pudo: queda pendiente con su detalle) o «espera»
    (sigue en cola y aún no toca reintentar). Nunca lanza por un proveedor caído.
    """
    correr = correr or motores_director.correr
    existe = existe or existe_cli
    ahora = time.time() if ahora is None else ahora
    datos_limites = leer_limites() if limites is None else limites
    pres = estado.setdefault("presidente", {})
    cola = pres.setdefault("cola", {})
    enfriados = pres.setdefault("enfriados", {})
    idm = mensaje["id"]

    previo = cola.get(idm) or {}
    huella = huella_proveedores(datos_limites, sesion_hermes)
    if previo:
        # DIR1111N: en cola, se espera el intervalo… salvo que un proveedor haya podido volver.
        volvio = (huella != previo.get("huella", huella)
                  or float(pres.get("despertar") or 0) > float(previo.get("visto") or 0))
        if float(previo.get("proximo") or 0) > ahora and not volvio:
            return "espera"
        enfriados.clear()  # el reintento espaciado manda sobre el enfriamiento de 10 min
        if volvio:
            previo = dict(previo, intentos=0)

    if estado.get("opus_fecha") != _hoy(ahora):
        estado["opus_fecha"] = _hoy(ahora)
        estado["opus_hoy"] = 0
    disponibilidad = {
        "claude": disponibilidad_claude(datos_limites, ahora, int(estado.get("opus_hoy") or 0), tope_opus)
        if existe("claude") else (False, "la orden claude no está instalada"),
        "hermes": (True, "") if existe("hermes") else (False, "la orden hermes no está instalada"),
        "chatgpt": (True, "") if existe("codex") else (False, "la orden codex no está instalada"),
    }
    candidatos, descartes = ordenar(disponibilidad, enfriados, ahora)

    if registros is None:
        registros = director_chat.leer(limite=200, raiz=raiz)
    hilo = hilo_direccion(registros, idm)
    prompt = prompt_presidente(mensaje.get("texto", ""), hilo, contexto)

    for p in candidatos:
        inicio = time.time()
        info = {}
        try:
            if p == "claude":
                texto, motivo, uso = _llamar_claude(prompt, correr)
            elif p == "hermes":
                texto, motivo, uso = _llamar_hermes(
                    prompt, correr, sesion_hermes,
                    lambda: prompt_sesion_fresca(mensaje.get("texto", ""), hilo, contexto), info)
                # HER1111K: aviso único de la pausa / de la vuelta a la sesión de dirección.
                if info.get("pausa"):
                    avisar_pausa_hermes(estado, info["pausa"], raiz=raiz, ahora=ahora)
                elif texto and sesion_hermes:
                    hermes_reabierta(estado, sesion_hermes, raiz=raiz)
            else:
                texto, motivo, uso = _llamar_chatgpt(prompt, correr)
        except OSError as e:
            texto, motivo, uso = None, "no se pudo lanzar: %s" % e, {}
        if not texto:
            enfriados[p] = {"hasta": ahora + ENFRIAMIENTO_S, "motivo": motivo}
            descartes.append((p, motivo))
            continue
        if p == "claude":
            estado["opus_hoy"] = int(estado.get("opus_hoy") or 0) + 1
        enfriados.pop(p, None)
        uso = dict(uso)
        uso["segundos"] = round(time.time() - inicio, 1)
        eleccion = {"proveedor": p, "modelo": MODELOS[p]}
        if p == "hermes" and info.get("fresca"):
            # La tarjeta enseña «Contestó Hermes · <modelo>»: aquí queda dicho que fue una sesión nueva.
            eleccion["modelo"] = "%s (%s)" % (MODELOS[p], descripcion_sesion_nueva((info["pausa"] or {}).get("sesion")))
            eleccion["sesionNueva"] = True
            uso["via"] = "hermes-sesion-nueva"
        if descartes:
            eleccion["descartes"] = [{"proveedor": d, "motivo": m} for d, m in descartes]
        director_chat.publicar(
            texto, de=CANAL, rol="director", tipo="respuesta", canal=CANAL, modelo=MODELOS[p],
            responde_a=idm, uso=uso, raiz=raiz, sintesis=True, eleccion=eleccion,
        )
        director_chat.entrega(idm, CANAL, "respondido", raiz=raiz)
        cola.pop(idm, None)
        despertar_cola(estado, ahora)  # un proveedor contesta: lo que siga en cola se reintenta ya
        return "respondido"

    intentos = int(previo.get("intentos") or 0) + 1
    proximo = ahora + intervalo_cola(intentos)
    detalle = detalle_cola(descartes, intentos, proximo)
    if previo.get("detalle") != detalle:
        director_chat.entrega(idm, CANAL, "pendiente", detalle=detalle, raiz=raiz)
    # Se guarda el mensaje: si el chat avanza y sale de la ventana que lee el cartero, sigue en cola.
    cola[idm] = {"proximo": proximo, "detalle": detalle, "intentos": intentos, "huella": huella,
                 "visto": ahora, "desde": previo.get("desde") or ahora,
                 "mensaje": {k: mensaje[k] for k in ("id", "t", "de", "rol", "tipo", "texto", "canal",
                                                     "canales", "modelo") if k in mensaje}}
    if len(cola) > MAX_COLA:
        for viejo in sorted(cola, key=lambda k: cola[k].get("proximo", 0))[: len(cola) - MAX_COLA]:
            cola.pop(viejo, None)
    return "cola"
