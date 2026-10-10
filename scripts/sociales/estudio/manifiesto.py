"""manifiesto.py — la ficha de cada pieza y el manifiesto de la campaña.

Cada archivo entregado lleva: sha256, formato (`AxB@Ns`), duración, peso, medio, idioma, escena, verificación. Las filas
`tabla` salen listas para insertar en `metageminis_piezas` (siempre en estado «para_aprobar»; la base de datos rechaza otro).
Escritura atómica (archivo temporal + os.replace): un render interrumpido no deja un JSON a medias.
"""
from __future__ import annotations

import hashlib
import json
import os
import time
from pathlib import Path

import nucleo

ESTADO = "_estado"  # subcarpeta con una ficha por trabajo (permite reanudar un lote)


def sha256_archivo(ruta: Path) -> str:
    h = hashlib.sha256()
    with open(ruta, "rb") as f:
        for bloque in iter(lambda: f.read(1 << 20), b""):
            h.update(bloque)
    return h.hexdigest()


def escribir_json(ruta: Path, datos) -> None:
    ruta = Path(ruta)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    tmp = ruta.with_suffix(ruta.suffix + ".tmp")
    tmp.write_text(json.dumps(datos, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    os.replace(tmp, ruta)


def entrada(campana_id: str, pieza: dict, entrega: "nucleo.Entrega", ruta_abs: Path, idioma: str, escena: str, duracion: float | None, fps: float | None,
            tamano: tuple[int, int], sha: str, verificacion: dict, extra: dict | None = None, lamina: int | None = None) -> dict:
    """Una fila del manifiesto (una por archivo y formato de catálogo)."""
    f = entrega.formato
    fila_db = nucleo.fila_tabla_piezas(campana_id, pieza, entrega, sha, duracion, tamano)
    out = {
        "id": f"{pieza['id']}-{f['id']}-{idioma}" + ("" if lamina is None else f"-{lamina + 1:02d}") + f".{entrega.contenedor}",
        "pieza": pieza["id"],
        "titulo": pieza.get("titulo", pieza["id"]),
        "idioma": idioma,
        "lamina": None if lamina is None else lamina + 1,
        "formato_catalogo": f["id"],
        "contenedor": entrega.contenedor,
        "ancho": tamano[0],
        "alto": tamano[1],
        "duracion": duracion if (pieza["salida"] == "video" or entrega.contenedor in ("gif", "apng", "webm")) else None,
        "fps": fps if pieza["salida"] == "video" else None,
        "bytes": Path(ruta_abs).stat().st_size,
        "escena": escena,
        "compartida": entrega.compartida,
        "verificacion": verificacion,
        "tabla": fila_db,
        "problemas_tabla": nucleo.fila_valida(fila_db),
    }
    if extra:
        out.update(extra)
    return out


def guardar_trabajo(salida: Path, trabajo_id: str, entradas: list[dict], meta: dict) -> None:
    escribir_json(Path(salida) / ESTADO / f"{trabajo_id}.json", {"trabajo": trabajo_id, "generado": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "meta": meta, "entradas": entradas})


def leer_trabajos(salida: Path) -> list[dict]:
    carpeta = Path(salida) / ESTADO
    return [json.loads(p.read_text(encoding="utf8")) for p in sorted(carpeta.glob("*.json"))] if carpeta.is_dir() else []


def agregar(salida: Path, campana: dict) -> dict:
    """Junta las fichas de todos los trabajos en `manifiesto.json` de la campaña."""
    trabajos = leer_trabajos(salida)
    entradas = [e for t in trabajos for e in t["entradas"]]
    # La ruta es relativa a la carpeta de la campaña; los hashes se recalculan para que el manifiesto nunca mienta.
    por_ruta: dict[str, str] = {}
    for e in entradas:
        r = e["tabla"]["ruta"]
        p = Path(salida) / r
        if p.is_file():
            por_ruta.setdefault(r, sha256_archivo(p))
            if por_ruta[r] != e["tabla"]["sha256"]:
                e["tabla"]["sha256"] = por_ruta[r]
                e["bytes"] = p.stat().st_size
    mf = {
        "campana": {"id": campana["id"], "nombre": campana["nombre"], "descripcion": campana.get("descripcion", "")},
        "estado": "para_aprobar",
        "generado": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "generador": "Estudio MetaGeminis (scripts/sociales/estudio)",
        "nada_publicado": True,
        "totales": {
            "filas": len(entradas),
            "archivos_unicos": len(por_ruta),
            "bytes": sum(Path(salida, r).stat().st_size for r in por_ruta if Path(salida, r).is_file()),
            "por_tipo": _contar(entradas, lambda e: e["tabla"]["tipo"]),
            "por_medio": _contar(entradas, lambda e: e["tabla"]["medio"]),
            "por_idioma": _contar(entradas, lambda e: e["idioma"]),
        },
        "piezas": entradas,
    }
    escribir_json(Path(salida) / "manifiesto.json", mf)
    return mf


def _contar(entradas, clave) -> dict:
    out: dict[str, int] = {}
    for e in entradas:
        out[clave(e)] = out.get(clave(e), 0) + 1
    return dict(sorted(out.items()))
