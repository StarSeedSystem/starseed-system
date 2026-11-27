"""LAY1127B · Jev usa a Laya local: primero si está caliente, la calienta con RAM, cuenta 'laya'."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import jev

URL = "http://127.0.0.1:4470/v1/systemone"
RAM_OK = {"ram_libre_mb": 3000, "presion": 1}
RAM_POCA = {"ram_libre_mb": 400, "presion": 1}
RAM_PRESION = {"ram_libre_mb": 3000, "presion": 2}


def get_con(texto, codigo=200):
    llamadas = []

    def g(url, timeout):
        llamadas.append((url, timeout))
        return codigo, texto

    g.llamadas = llamadas
    return g


class Marca:
    """Lector/escritor de archivos en memoria."""

    def __init__(self, datos=None):
        self.datos = dict(datos or {})
        self.escrituras = []

    def leer(self, ruta, por_defecto):
        return self.datos.get(os.path.basename(ruta), por_defecto)

    def escribir(self, ruta, datos):
        self.datos[os.path.basename(ruta)] = datos
        self.escrituras.append(datos)


class TestEstadoLaya(unittest.TestCase):
    def test_caliente_devuelve_cargado_true(self):
        g = get_con('{"cargado": true}')
        self.assertEqual(jev.estado_laya(URL, transporte=g), {"cargado": True})
        self.assertEqual(g.llamadas[0][0], "http://127.0.0.1:4470/")
        self.assertLessEqual(g.llamadas[0][1], 1.0)

    def test_fria_devuelve_cargado_false(self):
        g = get_con('{"cargado": false, "motivo": "descargado por inactividad"}')
        self.assertEqual(jev.estado_laya(URL, transporte=g), {"cargado": False})

    def test_sin_servidor_devuelve_none(self):
        def roto(url, timeout):
            raise OSError("cerrado")

        self.assertIsNone(jev.estado_laya(URL, transporte=roto))
        self.assertIsNone(jev.estado_laya(URL, transporte=get_con("no json")))


class TestCalentar(unittest.TestCase):
    def _calentar(self, ram, marca=None, ahora=1000.0):
        marca = marca or Marca({"gobernador.json": ram})
        lanzados = []
        r = jev.calentar_laya(
            URL, ahora=ahora, leer=marca.leer, escribir=marca.escribir,
            lanzar=lambda f: lanzados.append(f),
        )
        return r, lanzados, marca

    def test_fria_con_ram_calienta_una_vez_sin_bloquear(self):
        r, lanzados, marca = self._calentar(RAM_OK)
        self.assertTrue(r)
        self.assertEqual(len(lanzados), 1)  # se lanza en segundo plano, no se ejecuta aquí
        self.assertEqual(marca.escrituras[-1]["t"], 1000.0)

    def test_fria_sin_ram_no_calienta(self):
        for ram in (RAM_POCA, RAM_PRESION, {}):
            r, lanzados, marca = self._calentar(ram)
            self.assertFalse(r)
            self.assertEqual(lanzados, [])
            self.assertEqual(marca.escrituras, [])

    def test_plazo_de_10_minutos(self):
        marca = Marca({"gobernador.json": RAM_OK, "laya-calentar.json": {"t": 1000.0}})
        r, lanzados, _ = self._calentar(RAM_OK, marca, ahora=1000.0 + 599)
        self.assertFalse(r)
        self.assertEqual(lanzados, [])
        r, lanzados, _ = self._calentar(RAM_OK, marca, ahora=1000.0 + 601)
        self.assertTrue(r)
        self.assertEqual(len(lanzados), 1)


class TestDecidirLaya(unittest.TestCase):
    def setUp(self):
        self.guardado = (jev.USO, jev.CACHE, jev.estado_laya, jev.calentar_laya,
                         jev.decidir_con_laya, jev.local_en_pausa, jev._local,
                         jev.TRANSPORTE_EXPLABS_DECISIONS)
        import tempfile

        d = tempfile.mkdtemp()
        jev.USO = os.path.join(d, "uso.json")
        jev.CACHE = os.path.join(d, "cache.json")
        jev.local_en_pausa = lambda: False
        jev._local = lambda: None

    def tearDown(self):
        (jev.USO, jev.CACHE, jev.estado_laya, jev.calentar_laya, jev.decidir_con_laya,
         jev.local_en_pausa, jev._local, jev.TRANSPORTE_EXPLABS_DECISIONS) = self.guardado

    def test_caliente_laya_primero_y_cuenta_laya(self):
        jev.estado_laya = lambda *a, **k: {"cargado": True}
        jev.decidir_con_laya = lambda e, p, **k: {"q": {"noul": 0.9}, "motor": "laya-local"}
        res = jev.decidir({"a": 1}, {"q": {"type": "noul"}}, usar_cache=False, medio="laya")
        self.assertEqual(res["medio"], "laya-local")
        por_medio = jev._leer(jev.USO, {}).get("por_medio", {})
        self.assertEqual(por_medio.get("laya", {}).get("llamadas"), 1)

    def test_fria_calienta_y_sigue_sin_bloquear(self):
        calentadas = []
        jev.estado_laya = lambda *a, **k: {"cargado": False}
        jev.calentar_laya = lambda url, **k: calentadas.append(url) or True
        jev.decidir_con_laya = lambda *a, **k: self.fail("no debe probar Laya fría")
        res = jev.decidir({"a": 2}, {"q": {"type": "noul"}}, usar_cache=False, medio="laya")
        self.assertIsNone(res)
        self.assertEqual(len(calentadas), 1)


if __name__ == "__main__":
    unittest.main()


class TestLayaRemotaDir1127F(unittest.TestCase):
    """DIR1127F: la Laya de la Mac sin RAM que reenvía al A1 (`remoto: true`) cuenta como lista."""

    def test_remoto_cuenta_como_cargada(self):
        def transporte(_url, _plazo):
            return 200, '{"cargado": false, "remoto": true, "ramLibreMb": 900}'
        self.assertEqual(jev.estado_laya("http://127.0.0.1:4470/v1/systemone", transporte=transporte), {"cargado": True})

    def test_sin_remoto_sigue_descargada(self):
        def transporte(_url, _plazo):
            return 200, '{"cargado": false, "ramLibreMb": 900}'
        self.assertEqual(jev.estado_laya("http://127.0.0.1:4470/v1/systemone", transporte=transporte), {"cargado": False})
