# -*- coding: utf-8 -*-
"""Pruebas de opencode-zen_config: configurar Zen sin claves en claro (CAP1119).

Se importa con importlib porque el archivo lleva guion en el nombre (el puente lo ejecuta
tal cual). Todo lo de configuración es puro; el disco solo aparece en `detectar_clave`,
`leer_config` y `main`, y las pruebas de disco usan archivos temporales.
"""

import importlib.util
import json
import os

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "opencode-zen_config.py")
ESPEC = importlib.util.spec_from_file_location("opencode_zen_config", RUTA)
assert ESPEC is not None and ESPEC.loader is not None
zen = importlib.util.module_from_spec(ESPEC)
ESPEC.loader.exec_module(zen)

GRATIS = ["glm-5.3-flash-free", "deepseek-v4.1-flash-free",
          "minimax-m3.1-flash-free", "big-pickle"]


def test_bloque_zen_solo_modelos_gratuitos():
    b = zen.bloque_zen(con_clave=True)
    assert list(b["models"]) == GRATIS
    for m in b["models"]:
        assert m.endswith("-free") or m == "big-pickle"


def test_bloque_zen_usa_solo_la_sintaxis_de_entorno():
    b = zen.bloque_zen(con_clave=True)
    assert b["options"]["apiKey"] == "{env:OPENCODE_API_KEY}"


def test_bloque_sin_clave_no_inventa_api_key():
    b = zen.bloque_zen(con_clave=False)
    assert "apiKey" not in (b.get("options") or {})


def test_fusionar_config_vacia_crea_proveedor():
    nuevo, cambiado = zen.fusionar({}, con_clave=True)
    assert cambiado is True
    assert list(nuevo["provider"]["opencode"]["models"]) == GRATIS
    assert nuevo["provider"]["opencode"]["options"]["apiKey"] == "{env:OPENCODE_API_KEY}"


def test_fusionar_es_idempotente_y_no_muta():
    original = {}
    primero, c1 = zen.fusionar(original, con_clave=True)
    assert c1 is True
    assert original == {}
    segundo, c2 = zen.fusionar(primero, con_clave=True)
    assert c2 is False
    assert segundo == primero


def test_fusionar_conserva_otros_proveedores_y_modelos():
    cfg = {"provider": {"nvidia": {"options": {"apiKey": "{env:NVIDIA_API_KEY}"}},
                        "opencode": {"models": {"otro": {"name": "Otro"}}}}}
    nuevo, cambiado = zen.fusionar(cfg, con_clave=False)
    assert cambiado is True
    assert "nvidia" in nuevo["provider"]
    assert "otro" in nuevo["provider"]["opencode"]["models"]
    assert "big-pickle" in nuevo["provider"]["opencode"]["models"]


def test_fusionar_no_deja_clave_en_claro():
    cfg = {"provider": {"opencode": {"options": {"apiKey": "oc_sk_real"}}}}
    nuevo, _ = zen.fusionar(cfg, con_clave=True)
    assert nuevo["provider"]["opencode"]["options"]["apiKey"] == "{env:OPENCODE_API_KEY}"
    sin_clave, _ = zen.fusionar(cfg, con_clave=False)
    assert sin_clave["provider"]["opencode"]["options"]["apiKey"] == "sin-clave"


def test_estado_listo_con_clave_y_modelos():
    cfg, _ = zen.fusionar({}, con_clave=True)
    e = zen.estado(cfg, con_clave=True)
    assert e["configurado"] is True
    assert e["con_clave"] is True
    assert e["listo"] is True
    assert e["faltan"] == []
    assert e["siguiente_paso"] == ""


def test_estado_sin_clave_pide_login_o_variable():
    cfg, _ = zen.fusionar({}, con_clave=False)
    e = zen.estado(cfg, con_clave=False)
    assert e["listo"] is False
    assert "OPENCODE_API_KEY" in e["siguiente_paso"]
    assert "opencode auth login" in e["siguiente_paso"]


def test_estado_sin_modelos_dice_que_faltan():
    e = zen.estado({}, con_clave=True)
    assert e["configurado"] is False
    assert e["listo"] is False
    assert e["faltan"]


def test_detectar_clave_por_entorno():
    assert zen.detectar_clave({"OPENCODE_API_KEY": "x"}, archivos=()) is True
    assert zen.detectar_clave({}, archivos=()) is False


def test_detectar_clave_por_auth_json(tmp_path):
    auth = tmp_path / "auth.json"
    auth.write_text(json.dumps({"opencode": {"type": "api"}}), encoding="utf-8")
    assert zen.detectar_clave({}, ruta_auth=str(auth), archivos=()) is True


def test_detectar_clave_por_archivo_de_entorno(tmp_path):
    archivo = tmp_path / "env"
    archivo.write_text("OTRA=1\nOPENCODE_API_KEY=abc\n", encoding="utf-8")
    vacio = tmp_path / "vacio"
    vacio.write_text("OPENCODE_API_KEY=\n", encoding="utf-8")
    assert zen.detectar_clave({}, archivos=(str(archivo),)) is True
    assert zen.detectar_clave({}, archivos=(str(vacio),)) is False


def test_main_escribe_y_no_toca_la_clave(tmp_path):
    ruta = tmp_path / "opencode.json"
    codigo = zen.main(["--ruta", str(ruta)], entorno={"OPENCODE_API_KEY": "x"})
    assert codigo == 0
    texto = ruta.read_text(encoding="utf-8")
    datos = json.loads(texto)
    assert datos["provider"]["opencode"]["options"]["apiKey"] == "{env:OPENCODE_API_KEY}"
    assert list(datos["provider"]["opencode"]["models"]) == GRATIS
    assert "oc_sk" not in texto


def test_main_check_no_escribe(tmp_path):
    ruta = tmp_path / "opencode.json"
    codigo = zen.main(["--ruta", str(ruta), "--check"], entorno={"OPENCODE_API_KEY": "x"})
    assert codigo == 1
    assert not ruta.exists()


def test_main_sin_clave_escribe_sin_api_key(tmp_path):
    ruta = tmp_path / "opencode.json"
    codigo = zen.main(["--ruta", str(ruta)], entorno={}, archivos=())
    assert codigo == 1
    datos = json.loads(ruta.read_text(encoding="utf-8"))
    assert list(datos["provider"]["opencode"]["models"]) == GRATIS
    assert "apiKey" not in (datos["provider"]["opencode"].get("options") or {})


def test_main_es_idempotente(tmp_path):
    ruta = tmp_path / "opencode.json"
    zen.main(["--ruta", str(ruta)], entorno={"OPENCODE_API_KEY": "x"})
    primero = ruta.read_text(encoding="utf-8")
    codigo = zen.main(["--ruta", str(ruta)], entorno={"OPENCODE_API_KEY": "x"})
    assert codigo == 0
    assert ruta.read_text(encoding="utf-8") == primero
