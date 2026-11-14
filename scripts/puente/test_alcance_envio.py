#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests para alcance_envio.py — sin red, envío de aprobados con adaptadores falsos."""
import hashlib
import json
import os
import sys
import tempfile
import time
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock

sys.path.insert(0, os.path.dirname(__file__))

import alcance_envio as mod
from alcance_envio import (
    Envio,
    EnvioRegistro,
    _ruta_borradores,
    _ruta_envios,
    _ruta_bajas,
    _leer_borradores,
    _leer_aprobaciones,
    _leer_envios,
    _leer_bajas,
    _guardar_envio,
    _guardar_baja,
    _contar_envios_hoy,
    _tiene_aprobacion_valida,
    _enviar_github_discussion,
    _enviar_email,
    _enviar_asistido,
    enviar_aprobados,
    procesar_envio,
    main,
)


def test_constantes_definidas():
    """Constantes principales están definidas."""
    assert hasattr(mod, "Envio")
    assert hasattr(mod, "EnvioRegistro")
    assert hasattr(mod, "enviar_aprobados")
    assert hasattr(mod, "procesar_envio")
    assert hasattr(mod, "main")


def test_rutas_correctas():
    """Rutas de archivos son correctas."""
    assert str(_ruta_borradores()).endswith("starseed_memory_root/alcance/borradores")
    assert str(_ruta_envios()).endswith("starseed_memory_root/alcance/envios.jsonl")
    assert str(_ruta_bajas()).endswith("starseed_memory_root/alcance/bajas.jsonl")


def test_envio_crea_registro_con_hash(tmp_path):
    """Envio crea registro con hash del texto."""
    texto = "Hola: he visto vuestro proyecto — hacen cosas geniales.\n\nNos une lo mismo que os mueve: sistemas abiertos.\n\nSomos StarSeed OS, un sistema operativo social descentralizado y de código abierto: https://github.com/StarSeedSystem/starseed-system.\n\nLo construimos por fases — Semilla (lo que ya vive cada persona), Fruto y Cosecha (grupos y comunidades) y Mente Digital (una vida digital que te pertenece).\n\nUna petición concreta: ¿nos diríais qué os parece y si encajaría colaborar en algo pequeño?\n\nSi preferís no recibir más mensajes, contestad «no» y no volvemos a escribiros.\n\nUn saludo, Fundación StarSeed."
    envio = Envio(texto, "destinatario test", "github_discussion", {"repo": "owner/repo", "categoria": "ideas"})
    assert envio.hash == hashlib.sha256(texto.encode('utf-8')).hexdigest()
    assert envio.texto == texto
    assert envio.destinatario == "destinatario test"
    assert envio.canal == "github_discussion"
    assert envio.datos_canal == {"repo": "owner/repo", "categoria": "ideas"}


def test_envio_registro_to_dict(tmp_path):
    """EnvioRegistro serializa correctamente."""
    texto = "texto de prueba"
    envio = Envio(texto, "dest", "canal", {})
    registro = EnvioRegistro(envio, "simulado", "2024-01-01T12:00:00", "ok", "id-test")
    d = registro.to_dict()
    assert d["hash"] == envio.hash
    assert d["texto"] == texto
    assert d["destinatario"] == "dest"
    assert d["canal"] == "canal"
    assert d["modo"] == "simulado"
    assert d["cuando"] == "2024-01-01T12:00:00"
    assert d["resultado"] == "ok"
    assert d["id_externo"] == "id-test"


def test_leer_borradores_vacio(tmp_path):
    """_leer_borradores retorna lista vacía si no hay directorio."""
    with patch('alcance_envio._ruta_borradores', lambda: Path(tmp_path / "borradores_inexistente")):
        borradores = _leer_borradores()
        assert borradores == []


