# -*- coding: utf-8 -*-
"""Pruebas de reparar_medidor.py (2026-10-23): sin procesos, red ni disco reales."""
import json
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import reparar_medidor as R  # noqa: E402


def v(proceso, estado, detalle="x"):
    return {"proceso": proceso, "estado": estado, "detalle": detalle}


class Plan(unittest.TestCase):
    def test_vivo_y_desconocido_no_se_reparan(self):
        self.assertEqual(R.plan_reparacion("agentes", [v("Agente opencode", "vivo"),
                                                       v("Agentes medidos", "desconocido")]), [])

    def test_agentes_colgados_curan_el_enjambre_sin_repetir(self):
        plan = R.plan_reparacion("agentes", [v("Agente opencode", "muerto"), v("Agentes medidos", "colgado")])
        self.assertEqual([p["accion"] for p in plan], ["enjambre", "carril_nube", "reconciliar", "nube_gh"])
        self.assertTrue(all(p["titulo"] and p["por_que"] for p in plan))

    def test_cada_medidor_su_reparacion(self):
        casos = {
            ("listas", "Orquestador", "muerto"): ["vigilante"],
            ("disco", "Espacio en disco", "colgado"): ["disco"],
            ("memoria", "Memoria RAM libre", "colgado"): ["memoria"],
            ("proveedores", "Proveedores activos", "muerto"): ["proveedores"],
            ("tokens", "Servicio de tokens", "colgado"): ["tokens"],
            ("integradas", "Integradas en main", "colgado"): ["reconciliar"],
            ("en-curso", "Medidor", "muerto"): ["genesis"],
        }
        for (clave, proceso, estado), esperado in casos.items():
            with self.subTest(clave=clave):
                self.assertEqual([p["accion"] for p in R.plan_reparacion(clave, [v(proceso, estado)])], esperado)

    def test_contenedores_se_vuelven_a_medir(self):
        plan = R.plan_reparacion("contenedores", [v("Algo nuevo", "colgado")])
        self.assertEqual([p["accion"] for p in plan], ["contenedores"])

    def test_lo_que_no_tiene_regla_se_dice(self):
        self.assertEqual(R.sin_reparacion("agentes", [v("Algo nuevo", "muerto", "roto")]), ["Algo nuevo: roto"])
        self.assertEqual(R.sin_reparacion("agentes", [v("Orquestador", "muerto")]), [])


class Resultado(unittest.TestCase):
    def test_resultados(self):
        malo, bueno = [v("A", "muerto")], [v("A", "vivo")]
        self.assertEqual(R.resultado(bueno, bueno, False), "nada")
        self.assertEqual(R.resultado(malo, malo, False), "sin_reparacion")
        self.assertEqual(R.resultado(malo, bueno, True), "reparado")
        self.assertEqual(R.resultado(malo + [v("B", "colgado")], malo, True), "mejorado")
        self.assertEqual(R.resultado(malo, malo, True), "sigue")

    def test_tiempos_minimos_de_los_directores(self):
        plan = [{"accion": "disco"}]
        self.assertFalse(R.toca_auto("disco", [], {}, 10_000))
        self.assertTrue(R.toca_auto("disco", plan, {}, 10_000))
        self.assertFalse(R.toca_auto("disco", plan, {"disco": {"t": 10_000 - 600}}, 10_000))
        self.assertTrue(R.toca_auto("disco", plan, {"disco": {"t": 10_000 - 3700}}, 10_000))
        self.assertTrue(R.toca_auto("disco", plan, {"disco": {"t": 10_000 - 1}}, 10_000, forzar=True))
        self.assertTrue(R.toca_auto("agentes", plan, {"agentes": {"t": 10_000 - 1300}}, 10_000))


class MarcasFalsas(unittest.TestCase):
    def test_quita_solo_las_que_puso_la_transcripcion(self):
        salud = {"opencode": {"sin_cupo_hasta": "2099-01-01 00:00:00", "motivo": "$ opencode run --model x · …"},
                 "nim": {"sin_cupo_hasta": "2099-01-01 00:00:00", "motivo": "sonda: HTTP 402"},
                 "openrouter": {"claves_agotadas": {"a1": {"motivo": "$ opencode run …"}, "b2": {"motivo": "429"}}}}
        nueva, quitados = R.quitar_marcas_falsas(salud)
        self.assertNotIn("sin_cupo_hasta", nueva["opencode"])
        self.assertIn("sin_cupo_hasta", nueva["nim"])
        self.assertEqual(list(nueva["openrouter"]["claves_agotadas"]), ["b2"])
        self.assertEqual(quitados, ["opencode", "openrouter (clave)"])


