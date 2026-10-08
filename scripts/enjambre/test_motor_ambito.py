"""Pruebas sin red del conector de ámbito de Genesis."""

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from motor_ambito import Conector, MAX_PENDIENTE


class Reloj:
    def __init__(self, valor=0):
        self.valor = valor

    def __call__(self):
        return self.valor


class TestConector(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.ruta = str(Path(self.tmp.name) / "pendiente.jsonl")

    def tearDown(self):
        self.tmp.cleanup()

    def test_inactivo_sin_token(self):
        llamadas = []
        with patch.dict(os.environ, {"HOME": self.tmp.name}, clear=True):
            conector = Conector.desde_entorno(self.ruta, llamadas.append)
        conector.anotar_evento({"texto": "nada"})
        conector.anotar_progreso("t1", "pendiente", 0)
        self.assertFalse(conector.activo)
        self.assertFalse(conector.tal_vez_enviar())
        self.assertEqual(conector.recoger_tareas(), [])
        self.assertEqual(llamadas, [])
        self.assertFalse(Path(self.ruta).exists())

    def test_lote_correcto_y_secretos_ocultos(self):
        llamadas = []
        secreto = "sk-" + "x" * 20
        def enviar(url, cabeceras, cuerpo):
            llamadas.append((url, cabeceras, cuerpo))
            return {"ok": True, "cadencia_s": 60}
        conector = Conector("https://ejemplo.supabase.co", "publica", "motor", self.ruta, enviar)
        for indice in range(205):
            conector.anotar_evento({"t": indice, "tipo": "paso", "texto": secreto})
        conector.anotar_progreso("PT1", "en_curso", 0.5)
        conector.anotar_latido({"t": 1, "estado": "vivo", "agentes": 1, "en_curso": ["PT1"]})
        conector.anotar_medidores({"detalle": "TOKEN_API=" + secreto})
        self.assertTrue(conector.tal_vez_enviar())
        url, cabeceras, cuerpo = llamadas[0]
        lote = cuerpo["p_lote"]
        self.assertTrue(url.endswith("/rest/v1/rpc/mando_motor_reportar"))
        self.assertEqual(cabeceras["Authorization"], "Bearer publica")
        self.assertEqual(set(lote), {"version", "motor_id", "ambito_id", "eventos", "progreso", "latido", "medidores"})
        self.assertEqual((lote["version"], len(lote["eventos"]), len(conector.eventos)), (1, 200, 5))
        self.assertNotIn(secreto, json.dumps(lote))

    def test_respeta_cadencia_del_servidor(self):
        reloj, llamadas = Reloj(), []
        def enviar(*argumentos):
            llamadas.append(argumentos)
            return {"ok": True, "cadencia_s": 120}
        conector = Conector("https://s.co", "k", "t", self.ruta, enviar, reloj)
        self.assertTrue(conector.tal_vez_enviar())
        reloj.valor = 119
        self.assertFalse(conector.tal_vez_enviar())
        reloj.valor = 120
        self.assertTrue(conector.tal_vez_enviar())
        self.assertEqual(len(llamadas), 2)

    def test_sin_red_acota_y_reenvia_en_orden(self):
        reloj = Reloj()
        grandes = [{"marca": i, "relleno": "x" * 900_000} for i in range(6)]
        Path(self.ruta).write_text("".join(json.dumps(x) + "\n" for x in grandes), encoding="utf-8")
        conector = Conector("https://s.co", "k", "t", self.ruta,
                            lambda *_: (_ for _ in ()).throw(OSError("sin red")), reloj)
        conector.anotar_evento({"t": 1, "tipo": "paso", "texto": "nuevo"})
        self.assertFalse(conector.tal_vez_enviar())
        self.assertLessEqual(Path(self.ruta).stat().st_size, MAX_PENDIENTE)
        self.assertEqual(conector.proximo_envio, 30)
        reloj.valor = 30
        self.assertFalse(conector.tal_vez_enviar())
        self.assertEqual(conector.proximo_envio, 90)
        enviados = []
        conector.enviar = lambda _u, _c, cuerpo: enviados.append(cuerpo["p_lote"]) or {"ok": True}
        reloj.valor = 90
        self.assertTrue(conector.tal_vez_enviar())
        marcas = [x["marca"] for x in enviados if "marca" in x]
        self.assertEqual(marcas, sorted(marcas))
        self.assertGreater(marcas[0], 0)
        textos = [e["texto"] for lote in enviados for e in lote.get("eventos", [])]
        self.assertIn("nuevo", textos)

    def test_freno_y_recoger_tareas(self):
        llamadas = []
        def enviar(url, _cabeceras, _cuerpo):
            llamadas.append(url)
            if url.endswith("mando_motor_pendiente"):
                return {"ok": True, "tareas": [{"id": "PT1"}]}
            return {"ok": False, "freno": True}
        conector = Conector("https://s.co", "k", "t", self.ruta, enviar)
        self.assertEqual(conector.recoger_tareas(), [{"id": "PT1"}])
        self.assertTrue(conector.tal_vez_enviar())
        self.assertTrue(conector.frenado)
        self.assertEqual(conector.recoger_tareas(), [])
        self.assertEqual(len(llamadas), 2)


if __name__ == "__main__":
    unittest.main()