def test_leer_borradores_con_archivos(tmp_path):
    """_leer_borradores lee todos los JSON del directorio."""
    dir_borradores = tmp_path / "borradores"
    dir_borradores.mkdir()
    
    borrador1 = {
        "id": "algh-20240101-01",
        "estado": "esperando-aprobacion",
        "fuente": "github",
        "destinatario": "Proyecto Test",
        "canal": {"medio": "github_discussion", "repo": "owner/repo", "categoria": "ideas", "valor": "https://github.com/owner/repo/discussions", "fuente_url": "https://github.com/owner/repo"},
        "idioma": "es",
        "asunto": "StarSeed OS · propuesta sobre Proyecto Test",
        "texto": "Hola: he visto Proyecto Test — hacen cosas geniales.\n\nNos une lo mismo que os mueve: sistemas abiertos.\n\nSomos StarSeed OS, un sistema operativo social descentralizado y de código abierto: https://github.com/StarSeedSystem/starseed-system.\n\nLo construimos por fases — Semilla (lo que ya vive cada persona), Fruto y Cosecha (grupos y comunidades) y Mente Digital (una vida digital que te pertenece).\n\nUna petición concreta: ¿nos diríais qué os parece y si encajaría colaborar en algo pequeño?\n\nSi preferís no recibir más mensajes, contestad «no» y no volvemos a escribiros.\n\nUn saludo, Fundación StarSeed.",
        "motivo": "Afinidad en sistemas abiertos: hacen cosas geniales",
        "creado": "2024-01-01T12:00:00",
        "version": 1
    }
    borrador2 = {
        "id": "algh-20240101-02",
        "estado": "esperando-aprobacion",
        "fuente": "github",
        "destinatario": "Otro Proyecto",
        "canal": {"medio": "email", "valor": "contacto@otro.com", "fuente_url": "https://otro.com/contacto"},
        "idioma": "es",
        "asunto": "StarSeed OS · propuesta sobre Otro Proyecto",
        "texto": "Hola: he visto Otro Proyecto — hacen cosas geniales.\n\nNos une lo mismo que os mueve: sistemas abiertos.\n\nSomos StarSeed OS, un sistema operativo social descentralizado y de código abierto: https://github.com/StarSeedSystem/starseed-system.\n\nLo construimos por fases — Semilla (lo que ya vive cada persona), Fruto y Cosecha (grupos y comunidades) y Mente Digital (una vida digital que te pertenece).\n\nUna petición concreta: ¿nos diríais qué os parece y si encajaría colaborar en algo pequeño?\n\nSi preferís no recibir más mensajes, contestad «no» y no volvemos a escribiros.\n\nUn saludo, Fundación StarSeed.",
        "motivo": "Afinidad en sistemas abiertos: hacen cosas geniales",
        "creado": "2024-01-01T12:00:00",
        "version": 1
    }
    
    with open(dir_borradores / "algh-20240101-01.json", "w") as f:
        json.dump(borrador1, f)
    with open(dir_borradores / "algh-20240101-02.json", "w") as f:
        json.dump(borrador2, f)
    
    with patch('alcance_envio._ruta_borradores', lambda: dir_borradores):
        borradores = _leer_borradores()
        assert len(borradores) == 2
        assert borradores[0]["id"] == "algh-20240101-01"
        assert borradores[1]["id"] == "algh-20240101-02"


def test_leer_aprobaciones_vacio(tmp_path):
    """_leer_aprobaciones retorna lista vacía si no hay archivo."""
    with patch('alcance_envio._ruta_aprobaciones', lambda: Path(tmp_path / "aprobaciones_inexistente.jsonl")):
        aprobaciones = _leer_aprobaciones()
        assert aprobaciones == []


