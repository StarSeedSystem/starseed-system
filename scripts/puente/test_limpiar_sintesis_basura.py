#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de limpiar_sintesis_basura con un falso de Drive (SIN1114D · §4.4).

Nada de red: listar, leer_texto, asegurar_subcarpeta y mover van inyectados.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import limpiar_sintesis_basura as L  # noqa: E402

TITULO = L.TITULO_BASURA


class FalsoDrive:
    """Falso de Drive: Docs en memoria y registro de movimientos y creaciones."""

    def __init__(self, docs, carpeta=None):
        self.docs = docs
        self.carpeta = carpeta  # None = la subcarpeta NO existe todavía
        self.movidos = []
        self.creadas = 0

    def listar(self):
        return [dict(d) for d in self.docs]

    def leer_texto(self, fid):
        for d in self.docs:
            if d["id"] == fid:
                return d.get("texto", "")
        return ""

    def asegurar_subcarpeta(self):
        if self.carpeta is None:
            self.creadas += 1
            self.carpeta = {"id": "sub-nueva-%d" % self.creadas}
        return self.carpeta["id"]

    def mover(self, fid, destino):
        self.movidos.append((fid, destino))


def doc(id, creado, texto, nombre=TITULO):
    """Doc del falso Drive: createdTime ISO y texto exportado."""
    return {"id": id, "name": nombre, "createdTime": creado + "T00:00:00.000Z", "texto": texto}


def correr(falso, aplicar):
    return L.limpiar(falso.listar, falso.leer_texto, falso.asegurar_subcarpeta, falso.mover,
                     avisar=falso.aviso, aplicar=aplicar)


# ── aquí van las pruebas ─────────────────────────────────────────────────────

BASURA = doc("b1", "2026-11-14", "corto")
INTACTO = doc("g1", "2026-11-10", "x" * 4500)
NOMBRE_OTRO = doc("o1", "2026-11-14", "corto", nombre="Síntesis diaria 2026-11-14")
GRANDE_RECIENTE = doc("g2", "2026-11-14", "y" * 4000)


def test_es_basura_aplica_los_tres_criterios():
    assert L.es_basura(BASURA["name"], BASURA["createdTime"], BASURA["texto"])
    # Otro título no es basura
    assert not L.es_basura(NOMBRE_OTRO["name"], NOMBRE_OTRO["createdTime"], "corto")
    # Creado el límite o antes no se toca
    assert not L.es_basura(TITULO, "2026-11-12T10:00:00.000Z", "corto")
    assert not L.es_basura(TITULO, "2026-11-11T10:00:00.000Z", "corto")
    # Con 2000 o más caracteres ya no es basura
    assert not L.es_basura(TITULO, "2026-11-14T10:00:00.000Z", "z" * 2000)
    # Un Doc vacío con ese nombre ES basura (son exactamente los de las pruebas)
    assert L.es_basura(TITULO, "2026-11-14T10:00:00.000Z", "")


def test_seco_no_mueve_nada_y_lo_informa():
    falso = FalsoDrive([BASURA, INTACTO, NOMBRE_OTRO])
    aviso = []
    r = L.limpiar(falso.listar, falso.leer_texto, falso.asegurar_subcarpeta, falso.mover,
                  avisar=aviso.append, aplicar=False)
    assert falso.movidos == []
    assert r["basura"] == 1 and r["movidos"] == 0 and r["intactos"] == 1
    assert r["ids"] == ["b1"] and r["aplicar"] is False
    assert aviso == []  # en seco no avisa al Mando


def test_aplicar_mueve_solo_los_basura_y_avisa_al_mando():
    falso = FalsoDrive([BASURA, INTACTO, NOMBRE_OTRO, GRANDE_RECIENTE])
    aviso = []
    r = L.limpiar(falso.listar, falso.leer_texto, falso.asegurar_subcarpeta, falso.mover,
                  avisar=aviso.append, aplicar=True)
    assert falso.movidos == [("b1", "sub-nueva-1")]
    assert r["basura"] == 1 and r["movidos"] == 1 and r["intactos"] == 2
    assert len(aviso) == 1
    assert "1" in aviso[0] and "no se borró" in aviso[0] and "Maggasukha" in aviso[0]


def test_doc_de_4000_caracteres_nunca_se_toca_aun_llamandose_igual():
    falso = FalsoDrive([GRANDE_RECIENTE])
    r = L.limpiar(falso.listar, falso.leer_texto, falso.asegurar_subcarpeta, falso.mover,
                  avisar=None, aplicar=True)
    assert falso.movidos == []
    assert r["basura"] == 0 and r["intactos"] == 1


# ── adaptadores reales de Drive: forma de la llamada, sin red ───────────────

class RespuestaFalsa:
    def __init__(self, datos: bytes):
        self._datos = datos

    def read(self):
        return self._datos

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def test_adaptadores_construyen_las_llamadas_de_drive(monkeypatch):
    llamadas = []

    def falso_urlopen(peticion, timeout=60):
        llamadas.append((peticion.full_url, peticion.get_method(), bytes(peticion.data or b"")))
        texto = peticion.full_url
        if "/export?" in texto:
            return RespuestaFalsa("hola mundo".encode("utf-8"))
        return RespuestaFalsa(json.dumps({"id": "sub-x", "files": []}).encode("utf-8"))

    monkeypatch.setattr(L.urllib.request, "urlopen", falso_urlopen)
    monkeypatch.setattr(L, "_acceso", lambda: "tok-falso")

    assert L._leer_texto("d1") == "hola mundo"
    url_export = llamadas[-1][0]
    assert "files/d1/export" in url_export and "mimeType=text/plain" in url_export

    L._listar()
    url_lista, metodo, _ = llamadas[-1]
    assert metodo == "GET" and "files?" in url_lista
    assert "trashed%3Dfalse" in url_lista and L.CARPETA_SINTESIS in url_lista

    L._mover("b1", "sub-9")
    url_mover, metodo, _ = llamadas[-1]
    assert metodo == "PATCH" and "files/b1" in url_mover
    assert "addParents=sub-9" in url_mover and "removeParents=" + L.CARPETA_SINTESIS in url_mover

    L._asegurar_subcarpeta()
    url_crear, metodo, cuerpo = llamadas[-1]
    assert metodo == "POST" and url_crear.rstrip("/").endswith("/drive/v3/files")
    datos = json.loads(cuerpo)
    assert datos["name"] == L.SUBCARPETA_NOMBRE
    assert datos["mimeType"] == "application/vnd.google-apps.folder"
    assert datos["parents"] == [L.CARPETA_SINTESIS]


def test_main_sin_token_informa_claro_y_sale_1(monkeypatch, capsys):
    def sin_token():
        raise RuntimeError("sin token de Drive para la cuenta alex-docs")

    monkeypatch.setattr(L, "_listar", sin_token)
    codigo = L.main(["prog"])
    salida = json.loads(capsys.readouterr().out)
    assert codigo == 1 and salida["ok"] is False and "sin token" in salida["motivo"]


def test_doc_ilegible_no_se_mueve_por_que_no_se_puede_verificar():
    falso = FalsoDrive([BASURA])

    def export_falla(fid):
        raise RuntimeError("la exportación falló")

    r = L.limpiar(falso.listar, export_falla, falso.asegurar_subcarpeta, falso.mover,
                  avisar=None, aplicar=True)
    assert falso.movidos == [] and r["basura"] == 0 and r["ilegibles"] == 1
