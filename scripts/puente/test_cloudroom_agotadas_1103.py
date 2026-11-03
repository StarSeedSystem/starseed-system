"""1103 · T: Cloudroom recibe las elegibles y, detrás, las agotadas; lo que coge no vuelve a GitHub."""
import os
import sys
import tempfile
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import asignar_huecos  # noqa: E402
import buscar_capacidad as B  # noqa: E402
import repartir_nube as RN  # noqa: E402

AHORA = 1793690000.0


def _buscar(nube, coge):
    vistas = {}

    def cloudroom(aplicar, ids, ahora, *a, **k):
        vistas["cloudroom"] = list(ids)
        return (len(coge), "Cloudroom: %d lanzadas" % len(coge), list(coge))

    def plan(elegibles, agotadas, *a, **k):
        vistas["elegibles"] = list(elegibles or [])
        vistas["agotadas"] = list(agotadas or [])
        return {"lanzar": 0, "reabrir": [], "trabajadores": 3, "por_que": "nada"}

    carpeta = tempfile.mkdtemp()
    with mock.patch.object(B, "ESTADO", os.path.join(carpeta, "estado.json")), \
            mock.patch.object(B, "SALUD", os.path.join(carpeta, "salud.json")), \
            mock.patch.object(B, "reunir_nube", lambda *a, **k: nube), \
            mock.patch.object(B, "cloudroom", cloudroom), \
            mock.patch.object(B, "plan_nube", plan), \
            mock.patch.object(B, "claude_nube", lambda *a, **k: (0, "Claude en la nube: 0")), \
            mock.patch.object(B, "_avisar", lambda *a, **k: None), \
            mock.patch.object(RN, "leer_reaperturas", lambda *a, **k: {}), \
            mock.patch.object(asignar_huecos, "reunir", lambda: {"listas": [], "tope": 3}), \
            mock.patch.object(asignar_huecos, "decidir", lambda e: {"puede": False}):
        B.buscar(aplicar=True, sondear_medios=False, mac=False, origen="autocuracion", ahora=AHORA)
    return vistas


def test_cloudroom_recibe_elegibles_y_detras_las_agotadas():
    nube = {"clases": {"elegibles": ["A"], "agotada": ["X", "Y", "T"]}, "pausa": None, "runs": 0, "error": None,
            "mac": {}, "por_traer": ["T"]}
    vistas = _buscar(nube, [])
    assert vistas["cloudroom"][0] == "A"
    assert set(vistas["cloudroom"]) == {"A", "X", "Y"}  # «T» ya está integrada en su rama: se trae, no se escribe


def test_lo_que_coge_cloudroom_deja_de_ser_agotada_para_github():
    nube = {"clases": {"elegibles": ["A"], "agotada": ["X", "Y"]}, "pausa": None, "runs": 0, "error": None, "mac": {}}
    vistas = _buscar(nube, ["X"])
    assert vistas["elegibles"] == ["A"]
    assert "X" not in vistas["agotadas"] and "Y" in vistas["agotadas"]
