# -*- coding: utf-8 -*-
"""Pruebas del CLI del carril de alta capacidad en la nube (ola 1022B).

Sin red y sin `claude` real: el lanzador, `git ls-remote`, el progreso y el registro se inyectan.
"""
import importlib.util
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timezone

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)

import alta_capacidad_nube_logica as L  # noqa: E402

_spec = importlib.util.spec_from_file_location(
    "alta_capacidad_nube_cli", os.path.join(AQUI, "alta-capacidad-nube.py"))
A = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(A)

VENCE = "2099-01-01T00:00:00+00:00"
AHORA = datetime(2026, 10, 22, 12, 0, tzinfo=timezone.utc).timestamp()
PLANTILLA = "Ola: {ID} · Carril en la nube\nFecha: {FECHA}\nArchivos: {ARCHIVOS}\n{PROMPT}"
SALIDA = ("\x1b[>4m Created cloud session: Canal P2P\r\n"
          "View: https://claude.ai/code/session_01HW1xkHMRPYXUF5bjHiWxyd?from=cli&m=0")


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.olas = os.path.join(self.tmp.name, "starseed_memory_root", "olas")
        os.makedirs(self.olas)
        self.briefs = os.path.join(self.tmp.name, "briefs")
        self.tarea = {"id": "ALT1022B", "titulo": "CLI del carril",
                      "archivos": ["a.ts", "b.py"], "prompt": "Haz {ID} sin tocar {OTRA}"}
        self._cola("cola-1.json", self.tarea)

    def _cola(self, nombre, tarea):
        with open(os.path.join(self.olas, nombre), "w", encoding="utf-8") as f:
            json.dump({"tareas": [tarea]}, f)

    def _credito(self, restante=250.0):
        return {"total_usd": 250.0, "restante_usd": restante, "vence": VENCE}

    def _vivo(self):
        return {"ALT1022B": {"estado": "reasignada", "medio": "claude-nube"}}

    def _lanzar(self, **extra):
        datos = dict(ahora=AHORA, fecha="20261022", raiz=self.tmp.name,
                     credito=self._credito(), registro={"sesiones": []}, progreso={},
                     marcar=lambda c: None, briefs_dir=self.briefs, plantilla=PLANTILLA)
        datos.update(extra)
        return A.lanzar(["ALT1022B"], **datos)


