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
                   "humano": True, "nota": "Sus ocho modelos gratis exigen UN FICHAJE DIARIO en /airdrop?tab=quests. Sin él, cada tarea que caiga ahí vuelve sin cambios."},
    "deepseek":   {"nombre": "DeepSeek", "enlace": "https://platform.deepseek.com/api_keys",
                   "humano": True, "nota": "Clave de pago con saldo; 401 significa clave caducada o revocada."},
    "xai":        {"nombre": "xAI (Grok)", "enlace": "https://console.x.ai/team/billing",
                   "humano": True, "nota": "DE PAGO, y se gasta rápido: los agentes escribieron con grok-4.6 y grok-build-0.1 toda la tarde del 16/09 y se acabó el saldo del equipo. Un 403 suyo suele ser saldo, no clave."},
    "neurona":    {"nombre": "Neurona local (Ollama)", "enlace": "https://ollama.com/library",
                   "humano": True, "nota": "Local: sin clave, sin cupo y sin red. Solo necesita que haya un modelo descargado que sepa programar."},
    "huggingface": {"nombre": "Hugging Face", "enlace": "https://huggingface.co/settings/tokens",
                   "humano": True, "nota": "Inference API con cuota mensual gratuita."},
}

_PISTAS = (
    # (subcadena en el cuerpo, estado)
    # EL FICHAJE VA PRIMERO. apinex contesta a la vez «daily check-in required» y
    # palabras como «free»/«quota», así que si se mira después queda clasificado
    # como «sin cupo» y el informe dice «se repone sola» — y no se repone: hay que
    # entrar a su web y pulsar un botón. Hoy costó dos tareas (DR1 y DR3) que
    # volvieron sin cambios tras quemar su turno entero.
    ("daily check-in required", FICHAJE),
    ("check-in required", FICHAJE),
    ("checkin required", FICHAJE),
    ("no available channel", SIN_CANAL),
    ("model_not_found", MODELO_FUERA),
    ("does not exist", MODELO_FUERA),
    ("unavailable for free", MODELO_FUERA),
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
    ("quota", SIN_CUPO),
    ("insufficient", SIN_CUPO),
    ("recharge", SIN_CUPO),
    ("authentication", SIN_CLAVE),
    ("invalid api key", SIN_CLAVE),
    ("unauthorized", SIN_CLAVE),
    ("missing request extension", SIN_CLAVE),
)


def clasificar(http, cuerpo="", hubo_tokens=False):
    """Estado de una pasarela a partir de UNA llamada de ocho tokens.

    `hubo_tokens` manda sobre todo lo demás: si escribió, está viva, se diga lo que
    se diga en el cuerpo. `http=0` es el caso que nos costó el día: conexión aceptada
    y ni un byte de vuelta.
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
    if http == 0:
        return LENTA
    if http in (401, 403):
        return SIN_CLAVE
    if http == 429:
        return SIN_CUPO
    if http in (402, 404):
        return MODELO_FUERA
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


def accion_de(clave, estado):
    """Qué hacer con esta pasarela, en una frase, con enlace si toca."""
    ficha = CATALOGO.get(clave, {"nombre": clave, "enlace": "", "nota": ""})
    if estado == ESCRIBE:
        return {"texto": "escribe: déjala en la rotación", "enlace": "", "humano": False}
    if estado == SIN_CUPO:
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
    return {"texto": "no responde: fuera de la rotación hasta nuevo aviso",
            "enlace": ficha["enlace"], "humano": False}


def informe(resultados):
    """Texto corto para el chat/Telegram. `resultados`: [{clave, modelo, estado}]."""
    vivas = [r for r in resultados if r.get("estado") == ESCRIBE]
    lineas = ["*Pasarelas* · %d de %d escriben" % (len(vivas), len(resultados))]
    # El fichaje va justo detrás de las vivas: es la única línea del informe que
    # Alex puede convertir en ocho modelos con un clic. Enterrarla abajo es
    # desperdiciarla.
    orden = {ESCRIBE: 0, FICHAJE: 1, LENTA: 2, SIN_CUPO: 3, SIN_CANAL: 4,
             MODELO_FUERA: 5, SIN_CLAVE: 6, CAIDA: 7}
    for r in sorted(resultados, key=lambda x: orden.get(x.get("estado"), 9)):
        ficha = CATALOGO.get(r.get("clave"), {})
        a = accion_de(r.get("clave"), r.get("estado"))
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
    estados = {}
    for fila in (informe or {}).get("pasarelas", []) or []:
        estados[fila.get("clave")] = fila.get("estado")
    utiles, apartados = [], []
    for m in modelos or []:
        p = pasarela_de(m)
        if p in siempre or p not in estados or estados[p] in UTILIZABLES:
            utiles.append(m)
        else:
            apartados.append((m, estados[p]))
    if not utiles:
        return list(modelos or []), []
    return utiles, apartados


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
