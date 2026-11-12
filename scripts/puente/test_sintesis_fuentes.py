#!/usr/bin/env python3
"""Pruebas para sintesis_fuentes.py — módulo puro, sin red, con directorios temporales."""
import json
import os
import tempfile
import shutil
from datetime import datetime, timedelta
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
import sintesis_fuentes as sf


def _crear_estructura(raiz):
    """Crea la estructura de directorios necesaria."""
    dirs = [
        os.path.join(raiz, "starseed_memory_root", "produccion-audiovisual", "sintesis"),
        os.path.join(raiz, "starseed_memory_root", "imaginacion", "agentes"),
        os.path.join(raiz, "starseed_memory_root", "informes"),
        os.path.join(raiz, "starseed_memory_root", "dream"),
        os.path.join(raiz, ".starseed", "actividad"),
    ]
    for d in dirs:
        os.makedirs(d, exist_ok=True)
    return raiz


def _escribir_sintesis(raiz, fecha, texto):
    """Escribe un archivo de síntesis en la carpeta correspondiente."""
    ruta = os.path.join(raiz, "starseed_memory_root", "produccion-audiovisual", "sintesis", f"{fecha}.md")
    with open(ruta, "w", encoding="utf-8") as f:
        f.write(texto)
    return ruta


def _escribir_imaginacion(raiz, agente, datos, mtime=None):
    """Escribe una salida de Imaginación."""
    ruta = os.path.join(raiz, "starseed_memory_root", "imaginacion", "agentes", f"{agente}.json")
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(datos, f)
    if mtime:
        os.utime(ruta, (mtime, mtime))
    return ruta


def _escribir_informe(raiz, subcarpeta, nombre, texto, mtime=None):
    """Escribe un informe en informes/ o dream/."""
    ruta = os.path.join(raiz, "starseed_memory_root", subcarpeta, nombre)
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, "w", encoding="utf-8") as f:
        f.write(texto)
    if mtime:
        os.utime(ruta, (mtime, mtime))
    return ruta


def _escribir_resumen(raiz, fecha, datos):
    """Escribe el resumen de actividad."""
    ruta = os.path.join(raiz, ".starseed", "actividad", f"resumen-{fecha}.json")
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(datos, f)
    return ruta


def test_sintesis_previas_vacio():
    """Sin síntesis previas devuelve lista vacía."""
    with tempfile.TemporaryDirectory() as tmp:
        _crear_estructura(tmp)
        res = sf.sintesis_previas(tmp, hoy="2026-11-11")
        assert res == []


def test_sintesis_previas_tres_mas_recientes():
    """Devuelve las 3 más recientes, de la más nueva a la más vieja."""
    with tempfile.TemporaryDirectory() as tmp:
        _crear_estructura(tmp)
        _escribir_sintesis(tmp, "2026-11-08", "# Síntesis\n## Mañana\n- Vídeos: Vídeo 1, Vídeo 2")
        _escribir_sintesis(tmp, "2026-11-09", "# Síntesis\n## Mañana\n- Vídeos: Vídeo 3, Vídeo 4")
        _escribir_sintesis(tmp, "2026-11-10", "# Síntesis\n## Mañana\n- Vídeos: Vídeo 5, Vídeo 6")
        _escribir_sintesis(tmp, "2026-11-11", "# Síntesis\n## Mañana\n- Vídeos: Vídeo 7, Vídeo 8")  # hoy, no debe incluirse si hoy=10
        res = sf.sintesis_previas(tmp, hoy="2026-11-10", limite=3)
        assert len(res) == 3
        assert [s["fecha"] for s in res] == ["2026-11-10", "2026-11-09", "2026-11-08"]


def test_sintesis_previas_filtra_por_fecha():
    """No incluye síntesis con fecha > hoy."""
    with tempfile.TemporaryDirectory() as tmp:
        _crear_estructura(tmp)
        _escribir_sintesis(tmp, "2026-11-12", "# Futura")
        _escribir_sintesis(tmp, "2026-11-10", "# Pasada")
        res = sf.sintesis_previas(tmp, hoy="2026-11-11")
        assert len(res) == 1
        assert res[0]["fecha"] == "2026-11-10"


