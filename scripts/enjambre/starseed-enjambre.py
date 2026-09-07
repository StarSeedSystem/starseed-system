#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""starseed-enjambre · orquestador PARALELO del enjambre libre de StarSeed OS (v2, Ola 227)

  python3 ~/.local/bin/starseed-enjambre.py cola.json [--workers 3] [--solo ID,ID] [--sin-revision] [--aprobacion] [--integrar-bloqueantes]

Qué hace (todo gratis: opencode → NVIDIA NIM para escribir; OpenRouter/NIM/Gemini para revisar):
  · N trabajadores en paralelo, cada uno en su propio `git worktree` (rama ola/<id>) → nadie pisa a nadie.
  · Puertas por tarea: tsc (una a la vez, la Mac tiene 8 GB) → reparación automática → vitest → revisión
    cruzada por OTRO proveedor → commit en la rama → integración en main (rebase + ff), serializada.
  · Conflicto al integrar = reintento limpio de la tarea sobre el main nuevo (una vez).
  · Cupos por proveedor (req/min) y semáforo de concurrencia para no pasar los límites gratuitos.
  · Supervisor: eventos → bitácora local (olas/eventos.jsonl) + bus Supabase (relevo_eventos) +
    `hermes send` para lo importante + `starseed-relevo nota`. Verificador final: tsc + vitest en main.
  · `depende: ["ID"]` en una tarea la hace esperar a esas tareas Y exigir que se integraron
    (si una terminó sin commit, la dependiente queda «bloqueada»; con `depende_opcional` solo avisa).
  · Un modelo solo se retira si el CATÁLOGO del proveedor confirma que ya no existe
    (`debe_retirar`): las pistas «does not exist» de la salida de las herramientas no cuentan.
Estado: olas/progreso.json + progreso.md (mismo formato de siempre) + logs/<id>.log + revisiones.md

