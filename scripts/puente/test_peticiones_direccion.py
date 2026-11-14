#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests para peticiones_direccion.py — reglas puras e inyección de dependencias, sin red."""
import json
import os
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))

from peticiones_direccion import (
    T_AVISO, T_PLAN_DIR, T_AVANCE_DIR, T_ENTREGABLE_2D3D,
    FORMATOS_NOTEBOOKLM, PALABRAS_REGLA_PERMANENTE,
    tachar, construir_aviso_encargo, construir_aviso_avance, construir_aviso_entregable_2d3d,
    filtrar_plan_mejorado, es_entregable_2d3d,
    validar_plan_entregables, forzar_enviar_true_en_plan, detectar_regla_permanente, extraer_regla_y_encargo,
    guardar_preferencia, guardar_rutina, procesar_regla_permanente,
    RestBus, publicar_aviso_encargo, publicar_avance_direccion,
    publicar_entregable_2d3d, publicar_plan_direccion,
    enviar_a_chat_director, enviar_avance_chat_director, enviar_entregable_2d3d_chat_director,
    mac_esta_viva_y_lider,
    procesar_encargo_nuevo, procesar_avance_frente, aplicar_plan_mejorado,
    crear_cliente_bus_desde_env,
)


# ── Mocks ────────────────────────────────────────────────────────────────────

class MockHttp:
    """HTTP falso para RestBus."""
    def __init__(self, respuesta=(200, "{}")):
        self.respuesta = respuesta
        self.llamadas = []

    def __call__(self, metodo, url, cabeceras, cuerpo, tope):
        self.llamadas.append((metodo, url, cabeceras, cuerpo))
        return self.respuesta


class MockBusLeer:
    """Falso para bus_leer en mac_esta_viva_y_lider."""
    def __init__(self, eventos=None):
        self.eventos = eventos or []

    def __call__(self):
        return self.eventos


# ── Fixtures ─────────────────────────────────────────────────────────────────

def encargo_ejemplo():
    return {
        "id": "ENC-1112-1430",
        "titulo": "Desarrollo de síntesis",
        "texto": "Se aprueban las recomendaciones...",
        "estado": "activo",
        "notas": ["Priorizar vídeo sobre audio"],
        "frentes": [
            {
                "id": "F1",
                "nombre": "Investigación",
                "destino": "fuentes",
                "estado": "hecho",
                "investigacion": ["referencias solarpunk"],
                "entregables": [
                    {"tipo": "informe", "titulo": "Informe investigación", "enlace": "https://docs.google.com/..."},
                    {"tipo": "mind-map", "titulo": "Mapa referencias", "enlace": "https://drive.google.com/..."},
                ],
            },
            {
                "id": "F2",
                "nombre": "Desarrollo",
                "destino": "produccion",
                "estado": "pendiente",
                "entregables": [
                    {"tipo": "documento", "titulo": "Guion principal", "prompt": "Escribe el guion"},
                    {"tipo": "informe", "titulo": "Desarrollo completo", "prompt": "Desarrollo detallado"},
                    {"tipo": "video", "titulo": "Vídeo resumen", "prompt": "Haz vídeo"},
                ],
            },
            {
                "id": "F3",
                "nombre": "Plan y listas de tareas",
                "destino": "produccion",
                "estado": "pendiente",
                "entregables": [
                    {"tipo": "informe", "titulo": "Próximos pasos", "prompt": "Lista tareas"},
                ],
            },
        ],
        "panel_enlace": "https://docs.google.com/document/d/panel123",
    }


def frente_ejemplo():
    return {
        "id": "F2",
        "nombre": "Desarrollo",
        "destino": "produccion",
        "estado": "en_curso",
        "carpeta_enlace": "https://drive.google.com/drive/folders/folder_1",
        "entregables": [
            {"tipo": "documento", "titulo": "Guion principal", "enlace": "https://docs.google.com/doc_1"},
            {"tipo": "informe", "titulo": "Desarrollo completo", "enlace": None, "fallo": "timeout"},
            {"tipo": "video", "titulo": "Vídeo resumen", "enlace": None, "fallo": None},
        ],
    }


# ── Tests de funciones puras ────────────────────────────────────────────────

