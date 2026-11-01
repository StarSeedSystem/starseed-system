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


class MemoriaApretada(unittest.TestCase):
    """RPM1101A · los mismos criterios que el guardia: presión de kernel o poca RAM libre."""

    def test_solo_con_medida_o_presion_de_verdad(self):
        self.assertFalse(R.memoria_apretada(None, None))   # sin medida no se dice nada
        self.assertFalse(R.memoria_apretada(4000, 1))
        self.assertFalse(R.memoria_apretada(None, 1))
        self.assertTrue(R.memoria_apretada(None, 2))       # la presión del kernel manda
        self.assertTrue(R.memoria_apretada(None, 3))
        self.assertTrue(R.memoria_apretada(500, None))     # bajo lo que necesita el enjambre
        self.assertFalse(R.memoria_apretada(1600, None))
        self.assertFalse(R.memoria_apretada(3000, None))


class ConLiberacion(unittest.TestCase):
    """RPM1101A · con la Mac sin memoria, liberar va PRIMERO, no después de un reinicio que no sirve."""

    def _plan(self, *acciones):
        return [{"accion": a, "titulo": "t", "por_que": "p"} for a in acciones]

    def test_libera_primero_y_no_duplica(self):
        con, liberando = R.con_liberacion(self._plan("genesis"), None, 3)
        self.assertTrue(liberando)
        self.assertEqual([p["accion"] for p in con], ["liberar_memoria", "genesis"])
        self.assertTrue(con[0]["titulo"] and con[0]["por_que"])
        con2, _ = R.con_liberacion(self._plan("memoria", "genesis"), None, 2)
        # «memoria» (su barrida de pruebas) se queda: emitida por el medidor de memoria, no se adivina
        self.assertEqual([p["accion"] for p in con2], ["liberar_memoria", "memoria", "genesis"])

    def test_sano_o_memoria_bien_no_se_toca_nada(self):
        plan = self._plan("genesis")
        self.assertEqual(R.con_liberacion(plan, 8000, 1), (plan, False))
        self.assertEqual(R.con_liberacion([], None, 3), ([], False))
        self.assertEqual(R.con_liberacion([], 500, 3), ([], False))   # sin plan, sin liberar


class TscHuerfanos(unittest.TestCase):
    """RPM1101A · la barrida de tsc huérfanos del orquestador (SUP0111K), como función pura."""

    _TSC = "node /x/node_modules/.bin/tsc --noEmit"

    def test_el_padre_muerto_o_muy_viejo_es_huerfano(self):
        filas = [("10", "1", "1200", self._TSC),       # huérfano: nadie lo vigila
                 ("11", "5", "10", self._TSC),         # joven con padre vivo: NO se toca
                 ("12", "5", "1300", self._TSC),       # vivo pero > 20 min: se corta
                 ("13", "5", "10", "npx vitest run x"),  # no es tsc
                 ("14", "5", "10", self._TSC)]         # repetido: no se repite
        vivo = lambda pid: pid == 5
        self.assertEqual(R.tsc_huerfanos(filas, vivo), [10, 12])

    def test_filas_imparables_y_el_filtro_de_tsc(self):
        self.assertEqual(R.tsc_huerfanos([("x", "1", "a", self._TSC), ("15",)], lambda p: True), [])
        filas = [("17", "1", "60", "python3 -u script tsc")]   # « tsc» al final, como la barrida vieja
        self.assertEqual(R.tsc_huerfanos(filas, lambda p: p == 5), [17])
        joven = [("18", "5", "10", "python3 -u script tsc")]
        self.assertEqual(R.tsc_huerfanos(joven, lambda p: p == 5), [])


class FraseDelResumen(unittest.TestCase):
    """RPM1101A · «sigue igual» sin decir POR QUÉ dejó a Alex sin nada tres veces seguidas."""

    def test_si_sigue_y_falta_memoria_la_causa_se_dice(self):
        hechas = [{"accion": "liberar_memoria", "ok": False}, {"accion": "genesis", "ok": False}]
        con_causa = R.frase("agentes", "sigue", hechas, "1 muerto", sin_memoria=True)
        self.assertIn("la Mac está sin memoria", con_causa)
        self.assertNotIn("sigue igual tras reparar", con_causa)
        self.assertIn("0 de 2 acción(es) bien", con_causa)
        sin_causa = R.frase("agentes", "sigue", hechas, "1 muerto", sin_memoria=False)
        self.assertIn("sigue igual tras reparar", sin_causa)
        self.assertNotIn("sin memoria", sin_causa)


class MemoriaEnLaReparacion(unittest.TestCase):
    """RPM1101A · el flujo completo: mide, libera primero si hace falta y dice la causa al final."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self._viejos = (R.CARPETA, R.ESTADO_AUTO)
        R.CARPETA, R.ESTADO_AUTO = self.tmp, os.path.join(self.tmp, "auto.json")
        self.addCleanup(self._restaurar)

    def _restaurar(self):
        R.CARPETA, R.ESTADO_AUTO = self._viejos

    def _comprobar_muerto(self):
        def comprobar(clave):
            return {"veredictos": [v("Medidor", "muerto", "la API de Genesis no contestó")],
                    "resumen": "la API de Genesis no contestó"}
        return comprobar

    def test_con_presion_liberar_va_primero_y_lo_dice_al_final(self):
        llamadas = []

        def acciones():
            return {"liberar_memoria": lambda: (llamadas.append("liberar") or (False, "no había nada que liberar")),
                    "genesis": lambda: (llamadas.append("genesis") or (True, "lo reinicié"))}

        r = R.reparar("agentes", comprobar=self._comprobar_muerto(), acciones=acciones(),
                      medir=lambda: (900, 3))
        self.assertEqual(llamadas, ["liberar", "genesis"])       # liberar ANTES de reiniciar
        self.assertFalse(r["acciones"][0]["ok"])
        self.assertIn("la Mac está sin memoria", r["resumen"])
        self.assertNotIn("sigue igual", r["resumen"])
        self.assertEqual(r["memoria"]["antes"]["presion"], 3)    # quedó dicho en el archivo

    def test_si_liberar_basta_el_resumen_es_de_reparado(self):
        estados = iter([[v("Medidor", "muerto")], [v("Medidor", "vivo")]])

        def comprobar(clave):
            vs = next(estados)
            return {"veredictos": vs, "resumen": "vivo" if vs[0]["estado"] == "vivo" else "no contesta"}

        r = R.reparar("agentes", comprobar=comprobar,
                      acciones={"liberar_memoria": lambda: (True, "dormí el BitNet y corté 2 tsc"),
                                "genesis": lambda: (True, "ok")},
                      medir=iter([(900, 3), (2600, 1)]).__next__)
        self.assertTrue(r["resumen"].startswith("«agentes» reparado"))
        self.assertNotIn("sin memoria", r["resumen"])

    def test_sin_presion_el_plan_no_se_toca(self):
        llamadas = []
        r = R.reparar("agentes", comprobar=self._comprobar_muerto(),
                      acciones={"genesis": lambda: (llamadas.append(1) or (True, "ok"))},
                      medir=lambda: (8000, 1))
        self.assertEqual(llamadas, [1])
        self.assertEqual([a["accion"] for a in r["acciones"]], ["genesis"])


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
