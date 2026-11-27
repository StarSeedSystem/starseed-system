#!/usr/bin/env python3
"""NFC1126H · pruebas de prueba_nfc.py: solo lógica pura, sin vitest ni adb reales."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import prueba_nfc as P  # noqa: E402

SALIDA_VERDE = " Test Files  7 passed (7)\n      Tests  96 passed (96)\n"
SALIDA_ROJA = " Test Files  1 failed | 6 passed (7)\n      Tests  2 failed | 94 passed (96)\n"
ADB = "List of devices attached\nR58M123\tdevice usb:1-1\nZX1G456\tunauthorized usb:1-2\n\n"


class AnalizarVitest(unittest.TestCase):
    def test_verde_con_resumen(self):
        r = P.analizar_vitest(0, SALIDA_VERDE)
        self.assertTrue(r.ok)
        self.assertEqual((r.archivos, r.pruebas, r.falladas), (7, 96, 0))

    def test_rojo_cuenta_las_falladas(self):
        r = P.analizar_vitest(1, SALIDA_ROJA)
        self.assertFalse(r.ok)
        self.assertEqual(r.falladas, 2)

    def test_silencio_no_es_aprobacion(self):
        # Código 0 pero sin resumen: no se ha comprobado nada.
        r = P.analizar_vitest(0, "")
        self.assertFalse(r.ok)
        self.assertFalse(r.resumen_visto)

    def test_resumen_con_codigo_de_error_no_pasa(self):
        self.assertFalse(P.analizar_vitest(1, SALIDA_VERDE).ok)


class Aparatos(unittest.TestCase):
    def test_lista_de_adb(self):
        a = P.analizar_adb_devices(ADB)
        self.assertEqual([(x.serie, x.estado) for x in a], [("R58M123", "device"), ("ZX1G456", "unauthorized")])

    def test_sin_aparatos(self):
        self.assertEqual(P.analizar_adb_devices("List of devices attached\n\n"), [])

    def test_nfc_en_las_caracteristicas(self):
        self.assertTrue(P.tiene_nfc("feature:android.hardware.nfc\nfeature:android.hardware.nfc.hce\n"))
        self.assertFalse(P.tiene_nfc("feature:android.hardware.wifi\n"))

    def test_solo_hce_no_basta_para_lector(self):
        # `nfc.hce` sin `nfc` (raro) no cuenta como chip lector.
        self.assertFalse(P.tiene_nfc("feature:android.hardware.nfc.hce\n"))

    def test_no_autorizado_queda_sin_dato(self):
        a = P.Aparato("ZX1G456", "unauthorized")
        P.completar_nfc(a, lambda serie: (_ for _ in ()).throw(AssertionError("no se debe preguntar")))
        self.assertIsNone(a.nfc)


class InformeYGuion(unittest.TestCase):
    def informe(self, ok=True, aparatos=None):
        v = P.analizar_vitest(0 if ok else 1, SALIDA_VERDE if ok else SALIDA_ROJA)
        return P.Informe(v, aparatos or [])

    def test_sin_aparatos_manda_la_ronda_pendiente(self):
        t = P.componer_informe(self.informe())
        self.assertIn("96 pruebas", t)
        self.assertIn("ninguno conectado por adb", t)
        self.assertIn("Ronda en aparatos", t)

    def test_con_dos_con_nfc_se_puede_hacer_la_ronda(self):
        ap = [P.Aparato("A", "device", True), P.Aparato("B", "device", True)]
        self.assertIn("listos para la ronda", P.componer_informe(self.informe(aparatos=ap)))

    def test_uno_con_nfc_no_basta(self):
        ap = [P.Aparato("A", "device", True), P.Aparato("B", "device", False)]
        t = P.componer_informe(self.informe(aparatos=ap))
        self.assertIn("falta un segundo aparato con NFC", t)

    def test_rojo_lo_dice_y_no_promete_ronda(self):
        t = P.componer_informe(self.informe(ok=False))
        self.assertIn("FALLAN", t)
        self.assertNotIn("listos para la ronda", t)

    def test_el_guion_cubre_lo_que_necesita_dos_telefonos(self):
        g = P.guion_ronda()
        self.assertGreaterEqual(len(g), 6)
        self.assertTrue(any("HCE" in p for p in g))
        self.assertTrue(any("QR" in p for p in g))
        self.assertTrue(g[0].startswith("1. "))

    def test_cada_escenario_apunta_a_un_archivo_de_prueba_real(self):
        carpeta = os.path.join(P.RAIZ, P.CARPETA_PRUEBAS, "__tests__")
        for archivo in P.ESCENARIOS:
            self.assertTrue(os.path.exists(os.path.join(carpeta, archivo)), archivo)


class Ejecucion(unittest.TestCase):
    def test_ejecutar_avisa_una_vez_al_canal(self):
        enviados = []
        salida = P.ejecutar(
            lambda: (0, SALIDA_VERDE),
            lambda: ADB,
            lambda serie: "feature:android.hardware.nfc\n",
            lambda msg, quien, tipo, tarea: enviados.append((msg, quien, tipo)),
        )
        self.assertEqual(len(enviados), 1)
        self.assertEqual(enviados[0][1], "prueba-nfc")
        self.assertEqual(salida, 0)
        self.assertIn("96 pruebas", enviados[0][0])
        self.assertIn("1 con NFC", enviados[0][0])

    def test_rojo_devuelve_codigo_distinto_de_cero(self):
        salida = P.ejecutar(lambda: (1, SALIDA_ROJA), lambda: "", lambda s: "", lambda *a: None)
        self.assertEqual(salida, 1)

    def test_adb_ausente_no_rompe(self):
        def sin_adb():
            raise FileNotFoundError("adb")

        salida = P.ejecutar(lambda: (0, SALIDA_VERDE), sin_adb, lambda s: "", lambda *a: None)
        self.assertEqual(salida, 0)


if __name__ == "__main__":
    unittest.main()
