#!/usr/bin/env python3
"""Comprueba un medidor de Genesis midiendo el sistema real sin datos inventados."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

RUTA_COMPROBACIONES = Path("starseed_memory_root/mando/comprobaciones")
MANDO = os.environ.get("STARSEED_MANDO_URL", "http://localhost:9002")
ESTADOS_VIVOS_NUBE = ("in_progress", "queued", "waiting", "requested", "pending")
#: (2026-09-23) Alex: «no funciona la autoverificación». No funcionaba para la mitad de los
#: medidores: «en-curso», «ola-activa», «tokens», «integradas», «contenedores»… caían en
#: «Medidor no reconocido», y «agentes» solo contaba procesos de la Mac, así que con cuatro
#: agentes en la nube el botón decía «muerto». Ahora TODOS se comprueban igual: se vuelve a
#: medir por un camino independiente del medidor y se compara con lo que el medidor dice.
MEDIDORES_COTEJADOS = ("agentes", "en-curso", "ola-activa", "tokens", "integradas",
                       "listas", "bloqueadas", "contenedores")


def _salida(comando: List[str]) -> Optional[str]:
    try:
        res = subprocess.run(
            comando, capture_output=True, text=True, timeout=10, check=True
        )
        return res.stdout
    except Exception:
        return None


def _a_mb(cantidad: str, unidad: str) -> float:
    factores = {
        "B": 1 / (1024**2),
        "K": 1 / 1024,
        "M": 1.0,
        "G": 1024.0,
        "T": 1024.0**2,
    }
    return round(float(cantidad) * factores.get(unidad.upper(), 1.0), 2)


def medir_memoria() -> Tuple[Optional[float], Optional[float]]:
    """Mide la memoria RAM y Swap libre real sin inventar valores por defecto."""
    ram_libre: Optional[float] = None
    swap_libre: Optional[float] = None

    if sys.platform == "darwin":
        salida_vm = _salida(["vm_stat"])
        if salida_vm:
            tam_pag = 4096
            m_pag = re.search(r"page size of (\d+) bytes", salida_vm)
            if m_pag:
                tam_pag = int(m_pag.group(1))
            m_free = re.search(r"Pages free:\s+(\d+)", salida_vm)
            m_spec = re.search(r"Pages speculative:\s+(\d+)", salida_vm)
            paginas = (int(m_free.group(1)) if m_free else 0) + (
                int(m_spec.group(1)) if m_spec else 0
            )
            if m_free or m_spec:
                ram_libre = round((paginas * tam_pag) / (1024**2), 2)

        salida_swap = _salida(["sysctl", "vm.swapusage"])
        if salida_swap:
            m_swap = re.search(
                r"free\s*=\s*([\d.]+)([KMGTB])", salida_swap, re.IGNORECASE
            )
            if m_swap:
                swap_libre = _a_mb(m_swap.group(1), m_swap.group(2))

    elif sys.platform.startswith("linux"):
        p_mem = Path("/proc/meminfo")
        if p_mem.exists():
            txt = p_mem.read_text(encoding="utf-8")
            m_avail = re.search(r"^MemAvailable:\s+(\d+)\s+kB", txt, re.MULTILINE)
            if m_avail:
                ram_libre = round(int(m_avail.group(1)) / 1024, 2)
            m_sfree = re.search(r"^SwapFree:\s+(\d+)\s+kB", txt, re.MULTILINE)
            if m_sfree:
                swap_libre = round(int(m_sfree.group(1)) / 1024, 2)

    return ram_libre, swap_libre


def medir_disco() -> Optional[float]:
    """Mide los GB libres en disco real."""
    try:
        return round(shutil.disk_usage(".").free / (1024**3), 2)
    except Exception:
        return None


def medir_proveedores() -> Tuple[Optional[int], Optional[bool]]:
    """Lee el informe real de pasarelas de ~/.starseed/pasarelas-informe.json."""
    ruta = Path.home() / ".starseed" / "pasarelas-informe.json"
    if not ruta.exists():
        ruta = Path("starseed_memory_root/mando/pasarelas-informe.json")
    if not ruta.exists():
        return None, None
    try:
        datos = json.loads(ruta.read_text(encoding="utf-8"))
        if not isinstance(datos, dict):
            return None, None
        activos = datos.get("proveedores_activos")
        pasarelas_ok = datos.get("pasarelas_ok")
        if isinstance(activos, int) and not isinstance(activos, bool):
            act_num = activos
        else:
            act_num = None
        p_ok = pasarelas_ok if isinstance(pasarelas_ok, bool) else None
        return act_num, p_ok
    except Exception:
        return None, None


def medir_git_sin_publicar() -> Optional[int]:
    """Mide commits pendientes con git log origin/main..HEAD."""
    salida = _salida(["git", "log", "--oneline", "origin/main..HEAD"])
    if salida is None:
        return None
    lineas = [l for l in salida.splitlines() if l.strip()]
    return len(lineas)


#: (2026-10-08) Se clasifica por el EJECUTABLE y su primer argumento, nunca por trozos de texto
#: dentro de los argumentos. Medido en la Mac: tres `opencode run …` escribiendo y la
#: comprobación decía «Sin procesos de opencode activos» y «NO COINCIDEN (0 medidos)», porque el
#: filtro antiguo descartaba toda línea cuyos argumentos completos contuvieran «grep», «vim»,
#: «nano» o «cat»… y el prompt de una tarea (es el argumento de `opencode run`) dice «catálogo»,
#: «indicate», «grep» con toda naturalidad. Además contaba cada proceso con «opencode» dentro:
#: el ayudante `opencode … eslintServer.js --stdio` de cada agente se sumaba como si escribiera.
IGNORADOS = frozenset({
    "grep", "egrep", "fgrep", "rg", "ag", "pgrep", "pkill", "ps", "vim", "vi", "nvim", "nano",
    "emacs", "cat", "bat", "less", "more", "head", "tail", "watch", "tee", "sed", "awk",
})
SCRIPTS_ORQUESTADOR = frozenset({"starseed-enjambre.py", "starseed_enjambre.py",
                                 "starseed-enjambre", "starseed_enjambre"})
SCRIPTS_VIGILANTE = frozenset({"vigilante-enjambre.py", "vigilante_enjambre.py",
                               "vigilante-enjambre", "vigilante_enjambre"})
INTERPRETES = frozenset({"node", "nodejs", "bun", "deno"})
PATRON_ETIME = re.compile(r"^(?:\d+-)?(?:\d+:)?\d{1,2}:\d{2}$")
PATRON_WORKTREE = re.compile(r"starseed-wt/([A-Za-z0-9_.-]+)")


def _programa(tokens: List[str]) -> Tuple[str, str, List[str]]:
    """PURA: (ejecutable, programa real, argumentos del programa).

    Un intérprete (`python -u script.py`, `node script.js`) se salta junto con sus opciones: el
    programa real es el script. Un binario directo (`opencode run …`) es él mismo."""
    exe = os.path.basename(tokens[0]).lower()
    resto = tokens[1:]
    if exe.startswith("python") or exe in INTERPRETES:
        i = 0
        while i < len(resto) and resto[i].startswith("-"):
            if resto[i] == "-m" and i + 1 < len(resto):
                return exe, os.path.basename(resto[i + 1]).lower(), resto[i + 2:]
            if resto[i] == "-c":
                return exe, exe, resto[i + 1:]
            i += 1
        if i < len(resto):
            return exe, os.path.basename(resto[i]).lower(), resto[i + 1:]
        return exe, exe, []
    return exe, exe, resto


def clasificar_proceso(args: str) -> Tuple[Optional[str], Optional[str]]:
    """PURA: (tipo, tarea) de una línea de `ps` SIN el pid; tipo es None si no nos interesa.

    tipo: «orquestador» | «vigilante» | «opencode» (solo `opencode run`) | «codex» (solo
    `codex exec`). tarea: el id de `starseed-wt/<ID>` que lleva un escritor en sus argumentos."""
    tokens = args.split(None, 8)
    if tokens and PATRON_ETIME.match(tokens[0]):  # `ps -o pid,etime,args`: «13:11 /ruta/…»
        tokens = tokens[1:]
        args = args.split(None, 1)[1] if len(args.split(None, 1)) > 1 else ""
    if not tokens:
        return None, None
    exe, programa, argumentos = _programa(tokens)
    if exe in IGNORADOS or programa in IGNORADOS:
        return None, None
    if programa == os.path.basename(__file__).lower():  # esta misma comprobación
        return None, None
    if programa in SCRIPTS_ORQUESTADOR:
        return "orquestador", None
    if programa in SCRIPTS_VIGILANTE:
        return "vigilante", None
    primero = argumentos[0] if argumentos else ""
    tipo = None
    if programa == "opencode" and primero == "run":
        tipo = "opencode"
    elif (programa == "codex" or programa.startswith("codex-")) and primero == "exec":
        tipo = "codex"
    if tipo is None:
        return None, None
    m = PATRON_WORKTREE.search(args)
    return tipo, (m.group(1).rstrip(".-_") or None) if m else None


def medir_procesos() -> Dict[str, Any]:
    """Escanea ps para buscar orquestador, vigilante, escritores opencode y codex.

    Además de las listas de PIDs devuelve `escritores_por_tarea`: {id de tarea: pid}."""
    pids: Dict[str, Any] = {
        "orquestador": [],
        "vigilante": [],
        "opencode": [],
        "codex": [],
        "escritores_por_tarea": {},
    }
    salida = _salida(["ps", "-axo", "pid=,args="])
    if not salida:
        return pids

    for linea in salida.splitlines():
        partes = linea.strip().split(maxsplit=1)
        if len(partes) != 2 or not partes[0].isdigit():
            continue
        pid = int(partes[0])
        if pid == os.getpid():
            continue
        tipo, tarea = clasificar_proceso(partes[1])
        if tipo is None:
            continue
        pids[tipo].append(pid)
        if tarea and tipo in ("opencode", "codex"):
            pids["escritores_por_tarea"].setdefault(tarea, pid)

    return pids


def medir_hechos(medidor: str) -> Dict[str, Any]:
    """Recoge hechos observados para el medidor solicitado."""
    clave = medidor.replace("_", "-")
    hechos: Dict[str, Any] = {}
    if clave in ("listas", "bloqueadas", "agentes", "procesos"):
        hechos["procesos"] = medir_procesos()
    if clave in ("memoria", "todos"):
        ram, swap = medir_memoria()
        hechos["memoria_libre_mb"] = ram
        hechos["swap_libre_mb"] = swap
    if clave in ("disco", "todos"):
        hechos["disco_libre_gb"] = medir_disco()
    if clave in ("proveedores", "todos"):
        activos, p_ok = medir_proveedores()
        hechos["proveedores_activos"] = activos
        hechos["pasarelas_ok"] = p_ok
    if clave in ("sin-publicar", "todos"):
        hechos["sin_publicar"] = medir_git_sin_publicar()
    if clave in MEDIDORES_COTEJADOS:
        hechos.setdefault("procesos", medir_procesos())
        hechos["detalle"] = leer_detalle(clave)
        if clave in ("agentes", "en-curso", "ola-activa", "tokens"):
            hechos["agentes_nube"] = remedir_nube()
        if clave in ("agentes", "en-curso", "ola-activa"):
            hechos["fases"] = leer_fases_latidos()
        if clave == "tokens":
            try:
                ruta = Path("starseed_memory_root/mando/tokens-por-segundo.json")
                hechos["tokens_edad_s"] = int(datetime.now().timestamp() - ruta.stat().st_mtime)
            except OSError:
                hechos["tokens_edad_s"] = None
        if clave == "integradas":
            hechos["integradas_main"] = contar_integradas()
        # Lo que el vigía encontró en su última pasada (cada 2 min). Antes se volvía a
        # diagnosticar aquí leyendo los siete medidores de la API: con la Mac en swap eso
        # tardaba más de un minuto y el botón se quedaba «sin terminar». El vigía ya lo
        # hizo; se lee su resultado si es de los últimos 10 minutos.
        try:
            ruta = Path("starseed_memory_root/mando/vigia-medidores.json")
            if datetime.now().timestamp() - ruta.stat().st_mtime < 600:
                hechos["vigia"] = json.loads(ruta.read_text(encoding="utf-8")).get("problemas") or []
            else:
                hechos["vigia"] = []
        except (OSError, ValueError):
            hechos["vigia"] = []
    return hechos


def leer_detalle(clave: str) -> Optional[Dict[str, Any]]:
    """Lo que el medidor dice AHORA, leído de la misma API que pinta la ventana."""
    import urllib.parse
    import urllib.request
    try:
        url = "%s/api/mando/medidores?clave=%s" % (MANDO, urllib.parse.quote(clave))
        with urllib.request.urlopen(url, timeout=60) as r:
            return (json.loads(r.read().decode("utf-8")) or {}).get("detalle") or {}
    except Exception:
        return None


def leer_fases_latidos(carpeta: Optional[Path] = None) -> Dict[str, str]:
    """{tarea: fase} que el orquestador de esta Mac escribió en sus `latidos-*.json`.

    (2026-10-08) El medidor «Agentes» enseña TODO latido como «escribiendo», también el de una
    tarea en `tsc`, `tests` o `revision`, y en esas fases no hay `opencode run`: las puertas las
    corre el propio orquestador en Python. Sin la fase real, la comprobación daría por colgado a
    cada agente que está pasando una puerta."""
    carpeta = carpeta if carpeta is not None else Path("starseed_memory_root/olas")
    fases: Dict[str, str] = {}
    try:
        archivos = sorted(carpeta.glob("latidos-*.json"), key=lambda a: a.stat().st_mtime)
    except OSError:
        return fases
    ahora = datetime.now().timestamp()
    for archivo in archivos:
        try:
            if ahora - archivo.stat().st_mtime > 86400:
                continue
            datos = json.loads(archivo.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        for tid, v in ((datos or {}).get("tareas") or {}).items() if isinstance(datos, dict) else []:
            if isinstance(v, dict) and v.get("fase"):
                fases[str(tid)] = str(v["fase"])
    return fases


# Cómo se lee la fila de un medidor de agentes. Nada de esto abre procesos: es texto puro.
_RE_APRUEBA = re.compile(r"aprobaci|visto bueno", re.I)
_RE_ESPERA = re.compile(r"esperand|sin pasarela", re.I)
_RE_COMPRUEBA = re.compile(r"comproband|verificand|\btsc\b|probando|\btests?\b|testing|vitest|pruebas|revis|integrand", re.I)
# (2026-10-09) El medidor dice ahora «sin escribir» (antes «callado») y «corrigiendo» (un modelo
# arregla lo que falló en tsc/pruebas): los dos tienen un proceso escritor detrás.
_RE_ESCRIBE = re.compile(r"escribiend|completand|callad|sin escribir|corrigiend", re.I)
_RE_SUENA = re.compile(r"so[ñn]and|analizand", re.I)
_RE_TAREA_EN_ETAPA = re.compile(r"trabaja en (\S+)")
_RE_ID_DE_TAREA = re.compile(r"^[A-Za-z][A-Za-z0-9_.-]{0,31}$")
_RE_DONDE = re.compile(r"\ben ([A-Za-z0-9_.-]+)\s*$")
_RE_N_AGENTES = re.compile(r"(\d+) agentes?")
FASES_QUE_ESCRIBEN = ("escribiendo", "completando")


def _clase_de_texto(estado: str, aux: str) -> str:
    """PURA: clase de una fila a partir de su estado y del resto de su texto (etapa/porque)."""
    estado, aux = estado.lower(), aux.lower()
    if "fuera" in estado:
        return "fuera"
    if _RE_SUENA.search(estado):
        return "sonando"
    if _RE_APRUEBA.search(estado):
        return "aprobacion"
    if _RE_ESPERA.search(estado):
        return "esperando"
    if _RE_COMPRUEBA.search(estado):
        return "comprobando"
    if re.search(r"corrigiend", estado):
        return "escribiendo"
    if _RE_ESCRIBE.search(estado):
        return "comprobando" if _RE_COMPRUEBA.search(aux) else "escribiendo"
    # Estado genérico («en curso», una fase que no conozco): lo dice la etapa.
    if _RE_APRUEBA.search(aux):
        return "aprobacion"
    if _RE_ESPERA.search(aux):
        return "esperando"
    if _RE_COMPRUEBA.search(aux):
        return "comprobando"
    if re.search(r"escribiend|completand", aux):
        return "escribiendo"
    return "otro"


def _clase_de_fase(fase: str) -> Optional[str]:
    """PURA: clase real de una fase del orquestador (None si no la conozco)."""
    f = (fase or "").strip().lower()
    if f in FASES_QUE_ESCRIBEN:
        return "escribiendo"
    if f == "analizando":
        return "sonando"
    if f in ("hecho", "commit"):
        return "otro"
    if _RE_APRUEBA.search(f):
        return "aprobacion"
    if "esperand" in f:
        return "esperando"
    if f in ("tsc", "tests", "testing", "probando", "revision", "integrando"):
        return "comprobando"
    return None


def filas_del_medidor(clave: str, detalle: Optional[Dict[str, Any]],
                      fases: Optional[Dict[str, str]] = None) -> List[Dict[str, Any]]:
    """PURA: filas del medidor de agentes ya clasificadas.

    Cada una: {id, tarea, clase, donde, n, codex}. `clase`: escribiendo | esperando |
    comprobando | aprobacion | sonando | fuera | otro. Una fila que dice «escribiendo» pero cuya
    tarea está en otra fase del orquestador (`fases`, de los latidos) se reclasifica: ahí no hay
    escritor por diseño."""
    fases = fases or {}
    resultado: List[Dict[str, Any]] = []
    for f in (detalle or {}).get("filas") or []:
        if not isinstance(f, dict):
            continue
        fid = str(f.get("id") or "")
        if fid.startswith("ola:"):
            continue
        etapa = str(f.get("etapa") or "")
        m = _RE_TAREA_EN_ETAPA.search(etapa)
        tarea = m.group(1).rstrip(".,;:") if m else None
        if tarea is None and "·" not in fid and _RE_ID_DE_TAREA.match(fid):
            tarea = fid
        aux = _RE_TAREA_EN_ETAPA.sub(" ", etapa) + " " + str(f.get("porque") or "")
        clase = _clase_de_texto(str(f.get("estado") or ""), aux)
        if clase == "escribiendo" and tarea and _clase_de_fase(fases.get(tarea, "")) not in (None, "escribiendo"):
            clase = _clase_de_fase(fases[tarea]) or clase
        donde = None
        for campo in (f.get("titulo"), f.get("quien")):
            md = _RE_DONDE.search(str(campo or ""))
            if md:
                donde = md.group(1).lower()
                break
        mn = _RE_N_AGENTES.search(str(f.get("quien") or ""))
        resultado.append({
            "id": fid,
            "tarea": tarea,
            "clase": clase,
            "donde": donde,
            "n": int(mn.group(1)) if mn else 1,
            "codex": "codex" in (fid + " " + str(f.get("titulo") or "")).lower(),
        })
    return resultado


def _es_nube(donde: Optional[str]) -> bool:
    return bool(donde) and donde != "mac"


def analizar_agentes(clave: str, detalle: Optional[Dict[str, Any]], hechos: Dict[str, Any]) -> Dict[str, Any]:
    """PURA: lo que dicen las filas del medidor frente a los procesos escritores de esta Mac.

    Solo una fila que dice estar ESCRIBIENDO en la Mac necesita un `opencode run`/`codex exec`
    vivo. Esperando modelo, pasando tsc/tests/revisión, esperando visto bueno, soñando o
    trabajando fuera no tienen proceso escritor por diseño: no cuentan como fallo.

    Emparejado: por id de tarea (`starseed-wt/<ID>` del proceso frente al «trabaja en <ID>» de la
    fila). Si no se puede mapear (un proceso sin worktree en sus argumentos, una fila sin id), se
    cae a contar: los procesos sin tarea explican, como mucho, tantas filas sueltas."""
    procesos = hechos.get("procesos") or {}
    por_tarea = procesos.get("escritores_por_tarea") or {}
    n_procesos = len(procesos.get("opencode", [])) + len(procesos.get("codex", []))
    nube = hechos.get("agentes_nube")
    filas = filas_del_medidor(clave, detalle, hechos.get("fases"))
    cuenta = {c: sum(f["n"] for f in filas if f["clase"] == c)
              for c in ("escribiendo", "esperando", "comprobando", "aprobacion", "sonando", "fuera")}

    escribiendo = [f for f in filas if f["clase"] == "escribiendo"]
    en_nube = [f for f in escribiendo if _es_nube(f["donde"])]
    candidatas = [f for f in escribiendo if not _es_nube(f["donde"])]
    emparejadas = {i for i, f in enumerate(candidatas) if f["tarea"] and f["tarea"] in por_tarea}
    # Procesos que no se pudieron atribuir a ninguna tarea: pueden explicar filas sin emparejar.
    sueltos = max(0, n_procesos - len(set(por_tarea.values())))
    capacidad_nube = None if nube is None else max(0, nube - sum(f["n"] for f in en_nube))
    sin_proceso: List[str] = []
    por_confirmar: List[str] = []   # sin proceso, sin sitio conocido y la nube no se pudo medir
    inferidas_nube: List[Dict[str, Any]] = []
    for i, f in enumerate(candidatas):
        if i in emparejadas:
            continue
        nombre = f["tarea"] or f["id"]
        if sueltos >= f["n"]:
            sueltos -= f["n"]
            emparejadas.add(i)
        elif f["donde"] is None and capacidad_nube is None:
            por_confirmar.append(nombre)
        elif f["donde"] is None and capacidad_nube >= f["n"]:
            capacidad_nube -= f["n"]
            inferidas_nube.append(f)
        else:
            sin_proceso.append(nombre)
    ids_con_fila = {f["tarea"] for f in filas if f["tarea"]}
    en_nube_n = sum(f["n"] for f in en_nube)
    return {
        "usable": any(cuenta.values()),
        "con_proceso": sum(candidatas[i]["n"] for i in emparejadas),
        "sin_proceso": sin_proceso,
        "por_confirmar": por_confirmar,
        "esperando": cuenta["esperando"],
        "comprobando": cuenta["comprobando"],
        "aprobacion": cuenta["aprobacion"],
        "sonando": cuenta["sonando"],
        "fuera": cuenta["fuera"],
        "en_nube": en_nube_n + sum(f["n"] for f in inferidas_nube),
        "nube_de_mas": nube is not None and en_nube_n > nube,
        "huerfanos": sorted(t for t in por_tarea if ids_con_fila and t not in ids_con_fila),
        "hay_codex": any(f["codex"] for f in filas),
        "codex_escribiendo": any(f["codex"] for f in escribiendo),
        "escribiendo_mac": sum(f["n"] for f in candidatas),
    }


def agentes_en_la_nube(datos: Any) -> int:
    """PURA: agentes trabajando ahora en la nube según `agentes-nube.json`."""
    n = 0
    for r in (datos or {}).get("runs") or []:
        if str(r.get("estado") or "").strip().lower() in ESTADOS_VIVOS_NUBE:
            try:
                n += int(r.get("agentes") or 0)
            except (TypeError, ValueError):
                continue
    return n


def remedir_nube() -> Optional[int]:
    """Vuelve a preguntar a GitHub (agentes_nube.py) y cuenta. None si no se pudo."""
    try:
        subprocess.run([sys.executable, str(Path(__file__).with_name("agentes_nube.py"))],
                       capture_output=True, timeout=90)
        with open("starseed_memory_root/mando/agentes-nube.json", encoding="utf-8") as f:
            return agentes_en_la_nube(json.load(f))
    except Exception:
        return None


PATRON_TAREA = re.compile(r"^(?:(.*?)\s*·\s*)?([A-Za-z][A-Za-z0-9_-]{0,23})\s*:\s*(.*)$")


def integradas_en_main(asuntos: List[str], conocidas: set) -> int:
    """PURA: tareas distintas con un commit en main (misma regla que `integradas.ts`)."""
    vistas = set()
    for a in asuntos:
        m = PATRON_TAREA.match(a.strip())
        if m and m.group(2) in conocidas:
            vistas.add(m.group(2))
    return len(vistas)


def contar_integradas() -> Optional[int]:
    try:
        salida = _salida(["git", "log", "main", "-n", "5000", "--format=%s"]) or ""
        with open("starseed_memory_root/olas/progreso.json", encoding="utf-8") as f:
            conocidas = set(json.load(f).keys())
        for cola in Path("starseed_memory_root/olas").glob("cola-*.json"):
            try:
                d = json.loads(cola.read_text(encoding="utf-8"))
            except Exception:
                continue
            lista = d if isinstance(d, list) else (d.get("tareas") or []) if isinstance(d, dict) else []
            conocidas.update(str(t.get("id")) for t in lista if isinstance(t, dict) and t.get("id"))
        return integradas_en_main(salida.splitlines(), conocidas)
    except Exception:
        return None


def _numero(patron: str, texto: str) -> Optional[int]:
    m = re.search(patron, texto or "")
    return int(m.group(1)) if m else None


def agentes_que_dice(clave: str, detalle: Dict[str, Any]) -> Optional[int]:
    """PURA: cuántos agentes dice el medidor, leído de su propia frase o de sus filas."""
    resumen = str(detalle.get("resumen") or "")
    # (2026-10-08) «ningún agente escribiendo» / «ninguna tarea en curso» es un 0 dicho con
    # palabras: sin esto, con la Mac parada y el medidor en 0 la comprobación decía «dice —» y
    # «NO COINCIDEN» (None != 0).
    if clave in ("agentes", "en-curso") and re.match(r"\s*ning[uú]n", resumen, re.I):
        return 0
    if clave == "agentes":
        return _numero(r"(\d+) en total", resumen)
    if clave == "en-curso":
        return _numero(r"(\d+) agente", resumen)
    if clave == "ola-activa":
        filas = [f for f in detalle.get("filas") or [] if str(f.get("id") or "").startswith("ola:")]
        return sum(_numero(r"(\d+) agente", str(f.get("quien") or "")) or 0 for f in filas)
    return None


def _n_agentes(n: int) -> str:
    return "%d agente%s" % (n, "" if n == 1 else "s")


def cotejar_agentes(clave: str, detalle: Dict[str, Any], hechos: Dict[str, Any]) -> List[Dict[str, str]]:
    """PURA: compara el medidor de agentes con los procesos de la Mac y con la nube, con honradez.

    (2026-10-08) Medido en la Mac: tres `opencode run` escribiendo y la comprobación decía
    «medido ahora: 0 en la Mac + 0 en la nube = 0 · NO COINCIDEN». Dos mentiras a la vez: no veía
    los procesos (ver `clasificar_proceso`) y exigía que TODA fila del medidor tuviera un proceso,
    cuando un agente esperando modelo o pasando tsc/tests/revisión no tiene escritor por diseño.
    Ahora solo se acusa a una fila que dice estar escribiendo en la Mac y no tiene proceso, con su
    id. Si el medidor no trae filas clasificables, se cae a comparar números."""
    nube = hechos.get("agentes_nube")
    a = analizar_agentes(clave, detalle, hechos)
    if not a["usable"]:
        dice = agentes_que_dice(clave, detalle)
        procesos = hechos.get("procesos") or {}
        mac = len(procesos.get("opencode", [])) + len(procesos.get("codex", []))
        if nube is None:
            return [veredicto_proceso("Agentes medidos", "desconocido",
                                      "no pude volver a preguntar a GitHub por la nube")]
        medidos = mac + nube
        estado = "vivo" if dice == medidos else "colgado"
        return [veredicto_proceso(
            "Agentes medidos", estado,
            "el medidor dice %s; medido ahora: %d en la Mac + %d en la nube = %d%s"
            % (dice if dice is not None else "—", mac, nube, medidos,
               "" if estado == "vivo" else " · NO COINCIDEN"))]
    partes = ["%s escribiendo con proceso vivo" % _n_agentes(a["con_proceso"]),
              "%d esperando modelo (sin proceso, normal)" % a["esperando"],
              "%d comprobando (tsc/tests/revisión)" % a["comprobando"]]
    if a["aprobacion"]:
        partes.append("%d esperando tu visto bueno (sin proceso, normal)" % a["aprobacion"])
    if a["sonando"]:
        partes.append("%d soñando (sin proceso escritor, normal)" % a["sonando"])
    if a["fuera"]:
        partes.append("%d trabajando fuera" % a["fuera"])
    if a["en_nube"]:
        partes.append("%d escribiendo en la nube" % a["en_nube"])
    if a["huerfanos"]:
        partes.append("procesos sin fila en el medidor: %s" % ", ".join(a["huerfanos"]))
    estado = "vivo"
    if a["sin_proceso"]:
        estado = "colgado"
        partes.append("NO COINCIDEN: el medidor da por escribiendo, y no tienen proceso en la Mac, a %s"
                      % ", ".join(a["sin_proceso"]))
    if a["nube_de_mas"]:
        estado = "colgado"
        partes.append("NO COINCIDEN: el medidor da más agentes en la nube de los que cuenta GitHub (%s)" % nube)
    if a["por_confirmar"] and estado == "vivo":
        estado = "desconocido"
        partes.append("sin proceso en la Mac y no pude preguntar a GitHub si están en la nube: %s"
                      % ", ".join(a["por_confirmar"]))
    return [veredicto_proceso("Agentes medidos", estado, " · ".join(partes))]


def cotejar(clave: str, detalle: Optional[Dict[str, Any]], hechos: Dict[str, Any]) -> List[Dict[str, str]]:
    """PURA: lo que dice el medidor frente a lo que se acaba de medir por otro camino."""
    if detalle is None:
        return [veredicto_proceso("Medidor", "muerto", "la API de Genesis no contestó")]
    fuera = [veredicto_proceso("Medidor", "vivo", "contesta: %s" % str(detalle.get("resumen") or "")[:160])]
    if clave in ("agentes", "en-curso", "ola-activa"):
        fuera.extend(cotejar_agentes(clave, detalle, hechos))
    if clave == "tokens":
        edad = hechos.get("tokens_edad_s")
        if edad is None:
            fuera.append(veredicto_proceso("Servicio de tokens", "muerto", "no hay archivo de tokens"))
        else:
            fuera.append(veredicto_proceso(
                "Servicio de tokens", "vivo" if edad < 30 else "colgado",
                "última muestra hace %d s%s" % (edad, "" if edad < 30 else " · el servicio no escribe")))
        nube = hechos.get("agentes_nube")
        ciegos = sum(_numero(r"(\d+)", str(f.get("etapa") or "")) or 0
                     for f in detalle.get("filas") or [] if "sin contador" in str(f.get("estado") or ""))
        if nube is not None:
            fuera.append(veredicto_proceso(
                "Agentes sin contador", "vivo" if ciegos == nube else "colgado",
                "el medidor nombra %d; en la nube hay %d%s" % (ciegos, nube,
                                                             "" if ciegos == nube else " · NO COINCIDEN")))
    if clave == "integradas":
        dice = _numero(r"^(\d+) tareas integradas", str(detalle.get("resumen") or ""))
        medidas = hechos.get("integradas_main")
        if medidas is None:
            fuera.append(veredicto_proceso("Integradas en main", "desconocido", "no pude leer git"))
        else:
            fuera.append(veredicto_proceso(
                "Integradas en main", "vivo" if dice == medidas else "colgado",
                "el medidor dice %s; contadas ahora en git: %d" % (dice, medidas)))
    for p in hechos.get("vigia") or []:
        if p.get("clave") == clave:
            fuera.append(veredicto_proceso("Vigía: %s" % p.get("tipo"), "colgado", str(p.get("porque") or "")))
    return fuera


def veredicto_proceso(
    proceso: str,
    estado: str,
    detalle: str,
) -> Dict[str, str]:
    """Crea una estructura VeredictoProceso compatible con TypeScript."""
    return {
        "proceso": proceso,
        "estado": estado,
        "detalle": detalle,
    }


def veredictos_de(
    medidor: str,
    procesos: Any,
    hechos: Dict[str, Any],
) -> Tuple[List[Dict[str, str]], str]:
    """Calcula veredictos y frase de resumen de forma pura desde hechos reales."""
    clave = medidor.replace("_", "-")
    veredictos: List[Dict[str, str]] = []

    p_dict = procesos if isinstance(procesos, dict) else hechos.get("procesos", {})
    if not isinstance(p_dict, dict):
        p_dict = {}

    if clave in ("listas", "bloqueadas"):
        orq = p_dict.get("orquestador", [])
        vig = p_dict.get("vigilante", [])
        if orq:
            veredictos.append(
                veredicto_proceso("Orquestador", "vivo", f"Ejecutándose (PIDs: {orq})")
            )
        else:
            veredictos.append(
                veredicto_proceso(
                    "Orquestador", "muerto", "No hay proceso de orquestador activo"
                )
            )
        if vig:
            veredictos.append(
                veredicto_proceso("Vigilante", "vivo", f"Ejecutándose (PIDs: {vig})")
            )
        else:
            veredictos.append(
                veredicto_proceso(
                    "Vigilante", "muerto", "No hay proceso de vigilante activo"
                )
            )

    elif clave == "agentes":
        op = p_dict.get("opencode", [])
        cx = p_dict.get("codex", [])
        por_tarea = p_dict.get("escritores_por_tarea") or {}
        detalle = hechos.get("detalle")
        # (2026-10-08) Sin escritores NO es «muerto» si el medidor tampoco da a nadie escribiendo
        # en la Mac: un agente esperando modelo o pasando tsc/tests/revisión no tiene proceso. Y
        # «codex» solo se nombra si alguien lo usa; antes salía en rojo con «Sin procesos de
        # codex activos» aunque nadie lo hubiera lanzado.
        analisis = (analizar_agentes(clave, detalle, {**hechos, "procesos": p_dict})
                    if detalle is not None else None)
        if op:
            tareas = sorted(t for t, pid in por_tarea.items() if pid in op)
            veredictos.append(
                veredicto_proceso(
                    "Agente opencode",
                    "vivo",
                    "%d escritor%s (PIDs: %s)%s"
                    % (len(op), "" if len(op) == 1 else "es", ", ".join(str(x) for x in op),
                       " · tareas: %s" % ", ".join(tareas) if tareas else ""),
                )
            )
        elif analisis is None:
            veredictos.append(
                veredicto_proceso(
                    "Agente opencode", "desconocido",
                    "0 escritores y no pude leer el medidor para saber si debería haberlos",
                )
            )
        elif analisis["sin_proceso"] or analisis["por_confirmar"]:
            veredictos.append(
                veredicto_proceso(
                    "Agente opencode", "muerto",
                    "0 escritores, y el medidor da por escribiendo a %s"
                    % ", ".join(analisis["sin_proceso"] + analisis["por_confirmar"]),
                )
            )
        else:
            veredictos.append(
                veredicto_proceso(
                    "Agente opencode", "vivo",
                    "0 escritores (normal): el medidor no da a nadie escribiendo en la Mac",
                )
            )
        if cx:
            veredictos.append(
                veredicto_proceso(
                    "Agente codex", "vivo",
                    "%d escritor%s (PIDs: %s)" % (len(cx), "" if len(cx) == 1 else "es",
                                                 ", ".join(str(x) for x in cx)),
                )
            )
        elif analisis is not None and analisis["hay_codex"]:
            veredictos.append(
                veredicto_proceso(
                    "Agente codex",
                    "muerto" if analisis["codex_escribiendo"] else "vivo",
                    "Sin procesos de codex activos"
                    if analisis["codex_escribiendo"]
                    else "0 escritores de codex (normal): sus filas no escriben ahora",
                )
            )

    elif clave == "disco":
        gb = hechos.get("disco_libre_gb")
        if gb is None:
            veredictos.append(
                veredicto_proceso(
                    "Espacio en disco",
                    "desconocido",
                    "No se pudo medir espacio en disco",
                )
            )
        elif gb >= 5.0:
            veredictos.append(
                veredicto_proceso(
                    "Espacio en disco", "vivo", f"{gb:.2f} GB libres en disco"
                )
            )
        elif gb >= 1.0:
            veredictos.append(
                veredicto_proceso(
                    "Espacio en disco", "colgado", f"Disco bajo: {gb:.2f} GB libres"
                )
            )
        else:
            veredictos.append(
                veredicto_proceso(
                    "Espacio en disco", "muerto", f"Disco crítico: {gb:.2f} GB libres"
                )
            )

    elif clave == "memoria":
        ram = hechos.get("memoria_libre_mb")
        swap = hechos.get("swap_libre_mb")
        if ram is None:
            veredictos.append(
                veredicto_proceso(
                    "Memoria RAM libre", "desconocido", "No se pudo medir la RAM libre"
                )
            )
        elif ram >= 500.0:
            veredictos.append(
                veredicto_proceso(
                    "Memoria RAM libre", "vivo", f"{ram:.2f} MB libres en RAM"
                )
            )
        elif ram >= 100.0:
            veredictos.append(
                veredicto_proceso(
                    "Memoria RAM libre", "colgado", f"RAM baja: {ram:.2f} MB libres"
                )
            )
        else:
            veredictos.append(
                veredicto_proceso(
                    "Memoria RAM libre", "muerto", f"RAM crítica: {ram:.2f} MB libres"
                )
            )

        if swap is None:
            veredictos.append(
                veredicto_proceso(
                    "Memoria Swap libre",
                    "desconocido",
                    "No se pudo medir la memoria swap",
                )
            )
        elif swap >= 200.0:
            veredictos.append(
                veredicto_proceso(
                    "Memoria Swap libre", "vivo", f"{swap:.2f} MB libres en swap"
                )
            )
        elif swap > 0.0:
            veredictos.append(
                veredicto_proceso(
                    "Memoria Swap libre", "colgado", f"Swap bajo: {swap:.2f} MB libres"
                )
            )
        else:
            veredictos.append(
                veredicto_proceso(
                    "Memoria Swap libre", "muerto", "Memoria swap agotada (0 MB libres)"
                )
            )

    elif clave == "proveedores":
        act = hechos.get("proveedores_activos")
        pok = hechos.get("pasarelas_ok")
        if act is None:
            veredictos.append(
                veredicto_proceso(
                    "Proveedores activos",
                    "desconocido",
                    "Sin datos del informe de proveedores",
                )
            )
        elif act > 0:
            veredictos.append(
                veredicto_proceso(
                    "Proveedores activos", "vivo", f"{act} proveedores activos"
                )
            )
        else:
            veredictos.append(
                veredicto_proceso(
                    "Proveedores activos", "muerto", "0 proveedores activos"
                )
            )

        if pok is None:
            veredictos.append(
                veredicto_proceso(
                    "Pasarelas disponibilidad",
                    "desconocido",
                    "Informe de pasarelas no disponible",
                )
            )
        elif pok is True:
            veredictos.append(
                veredicto_proceso(
                    "Pasarelas disponibilidad", "vivo", "Pasarelas disponibles"
                )
            )
        else:
            veredictos.append(
                veredicto_proceso(
                    "Pasarelas disponibilidad", "muerto", "Sin pasarelas disponibles"
                )
            )

    elif clave == "sin-publicar":
        pending = hechos.get("sin_publicar")
        if pending is None:
            veredictos.append(
                veredicto_proceso(
                    "Commits por publicar",
                    "desconocido",
                    "Error al consultar git log origin/main..HEAD",
                )
            )
        elif pending == 0:
            veredictos.append(
                veredicto_proceso(
                    "Commits por publicar", "vivo", "0 commits pendientes (rama al día)"
                )
            )
        else:
            veredictos.append(
                veredicto_proceso(
                    "Commits por publicar",
                    "colgado",
                    f"{pending} commit(s) pendientes por publicar",
                )
            )

    if clave in MEDIDORES_COTEJADOS and "detalle" in hechos:
        # «agentes» y «listas/bloqueadas» conservan sus veredictos de procesos, y además se
        # cotejan: un proceso vivo no dice nada de si el NÚMERO de la pantalla es verdad.
        veredictos.extend(cotejar(clave, hechos.get("detalle"), hechos))

    if not veredictos:
        veredictos.append(
            veredicto_proceso(clave, "desconocido", f"Medidor «{clave}» no reconocido")
        )

    vivos = sum(1 for v in veredictos if v["estado"] == "vivo")
    muertos = sum(1 for v in veredictos if v["estado"] == "muerto")
    colgados = sum(1 for v in veredictos if v["estado"] == "colgado")
    total = len(veredictos)

    if total == 0:
        resumen = f"Comprobación de «{clave}» terminada sin procesos"
    elif muertos == total:
        resumen = f"Comprobación de «{clave}» terminada: todo muerto ({total})"
    elif colgados > 0:
        resumen = (
            f"Comprobación de «{clave}» terminada: {colgados} colgado(s), "
            + (f"{muertos} muerto(s), " if muertos else "")
            + f"{vivos} vivo(s)"
        )
    elif vivos == total:
        resumen = f"Comprobación de «{clave}» terminada: todos vivos"
    else:
        resumen = f"Comprobación de «{clave}» terminada: {vivos}/{total} vivos, {muertos} muerto(s)"

    return veredictos, resumen


def main() -> int:
    """Ejecuta la comprobación del medidor de argv[1] y persiste el JSON."""
    if len(sys.argv) < 2:
        print("Uso: comprobar_medidor.py <medidor>", file=sys.stderr)
        return 2

    medidor = sys.argv[1].replace("_", "-")
    empezado = datetime.now(timezone.utc).isoformat()

    try:
        hechos = medir_hechos(medidor)
    except Exception as err:
        hechos = {}

    procesos = hechos.get("procesos", {})
    veredictos, resumen = veredictos_de(medidor, procesos, hechos)
    terminado = datetime.now(timezone.utc).isoformat()

    comprobacion: Dict[str, Any] = {
        "id": f"comp-{medidor}-{int(datetime.now(timezone.utc).timestamp() * 1000)}",
        "medidor": medidor,
        "empezado": empezado,
        "terminado": terminado,
        "directores": [v["proceso"] for v in veredictos],
        "veredictos": veredictos,
        "resumen": resumen,
    }

    RUTA_COMPROBACIONES.mkdir(parents=True, exist_ok=True)

    # Escribir en ambas rutas (comprobacion-<medidor>.json y <medidor>.json) para compatibilidad total
    f_comp = RUTA_COMPROBACIONES / f"comprobacion-{medidor}.json"
    f_simple = RUTA_COMPROBACIONES / f"{medidor}.json"

    contenido = json.dumps(comprobacion, ensure_ascii=False, indent=2) + "\n"
    f_comp.write_text(contenido, encoding="utf-8")
    f_simple.write_text(contenido, encoding="utf-8")

    print(json.dumps(comprobacion, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