def test_tachar_oculta_claves():
    """tachar sustituye claves por [oculto]."""
    # Usar strings que coincidan con los patrones reales (mínimo 8 chars después del prefijo)
    texto = "sk-abcdefgh ghp_abcdefgh AIzaSyABCdefgh Bearer token12345 https://abc.trycloudflare.com/path"
    resultado = tachar(texto)
    assert "[oculto]" in resultado
    assert "sk-abcdefgh" not in resultado
    assert "ghp_abcdefgh" not in resultado
    assert "AIzaSyABCdefgh" not in resultado
    assert "Bearer token12345" not in resultado
    assert "trycloudflare" not in resultado


def test_construir_aviso_encargo():
    """construir_aviso_encargo genera texto y datos sin datos privados."""
    enc = encargo_ejemplo()
    texto, datos = construir_aviso_encargo(enc)
    
    assert enc["id"] in texto
    assert enc["titulo"] in texto
    assert "F1 Investigación" in texto
    assert "F2 Desarrollo" in texto
    assert "F3 Plan y listas de tareas" in texto
    assert "6 entregables" in texto  # F1=2, F2=3, F3=1 = 6
    
    assert datos["encargo_id"] == enc["id"]
    assert datos["titulo"] == enc["titulo"]
    assert len(datos["frentes"]) == 3
    assert datos["panel_enlace"] == enc["panel_enlace"]
    assert datos["origen"] == "telegram"
    assert "ts" in datos
    # No debe haber claves ni datos privados
    assert "texto" not in datos  # el texto original completo no va en datos


def test_construir_aviso_avance():
    """construir_aviso_avance genera aviso con hechos y fallos."""
    enc = encargo_ejemplo()
    frente = frente_ejemplo()
    hechos = [frente["entregables"][0]]
    fallos = [frente["entregables"][1]]
    
    texto, datos = construir_aviso_avance(enc, frente, hechos, fallos)
    
    assert "Avance ENC-1112-1430" in texto
    assert "1/3" in texto  # 1 frente hecho de 3
    assert "Desarrollo ✓" in texto
    assert "Guion principal:" in texto
    assert "Pendiente de reintentar: Desarrollo completo" in texto
    
    assert datos["encargo_id"] == enc["id"]
    assert datos["frente_id"] == "F2"
    assert len(datos["hechos"]) == 1
    assert len(datos["fallos"]) == 1
    assert datos["hechos"][0]["enlace"] == "https://docs.google.com/doc_1"
    assert datos["fallos"][0]["error"] == "timeout"


def test_construir_aviso_entregable_2d3d():
    """construir_aviso_entregable_2d3d para Blender/HyperFrames."""
    enc = encargo_ejemplo()
    frente = frente_ejemplo()
    entregable = {"tipo": "blender", "titulo": "Escena Blender", "prompt": "Crea escena"}
    
    texto, datos = construir_aviso_entregable_2d3d(enc, frente, entregable)
    
    assert "Entregable 2D/3D para la Mac" in texto
    assert "blender" in texto.lower()
    assert "Escena Blender" in texto
    
    assert datos["encargo_id"] == enc["id"]
    assert datos["frente_id"] == "F2"
    assert datos["entregable_tipo"] == "blender"
    assert datos["destino_mac"] is True


