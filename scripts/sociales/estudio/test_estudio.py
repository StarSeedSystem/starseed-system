"""Pruebas del Estudio MetaGeminis que NO necesitan GPU ni Chromium.

  python3 -m unittest scripts/sociales/estudio/test_estudio.py -v     (o: cd scripts/sociales/estudio && python3 -m unittest -v test_estudio)

Cubren: plan de render, márgenes, filtro de verdad, tabla de piezas, formatos gigantes (dpr), contraste WCAG, zona segura,
destellos, servidor estático (no se escapa de sus carpetas), audio determinista y coherencia del catálogo y la campaña.
"""
from __future__ import annotations

import copy
import hashlib
import io
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

import audio  # noqa: E402
import manifiesto  # noqa: E402
import nucleo  # noqa: E402
import servidor  # noqa: E402
import verificar  # noqa: E402

FORMATOS = nucleo.cargar_formatos()
CAMPANA = nucleo.cargar_campana("siembra-starseed")


class Catalogo(unittest.TestCase):
    def test_json_al_dia_con_el_ts(self):
        r = subprocess.run(["node", str(AQUI / "exportar_formatos.mjs"), "--check"], capture_output=True, text=True, timeout=120)
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_cada_formato_tiene_tamano_margenes_y_fuente(self):
        fuentes = nucleo.cargar_fuentes()
        for f in FORMATOS.values():
            self.assertGreater(f["ancho"], 0, f["id"])
            self.assertEqual(set(f["margenes"]), set(nucleo.LADOS), f["id"])
            self.assertTrue(f["fuentes"], f["id"])
            for s in f["fuentes"]:
                self.assertIn(s, fuentes, f"{f['id']}: fuente desconocida {s}")
                self.assertRegex(fuentes[s]["consultada"], r"^\d{4}-\d{2}-\d{2}$")

    def test_formato_pieza_cumple_la_tabla(self):
        for f in FORMATOS.values():
            self.assertRegex(f["formato_pieza"], nucleo.FORMATO_DB_RE.pattern, f["id"])


