# -*- coding: utf-8 -*-
"""Tests de alcance_lista.py (ALC1113B).
Sin red: solo lógica pura, fechas inyectadas y mocks.
"""
from __future__ import annotations
import json
import os
import tempfile
from datetime import date, datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from scripts.puente.alcance_lista import (
    Contacto,
    leer_lista_maggasukha,
    leer_red_resonancia,
    fusionar_contactos,
    mantener_documento_companero,
    soy_lider_check,
    procesar_lista,
)

# ── Datos de prueba ──────────────────────────────────────────────
LISTA_MAGGASUKHA = """Contactos para StarSeed OS

1. Organización: Protocol Labs
   Enlace: https://protocol.ai
   Qué hace: Investigación y desarrollo de protocolos descentralizados (IPFS, libp2p, Filecoin)
   Relación con StarSeed: Protocolos base para redes p2p y almacenamiento descentralizado
   Canal oficial: https://github.com/ipfs/discussions
   Idioma: en
   Notas: Equipo grande, múltiples proyectos
   Estado: propuesto
   Fecha: 2026-11-10

2. Proyecto: Matrix.org
   Enlace: https://matrix.org
   Qué hace: Protocolo abierto para comunicación descentralizada en tiempo real
   Relación con StarSeed: Chat federado para comunidades StarSeed
   Canal oficial: https://matrix.to/#/#matrix:matrix.org
   Idioma: en
   Notas: Fundación sin ánimo de lucro
   Estado: aprobado
   Fecha: 2026-11-09

3. Mantenedor: Juan Pérez
   Enlace: https://github.com/juanperez
   Qué hace: Mantenedor de libp2p en Rust
   Relación con StarSeed: Experto en redes p2p
   Canal oficial: https://github.com/libp2p/rust-libp2p/discussions
   Idioma: es
   Notas: Identidad por confirmar - solo login de GitHub
   Estado: propuesto
   Fecha: 2026-11-08
"""

RED_RESONANCIA = """Red de Resonancia · Plan de contactos

Contactos existentes:

- Organización: Protocol Labs
  Enlace: https://protocol.ai
  Qué hace: Protocolos descentralizados
  Relación con StarSeed: Base técnica para red p2p
  Canal oficial: https://discuss.protocol.ai
  Idioma: en
  Notas: Contacto previo en 2025
  Estado: respondio
  Fecha: 2026-10-15

- Comunidad: Fediverse.es
  Enlace: https://fediverse.es
  Qué hace: Comunidad hispanohablante del fediverso
  Relación con StarSeed: Difusión en español
  Canal oficial: https://matrix.to/#/#fediverse:matrix.org
  Idioma: es
  Notas: Grupo activo en Matrix
  Estado: enviado
  Fecha: 2026-11-01
"""

FICHAS_GITHUB = [
    {
        "obj_id": "gh-protocol-ipfs",
        "nombre_publico": "ipfs/ipfs",
        "que_hacen": "Implementación de referencia de IPFS en Go",
        "canal_oficial": {"medio": "github_discussions", "valor": "https://github.com/ipfs/ipfs/discussions", "fuente_url": "https://github.com/ipfs/ipfs"},
        "fuente": "github",
        "area_starseed": "redes-mesh-p2p",
    },
    {
        "obj_id": "gh-matrix-org",
        "nombre_publico": "matrix-org/matrix-spec",
        "que_hacen": "Especificación del protocolo Matrix",
        "canal_oficial": {"medio": "github_discussions", "valor": "https://github.com/matrix-org/matrix-spec/discussions", "fuente_url": "https://github.com/matrix-org/matrix-spec"},
        "fuente": "github",
        "area_starseed": "comunicaciones",
    },
    {
        "obj_id": "gh-nuevo-proyecto",
        "nombre_publico": "nuevo/proyecto",
        "que_hacen": "Nuevo proyecto de red p2p",
        "canal_oficial": {"medio": "github_discussions", "valor": "https://github.com/nuevo/proyecto/discussions", "fuente_url": "https://github.com/nuevo/proyecto"},
        "fuente": "github",
        "area_starseed": "redes-mesh-p2p",
    },
]

CONTACTOS_EXISTENTES = [
    {
        "tipo": "organización",
        "enlace": "https://protocol.ai",
        "que_hace": "Protocolos descentralizados (IPFS, libp2p, Filecoin)",
        "relacion_con_starseed": "Protocolos base para redes p2p",
        "canal_oficial": "https://discuss.protocol.ai",
        "idioma": "en",
        "notas": "Contacto previo en 2025; equipo grande",
        "estado": "respondio",
        "fecha": "2026-10-15",
    },
    {
        "tipo": "comunidad",
        "enlace": "https://fediverse.es",
        "que_hace": "Comunidad hispanohablante del fediverso",
        "relacion_con_starseed": "Difusión en español",
        "canal_oficial": "https://matrix.to/#/#fediverse:matrix.org",
        "idioma": "es",
        "notas": "Grupo activo en Matrix",
        "estado": "enviado",
        "fecha": "2026-11-01",
    },
]

