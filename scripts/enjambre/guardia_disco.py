# -*- coding: utf-8 -*-
"""Guardia del disco del enjambre (GUA1113A, 2026-11-13).

POR QUÉ. El 13-11 el agente de ALC1113A dejó un archivo SIN RASTREAR de 14 378 132 346 bytes
(`scripts/puente/alcance_github_temas.py`: el mismo guion pegado una y otra vez, ~7,7 MB/s) y el
disco de la Mac (228 GB) quedó con 129 MB libres. Nadie lo notó: ni el orquestador, ni el
vigilante, ni Genesis. El 11-11 una tarea ya había commiteado 816 artefactos de build (434 MB) y
llegaron a main. Este módulo reúne las tres defensas y el estado que Genesis puede leer:

1. PARAR LO DESBOCADO MIENTRAS SE ESCRIBE.
   · `envolver_con_limite(cmd)`: el proceso del agente (y todo su árbol, incluso los nietos que se
     fueron a otra sesión) hereda `RLIMIT_FSIZE`: el núcleo corta cualquier escritura que haga un
     archivo mayor que el tope, escriba como escriba el agente. Es la red de seguridad. El tope es
     ALTO (4 GB) a propósito: las herramientas del agente guardan sus propias bases (la
     `opencode.db` de la Mac pesa 725 MB y crece), y un tope bajo las rompería.
   · `VigiaArbol`: un hilo que mira el worktree cada pocos segundos. Si un archivo pasa de
     `archivo_max` (200 MB), si el árbol crece más de `arbol_crece` (2 GB) desde que empezó la
     tarea, o si el disco libre baja de `libre_paro` (2 GB), corta el grupo de procesos del agente,
     guarda la evidencia del archivo (cabeza y cola, tamaño, fecha), lo borra y deja la parada
     anotada. El orquestador la convierte en `DiscoDesbocado` y la tarea queda en «fallo» con la
     razón en claro.
2. NADA GRANDE NI GENERADO SE COMMITEA: `filtrar_indice` se llama justo después de cada
   `git add -A` del enjambre y SACA DEL ÍNDICE (`git reset`, el archivo sigue en disco) lo que pasa
   de `archivo_max` o es salida de build recién añadida. `STARSEED_DISCO_PERMITIDOS` deja pasar
   rutas concretas por patrón.
3. FRENO DE DISCO: `FRENO.consultar()` da «libre», «sin_tareas» (< `libre_aviso`, 10 GB) o
   «sin_pesados» (< `libre_critico`, 5 GB), con una pequeña histéresis para soltarse solo.
4. ESTADO PARA GENESIS: `estado()` (función casi pura) y el archivo `disco-enjambre.json`.

Todos los límites se leen del entorno CADA vez que se usan (las pruebas y Alex pueden cambiarlos
sin reiniciar nada). Nada de esto toca procesos que no haya lanzado el propio enjambre.
"""
from __future__ import annotations

import fnmatch
import hashlib
import json
import os
import shutil
import subprocess
import sys
import threading
import time

