"""Pruebas del relevo de medios (RES1121A).
 
Cada medio tiene su especialidad y un relevo designado. Si el Mac deja de latir,
el A1 toma el relevo con ARRENDAMIENTO (un solo lector por bot de Telegram).
"""
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
 
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import relevo_medios as R  # noqa: E402
import relevo_medios_logica as L  # noqa: E402
 
T0 = datetime(2026, 11, 25, 10, 0, tzinfo=timezone.utc)
 
 
def medio_base(**k):
    return {
        "id": "mac",
        "nombre": "Mac M1",
        "especialidad": "orquestador, puertas, cartero, presidente, bot Principal",
        "relevo": "a1",
        "canales": ["principal", "general", "audiovisual"],
        "latido": T0.isoformat(),
        **k,
    }
 
 
class RegistroMedios(unittest.TestCase):
    def test_registro_tiene_cuatro_medios(self):
        reg = L.registro_defecto()
        selfEqual = self.assertEqual
        selfEqual(len(reg["medios"]), 4)
        ids = {m["id"] for m in reg["medios"]}
        self.assertEqual(ids, {"mac", "a1", "maggabox", "nubes-efimeras"})
 
    def test_mac_es_orquestador_y_puertas(self):
        reg = L.registro_defecto()
        mac = next(m for m in reg["medios"] if m["id"] == "mac")
        self.assertIn("orquestador", mac["especialidad"])
        self.assertIn("puertas", mac["especialidad"])
        self.assertIn("cartero", mac["especialidad"])
        self.assertIn("presidente", mac["especialidad"])
        self.assertIn("Principal", mac["especialidad"])
        self.assertEqual(mac["relevo"], "a1")
 
    def test_a1_siempre_encendido_y_bot_diseno(self):
        reg = L.registro_defecto()
        a1 = next(m for m in reg["medios"] if m["id"] == "a1")
        self.assertIn("siempre encendido", a1["especialidad"])
        self.assertIn("bot de diseño", a1["especialidad"])
        self.assertIn("guardián de main", a1["especialidad"])
        self.assertIn("cola de respaldo", a1["especialidad"])
        self.assertIn("nube", a1["especialidad"])
        self.assertEqual(a1["relevo"], "maggabox")
 
    def test_maggabox_almacen_sin_claves(self):
        reg = L.registro_defecto()
        mg = next(m for m in reg["medios"] if m["id"] == "maggabox")
        self.assertIn("almacén", mg["especialidad"])
        self.assertIn("espejo de GitHub", mg["especialidad"])
        self.assertIn("versiones", mg["especialidad"])
        self.assertIn("respaldos cifrados", mg["especialidad"])
        self.assertIn("sin claves en claro", mg["especialidad"])
        self.assertEqual(mg["relevo"], "nubes-efimeras")
 
    def test_nubes_efimeras_solo_trabajo_sin_secretos(self):
        reg = L.registro_defecto()
        ne = next(m for m in reg["medios"] if m["id"] == "nubes-efimeras")
        self.assertIn("GitHub Actions", ne["especialidad"])
        self.assertIn("Cloudroom", ne["especialidad"])
        self.assertIn("solo trabajo sin secretos", ne["especialidad"])
        self.assertEqual(ne["relevo"], "mac")
 
 
class LatidoYRelevo(unittest.TestCase):
    def test_mac_late_fresco_no_releva(self):
        reg = L.registro_defecto()
        reg = L.actualizar_latido(reg, "mac", T0)
        toca, _ = L.debe_relevar(reg, "mac", T0 + timedelta(minutes=5))
        self.assertFalse(toca)
 
    def test_mac_sin_latido_releva_a_a1(self):
        reg = L.registro_defecto()
        # Mac nunca latió (latido es None en registro_defecto)
        toca, quien = L.debe_relevar(reg, "mac", T0 + timedelta(minutes=10))
        self.assertTrue(toca)
        self.assertEqual(quien, "a1")
 
    def test_mac_latido_viejo_releva_a_a1(self):
        reg = L.registro_defecto()
        reg = L.actualizar_latido(reg, "mac", T0)
        toca, quien = L.debe_relevar(reg, "mac", T0 + timedelta(minutes=15))
        self.assertTrue(toca)
        self.assertEqual(quien, "a1")
 
    def test_a1_releva_a_maggabox(self):
        reg = L.registro_defecto()
        reg = L.actualizar_latido(reg, "a1", T0)
        toca, quien = L.debe_relevar(reg, "a1", T0 + timedelta(minutes=20))
        self.assertTrue(toca)
        self.assertEqual(quien, "maggabox")
 
    def test_maggabox_releva_a_nubes_efimeras(self):
        reg = L.registro_defecto()
        reg = L.actualizar_latido(reg, "maggabox", T0)
        toca, quien = L.debe_relevar(reg, "maggabox", T0 + timedelta(minutes=20))
        self.assertTrue(toca)
        self.assertEqual(quien, "nubes-efimeras")
 
    def test_nubes_efimeras_releva_a_mac(self):
        reg = L.registro_defecto()
        reg = L.actualizar_latido(reg, "nubes-efimeras", T0)
        toca, quien = L.debe_relevar(reg, "nubes-efimeras", T0 + timedelta(minutes=20))
        self.assertTrue(toca)
        self.assertEqual(quien, "mac")
 
 
