#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""MVD1027J · pruebas de instalar_memvid con un `gh` falso: elegir run verde, leer
la huella del resumen, comprobar el binario contra esa huella, escribir el plist y
respetar que `--plan` no escribe nada. Lo de disco completo corre en un tmp."""
import json
import os
import plistlib
import sys
import tempfile
import unittest
from unittest import mock

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, DIRECTORIO)
import instalar_memvid as I  # noqa: E402


class GhFalso:
    def __init__(self, respuestas):
        self.respuestas = respuestas
        self.ordenes = []

    def responder(self, args):
        """Busca la respuesta sin anotar la orden (la anota quien la llama)."""
        for prefijo, salida in self.respuestas:
            if args == prefijo:
                return salida
        raise SystemExit("gh conocido caído: %s" % args)


LISTA = json.dumps([{"databaseId": 7, "conclusion": "failure", "status": "completed"},
                    {"databaseId": 11, "conclusion": "success", "status": "completed"}])

LOG = lambda h: "…compilar · SHA-256: %s\n" % h + "otra cosa"  # noqa: E731

class Basico(unittest.TestCase):
    def test_elige_el_run_verde(self):
        self.assertEqual(I.elegir_run(LISTA), "11")

    def test_sin_run_verde_corta(self):
        with self.assertRaises(SystemExit):
            I.elegir_run(json.dumps([{"databaseId": 1, "conclusion": "failure"}]))

    def test_huella_del_resumen_y_del_rechazo(self):
        h = "a" * 64
        self.assertEqual(I.sha_del_resumen("SHA-256: %s" % h), h)
        self.assertEqual(I.sha_del_resumen("sha256=%s" % h), h)
        with self.assertRaises(SystemExit):
            I.sha_del_resumen("sin huella por ningún lado")


class Instalacion(unittest.TestCase):
    """Todo a un tmp: binario, plist y carga del servicio fuera del camino."""
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.binario = os.path.join(self.tmp.name, "bin", "memvid-servidor")
        self.plist = os.path.join(self.tmp.name, "Launch", "com.starseed.memvid.plist")

    def con_gh_verde(self, contenido=b"binario real", huella=None):
        """Un `gh` falso con el listado, el log y un run download que escribe el artefacto."""
        if huella is None:
            falso_previo = tempfile.NamedTemporaryFile(delete=False)
            falso_previo.write(contenido)
            falso_previo.close()
            huella = I.sha256(falso_previo.name)
        falso = GhFalso([            (["run", "list", "--workflow", I.WORKFLOW, "--limit", "30",
              "--json", "databaseId,conclusion,status"], LISTA),
            (["run", "view", "11", "--log"], LOG(huella)),
        ])
        original = I._gh

        def gh_falso(args, gh="gh"):
            falso.ordenes.append(list(args))
            if args[:2] == ["run", "download"]:
                destino = args[-1]
                os.makedirs(destino, exist_ok=True)
                with open(os.path.join(destino, "memvid-servidor"), "wb") as f:
                    f.write(contenido)
                return ""
            return falso.responder(args)
        I._gh = gh_falso
        self.addCleanup(setattr, I, "_gh", original)
        return falso, huella

    def test_instala_binario_0755_y_plist(self):
        falso, huella = self.con_gh_verde(b"CONTENIDO DEL BINARIO")
        I.instalar(self.binario, self.plist, plan=False, cargar=False)
        with open(self.binario, "rb") as f:
            self.assertEqual(f.read(), b"CONTENIDO DEL BINARIO")
        with open(self.plist, "rb") as f:
            cuerpo = plistlib.load(f)
        pasos = " ".join(" ".join(o) for o in falso.ordenes)
        self.assertEqual((os.stat(self.binario).st_mode & 0o777, cuerpo["Label"],
                          cuerpo["ProgramArguments"],
                          (cuerpo["RunAtLoad"], cuerpo["KeepAlive"]),
                          "run download 11 --name %s" % I.ARTEFACTO in pasos),
                         (0o755, "com.starseed.memvid", [self.binario, "servir"],
                          (True, True), True))
        self.assertEqual(cuerpo["EnvironmentVariables"]["PATH"].split(":")[0],
                         os.path.expanduser("~") + "/.local/bin")

    def test_huella_mala_y_artefacto_vacio_no_instalan(self):
        self.con_gh_verde(b"otro binario", huella="b" * 64)
        with self.assertRaises(SystemExit):
            I.instalar(self.binario, self.plist, plan=False, cargar=False)
        self.assertFalse(os.path.exists(self.binario))

    def test_plan_nada_escribe(self):
        falso, _ = self.con_gh_verde()
        with mock.patch("builtins.print") as visto:
            I.instalar(self.binario, self.plist, plan=True, cargar=False)
        self.assertFalse(os.path.exists(self.binario) or os.path.exists(self.plist))
        self.assertIn("run view", " ".join(" ".join(o) for o in falso.ordenes))
        self.assertIn("plan", " ".join(str(c) for c in visto.call_args_list))


if __name__ == "__main__":
    unittest.main()
