#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Puertas de repartir_nube: qué se va a la nube y qué se queda en la Mac."""

import datetime, json, os, shutil, sys, tempfile, unittest

sys.path.insert(0, os.path.dirname(__file__))
import repartir_nube as R
from repartir_nube import elegir, marcar, MODELO_NUBE

COLAS = [
    (
        "cola-200.json",
        [
            {"id": "A1", "ola": "200"},
            {"id": "A2", "ola": "200"},
            {"id": "A1", "ola": "200"},
        ],
    ),
    ("cola-317.json", [{"id": "B1", "ola": "317"}]),
]
MAIN = ["Ola 200 · A2: ya integrada"]
PROG = {"A1": {"estado": "fallo_tests"}, "A2": {"estado": "fallo"}}


class Elegir(unittest.TestCase):
    def test_candidata_es_la_que_fallo_y_no_esta_en_main_ni_en_la_ola_actual(self):
        r = elegir(COLAS, PROG, MAIN, ola_actual="317")
        self.assertEqual([t["id"] for t in r], ["A1"])
        self.assertEqual(r[0]["modelo"], MODELO_NUBE)

    def test_ola_actual_nunca_se_reparte(self):
        prog = {"A1": {"estado": "integrada"}, "A2": {"estado": "en_curso"}, "B1": {}}
        r = elegir(COLAS, prog, [], ola_actual="317")
        self.assertEqual(r, [])

    def test_estados_vivos_o_cerrados_no_se_reparten(self):
        # (2026-09-22) «pendiente» SALIO de esta lista y entro en ESTADOS_REPARTIBLES: era
        # el ultimo candado de la nube. Con solo estados de fallo, a los contenedores solo
        # podia ir lo que ya se habia roto en la Mac — trabajo nuevo, jamas — y por eso
        # doce huecos libres se quedaban vacios toda la noche.
        prog = {
            "A2": {"estado": "integrada"},
            "B1": {"estado": "en_curso"},
        }
        r = elegir([("cola-1.json", [{"id": "A2", "ola": "200"}, {"id": "B1", "ola": "200"}])],
                   prog, [], ola_actual="999")
        self.assertEqual(r, [])

    def test_una_tarea_pendiente_SI_puede_ir_a_un_contenedor_libre(self):
        r = elegir([("cola-1.json", [{"id": "A1", "ola": "200"}])],
                   {"A1": {"estado": "pendiente"}}, [], ola_actual="999")
        self.assertEqual([t["id"] for t in r], ["A1"])

    def test_tope_recorta(self):
        colas = [("cola-1.json", [{"id": "T%d" % i, "ola": "1"} for i in range(5)])]
        self.assertEqual(len(elegir(colas, {}, [], "999", tope=3)), 3)


class Marcar(unittest.TestCase):
    def test_marca_reasignada_nube_con_fecha(self):
        p = marcar(PROG, ["A1"], "2026-09-13")
        self.assertEqual(p["A1"]["estado"], "reasignada")
        self.assertEqual(p["A1"]["medio"], "nube")
        self.assertIn("2026-09-13", p["A1"]["nota"])
        self.assertEqual(PROG["A1"]["estado"], "fallo_tests")


class OlaExacta(unittest.TestCase):
    def test_ola_se_compara_por_numero_exacto_no_prefijo(self):
        colas = [
            ("cola-3179.json", [{"id": "C1", "ola": "Ola 3179"}]),
            ("cola-317.json", [{"id": "C2", "ola": "317"}]),
        ]
        r = elegir(colas, {}, [], ola_actual="317")
        self.assertEqual([t["id"] for t in r], ["C1"])


