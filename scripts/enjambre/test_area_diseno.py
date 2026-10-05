#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Prueba del área `diseno` en AREAS_CONTEXTO (DIS1005H, Ola 1005D).

Importlib porque `starseed-enjambre.py` lleva guiones; `EVENTOS` a tmp y `ANON`
a "" para no tocar Supabase ni el bus, igual que `test_claves.py`.
"""
import importlib.util
import os
import sys

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre", RUTA)
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules["enjambre"] = enjambre
ESPEC.loader.exec_module(enjambre)


def test_diseno_activa_con_palabras_de_interfaz(monkeypatch, tmp_path):
    monkeypatch.setattr(enjambre, "EVENTOS",
                        str(tmp_path / "eventos.jsonl"))
    monkeypatch.setattr(enjambre, "ANON", "")
    tarea = {
        "id": "TG1",
        "titulo": "Rediseño del panel de ajustes",
        "prompt": "Mejorar la interfaz del panel: diseño, ui, componente, estilo, tema, tailwind, responsive, animación",
        "archivos": ["src/app/ajustes/page.tsx"],
    }
    contexto = enjambre.contexto_inteligente(tarea)
    assert "diseno" in contexto or any("diseno" in a for a in contexto.split("\n") if "ÁREA" in a)
    # Verifica que la memoria de diseño está referenciada.
    assert any(d in contexto for d in [
        "memory/diseno/identidades.md",
        "memory/diseno/armonia.md",
        "memory/diseno/referencias.md",
    ])


def test_diseno_no_activa_con_tarea_de_cerrojo(monkeypatch, tmp_path):
    monkeypatch.setattr(enjambre, "EVENTOS",
                        str(tmp_path / "eventos.jsonl"))
    monkeypatch.setattr(enjambre, "ANON", "")
    tarea = {
        "id": "TG2",
        "titulo": "arreglar el cerrojo del progreso",
        "prompt": "El progreso se bloquea si una tarea dependiente no tiene commit en main; arreglar el cerrojo.",
        "archivos": ["scripts/enjambre/starseed-enjambre.py"],
    }
    contexto = enjambre.contexto_inteligente(tarea)
    # El área `diseno` no debe aparecer para esta tarea técnica.
    lineas_area = [l for l in contexto.split("\n") if l.startswith("ÁREA:")]
    assert all("diseno" not in l for l in lineas_area)