def test_seccion_manana_extrae_correctamente():
    """Extrae el texto entre '## Mañana' y el siguiente encabezado."""
    texto = """# Título
## Mañana
- Vídeos: Vídeo 1, Vídeo 2
- Contactos: Ana, Luis
## Tarde
- Algo más"""
    extraida = sf.seccion_manana(texto)
    assert "Vídeos: Vídeo 1, Vídeo 2" in extraida
    assert "Contactos: Ana, Luis" in extraida
    assert "Tarde" not in extraida


def test_seccion_manana_sin_seccion():
    """Devuelve vacío si no hay sección Mañana."""
    texto = "# Título\n## Tarde\n- Algo"
    assert sf.seccion_manana(texto) == ""


def test_de_manana_parsea_videos_contactos_categorias():
    """Parsea correctamente las tres claves desde la sección Mañana."""
    manana = "- Vídeos: Vídeo 1, Vídeo 2\n- Contactos: Ana, Luis\n- Categorías: Diseño, Código"
    res = sf.de_manana(manana)
    assert res["videos"] == ["Vídeo 1", "Vídeo 2"]
    assert res["contactos"] == ["Ana", "Luis"]
    assert res["categorias"] == ["Diseño", "Código"]


def test_de_manana_case_insensitive_y_variaciones():
    """Acepta mayúsculas/minúsculas y variaciones (video/videos, categoría/categorías)."""
    manana = "- VIDEOS: V1\n- contactos: C1\n- CATEGORIA: Cat1"
    res = sf.de_manana(manana)
    assert res["videos"] == ["V1"]
    assert res["contactos"] == ["C1"]
    assert res["categorias"] == ["Cat1"]


def test_de_manana_ignora_lineas_no_validas():
    """Ignora líneas que no coinciden con el patrón."""
    manana = "- Vídeos: V1\n- Algo raro\n  - Contactos: C1"
    res = sf.de_manana(manana)
    assert res["videos"] == ["V1"]
    assert res["contactos"] == ["C1"]


def test_rotacion_sin_sintesis_previas_usa_defecto():
    """Sin síntesis previas, rotación empieza en vídeos 4 y 5 y contactos por defecto."""
    rot = sf.rotacion([], videos=[f"Vídeo {i}" for i in range(1, 16)], contactos=["A", "B", "C", "D"], categorias=["Cat1", "Cat2"])
    assert rot["videos"] == ["Vídeo 4", "Vídeo 5"]
    assert rot["contactos"] == ["A", "B", "C"][:3]
    assert rot["categorias"] == ["Cat1"][:1]


def test_rotacion_no_repite_videos_usados():
    """No repite vídeos que ya salieron en las 3 últimas Mañanas."""
    mananas = [
        {"videos": ["Vídeo 1", "Vídeo 2"], "contactos": [], "categorias": []},
        {"videos": ["Vídeo 3"], "contactos": [], "categorias": []},
        {"videos": ["Vídeo 15"], "contactos": [], "categorias": []},
    ]
    videos = [f"Vídeo {i}" for i in range(1, 16)]
    rot = sf.rotacion(mananas, videos=videos)
    assert "Vídeo 1" not in rot["videos"]
    assert "Vídeo 2" not in rot["videos"]
    assert "Vídeo 3" not in rot["videos"]
    assert "Vídeo 15" not in rot["videos"]
    assert len(rot["videos"]) == 2


def test_rotacion_no_repite_contactos_usados():
    """No repite contactos que ya salieron."""
    mananas = [
        {"videos": [], "contactos": ["Cole Hastings", "Sunseed"], "categorias": []},
        {"videos": [], "contactos": ["Damanhur"], "categorias": []},
    ]
    rot = sf.rotacion(mananas, contactos=["Cole Hastings", "Sunseed", "Damanhur", "Nuevo1", "Nuevo2"])
    assert "Cole Hastings" not in rot["contactos"]
    assert "Sunseed" not in rot["contactos"]
    assert "Damanhur" not in rot["contactos"]
    assert rot["contactos"] == ["Nuevo1", "Nuevo2"]


def test_rotacion_no_repite_categorias_usadas():
    """No repite categorías que ya salieron."""
    mananas = [{"videos": [], "contactos": [], "categorias": ["Diseño"]}]
    rot = sf.rotacion(mananas, categorias=["Diseño", "Código", "IA"])
    assert "Diseño" not in rot["categorias"]
    assert rot["categorias"] == ["Código"]


