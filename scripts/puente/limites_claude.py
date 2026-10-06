#!/usr/bin/env python3
<<<<<<< HEAD
"""Registro local y proyecciones de los límites del plan de Claude."""
from __future__ import annotations
import argparse, json, math, os, statistics
from datetime import datetime

ARCHIVO = os.path.expanduser(os.environ.get("STARSEED_LIMITES_CLAUDE", "~/.starseed/limites-claude.json"))
CAMPOS = ("sesion", "semana", "modelo")
def _fecha(valor: str) -> datetime:
    return datetime.fromisoformat(valor.replace("Z", "+00:00"))
def leer() -> dict:
    try:
        with open(ARCHIVO, encoding="utf-8") as archivo:
            datos = json.load(archivo)
        return datos if isinstance(datos, dict) else {}
    except (OSError, ValueError, TypeError):
        return {}
def _guardar(datos: dict) -> None:
    carpeta = os.path.dirname(ARCHIVO) or "."
    os.makedirs(carpeta, exist_ok=True)
    temporal = ARCHIVO + ".tmp"
    with open(temporal, "w", encoding="utf-8") as archivo:
        json.dump(datos, archivo, ensure_ascii=False, indent=2)
        archivo.write("\n")
    os.replace(temporal, ARCHIVO)
def anadir_lectura(datos: dict, lectura: dict) -> dict:
    nueva = dict(lectura)
    for campo in CAMPOS:
        porcentaje = nueva.get(campo + "_pct")
        reinicio = nueva.get(campo + "_reinicio")
        if campo != "modelo" or porcentaje is not None:
            if (isinstance(porcentaje, bool) or not isinstance(porcentaje, (int, float))
                    or not 0 <= porcentaje <= 100):
                raise ValueError("porcentaje fuera de rango: " + campo)
        if reinicio is not None:
            _fecha(reinicio)
        elif campo != "modelo" or porcentaje is not None:
            raise ValueError("falta el reinicio de " + campo)
    _fecha(nueva["t"])
    resultado = dict(datos) if isinstance(datos, dict) else {}
    lecturas = list(resultado.get("lecturas", [])) + [nueva]
    resultado["lecturas"] = lecturas[-200:]
    return resultado
def coste_por_revision(lecturas: list[dict], campo: str) -> float | None:
    if campo not in CAMPOS:
        raise ValueError("campo desconocido")
    pct, reinicio = campo + "_pct", campo + "_reinicio"
    aumentos = []
    for anterior, actual in zip(lecturas, lecturas[1:]):
        if anterior.get(reinicio) != actual.get(reinicio) or not actual.get(reinicio):
            continue
        primero, segundo = anterior.get(pct), actual.get(pct)
        if isinstance(primero, (int, float)) and isinstance(segundo, (int, float)):
            aumento = segundo - primero
            if aumento > 0:
                aumentos.append(aumento)
    return statistics.median(aumentos) if aumentos else None
def disparos_antes(lista: list[dict], ahora: datetime, hasta: datetime) -> int:
    total = 0
    for tarea in lista:
        try:
            proxima = _fecha(tarea["proxima"])
        except (KeyError, TypeError, ValueError):
            continue
        if not ahora < proxima <= hasta:
            continue
        total += 1
        cada = tarea.get("cada_min")
        if isinstance(cada, int) and not isinstance(cada, bool) and cada > 0:
            total += math.floor((hasta - proxima).total_seconds() / (cada * 60))
    return total
