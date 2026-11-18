# -*- coding: utf-8 -*-
"""Pruebas del director de la pasada Maggabit (MAG10).

Herméticas: no tocan /Volumes, la red, ~/.starseed ni el disco real; todo va
con dobles (medio inventado, subprocess simulado, escritor en memoria).
"""
import os
import sys
import unittest
from types import SimpleNamespace

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import maggabit_ritmo as ritmo  # noqa: E402
import respaldo_maggabit as R  # noqa: E402

AHORA = 1_000_000.0
LISTO = {"estado": "listo", "presente": True, "trabajo_montado": True,
         "boveda": "cerrada"}
AUSENTE = {"estado": "ausente", "presente": False}


def medio_base(**cambios):
    medio = dict(LISTO)
    medio.update(cambios)
    return medio


def al_dia(**atrasos):
    ultimas = {t: AHORA for t in ritmo.RITMOS_S}
    ultimas.update(atrasos)
    return ultimas


class SubprocesoFalso:
    """Subprocess simulado: guarda cada argv y responde por programa."""

    def __init__(self, respuestas=None):
        self.llamadas = []
        self.respuestas = respuestas or {}

    def __call__(self, argv, **kw):
        self.llamadas.append(argv)
        respuesta = self.respuestas.get(argv[0])
        if respuesta is None:
            return SimpleNamespace(returncode=0, stdout="", stderr="")
        return SimpleNamespace(returncode=respuesta.get("codigo", 0),
                               stdout=respuesta.get("salida", ""),
                               stderr=respuesta.get("error", ""))


def _defecto(nombre):
    return lambda: {"estado": "hecho", "familia": nombre}


class PlanPasada(unittest.TestCase):
    def test_adjunta_la_imagen_cuando_no_esta_montada(self):
        plan = R.plan_pasada(medio_base(trabajo_montado=False), 0, 100.0, AHORA, {}, None)
        self.assertTrue(plan["montar"])

    def test_con_la_imagen_montada_no_adjunta(self):
        plan = R.plan_pasada(medio_base(), 0, 100.0, AHORA, {}, None)
        self.assertFalse(plan["montar"])

    def test_disco_ausente_no_adjunta_ni_propone_trabajo(self):
        plan = R.plan_pasada(AUSENTE, 0, 100.0, AHORA, {}, None)
        self.assertFalse(plan["montar"])
        self.assertIsNone(plan["trabajo"])
        self.assertIn("disco", plan["motivo"])


class UnaPasada(unittest.TestCase):
    def pasada(self, medio, presion=0, ultimas=None, ejecutores=None, sub=None):
        sub = sub or SubprocesoFalso()
        guardado = []
        resultado = R.una_pasada(lambda: medio, presion, 100.0, sub, AHORA,
                                 ultimas=ultimas if ultimas is not None else al_dia(),
                                 ejecutores=ejecutores, guardar=guardado.append)
        return resultado, sub, guardado

    def test_con_presion_dos_no_copia(self):
        llamadas = []
        resultado, sub, _ = self.pasada(medio_base(), presion=2,
                                        ejecutores={"memoria": _defecto("memoria")})
        self.assertIsNone(resultado["trabajo"])
        self.assertIn("presión", resultado["motivo"])
        self.assertEqual([], sub.llamadas)

    def test_el_trabajo_elegido_se_ejecuta_y_solo_ese(self):
        servidos = []
        ejecutores = {"memoria": lambda: servidos.append("memoria") or {"estado": "hecho"},
                      "desarrollo": lambda: servidos.append("desarrollo") or {"estado": "hecho"}}
        resultado, _, guardado = self.pasada(
            medio_base(), ultimas=al_dia(memoria=AHORA - 301.0), ejecutores=ejecutores)
        self.assertEqual(["memoria"], servidos)
        self.assertEqual("memoria", resultado["trabajo"])
        self.assertEqual("trabajo-servido", resultado["estado"])
        self.assertEqual({"estado": "hecho"}, resultado["ejecucion"])
        self.assertEqual(1, len(guardado))

    def test_familia_sin_modulo_se_anota(self):
        medio = medio_base(boveda="abierta")
        resultado, _, _ = self.pasada(medio, ultimas=al_dia(boveda=AHORA - 3601.0))
        self.assertEqual("boveda", resultado["trabajo"])
        self.assertEqual({"estado": "sin-módulo"}, resultado["ejecucion"])

    def test_si_la_imagen_no_adjunta_no_se_copia(self):
        sub = SubprocesoFalso({"hdiutil": {"codigo": 1, "error": "no se pudo adjuntar"}})
        resultado, sub2, _ = self.pasada(medio_base(trabajo_montado=False), sub=sub)
        self.assertEqual("sin-montar", resultado["estado"])
        self.assertEqual(1, len(sub2.llamadas))
        self.assertIn("-owners", sub2.llamadas[0])
        self.assertIn("on", sub2.llamadas[0])


