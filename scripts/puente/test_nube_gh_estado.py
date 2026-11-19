#!/usr/bin/env python3
"""Pruebas de `nube-gh.preparar_estado_para_nube` (2026-10-04, NUB1004A).

Sin red ni archivos reales: HOME y destino son rutas temporales inyectadas.
"""
from __future__ import annotations

import importlib.util
import json
import os
import tempfile
import unittest

_RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "nube-gh.py")
_spec = importlib.util.spec_from_file_location("nube_gh", _RUTA)
nube_gh = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(nube_gh)


class PrepararEstadoParaNube(unittest.TestCase):
    def _home_con(self, archivos):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        st = os.path.join(tmp.name, ".starseed")
        os.makedirs(st)
        for nombre, datos in archivos.items():
            with open(os.path.join(st, nombre), "w", encoding="utf-8") as f:
                json.dump(datos, f)
        destino = os.path.join(tmp.name, "estado")
        return tmp.name, destino

    def test_copia_los_tres_sin_campos_de_clave(self):
        home, destino = self._home_con(
            {
                "rotacion-optimizada.json": {"delante": ["kimi-k3"], "caduca": "x"},
                "pasarelas-informe.json": {
                    "pasarelas": [
                        {"nombre": "groq", "api_key": "NO-DEBE-VIAJAR", "modelos": ["a"]}
                    ]
                },
                "salud-proveedores.json": {"nvidia": {"estado": "ok"}},
            }
        )
        copiados = nube_gh.preparar_estado_para_nube(home, destino)
        self.assertEqual(sorted(copiados), sorted(nube_gh.ESTADO_PARA_NUBE))
        with open(os.path.join(destino, "pasarelas-informe.json"), encoding="utf-8") as f:
            informe = json.load(f)
        self.assertEqual(informe["pasarelas"], [{"nombre": "groq", "modelos": ["a"]}])
        with open(os.path.join(destino, "pasarelas-informe.json"), encoding="utf-8") as f:
            crudo = f.read()
        self.assertNotIn("NO-DEBE-VIAJAR", crudo)

    def test_sin_archivos_no_falla(self):
        with tempfile.TemporaryDirectory() as tmp:
            destino = os.path.join(tmp, "estado")
            self.assertEqual(nube_gh.preparar_estado_para_nube(tmp, destino), [])
            self.assertFalse(os.path.exists(destino))

    def test_quita_campos_secretos_anidados(self):
        home, destino = self._home_con(
            {
                "salud-proveedores.json": {
                    "groq": {"estado": "ok", "TOKEN_refresh": "x", "Mi_CLAVE": "y"}
                }
            }
        )
        copiados = nube_gh.preparar_estado_para_nube(home, destino)
        self.assertEqual(copiados, ["salud-proveedores.json"])
        with open(os.path.join(destino, "salud-proveedores.json"), encoding="utf-8") as f:
            datos = json.load(f)
        self.assertEqual(datos, {"groq": {"estado": "ok"}})


if __name__ == "__main__":
    unittest.main()


class ColaCreada(unittest.TestCase):
    """(2026-10-13) El run 38344120572 subió `estado-cola-…-2` en vez de la cola."""

    def test_manda_lo_que_dice_el_reparto(self):
        salida = "[reparto] algo\n[reparto] cola: enjambre/colas/cola-nube-20261012-2156-2.json\n"
        nuevas = {"cola-nube-20261012-2156-2.json", "estado-cola-nube-20261012-2156-2"}
        self.assertEqual(nube_gh.cola_creada(salida, nuevas), "enjambre/colas/cola-nube-20261012-2156-2.json")

    def test_sin_la_linea_solo_cuentan_las_colas(self):
        nuevas = {"cola-nube-20261012-2156-2.json", "estado-cola-nube-20261012-2156-2"}
        self.assertEqual(nube_gh.cola_creada("", nuevas), "enjambre/colas/cola-nube-20261012-2156-2.json")
        self.assertIsNone(nube_gh.cola_creada("", {"estado-cola-nube-x"}))
        self.assertIsNone(nube_gh.cola_creada("[reparto] cola: ../../etc/passwd", set()))

    def test_no_mas_trabajadores_que_tareas(self):
        self.assertEqual(nube_gh.trabajadores_para("4", 1), "1")
        self.assertEqual(nube_gh.trabajadores_para("4", 9), "4")
        self.assertEqual(nube_gh.trabajadores_para("3", 0), "3")
        self.assertEqual(nube_gh.trabajadores_para("x", 2), "x")

    def test_si_el_reparto_no_creo_nada_no_se_toma_la_cola_de_otro(self):
        """(2026-10-13) El director tomó la cola que «Buscar más capacidad» creó ese minuto."""
        salida = "[reparto] Reparto a la nube 20261013: 0 tareas (ninguna) (simulación)\n"
        self.assertIsNone(nube_gh.cola_creada(salida, {"cola-nube-20261013-1544.json"}))