def test_leer_aprobaciones_con_datos(tmp_path):
    """_leer_aprobaciones lee JSONL correctamente."""
    ruta = tmp_path / "aprobaciones.jsonl"
    hash1 = hashlib.sha256("texto 1".encode()).hexdigest()
    hash2 = hashlib.sha256("texto 2".encode()).hexdigest()
    
    with open(ruta, "w") as f:
        f.write(json.dumps({"hash": hash1, "texto": "texto 1", "destinatario": "dest1", "canal": "canal1", "quien": "q1", "cuando": "2024-01-01 12:00:00", "estado": "aprobado"}) + "\n")
        f.write(json.dumps({"hash": hash2, "texto": "texto 2", "destinatario": "dest2", "canal": "canal2", "quien": "q2", "cuando": "2024-01-01 13:00:00", "estado": "aprobado"}) + "\n")
    
    with patch('alcance_envio._ruta_aprobaciones', lambda: ruta):
        aprobaciones = _leer_aprobaciones()
        assert len(aprobaciones) == 2
        assert aprobaciones[0]["hash"] == hash1
        assert aprobaciones[1]["hash"] == hash2


def test_tiene_aprobacion_valida_coincide(tmp_path):
    """_tiene_aprobacion_valida retorna True si hash, destinatario y canal coinciden."""
    borrador = {
        "id": "algh-20240101-01",
        "texto": "texto aprobado",
        "destinatario": "Proyecto Test",
        "canal": {"medio": "github_discussion", "repo": "owner/repo", "categoria": "ideas"}
    }
    hash_texto = hashlib.sha256("texto aprobado".encode()).hexdigest()
    aprobaciones = [{
        "hash": hash_texto,
        "texto": "texto aprobado",
        "destinatario": "Proyecto Test",
        "canal": "github_discussion",
        "estado": "aprobado"
    }]
    
    with patch('alcance_envio._leer_aprobaciones', lambda: aprobaciones):
        assert _tiene_aprobacion_valida(borrador) == True


def test_tiene_aprobacion_valida_no_coincide_hash(tmp_path):
    """_tiene_aprobacion_valida retorna False si hash no coincide."""
    borrador = {
        "id": "algh-20240101-01",
        "texto": "texto modificado",
        "destinatario": "Proyecto Test",
        "canal": {"medio": "github_discussion", "repo": "owner/repo", "categoria": "ideas"}
    }
    hash_texto = hashlib.sha256("texto original".encode()).hexdigest()
    aprobaciones = [{
        "hash": hash_texto,
        "texto": "texto original",
        "destinatario": "Proyecto Test",
        "canal": "github_discussion",
        "estado": "aprobado"
    }]
    
    with patch('alcance_envio._leer_aprobaciones', lambda: aprobaciones):
        assert _tiene_aprobacion_valida(borrador) == False


def test_tiene_aprobacion_valida_no_coincide_destinatario(tmp_path):
    """_tiene_aprobacion_valida retorna False si destinatario no coincide."""
    borrador = {
        "id": "algh-20240101-01",
        "texto": "texto aprobado",
        "destinatario": "Otro Proyecto",
        "canal": {"medio": "github_discussion", "repo": "owner/repo", "categoria": "ideas"}
    }
    hash_texto = hashlib.sha256("texto aprobado".encode()).hexdigest()
    aprobaciones = [{
        "hash": hash_texto,
        "texto": "texto aprobado",
        "destinatario": "Proyecto Test",
        "canal": "github_discussion",
        "estado": "aprobado"
    }]
    
    with patch('alcance_envio._leer_aprobaciones', lambda: aprobaciones):
        assert _tiene_aprobacion_valida(borrador) == False


def test_tiene_aprobacion_valida_no_coincide_canal(tmp_path):
    """_tiene_aprobacion_valida retorna False si canal no coincide."""
    borrador = {
        "id": "algh-20240101-01",
        "texto": "texto aprobado",
        "destinatario": "Proyecto Test",
        "canal": {"medio": "email", "valor": "test@test.com"}
    }
    hash_texto = hashlib.sha256("texto aprobado".encode()).hexdigest()
    aprobaciones = [{
        "hash": hash_texto,
        "texto": "texto aprobado",
        "destinatario": "Proyecto Test",
        "canal": "github_discussion",
        "estado": "aprobado"
    }]
    
    with patch('alcance_envio._leer_aprobaciones', lambda: aprobaciones):
        assert _tiene_aprobacion_valida(borrador) == False


