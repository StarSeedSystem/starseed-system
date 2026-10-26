#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""El A1 de Oracle como nodo SIEMPRE ENCENDIDO de MetaGenesis — el lado del A1 (OPO1011, 2026-10-10).

Alex (2026-10-10), con el medidor de Oracle delante: «starseed-a1 lleva 2,3 días ocioso (CPU p95
0,52 %, memoria 5,26 %, red 0 %; umbral 20 %). Si sigue así, Oracle puede reclamarlo desde el 14
oct … solucionala». La regla de Oracle: una máquina Always Free se reclama si en 7 días la CPU
(p95), la red y, en A1, la memoria quedan TODAS por debajo del 20 %. Este servicio le da trabajo
ÚTIL y sostenido — nada de bucles vacíos que solo calienten la CPU:

1. **Medio del enjambre.** Cada 2 min mira (HTTPS, solo lectura, repo público) las ramas
   `colas/oracle-*` que una neurona dejó con `oracle_nodo.py lanzar` (el mismo commit suelto que
   usa la nube de GitHub: el código de la Mac + la cola + su estado de modelos). Con una cola
   nueva: `main` = ese commit, corre el orquestador del enjambre (`~/bin/starseed-enjambre.py`,
   el mismo archivo que la Mac y la nube) y deja lo hecho en ramas `nube/a1-<fecha>` (lo que
   pasó sus puertas aquí) y `nube/a1-<fecha>-<id>` (el trabajo de cada tarea, haya pasado o no).
   Nadie empuja desde aquí: una neurona con la llave SSH las sube a GitHub (`oracle_nodo.py
   traer`) y main las pasa por SUS puertas (`traer_nube.py`, que ya lee `nube/*`). No se usa
   `nube-ola/…`: `traer_nube` no lo lee y ese trabajo se perdería.
2. **Guardián de main.** Sin cola, cada `GUARDIAN_CADA_H` horas (o antes si el main de la Mac
   cambió) comprueba ese main como el CI: `tsc --noEmit`, `vitest run` y el núcleo mesh. El
   veredicto queda para Genesis y los directores («main estaba en verde/rojo a las HH:MM»). Es el
   CI continuo que faltaba: las bloqueadas se juzgaban sin saber si el rojo era de main.
3. **Estado** cada minuto en `/var/lib/starseed/nodo/estado.json`, sin IPs, claves ni ids:
   servicios (BitNet, Caddy, MetaGeminis…), orquestador, guardián, colas, entregas y la carga
   medida aquí (CPU y memoria por hora), que es lo que Oracle mira.
4. **Bandeja del nodo de MetaGenesis** (OPA1011). Cuando el líder de MetaGenesis manda una cola
   a este medio (relevo si la Mac calla), la deja en `~/.starseed/nodo-metagenesis/entrantes/
   cola-*.json`. Se trabaja igual que una `colas/oracle-*`, sobre el main más reciente que se
   conoce, y se entrega por las mismas ramas `nube/a1-*`. La bandeja nunca adelanta a una cola
   que trae su propio código: va después de las `colas/oracle-*` y antes que el guardián.
5. **Main VIVO de la Mac** (OPO1011, tarde del 10-10). En cada ciclo la neurona deja en
   `~/entrada/main-mac.bundle` un paquete git con lo que su `main` lleva por delante de
   `origin/main` (`oracle_nodo.py enviar-main`, por SSH; nada pasa por GitHub). El guardián lo
   importa a `refs/mac/main` y lo cuenta como candidato: así comprueba el main que de verdad se
   está escribiendo (cada 45 min si cambió) y no el mismo sha publicado cada 2 h. Medido antes:
   sin colas para la nube, el guardián solo veía `origin/main` y el A1 bajaba al 0,5 % de CPU.

Cuando su propio archivo cambia (una neurona reinstaló el nodo), se reinicia solo al quedar libre:
con una cola en marcha la instalación no lo corta, y el código nuevo entra en cuanto termina.

Decisiones PURAS con sus pruebas en `test_oracle_a1.py`. Solo biblioteca estándar (el A1 no tiene
el venv de la Mac). Uso (lo arranca systemd: `starseed-medio.service`):
  python3 oracle_a1.py servir            bucle del nodo
  python3 oracle_a1.py estado            una foto del estado (JSON)
  python3 oracle_a1.py guardian [--ya]   una pasada del guardián
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import signal
import subprocess
import sys
import time

HOME = os.path.expanduser("~")
RAIZ = os.environ.get("STARSEED_ROOT") or os.path.join(HOME, "starseed-system")
ESTADO_DIR = os.environ.get("STARSEED_NODO_ESTADO") or "/var/lib/starseed/nodo"
ORQUESTADOR = os.environ.get("STARSEED_ORQUESTADOR") or os.path.join(HOME, "bin", "starseed-enjambre.py")


def orquestador_para(raiz, explicito=os.environ.get("STARSEED_ORQUESTADOR"), defecto=ORQUESTADOR):
    """El orquestador de la PROPIA cola: el `scripts/enjambre/starseed-enjambre.py` del main que trae.

    (2026-10-14, medido) El A1 corría `~/bin/starseed-enjambre.py` del 10-10: cada cola llegaba con
    el main de la Mac al día y la ejecutaba un orquestador de cuatro días antes (sin el montón de tsc
    por medio, sin el «soltar» con medio…), y nada lo ponía al día salvo reinstalar el nodo. Como en
    la nube, que instala el suyo desde lo que trae. Un STARSEED_ORQUESTADOR puesto a mano manda."""
    if explicito:
        return explicito
    propio = os.path.join(raiz, "scripts", "enjambre", "starseed-enjambre.py")
    return propio if os.path.isfile(propio) else defecto
