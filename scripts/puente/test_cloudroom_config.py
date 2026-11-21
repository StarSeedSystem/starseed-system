"""Pruebas de `cloudroom_config` (CAP1119): configuración y prueba de Cloudroom, sin room-cli ni red.

Todo pasa por funciones puras con datos inyectados; solo `cargar`/`guardar` tocan disco en un
directorio temporal.
"""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cloudroom_config as C  # noqa: E402

SONDA_OK = {"estado": "usable", "detalle": "cuenta conectada · 2 hilo(s) abierto(s)"}
PI_OK = {
    "modelos": ["nvidia/z-ai/glm-5.3", "xkiro/qwen/qwen3-coder-plus:free"],
    "claves": {"nvidia": "NVIDIA_API_KEY", "xkiro": "XKIRO_API_KEY"},
}


def _ruta(contenido=None):
    tmp = tempfile.mkdtemp()
    ruta = os.path.join(tmp, "cloudroom-config.json")
    if contenido is not None:
        with open(ruta, "w", encoding="utf-8") as fh:
            fh.write(contenido if isinstance(contenido, str) else json.dumps(contenido))
    return ruta


class Configuracion(unittest.TestCase):
    def test_sin_archivo_usa_defaults_sin_avisos(self):
        cfg, avisos = C.cargar(_ruta())
        self.assertEqual(cfg, C.DEFAULTS)
        self.assertEqual(avisos, [])

    def test_json_roto_usa_defaults_y_avisa(self):
        cfg, avisos = C.cargar(_ruta("{ esto no es json"))
        self.assertEqual(cfg, C.DEFAULTS)
        self.assertEqual(len(avisos), 1)
        self.assertIn("JSON", avisos[0])

    def test_fusion_parcial_aplica_lo_valido(self):
        cfg, avisos = C.cargar(_ruta({"activo": True, "max_vivos": 2, "tope_dia": 4}))
        self.assertTrue(cfg["activo"])
        self.assertEqual(cfg["max_vivos"], 2)
        self.assertEqual(cfg["tope_dia"], 4)
        self.assertEqual(avisos, [])

    def test_valor_fuera_de_rango_se_descarta_y_avisa(self):
        cfg, avisos = C.cargar(_ruta({"max_vivos": 99, "tope_dia": -1, "activo": "sí"}))
        self.assertEqual(cfg["max_vivos"], C.DEFAULTS["max_vivos"])
        self.assertEqual(cfg["tope_dia"], C.DEFAULTS["tope_dia"])
        self.assertFalse(cfg["activo"])
        self.assertEqual(len(avisos), 3)

    def test_clave_desconocida_se_ignora(self):
        cfg, avisos = C.cargar(_ruta({"no_existe": 42}))
        self.assertNotIn("no_existe", cfg)
        self.assertEqual(cfg, C.DEFAULTS)
        self.assertEqual(avisos, [])

    def test_activar_y_desactivar_no_mutan_el_original(self):
        base = dict(C.DEFAULTS, activo=False)
        activo = C.activar(base)
        self.assertTrue(activo["activo"])
        self.assertFalse(base["activo"])
        self.assertFalse(C.desactivar(activo)["activo"])

    def test_guardar_valida_y_hace_ida_y_vuelta(self):
        ruta = _ruta()
        cfg = dict(C.DEFAULTS, activo=True, max_vivos=2)
        self.assertEqual(C.guardar(cfg, ruta), ruta)
        leido, avisos = C.cargar(ruta)
        self.assertTrue(leido["activo"])
        self.assertEqual(leido["max_vivos"], 2)
        self.assertEqual(avisos, [])
        with self.assertRaises(ValueError):
            C.guardar(dict(C.DEFAULTS, max_vivos=99), ruta)


class Prueba(unittest.TestCase):
    def _cfg(self, **extras):
        return dict(C.DEFAULTS, activo=True, **extras)

    def test_apagado(self):
        r = C.evaluar(dict(C.DEFAULTS, activo=False), SONDA_OK, PI_OK, cli=True)
        self.assertEqual(r["estado"], "apagado")
        self.assertFalse(r["activo"])
        self.assertIn("activar", r["siguiente"])

    def test_sin_cli(self):
        r = C.evaluar(self._cfg(), SONDA_OK, PI_OK, cli=False)
        self.assertEqual(r["estado"], "sin_cli")
        self.assertIn("Cloudroom", r["siguiente"])

    def test_requiere_alex(self):
        sonda = {"estado": "requiere_alex", "detalle": "sin iniciar sesión"}
        r = C.evaluar(self._cfg(), sonda, PI_OK, cli=True)
        self.assertEqual(r["estado"], "requiere_alex")
        self.assertFalse(r["activo"])

    def test_usable_queda_activo(self):
        r = C.evaluar(self._cfg(), SONDA_OK, PI_OK, cli=True)
        self.assertEqual(r["estado"], "activo")
        self.assertTrue(r["activo"])
        self.assertEqual(r["problemas"], [])

    def test_sin_modelos_declarados_queda_incompleto(self):
        r = C.evaluar(self._cfg(), SONDA_OK, {"modelos": []}, cli=True)
        self.assertEqual(r["estado"], "incompleto")
        self.assertTrue(any("modelo" in p for p in r["problemas"]))

    def test_clave_que_no_esta_en_la_nube_se_nombra_sin_valor(self):
        r = C.evaluar(self._cfg(), SONDA_OK, PI_OK, claves_nube={"NVIDIA_API_KEY"}, cli=True)
        self.assertEqual(r["estado"], "incompleto")
        self.assertTrue(any("XKIRO_API_KEY" in p for p in r["problemas"]))
        self.assertFalse(any("=" in p for p in r["problemas"]))

    def test_prueba_lista_lo_que_falta(self):
        comprobaciones = C.prueba(self._cfg(), SONDA_OK, PI_OK, cli=True)
        self.assertTrue(all(c["ok"] for c in comprobaciones))
        ids = [c["id"] for c in comprobaciones]
        self.assertEqual(ids[:3], ["config", "activo", "cli"])
        self.assertIn("modelos", ids)

    def test_texto_es_legible(self):
        r = C.evaluar(self._cfg(), SONDA_OK, PI_OK, cli=True)
        lineas = C.texto(r)
        self.assertIn("activo", lineas.lower())
        self.assertIn("Cloudroom", lineas)


if __name__ == "__main__":
    unittest.main()
