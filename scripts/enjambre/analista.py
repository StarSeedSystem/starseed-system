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
TOPE_ANALISIS_POR_DEFECTO = 5
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
    `tope_analisis` que el plan dejó en las tareas, o 5. Con la RAM justa se recorta igual:
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


def extraer_json(texto):
    """El primer objeto JSON de una respuesta de modelo: con valla ```json, suelto entre
    llaves o con comas colgantes. None si no hay nada que se deje leer."""
    if not texto:
        return None
    t = str(texto).strip()
    candidatos = []
    m = re.search(r"```(?:json)?\s*(\{.*\})\s*```", t, re.S)
    if m:
        candidatos.append(m.group(1))
    i, j = t.find("{"), t.rfind("}")
    if i >= 0 and j > i:
        candidatos.append(t[i : j + 1])
    for c in candidatos:
        for intento in (c, re.sub(r",\s*([}\]])", r"\1", c)):
            try:
                d = json.loads(intento)
            except ValueError:
                continue
            if isinstance(d, dict):
                return d
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
        'importa, ≤40 palabras","impacto":1,"esfuerzo":1,"confianza":0.5}]}\n'
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


def prompt_reduce(t, observaciones, n_archivos):
    l = _lente(t.get("lente"))
    obs = sorted(observaciones, key=lambda o: -(o.get("impacto", 1) * o.get("confianza", 0)))
    cuerpo, usados = [], 0
    for o in obs:
        s = json.dumps({k: o[k] for k in ("archivo", "linea", "tipo", "texto", "impacto", "esfuerzo", "confianza")},
                       ensure_ascii=False)
        if usados + len(s) > MAX_OBS_REDUCE_CARACTERES:
            break
        cuerpo.append(s)
        usados += len(s)
    return (
        "Eres el sintetizador de un sueño profundo de StarSeed OS.\n"
        "ÁREA: %s — %s\nLENTE: %s — %s\nPreguntas guía:\n%s\n\n%s\n\n"
        "Los lectores dejaron estas %d observaciones (con cita archivo:línea) sobre %d archivos:\n[%s]\n\n"
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
            len(cuerpo), n_archivos, ",\n".join(cuerpo), MAX_HALLAZGOS,
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
    d = extraer_json(texto)
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


class Llamador(object):
    """Rota la flota gratuita para UNA tarea: respeta la salud del orquestador, enfría un
    proveedor tras un 429, aparta el que se quedó sin cuota o sin clave, espera si no queda
    nadie y lleva la cuenta de tokens (estimados) para el latido y el informe."""

    def __init__(self, t, llamar_llm, disponible=None, latir=None, log=None, dormir=time.sleep,
                 reloj=time.time, es_aviso_de_cuota=None, marcar_sin_cupo=None,
                 espera_429_s=ESPERA_429_S, espera_proveedor_s=ESPERA_PROVEEDOR_S, pausa_s=0, rotar=True):
        self.t = t
        # Cada sueño empieza la rotación en un sitio distinto: cinco trabajadores que
        # empezaran todos por el mismo proveedor harían cola en su cupo por minuto.
        self.rotar = rotar
        self.tid = t["id"]
        self._llamar = llamar_llm
        self._disponible = disponible or (lambda p: True)
        self._latir = latir or (lambda *a, **k: None)
        self._log = log or (lambda s: None)
        self._dormir = dormir
        self._reloj = reloj
        self._aviso = es_aviso_de_cuota or (lambda s: False)
        self._marcar = marcar_sin_cupo
        self.espera_429_s = espera_429_s
        self.espera_proveedor_s = espera_proveedor_s
        self.pausa_s = max(0, int(pausa_s or 0))
        self.tokens = {"entrada": 0, "salida": 0, "razonamiento": 0, "cacheLeida": 0, "llamadas": 0}
        self.fallos = {}
        self.fuera = set()
        self.enfriando = {}
        self.ultima = 0.0
        self.subfase = ""
        self.modelo_actual = ""
        try:
            self._con_max = "max_tokens" in inspect.signature(llamar_llm).parameters
        except (TypeError, ValueError):
            self._con_max = False

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
        """Duerme en tramos de ≤ 50 s con latido: un sueño en pausa no es un agente muerto."""
        fin = self._reloj() + max(0.0, segundos)
        while True:
            queda = fin - self._reloj()
            if queda <= 0:
                return
            self.latido(motivo)
            self._dormir(min(50.0, queda))

    def _recuperables(self, lista, excluir, tokens_prompt):
        """¿Queda alguien que VOLVERÁ (enfriándose tras un 429, o apartado por la salud del
        orquestador)? Si todos fallaron dos veces, no tiene sentido esperar 45 min."""
        for p, m in lista:
            if not es_gratuito(p, m) or p in self.fuera or p in excluir:
                continue
            if self.fallos.get((p, m), 0) >= 2 or tokens_prompt > TOPES_ENTRADA.get(p, 10 ** 9):
                continue
            return True
        return False

    def _candidatos(self, lista, excluir, tokens_prompt):
        ahora = self._reloj()
        fuera = []
        for p, m in lista:
            if not es_gratuito(p, m) or p in self.fuera or p in excluir:
                continue
            if self.fallos.get((p, m), 0) >= 2 or self.enfriando.get(p, 0) > ahora:
                continue
            if tokens_prompt > TOPES_ENTRADA.get(p, 10 ** 9):
                continue
            try:
                if not self._disponible(p):
                    continue
            except Exception:
                pass
            fuera.append((p, m))
        return fuera

    def _clasificar(self, p, m, e):
        msg = str(e or "")
        bajo = msg.lower()
        if "429" in msg or "too many requests" in bajo or "rate limit" in bajo and "today" not in bajo:
            self.enfriando[p] = self._reloj() + self.espera_429_s
            self._log("429 en %s/%s: lo enfrío %d s y pruebo otro" % (p, m, self.espera_429_s))
        elif "sin clave" in bajo:
            self.fuera.add(p)
            self._log("%s sin clave en esta máquina: fuera de este sueño" % p)
        elif any(k in bajo for k in ("cuota", "quota", "402", "sin claves útiles", "daily limit", "insufficient")):
            self.fuera.add(p)
            self._log("%s sin cuota: fuera de este sueño (%s)" % (p, _corta(msg, 120)))
        elif "too large" in bajo or "413" in msg:
            self.fallos[(p, m)] = 2
            self._log("%s/%s no admite un prompt de este tamaño" % (p, m))
        else:
            self.fallos[(p, m)] = self.fallos.get((p, m), 0) + 1
            self._log("fallo en %s/%s: %s" % (p, m, _corta(msg, 160)))

    def _pausa(self):
        if self.pausa_s and self.ultima:
            queda = self.pausa_s - (self._reloj() - self.ultima)
            if queda > 0:
                self.dormir(queda, "pausa · ritmo del plan (--horas)")

    def llamar(self, fase, lista, prompt, validar, max_tokens=2500, timeout=180, excluir=(), inicio=0,
               espera_max=None):
        """(dato_validado, "prov/modelo"). Rota hasta que un modelo devuelva algo que
        `validar(texto)` acepte (≠ None). Sin nadie disponible, espera; pasado el plazo,
        SinProveedor. Si ya no queda nadie que pueda volver (todos fallaron dos veces o se
        quedaron sin cuota), SinProveedor al momento: esperar a nadie no es esperar."""
        tokens_prompt = estimar_tokens(prompt)
        plazo = self.espera_proveedor_s if espera_max is None else min(self.espera_proveedor_s, espera_max)
        limite_espera = None
        while True:
            cands = self._candidatos(lista, set(excluir), tokens_prompt)
            if not cands:
                if not self._recuperables(lista, set(excluir), tokens_prompt):
                    raise SinProveedor("%s: todos los modelos gratuitos fallaron o se quedaron sin cuota" % fase)
                ahora = self._reloj()
                if limite_espera is None:
                    limite_espera = ahora + plazo
                    self._log("%s: ningún proveedor gratuito disponible; espero (hasta %d min)" % (fase, plazo // 60))
                if ahora >= limite_espera:
                    raise SinProveedor("%s: sin proveedores gratuitos tras %d min de espera" % (fase, plazo // 60))
                proximos = [v for v in self.enfriando.values() if v > ahora]
                espera = min(60.0, max(5.0, (min(proximos) - ahora) if proximos else 60.0))
                self.dormir(min(espera, max(0.0, limite_espera - ahora)) or 1.0, "esperando proveedor")
                continue
            limite_espera = None
            k = (inicio % len(cands)) if self.rotar else 0
            for p, m in cands[k:] + cands[:k]:
                if p in self.fuera or self.enfriando.get(p, 0) > self._reloj():
                    continue
                self._pausa()
                self.latido("%s · %s/%s" % (fase, p, m), "%s/%s" % (p, m))
                try:
                    if self._con_max:
                        txt = self._llamar(p, m, prompt, timeout=timeout, max_tokens=max_tokens)
                    else:
                        txt = self._llamar(p, m, prompt, timeout=timeout)
                except Exception as e:  # noqa: BLE001 — cada fallo se clasifica, ninguno tumba el sueño
                    self.ultima = self._reloj()
                    self._clasificar(p, m, e)
                    continue
                self.ultima = self._reloj()
                txt = txt or ""
                self.tokens["entrada"] += tokens_prompt
                self.tokens["salida"] += estimar_tokens(txt)
                self.tokens["llamadas"] += 1
                if self._aviso(txt):
                    self.fuera.add(p)
                    if self._marcar:
                        try:
                            self._marcar(p, txt[:160])
                        except Exception:
                            pass
                    self._log("%s devolvió un aviso de cuota como respuesta: fuera" % p)
                    continue
                try:
                    dato = validar(txt)
                except Exception:
                    dato = None
                if dato is None:
                    self.fallos[(p, m)] = self.fallos.get((p, m), 0) + 1
                    self._log("%s/%s respondió sin el JSON pedido (%s)" % (p, m, _corta(txt, 100)))
                    continue
                self.latido("%s · %s/%s ✓" % (fase, p, m))
                return dato, "%s/%s" % (p, m)


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
                        "lectura %d/%d" % (idx + 1, len(trozos)), MAP_RAPIDOS,
                        prompt_map(t, tr, idx + 1, len(trozos)),
                        lambda txt, rutas=rutas: normalizar_observaciones(extraer_json(txt), rutas),
                        max_tokens=2500, timeout=150, inicio=inicio + idx,
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
             espera_429_s=ESPERA_429_S, espera_proveedor_s=ESPERA_PROVEEDOR_S, leer=None, rotar=True):
    """Ejecuta UN sueño (tarea `tipo: "analisis"`). Devuelve el informe (dict) o None.

    Estados en progreso.json (vía `set_estado`): en_curso → informe | fallo. Eventos al bus
    (vía `evento`), pocos y gruesos: `inicio` y `informe`/`fallo`, uno por tarea. El detalle
    va a los latidos locales y al registro de la tarea (`log`)."""
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
                        marcar_sin_cupo, espera_429_s, espera_proveedor_s, t.get("pausa_s") or 0, rotar)
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

        hallazgos, resumen, sintesis = [], "", ""
        if mias:
            # Los capaces primero; si ninguno está, cualquiera de la flota antes que esperar.
            (resumen, hallazgos), sintesis = llamador.llamar(
                "síntesis", _sin_repetir(REDUCE_CAPACES, MAP_RAPIDOS), prompt_reduce(t, mias, len(lineas)),
                lambda txt: leer_sintesis(txt, lineas), max_tokens=4000, timeout=300,
            )
        else:
            resumen = "Los lectores no vieron nada relevante para esta lente en los archivos leídos."
        paso_local(tid, "sintesis", modelo=sintesis or "-", hallazgos=len(hallazgos))

        descartados, contraste = [], ""
        if hallazgos:
            prov_sintesis = sintesis.split("/", 1)[0] if sintesis else ""
            try:
                dato, contraste = llamador.llamar(
                    "contraste", _sin_repetir(CONTRASTE, REDUCE_CAPACES, MAP_RAPIDOS),
                    prompt_contraste(t, hallazgos, lineas), extraer_json,
                    max_tokens=2500, timeout=240, excluir={prov_sintesis}, espera_max=ESPERA_CONTRASTE_S,
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
