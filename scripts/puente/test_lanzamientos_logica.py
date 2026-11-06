#!/usr/bin/env python3
"""Pruebas de la lógica pura del director de lanzamientos (architecture/centro-versiones-1105.md)."""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lanzamientos_logica as L  # noqa: E402

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _todo_bueno(version):
    pub = {}
    for medio, nombres in L.archivos_esperados(version).items():
        for n in nombres:
            pub[n] = 90_000_000 if not n.endswith(".sig") else 440
    return pub


class Version(unittest.TestCase):
    def test_menor_y_parche(self):
        self.assertEqual(L.siguiente_version("0.3.0"), "0.4.0")
        self.assertEqual(L.siguiente_version("v0.3.2", "menor"), "0.4.0")
        self.assertEqual(L.siguiente_version("0.3.0", "parche"), "0.3.1")

    def test_nunca_mayor_ni_basura(self):
        with self.assertRaises(ValueError):
            L.siguiente_version("0.3.0", "mayor")
        with self.assertRaises(ValueError):
            L.siguiente_version("2026.10.09")


class Archivos(unittest.TestCase):
    def test_los_nombres_son_los_de_la_release_030(self):
        e = L.archivos_esperados("0.3.0")
        self.assertIn("StarSeed.OS_0.3.0_universal.dmg", e["macos"])
        self.assertIn("StarSeed.Cafe_universal.app.tar.gz.sig", e["macos"])
        self.assertIn("StarSeed.Nexus_0.3.0_x64-setup.exe.sig", e["windows"])
        self.assertIn("StarSeed.OS-0.3.0-1.x86_64.rpm", e["linux"])
        self.assertIn("StarSeed-os-0.3.0.apk", e["android"])
        self.assertEqual(sorted(e["canales"]), ["latest-cafe.json", "latest-nexus.json", "latest.json"])

    def test_todo_presente_es_al_dia(self):
        v = L.verificar_archivos(L.archivos_esperados("0.4.0"), _todo_bueno("0.4.0"))
        self.assertTrue(all(r["estado"] == "al-dia" for r in v.values()))
        self.assertEqual(L.bloquean_publicacion(v), [])

    def test_ipa_vacio_no_bloquea_pero_un_apk_pequeno_si(self):
        pub = _todo_bueno("0.4.0")
        pub["StarSeed-os-0.4.0-unsigned.ipa"] = 348
        pub["StarSeed-nexus-0.4.0.apk"] = 5000
        del pub["StarSeed.OS_0.4.0_x64_en-US.msi.sig"]
        v = L.verificar_archivos(L.archivos_esperados("0.4.0"), pub)
        self.assertEqual(v["ios"]["estado"], "no-disponible")
        self.assertEqual(v["android"]["pequenos"], ["StarSeed-nexus-0.4.0.apk"])
        self.assertEqual(v["windows"]["faltan"], ["StarSeed.OS_0.4.0_x64_en-US.msi.sig"])
        self.assertEqual(L.bloquean_publicacion(v), ["android", "windows"])


class Canal(unittest.TestCase):
    def _canal(self, version="0.4.0"):
        url = "https://github.com/x/y/releases/download/v%s/" % version
        return {"version": version, "platforms": {
            "darwin-aarch64": {"signature": "abc", "url": url + "StarSeed.OS_universal.app.tar.gz"},
            "darwin-x86_64": {"signature": "abc", "url": url + "StarSeed.OS_universal.app.tar.gz"},
            "linux-x86_64": {"signature": "abc", "url": url + "StarSeed.OS_%s_amd64.AppImage" % version},
            "windows-x86_64": {"signature": "abc", "url": url + "StarSeed.OS_%s_x64-setup.exe" % version}}}

    def test_bueno(self):
        self.assertEqual(L.verificar_canal(json.dumps(self._canal()), "0.4.0", _todo_bueno("0.4.0")), [])

    def test_version_vieja_sin_firma_y_url_rota(self):
        c = self._canal()
        c["version"] = "0.3.0"
        c["platforms"]["linux-x86_64"]["signature"] = ""
        c["platforms"]["windows-x86_64"]["url"] = "https://x/StarSeed.Nexus_0.4.0_x64-setup.exe.viejo"
        del c["platforms"]["darwin-x86_64"]
        p = L.verificar_canal(c, "0.4.0", _todo_bueno("0.4.0"))
        self.assertEqual(len(p), 4, p)
        self.assertEqual(L.verificar_canal("{no", "0.4.0", {}), ["no es JSON"])