# ── Límites (un solo sitio) ──────────────────────────────────────────────────
#: nombre de variable de entorno → (valor por defecto, unidad, qué es)
LIMITES = {
    "STARSEED_DISCO_ARCHIVO_MAX_MB": (200, "MB", "ningún archivo del worktree puede pasar de esto (vigía y commits)"),
    "STARSEED_DISCO_ARBOL_CRECE_MB": (2048, "MB", "lo que puede crecer el worktree entero durante una tarea"),
    "STARSEED_DISCO_RLIMIT_MB": (4096, "MB", "tope del núcleo (RLIMIT_FSIZE) por archivo para el agente; 0 = sin tope"),
    "STARSEED_DISCO_LIBRE_AVISO_GB": (10, "GB", "con menos libre no arranca ninguna tarea nueva"),
    "STARSEED_DISCO_LIBRE_CRITICO_GB": (5, "GB", "con menos libre tampoco arrancan las puertas pesadas (tsc, vitest)"),
    "STARSEED_DISCO_LIBRE_PARO_GB": (2, "GB", "con menos libre se corta al agente que está escribiendo"),
    "STARSEED_DISCO_HISTERESIS_GB": (0.5, "GB", "margen por encima del umbral para soltar el freno"),
    "STARSEED_DISCO_SONDEO_S": (5, "s", "cada cuánto mira el vigía el worktree"),
}
#: patrones (fnmatch sobre la ruta relativa, separador «/») que SÍ pueden pasar aunque sean grandes
#: o parezcan build, separados por coma. Ej.: `assets/video/*.mp4,public/modelos/*.glb`.
ENV_PERMITIDOS = "STARSEED_DISCO_PERMITIDOS"
ENV_ESTADO = "STARSEED_DISCO_ESTADO"
ENV_EVIDENCIA = "STARSEED_DISCO_EVIDENCIA"

MB = 1024 * 1024
GB = 1024 * MB


def _num(nombre: str) -> float:
    """El valor vigente de un límite: el de la variable de entorno si es un número ≥ 0."""
    defecto = LIMITES[nombre][0]
    try:
        v = float(os.environ.get(nombre, "").strip())
        return v if v >= 0 else float(defecto)
    except ValueError:
        return float(defecto)


def archivo_max_bytes() -> int:
    return int(_num("STARSEED_DISCO_ARCHIVO_MAX_MB") * MB)


def arbol_crece_bytes() -> int:
    return int(_num("STARSEED_DISCO_ARBOL_CRECE_MB") * MB)


def rlimit_bytes() -> int:
    return int(_num("STARSEED_DISCO_RLIMIT_MB") * MB)


def umbrales_gb() -> tuple:
    """(aviso, crítico, paro) en GB, garantizando aviso ≥ crítico ≥ paro."""
    aviso = _num("STARSEED_DISCO_LIBRE_AVISO_GB")
    critico = min(_num("STARSEED_DISCO_LIBRE_CRITICO_GB"), aviso)
    paro = min(_num("STARSEED_DISCO_LIBRE_PARO_GB"), critico)
    return aviso, critico, paro


def permitidos() -> list:
    return [p.strip() for p in os.environ.get(ENV_PERMITIDOS, "").split(",") if p.strip()]


def _normal(ruta: str) -> str:
    """Ruta relativa con «/» y sin el «./» inicial (¡no se pueden quitar los puntos de `.next`!)."""
    r = (ruta or "").replace(os.sep, "/")
    while r.startswith("./"):
        r = r[2:]
    return r.lstrip("/")


def ruta_permitida(ruta: str, patrones=None) -> bool:
    """PURA. ¿Alguna excepción explícita cubre esta ruta?"""
    ruta = _normal(ruta)
    for p in (permitidos() if patrones is None else patrones):
        if fnmatch.fnmatch(ruta, p) or fnmatch.fnmatch(os.path.basename(ruta), p):
            return True
    return False


# ── Qué es salida de build ───────────────────────────────────────────────────
#: carpetas que son salida o caché de herramientas, en CUALQUIER nivel de la ruta
DIRS_SALIDA = ("node_modules", "__pycache__", ".turbo", ".vercel", ".swc", ".parcel-cache",
               ".pytest_cache", ".mypy_cache", ".nyc_output", ".gradle")
#: carpetas que solo lo son en la raíz del repo (en otro sitio `build/` o `out/` pueden ser código)
DIRS_SALIDA_RAIZ = ("dist", "build", "out", "coverage")
#: prefijos de ruta que son salida de build
PREFIJOS_SALIDA = ("src-tauri/target/",)
SUFIJOS_SALIDA = (".pyc", ".pyo", ".tsbuildinfo")


