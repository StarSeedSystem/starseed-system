"""1103 · Z: el carril de Claude en la nube no lanza sueños de análisis."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import alta_capacidad_nube_logica as L  # noqa: E402


def test_los_suenos_no_son_candidatas():
    colas = [("cola-x.json", [
        {"id": "SA10241", "tipo": "analisis", "titulo": "Sueño · Rito", "archivos": ["a", "b", "c", "d"]},
        {"id": "COD1", "titulo": "Código", "archivos": ["x.ts"]},
    ])]
    ids = [t["id"] for t, _ in L.candidatas(colas, {}, {"sesiones": []})]
    assert ids == ["COD1"]
