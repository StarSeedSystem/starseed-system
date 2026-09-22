"""Enrutado opcional del enjambre mediante Jev para selección de modelos.

Este módulo proporciona funciones para:
1. Crear una ficha resumida de la tarea que Jev puede entender
2. Elegir un medio entre candidatos usando Jev cuando hay múltiples opciones
3. Generar motivos legibles para el canal de comunicaciones
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any, Tuple, Protocol


class JevProtocol(Protocol):
    """Protocolo que define el método elegir que Jev debe implementar."""

    def elegir(
        self,
        estado: Mapping[str, Any],
        pregunta: str,
        opciones: Mapping[str, str],
        nombre: str,
    ) -> Tuple[str, dict, float] | None:
        """Devuelve (opción_elegida, probabilidades, confianza) o None."""
        ...


def ficha_de_tarea(tarea: Mapping[str, object]) -> str:
    """Resume la tarea en lo que importa para elegir modelo (función pura)."""
    if not isinstance(tarea, Mapping):
        return "Tarea sin datos."

    tid = str(tarea.get("id") or "").strip()
    titulo_raw = tarea.get("titulo") or tarea.get("title") or "Sin título"
    titulo = str(titulo_raw).strip()

    archivos_raw = tarea.get("archivos") or tarea.get("files") or ()
    if isinstance(archivos_raw, str):
        archivos = [archivos_raw]
    elif isinstance(archivos_raw, Sequence):
        archivos = [str(a) for a in archivos_raw if isinstance(a, str)]
    else:
        archivos = []

    exts = set()
    for a in archivos:
        if "." in a:
            exts.add(a.rsplit(".", 1)[-1].lower())

    es_ts = any(e in {"ts", "tsx"} for e in exts)
    es_py = any(e in {"py"} for e in exts)
    lenguajes = []
    if es_ts:
        lenguajes.append("TypeScript")
    if es_py:
        lenguajes.append("Python")
    if lenguajes:
        lenguaje_str = " y ".join(lenguajes)
    elif archivos:
        lenguaje_str = "otro"
    else:
        lenguaje_str = "sin archivos"

    pide_pruebas = bool(tarea.get("pruebas") or tarea.get("tests"))
    if not pide_pruebas:
        textos = (
            [titulo] + archivos + [str(v) for v in tarea.values() if isinstance(v, str)]
        )
        full_txt = " ".join(textos).lower()
        pide_pruebas = any(
            p in full_txt for p in ("prueba", "test", "vitest", "unittest")
        )

    lineas = tarea.get("lineas") or tarea.get("lines")
    lineas_str = f", {lineas} líneas" if isinstance(lineas, int) and lineas > 0 else ""

    if exts:
        ext_str = f" ({', '.join(sorted(exts))})"
    elif archivos:
        ext_str = " (sin extensión)"
    else:
        ext_str = ""

    header = f"{tid} - {titulo}" if tid else titulo
    return f"{header}. Archivos: {len(archivos)}{ext_str}{lineas_str}. Lenguaje: {lenguaje_str}. Pruebas: {'sí' if pide_pruebas else 'no'}."


def elegir_medio(
    tarea: Mapping[str, object],
    candidatos: Sequence[str],
    historial: Mapping[str, object] | None = None,
    jev: Any = None,
) -> Tuple[str, str]:
    """Elige un medio entre los candidatos ordenados por el enrutador determinista.

    Si son 0 o 1 candidato, devuelve lo que haya sin llamar a Jev.
    Si son más de 1, consulta a Jev (top 4 candidatos) con jev.elegir(...).
    Si Jev devuelve None, agota presupuesto o lanza excepción, cae al orden determinista (candidatos[0]).
    """
    if not candidatos:
        return "", "orden determinista"

    if len(candidatos) == 1:
        return candidatos[0], "orden determinista"

    # Obtener módulo o doble de Jev
    mod_jev = jev
    if mod_jev is None:
        try:
            import jev as _j

            mod_jev = _j
        except Exception:
            try:
                from scripts.puente import jev as _j

                mod_jev = _j
            except Exception:
                mod_jev = None

    if mod_jev is None:
        return candidatos[0], "orden determinista"

    top = list(candidatos[:4])
    candidato_map = {}
    opciones = {}
    for i, c in enumerate(top):
        key = f"opcion_{i}"
        nombre = str(c)
        opciones[key] = nombre
        candidato_map[key] = c

    ficha = ficha_de_tarea(tarea)
    pregunta = f"Elegir el mejor modelo para la tarea: {ficha}"
    estado = {
        "tarea": dict(tarea) if isinstance(tarea, Mapping) else {},
        "ficha": ficha,
    }

    try:
        resultado = mod_jev.elegir(
            estado=estado,
            pregunta=pregunta,
            opciones=opciones,
            nombre="medio",
        )
        if (
            resultado
            and isinstance(resultado, (tuple, list))
            and len(resultado) >= 1
            and resultado[0] is not None
        ):
            opcion_elegida = str(resultado[0]).strip()
            elegido = None
            if opcion_elegida in candidato_map:
                elegido = candidato_map[opcion_elegida]
            else:
                for k, v in candidato_map.items():
                    if (
                        opcion_elegida == str(v)
                        or opcion_elegida.lower() == str(v).lower()
                    ):
                        elegido = v
                        break

            if elegido is not None:
                confianza = (
                    float(resultado[2])
                    if len(resultado) >= 3 and isinstance(resultado[2], (int, float))
                    else 0.0
                )
                motivo = f"Jev: {ficha}"
                return elegido, motivo
    except Exception:
        pass

    return candidatos[0], "orden determinista"


def motivo_legible(eleccion: str, motivo: str) -> str:
    """Frase legible para el canal de comunicaciones."""
    if not motivo:
        return eleccion
    return f"{eleccion} ({motivo})"


# Mantener las funciones existentes para compatibilidad si fuera necesario
def texto_de_tarea(tarea: Mapping[str, object]) -> str:
    """Función de legado mantenida para compatibilidad."""
    return ficha_de_tarea(tarea)