def es_salida_de_build(ruta: str) -> bool:
    """PURA. ¿Esta ruta (relativa al repo) es salida de build o caché que nunca es trabajo?"""
    r = _normal(ruta)
    if not r:
        return False
    partes = r.split("/")
    carpetas = partes[:-1]
    if any(c in DIRS_SALIDA or c == ".next" or c.startswith(".next-") for c in carpetas):
        return True
    if len(partes) > 1 and partes[0] in DIRS_SALIDA_RAIZ:
        return True
    if any(r.startswith(p) for p in PREFIJOS_SALIDA):
        return True
    return r.endswith(SUFIJOS_SALIDA)


def _carpeta_ignorada_por_vigia(nombre: str) -> bool:
    """Carpetas que el vigía no recorre: git, dependencias y builds (legítimamente enormes y ya
    ignoradas por git; el commit las refusa aparte con `es_salida_de_build`)."""
    return nombre == ".git" or nombre in DIRS_SALIDA or nombre == ".next" or nombre.startswith(".next-")


def motivo_de_rechazo(ruta: str, tamano: int, es_nueva: bool = True, maximo: int | None = None) -> str | None:
    """PURA. Por qué un archivo no debe commitearse (texto para una persona), o None si pasa."""
    if ruta_permitida(ruta):
        return None
    tope = archivo_max_bytes() if maximo is None else maximo
    if tamano > tope:
        return "pesa %.1f MB y el tope es %.0f MB" % (tamano / MB, tope / MB)
    if es_nueva and es_salida_de_build(ruta):
        return "es salida de build o caché generada"
    return None


# ── Estado que Genesis lee ───────────────────────────────────────────────────
def _dir_estado() -> str:
    return os.environ.get("STARSEED_DISCO_DIR") or os.path.expanduser("~/.starseed")


def ruta_estado() -> str:
    return os.environ.get(ENV_ESTADO) or os.path.join(_dir_estado(), "disco-enjambre.json")


def ruta_evidencia() -> str:
    return os.environ.get(ENV_EVIDENCIA) or os.path.join(_dir_estado(), "disco-enjambre", "evidencia")


def _ahora_txt(t: float | None = None) -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(t if t is not None else time.time()))


def _leer_json(ruta: str) -> dict:
    try:
        with open(ruta, encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except Exception:
        return {}


def _guardar_json(ruta: str, datos: dict) -> None:
    """Atómico y sin lanzar: un estado que no se puede escribir no puede romper una tarea."""
    try:
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        tmp = "%s.%d.tmp" % (ruta, os.getpid())
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False, indent=1)
        os.replace(tmp, ruta)
    except Exception:
        pass


def nivel_para(libre_gb: float, nivel_antes: str = "libre") -> str:
    """PURA. «libre» | «sin_tareas» | «sin_pesados» según el espacio libre.

    Con histéresis: si ya estaba retenido, se suelta solo cuando el libre supera el umbral MÁS el
    margen (así un disco que oscila en el umbral no abre y cierra el freno cada pocos segundos)."""
    aviso, critico, _paro = umbrales_gb()
    h = _num("STARSEED_DISCO_HISTERESIS_GB")
    if nivel_antes == "sin_pesados":
        critico += h
        aviso += h
    elif nivel_antes == "sin_tareas":
        aviso += h
    if libre_gb < critico:
        return "sin_pesados"
    if libre_gb < aviso:
        return "sin_tareas"
    return "libre"


