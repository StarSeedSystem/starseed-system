#!/usr/bin/env python3
"""Registro local y proyecciones de los límites del plan de Claude."""
from __future__ import annotations
import argparse, json, math, os, statistics
from datetime import datetime, timedelta

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
        cada = tarea.get("cada_min")
        if isinstance(cada, int) and not isinstance(cada, bool) and cada > 0:
            intervalo = cada * 60
            delta_seg = (ahora - proxima).total_seconds()
            if delta_seg > 0:
                # Avanzar a la primera ocurrencia posterior a `ahora`
                k = int(delta_seg // intervalo) + 1
                primera = proxima + timedelta(seconds=k * intervalo)
            else:
                primera = proxima
            if primera > hasta:
                continue
            count = int(math.floor((hasta - primera).total_seconds() / intervalo)) + 1
            total += max(0, count)
        else:
            # Puntual: cuenta 1 solo si `proxima` está en (ahora, hasta]
            if ahora < proxima <= hasta:
                total += 1
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
