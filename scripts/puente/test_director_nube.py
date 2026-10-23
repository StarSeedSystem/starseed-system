# -*- coding: utf-8 -*-
"""La política del director de la nube, sin tocar gh ni la red.

El 21 de septiembre estos tests defendían lo contrario de lo que hacen hoy: daban por
bueno que «un run en marcha manda sobre el atraso». Esa regla era una creencia y se midió
falsa (dos runs de colas distintas corrieron en paralelo y entregaron 4 ramas `nube/*`),
así que el tope pasó a ser el único que mide algo: agentes simultáneos.
"""
import importlib.util
import json
import os
import shutil
import tempfile
import time
import unittest

_ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), "director-nube.py")
_spec = importlib.util.spec_from_file_location("director_nube", _ruta)
D = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(D)


class PoliticaDeLanzamiento(unittest.TestCase):
    def test_lanza_con_atraso_y_la_nube_libre(self):
        lanzar, motivo = D.decidir_lanzamiento(atraso=4, runs_en_marcha=0, lanzados_hoy=0)
        self.assertTrue(lanzar)
        self.assertIn("4", motivo)

    def test_el_primer_job_se_lanza_aunque_el_atraso_sea_una_sola_tarea(self):
        # Con la nube apagada, una tarea ya justifica encenderla.
        lanzar, _ = D.decidir_lanzamiento(atraso=1, runs_en_marcha=0, lanzados_hoy=0,
                                          agentes_en_marcha=0, trabajadores=4)
        self.assertTrue(lanzar)

    def test_no_lanza_sin_atraso(self):
        # El caso normal: la Mac se basta. Un agente sin tarea no es capacidad, es ruido.
        lanzar, motivo = D.decidir_lanzamiento(atraso=0, runs_en_marcha=0, lanzados_hoy=0)
        self.assertFalse(lanzar)
        self.assertIn("atraso", motivo)

    def test_respeta_el_tope_del_dia(self):
        lanzar, motivo = D.decidir_lanzamiento(atraso=5, runs_en_marcha=0, lanzados_hoy=30, tope_dia=30)
        self.assertFalse(lanzar)
        self.assertIn("tope", motivo)


class JobsEnParalelo(unittest.TestCase):
    """Lo que Alex no veía subir: el segundo y el tercer job."""

    def test_lanza_un_segundo_job_si_el_atraso_lo_llena(self):
        lanzar, motivo = D.decidir_lanzamiento(atraso=8, runs_en_marcha=1, lanzados_hoy=2,
                                               agentes_en_marcha=4, trabajadores=4,
                                               tope_agentes=12)
        self.assertTrue(lanzar)
        self.assertIn("4/12", motivo)

    def test_lanza_un_tercer_job_hasta_llenar_el_tope(self):
        lanzar, _ = D.decidir_lanzamiento(atraso=9, runs_en_marcha=2, lanzados_hoy=3,
                                          agentes_en_marcha=8, trabajadores=4,
                                          tope_agentes=12)
        self.assertTrue(lanzar)

    def test_no_lanza_un_job_a_medias(self):
        # 2 tareas de atraso no llenan un job de 4: esperar es más barato que malgastar.
        lanzar, motivo = D.decidir_lanzamiento(atraso=2, runs_en_marcha=1, lanzados_hoy=1,
                                               agentes_en_marcha=4, trabajadores=4)
        self.assertFalse(lanzar)
        self.assertIn("no llenan", motivo)

    def test_el_tope_de_agentes_manda_sobre_el_atraso(self):
        lanzar, motivo = D.decidir_lanzamiento(atraso=100, runs_en_marcha=3, lanzados_hoy=0,
                                               agentes_en_marcha=12, trabajadores=4,
                                               tope_agentes=12)
        self.assertFalse(lanzar)
        self.assertIn("tope 12", motivo)

    def test_no_entra_un_job_que_no_cabe_entero(self):
        # Quedan 2 huecos y el job pide 4: no se lanza recortado, se espera.
        lanzar, motivo = D.decidir_lanzamiento(atraso=50, runs_en_marcha=2, lanzados_hoy=0,
                                               agentes_en_marcha=10, trabajadores=4,
                                               tope_agentes=12)
        self.assertFalse(lanzar)
        self.assertIn("no caben", motivo)


