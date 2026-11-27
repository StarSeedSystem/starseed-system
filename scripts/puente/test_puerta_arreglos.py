import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import puerta_arreglos as pa

LIB = "native/src-tauri/src/lib.rs"
LOGICA = "native/src-tauri/src/puerta_proxy_logica.rs"


def _diff(ruta, quitadas=(), puestas=(), extra=""):
    cuerpo = "".join("-%s\n" % q for q in quitadas) + "".join("+%s\n" % p for p in puestas)
    return (
        "diff --git a/%s b/%s\nindex 1..2 100644\n--- a/%s\n+++ b/%s\n@@ -1,9 +1,9 @@\n%s%s"
        % (ruta, ruta, ruta, ruta, extra, cuerpo)
    )


class PuertaArreglos(unittest.TestCase):
    def test_diff_real_de_ab6cdd5aa_se_rechaza(self):
        comandos = ["        nativa::serie_%d," % i for i in range(6)] + [
            "        nativa::capas_listar,",
            "        nativa::capas_estado,",
            "        nativa::nas_listar,",
        ]
        d = _diff(LIB, comandos) + _diff(
            LOGICA,
            ["#[cfg(test)]", "mod pruebas {"] + ["    #[test]", "    fn caso() {}"] * 40,
        )
        v = pa.veredicto(d)
        self.assertFalse(v["ok"])
        self.assertTrue(any("lib.rs" in m for m in v["motivos"]))
        self.assertTrue(any("pruebas" in m for m in v["motivos"]))

    def test_arreglo_bueno_de_dir1127g_es_ok(self):
        d = _diff(
            LIB,
            ["    let r = crate::servidor_local();"],
            ["    #[cfg(desktop)]", "    let r = crate::servidor_local();", "    (None, None)"],
        )
        self.assertTrue(pa.veredicto(d)["ok"])

    def test_borrar_50_anadiendo_5_se_rechaza(self):
        d = _diff("src/x.ts", ["const a%d = 1;" % i for i in range(50)], ["const b = 1;"] * 5)
        v = pa.veredicto(d)
        self.assertFalse(v["ok"])
        self.assertTrue(any("50 líneas" in m for m in v["motivos"]))

    def test_anadir_un_punto_y_coma_es_ok(self):
        d = _diff("src/x.rs", ["let a = 1"], ["let a = 1;"])
        self.assertEqual(pa.veredicto(d), {"ok": True, "motivos": []})

    def test_borrar_archivo_entero_se_rechaza(self):
        d = "diff --git a/src/y.ts b/src/y.ts\ndeleted file mode 100644\n--- a/src/y.ts\n+++ /dev/null\n"
        self.assertFalse(pa.veredicto(d)["ok"])

    def test_borrar_prueba_python_o_ts_se_rechaza(self):
        for q in ("def test_algo():", "  it('hace algo', () => {", "describe('x', () => {"):
            self.assertFalse(pa.veredicto(_diff("a/t.py", [q]))["ok"], q)

    def test_mover_una_prueba_no_cuenta(self):
        d = _diff("a/t.py", ["def test_algo():"], ["def test_algo():"])
        self.assertTrue(pa.veredicto(d)["ok"])

    def test_quitar_permiso_o_comando_de_build_se_rechaza(self):
        caps = _diff("native/src-tauri/capabilities/default.json", ['    "allow-nas-listar",'])
        build = _diff("native/src-tauri/build.rs", ['    "nas_listar",'])
        self.assertFalse(pa.veredicto(caps)["ok"])
        self.assertFalse(pa.veredicto(build)["ok"])

    def test_deteccion_de_tarea(self):
        self.assertTrue(
            pa.es_arreglo_de_compilacion({"titulo": "URGENTE · Arreglar la compilación de pruebas N.º 66"})
        )
        self.assertTrue(pa.es_arreglo_de_compilacion({"titulo": "x", "ola": "A-desbloqueo-66"}))
        self.assertFalse(pa.es_arreglo_de_compilacion({"titulo": "Nueva ficha", "ola": "NEU1126B"}))


if __name__ == "__main__":
    unittest.main()