class Jobs(unittest.TestCase):
    def test_medio_de_cada_job(self):
        self.assertEqual(L.medio_de_job("os · macos-latest"), "macos")
        self.assertEqual(L.medio_de_job("nexus · windows-latest"), "windows")
        self.assertEqual(L.medio_de_job("cafe · ubuntu-22.04"), "linux")
        self.assertEqual(L.medio_de_job("os · android"), "android")
        self.assertEqual(L.medio_de_job("canales de actualización (nexus · cafe)"), "canales")
        self.assertIsNone(L.medio_de_job("algo"))

    def test_pasos(self):
        p = L.pasos_de_jobs([{"name": "os · android", "status": "completed", "conclusion": "failure"},
                             {"name": "os · macos-latest", "status": "in_progress", "conclusion": None},
                             {"name": "os · ios", "status": "completed", "conclusion": "skipped"}])
        self.assertEqual([x["estado"] for x in p], ["fallo", "en-curso", "omitido"])


class Fallos(unittest.TestCase):
    def test_clases(self):
        self.assertEqual(L.clasificar_fallo("error: could not compile `starseed` due to 2 errors")[0], "codigo")
        self.assertEqual(L.clasificar_fallo("curl: (28) Operation timed out after 30000 ms")[0], "reintentar")
        self.assertEqual(L.clasificar_fallo("Keystore was tampered with, or password was incorrect")[0],
                         "credencial")
        self.assertEqual(L.clasificar_fallo("Warning: no signing identity found")[0], "sin-firma")
        self.assertEqual(L.clasificar_fallo("")[0], "reintentar")

    def test_log_con_colores_y_enlazado(self):
        # (1106) v0.4.1 en Linux: «unable to find library -lgbm» con el log de cargo en colores ANSI.
        pintado = ("\x1b[1m\x1b[91merror\x1b[0m\x1b[1m: linking with `cc` failed: exit status: 1\x1b[0m\n"
                   "  = note: rust-lld: error: unable to find library -lgbm\n"
                   "\x1b[1m\x1b[91merror\x1b[0m\x1b[1m: could not compile `starseed-native` (lib)\x1b[0m")
        self.assertEqual(L.clasificar_fallo(pintado)[0], "codigo")
        self.assertEqual(L.clasificar_fallo("\x1b[91merror\x1b[0m: could not compile `x`")[0], "codigo")


