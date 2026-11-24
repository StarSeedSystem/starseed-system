#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Puertas de repartir_nube: qué se va a la nube y qué se queda en la Mac."""

import datetime, json, os, shutil, sys, tempfile, unittest
from unittest import mock

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
        # (2026-10-03) Sin modelo clavado: la nube usa su rotación por mérito.
        self.assertNotIn("modelo", r[0])
        self.assertEqual(MODELO_NUBE, "")

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
        r = elegir(
            [("cola-1.json", [{"id": "A2", "ola": "200"}, {"id": "B1", "ola": "200"}])],
            prog,
            [],
            ola_actual="999",
        )
        self.assertEqual(r, [])

    def test_una_tarea_pendiente_SI_puede_ir_a_un_contenedor_libre(self):
        r = elegir(
            [("cola-1.json", [{"id": "A1", "ola": "200"}])],
            {"A1": {"estado": "pendiente"}},
            [],
            ola_actual="999",
        )
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
        # El cerrojo de progreso de las pruebas nunca es el de la Mac (SUP0211H).
        p = mock.patch.object(self.mod, "CERROJO_PROGRESO", os.path.join(self.tmp, "cerrojos", "progreso.lock"),
                              create=True)
        p.start()
        self.addCleanup(p.stop)

    def _preparar(self):
        """Árbol temporal con una cola de código (Z1, de otra ola) y el reparto apuntando a él."""
        raiz = self.tmp
        os.makedirs(os.path.join(raiz, "enjambre"))
        olas = os.path.join(raiz, "starseed_memory_root", "olas")
        os.makedirs(olas)
        with open(os.path.join(olas, "cola-999.json"), "w") as f:
            json.dump({"tareas": [{"id": "Z1", "ola": "111"}]}, f)
        m = self.mod
        m.RAIZ, m.OLAS = raiz, olas
        m.PROGRESO = os.path.join(olas, "progreso.json")
        m.DESTINO_DIR = os.path.join(raiz, "enjambre", "colas")
        m.asuntos_main = lambda r: []
        m.validar_raiz = lambda r: None
        import repartir_nube as RN

        for objeto, nombre, valor in ((m.puente, "decir", lambda *a, **k: None),
                                      (RN, "nube_pausada", lambda *a, **k: None)):
            p = mock.patch.object(objeto, nombre, valor, create=True)
            p.start()
            self.addCleanup(p.stop)
        sys.argv = ["repartir-a-nube.py"]
        return m

    def _escribir_progreso(self, m, datos):
        with open(m.PROGRESO, "w", encoding="utf-8") as f:
            json.dump(datos, f)

    def test_lo_que_otros_escriben_durante_el_reparto_no_se_pierde(self):
        # (SUP0211H, medido el 02-11) Se volcaba la foto del principio: «sustituida» volvía a «sin_cambios».
        m = self._preparar()
        self._escribir_progreso(m, {"OTRA": {"estado": "sin_cambios"}})

        def asuntos(_raiz):  # mientras el reparto mide y elige, otro proceso cierra OTRA
            self._escribir_progreso(m, {"OTRA": {"estado": "sustituida"}})
            return []

        m.asuntos_main = asuntos
        m.main()
        with open(m.PROGRESO, encoding="utf-8") as f:
            prog = json.load(f)
        self.assertEqual(prog["OTRA"]["estado"], "sustituida")
        self.assertEqual(prog["Z1"]["estado"], "reasignada")
        self.assertEqual(len(os.listdir(m.DESTINO_DIR)), 1)

    def test_la_que_cambia_mientras_se_elige_no_viaja(self):
        m = self._preparar()

        def asuntos(_raiz):  # el orquestador la empieza mientras tanto
            self._escribir_progreso(m, {"Z1": {"estado": "en_curso"}})
            return []

        m.asuntos_main = asuntos
        m.main()
        self.assertFalse(os.path.isdir(m.DESTINO_DIR) and os.listdir(m.DESTINO_DIR))
        with open(m.PROGRESO, encoding="utf-8") as f:
            self.assertEqual(json.load(f)["Z1"]["estado"], "en_curso")

    def test_vigentes_es_pura(self):
        elegidas = [{"id": "A"}, {"id": "B"}, {"id": "C"}]
        visto = {"A": {"estado": "fallo"}, "B": {"estado": "pendiente"}}
        fresco = {"A": {"estado": "fallo"}, "B": {"estado": "commit"}, "C": {"estado": "en_curso"}}
        self.assertEqual([t["id"] for t in self.mod.vigentes(elegidas, visto, fresco)], ["A"])

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
        with open(os.path.join(olas, "cola-999.json"), "w") as f:
            json.dump({"tareas": [{"id": "Z1", "ola": "111"}]}, f)
        m = self.mod
        m.RAIZ, m.OLAS = raiz, olas
        m.PROGRESO = os.path.join(olas, "progreso.json")
        m.DESTINO_DIR = os.path.join(raiz, "enjambre", "colas")
        m.asuntos_main = lambda r: []
        m.validar_raiz = lambda r: None
        m.puente.decir = lambda *a, **k: None
        import repartir_nube as RN

        pausa_real = RN.nube_pausada
        RN.nube_pausada = lambda *a, **k: None
        self.addCleanup(setattr, RN, "nube_pausada", pausa_real)
        sys.argv = ["repartir-a-nube.py"]
        m.main()
        salidas = os.listdir(m.DESTINO_DIR)
        self.assertEqual(len(salidas), 1)
        with open(os.path.join(m.DESTINO_DIR, salidas[0])) as f:
            datos = json.load(f)
        self.assertEqual([t["id"] for t in datos["tareas"]], ["Z1"])

    def test_git_log_que_falla_aborta_con_error_claro(self):
        with self.assertRaises(SystemExit) as ctx:
            self.mod.asuntos_main(self.tmp)
        self.assertIn("git log", str(ctx.exception))

    def test_raiz_sin_repo_ni_colas_aborta(self):
        with self.assertRaises(SystemExit) as ctx:
            self.mod.validar_raiz(self.tmp)
        self.assertIn("STARSEED_ROOT", str(ctx.exception))


