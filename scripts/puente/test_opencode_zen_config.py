# -*- coding: utf-8 -*-
"""Pruebas de opencode-zen_config (CAP1119): el bloque de Zen se declara sin secretos."""
import importlib.util
import json
import os

AQUI = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location(
    "opencode_zen_config", os.path.join(AQUI, "opencode-zen_config.py"))
assert _spec is not None and _spec.loader is not None
Z = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(Z)

CONFIG_COMPLETA, _ = Z.fusionar({})


def test_bloque_declara_los_cuatro_gratuitos_y_nada_mas():
    bloque = Z.bloque_proveedor()
    assert set(bloque["models"]) == set(Z.MODELOS_GRATIS)
    assert "options" not in bloque


def test_bloque_en_entorno_declara_la_variable_no_el_valor():
    bloque = Z.bloque_proveedor(con_entorno=True)
    assert bloque["options"]["apiKey"] == "{env:OPENCODE_API_KEY}"
    assert bloque["options"]["baseURL"] == Z.BASE_URL


def test_fusionar_crea_el_proveedor_sin_tocar_los_demas():
    original = {"provider": {"nvidia": {"models": {"x": {"name": "x"}}}}}
    nuevo, cambios = Z.fusionar(original)
    assert nuevo["provider"]["nvidia"] == original["provider"]["nvidia"]
    assert "opencode" in nuevo["provider"]
    assert cambios


def test_fusionar_no_muta_la_entrada():
    original = {"provider": {}}
    Z.fusionar(original)
    assert original == {"provider": {}}


def test_fusionar_es_idempotente():
    nuevo, cambios = Z.fusionar(CONFIG_COMPLETA)
    assert cambios == []
    assert nuevo == CONFIG_COMPLETA


def test_fusionar_no_pisa_un_modelo_ya_declarado():
    original = {"provider": {"opencode": {"models": {"big-pickle": {"name": "Mío"}}}}}
    nuevo, _ = Z.fusionar(original)
    assert nuevo["provider"]["opencode"]["models"]["big-pickle"]["name"] == "Mío"


def test_fusionar_no_pisa_una_clave_existente():
    original = {"provider": {"opencode": {"options": {"apiKey": "{env:OTRA}"}}}}
    nuevo, cambios = Z.fusionar(original, con_entorno=True)
    assert nuevo["provider"]["opencode"]["options"]["apiKey"] == "{env:OTRA}"
    assert "opencode.options.apiKey" not in cambios


def test_fusionar_en_entorno_rellena_lo_que_falta():
    nuevo, _ = Z.fusionar({}, con_entorno=True)
    assert nuevo["provider"]["opencode"]["options"]["apiKey"] == "{env:OPENCODE_API_KEY}"


def test_modelos_faltantes_detecta_solo_los_que_faltan():
    config = {"provider": {"opencode": {"models": {"big-pickle": {}}}}}
    assert set(Z.modelos_faltantes(config)) == set(Z.MODELOS_GRATIS) - {"big-pickle"}
    assert set(Z.modelos_faltantes({})) == set(Z.MODELOS_GRATIS)


def test_modelos_faltantes_aguanta_una_config_rara():
    assert set(Z.modelos_faltantes({"provider": {"opencode": "x"}})) == set(Z.MODELOS_GRATIS)
    assert set(Z.modelos_faltantes({"provider": "x"})) == set(Z.MODELOS_GRATIS)
    assert set(Z.modelos_faltantes(None)) == set(Z.MODELOS_GRATIS)


def test_clave_en_el_entorno_o_en_auth():
    assert Z.clave_presente({"OPENCODE_API_KEY": "x"}, {}, ())
    assert Z.clave_presente({}, {"opencode": {"type": "api"}}, ())
    assert not Z.clave_presente({"OPENCODE_API_KEY": "  "}, {}, ())


