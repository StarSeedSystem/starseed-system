# -*- coding: utf-8 -*-
"""INV1025J · pruebas de alcance_objetivos: prohibidos, hash, cuotas, pausas y permisos."""
import hashlib, importlib.util, json, os, tempfile, unittest

_spec = importlib.util.spec_from_file_location("alcance_objetivos", os.path.join(os.path.dirname(os.path.abspath(__file__)), "alcance_objetivos.py"))
A = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(A)

AHORA = 1_800_000_000.0  # 2027-01-15T08:00Z, fija: pausas y «hoy» reproducibles

def _obj(**kw):
    return {"id": "obj-test1", "nombre_publico": "Proyecto Prueba", "tipo": "proyecto", "categoria": "proyecto-afin", "afinidad": 200, "urls_oficiales": ["https://prueba.example"], **kw}

def _reg(**kw):
    return {"mensajes": [], "recordatorios": [], "rechazo_alex": None, "rechazo_no": None, **kw}

def _carga(ruta):
    with open(ruta, encoding="utf-8") as fh:
        return fh.read()

class TestObjetivos(unittest.TestCase):
    def test_valido_y_prohibidos_se_rechazan(self):
        self.assertIsNone(A.validar_objetivo(_obj()))
        for o in (_obj(salud="diabetes"), _obj(nombre_publico="sus creencias religiosas"), _obj(familia="dos hijos"),
                  _obj(ingresos="sin dato"), _obj(canal_contacto={"medio": "telefono", "valor": "555", "fuente_url": "https://x.example/p"})):
            self.assertIn("R5", A.validar_objetivo(o))

    def test_enlaces_https_fuente_url_afinidad_y_tipo(self):
        self.assertTrue("https" in A.validar_objetivo(_obj(urls_oficiales=["http://inseguro.example"]))
                        and "fuente_url" in A.validar_objetivo(_obj(canal_contacto={"medio": "correo", "valor": "a@b.ec"})))
        self.assertTrue("afinidad" in A.validar_objetivo(_obj(afinidad=301)) and "tipo" in A.validar_objetivo(_obj(tipo="colega")))

    def test_sin_nivel_es_alto_r8(self):
        self.assertEqual(A.nivel_de({}), "alto")
        self.assertEqual(A.nivel_de({"nivel": "bajo"}), "bajo")

    def test_permisos_700_600_y_fuera_de_memory_root(self):
        with tempfile.TemporaryDirectory() as home:
            self.assertEqual(A.suprimir(correo="ana@example.com", home=home), A.huella(correo="ana@example.com"))
            A.guardar_objetivo(_obj(), home=home, ahora=AHORA)
            carpeta = A.carpeta_objetivos(home)
            self.assertEqual(oct(os.stat(carpeta).st_mode)[-3:], "700")
            self.assertEqual({oct(os.stat(os.path.join(carpeta, n)).st_mode)[-3:] for n in
                              ("objetivos.json", "supresion.json")}, {"600"})
            self.assertTrue(carpeta.startswith(home) and os.path.join(".starseed", "alcance") in carpeta
                            and "starseed_memory_root" not in carpeta)

    def test_guardar_sin_nivel_queda_alto(self):
        with tempfile.TemporaryDirectory() as home:
            rid, error = A.guardar_objetivo(_obj(), home=home, ahora=AHORA)
            self.assertTrue(rid and rid.startswith("obj-") and error is None)
            ruta = os.path.join(A.carpeta_objetivos(home), "objetivos.json")
            guardado = json.loads(_carga(ruta))[0]
            self.assertEqual((guardado["nivel"], guardado["estado"]), ("alto", "activo"))
            self.assertIn("creado", guardado["fechas"])

    def test_invalido_no_se_guarda(self):
        with tempfile.TemporaryDirectory() as home:
            rid, error = A.guardar_objetivo(_obj(afinidad=999), home=home, ahora=AHORA)
            self.assertEqual((rid, "afinidad" in (error or "")), (None, True))
            self.assertFalse(os.path.exists(os.path.join(A.carpeta_objetivos(home), "objetivos.json")))

