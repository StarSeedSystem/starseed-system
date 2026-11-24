#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PRU1124A · Pruebas del manejo grácil de batería ausente.

Verifica que los subcomandos listar/siguiente/empezar/evaluar/informe
imprimen mensaje claro y salen con código 1 en lugar de reventar
con FileNotFoundError cuando falta bateria-1118.json.
"""
import json
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pruebas_malla as PM  # noqa: E402


class TestBateriaAusente:
    """Comportamiento cuando falta starseed_memory_root/pruebas/bateria-1118.json."""

    def setup_method(self):
        # Guardar rutas originales
        self.orig_bateria = PM.BATERIA_JSON
        self.orig_registro = PM.REGISTRO_JSONL
        self.orig_evidencias = PM.EVIDENCIAS_DIR
        self.orig_mac_logs = PM.MAC_LOGS

        # Crear directorio temporal aislado
        self.tmpdir = Path(tempfile.mkdtemp(prefix="pru1124a_"))
        self.nueva_bateria = self.tmpdir / "bateria-1118.json"
        self.nuevo_registro = self.tmpdir / "registro.jsonl"
        self.nuevas_evidencias = self.tmpdir / "evidencias"
        self.nuevos_mac_logs = self.tmpdir / "mac_logs"

        # Parchear las constantes del módulo
        PM.BATERIA_JSON = self.nueva_bateria
        PM.REGISTRO_JSONL = self.nuevo_registro
        PM.EVIDENCIAS_DIR = self.nuevas_evidencias
        PM.MAC_LOGS = self.nuevos_mac_logs

    def teardown_method(self):
        # Restaurar constantes originales
        PM.BATERIA_JSON = self.orig_bateria
        PM.REGISTRO_JSONL = self.orig_registro
        PM.EVIDENCIAS_DIR = self.orig_evidencias
        PM.MAC_LOGS = self.orig_mac_logs

        # Limpiar temporal
        import shutil
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_cargar_bateria_lanza_excepcion_clara(self):
        """cargar_bateria() lanza BateriaNoEncontrada con mensaje útil."""
        with pytest.raises(PM.BateriaNoEncontrada) as exc:
            PM.cargar_bateria()
        assert "Batería no encontrada" in str(exc.value)
        assert "generar_bateria_1118.py" in str(exc.value) or "plantilla" in str(exc.value)

    def test_cmd_listar_sin_bateria_imprime_mensaje_y_retorna_1(self, capsys):
        """listar sin batería imprime mensaje y retorna 1 (no explode)."""
        args = type("Args", (), {"bloque": None, "ronda": None})()
        rc = PM.cmd_listar(args)
        out = capsys.readouterr().out
        assert rc == 1
        assert "Batería no encontrada" in out
        assert "generar_bateria_1118.py" in out or "plantilla" in out

    def test_cmd_siguiente_sin_bateria_imprime_mensaje_y_retorna_1(self, capsys):
        """siguiente sin batería imprime mensaje y retorna 1."""
        args = type("Args", (), {})()
        rc = PM.cmd_siguiente(args)
        out = capsys.readouterr().out
        assert rc == 1
        assert "Batería no encontrada" in out

    def test_cmd_empezar_sin_bateria_imprime_mensaje_y_retorna_1(self, capsys):
        """empezar sin batería imprime mensaje y retorna 1."""
        args = type("Args", (), {"id": "B1-MT-A1"})()
        rc = PM.cmd_empezar(args)
        out = capsys.readouterr().out
        assert rc == 1
        assert "Batería no encontrada" in out

    def test_cmd_evaluar_sin_bateria_imprime_mensaje_y_retorna_1(self, capsys):
        """evaluar sin batería imprime mensaje y retorna 1."""
        args = type("Args", (), {"id": "B1-MT-A1"})()
        rc = PM.cmd_evaluar(args)
        out = capsys.readouterr().out
        assert rc == 1
        assert "Batería no encontrada" in out

    def test_cmd_informe_sin_bateria_imprime_mensaje_y_retorna_1(self, capsys):
        """informe sin batería imprime mensaje y retorna 1."""
        args = type("Args", (), {"ronda": None})()
        rc = PM.cmd_informe(args)
        out = capsys.readouterr().out
        assert rc == 1
        assert "Batería no encontrada" in out


class TestBateriaPresente:
    """Comportamiento normal cuando la batería existe (regresión)."""

    def setup_method(self):
        self.orig_bateria = PM.BATERIA_JSON
        self.orig_registro = PM.REGISTRO_JSONL
        self.orig_evidencias = PM.EVIDENCIAS_DIR
        self.orig_mac_logs = PM.MAC_LOGS

        self.tmpdir = Path(tempfile.mkdtemp(prefix="pru1124a_ok_"))
        self.nueva_bateria = self.tmpdir / "bateria-1118.json"
        self.nuevo_registro = self.tmpdir / "registro.jsonl"
        self.nuevas_evidencias = self.tmpdir / "evidencias"
        self.nuevos_mac_logs = self.tmpdir / "mac_logs"
        self.nuevas_evidencias.mkdir(parents=True, exist_ok=True)
        self.nuevos_mac_logs.mkdir(parents=True, exist_ok=True)

        # Escribir batería mínima válida
        bateria_minima = {
            "bateria": "1118",
            "pruebas": [
                {
                    "id": "B1-MT-A1",
                    "titulo": "Apertura BLE",
                    "bloque": "B1",
                    "ronda": 1,
                    "aparatos": ["mac", "maggabox"],
                    "antena": "ble",
                    "pasos": ["Paso 1", "Paso 2"],
                    "criterios": {
                        "mac": {"debe": ["inicio"], "no_debe": ["error"]},
                        "maggabox": {"debe": ["sesion-abierta"], "no_debe": ["error"]}
                    }
                },
                {
                    "id": "B2-MT-A1",
                    "titulo": "Pausa local",
                    "bloque": "B2",
                    "ronda": 1,
                    "aparatos": ["mac", "tableta"],
                    "antena": "wifi",
                    "pasos": ["Paso 1"],
                    "criterios": {
                        "mac": {"debe": ["inicio"], "no_debe": ["error"]},
                        "tableta": {"debe": ["sesion-abierta"], "no_debe": ["error"]}
                    }
                }
            ]
        }
        self.nueva_bateria.write_text(json.dumps(bateria_minima, ensure_ascii=False), encoding="utf-8")

        PM.BATERIA_JSON = self.nueva_bateria
        PM.REGISTRO_JSONL = self.nuevo_registro
        PM.EVIDENCIAS_DIR = self.nuevas_evidencias
        PM.MAC_LOGS = self.nuevos_mac_logs

    def teardown_method(self):
        PM.BATERIA_JSON = self.orig_bateria
        PM.REGISTRO_JSONL = self.orig_registro
        PM.EVIDENCIAS_DIR = self.orig_evidencias
        PM.MAC_LOGS = self.orig_mac_logs
        import shutil
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_cmd_listar_con_bateria_funciona(self, capsys):
        """listar con batería válida lista las pruebas."""
        args = type("Args", (), {"bloque": None, "ronda": None})()
        rc = PM.cmd_listar(args)
        out = capsys.readouterr().out
        assert rc == 0
        assert "B1-MT-A1" in out
        assert "B2-MT-A1" in out
        assert "Apertura BLE" in out
        assert "Pausa local" in out

    def test_cmd_siguiente_con_bateria_funciona(self, capsys):
        """siguiente con batería válida devuelve la primera pendiente."""
        args = type("Args", (), {})()
        rc = PM.cmd_siguiente(args)
        out = capsys.readouterr().out
        assert rc == 0
        assert out.strip() == "B1-MT-A1"

    def test_cmd_empezar_con_bateria_funciona(self, capsys):
        """empezar con batería válida inicia la prueba."""
        args = type("Args", (), {"id": "B1-MT-A1"})()
        rc = PM.cmd_empezar(args)
        out = capsys.readouterr().out
        assert rc == 0
        assert "Iniciada B1-MT-A1" in out
        # Verificar que se escribió en registro.jsonl
        assert self.nuevo_registro.exists()
        lineas = self.nuevo_registro.read_text(encoding="utf-8").strip().splitlines()
        assert len(lineas) == 1
        obj = json.loads(lineas[0])
        assert obj["tipo"] == "inicio"
        assert obj["id"] == "B1-MT-A1"

    def test_cmd_informe_con_bateria_funciona(self, capsys):
        """informe con batería válida genera tabla Markdown."""
        args = type("Args", (), {"ronda": None})()
        rc = PM.cmd_informe(args)
        out = capsys.readouterr().out
        assert rc == 0
        assert "Informe de pruebas" in out
        assert "| ID | Título | Resultado | Aparatos |" in out
        assert "B1-MT-A1" in out
        assert "B2-MT-A1" in out
        assert "pendiente" in out


# pytest import al final para evitar problemas de orden
import pytest  # noqa: E402

if __name__ == "__main__":
    pytest.main([__file__, "-v"])