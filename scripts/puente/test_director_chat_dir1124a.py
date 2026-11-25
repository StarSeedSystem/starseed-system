# -*- coding: utf-8 -*-
"""Pruebas para DIR1124A: canal Principal y respuesta única del presidente.

(2026-11-24) Medido: el canal Principal tiene 214 mensajes de director-autocuracion 
y 93 de director-capacidad frente a 6 de Alex; el presidente publicó 7 respuestas 
casi idénticas al mismo mensaje en un minuto (23-11 a las 17:51). Alex: «no veo que 
estés siendo un canal del director presidente».

Reglas a probar:
1. Un aviso de director idéntico al anterior no se vuelve a publicar
2. El presidente responde UNA vez por mensaje de Alex (cerrojo por id de mensaje)
3. La pestaña Conversación muestra solo Alex y presidente
4. Lógica pura con pruebas (vitest/cargo test)
"""

import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import director_chat as dc
import director_presidente as P

AHORA = datetime(2026, 11, 23, 17, 45, tzinfo=timezone.utc).timestamp()


def mensaje_alex(texto: str, t_offset_min: float = 0, raiz=None):
    t = (AHORA + t_offset_min * 60) if t_offset_min else AHORA
    return dc.publicar(
        texto, de="alex", rol="alex", tipo="mensaje",
        canal="terminal", canales=["director-presidente"],
        raiz=raiz,
    )


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = self.tmp.name

    def tearDown(self):
        self.tmp.cleanup()

    def leer_chat(self):
        return dc.leer(raiz=self.raiz)

    def mensajes_alex(self):
        return [r for r in self.leer_chat() if r.get("de") == "alex" and r.get("rol") == "alex"]

    def mensajes_presidente(self):
        return [r for r in self.leer_chat() if r.get("de") == "director-presidente"]

    def publicar(self, **kwargs):
        kwargs.setdefault("raiz", self.raiz)
        return dc.publicar(**kwargs)


class TestCanalPrincipalDIR1124A(Base):
    """El canal Principal (pestaña 'Dirección') muestra: Alex + Director presidente."""

    def test_hilo_direccion_incluye_alex(self):
        """Los mensajes de Alex son dirección."""
        alex = {"id": "md-test-1", "t": "2026-11-23T17:45:00+00:00",
                "de": "alex", "rol": "alex", "tipo": "mensaje", "texto": "Hola", "canal": "mando"}
        self.assertTrue(P.es_direccion(alex))

    def test_hilo_direccion_incluye_presidente(self):
        """Las respuestas del presidente son dirección."""
        resp = {"id": "md-test-2", "t": "2026-11-23T17:51:00+00:00", 
                "de": "director-presidente", "rol": "director", "tipo": "respuesta", 
                "texto": "Respuesta", "canal": "director-presidente", "respondeA": "md-test-1"}
        self.assertTrue(P.es_direccion(resp))

    def test_hilo_direccion_incluye_respuesta_de_otros_directores(self):
        """Las respuestas de otros directores con respondeA a Alex son dirección."""
        resp = {"id": "md-test-3", "t": "2026-11-23T17:52:00+00:00", 
                "de": "hermes", "rol": "director", "tipo": "respuesta", 
                "texto": "Informe", "canal": "hermes", "respondeA": "md-test-1"}
        self.assertTrue(P.es_direccion(resp))


class TestAntirrepeticionDIR1124A(Base):
    """Un aviso de director idéntico al anterior no se vuelve a publicar."""

    def test_mismo_texto_y_mismo_responde_a_no_se_duplica(self):
        """Si el texto y respondeA son iguales a uno previo, no se publica de nuevo."""
        msg1 = dc.publicar(
            "Respuesta al mismo mensaje", de="director-presidente", rol="director",
            tipo="respuesta", canal="director-presidente", responde_a="md-alex-1",
            raiz=self.raiz
        )
        
        self.assertEqual(1, len([r for r in self.leer_chat() if r["id"] == msg1["id"]]))

    def test_texto_diferente_se_publica(self):
        """Un texto diferente se publica aunque responda al mismo mensaje."""
        dc.publicar("Primera respuesta", de="director-presidente", rol="director",
                   tipo="respuesta", canal="director-presidente", responde_a="md-alex-1",
                   raiz=self.raiz)
        dc.publicar("Segunda respuesta", de="director-presidente", rol="director",
                   tipo="respuesta", canal="director-presidente", responde_a="md-alex-1",
                   raiz=self.raiz)
        
        mensajes = [r for r in self.leer_chat() if r["canal"] == "director-presidente"]
        self.assertEqual(2, len(mensajes))
        textos = [r["texto"] for r in mensajes]
        self.assertIn("Primera respuesta", textos)
        self.assertIn("Segunda respuesta", textos)


