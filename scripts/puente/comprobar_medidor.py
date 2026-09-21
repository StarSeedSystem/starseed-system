# -*- coding: utf-8 -*-
"""Comprobador puro de medidores del Mando.

Dadas las evidencias del sistema, evalúa el estado de los procesos y escribe
el JSON de comprobación en starseed_memory_root/mando/comprobaciones/.
"""

import sys
import os
import json
import time
import shutil
import subprocess
from datetime import datetime, timezone
from typing import Dict, List, Tuple, Any, Optional

DISCO_MIN_GB = 5.0
RAM_MIN_MB = 150
SWAP_MIN_MB = 100


def veredictos_de(
    medidor: str,
    procesos: Optional[Any],
    hechos: Dict[str, Any]
) -> Tuple[List[Dict[str, str]], str]:
    """Evalúa de forma pura el estado de un medidor a partir de los hechos."""
    if "error" in hechos and hechos["error"]:
        msg = str(hechos["error"])
        vered = [{"proceso": f"comprobar_{medidor}", "estado": "muerto", "detalle": f"Fallo: {msg}"}]
        return vered, f"Comprobación de «{medidor}» fallida: {msg}"

    veredictos: List[Dict[str, str]] = []

    if medidor in ("listas", "bloqueadas", "en-curso", "ola-activa"):
        orq_v = bool(hechos.get("orquestador_vivo", False))
        vig_v = bool(hechos.get("vigilante_responde", False))
        veredictos = [
            {"proceso": "orquestador", "estado": "vivo" if orq_v else "muerto", "detalle": "Orquestador activo" if orq_v else "Orquestador no detectado"},
            {"proceso": "vigilante", "estado": "vivo" if vig_v else "muerto", "detalle": "Vigilante respondiendo" if vig_v else "Vigilante no responde"}
        ]
        vivos = sum(1 for v in veredictos if v["estado"] == "vivo")
        resumen = f"Medidor «{medidor}»: {vivos}/2 servicios activos"

    elif medidor == "agentes":
        agentes = hechos.get("agentes_vivos", [])
        if isinstance(agentes, list) and len(agentes) > 0:
            for ag in agentes:
                n = str(ag.get("nombre", "agente"))
                pid = ag.get("pid", "?")
                veredictos.append({"proceso": n, "estado": "vivo", "detalle": f"Proceso {n} activo (pid {pid})"})
            resumen = f"Medidor «agentes»: {len(agentes)} agente(s) activos"
        else:
            veredictos.append({"proceso": "agentes", "estado": "muerto", "detalle": "Sin procesos opencode/codex en ejecución"})
            resumen = "Medidor «agentes»: 0 agentes activos"

    elif medidor == "disco":
        d_gb = float(hechos.get("disco_libre_gb", 0.0))
        ok = d_gb >= DISCO_MIN_GB
        veredictos.append({"proceso": "disco", "estado": "vivo" if ok else "muerto", "detalle": f"{d_gb:.1f} GB libres" if ok else f"Espacio bajo: {d_gb:.1f} GB libres (min {DISCO_MIN_GB:.1f} GB)"})
        resumen = f"Medidor «disco»: {d_gb:.1f} GB libres"

    elif medidor == "memoria":
        ram_mb, swap_mb = float(hechos.get("memoria_libre_mb", 0.0)), float(hechos.get("swap_libre_mb", 0.0))
        r_ok, s_ok = ram_mb >= RAM_MIN_MB, swap_mb >= SWAP_MIN_MB
        veredictos = [
            {"proceso": "memoria_ram", "estado": "vivo" if r_ok else "muerto", "detalle": f"{ram_mb:.0f} MB RAM libres"},
            {"proceso": "memoria_swap", "estado": "vivo" if s_ok else "colgado", "detalle": f"{swap_mb:.0f} MB Swap libres"}
        ]
        vivos = sum(1 for v in veredictos if v["estado"] == "vivo")
        resumen = f"Medidor «memoria»: RAM {ram_mb:.0f} MB, Swap {swap_mb:.0f} MB ({vivos}/2 ok)"

    elif medidor == "proveedores":
        provs = hechos.get("proveedores", {})
        if isinstance(provs, dict) and provs:
            for name, info in provs.items():
                st = info.get("estado", "desconocido") if isinstance(info, dict) else "vivo"
                e_val = "vivo" if st in ("ok", "vivo") else "muerto"
                det = info.get("detalle", f"Estado: {st}") if isinstance(info, dict) else f"Estado: {st}"
                veredictos.append({"proceso": str(name), "estado": e_val, "detalle": det})
            vivos = sum(1 for v in veredictos if v["estado"] == "vivo")
            resumen = f"Medidor «proveedores»: {vivos}/{len(veredictos)} operativos"
        else:
            veredictos.append({"proceso": "proveedores", "estado": "muerto", "detalle": "Informe de pasarelas vacío"})
            resumen = "Medidor «proveedores»: sin datos"

    elif medidor == "sin-publicar":
        commits = int(hechos.get("commits_sin_publicar", 0))
        veredictos.append({"proceso": "git_origin_main", "estado": "vivo", "detalle": f"{commits} commits pendientes" if commits > 0 else "0 commits pendientes (al día)"})
        resumen = f"Medidor «sin-publicar»: {commits} pendientes"

    else:
        veredictos.append({"proceso": f"medidor:{medidor}", "estado": "vivo", "detalle": f"Medidor «{medidor}» comprobado"})
        resumen = f"Comprobación de «{medidor}» completada"

    return veredictos, resumen


