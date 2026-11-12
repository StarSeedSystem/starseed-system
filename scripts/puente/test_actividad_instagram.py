#!/usr/bin/env python3
"""Pruebas para actividad_instagram.py (SDP1111I)."""
import json
import os
import tempfile
import zipfile
from pathlib import Path

import actividad_instagram as mod


def _crear_zip_temporal(nombre_zip, datos_posts, datos_collections=None):
    """Crea un zip temporal con la estructura de exportación de Instagram."""
    with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as f:
        ruta_zip = f.name
    with zipfile.ZipFile(ruta_zip, "w") as z:
        z.writestr("saved_posts.json", json.dumps(datos_posts))
        if datos_collections:
            z.writestr("saved_collections.json", json.dumps(datos_collections))
    return ruta_zip


def _datos_post_basico(enlace="https://instagram.com/p/ABC123/", autor="usuario_test", fecha=1700000000):
    return {
        "saved_saved_post": [{
            "title": "Post de prueba",
            "href": enlace,
            "author": autor,
            "saved_date": fecha
        }]
    }


def test_sanitiza_cuenta_evita_path_traversal():
    """La cuenta extraída del nombre del zip se sanitiza: nada de ../ ni caracteres peligrosos."""
    with tempfile.TemporaryDirectory() as tmp:
        dir_entr = Path(tmp) / "entrada" / "instagram"
        dir_entr.mkdir(parents=True)
        dir_act = Path(tmp) / "actividad"
        dir_act.mkdir(parents=True)

        # Zip con nombre que intenta path traversal
        zip_malicioso = dir_entr / "instagram-..-2024-01-15-abc123.zip"
        with zipfile.ZipFile(zip_malicioso, "w") as z:
            z.writestr("saved_posts.json", json.dumps(_datos_post_basico()))

        resultado = mod.leer(dirs=[str(dir_entr)], dir_actividad=str(dir_act))
        # No debe crear archivos fuera de dir_act/fichas
        archivos_fichas = list((dir_act / "fichas").glob("*.json"))
        assert len(archivos_fichas) == 1
        # El nombre del archivo no debe contener ..
        assert ".." not in archivos_fichas[0].name


def test_sanitiza_cuenta_caracteres_especiales():
    """Cuenta con caracteres especiales (espacios, barras, dos puntos) se sanitiza."""
    # Prueba directa de la función de sanitizado
    assert mod._sanitizar_cuenta("usuario/con:espacios") == "usuario_con_espacios"
    assert mod._sanitizar_cuenta("cuenta con espacios") == "cuenta_con_espacios"
    assert mod._sanitizar_cuenta("cuenta@dominio.com") == "cuenta_dominio.com"
    assert mod._sanitizar_cuenta("../maliciosa") == "desconocida"
    assert mod._sanitizar_cuenta("") == "desconocida"
    assert mod._sanitizar_cuenta(".") == "desconocida"
    assert mod._sanitizar_cuenta("..") == "desconocida"
    assert mod._sanitizar_cuenta(".oculta") == "desconocida"
    # Límite de 64 caracteres
    assert len(mod._sanitizar_cuenta("a" * 100)) == 64

    # Integración: zip con nombre válido pero cuenta extraída con caracteres problemáticos
    # (simulamos que el split extrae una cuenta con caracteres raros)
    with tempfile.TemporaryDirectory() as tmp:
        dir_entr = Path(tmp) / "entrada" / "instagram"
        dir_entr.mkdir(parents=True)
        dir_act = Path(tmp) / "actividad"
        dir_act.mkdir(parents=True)

        # Zip con nombre válido según ZIP_OK, pero la cuenta extraída tendría guiones bajos
        # que el split normal manejaría; testamos sanitizado directo arriba
        zip_valido = dir_entr / "instagram-usuario_con_espacios-2024-01-15-abc123.zip"
        with zipfile.ZipFile(zip_valido, "w") as z:
            z.writestr("saved_posts.json", json.dumps(_datos_post_basico()))

        resultado = mod.leer(dirs=[str(dir_entr)], dir_actividad=str(dir_act))
        archivos_fichas = list((dir_act / "fichas").glob("*.json"))
        assert len(archivos_fichas) == 1
        nombre = archivos_fichas[0].name
        # La cuenta sanitizada aparece en el nombre del archivo
        assert "usuario_con_espacios" in nombre