LOGS = os.path.join(HOME, "registros")
ARCHIVO_OLAS = os.path.join(HOME, "archivo-olas")
PREFIJO_COLA = "colas/oracle-"
PREFIJO_ENTREGA = "nube/a1-"
#: Bandeja del nodo de MetaGenesis (OPA1011, `nodo_metagenesis_medio.lanzar_cola`).
BANDEJA = os.environ.get("STARSEED_A1_BANDEJA") or os.path.join(HOME, ".starseed", "nodo-metagenesis", "entrantes")
PREFIJO_BANDEJA = "entrantes/"
RE_ENTRANTE = re.compile(r"^cola-[A-Za-z0-9._-]{1,80}\.json$")
RE_ID_TAREA = re.compile(r"^[A-Za-z0-9._-]{1,60}$")
#: Main vivo de la Mac (punto 5): paquete git que deja la neurona y la ref local donde se importa.
ENTRADA_MAIN = os.environ.get("STARSEED_A1_ENTRADA_MAIN") or os.path.join(HOME, "entrada", "main-mac.bundle")
REF_MAIN_MAC = "refs/mac/main"
TRABAJADORES = int(os.environ.get("STARSEED_A1_TRABAJADORES", "2"))
MINUTOS_COLA = int(os.environ.get("STARSEED_A1_MINUTOS", "180"))
GUARDIAN_CADA_S = int(float(os.environ.get("STARSEED_GUARDIAN_CADA_H", "2")) * 3600)
GUARDIAN_MIN_S = int(os.environ.get("STARSEED_GUARDIAN_MIN_S", "2700"))  # 45 min entre pasadas
SONDEO_S = int(os.environ.get("STARSEED_A1_SONDEO_S", "120"))
DIAS_ENTREGAS = 7
DEJAR_ARCHIVO_OLAS = 15
HOST_ARCHIVO = "/etc/starseed/host"
CLAVE_BITNET = "/etc/starseed/bitnet.key"
MODELO_BITNET = os.path.join(HOME, "astraura", "backend", "BitNet", "models", "BitNet-b1.58-2B-4T", "ggml-model-i2_s.gguf")
CALIDAD_CADA_S = 3600

#: Pasos del guardián: los cuatro del CI (`.github/workflows/ci.yml`). `next build` es la ÚNICA
#: puerta que ve un módulo de servidor colado en el paquete del navegador (CLAUDE.md, «Publicar»);
#: en la Mac no se puede (no cabe) y aquí sí: 12 GB, con BitNet aparte y por delante en CPU.
#: Medido el 2026-10-10 en este A1 (main 4f2ead81): tsc 210 s · vitest 546 s (8.128 pruebas) ·
#: mesh 5 s. Cada paso: (nombre, orden, tope en segundos).
PASOS_GUARDIAN = (
    ("tsc", ["npx", "tsc", "--noEmit"], 2400),
    ("vitest", ["npx", "vitest", "run", "--maxWorkers=2", "--minWorkers=1"], 5400),
    ("mesh", ["npx", "--yes", "tsx", "scripts/test-mesh-core.ts"], 900),
    ("build", ["bash", "-c", "npm run prebuild >/dev/null 2>&1; NODE_ENV=production "
               "NODE_OPTIONS=--max-old-space-size=5120 NEXT_TELEMETRY_DISABLED=1 npx next build"], 4200),
)


# ── decisiones (puras) ──────────────────────────────────────────────────────────────────────────

def colas_pendientes(refs, procesadas):
    """PURA. Las ramas `colas/oracle-*` que aún no se trabajaron, la más vieja primero.
    `refs`: {rama: (sha, fecha_ts)}; `procesadas`: {rama: sha}. Una rama que se reescribió
    (otro sha con el mismo nombre) vuelve a contar: es otra cola."""
    salida = []
    for rama, (sha, fecha) in (refs or {}).items():
        if not str(rama).startswith(PREFIJO_COLA):
            continue
        if (procesadas or {}).get(rama) == sha:
            continue
        salida.append((float(fecha or 0), rama))
    return [r for _, r in sorted(salida)]


def cola_de_commit(nombres):
    """PURA. La cola que trae un commit de reparto (`enjambre/colas/cola-*.json`), o None."""
    for n in nombres or []:
        n = str(n).strip()
        if re.match(r"^enjambre/colas/cola-[^/]+\.json$", n):
            return n
    return None


def entrantes_pendientes(archivos):
    """PURA. Las colas que el nodo de MetaGenesis dejó en la bandeja, la más vieja primero.
    `archivos`: [(nombre, mtime)]. Solo `cola-*.json` (lo que escribe `lanzar_cola`); un
    temporal a medio escribir (`.tmp`) o cualquier otro archivo no cuenta."""
    validos = [(float(t or 0), str(n)) for n, t in archivos or [] if RE_ENTRANTE.match(str(n))]
    return [n for _, n in sorted(validos)]


def tareas_de_entrante(datos):
    """PURA. Las tareas de una cola de la bandeja: una lista de tareas o `{"tareas": [...]}`.
    Solo diccionarios con un id válido y sin repetir (un id solo puede vivir en una cola, CLAUDE.md
    trampa 2). Lista vacía si no queda ninguna: esa cola no se trabaja."""
    lista = datos.get("tareas") if isinstance(datos, dict) else datos
    salida, vistos = [], set()
    for t in lista if isinstance(lista, list) else []:
        if not isinstance(t, dict):
            continue
        tid = str(t.get("id") or "")
        if not RE_ID_TAREA.match(tid) or tid in vistos:
            continue
        vistos.add(tid)
        salida.append(t)
    return salida


def bundle_por_importar(mtime_archivo, mtime_importado):
    """PURA. ¿Hay un paquete del main de la Mac sin importar? Solo si existe y es otro (por su
    hora de escritura) que el último importado con éxito: uno que falló se reintenta solo."""
    if not mtime_archivo:
        return False
    return float(mtime_archivo) != float(mtime_importado or 0)


def objetivo_guardian(candidatos):
    """PURA. El commit que el guardián debe comprobar: el más reciente entre origin/main y los
    padres de las ramas de cola (cada una lleva el main de la Mac del momento del reparto, que
    va por delante de lo publicado). `candidatos`: [(sha, fecha_ts, origen)] → (sha, origen)."""
    validos = [c for c in candidatos or [] if c and c[0]]
    if not validos:
        return None, ""
    sha, _, origen = max(validos, key=lambda c: float(c[1] or 0))
    return sha, origen


def guardian_toca(ultimo, ahora, sha_objetivo, cada_s=GUARDIAN_CADA_S, min_s=GUARDIAN_MIN_S, ocupado=False):
    """PURA. ¿Toca una pasada del guardián? Nunca con una cola en marcha (no se le quita CPU al
    enjambre). Sí si nunca se pasó, si pasó `cada_s`, o si el main cambió y pasó `min_s`.
    `ultimo`: {t, sha} de la última pasada (o None)."""
    if ocupado or not sha_objetivo:
        return False
    if not ultimo or not ultimo.get("t"):
        return True
    hace = ahora - float(ultimo.get("t") or 0)
    if hace >= cada_s:
        return True
    return ultimo.get("sha") != sha_objetivo and hace >= min_s