class TestSupresion(unittest.TestCase):
    def test_en_disco_solo_hash_y_dominio_distinto(self):
        h = A.huella(correo=" ANA@example.com ")
        self.assertEqual(h, hashlib.sha256(b"ana@example.com").hexdigest())
        with tempfile.TemporaryDirectory() as home:
            ruta = os.path.join(A.carpeta_objetivos(home), "supresion.json")
            A.suprimir(correo="ana@example.com", home=home)
            self.assertNotIn("ana", _carga(ruta))
            self.assertEqual(A.huellas_supresion(home), {h})
            A.suprimir(correo="ana@example.com", home=home)
            self.assertEqual(len(json.loads(_carga(ruta))), 1)  # idempotente
        hd = A.huella(dominio="Prueba.example", nombre="Proyecto Prueba")
        self.assertEqual(hd, hashlib.sha256(b"prueba.example|proyecto prueba").hexdigest())
        self.assertNotIn(hd, {A.huella(correo="prueba.example"), A.huella(correo="Proyecto Prueba")})

    def test_suprimido_ciega_por_correo_y_por_dominio(self):
        with tempfile.TemporaryDirectory() as home:
            A.suprimir(correo="hola@prueba.example", home=home)
            obj = _obj(canal_contacto={"medio": "correo", "valor": "HOLA@prueba.example", "fuente_url": "https://prueba.example/b"})
            si, motivo = A.puede_contactar(obj, _reg(), AHORA, suprimidos=A.huellas_supresion(home))
            self.assertFalse(si or "suprimido" not in motivo)
            A.suprimir(dominio="prueba.example", nombre="Proyecto Prueba", home=home)
            self.assertFalse(A.puede_contactar(_obj(), _reg(), AHORA, suprimidos=A.huellas_supresion(home))[0])

class TestCuotasPausas(unittest.TestCase):
    def test_recordatorio_unico_y_a_los_14_dias(self):
        obj = _obj()
        self.assertTrue(A.puede_contactar(obj, _reg(), AHORA, automatico=False)[0])
        self.assertFalse(A.puede_contactar(obj, _reg(mensajes=[AHORA - 13 * A.DIAS]), AHORA, automatico=False)[0])
        si, motivo = A.puede_contactar(obj, _reg(mensajes=[AHORA - 15 * A.DIAS]), AHORA, automatico=False)
        self.assertTrue(si and "recordatorio" in motivo)
        lleno = _reg(mensajes=[AHORA - 15 * A.DIAS], recordatorios=[AHORA - A.DIAS])
        self.assertFalse(A.puede_contactar(obj, lleno, AHORA, automatico=False)[0])  # tope 1 + 1

    def test_tope_diario_configurable(self):
        for tope, hoy, esperado in ((5, 5, False), (5, 4, True), (3, 3, False), (3, 2, True)):
            self.assertEqual(A.puede_contactar(_obj(), _reg(), AHORA, tope=tope, enviados_hoy=hoy, automatico=False)[0], esperado)

    def test_pausas_90_tras_alex_y_180_tras_no(self):
        obj = _obj()
        for dias, clave, esperado in ((89, "rechazo_alex", False), (91, "rechazo_alex", True),
                                      (179, "rechazo_no", False), (181, "rechazo_no", True)):
            reg = _reg(**{clave: AHORA - dias * A.DIAS})
            self.assertEqual(A.puede_contactar(obj, reg, AHORA, automatico=False)[0], esperado)

    def test_nivel_alto_nunca_automatico(self):
        si, motivo = A.puede_contactar(_obj(), _reg(), AHORA)
        self.assertFalse(si or "automático" not in motivo)  # sin nivel = alto
        self.assertTrue(A.puede_contactar(_obj(), _reg(), AHORA, automatico=False)[0])

if __name__ == "__main__":
    unittest.main()
