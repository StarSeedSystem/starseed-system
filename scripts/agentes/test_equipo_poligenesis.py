# -*- coding: utf-8 -*-
"""equipo_poligenesis: traspasos, guarda de datos personales y modelos simulados, sin red."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    from agents import OutputGuardrailTripwireTriggered
    from agents.testing import ScriptedModel, assistant_message, function_call

    import equipo_poligenesis as E
    from modelos_propios import ClienteOpenAI
except ImportError as exc:  # falta openai-agents en esta máquina
    MOTIVO_SALTO = "falta openai-agents: %s" % exc
else:
    MOTIVO_SALTO = None


@unittest.skipIf(MOTIVO_SALTO is not None, MOTIVO_SALTO or "")
class DatosPersonales(unittest.TestCase):
    def test_texto_limpio(self):
        self.assertEqual(E.tipos_datos_personales("Una propuesta para el equipo de diseño"), [])
        self.assertEqual(E.tipos_datos_personales(None), [])

    def test_detecta_cada_tipo(self):
        self.assertEqual(E.tipos_datos_personales("escribe a ana@example.com"), ["correo"])
        self.assertEqual(E.tipos_datos_personales("llama al +34 612 345 678"), ["teléfono"])
        self.assertEqual(E.tipos_datos_personales("DNI 12345678Z"), ["DNI/NIE"])
        self.assertEqual(E.tipos_datos_personales("NIE X1234567L"), ["DNI/NIE"])
        self.assertEqual(E.tipos_datos_personales("IBAN ES91 2100 0418 4502 0005 1332"), ["IBAN"])

    def test_no_repite_el_mismo_tipo(self):
        texto = "ana@example.com y luis@example.com"
        self.assertEqual(E.tipos_datos_personales(texto), ["correo"])


@unittest.skipIf(MOTIVO_SALTO is not None, MOTIVO_SALTO or "")
class PuenteDelEnrutador(unittest.TestCase):
    def setUp(self):
        self.cliente = ClienteOpenAI("http://127.0.0.1:4480/v1", "qwen-coder", "clave-falsa")

    def test_el_modelo_usa_la_base_url_del_enrutador(self):
        modelo = E.modelo_desde_cliente(self.cliente)
        self.assertEqual(getattr(modelo, "model"), "qwen-coder")
        self.assertEqual(str(modelo._client.base_url).rstrip("/"), "http://127.0.0.1:4480/v1")
        self.assertNotIn("clave-falsa", repr(self.cliente))

    def test_sin_cliente_avisa(self):
        original = E.cliente_openai_compatible
        E.cliente_openai_compatible = lambda capacidad="texto": None
        try:
            with self.assertRaises(E.SinProveedorDeModelo):
                E.modelo_desde_cliente(None)
        finally:
            E.cliente_openai_compatible = original

    def test_el_equipo_encadena_los_tres_papeles(self):
        equipo = E.crear_equipo(E.modelo_desde_cliente(self.cliente))
        self.assertEqual(equipo.name, "moderador")
        self.assertEqual(equipo.handoffs[0].name, "redactor")
        self.assertEqual(equipo.handoffs[0].handoffs[0].name, "revisor")
        guardas = equipo.handoffs[0].handoffs[0].output_guardrails
        self.assertEqual([g.get_name() for g in guardas], ["sin_datos_personales"])


def _traspaso(nombre: str, identificador: str):
    return [function_call("transfer_to_" + nombre, {}, call_id=identificador)]


@unittest.skipIf(MOTIVO_SALTO is not None, MOTIVO_SALTO or "")
class EquipoEnMarcha(unittest.TestCase):
    def test_moderador_redactor_y_revisor(self):
        modelo = ScriptedModel([
            _traspaso("redactor", "h1"),
            _traspaso("revisor", "h2"),
            [assistant_message("Propuesta aprobada: revisar el calendario del equipo.")],
        ])
        resultado = E.atender("Prepara una propuesta para el equipo", modelo=modelo)
        modelo.assert_complete()
        self.assertEqual(resultado.last_agent.name, "revisor")
        self.assertIn("Propuesta aprobada", str(resultado.final_output))
        self.assertEqual(len(modelo.calls), 3)
        traspasos = [[h.tool_name for h in llamada.handoffs] for llamada in modelo.calls]
        self.assertIn("transfer_to_redactor", traspasos[0])
        self.assertIn("transfer_to_revisor", traspasos[1])

    def test_la_guarda_veta_correos_y_telefonos(self):
        modelo = ScriptedModel([
            _traspaso("redactor", "h1"),
            _traspaso("revisor", "h2"),
            [assistant_message("Escribe a ana@example.com o llama al +34 612 345 678.")],
        ])
        with self.assertRaises(OutputGuardrailTripwireTriggered):
            E.atender("Prepara una propuesta", modelo=modelo)
        modelo.assert_complete()

    def test_la_guarda_no_veta_una_salida_limpia(self):
        modelo = ScriptedModel([
            _traspaso("redactor", "h1"),
            _traspaso("revisor", "h2"),
            [assistant_message("Todo correcto: la propuesta se puede ejecutar.")],
        ])
        resultado = E.atender("Revisa la propuesta", modelo=modelo)
        modelo.assert_complete()
        self.assertEqual(resultado.final_output, "Todo correcto: la propuesta se puede ejecutar.")


if __name__ == "__main__":
    unittest.main()
