# -*- coding: utf-8 -*-
"""Las MISMAS cadenas en el botón «Buscar más capacidad» y en el préstamo al A1 (CAPC1011Ccsc).

Con funciones y disco falsos se ejecutan `buscar_capacidad.reunir_nube` y `oracle_nodo._lanzar`
de verdad (sin red, sin git, sin A1): los dos llaman a `RN.cedibles_y_lote`, pasan su `lote`
como `mismo_lote` y el botón cuenta sueltas y cadenas igual que lo que viaja al A1."""
import json
import os
import shutil
import sys
import tempfile
import types
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import buscar_capacidad as B  # noqa: E402
import oracle_nodo as N  # noqa: E402
import repartir_nube as RN  # noqa: E402

AHORA = 1_790_000_000

# Tanda viva de la Mac (tope 1 × 2 rondas: se queda R1 y R2). S1 no la espera nadie (suelta);
# CA←CB y DA←DB←DC son dos cadenas que solo pueden viajar enteras.
COLAS = [("cola-auto-prueba", [
    {"id": "R1"}, {"id": "R2"}, {"id": "S1"},
    {"id": "CA"}, {"id": "CB", "depende": ["CA"]},
    {"id": "DA"}, {"id": "DB", "depende": ["DA"]}, {"id": "DC", "depende_de": "DB"},
])]
TANDA_IDS = [t["id"] for _n, ts in COLAS for t in ts]
ESTADO_MAC = {"listas": ["R1", "R2", "S1", "CA", "DA"], "tope": 1}


class _Proceso:
    stdout, returncode = "", 1  # ni `ps` ni `gh`: nada de procesos reales


