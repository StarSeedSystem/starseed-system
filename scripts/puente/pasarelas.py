"""pasarelas · qué le pasa a cada pasarela y qué hay que hacer para devolverla a la vida.

Por qué existe (2026-09-16). El enjambre pasó un día entero «trabajando» sin escribir
una línea. La causa no fue el orquestador: una comilla que faltaba en `~/.hermes/.env`
dejaba sin cargar TODAS las claves de pasarela, y sin clave las pasarelas no daban
error — daban SILENCIO. El silencio se parece a «el agente está pensando», así que
nadie se enteró y toda la escritura acabó cayendo en la suscripción de ChatGPT de Alex
hasta agotarla.

La regla que sale de ahí: **una pasarela está viva cuando devuelve tokens**, no cuando
contesta a un ping. Y cuando no los devuelve, hay que saber POR QUÉ y QUÉ hacer, con el
enlace delante. Esa es toda la materia de este módulo.

Módulo PURO: entran un código HTTP y un cuerpo, salen un estado y una acción.
Quien llama hace las llamadas de red, abre navegadores y manda avisos.
"""

# Estados posibles, de mejor a peor.
ESCRIBE = "escribe"                 # devolvió tokens: está viva
SIN_CUPO = "sin_cupo"               # cuota diaria/mensual agotada: se repone sola
SIN_CLAVE = "sin_clave"             # falta la clave o no vale: hay que renovarla
SIN_CANAL = "sin_canal"             # la pasarela no tiene proveedor para ese modelo
MODELO_FUERA = "modelo_fuera"       # el modelo ya no existe en el catálogo
LENTA = "lenta"                     # acepta y no emite: cola o congestión
SATURADA = "saturada"               # (2026-10-28) el servidor existe y contesta, pero está
                                    # sobrecargado ahora mismo; se repone sola
CAIDA = "caida"                     # no responde de ninguna forma
FICHAJE = "fichaje"                 # exige un fichaje diario en su web para lo gratis

