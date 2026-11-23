#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PRU1123A · Validación del esquema de bateria-1118.json contra pruebas_malla.py.

Valida que la batería tenga la estructura exacta que espera el conductor:
bloques B1..B5, campos requeridos, aparatos/antenas válidos,
patrones `debe`/`no_debe` en criterios por aparato.
"""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pruebas_malla as PM  # noqa: E402


RAIZ_REPO = Path(__file__).resolve().parents[2]
BATERIA_JSON = RAIZ_REPO / "starseed_memory_root" / "pruebas" / "bateria-1118.json"

APARATOS_VALIDOS = {"mac", "maggabox", "tableta"}
ANTENAS_VALIDAS = {"ble", "wifi", "malla"}
BLOQUES_ESPERADOS = {"B1", "B2", "B3", "B4", "B5"}
CAMPOS_REQUERIDOS = {"id", "titulo", "aparatos", "antena", "ronda", "pasos", "criterios"}


def test_bateria_existe_y_es_json_valido():
    """El archivo existe y es JSON válido."""
    assert BATERIA_JSON.exists(), f"No existe {BATERIA_JSON}"
    with BATERIA_JSON.open("r", encoding="utf-8") as f:
        data = json.load(f)
    assert isinstance(data, dict), "La raíz debe ser un objeto"
    assert "pruebas" in data, "Falta clave 'pruebas'"
    assert isinstance(data["pruebas"], list), "'pruebas' debe ser una lista"


def test_cargar_bateria_funciona_con_archivo_real():
    """cargar_bateria() lee el archivo sin error."""
    bateria = PM.cargar_bateria()
    assert isinstance(bateria, dict)
    assert "pruebas" in bateria
    assert len(bateria["pruebas"]) > 0


def test_todas_las_pruebas_tienen_campos_requeridos():
    """Cada prueba tiene todos los campos obligatorios."""
    bateria = PM.cargar_bateria()
    for p in bateria["pruebas"]:
        faltantes = CAMPOS_REQUERIDOS - set(p.keys())
        assert not faltantes, f"Prueba {p.get('id', '?')}: faltan campos {faltantes}"


def test_ids_unicos_y_con_prefijo_bloque():
    """Los IDs son únicos y empiezan por B1..B5."""
    bateria = PM.cargar_bateria()
    ids = [p["id"] for p in bateria["pruebas"]]
    assert len(ids) == len(set(ids)), "Hay IDs duplicados"
    for pid in ids:
        bloque = pid.split("-")[0]
        assert bloque in BLOQUES_ESPERADOS, f"ID {pid}: bloque {bloque} no está en B1..B5"


def test_aparatos_validos():
    """Cada prueba usa solo aparatos conocidos."""
    bateria = PM.cargar_bateria()
    for p in bateria["pruebas"]:
        for a in p["aparatos"]:
            assert a in APARATOS_VALIDOS, f"Prueba {p['id']}: aparato '{a}' no válido"


def test_antena_valida():
    """Cada prueba usa una antena conocida."""
    bateria = PM.cargar_bateria()
    for p in bateria["pruebas"]:
        assert p["antena"] in ANTENAS_VALIDAS, f"Prueba {p['id']}: antena '{p['antena']}' no válida"


def test_ronda_es_entero_positivo():
    """La ronda es un entero >= 1."""
    bateria = PM.cargar_bateria()
    for p in bateria["pruebas"]:
        assert isinstance(p["ronda"], int), f"Prueba {p['id']}: ronda no es int"
        assert p["ronda"] >= 1, f"Prueba {p['id']}: ronda < 1"


def test_pasos_es_lista_no_vacia():
    """Los pasos son una lista de strings no vacía."""
    bateria = PM.cargar_bateria()
    for p in bateria["pruebas"]:
        assert isinstance(p["pasos"], list), f"Prueba {p['id']}: pasos no es lista"
        assert len(p["pasos"]) > 0, f"Prueba {p['id']}: pasos vacío"
        for paso in p["pasos"]:
            assert isinstance(paso, str) and paso.strip(), f"Prueba {p['id']}: paso vacío"


def test_criterios_por_aparato_con_debe_y_no_debe():
    """Cada prueba tiene criterios por aparato con listas debe/no_debe."""
    bateria = PM.cargar_bateria()
    for p in bateria["pruebas"]:
        criterios = p["criterios"]
        assert isinstance(criterios, dict), f"Prueba {p['id']}: criterios no es dict"
        # Cada aparato de la prueba debe tener criterios
        for a in p["aparatos"]:
            assert a in criterios, f"Prueba {p['id']}: falta criterios para aparato '{a}'"
            crit = criterios[a]
            assert "debe" in crit, f"Prueba {p['id']}/{a}: falta 'debe'"
            assert "no_debe" in crit, f"Prueba {p['id']}/{a}: falta 'no_debe'"
            assert isinstance(crit["debe"], list), f"Prueba {p['id']}/{a}: 'debe' no es lista"
            assert isinstance(crit["no_debe"], list), f"Prueba {p['id']}/{a}: 'no_debe' no es lista"
            for pat in crit["debe"] + crit["no_debe"]:
                assert isinstance(pat, str) and pat.strip(), f"Prueba {p['id']}/{a}: patrón vacío"


def test_filtrar_bateria_funciona_con_bloques_y_rondas():
    """filtrar_bateria() funciona con los datos reales."""
    bateria = PM.cargar_bateria()
    # Sin filtros
    todas = PM.filtrar_bateria(bateria)
    assert len(todas) == len(bateria["pruebas"])
    # Por bloque
    for bloque in BLOQUES_ESPERADOS:
        filtradas = PM.filtrar_bateria(bateria, bloque=bloque)
        for p in filtradas:
            assert p["id"].startswith(f"{bloque}-")
    # Por ronda
    rondas = {p["ronda"] for p in bateria["pruebas"]}
    for r in rondas:
        filtradas = PM.filtrar_bateria(bateria, ronda=r)
        for p in filtradas:
            assert p["ronda"] == r
    # Bloque + ronda
    for bloque in BLOQUES_ESPERADOS:
        for r in rondas:
            filtradas = PM.filtrar_bateria(bateria, bloque=bloque, ronda=r)
            for p in filtradas:
                assert p["id"].startswith(f"{bloque}-")
                assert p["ronda"] == r


def test_evaluar_patrones_funciona_con_criterios_reales():
    """evaluar_patrones() no falla con criterios de la batería."""
    bateria = PM.cargar_bateria()
    for p in bateria["pruebas"]:
        for aparato, crit in p["criterios"].items():
            # Test con líneas vacías (solo que no lance excepción)
            res = PM.evaluar_patrones([], crit)
            assert "ok" in res
            assert "debe_cumplidos" in res
            assert "debe_faltantes" in res
            assert "no_debe_cumplidos" in res
            assert "no_debe_violados" in res
            assert "evidencias" in res


def test_no_hay_credenciales_ni_ips_reales():
    """La batería no contiene claves, tokens ni IPs reales."""
    bateria = PM.cargar_bateria()
    contenido = json.dumps(bateria, ensure_ascii=False)
    # Patrones que no deberían aparecer
    prohibidos = [
        "192.168.", "10.0.", "172.16.",  # IPs privadas comunes
        "ssh-rsa", "ssh-ed25519", "PRIVATE KEY",  # Claves SSH
        "password", "secret", "token", "api_key",  # Credenciales genéricas
        "maggasukha@", "starseed-nodo",  # Hosts reales
    ]
    for pat in prohibidos:
        assert pat.lower() not in contenido.lower(), f"Contenido prohibido detectado: {pat}"


def test_version_y_descripcion_presentes():
    """La batería tiene metadatos version y descripcion."""
    bateria = PM.cargar_bateria()
    assert "version" in bateria, "Falta 'version'"
    assert "descripcion" in bateria, "Falta 'descripcion'"
    assert str(bateria["version"]) == "1118", f"Versión inesperada: {bateria['version']}"


if __name__ == "__main__":
    import pytest
    sys.exit(pytest.main([__file__, "-v"]))