"""Pruebas puras de scripts/puente/aprobador_logica.py (DSB1010, 2026-10-10).

Casos tomados de lo medido ese día en la Mac (S1010-TU-LL1c, PM1010F2F, XR1010A…).
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import aprobador_logica as L  # noqa: E402

VERDE = {"tid": "PM1010F2F", "estado": "esperando_aprobacion", "minutos": 12, "revisor": "respondio",
         "faltan": [], "puertas_ok": True, "archivos": ["src/lib/protomolecula/convertidores.ts",
                                                        "src/lib/protomolecula/__tests__/convertidores.test.ts"],
         "lineas": 180, "reserva": "", "sucesora": None, "objecion": ""}


def caso(**cambios):
    c = dict(VERDE)
    c.update(cambios)
    return c


JEV_SI = {"respuesta": "si", "p": 0.9, "medio": "local"}
JEV_NO = {"respuesta": "no", "p": 0.91, "medio": "openrouter"}
JEV_NO_FLOJO = {"respuesta": "no", "p": 0.6, "medio": "openrouter"}
JEV_REGLA_NO = {"respuesta": "no", "p": 1.0, "medio": "regla"}


class TestCadena(unittest.TestCase):
    def test_intento_por_letra(self):
        self.assertEqual(L.intento_de_cadena("PM1010F2F"), 1)
        self.assertEqual(L.intento_de_cadena("CNS1010Mb"), 2)
        self.assertEqual(L.intento_de_cadena("S1010-TU-LL1c"), 3)
        self.assertEqual(L.intento_de_cadena("S1010-TU-AST1"), 1)
        self.assertEqual(L.intento_de_cadena("abc"), 1)  # id en minúsculas: no es eslabón


class TestReserva(unittest.TestCase):
    def test_migraciones_claves_y_nativas_son_de_alex(self):
        self.assertIn("migración", L.reserva_para_alex(["supabase/migrations/20261010_x.sql"]))
        self.assertIn("claves", L.reserva_para_alex([".env.local"]))
        self.assertEqual(L.reserva_para_alex([".env.example"]), "")
        self.assertIn("apps nativas", L.reserva_para_alex(["native/src-tauri/tauri.conf.json"]))
        self.assertIn("apps nativas", L.reserva_para_alex([".github/workflows/nativas-release.yml"]))
        self.assertIn("nativa", L.reserva_para_alex(["native/src-tauri/Cargo.toml"]))
        self.assertIn("posible", L.reserva_para_alex(["src/a.ts"], secretos=1))
        self.assertEqual(L.reserva_para_alex(["src/lib/x.ts", ".github/workflows/ci.yml"]), "")

    def test_xr1010a_paquetes_libres_solo_en_package_se_aprueba_solo(self):
        antes = {"dependencies": {"next": "15.5.4"}}
        despues = {"dependencies": {"next": "15.5.4", "@react-three/xr": "6.6.20", "three-mesh-ui": "6.5.4"}}
        deps = L.cambios_de_dependencias(antes, despues)
        self.assertEqual(deps["anadidas"], ["@react-three/xr", "three-mesh-ui"])
        archivos = ["package.json", "package-lock.json", "src/components/xr/shell/__tests__/dependencias.test.ts"]
        libres = {"@react-three/xr": "MIT", "three-mesh-ui": "(MIT OR Apache-2.0)"}
        self.assertEqual(L.reserva_para_alex(archivos, deps, libres), "")
        # …pero una licencia no libre o desconocida va a Alex.
        self.assertIn("licencia", L.reserva_para_alex(archivos, deps, {"@react-three/xr": "MIT"}))
        self.assertIn("licencia", L.reserva_para_alex(archivos, deps, dict(libres, **{"three-mesh-ui": "BUSL-1.1"})))
        # …y añadir paquetes junto con código también.
        self.assertIn("código", L.reserva_para_alex(archivos + ["src/components/xr/shell/xr.tsx"], deps, libres))

    def test_cambiar_o_quitar_dependencias_de_produccion_es_de_alex(self):
        deps = L.cambios_de_dependencias({"dependencies": {"next": "15.5.4", "zod": "3"}},
                                         {"dependencies": {"next": "16.3.8"}})
        self.assertEqual(deps["cambiadas"], ["next"])
        self.assertEqual(deps["quitadas"], ["zod"])
        self.assertIn("producción", L.reserva_para_alex(["package.json", "package-lock.json"], deps, {}))
        self.assertIn("package-lock", L.reserva_para_alex(["package-lock.json"], {}, {}))

    def test_licencias(self):
        for libre in ("MIT", "Apache-2.0", "(MIT OR GPL-3.0)", "BSD-3-Clause", "ISC", "0BSD"):
            self.assertTrue(L.licencia_libre(libre), libre)
        for otra in ("", None, "UNLICENSED", "BUSL-1.1", "SEE LICENSE IN LICENSE", "GPL-3.0"):
            self.assertFalse(L.licencia_libre(otra), otra)


class TestImpacto(unittest.TestCase):
    def test_radio(self):
        self.assertEqual(L.radio_de_impacto(VERDE["archivos"], 180), "bajo")
        self.assertTrue(L.radio_de_impacto(["src/app/layout.tsx"], 4).startswith("alto"))
        self.assertTrue(L.radio_de_impacto(["src/a%d.ts" % i for i in range(7)], 10).startswith("alto"))
        self.assertTrue(L.radio_de_impacto(["src/a.ts"], 900).startswith("alto"))
        self.assertTrue(L.radio_de_impacto(["src/a.ts"], 5, "critical").startswith("alto"))


class TestDecidir(unittest.TestCase):
    def test_fuera_de_la_puerta_o_recien_llegada(self):
        self.assertEqual(L.decidir(caso(estado="fallo_tsc"))["accion"], "nada")
        self.assertEqual(L.decidir(caso(minutos=3))["accion"], "esperar")
        # Una rama suelta (pendiente) no espera minutos: el orquestador ya no la retiene.
        self.assertNotEqual(L.decidir(caso(estado="pendiente_aprobacion", minutos=0))["accion"], "esperar")

    def test_verde_pide_jev_y_se_aprueba_salvo_veto_firme(self):
        d = L.decidir(caso())
        self.assertEqual((d["accion"], d.get("pide_jev")), ("aprobar", True))
        self.assertEqual(L.decidir(caso(jev=JEV_SI))["accion"], "aprobar")
        self.assertEqual(L.decidir(caso(jev=JEV_NO_FLOJO))["accion"], "aprobar")  # p < 0,8: no veta
        self.assertEqual(L.decidir(caso(jev=JEV_REGLA_NO))["accion"], "aprobar")  # la regla no es Jev
        self.assertEqual(L.decidir(caso(jev=JEV_NO))["accion"], "rechazar")

    def test_reservada_nunca_se_aprueba_sola(self):
        d = L.decidir(caso(reserva="trae una migración de base de datos", jev=JEV_SI))
        self.assertEqual(d["accion"], "reservar_alex")
        self.assertIn("migración", d["motivo"])

    def test_sucesora_viva_suelta_el_trabajador(self):
        self.assertEqual(L.decidir(caso(revisor="bloqueante", sucesora="X1d"))["accion"], "liberar")
        self.assertEqual(L.decidir(caso(revisor="bloqueante", sucesora="X1d",
                                        estado="pendiente_aprobacion"))["accion"], "nada")

    def test_otra_copia_de_la_cadena_escribiendo_espera(self):
        d = L.decidir(caso(tid="S1010-TU-LL1c", revisor="bloqueante", estado="pendiente_aprobacion",
                           hermana_en_curso="S1010-TU-LL1b", jev=JEV_SI))
        self.assertEqual(d["accion"], "esperar")
        self.assertIn("S1010-TU-LL1b", d["motivo"])

    def test_sin_puertas_no_se_integra_a_ciegas(self):
        self.assertEqual(L.decidir(caso(puertas_ok=None, jev=JEV_SI))["accion"], "esperar")
        self.assertEqual(L.decidir(caso(puertas_ok=False, jev=JEV_SI))["accion"], "esperar")

    def test_bloqueante_primeros_intentos_los_repara_el_desatascador(self):
        d = L.decidir(caso(tid="CNS1010Mb", revisor="bloqueante", objecion="falta X"))
        self.assertEqual(d["accion"], "esperar")
        self.assertIn("desatascador", d["motivo"])

    def test_rama_suelta_sin_sucesora_no_espera_para_siempre(self):
        c = caso(tid="CNS1010Mb", revisor="bloqueante", estado="pendiente_aprobacion", objecion="x")
        self.assertEqual(L.decidir(dict(c, minutos=10))["accion"], "esperar")
        self.assertEqual(L.decidir(dict(c, minutos=60, jev=JEV_SI))["accion"], "aprobar_con_seguimiento")

    def test_bloqueante_cadena_agotada_entra_con_seguimiento_o_se_rechaza(self):
        ll1c = caso(tid="S1010-TU-LL1c", revisor="bloqueante", estado="pendiente_aprobacion",
                    archivos=["src/lib/llamadas/canal-enlace-local.ts",
                              "src/lib/llamadas/__tests__/canal-enlace-local.test.ts"], lineas=210,
                    objecion="nunca llama a los oyentes de onSuscrito con true cuando el enlace vuelve")
        d = L.decidir(ll1c)
        self.assertEqual((d["accion"], d.get("pide_jev")), ("aprobar_con_seguimiento", True))
        d = L.decidir(dict(ll1c, jev=JEV_SI))
        self.assertEqual(d["accion"], "aprobar_con_seguimiento")
        self.assertIn("onSuscrito", d["objecion"])
        self.assertEqual(L.decidir(dict(ll1c, jev=JEV_NO))["accion"], "rechazar")
        # Impacto alto + objeción sin resolver: no entra, aunque Jev diga que sí.
        alto = dict(ll1c, archivos=["src/app/layout.tsx"], jev=JEV_SI)
        self.assertEqual(L.decidir(alto)["accion"], "rechazar")

    def test_sin_revisor_e_impacto_alto_espera_a_un_revisor(self):
        d = L.decidir(caso(revisor="sin revisor", archivos=["src/a%d.ts" % i for i in range(8)], jev=JEV_SI))
        self.assertEqual(d["accion"], "esperar")
        self.assertEqual(L.decidir(caso(revisor="sin revisor", jev=JEV_SI))["accion"], "aprobar")

    def test_alcance_parcial_es_del_desatascador(self):
        self.assertEqual(L.decidir(caso(faltan=["src/b.ts"]))["accion"], "nada")


class TestSeguimiento(unittest.TestCase):
    def test_tarea_de_seguimiento_lleva_la_objecion_y_no_pide_visto_bueno(self):
        t = L.tarea_seguimiento("S1010-TU-LL1c", {"id": "S1010-TU-LL1c", "titulo": "Canal", "archivos": ["a.ts"],
                                                  "aprobacion": True, "depende_de": ["S1010-TU-LL0"]},
                                "2ecee95a1234567", "nunca llama con true")
        self.assertEqual(t["id"], "S1010-TU-LL1cobj")
        self.assertIn("nunca llama con true", t["prompt"])
        self.assertIn("2ecee95a1234", t["prompt"])
        self.assertEqual(t["depende_de"], [])
        self.assertNotIn("aprobacion", t)

    def test_resumen(self):
        self.assertEqual(L.resumen([{"accion": "aprobar"}, {"accion": "aprobar"}, {"accion": "esperar"}]),
                         {"aprobar": 2, "esperar": 1})


if __name__ == "__main__":
    unittest.main()