class ArriendoTelegram(unittest.TestCase):
    def test_solo_un_lector_por_bot(self):
        reg = L.registro_defecto()
        # Mac tiene el arriendo inicial
        reg = L.tomar_arriendo(reg, "mac", T0)
        self.assertEqual(L.quien_tiene_arriendo(reg, "principal"), "mac")
        self.assertEqual(L.quien_tiene_arriendo(reg, "general"), "mac")
        self.assertEqual(L.quien_tiene_arriendo(reg, "audiovisual"), "mac")
 
    def test_al_relevar_a1_toma_arriendo(self):
        reg = L.registro_defecto()
        reg = L.tomar_arriendo(reg, "mac", T0)
        # Mac deja de latir, A1 releva y toma arriendo
        reg = L.relevar_y_tomar_arriendo(reg, "mac", "a1", T0 + timedelta(minutes=15))
        self.assertEqual(L.quien_tiene_arriendo(reg, "principal"), "a1")
        self.assertEqual(L.quien_tiene_arriendo(reg, "general"), "a1")
        self.assertEqual(L.quien_tiene_arriendo(reg, "audiovisual"), "a1")
 
    def test_al_volver_mac_recupera_arriendo_sin_duplicar(self):
        reg = L.registro_defecto()
        reg = L.tomar_arriendo(reg, "mac", T0)
        reg = L.relevar_y_tomar_arriendo(reg, "mac", "a1", T0 + timedelta(minutes=15))
        # Mac vuelve y late
        reg = L.actualizar_latido(reg, "mac", T0 + timedelta(minutes=20))
        reg = L.recuperar_arriendo(reg, "mac", T0 + timedelta(minutes=20))
        self.assertEqual(L.quien_tiene_arriendo(reg, "principal"), "mac")
        self.assertEqual(L.quien_tiene_arriendo(reg, "general"), "mac")
        self.assertEqual(L.quien_tiene_arriendo(reg, "audiovisual"), "mac")
        # A1 ya no tiene arriendo
        self.assertNotEqual(L.quien_tiene_arriendo(reg, "principal"), "a1")
 
    def test_tres_canales_tienen_mismo_nombre_en_todos_medios(self):
        reg = L.registro_defecto()
        for m in reg["medios"]:
            self.assertEqual(m["canales"], ["principal", "general", "audiovisual"])
 
 
class ClavesYSeguridad(unittest.TestCase):
    def test_claves_solo_viajan_por_oracle_nodo_claves(self):
        # Esta prueba verifica la REGLA, no la implementación
        # Las claves que el A1 necesite para relevar viajan SOLO por oracle_nodo.py claves
        reg = L.registro_defecto()
        a1 = next(m for m in reg["medios"] if m["id"] == "a1")
        self.assertIn("oracle_nodo.py claves", a1.get("nota_claves", ""))
 
    def test_maggabox_no_recibe_claves(self):
        reg = L.registro_defecto()
        mg = next(m for m in reg["medios"] if m["id"] == "maggabox")
        self.assertIn("sin claves", mg["especialidad"].lower())
 
    def test_nubes_efimeras_no_reciben_claves(self):
        reg = L.registro_defecto()
        ne = next(m for m in reg["medios"] if m["id"] == "nubes-efimeras")
        self.assertIn("sin secretos", ne["especialidad"].lower())
 
 
class ReplicacionEstado(unittest.TestCase):
    def test_tres_canales_y_estado_olas_se_replican(self):
        reg = L.registro_defecto()
        estado = {
            "canales": {
                "principal": {"ultimo_mensaje": "hola", "ts": T0.isoformat()},
                "general": {"ultimo_mensaje": "mundo", "ts": T0.isoformat()},
                "audiovisual": {"ultimo_mensaje": "diseño", "ts": T0.isoformat()},
            },
            "olas": {"cola": "ola-1", "pendientes": 5, "en_curso": 2},
        }
        reg = L.replicar_estado(reg, "a1", estado, T0)
        a1_estado = reg["replicas"].get("a1")
        self.assertIsNotNone(a1_estado)
        self.assertEqual(a1_estado["canales"], estado["canales"])
        self.assertEqual(a1_estado["olas"], estado["olas"])
 
    def test_maggabox_recibe_replica_sin_secretos(self):
        reg = L.registro_defecto()
        estado = {
            "canales": {"principal": {"ultimo_mensaje": "hola", "ts": T0.isoformat()}},
            "olas": {"cola": "ola-1", "pendientes": 5},
            "secretos": {"token": "secreto-no-debe-ir"},
        }
        reg = L.replicar_estado(reg, "maggabox", estado, T0)
        mg_estado = reg["replicas"].get("maggabox")
        self.assertIsNotNone(mg_estado)
        self.assertNotIn("secretos", mg_estado)
        self.assertEqual(mg_estado["canales"], estado["canales"])
        self.assertEqual(mg_estado["olas"], estado["olas"])
 
 
