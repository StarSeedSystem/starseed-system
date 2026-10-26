#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de scripts/agentes/equipo_poligenesis.py (unittest, sin red ni claves).

  cd scripts/agentes && python3 -m unittest -v test_equipo_poligenesis

El SDK se sustituye por un doble local; si openai-agents no está instalado, las
pruebas contra el SDK real se saltan con su motivo.
"""
import asyncio
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import equipo_poligenesis as E  # noqa: E402

try:
    import agents  # noqa: F401
    HAY_SDK = True
except ImportError:
    HAY_SDK = False


class AgenteFalso:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)


class SDKFalso:
    Agent = AgenteFalso
    trazas_apagadas = None

    @staticmethod
    def set_tracing_disabled(apagadas):
        SDKFalso.trazas_apagadas = apagadas

    @staticmethod
    def output_guardrail(fn):
        return fn

    @staticmethod
    def GuardrailFunctionOutput(**kwargs):
        return kwargs

    class Runner:
        @staticmethod
        async def run(agente, mensaje):
            return type("Resultado", (), {"final_output": "Propuesta para ana@x.com"})


class DatosPersonales(unittest.TestCase):
    def test_detecta_etiquetas_sin_devolver_el_valor(self):
        texto = "Ana (ana@x.com, 612 345 678, DNI 12345678Z, ES91 2100 0418 4502 0005 1332)"
        etiquetas = E.detectar_datos_personales(texto)
        self.assertEqual(etiquetas, ["correo", "telefono", "dni", "iban"])
        self.assertNotIn("ana@x.com", etiquetas)
        self.assertTrue(E.contiene_datos_personales(texto))

    def test_texto_limpio_no_dispara(self):
        self.assertEqual(E.detectar_datos_personales("Propuesta sin datos"), [])
        self.assertFalse(E.contiene_datos_personales(None))
        self.assertFalse(E.contiene_datos_personales(""))

    def test_sanea_todos_los_datos(self):
        texto = "Escribe a ana@x.com o al 612345678; DNI 12345678Z; ES9121000418450200051332"
        limpio = E.sanear_salida(texto)
        for dato in ("ana@x.com", "612345678", "12345678Z", "ES9121000418450200051332"):
            self.assertNotIn(dato, limpio)
        self.assertIn(E.MARCA, limpio)

    def test_guarda_salida_da_veredicto(self):
        sucio = E.guarda_salida("Contacto: ana@x.com")
        self.assertFalse(sucio["seguro"])
        self.assertEqual(sucio["motivos"], ["correo"])
        self.assertNotIn("ana@x.com", sucio["texto"])
        limpio = E.guarda_salida("Propuesta general")
        self.assertTrue(limpio["seguro"])
        self.assertEqual(limpio["texto"], "Propuesta general")


class Equipo(unittest.TestCase):
    def setUp(self):
        self.modelo = object()
        self.equipo = E.construir_equipo(self.modelo, sdk=SDKFalso)
        self.revisor = self.equipo.handoffs[0].handoffs[0]

    def test_cadena_y_guarda(self):
        self.assertEqual([self.equipo.name, self.equipo.handoffs[0].name, self.revisor.name],
                         ["moderador", "redactor", "revisor"])
        self.assertIn("datos personales", self.revisor.instructions)
        self.assertEqual(len(self.revisor.output_guardrails), 1)
        self.assertTrue(SDKFalso.trazas_apagadas)

    def test_guarda_atrapa_datos(self):
        guarda = self.revisor.output_guardrails[0]
        salida = asyncio.run(guarda(None, None, "escribe a ana@x.com"))
        self.assertTrue(salida["tripwire_triggered"])
        self.assertEqual(salida["output_info"], {"motivos": ["correo"]})
        limpia = asyncio.run(guarda(None, None, "propuesta general"))
        self.assertFalse(limpia["tripwire_triggered"])

    def test_ejecutar_sanea_la_salida(self):
        texto = asyncio.run(E.ejecutar("una propuesta", modelo=self.modelo, sdk=SDKFalso))
        self.assertNotIn("ana@x.com", texto)
        self.assertIn(E.MARCA, texto)

    def test_roles_y_traspasos(self):
        self.assertEqual(E.ROLES, ("moderador", "redactor", "revisor"))
        self.assertEqual(E.TRASPASOS["moderador"], ("redactor",))
        self.assertEqual(E.TRASPASOS["revisor"], ())

    @unittest.skipUnless(HAY_SDK, "falta openai-agents; se omite la prueba contra el SDK real")
    def test_modelo_real_apunta_al_enrutador_propio(self):
        cliente = E.enrutador.ClienteOpenAI("http://127.0.0.1:4480/v1", "modelo-prueba")
        modelo = E.construir_modelo(cliente)
        self.assertEqual(modelo.model, "modelo-prueba")