class RepartoScript(unittest.TestCase):
    def setUp(self):
        import importlib.util

        ruta = os.path.join(os.path.dirname(__file__), "repartir-a-nube.py")
        esp = importlib.util.spec_from_file_location("repartir_a_nube_cli", ruta)
        self.mod = importlib.util.module_from_spec(esp)
        esp.loader.exec_module(self.mod)
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp, True)

    def test_nombre_lleva_fecha_hora_y_nunca_sobrescribe(self):
        ahora = datetime.datetime(2026, 9, 13, 2, 30)
        n1 = self.mod.nombre_destino(ahora, self.tmp)
        open(os.path.join(self.tmp, n1), "w").close()
        n2 = self.mod.nombre_destino(ahora, self.tmp)
        self.assertEqual(n1, "cola-nube-20260913-0230.json")
        self.assertEqual(n2, "cola-nube-20260913-0230-2.json")

    def test_carpeta_destino_se_crea_si_falta(self):
        raiz = self.tmp
        os.makedirs(os.path.join(raiz, "enjambre"))
        olas = os.path.join(raiz, "starseed_memory_root", "olas")
        os.makedirs(olas)
        json.dump(
            {"tareas": [{"id": "Z1", "ola": "111"}]},
            open(os.path.join(olas, "cola-999.json"), "w"),
        )
        m = self.mod
        m.RAIZ, m.OLAS = raiz, olas
        m.PROGRESO = os.path.join(olas, "progreso.json")
        m.DESTINO_DIR = os.path.join(raiz, "enjambre", "colas")
        m.asuntos_main = lambda r: []
        m.validar_raiz = lambda r: None
        m.puente.decir = lambda *a, **k: None
        sys.argv = ["repartir-a-nube.py"]
        m.main()
        salidas = os.listdir(m.DESTINO_DIR)
        self.assertEqual(len(salidas), 1)
        datos = json.load(open(os.path.join(m.DESTINO_DIR, salidas[0])))
        self.assertEqual([t["id"] for t in datos["tareas"]], ["Z1"])

    def test_git_log_que_falla_aborta_con_error_claro(self):
        with self.assertRaises(SystemExit) as ctx:
            self.mod.asuntos_main(self.tmp)
        self.assertIn("git log", str(ctx.exception))

    def test_raiz_sin_repo_ni_colas_aborta(self):
        with self.assertRaises(SystemExit) as ctx:
            self.mod.validar_raiz(self.tmp)
        self.assertIn("STARSEED_ROOT", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()


class TestTamanoParaLaNube(unittest.TestCase):
    """La nube no tiene revisor: solo tareas pequenas, y las de 1 archivo primero.

    Anoche cayeron NE1c (3 archivos), R6b (6) y R7b (9) despues de 40-60 min de
    agente cada una, las tres por no llegar a tocarlos todos. En la nube eso es
    trabajo a la basura; en la Mac hay quien lo rescata.
    """

    def _colas(self, tareas):
        return [("cola-x.json", tareas)]

    def test_descarta_las_de_mas_de_tres_archivos(self):
        tareas = [
            {"id": "GRANDE", "archivos": ["a", "b", "c", "d"]},
            {"id": "CABE", "archivos": ["a", "b", "c"]},
        ]
        salida = elegir(self._colas(tareas), {}, [], None, tope=10)
        self.assertEqual([t["id"] for t in salida], ["CABE"])

    def test_primero_las_de_un_solo_archivo(self):
        tareas = [
            {"id": "TRES", "archivos": ["a", "b", "c"]},
            {"id": "UNA", "archivos": ["a"]},
            {"id": "DOS", "archivos": ["a", "b"]},
        ]
        salida = elegir(self._colas(tareas), {}, [], None, tope=10)
        self.assertEqual([t["id"] for t in salida], ["UNA", "DOS", "TRES"])

    def test_el_tope_se_aplica_despues_de_ordenar(self):
        """Sin esto el tope se llevaba las grandes y dejaba fuera las de un archivo."""
        tareas = [
            {"id": "TRES", "archivos": ["a", "b", "c"]},
            {"id": "UNA", "archivos": ["a"]},
        ]
        salida = elegir(self._colas(tareas), {}, [], None, tope=1)
        self.assertEqual([t["id"] for t in salida], ["UNA"])

    def test_si_no_cabe_ninguna_la_nube_no_recibe_nada(self):
        tareas = [{"id": "G1", "archivos": list("abcdef")}]
        self.assertEqual(elegir(self._colas(tareas), {}, [], None, tope=10), [])

    def test_descarta_las_que_dependen_de_otra(self):
        """La nube solo ve origin/main: no puede juzgar una dependencia viva."""
        tareas = [
            {"id": "ESPERA", "archivos": ["a"], "depende": ["OTRA"]},
            {"id": "LIBRE", "archivos": ["a"]},
        ]
        salida = elegir(self._colas(tareas), {}, [], None, tope=10)
        self.assertEqual([t["id"] for t in salida], ["LIBRE"])

    def test_dependencia_como_texto_tambien_cuenta(self):
        tareas = [{"id": "ESPERA", "archivos": ["a"], "depende": "OTRA"}]
        self.assertEqual(elegir(self._colas(tareas), {}, [], None, tope=10), [])

    def test_depende_de_vacio_no_estorba(self):
        """`depende_de: []` es lo que escriben los seguimientos: no es esperar a nadie."""
        tareas = [{"id": "LIBRE", "archivos": ["a"], "depende_de": []}]
        salida = elegir(self._colas(tareas), {}, [], None, tope=10)
        self.assertEqual([t["id"] for t in salida], ["LIBRE"])

    def test_sin_archivos_declarados_sigue_cabiendo(self):
        tareas = [{"id": "SIN", "archivos": []}]
        salida = elegir(self._colas(tareas), {}, [], None, tope=10)
        self.assertEqual([t["id"] for t in salida], ["SIN"])




class DependenciasHechasNoFrenanLaNube(unittest.TestCase):
    """(2026-09-22) Antes se descartaba TODA tarea con dependencias, estuvieran hechas o
    no, porque la nube solo veia `origin/main`. Desde que la cola y el codigo viajan en su
    propia rama, el runner ve lo mismo que la Mac — y mantener el descarte costaba la nube
    entera: medido, el reparto pasaba de 0 a 4 tareas con solo mirar si la dependencia
    estaba integrada."""

    def test_dependencia_integrada_no_frena(self):
        tarea = {"id": "B", "depende": ["A"]}
        self.assertEqual(R.dependencias_pendientes(tarea, {"A": {"estado": "commit"}}), [])

    def test_dependencia_sin_hacer_si_frena(self):
        tarea = {"id": "B", "depende": ["A"]}
        self.assertEqual(R.dependencias_pendientes(tarea, {"A": {"estado": "fallo"}}), ["A"])

    def test_dependencia_que_no_existe_frena(self):
        # p318Jb espera a un p318I que nunca se creo.
        self.assertEqual(R.dependencias_pendientes({"id": "X", "depende": ["p318I"]}, {}), ["p318I"])

    def test_dependencia_ya_en_main_no_frena_aunque_el_progreso_no_lo_diga(self):
        tarea = {"id": "B", "depende": ["A"]}
        # `id_en_asuntos` recorre una LISTA de asuntos, uno por commit.
        asuntos = ["Ola 1 · A: lo que hiciera"]
        self.assertEqual(R.dependencias_pendientes(tarea, {}, asuntos), [])

    def test_sin_dependencias_no_hay_nada_que_esperar(self):
        self.assertEqual(R.dependencias_pendientes({"id": "A"}, {}), [])

    def test_elegir_deja_pasar_la_que_tiene_su_dependencia_hecha(self):
        colas = [("cola-1.json", [
            {"id": "B", "ola": "9", "depende": ["A"], "archivos": ["x.ts"]},
            {"id": "C", "ola": "9", "depende": ["Z"], "archivos": ["y.ts"]},
        ])]
        # Sin entrada en progreso = repartible (ESTADOS_REPARTIBLES incluye None).
        prog = {"A": {"estado": "commit"}}
        elegidas = [t["id"] for t in R.elegir(colas, prog, [], "", tope=5)]
        self.assertIn("B", elegidas)
        self.assertNotIn("C", elegidas)
