# -*- coding: utf-8 -*-
"""Pruebas del almacén privado del alcance: validación, hash, cuotas y permisos."""
import os, sys, tempfile, unittest
from datetime import datetime, timedelta
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import alcance_objetivos as a
AHORA = datetime(2026, 10, 27, 12, 0, 0)

def base(**cambios):
    objetivo = {"id": "obj-abc123", "nombre_publico": "Proyecto Claro", "tipo": "proyecto",
                "categoria": "proyecto-afin", "nivel": "bajo", "afinidad": 80,
                "urls_oficiales": ["https://claro.example"], "estado": "nuevo",
                "fechas": {"alta": "2026-10-27"},
                "canal_contacto": {"medio": "correo-propio", "valor": "hola@claro.example",
                                   "fuente_url": "https://claro.example/contacto"}}
    objetivo.update(cambios)
    return objetivo

def hace(dias):
    return (AHORA - timedelta(days=dias)).isoformat()

def texto_de(home, nombre):
    with open(os.path.join(a.preparar(home), nombre), encoding="utf-8") as archivo:
        return archivo.read()

class Objetivos(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.home = self.tmp.name

    def tearDown(self):
        self.tmp.cleanup()

    def test_objetivo_valido(self):
        ok, motivo = a.validar_objetivo(base())
        self.assertTrue(ok, motivo)
    def test_campos_y_textos_prohibidos(self):
        casos = [{"salud": "x"}, {"nombre_publico": "tiene una religión"},
                 {"domicilio": "Calle 1"}, {"ingresos": 10}, {"fechas": {"telefono_personal": "555"}}]
        for cambio in casos:
            with self.subTest(cambio=cambio):
                self.assertFalse(a.validar_objetivo(base(**cambio))[0])

    def test_direccion_sin_fuente_publica(self):
        canales = [{"medio": "correo-propio", "valor": "a@b.example"},
                   {"medio": "correo-propio", "valor": "a@b.example", "fuente_url": "http://b.example"},
                   {"medio": "correo-propio", "valor": "a@b.example", "fuente_url": "https://127.0.0.1/x"}]
        for canal in canales:
            with self.subTest(canal=canal):
                self.assertFalse(a.validar_objetivo(base(canal_contacto=canal))[0])

    def test_urls_solo_https(self):
        self.assertFalse(a.validar_objetivo(base(urls_oficiales=["http://claro.example"]))[0])

    def test_sin_nivel_es_alto(self):
        objetivo = base()
        del objetivo["nivel"]
        self.assertEqual(a.nivel_de(objetivo), "alto")
        self.assertTrue(a.validar_objetivo(objetivo)[0])
        self.assertFalse(a.puede_contactar(objetivo, {}, ahora=AHORA)[0])
        self.assertFalse(a.puede_contactar(base(nivel="alto"), {}, ahora=AHORA)[0])

    def test_guarda_carga_y_permisos(self):
        self.assertTrue(a.guardar_objetivo(base(), home=self.home)[0])
        self.assertEqual(len(a.cargar_objetivos(home=self.home)), 1)
        carpeta = a.preparar(self.home)
        self.assertEqual(os.stat(carpeta).st_mode & 0o777, 0o700)
        ruta = os.path.join(carpeta, "objetivos.json")
        self.assertEqual(os.stat(ruta).st_mode & 0o777, 0o600)
        self.assertFalse(a.guardar_objetivo({"id": "x"}, home=self.home)[0])

    def test_no_vive_bajo_memoria(self):
        with self.assertRaises(ValueError):
            a.raiz(os.path.join(self.home, "starseed_memory_root"))

    def test_supresion_guarda_solo_hash(self):
        h = a.suprimir("Ana@Ejemplo.com", home=self.home)
        self.assertRegex(h, r"^[0-9a-f]{64}$")
        contenido = texto_de(self.home, "supresion.json")
        self.assertIn(h, contenido)
        self.assertNotIn("Ana", contenido)
        self.assertNotIn("Ejemplo", contenido)
        ruta = os.path.join(a.preparar(self.home), "supresion.json")
        self.assertEqual(os.stat(ruta).st_mode & 0o777, 0o600)
        self.assertEqual(a.suprimir("ana@ejemplo.com", home=self.home), h)
        self.assertEqual(len(a.cargar_supresion(home=self.home)), 1)

    def test_supresion_dominio_y_nombre(self):
        h = a.suprimir("ejemplo.com+Ana Pérez", home=self.home)
        self.assertNotIn("Ana", texto_de(self.home, "supresion.json"))
        self.assertEqual(h, a.huella(("ejemplo.com", "Ana Pérez")))

    def test_suprimido_no_contacta(self):
        registro = {"suprimidos": [a.huella("hola@claro.example")]}
        self.assertEqual(a.puede_contactar(base(), registro, ahora=AHORA), (False, "suprimido"))

    def test_tope_diario(self):
        cuatro = {"envios": [AHORA.isoformat()] * 4}
        cinco = {"envios": [AHORA.isoformat()] * 5}
        self.assertTrue(a.puede_contactar(base(), cuatro, ahora=AHORA)[0])
        self.assertEqual(a.puede_contactar(base(), cinco, ahora=AHORA), (False, "tope-diario"))
        self.assertTrue(a.puede_contactar(base(), cinco, ahora=AHORA, tope_diario=10)[0])

    def test_pausas(self):
        oid = "obj-abc123"
        self.assertFalse(a.puede_contactar(base(), {"rechazo_alex": {oid: hace(30)}}, ahora=AHORA)[0])
        self.assertTrue(a.puede_contactar(base(), {"rechazo_alex": {oid: hace(91)}}, ahora=AHORA)[0])
        self.assertFalse(a.puede_contactar(base(), {"no_destinatario": {oid: hace(179)}}, ahora=AHORA)[0])
        self.assertTrue(a.puede_contactar(base(), {"no_destinatario": {oid: hace(181)}}, ahora=AHORA)[0])

    def test_cadencia_mensaje_y_recordatorio(self):
        oid = "obj-abc123"
        self.assertFalse(a.puede_contactar(base(), {"mensajes": {oid: [hace(5)]}}, ahora=AHORA)[0])
        self.assertTrue(a.puede_contactar(base(), {"mensajes": {oid: [hace(15)]}}, ahora=AHORA)[0])
        registro = {"mensajes": {oid: [hace(20)]}, "recordatorios": {oid: [hace(2)]}}
        self.assertEqual(a.puede_contactar(base(), registro, ahora=AHORA), (False, "seguimiento-cerrado"))
        self.assertTrue(a.puede_contactar(base(nivel="medio"), {}, ahora=AHORA)[0])


if __name__ == "__main__":
    unittest.main()
