import importlib.util
import json
import os
import tempfile
import time
import unittest

AQUI = os.path.dirname(os.path.abspath(__file__))


def _cargar(nombre, ruta):
    spec = importlib.util.spec_from_file_location(nombre, ruta)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


gob = _cargar("gobernador_recursos", os.path.join(AQUI, "gobernador-recursos.py"))


class Decidir(unittest.TestCase):
    """Alex (2026-09-20, 22:40): el máximo posible; el uso interactivo no frena."""

    def test_interactivo_ya_no_baja_el_tope(self):
        d = gob.decidir(idle_s=12, ram_libre_mb=4000, swap_mb=0, maximo=3)
        self.assertEqual(d["trabajadores"], 3)
        self.assertTrue(d["interactivo"])
        self.assertEqual(d["bitnet"], "despertar")

    def test_interactivo_sin_ram_no_despierta_bitnet(self):
        d = gob.decidir(idle_s=12, ram_libre_mb=200, swap_mb=12800, maximo=3)
        self.assertEqual(d["trabajadores"], 3)
        self.assertEqual(d["bitnet"], "dejar")

    def test_maquina_libre_da_el_maximo(self):
        d = gob.decidir(idle_s=1800, ram_libre_mb=3000, swap_mb=1000, maximo=3)
        self.assertEqual(d["trabajadores"], 3)
        self.assertFalse(d["interactivo"])

    def test_el_swap_grande_ya_no_frena(self):
        d = gob.decidir(idle_s=1800, ram_libre_mb=1000, swap_mb=14000, maximo=3)
        self.assertEqual(d["trabajadores"], 3)

    def test_ram_al_limite_quita_uno_y_nunca_baja_de_dos(self):
        self.assertEqual(gob.decidir(1800, 90, 100, 4)["trabajadores"], 3)
        self.assertEqual(gob.decidir(1800, 90, 100, 3)["trabajadores"], 2)
        self.assertEqual(gob.decidir(1800, 90, 100, 2)["trabajadores"], 2)
        self.assertIn("límite", gob.decidir(1800, 90, 100, 3)["motivo"])

    def test_sin_medidas_no_frena(self):
        d = gob.decidir(idle_s=None, ram_libre_mb=None, swap_mb=None, maximo=2)
        self.assertEqual(d["trabajadores"], 2)
        self.assertFalse(d["interactivo"])

    def test_maximo_nunca_baja_de_uno(self):
        self.assertEqual(gob.decidir(None, None, None, 0)["trabajadores"], 1)


class MaximoPorHardware(unittest.TestCase):
    def test_escalones_medidos_por_ram(self):
        self.assertEqual(gob.maximo_por_hardware(8192, 8), 3)     # Mac M1 8 GB
        self.assertEqual(gob.maximo_por_hardware(16384, 8), 5)
        self.assertEqual(gob.maximo_por_hardware(24576, 4), 3)    # Oracle Free Tier: 4 núcleos frenan
        self.assertEqual(gob.maximo_por_hardware(32768, 16), 8)
        self.assertEqual(gob.maximo_por_hardware(65536, 32), 12)

    def test_los_nucleos_frenan(self):
        self.assertEqual(gob.maximo_por_hardware(8032, 2), 1)     # contenedor de nube 2 vCPU

    def test_sin_medida_vale_dos(self):
        self.assertEqual(gob.maximo_por_hardware(None, 8), 2)


class Estado(unittest.TestCase):
    def test_escribe_json_atomico_y_conserva_claves_previas(self):
        with tempfile.TemporaryDirectory() as d:
            ruta = os.path.join(d, "gobernador.json")
            with open(ruta, "w", encoding="utf-8") as f:
                json.dump({"nota": "previa"}, f)
            gob.escribir_estado({"trabajadores": 1, "motivo": "x", "interactivo": True, "bitnet": "dejar"},
                                {"idle_s": 3}, ruta=ruta)
            with open(ruta, encoding="utf-8") as f:
                j = json.load(f)
            self.assertEqual(j["trabajadores"], 1)
            self.assertEqual(j["nota"], "previa")
            self.assertIn("t", j)
            self.assertFalse(os.path.exists(ruta + ".tmp"))

    def test_maximo_configurado_lee_director_config(self):
        with tempfile.TemporaryDirectory() as d:
            ruta = os.path.join(d, "director-config.json")
            with open(ruta, "w", encoding="utf-8") as f:
                json.dump({"trabajadores": 3}, f)
            self.assertEqual(gob.maximo_configurado(ruta), 3)
            self.assertEqual(gob.maximo_configurado(os.path.join(d, "no-existe.json")), 2)


class TopeEnElOrquestador(unittest.TestCase):
    """El orquestador solo puede BAJAR por el gobernador, nunca subir, y un
    gobernador muerto (archivo viejo) no frena nada."""

    def setUp(self):
        enj = _cargar("starseed_enjambre_gob", os.path.join(AQUI, "..", "enjambre", "starseed-enjambre.py"))
        self.tope = enj.tope_gobernador
        self.estado = enj._GOBERNADOR
        self.estado.update({"mtime": 0.0, "tope": None, "leido": 0.0, "avisado": None})

    def _con(self, contenido, edad_s=0):
        d = tempfile.mkdtemp()
        ruta = os.path.join(d, "gobernador.json")
        with open(ruta, "w", encoding="utf-8") as f:
            f.write(contenido)
        os.utime(ruta, (time.time() - edad_s, time.time() - edad_s))
        return ruta

    def test_baja_al_tope_del_archivo(self):
        self.assertEqual(self.tope(3, ruta=self._con('{"trabajadores": 1}'), ahora=time.time()), 1)

    def test_nunca_sube_por_encima_de_workers(self):
        self.assertEqual(self.tope(2, ruta=self._con('{"trabajadores": 5}'), ahora=time.time()), 2)

    def test_archivo_viejo_vale_workers(self):
        self.assertEqual(self.tope(3, ruta=self._con('{"trabajadores": 1}', edad_s=4000), ahora=time.time()), 3)

    def test_archivo_ausente_o_roto_vale_workers(self):
        self.assertEqual(self.tope(3, ruta="/no/existe.json", ahora=time.time()), 3)
        self.estado.update({"mtime": 0.0, "tope": None, "leido": 0.0})
        self.assertEqual(self.tope(3, ruta=self._con("{basura"), ahora=time.time()), 3)


if __name__ == "__main__":
    unittest.main()
