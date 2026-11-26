# -*- coding: utf-8 -*-
"""ALM1125G · `aliviar` reconoce los árboles reales y respeta `progreso.json`.

Hermético: rutas falsas y estados inyectados; no toca red, disco real ni la Mac.
La costura es `_es_candidato_aliviar`, función pura: (ruta, estados) → (sí/no, porqué).
"""
from __future__ import annotations

import os
import sys
from typing import Any, Dict

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import respaldo_maggabox as R  # noqa: E402

DOCS = os.path.expanduser("~/Documents")

#: Los tres formatos que hay de verdad en la Mac: id de tarea en cada uno.
ARBOLES = [
    (os.path.join(DOCS, "starseed-wt-ALM1125G"), "ALM1125G"),
    (os.path.join(DOCS, "starseed-wt", "ALM1125G"), "ALM1125G"),
    (os.path.join(DOCS, "wt-algo"), "algo"),
]

#: Entradas de progreso.json que conservan el árbol: la tarea aún puede usarlo.
VIVAS = [
    {"estado": "pendiente"},
    {"estado": "en_curso"},
    {"estado": "en marcha"},
    {"estado": "reasignada"},
    {"estado": "integrada", "medio": "nube"},
    {"estado": "integrada-sin-traer"},
]


@pytest.mark.parametrize("ruta,tid", ARBOLES)
@pytest.mark.parametrize("entrada", VIVAS)
def test_arbol_de_tarea_viva_no_es_candidato(ruta: str, tid: str, entrada: Dict[str, Any]) -> None:
    """Pendiente, en curso, reasignada o integrada · nube (sin traer) bloquean el árbol."""
    ok, motivo = R._es_candidato_aliviar(ruta, {tid: entrada})
    assert ok is False
    assert tid in motivo


@pytest.mark.parametrize("ruta,tid", ARBOLES)
@pytest.mark.parametrize("entrada", [
    {"estado": "commit"},
    {"estado": "integrada"},
    {"estado": "hecho"},
    {"estado": "no_aplica"},
])
def test_arbol_terminado_es_candidato(ruta: str, tid: str, entrada: Dict[str, Any]) -> None:
    """Con la tarea cerrada (integrada en main no es «sin traer»), el árbol se puede mover."""
    ok, motivo = R._es_candidato_aliviar(ruta, {tid: entrada})
    assert ok is True
    assert "worktree" in motivo


def test_sin_entrada_en_progreso_es_candidato() -> None:
    """Un árbol viejo sin fila en progreso.json es justo lo que hay que aliviar."""
    ok, _ = R._es_candidato_aliviar(os.path.join(DOCS, "starseed-wt", "VIEJO"), {})
    assert ok is True


def test_acepta_estado_suelto_no_solo_la_entrada_de_progreso() -> None:
    """La inyección vale con `{id: «pendiente»}` y con `{id: {estado: …}}`."""
    ok, _ = R._es_candidato_aliviar(os.path.join(DOCS, "wt-algo"), {"algo": "pendiente"})
    assert ok is False


def test_cola_activa_sigue_bloqueando() -> None:
    """La protección de siempre se mantiene aunque no haya entrada en progreso.json."""
    ok, motivo = R._es_candidato_aliviar(os.path.join(DOCS, "wt-algo"), {}, cola_activa_ids={"algo"})
    assert ok is False
    assert "cola activa" in motivo


@pytest.mark.parametrize("ruta", [
    os.path.join(DOCS, "starseed-wt", "X1", ".git"),
    os.path.join(DOCS, "starseed-wt", "X1", ".env.local"),
    os.path.join(DOCS, "starseed-wt", "X1", "clave.pem"),
    os.path.join(DOCS, "starseed_memory_root", "olas"),
])
def test_lista_negra_no_cambia(ruta: str) -> None:
    """Nada de claves, .env, .git ni la memoria raíz, aunque parezca un árbol."""
    ok, motivo = R._es_candidato_aliviar(ruta, {})
    assert ok is False
    assert "lista negra" in motivo


def test_escanear_encuentra_los_tres_formatos_y_filtra_los_vivos() -> None:
    """El barrido de `aliviar` usa la misma decisión: tres formas, vivos fuera."""
    wt_root = os.path.join(DOCS, "starseed-wt")
    nuevo = os.path.join(wt_root, "NUEVA")
    viejo = os.path.join(wt_root, "starseed-wt-VIEJA")
    suelto = os.path.join(DOCS, "wt-suelto")
    suelto_ok = os.path.join(DOCS, "wt-viejo")
    viva = os.path.join(wt_root, "VIVA")
    dirs = {wt_root, DOCS, nuevo, viejo, suelto, suelto_ok, viva}
    entradas = {wt_root: ["NUEVA", "starseed-wt-VIEJA", "VIVA"],
                DOCS: ["wt-suelto", "wt-viejo", "otra-cosa"]}
    candidatos = R.escanear_candidatos(
        mac_root=os.path.join(DOCS, "repo"), wt_root=wt_root,
        downloads=os.path.join(DOCS, "Descargas"), memoria_root=os.path.join(DOCS, "mem"),
        cola_activa_ids=set(), existe_fn=lambda p: p in dirs,
        es_directorio_fn=lambda p: p in dirs, listar_fn=lambda p: entradas.get(p, []),
        mtime_fn=lambda p: 0.0, tamano_fn=lambda p: 1024 ** 3,
        estados={"VIVA": {"estado": "en_curso"}, "suelto": {"estado": "pendiente"}},
    )
    rutas = {c["ruta"] for c in candidatos}
    assert nuevo in rutas and viejo in rutas and suelto_ok in rutas
    assert suelto not in rutas and viva not in rutas