class Cerrojo(unittest.TestCase):
    def test_libre_devuelve_la_mano(self):
        mano = object()
        bloqueos = []
        tomado = R.tomar_cerrojo("/tmp/falso/pasada.lock",
                                 abrir=lambda ruta, modo: mano,
                                 bloquear=lambda f, m: bloqueos.append(m))
        self.assertIs(mano, tomado)
        self.assertEqual(1, len(bloqueos))

    def test_ocupado_devuelve_none(self):
        def bloquear(f, m):
            raise OSError("ocupado")
        tomado = R.tomar_cerrojo("/tmp/falso/pasada.lock", abrir=lambda ruta, modo: object(),
                                 bloquear=bloquear)
        self.assertIsNone(tomado)


class Expulsar(unittest.TestCase):
    def test_imagen_ocupada_lo_dice_y_no_fuerza(self):
        sub = SubprocesoFalso({"hdiutil": {"codigo": 1, "error": "recurso en uso"}})
        salida = R.expulsar(sub, lambda: medio_base(), montados=[R.TRABAJO])
        self.assertEqual("imagen-ocupada", salida["estado"])
        self.assertEqual([R.TRABAJO], salida["quedo"])
        self.assertEqual([], salida["hecho"])
        self.assertFalse(any(argv[0] == "diskutil" for argv in sub.llamadas))

    def test_todo_bien_expulsa_el_disco(self):
        salida = R.expulsar(SubprocesoFalso(), lambda: medio_base(),
                            montados=[R.TRABAJO, R.BOVEDA])
        self.assertEqual("expulsado", salida["estado"])
        self.assertEqual([], salida["quedo"])
        self.assertEqual([R.TRABAJO, R.BOVEDA], salida["hecho"])

    def test_disco_ausente_no_llama_a_nada(self):
        sub = SubprocesoFalso()
        salida = R.expulsar(sub, lambda: dict(AUSENTE))
        self.assertEqual("sin-disco", salida["estado"])
        self.assertEqual([], sub.llamadas)


class Ordenes(unittest.TestCase):
    def main(self, argv, medio, sub=None):
        sub = sub or SubprocesoFalso()
        escritos = []
        codigo = R.main(argv, leer_medio_fn=lambda: medio, ejecutar_fn=sub,
                        escribir=escritos.append, guardar=lambda d: ["guardado"],
                        abrir=lambda ruta, modo: object(), bloquear=lambda f, m: None)
        return codigo, escritos, sub

    def test_pasada_con_disco_ausente_sale_cero(self):
        codigo, escritos, sub = self.main(["pasada"], dict(AUSENTE))
        self.assertEqual(0, codigo)
        self.assertEqual([], sub.llamadas)
        self.assertTrue(escritos)

    def test_pasada_ocupada_no_arranca_otra(self):
        escritos = []

        def bloquear(f, m):
            raise OSError("ocupado")

        codigo = R.main(["pasada"], leer_medio_fn=lambda: medio_base(),
                        ejecutar_fn=SubprocesoFalso(), escribir=escritos.append,
                        guardar=lambda d: [], abrir=lambda r, m: object(),
                        bloquear=bloquear)
        self.assertEqual(0, codigo)
        self.assertTrue(any("pasada en marcha" in t for t in escritos))

    def test_orden_desconocida_devuelve_dos(self):
        codigo, escritos, _ = self.main(["desconocida"], medio_base())
        self.assertEqual(2, codigo)
        self.assertTrue(any("Uso" in t for t in escritos))

    def test_expulsar_sin_disco_sale_cero(self):
        codigo, escritos, sub = self.main(["expulsar"], dict(AUSENTE))
        self.assertEqual(0, codigo)
        self.assertEqual([], sub.llamadas)
        self.assertTrue(any("sin-disco" in t for t in escritos))


if __name__ == "__main__":
    unittest.main()