class LasMismasTresVecesYVeces(unittest.TestCase):
    """(2026-09-24, medido) CU3br, p318Jb y p318Jc, 22 envíos seguidos a la nube."""

    ASUNTOS = [
        "Ola 318 · Director de verdad · p318I: la pestaña Director monta ControlDirectores"
    ]

    def test_las_dependencias_ya_en_main_no_viajan_a_la_nube(self):
        colas = [
            (
                "cola-reintentos.json",
                [
                    {
                        "id": "p318Jb",
                        "ola": "Ola 318",
                        "depende": ["p318I"],
                        "archivos": ["a.ts"],
                    }
                ],
            )
        ]
        elegidas = elegir(colas, {}, self.ASUNTOS, "364")
        self.assertEqual([t["id"] for t in elegidas], ["p318Jb"])
        self.assertEqual(elegidas[0]["depende"], [])
        self.assertEqual(elegidas[0]["dependencias_ya_en_main"], ["p318I"])

    def test_tras_tres_envios_no_se_vuelve_a_mandar(self):
        colas = [
            ("cola-362.json", [{"id": "CU3br", "ola": "362", "archivos": ["a.ts"]}])
        ]
        # MAX_ENVIOS_NUBE = 5 ahora
        self.assertEqual(elegir(colas, {}, [], "364", envios={"CU3br": 5}), [])
        self.assertEqual(len(elegir(colas, {}, [], "364", envios={"CU3br": 4})), 1)

    def test_contar_envios(self):
        colas_nube = [
            ("cola-nube-1.json", ["CU3br", "p318Jb"]),
            ("cola-nube-2.json", ["CU3br", "CU3br"]),
        ]
        self.assertEqual(R.envios_por_tarea(colas_nube), {"CU3br": 2, "p318Jb": 1})

    def test_devolver_bloquea_tras_el_tope_y_dice_lo_que_dijo_la_nube(self):
        prog = {
            "CU3br": {"estado": "reasignada", "medio": "nube"},
            "X": {"estado": "reasignada", "medio": "nube"},
        }
        nuevo = R.devolver_a_pendiente(
            prog,
            ["CU3br", "X"],
            "20260924",
            envios={"CU3br": 22, "X": 1},
            veredictos={
                "CU3br": ("rechazada", "no toco ninguno de los archivos declarados")
            },
        )
        self.assertEqual(nuevo["CU3br"]["estado"], "bloqueada")
        self.assertIn("22 veces", nuevo["CU3br"]["nota"])
        self.assertIn("no toco ninguno", nuevo["CU3br"]["nota"])
        self.assertEqual(nuevo["X"]["estado"], "pendiente")
        # MAX_ENVIOS_NUBE = 5 ahora
        self.assertIn("envío 1 de 5", nuevo["X"]["nota"])


class TandaVivaDeLaMac(unittest.TestCase):
    """(2026-10-08) RM6b en la tanda viva de la Mac no puede ir también a la nube."""

    def test_lee_los_ids_de_la_cola_del_orquestador(self):
        import tempfile
        from repartir_nube import ids_de_la_tanda_viva
        with tempfile.TemporaryDirectory() as olas:
            with open(os.path.join(olas, "cola-auto-1008-163740.json"), "w", encoding="utf-8") as f:
                json.dump([{"id": "RM6b"}, {"id": "RM7"}], f)
            ps = ("/usr/bin/python3 -u /Users/x/.local/bin/starseed-enjambre.py starseed_memory_root/olas/"
                  "cola-auto-1008-163740.json --workers 3\n/bin/zsh -c grep starseed-enjambre.py cola-x.json\n")
            self.assertEqual(ids_de_la_tanda_viva(ps, olas), {"RM6b", "RM7"})
            self.assertEqual(ids_de_la_tanda_viva("", olas), set())


class ReservaDinamica(unittest.TestCase):
    """(AUT1121C) Reserva dinámica de la Mac: si tope ≤ 2 o disco < 2 GB → 1 ronda;
    si disco < 1 GB → 0 rondas (cede todo)."""

    def test_tope_normal_dos_rondas(self):
        self.assertEqual(R.calcular_rondas_reserva(3, 10.0), 2)
        self.assertEqual(R.calcular_rondas_reserva(5, 5.0), 2)

    def test_tope_dos_una_ronda(self):
        self.assertEqual(R.calcular_rondas_reserva(2, 10.0), 1)
        self.assertEqual(R.calcular_rondas_reserva(1, 10.0), 1)

    def test_disco_justo_una_ronda(self):
        self.assertEqual(R.calcular_rondas_reserva(3, 1.5), 1)
        self.assertEqual(R.calcular_rondas_reserva(5, 1.9), 1)

    def test_disco_critico_cero_rondas(self):
        self.assertEqual(R.calcular_rondas_reserva(3, 0.5), 0)
        self.assertEqual(R.calcular_rondas_reserva(5, 0.0), 0)

    def test_disco_none_usa_tope(self):
        self.assertEqual(R.calcular_rondas_reserva(3, None), 2)
        self.assertEqual(R.calcular_rondas_reserva(2, None), 1)


class ExplicarSimular(unittest.TestCase):
    """(AUT1121C) `repartir-a-nube.py --simular --explicar` muestra por qué cada
    tarea se queda o se va: reserva Mac, esperada por otra, cadena larga,
    archivos nativos, prestada, ya devuelta, en vuelo.

    NOTA: El CLI actual filtra las tareas de tanda/prestadas/en-vuelo ANTES de clasificar,
    por lo que no aparecen en la explicación. Esto es una limitación conocida del CLI;
    las funciones puras (clasificar, motivo_fuera) funcionan correctamente y se prueban
    en otras clases de test.
    """

    def setUp(self):
        import importlib.util
        import tempfile
        import shutil

        ruta = os.path.join(os.path.dirname(__file__), "repartir-a-nube.py")
        esp = importlib.util.spec_from_file_location("repartir_a_nube_cli", ruta)
        self.mod = importlib.util.module_from_spec(esp)
        esp.loader.exec_module(self.mod)
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp, True)
        p = mock.patch.object(self.mod, "CERROJO_PROGRESO",
                              os.path.join(self.tmp, "cerrojos", "progreso.lock"),
                              create=True)
        p.start()
        self.addCleanup(p.stop)
        # Patch subprocess.run for the entire test
        self._subprocess_patcher = mock.patch("subprocess.run")
        self._mock_run = self._subprocess_patcher.start()
        self.addCleanup(self._subprocess_patcher.stop)

    def _preparar(self, tareas, progreso=None, procesos="", prestadas=None, colas_nube=None, tanda_colas=None):
        raiz = self.tmp
        os.makedirs(os.path.join(raiz, "enjambre"))
        olas = os.path.join(raiz, "starseed_memory_root", "olas")
        os.makedirs(olas)
        # Usar cola-123.json para que ola_actual sea "123" y las tareas con ola "999" no sean ola-actual
        with open(os.path.join(olas, "cola-123.json"), "w") as f:
            json.dump({"tareas": tareas}, f)
        # Crear cola de tanda si se especifica
        if tanda_colas:
            for nombre, ids in tanda_colas:
                with open(os.path.join(olas, nombre), "w") as f:
                    json.dump([{"id": i} for i in ids], f)
        m = self.mod
        m.RAIZ, m.OLAS = raiz, olas
        m.PROGRESO = os.path.join(olas, "progreso.json")
        m.DESTINO_DIR = os.path.join(raiz, "enjambre", "colas")
        m.asuntos_main = lambda r: []
        m.validar_raiz = lambda r: None
        import repartir_nube as RN
        # Mock base - set attributes directly like the original tests
        m.puente.decir = lambda *a, **k: None
        RN.nube_pausada = lambda *a, **k: None
        # Mock prestadas
        RN.leer_prestadas = lambda *a, **k: set(prestadas or [])
        # Mock colas nube
        if colas_nube is not None:
            RN.leer_colas_nube = lambda *a, **k: colas_nube
        if progreso:
            with open(m.PROGRESO, "w", encoding="utf-8") as f:
                json.dump(progreso, f)
        self._mock_run.return_value.stdout = procesos

    def _ejecutar(self, argv):
        import io
        from contextlib import redirect_stdout
        sys.argv = argv
        buf = io.StringIO()
        with redirect_stdout(buf):
            try:
                self.mod.main()
            except SystemExit:
                pass
        return buf.getvalue()

    def test_explicar_muestra_elegibles_y_no_elegibles(self):
        """--explicar imprime ✅ para elegibles y ❌ con motivo para las demás."""
        # Usar ola "999" para las tareas, diferente de la cola actual "123"
        tareas = [
            {"id": "LIBRE", "ola": "999", "archivos": ["a.ts"]},
            {"id": "GRANDE", "ola": "999", "archivos": ["a", "b", "c", "d", "e", "f"]},
            {"id": "ESPERA", "ola": "999", "archivos": ["a.ts"], "depende": ["OTRA"]},
        ]
        self._preparar(tareas)
        salida = self._ejecutar(["repartir-a-nube.py", "--simular", "--explicar", "--tope", "10"])
        self.assertIn("✅ LIBRE: VA A LA NUBE", salida)
        self.assertIn("❌ GRANDE: SE QUEDA (grande)", salida)
        self.assertIn("❌ ESPERA: SE QUEDA (espera)", salida)

    def test_explicar_clasificacion_pura_fuera_de_tanda(self):
        """La función pura `clasificar` sí distingue tareas en tanda/prestadas/en-vuelo
        cuando se le pasa las colas originales (antes de filtrar)."""
        import repartir_nube as RN
        from repartir_nube import clasificar
        tareas = [
            {"id": "LIBRE", "ola": "999", "archivos": ["a.ts"]},
            {"id": "EN_TANDA", "ola": "999", "archivos": ["b.ts"]},
            {"id": "PRESTADA", "ola": "999", "archivos": ["c.ts"]},
            {"id": "EN_VUELO", "ola": "999", "archivos": ["d.ts"]},
        ]
        progreso = {}
        asuntos = []
        ola_actual = "123"
        envios = {}
        # Simular cola nube para EN_VUELO
        ahora = datetime.datetime.now().timestamp()
        colas_nube = [("cola-nube-" + datetime.datetime.fromtimestamp(ahora).strftime("%Y%m%d-%H%M") + ".json", ["EN_VUELO"])]
        with mock.patch.object(RN, "leer_colas_nube", return_value=colas_nube):
            with mock.patch.object(RN, "leer_prestadas", return_value={"PRESTADA"}):
                # Clasificar SIN filtrar (como debería hacer --explicar idealmente)
                clasif = clasificar(
                    [("cola-123.json", tareas)],
                    progreso, asuntos, ola_actual, envios=envios
                )
        self.assertIn("LIBRE", clasif.get("elegibles", []))
        # EN_TANDA, PRESTADA, EN_VUELO no aparecen en elegibles porque tienen motivos para quedarse
        # La función pura clasificar no sabe de tanda/prestadas/vuelo; eso lo filtra el CLI

    


