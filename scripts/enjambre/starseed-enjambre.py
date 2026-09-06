#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""starseed-enjambre · orquestador PARALELO del enjambre libre de StarSeed OS (v2, Ola 227)

  python3 ~/.local/bin/starseed-enjambre.py cola.json [--workers 3] [--solo ID,ID] [--sin-revision] [--aprobacion]

Qué hace (todo gratis: opencode → NVIDIA NIM para escribir; OpenRouter/NIM/Gemini para revisar):
  · N trabajadores en paralelo, cada uno en su propio `git worktree` (rama ola/<id>) → nadie pisa a nadie.
  · Puertas por tarea: tsc (una a la vez, la Mac tiene 8 GB) → reparación automática → vitest → revisión
    cruzada por OTRO proveedor → commit en la rama → integración en main (rebase + ff), serializada.
  · Conflicto al integrar = reintento limpio de la tarea sobre el main nuevo (una vez).
  · Cupos por proveedor (req/min) y semáforo de concurrencia para no pasar los límites gratuitos.
  · Supervisor: eventos → bitácora local (olas/eventos.jsonl) + bus Supabase (relevo_eventos) +
    `hermes send` para lo importante + `starseed-relevo nota`. Verificador final: tsc + vitest en main.
  · `depende: ["ID"]` en una tarea la hace esperar a esas tareas.