def test_archivo_unico_por_ejecucion_mismo_dia_misma_cuenta():
    """Dos ejecuciones el mismo día para la misma cuenta NO sobrescriben: genera nombre único."""
    with tempfile.TemporaryDirectory() as tmp:
        dir_entr = Path(tmp) / "entrada" / "instagram"
        dir_entr.mkdir(parents=True)
        dir_act = Path(tmp) / "actividad"
        dir_act.mkdir(parents=True)

        zip1 = dir_entr / "instagram-maggasukha-2024-01-15-abc123.zip"
        with zipfile.ZipFile(zip1, "w") as z:
            z.writestr("saved_posts.json", json.dumps(_datos_post_basico(enlace="https://instagram.com/p/POST1/")))

        # Primera ejecución
        mod.leer(dirs=[str(dir_entr)], dir_actividad=str(dir_act))
        archivos_1 = list((dir_act / "fichas").glob("*.json"))
        assert len(archivos_1) == 1
        nombre_1 = archivos_1[0].name

        # Segunda ejecución mismo día, misma cuenta, datos distintos
        zip2 = dir_entr / "instagram-maggasukha-2024-01-15-def456.zip"
        with zipfile.ZipFile(zip2, "w") as z:
            z.writestr("saved_posts.json", json.dumps(_datos_post_basico(enlace="https://instagram.com/p/POST2/")))

        mod.leer(dirs=[str(dir_entr)], dir_actividad=str(dir_act))
        archivos_2 = list((dir_act / "fichas").glob("*.json"))
        # Debe haber DOS archivos, no uno sobrescrito
        assert len(archivos_2) == 2
        nombres = {f.name for f in archivos_2}
        assert nombre_1 in nombres
        # El segundo debe tener nombre distinto (ej. con sufijo único)
        assert any(n != nombre_1 for n in nombres)


def test_incremental_por_enlace():
    """Solo se guardan fichas nuevas por enlace; las repetidas se ignoran."""
    with tempfile.TemporaryDirectory() as tmp:
        dir_entr = Path(tmp) / "entrada" / "instagram"
        dir_entr.mkdir(parents=True)
        dir_act = Path(tmp) / "actividad"
        dir_act.mkdir(parents=True)

        zip1 = dir_entr / "instagram-maggasukha-2024-01-15-abc123.zip"
        datos = _datos_post_basico(enlace="https://instagram.com/p/REPETIDO/")
        with zipfile.ZipFile(zip1, "w") as z:
            z.writestr("saved_posts.json", json.dumps(datos))

        # Primera pasada
        r1 = mod.leer(dirs=[str(dir_entr)], dir_actividad=str(dir_act))
        assert len(r1["fichas"]) == 1

        # Segunda pasada con el MISMO zip (mismos enlaces)
        r2 = mod.leer(dirs=[str(dir_entr)], dir_actividad=str(dir_act))
        assert len(r2["fichas"]) == 0  # Nada nuevo


def test_archivos_sueltos_sin_zip():
    """Lee saved_posts.json y saved_collections.json sueltos en el directorio de entrada."""
    with tempfile.TemporaryDirectory() as tmp:
        dir_entr = Path(tmp) / "entrada" / "instagram"
        dir_entr.mkdir(parents=True)
        dir_act = Path(tmp) / "actividad"
        dir_act.mkdir(parents=True)

        (dir_entr / "saved_posts.json").write_text(json.dumps(_datos_post_basico()))
        (dir_entr / "saved_collections.json").write_text(json.dumps({
            "saved_collections": [{
                "name": "Mi colección",
                "media_list_data": [{
                    "href": "https://instagram.com/p/COL1/",
                    "author": "coleccionista",
                    "saved_date": 1700000000
                }]
            }]
        }))

        resultado = mod.leer(dirs=[str(dir_entr)], dir_actividad=str(dir_act))
        assert len(resultado["fichas"]) == 2  # 1 post + 1 colección
        assert any(f["tipo"] == "guardado" for f in resultado["fichas"])
        assert any(f["tipo"] == "coleccion" for f in resultado["fichas"])


if __name__ == "__main__":
    import sys
    import subprocess
    # Ejecutar con pytest para salida clara
    sys.exit(subprocess.call(["pytest", "-v", __file__]))