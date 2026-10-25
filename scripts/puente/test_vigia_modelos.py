# -*- coding: utf-8 -*-
"""Pruebas del director diario del vigía de modelos (VGM1016D · Ola 1016M).

Todo inyectado y SIN red: la API pública de Hugging Face y la de GitHub son un
getter falso con respuestas de ejemplo dentro de esta prueba; el disco solo en
carpetas temporales (novedades, colas, estado, catálogos y hasta el Chat Director).
Ninguna prueba toca el Chat Director real: `director_chat.publicar` recibe `raiz=`
apuntando a la carpeta temporal (y su guarda de pruebas además lo bloquearía).
"""
import copy
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vigia_areas as VA
import vigia_modelos as V

HOY = "2026-10-25"
SHA_A, SHA_B, SHA_D = "a" * 64, "b" * 64, "d" * 64
TURBO = {"id": "Qwen/Qwen-Image-2.1-Turbo", "tags": ["text-to-image", "license:qwen-research"],
         "createdAt": "2026-10-09T00:00:00Z"}
ZIMAGE = {"id": "Tongyi-MAI/Z-Image-Turbo", "tags": ["text-to-image", "license:apache-2.0"],
          "createdAt": "2025-11-25T00:00:00Z"}
GGUF = {"id": "unsloth/Qwen-Image-2.1-Turbo-GGUF", "tags": ["license:qwen-research"],
        "createdAt": "2026-10-10T00:00:00Z"}
AJENO_GGUF = {"id": "unsloth/OtraFamiliaCualquiera-GGUF", "tags": ["license:mit"]}
TIERCERO = {"id": "TerceroCualquiera/Cosmos-303", "tags": ["text-to-image", "license:mit"]}
PROHIBIDO = {"id": "Qwen/Qwen-Image-2.1-uncensored", "tags": ["text-to-image", "license:mit"]}
SIN_LICENCIA = {"id": "Qwen/Qwen-Image-3.0", "tags": ["text-to-image"]}
TREE_TURBO = [
    {"type": "file", "path": "Qwen-Image-2.1-Turbo-Q2_K.gguf", "size": 900000000,
     "lfs": {"oid": SHA_A, "size": 900000000}},
    {"type": "file", "path": "Turbo-Q3_K_S.gguf", "size": 3600000000,
     "lfs": {"oid": SHA_B, "size": 3600000000}},
    {"type": "file", "path": "Turbo-F16.gguf", "size": 14200000000,
     "lfs": {"oid": "c" * 64, "size": 14200000000}},
]
TREE_Z = [{"type": "file", "path": "z-image-turbo.safetensors", "size": 2500000000,
           "lfs": {"oid": SHA_D, "size": 2500000000}}]
TREE_GGUF = [{"type": "file", "path": "Turbo-Q3_K_S.gguf", "size": 3600000000,
              "lfs": {"oid": SHA_B, "size": 3600000000}}]
AREAS = VA.validar_areas({
    "cuantizadores": ["unsloth"],
    "licencias_conocidas": {"apache-2.0": "libre", "qwen-research": "personal", "mit": "libre"},
    "areas": [
        {"id": "imagen", "nombre": "Imagen", "pipeline_tags": ["text-to-image"],
         "autores": ["Qwen", "Tongyi-MAI"], "cuantizadores": ["unsloth"],
         "catalogo": "src/lib/imagenes/modelos.ts", "nota": ""},
        {"id": "motores", "nombre": "Motores", "pipeline_tags": [], "autores": [],
         "repos_github": ["ggml-org/llama.cpp"], "cuantizadores": [],
         "catalogo": "src/lib/library/packages.ts", "nota": ""},
    ],
})


def getter_de(extras=None):
    """La API falsa: cada URL esperada → su respuesta; cualquier otra es un fallo de test."""
    rutas = {
        "%s/models?pipeline_tag=text-to-image&sort=trendingScore&limit=30" % V.HF:
            [TURBO, TIERCERO, PROHIBIDO, SIN_LICENCIA],
        "%s/models?author=Qwen&sort=createdAt&limit=20" % V.HF: [],
        "%s/models?author=Tongyi-MAI&sort=createdAt&limit=20" % V.HF: [ZIMAGE],
        "%s/models?author=unsloth&sort=createdAt&limit=20" % V.HF: [GGUF, AJENO_GGUF],
        "%s/models/%s/tree/main" % (V.HF, TURBO["id"]): TREE_TURBO,
        "%s/models/%s/tree/main" % (V.HF, ZIMAGE["id"]): TREE_Z,
        "%s/models/%s/tree/main" % (V.HF, GGUF["id"]): TREE_GGUF,
    }
    rutas.update(extras or {})
    pedidas = []

    def getter(url):
        pedidas.append(url)
        if url in rutas:
            return rutas[url]
        raise RuntimeError("ruta no esperada: %s" % url)
    getter.pedidas = pedidas
    return getter


