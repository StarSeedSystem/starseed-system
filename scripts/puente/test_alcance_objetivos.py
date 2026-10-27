import os
import sys
import tempfile
import shutil
from datetime import datetime, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
from alcance_objetivos import AlcanceObjetivos

def test_permisos():
    tmp = tempfile.mkdtemp()
    try:
        ao = AlcanceObjetivos(tmp)
        store_dir = os.path.join(tmp, ".starseed", "alcance")
        objetivos_file = os.path.join(store_dir, "objetivos.json")
        supresion_file = os.path.join(store_dir, "supresion.json")
        
        assert oct(os.stat(store_dir).st_mode)[-3:] == "700"
        assert oct(os.stat(objetivos_file).st_mode)[-3:] == "600"
        assert oct(os.stat(supresion_file).st_mode)[-3:] == "600"
    finally:
        shutil.rmtree(tmp)

def test_validar_prohibidos():
    tmp = tempfile.mkdtemp()
    try:
        ao = AlcanceObjetivos(tmp)
        obj_invalid = {
            "nombre_publico": "Test salud",
            "canal_contacto": {"medio": "email", "valor": "test@example.com", "fuente_url": "https://site.com"}
        }
        try:
            ao.validar_objetivo(obj_invalid)
            assert False, "Should have raised ValueError for prohibited topic"
        except ValueError as e:
            assert "prohibida" in str(e).lower()
    finally:
        shutil.rmtree(tmp)

def test_nivel_por_defecto():
    tmp = tempfile.mkdtemp()
    try:
        ao = AlcanceObjetivos(tmp)
        obj = {"nombre_publico": "Test"}
        ao.validar_objetivo(obj)
        assert obj.get("nivel") == "alto"
    finally:
        shutil.rmtree(tmp)

def test_supresion_hash():
    tmp = tempfile.mkdtemp()
    try:
        ao = AlcanceObjetivos(tmp)
        ao.suprimir("test@example.com")
        import json
        with open(os.path.join(tmp, ".starseed", "alcance", "supresion.json")) as f:
            data = json.load(f)
            assert len(data) == 1
            import hashlib
            expected = hashlib.sha256("test@example.com".encode()).hexdigest()
            assert data[0] == expected
    finally:
        shutil.rmtree(tmp)

def test_puede_contactar():
    tmp = tempfile.mkdtemp()
    try:
        ao = AlcanceObjetivos(tmp)
        obj = {
            "id": "obj-1",
            "nivel": "medio",
            "canal_contacto": {"medio": "email", "valor": "test@example.com", "fuente_url": "https://site.com"},
            "estado": "activo"
        }
        registro = {"contactos": []}
        ahora = datetime.now()
        assert ao.puede_contactar(obj, registro, ahora) == True
        
        # High profile
        obj["nivel"] = "alto"
        assert ao.puede_contactar(obj, registro, ahora) == False
    finally:
        shutil.rmtree(tmp)

if __name__ == "__main__":
    test_permisos()
    test_validar_prohibidos()
    test_nivel_por_defecto()
    test_supresion_hash()
    test_puede_contactar()
    print("Todos los tests pasaron")
