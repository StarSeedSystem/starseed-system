"""Pruebas herméticas de maggabit_versiones.

Puras: no tocan /Volumes, la red, ~/.starseed ni el disco real. La E/S va
siempre inyectada (subprocess falso, medidor falso).
"""

import subprocess
import unittest
from types import SimpleNamespace

import maggabit_versiones as mv


def publicacion(
    etiqueta="v1.0.0",
    archivos=None,
    publicado="2026-11-17T10:00:00Z",
    nombre=None,
    canal=None,
    prueba=None,
):
    p = {
        "etiqueta": etiqueta,
        "nombre": nombre or f"Instalador {etiqueta}",
        "publicado": publicado,
        "archivos": archivos if archivos is not None else [{"nombre": "instalador.dmg", "bytes": 10}],
    }
    if canal is not None:
        p["canal"] = canal
    if prueba is not None:
        p["prueba"] = prueba
    return p


class RunnerFalso:
    """Subprocess falso: registra la orden y el timeout, nunca toca la red."""

    def __init__(self, stdout="", codigo=0, error=None):
        self.llamadas = []
        self.stdout = stdout
        self.codigo = codigo
        self.error = error

    def __call__(self, orden, timeout):
        self.llamadas.append({"orden": list(orden), "timeout": timeout})
        if self.error is not None:
            raise self.error
        return SimpleNamespace(returncode=self.codigo, stdout=self.stdout, stderr="")


class PlanSinCambios(unittest.TestCase):
    def test_sin_cambios_no_hace_nada(self):
        p = publicacion()
        self.assertEqual(mv.plan([p], {"v1.0.0": mv.ficha_de(p)}), [])

    def test_publicacion_nueva_se_baja(self):
        acciones = mv.plan([publicacion()], {})
        self.assertEqual([a["accion"] for a in acciones], ["bajar"])
        self.assertEqual(acciones[0]["destino"], "MetaGenesis/instaladores/v1.0.0")
        self.assertEqual(acciones[0]["etiqueta"], "v1.0.0")

    def test_ficha_cambiada_se_rebaja(self):
        nueva = publicacion(archivos=[{"nombre": "instalador.dmg", "bytes": 12}])
        guardada = mv.ficha_de(publicacion(archivos=[{"nombre": "instalador.dmg", "bytes": 10}]))
        acciones = mv.plan([nueva], {"v1.0.0": guardada})
        self.assertEqual([a["accion"] for a in acciones], ["bajar"])
        self.assertEqual(acciones[0]["etiqueta"], "v1.0.0")


class PlanCanalPruebas(unittest.TestCase):
    def _guardadas_pruebas(self, numeros):
        guardadas = {}
        for n in numeros:
            p = publicacion(etiqueta=f"prueba-{n}", canal="canal-pruebas", prueba=n)
            guardada = mv.ficha_de(p)
            guardada["destino"] = f"MetaGenesis/instaladores/canal-pruebas/prueba-{n}"
            guardadas[f"prueba-{n}"] = guardada
        return guardadas

    def test_prueba_nueva_baja_y_retira_la_cuarta(self):
        guardadas = self._guardadas_pruebas([1, 2, 3])
        nueva = publicacion(etiqueta="prueba-4", canal="canal-pruebas", prueba=4)
        acciones = mv.plan([nueva], guardadas)
        bajas = [a for a in acciones if a["accion"] == "bajar"]
        retirar = [a for a in acciones if a["accion"] == "retirar"]
        self.assertEqual([b["etiqueta"] for b in bajas], ["prueba-4"])
        self.assertEqual(bajas[0]["destino"], "MetaGenesis/instaladores/canal-pruebas/prueba-4")
        self.assertEqual([r["etiqueta"] for r in retirar], ["prueba-1"])
        self.assertEqual(retirar[0]["canal"], "canal-pruebas")
        self.assertEqual(retirar[0]["poda"]["conservadas"], ["prueba-4", "prueba-3", "prueba-2"])
        self.assertIn("Poda", retirar[0]["poda"]["motivo"])

    def test_poda_nunca_toca_una_estable(self):
        guardadas = self._guardadas_pruebas([1, 2, 3])
        guardada_estable = mv.ficha_de(publicacion())
        guardada_estable["canal"] = "estable"
        guardadas["v1.0.0"] = guardada_estable
        self.assertEqual(mv.plan([], guardadas), [])

    def test_canal_pruebas_con_cinco_guardadas_retira_las_dos_mas_viejas(self):
        guardadas = self._guardadas_pruebas([1, 2, 3, 4, 5])
        acciones = mv.plan([], guardadas)
        retirar = [a["etiqueta"] for a in acciones if a["accion"] == "retirar"]
        self.assertEqual(sorted(retirar), ["prueba-1", "prueba-2"])

    def test_prueba_guardada_con_ficha_cambiada_se_rebaja_sin_podar(self):
        guardadas = self._guardadas_pruebas([1, 2, 3])
        cambiada = publicacion(
            etiqueta="prueba-3",
            canal="canal-pruebas",
            prueba=3,
            publicado="2026-11-18T09:00:00Z",
        )
        acciones = mv.plan([cambiada], guardadas)
        self.assertEqual([a["accion"] for a in acciones], ["bajar"])