Tiempos configurables (2026-09-06, Ola 261):
  · STARSEED_ESCRITURA_S  — tope de una llamada de escritura de opencode (defecto 1500 s).
  · STARSEED_ESTANCADO_S  — sin avance en el log se considera colgado (defecto max(900, ESCRITURA_S//2));
    una escritura legítima por trozos puede tardar ESCRITURA_S, así que el vigilante nunca debe
    ser más impaciente que la mitad de ese margen.
"""
import hashlib, json, os, re, subprocess, sys, threading, time, urllib.request, urllib.error, shutil, collections
import signal
import contextlib, fcntl

# El MISMO archivo corre en la Mac de Alex y en el contenedor de Cowork: sin variables de
# entorno, adivina el repositorio por dónde exista (Mac: ~/Documents/starseed-os-main;
# nube: ~/starseed-system) y coloca los worktrees al lado.
def _raiz_por_defecto():
    for c in ("~/Documents/starseed-os-main", "~/starseed-system", "/home/claude/starseed-system"):
        if os.path.isdir(os.path.expanduser(c)):
            return os.path.expanduser(c)
    return os.path.expanduser("~/starseed-system")
ROOT = os.environ.get("STARSEED_ROOT") or _raiz_por_defecto()
MEM = os.path.join(ROOT, "starseed_memory_root")
OLAS = os.path.join(MEM, "olas")
LOGS = os.path.join(OLAS, "logs")
WT_BASE = os.environ.get("STARSEED_WT") or (os.path.expanduser("~/Documents/starseed-wt") if "/Documents/" in ROOT else os.path.join(os.path.dirname(ROOT), "starseed-wt"))
PROG_JSON = os.path.join(OLAS, "progreso.json")
PROG_MD = os.path.join(OLAS, "progreso.md")
REVIS = os.path.join(OLAS, "revisiones.md")
EVENTOS = os.path.join(OLAS, "eventos.jsonl")
RELEVO = os.path.expanduser("~/.local/bin/starseed-relevo")
SUPABASE_URL = "https://pqzdpmedcsgcedkvndzl.supabase.co"
ENV_TSC = {"NODE_ENV": "development", "NODE_OPTIONS": "--max-old-space-size=2560"}

# ESCRITORES: solo NIM (opencode con aihubmix/tokenrouter devuelve «sin cambios» en segundos, sin
# editar archivos; esos dos se quedan de REVISORES, donde sí funcionan por HTTP directo).
# ⚠️ Verificados contra GET /v1/models el 2026-09-04: gpt-oss-120b devolvía 410 (fin de vida el
# 2026-09-03) y qwen3-coder-480b ya no existe en el catálogo. Si un modelo desaparece, opencode
# falla y la tarea se marca «sin cambios» sin motivo aparente: revalida esta lista antes de una ola.
MODELOS = [
    # xKiro primero: 40 modelos gratis con tool-calling y 5M tokens/día, y opencode SÍ edita
    # archivos con ellos (probado en vivo el 2026-09-04 con qwen3-coder-plus y minimax-m3;
    # aihubmix y tokenrouter fallaban justo aquí). Alterna proveedor para repartir la carga.
    "xkiro/qwen/qwen3-coder-plus:free",
    "nvidia/moonshotai/kimi-k3",
    "xkiro/minimax/minimax-m3:free",
    "nvidia/deepseek-ai/deepseek-v4-flash-0731",
    # Verificado el 2026-09-06 (Ola 261) en /tmp/prueba-escritor: opencode SÍ crea archivos con
    # tokenrouter glm-5.3-free, y rápido (era uno de los revisores; ahora también escribe).
    "tokenrouter/z-ai/glm-5.3-free",
    "xkiro/qwen/qwen3.8-max:free",
    "nvidia/deepseek-ai/deepseek-v4-pro-0813",
    "xkiro/deepseek/deepseek-v4-pro",
    "xkiro/mistralai/devstral-medium",
    # llm7/gpt-oss también escribió en la prueba, pero con calidad baja: solo entra en la
    # rotación de una tarea si TODOS sus archivos son Markdown (ver apto_para_tarea).
    "llm7/gpt-oss",
]

MUERTOS = set()          # modelos que el proveedor ha rechazado en esta corrida
PROCESOS = {}            # tarea -> Popen de opencode en marcha (para poder cortarlo)
CORTADOS = set()         # tareas cuyo opencode ha matado el vigilante: no cuentan como intento
PROCESOS_LOCK = threading.Lock()
FIN = threading.Event()  # lo levanta main() al terminar, para parar al vigilante

# Pistas de que ha fallado el PROVEEDOR, no el modelo: un «sin cambios» por esto es falso.
PISTAS_PROVEEDOR = ("end of life", "no longer available", "\"status\":410", "gone:", "unauthorized",
                    "too many requests", "rate limit", "model not found", "does not exist",
                    "ai_apicallerror", "econnrefused", "fetch failed", "internal server error",
                    "database is locked")   # SQLite de opencode ocupada por otro agente: no es culpa del modelo
PISTAS_DEFUNCION = ("end of life", "no longer available", "model not found", "does not exist")

def fallo_de_proveedor(salida):
    b = (salida or "").lower()
    return next((x for x in PISTAS_PROVEEDOR if x in b), None)

CATALOGOS = {
    "nvidia": ("https://integrate.api.nvidia.com/v1/models", ("NVIDIA_API_KEY", "NVIDIA_SHARED_KEY")),
    "xkiro":  ("https://api.xkiro.com/v1/models", ("XKIRO_API_KEY",)),
}

_CATALOGOS_CACHE = {}  # proveedor -> (epoch, set de ids o None si falló la consulta)

def catalogo_proveedor(prov):
    """Catálogo vivo del proveedor (conjunto de ids de modelo), cacheado 10 minutos
    (2026-09-07, Ola 261). Lo consultan validar_modelos() y debe_retirar(); el caché evita
    una petición HTTP por cada sospecha de defunción. Devuelve None si el proveedor no
    tiene catálogo conocido (tokenrouter, llm7), si no hay clave o si la consulta falló."""
    if prov not in CATALOGOS:
        return None
    ts, datos = _CATALOGOS_CACHE.get(prov, (0, None))
    if time.time() - ts < 600:
        return datos
    url, claves = CATALOGOS[prov]
    key = next((ENV.get(k) or os.environ.get(k) for k in claves if ENV.get(k) or os.environ.get(k)), None)
    datos = None
    if key:
        try:
            req = urllib.request.Request(url, headers={"Authorization": "Bearer " + key,
                                                       "User-Agent": "starseed-enjambre/2 (+starseed-os)"})
            datos = {m["id"] for m in json.loads(urllib.request.urlopen(req, timeout=30).read()).get("data", [])}
        except Exception:
            datos = None
    _CATALOGOS_CACHE[prov] = (time.time(), datos)
    return datos


def debe_retirar(modelo, salida, catalogo=None):
    """Decide, de forma PURA, si un modelo sale de la rotación al ver una pista de defunción
    (2026-09-07, Ola 261). Devuelve (retirar: bool, motivo: str).

    Antes la pista «does not exist» se buscaba en TODA la salida de opencode, incluida la
    salida de las herramientas que el agente ejecuta: en la Ola 264 un `git show main:…`
    respondió «fatal: path … does not exist in 'main'» y el orquestador retiró dos modelos
    de NIM que seguían vivos en el catálogo. Por eso ahora:
      · Si hay catálogo (nvidia, xkiro), manda él: solo se retira si ya NO está en él.
      · Si NO hay catálogo (tokenrouter, llm7), la pista solo cuenta cuando aparece en una
        línea de error de la API (empieza por `Error`/`AI_APICallError`/`{"error"` o lleva
        «HTTP Error»), nunca dentro de la salida de una herramienta del agente."""
    pista = next((p for p in PISTAS_DEFUNCION if p in (salida or "").lower()), None)
    if not pista:
        return False, ""
    prov = proveedor_de(modelo)
    if catalogo is not None:
        if modelo.split("/", 1)[1] in catalogo:
            return False, "%s sigue en el catálogo de %s" % (modelo, prov)
        return True, "%s ya no está en el catálogo de %s (pista: %s)" % (modelo, prov, pista)
    # Sin catálogo de referencia: solo valen las líneas de error reales de la API.
    for linea in (salida or "").splitlines():
        l = linea.strip()
        if pista in l.lower() and (l.startswith(("Error", "AI_APICallError", '{"error"')) or "HTTP Error" in l):
            return True, "línea de error de la API: " + l[:120]
    return False, "la pista «%s» no salió de una línea de error de la API (salida de una herramienta)" % pista


def validar_modelos():
    """Antes de empezar, comprueba qué modelos existen de verdad en el catálogo de NIM.
    Un modelo retirado hace que opencode falle y la tarea se marque «sin cambios» sin
    haber sido intentada nunca: eso ya pasó con gpt-oss-120b y qwen3-coder-480b."""
    fuera = []
    for proveedor, (url, claves) in CATALOGOS.items():
        # Sin clave del proveedor no hay consulta posible: se salta en silencio, como siempre.
        if not any(ENV.get(k) or os.environ.get(k) for k in claves):
            continue
        vivos = catalogo_proveedor(proveedor)   # misma consulta cacheada que usa debe_retirar()
        if vivos is None:
            evento("aviso", "", "no pude validar el catálogo de %s: sigo con su lista tal cual" % proveedor)
            continue
        fuera += [m for m in MODELOS if m.startswith(proveedor + "/") and m.split("/", 1)[1] not in vivos]
    for m in fuera:
        MUERTOS.add(m); MODELOS.remove(m)
    if fuera:
        evento("aviso", "", "modelos retirados del catálogo, fuera de la rotación: " + ", ".join(fuera))
    if not MODELOS:
        evento("fallo", "", "ningún modelo escritor sigue vivo — no arranco"); sys.exit(3)
    evento("arranque", "", "escritores verificados vivos: " + ", ".join(m.split("/", 1)[1] for m in MODELOS))

SALUD_JSON = os.path.expanduser("~/.starseed/salud-proveedores.json")
SONDEO_S = int(os.environ.get("STARSEED_SONDEO_S", "60"))
# Modelo barato con el que se comprueba que el proveedor GENERA, no solo que su catálogo
# responde: el 2026-09-04 xKiro servía /models en 0,5 s mientras devolvía 429 en todas las
# generaciones, y el panel lo daba por vivo mientras tres tareas se colgaban.
SONDAS = {
    "xkiro":       ("minimax/minimax-m2.7-highspeed:free", ("XKIRO_API_KEY",)),
    "nim":         ("moonshotai/kimi-k3", ("NVIDIA_API_KEY", "NVIDIA_SHARED_KEY")),
    "aihubmix":    ("coding-glm-5.3-free", ("AIHUBMIX_API_KEY",)),
    "tokenrouter": ("z-ai/glm-5.3-free", ("TOKENROUTER_API_KEY",)),
    "openrouter":  ("nvidia/nemotron-3-super-120b-a12b:free", ("OPENROUTER_API_KEY",)),
    "llm7":        ("gpt-oss", ("LLM7_SIN_CLAVE",)),      # sin clave: la variable es un marcador
    "freetheai":   ("gpt-oss-120b", ("FREETHEAI_API_KEY",)),
}
USO_REAL = {}            # proveedor -> (momento, salió bien) del último trabajo de verdad
FRESCO_S = 120           # si hay noticia real más nueva que esto, no hace falta sondear
# (2026-09-07, Ola 271, P9D) La sonda de CADA ciclo pasa a ser un GET a `/models` (SONDA LIGERA):
# la generación real de prueba quemaba el cupo diario de los proveedores gratis (OpenRouter :free
# ≈ 50/día, aihubmix 10 sin recarga) sin aportar nada que el catálogo no diga. La generación real
# solo se hace con `forzar=True`, y como máximo una vez cada SONDA_GENERACION_S por proveedor.
SONDA_GENERACION_S = int(os.environ.get("SONDA_GENERACION_S", str(30 * 60)))
_ULTIMA_GENERACION = {}  # proveedor -> momento de la última generación real de prueba
# URL del catálogo `/models` de cada proveedor para la sonda ligera (un GET no consume cupo).
MODELS_URLS = {
    "xkiro":       "https://api.xkiro.com/v1/models",
    "nim":         "https://integrate.api.nvidia.com/v1/models",
    "aihubmix":    "https://aihubmix.com/v1/models",
    "tokenrouter": "https://api.tokenrouter.com/v1/models",
    "openrouter":  "https://openrouter.ai/api/v1/models",
    "llm7":        "https://api.llm7.io/v1/models",
    "freetheai":   "https://api.freetheai.xyz/v1/models",
}
# (2026-09-07, Ola 271, P9D) Una racha de 429 (límite por minuto o cupo diario) agota la clave
# 1 hora y la sonda la vuelve a probar; solo un 402 o un aviso de cupo explícito la agotan 24 h.
HORAS_AGOTAR = {"429": 1, "402": 24, "cuota": 24}


def _gravedad_tipo(tipo):
    """(2026-09-07, Ola 271, P9E, Tarea 3) Nivel de gravedad de un motivo de agotamiento:
    un 429 (atasco de ritmo, 1 h) es menos grave que un 402/cuota (fin de cuota, 24 h). La
    deduplicación del aviso compara estos niveles, no los segundos del `hasta`."""
    return 2 if tipo in ("402", "cuota") else 1


def _claves_agotadas_futuras(prov):
    """Entradas de `claves_agotadas` con `hasta` futuro (mapping huella → entrada). Las vencidas
    ya no cuentan: se ignora el agotamiento pasado (2026-09-07, Ola 271, P9D)."""
    agotadas = (_salud().get(prov) or {}).get("claves_agotadas") or {}
    out = {}
    for huella, ent in agotadas.items():
        hasta = ent.get("hasta") or ""
        try:
            if time.strptime(hasta, "%Y-%m-%d %H:%M:%S") > time.localtime():
                out[huella] = ent
        except Exception:
            pass
    return out


def registrar_uso(prov, ok):
    """El tráfico real es el mejor sondeo: cada llamada que funciona o falla cuenta como
    señal de salud, y así el supervisor no gasta cuota preguntando lo que ya sabe."""
    USO_REAL[prov] = (time.time(), ok)
PREFIJO_PROVEEDOR = {"nvidia": "nim"}   # los modelos de NIM se escriben nvidia/…


def proveedor_de(modelo):
    p = modelo.split("/", 1)[0]
    return PREFIJO_PROVEEDOR.get(p, p)


def _salud():
    try:
        return json.load(open(SALUD_JSON, encoding="utf-8"))
    except Exception:
        return {}


def _salud_guardar(d):
    os.makedirs(os.path.dirname(SALUD_JSON), exist_ok=True)
    try:
        with cerrojo("salud", espera_aviso=9999):
            json.dump(d, open(SALUD_JSON, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    except Exception:
        pass


def proveedor_vivo(prov):
    """Lo escribe el supervisor y lo leen TODAS las olas: si un proveedor está caído,
    ninguna tarea de ninguna ola pierde el tiempo intentándolo."""
    e = _salud().get(prov)
    return True if not e else e.get("estado") != "caido"


# ── memoria de cupo de los revisores (2026-09-06, Ola 261) ─────────────────
# El 06-09 xkiro contestó 429 y aihubmix su aviso de cuota en TODAS las revisiones del día:
# se intentaban una y otra vez en orden fijo y cada tarea perdía 5-12 minutos antes de llegar
# a un revisor que respondiera. Desde esta ola el archivo de salud también recuerda quién se
# quedó sin cuota (24 h) y quiénn recibió 429 hace poco (enfriamiento de 10 min), y esos
# proveedores se saltan sin intentarlos.
REVISOR_ULTIMO_OK = ""   # «proveedor/modelo» del último revisor que sí respondió: va primero la próxima vez


def marcar_sin_cupo(prov, motivo, horas=24):
    """Anota en la entrada del proveedor que se quedó SIN cupo hasta dentro de `horas`.
    Respeta el resto de campos (estado, desde, ultimo_429…): solo toca los suyos."""
    d = _salud()
    e = d.get(prov) or {}
    e["sin_cupo_hasta"] = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(time.time() + horas * 3600))
    e["motivo"] = str(motivo or "")[:200]
    d[prov] = e
    _salud_guardar(d)


def quitar_sin_cupo(prov):
    """Quita la marca de «sin cupo» del proveedor (2026-09-07, Ola 271, P9D). La usa la sonda
    ligera cuando un proveedor cuyas claves estaban agotadas solo por 429 vuelve a responder:
    se libera el `sin_cupo_hasta` y su motivo. Respeta el resto de campos (estado, ultimo_429…)."""
    d = _salud()
    e = d.get(prov) or {}
    if "sin_cupo_hasta" in e or "motivo" in e:
        e.pop("sin_cupo_hasta", None)
        e.pop("motivo", None)
        d[prov] = e
        _salud_guardar(d)


def sin_cupo(prov) -> bool:
    """True si la cuota del proveedor consta agotada aún (fecha futura)."""
    hasta = ( _salud().get(prov) or {}).get("sin_cupo_hasta") or ""
    if not hasta:
        return False
    try:
        return time.strptime(hasta, "%Y-%m-%d %H:%M:%S") > time.localtime()
    except Exception:
        return False


def marcar_429(prov):
    """429 NO es fin de cuota, es ritmo: se anota la hora y el proveedor se enfría 10 min."""
    d = _salud()
    e = d.get(prov) or {}
    e["ultimo_429"] = ahora()
    d[prov] = e
    _salud_guardar(d)


def enfriandose(prov) -> bool:
    """True si el proveedor recibió un 429 hace menos de 10 minutos."""
    ultimo = (_salud().get(prov) or {}).get("ultimo_429") or ""
    if not ultimo:
        return False
    try:
        return time.time() - time.mktime(time.strptime(ultimo, "%Y-%m-%d %H:%M:%S")) < 600
    except Exception:
        return False


def _clasificar_fallo_cupo(prov, exc):
    """Clasifica el fallo de una llamada a un proveedor y deja la memoria de cupo al día:
    402 / aviso de cuota / «quota» / «daily limit» → sin cupo 24 h; 429 → enfriamiento.
    Se llama desde llamar_llm y sondear, que es TODA llamada que el orquestador hace, así
    el recuerdo no depende de quién capturó la excepción."""
    m = str(exc or "")
    ml = m.lower()
    if "429" in m:
        marcar_429(prov)
    elif "402" in m or any(k in ml for k in ("quota", "cuota", "daily limit", "rate limit exceeded for today")):
        marcar_sin_cupo(prov, ml)


def _revisor_ultimo_ok():
    """El último revisor que respondió: primero la variable de esta ola, luego la del
    archivo de salud (así el recuerdo sobrevive a reinicios del orquestador)."""
    if REVISOR_ULTIMO_OK:
        return REVISOR_ULTIMO_OK
    d = _salud()
    return d.get("ultimo_revisor_ok") if isinstance(d.get("ultimo_revisor_ok"), str) else ""


def candidatos_revision():
    """Orden de provisión: los de REVISORES vivos, con cupo y no enfriándose, y el último
    que respondió SIEMPRE primero. Devuelve (candidatos, saltados_humanos); si todos están
    excluidos, devuelve la lista completa — nunca nos quedamos sin revisor."""
    orden = list(REVISORES)                     # NO se cambia el orden base, solo el arranque
    ultimo = _revisor_ultimo_ok()
    i = next((j for j, r in enumerate(orden) if "%s/%s" % r == ultimo), None)
    if i is not None:
        orden = [orden[i]] + orden[:i] + orden[i + 1:]
    d = _salud()
    candidatos, saltados = [], []
    for prov, modelo in orden:
        e = d.get(prov) or {}
        if not proveedor_vivo(prov):
            saltados.append("%s (caído)" % prov)
        elif sin_cupo(prov):
            saltados.append("%s (sin cupo hasta %s)" % (prov, e.get("sin_cupo_hasta") or "¿?"))
        elif enfriandose(prov):
            try:
                minutos = int((time.time() - time.mktime(time.strptime(e.get("ultimo_429", ""), "%Y-%m-%d %H:%M:%S"))) / 60)
            except Exception:
                minutos = 0
            saltados.append("%s (429 hace %d min)" % (prov, minutos))
        else:
            candidatos.append((prov, modelo))
    return (candidatos or orden), saltados   # sin candidatos limpios: todos, como antes


def _revisor_respondio(prov, modelo):
    """Anota el último revisor que sí contestó: en esta ola (global) y en el archivo de
    salud (útil para las Oläs siguientes y para el Mando)."""
    global REVISOR_ULTIMO_OK
    REVISOR_ULTIMO_OK = "%s/%s" % (prov, modelo)
    try:
        d = _salud()
        d["ultimo_revisor_ok"] = REVISOR_ULTIMO_OK
        _salud_guardar(d)
    except Exception:
        pass


def revalidar_proveedor(prov):
    """Para un modelo pedido EXPRESAMENTE (cola o Mando): si su proveedor consta «caído» pero
    el dato es viejo (>10 min: el supervisor de esta máquina llevaba tiempo sin mirar), se
    sondea ahora mismo en vez de reenrutar a ciegas. El 2026-09-05 P2 pidió minimax por
    xkiro y se fue a NIM porque el archivo de salud de la Mac decía «caído» de otro día."""
    d = _salud(); e = d.get(prov)
    if not e or e.get("estado") != "caido":
        return True
    try:
        edad = time.time() - time.mktime(time.strptime(e.get("t", ""), "%Y-%m-%d %H:%M:%S"))
    except Exception:
        edad = 1e9
    if edad < 600:
        return False
    vivo = sondear(prov, forzar=True) if prov in SONDAS else None
    if vivo:
        d[prov] = {"estado": "vivo", "t": ahora(), "desde": ahora()}; _salud_guardar(d)
        return True
    return False


def _clave_sonda(prov):
    """Clave para la sonda de un proveedor (2026-09-07, Ola 271, P9D). Devuelve un item de
    clave (`{var, medio, valor, huella}`) o None. Regla de la Tarea 2: si TODAS las claves
    están agotadas por 402/cuota, devuelve None para que el llamador NO sondee hasta su `hasta`;
    si lo están SOLO por 429 (temporal), devuelve la primera clave cruda (la agotada) para seguir
    probando, porque un 200 debe liberar ese agotamiento."""
    kay = None if prov in PASARELAS else clave_activa(prov)
    if kay:
        return kay
    if prov in PASARELAS:
        return None
    futuras = _claves_agotadas_futuras(prov)
    if any((f.get("tipo") or "cuota") != "429" for f in futuras.values()):
        return None                          # 402/cuota vigente: no sondear hasta su hasta
    crudas = _claves_crudas(prov)
    return crudas[0] if crudas else None


def _liberar_429(prov):
    """(2026-09-07, Ola 271, P9D, Tarea 2) Tras un 200 de la sonda, libera las claves agotadas
    SOLO por 429 (las 402/cuota aguantan su `hasta`), quita `sin_cupo_hasta` y avisa
    `proveedor_recuperado`. Devuelve True si liberó algo."""
    d = _salud()
    e = d.get(prov) or {}
    agotadas = e.get("claves_agotadas") or {}
    limpiadas = [h for h, ent in agotadas.items() if (ent.get("tipo") or "cuota") == "429"]
    if not limpiadas:
        return False
    for h in limpiadas:
        agotadas.pop(h, None)
    e["claves_agotadas"] = agotadas
    d[prov] = e
    _salud_guardar(d)
    quitar_sin_cupo(prov)
    evento("proveedor_recuperado", "", "%s responde sin cuota: claves agotadas por 429 liberadas" % prov)
    return True


def _sonda_ligera(prov, claves, kay):
    """GET a `/models` con la clave activa (2026-09-07, Ola 271, P9D, Tarea 4): no consume cupo de
    generación. 200 → vivo (y libera las agotadas por 429); 401/403 → clave inválida (agotar 24 h,
    «clave rechazada»); 402 → agotar 24 h; resto (5xx/timeout/red) → caído."""
    url = MODELS_URLS.get(prov) or (PASARELAS[prov]["url"].rstrip("/chat/completions") + "/models" if prov in PASARELAS else None)
    if not url:
        return _sonda_generacion(prov, claves, kay)  # sin catálogo: caer a generación real
    key = (PASARELAS[prov]["key"] if prov in PASARELAS else
           ((kay or {}).get("valor") or
            next((ENV.get(k) or os.environ.get(k) for k in claves if ENV.get(k) or os.environ.get(k)), None) or
            (ENV.get("LLM7_API_KEY") or "sin-clave" if prov == "llm7" else None)))
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + key,
                                              "User-Agent": "starseed-enjambre/2 (+starseed-os)"})
    huella = (kay or {}).get("huella")
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            _liberar_429(prov)
            return True
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            if huella:
                agotar_clave(prov, huella, "sonda: clave rechazada (%d)" % e.code, tipo="cuota")
            else:
                marcar_sin_cupo(prov, "sonda: clave rechazada (%d)" % e.code, 24)
        elif e.code == 402:
            if huella:
                agotar_clave(prov, huella, "sonda: HTTP 402", tipo="402")
            else:
                marcar_sin_cupo(prov, "sonda: HTTP 402", 24)
        else:
            _clasificar_fallo_cupo(prov, e)
    except Exception as e:
        # (2026-09-07, Ola 271, P9E, Tarea 2) Nada de tragar la excepción en silencio: se anota
        # el motivo real (sin la clave) en el log y en la memoria de uso, para que el proveedor
        # conste caído con causa y la sonda no devuelva «muerto» sin explicación.
        USO_REAL[prov] = (time.time(), False)
        print("sonda ligera %s: %s: %s" % (prov, type(e).__name__, str(e)[:200]), flush=True)
    return False


def _sonda_generacion(prov, claves, kay):
    """Generación real de prueba (2026-09-07, Ola 271, P9D): solo con `forzar=True` y como máximo
    una vez cada SONDA_GENERACION_S por proveedor. Comprueba que el proveedor ACEPTA y CONTESTA
    una generación; distingue el motivo del fallo (402/cuota/429) para agotar con las horas justas."""
    modelo = SONDAS[prov][0]
    url = {"xkiro": "https://api.xkiro.com/v1/chat/completions",
           "nim": "https://integrate.api.nvidia.com/v1/chat/completions",
           "aihubmix": "https://aihubmix.com/v1/chat/completions",
           "tokenrouter": "https://api.tokenrouter.com/v1/chat/completions",
           "openrouter": "https://openrouter.ai/api/v1/chat/completions",
           "llm7": "https://api.llm7.io/v1/chat/completions",
           "freetheai": "https://api.freetheai.xyz/v1/chat/completions",
           **{n: p["url"] for n, p in PASARELAS.items()}}[prov]
    key = (PASARELAS[prov]["key"] if prov in PASARELAS else
           ((kay or {}).get("valor") or
            next((ENV.get(k) or os.environ.get(k) for k in claves if ENV.get(k) or os.environ.get(k)), None) or
            (ENV.get("LLM7_API_KEY") or "sin-clave" if prov == "llm7" else None)))
    huella = (kay or {}).get("huella")
    cuerpo = {"model": modelo, "messages": [{"role": "user", "content": "ok"}], "max_tokens": 4}
    try:
        req = urllib.request.Request(url, data=json.dumps(cuerpo).encode(),
                                     headers={"Content-Type": "application/json",
                                              "Authorization": "Bearer " + key,
                                              "User-Agent": "starseed-enjambre/2 (+starseed-os)"})
        with urllib.request.urlopen(req, timeout=40) as r:
            vivo = 200 <= r.status < 300
            if vivo:
                try:
                    cuerpo_r = json.loads(r.read().decode("utf-8", "ignore"))
                    contenido = ((cuerpo_r.get("choices") or [{}])[0].get("message") or {}).get("content") or ""
                    if es_aviso_de_cuota(contenido):
                        vivo = False          # 200 con aviso de cuota = agotado, no vivo
                        if huella:
                            agotar_clave(prov, huella, "sonda: " + contenido[:90], tipo="cuota")
                        else:
                            marcar_sin_cupo(prov, "sonda: " + contenido[:90], 24)
                except Exception:
                    pass
    except Exception as e:
        vivo = False
        m = str(e or "")
        if huella and "402" in m:
            agotar_clave(prov, huella, "sonda: HTTP 402", tipo="402")
        elif huella and "429" in m and _registrar_429_clave(huella):
            agotar_clave(prov, huella, "sonda: tres 429 en 10 min", tipo="429")
        else:
            _clasificar_fallo_cupo(prov, e)
    return vivo


def sondear(prov, forzar=False):
    modelo, claves = SONDAS[prov]
    if prov != "llm7" and prov not in PASARELAS and not any(ENV.get(k) or os.environ.get(k) for k in claves):
        return None                      # sin clave: ni vivo ni caído, simplemente no se usa
    if not forzar:
        visto = USO_REAL.get(prov)
        if visto and time.time() - visto[0] < FRESCO_S:
            return visto[1]              # acaba de trabajar de verdad: esa es la respuesta
    kay = _clave_sonda(prov)
    if kay is None and prov not in PASARELAS:
        # (2026-09-07, Ola 271, P9D, Tarea 2) claves TODAS agotadas por 402/cuota: no sondear
        # hasta que venza su `hasta`. Se devuelve None (ni vivo ni caído: solo se salta el ciclo).
        return None
    if forzar and time.time() - _ULTIMA_GENERACION.get(prov, 0) >= SONDA_GENERACION_S:
        _ULTIMA_GENERACION[prov] = time.time()
        vivo = _sonda_generacion(prov, claves, kay)
    else:
        vivo = _sonda_ligera(prov, claves, kay)
    registrar_uso(prov, vivo)
    return vivo


def supervisor_proveedores():
    """Comprueba EN VIVO que cada proveedor responde. Dos fallos seguidos y sus modelos
    salen de la rotación al instante, con aviso; cuando vuelve, se reincorpora solo.
    Nadie espera a una comprobación programada para enterarse."""
    fallos = {}
    # El estado que manda para AVISAR es el de este supervisor (memoria), no el del archivo:
    # el 2026-09-04 el archivo se leía «caído» varias vueltas seguidas y el bus recibió cuatro
    # «nim vuelve a responder» en cuatro minutos. El archivo es para que lo LEAN las demás olas.
    visto = {}
    while not FIN.is_set():
        d = _salud()
        for prov in SONDAS:
            if FIN.is_set():
                return
            en_disco = (d.get(prov) or {}).get("estado", "vivo")
            antes = visto.get(prov, en_disco)
            ok = sondear(prov, forzar=(antes == "caido" or en_disco == "caido"))
            if ok is None:
                continue
            desde = (d.get(prov) or {}).get("desde") or (d.get(prov) or {}).get("t") or ahora()
            if ok:
                fallos[prov] = 0
                if antes == "caido":
                    evento("proveedor_recuperado", "", "%s vuelve a responder → sus modelos regresan a la rotación" % prov)
                    desde = ahora()
                elif en_disco == "caido":
                    desde = ahora()
                e = d.get(prov) or {}   # se fusiona, no se pisa: conserva sin_cupo_hasta / ultimo_429 (Ola 261)
                e.update({"estado": "vivo", "t": ahora(), "desde": desde})
                d[prov] = e
                visto[prov] = "vivo"
            else:
                fallos[prov] = fallos.get(prov, 0) + 1
                if fallos[prov] >= 3 and antes != "caido":
                    e = d.get(prov) or {}
                    e.update({"estado": "caido", "t": ahora(), "desde": ahora()})
                    d[prov] = e
                    visto[prov] = "caido"
                    evento("proveedor_caido", "", "%s no responde a TRES sondeos seguidos → fuera de la rotación en TODAS las olas" % prov)
                elif antes == "caido" or en_disco == "caido":
                    e = d.get(prov) or {}
                    e.update({"estado": "caido", "t": ahora(), "desde": desde})   # sigue caído: solo se anota la hora del sondeo
                    d[prov] = e
                    visto[prov] = "caido"
        # (2026-09-07, Ola 271, P9B) Cada ciclo del supervisor deja también el estado de las
        # CLAVES de cada proveedor (var/medio/huella/agotada_hasta, jamás valores) para el
        # Mando y para que las demás olas vean qué clave toca sin recontar los archivos.
        try:
            d["claves"] = estado_claves()
        except Exception:
            pass
        _salud_guardar(d)
        FIN.wait(SONDEO_S)


def modelos_para(tid):
    """Rota la lista según el id de la tarea: reparte la carga entre proveedores."""
    i = sum(ord(c) for c in tid) % len(MODELOS)
    return MODELOS[i:] + MODELOS[:i]

def apto_para_tarea(modelo, t):
    """¿Puede este modelo escribir ESTA tarea? (2026-09-06, Ola 261)

    Dos motivos para excluirlo, ninguno es «el modelo es malo»:
      · llm7/gpt-oss escribió de verdad en la prueba pero con calidad baja: solo es apto
        si TODOS los archivos pedidos son Markdown (documentación); para código no sirve.
      · Un proveedor con cupo agotado hoy (sin_cupo) o enfriándose tras un 429 reciente
        no debe recibir una escritura nueva: se reintentaría en balde y se gastaría el
        tiempo de la tarea. La misma memoria de la Ola 261 que ya usan los revisores.
    """
    if modelo.split("/", 1)[1] == "gpt-oss" and modelo.startswith("llm7/"):
        archivos = [str(a) for a in (t.get("archivos") or [])]
        if not archivos or not all(a.strip().endswith(".md") for a in archivos):
            return False
    prov = proveedor_de(modelo)
    if sin_cupo(prov) or enfriandose(prov):
        return False
    return True

def dependencias_ok(t):
    """¿Están INTEGRADAS las dependencias duras de esta tarea? (2026-09-07, Ola 261)

    Antes el planificador solo esperaba a que la dependencia TERMINARA (estado final
    cualquiera): G3 declaraba `depende: ["G1", "J1"]`, J1 terminó «sin_cambios» (nunca se
    integró) y G3 se ejecutó igual, buscando un archivo que no existía en main. Ahora una
    dependencia cuenta solo en estado «commit». Devuelve (ok, [descripción de las malas]).
    Las dependencias que aún no tienen estado (no han terminado) aquí no bloquean: eso lo
    decide el planificador esperando; y las de `depende_opcional` nunca bloquean."""
    malas = []
    for d in (t.get("depende") or []):
        est = PROG.get(d, {}).get("estado")
        if est is not None and est != "commit":
            malas.append("%s (%s)" % (d, est))
    return (not malas, malas)


# revisores: (proveedor, modelo) — cada uno con su cupo; se prueba en orden
REVISORES = [
    ("xkiro", "qwen/qwen3.7-plus:free"),
    ("xkiro", "minimax/minimax-m2.7-highspeed:free"),  # se prueban en orden; los gratuitos de terceros primero, NIM se reserva para escribir
    ("llm7", "minimax-m2.7"),                          # sin clave, 10 req/min (itsfree.ai, 2026-09-05); con LLM7_API_KEY: deepseek-v4-flash, glm-5.3-flash…
    ("aihubmix", "coding-glm-5.3-free"),
    ("tokenrouter", "z-ai/glm-5.3-free"),
    ("aihubmix", "gemini-3.7-flash-free"),
    ("nim", "moonshotai/kimi-k3"),
    ("openrouter", "nvidia/nemotron-3-super-120b-a12b:free"),
    ("gemini", "gemini-2.5-flash-lite"),
    ("freetheai", "gpt-oss-120b"),                     # solo con FREETHEAI_API_KEY (Discord)
]
CUPOS_RPM = {"nim": 30, "openrouter": 15, "gemini": 12, "aihubmix": 20, "tokenrouter": 15, "xkiro": 25, "llm7": 8, "freetheai": 8}
CONCURRENCIA_OPENCODE = int(os.environ.get("STARSEED_CONCURRENCIA", "8"))  # techo; el freno real es la memoria

# ── utilidades ──────────────────────────────────────────────────────────────
def ahora(): return time.strftime("%Y-%m-%d %H:%M:%S")
def leer_env(*rutas):
    env = {}
    for r in rutas:
        try:
            for l in open(os.path.expanduser(r), encoding="utf-8"):
                l = l.strip()
                if l and not l.startswith("#") and "=" in l:
                    k, _, v = l.partition("="); env[k.strip()] = v.strip().strip('"').strip("'")
        except Exception: pass
    return env
ENV = leer_env(os.path.join(ROOT, ".env.local"), "~/.hermes/.env", "~/.starseed/env")

# ── capa de claves por medio (2026-09-07, Ola 271, P9) ────────────────────
# Pedido de Alex: «si se terminan los recursos de una API debes conseguir una del mismo
# proveedor de algún otro medio». Cada proveedor puede tener VARIAS claves repartidas
# entre los archivos de entorno de cada medio (el .env.local del repo, el de Hermes, el
# de ~/.starseed y los de las otras copias del repo en la Mac y la nube), con la
# convención de sufijos `NOMBRE`, `NOMBRE_2` … `NOMBRE_9`. Cuando una se agota (402,
# aviso de cuota o tres 429 seguidos en 10 min) se rota a la siguiente SIN parar.
# Los valores JAMÁS se escriben en logs, eventos ni JSON: solo el nombre de la variable,
# el medio (nombre corto del archivo) y una huella sha256 corta para distinguirlas.
CLAVES_POR_PROVEEDOR = {
    "nvidia":     ["NVIDIA_API_KEY", "NVIDIA_SHARED_KEY"],
    "xkiro":      ["XKIRO_API_KEY"],
    "aihubmix":   ["AIHUBMIX_API_KEY"],
    "tokenrouter":["TOKENROUTER_API_KEY"],
    "openrouter": ["OPENROUTER_API_KEY", "OPENROUTER_SHARED_KEY"],
    "gemini":     ["GEMINI_API_KEY", "GOOGLE_API_KEY", "NEXT_PUBLIC_GOOGLE_API_KEY"],
    "llm7":       ["LLM7_API_KEY"],
    "freetheai":  ["FREETHEAI_API_KEY"],
}
# En la flota el proveedor de NVIDIA se llama «nim», pero sus variables son NVIDIA_*.
_ALIAS_CLAVES = {"nim": "nvidia"}
# Archivos de entorno que se recorren POR SEPARADO (el último ya no pisa a los demás:
# cada medio conserva sus propias claves). Solo nombres de ruta; los valores nunca
# salen de estos archivos (viven con permisos 600).
RUTAS_ENV_CLAVES = [
    ("env.local-os",   os.path.join(ROOT, ".env.local")),
    ("hermes",         "~/.hermes/.env"),
    ("starseed",       "~/.starseed/env"),
    ("env.local-mac",  "~/Documents/starseed-os-main/.env.local"),
    ("env.local-nube", "~/starseed-system/.env.local"),
]


def _prov_claves(prov):
    """Normaliza el nombre del proveedor al del mapa de claves (nim → nvidia)."""
    return _ALIAS_CLAVES.get(prov, prov)


def _nombres_clave(prov):
    """Nombres de variable de un proveedor, con sus sufijos _2…_9 detrás de cada uno."""
    for base in CLAVES_POR_PROVEEDOR.get(_prov_claves(prov), []):
        yield base
        for n in range(2, 10):
            yield "%s_%d" % (base, n)


def _huella_clave(valor):
    """Identificador público de una clave: 8 hex de su sha256. Sirve para anotar en el
    JSON de salud QUÉ clave se agotó sin escribir jamás el valor."""
    return hashlib.sha256(valor.encode("utf-8", "ignore")).hexdigest()[:8]


def _leer_env_ruta(ruta):
    """Parsea UN archivo de entorno (igual que leer_env pero de una sola ruta)."""
    return leer_env(ruta)


def _claves_crudas(prov):
    """Todas las claves disponibles de un proveedor, en el orden de los archivos (y del
    entorno del proceso al final), deduplicadas por VALOR. Cada item:
    {var, medio, valor, huella}. Los duplicados exactos no cuentan como clave extra."""
    vistas = set()
    out = []
    for medio, ruta in RUTAS_ENV_CLAVES:
        for nombre in _nombres_clave(prov):
            v = _leer_env_ruta(ruta).get(nombre)
            if v and v not in vistas:
                vistas.add(v)
                out.append({"var": nombre, "medio": medio, "valor": v, "huella": _huella_clave(v)})
    for nombre in _nombres_clave(prov):                      # el proceso también es un medio
        v = os.environ.get(nombre)
        if v and v not in vistas:
            vistas.add(v)
            out.append({"var": nombre, "medio": "proceso", "valor": v, "huella": _huella_clave(v)})
    return out


def _clave_agotada_hasta(prov, huella):
    """Fecha (texto) hasta la que esta clave consta agotada, o None si está vigente."""
    ent = ((_salud().get(prov) or {}).get("claves_agotadas") or {}).get(huella)
    hasta = (ent or {}).get("hasta") or ""
    if not hasta:
        return None
    try:                                                    # agotamiento viejo ya no cuenta
        return hasta if time.strptime(hasta, "%Y-%m-%d %H:%M:%S") > time.localtime() else None
    except Exception:
        return None


def claves_de(prov):
    """Claves del proveedor, NO agotadas primero (en el orden de los archivos) y las
    agotadas al final, por si no queda otra que reintentarlas tras su enfriamiento."""
    crudas = _claves_crudas(prov)
    vivas = [c for c in crudas if not _clave_agotada_hasta(prov, c["huella"])]
    gastadas = [c for c in crudas if _clave_agotada_hasta(prov, c["huella"])]
    return vivas + gastadas


def clave_activa(prov):
    """La clave que toca usar AHORA: la primera cuya huella no está en claves_agotadas.
    None si no hay ninguna o todas están agotadas."""
    for c in _claves_crudas(prov):
        if not _clave_agotada_hasta(prov, c["huella"]):
            return c
    return None


def agotar_clave(prov, huella, motivo, tipo="cuota"):
    """Marca una clave concreta como agotada (402, aviso de cuota o racha de 429) y deja
    el relevo ya señalado. Solo cuando NO queda ninguna llama a marcar_sin_cupo: el
    pedido de Alex es gastar TODAS las claves del proveedor antes de darlo por caído.

    (2026-09-07, Ola 271, P9D) `tipo` ∈ {"429", "402", "cuota"} decide las HORAS de agotamiento
    (429 → 1 h; 402/cuota → 24 h) y se guarda en la entrada para que la sonda sepa de un vistazo
    cuáles puede volver a probar. Aviso único: si la huella YA consta agotada con un `hasta`
    futuro igual o más lejano, no se reescribe ni se emite evento; solo un motivo MÁS grave
    (402/cuota sobre 429, cuyo plazo es mayor) alarga la fecha y avisa una vez más."""
    horas = HORAS_AGOTAR.get(tipo, 24)
    claves = _claves_crudas(prov)
    cual = next((c for c in claves if c["huella"] == huella),
                {"var": "¿?", "medio": "¿?", "huella": huella})
    d = _salud()
    e = d.get(prov) or {}
    agotadas = e.get("claves_agotadas") or {}
    hasta_epoch = time.time() + horas * 3600
    hasta_txt = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(hasta_epoch))
    prev = agotadas.get(huella) or {}
    try:                                            # plazo ya vigente igual o más lejano: no repetir
        prev_epoch = time.mktime(time.strptime(prev.get("hasta") or "", "%Y-%m-%d %H:%M:%S"))
    except Exception:
        prev_epoch = 0
    # (2026-09-07, Ola 271, P9E, Tarea 3) La deduplicación NO se decide por los segundos del
    # `hasta` (cada llamada recalcula `ahora + horas` y un 429 milisegundos después siempre
    # daba un `hasta_epoch` un poco mayor → se reescribía y avisaba de nuevo). Se decide por la
    # GRAVEDAD del motivo: una huella ya agotada sigue vigente y solo se re-anuncia cuando el
    # nuevo tipo es más grave (402/cuota sobre 429). Un 429 repetido no mueve nada.
    if prev_epoch >= time.time() and _gravedad_tipo(tipo) <= _gravedad_tipo(prev.get("tipo") or "cuota"):
        return
    agotadas[huella] = {"hasta": hasta_txt, "motivo": str(motivo or "")[:140],
                        "var": cual["var"], "medio": cual["medio"], "tipo": tipo}
    e["claves_agotadas"] = agotadas
    d[prov] = e
    _salud_guardar(d)
    siguiente = clave_activa(prov)
    hasta_hhmm = hasta_txt[11:16]                    # «HH:MM» local para el aviso y el Mando
    if siguiente:
        evento("aviso", "", "clave %s (%s) de %s agotada: %s → paso a %s (%s), hasta %s" % (
            cual["var"], cual["medio"], prov, str(motivo)[:80], siguiente["var"], siguiente["medio"], hasta_hhmm))
    else:
        evento("aviso", "", "clave %s (%s) de %s agotada: %s → paso a ninguna; sin claves de este proveedor, hasta %s" % (
            cual["var"], cual["medio"], prov, str(motivo)[:80], hasta_hhmm))
        marcar_sin_cupo(prov, motivo, horas)      # todas agotadas: ahora sí, proveedor sin cupo


def estado_claves():
    """Resumen para el Mando y el JSON de salud (Ola 271, Tarea 3). Por proveedor: sus
    claves con var/medio/huella/agotada_hasta, cuál está activa y el sin_cupo del
    proveedor. NUNCA incluye valores: solo nombres de variable y huellas."""
    d = _salud()
    out = {}
    for prov in CLAVES_POR_PROVEEDOR:
        activa = clave_activa(prov)
        out[prov] = {
            "claves": [{"var": c["var"], "medio": c["medio"], "huella": c["huella"],
                        "agotada_hasta": _clave_agotada_hasta(prov, c["huella"])}
                       for c in _claves_crudas(prov)],
            "activa": (activa or {}).get("var"),
            "sin_cupo_hasta": (d.get(prov) or {}).get("sin_cupo_hasta"),
        }
    return out


def _clave_para(prov):
    """(2026-09-07, Ola 271, P9B) Puente entre la capa de claves y los consumidores
    antiguos: devuelve `clave_activa(prov)` si la capa conoce claves de este proveedor
    (entrada en CLAVES_POR_PROVEEDOR) y alguna está viva; en caso contrario None, para
    que el llamador caiga a la lógica heredada de `ENV.get(...)`. Así llamar_llm, las
    sondas y los catálogos rotan claves SIN tocar a los proveedores sin capa (pasarelas,
    llm7 sin token)."""
    if _prov_claves(prov) not in CLAVES_POR_PROVEEDOR:
        return None
    return clave_activa(prov)


RACHA_429 = {}        # huella -> deque de momentos de 429; 3 en 10 min = clave agotada


def _registrar_429_clave(huella):
    """Cuenta 429 POR CLAVE (no por proveedor): una clave con tres 429 seguidos en 10
    minutos se considera agotada y se rota; el resto del proveedor sigue disponible."""
    q = RACHA_429.setdefault(huella, collections.deque())
    t = time.time()
    while q and t - q[0] > 600:
        q.popleft()
    q.append(t)
    return len(q) >= 3


def _sync_opencode_clave(modelo):
    """(Tarea 2, escritores) opencode lee sus claves de «{env:VAR}» en
    ~/.config/opencode/opencode.json: si la clave ACTIVA del proveedor ya no es esa,
    se reescribe solo el nombre de la variable (nunca el valor) y se exporta en el
    entorno del proceso hijo. Devuelve el dict extra de entorno para entorno_hijo."""
    prov = modelo.split("/", 1)[0]
    kay = clave_activa(prov)
    if not kay:
        return {}
    extra = {kay["var"]: kay["valor"]}                 # el hijo la necesita en su entorno
    try:
        cfg = json.load(open(RUTA_OPENCODE_CFG, encoding="utf-8"))
        bloque = (cfg.get("provider") or {}).get(prov)
        api = ((bloque or {}).get("options") or {}).get("apiKey") or ""
        m = re.fullmatch(r"\{env:([A-Z0-9_]+)\}", api.strip())
        if m and m.group(1) != kay["var"]:
            bloque["options"]["apiKey"] = "{env:%s}" % kay["var"]   # solo el NOMBRE cambia
            with cerrojo("opencode-cfg", espera_aviso=9999):
                json.dump(cfg, open(RUTA_OPENCODE_CFG, "w", encoding="utf-8"),
                          ensure_ascii=False, indent=2)
            evento("aviso", "", "opencode pasa a usar %s (%s) para %s: la anterior estaba agotada" % (
                kay["var"], kay["medio"], prov))
    except Exception:
        pass              # sin config o proveedor nativo: el entorno extra ya basta
    return extra

# ── pasarelas OpenAI-compatibles declaradas por entorno (2026-09-05) ───────────
# Cualquier enrutador gratuito entra en la flota SIN tocar código —freellmapi en local
# (github.com/tashfeenahmed/freellmapi: 29 proveedores gratis tras un solo bearer, ~40 MB),
# NavyAI, una pasarela propia…— con cuatro variables en ~/.starseed/env (chmod 600):
#   STARSEED_PASARELA_<NOMBRE>_URL=http://127.0.0.1:3001/v1   base OpenAI-compatible (sin /chat/…)
#   STARSEED_PASARELA_<NOMBRE>_KEY=…                          bearer («sin-clave» si no exige)
#   STARSEED_PASARELA_<NOMBRE>_MODELOS=auto:fast,auto:smart   revisores en orden; el 1.º es la sonda
#   STARSEED_PASARELA_<NOMBRE>_RPM=20                         cupo por minuto (10 si falta)
# El proveedor se llama <nombre> en minúsculas (p. ej. freellmapi/auto:fast). Entra como REVISOR
# (los escritores siguen siendo los que opencode sabe usar) y el supervisor lo sondea como a los demás.
PASARELAS = {}
def _cargar_pasarelas():
    fuentes = dict(os.environ); fuentes.update(ENV)
    for k, v in list(fuentes.items()):
        m = re.match(r"^STARSEED_PASARELA_([A-Z0-9]+)_URL$", k)
        if not m or not v:
            continue
        nombre, pref = m.group(1).lower(), "STARSEED_PASARELA_" + m.group(1)
        g = lambda s, d=None: fuentes.get(pref + s) or d
        modelos = [x.strip() for x in (g("_MODELOS", "") or "").split(",") if x.strip()]
        try: rpm = int(g("_RPM", "10"))
        except ValueError: rpm = 10
        PASARELAS[nombre] = {"url": v.rstrip("/") + "/chat/completions", "key": g("_KEY") or "sin-clave", "modelos": modelos, "rpm": rpm}
        if modelos:
            SONDAS[nombre] = (modelos[0], (pref + "_URL",))
            for mo in modelos:
                if (nombre, mo) not in REVISORES:
                    REVISORES.append((nombre, mo))
        CUPOS_RPM[nombre] = rpm
_cargar_pasarelas()
RUTAS_BIN = [os.path.expanduser(x) for x in ("~/.npm-global/bin", "~/.opencode/bin", "/opt/homebrew/bin", "~/.local/bin", "/usr/local/bin", "~/.bun/bin", "~/.hermes/bin")]
def _bin(nombre):
    for d in RUTAS_BIN:
        c = os.path.join(d, nombre)
        if os.path.exists(c): return c
    return shutil.which(nombre) or nombre
OPENCODE = _bin("opencode"); HERMES = _bin("hermes")
ANON = ENV.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")

def entorno_hijo(extra=None):
    """Entorno para CUALQUIER proceso hijo: PATH con los binarios y las claves.
    Vive aparte de sh() porque opencode se lanza con Popen y también las necesita
    (saltárselo fue justo lo que provocó los «Unauthorized» de la ola 232)."""
    e = dict(os.environ); e.update(extra or {})
    e["PATH"] = ":".join(RUTAS_BIN) + ":" + e.get("PATH", "")
    # Claves para opencode ({env:NVIDIA_API_KEY} en ~/.config/opencode) y revisores: salen de
    # .env.local / ~/.hermes/.env, nunca del repo ni de los logs.
    for k, alt in (("NVIDIA_API_KEY", "NVIDIA_SHARED_KEY"), ("OPENROUTER_API_KEY", "OPENROUTER_SHARED_KEY"), ("GEMINI_API_KEY", "GOOGLE_API_KEY"), ("AIHUBMIX_API_KEY", "AIHUBMIX_API_KEY"), ("TOKENROUTER_API_KEY", "TOKENROUTER_API_KEY"),
                   ("XKIRO_API_KEY", "XKIRO_API_KEY")):
        v = ENV.get(k) or ENV.get(alt)
        if v and not e.get(k): e[k] = v
    return e


def sh(cmd, cwd=ROOT, timeout=120, env=None, log=None):
    e = entorno_hijo(env)
    try:
        p = subprocess.run(cmd, cwd=cwd, shell=isinstance(cmd, str), capture_output=True, text=True, timeout=timeout, env=e)
        out = (p.stdout or "") + (p.stderr or "")
    except subprocess.TimeoutExpired as ex:
        p = None; out = "TIMEOUT %ss\n%s" % (timeout, (ex.stdout or b"")[-2000:] if isinstance(ex.stdout, bytes) else (ex.stdout or ""))
    if log:
        with open(log, "a", encoding="utf-8") as f: f.write("\n$ %s\n%s\n" % (cmd if isinstance(cmd, str) else " ".join(cmd), out[-20000:]))
    return (p.returncode if p else 124), out

class Cupo:
    """Limitador req/min por proveedor (ventana deslizante)."""
    def __init__(self, rpm): self.rpm = rpm; self.ts = collections.deque(); self.lock = threading.Lock()
    def esperar(self):
        while True:
            with self.lock:
                t = time.time()
                while self.ts and t - self.ts[0] > 60: self.ts.popleft()
                if len(self.ts) < self.rpm: self.ts.append(t); return
                espera = 60 - (t - self.ts[0]) + 0.2
            time.sleep(max(0.2, espera))
FACTOR_CUPO = float(os.environ.get("STARSEED_CUPO_FACTOR", "1"))
CUPOS = {k: Cupo(max(2, int(v * FACTOR_CUPO))) for k, v in CUPOS_RPM.items()}
SEM_OPENCODE = threading.Semaphore(CONCURRENCIA_OPENCODE)
SEM_PESADO = threading.Semaphore(1)     # tsc / vitest: uno a la vez (RAM)
LOCK_INTEGRAR = threading.Lock()        # integración en main serializada
LOCK_ESTADO = threading.Lock()


# ── cerrojos ENTRE PROCESOS (varias olas a la vez sobre el mismo repo) ──────
CERROJOS = os.path.expanduser("~/.starseed/cerrojos")
os.makedirs(CERROJOS, exist_ok=True)


PESADO_MAX_EDAD_S = 30 * 60    # cerrojo pesado más viejo que esto = huérfano
PESADO_ESPERA_S = 20 * 60      # espera máxima por el turno de tsc
PESADO_REINTENTO_S = 2


def _dueno_pesado(ruta):
    """Lee el `dueno` del cerrojo-directorio pesado → (pid, epoch); (None, 0) si falta."""
    try:
        with open(os.path.join(ruta, "dueno"), encoding="utf-8") as f:
            partes = f.read().split()
        return (int(partes[0]), float(partes[1])) if len(partes) >= 2 else (None, 0)
    except Exception:
        return (None, 0)


def _pid_vivo(pid):
    try:
        if pid is None:
            return False
        os.kill(pid, 0)
        return True
    except OSError:
        return False
    except Exception:
        return True


def _limpiar_pesado_huerfano(ruta):
    """Borra un `pesado.lock` cuyo dueño ya no vive o que tiene más de 30 min.
    Sin esta limpieza, un orquestador (o tsc-turno.sh) matado a la fuerza dejaba el
    cerrojo puesto y TODAS las olas se bloqueaban hasta limpiarlo a mano (2026-09-07,
    Ola 261 — fallo real del intento anterior)."""
    if not os.path.isdir(ruta):
        return False
    pid, epoch = _dueno_pesado(ruta)
    motivo = None
    if pid is None:
        motivo = "dueño ilegible"
    elif not _pid_vivo(pid):
        motivo = "dueño muerto (pid %s)" % pid
    elif epoch and (time.time() - epoch) > PESADO_MAX_EDAD_S:
        motivo = "más de 30 min de antigüedad (pid %s)" % pid
    if not motivo:
        return False
    try:
        evento("aviso", "", "cerrojo huérfano eliminado: %s" % motivo)
    except Exception:
        pass
    shutil.rmtree(ruta, ignore_errors=True)
    return True


@contextlib.contextmanager
def cerrojo_pesado():
    """Cerrojo de tsc ENTRE PROCESOS como DIRECTORIO atómico con `dueno` (pid + epoch):
    el mismo formato que usa `scripts/enjambre/tsc-turno.sh`, para que agentes y
    orquestadores compitan por un único turno. Se libera siempre en `finally` y solo
    si el dueño sigue siendo este proceso (2026-09-07, Ola 261, P6b)."""
    ruta = os.path.join(CERROJOS, "pesado.lock")
    if os.path.isfile(ruta):
        try: os.remove(ruta)     # formato antiguo (flock sobre archivo): fuera
        except Exception: pass
    t0 = time.time()
    while True:
        _limpiar_pesado_huerfano(ruta)
        try:
            os.mkdir(ruta)
            break
        except FileExistsError:
            pass
        except Exception:
            break
        if time.time() - t0 > PESADO_ESPERA_S:
            # Espera agotada (el dueño no soltó): fuerza el turno, igual que el script.
            shutil.rmtree(ruta, ignore_errors=True)
            try: os.mkdir(ruta)
            except Exception: pass
            break
        time.sleep(PESADO_REINTENTO_S)
    with open(os.path.join(ruta, "dueno"), "w", encoding="utf-8") as f:
        f.write("%d %d" % (os.getpid(), time.time()))
    try:
        yield
    finally:
        pid, _ = _dueno_pesado(ruta)
        if pid == os.getpid():
            shutil.rmtree(ruta, ignore_errors=True)


@contextlib.contextmanager
def _cerrojo_flock(nombre, espera_aviso=60):
    """Cerrojo de archivo: serializa entre TODOS los orquestadores vivos."""
    ruta = os.path.join(CERROJOS, nombre + ".lock")
    f = open(ruta, "w")
    t0 = time.time()
    while True:
        try:
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
            break
        except BlockingIOError:
            if time.time() - t0 > espera_aviso:
                t0 = time.time()
            time.sleep(2)
    try:
        yield
    finally:
        try:
            fcntl.flock(f, fcntl.LOCK_UN)
            f.close()
        except Exception:
            pass


@contextlib.contextmanager
def cerrojo(nombre, espera_aviso=60):
    """Punto único de entrada. El cerrojo «pesado» (tsc/vitest) es un directorio con
    `dueno` compartido con tsc-turno.sh; el resto sigue siendo un flock de archivo."""
    if nombre == "pesado":
        with cerrojo_pesado():
            yield
    else:
        with _cerrojo_flock(nombre, espera_aviso=espera_aviso):
            yield

# ── eventos (supervisor) ────────────────────────────────────────────────────
# Cada evento lleva una CATEGORÍA gruesa además de su tipo fino, para que el Puente de
# Mando pueda agruparlos: escritura, verificación, revisión, integración, supervisión,
# proveedor, ola. Lo pidió Alex: «cada proceso debe ser etiquetado por tipo».
CATEGORIA_DE = {
    "inicio": "escritura", "aviso": "escritura", "sin_cambios": "escritura", "reenrutado": "escritura",
    "estancado": "supervision", "latido": "supervision",
    "proveedor": "proveedor", "proveedor_caido": "proveedor", "proveedor_recuperado": "proveedor",
    "verificando": "verificacion", "verificado": "verificacion", "verificacion_fallida": "verificacion",
    "bloqueante": "revision",
    "commit": "integracion", "conflicto": "integracion", "reintento": "integracion", "fallo": "integracion",
    "arranque": "ola", "cola_terminada": "ola", "informe": "ola", "paso": "paso", "reasignado": "supervision", "reasignada": "supervision",
    "esperando_aprobacion": "aprobacion", "aprobacion": "aprobacion", "rechazada": "aprobacion", "pendiente_aprobacion": "aprobacion",
}
PASOS_DIR = os.path.join(OLAS, "pasos")


def paso(tid, nombre, **datos):
    """Registro de los datos importantes de CADA paso de una tarea, en olas/pasos/<id>.jsonl:
    qué modelo escribió y cuánto tardó, cuántos errores de tsc había antes y después de la
    reparación, si pasaron los tests, quién revisó y qué dijo, con qué sha se integró."""
    fila = {"t": ahora(), "tarea": tid, "paso": nombre, **datos}
    try:
        os.makedirs(PASOS_DIR, exist_ok=True)
        with open(os.path.join(PASOS_DIR, tid + ".jsonl"), "a", encoding="utf-8") as f:
            f.write(json.dumps(fila, ensure_ascii=False) + "\n")
    except Exception:
        pass
    evento("paso", tid, "%s · %s" % (nombre, ", ".join("%s=%s" % (k, str(v)[:40]) for k, v in datos.items())), datos)


def _cadena_padres():
    """Nombres y líneas de comando de los procesos padre (hasta 6 niveles), sin lanzar nunca."""
    salida = []
    pid = os.getppid()
    for _ in range(6):
        if pid <= 1:
            break
        try:
            r = subprocess.run(["ps", "-o", "ppid=,command=", "-p", str(pid)], capture_output=True, text=True, timeout=3)
            linea = r.stdout.strip()
            if not linea:
                break
            ppid, cmd = linea.split(None, 1) if " " in linea else (linea, "")
            salida.append(cmd)
            pid = int(ppid)
        except Exception:
            break
    return salida


def medio_de_lanzamiento():
    """DESDE DÓNDE se están usando las APIs: quién lanzó este orquestador. Lo pidió Alex:
    «cada agente debe decir su servidor de desarrollo: hermes, claude, la terminal…».
    Orden: STARSEED_MEDIO explícito (mando, lanzador, cron…) → cadena de procesos padre →
    variables del entorno de cada medio → «terminal» si hay una consola humana."""
    explicito = (os.environ.get("STARSEED_MEDIO") or "").strip()
    if explicito:
        return explicito[:32]
    if os.environ.get("CLAUDECODE") or os.environ.get("CLAUDE_CODE_ENTRYPOINT"):
        return "claude"
    # Solo el EJECUTABLE de cada padre (primera palabra), no la línea entera: una orden de
    # Claude que mencione «hermes» en su texto no convierte el lanzamiento en «hermes».
    ejecutables = [c.split()[0].lower() if c.split() else "" for c in _cadena_padres()]
    if any("hermes" in e or e.endswith("/hermes") for e in ejecutables) or any("hermes_cli" in c or "hermes-agent" in c for c in _cadena_padres()):
        return "hermes"
    if any(e.endswith("/claude") or e == "claude" for e in ejecutables):
        return "claude"
    if any("opencode" in e for e in ejecutables):
        return "opencode"
    if os.environ.get("STARSEED_DONDE", "") == "nube":
        return "claude"          # el contenedor de Cowork solo lo pilota Claude
    if any(e.endswith("/cron") or e == "cron" or e == "launchd" or e.endswith("/launchd") for e in ejecutables):
        return "cron"
    if os.environ.get("TERM_PROGRAM") or os.environ.get("SSH_TTY") or sys.stdin.isatty():
        return "terminal"
    return "desconocido"


MEDIO = medio_de_lanzamiento()

IMPORTANTES = {"fallo", "conflicto", "bloqueante", "verificado", "verificacion_fallida", "cola_terminada", "esperando_aprobacion",
               "arranque", "reintento", "proveedor_caido", "proveedor_recuperado", "estancado"}
def evento(tipo, tarea, texto, datos=None):
    fila = {"t": ahora(), "quien": "enjambre", "tipo": tipo, "tarea": tarea, "texto": texto[:1500],
            "categoria": CATEGORIA_DE.get(tipo, "otro"), "donde": os.environ.get("STARSEED_DONDE", "nube")}
    try:
        with open(EVENTOS, "a", encoding="utf-8") as f: f.write(json.dumps(fila, ensure_ascii=False) + "\n")
    except Exception: pass
    print("[%s] %s %s · %s" % (fila["t"][11:], tipo, tarea or "-", texto[:160]), flush=True)
    if ANON:
        try:
            # La tabla no tiene columna de categoría: va dentro de `datos` para no migrar nada.
            cuerpo = json.dumps({"t": fila["t"], "quien": fila["quien"], "tipo": tipo, "tarea": tarea,
                                 "texto": fila["texto"],
                                 "datos": {**(datos or {}), "categoria": fila["categoria"], "donde": fila["donde"], "medio": MEDIO}},
                                ensure_ascii=False).encode()
            req = urllib.request.Request(SUPABASE_URL + "/rest/v1/relevo_eventos", data=cuerpo, method="POST",
                headers={"apikey": ANON, "Authorization": "Bearer " + ANON, "Content-Type": "application/json", "Prefer": "return=minimal"})
            urllib.request.urlopen(req, timeout=10).read()
        except Exception: pass
    if tipo in IMPORTANTES:
        try: subprocess.run([HERMES, "send", "-q", "StarSeed enjambre · %s %s: %s" % (tipo, tarea or "", texto[:300])], timeout=40, capture_output=True)
        except Exception: pass

def relevo_nota(texto):
    try: subprocess.run([RELEVO, "nota", "--de", "enjambre", texto[:900]], timeout=30, capture_output=True)
    except Exception: pass

# ── estado / progreso ───────────────────────────────────────────────────────
def cargar_prog():
    try: return json.load(open(PROG_JSON, encoding="utf-8"))
    except Exception: return {}
MIAS = set()             # tareas que ESTE orquestador gobierna (las de su cola/--solo)
def guardar_prog(prog):
    with LOCK_ESTADO, cerrojo("progreso"):
        # Otra ola puede haber escrito mientras tanto: se funde en vez de pisar. Y de las tareas
        # que NO son de este orquestador manda SIEMPRE el disco: el 2026-09-04 un orquestador
        # viejo pisaba una y otra vez el «commit» de VZ2 con su «fallo» en memoria.
        try:
            with open(PROG_JSON, encoding="utf-8") as f:
                disco = json.load(f)
            for k, v in disco.items():
                if k not in prog or (MIAS and k not in MIAS):
                    prog[k] = v
        except Exception:
            pass
        json.dump(prog, open(PROG_JSON, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        lines = ["# Progreso de las olas (enjambre gratuito)", "", "Actualizado: " + ahora()[:16], ""]
        for tid, t in prog.items():
            lines.append("- **%s** · %s · %s · %ss · %s" % (tid, t.get("estado"), t.get("modelo", ""), t.get("segundos", 0), t.get("nota", "")))
        open(PROG_MD, "w", encoding="utf-8").write("\n".join(lines) + "\n")
PROG = cargar_prog()
def set_estado(tid, **kw):
    PROG.setdefault(tid, {}).update(kw); guardar_prog(PROG)

# ── revisión cruzada por otro proveedor ─────────────────────────────────────
def llamar_llm(proveedor, modelo, prompt, timeout=120):
    """Una llamada de chat con ROTACIÓN DE CLAVE integrada (2026-09-07, Ola 271, P9B):

    la clave sale de la capa por medio (`clave_activa`); ante HTTP 402, contenido que sea
    aviso de cuota o el tercer 429 de la misma huella en 10 min se agota ESA clave
    (`agotar_clave`) y se reintenta UNA sola vez con la siguiente; solo cuando no queda
    ninguna, `agotar_clave` marca el proveedor entero como sin cupo. Los proveedores sin
    capa de claves (pasarelas, llm7 sin token) siguen el camino heredado de `ENV.get`.
    Los valores de clave jamás se escriben: solo nombres de variable y medios."""
    CUPOS[proveedor].esperar()

    def _peticion(kay):
        """Hace la petición con la clave `kay` (item de clave_activa o None). Devuelve
        (texto, agota, motivo): `agota` dice si el fallo (o el contenido) manda agotar ESTA
        clave, y `motivo` ∈ {"402", "429", "cuota", ""} distingue la RAZÓN para que
        `agotar_clave` aplique las horas justas (2026-09-07, Ola 271, P9D, Tarea 1):
        429 → 1 h; 402 y aviso de cuota → 24 h."""
        key = (kay or {}).get("valor")
        if proveedor == "gemini":
            key = key or ENV.get("GEMINI_API_KEY") or ENV.get("GOOGLE_API_KEY") or ENV.get("NEXT_PUBLIC_GOOGLE_API_KEY")
            if not key: raise RuntimeError("sin clave gemini")
            url = "https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s" % (modelo, key)
            cuerpo = {"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"temperature": 0.2, "maxOutputTokens": 1200}}
            req = urllib.request.Request(url, data=json.dumps(cuerpo).encode(), headers={"Content-Type": "application/json"})
            try:
                d = json.loads(urllib.request.urlopen(req, timeout=timeout).read())
            except urllib.error.HTTPError as e:
                # 429/402 de Gemini también alimentan la memoria de cupo; con clave conocida,
                # la huella decide si toca agotarla (3 × 429 en 10 min) o rotarla (402).
                m = str(e or "")
                if kay:
                    hu = kay["huella"]
                    if "402" in m:
                        return "", True, "402"
                    if "429" in m:
                        if _registrar_429_clave(hu):
                            return "", True, "429"
                        marcar_429(proveedor)
                    else:
                        _clasificar_fallo_cupo(proveedor, e)
                else:
                    _clasificar_fallo_cupo(proveedor, e)
                raise
            return "".join(p.get("text", "") for p in d["candidates"][0]["content"]["parts"]), False, ""
        modelo_real = modelo
        if proveedor == "xkiro":
            key = key or ENV.get("XKIRO_API_KEY"); url = "https://api.xkiro.com/v1/chat/completions"
        elif proveedor == "aihubmix":
            key = key or ENV.get("AIHUBMIX_API_KEY"); url = "https://aihubmix.com/v1/chat/completions"
        elif proveedor == "tokenrouter":
            # OJO: la base buena es .com (la .io exige claves `tr_` y rechaza estas).
            key = key or ENV.get("TOKENROUTER_API_KEY"); url = "https://api.tokenrouter.com/v1/chat/completions"
        elif proveedor == "openrouter":
            key = key or ENV.get("OPENROUTER_API_KEY"); url = "https://openrouter.ai/api/v1/chat/completions"
        elif proveedor == "llm7":
            # (2026-09-05, itsfree.ai) LLM7.io: OpenAI-compatible SIN clave, 10 req/min (40 con
            # token LLM7_API_KEY). Revisor de respaldo; sus nombres «claude/gpt-6» son etiquetas
            # de reventa: se usan solo modelos honestos (gpt-oss, deepseek-v4-flash, glm-5.3-flash…).
            key = key or ENV.get("LLM7_API_KEY") or "sin-clave"; url = "https://api.llm7.io/v1/chat/completions"
            if not key or key == "sin-clave":
                key = "sin-clave"
                if modelo_real not in ("gpt-oss", "minimax-m2.7"):
                    modelo_real = "minimax-m2.7"   # sin token solo sirven estos dos (probado el 2026-09-05)
        elif proveedor == "freetheai":
            # (2026-09-05, github.com/Free-The-Ai/free-ai) Pasarela gratuita OpenAI-compatible, 60+
            # modelos, clave por Discord (/signup + /checkin diario), 10-35 req/min, 250/día.
            key = key or ENV.get("FREETHEAI_API_KEY"); url = "https://api.freetheai.xyz/v1/chat/completions"
        elif proveedor in PASARELAS:
            key = PASARELAS[proveedor]["key"]; url = PASARELAS[proveedor]["url"]
        else:
            key = key or ENV.get("NVIDIA_API_KEY") or ENV.get("NVIDIA_SHARED_KEY"); url = "https://integrate.api.nvidia.com/v1/chat/completions"
        if not key: raise RuntimeError("sin clave " + proveedor)
        # 2500 y no 1200: los revisores «pensantes» (glm-5.3, qwen3.7) gastan el presupuesto en razonar
        # y devolvían el contenido vacío (tokenrouter con max_tokens=20 devolvía "" y finish=length).
        cuerpo = {"model": modelo_real, "messages": [{"role": "user", "content": prompt}], "temperature": 0.2, "max_tokens": 2500}
        # Sin User-Agent propio, el Cloudflare de xKiro devuelve 403 al urllib de Python.
        req = urllib.request.Request(url, data=json.dumps(cuerpo).encode(),
                                     headers={"Content-Type": "application/json", "Authorization": "Bearer " + key,
                                              "User-Agent": "starseed-enjambre/2 (+starseed-os)"})
        try:
            d = json.loads(urllib.request.urlopen(req, timeout=timeout).read())
        except Exception as e:
            USO_REAL[proveedor] = (time.time(), False)
            m = str(e or "")
            if kay:
                if "402" in m:
                    return "", True, "402"                           # 402: esta clave no paga más
                if "429" in m:
                    if _registrar_429_clave(kay["huella"]):
                        return "", True, "429"                       # 3 × 429 en 10 min: clave ahogada
                    marcar_429(proveedor)
                elif any(k in m.lower() for k in ("quota", "cuota", "daily limit", "rate limit exceeded for today")):
                    return "", True, "cuota"                         # límite diario explícito en el error
                else:
                    _clasificar_fallo_cupo(proveedor, e)
            else:
                _clasificar_fallo_cupo(proveedor, e)   # 402/cuota → 24 h sin intentarlo; 429 → 10 min de enfriamiento
            raise
        txt = d["choices"][0]["message"]["content"] or ""
        txt = re.sub(r" thinking.*? response", "", txt, flags=re.S).strip()
        return txt, False, ""

    kay = _clave_para(proveedor)
    txt, agota, motivo = _peticion(kay)
    if agota and kay:
        agotar_clave(proveedor, kay["huella"], "llamada: límite de la clave", tipo=(motivo or "cuota"))
        kay2 = clave_activa(proveedor)
        if kay2:
            # Reintento ÚNICO con la siguiente clave del mismo proveedor (nunca el valor, solo var/medio).
            evento("reenrutado", "", "clave %s (%s) agotada → %s (%s)" % (kay["var"], kay["medio"], kay2["var"], kay2["medio"]))
            txt, agota2, motivo2 = _peticion(kay2)
            if agota2:
                # La clave de relevo también pide cuota en su misma primera llamada: se
                # agota también y se aborta. Devolver "" aquí cuenta como respuesta válida
                # y el revisor archivaría basura (2026-09-07, Ola 271, P9C).
                agotar_clave(proveedor, kay2["huella"], "relevo también agotado", tipo=(motivo2 or "cuota"))
                USO_REAL[proveedor] = (time.time(), False)
                raise RuntimeError("sin claves útiles en %s: límite de la clave de relevo (%s)" % (proveedor, kay2["var"]))
        else:
            # (2026-09-07, Ola 271, P9C) BUG corregido: agotar_clave ya marcó sin_cupo al
            # agotar la última clave; seguir con txt="" y devolverlo como respuesta válida
            # hacía pasar un fracaso del proveedor por éxito. Ahora se lanza, con el nombre
            # de la variable (jamás el valor) para que quede constancia en el log.
            USO_REAL[proveedor] = (time.time(), False)
            raise RuntimeError("sin claves útiles en %s tras agotar %s (límite de la clave)" % (proveedor, kay["var"]))
    # Algunos proveedores devuelven 200 con un AVISO DE CUOTA como si fuera la respuesta (aihubmix
    # el 2026-09-04: «accounts that have not been recharged can only try 10 times»). Seis commits
    # se integraron con esa frase archivada como «revisión ok». Eso es un fallo del proveedor.
    if es_aviso_de_cuota(txt):
        USO_REAL[proveedor] = (time.time(), False)
        if kay:
            agotar_clave(proveedor, kay["huella"], "contenido: " + txt[:80])  # agota la clave; sin más claves, marca sin cupo ella misma
            kay2 = clave_activa(proveedor)
            if kay2:
                evento("reenrutado", "", "clave %s (%s) agotada → %s (%s)" % (kay["var"], kay["medio"], kay2["var"], kay2["medio"]))
                txt, _, _ = _peticion(kay2)
                if not es_aviso_de_cuota(txt):
                    USO_REAL[proveedor] = (time.time(), True)
                    return txt
        else:
            marcar_sin_cupo(proveedor, txt[:160])   # aviso de cuota en el contenido: 24 h sin intentarlo
        raise RuntimeError("cuota agotada en %s: %s" % (proveedor, txt[:90]))
    USO_REAL[proveedor] = (time.time(), True)
    return txt


AVISOS_CUOTA = ("prevent abuse of free resources", "have not been recharged", "free quota",
                "reached today's free-model token quota", "insufficient balance", "insufficient_quota",
                "quota exceeded", "exceeded your current quota", "rate limit exceeded", "credits exhausted")


def es_aviso_de_cuota(texto):
    """¿El «contenido» es en realidad un aviso de cuota/saldo del proveedor?"""
    t = (texto or "")[:400].lower()
    return len(t) < 400 and any(a in t for a in AVISOS_CUOTA)

def confirmar_bloqueo(tid, titulo, motivo, diff):
    """Tres de tres bloqueos de la Ola 233-234 eran falsos: el revisor no veía un archivo
    hermano, o inventaba una colisión de claves que el índice ya impedía. Antes de parar una
    tarea que YA pasó tsc y vitest, se pide una segunda opinión a OTRO proveedor, centrada en
    el defecto concreto. Si el segundo no lo ve, el bloqueo se degrada a aviso."""
    prompt = ("Un primer revisor ha marcado como BLOQUEANTE este cambio de StarSeed OS («%s») por este motivo:\n\n%s\n\n"
              "El commit YA pasó `tsc --noEmit` y `vitest` en la máquina, y el diff que ves es de UN commit: "
              "los archivos que importa y no aparecen aquí ya existen en main, creados por otra tarea de la misma ola.\n\n"
              "Pregunta única: ¿ese defecto concreto existe DE VERDAD en el código mostrado?\n"
              "Responde en la PRIMERA línea solo con SI o NO, y debajo una frase de justificación. "
              "Responde NO si el motivo es no poder ver un archivo, no poder verificar algo, el diff truncado "
              "o una suposición sobre código que no se muestra.\n\n%s") % (titulo, motivo[:600], diff[:12000])
    candidatos, saltados = candidatos_revision()   # sin caídos, sin cupo agotado ni enfriándose (Ola 261)
    if saltados:
        evento("aviso", tid, "revisores saltados: %s" % ", ".join(saltados))
    for prov, modelo in candidatos:
        try:
            r = llamar_llm(prov, modelo, prompt, timeout=90).strip()
            if not r:
                continue
            _revisor_respondio(prov, modelo)
            primera = r.splitlines()[0].strip().lower()
            return ("%s/%s" % (prov, modelo)), r, primera.startswith(("si", "sí", "yes"))
        except Exception:
            continue
    return "", "", True      # si nadie contesta, se respeta el bloqueo


def revisar(tid, titulo, diff, impacto="", alcance=""):
    prompt = ("Eres revisor senior de StarSeed OS (Next.js 15, React 19, TypeScript estricto, Supabase). Revisa este diff de la tarea «%s». "
              "Responde en español, máximo 220 palabras, con: **Riesgos reales** (numerados, solo los que de verdad rompan algo o abran un agujero), "
              "**Probar a mano en localhost** (3-4 pasos concretos) y **Seguimiento:** «no» si se puede fusionar tal cual, o «sí, bloqueante — <qué>» "
              "si NO debe fusionarse sin corregir. Sé exigente pero justo: estilo o nombres no son bloqueantes.\n\n"
              "IMPORTANTE sobre el formato: el diff puede llegar TRUNCADO, ves UN SOLO commit y no el "
              "repositorio entero. Los archivos que este commit importa y no aparecen aquí YA EXISTEN en "
              "main: los creó otra tarea de la misma ola, y el commit no habría llegado a ti sin compilar. "
              "NO marques «bloqueante» por falta de contexto, por no poder confirmar que compila o por pedir el diff completo: "
              "el commit ya pasó tsc y vitest antes de llegarte. Marca «bloqueante» SOLO por un defecto que veas en el código mostrado "
              "y que rompa el comportamiento, la seguridad o los datos. Si tu duda es de contexto, dila como riesgo y pon «Seguimiento: no».\n\n"
              + ("RADIO DE IMPACTO según el grafo del código (GitNexus): %s\nMira con más cuidado los flujos listados: son los que este diff toca.\n\n" % impacto if impacto else "")
              # Puerta de alcance (Ola 259, E2): si la pasada de compleción no bastó, el
              # revisor lo sabe y decide si el enunciado exigía de verdad esos archivos.
              + ("ALCANCE: %s. Si el enunciado exigía esos cambios, marca BLOQUEANTE y di qué falta.\n\n" % alcance if alcance else "")
              + "```diff\n%s\n```") % (titulo, diff[:22000])
    # Solo se intentan revisores vivos, con cupo y atemperados; el último que respondió va
    # primero. El 2026-09-06 xkiro (429) y aihubmix (cuota) se intentaban en cada revisión
    # y cada tarea perdía 5-12 minutos antes de llegar a un revisor que respondiera.
    candidatos, saltados = candidatos_revision()
    if saltados:
        evento("aviso", tid, "revisores saltados: %s" % ", ".join(saltados))
    intentos = 0
    for prov, modelo in candidatos:
        t_llamada = time.time()
        try:
            # 240 s: los revisores pensantes (glm-5.3 en tokenrouter) tardan más de 2 min con un
            # diff grande y se perdían por «read operation timed out», cayendo hasta Gemini.
            intentos += 1
            txt = llamar_llm(prov, modelo, prompt, timeout=240)
            if txt.strip():
                _revisor_respondio(prov, modelo)
                return prov + "/" + modelo, txt.strip(), {"segundos": int(time.time() - t_llamada), "intentos": intentos}
        except Exception as e:
            evento("aviso", tid, "revisor %s no disponible: %s" % (prov, str(e)[:120]))
    return "", "", {"segundos": 0, "intentos": intentos}

# ── trabajador ──────────────────────────────────────────────────────────────

# ── paralelismo elástico: tantos agentes como quepan en memoria ─────────────
MEMORIA_MINIMA_MB = int(os.environ.get("STARSEED_MEM_MIN_MB", "1400"))


def memoria_libre_mb():
    """Memoria realmente disponible. En Linux la da /proc/meminfo (MemAvailable); en macOS
    hay que sumar páginas libres e inactivas con vm_stat. El enjambre corre en las dos."""
    try:
        with open("/proc/meminfo", encoding="utf-8") as f:
            for linea in f:
                if linea.startswith("MemAvailable:"):
                    return int(int(linea.split()[1]) / 1024)
    except Exception:
        pass
    try:
        salida = subprocess.run(["vm_stat"], capture_output=True, text=True, timeout=10).stdout
        pagina, libres, inactivas = 4096, 0, 0
        for linea in salida.splitlines():
            if "page size of" in linea:
                pagina = int(linea.split("page size of")[1].split("bytes")[0].strip())
            if linea.startswith("Pages free:"):
                libres = int(linea.split(":")[1].strip().rstrip("."))
            if linea.startswith("Pages inactive:"):
                inactivas = int(linea.split(":")[1].strip().rstrip("."))
        return int((libres + inactivas) * pagina / 1048576)
    except Exception:
        return 99999


ESPERA_MEM_S = int(os.environ.get("STARSEED_ESPERA_MEM_S", "300"))


def esperar_memoria(tid, maximo_s=None):
    """No arranca un agente nuevo si la Mac va justa; espera a que se libere."""
    # Antes esperaba hasta 15 minutos: una tarea podía estar un cuarto de hora sin hacer
    # nada por RAM. Ahora espera 5 y arranca igual; el vigilante la corta si no escribe.
    maximo_s = maximo_s or ESPERA_MEM_S
    t0 = time.time()
    avisado = False
    while time.time() - t0 < maximo_s:
        libre = memoria_libre_mb()
        if libre >= MEMORIA_MINIMA_MB:
            return True
        if not avisado:
            evento("aviso", tid, "esperando memoria (%d MB libres, umbral %d MB)" % (libre, MEMORIA_MINIMA_MB))
            avisado = True
        try: latir(tid, "esperando-memoria", libre_mb=libre)
        except Exception: pass
        time.sleep(20)
    return True  # tras la espera máxima, se arranca igualmente


_ULTIMO_ARRANQUE_OPENCODE = 0.0
_LOCK_ARRANQUE_OPENCODE = threading.Lock()

def opencode(prompt, modelo, cwd, log, timeout=1500, tid=None):
    """Vuelca la salida AL VUELO en el log (con capture_output el archivo solo crecía al
    final, así que era imposible saber si el agente avanzaba). Queda registrado en
    PROCESOS para que el vigilante pueda cortarlo si se queda parado."""
    with SEM_OPENCODE:
        esperar_memoria(tid or os.path.basename(cwd))
        # Al salir de la espera hay que volver a marcar la fase real: si no, el latido
        # se queda diciendo «esperando-memoria» mientras el modelo ya está escribiendo.
        if tid:
            try: latir(tid, "escribiendo", modelo=modelo)
            except Exception: pass
        desde = os.path.getsize(log) if os.path.exists(log) else 0
        # Dos opencode arrancando en el mismo segundo se pelean por su SQLite («database is
        # locked», 05-09 X1): se escalonan los arranques al menos 4 s.
        global _ULTIMO_ARRANQUE_OPENCODE
        with _LOCK_ARRANQUE_OPENCODE:
            hueco = 4 - (time.time() - _ULTIMO_ARRANQUE_OPENCODE)
            if hueco > 0:
                time.sleep(hueco)
            _ULTIMO_ARRANQUE_OPENCODE = time.time()
        with open(log, "a", encoding="utf-8") as f:
            f.write("\n$ opencode run --model %s · %s\n" % (modelo, ahora()))
            f.flush()
            p = subprocess.Popen([OPENCODE, "run", prompt, "--model", modelo, "--dir", cwd],
                                 cwd=cwd, stdout=f, stderr=subprocess.STDOUT,
                                 # (2026-09-07, Ola 271, P9B) la clave ACTIVA del proveedor se
                                 # pasa al hijo y, si cambió, actualiza «{env:VAR}» de opencode.
                                 env=entorno_hijo(_sync_opencode_clave(modelo)))
        if tid:
            with PROCESOS_LOCK: PROCESOS[tid] = p
        try:
            rc = p.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            try: p.kill()
            except Exception: pass
            rc = 124
        finally:
            if tid:
                with PROCESOS_LOCK: PROCESOS.pop(tid, None)
        try:
            with open(log, encoding="utf-8", errors="replace") as f:
                f.seek(desde); salida = f.read()
        except Exception:
            salida = ""
        return rc, salida

def repo_es_python(cwd):
    """Puertas por tipo de repo (2026-09-06): el orquestador también trabaja sobre repos
    Python (astraura, backend 1.58). Sin `tsconfig.json` no hay tsc/vitest que valgan."""
    return not os.path.exists(os.path.join(cwd, "tsconfig.json"))

def tsc(cwd, log):
    if repo_es_python(cwd):
        # Compilación de los .py cambiados respecto a main (o todos los del diff sin commit).
        rc0, cambiados = sh("git diff --name-only main...HEAD; git diff --name-only", cwd=cwd, timeout=60)
        pys = sorted({l.strip() for l in cambiados.splitlines() if l.strip().endswith(".py") and os.path.exists(os.path.join(cwd, l.strip()))})
        if not pys:
            return 0, []
        with SEM_PESADO, cerrojo("pesado"):
            rc, out = sh(["python3", "-m", "py_compile"] + pys, cwd=cwd, timeout=300, log=log)
        errores = [l for l in out.splitlines() if l.strip()] if rc != 0 else []
        return rc, errores
    with SEM_PESADO, cerrojo("pesado"):
        rc, out = sh("npx tsc --noEmit --skipLibCheck", cwd=cwd, timeout=900, env=ENV_TSC, log=log)
    errores = [l for l in out.splitlines() if "error TS" in l]
    return rc, errores

def vitest(cwd, log):
    if repo_es_python(cwd):
        # pytest solo si el repo trae carpeta de tests propia (no las de terceros en BitNet/).
        candidatos = [d for d in ("tests", "backend/tests", "backend/app/tests") if os.path.isdir(os.path.join(cwd, d))]
        if not candidatos or not shutil.which("pytest"):
            return 0, "sin tests de pytest en este repo"
        with SEM_PESADO, cerrojo("pesado"):
            rc, out = sh(["python3", "-m", "pytest", "-q", "-x"] + candidatos, cwd=cwd, timeout=600, log=log)
        return rc, out
    with SEM_PESADO, cerrojo("pesado"):
        rc, out = sh("npx vitest run src/lib/__tests__", cwd=cwd, timeout=600, env=ENV_TSC, log=log)
        # (2026-09-07, Ola 271, P9C) Si la ola tocó scripts del enjambre, sus tests de
        # pytest también son puerta: P9B se integró (77f7bca) con dos fallos vivos en
        # scripts/enjambre porque aquí solo corría vitest. Se suma el rc: cualquier fallo
        # (vitest o pytest) tumba la puerta.
        _, archivos = sh("git diff --name-only main...HEAD", cwd=cwd, log=log)
        toca_enjambre = any((l or "").strip().startswith("scripts/enjambre/")
                            for l in (archivos or "").splitlines())
        if not toca_enjambre:
            return rc, out
        if not shutil.which("pytest"):
            return rc, out + "\n[puerta enjambre] sin pytest instalado: no se pudieron correr los tests del enjambre"
        rc2, out2 = sh(["python3", "-m", "pytest", "-q", "scripts/enjambre/"],
                       cwd=cwd, timeout=600, log=log)
        return rc or rc2, (out or "") + "\n[puerta enjambre]\n" + (out2 or "")

def _norma_ruta(ruta):
    """Normaliza una ruta para comparar (2026-09-07, Ola 261, P8): quita espacios y comillas
    de git, y deja './a.ts' como 'a.ts' (os.path.normpath). Los pedidos de la cola pueden
    venir con './' inicial, pero git nunca escribe rutas así: sin normalizar, el mismo
    archivo salía a la vez como faltante y como extra."""
    ruta = (ruta or "").strip().strip('"')
    if not ruta:
        return ""
    return os.path.normpath(ruta)

def alcance_tarea(t, wt):
    """Puerta de alcance (2026-09-06, Ola 259, E2): compara los archivos que la tarea pedía
    tocar (`t["archivos"]`) con los tocados de verdad en el worktree (commits sobre main +
    cambios sin commit). El 2026-09-06 se integraron DOS tareas a medias sin que el revisor
    se diera cuenta (V8/255 y N2/258). Función pura: solo recibe `wt` y lanza git a mano,
    para poder probarla desde un repo temporal sin montar el orquestador entero.
    Un pedido que ya existía y no cambió cuenta como faltante: no sabemos si debía cambiar
    y el modelo lo aclarará. `extra` ordenado para que el resultado sea determinista.
    (2026-09-07, Ola 261, P8) `-uall` + normalización: git status lista una carpeta nueva
    sin rastrear como «?? carpeta/» y los archivos pedidos dentro de ella contaban como
    faltantes aunque existieran (falso positivo que frenó a AP1 pidiendo visto bueno);
    además un pedido terminado en «/» es una carpeta: se cumple si se tocó algo dentro."""
    pedidos, carpetas, orden = [], [], []
    for crudo in (t.get("archivos") or []):
        texto = str(crudo).strip()
        es_carpeta = texto.endswith("/")
        norma = _norma_ruta(texto)
        if not norma:
            continue
        orden.append(norma)
        # Se guarda por separado porque la forma de cumplir es distinta: una carpeta se
        # cumple con cualquier archivo dentro; un archivo, tocándolo (o cayendo en la carpeta).
        (carpetas if es_carpeta else pedidos).append(norma)
    tocados = []
    def _git(*args):
        p = subprocess.run(["git"] + list(args), cwd=wt, capture_output=True, text=True, timeout=60)
        return (p.stdout or "")
    for l in _git("diff", "--name-only", "main...HEAD").splitlines():
        r = _norma_ruta(l)
        if r:
            tocados.append(r)
    # --porcelain -uall cuenta lo que aún no tiene commit y lista CADA archivo sin rastrear
    # (no la carpeta que los contiene). En renombrados «XY vieja -> nueva» se queda con nueva.
    for l in _git("status", "--porcelain", "-uall").splitlines():
        ruta = l[3:] if len(l) > 3 else ""
        if " -> " in ruta:
            ruta = ruta.split(" -> ")[-1]
        r = _norma_ruta(ruta)
        if r:
            tocados.append(r)
    tocados = sorted(set(tocados))

    def _en_carpeta_pedida(ruta):
        return any(ruta == c or ruta.startswith(c + "/") for c in carpetas)

    # Un pedido de archivo falta si no está tocado ni cae dentro de una carpeta pedida.
    faltan = [p for p in pedidos if p not in tocados and not _en_carpeta_pedida(p)]
    # Una carpeta pedida falta si ningún tocado vive dentro de ella.
    faltan += [c for c in carpetas
               if not any(t == c or t.startswith(c + "/") for t in tocados)]
    # extra: tocados fuera de todo lo pedido (archivo o carpeta), en orden determinista.
    pedidos_todos = set(pedidos) | set(carpetas)
    extra = [t for t in tocados
             if t not in pedidos_todos and not _en_carpeta_pedida(t)]
    return {"pedidos": orden, "tocados": tocados, "faltan": faltan, "extra": extra}


def worktree(tid):
    """Prepara el árbol de trabajo de la tarea. Una ola anterior que quedó en conflicto deja
    la carpeta atrás y `git worktree add` falla con «already exists»: por eso se poda el
    registro y, si hace falta, se borra la carpeta a mano antes de rendirse."""
    wt = os.path.join(WT_BASE, tid)
    os.makedirs(WT_BASE, exist_ok=True)
    sh(["git", "worktree", "remove", "--force", wt], timeout=60)
    sh(["git", "worktree", "prune"], timeout=30)
    sh(["git", "branch", "-D", "ola/" + tid], timeout=30)
    if os.path.isdir(wt):
        try: shutil.rmtree(wt)
        except Exception as e: raise RuntimeError("no pude limpiar %s: %s" % (wt, e))
    rc, out = sh(["git", "worktree", "add", "-b", "ola/" + tid, wt, "HEAD"], timeout=120)
    if rc != 0: raise RuntimeError("worktree: " + out[-300:])
    for enlace in ("node_modules", ".env.local"):
        src, dst = os.path.join(ROOT, enlace), os.path.join(wt, enlace)
        if os.path.exists(src) and not os.path.exists(dst): os.symlink(src, dst)
    return wt

def limpiar_worktree(tid, borrar_rama=True):
    wt = os.path.join(WT_BASE, tid)
    sh(["git", "worktree", "remove", "--force", wt], timeout=120)
    sh(["git", "worktree", "prune"], timeout=60)
    if borrar_rama: sh(["git", "branch", "-D", "ola/" + tid], timeout=30)


# ── contexto inteligente por tarea ──────────────────────────────────────────
# Cada agente debe entrar a su tarea sabiendo lo que un compañero sabría: qué
# documentos de memoria mandan en esa zona, qué habilidades y conexiones hay
# disponibles y qué se dijo la última vez que se tocaron esos archivos.
AREAS_CONTEXTO = [
    (("voz", "timbre", "tts", "hablar", "aurora/voz", "voz-starseed", "omnivoice"),
     "voz",
     ["memory/voces-catalogo.md", "src/lib/aurora/timbres.ts", "src/lib/aurora/voz-starseed/niveles.ts"],
     "Motor único «Voz StarSeed» con cuatro niveles (estudio/alta/ligera/mínima). Daemon local OmniVoice en 127.0.0.1:4500."),
    (("avatar", "movimiento", "kimodo", "gesto", "mundo"),
     "avatares",
     ["memory/avatares-movimiento.md", "src/lib/avatares/movimiento/niveles.ts", "src/lib/aurora/persona-avatar.ts"],
     "Movimiento con Kimodo (texto→movimiento, C++/GGML) por niveles; misma identidad de gesto en todos los equipos."),
    (("onboarding", "bienvenida", "rito", "perfil-inicial", "guia"),
     "rito",
     ["src/lib/onboarding/onboarding.ts", "src/components/onboarding/onboarding-wizard.tsx"],
     "El rito guarda su estado en la tabla onboarding_state (columnas skipped/skipped_at). Nunca dejar al usuario en bucle."),
    (("laboratorio", "genoma", "cuantiz"),
     "laboratorio",
     ["memory/laboratorio-astraura.md", "src/lib/laboratorio/genoma.ts"],
     "Genoma de nueve capas fásicas, del núcleo (ternaria 1,58 bits) al contexto. Nada del laboratorio escribe en el OS sin confirmación."),
    (("mando", "orquesta", "enjambre", "flota"),
     "mando",
     ["memory/orquestacion-economica.md", "memory/centro-mando.md"],
     "Las rutas /api/mando/* son SOLO locales (404 en producción) y jamás devuelven claves ni rutas del disco."),
    (("router", "astraura", "ai/", "provider", "nube"),
     "inteligencia",
     ["architecture/astraura-158-sistema-primario.md", "memory/orquestacion-economica.md"],
     "Gratis primero, relevo automático ante 429/402 y ningún proveedor debe agotarse. Nube: ASTRAURA_CLOUD_URL → túnel → fuentes libres."),
    (("social", "post", "feed", "profile", "pagina", "grupo", "entity"),
     "social",
     ["src/lib/social-posts.ts", "src/lib/os-social.ts"],
     "Contenido = entidad única: al compartir se referencia, no se duplica."),
    (("dock", "app-catalog", "packages", "layout"),
     "navegacion",
     ["CLAUDE.md"],
     "Regla dorada §11: una ruta nueva NO es accesible hasta registrarla en dock-config, app-catalog y packages."),
]


def _leer(ruta, limite=1200):
    try:
        with open(os.path.join(ROOT, ruta), encoding="utf-8") as f:
            return f.read()[:limite]
    except Exception:
        return ""


def _habilidades():
    """Habilidades y conexiones realmente disponibles en esta máquina."""
    hs = []
    for base in (os.path.join(ROOT, ".agent", "skills"), os.path.expanduser("~/.hermes/skills")):
        try:
            hs += [d for d in sorted(os.listdir(base)) if not d.startswith(".")]
        except Exception:
            pass
    return hs[:40]


def _revision_previa(archivos):
    """Lo que dijo el revisor la última vez que se tocaron estos archivos."""
    try:
        with open(REVIS, encoding="utf-8") as f:
            texto = f.read()
    except Exception:
        return ""
    trozos = texto.split("\n## ")
    for trozo in reversed(trozos):
        if any(os.path.basename(a) in trozo for a in archivos):
            return ("## " + trozo)[:1200]
    return ""


FUENTES_DIR = os.path.join(MEM, "fuentes")
# Palabras de la tarea → qué catálogo externo le sirve. Se le da al agente el PUNTERO y el
# comando de búsqueda, nunca el catálogo entero: son 1737 APIs y 3477 servidores MCP.
FUENTES_PISTAS = (
    (("api", "endpoint", "servicio", "datos", "clima", "mapa", "noticias", "traduc"),
     "apis-publicas.json (1737 APIs públicas gratuitas, catálogo public-apis, MIT)"),
    (("mcp", "conector", "connector", "herramienta", "plugin", "integra"),
     "mcp-servers.json (3477 servidores MCP, catálogo awesome-mcp-servers, MIT)"),
    (("agente", "agent", "rag", "memoria", "multiagent", "enjambre", "orquest"),
     "patrones de awesome-llm-apps (Apache-2.0): agentes siempre activos, equipos multiagente, "
     "voz, UI generativa, MCP y memoria — mira el patrón antes de inventarlo"),
    (("diseno", "diseño", "grafic", "cartel", "presentacion", "portada", "identidad", "figma"),
     "OpenDesign de nexu-io (Apache-2.0): prototipos, presentaciones, paneles, imágenes, documentos "
     "y motion MP4 desde el código; importa de Figma"),
    (("flujo", "workflow", "ola", "mando", "orquest"),
     "Langflow (MIT): flujos de agente visuales desplegables como API o servidor MCP"),
)


def _fuentes_externas(firma):
    """Cada agente debe saber qué catálogos externos tiene a mano para SU tarea."""
    utiles = [texto for claves, texto in FUENTES_PISTAS if any(c in firma for c in claves)]
    if not utiles or not os.path.isdir(FUENTES_DIR):
        return ""
    return ("FUENTES EXTERNAS para esta tarea (en starseed_memory_root/fuentes/, "
            "búscalas con `starseed-fuentes buscar <texto>` —acepta español—; "
            "antes de inventar un endpoint, un conector o un patrón, mira si ya existe):\n- "
            + "\n- ".join(utiles))


# ── GitNexus: grafo del código del repositorio (2026-09-05) ────────────────────
# github.com/abhigyanpatwari/GitNexus (PolyForm Noncommercial; uso interno de la fundación, no
# se empaqueta en el producto). `gitnexus analyze .` deja en .gitnexus/ (ignorado en git) un
# grafo con símbolos, llamadas, importaciones, comunidades y flujos de ejecución: 70.844 nodos y
# 177.834 aristas de este repo, 337 s y 2,2 GB de pico al indexar (solo en la nube; la Mac
# consulta el índice copiado). Las consultas tardan 1-2 s y no gastan tokens: a cada agente se le
# da el MAPA de su tarea en vez de que haga grep a ciegas, al revisor el radio de impacto real
# del diff, y al visto bueno humano los flujos que la rama toca.
GITNEXUS = None
for _d in RUTAS_BIN + os.environ.get("PATH", "").split(os.pathsep):
    _c = os.path.join(_d, "gitnexus")
    if os.path.isfile(_c) and os.access(_c, os.X_OK):
        GITNEXUS = _c
        break


def _gitnexus_listo():
    return bool(GITNEXUS) and os.path.exists(os.path.join(ROOT, ".gitnexus", "lbug"))


def _gitnexus(args, timeout=30):
    try:
        r = subprocess.run([GITNEXUS] + args, cwd=ROOT, capture_output=True, text=True, timeout=timeout,
                           env=dict(os.environ, NODE_OPTIONS="--max-old-space-size=1024"))
        return r.stdout or ""
    except Exception:
        return ""


def mapa_codigo(t):
    """Símbolos y flujos que el grafo liga a la tarea (≤ 12 líneas), para el prompt del agente."""
    if not _gitnexus_listo():
        return ""
    consulta = (t.get("titulo", "") + " " + " ".join(os.path.basename(a) for a in t.get("archivos", [])))[:200].strip()
    if not consulta:
        return ""
    out = _gitnexus(["query", consulta, "-l", "3"], timeout=30)
    try:
        j = json.loads(out[out.index("{"):])
    except Exception:
        return ""
    L = []
    for d in (j.get("definitions") or [])[:8]:
        if d.get("filePath") and d.get("startLine") is not None:
            L.append("- %s · %s:%s-%s" % (d.get("name"), d.get("filePath"), d.get("startLine"), d.get("endLine")))
        elif d.get("filePath"):
            L.append("- archivo · %s" % d.get("filePath"))
    for p in (j.get("processes") or [])[:3]:
        L.append("- flujo: %s (%s pasos)" % (p.get("summary"), p.get("step_count")))
    if not L:
        return ""
    return ("MAPA DEL CÓDIGO (grafo GitNexus del repositorio, úsalo antes de grep): símbolos y flujos ligados a esta tarea:\n"
            + "\n".join(L)
            + "\nComandos: `gitnexus context <símbolo>` (quién lo llama y a quién llama) · `gitnexus impact <símbolo>` "
              "(qué se rompe si lo cambias) · `gitnexus query \"<concepto>\"` · `gitnexus detect-changes` (qué flujos tocaste, antes de terminar).")


def impacto_cambios(base=None, limite=6):
    """Radio de impacto de un diff según el grafo: {archivos, simbolos, flujos, riesgo, detalle}.
    Sin `base` mira el working tree de ROOT; con `base` (rama ola/<id>) compara contra ella."""
    if not _gitnexus_listo():
        return None
    args = ["detect-changes", "-l", str(limite)] + (["-s", "compare", "-b", base] if base else [])
    out = _gitnexus(args, timeout=45)
    m = re.search(r"Changes: (\d+) files?, (\d+) symbols?", out)
    if not m:
        return None
    k = re.search(r"Affected processes: (\d+)", out)
    r = re.search(r"Risk level: (\w+)", out)
    return {"archivos": int(m.group(1)), "simbolos": int(m.group(2)), "flujos": int(k.group(1)) if k else 0,
            "riesgo": (r.group(1) if r else "?").lower(), "detalle": re.findall(r"^\s+• (.+)$", out, re.M)[:limite]}


def impacto_texto(imp):
    if not imp:
        return ""
    s = "%s archivos · %s símbolos · %s flujos afectados · riesgo %s" % (imp["archivos"], imp["simbolos"], imp["flujos"], imp["riesgo"])
    if imp["detalle"]:
        s += "\n- " + "\n- ".join(imp["detalle"])
    return s


def contexto_inteligente(t):
    """Memorias, habilidades, conexiones y avisos que ESA tarea necesita."""
    firma = (" ".join(t.get("archivos", [])) + " " + t.get("titulo", "") + " " + t.get("prompt", "")[:400]).lower()
    docs, avisos, areas = [], [], []
    for claves, area, documentos, aviso in AREAS_CONTEXTO:
        if any(c in firma for c in claves):
            areas.append(area)
            docs += documentos
            avisos.append(aviso)
    docs = list(dict.fromkeys(docs))[:6]

    L = []
    if areas:
        L.append("ÁREA: " + ", ".join(dict.fromkeys(areas)))
    if docs:
        L.append("LEE ANTES estos documentos del repositorio (mandan sobre tu criterio): " + ", ".join(docs))
    for a in dict.fromkeys(avisos):
        L.append("REGLA DEL ÁREA: " + a)

    hs = _habilidades()
    if hs:
        L.append("HABILIDADES disponibles en la máquina (carpetas .agent/skills y ~/.hermes/skills): " + ", ".join(hs[:18]))
    L.append(_fuentes_externas(firma))
    L.append(mapa_codigo(t))
    L.append(
        "CONEXIONES vivas: Supabase del OS `pqzdpmedcsgcedkvndzl` (cliente singleton en src/utils/supabase/client.ts) · "
        "OS publicado https://starseed-os.vercel.app · nube ligera https://astraura-nube.vercel.app · "
        "backend Astraura https://astraura-nube-334237619848.us-central1.run.app · daemon de voz 127.0.0.1:4500 · "
        "bus de eventos: tabla `relevo_eventos`. Nunca escribas claves: solo nombres de variables de entorno.")
    nota = _leer("starseed_memory_root/relevo/relevo.md", 700)
    if nota:
        trozo = nota.split("## Proyecto")[0].strip()
        if trozo:
            L.append("DÓNDE VAMOS (relevo):\n" + trozo[:600])
    rev = _revision_previa(t.get("archivos", []))
    if rev:
        L.append("ÚLTIMA REVISIÓN DE ESTOS ARCHIVOS (no repitas lo que ya se señaló):\n" + rev)
    return "\n\n".join(x for x in L if x)


def _guardar_contexto(t, contexto):
    """Deja constancia de QUÉ contexto recibió cada agente (área, documentos, reglas,
    habilidades, fuentes, conexiones, relevo, revisión previa) en olas/contextos/<id>.json,
    para que el Puente de Mando pueda enseñar «con qué trabajó este agente»."""
    try:
        carpeta = os.path.join(OLAS, "contextos")
        os.makedirs(carpeta, exist_ok=True)
        secciones = {}
        for bloque in contexto.split("\n\n"):
            # La cabeza es lo que va antes del primer «:» o «(» (MAPA DEL CÓDIGO, HABILIDADES,
            # FUENTES EXTERNAS… llevan paréntesis largos y antes se perdían por longitud).
            cabeza = re.split(r"[:(]", bloque, 1)[0].strip()[:60]
            if cabeza:
                secciones[cabeza] = bloque.split(":", 1)[-1].strip()[:1200]
        json.dump({"tarea": t["id"], "ola": t.get("ola", ""), "titulo": t.get("titulo", ""),
                   "archivos": t.get("archivos", []), "t": ahora(), "secciones": secciones,
                   "caracteres": len(contexto)},
                  open(os.path.join(carpeta, t["id"] + ".json"), "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)
    except Exception:
        pass


def contexto_tarea(t):
    inteligente = contexto_inteligente(t)
    _guardar_contexto(t, inteligente)
    return ("Trabajas en el repositorio StarSeed OS (Next.js 15 + React 19 + TypeScript estricto + Tailwind/shadcn + Supabase). "
            "Lee primero CLAUDE.md (secciones 8, 11 y 💠) y los archivos implicados. Reglas: sin `any`; cursor-pointer en lo clicable; "
            "español en textos de UI y comentarios (con acentos); no toques archivos ajenos a la tarea; no ejecutes git; deja los cambios "
            "escritos en disco sin pedir confirmación.\n\n"
            # Por qué (2026-09-07, Ola 261, P6b): 3 tsc simultáneos tumbaron el contenedor
            # (6,4 GB, load 21). El turno «pesado» lo comparten el orquestador y este script.
            "IMPORTANTE: NO ejecutes `npx tsc` directamente: usa `bash scripts/enjambre/tsc-turno.sh` "
            "(un solo tsc a la vez en la máquina, con caché por repo); tests: `npx vitest run <archivo o carpeta concreta>`, "
            "nunca la suite entera.\n\n"
            # Por qué se pide esto (2026-09-06, Ola 261): el log del orquestador solo crece cuando
            # TERMINA una llamada de herramienta; una única escritura de 300 líneas con un proveedor
            # lento (NIM, 5-10 tok/s) tarda 8-20 min sin dejar rastro y el vigilante la cortaba por
            # estancamiento — de ahí los «sin cambios» masivos de las tareas Q/J. Escrita por
            # trozos, cada tramo cierra rápido y el avance queda visible.
            "ESCRITURA POR TROZOS: crea cada archivo nuevo primero con su esqueleto (imports, tipos, firmas y `export`s, ≤ 60 líneas) "
            "y complétalo con ediciones sucesivas de ≤ 80 líneas cada una; nunca una sola escritura de más de 120 líneas; "
            "entre trozos no hace falta explicar nada.\n\n%s\n\nTAREA %s (%s) · %s\nArchivos implicados: %s\n\n%s") % (
            inteligente, t["id"], t.get("ola", ""), t.get("titulo", ""),
            ", ".join(t.get("archivos", [])), t["prompt"])

# ── latidos: qué está haciendo AHORA cada tarea ─────────────────────────────
LATIDOS = {}
LAT_JSON = os.path.join(OLAS, "latidos-%s.json" % (os.path.splitext(os.path.basename(sys.argv[1]))[0] if len(sys.argv) > 1 else "cola"))
# Órdenes por tarea que llegan DESDE FUERA mientras la ola corre (Puente de Mando → archivo
# `control-<cola>.json`; en la nube lo escribe el lanzador con la orden firmada del bus):
#   {"P2": {"accion": "reasignar", "modelo": "xkiro/…", "t": "…", "quien": "mando"},
#    "P3": {"accion": "soltar", "donde": "nube", …}}
# reasignar = cambia modelo/API conservando el flujo (escritura → tsc → tests → revisión →
# integración); soltar = la tarea se va a otro servidor: aquí se corta y no se vuelve a tocar.
CONTROL_JSON = os.path.join(OLAS, "control-%s.json" % (os.path.splitext(os.path.basename(sys.argv[1]))[0] if len(sys.argv) > 1 else "cola"))
REASIGNADOS = {}         # tarea -> modelo pedido desde fuera (se aplica en la próxima escritura)
SOLTADAS = set()         # tareas que se han ido a otro servidor: aquí ya no se ejecutan
APROBACIONES = {}        # tarea -> "aprobar" | "rechazar" (nodos de aprobación humana)
ESPERA_APROBACION_S = int(os.environ.get("STARSEED_ESPERA_APROBACION_S", str(6 * 3600)))
RUTA_OPENCODE_CFG = os.path.expanduser("~/.config/opencode/opencode.json")

def consumir_control():
    """Lee y VACÍA el archivo de control (una orden se atiende una sola vez)."""
    try:
        if not os.path.exists(CONTROL_JSON):
            return {}
        with cerrojo("control-" + os.path.basename(CONTROL_JSON), espera_aviso=9999):
            try:
                ordenes = json.load(open(CONTROL_JSON, encoding="utf-8"))
            except Exception:
                ordenes = {}
            try: os.remove(CONTROL_JSON)
            except Exception: pass
        return ordenes if isinstance(ordenes, dict) else {}
    except Exception:
        return {}

# Plantilla mínima del bloque `provider` de opencode para escritores nuevos (Ola 261).
# NUNCA claves aquí: «sin-clave» literal para llm7 y «{env:TOKENROUTER_API_KEY}» para
# tokenrouter — opencode expande {env:…} en tiempo de ejecución.
PROVEEDOR_OPENCODE_MINIMO = {
    "llm7": {"npm": "@ai-sdk/openai-compatible", "name": "LLM7 (sin clave)",
             "options": {"baseURL": "https://api.llm7.io/v1", "apiKey": "sin-clave"},
             "models": {}},
    "tokenrouter": {"npm": "@ai-sdk/openai-compatible", "name": "TokenRouter",
                    "options": {"baseURL": "https://api.tokenrouter.com/v1",
                                "apiKey": "{env:TOKENROUTER_API_KEY}"},
                    "models": {}},
}


def asegurar_modelo_opencode(modelo):
    """Un modelo pedido desde el Mando puede no estar en ~/.config/opencode/opencode.json
    (xkiro tiene 40 y solo hay 10 declarados): si el proveedor está, se añade el modelo
    para que `opencode run --model` lo acepte. Sin claves: la config las lee de {env:…}."""
    prov, _, nombre = modelo.partition("/")
    if not prov or not nombre:
        return False
    try:
        cfg = json.load(open(RUTA_OPENCODE_CFG, encoding="utf-8"))
    except Exception:
        return prov in ("openrouter", "google")   # proveedores nativos de opencode
    provs = cfg.get("provider") or {}
    if prov not in provs:
        if prov in PROVEEDOR_OPENCODE_MINIMO:
            # Bloque nuevo del proveedor (2026-09-06, Ola 261): la Mac no tenía declarado llm7
            # y cualquier modelo suyo moría en silencio. Las claves jamás se escriben aquí:
            # siempre con la sintaxis {env:VARIABLE} de opencode, literal.
            provs[prov] = json.loads(json.dumps(PROVEEDOR_OPENCODE_MINIMO[prov]))  # copia: no mutar la plantilla
            cfg["provider"] = provs
        else:
            return prov in ("openrouter", "google")
    modelos = provs[prov].setdefault("models", {})
    if nombre in modelos:
        return True
    modelos[nombre] = {"name": nombre.split("/")[-1]}
    try:
        with cerrojo("opencode-cfg", espera_aviso=9999):
            json.dump(cfg, open(RUTA_OPENCODE_CFG, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        return True
    except Exception:
        return False

def atender_control():
    """Aplica las órdenes externas. Lo llama el vigilante cada 20 s."""
    for tid, orden in consumir_control().items():
        if not isinstance(orden, dict) or tid not in MIAS:
            continue
        accion = str(orden.get("accion") or "reasignar")
        with PROCESOS_LOCK: p = PROCESOS.get(tid)
        with LOCK_ESTADO: fase = (LATIDOS.get(tid) or {}).get("fase")
        if accion in ("aprobar", "rechazar"):
            APROBACIONES[tid] = accion
            evento("aprobacion", tid, "%s desde el Mando (%s)" % ("aprobada" if accion == "aprobar" else "rechazada", str(orden.get("quien") or "mando")), datos={"decision": accion})
            continue
        if accion == "soltar":
            SOLTADAS.add(tid)
            donde = str(orden.get("donde") or "otro servidor")
            if p and p.poll() is None:
                CORTADOS.add(tid)
                try: p.kill()
                except Exception: pass
            set_estado(tid, estado="reasignada", nota="movida a %s desde el Mando" % donde)
            evento("reasignada", tid, "se va a %s: aquí se corta y no se vuelve a ejecutar" % donde, datos={"donde_nuevo": donde})
            continue
        modelo = str(orden.get("modelo") or "").strip()
        if not modelo or "/" not in modelo:
            continue
        if not asegurar_modelo_opencode(modelo):
            evento("aviso", tid, "no puedo usar %s aquí (proveedor sin configurar en opencode)" % modelo)
            continue
        REASIGNADOS[tid] = modelo
        if fase == "escribiendo" and p and p.poll() is None:
            CORTADOS.add(tid)
            try: p.kill()
            except Exception: pass
            evento("reasignado", tid, "cambio a %s pedido desde el Mando → corto la escritura actual y sigo el mismo flujo con él" % modelo, datos={"modelo": modelo})
        elif fase in (None, "hecho"):
            evento("reasignado", tid, "empezará con %s (pedido desde el Mando)" % modelo, datos={"modelo": modelo})
        else:
            evento("reasignado", tid, "anotado %s: se usará en la próxima escritura (ahora está en %s)" % (modelo, fase), datos={"modelo": modelo})
# Dos umbrales muy distintos, y la diferencia importa:
#  · ARRANQUE_S: si no ha escrito NI UNA línea, no arrancó (proveedor caído, modelo colgado).
#  · ESTANCADO_S: ya escribió, así que está trabajando. Un agente que acaba de leer un archivo
#    de 1300 líneas tarda minutos en su siguiente turno: cortarlo a los 7 min era MI error, y
#    dejaba tareas grandes en un bucle eterno de cortes y reintentos (LMAPA, LCOMPA, L8).
ARRANQUE_S = int(os.environ.get("STARSEED_ARRANQUE_S", "120"))
ESPERA_429_S = int(os.environ.get("STARSEED_ESPERA_429_S", "75"))        # 429: esperar y reintentar el mismo modelo
ESPERA_PROVEEDOR_S = int(os.environ.get("STARSEED_ESPERA_PROVEEDOR_S", "2700"))  # todo caído: esperar hasta 45 min
# Tope de UNA llamada de escritura de opencode (2026-09-06, Ola 261): NIM iba a 5-10 tok/s y
# un archivo de 300 líneas tardaba 8-20 min; el corte fijo de 1500 s mataba escrituras largas
# legítimas. Ahora se configura y también sirve de base al umbral de estancamiento.
ESCRITURA_S = int(os.environ.get("STARSEED_ESCRITURA_S", "1500"))
ESTANCADO_S = int(os.environ.get("STARSEED_ESTANCADO_S", str(max(900, ESCRITURA_S // 2))))   # sin escribir nada = parada; nunca menos que media escritura
LATIDO_S = int(os.environ.get("STARSEED_LATIDO_S", "120"))         # cada cuánto se publica al bus

def _volcar_latidos():
    try:
        with cerrojo("latidos-" + os.path.basename(LAT_JSON), espera_aviso=9999):
            json.dump({"t": ahora(), "cola": os.path.basename(sys.argv[1]) if len(sys.argv) > 1 else "",
                       "medio": MEDIO, "donde": os.environ.get("STARSEED_DONDE", "nube"),
                       "tareas": LATIDOS}, open(LAT_JSON, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    except Exception:
        pass

def latir(tid, fase, **kw):
    """Marca en qué fase está una tarea. Cambiar de fase reinicia el reloj de estancamiento."""
    with LOCK_ESTADO:
        d = LATIDOS.setdefault(tid, {})
        if d.get("fase") != fase:
            try: base = os.path.getsize(os.path.join(LOGS, tid + ".log"))
            except Exception: base = 0
            # `base` es el tamaño al empezar la fase: sin él no se distingue «escribió algo»
            # de «el log ya venía lleno de una ola anterior».
            d["desde"] = time.time(); d["avance"] = time.time(); d["bytes"] = base; d["base"] = base
        d["fase"] = fase; d["t"] = ahora(); d.update(kw)
    _volcar_latidos()

# Ventana de contexto por modelo (del catálogo de cada proveedor, 2026-09-04). Aproximada.
CONTEXTO_DE = {
    "moonshotai/kimi-k3": 262144, "deepseek-ai/deepseek-v4-flash-0731": 131072,
    "deepseek-ai/deepseek-v4-pro-0813": 131072, "qwen/qwen3-coder-plus:free": 1048576,
    "minimax/minimax-m3:free": 1000000, "qwen/qwen3.8-max:free": 1000000,
    "deepseek/deepseek-v4-pro": 1048576, "mistralai/devstral-medium": 256000,
}
RUTA_OPENCODE_DB = os.path.expanduser("~/.local/share/opencode/opencode.db")


def tokens_por_tarea():
    """Tokens REALES que ha gastado cada tarea, leídos de la base de opencode: cada corrida es
    una `session` cuyo `directory` es el worktree de la tarea, y cada mensaje del asistente
    trae {input, output, reasoning, cache}. Nada de estimar por bytes."""
    fuera = {}
    try:
        import sqlite3
        c = sqlite3.connect("file:%s?mode=ro" % RUTA_OPENCODE_DB, uri=True, timeout=2)
        dirs = {sid: (d or "") for sid, d in c.execute("select id, directory from session")}
        for sid, data in c.execute("select session_id, data from message"):
            wt = dirs.get(sid, "")
            if WT_BASE not in wt:
                continue
            tid = wt.rstrip("/").rsplit("/", 1)[-1]
            try:
                d = json.loads(data)
            except Exception:
                continue
            if d.get("role") != "assistant":
                continue
            tk = d.get("tokens") or {}
            e = fuera.setdefault(tid, {"entrada": 0, "salida": 0, "razonamiento": 0, "cacheLeida": 0, "llamadas": 0, "modelos": {}})
            e["entrada"] += int(tk.get("input") or 0); e["salida"] += int(tk.get("output") or 0)
            e["razonamiento"] += int(tk.get("reasoning") or 0)
            e["cacheLeida"] += int((tk.get("cache") or {}).get("read") or 0)
            e["llamadas"] += 1
            m = "%s/%s" % (d.get("providerID", "?"), d.get("modelID", "?"))
            e["modelos"][m] = e["modelos"].get(m, 0) + int(tk.get("input") or 0) + int(tk.get("output") or 0)
        c.close()
    except Exception:
        pass
    return fuera


def foto_enjambre(vivas_txt):
    """La foto completa que viaja en cada latido al bus: lo que ve el Puente de Mando de
    CUALQUIER máquina, no solo de la que tiene los archivos delante."""
    ahora_s = time.time()
    tokens = tokens_por_tarea()
    tareas = []
    for tid, d in list(LATIDOS.items()):
        if d.get("fase") in (None, "hecho"):
            continue
        modelo = d.get("modelo") or ""
        try: bytes_log = os.path.getsize(os.path.join(LOGS, tid + ".log"))
        except Exception: bytes_log = 0
        tk = tokens.get(tid, {})
        tareas.append({
            "id": tid, "fase": d.get("fase"), "modelo": modelo, "proveedor": proveedor_de(modelo) if modelo else "",
            "ventana": CONTEXTO_DE.get(modelo.split("/", 1)[1] if "/" in modelo else modelo),
            "minutos": int((ahora_s - d.get("desde", ahora_s)) / 60),
            "quietoS": int(ahora_s - d.get("avance", ahora_s)), "bytesLog": bytes_log,
            "tokens": tk, "intento": d.get("intento", 1), "medio": MEDIO,
        })
    salud = _salud()
    return {
        "cola": os.path.basename(sys.argv[1]) if len(sys.argv) > 1 else "",
        "donde": os.environ.get("STARSEED_DONDE", "nube"),
        "medio": MEDIO,
        "tareas": tareas,
        # «completando» pinta como «escribiendo» en el Mando: es una escritura de alcance.
        "agentesActivos": len([t for t in tareas if t["fase"] in ("escribiendo", "completando")]),
        "proveedores": {p: {"estado": (salud.get(p) or {}).get("estado", "vivo"),
                            "llamadasMin": len(CUPOS[p].ts), "rpm": CUPOS[p].rpm} for p in CUPOS},
        "memoriaMb": memoria_libre_mb(),
        "integradas": sum(1 for v in PROG.values() if v.get("estado") == "commit"),
        "resumen": vivas_txt,
    }


def _barrer_tsc_huerfanos():
    """Cada 60 s: mata `node …/bin/tsc` huérfanos (padre muerto o > 20 min) y limpia un
    `pesado.lock` con dueño muerto (2026-09-07, Ola 261, P6b). Por qué: un opencode
    cortado por el vigilante puede dejar su `npx tsc` colgado comiendo 3-5 GB y
    bloqueando el turno del resto de la máquina."""
    try:
        p = subprocess.run(["ps", "-eo", "pid,ppid,etimes,args"],
                           capture_output=True, text=True, timeout=15)
        ahora_pid = os.getpid()
        for linea in (p.stdout or "").splitlines():
            if "bin/tsc" not in linea and not linea.strip().endswith(" tsc"):
                continue
            partes = linea.split(None, 3)
            if len(partes) < 4:
                continue
            try:
                pid, ppid, etimes = int(partes[0]), int(partes[1]), int(partes[2])
            except ValueError:
                continue
            if pid == ahora_pid:
                continue
            if not _pid_vivo(ppid) or etimes > 20 * 60:
                try:
                    evento("aviso", "", "tsc huérfano eliminado (pid %d, %d min)" % (pid, etimes // 60))
                    os.kill(pid, signal.SIGKILL)
                except Exception:
                    pass
    except Exception:
        pass
    try:
        if _limpiar_pesado_huerfano(os.path.join(CERROJOS, "pesado.lock")):
            pass  # la propia limpieza ya anota el aviso
    except Exception:
        pass


def vigilante():
    """Comprueba CADA 20 s que las tareas activas avanzan de verdad, en vez de descubrir
    al final que una nunca arrancó. Si una lleva ESTANCADO_S sin escribir una sola línea,
    corta ese opencode y el bucle de la tarea pasa solo al siguiente modelo."""
    ultimo_bus = 0.0
    ultimo_barrido = 0.0
    while not FIN.is_set():
        FIN.wait(20)
        t_ciclo = time.time()
        if t_ciclo - ultimo_barrido >= 60:
            ultimo_barrido = t_ciclo
            try: _barrer_tsc_huerfanos()
            except Exception: pass
        try: atender_control()
        except Exception: pass
        t = time.time(); vivas = []
        for tid, d in list(LATIDOS.items()):
            fase = d.get("fase")
            if fase in (None, "hecho"): continue
            try: bytes_log = os.path.getsize(os.path.join(LOGS, tid + ".log"))
            except Exception: bytes_log = 0
            if bytes_log > d.get("bytes", 0):
                d["bytes"] = bytes_log; d["avance"] = t
            quieto = int(t - d.get("avance", t))
            vivas.append("%s %s%s %dm" % (tid, fase,
                         "/" + (d.get("modelo") or "").split("/")[-1] if d.get("modelo") else "",
                         int((t - d.get("desde", t)) / 60)))
            escrito = bytes_log - d.get("base", 0)
            # «completando» (puerta de alcance, Ola 259) es escritura: mismo trato por si se
            # cuelga y misma pintura en el Mando (cuenta como agente escribiendo).
            if fase in ("escribiendo", "completando") and escrito <= 0 and (t - d.get("desde", t)) > ARRANQUE_S:
                with PROCESOS_LOCK: p = PROCESOS.get(tid)
                d["desde"] = t; d["avance"] = t
                if p and p.poll() is None:
                    evento("estancado", tid, "%s no ha escrito ni una línea en %d s → lo corto y reenruto a otro proveedor"
                           % (d.get("modelo", "?"), ARRANQUE_S))
                    CORTADOS.add(tid)
                    try: p.kill()
                    except Exception: pass
                continue
            if fase in ("escribiendo", "completando") and quieto > ESTANCADO_S:
                with PROCESOS_LOCK: p = PROCESOS.get(tid)
                d["avance"] = t
                if p and p.poll() is None:
                    evento("estancado", tid, "%d min sin una sola línea con %s → lo corto y pruebo el siguiente modelo"
                           % (quieto // 60, d.get("modelo", "?")))
                    CORTADOS.add(tid)
                    try: p.kill()
                    except Exception: pass
        _volcar_latidos()
        if t - ultimo_bus >= LATIDO_S:
            ultimo_bus = t
            hechas = sum(1 for v in PROG.values() if v.get("estado") == "commit")
            texto_latido = "%s · %d integradas" % (" | ".join(vivas) or "sin tareas activas", hechas)
            try:
                evento("latido", "", texto_latido, datos=foto_enjambre(" | ".join(vivas)))
            except Exception:
                evento("latido", "", texto_latido)

def _anotar_fallido(tid, modelo):
    """Deja constancia en progreso.json de qué modelo NO funcionó en esta tarea, para que un
    reintento —en esta ola o en otra— no vuelva a empezar por él."""
    prev = list(PROG.get(tid, {}).get("modelos_fallidos") or [])
    if modelo not in prev:
        set_estado(tid, modelos_fallidos=(prev + [modelo])[-6:])


def debe_pedir_visto_bueno(bloqueante, faltan, aprobacion_pedida, argv):
    """(2026-09-06, Ola 261, P4) Decide si la rama pide visto bueno humano antes de integrar.

    Un bloqueo confirmado por segunda opinión o un alcance incompleto NO se integran solos
    (antes de esta ola, un bloqueo confirmado como B2 o Q1 se fusionaba igual en main): la rama
    queda lista y pasa al flujo `esperando_aprobacion`. La bandera `--integrar-bloqueantes`
    recupera el comportamiento antiguo para cuando Alex decide forzarlo a mano.
    Devuelve (True, motivo) o (False, ""). Función pura: la testea test_bloqueo.py.
    """
    if "--integrar-bloqueantes" in (argv or []):
        return False, ""
    if bloqueante:
        return True, "revisión bloqueante confirmada"
    if faltan:
        return True, "alcance incompleto: faltan %s" % ", ".join(list(faltan)[:8])
    if aprobacion_pedida:
        return True, "pedido por la cola (--aprobacion / STARSEED_APROBACION / aprobacion en la tarea)"
    return False, ""


def ejecutar(t, intento=1):
    tid = t["id"]; t0 = time.time()
    os.makedirs(LOGS, exist_ok=True); log = os.path.join(LOGS, tid + ".log")
    set_estado(tid, estado="en_curso", modelo="", segundos=0, nota="intento %d" % intento)
    evento("inicio", tid, t.get("titulo", ""))
    # --reanudar: si el orquestador murió con la tarea ya escrita (worktree con cambios), no se
    # vuelve a escribir desde cero —se pierden 20 minutos de trabajo—: se salta a las puertas.
    reanudada = False
    wt_prev = os.path.join(WT_BASE, tid)
    if "--reanudar" in sys.argv and os.path.isdir(wt_prev):
        _, st_prev = sh(["git", "status", "--porcelain"], cwd=wt_prev, timeout=30)
        if st_prev.strip():
            wt = wt_prev; reanudada = True
            evento("aviso", tid, "reanudada: el worktree ya tenía %d archivos cambiados; salto a tsc" % len(st_prev.splitlines()))
    if not reanudada:
        try:
            wt = worktree(tid)
        except Exception as e:
            set_estado(tid, estado="fallo", nota=str(e)[:200]); evento("fallo", tid, "worktree: " + str(e)[:200]); return
    fallidos = list(PROG.get(tid, {}).get("modelos_fallidos") or [])
    base = [m for m in modelos_para(tid) if m not in MUERTOS and proveedor_vivo(proveedor_de(m)) and apto_para_tarea(m, t)]
    if fallidos:
        # Los que ya se colgaron o no tocaron nada en esta tarea, al final de la cola.
        base = [m for m in base if m not in fallidos] + [m for m in base if m in fallidos]
        evento("aviso", tid, "empiezo por otro modelo: %s ya falló aquí antes" % ", ".join(x.split("/")[-1] for x in fallidos[:3]))
    # Los modelos de proveedores caídos NO se descartan: se apartan y se espera a que vuelvan.
    # (El 2026-09-04, VZ2: xkiro sin cuota diaria y nim con «too many requests» → la tarea se
    # dio por fallida en 2 segundos sin que ningún modelo llegara a intentarlo.)
    apartados = [m for m in modelos_para(tid) if m not in MUERTOS and apto_para_tarea(m, t) and not proveedor_vivo(proveedor_de(m))]
    if tid in REASIGNADOS:
        t = dict(t); t["modelo"] = REASIGNADOS.pop(tid)
    if t.get("modelo"):
        # Modelo pedido expresamente: que conste en el latido y que su proveedor se revalide
        # antes de apartarlo por un dato de salud viejo.
        asegurar_modelo_opencode(t["modelo"])
        if revalidar_proveedor(proveedor_de(t["modelo"])):
            apartados = [m for m in apartados if m != t["modelo"]]
        elif t["modelo"] not in apartados:
            apartados.append(t["modelo"])
    modelos = ([t["modelo"]] + [m for m in base if m != t.get("modelo")]) if t.get("modelo") else base
    # Los escritores de la rotación también deben EXISTIR en opencode.json (Ola 261: llm7 no
    # estaba declarado en la Mac y sus modelos morían en silencio dentro de la rotación).
    for m in modelos:
        asegurar_modelo_opencode(m)
    cambios = reanudada; modelo_ok = (PROG.get(tid, {}).get("modelo") or modelos[0]) if reanudada else ""
    intentos_reales = 0; ultimo_fallo = ""
    saturados = {}     # modelo -> veces que el proveedor contestó 429 (se reintenta tras esperar)
    ronda = 0
    pendientes = [] if reanudada else list(modelos)
    while pendientes and not cambios and intentos_reales < 2:
        modelo = pendientes.pop(0)
        if not proveedor_vivo(proveedor_de(modelo)):
            if modelo not in apartados:
                apartados.append(modelo)
            evento("reenrutado", tid, "%s está caído ahora mismo → lo aparto y sigo con otro proveedor" % proveedor_de(modelo))
            continue
        latir(tid, "escribiendo", modelo=modelo, intento=intento)
        rc, out = opencode(contexto_tarea(t), modelo, wt, log, timeout=ESCRITURA_S, tid=tid)
        if tid in SOLTADAS:
            limpiar_worktree(tid); return
        if tid in CORTADOS and tid in REASIGNADOS:
            # Lo cortó el Mando para cambiar de modelo/API: lo que dejó a medias el modelo
            # anterior se descarta (estaba escribiendo cuando se le cortó), el nuevo va
            # primero y el flujo sigue igual (tsc → tests → revisión → integración).
            CORTADOS.discard(tid)
            nuevo = REASIGNADOS.pop(tid)
            sh("git checkout -q -- . && git clean -fdq .", cwd=wt, timeout=60)
            revalidar_proveedor(proveedor_de(nuevo))
            pendientes = [nuevo] + [m for m in pendientes if m != nuevo]
            latir(tid, "escribiendo", modelo=nuevo, intento=intento)
            continue
        _, st = sh(["git", "status", "--porcelain"], cwd=wt, timeout=30)
        if st.strip():
            cambios = True; modelo_ok = modelo
            try: escrito_kb = int(os.path.getsize(log) / 1024)
            except Exception: escrito_kb = 0
            paso(tid, "escritura", modelo=modelo, segundos=int(time.time() - t0), archivos_cambiados=len(st.strip().splitlines()), log_kb=escrito_kb)
            break
        if tid in CORTADOS:
            # Lo cortó el vigilante por no escribir: el modelo no ha decidido «no hay nada que
            # hacer», se ha colgado. Eso NO puede gastar uno de los dos intentos de la tarea.
            CORTADOS.discard(tid)
            _anotar_fallido(tid, modelo)
            evento("reenrutado", tid, "%s se colgó y fue cortado → siguiente modelo, sin gastar intento" % modelo)
            continue
        pista = fallo_de_proveedor(out)
        if pista:
            # El proveedor falló: esto NO es «el modelo no vio nada que hacer», así que
            # no gasta intento. Si el modelo está retirado, fuera de la rotación entera.
            ultimo_fallo = pista
            if any(x in pista for x in PISTAS_DEFUNCION):
                # Una pista de defunción ya NO retira por sí sola: la pudo soltar la salida
                # de una herramienta del agente (Ola 264: «git show main:… does not exist»).
                # debe_retirar() lo confirma contra el catálogo del proveedor.
                retirar, motivo = debe_retirar(modelo, out, catalogo_proveedor(proveedor_de(modelo)))
                if retirar:
                    MUERTOS.add(modelo)
                    evento("proveedor", tid, "%s retirado (%s) → fuera de la rotación" % (modelo, motivo))
                else:
                    evento("aviso", tid, "pista de defunción falsa (venía de la salida de una herramienta): %s" % motivo)
            elif any(x in pista for x in ("too many requests", "rate limit", "database is locked")) and saturados.get(modelo, 0) < 2:
                # Saturación pasajera (429, o la base de opencode ocupada por otro agente): no es
                # motivo para quemar la lista entera en segundos. Se espera y se vuelve a intentar
                # el MISMO modelo; a la tercera, siguiente.
                saturados[modelo] = saturados.get(modelo, 0) + 1
                espera = 8 if "database is locked" in pista else ESPERA_429_S
                latir(tid, "esperando cupo", modelo=modelo, intento=intento)
                evento("aviso", tid, "%s: %s → espero %ds y lo reintento (%d/2)" % (modelo, "base de opencode ocupada" if espera == 8 else "saturado (429)", espera, saturados[modelo]))
                FIN.wait(espera)
                pendientes.insert(0, modelo)
            else:
                evento("proveedor", tid, "%s falló por el proveedor (%s) → siguiente modelo" % (modelo, pista))
            continue
        intentos_reales += 1
        _anotar_fallido(tid, modelo)
        evento("aviso", tid, "sin cambios con %s" % modelo)
    # Sin cambios y SIN ningún intento real porque todo estaba caído/saturado: esperar a que
    # vuelva algún proveedor (hasta ESPERA_PROVEEDOR_S) en vez de dar la tarea por perdida.
    while (not cambios and intentos_reales == 0 and apartados and ronda < 3 and not FIN.is_set()):
        ronda += 1
        latir(tid, "esperando proveedor", modelo="-", intento=intento)
        evento("aviso", tid, "todos los proveedores útiles están caídos (%s) → espero hasta %d min a que vuelva alguno (ronda %d/3)"
               % (", ".join(sorted({proveedor_de(m) for m in apartados})), ESPERA_PROVEEDOR_S // 60, ronda))
        t_esp = time.time(); vueltos = []
        while time.time() - t_esp < ESPERA_PROVEEDOR_S and not FIN.is_set():
            vueltos = [m for m in apartados if proveedor_vivo(proveedor_de(m))]
            if vueltos:
                break
            FIN.wait(30)
        if not vueltos:
            break
        evento("reenrutado", tid, "%s ha vuelto → retomo la tarea con %s" % (proveedor_de(vueltos[0]), vueltos[0]))
        apartados = [m for m in apartados if m not in vueltos]
        pendientes = vueltos
        saturados = {}
        # misma lógica de escritura, segunda vuelta
        while pendientes and not cambios and intentos_reales < 2:
            modelo = pendientes.pop(0)
            if not proveedor_vivo(proveedor_de(modelo)):
                apartados.append(modelo); continue
            latir(tid, "escribiendo", modelo=modelo, intento=intento)
            rc, out = opencode(contexto_tarea(t), modelo, wt, log, timeout=ESCRITURA_S, tid=tid)
            if tid in SOLTADAS:
                limpiar_worktree(tid); return
            if tid in CORTADOS and tid in REASIGNADOS:
                CORTADOS.discard(tid); nuevo = REASIGNADOS.pop(tid)
                sh("git checkout -q -- . && git clean -fdq .", cwd=wt, timeout=60)
                revalidar_proveedor(proveedor_de(nuevo))
                pendientes = [nuevo] + [m for m in pendientes if m != nuevo]
                latir(tid, "escribiendo", modelo=nuevo, intento=intento); continue
            _, st = sh(["git", "status", "--porcelain"], cwd=wt, timeout=30)
            if st.strip():
                cambios = True; modelo_ok = modelo
                try: escrito_kb = int(os.path.getsize(log) / 1024)
                except Exception: escrito_kb = 0
                paso(tid, "escritura", modelo=modelo, segundos=int(time.time() - t0), archivos_cambiados=len(st.strip().splitlines()), log_kb=escrito_kb)
                break
            if tid in CORTADOS:
                CORTADOS.discard(tid); _anotar_fallido(tid, modelo)
                evento("reenrutado", tid, "%s se colgó y fue cortado → siguiente modelo, sin gastar intento" % modelo)
                continue
            pista = fallo_de_proveedor(out)
            if pista:
                ultimo_fallo = pista
                if any(x in pista for x in PISTAS_DEFUNCION):
                    # Misma confirmación que en la primera pasada: no retirar por una pista
                    # que venía de la salida de una herramienta.
                    retirar, motivo = debe_retirar(modelo, out, catalogo_proveedor(proveedor_de(modelo)))
                    if retirar:
                        MUERTOS.add(modelo)
                    else:
                        evento("aviso", tid, "pista de defunción falsa (venía de la salida de una herramienta): %s" % motivo)
                elif any(x in pista for x in ("too many requests", "rate limit", "database is locked")) and saturados.get(modelo, 0) < 2:
                    saturados[modelo] = saturados.get(modelo, 0) + 1
                    latir(tid, "esperando cupo", modelo=modelo, intento=intento)
                    FIN.wait(8 if "database is locked" in pista else ESPERA_429_S); pendientes.insert(0, modelo)
                else:
                    apartados.append(modelo)
                evento("proveedor", tid, "%s falló por el proveedor (%s)" % (modelo, pista))
                continue
            intentos_reales += 1
            _anotar_fallido(tid, modelo)
            evento("aviso", tid, "sin cambios con %s" % modelo)
    if not cambios and intentos_reales == 0 and (ultimo_fallo or apartados):
        set_estado(tid, estado="fallo", modelo="-", segundos=int(time.time() - t0),
                   nota="ningún proveedor respondió (%s)" % (ultimo_fallo or "todos caídos")[:60])
        evento("fallo", tid, "ningún proveedor llegó a intentarlo (%s) — la tarea sigue SIN hacer; relánzala con --solo %s" % ((ultimo_fallo or "todos caídos")[:80], tid))
        limpiar_worktree(tid); return
    if tid in SOLTADAS:
        limpiar_worktree(tid, borrar_rama=False); return
    if not cambios:
        set_estado(tid, estado="sin_cambios", modelo="-", segundos=int(time.time() - t0), nota="")
        evento("sin_cambios", tid, "ningún modelo tocó archivos"); limpiar_worktree(tid); return
    # ── puerta de alcance (2026-09-06, Ola 259, E2): la escritura no vale si deja archivos ─
    # pedidos sin tocar. Si faltan, UNA pasada de compleción con el mismo modelo; si aun así
    # siguen faltando, aviso «TAREA INCOMPLETA» y el revisor lo recibe explicado (`alcance_txt`).
    alcance_txt = ""
    medida = {"pedidos": [], "tocados": [], "faltan": [], "extra": []}
    if t.get("archivos"):
        medida = alcance_tarea(t, wt)
        hubo_pasada = False
        if medida["faltan"]:
            hubo_pasada = True
            latir(tid, "completando", modelo=modelo_ok)
            opencode("Tu tarea pedía tocar estos archivos y no los has tocado: %s.\n"
                     "Complétalos ahora siguiendo el enunciado original (te lo repito abajo). "
                     "Si de verdad alguno no hace falta tocarlo, escribe en tu respuesta una línea "
                     "`SIN TOCAR <ruta>: <motivo>` por cada uno.\n\nEnunciado original:\n%s"
                     % (", ".join(medida["faltan"]), t.get("prompt", "")),
                     modelo_ok, wt, log, timeout=ESCRITURA_S, tid=tid)
            medida = alcance_tarea(t, wt)
        paso(tid, "alcance", pedidos=len(medida["pedidos"]), tocados=len(medida["tocados"]),
             faltan=",".join(medida["faltan"])[:300], completado=bool(hubo_pasada))
        if medida["faltan"]:
            alcance_txt = ("la tarea pedía tocar %d archivos y el diff no toca: %s"
                           % (len(medida["pedidos"]), ", ".join(medida["faltan"])))
            evento("aviso", tid, "TAREA INCOMPLETA: faltan %s" % ", ".join(medida["faltan"]))
    # puerta tsc + reparación
    latir(tid, "tsc", modelo=modelo_ok)
    rc, errs = tsc(wt, log)
    errores_antes = len(errs)
    if errs:
        evento("aviso", tid, "%d errores tsc → reparación" % len(errs))
        latir(tid, "escribiendo", modelo=modelo_ok)
        opencode("Corrige SOLO estos errores de TypeScript sin cambiar el comportamiento ni tocar otros archivos:\n" + "\n".join(errs[:40]), modelo_ok, wt, log, timeout=900, tid=tid)
        rc, errs = tsc(wt, log)
    paso(tid, "tsc", errores_antes=errores_antes, errores_despues=len(errs), reparado=bool(errores_antes and not errs))
    if errs:
        set_estado(tid, estado="fallo_tsc", modelo=modelo_ok, segundos=int(time.time() - t0), nota="%d errores tsc (rama ola/%s conservada)" % (len(errs), tid))
        evento("fallo", tid, "tsc sigue con %d errores; rama ola/%s conservada" % (len(errs), tid)); limpiar_worktree(tid, borrar_rama=False); return
    latir(tid, "tests", modelo=modelo_ok)
    rc, vout = vitest(wt, log)
    if rc == 0:
        paso(tid, "tests", resultado="ok", reparacion=False)
    if rc != 0:
        evento("aviso", tid, "vitest falló → reparación")
        latir(tid, "escribiendo", modelo=modelo_ok)
        opencode("Estos tests de vitest fallan tras tus cambios; corrige el código (o el test si el cambio de comportamiento es el pedido):\n" + vout[-4000:], modelo_ok, wt, log, timeout=900, tid=tid)
        rc, vout = vitest(wt, log)
        paso(tid, "tests", resultado="ok" if rc == 0 else "falla", reparacion=True)
        if rc != 0:
            set_estado(tid, estado="fallo_tests", modelo=modelo_ok, segundos=int(time.time() - t0), nota="vitest falla (rama conservada)")
            evento("fallo", tid, "vitest sigue fallando; rama ola/%s conservada" % tid); limpiar_worktree(tid, borrar_rama=False); return
    # commit en la rama
    sh("git add -A . && git reset -q -- starseed_memory_root 2>/dev/null; true", cwd=wt, timeout=60)
    msg = "%s · %s: %s\n\nEnjambre libre v2 (opencode · %s). Archivos: %s\n\nCo-Authored-By: Enjambre StarSeed <enjambre@starseed.local>" % (
        t.get("ola", "Ola"), tid, t.get("titulo", ""), modelo_ok, ", ".join(t.get("archivos", []))[:300])
    open("/tmp/enj-msg-%s.txt" % tid, "w", encoding="utf-8").write(msg)
    rc, out = sh("git -c core.hooksPath=/dev/null commit -q -F /tmp/enj-msg-%s.txt" % tid, cwd=wt, timeout=120)
    if rc != 0:
        set_estado(tid, estado="fallo", modelo=modelo_ok, segundos=int(time.time() - t0), nota="commit: " + out[-120:])
        evento("fallo", tid, "commit falló: " + out[-200:]); limpiar_worktree(tid, borrar_rama=False); return
    # revisión cruzada
    latir(tid, "revision", modelo=modelo_ok)
    _, diff = sh(["git", "diff", "HEAD~1", "--stat", "-p"], cwd=wt, timeout=60)
    impacto = impacto_cambios("ola/" + tid)          # grafo GitNexus: qué flujos toca la rama (None si no hay índice)
    if impacto:
        paso(tid, "impacto", **{k: v for k, v in impacto.items() if k != "detalle"}, detalle=" | ".join(impacto["detalle"]))
    revisor, rev, meta_rev = ("", "", {}) if "--sin-revision" in sys.argv else revisar(tid, t.get("titulo", ""), diff, impacto_texto(impacto), alcance=alcance_txt)
    bloqueante = bool(re.search(r"seguimiento:?\**\s*s[ií]\b.*bloqueante", rev, re.I | re.S)) or ("bloqueante" in rev.lower() and "no bloqueante" not in rev.lower())
    # Al revisor se le pide expresamente que NO bloquee por no ver el diff entero, y aun así lo
    # hace (Ola 233, C7: «el diff está truncado» sobre un commit que había pasado tsc y vitest).
    # Si el MOTIVO del bloqueo es solo eso, se degrada a aviso: el corte del diff es nuestro.
    if bloqueante:
        motivo = rev.lower().rsplit("seguimiento", 1)[-1][:400]
        excusas = ("truncad", "cortad", "incompleto", "no puedo verificar", "falta de contexto",
                   "no veo el", "no se muestra", "diff parcial")
        defectos = ("null", "undefined", "fuga", "inyec", "xss", "clave", "token", "borra",
                    "pérdida de datos", "perdida de datos", "bucle infinito", "condición de carrera")
        if any(x in motivo for x in excusas) and not any(x in motivo for x in defectos):
            bloqueante = False
            evento("aviso", tid, "revisión marcada bloqueante SOLO por no ver el diff entero → degradada a aviso "
                                 "(el commit ya pasó tsc y vitest)")
        else:
            segundo, dictamen, confirma = confirmar_bloqueo(tid, t.get("titulo", ""), motivo, diff)
            if segundo and not confirma:
                bloqueante = False
                evento("aviso", tid, "bloqueo NO confirmado por %s → degradado a aviso: %s" % (segundo, dictamen[:160]))
                rev += "\n\n**Segunda opinión (%s): el bloqueo no se sostiene.** %s" % (segundo, dictamen[:400])
            elif segundo:
                evento("aviso", tid, "bloqueo CONFIRMADO por %s: %s" % (segundo, dictamen[:160]))
                rev += "\n\n**Segunda opinión (%s): el bloqueo se confirma.** %s" % (segundo, dictamen[:400])
    paso(tid, "revision", revisor=revisor or "ninguno", bloqueante=bloqueante, caracteres=len(rev or ""),
         segundos=meta_rev.get("segundos", 0), intentos=meta_rev.get("intentos", 0))    # Ola 261: quién respondió, cuánto tardó y cuántos se probaron
    if rev:
        with cerrojo("revisiones"), open(REVIS, "a", encoding="utf-8") as f:
            f.write("\n## %s · %s · %s: %s\n**Revisión (%s)**\n\n%s\n" % (ahora()[:16], t.get("ola", ""), tid, t.get("titulo", ""), revisor, rev))
    # ── Nodo de aprobación humana (patrón Flowise «human in the loop») ─────────────────
    # Con `--aprobacion`, `STARSEED_APROBACION=1` o `"aprobacion": true` en la tarea, NADA se
    # integra en main sin el visto bueno de Alex: la rama queda lista, el Mando la enseña con su
    # diff y sus comprobaciones, y la orden `aprobar`/`rechazar` llega por el archivo de control
    # (Mac) o por el bus firmado (nube). Si nadie decide en ESPERA_APROBACION_S, la rama se
    # conserva y la tarea queda «pendiente_aprobacion» (se integra a mano o relanzando --solo).
    # (2026-09-06, Ola 261, P4) Y desde la Ola 261 tampoco se integra un bloqueo confirmado ni
    # un alcance incompleto aunque la cola no pidiera aprobación: pasan por el mismo visto
    # bueno. `--integrar-bloqueantes` recupera el comportamiento antiguo si se fuerza a mano.
    aprobacion_pedida = ("--aprobacion" in sys.argv or os.environ.get("STARSEED_APROBACION") == "1"
                         or bool(t.get("aprobacion")))
    pedir_vb, motivo_vb = debe_pedir_visto_bueno(bloqueante, medida.get("faltan", []), aprobacion_pedida, sys.argv)
    if pedir_vb:
        _, sha_rama = sh(["git", "rev-parse", "--short", "HEAD"], cwd=wt, timeout=30)
        _, stat = sh(["git", "diff", "HEAD~1", "--stat"], cwd=wt, timeout=60)
        resumen_rev = (rev or "").strip().replace("\n", " ")[:400]
        set_estado(tid, estado="esperando_aprobacion", modelo=modelo_ok, segundos=int(time.time() - t0),
                   nota="rama ola/%s (%s) lista · revisión %s" % (tid, sha_rama.strip(), "bloqueante" if bloqueante else ("ok" if rev else "sin revisor")))
        latir(tid, "esperando aprobación", modelo=modelo_ok)
        # `motivo` (Ola 261, P4): por qué pide visto bueno — cola, bloqueo confirmado o alcance
        # incompleto. El Mando lo enseña junto al resto de campos (rama, sha, diffstat, revisión,
        # bloqueante, modelo, impacto), que se mantienen idénticos al flujo ya existente.
        evento("esperando_aprobacion", tid, "rama ola/%s lista (%s): tsc 0 · tests ok · revisión %s. Espera tu visto bueno en el Mando. Motivo: %s."
               % (tid, sha_rama.strip(), "bloqueante" if bloqueante else ("ok" if rev else "sin revisor"), motivo_vb),
               datos={"rama": "ola/" + tid, "sha": sha_rama.strip(), "diffstat": stat[-1500:], "revision": resumen_rev, "bloqueante": bloqueante, "modelo": modelo_ok,
                      "impacto": impacto, "motivo": motivo_vb})
        t_esp = time.time(); decision = None
        while time.time() - t_esp < ESPERA_APROBACION_S and not FIN.is_set():
            decision = APROBACIONES.pop(tid, None)
            if decision or tid in SOLTADAS:
                break
            FIN.wait(10)
        if tid in SOLTADAS:
            limpiar_worktree(tid, borrar_rama=False); return
        if decision == "rechazar":
            set_estado(tid, estado="rechazada", modelo=modelo_ok, segundos=int(time.time() - t0), nota="rechazada desde el Mando; rama ola/%s conservada" % tid)
            evento("rechazada", tid, "rechazada desde el Mando; rama ola/%s conservada" % tid); limpiar_worktree(tid, borrar_rama=False); return
        if decision != "aprobar":
            set_estado(tid, estado="pendiente_aprobacion", modelo=modelo_ok, segundos=int(time.time() - t0), nota="sin decisión en %d h; rama ola/%s conservada" % (ESPERA_APROBACION_S // 3600, tid))
            evento("pendiente_aprobacion", tid, "nadie decidió en %d h: rama ola/%s conservada, sin integrar" % (ESPERA_APROBACION_S // 3600, tid)); limpiar_worktree(tid, borrar_rama=False); return
    # integración en main (serializada): rebase sobre main y ff
    latir(tid, "integrando", modelo=modelo_ok)
    # ⚠️ El reintento tras un conflicto se lanza FUERA del cerrojo: la Ola 240 (VZ6, 00:13) se
    # quedó «integrando» para siempre porque `ejecutar(intento=2)` se llamaba dentro del
    # `with LOCK_INTEGRAR` y volvía a pedir el mismo cerrojo (no reentrante) → bloqueo eterno.
    reintentar = False
    with LOCK_INTEGRAR, cerrojo("integrar"):
        rc, out = sh(["git", "rebase", "main"], cwd=wt, timeout=300)
        if rc != 0:
            sh(["git", "rebase", "--abort"], cwd=wt, timeout=60)
            limpiar_worktree(tid, borrar_rama=False)
            if intento == 1:
                set_estado(tid, estado="conflicto", modelo=modelo_ok, segundos=int(time.time() - t0), nota="reintento sobre main nuevo")
                evento("reintento", tid, "conflicto al integrar → se repite la tarea sobre el main actual")
                reintentar = True
            else:
                set_estado(tid, estado="conflicto", modelo=modelo_ok, segundos=int(time.time() - t0), nota="rama ola/%s conservada" % tid)
                evento("conflicto", tid, "conflicto persistente; rama ola/%s conservada" % tid); return
        else:
            _, sha = sh(["git", "rev-parse", "--short", "HEAD"], cwd=wt, timeout=30)
            rc, out = sh(["git", "merge", "--ff-only", "ola/" + tid], cwd=ROOT, timeout=120)
            if rc != 0:
                set_estado(tid, estado="conflicto", modelo=modelo_ok, segundos=int(time.time() - t0), nota="ff falló: " + out[-100:])
                evento("conflicto", tid, "merge ff falló: " + out[-200:]); limpiar_worktree(tid, borrar_rama=False); return
    if reintentar:
        return ejecutar(t, intento=2)
    limpiar_worktree(tid)
    paso(tid, "integracion", sha=sha.strip(), resultado="ff", intento=intento, segundos_total=int(time.time() - t0))
    # (2026-09-06, Ola 261, P4) Si llega aquí con bloqueante=True es porque alguien aprobó en el
    # Mando o porque se forzó con `--integrar-bloqueantes`: el evento es `commit` (se integró) y
    # la nota lo dice, en vez de publicar «bloqueante» sobre un commit ya dentro de main.
    if bloqueante:
        detalle = ("integrado con --integrar-bloqueantes" if "--integrar-bloqueantes" in sys.argv
                   else "bloqueo revisado y aprobado en el Mando")
        nota = "%s · revisión bloqueante (%s)" % (sha.strip(), detalle)
    else:
        nota = "%s · revisión %s" % (sha.strip(), "ok" if rev else "sin revisor")
    set_estado(tid, estado="commit", modelo=modelo_ok, segundos=int(time.time() - t0), nota=nota)
    evento("commit", tid, "%s integrado en main (%s)" % (sha.strip(), nota))

def ejecutar_seguro(t):
    """Un trabajador nunca muere en silencio: excepción → fallo + evento + limpieza."""
    try:
        ejecutar(t)
    except Exception as e:
        set_estado(t["id"], estado="fallo", nota=("excepción: " + str(e))[:200])
        evento("fallo", t["id"], "excepción: " + str(e)[:300])
        try: limpiar_worktree(t["id"], borrar_rama=False)
        except Exception: pass
    finally:
        latir(t["id"], "hecho")

# ── director ────────────────────────────────────────────────────────────────
def main():
    if len(sys.argv) < 2: print(__doc__); sys.exit(1)
    cola = json.load(open(sys.argv[1], encoding="utf-8"))
    cola = cola if isinstance(cola, list) else cola.get("tareas") or []
    workers = int(sys.argv[sys.argv.index("--workers") + 1]) if "--workers" in sys.argv else int(os.environ.get("STARSEED_WORKERS", "5"))
    solo = set(sys.argv[sys.argv.index("--solo") + 1].split(",")) if "--solo" in sys.argv else None
    tareas = [t for t in cola if (not solo or t["id"] in solo)]
    _, sucio = sh(["git", "status", "--porcelain"], timeout=30)
    if sucio.strip():
        print("working tree de main con cambios sin commit: %d archivos — no arranco" % len(sucio.splitlines())); sys.exit(2)
    os.makedirs(OLAS, exist_ok=True); os.makedirs(LOGS, exist_ok=True)
    validar_modelos()
    threading.Thread(target=vigilante, daemon=True).start()
    threading.Thread(target=supervisor_proveedores, daemon=True).start()
    # La cola entera viaja en el bus: el Puente de Mando de la OTRA máquina no tiene este
    # archivo (starseed_memory_root/ no se versiona) y sin esto la ola de la nube no aparecía.
    evento("arranque", "", "%d tareas · %d trabajadores · vigilante cada 20s (corte a los %d min sin avance) · %s · lanzado desde %s"
           % (len(tareas), workers, ESTANCADO_S // 60, os.path.basename(sys.argv[1]), MEDIO),
           datos={"cola": os.path.basename(sys.argv[1]).replace(".json", ""), "workers": workers,
                  "tareas": [{"id": t["id"], "ola": t.get("ola", ""), "titulo": t.get("titulo", "")[:200],
                              "depende": list(t.get("depende") or t.get("dependencias") or []),
                              "archivos": list(t.get("archivos") or [])[:12],
                              # El prompt también viaja: así la OTRA máquina puede relanzar o corregir la
                              # cola desde su Diseñador de olas sin tener el archivo.
                              "prompt": (t.get("prompt") or "")[:6000],
                              **({"modelo": t["modelo"]} if t.get("modelo") else {})} for t in cola]})
    relevo_nota("enjambre v2 arranca: %d tareas, %d trabajadores (%s)" % (len(tareas), workers, os.path.basename(sys.argv[1])))
    MIAS.update(t["id"] for t in tareas)
    pendientes = {t["id"]: t for t in tareas}; hechas = set(); activos = {}
    def terminado(tid): return PROG.get(tid, {}).get("estado") in ("commit", "sin_cambios", "fallo", "fallo_tsc", "fallo_tests", "conflicto", "reasignada", "rechazada", "pendiente_aprobacion", "bloqueada")
    while pendientes or activos:
        for tid in list(activos):
            if not activos[tid].is_alive(): activos.pop(tid); hechas.add(tid)
        for tid, t in list(pendientes.items()):
            if tid in SOLTADAS:
                pendientes.pop(tid); hechas.add(tid); continue
            if len(activos) >= workers: break
            deps = list(t.get("depende") or []) + list(t.get("depende_opcional") or [])
            if not all(d in hechas or (d not in pendientes and d not in activos) for d in deps):
                continue
            # Terminadas no basta: tienen que estar INTEGRADAS (Ola 264: G3 corrió con J1
            # «sin_cambios» y buscó un archivo que nunca llegó a main). Solo se bloquea por
            # las dependencias duras; las opcionales (`depende_opcional`) solo avisan.
            ok, malas = dependencias_ok(t)
            if not ok:
                nota = "dependencia no integrada: " + ", ".join(malas)
                set_estado(tid, estado="bloqueada", modelo="-", segundos=0, nota=nota)
                evento("bloqueada", tid, nota)
                pendientes.pop(tid); hechas.add(tid); continue
            opcionales_malas = ["%s (%s)" % (d, PROG.get(d, {}).get("estado"))
                                for d in (t.get("depende_opcional") or [])
                                if PROG.get(d, {}).get("estado") not in (None, "commit")]
            if opcionales_malas:
                evento("aviso", tid, "dependencia opcional no integrada (sigo igual): " + ", ".join(opcionales_malas))
            th = threading.Thread(target=ejecutar_seguro, args=(t,), daemon=True); th.start()
            activos[tid] = th; pendientes.pop(tid)
        time.sleep(3)
    FIN.set()
    # verificación final en main
    evento("verificando", "", "tsc + vitest sobre main")
    log = os.path.join(LOGS, "verificacion-final.log")
    rc, errs = tsc(ROOT, log); rcv, vout = vitest(ROOT, log)
    est = {tid: PROG.get(tid, {}).get("estado") for tid in [t["id"] for t in tareas]}
    resumen = " · ".join("%s=%s" % (k, v) for k, v in est.items())
    bloqueadas = {k: PROG.get(k, {}).get("nota", "") for k, v in est.items() if v == "bloqueada"}
    if bloqueadas:
        # Las bloqueadas se listan APARTE del resumen: no fallaron, nunca se ejecutaron
        # porque su dependencia no llegó a integrarse (2026-09-07, Ola 261).
        resumen += " · BLOQUEADAS(no ejecutadas): " + " | ".join(
            "%s (%s)" % (k, v)[:150] for k, v in bloqueadas.items())
    if not errs and rcv == 0:
        evento("verificado", "", "main en verde: tsc 0 errores · vitest ok · " + resumen)
    else:
        evento("verificacion_fallida", "", "tsc %d errores · vitest rc %s · %s" % (len(errs), rcv, resumen))
    _, head = sh(["git", "rev-parse", "--short", "HEAD"], timeout=30)
    nombre_cola = (os.path.basename(sys.argv[1]) if len(sys.argv) > 1 else "").replace(".json", "")
    evento("cola_terminada", "", "HEAD %s · %s" % (head.strip(), resumen), datos={"cola": nombre_cola})
    # Último latido, ya sin tareas vivas: si no, el Mando de la otra máquina seguía viendo
    # «P2 escribiendo» hasta 4 min después de terminar (el latido anterior seguía en ventana).
    for d in LATIDOS.values():
        d["fase"] = "hecho"
    _volcar_latidos()
    try:
        evento("latido", "", "cola terminada · sin tareas activas · %d integradas"
               % sum(1 for v in PROG.values() if v.get("estado") == "commit"), datos=foto_enjambre(""))
    except Exception:
        pass
    # UN mismo informe de cierre para todos: archivo del relevo + bus + Hermes.
    # Claude usa ese texto tal cual en su respuesta, así Alex lee lo mismo aquí y allá.
    try:
        subprocess.run([os.path.expanduser("~/.local/bin/starseed-informe-ola"), sys.argv[1]], timeout=180)
    except Exception:
        pass
    relevo_nota("enjambre v2 terminó %s: HEAD %s · %s" % (os.path.basename(sys.argv[1]), head.strip(), resumen))

if __name__ == "__main__":
    main()
