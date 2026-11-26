#!/usr/bin/env python3
"""Revisor de almacenamiento: propone limpiezas, nunca las ejecuta."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
from typing import Callable, Dict, List, Optional, Tuple, Union

CACHES_EXACTOS: Tuple[str, ...] = ("go-build", "electron", "electron-builder")
Candidato = Dict[str, object]
ExisteFn = Callable[[str], bool]
TamanoFn = Callable[[str], int]
MtimeFn = Callable[[str], float]
ListarFn = Callable[[str], List[str]]


def _id_estable(ruta: str) -> str:
    return hashlib.sha1(ruta.encode("utf-8")).hexdigest()[:12]


def _ficha(ruta: str, gb: float, porque: str, regenerable: bool, otra_copia: Union[bool, str], accion: str) -> Candidato:
    return {
        "id": _id_estable(ruta),
        "ruta": ruta,
        "gb": round(gb, 2),
        "porque": porque,
        "regenerable": regenerable,
        "otra_copia": otra_copia,
        "accion": accion,
    }


def proponer_candidatos(
    home: str,
    raiz_repo: str,
    raiz_memoria: str,
    ahora: float,
    existe_fn: ExisteFn,
    tamano_fn: TamanoFn,
    mtime_fn: MtimeFn,
    listar_fn: ListarFn,
) -> List[Candidato]:
    candidatos: List[Candidato] = []

    def agregar(
        ruta: str,
        porque: str,
        accion: str = "borrar",
        regenerable: bool = True,
        otra_copia: Union[bool, str] = False,
        antiguedad_horas: float = 0,
    ) -> None:
        if not existe_fn(ruta):
            return
        if antiguedad_horas:
            try:
                if ahora - mtime_fn(ruta) <= antiguedad_horas * 3600:
                    return
            except OSError:
                return
        try:
            bytes_totales = tamano_fn(ruta)
        except (OSError, TypeError, ValueError):
            return
        if bytes_totales <= 0:
            return
        gb = bytes_totales / (1024 ** 3)
        candidatos.append(_ficha(ruta, gb, porque, regenerable, otra_copia, accion))

    caches = os.path.join(home, "Library", "Caches")
    nombres = set(CACHES_EXACTOS)
    try:
        for nombre in listar_fn(caches):
            if nombre.endswith("-updater") and os.path.basename(nombre) == nombre:
                nombres.add(nombre)
    except OSError:
        pass

    for nombre in sorted(nombres):
        agregar(
            os.path.join(caches, nombre),
            "Caché regenerable de herramientas",
        )

    for ruta, porque in (
        (os.path.join(raiz_repo, "native", "src-tauri", "target"), "Compilación nativa regenerable"),
        (os.path.join(raiz_repo, ".next-anterior"), "Compilación anterior regenerable"),
    ):
        agregar(ruta, porque)
    agregar(
        os.path.join(raiz_memoria, ".tmp.driveupload"), "Carga temporal de Drive de más de 24 h",
        antiguedad_horas=24,
    )
    agregar(
        os.path.join(raiz_memoria, "olas", "logs"),
        "Registros de olas de más de 7 días",
        accion="trasladar:maggabox",
        regenerable=False, otra_copia="maggabox",
        antiguedad_horas=7 * 24,
    )
    return candidatos


def ruta_permitida(ruta: str, home: str, raiz_repo: str, raiz_memoria: str) -> bool:
    caches = os.path.join(home, "Library", "Caches")
    exactas = {os.path.join(caches, nombre) for nombre in CACHES_EXACTOS}
    exactas.update((
        os.path.join(raiz_repo, "native", "src-tauri", "target"),
        os.path.join(raiz_repo, ".next-anterior"),
        os.path.join(raiz_memoria, ".tmp.driveupload"),
        os.path.join(raiz_memoria, "olas", "logs"),
    ))
    if ruta in exactas:
        return True
    padre, nombre = os.path.split(ruta)
    return padre == caches and nombre.endswith("-updater") and os.path.basename(nombre) == nombre


DIR_ESTADO = os.path.join(os.path.expanduser("~"), ".starseed")
RUTA_PROPUESTA, RUTA_APROBADAS = (os.path.join(DIR_ESTADO, "almacen-propuesta.json"), os.path.join(DIR_ESTADO, "almacen-aprobadas.json"))
RUTA_APLICADAS, RUTA_CAPACIDADES = (os.path.join(DIR_ESTADO, "almacen-aplicadas.jsonl"), os.path.join(DIR_ESTADO, "capacidades-nodos.json"))
UMBRAL_LIBRE, GB_MINIMO_AVISO = 0.15, 1.0

def debe_avisar(total_gb, medios, ahora, ultimo_aviso) -> bool:
    """PURA: una vez al día y solo si hay ≥ 1 GB o un medio bajo el 15 %."""
    if ultimo_aviso and ahora - ultimo_aviso < 24 * 3600:
        return False
    if total_gb >= GB_MINIMO_AVISO:
        return True
    for medio in medios:
        try:
            libre, total = float(str(medio.get("discoLibreGb") or 0)), float(str(medio.get("discoTotalGb") or 0))
        except (AttributeError, TypeError, ValueError):
            continue
        if total > 0 and libre / total < UMBRAL_LIBRE:
            return True
    return False

def aprobacion_valida(candidato_id, aprobadas, candidatos, home, raiz_repo, raiz_memoria) -> Optional[Candidato]:
    """PURA: solo si Alex lo aprobó y la ruta sigue en la lista cerrada."""
    if not any(a.get("id") == candidato_id and a.get("aprobado_por") == "alex" for a in aprobadas):
        return None
    for candidato in candidatos:
        if candidato.get("id") == candidato_id:
            ruta = str(candidato.get("ruta") or "")
            return candidato if ruta_permitida(ruta, home, raiz_repo, raiz_memoria) else None
    return None

def borrado_seguro(candidato) -> bool:
    return bool(candidato.get("regenerable")) or bool(candidato.get("otra_copia"))

def proponer(ahora, home, raiz_repo, raiz_memoria, existe_fn, tamano_fn, mtime_fn, listar_fn,
             leer_fn, escribir_fn, publicar_fn) -> Dict[str, object]:
    candidatos = proponer_candidatos(home, raiz_repo, raiz_memoria, ahora, existe_fn, tamano_fn, mtime_fn, listar_fn)
    total_gb = round(sum(float(str(c["gb"])) for c in candidatos), 2)
    previa, capacidades = leer_fn(RUTA_PROPUESTA) or {}, leer_fn(RUTA_CAPACIDADES) or {}
    medios = capacidades.get("nodos") if isinstance(capacidades, dict) else []
    ultimo = float(str(previa.get("avisado_en") or 0)) if isinstance(previa, dict) else 0.0
    avisar = debe_avisar(total_gb, medios if isinstance(medios, list) else [], ahora, ultimo)
    escribir_fn(RUTA_PROPUESTA, {"generado_en": ahora, "total_gb": total_gb, "candidatos": candidatos,
                                 "avisado_en": ahora if avisar else ultimo})
    if avisar:
        lineas = ["Almacenamiento: %d propuestas, %.2f GB." % (len(candidatos), total_gb)]
        lineas += ["· %.2f GB · %s · %s" % (c["gb"], c["ruta"], c["accion"]) for c in candidatos[:8]]
        publicar_fn("\n".join(lineas + ["Nada se ejecuta sin la aprobación de Alex."]))
    return {"total_gb": total_gb, "candidatos": len(candidatos), "avisado": avisar}

def aplicar(candidato_id, ahora, home, raiz_repo, raiz_memoria, leer_fn, anotar_fn, borrar_fn, trasladar_fn) -> Dict[str, object]:
    propuesta = leer_fn(RUTA_PROPUESTA) or {}
    datos = leer_fn(RUTA_APROBADAS)
    if isinstance(datos, dict):
        datos = datos.get("aprobadas") or datos.get("aprobaciones") or []
    aprobadas = [a for a in datos if isinstance(a, dict)] if isinstance(datos, list) else []
    candidato = aprobacion_valida(candidato_id, aprobadas, propuesta.get("candidatos") or [], home, raiz_repo, raiz_memoria)
    if candidato is None:
        return {"aplicado": False, "motivo": "sin aprobación de Alex o ruta fuera de la lista cerrada"}
    if candidato.get("accion") == "trasladar:maggabox":
        resultado = trasladar_fn(str(candidato.get("ruta")))
        hecho, detalle = bool(resultado.get("verificado")), str(resultado.get("estado"))
    elif borrado_seguro(candidato):
        borrar_fn(str(candidato.get("ruta")))
        hecho, detalle = True, "borrado"
    else:
        hecho, detalle = False, "borrado sin red de seguridad"
    if hecho:
        anotar_fn(RUTA_APLICADAS, {"en": ahora, "id": candidato_id, "ruta": candidato.get("ruta"),
                                   "accion": candidato.get("accion"), "gb": candidato.get("gb"), "detalle": detalle})
    return {"aplicado": hecho, "id": candidato_id, "detalle": detalle}

def _leer_json(ruta: str) -> object:
    try:
        with open(ruta, encoding="utf-8") as archivo: return json.load(archivo)
    except (OSError, ValueError):
        return None

def _escribir_json(ruta: str, datos: object) -> None:
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta + ".tmp", "w", encoding="utf-8") as archivo: json.dump(datos, archivo, ensure_ascii=False, indent=1)
    os.replace(ruta + ".tmp", ruta)

def _anotar_jsonl(ruta: str, linea: Dict[str, object]) -> None:
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, "a", encoding="utf-8") as archivo:
        archivo.write(json.dumps(linea, ensure_ascii=False) + "\n")

def _tamano(ruta: str) -> int:
    salida = subprocess.run(["du", "-sk", ruta], capture_output=True, text=True)
    return int(salida.stdout.split()[0]) * 1024 if salida.stdout else 0

def _publicar(texto: str) -> None:
    argv = [sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), "sincronizador_direccion.py"), "publicar-canal", "--canal", "principal", "--de", "Revisor de almacenamiento", "--origen", "metagenesis", "--texto", texto]
    subprocess.run(argv, check=False)

def main(argv: Optional[List[str]] = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    if not argv or argv[0] not in ("proponer", "aplicar") or (argv[0] == "aplicar" and len(argv) < 2):
        print("uso: revisor_almacenamiento.py proponer|aplicar <id>"); return 2
    home, raiz_repo = os.path.expanduser("~"), os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    raiz_memoria = os.path.join(raiz_repo, "starseed_memory_root")
    if argv[0] == "proponer":
        res = proponer(time.time(), home, raiz_repo, raiz_memoria, os.path.exists, _tamano,
                       os.path.getmtime, os.listdir, _leer_json, _escribir_json, _publicar)
    else:
        import respaldo_maggabox as RM
        borrar = lambda r: shutil.rmtree(r) if os.path.isdir(r) else os.remove(r)
        res = aplicar(argv[1], time.time(), home, raiz_repo, raiz_memoria, _leer_json, _anotar_jsonl,
                      borrar, lambda r: RM._mover_a_pesados(r, RM.DEST_BASE, subprocess.run, False))
    print(json.dumps(res, ensure_ascii=False))
    return 0 if res.get("aplicado", True) else 1
if __name__ == "__main__":
    sys.exit(main())