class CadenasEnLosDosMedios(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="cadenas-medios-")
        self.progreso = os.path.join(self.dir, "progreso.json")
        with open(self.progreso, "w", encoding="utf-8") as f:
            json.dump({}, f)
        self.vistas = []  # (medio, cedibles, lote) de cada llamada a la función común
        self.real = RN.cedibles_y_lote
        self.parches = [
            mock.patch.object(RN, "cedibles_y_lote", self._espia),
            mock.patch.object(RN, "nube_pausada", lambda *a, **k: False),
            mock.patch.object(RN, "envios_vigentes", lambda *a, **k: {}),
            mock.patch.object(RN, "colas_de_la_tanda_viva", lambda *a, **k: [("cola-auto-prueba", TANDA_IDS)]),
            mock.patch.object(RN, "leer_prestadas", lambda *a, **k: set()),
            mock.patch.object(RN, "leer_colas_nube", lambda *a, **k: []),
            mock.patch.object(RN, "en_vuelo", lambda *a, **k: set()),
            mock.patch("subprocess.run", lambda *a, **k: _Proceso()),
            mock.patch.dict(sys.modules, {
                "asignar_huecos": types.SimpleNamespace(reunir=lambda: dict(ESTADO_MAC)),
                "cambio_pedido": types.SimpleNamespace(aplicar_a_todas=lambda t, p: t)}),
        ]
        for p in self.parches:
            p.start()
        self.medio = None

    def tearDown(self):
        for p in reversed(self.parches):
            p.stop()
        shutil.rmtree(self.dir, ignore_errors=True)

    def _espia(self, *a, **k):
        cedibles, lote = self.real(*a, **k)
        self.vistas.append((self.medio, list(cedibles), set(lote)))
        return cedibles, lote

    def _boton(self):
        ran = types.SimpleNamespace(
            colas_fuente=lambda: COLAS, PROGRESO=self.progreso, RAIZ=self.dir, DESTINO_DIR=self.dir,
            OLAS=self.dir, asuntos_main=lambda raiz: set(), aplicar_a_todas=lambda t, p: t,
            ola_actual=lambda colas: None)
        clasificar = mock.Mock(return_value={"elegibles": []})
        self.medio = "botón"
        with mock.patch.object(B, "_repartidor", lambda: ran), \
                mock.patch.object(B, "dependientes_y_capacidad", lambda colas: ({}, {})), \
                mock.patch.object(B, "por_traer_de_la_nube", lambda asuntos: []), \
                mock.patch.object(RN, "clasificar", clasificar):
            salida = B.reunir_nube(AHORA, estado_mac=dict(ESTADO_MAC))
        self.assertIsNone(salida["error"])
        return salida, clasificar

    def _prestamo_a1(self, devuelve):
        rep = types.SimpleNamespace(validar_raiz=lambda raiz: None, colas_fuente=lambda: COLAS,
                                    asuntos_main=lambda raiz: set(), ola_actual=lambda colas: None)
        por_id = {t["id"]: t for _n, ts in COLAS for t in ts}
        elegir = mock.Mock(return_value=[dict(por_id[i]) for i in devuelve])
        self.medio = "A1"
        with mock.patch.object(N, "_repartir", lambda: rep), mock.patch.object(N, "PROGRESO", self.progreso), \
                mock.patch.object(RN, "elegir", elegir):
            r = N._lanzar(tope=20, simular=True)
        return r, elegir

    def test_el_boton_usa_la_funcion_comun_y_cuenta_las_cadenas(self):
        salida, clasificar = self._boton()
        self.assertEqual([v[0] for v in self.vistas], ["botón"])
        _medio, cedibles, lote = self.vistas[0]
        self.assertEqual(cedibles, ["S1", "CA", "CB", "DA", "DB", "DC"])
        self.assertEqual(lote, {"CA", "CB", "DA", "DB", "DC"})
        self.assertEqual(clasificar.call_args.kwargs["mismo_lote"], lote)
        mac = salida["mac"]
        self.assertEqual((mac["cedibles"], mac["en_cadenas"], mac["cadenas"], mac["se_queda"]), (cedibles, 5, 2, 2))
        texto = B.texto_nube(salida["clases"], {"por_que": ""}, 0, mac=mac)
        self.assertIn("se queda 2 para sus próximas rondas y cede 6: 1 suelta(s) y 2 cadenas enteras (5 tareas)",
                      texto)

    def test_el_prestamo_al_a1_usa_la_funcion_comun_y_no_parte_cadenas(self):
        # `elegir` (falso) se deja fuera DC por el tope: la cadena DA←DB←DC no viaja a medias.
        r, elegir = self._prestamo_a1(["S1", "CA", "CB", "DA", "DB"])
        self.assertEqual([v[0] for v in self.vistas], ["A1"])
        self.assertEqual(elegir.call_args.kwargs["mismo_lote"], self.vistas[0][2])
        self.assertTrue(r["ok"] and r["simulado"])
        self.assertEqual(r["ids"], ["S1", "CA", "CB"])

    def test_boton_y_a1_ven_las_mismas_cadenas(self):
        salida, _c = self._boton()
        _r, elegir = self._prestamo_a1([])
        (_b, ced_boton, lote_boton), (_a, ced_a1, lote_a1) = self.vistas
        self.assertEqual((ced_boton, lote_boton), (ced_a1, lote_a1))
        lote_que_viaja = elegir.call_args.kwargs["mismo_lote"]
        self.assertEqual(salida["mac"]["en_cadenas"], len(lote_que_viaja))
        self.assertEqual(salida["mac"]["cadenas"], B.cadenas_del_lote(lote_que_viaja, COLAS))


class CuentaDeCadenas(unittest.TestCase):
    def test_componentes_por_depende(self):
        self.assertEqual(B.cadenas_del_lote(set(), COLAS), 0)
        self.assertEqual(B.cadenas_del_lote({"CA", "CB"}, COLAS), 1)
        self.assertEqual(B.cadenas_del_lote({"CA", "CB", "DA", "DB", "DC"}, COLAS), 2)
        # sin el eslabón del medio (prestado a otro medio) quedan dos trozos, como en sin_cadenas_partidas
        self.assertEqual(B.cadenas_del_lote({"DA", "DC"}, COLAS), 2)

    def test_frase_sin_cadenas_y_mac_antiguo(self):
        self.assertEqual(B._frase_cesion({"cedibles": ["A"]}), "cede 1 que nadie espera")
        self.assertEqual(B._frase_cesion({"cedibles": ["A", "B"], "en_cadenas": 2}),
                         "cede 2 (2 en cadenas que viajan enteras)")
        self.assertEqual(B._frase_cesion({"cedibles": ["A", "B"], "en_cadenas": 2, "cadenas": 1}),
                         "cede 2: 0 suelta(s) y 1 cadena entera (2 tareas)")


if __name__ == "__main__":
    unittest.main()
