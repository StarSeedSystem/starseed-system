# -*- coding: utf-8 -*-
"""Traer la nube (2026-10-05): traer lo integrado, reparar lo que quedó a medias y preguntar
antes de borrar lo que repararlo sería contraproducente."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import traer_nube as T  # noqa: E402


def c(tipo, nuevo=True, vacio=False):
    return {"tipo": tipo, "nuevo": nuevo, "vacio": vacio}


class TidDeAsunto(unittest.TestCase):
    def test_salvavidas(self):
        self.assertEqual(T.tid_de_asunto("salvavidas · LC1004B: trabajo del agente antes de las puertas (tsc / vitest)"),
                         ("salvavidas", "LC1004B"))

    def test_ola_salta_el_titulo_sin_digitos(self):
        a = "Ola 1005H · Producción: habilidades (Temporal, MCP) · PRD1005L: herramientas MCP del director"
        self.assertEqual(T.tid_de_asunto(a), ("ola", "PRD1005L"))
        b = "Ola 1005Z · Bloqueadas: una sola sección · BLQ1005D: medidor"
        self.assertEqual(T.tid_de_asunto(b), ("ola", "BLQ1005D"))

    def test_ids_con_guion_y_olas_numericas(self):
        self.assertEqual(T.tid_de_asunto("Ola Dream 2026-10-05 · lo que encontró · DR1005-1: Acotar"), ("ola", "DR1005-1"))
        self.assertEqual(T.tid_de_asunto("345 · NE3-1: algo"), ("ola", "NE3-1"))

    def test_reparto_y_otros(self):
        self.assertEqual(T.tid_de_asunto("enjambre: reparto a la nube (GitHub Actions) · cola-nube-1.json")[0], "reparto")
        self.assertEqual(T.tid_de_asunto("SP092916 · Fallo de cupo = sin cupo, con registro"), ("otro", None))


class Decidir(unittest.TestCase):
    def test_en_main_es_superada(self):
        self.assertEqual(T.decidir("X", [c("salvavidas")], True, "fallo", "cola-a.json")[0], "superada")

    def test_decidida_por_otro_camino_es_superada(self):
        for estado in ("sustituida", "descartada", "commit"):
            accion, motivo = T.decidir("X", [c("salvavidas")], False, estado, "cola-a.json")
            self.assertEqual(accion, "superada")
            self.assertIn(estado, motivo)

    def test_propuesta_de_suenos_espera_a_una_persona(self):
        accion, motivo = T.decidir("SP092912", [c("salvavidas")], False, "bloqueada", "cola-suenos-2026-09-29.json")
        self.assertEqual(accion, "superada")
        self.assertIn("persona", motivo)

    def test_integrada_en_la_nube_se_trae(self):
        # Medido: nube/37361406630, PRD1005L con su salvavidas y su commit «Ola …» (vacío).
        commits = [c("salvavidas"), c("ola", nuevo=False, vacio=True)]
        self.assertEqual(T.decidir("PRD1005L", commits, False, "pendiente", "cola-p.json")[0], "traer")

    def test_a_medias_se_repara(self):
        for estado in ("fallo_tests", "bloqueada", "pendiente", None, "sin_cambios", "rechazada"):
            self.assertEqual(T.decidir("LC1004B", [c("salvavidas")], False, estado, "cola-l.json")[0], "reparar")

    def test_no_pisa_lo_que_se_esta_haciendo(self):
        for estado in ("en_curso", "reasignada"):
            self.assertEqual(T.decidir("X", [c("salvavidas")], False, estado, "cola-a.json")[0], "esperar")

    def test_sin_nada_nuevo_es_superada(self):
        self.assertEqual(T.decidir("X", [c("salvavidas", nuevo=False)], False, "fallo", "cola-a.json")[0], "superada")


class ElegirPorTarea(unittest.TestCase):
    def test_una_sola_rama_por_tarea_la_integrada_y_la_mas_nueva(self):
        e = [
            {"rama": "nube/1/ola/LC1004B", "tid": "LC1004B", "accion": "reparar", "motivo": "", "fecha": "2026-10-04 23:57"},
            {"rama": "nube/3/ola/LC1004B", "tid": "LC1004B", "accion": "reparar", "motivo": "", "fecha": "2026-10-05 00:29"},
            {"rama": "nube/2", "tid": "PRD1005L", "accion": "reparar", "motivo": "", "fecha": "2026-10-05 05:49"},
            {"rama": "nube/4", "tid": "PRD1005L", "accion": "traer", "motivo": "", "fecha": "2026-10-05 01:00"},
            {"rama": "nube/5", "tid": "BLQ1005D", "accion": "superada", "motivo": "ya está en main", "fecha": ""},
        ]
        r = {(x["rama"], x["tid"]): x["accion"] for x in T.elegir_por_tarea(e)}
        self.assertEqual(r[("nube/3/ola/LC1004B", "LC1004B")], "reparar")
        self.assertEqual(r[("nube/1/ola/LC1004B", "LC1004B")], "superada")
        self.assertEqual(r[("nube/4", "PRD1005L")], "traer")
        self.assertEqual(r[("nube/2", "PRD1005L")], "superada")
        self.assertEqual(r[("nube/5", "BLQ1005D")], "superada")


class Sucesor(unittest.TestCase):
    def test_base_y_siguiente(self):
        self.assertEqual(T.base_de("LC1004Bc"), "LC1004B")
        self.assertEqual(T.base_de("LC1004B"), "LC1004B")
        self.assertEqual(T.siguiente_id("LC1004B", {"LC1004B"}), "LC1004Bb")
        self.assertEqual(T.siguiente_id("LC1004B", {"LC1004B", "LC1004Bb", "LC1004Bc"}), "LC1004Bd")
        self.assertEqual(T.siguiente_id("SB1004A", {"SB1004A", "SB1004Ab", "OTRA"}), "SB1004Ac")

    def test_tarea_reparacion_continua_desde_la_rama(self):
        original = {"id": "LC1004B", "ola": "Ola 1004L", "titulo": "Límites", "archivos": ["a.ts"],
                    "depende": ["LC1004A"], "prompt": "Haz X.", "estado": "fallo_tests", "modelo": "nim/kimi"}
        t = T.tarea_reparacion(original, "LC1004Bd", "nube/3/ola/LC1004B", ["abc123"], ["a.ts", "b.ts"], "no pasó")
        self.assertEqual(t["id"], "LC1004Bd")
        self.assertEqual(t["depende"], ["LC1004A"])
        self.assertNotIn("estado", t)
        self.assertNotIn("modelo", t)
        self.assertTrue(t["prompt"].startswith("Haz X."))
        self.assertIn("## CONTINÚA DESDE LA NUBE", t["prompt"])
        self.assertIn("git cherry-pick --no-commit abc123", t["prompt"])
        self.assertIn("refs/heads/nube/3/ola/LC1004B", t["prompt"])
        self.assertIn("PROPÓSITO", t["prompt"])
        # Repararla otra vez no apila dos bloques de continuación.
        t2 = T.tarea_reparacion(t, "LC1004Be", "nube/4", ["def"], [], "otra vez")
        self.assertEqual(t2["prompt"].count("## CONTINÚA DESDE LA NUBE"), 1)


class Informe(unittest.TestCase):
    def test_pregunta_antes_de_borrar(self):
        t = T.texto_informe([], [], [{"rama": "nube/1/ola/RDV8", "tid": "RDV8", "motivo": "sustituida"}], [])
        self.assertIn("¿Las borro", t)
        self.assertIn("nube/1/ola/RDV8", t)

    def test_agrupa_por_tarea_y_no_repite_esperas(self):
        sup = [{"rama": "nube/%d/ola/SP092910" % i, "tid": "SP092910", "motivo": "ya figura hecha"} for i in range(3)]
        t = T.texto_informe([{"tid": "X", "rama": "nube/9"}], [], sup,
                            [{"tid": "SB1004A", "motivo": "en curso"}, {"tid": "SB1004A", "motivo": "en curso"}])
        self.assertEqual(t.count("SP092910 ·"), 1)
        self.assertIn("3 ramas", t)
        self.assertEqual(t.count("SB1004A"), 1)

    def test_nada_nuevo_nada_que_decir(self):
        self.assertEqual(T.texto_informe([], [], [], []), "")

    def test_cuenta_lo_traido_y_lo_reparado(self):
        t = T.texto_informe([{"tid": "PRD1005L", "rama": "nube/4"}],
                            [{"tid": "LC1004B", "nuevo": "LC1004Bd", "motivo": "a medias"}], [], [])
        self.assertIn("PRD1005L (nube/4)", t)
        self.assertIn("LC1004B → LC1004Bd", t)


if __name__ == "__main__":
    unittest.main()
