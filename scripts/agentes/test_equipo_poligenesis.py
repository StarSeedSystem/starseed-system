# -*- coding: utf-8 -*-
"""equipo_poligenesis: cadena de traspasos y guarda de salida, sin red."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import equipo_poligenesis as E  # noqa: E402

try:
    import agents  # noqa: F401
    import openai  # noqa: F401
    HAY_SDK = True
    MOTIVO_SIN_SDK = ""
except ImportError as fallo:
    HAY_SDK = False
    MOTIVO_SIN_SDK = f"falta la dependencia en esta máquina: {fallo}"


class Cadena(unittest.TestCase):
    def test_ruta_del_equipo_de_ejemplo(self):
        ruta = [(t.desde, t.hacia) for t in E.traspasos_del_equipo()]
        self.assertEqual(ruta, [("moderador", "redactor"), ("redactor", "revisor")])

    def test_instrucciones_cubren_todos_los_roles(self):
        self.assertEqual(tuple(E.INSTRUCCIONES), E.ROLES)


class ModelosPorRol(unittest.TestCase):
    def test_dict_con_huecos_cae_al_defecto(self):
        ms = E.modelos_por_rol({"revisor": "el-revisor"}, "el-común")
        self.assertEqual(ms["revisor"], "el-revisor")
        self.assertEqual(ms["moderador"], "el-común")

    def test_secuencia_en_orden_de_roles_con_huecos(self):
        ms = E.modelos_por_rol(["a", "", "c"], "el-común")
        self.assertEqual(ms, {"moderador": "a", "redactor": "el-común", "revisor": "c"})

    def test_sin_especificados_todos_al_defecto(self):
        self.assertEqual(E.modelos_por_rol(None, "el-común"),
                         {"moderador": "el-común", "redactor": "el-común",
                          "revisor": "el-común"})


class Guarda(unittest.TestCase):
    def test_correo_documento_y_telefono_son_datos_personales(self):
        self.assertTrue(E.datos_personales_presentes("avísale a ana@gato.es"))
        self.assertTrue(E.datos_personales_presentes("su documento es 12345678Z"))
        self.assertTrue(E.datos_personales_presentes("llama al 600 123 456"))

    def test_texto_limpio_pasa_la_guarda(self):
        self.assertFalse(E.datos_personales_presentes("Propuesta clara sin nada más."))
        self.assertFalse(E.datos_personales_presentes(""))


@unittest.skipUnless(HAY_SDK, MOTIVO_SIN_SDK)
class ConstructorDelSDK(unittest.TestCase):
    def _equipo(self, **kwargs):
        return E.equipo_poligenesis(**kwargs)

    def test_con_base_url_directa_y_modelos_por_rol(self):
        moderador = self._equipo(
            base_url="http://127.0.0.1:4480/v1",
            modelos={"redactor": "el-redactor"},
        )
        self.assertEqual(moderador.name, "moderador")
        self.assertEqual(len(moderador.handoffs), 1)
        redactor = moderador.handoffs[0]
        self.assertEqual(redactor.name, "redactor")
        self.assertEqual(len(redactor.handoffs), 1)
        revisor = redactor.handoffs[0]
        self.assertEqual(revisor.name, "revisor")
        self.assertEqual(revisor.handoffs, [])
        self.assertTrue(revisor.output_guardrails)
        self.assertTrue(redactor.output_guardrails)

    def test_con_puente_de_AGF1023B(self):
        huella = E.ClienteOpenAI("http://127.0.0.1:4480/v1", "modelo-del-puente")
        moderador = self._equipo(puente=lambda _c: huella)
        self.assertEqual(moderador.name, "moderador")
        self.assertEqual(moderador.model, "modelo-del-puente")
        self.assertEqual(len(moderador.handoffs), 1)

    def test_sin_ni_base_url_ni_puente_falla_con_motivo(self):
        with self.assertRaises(ValueError):
            self._equipo()

    def test_puente_vacio_falla_con_motivo(self):
        with self.assertRaises(RuntimeError):
            self._equipo(puente=lambda _c: None)


if __name__ == "__main__":
    unittest.main()