class Reparar(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self._viejos = (R.CARPETA, R.ESTADO_AUTO)
        R.CARPETA, R.ESTADO_AUTO = self.tmp, os.path.join(self.tmp, "auto.json")
        self.addCleanup(self._restaurar)

    def _restaurar(self):
        R.CARPETA, R.ESTADO_AUTO = self._viejos

    def _comprobar_que_mejora(self):
        estados = iter([[v("Orquestador", "muerto")], [v("Orquestador", "vivo")]])

        def comprobar(clave):
            vs = next(estados)
            return {"veredictos": vs, "resumen": "todos vivos" if vs[0]["estado"] == "vivo" else "1 muerto"}
        return comprobar

    def test_comprueba_repara_y_vuelve_a_comprobar(self):
        llamadas = []
        r = R.reparar("listas", comprobar=self._comprobar_que_mejora(),
                      acciones={"vigilante": lambda: (llamadas.append(1) or (True, "reinicié el vigilante"))})
        self.assertEqual(llamadas, [1])
        self.assertEqual(r["resultado"], "reparado")
        self.assertIn("reparado", r["resumen"])
        self.assertEqual(r["acciones"][0]["resultado"], "reinicié el vigilante")
        with open(R.ruta_reparacion("listas"), encoding="utf-8") as f:
            guardado = json.load(f)
        self.assertTrue(guardado["terminado"])
        self.assertEqual(guardado["antes"]["veredictos"][0]["estado"], "muerto")

    def test_una_accion_rota_no_para_a_las_demas(self):
        def rota():
            raise RuntimeError("se rompió")
        comprobar = lambda clave: {"veredictos": [v("Agentes medidos", "colgado")], "resumen": "1 colgado"}
        hechas = []
        acciones = {a: (lambda a=a: (hechas.append(a) or (True, "ok"))) for a in R.ACCIONES}
        acciones["enjambre"] = rota
        r = R.reparar("agentes", comprobar=comprobar, acciones=acciones)
        self.assertEqual(r["resultado"], "sigue")
        self.assertFalse(r["acciones"][0]["ok"])
        self.assertIn("se rompió", r["acciones"][0]["resultado"])
        self.assertEqual(hechas, ["carril_nube", "nube_gh", "reconciliar"])

    def test_sano_no_hace_nada(self):
        llamadas = []
        r = R.reparar("disco", comprobar=lambda c: {"veredictos": [v("Espacio en disco", "vivo")], "resumen": "ok"},
                      acciones={"disco": lambda: llamadas.append(1)})
        self.assertEqual((r["resultado"], llamadas), ("nada", []))

    def test_los_directores_respetan_su_tiempo_minimo_y_avisan(self):
        avisos, hechas = [], []
        comprobar = lambda clave: {"veredictos": [v("Espacio en disco", "colgado")] if clave == "disco"
                                   else [v("X", "vivo")], "resumen": "r"}
        acciones = {"disco": lambda: (hechas.append(1) or (True, "liberé"))}
        R.reparar_todos(ahora=100_000, comprobar=comprobar, acciones=acciones, avisar=avisos.append)
        R.reparar_todos(ahora=100_000 + 600, comprobar=comprobar, acciones=acciones, avisar=avisos.append)
        self.assertEqual(hechas, [1])
        self.assertEqual(len(avisos), 1)
        self.assertIn("disco", avisos[0])
        R.reparar_todos(ahora=100_000 + 4000, comprobar=comprobar, acciones=acciones, avisar=avisos.append)
        self.assertEqual(hechas, [1, 1])


class AvisosDelVigia(unittest.TestCase):
    def test_cada_aviso_su_reparacion(self):
        casos = {
            ("contenedores", "Vigía: nube_ociosa"): "capacidad",
            ("agentes", "Vigía: trabajo_sin_nadie"): "capacidad",
            ("agentes", "Vigía: agente_callado"): "enjambre",
            ("tokens", "Vigía: tokens_mudos"): "tokens",
            ("listas", "Vigía: cadena_rota"): "reconciliar",
        }
        for (clave, proceso), accion in casos.items():
            with self.subTest(proceso=proceso):
                plan = [p["accion"] for p in R.plan_reparacion(clave, [v(proceso, "colgado")])]
                self.assertIn(accion, plan)
                self.assertIn(accion, R.ACCIONES)

    def test_lo_que_espera_a_alex_no_se_repara_solo(self):
        malos = [v("Vigía: aprobacion_eterna", "colgado", "OLA1: 9 h esperando tu visto bueno")]
        self.assertEqual(R.plan_reparacion("agentes", malos), [])
        self.assertEqual(len(R.sin_reparacion("agentes", malos)), 1)


class GenesisNoSeReiniciaEncimaDeUnaInstalacion(unittest.TestCase):
    def test_build_a_medio_instalar(self):
        d = tempfile.mkdtemp()
        try:
            self.assertFalse(R.instalando_build(d))
            os.makedirs(os.path.join(d, ".next-build"))
            self.assertTrue(R.instalando_build(d))
        finally:
            shutil.rmtree(d, ignore_errors=True)


class SinMemoria(unittest.TestCase):
    def test_la_causa_nombra_libres_y_presion(self):
        m = R.sin_memoria(800.0, 3)
        self.assertIn("la Mac está sin memoria", m)
        self.assertIn("800 MB", m)
        self.assertIn("presión", m)

    def test_basta_solo_la_presion_o_solo_lo_libre(self):
        self.assertIn("presió", R.sin_memoria(None, 3))
        self.assertIn("la Mac está sin memoria", R.sin_memoria(800.0, None))
        self.assertIsNone(R.sin_memoria(None, 1))

    def test_con_holgura_no_hay_causa(self):
        self.assertIsNone(R.sin_memoria(3000.0, 1))
        self.assertIsNone(R.sin_memoria(None, None))


class PlanPocaMemoria(unittest.TestCase):
    def test_libera_antes_de_reiniciar_genesis(self):
        malos = [v("Medidor", "muerto", "la API de Genesis no contestó")]
        plan = R.plan_reparacion("agentes", malos, "la Mac está sin memoria: quedan 800 MB libres")
        self.assertEqual([p["accion"] for p in plan], ["liberar_memoria", "genesis"])
        self.assertIn("la Mac está sin memoria", plan[0]["por_que"])
        self.assertTrue(plan[0]["titulo"])

    def test_sin_falta_igual_que_siempre(self):
        malos = [v("Medidor", "muerto")]
        self.assertEqual([p["accion"] for p in R.plan_reparacion("agentes", malos)], ["genesis"])

    def test_la_falta_solo_alarga_el_plan_con_genesis(self):
        plan = R.plan_reparacion("agentes", [v("Agentes medidos", "colgado")], "la Mac está sin memoria: 800 MB")
        self.assertEqual([p["accion"] for p in plan], ["enjambre", "carril_nube", "nube_gh", "reconciliar"])


class OllamaPuro(unittest.TestCase):
    def test_modelos_cargados_de_ps(self):
        ps = {"models": [{"name": "qwen3:4b", "size": 1}, {"model": "llama3"}, "raro"]}
        self.assertEqual(R.modelos_cargados(ps), ["qwen3:4b", "llama3"])
        self.assertEqual(R.modelos_cargados({}), [])
        self.assertEqual(R.modelos_cargados(None), [])

    def test_solo_el_ollama_de_esta_maquina(self):
        self.assertTrue(R.es_url_local("http://127.0.0.1:11434"))
        self.assertTrue(R.es_url_local("http://localhost:11434"))
        self.assertFalse(R.es_url_local("http://192.168.1.7:11434"))
        self.assertFalse(R.es_url_local("no es una url"))


class ResumenCausa(unittest.TestCase):
    def test_dice_la_causa_en_vez_de_sigue_igual(self):
        falta = R.sin_memoria(800.0, 3)
        hechas = [{"accion": "liberar_memoria", "ok": True}, {"accion": "genesis", "ok": False}]
        linea = R.frase("agentes", "sigue", hechas, "la API de Genesis no contestó", falta)
        self.assertIn("la Mac está sin memoria", linea)
        self.assertNotIn("sigue igual", linea)

    def test_sin_liberacion_se_queda_como_estaba(self):
        falta = R.sin_memoria(800.0, 3)
        linea = R.frase("agentes", "sigue", [{"accion": "genesis", "ok": False}], "x", falta)
        self.assertIn("sigue igual", linea)


class RepararLiberando(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp, True)
        viejos = (R.CARPETA, R.ESTADO_AUTO)
        R.CARPETA, R.ESTADO_AUTO = self.tmp, os.path.join(self.tmp, "auto.json")

        def restaurar():
            R.CARPETA, R.ESTADO_AUTO = viejos
        self.addCleanup(restaurar)

    def test_liberar_va_antes_del_reinicio_y_la_causa_se_guarda(self):
        falta = R.sin_memoria(800.0, 3)
        comprobar = lambda c: {"veredictos": [v("Medidor", "muerto", "la API de Genesis no contestó")],
                               "resumen": "la API de Genesis no contestó"}
        acciones = {"liberar_memoria": lambda: (True, "corté 2 huérfanos · BitNet dormido"),
                    "genesis": lambda: (False, "launchctl no pudo reiniciar com.starseed.mando")}
        r = R.reparar("agentes", comprobar=comprobar, acciones=acciones, falta=falta)
        self.assertEqual([a["accion"] for a in r["acciones"]], ["liberar_memoria", "genesis"])
        self.assertEqual(r["resultado"], "sigue")
        self.assertIn("la Mac está sin memoria", r["resumen"])
        self.assertNotIn("sigue igual", r["resumen"])
        self.assertEqual(r["sin_memoria"], falta)
        with open(R.ruta_reparacion("agentes"), encoding="utf-8") as f:
            self.assertEqual(json.load(f)["sin_memoria"], falta)


if __name__ == "__main__":
    unittest.main()
