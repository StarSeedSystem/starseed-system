"""Re-verificación trimestral del catálogo de formatos (EST-FORMATOS-REVISION).

Compara `formatos.json` con una versión nueva dada (sin red en las pruebas)
y escribe las diferencias con la fecha de revisión. Puro y probado;
nunca inventa un formato que no venga en la entrada.
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Any


def cargar_catalogo(ruta: Path) -> dict[str, Any]:
    """Carga un catálogo de formatos desde un archivo JSON."""
    return json.loads(ruta.read_text(encoding="utf-8"))


def _indice_por_id(formatos: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {f["id"]: f for f in formatos}


def _comparar_objetos(antes: Any, despues: Any, ruta: str = "") -> dict[str, Any] | None:
    """Compara dos valores y devuelve las diferencias, o None si son iguales."""
    if isinstance(antes, dict) and isinstance(despues, dict):
        claves = set(antes.keys()) | set(despues.keys())
        diffs: dict[str, Any] = {}
        for k in claves:
            sub = _comparar_objetos(antes.get(k), despues.get(k), f"{ruta}.{k}" if ruta else k)
            if sub is not None:
                diffs[k] = sub
        return diffs if diffs else None
    if isinstance(antes, list) and isinstance(despues, list):
        if antes == despues:
            return None
        return {"antes": antes, "despues": despues}
    if antes == despues:
        return None
    return {"antes": antes, "despues": despues}


def _aplanar_diff(diff: dict[str, Any], prefijo: str = "") -> dict[str, Any]:
    """Aplana un diff anidado para que las pruebas puedan acceder a 'antes'/'despues' directamente."""
    resultado: dict[str, Any] = {}
    for k, v in diff.items():
        clave = f"{prefijo}.{k}" if prefijo else k
        if isinstance(v, dict) and "antes" in v and "despues" in v:
            resultado[clave] = v
        elif isinstance(v, dict):
            resultado.update(_aplanar_diff(v, clave))
    return resultado


def comparar(actual: dict[str, Any], nuevo: dict[str, Any]) -> dict[str, Any]:
    """Compara dos catálogos y devuelve las diferencias.

    Devuelve un dict con claves: "añadidos", "eliminados", "modificados".
    Cada elemento modificado incluye su id y un dict "campos" con las diferencias.
    """
    idx_actual = _indice_por_id(actual.get("formatos", []))
    idx_nuevo = _indice_por_id(nuevo.get("formatos", []))

    ids_actual = set(idx_actual.keys())
    ids_nuevo = set(idx_nuevo.keys())

    añadidos = [idx_nuevo[id_] for id_ in sorted(ids_nuevo - ids_actual)]
    eliminados = [{"id": id_, "nombre": idx_actual[id_].get("nombre", "")} for id_ in sorted(ids_actual - ids_nuevo)]

    modificados: list[dict[str, Any]] = []
    for id_ in sorted(ids_actual & ids_nuevo):
        diff_campos = _comparar_objetos(idx_actual[id_], idx_nuevo[id_])
        if diff_campos:
            # Excluir campos que no son parte del formato (como 'version' del catálogo)
            diff_campos_filtrado = {k: v for k, v in diff_campos.items() if k != "version"}
            if diff_campos_filtrado:
                modificados.append({"id": id_, "campos": _aplanar_diff(diff_campos_filtrado)})

    return {
        "añadidos": añadidos,
        "eliminados": eliminados,
        "modificados": modificados,
    }


def escribir_revision(ruta: Path, diff: dict[str, Any], fecha: str | None = None) -> None:
    """Escribe el resultado de la revisión en un archivo JSON con la fecha.

    La fecha puede venir como parámetro o dentro del dict `diff` bajo la clave "fecha".
    """
    salida = {
        "fecha": fecha or diff.get("fecha") or date.today().isoformat(),
        "añadidos": diff.get("añadidos", []),
        "eliminados": diff.get("eliminados", []),
        "modificados": diff.get("modificados", []),
    }
    ruta.write_text(json.dumps(salida, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> int:
    """Punto de entrada CLI: compara dos archivos JSON y escribe la revisión.

    Uso: python3 revisar_formatos.py <actual.json> <nuevo.json> <salida.json> [--fecha AAAA-MM-DD]
    """
    import sys

    if len(sys.argv) < 4:
        print("Uso: python3 revisar_formatos.py <actual.json> <nuevo.json> <salida.json> [--fecha AAAA-MM-DD]", file=sys.stderr)
        return 1

    actual_path = Path(sys.argv[1])
    nuevo_path = Path(sys.argv[2])
    salida_path = Path(sys.argv[3])

    fecha = None
    if "--fecha" in sys.argv:
        idx = sys.argv.index("--fecha")
        if idx + 1 < len(sys.argv):
            fecha = sys.argv[idx + 1]

    actual = cargar_catalogo(actual_path)
    nuevo = cargar_catalogo(nuevo_path)
    diff = comparar(actual, nuevo)
    escribir_revision(salida_path, diff, fecha)
    print(f"Revisión escrita en {salida_path}: {len(diff['añadidos'])} añadidos, {len(diff['eliminados'])} eliminados, {len(diff['modificados'])} modificados")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())