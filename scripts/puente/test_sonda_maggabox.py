#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests para sonda_maggabox.py con outputs falsos de df/free/nproc."""
from __future__ import annotations

import subprocess
from typing import Any, Dict, List, Optional

import pytest


class MockCompletedProcess:
    def __init__(self, returncode: int, stdout: str = "", stderr: str = ""):
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr


class TestSondaMaggaBox:
    def test_obtiene_disco_libre_gb(self, tmp_path, monkeypatch):
        from sonda_maggabox import sonda_maggabox

        df_output = "Filesystem     1G-blocks   Used Available Use% Mounted on\n/dev/sda1       500G   82G   418G   17% /"

        def mock_run(argv: List[str], *args, **kwargs) -> MockCompletedProcess:
            if "df" in argv and "-BG" in argv:
                return MockCompletedProcess(0, stdout=df_output)
            return MockCompletedProcess(0, stdout="")

        result = sonda_maggabox(ssh_fn=mock_run)
        assert "discoLibreGb" in result
        assert result["discoLibreGb"] == 418

    def test_obtiene_ram_libre_mb(self, tmp_path, monkeypatch):
        from sonda_maggabox import sonda_maggabox

        free_output = "              total        used        free      shared  buff/cache   available\nMem:          32768       4096       220        1024       26464       27000"

        def mock_run(argv: List[str], *args, **kwargs) -> MockCompletedProcess:
            if "free" in argv and "-m" in argv:
                return MockCompletedProcess(0, stdout=free_output)
            return MockCompletedProcess(0, stdout="")

        result = sonda_maggabox(ssh_fn=mock_run)
        assert "ramLibreMb" in result
        assert result["ramLibreMb"] == 220

    def test_obtiene_nucleos_cpu(self, tmp_path, monkeypatch):
        from sonda_maggabox import sonda_maggabox

        nproc_output = "4"

        def mock_run(argv: List[str], *args, **kwargs) -> MockCompletedProcess:
            if "nproc" in argv:
                return MockCompletedProcess(0, stdout=nproc_output)
            return MockCompletedProcess(0, stdout="")

        result = sonda_maggabox(ssh_fn=mock_run)
        assert "cpu" in result
        assert result["cpu"] == 4

    def test_detecta_contenedores_falso(self, tmp_path, monkeypatch):
        from sonda_maggabox import sonda_maggabox

        def mock_run(argv: List[str], *args, **kwargs) -> MockCompletedProcess:
            if "df" in argv and "-BG" in argv:
                return MockCompletedProcess(0, stdout="Filesystem     1G-blocks   Used Available Use% Mounted on\n/dev/sda1       500G   82G   418G   17% /")
            if "free" in argv and "-m" in argv:
                return MockCompletedProcess(0, stdout="              total        used        free      shared  buff/cache   available\nMem:          32768       4096       220        1024       26464       27000")
            if "nproc" in argv:
                return MockCompletedProcess(0, stdout="4")
            if "which" in argv:
                return MockCompletedProcess(1, stdout="")
            return MockCompletedProcess(0, stdout="")

        result = sonda_maggabox(ssh_fn=mock_run)
        assert "contenedores" in result
        assert result["contenedores"] == False

    def test_obtiene_tamanos_carpetas_starSeed_almacen(self, tmp_path, monkeypatch):
        from sonda_maggabox import sonda_maggabox

        du_results = {
            "espejo": "500M",
            "versiones": "200M",
            "respaldos": "10G",
            "pesados": "5G",
            "capas_privadas": "100M",
            "capas_publicas": "50M",
            "nube": "2G",
        }

        def mock_run(argv: List[str], *args, **kwargs) -> MockCompletedProcess:
            if "du" in argv and "-BG" in argv:
                for key, val in du_results.items():
                    if key in str(argv):
                        gb_val = val.replace("G", "").replace("M", "").replace("B", "")
                        return MockCompletedProcess(0, stdout=f"{gb_val}G\t{key}")
            return MockCompletedProcess(0, stdout="")

        result = sonda_maggabox(ssh_fn=mock_run)
        assert "carpetas_starSeed_almacen" in result
        assert isinstance(result["carpetas_starSeed_almacen"], dict)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])