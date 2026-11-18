# -*- coding: utf-8 -*-
"""MAG1117 · Maggabit: plan puro de instaladores, comprobar de carpetas y E/S fina con timeout.

Herméticas: nunca tocan /Volumes, la red, ~/.starseed ni el disco real; `gh` es un doble inyectado."""
import json
import os
import subprocess
import sys
import tempfile
import unittest

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import maggabit_versiones as M  # noqa: E402

BASE = "MetaGenesis/instaladores"
ET = "0.5.2"


def pub(etiqueta=ET, nombre="MetaGenesis 0.5.2", publicado="2026-11-18", latest=False,
        archivos=None, canal=None, prueba=None):
    p = {"etiqueta": etiqueta, "nombre": nombre, "publicado": publicado, "latest": latest,
         "archivos": archivos if archivos is not None else [{"nombre": "app.zip", "bytes": 100}]}
    if canal:
        p["canal"] = canal
    if prueba is not None:
        p["prueba"] = prueba
    return p


def ficha_g(etiqueta=ET, nombre="MetaGenesis 0.5.2", publicado="2026-11-18", prueba=None):
    f = {"etiqueta": etiqueta, "nombre": nombre, "publicado": publicado,
         "archivos": [{"nombre": "app.zip", "bytes": 100}]}
    if prueba is not None:
        f["prueba"] = prueba
    return f


class PuroPlan(unittest.TestCase):
    def test_sin_cambios_da_nada(self):
        self.assertEqual(M.plan([pub(latest=True)], {ET: ficha_g()}), [])

    def test_la_estable_cambiada_se_baja_a_su_carpeta(self):
        ordenes = M.plan([pub(latest=True, publicado="2026-11-19")], {ET: ficha_g()})
        self.assertEqual(len(ordenes), 1)
        o = ordenes[0]
        self.assertEqual(o["accion"], "bajar")
        self.assertEqual(o["canal"], "estable")
        self.assertEqual(o["destino"], "%s/%s" % (BASE, ET))
        self.assertEqual(o["ficha"]["publicado"], "2026-11-19")

    def test_la_estable_igual_no_se_baja_por_un_extra_de_ficha(self):
        guardada = dict(ficha_g(), destino="lo-que-sea")
        self.assertEqual(M.plan([pub(latest=True)], {ET: guardada}), [])

    def test_prueba_nueva_baja_y_retira_la_cuarta(self):
        guardadas = {("prueba-%d" % n): ficha_g(etiqueta="canal-pruebas-%d" % n, prueba=n)
                     for n in (4, 5, 6)}
        nueva = pub(etiqueta="canal-pruebas-7", nombre="prueba-7", publicado="2026-11-19", archivos=[
            {"nombre": "app.zip", "bytes": 200}])
        ordenes = M.plan([nueva], guardadas)
        acciones = [(o["accion"], o["prueba"]) for o in ordenes]
        self.assertIn(("bajar", 7), acciones)
        self.assertIn(("retirar", 4), acciones)
        self.assertNotIn(("retirar", 6), acciones)
        baja = ordenes[[o["accion"] for o in ordenes].index("bajar")]
        self.assertEqual(baja["destino"], "%s/canal-pruebas/prueba-7" % BASE)
        retiro = ordenes[[o["accion"] for o in ordenes].index("retirar")]
        self.assertEqual(retiro["destino"], "%s/canal-pruebas/prueba-4" % BASE)
        self.assertIn("poda", retiro["motivo"])

    def test_la_poda_nunca_toca_lo_estable(self):
        guardadas = {ET: ficha_g(),
                     "canal-pruebas-4": ficha_g(etiqueta="canal-pruebas-4", nombre="prueba-4", prueba=4)}
        ordenes = M.plan([pub(latest=True), pub(etiqueta="canal-pruebas-4", nombre="prueba-4")], guardadas)
        self.assertEqual(ordenes, [])

    def test_cambiar_solo_los_bytes_cuenta_como_cambio(self):
        nueva = pub(latest=True, archivos=[{"nombre": "app.zip", "bytes": 101}])
        self.assertEqual(len(M.plan([nueva], {ET: ficha_g()})), 1)


