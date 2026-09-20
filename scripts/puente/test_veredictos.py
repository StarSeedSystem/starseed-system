"""veredictos: las reglas mandan, Jev solo entra en lo que queda; y los tres consejeros."""
import unittest

import importancia
import pasarelas
import resolucion_automatica as ra
import veredictos as vd

REVISIONES = """## 343863b0 · Ola 337 · RS3: Aprobar, Rechazar y Soltar desde el Mando
**Revisión Kimi — commit 343863b0**
1. en `reasignarTarea`, `nombreNuevo = auto-0913-193908-t1` no cumple `PATRON_NOMBRE`.
**Seguimiento:** sí, bloqueante — el regex.

## 111 · Ola 1 · OTRA: cosa
nada
"""


class Reglas(unittest.TestCase):
    def test_objecion_del_revisor_se_recorta_por_id(self):
        self.assertIn("PATRON_NOMBRE", vd.objecion_de(REVISIONES, "RS3"))
        self.assertNotIn("OTRA", vd.objecion_de(REVISIONES, "RS3"))
        self.assertEqual(vd.objecion_de(REVISIONES, "RS3b"), "")

    def test_dependencia_espera_sin_preguntar(self):
        self.assertEqual(vd.regla("bloqueada", "dependencia no integrada: TM1", {"archivos": ["a.ts"]}, "", "")[0], "esperar")

    def test_sin_archivos_se_descarta(self):
        self.assertEqual(vd.regla("bloqueante", "escalada agotada", {"archivos": []}, "", "")[0], "descartar")

    def test_objecion_es_la_instruccion(self):
        v, cambio, _ = vd.regla("rechazada", "", {"archivos": ["a.ts"]}, "arregla el regex", "")
        self.assertEqual(v, "reintentar_con_cambio")
        self.assertEqual(cambio, "arregla el regex")

    def test_culpa_del_proveedor_reintenta_tal_cual(self):
        v, _, _ = vd.regla("sin_cambios", "", {"archivos": ["a.ts"]}, "", "Error: Request too large … tokens per minute (TPM)")
        self.assertEqual(v, "reintentar")

    def test_lo_que_no_cubre_la_regla_va_a_jev_o_espera(self):
        self.assertIsNone(vd.regla("fallo_tests", "", {"archivos": ["a.ts"]}, "", "tests rojos"))
        filas = vd.veredictos({"X1": {"estado": "fallo_tests", "nota": ""}}, {"X1": {"archivos": ["a.ts"]}}, "",
                              leer_log=lambda t: "", jev_disponible=False)
        self.assertEqual(filas[0]["veredicto"], "esperar")
        self.assertEqual(filas[0]["fuente"], "nadie")

    def test_las_no_atascadas_no_salen(self):
        filas = vd.veredictos({"OK": {"estado": "commit"}, "B": {"estado": "bloqueada", "nota": "dependencia no integrada: OK"}},
                              {"B": {"archivos": ["a.ts"]}}, "", leer_log=lambda t: "", jev_disponible=False)
        self.assertEqual([f["id"] for f in filas], ["B"])
        self.assertEqual(filas[0]["fuente"], "regla")


class Consejeros(unittest.TestCase):
    def test_importancia_solo_en_la_zona_de_duda(self):
        linea = {"texto": "el agente X terminó la ola 999 y necesita que decidas el despliegue", "tipo": "aviso"}
        self.assertFalse(importancia.suena(linea))                              # sin consejero: como antes
        self.assertTrue(importancia.suena(linea, lambda t: 0.93))
        self.assertFalse(importancia.suena(linea, lambda t: 0.5))
        self.assertFalse(importancia.suena({"texto": "integrado en main: x", "tipo": "aviso"}, lambda t: 0.99))  # NUNCA manda

    def test_importancia_consejero_roto_no_rompe(self):
        def roto(t):
            raise RuntimeError("sin red")
        self.assertFalse(importancia.suena({"texto": "hola", "tipo": "aviso"}, roto))

    def test_pasarelas_consejero_solo_sin_pista_y_con_confianza(self):
        self.assertEqual(pasarelas.clasificar(400, "daily check-in required", False, lambda h, c, o: ("caida", 0.99)), "fichaje")
        self.assertEqual(pasarelas.clasificar(400, "Rate ceiling reached for this key", False, lambda h, c, o: ("sin_cupo", 0.8)), "sin_cupo")
        self.assertEqual(pasarelas.clasificar(400, "Rate ceiling reached for this key", False, lambda h, c, o: ("sin_cupo", 0.4)), "caida")
        self.assertEqual(pasarelas.clasificar(400, "", False, lambda h, c, o: ("sin_cupo", 0.9)), "caida")

    def test_resolucion_jev_solo_veta(self):
        ficha = {"verificadores": {"tsc": "ok", "vitest": "ok"}, "revisor": "ok"}
        veredicto = {"veredicto": "aprobar", "confianza": "alta", "razones": ["todo verde"]}
        ok = lambda v, estricta: True
        if not ra.verificadores_conformes(ficha):
            self.skipTest("la ficha mínima no pasa la conformidad de este repo")
        self.assertEqual(ra.decidir({}, ficha, veredicto, ok)[0], "aprobar")
        self.assertEqual(ra.decidir({}, ficha, veredicto, ok, lambda f, v: 0.1)[0], "esperar")
        self.assertEqual(ra.decidir({}, ficha, veredicto, ok, lambda f, v: 0.9)[0], "aprobar")
        self.assertEqual(ra.decidir({}, ficha, veredicto, ok, lambda f, v: None)[0], "aprobar")
        self.assertEqual(ra.decidir({}, ficha, {"veredicto": "rechazar"}, lambda v, e: False, lambda f, v: 0.99)[0], "esperar")


if __name__ == "__main__":
    unittest.main()
