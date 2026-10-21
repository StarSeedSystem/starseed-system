# Prueba de traslado n8n -> motor propio
# Verifica que los 3 eventos del flujo exportado 2026-10-11 coincidan.

import json
from pathlib import Path

EXPORT_PATH = Path("memory/aprendizaje-externos/n8n-export/2026-10-11/starseed-producci-n-puentes.json")

def test_carga_exportacion():
    data = json.loads(EXPORT_PATH.read_text())
    assert "nodes" in data
    assert len(data["nodes"]) >= 3
    # 3 webhooks esperados
    webhooks = [n for n in data["nodes"] if n["type"] == "n8n-nodes-base.webhook"]
    assert len(webhooks) == 3

def test_estructura_set():
    data = json.loads(EXPORT_PATH.read_text())
    sets = [n for n in data["nodes"] if n["type"] == "n8n-nodes-base.set"]
    assert len(sets) == 3
    for s in sets:
        assignments = s["parameters"]["assignments"]["assignments"]
        # Cada Set debe tener evento, sha, medios, tareas, momento, datos
        nombres = {a["name"] for a in assignments}
        assert "evento" in nombres
        assert "sha" in nombres
        assert "medios" in nombres
        assert "tareas" in nombres
        assert "momento" in nombres
        assert "datos" in nombres

if __name__ == "__main__":
    test_carga_exportacion()
    test_estructura_set()
    print("test_traslado_n8n: OK")