# Catálogo: dónde se renueva cada una y si hace falta que lo haga una persona.
# `humano=True` significa que hay que iniciar sesión, resolver un captcha o aceptar
# condiciones: eso lo hace Alex, nunca un agente.
CATALOGO = {
    "nvidia":     {"nombre": "NVIDIA Build (NIM)", "enlace": "https://build.nvidia.com/",
                   "humano": True, "nota": "Créditos sin tope desde 2026; el límite es 40 RPM (ampliable a 200 pidiéndolo)."},
    "openrouter": {"nombre": "OpenRouter", "enlace": "https://openrouter.ai/settings/keys",
                   "humano": True, "nota": "Los modelos que acaban en :free rotan; conviene releer el catálogo cada día."},
    "groq":       {"nombre": "Groq", "enlace": "https://console.groq.com/keys",
                   "humano": True, "nota": "Cuota por minuto y por día; los nombres de modelo cambian a menudo."},
    "xkiro":      {"nombre": "xkiro", "enlace": "https://api.xkiro.com/",
                   "humano": True, "nota": "Cuota diaria de modelos gratuitos; se repone al día siguiente."},
    "tokenrouter": {"nombre": "TokenRouter", "enlace": "https://api.tokenrouter.com/",
                   "humano": True, "nota": "«No available channel» es del lado de ellos: el modelo no tiene proveedor detrás."},
    "aihubmix":   {"nombre": "AIHubMix", "enlace": "https://aihubmix.com/token",
                   "humano": True, "nota": "Pide recarga para seguir usando los recursos gratuitos."},
    "apinex":     {"nombre": "apinex", "enlace": "https://apinex.bond/airdrop?tab=quests",
                   "humano": True, "nota": "(DIR1121H, medido el 2026-11-22) Su API ya no pide el FICHAJE DIARIO: responde 402 «Make a single top-up of $5 or more to unlock 25M free tokens daily for life». Fichar en /airdrop?tab=quests ya no desbloquea lo gratis; queda sin cupo hasta que Alex decida si hace esa recarga única o se retira la pasarela."},
    "deepseek":   {"nombre": "DeepSeek", "enlace": "https://platform.deepseek.com/api_keys",
                   "humano": True, "nota": "Clave de pago con saldo; 401 significa clave caducada o revocada."},
    "xai":        {"nombre": "xAI (Grok)", "enlace": "https://console.x.ai/team/billing",
                   "humano": True, "nota": "DE PAGO, y se gasta rápido: los agentes escribieron con grok-4.6 y grok-build-0.1 toda la tarde del 16/09 y se acabó el saldo del equipo. Un 403 suyo suele ser saldo, no clave."},
    "neurona":    {"nombre": "Neurona local (Ollama)", "enlace": "https://ollama.com/library",
                   "humano": True, "nota": "Local: sin clave, sin cupo y sin red. Solo necesita que haya un modelo descargado que sepa programar."},
    "google":     {"nombre": "Google AI Studio (Gemini)", "enlace": "https://aistudio.google.com/apikey",
                   "humano": True, "nota": "Gemini gratis con cupo diario (GEMINI_API_KEY). Escribe con herramientas y 1M de contexto."},
"huggingface": {"nombre": "Hugging Face", "enlace": "https://huggingface.co/settings/tokens",
                    "humano": True, "nota": "Inference API con cuota mensual gratuita."},
    "freellmapi": {"nombre": "FreeLLMAPI (local :3001)", "enlace": "https://github.com/tashfeenahmed/freellmapi",
                     "humano": True, "nota": "Pasarela unificada local; la clave freellmapi-… se crea en su panel y se guarda como FREELLMAPI_KEY."},
    "abliteration": {"nombre": "abliteration.ai", "enlace": "https://abliteration.ai/",
                     "humano": True, "nota": "10 000 peticiones/día gratis; saldo en USD; clave en ABLITERATION_API_KEY."},
    "antigravity": {"nombre": "Antigravity (agy)", "enlace": "https://antigravity.dev/",
                    "humano": True, "nota": "CLI con cuenta Google de Alex; modelos Gemini/Claude/GPT-OSS; cuota de Antigravity (GEM1119C)."},
    "ollama-a1": {"nombre": "Ollama del A1 (qwen 4B)", "enlace": "https://ollama.com/library",
                  "humano": False, "nota": "Modelo privado 4B en Oracle A1; sin clave, sin cupo, solo red local."},
    "codex": {"nombre": "Codex (ChatGPT)", "enlace": "https://chatgpt.com/",
              "humano": True, "nota": "Suscripción ChatGPT; cuota por ventana; se aparta 3 h al agotarse (cupo_codex.py)."},
    "opencode-zen": {"nombre": "OpenCode Zen", "enlace": "https://opencode.ai/",
                     "humano": False, "nota": "Modelos gratuitos vía opencode (glm-5.3-flash, deepseek-v4.1-flash, minimax-m3.1-flash, big-pickle); sin clave."},
    "explabs": {"nombre": "Experiential Labs", "enlace": "https://api.experientiallabs.ai/",
                "humano": True, "nota": "Modelos de decisión gratis (Jev, Clef Flash) y chat en promoción; clave EXPLABS_API_KEY."},
}