def test_tiene_aprobacion_valida_sin_aprobacion(tmp_path):
    """_tiene_aprobacion_valida retorna False si no hay aprobación."""
    borrador = {
        "id": "algh-20240101-01",
        "texto": "texto sin aprobar",
        "destinatario": "Proyecto Test",
        "canal": {"medio": "github_discussion", "repo": "owner/repo", "categoria": "ideas"}
    }
    aprobaciones = []
    
    with patch('alcance_envio._leer_aprobaciones', lambda: aprobaciones):
        assert _tiene_aprobacion_valida(borrador) == False


def test_tiene_aprobacion_valida_aprobacion_rechazada(tmp_path):
    """_tiene_aprobacion_valida retorna False si aprobación está rechazada."""
    borrador = {
        "id": "algh-20240101-01",
        "texto": "texto aprobado",
        "destinatario": "Proyecto Test",
        "canal": {"medio": "github_discussion", "repo": "owner/repo", "categoria": "ideas"}
    }
    hash_texto = hashlib.sha256("texto aprobado".encode()).hexdigest()
    aprobaciones = [{
        "hash": hash_texto,
        "texto": "texto aprobado",
        "destinatario": "Proyecto Test",
        "canal": "github_discussion",
        "estado": "rechazado"
    }]
    
    with patch('alcance_envio._leer_aprobaciones', lambda: aprobaciones):
        assert _tiene_aprobacion_valida(borrador) == False


def test_contar_envios_hoy_vacio(tmp_path):
    """_contar_envios_hoy retorna 0 si no hay envíos."""
    with patch('alcance_envio._ruta_envios', lambda: Path(tmp_path / "envios_inexistente.jsonl")):
        assert _contar_envios_hoy() == 0


def test_contar_envios_hoy_con_datos(tmp_path):
    """_contar_envios_hoy cuenta envíos de hoy."""
    ruta = tmp_path / "envios.jsonl"
    hoy = time.strftime("%Y-%m-%d")
    ayer = time.strftime("%Y-%m-%d", time.localtime(time.time() - 86400))
    
    with open(ruta, "w") as f:
        f.write(json.dumps({"hash": "h1", "cuando": f"{hoy}T12:00:00", "modo": "simulado"}) + "\n")
        f.write(json.dumps({"hash": "h2", "cuando": f"{hoy}T13:00:00", "modo": "real"}) + "\n")
        f.write(json.dumps({"hash": "h3", "cuando": f"{ayer}T12:00:00", "modo": "simulado"}) + "\n")
    
    with patch('alcance_envio._ruta_envios', lambda: ruta):
        assert _contar_envios_hoy() == 2


def test_leer_bajas_vacio(tmp_path):
    """_leer_bajas retorna set vacío si no hay archivo."""
    with patch('alcance_envio._ruta_bajas', lambda: Path(tmp_path / "bajas_inexistente.jsonl")):
        bajas = _leer_bajas()
        assert bajas == set()


def test_leer_bajas_con_datos(tmp_path):
    """_leer_bajas lee destinatarios dados de baja."""
    ruta = tmp_path / "bajas.jsonl"
    with open(ruta, "w") as f:
        f.write(json.dumps({"destinatario": "Proyecto A", "cuando": "2024-01-01"}) + "\n")
        f.write(json.dumps({"destinatario": "Proyecto B", "cuando": "2024-01-02"}) + "\n")
    
    with patch('alcance_envio._ruta_bajas', lambda: ruta):
        bajas = _leer_bajas()
        assert "Proyecto A" in bajas
        assert "Proyecto B" in bajas
        assert len(bajas) == 2


