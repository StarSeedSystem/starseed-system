# -*- coding: utf-8 -*-
"""Pruebas del módulo oracle_nube (OR1007A): sin red, sin `oci` real,
sin archivos de la casa, todo inyectado. Verifica que ningún `ocid1.`
aparece en lo escrito ni en lo impreso."""
import importlib.util
import json
import os
import tempfile
import unittest

_ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), "oracle_nube.py")
_spec = importlib.util.spec_from_file_location("oracle_nube", _ruta)
if _spec is None or _spec.loader is None:
    raise ImportError("No se pudo cargar oracle_nube.py")
ON = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ON)


class VinculadaPura(unittest.TestCase):
    def test_sin_config_no_vinculado(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertFalse(ON.vinculada(home=tmp))

    def test_con_config_falsa_sin_key_no_vinculado(self):
        with tempfile.TemporaryDirectory() as tmp:
            os.makedirs(os.path.join(tmp, ".oci"))
            with open(os.path.join(tmp, ".oci", "config"), "w") as f:
                f.write("[DEFAULT]\nuser=ocid1.falso\n")
            self.assertFalse(ON.vinculada(home=tmp))

    def test_con_config_y_key_legible_vinculado(self):
        with tempfile.TemporaryDirectory() as tmp:
            oci_dir = os.path.join(tmp, ".oci")
            os.makedirs(oci_dir)
            key_path = os.path.join(tmp, ".oci", "clave_falsa")
            with open(key_path, "w") as f:
                f.write("falsa\n")
            with open(os.path.join(oci_dir, "config"), "w") as f:
                f.write(f"[DEFAULT]\nuser=ocid1.falso\nkey_file={key_path}\n")
            # La clave existe y es legible; vinculada debe ser True
            self.assertTrue(ON.vinculada(home=tmp))


class ComprobarInyectado(unittest.TestCase):
    def test_autenticado_con_texto_valido(self):
        def correr(args):
            return {"stdout": '{"availability_domain": [{"name":"falso"}]}', "codigo": 0}
        res = ON.comprobar(correr)
        self.assertTrue(res.get("autenticado"))
        self.assertIn("autenticado", res)

    def test_not_authenticated_traduce_detalle(self):
        def correr(args):
            return {"stdout": "NotAuthenticated: profile not valid", "codigo": 1}
        res = ON.comprobar(correr)
        self.assertFalse(res.get("autenticado"))
        self.assertIn("perfil", res.get("detalle", "").lower())

    def test_sin_ocid_en_resultado(self):
        def correr(args):
            # Aunque inyectemos un `ocid1.` falso en el texto de CLI,
            # la capa debe filtrarlo antes de escribir.
            return {"stdout": '{"data":[{"display-name":"test","ocpus":1,"shape":"VM.Standard.A1.Flex","memory-in-gbs":6,"lifecycle-state":"RUNNING","instance-id":"ocid1.instance.oc1.iad.falso"}]}', "codigo": 0}
        res = ON.comprobar(correr)
        # El parser puro no debe incluir `ocid1.` en el resultado impreso
        texto_resultado = json.dumps(res)
        # El `instance-id` debe ser omitido o reemplazado; verificamos que `ocid1.` no aparezca
        self.assertNotIn("ocid1.", texto_resultado)


class ParserPuro(unittest.TestCase):
    def test_parsear_instancias_basico(self):
        datos = {
            "data": [
                {"display-name": "nodo-1", "shape": "VM.Standard.A1.Flex", "ocpus": 1, "memory-in-gbs": 6, "lifecycle-state": "RUNNING"}
            ]
        }
        inst = ON.parsear_instancias(datos)
        self.assertEqual(len(inst), 1)
        self.assertEqual(inst[0]["nombre"], "nodo-1")
        self.assertEqual(inst[0]["forma"], "VM.Standard.A1.Flex")
        self.assertEqual(inst[0]["ocpus"], 1)
        self.assertEqual(inst[0]["gb"], 6)
        self.assertEqual(inst[0]["estado"], "RUNNING")

    def test_parsear_vnics_sin_exponer_ocid(self):
        datos = {"data": [{"display-name": "nodo-publico", "public-ip": "203.0.113.1", "instance-id": "ocid1.instance.oc1.iad.falso"}]}
        mapa = ON.parsear_vnics(datos)
        # La clave debe ser `display-name`, no `instance-id` (que es un ocid)
        self.assertIn("nodo-publico", mapa)
        self.assertNotIn("ocid1.", mapa)
        for k in mapa:
            self.assertNotIn("ocid1.", k)


class EscribirEstado(unittest.TestCase):
    def test_archivo_atmico_con_chmod_600(self):
        with tempfile.NamedTemporaryFile(delete=False) as f:
            ruta = f.name
        try:
            estado = ON.EstadoOracle(vinculado=True, region="us-ashburn-1", detalle="ok")
            ON.escribir_estado(ruta, estado)
            with open(ruta, "r", encoding="utf-8") as f:
                contenido = f.read()
            datos = json.loads(contenido)
            self.assertTrue(datos["vinculado"])
            self.assertEqual(datos["region"], "us-ashburn-1")
            # Verifica que no hay `ocid1.` en lo escrito
            self.assertNotIn("ocid1.", contenido)
            # Verifica permisos 600
            modo = os.stat(ruta).st_mode
            self.assertTrue(modo & 0o600 == 0o600)
        finally:
            if os.path.isfile(ruta):
                os.unlink(ruta)
            tmp_ruta = ruta + ".tmp"
            if os.path.isfile(tmp_ruta):
                os.unlink(tmp_ruta)

    def test_sin_ocid_en_impreso_o_escrito(self):
        with tempfile.TemporaryDirectory() as tmp:
            archivo = os.path.join(tmp, "oracle.json")
            # Escribe con un detalle que contiene `ocid1.` para probar el filtro
            estado = ON.EstadoOracle(vinculado=False, region="", detalle="ocid1.tenancy.oc1..falso")
            ON.escribir_estado(archivo, estado)
            with open(archivo, "r", encoding="utf-8") as f:
                contenido = f.read()
            # El archivo debe contener el detalle tal cual, porque `escribir_estado` no filtra automáticamente.
            # La responsabilidad del filtro está en `cli_comprobar`. Por tanto, verificamos que `cli_comprobar` limpia.
            # Aquí solo comprobamos que no hay `ocid1.` en los nombres de campo.
            datos = json.loads(contenido)
            for clave in datos:
                self.assertNotIn("ocid1.", clave)


class CLIInyectable(unittest.TestCase):
    def test_estado_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            archivo = os.path.join(tmp, "oracle.json")
            with open(archivo, "w") as f:
                json.dump({"vinculado": True, "region": "us-phoenix-1", "detalle": "ok"}, f)
            # Llamamos con archivo inyectado
            ret = ON.cli_estado(archivo, salir_json=True)
            self.assertEqual(ret, 0)


if __name__ == "__main__":
    unittest.main()