def resumen_paso(nombre, rc, salida):
    """PURA. Una línea legible del resultado de un paso del guardián."""
    texto = salida or ""
    if rc == 124:
        return "cortado: pasó su tope de tiempo"
    if nombre == "vitest":
        m = re.search(r"Tests\s+([^\n]+)", texto)
        if m:
            return re.sub(r"\x1b\[[0-9;]*m", "", m.group(1)).strip()[:160]
    if nombre == "tsc":
        errores = len(re.findall(r"error TS\d+", texto))
        return "0 errores" if rc == 0 else "%d error(es) de tipos" % errores
    if nombre == "build":
        limpio = re.sub(r"\x1b\[[0-9;]*m", "", texto)
        m = re.search(r"Compiled successfully in ([^\n]+)", limpio)
        if rc == 0:
            return ("compila (%s)" % m.group(1).strip()) if m else "compila"
        for patron in (r"UnhandledSchemeError[^\n]*", r"Module not found:[^\n]*", r"Type error:[^\n]*",
                       r"Failed to compile[^\n]*(?:\n\s*)*[^\n]*"):
            fallo = re.search(patron, limpio)
            if fallo:
                return ("NO compila: " + " ".join(fallo.group(0).split()))[:160]
        return "NO compila (rc=%s)" % rc
    lineas = [l.strip() for l in re.sub(r"\x1b\[[0-9;]*m", "", texto).splitlines() if l.strip()]
    return (lineas[-1] if lineas else ("ok" if rc == 0 else "rc=%s" % rc))[:160]


def nombres_entrega(ts, ramas_ola):
    """PURA. Los nombres de las ramas de entrega de una cola terminada a la hora `ts`
    (AAAAmmdd-HHMMSS): la integración (`nube/a1-<ts>`) y una HERMANA por cada rama `ola/<id>`
    con trabajo (`nube/a1-<ts>-<id>`). Hermana y no hija: git no admite `nube/a1-<ts>` y
    `nube/a1-<ts>/…` a la vez, y `traer_nube` solo trae `nube/*`."""
    principal = PREFIJO_ENTREGA + ts
    olas = {}
    for r in ramas_ola or []:
        r = str(r)
        if r.startswith("ola/") and re.match(r"^[A-Za-z0-9._-]+$", r[4:]):
            olas[r] = "%s-%s" % (principal, r[4:])
    return principal, olas


def entregas_viejas(ramas, ahora, dias=DIAS_ENTREGAS):
    """PURA. Ramas de entrega (`nube/a1-*`) con más de `dias` días: se podan. La fecha va en el
    nombre; un nombre sin fecha no se toca."""
    fuera = []
    for r in ramas or []:
        m = re.match(r"^nube/a1-(\d{8})-(\d{6})", str(r))
        if not m:
            continue
        try:
            t = time.mktime(time.strptime(m.group(1) + m.group(2), "%Y%m%d%H%M%S"))
        except ValueError:
            continue
        if ahora - t > dias * 86400:
            fuera.append(r)
    return fuera


