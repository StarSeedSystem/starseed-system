#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del director diario del vigía de modelos (Ola 1016M · VGM1016Db-d2).

Sin red: las respuestas de Hugging Face son de ejemplo y van dentro de esta
prueba; reloj, pausas, disco (raíz temporal) y Chat Director inyectados. Siguen
el caso real del 2026-10-16: Qwen-Image-2.1-Turbo (licencia Qwen Research:
personal, nunca por defecto), su cuantizado unsloth GGUF y Z-Image-Turbo
(Apache-2.0: libre). Nada de valores de claves: HF_TOKEN solo como NOMBRE.
"""
import json
import os
import sys
import tempfile
import types
import unittest
from datetime import datetime, timedelta, timezone
from urllib.parse import unquote

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import vigia_areas as VA  # noqa: E402
import vigia_modelos as VM  # noqa: E402

AHORA = datetime(2026, 10, 28, 12, 0, tzinfo=timezone.utc)
FECHA = "2026-10-28"
SHA1, SHA2 = "1" * 64, "2" * 64
ISOS = "2026-10-25T00:00:00.000Z"


def modelo(id_modelo, licencia="apache-2.0", pipeline="text-to-image", gated=False):
    """Como lo devuelve la lista de Hugging Face (creado reciente, con likes)."""
    return {"id": id_modelo, "author": id_modelo.rpartition("/")[0], "created_at": ISOS,
            "last_modified": ISOS, "pipeline_tag": pipeline, "likes": 10, "trending_score": 9.0,
            "license": licencia, "gated": gated}


# Casos reales: Turbo (personal) + FLUX «other» (se refina) en imagen; Z-Image (libre) en vídeo.
TREND_IMAGEN = [
    modelo("Qwen/Qwen-Image-2.1-Turbo", "qwen-research", gated=True),
    modelo("black-forest-labs/FLUX.1-dev", "other"),
]
TREND_VIDEO = [modelo("Tongyi-MAI/Z-Image-Turbo", "apache-2.0", "text-to-video")]
AUTOR_QWEN = []
CUANT_UN = [modelo("unsloth/Qwen-Image-2.1-Turbo-GGUF", "other")]
BLOBS = {
    "Qwen/Qwen-Image-2.1-Turbo": [
        {"rfilename": "qwen-image-2.1-turbo-bf16.safetensors", "size": 14200000000,
         "lfs": {"sha256": SHA1}}],
    "unsloth/Qwen-Image-2.1-Turbo-GGUF": [
        {"rfilename": "Qwen-Image-2.1-Turbo-Q2_K.gguf", "size": 2470000000,
         "lfs": {"sha256": SHA2}},
        {"rfilename": "Qwen-Image-2.1-Turbo-Q3_K_S.gguf", "size": 2720000000,
         "lfs": {"sha256": SHA2}}],
    "Tongyi-MAI/Z-Image-Turbo": [
        {"rfilename": "z-image-turbo.safetensors", "size": 6400000000, "lfs": {"sha256": SHA2}}],
}
DETALLES = {"black-forest-labs/FLUX.1-dev":
            {"tags": ["license:flux-1-dev-non-commercial-license"]}}


class Simulador:
    """Hace de red: cuerpo grabado por URL, y anota cabeceras y pausas."""

    def __init__(self, extra=(), con_detalle=True):
        self.grabado = [
            ("pipeline_tag=text-to-image", TREND_IMAGEN + list(extra)),
            ("pipeline_tag=text-to-video", TREND_VIDEO),
            ("pipeline_tag=", []),
            ("author=Qwen&sort=createdAt", AUTOR_QWEN),
            ("author=unsloth", CUANT_UN),
            ("author=", []),
            ("search=", []),
        ]
        self.detalles = dict(DETALLES) if con_detalle else {}
        self.peticiones, self.pausas = [], []

    def dormir(self, segundos):
        self.pausas.append(segundos)

    def _cuerpo(self, url):
        if "blobs=true" in url:
            id_modelo = unquote(url.rsplit("/api/models/", 1)[1].split("?blobs=true")[0])
            return {"siblings": BLOBS.get(id_modelo, [])}
        trozo_url = url.split("/api/models/")[-1]
        if unquote(trozo_url) in self.detalles:  # detalle del repo: sin «?»
            return self.detalles[unquote(trozo_url)]
        if "?" in trozo_url:  # listados: el primer trozo que pega
            for clave, cuerpo in self.grabado:
                if clave in url:
                    return cuerpo
        return None

    def http_get(self, url, headers=None, timeout=30):
        self.peticiones.append({"url": url, "cabeceras": dict(headers or {})})
        cuerpo = self._cuerpo(url)
        if cuerpo is None:
            raise RuntimeError(f"Petición sin respuesta grabada: {url}")
        return json.dumps(cuerpo)


_DATOS_AREAS = {
    "cuantizadores": ["unsloth"],
    "licencias_conocidas": {"apache-2.0": "libre", "qwen-research": "personal",
                            "flux-1-dev-non-commercial-license": "personal",
                            "other": "desconocida"},
    "areas": [
        {"id": "imagen", "nombre": "Imagen", "pipeline_tags": ["text-to-image"],
         "autores": ["Qwen"], "cuantizadores": ["unsloth"], "catalogo": "r/cat-imagen.ts"},
        {"id": "video", "nombre": "Vídeo", "pipeline_tags": ["text-to-video"],
         "autores": ["Tongyi-MAI"], "catalogo": "r/cat-video.ts"},
    ],
}
AREAS = VA.validar_areas(_DATOS_AREAS, None, "test-vigia-areas.json")
AREA_IMAGEN, AREA_VIDEO = AREAS


def correr(raiz, red=None, seco=False, solo_area=None, extra=(), estado_viejo=None,
           colas_existentes=None, publicar=None):
    """Una pasada completa contra una raíz temporal; devuelve (resultado, red)."""
    red = red or Simulador(extra)
    estado_ruta = os.path.join(raiz, "estado.json")
    if estado_viejo is not None:
        with open(estado_ruta, "w", encoding="utf-8") as f:
            json.dump(estado_viejo, f)
    r = VM.pasada(AREAS, red.http_get, raiz=raiz, ahora=AHORA, seco=seco,
                  solo_area=solo_area, dormir=red.dormir, estado_ruta=estado_ruta,
                  publicar=publicar, colas_existentes=colas_existentes)
    r["_estado_ruta"] = estado_ruta
    return r, red


def leer_json(ruta):
    with open(str(ruta), encoding="utf-8") as f:
        return json.load(f)


def raiz_temporal():
    return tempfile.mkdtemp(prefix="vigia-modelos-")


class PruebaEvaluar(unittest.TestCase):
    """evaluar_candidato puro: clase de licencia, seguridad y cuantizados (§3-§4)."""

    @staticmethod
    def evaluar(id_modelo, licencia, **cand):
        base = {"id": id_modelo, "autor": id_modelo.rpartition("/")[0],
                "licencia_hf": licencia, "archivos": []}
        base.update(cand)
        return VM.evaluar_candidato(base, _DATOS_AREAS["licencias_conocidas"],
                                    ("unsloth",), cand.get("ids_aceptados", ()),
                                    cand.get("clases_aceptados"))

    def test_libre_aceptado_y_por_defecto(self):
        d = self.evaluar("Tongyi-MAI/Z-Image-Turbo", "apache-2.0")
        self.assertEqual(d["decision"], "aceptado")
        self.assertEqual(d["clase"], "libre")
        self.assertTrue(d["por_defecto"])
        self.assertFalse(d["personal"])

    def test_personal_aceptado_pero_nunca_por_defecto(self):
        d = self.evaluar("Qwen/Qwen-Image-2.1-Turbo", "qwen-research")
        self.assertEqual(d["decision"], "aceptado")
        self.assertEqual(d["clase"], "personal")
        self.assertTrue(d["personal"])
        self.assertFalse(d["por_defecto"])

    def test_desconocida_fuera(self):
        d = self.evaluar("autor-raro/modelo", "other")
        self.assertEqual(d["decision"], "descartado")
        self.assertIn("desconocida", d["motivo"])

    def test_marca_uncensored_fuera(self):
        d = self.evaluar("KasugaiSakura/Qwen-Image-2.1-Uncensored", "qwen-research")
        self.assertEqual(d["decision"], "descartado")
        self.assertEqual(d["clase"], "desconocida")

    def test_cuantizado_de_un_aceptado_hereda_su_clase(self):
        d = VM.evaluar_candidato(
            {"id": "unsloth/Qwen-Image-2.1-Turbo-GGUF", "autor": "unsloth",
             "licencia_hf": "other", "archivos": []},
            _DATOS_AREAS["licencias_conocidas"], ("unsloth",),
            ("Qwen/Qwen-Image-2.1-Turbo",),
            {"Qwen/Qwen-Image-2.1-Turbo": "personal"})
        self.assertEqual(d["decision"], "aceptado")
        self.assertEqual(d["clase"], "personal")
        self.assertIn("Qwen/Qwen-Image-2.1-Turbo", d["motivo"])

    def test_tercero_sin_base_aceptada_fuera(self):
        d = VM.evaluar_candidato(
            {"id": "unsloth/Modelo-Desconocido-GGUF", "autor": "unsloth",
             "licencia_hf": "other", "archivos": []},
            _DATOS_AREAS["licencias_conocidas"], ("unsloth",), (), {})
        self.assertEqual(d["decision"], "descartado")


class PruebaMedioYTareas(unittest.TestCase):
    """Archivo por medio, ficha de cola y resumen del Chat Director."""

    def test_archivo_el_mayor_que_cabe_cada_medio(self):
        archivos = [{"nombre": "micro-q2.gguf", "bytes": int(8e8), "sha256": SHA1},
                    {"nombre": "medio-q3.gguf", "bytes": int(4e9), "sha256": SHA1},
                    {"nombre": "grande-f16.safetensors", "bytes": int(14e9), "sha256": SHA1}]
        medios = VM._archivo_por_medio(archivos)
        por_medio = {m["medio"]: m for m in medios}
        self.assertEqual(por_medio["navegador"]["archivo"], "micro-q2.gguf")
        self.assertEqual(por_medio["mac"]["archivo"], "medio-q3.gguf")
        self.assertEqual(por_medio["a1"]["archivo"], "medio-q3.gguf")
        self.assertEqual(por_medio["mac"]["motor"], "sdcpp")

    def test_ficha_lleva_datos_y_regla_de_licencia(self):
        aceptado = {"id": "Qwen/Qwen-Image-2.1-Turbo", "clase": "personal",
                    "tamanio_gb": 2.47, "gated": True, "licencia": "qwen-research",
                    "medios": [{"sha256": SHA1}]}
        t = VM._nueva_tarea(aceptado, AREA_IMAGEN, "qwen-research", 1, AHORA, None)
        self.assertEqual(t["id"], "VIG261028-1")
        self.assertEqual(t["area"], "vigia-imagen")
        self.assertEqual(t["archivos"], [AREA_IMAGEN["catalogo"]])  # sin prueba: solo el catálogo
        self.assertIn("Qwen/Qwen-Image-2.1-Turbo", t["prompt"])
        self.assertIn("NUNCA como opción por defecto", t["prompt"])
        self.assertIn("PERSONAL", t["prompt"])
        self.assertIn("HF_TOKEN", t["prompt"])  # el NOMBRE, nunca un valor
        self.assertNotIn("Bearer", t["prompt"])

    def test_ficha_suma_la_prueba_si_existe_junto_al_catalogo(self):
        raiz = raiz_temporal()
        self.addCleanup(lambda: os.system("rm -rf '%s'" % raiz))
        os.makedirs(os.path.join(raiz, "r", "__tests__"))
        with open(os.path.join(raiz, "r", "__tests__", "cat-imagen.test.ts"), "w") as f:
            f.write("// prueba")
        aceptado = {"id": "x/y", "clase": "libre", "tamanio_gb": 1, "gated": False,
                    "licencia": "", "medios": []}
        t = VM._nueva_tarea(aceptado, AREA_IMAGEN, "apache-2.0", 2, AHORA, raiz)
        self.assertEqual(t["archivos"], ["r/cat-imagen.ts", "r/__tests__/cat-imagen.test.ts"])

    def test_resumen_una_linea_por_area_con_novedad(self):
        por_area = [{"area": "imagen", "nombre": "Imagen", "catalogo": "r/cat.ts",
                     "aceptados": [{"id": "a/b"}, {"id": "c/d"}], "descartados": [{"id": "e/f"}]},
                    {"area": "video", "nombre": "Vídeo", "catalogo": "r/v.ts",
                     "aceptados": [], "descartados": []}]
        resumen = VM._resumen(por_area, [("imagen", {"id": "a/b"})], FECHA)
        self.assertIn("*Vigía de modelos · 2026-10-28*", resumen)
        self.assertIn("· Imagen: aceptados `a/b`, `c/d`; descartados 1", resumen)
        self.assertNotIn("· Vídeo", resumen)  # el área sin nada no sale
        self.assertIn("Fichas a cola (1/5 máx.): `a/b`", resumen)


class SuperPrueba(unittest.TestCase):
    def setUp(self):  # cada prueba: su propia raíz, para no dejar nada compartido
        self.raiz = raiz_temporal()
        self.addCleanup(lambda: os.system("rm -rf '%s'" % self.raiz))


class PruebaPasada(SuperPrueba):
    """pasada completa con raíz, reloj, red y Chat Director inyectados (sin disco real)."""

    @staticmethod
    def graba_publicar():
        textos = []
        def publica(texto):
            textos.append(texto)
        return publica, textos

    def _novedades(self):
        return leer_json(os.path.join(self.raiz, "starseed_memory_root", "vigia",
                                      f"novedades-{FECHA}.json"))

    def _cola(self):
        return leer_json(os.path.join(self.raiz, "starseed_memory_root", "olas",
                                      f"cola-vigia-{FECHA}.json"))

    def ids_aceptados(self, novedades):
        return {d["id"] for a in novedades["areas"] for d in a["aceptados"]}

    def test_deja_novedades_cola_aviso_y_estado(self):
        publica, textos = self.graba_publicar()
        r, _ = correr(self.raiz, publicar=publica)
        # — novedades: por área, con clase, medios y SHA —
        nv = self._novedades()
        self.assertEqual([a["area"] for a in nv["areas"]], ["imagen", "video"])
        aceptados = {a["area"]: sorted(d["id"] for d in a["aceptados"]) for a in nv["areas"]}
        self.assertEqual(aceptados["imagen"],
                         ["Qwen/Qwen-Image-2.1-Turbo",
                          "black-forest-labs/FLUX.1-dev",
                          "unsloth/Qwen-Image-2.1-Turbo-GGUF"])
        self.assertEqual(aceptados["video"], ["Tongyi-MAI/Z-Image-Turbo"])
        turbo = next(d for a in nv["areas"] for d in a["aceptados"]
                     if d["id"] == "Qwen/Qwen-Image-2.1-Turbo")
        self.assertEqual(turbo["clase"], "personal")
        self.assertTrue(any(m.get("sha256") == SHA1 for m in turbo["medios"]))
        # — FLUX se refina con el detalle: «other» → personal —
        flux = next(d for a in nv["areas"] for d in a["aceptados"]
                    if d["id"] == "black-forest-labs/FLUX.1-dev")
        self.assertEqual(flux["clase"], "personal")
        # — cola: ≤ 5 tareas, la libre primero —
        cola = self._cola()
        self.assertEqual(len(cola), 4)
        self.assertEqual(cola[0]["area"], "vigia-video")  # Z-Image: libre, la primera
        self.assertIn("REGLA DE LICENCIA", cola[0]["prompt"])
        self.assertIn("apache-2.0", cola[0]["prompt"])
        # — resumen publicado UNA vez, y estado con vistos y aviso de hoy —
        self.assertEqual(len(textos), 1)
        self.assertIn("*Vigía de modelos · 2026-10-28*", textos[0])
        estado = leer_json(r["_estado_ruta"])
        self.assertEqual(estado["aviso"], FECHA)
        for esperado in ("Qwen/Qwen-Image-2.1-Turbo", "Tongyi-MAI/Z-Image-Turbo"):
            self.assertIn(esperado, estado["vistos"])

    def test_cola_tope_de_cinco(self):
        """Con 6 libres aceptados solo van a cola los 5 primeros (y todos quedan en novedades)."""
        extra = tuple(modelo(f"granja-auto/extra-{i}") for i in range(5))
        publica, _ = self.graba_publicar()
        r, _ = correr(self.raiz, publicar=publica, extra=extra)
        self.assertEqual(r["fichas"], 5)
        cola = self._cola()
        self.assertEqual(len(cola), 5)
        titulos = [t["titulo"] for t in cola]
        self.assertIn("extra-0", titulos[0])
        self.assertNotIn("Z-Image-Turbo", "".join(titulos))  # la 6.ª libre se queda fuera
        nv = self._novedades()
        for i in range(5):
            self.assertIn(f"granja-auto/extra-{i}", self.ids_aceptados(nv))

    def test_segunda_pasada_no_avisa_ni_repite(self):
        publica, textos = self.graba_publicar()
        correr(self.raiz, publicar=publica)
        self.assertEqual(len(textos), 1)
        r, _ = correr(self.raiz, publicar=publica)  # el estado persiste en la misma raíz
        self.assertEqual(r["fichas"], 0)
        self.assertIsNone(r["resumen"])
        self.assertEqual(len(textos), 1)  # EL aviso del día: una vez
        nv = self._novedades()
        turbo = next(d for a in nv["areas"] for d in a["descartados"]
                     if d["id"] == "Qwen/Qwen-Image-2.1-Turbo")
        self.assertIn("ya está en el catálogo", turbo["motivo"])

    def test_seco_no_escribe_cola_ni_avisa_ni_marca_vistos(self):
        publica, textos = self.graba_publicar()
        r, _ = correr(self.raiz, seco=True, publicar=publica)
        self.assertIsNone(r["cola"])
        self.assertEqual(r["fichas"], 0)
        self.assertIsNone(r["resumen"])
        self.assertEqual(textos, [])
        self.assertTrue(os.path.exists(os.path.join(
            self.raiz, "starseed_memory_root", "vigia", f"novedades-{FECHA}.json")))
        self.assertFalse(os.path.exists(r["_estado_ruta"]))
        self.assertEqual(r["estado"]["vistos"], [])

    def test_solo_area_filtra(self):
        r, red = correr(self.raiz, solo_area="video")
        nv = self._novedades()
        self.assertEqual([a["area"] for a in nv["areas"]], ["video"])
        urls = [p["url"] for p in red.peticiones]
        self.assertTrue(any("text-to-video" in u for u in urls))
        self.assertFalse(any("text-to-image" in u for u in urls))
        self.assertEqual(r["fichas"], 1)

    def test_lo_del_catalogo_no_vuelve_nunca(self):
        os.makedirs(os.path.join(self.raiz, "r"))
        with open(os.path.join(self.raiz, "r", "cat-imagen.ts"), "w") as f:
            f.write('`Qwen/Qwen-Image-2.1`\n')
        r, _ = correr(self.raiz)
        nv = self._novedades()
        for area in nv["areas"]:
            for destino in ("aceptados", "descartados"):
                self.assertNotIn("Qwen/Qwen-Image-2.1", [d["id"] for d in area[destino]])

    def test_lo_que_ya_viaja_en_una_cola_se_descarta(self):
        r, _ = correr(self.raiz, colas_existentes=["Qwen/Qwen-Image-2.1-Turbo"])
        nv = self._novedades()
        turbo = next(d for a in nv["areas"] for d in a["descartados"]
                     if d["id"] == "Qwen/Qwen-Image-2.1-Turbo")
        self.assertIn("ya está en el catálogo, en una cola o lo vimos antes", turbo["motivo"])
        self.assertNotIn(turbo["id"], self.ids_aceptados(nv))

    def test_sin_detallar_licencia_queda_descartada(self):
        r, _ = correr(self.raiz, red=Simulador(con_detalle=False))
        nv = self._novedades()
        flux = next(d for a in nv["areas"] for d in a["descartados"]
                    if d["id"] == "black-forest-labs/FLUX.1-dev")
        self.assertIn("desconocida", flux["motivo"])
        self.assertNotIn(flux["id"], self.ids_aceptados(nv))


class PruebaAuxiliares(SuperPrueba):
    """toca_pasada (puro), escritura atómica, refinado de licencia, ids de colas y publicador."""

    def test_toca_pasada_pura(self):
        m_20h_a_antes = (AHORA - timedelta(hours=24)).isoformat()
        m_10h = (AHORA - timedelta(hours=10)).isoformat()
        self.assertTrue(VM.toca_pasada(None, AHORA))
        self.assertTrue(VM.toca_pasada({"ultima": m_20h_a_antes}, AHORA, horas=20))
        self.assertFalse(VM.toca_pasada({"ultima": m_10h}, AHORA, horas=20))
        self.assertTrue(VM.toca_pasada({"ultima": "no-es-una-fecha"}, AHORA))
        self.assertTrue(VM.toca_pasada({}, AHORA))

    def test_escritura_atomica_reemplaza_y_no_deja_tmp(self):
        destino = os.path.join(self.raiz, "casa", "dato.json")
        VM._escribir_atomico(destino, {"a": 1})
        self.assertEqual(leer_json(destino), {"a": 1})
        VM._escribir_atomico(destino, {"b": 2})
        self.assertEqual(leer_json(destino), {"b": 2})
        restos = [n for n in os.listdir(os.path.dirname(destino)) if n.endswith(".tmp")]
        self.assertEqual(restos, [])

    def test_refinar_licencia_toma_el_tag_y_gasta_poder(self):
        red = Simulador()
        nivel = {"poder": 1}
        lic = VM._refinar_licencia({"id": "black-forest-labs/FLUX.1-dev"}, nivel,
                                   red.http_get, red.dormir)
        self.assertEqual(lic, "flux-1-dev-non-commercial-license")
        self.assertEqual(nivel["poder"], 0)
        self.assertIsNone(VM._refinar_licencia({"id": "black-forest-labs/FLUX.1-dev"},
                                              nivel, red.http_get, red.dormir))
        self.assertLessEqual(len(red.pausas), 2)

    def test_refinar_licencia_red_caida_nada(self):
        class RedRota:
            def http_get(self, url, headers=None, timeout=30):
                raise RuntimeError("Red caída (simulada)")
        nivel = {"poder": 5}
        self.assertIsNone(VM._refinar_licencia({"id": "algo/otro"}, nivel,
                                              RedRota().http_get, lambda s: None))
        self.assertEqual(nivel["poder"], 4)  # el intento cuenta igual

    def test_ids_en_colas_lee_olas_y_enjambre(self):
        carpeta = os.path.join(self.raiz, "starseed_memory_root", "olas")
        os.makedirs(carpeta)
        with open(os.path.join(carpeta, "cola-x.json"), "w", encoding="utf-8") as f:
            f.write('`unsloth/Qwen-Image-2.1-Turbo-GGUF`\n')
        os.makedirs(os.path.join(self.raiz, "enjambre", "colas"))
        with open(os.path.join(self.raiz, "enjambre", "colas", "y.json"), "w",
                  encoding="utf-8") as f:
            f.write('id: "Tongyi-MAI/Z-Image-Turbo"\n')
        ids = VM._ids_en_colas(self.raiz)
        self.assertIn("unsloth/Qwen-Image-2.1-Turbo-GGUF", ids)
        self.assertIn("Tongyi-MAI/Z-Image-Turbo", ids)
        self.assertEqual(VM._ids_en_colas(raiz_temporal()), set())

    def test_ids_en_catalogo_del_texto_o_del_disco(self):
        vacio = VM.ids_en_catalogo("r/no-hay.ts", self.raiz)
        self.assertIsNone(vacio)
        f = os.path.join(self.raiz, "r", "cat.ts")
        os.makedirs(os.path.dirname(f))
        with open(f, "w", encoding="utf-8") as fh:
            fh.write('id "Qwen/Qwen-Image-2.1"')
        self.assertIn("Qwen/Qwen-Image-2.1", VM.ids_en_catalogo("r/cat.ts", self.raiz))
        self.assertIn("Autor/Qwen-2", VM.ids_en_catalogo("lo/que/sea", None,
                                                        leer_texto=lambda r: "`Autor/Qwen-2`"))

    def test_publicador_manda_al_chat_director_como_vigia(self):
        caja = []
        trozo = types.ModuleType("director_chat_test_stub")
        trozo.publicar = lambda texto, **k: caja.append((texto, k))
        sys.modules["director_chat_test_stub"] = trozo
        self.addCleanup(sys.modules.pop, "director_chat_test_stub")
        VM._publicador("director_chat_test_stub")("resumen de novedades")
        texto, kwargs = caja[0]
        self.assertEqual(texto, "resumen de novedades")
        self.assertEqual(kwargs["de"], "vigia-modelos")
        self.assertEqual(kwargs["rol"], "director")
        self.assertEqual(kwargs["tipo"], "informe")

    def test_fallo_del_aviso_no_tumba_la_pasada(self):
        def publica_roto(texto):
            raise RuntimeError("Chat Director caído (simulado)")
        r, _ = correr(self.raiz, publicar=publica_roto)
        self.assertEqual(r["fichas"], 4)  # la cola sí se escribió
        self.assertIn("aviso no publicado", r["resumen"])


if __name__ == "__main__":
    unittest.main()
