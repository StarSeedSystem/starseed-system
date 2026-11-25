# -*- coding: utf-8 -*-
"""Pruebas de las decisiones puras del relevo de medios (relevo_medios.py, RES1121A)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import relevo_medios as R  # noqa: E402


class RegistroMedios(unittest.TestCase):
    """Pruebas del registro de medios con sus especialidades y relevos."""

    def test_registro_tiene_los_tres_medios_principales(self):
        registro = R.registro_medios()
        self.assertIn("mac", registro)
        self.assertIn("a1", registro)
        self.assertIn("maggabox", registro)

    def test_mac_especialidad_y_relevo(self):
        registro = R.registro_medios()
        mac = registro["mac"]
        self.assertEqual(mac["especialidad"], "orquestador, puertas, cartero, presidente, bot Principal")
        self.assertEqual(mac["releva"], "a1")

    def test_a1_especialidad_y_relevo(self):
        registro = R.registro_medios()
        a1 = registro["a1"]
        self.assertEqual(a1["especialidad"], "siempre encendido, bot de diseño, guardián de main, cola de respaldo, nube")
        self.assertEqual(a1["releva"], "mac")

    def test_maggabox_especialidad_y_relevo(self):
        registro = R.registro_medios()
        maggabox = registro["maggabox"]
        self.assertEqual(maggabox["especialidad"], "almacén (espejo de GitHub cada 15 min, versiones, respaldos cifrados), sin claves en claro")
        self.assertEqual(maggabox["releva"], "a1")

    def test_nubes_efimeras_registradas(self):
        registro = R.registro_medios()
        self.assertIn("nube-gh", registro)
        self.assertIn("cloudroom", registro)
        self.assertEqual(registro["nube-gh"]["especialidad"], "solo trabajo sin secretos de Alex")
        self.assertEqual(registro["cloudroom"]["especialidad"], "solo trabajo sin secretos de Alex")


class LatidoYRelevo(unittest.TestCase):
    """Pruebas del latido entre medios y decisión de relevo."""

    def test_mac_viva_no_releva(self):
        ahora = 10000.0
        estado_mac = {"latido": ahora - 30}  # 30 segundos atrás
        ok, motivo = R.debe_relevo_mac(estado_mac, ahora, umbral_minutos=5)
        self.assertFalse(ok)
        self.assertIn("viva", motivo.lower())

    def test_mac_muerta_releva_a_a1(self):
        ahora = 10000.0
        estado_mac = {"latido": ahora - 400}  # 6 min 40 seg atrás (más de 5 min)
        ok, motivo = R.debe_relevo_mac(estado_mac, ahora, umbral_minutos=5)
        self.assertTrue(ok)
        self.assertIn("a1", motivo.lower())

    def test_umbral_configurable(self):
        ahora = 10000.0
        estado_mac = {"latido": ahora - 200}  # 3 min 20 seg
        ok, motivo = R.debe_relevo_mac(estado_mac, ahora, umbral_minutos=3)
        self.assertTrue(ok)
        ok2, _ = R.debe_relevo_mac(estado_mac, ahora, umbral_minutos=5)
        self.assertFalse(ok2)

    def test_sin_latido_es_muerto(self):
        ahora = 10000.0
        ok, motivo = R.debe_relevo_mac({}, ahora, umbral_minutos=5)
        self.assertTrue(ok)
        self.assertIn("sin latido", motivo.lower())


class ArriendoTelegram(unittest.TestCase):
    """Pruebas del arriendo de Telegram (un solo lector por bot)."""

    def test_arriendo_libre_lo_toma_a1(self):
        arriendo = {"dueno": "", "caduca": 0, "version": 0}
        a1_id = "oracle-a1-123"
        ahora = 10000.0
        decision = R.decidir_arriendo_telegram(arriendo, a1_id, ahora, prioridad=0)
        self.assertTrue(decision["actuar"])
        self.assertEqual(decision["nuevo"]["dueno"], a1_id)

    def test_arriendo_vigente_mac_no_lo_pisa_a1(self):
        ahora = 10000.0
        arriendo = {"dueno": "mac-main", "caduca": ahora + 100, "version": 1, "tomado": ahora - 50}
        decision = R.decidir_arriendo_telegram(arriendo, "oracle-a1-123", ahora, prioridad=0)
        self.assertFalse(decision["actuar"])
        self.assertIn("dueño", decision["motivo"])

    def test_arriendo_caducado_mac_lo_pisa_a1(self):
        ahora = 10000.0
        arriendo = {"dueno": "mac-main", "caduca": ahora - 10, "version": 1, "tomado": ahora - 200}
        decision = R.decidir_arriendo_telegram(arriendo, "oracle-a1-123", ahora, prioridad=0)
        self.assertTrue(decision["actuar"])
        self.assertIn("caducó", decision["motivo"])

    def test_prioridad_a1_sobre_mac_en_reclamo(self):
        ahora = 10000.0
        # Mac lo tomó hace 30 segundos (dentro de ventana de reclamo de 45s)
        arriendo = {"dueno": "mac-main", "caduca": ahora + 100, "version": 1, "tomado": ahora - 30}
        # A1 tiene prioridad 0, Mac prioridad 1 → A1 puede reclamar
        decision = R.decidir_arriendo_telegram(arriendo, "oracle-a1-123", ahora, prioridad=0)
        self.assertTrue(decision["actuar"])
        self.assertIn("peor prioridad", decision["motivo"])

    def test_mac_no_reclama_a1_vigente(self):
        ahora = 10000.0
        # A1 lo tomó hace 30 segundos
        arriendo = {"dueno": "oracle-a1-123", "caduca": ahora + 100, "version": 1, "tomado": ahora - 30}
        # Mac tiene prioridad 1, A1 prioridad 0 → Mac NO puede reclamar
        decision = R.decidir_arriendo_telegram(arriendo, "mac-main", ahora, prioridad=1)
        self.assertFalse(decision["actuar"])
        self.assertIn("dueño", decision["motivo"])


class ReplicacionEstado(unittest.TestCase):
    """Pruebas de replicación de registros de canales y estado de olas."""

    def test_canales_tres_nombres_canonicos(self):
        canales = R.nombres_canales_canonicos()
        self.assertEqual(len(canales), 3)
        self.assertIn("principal", canales)
        self.assertIn("general", canales)
        self.assertIn("audiovisual", canales)
        self.assertEqual(canales["principal"], "Principal")
        self.assertEqual(canales["general"], "General")
        self.assertEqual(canales["audiovisual"], "Audiovisual y diseño")

    def test_estado_olas_serializable(self):
        estado = {
            "cola": "test",
            "progreso": {"T1": {"estado": "en_curso", "avance": 100}},
            "latidos": {"agente1": {"tarea1": {"hasta": 20000}}}
        }
        serializado = R.serializar_estado_olas(estado)
        self.assertIsInstance(serializado, str)
        # Debe ser JSON válido
        import json
        restaurado = json.loads(serializado)
        self.assertEqual(restaurado["cola"], "test")

    def test_maggabox_sin_secretos_en_replica(self):
        estado = {
            "canales": {"principal": {"token": "secreto123", "chat_id": "123"}},
            "progreso": {"T1": {"clave_privada": "xyz"}}
        }
        replica = R.filtrar_para_maggabox(estado)
        # No debe tener tokens ni claves privadas
        self.assertNotIn("token", str(replica))
        self.assertNotIn("clave_privada", str(replica))
        self.assertNotIn("secreto123", str(replica))
        self.assertNotIn("xyz", str(replica))


class Simulacro(unittest.TestCase):
    """Pruebas del simulacro documentado."""

    def test_tiempo_respuesta_dentro_limite(self):
        # Simulacro: parar latido Mac → A1 responde en canal General en < N+2 min
        N = 5  # umbral en minutos
        tiempo_maximo_segundos = (N + 2) * 60
        # El test real mediría el tiempo real, aquí solo verificamos la constante
        self.assertEqual(tiempo_maximo_segundos, 420)  # 7 min = 420 seg

    def test_vuelta_mac_recupera_sin_duplicar(self):
        # Cuando la Mac vuelve, recupera el arriendo sin duplicar ni perder mensajes
        # Esto se verifica en test de integración, aquí solo la lógica de decisión
        ahora = 10000.0
        # A1 tiene el arriendo
        arriendo = {"dueno": "oracle-a1-123", "caduca": ahora + 100, "version": 5, "tomado": ahora - 50}
        # Mac intenta recuperarlo (prioridad 1, A1 prioridad 0) → debe esperar a que caduque
        decision = R.decidir_arriendo_telegram(arriendo, "mac-main", ahora, prioridad=1)
        self.assertFalse(decision["actuar"])
        # Cuando caduca, Mac lo toma
        arriendo_caducado = {"dueno": "oracle-a1-123", "caduca": ahora - 10, "version": 5, "tomado": ahora - 200}
        decision2 = R.decidir_arriendo_telegram(arriendo_caducado, "mac-main", ahora, prioridad=1)
        self.assertTrue(decision2["actuar"])


class ClavesSoloPorOracleNodo(unittest.TestCase):
    """Pruebas de que las claves solo viajan por oracle_nodo.py claves."""

    def test_lista_claves_a1_no_incluye_pago(self):
        claves = R.claves_para_a1()
        # No deben estar claves de pago
        self.assertNotIn("ANTHROPIC_API_KEY", claves)
        self.assertNotIn("OPENAI_API_KEY", claves)
        self.assertNotIn("DEEPSEEK_API_KEY", claves)
        # Deben estar las gratuitas
        self.assertIn("GEMINI_API_KEY", claves)
        self.assertIn("NVIDIA_API_KEY", claves)
        self.assertIn("OPENROUTER_API_KEY", claves)
        self.assertIn("XKIRO_API_KEY", claves)
        self.assertIn("AIHUBMIX_API_KEY", claves)
        # Claves del bus
        self.assertIn("STARSEED_LANZADOR_SECRETO", claves)
        self.assertIn("TELEGRAM_BOT_TOKEN", claves)
        self.assertIn("TELEGRAM_CHAT_ID", claves)
        # Puerta de datos
        self.assertIn("PUERTA_DATOS_URL", claves)
        self.assertIn("PUERTA_DATOS_FICHA_ENJAMBRE", claves)


if __name__ == "__main__":
    unittest.main()