def test_filtrar_plan_mejorado_solo_frentes_pendientes():
    """filtrar_plan_mejorado solo toca frentes pendientes; en_curso y hecho se conservan."""
    plan_viejo = {
        "frentes": [
            {"id": "F1", "nombre": "Investigación", "estado": "hecho", "entregables": [{"tipo": "informe", "titulo": "Inf1", "enlace": "link1"}]},
            {"id": "F2", "nombre": "Desarrollo", "estado": "en_curso", "entregables": [{"tipo": "documento", "titulo": "Doc1"}]},
            {"id": "F3", "nombre": "Plan", "estado": "pendiente", "entregables": [{"tipo": "informe", "titulo": "Plan1"}]},
        ]
    }
    plan_nuevo = {
        "frentes": [
            {"id": "F1", "nombre": "Investigación MEJORADA", "estado": "pendiente", "entregables": [{"tipo": "informe", "titulo": "Inf1"}]},
            {"id": "F2", "nombre": "Desarrollo MEJORADO", "estado": "pendiente", "entregables": [{"tipo": "documento", "titulo": "Doc1"}, {"tipo": "video", "titulo": "Vid1"}]},
            {"id": "F3", "nombre": "Plan MEJORADO", "estado": "pendiente", "entregables": [{"tipo": "informe", "titulo": "Plan1"}, {"tipo": "mind-map", "titulo": "Mapa"}]},
            {"id": "F4", "nombre": "Nuevo frente", "estado": "pendiente", "entregables": [{"tipo": "informe", "titulo": "Nuevo"}]},
        ]
    }
    
    fusionado = filtrar_plan_mejorado(plan_nuevo, plan_viejo)
    
    # F1: hecho → se conserva el viejo (nombre original, enlace conservado)
    assert fusionado["frentes"][0]["nombre"] == "Investigación"
    assert fusionado["frentes"][0]["estado"] == "hecho"
    assert fusionado["frentes"][0]["entregables"][0]["enlace"] == "link1"
    
    # F2: en_curso → se conserva el viejo
    assert fusionado["frentes"][1]["nombre"] == "Desarrollo"
    assert fusionado["frentes"][1]["estado"] == "en_curso"
    
    # F3: pendiente → se usa el nuevo (con entregables adicionales)
    assert fusionado["frentes"][2]["nombre"] == "Plan MEJORADO"
    assert len(fusionado["frentes"][2]["entregables"]) == 2
    
    # F4: nuevo frente → se añade
    assert len(fusionado["frentes"]) == 4
    assert fusionado["frentes"][3]["id"] == "F4"
    
    assert fusionado["plan_mejorado"] is True


def test_filtrar_plan_mejorado_conserva_enlaces_entregables():
    """Los enlaces de entregables ya conseguidos se conservan en la fusión."""
    plan_viejo = {
        "frentes": [
            {"id": "F1", "estado": "pendiente", "entregables": [
                {"tipo": "informe", "titulo": "Informe 1", "enlace": "https://doc1"},
                {"tipo": "mind-map", "titulo": "Mapa 1", "enlace": None},
            ]},
        ]
    }
    plan_nuevo = {
        "frentes": [
            {"id": "F1", "estado": "pendiente", "entregables": [
                {"tipo": "informe", "titulo": "Informe 1", "prompt": "Nuevo prompt"},
                {"tipo": "mind-map", "titulo": "Mapa 1", "prompt": "Nuevo prompt"},
                {"tipo": "video", "titulo": "Video 1", "prompt": "Nuevo"},
            ]},
        ]
    }
    
    fusionado = filtrar_plan_mejorado(plan_nuevo, plan_viejo)
    
    assert fusionado["frentes"][0]["entregables"][0].get("enlace") == "https://doc1"
    assert fusionado["frentes"][0]["entregables"][0]["prompt"] == "Nuevo prompt"
    assert fusionado["frentes"][0]["entregables"][1].get("enlace") is None
    assert len(fusionado["frentes"][0]["entregables"]) == 3


def test_es_entregable_2d3d():
    """es_entregable_2d3d detecta tipos que requieren la Mac."""
    assert es_entregable_2d3d("blender") is True
    assert es_entregable_2d3d("hyperframes") is True
    assert es_entregable_2d3d("video") is True
    assert es_entregable_2d3d("3d") is True
    assert es_entregable_2d3d("informe") is False
    assert es_entregable_2d3d("documento") is False
    assert es_entregable_2d3d("audio") is False
    assert es_entregable_2d3d("infographic") is False


# ── Tests de RestBus (con HTTP falso) ────────────────────────────────────────

def test_restbus_insertar_ok():
    """RestBus.insertar hace POST a relevo_eventos y devuelve True si 2xx."""
    http = MockHttp((201, '{"id": 1}'))
    bus = RestBus("https://supabase.example.com", "anon-key", http=http)
    
    ok = bus.insertar("mg_aviso", "Test aviso", {"clave": "valor"}, "tarea-1")
    
    assert ok is True
    assert len(http.llamadas) == 1
    metodo, url, cab, cuerpo = http.llamadas[0]
    assert metodo == "POST"
    assert "/rest/v1/relevo_eventos" in url
    assert cab["apikey"] == "anon-key"
    assert cab["Authorization"] == "Bearer anon-key"
    datos = json.loads(cuerpo)
    assert datos["tipo"] == "mg_aviso"
    assert datos["quien"] == "peticiones-a1"
    assert datos["tarea"] == "tarea-1"
    assert datos["texto"] == "Test aviso"
    assert datos["datos"]["clave"] == "valor"


