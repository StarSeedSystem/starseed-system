"""SUP0111B (31-10): un .tsx SIN git con JSX inválido tumbó todas las builds, Mac y A1, durante horas.
Lo que git no conoce y esbuild dice que no transpila se aparta a cuarentena (se mueve, nunca se borra)."""
import os
import shutil
import subprocess
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

import cuarentena_sin_git as C

AHORA = time.mktime((2026, 11, 2, 18, 30, 0, 0, 0, -1))  # → «20261102-1830-sin-git»
VALIDO = "export const A = (xs) => <ul>{xs.map((x) => <li key={x}>{x}</li>)}</ul>;\n"
DEL_31_10 = "export const A = (xs) => <ul>{xs.map((x) => <li>{x}</li><li>otro</li>)}</ul>;\n"
#: Un esbuild de mentira: «ROTO» dentro del archivo = error de sintaxis con ruta:línea:columna, como el de verdad.
ESBUILD_FALSO = r"""#!/bin/sh
if grep -q ROTO "$1"; then printf '✘ [ERROR] Syntax error "l"\n\n    %s:2:66:\n' "$1" >&2; exit 1; fi
"""
RAIZ_VIVA = os.environ.get("STARSEED_ROOT") or os.path.expanduser("~/Documents/starseed-os-main")


class Puras(unittest.TestCase):
    def test_candidatos_se_queda_con_las_fuentes_de_codigo(self):
        salida = ["src/a.ts", "src/b.tsx", "src/c.js", "src/d.jsx", "src/e.mjs", "src/f.css", "src/g.json", "", "src/i.tsx\r"]
        self.assertEqual(C.candidatos(salida), ["src/a.ts", "src/b.tsx", "src/c.js", "src/d.jsx", "src/e.mjs", "src/i.tsx"])
        self.assertEqual(C.candidatos("src/a.ts\0src/b.png\0src/c.tsx\0"), ["src/a.ts", "src/c.tsx"])  # `ls-files -z`
        self.assertEqual(C.candidatos(None), [])

    def test_el_veredicto_solo_es_no_si_esbuild_senala_el_archivo_y_el_js_admite_jsx(self):
        error = '✘ [ERROR] Syntax error "l"\n\n    src/a.tsx:2:66:\n'
        casos = [(0, ""), (1, error), (1, '✘ [ERROR] Could not resolve "src/a.ts"\n'), (127, "env: node: No such file"), (-9, ""), (1, None)]
        self.assertEqual([C.veredicto(rc, salida) for rc, salida in casos], [True, False, None, None, None, None])
        self.assertEqual(C.orden_esbuild("/x/esbuild", "src/a.js"),  # el cargador va por extensión y `.js` admite JSX
                         ["/x/esbuild", "src/a.js", "--loader:.js=jsx", "--log-level=error", "--outfile=/dev/null"])


