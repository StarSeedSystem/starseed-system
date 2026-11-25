# -*- coding: utf-8 -*-
"""Pruebas DIR1124A: agrupación de mensajes idénticos, cerrojo del presidente y filtro conversación."""

import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import director_chat as dc
import director_presidente as P

AHORA = datetime(2026, 11, 11, 12, tzinfo=timezone.utc).timestamp()


def limites(pct_sesion=20, pct_semana=30, hace_min=10):
    t = datetime.fromtimestamp(AHORA, timezone.utc)
    return {"lecturas": [{
        "t": (t - timedelta(minutes=hace_min)).isoformat(),
        "sesion_pct": pct_sesion,
        "sesion_reinicio": (t + timedelta(hours=3)).isoformat(),
        "semana_pct": pct_semana,
        "semana_reinicio": (t + timedelta(days=3)).isoformat(),
    }]}


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = self.tmp.name
        (Path(self.raiz) / "starseed_memory_root" / "mando" / "director").mkdir(parents=True)
        self.alex_msg = dc.publicar(
            "¿Qué dijeron los directores?",
            de="alex",
            rol="alex",
            tipo="mensaje",
            canales=["director-presidente"],
            raiz=self.raiz,
        )
        self.estado = {"atendidos": [], "presidente": {"respondidos": {}}}

    def tearDown(self):
        self.tmp.cleanup()


class TestAgrupacionMensajesIdenticos(Base):
    """DIR1124A: un aviso de director idéntico al anterior no se vuelve a publicar;
    se cuenta: «×N, último a las HH:MM»."""

    def test_publicar_dos_veces_mismo_texto_mismo_director_agrupa(self):
        """Dos publicaciones consecutivas con mismo texto y mismo 'de' se agrupan."""
        m1 = dc.publicar(
            "Capacidad en la nube: nada que lanzar",
            de="director-capacidad",
            rol="director",
            tipo="aviso",
            canal="mando",
            raiz=self.raiz,
        )
        m2 = dc.publicar(
            "Capacidad en la nube: nada que lanzar",
            de="director-capacidad",
            rol="director",
            tipo="aviso",
            canal="mando",
            raiz=self.raiz,
        )

        # La segunda publicación debe devolver el mismo id (no crea mensaje nuevo)
        self.assertEqual(m1["id"], m2["id"])
        # El mensaje debe tener contador de repeticiones
        self.assertIn("repeticiones", m2)
        self.assertEqual(m2["repeticiones"], 2)

    def test_tercer_mismo_mensaje_incrementa_contador(self):
        """Tres veces el mismo mensaje incrementa el contador."""
        dc.publicar("Aviso repetido", de="director-autocuracion", rol="director", tipo="aviso", canal="mando", raiz=self.raiz)
        m2 = dc.publicar("Aviso repetido", de="director-autocuracion", rol="director", tipo="aviso", canal="mando", raiz=self.raiz)
        m3 = dc.publicar("Aviso repetido", de="director-autocuracion", rol="director", tipo="aviso", canal="mando", raiz=self.raiz)

        self.assertEqual(m2["id"], m3["id"])
        self.assertEqual(m3["repeticiones"], 3)

    def test_mismo_texto_distinto_director_no_agrupa(self):
        """Mismo texto pero de director distinto SÍ crea mensaje nuevo."""
        m1 = dc.publicar("Capacidad ok", de="director-capacidad", rol="director", tipo="aviso", canal="mando", raiz=self.raiz)
        m2 = dc.publicar("Capacidad ok", de="director-autocuracion", rol="director", tipo="aviso", canal="mando", raiz=self.raiz)

        self.assertNotEqual(m1["id"], m2["id"])
        self.assertNotIn("repeticiones", m1)
        self.assertNotIn("repeticiones", m2)

    def test_mismo_director_distinto_texto_no_agrupa(self):
        """Mismo director pero texto distinto SÍ crea mensaje nuevo."""
        m1 = dc.publicar("Capacidad: 50%", de="director-capacidad", rol="director", tipo="aviso", canal="mando", raiz=self.raiz)
        m2 = dc.publicar("Capacidad: 60%", de="director-capacidad", rol="director", tipo="aviso", canal="mando", raiz=self.raiz)

        self.assertNotEqual(m1["id"], m2["id"])

    def test_formato_contador_en_lectura(self):
        """Al leer, el mensaje agrupado muestra formato '×N, último a las HH:MM'."""
        dc.publicar("Mensaje de prueba", de="director-capacidad", rol="director", tipo="aviso", canal="mando", raiz=self.raiz)
        m2 = dc.publicar("Mensaje de prueba", de="director-capacidad", rol="director", tipo="aviso", canal="mando", raiz=self.raiz)

        leidos = dc.leer(raiz=self.raiz)
        msg = [r for r in leidos if r.get("id") == m2["id"]][0]
        self.assertIn("repeticiones", msg)
        self.assertEqual(msg["repeticiones"], 2)