def test_restbus_insertar_falla():
    """RestBus.insertar devuelve False si la respuesta no es 2xx."""
    http = MockHttp((400, '{"error": "bad request"}'))
    bus = RestBus("https://supabase.example.com", "anon-key", http=http)
    
    ok = bus.insertar("mg_aviso", "Test", {}, "tarea")
    
    assert ok is False


# ── Tests de funciones de publicación (con bus falso) ────────────────────────

def test_publicar_aviso_encargo():
    """publicar_aviso_encargo usa RestBus.insertar con datos correctos."""
    http = MockHttp((200, "{}"))
    bus = RestBus("https://supabase.example.com", "anon-key", http=http)
    enc = encargo_ejemplo()
    
    ok = publicar_aviso_encargo(enc, bus)
    
    assert ok is True
    assert len(http.llamadas) == 1
    _, _, _, cuerpo = http.llamadas[0]
    datos = json.loads(cuerpo)
    assert datos["tipo"] == T_AVISO
    assert datos["datos"]["encargo_id"] == enc["id"]
    assert datos["datos"]["panel_enlace"] == enc["panel_enlace"]


def test_publicar_avance_direccion():
    """publicar_avance_direccion publica avance con hechos y fallos."""
    http = MockHttp((200, "{}"))
    bus = RestBus("https://supabase.example.com", "anon-key", http=http)
    enc = encargo_ejemplo()
    frente = frente_ejemplo()
    hechos = [frente["entregables"][0]]
    fallos = [frente["entregables"][1]]
    
    ok = publicar_avance_direccion(enc, frente, hechos, fallos, bus)
    
    assert ok is True
    _, _, _, cuerpo = http.llamadas[0]
    datos = json.loads(cuerpo)
    assert datos["tipo"] == T_AVANCE_DIR
    assert datos["datos"]["encargo_id"] == enc["id"]
    assert datos["datos"]["frente_id"] == "F2"
    assert len(datos["datos"]["hechos"]) == 1
    assert len(datos["datos"]["fallos"]) == 1


def test_publicar_entregable_2d3d():
    """publicar_entregable_2d3d publica solicitud para la Mac."""
    http = MockHttp((200, "{}"))
    bus = RestBus("https://supabase.example.com", "anon-key", http=http)
    enc = encargo_ejemplo()
    frente = frente_ejemplo()
    entregable = {"tipo": "blender", "titulo": "Escena", "prompt": "Crea escena"}
    
    ok = publicar_entregable_2d3d(enc, frente, entregable, bus)
    
    assert ok is True
    _, _, _, cuerpo = http.llamadas[0]
    datos = json.loads(cuerpo)
    assert datos["tipo"] == T_ENTREGABLE_2D3D
    assert datos["datos"]["entregable_tipo"] == "blender"
    assert datos["datos"]["destino_mac"] is True


def test_publicar_plan_direccion():
    """publicar_plan_direccion publica el plan mejorado."""
    http = MockHttp((200, "{}"))
    bus = RestBus("https://supabase.example.com", "anon-key", http=http)
    enc = encargo_ejemplo()
    plan = {"frentes": [{"id": "F2", "nombre": "Desarrollo MEJORADO", "entregables": []}]}
    
    ok = publicar_plan_direccion(enc, plan, bus)
    
    assert ok is True
    _, _, _, cuerpo = http.llamadas[0]
    datos = json.loads(cuerpo)
    assert datos["tipo"] == T_PLAN_DIR
    assert datos["datos"]["encargo_id"] == enc["id"]
    assert "plan" in datos["datos"]


# ── Tests de Chat Director (con directorio temporal) ─────────────────────────