def test_guardar_baja(tmp_path):
    """_guardar_baja registra destinatario en bajas."""
    ruta = tmp_path / "bajas.jsonl"
    with patch('alcance_envio._ruta_bajas', lambda: ruta):
        _guardar_baja("Nuevo Proyecto")
        with open(ruta) as f:
            lineas = f.readlines()
        assert len(lineas) == 1
        data = json.loads(lineas[0])
        assert data["destinatario"] == "Nuevo Proyecto"
        assert "cuando" in data


def test_enviar_github_discussion_simulado(tmp_path):
    """_enviar_github_discussion en modo simulado registra sin enviar."""
    envio = Envio(
        "texto de prueba",
        "Proyecto Test",
        "github_discussion",
        {"repo": "owner/repo", "categoria": "ideas"}
    )
    
    with patch.dict(os.environ, {"ALCANCE_ENVIO": "0"}, clear=False):
        resultado = _enviar_github_discussion(envio, {}, lambda *a, **k: None)
    
    assert resultado["ok"] == True
    assert resultado["modo"] == "simulado"
    assert "simulado" in resultado["detalle"].lower()
    assert "discussion" in resultado["detalle"].lower()


def test_enviar_email_simulado(tmp_path):
    """_enviar_email en modo simulado registra sin enviar."""
    envio = Envio(
        "texto de prueba",
        "Proyecto Test",
        "email",
        {"valor": "contacto@proyecto.com", "fuente_url": "https://proyecto.com/contacto"}
    )
    
    with patch.dict(os.environ, {"ALCANCE_ENVIO": "0"}, clear=False):
        resultado = _enviar_email(envio, {}, lambda *a, **k: None)
    
    assert resultado["ok"] == True
    assert resultado["modo"] == "simulado"


def test_enviar_asistido_simulado(tmp_path):
    """_enviar_asistido en modo simulado registra sin enviar."""
    envio = Envio(
        "texto de prueba",
        "Proyecto Test",
        "asistido",
        {"lugar": "https://foro.proyecto.com", "fuente_url": "https://proyecto.com"}
    )
    
    with patch.dict(os.environ, {"ALCANCE_ENVIO": "0"}, clear=False):
        resultado = _enviar_asistido(envio, {}, lambda *a, **k: None)
    
    assert resultado["ok"] == True
    assert resultado["modo"] == "simulado"


def test_enviar_aprobados_filtra_sin_aprobacion(tmp_path):
    """enviar_aprobados solo procesa borradores con aprobación válida."""
    dir_borradores = tmp_path / "borradores"
    dir_borradores.mkdir()
    
    # Borrador SIN aprobación
    borrador_sin_aprobacion = {
        "id": "algh-20240101-01",
        "estado": "esperando-aprobacion",
        "fuente": "github",
        "destinatario": "Sin Aprobacion",
        "canal": {"medio": "github_discussion", "repo": "owner/repo", "categoria": "ideas"},
        "texto": "texto sin aprobar",
        "creado": "2024-01-01T12:00:00"
    }
    
    with open(dir_borradores / "algh-20240101-01.json", "w") as f:
        json.dump(borrador_sin_aprobacion, f)
    
    with patch('alcance_envio._ruta_borradores', lambda: dir_borradores):
        with patch('alcance_envio._leer_aprobaciones', lambda: []):
            with patch.dict(os.environ, {"ALCANCE_ENVIO": "0"}, clear=False):
                resultados = enviar_aprobados(soy_lider=True)
    
    assert len(resultados) == 0


