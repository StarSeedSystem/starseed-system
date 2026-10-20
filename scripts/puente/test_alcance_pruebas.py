"""Pruebas de alcance_pruebas: que la puerta corra las pruebas que la tarea toca."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from alcance_pruebas import (
    BASE,
    GUARDAS_CLIENTE,
    UMBRAL_IMPORTADORES,
    es_prueba,
    es_prueba_py,
    necesita_pytest,
    orden_vitest,
    pruebas_a_sumar,
    pruebas_python_a_sumar,
    repartir_por_corredor,
    toca_la_app,
)


def existe_de(conjunto):
    return lambda r: r in conjunto


class TestEsPrueba(unittest.TestCase):
    def test_reconoce_las_convenciones(self):
        for r in ("a/b.test.ts", "a/b.test.tsx", "a/b.spec.ts", "a/b.spec.tsx"):
            self.assertTrue(es_prueba(r), r)

    def test_una_fuente_no_es_prueba(self):
        self.assertFalse(es_prueba("src/lib/network/culture-discovery.ts"))
        self.assertFalse(es_prueba(""))


class TestPruebasASumar(unittest.TestCase):
    def test_el_caso_de_ps8(self):
        # Lo que tocó PS8: la fuente y su prueba hermana, fuera de src/lib/__tests__.
        cambiadas = [
            "src/lib/network/culture-discovery.ts",
            "src/lib/network/culture-discovery.test.ts",
        ]
        hay = existe_de(set(cambiadas))
        self.assertEqual(
            pruebas_a_sumar(cambiadas, hay),
            ["src/lib/network/culture-discovery.test.ts"],
        )

    def test_encuentra_la_hermana_aunque_no_este_en_el_diff(self):
        # Se cambia solo la fuente: su prueba sigue siendo puerta.
        hay = existe_de({"src/lib/network/culture-discovery.test.ts"})
        self.assertEqual(
            pruebas_a_sumar(["src/lib/network/culture-discovery.ts"], hay),
            ["src/lib/network/culture-discovery.test.ts"],
        )

    def test_convencion_de_carpeta___tests__(self):
        hay = existe_de({"src/components/mando/__tests__/publicar-ahora.test.tsx"})
        self.assertEqual(
            pruebas_a_sumar(["src/components/mando/publicar-ahora.tsx"], hay),
            ["src/components/mando/__tests__/publicar-ahora.test.tsx"],
        )

    def test_no_repite_lo_que_ya_cubre_la_base(self):
        ruta = BASE + "/mando-colas.test.ts"
        self.assertEqual(pruebas_a_sumar([ruta], existe_de({ruta})), [])

    def test_no_manda_a_vitest_lo_que_no_existe(self):
        self.assertEqual(
            pruebas_a_sumar(["src/lib/network/sin-prueba.ts"], existe_de(set())), []
        )

    def test_ignora_lo_que_no_es_typescript(self):
        hay = existe_de({"scripts/enjambre/x.test.ts"})
        self.assertEqual(pruebas_a_sumar(["scripts/enjambre/x.py", "README.md"], hay), [])

    def test_sin_repetidos_y_ordenado(self):
        cambiadas = [
            "src/lib/network/b.ts",
            "src/lib/network/b.test.ts",
            "src/lib/network/a.test.ts",
        ]
        hay = existe_de(set(cambiadas))
        self.assertEqual(
            pruebas_a_sumar(cambiadas, hay),
            ["src/lib/network/a.test.ts", "src/lib/network/b.test.ts"],
        )

    def test_aguanta_lineas_vacias_y_none(self):
        self.assertEqual(pruebas_a_sumar(["", "  ", None], existe_de(set())), [])
        self.assertEqual(pruebas_a_sumar(None, existe_de(set())), [])


class TestGuardasDelNavegador(unittest.TestCase):
    """El caso de S1010-MGR3b (2026-10-11): un componente de cliente con un import de valor
    a un módulo con node:child_process entró con tsc y sus pruebas en verde."""

    def test_el_caso_de_mgr3b_corre_las_guardas(self):
        cambiadas = [
            "src/lib/mando/tunel-metagenesis-estado.ts",
            "src/app/api/mando/tunel-metagenesis/route.ts",
            "src/components/mando/tunel-metagenesis-estado.tsx",
        ]
        hay = existe_de(set(GUARDAS_CLIENTE))
        self.assertEqual(pruebas_a_sumar(cambiadas, hay), sorted(GUARDAS_CLIENTE))

    def test_python_o_documentos_no_las_disparan(self):
        hay = existe_de(set(GUARDAS_CLIENTE))
        self.assertEqual(pruebas_a_sumar(["scripts/puente/x.py", "architecture/a.md"], hay), [])

    def test_tocar_solo_pruebas_no_las_dispara(self):
        prueba = "src/lib/network/a.test.ts"
        hay = existe_de(set(GUARDAS_CLIENTE) | {prueba})
        self.assertEqual(pruebas_a_sumar([prueba], hay), [prueba])

    def test_solo_las_que_existen(self):
        hay = existe_de({GUARDAS_CLIENTE[0]})
        self.assertTrue(toca_la_app("src/components/x.tsx"))
        self.assertEqual(pruebas_a_sumar(["src/components/x.tsx"], hay), [GUARDAS_CLIENTE[0]])


class TestOrdenVitest(unittest.TestCase):
    def test_sin_extras_es_el_comando_de_siempre(self):
        self.assertEqual(orden_vitest([]), "npx vitest run " + BASE)

    def test_con_extras_los_suma_detras(self):
        self.assertEqual(
            orden_vitest(["src/lib/network/culture-discovery.test.ts"]),
            "npx vitest run " + BASE + " src/lib/network/culture-discovery.test.ts",
        )


def carpeta_de(archivos):
    """Un «disco» en memoria: {ruta: texto} → (listar, leer) como los espera pruebas_python_a_sumar."""

    def listar(carpeta):
        return [r.rsplit("/", 1)[1] for r in archivos if r.rsplit("/", 1)[0] == carpeta]

    return listar, lambda ruta: archivos.get(ruta, "")


class TestPruebasDePython(unittest.TestCase):
    """(2026-10-20, AV1011G-d1) La puerta de Python corría 2813 pruebas (~373 s) con 120 s de plazo:
    ninguna tarea de Python pasaba. Ahora corre las de lo que toca."""

    def test_reconoce_las_convenciones(self):
        for r in ("a/test_b.py", "a/b_test.py", "test_b.py"):
            self.assertTrue(es_prueba_py(r), r)
        for r in ("a/b.py", "a/conftest.py", "a/test_b.ts", "", None):
            self.assertFalse(es_prueba_py(r), r)

    def test_un_py_corre_su_hermana_y_no_las_demas(self):
        listar, leer = carpeta_de({
            "scripts/protomolecula/vigias_3d.py": "",
            "scripts/protomolecula/test_vigias_3d.py": "import vigias_3d\n",
            "scripts/protomolecula/test_actualizar_catalogo.py": "import actualizar_catalogo\n",
        })
        r = pruebas_python_a_sumar(["scripts/protomolecula/vigias_3d.py"], listar, leer)
        self.assertEqual(r, {
            "por_carpeta": {"scripts/protomolecula": ["scripts/protomolecula/test_vigias_3d.py"]},
            "completas": [], "sin_prueba": [],
        })

    def test_la_hermana_vale_con_guiones_o_guiones_bajos_y_con_sufijo_test(self):
        listar, leer = carpeta_de({
            "scripts/puente/vigilante-enjambre.py": "",
            "scripts/puente/test_vigilante_enjambre.py": "",
            "scripts/puente/otro.py": "",
            "scripts/puente/otro_test.py": "",
        })
        r = pruebas_python_a_sumar(["scripts/puente/vigilante-enjambre.py", "scripts/puente/otro.py"], listar, leer)
        self.assertEqual(r["por_carpeta"]["scripts/puente"], [
            "scripts/puente/otro_test.py", "scripts/puente/test_vigilante_enjambre.py",
        ])

    def test_suma_las_pruebas_que_lo_importan_aunque_sean_de_otro_modulo(self):
        # Si cambia `publicar`, también corre la prueba que lo usa, no solo la suya.
        listar, leer = carpeta_de({
            "scripts/puente/publicar.py": "",
            "scripts/puente/test_publicar.py": "import publicar\n",
            "scripts/puente/test_vigia.py": "def f():\n    import publicar\n",
            "scripts/puente/test_desde.py": "from publicar import x\n",
            "scripts/puente/test_ajena.py": "# publicar es una palabra en un comentario\nimport os\n",
        })
        r = pruebas_python_a_sumar(["scripts/puente/publicar.py"], listar, leer)
        self.assertEqual(r["por_carpeta"]["scripts/puente"], [
            "scripts/puente/test_desde.py", "scripts/puente/test_publicar.py", "scripts/puente/test_vigia.py",
        ])
        self.assertEqual(r["completas"], [])

    def test_carga_por_ruta_de_un_modulo_con_guiones(self):
        listar, leer = carpeta_de({
            "scripts/enjambre/starseed-enjambre.py": "",
            "scripts/enjambre/test_a.py": 'importlib.import_module("starseed-enjambre")\n',
            "scripts/enjambre/test_b.py": 'spec_from_file_location("e", "x/starseed-enjambre.py")\n',
        })
        r = pruebas_python_a_sumar(["scripts/enjambre/starseed-enjambre.py"], listar, leer)
        self.assertEqual(len(r["por_carpeta"]["scripts/enjambre"]), 2)

    def test_la_carpeta_entera_solo_si_muchas_pruebas_lo_importan(self):
        archivos = {"scripts/enjambre/core.py": ""}
        for i in range(UMBRAL_IMPORTADORES):
            archivos["scripts/enjambre/test_%d.py" % i] = "import core\n"
        listar, leer = carpeta_de(archivos)
        self.assertEqual(pruebas_python_a_sumar(["scripts/enjambre/core.py"], listar, leer)["completas"], [])
        archivos["scripts/enjambre/test_extra.py"] = "import core\n"
        listar, leer = carpeta_de(archivos)
        self.assertEqual(pruebas_python_a_sumar(["scripts/enjambre/core.py"], listar, leer)["completas"], ["scripts/enjambre"])

    def test_un_py_sin_ninguna_prueba_se_declara_sin_prueba(self):
        listar, leer = carpeta_de({"scripts/puente/solo.py": "", "scripts/puente/test_x.py": "import x\n"})
        r = pruebas_python_a_sumar(["scripts/puente/solo.py"], listar, leer)
        self.assertEqual(r, {"por_carpeta": {}, "completas": [], "sin_prueba": ["scripts/puente/solo.py"]})

    def test_tocar_una_prueba_corre_esa_prueba_si_existe(self):
        listar, leer = carpeta_de({"scripts/puente/test_x.py": ""})
        r = pruebas_python_a_sumar(["scripts/puente/test_x.py", "scripts/puente/test_borrada.py"], listar, leer)
        self.assertEqual(r["por_carpeta"], {"scripts/puente": ["scripts/puente/test_x.py"]})
        self.assertEqual(r["sin_prueba"], [])

    def test_ignora_lo_que_no_es_un_modulo_de_python(self):
        listar, leer = carpeta_de({"a/__init__.py": "", "a/conftest.py": "", "a/test_z.py": ""})
        vacio = {"por_carpeta": {}, "completas": [], "sin_prueba": []}
        for rutas in (["a/__init__.py", "a/conftest.py", "a/x.ts", "README.md", "suelto.py", "", None], [], None):
            self.assertEqual(pruebas_python_a_sumar(rutas, listar, leer), vacio)

    def test_ordenado_y_sin_repetidos(self):
        listar, leer = carpeta_de({"b/y.py": "", "b/test_y.py": "", "a/x.py": "", "a/test_x.py": ""})
        r = pruebas_python_a_sumar(["b/y.py", "a/x.py", "b/y.py"], listar, leer)
        self.assertEqual(list(r["por_carpeta"]), ["a", "b"])

    def test_servicios_fuera_de_scripts_tambien_tienen_puerta(self):
        listar, leer = carpeta_de({
            "servicios/taller-3d/motores/unimate.py": "",
            "servicios/taller-3d/motores/test_unimate.py": "",
        })
        r = pruebas_python_a_sumar(["servicios/taller-3d/motores/unimate.py"], listar, leer)
        self.assertEqual(r["por_carpeta"], {"servicios/taller-3d/motores": ["servicios/taller-3d/motores/test_unimate.py"]})


class TestCorredorDeCadaPrueba(unittest.TestCase):
    """(2026-10-20, AV1011G-d1) unittest sobre una prueba de funciones sueltas da «Ran 0 tests … OK»:
    un verde que no comprobó nada. Medido en scripts/puente/flujos/test_registro.py y en cinco
    pruebas de scripts/puente (instalar_modelo, produccion_puertas…) que la puerta de siempre,
    `unittest discover`, daba por buenas sin ejecutar ninguna."""

    def test_funciones_sueltas_fixtures_e_import_de_pytest_piden_pytest(self):
        for texto in (
            "def test_a():\n    assert True\n",
            "import os\n\nasync def test_b():\n    pass\n",
            "import pytest\n",
            "from pytest import raises\n",
            "import unittest\n\n@pytest.fixture\ndef x():\n    pass\n",
            "class T(unittest.TestCase):\n    pass\n\ndef test_suelta():\n    pass\n",  # mixta: pytest corre las dos
        ):
            self.assertTrue(necesita_pytest(texto), texto)

    def test_una_clase_testcase_sin_mas_se_queda_con_unittest(self):
        for texto in (
            "import unittest\n\nclass T(unittest.TestCase):\n    def test_a(self):\n        pass\n",
            "# habla de pytest y de def test_x() en un comentario\nimport unittest\n",
            "    def test_dentro_de_una_clase(self):\n        pass\n",
            "",
            None,
        ):
            self.assertFalse(necesita_pytest(texto), texto)

    def test_reparte_ordenado_y_sin_repetidos_y_lo_ilegible_va_a_unittest(self):
        textos = {"a/test_b.py": "def test_x():\n    pass\n", "a/test_a.py": "import unittest\n", "a/test_c.py": ""}
        r = repartir_por_corredor(["a/test_c.py", "a/test_b.py", "a/test_a.py", "a/test_b.py"], lambda ruta: textos.get(ruta, ""))
        self.assertEqual(r, {"unittest": ["a/test_a.py", "a/test_c.py"], "pytest": ["a/test_b.py"]})
        self.assertEqual(repartir_por_corredor(None, lambda r: ""), {"unittest": [], "pytest": []})


class TestImportaDicelaVerdad(unittest.TestCase):
    """La docstring de `_importa` prometía no contar los comentarios; la regla de la ruta `x.py` sí los
    cuenta. Ahora lo dice, y estas pruebas fijan LO QUE HACE (sobreincluir es inocuo; quedarse corto no)."""

    def test_la_mencion_de_la_ruta_cuenta_aunque_sea_un_comentario(self):
        listar, leer = carpeta_de({"p/x.py": "", "p/test_otro.py": "# prueba sobre x.py\n"})
        self.assertEqual(pruebas_python_a_sumar(["p/x.py"], listar, leer)["por_carpeta"], {"p": ["p/test_otro.py"]})

    def test_un_import_comentado_no_cuenta(self):
        listar, leer = carpeta_de({"p/x.py": "", "p/test_otro.py": "# import x\nimport y\n"})
        self.assertEqual(pruebas_python_a_sumar(["p/x.py"], listar, leer)["sin_prueba"], ["p/x.py"])

    def test_pruebas_en_una_subcarpeta_no_se_buscan_y_el_modulo_sale_como_sin_prueba(self):
        listar, leer = carpeta_de({"p/x.py": "", "p/tests/test_x.py": "import x\n"})
        self.assertEqual(pruebas_python_a_sumar(["p/x.py"], listar, leer)["sin_prueba"], ["p/x.py"])


if __name__ == "__main__":
    unittest.main()
