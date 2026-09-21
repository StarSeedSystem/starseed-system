#!/usr/bin/env python3
"""Comprueba un medidor del Mando usando únicamente hechos observados."""

from __future__ import annotations

import json
import re
import shlex
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


RUTA_COMPROBACIONES = Path("starseed_memory_root/mando/comprobaciones")
GUIONES_VIGILADOS = (
    "scripts/enjambre/starseed-enjambre.py",
    "scripts/puente/vigilante-enjambre.py",
    "scripts/puente/director-acciones.py",
    "scripts/puente/director-nube.py",
    "scripts/puente/director_aprendizaje.py",
    "scripts/puente/director_dream.py",
)


def _veredicto(
    identificador: str, nombre: str, valor: object, esta_vivo: bool, motivo: str
) -> dict[str, object]:
    if valor is None:
        return {
            "id": identificador,
            "nombre": nombre,
            "estado": "desconocido",
            "motivo": f"No se pudo medir {nombre.lower()}.",
        }
    return {
        "id": identificador,
        "nombre": nombre,
        "estado": "vivo" if esta_vivo else "muerto",
        "motivo": motivo,
    }


def veredictos_de(
    medidor: str, hechos: dict[str, object]
) -> tuple[list[dict[str, object]], dict[str, int]]:
    """Convierte hechos ya medidos en veredictos y su resumen."""
    clave = medidor.replace("_", "-")
    veredictos: list[dict[str, object]] = []
    if clave == "memoria":
        libre = hechos.get("memoria_libre_mb")
        swap = hechos.get("swap_libre_mb")
        veredictos.append(
            _veredicto(
                "memoria-libre", "Memoria libre", libre, _numero(libre) >= 150,
                f"{libre} MB libres.",
            )
        )
        veredictos.append(
            _veredicto(
                "swap-libre", "Swap libre", swap, _numero(swap) >= 0,
                f"{swap} MB libres.",
            )
        )
    elif clave == "disco":
        libre = hechos.get("disco_libre_gb")
        veredictos.append(
            _veredicto(
                "disco-libre", "Disco libre", libre, _numero(libre) > 0,
                f"{libre} GB libres.",
            )
        )
    elif clave == "procesos":
        procesos = hechos.get("procesos")
        if not isinstance(procesos, dict):
            procesos = {guion: None for guion in GUIONES_VIGILADOS}
        for guion, pids in procesos.items():
            presente = isinstance(pids, list) and bool(pids)
            motivo = (
                f"PID observados: {pids}."
                if presente
                else "No aparece la ruta del guion en ps."
            )
            veredictos.append(
                _veredicto(str(guion), Path(str(guion)).name, pids, presente, motivo)
            )
    elif clave == "proveedores":
        activos = hechos.get("proveedores_activos")
        pasarelas = hechos.get("pasarelas_ok")
        veredictos.append(
            _veredicto(
                "proveedores-activos", "Proveedores activos", activos,
                _numero(activos) > 0, f"{activos} proveedores activos.",
            )
        )
        motivo = (
            "El informe confirma pasarelas disponibles."
            if pasarelas is True
            else "El informe no confirma pasarelas disponibles."
        )
        veredictos.append(
            _veredicto(
                "pasarelas-ok", "Pasarelas", pasarelas,
                pasarelas is True, motivo,
            )
        )
    elif clave == "sin-publicar":
        cantidad = hechos.get("sin_publicar")
        motivo = (
            "No hay commits pendientes."
            if cantidad == 0
            else f"Hay {cantidad} commits pendientes."
        )
        veredictos.append(
            _veredicto(
                "sin-publicar", "Commits sin publicar", cantidad,
                _numero(cantidad) == 0, motivo,
            )
        )
    else:
        veredictos.append(_veredicto(clave, medidor, None, False, ""))

    resumen = {
        plural: sum(v["estado"] == singular for v in veredictos)
        for plural, singular in (
            ("vivos", "vivo"),
            ("muertos", "muerto"),
            ("desconocidos", "desconocido"),
        )
    }
    resumen["total"] = len(veredictos)
    return veredictos, resumen


def _numero(valor: object) -> float:
    if isinstance(valor, (int, float)) and not isinstance(valor, bool):
        return float(valor)
    return float("-inf")


def _salida(comando: list[str]) -> str | None:
    try:
        resultado = subprocess.run(
            comando, check=True, capture_output=True, text=True, timeout=15
        )
    except (FileNotFoundError, subprocess.SubprocessError, OSError):
        return None
    return resultado.stdout


def _memoria_libre_mb() -> float | None:
    salida = _salida(["vm_stat"])
    if salida is not None:
        pagina = re.search(r"page size of (\d+) bytes", salida)
        libres = re.search(r"Pages free:\s+(\d+)", salida)
        if pagina and libres:
            return round(int(pagina.group(1)) * int(libres.group(1)) / 1024**2, 2)
    try:
        contenido = Path("/proc/meminfo").read_text(encoding="utf-8")
    except OSError:
        return None
    disponible = re.search(r"^MemAvailable:\s+(\d+) kB", contenido, re.MULTILINE)
    return round(int(disponible.group(1)) / 1024, 2) if disponible else None


def _a_mb(cantidad: str, unidad: str) -> float:
    factores = {"K": 1 / 1024, "M": 1, "G": 1024, "T": 1024**2}
    return round(float(cantidad) * factores[unidad.upper()], 2)


