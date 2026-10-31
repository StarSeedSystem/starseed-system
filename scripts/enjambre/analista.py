# -*- coding: utf-8 -*-
"""analista · un sueño profundo: UN área de StarSeed OS vista con UNA lente, con modelos gratuitos.

POR QUÉ EXISTE (2026-09-29). Alex: «orquesta una flota de agentes de sueños profundos que pueda
llevar varias horas, donde analicen a detalle cada área de todo StarSeed OS para buscar mejoras
y optimizaciones potenciales como recomendaciones para próximas olas». Las tareas del enjambre
escriben código; éstas LEEN código y escriben un informe. Por eso no usan worktree, ni tsc, ni
vitest, ni integran nada: el orquestador (`starseed-enjambre.py`, rama temprana de `ejecutar`)
delega aquí toda tarea con `tipo: "analisis"` y su estado final es `informe`, que nunca cuenta
como «sin_cambios».

Cómo trabaja (map → reduce → contraste), todo con la flota GRATUITA y cero crédito de Claude:
  1. LECTURA COMPARTIDA (map). Los archivos del área se trocean (≤ TROZO_CARACTERES, cabe en la
     pasarela más estrecha: Groq, 7.000 tokens) con cada línea numerada. Cada trozo lo lee UN
     modelo rápido con las SEIS lentes a la vez y el resultado se guarda en
     `dream/profundo/<fecha>/.mapa/<hash>.json`. Los seis sueños de la misma área leen los mismos
     archivos, así que el trozo se lee una vez y lo aprovechan los seis: seis veces menos
     llamadas. Si otro sueño está leyendo ese trozo (cerrojo), éste coge otro; así los
     trabajadores de un área se reparten la lectura solos.
  2. SÍNTESIS (reduce). Un modelo capaz funde las observaciones de SU lente en ≤ 10 hallazgos,
     cada uno con cita archivo:línea, impacto (1-5), esfuerzo (1-5), confianza (0-1) y una
     propuesta de tarea de ≤ 3 archivos y ≤ 120 líneas por archivo.
  3. CONTRASTE. OTRO proveedor recibe cada hallazgo con el fragmento REAL del código citado
     (± 6 líneas, leído del disco por este módulo, no por el modelo) y dice confirmado · dudoso ·
     refutado. Lo refutado sale del informe (queda en «descartados»); la confianza se ajusta.

Cuotas: cada llamada pasa por `llamar_llm` del orquestador (cupos RPM, rotación de claves,
avisos de cuota). Aquí, además: un 429 enfría ese proveedor y se prueba otro; si no queda
ninguno, se ESPERA (fase «esperando proveedor») hasta ESPERA_PROVEEDOR_S — esperar no es
rendirse. OpenRouter solo con ids `:free`; ningún proveedor de pago.

Salida: `starseed_memory_root/dream/profundo/<fecha>/<área>--<lente>.md` en el formato del Dream
(Top accionables · Mejoras · Riesgos · Ideas: `N. **Título** — cuerpo`, lo que lee
`scripts/puente/dream_a_cola.py`) y el mismo contenido estructurado en `.json` para el director.

Jev (2026-09-30, protocolo común de los agentes): con un consejero (`ConsejoJev`, lo inyecta el
orquestador sobre `scripts/puente/decidir.py`) cada observación de la lente pasa un TRIAJE antes de
la síntesis (¿accionable? p · valor), en lotes de 8 por llamada: el ruido con p < 0,25 se cae
(nunca más del 60 %) y lo demás llega a la síntesis ordenado por su peso. En la síntesis y el
contraste, cuando hay de verdad dónde elegir (≥ 2 proveedores sanos con cupo), Jev elige con la
ficha de éxitos y fallos de la sesión; el reparto por turnos es la regla y el respaldo. Jev nunca
bloquea: si calla (sin motor, sin crédito), todo sigue como antes, y tras 3 silencios seguidos se
aparta 10 min. La síntesis lleva además el CONTEXTO COMÚN del analista
(`scripts/puente/contexto_agente.py --rol analista --area X`).

Análisis libres y reimaginaciones (2026-10-24, Ola 1024I · IMG1024E): una tarea de análisis con
`modo: "libre"` (encargo del agente de referencias de diseño) o `modo: "reimaginar"` (una propuesta
de la imaginación con notas y referencias) no es área × lente: `_analisis_libre` hace UNA síntesis
con la flota gratuita capaz (`capacidad: "alta"` = solo los capaces; `rol: "diseno"` = primero los
que mejor puntúa el director de diseño; `rol: "alcance"` = contexto de `investigador-alcance`, capaces
y sin notas de diseño), valida la salida (títulos, cuerpo libre ≤ 8000, referencias
solo https; sin el JSON pedido, 3 intentos y fallo honesto) y la escribe de forma atómica en
`t["salida"]`, que solo puede caer en `starseed_memory_root/imaginacion/agentes/`.

Seguridad: nunca se manda a un modelo nada con pinta de secreto (`sanear`), ni archivos `.env`.
La lente de seguridad es privada: su texto no va al bus ni a Telegram (solo recuentos).

Módulo sin efectos al importarse; todas las dependencias entran por parámetro para poder
probarlo con un `llamar_llm` falso (scripts/enjambre/test_analista.py).
"""

import hashlib
import inspect
import json
import os
import re
import socket
import threading
import time

# ─────────────────────────────── lentes ───────────────────────────────
# Única definición: el planificador (`scripts/puente/suenos_areas.py`) las importa de aquí,
# porque esto viaja con el orquestador a ~/.local/bin (instalar.sh) y la lectura compartida
# necesita conocerlas todas.
LENTES = [
    {
        "id": "arquitectura-deuda",
        "nombre": "Arquitectura y deuda técnica",
        "foco": "acoplamiento, duplicación, módulos gigantes, contratos implícitos, código muerto o no cableado",
        "preguntas": [
            "¿Qué lógica está duplicada en dos o más sitios y debería vivir en un módulo puro?",
            "¿Qué archivo mezcla servidor y cliente, o importa `node:*` desde algo que llega al navegador?",
            "¿Qué función o componente nadie importa (integrado no es aplicado)?",
            "¿Qué estado tiene dos fuentes de verdad que pueden divergir?",
        ],
    },
    {
        "id": "ux-accesibilidad-diseno",
        "nombre": "UX, accesibilidad y diseño",
        "foco": "flujo del usuario, estados vacíos y de error, foco y teclado, contraste, Trinity y Liquid Crystal",
        "preguntas": [
            "¿Qué pantalla deja al usuario sin salida, sin estado vacío o sin mensaje de error útil?",
            "¿Qué control no es accesible con teclado, no tiene etiqueta o no marca el foco?",
            "¿Qué se aparta del sistema de diseño (emojis como iconos, sin cursor pointer, transiciones fuera de 150-300 ms)?",
            "¿Qué función existe pero no está registrada en OmniDock, App Launcher o Biblioteca (no se descubre)?",
        ],
    },
    {
        "id": "rendimiento-consumo",
        "nombre": "Rendimiento y consumo",
        "foco": "RAM de la Mac de 8 GB, salida y peticiones de Supabase (plan gratuito), tamaño del bundle, sondeos",
        "preguntas": [
            "¿Qué sondeo, intervalo o suscripción Realtime pide a Supabase sin freno (pestaña oculta, sin líder, sin tope)?",
            "¿Qué consulta trae más filas o columnas de las que pinta?",
            "¿Qué motor pesado se importa de forma estática desde el layout raíz o un proveedor global?",
            "¿Qué proceso o caché crece sin límite en memoria o disco?",
        ],
    },
    {
        "id": "seguridad-privacidad",
        "nombre": "Seguridad y privacidad",
        "foco": "claves y secretos, rutas locales expuestas, RLS, validación de entrada, soberanía de los datos del usuario",
        "preguntas": [
            "¿Qué ruta de API acepta entrada sin validar o sin comprobar sesión/origen?",
            "¿Qué respuesta o registro podría filtrar una clave, una ruta del disco o datos de otra cuenta?",
            "¿Qué dato personal sale del dispositivo sin consentimiento explícito?",
            "¿Qué tabla o consulta depende de RLS que quizá no existe?",
        ],
    },
    {
        "id": "pruebas-fiabilidad",
        "nombre": "Pruebas y fiabilidad",
        "foco": "pruebas que vigilan nombres en vez de conducta, caminos de error sin probar, reintentos y fallos mudos",
        "preguntas": [
            "¿Qué camino de error acaba en `catch {}` mudo o en un verde que no hizo nada?",
            "¿Qué lógica pura importante no tiene ninguna prueba de conducta?",
            "¿Qué prueba comprueba el texto fuente o nombres en vez del comportamiento?",
            "¿Qué operación de red o disco no tiene tiempo límite ni reintento acotado?",
        ],
    },
    {
        "id": "coherencia-triada",
        "nombre": "Coherencia con la Tríada e invariantes",
        "foco": "ontocracia, ciberdelia y transhumanismo comunista (CLAUDE.md §3) e invariantes técnicas (§6)",
        "preguntas": [
            "¿Qué función concentra poder o datos en un servidor central cuando podría ser federada o local?",
            "¿Qué flujo castiga en vez de mediar (justicia restaurativa), o vigila en vez de amplificar?",
            "¿Qué contenido se duplica en vez de referenciarse como entidad única?",
            "¿Qué confunde Cuenta (privada) con Perfil (público), o voto con popularidad?",
        ],
    },
]
IDS_LENTES = [l["id"] for l in LENTES]
# La lente de seguridad describe agujeros: sus informes no salen de la Mac.
LENTES_PRIVADAS = {"seguridad-privacidad"}

# ─────────────────────────────── tamaños y tiempos ───────────────────────────────
# 16.000 caracteres ≈ 5.300 tokens pesimistas (3 car/token, limite_proveedor.py) + ~700 de
# instrucciones: cabe en Groq (7.000), la pasarela gratuita más estrecha que conocemos.
TROZO_CARACTERES = 16000
# De un archivo gigante se lee la cabeza: un sueño no es una auditoría de 300 KB.
TOPE_POR_ARCHIVO = 32000
LINEA_MAX = 400
VERSION_MAPA = "m1"
MAX_OBS_POR_TROZO = 24
MAX_OBS_REDUCE_CARACTERES = 24000
MAX_HALLAZGOS = 10
RADIO_FRAGMENTO = 6
ESPERA_429_S = 75
ESPERA_PROVEEDOR_S = 45 * 60
CERROJO_CADUCA_S = 10 * 60
RECLAMO_CADUCA_S = 3 * 3600
# (2026-09-29) 8 y no 5: los sueños solo hacen HTTP y ahora se reparten por turnos entre toda
# la flota viva; el tope real es el cupo por minuto de cada proveedor, no el hierro.
TOPE_ANALISIS_POR_DEFECTO = 8
SECCIONES = ("mejora", "riesgo", "idea")

# ─────────────────────────────── flota gratuita ───────────────────────────────
# (proveedor, modelo) tal como los entiende `llamar_llm` del orquestador. Los que no existan
# o no tengan clave fallan en segundos y la rotación sigue: no hay que acertar la lista entera.
MAP_RAPIDOS = [
    ("llm7", "gpt-oss"),
    ("nim", "nvidia/nemotron-3-super-120b-a12b"),
    ("xkiro", "minimax/minimax-m2.7-highspeed:free"),
    ("groq", "openai/gpt-oss-120b"),
    ("aihubmix", "gemini-3.7-flash-free"),
    ("openrouter", "nvidia/nemotron-3-super-120b-a12b:free"),
    ("llm7", "minimax-m2.7"),
    ("gemini", "gemini-2.5-flash-lite"),
]
REDUCE_CAPACES = [
    ("nim", "moonshotai/kimi-k3"),
    ("xkiro", "qwen/qwen3.8-max:free"),
    ("nim", "deepseek-ai/deepseek-v4-pro-0813"),
    ("xkiro", "deepseek/deepseek-v4-pro"),
    ("tokenrouter", "z-ai/glm-5.3-free"),
    ("nim", "z-ai/glm-5.3"),
    ("xkiro", "qwen/qwen3.7-plus:free"),
    ("gemini", "gemini-2.5-flash-lite"),
]
CONTRASTE = [
    ("xkiro", "qwen/qwen3.7-plus:free"),
    ("tokenrouter", "z-ai/glm-5.3-free"),
    ("aihubmix", "coding-glm-5.3-free"),
    ("nim", "moonshotai/kimi-k3"),
    ("llm7", "minimax-m2.7"),
    ("openrouter", "nvidia/nemotron-3-super-120b-a12b:free"),
    ("gemini", "gemini-2.5-flash-lite"),
]
PROVEEDORES_DE_PAGO = {"anthropic", "xai", "codex", "openai"}
# Plazo de espera del contraste: sin un SEGUNDO proveedor el informe sale igual (con menos
# confianza y dicho), no se queda 45 min esperando.
ESPERA_CONTRASTE_S = 10 * 60

# Jev en los sueños (2026-09-30): triaje de observaciones y elección de modelo en la síntesis.
TRIAJE_LOTE = 8            # observaciones por llamada a Jev (2 preguntas cada una)
TRIAJE_MIN = 3             # con menos observaciones no merece la pena preguntar
UMBRAL_RUIDO = 0.25        # p(accionable) por debajo → la observación se cae
MAX_CAIDA = 0.6            # nunca se cae más del 60 % de las observaciones de un sueño
NIVELES_VALOR = ["nulo", "bajo", "medio", "alto"]
UMBRAL_RUTA = 0.5          # confianza mínima para que Jev cambie el orden por turnos
TOPE_JEV_TRIAJE = 6        # llamadas de triaje por sueño
TOPE_JEV_RUTA = 4          # llamadas de elección de modelo por sueño (2 reservadas a síntesis/contraste)
JEV_SILENCIOS_MAX = 3
JEV_PAUSA_S = 10 * 60
CONTEXTO_ANALISTA_MAX = 1400


def _sin_repetir(*listas):
    fuera = []
    for lista in listas:
        for par in lista:
            if par not in fuera:
                fuera.append(par)
    return fuera
# Lo que una pasarela admite de entrada (limite_proveedor.TOPES_ENTRADA, copia mínima para
# no depender del import): el resto, sin tope conocido.
TOPES_ENTRADA = {"groq": 7000}
# Tope de SALIDA por proveedor: Groq cuenta los tokens pedidos en su límite por minuto (8000
# TPM en el tramo gratuito), y un trozo ya pesa ~5.500: pedirle 4000 de salida es un 413.
TOPES_SALIDA = {"groq": 1800}


def es_gratuito(prov, modelo):
    """Solo flota gratuita: fuera los de pago y, en OpenRouter, todo lo que no sea `:free`
    (hay 10 $ de crédito que nadie debe gastar sin querer)."""
    if prov in PROVEEDORES_DE_PAGO:
        return False
    if prov == "openrouter" and not str(modelo).endswith(":free"):
        return False
    return True


def estimar_tokens(texto):
    """Mismo criterio pesimista que limite_proveedor.py: 3 caracteres por token."""
    return 0 if not texto else len(texto) // 3 + 1


def es_analisis(t):
    return isinstance(t, dict) and str(t.get("tipo") or "").strip().lower() == "analisis"