_PISTAS = (
    # (subcadena en el cuerpo, estado)
    # TARDAR NO ES MORIR (2026-09-22). Cuando la sonda se queda sin tiempo, el cuerpo que
    # llega aquí no es una respuesta del servidor: es el texto de la excepción de Python
    # («TimeoutError: timed out», «socket.timeout», «URLError ... timed out»). Ninguna
    # pista lo reconocía, así que caía en el `return CAIDA` del final y Genesis le pedía
    # a Alex renovar la clave. Medido esta noche con FreeLLMAPI: el informe decía «caída ·
    # renovar la clave» mientras la pasarela contestaba HTTP 200 en dos segundos y ofrecía
    # 234 modelos. Lo que tardaba era su ruta `auto`, porque las pasarelas gratuitas de
    # debajo estaban sin cupo — un problema de cuota aguas abajo, no una clave caducada.
    # Mandar a alguien a renovar una clave que funciona es la peor clase de aviso: le hace
    # perder el tiempo y le enseña a no creerse la lista.
    # EL FICHAJE VA PRIMERO. apinex contesta a la vez «daily check-in required» y
    # palabras como «free»/«quota», así que si se mira después queda clasificado
    # como «sin cupo» y el informe dice «se repone sola» — y no se repone: hay que
    # entrar a su web y pulsar un botón. Hoy costó dos tareas (DR1 y DR3) que
    # volvieron sin cambios tras quemar su turno entero.
    ("daily check-in required", FICHAJE),
    ("check-in required", FICHAJE),
    ("checkin required", FICHAJE),
    # (CAP1119A, 19-11) apinex contestó 402 «sin crédito» y el informe lo archivó
    # como «modelo fuera», así que acciones-de-alex.json no pedía el fichaje.
    # Un 402 (payment required), una verificación humana o un «sin crédito»
    # exigen una acción de Alex; decir «cambia de modelo» es un aviso inútil.
    ("sin crédito", FICHAJE),
    ("sin credito", FICHAJE),
    ("check in to use", FICHAJE),
    ("human verification", FICHAJE),
    ("verificación humana", FICHAJE),
    ("verificacion humana", FICHAJE),
    ("verification required", FICHAJE),
    ("verifica tu cuenta", FICHAJE),
    ("captcha", FICHAJE),
    ("no available channel", SIN_CANAL),
    ("model_not_found", MODELO_FUERA),
    ("does not exist", MODELO_FUERA),
    ("unavailable for free", MODELO_FUERA),
    # SATURACIÓN NO ES CAÍDA (2026-10-28). Google contestó 503 «The model is
    # overloaded. Please try again later» mientras listar modelos y generateContent
    # respondían 200 minutos después: la clave funcionaba. Mandar a renovarla es
    # la peor clase de aviso, la misma que «TARDAR NO ES MORIR». Va DESPUÉS del
    # fichaje y de «unavailable for free», que deben seguir ganando.
    ("overloaded", SATURADA),
    ("try again later", SATURADA),
    ("high demand", SATURADA),
    ("temporarily unavailable", SATURADA),
    ("service unavailable", SATURADA),
    # Los gemini-2.5-flash y -lite contestan 404 con este texto: el modelo ya no
    # entra para cuentas nuevas, no es una saturación ni una clave mala.
    ("no longer available", MODELO_FUERA),
    ("free-model token quota", SIN_CUPO),
    # CRÉDITOS GASTADOS ≠ CLAVE MALA (2026-09-16, 22:10). xAI contesta 403 a una
    # clave PERFECTAMENTE VÁLIDA cuando el equipo se queda sin saldo:
    #     {"code":"permission-denied","error":"Your team ... has either used all
    #      available credits or reached its monthly spending limit."}
    # Como ninguna pista encajaba, caía en la regla `403 → SIN_CLAVE` y el informe
    # decía «la clave no vale: renuévala». Mandar a Alex a crear una clave nueva
    # que va a fallar igual es peor que no decirle nada: pierde el tiempo y sale
    # creyendo que el sistema miente. El saldo se recarga, no se renueva.
    ("used all available credits", SIN_CUPO),
    ("monthly spending limit", SIN_CUPO),
    ("spending limit", SIN_CUPO),
    ("purchase more credits", SIN_CUPO),
    ("credit balance", SIN_CUPO),
    ("out of credits", SIN_CUPO),
    ("billing_error", SIN_CUPO),
    ("top-up", SIN_CUPO),
    ("top up", SIN_CUPO),
    ("buy a subscription", SIN_CUPO),
    ("only with a subscription", SIN_CUPO),
    ("quota", SIN_CUPO),
    ("insufficient", SIN_CUPO),
    ("recharge", SIN_CUPO),
    ("authentication", SIN_CLAVE),
    ("invalid api key", SIN_CLAVE),
    ("unauthorized", SIN_CLAVE),
    ("missing request extension", SIN_CLAVE),
    ("timed out", LENTA),
    ("timeouterror", LENTA),
    ("socket.timeout", LENTA),
    ("timeout", LENTA),
    ("read operation timed out", LENTA),
    # abliteration.ai
    ("insufficient credits", SIN_CUPO),
    ("credit limit", SIN_CUPO),
    ("payment required", FICHAJE),
    # antigravity (agy) — usa cuenta Google, sin clave API
    ("quota exceeded", SIN_CUPO),
    ("rate limit", SIN_CUPO),
    # codex — suscripción ChatGPT
    ("usage limit", SIN_CUPO),
    ("upgrade to pro", SIN_CUPO),
    # opencode-zen — modelos gratuitos sin clave
    # explabs — promociones y decisiones gratis
    ("requires payment method", FICHAJE),
    ("promotion expired", SIN_CUPO),
)


