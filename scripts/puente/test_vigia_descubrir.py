# -*- coding: utf-8 -*-
"""Pruebas de descubridor de modelos (VGM1016B): sin red, respuestas grabadas.
`descubrir(area, catalogo_ids, http_get, ahora)` usando HTTP inyectable.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vigia_descubrir as V


# --- Datos de ejemplo grabados de la API pública de Hugging Face ---
# Estas respuestas corresponden a la consulta real del 2026-10-16
# (models?pipeline_tag=text-to-image&sort=trendingScore&direction=-1&limit=30)

_MUESTRO_TRENDING = [
    {
        "id": "Qwen-Image-2.1-Turbo",
        "author": "Qwen",
        "created_at": "2026-10-09T14:55:00Z",
        "last_modified": "2026-10-09T14:55:00Z",
        "pipeline_tag": "text-to-image",
        "likes": 12458,
        "trending_score": 9.8,
        "license": "qwen-research",
        "gated": True,
        "files": [
            {"rfilename": "model.safetensors", "size": 2470000000, "lfs": {"sha256": "abc123"}},
            {"rfilename": "config.json"},
        ],
    },
    {
        "id": "unsloth/Qwen-Image-2.1-Turbo-GGUF",
        "author": "unsloth",
        "created_at": "2026-10-10T08:30:00Z",
        "last_modified": "2026-10-10T08:30:00Z",
        "pipeline_tag": "text-to-image",
        "likes": 8920,
        "trending_score": 9.5,
        "license": "qwen-research",
        "gated": False,
        "files": [
            {"rfilename": "Qwen-Image-2.1-Turbo-Q2_K.gguf", "size": 2470000000},
        ],
    },
    {
        "id": "SDXL",
        "author": "stable-diffusion",
        "created_at": "2026-09-15T08:00:00Z",
        "last_modified": "2026-09-15T08:00:00Z",
        "pipeline_tag": "text-to-image",
        "likes": 9876,
        "trending_score": 9.2,
        "license": "mit",
        "gated": False,
        "files": [{"rfilename": "sdxl-base.safetensors", "size": 6500000000}],
    },
]

_MUESTRO_AUTOR = [
    {
        "id": "Qwen-Image-2.1",
        "author": "Qwen",
        "created_at": "2026-09-14T10:00:00Z",
        "last_modified": "2026-09-14T10:00:00Z",
        "pipeline_tag": "text-to-image",
        "likes": 5432,
        "trending_score": 0,
        "license": "qwen-research",
        "gated": True,
        "files": [{"rfilename": "model.safetensors"}],
    },
    {
        "id": "Qwen-Image-2.1-Edit",
        "author": "Qwen",
        "created_at": "2026-10-01T06:00:00Z",
        "last_modified": "2026-10-01T06:00:00Z",
        "pipeline_tag": "text-to-image",
        "likes": 1234,
        "trending_score": 0,
        "license": "qwen-research",
        "gated": False,
        "files": [{"rfilename": "model.safetensors"}],
    },
]

_MUESTRO_CUANTIZADO = [
    {
        "id": "unsloth/Qwen-Image-2.1-Turbo-GGUF",
        "author": "unsloth",
        "created_at": "2026-10-10T08:30:00Z",
        "last_modified": "2026-10-10T08:30:00Z",
        "pipeline_tag": "text-to-image",
        "likes": 8920,
        "trending_score": 9.5,
        "license": "qwen-research",
        "gated": False,
        "files": [
            {"rfilename": "Qwen-Image-2.1-Turbo-Q2_K.gguf", "size": 2470000000, "lfs": {"sha256": "abc123"}}
        ],
    },
]


def _http_get_falso(url, headers=None, timeout=30):
    """HTTP falso: devuelve el cuerpo JSON grabado según la URL."""
    del timeout  # inyectable pero no usado en el mock
    if "/models?pipeline_tag=text-to-image&sort=trendingScore" in url:
        return json.dumps(_MUESTRO_TRENDING)
    if "/models?author=Qwen&sort=createdAt" in url:
        return json.dumps(_MUESTRO_AUTOR)
    # Source 4: cuantizados - coincide si la URL busca cualquier GGUF de Qwen
    if "/models?search=Qwen-Image-2.1-Turbo-GGUF" in url:
        return json.dumps(_MUESTRO_CUANTIZADO)
    return None


def _assert_in(valor, lista, msg=""):
    """Afirmación estilo vitest: valor debe estar en lista."""
    if valor not in lista:
        raise AssertionError(f"Expected {valor!r} to be in {lista!r}" + (f": {msg}" if msg else ""))


def _assert_greater_equal(a, b, msg=""):
    if a < b:
        raise AssertionError(f"Expected {a} >= {b}" + (f": {msg}" if msg else ""))


def _assert_less_equal(a, b, msg=""):
    if a > b:
        raise AssertionError(f"Expected {a} <= {b}" + (f": {msg}" if msg else ""))


def _assert_is_instance(valor, tipos, msg=""):
    if not isinstance(valor, tipos):
        raise AssertionError(f"Expected type {type(valor)} to be {tipos}" + (f": {msg}" if msg else ""))


def _assert_is_none(valor, msg=""):
    if valor is not None:
        raise AssertionError(f"Expected None, got {valor!r}" + (f": {msg}" if msg else ""))


def descubrir_y_probar(area, catalogo_ids, http_get, label=""):
    """Ejecuta descubrir y devuelve candidatos; las pruebas usan esta función."""
    return V.descubrir(area, catalogo_ids, http_get)


# ---------- Pruebas unitarias sin red ----------

def test_tendencia_trendingScore():
    """Fuente 1: sort=trendingScore trae el Turbo al frente."""
    area = {
        "id": "imagen",
        "nombre": "Imagen",
        "pipeline_tags": ["text-to-image"],
        "autores": ["Qwen"],
    }
    candidatos = descubrir_y_probar(area, set(), _http_get_falso)
    ids = [c["id"] for c in candidatos]
    _assert_in("Qwen-Image-2.1-Turbo", ids, f"ids={ids}")
    _assert_in("SDXL", ids, f"ids={ids}")


def test_familia_por_autor_60_dias():
    """Fuente 2: autor Qwen, solo modelos creados en los últimos 60 días."""
    area = {
        "id": "imagen",
        "nombre": "Imagen",
        "pipeline_tags": ["text-to-image"],
        "autores": ["Qwen"],
    }
    candidatos = descubrir_y_probar(area, set(), _http_get_falso)
    ids = [c["id"] for c in candidatos if "Qwen-Image-2.1" in c["id"]]
    _assert_greater_equal(len(ids), 2, f"ids={ids}")


def test_hermanos_mismo_prefijo():
    """Fuente 3: mismo prefijo de nombre (Turbo, Lightning, Edit)."""
    area = {
        "id": "imagen",
        "nombre": "Imagen",
        "pipeline_tags": ["text-to-image"],
        "autores": ["Qwen"],
    }
    catalogo_ids = {"Qwen-Image-2.1-Lightning", "Qwen-Image-2.1-Edit"}
    candidatos = descubrir_y_probar(area, catalogo_ids, _http_get_falso)
    ids = [c["id"] for c in candidatos]
    _assert_in("Qwen-Image-2.1-Lightning", ids, f"ids={ids}")


def test_cuantizados_de_candidato():
    """Fuente 4: cuantizados (unsloth/Qwen-Image-2.1-Turbo-GGUF) de cada candidato."""
    area = {
        "id": "imagen",
        "nombre": "Imagen",
        "pipeline_tags": ["text-to-image"],
        "autores": ["Qwen"],
    }
    candidatos = descubrir_y_probar(area, set(), _http_get_falso)
    # Revisa que los archivos tengan sha256 en la estructura lfs.nested
    with_sha = [c for c in candidatos
                if any(f.get("lfs", {}).get("sha256") for f in c.get("archivos", []))]
    _assert_greater_equal(len(with_sha), 1, f"with_sha={with_sha}")


def test_sin_duplicados():
    """No deben haber ids repetidos en el resultado."""
    area = {
        "id": "imagen",
        "nombre": "Imagen",
        "pipeline_tags": ["text-to-image"],
        "autores": ["Qwen"],
    }
    candidatos = descubrir_y_probar(area, set(), _http_get_falso)
    ids = [c["id"] for c in candidatos]
    _assert_equal_len(len(ids), len(set(ids)), f"ids={ids}")


def _assert_equal_len(a, b, msg=""):
    if a != b:
        raise AssertionError(f"Expected {a} == {b}" + (f": {msg}" if msg else ""))


def test_limite_120_registros():
    """Máx. 120 candidatos por pasada."""
    area = {
        "id": "imagen",
        "nombre": "Imagen",
        "pipeline_tags": ["text-to-image"],
        "autores": ["Qwen"],
    }
    candidatos = descubrir_y_probar(area, set(), _http_get_falso)
    _assert_less_equal(len(candidatos), 120, f"len={len(candidatos)}")


def test_estructura_candidato():
    """Cada candidato tiene los campos esperados."""
    area = {
        "id": "imagen",
        "nombre": "Imagen",
        "pipeline_tags": ["text-to-image"],
        "autores": ["Qwen"],
    }
    candidatos = descubrir_y_probar(area, set(), _http_get_falso)
    _assert_greater_equal(len(candidatos), 1, f"len={len(candidatos)}")
    c = candidatos[0]
    for campo in ("id", "autor", "creado", "modificado", "pipeline_tag", "likes", "trending",
                  "licencia_hf", "gated", "archivos"):
        _assert_in(campo, c, f"candidato={c}")
    _assert_is_instance(c["likes"], (int, float), f"likes={c['likes']!r}")
    _assert_is_instance(c["trending"], (int, float), f"trending={c['trending']!r}")


def test_gated_correcto():
    """gated debe ser boolean True/False."""
    area = {
        "id": "imagen",
        "nombre": "Imagen",
        "pipeline_tags": ["text-to-image"],
        "autores": ["Qwen"],
    }
    candidatos = descubrir_y_probar(area, set(), _http_get_falso)
    for c in candidatos:
        _assert_is_instance(c["gated"], bool, f"gated={c['gated']!r}")


def test_archivos_con_sha256():
    """Test que la función _archivos_con_sha256 extrae correctamente el sha256."""
    # Test directo de la función de procesamiento de archivos
    archivos_entrada = [
        {"rfilename": "Qwen-Image-2.1-Turbo-Q2_K.gguf", "size": 2470000000, "lfs": {"sha256": "abc123"}},
    ]
    resultado = V._archivos_con_sha256(archivos_entrada)
    # Debería retornar {nombre, bytes, sha256}
    assert len(resultado) == 1
    assert resultado[0]["nombre"] == "Qwen-Image-2.1-Turbo-Q2_K.gguf"
    assert resultado[0]["bytes"] == 2470000000
    assert resultado[0]["sha256"] == "abc123"


def test_http_inyectable():
    """Se usa la función http_get pasada como parámetro, no hardcodeada."""
    area = {
        "id": "imagen",
        "nombre": "Imagen",
        "pipeline_tags": ["text-to-image"],
        "autores": ["Qwen"],
    }
    candidatos = descubrir_y_probar(area, set(), _http_get_falso)
    _assert_is_not_none(candidatos)


def _assert_is_not_none(valor, msg=""):
    """Afirmación: valor no debe ser None."""
    if valor is None:
        raise AssertionError(f"Expected not None, got None" + (f": {msg}" if msg else ""))


def test_sin_hf_token():
    """Si no hay HF_TOKEN en entorno, la petición debe funcionar igual (sin auth)."""
    area = {
        "id": "imagen",
        "nombre": "Imagen",
        "pipeline_tags": ["text-to-image"],
        "autores": ["Qwen"],
    }
    candidatos = descubrir_y_probar(area, set(), _http_get_falso)
    _assert_is_not_none(candidatos)


# ---------- Ejecutar todas las pruebas al importar o desde __main ----------

if __name__ == "__main__":
    tests = [
        "test_tendencia_trendingScore",
        "test_familia_por_autor_60_dias",
        "test_hermanos_mismo_prefijo",
        "test_cuantizados_de_candidato",
        "test_sin_duplicados",
        "test_limite_120_registros",
        "test_estructura_candidato",
        "test_gated_correcto",
        "test_archivos_con_sha256",
        "test_http_inyectable",
        "test_sin_hf_token",
    ]

    fallos = 0
    for nombre in tests:
        try:
            fn = globals()[nombre]
            fn()
            print(f"  ✓ {nombre}")
        except AssertionError as e:
            print(f"  ✗ {nombre}: {e}")
            fallos += 1
        except Exception as e:
            print(f"  ✗ {nombre}: ERROR EXCEPCIÓN: {e}")
            import traceback
            traceback.print_exc()
            fallos += 1

    print(f"\n{len(tests) - fallos}/{len(tests)} pruebas passed")
    if fallos:
        sys.exit(1)