class Revisar(unittest.TestCase):
    def setUp(self):
        self.raiz, self.fuera = tempfile.mkdtemp(), tempfile.mkdtemp()  # el repo y SU cuarentena (nunca la del HOME)
        for d in (self.raiz, self.fuera):
            self.addCleanup(shutil.rmtree, d, True)
        self.escribe("src/versionado.tsx", "ROTO\n")  # roto, pero CON git
        subprocess.run("git init -q && git add . && git -c user.name=t -c user.email=t@t -c commit.gpgsign=false "
                       "-c core.hooksPath=/dev/null commit -qm x", shell=True, cwd=self.raiz, check=True, capture_output=True)
        self.esbuild = os.path.join(self.raiz, "node_modules", ".bin", "esbuild")
        self.escribe(self.esbuild, ESBUILD_FALSO)
        os.chmod(self.esbuild, 0o755)
        self.canal = mock.patch.object(C, "_puente").start()
        self.addCleanup(mock.patch.stopall)

    def escribe(self, ruta, texto):  # con ruta absoluta, `join` se queda con ella
        ruta = os.path.join(self.raiz, ruta)
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        Path(ruta).write_text(texto, encoding="utf-8")

    def existe(self, ruta):
        return os.path.exists(os.path.join(self.raiz, ruta))

    def test_un_roto_sin_git_se_aparta_entero_sin_pisar_nada_y_se_avisa(self):
        destino = os.path.join(self.fuera, "20261102-1830-sin-git", "src")
        self.escribe("src/app/mando/page.tsx", "ROTO\n")
        self.escribe("src/roto.tsx", "ROTO 2\n")
        self.escribe(os.path.join(destino, "roto.tsx"), "el anterior\n")  # destino ya ocupado: ese no se pisa
        self.assertEqual(sorted(C.revisar(self.raiz, AHORA, self.fuera)), ["src/app/mando/page.tsx", "src/roto.tsx"])
        self.assertEqual(Path(destino, "app", "mando", "page.tsx").read_text(encoding="utf-8"), "ROTO\n")  # movido, no borrado
        self.assertEqual(Path(destino, "roto.tsx").read_text(encoding="utf-8"), "el anterior\n")
        self.assertEqual(Path(destino, "roto.tsx.otro").read_text(encoding="utf-8"), "ROTO 2\n")
        self.assertFalse(self.existe("src/app/mando/page.tsx") or self.existe("src/roto.tsx"))
        aviso = self.canal.return_value.decir.call_args[0]
        self.assertIn("src/app/mando/page.tsx", aviso[0])
        self.assertEqual(aviso[1:], ("reconstruir", "aviso"))

    def test_lo_valido_lo_versionado_lo_ignorado_y_lo_que_no_es_codigo_nunca_se_tocan_ni_se_avisan(self):
        for ruta, texto in ((".gitignore", "src/ignorado.tsx\n"), ("src/ignorado.tsx", "ROTO\n"), ("src/estilos.css", "ROTO\n"),
                            ("src/app/nuevo.tsx", "export const A = 1;\n")):  # el nuevo, SIN git, pero válido
            self.escribe(ruta, texto)
        self.assertEqual(C.revisar(self.raiz, AHORA, self.fuera), [])
        self.assertTrue(all(self.existe("src/" + n) for n in ("versionado.tsx", "ignorado.tsx", "estilos.css", "app/nuevo.tsx")))
        self.assertEqual(C.revisar(self.fuera, AHORA, self.fuera), [])  # ni un repo: no decide nada
        self.canal.return_value.decir.assert_not_called()

    def test_sin_esbuild_o_si_no_llega_a_opinar_no_se_mueve_nada(self):
        self.escribe("src/roto.tsx", "ROTO\n")
        os.rename(self.esbuild, self.esbuild + ".off")  # sin esbuild
        self.assertEqual(C.revisar(self.raiz, AHORA, self.fuera), [])
        self.escribe(self.esbuild, "#!/bin/sh\nexit 127\n")  # no arranca: rc 127 y ni un [ERROR]
        os.chmod(self.esbuild, 0o755)
        self.assertEqual(C.revisar(self.raiz, AHORA, self.fuera), [])
        self.assertTrue(self.existe("src/roto.tsx"))


@unittest.skipUnless(os.access(os.path.join(RAIZ_VIVA, "node_modules", ".bin", "esbuild"), os.X_OK), "no hay esbuild instalado")
class ConElEsbuildDeVerdad(unittest.TestCase):
    def test_lo_del_31_10_no_transpila_y_un_js_con_jsx_o_un_generico_si(self):
        casos = (("roto.tsx", DEL_31_10, False), ("bien.tsx", VALIDO, True), ("jsx.js", VALIDO, True),
                 ("t.ts", "export const f = <T,>(x: T) => x;\n", True))
        with tempfile.TemporaryDirectory() as d:
            for nombre, texto, _ in casos:
                Path(d, nombre).write_text(texto, encoding="utf-8")
            self.assertEqual([C.transpila(RAIZ_VIVA, os.path.join(d, n)) for n, _, _ in casos], [e for _, _, e in casos])


class EnLaPasada(unittest.TestCase):
    def test_la_pasada_revisa_primero_y_un_fallo_de_revisar_no_la_tumba(self):
        import reconstruir_mando as R
        with mock.patch.object(R, "_entradas", side_effect=RuntimeError("fin")), \
                mock.patch.object(C, "revisar", side_effect=OSError("git")) as revisar:
            with self.assertRaisesRegex(RuntimeError, "fin"):  # llegó a lo de después: el OSError de revisar no la tumbó
                R.una_pasada()
        revisar.assert_called_once_with(R.RAIZ)

    def test_en_una_prueba_con_la_cuarentena_real_no_mira_ni_toca_el_checkout_vivo(self):  # como puente._canal_protegido
        with mock.patch.object(C.subprocess, "run") as run:  # sin esto, cada una_pasada de las otras pruebas escanearía lo vivo
            self.assertEqual(C.revisar(RAIZ_VIVA), [])
            run.assert_not_called()
            with mock.patch.dict(os.environ, {"STARSEED_CHAT_EN_PRUEBAS": "1"}):  # el interruptor de puente: ahí sí mira
                C.revisar(RAIZ_VIVA)
            run.assert_called()
