# -*- coding: utf-8 -*-
"""Temas de búsqueda GitHub para el alcance (ALC1113).
Rotación diaria determinista por fecha; lista completa de temas StarSeed.
"""
from __future__ import annotations
from datetime import date, datetime, timezone
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Sequence

TEMAS_COMPLETOS: tuple[dict, ...] = (
    {"id": "sistemas-operativos", "nombre": "Sistemas operativos", "queries": ["operating-system", "osdev", "kernel", "unikernel"]},
    {"id": "descentralizacion", "nombre": "Descentralización", "queries": ["decentralized", "decentralization", "p2p", "peer-to-peer", "distributed-systems"]},
    {"id": "local-first", "nombre": "Local-first", "queries": ["local-first", "localfirst", "offline-first", "crdt", "automerge", "yjs"]},
    {"id": "fediverso-activitypub", "nombre": "Fediverso / ActivityPub", "queries": ["activitypub", "fediverse", "mastodon", "pleroma", "misskey", "federated"]},
    {"id": "nostr", "nombre": "Nostr", "queries": ["nostr", "nip-", "relay", "nostr-client"]},
    {"id": "matrix", "nombre": "Matrix", "queries": ["matrix-org", "synapse", "element-", "matrix-client", "matrix-bot"]},
    {"id": "redes-sociales-libres", "nombre": "Redes sociales libres", "queries": ["social-network", "federated-social", "decentralized-social", "open-social"]},
    {"id": "ia-abierta-local", "nombre": "IA abierta y local", "queries": ["llm", "local-llm", "gguf", "llama.cpp", "ollama", "open-llm", "local-ai", "runaway"]},
    {"id": "democracia-participacion", "nombre": "Democracia directa y participación", "queries": ["decidim", "consul", "loomio", "polis", "e-democracy", "participatory-budgeting", "liquid-democracy"]},
    {"id": "cooperativas-plataforma", "nombre": "Cooperativas de plataforma", "queries": ["platform-coop", "platform-cooperative", "cooperative-platform", "worker-coop"]},
    {"id": "redes-mesh-p2p", "nombre": "Redes mesh y p2p", "queries": ["meshtastic", "reticulum", "briar", "yggdrasil", "mesh-network", "p2p-mesh", "lora-mesh"]},
    {"id": "comunicaciones", "nombre": "Comunicaciones", "queries": ["secure-messaging", "encrypted-chat", "xmpp", "signal-protocol", "omemo"]},
    {"id": "solarpunk-regenerativa", "nombre": "Solarpunk y tecnología regenerativa", "queries": ["solarpunk", "regenerative-technology", "permaculture-tech", "eco-technology", "sustainable-computing"]},
)

TOPE_DIARIO = 15

def _indice_dia(fecha: date | None = None) -> int:
    """Índice determinista por día para rotación (0..len-1)."""
    d = fecha or datetime.now(timezone.utc).date()
    return (d.year * 366 + d.month * 31 + d.day) % len(TEMAS_COMPLETOS)

def temas_del_dia(fecha: date | None = None, tope: int = TOPE_DIARIO) -> list[dict]:
    """Devuelve los temas del día con rotación; máx `tope` temas."""
    idx = _indice_dia(fecha)
    n = min(tope, len(TEMAS_COMPLETOS))
    return [dict(TEMAS_COMPLETOS[(idx + i) % len(TEMAS_COMPLETOS)]) for i in range(n)]

def todas_las_queries(fecha: date | None = None) -> list[str]:
    """Todas las queries GitHub del día, planas y únicas (para paginación)."""
    vistos = set()
    salida = []
    for t in temas_del_dia(fecha):
        for q in t["queries"]:
            if q not in vistos:
                vistos.add(q)
                salida.append(q)
    return salida

def tema_por_id(tema_id: str) -> dict | None:
    for t in TEMAS_COMPLETOS:
        if t["id"] == tema_id:
            return dict(t)
    return None

def area_starseed_por_tema(tema_id: str) -> str:
    """Mapea tema → área de StarSeed OS (para la ficha)."""
    mapa = {
        "sistemas-operativos": "sistema-operativo",
        "descentralizacion": "red-descentralizada",
        "local-first": "local-first",
        "fediverso-activitypub": "fediverso",
        "nostr": "nostr",
        "matrix": "matrix",
        "redes-sociales-libres": "red-social",
        "ia-abierta-local": "ia-local",
        "democracia-participacion": "gobernanza",
        "cooperativas-plataforma": "economia",
        "redes-mesh-p2p": "red-mesh",
        "comunicaciones": "comunicaciones",
        "solarpunk-regenerativa": "regenerativo",
    }
    return mapa.get(tema_id, "otro")