def estado(ruta: str = "/", libre_bytes: int | None = None, total_bytes: int | None = None,
           nivel: str | None = None, ahora: float | None = None) -> dict:
    """El estado del disco del enjambre para Genesis. Sin efectos (salvo leer el disco y el archivo
    de la última parada). Dice lo que sabe y desde cuándo (`medido`)."""
    if libre_bytes is None or total_bytes is None:
        try:
            u = shutil.disk_usage(ruta)
            libre_bytes, total_bytes = u.free, u.total
        except Exception:
            libre_bytes = libre_bytes or 0
            total_bytes = total_bytes or 0
            return {"medido": _ahora_txt(ahora), "ok": False, "motivo": "no se pudo medir el disco"}
    libre_gb = libre_bytes / GB
    aviso, critico, paro = umbrales_gb()
    previo = _leer_json(ruta_estado())
    nivel = nivel or nivel_para(libre_gb, previo.get("nivel", "libre"))
    return {
        "ok": True,
        "medido": _ahora_txt(ahora),
        "libre_gb": round(libre_gb, 2),
        "total_gb": round(total_bytes / GB, 1),
        "umbral_aviso_gb": aviso,
        "umbral_critico_gb": critico,
        "umbral_paro_gb": paro,
        "nivel": nivel,
        "retiene_arranques": nivel in ("sin_tareas", "sin_pesados"),
        "retiene_pesados": nivel == "sin_pesados",
        "retenido_desde": previo.get("retenido_desde") if nivel != "libre" else None,
        "ultima_parada": previo.get("ultima_parada"),
        "limites": {
            "archivo_max_mb": int(archivo_max_bytes() / MB),
            "arbol_crece_mb": int(arbol_crece_bytes() / MB),
            "rlimit_mb": int(rlimit_bytes() / MB),
        },
    }


def leer_estado() -> dict:
    """Lo último que escribió el enjambre (para los medidores). {} si nunca escribió."""
    return _leer_json(ruta_estado())


def registrar_parada(tarea: str, archivo: str, tamano: int, limite: int, motivo: str, evidencia: str = "") -> dict:
    """Anota la última tarea parada por tamaño en el archivo de estado (sin perder el resto)."""
    d = _leer_json(ruta_estado())
    d["ultima_parada"] = {
        "tarea": tarea, "archivo": archivo, "bytes": int(tamano), "limite_bytes": int(limite),
        "motivo": motivo, "evidencia": evidencia, "cuando": _ahora_txt(),
    }
    _guardar_json(ruta_estado(), d)
    return d["ultima_parada"]


class FrenoDisco:
    """El freno del enjambre por espacio en disco. Una sola instancia (`FRENO`)."""

    def __init__(self, ruta: str = "/"):
        self.ruta = ruta
        self.nivel = "libre"
        self.desde = None
        self._medido = 0.0
        self._lock = threading.Lock()

    def consultar(self, avisar=None, cada_s: float = 5.0, ahora: float | None = None) -> str:
        """Mide (como mucho cada `cada_s`), avisa SOLO al cambiar de nivel y escribe el estado."""
        t = time.time() if ahora is None else ahora
        with self._lock:
            if t - self._medido < cada_s:
                return self.nivel
            self._medido = t
            try:
                u = shutil.disk_usage(self.ruta)
            except Exception:
                return self.nivel  # no se pudo medir: no se inventa un freno
            nuevo = nivel_para(u.free / GB, self.nivel)
            antes = self.nivel
            if nuevo != antes:
                self.desde = _ahora_txt(t) if nuevo != "libre" else None
                self.nivel = nuevo
            est = estado(self.ruta, u.free, u.total, self.nivel, t)
            est["retenido_desde"] = self.desde
        previo = _leer_json(ruta_estado())
        est["ultima_parada"] = previo.get("ultima_parada")
        _guardar_json(ruta_estado(), est)
        if nuevo != antes and avisar:
            aviso, critico, _ = umbrales_gb()
            if nuevo == "sin_pesados":
                txt = ("disco casi lleno: quedan %.1f GB (umbral %.0f GB) → no arranca ninguna tarea ni puerta pesada "
                       "hasta que se libere espacio" % (u.free / GB, critico))
            elif nuevo == "sin_tareas":
                txt = ("poco disco: quedan %.1f GB (umbral %.0f GB) → no arranca ninguna tarea nueva; "
                       "sigue lo que ya corre" % (u.free / GB, aviso))
            else:
                txt = "disco recuperado: %.1f GB libres → el enjambre reanuda" % (u.free / GB)
            try:
                avisar(txt)
            except Exception:
                pass
        return self.nivel

    def retiene_arranques(self, avisar=None) -> bool:
        return self.consultar(avisar) in ("sin_tareas", "sin_pesados")

    def esperar_pesado(self, avisar=None, dormir=time.sleep, cada_s: float = 10.0, maximo_s: float | None = None) -> float:
        """Bloquea mientras haya menos del umbral crítico. Sin tope por defecto: se reanuda solo."""
        t0 = time.time()
        while self.consultar(avisar, cada_s=0) == "sin_pesados":
            if maximo_s is not None and time.time() - t0 >= maximo_s:
                break
            dormir(cada_s)
        return time.time() - t0 if time.time() - t0 >= 0.5 else 0.0