def estado(datos: dict, ahora: datetime) -> dict:
    lecturas = datos.get("lecturas", [])
    ultima = lecturas[-1] if lecturas else {}
    try:
        lectura_hace = max(0.0, (ahora - _fecha(ultima["t"])).total_seconds() / 60)
    except (KeyError, TypeError, ValueError):
        lectura_hace = None
    desactualizada = lectura_hace is None or lectura_hace > 120
    umbral = datos.get("umbral_pct", 90)
    tareas = datos.get("programadas", {}).get("lista", [])
    ventanas, recomendables = {}, []
    for campo in CAMPOS:
        valor, reinicio_texto = ultima.get(campo + "_pct"), ultima.get(campo + "_reinicio")
        reinicio = _fecha(reinicio_texto) if reinicio_texto else None
        reiniciada = bool(reinicio and reinicio <= ahora)
        pct = 0 if reiniciada else valor
        coste = coste_por_revision(lecturas, campo)
        minutos = max(0, math.floor((reinicio - ahora).total_seconds() / 60)) if reinicio else None
        disparos = disparos_antes(tareas, ahora, reinicio) if reinicio and not reiniciada else 0
        proyeccion = pct + disparos * coste if pct is not None and coste is not None else None
        tono = "ok"
        if pct is not None and (pct >= umbral or proyeccion is not None and proyeccion > 100):
            tono = "peligro"
        elif pct is not None and (pct >= 60 or proyeccion is not None and proyeccion >= umbral):
            tono = "aviso"
        if desactualizada and pct is not None and tono == "ok":
            tono = "aviso"
        ventanas[campo] = {"pct": pct, "queda": 100 - pct if pct is not None else None,
                           "reinicio": reinicio_texto, "minutos_para_reinicio": minutos,
                           "coste": coste, "proyeccion": proyeccion,
                           "reiniciada": reiniciada, "tono": tono}
        if campo != "modelo" and proyeccion is not None and proyeccion > umbral and coste:
            caben = max(0, math.floor((umbral - pct) / coste))
            recomendables.append((caben, campo))
    recomendacion = None
    if recomendables:
        caben, campo = min(recomendables)
        nombre = "sesión" if campo == "sesion" else "semana"
        recomendacion = f"Espacia las revisiones: caben {caben} hasta el reinicio de {nombre}"
    return {**ventanas, "modelo_nombre": ultima.get("modelo_nombre"),
            "lectura_hace_min": lectura_hace, "desactualizada": desactualizada,
            "recomendacion": recomendacion}
def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="orden", required=True)
    declarar = sub.add_parser("declarar")
    for nombre in ("sesion", "semana"):
        declarar.add_argument("--" + nombre, type=float, required=True)
        declarar.add_argument("--" + nombre + "-reinicio", required=True)
    declarar.add_argument("--modelo-nombre")
    declarar.add_argument("--modelo", type=float); declarar.add_argument("--modelo-reinicio")
    declarar.add_argument("--fuente", default="claude.ai")
    programadas = sub.add_parser("programadas")
    programadas.add_argument("--json", required=True)
    sub.add_parser("estado"); sub.add_parser("leer")
    args = parser.parse_args(argv)
    datos, ahora = leer(), datetime.now().astimezone()
    if args.orden == "declarar":
        lectura = {"t": ahora.isoformat(), "sesion_pct": args.sesion,
                   "sesion_reinicio": args.sesion_reinicio, "semana_pct": args.semana,
                   "semana_reinicio": args.semana_reinicio, "modelo_nombre": args.modelo_nombre,
                   "modelo_pct": args.modelo, "modelo_reinicio": args.modelo_reinicio,
                   "fuente": args.fuente}
        _guardar(anadir_lectura(datos, lectura))
    elif args.orden == "programadas":
        lista = json.loads(args.json)
        if not isinstance(lista, list):
            parser.error("--json debe contener una lista")
        datos["programadas"] = {"t": ahora.isoformat(), "lista": lista}
        _guardar(datos)
    else:
        salida = estado(datos, ahora) if args.orden == "estado" else datos
        print(json.dumps(salida, ensure_ascii=False, indent=2))
    return 0
if __name__ == "__main__":
    raise SystemExit(main())
