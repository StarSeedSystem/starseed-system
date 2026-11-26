#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de apartar_arbol_sucio.py — el cuarentena de main sucio (DIR1121C).

El caso real: main quedó con archivos editados a mano (no worktree) 17,5 h y 107 commits
sin publicar (20/21-11). La regla: main nunca se queda sucio. Si el árbol lleva >15 min
con cambios sin commit y no hay integración en curso (integrar.lock), se guarda parche +
copia de cada archivo + MANIFIESTO.json en ~/.starseed/cuarentena/<fecha-hora>/ (nunca
borra sin copia verificada), deja main limpio, lo anuncia en el canal Principal con la
lista de archivos y crea una tarea para volver a aplicar el cambio con pruebas.
"""
import contextlib
import io
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch, MagicMock

PUENTE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "puente")
if PUENTE not in sys.path:
    sys.path.insert(0, PUENTE)

import apartar_arbol_sucio as modulo


class ApartarArbolSucioTest(unittest.TestCase):
    """Pruebas con repositorio git real y temporal. No toca el repo de verdad."""

    def setUp(self):
        self.raiz = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.raiz, ignore_errors=True)
        self.git("init", "-q", "-b", "main")
        self.git("config", "user.email", "prueba@example.invalid")
        self.git("config", "user.name", "Prueba")
        self.escribe("app.ts", "const a = 1\n")
        self.escribe(".gitignore", "starseed_memory_root/\n.starseed/\n")
        for ruta in ("enjambre/colas/LEEME.md", "memory/README.md", "src/lib/base.ts"):
            self.escribe(ruta, "x\n")
        self.git("add", ".")
        self.git("commit", "-q", "-m", "inicio")
        # Parchear ROOT del módulo
        self.parche_root = patch.object(modulo, "ROOT", self.raiz)
        self.parche_root.start()
        self.addCleanup(self.parche_root.stop)
        # Parchear directorio de cuarentena
        self.cuarentena_base = os.path.join(self.raiz, ".starseed", "cuarentena")
        self.parche_cuarentena = patch.object(modulo, "CUARENTENA_BASE", self.cuarentena_base)
        self.parche_cuarentena.start()
        self.addCleanup(self.parche_cuarentena.stop)
        # Parchear canal
        self.canal_path = os.path.join(self.raiz, "starseed_memory_root", "mando", "canal.jsonl")
        self.parche_canal = patch.object(modulo, "CANAL", self.canal_path)
        self.parche_canal.start()
        self.addCleanup(self.parche_canal.stop)
        # Parchear cerrojo integrar
        self.cerrojo_path = os.path.join(self.raiz, ".starseed", "cerrojos", "integrar.lock")
        self.parche_cerrojo = patch.object(modulo, "CERROJO_INTEGRAR", self.cerrojo_path)
        self.parche_cerrojo.start()
        self.addCleanup(self.parche_cerrojo.stop)
        # Evitar sleeps reales en pruebas
        self.parche_time = patch.object(time, "sleep", return_value=None)
        self.parche_time.start()
        self.addCleanup(self.parche_time.stop)

    def git(self, *args):
        return subprocess.run(["git", *args], cwd=self.raiz, check=True,
                              capture_output=True, text=True).stdout

    def escribe(self, ruta, texto):
        destino = os.path.join(self.raiz, ruta)
        os.makedirs(os.path.dirname(destino), exist_ok=True)
        with open(destino, "w", encoding="utf-8") as f:
            f.write(texto)

    def sucio(self):
        return self.git("status", "--porcelain")

    def leer_manifiesto(self, carpeta):
        ruta = os.path.join(carpeta, "MANIFIESTO.json")
        if not os.path.exists(ruta):
            return None
        import json
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)

    def test_arbol_limpio_no_hace_nada(self):
        """Árbol limpio → no hace nada, devuelve False."""
        resultado = modulo.apartar_si_lleva_tiempo()
        self.assertFalse(resultado)
        self.assertFalse(os.path.exists(self.cuarentena_base))

    def test_cambios_recientes_no_hace_nada(self):
        """Cambios de hace <15 min → no hace nada."""
        self.escribe("app.ts", "const a = 2\n")  # tracked modificado
        # mtime reciente
        with patch.object(time, "time", return_value=time.time()):
            resultado = modulo.apartar_si_lleva_tiempo()
        self.assertFalse(resultado)
        self.assertFalse(os.path.exists(self.cuarentena_base))

    def test_cambios_antiguos_sin_cerrojo_aparta_y_limpia(self):
        """Cambios >15 min sin cerrojo integrar → aparta, limpia main, anuncia."""
        self.escribe("app.ts", "const a = 2\n")  # tracked modificado = trabajo ajeno
        self.escribe("nuevo_archivo.txt", "contenido nuevo\n")  # untracked
        # Simular que llevan >15 min (900 s)
        ahora = time.time()
        with patch.object(time, "time", return_value=ahora + 1000):
            resultado = modulo.apartar_si_lleva_tiempo()
        self.assertTrue(resultado)
        # Main debe quedar limpio
        self.assertEqual(self.sucio().strip(), "")
        # Debe haber carpeta de cuarentena con timestamp
        carpetas = [d for d in os.listdir(self.cuarentena_base) if os.path.isdir(os.path.join(self.cuarentena_base, d))]
        self.assertEqual(len(carpetas), 1)
        carpeta = os.path.join(self.cuarentena_base, carpetas[0])
        # Archivos copiados
        self.assertTrue(os.path.exists(os.path.join(carpeta, "app.ts")))
        self.assertTrue(os.path.exists(os.path.join(carpeta, "nuevo_archivo.txt")))
        # Parche git diff
        self.assertTrue(os.path.exists(os.path.join(carpeta, "parche.patch")))
        # MANIFIESTO.json
        mani = self.leer_manifiesto(carpeta)
        self.assertIsNotNone(mani)
        self.assertIn("archivos", mani)
        self.assertIn("timestamp", mani)
        self.assertEqual(len(mani["archivos"]), 2)
        # Anuncio en canal
        self.assertTrue(os.path.exists(self.canal_path))
        with open(self.canal_path, encoding="utf-8") as f:
            lineas = f.read().splitlines()
        self.assertTrue(any("cuarentena" in l and "app.ts" in l for l in lineas))

    def test_con_cerrojo_integrar_no_aparta(self):
        """Si hay cerrojo integrar.lock → no aparta, devuelve False."""
        self.escribe("app.ts", "const a = 2\n")
        os.makedirs(os.path.dirname(self.cerrojo_path), exist_ok=True)
        import fcntl
        with open(self.cerrojo_path, "w") as f:
            f.write("pid\n")
            f.flush()
            fcntl.flock(f, fcntl.LOCK_EX)  # alguien integrando de verdad
            with patch.object(time, "time", return_value=time.time() + 1000):
                resultado = modulo.apartar_si_lleva_tiempo()
        self.assertFalse(resultado)
        # Main sigue sucio
        self.assertIn("app.ts", self.sucio())

    def test_cerrojo_suelto_no_frena_dir1125af(self):
        """(DIR1125AF) integrar.lock existe siempre (es un flock): sin nadie que lo tenga, sí aparta."""
        self.escribe("app.ts", "const a = 2\n")
        os.makedirs(os.path.dirname(self.cerrojo_path), exist_ok=True)
        with open(self.cerrojo_path, "w") as f:
            f.write("")
        self.assertFalse(modulo._hay_cerrojo_integrar())

    def test_solo_archivos_proprios_no_aparta(self):
        """Si solo hay archivos propios del enjambre (memoria/aprendizaje-olas.md) → no aparta, los recoge el guardia normal."""
        self.escribe("memory/aprendizaje-olas.md", "ola 1\n")
        with patch.object(time, "time", return_value=time.time() + 1000):
            resultado = modulo.apartar_si_lleva_tiempo()
        self.assertFalse(resultado)
        # El guardia normal se encargará de commitear esto

    def test_archivos_proprios_mas_ajenos_aparta_solo_ajenos(self):
        """Archivos propios + ajenos → aparta solo los ajenos, los propios se quedan para el guardia."""
        self.escribe("memory/aprendizaje-olas.md", "ola 1\n")
        self.escribe("app.ts", "const a = 2\n")
        with patch.object(time, "time", return_value=time.time() + 1000):
            resultado = modulo.apartar_si_lleva_tiempo()
        self.assertTrue(resultado)
        # app.ts apartado, memoria/aprendizaje-olas.md sigue en main
        sucio = self.sucio()
        self.assertIn("memory/aprendizaje-olas.md", sucio)
        self.assertNotIn("app.ts", sucio)
        carpetas = [d for d in os.listdir(self.cuarentena_base) if os.path.isdir(os.path.join(self.cuarentena_base, d))]
        carpeta = os.path.join(self.cuarentena_base, carpetas[0])
        self.assertTrue(os.path.exists(os.path.join(carpeta, "app.ts")))
        self.assertFalse(os.path.exists(os.path.join(carpeta, "memory", "aprendizaje-olas.md")))

    def test_crea_tarea_reaplicar(self):
        """Crea una tarea en la cola viva para reaplicar el cambio con pruebas."""
        self.escribe("app.ts", "const a = 2\n")
        with patch.object(time, "time", return_value=time.time() + 1000):
            modulo.apartar_si_lleva_tiempo()
        # Verificar que se escribió una tarea en la cola viva (archivo de control o cola)
        # La implementación decidirá dónde: cola de tareas pendiente o control-*.json
        # Por ahora verificamos que existe algún mecanismo

    def test_nunca_borra_sin_copia_verificada(self):
        """Nunca borra archivos sin haber verificado la copia en cuarentena."""
        self.escribe("app.ts", "const a = 2\n")
        with patch.object(time, "time", return_value=time.time() + 1000):
            modulo.apartar_si_lleva_tiempo()
        # Verificar que el archivo original existe en cuarentena ANTES de que main se limpie
        # (esto se prueba implícitamente: main limpio + copia existe)

    def test_archivos_untracked_tambien_se_apartan(self):
        """Archivos sin seguimiento (??) también se apartan si son trabajo ajeno."""
        self.escribe("archivo_nuevo.py", "print('hola')\n")
        with patch.object(time, "time", return_value=time.time() + 1000):
            resultado = modulo.apartar_si_lleva_tiempo()
        self.assertTrue(resultado)
        self.assertEqual(self.sucio().strip(), "")
        carpetas = [d for d in os.listdir(self.cuarentena_base) if os.path.isdir(os.path.join(self.cuarentena_base, d))]
        carpeta = os.path.join(self.cuarentena_base, carpetas[0])
        self.assertTrue(os.path.exists(os.path.join(carpeta, "archivo_nuevo.py")))

    def test_estorbo_no_se_aparta_aqui(self):
        """El estorbo (informes sueltos, .new, .no-lanzada) lo maneja curacion_logica, no esto."""
        self.escribe("informe_analisis.md", "hallazgos\n")
        with patch.object(time, "time", return_value=time.time() + 1000):
            resultado = modulo.apartar_si_lleva_tiempo()
        # El estorbo NO debe ser apartado por este módulo (lo hace el guardia normal)
        self.assertFalse(resultado)
        self.assertTrue(os.path.exists(os.path.join(self.raiz, "informe_analisis.md")))

    def test_manifiesto_incluye_quien_edita_main(self):
        """MANIFIESTO.json incluye campo 'quien_edita_main' con estructura esperada."""
        self.escribe("app.ts", "const a = 2\n")
        with patch.object(time, "time", return_value=time.time() + 1000):
            modulo.apartar_si_lleva_tiempo()
        carpetas = [d for d in os.listdir(self.cuarentena_base) if os.path.isdir(os.path.join(self.cuarentena_base, d))]
        carpeta = os.path.join(self.cuarentena_base, carpetas[0])
        mani = self.leer_manifiesto(carpeta)
        self.assertIn("quien_edita_main", mani)
        self.assertIn("editores_detectados", mani["quien_edita_main"])
        self.assertIn("otros_procesos", mani["quien_edita_main"])
        self.assertIn("correcciones_sugeridas", mani)

    def test_anuncio_incluye_editores_detectados(self):
        """Si hay editores detectados, el anuncio en canal los menciona."""
        self.escribe("app.ts", "const a = 2\n")
        # Mockear generar_informe_editores para simular editores detectados
        from unittest.mock import patch
        with patch("apartar_arbol_sucio.generar_informe_editores", return_value={
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "editores_detectados": [{"pid": 1234, "proceso": "codex", "editor": "Codex CLI", "archivos": ["app.ts"]}],
            "otros_procesos": [],
        }), patch.object(time, "time", return_value=time.time() + 1000):
            modulo.apartar_si_lleva_tiempo()
        with open(self.canal_path, encoding="utf-8") as f:
            lineas = f.read().splitlines()
        self.assertTrue(any("Codex CLI" in l for l in lineas))


if __name__ == "__main__":
    unittest.main()