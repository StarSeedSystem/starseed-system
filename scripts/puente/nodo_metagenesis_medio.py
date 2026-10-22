# -*- coding: utf-8 -*-
"""Nodo de MetaGenesis · la máquina donde corre (OPA1011, 2026-10-10).

Mide el medio (Mac, A1 de Oracle, contenedor de la nube, otra neurona) y ejecuta las acciones
que decide el líder o la propia autocuración, SIEMPRE por los caminos que ya existen y están
probados (nada de un segundo orquestador peleando con el vigilante):

  · Mac (tiene las colas y el progreso en su disco): los guardianes son launchd
    (`com.starseed.*`); «reactivar/continuar» = `reactivar_mando.py` (servicios, autocuración,
    vigilante que relanza el orquestador); bloqueadas = `revisor_bloqueadas.py` (OPB1011);
    capacidad = `buscar_capacidad.py`; una cola nueva se ENLISTA en `olas/` y la recoge el
    vigilante (el mismo que ya relanza solo).
  · Linux (A1, otra máquina): servicios systemd `starseed-*`; si el A1 tiene su medio del
    enjambre (`oracle_a1.py`, OPO1011) la cola se deja en su bandeja
    `~/.starseed/nodo-metagenesis/entrantes/`; si no, se lanza el orquestador como el lanzador
    de la nube (árbol limpio, sin otro orquestador vivo).

  · Resultados (OPA1011b, solo en el medio con las colas): fallidas que nadie retoma, visto bueno
    esperando, integraciones de las últimas 2 h y la autopublicación (`estado_publicacion`, solo
    lectura); las tareas listas en el orden de la Mac (`candidatos_reparto`) para prestar las del
    final; y `enlistar_reparacion` (cola `cola-metagenesis-<fecha>` y, si nadie más la coge, delante
    en la tanda viva).

  · Alimentar (CAP1018Ab, 2026-10-22): la orden `repartir` con `modo: "alimentar"` añade tareas al
    FINAL del archivo de su COLA VIVA (atómica, sin repetir ids) — su orquestador, el único que hay,
    las coge al reeler la cola; nunca se lanza una segunda cola. Y el latido publica
    `salud.cola_viva` (trabajando, esperando, libres, sin_nuevas_s) leído de `latidos-<cola>.json`,
    que es lo que el líder mira para saber si un medio con orquestador vivo tiene trabajadores ociosos.

Todo lo que se lanza va desacoplado (no bloquea el latido) y deja su registro en
`/tmp/starseed-nodo-<acción>.log`. En modo SECO nada de esto se ejecuta: se dice qué se haría.
Solo biblioteca estándar. Nunca se imprime una clave ni el nombre de la máquina.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import socket
import subprocess
import sys
import time
from typing import Any, Dict, Iterable, List, Optional, Tuple, Union

import nodo_metagenesis_logica as L
import colmena_logica as C

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
CARPETA = os.path.expanduser(os.environ.get("STARSEED_NODO_DIR") or "~/.starseed/nodo-metagenesis")


def raiz_repo() -> str:
    r = os.environ.get("STARSEED_ROOT")
    if r:
        return r
    candidato = os.path.dirname(os.path.dirname(DIRECTORIO))
    if os.path.isdir(os.path.join(candidato, ".git")) or os.path.isdir(os.path.join(candidato, "starseed_memory_root")):
        return candidato
    for c in ("~/Documents/starseed-os-main", "~/starseed-system", "/home/claude/starseed-system"):
        c = os.path.expanduser(c)
        if os.path.isdir(c):
            return c
    return candidato


def _rutas_puente() -> None:
    """En el A1 el nodo vive en /opt/starseed/nodo/metagenesis/; los demás módulos del puente
    están en el clon del repo. Así los `import` perezosos funcionan en cualquier medio."""
    for p in (DIRECTORIO, os.path.join(raiz_repo(), "scripts", "puente")):
        if os.path.isdir(p) and p not in sys.path:
            sys.path.append(p)


_rutas_puente()


def _sh(orden: List[str], tope: float = 20, cwd: Optional[str] = None) -> Tuple[int, str]:
    try:
        r = subprocess.run(orden, capture_output=True, text=True, timeout=tope, cwd=cwd)
        return r.returncode, (r.stdout or "") + (r.stderr or "")
    except Exception as e:  # noqa: BLE001
        return 127, type(e).__name__


# ─── identidad ───────────────────────────────────────────────────────────────────────────


def detectar_medio() -> str:
    forzado = os.environ.get("STARSEED_NODO_MEDIO", "").strip()
    if forzado in L.MEDIOS:
        return forzado
    if sys.platform == "darwin":
        return "mac"
    if os.environ.get("GITHUB_ACTIONS") == "true":
        return "gh-actions"
    if (os.environ.get("STARSEED_MEDIO") == "oracle" or os.path.exists("/etc/starseed/host")
            or os.path.isdir("/var/lib/starseed/nodo")):
        return "oracle-a1"
    if os.environ.get("CLAUDECODE") or os.path.isdir("/home/claude"):
        return "nube-cowork"
    return "neurona"


def huella_maquina() -> str:
    """Algo estable de ESTA máquina; solo sale de aquí convertido en 6 hex (`id_de_nodo`)."""
    for ruta in ("/etc/machine-id", "/var/lib/dbus/machine-id"):
        try:
            with open(ruta) as f:
                v = f.read().strip()
                if v:
                    return v
        except OSError:
            pass
    if sys.platform == "darwin":
        # Ruta absoluta: launchd no lleva /usr/sbin en el PATH y, sin ioreg, el id del nodo cambiaba
        # (medido el 2026-10-10: «mac-ec4458» bajo launchd frente a «mac-5a1bb4» en la terminal).
        rc, out = _sh(["/usr/sbin/ioreg", "-rd1", "-c", "IOPlatformExpertDevice"], tope=10)
        m = re.search(r'"IOPlatformUUID"\s*=\s*"([^"]+)"', out)
        if m:
            return m.group(1)
    return socket.gethostname()


# ─── medidas ─────────────────────────────────────────────────────────────────────────────


def ram_libre_mb() -> Optional[int]:
    try:
        with open("/proc/meminfo") as f:
            for linea in f:
                if linea.startswith("MemAvailable:"):
                    return int(linea.split()[1]) // 1024
    except OSError:
        pass
    if sys.platform == "darwin":
        rc, out = _sh(["vm_stat"], tope=10)
        tam = re.search(r"page size of (\d+) bytes", out)
        paginas = 0
        for clave in ("Pages free", "Pages inactive", "Pages speculative"):
            m = re.search(r"%s:\s+(\d+)" % clave, out)
            if m:
                paginas += int(m.group(1))
        if tam and paginas:
            return paginas * int(tam.group(1)) // (1024 * 1024)
    return None


def disco_libre_gb(ruta: str) -> Optional[float]:
    try:
        return round(shutil.disk_usage(ruta).free / 1e9, 1)
    except OSError:
        return None


def ram_total_mb() -> Optional[int]:
    """RAM TOTAL del aparato (no la libre): la capacidad de contenedor se decide con ella (§2 del contrato).
    None si no se pudo medir: entonces no se inventa un contenedor (ni «no apto» por un 0 falso)."""
    try:
        with open("/proc/meminfo") as f:
            for linea in f:
                if linea.startswith("MemTotal:"):
                    return int(linea.split()[1]) // 1024
    except (OSError, ValueError, IndexError):
        pass
    if sys.platform == "darwin":
        # Ruta absoluta: launchd no lleva /usr/sbin en el PATH (mismo motivo que `ioreg` en huella_maquina).
        rc, out = _sh(["/usr/sbin/sysctl", "-n", "hw.memsize"], tope=10)
        if rc == 0 and out.strip().isdigit():
            return int(out.strip()) // (1024 * 1024)
    return None


def bateria_de(texto_pmset: str) -> Dict[str, Any]:
    """PURA. La salida de `pmset -g batt` a {cargando, nivel 0-1}; {} si no hay batería (sobremesa) o no se entiende."""
    m = re.search(r"(\d{1,3})%", texto_pmset or "")
    if not m or "InternalBattery" not in texto_pmset:
        return {}
    # «Now drawing from 'AC Power'» = enchufado; «'Battery Power'» = tirando de batería.
    cargando = "Battery Power" not in texto_pmset
    return {"cargando": cargando, "nivel": min(1.0, int(m.group(1)) / 100.0)}


def bateria() -> Dict[str, Any]:
    """Batería del aparato (contrato §2: sin cargador, 1 agente como mucho). {} si no hay o no se sabe."""
    try:
        if sys.platform == "darwin":
            rc, out = _sh(["/usr/bin/pmset", "-g", "batt"], tope=10)
            return bateria_de(out) if rc == 0 else {}
        base = "/sys/class/power_supply"
        for n in sorted(os.listdir(base)) if os.path.isdir(base) else []:
            if not n.startswith("BAT"):
                continue
            nivel = int(open(os.path.join(base, n, "capacity")).read().strip())
            estado = open(os.path.join(base, n, "status")).read().strip().lower()
            return {"cargando": estado != "discharging", "nivel": min(1.0, nivel / 100.0)}
    except (OSError, ValueError):
        pass
    return {}


def carpetas_nvm(home: Optional[str] = None) -> List[str]:
    """Las carpetas `bin` de cada Node instalado con nvm, la versión más alta primero.

    Mismo criterio que `_node_del_repo` del enjambre: nvm no se carga en un shell no interactivo, así que un nodo
    arrancado por systemd o launchd no lo ve en el PATH aunque el aparato SÍ tenga Node (y el enjambre lo usa)."""
    base = os.path.join(home or os.path.expanduser("~"), ".nvm", "versions", "node")
    try:
        versiones = [v for v in os.listdir(base) if v.startswith("v")]
    except OSError:
        return []

    def clave(v: str) -> Tuple[int, ...]:
        try:
            return tuple(int(x) for x in v.lstrip("v").split("."))
        except ValueError:
            return (0,)

    return [os.path.join(base, v, "bin") for v in sorted(versiones, key=clave, reverse=True)]


def tiene_herramienta(nombre: str, home: Optional[str] = None) -> bool:
    """¿Está `nombre` en este aparato? Mira también donde launchd/systemd no ponen el PATH (Homebrew, npm global, nvm)."""
    raiz = home or os.path.expanduser("~")
    extra = os.pathsep.join(["/opt/homebrew/bin", "/usr/local/bin", os.path.join(raiz, ".npm-global", "bin"),
                             os.path.join(raiz, ".local", "bin"), *carpetas_nvm(raiz)])
    return shutil.which(nombre, path=os.environ.get("PATH", "") + os.pathsep + extra) is not None


def so_de_este_aparato() -> str:
    """El `so` que entiende `colmena_logica.capacidad_contenedor` (no el `sys.platform` a secas)."""
    if os.environ.get("TERMUX_VERSION") or sys.platform == "android":
        return "android"
    if sys.platform == "darwin":
        return "macos"
    if sys.platform in ("win32", "cygwin"):
        return "windows"
    return "linux" if sys.platform.startswith("linux") else "otro"


def en_curso_de(raiz: str, colas: Union[None, str, Iterable[str]]) -> Optional[List[Dict[str, Any]]]:
    """Las tareas VIVAS que lleva este aparato ahora (contrato §3: ≤ 8, sin rutas ni nombres de máquina).

    La fuente de verdad es `olas/latidos-<cola>.json`, que escribe el orquestador con la fase real de cada
    tarea (`latir`), no `progreso.json` (ahí `estado` es commit/integrada/fallida…, nunca «escribiendo»).
    Una tarea está viva con la MISMA regla que usa el orquestador (`colmena_logica.tarea_viva`): toda fase que no
    es «hecho». No solo «escribiendo»: en tsc, tests, revision, integrando o 40 min «esperando proveedor» el aparato
    también lleva la tarea a medias, y decir «sin trabajo» ahí invitaría a apagarlo en mitad de una integración.
    `colas` son las colas de TODOS los orquestadores vivos (un medio puede correr varios): se juntan sus tareas sin
    repetir ids. Sin ninguna cola viva, un `latidos-` viejo de un orquestador caído no es trabajo.
    El punto de control sale de `olas/puntos-control.json` ({tarea: {rama, sha, t en segundos}}); sin `sha` aún
    no hay punto y se publica null. [] = no hay trabajo; None = no se pudo leer algún latidos- (no se afirma nada)."""
    lista = [colas] if isinstance(colas, str) else list(colas or [])
    lista = [c for c in dict.fromkeys(lista) if c]
    if not lista:
        return []
    olas = os.path.join(raiz, "starseed_memory_root", "olas")
    vivas: Dict[str, str] = {}
    for cola in lista:
        ruta = os.path.join(olas, "latidos-" + cola)
        if not os.path.exists(ruta):
            continue
        datos = leer_json(ruta, None)
        tareas = datos.get("tareas") if isinstance(datos, dict) else None
        if not isinstance(tareas, dict):
            return None
        for tid, v in tareas.items():
            if isinstance(v, dict) and C.tarea_viva(v.get("fase")) and str(tid).strip():
                vivas.setdefault(str(tid), str(v["fase"]))
    if not vivas:
        return []
    puntos = leer_json(os.path.join(olas, "puntos-control.json"), {})
    puntos = puntos if isinstance(puntos, dict) else {}
    salida: List[Dict[str, Any]] = []
    for tid in sorted(vivas)[:8]:
        p = puntos.get(tid)
        punto = None
        if isinstance(p, dict) and p.get("sha"):
            try:
                t = float(p.get("t") or 0.0)
            except (TypeError, ValueError):
                t = 0.0
            punto = {"rama": str(p.get("rama") or "")[:120], "sha": str(p["sha"])[:60], "t": t}
        salida.append({"id": tid[:80], "fase": vivas[tid][:40], "punto": punto})
    return salida


def contenedor_de(disco_gb: Optional[float], ram_mb: Optional[int]) -> Optional[Dict[str, Any]]:
    """Lo que este aparato puede aportar como contenedor, con la memoria y los núcleos REALES (contrato §2).

    `activo` y los `trabajadores` elegidos salen de `contenedor.json` (la orden `contenedor`); si está activo, los
    agentes publicados son min(capacidad, elegidos). None si no se pudo medir la RAM o el disco: no se afirma nada."""
    if ram_mb is None or disco_gb is None:
        return None
    dato = leer_json(os.path.join(CARPETA, "contenedor.json"), {})
    dato = dato if isinstance(dato, dict) else {}
    activo = dato.get("activo") is True
    cap = {
        "so": so_de_este_aparato(),
        "herramientas": {h: (h == "python3" or tiene_herramienta(h)) for h in C.HERRAMIENTAS},
        "ram_total_mb": ram_mb,
        "nucleos": os.cpu_count() or 1,
        "disco_libre_gb": disco_gb,
        "bateria": bateria(),
    }
    r = C.capacidad_contenedor(cap)
    agentes = int(r.get("agentes", 0))
    elegidos = dato.get("trabajadores")
    if activo and isinstance(elegidos, int) and not isinstance(elegidos, bool) and elegidos >= 1:
        agentes = min(agentes, elegidos)
    return {"activo": activo, "agentes": agentes, "apto": bool(r.get("apto")), "motivo": str(r.get("motivo") or "")[:160]}


def desconectando_ahora(ahora: float) -> bool:
    """¿Se pidió «Desconectar» a este aparato hace menos de GRACIA_DESCONECTAR_S? (marca de la orden, no un estado eterno)."""
    d = leer_json(os.path.join(CARPETA, "desconectando.json"), {})
    try:
        return isinstance(d, dict) and d.get("desconectando") is True and 0 <= ahora - float(d.get("t")) < C.GRACIA_DESCONECTAR_S
    except (TypeError, ValueError):
        return False


def lineas_ps() -> List[str]:
    """`ps` con pid y orden completa (nunca `pgrep -l`, que en la Mac recorta y engaña)."""
    orden = ["ps", "-axo", "pid=,args="] if sys.platform == "darwin" else ["ps", "-eo", "pid=,args="]
    rc, out = _sh(orden, tope=15)
    return out.splitlines() if rc == 0 else []


#: Solo cuenta una orden que EMPIEZA por un python ejecutando el script del orquestador (el prompt
#: de un agente que lo nombra, no): la misma regla que `higiene_colas.RE`.
_RE_ORQ = re.compile(r"^[^ ]*[Pp]ython[0-9.]*( +-[A-Za-z]+)* +[^ ]*starseed-enjambre\.py( |$)")


def orquestadores(lineas: List[str]) -> List[Dict[str, Any]]:
    """PURA. [{pid, cola}] de los orquestadores vivos."""
    salida = []
    for linea in lineas or []:
        partes = linea.strip().split(None, 1)
        if len(partes) < 2 or not partes[0].isdigit():
            continue
        args = partes[1].strip()
        if not _RE_ORQ.match(args):
            continue
        cola = ""
        for tok in args.split():
            base = tok.rsplit("/", 1)[-1]
            if base.startswith("cola-") and base.endswith(".json"):
                cola = base[: -len(".json")]
        salida.append({"pid": int(partes[0]), "cola": cola})
    return salida


def proceso_vivo(lineas: List[str], fragmento: str) -> bool:
    """PURA. ¿Algún proceso python corre este script? (para no contar a quien solo lo nombra)."""
    for linea in lineas or []:
        partes = linea.strip().split(None, 2)
        if len(partes) >= 3 and "python" in partes[1].lower() and fragmento in partes[2].split(" ")[0]:
            return True
    return False


def servicios_mac() -> Tuple[List[str], List[str]]:
    """(servicios que debían estar vivos y no lo están, de ellos los guardianes). Misma regla que
    el botón «Reactivar directores» (`reactivar_mando.decidir_servicio`)."""
    try:
        import reactivar_mando as R  # noqa: WPS433
    except Exception:  # noqa: BLE001
        return [], []
    rc, out = _sh(["launchctl", "list"], tope=15)
    if rc != 0:
        return [], []
    vivos = R.parsear_launchctl(out)
    caidos = []
    for etiqueta, plist in R._plists().items():
        cargado = etiqueta in vivos
        pid, salida = vivos.get(etiqueta, (None, None))
        accion, _ = R.decidir_servicio(etiqueta, cargado, pid, salida, plist)
        if accion == "relanzar":
            caidos.append(etiqueta)
    return caidos, [c for c in caidos if c in L.GUARDIANES_MAC]


def servicios_linux() -> List[str]:
    """Unidades systemd `starseed-*` en «failed» (sistema y usuario)."""
    caidos = []
    for base in (["systemctl"], ["systemctl", "--user"]):
        rc, out = _sh(base + ["list-units", "--type=service", "--all", "--no-legend", "--plain", "starseed-*"], tope=15)
        if rc != 0:
            continue
        for linea in out.splitlines():
            trozos = linea.split()
            if len(trozos) >= 4 and trozos[0].startswith("starseed-") and trozos[2] == "failed":
                caidos.append(trozos[0])
    return sorted(set(caidos))


def leer_json(ruta: str, defecto: Any) -> Any:
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def medidores_mac(raiz: str, ahora: float) -> Tuple[Dict[str, Any], Optional[float]]:
    """Los resúmenes del vigía de medidores (las cifras que ve Alex) y su edad en segundos."""
    d = leer_json(os.path.join(raiz, "starseed_memory_root", "mando", "vigia-medidores.json"), {})
    med = d.get("medidores") if isinstance(d, dict) else None
    edad = None
    visto = d.get("visto") if isinstance(d, dict) else None
    if isinstance(visto, str):
        try:
            edad = ahora - time.mktime(time.strptime(visto[:19], "%Y-%m-%d %H:%M:%S"))
        except ValueError:
            edad = None
    return (med if isinstance(med, dict) else {}), edad


def estado_publicacion(raiz: str, carpeta: Optional[str] = None) -> Dict[str, Any]:
    """La autopublicación tal como está (interruptor, fase, motivo, commits sin publicar y la salida de
    la puerta que la frenó si es de ESE sha). Solo lectura: el director de producción manda en lo suyo."""
    carpeta = carpeta or os.path.expanduser("~/.starseed/produccion")
    est = leer_json(os.path.join(carpeta, "autopublicar-estado.json"), {})
    est = est if isinstance(est, dict) else {}
    inter = leer_json(os.path.join(carpeta, "autopublicar.json"), {})
    pausada = leer_json(os.path.join(os.path.dirname(carpeta), "produccion-pausada.json"), {})
    activa = isinstance(inter, dict) and inter.get("activo") is True and not (
        isinstance(pausada, dict) and pausada.get("pausada") is True)
    rc, n = _sh(["git", "rev-list", "--count", "origin/main..main"], cwd=raiz, tope=20)
    ev = est.get("evidencia")
    ev = ev if isinstance(ev, dict) and ev.get("sha") and ev.get("sha") == est.get("sha") else None
    return {"activa": bool(activa), "fase": str(est.get("fase") or ""), "detalle": str(est.get("detalle") or "")[:240],
            "sha": str(est.get("sha") or "")[:12], "sin_publicar": int(n.strip()) if rc == 0 and n.strip().isdigit() else None,
            "evidencia": ({"sha": str(ev.get("sha"))[:12], "motivo": str(ev.get("motivo") or "")[:120],
                           "texto": str(ev.get("texto") or "")[-2400:]} if ev else None)}


def resultados_mac(raiz: str, ahora: float) -> Dict[str, Any]:
    """Lo que el líder mira para saber si el trabajo AVANZA (OPA1011b): fallidas que nadie retoma,
    visto bueno esperando, integraciones de las últimas 2 h y la publicación."""
    olas = os.path.join(raiz, "starseed_memory_root", "olas")
    progreso = leer_json(os.path.join(olas, "progreso.json"), {})
    progreso = progreso if isinstance(progreso, dict) else {}
    rc, out = _sh(["git", "log", "main", "--since=72 hours ago", "--format=%s"], cwd=raiz, tope=30)
    asuntos = out.splitlines() if rc == 0 else []
    rc2, out2 = _sh(["git", "log", "main", "--since=2 hours ago", "--format=%s"], cwd=raiz, tope=20)
    fall = L.fallidas_sin_resolver(progreso, asuntos, ahora)
    vb = L.esperando_visto_bueno(progreso, ahora, asuntos)
    return {"fallidas": fall[:8], "n_fallidas": len(fall), "visto_bueno": vb[:8], "n_visto_bueno": len(vb),
            "integradas_2h": sum(1 for a in out2.splitlines() if L.es_integracion(a)) if rc2 == 0 else None,
            "publicacion": estado_publicacion(raiz)}


def colas_de_codigo_vivas(raiz: str) -> List[Tuple[str, List[Dict[str, Any]]]]:
    """[(nombre, tareas)] de las colas FUENTE de código en `olas/` (de la más nueva a la más vieja)."""
    olas = os.path.join(raiz, "starseed_memory_root", "olas")
    try:
        import vigilante_logica as V  # noqa: WPS433
        es_codigo = V.es_cola_de_codigo
    except Exception:  # noqa: BLE001
        def es_codigo(n: str) -> bool:
            return n.startswith("cola-") and not n.startswith(("cola-auto-", "cola-suenos"))
    salida = []
    try:
        nombres = sorted(os.listdir(olas), reverse=True)
    except OSError:
        return salida
    for n in nombres:
        if not (n.startswith("cola-") and n.endswith(".json")) or not es_codigo(n):
            continue
        d = leer_json(os.path.join(olas, n), [])
        lista = d if isinstance(d, list) else (d or {}).get("tareas", []) if isinstance(d, dict) else []
        salida.append((n, [t for t in lista or [] if isinstance(t, dict)]))
    return salida


def candidatos_reparto(raiz: str) -> List[Dict[str, Any]]:
    """Las tareas LISTAS de las colas de código, en el orden en que la Mac las cogería (lo que más
    desbloquea primero: `vigilante_logica.seleccionar_pendientes` con `prioridad_logica`), y solo las
    que nadie ha empezado (sin estado o «pendiente»)."""
    import datetime as _dt
    import vigilante_logica as V  # noqa: WPS433
    olas = os.path.join(raiz, "starseed_memory_root", "olas")
    progreso = leer_json(os.path.join(olas, "progreso.json"), {})
    progreso = progreso if isinstance(progreso, dict) else {}
    rc, out = _sh(["git", "log", "main", "--since=45 days ago", "--format=%s"], cwd=raiz, tope=40)
    asuntos = out.splitlines() if rc == 0 else []
    listas = V.seleccionar_pendientes(colas_de_codigo_vivas(raiz), progreso, asuntos, ahora=_dt.datetime.now())
    salida = []
    for t in listas or []:
        if not isinstance(t, dict) or not t.get("id"):
            continue
        e = progreso.get(str(t["id"]))
        estado = e.get("estado") if isinstance(e, dict) else ""
        if estado in ("", None, "pendiente"):
            salida.append(t)
    # El orden REAL de la tanda viva manda (es el que sigue su orquestador): lo que está al final se
    # coge lo último, y lo que ni siquiera está en ella no lo va a coger esta tanda (va detrás de todo,
    # así es lo primero que se presta: cero riesgo de hacerlo dos veces).
    viva = cola_viva()
    if viva:
        d = leer_json(os.path.join(olas, viva), [])
        lista = d if isinstance(d, list) else (d or {}).get("tareas", []) if isinstance(d, dict) else []
        pos = {str(t.get("id")): i for i, t in enumerate(lista or []) if isinstance(t, dict) and t.get("id")}
        orden = {str(t["id"]): i for i, t in enumerate(salida)}
        salida.sort(key=lambda t: (pos.get(str(t["id"]), len(pos) + orden[str(t["id"])])))
    return salida


def existentes(raiz: str, rutas: List[str]) -> List[str]:
    """Las rutas (relativas al repo) que existen de verdad, sin salir del repo."""
    base = os.path.realpath(raiz)
    salida = []
    for r in rutas or []:
        ruta = os.path.realpath(os.path.join(raiz, r))
        if ruta.startswith(base + os.sep) and os.path.isfile(ruta):
            salida.append(r)
    return salida


def colas_vivas(lineas: Optional[List[str]] = None) -> List[str]:
    """TODAS las colas que corren AHORA los orquestadores de esta máquina (de los argumentos del proceso), sin repetir."""
    salida: List[str] = []
    for o in orquestadores(lineas if lineas is not None else lineas_ps()):
        if o.get("cola") and (o["cola"] + ".json") not in salida:
            salida.append(o["cola"] + ".json")
    return salida


def cola_viva(lineas: Optional[List[str]] = None) -> Optional[str]:
    """La primera cola que corre AHORA un orquestador de esta máquina (para quien solo necesita una)."""
    colas = colas_vivas(lineas)
    return colas[0] if colas else None


# ─── su cola viva (CAP1018Ab) ────────────────────────────────────────────────────────────

#: Un id de tarea válido (los de las colas del enjambre: «CAP1018Ab», «p316G»…); el `id_valido` de
#: la lógica es de NODOS (minúsculas) y no vale aquí.
_RE_TAREA = re.compile(r"^[A-Za-z0-9._-]{1,80}$")


#: Fases de TRABAJO de la cola viva (las que emite `latir`). Las demás vivas («esperando
#: proveedor», «esperando cupo», «esperando aprobación»…) cuentan como esperando.
FASES_TRABAJO_COLA = ("escribiendo", "completando", "tsc", "tests", "revision", "integrando")



def resumen_cola_viva(latidos_data: Any, trabajadores: int, sin_nuevas_s: Optional[float]) -> Dict[str, Any]:
    """PURA. Resumen de la COLA VIVA para el latido (CAP1018Ab): lo mira el líder con
    `nodo_metagenesis_logica.medio_alimentable` para alimentar a un medio con orquestador vivo y
    trabajadores ociosos en vez de dejarlo 40 min parado. `trabajando` son las fases de escritura,
    tsc, pruebas, revisión e integración; `esperando` las otras vivas; `libres` = trabajadores −
    trabajando; `sin_nuevas_s` llega leído del disco y se publica tal cual (None: no se pudo medir).
    «hecho» (fase cerrada) no cuenta ni como una ni como otra."""
    tareas = (latidos_data or {}).get("tareas") if isinstance(latidos_data, dict) else {}
    tareas = tareas if isinstance(tareas, dict) else {}
    trabajando = esperando = 0
    for v in tareas.values():
        fase = v.get("fase") if isinstance(v, dict) else None
        if not C.tarea_viva(fase):
            continue
        if fase in FASES_TRABAJO_COLA:
            trabajando += 1
        else:
            esperando += 1
    libres = max(0, (trabajadores if isinstance(trabajadores, int) and not isinstance(trabajadores, bool)
                     and trabajadores > 0 else 0) - trabajando)
    return {"trabajando": trabajando, "esperando": esperando, "libres": libres, "sin_nuevas_s": sin_nuevas_s}


def trabajadores_de_cola(lineas: List[str], cola: str) -> Optional[int]:
    """El `--workers` con el que se lanzó el orquestador de `cola` (las mismas líneas de `ps` que
    lee `orquestadores`, que solo se guarda pid y cola). None si no se ve: el resumen no inventa
    cifras. Con la forma corta `-w` también vale."""
    buscada = cola if cola.endswith(".json") else cola + ".json"
    for linea in lineas or []:
        partes = linea.strip().split(None, 1)
        if len(partes) < 2 or not partes[0].isdigit() or not _RE_ORQ.match(partes[1]):
            continue
        tokens = partes[1].split()
        if not any(t.rsplit("/", 1)[-1] == buscada for t in tokens):
            continue
        m = re.search(r"(?:--workers|-w)[= ]([0-9]{1,2})\b", partes[1])
        return int(m.group(1)) if m else None
    return None


def resumen_cola_viva_de(raiz: str, lineas: List[str], ahora: float) -> Optional[Dict[str, Any]]:
    """La cola viva de ESTA máquina como dict para su latido. Las cuentas salen de
    `latidos-<cola>.json` (lo que su orquestador lleva a medias, con su fase real) y `sin_nuevas_s`
    del mtime de SU archivo de cola: el orquestador lo relee al cambiar (`releer_cola_si_cambio`),
    así que ese mtime es la última vez que recibió tareas nuevas. None: aquí no hay orquestador
    vivo (a nadie se alimenta y no se finge lo contrario)."""
    cola = cola_viva(lineas)
    if not cola:
        return None
    olas = os.path.join(raiz, "starseed_memory_root", "olas")
    latidos = leer_json(os.path.join(olas, "latidos-" + cola), None)
    if not isinstance(latidos, dict):
        latidos = {}
    try:
        sin_nuevas = max(0.0, ahora - os.path.getmtime(os.path.join(olas, cola)))
    except OSError:
        sin_nuevas = None
    trabajadores = trabajadores_de_cola(lineas, cola) or 2
    return resumen_cola_viva(latidos, trabajadores, sin_nuevas)


def enlistar_reparacion(raiz: str, tarea: Dict[str, Any], delante_en_la_tanda: bool, ahora: float) -> Tuple[str, str]:
    """Deja una tarea de reparación de MetaGenesis en su cola fuente (`olas/cola-metagenesis-<fecha>.json`,
    que lee el vigilante) y, si nadie más la va a coger, DELANTE en la tanda viva (el orquestador relee
    su cola y la mete en su sitio del orden). No la repite si el id ya existe en alguna cola o en el progreso."""
    olas = os.path.join(raiz, "starseed_memory_root", "olas")
    tid = str(tarea.get("id") or "")
    progreso = leer_json(os.path.join(olas, "progreso.json"), {})
    if isinstance(progreso, dict) and tid in progreso:
        return "nada", "%s ya está en el progreso" % tid
    for _, lista in colas_de_codigo_vivas(raiz):
        if any(str(t.get("id")) == tid for t in lista):
            return "nada", "%s ya está en una cola" % tid
    nombre = "cola-metagenesis-%s.json" % time.strftime("%Y%m%d", time.localtime(ahora))
    ruta = os.path.join(olas, nombre)
    d = leer_json(ruta, [])
    lista = d if isinstance(d, list) else (d or {}).get("tareas", []) if isinstance(d, dict) else []
    escribir_atomico(ruta, list(lista or []) + [tarea])
    texto = "%s enlistada en %s" % (tid, nombre)
    if delante_en_la_tanda:
        viva = cola_viva()
        if viva and os.path.exists(os.path.join(olas, viva)):
            rv = os.path.join(olas, viva)
            dv = leer_json(rv, None)
            lv = dv if isinstance(dv, list) else (dv or {}).get("tareas") if isinstance(dv, dict) else None
            if isinstance(lv, list) and not any(isinstance(t, dict) and str(t.get("id")) == tid for t in lv):
                nueva = [dict(tarea)] + lv
                if isinstance(dv, dict):
                    dv["tareas"] = nueva
                else:
                    dv = nueva
                escribir_atomico(rv, dv)
                texto += " y delante en la tanda viva (%s)" % viva[:-5]
    return "hecha", texto


def alimentar_cola_viva(args: Dict[str, Any], raiz: str,
                        lineas: Optional[List[str]] = None) -> Tuple[str, str]:
    """La orden `repartir` con `modo: "alimentar"` (CAP1018Ab, parte 2) alimenta la cola VIVA de este
    medio: añade las tareas al final de SU archivo de cola, de forma atómica (tmp + os.replace) y
    sin repetir ids (ni en la cola ni en el progreso). JAMÁS si aquí no hay orquestador vivo: eso
    sería lanzar una segunda cola, que `CLAUDE.md` prohíbe (UN orquestador por medio). No se lanza
    nada: su orquestador relee la cola al cambiar el mtime (`releer_cola_si_cambio`) y las coge."""
    cola = cola_viva(lineas)
    if not cola:
        return "nada", "sin orquestador vivo en este medio: no se alimenta nada"
    try:
        tope = max(1, min(8, int(args.get("tope") or 4)))
    except (TypeError, ValueError):
        tope = 4
    crudas = args.get("_tareas") or args.get("tareas")
    crudas = crudas if isinstance(crudas, list) else []
    nuevas = [dict(t) for t in crudas
              if isinstance(t, dict) and _RE_TAREA.match(str(t.get("id") or ""))]
    if not nuevas:
        return "nada", "la orden de alimentar no traía tareas utilizables"
    ruta = os.path.join(raiz, "starseed_memory_root", "olas", cola)
    d = leer_json(ruta, None)
    lista = d if isinstance(d, list) else (d or {}).get("tareas") if isinstance(d, dict) else None
    if not isinstance(lista, list):
        return "fallo", "no se pudo leer la cola viva %s" % cola
    ids = {str(t.get("id")) for t in lista if isinstance(t, dict) and t.get("id")}
    progreso = leer_json(os.path.join(raiz, "starseed_memory_root", "olas", "progreso.json"), {})
    if isinstance(progreso, dict):
        ids |= {str(k) for k in progreso}
    añadidas: List[Dict[str, Any]] = []
    for t in nuevas:
        tid = str(t.get("id"))
        if tid in ids:
            continue
        ids.add(tid)
        añadidas.append(t)
        if len(añadidas) >= tope:
            break
    if not añadidas:
        return "nada", "todas ya estaban en la cola viva o en el progreso (nada que alimentar)"
    escribir_atomico(ruta, lista + añadidas if isinstance(d, list) else dict(d, tareas=lista + añadidas))
    return "hecha", "%d tarea(s) añadida(s) a la cola viva %s (modo alimentar): su orquestador las coge al reeler la cola" % (
        len(añadidas), cola)


def nube_pausada() -> bool:
    """Alex puede pausar la nube (`~/.starseed/nube-pausada.json`): entonces no se presta nada fuera.
    La misma regla que el reparto a la nube y al A1 (`repartir_nube.nube_pausada`)."""
    try:
        import repartir_nube as RN  # noqa: WPS433
        return bool(RN.nube_pausada())
    except Exception:  # noqa: BLE001 — sin el módulo, el archivo a secas
        return os.path.exists(os.path.expanduser("~/.starseed/nube-pausada.json"))


def sabe_orquestar(raiz: str) -> bool:
    orq = any(os.path.exists(os.path.expanduser(p)) for p in (
        "~/.local/bin/starseed-enjambre.py", "~/bin/starseed-enjambre.py")) or os.path.exists(
        os.path.join(raiz, "scripts", "enjambre", "starseed-enjambre.py"))
    opencode = shutil.which("opencode") or os.path.exists(os.path.expanduser("~/.npm-global/bin/opencode")) \
        or os.path.exists("/opt/homebrew/bin/opencode")
    return bool(orq and opencode)


def estado_a1() -> Dict[str, Any]:
    """Lo que el medio del enjambre del A1 (OPO1011) dice de sí mismo, sin IPs ni ids."""
    d = leer_json("/var/lib/starseed/nodo/estado.json", {})
    if not isinstance(d, dict) or not d:
        return {}
    orq = d.get("orquestador") or {}
    carga = d.get("carga") or {}
    return {"fase": str(d.get("fase") or "")[:40], "cola": str(orq.get("cola") or "")[:80],
            "orquestador_vivo": bool(orq.get("vivo")), "cpu_p95_7d": carga.get("cpu_p95_7d"),
            "guardian": L.tachar(json.dumps(d.get("guardian"), ensure_ascii=False))[:160] if d.get("guardian") else ""}


def medir(modo: str, ahora: Optional[float] = None) -> Dict[str, Any]:
    """Foto del medio para el latido (sin claves, sin IPs, sin nombre de máquina)."""
    ahora = ahora or time.time()
    raiz = raiz_repo()
    medio = detectar_medio()
    ps = lineas_ps()
    orqs = orquestadores(ps)
    progreso = os.path.join(raiz, "starseed_memory_root", "olas", "progreso.json")
    autoritativo = os.environ.get("STARSEED_NODO_AUTORITATIVO")
    autoritativo = (autoritativo == "1") if autoritativo in ("0", "1") else (medio == "mac" and os.path.exists(progreso))
    salud: Dict[str, Any] = {
        "repo": os.path.isdir(os.path.join(raiz, ".git")),
        "orquestador": sabe_orquestar(raiz),
        "autoritativo": autoritativo,
        "orquestadores": orqs,
        "disco_gb": disco_libre_gb(raiz if os.path.isdir(raiz) else os.path.expanduser("~")),
        "ram_libre_mb": ram_libre_mb(),
        "nucleos": os.cpu_count(),
        "carga": round(os.getloadavg()[0], 2) if hasattr(os, "getloadavg") else None,
        "servicios_caidos": [],
        "guardianes_caidos": [],
    }
    if medio == "mac":
        caidos, guardianes = servicios_mac()
        salud["servicios_caidos"] = [c.replace("com.starseed.", "") for c in caidos]
        salud["guardianes_caidos"] = [g.replace("com.starseed.", "") for g in guardianes]
    elif sys.platform.startswith("linux"):
        salud["servicios_caidos"] = servicios_linux()
    if autoritativo:
        med, edad = medidores_mac(raiz, ahora)
        salud["medidores"] = {k: str(v.get("resumen") if isinstance(v, dict) else v)[:160] for k, v in med.items()}
        salud["medidores_edad_s"] = int(edad) if edad is not None else None
        # Cifras de hace más de 15 min no deciden nada (el vigía que las escribe estará caído y eso
        # ya lo ve la regla de los guardianes).
        salud["trabajo"] = L.trabajo_de_medidores(salud["medidores"]) if edad is not None and edad <= 900 else {}
        revisor = os.path.join(raiz, "starseed_memory_root", "olas", "revisor-bloqueadas.json")
        try:
            salud["revisor_hace_s"] = int(ahora - os.path.getmtime(revisor))
        except OSError:
            salud["revisor_hace_s"] = None
        salud["revisor_vivo"] = proceso_vivo(ps, "revisor_bloqueadas.py")
        # La pausa que Alex pone en Genesis (Ajustes › Directores) manda también aquí.
        try:
            import config_director  # noqa: WPS433
            salud["pausado"] = bool(config_director.cargar()[0].get("pausado"))
        except Exception:  # noqa: BLE001
            salud["pausado"] = False
        # (OPA1011b) Resultados, no solo latidos: si el trabajo AVANZA.
        try:
            salud["resultados"] = resultados_mac(raiz, ahora)
        except Exception as e:  # noqa: BLE001 — medir nunca tumba la vuelta
            salud["resultados"] = {"error": type(e).__name__}
        salud["nube_pausada"] = nube_pausada()
    if medio == "oracle-a1":
        salud["a1"] = estado_a1()
    cap = {"medio": medio, "modo": modo, "repo": salud["repo"], "orquestador": salud["orquestador"],
            "autoritativo": autoritativo, "ram_libre_mb": salud["ram_libre_mb"], "disco_gb": salud["disco_gb"]}
    # Colmena (COL1012C): lo que lleva este aparato y lo que podría aportar. Si una medida falla se publica
    # None (no «sin trabajo» ni «no apto» por defecto): la pantalla distingue «no lo sé» de «no hay».
    try:
        en_curso = en_curso_de(raiz, colas_vivas(ps))
    except Exception:  # noqa: BLE001 — medir nunca tumba la vuelta
        en_curso = None
    try:
        resumen_cola = resumen_cola_viva_de(raiz, ps, ahora)
    except Exception:  # noqa: BLE001 — medir nunca tumba la vuelta
        resumen_cola = None
    try:
        ram_mb = ram_total_mb()
        contenedor = contenedor_de(salud["disco_gb"], ram_mb)
    except Exception:  # noqa: BLE001
        ram_mb, contenedor = None, None
    salud["periodo_s"] = float(os.environ.get("STARSEED_NODO_LATIDO_S", L.LATIDO_S))
    salud["ram_total_mb"] = ram_mb
    salud["en_curso"] = en_curso
    salud["cola_viva"] = resumen_cola
    salud["contenedor"] = contenedor
    salud["desconectando"] = desconectando_ahora(ahora)
    # Falso mientras nadie sepa seguir la tarea de otro (COL1012E subir puntos al A1, G el líder, H al volver).
    salud["relevo"] = False

    return {"medio": medio, "raiz": raiz, "salud": salud, "cap": cap}


# ─── acciones ────────────────────────────────────────────────────────────────────────────


def _python() -> str:
    return sys.executable or "python3"


def lanzar_desacoplado(nombre: str, orden: List[str], cwd: str) -> Tuple[str, str]:
    """Arranca `orden` sin esperar (el latido no se para). Registro en /tmp/starseed-nodo-<nombre>.log."""
    log = "/tmp/starseed-nodo-%s.log" % re.sub(r"[^a-z0-9-]", "-", nombre.lower())
    try:
        with open(log, "ab") as salida:
            subprocess.Popen(orden, cwd=cwd, stdin=subprocess.DEVNULL, stdout=salida, stderr=subprocess.STDOUT,
                             start_new_session=True, env=dict(os.environ, STARSEED_ROOT=cwd))
        return "en_marcha", "lanzado (%s)" % os.path.basename(log)
    except Exception as e:  # noqa: BLE001
        return "fallo", "no pude lanzar: %s" % type(e).__name__


def _script(raiz: str, nombre: str) -> Optional[str]:
    for base in (os.path.join(raiz, "scripts", "puente"), DIRECTORIO):
        ruta = os.path.join(base, nombre)
        if os.path.exists(ruta):
            return ruta
    return None


def escribir_atomico(ruta: str, datos: Any) -> None:
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    tmp = "%s.tmp-%d" % (ruta, os.getpid())
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    os.replace(tmp, ruta)


def _a1_tiene_medio() -> bool:
    return os.path.exists("/opt/starseed/nodo/oracle_a1.py") or os.path.isdir("/var/lib/starseed/nodo")


def ejecutar(a: Dict[str, Any], medio: str, raiz: str, seco: bool,
             rescate: Optional[Any] = None) -> Tuple[str, str]:
    """Hace UNA acción en esta máquina. → (estado, texto). Estados: hecha · en_marcha · seca · fallo · nada."""
    que = a.get("accion")
    args = a.get("args") or {}
    if seco:
        return "seca", "modo seco: lo haría ahora (%s)" % a.get("motivo", que)
    if que == "revivir_servicios":
        hechos, mal = [], []
        for s in args.get("servicios") or []:
            if medio == "mac":
                etiqueta = s if s.startswith("com.starseed.") else "com.starseed." + s
                rc, out = _sh(["launchctl", "kickstart", "-k", "gui/%d/%s" % (os.getuid(), etiqueta)], tope=30)
            else:
                rc, out = _sh(["systemctl", "--user", "restart", s], tope=60)
                if rc != 0:
                    rc, out = _sh(["sudo", "-n", "systemctl", "restart", s], tope=60)
            (hechos if rc == 0 else mal).append(s)
        if mal:
            return "fallo", "relanzados: %s · no pude: %s" % (", ".join(hechos) or "—", ", ".join(mal))
        return "hecha", "relanzados: %s" % ", ".join(hechos)
    if que in ("reactivar", "continuar"):
        if medio == "mac":
            s = _script(raiz, "reactivar_mando.py")
            if not s:
                return "fallo", "no encuentro reactivar_mando.py"
            return lanzar_desacoplado(que, [_python(), s, "--origen", "auto", "--json"], raiz)
        caidos = servicios_linux()
        if not caidos:
            return "nada", "todos los servicios starseed-* están bien en este medio"
        return ejecutar(dict(a, accion="revivir_servicios", args={"servicios": caidos}), medio, raiz, seco)
    if que == "revisar_bloqueadas":
        s = _script(raiz, "revisor_bloqueadas.py") or _script(raiz, "recomprobar_bloqueadas.py")
        if not s:
            return "fallo", "no hay revisor de bloqueadas en este medio"
        return lanzar_desacoplado(que, [_python(), s], raiz)
    if que == "buscar_capacidad":
        s = _script(raiz, "buscar_capacidad.py")
        if not s:
            return "fallo", "no hay buscar_capacidad.py en este medio"
        return lanzar_desacoplado(que, [_python(), s, "buscar"], raiz)
    if que == "buscar_trabajo":
        if rescate is None:
            return "nada", "este medio no tiene las colas en su disco"
        return rescate()
    if que == "lanzar_cola":
        return lanzar_cola(args, medio, raiz)
    if que == "detener_cola":
        cola = str(args.get("cola") or "")
        pids = [o["pid"] for o in orquestadores(lineas_ps()) if o.get("cola") == cola]
        for p in pids:
            try:
                os.kill(p, 15)
            except OSError:
                pass
        return ("hecha", "detenido(s) %d orquestador(es) de %s" % (len(pids), cola)) if pids else (
            "nada", "no había orquestador con %s" % cola)
    if que == "repartir" and str(args.get("modo") or "") == "alimentar":
        return alimentar_cola_viva(args, raiz, lineas_ps())
    if que == "liberar_disco":
        if medio == "mac":
            return "nada", "en la Mac limpia la autocuración de Genesis (lista blanca)"
        _sh(["sudo", "-n", "journalctl", "--vacuum-size=200M"], tope=60)
        borrados = 0
        for n in os.listdir("/tmp"):
            ruta = os.path.join("/tmp", n)
            if re.match(r"^(ola-.*|starseed-nodo-.*)\.log$", n) and time.time() - os.path.getmtime(ruta) > 7 * 86400:
                try:
                    os.remove(ruta)
                    borrados += 1
                except OSError:
                    pass
        return "hecha", "registros viejos fuera (%d) y diario de systemd recortado" % borrados
    if que == "contenedor":
        ruta = os.path.join(CARPETA, "contenedor.json")
        try:
            os.makedirs(CARPETA, exist_ok=True, mode=0o700)
            datos = {"activo": bool(args.get("activo")), "t": time.time()}
            if args.get("activo"):
                datos["trabajadores"] = int(args.get("trabajadores", 2))
            with open(ruta, "w", encoding="utf-8") as f:
                json.dump(datos, f, ensure_ascii=False)
            return ("hecha", "contenedor actualizado: %s" % datos)
        except Exception as e:
            return "fallo", "no pude escribir contenedor: %s" % type(e).__name__
    if que == "desconectar":
        # Lo que hace DE VERDAD hoy (COL1012F): dejar de ofrecer este aparato como contenedor, apuntar la marca
        # «desconectando» (el latido la enseña GRACIA_DESCONECTAR_S) y contar lo que tenía a medias.
        # NO traspasa nada, y el texto no lo promete: subir los puntos de control al A1 (COL1012E), que el líder
        # siga las tareas del nodo perdido (G) y que el aparato suelte lo ya seguido (H) aún no están cableados,
        # y nada para a los agentes que ya corren.
        ahora = time.time()
        try:
            os.makedirs(CARPETA, exist_ok=True, mode=0o700)
            escribir_atomico(os.path.join(CARPETA, "contenedor.json"), {"activo": False, "t": ahora})
            escribir_atomico(os.path.join(CARPETA, "desconectando.json"), {"desconectando": True, "t": ahora})
        except OSError as e:
            return "fallo", "no pude apuntar la desconexión: %s" % type(e).__name__
        try:
            en_curso = en_curso_de(raiz, colas_vivas())
        except Exception:  # noqa: BLE001
            en_curso = None
        if en_curso is None:
            return "hecha", "contenedor apagado; no pude leer el trabajo en curso; el traspaso a otro contenedor aún no está activo"
        con_punto = sum(1 for e in en_curso if e.get("punto"))
        return "hecha", ("contenedor apagado; %d tarea(s) en curso, %d con punto de control en este aparato; "
                         "el traspaso a otro contenedor aún no está activo" % (len(en_curso), con_punto))
    return "nada", "acción desconocida: %s" % que


def lanzar_cola(args: Dict[str, Any], medio: str, raiz: str) -> Tuple[str, str]:
    """Una cola llega a este medio por el camino que ya existe en él (nunca dos orquestadores)."""
    cola = str(args.get("cola") or "")
    if not re.match(r"^cola-[A-Za-z0-9._-]{1,80}$", cola):
        return "fallo", "nombre de cola no válido"
    tareas = args.get("_tareas")
    olas = os.path.join(raiz, "starseed_memory_root", "olas")
    if medio == "mac":
        ruta = os.path.join(olas, cola + ".json")
        if isinstance(tareas, list) and tareas and not os.path.exists(ruta):
            escribir_atomico(ruta, tareas)
            return "hecha", "%d tarea(s) enlistadas en %s: el vigilante las recoge" % (len(tareas), cola)
        if os.path.exists(ruta):
            return "nada", "%s ya está en las colas de la Mac: el vigilante la lleva" % cola
        return "fallo", "la cola no existe en la Mac y la orden no traía tareas"
    if medio == "oracle-a1" and _a1_tiene_medio():
        if not isinstance(tareas, list) or not tareas:
            return "fallo", "al A1 una cola tiene que llegar con sus tareas"
        bandeja = os.path.expanduser("~/.starseed/nodo-metagenesis/entrantes")
        escribir_atomico(os.path.join(bandeja, cola + ".json"), tareas)
        return "hecha", "%d tarea(s) en la bandeja del medio del A1 (las coge oracle_a1)" % len(tareas)
    # Otro medio Linux con repo y orquestador: como el lanzador de la nube.
    if orquestadores(lineas_ps()):
        return "nada", "ya hay un orquestador vivo en este medio"
    rc, sucio = _sh(["git", "status", "--porcelain"], cwd=raiz, tope=30)
    if rc != 0 or sucio.strip():
        return "fallo", "árbol con cambios sin commit: no arranco"
    ruta = os.path.join(olas, cola + ".json")
    if isinstance(tareas, list) and tareas:
        escribir_atomico(ruta, tareas)
    elif not os.path.exists(ruta):
        return "fallo", "la cola no existe aquí y la orden no traía tareas"
    orq = next((os.path.expanduser(p) for p in ("~/bin/starseed-enjambre.py", "~/.local/bin/starseed-enjambre.py")
                if os.path.exists(os.path.expanduser(p))), os.path.join(raiz, "scripts", "enjambre", "starseed-enjambre.py"))
    trabajadores = str(max(1, min(4, int(args.get("trabajadores") or 2))))
    os.environ.setdefault("STARSEED_DONDE", medio)
    return lanzar_desacoplado("orquestador-" + cola, [_python(), orq, os.path.join("starseed_memory_root", "olas", cola + ".json"),
                                                     "--workers", trabajadores], raiz)


# ─── rescate de trabajo (solo en el medio con las colas en disco) ────────────────────────


def reunir_para_rescate(raiz: str) -> Dict[str, Any]:
    """Colas vivas, colas-fuente, progreso y asuntos de main (lo que necesita el rescate)."""
    olas = os.path.join(raiz, "starseed_memory_root", "olas")
    fuente = os.path.join(raiz, "starseed_memory_root", "colas-fuente")
    ids_vivos = set()
    for n in os.listdir(olas) if os.path.isdir(olas) else []:
        if n.startswith("cola-") and n.endswith(".json"):
            d = leer_json(os.path.join(olas, n), [])
            for t in (d if isinstance(d, list) else (d or {}).get("tareas", [])) or []:
                if isinstance(t, dict) and t.get("id"):
                    ids_vivos.add(str(t["id"]))
    colas = []
    limite = time.time() - 30 * 86400
    for n in os.listdir(fuente) if os.path.isdir(fuente) else []:
        if not (n.startswith("cola-") and n.endswith(".json")) or n.startswith(("cola-auto-", "cola-suenos")):
            continue
        ruta = os.path.join(fuente, n)
        try:
            mtime = os.path.getmtime(ruta)
        except OSError:
            continue
        if mtime < limite:
            continue
        d = leer_json(ruta, [])
        tareas = d if isinstance(d, list) else (d or {}).get("tareas", []) if isinstance(d, dict) else []
        colas.append((n, mtime, tareas or []))
    progreso = leer_json(os.path.join(olas, "progreso.json"), {})
    rc, out = _sh(["git", "log", "main", "--since=45 days ago", "--format=%s"], cwd=raiz, tope=40)
    asuntos = out.splitlines() if rc == 0 else []
    return {"ids_vivos": ids_vivos, "colas_fuente": colas, "progreso": progreso if isinstance(progreso, dict) else {},
            "asuntos": asuntos}