Estado: olas/progreso.json + progreso.md (mismo formato de siempre) + logs/<id>.log + revisiones.md
"""
import json, os, re, subprocess, sys, threading, time, urllib.request, urllib.error, shutil, collections
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
    "xkiro/qwen/qwen3.8-max:free",
    "nvidia/deepseek-ai/deepseek-v4-pro-0813",
    "xkiro/deepseek/deepseek-v4-pro",
    "xkiro/mistralai/devstral-medium",
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


def validar_modelos():
    """Antes de empezar, comprueba qué modelos existen de verdad en el catálogo de NIM.
    Un modelo retirado hace que opencode falle y la tarea se marque «sin cambios» sin
    haber sido intentada nunca: eso ya pasó con gpt-oss-120b y qwen3-coder-480b."""
    fuera = []
    for proveedor, (url, claves) in CATALOGOS.items():
        key = next((ENV.get(k) or os.environ.get(k) for k in claves if ENV.get(k) or os.environ.get(k)), None)
        if not key:
            continue
        try:
            req = urllib.request.Request(url, headers={"Authorization": "Bearer " + key,
                                                       "User-Agent": "starseed-enjambre/2 (+starseed-os)"})
            vivos = {m["id"] for m in json.loads(urllib.request.urlopen(req, timeout=30).read()).get("data", [])}
        except Exception as e:
            evento("aviso", "", "no pude validar el catálogo de %s (%s): sigo con su lista tal cual" % (proveedor, str(e)[:70]))
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


def sondear(prov, forzar=False):
    modelo, claves = SONDAS[prov]
    if prov != "llm7" and prov not in PASARELAS and not any(ENV.get(k) or os.environ.get(k) for k in claves):
        return None                      # sin clave: ni vivo ni caído, simplemente no se usa
    if not forzar:
        visto = USO_REAL.get(prov)
        if visto and time.time() - visto[0] < FRESCO_S:
            return visto[1]              # acaba de trabajar de verdad: esa es la respuesta
    # La sonda comprueba que el proveedor ACEPTA Y CONTESTA una generación. No exige que la
    # respuesta tenga una forma concreta: dar por caído a tokenrouter porque devolvió un JSON
    # inesperado (pasó el 2026-09-04, respondía en 6 s) es peor que no sondear.
    url = {"xkiro": "https://api.xkiro.com/v1/chat/completions",
           "nim": "https://integrate.api.nvidia.com/v1/chat/completions",
           "aihubmix": "https://aihubmix.com/v1/chat/completions",
           "tokenrouter": "https://api.tokenrouter.com/v1/chat/completions",
           "openrouter": "https://openrouter.ai/api/v1/chat/completions",
           "llm7": "https://api.llm7.io/v1/chat/completions",
           "freetheai": "https://api.freetheai.xyz/v1/chat/completions",
           **{n: p["url"] for n, p in PASARELAS.items()}}[prov]
    key = (PASARELAS[prov]["key"] if prov in PASARELAS else
           next((ENV.get(k) or os.environ.get(k) for k in claves if ENV.get(k) or os.environ.get(k)), None) or (ENV.get("LLM7_API_KEY") or "sin-clave" if prov == "llm7" else None))
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
                except Exception:
                    pass
    except Exception:
        vivo = False
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
                d[prov] = {"estado": "vivo", "t": ahora(), "desde": desde}
                visto[prov] = "vivo"
            else:
                fallos[prov] = fallos.get(prov, 0) + 1
                if fallos[prov] >= 3 and antes != "caido":
                    d[prov] = {"estado": "caido", "t": ahora(), "desde": ahora()}
                    visto[prov] = "caido"
                    evento("proveedor_caido", "", "%s no responde a TRES sondeos seguidos → fuera de la rotación en TODAS las olas" % prov)
                elif antes == "caido" or en_disco == "caido":
                    d[prov] = {"estado": "caido", "t": ahora(), "desde": desde}   # sigue caído: solo se anota la hora del sondeo
                    visto[prov] = "caido"
        _salud_guardar(d)
        FIN.wait(SONDEO_S)


def modelos_para(tid):
    """Rota la lista según el id de la tarea: reparte la carga entre proveedores."""
    i = sum(ord(c) for c in tid) % len(MODELOS)
    return MODELOS[i:] + MODELOS[:i]
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


@contextlib.contextmanager
def cerrojo(nombre, espera_aviso=60):
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
    CUPOS[proveedor].esperar()
    if proveedor == "gemini":
        key = ENV.get("GEMINI_API_KEY") or ENV.get("GOOGLE_API_KEY") or ENV.get("NEXT_PUBLIC_GOOGLE_API_KEY")
        if not key: raise RuntimeError("sin clave gemini")
        url = "https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s" % (modelo, key)
        cuerpo = {"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"temperature": 0.2, "maxOutputTokens": 1200}}
        req = urllib.request.Request(url, data=json.dumps(cuerpo).encode(), headers={"Content-Type": "application/json"})
        d = json.loads(urllib.request.urlopen(req, timeout=timeout).read())
        return "".join(p.get("text", "") for p in d["candidates"][0]["content"]["parts"])
    if proveedor == "xkiro":
        key = ENV.get("XKIRO_API_KEY"); url = "https://api.xkiro.com/v1/chat/completions"
    elif proveedor == "aihubmix":
        key = ENV.get("AIHUBMIX_API_KEY"); url = "https://aihubmix.com/v1/chat/completions"
    elif proveedor == "tokenrouter":
        # OJO: la base buena es .com (la .io exige claves `tr_` y rechaza estas).
        key = ENV.get("TOKENROUTER_API_KEY"); url = "https://api.tokenrouter.com/v1/chat/completions"
    elif proveedor == "openrouter":
        key = ENV.get("OPENROUTER_API_KEY"); url = "https://openrouter.ai/api/v1/chat/completions"
    elif proveedor == "llm7":
        # (2026-09-05, itsfree.ai) LLM7.io: OpenAI-compatible SIN clave, 10 req/min (40 con
        # token LLM7_API_KEY). Revisor de respaldo; sus nombres «claude/gpt-6» son etiquetas
        # de reventa: se usan solo modelos honestos (gpt-oss, deepseek-v4-flash, glm-5.3-flash…).
        key = ENV.get("LLM7_API_KEY") or "sin-clave"; url = "https://api.llm7.io/v1/chat/completions"
        if not ENV.get("LLM7_API_KEY") and modelo not in ("gpt-oss", "minimax-m2.7"):
            modelo = "minimax-m2.7"      # sin token solo sirven estos dos (probado el 2026-09-05)
    elif proveedor == "freetheai":
        # (2026-09-05, github.com/Free-The-Ai/free-ai) Pasarela gratuita OpenAI-compatible, 60+
        # modelos, clave por Discord (/signup + /checkin diario), 10-35 req/min, 250/día.
        key = ENV.get("FREETHEAI_API_KEY"); url = "https://api.freetheai.xyz/v1/chat/completions"
    elif proveedor in PASARELAS:
        key = PASARELAS[proveedor]["key"]; url = PASARELAS[proveedor]["url"]
    else:
        key = ENV.get("NVIDIA_API_KEY") or ENV.get("NVIDIA_SHARED_KEY"); url = "https://integrate.api.nvidia.com/v1/chat/completions"
    if not key: raise RuntimeError("sin clave " + proveedor)
    # 2500 y no 1200: los revisores «pensantes» (glm-5.3, qwen3.7) gastan el presupuesto en razonar
    # y devolvían el contenido vacío (tokenrouter con max_tokens=20 devolvía "" y finish=length).
    cuerpo = {"model": modelo, "messages": [{"role": "user", "content": prompt}], "temperature": 0.2, "max_tokens": 2500}
    # Sin User-Agent propio, el Cloudflare de xKiro devuelve 403 al urllib de Python.
    req = urllib.request.Request(url, data=json.dumps(cuerpo).encode(),
                                 headers={"Content-Type": "application/json", "Authorization": "Bearer " + key,
                                          "User-Agent": "starseed-enjambre/2 (+starseed-os)"})
    try:
        d = json.loads(urllib.request.urlopen(req, timeout=timeout).read())
    except Exception:
        USO_REAL[proveedor] = (time.time(), False)
        raise
    txt = d["choices"][0]["message"]["content"] or ""
    txt = re.sub(r"<think>.*?</think>", "", txt, flags=re.S).strip()
    # Algunos proveedores devuelven 200 con un AVISO DE CUOTA como si fuera la respuesta (aihubmix
    # el 2026-09-04: «accounts that have not been recharged can only try 10 times»). Seis commits
    # se integraron con esa frase archivada como «revisión ok». Eso es un fallo del proveedor.
    if es_aviso_de_cuota(txt):
        USO_REAL[proveedor] = (time.time(), False)
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
    for prov, modelo in REVISORES:
        try:
            r = llamar_llm(prov, modelo, prompt, timeout=90).strip()
            if not r:
                continue
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
    for prov, modelo in REVISORES:
        try:
            # 240 s: los revisores pensantes (glm-5.3 en tokenrouter) tardan más de 2 min con un
            # diff grande y se perdían por «read operation timed out», cayendo hasta Gemini.
            txt = llamar_llm(prov, modelo, prompt, timeout=240)
            if txt.strip(): return prov + "/" + modelo, txt.strip()
        except Exception as e:
            evento("aviso", tid, "revisor %s no disponible: %s" % (prov, str(e)[:120]))
    return "", ""

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
                                 cwd=cwd, stdout=f, stderr=subprocess.STDOUT, env=entorno_hijo())
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
    return rc, out

def alcance_tarea(t, wt):
    """Puerta de alcance (2026-09-06, Ola 259, E2): compara los archivos que la tarea pedía
    tocar (`t["archivos"]`) con los tocados de verdad en el worktree (commits sobre main +
    cambios sin commit). El 2026-09-06 se integraron DOS tareas a medias sin que el revisor
    se diera cuenta (V8/255 y N2/258). Función pura: solo recibe `wt` y lanza git a mano,
    para poder probarla desde un repo temporal sin montar el orquestador entero.
    Un pedido que ya existía y no cambió cuenta como faltante: no sabemos si debía cambiar
    y el modelo lo aclarará. `extra` ordenado para que el resultado sea determinista."""
    pedidos = [str(a).strip() for a in (t.get("archivos") or []) if str(a).strip()]
    tocados = []
    def _git(*args):
        p = subprocess.run(["git"] + list(args), cwd=wt, capture_output=True, text=True, timeout=60)
        return (p.stdout or "")
    for l in _git("diff", "--name-only", "main...HEAD").splitlines():
        if l.strip():
            tocados.append(l.strip())
    # --porcelain cuenta lo que aún no tiene commit: «XY ruta»; en renombrados «XY vieja -> nueva».
    for l in _git("status", "--porcelain").splitlines():
        ruta = l[3:] if len(l) > 3 else ""
        if " -> " in ruta:
            ruta = ruta.split(" -> ")[-1]
        ruta = ruta.strip().strip('"')
        if ruta:
            tocados.append(ruta)
    tocados = sorted(set(tocados))
    return {"pedidos": pedidos, "tocados": tocados,
            "faltan": [p for p in pedidos if p not in tocados],
            "extra": [x for x in tocados if x not in pedidos]}


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
            "escritos en disco sin pedir confirmación.\n\n%s\n\nTAREA %s (%s) · %s\nArchivos implicados: %s\n\n%s") % (
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
ESTANCADO_S = int(os.environ.get("STARSEED_ESTANCADO_S", "900"))   # 7 min sin escribir nada = parada
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


def vigilante():
    """Comprueba CADA 20 s que las tareas activas avanzan de verdad, en vez de descubrir
    al final que una nunca arrancó. Si una lleva ESTANCADO_S sin escribir una sola línea,
    corta ese opencode y el bucle de la tarea pasa solo al siguiente modelo."""
    ultimo_bus = 0.0
    while not FIN.is_set():
        FIN.wait(20)
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
    base = [m for m in modelos_para(tid) if m not in MUERTOS and proveedor_vivo(proveedor_de(m))]
    if fallidos:
        # Los que ya se colgaron o no tocaron nada en esta tarea, al final de la cola.
        base = [m for m in base if m not in fallidos] + [m for m in base if m in fallidos]
        evento("aviso", tid, "empiezo por otro modelo: %s ya falló aquí antes" % ", ".join(x.split("/")[-1] for x in fallidos[:3]))
    # Los modelos de proveedores caídos NO se descartan: se apartan y se espera a que vuelvan.
    # (El 2026-09-04, VZ2: xkiro sin cuota diaria y nim con «too many requests» → la tarea se
    # dio por fallida en 2 segundos sin que ningún modelo llegara a intentarlo.)
    apartados = [m for m in modelos_para(tid) if m not in MUERTOS and not proveedor_vivo(proveedor_de(m))]
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
        rc, out = opencode(contexto_tarea(t), modelo, wt, log, tid=tid)
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
                MUERTOS.add(modelo)
                evento("proveedor", tid, "%s retirado (%s) → fuera de la rotación" % (modelo, pista))
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
            rc, out = opencode(contexto_tarea(t), modelo, wt, log, tid=tid)
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
                    MUERTOS.add(modelo)
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
                     modelo_ok, wt, log, timeout=900, tid=tid)
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
    revisor, rev = ("", "") if "--sin-revision" in sys.argv else revisar(tid, t.get("titulo", ""), diff, impacto_texto(impacto), alcance=alcance_txt)
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
    paso(tid, "revision", revisor=revisor or "ninguno", bloqueante=bloqueante, caracteres=len(rev or ""))
    if rev:
        with cerrojo("revisiones"), open(REVIS, "a", encoding="utf-8") as f:
            f.write("\n## %s · %s · %s: %s\n**Revisión (%s)**\n\n%s\n" % (ahora()[:16], t.get("ola", ""), tid, t.get("titulo", ""), revisor, rev))
    # ── Nodo de aprobación humana (patrón Flowise «human in the loop») ─────────────────
    # Con `--aprobacion`, `STARSEED_APROBACION=1` o `"aprobacion": true` en la tarea, NADA se
    # integra en main sin el visto bueno de Alex: la rama queda lista, el Mando la enseña con su
    # diff y sus comprobaciones, y la orden `aprobar`/`rechazar` llega por el archivo de control
    # (Mac) o por el bus firmado (nube). Si nadie decide en ESPERA_APROBACION_S, la rama se
    # conserva y la tarea queda «pendiente_aprobacion» (se integra a mano o relanzando --solo).
    if "--aprobacion" in sys.argv or os.environ.get("STARSEED_APROBACION") == "1" or t.get("aprobacion"):
        _, sha_rama = sh(["git", "rev-parse", "--short", "HEAD"], cwd=wt, timeout=30)
        _, stat = sh(["git", "diff", "HEAD~1", "--stat"], cwd=wt, timeout=60)
        resumen_rev = (rev or "").strip().replace("\n", " ")[:400]
        set_estado(tid, estado="esperando_aprobacion", modelo=modelo_ok, segundos=int(time.time() - t0),
                   nota="rama ola/%s (%s) lista · revisión %s" % (tid, sha_rama.strip(), "bloqueante" if bloqueante else ("ok" if rev else "sin revisor")))
        latir(tid, "esperando aprobación", modelo=modelo_ok)
        evento("esperando_aprobacion", tid, "rama ola/%s lista (%s): tsc 0 · tests ok · revisión %s. Espera tu visto bueno en el Mando."
               % (tid, sha_rama.strip(), "bloqueante" if bloqueante else ("ok" if rev else "sin revisor")),
               datos={"rama": "ola/" + tid, "sha": sha_rama.strip(), "diffstat": stat[-1500:], "revision": resumen_rev, "bloqueante": bloqueante, "modelo": modelo_ok,
                      "impacto": impacto})
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
    nota = "%s · revisión %s" % (sha.strip(), "bloqueante" if bloqueante else ("ok" if rev else "sin revisor"))
    set_estado(tid, estado="commit", modelo=modelo_ok, segundos=int(time.time() - t0), nota=nota)
    evento("bloqueante" if bloqueante else "commit", tid, "%s integrado en main (%s)" % (sha.strip(), nota))

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
    def terminado(tid): return PROG.get(tid, {}).get("estado") in ("commit", "sin_cambios", "fallo", "fallo_tsc", "fallo_tests", "conflicto", "reasignada", "rechazada", "pendiente_aprobacion")
    while pendientes or activos:
        for tid in list(activos):
            if not activos[tid].is_alive(): activos.pop(tid); hechas.add(tid)
        for tid, t in list(pendientes.items()):
            if tid in SOLTADAS:
                pendientes.pop(tid); hechas.add(tid); continue
            if len(activos) >= workers: break
            deps = t.get("depende") or []
            if all(d in hechas or (d not in pendientes and d not in activos) for d in deps):
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