class Nucleo(unittest.TestCase):
    def test_razon_y_formato_pieza(self):
        self.assertEqual(nucleo.razon(1080, 1920), (9, 16))
        self.assertEqual(nucleo.razon(1200, 630), (40, 21))
        self.assertEqual(nucleo.formato_pieza(1080, 1920, 15), "1080x1920@15s")
        self.assertEqual(nucleo.formato_pieza(1080, 1080, 7.5), "1080x1080@7.5s")
        self.assertEqual(nucleo.formato_pieza(300, 250), "300x250")

    def test_margenes_se_escalan_y_se_unen(self):
        self.assertEqual(nucleo.escalar_margenes({"arriba": 100, "abajo": 10, "izquierda": 5, "derecha": 5}, 0.5), {"arriba": 50, "abajo": 5, "izquierda": 3, "derecha": 3})
        grupo = [FORMATOS["instagram-reels"], FORMATOS["tiktok"], FORMATOS["youtube-shorts"]]
        u = nucleo.margenes_union(FORMATOS["instagram-reels"], grupo)
        for f in grupo:
            for lado in nucleo.LADOS:
                self.assertGreaterEqual(u[lado], f["margenes"][lado], f"{f['id']} {lado}")

    def test_filtro_de_verdad(self):
        for malo in ("Ya somos 5.000 usuarios", "Rentabilidad garantizada", "Gana un 20% más", "Premiado como el mejor proyecto", "Terapia con sonido", "We are already thousands of members"):
            self.assertTrue(nucleo.mentiras_en(malo), malo)
        for bueno in ("Código abierto · AGPL-3.0", "Donaciones: enlace próximamente", "Lo estamos construyendo en abierto", "Aporta código: issues y pull requests"):
            self.assertEqual(nucleo.mentiras_en(bueno), [], bueno)

    def test_la_campana_real_es_valida(self):
        self.assertEqual(nucleo.validar_campana(CAMPANA, FORMATOS), [])

    def test_validar_atrapa_errores(self):
        c = copy.deepcopy(CAMPANA)
        c["piezas"][0]["tipo"] = "meme"
        c["piezas"][1]["formatos"] = ["no-existe"]
        c["guiones"]["reel"]["es"][0]["titular"] = "Ya somos 10.000 personas"
        p = "\n".join(nucleo.validar_campana(c, FORMATOS))
        self.assertIn("no es uno de", p)
        self.assertIn("formato desconocido", p)
        self.assertIn("no se puede sostener", p)

    def test_plan_del_reel_un_maestro_vertical_y_formatos_compartidos(self):
        pz = next(p for p in CAMPANA["piezas"] if p["id"] == "reel")
        ts = nucleo.plan_pieza(CAMPANA, pz, FORMATOS)
        self.assertEqual({t.idioma for t in ts}, {"es", "en"})
        for t in ts:
            self.assertEqual((t.maestro["ancho"], t.maestro["alto"]), (1080, 1920))
            propios = [e for e in t.entregas if not e.compartida]
            self.assertEqual(len(propios), 3)
            self.assertTrue(any(e.compartida for e in t.entregas))
            self.assertEqual(len({e.archivo for e in propios}), 3)

    def test_plan_de_la_campana_completo(self):
        ts = nucleo.plan_campana(CAMPANA, FORMATOS)
        ids = [t.id for t in ts]
        self.assertEqual(len(ids), len(set(ids)))
        medios = {e.formato["medio"] for t in ts for e in t.entregas}
        for m in ("instagram", "tiktok", "youtube", "x_twitter", "linkedin", "bluesky", "mastodon", "facebook", "pinterest", "banner_iab", "web", "correo", "cartel_impreso"):
            self.assertIn(m, medios)
        self.assertEqual(sum(1 for t in ts if t.lamina is not None), 10)  # 5 láminas × 2 idiomas

    def test_filas_de_la_tabla_de_piezas(self):
        pz = next(p for p in CAMPANA["piezas"] if p["id"] == "reel")
        t = nucleo.plan_pieza(CAMPANA, pz, FORMATOS)[0]
        fila = nucleo.fila_tabla_piezas("siembra-starseed", pz, t.entregas[0], "a" * 64, 15.0)
        self.assertEqual(nucleo.fila_valida(fila), [])
        self.assertEqual(fila["estado"], "para_aprobar")
        self.assertEqual(fila["formato"], "1080x1920@15s")
        for roto in ({"tipo": "meme"}, {"sha256": "xyz"}, {"ruta": "../../etc/passwd"}, {"ruta": "https://x"}, {"estado": "publicado"}):
            self.assertTrue(nucleo.fila_valida({**fila, **roto}), roto)

    def test_formatos_gigantes_se_maquetan_a_mitad(self):
        a3 = FORMATOS["cartel-a3"]
        self.assertEqual((a3["ancho"], a3["alto"]), (3508, 4961))
        self.assertEqual(nucleo.css_div(3508, 4961), 2)
        self.assertEqual(nucleo.css_div(1920, 1080), 1)
        f = nucleo.formato_css(a3, {"arriba": 200, "abajo": 201, "izquierda": 100, "derecha": 100}, [], 2)
        self.assertEqual((f["ancho"], f["alto"], f["dpr"], f["px_ancho"], f["px_alto"]), (1754, 2481, 2, 3508, 4961))
        self.assertEqual(f["margenes"]["abajo"], 101)

    def test_cfg_motor_del_cartel_y_del_reel(self):
        pz = next(p for p in CAMPANA["piezas"] if p["id"] == "cartel")
        t = nucleo.plan_pieza(CAMPANA, pz, FORMATOS)[0]
        cfg = nucleo.cfg_motor(CAMPANA, t)
        self.assertEqual(cfg["formato"]["dpr"], 2)
        self.assertEqual(cfg["modo"], "estatico")
        pz = next(p for p in CAMPANA["piezas"] if p["id"] == "reel")
        t = nucleo.plan_pieza(CAMPANA, pz, FORMATOS)[0]
        cfg = nucleo.cfg_motor(CAMPANA, t, borrador=True)
        self.assertEqual(cfg["formato"]["dpr"], 1)
        self.assertEqual(cfg["calidad"], "borrador")
        self.assertLess(cfg["escala3d"], 0.5)
        self.assertEqual(cfg["modo"], "video")

    def test_cada_camino_de_la_lista_se_ve_al_menos_dos_segundos(self):
        """Lección del reel: «Dona», el último de los cuatro caminos, estaba a la vista menos de un segundo."""
        vistos = 0
        for nombre, g in CAMPANA["guiones"].items():
            for idioma, beats in g.items():
                for b in beats:
                    if not b.get("lista"):
                        continue
                    vistos += 1
                    ultimo = max(it["t"] for it in b["lista"])
                    self.assertGreaterEqual(b["d"] - ultimo, 2.0, f"{nombre}/{idioma}: el último camino dura {b['d'] - ultimo:.2f} s")
        self.assertGreaterEqual(vistos, 6)  # reel, youtube y cuadrado, en es y en

    def test_los_beats_no_se_salen_del_vídeo(self):
        for p in CAMPANA["piezas"]:
            if p["salida"] != "video":
                continue
            for idioma, beats in CAMPANA["guiones"][p["guion"]].items():
                for b in beats:
                    if b.get("fin"):  # la tarjeta final no sale: se queda hasta el último fotograma
                        continue
                    self.assertLessEqual(b["t"] + b["d"], p["duracion"] + 0.01, f"{p['id']}/{idioma}: {b.get('titular')}")

    def test_los_pilares_del_arbol_acompanan_a_la_lista(self):
        """La rama que se ilumina y el camino de la lista salen a la vez (con 0,5 s de margen como mucho)."""
        for pid in ("reel", "youtube", "feed-cuadrado"):
            p = next(x for x in CAMPANA["piezas"] if x["id"] == pid)
            lista = next(b for b in CAMPANA["guiones"][p["guion"]]["es"] if b.get("lista"))
            tiempos = [lista["t"] + it["t"] for it in lista["lista"]]
            for a, b in zip(tiempos, p["escena"]["params"]["pilares_t"]):
                self.assertTrue(0 <= b - a <= 0.5, f"{pid}: lista {a:.2f} s, pilar {b:.2f} s")

    def test_los_banners_llevan_velo_propio_y_sin_codos(self):
        for p in CAMPANA["piezas"]:
            if p["id"].startswith("banner-"):
                self.assertIn("rgba(2,6,16,", p["velo"], p["id"])
                t = nucleo.plan_pieza(CAMPANA, p, FORMATOS)[0]
                self.assertEqual(nucleo.cfg_motor(CAMPANA, t)["velo"], p["velo"])

    def test_toda_pieza_tiene_version_en_ingles_si_la_declara(self):
        for p in CAMPANA["piezas"]:
            if "en" in p.get("idiomas", ["es"]) and p["salida"] != "carrusel" and p.get("guion"):
                self.assertIn("en", CAMPANA["guiones"][p["guion"]], p["id"])
        car = next(p for p in CAMPANA["piezas"] if p["id"] == "carrusel")
        self.assertEqual(len(car["laminas"]), 5)
        for lam in car["laminas"]:
            self.assertTrue(lam["es"] and lam["en"])