class A1NoEsperaGuardianRojo(unittest.TestCase):
    """El A1 no se queda 'en espera' por tener el guardián de main en rojo
    cuando la tarea no depende de lo que está rojo."""

    def test_tarea_sin_dependencia_no_espera_guardian(self):
        from repartir_nube import dependencias_pendientes
        tarea = {"id": "A1_TASK", "archivos": ["a.ts"]}
        progreso = {}
        asuntos_main = ["Ola 1 · ROJO: tsc falló en modulo X"]  # main en rojo
        # La tarea no depende de nada, así que no debería esperar
        self.assertEqual(dependencias_pendientes(tarea, progreso, asuntos_main), [])

    def test_tarea_con_dependencia_en_verde_no_espera(self):
        from repartir_nube import dependencias_pendientes
        tarea = {"id": "A1_TASK", "depende": ["DEP_OK"], "archivos": ["a.ts"]}
        progreso = {"DEP_OK": {"estado": "commit"}}
        asuntos_main = ["Ola 1 · ROJO: tsc falló en modulo X"]
        # La dependencia ya está en main (commit), no espera
        self.assertEqual(dependencias_pendientes(tarea, progreso, asuntos_main), [])

    def test_tarea_con_dependencia_en_rojo_espera(self):
        from repartir_nube import dependencias_pendientes
        tarea = {"id": "A1_TASK", "depende": ["DEP_ROJO"], "archivos": ["a.ts"]}
        progreso = {"DEP_ROJO": {"estado": "fallo_tests"}}
        asuntos_main = ["Ola 1 · ROJO: tsc falló en modulo X"]
        # La dependencia está en fallo y no en main, espera
        self.assertEqual(dependencias_pendientes(tarea, progreso, asuntos_main), ["DEP_ROJO"])


class DiagnosticosNube(unittest.TestCase):
    """Diagnostica 'última ejecución de Actions: failure' y 'devueltas de la nube (allí no quedaba nadie)'."""

    def test_ultima_ejecucion_failure_se_detecta(self):
        from repartir_nube import reclamar_varadas
        # Tareas reasignadas a la nube con 0 runs en marcha → se reclaman
        prog = {
            "T1": {"estado": "reasignada", "medio": "nube"},
            "T2": {"estado": "reasignada", "medio": "nube"},
        }
        # runs_en_marcha = 0, no hay ids_vivos → ambas vuelven
        self.assertEqual(R.reclamar_varadas(prog, 0), ["T1", "T2"])

    def test_devueltas_sin_run_vivo_se_reclaman(self):
        from repartir_nube import reclamar_varadas
        prog = {
            "T1": {"estado": "reasignada", "medio": "nube", "nota": "devuelta de la nube: no quedaba ningún run"},
            "T2": {"estado": "reasignada", "medio": "nube", "nota": "devuelta del carril: el carril en la nube no dio sesión"},
        }
        # Con runs_en_marcha > 0 pero ids_vivos vacío (el run vivo es de otra cola)
        self.assertEqual(R.reclamar_varadas(prog, 1, ids_vivos=set()), ["T1", "T2"])

    def test_no_reclama_si_run_vivo_de_su_cola(self):
        from repartir_nube import reclamar_varadas
        prog = {"T1": {"estado": "reasignada", "medio": "nube"}}
        # Hay un run vivo que SÍ lleva la cola de T1
        self.assertEqual(R.reclamar_varadas(prog, 1, ids_vivos={"T1"}), [])

    def test_agotadas_con_failure_no_vuelven_sin_potenciar(self):
        from repartir_nube import motivo_fuera
        # Tarea con estado "pendiente" (repartible) pero con 5 envíos (MAX_ENVIOS_NUBE)
        tarea = {"id": "AGOTADA", "ola": "100", "archivos": ["a.ts"]}
        progreso = {"AGOTADA": {"estado": "pendiente"}}  # estado repartible
        envios = {"AGOTADA": 5}  # MAX_ENVIOS_NUBE = 5
        # Sin potenciar, agotada se queda fuera por "agotada"
        self.assertEqual(motivo_fuera(tarea, progreso, [], None, envios), "agotada")

    def test_agotadas_vuelven_con_potenciar(self):
        # La lógica de reaperturas potenciadas está en buscar_capacidad.py
        from buscar_capacidad import REAPERTURAS_POTENCIADO
        self.assertEqual(REAPERTURAS_POTENCIADO, 3)