FRENO = FrenoDisco()


# ── 1a. Tope del núcleo para el árbol del agente ─────────────────────────────
_TRAMPOLIN = (
    "import os,sys\n"
    "try:\n"
    "    import resource\n"
    "    n=int(sys.argv[1])\n"
    "    if n>0:\n"
    "        resource.setrlimit(resource.RLIMIT_FSIZE,(n,n))\n"
    "except Exception:\n"
    "    pass\n"
    "os.execvp(sys.argv[2],sys.argv[2:])\n"
)


def envolver_con_limite(cmd, tope: int | None = None):
    """Devuelve la orden envuelta para que el proceso (y todo lo que lance) arranque con
    `RLIMIT_FSIZE`. Sin tope (0) devuelve la orden tal cual. `cmd` es lista o texto de shell."""
    n = rlimit_bytes() if tope is None else tope
    if n <= 0:
        return cmd
    if isinstance(cmd, str):
        cmd = ["/bin/sh", "-c", cmd]
    return [sys.executable, "-c", _TRAMPOLIN, str(n)] + list(cmd)


# ── 1b. Vigía del worktree ───────────────────────────────────────────────────
class DiscoDesbocado(RuntimeError):
    """El agente escribió demasiado: el texto es la razón, tal cual la leerá una persona."""


def escanear(raiz: str, maximo_por_archivo: int | None = None, limite_ficheros: int = 200000) -> dict:
    """Recorre el worktree sin entrar en .git, dependencias ni builds ni seguir enlaces.
    → {"total": bytes, "grandes": [(ruta, bytes)], "mayores": [(ruta, bytes)] (top 5)}"""
    tope = archivo_max_bytes() if maximo_por_archivo is None else maximo_por_archivo
    total, grandes, todos, n = 0, [], [], 0
    pila = [raiz]
    while pila:
        d = pila.pop()
        try:
            with os.scandir(d) as it:
                for e in it:
                    try:
                        if e.is_symlink():
                            continue
                        if e.is_dir(follow_symlinks=False):
                            if not _carpeta_ignorada_por_vigia(e.name):
                                pila.append(e.path)
                            continue
                        tam = e.stat(follow_symlinks=False).st_size
                    except OSError:
                        continue
                    n += 1
                    total += tam
                    rel = os.path.relpath(e.path, raiz).replace(os.sep, "/")
                    if tam > tope and not ruta_permitida(rel):
                        grandes.append((rel, tam))
                    if tam > 10 * MB:
                        todos.append((rel, tam))
                    if n >= limite_ficheros:
                        pila = []
                        break
        except OSError:
            continue
    todos.sort(key=lambda x: -x[1])
    return {"total": total, "grandes": sorted(grandes, key=lambda x: -x[1]), "mayores": todos[:5]}


