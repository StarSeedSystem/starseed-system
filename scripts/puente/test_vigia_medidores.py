# -*- coding: utf-8 -*-
"""El vigía de medidores: qué situaciones reconoce y cuál es su remedio.

La noche del 22 el orquestador estuvo 123 minutos repitiendo «esperando aprobación» sobre
una tarea inventada por una prueba, con dos trabajadores parados. Todo estaba a la vista
en los medidores y nadie los miraba.
"""
import unittest

import vigia_medidores as V


def agente(id_, estado="escribiendo", etapa="escribiendo", desde="2 min"):
    return {"id": id_, "estado": estado, "etapa": etapa, "desde": desde}


def medidores(agentes=None, listas=None, contenedores_resumen=""):
    return {
        "agentes": {"filas": agentes or []},
        "listas": {"filas": listas or []},
        "contenedores": {"resumen": contenedores_resumen},
    }


class AprobacionEterna(unittest.TestCase):
    def test_un_agente_esperando_visto_bueno_demasiado_se_suelta(self):
        m = medidores(agentes=[agente("tReintento", etapa="esperando aprobación", desde="123 min")])
        p = V.diagnosticar(m)
        self.assertEqual(len(p), 1)
        self.assertEqual(p[0]["tipo"], "aprobacion_eterna")
        self.assertEqual(p[0]["remedio"], "soltar_aprobacion")
        self.assertIn("123", p[0]["porque"])

    def test_esperar_un_rato_razonable_no_es_problema(self):
        m = medidores(agentes=[agente("X1", etapa="esperando aprobación", desde="4 min")])
        self.assertEqual(V.diagnosticar(m), [])


class AgenteCallado(unittest.TestCase):
    def test_callado_mucho_rato_se_reorganiza(self):
        m = medidores(agentes=[agente("A1", estado="callado", desde="40 min")])
        p = V.diagnosticar(m)
        self.assertEqual(p[0]["tipo"], "agente_callado")
        self.assertEqual(p[0]["remedio"], "reorganizar")

    def test_callado_poco_rato_se_deja_en_paz(self):
        # El orquestador ya corta por bytes antes; esto es la red de después.
        m = medidores(agentes=[agente("A1", estado="callado", desde="6 min")])
        self.assertEqual(V.diagnosticar(m), [])

    def test_un_agente_escribiendo_nunca_se_toca(self):
        m = medidores(agentes=[agente("A1", desde="200 min")])
        self.assertEqual(V.diagnosticar(m), [])


class CadenaRota(unittest.TestCase):
    def test_si_ninguna_se_puede_coger_se_avisa_con_nombres(self):
        # El caso de Alex: «LISTAS PARA TRABAJAR 7» y ninguna ejecutable.
        listas = [{"id": i, "estado": "espera a otra tarea"} for i in ("RM5", "RM6", "RM7")]
        p = V.diagnosticar(medidores(agentes=[agente("A1")], listas=listas))
        roto = [x for x in p if x["tipo"] == "cadena_rota"]
        self.assertEqual(len(roto), 1)
        self.assertIn("RM5", roto[0]["quien"])
        self.assertEqual(roto[0]["remedio"], "avisar_cadena_rota")

    def test_con_alguna_libre_no_hay_cadena_rota(self):
        listas = [{"id": "A1", "estado": "lista"}, {"id": "B1", "estado": "espera a otra tarea"}]
        p = V.diagnosticar(medidores(agentes=[agente("X")], listas=listas))
        self.assertEqual([x for x in p if x["tipo"] == "cadena_rota"], [])

    def test_sin_tareas_definidas_no_se_inventa_un_problema(self):
        self.assertEqual(V.diagnosticar(medidores(agentes=[agente("X")])), [])


class TrabajoSinNadie(unittest.TestCase):
    def test_tareas_listas_y_cero_agentes_arranca_el_enjambre(self):
        listas = [{"id": "A1", "estado": "lista"}]
        p = V.diagnosticar(medidores(agentes=[], listas=listas))
        tipos = [x["tipo"] for x in p]
        self.assertIn("trabajo_sin_nadie", tipos)

    def test_cero_agentes_y_cero_trabajo_no_es_un_problema(self):
        # La Mac en reposo es un estado correcto, no una avería.
        self.assertEqual(V.diagnosticar(medidores(agentes=[], listas=[])), [])