# ── Tests ────────────────────────────────────────────────────────

def test_contacto_tipo_valido():
    """Contacto acepta los 4 tipos válidos."""
    for tipo in ("organización", "proyecto", "mantenedor", "comunidad"):
        c = Contacto(tipo=tipo, enlace="https://example.com", que_hace="Test", relacion_con_starseed="Test", canal_oficial="https://example.com", idioma="es", notas="", estado="propuesto", fecha="2026-11-13")
        assert c.tipo == tipo

def test_leer_lista_maggasukha_extrae_contactos():
    """Lee la lista de Maggasukha y extrae contactos estructurados."""
    with patch("scripts.puente.alcance_lista._leer_drive_texto", return_value=LISTA_MAGGASUKHA):
        contactos = leer_lista_maggasukha("1jH5S4_pIhovSE6aW-xW4LlXCWbKPJba4d2QiTsLO9XY")
    assert len(contactos) == 3
    assert contactos[0].tipo == "organización"
    assert contactos[0].enlace == "https://protocol.ai"
    assert contactos[2].notas == "Identidad por confirmar - solo login de GitHub"
    # El estado original es "propuesto"; "identidad por confirmar" se marca en fusionar_contactos
    assert contactos[2].estado == "propuesto"

def test_leer_red_resonancia_extrae_contactos():
    """Lee la red de resonancia y extrae contactos estructurados."""
    with patch("scripts.puente.alcance_lista._leer_drive_texto", return_value=RED_RESONANCIA):
        contactos = leer_red_resonancia("1TWmtpoy01pmLszLupzczBuymPH3vz2Zh5nW42XdGWiI")
    assert len(contactos) == 2
    assert contactos[0].tipo == "organización"
    assert contactos[1].tipo == "comunidad"

def test_fusionar_contactos_deduplica_por_url():
    """Fusiona contactos sin duplicar: misma entidad por URL."""
    fusionados = fusionar_contactos(
        contactos_maggasukha=json.loads(json.dumps(CONTACTOS_EXISTENTES[:1])),  # Protocol Labs
        contactos_resonancia=CONTACTOS_EXISTENTES,
        fichas_github=FICHAS_GITHUB,
        contactos_existentes=CONTACTOS_EXISTENTES,
    )
    # Protocol Labs aparece en las 3 fuentes pero debe ser uno solo
    protocol_labs = [c for c in fusionados if c.enlace == "https://protocol.ai"]
    assert len(protocol_labs) == 1
    # Debe conservar el estado más avanzado (respondio > enviado > aprobado > propuesto)
    assert protocol_labs[0].estado == "respondio"

def test_fusionar_contactos_deduplica_por_login_github():
    """Fusiona contactos sin duplicar: misma entidad por login de GitHub."""
    contactos_mag = [{
        "tipo": "proyecto",
        "enlace": "https://github.com/matrix-org/matrix-spec",
        "que_hace": "Especificación Matrix",
        "relacion_con_starseed": "Chat federado",
        "canal_oficial": "https://matrix.to/#/#matrix:matrix.org",
        "idioma": "en",
        "notas": "",
        "estado": "propuesto",
        "fecha": "2026-11-13",
    }]
    fusionados = fusionar_contactos(
        contactos_maggasukha=contactos_mag,
        contactos_resonancia=[],
        fichas_github=FICHAS_GITHUB[:1],  # gh-matrix-org
        contactos_existentes=[],
    )
    matrix = [c for c in fusionados if "matrix-org" in c.enlace or "matrix.org" in c.enlace]
    assert len(matrix) == 1

def test_fusionar_contactos_nuevos_de_github():
    """Añade contactos nuevos que solo vienen de GitHub."""
    fusionados = fusionar_contactos(
        contactos_maggasukha=[],
        contactos_resonancia=[],
        fichas_github=[FICHAS_GITHUB[2]],  # gh-nuevo-proyecto
        contactos_existentes=[],
    )
    assert len(fusionados) == 1
    assert fusionados[0].enlace == "https://github.com/nuevo/proyecto"
    assert fusionados[0].fuente == "github"

