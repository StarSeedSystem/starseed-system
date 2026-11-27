# -*- coding: utf-8 -*-
"""MAG1120 · el collector de capacidades lee los tres estados y no inventa nada."""
import importlib.util
import json
import os
import sys
import unittest

AQUI = os.path.dirname(os.path.abspath(__file__))
if AQUI not in sys.path:
    sys.path.insert(0, AQUI)
_SPEC = importlib.util.spec_from_file_location(
    "recopilar_capacidades_nodos", os.path.join(AQUI, "recopilar-capacidades-nodos.py"))
assert _SPEC is not None and _SPEC.loader is not None
R = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(R)


class Recopilar(unittest.TestCase):
    def fuentes(self, mac=None, a1=None):
        datos = {R.RUTA_ORQUESTADOR: mac or {}, R.RUTA_A1: a1 or {}}
        return lambda ruta: datos.get(ruta, {})

    def nodos(self, mac=None, a1=None, sonda=None):
        return R.recopilar(self.fuentes(mac, a1), lambda: sonda or {})["nodos"]

    def test_mac_lee_su_estado_anidado(self):
        mac = {"salud": {"nucleos": 8, "ram_libre_mb": 1536, "cpu_pct": 37.5, "disco_libre_gb": 41.2},
               "almacen": ["/Users/alex/StarSeed-almacen/espejo"],
               "capas": ["needle@1.2", {"id": "bitnet", "version": "2.1"}]}
        n = self.nodos(mac=mac)[0]
        self.assertEqual((n["nodoId"], n["medio"]), ("mac-local", "mac"))
        self.assertEqual((n["nucleos"], n["ramLibreMb"], n["cpu"], n["discoLibreGb"]),
                         (8, 1536, 37.5, 41.2))
        self.assertEqual(n["almacen"], ["/Users/alex/StarSeed-almacen/espejo"])
        self.assertEqual(n["capas"], ["needle@1.2", "bitnet@2.1"])
        self.assertEqual(n["movidoGb"], 0.0)
        self.assertEqual(n["indiceEnlace"], "")

    def test_mac_lee_movido_gb_desde_datos_anidados(self):
        mac = {"salud": {"nucleos": 8, "ram_libre_mb": 1536, "cpu_pct": 37.5, "disco_libre_gb": 41.2},
               "movidoGb": 3.5,
               "almacen": [],
               "capas": []}
        n = self.nodos(mac=mac)[0]
        self.assertEqual(n["movidoGb"], 3.5)

    def test_mac_lee_movido_gb_desde_medidas(self):
        mac = {"salud": {"nucleos": 8, "ram_libre_mb": 1536, "cpu_pct": 37.5, "disco_libre_gb": 41.2},
               "almacen": [],
               "capas": []}
        n = R.recopilar(
            self.fuentes(mac=mac),
            lambda: {},
            movido_gb=2.75
        )["nodos"][0]
        self.assertEqual(n["movidoGb"], 2.75)

    def test_mac_lee_indice_enlace_desde_medidas(self):
        mac = {"salud": {"nucleos": 8, "ram_libre_mb": 1536, "cpu_pct": 37.5, "disco_libre_gb": 41.2},
               "almacen": [],
               "capas": []}
        n = R.recopilar(
            self.fuentes(mac=mac),
            lambda: {},
            indice_enlace="https://ejemplo.com/indice.md"
        )["nodos"][0]
        self.assertEqual(n["indiceEnlace"], "https://ejemplo.com/indice.md")

    def test_a1_lee_su_autocuracion(self):
        a1 = {"nucleos": 4, "ram_libre_mb": 800, "carga": {"cpu_1h": 12.5}, "disco_libre_gb": 9.9,
              "capas": {"needle": "1.0"}}
        n = self.nodos(a1=a1)[2]
        self.assertEqual((n["nodoId"], n["medio"]), ("a1-oracle", "nube"))
        self.assertEqual((n["nucleos"], n["ramLibreMb"], n["cpu"], n["discoLibreGb"]), (4, 800, 12.5, 9.9))
        self.assertEqual(n["capas"], ["needle@1.0"])

    def test_maggabox_usa_la_sonda_sin_red(self):
        sonda = {"discoLibreGb": 418, "ramLibreMb": 220, "cpu": 4, "contenedores": False,
                 "carpetas_starSeed_almacen": {"espejo": 12, "respaldos": 3}}
        n = self.nodos(sonda=sonda)[1]
        self.assertEqual((n["nodoId"], n["medio"]), ("maggabox", "linux"))
        self.assertEqual((n["nucleos"], n["ramLibreMb"], n["cpu"], n["discoLibreGb"]), (4, 220, 0, 418))
        self.assertEqual(n["almacen"], ["~/StarSeed-almacen/espejo", "~/StarSeed-almacen/respaldos"])
        self.assertEqual(n["capas"], [])

    def test_maggabox_con_srv_starseed_almacen_conectado(self):
        sonda = {"discoLibreGb": 418, "ramLibreMb": 220, "cpu": 4, "contenedores": False,
                 "carpetas_starSeed_almacen": {"espejo": 12, "respaldos": 3},
                 "srv_starseed_almacen": {"conectado": True, "libreGb": 150, "desde": "2026-11-20"}}
        n = self.nodos(sonda=sonda)[1]
        any_conectado = any("Maggabox · almacén USB (btrfs)" in entry for entry in n["almacen"])
        self.assertTrue(any_conectado, f"Ninguna entrada de almacen contiene 'Maggabox · almacén USB (btrfs)': {n['almacen']}")
        self.assertEqual(n["almacen"][0], "~/StarSeed-almacen/espejo")

    def test_maggabox_con_srv_starseed_almacen_desconectado(self):
        sonda = {"discoLibreGb": 418, "ramLibreMb": 220, "cpu": 4, "contenedores": False,
                 "carpetas_starSeed_almacen": {"espejo": 12, "respaldos": 3},
                 "srv_starseed_almacen": {"conectado": False, "desde": "2026-11-18"}}
        n = self.nodos(sonda=sonda)[1]
        any_desconectado = any("desconectado" in entry for entry in n["almacen"])
        self.assertTrue(any_desconectado, f"Ninguna entrada de almacen contiene 'desconectado': {n['almacen']}")
        any_fecha = any("2026-11-18" in entry for entry in n["almacen"])
        self.assertTrue(any_fecha, f"Ninguna entrada de almacen contiene la fecha 2026-11-18: {n['almacen']}")

    def test_los_tres_nodos_existen_aunque_falte_todo(self):
        nodos = self.nodos()
        self.assertEqual([n["nodoId"] for n in nodos], ["mac-local", "maggabox", "a1-oracle"])
        for n in nodos:
            self.assertIn(n["medio"], ("mac", "linux", "nube", "android"))
            self.assertEqual((n["nucleos"], n["ramLibreMb"], n["cpu"], n["discoLibreGb"]), (0, 0, 0.0, 0.0))
            self.assertEqual((n["almacen"], n["capas"]), ([], []))
            self.assertEqual(n["movidoGb"], 0.0)
            self.assertEqual(n["indiceEnlace"], "")

    def test_todos_nodos_reciben_movido_gb_e_indice_desde_medidas(self):
        nodos = R.recopilar(
            self.fuentes(),
            lambda: {},
            movido_gb=1.5,
            indice_enlace="https://indice.ejemplo.com"
        )["nodos"]
        for n in nodos:
            self.assertEqual(n["movidoGb"], 1.5)
            self.assertEqual(n["indiceEnlace"], "https://indice.ejemplo.com")

    def test_errores_de_lectura_y_sonda_no_rompen(self):
        def romper(_ruta):
            raise OSError("sin archivo")
        def sonda_rota():
            raise RuntimeError("sin ssh")
        nodos = R.recopilar(romper, sonda_rota)["nodos"]
        self.assertEqual(len(nodos), 3)
        self.assertTrue(all(n["nucleos"] == 0 for n in nodos))

    def test_read_fn_puede_devolver_texto_json(self):
        def leer(ruta):
            return '{"nucleos": 2}' if ruta == R.RUTA_ORQUESTADOR else "no-json"
        n = R.recopilar(leer, lambda: {})["nodos"][0]
        self.assertEqual(n["nucleos"], 2)

    def test_guardar_escribe_json_parseable(self):
        capturado = {}
        R.guardar({"nodos": [{"nodoId": "mac-local"}]},
                  lambda ruta, texto: capturado.setdefault(ruta, texto))
        self.assertEqual(json.loads(capturado[R.RUTA_SALIDA]), {"nodos": [{"nodoId": "mac-local"}]})


