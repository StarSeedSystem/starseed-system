#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de salud_directores: firmas, tareas automáticas y resumen, sin red (SES1113E)."""
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import salud_directores as SD
import sanador_sesiones as SS


def caida(token="sk-abcdefgh0123456789abcd"):
    return {"ok": False, "motivo": "auth caducada: Authentication expired (token %s)" % token}


def reparacion_ok(receta="receta2"):
    return {"ok": True, "motivo": "", "recetas": ["receta1", receta]}


def reparacion_mal():
    return {"ok": False, "motivo": "todas las recetas fallaron", "recetas": ["receta1", "receta2"]}


class SaludDirectoresTest(unittest.TestCase):
    def setUp(self):
        self.t = tempfile.TemporaryDirectory()
        self.raiz = Path(self.t.name)
        (self.raiz / "starseed_memory_root" / "olas").mkdir(parents=True)
        (self.raiz / "starseed_memory_root" / "salud").mkdir(parents=True)
        self.hora = datetime(2026, 11, 14, 12, 0, 0)

    def tearDown(self):
        self.t.cleanup()

    def _sd(self, minuto=0):
        return SD.SaludDirectores(
            raiz=self.raiz, ahora_fn=lambda: datetime(2026, 11, 14, 12, minuto, 0)
        )

    def _cola(self, fecha="2026-11-14"):
        return self.raiz / "starseed_memory_root" / "olas" / ("cola-auto-salud-%s.json" % fecha)

    def _tareas_cola(self):
        ruta = self._cola()
        if not ruta.exists():
            return []
        with open(ruta, encoding="utf-8") as f:
            d = json.load(f)
        return d.get("tareas") if isinstance(d, dict) else d

    def test_firma_estable_y_distinta_por_mensaje(self):
        a = SD.firma("auth caducada: Authentication expired")
        b = SD.firma("auth caducada: Authentication expired")
        c = SD.firma("timeout en auth refresh")
        self.assertEqual(a, b)
        self.assertNotEqual(a, c)
        self.assertEqual(len(a), 16)

    def test_firma_ignora_secretos_y_numeros(self):
        self.assertEqual(
            SD.firma("auth caducada: Authentication expired (token sk-abcdef0123456789)"),
            SD.firma("auth caducada: Authentication expired (token sk-ffffffffffffffffff)"))
        self.assertEqual(SD.firma("error en /Users/alex/x.py línea 42"),
                         SD.firma("error en /tmp/y.py línea 7"))

    def test_sesion_viva_no_abre_nada(self):
        r = self._sd().evaluar("notebooklm", {"ok": True, "motivo": ""})
        self.assertEqual(r["accion"], "viva")
        self.assertEqual(self._tareas_cola(), [])

    def test_una_caida_con_firma_conocida_no_abre_tarea(self):
        conocida = {SD.firma(caida()["motivo"])}
        sd = SD.SaludDirectores(raiz=self.raiz,
                                ahora_fn=lambda: self.hora, firmas_conocidas=conocida)
        r = sd.evaluar("notebooklm", caida(), reparacion_mal())
        self.assertEqual(r["accion"], "espera")
        self.assertEqual(r["fallos_seguidos"], 1)
        self.assertEqual(self._tareas_cola(), [])

    def test_dos_caidas_con_firma_conocida_abren_tarea(self):
        conocida = {SD.firma(caida()["motivo"])}
        sd = SD.SaludDirectores(raiz=self.raiz,
                                ahora_fn=lambda: self.hora, firmas_conocidas=conocida)
        self.assertEqual(sd.evaluar("notebooklm", caida(), reparacion_mal())["accion"], "espera")
        r = sd.evaluar("notebooklm", caida(), reparacion_mal())
        self.assertEqual(r["accion"], "tarea_abierta")
        self.assertEqual(r["causa"], "dos-seguidas")
        tareas = self._tareas_cola()
        self.assertEqual(len(tareas), 1)
        t = tareas[0]
        self.assertEqual(t["id"], r["id"])
        self.assertEqual(t["archivos"], ["scripts/puente/sanador_sesiones.py",
                                         "scripts/puente/test_sanador_sesiones.py"])
        self.assertEqual(t["depende"], [])
        self.assertIn("notebooklm", t["titulo"])

    def test_segunda_caida_misma_firma_no_duplica_tarea(self):
        sd = self._sd()
        sd.evaluar("notebooklm", caida(), reparacion_mal())
        r = sd.evaluar("notebooklm", caida(), reparacion_mal())
        self.assertEqual(r["accion"], "ya_abierta")
        self.assertEqual(len(self._tareas_cola()), 1)

    def test_firma_nueva_abre_tarea_a_la_primera(self):
        r = self._sd().evaluar("notebooklm", caida(), reparacion_mal())
        self.assertEqual(r["accion"], "tarea_abierta")
        self.assertEqual(r["causa"], "firma-nueva")
        otra = {"ok": False, "motivo": "timeout en auth refresh"}
        r2 = self._sd().evaluar("higgsfield", otra, reparacion_mal())
        self.assertEqual(r2["accion"], "tarea_abierta")
        self.assertEqual(len(self._tareas_cola()), 2)

    def test_misma_firma_sesiones_distintas_no_duplica_tarea(self):
        self._sd().evaluar("notebooklm", caida(), reparacion_mal())
        r = self._sd().evaluar("google-oauth-alex", caida(), reparacion_mal())
        self.assertEqual(r["accion"], "ya_abierta")
        self.assertEqual(len(self._tareas_cola()), 1)

    def test_tarea_con_registros_recortados_y_sin_secretos(self):
        registros = [
            "receta1 ok=False motivo=auth caducada: token sk-abcdefgh0123456789abcd duracion=1.2s",
            "x" * 500,
        ]
        r = self._sd().evaluar("notebooklm", caida(), reparacion_mal(), registros=registros)
        t = self._tareas_cola()[0]
        self.assertNotIn("sk-abcdefgh0123456789", t["prompt"])
        self.assertIn("[REDACTADO]", t["prompt"])
        self.assertLess(len(t["prompt"]), 2400)
        self.assertIn("test_sanador_sesiones", t["prompt"])
        self.assertEqual(t["id"], r["id"])
        self.assertNotIn("Claude", t["prompt"] + t["titulo"])

    def test_reparacion_ok_tras_caidas_resetea_y_guarda_servicio(self):
        sd = self._sd()
        sd.evaluar("notebooklm", caida(), reparacion_mal())
        r = sd.evaluar("notebooklm", caida(), reparacion_ok())
        self.assertEqual(r["accion"], "viva")
        e = sd.estado()["sesiones"]["notebooklm"]
        self.assertEqual(e["fallos_seguidos"], 0)
        self.assertEqual(e["receta_efectiva"], "receta2")
        self.assertEqual(e["tiempo_sin_servicio_s"], 0)

    def test_vuelta_tras_caida_cuenta_tiempo_sin_servicio(self):
        sd = self._sd()
        sd.evaluar("notebooklm", caida(), reparacion_mal())
        sd2 = SD.SaludDirectores(raiz=self.raiz,
                                 ahora_fn=lambda: datetime(2026, 11, 14, 12, 15, 0))
        r = sd2.evaluar("notebooklm", {"ok": True, "motivo": ""})
        self.assertEqual(r["accion"], "viva")
        e = sd2.estado()["sesiones"]["notebooklm"]
        self.assertEqual(e["tiempo_sin_servicio_s"], 900)
        self.assertIsNone(e["caida_desde"])

    def test_linea_sintesis_menciona_caida_receta_y_tiempo(self):
        sd = self._sd()
        sd.evaluar("notebooklm", caida(), reparacion_mal())
        sd.evaluar("notebooklm", caida(), reparacion_ok())
        linea = sd.linea_sintesis()
        self.assertIn("notebooklm", linea)
        self.assertIn("receta2", linea)
        self.assertIn("0 s", linea)

    def test_dedup_cruza_instancias_via_estado(self):
        self._sd().evaluar("notebooklm", caida(), reparacion_mal())
        self._sd().evaluar("notebooklm", caida(), reparacion_mal())
        r = self._sd().evaluar("notebooklm", caida(), reparacion_mal())
        self.assertEqual(r["accion"], "ya_abierta")
        self.assertEqual(len(self._tareas_cola()), 1)

    # ── Tests para evaluar_peticion_fallida (PET1116C) ────────────────────────

    def test_peticion_firma_nueva_abre_tarea_inmediatamente(self):
        """PET1116C: firma nueva abre tarea inmediatamente."""
        r = self._sd().evaluar_peticion_fallida(
            "encargo", "Error al procesar encargo ENC-1112"
        )
        self.assertEqual(r["accion"], "tarea_abierta")
        self.assertEqual(r["causa"], "firma-nueva")
        self.assertEqual(len(self._tareas_cola()), 1)

    def test_peticion_misma_firma_no_duplica(self):
        """Una tarea ya abierta por firma no se duplica."""
        sd = self._sd()
        r1 = sd.evaluar_peticion_fallida("sesion", "auth caducada: token expirado")
        self.assertEqual(r1["accion"], "tarea_abierta")
        r2 = sd.evaluar_peticion_fallida("sesion", "auth caducada: token expirado")
        self.assertEqual(r2["accion"], "ya_abierta")
        self.assertEqual(r2["id"], r1["id"])
        self.assertEqual(len(self._tareas_cola()), 1)

    def test_peticion_salva_secreto_en_registros(self):
        """Los secretos se redactan en los registros de la tarea."""
        registros = [
            "Fallo con token sk-abcdef123456789 en el cuaderno",
            "Error: password=admin123 en source_add_drive",
            "URL con clave AIza-xyz123 al acceder al drive",
        ]
        r = self._sd().evaluar_peticion_fallida("encargo", "Error de NotebookLM", registros)
        t = self._tareas_cola()[0]
        prompt = t["prompt"]
        self.assertNotIn("sk-abcdef123456789", prompt)
        self.assertNotIn("password=admin123", prompt)
        self.assertNotIn("AIza-xyz123", prompt)
        self.assertIn("[REDACTADO]", prompt)

    def test_peticion_diferente_firma_cuenta_fallos(self):
        """Diferentes firmas cuentan fallos por tipo de petición."""
        sd = self._sd()
        r1 = sd.evaluar_peticion_fallida("encargo", "Encargo fallido A")
        self.assertEqual(r1["accion"], "tarea_abierta")
        self.assertEqual(r1["causa"], "firma-nueva")
        r2 = sd.evaluar_peticion_fallida("encargo", "Encargo fallido B")
        self.assertEqual(r2["accion"], "tarea_abierta")
        r3 = sd.evaluar_peticion_fallida("alcance", "Alcance fallido")
        self.assertEqual(r3["accion"], "tarea_abierta")
        self.assertEqual(len(self._tareas_cola()), 3)

    def test_tarea_incluye_prompt_completo(self):
        """La tarea incluye el prompt completo para el agente reparador."""
        r = self._sd().evaluar_peticion_fallida(
            "encargo", "Error crítico en producción del informe",
            ["Registro1", "Registro2"]
        )
        t = self._tareas_cola()[0]
        prompt = t["prompt"]
        self.assertIn("PET1116C", prompt)
        self.assertIn("encargo", prompt)
        self.assertIn("diagnostica la causa", prompt.lower())
        self.assertIn("scripts/puente/peticiones_productor.py", prompt)
        self.assertIn("scripts/puente/test_peticiones_productor.py", prompt)

    def test_estado_peticiones_guarda_falla(self):
        """El estado de peticiones se guarda correctamente."""
        sd = self._sd()
        r1 = sd.evaluar_peticion_fallida("sesion", "Error único")
        self.assertEqual(r1["accion"], "tarea_abierta")
        estado = sd.estado()
        sesiones_petic = estado.get("sesiones_peticiones", {})
        self.assertIn("sesion", sesiones_petic)
        self.assertGreaterEqual(sesiones_petic["sesion"]["fallos_seguidos"], 1)

    # ── Tests para averías del sanador (programming exceptions) ────────────────

    def test_excepcion_programacion_nameerror_es_bug_sanador(self):
        """NameError en comprobación = bug del sanador, no caída del servicio."""
        comprobacion = {"ok": False, "motivo": "error en comprobación: name 'subprocess' is not defined"}
        r = self._sd().evaluar("notebooklm", comprobacion, reparacion_mal())
        self.assertEqual(r["accion"], "tarea_abierta")
        self.assertEqual(r["causa"], "bug-sanador")
        tareas = self._tareas_cola()
        self.assertEqual(len(tareas), 1)
        t = tareas[0]
        self.assertIn("bug del sanador", t["prompt"].lower())
        self.assertIn("nameerror", t["prompt"].lower())
        self.assertIn("subprocess", t["prompt"])

    def test_excepcion_programacion_importerror_es_bug_sanador(self):
        """ImportError en comprobación = bug del sanador."""
        comprobacion = {"ok": False, "motivo": "error en comprobación: cannot import name 'fcntl' from 'os'"}
        r = self._sd().evaluar("notebooklm", comprobacion, reparacion_mal())
        self.assertEqual(r["accion"], "tarea_abierta")
        self.assertEqual(r["causa"], "bug-sanador")
        tareas = self._tareas_cola()
        self.assertEqual(len(tareas), 1)

    def test_excepcion_programacion_typeerror_es_bug_sanador(self):
        """TypeError en comprobación = bug del sanador."""
        comprobacion = {"ok": False, "motivo": "error en comprobación: 'NoneType' object is not subscriptable"}
        r = self._sd().evaluar("higgsfield", comprobacion, reparacion_mal())
        self.assertEqual(r["accion"], "tarea_abierta")
        self.assertEqual(r["causa"], "bug-sanador")

    def test_excepcion_programacion_filenotfounderror_argv_es_bug_sanador(self):
        """FileNotFoundError del argv = bug del sanador (argv mal construido)."""
        comprobacion = {"ok": False, "motivo": "error en comprobación: [Errno 2] No such file or directory: 'account'"}
        r = self._sd().evaluar("higgsfield", comprobacion, reparacion_mal())
        self.assertEqual(r["accion"], "tarea_abierta")
        self.assertEqual(r["causa"], "bug-sanador")
        tareas = self._tareas_cola()
        t = tareas[0]
        self.assertIn("argv", t["prompt"].lower())
        self.assertIn("account", t["prompt"])

    def test_bug_sanador_no_avisa_servicio_caido(self):
        """Bug del sanador no genera aviso 'X cayó', servicio queda 'sin comprobar'."""
        comprobacion = {"ok": False, "motivo": "error en comprobación: name 'subprocess' is not defined"}
        sd = self._sd()
        r = sd.evaluar("notebooklm", comprobacion, reparacion_mal())
        self.assertEqual(r["accion"], "tarea_abierta")
        self.assertEqual(r["causa"], "bug-sanador")
        estado = sd.estado()
        sesion = estado["sesiones"]["notebooklm"]
        self.assertIn("sin_comprobar", sesion.get("estado_bug", ""))

    def test_resolucion_falsa_alarma_higgsfield(self):
        """Cada aviso de caída tiene su mensaje de vuelta '✓ resuelto (causa · arreglo)'."""
        sd = self._sd()
        comprobacion_bug = {"ok": False, "motivo": "error en comprobación: [Errno 2] No such file or directory: 'account'"}
        r1 = sd.evaluar("higgsfield", comprobacion_bug, reparacion_mal())
        self.assertEqual(r1["accion"], "tarea_abierta")
        self.assertEqual(r1["causa"], "bug-sanador")
        comprobacion_ok = {"ok": True, "motivo": "", "detalle": "higgsfield ok"}
        r2 = sd.evaluar("higgsfield", comprobacion_ok, None)
        self.assertEqual(r2["accion"], "viva")
        linea = sd.linea_sintesis()
        self.assertIn("higgsfield", linea)
        self.assertIn("viva", linea)
        estado = sd.estado()
        firma = list(estado["firmas"].keys())[0]
        self.assertEqual(estado["firmas"][firma].get("tarea_id"), "")

    # ── Tests para constructores de argv (mock subprocess.run) ──────────────────

    def test_higgsfield_argv_constructor_correcto(self):
        """higgsfield usa argv ['account'] o ['account', 'status'] con --json si existe."""
        argv_capturado = []

        def mock_run(cmd, *args, **kwargs):
            if cmd and cmd[0] in ("higgsfield", "/fake/higgsfield"):
                argv_capturado.append(cmd[1:])
                class MockResult:
                    returncode = 0
                    stdout = "higgsfield ok"
                    stderr = ""
                return MockResult()
            import subprocess
            return subprocess.run(cmd, *args, **kwargs)

        with patch("sanador_sesiones._resolver_binario", return_value="/fake/higgsfield"):
            with patch("subprocess.run", side_effect=mock_run):
                resultado = SS._comprobar_higgsfield()

        self.assertEqual(len(argv_capturado), 1)
        argv_recibido = argv_capturado[0]
        self.assertIn("account", argv_recibido)
        self.assertEqual(argv_recibido[0], "account")

    def test_notebooklm_argv_constructor_correcto(self):
        """notebooklm usa argv ['auth', 'check'] y ['list', '--json']"""
        argv_capturado = []

        def mock_run(cmd, *args, **kwargs):
            if cmd and cmd[0] in ("notebooklm", "/fake/notebooklm"):
                argv_capturado.append(cmd[1:])
                class MockResult:
                    returncode = 0
                    if "auth" in cmd and "check" in cmd:
                        stdout = ""
                    elif "list" in cmd and "--json" in cmd:
                        stdout = '[{"id": "test"}]'
                    else:
                        stdout = ""
                    stderr = ""
                return MockResult()
            import subprocess
            return subprocess.run(cmd, *args, **kwargs)

        with patch("sanador_sesiones._resolver_binario", return_value="/fake/notebooklm"):
            with patch("subprocess.run", side_effect=mock_run):
                resultado = SS._comprobar_notebooklm()

        self.assertEqual(len(argv_capturado), 2)
        self.assertEqual(argv_capturado[0], ["auth", "check"])
        self.assertEqual(argv_capturado[1], ["list", "--json"])

    def test_freellmapi_argv_constructor_correcto(self):
        """freellmapi usa argv ['ping']"""
        argv_capturado = []

        def mock_run(cmd, *args, **kwargs):
            if cmd and cmd[0] in ("freellmapi", "/fake/freellmapi"):
                argv_capturado.append(cmd[1:])
                class MockResult:
                    returncode = 0
                    stdout = "pong"
                    stderr = ""
                return MockResult()
            import subprocess
            return subprocess.run(cmd, *args, **kwargs)

        original_resolver = SS._resolver_binario
        def mock_resolver(nombre):
            if nombre == "freellmapi":
                return "/fake/freellmapi"
            return original_resolver(nombre)

        with patch("sanador_sesiones._resolver_binario", side_effect=mock_resolver):
            with patch("subprocess.run", side_effect=mock_run):
                resultado = SS._comprobar_freellmapi()

        self.assertEqual(len(argv_capturado), 1)
        self.assertEqual(argv_capturado[0], ["ping"])

    def test_nim_argv_constructor_correcto(self):
        """nim usa argv ['ping']"""
        argv_capturado = []

        def mock_run(cmd, *args, **kwargs):
            if cmd and cmd[0] in ("nim", "/fake/nim"):
                argv_capturado.append(cmd[1:])
                class MockResult:
                    returncode = 0
                    stdout = "pong"
                    stderr = ""
                return MockResult()
            import subprocess
            return subprocess.run(cmd, *args, **kwargs)

        original_resolver = SS._resolver_binario
        def mock_resolver(nombre):
            if nombre == "nim":
                return "/fake/nim"
            return original_resolver(nombre)

        with patch("sanador_sesiones._resolver_binario", side_effect=mock_resolver):
            with patch("subprocess.run", side_effect=mock_run):
                resultado = SS._comprobar_nim()

        self.assertEqual(len(argv_capturado), 1)
        self.assertEqual(argv_capturado[0], ["ping"])

    def test_google_oauth_argv_constructor_correcto(self):
        """google-oauth usa argv ['estado', 'alias']"""
        argv_capturado = []

        def mock_run(cmd, *args, **kwargs):
            if cmd and cmd[0] == "cuentas_google":
                argv_capturado.append(cmd[1:])
                class MockResult:
                    returncode = 0
                    stdout = "ok"
                    stderr = ""
                return MockResult()
            import subprocess
            return subprocess.run(cmd, *args, **kwargs)

        with patch("subprocess.run", side_effect=mock_run):
            resultado = SS._comprobar_google_oauth("alex")

        self.assertEqual(len(argv_capturado), 1)
        self.assertEqual(argv_capturado[0], ["estado", "alex"])

    def test_telegram_argv_constructor_correcto(self):
        """telegram usa argv ['getMe']"""
        argv_capturado = []

        def mock_run(cmd, *args, **kwargs):
            if cmd and cmd[0] == "telegram_bot":
                argv_capturado.append(cmd[1:])
                class MockResult:
                    returncode = 0
                    stdout = '{"ok": true}'
                    stderr = ""
                return MockResult()
            import subprocess
            return subprocess.run(cmd, *args, **kwargs)

        with patch("subprocess.run", side_effect=mock_run):
            resultado = SS._comprobar_telegram()

        self.assertEqual(len(argv_capturado), 1)
        self.assertEqual(argv_capturado[0], ["getMe"])

    def test_sanador_atrapa_excepciones_programacion_y_marca_bug(self):
        """El sanador atrapa NameError, TypeError, ImportError, FileNotFoundError y marca es_bug_sanador."""
        s = SS.SanadorSesiones()

        def comprobacion_con_nameerror():
            raise NameError("name 'subprocess' is not defined")

        def comprobacion_con_typeerror():
            raise TypeError("'NoneType' object is not subscriptable")

        def comprobacion_con_filenotfounderror():
            raise FileNotFoundError("[Errno 2] No such file or directory: 'account'")

        def comprobacion_con_importerror():
            raise ImportError("cannot import name 'fcntl'")

        for nombre, comp in [
            ("test_nameerror", comprobacion_con_nameerror),
            ("test_typeerror", comprobacion_con_typeerror),
            ("test_filenotfounderror", comprobacion_con_filenotfounderror),
            ("test_importerror", comprobacion_con_importerror),
        ]:
            s.registrar(nombre, comp, [])
            resultado = s.comprobar(nombre)
            self.assertFalse(resultado.get("ok"))
            self.assertTrue(resultado.get("es_bug_sanador"), f"Falta es_bug_sanador en {nombre}: {resultado}")
            self.assertIn("error en comprobación", resultado.get("motivo", ""))

    def test_salud_directores_detecta_bug_sanador_por_campo_es_bug_sanador(self):
        """SaludDirectores detecta bug del sanador por el campo es_bug_sanador en la comprobación."""
        comprobacion = {
            "ok": False,
            "motivo": "error en comprobación: name 'subprocess' is not defined",
            "es_bug_sanador": True
        }
        r = self._sd().evaluar("notebooklm", comprobacion, reparacion_mal())
        self.assertEqual(r["accion"], "tarea_abierta")
        self.assertEqual(r["causa"], "bug-sanador")
        tareas = self._tareas_cola()
        t = tareas[0]
        self.assertIn("bug del sanador", t["prompt"].lower())
        self.assertIn("no es una caída del servicio", t["prompt"].lower())

    def test_salud_directores_sin_campo_es_bug_sanador_usa_heuristica(self):
        """Si no hay campo es_bug_sanador, usa heurística en el motivo para detectar bugs."""
        comprobacion = {"ok": False, "motivo": "error en comprobación: name 'subprocess' is not defined"}
        r = self._sd().evaluar("notebooklm", comprobacion, reparacion_mal())
        self.assertEqual(r["causa"], "bug-sanador")

        comprobacion = {"ok": False, "motivo": "error en comprobación: cannot import name 'fcntl'"}
        r = self._sd().evaluar("notebooklm", comprobacion, reparacion_mal())
        self.assertEqual(r["causa"], "bug-sanador")

        comprobacion = {"ok": False, "motivo": "error en comprobación: 'NoneType' object is not subscriptable"}
        r = self._sd().evaluar("higgsfield", comprobacion, reparacion_mal())
        self.assertEqual(r["causa"], "bug-sanador")

        comprobacion = {"ok": False, "motivo": "error en comprobación: [Errno 2] No such file or directory: 'account'"}
        r = self._sd().evaluar("higgsfield", comprobacion, reparacion_mal())
        self.assertEqual(r["causa"], "bug-sanador")


if __name__ == "__main__":
    unittest.main()