# -*- coding: utf-8 -*-
"""CAP1026 (2026-10-26) · «hay muy pocos agentes activos»: lo que se midió y lo que se arregló.

A · el director de la nube elegía «Sesiones de Claude Code en la nube» (1 agente por job) cuando GitHub
    estaba lleno y lanzaba igualmente un job de GitHub con 1 trabajador: seis jobs de UN agente.
B · lo que la nube integró en su rama volvía a «pendiente» y a la nube (solo se miraba el último run):
    AGF1023E, dos commits en dos runs y ninguno en main, porque `traer_nube` espera a una «reasignada».
C · los agentes del A1 (3 trabajadores) no contaban en ningún total: el catálogo decía 1 y nadie los medía.
D · el «backstop» de 30 lanzamientos al día se alcanzaba TODOS los días desde el 14-10 (el 26, a las 12:00):
    la nube se quedaba parada medio día con 300 tareas listas. El tope del día sale ahora de la capacidad.
E · «Buscar más capacidad» lanzó 8 jobs en 4 minutos y 11 tareas viajaron en 2 o 3 de ellos: el progreso
    las volvía a «pendiente» (la foto de la Mac) antes del «soltar». Lo que va en una cola reciente no se reenvía.
F · los dos directores contaban GitHub distinto (3 jobs fijos frente a «escritores × 2» con la sonda): ahora
    los dos leen los escritores vivos de la salud compartida, y una marca vigente pesa más que una sonda.
"""
import importlib.util
import os
import sys
import unittest

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
_spec = importlib.util.spec_from_file_location("director_nube_cap1026", os.path.join(AQUI, "director-nube.py"))
D = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(D)
import buscar_capacidad as BC  # noqa: E402
import contenedores_nube as CN  # noqa: E402
import repartir_nube as R  # noqa: E402
import datetime as _dt  # noqa: E402

T = 1_800_000_000.0


class A_ElDirectorSoloLanzaLoQueSabeLanzar(unittest.TestCase):
    def test_con_github_lleno_no_elige_claude_ni_cloudroom(self):
        conts = [
            {"id": "cloudroom", "desplegable": True, "agentes_libres": 30, "agentes_por_job": 1},
            {"id": "claude-nube", "desplegable": True, "agentes_libres": 4, "agentes_por_job": 1},
            {"id": "nube-gh", "desplegable": False, "agentes_libres": 0, "agentes_por_job": 4},
        ]
        self.assertIsNone(D.elegir_contenedor(conts))

    def test_elige_github_aunque_otro_venga_antes_con_mas_sitio(self):
        conts = [
            {"id": "claude-nube", "desplegable": True, "agentes_libres": 4, "agentes_por_job": 1},
            {"id": "nube-gh", "desplegable": True, "agentes_libres": 4, "agentes_por_job": 4},
        ]
        elegido = D.elegir_contenedor(conts)
        self.assertEqual(elegido["id"], "nube-gh")
        self.assertEqual(elegido["agentes_por_job"], 4)  # el job sale con SUS trabajadores, no con 1


