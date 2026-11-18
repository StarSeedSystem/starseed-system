# -*- coding: utf-8 -*-
"""Pruebas herméticas de la bóveda cifrada de claves del Maggabit (MAG1117).

Nada aquí toca /Volumes, la red, ~/.starseed ni el disco real: las decisiones
puras se prueban con datos inventados y la capa de E/S con dobles (caminante de
disco en memoria, subprocess simulado, reloj fijo). La guardiana vigila que
`.credentials.json` no se copie a ningún sitio y que toda orden sea un
`rsync -a` con timeout, jamás un diálogo ni una contraseña.
"""
import importlib.util
import os
import subprocess
import unittest

AQUI = os.path.dirname(os.path.abspath(__file__))


def _cargar():
    ruta = os.path.join(AQUI, "maggabit_boveda.py")
    spec = importlib.util.spec_from_file_location("maggabit_boveda_prueba", ruta)
    assert spec is not None and spec.loader is not None
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


HOME = os.path.join(os.sep, "falso", "alex")
RUTAS = [os.path.join(HOME, ".starseed", "env"),
         os.path.join(HOME, ".hermes"),
         os.path.join(HOME, "Documents", "servidores", "server.pem")]
LISTA = """\
# REGENERABLE: peso muerto que no viaja.
node_modules/
# CLAVES: secretos que nunca salen del origen.
.env
.env.*
*.pem
*.p12
.credentials.json
credentials.json
storage_state*
"""


class PatronesClaves(unittest.TestCase):
    def setUp(self):
        self.M = _cargar()

    def test_seccion_claves_de_la_lista_real(self):
        with open(self.M.LISTA_UNICA, encoding="utf-8") as f:
            patrones = self.M.patrones_claves(f.read())
        self.assertIn(".env", patrones)
        self.assertIn(".env.*", patrones)
        self.assertIn("*.pem", patrones)
        self.assertNotIn("node_modules/", patrones)

    def test_otro_comentario_corta_la_seccion(self):
        self.assertEqual(self.M.patrones_claves("# CLAVES\n.env\n# REGENERABLE\n*.pem\n"),
                         [".env"])


class Plan(unittest.TestCase):
    def setUp(self):
        self.M = _cargar()

    def test_boveda_cerrada_lista_vacia_con_motivo(self):
        self.assertEqual(self.M.plan("cerrada", RUTAS), [])
        self.assertIn("cerrada", self.M.motivo("cerrada"))

    def test_boveda_sin_crear_tampoco_copia(self):
        self.assertEqual(self.M.plan("sin-crear", RUTAS), [])
        self.assertIn("sin crear", self.M.motivo("sin-crear"))

    def test_abierta_conserva_la_ruta_relativa_al_home(self):
        copias = self.M.plan("abierta", RUTAS, home=HOME)
        destinos = {c["fuente"]: c["destino"] for c in copias}
        self.assertEqual(destinos[RUTAS[0]],
                         os.path.join(self.M.DESTINO, ".starseed", "env"))
        self.assertEqual(destinos[RUTAS[2]],
                         os.path.join(self.M.DESTINO, "Documents", "servidores", "server.pem"))

    def test_credentials_json_excluido_aunque_venga_de_documentos(self):
        credencial = os.path.join(HOME, "Documents", "app", ".credentials.json")
        copias = self.M.plan("abierta", RUTAS + [credencial], home=HOME)
        self.assertNotIn(credencial, [c["fuente"] for c in copias])
        self.assertEqual(self.M.plan("abierta", [credencial], home=HOME), [])

    def test_fuente_fuera_del_home_aterriza_dentro_de_claves(self):
        copias = self.M.plan("abierta", ["/otra/parte/secreto.pem"], home=HOME)
        self.assertEqual(copias[0]["destino"], os.path.join(self.M.DESTINO, "secreto.pem"))

    def test_deduplica_y_ordena(self):
        copias = self.M.plan("abierta", [RUTAS[1], RUTAS[0], RUTAS[1]], home=HOME)
        self.assertEqual([c["fuente"] for c in copias], sorted({RUTAS[0], RUTAS[1]}))


class Ordenes(unittest.TestCase):
    def setUp(self):
        self.M = _cargar()

    def test_rsync_a_al_padre_del_destino(self):
        copias = self.M.plan("abierta", RUTAS[:1], home=HOME)
        self.assertEqual(self.M.ordenes(copias),
                         [["rsync", "-a", RUTAS[0],
                           os.path.join(self.M.DESTINO, ".starseed")]])

    def test_solo_rsync_con_a(self):
        for orden in self.M.ordenes(self.M.plan("abierta", RUTAS, home=HOME)):
            self.assertEqual(orden[0], "rsync")
            self.assertEqual(orden[1], "-a")


