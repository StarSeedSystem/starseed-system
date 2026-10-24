# -*- coding: utf-8 -*-
"""El inventario de contenedores: la capacidad se MIDE y la lee todo el mundo.

Antes la capacidad de la nube vivía en dos sitios que no se hablaban: el sondeo que se
pinta en Genesis y unas constantes del director (`TOPE_AGENTES = 12`). Lo que la
pantalla enseñaba y lo que el director decidía no tenían por qué coincidir.
"""
import os
import unittest

import contenedores_nube as C


class SitioLibre(unittest.TestCase):
    def test_medio_vacio_tiene_todos_sus_huecos(self):
        cat = {"jobs_simultaneos": 3, "agentes_por_job": 4}
        self.assertEqual(C.libres_de(cat, agentes_ahora=0, runs_ahora=0), 12)

    def test_un_job_vivo_quita_un_job_de_sitio(self):
        cat = {"jobs_simultaneos": 3, "agentes_por_job": 4}
        self.assertEqual(C.libres_de(cat, agentes_ahora=4, runs_ahora=1), 8)

    def test_lleno_no_tiene_sitio(self):
        cat = {"jobs_simultaneos": 3, "agentes_por_job": 4}
        self.assertEqual(C.libres_de(cat, agentes_ahora=12, runs_ahora=3), 0)

    def test_se_cuenta_por_jobs_no_por_agentes_sueltos(self):
        # Medio job no existe: la unidad que se lanza es el job.
        cat = {"jobs_simultaneos": 2, "agentes_por_job": 4}
        self.assertEqual(C.libres_de(cat, agentes_ahora=1, runs_ahora=1), 4)

    def test_un_medio_sin_jobs_no_tiene_sitio_aunque_este_vacio(self):
        # Colab y Cloud Run: capacidad de catálogo pero sin forma de lanzar todavía.
        self.assertEqual(C.libres_de({"jobs_simultaneos": 0, "agentes_por_job": 0}, 0, 0), 0)

    def test_mas_agentes_de_los_que_caben_no_inventa_sitio(self):
        cat = {"jobs_simultaneos": 2, "agentes_por_job": 3}
        self.assertEqual(C.libres_de(cat, agentes_ahora=99, runs_ahora=1), 0)


class FichaDelContenedor(unittest.TestCase):
    def _gh(self, estado):
        return {"id": "nube-gh", "nombre": "GitHub Actions", "estado": estado,
                "detalle": "9 clave(s) de proveedor", "siguiente_paso": "lanzar"}

    def test_usable_es_desplegable_y_dice_su_maquina(self):
        c = C.contenedor(self._gh("usable"), C.CATALOGO["nube-gh"], {})
        self.assertTrue(c["desplegable"])
        self.assertEqual(c["agentes_libres"], 12)
        self.assertIn("4 vCPU", c["maquina"])
        self.assertIn("GitHub", c["proveedor"])
        self.assertEqual(c["falta"], "")

    def test_lo_que_requiere_a_alex_no_es_desplegable_y_dice_que_falta(self):
        c = C.contenedor(self._gh("requiere_alex"), C.CATALOGO["nube-gh"], {})
        self.assertFalse(c["desplegable"])
        self.assertEqual(c["agentes_libres"], 0)
        self.assertIn("clave", c["falta"])

    def test_los_agentes_vivos_bajan_el_sitio_libre(self):
        vivos = {"nube-gh": {"agentes": 8, "runs": 2}}
        c = C.contenedor(self._gh("listo"), C.CATALOGO["nube-gh"], vivos)
        self.assertEqual(c["agentes_ahora"], 8)
        self.assertEqual(c["agentes_libres"], 4)

    def test_un_medio_sin_catalogo_no_rompe_la_ficha(self):
        c = C.contenedor({"id": "raro", "estado": "usable"}, {}, {})
        self.assertEqual(c["agentes_libres"], 0)
        self.assertFalse(c["desplegable"])