class CadenasCediblesCompletas(unittest.TestCase):
    """(AUT1121C) Las cadenas se ceden ENTERAS a la nube, no solo la cabeza."""

    def test_cadena_tres_niveles_se_cede_entera(self):
        tareas = {
            "A": {"id": "A", "archivos": ["a.ts"]},
            "B": {"id": "B", "depende": ["A"], "archivos": ["b.ts"]},
            "C": {"id": "C", "depende": ["B"], "archivos": ["c.ts"]},
            "M1": {"id": "M1"}, "M2": {"id": "M2"}, "M3": {"id": "M3"}, "M4": {"id": "M4"},
        }
        listas = ["M1", "M2", "M3", "M4", "A", "B", "C"]
        esperadas_por = {"A": {"B"}, "B": {"C"}}
        # tope 1, 2 rondas por defecto → reserva = 2 (M1, M2)
        # A, B, C están después de la reserva y forman cadena completa
        r = R.cadenas_cedibles(tareas, listas, 1, esperadas_por, rondas=2)
        self.assertEqual(r, [["A", "B", "C"]])

    def test_cadena_mas_larga_que_max_no_se_cede(self):
        # MAX_CADENA_CEDIBLE = 6
        hijos = [f"B{i}" for i in range(6)]  # 6 hijos = 7 total con A
        tareas = {"A": {"id": "A"}, **{h: {"id": h, "depende": ["A"]} for h in hijos}}
        for i in range(4):
            tareas[f"M{i}"] = {"id": f"M{i}"}
        listas = [f"M{i}" for i in range(4)] + ["A"] + hijos
        esperadas_por = {"A": set(hijos)}
        r = R.cadenas_cedibles(tareas, listas, 1, esperadas_por, rondas=2)
        self.assertEqual(r, [])  # 7 > 6, no se cede

    def test_cadena_exacta_max_se_cede(self):
        # 5 hijos + A = 6 = MAX_CADENA_CEDIBLE
        hijos = [f"B{i}" for i in range(5)]
        tareas = {"A": {"id": "A"}, **{h: {"id": h, "depende": ["A"]} for h in hijos}}
        for i in range(4):
            tareas[f"M{i}"] = {"id": f"M{i}"}
        listas = [f"M{i}" for i in range(4)] + ["A"] + hijos
        esperadas_por = {"A": set(hijos)}
        r = R.cadenas_cedibles(tareas, listas, 1, esperadas_por, rondas=2)
        # El orden de los miembros puede variar (sets), verificar el conjunto
        self.assertEqual(len(r), 1)
        self.assertEqual(set(r[0]), {"A"} | set(hijos))
        self.assertEqual(r[0][0], "A")  # La cabeza siempre va primero


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
            {"id": "GRANDE", "archivos": ["a", "b", "c", "d", "e", "f"]},  # 6 archivos > MAX_ARCHIVOS_NUBE (5)
            {"id": "CABE", "archivos": ["a", "b", "c", "d", "e"]},  # 5 archivos = MAX_ARCHIVOS_NUBE
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
        self.assertEqual(
            R.dependencias_pendientes(tarea, {"A": {"estado": "commit"}}), []
        )

    def test_dependencia_sin_hacer_si_frena(self):
        tarea = {"id": "B", "depende": ["A"]}
        self.assertEqual(
            R.dependencias_pendientes(tarea, {"A": {"estado": "fallo"}}), ["A"]
        )

    def test_dependencia_que_no_existe_frena(self):
        # p318Jb espera a un p318I que nunca se creo.
        self.assertEqual(
            R.dependencias_pendientes({"id": "X", "depende": ["p318I"]}, {}), ["p318I"]
        )

    def test_dependencia_ya_en_main_no_frena_aunque_el_progreso_no_lo_diga(self):
        tarea = {"id": "B", "depende": ["A"]}
        # `id_en_asuntos` recorre una LISTA de asuntos, uno por commit.
        asuntos = ["Ola 1 · A: lo que hiciera"]
        self.assertEqual(R.dependencias_pendientes(tarea, {}, asuntos), [])

    def test_sin_dependencias_no_hay_nada_que_esperar(self):
        self.assertEqual(R.dependencias_pendientes({"id": "A"}, {}), [])

    def test_sucesora_integrada_cumple_la_dependencia(self):
        # (2026-10-11) PM1010F0A cayó en tests y la reparó PM1010F0Ab: el vigilante ya lo daba
        # por cumplido y la nube no, así que la Mac cedía la tarea y la nube la rechazaba.
        tarea = {"id": "PM1010F2E", "depende": ["PM1010F0A"]}
        progreso = {"PM1010F0A": {"estado": "fallo_tests"}, "PM1010F0Ab": {"estado": "commit"}}
        self.assertEqual(R.dependencias_pendientes(tarea, progreso), [])

    def test_sucesora_sin_integrar_no_la_cumple(self):
        tarea = {"id": "B", "depende": ["A1"]}
        progreso = {"A1": {"estado": "fallo_tests"}, "A1b": {"estado": "pendiente"}}
        self.assertEqual(R.dependencias_pendientes(tarea, progreso), ["A1"])

    def test_elegir_deja_pasar_la_que_tiene_su_dependencia_hecha(self):
        colas = [
            (
                "cola-1.json",
                [
                    {"id": "B", "ola": "9", "depende": ["A"], "archivos": ["x.ts"]},
                    {"id": "C", "ola": "9", "depende": ["Z"], "archivos": ["y.ts"]},
                ],
            )
        ]
        # Sin entrada en progreso = repartible (ESTADOS_REPARTIBLES incluye None).
        prog = {"A": {"estado": "commit"}}
        elegidas = [t["id"] for t in R.elegir(colas, prog, [], "", tope=5)]
        self.assertIn("B", elegidas)
        self.assertNotIn("C", elegidas)


