#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Buzón MetaGenesis → Telegram (BZN1108B): servicio ligero que solo actúa si este nodo es el
líder de dirección. Cada 120 s lee avisos pendientes de Supabase y los entrega por Hermes.

Variables de entorno (solo NOMBRES, nunca valores):
- NEXT_PUBLIC_SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
"""

import json
import os
import sys
import tempfile
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

import lider_direccion as LD

PAUSA_SEGUNDOS = 120
TOPE_CARACTERES_TROZO = 3500
TOPE_CARACTERES_AVISO = 12000
TOPE_ENTREGAS_DIA = 10
DESTINO_PERMITIDO = "telegram:Maggasukha"
TABLA_BUZON = "metagenesis_buzon"


def _leer_env():
    """Lee ~/.starseed/env y variables de entorno."""
    datos = {}
    ruta = os.path.expanduser("~/.starseed/env")
    try:
        with open(ruta, encoding="utf-8") as f:
            for linea in f:
                linea = linea.strip()
                if not linea or linea.startswith("#") or "=" not in linea:
                    continue
                if linea.startswith("export "):
                    linea = linea[7:]
                k, v = linea.split("=", 1)
                datos[k.strip()] = v.strip().strip('"').strip("'")
    except OSError:
        pass
    datos.update({k: v for k, v in os.environ.items() if k.startswith(("NEXT_PUBLIC_", "SUPABASE_"))})
    return datos


def _cliente_supabase():
    """Crea un cliente REST mínimo para Supabase."""
    env = _leer_env()
    url = (env.get("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/")
    clave = env.get("SUPABASE_SERVICE_ROLE_KEY") or ""
    if not url.startswith("https://") or not clave:
        return None
    return {"url": url, "clave": clave}


def _pedir_supabase(metodo, ruta, cuerpo=None):
    """Ejecuta una petición a Supabase REST API."""
    cliente = _cliente_supabase()
    if not cliente:
        return None, {"error": "sin credenciales"}
    cab = {
        "apikey": cliente["clave"],
        "Authorization": "Bearer " + cliente["clave"],
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    datos = json.dumps(cuerpo, ensure_ascii=False).encode("utf-8") if cuerpo is not None else None
    req = urllib.request.Request(cliente["url"] + ruta, data=datos, method=metodo, headers=cab)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            texto = r.read().decode("utf-8", "replace")
            return r.status, (json.loads(texto) if texto else None)
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode("utf-8", "replace") or "null")
        except ValueError:
            return e.code, None
    except Exception:
        return None, {"error": "error de red"}


# ─── funciones puras ─────────────────────────────────────────────────────────────────


def partir(texto: str, tope: int = TOPE_CARACTERES_TROZO) -> list[str]:
    """Parte el texto en trozos ≤ tope caracteres, por párrafos (separados por línea en blanco).

    Cada párrafo es un trozo independiente si cabe. Si un párrafo supera el tope, se corta duro.
    """
    if not texto:
        return []
    parrafos = [p.strip() for p in texto.split("\n\n") if p.strip()]
    if not parrafos:
        return []
    trozos = []
    for p in parrafos:
        if len(p) <= tope:
            trozos.append(p)
        else:
            # Párrafo más largo que el tope: cortar duro
            for i in range(0, len(p), tope):
                trozos.append(p[i : i + tope])
    return trozos


def destino_permitido(destino: str | None) -> bool:
    return destino == DESTINO_PERMITIDO


def _inicio_dia_utc(epoch: float) -> float:
    dt = datetime.fromtimestamp(epoch, tz=timezone.utc)
    return datetime(dt.year, dt.month, dt.day, tzinfo=timezone.utc).timestamp()


def contar_entregas_hoy(filas: list[dict], origen: str, ahora: float) -> int:
    """Cuenta filas con estado='entregado' del mismo origen en el día UTC actual."""
    inicio = _inicio_dia_utc(ahora)
    n = 0
    for f in filas:
        if f.get("de") != origen:
            continue
        if f.get("estado") != "entregado":
            continue
        t = f.get("t")
        if isinstance(t, (int, float)) and t >= inicio:
            n += 1
    return n


def validar_fila(fila: dict, filas_hoy: list[dict], ahora: float | None = None) -> tuple[bool, str]:
    """Valida una fila antes de entregarla. Devuelve (válido, motivo)."""
    if not isinstance(fila.get("texto"), str) or len(fila["texto"]) > TOPE_CARACTERES_AVISO:
        return False, f"texto supera {TOPE_CARACTERES_AVISO} caracteres"
    if not destino_permitido(fila.get("destino")):
        return False, "destino no está en lista blanca"
    if ahora is None:
        ahora = time.time()
    if contar_entregas_hoy(filas_hoy, fila.get("de", ""), ahora) >= TOPE_ENTREGAS_DIA:
        return False, f"tope de {TOPE_ENTREGAS_DIA} entregas/día alcanzado para este origen"
    return True, ""


def leer_freno_supabase() -> dict:
    """Lee el freno global de Supabase (tabla os_freno, id=1)."""
    estado, datos = _pedir_supabase("GET", "/rest/v1/os_freno?id=eq.1&select=activo,motivo,hasta")
    if estado == 200 and isinstance(datos, list) and datos:
        f = datos[0]
        return {"activo": bool(f.get("activo")), "motivo": f.get("motivo"), "hasta": f.get("hasta")}
    return {"activo": False}


def leer_avisos_pendientes(limite: int = 3) -> list[dict]:
    """Lee hasta `limite` avisos pendientes ordenados por t."""
    estado, datos = _pedir_supabase(
        "GET",
        f"/rest/v1/{TABLA_BUZON}?clase=eq.aviso&estado=eq.pendiente&order=t.asc&limit={limite}",
    )
    if estado == 200 and isinstance(datos, list):
        return datos
    return []


def marcar_entregado(fila_id: int, ahora: float | None = None) -> bool:
    if ahora is None:
        ahora = time.time()
    entregado_en = datetime.fromtimestamp(ahora, tz=timezone.utc).isoformat()
    estado, _ = _pedir_supabase(
        "PATCH",
        f"/rest/v1/{TABLA_BUZON}?id=eq.{fila_id}",
        {"estado": "entregado", "entregado_en": entregado_en},
    )
    return 200 <= estado < 300


def marcar_fallo(fila_id: int, detalle: str) -> bool:
    estado, _ = _pedir_supabase(
        "PATCH",
        f"/rest/v1/{TABLA_BUZON}?id=eq.{fila_id}",
        {"estado": "fallo", "detalle": detalle[:500]},
    )
    return 200 <= estado < 300


def entregar_por_hermes(asunto: str, texto: str) -> tuple[int, str]:
    """Entrega un trozo por `hermes send -t telegram:Maggasukha -s <asunto> -f <archivo temporal>`."""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False, encoding="utf-8") as f:
        f.write(texto)
        tmp = f.name
    try:
        rc, salida = LD.correr(
            ["hermes", "send", "-t", DESTINO_PERMITIDO, "-s", asunto, "-f", tmp],
            segundos=120,
        )
        return rc, salida
    finally:
        try:
            os.unlink(tmp)
        except OSError:
            pass


# ─── bucle principal ─────────────────────────────────────────────────────────────────


def pasada(ahora: float | None = None, una_vez: bool = False) -> int:
    """Una pasada de entrega. Devuelve número de avisos procesados."""
    if ahora is None:
        ahora = time.time()

    # Solo actúa si es líder
    lider = LD.soy_lider(ahora=ahora)
    if not lider.get("soy"):
        return 0

    # Respeta freno de Supabase
    freno = leer_freno_supabase()
    if freno.get("activo"):
        return 0

    # Lee avisos pendientes
    avisos = leer_avisos_pendientes()
    if not avisos:
        return 0

    # Para validar tope diario, necesitamos ver entregas de hoy
    # Leemos un poco más para contar
    estado, datos = _pedir_supabase(
        "GET",
        f"/rest/v1/{TABLA_BUZON}?clase=eq.aviso&estado=in.(entregado,fallo)&order=t.desc&limit=50",
    )
    filas_hoy = datos if estado == 200 and isinstance(datos, list) else []

    procesados = 0
    for aviso in avisos:
        valido, motivo = validar_fila(aviso, filas_hoy, ahora)
        if not valido:
            marcar_fallo(aviso["id"], motivo)
            continue

        trozos = partir(aviso["texto"])
        ok = True
        for i, trozo in enumerate(trozos):
            sub_asunto = f"{aviso['asunto']}" + (f" ({i+1}/{len(trozos)})" if len(trozos) > 1 else "")
            rc, salida = entregar_por_hermes(sub_asunto, trozo)
            if rc != 0:
                ok = False
                marcar_fallo(aviso["id"], f"hermes send falló: {salida[:200]}")
                break
        if ok:
            marcar_entregado(aviso["id"], ahora)
            procesados += 1

    return procesados


def main(argv=None) -> int:
    import argparse

    p = argparse.ArgumentParser(prog="buzon_telegram", description="Buzón MetaGenesis → Telegram")
    p.add_argument("--una-vez", action="store_true", help="hace una pasada y sale")
    args = p.parse_args(argv)

    if args.una_vez:
        pasada(una_vez=True)
        return 0

    while True:
        pasada()
        time.sleep(PAUSA_SEGUNDOS)


if __name__ == "__main__":
    sys.exit(main())