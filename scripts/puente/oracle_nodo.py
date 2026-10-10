#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""El A1 de Oracle como nodo SIEMPRE ENCENDIDO de MetaGenesis — el lado de la neurona (OPO1011).

Alex (2026-10-10): «starseed-a1 lleva 2,3 días ocioso (CPU p95 0,52 %, memoria 5,26 %, red 0 %;
umbral 20 %). Si sigue así, Oracle puede reclamarlo desde el 14 oct … solucionala». El A1 corre
`oracle_a1.py` (medio del enjambre + guardián de main), un nodo BitNet detrás de Caddy y, si el
paquete los trae, MetaGeminis en borrador y el nodo de MetaGenesis. Esto es lo que una NEURONA con
la llave SSH (`~/.ssh/starseed_oracle_ed25519`) y la sesión de GitHub hace con él:

  instalar [--esperar]   empaqueta deploy/oracle/nodo + el orquestador + oracle_a1.py (+ MetaGeminis
                         y el nodo de MetaGenesis si existen), lo sube y corre `preparar-a1.sh`
                         (idempotente). La primera vez compila BitNet: ~15-25 min.
  claves                 copia al A1 SOLO las claves de los proveedores GRATUITOS que ya usa la nube
                         de GitHub (mismos nombres que `nube-gh.py secretos`) y las del bus, a un
                         archivo 600 del usuario del servicio; trae la clave del BitNet del A1 a
                         ~/.starseed/env. Nunca imprime un valor: solo nombres.
  estado [--json]        lee el estado del nodo y lo deja en ~/.starseed/oracle.json (`nodo`,
                         `servicios`), que Genesis y `medios_disponibles` leen. Sin IPs ni claves.
  traer                  sube a GitHub las ramas `nube/a1-*` que dejó el A1 (él no puede: su copia
                         es de solo lectura) y devuelve a la cola lo que el A1 ya no va a hacer;
                         `traer_nube.py` las trae a main con SUS puertas en su próxima pasada.
  lanzar [--tope N] [--cola RUTA]
                         reparte N tareas del atraso (o manda la cola dada) y la deja en `colas/oracle-<fecha>`
                         (commit suelto: el código de esta neurona + la cola; main no se toca).
  ciclo                  estado → traer → lanzar si el A1 está libre y hay atraso. La autocuración
                         de Genesis lo corre cada 30 min; cualquier neurona con la llave puede.
  probar-bitnet          una pregunta al BitNet del A1 por HTTPS y con clave, desde aquí.
  bitnet-pesos           le pone al A1 los pesos BitNet en layout ARM (los oficiales vienen para
                         x86 y en ARM responden basura); el ciclo lo hace solo si el A1 lo detecta.

