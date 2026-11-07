"""test_revisar.py — pruebas de la revisión automática del Estudio.

  python3 -m unittest scripts/sociales/estudio/test_revisar -v

Pruebas:
  - pieza buena que pasa
  - huella cambiada
  - archivo que falta
  - texto con cifra inventada que mentiras_en caza
  - medios sin herramientas → «no comprobado» y no pasa
  - Jev callado → regla
  - --seco no escribe
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

AIKU = Path(__file__).resolve().parent
sys.path.insert(0, str(AIKU))

import nucleo


class TestRevisar(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.salida = Path(self.tmp) / "campana-test"
        self.salida.mkdir()

        self.campana_base = {
            "id": "campana-test",
            "nombre": "Test",
            "marca": {"url": "https://starseed-os.vercel.app"},
            "guiones": {
                "reel": {
                    "es": [{"t": 0, "d": 3, "titular": "Bien hecho", "cuerpo": "Participa.", "cta": "starseed-os.vercel.app"}]
                }
            },
            "piezas": [{
                "id": "reel",
                "salida": "video",
                "duracion": 3,
                "formatos": ["instagram-reels"],
                "idiomas": ["es"]
            }]
        }

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _crear_archivo(self, contenido: bytes, ruta_relativa: str = "instagram/reel-instagram-reels-es.mp4") -> Path:
        p = self.salida / ruta_relativa
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(contenido)
        return p

    def test_pieza_buena_que_pasa(self):
        """Una pieza con archivo válido, sha correcto, sin mentiras, Jev favorable pasa."""
        contenido = b"test content " * 1000
        p = self._crear_archivo(contenido)
        sha = hashlib.sha256(contenido).hexdigest()

        mf = json.loads((self.salida / "manifiesto.json").read_text()) if (self.salida / "manifiesto.json").exists() else self.campana_base.copy()

        entrada = {
            "id": "reel-instagram-reels-es.mp4",
            "pieza": "reel",
            "titulo": "Reel",
            "idioma": "es",
            "formato_catalogo": "instagram-reels",
            "contenedor": "mp4",
            "ancho": 1080, "alto": 1920, "duracion": 3.0, "fps": 30,
            "bytes": len(contenido),
            "escena": "semilla-estelar",
            "verificacion": {
                "video": True, "problemas": [], "sonoridad_lufs": -14.0, "pico_dbtp": -2.0,
                "contraste_min": 4.5, "contraste_fallos": 0, "zona_segura_ok": True,
                "destellos_por_segundo": 0, "bajo_tope": True
            },
            "tabla": {
                "campana_ref": "campana-test",
                "rama_id": "estudio",
                "tipo": "animacion3d",
                "medio": "instagram",
                "formato": "1080x1920@3s",
                "ruta": "instagram/reel-instagram-reels-es.mp4",
                "sha256": sha,
                "estado": "para_aprobar"
            },
            "problemas_tabla": [],
            "ruta": "instagram/reel-instagram-reels-es.mp4"
        }

        mf["piezas"] = [entrada]
        mf["t"] = None
        (self.salida / "manifiesto.json").write_text(json.dumps(mf, ensure_ascii=False, indent=2) + "\n")

        def mock_comprobar_medios(ruta, entrada):
            return {"ok": True, "problemas": [], "no_comprobado": []}

        import revisar
        result = revisar.revisar(str(self.salida), comprobar_medios_fn=mock_comprobar_medios)

        self.assertIn("piezas", result)
        reel_piece = next((r for r in result["piezas"] if "reel" in r.get("id", "")), None)
        self.assertIsNotNone(reel_piece, "No se encontró la pieza del reel")
        self.assertTrue(reel_piece["ok"], f"pieza buena debe pasar: {reel_piece.get('motivos', [])}")

    def test_huella_cambiada(self):
        """Un archivo con sha distinto al manifiesto no pasa."""
        contenido = b"test content " * 1000
        p = self._crear_archivo(contenido)
        sha_manifiesto = "a" * 64

        mf = self.campana_base.copy()
        mf["piezas"] = [{
            "id": "reel-instagram-reels-es.mp4",
            "pieza": "reel",
            "tabla": {
                "campana_ref": "campana-test",
                "rama_id": "estudio",
                "tipo": "animacion3d",
                "medio": "instagram",
                "formato": "1080x1920@3s",
                "ruta": "instagram/reel-instagram-reels-es.mp4",
                "sha256": sha_manifiesto,
                "estado": "para_aprobar"
            },
            "verificacion": {"video": True, "problemas": [], "contraste_fallos": 0, "zona_segura_ok": True,
                            "destellos_por_segundo": 0, "bajo_tope": True},
            "ruta": "instagram/reel-instagram-reels-es.mp4"
        }]
        (self.salida / "manifiesto.json").write_text(json.dumps(mf, ensure_ascii=False, indent=2) + "\n")

        import revisar
        result = revisar.revisar(str(self.salida))

        reel_piece = next((r for r in result["piezas"] if "reel" in r.get("id", "")), None)
        self.assertIsNotNone(reel_piece)
        self.assertFalse(reel_piece["ok"], "pieza con sha distinto no debe pasar")
        self.assertFalse(reel_piece["sha_correcto"])

    def test_archivo_que_falta(self):
        """Un archivo que no existe no pasa."""
        mf = self.campana_base.copy()
        mf["piezas"] = [{
            "id": "reel-instagram-reels-es.mp4",
            "pieza": "reel",
            "tabla": {
                "campana_ref": "campana-test",
                "rama_id": "estudio",
                "tipo": "animacion3d",
                "medio": "instagram",
                "formato": "1080x1920@3s",
                "ruta": "instagram/reel-instagram-reels-es.mp4",
                "sha256": "b" * 64,
                "estado": "para_aprobar"
            },
            "verificacion": {"video": True, "problemas": [], "contraste_fallos": 0, "zona_segura_ok": True,
                            "destellos_por_segundo": 0, "bajo_tope": True},
            "ruta": "instagram/reel-instagram-reels-es.mp4"
        }]
        (self.salida / "manifiesto.json").write_text(json.dumps(mf, ensure_ascii=False, indent=2) + "\n")

        import revisar
        result = revisar.revisar(str(self.salida))

        reel_piece = next((r for r in result["piezas"] if "reel" in r.get("id", "")), None)
        self.assertIsNotNone(reel_piece)
        self.assertFalse(reel_piece["ok"])
        self.assertIn("archivo falta", reel_piece.get("motivos", []))

    def test_texto_con_cifra_inventada(self):
        """Un texto con porcentaje u otra cifra inventada es detectado por mentiras_en."""
        campana_manifiesto = {
            "id": "campana-test",
            "guiones": {
                "reel": {
                    "es": [{"t": 0, "d": 3, "titular": "Ya somos 5.000 usuarios", "cuerpo": "", "cta": "x"}]
                }
            }
        }

        (self.salida / "manifiesto.json").write_text(json.dumps(campana_manifiesto, ensure_ascii=False, indent=2) + "\n")

        self._crear_archivo(b"test " * 1000)
        sha = hashlib.sha256(b"test " * 1000).hexdigest()

        mf = json.loads((self.salida / "manifiesto.json").read_text())
        mf["piezas"] = [{
            "id": "reel-instagram-reels-es.mp4",
            "pieza": "reel",
            "tabla": {
                "campana_ref": "campana-test",
                "rama_id": "estudio",
                "tipo": "animacion3d",
                "medio": "instagram",
                "formato": "1080x1920@3s",
                "ruta": "instagram/reel-instagram-reels-es.mp4",
                "sha256": sha,
                "estado": "para_aprobar"
            },
            "verificacion": {"video": True, "problemas": [], "contraste_fallos": 0, "zona_segura_ok": True,
                            "destellos_por_segundo": 0, "bajo_tope": True},
            "ruta": "instagram/reel-instagram-reels-es.mp4"
        }]
        (self.salida / "manifiesto.json").write_text(json.dumps(mf, ensure_ascii=False, indent=2) + "\n")

        def mock_comprobar_medios(ruta, entrada):
            return {"ok": True, "problemas": [], "no_comprobado": []}

        import revisar
        result = revisar.revisar(str(self.salida), comprobar_medios_fn=mock_comprobar_medios)

        reel_piece = next((r for r in result["piezas"] if "reel" in r.get("id", "")), None)
        self.assertIsNotNone(reel_piece)
        self.assertFalse(reel_piece["ok"])
        self.assertTrue(any("cifra" in m.lower() or "porcentaje" in m.lower() for m in reel_piece.get("motivos", [])))

    def test_medios_sin_herramientas(self):
        """Si comprobar_medios falla por falta de herramientas, apunta en no_comprobado y no pasa."""
        self._crear_archivo(b"test " * 1000)

        mf = self.campana_base.copy()
        sha = hashlib.sha256(b"test " * 1000).hexdigest()
        mf["piezas"] = [{
            "id": "reel-instagram-reels-es.mp4",
            "pieza": "reel",
            "tabla": {
                "campana_ref": "campana-test",
                "rama_id": "estudio",
                "tipo": "animacion3d",
                "medio": "instagram",
                "formato": "1080x1920@3s",
                "ruta": "instagram/reel-instagram-reels-es.mp4",
                "sha256": sha,
                "estado": "para_aprobar"
            },
            "verificacion": {"video": True, "problemas": [], "contraste_fallos": 0, "zona_segura_ok": True,
                            "destellos_por_segundo": 0, "bajo_tope": True},
            "ruta": "instagram/reel-instagram-reels-es.mp4"
        }]
        (self.salida / "manifiesto.json").write_text(json.dumps(mf, ensure_ascii=False, indent=2) + "\n")

        import revisar
        result = revisar.revisar(str(self.salida), comprobar_medios_fn=lambda r, e: {
            "ok": False, "problemas": [], "no_comprobado": True
        })

        reel_piece = next((r for r in result["piezas"] if "reel" in r.get("id", "")), None)
        self.assertIsNotNone(reel_piece)
        self.assertFalse(reel_piece["ok"])
        self.assertTrue(len(reel_piece.get("no_comprobado", [])) > 0)

    def test_jev_callado_regla(self):
        """Si consultar devuelve None (Jev callado), se usa la regla (medio=regla)."""
        self._crear_archivo(b"test " * 1000)
        sha = hashlib.sha256(b"test " * 1000).hexdigest()

        mf = self.campana_base.copy()
        mf["piezas"] = [{
            "id": "reel-instagram-reels-es.mp4",
            "pieza": "reel",
            "tabla": {
                "campana_ref": "campana-test",
                "rama_id": "estudio",
                "tipo": "animacion3d",
                "medio": "instagram",
                "formato": "1080x1920@3s",
                "ruta": "instagram/reel-instagram-reels-es.mp4",
                "sha256": sha,
                "estado": "para_aprobar"
            },
            "verificacion": {"video": True, "problemas": [], "contraste_fallos": 0, "zona_segura_ok": True,
                            "destellos_por_segundo": 0, "bajo_tope": True},
            "ruta": "instagram/reel-instagram-reels-es.mp4"
        }]
        (self.salida / "manifiesto.json").write_text(json.dumps(mf, ensure_ascii=False, indent=2) + "\n")

        import revisar
        result = revisar.revisar(str(self.salida), consultar=lambda t: None)

        reel_piece = next((r for r in result["piezas"] if "reel" in r.get("id", "")), None)
        self.assertIsNotNone(reel_piece)
        self.assertIsNotNone(reel_piece["jev"])
        self.assertEqual(reel_piece["jev"].get("respuesta"), "medio")

    def test_seco_no_escribe(self):
        """--seco imprime y no escribe revision.json."""
        import revisar
        import io

        self._crear_archivo(b"test " * 1000)
        sha = hashlib.sha256(b"test " * 1000).hexdigest()

        mf = self.campana_base.copy()
        mf["piezas"] = [{
            "id": "reel-instagram-reels-es.mp4",
            "pieza": "reel",
            "tabla": {
                "campana_ref": "campana-test",
                "rama_id": "estudio",
                "tipo": "animacion3d",
                "medio": "instagram",
                "formato": "1080x1920@3s",
                "ruta": "instagram/reel-instagram-reels-es.mp4",
                "sha256": sha,
                "estado": "para_aprobar"
            },
            "verificacion": {"video": True, "problemas": [], "contraste_fallos": 0, "zona_segura_ok": True,
                            "destellos_por_segundo": 0, "bajo_tope": True},
            "ruta": "instagram/reel-instagram-reels-es.mp4"
        }]
        (self.salida / "manifiesto.json").write_text(json.dumps(mf, ensure_ascii=False, indent=2) + "\n")

        old_stdout = sys.stdout
        sys.stdout = io.StringIO()

        try:
            revisar.main([str(self.salida), "--seco"])
        except SystemExit:
            pass

        salida_texto = sys.stdout.getvalue()
        sys.stdout = old_stdout

        self.assertFalse((self.salida / "revision.json").exists())
        self.assertIn("piezas", salida_texto)


if __name__ == "__main__":
    unittest.main()