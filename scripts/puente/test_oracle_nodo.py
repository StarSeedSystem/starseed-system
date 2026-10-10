# -*- coding: utf-8 -*-
"""Pruebas de las decisiones puras del lado de la neurona (oracle_nodo.py, OPO1011)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import oracle_nodo as N  # noqa: E402


def _clave(*partes):
    """Claves de prueba montadas en tiempo de ejecución (la protección de secretos de GitHub)."""
    return "".join(partes)


class Tachar(unittest.TestCase):
    def test_ip_del_a1_su_host_y_cualquier_otra(self):
        t = N.tachar("a 140.1.2.3 b bitnet.140-1-2-3.sslip.io c 10.0.0.5 ocid1.instance.oc1.mx.zz", ip="140.1.2.3")
        for prohibido in ("140.1.2.3", "140-1-2-3", "10.0.0.5", "ocid1."):
            self.assertNotIn(prohibido, t)


class Entorno(unittest.TestCase):
    def test_leer_env_con_export_comillas_y_comentarios(self):
        env = N.leer_env("# x\nexport A_KEY='uno'\nB=\"dos\"\nminus=no\nC=tres=cuatro\n")
        self.assertEqual(env, {"A_KEY": "uno", "B": "dos", "C": "tres=cuatro"})

    def test_solo_viaja_la_lista_blanca_y_nada_de_pago(self):
        env = {"XKIRO_API_KEY": "x1", "ANTHROPIC_API_KEY": "no", "OPENAI_API_KEY": "no",
               "NEXT_PUBLIC_SUPABASE_URL": "https://p.supabase.co", "GROQ_API_KEY": "",
               "FREELLMAPI_KEY": "local"}
        van, faltan = N.variables_para_a1(env)
        self.assertEqual(set(van), {"XKIRO_API_KEY", "NEXT_PUBLIC_SUPABASE_URL"})
        self.assertIn("GROQ_API_KEY", faltan)
        self.assertNotIn("ANTHROPIC_API_KEY", van)

    def test_pasarela_local_no_viaja(self):
        env = {"STARSEED_PASARELA_GROQ_URL": "http://127.0.0.1:3001/v1", "STARSEED_PASARELA_GROQ_KEY": "k"}
        van, _ = N.variables_para_a1(env)
        self.assertEqual(van, {})

    def test_contenido_env_cita_lo_raro(self):
        texto = N.contenido_env({"A": "abc-123_./:", "B": "con espacio", "C": "it's"})
        self.assertIn("A=abc-123_./:\n", texto)
        self.assertIn("B='con espacio'", texto)
        self.assertEqual(N.leer_env("A=1\n").get("A"), "1")

    def test_con_variable_sustituye_sin_duplicar(self):
        texto = N.con_variable("X=1\nSTARSEED_ORACLE_BITNET_KEY=viejo\nexport Y=2\n", "STARSEED_ORACLE_BITNET_KEY", "nuevo")
        self.assertEqual(texto.count("STARSEED_ORACLE_BITNET_KEY="), 1)
        self.assertEqual(N.leer_env(texto)["STARSEED_ORACLE_BITNET_KEY"], "nuevo")
        self.assertEqual(N.leer_env(texto)["Y"], "2")


class Relevo(unittest.TestCase):
    def test_solo_entregas_nuevas_o_reescritas(self):
        en_a1 = {"nube/a1-1": "a", "nube/a1-2": "b", "nube/a1-3": "c", "nube/otra": "d"}
        self.assertEqual(N.ramas_por_relevar(en_a1, {"nube/a1-1": "a", "nube/a1-2": "x"}), ["nube/a1-2", "nube/a1-3"])


class Lanzar(unittest.TestCase):
    VIVO = {"latido": 1000.0, "fase": "espera"}

    def test_lanza_con_el_nodo_libre(self):
        self.assertEqual(N.decidir_lanzar(self.VIVO, 1100, {}, None, []), (True, "A1 libre"))

    def test_no_sin_latido(self):
        ok, motivo = N.decidir_lanzar({"latido": 0}, 5000, {}, None, [])
        self.assertFalse(ok)
        self.assertIn("no late", motivo)

    def test_freno_de_gasto_manda(self):
        ok, motivo = N.decidir_lanzar(self.VIVO, 1100, {"freno": {"activo": True, "motivo": "gasto 3 MXN"}}, None, [])
        self.assertFalse(ok)
        self.assertIn("freno", motivo)

    def test_no_con_cola_en_marcha_ni_sin_tomar_ni_seguido(self):
        self.assertFalse(N.decidir_lanzar(dict(self.VIVO, fase="cola", cola="c"), 1100, {}, None, [])[0])
        self.assertFalse(N.decidir_lanzar(self.VIVO, 1100, {}, None, ["colas/oracle-1"])[0])
        self.assertFalse(N.decidir_lanzar(self.VIVO, 1100, {}, 1000, [])[0])
        vivo_luego = dict(self.VIVO, latido=2300.0)
        self.assertTrue(N.decidir_lanzar(vivo_luego, 2300, {}, 1000, [])[0])


class Prestamo(unittest.TestCase):
    def test_marcar_y_devolver(self):
        p = N.marcar_oracle({"T1": {"estado": "pendiente"}, "T3": {"estado": "pendiente"}}, ["T1", "T2"], "20261010", "colas/oracle-1")
        self.assertEqual(p["T1"]["estado"], "reasignada")
        self.assertEqual(p["T1"]["medio"], "oracle")
        self.assertEqual(p["T2"]["medio"], "oracle")
        self.assertEqual(p["T3"]["estado"], "pendiente")
        lanz = [{"rama": "colas/oracle-1", "ids": ["T1", "T2"], "t": 0}]
        # Mientras el A1 no la termina y late, nada vuelve.
        self.assertEqual(N.devolver_de_oracle(p, lanz, {}, True, 100), [])
        # Terminada: vuelven las que siguen prestadas (no las que ya decidió otro).
        p["T2"]["estado"] = "commit"
        self.assertEqual(N.devolver_de_oracle(p, lanz, {"colas/oracle-1": {}}, True, 100), ["T1"])
        # Nodo muerto más allá de la gracia: vuelven aunque no conste terminada.
        self.assertEqual(N.devolver_de_oracle(p, lanz, {}, False, 4 * 3600, gracia_s=3 * 3600), ["T1"])

    def test_no_toca_lo_prestado_a_la_nube_de_github(self):
        p = {"T": {"estado": "reasignada", "medio": "nube"}}
        self.assertEqual(N.devolver_de_oracle(p, [{"rama": "r", "ids": ["T"], "t": 0}], {"r": {}}, True, 1), [])


class Resumen(unittest.TestCase):
    def test_sin_urls_ni_ips_y_con_la_sonda_publica(self):
        e = {"latido": 1000, "t": "2026-10-10T10:00:00Z", "fase": "guardian",
             "servicios": [{"nombre": "caddy", "ok": True, "activo": "active", "ms": 30,
                            "detalle": "https://bitnet.140-1-2-3.sslip.io 200"}],
             "guardian": {"t": 900, "sha": "abc", "ok": True, "pasos": [], "minutos": 30, "otro": "x"},
             "carga": {"cpu_1h": 40.0, "mem_ahora": 25.0, "cpu_p95_7d": 55.0, "horas": [{"h": "x"}] * 30}}
        nodo, servicios = N.resumen_para_oracle_json(e, {"ok": True, "codigo": "200", "ms": 120}, 1100)
        self.assertTrue(nodo["vivo"])
        self.assertEqual(len(nodo["horas"]), 24)
        self.assertNotIn("otro", nodo["guardian"])
        self.assertEqual([s["nombre"] for s in servicios], ["caddy", "bitnet-publico"])
        self.assertNotIn("140-1-2-3", str(servicios))

    def test_avisa_solo_cuando_cambia(self):
        verde = {"vivo": True, "guardian": {"t": 1, "ok": True, "sha": "a", "pasos": []}}
        rojo = {"vivo": True, "guardian": {"t": 2, "ok": False, "sha": "b", "asunto": "x",
                                           "pasos": [{"paso": "tsc", "ok": False}]}}
        self.assertIsNone(N.aviso_de_cambio(verde, verde))
        self.assertIn("ROJO", N.aviso_de_cambio(verde, rojo))
        self.assertIn("tsc", N.aviso_de_cambio(verde, rojo))
        self.assertIn("dejado de latir", N.aviso_de_cambio(verde, {"vivo": False}))
        self.assertIsNone(N.aviso_de_cambio(None, {"vivo": False}))


class Integracion(unittest.TestCase):
    """Los dos archivos compartidos que leen el nodo: medios y la comprobación de la cuenta."""

    def test_medios_ve_el_nodo_vivo_como_listo(self):
        import medios_disponibles as M

        datos = {"vinculada": True, "region": "mx-queretaro-1",
                 "instancias": [{"nombre": "starseed-a1", "forma": "VM.Standard.A1.Flex", "estado": "RUNNING"}],
                 "nodo": {"vivo": True, "latido": 1_000_000.0, "fase": "guardian",
                          "guardian": {"t": 999_000.0, "ok": True}}}
        d = M.clasificar_oracle(datos, {"medios": {}}, 1_000_000.0 + 1200)
        self.assertEqual(d["estado"], "listo")
        self.assertIn("nodo de MetaGenesis vivo", d["detalle"])
        self.assertIn("verde", d["detalle"])
        # Un latido de hace más de 45 min ya no vale.
        self.assertEqual(M.clasificar_oracle(datos, {"medios": {}}, 1_000_000.0 + 3000)["estado"], "usable")

    def test_comprobar_la_cuenta_no_borra_el_nodo(self):
        import oracle_nube as O

        doc = O._publico({"vinculada": True, "instancias": [], "nodo": {"vivo": True, "latido": 1},
                          "servicios": [{"nombre": "bitnet", "ok": True, "activo": "active", "ms": 3, "t": "x",
                                         "titulo": "BitNet", "detalle": "salud 200"}]})
        self.assertEqual(doc["nodo"], {"vivo": True, "latido": 1})
        self.assertEqual(doc["servicios"][0]["activo"], "active")
        self.assertNotIn("url", doc["servicios"][0])


if __name__ == "__main__":
    unittest.main()