def test_enviar_aprobados_respeta_tope_diario(tmp_path):
    """enviar_aprobados respeta tope de 5 envíos al día."""
    dir_borradores = tmp_path / "borradores"
    dir_borradores.mkdir()
    
    # Crear 6 borradores con aprobaciones válidas
    borradores = []
    for i in range(6):
        b = {
            "id": f"algh-20240101-{i+1:02d}",
            "estado": "esperando-aprobacion",
            "fuente": "github",
            "destinatario": f"Proyecto {i+1}",
            "canal": {"medio": "github_discussion", "repo": f"owner/repo{i}", "categoria": "ideas"},
            "texto": f"texto aprobado {i+1}",
            "creado": "2024-01-01T12:00:00"
        }
        borradores.append(b)
        with open(dir_borradores / f"algh-20240101-{i+1:02d}.json", "w") as f:
            json.dump(b, f)
    
    # 5 envíos ya hechos hoy
    ruta_envios = tmp_path / "envios.jsonl"
    hoy = time.strftime("%Y-%m-%d")
    with open(ruta_envios, "w") as f:
        for i in range(5):
            f.write(json.dumps({"hash": f"h{i}", "cuando": f"{hoy}T12:00:00", "modo": "simulado"}) + "\n")
    
    aprobaciones = []
    for b in borradores:
        hash_texto = hashlib.sha256(b["texto"].encode()).hexdigest()
        aprobaciones.append({
            "hash": hash_texto,
            "texto": b["texto"],
            "destinatario": b["destinatario"],
            "canal": "github_discussion",
            "estado": "aprobado"
        })
    
    with patch('alcance_envio._ruta_borradores', lambda: dir_borradores):
        with patch('alcance_envio._ruta_envios', lambda: ruta_envios):
            with patch('alcance_envio._leer_aprobaciones', lambda: aprobaciones):
                with patch.dict(os.environ, {"ALCANCE_ENVIO": "0"}, clear=False):
                    resultados = enviar_aprobados(soy_lider=True)
    
    # Debería retornar un resultado indicando que se alcanzó el tope
    assert len(resultados) == 1
    assert resultados[0]["ok"] == False
    assert "tope" in resultados[0]["motivo"].lower()


def test_enviar_aprobados_no_reenvia(tmp_path):
    """enviar_aprobados no reenvía a destinatario ya enviado."""
    dir_borradores = tmp_path / "borradores"
    dir_borradores.mkdir()
    
    borrador = {
        "id": "algh-20240101-01",
        "estado": "esperando-aprobacion",
        "fuente": "github",
        "destinatario": "Proyecto Ya Enviado",
        "canal": {"medio": "github_discussion", "repo": "owner/repo", "categoria": "ideas"},
        "texto": "texto aprobado",
        "creado": "2024-01-01T12:00:00"
    }
    
    with open(dir_borradores / "algh-20240101-01.json", "w") as f:
        json.dump(borrador, f)
    
    # Ya enviado hoy
    ruta_envios = tmp_path / "envios.jsonl"
    hoy = time.strftime("%Y-%m-%d")
    hash_texto = hashlib.sha256("texto aprobado".encode()).hexdigest()
    with open(ruta_envios, "w") as f:
        f.write(json.dumps({"hash": hash_texto, "destinatario": "Proyecto Ya Enviado", "cuando": f"{hoy}T12:00:00", "modo": "simulado"}) + "\n")
    
    aprobaciones = [{
        "hash": hash_texto,
        "texto": "texto aprobado",
        "destinatario": "Proyecto Ya Enviado",
        "canal": "github_discussion",
        "estado": "aprobado"
    }]
    
    with patch('alcance_envio._ruta_borradores', lambda: dir_borradores):
        with patch('alcance_envio._ruta_envios', lambda: ruta_envios):
            with patch('alcance_envio._leer_aprobaciones', lambda: aprobaciones):
                with patch.dict(os.environ, {"ALCANCE_ENVIO": "0"}, clear=False):
                    resultados = enviar_aprobados(soy_lider=True)
    
    assert len(resultados) == 0


