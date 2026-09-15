# -*- coding: utf-8 -*-
"""Las puertas tienen que juzgar el código, no la máquina donde corren.

El botón «Commitear y publicar» lo lanza el servidor del Mando, y ese servidor
corre con `STARSEED_LOCAL=1` y `STARSEED_MANDO=1` para poder servirse a sí mismo.
La primera vez que se pulsó, el publicador heredó esas variables y dos pruebas de
`esDespliegueLocal` se pusieron en rojo sin que nadie hubiera tocado ese código.
Un rojo falso es peor que no tener puerta: enseña a ignorarla.
"""

import os
import sys
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import publicar as P


class PruebaEntornoDePuertas(unittest.TestCase):
    def test_quita_lo_que_cambia_el_comportamiento_de_la_app(self):
        env = P.entorno_de_puertas(
            {
                "STARSEED_LOCAL": "1",
                "STARSEED_MANDO": "1",
                "VERCEL": "1",
                "VERCEL_ENV": "production",
                "CI": "true",
                "NODE_ENV": "production",
                "PATH": "/usr/bin",
            }
        )
        for clave in ("STARSEED_LOCAL", "STARSEED_MANDO", "VERCEL", "VERCEL_ENV", "CI", "NODE_ENV"):
            self.assertNotIn(clave, env, "%s tenía que quedarse fuera" % clave)

    def test_no_se_lleva_por_delante_lo_demas(self):
        env = P.entorno_de_puertas({"HOME": "/Users/alex", "PATH": "/usr/bin", "LANG": "es_ES.UTF-8"})
        self.assertEqual(env["HOME"], "/Users/alex")
        self.assertEqual(env["LANG"], "es_ES.UTF-8")

    def test_el_node_del_repo_va_delante_en_el_PATH(self):
        # El primer node del PATH de la Mac es un 20.17 que rompe jsdom y deja
        # nueve archivos de prueba sin cargar SIN avisar.
        env = P.entorno_de_puertas({"PATH": "/usr/bin"}, bin_extra="/nvm/v22/bin")
        self.assertTrue(env["PATH"].startswith("/nvm/v22/bin" + os.pathsep))
        self.assertIn("/usr/bin", env["PATH"])

    def test_sin_node_extra_el_PATH_no_se_toca(self):
        env = P.entorno_de_puertas({"PATH": "/usr/bin"})
        self.assertEqual(env["PATH"], "/usr/bin")

    def test_no_muta_el_entorno_que_le_pasan(self):
        base = {"STARSEED_LOCAL": "1", "PATH": "/usr/bin"}
        P.entorno_de_puertas(base, bin_extra="/nvm/v22/bin")
        self.assertEqual(base, {"STARSEED_LOCAL": "1", "PATH": "/usr/bin"})


class PruebaCuandoHaceFaltaConstruir(unittest.TestCase):
    def test_los_pasos_estan_todos_y_en_orden(self):
        claves = [c for c, _ in P.PASOS]
        self.assertEqual(
            claves,
            ["rama", "commit", "tsc", "vitest", "python", "build", "push", "verificacion"],
        )
        # El push va después de las cuatro puertas y antes de la verificación.
        self.assertLess(claves.index("build"), claves.index("push"))
        self.assertLess(claves.index("push"), claves.index("verificacion"))


if __name__ == "__main__":
    unittest.main()
