#!/usr/bin/env python3
"""(VER1111F) Aprobar una versión de prueba → el director lanza las oficiales desde el commit probado.

Contrato: architecture/centro-versiones-1105.md §10. Todo con medios falsos y carpetas temporales: ningún
workflow, etiqueta, push ni petición en la carpeta real `~/.starseed/produccion/`.
"""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import director_lanzamientos as D  # noqa: E402
import lanzamientos_logica as L  # noqa: E402
from test_director_lanzamientos import CFG, Falsos  # noqa: E402

#: Los tres archivos de versión, mínimos (las anclas de `L.aplicar_version`): la prueba no depende de `native/`.
ARCHIVOS = {
    "native/src-tauri/tauri.conf.json": '{\n  "productName": "StarSeed OS",\n  "version": "0.5.0"\n}\n',
    "native/src-tauri/Cargo.toml": '[package]\nname = "starseed-native"\nversion = "0.5.0"\n',
    "src/lib/version/os-release.ts": ('export const OS_VERSION = "2026.11.10";\nexport const OS_FECHA = "2026-11-10";\n'
                                      'export const OS_NOTAS =\n  "notas";\nexport const NATIVE_VERSION = "0.5.0";\n'),
}
PROBADO = "a" * 40
CABEZA = "f" * 40  # lo que los falsos devuelven a `git rev-parse`


def peticion(version="0.5.1-prueba.36", sha=PROBADO, lanzar=None, quien="genesis"):
    p = {"accion": "aprobar-prueba", "version": version, "sha": sha, "quien": quien, "t": "2026-11-11T10:00:00Z"}
    if lanzar:
        p["lanzar_sha"] = lanzar
    return p


class FalsosAprobacion(Falsos):
    """Falsos del director + un repo temporal con los tres archivos de versión y un commit-seguro de mentira."""

    def __init__(self, archivos=None, en_main=True, publicado=True, lider=True):
        super().__init__(archivos)
        for r in D.ARCHIVOS_VERSION:
            os.makedirs(os.path.dirname(os.path.join(self.raiz, r)), exist_ok=True)
            with open(os.path.join(self.raiz, r), "w", encoding="utf-8") as f:
                f.write(ARCHIVOS[r])
        os.makedirs(os.path.join(self.raiz, "scripts", "puente"), exist_ok=True)
        cerrojo = os.path.join(self.raiz, "integrar.lock")
        with open(os.path.join(self.raiz, "scripts", "puente", "commit-seguro.py"), "w") as f:
            f.write("CERROJO = %r\ndef esperar_momento_seguro(tope_s=600):\n    return True\n" % cerrojo)
        self.en_main = en_main
        self.borradas = []
        self.es_lider = lider
        if publicado:
            self.archivos[D.AP.ESTADO] = {"fase": "publicado", "sha": CABEZA}

    def git(self, args, timeout=180):
        if args[0] == "merge-base":
            self.ordenes.append(["git"] + args)
            return (0 if self.en_main else 1), "", ""
        return super().git(args, timeout)

    def borrar(self, ruta):
        self.borradas.append(ruta)
        self.archivos.pop(ruta, None)

    def lider(self, ahora=None):
        return (True, "") if self.es_lider else (False, "no soy el líder")

    def peligrosas(self):
        """Órdenes que lanzarían algo de verdad: etiquetas, pushes, workflows, releases."""
        return [o for o in self.ordenes if o[:2] in (["git", "tag"], ["git", "push"]) or o[:3] in (
            ["gh", "workflow", "run"], ["gh", "release", "edit"])]


PAUSADO = {"fase": "esperando-publicacion", "pausado": True, "lista_sha": "e" * 40, "historial": []}


