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


class CausaMemoria(unittest.TestCase):
    """(RPM1101A, 01-11) El resumen de «agentes» debe decir la causa cuando la Mac está sin
    memoria, en vez del «sigue igual» que no explica nada."""

    def test_el_resumen_dice_la_causa_en_lugar_de_sigue_igual(self):
        hechas = [{"ok": False, "resultado": "la Mac está sin memoria: corte 2 huérfanos"}]
        self.assertIn(hechas[0]["resultado"], R.frase("agentes", "sigue", hechas, "todo muerto"))
        self.assertNotIn("sigue igual", R.frase("agentes", "sigue", hechas, "todo muerto"))

    def test_mejorado_tambien_dice_la_causa(self):
        hechas = [{"ok": True, "resultado": "la Mac está sin memoria: guardia encendido"}]
        self.assertIn(hechas[0]["resultado"], R.frase("agentes", "mejorado", hechas, "queda uno"))

    def test_aqui_no_habia_causa_de_memoria(self):
        hechas = [{"ok": False, "resultado": "launchctl no pudo reiniciar com.starseed.mando: x"}]
        self.assertEqual("", R.causa_sin_memoria(hechas))
        self.assertIn("sigue igual tras reparar", R.frase("agentes", "sigue", hechas, "todo muerto"))

    def test_reparado_no_necesita_lo_decir(self):
        hechas = [{"ok": True, "resultado": "la Mac está sin memoria: guardia encendido"}]
        self.assertNotIn(R.causa_sin_memoria(hechas), R.frase("agentes", "reparado", hechas, "todos vivos"))


class GenesisSinMemoria(unittest.TestCase):
    """(RPM1101A, 01-11) Si Genesis no contesta porque la Mac va sin memoria, reiniciarlo no
    sirve: la reparación libera primero (el guardia: dormir BitNet, trabajadores huérfanos
    fuera) y dice la causa, sin darle otra vuelta a Genesis."""

    def test_libera_antes_y_dice_la_causa_sin_reiniciar(self):
        r = R.accion_genesis(sondear=lambda: False, falta=lambda: True,
                             liberar=lambda: (True, "corte 2 trabajadores huérfanos"), espera=0)
        self.assertFalse(r[0])
        self.assertIn("la Mac está sin memoria: corte 2 trabajadores huérfanos", r[1])
        self.assertIn("volverá cuando quede memoria", r[1])
        self.assertNotIn("reinicié", r[1])

    def test_liberando_basta_genesis_responde(self):
        sondas = iter([False, False, False, True])
        r = R.accion_genesis(sondear=lambda: next(sondas), falta=lambda: True,
                             liberar=lambda: (True, "corte 1 huérfano"), espera=0)
        self.assertTrue(r[0])
        self.assertIn("la Mac está sin memoria: corte 1 huérfano", r[1])
        self.assertIn("contesta otra vez", r[1])

    def test_respuesta_directa_no_toca_memoria_ni_reinicia(self):
        r = R.accion_genesis(sondear=lambda: True, falta=lambda: True,
                             liberar=lambda: (_ for _ in ()).throw(AssertionError("no tocaba liberar")),
                             espera=0)
        self.assertEqual(r, (True, "Genesis contesta: no hacía falta reiniciarlo"))


if __name__ == "__main__":
    unittest.main()


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