#: Lo que el consejero (Jev) puede contestar cuando ninguna pista conoce el cuerpo.
OPCIONES_CONSEJERO = {
    SIN_CUPO: "cuota diaria o mensual agotada, límite de peticiones o de tokens: se repone sola",
    SIN_CLAVE: "la clave falta, caducó o no vale: hay que renovarla",
    FICHAJE: "pide un fichaje, check-in o acción manual diaria del usuario en su web",
    MODELO_FUERA: "ese modelo concreto no existe o fue retirado; otros de la pasarela sí",
    SIN_CANAL: "la pasarela no tiene ningún proveedor detrás de ese modelo",
    SATURADA: "el servidor contesta pero está sobrecargado: se repone sola, reintenta en un rato",
    CAIDA: "error interno, mantenimiento o la pasarela no funciona",
}


def extraer_mensaje_error(cuerpo, limite=220):
    """PURA: resume el mensaje legible de error devuelto por una pasarela, redactando secretos."""
    import json as _json
    import re as _re

    bruto = str(cuerpo or "").strip()
    if not bruto:
        return ""
    texto = bruto
    try:
        datos = _json.loads(bruto)
        if isinstance(datos, dict):
            err = datos.get("error")
            if isinstance(err, dict) and isinstance(err.get("message"), str):
                texto = err["message"]
            elif isinstance(err, str):
                texto = err
            elif isinstance(datos.get("message"), str):
                texto = datos["message"]
    except Exception:
        pass
    limpio = " ".join(texto.split())
    limpio = _re.sub(
        r"(Bearer\s+[A-Za-z0-9._-]+|\b(?:sk|nvapi|gsk|xai)[-_][A-Za-z0-9_-]{8,}|\bAIza[A-Za-z0-9_-]{12,})",
        "[oculto]",
        limpio,
    )
    if len(limpio) > limite:
        return limpio[: max(1, limite - 1)].rstrip() + "…"
    return limpio


def clasificar(http, cuerpo="", hubo_tokens=False, consejero=None):
    """Estado de una pasarela a partir de UNA llamada de ocho tokens.

    `hubo_tokens` manda sobre todo lo demás: si escribió, está viva, se diga lo que
    se diga en el cuerpo. `http=0` es el caso que nos costó el día: conexión aceptada
    y ni un byte de vuelta.

    `consejero` (2026-09-20): función (http, cuerpo, opciones) → (estado, confianza) o
    None (Jev, ver `jev.py`). Entra SOLO cuando hay un cuerpo de error que ninguna
    pista conoce —el caso que hoy acababa en CAIDA por defecto— y se le cree si su
    confianza pasa de 0,6; si no, manda el código HTTP como siempre.
    """
    if hubo_tokens:
        return ESCRIBE
    try:
        http = int(http)
    except (TypeError, ValueError):
        http = 0
    texto = (cuerpo or "").lower()
    for pista, estado in _PISTAS:
        if pista in texto:
            return estado
    if consejero is not None and texto.strip():
        try:
            consejo = consejero(http, cuerpo[:1500], OPCIONES_CONSEJERO)
        except Exception:
            consejo = None
        if consejo and consejo[0] in OPCIONES_CONSEJERO and float(consejo[1] or 0) > 0.6:
            return consejo[0]
    if http == 0:
        return LENTA
    if http in (401, 403):
        return SIN_CLAVE
    if http == 429:
        return SIN_CUPO
    # Un 402 sin cuerpo conocido pide una acción de persona (fichar, verificar
    # o recargar), no un cambio de modelo: «sin crédito (402)» de apinex debe
    # llegar a la lista de Alex con su enlace de fichaje diario.
    if http == 402:
        return FICHAJE
    if http == 404:
        return MODELO_FUERA
    # (2026-10-28) 503 de Google es «overloaded, try again later»: saturación
    # pasajera, no caída. Igual 500, 502, 504 y 529 (overloaded de Cloudflare).
    if http in (500, 502, 503, 504, 529):
        return SATURADA
    if http >= 500:
        return CAIDA
    return CAIDA