class PuroComprobar(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.carpeta = os.path.join(self.tmp.name, "0.5.2")
        os.makedirs(self.carpeta)
        with open(os.path.join(self.carpeta, "app.zip"), "wb") as f:
            f.write(b"x" * 100)

    def test_completa(self):
        r = M.comprobar(self.carpeta, ficha_g())
        self.assertEqual(r["estado"], "completa")
        self.assertEqual(r["faltan"], [])
        self.assertEqual(r["mal"], [])

    def test_archivo_corto_es_incompleta(self):
        with open(os.path.join(self.carpeta, "app.zip"), "wb") as f:
            f.write(b"x" * 40)
        r = M.comprobar(self.carpeta, ficha_g())
        self.assertEqual(r["estado"], "incompleta")
        self.assertEqual(r["mal"], [{"nombre": "app.zip", "esperado": 100, "real": 40}])

    def test_archivo_que_falta_es_incompleta(self):
        os.remove(os.path.join(self.carpeta, "app.zip"))
        r = M.comprobar(self.carpeta, ficha_g())
        self.assertEqual(r["estado"], "incompleta")
        self.assertEqual(r["faltan"], ["app.zip"])


class GhConTimeout(unittest.TestCase):
    def test_timeout_da_sin_respuesta_y_no_se_cuelga(self):
        def lento(args, timeout=60, **kw):
            raise subprocess.TimeoutExpired(cmd=args, timeout=timeout)
        salida, error = M.gh(["gh", "release", "view"], timeout=5, ejecutar=lento)
        self.assertEqual(salida, "")
        self.assertEqual(error, "sin-respuesta")

    def test_sin_gh_da_sin_gh(self):
        def roto(args, timeout=60, **kw):
            raise FileNotFoundError("gh")
        _, error = M.gh(["gh", "release", "view"], ejecutar=roto)
        self.assertEqual(error, "sin-gh")

    def test_bajar_usa_clobber_con_timeout_y_guarda_ficha(self):
        llamadas = []

        def gh_doble(args, timeout=60, **kw):
            llamadas.append((args, timeout))
            return "", ""

        guardadas = []

        def guardar(carpeta, ficha):
            guardadas.append((carpeta, ficha))

        r = M.bajar({"etiqueta": ET}, "/tmp/opencode/maggabit/%s" % ET, ficha=ficha_g(),
                    pedir_gh=gh_doble, guardar=guardar)
        self.assertEqual(r["estado"], "baja")
        llamada = llamadas[0]
        args, timeout = llamada[0], llamada[1]
        self.assertIn("--clobber", args)
        self.assertIn("--dir", args)
        self.assertEqual(timeout, M.TIEMPO_BAJA_S)
        self.assertEqual(len(guardadas), 1)

    def test_bajar_sin_respuesta_no_guarda_ficha(self):
        def gh_doble(args, timeout=60, **kw):
            return "", "sin-respuesta"
        r = M.bajar({"etiqueta": ET}, "/tmp/opencode/maggabit/%s" % ET, pedir_gh=gh_doble)
        self.assertEqual(r["estado"], "sin-respuesta")

    def test_ver_publicacion_mapea_los_campos(self):
        datos = {"tagName": ET, "name": "MetaGenesis 0.5.2", "publishedAt": "2026-11-18",
                 "isLatest": True, "assets": [{"name": "app.zip", "size": 100}]}
        def gh_doble(args, timeout=60, **kw):
            return json.dumps(datos), ""
        p = M.ver_publicacion(ET, pedir_gh=gh_doble)
        assert p is not None
        self.assertEqual(p["etiqueta"], ET)
        self.assertTrue(p["latest"])
        self.assertEqual(p["archivos"], [{"nombre": "app.zip", "bytes": 100}])


class Disco(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.raiz = self.tmp.name

    def test_fichas_guardadas_sin_disco_da_vacio(self):
        self.assertEqual(M.fichas_guardadas(os.path.join(self.raiz, "no-existe")), {})

    def test_fichas_guardadas_lee_por_etiqueta(self):
        destino = os.path.join(self.raiz, BASE, ET)
        M.guardar_ficha(destino, ficha_g())
        with open(os.path.join(destino, M.ARCHIVO_FICHA), encoding="utf-8") as f:
            self.assertEqual(json.load(f)["etiqueta"], ET)
        self.assertEqual(list(M.fichas_guardadas(self.raiz)), [ET])

    def test_revisar_sin_disco_no_falla_ni_espera(self):
        r = M.revisar(os.path.join(self.raiz, "no-existe"), pedir_gh=lambda a, timeout=60: ("", "sin-gh"))
        self.assertEqual(r["estado"], "sin-disco")
        self.assertEqual(r["ordenes"], [])

    def test_revisar_con_gh_mudo_no_baja_nada(self):
        r = M.revisar(self.raiz, pedir_gh=lambda a, timeout=60: ("", "sin-respuesta"))
        self.assertEqual(r["estado"], "ok")
        self.assertEqual(r["ordenes"], [])

    def test_revisar_aplica_la_baja_y_la_poda(self):
        pr = lambda n: os.path.join(self.raiz, BASE, "canal-pruebas", "prueba-%d" % n)
        M.guardar_ficha(os.path.join(self.raiz, BASE, ET), ficha_g())
        for n in (4, 5, 6):
            M.guardar_ficha(pr(n), ficha_g(etiqueta="canal-pruebas-%d" % n, prueba=n))
        os.makedirs(pr(4), exist_ok=True)
        estable = json.dumps({"tagName": ET, "name": "MetaGenesis 0.5.2", "publishedAt": "2026-11-18",
                              "isLatest": True, "assets": [{"name": "app.zip", "size": 100}]})
        prueba = json.dumps({"tagName": "canal-pruebas-7", "name": "prueba-7", "publishedAt": "2026-11-19",
                             "isLatest": False, "assets": [{"name": "app.zip", "size": 100}]})

        def gh_doble(args, timeout=60, **kw):
            if len(args) > 4 and args[2] == "download":
                ruta = os.path.join(args[args.index("--dir") + 1], "app.zip")
                with open(ruta, "wb") as f:
                    f.write(b"x" * 100)
                return "", ""
            return "", "sin-respuesta"

        def ver(etiqueta, repo=M.REPO, pedir_gh=gh_doble):
            if etiqueta == M.SERVIDOR_LOCAL:
                return None
            return M.ver_publicacion(etiqueta, repo=repo,
                                     pedir_gh=lambda a, timeout=60: (estable if etiqueta is None else prueba, ""))

        r = M.revisar(self.raiz, pedir_gh=gh_doble, ver=ver)
        self.assertEqual(r["estado"], "ok")
        bajadas = [o for o in r["ordenes"] if o["accion"] == "bajar"]
        retiros = [o for o in r["ordenes"] if o["accion"] == "retirar"]
        self.assertEqual(len(bajadas), 1)
        self.assertEqual(bajadas[0]["prueba"], 7)
        self.assertEqual(len(retiros), 1)
        self.assertEqual(retiros[0]["prueba"], 4)
        self.assertTrue(retiros[0]["motivo"].startswith("poda"))
        retiros_aplicadas = [a for a in r["aplicadas"] if a.get("motivo", "").startswith("poda")]
        self.assertEqual(retiros_aplicadas and retiros_aplicadas[0]["hecho"], True)
        self.assertEqual(r["aplicadas"][0]["comprobacion"].get("estado"), "completa")
        self.assertFalse(os.path.isdir(pr(4)))
        self.assertTrue(os.path.isdir(pr(6)))
        self.assertEqual(r["aplicadas"][0]["comprobacion"].get("estado"), "completa")


if __name__ == "__main__":
    unittest.main()