def test_enviar_aprobados_respeta_baja(tmp_path):
    """enviar_aprobados no envía a destinatario en lista de bajas."""
    dir_borradores = tmp_path / "borradores"
    dir_borradores.mkdir()
    
    borrador = {
        "id": "algh-20240101-01",
        "estado": "esperando-aprobacion",
        "fuente": "github",
        "destinatario": "Proyecto Dado De Baja",
        "canal": {"medio": "github_discussion", "repo": "owner/repo", "categoria": "ideas"},
        "texto": "texto aprobado",
        "creado": "2024-01-01T12:00:00"
    }
    
    with open(dir_borradores / "algh-20240101-01.json", "w") as f:
        json.dump(borrador, f)
    
    # En lista de bajas
    ruta_bajas = tmp_path / "bajas.jsonl"
    with open(ruta_bajas, "w") as f:
        f.write(json.dumps({"destinatario": "Proyecto Dado De Baja", "cuando": "2024-01-01"}) + "\n")
    
    aprobaciones = [{
        "hash": hashlib.sha256("texto aprobado".encode()).hexdigest(),
        "texto": "texto aprobado",
        "destinatario": "Proyecto Dado De Baja",
        "canal": "github_discussion",
        "estado": "aprobado"
    }]
    
    with patch('alcance_envio._ruta_borradores', lambda: dir_borradores):
        with patch('alcance_envio._ruta_bajas', lambda: ruta_bajas):
            with patch('alcance_envio._leer_aprobaciones', lambda: aprobaciones):
                with patch.dict(os.environ, {"ALCANCE_ENVIO": "0"}, clear=False):
                    resultados = enviar_aprobados(soy_lider=True)
    
    assert len(resultados) == 0


def test_enviar_aprobados_solo_lider(tmp_path):
    """enviar_aprobados solo actúa si soy_lider=True."""
    dir_borradores = tmp_path / "borradores"
    dir_borradores.mkdir()
    
    borrador = {
        "id": "algh-20240101-01",
        "estado": "esperando-aprobacion",
        "fuente": "github",
        "destinatario": "Proyecto Test",
        "canal": {"medio": "github_discussion", "repo": "owner/repo", "categoria": "ideas"},
        "texto": "texto aprobado",
        "creado": "2024-01-01T12:00:00"
    }
    
    with open(dir_borradores / "algh-20240101-01.json", "w") as f:
        json.dump(borrador, f)
    
    aprobaciones = [{
        "hash": hashlib.sha256("texto aprobado".encode()).hexdigest(),
        "texto": "texto aprobado",
        "destinatario": "Proyecto Test",
        "canal": "github_discussion",
        "estado": "aprobado"
    }]
    
    with patch('alcance_envio._ruta_borradores', lambda: dir_borradores):
        with patch('alcance_envio._leer_aprobaciones', lambda: aprobaciones):
            with patch('alcance_envio.LD.soy_lider', return_value={"soy": False, "motivo": "test"}):
                with patch.dict(os.environ, {"ALCANCE_ENVIO": "0"}, clear=False):
                    resultados = enviar_aprobados(soy_lider=None)
    
    assert len(resultados) == 1
    assert resultados[0]["ok"] == False
    assert "líder" in resultados[0]["motivo"].lower()


def test_procesar_envio_github_discussion(tmp_path):
    """procesar_envio usa adaptador github_discussion."""
    envio = Envio(
        "texto de prueba",
        "Proyecto Test",
        "github_discussion",
        {"repo": "owner/repo", "categoria": "ideas"}
    )
    
    with patch.dict(os.environ, {"ALCANCE_ENVIO": "0"}, clear=False):
        resultado = procesar_envio(envio, {}, lambda *a, **k: None)
    
    assert resultado["ok"] == True
    assert resultado["canal"] == "github_discussion"


def test_procesar_envio_email(tmp_path):
    """procesar_envio usa adaptador email."""
    envio = Envio(
        "texto de prueba",
        "Proyecto Test",
        "email",
        {"valor": "contacto@proyecto.com", "fuente_url": "https://proyecto.com/contacto"}
    )
    
    with patch.dict(os.environ, {"ALCANCE_ENVIO": "0"}, clear=False):
        resultado = procesar_envio(envio, {}, lambda *a, **k: None)
    
    assert resultado["ok"] == True
    assert resultado["canal"] == "email"