def hay_que_renovar(estado):
    """¿Necesita que una persona entre en la web? Solo la clave lo exige de verdad.

    Dos cosas piden una persona: una clave que ya no vale, y un fichaje diario
    (apinex regala ocho modelos a cambio de un botón al día, y ese botón lo
    pulsa Alex; yo no entro en cuentas suyas).

    El resto se repone solo (cupo), se arregla cambiando el modelo, o es cosa de ellos.
    """
    return estado in (SIN_CLAVE, FICHAJE)


#: (DIR1121I, medido el 2026-11-22) Frases con las que una pasarela dice «paga para seguir». Con ellas el estado sigue
#: siendo «sin cupo» (fuera de la rotación), pero NO es verdad que «se repone sola»: apinex («Make a single top-up of
#: $5 or more…»), AIHubMix («Please recharge your account»), DeepSeek («Insufficient Balance»), Hugging Face
#: («Purchase pre-paid credits») y xAI («used all available credits») llevaban días anunciándose así.
PISTAS_RECARGA = ("top-up", "top up", "topup", "recharge", "insufficient balance", "balance is insufficient",
                  "pre-paid credits", "purchase credits", "buy credits", "add credits", "used all available credits")


def pide_recarga(mensaje):
    """PURA. ¿El «sin cupo» de esta pasarela es en realidad un «recarga saldo para seguir»?"""
    texto = str(mensaje or "").lower()
    return any(p in texto for p in PISTAS_RECARGA)


def accion_de(clave, estado, mensaje=""):
    """Qué hacer con esta pasarela, en una frase, con enlace si toca."""
    ficha = CATALOGO.get(clave, {"nombre": clave, "enlace": "", "nota": ""})
    if estado == ESCRIBE:
        return {"texto": "escribe: déjala en la rotación", "enlace": "", "humano": False}
    if estado == SIN_CUPO:
        if pide_recarga(mensaje):
            return {"texto": "sin saldo: su API pide una recarga de pago y NO se repone sola. Fuera de la rotación "
                             "hasta que Alex decida recargarla o retirarla",
                    "enlace": ficha["enlace"], "humano": False}
        return {"texto": "sin cupo hoy: se repone sola, apártala hasta mañana",
                "enlace": ficha["enlace"], "humano": False}
    if estado == FICHAJE:
        return {"texto": "pide el fichaje diario: entra, pulsa el botón y vuelve a escribir hoy mismo",
                "enlace": ficha["enlace"], "humano": True}
    if estado == SIN_CLAVE:
        return {"texto": "la clave no vale: renuévala y pégala en ~/.hermes/.env",
                "enlace": ficha["enlace"], "humano": True}
    if estado == SIN_CANAL:
        return {"texto": "sin proveedor detrás de ese modelo: cambia de modelo en esta pasarela",
                "enlace": "", "humano": False}
    if estado == MODELO_FUERA:
        return {"texto": "ese modelo ya no está en su catálogo: quítalo de la rotación",
                "enlace": "", "humano": False}
    if estado == LENTA:
        return {"texto": "acepta y no emite (cola o congestión): dale más margen o bájale el ritmo",
                "enlace": "", "humano": False}
    if estado == SATURADA:
        return {"texto": "saturada ahora mismo: se repone sola, reintenta en un rato",
                "enlace": "", "humano": False}
    return {"texto": "no responde: fuera de la rotación hasta nuevo aviso",
            "enlace": ficha["enlace"], "humano": False}


