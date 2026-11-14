#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de sanador_token: aprobación, CLIs falsos y cero fugas del token (SES1113D).

Todo es local y sin red: el CLI, el canal de claves y la verificación del A1 se
inyectan. Se comprueba que sin aprobación no corre NADA y que ningún registro
(estado, log, motivo o salida del CLI) contiene el token.
"""
import json
import os
import stat
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sanador_token as ST

TOKEN = "ya29.SECRETO_que_nunca_debe_salir_0123456789"


class SanadorTokenTest(unittest.TestCase):
    def setUp(self):
        self.t = tempfile.TemporaryDirectory()
        self.base = Path(self.t.name)
        self.home = self.base / "home"
        self.home.mkdir()
        self.aprob = self.base / "aprobaciones.json"
        self.perfil = ST.perfil_dir(ST.PERFIL, self.home)
        self.llamadas = []
        self.enviados = []
        self.verificaciones = []
        self.logs = []

    def tearDown(self):
        self.t.cleanup()

    def _aprobar(self, valor: object = True):
        self.aprob.write_text(json.dumps({ST.APROBACION: valor}), encoding="utf-8")

    def _login_falso(self, argv, timeout=600):
        self.llamadas.append([str(a) for a in argv])
        self.perfil.mkdir(parents=True, exist_ok=True)
        (self.perfil / "master_token.json").write_text(
            json.dumps({"token": TOKEN, "android_id": "android-123"}), encoding="utf-8")
        (self.perfil / "android_id").write_text("android-123", encoding="utf-8")
        (self.perfil / "storage_state.json").write_text(
            json.dumps({"cookies": [{"name": "SID", "value": TOKEN}]}), encoding="utf-8")
        return 0, "ok " + TOKEN

    def _login_que_no_escribe(self, argv, timeout=600):
        self.llamadas.append([str(a) for a in argv])
        return 0, "ok " + TOKEN

    def _enviar_falso(self, dir_perfil):
        nombres = [p.name for p in ST.archivos_del_perfil(dir_perfil)]
        self.enviados.append(nombres)
        return {"ok": True, "archivos": len(nombres)}

    def _enviar_que_falla(self, dir_perfil):
        self.enviados.append([p.name for p in ST.archivos_del_perfil(dir_perfil)])
        return {"ok": False, "motivo": "canal de claves caído " + TOKEN}

    def _verificar_falso(self):
        self.verificaciones.append(True)
        return {"ok": True, "detalle": "viva"}

    def _verificar_que_falla(self):
        self.verificaciones.append(True)
        return {"ok": False, "motivo": "auth caducada " + TOKEN}

    def _arrancar(self, **cambios):
        deps = {
            "aprobaciones": self.aprob,
            "ejecutar": self._login_falso,
            "enviar": self._enviar_falso,
            "verificar": self._verificar_falso,
            "buscar": lambda: "notebooklm",
            "home": self.home,
            "log": self.logs.append,
        }
        deps.update(cambios)
        return ST.arrancar("notebooklm", **deps)

    def test_sin_archivo_de_aprobacion_no_ejecuta_nada(self):
        """Sin aprobaciones.json sale sin tocar el CLI, el canal ni el A1."""
        r = self._arrancar()
        self.assertFalse(r["ok"])
        self.assertIs(r["aprobado"], False)
        self.assertIn("sin aprobación", r["motivo"])
        self.assertEqual(self.llamadas, [])
        self.assertEqual(self.enviados, [])
        self.assertEqual(self.verificaciones, [])
        self.assertEqual(self.logs, [])

    def test_aprobacion_en_false_no_ejecuta_nada(self):
        """`false` no es aprobación: nada se ejecuta."""
        self._aprobar(False)
        r = self._arrancar()
        self.assertIs(r["aprobado"], False)
        self.assertEqual(self.llamadas, [])

    def test_aprobacion_como_texto_no_ejecuta_nada(self):
        """Solo el booleano JSON `true` aprueba; la cadena `"true"` no."""
        self._aprobar("true")
        r = self._arrancar()
        self.assertIs(r["aprobado"], False)
        self.assertEqual(self.llamadas, [])

    def test_la_aprobacion_se_lee_de_la_raiz_del_repo(self):
        """La ruta por defecto es starseed_memory_root/salud/aprobaciones.json."""
        salud = self.base / "starseed_memory_root" / "salud"
        salud.mkdir(parents=True)
        (salud / "aprobaciones.json").write_text(
            json.dumps({ST.APROBACION: True}), encoding="utf-8")
        r = ST.arrancar("notebooklm", raiz=self.base, ejecutar=self._login_falso,
                        enviar=self._enviar_falso, verificar=self._verificar_falso,
                        buscar=lambda: "notebooklm", home=self.home)
        self.assertTrue(r["ok"])

    def test_con_aprobacion_ejecuta_el_login_en_el_perfil_dedicado(self):
        """El comando es el de §3.5, con la cuenta y el navegador, en el perfil dedicado."""
        self._aprobar()
        r = self._arrancar()
        self.assertTrue(r["ok"], r)
        self.assertEqual(len(self.llamadas), 1)
        comando = self.llamadas[0]
        for trozo in ("login", "--master-token", "--account", ST.CUENTA,
                      "--browser", "chrome", ST.PERFIL):
            self.assertIn(trozo, comando)
        self.assertNotEqual(ST.PERFIL, "default")
        self.assertEqual(self.verificaciones, [True])

    def test_solo_viajan_los_archivos_del_perfil(self):
        """Ni cookies de Chrome ni contextos: solo token maestro, android_id y storage_state."""
        self._aprobar()

        def login_con_ruido(argv, timeout=600):
            salida = self._login_falso(argv, timeout)
            (self.perfil / "cookies.sqlite").write_text("ruido", encoding="utf-8")
            (self.perfil / "context.json").write_text("{}", encoding="utf-8")
            (self.perfil / ".starseed-cli.lock").write_text("", encoding="utf-8")
            (self.perfil / "storage_state.buena-1.json").write_text("{}", encoding="utf-8")
            return salida

        r = self._arrancar(ejecutar=login_con_ruido)
        self.assertTrue(r["ok"], r)
        self.assertEqual(len(self.enviados), 1)
        self.assertEqual(sorted(self.enviados[0]),
                         ["android_id", "master_token.json", "storage_state.json"])

    def test_el_perfil_queda_700_y_sus_archivos_600(self):
        """Antes de viajar, el perfil dedicado y sus artefactos quedan privados."""
        self._aprobar()
        self.assertTrue(self._arrancar()["ok"])
        self.assertEqual(stat.S_IMODE(self.perfil.stat().st_mode), 0o700)
        for nombre in ("master_token.json", "android_id", "storage_state.json"):
            modo = stat.S_IMODE((self.perfil / nombre).stat().st_mode)
            self.assertEqual(modo, 0o600, nombre)

    def test_ningun_registro_contiene_el_token(self):
        """El estado, el log y la salida del CLI falso no arrastran el token."""
        self._aprobar()
        r = self._arrancar()
        self.assertTrue(r["ok"])
        registros = json.dumps(r, ensure_ascii=False) + json.dumps(self.logs, ensure_ascii=False)
        self.assertNotIn(TOKEN, registros)

    def test_si_el_login_falla_no_envia_ni_verifica(self):
        """Un login fallido se corta ahí, sin tocar el canal y sin filtrar la salida."""
        self._aprobar()

        def login_roto(argv, timeout=600):
            self.llamadas.append([str(a) for a in argv])
            return 1, "error con " + TOKEN

        r = self._arrancar(ejecutar=login_roto)
        self.assertFalse(r["ok"])
        self.assertIn("código 1", r["motivo"])
        self.assertNotIn(TOKEN, json.dumps(r, ensure_ascii=False))
        self.assertEqual(self.enviados, [])
        self.assertEqual(self.verificaciones, [])

    def test_sin_archivos_de_perfil_no_envia(self):
        """Si el CLI no dejó los artefactos, no se manda nada al A1."""
        self._aprobar()
        r = self._arrancar(ejecutar=self._login_que_no_escribe)
        self.assertFalse(r["ok"])
        self.assertIn("no tiene token maestro", r["motivo"])
        self.assertEqual(self.enviados, [])
        self.assertEqual(self.verificaciones, [])

    def test_si_el_canal_falla_no_verifica(self):
        """Sin perfil en el A1 no se finge una verificación."""
        self._aprobar()
        r = self._arrancar(enviar=self._enviar_que_falla)
        self.assertFalse(r["ok"])
        self.assertNotIn(TOKEN, json.dumps(r, ensure_ascii=False))
        self.assertEqual(self.verificaciones, [])

    def test_si_la_verificacion_falla_no_se_da_por_bueno(self):
        """`auth refresh --verify` en el A1 es la última palabra."""
        self._aprobar()
        r = self._arrancar(verificar=self._verificar_que_falla)
        self.assertFalse(r["ok"])
        self.assertNotIn(TOKEN, json.dumps(r, ensure_ascii=False))
        self.assertEqual(self.verificaciones, [True])

    def test_cli_sin_aprobacion_sale_cero_y_no_hace_nada(self):
        """`arrancar notebooklm` sin aprobación sale con 0 y sin ejecutar el CLI."""
        import io

        salida = io.StringIO()
        rc = ST.main(["arrancar", "notebooklm"], salida=salida,
                     aprobaciones=self.aprob, ejecutar=self._login_falso,
                     enviar=self._enviar_falso, verificar=self._verificar_falso,
                     buscar=lambda: "notebooklm", home=self.home)
        self.assertEqual(rc, 0)
        self.assertIn("no se hace nada", salida.getvalue())
        self.assertEqual(self.llamadas, [])

    def test_cli_con_aprobacion_informa_sin_el_token(self):
        """La salida del CLI es un visto bueno con el recuento, jamás el token."""
        import io

        self._aprobar()
        salida = io.StringIO()
        rc = ST.main(["arrancar", "notebooklm"], salida=salida,
                     aprobaciones=self.aprob, ejecutar=self._login_falso,
                     enviar=self._enviar_falso, verificar=self._verificar_falso,
                     buscar=lambda: "notebooklm", home=self.home)
        self.assertEqual(rc, 0)
        texto = salida.getvalue()
        self.assertIn("token maestro en el A1", texto)
        self.assertIn("3 archivos", texto)
        self.assertNotIn(TOKEN, texto)

    def test_tiene_aprobacion_es_estricto(self):
        """Un archivo corrupto o vacío tampoco aprueba."""
        self.aprob.write_text("{no es json", encoding="utf-8")
        self.assertFalse(ST.tiene_aprobacion(self.aprob))
        self.aprob.write_text("{}", encoding="utf-8")
        self.assertFalse(ST.tiene_aprobacion(self.aprob))

    def test_guion_despliegue_deja_600_y_dueno_starseed(self):
        """PURA: la orden de ssh crea el perfil 700 y sus archivos 600 con dueño starseed."""
        guion = ST.guion_despliegue(ST.DESTINO_A1)
        for trozo in ("-m 700", "-o starseed -g starseed", "chown -R starseed:starseed",
                      "chmod 600", "trap 'rm -f", ST.DESTINO_A1, "notebooklm-master-ok"):
            self.assertIn(trozo, guion)

    def test_empaquetar_pone_600_en_cada_archivo(self):
        """PURA: el tgz lleva solo los archivos dados y con modo 600 y dueño starseed."""
        import tarfile

        self._aprobar()
        self._arrancar()
        datos = ST.empaquetar(ST.archivos_del_perfil(self.perfil))
        import io

        with tarfile.open(fileobj=io.BytesIO(datos), mode="r:gz") as tar:
            miembros = tar.getmembers()
        self.assertEqual(sorted(m.name for m in miembros),
                         ["android_id", "master_token.json", "storage_state.json"])
        for miembro in miembros:
            self.assertEqual(miembro.mode, 0o600)
            self.assertEqual(miembro.uname, "starseed")
            self.assertEqual(miembro.gname, "starseed")

    def test_comando_verificar_usa_el_venv_del_a1(self):
        """PURA: la verificación corre con el CLI del venv del A1."""
        self.assertEqual(ST.comando_verificar(),
                         "/home/starseed/.starseed/venvs/notebooklm/bin/notebooklm auth refresh --verify")


if __name__ == "__main__":
    unittest.main()
