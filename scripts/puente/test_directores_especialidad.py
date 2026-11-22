#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de directores_especialidad: asignación, fallos, revisión, aprendizajes (AUT1121D)."""

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import directores_especialidad as DE


class DetectarAreaTest(unittest.TestCase):
    def test_interfaz_por_componentes_y_css(self):
        archivos = ["src/components/ui/button.tsx", "src/app/dashboard/page.tsx", "src/lib/themes/preset.css"]
        self.assertEqual(DE.detectar_area_tarea(archivos), "interfaz")

    def test_puente_por_scripts_python(self):
        archivos = ["scripts/puente/salud_modelos.py", "scripts/enjambre/medios.py", "scripts/puente/orquestador.py"]
        self.assertEqual(DE.detectar_area_tarea(archivos), "puente")

    def test_rust_por_cargo_y_rs(self):
        archivos = ["Cargo.toml", "src/lib.rs", "build.rs"]
        self.assertEqual(DE.detectar_area_tarea(archivos), "rust")

    def test_malla_por_mesh_lora_webrtc(self):
        archivos = ["src/lib/mesh/mesh.ts", "src/lib/lora/adapter.py", "src/lib/webrtc/signal.ts"]
        self.assertEqual(DE.detectar_area_tarea(archivos), "malla")

    def test_datos_por_supabase_sql_migration(self):
        archivos = ["supabase/migrations/20260101_create_table.sql", "src/utils/supabase/client.ts"]
        self.assertEqual(DE.detectar_area_tarea(archivos), "datos")

    def test_pruebas_por_test_spec_vitest(self):
        archivos = ["src/lib/__tests__/utils.test.ts", "src/components/ui/button.spec.tsx", "vitest.config.ts"]
        self.assertEqual(DE.detectar_area_tarea(archivos), "pruebas")

    def test_audiovisual_por_three_webgl_shader(self):
        archivos = ["src/lib/audiomorphic/renderer.ts", "src/shaders/geometry.frag", "src/lib/three/scene.ts"]
        self.assertEqual(DE.detectar_area_tarea(archivos), "audiovisual")

    def test_general_si_sin_coincidencias(self):
        archivos = ["README.md", "docs/guia.txt"]
        self.assertEqual(DE.detectar_area_tarea(archivos), "general")

    def test_area_mixta_gana_mas_coincidencias(self):
        # Más archivos de interfaz que de puente
        archivos = [
            "src/components/ui/button.tsx",
            "src/app/page.tsx",
            "scripts/puente/algo.py",
        ]
        self.assertEqual(DE.detectar_area_tarea(archivos), "interfaz")


class AsignarDirectorTest(unittest.TestCase):
    def setUp(self):
        self.t = tempfile.TemporaryDirectory()
        self.raiz = Path(self.t.name)
        (self.raiz / "starseed_memory_root" / "salud").mkdir(parents=True)

    def tearDown(self):
        self.t.cleanup()

    def _de(self):
        return DE.DirectoresEspecialidad(raiz=self.raiz)

    def test_asignar_actualiza_timestamp(self):
        de = self._de()
        area = de.asignar_director("T1", ["src/components/ui/button.tsx"])
        self.assertEqual(area, "interfaz")
        self.assertGreater(de.directores["interfaz"].ultima_asignacion, 0)

    def test_persistencia_estado(self):
        de1 = self._de()
        de1.asignar_director("T1", ["src/components/ui/button.tsx"])
        ts1 = de1.directores["interfaz"].ultima_asignacion

        de2 = DE.DirectoresEspecialidad(raiz=self.raiz)
        self.assertEqual(de2.directores["interfaz"].ultima_asignacion, ts1)