def carga_por_hora(muestras, ahora, horas=24):
    """PURA. Medias por hora de CPU y memoria (lo que Oracle mira, con puntos de 1 h) de las
    muestras por minuto `[(t, cpu_pct, mem_pct)]`. Devuelve [{h, cpu, mem, n}] de la más vieja a
    la más nueva y la p95 de CPU de esas horas (None sin datos)."""
    cubos = {}
    for t, cpu, mem in muestras or []:
        if ahora - t > horas * 3600:
            continue
        h = int(t // 3600)
        c = cubos.setdefault(h, [0.0, 0.0, 0])
        c[0] += float(cpu)
        c[1] += float(mem)
        c[2] += 1
    filas = [{"h": time.strftime("%Y-%m-%dT%H:00Z", time.gmtime(h * 3600)),
              "cpu": round(c[0] / c[2], 1), "mem": round(c[1] / c[2], 1), "n": c[2]}
             for h, c in sorted(cubos.items())]
    cpus = sorted(f["cpu"] for f in filas)
    p95 = None
    if cpus:
        i = max(0, min(len(cpus) - 1, int(round(0.95 * (len(cpus) - 1)))))
        p95 = cpus[i]
    return filas, p95


def calidad_respuesta(texto):
    """PURA. ¿El BitNet razona o devuelve basura? La sonda pregunta por la capital de Francia
    (la misma prueba con la que se validó el vendorizado): con los pesos en el layout de otra
    arquitectura responde palabras sueltas sin sentido (medido en este A1 el 2026-10-10)."""
    return "paris" in str(texto or "").lower().replace("í", "i")


def resumen_modelos_ollama(tags):
    """PURA. «qwen3.5:4b (3,3 GB)» por modelo de la respuesta de `/api/tags` de Ollama; «sin modelos»
    si no hay ninguno o la respuesta no se entiende. (2026-10-19) El Ollama del A1 sirve tareas CORTAS:
    en 2 núcleos ARM lee ~15 tokens/s, así que no es escritor del enjambre (medido)."""
    try:
        modelos = (tags or {}).get("models") or []
        partes = ["%s (%s GB)" % (m["name"], ("%.1f" % (m.get("size", 0) / 1e9)).replace(".", ","))
                  for m in modelos if isinstance(m, dict) and m.get("name")]
    except (AttributeError, TypeError, ValueError):
        partes = []
    return ", ".join(partes) if partes else "sin modelos"


def sin_secretos(texto):
    """PURA. Quita de un texto lo que nunca debe salir del A1: IPs, ids de Oracle y valores con
    forma de clave. Para los resúmenes que viajan en el estado."""
    t = str(texto or "")
    t = re.sub(r"\b\d{1,3}(?:\.\d{1,3}){3}\b", "<ip>", t)
    t = re.sub(r"\b\d{1,3}(?:-\d{1,3}){3}\.sslip\.io\b", "<host>", t)
    t = re.sub(r"ocid1\.[A-Za-z0-9._-]+", "<ocid>", t)
    t = re.sub(r"\b(sk|gsk|xai|nvapi|ghp|gho|hf)[-_][A-Za-z0-9_-]{12,}", "<clave>", t)
    return t


# ── la máquina ──────────────────────────────────────────────────────────────────────────────────

def _git(args, timeout=300, cwd=None):
    try:
        r = subprocess.run(["git", *args], cwd=cwd or RAIZ, capture_output=True, text=True, timeout=timeout)
        return r.returncode, (r.stdout or "") + (r.stderr or "")
    except Exception as e:  # noqa: BLE001
        return 1, "%s: %s" % (type(e).__name__, e)


def sha_y_fecha(rc, salida):
    """PURA (2026-10-26, CAP1026H): (sha, fecha) de `git log -1 --format=%H|%ct`; ("", None) si git falló.

    MEDIDO el 26-10 a las 18:33 (hora del A1): con la máquina sin aire, el `git log` pasó de 300 s y `_git`
    devolvió el texto del TimeoutExpired, que también lleva «|» («…'--format=%H|%ct', 'refs/mac/main']' timed
    out…»): `float()` reventaba y `starseed-medio` (el medio del enjambre y el guardián de main) salía con
    error. Un git lento es un dato que falta, no una caída del servicio."""
    if rc != 0:
        return "", None
    texto = (salida or "").strip()
    linea = texto.splitlines()[0] if texto else ""
    sha, _, t = linea.partition("|")
    sha = sha.strip()
    if len(sha) < 7 or any(c not in "0123456789abcdef" for c in sha):
        return "", None
    try:
        return sha, float(t.strip())
    except ValueError:
        return sha, None


def _leer(ruta, defecto):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def _escribir(ruta, datos):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    tmp = "%s.tmp-%d" % (ruta, os.getpid())
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    os.chmod(tmp, 0o644)
    os.replace(tmp, ruta)


def _entorno(extra=None):
    e = dict(os.environ)
    rutas = [os.path.join(HOME, ".npm-global", "bin"), os.path.join(HOME, "bin"), "/usr/local/bin", "/usr/bin", "/bin"]
    e["PATH"] = ":".join(rutas + [e.get("PATH", "")])
    e.setdefault("NODE_OPTIONS", "--max-old-space-size=4096")
    e.setdefault("STARSEED_MEDIO", "oracle")
    e.setdefault("STARSEED_DONDE", "oracle")
    e.setdefault("NEEDLE_TELEMETRY", "0")
    e.setdefault("STARSEED_ESPERA_APROBACION_S", "600")
    e["STARSEED_ROOT"] = RAIZ
    e.setdefault("STARSEED_WT", os.path.join(HOME, "starseed-wt"))
    e.update(extra or {})
    return e


class Nodo:
    """El bucle del nodo y su estado vivo (lo que escribe cada minuto)."""

    def __init__(self):
        self.vivo = {"fase": "arrancando", "desde": time.time()}
        self.muestras = []
        self._cpu_prev = None
        self._ultimo_estado = 0.0
        self._salir = False
        self._calidad = {"t": 0.0, "ok": None, "texto": ""}
        self._sha_modelo = ""
        self._mi_huella = self._huella_propia()
        self._main_mac = {"mtime": 0.0, "error": ""}
        previo = _leer(os.path.join(ESTADO_DIR, "carga.json"), {})
        self.muestras = [tuple(m) for m in previo.get("muestras") or [] if isinstance(m, list) and len(m) == 3]

    # ── medir ──
    def _cpu_pct(self):
        try:
            with open("/proc/stat") as f:
                partes = [float(x) for x in f.readline().split()[1:]]
        except OSError:
            return None
        ocioso, total = partes[3] + (partes[4] if len(partes) > 4 else 0), sum(partes)
        previo, self._cpu_prev = self._cpu_prev, (ocioso, total)
        if not previo or total <= previo[1]:
            return None
        return round(100.0 * (1 - (ocioso - previo[0]) / (total - previo[1])), 1)

    @staticmethod
    def _mem_pct():
        info = {}
        try:
            with open("/proc/meminfo") as f:
                for l in f:
                    k, v = l.split(":", 1)
                    info[k] = float(v.split()[0])
        except OSError:
            return None
        total, libre = info.get("MemTotal"), info.get("MemAvailable")
        return round(100.0 * (total - libre) / total, 1) if total and libre is not None else None

    def muestrear(self):
        cpu, mem = self._cpu_pct(), self._mem_pct()
        ahora = time.time()
        if cpu is not None and mem is not None:
            self.muestras.append((ahora, cpu, mem))
            self.muestras = [m for m in self.muestras if ahora - m[0] <= 7 * 86400][-12000:]

    # ── servicios ──
    @staticmethod
    def _activo(unidad):
        try:
            r = subprocess.run(["systemctl", "is-active", unidad], capture_output=True, text=True, timeout=10)
            return r.stdout.strip() or "?"
        except Exception:  # noqa: BLE001
            return "?"

    @staticmethod
    def _habilitado(unidad):
        try:
            r = subprocess.run(["systemctl", "is-enabled", unidad], capture_output=True, text=True, timeout=10)
            return r.stdout.strip() == "enabled"
        except Exception:  # noqa: BLE001
            return False

    @staticmethod
    def _http(url, extra=()):
        t0 = time.time()
        try:
            r = subprocess.run(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "-m", "8", *extra, url],
                               capture_output=True, text=True, timeout=12)
            return r.stdout.strip(), int((time.time() - t0) * 1000)
        except Exception:  # noqa: BLE001
            return "000", int((time.time() - t0) * 1000)

    def sonda_calidad(self):
        """Una pregunta corta al BitNet, como mucho una vez por hora: la salud 200 no dice si razona."""
        if time.time() - self._calidad["t"] < CALIDAD_CADA_S:
            return self._calidad
        try:
            with open(CLAVE_BITNET, encoding="utf-8") as f:
                clave = f.read().strip()
        except OSError:
            return self._calidad
        import urllib.request
        cuerpo = json.dumps({"prompt": "The capital of France is", "n_predict": 8, "temperature": 0}).encode()
        req = urllib.request.Request("http://127.0.0.1:8790/completion", data=cuerpo,
                                     headers={"Content-Type": "application/json", "Authorization": "Bearer " + clave})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                texto = json.loads(r.read()).get("content") or ""
            self._calidad = {"t": time.time(), "ok": calidad_respuesta(texto), "texto": sin_secretos(texto)[:60]}
        except Exception:  # noqa: BLE001 — sin respuesta no hay veredicto de calidad
            self._calidad = {"t": time.time(), "ok": None, "texto": ""}
        if not self._sha_modelo and os.path.exists(MODELO_BITNET):
            r = subprocess.run(["sha256sum", MODELO_BITNET], capture_output=True, text=True, timeout=120)
            self._sha_modelo = r.stdout[:16]
        return self._calidad

    def servicios(self):
        filas = []
        codigo, ms = self._http("http://127.0.0.1:8790/health")
        calidad = self.sonda_calidad() if codigo == "200" else {"ok": None, "texto": ""}
        detalle = "salud local %s" % codigo
        if calidad.get("ok") is True:
            detalle += " · razona (capital de Francia → París)"
        elif calidad.get("ok") is False:
            detalle += " · RESPONDE BASURA: pesos en el layout de otra arquitectura (oracle_nodo.py bitnet-pesos)"
        filas.append({"nombre": "bitnet", "titulo": "BitNet b1.58 (Astraura)", "activo": self._activo("starseed-bitnet.service"),
                      "ok": codigo == "200" and calidad.get("ok") is not False, "ms": ms, "detalle": detalle,
                      "pesos": self._sha_modelo})
        try:
            with open(HOST_ARCHIVO, encoding="utf-8") as f:
                host = f.read().strip()
        except OSError:
            host = ""
        if host:
            # Por Caddy y con el certificado de verdad, resolviendo el nombre a esta máquina.
            codigo, ms = self._http("https://bitnet.%s/health" % host, ("--resolve", "bitnet.%s:443:127.0.0.1" % host))
            filas.append({"nombre": "caddy", "titulo": "HTTPS (Caddy · sslip.io)", "activo": "active" if codigo != "000" else "inactive",
                          "ok": codigo == "200", "ms": ms, "detalle": "BitNet por HTTPS %s" % codigo})
        for unidad, nombre, titulo in (("starseed-metageminis.timer", "metageminis", "MetaGeminis (borradores)"),
                                       ("starseed-metagenesis.service", "metagenesis", "Nodo de MetaGenesis")):
            estado = self._activo(unidad)
            if estado not in ("inactive", "unknown", "?") or os.path.exists("/etc/systemd/system/" + unidad):
                filas.append({"nombre": nombre, "titulo": titulo, "activo": estado, "ok": estado == "active", "ms": None,
                              "detalle": unidad})
        # (2026-10-19) Ollama del A1, solo en 127.0.0.1 (`deploy/oracle/nodo/ollama-a1.sh`): modelos locales
        # del servidor del cerebro para tareas cortas (chat breve, resumen, visión), nunca expuesto fuera.
        # Se enseña solo si está ENCENDIDO al arranque: medido, hoy no mejora ningún proceso y queda apagado
        # (Alex: «hazlo solo si mejora u optimiza los procesos»); apagado no es una avería.
        if os.path.exists("/etc/systemd/system/ollama.service") and self._habilitado("ollama.service"):
            codigo, ms = self._http("http://127.0.0.1:11434/api/version")
            modelos = "sin respuesta"
            if codigo == "200":
                import urllib.request
                try:
                    with urllib.request.urlopen("http://127.0.0.1:11434/api/tags", timeout=8) as r:
                        modelos = resumen_modelos_ollama(json.loads(r.read()))
                except Exception:  # noqa: BLE001 — la salud ya dice si responde
                    modelos = "sin lista de modelos"
            filas.append({"nombre": "ollama", "titulo": "Ollama (modelos locales · tareas cortas)",
                          "activo": self._activo("ollama.service"), "ok": codigo == "200", "ms": ms,
                          "detalle": "salud local %s · %s" % (codigo, modelos)})
        return filas

    # ── estado ──
    def escribir_estado(self, forzar=False):
        ahora = time.time()
        if not forzar and ahora - self._ultimo_estado < 55:
            return
        self._ultimo_estado = ahora
        self.muestrear()
        horas, p95 = carga_por_hora(self.muestras, ahora, horas=24 * 7)
        _escribir(os.path.join(ESTADO_DIR, "carga.json"), {"muestras": [list(m) for m in self.muestras]})
        colas = _leer(os.path.join(ESTADO_DIR, "colas.json"), {})
        guardian = _leer(os.path.join(ESTADO_DIR, "guardian.json"), {})
        try:
            libre = os.statvfs(HOME)
            disco_gb = round(libre.f_bavail * libre.f_frsize / 1e9, 1)
        except OSError:
            disco_gb = None
        try:
            with open("/proc/loadavg") as f:
                load = [float(x) for x in f.read().split()[:3]]
        except OSError:
            load = []
        ultima = (colas.get("historial") or [None])[-1]
        _escribir(os.path.join(ESTADO_DIR, "estado.json"), {
            "v": 1,
            "t": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ahora)),
            "latido": ahora,
            "nodo": "starseed-a1",
            "fase": self.vivo.get("fase"),
            "fase_desde": self.vivo.get("desde"),
            "cola": self.vivo.get("cola"),
            "servicios": self.servicios(),
            "orquestador": {"vivo": self.vivo.get("fase") == "cola", "cola": self.vivo.get("cola"),
                            "trabajadores": TRABAJADORES},
            "colas": {"procesadas": len(colas.get("procesadas") or {}), "ultima": ultima},
            "entregas": colas.get("entregas") or [],
            "guardian": guardian.get("ultimo"),
            "main_mac": self._resumen_main_mac(),
            "carga": {"load": load, "cpu_1h": horas[-1]["cpu"] if horas else None,
                      "mem_ahora": self.muestras[-1][2] if self.muestras else None,
                      "cpu_p95_7d": p95, "horas": horas[-48:]},
            "disco_libre_gb": disco_gb,
        })

    def _resumen_main_mac(self):
        """Lo que la neurona necesita para no reenviar el mismo paquete (sin rutas ni claves)."""
        sha, fecha = sha_y_fecha(*_git(["log", "-1", "--format=%H|%ct", REF_MAIN_MAC]))
        return {"sha": sha, "fecha": fecha,
                "importado": self._main_mac.get("mtime") or None, "error": self._main_mac.get("error") or ""}

    # ── correr un proceso largo latiendo ──
    def correr(self, orden, log, tope_s, env=None, cwd=None):
        os.makedirs(os.path.dirname(log), exist_ok=True)
        with open(log, "ab") as salida:
            p = subprocess.Popen(orden, cwd=cwd or RAIZ, env=env or _entorno(), stdout=salida, stderr=subprocess.STDOUT,
                                 stdin=subprocess.DEVNULL, start_new_session=True)
            t0 = time.time()
            while p.poll() is None:
                if self._salir or time.time() - t0 > tope_s:
                    try:
                        os.killpg(p.pid, signal.SIGTERM)
                        p.wait(60)
                    except Exception:  # noqa: BLE001
                        try:
                            os.killpg(p.pid, signal.SIGKILL)
                        except Exception:  # noqa: BLE001
                            pass
                    return 124, time.time() - t0
                self.escribir_estado()
                time.sleep(5)
            return p.returncode, time.time() - t0

    # ── colas ──
    def refs_remotas(self):
        _git(["fetch", "-q", "--prune", "origin", "+refs/heads/main:refs/remotes/origin/main",
              "+refs/heads/colas/*:refs/remotes/origin/colas/*"], timeout=600)
        _, salida = _git(["for-each-ref", "--format=%(refname)|%(objectname)|%(committerdate:unix)",
                          "refs/remotes/origin/colas/", "refs/remotes/origin/main"])
        refs = {}
        for linea in salida.splitlines():
            partes = linea.split("|")
            if len(partes) != 3:
                continue
            refs[partes[0].replace("refs/remotes/origin/", "", 1)] = (partes[1], float(partes[2] or 0))
        return refs

    def entregar(self, base, ts):
        """Ramas de entrega de lo hecho desde `base`. Devuelve los nombres creados."""
        creadas = []
        _, n = _git(["rev-list", "--count", "%s..HEAD" % base])
        if n.strip().isdigit() and int(n.strip()) > 0:
            principal, _ = nombres_entrega(ts, [])
            if _git(["branch", "-f", principal, "HEAD"])[0] == 0:
                creadas.append(principal)
        _, ramas = _git(["for-each-ref", "--format=%(refname:short)", "refs/heads/ola/"])
        con_trabajo = []
        for r in [x.strip() for x in ramas.splitlines() if x.strip()]:
            _, c = _git(["rev-list", "--count", "%s..%s" % (base, r)])
            if c.strip().isdigit() and int(c.strip()) > 0:
                con_trabajo.append(r)
        _, olas = nombres_entrega(ts, con_trabajo)
        for r, destino in olas.items():
            if _git(["branch", "-f", destino, r])[0] == 0:
                creadas.append(destino)
        return creadas

    def limpiar_tras_cola(self):
        """Worktrees y ramas `ola/*` de la cola que acabó (lo útil ya está en sus entregas) y
        archivo de su carpeta de olas: la siguiente cola empieza limpia, como un runner."""
        _, wts = _git(["worktree", "list", "--porcelain"])
        for linea in wts.splitlines():
            if linea.startswith("worktree ") and os.path.realpath(linea[9:]) != os.path.realpath(RAIZ):
                _git(["worktree", "remove", "--force", linea[9:]])
        _git(["worktree", "prune"])
        _, ramas = _git(["for-each-ref", "--format=%(refname:short)", "refs/heads/ola/"])
        for r in [x.strip() for x in ramas.splitlines() if x.strip()]:
            _git(["branch", "-D", r])
        olas = os.path.join(RAIZ, "starseed_memory_root", "olas")
        if os.path.isdir(olas):
            os.makedirs(ARCHIVO_OLAS, exist_ok=True)
            os.replace(olas, os.path.join(ARCHIVO_OLAS, time.strftime("%Y%m%d-%H%M%S")))
            viejas = sorted(os.listdir(ARCHIVO_OLAS))[:-DEJAR_ARCHIVO_OLAS]
            for v in viejas:
                subprocess.run(["rm", "-rf", os.path.join(ARCHIVO_OLAS, v)], check=False)
        _, todas = _git(["for-each-ref", "--format=%(refname:short)", "refs/heads/nube/"])
        for r in entregas_viejas(todas.split(), time.time()):
            _git(["branch", "-D", r])

    def _anotar_cola(self, rama, sha, extra):
        colas = _leer(os.path.join(ESTADO_DIR, "colas.json"), {})
        procesadas = colas.setdefault("procesadas", {})
        procesadas[rama] = sha
        historial = colas.setdefault("historial", [])
        historial.append(dict(extra, rama=rama))
        colas["historial"] = historial[-30:]
        entregas = [e for e in colas.get("entregas") or [] if e not in entregas_viejas([e], time.time())]
        colas["entregas"] = sorted(set(entregas) | set(extra.get("entregas") or []))
        _escribir(os.path.join(ESTADO_DIR, "colas.json"), colas)

    def reanudar_interrumpida(self):
        """Si el servicio murió con una cola a medias (reinicio, actualización), lo hecho se
        entrega antes de nada: el próximo `checkout -B main` lo borraría."""
        en_curso = _leer(os.path.join(ESTADO_DIR, "en-curso.json"), None)
        if not en_curso:
            return
        ts = time.strftime("%Y%m%d-%H%M%S")
        creadas = self.entregar(en_curso.get("base"), ts)
        self._anotar_cola(en_curso.get("rama"), en_curso.get("sha"), {
            "inicio": en_curso.get("inicio"), "fin": time.time(), "rc": "interrumpida",
            "entregas": creadas, "cola": en_curso.get("cola")})
        self.limpiar_tras_cola()
        os.remove(os.path.join(ESTADO_DIR, "en-curso.json"))

    def procesar_cola(self, rama, sha):
        _, nombres = _git(["diff-tree", "--no-commit-id", "--name-only", "-r", sha])
        cola = cola_de_commit(nombres.splitlines())
        if not cola:
            self._anotar_cola(rama, sha, {"inicio": time.time(), "fin": time.time(), "rc": "sin-cola", "entregas": []})
            return
        _git(["reset", "-q", "--hard"])
        _git(["clean", "-fdq"])
        if _git(["checkout", "-q", "-B", "main", sha])[0] != 0:
            self._anotar_cola(rama, sha, {"inicio": time.time(), "fin": time.time(), "rc": "checkout", "entregas": []})
            return
        # El estado de la Mac que viajó con la cola (rotación y salud de modelos, sin claves).
        estado_dir = os.path.join(RAIZ, "enjambre", "colas", "estado-" + os.path.splitext(os.path.basename(cola))[0])
        if os.path.isdir(estado_dir):
            os.makedirs(os.path.join(HOME, ".starseed"), exist_ok=True)
            for n in os.listdir(estado_dir):
                if n.endswith(".json"):
                    subprocess.run(["cp", os.path.join(estado_dir, n), os.path.join(HOME, ".starseed", n)], check=False)
        self._correr_cola(rama, sha, cola)

    def _correr_cola(self, clave, sha, cola):
        """Corre el orquestador sobre `cola` (ruta relativa a RAIZ) con `main` ya en su sitio y
        entrega lo hecho. `clave`/`sha` identifican la cola en `colas.json` (rama o bandeja)."""
        _, base = _git(["rev-parse", "HEAD"])
        base = base.strip()
        os.makedirs(os.path.join(RAIZ, "starseed_memory_root", "olas"), exist_ok=True)
        inicio = time.time()
        _escribir(os.path.join(ESTADO_DIR, "en-curso.json"), {"rama": clave, "sha": sha, "base": base, "cola": cola, "inicio": inicio})
        self.vivo = {"fase": "cola", "desde": inicio, "cola": os.path.basename(cola)}
        self.escribir_estado(forzar=True)
        log = os.path.join(LOGS, "cola-%s.log" % clave.replace("/", "_"))
        rc, dur = self.correr(["timeout", "-k", "60", "%dm" % MINUTOS_COLA, "python3", "-u", orquestador_para(RAIZ), cola,
                               "--workers", str(TRABAJADORES)], log, MINUTOS_COLA * 60 + 180)
        ts = time.strftime("%Y%m%d-%H%M%S")
        creadas = self.entregar(base, ts)
        self._anotar_cola(clave, sha, {"inicio": inicio, "fin": time.time(), "rc": rc, "minutos": round(dur / 60, 1),
                                       "entregas": creadas, "cola": os.path.basename(cola)})
        self.limpiar_tras_cola()
        try:
            os.remove(os.path.join(ESTADO_DIR, "en-curso.json"))
        except OSError:
            pass
        self.vivo = {"fase": "espera", "desde": time.time()}

    # ── bandeja del nodo de MetaGenesis ──
    def entrantes(self):
        try:
            archivos = [(n, os.path.getmtime(os.path.join(BANDEJA, n))) for n in os.listdir(BANDEJA)
                        if os.path.isfile(os.path.join(BANDEJA, n))]
        except OSError:
            return []
        return entrantes_pendientes(archivos)

    def procesar_entrante(self, nombre, refs):
        """Una cola que dejó el líder de MetaGenesis: sale de la bandeja ANTES de correr (si el
        servicio muere a mitad, `reanudar_interrumpida` entrega lo hecho y no se repite) y se
        trabaja sobre el main más reciente que conoce este nodo."""
        ruta = os.path.join(BANDEJA, nombre)
        datos = _leer(ruta, None)
        tareas = tareas_de_entrante(datos)
        huella = hashlib.sha256(json.dumps(datos, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()[:16]
        clave = PREFIJO_BANDEJA + nombre
        hechas = os.path.join(BANDEJA, "hechas")
        os.makedirs(hechas, exist_ok=True)
        try:
            os.replace(ruta, os.path.join(hechas, "%s.%s" % (nombre, time.strftime("%Y%m%d-%H%M%S"))))
        except OSError:
            pass
        ahora = time.time()
        if not tareas:
            self._anotar_cola(clave, huella, {"inicio": ahora, "fin": ahora, "rc": "sin-tareas", "entregas": []})
            return
        sha, _ = objetivo_guardian(self.candidatos_main(refs))
        _git(["reset", "-q", "--hard"])
        _git(["clean", "-fdq"])
        if not sha or _git(["checkout", "-q", "-B", "main", sha])[0] != 0:
            self._anotar_cola(clave, huella, {"inicio": ahora, "fin": ahora, "rc": "checkout", "entregas": []})
            return
        # Las colas vivas no se versionan (`starseed_memory_root/olas/`): el árbol sigue limpio y el
        # orquestador arranca como en la Mac.
        cola = os.path.join("starseed_memory_root", "olas", nombre)
        _escribir(os.path.join(RAIZ, cola), tareas)
        self._correr_cola(clave, huella, cola)

    # ── autorrecarga ──
    @staticmethod
    def _huella_propia():
        try:
            st = os.stat(os.path.abspath(__file__))
            return "%d-%d" % (int(st.st_mtime), st.st_size)
        except OSError:
            return ""

    def codigo_nuevo(self):
        """¿Reinstalaron este archivo mientras corría? (`preparar-a1.sh` no corta una cola)."""
        actual = self._huella_propia()
        return bool(actual and self._mi_huella and actual != self._mi_huella)

    # ── guardián ──
    def importar_main_mac(self):
        """Trae a `refs/mac/main` el paquete que dejó la neurona (si es nuevo). (sha, fecha) o None.
        Un paquete cuyos prerrequisitos aún no están aquí (origin/main más nuevo en la Mac) falla
        sin daño: se reintenta en la próxima vuelta, después del `fetch` de origin."""
        try:
            mtime = os.path.getmtime(ENTRADA_MAIN)
        except OSError:
            mtime = 0.0
        if bundle_por_importar(mtime, self._main_mac.get("mtime")):
            rc, salida = _git(["fetch", "-q", ENTRADA_MAIN, "+refs/heads/main:" + REF_MAIN_MAC], timeout=300)
            if rc == 0:
                self._main_mac = {"mtime": mtime, "error": ""}
            else:
                self._main_mac["error"] = sin_secretos(salida.strip())[-200:]
        _, linea = _git(["log", "-1", "--format=%H|%ct", REF_MAIN_MAC])
        if "|" not in linea:
            return None
        sha, t = linea.strip().split("|", 1)
        return sha, float(t or 0)

    def candidatos_main(self, refs):
        """origin/main, el main de la Mac que lleva cada rama de cola (su padre) y el main VIVO
        de la Mac que deja la neurona (punto 5)."""
        candidatos = []
        viva = self.importar_main_mac()
        if viva:
            candidatos.append((viva[0], viva[1], "main vivo de la Mac"))
        if "main" in refs:
            candidatos.append((refs["main"][0], refs["main"][1], "origin/main"))
        for rama, (sha, _) in refs.items():
            if rama.startswith("colas/"):
                _, linea = _git(["log", "-1", "--format=%H|%ct", sha + "^"])
                if "|" in linea:
                    p_sha, p_t = linea.strip().split("|", 1)
                    candidatos.append((p_sha, float(p_t or 0), "main de la Mac (%s)" % rama))
        return candidatos

    def guardian(self, refs, forzar=False):
        sha, origen = objetivo_guardian(self.candidatos_main(refs))
        datos = _leer(os.path.join(ESTADO_DIR, "guardian.json"), {})
        if not forzar and not guardian_toca(datos.get("ultimo"), time.time(), sha):
            return False
        _git(["reset", "-q", "--hard"])
        _git(["clean", "-fdq"])
        if _git(["checkout", "-q", "--detach", sha])[0] != 0:
            return False
        _, asunto = _git(["log", "-1", "--format=%s", sha])
        inicio = time.time()
        self.vivo = {"fase": "guardian", "desde": inicio, "cola": None}
        self.escribir_estado(forzar=True)
        pasos = []
        # Dependencias: solo si el lock cambió (npm ci es trabajo de verdad, pero no a ciegas).
        huella_ruta = os.path.join(RAIZ, "node_modules", ".huella-lock")
        r = subprocess.run(["sha256sum", os.path.join(RAIZ, "package-lock.json")], capture_output=True, text=True)
        huella = r.stdout[:16]
        try:
            actual = open(huella_ruta).read().strip()
        except OSError:
            actual = ""
        log = os.path.join(LOGS, "guardian.log")
        if huella and huella != actual:
            rc, dur = self.correr(["npm", "ci", "--include=dev", "--no-audit", "--no-fund", "--loglevel=error"], log, 2400)
            pasos.append({"paso": "npm ci", "ok": rc == 0, "s": int(dur), "resumen": "dependencias al día" if rc == 0 else "rc=%s" % rc})
            if rc == 0:
                with open(huella_ruta, "w") as f:
                    f.write(huella)
        cedida = False
        for nombre, orden, tope in PASOS_GUARDIAN:
            if self._salir:
                break
            # Una cola del enjambre manda sobre el guardián: si llegó una, se le cede la máquina
            # (la pasada se descarta sin veredicto y se repite cuando toque).
            procesadas = (_leer(os.path.join(ESTADO_DIR, "colas.json"), {}) or {}).get("procesadas") or {}
            if colas_pendientes(self.refs_remotas(), procesadas) or self.entrantes():
                cedida = True
                break
            parcial = os.path.join(LOGS, "guardian-%s.log" % nombre)
            try:
                os.remove(parcial)
            except OSError:
                pass
            rc, dur = self.correr(orden, parcial, tope)
            try:
                texto = open(parcial, encoding="utf-8", errors="replace").read()[-20000:]
            except OSError:
                texto = ""
            pasos.append({"paso": nombre, "ok": rc == 0, "s": int(dur), "resumen": sin_secretos(resumen_paso(nombre, rc, texto))})
            with open(log, "a", encoding="utf-8") as f:
                f.write("\n== %s %s rc=%s %ds\n%s\n" % (time.strftime("%FT%TZ", time.gmtime()), nombre, rc, dur, texto[-4000:]))
        if self._salir or cedida:
            # Una pasada cortada por una parada del servicio (reinicio, actualización) no es un
            # veredicto: anotarla como roja era avisar en falso de que main estaba roto (medido).
            self.vivo = {"fase": "espera", "desde": time.time()}
            return False
        ultimo = {"t": time.time(), "inicio": inicio, "sha": sha, "origen": origen, "asunto": sin_secretos(asunto.strip())[:140],
                  "ok": all(p["ok"] for p in pasos), "pasos": pasos, "minutos": round((time.time() - inicio) / 60, 1)}
        historial = (datos.get("historial") or []) + [ultimo]
        _escribir(os.path.join(ESTADO_DIR, "guardian.json"), {"ultimo": ultimo, "historial": historial[-30:]})
        self.vivo = {"fase": "espera", "desde": time.time()}
        return True

    # ── bucle ──
    def servir(self):
        def parar(*_):
            self._salir = True
        signal.signal(signal.SIGTERM, parar)
        signal.signal(signal.SIGINT, parar)
        os.makedirs(ESTADO_DIR, exist_ok=True)
        self.reanudar_interrumpida()
        self.vivo = {"fase": "espera", "desde": time.time()}
        while not self._salir:
            try:
                refs = self.refs_remotas()
                procesadas = (_leer(os.path.join(ESTADO_DIR, "colas.json"), {}) or {}).get("procesadas") or {}
                pendientes = colas_pendientes(refs, procesadas)
                if pendientes:
                    rama = pendientes[0]
                    self.procesar_cola(rama, refs[rama][0])
                    continue
                entrantes = self.entrantes()
                if entrantes:
                    self.procesar_entrante(entrantes[0], refs)
                    continue
                if self.codigo_nuevo():
                    # Libre y con código nuevo en disco: systemd (Restart=always) lo arranca ya nuevo.
                    self.vivo = {"fase": "recargando", "desde": time.time()}
                    self.escribir_estado(forzar=True)
                    return
                self.guardian(refs)
            except Exception as e:  # noqa: BLE001 — el nodo no se cae por una pasada
                with open(os.path.join(LOGS, "nodo-errores.log"), "a", encoding="utf-8") as f:
                    f.write("%s %s: %s\n" % (time.strftime("%FT%TZ", time.gmtime()), type(e).__name__, sin_secretos(e)))
                self.vivo = {"fase": "espera", "desde": time.time(), "error": sin_secretos(e)[:200]}
            fin = time.time() + SONDEO_S
            while time.time() < fin and not self._salir:
                self.escribir_estado()
                time.sleep(5)


def main(argv):
    orden = argv[1] if len(argv) > 1 else "estado"
    nodo = Nodo()
    if orden == "servir":
        os.makedirs(LOGS, exist_ok=True)
        nodo.servir()
        return 0
    if orden == "guardian":
        print(json.dumps({"hecho": nodo.guardian(nodo.refs_remotas(), forzar="--ya" in argv)}, ensure_ascii=False))
        return 0
    nodo.escribir_estado(forzar=True)
    print(json.dumps(_leer(os.path.join(ESTADO_DIR, "estado.json"), {}), ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