class Logica(unittest.TestCase):
    def test_version_oficial_de_la_prueba(self):
        self.assertEqual(L.version_oficial_de_prueba("0.5.1-prueba.36"), "0.5.1")
        self.assertIsNone(L.version_oficial_de_prueba("0.5.1"))
        self.assertIsNone(L.version_oficial_de_prueba("prueba36"))

    def test_peticion_valida_y_normalizada(self):
        ok, _, a = L.validar_peticion_aprobacion(peticion())
        self.assertTrue(ok)
        self.assertEqual((a["oficial"], a["prueba"], a["lanzar_sha"]), ("0.5.1", 36, PROBADO))

    def test_peticiones_malas(self):
        for p, palabra in ((peticion(sha="abc"), "commit"), (peticion(version="0.5.1"), "versión"),
                           (peticion(quien="agente"), "Genesis local"), ({"accion": "lanzar"}, "aprobación"),
                           (peticion(lanzar="zz"), "commit")):
            ok, motivo, _ = L.validar_peticion_aprobacion(p)
            self.assertFalse(ok)
            self.assertIn(palabra, motivo)

    def test_decision(self):
        base = {"fase": "esperando-lista"}
        self.assertTrue(L.decidir_aprobacion(base, peticion(), "0.5.0", True, True)[0])
        casos = (
            (base, "0.5.0", False, True, "origin/main"),
            (base, "0.5.0", True, False, "no contiene"),
            (base, "0.5.1", True, True, "más nueva"),
            ({"fase": "compilando"}, "0.5.0", True, True, "a medias"),
            ({"fase": "esperando-publicacion", "preparado_sha": "b" * 40}, "0.5.0", True, True, "a medias"),
            ({"fase": "lanzado", "aprobacion": {"estado": "en-curso", "version": "0.5.1-prueba.35", "sha": "c" * 40}},
             "0.5.0", True, True, "otra aprobación"),
        )
        for est, actual, en_main, desc, palabra in casos:
            acepta, motivo, _ = L.decidir_aprobacion(est, peticion(), actual, en_main, desc)
            self.assertFalse(acepta, palabra)
            self.assertIn(palabra, motivo)
        acepta, motivo, _ = L.decidir_aprobacion(base, peticion(version="1.0.0-prueba.3"), "0.5.0", True, True)
        self.assertFalse(acepta)
        self.assertIn("mayor", motivo)

    def test_repetida_solo_si_ya_tomada(self):
        tomada = {"fase": "lanzado", "aprobaciones": [{"version": "0.5.1-prueba.36", "sha": PROBADO, "estado": "lanzada"}]}
        acepta, motivo, _ = L.decidir_aprobacion(tomada, peticion(), "0.5.0", True, True)
        self.assertFalse(acepta)
        self.assertTrue(motivo.startswith("repetida"))
        caducada = {"fase": "esperando-lista",
                    "aprobaciones": [{"version": "0.5.1-prueba.36", "sha": PROBADO, "estado": "caducada"}]}
        self.assertTrue(L.decidir_aprobacion(caducada, peticion(), "0.5.0", True, True)[0])

    def test_cabeza_para_preparar(self):
        a = {"sha": PROBADO, "lanzar_sha": PROBADO}
        self.assertTrue(L.cabeza_para_preparar(a, PROBADO)[0])
        ok, motivo = L.cabeza_para_preparar(a, "b" * 40)
        self.assertFalse(ok)
        self.assertIn("main avanzó", motivo)
        self.assertTrue(L.cabeza_para_preparar(None, "b" * 40)[0])


