"""produccion_evals: detector de lotes de IA, conjunto dorado y comparación.

Sin red ni archivos reales: los casos se inyectan y `llamar` es siempre falso.
"""

import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import produccion_evals as pe


def _caso(id="c1", entrada="hola mundo", critico=False, props=None, componente="x"):
    return {"id": id, "componente": componente, "entrada": entrada,
            "critico": critico, "propiedades": props or {}}


class TestTocaIa(unittest.TestCase):
    def test_detecta_skills_y_prompts_y_jev(self):
        self.assertTrue(pe.toca_ia(["scripts/hermes/skills/cafe/skill.md"]))
        self.assertTrue(pe.toca_ia(["src/ai/astraura/prompts/base.ts"]))
        self.assertTrue(pe.toca_ia(["scripts/puente/jev_local.py"]))
        self.assertTrue(pe.toca_ia(["scripts/puente/decidir.py"]))
        self.assertTrue(pe.toca_ia(["scripts/puente/contexto_agente.py"]))
        self.assertTrue(pe.toca_ia(["src/lib/aurora/motor.ts"]))
        self.assertTrue(pe.toca_ia(["src/components/astraura/Panel.tsx"]))

    def test_ignora_lo_demas(self):
        self.assertFalse(pe.toca_ia(["src/app/page.tsx", "package.json"]))
        self.assertFalse(pe.toca_ia([]))
        self.assertFalse(pe.toca_ia(["scripts/puente/publicar.py"]))
        self.assertFalse(pe.toca_ia(["src/lib/mando/agentes.ts"]))


class TestEvaluarCaso(unittest.TestCase):
    def test_contiene_y_no_contiene(self):
        caso = _caso(props={"contiene": ["Publicar"], "no_contiene": ["secreto"]})
        fallos, _ = pe.evaluar_caso(caso, "La puerta de publicar está verde")
        self.assertEqual(fallos, [])
        fallos, _ = pe.evaluar_caso(caso, "nada que ver")
        self.assertTrue(any(f.startswith("contiene:") for f in fallos))
        fallos, _ = pe.evaluar_caso(caso, "publicar el secreto")
        self.assertTrue(any(f.startswith("no_contiene:") for f in fallos))

    def test_salida_vacia(self):
        fallos, _ = pe.evaluar_caso(_caso(), "   ")
        self.assertEqual(fallos, ["salida_vacia"])

    def test_max_longitud_e_idioma(self):
        caso = _caso(props={"max_longitud": 5, "idioma": "es"})
        fallos, _ = pe.evaluar_caso(caso, "esto es demasiado largo")
        self.assertIn("max_longitud:5", fallos)
        caso2 = _caso(props={"idioma": "es"})
        fallos, _ = pe.evaluar_caso(caso2, "the quick brown fox jumps over")
        self.assertIn("idioma:es", fallos)

    def test_json_con_claves(self):
        caso = _caso(props={"json_claves": ["respuesta", "probabilidad"]})
        fallos, _ = pe.evaluar_caso(caso, '{"respuesta": "sí", "probabilidad": 0.9}')
        self.assertEqual(fallos, [])
        fallos, _ = pe.evaluar_caso(caso, '{"respuesta": "sí"}')
        self.assertIn("json_claves:probabilidad", fallos)
        fallos, _ = pe.evaluar_caso(caso, "no es json")
        self.assertIn("json_valido", fallos)

    def test_json_con_vallas_de_codigo(self):
        caso = _caso(props={"json_claves": ["a"]})
        fallos, _ = pe.evaluar_caso(caso, '```json\n{"a": 1}\n```')
        self.assertEqual(fallos, [])

    def test_nunca_expone_secretos_ni_rutas(self):
        fallos, _ = pe.evaluar_caso(_caso(), "usa sk-abcdefghijklmnop1234 listo")
        self.assertIn("expone_secreto", fallos)
        fallos, _ = pe.evaluar_caso(_caso(), "lee /Users/alex/Documents/x y listo")
        self.assertIn("expone_ruta_privada", fallos)

    def test_juicio_nunca_decisivo(self):
        caso = _caso(props={"juicio": "debe ser respetuoso"})
        fallos, avisos = pe.evaluar_caso(caso, "salida correcta y clara", juez=lambda j, e, s: False)
        self.assertEqual(fallos, [])
        self.assertEqual(avisos, ["juicio:desaprueba"])
        fallos, avisos = pe.evaluar_caso(caso, "salida correcta y clara", juez=lambda j, e, s: True)
        self.assertEqual((fallos, avisos), ([], []))
        juez_roto = lambda j, e, s: (_ for _ in ()).throw(RuntimeError("sin red"))
        fallos, avisos = pe.evaluar_caso(caso, "salida correcta y clara", juez=juez_roto)
        self.assertEqual(fallos, [])
        self.assertEqual(avisos, ["juicio:juez_mudo"])