class ReclamarVaradasEnLaNube(unittest.TestCase):
    """(2026-09-22, MEDIDO) RM3 y RM4 en «reasignada · nube» con CERO runs en marcha.

    Detrás: RM5 esperaba a RM3 y RM4, RM6 a RM5, RM7 a RM5 y RM6, RM8 a RM7. Genesis
    enseñaba «LISTAS PARA TRABAJAR 5» y ningún agente podía coger ninguna. Prestar a la
    nube no puede ser perder: si allí no queda nadie, vuelve.
    """

    def _p(self, **estados):
        return {tid: dict(v) for tid, v in estados.items()}

    def test_sin_runs_vuelven_las_prestadas_a_la_nube(self):
        p = self._p(
            RM3={"estado": "reasignada", "medio": "nube"},
            RM4={"estado": "reasignada", "medio": "nube"},
        )
        self.assertEqual(R.reclamar_varadas(p, 0), ["RM3", "RM4"])

    def test_con_un_run_vivo_no_se_toca_nada(self):
        """Podría ser justo el que las está haciendo."""
        p = self._p(RM3={"estado": "reasignada", "medio": "nube"})
        self.assertEqual(R.reclamar_varadas(p, 1), [])

    def test_las_soltadas_a_la_nube_sin_medio_tambien_se_reclaman(self):
        """(2026-10-13) «movida a nube-gh (run …)» sin medio quedaba reasignada para siempre."""
        p = self._p(Q={"estado": "reasignada", "medio": None, "nota": "movida a nube-gh (run 9) desde Genesis"},
                    O={"estado": "reasignada", "nota": "movida a oracle (x) desde Genesis"})
        self.assertEqual(R.reclamar_varadas(p, 0), ["Q"])

    def test_una_reasignada_que_no_fue_a_la_nube_no_se_reclama(self):
        p = self._p(RM3={"estado": "reasignada", "medio": "mac"})
        self.assertEqual(R.reclamar_varadas(p, 0), [])

    def test_las_que_estan_en_otro_estado_no_se_tocan(self):
        p = self._p(
            A={"estado": "commit", "medio": "nube"},
            B={"estado": "en_curso", "medio": "nube"},
            C={"estado": "pendiente"},
        )
        self.assertEqual(R.reclamar_varadas(p, 0), [])

    def test_progreso_vacio_o_raro_no_rompe(self):
        self.assertEqual(R.reclamar_varadas(None, 0), [])
        self.assertEqual(R.reclamar_varadas({"X": "no soy un dict"}, 0), [])

    def test_con_run_vivo_de_otra_cola_la_varada_se_devuelve(self):
        """(2026-10-21, MEDIDO) 43 tareas (IMG1020A, PES1020A, TRD1020A…) llevaban horas en
        «reasignada · nube» con su run terminado en «failure» y cero commits: solo se
        reclamaba con CERO runs y el préstamo se volvía traspaso. Ahora basta saber que el
        run vivo lleva OTRA cola."""
        p = self._p(
            IMG1020A={"estado": "reasignada", "medio": "nube"},
            OHS={"estado": "reasignada", "medio": "nube"},
        )
        self.assertEqual(R.reclamar_varadas(p, 1, ids_vivos={"OHS"}), ["IMG1020A"])

    def test_con_el_run_vivo_de_su_cola_no_se_devuelve(self):
        """Podría estar haciéndola justo ahora."""
        p = self._p(IMG1020A={"estado": "reasignada", "medio": "nube"})
        self.assertEqual(R.reclamar_varadas(p, 1, ids_vivos={"IMG1020A"}), [])

    def test_una_cola_joven_sin_run_todavia_no_se_devuelve(self):
        """Su run quizá aún no arranca (la cola se escribe y el lanzamiento va detrás):
        menos de 30 min, no se reclama."""
        p = self._p(NUE={"estado": "reasignada", "medio": "nube"})
        self.assertEqual(
            R.reclamar_varadas(p, 0, ids_vivos=set(), colas_jovenes={"NUE"}), []
        )

    def test_ids_vivos_y_jovenes_juntas_y_el_resto_vuelve(self):
        p = self._p(
            EN_RUN={"estado": "reasignada", "medio": "nube"},
            JOVEN={"estado": "reasignada", "medio": "nube"},
            VIEJA={"estado": "reasignada", "medio": "nube"},
        )
        self.assertEqual(
            R.reclamar_varadas(p, 1, ids_vivos={"EN_RUN"}, colas_jovenes={"JOVEN"}),
            ["VIEJA"],
        )

    def test_sin_ids_vivos_el_comportamiento_es_el_de_siempre(self):
        p = self._p(IMG1020A={"estado": "reasignada", "medio": "nube"})
        self.assertEqual(R.reclamar_varadas(p, 0), ["IMG1020A"])
        self.assertEqual(R.reclamar_varadas(p, 2), [])
        self.assertEqual(R.reclamar_varadas(p, 0, colas_jovenes={"IMG1020A"}), ["IMG1020A"])

    def test_devolver_a_pendiente_conserva_la_historia(self):
        p = self._p(
            RM3={
                "estado": "reasignada",
                "medio": "nube",
                "ola": 363,
                "titulo": "mesh",
                "intentos": 2,
            }
        )
        n = R.devolver_a_pendiente(p, ["RM3"], "20260922")
        self.assertEqual(n["RM3"]["estado"], "pendiente")
        self.assertIsNone(n["RM3"]["medio"])
        self.assertEqual(n["RM3"]["ola"], 363)  # no se pierde de qué ola es
        self.assertEqual(n["RM3"]["intentos"], 2)  # ni cuántas veces se intentó
        self.assertIn("no quedaba ningún run", n["RM3"]["nota"])

    def test_devolver_no_modifica_el_original(self):
        p = self._p(RM3={"estado": "reasignada", "medio": "nube"})
        R.devolver_a_pendiente(p, ["RM3"], "20260922")
        self.assertEqual(p["RM3"]["estado"], "reasignada")


class Privadas(unittest.TestCase):
    """(2026-10-03) Lo privado de los sueños no sale de la Mac."""

    def test_una_tarea_privada_no_se_reparte(self):
        colas = [
            (
                "cola-ola2.json",
                [
                    {"id": "P1", "ola": "x", "privado": True},
                    {
                        "id": "P2",
                        "ola": "x",
                        "prompt": "🔒 PRIVADO · solo en la Mac: …",
                    },
                    {"id": "P3", "ola": "x", "prompt": "ORIGEN: sueño público"},
                ],
            )
        ]
        r = elegir(colas, {}, [], ola_actual="")
        self.assertEqual([t["id"] for t in r], ["P3"])


class FlujosDeGitHub(unittest.TestCase):
    """(SUP1124D, 24-11) Lo que toca .github/workflows/ no va a la nube de GitHub: su token no puede subir
    flujos y el trabajo se perdía al entregar (run 45374472553, LNX1118WB)."""

    def test_una_tarea_que_toca_un_flujo_se_queda_en_la_mac(self):
        lnx = {"id": "LNX1", "ola": "x",
               "archivos": ["native/src-tauri/tauri.conf.json", ".github/workflows/native-build.yml"]}
        self.assertEqual(R.motivo_fuera(lnx, {}, [], None), "flujos")
        otra = {"id": "OK1", "ola": "x", "archivos": ["src/a.ts"]}
        r = elegir([("cola-x.json", [lnx, otra])], {}, [], ola_actual="")
        self.assertEqual([t["id"] for t in r], ["OK1"])

    def test_solo_los_flujos_y_con_cualquier_forma_de_ruta(self):
        self.assertEqual(R.motivo_fuera({"id": "G1", "ola": "x", "archivos": ["./.github/workflows/ci.yml"]},
                                        {}, [], None), "flujos")
        for archivos in ([".github/ISSUE_TEMPLATE/x.md"], ["docs/.github/workflows/notas.md"], ["./src/a.ts"], []):
            self.assertIsNone(R.motivo_fuera({"id": "G2", "ola": "x", "archivos": archivos}, {}, [], None), archivos)

    def test_el_recuento_de_buscar_capacidad_tiene_frase(self):
        self.assertIn("flujos", dict(R.MOTIVOS_FUERA))


