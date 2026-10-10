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
from typing import Any, Dict, List, Optional, Tuple

import nodo_metagenesis_logica as L

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))


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
    if medio == "oracle-a1":
        salud["a1"] = estado_a1()
    cap = {"medio": medio, "modo": modo, "repo": salud["repo"], "orquestador": salud["orquestador"],
           "autoritativo": autoritativo, "ram_libre_mb": salud["ram_libre_mb"], "disco_gb": salud["disco_gb"]}
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