def _swap_libre_mb() -> float | None:
    salida = _salida(["sysctl", "vm.swapusage"])
    if salida is not None:
        libre = re.search(r"free\s*=\s*([\d.]+)([KMGT])", salida, re.IGNORECASE)
        if libre:
            return _a_mb(libre.group(1), libre.group(2))
    try:
        contenido = Path("/proc/meminfo").read_text(encoding="utf-8")
    except OSError:
        return None
    libre = re.search(r"^SwapFree:\s+(\d+) kB", contenido, re.MULTILINE)
    return round(int(libre.group(1)) / 1024, 2) if libre else None


def _procesos() -> dict[str, list[int]] | None:
    salida = _salida(["ps", "-axo", "pid=,args="])
    if salida is None:
        return None
    objetivos = {
        guion: {guion, str((Path.cwd() / guion).resolve())}
        for guion in GUIONES_VIGILADOS
    }
    encontrados = {guion: [] for guion in GUIONES_VIGILADOS}
    for linea in salida.splitlines():
        partes = linea.strip().split(maxsplit=1)
        if len(partes) != 2 or not partes[0].isdigit():
            continue
        try:
            argumentos = set(shlex.split(partes[1]))
        except ValueError:
            continue
        for guion, rutas in objetivos.items():
            if argumentos & rutas:
                encontrados[guion].append(int(partes[0]))
    return encontrados


def _activo(registro: object) -> bool | None:
    if isinstance(registro, bool):
        return registro
    if not isinstance(registro, dict):
        return None
    for clave in ("activo", "disponible", "ok", "vivo"):
        valor = registro.get(clave)
        if isinstance(valor, bool):
            return valor
    estado = registro.get("estado")
    if isinstance(estado, str):
        normalizado = estado.lower()
        if normalizado in {"activo", "disponible", "ok", "vivo", "usable"}:
            return True
        if normalizado in {"inactivo", "caido", "caído", "error", "muerto"}:
            return False
    return None


def _registros(valor: object) -> list[object] | None:
    if isinstance(valor, list):
        return valor
    if isinstance(valor, dict):
        return list(valor.values())
    return None


def _informe_proveedores() -> tuple[int | None, bool | None]:
    ruta = Path.home() / ".starseed" / "pasarelas-informe.json"
    try:
        datos = json.loads(ruta.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None, None
    if not isinstance(datos, dict):
        return None, None

    activos: int | None = None
    valor_activos = datos.get("proveedores_activos")
    if isinstance(valor_activos, int) and not isinstance(valor_activos, bool):
        activos = valor_activos
    else:
        proveedores = _registros(datos.get("proveedores"))
        estados = (
            [_activo(item) for item in proveedores]
            if proveedores is not None
            else []
        )
        conocidos = [estado for estado in estados if estado is not None]
        if conocidos:
            activos = sum(estado is True for estado in conocidos)

    pasarelas_ok = datos.get("pasarelas_ok")
    if not isinstance(pasarelas_ok, bool):
        pasarelas = _registros(datos.get("pasarelas"))
        estados = (
            [_activo(item) for item in pasarelas]
            if pasarelas is not None
            else []
        )
        conocidos = [estado for estado in estados if estado is not None]
        pasarelas_ok = any(conocidos) if conocidos else None
    return activos, pasarelas_ok


def medir_hechos(medidor: str) -> dict[str, object]:
    """Mide los hechos del medidor solicitado sin sustituir fallos por cifras."""
    clave = medidor.replace("_", "-")
    if clave == "memoria":
        return {
            "memoria_libre_mb": _memoria_libre_mb(),
            "swap_libre_mb": _swap_libre_mb(),
        }
    if clave == "disco":
        try:
            libre = round(shutil.disk_usage(".").free / 1024**3, 2)
        except OSError:
            libre = None
        return {"disco_libre_gb": libre}
    if clave == "procesos":
        return {"procesos": _procesos()}
    if clave == "proveedores":
        activos, pasarelas = _informe_proveedores()
        return {"proveedores_activos": activos, "pasarelas_ok": pasarelas}
    if clave == "sin-publicar":
        salida = _salida(["git", "log", "--oneline", "origin/main..HEAD"])
        return {"sin_publicar": None if salida is None else len(salida.splitlines())}
    return {}


def crear_comprobacion(medidor: str, hechos: dict[str, object]) -> dict[str, object]:
    """Crea el documento persistido por el Mando."""
    empezado = datetime.now(timezone.utc).isoformat()
    veredictos, resumen = veredictos_de(medidor, hechos)
    terminado = datetime.now(timezone.utc).isoformat()
    return {
        "id": f"{medidor}-{empezado}",
        "medidor": medidor,
        "empezado": empezado,
        "terminado": terminado,
        "directores": [veredicto["id"] for veredicto in veredictos],
        "veredictos": veredictos,
        "resumen": resumen,
    }


def main() -> int:
    """Mide el medidor de argv y persiste el resultado, incluso incompleto."""
    if len(sys.argv) != 2:
        print("Uso: comprobar_medidor.py <medidor>", file=sys.stderr)
        return 2
    medidor = sys.argv[1].replace("_", "-")
    permitidos = {"memoria", "disco", "procesos", "proveedores", "sin-publicar"}
    if medidor not in permitidos:
        print(f"Medidor desconocido: {medidor}", file=sys.stderr)
        return 2

    empezado = datetime.now(timezone.utc).isoformat()
    try:
        hechos = medir_hechos(medidor)
    # El archivo debe cerrarse aunque una sonda inesperada se rompa.
    except Exception:
        hechos = {}
    comprobacion = crear_comprobacion(medidor, hechos)
    comprobacion["empezado"] = empezado
    comprobacion["terminado"] = datetime.now(timezone.utc).isoformat()

    RUTA_COMPROBACIONES.mkdir(parents=True, exist_ok=True)
    destino = RUTA_COMPROBACIONES / f"{medidor}.json"
    destino.write_text(
        json.dumps(comprobacion, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(comprobacion, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
