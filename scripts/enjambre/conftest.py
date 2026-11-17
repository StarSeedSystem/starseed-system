# -*- coding: utf-8 -*-
"""Fixture hermético (autouse) para aislar EVENTOS, ANON, HERMES y RELEVO."""
import collections
import importlib.util
import shutil
import sys
from pathlib import Path
import pytest

# TMP1113B: una raíz temporal propia por corrida, quitada al salir (módulo de scripts/puente, ver raiz_pruebas.py).
_PUENTE = str(Path(__file__).resolve().parent.parent / "puente")
if _PUENTE not in sys.path:
    sys.path.append(_PUENTE)
import raiz_pruebas as _raiz_pruebas  # noqa: E402

_raiz_pruebas.abrir()

# Ruta al módulo real del orquestador (puede cargarse con nombres distintos).
RUTA_ENJAMBRE = Path(__file__).parent / "starseed-enjambre.py"


@pytest.fixture(autouse=True)
def aislador_hermetico(monkeypatch, tmp_path):
    """Parchea EVENTOS, ANON, HERMES y RELEVO en todo módulo importado como enjambre."""
    # GUA1113A: el estado del freno de disco (y su evidencia) jamás sale de la carpeta temporal.
    monkeypatch.setenv("STARSEED_DISCO_DIR", str(tmp_path / "disco-hermetico"))
    # PUB1117A: la batería no depende del disco real de la máquina. Todo el espacio libre que lea cualquier
    # módulo (el freno FRENO, el vigía del worktree, estado()) sale de un disco falso y holgado, así ni el
    # cerrojo «pesado» espera al freno con poco disco ni el vigía dispara «el disco bajó a…». Se parchea
    # `shutil.disk_usage` y no cada módulo porque cada prueba carga guardia_disco.py con importlib bajo un nombre
    # distinto (hay varias instancias) y todas comparten el mismo `shutil`. Una prueba que inyecta su propio
    # lector (libre_fn) o parchea `shutil.disk_usage` con monkeypatch/patch.object lo hace DESPUÉS y lo pisa.
    _uso = collections.namedtuple("usage", "total used free")(500 * 1024 ** 3, 300 * 1024 ** 3, 200 * 1024 ** 3)
    monkeypatch.setattr(shutil, "disk_usage", lambda *_a, **_k: _uso)
    # PUB1117A: ni la «ronda de aparatos» real (scripts/puente/ronda.py lee ~/.starseed/produccion) ni los
    # cerrojos reales de la máquina: estado vacío en la carpeta temporal de la prueba.
    monkeypatch.setenv("STARSEED_PRODUCCION_DIR", str(tmp_path / "produccion-hermetico"))
    monkeypatch.setenv("STARSEED_CERROJOS_DIR", str(tmp_path / "cerrojos-hermetico"))
    # Detecta cualquier módulo en sys.modules cuyo archivo sea el orquestador.
    for nombre, mod in list(sys.modules.items()):
        archivo = getattr(mod, "__file__", None)
        if archivo and str(Path(archivo).resolve()) == str(RUTA_ENJAMBRE.resolve()):
            # Aísla EVENTOS a tmp_path (archivo de eventos falso).
            eventos_falso = tmp_path / "eventos.jsonl"
            eventos_falso.write_text("", encoding="utf-8")
            monkeypatch.setattr(mod, "EVENTOS", str(eventos_falso), raising=False)
            # Aísla ANON: sin clave no hay POST al bus de Supabase.
            monkeypatch.setattr(mod, "ANON", "", raising=False)
            # Aísla HERMES y RELEVO: binario inocuo para evitar lanzamientos reales.
            monkeypatch.setattr(mod, "HERMES", "/usr/bin/true", raising=False)
            monkeypatch.setattr(mod, "RELEVO", "/usr/bin/true", raising=False)
            # (PDA1011) Sin puerta de datos: ninguna prueba publica en el A1 de verdad.
            monkeypatch.setattr(mod, "_PUERTA_BUS", [None], raising=False)
