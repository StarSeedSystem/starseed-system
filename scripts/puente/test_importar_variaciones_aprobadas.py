import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import importar_variaciones_aprobadas as imp  # noqa: E402

FICHA = {
    "clave": "animacion:respiracion", "nombre": "Respiración lenta", "familia": "animacion", "registro": "nexus",
    "fundamentos": ["anticipación"], "parametros": {"duracionMs": 1200},
    "movimientoReducido": {"duracionMs": 200, "recorridoPx": 0}, "ejemplo": None,
    "referencias": [{"id": "motions", "que_se_aprendio": "curva suave"}],
    "licencia": "AGPL-3.0-or-later (código) · CC-BY-SA-4.0 (diseño)", "estado": "aprobada",
}
AUTOR = "00000000-0000-0000-0000-000000000001"


class Falso:
    """Transporte en memoria: simula PostgREST sin red."""
    def __init__(self, con_os_variaciones: bool, previa: bool = False) -> None:
        self.con, self.previa, self.llamadas = con_os_variaciones, previa, []

    def __call__(self, metodo, url, cuerpo, cab):
        self.llamadas.append((metodo, url, cuerpo))
        if "os_variaciones?select=id&limit=1" in url:
            return (200, []) if self.con else (404, None)
        if metodo == "GET":
            return 200, ([{"id": "abc"}] if self.previa else [])
        return 201, None


class PruebasImportador(unittest.TestCase):
    def test_validar(self) -> None:
        self.assertEqual(imp.validar(FICHA), [])
        malas = imp.validar({**FICHA, "clave": "otra:x", "estado": "propuesta"})
        self.assertEqual(len(malas), 2)
        self.assertTrue(imp.validar({"estado": "aprobada"}))

    def test_cargar_filtra_estado_y_defectos(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            c = Path(d)
            (c / "a.json").write_text(json.dumps(FICHA), encoding="utf-8")
            (c / "b.json").write_text(json.dumps({**FICHA, "estado": "propuesta"}), encoding="utf-8")
            (c / "c.json").write_text(json.dumps({**FICHA, "familia": "nada"}), encoding="utf-8")
            (c / "d.json").write_text("{roto", encoding="utf-8")
            validas, rechazadas = imp.cargar_fichas(c)
        self.assertEqual([f["clave"] for f in validas], ["animacion:respiracion"])
        self.assertEqual(sorted(rechazadas), ["c.json", "d.json"])
        self.assertEqual(imp.cargar_fichas(Path("/no/existe")), ([], {}))

    def test_filas(self) -> None:
        v = imp.a_fila_variacion(FICHA, AUTOR)
        self.assertEqual((v["tipo"], v["titulo"], v["autor"]), ("variacion", "Respiración lenta", AUTOR))
        self.assertEqual(v["payload"]["movimientoReducido"]["recorridoPx"], 0)
        b = imp.a_fila_biblioteca(FICHA, AUTOR)
        self.assertEqual((b["category"], b["folder"], b["owner"]), ("diseno", "animacion", AUTOR))
        self.assertIn("clave:animacion:respiracion", b["tags"])
        self.assertEqual(b["payload"]["referencias"][0]["id"], "motions")

    def test_publicar_elige_tabla_y_es_idempotente(self) -> None:
        h = Falso(True)
        self.assertEqual(imp.publicar(FICHA, "u", {}, AUTOR, False, h), "creada")
        self.assertEqual(h.llamadas[-1][0:2], ("POST", "u/os_variaciones"))
        h = Falso(False, previa=True)
        self.assertEqual(imp.publicar(FICHA, "u", {}, AUTOR, False, h), "actualizada")
        self.assertEqual(h.llamadas[-1][0:2], ("PATCH", "u/library_public_items?id=eq.abc"))

    def test_seco_no_escribe(self) -> None:
        h = Falso(False)
        self.assertEqual(imp.publicar(FICHA, "u", {}, AUTOR, True, h), "seca")
        self.assertTrue(all(m == "GET" for m, _, _ in h.llamadas))


if __name__ == "__main__":
    unittest.main()
