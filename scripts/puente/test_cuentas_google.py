"""Pruebas de cuentas_google sin red: intercambio inyectado y navegador falso sobre 127.0.0.1."""

import base64
import hashlib
import json
import os
import stat
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.parse
import urllib.request
from contextlib import redirect_stdout
from io import StringIO

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import cuentas_google


class CuentasGoogle(unittest.TestCase):
    def setUp(self):
        cuentas_google.RAIZ = tempfile.mkdtemp(prefix="cuentas-google-")
        cuentas_google.INTERCAMBIO = None
        os.environ["GOOGLE_ACTIVIDAD_CLIENT_ID"] = "id-de-prueba"
        os.environ["GOOGLE_ACTIVIDAD_CLIENT_SECRET"] = "secreto-de-prueba"

    def tearDown(self):
        cuentas_google.INTERCAMBIO = None
        os.environ.pop("GOOGLE_ACTIVIDAD_CLIENT_ID", None)
        os.environ.pop("GOOGLE_ACTIVIDAD_CLIENT_SECRET", None)

    def test_url_solo_scopes_de_lectura(self):
        url = cuentas_google.url_autorizacion("verificador", 8750, "marca")
        datos = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
        self.assertEqual(datos["scope"], [" ".join(cuentas_google.PREFIJO + s for s in cuentas_google.SCOPES)])

    def test_pkce_s256_y_redireccion_local(self):
        url = cuentas_google.url_autorizacion("verificador", 8750, "marca")
        datos = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
        self.assertEqual(datos["code_challenge_method"], ["S256"])
        reto = base64.urlsafe_b64encode(hashlib.sha256(b"verificador").digest()).decode().rstrip("=")
        self.assertEqual(datos["code_challenge"], [reto])
        self.assertEqual(datos["redirect_uri"], ["http://127.0.0.1:8750"])
        self.assertEqual(datos["access_type"], ["offline"])

    def test_alta_guarda_refresco_con_permisos_0600(self):
        vistas = []

        def intercambio_falso(datos):
            vistas.append(datos)
            return {"refresh_token": "refresco-abc", "access_token": "acceso-xyz", "expires_in": 3600}

        def navegador_falso(url):
            self.assertIn("consent", url)
            pregunta = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
            puerto = urllib.parse.urlparse(pregunta["redirect_uri"][0]).port
            for _ in range(60):
                try:
                    destino = f"http://127.0.0.1:{puerto}/?code=codigo-google&state={pregunta['state'][0]}"
                    urllib.request.urlopen(destino, timeout=5)
                    return
                except urllib.error.URLError:
                    time.sleep(0.05)
            self.fail("el receptor local de 127.0.0.1 nunca respondió")

        cuentas_google.INTERCAMBIO = intercambio_falso
        cuentas_google.ABRIR = navegador_falso
        cuentas_google.alta("alex")
        self.assertEqual(vistas[0]["grant_type"], "authorization_code")
        self.assertEqual(vistas[0]["code"], "codigo-google")
        self.assertEqual(vistas[0]["client_id"], "id-de-prueba")
        fichero = os.path.join(cuentas_google.RAIZ, "alex.json")
        with open(fichero, encoding="utf-8") as archivo:
            self.assertEqual(json.load(archivo)["refresh_token"], "refresco-abc")
        self.assertEqual(stat.S_IMODE(os.stat(fichero).st_mode), 0o600)

    def test_token_renueva_con_el_refresco(self):
        cuentas_google.guardar("alex", {"alias": "alex", "correo": "a@b.c", "refresh_token": "refresco-viejo"})
        vistas = []

        def intercambio_falso(datos):
            vistas.append(datos)
            return {"access_token": "nuevo-acceso", "expires_in": 3600}

        cuentas_google.INTERCAMBIO = intercambio_falso
        self.assertEqual(cuentas_google.token("alex"), "nuevo-acceso")
        self.assertEqual(vistas[0]["grant_type"], "refresh_token")
        self.assertEqual(vistas[0]["refresh_token"], "refresco-viejo")

    def test_estado_lista_alias_y_correo_sin_tokens(self):
        cuentas_google.guardar("alex", {"alias": "alex", "correo": "a@b.c", "refresh_token": "refresco-secreto"})
        salida = StringIO()
        with redirect_stdout(salida):
            cuentas_google.estado()
        texto = salida.getvalue()
        self.assertIn("alex", texto)
        self.assertIn("token vivo", texto)
        self.assertIn("fundacionstarseed@gmail.com", texto)
        self.assertNotIn("refresco-secreto", texto)

    def test_alias_desconocido_rechazado(self):
        with self.assertRaises(SystemExit):
            cuentas_google.alta("otro")

    def test_faltan_claves_de_entorno(self):
        os.environ.pop("GOOGLE_ACTIVIDAD_CLIENT_ID", None)
        with self.assertRaises(SystemExit):
            cuentas_google.cliente()


if __name__ == "__main__":
    unittest.main()