=======
# -*- coding: utf-8 -*-
"""Límites del plan de Claude: leer, programadas, coste y proyección.

Acceso al Mando completo: [abrir en esta Mac](http://localhost:9002/mando) — la app Next.js del
repo bajo launchd (`com.starseed.mando`, `next start`). *(Corrección 2026-10-05: nunca fue una
«interfaz Python provisional»; el 9003 fue un `next dev` suelto del 09-11, sin supervisar.)*

En el CLAUDE.md §8 se definen las reglas finales, pero aquí el CONTRATO del área:

- Las rutas /api/mando/* son SOLO locales (404 en producción) y jamás devuelven claves.
- El costo por revisión = mediana de los aumentos positivos de `*_pct` entre lecturas CONSECUTIVAS de la MISMA
  ventana (mismo `*_reinicio`). Null si no hay dos lecturas así.
- Disparos antes de un reinicio = por cada programada: 1 si `proxima` ∈ (ahora, reinicio] más,
  si `cada_min`>0, floor((reinicio − proxima)/cada_min). Si `reinicio` ya pasó, la ventana vale 0 % y
  se marca `reiniciada: true`.
- Tono: «peligro» si pct ≥ umbral o proyección > 100; «aviso» si pct ≥ 60 o proyección ≥ umbral;
  si no «ok». Lectura de hace más de 120 min → `desactualizada: true` (y como mínimo «aviso»).
- Recomendación: si la proyección de la sesión o la semana supera el umbral,
  «Espacia las revisiones: caben N hasta el reinicio de <ventana>» con N = max(0,
  floor((umbral − pct)/coste)).

Los archivos implicados: scripts/puente/limites_claude.py, scripts/puente/test_limites_claude.py.

Aplica solo en la Mac (o CI local) y las UT están en verde: `python3 -m unittest discover -s
scripts/puente -p 'test_*.py'`.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
from typing import Any

ARCHIVO = os.path.expanduser(os.environ.get("STARSEED_LIMITES_CLAUDE", "~/.starseed/limites-claude.json"))


def _parse_iso(iso: str) -> dt.datetime:
    """Parsea ISO sin microsegundos, con o sin zona horaria."""
    if not iso or "T" not in iso:
        raise ValueError("fecha inválida")
    try:
        return dt.datetime.fromisoformat(iso.rstrip("Z").replace("Z", "+00:00"))
    except Exception:
        raise ValueError("fecha inválida")


def _validar_pct(pct: int, campo: str) -> None:
    if not (0 <= pct <= 100):
        raise ValueError(f"{campo} debe estar entre 0 y 100")


def anadir_lectura(datos: dict[str, Any], lectura: dict[str, Any]) -> dict[str, Any]:
    """Añade una lectura validada al final; recorta las últimas 200.

    `lectura` debe tener una `t` (ISO), `sesion_pct`, `sesion_reinicio`,
    `semana_pct`, `semana_reinicio` y opcionalmente `modelo_pct`, `modelo_reinicio`,
    `modelo_nombre`.
    """
    _validar_pct(lectura["sesion_pct"], "sesion_pct")
    _parse_iso(lectura["t"])
    _parse_iso(lectura["sesion_reinicio"])
    if "semana_pct" in lectura:
        _validar_pct(lectura["semana_pct"], "semana_pct")
    if "semana_reinicio" in lectura:
        _parse_iso(lectura["semana_reinicio"])
    if "modelo_pct" in lectura:
        _validar_pct(lectura["modelo_pct"], "modelo_pct")
    if "modelo_reinicio" in lectura:
        _parse_iso(lectura["modelo_reinicio"])

    datos.setdefault("lecturas", []).append(lectura)
    if len(datos["lecturas"]) > 200:
        datos["lecturas"] = datos["lecturas"][-200:]
    return datos


def coste_por_revision(lecturas: list[dict[str, Any]], campo: str) -> int | None:
    """Devuelve la mediana de aumentos positivos de `campo_pct` entre lecturas
    CONSECUTIVAS que COMPARTEN el mismo `campo_reinicio`.

    Campo: "sesion", "semana", "modelo".
    Devuelve int o None (sin suficientes aumentos consecutivos).
    """
    aumentos = []
    actual_reinicio = None
    anterior = None

    for r in lecturas:
        reinicio = r.get(f"{campo}_reinicio")
        if reinicio is None:
            continue
        if anterior is not None and reinicio == actual_reinicio:
            ant_ant_pct = anterior.get(f"{campo}_pct")
            curr_pct = r.get(f"{campo}_pct")
            if ant_ant_pct is not None and curr_pct is not None:
                diff = curr_pct - ant_ant_pct
                if diff > 0:
                    aumentos.append(diff)
        actual_reinicio = reinicio
        anterior = r

    if not aumentos:
        return None
    aumentos.sort()
    if len(aumentos) % 2 == 0:
        return int((aumentos[len(aumentos) // 2 - 1] + aumentos[len(aumentos) // 2]) / 2)
    return aumentos[len(aumentos) // 2]


def disparos_antes(ordenados: list[dict[str, Any]], ahora: dt.datetime | str, hasta: dt.datetime | str) -> int:
    """Cuenta disparos antes de `hasta` en `ordenados`.

    Por cada elemento:
      - si `cada_min`>0: floor((hasta − proxima)/cada_min) (proxima < hasta)
      - si `proxima` ∈ (ahora, hasta] (excluyendo == ahora): 1

    No incluye duplicados entre los dos.
    """
    if isinstance(ahora, str):
        ahora = _parse_iso(ahora)
    if isinstance(hasta, str):
        hasta = _parse_iso(hasta)
    
    total = 0
    for p in ordenados:
        if p.get("cada_min") > 0:
            prox = _parse_iso(p["proxima"])
            if prox < hasta:
                total += max(0, (hasta - prox).total_seconds() // (p["cada_min"] * 60))
        prox = _parse_iso(p["proxima"])
        if ahora < prox <= hasta:
            total += 1
    return total


def _proyeccion(pct: int, coste: int | None, minutos_para_reinicio: int) -> int | None:
    """Proyección al fin de la ventana: pct + disparos × coste."""
    if coste is None or minutos_para_reinicio <= 0:
        return None
    return pct + coste


def estado(datos: dict[str, Any], ahora: dt.datetime | str) -> dict[str, Any]:
    """Devuelve el estado calculado según el contrato.

    Incluye por ventana (sesion, semana, modelo) la pct actual, minutos para reinicio,
    coste, proyección, reiniciada, tono; más campos globales como `lectura_hace_min`,
    `desactualizada`, `recomendacion`.
    """
    if isinstance(ahora, str):
        ahora = _parse_iso(ahora)
    
    lecturas = datos.get("lecturas", [])
    programadas = datos.get("programadas", {})
    umbral = datos.get("umbral_pct", 90)

    estado_ventanas = {}

    for campo in ("sesion", "semana", "modelo"):
        pct = 0
        reinicio = ahora
        if lecturas:
            r = lecturas[-1]
            pct = r.get(f"{campo}_pct")
            reinicio = r.get(f"{campo}_reinicio")

        try:
            reinicio_dt = _parse_iso(reinicio)
        except Exception:
            reinicio_dt = ahora
        minutos_para_reinicio = max(0, int((reinicio_dt - ahora).total_seconds() // 60))
        reiniciada = reinicio_dt < ahora
        if reiniciada:
            pct = 0

        coste = None
        if not reiniciada:
            coste = coste_por_revision(lecturas, campo)

        proyeccion = _proyeccion(pct, coste, minutos_para_reinicio)

        if reiniciada:
            tono = "ok"
        else:
            tono = "ok"
            if pct is not None and pct >= umbral or (proyeccion is not None and proyeccion > 100):
                tono = "peligro"
            elif (pct is not None and pct >= 60) or (proyeccion is not None and proyeccion >= umbral):
                tono = "aviso"

        estado_ventanas[campo] = {
            "pct": pct,
            "minutos_para_reinicio": minutos_para_reinicio,
            "coste": coste,
            "proyeccion": proyeccion,
            "reiniciada": reiniciada,
            "tono": tono,
        }

    lectura_hace_min = None
    desactualizada = False
    if lecturas:
        ultima = lecturas[-1]
        t_dt = _parse_iso(ultima["t"])
        lectura_hace_min = int((ahora - t_dt).total_seconds() // 60)
        desactualizada = lectura_hace_min > 120
        if desactualizada:
            for campo in estado_ventanas:
                if estado_ventanas[campo]["tono"] == "ok":
                    estado_ventanas[campo]["tono"] = "aviso"

    recomendaciones = []
    for campo in ("sesion", "semana"):
        ventana = estado_ventanas[campo]
        if ventana["proyeccion"] is not None and ventana["proyeccion"] > umbral:
            if ventana["coste"] is None:
                recomendaciones.append(f"no hay coste para {campo} para proyectar")
            else:
                disponibles = int((umbral - ventana["pct"]) / ventana["coste"])
                recomendaciones.append(
                    f"Espacia las revisiones: caben {disponibles} hasta el reinicio de {campo}"
                )

    if recomendaciones:
        recomendacion = "; ".join(recomendaciones)
    else:
        recomendacion = None

    return {
        "sesion": estado_ventanas["sesion"],
        "semana": estado_ventanas["semana"],
        "modelo": estado_ventanas["modelo"],
        "lectura_hace_min": lectura_hace_min,
        "desactualizada": desactualizada,
        "recomendacion": recomendacion,
    }


def _cargar(datos_path: str) -> dict[str, Any]:
    try:
        with open(datos_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _guardar(datos: dict[str, Any]) -> None:
    path = ARCHIVO
    tmp = path + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(datos, f, indent=2, ensure_ascii=False)
        os.replace(tmp, path)
    except Exception:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def _leer(_: dict[str, Any]) -> None:
    try:
        with open(ARCHIVO, "r", encoding="utf-8") as f:
            print(json.dumps(json.load(f), indent=2, ensure_ascii=False))
    except Exception as e:
        print(f"No se pudo leer {ARCHIVO}: {e}", file=sys.stderr)


def _programadas(datos: dict[str, Any], parser: argparse.Namespace) -> None:
    if parser.json:
        datos["programadas"] = parser.json
        _guardar(datos)


def _declarar(datos: dict[str, Any], parser: argparse.Namespace) -> None:
    ahora = dt.datetime.utcnow().isoformat() + "Z"
    lectura = {"t": ahora, "sesion_pct": parser.sesion, "sesion_reinicio": parser.sesion_reinicio}
    if parser.semana is not None:
        lectura["semana_pct"] = parser.semana
        lectura["semana_reinicio"] = parser.semana_reinicio
    if parser.modelo is not None:
        lectura["modelo_pct"] = parser.modelo
        lectura["modelo_reinicio"] = parser.modelo_reinicio
        lectura["modelo_nombre"] = parser.modelo_nombre

    datos = anadir_lectura(datos, lectura)
    _guardar(datos)


def main(argv: list[str] | None = None) -> int:
    if argv is None:
        argv = sys.argv[1:]

    parser = argparse.ArgumentParser(prog="limites_claude.py", description="Límites del plan de Claude")
    subparsers = parser.add_subparsers(dest="comando", required=True)

    parser_decl = subparsers.add_parser("declarar", help="Registrar una lectura")
    parser_decl.add_argument("--sesion", type=int, required=True, help="Sesión pct (0-100)")
    parser_decl.add_argument("--sesion-reinicio", required=True, help="Sesión reinicio ISO")
    parser_decl.add_argument("--semana", type=int, help="Semana pct (0-100)")
    parser_decl.add_argument("--semana-reinicio", help="Semana reinicio ISO")
    parser_decl.add_argument("--modelo", type=int, help="Modelo pct (0-100)")
    parser_decl.add_argument("--modelo-reinicio", help="Modelo reinicio ISO")
    parser_decl.add_argument("--modelo-nombre", help="Modelo nombre")
    parser_decl.add_argument("--fuente", help="Fuente de la lectura")

    parser_prog = subparsers.add_parser("programadas", help="Reemplazar lista programada")
    parser_prog.add_argument("--json", required=True, help="Lista programada JSON")

    subparsers.add_parser("estado", help="Imprimir el estado actual")
    subparsers.add_parser("leer", help="Leer el archivo directamente")

    args = parser.parse_args(argv)

    datos = _cargar(ARCHIVO)

    if args.comando == "declarar":
        try:
            _declarar(datos, args)
            print(f"lectura registrada en {ARCHIVO}")
        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)
            return 2

    elif args.comando == "programadas":
        try:
            _programadas(datos, args)
            print(f"programadas actualizadas en {ARCHIVO}")
        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)
            return 2

    elif args.comando == "estado":
        now = dt.datetime.utcnow().isoformat() + "Z"
        try:
            est = estado(datos, _parse_iso(now))
            print(json.dumps(est, indent=2, ensure_ascii=False))
        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)
            return 2

    elif args.comando == "leer":
        _leer(datos)

    return 0


if __name__ == "__main__":
    sys.exit(main())
>>>>>>> 7a7c5cdd (salvavidas · LC1004A: trabajo del agente antes de las puertas (tsc / vitest))
