#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas sin red de SDP1111P: relevo del bot del Puente, cliente OAuth del OS,
fichas authorized_user de ~/.starseed/cuentas y avisos de caducidad."""
import json
import os
import sys
import urllib.parse

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import cuentas_google as C  # noqa: E402
import cuentas_google_env as E  # noqa: E402
import sintesis_telegram as S  # noqa: E402

FECHA = "2026-11-12"


def romper(*_a, **_k):  # noqa: E302
    raise AssertionError("no debía llamarse")


def pedir_telegram(registro, codigo=200, datos=None):
    """Pedir falsa de la API de bots de Telegram (código, datos), registrada."""
    respuesta = datos if datos is not None else {"ok": True}

    def pedir(url, cuerpo=None):
        registro.append((url, cuerpo))
        return codigo, respuesta

    return pedir


def pedir_oauth(registro, respuesta):
    """Pedir falsa del intercambio OAuth de Google (dict), registrada."""

    def pedir(url, datos):
        registro.append((url, datos))
        return respuesta

    return pedir


def ficha_authorized_user(alias="alex", correo="alexbordongarrigos@gmail.com"):
    """Formato authorized_user de google-auth que dejó la herramienta alta-cuentas-google.py."""
    return {"alias": alias, "correo": correo, "client_id": "cid-escritorio",
            "client_secret": "secreto-escritorio", "refresh_token": "ref-%s" % alias,
            "token_uri": E.TOKEN_URL,
            "scopes": ["https://www.googleapis.com/auth/drive.file"]}


PUENTE = {"TELEGRAM_BOT_TOKEN": "tok-puente", "TELEGRAM_CHAT_ID": "111"}


class TestRelevoBotPuente:
    """Sin TELEGRAM_SINTESIS_BOT_TOKEN, la síntesis sale por el bot ya conectado."""

    def test_relevo_con_cabecera_y_fecha(self):
        env = dict(PUENTE, TELEGRAM_SINTESIS_CHAT_ID="8670436815")
        registro = []
        r = S.enviar("texto del día", pedir=pedir_telegram(registro),
                     leer_env=lambda: env, fecha=FECHA)
        assert r == {"ok": True, "trozos": 1, "chat_id": "8670436815"}
        url, cuerpo = registro[0]
        assert url.endswith("/bottok-puente/sendMessage")
        text = json.loads(cuerpo.decode("utf-8"))["text"]
        assert text.startswith("Síntesis de Producción StarSeed · 2026-11-12\n\ntexto del día")

    def test_relevo_chat_id_de_puente_si_falta_el_de_sintesis(self):
        registro = []
        r = S.enviar("hola", pedir=pedir_telegram(registro), leer_env=lambda: dict(PUENTE), fecha=FECHA)
        assert r["ok"] and r["chat_id"] == "111"

    def test_token_de_sintesis_manda_ese_y_sin_cabecera(self):
        env = {"TELEGRAM_SINTESIS_BOT_TOKEN": "tok-sintesis", "TELEGRAM_SINTESIS_CHAT_ID": "222"}
        registro = []
        r = S.enviar("hola", pedir=pedir_telegram(registro), leer_env=lambda: env, fecha=FECHA)
        assert r["ok"] and registro[0][0].endswith("/bottok-sintesis/sendMessage")
        assert json.loads(registro[0][1].decode("utf-8"))["text"] == "hola"

    def test_sintesis_token_sin_chat_cae_al_relevo(self):
        env = {"TELEGRAM_SINTESIS_BOT_TOKEN": "tok-sintesis", **PUENTE}
        registro = []
        r = S.enviar("hola", pedir=pedir_telegram(registro), leer_env=lambda: env, fecha=FECHA)
        assert r["ok"] and r["chat_id"] == "111" and registro[0][0].endswith("/bottok-puente/sendMessage")

    def test_sin_nada_sigue_dando_sin_token(self):
        registro = []
        r = S.enviar("hola", pedir=pedir_telegram(registro), leer_env=lambda: {}, fecha=FECHA)
        assert r == {"ok": False, "motivo": "sin token"} and registro == []


MUERTA = {"alias": "alex", "correo": "alexbordongarrigos@gmail.com", "vivo": False,
          "motivo": "invalid_grant"}
VIVA = {"alias": "fundacion", "vivo": True}


class TestAvisoCaducidad:
    """Si el token de una cuenta deja de renovarse, un aviso al día con la orden exacta."""

    def test_texto_aviso_lleva_la_orden_exacta_y_sin_secretos(self):
        texto = S.texto_aviso(MUERTA)
        assert "invalid_grant" in texto
        assert ("~/.starseed/venv-cuentas/bin/python ~/.starseed/herramientas/"
                "alta-cuentas-google.py alex") in texto
        assert "ref-alex" not in texto and "cid-escritorio" not in texto

    def test_una_vez_al_dia_por_alias(self, tmp_path):
        ruta = str(tmp_path / "avisos.json")
        assert S.avisos_pendientes([MUERTA, VIVA], FECHA, ruta) == [S.texto_aviso(MUERTA)]
        assert S.avisos_pendientes([MUERTA, VIVA], FECHA, ruta) == []
        assert S.avisos_pendientes([MUERTA], "2026-11-13", ruta) == [S.texto_aviso(MUERTA)]
        assert "invalid_grant" not in json.dumps(json.load(open(ruta)))

    def test_enviar_con_cuenta_muerta_manda_el_aviso_una_vez(self, tmp_path):
        registro = []
        pedir = pedir_telegram(registro)
        leer_env = lambda: dict(PUENTE)  # noqa: E731
        ruta_avisos = str(tmp_path / "avisos.json")
        assert S.enviar("síntesis", pedir=pedir, leer_env=leer_env, fecha=FECHA,
                        cuentas=[MUERTA], ruta_avisos=ruta_avisos)["ok"] is True
        assert len(registro) == 2
        aviso = json.loads(registro[1][1].decode("utf-8"))["text"]
        assert "alta-cuentas-google.py alex" in aviso
        assert S.enviar("síntesis del día siguiente", pedir=pedir, leer_env=leer_env,
                        fecha="2026-11-13", cuentas=[MUERTA], ruta_avisos=ruta_avisos)["ok"] is True
        assert len(registro) == 4

    def test_enviar_sin_cuentas_no_toca_avisos(self, tmp_path):
        registro = []
        assert S.enviar("hola", pedir=pedir_telegram(registro), leer_env=lambda: dict(PUENTE),
                        fecha=FECHA, cuentas=None,
                        ruta_avisos=str(tmp_path / "avisos.json"))["ok"] is True
        assert len(registro) == 1 and not os.path.exists(str(tmp_path / "avisos.json"))


class TestFichasAuthorizedUser:
    """Las fichas que dejó alta-cuentas-google.py se aceptan tal cual; no se pide un alta nueva."""

    def test_token_renueva_con_las_credenciales_de_la_propia_ficha(self, tmp_path):
        dir_cuentas = str(tmp_path / "cuentas")
        os.makedirs(dir_cuentas)
        E.escribir_json(os.path.join(dir_cuentas, "alex.json"), ficha_authorized_user())
        registro = []
        pedir = pedir_oauth(registro, {"access_token": "acc-nuevo", "expires_in": 3600})
        assert C.token("alex", pedir, dir_cuentas=dir_cuentas, rutas=[str(tmp_path / "no-existe")]) == "acc-nuevo"
        url, datos = registro[0]
        assert url == E.TOKEN_URL
        assert datos["client_id"] == "cid-escritorio" and datos["client_secret"] == "secreto-escritorio"
        assert datos["grant_type"] == "refresh_token" and datos["refresh_token"] == "ref-alex"
        guardada = json.load(open(os.path.join(dir_cuentas, "alex.json"), encoding="utf-8"))
        assert guardada["access_token"] == "acc-nuevo" and guardada["token_uri"] == E.TOKEN_URL

    def test_token_alex_docs_acepta_el_alias(self, tmp_path):
        dir_cuentas = str(tmp_path / "cuentas")
        os.makedirs(dir_cuentas)
        ficha = ficha_authorized_user("alex-docs")
        ficha["caduca"] = 0
        E.escribir_json(os.path.join(dir_cuentas, "alex-docs.json"), ficha)
        registro = []
        pedir = pedir_oauth(registro, {"access_token": "acc-docs", "expires_in": 9})
        assert C.token("alex-docs", pedir, dir_cuentas=dir_cuentas, rutas=[str(tmp_path / "x")]) == "acc-docs"
        assert registro[0][1]["refresh_token"] == "ref-alex-docs"

    def test_estado_muestra_authorized_user_vivo_y_alias_extra(self, tmp_path):
        dir_cuentas = str(tmp_path / "cuentas")
        os.makedirs(dir_cuentas)
        E.escribir_json(os.path.join(dir_cuentas, "alex.json"), ficha_authorized_user())
        E.escribir_json(os.path.join(dir_cuentas, "alex-docs.json"),
                        ficha_authorized_user("alex-docs", "alexbordongarrigos@gmail.com"))
        filas = C.estado(dir_cuentas=dir_cuentas, rutas=[str(tmp_path / "no-existe")])
        assert [f["alias"] for f in filas] == ["alex", "fundacion", "alex-docs"]
        assert filas[0]["vivo"] is True and filas[2]["vivo"] is True
        assert "ref-alex" not in json.dumps(filas) and "secreto-escritorio" not in json.dumps(filas)

    def test_alta_no_pide_otra_si_la_ficha_authorized_user_existe(self, tmp_path):
        dir_cuentas = str(tmp_path / "cuentas")
        os.makedirs(dir_cuentas)
        E.escribir_json(os.path.join(dir_cuentas, "alex.json"), ficha_authorized_user())
        r = C.alta("alex", romper, romper, abrir=romper, dir_cuentas=dir_cuentas,
                   descargas=str(tmp_path), rutas=[str(tmp_path / "x")])
        assert r["ok"] is True and "alta ya existente" in r["motivo"] and r["correo"]


class TestClienteOsDelRepo:
    """Antes de pedir un cliente nuevo, el cliente OAuth que el OS ya tiene en .env.local."""

    def test_cliente_os_lee_sin_imprimir(self, tmp_path, capsys):
        ruta = str(tmp_path / ".env.local")
        open(ruta, "w", encoding="utf-8").write(
            'NEXT_PUBLIC_SUPABASE_URL="x"\nNEXT_PUBLIC_GOOGLE_CLIENT_ID="cid-os"\n'
            # «de-prueba»: el escáner de secretos de la autopublicación lo toma por falso (SUP1112C).
            "GOOGLE_OAUTH_CLIENT_SECRET=secreto-de-prueba\n")
        assert C.cliente_os(ruta) == ("cid-os", "secreto-de-prueba")
        assert "cid-os" not in capsys.readouterr().out and "secreto-de-prueba" not in capsys.readouterr().out
        assert C.cliente_os(str(tmp_path / "nada")) == (None, None)

    def test_alta_usa_el_cliente_del_os_con_redireccion_fija(self, tmp_path):
        env_local = str(tmp_path / ".env.local")
        open(env_local, "w", encoding="utf-8").write(
            'NEXT_PUBLIC_GOOGLE_CLIENT_ID="cid-os"\nGOOGLE_OAUTH_CLIENT_SECRET="secreto-os"\n')
        os.makedirs(str(tmp_path / "cuentas"))
        registro, abiertas = [], []
        pedir = pedir_oauth(registro, {"refresh_token": "ref-n", "access_token": "acc",
                                       "expires_in": 3600, "id_token": ""})
        r = C.alta("alex", pedir, lambda puerto: ("codigo-1", None), abrir=abiertas.append,
                   dir_cuentas=str(tmp_path / "cuentas"), descargas=str(tmp_path),
                   rutas=[str(tmp_path / "x")], env_local=env_local)
        assert r["ok"] is True
        consulta = urllib.parse.parse_qs(urllib.parse.urlparse(abiertas[0]).query)
        assert consulta["redirect_uri"][0] == C.REDIRECCION_OS
        assert consulta["client_id"][0] == "cid-os"
        assert registro[0][1]["redirect_uri"] == C.REDIRECCION_OS
        assert "cid-os" in abiertas[0] and "secreto-os" not in str(r)

    def test_motivo_error_google_da_el_arreglo_exacto(self):
        uri = C.motivo_error_google('{"error": "redirect_uri_mismatch"}')
        assert uri is not None and "http://127.0.0.1:8765/" in uri \
            and "console.cloud.google.com/apis/credentials" in uri
        api = C.motivo_error_google("Googlefirstparty API not enabled: gmail.googleapis.com")
        assert api is not None and "console.cloud.google.com/apis/library" in api and "Gmail API" in api
        assert C.motivo_error_google("timeout") is None

    def test_alta_redirect_uri_mismatch_corta_con_el_arreglo(self, tmp_path):
        env_local = str(tmp_path / ".env.local")
        open(env_local, "w", encoding="utf-8").write(
            'NEXT_PUBLIC_GOOGLE_CLIENT_ID="cid-os"\nGOOGLE_OAUTH_CLIENT_SECRET="secreto-os"\n')
        os.makedirs(str(tmp_path / "cuentas"))
        pedir = pedir_oauth([], {"error": "redirect_uri_mismatch"})
        r = C.alta("alex", pedir, lambda puerto: ("codigo-1", None), abrir=lambda url: None,
                   dir_cuentas=str(tmp_path / "cuentas"), descargas=str(tmp_path),
                   rutas=[str(tmp_path / "x")], env_local=env_local)
        assert r["ok"] is False and "http://127.0.0.1:8765/" in r["motivo"]


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-q"]))
