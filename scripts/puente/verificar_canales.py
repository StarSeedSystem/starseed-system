#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Verificación de punta a punta de los canales de dirección (DIR1121 · parte 2).

Por cada canal publica UN mensaje marcado («[prueba de sincronía]»), espera y comprueba
medio por medio si llegó: registro del canal, sesión de Hermes, Telegram (getUpdates o
registro del bot), bandejas de Antigravity y Claude Cowork, sesiones de Codex y panel de
MetaGenesis. Deja la tabla canal × medio en `mando/director/verificacion-canales.json`.

Nunca imprime ni guarda claves, tokens ni la dirección del A1. Los lectores se inyectan:
las pruebas no tocan la red ni la carpeta real del Chat Director.
"""
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
import time
import uuid
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Optional, Union

AQUI = os.path.dirname(os.path.abspath(__file__))
if AQUI not in sys.path:
    sys.path.insert(0, AQUI)

import director_chat
import sincronizador_direccion as SD

CANALES = ("principal", "general", "audiovisual")
MEDIOS = ("registro", "hermes", "telegram", "antigravity", "codex", "claude-cowork", "metagenesis")
MARCA = "[prueba de sincronía]"
LLEGA = "llega"
NO_LLEGA = "no llega"
NO_COMPROBABLE = "no comprobable"
ARCHIVO_CANAL = {"principal": "chat.jsonl", "general": "general.jsonl", "audiovisual": "audiovisual.jsonl"}
SALIDA = "verificacion-canales.json"
LOG_BOT = "~/.starseed/peticiones/audiovisual-sync.jsonl"


def _resultado(llego: Optional[bool], motivo: str) -> Dict[str, Any]:
    return {"llega": llego, "motivo": str(motivo)}


def _sin_datos(motivo: str) -> Dict[str, Any]:
    return _resultado(None, motivo)


def sello(canal: str, ahora: Optional[float] = None) -> str:
    return "%s-%d-%s" % (canal[:3], int(ahora or time.time()), uuid.uuid4().hex[:6])


def mensaje_de_prueba(canal: str, nombre: str, marca_id: str) -> str:
    return "%s «%s» · verificación %s" % (MARCA, nombre, marca_id)


def _leer_jsonl(ruta: Path) -> List[Dict[str, Any]]:
    ruta = Path(ruta)
    if not ruta.exists():
        return []
    salida: List[Dict[str, Any]] = []
    try:
        for linea in ruta.read_text(encoding="utf-8", errors="replace").splitlines():
            if not linea.strip():
                continue
            try:
                reg = json.loads(linea)
            except json.JSONDecodeError:
                continue
            if isinstance(reg, dict):
                salida.append(reg)
    except OSError:
        return []
    return salida


def _contiene(registros: Iterable[Dict[str, Any]], aguja: str) -> bool:
    return any(aguja in str(r.get("texto") or r.get("id") or "") for r in registros)


def tabla(canales: Iterable[str], medios: Iterable[str],
          lecturas: Dict[str, Dict[str, Dict[str, Any]]]) -> List[Dict[str, Any]]:
    filas: List[Dict[str, Any]] = []
    for canal in canales:
        for medio in medios:
            dato = (lecturas.get(medio) or {}).get(canal) or {}
            llego = dato.get("llega") if isinstance(dato, dict) else None
            if llego is True:
                estado = LLEGA
            elif llego is False:
                estado = NO_LLEGA
            else:
                estado = NO_COMPROBABLE
            filas.append({
                "canal": canal,
                "medio": medio,
                "estado": estado,
                "motivo": str((dato or {}).get("motivo") or "sin lectura"),
            })
    return filas


def resumen(filas: List[Dict[str, Any]]) -> Dict[str, int]:
    cuenta = {LLEGA: 0, NO_LLEGA: 0, NO_COMPROBABLE: 0}
    for fila in filas:
        estado = fila.get("estado") if isinstance(fila, dict) else None
        cuenta[estado if estado in cuenta else NO_COMPROBABLE] += 1
    return {
        "llega": cuenta[LLEGA],
        "no llega": cuenta[NO_LLEGA],
        "no comprobable": cuenta[NO_COMPROBABLE],
        "total": len(filas),
    }


def leer_registro(canal: str, aguja: str, raiz: Optional[Path] = None) -> Dict[str, Any]:
    ruta = director_chat._directorio(raiz) / ARCHIVO_CANAL.get(canal, "chat.jsonl")
    if not ruta.exists():
        return _sin_datos("sin registro del canal")
    return _resultado(_contiene(_leer_jsonl(ruta), aguja), "registro del canal")


def leer_bandeja(medio: str, aguja: str, raiz: Optional[Path] = None) -> Dict[str, Any]:
    ruta = director_chat._directorio(raiz) / "bandeja" / ("%s.jsonl" % medio)
    if not ruta.exists():
        return _sin_datos("sin bandeja de %s" % medio)
    return _resultado(_contiene(_leer_jsonl(ruta), aguja), "bandeja de %s" % medio)


def leer_hermes(canal: str, aguja: str, canales_cfg: Optional[Dict[str, Any]] = None,
                db_path: Optional[Union[str, Path]] = None) -> Dict[str, Any]:
    cfg = canales_cfg if canales_cfg is not None else SD.cargar_canales_direccion()
    sid = str((cfg.get(canal) or {}).get("hermes_sesion") or "").strip()
    if not sid:
        return _sin_datos("el registro no fija sesión de Hermes")
    ruta = Path(os.path.expanduser(db_path or SD.DB_HERMES_DEFECTO))
    if not ruta.exists():
        return _sin_datos("sin base de Hermes")
    try:
        con = sqlite3.connect("file:%s?mode=ro" % ruta, uri=True, timeout=2.0)
        try:
            fila = con.execute(
                "SELECT 1 FROM messages WHERE session_id = ? AND content LIKE ? LIMIT 1",
                (sid, "%" + aguja + "%"),
            ).fetchone()
        finally:
            con.close()
    except sqlite3.Error:
        return _sin_datos("no se pudo leer la base de Hermes")
    return _resultado(fila is not None, "sesión de Hermes")


def leer_telegram(canal: str, aguja: str, updates: Optional[List[Dict[str, Any]]] = None,
                  log_bot: Optional[Union[str, Path]] = None,
                  envio: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    if log_bot:
        ruta = Path(os.path.expanduser(log_bot))
        if ruta.exists():
            return _resultado(_contiene(_leer_jsonl(ruta), aguja), "registro del bot")
    if isinstance(envio, dict) and envio.get("telegram_ok") is not None:
        return _resultado(bool(envio.get("telegram_ok")), "envío del bot")
    if updates is not None:
        textos = []
        for upd in updates:
            msg = upd.get("message") or upd.get("edited_message") or {}
            textos.append(str(msg.get("text") or msg.get("caption") or ""))
        return _resultado(any(aguja in t for t in textos), "getUpdates")
    return _sin_datos("sin getUpdates ni registro del bot")


def leer_codex(aguja: str, sessions_dir: Optional[Union[str, Path]] = None) -> Dict[str, Any]:
    base = Path(os.path.expanduser(sessions_dir or "~/.codex/sessions"))
    if not base.is_dir():
        return _sin_datos("sin sesiones de Codex")
    try:
        archivos = sorted(base.rglob("rollout-*.jsonl"),
                          key=lambda p: p.stat().st_mtime, reverse=True)[:20]
    except OSError:
        return _sin_datos("sin sesiones de Codex")
    for archivo in archivos:
        try:
            if aguja in archivo.read_text(encoding="utf-8", errors="replace"):
                return _resultado(True, "sesión de Codex")
        except OSError:
            continue
    return _resultado(False, "no aparece en las sesiones recientes de Codex")


def leer_metagenesis(canal: str, aguja: str, raiz: Optional[Path] = None) -> Dict[str, Any]:
    ruta = director_chat._raiz(raiz) / "starseed_memory_root" / "mando" / "canal.jsonl"
    if not ruta.exists():
        return _sin_datos("sin canal común del panel")
    return _resultado(_contiene(_leer_jsonl(ruta), aguja), "panel de MetaGenesis")


def preparar_pruebas(canales: Iterable[str] = CANALES,
                     sello_fn: Optional[Callable[[str], str]] = None) -> Dict[str, Dict[str, str]]:
    generar = sello_fn or sello
    pruebas: Dict[str, Dict[str, str]] = {}
    for canal in canales:
        marca_id = generar(canal)
        pruebas[canal] = {
            "id": marca_id,
            "texto": mensaje_de_prueba(canal, SD.nombre_de_canal(canal), marca_id),
        }
    return pruebas


def ejecutar(publicar_fn: Callable[[str, str], Any], lectores: Dict[str, Callable[[str, str], Dict[str, Any]]],
             canales: Iterable[str] = CANALES, medios: Optional[Iterable[str]] = None,
             sello_fn: Optional[Callable[[str], str]] = None, espera: float = 0.0,
             dormir: Callable[[float], Any] = time.sleep,
             pruebas: Optional[Dict[str, Dict[str, str]]] = None) -> List[Dict[str, Any]]:
    canales = tuple(canales)
    medios = tuple(medios if medios is not None else lectores.keys())
    pruebas = pruebas if pruebas is not None else preparar_pruebas(canales, sello_fn)
    for canal in canales:
        publicar_fn(canal, pruebas[canal]["texto"])
    if espera > 0:
        dormir(espera)
    lecturas: Dict[str, Dict[str, Dict[str, Any]]] = {}
    for medio in medios:
        lector = lectores.get(medio)
        lecturas[medio] = {}
        for canal in canales:
            if lector is None:
                lecturas[medio][canal] = _sin_datos("lector no disponible")
                continue
            try:
                lecturas[medio][canal] = lector(canal, pruebas[canal]["id"])
            except Exception as err:
                lecturas[medio][canal] = _sin_datos("lector falló: %s" % type(err).__name__)
    return tabla(canales, medios, lecturas)


def informe(filas: List[Dict[str, Any]], pruebas: Optional[Dict[str, Dict[str, str]]] = None,
            ahora: Optional[float] = None) -> Dict[str, Any]:
    return {
        "generado": time.strftime("%Y-%m-%dT%H:%M:%S%z", time.localtime(ahora)),
        "marca": MARCA,
        "pruebas": pruebas or {},
        "resumen": resumen(filas),
        "tabla": filas,
    }


def guardar_informe(datos: Dict[str, Any], raiz: Optional[Path] = None) -> Path:
    ruta = director_chat._directorio(raiz) / SALIDA
    ruta.parent.mkdir(parents=True, exist_ok=True)
    tmp = ruta.with_name(ruta.name + ".tmp")
    tmp.write_text(json.dumps(datos, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    os.replace(tmp, ruta)
    return ruta


def _publicar_de_verdad(canal: str, texto: str, enviar_telegram: bool = True) -> Any:
    if director_chat.en_pruebas():
        return {"ok": False, "detalle": "publicación desactivada en pruebas"}
    return SD.publicar_en_canal_especializado(
        canal, texto, de="metagenesis", origen="metagenesis",
        enviar_telegram=enviar_telegram)


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(prog="verificar_canales")
    parser.add_argument("--espera", type=float, default=20.0)
    parser.add_argument("--canal", choices=CANALES, action="append", dest="canales")
    parser.add_argument("--sin-telegram", action="store_true")
    parser.add_argument("--simular", action="store_true")
    args = parser.parse_args(argv)
    canales = tuple(args.canales or CANALES)
    pruebas = preparar_pruebas(canales)
    if args.simular:
        for canal, prueba in pruebas.items():
            print("%s: %s" % (canal, prueba["texto"]))
        return 0
    log_bot = os.path.expanduser(LOG_BOT)
    cfg = SD.cargar_canales_direccion()
    publicaciones: Dict[str, Dict[str, Any]] = {}

    def publicar(canal: str, texto: str) -> Any:
        publicaciones[canal] = _publicar_de_verdad(canal, texto, not args.sin_telegram)
        return publicaciones[canal]

    def telegram(canal: str, aguja: str) -> Dict[str, Any]:
        if args.sin_telegram:
            return _sin_datos("verificación de Telegram desactivada")
        return leer_telegram(
            canal, aguja,
            log_bot=log_bot if canal == "audiovisual" else None,
            envio=publicaciones.get(canal),
        )

    lectores: Dict[str, Callable[[str, str], Dict[str, Any]]] = {
        "registro": lambda c, a: leer_registro(c, a),
        "hermes": lambda c, a: leer_hermes(c, a, cfg),
        "telegram": telegram,
        "antigravity": lambda c, a: leer_bandeja("antigravity", a),
        "codex": lambda c, a: leer_codex(a),
        "claude-cowork": lambda c, a: leer_bandeja("claude-cowork", a),
        "metagenesis": lambda c, a: leer_metagenesis(c, a),
    }
    filas = ejecutar(publicar, lectores, canales=canales,
                     espera=args.espera, pruebas=pruebas)
    datos = informe(filas, pruebas)
    ruta = guardar_informe(datos)
    print(json.dumps({"resumen": datos["resumen"], "ruta": str(ruta)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
