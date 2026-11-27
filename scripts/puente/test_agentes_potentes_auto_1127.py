
import pytest
import os
import json
import time
from unittest.mock import MagicMock, patch


# Importamos la función objetivo
# Asumiendo que vamos a editar scripts/puente/buscar_capacidad.py para añadir auto_lanzar
from scripts.puente.buscar_capacidad import auto_lanzar


# (DIR1127G, 27-11) Antes fijaba STARSEED_ROOT a una ruta de la nube para TODO el proceso de pruebas (rompía
# reconstruir_mando y buscar_capacidad en la autopublicación) y escribía en el ~/.starseed REAL: dejó
# agentes-potentes.json en {"auto": true}. Ahora cada prueba usa un HOME temporal.
@pytest.fixture(autouse=True)
def _casa_temporal(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    os.makedirs(tmp_path / ".starseed" / "produccion", exist_ok=True)
    yield

def test_auto_lanzar_disabled():
    # Interruptor apagado
    config_path = os.path.join(os.path.expanduser("~"), ".starseed/produccion/agentes-potentes.json")
    os.makedirs(os.path.dirname(config_path), exist_ok=True)
    with open(config_path, "w") as f:
        json.dump({"auto": False}, f)
    
    sugerencias = [{"id": "s1", "prioridad": 95, "modelo": "gemini-4-neon-high"}]
    lanzados = auto_lanzar(sugerencias, cupos={}, ajustes={"N": 4}, ahora=time.time())
    assert lanzados == []

def test_auto_lanzar_top_diario_excedido():
    # Interruptor encendido
    config_path = os.path.join(os.path.expanduser("~"), ".starseed/produccion/agentes-potentes.json")
    with open(config_path, "w") as f:
        json.dump({"auto": True}, f)
    
    # Simular registros de lanzados
    lanzados_path = os.path.join(os.path.expanduser("~"), ".starseed/agentes-potentes-lanzados.jsonl")
    with open(lanzados_path, "w") as f:
        f.write('{"id": "a1", "time": ' + str(time.time()) + '}\n')
        f.write('{"id": "a2", "time": ' + str(time.time()) + '}\n')
        f.write('{"id": "a3", "time": ' + str(time.time()) + '}\n')
        f.write('{"id": "a4", "time": ' + str(time.time()) + '}\n')
    
    sugerencias = [{"id": "s5", "prioridad": 99, "modelo": "gemini-4-neon-high"}]
    lanzados = auto_lanzar(sugerencias, cupos={}, ajustes={"N": 4}, ahora=time.time())
    assert lanzados == []

def test_auto_lanzar_prioridad_baja():
    config_path = os.path.join(os.path.expanduser("~"), ".starseed/produccion/agentes-potentes.json")
    with open(config_path, "w") as f:
        json.dump({"auto": True}, f)
    
    sugerencias = [{"id": "s1", "prioridad": 80, "modelo": "gemini-4-neon-high"}]
    lanzados = auto_lanzar(sugerencias, cupos={}, ajustes={"N": 4}, ahora=time.time())
    assert lanzados == []

def test_auto_lanzar_coste_pago_rechazado():
    config_path = os.path.join(os.path.expanduser("~"), ".starseed/produccion/agentes-potentes.json")
    with open(config_path, "w") as f:
        json.dump({"auto": True}, f)
    
    sugerencias = [{"id": "s1", "prioridad": 95, "modelo": "claude-opus-5-5-high", "coste_estimado": "0.05$"}]
    lanzados = auto_lanzar(sugerencias, cupos={}, ajustes={"N": 4}, ahora=time.time())
    assert lanzados == []

def test_auto_lanzar_exito_sin_clave_api():
    config_path = os.path.join(os.path.expanduser("~"), ".starseed/produccion/agentes-potentes.json")
    with open(config_path, "w") as f:
        json.dump({"auto": True}, f)
    
    # Limpiar registros anteriores
    lanzados_path = os.path.join(os.path.expanduser("~"), ".starseed/agentes-potentes-lanzados.jsonl")
    with open(lanzados_path, "w") as f:
        f.write("")
    
    sugerencias = [{"id": "s1", "prioridad": 95, "modelo": "gemini-4-neon-high", "coste_estimado": "sin clave API", "cupo_hoy": 10}]
    lanzados = auto_lanzar(sugerencias, cupos={}, ajustes={"N": 4}, ahora=time.time())
    assert len(lanzados) == 1
    assert lanzados[0]["id"] == "s1"

def test_auto_lanzar_cupo_proveedor_cero():
    config_path = os.path.join(os.path.expanduser("~"), ".starseed/produccion/agentes-potentes.json")
    with open(config_path, "w") as f:
        json.dump({"auto": True}, f)
    
    # Limpiar registros
    lanzados_path = os.path.join(os.path.expanduser("~"), ".starseed/agentes-potentes-lanzados.jsonl")
    with open(lanzados_path, "w") as f:
        f.write("")
    
    sugerencias = [{"id": "s1", "prioridad": 95, "modelo": "gemini-4-neon-high", "cupo_hoy": 0}]
    lanzados = auto_lanzar(sugerencias, cupos={}, ajustes={"N": 4}, ahora=time.time())
    assert lanzados == []

def test_auto_lanzar_rechaza_archivos_protegidos():
    config_path = os.path.join(os.path.expanduser("~"), ".starseed/produccion/agentes-potentes.json")
    with open(config_path, "w") as f:
        json.dump({"auto": True}, f)
    
    lanzados_path = os.path.join(os.path.expanduser("~"), ".starseed/agentes-potentes-lanzados.jsonl")
    with open(lanzados_path, "w") as f:
        f.write("")
    
    # Simular archivo protegido
    sugerencias = [{"id": "s1", "prioridad": 95, "modelo": "gemini-4-neon-high", 
                    "archivos": ["src/app/api/cron/route.ts", "metagenesis.md"]}]
    lanzados = auto_lanzar(sugerencias, cupos={}, ajustes={"N": 4, "protegidos": ["src/app/api/cron/", "scripts/enjambre/"]}, ahora=time.time())
    assert lanzados == []
