#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests para almacen_maggabox.py con outputs falsos de SSH."""
from __future__ import annotations

import json
import subprocess
from typing import Any, Dict, List, Optional

import pytest


class MockCompletedProcess:
    def __init__(self, returncode: int, stdout: str = "", stderr: str = ""):
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr


def _mock_ssh(argv: List[str], *args, **kwargs) -> MockCompletedProcess:
    """Mock SSH: devuelve salida para comandos btrfs/df, vacío para otros."""
    if not isinstance(argv, list) or len(argv) < 2:
        return MockCompletedProcess(0, stdout="")

    cmd = argv[-1] if argv else ""

    # Comandos btrfs subvolume list
    if "btrfs" in argv and "subvolume" in argv and "list" in argv:
        return MockCompletedProcess(
            0,
            stdout="ID=5 gen=256 top level 5 path .instantaneas\n"
                   "ID=6 gen=257 top level 5 path .instantaneas/cerebros-20240101000000\n"
                   "ID=7 gen=258 top level 5 path .instantaneas/respaldos-20240101000000\n"
                   "ID=8 gen=259 top level 5 path .instantaneas/desarrollo-20240115000000\n"
        )

    # Comando df -BG /srv/starseed-almacen
    if "df" in argv and "-BG" in argv and "/srv/starseed-almacen" in argv:
        return MockCompletedProcess(
            0,
            stdout="Filesystem     1G-blocks   Used Available Use% Mounted on\n"
                   "/dev/sda1       500G   82G   418G   17% /srv/starseed-almacen"
        )

    # Comando btrfs filesystem df
    if "btrfs" in argv and "filesystem" in argv and "df" in argv:
        return MockCompletedProcess(
            0,
            stdout="/srv/starseed-almacen: BG=512K blocks, single\n"
                   "   Size=500.00GiB Used=82.00GiB Free=418.00GiB"
        )

    # Comando cat para manifest
    if "cat" in argv and ".starseed/almacen.json" in argv:
        return MockCompletedProcess(
            0,
            stdout=json.dumps({"id": "maggabox", "version": "1.0", "ultima_actualizacion": ""})
        )

    return MockCompletedProcess(0, stdout="")


class TestAlmacenMaggaBox:
    def test_obtiene_estado_almacen(self, *args, **kwargs):
        from almacen_maggabox import listar_estado_almacen

        result = listar_estado_almacen(ssh_fn=_mock_ssh)
        assert "discoLibreGb" in result
        assert result["discoLibreGb"] == 418
        assert "subvolúmenes" in result
        assert "destinos" in result

    def test_destinos_asignados_correctamente(self, *args, **kwargs):
        from almacen_maggabox import obtener_destinos

        destinos = obtener_destinos()
        assert "desarrollo" in destinos
        assert "respaldos" in destinos
        assert destinos["desarrollo"] == "pesado regenerable del enjambre → desarrollo"
        assert destinos["respaldos"] == "respaldos y versiones → respaldos"

    def test_manifest_generado(self, *args, **kwargs):
        from almacen_maggabox import generar_manifestos

        result = generar_manifestos(ssh_fn=_mock_ssh)
        assert result["manifest_escrito"] == True

    def test_limpiar_snapshots(self, *args, **kwargs):
        from almacen_maggabox import limpiar_snapshots

        result = limpiar_snapshots(ssh_fn=_mock_ssh, subvolumen="respaldos", snap_dir="/tmp/.instantaneas")
        assert result == True

    def test_snapshot_btrfs(self, *args, **kwargs):
        from almacen_maggabox import snapshot_btrfs

        result = snapshot_btrfs(ssh_fn=_mock_ssh, subvolumen="cerebros", snapshot_dir="/tmp/.instantaneas")
        assert result == True


if __name__ == "__main__":
    pytest.main([__file__, "-v"])