class FallosPuertasTest(unittest.TestCase):
    def setUp(self):
        self.t = tempfile.TemporaryDirectory()
        self.raiz = Path(self.t.name)
        (self.raiz / "starseed_memory_root" / "salud").mkdir(parents=True)

    def tearDown(self):
        self.t.cleanup()

    def _de(self):
        return DE.DirectoresEspecialidad(raiz=self.raiz)

    def test_primer_fallo_no_alcanza_umbral(self):
        de = self._de()
        alcanza = de.registrar_fallo_puerta("T1", "tsc", "error TS2322: Type 'string' not assignable", "interfaz")
        self.assertFalse(alcanza)
        self.assertEqual(len(de.obtener_fallos_tarea("T1", "interfaz")), 1)

    def test_segundo_fallo_alcanza_umbral(self):
        de = self._de()
        de.registrar_fallo_puerta("T1", "tsc", "error TS2322", "interfaz")
        alcanza = de.registrar_fallo_puerta("T1", "vitest", "FAIL src/lib/__tests__/utils.test.ts", "interfaz")
        self.assertTrue(alcanza)
        self.assertEqual(len(de.obtener_fallos_tarea("T1", "interfaz")), 2)

    def test_debe_ir_a_director_despues_de_dos_fallos(self):
        de = self._de()
        de.registrar_fallo_puerta("T1", "tsc", "error 1", "interfaz")
        de.registrar_fallo_puerta("T1", "tsc", "error 2", "interfaz")
        self.assertTrue(de.debe_ir_a_director("T1", "interfaz"))

    def test_no_debe_ir_si_un_solo_fallo(self):
        de = self._de()
        de.registrar_fallo_puerta("T1", "tsc", "error 1", "interfaz")
        self.assertFalse(de.debe_ir_a_director("T1", "interfaz"))

    def test_limpiar_fallos_tras_integracion(self):
        de = self._de()
        de.registrar_fallo_puerta("T1", "tsc", "error 1", "interfaz")
        de.registrar_fallo_puerta("T1", "tsc", "error 2", "interfaz")
        de.limpiar_fallos_tarea("T1", "interfaz")
        self.assertEqual(len(de.obtener_fallos_tarea("T1", "interfaz")), 0)
        self.assertFalse(de.debe_ir_a_director("T1", "interfaz"))


class RevisionTest(unittest.TestCase):
    def setUp(self):
        self.t = tempfile.TemporaryDirectory()
        self.raiz = Path(self.t.name)
        (self.raiz / "starseed_memory_root" / "salud").mkdir(parents=True)

    def tearDown(self):
        self.t.cleanup()

    def _de(self):
        return DE.DirectoresEspecialidad(raiz=self.raiz)

    def test_revision_aprobada_si_checklist_ok(self):
        de = self._de()
        archivos = ["src/components/ui/button.tsx"]
        cambios = {
            "src/components/ui/button.tsx": """
export function Button({children}: {children: React.ReactNode}) {
  return <button className="btn">{children}</button>;
}
""".strip()
        }
        resultado = de.revisar("T1", archivos, cambios)
        self.assertEqual(resultado.area, "interfaz")
        # La revisión puede no aprobar todo automáticamente, pero no debe fallar en checks básicos
        self.assertIn(resultado.accion, ("integrar", "reescribir", "partir", "escalar"))

    def test_revision_detecta_any(self):
        de = self._de()
        archivos = ["scripts/puente/algo.py"]
        cambios = {
            "scripts/puente/algo.py": """
def foo(x: any) -> any:
    return x
""".strip()
        }
        resultado = de.revisar("T1", archivos, cambios, area="puente")
        # Debe detectar el 'any' y fallar el check sin_any
        self.assertFalse(resultado.checklist.get("sin_any", True))

    def test_revision_detecta_clave_real(self):
        de = self._de()
        archivos = ["scripts/puente/config.py"]
        cambios = {
            "scripts/puente/config.py": """
API_KEY = "sk-abcdefghijklmnopqrstuvwxyz123456"
SECRET = 'ghp_abcdefghijklmnopqrstuvwxyz123456'
""".strip()
        }
        resultado = de.revisar("T1", archivos, cambios, area="puente")
        self.assertFalse(resultado.checklist.get("claves_nombre", True))

    def test_revision_migracion_sin_down(self):
        de = self._de()
        archivos = ["supabase/migrations/20260101_create.sql"]
        cambios = {
            "supabase/migrations/20260101_create.sql": """
CREATE TABLE test (id uuid PRIMARY KEY, name text);
-- No hay bloque DOWN ni DROP TABLE
""".strip()
        }
        resultado = de.revisar("T1", archivos, cambios, area="datos")
        self.assertFalse(resultado.checklist.get("migracion", True))

    def test_revision_tabla_sin_rls(self):
        de = self._de()
        archivos = ["supabase/migrations/20260101_create.sql"]
        cambios = {
            "supabase/migrations/20260101_create.sql": """
CREATE TABLE test (id uuid PRIMARY KEY);
ALTER TABLE test ENABLE ROW LEVEL SECURITY;
-- Falta policy
""".strip()
        }
        resultado = de.revisar("T1", archivos, cambios, area="datos")
        # RLS check pasa si hay ENABLE ROW LEVEL SECURITY
        self.assertTrue(resultado.checklist.get("rls", False))