class GitPushRetry(unittest.TestCase):
    """(CAP1119B) El git push reintenta con espera y no deja el job sin salir."""

    def _mock_run(self, stdout="ref123\n", stderr="", returncode=0):
        from unittest import mock
        m = mock.MagicMock()
        m.stdout = stdout
        m.stderr = stderr
        m.returncode = returncode
        return m

    def test_push_retry_con_espera_y_luego_exito(self):
        """Si el primer push falla, reintenta después de esperar y luego sale."""
        from unittest import mock

        # Mock _sh_rc para fallar la primera vez y salir la segunda
        llamadas = []
        def sh_rc_falla_luego_sale(orden, timeout=120):
            llamadas.append(orden)
            if orden[:3] == ["git", "push", "-q"]:
                if len([l for l in llamadas if l[:3] == ["git", "push", "-q"]]) == 1:
                    return 1, "remote: error: temporary failure"
                return 0, ""
            if orden[:3] == ["gh", "workflow", "run"]:
                return 0, ""
            return 0, ""

        with mock.patch.object(nube_gh, "_sh_rc", sh_rc_falla_luego_sale), \
             mock.patch.object(nube_gh, "_esperar_run", lambda rama: "12345"), \
             mock.patch.object(nube_gh, "_no_lanzada", lambda c: None), \
             mock.patch.object(nube_gh, "_anotar_lanzamiento", lambda *a, **k: None), \
             mock.patch.object(nube_gh, "_podar_ramas_de_cola", lambda: None), \
             mock.patch.object(nube_gh, "soltar_cedidas", lambda *a, **k: []), \
             mock.patch.object(nube_gh, "trabajadores_para", lambda p, n: "3"), \
             mock.patch.object(nube_gh, "_tareas_de_cola", lambda c: 3), \
             mock.patch.object(nube_gh, "preparar_estado_para_nube", lambda h, d: []), \
             mock.patch.object(nube_gh, "cola_creada", lambda s, n: "enjambre/colas/cola-nube-test.json"), \
             mock.patch("subprocess.run", return_value=self._mock_run()):
            try:
                nube_gh._lanzar(["--tope", "6", "--trabajadores", "3", "--minutos", "300"])
            except SystemExit as e:
                self.fail(f"_lanzar no debería salir: {e}")

        # Verificar que se llamó a git push dos veces
        pushes = [l for l in llamadas if l[:3] == ["git", "push", "-q"]]
        self.assertEqual(len(pushes), 2, "Debería haber reintentado el push una vez")

    def test_push_retry_agota_intentos_y_marca_no_lanzada(self):
        """Si todos los reintentos fallan, marca la cola como no lanzada y sale con error."""
        from unittest import mock

        def sh_rc_siempre_falla(orden, timeout=120):
            if orden[:3] == ["git", "push", "-q"]:
                return 1, "remote: error: persistent failure"
            if orden[:3] == ["gh", "workflow", "run"]:
                return 0, ""
            return 0, ""

        mock_no_lanzada = mock.MagicMock()
        with mock.patch.object(nube_gh, "_sh_rc", sh_rc_siempre_falla), \
             mock.patch.object(nube_gh, "_no_lanzada", mock_no_lanzada), \
             mock.patch.object(nube_gh, "trabajadores_para", lambda p, n: "3"), \
             mock.patch.object(nube_gh, "_tareas_de_cola", lambda c: 3), \
             mock.patch.object(nube_gh, "preparar_estado_para_nube", lambda h, d: []), \
             mock.patch.object(nube_gh, "cola_creada", lambda s, n: "enjambre/colas/cola-nube-test.json"), \
             mock.patch("subprocess.run", return_value=self._mock_run()):
            with self.assertRaises(SystemExit) as ctx:
                nube_gh._lanzar(["--tope", "6", "--trabajadores", "3", "--minutos", "300"])
            self.assertIn("no pude empujar la rama", str(ctx.exception))
            mock_no_lanzada.assert_called()


if __name__ == "__main__":
    unittest.main()
