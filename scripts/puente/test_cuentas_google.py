#!/usr/bin/env python3
"""Pruebas de cuentas_google sin red: el intercambio OAuth y el navegador van inyectados (SDP1111E)."""
import base64, json, os, sys, time, urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cuentas_google as C, cuentas_google_env as E  # noqa: E402

def romper(*argumentos, **claves): raise AssertionError("no debía llamarse")  # noqa: E704

def entorno_tmp(tmp_path):
    rutas = [str(tmp_path / "env-starseed"), str(tmp_path / "env-hermes")]
    descargas = str(tmp_path / "Downloads")
    os.makedirs(descargas)
    return rutas, str(tmp_path / "cuentas"), descargas

def client_secret(ruta, cid="cid-123", secreto="secreto-456"):
    json.dump({"installed": {"client_id": cid, "client_secret": secreto}}, open(ruta, "w", encoding="utf-8"))

def sembrar_cuentas(dir_cuentas, rutas, caduca: float = 0):
    os.makedirs(dir_cuentas, exist_ok=True)
    E.poner_en_env("GOOGLE_ACTIVIDAD_CLIENT_ID", "cid-123", rutas)
    E.poner_en_env("GOOGLE_ACTIVIDAD_CLIENT_SECRET", "secreto-456", rutas)
    E.escribir_json(os.path.join(dir_cuentas, "alex.json"),
                    {"alias": "alex", "correo": "x@y.z", "refresh_token": "ref-1", "access_token": "viejo", "caduca": caduca})

def permiso(ruta): return oct(os.stat(ruta).st_mode & 0o777)  # noqa: E704