class Totales(unittest.TestCase):
    def test_suma_lo_de_ahora_lo_libre_y_el_tope(self):
        conts = [
            {"id": "a", "estado": "usable", "agentes_ahora": 4, "agentes_libres": 8,
             "jobs_simultaneos": 3, "agentes_por_job": 4},
            {"id": "b", "estado": "requiere_alex", "agentes_ahora": 0, "agentes_libres": 0,
             "jobs_simultaneos": 0, "agentes_por_job": 0},
        ]
        r = C.resumir(conts)
        self.assertEqual(r["agentes_ahora"], 4)
        self.assertEqual(r["agentes_libres"], 8)
        self.assertEqual(r["agentes_tope"], 12)
        self.assertEqual(r["usables"], 1)
        self.assertEqual(r["por_hacer"], 1)

    def test_el_tope_solo_cuenta_los_usables(self):
        # Un medio por abrir no es capacidad: prometerla es exactamente lo que no queremos.
        conts = [{"id": "colab", "estado": "requiere_alex", "agentes_ahora": 0,
                  "agentes_libres": 0, "jobs_simultaneos": 4, "agentes_por_job": 4}]
        self.assertEqual(C.resumir(conts)["agentes_tope"], 0)


class LaMacNoEsUnContenedorDeNube(unittest.TestCase):
    def test_la_mac_y_claude_quedan_fuera(self):
        self.assertIn("mac", C.NO_SON_CONTENEDORES)
        self.assertIn("claude", C.NO_SON_CONTENEDORES)


class OracleTieneCapacidadReal(unittest.TestCase):
    """Contrato oracle-nube.md §1 y §8: A1 de 2 OCPU y 12 GB, y el gobernador deja 1
    agente permanente (núcleos − 1), no «descartado» ni 24 GB."""

    def test_el_catalogo_dice_la_maquina_real(self):
        cat = C.CATALOGO["oracle"]
        self.assertEqual(cat["vcpu"], 2)
        self.assertEqual(cat["ram_gb"], 12)
        self.assertEqual(cat["jobs_simultaneos"], 1)

    def test_un_oracle_usable_tiene_sitio_para_su_agente_permanente(self):
        medio = {"id": "oracle", "nombre": "Oracle Always Free", "estado": "usable",
                 "capacidad": "A1 2 OCPU · 12 GB · 2 micro 1 GB · 10 TB/mes", "detalle": ""}
        c = C.contenedor(medio, C.CATALOGO["oracle"], {})
        self.assertEqual(c["agentes_libres"], 1)
        self.assertIn("2 vCPU", c["maquina"])
        self.assertIn("12 GB", c["maquina"])

    def test_un_oracle_que_requiere_a_alex_no_es_desplegable(self):
        medio = {"id": "oracle", "estado": "requiere_alex", "detalle": "cuenta sin vincular",
                 "siguiente_paso": "vincular: `oci setup bootstrap`"}
        c = C.contenedor(medio, C.CATALOGO["oracle"], {})
        self.assertFalse(c["desplegable"])
        self.assertEqual(c["agentes_libres"], 0)
        self.assertIn("vincular", c["falta"])