class Director(unittest.TestCase):
    def test_sin_peticion_y_en_pausa_no_lanza_nada(self):
        m = FalsosAprobacion()
        est = D.pasada(m, dict(PAUSADO), CFG, 1000.0)
        self.assertEqual(est["fase"], "esperando-publicacion")
        self.assertIn("pausa", est["detalle"])
        self.assertEqual(m.peligrosas(), [])
        self.assertIsNone(est.get("aprobacion"))

    def test_sin_peticion_con_automatico_apagado_no_lanza_nada(self):
        m = FalsosAprobacion({D.INTERRUPTOR: {"auto": False}})
        est = D.pasada(m, {"fase": "esperando-lista"}, CFG, 1000.0)
        self.assertEqual(est["fase"], "esperando-lista")
        self.assertEqual(m.peligrosas(), [])

    def test_aprobacion_atraviesa_la_pausa_y_sigue_los_pasos(self):
        m = FalsosAprobacion({D.PETICION: peticion(lanzar=CABEZA)})
        est = D.pasada(m, dict(PAUSADO), CFG, 1000.0)
        self.assertIn(D.PETICION, m.borradas)
        self.assertTrue(est["pausado"], "la pausa general sigue")
        self.assertEqual(est["aprobacion"]["estado"], "en-curso")
        # Mismo paso de siempre: esperando-publicacion → (publicado) → preparando → commit de versión.
        self.assertEqual(est["fase"], "esperando-publicacion", est.get("detalle"))
        self.assertEqual(est["version"], "0.5.1")
        self.assertEqual(est["preparado_sha"], CABEZA)
        self.assertIn("preparada", est["detalle"])
        with open(os.path.join(m.raiz, "native/src-tauri/tauri.conf.json")) as f:
            self.assertIn('"version": "0.5.1"', f.read())
        self.assertEqual(m.peligrosas(), [], "preparar no etiqueta ni sube nada")
        self.assertTrue(any("aprobó" in t for _, t in m.avisos))

    def test_main_avanzo_no_lanza_lo_no_probado(self):
        m = FalsosAprobacion({D.PETICION: peticion()})  # aprobado PROBADO, HEAD = CABEZA (main siguió)
        est = D.pasada(m, dict(PAUSADO), CFG, 1000.0)
        self.assertEqual(est["fase"], "esperando-lista")
        self.assertIn("main avanzó", est["detalle"])
        self.assertIsNone(est.get("aprobacion"))
        self.assertEqual(est["aprobaciones"][-1]["estado"], "caducada")
        with open(os.path.join(m.raiz, "native/src-tauri/tauri.conf.json")) as f:
            self.assertIn('"version": "0.5.0"', f.read(), "la versión no se tocó")
        self.assertNotIn(["git", "commit"], [o[:2] for o in m.ordenes])
        # La siguiente pasada vuelve a la pausa: nada se lanza solo.
        est = D.pasada(m, est, CFG, 1001.0)
        self.assertIn("pausa", est["detalle"])
        self.assertEqual(m.peligrosas(), [])

    def test_doble_pulsacion_no_hace_nada_nuevo(self):
        m = FalsosAprobacion({D.PETICION: peticion(lanzar=CABEZA)}, publicado=False)
        est = D.pasada(m, dict(PAUSADO), CFG, 1000.0)
        self.assertEqual(est["aprobacion"]["estado"], "en-curso")
        m.archivos[D.PETICION] = peticion(lanzar=CABEZA)
        avisos = len(m.avisos)
        est2 = D.pasada(m, est, CFG, 1001.0)
        self.assertEqual(est2["aprobacion"], est["aprobacion"])
        self.assertTrue(est2["aprobacion_ultima"]["detalle"].startswith("repetida"))
        self.assertEqual(len(m.avisos), avisos, "una repetida no avisa otra vez")

    def test_no_aprueba_lo_que_no_esta_en_main(self):
        m = FalsosAprobacion({D.PETICION: peticion(lanzar=CABEZA)}, en_main=False)
        est = D.pasada(m, dict(PAUSADO), CFG, 1000.0)
        self.assertIsNone(est.get("aprobacion"))
        self.assertIn("origin/main", est["aprobacion_ultima"]["detalle"])
        self.assertIn("pausa", est["detalle"])
        self.assertEqual(m.peligrosas(), [])

    def test_sin_ser_lider_la_peticion_se_queda(self):
        m = FalsosAprobacion({D.PETICION: peticion(lanzar=CABEZA)}, lider=False)
        est = D.pasada(m, dict(PAUSADO), CFG, 1000.0)
        self.assertIn(D.PETICION, m.archivos, "no se pierde: la toma el líder")
        self.assertIsNone(est.get("aprobacion"))

    def test_lanzada_cierra_la_aprobacion_y_sigue_en_pausa(self):
        m = FalsosAprobacion()
        aprob = {"version": "0.5.1-prueba.36", "sha": PROBADO, "lanzar_sha": PROBADO, "estado": "en-curso"}
        est = D.pasada(m, {"fase": "verificando-medios", "version": "0.5.1", "pausado": True, "aprobacion": aprob,
                           "version_aprobada": "0.5.1"}, CFG, 1000.0)
        self.assertEqual(est["fase"], "lanzado")
        self.assertTrue(est["pausado"])
        self.assertIsNone(est["aprobacion"])
        self.assertEqual(est["aprobaciones"][-1]["estado"], "lanzada")
        est = D.pasada(m, est, CFG, 1001.0)
        self.assertIn("pausa", est["detalle"])

    def test_un_arreglo_de_codigo_no_lo_cubre_la_aprobacion(self):
        m = FalsosAprobacion({"_log": "Lanzamiento v0.5.1 · LZ051A: arreglo"})
        aprob = {"version": "0.5.1-prueba.36", "sha": PROBADO, "lanzar_sha": PROBADO, "estado": "en-curso"}
        est = D.pasada(m, {"fase": "atascado", "version": "0.5.1", "arreglo": "LZ051A", "pausado": True,
                           "aprobacion": aprob}, CFG, 1000.0)
        self.assertEqual(est["fase"], "atascado")
        self.assertEqual(est["aprobaciones"][-1]["estado"], "superada")
        self.assertIn("otra prueba", est["detalle"])


if __name__ == "__main__":
    unittest.main()