class DIR1125O(unittest.TestCase):
    """DIR1125O · la Mac medida de verdad, el A1 desde oracle.json, el total de la Maggabox y el Drive como cuarto medio."""

    def test_mac_medida_con_total_y_rol(self):
        n = R.recopilar(lambda r: {}, lambda: {}, mac_fn=lambda: {"discoLibreGb": 10.6, "discoTotalGb": 228.3})["nodos"][0]
        self.assertEqual((n["discoLibreGb"], n["discoTotalGb"]), (10.6, 228.3))
        self.assertIn("desarrollo", n["rol"])

    def test_a1_desde_su_latido_en_oracle(self):
        datos = {R.RUTA_ORACLE: {"nodo": {"disco_libre_gb": 9.6}}}
        n = R.recopilar(lambda r: datos.get(r, {}), lambda: {})["nodos"][2]
        self.assertEqual((n["nodoId"], n["discoLibreGb"]), ("a1-oracle", 9.6))

    def test_maggabox_con_total_de_la_sonda(self):
        n = R.recopilar(lambda r: {}, lambda: {"discoLibreGb": 418, "discoTotalGb": 500})["nodos"][1]
        self.assertEqual((n["discoLibreGb"], n["discoTotalGb"]), (418, 500))

    def test_drive_como_cuarto_medio_sin_inventar_libre(self):
        nodos = R.recopilar(lambda r: {}, lambda: {}, drive_fn=lambda: {
            "usoGb": 1.25, "discoTotalGb": 2048.0, "aproximado": False, "almacen": ["My Drive/StarSeed_Memory_Root"]})["nodos"]
        self.assertEqual([n["nodoId"] for n in nodos], ["mac-local", "maggabox", "a1-oracle", "drive"])
        d = nodos[3]
        self.assertEqual((d["usoGb"], d["discoTotalGb"]), (1.25, 2048.0))
        self.assertNotIn("discoLibreGb", d)

    def test_sin_drive_montado_no_aparece(self):
        self.assertEqual(len(R.recopilar(lambda r: {}, lambda: {}, drive_fn=lambda: None)["nodos"]), 3)


