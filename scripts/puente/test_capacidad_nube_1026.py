# -*- coding: utf-8 -*-
"""CAP1026 (2026-10-26) · «hay muy pocos agentes activos»: lo que se midió y lo que se arregló.

A · el director de la nube elegía «Sesiones de Claude Code en la nube» (1 agente por job) cuando GitHub
    estaba lleno y lanzaba igualmente un job de GitHub con 1 trabajador: seis jobs de UN agente.
B · lo que la nube integró en su rama volvía a «pendiente» y a la nube (solo se miraba el último run):
    AGF1023E, dos commits en dos runs y ninguno en main, porque `traer_nube` espera a una «reasignada».
C · los agentes del A1 (3 trabajadores) no contaban en ningún total: el catálogo decía 1 y nadie los medía.
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
import contenedores_nube as CN  # noqa: E402
import repartir_nube as R  # noqa: E402

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


if __name__ == "__main__":
    unittest.main()