class ClaudeEnLaNube(unittest.TestCase):
    """(ALT1022C) Las sesiones de Claude Code en la nube son un medio: tienen crédito propio."""

    AHORA = 1_792_000_000.0  # 2026-10-15 aprox.
    VIGENTE = {"total_usd": 250, "restante_usd": 244, "vence": "2026-11-04T23:59:00-08:00"}

    def test_esta_en_el_catalogo_y_la_sesion_de_direccion_sigue_fuera(self):
        cat = C.CATALOGO["claude-nube"]
        self.assertEqual(cat["servicio"], "Sesiones de Claude Code en la nube")
        self.assertIn("Anthropic", cat["proveedor"])
        self.assertEqual(cat["agentes_por_job"], 1)
        self.assertEqual(cat["horas_job"], 0)
        self.assertIn("claude", C.NO_SON_CONTENEDORES)
        self.assertNotIn("claude-nube", C.NO_SON_CONTENEDORES)

    def test_tope_por_entorno(self):
        viejo = os.environ.get("STARSEED_ALTA_NUBE_MAX")
        try:
            os.environ["STARSEED_ALTA_NUBE_MAX"] = "7"
            self.assertEqual(C.tope_claude_nube(), 7)
            os.environ["STARSEED_ALTA_NUBE_MAX"] = "x"
            self.assertEqual(C.tope_claude_nube(), 4)
            del os.environ["STARSEED_ALTA_NUBE_MAX"]
            self.assertEqual(C.tope_claude_nube(), 4)
        finally:
            if viejo is not None:
                os.environ["STARSEED_ALTA_NUBE_MAX"] = viejo

    def test_credito_vigente_con_lanzador_esta_listo(self):
        medio, cat = C.medio_claude_nube(self.VIGENTE, True, self.AHORA)
        self.assertEqual(medio["estado"], "listo")
        self.assertIn("244", cat["coste"])
        self.assertIn("2026-11-04", cat["coste"])
        c = C.contenedor(medio, cat, {"claude-nube": {"agentes": 1, "runs": 1}})
        self.assertEqual(c["agentes_ahora"], 1)
        self.assertEqual(c["agentes_libres"], cat["jobs_simultaneos"] - 1)
        self.assertTrue(c["desplegable"])

    def test_sin_lanzador_es_usable_pero_no_desplegable(self):
        medio, cat = C.medio_claude_nube(self.VIGENTE, False, self.AHORA)
        self.assertEqual(medio["estado"], "usable")
        self.assertIn("lanzador", medio["detalle"])
        self.assertFalse(C.contenedor(medio, cat, {})["desplegable"])

    def test_credito_vencido_no_esta_disponible(self):
        vencido = dict(self.VIGENTE, vence="2026-01-01T00:00:00Z")
        estado, detalle = C.estado_claude_nube(vencido, True, self.AHORA)
        self.assertEqual(estado, "no_disponible")
        self.assertIn("venció", detalle)
        self.assertEqual(C.caben_hoy_claude(vencido, self.AHORA), 0)

    def test_bajo_la_reserva_no_esta_disponible(self):
        estado, detalle = C.estado_claude_nube(dict(self.VIGENTE, restante_usd=9), True, self.AHORA)
        self.assertEqual(estado, "no_disponible")
        self.assertIn("reserva", detalle)
        self.assertEqual(C.estado_claude_nube(None, True, self.AHORA)[0], "no_disponible")

    def test_vivas_desde_el_progreso(self):
        registro = {"sesiones": [
            {"tarea": "A", "t": 1}, {"tarea": "A", "t": 2},  # relanzada: un agente
            {"tarea": "B"},                                  # ya integrada
            {"tarea": "C", "estado": "terminada"},           # el registro la cerró
            {"tarea": "D"},                                  # reasignada a otro medio
            "basura",
        ]}
        progreso = {
            "A": {"estado": "reasignada", "medio": "claude-nube"},
            "B": {"estado": "integrada", "medio": "claude-nube"},
            "C": {"estado": "reasignada", "medio": "claude-nube"},
            "D": {"estado": "reasignada", "medio": "oracle"},
        }
        self.assertEqual(C.vivas_claude_nube(registro, progreso), 1)
        self.assertEqual(C.vivas_claude_nube(None, progreso), 0)
        self.assertEqual(C.vivas_claude_nube(registro, None), 0)

    def test_caben_hoy_reparte_el_credito_por_dias(self):
        # 20 días exactos y 244 $: (244 − 10) / 20 = 11,7 $ hoy → 3 sesiones de 3 $.
        credito = {"restante_usd": 244, "vence": "2026-11-04T00:00:00Z"}
        ahora = C._fecha("2026-10-15T00:00:00Z").timestamp()
        self.assertEqual(C.caben_hoy_claude(credito, ahora), 3)
        self.assertEqual(C.caben_hoy_claude(dict(credito, restante_usd=5), ahora), 0)

    def test_inventario_lo_anade_aunque_el_sondeo_no_lo_traiga(self):
        from unittest import mock

        with mock.patch.object(C, "_vivos_por_medio", return_value={}), \
                mock.patch.object(C, "_leer_json", return_value=None):
            d = C.inventario([{"id": "claude", "estado": "usable"}, {"id": "mac", "estado": "listo"}])
        ids = [c["id"] for c in d["contenedores"]]
        self.assertIn("claude-nube", ids)
        self.assertNotIn("claude", ids)
        self.assertNotIn("mac", ids)


if __name__ == "__main__":
    unittest.main()


class VivosCloudroom(unittest.TestCase):
    def test_cuenta_hilos_vivos_por_tarea(self):
        import contenedores_nube as CN
        reg = [{"tarea": "A", "hilo": "1"}, {"tarea": "A", "hilo": "2"}, {"tarea": "B", "final": "traida"},
               {"tarea": "C"}, "basura"]
        prog = {"A": {"estado": "reasignada", "medio": "cloudroom"}, "B": {"estado": "reasignada", "medio": "cloudroom"},
                "C": {"estado": "commit", "medio": "cloudroom"}}
        self.assertEqual(CN.vivos_cloudroom(reg, prog), 1)
        self.assertEqual(CN.vivos_cloudroom({"hilos": reg}, prog), 1)
        self.assertEqual(CN.vivos_cloudroom(None, prog), 0)