def informe(resultados):
    """Texto corto para el chat/Telegram. `resultados`: [{clave, modelo, estado}]."""
    vivas = [r for r in resultados if r.get("estado") == ESCRIBE]
    lineas = ["*Pasarelas* · %d de %d escriben" % (len(vivas), len(resultados))]
    # El fichaje va justo detrás de las vivas: es la única línea del informe que
    # Alex puede convertir en ocho modelos con un clic. Enterrarla abajo es
    # desperdiciarla.
    orden = {ESCRIBE: 0, FICHAJE: 1, LENTA: 2, SATURADA: 3, SIN_CUPO: 4,
             SIN_CANAL: 5, MODELO_FUERA: 6, SIN_CLAVE: 7, CAIDA: 8}
    for r in sorted(resultados, key=lambda x: orden.get(x.get("estado"), 9)):
        ficha = CATALOGO.get(r.get("clave"), {})
        a = accion_de(r.get("clave"), r.get("estado"), r.get("mensaje") or "")
        marca = "OK " if r.get("estado") == ESCRIBE else "— "
        lineas.append("%s*%s* (%s): %s" % (marca, ficha.get("nombre", r.get("clave")),
                                           r.get("modelo", "?"), a["texto"]))
        if a["enlace"] and a["humano"]:
            lineas.append("   %s" % a["enlace"])
    if not vivas:
        lineas.append("\nNinguna escribe. El enjambre NO debe arrancar así.")
    return "\n".join(lineas)


def para_abrir(resultados):
    """Enlaces que de verdad piden una persona delante, sin repetidos y en orden."""
    fuera = []
    for r in resultados:
        if not hay_que_renovar(r.get("estado")):
            continue
        enlace = CATALOGO.get(r.get("clave"), {}).get("enlace")
        if enlace and enlace not in fuera:
            fuera.append(enlace)
    return fuera


# ── qué modelos tiene sentido intentar ahora mismo ───────────────────────────
# (2026-09-16) La rotación repartía entre proveedores para no machacar a ninguno, y eso
# está bien… salvo cuando acabamos de MEDIR que un proveedor no escribe. Entonces
# repartir es regalarle cinco minutos a cada tarea. Alex lo vio así: agentes «escribiendo»
# durante veinte minutos con pasarelas que esa misma mañana habían devuelto 429.
SIEMPRE = ("llm7", "codex")  # sin clave o suscripción: no salen en el informe

#: Estados con los que un modelo SIGUE mereciendo un turno.
#: «Lenta» va dentro a propósito (2026-09-16, 22:15). La sonda pide 16 tokens y
#: espera 20 segundos; un gratuito con cola falla eso y escribe de sobra en una
#: tarea real de diez minutos. apinex lo hizo dos veces seguidas esta noche: en
#: una pasada «escribe» y en la siguiente «acepta y no emite», con el mismo
#: modelo y cinco minutos de diferencia. Expulsarlo por esa muestra sería
#: repetir el error de siempre: una sonda que mide poco y decide mucho —
#: justo lo que hoy nos costó ocho modelos y media tarde.
#: Lo que SÍ expulsa es una medida que no cambia por esperar: sin cupo, sin
#: clave, sin canal, modelo retirado, caída.
UTILIZABLES = (ESCRIBE, LENTA)


def pasarela_de(modelo):
    """El proveedor de un id de modelo: `openrouter/cohere/x:free` → `openrouter`."""
    return (modelo or "").split("/", 1)[0]


def modelos_utiles(modelos, informe, siempre=SIEMPRE):
    """Deja fuera los modelos de pasarelas que el informe dice que no pueden escribir.

    «No pueden» es una medida que no cambia por esperar (sin cupo, sin clave, sin
    canal, modelo retirado, caída). Una pasarela LENTA se queda: ver `UTILIZABLES`.

    Devuelve (utiles, apartados). Si el informe está vacío o no dice nada de una
    pasarela, sus modelos SE QUEDAN: ante la duda, intentarlo. Y si el filtro dejara
    la lista vacía, se devuelve la original — es mejor intentarlo con todos que no
    tener a nadie.
    """
    estados, extra, sondeado = {}, {}, {}
    for fila in (informe or {}).get("pasarelas", []) or []:
        estados[fila.get("clave")] = fila.get("estado")
        extra[fila.get("clave")] = [str(x) for x in (fila.get("modelos_extra") or []) if x]
        if fila.get("modelo"):
            sondeado[fila.get("clave")] = "%s/%s" % (fila.get("clave"), fila.get("modelo"))
    # (2026-10-04) «modelo_fuera» es del MODELO sondeado, no de la pasarela (lo dice su
    # explicación: «otros de la pasarela sí»). Tratarlo como de la pasarela entera sacó de
    # la rotación los cinco escritores de OpenRouter porque la sonda usaba uno retirado
    # (nex-n2.5-pro:free), con cohere/qwen/nemotron :free escribiendo con herramientas en 1 s.
    def _vale(p, m):
        e = estados.get(p)
        return e in UTILIZABLES or (e == MODELO_FUERA and bool(sondeado.get(p)) and m != sondeado[p])

    utiles, apartados = [], []
    for m in modelos or []:
        p = pasarela_de(m)
        if p in siempre or p not in estados or _vale(p, m):
            utiles.append(m)
        else:
            apartados.append((m, estados[p]))
    # (2026-09-20) Modelos que la pasarela anuncia HOY como gratuitos y con herramientas
    # (`modelos_extra`, los trae el renovador del catálogo público): entran detrás de los
    # de la lista fija, solo si la pasarela escribe. Así la rotación se actualiza sola
    # cuando OpenRouter estrena o retira gratuitos, sin tocar código.
    for clave, ids in extra.items():
        for mid in ids:
            completo = "%s/%s" % (clave, mid)
            if _vale(clave, completo) and completo not in utiles:
                utiles.append(completo)
    if not utiles:
        return list(modelos or []), []
    return utiles, apartados


