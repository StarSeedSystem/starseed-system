# -*- coding: utf-8 -*-
"""Pruebas del almacén PRIVADO de alcance (INV1025J-d2 · R1, R5, R8).

Fijan: permisos de carpeta (700) y archivos (600), nada bajo
`starseed_memory_root`, campos y datos sensibles rechazados, supresión
solo con hash SHA-256, cuota diaria, pausas (rechazo de Alex 90, «no» del
destinatario 180, recordatorio único a los 14 días) y «sin nivel = alto».
"""
import datetime as dt
import importlib.util
import os
import shutil
import stat
import tempfile
import unittest

CARPETA = os.path.dirname(os.path.abspath(__file__))
_espec = importlib.util.spec_from_file_location(
    "alcance_objetivos", os.path.join(CARPETA, "alcance_objetivos.py"))
_espec_cargador = getattr(_espec, "loader", None)
assert _espec is not None and _espec_cargador is not None
AO = importlib.util.module_from_spec(_espec)
_espec_cargador.exec_module(AO)

AHORA = dt.datetime(2026, 10, 28, 12, 0, tzinfo=dt.timezone.utc)
MEDIO = {"nivel": "medio"}


def _hace(dias):
    return (AHORA - dt.timedelta(days=dias)).isoformat()


def _evento(tipo, dias):
    return {"tipo": tipo, "fecha": _hace(dias)}


def _objetivo(**extra):
    objetivo = {
        "nombre_publico": "Proyecto Puente",
        "tipo": "proyecto",
        "categoria": "proyecto-afin",
        "afinidad": 120,
        "urls_oficiales": ["https://ejemplo.org"],
        "canal_contacto": {"medio": "correo", "valor": "hola@ejemplo.org",
                           "fuente_url": "https://ejemplo.org/contacto"},
    }
    objetivo.update(extra)
    return objetivo


class PruebaAlmacen(unittest.TestCase):
    def setUp(self):
        self.casa = tempfile.mkdtemp(prefix="alcance-prueba-")

    def tearDown(self):
        shutil.rmtree(self.casa, ignore_errors=True)


class TestPermisos(PruebaAlmacen):
    def test_carpeta_700_y_archivos_600(self):
        carpeta = AO.preparar_almacen(home=self.casa)
        self.assertEqual(stat.S_IMODE(os.stat(carpeta).st_mode), 0o700)
        for archivo in AO.ARCHIVOS.values():
            ruta = os.path.join(carpeta, archivo)
            self.assertTrue(os.path.exists(ruta))
            self.assertEqual(stat.S_IMODE(os.stat(ruta).st_mode), 0o600)

    def test_fuera_de_starseed_memory_root(self):
        bajo_espejo = os.path.join(self.casa, "starseed_memory_root", "x")
        with self.assertRaises(ValueError):
            AO.ruta_almacen(home=bajo_espejo)


class TestValidarObjetivo(PruebaAlmacen):
    def test_campos_prohibidos_rechazados(self):
        casos = [
            {"salud": "le cesaron una formación"},
            {"notas": "sigue la religión católica"},
            {"notas": "esa orientación sexual no aparece"},
            {"notas": "votó al partido de siempre"},
            {"notas": "vive con su pareja"},
            {"notas": "Calle Sierpes 7"},
            {"notas": "su número es 601234567"},
            {"notas": "su salario supera lo pactado"},
            {"notas": "escríbele a ana@example.com"},
        ]
        for caso in casos:
            with self.subTest(caso=list(caso)[0]):
                with self.assertRaises(ValueError):
                    AO.validar_objetivo(_objetivo(**caso), AHORA)

    def test_canal_sin_fuente_publica_rechazado(self):
        with self.assertRaises(ValueError):
            AO.validar_objetivo(_objetivo(
                canal_contacto={"medio": "correo", "valor": "hola@ejemplo.org"}), AHORA)
        with self.assertRaises(ValueError):
            AO.validar_objetivo(_objetivo(canal_contacto={
                "medio": "correo", "valor": "hola@ejemplo.org",
                "fuente_url": "http://ejemplo.org/contacto"}), AHORA)

    def test_urls_no_https_y_afinidad_fuera_de_rango(self):
        with self.assertRaises(ValueError):
            AO.validar_objetivo(_objetivo(urls_oficiales=["http://ejemplo.org"]), AHORA)
        with self.assertRaises(ValueError):
            AO.validar_objetivo(_objetivo(afinidad=301), AHORA)

    def test_objetivo_sin_nivel_es_alto(self):
        sin_nivel = AO.validar_objetivo(_objetivo(), AHORA)
        self.assertEqual(sin_nivel.get("nivel"), "alto")

    def test_objetivo_valido_pasa(self):
        objetivo = AO.validar_objetivo(_objetivo(**MEDIO), AHORA)
        self.assertTrue(AO.re.fullmatch(r"obj-[A-Za-z0-9_-]+", objetivo["id"]))