class Verificar(unittest.TestCase):
    def test_color_y_contraste(self):
        self.assertEqual(verificar.parse_color("rgb(255, 128, 0)"), (255, 128, 0))
        self.assertEqual(verificar.parse_color("rgba(1,2,3,0.5)"), (1, 2, 3))
        with self.assertRaises(ValueError):
            verificar.parse_color("azul")
        blanco, negro = verificar.luminancia((255, 255, 255)), verificar.luminancia((0, 0, 0))
        self.assertAlmostEqual(verificar.razon_contraste(blanco, negro), 21.0, places=2)
        self.assertAlmostEqual(verificar.razon_contraste(blanco, blanco), 1.0)

    def test_texto_grande_segun_wcag(self):
        self.assertTrue(verificar.es_texto_grande(24, 400))
        self.assertTrue(verificar.es_texto_grande(19, 700))
        self.assertFalse(verificar.es_texto_grande(19, 400))
        self.assertFalse(verificar.es_texto_grande(16, "bold"))

    def test_medir_contraste_sobre_imagen_real(self):
        img = Image.new("RGB", (200, 100), (2, 6, 16))
        img.paste((250, 250, 250), (100, 0, 200, 100))
        buf = io.BytesIO()
        img.save(buf, "PNG")
        capas = [
            {"id": "claro-sobre-oscuro", "rol": "t", "texto": "a", "rects": [[10, 10, 50, 20]], "color": "rgb(255,255,255)", "tam": 20, "peso": "700"},
            {"id": "claro-sobre-claro", "rol": "t", "texto": "b", "rects": [[110, 10, 50, 20]], "color": "rgb(255,255,255)", "tam": 20, "peso": "400"},
        ]
        r = {m["id"]: m for m in verificar.medir_contraste(buf.getvalue(), capas, 200, 100)}
        self.assertTrue(r["claro-sobre-oscuro"]["ok"])
        self.assertFalse(r["claro-sobre-claro"]["ok"])

    def test_zona_segura(self):
        fmt = {"ancho": 1080, "alto": 1920, "margenes": {"arriba": 200, "abajo": 400, "izquierda": 60, "derecha": 60}, "evitar": [{"izquierda": 800, "arriba": 900, "ancho": 200, "alto": 300, "motivo": "botones"}]}
        ok = {"id": "ok", "texto": "x", "rects": [[100, 300, 500, 100]]}
        fuera = {"id": "fuera", "texto": "x", "rects": [[100, 1700, 500, 100]]}
        tapado = {"id": "tapado", "texto": "x", "rects": [[700, 950, 300, 50]]}
        malas = verificar.comprobar_zona_segura([ok, fuera, tapado], fmt)
        self.assertEqual({m["id"] for m in malas}, {"fuera", "tapado"})
        self.assertAlmostEqual(verificar.interseccion((0, 0, 10, 10), (5, 5, 10, 10)), 25.0)
        self.assertEqual(verificar.interseccion((0, 0, 1, 1), (5, 5, 1, 1)), 0.0)

    def test_destellos_wcag_2_3_1(self):
        fps = 30
        quieto = [0.3] * 90
        self.assertEqual(verificar.destellos_por_segundo(quieto, fps), 0)
        lento = [0.3 + 0.25 * np.sin(2 * np.pi * i / 90) for i in range(180)]  # 1 ciclo cada 3 s
        self.assertLessEqual(verificar.destellos_por_segundo(lento, fps), 1)
        rapido = [0.2 if (i // 2) % 2 else 0.7 for i in range(90)]  # ~7,5 destellos por segundo
        self.assertGreater(verificar.destellos_por_segundo(rapido, fps), 3)
        gradual = [0.3 + 0.01 * (i % 2) for i in range(90)]  # parpadeo bajo el umbral
        self.assertEqual(verificar.destellos_por_segundo(gradual, fps), 0)

    def test_estatico_tamano_y_peso(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "a.png"
            Image.new("RGB", (300, 250), (10, 20, 30)).save(p)
            self.assertTrue(verificar.verificar_estatico(p, {"ancho": 300, "alto": 250, "tope_bytes": 150_000})["ok"])
            r = verificar.verificar_estatico(p, {"ancho": 728, "alto": 90, "tope_bytes": 10})
            self.assertEqual(len(r["problemas"]), 2)


class Servidor(unittest.TestCase):
    def test_solo_sirve_lo_permitido(self):
        self.assertIsNotNone(servidor.resolver("/plantilla/motor.js"))
        self.assertIsNotNone(servidor.resolver("/escenas/semilla-estelar.js?x=1"))
        self.assertIsNotNone(servidor.resolver("/vendor/three/build/three.module.js"))
        self.assertIsNotNone(servidor.resolver("/repo/public/starseed-symbol.png"))
        for malo in ("/plantilla/../../../../etc/passwd", "/repo/public/../.env", "/repo/public/.env.local", "/repo/public/index.html", "/otra/cosa", "/plantilla/", "//etc/passwd"):
            self.assertIsNone(servidor.resolver(malo), malo)


class Audio(unittest.TestCase):
    def test_sintesis_determinista_acotada_y_con_fundidos(self):
        a = audio.sintetizar(3.0, [0.5, 1.5], "semilla", [{"t": 1.0, "tipo": "germinar"}], semilla=5)
        b = audio.sintetizar(3.0, [0.5, 1.5], "semilla", [{"t": 1.0, "tipo": "germinar"}], semilla=5)
        c = audio.sintetizar(3.0, [0.5, 1.5], "semilla", [{"t": 1.0, "tipo": "germinar"}], semilla=6)
        self.assertEqual(a.shape, (int(3.0 * audio.SR), 2))
        self.assertTrue(np.array_equal(a, b))
        self.assertFalse(np.array_equal(a, c))
        self.assertLessEqual(float(np.max(np.abs(a))), 0.81)
        self.assertLess(float(np.abs(a[:50]).max()), 0.05)  # empieza en silencio
        self.assertLess(float(np.abs(a[-50:]).max()), 0.05)  # y acaba en silencio

    def test_wav_estereo_16_bits(self):
        import wave

        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "x.wav"
            audio.escribir_wav(p, audio.sintetizar(1.0, [0.2], "espiral", None, 1))
            with wave.open(str(p)) as w:
                self.assertEqual((w.getnchannels(), w.getsampwidth(), w.getframerate()), (2, 2, audio.SR))


class Manifiesto(unittest.TestCase):
    def test_sha256_y_entrada(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "x.bin"
            p.write_bytes(b"starseed")
            sha = manifiesto.sha256_archivo(p)
            self.assertEqual(sha, hashlib.sha256(b"starseed").hexdigest())
            self.assertRegex(sha, r"^[0-9a-f]{64}$")
            pz = next(x for x in CAMPANA["piezas"] if x["id"] == "imagen-cuadrada")
            t = nucleo.plan_pieza(CAMPANA, pz, FORMATOS)[0]
            e = manifiesto.entrada("siembra-starseed", pz, t.entregas[0], p, "es", "cristal-liquido", None, None, (1080, 1080), sha, {"archivo": True})
            self.assertEqual(e["tabla"]["estado"], "para_aprobar")
            self.assertEqual(e["problemas_tabla"], [])
            self.assertEqual(e["bytes"], 8)
            self.assertIsNone(e["duracion"])
            manifiesto.guardar_trabajo(Path(d), "t1", [e], {})
            self.assertTrue(json.loads((Path(d) / manifiesto.ESTADO / "t1.json").read_text())["entradas"])


if __name__ == "__main__":
    unittest.main()
