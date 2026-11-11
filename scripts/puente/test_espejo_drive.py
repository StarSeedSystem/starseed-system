# -*- coding: utf-8 -*-
"""Pruebas de espejo-drive.py (SUP0811K, 08-11).

Del 27-09 al 08-11 el espejo de Drive falló en cada cierre de ola (651 avisos) y el aviso solo
guardaba «Traceback (most recent call last): File …»: la causa no se veía nunca. Además `--seco`
copiaba los contextos, y la memoria (≈1,8 GB hoy) se copiaría al disco de una Mac con 2–7 GB libres.
Todo en un temporal: ni el Drive de verdad ni el repo vivo.
"""
import contextlib
import importlib.util
import io
import os
import shutil
import sys
import tempfile
import unittest
from unittest import mock

AQUI = os.path.dirname(os.path.abspath(__file__))


def _cargar():
    spec = importlib.util.spec_from_file_location(
        "espejo_drive_prueba", os.path.join(AQUI, "espejo-drive.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


class EspejoDrive(unittest.TestCase):
    def setUp(self):
        self.E = _cargar()
        self.tmp = tempfile.mkdtemp(prefix="espejo-drive-")
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.raiz = os.path.join(self.tmp, "repo")
        os.makedirs(os.path.join(self.raiz, "starseed_memory_root", "olas"))
        with open(os.path.join(self.raiz, "starseed_memory_root", "olas", "progreso.json"), "w") as f:
            f.write("{}")
        os.makedirs(os.path.join(self.raiz, "memory"))
        with open(os.path.join(self.raiz, "memory", "nota.md"), "w") as f:
            f.write("nota")
        with open(os.path.join(self.raiz, "PUENTE-DE-MANDO.md"), "w") as f:
            f.write("# puente")
        self.unidad = os.path.join(self.tmp, "GoogleDrive-prueba")
        os.makedirs(os.path.join(self.unidad, "My Drive"))
        self.E.RAIZ = self.raiz
        self.E.unidad_drive = lambda: self.unidad
        self.destino = self.E.carpeta_neurona(self.unidad, "prueba")
        self.llamadas = []

    def _rsync(self, origen, destino, seco=False):
        self.llamadas.append(os.path.basename(destino))
        return 0

    def _archivos(self):
        return [os.path.join(b, a) for b, _, aa in os.walk(self.unidad) for a in aa]

    def _main(self):
        out = io.StringIO()
        with mock.patch.object(sys, "argv", ["espejo-drive.py"]), contextlib.redirect_stdout(out):
            rc = self.E.main()
        return rc, out.getvalue()

    def test_seco_no_escribe_nada_en_el_drive(self):
        with mock.patch.object(self.E, "_rsync", side_effect=self._rsync):
            r = self.E.sincronizar(seco=True, host="prueba")
        self.assertEqual(self._archivos(), [], "--seco copió algo al Drive")
        self.assertFalse(os.path.exists(self.destino), "--seco creó la carpeta de la neurona")
        self.assertEqual(self.llamadas, ["memoria", "memoria-repo"])
        self.assertIn("contextos", [n for n, _ in r["tramos"]])

    def test_un_fallo_sale_en_una_linea_y_sin_traceback(self):
        err = PermissionError(1, "Operation not permitted", self.destino)
        with mock.patch.object(self.E, "sincronizar", side_effect=err):
            rc, texto = self._main()
        self.assertEqual(rc, 1)
        self.assertTrue(texto.startswith("✗ PermissionError"), texto)
        self.assertIn("Operation not permitted", texto[:300])
        self.assertNotIn("Traceback", texto)

    @unittest.skipIf(hasattr(os, "geteuid") and os.geteuid() == 0, "root escribe sin permiso")
    def test_sin_permiso_en_la_carpeta_de_drive_lo_dice_en_la_primera_linea(self):
        mi_drive = os.path.join(self.unidad, "My Drive")
        os.chmod(mi_drive, 0o500)
        self.addCleanup(os.chmod, mi_drive, 0o700)
        with mock.patch.object(self.E, "_rsync", side_effect=self._rsync):
            rc, texto = self._main()
        self.assertEqual(rc, 1)
        self.assertTrue(texto.startswith("✗ no puedo escribir en la carpeta de Drive: PermissionError"), texto)
        self.assertEqual(self.llamadas, [])

    def test_un_indice_que_falla_queda_en_los_fallos(self):
        with mock.patch.object(self.E, "_rsync", side_effect=self._rsync), \
                mock.patch.object(self.E, "_libre_mb", return_value=10 ** 6, create=True), \
                mock.patch.object(self.E, "indice", side_effect=OSError(11, "Resource deadlock avoided")):
            r = self.E.sincronizar(host="prueba")
        self.assertFalse(r["ok"])
        # OSError(11) llega como BlockingIOError (Python lo traduce al errno):
        # lo que importa es que el fallo quede registrado con su causa.
        self.assertTrue(
            any(f.startswith("INDICE.md: ") and "Resource deadlock" in f for f in r["fallos"]),
            r["fallos"],
        )
        self.assertTrue(os.path.isfile(os.path.join(self.destino, "estado.json")))

    def test_con_poco_disco_no_copia_la_memoria(self):
        with mock.patch.object(self.E, "_rsync", side_effect=self._rsync), \
                mock.patch.object(self.E, "_libre_mb", return_value=2048, create=True), \
                mock.patch.dict(os.environ, {"STARSEED_ESPEJO_DISCO_MIN_MB": "5120"}):
            r = self.E.sincronizar(host="prueba")
            rc, texto = self._main()
        self.assertEqual(self.llamadas, [], "con 2 GB libres copió la memoria al Drive")
        self.assertFalse(r["ok"])
        self.assertTrue(any("me lo salto por disco" in f for f in r["fallos"]), r["fallos"])
        self.assertTrue(texto.startswith("✗ memoria: me lo salto por disco"), texto)
        # Los contextos (unos KB) sí, y el índice dice qué hay.
        self.assertTrue(os.path.isfile(os.path.join(self.destino, "contextos", "PUENTE-DE-MANDO.md")))
        self.assertTrue(os.path.isfile(os.path.join(self.destino, "INDICE.md")))

    def test_minimo_cero_apaga_la_guarda(self):
        with mock.patch.object(self.E, "_rsync", side_effect=self._rsync), \
                mock.patch.object(self.E, "_libre_mb", return_value=10, create=True), \
                mock.patch.dict(os.environ, {"STARSEED_ESPEJO_DISCO_MIN_MB": "0"}):
            r = self.E.sincronizar(host="prueba")
        self.assertEqual(self.llamadas, ["memoria", "memoria-repo"])
        self.assertTrue(r["ok"], r["fallos"])

    @unittest.skipUnless(shutil.which("rsync"), "sin rsync")
    def test_con_disco_copia_de_verdad_y_escribe_el_indice(self):
        with mock.patch.object(self.E, "_libre_mb", return_value=10 ** 6, create=True):
            r = self.E.sincronizar(host="prueba")
        self.assertTrue(r["ok"], r["fallos"])
        self.assertTrue(os.path.isfile(os.path.join(self.destino, "memoria", "olas", "progreso.json")))
        self.assertTrue(os.path.isfile(os.path.join(self.destino, "memoria-repo", "nota.md")))
        self.assertTrue(os.path.isfile(os.path.join(self.destino, "INDICE.md")))

    @unittest.skipUnless(shutil.which("rsync"), "sin rsync")
    def test_los_temporales_de_la_app_de_drive_no_viajan(self):
        """(SUP0811L) `.tmp.driveupload/` y `.tmp.drivedownload/` son de la app de Google Drive, que ya respalda
        `starseed_memory_root`: sus archivos desaparecen mientras rsync lee (el «rsync rc=23» de siempre)."""
        for d in (".tmp.driveupload", ".tmp.drivedownload"):
            os.makedirs(os.path.join(self.raiz, "starseed_memory_root", d))
            with open(os.path.join(self.raiz, "starseed_memory_root", d, "547310"), "w") as f:
                f.write("subida a medias")
        with mock.patch.object(self.E, "_libre_mb", return_value=10 ** 6, create=True):
            r = self.E.sincronizar(host="prueba")
        self.assertTrue(r["ok"], r["fallos"])
        self.assertTrue(os.path.isfile(os.path.join(self.destino, "memoria", "olas", "progreso.json")))
        for d in (".tmp.driveupload", ".tmp.drivedownload"):
            self.assertFalse(os.path.exists(os.path.join(self.destino, "memoria", d)), d)


if __name__ == "__main__":
    unittest.main()