class Lanzar(Base):
    def test_cupo_agotado_no_lanza_ni_marca(self):
        llamadas = []
        res = self._lanzar(credito=self._credito(5.0),
                           marcar=lambda c: llamadas.append(c),
                           lanzador=lambda *a: llamadas.append("lanza"))
        self.assertEqual(res[0]["accion"], "sin_cupo")
        self.assertIn("reserva", res[0]["motivo"])
        self.assertEqual(llamadas, [])
        self.assertFalse(os.path.exists(os.path.join(self.briefs, "ALT1022B.md")))

    def test_lanzamiento_feliz_anota_y_marca(self):
        marcas, guardados, ordenes = [], [], []

        def lanzador(orden, log, teclas):
            ordenes.append(orden)
            with open(log, "w", encoding="utf-8") as f:
                f.write(SALIDA)
            return None, None

        registro = {"sesiones": []}
        res = self._lanzar(registro=registro, espera_s=0, lanzador=lanzador,
                           marcar=lambda c: marcas.append(c),
                           guardar_registro=lambda r: guardados.append(r))
        self.assertEqual(res[0]["accion"], "lanzada")
        self.assertEqual(ordenes[0][:4], ["claude", "--model", "claude-opus-5-5", "--cloud"])
        self.assertTrue(marcas[0]["ALT1022B"]["estado"] == "reasignada")
        self.assertEqual(marcas[0]["ALT1022B"]["medio"], "claude-nube")
        self.assertEqual(registro["sesiones"][0]["sesion"], "session_01HW1xkHMRPYXUF5bjHiWxyd")
        self.assertEqual(registro["sesiones"][0]["rama_pedida"], "nube/cc-20261022/ola/ALT1022B")
        self.assertTrue(guardados)
        self.assertTrue(os.path.exists(os.path.join(self.briefs, "ALT1022B.md")))

    def test_salida_sin_sesion_devuelve_a_pendiente(self):
        marcas, registro = [], {"sesiones": []}

        def lanzador(orden, log, teclas):
            with open(log, "w", encoding="utf-8") as f:
                f.write("Created cloud session: a medias, sin View")
            return None, None

        res = self._lanzar(registro=registro, espera_s=0, lanzador=lanzador,
                           marcar=lambda c: marcas.append(c))
        self.assertEqual(res[0]["accion"], "sin_sesion")
        self.assertEqual([m["ALT1022B"]["estado"] for m in marcas], ["reasignada", "pendiente"])
        self.assertEqual(registro["sesiones"], [])

    def test_seco_no_lanza_ni_marca_pero_escribe_el_brief(self):
        res = self._lanzar(seco=True, lanzador=lambda *a: 1 / 0, marcar=lambda c: 1 / 0)
        self.assertEqual(res[0]["accion"], "seco")
        self.assertEqual(res[0]["rama"], "nube/cc-20261022/ola/ALT1022B")
        self.assertTrue(os.path.exists(os.path.join(self.briefs, "ALT1022B.md")))

    def test_fallo_al_lanzar_devuelve_a_pendiente(self):
        marcas = []

        def lanzador(orden, log, teclas):
            raise FileNotFoundError("no hay claude")

        res = self._lanzar(lanzador=lanzador, marcar=lambda c: marcas.append(c))
        self.assertEqual(res[0]["accion"], "error")
        self.assertIn("no hay claude", res[0]["motivo"])
        self.assertEqual([m["ALT1022B"]["estado"] for m in marcas], ["reasignada", "pendiente"])

    def test_modelo_invalido_no_marca_la_tarea(self):
        marcas = []
        res = self._lanzar(modelo="-cloud", marcar=lambda c: marcas.append(c),
                           lanzador=lambda *a: 1 / 0)
        self.assertEqual(res[0]["accion"], "error")
        self.assertEqual(marcas, [])

    def test_no_pasa_del_tope_de_tres_sesiones_vivas(self):
        tareas = [self.tarea, dict(self.tarea, id="X1"), dict(self.tarea, id="X2")]
        with open(os.path.join(self.olas, "cola-3.json"), "w", encoding="utf-8") as f:
            json.dump({"tareas": tareas}, f)
        registro = {"sesiones": [{"tarea": "A", "t": 1.0}, {"tarea": "B", "t": 1.0}]}
        progreso = {"A": {"estado": "reasignada", "medio": "claude-nube"},
                    "B": {"estado": "reasignada", "medio": "claude-nube"}}

        def lanzador(orden, log, teclas):
            with open(log, "w", encoding="utf-8") as f:
                f.write(SALIDA)
            return None, None

        res = A.lanzar(["ALT1022B", "X1", "X2"], ahora=AHORA, fecha="20261022",
                       raiz=self.tmp.name, credito=self._credito(), registro=registro,
                       progreso=progreso, marcar=lambda c: None, lanzador=lanzador,
                       espera_s=0, briefs_dir=self.briefs, plantilla=PLANTILLA)
        self.assertEqual([r["accion"] for r in res], ["lanzada", "sin_cupo", "sin_cupo"])

    def test_sin_tarea_lo_dice(self):
        res = A.lanzar(["NOEXISTE"], ahora=AHORA, fecha="20261022", raiz=self.tmp.name,
                       credito=self._credito(), registro={"sesiones": []}, progreso={},
                       marcar=lambda c: None, briefs_dir=self.briefs, plantilla=PLANTILLA)
        self.assertEqual(res[0]["accion"], "sin_tarea")

    def test_busca_la_cola_mas_reciente(self):
        otra = dict(self.tarea, titulo="la nueva")
        self._cola("cola-2.json", otra)
        tarea, ruta = A.buscar_tarea("ALT1022B", self.tmp.name)
        self.assertEqual(tarea["titulo"], "la nueva")
        self.assertTrue(ruta.endswith("cola-2.json"))