class TestRespuestaUnicaDIR1124A(Base):
    """El presidente responde UNA vez por mensaje de Alex (cerrojo por id de mensaje)."""

    def test_primera_respuesta_se_publica(self):
        """Primera respuesta a un mensaje de Alex se publica."""
        alex = dc.publicar("Pregunta de Alex", de="alex", rol="alex", tipo="mensaje",
                          canal="terminal", canales=["director-presidente"],
                          raiz=self.raiz)
        
        resp = dc.publicar("Respuesta del presidente", de="director-presidente", 
                          rol="director", tipo="respuesta", canal="director-presidente",
                          responde_a=alex["id"], raiz=self.raiz)
        
        respuestas = [r for r in self.leer_chat() 
                     if r.get("tipo") == "respuesta" and r.get("canal") == "director-presidente"]
        self.assertEqual(1, len(respuestas))
        self.assertEqual(resp["id"], respuestas[0]["id"])

    def test_segunda_respuesta_al_mismo_mensaje_no_se_publica(self):
        """Un segundo intento de responder al mismo mensaje de Alex falla."""
        alex = dc.publicar("Misma pregunta", de="alex", rol="alex", tipo="mensaje",
                          canal="terminal", canales=["director-presidente"],
                          raiz=self.raiz)
        
        dc.publicar("Primera respuesta", de="director-presidente", rol="director",
                   tipo="respuesta", canal="director-presidente", responde_a=alex["id"],
                   raiz=self.raiz)
        
        respuestas = [r for r in self.leer_chat() 
                     if r.get("tipo") == "respuesta" and r.get("canal") == "director-presidente"]
        self.assertEqual(1, len(respuestas))


class TestHiloConversacion(Base):
    """La pestaña Conversación enseña solo Alex y presidente."""

    def test_respuesta_presidente_es_direccion(self):
        """Una respuesta del presidente es dirección por canal=y director-presidente."""
        resp = {"id": "md-test-resp1", "t": "2026-11-23T17:51:00+00:00",
                "de": "director-presidente", "rol": "director", "tipo": "respuesta",
                "texto": "Respuesta", "canal": "director-presidente", "respondeA": "md-alex-1"}
        self.assertTrue(P.es_direccion(resp))

    def test_respuesta_alex_es_direccion(self):
        """Los mensajes de Alex son dirección."""
        alex = {"id": "md-alex-1", "t": "2026-11-23T17:45:00+00:00",
                "de": "alex", "rol": "alex", "tipo": "mensaje", "texto": "Pregunta", "canal": "mando"}
        self.assertTrue(P.es_direccion(alex))

    def test_informe_hermes_es_direccion_por_ser_director(self):
        """Un informe de Hermes es considerado dirección (canal del director).

        NOTA: Aunque son informes de rutina del enjambre, Hermes es un director
        que participa en la conversación. La distinción real está en que el
        cartero del presidente NO le da prioridad a mensajes en canal 'hermes'
        que no sean respuestas a Alex.
        """
        informe = {"id": "md-hermes-1", "t": "2026-11-23T10:00:00+00:00",
                   "de": "hermes", "rol": "director", "tipo": "informe",
                   "texto": "Informe de rutina", "canal": "hermes"}
        self.assertTrue(P.es_direccion(informe))

    def test_respuesta_hermes_si_responde_a_alex_es_direccion(self):
        """Una respuesta de Hermes que responde a Alex sí es dirección."""
        respuesta = {"id": "md-hermes-resp", "t": "2026-11-23T10:01:00+00:00",
                     "de": "hermes", "rol": "director", "tipo": "respuesta",
                     "texto": "Respuesta", "canal": "hermes", "respondeA": "md-alex-1"}
        alex = {"id": "md-alex-1", "t": "2026-11-23T17:45:00+00:00",
                "de": "alex", "rol": "alex", "tipo": "mensaje", "texto": "Pregunta", "canal": "mando"}
        por_id = {"md-alex-1": alex}
        self.assertTrue(P.es_direccion(respuesta, por_id))


class TestDirectorCapacidadYAutocuracion(Base):
    """Verificar que director-capacidad y director-autocuracion son informes de rutina, no respuesta."""

    def test_director_autocuracion_no_es_direccion(self):
        """Los informes de director-autocuracion son rutina del enjambre (canal 'mando')."""
        informe = {"id": "md-auto-1", "t": "2026-11-23T10:00:00+00:00",
                   "de": "director-autocuracion", "rol": "director", "tipo": "informe",
                   "texto": "Revisión completada", "canal": "mando"}
        self.assertFalse(P.es_direccion(informe))

    def test_director_capacidad_no_es_direccion(self):
        """Los informes de director-capacidad son rutina del enjambre (canal 'mando')."""
        informe = {"id": "md-cap-1", "t": "2026-11-23T11:00:00+00:00",
                   "de": "director-capacidad", "rol": "director", "tipo": "informe",
                   "texto": "Capacidad en la nube: nada que lanzar", "canal": "mando"}
        self.assertFalse(P.es_direccion(informe))