class TestCargarEvaluar(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(
            "w", suffix=".jsonl", encoding="utf-8", delete=False)
        for c in (
            _caso("a", "entiendo", props={"contiene": ["ok"]}),
            _caso("b", "entiendo", critico=True, props={"contiene": ["crítico"]}),
            _caso("c", "entiendo", componente="otro", props={}),
        ):
            self.tmp.write(json.dumps(c, ensure_ascii=False) + "\n")
        self.tmp.close()
        self.addCleanup(os.unlink, self.tmp.name)

    def test_cargar_filtra_por_componente(self):
        casos = pe.cargar_casos(ruta=self.tmp.name, componente="x")
        self.assertEqual([c["id"] for c in casos], ["a", "b"])

    def test_evaluar_con_llamar_falso(self):
        res = pe.evaluar(
            "x", "v9", llamar=lambda entrada: "ok, va bien",
            ruta=self.tmp.name)
        self.assertEqual(res["total"], 2)
        self.assertEqual(res["aprobados"], 1)
        self.assertEqual(res["fallados_criticos"], ["b"])

    def test_excepcion_en_llamar_cuenta_como_fallo(self):
        def explota(entrada):
            raise ConnectionError("no debía pasar en producción")
        res = pe.evaluar("x", "v9", llamar=explota, ruta=self.tmp.name)
        self.assertEqual(res["aprobados"], 0)
        self.assertTrue(all("excepcion_en_llamar" in c["fallos"] for c in res["casos"]))


class TestComparar(unittest.TestCase):
    def _res(self, aprobados, criticos=()):
        casos = [{"id": i, "ok": True, "critico": False, "fallos": [], "avisos": []}
                 for i in range(aprobados)]
        for cid in criticos:
            casos.append({"id": cid, "ok": False, "critico": True,
                          "fallos": ["x"], "avisos": []})
        return {"componente": "c", "version": "v", "total": len(casos),
                "aprobados": aprobados, "fallados": len(criticos),
                "fallados_criticos": list(criticos), "casos": casos}

    def test_pasa_si_mejora_o_iguala(self):
        veredicto = pe.comparar({"c": self._res(3)}, {"c": self._res(2)})
        self.assertFalse(veredicto["bloquea"])
        veredicto = pe.comparar({"c": self._res(2)}, {"c": self._res(2)})
        self.assertFalse(veredicto["bloquea"])

    def test_bloquea_si_aprueba_menos(self):
        veredicto = pe.comparar({"c": self._res(1)}, {"c": self._res(2)})
        self.assertTrue(veredicto["bloquea"])
        self.assertTrue(any("aprueba 1" in m for m in veredicto["motivos"]))

    def test_bloquea_si_falla_critico_aun_sin_regresion(self):
        veredicto = pe.comparar({"c": self._res(3, criticos=("c1",))}, {"c": self._res(2)})
        self.assertTrue(veredicto["bloquea"])
        self.assertTrue(any("c1" in m for m in veredicto["motivos"]))

    def test_componente_nuevo_no_bloquea_por_regresion(self):
        veredicto = pe.comparar({"n": self._res(1)}, {})
        self.assertFalse(veredicto["bloquea"])


class TestConjuntoDoradoReal(unittest.TestCase):
    def test_casos_jsonl_valido_con_12_casos(self):
        casos = pe.cargar_casos()
        self.assertEqual(len(casos), 12)
        for c in casos:
            self.assertIn("entrada", c)
            self.assertIn("componente", c)
            self.assertIn("propiedades", c)
            self.assertIsInstance(c["propiedades"], dict)


if __name__ == "__main__":
    unittest.main()