class Seguir(Base):
    def _registro(self, t=AHORA, url="https://claude.ai/code/session_abc"):
        return {"sesiones": [{"tarea": "ALT1022B", "sesion": "session_abc", "url": url,
                              "rama_pedida": "nube/cc-20261022/ola/ALT1022B",
                              "modelo": "claude-opus-5-5", "t": t}]}

    def _seguir(self, **extra):
        datos = dict(ahora=AHORA, registro=self._registro(), progreso=self._vivo(),
                     ramas=set(), marcar=lambda c: None,
                     guardar_registro=lambda r: None, traer=lambda: 0)
        datos.update(extra)
        return A.seguir_carril(True, **datos)

    def test_trae_pasa_a_pendiente_y_corre_traer_nube_una_vez(self):
        marcas, traidas = [], []
        res = self._seguir(ramas={"nube/cc-20261022/ola/ALT1022B"},
                           marcar=lambda c: marcas.append(c),
                           traer=lambda: traidas.append(1) or 0)
        self.assertEqual(res[0]["accion"], "traer")
        self.assertEqual(marcas[0]["ALT1022B"]["estado"], "pendiente")
        self.assertEqual(marcas[0]["ALT1022B"]["medio"], "")
        self.assertEqual(len(traidas), 1)
        self.assertEqual(res[-1]["accion"], "traer_nube")

    def test_devuelve_tras_la_gracia_con_la_nota_y_la_url(self):
        marcas, traidas = [], []
        res = self._seguir(registro=self._registro(t=AHORA - 9 * 3600.0),
                           marcar=lambda c: marcas.append(c),
                           traer=lambda: traidas.append(1) or 0)
        self.assertEqual(res[0]["accion"], "devolver")
        nota = marcas[0]["ALT1022B"]["nota"]
        self.assertIn("devuelta del carril en la nube: sin rama tras 8 h", nota)
        self.assertIn("https://claude.ai/code/session_abc", nota)
        self.assertEqual(traidas, [])

    def test_olvidar_quita_la_sesion_del_registro(self):
        guardados = []
        registro = self._registro()
        res = self._seguir(registro=registro, progreso={"ALT1022B": {"estado": "pendiente"}},
                           guardar_registro=lambda r: guardados.append(r))
        self.assertEqual(res[0]["accion"], "olvidar")
        self.assertEqual(registro["sesiones"], [])
        self.assertEqual(len(guardados), 1)

    def test_sin_aplicar_solo_informa(self):
        marcas, traidas = [], []
        registro = self._registro()
        res = A.seguir_carril(False, ahora=AHORA, registro=registro, progreso=self._vivo(),
                              ramas={"nube/cc-20261022/ola/ALT1022B"},
                              marcar=lambda c: marcas.append(c),
                              guardar_registro=lambda r: None,
                              traer=lambda: traidas.append(1) or 0)
        self.assertEqual(res[0]["accion"], "traer")
        self.assertEqual(marcas, [])
        self.assertEqual(traidas, [])
        self.assertEqual(len(registro["sesiones"]), 1)


class Ver(Base):
    def test_ver_json_da_presupuesto_y_sesiones_vivas(self):
        import io
        from contextlib import redirect_stdout
        buf = io.StringIO()
        with redirect_stdout(buf):
            datos = A.ver(True, ahora=AHORA, credito=self._credito(), registro={
                "sesiones": [{"tarea": "ALT1022B", "url": "https://claude.ai/code/session_abc",
                              "t": AHORA}],
            }, progreso=self._vivo())
        self.assertGreater(datos["presupuesto_hoy"], 0)
        self.assertEqual(datos["sesiones_vivas"], 1)
        self.assertEqual(datos["sesiones"][0]["url"], "https://claude.ai/code/session_abc")
        self.assertIn("reasignada", datos["sesiones"][0]["estado"])
        buf = io.StringIO()
        with redirect_stdout(buf):
            A.ver(False, ahora=AHORA, credito=self._credito(), registro={"sesiones": []},
                  progreso={})
        self.assertIn("Sesiones vivas: 0", buf.getvalue())