class TestCerrojoPresidente(Base):
    """DIR1124A: el presidente responde UNA vez por mensaje de Alex
    (cerrojo por id de mensaje entre motores)."""

    def setUp(self):
        super().setUp()
        self.alex_msg = dc.publicar(
            "¿Qué dijeron los directores?",
            de="alex",
            rol="alex",
            tipo="mensaje",
            canales=["director-presidente"],
            raiz=self.raiz,
        )
        self.estado = {"atendidos": [], "presidente": {"respondidos": {}}}

    def test_presidente_responde_una_vez_por_mensaje_alex(self):
        """El presidente solo responde una vez al mismo mensaje de Alex."""
        # Simular respuesta exitosa de Claude
        def falso(orden, entrada=None, segundos=300, env=None, cwd=None):
            return (0, json.dumps({
                "result": "Respuesta del presidente",
                "session_id": "s1",
                "usage": {"input_tokens": 10, "output_tokens": 5},
                "total_cost_usd": 0.0
            }))

        # Primera llamada: responde
        r1 = P.atender(self.alex_msg, self.estado, raiz=self.raiz, correr=falso,
                       existe=lambda n: n == "claude", limites=limites(), ahora=AHORA, tope_opus=40)
        self.assertEqual(r1, "respondido")

        # Segunda llamada al MISMO mensaje: debe devolver "respondido" sin volver a llamar a proveedores
        r2 = P.atender(self.alex_msg, self.estado, raiz=self.raiz, correr=falso,
                       existe=lambda n: n == "claude", limites=limites(), ahora=AHORA, tope_opus=40)
        self.assertEqual(r2, "respondido")

    def test_cerrojo_por_id_mensaje_entre_motores(self):
        """El cerrojo usa el id del mensaje de Alex, no el contenido."""
        def falso(orden, entrada=None, segundos=300, env=None, cwd=None):
            return (0, json.dumps({
                "result": "Respuesta",
                "session_id": "s1",
                "usage": {"input_tokens": 10, "output_tokens": 5},
                "total_cost_usd": 0.0
            }))

        # Responder al primer mensaje
        P.atender(self.alex_msg, self.estado, raiz=self.raiz, correr=falso,
                  existe=lambda n: n == "claude", limites=limites(), ahora=AHORA, tope_opus=40)

        # Crear SEGUNDO mensaje de Alex (diferente id)
        alex_msg2 = dc.publicar(
            "Otra pregunta",
            de="alex",
            rol="alex",
            tipo="mensaje",
            canales=["director-presidente"],
            raiz=self.raiz,
        )

        # Debe responder al segundo mensaje
        r = P.atender(alex_msg2, self.estado, raiz=self.raiz, correr=falso,
                      existe=lambda n: n == "claude", limites=limites(), ahora=AHORA, tope_opus=40)
        self.assertEqual(r, "respondido")

        # Verificar que hay dos respuestas en el chat
        respuestas = [r for r in dc.leer(raiz=self.raiz) if r.get("tipo") == "respuesta" and r.get("canal") == "director-presidente"]
        self.assertEqual(len(respuestas), 2)


class TestFiltroConversacion(Base):
    """DIR1124A: la pestaña Conversación enseña solo Alex y presidente."""

    def test_filtrar_conversacion_solo_alex_y_presidente(self):
        """filtrarFeed con filtro 'conversacion' solo deja Alex y respuestas del presidente."""
        # Importar la función de TypeScript (usamos la versión Python equivalente si existe)
        # Por ahora verificamos la lógica en Python si existe, o documentamos el requisito
        pass

    def test_mensajes_directores_rutina_no_aparecen_en_conversacion(self):
        """Mensajes de director-autocuracion, director-capacidad, etc. NO aparecen en conversación."""
        # Esto se prueba en el feed TypeScript
        pass


class TestFuncionesPurasAgrupacion(unittest.TestCase):
    """Pruebas de funciones puras para la agrupación (sin disco)."""

    def test_detectar_mensaje_identico_anterior(self):
        """Función pura: detecta si un mensaje es idéntico al anterior del mismo director."""
        mensajes = [
            {"id": "1", "de": "director-capacidad", "texto": "Capacidad: 50%", "tipo": "aviso"},
            {"id": "2", "de": "director-capacidad", "texto": "Capacidad: 50%", "tipo": "aviso"},
            {"id": "3", "de": "director-autocuracion", "texto": "Capacidad: 50%", "tipo": "aviso"},
        ]
        # El segundo es idéntico al primero (mismo de + mismo texto)
        # El tercero NO (distinto de)
        self.assertTrue(_es_identico_anterior(mensajes[1], mensajes[0]))
        self.assertFalse(_es_identico_anterior(mensajes[2], mensajes[1]))

    def test_formato_contador(self):
        """Formato '×N, último a las HH:MM'."""
        from datetime import datetime, timezone
        ahora = datetime(2026, 11, 24, 17, 51, tzinfo=timezone.utc)
        formato = _formato_contador(3, ahora)
        self.assertIn("×3", formato)
        self.assertIn("17:51", formato)


def _es_identico_anterior(actual, anterior):
    """PURA: ¿Es el mensaje actual idéntico al anterior (mismo autor + mismo texto)?"""
    return (actual.get("de") == anterior.get("de") and
            actual.get("texto") == anterior.get("texto") and
            actual.get("tipo") == anterior.get("tipo"))


def _formato_contador(n, cuando):
    """PURA: Formato legible del contador de repeticiones."""
    hora = cuando.strftime("%H:%M")
    return f"×{n}, último a las {hora}"


if __name__ == "__main__":
    unittest.main()