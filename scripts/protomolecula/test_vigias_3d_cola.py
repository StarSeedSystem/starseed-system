#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de vigias_3d_cola.py: la tarea que nace cuando una herramienta publica su código.
Ejecutar: python3 -m pytest -q scripts/protomolecula/test_vigias_3d_cola.py
"""
import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "puente"))
import vigias_3d_cola as co  # noqa: E402
from vigias_3d_datos import VIGIAS, Vigia  # noqa: E402

DIA = datetime(2026, 10, 20, 9, 0, tzinfo=timezone.utc)
POR_ID = {v.id: v for v in VIGIAS}


def obs(repo="Friedrich-M/UniMate", uso="no-comercial", licencia="cc-by-nc-4.0", **mas):
    base = {
        "repo": repo, "repo_origen": "contrato", "licencia_codigo": "MIT", "comando_inferencia": "python -m unimate.inference.sample --exp_dir x",
        "fecha_codigo": "2026-09-06", "modelos_oficiales": ["Linzhan/UniMate"], "modelos_otros": ["a/b"],
        "licencias_pesos": {"Linzhan/UniMate": licencia}, "licencia_pesos": licencia, "uso_pesos": uso,
    }
    base.update(mas)
    return base


class Tarea(unittest.TestCase):
    def test_cada_vigia_produce_una_tarea_de_forma_valida(self):
        for v in VIGIAS:
            t = co.construir_tarea(v, obs(), DIA)
            self.assertEqual(co.errores_de_forma([t]), [], v.id)
            self.assertLessEqual(len(t["archivos"]), 3)
            self.assertEqual(t["depende"], [])
            self.assertIn(v.nombre, t["titulo"])

    def test_ids_distintos_por_herramienta_y_dentro_del_patron_del_orquestador(self):
        ids = [co.id_de_tarea(v) for v in VIGIAS]
        self.assertEqual(ids, ["VGUNIA", "VGFILA", "VGBTCA"])
        self.assertTrue(all(co.PATRON_ID.match(i) for i in ids))

    def test_los_tres_archivos_son_adaptador_prueba_y_leeme_uno_al_lado_del_otro(self):
        t = co.construir_tarea(POR_ID["unimate"], obs(), DIA)
        self.assertEqual(t["archivos"], ["servicios/taller-3d/motores/unimate.py", "servicios/taller-3d/motores/test_unimate.py", "servicios/taller-3d/motores/README-unimate.md"])

    def test_el_prompt_lleva_los_hechos_leidos_y_las_reglas(self):
        p = co.construir_tarea(POR_ID["unimate"], obs(), DIA)["prompt"]
        for trozo in ("https://github.com/Friedrich-M/UniMate", "python -m unimate.inference.sample", "2026-09-06", "Linzhan/UniMate (cc-by-nc-4.0)",
                      "MIT", "pixelartistry.py", "NO se activa por defecto", "no instales paquetes", "motores.ts"):
            self.assertIn(trozo, p)

    def test_licencia_no_leida_se_dice_y_no_se_inventa(self):
        t = co.construir_tarea(POR_ID["filigree3d"], obs(repo="ejemplo/filigree3d", uso=None, licencia=None, modelos_oficiales=[], licencias_pesos={},
                                                         modelos_otros=[], licencia_codigo=None, comando_inferencia=None, fecha_codigo=None), DIA)
        self.assertIn("Pesos oficiales: ninguno confirmado", t["prompt"])
        self.assertIn("`licencia_pesos: null`", t["prompt"])
        self.assertTrue(t["aprobacion"])

    def test_aprobacion_humana_segun_el_uso_de_los_pesos(self):
        for uso, pide in (("no-comercial", True), ("condicionado", True), ("restringido-region", True), (None, True), ("libre", False), ("atribucion", False)):
            t = co.construir_tarea(POR_ID["unimate"], obs(uso=uso), DIA)
            self.assertEqual(t.get("aprobacion", False), pide, uso)
            self.assertEqual(co.necesita_aprobacion(uso), pide, uso)

    def test_reservada_solo_cuando_pide_persona_y_dice_por_que(self):
        for uso, pide in (("no-comercial", True), ("condicionado", True), (None, True), ("libre", False), ("atribucion", False)):
            t = co.construir_tarea(POR_ID["unimate"], obs(uso=uso), DIA)
            self.assertEqual(bool(t.get("reservada")), pide, uso)
        t = co.construir_tarea(POR_ID["unimate"], obs(), DIA)
        self.assertIn("cc-by-nc-4.0", t["reservada"])
        self.assertIn("no-comercial", t["reservada"])
        self.assertIn("RESERVADA PARA ALEX", t["prompt"])
        sin = co.construir_tarea(POR_ID["unimate"], obs(uso="libre", licencia="mit"), DIA)
        self.assertNotIn("RESERVADA PARA ALEX", sin["prompt"])

    def test_una_tarea_reservada_no_entra_en_ninguna_cola_viva(self):
        """La promesa del aviso, de punta a punta: con pesos no libres la tarea queda PROPUESTA, fuera del enjambre.
        El orquestador, la nube y el aprobador solo leen `olas/cola-*.json` (sin bajar a subcarpetas)."""
        with tempfile.TemporaryDirectory() as d:
            olas = Path(d) / "olas"
            r = co.crear_cola(olas, POR_ID["unimate"], obs(), DIA)
            self.assertEqual(r["estado"], "propuesta")
            self.assertEqual(sorted(olas.glob("cola-*.json")), [])  # lo que lee el enjambre: nada
            self.assertEqual([p.name for p in (olas / "propuestas").glob("cola-*.json")], ["cola-1020-vigia-3d-unimate.json"])
            libre = co.crear_cola(Path(d) / "olas2", POR_ID["unimate"], obs(uso="libre", licencia="mit"), DIA)
            self.assertEqual(libre["estado"], "creada")
            self.assertEqual(len(list((Path(d) / "olas2").glob("cola-*.json"))), 1)

    def test_pedir_visto_bueno_sin_reservada_es_un_error_de_forma(self):
        t = co.construir_tarea(POR_ID["unimate"], obs(), DIA)
        t.pop("reservada")
        self.assertTrue([e for e in co.errores_de_forma([t]) if "reservada" in e])

    def test_el_prompt_cabe_en_el_limite_aunque_haya_muchos_derivados(self):
        t = co.construir_tarea(POR_ID["unimate"], obs(modelos_otros=[f"u{i}/m{i}" for i in range(500)]), DIA)
        self.assertEqual(co.errores_de_forma([t]), [])
        self.assertLessEqual(t["prompt"].count("u499/m499"), 0)  # solo se citan los primeros

    def test_errores_de_forma_replica_validarCola(self):
        malas = [
            {"id": "id-con-guiones", "titulo": "x", "prompt": "p" * 30, "archivos": ["a.py"], "depende": []},
            {"id": "OK1", "titulo": "", "prompt": "p" * 30, "archivos": ["a.py"], "depende": []},
            {"id": "OK2", "titulo": "x", "prompt": "corto", "archivos": ["a.py"], "depende": []},
            {"id": "OK3", "titulo": "x", "prompt": "p" * 30, "archivos": ["a", "b", "c", "d"], "depende": []},
            {"id": "OK4", "titulo": "x", "prompt": "p" * 30, "archivos": ["../etc/passwd"], "depende": []},
            {"id": "OK5", "titulo": "x", "prompt": "p" * 30, "archivos": ["a b.py"], "depende": []},
            {"id": "OK6", "titulo": "x", "prompt": "p" * 30, "archivos": ["a.py"], "depende": ["NOEXISTE"]},
            {"id": "OK6", "titulo": "x", "prompt": "p" * 30, "archivos": ["a.py"], "depende": []},
        ]
        for m in malas[:-1]:
            self.assertTrue(co.errores_de_forma([m]), m["id"])
        self.assertEqual(co.errores_de_forma([malas[-1]]), [])
        self.assertTrue(any("repetido" in e for e in co.errores_de_forma(malas[-2:])))
        sola = {"id": "OK7", "titulo": "x", "prompt": "p" * 30, "archivos": ["a.py"], "depende": ["OK7"]}
        self.assertTrue(any("sí misma" in e for e in co.errores_de_forma([sola])))
        a, b = dict(sola, id="OK8", depende=["OK9"]), dict(sola, id="OK9", depende=[])
        self.assertEqual(co.errores_de_forma([a, b]), [])  # depender de una tarea que viene después de la lista es válido


class Cola(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.olas = Path(self._tmp.name) / "starseed_memory_root" / "olas"
        self.addCleanup(self._tmp.cleanup)
        self.v = POR_ID["unimate"]

    def test_crea_el_archivo_como_lista_de_una_tarea_y_no_deja_temporales(self):
        r = co.crear_cola(self.olas, self.v, obs(), DIA)
        self.assertEqual((r["estado"], r["cola"], r["tarea"], r["aprobacion"]), ("propuesta", "1020-vigia-3d-unimate", "VGUNIA", True))
        carpeta = self.olas / "propuestas"
        archivos = sorted(p.name for p in carpeta.iterdir())
        self.assertEqual(archivos, ["cola-1020-vigia-3d-unimate.json"])
        datos = json.loads((carpeta / archivos[0]).read_text("utf-8"))
        self.assertEqual([t["id"] for t in datos], ["VGUNIA"])
        self.assertEqual(co.errores_de_forma(datos), [])
        self.assertTrue(co.PATRON_NOMBRE.match(r["cola"]))

    def test_es_idempotente_la_segunda_vez_no_crea_nada(self):
        co.crear_cola(self.olas, self.v, obs(), DIA)
        r = co.crear_cola(self.olas, self.v, obs(), DIA)
        # La propuesta ya escrita no se duplica: se vuelve a ofrecer con su ruta para dar otra vez la orden.
        self.assertEqual((r["estado"], r["escrita"], r["ya_estaba"]), ("propuesta", False, True))
        r2 = co.crear_cola(self.olas, self.v, obs(), datetime(2026, 10, 25, tzinfo=timezone.utc))  # otro día: otro nombre, mismo id
        self.assertEqual((r2["estado"], r2["cola"]), ("propuesta", "1020-vigia-3d-unimate"))
        self.assertEqual(len(list((self.olas / "propuestas").iterdir())), 1)
        # Encolada por Alex (movida a olas/), ya no se ofrece: consta como existente.
        import subprocess
        subprocess.run(co.orden_encolar(r["ruta"]), shell=True, check=True, cwd=tempfile.gettempdir())
        self.assertEqual([p.name for p in self.olas.glob("cola-*.json")], ["cola-1020-vigia-3d-unimate.json"])
        self.assertEqual(co.crear_cola(self.olas, self.v, obs(), DIA)["estado"], "ya-existe")

    def test_la_orden_de_encolar_lleva_rutas_absolutas_y_entrecomilladas(self):
        orden = co.orden_encolar("/tmp/mi carpeta/olas/propuestas/cola-1020-x.json")
        self.assertEqual(orden, "mv -n '/tmp/mi carpeta/olas/propuestas/cola-1020-x.json' '/tmp/mi carpeta/olas'/")

    def test_un_id_que_ya_vive_en_otra_cola_o_en_colas_fuente_no_se_repite(self):
        self.olas.mkdir(parents=True)
        (self.olas / "cola-otra.json").write_text(json.dumps([{"id": "VGUNIA", "titulo": "t", "prompt": "p" * 30, "archivos": ["a.py"]}]), "utf-8")
        self.assertEqual(co.crear_cola(self.olas, self.v, obs(), DIA)["estado"], "ya-existe")
        (self.olas / "cola-otra.json").unlink()
        fuente = self.olas.parent / "colas-fuente"
        fuente.mkdir()
        (fuente / "cola-retirada.json").write_text(json.dumps([{"id": "VGUNIA"}]), "utf-8")
        self.assertEqual(co.crear_cola(self.olas, self.v, obs(), DIA)["estado"], "ya-existe")

    def test_un_id_recordado_por_el_estado_del_vigia_tampoco_se_repite(self):
        r = co.crear_cola(self.olas, self.v, obs(), DIA, ya_conocidas={"VGUNIA"})
        self.assertEqual(r["estado"], "ya-existe")
        self.assertFalse(self.olas.exists())

    def test_nunca_pisa_una_cola_con_ese_nombre(self):
        self.olas.mkdir(parents=True)
        ruta = self.olas / "cola-1020-vigia-3d-unimate.json"
        ruta.write_text("[]", "utf-8")
        r = co.crear_cola(self.olas, self.v, obs(), DIA)
        self.assertEqual(r["estado"], "ya-existe")
        self.assertEqual(ruta.read_text("utf-8"), "[]")

    def test_archivos_corruptos_o_que_no_son_listas_no_rompen_la_busqueda(self):
        self.olas.mkdir(parents=True)
        (self.olas / "cola-rota.json").write_text("{no es json", "utf-8")
        (self.olas / "control-x.json").write_text('{"orden": "reasignar"}', "utf-8")
        self.assertEqual(co.crear_cola(self.olas, self.v, obs(uso="libre", licencia="mit"), DIA)["estado"], "creada")

    def test_escribir_false_calcula_sin_tocar_el_disco(self):
        r = co.crear_cola(self.olas, self.v, obs(), DIA, escribir=False)
        self.assertEqual((r["estado"], r["escrita"]), ("propuesta", False))
        self.assertFalse(self.olas.exists())

    def test_una_tarea_que_no_cumple_la_forma_se_rechaza_con_motivo(self):
        raro = Vigia("raro", "Raro", "animar", "1.1", None, None, (), (), "servicios/taller 3d/raro.py", "x")
        r = co.crear_cola(self.olas, raro, obs(), DIA)
        self.assertEqual(r["estado"], "invalida")
        self.assertIn("ruta no permitida", r["motivo"])
        self.assertFalse(self.olas.exists())

    def test_el_nombre_lleva_la_fecha_y_la_herramienta(self):
        self.assertEqual(co.nombre_de_cola(POR_ID["btc3d"], datetime(2026, 12, 3)), "1203-vigia-3d-btc3d")


if __name__ == "__main__":
    unittest.main()