def guardar_evidencia(raiz: str, rel: str, tarea: str) -> str:
    """Antes de borrar un archivo desbocado: su cabeza (200 KB), su cola (20 KB), tamaño, fecha y
    el sha256 de la cabeza. Devuelve la carpeta. Nunca lanza."""
    try:
        origen = os.path.join(raiz, rel)
        st = os.stat(origen)
        base = "%s-%s-%s" % (tarea or "sin-tarea", os.path.basename(rel), time.strftime("%Y%m%d-%H%M%S"))
        destino = os.path.join(ruta_evidencia(), base)
        os.makedirs(destino, exist_ok=True)
        with open(origen, "rb") as f:
            cabeza = f.read(200 * 1024)
            f.seek(max(0, st.st_size - 20 * 1024))
            cola = f.read(20 * 1024)
        with open(os.path.join(destino, "cabeza-200KB.bin"), "wb") as f:
            f.write(cabeza)
        with open(os.path.join(destino, "cola-20KB.bin"), "wb") as f:
            f.write(cola)
        _guardar_json(os.path.join(destino, "datos.json"), {
            "tarea": tarea, "ruta": rel, "bytes": st.st_size, "modificado": _ahora_txt(st.st_mtime),
            "sha256_cabeza": hashlib.sha256(cabeza).hexdigest(),
            "nota": "El archivo entero se borró del worktree: era salida desbocada del agente, no trabajo.",
        })
        return destino
    except Exception:
        return ""


def _como_persona(n: int) -> str:
    return "%.1f GB" % (n / GB) if n >= GB else "%.0f MB" % (n / MB)


class VigiaArbol:
    """Mira un worktree mientras un proceso del agente corre y lo corta si algo se desboca.

        with VigiaArbol(cwd, matar=lambda: matar_grupo(p), tid=tid) as vigia:
            p.wait(...)
        if vigia.disparo: raise DiscoDesbocado(vigia.disparo["motivo"])

    `matar()` solo debe cortar lo que el propio enjambre lanzó. Al salir del bloque hace un último
    repaso (lo que se escribió entre dos sondeos también cuenta)."""

    def __init__(self, raiz: str, matar=None, tid: str = "", sondeo_s: float | None = None, libre_fn=None):
        self.raiz, self.matar, self.tid = raiz, matar, tid
        self.sondeo_s = _num("STARSEED_DISCO_SONDEO_S") if sondeo_s is None else sondeo_s
        self.libre_fn = libre_fn or (lambda: shutil.disk_usage(raiz).free)
        self.disparo = None
        self._parar = threading.Event()
        self._hilo = None
        self._base = None

    def __enter__(self):
        try:
            self._base = escanear(self.raiz)["total"]
        except Exception:
            self._base = 0
        self._hilo = threading.Thread(target=self._bucle, daemon=True, name="vigia-disco-%s" % self.tid)
        self._hilo.start()
        return self

    def __exit__(self, *exc):
        self._parar.set()
        if self._hilo:
            self._hilo.join(timeout=10)
        if self.disparo is None:
            try:
                self.revisar()
            except Exception:
                pass
        return False

    def _bucle(self):
        while not self._parar.wait(self.sondeo_s):
            try:
                if self.revisar():
                    return
            except Exception:
                pass

    def revisar(self) -> bool:
        """Un repaso. True si disparó (y ya cortó al agente y limpió)."""
        if self.disparo is not None:
            return True
        r = escanear(self.raiz)
        tope = archivo_max_bytes()
        paro_libre = umbrales_gb()[2] * GB
        motivo, archivo, tamano = None, "", 0
        if r["grandes"]:
            archivo, tamano = r["grandes"][0]
            motivo = "el agente creó %s de %s (el tope por archivo es %s)" % (archivo, _como_persona(tamano), _como_persona(tope))
        elif self._base is not None and r["total"] - self._base > arbol_crece_bytes():
            crece = r["total"] - self._base
            mayores = ", ".join("%s %s" % (a, _como_persona(b)) for a, b in r["mayores"][:3]) or "sin archivos grandes"
            archivo, tamano = "(varios archivos)", crece
            motivo = "el worktree creció %s durante la tarea (el tope es %s); lo mayor: %s" % (
                _como_persona(crece), _como_persona(arbol_crece_bytes()), mayores)
        else:
            try:
                libre = self.libre_fn()
            except Exception:
                libre = None
            if libre is not None and libre < paro_libre:
                archivo, tamano = "(disco)", int(libre)
                motivo = "el disco bajó a %s libres (el mínimo es %s) mientras el agente escribía" % (
                    _como_persona(libre), _como_persona(int(paro_libre)))
        if not motivo:
            return False
        if self.matar:
            try:
                self.matar()
            except Exception:
                pass
        evidencia = ""
        borrado = False
        if r["grandes"]:
            for rel, _t in r["grandes"]:
                ev = guardar_evidencia(self.raiz, rel, self.tid)
                evidencia = evidencia or ev
                try:
                    os.remove(os.path.join(self.raiz, rel))
                    borrado = True
                except OSError:
                    pass
        texto = "%s; parada la escritura%s" % (motivo, " y borrado el archivo (evidencia: %s)" % evidencia if borrado else "")
        self.disparo = {"tarea": self.tid, "archivo": archivo, "bytes": tamano, "limite": tope, "motivo": texto,
                        "evidencia": evidencia}
        registrar_parada(self.tid, archivo, tamano, tope, texto, evidencia)
        return True