class PausaDeLaNube(unittest.TestCase):
    """(2026-10-04) Siete corridas con cero commits: con la pausa nadie reparte."""

    def test_sin_hasta_vale_hasta_que_se_quite(self):
        import repartir_nube as RNp

        self.assertEqual(RNp.motivo_pausa({"motivo": "cero commits"}), "cero commits")

    def test_con_hasta_pasado_ya_no_vale(self):
        import time
        import repartir_nube as RNp

        ayer = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(time.time() - 86400))
        self.assertIsNone(RNp.motivo_pausa({"motivo": "x", "hasta": ayer}))

    def test_con_hasta_futuro_vale(self):
        import time
        import repartir_nube as RNp

        manana = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(time.time() + 86400))
        self.assertEqual(RNp.motivo_pausa({"motivo": "x", "hasta": manana}), "x")

    def test_archivo_ausente_o_roto_no_pausa(self):
        import os, tempfile
        import repartir_nube as RNp

        d = tempfile.mkdtemp()
        self.assertIsNone(RNp.nube_pausada(os.path.join(d, "no-existe.json")))
        roto = os.path.join(d, "roto.json")
        with open(roto, "w") as f:
            f.write("{")
        self.assertIsNone(RNp.nube_pausada(roto))
        self.assertIsNone(RNp.motivo_pausa(["no", "es", "dict"]))


class EnviosPorCadena(unittest.TestCase):
    """(2026-10-06) Cada reparación (`Xb`, `Xc`…) no estrena tres envíos: cuenta la cadena entera."""

    def test_base_y_suma_de_la_cadena(self):
        self.assertEqual(R.base_cadena("RSC1006Qe"), "RSC1006Q")
        self.assertEqual(R.base_cadena("RSC1006Q"), "RSC1006Q")
        self.assertEqual(R.base_cadena("CU3br"), "CU3br")
        envios = {"RSC1006Q": 1, "RSC1006Qb": 1, "RSC1006Qc": 1, "RSC1006S": 2}
        self.assertEqual(R.envios_de_cadena("RSC1006Qd", envios), 3)
        self.assertEqual(R.envios_de_cadena("RSC1006Sb", envios), 2)
        self.assertEqual(R.envios_de_cadena("OTRA1", envios), 0)

    def test_un_sucesor_no_vuelve_a_la_nube_si_la_cadena_agoto_sus_envios(self):
        tarea = {"id": "RSC1006Qd", "ola": "Ola 1006R", "archivos": ["a.ts"], "prompt": "x"}
        # MAX_ENVIOS_NUBE = 5: la cadena agotada tiene 5 envíos en total
        envios = {"RSC1006Q": 2, "RSC1006Qb": 2, "RSC1006Qc": 1}
        self.assertEqual(R.motivo_fuera(tarea, {}, [], None, envios=envios), "agotada")
        self.assertIsNone(R.motivo_fuera(tarea, {}, [], None, envios={"RSC1006Q": 1}))


class EnvioDevueltoPorElMedio(unittest.TestCase):
    """(2026-10-14) Un fallo del medio no gasta envío: se devuelve, como mucho dos por cadena."""

    def test_se_devuelve_al_de_la_cadena_que_tiene_envios(self):
        envios = {"FLU1014A": 3, "OTRA": 1}
        self.assertEqual(R.envio_a_devolver("FLU1014A", envios, {}), "FLU1014A")
        self.assertEqual(R.envio_a_devolver("RSC1006Qb", {"RSC1006Q": 2}, {}), "RSC1006Q")

    def test_nada_si_no_fue_a_la_nube_o_ya_se_devolvieron_dos(self):
        self.assertIsNone(R.envio_a_devolver("NUEVA", {"OTRA": 1}, {}))
        self.assertIsNone(R.envio_a_devolver("FLU1014A", {"FLU1014A": 3}, {"FLU1014A": [1.0, 2.0]}))
        self.assertIsNone(R.envio_a_devolver("X", {"X": 1}, {"X": [1.0]}, tope=5))  # ya descontado

    def test_se_anota_y_cuenta_contra_el_tope(self):
        # (2026-10-17) Reloj FIJO. `leer_colas_nube` fecha cada cola por su NOMBRE y solo cuenta
        # las de los dos últimos días; con `datetime.now()` y nombres del 14, la prueba caducó
        # sola el 16 a las 09:00 (puerta de publicación en rojo en 8bf2e354, sin cambio de código).
        d = tempfile.mkdtemp()
        try:
            ruta = os.path.join(d, "reap.json")
            colas = os.path.join(d, "colas")
            os.makedirs(colas)
            ahora = datetime.datetime(2026, 10, 14, 10, 0).timestamp()
            for i in range(3):
                with open(os.path.join(colas, "cola-nube-20261014-09%02d.json" % i), "w") as f:
                    json.dump({"tareas": [{"id": "FLU1014A"}]}, f)
            self.assertEqual(R.envios_vigentes(colas, ahora, ruta).get("FLU1014A"), 3)
            self.assertEqual(R.devolver_envio_por_el_medio("FLU1014A", colas, ahora, ruta), "FLU1014A")
            self.assertEqual(R.envios_vigentes(colas, ahora, ruta).get("FLU1014A"), 2)
            R.devolver_envio_por_el_medio("FLU1014A", colas, ahora, ruta)
            self.assertIsNone(R.devolver_envio_por_el_medio("FLU1014A", colas, ahora, ruta))
            self.assertEqual(R.envios_vigentes(colas, ahora, ruta).get("FLU1014A"), 1)
            # Pasados los dos días, esas colas ya no cuentan ni hay envío que devolver.
            tres_dias_despues = ahora + 3 * 86400
            self.assertIsNone(R.envios_vigentes(colas, tres_dias_despues, ruta).get("FLU1014A"))
            self.assertIsNone(R.devolver_envio_por_el_medio("FLU1014A", colas, tres_dias_despues, ruta))
        finally:
            shutil.rmtree(d)