class B_LoIntegradoEnLaNubeNoSeVuelveAMandar(unittest.TestCase):
    def test_un_commit_de_cualquier_run_reciente_gana(self):
        por_run = [
            ("300", {"AGF1023E": ("sin_cambios", ""), "X": ("fallo_tsc", "rojo")}),
            ("200", {"AGF1023E": ("commit", "commit a3043978d · revisión sin revisor")}),
            ("100", {"X": ("commit", "viejo")}),
        ]
        v = R.combinar_veredictos(por_run, ["AGF1023E", "X", "Y"])
        self.assertEqual(v["AGF1023E"], ("commit", "commit a3043978d · revisión sin revisor", "200"))
        self.assertEqual(v["X"][0], "commit")
        self.assertNotIn("Y", v)

    def test_sin_commit_manda_el_run_mas_nuevo(self):
        v = R.combinar_veredictos([("2", {"A": ("rechazada", "nuevo")}), ("1", {"A": ("sin_cambios", "")})])
        self.assertEqual(v["A"], ("rechazada", "nuevo", "2"))

    def test_integrada_en_la_nube_queda_integrada_y_no_cuenta_como_envio_agotado(self):
        prog = {"AGF1023E": {"estado": "reasignada", "medio": "nube", "modelo": "m"}}
        nuevo = R.devolver_a_pendiente(prog, ["AGF1023E"], "20261026", envios={"AGF1023E": 3},
                                       veredictos={"AGF1023E": ("commit", "commit a30439", "40287793488")}, ahora=T)
        e = nuevo["AGF1023E"]
        self.assertEqual((e["estado"], e["medio"], e["integrada_nube_t"]), ("integrada", "nube", T))
        self.assertIn("nube/40287793488", e["nota"])
        self.assertEqual(e["modelo"], "m")  # la historia se conserva
        self.assertEqual(prog["AGF1023E"]["estado"], "reasignada")  # no muta la entrada

    def test_la_integrada_no_se_reclama_hasta_pasar_el_plazo(self):
        prog = {"A": {"estado": "integrada", "medio": "nube", "integrada_nube_t": T}}
        self.assertEqual(R.reclamar_varadas(prog, 0, ids_vivos=set(), ahora=T + 3600), [])
        self.assertEqual(R.reclamar_varadas(prog, 0, ids_vivos=set(), ahora=T + R.ESPERA_TRAER_S + 1), ["A"])

    def test_pasado_el_plazo_va_a_bloqueadas_con_el_motivo(self):
        prog = {"A": {"estado": "integrada", "medio": "nube", "integrada_nube_t": T}}
        nuevo = R.devolver_a_pendiente(prog, ["A"], "20261027", envios={"A": 1},
                                       veredictos={"A": ("commit", "c", "1")}, ahora=T + R.ESPERA_TRAER_S + 5)
        self.assertEqual(nuevo["A"]["estado"], "bloqueada")
        self.assertIn("traer_nube no la ha traído", nuevo["A"]["nota"])

    def test_una_integrada_de_la_mac_no_es_de_la_nube(self):
        prog = {"A": {"estado": "integrada", "integrada_nube_t": T}}
        self.assertEqual(R.reclamar_varadas(prog, 0, ids_vivos=set(), ahora=T + 10 * R.ESPERA_TRAER_S), [])

    def test_sin_veredicto_de_commit_sigue_como_antes(self):
        prog = {"X": {"estado": "reasignada", "medio": "nube"}}
        nuevo = R.devolver_a_pendiente(prog, ["X"], "20261026", envios={"X": 1},
                                       veredictos={"X": ("sin_cambios", "", "9")}, ahora=T)
        self.assertEqual(nuevo["X"]["estado"], "pendiente")


class C_LosAgentesDelA1Cuentan(unittest.TestCase):
    def _estado(self, latido, vivo=True, orq_vivo=True, trabajadores=3):
        return {"nodo": {"vivo": vivo, "latido": latido,
                         "orquestador": {"vivo": orq_vivo, "cola": "cola-mg-oracle-x.json", "trabajadores": trabajadores}}}

    def test_latido_fresco_con_orquestador_vivo(self):
        self.assertEqual(CN.vivos_oracle(self._estado(T - 60), T), 3)

    def test_latido_viejo_o_sin_orquestador_no_cuenta(self):
        self.assertEqual(CN.vivos_oracle(self._estado(T - CN.LATIDO_ORACLE_MAX_S - 1), T), 0)
        self.assertEqual(CN.vivos_oracle(self._estado(T - 60, orq_vivo=False), T), 0)
        self.assertEqual(CN.vivos_oracle(self._estado(T - 60, vivo=False), T), 0)
        self.assertEqual(CN.vivos_oracle({}, T), 0)
        self.assertEqual(CN.vivos_oracle(None, T), 0)

    def test_el_contenedor_del_a1_lleno_dice_3_trabajando_y_0_libres(self):
        c = CN.contenedor({"id": "oracle", "estado": "listo"}, CN.CATALOGO["oracle"], {"oracle": {"agentes": 3, "runs": 1}})
        self.assertEqual((c["agentes_ahora"], c["agentes_libres"], c["agentes_por_job"]), (3, 0, 3))
        self.assertFalse(c["desplegable"])  # el A1 lo alimenta su propio ciclo (oracle_nodo), no el director