def test_salidas_imagenacion_ultimas_24h():
    """Solo devuelve salidas de Imaginación de las últimas 24h."""
    with tempfile.TemporaryDirectory() as tmp:
        _crear_estructura(tmp)
        ahora = datetime.now().timestamp()
        hace_12h = ahora - 12 * 3600
        hace_36h = ahora - 36 * 3600
        _escribir_imaginacion(tmp, "agente1", {"x": 1}, mtime=hace_12h)
        _escribir_imaginacion(tmp, "agente2", {"x": 2}, mtime=hace_36h)
        res = sf.salidas_imagenacion(tmp, ahora=ahora, horas=24)
        assert len(res) == 1
        assert res[0]["agente"] == "agente1"


def test_salidas_imagenacion_sin_filtro_si_no_hay_ahora():
    """Si no se pasa `ahora`, devuelve todas."""
    with tempfile.TemporaryDirectory() as tmp:
        _crear_estructura(tmp)
        _escribir_imaginacion(tmp, "a", {"x": 1})
        _escribir_imaginacion(tmp, "b", {"x": 2})
        res = sf.salidas_imagenacion(tmp, ahora=None)
        assert len(res) == 2


def test_informes_nuevos_ultimos_dias():
    """Devuelve informes de los últimos N días de informes/ y dream/."""
    with tempfile.TemporaryDirectory() as tmp:
        _crear_estructura(tmp)
        ahora = datetime.now().timestamp()
        hace_1d = ahora - 1 * 86400
        hace_3d = ahora - 3 * 86400
        _escribir_informe(tmp, "informes", "dir1.md", "Informe director 1", mtime=hace_1d)
        _escribir_informe(tmp, "informes", "dir2.md", "Informe director 2", mtime=hace_3d)
        _escribir_informe(tmp, "dream", "sueño1.md", "Sueño 1", mtime=hace_1d)
        res = sf.informes_nuevos(tmp, ahora=ahora, dias=2)
        assert len(res) == 2
        fechas = [r["fecha"] for r in res]
        assert all(f == datetime.fromtimestamp(hace_1d).strftime("%Y-%m-%d") for f in fechas)


def test_resumen_actividad_existente():
    """Lee el resumen de actividad si existe."""
    with tempfile.TemporaryDirectory() as tmp:
        casa = os.path.join(tmp, ".starseed", "actividad")
        os.makedirs(casa, exist_ok=True)
        _escribir_resumen(tmp, "2026-11-11", {"temas": ["mesh", "IA"]})
        res = sf.resumen_actividad(casa, "2026-11-11")
        assert res is not None
        assert res["temas"] == ["mesh", "IA"]


def test_resumen_actividad_no_existe():
    """Devuelve None si no existe el archivo."""
    with tempfile.TemporaryDirectory() as tmp:
        casa = os.path.join(tmp, ".starseed", "actividad")
        os.makedirs(casa, exist_ok=True)
        res = sf.resumen_actividad(casa, "2026-11-11")
        assert res is None


def test_contexto_integra_todo():
    """La función contexto() une todas las piezas."""
    with tempfile.TemporaryDirectory() as tmp:
        _crear_estructura(tmp)
        _escribir_sintesis(tmp, "2026-11-09", "## Mañana\n- Vídeos: V1, V2\n- Contactos: C1")
        _escribir_sintesis(tmp, "2026-11-10", "## Mañana\n- Vídeos: V3, V4\n- Contactos: C2")
        _escribir_imaginacion(tmp, "img1", {"idea": "algo"}, mtime=datetime.now().timestamp() - 3600)
        _escribir_informe(tmp, "informes", "dir.md", "Informe nuevo", mtime=datetime.now().timestamp() - 7200)
        casa = os.path.join(tmp, ".starseed", "actividad")
        os.makedirs(casa, exist_ok=True)
        _escribir_resumen(tmp, "2026-11-11", {"resumen": "día productivo"})
        ctx = sf.contexto(tmp, hoy="2026-11-11", ahora=datetime.now().timestamp(), casa=casa)
        assert ctx["fecha"] == "2026-11-11"
        assert len(ctx["sintesis_previas"]) == 2
        assert len(ctx["mananas"]) == 2
        assert "videos" in ctx["rotacion"]
        assert "contactos" in ctx["rotacion"]
        assert "categorias" in ctx["rotacion"]
        assert len(ctx["imaginacion"]) == 1
        assert len(ctx["informes"]) >= 1
        assert ctx["resumen_actividad"]["resumen"] == "día productivo"


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])