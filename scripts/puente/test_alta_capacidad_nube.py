# -*- coding: utf-8 -*-
"""Pruebas del CLI del carril de alta capacidad en la nube (ALT1022B).

Sin red, sin `claude` real y sin tocar `progreso.json`: se inyectan el lanzador, las ramas del
remoto y la lectura de crédito/registro. El módulo con guiones se carga por ruta, como sus
vecinos `test_analiza_aprobacion_cli.py`.
"""
import datetime
import importlib.util
import io
import json
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch

AQUI = os.path.dirname(os.path.abspath(__file__))
if AQUI not in sys.path:
    sys.path.insert(0, AQUI)

RUTA = os.path.join(AQUI, "alta-capacidad-nube.py")
spec = importlib.util.spec_from_file_location("alta_capacidad_nube", RUTA)
cli = importlib.util.module_from_spec(spec)
sys.modules["alta_capacidad_nube"] = cli
spec.loader.exec_module(cli)

import alta_capacidad_nube_logica as L  # noqa: E402

AHORA = datetime.datetime(2026, 10, 22, 12, 0, tzinfo=datetime.timezone.utc).timestamp()
CREDITO = {"total_usd": 250, "restante_usd": 250, "vence": "2026-11-05T01:59:00-06:00"}
TAREA = {
    "id": "T1",
    "titulo": "Canal P2P",
    "archivos": ["src/a.ts", "src/b.ts"],
    "prompt": "Haz la tarea {ID} sin romper {FECHA}.",
}
SALIDA = ("\x1b[>4m Created cloud session: Canal P2P\r\n"
          "View: https://claude.ai/code/session_01HW1xkHMRPYXUF5bjHiWxyd?from=cli&m=0\r\n")