class ComprobarTests(unittest.TestCase):
    def _ficha(self):
        return mv.ficha_de(
            publicacion(
                archivos=[
                    {"nombre": "instalador.dmg", "bytes": 10},
                    {"nombre": "instalador.exe", "bytes": 20},
                ]
            )
        )

    def test_carpeta_completa(self):
        medidas = {"instalador.dmg": 10, "instalador.exe": 20}
        medidor = lambda carpeta, nombre: medidas.get(nombre)  # noqa: E731
        r = mv.comprobar("MetaGenesis/instaladores/v1.0.0", self._ficha(), medidor)
        self.assertEqual(r["estado"], "completa")
        self.assertTrue(r["completa"])
        self.assertEqual(r["fallos"], [])

    def test_archivo_corto_es_incompleta(self):
        medidas = {"instalador.dmg": 4, "instalador.exe": 20}
        medidor = lambda carpeta, nombre: medidas.get(nombre)  # noqa: E731
        r = mv.comprobar("carpeta", self._ficha(), medidor)
        self.assertEqual(r["estado"], "incompleta")
        self.assertFalse(r["completa"])
        self.assertEqual(r["fallos"][0]["motivo"], "medida-distinta")
        self.assertEqual(r["fallos"][0]["esperados"], 10)
        self.assertEqual(r["fallos"][0]["medidos"], 4)

    def test_archivo_faltante_es_incompleta(self):
        r = mv.comprobar("carpeta", self._ficha(), lambda carpeta, nombre: None)
        self.assertEqual(r["estado"], "incompleta")
        self.assertEqual(r["fallos"][0]["motivo"], "falta")

    def test_disco_ausente_no_rompe_ni_espera(self):
        r = mv.comprobar("ruta/que/no/existe", self._ficha())
        self.assertEqual(r["estado"], "incompleta")
        self.assertEqual(len(r["fallos"]), 2)
        self.assertEqual(r["fallos"][0]["motivo"], "falta")


class CapaGhTests(unittest.TestCase):
    def test_ver_publicacion_usa_gh_view_con_timeout(self):
        stdout = (
            '{"tagName":"v1.0.0","name":"Instalador","publishedAt":"2026-11-17T10:00:00Z",'
            '"isLatest":true,"assets":[{"name":"instalador.dmg","size":10}]}'
        )
        runner = RunnerFalso(stdout=stdout)
        r = mv.ver_publicacion("v1.0.0", runner)
        self.assertEqual(r["estado"], "ok")
        self.assertTrue(r["latest"])
        self.assertEqual(r["ficha"]["archivos"][0]["bytes"], 10)
        orden = runner.llamadas[0]["orden"]
        self.assertIn("view", orden)
        self.assertIn("--json", orden)
        self.assertEqual(runner.llamadas[0]["timeout"], mv.TIMEOUT_GH)

    def test_gh_colgado_devuelve_sin_respuesta_y_no_se_cuelga(self):
        colgado = RunnerFalso(error=subprocess.TimeoutExpired(cmd="gh", timeout=1))
        r = mv.ver_publicacion("v1.0.0", colgado)
        self.assertEqual(r["estado"], "sin-respuesta")

    def test_descarga_usa_clobber_destino_y_timeout(self):
        runner = RunnerFalso()
        r = mv.descargar_publicacion(
            "v1.0.0", "MetaGenesis/instaladores/v1.0.0", runner, lambda destino: True
        )
        self.assertEqual(r["estado"], "ok")
        orden = runner.llamadas[0]["orden"]
        self.assertIn("download", orden)
        self.assertIn("--clobber", orden)
        self.assertIn("MetaGenesis/instaladores/v1.0.0", orden)
        self.assertEqual(runner.llamadas[0]["timeout"], mv.TIMEOUT_GH)

    def test_disco_ausente_no_llama_a_gh_ni_espera(self):
        runner = RunnerFalso()
        r = mv.descargar_publicacion(
            "v1.0.0", "volumen-que-no-esta/instaladores/v1.0.0", runner, lambda destino: False
        )
        self.assertEqual(r["estado"], "disco-ausente")
        self.assertEqual(runner.llamadas, [])

    def test_gh_con_error_devuelve_estado_error(self):
        runner = RunnerFalso(codigo=1)
        r = mv.ver_publicacion("v1.0.0", runner)
        self.assertEqual(r["estado"], "error")


if __name__ == "__main__":
    unittest.main()