# ── 2. Lo que se commitea ────────────────────────────────────────────────────
def filtrar_indice(sh, cwd: str, env=None, avisar=None, tid: str = "") -> list:
    """Sacar del ÍNDICE lo que no debe commitearse. Se llama justo después de `git add -A`.

    `sh(cmd, cwd=…, timeout=…, env=…)` → (rc, salida) es el `sh` del orquestador (o uno falso).
    Solo se quitan del índice (`git reset`): el archivo sigue en el disco y NADA se borra. Un
    archivo que ya estaba en HEAD no se refusa por parecer build (solo por tamaño).
    → [(ruta, motivo)] de lo refusado. Nunca lanza."""
    refusados = []
    try:
        kw = {"cwd": cwd, "timeout": 120}
        if env is not None:
            kw["env"] = env
        rc, salida = sh(["git", "-c", "core.quotepath=off", "diff", "--cached", "--name-status", "--no-renames"], **kw)
        if rc != 0:
            return []
        for linea in (salida or "").splitlines():
            if "\t" not in linea:
                continue
            estado_, ruta = linea.split("\t", 1)
            if estado_[:1] not in ("A", "M"):
                continue
            try:
                tam = os.lstat(os.path.join(cwd, ruta)).st_size
            except OSError:
                continue
            motivo = motivo_de_rechazo(ruta, tam, es_nueva=(estado_[:1] == "A"))
            if motivo:
                refusados.append((ruta, motivo))
        for i in range(0, len(refusados), 100):
            trozo = [r for r, _ in refusados[i:i + 100]]
            sh(["git", "reset", "-q", "--"] + trozo, **kw)
        if refusados and avisar:
            ejemplo = "; ".join("%s (%s)" % (r, m) for r, m in refusados[:3])
            avisar("guardia de disco: fuera del commit %d archivo(s) (%s%s). Siguen en el disco; "
                   "STARSEED_DISCO_PERMITIDOS deja pasar uno a propósito"
                   % (len(refusados), ejemplo, ", …" if len(refusados) > 3 else ""))
    except Exception:
        return refusados
    return refusados


def _sh_simple(cmd, cwd=None, timeout=120, env=None, **_):
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout, env=env)
    return r.returncode, (r.stdout or "") + (r.stderr or "")


if __name__ == "__main__":  # pragma: no cover — uso desde guiones de shell y a mano
    orden = sys.argv[1] if len(sys.argv) > 1 else "estado"
    if orden == "indice":
        cwd = sys.argv[2] if len(sys.argv) > 2 else "."
        for r, m in filtrar_indice(_sh_simple, cwd, avisar=print):
            print("fuera del commit:", r, "·", m)
    else:
        print(json.dumps(estado(), ensure_ascii=False, indent=1))