class NubeOciosa(unittest.TestCase):
    def test_atraso_y_sitio_libre_despliega(self):
        listas = [{"id": "A1", "estado": "lista"}]
        p = V.diagnosticar(medidores(agentes=[agente("X")], listas=listas,
                                     contenedores_resumen="0 trabajando · 12 libre(s) de 12"))
        self.assertIn("desplegar_nube", [x["remedio"] for x in p])

    def test_si_la_nube_no_tiene_trabajo_que_coger_no_es_ociosa(self):
        listas = [{"id": "A1", "estado": "lista"}]
        p = V.diagnosticar(medidores(agentes=[agente("X")], listas=listas,
                                     contenedores_resumen="4 trabajando · 13 libre(s) de 17"),
                           nube_sin_hueco_porque="la nube está en su tope de jobs a la vez")
        self.assertNotIn("desplegar_nube", [x["remedio"] for x in p])

    def test_lo_que_midio_buscar_capacidad(self):
        import time
        ahora = time.time()
        visto = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ahora - 60))
        tope = {"visto": visto, "hechas": [], "resumen": "Busqué\n· Nube (GitHub Actions): 3 job(s) en marcha"
                " · 0 tarea(s) elegible(s) · ya hay 3 job(s) en marcha, el tope a la vez"}
        self.assertIn("tope", V.nube_sin_hueco(tope, ahora))
        sin = dict(tope, resumen="· Nube (GitHub Actions): 0 job(s) · 0 tarea(s) elegible(s) · 28 agotadas")
        self.assertIn("no hay tareas", V.nube_sin_hueco(sin, ahora))
        # si acaba de reabrir o lanzar algo, sí había hueco y se vuelve a mirar
        self.assertEqual(V.nube_sin_hueco(dict(sin, hechas=["reabiertas a la nube: X1"]), ahora), "")
        # una medida vieja no vale
        vieja = dict(tope, visto=time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ahora - 3 * 3600)))
        self.assertEqual(V.nube_sin_hueco(vieja, ahora), "")
        self.assertEqual(V.nube_sin_hueco(None, ahora), "")

    def test_sin_sitio_libre_no_se_despliega(self):
        listas = [{"id": "A1", "estado": "lista"}]
        p = V.diagnosticar(medidores(agentes=[agente("X")], listas=listas,
                                     contenedores_resumen="12 trabajando · 0 libre(s) de 12"))
        self.assertNotIn("desplegar_nube", [x["remedio"] for x in p])


class Resumen(unittest.TestCase):
    def test_sin_problemas_lo_dice_claro(self):
        self.assertEqual(V.resumir([]), "todo en orden")

    def test_con_problemas_los_nombra(self):
        texto = V.resumir([{"tipo": "agente_callado", "quien": "A1"}])
        self.assertIn("agente_callado", texto)
        self.assertIn("A1", texto)


class LeerMinutos(unittest.TestCase):
    def test_saca_los_minutos_de_un_texto(self):
        self.assertEqual(V._min_de("123 min"), 123)
        self.assertEqual(V._min_de("2 min"), 2)

    def test_sin_numero_no_revienta(self):
        self.assertEqual(V._min_de(None), 0)
        self.assertEqual(V._min_de("hace un rato"), 0)


class SeRecargaConCodigoNuevo(unittest.TestCase):
    """(OPO1011) El vigía no puede seguir días con el código de cuando arrancó."""

    def test_solo_cuenta_lo_ya_cargado_que_cambio(self):
        antes = {"/p/a.py": (1, 10), "/p/b.py": (2, 20)}
        self.assertEqual(V.codigo_cambiado(antes, dict(antes)), [])
        self.assertEqual(V.codigo_cambiado(antes, {"/p/a.py": (3, 10), "/p/b.py": (2, 20)}), ["/p/a.py"])
        self.assertEqual(V.codigo_cambiado(antes, {"/p/a.py": (1, 10)}), ["/p/b.py"])
        self.assertEqual(V.codigo_cambiado({}, {"/p/a.py": (1, 10)}), [])

    def test_huellas_solo_del_puente(self):
        import os
        import types
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            dentro = os.path.join(d, "mod.py")
            with open(dentro, "w") as f:
                f.write("x = 1\n")
            fuera = types.ModuleType("fuera")
            fuera.__file__ = os.path.join(os.path.dirname(d), "otro.py")
            m = types.ModuleType("mod")
            m.__file__ = dentro
            sin = types.ModuleType("sin")
            h = V.huellas_del_puente({"mod": m, "fuera": fuera, "sin": sin}, directorio=d)
            self.assertEqual(list(h), [os.path.abspath(dentro)])