def _modelo_es_gratuito(fila, mid):
    """PURA: ¿este id del catálogo se puede sondear sin gastar? Precio 0, `free` o su nombre."""
    p = fila.get("pricing") or {}
    try:
        if p and float(p.get("prompt") or 1) == 0 and float(p.get("completion") or 1) == 0:
            return True
    except (TypeError, ValueError):
        pass
    if fila.get("free") is True:
        return True
    # El id lo dice con separadores muy distintos: `:free`, `-free`, `free/`, `free-model`.
    piezas = mid.lower().replace(":", "/").replace("-", "/").replace("_", "/").split("/")
    return "free" in piezas


def elegir_modelo_gratuito(datos, anterior=""):
    """PURA: el gratuito VIGENTE del catálogo `/models` que más contexto ofrece, sin el retirado.

    (SES1122A, medido el 22-11) La sonda usaba un id fijo y, cuando la pasarela lo retira,
    el 404 se leía como «esta pasarela no sirve» aunque estuviera viva. El catálogo dice
    qué ids existen HOY. Gratuito es precio 0 declarado (OpenRouter), `free: true` o un id
    que lo lleva (`:free`, `-free`, `/free`). Si el catálogo no distingue, devuelve "" y no
    se inventa nada: mejor seguir con la medida original que sondear a ciegas.
    """
    filas = datos if isinstance(datos, list) else (
        (datos or {}).get("data") or (datos or {}).get("models") or [])
    fuera = []
    for m in filas:
        if not isinstance(m, dict):
            continue
        mid = str(m.get("id") or m.get("model") or m.get("name") or "").strip()
        if not mid or mid == anterior or not _modelo_es_gratuito(m, mid):
            continue
        try:
            contexto = int(m.get("context_length") or 0)
        except (TypeError, ValueError):
            contexto = 0
        fuera.append((contexto, mid))
    fuera.sort(key=lambda t: t[0], reverse=True)
    return fuera[0][1] if fuera else ""


def sello(informe):
    """La marca de tiempo del informe, para saber si hay uno nuevo que leer."""
    return ((informe or {}).get("t") or "").strip()


def cambio_de_rotacion(antes, despues):
    """(entran, salen) al pasar de una rotación a otra, en el orden de `despues`.

    (2026-09-16, 22:30) Existe porque el filtro era DESTRUCTIVO: se hacía
    `MODELOS[:] = utiles` una sola vez al arrancar, y los apartados desaparecían
    de la lista. Cuando Alex fichó en apinex y sus ocho modelos revivieron, no
    había forma de recuperarlos sin reiniciar el orquestador — y reiniciarlo
    significa tirar el trabajo en curso. Mientras tanto el enjambre seguía
    gastando la suscripción de ChatGPT teniendo ocho modelos gratis esperando.

    Con esto la lista completa se conserva y la rotación se RECALCULA: entrar es
    tan barato como salir.
    """
    a, d = list(antes or []), list(despues or [])
    return ([m for m in d if m not in a], [m for m in a if m not in d])
