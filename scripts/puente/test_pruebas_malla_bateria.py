
import json
import pytest
from pathlib import Path
import sys

# Asegurar que podemos importar el módulo de pruebas_malla
sys.path.insert(0, str(Path(__file__).resolve().parent))
import pruebas_malla as PM

def test_bateria_esquema():
    bateria_path = Path(__file__).resolve().parents[2] / "starseed_memory_root" / "pruebas" / "bateria-1118.json"
    assert bateria_path.exists(), "bateria-1118.json no existe"
    
    with open(bateria_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    assert "pruebas" in data, "La batería no tiene campo 'pruebas'"
    assert isinstance(data["pruebas"], list), "Las pruebas deben ser una lista"
    
    # Validar campos mínimos de las pruebas
    for p in data["pruebas"]:
        assert "id" in p, f"Prueba sin id: {p}"
        assert "titulo" in p, f"Prueba sin titulo: {p['id']}"
        assert "aparatos" in p, f"Prueba sin aparatos: {p['id']}"
        assert "antena" in p, f"Prueba sin antena: {p['id']}"
        assert "criterios" in p, f"Prueba sin criterios: {p['id']}"
        
        # Validar criterios
        for aparato in p["aparatos"]:
            assert aparato in p["criterios"], f"Prueba {p['id']} no tiene criterios para {aparato}"
            c = p["criterios"][aparato]
            assert "debe" in c or "no_debe" in c, f"Criterios de {p['id']} para {aparato} deben tener debe/no_debe"
