# -*- coding: utf-8 -*-
"""Pruebas de alcance_objetivos (INV1025J): campos prohibidos, hash, cuotas, pausas, permisos y nivel."""
import datetime as dt, hashlib, json, os, sys, tempfile, unittest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import alcance_objetivos as ao

AHORA = dt.datetime(2026, 10, 28, 12, 0, tzinfo=dt.timezone.utc)
CANAL = {"medio": "correo", "valor": "hola@yosoy.mx", "fuente_url": "https://yosoy.mx/contacto"}
BASE = {"id": "obj-abcdef123456", "nombre_publico": "Matías De Stefano", "tipo": "persona",
        "categoria": "activista", "nivel": "medio", "afinidad": 180,
        "urls_oficiales": ["https://yosoy.mx"], "canal_contacto": CANAL}


def valido(**cambios):
    obj = dict(BASE); obj.update(cambios); return obj

def dias(n):
    return (AHORA - dt.timedelta(days=n)).isoformat()

def registro(*eventos, **extra):
    r = {"eventos": [{"tipo": t, "fecha": dias(n)} for t, n in eventos]}
    r.update(extra); return r


class Validacion(unittest.TestCase):
    def test_objetivo_valido_con_defectos(self):
        o = ao.validar_objetivo(valido(), AHORA)
        self.assertEqual((o["id"], o["estado"], o["nivel"]), ("obj-abcdef123456", "nuevo", "medio")); self.assertIn("creado", o["fechas"])

    def test_sin_id_se_genera_uno_opaco_y_sin_nivel_es_alto(self):
        obj = valido(); obj.pop("id"); obj.pop("nivel")
        o = ao.validar_objetivo(obj, AHORA)
        self.assertTrue(o["id"].startswith("obj-"))
        self.assertEqual(o["nivel"], "alto")  # sin dato = alto: solo manual
        self.assertFalse(ao.puede_contactar(o, {}, AHORA)); self.assertTrue(ao.puede_contactar(o, {}, AHORA, automatico=False))

    def test_alto_declarado_nunca_automático(self):
        o = ao.validar_objetivo(valido(nivel="alto"), AHORA)
        self.assertFalse(ao.puede_contactar(o, {}, AHORA)); self.assertTrue(ao.puede_contactar(o, {}, AHORA, automatico=False))

    def test_rechaza_campos_y_textos_prohibidos(self):
        malos = [valido(salud="diabetes"), valido(nombre_publico="Pastor de la iglesia local"),
                 valido(notas="orientación sexual de la persona"), valido(notas="afiliado al partido"),
                 valido(notas="hija de 8 años"), valido(notas="vive en calle Mayor 5"),
                 valido(notas="escríbele a juan@ejemplo.com"), valido(ingresos="50000 euros al mes"),
                 valido(id="persona-1"),
                 valido(canal_contacto={"medio": "telefono", "valor": "+34 600 111 222", "fuente_url": "https://x.com/contacto"})]
        for obj in malos:
            with self.assertRaises(ValueError): ao.validar_objetivo(obj, AHORA)

    def test_canal_sin_fuente_publica_se_rechaza(self):
        # Jamás una dirección deducida por patrón: el canal exige fuente_url pública https
        # y un valor que sea la dirección exacta que la entidad publica (no texto suelto).
        for valor in ("hola@yosoy.mx", "Escribe a hola@yosoy.mx"):
            for fuente in ("", "http://yosoy.mx"):
                canal = {"medio": "correo", "valor": valor, "fuente_url": fuente}
                with self.assertRaises(ValueError):                     ao.validar_objetivo(valido(canal_contacto=canal), AHORA)