def test_marcar_identidad_por_confirmar():
    """Contactos sin identidad clara se marcan 'identidad por confirmar'."""
    contactos_mag = [{
        "tipo": "mantenedor",
        "enlace": "https://github.com/usuario_solo_login",
        "que_hace": "Desarrollador",
        "relacion_con_starseed": "Código abierto",
        "canal_oficial": "https://github.com/usuario_solo_login",
        "idioma": "es",
        "notas": "Solo login de GitHub, sin más info pública",
        "estado": "propuesto",
        "fecha": "2026-11-13",
    }]
    fusionados = fusionar_contactos(
        contactos_maggasukha=contactos_mag,
        contactos_resonancia=[],
        fichas_github=[],
        contactos_existentes=[],
    )
    assert len(fusionados) == 1
    assert fusionados[0].estado == "identidad por confirmar"
    assert "identidad por confirmar" in fusionados[0].notas.lower()

def test_soy_lider_check_solo_actua_si_lider():
    """El script solo actúa si soy_lider devuelve True."""
    with patch("scripts.puente.alcance_lista.LD.soy_lider", return_value={"soy": False, "motivo": "no soy líder"}):
        assert soy_lider_check() is False
    with patch("scripts.puente.alcance_lista.LD.soy_lider", return_value={"soy": True, "motivo": "líder vigente"}):
        assert soy_lider_check() is True

def test_mantener_documento_companero_crea_si_no_existe():
    """Crea el documento compañero si no existe."""
    mock_drive = MagicMock()
    mock_drive.crear_documento.return_value = {"id": "doc_nuevo_123", "enlace": "https://docs.google.com/document/d/doc_nuevo_123/edit"}
    mock_drive.buscar_documento.return_value = None  # No existe
    
    with patch("scripts.puente.alcance_lista._drive_cliente", return_value=mock_drive):
        doc_id = mantener_documento_companero([], "1OET1RNosKr0aX9BjX7Pg_GyY9ERqX7BG")
    
    assert doc_id == "doc_nuevo_123"
    mock_drive.crear_documento.assert_called_once()

def test_mantener_documento_companero_actualiza_existente():
    """Actualiza el documento compañero si ya existe."""
    mock_drive = MagicMock()
    mock_drive.leer_documento.return_value = "Contenido anterior"
    mock_drive.escribir_documento.return_value = True
    
    contactos = [{
        "tipo": "organización",
        "enlace": "https://protocol.ai",
        "que_hace": "Protocolos descentralizados",
        "relacion_con_starseed": "Base técnica",
        "canal_oficial": "https://discuss.protocol.ai",
        "idioma": "en",
        "notas": "Equipo grande",
        "estado": "respondio",
        "fecha": "2026-11-13",
    }]
    
    with patch("scripts.puente.alcance_lista._drive_cliente", return_value=mock_drive):
        doc_id = mantener_documento_companero(contactos, "1OET1RNosKr0aX9BjX7Pg_GyY9ERqX7BG")
    
    mock_drive.escribir_documento.assert_called_once()
    escrito = mock_drive.escribir_documento.call_args[0][1]
    assert "Protocol Labs" in escrito or "protocol.ai" in escrito
    assert "respondio" in escrito

def test_procesar_lista_flujo_completo():
    """Test de integración: flujo completo sin red."""
    with patch("scripts.puente.alcance_lista.soy_lider_check", return_value=True), \
         patch("scripts.puente.alcance_lista.leer_lista_maggasukha", return_value=json.loads(json.dumps(CONTACTOS_EXISTENTES[:1]))), \
         patch("scripts.puente.alcance_lista.leer_red_resonancia", return_value=CONTACTOS_EXISTENTES[1:]), \
         patch("scripts.puente.alcance_lista._cargar_fichas_github", return_value=FICHAS_GITHUB), \
         patch("scripts.puente.alcance_lista._cargar_contactos_existentes", return_value=CONTACTOS_EXISTENTES), \
         patch("scripts.puente.alcance_lista.mantener_documento_companero", return_value="doc_123") as mock_mantener:
        
        resultado = procesar_lista()
        
        assert resultado["ok"] is True
        assert "contactos_fusionados" in resultado
        assert len(resultado["contactos_fusionados"]) >= 2
        mock_mantener.assert_called_once()

def test_procesar_lista_no_lider_no_actua():
    """Si no es líder, no hace nada y devuelve ok=False."""
    with patch("scripts.puente.alcance_lista.soy_lider_check", return_value=False):
        resultado = procesar_lista()
    
    assert resultado["ok"] is False
    assert "no soy líder" in resultado["motivo"].lower()

if __name__ == "__main__":
    pytest.main([__file__, "-v"])