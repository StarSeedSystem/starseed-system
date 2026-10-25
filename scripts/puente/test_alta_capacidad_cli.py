"""Pruebas del CLI del carril de alta capacidad (ALT1021Cd-d1b) — unittest, sin red.

Cada prueba monta un directorio temporal con colas, `progreso.json` y `limites-claude.json`
falsos y se los inyecta al CLI por argumentos (`--olas`, `--progreso`, `--limites`),
como hacen los otros `test_*_cli` del puente. Comprueba el objeto `--json` completo.
"""
from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import os
import sys
import unittest
from datetime import datetime, timedelta, timezone

AQUI = os.path.dirname(os.path.abspath(__file__))
if AQUI not in sys.path:
    sys.path.insert(0, AQUI)

_espec = importlib.util.spec_from_file_location("alta_capacidad_cli", os.path.join(AQUI, "alta-capacidad.py"))
alta_capacidad = importlib.util.module_from_spec(_espec)
_espec.loader.exec_module(alta_capacidad)


def pista(t_min=10.0, sesion=10, semana=20):
    """Lectura de límites fresca y holgada, por defecto."""
    ahora = datetime.now(timezone.utc)
    return {
        "lecturas": [{
            "t": (ahora - timedelta(minutes=t_min)).isoformat(),
            "sesion_pct": sesion, "sesion_reinicio": (ahora + timedelta(hours=5)).isoformat(),
            "semana_pct": semana, "semana_reinicio": (ahora + timedelta(days=3)).isoformat(),
        }],
        "umbral_pct": 90,
    }


class Escriba(unittest.TestCase):
    """Aparato: crea el mundo temporal y corre el CLI."""

    def setUp(self):
        self.tmp = os.path.join(os.environ.get("TEMP", "/tmp"), "alta-capacidad-cli-%d" % os.getpid())
        self.olas = os.path.join(self.tmp, "olas")
        os.makedirs(self.olas, exist_ok=True)
        self.ruta_progreso = os.path.join(self.olas, "progreso.json")
        self.ruta_limites = os.path.join(self.tmp, "limites-claude.json")
        self.escribir(self.ruta_progreso, {})
        self.escribir(self.ruta_limites, pista())

    def tearDown(self):
        for raiz, _dirs, archivos in os.walk(self.tmp, topdown=False):
            for f in archivos:
                os.remove(os.path.join(raiz, f))
            if os.path.isdir(raiz):
                os.rmdir(raiz)

    def escribir(self, ruta, datos):
        with open(ruta, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False)

    def cola(self, nombre, tareas):
        self.escribir(os.path.join(self.olas, nombre), {"tareas": tareas})
        return nombre

    def correr(self, *extra):
        argv = [
            "--olas", self.olas,
            "--progreso", self.ruta_progreso,
            "--limites", self.ruta_limites,
        ] + list(extra)
        salida = io.StringIO()
        with contextlib.redirect_stdout(salida):
            codigo = alta_capacidad.main(argv)
        return codigo, salida.getvalue()

    def json_de(self, *extra):
        codigo, texto = self.correr("--json", *extra)
        self.assertEqual(codigo, 0)
        return json.loads(texto)


class TestJsonBasico(Escriba):
    def test_forma_completa_sin_nada(self):
        datos = self.json_de()
        self.assertEqual(set(datos), {"cupo", "candidatas", "elegidas"})
        self.assertEqual(set(datos["cupo"]), {"ok", "motivo"})
        self.assertEqual(datos["cupo"]["ok"], True)
        self.assertIn("caben", datos["cupo"]["motivo"])
        self.assertEqual(datos["candidatas"], [])
        self.assertEqual(datos["elegidas"], [])

    def test_colas_locales_no_machacan_el_tes_falso(self):
        t = {"id": "ALX1", "titulo": "de fuera", "alta_capacidad": True}
        self.cola("cola-fuente-9999.json", [t])
        datos = self.json_de()
        # Solo entró la cola temporal, no las del repo real: al menos la nuestra está.
        self.assertEqual([c["id"] for c in datos["candidatas"]], ["ALX1"])

    def test_salida_plana(self):
        self.cola("cola-fuente-9999.json", [{"id": "ALX1", "titulo": "X", "alta_capacidad": True}])
        codigo, texto = self.correr()
        self.assertEqual(codigo, 0)
        self.assertIn("Cupo de Claude: sí", texto)
        self.assertIn("ALX1", texto)
        self.assertIn("Elegidas ahora (0 en marcha): ALX1", texto)