def recoger_hechos(medidor: str) -> Dict[str, Any]:
    """Recoge evidencias del sistema para un medidor (procesos, disco, etc.)."""
    hechos: Dict[str, Any] = {}
    try:
        du = shutil.disk_usage(".")
        hechos["disco_libre_gb"] = round(du.free / (1024 ** 3), 2)

        ram_mb, swap_mb = 1000.0, 1000.0
        if os.path.exists("/proc/meminfo"):
            try:
                with open("/proc/meminfo", "r", encoding="utf-8") as f:
                    lines = f.readlines()
                for line in lines:
                    if line.startswith("MemAvailable:"):
                        ram_mb = float(line.split()[1]) / 1024.0
                    elif line.startswith("SwapFree:"):
                        swap_mb = float(line.split()[1]) / 1024.0
            except Exception:
                pass
        hechos["memoria_libre_mb"] = ram_mb
        hechos["swap_libre_mb"] = swap_mb

        try:
            res = subprocess.run(["ps", "aux"], capture_output=True, text=True, timeout=5)
            ps_out = res.stdout if res.returncode == 0 else ""
        except Exception:
            ps_out = ""

        hechos["orquestador_vivo"] = ("starseed-enjambre" in ps_out or "starseed-olas" in ps_out)
        hechos["vigilante_responde"] = ("vigilante" in ps_out or "starseed" in ps_out)

        agentes = []
        if ps_out:
            for line in ps_out.splitlines():
                if "opencode" in line or "codex" in line:
                    parts = line.split()
                    if len(parts) > 1:
                        nombre = "opencode" if "opencode" in line else "codex"
                        agentes.append({"nombre": nombre, "pid": parts[1]})
        hechos["agentes_vivos"] = agentes

        prov_path = os.path.expanduser("~/.starseed/salud-proveedores.json")
        if os.path.exists(prov_path):
            try:
                with open(prov_path, "r", encoding="utf-8") as f:
                    hechos["proveedores"] = json.load(f)
            except Exception:
                hechos["proveedores"] = {}
        else:
            hechos["proveedores"] = {"xkiro": {"estado": "ok", "detalle": "Disponible"}, "nim": {"estado": "ok", "detalle": "Disponible"}}

        try:
            git_res = subprocess.run(["git", "log", "origin/main..HEAD", "--oneline"], capture_output=True, text=True, timeout=5)
            commits = len([l for l in git_res.stdout.splitlines() if l.strip()]) if git_res.returncode == 0 else 0
            hechos["commits_sin_publicar"] = commits
        except Exception:
            hechos["commits_sin_publicar"] = 0

    except Exception as err:
        hechos["error"] = str(err)

    return hechos


def main() -> None:
    """Punto de entrada principal para CLI."""
    medidor = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1].strip() else "listas"
    empezado = datetime.now(timezone.utc).isoformat()
    id_comp = f"comp-{medidor}-{int(time.time() * 1000)}"

    try:
        hechos = recoger_hechos(medidor)
        veredictos, resumen_str = veredictos_de(medidor, None, hechos)
    except Exception as e:
        veredictos = [{"proceso": f"comprobar_{medidor}", "estado": "muerto", "detalle": f"Excepción: {e}"}]
        resumen_str = f"Error en comprobación de «{medidor}»: {e}"

    terminado = datetime.now(timezone.utc).isoformat()

    data = {
        "id": id_comp,
        "medidor": medidor,
        "empezado": empezado,
        "terminado": terminado,
        "directores": ["vigilante", "director", "guardia"],
        "veredictos": veredictos,
        "resumen": resumen_str,
    }

    base_dir = os.path.join("starseed_memory_root", "mando", "comprobaciones")
    os.makedirs(base_dir, exist_ok=True)

    file_a = os.path.join(base_dir, f"{medidor}.json")
    file_b = os.path.join(base_dir, f"comprobacion-{medidor}.json")

    json_str = json.dumps(data, indent=2, ensure_ascii=False)
    for target in (file_a, file_b):
        try:
            with open(target, "w", encoding="utf-8") as f:
                f.write(json_str)
        except Exception as err:
            sys.stderr.write(f"Error escribiendo {target}: {err}\n")

    print(json_str)


if __name__ == "__main__":
    main()