class SinClavesNoSeInsiste(unittest.TestCase):
    def test_sin_claves_no_se_lanza_aunque_haya_atraso(self):
        lanzar, motivo = D.decidir_lanzamiento(atraso=20, runs_en_marcha=0, lanzados_hoy=0,
                                               hay_claves=False)
        self.assertFalse(lanzar)
        self.assertIn("claves", motivo)

    def test_las_claves_se_comprueban_antes_que_nada(self):
        # Sin claves da igual todo lo demás: el job moriría igual en el paso de claves.
        lanzar, _ = D.decidir_lanzamiento(atraso=0, runs_en_marcha=5, lanzados_hoy=99,
                                          hay_claves=False)
        self.assertFalse(lanzar)


class TopesPorDefecto(unittest.TestCase):
    def test_el_tope_de_agentes_deja_sitio_a_mas_de_un_job(self):
        # Si alguien baja TOPE_AGENTES por debajo de TRABAJADORES, la nube no arrancaría
        # nunca y el log diría «no caben» para siempre. Esto lo detecta.
        self.assertGreaterEqual(D.TOPE_AGENTES, 2 * int(D.TRABAJADORES))


class DevolverLoQueYaNadieHace(unittest.TestCase):
    """(2026-10-21, MEDIDO) 43 tareas (IMG1020A, PES1020A, TRD1020A…) llevaban horas en
    «reasignada · nube» con su run TERMINADO en «failure» y cero commits: solo se
    reclamaba con CERO runs y el préstamo se volvía traspaso. Ahora cada run vivo dice
    qué cola lleva (`ids_vivos`) y las colas de menos de 30 min (`colas_jovenes`) no se
    tocan aunque su run aún no arranque."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp, True)
        raiz_antes, D.RAIZ = D.RAIZ, self.tmp
        self.addCleanup(setattr, D, "RAIZ", raiz_antes)
        D._ULTIMO_RESUMEN[:] = [{"generado": "t", "runs": []}]
        self.addCleanup(D._ULTIMO_RESUMEN.clear)
        veredictos_antes = D.veredictos_del_ultimo_run
        D.veredictos_del_ultimo_run = lambda ids, timeout=90: {}
        self.addCleanup(setattr, D, "veredictos_del_ultimo_run", veredictos_antes)

    def _progreso(self, **estados):
        olas = os.path.join(self.tmp, "starseed_memory_root", "olas")
        os.makedirs(olas, exist_ok=True)
        with open(os.path.join(olas, "progreso.json"), "w", encoding="utf-8") as f:
            json.dump({"tareas": {k: dict(v) for k, v in estados.items()}}, f)

    def _leer_progreso(self):
        ruta = os.path.join(self.tmp, "starseed_memory_root", "olas", "progreso.json")
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)["tareas"]

    def _cola(self, nombre, ids, edad_s=900):
        carpeta = os.path.join(self.tmp, "enjambre", "colas")
        os.makedirs(carpeta, exist_ok=True)
        ruta = os.path.join(carpeta, nombre)
        with open(ruta, "w", encoding="utf-8") as f:
            json.dump({"tareas": [{"id": i} for i in ids]}, f)
        viejo = time.time() - edad_s
        os.utime(ruta, (viejo, viejo))

    def _runs(self, *runs):
        D._ULTIMO_RESUMEN[:] = [{"generado": "t", "runs": list(runs)}]

    def _cola_local(self, nombre, ids):
        """Una cola que corre AHORA en esta máquina, en `olas/` (donde vive su control)."""
        olas = os.path.join(self.tmp, "starseed_memory_root", "olas")
        os.makedirs(olas, exist_ok=True)
        with open(os.path.join(olas, nombre), "w", encoding="utf-8") as f:
            json.dump({"tareas": [{"id": i} for i in ids]}, f)
        return os.path.join(olas, "control-" + nombre)

    def _leer_control(self, ruta):
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)

    def _colas_vivas(self, nombres):
        antes = D.colas_vivas_locales
        D.colas_vivas_locales = lambda: list(nombres)
        self.addCleanup(setattr, D, "colas_vivas_locales", antes)

    def test_con_un_run_vivo_de_otra_cola_la_varada_vuelve(self):
        self._progreso(IMG1020A={"estado": "reasignada", "medio": "nube"})
        self._cola("cola-nube-20261021-0900.json", ["OTRA"])
        self._runs({"run": 1, "cola": os.path.join("enjambre", "colas",
                                                   "cola-nube-20261021-0900.json")})
        self.assertEqual(D.reclamar_varadas_de_la_nube(1), ["IMG1020A"])
        self.assertEqual(self._leer_progreso()["IMG1020A"]["estado"], "pendiente")

    def test_con_el_run_vivo_de_su_cola_no_se_devuelve(self):
        self._progreso(IMG1020A={"estado": "reasignada", "medio": "nube"})
        self._cola("cola-nube-20261021-0900.json", ["IMG1020A"])
        self._runs({"run": 1, "cola": os.path.join("enjambre", "colas",
                                                   "cola-nube-20261021-0900.json")})
        self.assertEqual(D.reclamar_varadas_de_la_nube(1), [])

    def test_run_vivo_con_su_cola_tirada_no_devuelve_nada(self):
        # No se puede saber qué lleva el run vivo: mejor esperar un ciclo que devolver
        # algo que quizá está escribiendo alguien.
        self._progreso(IMG1020A={"estado": "reasignada", "medio": "nube"})
        self._cola("cola-nube-20261021-0900.json", ["OTRA"])
        self._runs({"run": 1, "cola": None})
        self.assertEqual(D.reclamar_varadas_de_la_nube(1), [])

    def test_una_cola_joven_sin_run_todavia_aguanta(self):
        self._progreso(NUE={"estado": "reasignada", "medio": "nube"})
        self._cola("cola-nube-20261021-1015.json", ["NUE"], edad_s=60)
        self._runs()  # todavía sin run: el lanzamiento va detrás de la cola
        self.assertEqual(D.reclamar_varadas_de_la_nube(0), [])

    def test_una_cola_vieja_sin_run_se_devuelve(self):
        self._progreso(VIEJA={"estado": "reasignada", "medio": "nube"})
        self._cola("cola-nube-20261021-0000.json", ["VIEJA"], edad_s=2 * 3600)
        self._runs()
        self.assertEqual(D.reclamar_varadas_de_la_nube(0), ["VIEJA"])

    def test_runs_vivos_que_no_se_pueden_enumerar_no_devuelve_nada(self):
        self._progreso(IMG1020A={"estado": "reasignada", "medio": "nube"})
        D._ULTIMO_RESUMEN.clear()  # la medición falló: no sé qué llevan los runs vivos
        self.assertEqual(D.reclamar_varadas_de_la_nube(1), [])

    def test_medicion_fallida_con_cero_runs_tampoco_devuelve(self):
        # Antes, una medición fallida daba «0 runs» y se reclamaba TODO lo prestado.
        self._progreso(IMG1020A={"estado": "reasignada", "medio": "nube"})
        D._ULTIMO_RESUMEN.clear()
        self.assertEqual(D.reclamar_varadas_de_la_nube(0), [])
        self.assertEqual(self._leer_progreso()["IMG1020A"]["estado"], "reasignada")

    def test_una_varada_de_la_tanda_viva_pide_reabrir(self):
        # (2026-10-21) El orquestador la tiene como SOLTADA en memoria y su copia manda:
        # devolverla a `pendiente` en disco no basta, hace falta la orden `reabrir`.
        self._progreso(IMG1020A={"estado": "reasignada", "medio": "nube"})
        control = self._cola_local("cola-auto-1020-121122.json", ["IMG1020A"])
        self._colas_vivas(["cola-auto-1020-121122.json"])
        self._runs()
        self.assertEqual(D.reclamar_varadas_de_la_nube(0), ["IMG1020A"])
        orden = self._leer_control(control)["IMG1020A"]
        self.assertEqual("reabrir", orden["accion"])
        self.assertEqual("director-nube", orden["quien"])
        self.assertIn("run terminó", orden["motivo"])

    def test_reabrir_se_fusiona_con_lo_que_ya_habia_en_el_control(self):
        self._progreso(IMG1020A={"estado": "reasignada", "medio": "nube"})
        control = self._cola_local("cola-auto-1020-121122.json", ["IMG1020A"])
        with open(control, "w", encoding="utf-8") as f:
            json.dump({"OTRA": {"accion": "aprobar", "quien": "alex"}}, f)
        self._colas_vivas(["cola-auto-1020-121122.json"])
        self._runs()
        D.reclamar_varadas_de_la_nube(0)
        ordenes = self._leer_control(control)
        self.assertEqual("aprobar", ordenes["OTRA"]["accion"])
        self.assertEqual("reabrir", ordenes["IMG1020A"]["accion"])

    def test_una_cola_que_no_corre_no_recibe_orden(self):
        self._progreso(IMG1020A={"estado": "reasignada", "medio": "nube"})
        self._cola_local("cola-auto-1020-121122.json", ["IMG1020A"])
        self._colas_vivas(["cola-otra-1020.json"])
        self._runs()
        D.reclamar_varadas_de_la_nube(0)
        self.assertFalse(os.path.exists(
            os.path.join(self.tmp, "starseed_memory_root", "olas",
                         "control-cola-auto-1020-121122.json")))

    def test_medir_nube_fallida_borra_la_foto_vieja(self):
        import agentes_nube as AN
        antes = AN._runs_de_github
        def falla():
            raise RuntimeError("sin gh")
        AN._runs_de_github = falla
        self.addCleanup(setattr, AN, "_runs_de_github", antes)
        D._ULTIMO_RESUMEN[:] = [{"generado": "viejo", "runs": [{"run": 9, "cola": None}]}]
        self.assertEqual(D.medir_nube(), (0, 0))
        self.assertEqual(D._ULTIMO_RESUMEN, [])


if __name__ == "__main__":
    unittest.main()


class EnrutarAlContenedorConMasSitio(unittest.TestCase):
    """Alex (2026-09-22): «que los directores usen esa información para enrutar procesos a
    agentes en todos los contenedores y siempre se aproveche la mayor cantidad disponible»."""

    def test_elige_el_desplegable_que_viene_primero(self):
        # El inventario ya llega ordenado por estado y sitio libre: aquí no se reordena.
        conts = [
            {"id": "nube-gh", "servicio": "GitHub Actions", "desplegable": True,
             "agentes_libres": 8, "agentes_por_job": 4},
            {"id": "colab", "servicio": "Colab", "desplegable": False, "agentes_libres": 16,
             "agentes_por_job": 4},
        ]
        self.assertEqual(D.elegir_contenedor(conts)["id"], "nube-gh")

    def test_sin_sitio_libre_no_se_elige_aunque_sea_desplegable(self):
        conts = [{"id": "nube-gh", "desplegable": True, "agentes_libres": 0, "agentes_por_job": 4}]
        self.assertIsNone(D.elegir_contenedor(conts))

    def test_sin_contenedores_devuelve_nada(self):
        self.assertIsNone(D.elegir_contenedor([]))
        self.assertIsNone(D.elegir_contenedor(None))

    def test_una_fila_corrupta_no_rompe_el_enrutado(self):
        conts = ["esto no es un dict",
                 {"id": "nube-gh", "desplegable": True, "agentes_libres": 4, "agentes_por_job": 4}]
        self.assertEqual(D.elegir_contenedor(conts)["id"], "nube-gh")

    def test_el_tope_medido_manda_sobre_la_constante(self):
        # Con 8 de tope medido y 8 en marcha no cabe nadie, aunque TOPE_AGENTES sea 12.
        lanzar, motivo = D.decidir_lanzamiento(atraso=50, runs_en_marcha=2, lanzados_hoy=0,
                                               agentes_en_marcha=8, trabajadores=4,
                                               tope_agentes=8)
        self.assertFalse(lanzar)
        self.assertIn("tope 8", motivo)
