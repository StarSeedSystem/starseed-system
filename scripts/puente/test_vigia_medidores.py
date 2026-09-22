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


if __name__ == "__main__":
    unittest.main()
