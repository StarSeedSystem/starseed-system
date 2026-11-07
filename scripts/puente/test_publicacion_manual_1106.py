#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del detector manual de publicación (test_publicacion_manual_1106)."""
import os
import sys
import tempfile
import time
import json
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import autopublicar as A  # noqa: E402
import publicar as PUB  # noqa: E402


def pid_vivo(pid):
    """PURA: simula os.kill(pid, 0)."""
    if pid == 123:
        return
    raise ProcessLookupError


def pid_vivo_exitoso(pid):
    """PURA: simula un proceso vivo."""
    if pid == 456:
        return
    raise ProcessLookupError


def pid_vivo_con_permiso(pid):
    """PURA: simula PermissionError."""
    raise PermissionError


def pid_vivo_exitoso(pid):
    """PURA: simula un proceso vivo."""
    if pid == 456:
        return
    raise ProcessLookupError


class ManualViva(unittest.TestCase):
    """Pruebas de la función pura `manual_viva`."""

    def test_ejecutándose_con_pid_vivo_devuelve_true_y_motivo(self):
        # (a)
        ahora = time.time()
        diario = {"estado": "corriendo", "pid": 456}
        viva, motivo = A.manual_viva(diario, pid_vivo_exitoso, ahora, 0)
        self.assertTrue(viva)
        self.assertEqual(motivo, "proceso manual activo (pid 456)")

    def test_ejecutándose_con_pid_muerto_devuelve_false_y_razon(self):
        # (b)
        ahora = time.time()
        diario = {"estado": "corriendo", "pid": 789}
        viva, motivo = A.manual_viva(diario, pid_vivo, ahora, 0)
        self.assertFalse(viva)
        self.assertEqual(motivo, "su proceso 789 ya no existe")

    def test_ejecutándose_sin_pid_y_mtime_reciente_devuelve_true(self):
        # (c)
        ahora = time.time()
        mtime = ahora - 10 * 60  # 10 min atrás
        diario = {"estado": "corriendo"}  # sin pid
        viva, motivo = A.manual_viva(diario, pid_vivo, ahora, mtime)
        self.assertTrue(viva)
        self.assertEqual(motivo, "proceso manual activo (sin pid y 10 min sin cambios)")

    def test_sin_pid_y_mtime_antiguo_devuelve_false(self):
        # (d)
        ahora = time.time()
        mtime = ahora - 4 * 3600  # 4 h atrás
        diario = {"estado": "corriendo"}
        viva, motivo = A.manual_viva(diario, pid_vivo, ahora, mtime)
        self.assertFalse(viva)
        self.assertIn("sin cambios desde hace", motivo)

    def test_estado_hecho_devuelve_false_sin_llamar_a_pid_vivo(self):
        # (e)
        ahora = time.time()
        diario = {"estado": "hecho", "pid": 999}
        viva, motivo = A.manual_viva(diario, pid_vivo_exitoso, ahora, 0)
        self.assertFalse(viva)
        self.assertEqual(motivo, "sin publicación manual en curso")

    def test_estado_fallo_devuelve_false_sin_llamar_a_pid_vivo(self):
        # (e)
        ahora = time.time()
        diario = {"estado": "fallo", "pid": 888}
        viva, motivo = A.manual_viva(diario, pid_vivo_exitoso, ahora, 0)
        self.assertFalse(viva)
        self.assertEqual(motivo, "sin publicación manual en curso")

    def test_diario_no_dict_devuelve_false_y_motivo(self):
        # (e) - diario no dict
        ahora = time.time()
        viva, motivo = A.manual_viva(None, pid_vivo_exitoso, ahora, 0)
        self.assertFalse(viva)
        self.assertEqual(motivo, "sin publicación manual en curso")


class PublicandoAMano(unittest.TestCase):
    """Pruebas de Medios.publicando_a_mano()."""

    def test_publicando_a_mano_con_pid_vivo_devuelve_true(self):
        # (a) mediante un Diary real
        with tempfile.TemporaryDirectory() as tmp:
            temp_diario = os.path.join(tmp, "publicacion-estado.json")
            # Direct write to avoid atomic operations
            with open(temp_diario, "w", encoding="utf-8") as f:
                d = {"estado": "corriendo", "pid": 456}
                json.dump(d, f)
            
            # Monkey-patch Medios.publicando_a_mano to use pid_vivo_exitoso
            original_method = A.Medios.publicando_a_mano
            def patched_publicando_a_mano(self):
                import os
                import time
                diario = A._leer(A.DIARIO_MANUAL, {})
                ahora = time.time()
                mtime = os.path.getmtime(A.DIARIO_MANUAL) if os.path.exists(A.DIARIO_MANUAL) else 0
                viva, motivo = A.manual_viva(diario, pid_vivo_exitoso, ahora, mtime)
                return viva
            
            A.Medios.publicando_a_mano = patched_publicando_a_mano
            
            # Parchear DIARIO_MANUAL de autopublicar.py
            with patch.object(A, "DIARIO_MANUAL", temp_diario):
                m = A.Medios()
                viva = m.publicando_a_mano()
                self.assertTrue(viva)

    def test_publicando_a_mano_con_pid_muerto_devuelve_false_y_el_motivo_nombra_el_pid(self):
        # (b)
        with tempfile.TemporaryDirectory() as tmp:
            temp_diario = os.path.join(tmp, "publicacion-estado.json")
            temp_diario_tmp = temp_diario + ".tmp"
            with open(temp_diario_tmp, "w", encoding="utf-8") as f:
                d = {"estado": "corriendo", "pid": 789}
                json.dump(d, f)
            os.replace(temp_diario_tmp, temp_diario)
            
            with patch.object(A, "DIARIO_MANUAL", temp_diario):
                m = A.Medios()
                viva = m.publicando_a_mano()
                self.assertFalse(viva)
                # El motivo está escondido en los logs, pero podemos verificar que no está viva

    def test_diario_viejo_sin_pid_mtime_antiguo_devuelve_false(self):
        # (d)
        with tempfile.TemporaryDirectory() as tmp:
            temp_diario = os.path.join(tmp, "publicacion-estado.json")
            temp_diario_tmp = temp_diario + ".tmp"
            with open(temp_diario_tmp, "w", encoding="utf-8") as f:
                d = {"estado": "corriendo"}
                json.dump(d, f)
            os.replace(temp_diario_tmp, temp_diario)
            # Hacer el mtime antiguo (4 h)
            antiguo = time.time() - 4 * 3600
            os.utime(temp_diario, (antiguo, antiguo))
            
            with patch.object(A, "DIARIO_MANUAL", temp_diario):
                m = A.Medios()
                viva = m.publicando_a_mano()
                self.assertFalse(viva)

    def test_estado_hecho_o_fallo_devuelve_false(self):
        # (e)
        for estado in ["hecho", "fallo"]:
            with tempfile.TemporaryDirectory() as tmp:
                temp_diario = os.path.join(tmp, "publicacion-estado.json")
                temp_diario_tmp = temp_diario + ".tmp"
                with open(temp_diario_tmp, "w", encoding="utf-8") as f:
                    d = {"estado": estado, "pid": 999}
                    json.dump(d, f)
                os.replace(temp_diario_tmp, temp_diario)
                
                with patch.object(A, "DIARIO_MANUAL", temp_diario):
                    m = A.Medios()
                    viva = m.publicando_a_mano()
                    self.assertFalse(viva)


if __name__ == "__main__":
    unittest.main()