class D_ElTopeDelDiaSaleDeLaCapacidad(unittest.TestCase):
    def test_tres_jobs_de_45_min_dan_96_lanzamientos(self):
        self.assertEqual(D.tope_dia_por_capacidad(3, minutos=45, suelo=30, fijo=False), 96)

    def test_nunca_baja_del_suelo(self):
        self.assertEqual(D.tope_dia_por_capacidad(1, minutos=300, suelo=30, fijo=False), 30)

    def test_un_tope_fijado_a_mano_manda(self):
        self.assertEqual(D.tope_dia_por_capacidad(3, minutos=45, suelo=30, fijo=True), 30)

    def test_entradas_raras_vuelven_al_suelo(self):
        self.assertEqual(D.tope_dia_por_capacidad("x", minutos=45, suelo=30, fijo=False), 30)
        self.assertEqual(D.tope_dia_por_capacidad(0, minutos=45, suelo=30, fijo=False), 32)

    def test_los_jobs_salen_del_medio_lanzable_aunque_este_lleno(self):
        conts = [{"id": "cloudroom", "jobs_simultaneos": 30}, {"id": "nube-gh", "jobs_simultaneos": 3, "agentes_libres": 0}]
        self.assertEqual(D._jobs_del_lanzable(conts), 3)
        self.assertEqual(D._jobs_del_lanzable(None), max(1, D.TOPE_AGENTES // int(D.TRABAJADORES)))

    def test_con_30_lanzados_y_capacidad_ya_no_espera_al_dia_siguiente(self):
        tope = D.tope_dia_por_capacidad(3, minutos=45, suelo=30, fijo=False)
        lanzar, motivo = D.decidir_lanzamiento(300, 1, 30, tope_dia=tope, agentes_en_marcha=4,
                                               trabajadores="4", tope_agentes=12)
        self.assertTrue(lanzar, motivo)
        lanzar, motivo = D.decidir_lanzamiento(300, 1, 96, tope_dia=tope, agentes_en_marcha=4,
                                               trabajadores="4", tope_agentes=12)
        self.assertFalse(lanzar)
        self.assertIn("tope del día", motivo)


def _ts(txt):
    return _dt.datetime.strptime(txt, "%Y%m%d%H%M").timestamp()


class E_LoQueYaViajaNoSeReenvia(unittest.TestCase):
    def test_las_colas_de_la_ultima_hora_y_cuarto_estan_en_vuelo(self):
        ahora = _ts("202610261210")
        colas = [("cola-nube-20261026-1205.json", ["GUI1021K1b", "RTOPS1024Ed"]),
                 ("cola-nube-20261026-1206-2.json", ["GUI1021K1b", "RLB1020Sb"]),
                 ("cola-nube-20261026-0900.json", ["VIEJA1"]),
                 ("otra-cosa.json", ["NO"])]
        self.assertEqual(R.en_vuelo(colas, ahora), {"GUI1021K1b", "RTOPS1024Ed", "RLB1020Sb"})

    def test_pasado_el_plazo_vuelve_a_poder_mandarse(self):
        colas = [("cola-nube-20261026-1205.json", ["A"])]
        self.assertEqual(R.en_vuelo(colas, _ts("202610261205") + R.EN_VUELO_S + 1), set())
        self.assertEqual(R.en_vuelo(colas, _ts("202610261205") + 60), {"A"})

    def test_el_prestamo_al_a1_tampoco_coge_lo_que_vuela(self):
        import json
        import tempfile
        import time as _time
        from unittest import mock
        import nodo_metagenesis_medio as M

        with tempfile.TemporaryDirectory() as raiz:
            olas = os.path.join(raiz, "starseed_memory_root", "olas")
            colas = os.path.join(raiz, "enjambre", "colas")
            os.makedirs(olas)
            os.makedirs(colas)
            tareas = [{"id": i, "titulo": i, "archivos": ["src/a.ts"], "prompt": "x", "depende": []}
                      for i in ("RTCRM1024D", "IMG1020C")]
            with open(os.path.join(olas, "cola-prueba-1026.json"), "w") as f:
                json.dump(tareas, f)
            with open(os.path.join(olas, "progreso.json"), "w") as f:
                json.dump({"RTCRM1024D": {"estado": "pendiente"}}, f)
            nombre = "cola-nube-%s.json" % _time.strftime("%Y%m%d-%H%M", _time.localtime(_time.time() - 600))
            with open(os.path.join(colas, nombre), "w") as f:
                json.dump({"tareas": [{"id": "RTCRM1024D"}]}, f)
            with mock.patch.object(M, "_sh", return_value=(0, "")), mock.patch.object(M, "cola_viva", return_value=None):
                ids = [t["id"] for t in M.candidatos_reparto(raiz)]
        self.assertEqual(ids, ["IMG1020C"])

    def test_sin_lo_de_la_mac_aparta_lo_que_vuela(self):
        colas = [("cola-1026.json", [{"id": "A"}, {"id": "B"}, {"id": "C"}])]
        fuera = R.sin_lo_de_la_mac(colas, set(), (), {"B"})
        self.assertEqual([t["id"] for t in fuera[0][1]], ["A", "C"])


class F_LosDosDirectoresCuentanGithubIgual(unittest.TestCase):
    AHORA = "2026-10-26 12:04:00"
    SALUD = {"xkiro": {"estado": "vivo", "sin_cupo_hasta": "2026-10-26 18:00:33"},
             "openrouter": {"estado": "vivo", "sin_cupo_hasta": "2026-10-26 18:00:33"},
             "google": {"sin_cupo_hasta": "2026-10-27 01:00:23"}, "nim": {"estado": "vivo"}}
    SONDAS = [("nvidia/x", True, "responde", 0), ("openrouter/y", True, "responde", 0),
              ("xkiro/z", True, "responde", 0), ("opencode/w", True, "Zen", 0), ("google/g", True, "responde", 0)]

    def test_una_marca_vigente_pesa_mas_que_la_sonda(self):
        self.assertEqual(BC.escritores_en_la_nube(self.SONDAS, self.SALUD, self.AHORA), ["nvidia", "opencode"])
        # sin salud, como antes: manda la sonda
        self.assertEqual(len(BC.escritores_en_la_nube(self.SONDAS)), 5)

    def test_capacidad_de_github_por_escritores(self):
        self.assertEqual(CN.capacidad_gh(["nvidia"], 4, 6, 14), 1)
        self.assertEqual(CN.capacidad_gh(["nvidia", "opencode"], 4, 6, 14), 3)
        self.assertEqual(CN.capacidad_gh(["a", "b", "c", "d", "e"], 3, 6, 14), 10)
        self.assertEqual(CN.capacidad_gh([], 4, 6, 14), 0)
        self.assertEqual(CN.capacidad_gh(list("abcdefghijk"), 3, 6, 14), 14)

    def test_el_catalogo_medido_cambia_los_jobs_y_dice_por_que(self):
        orig = BC.escritores_en_la_nube
        try:
            BC.escritores_en_la_nube = lambda *a, **k: ["nvidia"]
            c = CN._catalogo_gh_medido(CN.CATALOGO["nube-gh"])
        finally:
            BC.escritores_en_la_nube = orig
        self.assertEqual(c["jobs_simultaneos"], 1)
        self.assertIn("nvidia", c["coste"])
        self.assertEqual(CN.CATALOGO["nube-gh"]["jobs_simultaneos"], 3)  # el catálogo base no se toca


class I_UnPrestamoQueNoSalioNoReserva(unittest.TestCase):
    """CAP1026I · con el enlace en «tablas» la orden no sale: no se apunta el préstamo (6 h de reserva)."""

    def _nodo(self):
        import nodo_metagenesis as N

        nodo = N.Nodo.__new__(N.Nodo)
        nodo.modo, nodo.mem = "real", {}
        return N, nodo

    def _con_resultado(self, N, nodo, resultado):
        from unittest import mock

        def repartir(self, a, informe, t):
            informe.setdefault("acciones", []).append({"resultado": resultado})
        informe = {"acciones": []}
        with mock.patch.object(N.Nodo, "_repartir", repartir):
            return N.Nodo._prestar(nodo, [{"id": "X1", "titulo": "x", "prompt": "p"}], "oracle-a1-cd000b", "m",
                                   informe, 1e9, trabajadores=3)

    def test_en_tablas_no_se_apunta(self):
        N, nodo = self._nodo()
        self.assertFalse(self._con_resultado(N, nodo, "no puedo pedírselo: modo tablas: va por la bitácora"))
        self.assertEqual(nodo.mem.get("prestamos") or [], [])

    def test_si_sale_se_apunta(self):
        N, nodo = self._nodo()
        self.assertTrue(self._con_resultado(N, nodo, "pedido a oracle-a1-cd000b"))
        self.assertEqual([p["ids"] for p in nodo.mem["prestamos"]], [["X1"]])


class K_UnCuelgueDeLaMacNoApagaAlProveedorEnLaNube(unittest.TestCase):
    SALUD = {"opencode": {"sin_cupo_hasta": "2026-10-26 18:08:58",
                          "motivo": "modelos colgados sin escribir: opencode/glm-5.3-flash-free, opencode/deepseek"},
             "openrouter": {"estado": "vivo", "sin_cupo_hasta": "2026-10-26 18:00:33",
                            "motivo": "sonda del botón: cupo del día agotado (429)"},
             "nim": {"estado": "vivo"}}

    def _nube_gh(self):
        _spec = importlib.util.spec_from_file_location("nube_gh_cap1026k", os.path.join(AQUI, "nube-gh.py"))
        G = importlib.util.module_from_spec(_spec)
        _spec.loader.exec_module(G)
        return G

    def test_la_salud_que_viaja_no_lleva_el_cuelgue_pero_si_el_429(self):
        s = self._nube_gh().salud_para_la_nube(self.SALUD)
        self.assertNotIn("sin_cupo_hasta", s["opencode"])
        self.assertEqual(s["openrouter"]["sin_cupo_hasta"], "2026-10-26 18:00:33")
        self.assertIn("sin_cupo_hasta", self.SALUD["opencode"])  # la de la Mac no se toca

    def test_la_capacidad_de_la_nube_cuenta_zen(self):
        self.assertEqual(BC.escritores_en_la_nube(None, self.SALUD, "2026-10-26 13:00:00"), ["nvidia", "opencode"])



class ElDirectorSeRecarga(unittest.TestCase):
    """(CAP1026Q) El director de la nube vive horas: si cambia el código que cargó, se vuelve a ejecutar."""

    def test_ve_lo_que_cambio_en_disco(self):
        import tempfile
        import types

        with tempfile.TemporaryDirectory() as d:
            ruta = os.path.join(d, "contenedores_nube.py")
            with open(ruta, "w") as f:
                f.write("x = 1\n")
            otro = os.path.join(d, "..", "fuera.py")
            mods = {"contenedores_nube": types.SimpleNamespace(__file__=ruta), "fuera": types.SimpleNamespace(__file__=otro),
                    "sin": types.SimpleNamespace()}
            antes = D.huellas_del_puente(mods, d)
            self.assertEqual(list(antes), [os.path.abspath(ruta)])
            self.assertEqual(D.codigo_cambiado(antes, D.huellas_del_puente(mods, d)), [])
            with open(ruta, "a") as f:
                f.write("y = 2\n")
            self.assertEqual(D.codigo_cambiado(antes, D.huellas_del_puente(mods, d)), [os.path.abspath(ruta)])
            os.remove(ruta)
            self.assertEqual(D.codigo_cambiado(antes, D.huellas_del_puente(mods, d)), [os.path.abspath(ruta)])


if __name__ == "__main__":
    unittest.main()