def test_enviar_a_chat_director_escribe_jsonl():
    """enviar_a_chat_director escribe en chat.jsonl con formato correcto."""
    with tempfile.TemporaryDirectory() as tmp:
        enc = encargo_ejemplo()
        ok = enviar_a_chat_director("Test mensaje", enc, raiz=tmp)
        
        assert ok is True
        
        ruta = Path(tmp) / "starseed_memory_root" / "mando" / "director" / "chat.jsonl"
        assert ruta.exists()
        
        lineas = ruta.read_text(encoding="utf-8").strip().split("\n")
        assert len(lineas) == 1
        registro = json.loads(lineas[0])
        assert registro["tipo"] == "aviso"
        assert registro["de"] == "peticiones-a1"
        assert registro["rol"] == "sistema"
        assert registro["canal"] == "director-presidente"
        assert registro["canales"] == ["director-presidente"]
        assert registro["tarea"] == enc["id"]
        assert "Test mensaje" in registro["texto"]


def test_enviar_avance_chat_director():
    """enviar_avance_chat_director usa construir_aviso_avance y publica."""
    with tempfile.TemporaryDirectory() as tmp:
        enc = encargo_ejemplo()
        frente = frente_ejemplo()
        hechos = [frente["entregables"][0]]
        fallos = [frente["entregables"][1]]
        
        ok = enviar_avance_chat_director(enc, frente, hechos, fallos, raiz=tmp)
        
        assert ok is True
        ruta = Path(tmp) / "starseed_memory_root" / "mando" / "director" / "chat.jsonl"
        registro = json.loads(ruta.read_text(encoding="utf-8").strip())
        assert "Avance ENC-1112-1430" in registro["texto"]
        assert "Guion principal" in registro["texto"]
        assert "Pendiente de reintentar" in registro["texto"]


def test_enviar_entregable_2d3d_chat_director():
    """enviar_entregable_2d3d_chat_director publica solicitud 2D/3D."""
    with tempfile.TemporaryDirectory() as tmp:
        enc = encargo_ejemplo()
        frente = frente_ejemplo()
        entregable = {"tipo": "hyperframes", "titulo": "Animación", "prompt": "Haz animación"}
        
        ok = enviar_entregable_2d3d_chat_director(enc, frente, entregable, raiz=tmp)
        
        assert ok is True
        ruta = Path(tmp) / "starseed_memory_root" / "mando" / "director" / "chat.jsonl"
        registro = json.loads(ruta.read_text(encoding="utf-8").strip())
        assert "Entregable 2D/3D para la Mac" in registro["texto"]
        assert "hyperframes" in registro["texto"].lower()
        assert "Animación" in registro["texto"]


# ── Tests de mac_esta_viva_y_lider ──────────────────────────────────────────

def test_mac_viva_y_lider_true():
    """mac_esta_viva_y_lider devuelve True si la Mac late y es líder."""
    ahora = time.time()
    eventos = [
        {"tipo": "mg_latido", "datos": {"nodo": "mac-abc123"}, "ts": ahora - 100},
        {"tipo": "mg_lider", "datos": {"nodo": "mac-abc123"}, "ts": ahora - 50},
    ]
    bus_leer = MockBusLeer(eventos)
    
    assert mac_esta_viva_y_lider(bus_leer, ahora=ahora) is True


def test_mac_viva_y_lider_falso_sin_latido():
    """Sin latido reciente de la Mac → False."""
    ahora = time.time()
    eventos = [
        {"tipo": "mg_lider", "datos": {"nodo": "mac-abc123"}, "ts": ahora - 50},
    ]
    bus_leer = MockBusLeer(eventos)
    
    assert mac_esta_viva_y_lider(bus_leer, ahora=ahora) is False


def test_mac_viva_y_lider_falso_lider_otro():
    """Si el líder es otro nodo → False."""
    ahora = time.time()
    eventos = [
        {"tipo": "mg_latido", "datos": {"nodo": "mac-abc123"}, "ts": ahora - 100},
        {"tipo": "mg_lider", "datos": {"nodo": "oracle-a1-def456"}, "ts": ahora - 50},
    ]
    bus_leer = MockBusLeer(eventos)
    
    assert mac_esta_viva_y_lider(bus_leer, ahora=ahora) is False


def test_mac_viva_y_lider_falso_latido_viejo():
    """Latido de hace más de 5 min → False."""
    ahora = time.time()
    eventos = [
        {"tipo": "mg_latido", "datos": {"nodo": "mac-abc123"}, "ts": ahora - 400},
        {"tipo": "mg_lider", "datos": {"nodo": "mac-abc123"}, "ts": ahora - 50},
    ]
    bus_leer = MockBusLeer(eventos)
    
    assert mac_esta_viva_y_lider(bus_leer, ahora=ahora) is False


