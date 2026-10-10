# -*- coding: utf-8 -*-
"""Pruebas de `puerta_datos.py` (despliegue y medida de la puerta del A1, PDA1010): lo que se puede
probar sin tocar el A1 — el entorno que viaja (nunca la clave de servicio), el paquete (sin
pruebas) y la escritura de ~/.starseed/env (600, con copia, sin repetir variables)."""
import io
import os
import shutil
import sys
import tarfile
import tempfile
import unittest

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import puerta_datos as pd  # noqa: E402


class TestPuertaDatos(unittest.TestCase):
    def test_entorno_del_a1_sin_clave_de_servicio(self):
        env = {"NEXT_PUBLIC_SUPABASE_URL": "https://p.supabase.co", "NEXT_PUBLIC_SUPABASE_ANON_KEY": "anon",
               "SUPABASE_SERVICE_ROLE_KEY": "NO-DEBE-VIAJAR", "PUERTA_LLAVE_REPLICA": "llave"}
        texto = pd.contenido_env_a1(env)
        self.assertIn("SUPABASE_URL=https://p.supabase.co\n", texto)
        self.assertIn("SUPABASE_ANON_KEY=anon\n", texto)
        self.assertIn("PUERTA_LLAVE_REPLICA=llave\n", texto)
        self.assertNotIn("NO-DEBE-VIAJAR", texto)
        self.assertNotIn("SERVICE_ROLE", texto)
        with self.assertRaises(ValueError):
            pd.contenido_env_a1(dict(env, NEXT_PUBLIC_SUPABASE_ANON_KEY="a\nINYECTADA=1"))

    def test_paquete_sin_pruebas(self):
        datos = pd.paquete_tgz()
        with tarfile.open(fileobj=io.BytesIO(datos), mode="r:gz") as t:
            nombres = t.getnames()
        self.assertIn("starseed-puerta-datos/bin/puerta-datos.mjs", nombres)
        self.assertIn("starseed-puerta-datos/deploy/instalar.sh", nombres)
        self.assertIn("starseed-puerta-datos/src/servidor.mjs", nombres)
        self.assertFalse(any("/test/" in n for n in nombres))

    def test_poner_en_env(self):
        d = tempfile.mkdtemp(prefix="pd-env-")
        try:
            ruta = os.path.join(d, "env")
            with open(ruta, "w") as f:
                f.write("A=1\nexport PUERTA_DATOS_URL=https://vieja\n")
            pd.poner_en_env("PUERTA_DATOS_URL", "https://nueva", ruta=ruta)
            pd.poner_en_env("B", "2", ruta=ruta)
            with open(ruta) as f:
                lineas = f.read().splitlines()
            self.assertEqual(lineas, ["A=1", "PUERTA_DATOS_URL=https://nueva", "B=2"])
            self.assertEqual(os.stat(ruta).st_mode & 0o777, 0o600)
            self.assertTrue(os.path.exists(ruta + ".bak-puerta"))
        finally:
            shutil.rmtree(d, ignore_errors=True)

    def test_fichas_con_ambitos_validos(self):
        validos = {"bus", "latidos", "malla", "astraura", "freno", "metricas", "metagenesis", "admin"}
        for rol, (nombre, ambitos) in pd.FICHAS.items():
            self.assertRegex(nombre, r"^[a-z0-9][a-z0-9-]{1,40}$")
            self.assertTrue(set(ambitos.split(",")) <= validos, rol)


if __name__ == "__main__":
    unittest.main()
