# -*- coding: utf-8 -*-
"""Hook que importa la guardia de red automáticamente para pruebas.

Detecta corridas de pytest (`PYTEST_CURRENT_TEST`) o unittest (`unittest/__main__.py`)
en el proceso que importa `scripts.puente`. Si se detecta una corrida de pruebas,
instalar la guardia de sesión (a través de `guardia_pruebas.instalar_sesion()`), que
bloquea todas las conexiones de red salientes excepto localhost y file:// URLs.
En producción (lanzamiento normal), no se toca nada.

Sin el propósito de los archivos de conftest, se activa en toda corrida de unittest
(enfoque de defensa en profundidad) y se activa en toda corrida de pytest con el
gancho de conftest.
"""

import os
import sys

ES_PYTEST = "PYTEST_CURRENT_TEST" in os.environ
# SUP1115A: `python -m unittest` cambia sys.argv[0] a «python3 -m unittest» (unittest/__main__.py)
# antes de importar nada, así que mirar solo sys.argv[0] no lo detectaba nunca: se mira el
# módulo principal y, de respaldo, las dos formas de sys.argv[0].
_PRINCIPAL = (getattr(sys.modules.get("__main__"), "__file__", None) or "").replace(os.sep, "/")
ES_UNITYTEST = (_PRINCIPAL.endswith("unittest/__main__.py")
                or sys.argv[0].endswith("-m unittest")
                or "unittest/__main__.py" in sys.argv[0])

if ES_PYTEST or ES_UNITYTEST:
    from scripts.puente import guardia_pruebas as G
    G.instalar_sesion()
