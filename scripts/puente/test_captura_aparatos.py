# -*- coding: utf-8 -*-
"""PRU1118B · Pruebas puras de capturas y vídeo de evidencia (sin red ni aparatos)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import captura_aparatos as CA  # noqa: E402


class TestPermisoMac(unittest.TestCase):
    def test_detecta_el_error_de_permiso(self):
        self.assertTrue(CA.falta_permiso_mac("could not create image from display"))

    def test_no_confunde_un_error_cualquiera(self):
        self.assertFalse(CA.falta_permiso_mac("screencapture terminó con 1"))


class TestHerramientasMaggabox(unittest.TestCase):
    def test_foto_elige_xfce_primero(self):
        self.assertEqual(
            CA.elegir_herramienta({"import", "xfce4-screenshooter"}, "foto"),
            "xfce4-screenshooter",
        )

    def test_foto_cae_a_import_y_luego_xwd(self):
        self.assertEqual(CA.elegir_herramienta({"import", "xwd"}, "foto"), "import")
        self.assertEqual(CA.elegir_herramienta({"xwd"}, "foto"), "xwd")

    def test_video_solo_ffmpeg(self):
        self.assertEqual(CA.elegir_herramienta({"ffmpeg"}, "video"), "ffmpeg")
        self.assertIsNone(CA.elegir_herramienta({"import"}, "video"))

    def test_paquete_que_falta(self):
        self.assertEqual(CA.paquete_que_falta({"import"}, "video"), "ffmpeg")
        self.assertIn("xfce4-screenshooter", CA.paquete_que_falta(set(), "foto"))


class TestAdb(unittest.TestCase):
    def test_aparato_emparejado(self):
        salida = "List of devices attached\nR58M123\tdevice\n"
        self.assertTrue(CA.aparato_adb(salida))

    def test_sin_aparato(self):
        self.assertFalse(CA.aparato_adb("List of devices attached\n\n"))

    def test_no_cuenta_offline_ni_unauthorized(self):
        salida = "List of devices attached\nA\toffline\nB\tunauthorized\n"
        self.assertFalse(CA.aparato_adb(salida))


class TestDestino(unittest.TestCase):
    def test_carpeta_con_prueba(self):
        self.assertEqual(
            CA.carpeta_destino("B4-MT-A1", CA.EVIDENCIAS_DIR),
            CA.EVIDENCIAS_DIR / "B4-MT-A1",
        )

    def test_carpeta_sin_prueba(self):
        self.assertEqual(
            CA.carpeta_destino(None, CA.EVIDENCIAS_DIR),
            CA.EVIDENCIAS_DIR / "sueltas",
        )

    def test_id_no_escapa_de_la_carpeta(self):
        self.assertEqual(CA.carpeta_destino("../fuera", CA.EVIDENCIAS_DIR).parent,
                         CA.EVIDENCIAS_DIR)

    def test_nombre_archivo(self):
        self.assertEqual(
            CA.nombre_archivo("mac", "foto", "20261118-100000", ".png"),
            "mac-foto-20261118-100000.png",
        )


class TestComandos(unittest.TestCase):
    def test_video_maggabox_usa_x11grab(self):
        cmd = CA.comando_maggabox("ffmpeg", "/tmp/v.mp4", 7)
        self.assertIn("DISPLAY=:0", cmd)
        self.assertIn("x11grab", cmd)
        self.assertIn("-t 7", cmd)

    def test_foto_maggabox_respeta_la_herramienta(self):
        self.assertEqual(
            CA.comando_maggabox("xfce4-screenshooter", "/tmp/f.png"),
            "DISPLAY=:0 xfce4-screenshooter -f -s /tmp/f.png",
        )
        self.assertIn("import -window root", CA.comando_maggabox("import", "/tmp/f.png"))
        self.assertIn("xwd -root", CA.comando_maggabox("xwd", "/tmp/f.xwd"))

    def test_video_tableta_limita_los_segundos(self):
        cmd = CA.comando_tableta("video", "/sdcard/v.mp4", 7)
        self.assertEqual(cmd, ["adb", "shell", "screenrecord", "--time-limit", "7", "/sdcard/v.mp4"])

    def test_foto_tableta_va_por_stdout(self):
        self.assertEqual(CA.comando_tableta("foto", "", 0), ["adb", "exec-out", "screencap", "-p"])


class TestErrores(unittest.TestCase):
    def test_mac_sin_permiso_nombra_herl(self):
        msg = CA.mensaje_error("mac", "foto", "could not create image from display")
        self.assertIn("HERL1118A/B", msg)

    def test_maggabox_sin_herramienta_nombra_ffmpeg(self):
        msg = CA.mensaje_error("maggabox", "video", "", herramienta=None)
        self.assertIn("ffmpeg", msg)

    def test_tableta_sin_emparejar(self):
        msg = CA.mensaje_error("tableta", "foto", "List of devices attached\n\n")
        self.assertIn("emparejado", msg)


if __name__ == "__main__":
    unittest.main()