class TestCandidatas(Escriba):
    def test_marcada_alta_capacidad_aparece(self):
        self.cola("cola-fuente-9999.json", [{"id": "A1", "titulo": "T", "alta_capacidad": True}])
        datos = self.json_de()
        self.assertEqual([c["id"] for c in datos["candidatas"]], ["A1"])
        self.assertIn("marcada alta_capacidad", datos["candidatas"][0]["motivo"])

    def test_cerrada_fuera(self):
        self.cola("cola-fuente-9999.json", [{"id": "A1", "titulo": "T", "alta_capacidad": True}])
        self.escribir(self.ruta_progreso, {"A1": {"estado": "integrada"}})
        datos = self.json_de()
        self.assertEqual(datos["candidatas"], [])

    def test_pendiente_normal_no_aparece(self):
        self.cola("cola-fuente-9999.json", [{"id": "N1", "titulo": "T"}])
        datos = self.json_de()
        self.assertEqual(datos["candidatas"], [])

    def test_tres_archivos_piden_alta(self):
        self.cola("cola-fuente-9999.json",
                  [{"id": "G1", "titulo": "Grande", "archivos": ["a", "b", "c"]}])
        datos = self.json_de()
        self.assertEqual([c["id"] for c in datos["candidatas"]], ["G1"])
        self.assertIn("3 archivos", datos["candidatas"][0]["motivo"])

    def test_duplicado_en_dos_colas_sale_una_vez(self):
        t = {"id": "A1", "titulo": "T", "alta_capacidad": True}
        self.cola("cola-fuente-9998.json", [t])
        self.cola("cola-fuente-9999.json", [t])
        datos = self.json_de()
        self.assertEqual([c["id"] for c in datos["candidatas"]], ["A1"])

    def test_marcada_primero(self):
        marcada = {"id": "A1", "titulo": "M", "alta_capacidad": True}
        grande = {"id": "G1", "titulo": "Grande", "archivos": ["a", "b", "c"]}
        self.cola("cola-fuente-9999.json", [grande, marcada])
        datos = self.json_de()
        self.assertEqual([c["id"] for c in datos["candidatas"]], ["A1", "G1"])


class TestCupo(Escriba):
    def test_sesion_al_tope_rechaza(self):
        self.escribir(self.ruta_limites, pista(sesion=71))
        datos = self.json_de()
        self.assertFalse(datos["cupo"]["ok"])
        self.assertIn("sesión", datos["cupo"]["motivo"])

    def test_semana_al_tope_rechaza(self):
        self.escribir(self.ruta_limites, pista(semana=81))
        datos = self.json_de()
        self.assertFalse(datos["cupo"]["ok"])
        self.assertIn("semana", datos["cupo"]["motivo"])

    def test_lectura_vieja_rechaza(self):
        self.escribir(self.ruta_limites, pista(t_min=500.0))
        datos = self.json_de()
        self.assertFalse(datos["cupo"]["ok"])
        self.assertIn("desactualizada", datos["cupo"]["motivo"])

    def test_sin_lecturas_rechaza(self):
        self.escribir(self.ruta_limites, {})
        datos = self.json_de()
        self.assertFalse(datos["cupo"]["ok"])
        self.assertIn("sin lectura", datos["cupo"]["motivo"])

    def test_en_marcha_2_rechaza_y_no_elige(self):
        t = {"id": "A1", "titulo": "T", "alta_capacidad": True}
        self.cola("cola-fuente-9999.json", [t])
        datos = self.json_de("--en-marcha", "2")
        self.assertFalse(datos["cupo"]["ok"])
        self.assertEqual(datos["elegidas"], [])

    def test_lectura_holgada_verde(self):
        self.escribir(self.ruta_limites, pista())
        datos = self.json_de()
        self.assertTrue(datos["cupo"]["ok"])


class TestElegidas(Escriba):
    def test_pendiente_se_elige(self):
        t = {"id": "A1", "titulo": "T", "alta_capacidad": True}
        self.cola("cola-fuente-9999.json", [t])
        self.escribir(self.ruta_progreso, {"A1": {"estado": "pendiente"}})
        datos = self.json_de()
        self.assertEqual(datos["elegidas"], ["A1"])

    def test_nada_en_marcha_no_elige(self):
        t = {"id": "A1", "titulo": "T", "alta_capacidad": True}
        self.cola("cola-fuente-9999.json", [t])
        self.escribir(self.ruta_progreso, {"A1": {"estado": "pendiente"}})
        datos = self.json_de("--en-marcha", "2")
        self.assertEqual(datos["elegidas"], [])

    def test_acepta_otros_reintentables(self):
        t = {"id": "F1", "titulo": "T", "alta_capacidad": True}
        self.cola("cola-fuente-9999.json", [t])
        self.escribir(self.ruta_progreso, {"F1": {"estado": "fallo_tests"}})
        datos = self.json_de()
        self.assertEqual(datos["elegidas"], ["F1"])

    def test_respetar_tope_de_dos(self):
        tareas = [{"id": i, "titulo": "T", "alta_capacidad": True} for i in ("A1", "A2", "A3")]
        self.cola("cola-fuente-9999.json", tareas)
        self.escribir(self.ruta_progreso, {i: {"estado": "pendiente"} for i in ("A1", "A2", "A3")})
        datos = self.json_de()
        self.assertEqual(datos["elegidas"], ["A1", "A2"])

    def test_aprobacion_menos_corta(self):
        t = {"id": "A1", "titulo": "T", "alta_capacidad": True}
        self.cola("cola-fuente-9999.json", [t])
        self.escribir(self.ruta_progreso, {"A1": {"estado": "pendiente"}})
        _, texto = self.correr("--en-marcha", "1")
        self.assertIn("Elegidas ahora (1 en marcha)", texto)
        self.assertIn("A1", texto)


if __name__ == "__main__":
    unittest.main()