# ── Tests de funciones de alto nivel ────────────────────────────────────────

def test_procesar_encargo_nuevo_publica_bus_y_chat():
    """procesar_encargo_nuevo publica en bus y, si Mac líder, en Chat Director."""
    http = MockHttp((200, "{}"))
    bus = RestBus("https://supabase.example.com", "anon-key", http=http)
    enc = encargo_ejemplo()
    
    # Sin Mac líder
    enc = procesar_encargo_nuevo(enc, bus, mac_viva=False)
    assert enc["publicado_bus"] is True
    assert enc["publicado_chat_director"] is False
    assert "ts_publicacion" in enc
    
    # Con Mac líder
    with tempfile.TemporaryDirectory() as tmp:
        enc2 = encargo_ejemplo()
        enc2 = procesar_encargo_nuevo(enc2, bus, raiz_chat=tmp, mac_viva=True)
        assert enc2["publicado_chat_director"] is True


def test_procesar_avance_frente_publica_y_detecta_2d3d():
    """procesar_avance_frente publica avance y detecta entregables 2D/3D."""
    http = MockHttp((200, "{}"))
    bus = RestBus("https://supabase.example.com", "anon-key", http=http)
    enc = encargo_ejemplo()
    frente = frente_ejemplo()
    hechos = [frente["entregables"][0], {"tipo": "video", "titulo": "Vídeo resumen", "enlace": "https://video"}]
    fallos = [frente["entregables"][1]]
    
    enc = procesar_avance_frente(enc, frente, hechos, fallos, bus, mac_viva=False)
    
    assert "avances_publicados" in enc
    assert len(enc["avances_publicados"]) == 1
    assert enc["avances_publicados"][0]["bus_ok"] is True
    # Debe haber 2 llamadas a bus: 1 avance + 1 video (2D/3D)
    assert len(http.llamadas) == 2


def test_aplicar_plan_mejorado_fusiona_y_publica():
    """aplicar_plan_mejorado fusiona el plan y publica en bus."""
    http = MockHttp((200, "{}"))
    bus = RestBus("https://supabase.example.com", "anon-key", http=http)
    enc = encargo_ejemplo()
    # F1 hecho, F2 pendiente, F3 pendiente
    plan_mejorado = {
        "frentes": [
            {"id": "F1", "nombre": "Investigación MEJORADA", "entregables": [{"tipo": "informe", "titulo": "Nuevo"}]},
            {"id": "F2", "nombre": "Desarrollo MEJORADO", "entregables": [{"tipo": "documento", "titulo": "Guion"}, {"tipo": "video", "titulo": "Video"}]},
            {"id": "F3", "nombre": "Plan MEJORADO", "entregables": [{"tipo": "informe", "titulo": "Pasos"}]},
        ]
    }
    
    enc = aplicar_plan_mejorado(enc, plan_mejorado, bus, mac_viva=False)
    
    assert enc["plan_mejorado"] is True
    # F1 se conserva (hecho), F2 y F3 se actualizan
    assert enc["frentes"][0]["nombre"] == "Investigación"  # original conservado
    assert enc["frentes"][1]["nombre"] == "Desarrollo MEJORADO"
    assert enc["frentes"][2]["nombre"] == "Plan MEJORADO"
    # Publicado en bus
    assert any(llamada[3] and json.loads(llamada[3]).get("tipo") == T_PLAN_DIR for llamada in http.llamadas)


# ── Test de crear_cliente_bus_desde_env ────────────────────────────────────

def test_crear_cliente_bus_desde_env_sin_archivos():
    """crear_cliente_bus_desde_env devuelve None si no hay variables."""
    with tempfile.TemporaryDirectory() as tmp:
        # Sin archivos de entorno
        bus = crear_cliente_bus_desde_env([os.path.join(tmp, "inexistente.env")])
        assert bus is None


def test_crear_cliente_bus_desde_env_con_variables():
    """crear_cliente_bus_desde_env crea bus si encuentra variables."""
    with tempfile.TemporaryDirectory() as tmp:
        env_file = os.path.join(tmp, "env")
        with open(env_file, "w") as f:
            f.write("NEXT_PUBLIC_SUPABASE_URL=https://test.supabase.co\n")
            f.write("NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-key-test\n")
        
        bus = crear_cliente_bus_desde_env([env_file])
        
        assert bus is not None
        assert bus.url == "https://test.supabase.co"
        assert bus._clave == "anon-key-test"


