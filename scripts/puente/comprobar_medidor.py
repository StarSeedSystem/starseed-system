#!/usr/bin/env python3
"""Comprueba un medidor del Mando midiendo el sistema real sin datos inventados."""

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


def medir_procesos() -> Dict[str, List[int]]:
    """Escanea ps para buscar orquestador, vigilante, opencode y codex."""
    pids: Dict[str, List[int]] = {
        "orquestador": [],
        "vigilante": [],
        "opencode": [],
        "codex": [],
    }
    salida = _salida(["ps", "-axo", "pid=,args="])
    if not salida:
        return pids

    for linea in salida.splitlines():
        partes = linea.strip().split(maxsplit=1)
        if len(partes) != 2 or not partes[0].isdigit():
            continue
        pid = int(partes[0])
        cmd = partes[1].lower()

        # Evitar falsos positivos como grep, vim, cat, etc.
        if any(
            ign in cmd for ign in ["grep", "vim", "nano", "cat", "comprobar_medidor"]
        ):
            continue

        if "starseed-enjambre.py" in cmd or "starseed_enjambre" in cmd:
            pids["orquestador"].append(pid)
        if "vigilante-enjambre.py" in cmd or "vigilante_enjambre" in cmd:
            pids["vigilante"].append(pid)
        if "opencode" in cmd and not cmd.startswith("python"):
            pids["opencode"].append(pid)
        if "codex" in cmd and not cmd.startswith("python"):
            pids["codex"].append(pid)

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
        if clave == "tokens":
            try:
                ruta = Path("starseed_memory_root/mando/tokens-por-segundo.json")
                hechos["tokens_edad_s"] = int(datetime.now().timestamp() - ruta.stat().st_mtime)
            except OSError:
                hechos["tokens_edad_s"] = None
        if clave == "integradas":
            hechos["integradas_main"] = contar_integradas()
        try:
            sys.path.insert(0, str(Path(__file__).parent))
            import vigia_medidores as _v
            hechos["vigia"] = _v.diagnosticar(_v.leer_medidores())
        except Exception:
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
    if clave == "agentes":
        return _numero(r"(\d+) en total", resumen)
    if clave == "en-curso":
        return _numero(r"(\d+) agente", resumen)
    if clave == "ola-activa":
        filas = [f for f in detalle.get("filas") or [] if str(f.get("id") or "").startswith("ola:")]
        return sum(_numero(r"(\d+) agente", str(f.get("quien") or "")) or 0 for f in filas)
    return None


def cotejar(clave: str, detalle: Optional[Dict[str, Any]], hechos: Dict[str, Any]) -> List[Dict[str, str]]:
    """PURA: lo que dice el medidor frente a lo que se acaba de medir por otro camino."""
    if detalle is None:
        return [veredicto_proceso("Medidor", "muerto", "la API del Mando no contestó")]
    fuera = [veredicto_proceso("Medidor", "vivo", "contesta: %s" % str(detalle.get("resumen") or "")[:160])]
    if clave in ("agentes", "en-curso", "ola-activa"):
        dice = agentes_que_dice(clave, detalle)
        mac = len((hechos.get("procesos") or {}).get("opencode", []))
        nube = hechos.get("agentes_nube")
        if nube is None:
            fuera.append(veredicto_proceso("Agentes medidos", "desconocido",
                                           "no pude volver a preguntar a GitHub por la nube"))
        else:
            medidos = mac + nube
            estado = "vivo" if dice == medidos else "colgado"
            fuera.append(veredicto_proceso(
                "Agentes medidos", estado,
                "el medidor dice %s; medido ahora: %d en la Mac + %d en la nube = %d%s"
                % (dice if dice is not None else "—", mac, nube, medidos,
                   "" if estado == "vivo" else " · NO COINCIDEN")))
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
        if op:
            veredictos.append(
                veredicto_proceso(
                    "Agente opencode", "vivo", f"Ejecutándose (PIDs: {op})"
                )
            )
        else:
            veredictos.append(
                veredicto_proceso(
                    "Agente opencode", "muerto", "Sin procesos de opencode activos"
                )
            )
        if cx:
            veredictos.append(
                veredicto_proceso("Agente codex", "vivo", f"Ejecutándose (PIDs: {cx})")
            )
        else:
            veredictos.append(
                veredicto_proceso(
                    "Agente codex", "muerto", "Sin procesos de codex activos"
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
        resumen = f"Comprobación de «{clave}» terminada: {colgados} colgado(s), {vivos} vivo(s)"
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