class MED1126A(unittest.TestCase):
    """MED1126A · la Maggabox lista sus dos discos: interno principal y externo secundario con su estado."""

    def discos(self, **extra):
        sonda = dict(discoLibreGb=397, discoTotalGb=453, discoLibreSrvGb=418, discoTotalSrvGb=500, **extra)
        n = R.recopilar(lambda r: {}, lambda: sonda)["nodos"][1]
        return {d["id"]: d for d in n["discos"]}

    def ext(self, montado, errores, smart):
        return dict(montado=montado, errores=errores, smart=smart)

    def test_interno_principal_y_externo_ok(self):
        d = self.discos(almacenExterno=self.ext(True, 0, "ok"))
        i, e = d["interno"], d["externo"]
        self.assertEqual((i["ruta"], i["rol"], i["libreGb"], i["totalGb"]), ("/", "principal", 397.0, 453.0))
        self.assertTrue(e["rol"].startswith("secundario"))
        self.assertEqual((e["libreGb"], e["totalGb"], e["estado"], e["usable"]), (418.0, 500.0, "ok", True))

    def test_externo_desmontado_en_rojo_y_sin_uso(self):
        e = self.discos(almacenExterno=self.ext(False, 0, "ok"))["externo"]
        self.assertEqual((e["estado"], e["usable"], e["libreGb"]), ("rojo", False, 0.0))

    def test_externo_con_errores_o_smart_mal_en_rojo(self):
        self.assertEqual(self.discos(almacenExterno=self.ext(True, 3, "ok"))["externo"]["estado"], "rojo")
        self.assertEqual(self.discos(almacenExterno=self.ext(True, 0, "fallo"))["externo"]["estado"], "rojo")

    def test_externo_sin_estado_del_ayudante_en_ambar_y_sin_uso(self):
        e = self.discos()["externo"]
        self.assertEqual((e["estado"], e["usable"]), ("ambar", False))

    def test_ayudante_en_texto_y_json(self):
        import sonda_maggabox as S
        self.assertEqual(S.parse_estado_externo("Montado: sí\nErrores: 0\nSMART: PASSED\n"), self.ext(True, 0, "ok"))
        self.assertEqual(S.parse_estado_externo('{"montado": false, "errores": 2, "smart": "FAILED"}'), self.ext(False, 2, "fallo"))
        self.assertEqual(S.parse_estado_externo(""), self.ext(None, 0, ""))

    def test_sonda_pide_el_estado_al_ayudante(self):
        import sonda_maggabox as S
        cab = "Filesystem 1G-blocks Used Available Use% Mounted on\n"
        class Salida:
            def __init__(self, out): self.stdout, self.returncode = out, 0
        def ssh(argv, **kw):
            if "starseed-almacen" in argv: return Salida("montado: sí\nerrores: 0\nsmart: ok")
            if "/srv/starseed-almacen" in argv: return Salida(cab + "/dev/sda1 500G 82G 418G 17% /srv/starseed-almacen")
            if "df" in argv: return Salida(cab + "/dev/sdb1 453G 56G 397G 13% /")
            return Salida("")
        out = S.sonda_maggabox(ssh)
        self.assertEqual(out["almacenExterno"], self.ext(True, 0, "ok"))
        self.assertEqual((out["discoLibreGb"], out["discoLibreSrvGb"], out["discoTotalSrvGb"]), (397, 418, 500))


if __name__ == "__main__":
    unittest.main()