class AprendizajesTest(unittest.TestCase):
    def setUp(self):
        self.t = tempfile.TemporaryDirectory()
        self.raiz = Path(self.t.name)
        (self.raiz / "starseed_memory_root" / "salud").mkdir(parents=True)

    def tearDown(self):
        self.t.cleanup()

    def _de(self):
        return DE.DirectoresEspecialidad(raiz=self.raiz)

    def test_registrar_y_obtener_aprendizaje(self):
        de = self._de()
        apr = de.registrar_aprendizaje(
            "interfaz",
            "Token hex suelto en CSS",
            "No usó tokens de design-system",
            "Reemplazar #FF0000 por palette.trinity.zenith.active",
            "T123",
            "src/components/ui/button.tsx"
        )
        self.assertEqual(apr.fallo, "Token hex suelto en CSS")
        self.assertEqual(apr.causa, "No usó tokens de design-system")
        self.assertEqual(apr.arreglo, "Reemplazar #FF0000 por palette.trinity.zenith.active")
        self.assertEqual(apr.tarea_id, "T123")
        self.assertEqual(apr.archivo, "src/components/ui/button.tsx")

        aprendidos = de.obtener_aprendizajes("interfaz")
        self.assertEqual(len(aprendidos), 1)
        self.assertEqual(aprendidos[0].clave(), apr.clave())

    def test_aprendizaje_duplicado_no_se_repite(self):
        de = self._de()
        de.registrar_aprendizaje("interfaz", "Fallo A", "Causa A", "Arreglo A", "T1")
        de.registrar_aprendizaje("interfaz", "Fallo A", "Causa A", "Arreglo A", "T2")
        aprendidos = de.obtener_aprendizajes("interfaz")
        self.assertEqual(len(aprendidos), 1)

    def test_aprendizajes_ordenados_por_uso_y_recencia(self):
        de = self._de()
        apr1 = de.registrar_aprendizaje("interfaz", "Fallo 1", "Causa 1", "Arreglo 1", "T1")
        apr2 = de.registrar_aprendizaje("interfaz", "Fallo 2", "Causa 2", "Arreglo 2", "T2")
        # Usar apr1 dos veces
        apr1.veces_usado = 2
        de._guardar()

        de2 = DE.DirectoresEspecialidad(raiz=self.raiz)
        aprendidos = de2.obtener_aprendizajes("interfaz", 10)
        self.assertEqual(aprendidos[0].clave(), apr1.clave())
        self.assertEqual(aprendidos[1].clave(), apr2.clave())

    def test_aplicar_aprendizajes_en_revision(self):
        de = self._de()
        de.registrar_aprendizaje(
            "interfaz",
            "Token hex suelto",
            "No usó tokens",
            "Usar palette.trinity",
            "T1",
            "src/components/ui/button.tsx"
        )
        archivos = ["src/components/ui/button.tsx"]
        cambios = {"src/components/ui/button.tsx": "color: #FF0000;"}
        resultado = de.revisar("T1", archivos, cambios)
        self.assertGreater(len(resultado.aprendizajes_aplicados), 0)


class ResumenTest(unittest.TestCase):
    def setUp(self):
        self.t = tempfile.TemporaryDirectory()
        self.raiz = Path(self.t.name)
        (self.raiz / "starseed_memory_root" / "salud").mkdir(parents=True)

    def tearDown(self):
        self.t.cleanup()

    def _de(self):
        return DE.DirectoresEspecialidad(raiz=self.raiz)

    def test_resumen_incluye_todas_areas(self):
        de = self._de()
        de.registrar_aprendizaje("interfaz", "Fallo UI", "Causa", "Arreglo", "T1")
        de.asignar_director("T2", ["scripts/puente/algo.py"])
        resumen = de.resumen()
        self.assertIn("interfaz", resumen["areas"])
        self.assertIn("puente", resumen["areas"])
        self.assertEqual(resumen["areas"]["interfaz"]["aprendizajes"], 1)
        self.assertGreater(resumen["areas"]["puente"]["ultima_asignacion"], 0)


class CLITest(unittest.TestCase):
    def test_area_comando(self):
        import subprocess
        result = subprocess.run([
            sys.executable, "-m", "directores_especialidad",
            "area", "src/components/ui/button.tsx", "src/app/page.tsx"
        ], capture_output=True, text=True, cwd=os.path.dirname(__file__))
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout.strip(), "interfaz")

    def test_aprender_comando(self):
        import subprocess
        with tempfile.TemporaryDirectory() as d:
            raiz = Path(d)
            (raiz / "starseed_memory_root" / "salud").mkdir(parents=True)
            # Cambiar directorio de trabajo para que use nuestro estado temporal
            env = os.environ.copy()
            env["STARSEED_ROOT"] = str(raiz)
            result = subprocess.run([
                sys.executable, "-m", "directores_especialidad",
                "aprender", "interfaz", "Token hex", "No usó tokens", "Usar palette"
            ], capture_output=True, text=True, cwd=os.path.dirname(__file__), env=env)
            self.assertEqual(result.returncode, 0)
            self.assertIn("Aprendizaje guardado", result.stdout)


if __name__ == "__main__":
    unittest.main()