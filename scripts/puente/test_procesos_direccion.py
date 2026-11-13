"""Pruebas de `procesos_direccion.py` (MED1113A) y de cómo «Comprobar ahora» coteja a los agentes de la dirección."""
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import comprobar_medidor as CM  # noqa: E402
import procesos_direccion as P  # noqa: E402

AHORA = 1_794_550_000.0


class Clasificar(unittest.TestCase):
    def test_activo_con_senal_reciente_y_su_fuente(self):
        e = P.clasificar({}, {"latido": AHORA - 3600, "cambios en su árbol": AHORA - 120}, None, AHORA)
        self.assertEqual((e["estado"], e["senal"]), ("activo", "cambios en su árbol"))

    def test_en_silencio_desde_la_ultima_senal_no_activo_ni_desaparecido(self):
        e = P.clasificar({}, {"latido": AHORA - 50 * 60, "commits en su árbol": AHORA - 40 * 60}, None, AHORA)
        self.assertEqual(e["estado"], "en-silencio")
        self.assertEqual(e["cuando"], AHORA - 40 * 60)

    def test_el_limite_es_vida_min(self):
        self.assertEqual(P.clasificar({}, {"latido": AHORA - P.VIDA_MIN * 60}, None, AHORA)["estado"], "activo")
        self.assertEqual(P.clasificar({}, {"latido": AHORA - P.VIDA_MIN * 60 - 1}, None, AHORA)["estado"], "en-silencio")

    def test_sin_ninguna_senal_es_silencio_sin_hora(self):
        e = P.clasificar({}, {"latido": None}, None, AHORA)
        self.assertEqual((e["estado"], e["cuando"]), ("en-silencio", None))

    def test_marcador_y_cierre_ganan_a_la_senal(self):
        self.assertEqual(P.clasificar({}, {"latido": AHORA}, AHORA - 60, AHORA)["estado"], "terminado")
        e = P.clasificar({"cerrado": "2026-11-13T00:00:00-06:00", "cierre": "cancelado"}, {"latido": AHORA}, None, AHORA)
        self.assertEqual((e["estado"], e["por"]), ("cancelado", "cierre explícito"))

    def test_terminados_viejos_dejan_de_verse(self):
        self.assertTrue(P.visible({"estado": "terminado", "cuando": AHORA - 3600}, AHORA))
        self.assertFalse(P.visible({"estado": "terminado", "cuando": AHORA - 13 * 3600}, AHORA))
        self.assertTrue(P.visible({"estado": "en-silencio", "cuando": AHORA - 99 * 3600}, AHORA))


class Textos(unittest.TestCase):
    def test_limpiar_quita_rutas(self):
        self.assertEqual(P.limpiar("ver /Users/alex/x.txt ya"), "ver [ruta] ya")

    def test_titulos(self):
        self.assertEqual(P.titulo_de_asunto("GEN1113A", "GEN1113A: la puerta de chats"), "la puerta de chats")
        self.assertIsNone(P.titulo_de_asunto("GEN1113A", "LLA1113B: otra tarea"))
        informe = "# X · informe\n\n## Qué se hizo\n- arreglé los medidores\n"
        self.assertEqual(P.titulo_de_informe(informe), "arreglé los medidores")

    def test_virgulilla(self):
        self.assertEqual(P.con_virgulilla("/home/a/Documents/t", "/home/a"), "~/Documents/t")
        self.assertEqual(P.con_virgulilla("/otra/t", "/home/a"), "[fuera de la carpeta personal]")


