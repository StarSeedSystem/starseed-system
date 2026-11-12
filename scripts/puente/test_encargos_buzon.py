#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de encargos_buzon (ENC1111B): sin red, carpetas temporales, todo inyectable."""
import json, os, sys, tempfile, time, unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import encargos_buzon as EB


class EncargosBuzonTest(unittest.TestCase):
    def setUp(self):
        self.t = tempfile.TemporaryDirectory()
        self.raiz = Path(self.t.name) / "r"
        self.home = Path(self.t.name) / "h"
        self.raiz.mkdir(parents=True)
        self.home.mkdir(parents=True)
        # Rutas de prueba
        self.estado_ruta = self.home / "encargos" / "estado.json"
        self.cerrojo_ruta = self.home / "cerrojos" / "encargos_buzon.lock"
        self.architecture_ruta = self.raiz / "architecture"
        self.olas_ruta = self.raiz / "starseed_memory_root" / "olas"
        self.enjambre_colas_ruta = self.raiz / "enjambre" / "colas"
        self.architecture_ruta.mkdir(parents=True)
        self.olas_ruta.mkdir(parents=True)
        self.enjambre_colas_ruta.mkdir(parents=True)
        self.avisos = []

    def tearDown(self):
        self.t.cleanup()

    def _pedir_http_falso(self, url: str, token: str):
        """Simula las respuestas de Google Drive API."""
        if "/files" in url and "export" not in url:
            # Lista de archivos
            return {"files": self._docs_falsos}
        if "/export" in url:
            if "text/markdown" in url:
                return self._md_falso
            if "text/plain" in url:
                return self._plano_falso
        return {}

    def _token_fn_falso(self, alias: str, pedir_http):
        """Simula cuentas_google.token - devuelve token falso para 'alex'."""
        if alias == "alex":
            return "token-falso"
        return None

    def _soy_lider_true(self):
        return {"soy": True, "motivo": "lider en local", "arriendo": None}

    def _soy_lider_false(self):
        return {"soy": False, "motivo": "otro lider", "arriendo": {"dueno": "a1", "caduca": time.time() + 600}}

    def _avisar_falso(self, texto: str):
        self.avisos.append(texto)

    def test_no_soy_lider_no_actua(self):
        """Si no soy lider, el ciclo no hace nada."""
        r = EB.ciclo(raiz=self.raiz, home=self.home, soy_lider=self._soy_lider_false, seco=True)
        self.assertFalse(r["ok"])
        self.assertIn("no soy l", r["motivo"])

    def test_cerrojo_ocupado(self):
        """Si el cerrojo esta ocupado, no ejecuta."""
        with EB._cerrojo(self.cerrojo_ruta) as libre:
            self.assertTrue(libre)
            r = EB.ciclo(raiz=self.raiz, home=self.home, soy_lider=self._soy_lider_true, seco=True)
        self.assertFalse(r["ok"])
        self.assertIn("otro ciclo", r["motivo"])

    def test_sin_token(self):
        """Sin token de Drive, devuelve error."""
        self.avisos = []
        r = EB.ciclo(
            raiz=self.raiz,
            home=self.home,
            soy_lider=self._soy_lider_true,
            token_fn=lambda alias, _pedir: None,
            avisar=self._avisar_falso,
            seco=True,
        )
        self.assertFalse(r["ok"])
        self.assertIn("sin token", r["motivo"])

    def test_sin_docs_en_drive(self):
        """Sin documentos en la carpeta, ok sin procesar."""
        self._docs_falsos = []
        self.avisos = []
        r = EB.ciclo(
            raiz=self.raiz,
            home=self.home,
            soy_lider=self._soy_lider_true,
            pedir_http=self._pedir_http_falso,
            token_fn=self._token_fn_falso,
            avisar=self._avisar_falso,
            seco=True,
        )
        self.assertTrue(r["ok"])
        self.assertEqual(r["procesados"], 0)

    def test_procesa_doc_valido(self):
        """Procesa un documento valido: escribe contrato, cola, commit, avisa."""
        self._docs_falsos = [
            {
                "id": "doc1",
                "name": "Mi encargo · contrato y cola ENC1111 (leelo, director)",
                "modifiedTime": "2026-11-11T10:00:00.000Z",
                "owners": [{"emailAddress": "alexbordongarrigos@gmail.com"}],
            }
        ]
        self._md_falso = """# Contrato
**Destino en el repo:** `architecture/mi-encargo.md`
Contenido del contrato...
"""
        self._plano_falso = """{"ola": "ENC1111", "tareas": [
    {"id": "ENC1111X", "ola": "ENC1111", "titulo": "Tarea X", "archivos": ["src/lib/x.ts"], "depende": [], "prompt": "Hacer X"}
]}"""
        self.avisos = []
        # Sin seco=True para que escriba en disco (carpeta temporal)
        r = EB.ciclo(
            raiz=self.raiz,
            home=self.home,
            soy_lider=self._soy_lider_true,
            pedir_http=self._pedir_http_falso,
            token_fn=self._token_fn_falso,
            avisar=self._avisar_falso,
            seco=False,
        )
        self.assertTrue(r["ok"])
        self.assertEqual(r["procesados"], 1)
        # Verificar contrato escrito
        contrato = self.architecture_ruta / "mi-encargo.md"
        self.assertTrue(contrato.exists())
        # Verificar cola escrita
        cola = self.olas_ruta / "cola-enc1111.json"
        self.assertTrue(cola.exists())
        cola_data = json.loads(cola.read_text(encoding="utf-8"))
        self.assertEqual(len(cola_data), 1)
        self.assertEqual(cola_data[0]["id"], "ENC1111X")
        # Verificar aviso
        self.assertTrue(any("encolado: 1 tareas" in a for a in self.avisos))
        # Verificar estado guardado
        estado = json.loads(self.estado_ruta.read_text(encoding="utf-8"))
        self.assertIn("doc1", estado)
        self.assertIn("ok", estado["doc1"]["resultado"])

    def test_rechaza_doc_duplicado_mismo_mtime(self):
        """Si el doc ya esta en estado con mismo modifiedTime, no lo reprocesa."""
        self._docs_falsos = [
            {
                "id": "doc1",
                "name": "Encargo · contrato y cola ENC1111 (leelo, director)",
                "modifiedTime": "2026-11-11T10:00:00.000Z",
                "owners": [{"emailAddress": "alexbordongarrigos@gmail.com"}],
            }
        ]
        self._md_falso = """**Destino en el repo:** `architecture/x.md`"""
        self._plano_falso = """{"ola": "ENC1111", "tareas": []}"""
        # Estado previo con mismo mtime
        self.estado_ruta.parent.mkdir(parents=True, exist_ok=True)
        self.estado_ruta.write_text(json.dumps({
            "doc1": {"modifiedTime": "2026-11-11T10:00:00.000Z", "resultado": "2026-11-11T10:00:00: ok"}
        }), encoding="utf-8")

        r = EB.ciclo(
            raiz=self.raiz,
            home=self.home,
            soy_lider=self._soy_lider_true,
            pedir_http=self._pedir_http_falso,
            token_fn=self._token_fn_falso,
            seco=True,
        )
        self.assertTrue(r["ok"])
        self.assertEqual(r["procesados"], 0)

    def test_rechaza_doc_otro_dueno(self):
        """Documentos de otro dueno se ignoran."""
        self._docs_falsos = [
            {
                "id": "doc1",
                "name": "Encargo · contrato y cola ENC1111 (leelo, director)",
                "modifiedTime": "2026-11-11T10:00:00.000Z",
                "owners": [{"emailAddress": "otro@gmail.com"}],
            }
        ]
        r = EB.ciclo(
            raiz=self.raiz,
            home=self.home,
            soy_lider=self._soy_lider_true,
            pedir_http=self._pedir_http_falso,
            token_fn=self._token_fn_falso,
            seco=True,
        )
        self.assertTrue(r["ok"])
        self.assertEqual(r["procesados"], 0)

    def test_valida_destino_invalido(self):
        """Rechaza destino que no es architecture/*.md."""
        self._docs_falsos = [{"id": "d1", "name": "x", "modifiedTime": "2026-11-11T10:00:00.000Z", "owners": [{"emailAddress": "alexbordongarrigos@gmail.com"}]}]
        self._md_falso = """**Destino en el repo:** `src/lib/algo.ts`"""
        self._plano_falso = """{"ola": "ENC1111", "tareas": []}"""
        self.avisos = []
        r = EB.ciclo(raiz=self.raiz, home=self.home, soy_lider=self._soy_lider_true, pedir_http=self._pedir_http_falso, token_fn=self._token_fn_falso, avisar=self._avisar_falso, seco=True)
        self.assertTrue(r["ok"])
        self.assertEqual(r["procesados"], 0)
        self.assertTrue(any("válido" in a or "destino" in a for a in self.avisos))

    def test_valida_id_duplicado_en_cola(self):
        """Rechaza ids duplicados dentro de la misma cola."""
        self._docs_falsos = [{"id": "d1", "name": "x", "modifiedTime": "2026-11-11T10:00:00.000Z", "owners": [{"emailAddress": "alexbordongarrigos@gmail.com"}]}]
        self._md_falso = """**Destino en el repo:** `architecture/x.md`"""
        self._plano_falso = """{"ola": "ENC1111", "tareas": [
            {"id": "ENC1111A", "ola": "ENC1111", "titulo": "A", "archivos": [], "depende": [], "prompt": "p"},
            {"id": "ENC1111A", "ola": "ENC1111", "titulo": "B", "archivos": [], "depende": [], "prompt": "p"}
        ]}"""
        self.avisos = []
        r = EB.ciclo(raiz=self.raiz, home=self.home, soy_lider=self._soy_lider_true, pedir_http=self._pedir_http_falso, token_fn=self._token_fn_falso, avisar=self._avisar_falso, seco=True)
        self.assertEqual(r["procesados"], 0)
        self.assertTrue(any("duplicado" in a for a in self.avisos))

    def test_valida_id_existente_en_otras_colas(self):
        """Rechaza ids que ya existen en otras colas o git log."""
        # Crear cola existente con ENC1111A
        (self.olas_ruta / "cola-enc1111.json").write_text(json.dumps([{"id": "ENC1111A", "ola": "ENC1111", "titulo": "Ya existe", "archivos": [], "depende": [], "prompt": "p"}]))
        self._docs_falsos = [{"id": "d1", "name": "x", "modifiedTime": "2026-11-11T10:00:00.000Z", "owners": [{"emailAddress": "alexbordongarrigos@gmail.com"}]}]
        self._md_falso = """**Destino en el repo:** `architecture/x.md`"""
        self._plano_falso = """{"ola": "ENC1111", "tareas": [
            {"id": "ENC1111A", "ola": "ENC1111", "titulo": "Nueva", "archivos": [], "depende": [], "prompt": "p"}
        ]}"""
        self.avisos = []
        r = EB.ciclo(raiz=self.raiz, home=self.home, soy_lider=self._soy_lider_true, pedir_http=self._pedir_http_falso, token_fn=self._token_fn_falso, avisar=self._avisar_falso, seco=True)
        self.assertEqual(r["procesados"], 0)
        self.assertTrue(any("duplicado" in a for a in self.avisos))

    def test_valida_archivo_fuera_repo(self):
        """Rechaza archivos con .. o rutas absolutas o protegidas."""
        self._docs_falsos = [{"id": "d1", "name": "x", "modifiedTime": "2026-11-11T10:00:00.000Z", "owners": [{"emailAddress": "alexbordongarrigos@gmail.com"}]}]
        self._md_falso = """**Destino en el repo:** `architecture/x.md`"""
        self._plano_falso = """{"ola": "ENC1111", "tareas": [
            {"id": "ENC1111X", "ola": "ENC1111", "titulo": "X", "archivos": ["../.env"], "depende": [], "prompt": "p"}
        ]}"""
        self.avisos = []
        r = EB.ciclo(raiz=self.raiz, home=self.home, soy_lider=self._soy_lider_true, pedir_http=self._pedir_http_falso, token_fn=self._token_fn_falso, avisar=self._avisar_falso, seco=True)
        self.assertEqual(r["procesados"], 0)
        self.assertTrue(any("protegida" in a or "válido" in a or "archivo" in a for a in self.avisos))

    def test_valida_prompt_pide_claves(self):
        """Rechaza prompts que piden claves."""
        self._docs_falsos = [{"id": "d1", "name": "x", "modifiedTime": "2026-11-11T10:00:00.000Z", "owners": [{"emailAddress": "alexbordongarrigos@gmail.com"}]}]
        self._md_falso = """**Destino en el repo:** `architecture/x.md`"""
        self._plano_falso = """{"ola": "ENC1111", "tareas": [
            {"id": "ENC1111X", "ola": "ENC1111", "titulo": "X", "archivos": [], "depende": [], "prompt": "usa la API_KEY secreta"}
        ]}"""
        self.avisos = []
        r = EB.ciclo(raiz=self.raiz, home=self.home, soy_lider=self._soy_lider_true, pedir_http=self._pedir_http_falso, token_fn=self._token_fn_falso, avisar=self._avisar_falso, seco=True)
        self.assertEqual(r["procesados"], 0)
        self.assertTrue(any("claves" in a for a in self.avisos))

    def test_valida_prompt_pide_git_push(self):
        """Rechaza prompts que piden git push."""
        self._docs_falsos = [{"id": "d1", "name": "x", "modifiedTime": "2026-11-11T10:00:00.000Z", "owners": [{"emailAddress": "alexbordongarrigos@gmail.com"}]}]
        self._md_falso = """**Destino en el repo:** `architecture/x.md`"""
        self._plano_falso = """{"ola": "ENC1111", "tareas": [
            {"id": "ENC1111X", "ola": "ENC1111", "titulo": "X", "archivos": [], "depende": [], "prompt": "haz git push al final"}
        ]}"""
        self.avisos = []
        r = EB.ciclo(raiz=self.raiz, home=self.home, soy_lider=self._soy_lider_true, pedir_http=self._pedir_http_falso, token_fn=self._token_fn_falso, avisar=self._avisar_falso, seco=True)
        self.assertEqual(r["procesados"], 0)
        self.assertTrue(any("git push" in a for a in self.avisos))

    def test_tope_3_encargos_dia(self):
        """Rechaza el 4º encargo del mismo dia."""
        # Estado con 3 hoy
        hoy = datetime.now().strftime("%Y-%m-%d")
        self.estado_ruta.parent.mkdir(parents=True, exist_ok=True)
        self.estado_ruta.write_text(json.dumps({
            "d1": {"modifiedTime": "2026-11-11T10:00:00.000Z", "resultado": f"{hoy}T10:00:00: ok - ENC1111"},
            "d2": {"modifiedTime": "2026-11-11T11:00:00.000Z", "resultado": f"{hoy}T11:00:00: ok - ENC1112"},
            "d3": {"modifiedTime": "2026-11-11T12:00:00.000Z", "resultado": f"{hoy}T12:00:00: ok - ENC1113"},
        }))
        self._docs_falsos = [{"id": "d4", "name": "x", "modifiedTime": "2026-11-11T13:00:00.000Z", "owners": [{"emailAddress": "alexbordongarrigos@gmail.com"}]}]
        self._md_falso = """**Destino en el repo:** `architecture/x.md`"""
        self._plano_falso = """{"ola": "ENC1114", "tareas": [{"id": "ENC1114A", "ola": "ENC1114", "titulo": "X", "archivos": [], "depende": [], "prompt": "p"}]}"""
        self.avisos = []
        r = EB.ciclo(raiz=self.raiz, home=self.home, soy_lider=self._soy_lider_true, pedir_http=self._pedir_http_falso, token_fn=self._token_fn_falso, avisar=self._avisar_falso, seco=True)
        self.assertEqual(r["procesados"], 0)
        self.assertTrue(any("3 encargos" in a and "día" in a for a in self.avisos))

    def test_ids_existentes_incluye_git_log(self):
        """_ids_existentes recoge ids del git log."""
        # Simular git log con un id
        with patch("subprocess.run") as mock_run:
            mock_run.return_value.stdout = "ENC1111A arreglar algo\nOTRO commit"
            ids = EB._ids_existentes(self.raiz, self.olas_ruta, self.enjambre_colas_ruta)
            self.assertIn("ENC1111A", ids)

    def test_estado_cmd(self):
        """Comando estado muestra el estado guardado."""
        self.estado_ruta.parent.mkdir(parents=True, exist_ok=True)
        self.estado_ruta.write_text(json.dumps({"doc1": {"modifiedTime": "x", "resultado": "ok"}}))
        r = EB.estado_cmd(home=self.home)
        self.assertEqual(r["encargos_procesados"], 1)
        self.assertIn("doc1", r["detalle"])

    def test_extraer_contrato_y_cola(self):
        """Extrae correctamente destino y cola del texto."""
        md = "Algo\n**Destino en el repo:** `architecture/mi.md`\nOtro"
        plano = 'Texto antes {"ola": "TEST", "tareas": []} texto despues'
        destino, cola = EB._extraer_contrato_y_cola(md, plano)
        self.assertEqual(destino, "architecture/mi.md")
        self.assertEqual(cola["ola"], "TEST")

    def test_validar_encargo_ok(self):
        """Validacion completa de un encargo valido."""
        md = "**Destino en el repo:** `architecture/x.md`"
        plano = '{"ola": "TEST", "tareas": [{"id": "TEST0001", "ola": "TEST", "titulo": "T", "archivos": ["src/lib/a.ts"], "depende": [], "prompt": "hacer"}]}'
        r = EB._validar_encargo(md, plano, set(), 0)
        self.assertTrue(r["ok"])
        self.assertEqual(r["ola"], "TEST")
        self.assertEqual(r["destino"], "architecture/x.md")


if __name__ == "__main__":
    unittest.main()