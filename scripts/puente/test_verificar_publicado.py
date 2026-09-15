# -*- coding: utf-8 -*-
"""Pruebas de la parte que sí toca el disco: qué es un ejecutable de verdad."""

import os
import shutil
import sys
import tempfile
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import verificar_publicado as VP


class PruebaEsEjecutable(unittest.TestCase):
    def setUp(self):
        self.base = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.base, True)

    def _escribir(self, nombre, texto):
        ruta = os.path.join(self.base, nombre)
        with open(ruta, "w", encoding="utf-8") as f:
            f.write(texto)
        return nombre

    def test_un_shebang_basta(self):
        n = self._escribir("guion.sh", "#!/bin/bash\necho hola\n")
        self.assertTrue(VP.es_ejecutable(self.base, n))

    def test_un_if_name_de_nivel_superior_cuenta(self):
        n = self._escribir("cli.py", 'import sys\n\nif __name__ == "__main__":\n    sys.exit(0)\n')
        self.assertTrue(VP.es_ejecutable(self.base, n))
        n2 = self._escribir("cli2.py", "if __name__ == '__main__':\n    pass\n")
        self.assertTrue(VP.es_ejecutable(self.base, n2))

    def test_MENCIONARLO_en_un_comentario_no_cuenta(self):
        # El caso real: los dos módulos que EXPLICAN qué es un ejecutable salían
        # marcados como ejecutables, y el informe decía «se lanza por su nombre»
        # de un módulo que solo se importa. Un informe con motivos falsos no se
        # vuelve a leer.
        n = self._escribir(
            "modulo.py",
            '"""Un módulo normal.\n\n`ejecutable` quiere decir que tiene shebang o\n'
            '`if __name__ == "__main__"`.\n"""\n\n\ndef f():\n    return 1\n',
        )
        self.assertFalse(VP.es_ejecutable(self.base, n))

    def test_un_if_name_sangrado_tampoco(self):
        n = self._escribir("raro.py", 'def f():\n    if __name__ == "__main__":\n        pass\n')
        self.assertFalse(VP.es_ejecutable(self.base, n))

    def test_lo_que_no_es_script_no_se_pregunta(self):
        n = self._escribir("componente.tsx", '#!/no\nif __name__ == "__main__":\n')
        self.assertFalse(VP.es_ejecutable(self.base, n))

    def test_un_archivo_que_no_existe_no_revienta(self):
        self.assertFalse(VP.es_ejecutable(self.base, "no-existe.py"))


if __name__ == "__main__":
    unittest.main()