def test_url_autorizacion_solo_lectura_y_pkce_rfc7636():
    # Apéndice B del RFC 7636: verificador conocido y su desafío S256 esperado
    consulta = urllib.parse.parse_qs(urllib.parse.urlparse(
        E.url_autorizacion("cid", "http://127.0.0.1:9000/", "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).query)
    assert consulta["code_challenge"][0] == "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    assert consulta["code_challenge_method"][0] == "S256"
    assert consulta["access_type"][0] == "offline" and consulta["prompt"][0] == "consent"
    assert set(consulta["scope"][0].split()) == set(E.SCOPES)
    assert all(s.endswith("readonly") for s in E.SCOPES)
def test_poner_en_env_entrecomilla_reemplaza_y_recarga(tmp_path):
    rutas, _, _ = entorno_tmp(tmp_path)
    open(rutas[0], "w", encoding="utf-8").write('OTRA="1"\nGOOGLE_ACTIVIDAD_CLIENT_ID="viejo"\n')
    E.poner_en_env("GOOGLE_ACTIVIDAD_CLIENT_ID", 'valor con "comillas"', rutas)
    texto = open(rutas[0], encoding="utf-8").read()
    assert texto.count("GOOGLE_ACTIVIDAD_CLIENT_ID=") == 1
    assert 'GOOGLE_ACTIVIDAD_CLIENT_ID="valor con \\"comillas\\""' in texto and 'OTRA="1"' in texto
    assert E.leer_env(rutas)["GOOGLE_ACTIVIDAD_CLIENT_ID"] == 'valor con "comillas"'
    assert permiso(rutas[0]) == "0o600"

def test_importar_guarda_sin_mostrar_y_aparta_el_json(tmp_path, capsys):
    rutas, dir_cuentas, descargas = entorno_tmp(tmp_path)
    client_secret(os.path.join(descargas, "client_secret_abc.json"))
    assert C.importar(ruta=os.path.join(descargas, "client_secret_abc.json"), descargas=descargas, rutas=rutas, dir_cuentas=dir_cuentas)["ok"] is True
    vivos = E.leer_env(rutas)
    assert vivos["GOOGLE_ACTIVIDAD_CLIENT_ID"] == "cid-123" and vivos["GOOGLE_ACTIVIDAD_CLIENT_SECRET"] == "secreto-456"
    salida = capsys.readouterr().out
    assert "cid-123" not in salida and "secreto-456" not in salida
    assert E.huella("cid-123") in salida and E.huella("secreto-456") in salida
    destino = os.path.join(dir_cuentas, "cliente-oauth.json")
    assert os.path.exists(destino) and not os.path.exists(os.path.join(descargas, "client_secret_abc.json")) \
        and permiso(destino) == "0o600"

def test_importar_sin_json_da_motivo_y_el_mas_reciente_gana(tmp_path):
    rutas, dir_cuentas, descargas = entorno_tmp(tmp_path)
    assert C.importar(None, descargas, rutas, dir_cuentas)["ok"] is False and not E.leer_env(rutas)
    client_secret(os.path.join(descargas, "client_secret_viejo.json"), "cid-viejo", "secreto-viejo")
    nuevo = os.path.join(descargas, "client_secret_nuevo.json")
    client_secret(nuevo, "cid-nuevo", "secreto-nuevo")
    os.utime(nuevo, (9e9, 9e9))
    assert C.importar(None, descargas, rutas, dir_cuentas)["ok"] is True
    assert E.leer_env(rutas)["GOOGLE_ACTIVIDAD_CLIENT_ID"] == "cid-nuevo"

def test_alta_alias_desconocido_y_sin_cliente_no_llaman_a_nada(tmp_path):
    rutas, dir_cuentas, descargas = entorno_tmp(tmp_path)
    assert "alias desconocido" in C.alta("otro", romper, romper, abrir=romper, dir_cuentas=dir_cuentas, descargas=descargas, rutas=rutas)["motivo"]
    resultado = C.alta("alex", romper, romper, abrir=romper, dir_cuentas=dir_cuentas, descargas=descargas, rutas=rutas)
    assert resultado["ok"] is False and "sin cliente OAuth" in resultado["motivo"]

def test_alta_flujo_completo_guarda_el_refresco_con_0600(tmp_path):
    rutas, dir_cuentas, descargas = entorno_tmp(tmp_path)
    sembrar_cuentas(dir_cuentas, rutas)
    intercambios, abiertas = [], []
    def pedir(url, datos):
        intercambios.append((url, datos))
        carga = json.dumps({"email": "alexbordongarrigos@gmail.com"}).encode("utf-8")
        id_token = "abc." + base64.urlsafe_b64encode(carga).decode("ascii").rstrip("=") + ".def"
        return {"refresh_token": "ref-nuevo", "access_token": "acc-1", "expires_in": 3600, "id_token": id_token}
    resultado = C.alta("alex", pedir, lambda puerto: ("codigo-1", None), abrir=abiertas.append,
                       dir_cuentas=dir_cuentas, descargas=descargas, rutas=rutas)
    assert resultado["ok"] is True and resultado["correo"] == "alexbordongarrigos@gmail.com"
    assert len(abiertas) == 1 and "scope=" in abiertas[0] and "code_challenge=" in abiertas[0]
    datos = intercambios[0][1]
    assert intercambios[0][0] == E.TOKEN_URL and datos["grant_type"] == "authorization_code"
    assert datos["code"] == "codigo-1" and datos["redirect_uri"].startswith("http://127.0.0.1:")
    assert json.load(open(os.path.join(dir_cuentas, "alex.json"), encoding="utf-8"))["refresh_token"] == "ref-nuevo"
    assert permiso(os.path.join(dir_cuentas, "alex.json")) == "0o600"

def test_token_renueva_con_el_refresco_y_guarda_la_nueva_caducidad(tmp_path):
    rutas, dir_cuentas, _ = entorno_tmp(tmp_path)
    sembrar_cuentas(dir_cuentas, rutas)
    pedidos = []
    def pedir(url, datos):
        pedidos.append((url, datos))
        return {"access_token": "acc-nuevo", "expires_in": 3600}
    assert C.token("alex", pedir, dir_cuentas=dir_cuentas, rutas=rutas) == "acc-nuevo"
    assert pedidos[0][0] == E.TOKEN_URL
    assert pedidos[0][1]["grant_type"] == "refresh_token" and pedidos[0][1]["refresh_token"] == "ref-1"
    ficha = json.load(open(os.path.join(dir_cuentas, "alex.json"), encoding="utf-8"))
    assert ficha["access_token"] == "acc-nuevo" and ficha["caduca"] > time.time()

def test_token_vivo_no_llama_a_la_red_y_sin_ficha_da_none(tmp_path):
    rutas, dir_cuentas, _ = entorno_tmp(tmp_path)
    sembrar_cuentas(dir_cuentas, rutas, caduca=time.time() + 9999)
    assert C.token("alex", romper, dir_cuentas=dir_cuentas, rutas=rutas) == "viejo"
    assert C.token("fundacion", romper, dir_cuentas=dir_cuentas, rutas=rutas) is None

def test_estado_da_alias_correo_y_vida_sin_tokens(tmp_path):
    rutas, dir_cuentas, _ = entorno_tmp(tmp_path)
    sembrar_cuentas(dir_cuentas, rutas)
    filas = C.estado(dir_cuentas=dir_cuentas, rutas=rutas)
    assert [fila["alias"] for fila in filas] == ["alex", "fundacion"]
    assert filas[0]["vivo"] is True and filas[0]["correo"] == "x@y.z" and filas[1]["vivo"] is False
    volcado = json.dumps(filas); assert "ref-1" not in volcado and "viejo" not in volcado