def test_procesar_envio_asistido(tmp_path):
    """procesar_envio usa adaptador asistido."""
    envio = Envio(
        "texto de prueba",
        "Proyecto Test",
        "asistido",
        {"lugar": "https://foro.proyecto.com", "fuente_url": "https://proyecto.com"}
    )
    
    with patch.dict(os.environ, {"ALCANCE_ENVIO": "0"}, clear=False):
        resultado = procesar_envio(envio, {}, lambda *a, **k: None)
    
    assert resultado["ok"] == True
    assert resultado["canal"] == "asistido"


def test_procesar_envio_canal_desconocido_pasa_a_asistido(tmp_path):
    """procesar_envio pasa a asistido si canal desconocido."""
    envio = Envio(
        "texto de prueba",
        "Proyecto Test",
        "canal_desconocido",
        {"valor": "algo"}
    )
    
    with patch.dict(os.environ, {"ALCANCE_ENVIO": "0"}, clear=False):
        resultado = procesar_envio(envio, {}, lambda *a, **k: None)
    
    assert resultado["ok"] == True
    assert resultado["canal"] == "asistido"


def test_guardar_envio_registra_en_jsonl(tmp_path):
    """_guardar_envio escribe registro en envios.jsonl."""
    ruta = tmp_path / "envios.jsonl"
    envio = Envio("texto", "dest", "canal", {})
    registro = EnvioRegistro(envio, "simulado", "2024-01-01T12:00:00", "ok", "id-123")
    
    with patch('alcance_envio._ruta_envios', lambda: ruta):
        _guardar_envio(registro)
        
        with open(ruta) as f:
            linea = f.readline()
        data = json.loads(linea)
        assert data["hash"] == envio.hash
        assert data["modo"] == "simulado"
        assert data["resultado"] == "ok"
        assert data["id_externo"] == "id-123"


def test_enviar_aprobados_avisa_telegram(tmp_path):
    """enviar_aprobados avisa por Telegram de cada envío."""
    dir_borradores = tmp_path / "borradores"
    dir_borradores.mkdir()
    
    # También crear directorios para envios y bajas
    (tmp_path / "envios").mkdir(exist_ok=True)
    (tmp_path / "bajas").mkdir(exist_ok=True)
    
    borrador = {
        "id": "algh-20240101-01",
        "estado": "esperando-aprobacion",
        "fuente": "github",
        "destinatario": "Proyecto Test",
        "canal": {"medio": "github_discussion", "repo": "owner/repo", "categoria": "ideas"},
        "texto": "texto aprobado para telegram",
        "creado": "2024-01-01T12:00:00"
    }
    
    with open(dir_borradores / "algh-20240101-01.json", "w") as f:
        json.dump(borrador, f)
    
    aprobaciones = [{
        "hash": hashlib.sha256("texto aprobado para telegram".encode()).hexdigest(),
        "texto": "texto aprobado para telegram",
        "destinatario": "Proyecto Test",
        "canal": "github_discussion",
        "estado": "aprobado"
    }]
    
    telegram_enviados = []
    def fake_enviar(texto: str) -> None:
        telegram_enviados.append(texto)
    
    with patch('alcance_envio._ruta_borradores', lambda: dir_borradores):
        with patch('alcance_envio._ruta_envios', lambda: tmp_path / "envios" / "envios.jsonl"):
            with patch('alcance_envio._ruta_bajas', lambda: tmp_path / "bajas" / "bajas.jsonl"):
                with patch('alcance_envio._leer_aprobaciones', lambda: aprobaciones):
                    with patch.dict(os.environ, {"ALCANCE_ENVIO": "0"}, clear=False):
                        resultados = enviar_aprobados(soy_lider=True, enviar_telegram=fake_enviar)
    
    assert len(resultados) == 1
    assert len(telegram_enviados) == 1
    assert "Enviado" in telegram_enviados[0]
    assert "Proyecto Test" in telegram_enviados[0]
    assert "github_discussion" in telegram_enviados[0]


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])