class Supresion(unittest.TestCase):
    def setUp(self):
        self.home = tempfile.mkdtemp()
    def test_guarda_solo_el_hash_y_ignora_tamanio_y_acentos(self):
        marca = ao.suprimir(correo="Contacto@Yosoy.mx", home=self.home)
        self.assertEqual(marca, hashlib.sha256(b"contacto@yosoy.mx").hexdigest())
        self.assertEqual(ao.leer("supresion", self.home), [marca])
        self.assertNotIn("Contacto@Yosoy.mx", json.dumps(ao.leer("supresion", self.home)))
        self.assertTrue(ao.esta_suprimido(correo="contacto@yosoy.mx", home=self.home)); self.assertFalse(ao.esta_suprimido(correo="otro@ejemplo.com", home=self.home))
        marca2 = ao.suprimir(dominio="Yosoy.mx", nombre="María López", home=self.home)
        self.assertEqual(marca2, ao.huella("Yosoy.mx|María López")); self.assertTrue(ao.esta_suprimido(dominio="yosoy.mx", nombre="maria lopez", home=self.home))

class CuotasYPausas(unittest.TestCase):
    def setUp(self):
        self.o = ao.validar_objetivo(valido(), AHORA)
    def test_cuota_diaria_por_defecto_cinco_y_configurable(self):
        self.assertFalse(ao.puede_contactar(self.o, registro(envios_hoy=5), AHORA))
        self.assertTrue(ao.puede_contactar(self.o, registro(envios_hoy=4), AHORA)); self.assertFalse(ao.puede_contactar(self.o, registro(envios_hoy=1, tope_diario=1), AHORA))

    def test_rechazo_de_alex_pausa_90_dias(self):
        self.assertFalse(ao.puede_contactar(self.o, registro(("rechazo_alex", 89)), AHORA))
        self.assertTrue(ao.puede_contactar(self.o, registro(("rechazo_alex", 90)), AHORA))

    def test_no_del_destinatario_pausa_180_dias(self):
        self.assertFalse(ao.puede_contactar(self.o, registro(("no_destinatario", 179)), AHORA))
        self.assertTrue(ao.puede_contactar(self.o, registro(("no_destinatario", 180)), AHORA))

    def test_un_mensaje_y_un_recordatorio_como_maximo(self):
        self.assertFalse(ao.puede_contactar(self.o, registro(("recordatorio", 1)), AHORA))  # sin mensaje previo
        self.assertFalse(ao.puede_contactar(self.o, registro(("mensaje", 13)), AHORA))
        self.assertTrue(ao.puede_contactar(self.o, registro(("mensaje", 14)), AHORA))  # a los 14 toca el recordatorio
        self.assertFalse(ao.puede_contactar(self.o, registro(("mensaje", 14), ("recordatorio", 1)), AHORA))  # cerrado
        self.assertFalse(ao.puede_contactar(self.o, registro(("mensaje", 40), ("mensaje", 14)), AHORA))

    def test_suprimido_no_recibe_nada(self):
        self.assertFalse(ao.puede_contactar(self.o, registro(suprimido=True), AHORA)); self.assertFalse(ao.puede_contactar(self.o, registro(supresion=[ao.huella("hola@yosoy.mx")]), AHORA))
        self.assertTrue(ao.puede_contactar(self.o, registro(supresion=[ao.huella("otro@ejemplo.com")]), AHORA))

class AlmacenPrivado(unittest.TestCase):
    """La carpeta vive en ~/.starseed/alcance a 700 y sus archivos a 600; jamás bajo starseed_memory_root."""

    def setUp(self):
        self.home = tempfile.mkdtemp()
    def test_carpeta_700_y_archivos_600(self):
        carpeta = ao.preparar_almacen(self.home)
        self.assertEqual(carpeta, os.path.join(self.home, ".starseed", "alcance"))
        self.assertEqual(os.stat(carpeta).st_mode & 0o777, 0o700)
        ao.escribir("registro", {"nota": "privado"}, self.home)
        for archivo in ao.ARCHIVOS.values():
            self.assertEqual(os.stat(os.path.join(carpeta, archivo)).st_mode & 0o777, 0o600, archivo)

    def test_nunca_bajo_starseed_memory_root(self):
        with self.assertRaises(ValueError): ao.ruta_almacen(os.path.join(self.home, "starseed_memory_root", "memo"))

    def test_escribir_y_leer_redonda(self):
        self.assertEqual(ao.leer("supresion", self.home), [])
        ao.escribir("supresion", ["a"], self.home)
        self.assertEqual(ao.leer("supresion", self.home), ["a"])


if __name__ == "__main__":
    unittest.main()
