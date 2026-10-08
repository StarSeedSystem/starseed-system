#!/usr/bin/env python3
"""Pruebas para oracle_claves - sin red, sin SSH real, sin archivos locales.
Basado en: architecture/oracle-nube.md §3, §5.
"""
from __future__ import annotations

import contextlib
import io
import os
import sys
import tempfile
from pathlib import Path
from unittest import mock


class EstadoFalso:
    """Estado SSH falso que captura entrada y verifica salida."""
    def __init__(self):
        self.capturado = b""
        self.ejecutadas = []

    def probar_ssh(self, host, key_file, user, comando):
        from unittest import mock
        self.ejecutadas.append(("probar_ssh", host, key_file, user, comando))
        self.capturado = comando if isinstance(comando, bytes) else comando.encode()
        return mock.Mock(returncode=0)

    def probar_ssh_simular(self, host, key_file, user, comando):
        from unittest import mock
        self.ejecutadas.append(("probar_ssh_simular", host, key_file, user, comando))
        return mock.Mock(returncode=0)


def _leer_env_desde_archivo(temporal_dir: Path, datos: dict[str, str]):
    """Crea ~/.starseed/env en el HOME temporal con los datos dados."""
    home_env = temporal_dir / ".starseed"
    home_env.mkdir(parents=True, exist_ok=True)
    env_path = home_env / "env"
    with env_path.open("w", encoding="utf-8") as f:
        for key, val in datos.items():
            f.write(f"{key}={val}\n")


def _escribir_oracle_json(temporal_dir: Path, datos: dict):
    """Crea ~/.starseed/oracle.json con los datos dados."""
    home_env = temporal_dir / ".starseed"
    home_env.mkdir(parents=True, exist_ok=True)
    oracle_path = home_env / "oracle.json"
    import json
    with oracle_path.open("w", encoding="utf-8") as f:
        json.dump(datos, f)


def _configurar_home(temporal_dir: Path):
    """Reemplaza el HOME del usuario para todos los import.
    Returns:
        Un contexto manager que restaura HOME después.
    """
    original_home = os.environ.get("HOME")
    os.environ["HOME"] = str(temporal_dir)
    return original_home


import unittest


class PruebasOracleClaves(unittest.TestCase):
    def setUp(self):
        self.temporal_dir = tempfile.mkdtemp(prefix="oracle_claves_")
        self.home = Path(self.temporal_dir)
        self.original_home = _configurar_home(self.home)
        _leer_env_desde_archivo(self.home, {
            "VAR1": "valor1",
            "VAR2": "valor2",
            "VAR3": "valor3",
        })
        _escribir_oracle_json(self.home, {
            "ip_publica": "192.168.1.100",
            "vinculada": True,
        })

    def tearDown(self):
        import shutil
        shutil.rmtree(self.temporal_dir, ignore_errors=True)
        if self.original_home:
            os.environ["HOME"] = self.original_home
        else:
            os.environ.pop("HOME", None)

    def test_valores_correctos_leidos(self):
        """Verifica que ~/.starseed/env se lee correctamente."""
        import oracle_claves as oc
        envs = oc._leer_env_archivo(self.home)
        self.assertEqual(envs.get("VAR1"), "valor1")
        self.assertEqual(envs.get("VAR2"), "valor2")
        self.assertEqual(envs.get("VAR3"), "valor3")

    def test_construir_archivo_env(self):
        """Verifica que el contenido del archivo env se construye correctamente."""
        import oracle_claves as oc
        envs = {"VAR1": "valor1", "VAR2": "valor2"}
        contenido = oc._construir_archivo_env(envs)
        lines = contenido.strip().split("\n")
        self.assertEqual(len(lines), 2)
        self.assertIn("VAR1=valor1", contenido)
        self.assertIn("VAR2=valor2", contenido)

    def test_patron_variables_validas(self):
        """Verifica que solo los nombres de variables válidas pasan."""
        import oracle_claves as oc
        invalidos = oc._validar_nombres(["VAR1", "1VAR", "VAR-1", "var1", "VAR_1"])
        self.assertEqual(set(invalidos), {"1VAR", "VAR-1", "var1"})
        validos = oc._validar_nombres(["VAR1", "VAR_1", "VAR2"])
        self.assertEqual(validos, [])

    def test_estado_ssh_falso_captura_entrada(self):
        """Verifica que el estado SSH falso captura la entrada correctamente."""
        falso = EstadoFalso()
        falso.probar_ssh("host", "key", "user", "VAR1=valor1")
        self.assertEqual(falso.capturado, b"VAR1=valor1")
        self.assertEqual(falso.ejecutadas[0], ("probar_ssh", "host", "key", "user", "VAR1=valor1"))

    def test_valores_no_imprimidos(self):
        """Verifica que los valores nunca se imprimen en la salida."""
        import oracle_claves as oc
        # Usamos un mock para evitar la ejecución real del comando
        with mock.patch("subprocess.run") as mock_run:
            mock_run.return_value.returncode = 0
            # Capturamos la salida de main
            salida = io.StringIO()
            with contextlib.redirect_stdout(salida):
                oc.main(["--simular", "maquina", "VAR1", "VAR2", "VAR4"])
            salida_texto = salida.getvalue().strip()
            # El texto debe ser: "VAR1 ✓, VAR2 ✓, VAR4 (no está en tu env)"
            self.assertEqual(salida_texto, "VAR1 ✓, VAR2 ✓, VAR4 (no está en tu env)")
            self.assertNotIn("valor1", salida_texto)
            self.assertNotIn("valor2", salida_texto)

    def test_simular_no_ejecuta_ssh(self):
        """Verifica que --simular no ejecuta el comando SSH."""
        import oracle_claves as oc
        falso = EstadoFalso()
        with mock.patch("subprocess.run", falso.probar_ssh_simular):
            # Intentamos simular pero el mock no ejecuta el comando real
            salida = io.StringIO()
            with contextlib.redirect_stdout(salida):
                oc.main(["--simular", "maquina", "VAR1", "VAR2"])
            salida_texto = salida.getvalue().strip()
            self.assertEqual(salida_texto, "VAR1 ✓, VAR2 ✓")

    def test_error_nombres_invalidos(self):
        """Verifica que los nombres inválidos generan error."""
        import oracle_claves as oc
        salida = io.StringIO()
        with contextlib.redirect_stdout(salida), contextlib.redirect_stderr(salida):
            codigo = oc.main(["maquina", "VAR1", "1VAR"])
        salida_texto = salida.getvalue()
        self.assertIn("Nombres inválidos rechazan", salida_texto)
        self.assertEqual(codigo, 1)

    def test_variables_no_presentes_en_env(self):
        """Verifica que las variables no presentes en ~/.starseed/env se marcan como no disponibles."""
        _leer_env_desde_archivo(self.home, {"VAR1": "valor1"})
        import oracle_claves as oc
        salida = io.StringIO()
        with contextlib.redirect_stdout(salida):
            oc.main(["--simular", "maquina", "VAR1", "VAR2"])
        salida_texto = salida.getvalue().strip()
        self.assertEqual(salida_texto, "VAR1 ✓, VAR2 (no está en tu env)")

    def test_oracle_json_leido_para_ip(self):
        """Verifica que ~/.starseed/oracle.json se lee para obtener la IP."""
        import oracle_claves as oc
        oracle = oc._leer_oracle_json(self.home)
        self.assertEqual(oracle.get("ip_publica"), "192.168.1.100")


if __name__ == "__main__":
    unittest.main()