class Disco(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="direccion-pruebas-")
        self.fichas = os.path.join(self.tmp, "procesos")
        self.trabajo = os.path.join(self.tmp, "opus1031")
        self.arboles = os.path.join(self.tmp, "arboles")
        os.makedirs(self.trabajo)
        os.makedirs(self.arboles)
        self.llamadas = []
        self._carril = P._carril
        P._carril = lambda *a: (self.llamadas.append(a), (True, "ok"))[1]

    def tearDown(self):
        P._carril = self._carril

    def test_abrir_latido_cerrar_y_estado(self):
        f = P.abrir("MED9", "Medidores", modelo="claude-opus-5-5", carpeta=self.fichas, arboles=self.arboles)
        self.assertFalse(f["relevable"])
        P.latido("MED9", fase="esperando la puerta", carpeta=self.fichas)
        r = P.estado(self.fichas, self.trabajo)
        self.assertEqual([(p["id"], p["estado"], p["fase"]) for p in r["procesos"]], [("MED9", "activo", "esperando la puerta")])
        P.cerrar("MED9", carpeta=self.fichas)
        self.assertEqual(P.estado(self.fichas, self.trabajo)["procesos"][0]["estado"], "terminado")
        self.assertEqual(self.llamadas, [], "un proceso no relevable nunca toca el carril de Claude")

    def test_silencio_medido_a_otra_hora(self):
        P.abrir("X1", "algo", carpeta=self.fichas, arboles=self.arboles)
        r = P.estado(self.fichas, self.trabajo, ahora=time.time() + 2 * 3600)
        p = r["procesos"][0]
        self.assertEqual(p["estado"], "en-silencio")
        self.assertIsNotNone(p["silencioDesdeMs"])

    def test_marcador_listo_termina(self):
        P.abrir("X2", "algo", carpeta=self.fichas, arboles=self.arboles)
        open(os.path.join(self.trabajo, "X2.listo"), "w").close()
        p = P.estado(self.fichas, self.trabajo)["procesos"][0]
        self.assertEqual((p["estado"], p["porque"]), ("terminado", "marcador .listo"))

    def test_la_carpeta_de_trabajo_es_senal(self):
        P.abrir("X3", "algo", carpeta=self.fichas, arboles=self.arboles)
        f = P.leer_ficha("X3", self.fichas)
        f["desde"] = f["latido"] = "2026-01-01T00:00:00+00:00"
        P.guardar_ficha(f, self.fichas)
        os.makedirs(os.path.join(self.trabajo, "x3"))
        open(os.path.join(self.trabajo, "x3", "vitest.log"), "w").close()
        p = P.estado(self.fichas, self.trabajo)["procesos"][0]
        self.assertEqual((p["estado"], p["senal"]), ("activo", "su carpeta de trabajo"))

    def test_relevable_solo_con_encargo_y_entonces_va_al_carril(self):
        with self.assertRaises(ValueError):
            P.abrir("R1", "algo", relevable=True, carpeta=self.fichas, arboles=self.arboles)
        prompt = os.path.join(self.tmp, "encargo.md")
        with open(prompt, "w") as fp:
            fp.write("haz X")
        f = P.abrir("R1", "algo", relevable=True, prompt=prompt, carpeta=self.fichas, arboles=self.arboles)
        self.assertTrue(f["relevable"])
        self.assertEqual(self.llamadas[0][:2], ("registrar", "--json"))
        P.latido("R1", carpeta=self.fichas)
        P.cerrar("R1", carpeta=self.fichas)
        self.assertEqual([c[0] for c in self.llamadas], ["registrar", "latido", "cerrar"])
        # la ficha nunca guarda el encargo
        self.assertNotIn("haz X", json.dumps(P.leer_ficha("R1", self.fichas)))

    def test_id_invalido(self):
        with self.assertRaises(ValueError):
            P.abrir("../malo", "x", carpeta=self.fichas, arboles=self.arboles)

    def test_descubrir_registra_arboles_con_actividad_y_titulo_del_commit(self):
        arbol = os.path.join(self.arboles, "OPUS1106-ABC1")
        os.makedirs(arbol)
        env = dict(os.environ, GIT_AUTHOR_NAME="t", GIT_AUTHOR_EMAIL="t@t", GIT_COMMITTER_NAME="t", GIT_COMMITTER_EMAIL="t@t")
        subprocess.run(["git", "init", "-q", arbol], check=True, env=env)
        open(os.path.join(arbol, "a.txt"), "w").close()
        subprocess.run(["git", "-C", arbol, "add", "a.txt"], check=True, env=env)
        subprocess.run(["git", "-C", arbol, "commit", "-qm", "ABC1: arreglar la puerta"], check=True, env=env)
        # un árbol creado sobre otra base, sin commit suyo ni cambios: no se registra
        vacio = os.path.join(self.arboles, "OPUS1106-VAC1")
        os.makedirs(vacio)
        subprocess.run(["git", "init", "-q", vacio], check=True, env=env)
        open(os.path.join(vacio, "b.txt"), "w").close()
        subprocess.run(["git", "-C", vacio, "add", "b.txt"], check=True, env=env)
        subprocess.run(["git", "-C", vacio, "commit", "-qm", "SUP9: base de main"], check=True, env=env)
        plan = P.descubrir(12, False, self.fichas, self.arboles, self.trabajo)
        self.assertEqual([(f["id"], f["titulo"]) for f in plan], [("ABC1", "arreglar la puerta")])
        self.assertEqual(P.fichas(self.fichas), [], "sin --aplicar no escribe nada")
        P.descubrir(12, True, self.fichas, self.arboles, self.trabajo)
        p = P.estado(self.fichas, self.trabajo)["procesos"][0]
        self.assertEqual((p["id"], p["estado"], p["rama"]), ("ABC1", "activo", "opus1106/ABC1"))
        self.assertTrue(p["donde"].startswith("~") or p["donde"].startswith("["))


class Comprobacion(unittest.TestCase):
    """«Comprobar ahora» coteja las filas de la dirección con la medida, no con `opencode run` ni con GitHub."""

    FILA = {"id": "MED9 · dirección · claude-opus-5-5 · 12 min", "titulo": "Medidores", "estado": "trabajando",
            "quien": "claude-opus-5-5 · dirección", "etapa": "sin empezar", "porque": "proceso de la dirección"}

    def hechos(self, direccion):
        return {"procesos": {"opencode": [], "codex": [], "escritores_por_tarea": {}}, "agentes_nube": 0,
                "fases": {}, "direccion": direccion}

    def test_coinciden(self):
        detalle = {"resumen": "1 en total · 1 de la dirección", "filas": [self.FILA], "cuenta": 1}
        v = CM.cotejar_agentes("agentes", detalle, self.hechos(["MED9"]))[0]
        self.assertEqual(v["estado"], "vivo", v["detalle"])
        self.assertIn("1 de la dirección", v["detalle"])
        self.assertEqual(CM.agentes_que_dice("agentes", detalle), 1)

    def test_no_coinciden_si_falta_o_sobra(self):
        detalle = {"resumen": "1 en total", "filas": [self.FILA], "cuenta": 1}
        v = CM.cotejar_agentes("agentes", detalle, self.hechos(["MED9", "GEN1"]))[0]
        self.assertEqual(v["estado"], "colgado")
        self.assertIn("GEN1", v["detalle"])

    def test_medidor_en_cero_con_agentes_medidos_es_no_coinciden(self):
        detalle = {"resumen": "ningún agente trabajando", "filas": [], "cuenta": 0}
        v = CM.cotejar_agentes("agentes", detalle, self.hechos(["MED9"]))[0]
        self.assertEqual(v["estado"], "colgado")
        self.assertIn("1 de la dirección", v["detalle"])


if __name__ == "__main__":
    unittest.main()
