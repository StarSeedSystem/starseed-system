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


HOME = os.path.expanduser("~")
RAIZ_REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RAIZ_MEMORIA = os.path.join(RAIZ_REPO, "starseed_memory_root")
RUTA_PROPUESTA = os.path.join(HOME, ".starseed", "almacen-propuesta.json")
RUTA_APROBADAS = os.path.join(HOME, ".starseed", "almacen-aprobadas.json")
RUTA_APLICADAS = os.path.join(HOME, ".starseed", "almacen-aplicadas.jsonl")
RUTA_CAPACIDADES = os.path.join(HOME, ".starseed", "capacidades-nodos.json")
UMBRAL_LIBRE_PCT = 15.0
SUMA_MINIMA_GB = 1.0
UN_DIA_S = 86400.0


def _num(valor: object) -> Optional[float]:
    """PURA: número de un dato crudo; None si no es un número."""
    if isinstance(valor, bool) or valor is None:
        return None
    try:
        return float(str(valor))
    except (TypeError, ValueError):
        return None


def medios_bajos(capacidades: object, umbral_pct: float = UMBRAL_LIBRE_PCT) -> List[Dict[str, object]]:
    """PURA: nodos de capacidades-nodos.json con menos del `umbral_pct` % de disco libre."""
    nodos = capacidades.get("nodos") if isinstance(capacidades, dict) else capacidades
    salida: List[Dict[str, object]] = []
    for nodo in nodos if isinstance(nodos, list) else []:
        if not isinstance(nodo, dict):
            continue
        libre = _num(nodo.get("discoLibreGb", nodo.get("disco_libre_gb")))
        total = _num(nodo.get("discoTotalGb", nodo.get("disco_total_gb")))
        if libre is None or total is None or total <= 0:
            continue
        pct = libre * 100.0 / total
        if pct < umbral_pct:
            salida.append({"nodoId": str(nodo.get("nodoId") or nodo.get("id") or ""),
                           "libreGb": round(libre, 1), "totalGb": round(total, 1), "librePct": round(pct, 1)})
    return salida


def debe_avisar(candidatos: List[Candidato], medios: List[Dict[str, object]], ultimo_aviso: object,
                ahora: float, suma_minima_gb: float = SUMA_MINIMA_GB) -> Tuple[bool, str]:
    """PURA: como mucho una vez al día y solo si suma ≥ 1 GB o un medio baja del 15 %."""
    ultimo = _num(ultimo_aviso)
    if ultimo is not None and ahora - ultimo < UN_DIA_S:
        return False, "ya se avisó en las últimas 24 h"
    suma = sum(_num(c.get("gb")) or 0.0 for c in candidatos if isinstance(c, dict))
    if not medios and suma < suma_minima_gb:
        return False, "nada que avisar: %.2f GB y ningún medio bajo el %d %%" % (suma, int(UMBRAL_LIBRE_PCT))
    return True, "%.2f GB propuestos y %d medio(s) bajo el umbral" % (suma, len(medios))


def elegir_aprobado(aprobadas: object, id_candidato: str) -> Optional[Candidato]:
    """PURA: el candidato con ese id que Alex aprobó; nadie más aprueba."""
    lista = aprobadas.get("aprobadas") if isinstance(aprobadas, dict) else aprobadas
    for item in lista if isinstance(lista, list) else []:
        if (isinstance(item, dict) and str(item.get("id")) == str(id_candidato)
                and str(item.get("aprobado_por", "")).strip().lower() == "alex"):
            return item
    return None


def decidir_aplicar(candidato: Optional[Candidato], home: str, raiz_repo: str, raiz_memoria: str) -> Dict[str, object]:
    """PURA: si se puede aplicar; nunca fuera de la lista cerrada ni con acción desconocida."""
    if not isinstance(candidato, dict):
        return {"aplicar": False, "motivo": "sin aprobación de Alex"}
    ruta = str(candidato.get("ruta") or "")
    if not ruta_permitida(ruta, home, raiz_repo, raiz_memoria):
        return {"aplicar": False, "motivo": "la ruta no está en la lista cerrada"}
    accion = str(candidato.get("accion") or "")
    if accion != "borrar" and not accion.startswith("trasladar:"):
        return {"aplicar": False, "motivo": "acción no permitida: %s" % accion}
    return {"aplicar": True, "motivo": "aprobado por Alex", "accion": accion, "ruta": ruta}


