"""Puerta de arreglos (PUE1127A): un «arreglo de compilación» automático no puede borrar
código, comandos ni pruebas para compilar. Módulo PURO: recibe texto, no toca git ni disco.

Caso real (AB6CDD5AA, 27-11): «arregló» Android quitando 9 comandos del registro nativo y
332 líneas de pruebas Rust; la revisión lo dio por bueno.
"""
import re
from collections import Counter

PREFIJO_TITULO = "urgente · arreglar la compilación"
PREFIJO_OLA = "a-desbloqueo"
MARCAS_PRUEBA = re.compile(
    r"#\[cfg\(test\)\]|\bmod\s+(pruebas|tests)\b|#\[test\]|^\s*(?:async\s+)?def\s+test_|\b(?:it|describe)\("
)
ENTRADA_REGISTRO = re.compile(r"^\s*[A-Za-z_][\w]*(?:::[\w]+)+\s*,?\s*$")
ENTRADA_COMANDO = re.compile(r'^\s*"[\w:]+"\s*,?\s*$')
RUTA_LIB = "native/src-tauri/src/lib.rs"
RUTA_BUILD = "native/src-tauri/build.rs"
RUTA_CAPS = "native/src-tauri/capabilities/"


def es_arreglo_de_compilacion(tarea):
    titulo = str(tarea.get("titulo", "")).strip().lower()
    ola = str(tarea.get("ola", "")).strip().lower()
    return titulo.startswith(PREFIJO_TITULO) or ola.startswith(PREFIJO_OLA)


def _parsear(diff_texto):
    """Devuelve (borradas, añadidas, archivos_borrados): líneas por archivo."""
    borradas, anadidas, eliminados = {}, {}, []
    actual = None
    for linea in diff_texto.splitlines():
        if linea.startswith("diff --git "):
            actual = linea.rsplit(" b/", 1)[-1]
            borradas.setdefault(actual, [])
            anadidas.setdefault(actual, [])
        elif linea.startswith("deleted file mode") and actual:
            eliminados.append(actual)
        elif actual is None or linea.startswith(("--- ", "+++ ")):
            continue
        elif linea.startswith("-"):
            borradas[actual].append(linea[1:])
        elif linea.startswith("+"):
            anadidas[actual].append(linea[1:])
    return borradas, anadidas, eliminados


def _netas(borradas, anadidas, patron):
    """Líneas que casan con `patron` y se quitaron sin volver a añadirse (mover no cuenta)."""
    quitadas = Counter(b.strip() for b in borradas if patron.search(b))
    quitadas.subtract(Counter(a.strip() for a in anadidas if patron.search(a)))
    return sum(n for n in quitadas.values() if n > 0)


def veredicto(diff_texto):
    borradas, anadidas, eliminados = _parsear(diff_texto or "")
    motivos = []
    for ruta in eliminados:
        motivos.append("borra el archivo entero %s" % ruta)
    for ruta in borradas:
        n = _netas(borradas[ruta], anadidas[ruta], MARCAS_PRUEBA)
        if n:
            motivos.append("borra %d marca(s) de pruebas en %s" % (n, ruta))
        patron = None
        if ruta == RUTA_LIB:
            patron = ENTRADA_REGISTRO
        elif ruta == RUTA_BUILD:
            patron = ENTRADA_COMANDO
        elif ruta.startswith(RUTA_CAPS) and ruta.endswith(".json"):
            patron = re.compile(r'"allow-')
        if patron:
            n = _netas(borradas[ruta], anadidas[ruta], patron)
            if n:
                motivos.append("quita %d comando(s)/permiso(s) registrados en %s" % (n, ruta))
    quitadas = sum(len(v) for v in borradas.values())
    puestas = sum(len(v) for v in anadidas.values())
    if quitadas > 40 and puestas * 4 < quitadas:
        motivos.append("borra %d líneas y añade solo %d" % (quitadas, puestas))
    return {"ok": not motivos, "motivos": motivos}