class CadenasCedibles(unittest.TestCase):
    """(2026-10-11, CAPC1011A) Ceder una cadena ENTERA (tarea esperada + dependientes de la
    tanda) en vez de dejarla en la Mac solo porque alguien está esperando su cabeza."""

    def _tareas(self, *specs):
        return {tid: {"id": tid, **kw} for tid, kw in specs}

    def test_cadena_A_B_se_cede_entera(self):
        tareas = self._tareas(
            ("A", {}), ("B", {"depende": ["A"]}),
            *(("M%d" % i, {}) for i in range(4)),
        )
        listas = ["M%d" % i for i in range(4)] + ["A", "B"]
        r = R.cadenas_cedibles(tareas, listas, 2, {"A": ["B"]})
        self.assertEqual(r, [["A", "B"]])

    def test_dependiente_fuera_que_se_queda_en_la_mac_no_se_cede(self):
        # (c) B, de OTRA cola, espera a A: ceder la cadena dejaría B varada en la Mac.
        tareas = self._tareas(
            ("A", {}), ("C", {"depende": ["A"]}),
            *(("M%d" % i, {}) for i in range(4)),
        )
        listas = ["M%d" % i for i in range(4)] + ["A", "C"]
        r = R.cadenas_cedibles(tareas, listas, 2, {"A": ["B", "C"]})
        self.assertEqual(r, [])

    def test_cadena_mas_larga_que_max_cadena_no_se_cede(self):
        # (2026-10-13) max_cadena = 6 (lo que cabe en un job): A + 6 dependientes = 7.
        hijos = ["B", "C", "D", "E", "F", "G"]
        tareas = self._tareas(
            ("A", {}), *((h, {"depende": ["A"]}) for h in hijos), *(("M%d" % i, {}) for i in range(4)),
        )
        listas = ["M%d" % i for i in range(4)] + ["A", "B"]
        esp = {"A": hijos}
        self.assertEqual(R.cadenas_cedibles(tareas, listas, 2, esp), [])
        # Con 5 dependientes (6 en total) sí cabe en un job y se cede entera.
        tareas.pop("G")
        r = R.cadenas_cedibles(tareas, listas, 2, {"A": hijos[:5]})
        self.assertEqual([sorted(c) for c in r], [sorted(["A"] + hijos[:5])])

    def test_la_reserva_de_la_mac_nunca_se_cede(self):
        tareas = self._tareas(("A", {}), ("B", {"depende": ["A"]}))
        listas = ["A", "B"]
        # tope 2 x 2 rondas = reserva 4: A y B entran en la reserva.
        self.assertEqual(R.cadenas_cedibles(tareas, listas, 2, {"A": ["B"]}), [])

    def test_mi_que_depende_de_algo_abierto_fuera_no_se_cede(self):
        tareas = self._tareas(
            ("A", {}), ("B", {"depende": ["A", "Z"]}), ("Z", {}),
            *(("M%d" % i, {}) for i in range(4)),
        )
        listas = ["M%d" % i for i in range(4)] + ["A", "B", "Z"]
        self.assertEqual(R.cadenas_cedibles(tareas, listas, 2, {"A": ["B"]}), [])

    def test_cadena_descartada_no_envenena_a_sus_miembros(self):
        # La cadena de X se descarta (X depende de Z abierto fuera), pero A→B, cabeza
        # posterior, sí es cedible: marcar vistas antes de los filtros la impedía.
        tareas = self._tareas(
            ("X", {"depende": ["Z"]}), ("A", {}), ("B", {"depende": ["A"]}), ("Z", {}),
            *(("M%d" % i, {}) for i in range(4)),
        )
        listas = ["M%d" % i for i in range(4)] + ["X", "A", "B", "Z"]
        esp = {"X": ["A"], "A": ["B"]}
        self.assertEqual(R.cadenas_cedibles(tareas, listas, 2, esp), [["A", "B"]])

    def test_miembro_ausente_de_tareas_no_revienta(self):
        # (Revisión CAPC1011A) listas desincronizadas: una CABEZA que no está en tareas
        # ya no tira el reparto con un KeyError.
        tareas = self._tareas(("A", {}), ("B", {"depende": ["A"]}),
                              *(("M%d" % i, {}) for i in range(4)))
        listas = ["M%d" % i for i in range(4)] + ["FANTASMA", "A", "B"]
        r = R.cadenas_cedibles(tareas, listas, 2, {"FANTASMA": ["A"], "A": ["B"]})
        self.assertEqual(r, [["FANTASMA", "A", "B"]])


class MismoLoteEnElegir(unittest.TestCase):
    """(2026-10-11, CAPC1011A) `elegir` deja pasar una tarea que depende de otra de su MISMO
    lote de reparto, conservando `depende` para que el orquestador respete el orden."""

    COLAS_L = [
        ("cola-1.json", [
            {"id": "A", "ola": "9", "archivos": ["a.ts"]},
            {"id": "B", "ola": "9", "archivos": ["b.ts"], "depende": ["A"]},
        ])
    ]

    def test_con_mismo_lote_b_pasa_y_conserva_depende(self):
        r = elegir(self.COLAS_L, {}, [], "999", mismo_lote=("A", "B"))
        self.assertEqual({t["id"] for t in r}, {"A", "B"})
        b = next(t for t in r if t["id"] == "B")
        self.assertEqual(b["depende"], ["A"])
        self.assertNotIn("dependencias_ya_en_main", b)

    def test_sin_mismo_lote_el_comportamiento_no_cambia(self):
        r = elegir(self.COLAS_L, {}, [], "999")
        self.assertEqual([t["id"] for t in r], ["A"])


class CederCadenasALaNube(unittest.TestCase):
    """(2026-10-12, CAPC1011Bc) `cedibles_y_lote` + `elegir(mismo_lote=...)`: la cadena
    viaja ENTERA a la misma cola y conserva su `depende` interno."""

    def _colas(self, tareas):
        return [("cola-auto-1011.json", tareas)]

    def _tanda(self, extra=()):
        # Reserva de la Mac: tope 1 x 2 rondas = las 2 primeras («M1», «M2»).
        base = [{"id": "M1", "ola": "1010"}, {"id": "M2", "ola": "1010"}]
        return base + list(extra)

    def test_cadena_a_b_c_se_cede_entera_y_conserva_depende(self):
        tareas = self._tanda([
            {"id": "A", "ola": "1010", "archivos": ["a.ts"]},
            {"id": "B", "ola": "1010", "archivos": ["b.ts"], "depende": ["A"]},
            {"id": "C", "ola": "1010", "archivos": ["c.ts"], "depende": ["B"]},
        ])
        colas = self._colas(tareas)
        tanda = [t["id"] for t in tareas]
        # tope=2: reserva dinámica = 1 ronda × 2 = 2 listas (M1, M2)
        estado_mac = {"listas": tanda, "tope": 2}
        cedibles, lote = R.cedibles_y_lote(tanda, estado_mac, colas, {}, ajenas=())
        self.assertTrue({"A", "B", "C"} <= set(cedibles))
        self.assertEqual(lote, {"A", "B", "C"})
        elegidas = R.elegir(R.sin_lo_de_la_mac(colas, tanda, cedibles), {}, [], "999",
                            tope=20, mismo_lote=lote)
        por_id = {t["id"]: t for t in elegidas}
        self.assertIn("A", por_id)
        self.assertEqual(por_id["B"]["depende"], ["A"])  # el orden lo respeta la nube
        self.assertEqual(por_id["C"]["depende"], ["B"])
        self.assertNotIn("dependencias_ya_en_main", por_id["B"])
        # La orden «soltar» de la Mac llega a TODOS los miembros de la cadena.
        ordenes = R.ordenes_soltar([p["id"] for p in elegidas],
                                   [("cola-auto-1011.json", tanda)], "nube")
        self.assertEqual(sorted(ordenes["cola-auto-1011.json"]), ["A", "B", "C"])

    def test_cadena_con_dependiente_que_se_queda_no_se_cede(self):
        # «EXT» se queda en la Mac (está en la reserva) y espera a B: ceder la cadena
        # la dejaría varada esperando a la nube.
        extra = [
            {"id": "A", "ola": "1010", "archivos": ["a.ts"]},
            {"id": "B", "ola": "1010", "archivos": ["b.ts"], "depende": ["A"]},
            {"id": "EXT", "ola": "1010", "archivos": ["x.ts"], "depende": ["B"]},
        ]
        base = [{"id": "M1", "ola": "1010"}, {"id": "M2", "ola": "1010"}, extra[2]]  # EXT en la reserva (tope 3 x 2 = 6)
        tareas = base + extra[:2]
        colas = self._colas(tareas)
        tanda = [t["id"] for t in tareas]
        # tope=3 para que la reserva dinámica sea 2 rondas (6 listas) y EXT quede en reserva
        cedibles, lote = R.cedibles_y_lote(tanda, {"listas": tanda, "tope": 3}, colas, {})
        self.assertEqual(lote, set())
        self.assertNotIn("A", cedibles)
        self.assertNotIn("B", cedibles)

    def test_sin_cadenas_el_resultado_es_el_de_antes(self):
        tareas = self._tanda([
            {"id": "S1", "ola": "1010"},
            {"id": "S2", "ola": "1010"},
        ])
        colas = self._colas(tareas)
        tanda = [t["id"] for t in tareas]
        estado_mac = {"listas": tanda, "tope": 1}
        cedibles, lote = R.cedibles_y_lote(tanda, estado_mac, colas, {})
        self.assertEqual(lote, set())
        # Usar las mismas rondas dinámicas que cedibles_y_lote
        rondas = R.calcular_rondas_reserva(estado_mac.get("tope"), estado_mac.get("disco_gb"))
        self.assertEqual(cedibles, R.cedibles_de_la_tanda(tanda, tanda, 1,
                                                          R.esperadas_por_otras(colas, {}),
                                                          rondas=rondas))

    def test_listas_desincronizadas_no_rompen(self):
        # (Revisión CAPC1011A) Una lista que nombra un id ausente de las colas ya no
        # revienta el reparto con un KeyError.
        tareas = self._tanda([{"id": "A", "ola": "1010"},
                              {"id": "B", "ola": "1010", "depende": ["A"]}])
        tanda = [t["id"] for t in tareas] + ["FANTASMA"]
        cedibles, lote = R.cedibles_y_lote(tanda, {"listas": tanda, "tope": 1},
                                           self._colas(tareas), {})
        self.assertIn("A", cedibles)
        self.assertEqual(lote, {"A", "B"})

    def test_lo_ajeno_no_se_cede(self):
        tareas = self._tanda([{"id": "A", "ola": "1010"},
                              {"id": "B", "ola": "1010", "depende": ["A"]}])
        colas = self._colas(tareas)
        tanda = [t["id"] for t in tareas]
        cedibles, lote = R.cedibles_y_lote(tanda, {"listas": tanda, "tope": 1}, colas, {},
                                           ajenas={"B"})
        self.assertNotIn("B", cedibles)
        self.assertNotIn("B", lote)