class Puertas(unittest.TestCase):
    def test_lista(self):
        tareas = [{"id": "VER1105A"}, {"id": "VER1105B"}, {"id": "VER1105C"}]
        prog = {"VER1105B": {"estado": "integrada", "medio": "nube"}, "VER1105C": {"estado": "descartada"}}
        self.assertEqual(L.lista_terminada(tareas, prog, {"VER1105A"}), (False, ["VER1105B"]))
        self.assertEqual(L.lista_terminada(tareas, prog, {"VER1105A", "VER1105B"}), (True, []))
        self.assertEqual(L.lista_terminada([], {}, set()), (False, []))

    def test_lista_sigue_las_sustituidas(self):
        tareas = [{"id": "VER1105L"}, {"id": "VER1105F"}]
        prog = {
            "VER1105L": {"estado": "sustituida", "nota": "continúa como VER1105Lb desde la rama nube/a1-1-VER1105L"},
            "VER1105Lb": {"estado": "commit"},
            "VER1105F": {"estado": "sustituida", "nota": "continúa como VER1105Fb desde la rama nube/a1-2-VER1105F"},
            "VER1105Fb": {"estado": "sustituida", "nota": "revisor: dividida en VER1105Fb-d1, VER1105Fb-d2"},
        }
        self.assertEqual(L.sucesores("VER1105Fb", prog), ["VER1105Fb-d1", "VER1105Fb-d2"])
        # Lb en main termina L; F espera a sus dos trozos.
        self.assertEqual(L.lista_terminada(tareas, prog, {"VER1105Lb", "VER1105Fb-d1"}), (False, ["VER1105F"]))
        self.assertEqual(L.lista_terminada(tareas, prog, {"VER1105Lb", "VER1105Fb-d1", "VER1105Fb-d2"}), (True, []))
        # Cadena L → Lb → Lc por las notas.
        prog2 = dict(prog, VER1105Lb={"estado": "sustituida", "nota": "continúa como VER1105Lc (traer_nube)"})
        self.assertFalse(L.tarea_hecha("VER1105L", prog2, set()))
        self.assertTrue(L.tarea_hecha("VER1105L", prog2, {"VER1105Lc"}))
        # Sin nota: el sufijo (una letra o «-dN»); sustituida sin sucesores no cuenta como hecha.
        self.assertTrue(L.tarea_hecha("VER1105G", {"VER1105G": {"estado": "sustituida"}}, {"VER1105Gb"}))
        self.assertFalse(L.tarea_hecha("VER1105G", {"VER1105G": {"estado": "sustituida"}}, set()))
        # Una tarea «commit» que aún no está en origin/main no cuenta.
        self.assertFalse(L.tarea_hecha("VER1105A", {"VER1105A": {"estado": "commit"}}, set()))

    def test_publicado(self):
        h, b = "a" * 40, "b" * 40
        self.assertEqual(L.ultimo_publicado({"fase": "publicado", "sha": h}), h)
        # En otra fase, lo último publicado sale del historial (el lote siguiente no lo borra).
        hist = {"fase": "verificando", "sha": b, "historial": [{"sha": h, "resultado": "publicado"},
                                                               {"sha": b, "resultado": "vetado"}]}
        self.assertEqual(L.ultimo_publicado(hist), h)
        self.assertFalse(L.publicado_y_verificado({"fase": "ci"})[0])
        self.assertTrue(L.publicado_y_verificado(hist)[0])
        self.assertFalse(L.publicado_y_verificado(hist, objetivo=b, contiene=False)[0])
        self.assertTrue(L.publicado_y_verificado(hist, objetivo=b, contiene=True)[0])

    def test_tope_diario(self):
        hist = [{"t": 86400 * 10 + 5, "tipo": "lanzado"}]
        self.assertFalse(L.puede_lanzar_hoy(hist, 86400 * 10 + 99))
        self.assertTrue(L.puede_lanzar_hoy(hist, 86400 * 11 + 1))


class AplicarVersion(unittest.TestCase):
    def test_sobre_los_archivos_reales(self):
        rutas = ("native/src-tauri/tauri.conf.json", "native/src-tauri/Cargo.toml", "src/lib/version/os-release.ts")
        textos = {}
        for r in rutas:
            with open(os.path.join(RAIZ, r), encoding="utf-8") as f:
                textos[r] = f.read()
        nuevos = L.aplicar_version(textos, "9.8.0", "2026-11-05", 'Notas con "comillas".')
        self.assertEqual(json.loads(nuevos[rutas[0]])["version"], "9.8.0")
        self.assertIn('version = "9.8.0"', nuevos[rutas[1]])
        ts = nuevos[rutas[2]]
        self.assertIn('export const NATIVE_VERSION = "9.8.0";', ts)
        self.assertIn('export const OS_VERSION = "2026.11.05";', ts)
        self.assertIn('export const OS_FECHA = "2026-11-05";', ts)
        self.assertIn('"Notas con \\"comillas\\"."', ts)
        # Nada más cambia: mismas líneas salvo las de versión.
        self.assertEqual(len(ts.splitlines()), len(textos[rutas[2]].splitlines()))

    def test_sin_ancla_no_adivina(self):
        with self.assertRaises(ValueError):
            L.aplicar_version({"native/src-tauri/tauri.conf.json": "{}", "native/src-tauri/Cargo.toml": "",
                               "src/lib/version/os-release.ts": ""}, "1.0.0", "2026-11-05", "x")