if __name__ == "__main__":
    unittest.main()


class ElMedidorDeTokensTambienSeVigila(unittest.TestCase):
    """(2026-09-23) Alex: «no funciona la autoverificación, 4 agentes y 0 tokens».

    No funcionaba porque el vigía ni siquiera miraba ese medidor: la contradicción la
    cazaba un humano mirando la pantalla. Aquí se fija que la cace él.
    """

    def _med(self, filas_tokens, resumen="algo", n_agentes=4):
        return {
            "agentes": {"filas": [agente("A%d" % i) for i in range(n_agentes)]},
            "listas": {"filas": []},
            "contenedores": {"resumen": ""},
            "tokens": {"resumen": resumen, "filas": filas_tokens},
        }

    def _tipos(self, med):
        return [p["tipo"] for p in V.diagnosticar(med)]

    def test_agentes_trabajando_y_cero_medido_sin_nadie_nombrado_es_un_problema(self):
        filas = [{"id": "jev", "estado": "en reposo", "etapa": "0.0 tok/s",
                  "porque": "0.0 tok/s de media en el último minuto"}]
        self.assertIn("tokens_ciegos", self._tipos(self._med(filas)))

    def test_si_el_medidor_nombra_a_quien_no_tiene_contador_no_hay_problema(self):
        filas = [
            {"id": "jev", "estado": "en reposo", "etapa": "0.0 tok/s",
             "porque": "0.0 tok/s de media en el último minuto"},
            {"id": "nube-gh", "estado": "trabajando sin contador", "etapa": "4 agente(s)",
             "porque": "GitHub no da el log de un job en marcha"},
        ]
        self.assertNotIn("tokens_ciegos", self._tipos(self._med(filas)))

    def test_con_gasto_medido_en_el_minuto_no_grita_aunque_el_instantaneo_sea_cero(self):
        filas = [{"id": "jev", "estado": "gastando", "etapa": "0.0 tok/s",
                  "porque": "6.5 tok/s de media en el último minuto"}]
        self.assertNotIn("tokens_ciegos", self._tipos(self._med(filas)))

    def test_sin_agentes_no_hay_nada_que_explicar(self):
        filas = [{"id": "jev", "estado": "en reposo", "etapa": "0.0 tok/s", "porque": "0.0 tok/s"}]
        self.assertNotIn("tokens_ciegos", self._tipos(self._med(filas, n_agentes=0)))

    def test_un_medidor_de_tokens_mudo_se_nota(self):
        self.assertIn("tokens_mudos", self._tipos(self._med([], resumen="")))

    def test_sin_medidor_de_tokens_el_vigia_no_inventa_problemas(self):
        med = self._med([])
        med.pop("tokens")
        self.assertEqual(self._tipos(med), [])

    def test_el_remedio_de_los_tokens_ciegos_existe(self):
        self.assertNotEqual(V.aplicar({"remedio": "avisar_tokens_ciegos", "quien": "4"}),
                            "sin remedio conocido")


class LaCifraQueCuentaNoEsSoloLaDelInstante(unittest.TestCase):
    def test_hay_gasto_mira_las_dos_cifras(self):
        self.assertTrue(V._hay_gasto([{"etapa": "0.0 tok/s", "porque": "6.5 tok/s de media"}]))
        self.assertTrue(V._hay_gasto([{"etapa": "12 tok/s", "porque": "0.0 tok/s de media"}]))
        self.assertFalse(V._hay_gasto([{"etapa": "0.0 tok/s", "porque": "0.0 tok/s de media"}]))
        self.assertFalse(V._hay_gasto([]))
        self.assertFalse(V._hay_gasto(None))