def _leer_json(leer_fn: Callable[[str], object], ruta: str) -> object:
    try:
        valor = leer_fn(ruta)
        valor = json.loads(valor) if isinstance(valor, str) else valor
    except (OSError, ValueError, TypeError):
        return {}
    return valor if isinstance(valor, (dict, list)) else {}


def proponer(*, ahora: float, existe_fn: ExisteFn, tamano_fn: TamanoFn, mtime_fn: MtimeFn,
             listar_fn: ListarFn, leer_fn: Callable[[str], object], escribir_fn: Callable[[str, str], object],
             avisar_fn: Callable[[str], object], home: str = HOME, raiz_repo: str = RAIZ_REPO,
             raiz_memoria: str = RAIZ_MEMORIA, propuesta_ruta: str = RUTA_PROPUESTA,
             capacidades_ruta: str = RUTA_CAPACIDADES) -> Dict[str, object]:
    """Mide, escribe `almacen-propuesta.json` y avisa al canal como mucho una vez al día."""
    candidatos = proponer_candidatos(home, raiz_repo, raiz_memoria, ahora, existe_fn, tamano_fn, mtime_fn, listar_fn)
    medios = medios_bajos(_leer_json(leer_fn, capacidades_ruta))
    anterior = _leer_json(leer_fn, propuesta_ruta)
    ultimo = anterior.get("avisado_ts") if isinstance(anterior, dict) else None
    avisar, motivo = debe_avisar(candidatos, medios, ultimo, ahora)
    suma = sum(_num(c.get("gb")) or 0.0 for c in candidatos)
    propuesta: Dict[str, object] = {"generado_ts": ahora, "fecha": time.strftime("%Y-%m-%d", time.localtime(ahora)),
                                    "candidatos": candidatos, "medios_bajos": medios, "suma_gb": round(suma, 2),
                                    "avisado": False, "motivo": motivo}
    if avisar:
        lineas = ["Revisor de almacenamiento · %s" % propuesta["fecha"],
                  "%d limpieza(s), %.2f GB. Nada se borra ni se mueve sin la aprobación de Alex." % (len(candidatos), suma)]
        lineas += ["· %s — %.2f GB — %s (%s)" % (c.get("ruta"), _num(c.get("gb")) or 0.0, c.get("accion"), c.get("porque")) for c in candidatos]
        lineas += ["· %s al %.1f %% libre (%s de %s GB)" % (m["nodoId"], _num(m["librePct"]) or 0.0, m["libreGb"], m["totalGb"]) for m in medios]
        try:
            respuesta = avisar_fn("\n".join(lineas))
            propuesta["aviso"] = respuesta if isinstance(respuesta, (dict, str)) else None
            propuesta["avisado"] = not (isinstance(respuesta, dict) and respuesta.get("ok") is False)
        except Exception as exc:
            propuesta["aviso"] = "error: %s" % exc
        if propuesta["avisado"]:
            propuesta["avisado_ts"] = ahora
    if "avisado_ts" not in propuesta and isinstance(anterior, dict) and anterior.get("avisado_ts"):
        propuesta["avisado_ts"] = anterior["avisado_ts"]
    escribir_fn(propuesta_ruta, json.dumps(propuesta, ensure_ascii=False, indent=1))
    return propuesta