class Logica(unittest.TestCase):
    def test_cupo_vencido_y_sin_vence(self):
        self.assertFalse(L.cupo_nube({"restante_usd": 250}, AHORA, 0)[0])
        se_lanza, motivo, presupuesto = L.cupo_nube(
            {"restante_usd": 250, "vence": "2020-01-01T00:00:00+00:00"}, AHORA, 0)
        self.assertFalse(se_lanza)
        self.assertEqual(presupuesto, 0.0)
        self.assertIn("venció", motivo)

    def test_presupuesto_con_13_dias_y_medio_dia(self):
        trece = AHORA + 13 * 86400.0
        vence = datetime.fromtimestamp(trece, timezone.utc).isoformat()
        _, _, presupuesto = L.cupo_nube({"restante_usd": 250, "vence": vence}, AHORA, 0)
        self.assertAlmostEqual(presupuesto, 240.0 / 13.0, places=6)
        medio = datetime.fromtimestamp(AHORA + 0.5 * 86400.0, timezone.utc).isoformat()
        _, _, presupuesto = L.cupo_nube({"restante_usd": 250, "vence": medio}, AHORA, 0)
        self.assertAlmostEqual(presupuesto, 240.0, places=6)

    def test_tope_de_sesiones_vivas(self):
        credito = {"restante_usd": 250, "vence": VENCE}
        self.assertFalse(L.cupo_nube(credito, AHORA, 3)[0])
        self.assertTrue(L.cupo_nube(credito, AHORA, 3)[1].startswith("ya hay 3"))
        self.assertTrue(L.cupo_nube(credito, AHORA, 2)[0])

    def test_orden_cli_y_rechazos(self):
        self.assertEqual(L.orden_cli("claude-opus-5-5", "carril"),
                         ["claude", "--model", "claude-opus-5-5", "--cloud", "carril"])
        for modelo, descripcion in (("-cloud", "algo"), ("m", ""), ("m", "   ")):
            with self.assertRaises(ValueError):
                L.orden_cli(modelo, descripcion)

    def test_brief_conserva_las_llaves_del_prompt(self):
        tarea = {"id": "ALT1022A", "titulo": "Carril", "archivos": ["x.ts", "y.py"],
                 "prompt": "Haz {ID} con {FECHA} y {PROMPT}"}
        salida = L.brief(PLANTILLA, tarea, "20261022")
        self.assertTrue(salida.startswith("Ola: ALT1022A · Carril en la nube"))
        self.assertIn("Archivos: x.ts, y.py", salida)
        self.assertTrue(salida.endswith("Haz {ID} con {FECHA} y {PROMPT}"))

    def test_sesion_de_salida_con_ansi_y_sin_view(self):
        self.assertEqual(L.sesion_de_salida(SALIDA), {
            "sesion": "session_01HW1xkHMRPYXUF5bjHiWxyd",
            "url": "https://claude.ai/code/session_01HW1xkHMRPYXUF5bjHiWxyd",
            "titulo": "Canal P2P"})
        self.assertIsNone(L.sesion_de_salida("\x1b[>4m sin nada útil\r\notra línea"))

    def test_seguir_en_sus_cuatro_salidas_y_sesiones_vivas(self):
        progreso = {"ALT1022B": {"estado": "reasignada", "medio": "claude-nube"}}
        registro = {"sesiones": [{"tarea": "ALT1022B", "rama_pedida": "nube/cc-1/ola/ALT1022B",
                                  "t": AHORA}]}
        self.assertEqual(L.seguir(registro, {"nube/cc-1/ola/ALT1022B"}, progreso, AHORA),
                         {"ALT1022B": "traer"})
        self.assertEqual(L.seguir(registro, set(), progreso, AHORA), {"ALT1022B": "esperar"})
        self.assertEqual(L.seguir(registro, set(), progreso, AHORA + 9 * 3600.0),
                         {"ALT1022B": "devolver"})
        self.assertEqual(L.seguir(registro, set(), {}, AHORA), {"ALT1022B": "olvidar"})
        self.assertEqual(L.sesiones_vivas(registro, progreso), 1)
        self.assertEqual(L.sesiones_vivas({}, progreso), 0)


if __name__ == "__main__":
    unittest.main()