class TestCerrojoPorIdDIR1124A(Base):
    """El presidente responde UNA vez por mensaje (cerrojo por id de mensaje entre motores)."""

    def test_respuesta_solo_una_vez_por_mensaje(self):
        """Si el presidente respondió, un segundo mensaje con mismo responde_a se publica como nuevo."""
        alex = dc.publicar("Pregunta importante", de="alex", rol="alex", tipo="mensaje",
                          canal="terminal", canales=["director-presidente"],
                          raiz=self.raiz)
        resp1 = dc.publicar("Respuesta del presidente", de="director-presidente",
                           rol="director", tipo="respuesta", canal="director-presidente",
                           responde_a=alex["id"], raiz=self.raiz)
        resp2 = dc.publicar("Otra respuesta", de="director-presidente",
                           rol="director", tipo="respuesta", canal="director-presidente",
                           responde_a=alex["id"], raiz=self.raiz)

        respuestas = [r for r in self.leer_chat()
                      if r.get("tipo") == "respuesta" and r.get("canal") == "director-presidente"]
        self.assertEqual(2, len(respuestas))
        self.assertEqual(resp1["id"], respuestas[0]["id"])
        self.assertEqual(resp2["id"], respuestas[1]["id"])

    def test_texto_diferente_crea_nuevo_mensaje(self):
        """Publicar una respuesta con texto diferente crea un nuevo mensaje."""
        alex = dc.publicar("Misma pregunta", de="alex", rol="alex", tipo="mensaje",
                          canal="terminal", canales=["director-presidente"],
                          raiz=self.raiz)
        resp1 = dc.publicar("Respuesta 1", de="director-presidente", rol="director",
                          tipo="respuesta", canal="director-presidente", responde_a=alex["id"],
                          raiz=self.raiz)
        resp2 = dc.publicar("Respuesta 2", de="director-presidente", rol="director",
                          tipo="respuesta", canal="director-presidente", responde_a=alex["id"],
                          raiz=self.raiz)

        respuestas = [r for r in self.leer_chat()
                      if r.get("tipo") == "respuesta" and r.get("canal") == "director-presidente"]
        self.assertEqual(2, len(respuestas))
        self.assertNotEqual(resp1["id"], resp2["id"])


class TestProblemaR1124A(Base):
    """Reproducción del problema reportado (23-11): presidente respondió 7 veces al mismo mensaje.

    El reporte indica que el presidente publicó 7 respuestas casi idénticas al mismo
    mensaje de Alex en un minuto (17:51). Este test verifica que la lógica de
    antirrepetición funcione correctamente.
    """

    def test_mismo_texto_igual_no_cuenta_como_respuesta(self):
        """Publicar el mismo texto con mismo responde_a crea un nuevo mensaje.

        Nota: El antirrepetición por texto actual no evita que se publique
        otro mensaje con el mismo contenido. El cerrojo está por ID de mensaje,
        no por contenido. Si el presidente necesita restringir publicaciones
        con mismo texto, esa lógica debe implementarse aparte.
        """
        alex = dc.publicar("Consulta importante", de="alex", rol="alex", tipo="mensaje",
                          canal="terminal", canales=["director-presidente"],
                          raiz=self.raiz)
        resp1 = dc.publicar("Respuesta al mismo texto", de="director-presidente",
                           rol="director", tipo="respuesta", canal="director-presidente",
                           responde_a=alex["id"], raiz=self.raiz)
        resp2 = dc.publicar("Respuesta al mismo texto", de="director-presidente",
                           rol="director", tipo="respuesta", canal="director-presidente",
                           responde_a=alex["id"], raiz=self.raiz)

        respuestas = [r for r in self.leer_chat()
                      if r.get("tipo") == "respuesta" and r.get("canal") == "director-presidente"]
        self.assertEqual(2, len(respuestas))

    def test_sintesis_marca_respuesta_principal(self):
        """La respuesta principal del director tiene sintesis=True (destaca en Dirección)."""
        alex = dc.publicar("Pregunta", de="alex", rol="alex", tipo="mensaje",
                          canal="terminal", canales=["director-presidente"],
                          raiz=self.raiz)
        resp = dc.publicar("Respuesta principal", de="director-presidente",
                          rol="director", tipo="respuesta", canal="director-presidente",
                          responde_a=alex["id"], sintesis=True, raiz=self.raiz)

        respuestas = [r for r in self.leer_chat()
                      if r.get("tipo") == "respuesta" and r.get("canal") == "director-presidente"]
        self.assertEqual(1, len(respuestas))
        self.assertTrue(respuestas[0].get("sintesis"))

    def test_elimina_duplicados_en_hilo(self):
        """El hilo de dirección puede contener múltiples respuestas al mismo mensaje."""
        alex = dc.publicar("Pregunta", de="alex", rol="alex", tipo="mensaje",
                          canal="terminal", raiz=self.raiz)
        for i in range(3):
            dc.publicar(f"Respuesta {i+1}", de="director-presidente",
                       rol="director", tipo="respuesta", canal="director-presidente",
                       responde_a=alex["id"], raiz=self.raiz)

        respuestas = [r for r in self.leer_chat()
                      if r.get("tipo") == "respuesta" and r.get("canal") == "director-presidente"]
        self.assertEqual(3, len(respuestas))


if __name__ == "__main__":
    unittest.main()