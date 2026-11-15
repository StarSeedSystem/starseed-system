# -*- coding: utf-8 -*-
"""La guardia de red en la puerta de unittest del puente (SUP1115A): el «conftest» de unittest.

La puerta del enjambre y la de la autopublicación corren
`python3 -m unittest discover -s scripts/puente -p 'test_*.py'`, y ahí nada ponía la guardia:
- unittest no carga `conftest.py` (es de pytest);
- con `-s` igual a la carpeta de arranque, discover no importa `scripts/puente/__init__.py`
  como paquete (solo lo importa una prueba que haga `from scripts.puente import …`);
- y `unittest/__main__.py` cambia `sys.argv[0]` a «python3 -m unittest», así que el gancho de
  REP1114C, que buscaba «unittest/__main__.py» en `sys.argv[0]`, no se encendía nunca.

discover importa TODOS los módulos de prueba antes de correr ninguna prueba, así que basta con
que uno ponga la guardia al importarse: este, que hace lo mismo que `conftest.py` hace para
pytest (guardia de red de sesión y STARSEED_PRUEBAS=1). Bajo pytest, `instalar_sesion()` es
idempotente y conftest ya la había puesto. La prueba está en `test_0_sonda_guardia_de_red.py`.
"""

import guardia_pruebas as _guardia_pruebas

_guardia_pruebas.instalar_sesion()
