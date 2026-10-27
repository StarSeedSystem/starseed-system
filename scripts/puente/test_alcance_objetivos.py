"""Tests para alcance_objetivos."""
import os
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

from scripts.puente import alcance_objetivos


def test_validar_objetivo_rechaza_campos_prohibidos():
    home = Path(tempfile.mkdtemp())
    obj = alcance_objetivos.crear_objetivo_ejemplo()
    obj["salud"] = "algo"
    res = alcance_objetivos.validar_objetivo(obj)
    assert res["ok"] is False


def test_validar_objetivo_rechaza_texto_prohibido():
    obj = alcance_objetivos.crear_objetivo_ejemplo()
    obj["nombre_publico"] = "Persona con problemas de salud"
    res = alcance_objetivos.validar_objetivo(obj)
    assert res["ok"] is False


def test_validar_objetivo_rechaza_direccion_sin_fuente_url():
    obj = alcance_objetivos.crear_objetivo_ejemplo()
    obj["canal_contacto"] = {"medio": "correo", "valor": "Calle Falsa 123"}
    res = alcance_objetivos.validar_objetivo(obj)
    assert res["ok"] is False


def test_validar_objetivo_acepta_canal_con_fuente_url():
    obj = alcance_objetivos.crear_objetivo_ejemplo()
    res = alcance_objetivos.validar_objetivo(obj)
    assert res["ok"] is True


def test_suprimir_guarda_solo_hash():
    home = Path(tempfile.mkdtemp())
    r = alcance_objetivos.suprimir("test@example.com", home=home)
    assert r["ok"] is True
    assert len(r["hash"]) == 64
    # leer archivo
    ruta = home / ".starseed" / "alcance" / "suprimir.json"
    import json

    data = json.loads(ruta.read_text())
    assert "hashes" in data
    assert data["hashes"][0] == r["hash"]
    # no guarda el correo en claro
    assert "test@example.com" not in ruta.read_text()


def test_suprimir_con_dominio_y_nombre():
    home = Path(tempfile.mkdtemp())
    r = alcance_objetivos.suprimir({"dominio": "ejemplo.org", "nombre": "Juan"}, home=home)
    assert r["ok"] is True
    assert len(r["hash"]) == 64


def test_objetivo_sin_nivel_es_alto():
    obj = alcance_objetivos.crear_objetivo_ejemplo()
    obj.pop("nivel")
    res = alcance_objetivos.validar_objetivo(obj)
    assert res["ok"] is True
    assert obj["nivel"] == "alto"


def test_permisos_carpeta_y_archivo():
    home = Path(tempfile.mkdtemp())
    alcance_objetivos.asegurar_almacen(home)
    base = home / ".starseed" / "alcance"
    assert base.exists()
    modo_carpeta = oct(base.stat().st_mode)[-3:]
    assert modo_carpeta == "700"
    alcance_objetivos.suprimir("x@y.com", home=home)
    ruta_sup = base / "suprimir.json"
    assert ruta_sup.exists()
    modo_archivo = oct(ruta_sup.stat().st_mode)[-3:]
    assert modo_archivo == "600"


def test_puede_contactar_suprimido():
    home = Path(tempfile.mkdtemp())
    obj = alcance_objetivos.crear_objetivo_ejemplo(nivel="medio")
    alcance_objetivos.suprimir(obj["canal_contacto"]["valor"], home=home)
    res = alcance_objetivos.puede_contactar(obj, home=home)
    assert res["puede"] is False


def test_puede_contactar_alto_perfil_nunca_automatico():
    home = Path(tempfile.mkdtemp())
    obj = alcance_objetivos.crear_objetivo_ejemplo(nivel="alto")
    res = alcance_objetivos.puede_contactar(obj, home=home)
    assert res["puede"] is False
    assert res["razon"] == "alto_perfil_nunca_automatico"


def test_puede_contactar_tope_diario():
    home = Path(tempfile.mkdtemp())
    obj = alcance_objetivos.crear_objetivo_ejemplo(nivel="medio")
    ahora = datetime.now()
    registro = {"envios": [{"timestamp": ahora.timestamp()} for _ in range(5)]}
    res = alcance_objetivos.puede_contactar(obj, registro=registro, ahora=ahora, home=home)
    assert res["puede"] is False


def test_puede_contactar_pausa_rechazo_alex():
    home = Path(tempfile.mkdtemp())
    obj = alcance_objetivos.crear_objetivo_ejemplo(nivel="medio")
    ahora = datetime.now()
    registro = {
        "contactos": {
            obj["id"]: [
                {"tipo": "rechazo_alex", "timestamp": (ahora - timedelta(days=10)).timestamp()}
            ]
        }
    }
    res = alcance_objetivos.puede_contactar(obj, registro=registro, ahora=ahora, home=home)
    assert res["puede"] is False


def test_puede_contactar_pausa_no_destinatario():
    home = Path(tempfile.mkdtemp())
    obj = alcance_objetivos.crear_objetivo_ejemplo(nivel="medio")
    ahora = datetime.now()
    registro = {
        "contactos": {
            obj["id"]: [
                {"tipo": "no_destinatario", "timestamp": (ahora - timedelta(days=10)).timestamp()}
            ]
        }
    }
    res = alcance_objetivos.puede_contactar(obj, registro=registro, ahora=ahora, home=home)
    assert res["puede"] is False


def test_puede_contactar_permite_medio_con_tope_libre():
    home = Path(tempfile.mkdtemp())
    obj = alcance_objetivos.crear_objetivo_ejemplo(nivel="medio")
    registro = {"envios": [], "contactos": {}}
    res = alcance_objetivos.puede_contactar(obj, registro=registro, home=home)
    assert res["puede"] is True