class Notas(unittest.TestCase):
    """(1106N) Notas para las personas: nombres de ola, sin lo interno ni paréntesis."""

    REALES = [
        "Lanzamiento v0.4.0 · LZ040A: Linux nativo en ubuntu-24.04 (PipeWire de 22.04, viejo para xcap 0.9)",
        "1105V · Centro de Versiones · VER1105M: montar el aviso en el layout",
        "1105V · Centro de Versiones · VER1105J: ventana «Hay una versión nueva»",
        "salvavidas · VER1105J: trabajo del agente antes de las puertas (tsc / vitest)",
        "Ola 1010X · StarSeed XR: el OS en visores de AR/VR (entrada automática, Trinity espacial, voz d · XR1010A: x",
        "1104R · Repos nativos · RPO1104C: EGM · revisarConPeces (parte 2 de 2)",
        "0611 · Seguimiento de la supervisión · SUP0611B: Reconstructor · no compila en el A1",
        "Ola Imaginación 2026-10-29 · lo que el análisis nocturno encontró · DR1029-1: Publicar los 4 commits",
        "1104C · Contratos pendientes · CTR1104Uc: subtítulos",
        "Rescate de las ramas de la nube · RPO1104N-d2: algo",
        "1020U · TRD1020Db-d3b: Traducción · idioma de lectura por perfil (parte 3 de 3)",
        "merge: main recoge el reparto",
    ]

    def test_reales_por_ola(self):
        self.assertEqual(L.notas_de(self.REALES, "0.4.1"),
                         "StarSeed OS 0.4.1: Centro de Versiones, StarSeed XR: el OS en visores de AR/VR, "
                         "Repos nativos y Traducción · idioma de lectura por perfil.")

    def test_maximo_y_sin_signos_raros(self):
        asuntos = ["%dA · Ola número %d · VER1%03dA: t" % (1000 + i, i, i) for i in range(1, 10)]
        n = L.notas_de(asuntos, "0.4.0")
        self.assertEqual(n.count(","), 4)
        self.assertIn(" y ", n)
        for signo in (";", "(", ", y "):
            self.assertNotIn(signo, n)

    def test_vacio_o_solo_interno(self):
        self.assertEqual(L.notas_de([], "0.4.1"), "StarSeed OS 0.4.1: mejoras y correcciones.")
        self.assertEqual(L.notas_de(["salvavidas · VER1105A: x", "0611 · Supervisión · SUP0611A: y"], "0.4.1"),
                         "StarSeed OS 0.4.1: mejoras y correcciones.")

    def test_nombre_de_ola(self):
        self.assertEqual(L.nombre_de_ola("1105V · Centro de Versiones"), "Centro de Versiones")
        self.assertEqual(L.nombre_de_ola("Ola CB1013 · Cerebros: Fusionar, Telepatía"), "Cerebros: Fusionar, Telepatía")
        self.assertEqual(L.nombre_de_ola("1028 · Contenido vivo (tres niveles)"), "Contenido vivo")
        self.assertEqual(L.nombre_de_ola("1020U", "Traducción (parte 3 de 3)"), "Traducción")
        self.assertEqual(L.nombre_de_ola("1104R · x · lo que faltó: next.config.ts"), "x")

    def test_parche_sobre_parche_una_sola_clausula(self):
        n = L.notas_de_parche("StarSeed OS 0.4.1: a. Además: b.", "0.4.1", "0.4.2", "c (detalle)")
        self.assertEqual(n, "StarSeed OS 0.4.2: a. Además: b; c.")

    def test_parche_de_una_version_que_no_se_lanzo(self):
        n = L.notas_de_parche("StarSeed OS 0.4.0 y sus apps nativas. Llega el Centro de Versiones.", "0.4.0", "0.4.1",
                              "Linux nativo en ubuntu-24.04 (PipeWire de 22.04, viejo para xcap 0.9)")
        self.assertEqual(n, "StarSeed OS 0.4.1 y sus apps nativas. Llega el Centro de Versiones. "
                            "Además: Linux nativo en ubuntu-24.04.")
        self.assertIsNone(L.notas_de_parche("", "0.4.0", "0.4.1", "x"))
        self.assertEqual(L.notas_de_parche("StarSeed OS 0.4.0: a.", "0.4.0", "0.4.1", ""), "StarSeed OS 0.4.1: a.")


class Tono(unittest.TestCase):
    def test_tonos(self):
        self.assertEqual(L.tono_pastilla({"fase": "compilando"}), "aviso")
        self.assertEqual(L.tono_pastilla({"fase": "lanzado", "medios": {"android": {"estado": "atascado"}}}),
                         "peligro")
        self.assertEqual(L.tono_pastilla({"fase": "esperando-lista"}), "normal")


if __name__ == "__main__":
    unittest.main()