class FuentesFijas(unittest.TestCase):
    def setUp(self):
        self.M = _cargar()
        self.existentes = [os.path.join(HOME, ".starseed", "env"),
                           os.path.join(HOME, ".starseed", "env.local"),
                           os.path.join(HOME, ".hermes")]

    def _expander(self, patron):
        return os.path.join(HOME, patron[2:]) if patron.startswith("~/") else patron

    def _globar(self, patron):
        if patron.endswith("env.*"):
            return [self.existentes[1]]
        return [r for r in self.existentes if r == patron]

    def test_solo_las_fuentes_fijas_que_existen(self):
        halladas = self.M.fuentes_fijas(expander=self._expander,
                                        existe=lambda r: r != self.existentes[2],
                                        globar=self._globar)
        self.assertEqual(halladas, sorted(self.existentes[:2]))

    def test_nunca_lanza_si_nada_existe(self):
        self.assertEqual(self.M.fuentes_fijas(expander=self._expander,
                                              existe=lambda r: False, globar=lambda p: []),
                         [])


class BuscarDocumentos(unittest.TestCase):
    def setUp(self):
        self.M = _cargar()
        self.raiz = os.path.join(HOME, "Documents")

    def _caminar(self, raiz):
        arbol = {raiz: (["app", "node_modules"], []),
                 os.path.join(raiz, "app"): ([], [".env", ".credentials.json", "notas.txt"]),
                 os.path.join(raiz, "node_modules"): ([], [".env"])}
        pendiente = [raiz]
        while pendiente:
            actual = pendiente.pop(0)
            carpetas, archivos = arbol.get(actual, ([], []))
            yield actual, carpetas, archivos
            pendiente.extend(os.path.join(actual, c) for c in carpetas)

    def test_claves_halladas_sin_credentials_ni_lo_regenerable(self):
        halladas = self.M.buscar_documentos(self.raiz, self.M.patrones_claves(LISTA),
                                            caminar=self._caminar, existe=lambda r: True)
        self.assertEqual(halladas, [os.path.join(self.raiz, "app", ".env")])

    def test_sin_documentos_no_espera_nada(self):
        self.assertEqual(self.M.buscar_documentos(self.raiz, ["*.pem"],
                                                  caminar=self._caminar,
                                                  existe=lambda r: False), [])


class Copiar(unittest.TestCase):
    def setUp(self):
        self.M = _cargar()
        self.ejecutadas = []
        self.creadas = []

    def _crear(self, carpeta, exist_ok=False):
        self.creadas.append(carpeta)

    def _ejecutar(self, orden, capture_output=False, text=False, timeout=None):
        self.ejecutadas.append((list(orden), timeout))

        class Hecho:
            returncode = 0
        return Hecho()

    def test_sin_disco_no_llama_a_nada(self):
        r = self.M.copiar(self.M.plan("abierta", RUTAS, home=HOME),
                          existe=lambda r: False, crear=self._crear,
                          medir=lambda r: 1, ejecutar=self._ejecutar, reloj=lambda: 1.0)
        self.assertEqual(r["estado"], "sin-disco")
        self.assertEqual(self.ejecutadas, [])

    def test_registro_solo_rutas_y_tamanos(self):
        r = self.M.copiar(self.M.plan("abierta", RUTAS, home=HOME),
                          existe=lambda r: True, crear=self._crear,
                          medir=lambda r: 42, ejecutar=self._ejecutar, reloj=lambda: 5.0)
        self.assertEqual(r["estado"], "ok")
        self.assertEqual(r["cuando"], 5)
        self.assertEqual([c["bytes"] for c in r["copias"]], [42] * len(RUTAS))
        for c in r["copias"]:
            self.assertEqual(set(c), {"ruta", "destino", "bytes", "estado"})

    def test_volumen_mudo_sin_respuesta_y_sigue(self):
        def mudo(orden, capture_output=False, text=False, timeout=None):
            raise subprocess.TimeoutExpired(orden, timeout or 0)
        r = self.M.copiar(self.M.plan("abierta", RUTAS, home=HOME),
                          existe=lambda r: True, crear=self._crear,
                          medir=lambda r: 1, ejecutar=mudo, reloj=lambda: 1.0)
        self.assertEqual(r["estado"], "con-avisos")
        self.assertEqual({c["estado"] for c in r["copias"]}, {"sin-respuesta"})

    def test_fallo_de_rsync_queda_anotado(self):
        class Hecho:
            returncode = 1
        r = self.M.copiar(self.M.plan("abierta", RUTAS, home=HOME),
                          existe=lambda r: True, crear=self._crear,
                          medir=lambda r: 1,
                          ejecutar=lambda o, **k: Hecho(), reloj=lambda: 1.0)
        self.assertEqual({c["estado"] for c in r["copias"]}, {"fallo"})


class Guardiana(unittest.TestCase):
    """`.credentials.json` no se copia a ningún sitio; nunca un diálogo ni una contraseña."""

    def setUp(self):
        self.M = _cargar()

    def test_nunca_copiable(self):
        for ruta in (os.path.join(self.M.DESTINO, ".credentials.json"),
                     os.path.join(HOME, "Documents", ".credentials.json")):
            self.assertFalse(self.M.copiable(ruta))

    def test_ningun_comando_abre_dialogos_ni_pide_claves(self):
        with open(os.path.join(AQUI, "maggabit_boveda.py"), encoding="utf-8") as f:
            codigo = f.read()
        for prohibido in ("osascript", "hdiutil", "password", "getpass"):
            self.assertNotIn(prohibido, codigo)


if __name__ == "__main__":
    unittest.main(verbosity=2)
