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


def test_debe_avisar_una_vez_al_dia_y_por_umbral():
    lleno = [{"discoLibreGb": 50, "discoTotalGb": 100}]
    bajo = [{"discoLibreGb": 5, "discoTotalGb": 100}]
    assert R.debe_avisar(2.0, lleno, AHORA, 0)
    assert not R.debe_avisar(0.5, lleno, AHORA, 0)
    assert R.debe_avisar(0.5, bajo, AHORA, 0)
    assert not R.debe_avisar(2.0, bajo, AHORA, AHORA - 3600)
    assert R.debe_avisar(2.0, bajo, AHORA, AHORA - 25 * 3600)


def test_aprobacion_exige_alex_y_ruta_cerrada():
    caches = os.path.join(HOME, "Library", "Caches")
    permitido = {"id": "a" * 12, "ruta": os.path.join(caches, "go-build"), "accion": "borrar", "gb": 2.0}
    fuera = {"id": "b" * 12, "ruta": os.path.join(HOME, ".ssh"), "accion": "borrar", "gb": 2.0}
    assert R.aprobacion_valida(permitido["id"], [{"id": permitido["id"], "aprobado_por": "alex"}], [permitido], HOME, RAIZ_REPO, RAIZ_MEMORIA) == permitido
    assert R.aprobacion_valida(permitido["id"], [{"id": permitido["id"], "aprobado_por": "otro"}], [permitido], HOME, RAIZ_REPO, RAIZ_MEMORIA) is None
    assert R.aprobacion_valida(fuera["id"], [{"id": fuera["id"], "aprobado_por": "alex"}], [fuera], HOME, RAIZ_REPO, RAIZ_MEMORIA) is None
    assert R.aprobacion_valida("c" * 12, [{"id": "c" * 12, "aprobado_por": "alex"}], [permitido], HOME, RAIZ_REPO, RAIZ_MEMORIA) is None


def test_proponer_escribe_y_avisa_una_vez_al_dia():
    caches = os.path.join(HOME, "Library", "Caches")
    go_build = os.path.join(caches, "go-build")
    disco = DiscoFalso([go_build], tamanos={go_build: 2 * 1024 ** 3})
    escritos, publicados = {}, []

    def leer(ruta):
        return escritos.get(ruta)

    def escribir(ruta, datos):
        escritos[ruta] = datos

    res = R.proponer(AHORA, HOME, RAIZ_REPO, RAIZ_MEMORIA, disco.existe, disco.tamano,
                     disco.mtime, disco.listar, leer, escribir, publicados.append)
    assert res == {"total_gb": 2.0, "candidatos": 1, "avisado": True}
    assert escritos[R.RUTA_PROPUESTA]["total_gb"] == 2.0
    assert len(publicados) == 1 and "propuestas" in publicados[0]

    res2 = R.proponer(AHORA + 3600, HOME, RAIZ_REPO, RAIZ_MEMORIA, disco.existe, disco.tamano,
                      disco.mtime, disco.listar, leer, escribir, publicados.append)
    assert res2["avisado"] is False and len(publicados) == 1


def test_aplicar_solo_lo_aprobado_y_no_borra_sin_copia():
    caches = os.path.join(HOME, "Library", "Caches")
    go_build = os.path.join(caches, "go-build")
    logs = os.path.join(RAIZ_MEMORIA, "olas", "logs")
    anterior = os.path.join(RAIZ_REPO, ".next-anterior")
    borrar = {"id": "a" * 12, "ruta": go_build, "accion": "borrar", "gb": 2.0, "regenerable": True, "otra_copia": False}
    mover = {"id": "b" * 12, "ruta": logs, "accion": "trasladar:maggabox", "gb": 3.0, "regenerable": False, "otra_copia": "maggabox"}
    inseguro = {"id": "c" * 12, "ruta": anterior, "accion": "borrar", "gb": 4.0, "regenerable": False, "otra_copia": False}
    archivos = {R.RUTA_PROPUESTA: {"candidatos": [borrar, mover, inseguro]}}
    anotadas, borrados = [], []

    def leer(ruta):
        return archivos.get(ruta)

    def anotar(ruta, linea):
        anotadas.append((ruta, linea))

    sin_aprobar = R.aplicar(borrar["id"], AHORA, HOME, RAIZ_REPO, RAIZ_MEMORIA, leer, anotar, borrados.append, lambda r: {"verificado": False})
    assert sin_aprobar["aplicado"] is False and borrados == [] and anotadas == []

    archivos[R.RUTA_APROBADAS] = [{"id": borrar["id"], "aprobado_por": "alex"}]
    res = R.aplicar(borrar["id"], AHORA, HOME, RAIZ_REPO, RAIZ_MEMORIA, leer, anotar, borrados.append, lambda r: {"verificado": False})
    assert res["aplicado"] is True and borrados == [go_build]
    assert anotadas[0][0] == R.RUTA_APLICADAS and anotadas[0][1]["id"] == borrar["id"]

    archivos[R.RUTA_APROBADAS] = [{"id": inseguro["id"], "aprobado_por": "alex"}]
    res = R.aplicar(inseguro["id"], AHORA, HOME, RAIZ_REPO, RAIZ_MEMORIA, leer, anotar, borrados.append, lambda r: {"verificado": False})
    assert res["aplicado"] is False and borrados == [go_build] and len(anotadas) == 1

    archivos[R.RUTA_APROBADAS] = [{"id": mover["id"], "aprobado_por": "alex"}]
    res = R.aplicar(mover["id"], AHORA, HOME, RAIZ_REPO, RAIZ_MEMORIA, leer, anotar, borrados.append, lambda r: {"verificado": False, "estado": "error_verificacion"})
    assert res["aplicado"] is False and len(anotadas) == 1

    res = R.aplicar(mover["id"], AHORA, HOME, RAIZ_REPO, RAIZ_MEMORIA, leer, anotar, borrados.append, lambda r: {"verificado": True, "estado": "movido"})
    assert res["aplicado"] is True and len(anotadas) == 2 and borrados == [go_build]