def tope_analisis(tareas=(), env_valor=None, libre_mb=None, defecto=TOPE_ANALISIS_POR_DEFECTO):
    """Cuántos sueños a la vez. Los analistas solo hacen HTTP (sin worktree ni puertas), así
    que no comparten el tope de los agentes de código: STARSEED_TOPE_ANALISIS, o el
    `tope_analisis` que el plan dejó en las tareas, o 8. Con la RAM justa se recorta igual:
    < 400 MB libres → la mitad; < 200 MB → uno. Entre 1 y 12."""
    n = None
    if env_valor not in (None, ""):
        try:
            n = int(env_valor)
        except (TypeError, ValueError):
            n = None
    if n is None:
        vals = []
        for t in tareas or ():
            try:
                if isinstance(t, dict) and t.get("tope_analisis") not in (None, ""):
                    vals.append(int(t["tope_analisis"]))
            except (TypeError, ValueError):
                continue
        n = max(vals) if vals else defecto
    n = max(1, min(12, int(n)))
    if libre_mb is not None:
        if libre_mb < 200:
            n = 1
        elif libre_mb < 400:
            n = max(1, n // 2)
    return n


# ─────────────────────────────── texto ───────────────────────────────
_SECRETOS = [
    re.compile(r"\bsk-[A-Za-z0-9_\-]{16,}"),
    re.compile(r"\bgsk_[A-Za-z0-9]{16,}"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}"),
    re.compile(r"\bAIza[0-9A-Za-z_\-]{30,}"),
    re.compile(r"\bxox[abprs]-[A-Za-z0-9\-]{10,}"),
    re.compile(r"\bnvapi-[A-Za-z0-9_\-]{20,}"),
    re.compile(r"\bhf_[A-Za-z0-9]{20,}"),
    re.compile(r"\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{5,}"),
]
_BEARER = re.compile(r"(?i)(bearer\s+)[A-Za-z0-9._\-]{20,}")


def sanear(texto):
    """Tacha lo que tenga forma de clave antes de mandar nada a un modelo. Nunca cambia el
    número de líneas: las citas archivo:línea siguen valiendo."""
    t = texto or ""
    for p in _SECRETOS:
        t = p.sub("[REDACTADO]", t)
    return _BEARER.sub(lambda m: m.group(1) + "[REDACTADO]", t)


def clave(titulo):
    """Identidad estable de un hallazgo. IDÉNTICA a `dream_a_cola.clave` (scripts/puente):
    así el director deduplica los sueños con la misma memoria que el Dream."""
    t = (titulo or "").lower()
    t = re.sub(r"\(.*?\)", " ", t)
    t = re.sub(r"[^\wáéíóúñü0-9 ]+", " ", t)
    return " ".join(t.split())[:60]


def puntuacion(h):
    """Impacto por esfuerzo, pesado por la confianza. Lo que ordena cada informe."""
    try:
        return float(h.get("impacto", 1)) / max(1.0, float(h.get("esfuerzo", 5))) * float(h.get("confianza", 0))
    except (TypeError, ValueError):
        return 0.0


def _entero(v, lo, hi, defecto):
    try:
        return max(lo, min(hi, int(round(float(v)))))
    except (TypeError, ValueError):
        return defecto


def _real(v, lo, hi, defecto):
    try:
        return max(lo, min(hi, float(v)))
    except (TypeError, ValueError):
        return defecto


def _corta(v, n):
    s = " ".join(str(v or "").split())
    return s if len(s) <= n else s[: n - 1].rstrip() + "…"


_PENSAMIENTO = re.compile(r"<think(?:ing)?>.*?</think(?:ing)?>", re.S | re.I)
_TOPE_TEXTO_JSON = 80000


def _cierre(texto, i):
    """Índice del carácter que cierra el { o [ de la posición i, o -1 si no se cierra (la
    respuesta llegó cortada). Respeta cadenas y escapes: una llave dentro de un texto no cuenta."""
    pila, en_cadena, escape = 0, False, False
    for j in range(i, len(texto)):
        c = texto[j]
        if en_cadena:
            if escape:
                escape = False
            elif c == "\\":
                escape = True
            elif c == '"':
                en_cadena = False
            continue
        if c == '"':
            en_cadena = True
        elif c in "{[":
            pila += 1
        elif c in "}]":
            pila -= 1
            if pila == 0:
                return j
            if pila < 0:
                return -1
    return -1


def _cargar_json(trozo):
    for intento in (trozo, re.sub(r",\s*([}\]])", r"\1", trozo)):
        try:
            return json.loads(intento)
        except ValueError:
            continue
    return None


def objetos_json(texto, limite=300):
    """Los objetos JSON de nivel superior que se dejan leer, en orden de aparición. Salta
    prosa, razonamiento («We need to output JSON…») y vallas ```json sin fiarse de ellas."""
    fuera, i, n = [], 0, len(texto)
    while i < n and len(fuera) < limite:
        if texto[i] == "{":
            j = _cierre(texto, i)
            if j > i:
                d = _cargar_json(texto[i:j + 1])
                if isinstance(d, dict):
                    fuera.append(d)
                    i = j + 1
                    continue
        i += 1
    return fuera


def rescatar_lista(texto, clave):
    """Los elementos COMPLETOS de la lista `clave` de una respuesta cortada por max_tokens:
    `{"observaciones": [ {…}, {…}, { "lente": "ri` → los dos primeros. None si no hay ninguno."""
    marcas = [m.end() for m in re.finditer(r'"%s"\s*:\s*\[' % re.escape(clave), texto)]
    for inicio in reversed(marcas):
        items, i, n = [], inicio, len(texto)
        while i < n:
            c = texto[i]
            if c in " \t\r\n,":
                i += 1
                continue
            if c != "{":
                break
            j = _cierre(texto, i)
            if j < 0:
                break
            d = _cargar_json(texto[i:j + 1])
            if isinstance(d, dict):
                items.append(d)
            i = j + 1
        if items:
            return items
    return None


def extraer_json(texto, clave=None):
    """El objeto JSON útil de una respuesta de modelo, venga como venga.

    (2026-09-29, primera sesión real) Tres formas que tumbaban lecturas buenas:
      · nemotron: «We need to output JSON… (razonamiento con llaves)… {"observaciones": […]}»;
      · gpt-oss en Groq: `{ "observaciones": [ {…}, {…}, { "lente": …` cortado por max_tokens;
      · la respuesta dentro de ```json … ``` con prosa alrededor.
    Con `clave` («observaciones», «hallazgos», «veredictos») se elige el objeto que la trae
    (el más completo; ante empate, el último: el eco del esquema del prompt va antes que la
    respuesta), y si ninguno cierra se rescatan los elementos completos de esa lista. Sin
    `clave`, el primer objeto que se deje leer. None si no hay nada aprovechable."""
    if not texto:
        return None
    t = _PENSAMIENTO.sub(" ", str(texto))[:_TOPE_TEXTO_JSON]
    objetos = objetos_json(t)
    if not clave:
        return objetos[0] if objetos else None
    con = [(i, o) for i, o in enumerate(objetos) if isinstance(o.get(clave), list)]
    if con:
        return max(con, key=lambda x: (len(x[1][clave]), x[0]))[1]
    items = rescatar_lista(t, clave)
    if items is not None:
        fuera = {clave: items, "_rescatado": True}
        resumen = re.search(r'"resumen"\s*:\s*"((?:[^"\\]|\\.)*)"', t)
        if resumen:
            try:
                fuera["resumen"] = json.loads('"%s"' % resumen.group(1))
            except ValueError:
                pass
        return fuera
    # Una lista suelta de elementos también vale: [{…}, {…}].
    i = t.find("[")
    while 0 <= i < len(t):
        j = _cierre(t, i)
        if j > i:
            d = _cargar_json(t[i:j + 1])
            if isinstance(d, list) and d and all(isinstance(x, dict) for x in d):
                return {clave: d}
        i = t.find("[", i + 1)
    return None


# ─────────────────────────────── lectura y trozos ───────────────────────────────

def leer_archivos(archivos, leer):
    """{ruta: [líneas saneadas]} de lo que se pudo leer (`leer(ruta)` → texto o None).
    Se corta en TOPE_POR_ARCHIVO por una frontera de línea y cada línea en LINEA_MAX."""
    fuera = {}
    for ruta in archivos or []:
        try:
            texto = leer(ruta)
        except Exception:
            texto = None
        if texto is None:
            continue
        texto = sanear(texto)
        if len(texto) > TOPE_POR_ARCHIVO:
            corte = texto.rfind("\n", 0, TOPE_POR_ARCHIVO)
            texto = texto[: corte if corte > 0 else TOPE_POR_ARCHIVO]
        fuera[ruta] = [l[:LINEA_MAX] for l in texto.splitlines()]
    return fuera


def trozos_de(lineas_por_archivo, orden=None, tope=TROZO_CARACTERES):
    """Trozos de lectura con líneas numeradas. Determinista: mismo conjunto de archivos en el
    mismo orden → mismos trozos y mismos hashes (la clave de la lectura compartida). Un
    archivo largo se parte entre trozos; uno vacío no se manda a nadie."""
    orden = [r for r in (orden or list(lineas_por_archivo)) if r in lineas_por_archivo]
    trozos = []
    estado = {"texto": "", "partes": []}

    def cerrar():
        if estado["texto"]:
            h = hashlib.sha1((VERSION_MAPA + "\n" + estado["texto"]).encode("utf-8")).hexdigest()[:16]
            trozos.append({"texto": estado["texto"], "partes": estado["partes"], "hash": h})
        estado["texto"], estado["partes"] = "", []

    for ruta in orden:
        lineas = lineas_por_archivo[ruta]
        total = len(lineas)
        i = 0
        while i < total:
            libre = tope - len(estado["texto"]) - (len(ruta) + 48)
            if libre < 400 and estado["texto"]:
                cerrar()
                continue
            j, usado = i, 0
            while j < total:
                coste = len(lineas[j]) + len(str(j + 1)) + 3
                if j > i and usado + coste > libre:
                    break
                usado += coste
                j += 1
            cuerpo = "\n".join("%d| %s" % (k + 1, lineas[k]) for k in range(i, j))
            estado["texto"] += "=== archivo: %s (líneas %d-%d de %d) ===\n%s\n" % (ruta, i + 1, j, total, cuerpo)
            estado["partes"].append({"archivo": ruta, "desde": i + 1, "hasta": j})
            i = j
            if i < total:
                cerrar()
    cerrar()
    return trozos


def fragmento(lineas, linea, radio=RADIO_FRAGMENTO):
    """El código real alrededor de una cita, numerado. Vacío si la cita no apunta a nada."""
    if not lineas or not isinstance(linea, int) or linea < 1 or linea > len(lineas):
        return ""
    a, b = max(1, linea - radio), min(len(lineas), linea + radio)
    return "\n".join("%d| %s" % (k, lineas[k - 1]) for k in range(a, b + 1))


# ─────────────────────────────── prompts ───────────────────────────────
CASA = (
    "CONTEXTO DE LA CASA: StarSeed OS es Next.js 15 + React 19 + TypeScript estricto + Supabase "
    "(plan gratuito: 5 GB de salida por ciclo) y Python en scripts/; la orquestación corre en una "
    "Mac de 8 GB; las tareas del enjambre tocan ≤3 archivos y ≤120 líneas por archivo; la Tríada "
    "(ontocracia, ciberdelia, transhumanismo comunista) exige soberanía del usuario, nada de "
    "vigilancia y código abierto."
)


def prompt_map(t, trozo, i, n):
    lentes = "\n".join("- %s (%s): %s" % (l["id"], l["nombre"], l["foco"]) for l in LENTES)
    return (
        "Eres un analista senior de StarSeed OS en un «sueño profundo»: lees código real para "
        "encontrar mejoras concretas.\n"
        "ÁREA: %s — %s\n\n"
        "Mira este trozo (%d de %d) con estas SEIS lentes a la vez:\n%s\n\n%s\n\n"
        "Devuelve SOLO un objeto JSON, sin texto antes ni después:\n"
        '{"observaciones":[{"lente":"<id de la lente>","archivo":"<ruta exacta del encabezado ===>",'
        '"linea":<número de la izquierda>,"tipo":"mejora|riesgo|idea","texto":"qué pasa y por qué '
        'importa, ≤30 palabras","impacto":1,"esfuerzo":1,"confianza":0.5}]}\n'
        "Empieza tu respuesta por { y termina por }: nada de razonamiento fuera del JSON.\n"
        "REGLAS: como mucho 3 observaciones por lente; cita SOLO líneas que ves en este trozo; nada "
        "de suposiciones sobre código que no está aquí; si una lente no tiene nada que decir, no la "
        "inventes (una lista vacía es una respuesta válida). impacto 5 = rompe algo o cuesta dinero o "
        "datos; esfuerzo 1 = una línea; confianza = cuánto se ve en el propio código.\n\n"
        "--- TROZO %d/%d ---\n%s"
        % (
            t.get("area_nombre") or t.get("area"), t.get("area_descripcion") or "",
            i, n, lentes, CASA, i, n, trozo["texto"],
        )
    )


def _lente(lid):
    return next((l for l in LENTES if l["id"] == lid), {"id": lid, "nombre": lid, "foco": "", "preguntas": []})


def prompt_reduce(t, observaciones, n_archivos, contexto=""):
    l = _lente(t.get("lente"))
    obs = sorted(observaciones, key=lambda o: -_peso(o))
    con_jev = any(o.get("p_jev") is not None for o in obs)
    cuerpo, usados = [], 0
    for o in obs:
        fila = {k: o[k] for k in ("archivo", "linea", "tipo", "texto", "impacto", "esfuerzo", "confianza")}
        if o.get("p_jev") is not None:
            fila["p_jev"] = o["p_jev"]
        s = json.dumps(fila, ensure_ascii=False)
        if usados + len(s) > MAX_OBS_REDUCE_CARACTERES:
            break
        cuerpo.append(s)
        usados += len(s)
    return (
        "Eres el sintetizador de un sueño profundo de StarSeed OS.\n"
        "ÁREA: %s — %s\nLENTE: %s — %s\nPreguntas guía:\n%s\n\n%s\n\n%s"
        "Los lectores dejaron estas %d observaciones (con cita archivo:línea) sobre %d archivos:\n[%s]\n\n%s"
        "Sintetiza el informe de ESTA lente. Devuelve SOLO JSON:\n"
        '{"resumen":"2-3 frases","hallazgos":[{"titulo":"≤12 palabras, empieza por un verbo de acción '
        '(añadir, unificar, reducir, corregir, limitar, mover, documentar…)","seccion":"mejora|riesgo|idea",'
        '"archivo":"ruta","linea":1,"impacto":1,"esfuerzo":1,"confianza":0.5,"detalle":"≤50 palabras: '
        'qué pasa, por qué importa y cómo se nota","propuesta":{"titulo":"tarea para el enjambre",'
        '"archivos":["≤3 rutas"],"cambio":"qué cambiar, ≤50 palabras"}}]}\n'
        "REGLAS: fusiona observaciones repetidas; como mucho %d hallazgos, los de más impacto por "
        "esfuerzo primero; cada hallazgo conserva UNA cita archivo:línea tomada literalmente de las "
        "observaciones; la propuesta cabe en ≤3 archivos y ≤120 líneas por archivo (si no cabe, "
        "propón solo el primer paso); descarta lo que no sea de esta lente; no inventes archivos."
        % (
            t.get("area_nombre") or t.get("area"), t.get("area_descripcion") or "",
            l["nombre"], l["foco"], "\n".join("- " + p for p in l["preguntas"]), CASA,
            ("CONTEXTO COMÚN DE LOS AGENTES (reglas de la casa; mandan sobre tu criterio):\n%s\n\n" % contexto.strip())
            if contexto and contexto.strip() else "",
            len(cuerpo), n_archivos, ",\n".join(cuerpo),
            ("p_jev = probabilidad (Jev) de que la observación sea accionable: ya van ordenadas por peso; "
             "prioriza las altas y desconfía de las bajas.\n\n") if con_jev else "",
            MAX_HALLAZGOS,
        )
    )


def prompt_contraste(t, hallazgos, lineas_por_archivo):
    l = _lente(t.get("lente"))
    bloques = []
    for i, h in enumerate(hallazgos):
        frag = fragmento(lineas_por_archivo.get(h["archivo"]), h["linea"]) or "(la cita no apunta a ninguna línea que exista)"
        bloques.append(
            "[%d] «%s» (impacto %d, esfuerzo %d) — %s\ncita: %s:%d\n```\n%s\n```"
            % (i, h["titulo"], h["impacto"], h["esfuerzo"], h["detalle"], h["archivo"], h["linea"], frag)
        )
    return (
        "Eres el VERIFICADOR de un sueño profundo de StarSeed OS (otro proveedor, distinto del que "
        "redactó). Lente: %s. Para cada hallazgo tienes el FRAGMENTO REAL del código citado (±%d "
        "líneas). Di si lo que afirma se sostiene al leer ese código.\n"
        "Devuelve SOLO JSON: "
        '{"veredictos":[{"i":0,"veredicto":"confirmado|dudoso|refutado","nota":"≤25 palabras"}]}\n'
        "confirmado = el fragmento muestra lo que dice; dudoso = no se puede comprobar solo con el "
        "fragmento; refutado = el fragmento lo contradice o la cita no apunta a nada relacionado.\n\n%s"
        % (l["nombre"], RADIO_FRAGMENTO, "\n\n".join(bloques))
    )


# ─────────────────────────────── normalización ───────────────────────────────

def _ruta_valida(ruta, conocidas):
    """La ruta citada, o la única conocida con ese nombre de archivo, o None."""
    r = str(ruta or "").strip().strip("`").lstrip("./")
    if r in conocidas:
        return r
    base = os.path.basename(r)
    candidatas = [c for c in conocidas if os.path.basename(c) == base]
    return candidatas[0] if len(candidatas) == 1 else None


def normalizar_observaciones(d, rutas):
    """Observaciones limpias de un trozo. None si la respuesta no tenía la forma pedida."""
    if not isinstance(d, dict) or not isinstance(d.get("observaciones"), list):
        return None
    fuera = []
    for o in d["observaciones"]:
        if not isinstance(o, dict):
            continue
        lente = str(o.get("lente") or "").strip()
        ruta = _ruta_valida(o.get("archivo"), rutas)
        texto = _corta(o.get("texto"), 400)
        if lente not in IDS_LENTES or not ruta or not texto:
            continue
        tipo = str(o.get("tipo") or "mejora").strip().lower()
        fuera.append({
            "lente": lente,
            "archivo": ruta,
            "linea": _entero(o.get("linea"), 1, 10 ** 6, 1),
            "tipo": tipo if tipo in SECCIONES else "mejora",
            "texto": texto,
            "impacto": _entero(o.get("impacto"), 1, 5, 2),
            "esfuerzo": _entero(o.get("esfuerzo"), 1, 5, 3),
            "confianza": round(_real(o.get("confianza"), 0.0, 1.0, 0.5), 2),
        })
        if len(fuera) >= MAX_OBS_POR_TROZO:
            break
    return fuera


def _ruta_propuesta(r):
    r = str(r or "").strip().strip("`")
    if not r or ".." in r or r.startswith("/") or re.search(r"\s", r):
        return None
    return r[:200]


def normalizar_hallazgos(d, lineas_por_archivo):
    """Hallazgos del reduce, validados contra lo leído. None si la respuesta no servía.
    Una cita que no existe no se tira: baja a la mitad de confianza y se marca, para que el
    contraste y el verificador Claude la vean."""
    if not isinstance(d, dict) or not isinstance(d.get("hallazgos"), list):
        return None
    conocidas = list(lineas_por_archivo)
    fuera, vistas = [], set()
    for h in d["hallazgos"]:
        if not isinstance(h, dict):
            continue
        titulo = _corta(h.get("titulo"), 140)
        if not titulo:
            continue
        k = clave(titulo)
        if not k or k in vistas:
            continue
        vistas.add(k)
        ruta = _ruta_valida(h.get("archivo"), conocidas)
        linea = _entero(h.get("linea"), 1, 10 ** 6, 1)
        cita_valida = bool(ruta) and 1 <= linea <= len(lineas_por_archivo.get(ruta) or [])
        confianza = _real(h.get("confianza"), 0.0, 1.0, 0.5)
        if not cita_valida:
            confianza *= 0.5
        prop = h.get("propuesta") if isinstance(h.get("propuesta"), dict) else {}
        archivos = [a for a in (_ruta_propuesta(x) for x in (prop.get("archivos") or [])) if a][:3]
        if not archivos and ruta:
            archivos = [ruta]
        seccion = str(h.get("seccion") or "mejora").strip().lower()
        fuera.append({
            "clave": k,
            "titulo": titulo,
            "seccion": seccion if seccion in SECCIONES else "mejora",
            "archivo": ruta or _corta(h.get("archivo"), 200),
            "linea": linea,
            "cita_valida": cita_valida,
            "impacto": _entero(h.get("impacto"), 1, 5, 2),
            "esfuerzo": _entero(h.get("esfuerzo"), 1, 5, 3),
            "confianza": round(confianza, 2),
            "detalle": _corta(h.get("detalle"), 600),
            "propuesta": {
                "titulo": _corta(prop.get("titulo") or titulo, 160),
                "archivos": archivos,
                "lineas_max": 120,
                "cambio": _corta(prop.get("cambio"), 500),
            },
        })
    fuera.sort(key=lambda x: -puntuacion(x))
    return fuera[:MAX_HALLAZGOS]


def leer_sintesis(texto, lineas_por_archivo):
    """(resumen, hallazgos) de la respuesta del reduce, o None si no tenía la forma pedida."""
    d = extraer_json(texto, "hallazgos")
    hallazgos = normalizar_hallazgos(d, lineas_por_archivo)
    if hallazgos is None:
        return None
    return _corta(d.get("resumen"), 600), hallazgos


def aplicar_contraste(hallazgos, d, revisor=""):
    """(quedan, descartados). confirmado: +0,1 de confianza; dudoso: ×0,7; refutado: fuera;
    sin veredicto: ×0,85. Nada se borra en silencio: lo refutado queda con su nota."""
    veredictos = {}
    if isinstance(d, dict) and isinstance(d.get("veredictos"), list):
        for v in d["veredictos"]:
            if isinstance(v, dict):
                i = _entero(v.get("i"), -1, 10 ** 6, -1)
                ver = str(v.get("veredicto") or "").strip().lower()
                if i >= 0 and ver in ("confirmado", "dudoso", "refutado"):
                    veredictos[i] = (ver, _corta(v.get("nota"), 200))
    quedan, descartados = [], []
    for i, h in enumerate(hallazgos):
        h = dict(h)
        ver, nota = veredictos.get(i, ("sin_veredicto", ""))
        h["contraste"] = ver
        h["nota_contraste"] = nota
        h["revisor"] = revisor
        c = float(h.get("confianza", 0))
        if ver == "refutado":
            descartados.append(h)
            continue
        if ver == "confirmado":
            c = min(1.0, c + 0.1)
        elif ver == "dudoso":
            c *= 0.7
        else:
            c *= 0.85
        h["confianza"] = round(c, 2)
        quedan.append(h)
    quedan.sort(key=lambda x: -puntuacion(x))
    return quedan, descartados


# ─────────────────────────────── informe ───────────────────────────────

def _linea_md(i, h, privado=False):
    prop = h.get("propuesta") or {}
    extra = ""
    if h.get("contraste") and h["contraste"] != "sin_veredicto":
        extra = " · contraste: %s%s" % (h["contraste"], (" (%s)" % h["nota_contraste"]) if h.get("nota_contraste") else "")
    if not h.get("cita_valida", True):
        extra += " · ⚠ cita sin comprobar"
    return (
        "%d. **%s** — `%s:%d` · impacto %d · esfuerzo %d · confianza %.2f · %s **Propuesta:** %s "
        "(archivos: %s · ≤120 líneas/archivo) — %s%s"
        % (i, h["titulo"], h["archivo"], h["linea"], h["impacto"], h["esfuerzo"], h["confianza"],
           h.get("detalle") or "", prop.get("titulo") or h["titulo"],
           ", ".join(prop.get("archivos") or []) or "—", prop.get("cambio") or "", extra)
    )


def render_md(inf):
    """El informe en el formato del Dream: `## Top 3 accionables`, `## Mejoras detectadas`,
    `## Riesgos`, `## Ideas nuevas`, con puntos `N. **Título** — cuerpo`."""
    hs = inf.get("hallazgos") or []
    lin = [
        "# 🌙 Sueño profundo — %s × %s (%s)" % (inf.get("area_nombre") or inf["area"], inf.get("lente_nombre") or inf["lente"], inf["sesion"]),
        "",
        "> Tarea %s · %d archivos en %d trozos (%d leídos por este sueño) · lectura: %s · síntesis: %s · contraste: %s · ~%s tokens estimados · %d min"
        % (inf["id"], len(inf.get("archivos_leidos") or []), inf.get("trozos", 0), inf.get("trozos_propios", 0),
           ", ".join(inf.get("modelos", {}).get("mapa") or []) or "caché compartida",
           inf.get("modelos", {}).get("sintesis") or "—", inf.get("modelos", {}).get("contraste") or "sin contraste",
           "{:,}".format(inf.get("tokens", {}).get("entrada", 0) + inf.get("tokens", {}).get("salida", 0)).replace(",", "."),
           int(inf.get("segundos", 0) // 60)),
    ]
    if inf.get("privado"):
        lin.append("> 🔒 PRIVADO: este informe se queda en esta Mac (ni bus, ni Telegram, ni nube).")
    jev = inf.get("jev") or {}
    tri = jev.get("triaje") or {}
    if tri.get("lotes") or jev.get("rutas"):
        lin.append("> Consejo de Jev: triaje %d/%d observaciones (%d caídas por ruido)%s · %s" % (
            tri.get("respondidas", 0), tri.get("observaciones", 0), tri.get("caidas", 0),
            (" · eligió modelo %d vez/veces" % len(jev.get("rutas") or [])) if jev.get("rutas") else "",
            ", ".join(jev.get("medios") or []) or "sin respuesta"))
    if inf.get("resumen"):
        lin += ["", "**Resumen:** " + inf["resumen"]]
    lin += ["", "## Top 3 accionables", ""]
    top = hs[:3]
    lin += [_linea_md(i + 1, h) for i, h in enumerate(top)] or ["_Nada accionable con esta lente._"]
    for titulo, sec in (("Mejoras detectadas", "mejora"), ("Riesgos", "riesgo"), ("Ideas nuevas", "idea")):
        grupo = [h for h in hs if h.get("seccion") == sec]
        lin += ["", "## " + titulo, ""]
        lin += [_linea_md(i + 1, h) for i, h in enumerate(grupo)] or ["_Ninguna._"]
    desc = inf.get("descartados") or []
    if desc:
        lin += ["", "## Descartados por el contraste", ""]
        lin += ["- ~~%s~~ — `%s:%d` · %s" % (h["titulo"], h["archivo"], h["linea"], h.get("nota_contraste") or "refutado") for h in desc]
    lin += ["", "_Verifícalo un supervisor Claude: `python3 scripts/puente/suenos.py veredicto %s --estado verificado|ajustado|rechazado --nota \"…\" --por claude-<modelo>`._" % inf["id"], ""]
    return "\n".join(lin)


def informe_valido(ruta_json, tid):
    try:
        with open(ruta_json, encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, dict) and d.get("id") == tid and isinstance(d.get("hallazgos"), list) else None
    except (OSError, ValueError):
        return None


def _escribir_atomico(ruta, texto):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    tmp = "%s.%d.tmp" % (ruta, os.getpid())
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(texto)
    os.replace(tmp, ruta)


# ─────────────────────────────── cerrojos (entre sueños y entre orquestadores) ───────────────────────────────

def _pid_vivo(pid):
    try:
        os.kill(int(pid), 0)
        return True
    except (OSError, ValueError, TypeError):
        return False


def _tomar(ruta, reloj, caduca_s):
    """Crea `ruta` en exclusiva (O_EXCL). Un cerrojo viejo o de un proceso muerto de esta
    máquina se rompe. True si ahora es nuestro."""
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    datos = json.dumps({"pid": os.getpid(), "host": socket.gethostname(), "t": reloj()})
    for _ in range(2):
        try:
            fd = os.open(ruta, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o644)
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                f.write(datos)
            return True
        except FileExistsError:
            try:
                with open(ruta, encoding="utf-8") as f:
                    previo = json.load(f)
            except (OSError, ValueError):
                previo = {}
            viejo = reloj() - float(previo.get("t") or 0) > caduca_s
            muerto = previo.get("host") == socket.gethostname() and not _pid_vivo(previo.get("pid"))
            if not (viejo or muerto):
                return False
            try:
                os.remove(ruta)
            except OSError:
                return False
    return False


def _soltar(ruta):
    try:
        os.remove(ruta)
    except OSError:
        pass


# ─────────────────────────────── llamadas ───────────────────────────────

class SinProveedor(RuntimeError):
    """Ningún proveedor gratuito respondió en todo el plazo de espera."""


class SinFormato(RuntimeError):
    """La flota respondió, pero ninguna respuesta traía el JSON pedido en los intentos acotados."""


# ─────────────────────────────── salud de la flota (compartida por todos los sueños) ───────────────────────────────
# (2026-09-29, primera sesión real: 4 informes en 151 min.) Cada sueño llevaba su propia
# memoria de fallos, así que un id MUERTO (403 de Gemini 2.5, 404 de AIHubMix) se volvía a
# probar en cada ronda de cada trozo de cada sueño, y un proveedor saturado (429) se
# reintentaba en los cinco trabajadores a la vez. Ahora la salud es de la SESIÓN: un modelo
# que da 403/404/410 o «model not found» sale para siempre al primer intento; un 429/5xx lo
# enfría un rato corto, con espera creciente si repite; y el reparto va por turnos entre
# TODOS los proveedores sanos (el menos usado primero), para que ningún cupo sea el cuello.
MUERTO, SIN_CLAVE, CUOTA, RITMO, SERVIDOR, GRANDE, OTRO = (
    "muerto", "sin_clave", "cuota", "ritmo", "servidor", "grande", "otro")
ENFRIAR_S = {RITMO: 90, SERVIDOR: 60, OTRO: 45}
ENFRIAR_MAX_S = 15 * 60
CUOTA_FUERA_S = 60 * 60
MALA_FORMA_ENFRIAR_S = 10 * 60


def clasificar_fallo(mensaje):
    """Qué le pasó a una llamada, por el texto de su error. PURA."""
    msg = str(mensaje or "")
    bajo = msg.lower()
    codigo = re.search(r"\b(4\d\d|5\d\d)\b", msg)
    c = codigo.group(1) if codigo else ""
    if "sin clave" in bajo or c == "401" or "unauthorized" in bajo or "invalid api key" in bajo:
        return SIN_CLAVE
    if c == "402" or any(k in bajo for k in ("cuota", "quota", "sin claves útiles", "daily limit",
                                              "insufficient", "credits", "check-in", "for today")):
        return CUOTA
    if c in ("403", "404", "410") or any(k in bajo for k in (
            "model not found", "model_not_found", "does not exist", "no such model", "unknown model",
            "invalid model", "no endpoints found", "not a valid model", "is not supported", "decommissioned")):
        return MUERTO
    if c == "413" or "too large" in bajo or "context length" in bajo or "maximum context" in bajo:
        return GRANDE
    if c == "429" or "too many requests" in bajo or "rate limit" in bajo:
        return RITMO
    if c in ("500", "502", "503", "504", "529") or any(k in bajo for k in (
            "timed out", "timeout", "connection", "reset by peer", "temporarily", "overloaded", "unavailable")):
        return SERVIDOR
    return OTRO


class SaludFlota(object):
    """Memoria de la SESIÓN (todas las tareas de análisis del proceso comparten una)."""

    def __init__(self):
        self.lock = threading.Lock()
        self.muertos = {}          # (p, m) -> motivo: fuera para toda la sesión
        self.fuera = {}            # p -> (hasta, motivo): sin clave (sesión) o sin cuota (1 h)
        self.enfriado = {}         # (p, m) -> hasta
        self.enfriado_prov = {}    # p -> hasta (un 429 suele ser del proveedor entero)
        self.seguidos = {}         # (p, m) -> fallos seguidos (espera creciente)
        self.mala_forma = {}       # (p, m) -> respuestas sin el JSON pedido, seguidas
        self.uso_prov = {}         # p -> última vez que se le pidió algo
        self.uso_mod = {}          # (p, m) -> ídem
        self.cuentas = {}          # (p, m) -> {ok, fallos, forma}: la ficha que ve Jev al elegir

    def sano(self, p, m, ahora):
        with self.lock:
            if (p, m) in self.muertos:
                return False
            f = self.fuera.get(p)
            if f and f[0] > ahora:
                return False
            return self.enfriado.get((p, m), 0) <= ahora and self.enfriado_prov.get(p, 0) <= ahora

    def volvera(self, p, m, ahora):
        """¿Puede volver a estar sano en esta sesión (no está muerto ni sin clave)?"""
        with self.lock:
            if (p, m) in self.muertos:
                return False
            f = self.fuera.get(p)
            return not (f and f[0] == float("inf"))

    def proximo(self, ahora):
        """Cuándo se despierta el primero que está enfriándose (o None)."""
        with self.lock:
            fechas = [v for v in list(self.enfriado.values()) + list(self.enfriado_prov.values()) if v > ahora]
            fechas += [v[0] for v in self.fuera.values() if ahora < v[0] < float("inf")]
            return min(fechas) if fechas else None

    def usar(self, p, m, ahora):
        with self.lock:
            self.uso_prov[p] = ahora
            self.uso_mod[(p, m)] = ahora

    def orden(self, pares):
        """Por turnos: el proveedor menos usado primero, y dentro, el modelo menos usado."""
        with self.lock:
            return sorted(pares, key=lambda x: (self.uso_prov.get(x[0], -1.0), self.uso_mod.get(x, -1.0)))

    def _contar(self, p, m, que):
        c = self.cuentas.setdefault((p, m), {"ok": 0, "fallos": 0, "forma": 0})
        c[que] += 1

    def ficha(self, p, m):
        with self.lock:
            return dict(self.cuentas.get((p, m)) or {"ok": 0, "fallos": 0, "forma": 0})

    def exito(self, p, m):
        with self.lock:
            self.seguidos.pop((p, m), None)
            self.mala_forma.pop((p, m), None)
            self._contar(p, m, "ok")

    def fallo(self, p, m, clase, ahora, motivo=""):
        """Anota un fallo y devuelve qué se hizo (para el registro)."""
        with self.lock:
            self._contar(p, m, "fallos")
            if clase == MUERTO or clase == GRANDE:
                self.muertos[(p, m)] = _corta(motivo, 120) or clase
                return "fuera para toda la sesión (%s)" % clase
            if clase == SIN_CLAVE:
                self.fuera[p] = (float("inf"), _corta(motivo, 120))
                return "proveedor sin clave: fuera para toda la sesión"
            if clase == CUOTA:
                self.fuera[p] = (ahora + CUOTA_FUERA_S, _corta(motivo, 120))
                return "proveedor sin cuota: fuera %d min" % (CUOTA_FUERA_S // 60)
            n = self.seguidos.get((p, m), 0) + 1
            self.seguidos[(p, m)] = n
            espera = min(ENFRIAR_MAX_S, ENFRIAR_S.get(clase, 45) * (2 ** (n - 1)))
            self.enfriado[(p, m)] = ahora + espera
            if clase == RITMO:
                # Un 429 suele ser del proveedor entero (su RPM): todos sus modelos, 30 s.
                self.enfriado_prov[p] = max(self.enfriado_prov.get(p, 0), ahora + 30)
            return "enfriado %d s (%s, %d seguidos)" % (espera, clase, n)

    def forma(self, p, m, ahora):
        """Una respuesta sin el JSON pedido: a la segunda seguida, 10 min fuera; a la quinta, sesión."""
        with self.lock:
            self._contar(p, m, "forma")
            n = self.mala_forma.get((p, m), 0) + 1
            self.mala_forma[(p, m)] = n
            if n >= 5:
                self.muertos[(p, m)] = "no devuelve el JSON pedido"
                return "fuera para toda la sesión (no sigue el formato)"
            if n >= 2:
                self.enfriado[(p, m)] = ahora + MALA_FORMA_ENFRIAR_S
                return "enfriado %d min (no sigue el formato)" % (MALA_FORMA_ENFRIAR_S // 60)
            return "se reintenta con otro"

    def resumen(self):
        with self.lock:
            return {"muertos": ["%s/%s" % k for k in self.muertos],
                    "fuera": sorted(self.fuera), "enfriados": len(self.enfriado)}


SALUD = SaludFlota()


# ─────────────────────────────── Jev de consejero ───────────────────────────────

class EstadoJev(object):
    """Circuito de Jev compartido por la SESIÓN: tras JEV_SILENCIOS_MAX silencios seguidos
    (sin motor local, sin crédito, sin red) se aparta JEV_PAUSA_S, para no preguntar en balde
    en cada sueño. Una respuesta lo cierra otra vez."""

    def __init__(self):
        self.lock = threading.Lock()
        self.silencios = 0
        self.pausa_hasta = 0.0
        self.llamadas = 0
        self.respuestas = 0

    def abierto(self, ahora):
        with self.lock:
            return ahora >= self.pausa_hasta

    def anotar(self, hablo, ahora):
        with self.lock:
            self.llamadas += 1
            if hablo:
                self.respuestas += 1
                self.silencios = 0
                return
            self.silencios += 1
            if self.silencios >= JEV_SILENCIOS_MAX:
                self.pausa_hasta = ahora + JEV_PAUSA_S
                self.silencios = 0


JEV_SESION = EstadoJev()


class ConsejoJev(object):
    """Jev para UN sueño, con presupuesto propio (llamadas de triaje y de ruta) y el circuito
    de la sesión. `lote(estado, preguntas, quien=, dominio=)` y `elegir(estado, pregunta,
    opciones, regla=, quien=, dominio=)` tienen la forma de `decidir.consultar_lote` y
    `decidir.consultar("elegir", …)`; `confirmar(exp, acierto, nota)` cierra una experiencia.
    Cualquier fallo es silencio: nunca lanza, nunca bloquea."""

    def __init__(self, lote=None, elegir=None, confirmar=None, estado=None, reloj=time.time,
                 tope_triaje=TOPE_JEV_TRIAJE, tope_ruta=TOPE_JEV_RUTA, quien="analista"):
        self._lote = lote
        self._elegir = elegir
        self._confirmar = confirmar
        self.estado = estado if estado is not None else JEV_SESION
        self.reloj = reloj
        self.quedan = {"triaje": int(tope_triaje), "ruta": int(tope_ruta)}
        self.quien = quien
        self.medios = []

    def puede(self, que, reserva=0):
        return self.quedan.get(que, 0) > reserva and self.estado.abierto(self.reloj())

    def _gastar(self, que, r, hablo):
        self.quedan[que] = max(0, self.quedan.get(que, 0) - 1)
        self.estado.anotar(hablo, self.reloj())
        medio = (r or {}).get("medio") if isinstance(r, dict) else None
        if hablo and medio and medio not in self.medios:
            self.medios.append(medio)

    def triaje(self, estado, preguntas, dominio=""):
        """{qid: respuesta} de un lote, o None si Jev calló o no se puede preguntar."""
        if self._lote is None or not self.puede("triaje"):
            return None
        try:
            r = self._lote(estado, preguntas, quien=self.quien, dominio=dominio)
        except Exception:
            r = None
        respuestas = (r or {}).get("respuestas") if isinstance(r, dict) else None
        hablo = bool(respuestas) and (r or {}).get("medio") != "regla"
        self._gastar("triaje", r, hablo)
        return dict(respuestas) if hablo else None

    def ruta(self, estado, pregunta, opciones, regla, dominio="", reserva=0):
        """(opcion, confianza, experiencia) o None."""
        if self._elegir is None or not self.puede("ruta", reserva):
            return None
        try:
            r = self._elegir(estado, pregunta, opciones, regla=regla, quien=self.quien, dominio=dominio)
        except Exception:
            r = None
        if isinstance(r, dict) and r.get("ocupado"):
            return None  # Jev atendía otra pregunta: manda el turno, sin gastar ni contar silencio
        hablo = isinstance(r, dict) and r.get("medio") not in (None, "regla") and r.get("respuesta") in opciones
        self._gastar("ruta", r, hablo)
        if not hablo:
            return None
        return r["respuesta"], float(r.get("confianza") or 0.0), r.get("experiencia")

    def confirmar(self, experiencia, acierto, nota=""):
        if not experiencia or self._confirmar is None:
            return
        try:
            self._confirmar(experiencia, bool(acierto), nota)
        except Exception:
            pass


def _peso(o):
    """Peso de una observación para la síntesis: impacto × confianza, afinado por Jev si opinó."""
    base = o.get("impacto", 1) * o.get("confianza", 0)
    if o.get("p_jev") is not None:
        base *= (0.5 + float(o["p_jev"])) * (0.75 + 0.5 * float(o.get("valor_jev") or 0.0))
    return base


def triar(t, obs, consejo, log=None):
    """Triaje de Jev de las observaciones de ESTA lente antes de la síntesis. Devuelve
    (observaciones, resumen). Sin consejero, con pocas observaciones o con Jev en silencio,
    devuelve todo tal cual (copias). Nunca cae más de MAX_CAIDA."""
    log = log or (lambda s: None)
    obs = [dict(o) for o in obs]
    info = {"observaciones": len(obs), "preguntadas": 0, "respondidas": 0, "caidas": 0, "lotes": 0, "medios": []}
    if consejo is None or len(obs) < TRIAJE_MIN:
        info["motivo"] = "sin consejero" if consejo is None else "pocas observaciones"
        return obs, info
    lente = _lente(t.get("lente"))
    for ini in range(0, len(obs), TRIAJE_LOTE):
        if not consejo.puede("triaje"):
            break
        lote = obs[ini:ini + TRIAJE_LOTE]
        estado = {
            "area": t.get("area_nombre") or t.get("area"),
            "lente": lente["nombre"], "foco": lente["foco"],
            "observaciones": [{"i": k, "archivo": o["archivo"], "linea": o["linea"], "tipo": o["tipo"],
                               "texto": o["texto"], "impacto": o["impacto"], "esfuerzo": o["esfuerzo"]}
                              for k, o in enumerate(lote)],
        }
        preguntas = {}
        for k in range(len(lote)):
            preguntas["a%d" % k] = {"tipo": "si-no", "pregunta": (
                "Observación %d: ¿es concreta y accionable para la lente «%s» (señala un problema o una "
                "mejora real del código citado, no una generalidad)?" % (k, lente["nombre"]))}
            preguntas["v%d" % k] = {"tipo": "puntuar", "niveles": NIVELES_VALOR, "pregunta": (
                "Observación %d: valor para StarSeed OS (impacto alto con esfuerzo bajo = alto)." % k)}
        info["lotes"] += 1
        info["preguntadas"] += len(lote)
        r = consejo.triaje(estado, preguntas, dominio="suenos:%s" % t.get("area"))
        if not r:
            continue
        for k, o in enumerate(lote):
            a = r.get("a%d" % k)
            v = r.get("v%d" % k)
            if a and a.get("p") is not None:
                o["p_jev"] = round(float(a["p"]), 3)
                info["respondidas"] += 1
            if v and v.get("valor") is not None:
                o["valor_jev"] = round(max(0.0, min(1.0, float(v["valor"]) / (len(NIVELES_VALOR) - 1))), 3)
    info["medios"] = list(consejo.medios)
    ruido = sorted((o for o in obs if o.get("p_jev") is not None and o["p_jev"] < UMBRAL_RUIDO),
                   key=lambda o: o["p_jev"])
    caen = ruido[:int(len(obs) * MAX_CAIDA)]
    if caen:
        fuera = {id(o) for o in caen}
        obs = [o for o in obs if id(o) not in fuera]
        info["caidas"] = len(caen)
        log("triaje Jev: %d de %d observaciones caen por ruido (p < %.2f)" % (len(caen), info["observaciones"], UMBRAL_RUIDO))
    return obs, info


# ─────────────────────────────── la flota viva ───────────────────────────────
# El orquestador ya sabe, AHORA, quién escribe: el informe de pasarelas del renovador
# («puerta de pasarelas» del arranque), la rotación de escritores (MODELOS, filtrada por ese
# informe), los revisores y las sondas. La flota de los sueños sale de ahí, no de una lista
# fija que caduca: `flota_desde` es PURA y el orquestador la recalcula cada pocos minutos.
PROVEEDOR_LLAMADA = {"nvidia": "nim", "google": "gemini"}
EXCLUIDOS = PROVEEDORES_DE_PAGO | {"neurona", "deepseek"}
UTILIZABLES = ("escribe", "lenta")
_CAPAZ = re.compile(
    r"kimi|deepseek-v4-pro|deepseek-v4(?!-flash)|qwen3?\.?8-max|qwen-3\.8-max|glm-5\.3(?!-flash)|"
    r"gemini-3\.[5-9]-flash(?!-lite)|gemini-3\.\d-pro|gpt-oss-120b|muse-spark|nemotron-3-ultra|minimax-m3|"
    r"qwen3-coder-plus|devstral|nex-n2|inkling|north-mini|qwen3\.7-plus|gemma-4", re.I)
_RAPIDO = re.compile(
    r"flash-lite|gpt-oss-20b|nemotron-3-super|glm-5\.3-flash|minimax-m2\.7|^gpt-oss$|deepseek-v4-flash|"
    r"lightning|nano|flash-free|coding-glm|^auto$", re.I)


def par_de(modelo):
    """«nvidia/moonshotai/kimi-k3» → ("nim", "moonshotai/kimi-k3"); «google/gemini-3.6-flash» →
    ("gemini", "gemini-3.6-flash"); «nvidia/nemotron-3-super-120b-a12b» → ("nim",
    "nvidia/nemotron-3-super-120b-a12b") (en NIM los modelos de NVIDIA llevan su espacio)."""
    prov, _, resto = str(modelo or "").partition("/")
    prov = PROVEEDOR_LLAMADA.get(prov, prov)
    if prov == "nim" and resto and "/" not in resto:
        resto = "nvidia/" + resto
    return prov, resto


def flota_desde(modelos=(), revisores=(), informe=None, sondas=None, llamables=None, base=()):
    """{"mapa": [...], "sintesis": [...], "contraste": [...]} de pares (proveedor, modelo). PURA.

    · Entran: los modelos que el informe de pasarelas da por vivos (y sus `modelos_extra`),
      la rotación de escritores, los revisores, las sondas y, al final, `base`.
    · Fuera: proveedores de pago, OpenRouter que no sea `:free`, proveedores que el informe da
      por sin cupo / sin clave / caídos, y los que `llamar_llm` no sabe llamar (`llamables`).
    · mapa: todos (el reparto por turnos decide); síntesis: los capaces primero; contraste: todos.
    """
    estados = {}
    candidatos = []
    for fila in (informe or {}).get("pasarelas") or []:
        if not isinstance(fila, dict):
            continue
        prov = PROVEEDOR_LLAMADA.get(fila.get("clave"), fila.get("clave"))
        estados[prov] = fila.get("estado")
        if fila.get("estado") in UTILIZABLES and fila.get("modelo"):
            candidatos.append(par_de("%s/%s" % (fila.get("clave"), fila["modelo"])))
            for extra in fila.get("modelos_extra") or []:
                candidatos.append((prov, str(extra)))
    for m in modelos or ():
        candidatos.append(par_de(m))
    for par in revisores or ():
        candidatos.append((PROVEEDOR_LLAMADA.get(par[0], par[0]), par[1]))
    for prov, sonda in (sondas or {}).items():
        modelo = sonda[0] if isinstance(sonda, (list, tuple)) else sonda
        if modelo:
            candidatos.append((PROVEEDOR_LLAMADA.get(prov, prov), modelo))
    for par in base or ():
        candidatos.append(tuple(par))
    vistos, validos = set(), []
    for p, m in candidatos:
        if not p or not m or (p, m) in vistos:
            continue
        vistos.add((p, m))
        if p in EXCLUIDOS or not es_gratuito(p, m):
            continue
        if llamables is not None and p not in llamables:
            continue
        if estados.get(p) not in (None,) + UTILIZABLES:
            continue
        validos.append((p, m))
    capaces = [x for x in validos if _CAPAZ.search(x[1])]
    rapidos = [x for x in validos if x not in capaces and _RAPIDO.search(x[1])]
    resto = [x for x in validos if x not in capaces and x not in rapidos]
    return {"mapa": rapidos + resto + capaces, "sintesis": capaces + resto + rapidos,
            "contraste": resto + capaces + rapidos}


def flota_fija():
    """La de siempre, por si el orquestador no da la suya (pruebas, otra máquina)."""
    return {"mapa": _sin_repetir(MAP_RAPIDOS, CONTRASTE, REDUCE_CAPACES),
            "sintesis": _sin_repetir(REDUCE_CAPACES, CONTRASTE, MAP_RAPIDOS),
            "contraste": _sin_repetir(CONTRASTE, REDUCE_CAPACES, MAP_RAPIDOS)}


class Llamador(object):
    """Pide UNA respuesta útil a la flota para UNA tarea: el proveedor sano menos usado primero
    (por turnos entre todos), con cupo por minuto libre si lo hay; aparta al momento lo muerto,
    enfría lo saturado y, si no queda nadie, espera releyendo la salud cada pocos minutos.
    Lleva la cuenta de tokens (estimados) para el latido y el informe."""

    def __init__(self, t, llamar_llm, disponible=None, latir=None, log=None, dormir=time.sleep,
                 reloj=time.time, es_aviso_de_cuota=None, marcar_sin_cupo=None,
                 espera_429_s=ESPERA_429_S, espera_proveedor_s=ESPERA_PROVEEDOR_S, pausa_s=0, rotar=True,
                 flota=None, cupo_libre=None, refrescar=None, salud=None, consejo=None):
        self.t = t
        self.consejo = consejo
        self.rutas_jev = []        # [(fase, elegido, confianza)] para el informe
        self.tid = t["id"]
        self.rotar = rotar
        self._llamar = llamar_llm
        self._disponible = disponible or (lambda p: True)
        self._latir = latir or (lambda *a, **k: None)
        self._log = log or (lambda s: None)
        self._dormir = dormir
        self._reloj = reloj
        self._aviso = es_aviso_de_cuota or (lambda s: False)
        self._marcar = marcar_sin_cupo
        self._flota = flota or flota_fija
        self._cupo_libre = cupo_libre or (lambda p: True)
        self._refrescar = refrescar
        self.salud = salud if salud is not None else SALUD
        self.espera_429_s = espera_429_s
        self.espera_proveedor_s = espera_proveedor_s
        # (2026-09-29) Sin pausa global entre llamadas: el ritmo lo pone el CUPO POR MINUTO de
        # cada proveedor (llamar_llm) y el reparto por turnos. La pausa de 104 s del plan hacía
        # que cinco trabajadores fueran a paso de uno.
        self.pausa_s = 0
        self.tokens = {"entrada": 0, "salida": 0, "razonamiento": 0, "cacheLeida": 0, "llamadas": 0}
        self.subfase = ""
        self.modelo_actual = ""
        try:
            parametros = inspect.signature(llamar_llm).parameters
        except (TypeError, ValueError):
            parametros = {}
        self._con_max = "max_tokens" in parametros
        self._con_json = "json_mode" in parametros

    # latido: fase «analizando» siempre; lo que hace va en `subfase`.
    def latido(self, subfase=None, modelo=None):
        if subfase is not None:
            self.subfase = subfase
        if modelo is not None:
            self.modelo_actual = modelo
        try:
            self._latir(
                self.tid, "analizando", modelo=self.modelo_actual,
                proveedor=self.modelo_actual.split("/", 1)[0] if self.modelo_actual else "",
                intento=1, tokens=dict(self.tokens), subfase=self.subfase, tipo="analisis",
                area=self.t.get("area", ""), lente=self.t.get("lente", ""), avance=self._reloj(),
            )
        except Exception:
            pass

    def dormir(self, segundos, motivo):
        """Duerme en tramos de ≤ 50 s con latido: un sueño esperando no es un agente muerto."""
        fin = self._reloj() + max(0.0, segundos)
        while True:
            queda = fin - self._reloj()
            if queda <= 0:
                return
            self.latido(motivo)
            self._dormir(min(50.0, queda))

    def _lista(self, rol):
        try:
            d = self._flota() or {}
        except Exception:
            d = {}
        lista = list(d.get(rol) or []) if isinstance(d, dict) else []
        return lista or flota_fija()[rol]

    def _admisible(self, p, m, excluir, tokens_prompt):
        return (es_gratuito(p, m) and p not in excluir and p not in EXCLUIDOS
                and tokens_prompt <= TOPES_ENTRADA.get(p, 10 ** 9))

    def _candidatos(self, lista, excluir, tokens_prompt, ahora):
        fuera = []
        for p, m in lista:
            if not self._admisible(p, m, excluir, tokens_prompt) or not self.salud.sano(p, m, ahora):
                continue
            try:
                if not self._disponible(p):
                    continue
            except Exception:
                pass
            fuera.append((p, m))
        if not fuera:
            return fuera
        # Por turnos entre TODOS: el proveedor menos usado primero; los que tienen el cupo por
        # minuto lleno, al final (llamar_llm esperaría en su cupo en vez de probar otro).
        ordenados = self.salud.orden(fuera) if self.rotar else fuera
        con_cupo, llenos = [], []
        for par in ordenados:
            try:
                libre = self._cupo_libre(par[0])
            except Exception:
                libre = True
            (con_cupo if libre else llenos).append(par)
        return con_cupo + llenos

    def _ruta_jev(self, fase, rol, cands, tokens_prompt):
        """Si hay dónde elegir de verdad (≥ 2 proveedores sanos CON cupo entre los primeros),
        Jev elige con la ficha de la sesión. Devuelve (candidatos, (experiencia, par)|None).
        La regla (por turnos) es el orden de entrada y el respaldo."""
        if self.consejo is None or rol not in ("mapa", "sintesis", "contraste") or len(cands) < 2:
            return cands, None
        top, provs = [], set()
        for p, m in cands:
            try:
                libre = self._cupo_libre(p)
            except Exception:
                libre = True
            if not libre or p in provs:
                continue
            top.append((p, m))
            provs.add(p)
            if len(top) >= 3:
                break
        if len(top) < 2:
            return cands, None
        ids = ["%s/%s" % par for par in top]
        estado = {
            "sueño": {"area": self.t.get("area"), "lente": self.t.get("lente"), "fase": fase, "rol": rol,
                      "tokens_prompt": tokens_prompt},
            "candidatos": [dict(self.salud.ficha(p, m), id="%s/%s" % (p, m)) for p, m in top],
        }
        r = self.consejo.ruta(
            estado,
            "¿Qué modelo gratuito conviene para esta llamada (%s de un sueño profundo)? Prima el que más "
            "responde con el JSON pedido y menos falla en esta sesión." % rol,
            ids, regla=ids[0], dominio="suenos:ruta", reserva=0 if rol != "mapa" else 2)
        if not r:
            return cands, None
        elegido, confianza, exp = r
        self.rutas_jev.append((fase, elegido, round(confianza, 2)))
        if confianza < UMBRAL_RUTA or elegido == ids[0]:
            return cands, (exp, top[0]) if elegido == ids[0] else None
        par = top[ids.index(elegido)]
        self._log("%s: Jev elige %s (confianza %.2f) antes que %s" % (fase, elegido, confianza, ids[0]))
        return [par] + [c for c in cands if c != par], (exp, par)

    def _recuperables(self, lista, excluir, tokens_prompt, ahora):
        return any(self._admisible(p, m, excluir, tokens_prompt) and self.salud.volvera(p, m, ahora)
                   for p, m in lista)

    def _invocar(self, p, m, prompt, timeout, max_tokens, json_mode):
        tope = min(max_tokens, TOPES_SALIDA.get(p, max_tokens))
        kw = {"timeout": timeout}
        if self._con_max:
            kw["max_tokens"] = tope
        if self._con_json and json_mode:
            kw["json_mode"] = True
        return self._llamar(p, m, prompt, **kw)

    def llamar(self, fase, rol, prompt, validar, max_tokens=2500, timeout=180, excluir=(), inicio=0,
               espera_max=None, json_mode=True, max_malas_formas=None):
        """(dato_validado, "prov/modelo"). `rol` es «mapa», «sintesis» o «contraste», una lista
        de pares o una función que la devuelve (se relee en cada vuelta: la flota viva). Rota
        hasta que un modelo devuelva algo que `validar(texto)` acepte. Sin nadie sano, espera en
        tramos cortos releyendo la flota cada ~3 min; si ya no queda nadie que pueda volver
        (todo muerto o sin clave), SinProveedor al momento. Con `max_malas_formas`, tras ese
        número de respuestas sin el JSON pedido, SinFormato: reintento acotado, fallo honesto."""
        tokens_prompt = estimar_tokens(prompt)
        plazo = self.espera_proveedor_s if espera_max is None else min(self.espera_proveedor_s, espera_max)
        excluir = set(excluir or ())
        limite_espera = None
        ultimo_refresco = self._reloj()
        refrescado_al_vacio = False
        consultado = False
        malas_formas = 0
        apuesta = None             # (experiencia, par) de Jev, para cerrar el ciclo con lo que pase
        while True:
            ahora = self._reloj()
            if isinstance(rol, (list, tuple)):
                lista = list(rol)
            elif callable(rol):
                try:
                    lista = list(rol() or [])
                except Exception:
                    lista = []
            else:
                lista = self._lista(rol)
            cands = self._candidatos(lista, excluir, tokens_prompt, ahora)
            if not cands:
                if not self._recuperables(lista, excluir, tokens_prompt, ahora):
                    if self._refrescar and not refrescado_al_vacio:
                        refrescado_al_vacio = True
                        self._refrescar_flota("nadie vivo en la flota")
                        continue
                    raise SinProveedor("%s: todos los modelos gratuitos están muertos, sin clave o sin cuota" % fase)
                if limite_espera is None:
                    limite_espera = ahora + plazo
                    self._log("%s: ningún proveedor sano ahora; espero y releo la flota (hasta %d min)" % (fase, plazo // 60))
                if ahora >= limite_espera:
                    raise SinProveedor("%s: sin proveedores gratuitos tras %d min de espera" % (fase, plazo // 60))
                if self._refrescar and ahora - ultimo_refresco >= 180:
                    ultimo_refresco = ahora
                    self._refrescar_flota("relectura periódica mientras espero")
                proximo = self.salud.proximo(ahora)
                espera = min(60.0, max(5.0, (proximo - ahora) if proximo else 60.0))
                self.dormir(min(espera, max(1.0, limite_espera - ahora)), "esperando proveedor")
                continue
            limite_espera = None
            if not consultado:
                consultado = True
                cands, apuesta = self._ruta_jev(fase, rol, cands, tokens_prompt)
            for p, m in cands:
                if not self.salud.sano(p, m, self._reloj()):
                    continue
                self.salud.usar(p, m, self._reloj())
                self.latido("%s · %s/%s" % (fase, p, m), "%s/%s" % (p, m))
                try:
                    txt = self._invocar(p, m, prompt, timeout, max_tokens, json_mode)
                except Exception as e:  # noqa: BLE001 — cada fallo se clasifica, ninguno tumba el sueño
                    clase = clasificar_fallo(e)
                    que = self.salud.fallo(p, m, clase, self._reloj(), str(e))
                    self._log("%s/%s: %s → %s" % (p, m, _corta(str(e), 140), que))
                    apuesta = self._cerrar(apuesta, (p, m), False, clase)
                    continue
                txt = txt or ""
                self.tokens["entrada"] += tokens_prompt
                self.tokens["salida"] += estimar_tokens(txt)
                self.tokens["llamadas"] += 1
                if self._aviso(txt):
                    que = self.salud.fallo(p, m, CUOTA, self._reloj(), txt[:120])
                    if self._marcar:
                        try:
                            self._marcar(p, txt[:160])
                        except Exception:
                            pass
                    self._log("%s devolvió un aviso de cuota como respuesta → %s" % (p, que))
                    continue
                try:
                    dato = validar(txt)
                except Exception:
                    dato = None
                if dato is None:
                    que = self.salud.forma(p, m, self._reloj())
                    self._log("%s/%s respondió sin el JSON pedido (%s) → %s" % (p, m, _corta(txt, 100), que))
                    apuesta = self._cerrar(apuesta, (p, m), False, "sin el JSON pedido")
                    malas_formas += 1
                    if max_malas_formas is not None and malas_formas >= max_malas_formas:
                        raise SinFormato("%s: %d respuesta(s) sin el JSON pedido; la última de %s/%s"
                                         % (fase, malas_formas, p, m))
                    continue
                self.salud.exito(p, m)
                apuesta = self._cerrar(apuesta, (p, m), True, "respondió")
                self.latido("%s · %s/%s ✓" % (fase, p, m))
                return dato, "%s/%s" % (p, m)

    def _cerrar(self, apuesta, par, acierto, nota):
        """Cierra la experiencia de Jev cuando SU elegido responde o falla (así aprende)."""
        if apuesta and apuesta[1] == par and self.consejo is not None:
            self.consejo.confirmar(apuesta[0], acierto, "%s/%s: %s" % (par[0], par[1], nota))
            return None
        return apuesta

    def _refrescar_flota(self, motivo):
        try:
            self._refrescar()
            self._log("flota releída (%s)" % motivo)
        except Exception:
            pass


# ─────────────────────────────── análisis libres y reimaginaciones (Ola 1024I · IMG1024E) ───────────────────────────────
# Las tareas `tipo: "analisis"` con `modo: "libre"` (el agente de referencias de diseño, IMG1024D) o
# `modo: "reimaginar"` (el director de autodesarrollo, IMG1024C) no son área × lente: traen su propio
# encargo. UNA llamada de síntesis con la flota GRATUITA capaz, salida validada (contrato §1 de la Ola
# 1024I: títulos, cuerpo libre ≤ 8000, referencias solo https) y escrita de forma atómica en `t["salida"]`,
# que tiene que caer en starseed_memory_root/imaginacion/agentes/ (si no, se rechaza sin llamar a nadie).
# La fuente «agentes» del director la recoge en su próximo ciclo. Estado final: `informe`.
MODOS_LIBRES = ("libre", "reimaginar")
CARPETA_AGENTES = os.path.join("starseed_memory_root", "imaginacion", "agentes")
_NOMBRE_SALIDA = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,159}\.json$")
TIPOS_PROPUESTA = ("codigo", "diseno", "contenido", "investigacion", "otro")
IMPORTANCIAS = {"baja": "baja", "low": "baja", "media": "media", "medium": "media", "normal": "media",
                "alta": "alta", "high": "alta", "critica": "crítica", "crítica": "crítica", "critical": "crítica"}
MAX_TITULO_PROPUESTA, MAX_CUERPO_PROPUESTA, MAX_REFERENCIAS_PROPUESTA, MAX_ARCHIVOS_PROPUESTA = 200, 8000, 20, 20
MAX_PROPUESTAS_LIBRE = 5          # lo que piden el encargo y el rol investigador-diseno (0–5)
MAX_MALAS_FORMAS = 3              # respuestas sin el JSON pedido antes del fallo honesto
CONTEXTO_LIBRE_MAX = 1800
MAX_LECTURAS, MAX_LECTURA_CARACTERES = 3, 1500
MAX_PROMPT_LIBRE = TROZO_CARACTERES   # cabe en la pasarela más estrecha (Groq), como un trozo del mapa
#: Lo que la casa sabe de cada modelo EN DISEÑO: las notas 0–100 que el director de diseño
#: (scripts/puente/director-diseno.py, §5) deja al verificar cada tarea de interfaz por modelo escritor.
RUTAS_NOTAS_DISENO = (os.path.join("~", ".starseed", "diseno", "pesos-modelos.json"),
                      os.path.join("~", ".starseed", "diseno", "recomendacion-rotacion.json"))
UMBRAL_NOTA_DISENO = 75           # = diseno_reglas.UMBRAL_DEFECTO: una pantalla «aprobada»


def es_analisis_libre(t):
    return es_analisis(t) and str(t.get("modo") or "").strip().lower() in MODOS_LIBRES


def ruta_salida_segura(raiz, salida):
    """(absoluta, relativa) de `salida` si es un `.json` DIRECTO de starseed_memory_root/imaginacion/agentes/
    (sin subcarpetas, sin «..», sin rutas absolutas ni un enlace que lo saque de ahí); None si no."""
    if not isinstance(salida, str) or not salida.strip() or "\x00" in salida:
        return None
    rel = salida.strip().replace("\\", "/")
    if rel.startswith(("/", "~")) or re.match(r"^[A-Za-z]:", rel) or ".." in rel.split("/"):
        return None
    rel = os.path.normpath(rel).replace(os.sep, "/")
    if os.path.dirname(rel) != CARPETA_AGENTES.replace(os.sep, "/") or not _NOMBRE_SALIDA.match(os.path.basename(rel)):
        return None
    carpeta = os.path.realpath(os.path.join(raiz, CARPETA_AGENTES))
    if os.path.dirname(os.path.realpath(os.path.join(raiz, rel))) != carpeta:
        return None
    return os.path.join(raiz, rel), rel


def _https(url):
    return (isinstance(url, str) and url.lower().startswith("https://") and len(url) <= 2000
            and not any(c.isspace() for c in url))


def referencias_https(v, n=MAX_REFERENCIAS_PROPUESTA):
    """[{titulo, url}] solo `https://`, sin repetir y ≤ n (http, javascript:, rutas… se descartan)."""
    fuera, vistas = [], set()
    for r in v if isinstance(v, list) else []:
        if isinstance(r, str):
            url, titulo = r.strip(), ""
        elif isinstance(r, dict):
            url = str(r.get("url") or "").strip()
            titulo = r.get("titulo") or r.get("title") or r.get("nombre") or ""
        else:
            continue
        if not _https(url) or url in vistas:
            continue
        vistas.add(url)
        fuera.append({"titulo": _corta(sanear(str(titulo)), MAX_TITULO_PROPUESTA) or url[8:][:MAX_TITULO_PROPUESTA],
                      "url": url})
        if len(fuera) >= n:
            break
    return fuera


def _ruta_repo(a):
    a = a.strip().replace("\\", "/") if isinstance(a, str) else ""
    if (not a or len(a) > 200 or a.startswith(("/", "~")) or re.match(r"^[a-zA-Z]:", a)
            or ".." in a.split("/") or "://" in a or "\x00" in a):
        return ""
    return a[2:] if a.startswith("./") else a


def _texto_libre(v):
    """El cuerpo tal cual (Markdown libre); si el modelo lo estructuró, se aplana sin perder nada."""
    if isinstance(v, str):
        return v
    if isinstance(v, list) and all(isinstance(x, str) for x in v):
        return "\n".join(v)
    if v in (None, ""):
        return ""
    return json.dumps(v, ensure_ascii=False, indent=1)


def _valores_raiz(texto):
    """Los valores JSON de nivel superior ({…} o […]) que se dejan leer, en orden: sin bajar dentro de
    uno ya leído (una lista de referencias DENTRO de una propuesta no es la lista de propuestas)."""
    fuera, i, n = [], 0, len(texto)
    while i < n and len(fuera) < 50:
        if texto[i] in "{[":
            j = _cierre(texto, i)
            if j > i:
                v = _cargar_json(texto[i:j + 1])
                if isinstance(v, (dict, list)):
                    fuera.append(v)
                    i = j + 1
                    continue
        i += 1
    return fuera


def _con_titulo(x):
    return isinstance(x, dict) and bool(str(x.get("titulo") or x.get("title") or "").strip())


def _parece_propuesta(x):
    """Con título y que no sea una referencia suelta ({titulo, url} sin cuerpo ni tipo)."""
    return _con_titulo(x) and not ("url" in x and not any(k in x for k in ("cuerpo", "body", "contenido", "tipo")))


_MARCA_PROPUESTAS = re.compile(r'"propuestas"\s*:\s*\[')


def leer_propuestas(texto):
    """La lista de propuestas de una respuesta, venga como venga: `{"propuestas": [...]}` (la forma del
    encargo libre), una lista suelta `[...]` (la de reimaginar), una propuesta sola `{titulo…}` o envuelta
    en otra clave, con prosa, vallas o razonamiento alrededor, o cortada por max_tokens (se rescatan las
    completas; nunca la lista de referencias de una propuesta a medias). None si no hay nada con esa
    forma; [] es una respuesta válida («nada que proponer»)."""
    if not texto:
        return None
    t = _PENSAMIENTO.sub(" ", str(texto))[:_TOPE_TEXTO_JSON]
    valores = _valores_raiz(t)
    con = [(i, v) for i, v in enumerate(valores) if isinstance(v, dict) and isinstance(v.get("propuestas"), list)]
    if con:
        return max(con, key=lambda x: (len(x[1]["propuestas"]), x[0]))[1]["propuestas"]
    if _MARCA_PROPUESTAS.search(t):
        return rescatar_lista(t, "propuestas")  # la forma pedida, cortada: solo sus elementos completos
    listas = [v for v in valores if isinstance(v, list) and v and all(isinstance(x, dict) for x in v)
              and any(_parece_propuesta(x) for x in v)]
    if listas:
        return listas[-1]
    solas = [v for v in valores if _parece_propuesta(v)]
    if solas:
        return solas
    for v in reversed(valores):
        if isinstance(v, dict):
            for x in v.values():
                if isinstance(x, list) and x and all(isinstance(y, dict) for y in x) and any(_parece_propuesta(y) for y in x):
                    return x
                if _parece_propuesta(x):
                    return [x]
    return None


def _sufijo_salida(rel, agente):
    """«referencias-diseno-2026-10-24-1.json» del agente «referencias-diseno» → «2026-10-24-1»: así el id
    es el mismo que le pondría su agente al normalizar (agente_referencias_diseno.normalizar_salida)."""
    stem = os.path.basename(rel)[:-5]
    return stem[len(agente) + 1:] if agente and stem.startswith(agente + "-") and len(stem) > len(agente) + 1 else stem


def normalizar_propuesta_libre(item, t, i, rel, ahora_iso):
    """UNA propuesta de la flota en la forma del contrato §1, o None si no trae título. PURA."""
    if not _con_titulo(item):
        return None
    modo = str(t.get("modo") or "").strip().lower()
    original = t.get("propuesta") if isinstance(t.get("propuesta"), dict) else {}
    titulo = _corta(sanear(str(item.get("titulo") or item.get("title"))), MAX_TITULO_PROPUESTA)
    cuerpo = sanear(_texto_libre(item.get("cuerpo") or item.get("body") or item.get("contenido"))).strip()
    tipo_defecto = (original.get("tipo") if modo == "reimaginar" else None) or (
        "diseno" if str(t.get("rol") or "") == "diseno" else "codigo")
    tipo = str(item.get("tipo") or "").strip().lower().replace("ñ", "n")
    p = {"titulo": titulo, "cuerpo": cuerpo[:MAX_CUERPO_PROPUESTA] or titulo,
         "tipo": tipo if tipo in TIPOS_PROPUESTA else (tipo_defecto if tipo_defecto in TIPOS_PROPUESTA else "codigo"),
         "referencias": referencias_https(item.get("referencias")), "fuente": "agentes", "estado": "nueva", "t": ahora_iso}
    archivos = item.get("archivos")
    archivos = [archivos] if isinstance(archivos, str) else (archivos if isinstance(archivos, list) else [])
    p["archivos"] = []
    for a in map(_ruta_repo, archivos):
        if a and a not in p["archivos"] and len(p["archivos"]) < MAX_ARCHIVOS_PROPUESTA:
            p["archivos"].append(a)
    imp = IMPORTANCIAS.get(str(item.get("importancia") or "").strip().lower())
    if imp:
        p["importancia"] = imp
    u = item.get("utilidad")
    if isinstance(u, (int, float)) and not isinstance(u, bool):
        p["utilidad"] = round(max(0.0, min(1.0, float(u))), 3)
    for k in ("impacto", "esfuerzo"):
        v = item.get(k)
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            p[k] = max(1, min(5, int(round(v))))
    if isinstance(item.get("accion"), str) and item["accion"].strip():
        p["accion"] = item["accion"].strip()[:40]
    if modo == "reimaginar":
        # La versión la fija quien la encargó, no el modelo (enlazar() la vuelve a comprobar al recogerla).
        if t.get("version_de"):
            p["version_de"] = str(t["version_de"])[:120]
        if isinstance(t.get("version"), int) and t["version"] >= 1:
            p["version"] = t["version"]
    else:
        agente = _nombre_seguro(t.get("agente") or "analista")
        p.update(id="agentes:%s:%s-%d" % (agente, _sufijo_salida(rel, agente), i), version=1)
        if t.get("agente"):
            p["agente"] = agente
        if t.get("ambito"):
            p["ambito"] = str(t["ambito"])[:80]
        p["origen"] = {k: v for k, v in (("tarea_analisis", t.get("id")), ("contexto", t.get("contexto"))) if v}
    return p


def validar_salida_libre(texto, t, rel, ahora_iso):
    """Lista de propuestas normalizadas, o None si la respuesta no sirve (y se reintenta):
    sin la forma pedida, propuestas sin título, o una reimaginación sin ninguna propuesta."""
    crudas = leer_propuestas(texto)
    if crudas is None or not isinstance(crudas, list):
        return None
    fuera = []
    for item in crudas:
        p = normalizar_propuesta_libre(item, t, len(fuera) + 1, rel, ahora_iso)
        if p is not None:
            fuera.append(p)
    if crudas and not fuera:
        return None
    if str(t.get("modo") or "").strip().lower() == "reimaginar":
        return fuera[:1] or None
    return fuera[:MAX_PROPUESTAS_LIBRE]


def _nucleo_modelo(clave):
    """«nvidia/moonshotai/kimi-k3» y ("nim", "moonshotai/kimi-k3") → «kimi-k3»: el mismo modelo diseña
    igual en cualquier proveedor."""
    return str(clave or "").strip().lower().rsplit("/", 1)[-1].replace(":free", "")


def notas_diseno_por_modelo(crudo):
    """{núcleo del modelo: nota media 0–100} de `pesos-modelos.json` ({modelo: {suma, n}}) o de
    `recomendacion-rotacion.json` ({medias: {modelo: media}}) del director de diseño. PURA."""
    sumas = {}
    if isinstance(crudo, dict) and isinstance(crudo.get("medias"), dict):
        pares = [(k, v, 1) for k, v in crudo["medias"].items()]
    elif isinstance(crudo, dict):
        pares = [(k, (v.get("suma") or 0) / float(v["n"]), v["n"]) for k, v in crudo.items()
                 if isinstance(v, dict) and isinstance(v.get("n"), (int, float)) and v["n"] > 0
                 and isinstance(v.get("suma") or 0, (int, float))]
    else:
        pares = []
    for k, media, n in pares:
        nucleo = _nucleo_modelo(k)
        if not nucleo or nucleo in ("?", "desconocido") or not isinstance(media, (int, float)) or isinstance(media, bool):
            continue
        s = sumas.setdefault(nucleo, [0.0, 0.0])
        s[0] += float(media) * n
        s[1] += n
    return {k: round(s[0] / s[1], 1) for k, s in sumas.items() if s[1] > 0}


def cargar_notas_diseno(rutas=RUTAS_NOTAS_DISENO):
    """Las notas de diseño de esta máquina ({} si el director de diseño aún no verificó nada)."""
    for ruta in rutas:
        try:
            with open(os.path.expanduser(ruta), encoding="utf-8") as f:
                notas = notas_diseno_por_modelo(json.load(f))
        except (OSError, ValueError):
            continue
        if notas:
            return notas
    return {}


def orden_diseno(pares, notas, umbral=UMBRAL_NOTA_DISENO):
    """(pares, motivo). Primero los modelos con nota de diseño ≥ umbral (la mejor delante), luego los que
    aún no tienen nota en su orden de siempre y al final los que diseñaron por debajo del umbral. Sin
    ninguna nota que case, el orden capaz de siempre. PURA."""
    notas = notas or {}
    con = [(par, notas.get(_nucleo_modelo(par[1]))) for par in pares]
    buenos = sorted([x for x in con if x[1] is not None and x[1] >= umbral], key=lambda x: -x[1])
    flojos = sorted([x for x in con if x[1] is not None and x[1] < umbral], key=lambda x: -x[1])
    if not buenos and not flojos:
        return list(pares), "sin notas de diseño de estos modelos: orden capaz de siempre"
    orden = [x[0] for x in buenos] + [x[0] for x in con if x[1] is None] + [x[0] for x in flojos]
    vistos = ", ".join("%s %g/100" % (_nucleo_modelo(p[1]), n) for p, n in (buenos + flojos)[:4])
    return orden, "diseño: primero lo que mejor puntúa el director de diseño (%s)" % vistos


def flota_libre(t, flota=None, notas=None):
    """(pares, motivo, por_notas): la lista de síntesis de la flota viva (o la fija); con `capacidad:
    "alta"`, SOLO los capaces; con `rol: "diseno"`, ordenados por lo que la casa sabe de cada modelo en
    diseño (`por_notas` dice si alguna nota casó: entonces ese orden manda sobre el reparto por turnos). PURA."""
    try:
        d = flota() if callable(flota) else (flota or {})
    except Exception:
        d = {}
    base = [tuple(x) for x in ((d.get("sintesis") if isinstance(d, dict) else None) or flota_fija()["sintesis"])]
    motivo, por_notas = "síntesis de la flota", False
    if str(t.get("capacidad") or "").strip().lower() == "alta":
        capaces = [x for x in base if _CAPAZ.search(x[1])] or [x for x in flota_fija()["sintesis"] if _CAPAZ.search(x[1])]
        base, motivo = capaces, "capacidad alta: solo los modelos capaces"
    if str(t.get("rol") or "").strip().lower() == "diseno":
        por_notas = any((notas or {}).get(_nucleo_modelo(par[1])) is not None for par in base)
        base, m = orden_diseno(base, notas)
        motivo += " · " + m
    return base, motivo, por_notas


def prompt_reimaginar(t):
    """El encargo de reimaginar cuando la tarea no lo trae hecho: la propuesta, las notas y las referencias."""
    p = t.get("propuesta") if isinstance(t.get("propuesta"), dict) else {}
    refs = referencias_https(t.get("referencias")) or referencias_https(p.get("referencias"))
    lineas = [
        "IMAGINACIÓN · reimaginar, NO escritura: no edites archivos del repositorio ni hagas commits.", "",
        "Reimagina esta propuesta con las notas y referencias de abajo y devuelve UNA versión nueva, mejor, "
        "en formato libre (Markdown).", "",
        "Propuesta v%s (tipo %s, ámbito %s): «%s»" % (p.get("version") or 1, p.get("tipo") or "codigo",
                                                      p.get("ambito") or "metagenesis", _corta(p.get("titulo"), 200)),
        str(p.get("cuerpo") or "")[:4000], "", "Notas para mejorarla:", str(t.get("notas") or "(sin notas)")[:2000]]
    if refs:
        lineas += ["", "Referencias:"] + ["- %s — %s" % (r["titulo"], r["url"]) for r in refs]
    if p.get("archivos"):
        lineas += ["", "Archivos citados: " + ", ".join(str(a) for a in p["archivos"][:20])]
    return "\n".join(lineas)


def _lecturas(t, leer):
    """Extractos de `t["lecturas"]` (≤ 3 documentos del repo, ≤ 1500 caracteres cada uno, saneados): el
    encargo pide leerlos y en una sola llamada el modelo no puede abrir nada."""
    fuera = []
    for ruta in (t.get("lecturas") or [])[:MAX_LECTURAS]:
        r = _ruta_repo(ruta)
        if not r or os.path.basename(r).startswith(".env"):
            continue
        try:
            texto = leer(r)
        except Exception:
            texto = None
        if texto:
            fuera.append("### %s\n%s" % (r, sanear(texto)[:MAX_LECTURA_CARACTERES].rstrip()))
    return fuera


def prompt_libre(t, contexto_texto="", lecturas=()):
    """El prompt de la síntesis: contexto común del rol + el encargo (+ extractos de sus lecturas) + cómo
    devolverlo. Cabe en MAX_PROMPT_LIBRE: se recortan antes las lecturas que el encargo. PURA."""
    reimaginar = str(t.get("modo") or "").strip().lower() == "reimaginar"
    encargo = str(t.get("prompt") or "").strip() or (prompt_reimaginar(t) if reimaginar else "")
    cierre = ("FORMATO DE LA RESPUESTA: SOLO JSON, sin texto alrededor. Si tu salida debe ser un objeto, envuelve "
              'la lista así: {"propuestas": [ … ]}. Cada propuesta lleva al menos "titulo" (≤ 200) y "cuerpo" '
              "(Markdown libre ≤ 8000); referencias solo https.")
    if reimaginar:
        cierre += " Reimaginar = UNA sola propuesta (la versión nueva de «%s»)." % (t.get("version_de") or "la propuesta")
    partes = [contexto_texto.strip()] if contexto_texto and contexto_texto.strip() else []
    partes.append(encargo)
    bloque = ("## Lecturas (extractos de los documentos que pide el encargo)\n" + "\n\n".join(lecturas)) if lecturas else ""
    texto = "\n\n".join(partes + ([bloque] if bloque else []) + [cierre])
    if len(texto) > MAX_PROMPT_LIBRE and bloque:
        sobra = len(texto) - MAX_PROMPT_LIBRE
        bloque = bloque[:max(0, len(bloque) - sobra - 2)].rstrip()
        texto = "\n\n".join(partes + ([bloque] if len(bloque) > 200 else []) + [cierre])
    if len(texto) > MAX_PROMPT_LIBRE:
        texto = "\n\n".join(partes)[:MAX_PROMPT_LIBRE - len(cierre) - 2] + "\n\n" + cierre
    return sanear(texto)


def _salida_previa(ruta, t):
    """Lo que ya hay en la salida: ("nada", None) · ("propia", doc) si ya es el trabajo hecho de ESTA
    tarea · ("ajena", None) si es de otra (no se pisa)."""
    try:
        with open(ruta, encoding="utf-8") as f:
            d = json.load(f)
    except OSError:
        return "nada", None
    except ValueError:
        return "nada", None  # a medio escribir o roto: se rehace
    if str(t.get("modo") or "").strip().lower() == "reimaginar":
        return ("propia", d) if isinstance(d, list) and any(_con_titulo(x) for x in d) else ("nada", None)
    if not isinstance(d, dict) or not isinstance(d.get("propuestas"), list):
        return "nada", None
    return ("propia", d) if d.get("tarea") in (None, t.get("id")) else ("ajena", None)


def _iso(reloj):
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(reloj()))


def _leer_del_repo(raiz, ruta):
    with open(os.path.join(raiz, ruta), encoding="utf-8", errors="replace") as f:
        return f.read()


def _analisis_libre(t, llamar_llm, evento=None, set_estado=None, latir=None, disponible=None, raiz=".",
                    dir_profundo=None, log=None, paso_local=None, dormir=time.sleep, reloj=time.time,
                    es_aviso_de_cuota=None, marcar_sin_cupo=None, espera_429_s=ESPERA_429_S,
                    espera_proveedor_s=ESPERA_PROVEEDOR_S, leer=None, rotar=True, flota=None, cupo_libre=None,
                    refrescar=None, salud=None, contexto=None, notas_diseno=None, max_malas_formas=MAX_MALAS_FORMAS):
    """UN análisis libre (`modo: "libre"`) o UNA reimaginación (`modo: "reimaginar"`). Devuelve lo escrito
    en `t["salida"]` o None. Estados: en_curso → informe | fallo (nunca «hecho» sin salida)."""
    evento = evento or (lambda *a, **k: None)
    set_estado = set_estado or (lambda *a, **k: None)
    log = log or (lambda s: None)
    paso_local = paso_local or (lambda *a, **k: None)
    tid, modo = t["id"], str(t.get("modo") or "").strip().lower()
    privado = bool(t.get("privado"))
    destino = ruta_salida_segura(raiz, t.get("salida"))
    if destino is None:
        nota = "ruta de salida no permitida: tiene que ser un .json de %s/ (sin subcarpetas)" % CARPETA_AGENTES.replace(os.sep, "/")
        set_estado(tid, estado="fallo", nota=nota, tipo="analisis")
        evento("fallo", tid, "análisis %s mal formado: %s" % (modo, nota))
        return None
    ruta, rel = destino
    if not str(t.get("prompt") or "").strip() and not (modo == "reimaginar" and isinstance(t.get("propuesta"), dict)):
        set_estado(tid, estado="fallo", nota="análisis %s sin encargo (falta «prompt»)" % modo, tipo="analisis")
        evento("fallo", tid, "análisis %s mal formado: sin encargo" % modo)
        return None
    previa, doc = ("nada", None) if t.get("rehacer") else _salida_previa(ruta, t)
    if previa == "propia":
        n = len(doc if isinstance(doc, list) else doc.get("propuestas") or [])
        set_estado(tid, estado="informe", nota="%d propuesta(s) · %s (ya estaba)" % (n, rel), tipo="analisis",
                   propuestas=n, hallazgos=n, informe=rel)
        log("la salida ya existía: %s" % rel)
        return doc
    if previa == "ajena":
        set_estado(tid, estado="fallo", nota="la salida %s ya es de otra tarea: no la piso" % rel, tipo="analisis")
        evento("fallo", tid, "análisis %s: la salida ya es de otra tarea" % modo)
        return None
    dir_profundo = dir_profundo or os.path.join(raiz, "starseed_memory_root", "dream", "profundo")
    reclamo = os.path.join(rutas_informe(dir_profundo, t)[0], ".reclamos", _nombre_seguro(tid) + ".json")
    if not _tomar(reclamo, reloj, RECLAMO_CADUCA_S):
        log("otro orquestador está con %s ahora mismo: no lo repito" % tid)
        return None
    t0 = reloj()
    leer = leer or (lambda r: _leer_del_repo(raiz, r))
    rol = str(t.get("rol") or "").strip().lower()
    diseno, alcance = rol == "diseno", rol == "alcance"
    # (INV1025N) El alcance redacta borradores con la flota CAPAZ y sin las notas de diseño: no
    # diseña pantallas. Su encargo ya lo pide así; forzarlo aquí lo cubre aunque llegue sin él.
    t_flota = dict(t, capacidad="alta") if alcance else t
    notas = (cargar_notas_diseno() if notas_diseno is None else notas_diseno) if diseno else {}
    pares, motivo, por_notas = flota_libre(t_flota, flota, notas)
    # Con un orden de diseño sacado de las notas, se respeta (la salud sigue apartando lo caído o
    # saturado y el cupo lleno va al final); sin él, el reparto por turnos de siempre.
    llamador = Llamador(t, llamar_llm, disponible, latir, log, dormir, reloj, es_aviso_de_cuota,
                        marcar_sin_cupo, espera_429_s, espera_proveedor_s, 0, rotar and not por_notas,
                        flota=flota, cupo_libre=cupo_libre, refrescar=refrescar, salud=salud)
    try:
        set_estado(tid, estado="en_curso", modelo="", segundos=0, tipo="analisis",
                   nota="análisis %s · %s" % (modo, _corta(t.get("titulo") or tid, 120)))
        evento("inicio", tid, t.get("titulo") or tid, {"tipo": "analisis", "modo": modo, "agente": t.get("agente") or ""})
        rol_ctx = "investigador-diseno" if diseno else ("investigador-alcance" if alcance else "analista")
        ctx = ""
        if contexto is not None and ("Contexto común · rol %s" % rol_ctx) not in str(t.get("prompt") or ""):
            pedir = dict(rol=rol_ctx, area=t.get("area") or None, tarea=t.get("titulo") or "",
                         max_chars=CONTEXTO_LIBRE_MAX)
            excl = ("herramientas", "salida") if modo == "reimaginar" else ("herramientas",)
            try:
                ctx = contexto(excluir=excl, **pedir) or ""
            except TypeError:
                try:
                    ctx = contexto(**pedir) or ""
                except Exception:
                    ctx = ""
            except Exception:
                ctx = ""
        prompt = prompt_libre(t, sanear(ctx)[:CONTEXTO_LIBRE_MAX], _lecturas(t, leer))
        paso_local(tid, "encargo", modo=modo, caracteres=len(prompt), contexto=bool(ctx), modelos=len(pares))
        log("análisis %s: %d caracteres de encargo · %s · %s" % (
            modo, len(prompt), motivo, ", ".join("%s/%s" % par for par in pares[:4]) or "flota vacía"))
        ahora_iso = _iso(reloj)
        propuestas, modelo = llamador.llamar(
            "síntesis libre", lambda: flota_libre(t_flota, flota, notas)[0], prompt,  # se relee: la flota viva
            lambda txt: validar_salida_libre(txt, t, rel, ahora_iso),
            max_tokens=8000, timeout=300, max_malas_formas=max_malas_formas)
        if modo == "reimaginar":
            doc = propuestas[:1]
        else:
            nombre_fmt, _, ver = str(t.get("formato_salida") or "starseed-imaginacion-agentes/1").partition("/")
            doc = {"formato": nombre_fmt or "starseed-imaginacion-agentes", "version": int(ver) if ver.isdigit() else 1,
                   "fuente": "agentes", "agente": _nombre_seguro(t.get("agente") or "analista"), "tarea": tid,
                   "contexto": t.get("contexto") or "", "modo": modo, "generado": ahora_iso, "modelo": modelo,
                   "propuestas": propuestas}
        _escribir_atomico(ruta, json.dumps(doc, ensure_ascii=False, indent=1) + "\n")
        segundos, n = int(reloj() - t0), len(propuestas)
        paso_local(tid, "salida", modelo=modelo, propuestas=n, salida=rel)
        set_estado(tid, estado="informe", modelo=modelo, segundos=segundos, tipo="analisis", propuestas=n,
                   hallazgos=n, informe=rel, nota="%d propuesta(s) · %s" % (n, rel))
        texto = ("%d propuesta(s) · %s" % (n, t.get("agente") or modo)) + (
            "" if privado or not n else " · 1.ª: " + _corta(propuestas[0]["titulo"], 90))
        evento("informe", tid, texto, {"tipo": "analisis", "modo": modo, "propuestas": n, "modelo": modelo,
                                        "tokens": llamador.tokens["entrada"] + llamador.tokens["salida"],
                                        "privado": privado})
        log("salida escrita: %s (%d propuesta(s), %s)" % (rel, n, modelo))
        return doc
    except SinFormato as e:
        set_estado(tid, estado="fallo", nota=_corta("la flota no devolvió el JSON pedido: %s" % e, 200),
                   tipo="analisis", segundos=int(reloj() - t0))
        evento("fallo", tid, "análisis %s sin el JSON pedido tras %d intento(s)" % (modo, max_malas_formas))
        log("fallo: %s" % e)
        return None
    except SinProveedor as e:
        set_estado(tid, estado="fallo", nota=_corta(str(e), 200), tipo="analisis", segundos=int(reloj() - t0))
        evento("fallo", tid, "análisis %s sin proveedores: %s" % (modo, _corta(str(e), 200)))
        log("fallo: %s" % e)
        return None
    except Exception as e:  # noqa: BLE001 — se da por fallido, nunca por hecho
        set_estado(tid, estado="fallo", nota=_corta("%s: %s" % (type(e).__name__, e), 200), tipo="analisis",
                   segundos=int(reloj() - t0))
        evento("fallo", tid, "análisis %s fallido: %s" % (modo, _corta(str(e), 200)))
        log("fallo: %s: %s" % (type(e).__name__, e))
        return None
    finally:
        _soltar(reclamo)


# ─────────────────────────────── el sueño ───────────────────────────────

def _nombre_seguro(s):
    return re.sub(r"[^a-z0-9-]+", "-", str(s or "").lower()).strip("-") or "x"


def rutas_informe(dir_profundo, t):
    sesion = _nombre_seguro(t.get("sesion") or time.strftime("%Y-%m-%d"))
    dir_sesion = os.path.join(dir_profundo, sesion)
    base = "%s--%s" % (_nombre_seguro(t.get("area")), _nombre_seguro(t.get("lente")))
    return dir_sesion, os.path.join(dir_sesion, base + ".json"), os.path.join(dir_sesion, base + ".md")


def _leer_cache(dir_mapa, h):
    try:
        with open(os.path.join(dir_mapa, h + ".json"), encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, dict) and isinstance(d.get("obs"), list) else None
    except (OSError, ValueError):
        return None


def mapear(t, trozos, dir_mapa, llamador, reloj=time.time, dormir=None):
    """Lectura compartida: devuelve (observaciones_de_todas_las_lentes, propios, fallidos,
    modelos). Un trozo en caché se reutiliza; uno con cerrojo ajeno se deja para luego; si
    nadie avanza, se espera 10 s."""
    obs, propios, fallidos, modelos = [], 0, 0, []
    pendientes = list(range(len(trozos)))
    dormir = dormir or llamador.dormir
    inicio = int(hashlib.sha1(t["id"].encode()).hexdigest(), 16) % 97
    while pendientes:
        avanzo = False
        for idx in list(pendientes):
            tr = trozos[idx]
            cache = _leer_cache(dir_mapa, tr["hash"])
            if cache is not None:
                obs.extend(cache["obs"])
                pendientes.remove(idx)
                avanzo = True
                continue
            cerrojo = os.path.join(dir_mapa, tr["hash"] + ".lock")
            if not _tomar(cerrojo, reloj, CERROJO_CADUCA_S):
                continue
            try:
                cache = _leer_cache(dir_mapa, tr["hash"])  # pudo llegar mientras tanto
                if cache is None:
                    rutas = [p["archivo"] for p in tr["partes"]]
                    dato, modelo = llamador.llamar(
                        "lectura %d/%d" % (idx + 1, len(trozos)), "mapa",
                        prompt_map(t, tr, idx + 1, len(trozos)),
                        lambda txt, rutas=rutas: normalizar_observaciones(extraer_json(txt, "observaciones"), rutas),
                        max_tokens=4000, timeout=150, inicio=inicio + idx,
                    )
                    cache = {"v": VERSION_MAPA, "obs": dato, "modelo": modelo, "t": reloj(), "partes": tr["partes"]}
                    _escribir_atomico(os.path.join(dir_mapa, tr["hash"] + ".json"), json.dumps(cache, ensure_ascii=False))
                    propios += 1
                    if modelo not in modelos:
                        modelos.append(modelo)
                obs.extend(cache["obs"])
            except SinProveedor:
                raise
            except Exception:  # noqa: BLE001 — un trozo ilegible no tumba el sueño
                fallidos += 1
            finally:
                _soltar(cerrojo)
            pendientes.remove(idx)
            avanzo = True
        if pendientes and not avanzo:
            llamador.latido("esperando la lectura compartida de otros sueños")
            dormir(10, "esperando la lectura compartida de otros sueños")
    return obs, propios, fallidos, modelos


def ejecutar(t, llamar_llm, evento=None, set_estado=None, latir=None, disponible=None,
             raiz=".", dir_profundo=None, log=None, paso_local=None, dormir=time.sleep,
             reloj=time.time, es_aviso_de_cuota=None, marcar_sin_cupo=None,
             espera_429_s=ESPERA_429_S, espera_proveedor_s=ESPERA_PROVEEDOR_S, leer=None, rotar=True,
             flota=None, cupo_libre=None, refrescar=None, salud=None, consejo=None, contexto=None,
             notas_diseno=None):
    """Ejecuta UN sueño (tarea `tipo: "analisis"`). Devuelve el informe (dict) o None.

    Estados en progreso.json (vía `set_estado`): en_curso → informe | fallo. Eventos al bus
    (vía `evento`), pocos y gruesos: `inicio` y `informe`/`fallo`, uno por tarea. El detalle
    va a los latidos locales y al registro de la tarea (`log`).

    `consejo` (ConsejoJev) activa el triaje y la elección de modelo por Jev; `contexto(rol=,
    area=, tarea=, max_chars=)` devuelve el contexto común del analista para la síntesis. Los
    dos son opcionales y nunca bloquean.

    Con `modo: "libre"` o `modo: "reimaginar"` (Ola 1024I) no es área × lente: lo hace
    `_analisis_libre` (una síntesis, salida en `t["salida"]`); `notas_diseno` solo cuenta ahí."""
    if es_analisis_libre(t):
        return _analisis_libre(
            t, llamar_llm, evento=evento, set_estado=set_estado, latir=latir, disponible=disponible, raiz=raiz,
            dir_profundo=dir_profundo, log=log, paso_local=paso_local, dormir=dormir, reloj=reloj,
            es_aviso_de_cuota=es_aviso_de_cuota, marcar_sin_cupo=marcar_sin_cupo, espera_429_s=espera_429_s,
            espera_proveedor_s=espera_proveedor_s, leer=leer, rotar=rotar, flota=flota, cupo_libre=cupo_libre,
            refrescar=refrescar, salud=salud, contexto=contexto, notas_diseno=notas_diseno)
    evento = evento or (lambda *a, **k: None)
    set_estado = set_estado or (lambda *a, **k: None)
    log = log or (lambda s: None)
    paso_local = paso_local or (lambda *a, **k: None)
    tid = t["id"]
    lente = str(t.get("lente") or "")
    privado = bool(t.get("privado")) or lente in LENTES_PRIVADAS
    dir_profundo = dir_profundo or os.path.join(raiz, "starseed_memory_root", "dream", "profundo")
    dir_sesion, ruta_json, ruta_md = rutas_informe(dir_profundo, t)
    rel_md = os.path.relpath(ruta_md, raiz) if raiz else ruta_md

    if lente not in IDS_LENTES or not t.get("area"):
        set_estado(tid, estado="fallo", nota="tarea de análisis sin área o con lente desconocida (%s)" % lente, tipo="analisis")
        evento("fallo", tid, "sueño mal formado: área «%s», lente «%s»" % (t.get("area"), lente))
        return None
    previo = None if t.get("rehacer") else informe_valido(ruta_json, tid)
    if previo is not None:
        set_estado(tid, estado="informe", nota="%d hallazgos · %s (ya estaba)" % (len(previo["hallazgos"]), rel_md),
                   tipo="analisis", hallazgos=len(previo["hallazgos"]), informe=rel_md,
                   modelo=(previo.get("modelos") or {}).get("sintesis") or "")
        log("el informe ya existía: %s" % rel_md)
        return previo

    reclamo = os.path.join(dir_sesion, ".reclamos", _nombre_seguro(tid) + ".json")
    if not _tomar(reclamo, reloj, RECLAMO_CADUCA_S):
        log("otro orquestador está soñando %s ahora mismo: no lo repito" % tid)
        return None
    t0 = reloj()
    leer = leer or (lambda ruta: open(os.path.join(raiz, ruta), encoding="utf-8", errors="replace").read())
    llamador = Llamador(t, llamar_llm, disponible, latir, log, dormir, reloj, es_aviso_de_cuota,
                        marcar_sin_cupo, espera_429_s, espera_proveedor_s, 0, rotar,
                        flota=flota, cupo_libre=cupo_libre, refrescar=refrescar, salud=salud,
                        consejo=consejo)
    try:
        set_estado(tid, estado="en_curso", modelo="", segundos=0, tipo="analisis",
                   nota="analizando · %s × %s" % (t.get("area"), lente))
        evento("inicio", tid, t.get("titulo") or tid, {"tipo": "analisis", "area": t.get("area"), "lente": lente})
        llamador.latido("leyendo archivos")
        lineas = leer_archivos(t.get("archivos") or [], leer)
        trozos = trozos_de(lineas, [a for a in (t.get("archivos") or []) if a in lineas])
        paso_local(tid, "lectura", archivos=len(lineas), trozos=len(trozos))
        log("lectura: %d archivos legibles en %d trozos" % (len(lineas), len(trozos)))
        if not trozos:
            raise ValueError("ningún archivo legible del área")

        obs, propios, fallidos, modelos_mapa = mapear(t, trozos, os.path.join(dir_sesion, ".mapa"), llamador, reloj)
        if fallidos * 2 > len(trozos):
            raise ValueError("solo se pudieron leer %d de %d trozos" % (len(trozos) - fallidos, len(trozos)))
        mias = [o for o in obs if o.get("lente") == lente and o.get("archivo") in lineas]
        paso_local(tid, "mapa", trozos=len(trozos), propios=propios, fallidos=fallidos, observaciones=len(mias))
        log("mapa: %d observaciones de esta lente (%d trozos leídos aquí, %d fallidos)" % (len(mias), propios, fallidos))

        triaje = {}
        if mias:
            llamador.latido("triaje de Jev")
            mias, triaje = triar(t, mias, consejo, log)
            if triaje.get("lotes"):
                paso_local(tid, "triaje", preguntadas=triaje["preguntadas"], respondidas=triaje["respondidas"],
                           caidas=triaje["caidas"], quedan=len(mias))
        ctx = ""
        if contexto is not None and mias:
            try:
                ctx = contexto(rol="analista", area=t.get("area"), tarea=t.get("titulo") or "",
                               max_chars=CONTEXTO_ANALISTA_MAX) or ""
            except Exception:
                ctx = ""

        hallazgos, resumen, sintesis = [], "", ""
        if mias:
            # Los capaces primero; si ninguno está, cualquiera de la flota antes que esperar.
            (resumen, hallazgos), sintesis = llamador.llamar(
                "síntesis", "sintesis", prompt_reduce(t, mias, len(lineas), sanear(ctx)[:CONTEXTO_ANALISTA_MAX]),
                lambda txt: leer_sintesis(txt, lineas), max_tokens=5000, timeout=300,
            )
        else:
            resumen = "Los lectores no vieron nada relevante para esta lente en los archivos leídos."
        paso_local(tid, "sintesis", modelo=sintesis or "-", hallazgos=len(hallazgos))

        descartados, contraste = [], ""
        if hallazgos:
            prov_sintesis = sintesis.split("/", 1)[0] if sintesis else ""
            try:
                dato, contraste = llamador.llamar(
                    "contraste", "contraste",
                    prompt_contraste(t, hallazgos, lineas),
                    lambda txt: (lambda d: d if isinstance((d or {}).get("veredictos"), list) else None)(extraer_json(txt, "veredictos")),
                    max_tokens=3000, timeout=240, excluir={prov_sintesis}, espera_max=ESPERA_CONTRASTE_S,
                )
                hallazgos, descartados = aplicar_contraste(hallazgos, dato, contraste)
            except SinProveedor:
                # Sin un segundo proveedor el informe sigue valiendo, pero se dice: menos confianza.
                hallazgos, descartados = aplicar_contraste(hallazgos, None, "")
                contraste = ""
            paso_local(tid, "contraste", modelo=contraste or "-", quedan=len(hallazgos), refutados=len(descartados))

        segundos = int(reloj() - t0)
        informe = {
            "id": tid,
            "sesion": t.get("sesion") or "",
            "ola": t.get("ola") or "",
            "area": t.get("area"),
            "area_nombre": t.get("area_nombre") or t.get("area"),
            "lente": lente,
            "lente_nombre": _lente(lente)["nombre"],
            "privado": privado,
            "generado": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(reloj())),
            "segundos": segundos,
            "archivos_leidos": list(lineas),
            "trozos": len(trozos),
            "trozos_propios": propios,
            "trozos_fallidos": fallidos,
            "observaciones": len(mias),
            "modelos": {"mapa": modelos_mapa, "sintesis": sintesis, "contraste": contraste},
            "tokens": dict(llamador.tokens),
            "tokens_estimados": True,
            "resumen": resumen,
            "hallazgos": hallazgos,
            "descartados": descartados,
        }
        if consejo is not None:
            informe["jev"] = {"triaje": triaje, "rutas": [list(r) for r in llamador.rutas_jev],
                              "medios": list(consejo.medios), "contexto": bool(ctx)}
        _escribir_atomico(ruta_json, json.dumps(informe, ensure_ascii=False, indent=1))
        _escribir_atomico(ruta_md, render_md(informe))
        set_estado(tid, estado="informe", modelo=sintesis or (modelos_mapa[0] if modelos_mapa else ""),
                   segundos=segundos, tipo="analisis", hallazgos=len(hallazgos), informe=rel_md,
                   nota="%d hallazgos · %s" % (len(hallazgos), rel_md))
        texto = ("informe privado listo · %d hallazgos" % len(hallazgos)) if privado else (
            "%d hallazgos · %s × %s%s" % (len(hallazgos), t.get("area"), lente,
                                          (" · 1.º: " + hallazgos[0]["titulo"]) if hallazgos else ""))
        evento("informe", tid, texto, {"tipo": "analisis", "area": t.get("area"), "lente": lente,
                                        "hallazgos": len(hallazgos), "refutados": len(descartados),
                                        "tokens": llamador.tokens["entrada"] + llamador.tokens["salida"],
                                        "modelo": sintesis, "privado": privado})
        log("informe escrito: %s (%d hallazgos, %d refutados)" % (rel_md, len(hallazgos), len(descartados)))
        return informe
    except SinProveedor as e:
        set_estado(tid, estado="fallo", nota=_corta(str(e), 200), tipo="analisis", segundos=int(reloj() - t0))
        evento("fallo", tid, "sueño sin proveedores: " + _corta(str(e), 200))
        log("fallo: %s" % e)
        return None
    except Exception as e:  # noqa: BLE001 — el sueño se da por fallido, nunca por hecho
        set_estado(tid, estado="fallo", nota=_corta("%s: %s" % (type(e).__name__, e), 200), tipo="analisis",
                   segundos=int(reloj() - t0))
        evento("fallo", tid, "sueño fallido: " + _corta(str(e), 200))
        log("fallo: %s: %s" % (type(e).__name__, e))
        return None
    finally:
        _soltar(reclamo)
