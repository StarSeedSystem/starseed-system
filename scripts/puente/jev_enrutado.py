"""Enrutado opcional del enjambre mediante el CLI oficial de Jev."""

from __future__ import annotations

import json
import subprocess
import sys
from collections.abc import Mapping, Sequence
from pathlib import PurePath
from typing import Protocol


PROVEEDORES_ADMITIDOS = frozenset(
    {
        "aihubmix",
        "anthropic",
        "gemini",
        "llm7",
        "nvidia",
        "openrouter",
        "tokenrouter",
        "xkiro",
    }
)
TIEMPO_LIMITE = 10.0


class ResultadoComando(Protocol):
    returncode: int
    stdout: str


class Ejecutor(Protocol):
    def __call__(
        self,
        comando: Sequence[str],
        *,
        capture_output: bool,
        text: bool,
        timeout: float,
        check: bool,
    ) -> ResultadoComando: ...


def texto_de_tarea(tarea: Mapping[str, object]) -> str:
    """Resume los datos que Jev necesita para clasificar una tarea."""
    titulo_bruto = tarea.get("titulo", tarea.get("title", "Sin título"))
    titulo = titulo_bruto.strip() if isinstance(titulo_bruto, str) else "Sin título"
    archivos_brutos = tarea.get("archivos", tarea.get("files", ()))
    if isinstance(archivos_brutos, str):
        archivos = [archivos_brutos]
    elif isinstance(archivos_brutos, Sequence):
        archivos = [ruta for ruta in archivos_brutos if isinstance(ruta, str)]
    else:
        archivos = []

    extensiones = sorted({PurePath(ruta).suffix.lower() for ruta in archivos if PurePath(ruta).suffix})
    detalle_extensiones = ", ".join(extensiones) if extensiones else "sin extensión"
    textos = [valor for valor in tarea.values() if isinstance(valor, str)] + archivos
    pide_pruebas = bool(tarea.get("pruebas") or tarea.get("tests")) or any(
        palabra in " ".join(textos).casefold() for palabra in ("prueba", "test")
    )
    return (
        f"{titulo}. Archivos: {len(archivos)} ({detalle_extensiones}). "
        f"Pruebas: {'sí' if pide_pruebas else 'no'}."
    )


def _modelo_para_jev(modelo: str) -> str:
    proveedor, separador, nombre = modelo.partition("/")
    if separador and proveedor in PROVEEDORES_ADMITIDOS:
        return f"{proveedor}:{nombre}"
    return modelo


def _modelo_para_enjambre(modelo: str) -> str | None:
    proveedor, separador, nombre = modelo.partition(":")
    proveedor = proveedor.casefold()
    if not separador or not nombre or proveedor not in PROVEEDORES_ADMITIDOS:
        return None
    return f"{proveedor}/{nombre}"


def enrutar(
    tarea: Mapping[str, object], modelo_actual: str, correr: Ejecutor | None = None
) -> tuple[str, str]:
    """Consulta Jev sin convertirlo en una dependencia obligatoria."""
    ejecutar = correr or subprocess.run
    comando = [
        sys.executable,
        "-m",
        "jevkit",
        "route",
        "--prompt",
        texto_de_tarea(tarea),
        "--current",
        _modelo_para_jev(modelo_actual),
    ]
    try:
        resultado = ejecutar(
            comando, capture_output=True, text=True, timeout=TIEMPO_LIMITE, check=False
        )
        if resultado.returncode != 0:
            return modelo_actual, "Jev no estuvo disponible; se conserva el modelo actual."
        datos = json.loads(resultado.stdout)
        if not isinstance(datos, dict) or datos.get("routed") is not True:
            return modelo_actual, "Jev no recomendó cambiar de modelo."
        sugerido = datos.get("model")
        traducido = _modelo_para_enjambre(sugerido) if isinstance(sugerido, str) else None
        if traducido is None:
            return modelo_actual, "Jev propuso un proveedor no admitido."
        motivo = datos.get("reason")
        return traducido, motivo if isinstance(motivo, str) else "Recomendación de Jev."
    except Exception:
        # El enrutado mejora la elección, pero nunca debe detener el enjambre.
        return modelo_actual, "Jev no respondió a tiempo; se conserva el modelo actual."


def disponible() -> bool:
    """Indica si el CLI está instalado y reconoce su clave."""
    try:
        resultado = subprocess.run(
            [sys.executable, "-m", "jevkit", "doctor"],
            capture_output=True,
            text=True,
            timeout=TIEMPO_LIMITE,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return False
    return resultado.returncode == 0 and "key present" in resultado.stdout.casefold()