class TestContacto(PruebaAlmacen):
    def test_alto_nunca_automatico(self):
        alto = _objetivo()
        self.assertFalse(AO.puede_contactar(alto, [], AHORA))
        self.assertTrue(AO.puede_contactar(alto, [], AHORA, automatico=False))
        self.assertTrue(AO.puede_contactar(_objetivo(**MEDIO), [], AHORA))

    def test_suprimido_no_se_contacta(self):
        auto = _objetivo(**MEDIO)
        self.assertFalse(AO.puede_contactar(auto, {"suprimido": True}, AHORA))
        con_lista = {"supresion": [AO.huella("hola@ejemplo.org")]}
        self.assertFalse(AO.puede_contactar(auto, con_lista, AHORA))
        # Una huella ajena en la lista no bloquea a este objetivo.
        ajena = {"supresion": [AO.huella("otro@ejemplo.com")]}
        self.assertTrue(AO.puede_contactar(auto, ajena, AHORA))

    def test_pausas_tras_rechazo_y_no(self):
        objetivo = _objetivo(**MEDIO)
        self.assertFalse(AO.puede_contactar(
            objetivo, [_evento("rechazo_alex", 89)], AHORA))
        self.assertTrue(AO.puede_contactar(
            objetivo, [_evento("rechazo_alex", 91)], AHORA))
        self.assertFalse(AO.puede_contactar(
            objetivo, [_evento("respuesta_no", 179)], AHORA))
        self.assertTrue(AO.puede_contactar(
            objetivo, [_evento("respuesta_no", 181)], AHORA))
        # El día exacto del vencimiento ya permite contactar.
        self.assertTrue(AO.puede_contactar(
            objetivo, [_evento("rechazo_alex", 90)], AHORA))
        # El alias «no_destinatario» también pausa 180 días.
        self.assertFalse(AO.puede_contactar(
            objetivo, [_evento("no_destinatario", 179)], AHORA))
        self.assertTrue(AO.puede_contactar(
            objetivo, [_evento("no_destinatario", 180)], AHORA))

    def test_recordatorio_a_los_14_dias(self):
        objetivo = _objetivo(**MEDIO)
        self.assertFalse(AO.puede_contactar(objetivo, [_evento("mensaje", 1)], AHORA))
        self.assertTrue(AO.puede_contactar(objetivo, [_evento("mensaje", 14)], AHORA))

    def test_maximo_un_recordatorio(self):
        objetivo = _objetivo(**MEDIO)
        ya_enviado = [_evento("mensaje", 30), _evento("recordatorio", 19)]
        self.assertFalse(AO.puede_contactar(objetivo, ya_enviado, AHORA))

    def test_tope_diario(self):
        objetivo = _objetivo(**MEDIO)
        self.assertFalse(AO.puede_contactar(objetivo, {"envios_hoy": 5}, AHORA))
        self.assertTrue(AO.puede_contactar(objetivo, {"envios_hoy": 4}, AHORA))
        self.assertFalse(AO.puede_contactar(objetivo, {"envios_hoy": 5, "tope_diario": 3}, AHORA))
        self.assertTrue(AO.puede_contactar(objetivo, {"envios_hoy": 8, "tope_diario": 10}, AHORA))


class TestSupresion(PruebaAlmacen):
    def test_guarda_solo_hash(self):
        AO.suprimir(correo="ana@example.com", home=self.casa)
        lista = AO.leer("supresion", self.casa)
        self.assertEqual(lista, [AO.huella("ana@example.com")])
        ruta = os.path.join(self.casa, ".starseed", "alcance", "supresion.json")
        with open(ruta, encoding="utf-8") as fichero:
            contenido = fichero.read()
        self.assertNotIn("ana@example.com", contenido)
        self.assertIn(AO.huella("ana@example.com"), contenido)

    def test_dominio_con_nombre_y_consulta(self):
        AO.suprimir(dominio="ejemplo.org", nombre="Ana Puente", home=self.casa)
        self.assertTrue(AO.esta_suprimido(dominio="ejemplo.org", nombre="ANA PUENTE", home=self.casa))
        self.assertFalse(AO.esta_suprimido(dominio="otro.org", nombre="Ana Puente", home=self.casa))
        self.assertFalse(AO.esta_suprimido(correo="ana@example.com", home=self.casa))
        self.assertEqual(AO.huella("ANA@example.com"), AO.huella("ana@example.com"))

    def test_escribir_y_leer_redonda(self):
        self.assertEqual(AO.leer("supresion", self.casa), [])
        AO.escribir("supresion", ["a"], self.casa)
        self.assertEqual(AO.leer("supresion", self.casa), ["a"])


if __name__ == "__main__":
    unittest.main()