def aplicar(id_candidato: str, *, leer_fn: Callable[[str], object], anotar_fn: Callable[[str, Dict[str, object]], object],
            borrar_fn: Callable[[str], object], trasladar_fn: Callable[[str], object], home: str = HOME,
            raiz_repo: str = RAIZ_REPO, raiz_memoria: str = RAIZ_MEMORIA,
            aprobadas_ruta: str = RUTA_APROBADAS, aplicadas_ruta: str = RUTA_APLICADAS) -> Dict[str, object]:
    """Aplica solo lo aprobado por Alex y en la lista cerrada; trasladar exige copia verificada."""
    decision = decidir_aplicar(elegir_aprobado(_leer_json(leer_fn, aprobadas_ruta), id_candidato),
                               home, raiz_repo, raiz_memoria)
    if not decision.get("aplicar"):
        return {"aplicado": False, "id": id_candidato, "motivo": decision.get("motivo")}
    accion, ruta = str(decision["accion"]), str(decision["ruta"])
    resultado: Dict[str, object]
    if accion == "borrar":
        borrar_fn(ruta)
        resultado = {"estado": "borrado", "verificado": True}
    else:
        crudo = trasladar_fn(ruta)
        resultado = {str(k): v for k, v in crudo.items()} if isinstance(crudo, dict) else {}
        if resultado.get("verificado") is not True:
            return {"aplicado": False, "id": id_candidato, "motivo": "copia no verificada: no se anota", "resultado": resultado}
    anotar_fn(aplicadas_ruta, {"id": id_candidato, "ruta": ruta, "accion": accion, "ts": time.time(), "resultado": resultado})
    return {"aplicado": True, "id": id_candidato, "accion": accion, "ruta": ruta, "resultado": resultado}


def _tamano(ruta: str) -> int:
    if os.path.isfile(ruta):
        return os.path.getsize(ruta)
    return sum(os.path.getsize(os.path.join(base, nombre)) for base, _dirs, nombres in os.walk(ruta) for nombre in nombres)


def _leer_texto(ruta: str) -> str:
    with open(ruta, encoding="utf-8") as archivo:
        return archivo.read()


def _escribir_texto(ruta: str, texto: str) -> None:
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta + ".tmp", "w", encoding="utf-8") as archivo:
        archivo.write(texto)
    os.replace(ruta + ".tmp", ruta)


def _anotar(ruta: str, registro: Dict[str, object]) -> None:
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, "a", encoding="utf-8") as archivo:
        archivo.write(json.dumps(registro, ensure_ascii=False) + "\n")


def _borrar(ruta: str) -> None:
    shutil.rmtree(ruta) if os.path.isdir(ruta) else os.remove(ruta)


def _trasladar(ruta: str) -> Dict[str, object]:
    import respaldo_maggabox as RM
    return RM._mover_a_pesados(ruta, RM.DEST_BASE, subprocess.run, False)


def _avisar_canal(texto: str) -> object:
    argv = [sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), "sincronizador_direccion.py"),
            "publicar-canal", "--canal", "principal", "--de", "Revisor de almacenamiento",
            "--origen", "metagenesis", "--texto", texto]
    r = subprocess.run(argv, capture_output=True, text=True, timeout=120)
    try:
        return json.loads((r.stdout or "").strip() or "{}")
    except ValueError:
        return {"ok": False, "error": (r.stderr or "").strip()}


def main(argv: Optional[List[str]] = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    orden = args[0] if args else "proponer"
    if orden == "proponer":
        res = proponer(ahora=time.time(), existe_fn=os.path.exists, tamano_fn=_tamano, mtime_fn=os.path.getmtime,
                       listar_fn=os.listdir, leer_fn=_leer_texto, escribir_fn=_escribir_texto, avisar_fn=_avisar_canal)
        print(json.dumps(res, ensure_ascii=False, indent=1))
        return 0
    if orden == "aplicar" and len(args) > 1:
        res = aplicar(args[1], leer_fn=_leer_texto, anotar_fn=_anotar, borrar_fn=_borrar, trasladar_fn=_trasladar)
        print(json.dumps(res, ensure_ascii=False, indent=1))
        return 0 if res.get("aplicado") else 1
    print("Uso: revisor_almacenamiento.py proponer | aplicar <id>")
    return 2


if __name__ == "__main__":
    sys.exit(main())