Reglas: Oracle SOLO Always Free (esto no crea nada en Oracle); nada se publica (main no se toca:
solo ramas `colas/oracle-*` y `nube/a1-*`, como la nube de GitHub); ninguna IP, clave ni OCID se
imprime ni se guarda fuera de los archivos 600 que ya existen.
Decisiones PURAS con sus pruebas en `test_oracle_nodo.py`.
"""
from __future__ import annotations

import fcntl
import importlib.util
import json
import os
import re
import subprocess
import sys
import tarfile
import tempfile
import time

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(DIRECTORIO))
#: De dónde salen los archivos del paquete del nodo: el repo, o una carpeta con versiones más
#: nuevas que aún no están en él (para probar sin ensuciar el árbol de main, que el orquestador
#: vigila: un archivo sin commitear le impide arrancar).
FUENTE = os.environ.get("STARSEED_NODO_FUENTE") or RAIZ
for _d in (DIRECTORIO, os.path.join(RAIZ, "scripts", "puente")):
    if _d not in sys.path:
        sys.path.append(_d)

HOME = os.path.expanduser("~")
ORACLE_JSON = os.path.join(HOME, ".starseed", "oracle.json")
CONSUMO_JSON = os.path.join(HOME, ".starseed", "oracle-consumo.json")
ESTADO = os.path.join(HOME, ".starseed", "oracle-nodo.json")
ENV_STARSEED = os.path.join(HOME, ".starseed", "env")
LLAVE = os.path.join(HOME, ".ssh", "starseed_oracle_ed25519")
CERROJOS = os.path.join(HOME, ".starseed", "cerrojos")
OLAS = os.path.join(RAIZ, "starseed_memory_root", "olas")
PROGRESO = os.path.join(OLAS, "progreso.json")
USUARIO_SSH = "ubuntu"
REPO_A1 = "/home/starseed/starseed-system"
ESTADO_A1 = "/var/lib/starseed/nodo"
PREFIJO_COLA = "colas/oracle-"
PREFIJO_ENTREGA = "nube/a1-"
LATIDO_VIVO_S = 600
DEJAR_COLAS = 8
TOPE_DEFECTO = 4
ESPERA_ENTRE_LANZAMIENTOS_S = 20 * 60

#: Las claves que viajan al A1: las MISMAS que la nube de GitHub (`nube-gh.py secretos`), todas de
#: proveedores con modelos gratuitos, más las públicas del bus (la clave anónima de Supabase es la
#: que lleva el navegador). Nada de pago (ANTHROPIC, OPENAI, DEEPSEEK…) y nada que apunte a
#: 127.0.0.1 de esta máquina (freellmapi, apinex), que allí no existe.
CLAVES_A1 = (
    "GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "NVIDIA_API_KEY", "OPENROUTER_API_KEY",
    "XKIRO_API_KEY", "AIHUBMIX_API_KEY", "TOKENROUTER_API_KEY", "GROQ_API_KEY",
    "STARSEED_PASARELA_GROQ_KEY", "STARSEED_PASARELA_GROQ_URL", "STARSEED_PASARELA_GROQ_MODELOS",
    "STARSEED_PASARELA_GROQ_RPM", "STARSEED_PASARELA_GROQ_SOLO_REVISOR",
    "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY",
)
ARCHIVOS_ENV = ("~/.starseed/env", "~/.hermes/.env", os.path.join(RAIZ, ".env.local"))
NOMBRE_CLAVE_BITNET = "STARSEED_ORACLE_BITNET_KEY"
#: Los pesos oficiales i2_s de Hugging Face vienen empaquetados para x86 (bloques de 128 valores,
#: paso 32). En ARM `QK_I2_S` es 64 (paso 16): con ellos el A1 «responde» palabras sueltas sin
#: sentido (medido el 2026-10-10). La Mac (arm64) sirve los pesos reempaquetados para ARM que se
#: validaron en las Adendas 160-162 (PPL 5,38): esta es su huella, y es lo que el A1 debe tener.
SHA_BITNET_ARM = "8abc44bb8ea7a9417d780066fa098261e81833d134ef8d3558f440daac87f6d4"
PESOS_ARM_LOCAL = os.environ.get("STARSEED_BITNET_ARM_GGUF") or os.path.join(
    HOME, "Documents", "IA 1.58 bit", "backend", "BitNet", "models", "BitNet-b1.58-2B-4T", "ggml-model-i2_s.gguf")
MODELO_A1 = "/home/starseed/astraura/backend/BitNet/models/BitNet-b1.58-2B-4T/ggml-model-i2_s.gguf"


# ── decisiones (puras) ──────────────────────────────────────────────────────────────────────────

def tachar(texto, ip=""):
    """PURA. Quita IPs (la del A1 y cualquier otra), nombres sslip.io y ids de Oracle."""
    t = str(texto or "")
    if ip:
        t = t.replace(ip, "<ip-a1>").replace(ip.replace(".", "-"), "<ip-a1>")
    t = re.sub(r"\b\d{1,3}(?:\.\d{1,3}){3}\b", "<ip>", t)
    t = re.sub(r"\b\d{1,3}(?:-\d{1,3}){3}\.sslip\.io\b", "<host>", t)
    t = re.sub(r"ocid1\.[A-Za-z0-9._-]+", "<ocid>", t)
    return t


def leer_env(texto):
    """PURA. {NOMBRE: valor} de un archivo de entorno (`export X=…`, comillas, comentarios)."""
    salida = {}
    for linea in str(texto or "").splitlines():
        linea = linea.strip()
        if not linea or linea.startswith("#") or "=" not in linea:
            continue
        if linea.startswith("export "):
            linea = linea[7:].strip()
        k, v = linea.split("=", 1)
        k, v = k.strip(), v.strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
            v = v[1:-1]
        if re.match(r"^[A-Z][A-Z0-9_]*$", k):
            salida.setdefault(k, v)
    return salida


def variables_para_a1(env):
    """PURA. Las variables que viajan al A1 (lista blanca) con valor no vacío, y las que faltan."""
    van = {k: env[k] for k in CLAVES_A1 if str(env.get(k) or "").strip()}
    url = van.get("STARSEED_PASARELA_GROQ_URL", "")
    if re.search(r"//(127\.0\.0\.1|localhost)", url):
        for k in [k for k in van if k.startswith("STARSEED_PASARELA_GROQ_")]:
            van.pop(k)
    faltan = [k for k in CLAVES_A1 if k not in van]
    return van, faltan


def contenido_env(variables):
    """PURA. Archivo de entorno: un valor simple va tal cual; uno con espacios o símbolos, entre
    comillas simples (lo leen igual el orquestador, opencode y `set -a; . env`)."""
    lineas = []
    for k in sorted(variables):
        v = str(variables[k])
        if re.match(r"^[A-Za-z0-9._:/+=,@%-]*$", v):
            lineas.append("%s=%s" % (k, v))
        else:
            lineas.append("%s='%s'" % (k, v.replace("'", "'\"'\"'")))
    return "\n".join(lineas) + "\n"


def con_variable(texto_env, nombre, valor):
    """PURA. El archivo de entorno con `nombre=valor` puesto (sustituye la línea si ya estaba)."""
    lineas = [l for l in str(texto_env or "").splitlines()
              if not re.match(r"^(export\s+)?%s=" % re.escape(nombre), l.strip())]
    lineas.append("%s=%s" % (nombre, valor))
    return "\n".join(lineas).rstrip("\n") + "\n"


def ramas_por_relevar(en_a1, relevadas):
    """PURA. Las ramas de entrega del A1 (`nube/a1-*`) que aún no subieron a GitHub (o que se
    reescribieron con otro sha). `en_a1`: {rama: sha}; `relevadas`: {rama: sha}."""
    return sorted(r for r, sha in (en_a1 or {}).items()
                  if str(r).startswith(PREFIJO_ENTREGA) and (relevadas or {}).get(r) != sha)


def nodo_vivo(estado_a1, ahora, max_s=LATIDO_VIVO_S):
    """PURA. ¿Late el nodo? (su latido tiene menos de `max_s` segundos)."""
    try:
        return ahora - float((estado_a1 or {}).get("latido") or 0) < max_s
    except (TypeError, ValueError):
        return False


def decidir_lanzar(estado_a1, ahora, consumo, ultimo_lanzamiento, colas_sin_tomar):
    """PURA. (lanzar, motivo). Solo con el nodo vivo y libre, sin freno de gasto, sin una cola
    suya esperando a que la tome y sin otro lanzamiento hace menos de 20 min."""
    if not nodo_vivo(estado_a1, ahora):
        return False, "el nodo del A1 no late"
    freno = ((consumo or {}).get("freno") or {}) if isinstance(consumo, dict) else {}
    if freno.get("activo"):
        return False, "freno de gasto de Oracle: %s" % (freno.get("motivo") or "gasto > 0")
    if (estado_a1 or {}).get("fase") == "cola":
        return False, "el A1 ya trabaja una cola (%s)" % ((estado_a1 or {}).get("cola") or "?")
    if colas_sin_tomar:
        return False, "el A1 aún no ha tomado %s" % ", ".join(colas_sin_tomar)
    if ultimo_lanzamiento and ahora - float(ultimo_lanzamiento) < ESPERA_ENTRE_LANZAMIENTOS_S:
        return False, "lanzado hace %d min" % int((ahora - float(ultimo_lanzamiento)) / 60)
    return True, "A1 libre"


def marcar_oracle(progreso, ids, fecha, rama):
    """PURA. Copia del progreso con esos ids como `reasignada · oracle` (préstamo al A1)."""
    p = {k: dict(v) if isinstance(v, dict) else v for k, v in (progreso or {}).items()}
    for tid in ids:
        entrada = dict(p.get(tid)) if isinstance(p.get(tid), dict) else {}
        entrada.update(estado="reasignada", medio="oracle",
                       nota="reasignada al A1 de Oracle %s (%s)" % (fecha, rama))
        p[tid] = entrada
    return p


def devolver_de_oracle(progreso, lanzamientos, colas_a1, nodo_late, ahora, gracia_s=3 * 3600):
    """PURA. Los ids `reasignada · oracle` que vuelven a la cola de la Mac: los de una cola que el
    A1 ya terminó (su trabajo, si lo hubo, ya viaja en `nube/a1-*` y `traer_nube` lo trae o lo
    repara: necesita que la tarea deje de estar «reasignada») y todos si el nodo no late y su
    cola lleva más de `gracia_s` sin terminar. Préstamo, no traspaso (como `reclamar_varadas`).
    `lanzamientos`: [{rama, ids, t}]; `colas_a1`: {rama: {...historial}}."""
    terminadas = set(colas_a1 or {})
    vuelven = set()
    for l in lanzamientos or []:
        rama = l.get("rama")
        if rama in terminadas or (not nodo_late and ahora - float(l.get("t") or 0) > gracia_s):
            vuelven |= set(l.get("ids") or [])
    return sorted(tid for tid in vuelven
                  if isinstance((progreso or {}).get(tid), dict)
                  and progreso[tid].get("estado") == "reasignada"
                  and (progreso[tid].get("medio") or "") == "oracle")


def resumen_para_oracle_json(estado_a1, publico, ahora):
    """PURA. Lo que se guarda en ~/.starseed/oracle.json: `nodo` (latido, fase, orquestador,
    guardián, carga) y `servicios` [{nombre, ok, ms, t, detalle}] — sin URLs, IPs ni claves.
    `publico`: {ok, ms, codigo} de la sonda HTTPS desde esta neurona (o None)."""
    e = estado_a1 or {}
    servicios = []
    t = e.get("t") or ""
    for s in e.get("servicios") or []:
        if isinstance(s, dict):
            servicios.append({"nombre": s.get("nombre"), "titulo": s.get("titulo") or s.get("nombre"),
                              "ok": bool(s.get("ok")), "activo": s.get("activo"), "ms": s.get("ms"), "t": t,
                              "detalle": tachar(s.get("detalle") or "")})
    if publico is not None:
        servicios.append({"nombre": "bitnet-publico", "titulo": "BitNet desde fuera (HTTPS + clave)",
                          "ok": bool(publico.get("ok")), "activo": "active" if publico.get("ok") else "inactive",
                          "ms": publico.get("ms"), "t": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ahora)),
                          "detalle": "salud %s desde esta neurona" % publico.get("codigo")})
    carga = e.get("carga") or {}
    guardian = e.get("guardian") or None
    nodo = {
        "latido": e.get("latido"),
        "vivo": nodo_vivo(e, ahora),
        "fase": e.get("fase"),
        "cola": e.get("cola"),
        "orquestador": e.get("orquestador"),
        "colas": e.get("colas"),
        "entregas": len(e.get("entregas") or []),
        "guardian": ({k: guardian.get(k) for k in ("t", "sha", "origen", "asunto", "ok", "pasos", "minutos")}
                     if isinstance(guardian, dict) else None),
        "carga": {k: carga.get(k) for k in ("load", "cpu_1h", "mem_ahora", "cpu_p95_7d")},
        "horas": (carga.get("horas") or [])[-24:],
        "disco_libre_gb": e.get("disco_libre_gb"),
        "leido": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ahora)),
    }
    return nodo, servicios


def borradores_nuevos(lineas_mac, lineas_a1):
    """PURA. Las filas de la cola de MetaGeminis del A1 (`cola.jsonl`, una por línea) que la cola de
    esta neurona aún no tiene, por su `huella`. Una línea que no es JSON o sin huella no viaja.
    Solo son BORRADORES «para_aprobar»: aprobar sigue siendo cosa de Alex en MetaGenesis."""
    vistas = set()
    for l in lineas_mac or []:
        try:
            vistas.add(json.loads(l).get("huella"))
        except (ValueError, AttributeError):
            continue
    nuevas = []
    for l in lineas_a1 or []:
        try:
            fila = json.loads(l)
        except ValueError:
            continue
        h = fila.get("huella") if isinstance(fila, dict) else None
        if h and h not in vistas and fila.get("estado", "para_aprobar") == "para_aprobar":
            vistas.add(h)
            nuevas.append(json.dumps(dict(fila, medio=fila.get("medio") or "oracle_a1"), ensure_ascii=False))
    return nuevas


def aviso_de_cambio(previo, nodo):
    """PURA. Una frase para el Chat Director SOLO cuando algo cambia de verdad: el nodo empieza o
    deja de latir, o el guardián de main pasa de verde a rojo (o al revés). None si nada cambió."""
    previo = previo or {}
    partes = []
    if bool(previo.get("vivo")) != bool(nodo.get("vivo")):
        partes.append("el nodo del A1 de Oracle %s" % ("late otra vez" if nodo.get("vivo") else "ha dejado de latir"))
    g0, g1 = previo.get("guardian") or {}, nodo.get("guardian") or {}
    if g1.get("t") and g1.get("t") != g0.get("t") and g1.get("ok") != g0.get("ok", g1.get("ok")):
        rojos = [p.get("paso") for p in g1.get("pasos") or [] if not p.get("ok")]
        partes.append("el guardián de main (A1) dice %s en %s «%s»%s" % (
            "VERDE" if g1.get("ok") else "ROJO", str(g1.get("sha") or "")[:8], g1.get("asunto") or "",
            (": falla " + ", ".join(rojos)) if rojos else ""))
    return ("Oracle A1: " + "; ".join(partes) + ".") if partes else None


# ── la máquina ──────────────────────────────────────────────────────────────────────────────────

def _leer(ruta, defecto):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def _escribir(ruta, datos, modo=0o600):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    tmp = "%s.tmp-%d" % (ruta, os.getpid())
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    os.chmod(tmp, modo)
    os.replace(tmp, ruta)


def _ip():
    datos = _leer(ORACLE_JSON, {}) or {}
    for i in datos.get("instancias") or []:
        if isinstance(i, dict) and "a1" in str(i.get("nombre") or "") and i.get("ip_publica"):
            return str(i["ip_publica"])
    return ""


def _host_https():
    ip = _ip()
    return ("%s.sslip.io" % ip.replace(".", "-")) if ip else ""


def _ssh_base():
    return ["ssh", "-i", LLAVE, "-o", "BatchMode=yes", "-o", "ConnectTimeout=15",
            "-o", "StrictHostKeyChecking=accept-new", "-o", "LogLevel=ERROR", "-o", "ServerAliveInterval=30"]


def ssh(orden, entrada=None, timeout=120):
    """(rc, salida tachada). La IP sale de oracle.json y nunca se imprime."""
    ip = _ip()
    if not ip:
        return 2, "sin A1 en ~/.starseed/oracle.json"
    try:
        r = subprocess.run(_ssh_base() + ["%s@%s" % (USUARIO_SSH, ip), orden], input=entrada,
                           capture_output=True, text=True, timeout=timeout)
        return r.returncode, tachar((r.stdout or "") + (r.stderr or ""), ip)
    except Exception as e:  # noqa: BLE001
        return 1, tachar("%s: %s" % (type(e).__name__, e), ip)


def _git(args, timeout=300, env=None):
    try:
        r = subprocess.run(["git", *args], cwd=RAIZ, capture_output=True, text=True, timeout=timeout, env=env)
        return r.returncode, tachar((r.stdout or "") + (r.stderr or ""), _ip())
    except Exception as e:  # noqa: BLE001
        return 1, "%s: %s" % (type(e).__name__, e)


class _Cerrojo:
    def __init__(self, nombre, espera_s):
        self.ruta = os.path.join(CERROJOS, nombre + ".lock")
        self.espera_s, self.f = espera_s, None

    def __enter__(self):
        os.makedirs(CERROJOS, exist_ok=True)
        self.f = open(self.ruta, "a")
        t0 = time.time()
        while True:
            try:
                fcntl.flock(self.f, fcntl.LOCK_EX | fcntl.LOCK_NB)
                return self
            except BlockingIOError:
                if time.time() - t0 >= self.espera_s:
                    self.f.close()
                    raise TimeoutError("cerrojo %s ocupado" % self.ruta)
                time.sleep(2)

    def __exit__(self, *exc):
        try:
            fcntl.flock(self.f, fcntl.LOCK_UN)
        finally:
            self.f.close()


def _avisar(texto):
    try:
        import director_chat

        director_chat.publicar(texto, de="director-nube", rol="director", tipo="informe")
    except Exception:  # noqa: BLE001
        pass


# ── instalar ──

def _paquete(destino):
    """Arma la carpeta que viaja al A1. Devuelve la lista de lo incluido (rutas relativas)."""
    incluido = []

    def fuente(rel):
        """La versión de FUENTE si existe; si no, la del repo."""
        candidata = os.path.join(FUENTE, rel)
        return candidata if os.path.exists(candidata) else os.path.join(RAIZ, rel)

    def poner(origen, rel):
        if not os.path.exists(origen):
            return
        d = os.path.join(destino, rel)
        os.makedirs(os.path.dirname(d), exist_ok=True)
        subprocess.run(["cp", "-p", origen, d], check=True)
        incluido.append(rel)

    nodo = fuente(os.path.join("deploy", "oracle", "nodo"))
    for base, _, archivos in os.walk(nodo):
        for a in archivos:
            o = os.path.join(base, a)
            poner(o, os.path.relpath(o, nodo))
    poner(fuente("deploy/nube/opencode.json"), "opencode.json")
    poner(fuente("scripts/puente/oracle_a1.py"), "oracle_a1.py")
    enj = os.path.join(RAIZ, "scripts", "enjambre")
    for a in sorted(os.listdir(enj)):
        if (a.endswith(".py") and not a.startswith("test_") and a != "conftest.py") or a == "instalar.sh":
            poner(os.path.join(enj, a), os.path.join("enjambre", a))
    # MetaGeminis en borrador: su árbol mínimo (lee el directorio y CLAUDE.md desde su raíz).
    if os.path.exists(fuente("scripts/sociales/metageminis.py")):
        for rel in ("scripts/sociales/metageminis.py", "src/lib/metageminis/directorio.ts", "CLAUDE.md",
                    "scripts/puente/decidir.py"):
            poner(fuente(rel), os.path.join("metageminis", rel))
    # El nodo de MetaGenesis (OPA1011), si ya existe: viaja con su servicio si lo trae.
    for carpeta in {os.path.join(RAIZ, "scripts", "puente"), os.path.join(FUENTE, "scripts", "puente")}:
        if not os.path.isdir(carpeta):
            continue
        for a in sorted(os.listdir(carpeta)):
            if a.startswith("nodo_metagenesis") and a.endswith(".py") and not a.startswith("test_"):
                poner(os.path.join(carpeta, a), os.path.join("metagenesis", a))
    return incluido


def instalar(esperar=False, minutos=40):
    with tempfile.TemporaryDirectory(prefix="starseed-nodo-") as tmp:
        carpeta = os.path.join(tmp, "starseed-nodo")
        os.makedirs(carpeta)
        incluido = _paquete(carpeta)
        tgz = os.path.join(tmp, "starseed-nodo.tgz")
        with tarfile.open(tgz, "w:gz") as t:
            t.add(carpeta, arcname="starseed-nodo")
        ip = _ip()
        if not ip:
            return {"ok": False, "motivo": "sin A1 en ~/.starseed/oracle.json"}
        with open(tgz, "rb") as f:
            datos = f.read()
    r = subprocess.run(_ssh_base() + ["%s@%s" % (USUARIO_SSH, ip),
                                      "rm -rf /tmp/starseed-nodo /tmp/starseed-nodo.tgz && cat > /tmp/starseed-nodo.tgz "
                                      "&& tar xzf /tmp/starseed-nodo.tgz -C /tmp && echo subido"],
                       input=datos, capture_output=True, timeout=300)
    if r.returncode != 0:
        return {"ok": False, "motivo": tachar(r.stderr.decode(errors="replace"), ip)[-300:]}
    rc, salida = ssh("sudo nohup bash /tmp/starseed-nodo/preparar-a1.sh /tmp/starseed-nodo >/dev/null 2>&1 & echo lanzado")
    res = {"ok": rc == 0, "incluido": len(incluido), "metageminis": any(i.startswith("metageminis/") for i in incluido),
           "metagenesis": [i for i in incluido if i.startswith("metagenesis/")], "salida": salida.strip()[-200:]}
    if esperar and rc == 0:
        fin = time.time() + minutos * 60
        while time.time() < fin:
            time.sleep(20)
            _, fase = ssh("cat %s/preparar-fase.txt 2>/dev/null" % ESTADO_A1, timeout=40)
            res["fase"] = fase.strip()
            if res["fase"] == "listo":
                break
        _, cola = ssh("sudo tail -n 15 /var/log/starseed/preparar.log", timeout=40)
        res["registro"] = cola.strip().splitlines()[-15:]
    return res


# ── claves ──

def _env_local():
    env = {}
    for ruta in ARCHIVOS_ENV:
        try:
            with open(os.path.expanduser(ruta), encoding="utf-8") as f:
                for k, v in leer_env(f.read()).items():
                    env.setdefault(k, v)
        except OSError:
            continue
    return env


def claves():
    van, faltan = variables_para_a1(_env_local())
    rc, salida = ssh("umask 077; cat > /tmp/starseed-env.$$ && sudo install -o starseed -g starseed -m 600 /tmp/starseed-env.$$ "
                     "/home/starseed/.starseed/env; r=$?; rm -f /tmp/starseed-env.$$; exit $r",
                     entrada=contenido_env(van), timeout=60)
    res = {"ok": rc == 0, "copiadas": sorted(van), "sin_valor_aqui": faltan, "error": "" if rc == 0 else salida[-200:]}
    # La clave del BitNet nació en el A1: viene a esta neurona por el mismo túnel y se guarda en
    # ~/.starseed/env (600) con copia del archivo anterior. Nunca se imprime.
    rc2, clave = ssh("sudo cat /etc/starseed/bitnet.key 2>/dev/null", timeout=40)
    clave = clave.strip()
    if rc2 == 0 and re.match(r"^[0-9a-f]{64}$", clave):
        try:
            with open(ENV_STARSEED, encoding="utf-8") as f:
                actual = f.read()
        except OSError:
            actual = ""
        if leer_env(actual).get(NOMBRE_CLAVE_BITNET) != clave:
            if actual:
                with open(ENV_STARSEED + ".bak-oracle-%s" % time.strftime("%Y%m%d-%H%M%S"), "w") as f:
                    f.write(actual)
            tmp = ENV_STARSEED + ".tmp-%d" % os.getpid()
            with open(tmp, "w", encoding="utf-8") as f:
                f.write(con_variable(actual, NOMBRE_CLAVE_BITNET, clave))
            os.chmod(tmp, 0o600)
            os.replace(tmp, ENV_STARSEED)
        res["clave_bitnet"] = NOMBRE_CLAVE_BITNET + " en ~/.starseed/env"
    else:
        res["clave_bitnet"] = "aún no existe en el A1 (la crea preparar-a1.sh)"
    # Sin reiniciar nada: el orquestador lee ~/.starseed/env al arrancar cada cola, y reiniciar el
    # nodo a mitad de una cola o del guardián tiraba trabajo (medido el 2026-10-10).
    return res


# ── estado ──

def _sonda_publica():
    host = _host_https()
    if not host:
        return None
    t0 = time.time()
    try:
        r = subprocess.run(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "-m", "12",
                            "https://bitnet.%s/health" % host], capture_output=True, text=True, timeout=20)
        codigo = r.stdout.strip() or "000"
    except Exception:  # noqa: BLE001
        codigo = "000"
    return {"ok": codigo == "200", "codigo": codigo, "ms": int((time.time() - t0) * 1000)}


def estado(guardar=True):
    rc, salida = ssh("cat %s/estado.json" % ESTADO_A1, timeout=40)
    try:
        estado_a1 = json.loads(salida) if rc == 0 else {}
    except ValueError:
        estado_a1 = {}
    ahora = time.time()
    nodo, servicios = resumen_para_oracle_json(estado_a1, _sonda_publica(), ahora)
    if not estado_a1:
        nodo["error"] = salida.strip()[-200:] or "sin respuesta del A1"
    if guardar:
        datos = _leer(ORACLE_JSON, {}) or {}
        previo = datos.get("nodo")
        datos["nodo"], datos["servicios"] = nodo, servicios
        _escribir(ORACLE_JSON, datos)
        aviso = aviso_de_cambio(previo, nodo)
        if aviso:
            _avisar(aviso)
    return estado_a1, nodo, servicios


# ── traer ──

def traer(estado_a1=None):
    """Sube a GitHub las ramas `nube/a1-*` del A1 y devuelve a la cola lo que el A1 ya terminó."""
    ip = _ip()
    if not ip:
        return {"ok": False, "motivo": "sin A1"}
    rc, salida = ssh("sudo -u starseed git -C %s for-each-ref --format='%%(refname:short) %%(objectname)' refs/heads/nube/" % REPO_A1)
    en_a1 = dict(l.split() for l in salida.splitlines() if len(l.split()) == 2) if rc == 0 else {}
    datos = _leer(ESTADO, {}) or {}
    relevadas = datos.setdefault("relevadas", {})
    subidas, errores = [], []
    pendientes = ramas_por_relevar(en_a1, relevadas)
    if pendientes:
        env = dict(os.environ, GIT_SSH_COMMAND=" ".join(_ssh_base()))
        url = "%s@%s:%s" % (USUARIO_SSH, ip, REPO_A1)
        refspecs = ["+refs/heads/%s:refs/oracle-a1/%s" % (r, r) for r in pendientes]
        rc, out = _git(["fetch", "-q", "--upload-pack=sudo -u starseed git-upload-pack", url, *refspecs], env=env, timeout=600)
        if rc != 0:
            errores.append("traer del A1: " + out.strip()[-200:])
        else:
            for r in pendientes:
                rc, out = _git(["push", "-q", "origin", "refs/oracle-a1/%s:refs/heads/%s" % (r, r)], timeout=180)
                if rc == 0:
                    relevadas[r] = en_a1[r]
                    subidas.append(r)
                else:
                    try:
                        motivo = _nube_gh().motivo_push(out)
                    except Exception:  # noqa: BLE001
                        motivo = out.strip()[-200:]
                    errores.append("%s: %s" % (r, motivo))
    # Préstamo, no traspaso: lo que el A1 ya terminó vuelve a la cola de la Mac para que
    # `traer_nube` lo traiga o lo repare (con la tarea «reasignada» no lo toca).
    if estado_a1 is None:
        estado_a1, _, _ = estado(guardar=False)
    rc, hist = ssh("cat %s/colas.json" % ESTADO_A1, timeout=40)
    try:
        colas = json.loads(hist).get("historial") or [] if rc == 0 else []
    except ValueError:
        colas = []
    terminadas = {c.get("rama"): c for c in colas if isinstance(c, dict) and c.get("rama")}
    devueltas = []
    lanzamientos = datos.get("lanzamientos") or []
    with _Cerrojo("progreso", 60):
        progreso = _leer(PROGRESO, {}) or {}
        ids = devolver_de_oracle(progreso, lanzamientos, terminadas, nodo_vivo(estado_a1, time.time()), time.time())
        if ids:
            import repartir_nube as RN

            envios = RN.envios_vigentes(os.path.join(RAIZ, "enjambre", "colas"))
            nuevo = RN.devolver_a_pendiente(progreso, ids, time.strftime("%Y%m%d"), envios=envios)
            for tid in ids:
                if isinstance(nuevo.get(tid), dict):
                    nuevo[tid]["nota"] = str(nuevo[tid].get("nota") or "").replace("de la nube", "del A1 de Oracle", 1)
            _escribir(PROGRESO, nuevo, modo=0o644)
            devueltas = ids
    hechos = {c.get("rama") for c in colas}
    datos["lanzamientos"] = [l for l in lanzamientos if l.get("rama") not in hechos][-20:]
    _escribir(ESTADO, datos)
    borradores = traer_borradores()
    if subidas or devueltas:
        _avisar("Oracle A1: %s%s" % (
            ("subo a GitHub %d rama(s) de trabajo del A1 (%s); traer_nube las pasa por sus puertas. " % (len(subidas), ", ".join(subidas))) if subidas else "",
            ("Vuelven a la cola de la Mac (el A1 terminó su cola): %s." % ", ".join(devueltas)) if devueltas else ""))
    return {"ok": not errores, "subidas": subidas, "devueltas": devueltas, "borradores": borradores, "errores": errores}


def traer_borradores():
    """Los borradores de MetaGeminis que redactó el A1 pasan a la cola de esta neurona
    (~/.starseed/metageminis/cola.jsonl), donde viven los suyos hasta que la tabla exista."""
    rc, salida = ssh("sudo -u starseed cat /home/starseed/.starseed/metageminis/cola.jsonl 2>/dev/null", timeout=40)
    if rc != 0 or not salida.strip():
        return 0
    ruta = os.path.join(HOME, ".starseed", "metageminis", "cola.jsonl")
    try:
        with open(ruta, encoding="utf-8") as f:
            mias = f.read().splitlines()
    except OSError:
        mias = []
    nuevas = borradores_nuevos(mias, salida.splitlines())
    if nuevas:
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        with open(ruta, "a", encoding="utf-8") as f:
            f.write("\n".join(nuevas) + "\n")
    return len(nuevas)


def _ruta_puente(nombre):
    """El guion hermano: junto a este archivo o, si se corre desde otra carpeta, el del repo."""
    aqui = os.path.join(DIRECTORIO, nombre)
    return aqui if os.path.exists(aqui) else os.path.join(RAIZ, "scripts", "puente", nombre)


def _nube_gh():
    spec = importlib.util.spec_from_file_location("nube_gh", _ruta_puente("nube-gh.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _repartir():
    spec = importlib.util.spec_from_file_location("repartir_a_nube", _ruta_puente("repartir-a-nube.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ── lanzar ──

def colas_sin_tomar(estado_a1):
    """Las ramas `colas/oracle-*` de GitHub que el A1 aún no procesó."""
    rc, salida = _git(["ls-remote", "--heads", "origin", PREFIJO_COLA + "*"], timeout=60)
    remotas = {l.split("refs/heads/")[-1].strip(): l.split()[0] for l in salida.splitlines() if "refs/heads/" in l} if rc == 0 else {}
    rc, hist = ssh("cat %s/colas.json" % ESTADO_A1, timeout=40)
    try:
        procesadas = json.loads(hist).get("procesadas") or {} if rc == 0 else {}
    except ValueError:
        procesadas = {}
    return sorted(r for r, sha in remotas.items() if procesadas.get(r) != sha), remotas, procesadas


def lanzar(tope=TOPE_DEFECTO, simular=False, cola_dada=None):
    """Reparte N tareas del atraso al A1 o, con `cola_dada` (ruta a un JSON de tareas), le manda esa
    cola tal cual (una tarea escrita para él, o una cola que alguien quiere que corra allí)."""
    import repartir_nube as RN
    from vigilante_logica import es_cola_de_codigo  # noqa: F401  (el reparto la usa)

    if RN.nube_pausada():
        return {"ok": False, "motivo": "la nube está en pausa (~/.starseed/nube-pausada.json)"}
    rep = _repartir()
    rep.validar_raiz(RAIZ)
    if cola_dada:
        d = _leer(cola_dada, None)
        elegidas = d.get("tareas", d) if isinstance(d, dict) else d
        if not isinstance(elegidas, list) or not all(isinstance(t, dict) and t.get("id") for t in elegidas):
            return {"ok": False, "motivo": "la cola dada no es una lista de tareas con id"}
    else:
        colas = rep.colas_fuente()
        progreso = _leer(PROGRESO, {}) or {}
        try:
            from cambio_pedido import aplicar_a_todas
            colas = [(n, aplicar_a_todas(t, progreso)) for n, t in colas]
        except Exception:  # noqa: BLE001
            pass
        envios = RN.envios_vigentes(os.path.join(RAIZ, "enjambre", "colas"))
        try:
            procesos = subprocess.run(["ps", "-axo", "args="], capture_output=True, text=True, timeout=20).stdout
        except Exception:  # noqa: BLE001
            procesos = ""
        en_la_mac = RN.ids_de_la_tanda_viva(procesos, OLAS)
        if en_la_mac:
            colas = [(n, [t for t in ts if str((t or {}).get("id")) not in en_la_mac]) for n, ts in colas]
        elegidas = RN.elegir(colas, progreso, rep.asuntos_main(RAIZ), rep.ola_actual(colas), tope=tope, envios=envios)
    ids = [t["id"] for t in elegidas]
    if simular or not elegidas:
        return {"ok": True, "simulado": simular, "ids": ids, "motivo": "" if elegidas else "no hay atraso que pueda ir al A1"}
    import datetime

    ahora = datetime.datetime.now()
    destino = os.path.join(RAIZ, "enjambre", "colas")
    nombre = rep.nombre_destino(ahora, destino)
    ruta = os.path.join(destino, nombre)
    _escribir(ruta, {"ola": "oracle-%s" % ahora.strftime("%Y%m%d"), "medio": "oracle", "tareas": elegidas}, modo=0o644)
    cola_rel = "enjambre/colas/" + nombre
    gh = _nube_gh()
    estado_rel = "enjambre/colas/estado-" + os.path.splitext(nombre)[0]
    copiados = gh.preparar_estado_para_nube(HOME, os.path.join(RAIZ, estado_rel))
    from cola_en_rama import commit_suelto_con_cola

    try:
        ref = commit_suelto_con_cola(RAIZ, cola_rel, "enjambre: reparto al A1 de Oracle · %s" % nombre,
                                     extras=((estado_rel,) if copiados else ()))
    except RuntimeError as e:
        os.replace(ruta, ruta + ".no-lanzada")
        return {"ok": False, "motivo": "no pude preparar el commit de la cola: %s" % e}
    rama = PREFIJO_COLA + ahora.strftime("%Y%m%d-%H%M%S")
    rc, out = _git(["push", "-q", "origin", "%s:refs/heads/%s" % (ref, rama)], timeout=180)
    if rc != 0:
        os.replace(ruta, ruta + ".no-lanzada")
        return {"ok": False, "motivo": "no pude subir la cola: %s" % gh.motivo_push(out)}
    with _Cerrojo("progreso", 60):
        progreso = _leer(PROGRESO, {}) or {}
        _escribir(PROGRESO, marcar_oracle(progreso, ids, ahora.strftime("%Y%m%d"), rama), modo=0o644)
    datos = _leer(ESTADO, {}) or {}
    datos.setdefault("lanzamientos", []).append({"rama": rama, "cola": nombre, "ids": ids, "t": time.time()})
    datos["ultimo_lanzamiento"] = time.time()
    _escribir(ESTADO, datos)
    _podar_colas()
    _avisar("Oracle A1: le mando %d tarea(s) en %s (%s). Las trabaja con 2 agentes y modelos gratuitos; "
            "lo que haga vuelve por ramas nube/a1-* y pasa las puertas de main." % (len(ids), rama, ", ".join(ids)))
    return {"ok": True, "rama": rama, "ids": ids, "cola": nombre}


def _podar_colas(dejar=DEJAR_COLAS):
    """Ramas `colas/oracle-*` viejas fuera del remoto, nunca las que el A1 aún no tomó."""
    sin_tomar, remotas, _ = colas_sin_tomar(None)
    ramas = sorted(remotas)
    for r in ramas[:-dejar] if len(ramas) > dejar else []:
        if r not in sin_tomar:
            _git(["push", "-q", "origin", "--delete", r], timeout=60)


# ── ciclo ──

def ciclo(lanzar_si_libre=True, tope=TOPE_DEFECTO):
    try:
        with _Cerrojo("oracle-nodo", 0):
            estado_a1, nodo, servicios = estado()
            res = {"nodo": {k: nodo.get(k) for k in ("vivo", "fase", "cola")},
                   "servicios": {s["nombre"]: s["ok"] for s in servicios}}
            basura = [x for x in (estado_a1 or {}).get("servicios") or []
                      if x.get("nombre") == "bitnet" and "BASURA" in str(x.get("detalle") or "")]
            if basura:
                res["bitnet_pesos"] = bitnet_pesos()
            res["traer"] = traer(estado_a1)
            if lanzar_si_libre:
                sin_tomar, _, _ = colas_sin_tomar(estado_a1)
                datos = _leer(ESTADO, {}) or {}
                ok, motivo = decidir_lanzar(estado_a1, time.time(), _leer(CONSUMO_JSON, {}),
                                            datos.get("ultimo_lanzamiento"), sin_tomar)
                res["lanzar"] = lanzar(tope=tope) if ok else {"ok": True, "no": motivo}
            return res
    except TimeoutError:
        return {"ocupado": "ya hay otro ciclo del nodo en marcha"}


def _sha256(ruta):
    import hashlib

    h = hashlib.sha256()
    with open(ruta, "rb") as f:
        for trozo in iter(lambda: f.read(1 << 20), b""):
            h.update(trozo)
    return h.hexdigest()


def bitnet_pesos():
    """Deja en el A1 los pesos BitNet en layout ARM (los de la Mac, verificados por su huella).
    Sube 1,2 GB por el túnel SSH (unos 7 min); conserva los originales como `.strided32-x86.bak`."""
    rc, salida = ssh("sudo sha256sum %s" % MODELO_A1, timeout=180)
    if rc == 0 and salida.split()[0:1] == [SHA_BITNET_ARM]:
        return {"ok": True, "hecho": "el A1 ya tiene los pesos ARM"}
    if not os.path.exists(PESOS_ARM_LOCAL):
        return {"ok": False, "motivo": "esta neurona no tiene los pesos ARM (%s)" % PESOS_ARM_LOCAL}
    if _sha256(PESOS_ARM_LOCAL) != SHA_BITNET_ARM:
        return {"ok": False, "motivo": "los pesos locales no tienen la huella ARM validada"}
    ip = _ip()
    r = subprocess.run(["scp", "-q", "-i", LLAVE, "-o", "BatchMode=yes", "-o", "LogLevel=ERROR", PESOS_ARM_LOCAL,
                        "%s@%s:/tmp/bitnet-arm.gguf" % (USUARIO_SSH, ip)], capture_output=True, text=True, timeout=7200)
    if r.returncode != 0:
        return {"ok": False, "motivo": "scp: " + tachar(r.stderr, ip)[-200:]}
    rc, salida = ssh(
        "set -e; [ \"$(sha256sum /tmp/bitnet-arm.gguf | cut -d' ' -f1)\" = %s ] || { echo huella-distinta; exit 3; }; "
        "M=%s; [ -f \"$M.strided32-x86.bak\" ] || sudo mv \"$M\" \"$M.strided32-x86.bak\"; "
        "sudo install -o starseed -g starseed -m 644 /tmp/bitnet-arm.gguf \"$M\"; rm -f /tmp/bitnet-arm.gguf; "
        "sudo systemctl restart starseed-bitnet.service; echo instalado" % (SHA_BITNET_ARM, MODELO_A1), timeout=300)
    return {"ok": rc == 0 and "instalado" in salida, "salida": salida.strip()[-200:]}


def probar_bitnet():
    host = _host_https()
    clave = _env_local().get(NOMBRE_CLAVE_BITNET, "")
    if not host or not clave:
        return {"ok": False, "motivo": "falta el A1 o %s" % NOMBRE_CLAVE_BITNET}
    cuerpo = json.dumps({"messages": [{"role": "user", "content": "Explica en dos frases qué es la sociedad StarSeed."}],
                         "max_tokens": 64, "temperature": 0.2})
    t0 = time.time()
    r = subprocess.run(["curl", "-s", "-m", "120", "https://bitnet.%s/v1/chat/completions" % host,
                        "-H", "Content-Type: application/json", "-H", "Authorization: Bearer " + clave, "-d", cuerpo],
                       capture_output=True, text=True, timeout=130)
    dur = time.time() - t0
    sin_clave = subprocess.run(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "-m", "20",
                                "https://bitnet.%s/v1/models" % host], capture_output=True, text=True, timeout=30).stdout
    try:
        d = json.loads(r.stdout)
        texto = d["choices"][0]["message"]["content"].strip()
        toks = int((d.get("usage") or {}).get("completion_tokens") or 0)
    except Exception:  # noqa: BLE001
        return {"ok": False, "segundos": round(dur, 1), "respuesta": tachar(r.stdout[:200]), "sin_clave": sin_clave}
    return {"ok": True, "segundos": round(dur, 1), "tokens": toks, "tok_s": round(toks / dur, 1) if toks else None,
            "texto": texto[:240], "sin_clave_responde": sin_clave}


def main(argv):
    orden = argv[1] if len(argv) > 1 else "estado"
    tope = int(argv[argv.index("--tope") + 1]) if "--tope" in argv else TOPE_DEFECTO
    if orden == "instalar":
        r = instalar(esperar="--esperar" in argv)
    elif orden == "claves":
        r = claves()
    elif orden == "estado":
        _, nodo, servicios = estado()
        r = {"nodo": nodo, "servicios": servicios}
    elif orden == "traer":
        r = traer()
    elif orden == "lanzar":
        cola = argv[argv.index("--cola") + 1] if "--cola" in argv else None
        r = lanzar(tope=tope, simular="--simular" in argv, cola_dada=cola)
    elif orden == "ciclo":
        try:
            r = ciclo(lanzar_si_libre="--sin-lanzar" not in argv, tope=tope)
        except Exception as e:  # noqa: BLE001 — el A1 nunca deja sin pasada a traer_nube
            r = {"error": tachar("%s: %s" % (type(e).__name__, e), _ip())}
        print(json.dumps(r, ensure_ascii=False, indent=1), flush=True)
        if "--y-traer-nube" in argv:
            # La autocuración llama así: lo que el A1 acaba de subir entra en esta misma pasada.
            return subprocess.run([sys.executable, _ruta_puente("traer_nube.py"), "revisar", "--aplicar"],
                                  cwd=RAIZ).returncode
        return 0
    elif orden == "probar-bitnet":
        r = probar_bitnet()
    elif orden == "bitnet-pesos":
        r = bitnet_pesos()
    else:
        print(__doc__)
        return 2
    print(json.dumps(r, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