class CadenasPartidasYClasificar(unittest.TestCase):
    """(2026-10-13, Alex: «de nuevo solo 2 agentes en MetaGenesis») El botón decidía con las
    sueltas y el reparto con las cadenas: 0 elegibles y 0 jobs con 38 listas en la Mac."""

    def _colas(self):
        return [("cola-auto.json", [
            {"id": "A", "ola": "1010"}, {"id": "B", "ola": "1010", "depende": ["A"]},
            {"id": "X", "ola": "1010"}, {"id": "Y", "ola": "1010", "depende": ["X"]},
            {"id": "Z", "ola": "1010", "depende": ["Y"]},
            {"id": "S", "ola": "1010"},
        ])]

    def test_solo_se_quita_la_cadena_que_no_va_entera(self):
        colas = self._colas()
        lote = {"A", "B", "X", "Y", "Z"}
        elegidas = [{"id": i} for i in ("S", "A", "B", "X", "Y")]  # a X-Y-Z le falta Z
        r = [t["id"] for t in R.sin_cadenas_partidas(elegidas, lote, colas)]
        self.assertEqual(r, ["S", "A", "B"])

    def test_sin_lote_no_cambia_nada(self):
        elegidas = [{"id": "S"}, {"id": "A"}]
        self.assertEqual(R.sin_cadenas_partidas(elegidas, set(), self._colas()), elegidas)

    def test_clasificar_cuenta_las_cadenas_como_elegibles(self):
        colas = self._colas()
        progreso = {i: {"estado": "pendiente"} for i in "ABXYZS"}
        sin = R.clasificar(colas, progreso, "", "999")
        self.assertEqual(sorted(sin["elegibles"]), ["A", "S", "X"])
        self.assertEqual(sorted(sin.get("espera") or []), ["B", "Y", "Z"])
        con = R.clasificar(colas, progreso, "", "999", mismo_lote={"A", "B", "X", "Y", "Z"})
        self.assertEqual(sorted(con["elegibles"]), ["A", "B", "S", "X", "Y", "Z"])
        self.assertNotIn("espera", con)

    def test_la_esperada_solo_desde_fuera_de_la_tanda_se_cede(self):
        # (2026-10-13, medido) 43 de 57 listas las esperaba una tarea de OTRA cola que aún no
        # estaba lista: no se quedan varadas, entran solas cuando la dependencia llega a main.
        colas = [("cola-auto.json", [{"id": "M1", "ola": "1010"}, {"id": "M2", "ola": "1010"},
                                     {"id": "A", "ola": "1010"}, {"id": "B", "ola": "1010"}]),
                 ("cola-otra.json", [{"id": "X", "ola": "1012", "depende": ["A"]}])]
        tanda = ["M1", "M2", "A", "B"]
        # tope=2: reserva dinámica = 1 ronda × 2 = 2 listas (M1, M2)
        cedibles, lote = R.cedibles_y_lote(tanda, {"listas": tanda, "tope": 2}, colas, {})
        self.assertEqual(sorted(cedibles), ["A", "B"])
        self.assertEqual(lote, set())
        # Si quien espera a A está EN la tanda, A solo viaja con su cadena.
        colas[0][1].append({"id": "Y", "ola": "1010", "depende": ["A"]})
        cedibles, lote = R.cedibles_y_lote(tanda + ["Y"], {"listas": tanda + ["Y"], "tope": 2}, colas, {})
        self.assertEqual(lote, {"A", "Y"})

    def test_esperadas_solo_de(self):
        colas = [("c", [{"id": "X", "depende": ["A"]}, {"id": "Y", "depende": ["B"]}])]
        self.assertEqual(R.esperadas_por_otras(colas, {}), {"A", "B"})
        self.assertEqual(R.esperadas_por_otras(colas, {}, solo_de={"Y"}), {"B"})
        self.assertEqual(R.esperadas_por_otras(colas, {}, solo_de=set()), set())


class UnSoloRepartidor(unittest.TestCase):
    """(2026-10-13) La nube y el A1 se llevaron IMG1011F/G/I a la vez."""

    def test_el_segundo_espera_y_se_rinde_con_motivo(self):
        import tempfile
        import os as _os

        with tempfile.TemporaryDirectory() as d:
            ruta = _os.path.join(d, "reparto.lock")
            with R.CerrojoReparto(ruta=ruta):
                with self.assertRaises(TimeoutError):
                    with R.CerrojoReparto(espera_s=0, ruta=ruta):
                        pass
            with R.CerrojoReparto(espera_s=0, ruta=ruta):
                pass  # libre otra vez
