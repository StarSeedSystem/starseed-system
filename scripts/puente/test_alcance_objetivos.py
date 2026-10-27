#!/usr/bin/env python3
"""Pruebas de `alcance_objetivos` (INV1025J · R5/R8): prohibidos, hash, cuotas, pausas, permisos y sin nivel = alto."""
import json, os, stat, sys, tempfile, unittest  # noqa: E402
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import alcance_objetivos as A  # noqa: E402

DIA, HOY = 86400, 1_800_000_000.0

def objetivo_limpio(**mas):
    base = {"nombre_publico": "Proyecto Río claro", "tipo": "proyecto", "categoria": "proyecto-afin",
            "afinidad": 240, "urls_oficiales": ["https://rio-claro.org/"]}
    base.update(mas)
    return base

class CamposProhibidos(unittest.TestCase):
    def los_rechazos(self, **mas):
        return A.validar_objetivo(objetivo_limpio(**mas))

    def test_temas_prohibidos_rechazados(self):
        temas = [
            ("Su diagnóstico sobre salud mental", "salud"), ("Hablan de sus creencias en la oración", "creencias-personales"),
            ("Su orientación", "orientación"), ("El voto y la ideología", "política personal"),
            ("Con su familia y sus hijos", "familia"), ("Su salario y nómina", "ingresos"),
        ]
        for nombre, motivo in temas:
            with self.subTest(nombre):
                self.assertIn("campo-prohibido:" + motivo, self.los_rechazos(nombre_publico=nombre))
        self.assertIn("url-no-https", self.los_rechazos(urls_oficiales=["http://rio-claro.org/"]))
        self.assertEqual([], self.los_rechazos())

    def test_telefono_rechazado(self):
        rech = self.los_rechazos(canal_contacto={"medio": "teléfono", "valor": "+34 913 123 456", "fuente_url": "https://s.org/contacto"})
        self.assertIn("canal-de-telefono-prohibido", rech)
        self.assertIn("campo-prohibido:teléfono personal", rech)

    def test_direccion_exige_fuente_publica(self):
        contacto = {"medio": "correo", "valor": "hola@example.org"}
        sin = self.los_rechazos(canal_contacto=contacto)
        con = self.los_rechazos(canal_contacto={**contacto, "fuente_url": "https://s.org/contacto"})
        self.assertIn("direccion-sin-fuente-publica", sin)
        self.assertNotIn("direccion-sin-fuente-publica", con)

class BaseAlmacen(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.almacen = A.Almacen(home=Path(self.tmp.name), ahora=lambda: HOY)
        self.lis = self.almacen.carpeta / A.SUPRESION_JS

class HashYSupresion(BaseAlmacen):
    def test_guarda_solo_el_hash(self):
        huella = self.almacen.suprimir(correo="CARLA@alista.org")
        self.assertRegex(huella, r"^[0-9a-f]{64}$")
        brutos = self.lis.read_text(encoding="utf-8")
        self.assertNotIn("carla@alista.org", brutos)
        self.assertEqual([huella], list(json.loads(brutos)))
        self.assertTrue(self.almacen.suprimido(correo="carla@alista.org"), "el hash normaliza el correo")
        self.assertFalse(self.almacen.suprimido(correo="otra@alista.org"))

    def test_dominio_y_nombre_y_token_invalido(self):
        self.almacen.suprimir(dominio="Proyectos.rio", nombre="Sombra")
        self.assertTrue(self.almacen.suprimido(dominio="proyectos.rio", nombre="sombra"))
        self.assertFalse(self.almacen.suprimido(dominio="proyectos.rio", nombre="otro"))
        with self.assertRaises(ValueError):
            A.token_supresion()

class CuotasYPausas(unittest.TestCase):
    def motivo(self, registro, **kw):
        medio = objetivo_limpio(nivel="medio")
        return A.puede_contactar(medio, registro, HOY, **kw)[1]

    def test_tope_diario(self):
        self.assertEqual("", self.motivo({}, contactos_hoy=4), "4 de 5 caben")
        self.assertEqual("tope-diario", self.motivo({}, contactos_hoy=5))
        self.assertEqual("tope-diario", self.motivo({}, contactos_hoy=2, tope_diario=2), "tope configurable")

    def test_supresion_y_pausas(self):
        self.assertEqual("suprimido", self.motivo({"suprimido": True}))
        self.assertEqual("pausa-rechazo-alex", self.motivo({"rechazo_alex": HOY - 89 * DIA}))
        self.assertEqual("", self.motivo({"rechazo_alex": HOY - 91 * DIA}))
        self.assertEqual("pausa-no-destinatario", self.motivo({"no_destinatario": HOY - 179 * DIA}))
        self.assertEqual("", self.motivo({"no_destinatario": HOY - 181 * DIA}))

    def test_un_mensaje_y_un_recordatorio(self):
        self.assertEqual("recordatorio-antes-de-14-dias", self.motivo({"envios": [{"cuando": HOY - 13 * DIA, "tipo": "mensaje"}]}))
        self.assertEqual("", self.motivo({"envios": [{"cuando": HOY - 14 * DIA, "tipo": "mensaje"}]}))
        self.assertEqual("maximo-dos-envios", self.motivo({"envios": [{"cuando": 0, "tipo": "mensaje"}, {"cuando": 1, "tipo": "recordatorio"}]}))

class R8SinNivel(unittest.TestCase):
    def test_alto_nunca_automatico_y_sin_nivel_es_alto(self):
        ficha = A.normalizar_objetivo(objetivo_limpio(), HOY)  # sin nivel
        self.assertEqual("alto", ficha["nivel"])
        self.assertEqual([], A.validar_objetivo(objetivo_limpio()))
        self.assertEqual("nivel-alto-solo-manual", A.puede_contactar(ficha, {}, HOY, automatico=True)[1])
        self.assertEqual("", A.puede_contactar(ficha, {}, HOY)[1])

class Permisos(BaseAlmacen):
    def test_carpeta_700_archivos_600(self):
        ficha = self.almacen.guardar_objetivo(objetivo_limpio())
        self.assertEqual(0o700, stat.S_IMODE(self.almacen.carpeta.stat().st_mode))
        ficha_ruta = self.almacen.carpeta / (ficha["id"] + ".json")
        self.assertEqual(0o600, stat.S_IMODE(ficha_ruta.stat().st_mode))
        self.almacen.suprimir(correo="carla@alista.org")
        self.assertEqual(0o600, stat.S_IMODE(self.lis.stat().st_mode))

    def test_id_opaco_valida_al_guardar_y_nunca_con_la_memoria(self):
        ficha = self.almacen.guardar_objetivo(objetivo_limpio())
        self.assertRegex(ficha["id"], r"^obj-[0-9a-f]{10}$")
        self.assertNotIn("@", json.dumps(ficha, ensure_ascii=False))
        with self.assertRaises(ValueError):
            self.almacen.guardar_objetivo(objetivo_limpio(tipo="nadie"))
        with self.assertRaises(ValueError):
            A.Almacen(home=Path(self.tmp.name) / A.MADRE_PROHIBIDA)

if __name__ == "__main__":
    unittest.main()