class PasadaDelVigia(unittest.TestCase):
    def _raiz(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        raiz = Path(tmp.name)
        p = raiz / "src" / "lib" / "imagenes"
        p.mkdir(parents=True)
        (p / "modelos.ts").write_text('const ID_ACTUAL = "Qwen/Qwen-Image-2.1"; // sin Turbo', "utf-8")
        (raiz / "src" / "lib" / "library").mkdir(parents=True, exist_ok=True)
        (raiz / "src" / "lib" / "library" / "packages.ts").write_text("", "utf-8")
        return raiz

    def test_pasada_completa_orquesta_descubre_evalua_cola_y_avisa(self):
        raiz = self._raiz()
        estado = raiz / "estado" / "vigia-modelos.json"
        resumen = V.pasada(AREAS, getter=getter_de(), hoy=HOY, solo_area="imagen", raiz=raiz,
                           estado=estado, chat_raiz=raiz)
        self.assertEqual(resumen["fichas"], ["VGM1025-1", "VGM1025-2", "VGM1025-3"])
        # Novedades atómicas: por área, aceptados con clase y archivo por medio (§6)
        nov = json.loads((raiz / "starseed_memory_root" / "vigia" / ("novedades-%s.json" % HOY))
                         .read_text("utf-8"))
        self.assertEqual([a["id"] for a in nov["areas"]], ["imagen"])
        imagen = nov["areas"][0]
        ids = {f["id"]: f for f in imagen["aceptados"]}
        self.assertEqual(sorted(ids), ["Qwen/Qwen-Image-2.1-Turbo", "Tongyi-MAI/Z-Image-Turbo",
                                       "unsloth/Qwen-Image-2.1-Turbo-GGUF"])
        self.assertEqual(ids["Qwen/Qwen-Image-2.1-Turbo"]["clase"], "personal")  # qwen-research
        self.assertEqual(ids["Tongyi-MAI/Z-Image-Turbo"]["clase"], "libre")  # apache-2.0
        nave = ids["Qwen/Qwen-Image-2.1-Turbo"]["archivos"]["navegador"]
        self.assertEqual((nave["archivo"], nave["sha256"][:3]), ("Qwen-Image-2.1-Turbo-Q2_K.gguf", "aaa"))
        self.assertEqual(ids["Qwen/Qwen-Image-2.1-Turbo"]["archivos"]["mac"]["archivo"], "Turbo-Q3_K_S.gguf")
        self.assertNotIn("F16", json.dumps(ids))  # 14 GB: no cabe ni en la Mac
        motivos = " ".join(d["motivo"] for d in imagen["descartados"])
        self.assertIn("seguridad", motivos)  # uncensored (§3)
        self.assertIn("sin clase conocida", motivos)  # sin etiqueta de licencia
        self.assertIn("tercero", motivos)  # autor fuera de las listas del área
        self.assertIn("no cuantiza nada ya aceptado", motivos)  # GGUF de otra familia
        # Cola: una tarea por ficha, con datos verificados y regla de licencia
        cola = json.loads((raiz / "starseed_memory_root" / "olas" / ("cola-vigia-%s.json" % HOY))
                          .read_text("utf-8"))
        self.assertEqual([t["id"] for t in cola], ["VGM1025-1", "VGM1025-2", "VGM1025-3"])
        self.assertEqual(cola[0]["titulo"], "Ficha de Qwen/Qwen-Image-2.1-Turbo al catálogo del área")
        self.assertEqual(cola[0]["archivos"], ["src/lib/imagenes/modelos.ts",
                                               "src/lib/imagenes/__tests__/modelos.test.ts"])
        pedido = cola[0]["prompt"]
        for trozo in ("FICHA VERIFICADA", "Qwen/Qwen-Image-2.1-Turbo", "personal", "qwen-research",
                      "no comercial", "HF_TOKEN", "Qwen-Image-2.1-Turbo-Q2_K.gguf", "sha256 " + SHA_A[:12],
                      "Turbo-Q3_K_S.gguf", "sha256 " + SHA_B[:12], "src/lib/imagenes/modelos.ts"):
            self.assertIn(trozo, pedido, trozo)
        self.assertNotIn(SHA_A, pedido.replace(SHA_A[:12], ""))  # el SHA entero, solo truncado
        # UNA publicación en el Chat Director, con lo nuevo de verdad
        chat = (raiz / "starseed_memory_root" / "mando" / "director" / "chat.jsonl").read_text("utf-8")
        lineas = [json.loads(l) for l in chat.splitlines() if l.strip()]
        self.assertEqual(len(lineas), 1)
        self.assertEqual(lineas[0]["de"], "vigia-modelos")
        self.assertEqual(lineas[0]["tipo"], "informe")
        for trozo in ("Qwen/Qwen-Image-2.1-Turbo", "VGM1025-3"):
            self.assertIn(trozo, lineas[0]["texto"])
        # Estado: última pasada e ids vistos (no se avisa dos veces de lo mismo)
        st = json.loads(estado.read_text("utf-8"))
        self.assertIn("ultima_pasada", st)
        self.assertIn("Qwen/Qwen-Image-2.1-Turbo", st["vistos"])
        self.assertEqual(st["vistos"]["Qwen/Qwen-Image-2.1-Turbo"], HOY)
        self.assertEqual(sorted(st), ["ultima_pasada", "vistos"])  # el estado no arrastra pesos ni SHAs

    def test_segunda_pasada_el_mismo_dia_no_repite_nada(self):
        raiz = self._raiz()
        estado = raiz / "estado" / "vigia-modelos.json"
        resumen1 = V.pasada(AREAS, getter=getter_de(), hoy=HOY, solo_area="imagen", raiz=raiz,
                            estado=estado, chat_raiz=raiz)
        self.assertEqual(len(resumen1["fichas"]), 3)
        resumen2 = V.pasada(AREAS, getter=getter_de(), hoy=HOY, solo_area="imagen", raiz=raiz,
                            estado=estado, chat_raiz=raiz)
        self.assertEqual(resumen2["fichas"], [])
        self.assertEqual([a["aceptados"] for a in resumen2["areas"]], [0])
        self.assertIn("sin novedades nuevas", resumen2["novedades"])
        chat = (raiz / "starseed_memory_root" / "mando" / "director" / "chat.jsonl").read_text("utf-8")
        self.assertEqual(len([l for l in chat.splitlines() if l.strip()]), 2)  # UN aviso por pasada

    def test_seco_no_escribe_cola_ni_avisa(self):
        raiz = self._raiz()
        estado = raiz / "estado" / "vigia.json"
        resumen = V.pasada(AREAS, getter=getter_de(), hoy=HOY, seco=True, raiz=raiz,
                           estado=estado, chat_raiz=raiz)
        self.assertEqual(resumen["fichas"], [])
        self.assertIsNone(resumen["aviso"])
        self.assertTrue((raiz / "starseed_memory_root" / "vigia" / ("novedades-%s.json" % HOY)).is_file())
        self.assertFalse((raiz / "starseed_memory_root" / "olas" / ("cola-vigia-%s.json" % HOY)).exists())
        self.assertFalse((raiz / "starseed_memory_root" / "mando").exists())
        st = json.loads(estado.read_text("utf-8"))  # el estado sí se deja
        self.assertIn("Qwen/Qwen-Image-2.1-Turbo", st["vistos"])

    def test_solo_area_limita_y_los_repos_de_github_solo_avisan(self):
        raiz = self._raiz()
        liberia = raiz / "src" / "lib" / "library"
        liberia.mkdir(parents=True, exist_ok=True)
        (liberia / "packages.ts").write_text('const CAT = "llama.cpp";', "utf-8")
        getter = getter_de({"https://api.github.com/repos/ggml-org/llama.cpp/releases/latest":
                            {"tag_name": "b1.58-2026"}})
        resumen = V.pasada(AREAS, getter=getter, hoy=HOY, solo_area="motores", raiz=raiz,
                           estado=raiz / "e.json", chat_raiz=raiz)
        nov = json.loads((raiz / "starseed_memory_root" / "vigia" / ("novedades-%s.json" % HOY))
                         .read_text("utf-8"))
        self.assertEqual([a["id"] for a in nov["areas"]], ["motores"])
        self.assertEqual(nov["areas"][0]["aceptados"], [])
        self.assertIn("repásala a mano", nov["areas"][0]["descartados"][0]["motivo"])
        self.assertEqual(resumen["fichas"], [])

    def test_la_cola_de_hoy_no_vuelve_a_avisar_lo_que_ya_tiene(self):
        raiz = self._raiz()
        estado = raiz / "e.json"
        V.pasada(AREAS, getter=getter_de(), hoy=HOY, raiz=raiz, estado=estado, chat_raiz=raiz)
        # Un catálogo que YA trae el Turbo (p. ej. porque la ficha se integró): ya no es candidato
        (raiz / "src" / "lib" / "imagenes" / "modelos.ts").write_text(
            'const IDS = ["Qwen/Qwen-Image-2.1-Turbo", "Tongyi-MAI/Z-Image-Turbo"];', "utf-8")
        resumen = V.pasada(AREAS, getter=getter_de(), hoy="2026-10-26", raiz=raiz,
                           estado=estado, chat_raiz=raiz)
        self.assertEqual(resumen["fichas"], [])
        self.assertEqual([a["aceptados"] for a in resumen["areas"]], [0, 0])


class PiezasPuras(unittest.TestCase):
    def test_ya_esta_distingue_por_comillas(self):
        texto = 'id: "Qwen/Qwen-Image-2.1" hf: \'unsloth/Qwen-Image-2.1-Turbo-GGUF\''
        self.assertFalse(V._ya_esta("Qwen/Qwen-Image-2.1-Turbo", texto))  # prefijo ≠ duplicado
        self.assertTrue(V._ya_esta("Qwen/Qwen-Image-2.1", texto))
        self.assertTrue(V._ya_esta("unsloth/Qwen-Image-2.1-Turbo-GGUF", texto))
        self.assertFalse(V._ya_esta("Qwen/Qwen-Image-2.1", "const id = Qwen/Qwen-Sin-Comillas;"))

    def test_archivos_por_medio_elige_el_mayor_que_cabe(self):
        medios = V.archivos_por_medio(V.pesos_del_arbol(TREE_TURBO))
        self.assertEqual(medios["navegador"]["archivo"], "Qwen-Image-2.1-Turbo-Q2_K.gguf")
        self.assertEqual(medios["mac"]["archivo"], "Turbo-Q3_K_S.gguf")
        self.assertEqual(medios["mac"]["sha256"], SHA_B)
        self.assertEqual(medios["a1"]["archivo"], "Turbo-Q3_K_S.gguf")
        self.assertIsNone(V.archivos_por_medio([{"archivo": "f16.gguf", "sha256": None, "bytes": 2 * 10**9}])["navegador"])

    def test_pesos_del_arbol_solo_pesa_mmproj_se_queda_fuera(self):
        arbol = TREE_TURBO + [{"type": "file", "path": "mmproj-model.gguf", "size": 600000000},
                              {"type": "file", "path": "README.md", "size": 900}]
        pesos = V.pesos_del_arbol(arbol)
        self.assertFalse(any("mmproj" in p["archivo"] or "README" in p["archivo"] for p in pesos))
        self.assertTrue(all(p["sha256"] for p in pesos))  # los del árbol con LFS trae sha real

    def test_cuantizador_exige_familia_de_una_base_aceptada(self):
        bases = ["Qwen/Qwen-Image-2.1-Turbo", "Tongyi-MAI/Z-Image-Turbo"]
        self.assertTrue(V._cuantiza("unsloth/Qwen-Image-2.1-Turbo-GGUF", bases))
        self.assertTrue(V._cuantiza("city96/Z-Image-Turbo-onnx", bases))
        self.assertFalse(V._cuantiza("unsloth/OtraFamiliaCualquiera-GGUF", bases))

    def test_a_tareas_techo_de_cinco_e_ids_sin_pisar_historico(self):
        fichas = [{"id": "m/%d" % i, "area": "imagen", "catalogo": "src/lib/x.ts", "clase": "libre",
                   "archivos": {}, "fecha": HOY} for i in range(7)]
        tareas = V.a_tareas(fichas, HOY)
        self.assertEqual(len(tareas), 5)  # §6: como mucho 5 al día
        self.assertEqual([t["id"] for t in tareas], ["VGM1025-%d" % i for i in range(1, 6)])
        self.assertTrue(all(t["estado"] == "pendiente" and t["origen"] == "vigia-modelos" for t in tareas))
        tareas2 = V.a_tareas(fichas, HOY, usados=["VGM1025-1", "VGM1025-3"])
        self.assertEqual([t["id"] for t in tareas2], ["VGM1025-2", "VGM1025-4", "VGM1025-5",
                                                      "VGM1025-6", "VGM1025-7"])
        self.assertNotIn(tareas2[0]["prompt"], "", "el prompt nunca vacío")
        self.assertEqual(tareas2[0]["archivos"], ["src/lib/x.ts", "src/lib/__tests__/x.test.ts"])


if __name__ == "__main__":
    unittest.main()