class Base(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        self.marcas = []
        self.lanzamientos = []
        self.traer_llamado = []
        parches = [
            patch.object(cli, "CARPETA", os.path.join(self.dir.name, "briefs")),
            patch.object(cli, "PLANTILLA", os.path.join(AQUI, "plantillas", "alta-capacidad-nube.md")),
            patch.object(cli, "REGISTRO", os.path.join(self.dir.name, "registro.json")),
            patch.object(cli, "marcar_progreso", self.marcar),
            patch.object(cli, "correr_traer", lambda: self.traer_llamado.append(True)),
        ]
        for p in parches:
            p.start()
            self.addCleanup(p.stop)

    def marcar(self, cambios):
        self.marcas.append(cambios)

    def registro(self, sesiones=None):
        return {"sesiones": sesiones or []}

    def escribir_registro(self, datos):
        with open(cli.REGISTRO, "w", encoding="utf-8") as f:
            json.dump(datos, f)

    def lanzador(self, salida):
        def fake(orden, log, teclas, esperar_s=90):
            self.lanzamientos.append(orden)
            with open(log, "w", encoding="utf-8") as f:
                f.write(salida)
            return salida
        return fake


class LanzarTest(Base):
    def test_cupo_agotado_no_lanza_ni_marca(self):
        with patch.object(cli, "buscar_tarea", return_value=TAREA), \
             patch.object(cli, "leer_credito", return_value=dict(CREDITO, restante_usd=4)), \
             patch.object(cli, "leer_registro", return_value=self.registro()), \
             patch.object(cli, "leer_progreso", return_value={}), \
             patch.object(cli, "lanzar_orden", self.lanzador(SALIDA)):
            lineas = cli.lanzar(["T1"], ahora=AHORA)
        self.assertIn("sin cupo", lineas[0])
        self.assertEqual(self.lanzamientos, [])
        self.assertEqual(self.marcas, [])
        self.assertFalse(os.path.exists(os.path.join(cli.CARPETA, "T1.md")))

    def test_tope_de_sesiones_vivas_no_lanza(self):
        registro = self.registro([{"tarea": "A"}, {"tarea": "B"}, {"tarea": "C"}])
        progreso = {t: {"estado": "reasignada", "medio": "claude-nube"} for t in "ABC"}
        with patch.object(cli, "buscar_tarea", return_value=TAREA), \
             patch.object(cli, "leer_credito", return_value=CREDITO), \
             patch.object(cli, "leer_registro", return_value=registro), \
             patch.object(cli, "leer_progreso", return_value=progreso), \
             patch.object(cli, "lanzar_orden", self.lanzador(SALIDA)):
            lineas = cli.lanzar(["T1"], ahora=AHORA)
        self.assertIn("3 sesiones vivas", lineas[0])
        self.assertEqual(self.lanzamientos, [])
        self.assertEqual(self.marcas, [])

    def test_lanzamiento_feliz_anota_y_marca(self):
        with patch.object(cli, "buscar_tarea", return_value=TAREA), \
             patch.object(cli, "leer_credito", return_value=CREDITO), \
             patch.object(cli, "leer_registro", return_value=self.registro()), \
             patch.object(cli, "leer_progreso", return_value={}), \
             patch.object(cli, "lanzar_orden", self.lanzador(SALIDA)):
            lineas = cli.lanzar(["T1"], ahora=AHORA)
        self.assertIn("session_01HW1xkHMRPYXUF5bjHiWxyd", lineas[0])
        self.assertEqual(self.marcas[0]["T1"]["estado"], "reasignada")
        self.assertEqual(self.marcas[0]["T1"]["medio"], "claude-nube")
        self.assertTrue(os.path.exists(os.path.join(cli.CARPETA, "T1.md")))
        with open(cli.REGISTRO, encoding="utf-8") as f:
            registro = json.load(f)
        sesion = registro["sesiones"][0]
        self.assertEqual(sesion["tarea"], "T1")
        self.assertEqual(sesion["sesion"], "session_01HW1xkHMRPYXUF5bjHiWxyd")
        self.assertEqual(sesion["rama_pedida"], "nube/cc-20261022/ola/T1")
        self.assertEqual(self.lanzamientos[0][:4],
                         ["claude", "--model", "claude-opus-5-5", "--cloud"])

    def test_salida_sin_sesion_devuelve_a_pendiente(self):
        with patch.object(cli, "buscar_tarea", return_value=TAREA), \
             patch.object(cli, "leer_credito", return_value=CREDITO), \
             patch.object(cli, "leer_registro", return_value=self.registro()), \
             patch.object(cli, "leer_progreso", return_value={}), \
             patch.object(cli, "lanzar_orden", self.lanzador("nada de nada")):
            lineas = cli.lanzar(["T1"], ahora=AHORA)
        self.assertIn("vuelve a pendiente", lineas[0])
        self.assertEqual(self.marcas[-1]["T1"]["estado"], "pendiente")
        self.assertFalse(os.path.exists(cli.REGISTRO))

    def test_fallo_del_lanzador_devuelve_a_pendiente(self):
        def revienta(orden, log, teclas, esperar_s=90):
            raise FileNotFoundError("script")

        with patch.object(cli, "buscar_tarea", return_value=TAREA), \
             patch.object(cli, "leer_credito", return_value=CREDITO), \
             patch.object(cli, "leer_registro", return_value=self.registro()), \
             patch.object(cli, "leer_progreso", return_value={}), \
             patch.object(cli, "lanzar_orden", revienta):
            lineas = cli.lanzar(["T1"], ahora=AHORA)
        self.assertIn("no se pudo lanzar", lineas[0])
        self.assertEqual(self.marcas[-1]["T1"]["estado"], "pendiente")

    def test_seco_no_toca_nada(self):
        with patch.object(cli, "buscar_tarea", return_value=TAREA), \
             patch.object(cli, "leer_credito", return_value=CREDITO), \
             patch.object(cli, "leer_registro", return_value=self.registro()), \
             patch.object(cli, "leer_progreso", return_value={}), \
             patch.object(cli, "lanzar_orden", self.lanzador(SALIDA)):
            lineas = cli.lanzar(["T1"], seco=True, ahora=AHORA)
        self.assertIn("seco", lineas[0])
        self.assertEqual(self.lanzamientos, [])
        self.assertEqual(self.marcas, [])
        self.assertFalse(os.path.exists(os.path.join(cli.CARPETA, "T1.md")))
        self.assertFalse(os.path.exists(cli.REGISTRO))


class SeguirTest(Base):
    RAMA = "nube/cc-20261022/ola/T1"

    def setUp(self):
        super().setUp()
        self.registro_datos = self.registro([
            {"tarea": "T1", "sesion": "session_1", "url": "https://claude.ai/code/session_1",
             "rama_pedida": self.RAMA, "t": "2026-10-22T00:00:00Z"},
        ])

    def test_traer_pasa_a_pendiente_y_corre_traer_una_vez(self):
        progreso = {"T1": {"estado": "reasignada", "medio": "claude-nube"}}
        with patch.object(cli, "leer_registro", return_value=self.registro_datos), \
             patch.object(cli, "leer_progreso", return_value=progreso), \
             patch.object(cli, "ramas_remotas", return_value={self.RAMA}):
            lineas = cli.seguir(aplicar=True, ahora=AHORA)
        self.assertIn("traer", lineas[0])
        self.assertEqual(self.marcas[0]["T1"]["estado"], "pendiente")
        self.assertEqual(len(self.traer_llamado), 1)

    def test_sin_aplicar_solo_informa(self):
        progreso = {"T1": {"estado": "reasignada", "medio": "claude-nube"}}
        with patch.object(cli, "leer_registro", return_value=self.registro_datos), \
             patch.object(cli, "leer_progreso", return_value=progreso), \
             patch.object(cli, "ramas_remotas", return_value={self.RAMA}):
            lineas = cli.seguir(aplicar=False, ahora=AHORA)
        self.assertIn("traer", lineas[0])
        self.assertIn("solo se informa", lineas[-1])
        self.assertEqual(self.marcas, [])
        self.assertEqual(self.traer_llamado, [])

    def test_devolver_con_nota_y_url(self):
        progreso = {"T1": {"estado": "reasignada", "medio": "claude-nube"}}
        with patch.object(cli, "leer_registro", return_value=self.registro_datos), \
             patch.object(cli, "leer_progreso", return_value=progreso), \
             patch.object(cli, "ramas_remotas", return_value=set()):
            cli.seguir(aplicar=True, ahora=AHORA, gracia_h=8)
        nota = self.marcas[0]["T1"]["nota"]
        self.assertIn("devuelta del carril en la nube: sin rama tras 8 h", nota)
        self.assertIn("session_1", nota)
        self.assertEqual(self.marcas[0]["T1"]["estado"], "pendiente")

    def test_olvidar_quita_del_registro(self):
        progreso = {"T1": {"estado": "commit", "medio": None}}
        self.escribir_registro(self.registro_datos)
        with patch.object(cli, "leer_registro", return_value=dict(self.registro_datos)), \
             patch.object(cli, "leer_progreso", return_value=progreso), \
             patch.object(cli, "ramas_remotas", return_value=set()):
            lineas = cli.seguir(aplicar=True, ahora=AHORA)
        self.assertIn("olvidar", lineas[0])
        with open(cli.REGISTRO, encoding="utf-8") as f:
            assert json.load(f)["sesiones"] == []


class VerTest(Base):
    def test_ver_json_ensena_credito_presupuesto_y_sesiones(self):
        progreso = {"T1": {"estado": "reasignada", "medio": "claude-nube"}}
        registro = self.registro([
            {"tarea": "T1", "sesion": "session_1", "url": "https://x/session_1",
             "rama_pedida": "nube/cc-20261022/ola/T1", "t": "2026-10-22T10:00:00Z"},
        ])
        with patch.object(cli, "leer_credito", return_value=CREDITO), \
             patch.object(cli, "leer_registro", return_value=registro), \
             patch.object(cli, "leer_progreso", return_value=progreso):
            salida = io.StringIO()
            with redirect_stdout(salida):
                cli.ver(como_json=True, ahora=AHORA)
        datos = json.loads(salida.getvalue())
        self.assertEqual(datos["credito_usd"], 250)
        self.assertGreater(datos["presupuesto_hoy_usd"], 0)
        self.assertEqual(datos["sesiones_vivas"], 1)
        self.assertEqual(datos["sesiones"][0]["url"], "https://x/session_1")
        self.assertTrue(datos["sesiones"][0]["viva"])

    def test_sesion_no_viva_no_cuenta(self):
        progreso = {"T1": {"estado": "pendiente", "medio": None}}
        registro = self.registro([{"tarea": "T1", "url": "https://x/session_1"}])
        with patch.object(cli, "leer_credito", return_value=CREDITO), \
             patch.object(cli, "leer_registro", return_value=registro), \
             patch.object(cli, "leer_progreso", return_value=progreso):
            salida = io.StringIO()
            with redirect_stdout(salida):
                cli.ver(como_json=True, ahora=AHORA)
        datos = json.loads(salida.getvalue())
        self.assertEqual(datos["sesiones_vivas"], 0)


class LogicaTest(unittest.TestCase):
    def test_credito_vencido_o_sin_vence_no_da_cupo(self):
        vencido = dict(CREDITO, vence="2026-10-01T00:00:00Z")
        self.assertFalse(L.cupo_nube(vencido, AHORA, 0)[0])
        sin_vence = {k: v for k, v in CREDITO.items() if k != "vence"}
        self.assertFalse(L.cupo_nube(sin_vence, AHORA, 0)[0])

    def test_presupuesto_reparte_entre_los_dias_que_faltan(self):
        cabe, _, diario = L.cupo_nube(CREDITO, AHORA, 0)
        self.assertTrue(cabe)
        self.assertGreater(diario, 0)
        self.assertLess(diario, 240)

    def test_brief_respeta_las_llaves_del_prompt(self):
        texto = L.brief("ID={ID} FECHA={FECHA} T={TITULO} A={ARCHIVOS}\n{PROMPT}", TAREA, "20261022")
        self.assertIn("ID=T1", texto)
        self.assertIn("FECHA=20261022", texto)
        self.assertIn("Haz la tarea {ID} sin romper {FECHA}.", texto)
        self.assertIn("src/a.ts, src/b.ts", texto)

    def test_sesion_de_salida_limpia_ansi_y_query(self):
        info = L.sesion_de_salida(SALIDA)
        self.assertEqual(info["sesion"], "session_01HW1xkHMRPYXUF5bjHiWxyd")
        self.assertEqual(info["url"], "https://claude.ai/code/session_01HW1xkHMRPYXUF5bjHiWxyd")
        self.assertEqual(info["titulo"], "Canal P2P")
        self.assertIsNone(L.sesion_de_salida("Created cloud session: sin view"))

    def test_orden_rechaza_modelo_que_empieza_por_guion(self):
        with self.assertRaises(ValueError):
            L.orden_cli("-peligroso", "brief")
        with self.assertRaises(ValueError):
            L.orden_cli("claude-opus-5-5", "  ")

    def test_seguir_las_cuatro_salidas(self):
        rama = "nube/cc-20261022/ola/T1"
        registro = {"sesiones": [{"tarea": "T1", "rama_pedida": rama, "t": "2026-10-22T00:00:00Z"}]}
        dentro = {"T1": {"estado": "reasignada", "medio": "claude-nube"}}
        self.assertEqual(L.seguir(registro, {rama}, dentro, AHORA)["T1"], "traer")
        self.assertEqual(L.seguir(registro, set(), dentro, AHORA)["T1"], "devolver")
        reciente = {"sesiones": [{"tarea": "T1", "rama_pedida": rama,
                                  "t": "2026-10-22T10:00:00Z"}]}
        self.assertEqual(L.seguir(reciente, set(), dentro, AHORA)["T1"], "esperar")
        fuera = {"T1": {"estado": "commit", "medio": None}}
        self.assertEqual(L.seguir(registro, {rama}, fuera, AHORA)["T1"], "olvidar")
        self.assertEqual(L.sesiones_vivas(registro, dentro), 1)
        self.assertEqual(L.sesiones_vivas(registro, fuera), 0)


if __name__ == "__main__":
    unittest.main()
