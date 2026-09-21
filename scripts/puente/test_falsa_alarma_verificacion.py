"""Un verificador que da falsas alarmas deja de leerse.

La publicación de las 20:30 del 2026-09-21 terminó diciendo «95 de 98
verificados; 8c3fce00, 19244c9d, b1c0fb5e no están aplicados todavía». Los tres
eran falsos:

  · 19244c9d (RN7) y b1c0fb5e (RN1) SÍ estaban en origin/main. `en_origin` se
    resuelve con `merge-base --is-ancestor` contra la copia LOCAL de la rama
    remota, y se preguntó sin refrescarla justo después del push.
  · 8c3fce00 no existe como objeto en el repositorio. Decir de él que «no está
    aplicado todavía» es inventarse trabajo pendiente.

Es la misma enfermedad que el job verde que no hizo nada, del revés: si el
informe miente, nadie lo mira.
"""

import importlib.util
import os
import unittest

DIR = os.path.dirname(os.path.abspath(__file__))


def _mod(nombre):
    spec = importlib.util.spec_from_file_location(
        nombre.replace("-", "_"), os.path.join(DIR, nombre + ".py")
    )
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


VC = _mod("verificacion_cambios")
VP = _mod("verificar_publicado")


class TestShaDesconocido(unittest.TestCase):
    def test_no_cuenta_como_pendiente_de_publicar(self):
        v = VC.verificar_cambio({"sha": "8c3fce00", "existe": False})
        self.assertTrue(v["desconocido"])
        self.assertIn("no se reconoce", v["porque"])

    def test_el_resumen_no_lo_mezcla_con_los_pendientes(self):
        bueno = {"sha": "aaa", "aplicado": True, "integrado": True, "porque": "ok"}
        malo = VC.verificar_cambio({"sha": "8c3fce00", "existe": False})
        linea = VC.resumen([bueno, malo])
        self.assertIn("1 cambio publicado", linea)
        self.assertIn("no reconoce", linea)
        self.assertNotIn("1 de 2", linea)

    def test_sin_desconocidos_el_resumen_no_cambia(self):
        bueno = {"sha": "aaa", "aplicado": True, "integrado": True, "porque": "ok"}
        self.assertEqual(
            VC.resumen([bueno]),
            "1 cambio publicado, verificado uno a uno: integrado y aplicado",
        )

    def test_un_cambio_normal_sigue_juzgandose(self):
        """`existe` ausente (lo que escriben los llamadores viejos) no desconoce nada."""
        v = VC.verificar_cambio(
            {"sha": "bbb", "en_origin": True, "archivos": [], "ts_contenido": None}
        )
        self.assertFalse(v.get("desconocido"))
        self.assertTrue(v["integrado"])


class TestReunirMarcaLaExistencia(unittest.TestCase):
    def test_un_sha_inventado_se_marca_como_inexistente(self):
        raiz = os.path.dirname(os.path.dirname(DIR))
        c = VP.reunir_cambios(raiz, ["8c3fce00deadbeef"])[0]
        self.assertFalse(c["existe"])
        self.assertFalse(c["en_origin"])

    def test_un_sha_de_verdad_se_marca_como_existente(self):
        raiz = os.path.dirname(os.path.dirname(DIR))
        c = VP.reunir_cambios(raiz, ["HEAD"])[0]
        self.assertTrue(c["existe"])


if __name__ == "__main__":
    unittest.main()