# ── Tests de validación de planes (§3.2) ────────────────────────────────────

def test_forzar_enviar_true_en_plan():
    """forzar_enviar_true_en_plan fuerza enviar=True en entregables con archivo/formato NB (§3.2.1)."""
    plan = {
        "frentes": [{
            "id": "F1",
            "entregables": [
                {"tipo": "informe", "titulo": "Informe 1", "enviar": False},
                {"tipo": "video", "titulo": "Video 1", "enviar": False},
                {"tipo": "documento", "titulo": "Doc 1", "enviar": True},
                {"tipo": "otro", "titulo": "Otro 1", "enviar": False},  # sin archivo, no formato NB
            ]
        }]
    }
    plan_modificado = forzar_enviar_true_en_plan(plan)
    
    assert plan_modificado["frentes"][0]["entregables"][0]["enviar"] is True
    assert plan_modificado["frentes"][0]["entregables"][1]["enviar"] is True
    assert plan_modificado["frentes"][0]["entregables"][2]["enviar"] is True
    # "otro" no es formato NotebookLM y no tiene archivo -> no se toca
    assert plan_modificado["frentes"][0]["entregables"][3]["enviar"] is False


def test_validar_plan_entregables_forzar_enviar_true_sin_exigir_todos():
    """validar_plan_entregables pasa si no pide 'todos los formatos' (§3.2.1 no es error)."""
    plan = {
        "frentes": [{
            "id": "F1",
            "entregables": [
                {"tipo": "informe", "titulo": "Informe 1", "enviar": False},
                {"tipo": "video", "titulo": "Video 1", "enviar": False},
            ]
        }]
    }
    texto = "Genera un informe y un video"
    valido, errores = validar_plan_entregables(plan, texto)
    assert valido is True
    assert len(errores) == 0


def test_validar_plan_entregables_todos_formatos_exige_9():
    """Si pide 'todos los formatos', exige los 9 formatos de NotebookLM (§3.2.2)."""
    plan = {
        "frentes": [{
            "id": "F1",
            "entregables": [
                {"tipo": "informe", "titulo": "Informe"},
                {"tipo": "audio", "titulo": "Audio"},
                {"tipo": "video", "titulo": "Video"},
            ]
        }]
    }
    texto = "Haz todos los formatos"
    valido, errores = validar_plan_entregables(plan, texto)
    assert valido is False
    assert len(errores) == 1
    assert "faltan" in errores[0].lower() or "faltantes" in errores[0].lower()
    # Debe mencionar 6 formatos faltantes
    assert "6" in errores[0]


def test_validar_plan_entregables_todos_formatos_completo():
    """Si están los 9 formatos, validación pasa."""
    plan = {
        "frentes": [{
            "id": "F1",
            "entregables": [
                {"tipo": f, "titulo": f} for f in FORMATOS_NOTEBOOKLM
            ]
        }]
    }
    texto = "Todos los formatos por favor"
    valido, errores = validar_plan_entregables(plan, texto)
    assert valido is True
    assert len(errores) == 0


def test_validar_plan_entregables_sin_pedir_todos_no_exige_9():
    """Si no pide 'todos los formatos', no exige los 9."""
    plan = {
        "frentes": [{
            "id": "F1",
            "entregables": [{"tipo": "informe", "titulo": "Solo informe"}]
        }]
    }
    texto = "Solo haz un informe"
    valido, errores = validar_plan_entregables(plan, texto)
    assert valido is True
    assert len(errores) == 0


def test_detectar_regla_permanente():
    """detectar_regla_permanente encuentra las frases clave."""
    assert detectar_regla_permanente("Recuerda cada día hacer esto") == "recuerda"
    assert detectar_regla_permanente("Para cada síntesis genera todo") == "para cada"
    assert detectar_regla_permanente("Siempre envía los archivos") == "siempre"
    assert detectar_regla_permanente("A partir de ahora hazlo así") == "a partir de ahora"
    assert detectar_regla_permanente("Cada día a las 6") == "cada día"
    assert detectar_regla_permanente("Haz un informe") is None