class Simulacro(unittest.TestCase):
    def test_simulacro_mac_se_para_a1_responde_en_general(self):
        """Simulacro documentado: parar latido Mac → A1 responde en General en < N+2 min."""
        reg = L.registro_defecto()
        reg = L.tomar_arriendo(reg, "mac", T0)
        reg = L.actualizar_latido(reg, "mac", T0)
 
        # Mac se para (no hay latido por 15 min)
        N = 15
        momento_relevo = T0 + timedelta(minutes=N)
        toca, quien = L.debe_relevar(reg, "mac", momento_relevo)
        self.assertTrue(toca)
        self.assertEqual(quien, "a1")
 
        # A1 toma el relevo y el arriendo
        reg = L.relevar_y_tomar_arriendo(reg, "mac", "a1", momento_relevo)
        self.assertEqual(L.quien_tiene_arriendo(reg, "general"), "a1")
 
        # A1 responde en el canal General (simulado)
        respuesta = L.responder_en_canal(reg, "a1", "general", "Mac caído, A1 activo", momento_relevo + timedelta(minutes=1))
        self.assertTrue(respuesta["ok"])
        self.assertEqual(respuesta["canal"], "general")
        self.assertEqual(respuesta["medio"], "a1")
        # Respuesta en menos de N+2 = 17 min
        self.assertLessEqual(respuesta["minutos_desde_caida"], N + 2)
 
    def test_vuelta_mac_recupera_sin_perder_mensajes(self):
        reg = L.registro_defecto()
        reg = L.tomar_arriendo(reg, "mac", T0)
        reg = L.actualizar_latido(reg, "mac", T0)
 
        # Mac cae, A1 releva
        momento_caida = T0 + timedelta(minutes=15)
        reg = L.relevar_y_tomar_arriendo(reg, "mac", "a1", momento_caida)
 
        # Llega mensaje mientras A1 tiene arriendo
        reg = L.recibir_mensaje(reg, "general", {"id": "msg-1", "texto": "prueba", "ts": (momento_caida + timedelta(minutes=5)).isoformat()})
 
        # Mac vuelve
        momento_vuelta = momento_caida + timedelta(minutes=20)
        reg = L.actualizar_latido(reg, "mac", momento_vuelta)
        reg = L.recuperar_arriendo(reg, "mac", momento_vuelta)
 
        # Mac tiene el arriendo de nuevo
        self.assertEqual(L.quien_tiene_arriendo(reg, "general"), "mac")
 
        # El mensaje que llegó durante el relevo sigue ahí (no se perdió)
        mensajes = L.mensajes_pendientes(reg, "general")
        self.assertTrue(any(m["id"] == "msg-1" for m in mensajes))
 
 
class IntegracionExtremoAExtremo(unittest.TestCase):
    def test_ciclo_completo_mac_a1_maggabox_nubes_mac(self):
        reg = L.registro_defecto()
        reg = L.tomar_arriendo(reg, "mac", T0)
        reg = L.actualizar_latido(reg, "mac", T0)
 
        # 1. Mac cae → A1 releva
        t1 = T0 + timedelta(minutes=15)
        reg = L.relevar_y_tomar_arriendo(reg, "mac", "a1", t1)
        self.assertEqual(L.quien_tiene_arriendo(reg, "principal"), "a1")
 
        # 2. A1 cae → Maggabox releva
        t2 = t1 + timedelta(minutes=20)
        reg = L.relevar_y_tomar_arriendo(reg, "a1", "maggabox", t2)
        self.assertEqual(L.quien_tiene_arriendo(reg, "principal"), "maggabox")
 
        # 3. Maggabox cae → Nubes efímeras releva
        t3 = t2 + timedelta(minutes=20)
        reg = L.relevar_y_tomar_arriendo(reg, "maggabox", "nubes-efimeras", t3)
        self.assertEqual(L.quien_tiene_arriendo(reg, "principal"), "nubes-efimeras")
 
        # 4. Nubes efímeras caen → Mac releva (vuelve)
        t4 = t3 + timedelta(minutes=20)
        reg = L.actualizar_latido(reg, "mac", t4)
        reg = L.recuperar_arriendo(reg, "mac", t4)
        self.assertEqual(L.quien_tiene_arriendo(reg, "principal"), "mac")
 
 
if __name__ == "__main__":
    unittest.main()