def test_clave_en_los_archivos_y_la_linea_vacia_no_cuenta():
    assert Z.clave_presente({}, {}, ["export OPENCODE_API_KEY=abc\n"])
    assert not Z.clave_presente({}, {}, ["OPENCODE_API_KEY=\n"])
    assert not Z.clave_presente({}, {}, ['OPENCODE_API_KEY=""\n'])


def test_estado_listo_requiere_config_y_clave():
    assert Z.estado(CONFIG_COMPLETA, True)["estado"] == "listo"
    assert Z.estado(CONFIG_COMPLETA, False)["estado"] == "requiere_alex"
    assert Z.estado({}, True)["estado"] == "usable"
    assert Z.estado({}, False)["estado"] == "requiere_alex"


def test_sin_opencode_no_esta_disponible():
    parte = Z.estado(CONFIG_COMPLETA, True, instalado=False)
    assert parte["estado"] == "no_disponible"
    assert "npm install" in parte["siguiente_paso"]


def test_aplicar_escribe_el_bloque_en_modo_sesion(tmp_path):
    ruta = tmp_path / "opencode.json"
    parte = Z.aplicar(str(ruta), str(tmp_path / "auth.json"), [], entorno={}, instalado=True)
    assert parte["ok"]
    datos = json.loads(ruta.read_text())
    assert "opencode" in datos["provider"]
    assert "options" not in datos["provider"]["opencode"]


def test_aplicar_en_modo_entorno_no_escribe_el_valor_de_la_clave(tmp_path):
    env = tmp_path / "env"
    env.write_text("OPENCODE_API_KEY=fake-clave-de-mentira\n")
    ruta = tmp_path / "opencode.json"
    Z.aplicar(str(ruta), str(tmp_path / "auth.json"), [str(env)], entorno={}, instalado=True)
    texto = ruta.read_text()
    assert "{env:OPENCODE_API_KEY}" in texto
    assert "fake-clave-de-mentira" not in texto


def test_aplicar_prefiere_la_sesion_de_auth_json(tmp_path):
    env = tmp_path / "env"
    env.write_text("OPENCODE_API_KEY=fake-clave\n")
    auth = tmp_path / "auth.json"
    auth.write_text(json.dumps({"opencode": {"type": "api"}}))
    ruta = tmp_path / "opencode.json"
    Z.aplicar(str(ruta), str(auth), [str(env)], entorno={}, instalado=True)
    assert "options" not in json.loads(ruta.read_text())["provider"]["opencode"]


def test_aplicar_no_sobrescribe_un_json_roto(tmp_path):
    ruta = tmp_path / "opencode.json"
    ruta.write_text("{roto")
    parte = Z.aplicar(str(ruta), str(tmp_path / "auth.json"), [], entorno={}, instalado=True)
    assert not parte["ok"]
    assert ruta.read_text() == "{roto"


def test_aplicar_dos_veces_no_cambia_nada(tmp_path):
    ruta = tmp_path / "opencode.json"
    args = (str(ruta), str(tmp_path / "auth.json"), [])
    Z.aplicar(*args, entorno={}, instalado=True)
    parte = Z.aplicar(*args, entorno={}, instalado=True)
    assert parte["cambios"] == []


def test_aplicar_respalda_antes_de_cambiar(tmp_path):
    ruta = tmp_path / "opencode.json"
    original = '{"provider": {"nvidia": {}}}'
    ruta.write_text(original)
    Z.aplicar(str(ruta), str(tmp_path / "auth.json"), [], entorno={}, instalado=True)
    assert (tmp_path / "opencode.json.bak").read_text() == original


def test_informe_listo_con_auth_sin_tocar_el_disco(tmp_path):
    ruta = tmp_path / "opencode.json"
    ruta.write_text(json.dumps(CONFIG_COMPLETA))
    auth = tmp_path / "auth.json"
    auth.write_text(json.dumps({"opencode": {"type": "api"}}))
    parte = Z.informe(str(ruta), str(auth), [], entorno={}, instalado=True)
    assert parte["estado"] == "listo"
