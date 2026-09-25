"""Opus para los directores: topes, pausa por límite, sin clave de API y sin claves en el prompt.

Nunca llama a la CLI de verdad: `correr` es un doble que devuelve lo que diría `claude`.
"""
import json, os, sys, tempfile, time, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import opus_director as od
import veredictos as vd

AHORA = time.mktime(time.strptime("2026-09-25 12:00", "%Y-%m-%d %H:%M"))


def doble(respuesta, rc=0, sesion=True, vistos=None):
    def correr(args, segundos):
        if vistos is not None:
            vistos.append(args)
        if args[1:3] == ["auth", "status"]:
            return 0, json.dumps({"loggedIn": sesion})
        return rc, json.dumps(respuesta)
    return correr


class OpusDirector(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        od.USO = os.path.join(self.dir, "uso.json")
        self._ej = od.ejecutable
        od.ejecutable = lambda: "/usr/local/bin/claude"

    def tearDown(self):
        od.ejecutable = self._ej

    def test_consulta_anota_uso_y_devuelve_el_modelo(self):
        r = od.consultar("¿?", "contexto", ahora=AHORA, correr=doble(
            {"result": "vale", "usage": {"input_tokens": 10, "output_tokens": 5},
             "modelUsage": {"claude-opus-5-5": {}}}))
        self.assertEqual(r["texto"], "vale")
        self.assertEqual(r["modelo"], "claude-opus-5-5")
        self.assertEqual(r["tokens"], 15)
        self.assertIn("1 consultas", od.resumen_uso(AHORA))

    def test_el_tope_del_dia_corta_sin_llamar(self):
        json.dump({"por_dia": {"2026-09-25": od.TOPE_DIA}}, open(od.USO, "w"))
        vistos = []
        self.assertIsNone(od.consultar("¿?", ahora=AHORA, correr=doble({"result": "x"}, vistos=vistos)))
        self.assertEqual(vistos, [])

    def test_un_aviso_de_limite_pausa_tres_horas(self):
        od.consultar("¿?", ahora=AHORA, correr=doble({"is_error": True, "result": "Claude usage limit reached"}))
        ok, motivo = od.disponible(AHORA + 60, correr=doble({}))
        self.assertFalse(ok)
        self.assertIn("pausa", motivo)
        self.assertTrue(od.disponible(AHORA + od.PAUSA_LIMITE_S + 1, correr=doble({}))[0])

    def test_sin_sesion_no_hay_opus(self):
        self.assertFalse(od.disponible(AHORA, correr=doble({}, sesion=False))[0])

    def test_las_claves_no_salen_de_la_mac(self):
        vistos = []
        od.consultar("¿?", "clave sk-or-v1-abcdefghijklmnop y ghp_abcdefghijklmnopqrstu", ahora=AHORA,
                     correr=doble({"result": "ok"}, vistos=vistos))
        prompt = vistos[-1][vistos[-1].index("-p") + 1]
        self.assertNotIn("sk-or-v1-abcdefghijklmnop", prompt)
        self.assertNotIn("ghp_abcdefghijklmnopqrstu", prompt)
        self.assertIn("--disallowedTools", vistos[-1])

    def test_el_hijo_no_hereda_la_clave_de_api(self):
        os.environ["ANTHROPIC_API_KEY"] = "x"
        try:
            self.assertNotIn("ANTHROPIC_API_KEY", od._entorno())
        finally:
            del os.environ["ANTHROPIC_API_KEY"]


class VeredictosConOpus(unittest.TestCase):
    def test_sin_jev_escala_a_opus_y_lo_recuerda(self):
        memo = os.path.join(tempfile.mkdtemp(), "memo.json")
        llamadas = []

        def consultar(pregunta, contexto):
            llamadas.append(contexto)
            return {"texto": '{"opcion": "reintentar_con_cambio", "cambio": "usa el tipo X", "motivo": "tipos"}',
                    "modelo": "claude-opus-5-5"}

        opus = lambda *a: vd.preguntar_a_opus(*a, consultar=consultar, memo_ruta=memo)
        prog = {"X1": {"estado": "fallo_tsc", "nota": "tipos rojos"}}
        filas = vd.veredictos(prog, {"X1": {"archivos": ["a.ts"]}}, "", leer_log=lambda t: "",
                              jev_disponible=False, opus=opus)
        self.assertEqual(filas[0]["fuente"], "opus")
        self.assertEqual(filas[0]["cambio"], "usa el tipo X")
        vd.veredictos(prog, {"X1": {"archivos": ["a.ts"]}}, "", leer_log=lambda t: "", jev_disponible=False, opus=opus)
        self.assertEqual(len(llamadas), 1)  # la segunda vez sale del memo

    def test_el_tope_por_pasada_limita_las_consultas(self):
        vistos = []
        opus = lambda *a: vistos.append(a[0]) or None
        prog = {"A%d" % i: {"estado": "fallo_tests", "nota": ""} for i in range(5)}
        fichas = {k: {"archivos": ["a.ts"]} for k in prog}
        vd.veredictos(prog, fichas, "", leer_log=lambda t: "", jev_disponible=False, opus=opus, opus_tope=2)
        self.assertEqual(len(vistos), 2)


if __name__ == "__main__":
    unittest.main()
