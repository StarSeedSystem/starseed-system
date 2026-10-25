"""Pruebas de `alcance_objetivos.py`: campos prohibidos, hash, cuotas, pausas,
permisos de archivo y carpeta, y objetivo sin nivel = alto (R1, R5, R8)."""
import importlib.util, os, tempfile, unittest

_ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), "alcance_objetivos.py")
_espec = importlib.util.spec_from_file_location("alcance_objetivos", _ruta)
A = importlib.util.module_from_spec(_espec)
_espec.loader.exec_module(A)

AHORA = 1_760_000_000.0
CANAL = {"medio": "correo", "valor": "hola@ejemplo.org", "fuente_url": "https://ejemplo.org/contacto"}


def objetivo(**extra):
    """Objetivo limpio de prueba; `nivel` ausente por defecto."""
    base = dict(nombre_publico="Proyecto Ejemplo", tipo="proyecto", categoria="proyecto-afin", afinidad=120,
                urls_oficiales=["https://ejemplo.org"], canal_contacto=dict(CANAL), ahora=AHORA)
    base.update(extra)
    return A.crear_objetivo(ahora=base.pop("ahora", AHORA), **base)


def registro(**extra):
    return {"envios": [], **extra}

class TestValidar(unittest.TestCase):
    def test_limpio_pasa_y_sin_nivel_es_alto(self):
        creado = objetivo()
        self.assertEqual(A.validar_objetivo(creado), [])
        self.assertEqual(creado["nivel"], "alto")  # R8: sin nivel = alto, solo manual

    def test_campos_y_textos_prohibidos_se_rechazan(self):
        "(R5) salud, religión, orientación, política personal, familia, ubicación, ingresos, teléfono."
        textos = ("su salud mental", "persona religiosa", "orientación de la persona",
                  "afín a su política personal", "su familia y sus hijos", "ingresos anuales altos",
                  "teléfono personal: 555", "su pareja habla de diagnóstico", "vive en mi domicilio particular")
        for texto in textos:
            with self.subTest(texto=texto):
                self.assertTrue(A.validar_objetivo(objetivo(nombre_publico=texto)), texto)
                self.assertTrue(A.texto_prohibido(texto), texto)

    def test_url_no_https_y_canal_sin_fuente_url_se_rechazan(self):
        "(R1) solo urls https y solo el canal que la propia entidad publica, con su fuente."
        self.assertTrue(A.validar_objetivo(objetivo(urls_oficiales=["http://ejemplo.org"])))
        canal_sin_fuente = {"medio": "correo", "valor": "hola@ejemplo.org"}
        self.assertTrue(A.validar_objetivo(objetivo(canal_contacto=canal_sin_fuente)))
        self.assertFalse(A.validar_objetivo(objetivo(canal_contacto=dict(CANAL))))

class TestPrivado(unittest.TestCase):
    """(R5) carpeta 700, archivos 600 y de lo delicado solo el hash en disco."""

    def setUp(self):
        self.temporal = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporal.cleanup)
        self.home = self.temporal.name

    def test_carpeta_y_archivo_con_permisos_privados(self):
        self.assertEqual(os.stat(A.carpeta_alcance(self.home)).st_mode & 0o777, 0o700)
        A.guardar_objetivos(self.home, [objetivo()])
        archivo = os.path.join(self.home, ".starseed", "alcance", A.ARCHIVO_OBJETIVOS)
        self.assertEqual(os.stat(archivo).st_mode & 0o777, 0o600)

    def test_solo_se_guarda_el_hash(self):
        huella = A.hash_sha256("persona@deseo-borrar.com")
        self.assertEqual(A.suprimir(self.home, correo="persona@deseo-borrar.com"), [huella])
        ruta = os.path.join(self.home, ".starseed", "alcance", A.ARCHIVO_SUPRESION)
        with open(ruta, encoding="utf-8") as archivo:
            texto_del_archivo = archivo.read()
        self.assertIn(huella, texto_del_archivo)
        self.assertNotIn("persona@deseo-borrar.com", texto_del_archivo)

    def test_dominio_entero_y_sin_duplicados(self):
        huellas = A.suprimir(self.home, dominio="primo-ej.com", nombre="mercadeo")
        self.assertEqual(len(huellas), 2)  # hash del dominio y del dominio+nombre
        A.suprimir(self.home, dominio="primo-ej.com", nombre="mercadeo")
        self.assertEqual(len(huellas), 2)
        self.assertTrue(A.esta_suprimido(self.home, correo="cualquiera@primo-ej.com"))
        self.assertFalse(A.esta_suprimido(self.home, correo="otro@ejemplo.org"))

class TestPuedeContactar(unittest.TestCase):
    """Un mensaje y un recordatorio a 14 días; pausas 90/180; tope diario; alto solo manual (R8)."""

    def test_suprimido_no(self):
        self.assertEqual(A.puede_contactar(objetivo(), registro(suprimido=True), AHORA)[0], False)

    def test_nivel_alto_nunca_automatico(self):
        permitido, motivo = A.puede_contactar(objetivo(), registro(), AHORA)
        self.assertFalse(permitido)
        self.assertIn("manual", motivo)
        self.assertTrue(A.puede_contactar(objetivo(), registro(), AHORA, automatico=False)[0])
        self.assertTrue(A.puede_contactar(objetivo(nivel="medio"), registro(), AHORA)[0])

    def test_recordatorio_solo_a_los_14_dias(self):
        medio = objetivo(nivel="medio")
        self.assertFalse(A.puede_contactar(medio, registro(envios=[AHORA - 7 * A.DIA]), AHORA)[0])
        self.assertTrue(A.puede_contactar(medio, registro(envios=[AHORA - 14 * A.DIA]), AHORA)[0])
        self.assertFalse(A.puede_contactar(medio, registro(envios=[AHORA - 14 * A.DIA], recordatorio=True), AHORA)[0])
        self.assertFalse(A.puede_contactar(medio, registro(envios=[AHORA - A.DIA, AHORA]), AHORA)[0])

    def test_pausas_tras_rechazos(self):
        "(R8) 90 días tras rechazo de Alex, 180 tras un «no» del destinatario."
        medio = objetivo(nivel="medio")
        self.assertFalse(A.puede_contactar(medio, registro(rechazo_alex=AHORA - 89 * A.DIA), AHORA)[0])
        self.assertTrue(A.puede_contactar(medio, registro(rechazo_alex=AHORA - 90 * A.DIA - 1), AHORA)[0])
        self.assertFalse(A.puede_contactar(medio, registro(rechazo_destinatario=AHORA - 179 * A.DIA), AHORA)[0])
        self.assertTrue(A.puede_contactar(medio, registro(rechazo_destinatario=AHORA - 180 * A.DIA - 1), AHORA)[0])

    def test_tope_diario_configurable(self):
        "(R8) 5 por defecto: „envios_hoy“ lo trae el registro global y el tope es configurable."
        medio = objetivo(nivel="medio")
        self.assertTrue(A.puede_contactar(medio, registro(envios_hoy=4), AHORA)[0])
        self.assertFalse(A.puede_contactar(medio, registro(envios_hoy=5), AHORA)[0])
        permitido, motivo = A.puede_contactar(medio, registro(envios_hoy=2), AHORA, tope_diario=2)
        self.assertFalse(permitido)
        self.assertIn("tope", motivo)

if __name__ == "__main__":
    unittest.main()
