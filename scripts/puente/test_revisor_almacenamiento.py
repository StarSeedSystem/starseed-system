#!/usr/bin/env python3
"""Pruebas herméticas del revisor de almacenamiento (ALM1125C1)."""

from __future__ import annotations

import hashlib
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import revisor_almacenamiento as R


AHORA = 1_800_000_000.0
HOME = "/Mac"
RAIZ_REPO = "/Mac/starseed-os-main"
RAIZ_MEMORIA = "/Mac/starseed-os-main/starseed_memory_root"


class DiscoFalso:
    def __init__(self, existen, tamanos=None, mtimes=None, listados=None):
        self.existen = set(existen)
        self.tamanos = tamanos or {}
        self.mtimes = mtimes or {}
        self.listados = listados or {}

    def existe(self, ruta):
        return ruta in self.existen

    def tamano(self, ruta):
        return self.tamanos.get(ruta, 0)

    def mtime(self, ruta):
        return self.mtimes.get(ruta, AHORA)

    def listar(self, ruta):
        return self.listados.get(ruta, [])


def _candidatos(disco):
    return R.proponer_candidatos(
        home=HOME,
        raiz_repo=RAIZ_REPO,
        raiz_memoria=RAIZ_MEMORIA,
        ahora=AHORA,
        existe_fn=disco.existe,
        tamano_fn=disco.tamano,
        mtime_fn=disco.mtime,
        listar_fn=disco.listar,
    )


def test_solo_salen_caches_de_la_lista_cerrada():
    caches = os.path.join(HOME, "Library", "Caches")
    go_build = os.path.join(caches, "go-build")
    updater = os.path.join(caches, "electron-updater")
    prohibido = os.path.join(caches, "documents")
    disco = DiscoFalso(
        [go_build, updater, prohibido, os.path.join(HOME, ".ssh"), os.path.join(RAIZ_REPO, "CLAUDE.md")],
        tamanos={go_build: 1024 ** 3, updater: 2 * 1024 ** 3, prohibido: 3 * 1024 ** 3, os.path.join(HOME, ".ssh"): 4 * 1024 ** 3, os.path.join(RAIZ_REPO, "CLAUDE.md"): 5 * 1024 ** 3},
        listados={caches: ["go-build", "electron-updater", "documents", "../../.ssh"]},
    )

    rutas = {candidato["ruta"] for candidato in _candidatos(disco)}

    assert rutas == {go_build, updater}


def test_compilaciones_y_registros_antiguos_cumplen_el_contrato():
    native = os.path.join(RAIZ_REPO, "native", "src-tauri", "target")
    anterior = os.path.join(RAIZ_REPO, ".next-anterior")
    temporal = os.path.join(RAIZ_MEMORIA, ".tmp.driveupload")
    logs = os.path.join(RAIZ_MEMORIA, "olas", "logs")
    disco = DiscoFalso(
        [native, anterior, temporal, logs],
        tamanos={native: 3 * 1024 ** 3, anterior: 2 * 1024 ** 3, temporal: 1024 ** 3, logs: 4 * 1024 ** 3},
        mtimes={temporal: AHORA - 25 * 3600, logs: AHORA - 8 * 86400},
    )

    por_ruta = {candidato["ruta"]: candidato for candidato in _candidatos(disco)}

    assert set(por_ruta) == {native, anterior, temporal, logs}
    assert por_ruta[temporal]["accion"] == "borrar"
    assert por_ruta[temporal]["regenerable"] is True
    assert por_ruta[logs]["accion"] == "trasladar:maggabox"
    assert por_ruta[logs]["regenerable"] is False
    assert por_ruta[logs]["otra_copia"] == "maggabox"
    for candidato in por_ruta.values():
        assert set(candidato) == {"id", "ruta", "gb", "porque", "regenerable", "otra_copia", "accion"}
        assert candidato["id"] == hashlib.sha1(candidato["ruta"].encode("utf-8")).hexdigest()[:12]
        assert candidato["gb"] > 0


def test_temporales_recientes_no_son_candidatos():
    temporal = os.path.join(RAIZ_MEMORIA, ".tmp.driveupload")
    logs = os.path.join(RAIZ_MEMORIA, "olas", "logs")
    disco = DiscoFalso(
        [temporal, logs],
        tamanos={temporal: 1024 ** 3, logs: 4 * 1024 ** 3},
    )

    assert _candidatos(disco) == []


def test_ruta_permitida_acepta_solo_la_lista_cerrada():
    caches = os.path.join(HOME, "Library", "Caches")

    assert R.ruta_permitida(os.path.join(caches, "go-build"), HOME, RAIZ_REPO, RAIZ_MEMORIA)
    assert R.ruta_permitida(os.path.join(caches, "electron-updater"), HOME, RAIZ_REPO, RAIZ_MEMORIA)
    assert not R.ruta_permitida(RAIZ_REPO, HOME, RAIZ_REPO, RAIZ_MEMORIA)
    assert not R.ruta_permitida(os.path.join(HOME, ".ssh"), HOME, RAIZ_REPO, RAIZ_MEMORIA)
