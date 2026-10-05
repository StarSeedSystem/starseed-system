"""Pruebas de diseno_reglas: puntuación pura del informe y del diff."""
import unittest

from diseno_reglas import puntuar


def informe_base():
    return {
        "ruta": "/mando",
        "tamano": "escritorio",
        "desbordes": [],
        "contraste_bajo": [],
        "dianas_chicas": [],
        "errores_consola": [],
        "fuera_horizontal": [],
    }


class PuntuarLimpio(unittest.TestCase):
    def test_informe_limpio_aprueba_con_90_o_mas(self):
        r = puntuar(informe_base(), "+++ b/src/app/x.tsx\n+const a = 1")
        self.assertGreaterEqual(r["nota"], 90)
        self.assertTrue(r["aprobado"])
        self.assertEqual(r["fallos"], [])


class PuntuarFallos(unittest.TestCase):
    def test_desbordes_y_contraste_bajan_de_75(self):
        informe = informe_base()
        informe["tamano"] = "movil"
        informe["desbordes"] = ["div.titulo", "p.texto"]
        informe["contraste_bajo"] = ["span.nota 3.00:1"]
        r = puntuar(informe)
        self.assertLess(r["nota"], 75)
        self.assertFalse(r["aprobado"])
        tipos = {f["tipo"] for f in r["fallos"]}
        self.assertEqual(tipos, {"desborde", "contraste_bajo"})
        for fallo in r["fallos"]:
            self.assertTrue(fallo["arreglo"])
            self.assertIn("/mando", fallo["donde"] + " " + fallo["arreglo"])

    def test_dianas_y_errores_descuentan(self):
        informe = informe_base()
        informe["dianas_chicas"] = ["button#ok 30x30"]
        informe["errores_consola"] = ["TypeError: x"]
        informe["fuera_horizontal"] = ["aside"]
        r = puntuar(informe)
        self.assertLess(r["nota"], 75)
        self.assertEqual({f["tipo"] for f in r["fallos"]},
                         {"diana_chica", "error_consola", "fuera_horizontal"})

    def test_tope_por_tipo(self):
        informe = informe_base()
        informe["desbordes"] = [f"div{i}" for i in range(10)]
        r = puntuar(informe)
        self.assertEqual(r["nota"], 60)  # tope -40
        self.assertEqual(len(r["fallos"]), 10)


class PuntuarDiff(unittest.TestCase):
    def test_hex_suelto_descuenta(self):
        r = puntuar(informe_base(), "+color: #ff00aa;")
        self.assertLess(r["nota"], 100)
        self.assertEqual(r["fallos"][0]["tipo"], "hex_suelto")
        self.assertIn("#ff00aa", r["fallos"][0]["donde"])

    def test_token_no_descuenta(self):
        r = puntuar(informe_base(), "+color: var(--trinity-zenith);")
        self.assertEqual(r["nota"], 100)
        self.assertEqual(r["fallos"], [])

    def test_important_y_zindex_alto(self):
        r = puntuar(informe_base(), "+color: red !important;\n+z-index: 9999;")
        tipos = {f["tipo"] for f in r["fallos"]}
        self.assertEqual(tipos, {"important", "zindex_alto"})

    def test_lineas_eliminadas_no_cuentan(self):
        r = puntuar(informe_base(), "-color: #ff00aa;")
        self.assertEqual(r["nota"], 100)


if __name__ == "__main__":
    unittest.main()
