import unittest

import jev_reservadas


RESERVADAS_ESPERADAS = (
    "integrar-main",
    "publicar",
    "push",
    "desplegar",
    "borrar-datos",
    "bajar-privacidad",
    "gasto-sobre-techo",
    "claves-permisos",
    "migraciones",
    "funciona-verificacion",
    "informe-veraz",
    "cambiar-umbrales-propios",
)


class TestReservadas(unittest.TestCase):
    def test_cada_dominio_reservado_exige_humano(self):
        self.assertEqual(jev_reservadas.RESERVADAS, RESERVADAS_ESPERADAS)
        for dominio in RESERVADAS_ESPERADAS:
            with self.subTest(dominio=dominio):
                self.assertTrue(jev_reservadas.exige_humano(dominio))

    def test_un_dominio_normal_no_exige_humano(self):
        self.assertFalse(jev_reservadas.exige_humano("redactar-informe"))
        self.assertFalse(jev_reservadas.exige_humano("dominio-desconocido"))

    def test_normaliza_mayusculas_guiones_y_espacios(self):
        for dominio in ("INTEGRAR MAIN", "Integrar-Main", " integrar main "):
            with self.subTest(dominio=dominio):
                self.assertTrue(jev_reservadas.exige_humano(dominio))

    def test_la_lista_no_tiene_duplicados(self):
        self.assertEqual(
            len(jev_reservadas.RESERVADAS),
            len(set(jev_reservadas.RESERVADAS)),
        )

    def test_solo_puede_vetar_es_alias_de_exige_humano(self):
        for dominio in (*RESERVADAS_ESPERADAS, "dominio-desconocido"):
            with self.subTest(dominio=dominio):
                self.assertEqual(
                    jev_reservadas.solo_puede_vetar(dominio),
                    jev_reservadas.exige_humano(dominio),
                )


if __name__ == "__main__":
    unittest.main()