def test_extraer_regla_y_encargo():
    """extraer_regla_y_encargo separa el encargo de la regla."""
    encargo, regla = extraer_regla_y_encargo("Haz la síntesis y recuerda cada día enviarla")
    assert "haz la síntesis" in encargo.lower()
    assert "recuerda cada día enviarla" in regla.lower()
    
    encargo2, regla2 = extraer_regla_y_encargo("Solo un encargo simple")
    assert encargo2 == "Solo un encargo simple"
    assert regla2 is None


def test_guardar_preferencia():
    """guardar_preferencia escribe en preferencias.json."""
    with tempfile.TemporaryDirectory() as tmp:
        ok = guardar_preferencia("test_clave", {"valor": 123}, raiz=tmp)
        assert ok is True
        
        ruta = Path(tmp) / "starseed_memory_root" / "mando" / "preferencias.json"
        assert ruta.exists()
        datos = json.loads(ruta.read_text(encoding="utf-8"))
        assert datos["test_clave"]["valor"] == 123
        assert "_actualizado" in datos


def test_guardar_rutina():
    """guardar_rutina registra rutina en rutinas.json con disparador y acción."""
    with tempfile.TemporaryDirectory() as tmp:
        disparador = {"tipo": "cron", "expresion": "0 6 * * *"}
        accion = {"tipo": "ejecutar", "encargo_id": "ENC-123"}
        ok = guardar_rutina("rutina_test", disparador, accion, "Descripción test", raiz=tmp)
        assert ok is True
        
        ruta = Path(tmp) / "starseed_memory_root" / "mando" / "rutinas.json"
        assert ruta.exists()
        datos = json.loads(ruta.read_text(encoding="utf-8"))
        assert "rutina_test" in datos
        assert datos["rutina_test"]["descripcion"] == "Descripción test"
        assert datos["rutina_test"]["disparador"] == disparador
        assert datos["rutina_test"]["accion"] == accion
        assert datos["rutina_test"]["activa"] is True


def test_procesar_regla_permanente_guarda_preferencia_y_rutina():
    """procesar_regla_permanente guarda en preferencias y, si es rutina, en rutinas.json (§3.2.3)."""
    with tempfile.TemporaryDirectory() as tmp:
        texto = "Genera la síntesis diaria y recuerda cada día hacer todos los formatos"
        encargo_id = "ENC-1113-2137"
        
        ok, mensaje = procesar_regla_permanente(texto, encargo_id, raiz=tmp)
        
        assert ok is True
        assert "preferencias" in mensaje.lower()
        assert "rutina" in mensaje.lower()
        
        # Verificar preferencias.json
        pref_ruta = Path(tmp) / "starseed_memory_root" / "mando" / "preferencias.json"
        prefs = json.loads(pref_ruta.read_text(encoding="utf-8"))
        assert any(k.startswith("regla_ENC-1113-2137_") for k in prefs.keys())
        
        # Verificar rutinas.json
        rut_ruta = Path(tmp) / "starseed_memory_root" / "mando" / "rutinas.json"
        rutinas = json.loads(rut_ruta.read_text(encoding="utf-8"))
        assert any(k.startswith("rutina_ENC-1113-2137_") for k in rutinas.keys())


def test_procesar_regla_permanente_sin_frase_no_hace_nada():
    """Si no hay frase de regla permanente, no guarda nada."""
    with tempfile.TemporaryDirectory() as tmp:
        texto = "Solo un encargo normal sin regla"
        encargo_id = "ENC-TEST"
        
        ok, mensaje = procesar_regla_permanente(texto, encargo_id, raiz=tmp)
        
        assert ok is False
        assert "no se detectó" in mensaje.lower()


# ── Main ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    fallos = 0
    for nombre, fn in list(globals().items()):
        if nombre.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"✓ {nombre}")
            except AssertionError as e:
                print(f"✗ {nombre}: {e}")
                fallos += 1
            except Exception as e:
                print(f"✗ {nombre}: ERROR {type(e).__name__}: {e}")
                fallos += 1
    if fallos:
        print(f"\n{fallos} test(s) fallaron")
        sys.exit(1)
    else:
        print(f"\nTodos los tests pasaron")
        sys.exit(0)