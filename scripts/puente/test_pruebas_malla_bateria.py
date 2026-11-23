#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PRU1123A · Pruebas para bateria-1118.json.

Valida que la estructura de la batería cumple el esquema esperado por
pruebas_malla.py (bloques B1..B5, patrones debe y no_debe, sin credenciales
ni IPs reales).
"""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pruebas_malla as PM

BATERIA_PATH = Path(__file__).resolve().parents[2] / "starseed_memory_root" / "pruebas" / "bateria-1118.json"


class TestEsquemaBateria:
    """Validación del esquema de bateria-1118.json."""

    def cargar_bateria(self):
        with open(BATERIA_PATH, "r", encoding="utf-8") as f:
            return json.load(f)

    def test_fichier_existe(self):
        assert BATERIA_PATH.exists(), f"Archivo bateria-1118.json no existe en {BATERIA_PATH}"

    def test_json_valido(self):
        bateria = self.cargar_bateria()
        assert isinstance(bateria, dict), "La batería debe ser un diccionario"

    def test_tiene_campo_bateria(self):
        bateria = self.cargar_bateria()
        assert "bateria" in bateria, "La batería debe tener campo 'bateria'"
        assert bateria["bateria"] == "1118", "El campo 'bateria' debe ser '1118'"

    def test_tiene_lista_pruebas(self):
        bateria = self.cargar_bateria()
        assert "pruebas" in bateria, "La batería debe tener campo 'pruebas'"
        assert isinstance(bateria["pruebas"], list), "'pruebas' debe ser una lista"

    def test_cada_prueba_tiene_id_unico(self):
        bateria = self.cargar_bateria()
        ids = [p.get("id") for p in bateria["pruebas"]]
        assert len(ids) == len(set(ids)), "Todos los IDs deben ser únicos"

    def test_ids_siguen_patron_bloque(self):
        bateria = self.cargar_bateria()
        for prueba in bateria["pruebas"]:
            id_ = prueba.get("id", "")
            assert id_.startswith("B"), f"ID {id_} debe comenzar con 'B' (bloque)"
            partes = id_.split("-")
            assert len(partes) == 3 or len(partes) == 4, f"ID {id_} debe tener formato B<N>-MT-A<N>"

    def test_bloques_b1_a_b5(self):
        bateria = self.cargar_bateria()
        bloques = set()
        for prueba in bateria["pruebas"]:
            id_ = prueba.get("id", "")
            if "-" in id_:
                bloque = id_.split("-")[0]
                bloques.add(bloque)
        for bloque in bloques:
            assert bloque.startswith("B"), f"Bloque {bloque} debe empezar con 'B'"

    def test_pruebas_tienen_campo_obligatorio(self):
        bateria = self.cargar_bateria()
        campos_obligatorios = ["id", "titulo", "bloque", "ronda", "aparatos", "antena", "pasos", "criterios"]
        for prueba in bateria["pruebas"]:
            for campo in campos_obligatorios:
                assert campo in prueba, f"Prueba {prueba.get('id', '?')} carece del campo '{campo}'"

    def test_criterios_tienen_debe_y_no_debe(self):
        bateria = self.cargar_bateria()
        for prueba in bateria["pruebas"]:
            criterios = prueba.get("criterios", {})
            assert isinstance(criterios, dict), f"Criterios de {prueba['id']} debe ser dict"
            for aparato, pat in criterios.items():
                assert "debe" in pat, f"Criterios para {aparato} en {prueba['id']} necesita 'debe'"
                assert "no_debe" in pat, f"Criterios para {aparato} en {prueba['id']} necesita 'no_debe'"
                assert isinstance(pat["debe"], list), f"'debe' debe ser lista en {aparato}"
                assert isinstance(pat["no_debe"], list), f"'no_debe' debe ser lista en {aparato}"

    def test_no_tiene_credenciales(self):
        bateria = self.cargar_bateria()
        texto = json.dumps(bateria)
        palabras_clave = ["password", "clave", "token", "api_key", "secret", "credential"]
        for palabra in palabras_clave:
            assert palabra.lower() not in texto.lower(), f"La batería no debe contener {palabra}"

    def test_no_tiene_ips_reales(self):
        bateria = self.cargar_bateria()
        texto = json.dumps(bateria)
        import re
        ip_pattern = r"\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b"
        ips = re.findall(ip_pattern, texto)
        assert len(ips) == 0, f"La batería no debe contener IPs reales: {ips}"

    def test_carga_sin_error(self):
        bateria = self.cargar_bateria()
        pruebas = PM.filtrar_bateria(bateria)
        assert len(pruebas) == 5, "Debe haber 5 pruebas en la batería"

    def test_filtrado_por_bloque(self):
        bateria = self.cargar_bateria()
        b1 = PM.filtrar_bateria(bateria, bloque="B1")
        ids_b1 = [p["id"] for p in b1]
        assert all(id_.startswith("B1-") for id_ in ids_b1), "Bloque B1 solo debe contener IDs B1-*"

    def test_filtrado_por_ronda(self):
        bateria = self.cargar_bateria()
        r2 = PM.filtrar_bateria(bateria, ronda=2)
        ids_r2 = [p["id"] for p in r2]
        assert all(p.get("ronda") == 2 for p in r2), "Ronda 2 solo debe contener pruebas de ronda 2"