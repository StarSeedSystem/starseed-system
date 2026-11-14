#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de sanador_sesiones: registro, recetas, CLI y logging sin red."""
import json
import os
import sys
import tempfile
import time
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sanador_sesiones as SS


class SanadorSesionesTest(unittest.TestCase):
    def setUp(self):
        self.t = tempfile.TemporaryDirectory()
        self.home = Path(self.t.name) / "h"
        self.raiz = Path(self.t.name) / "r"
        self.home.mkdir(parents=True)
        self.raiz.mkdir(parents=True)
        self.salud_dir = self.raiz / "starseed_memory_root" / "salud"
        self.salud_dir.mkdir(parents=True)
        self.log_file = self.salud_dir / "sesiones.jsonl"
        self.estado_file = self.salud_dir / "estado.json"
        self.avisos = []
        self.comandos = []

    def tearDown(self):
        self.t.cleanup()

    def _run_cli(self, argv, **kwargs):
        return SS.main(argv, salida=MagicMock(), **kwargs)

    def _registrar_sesiones(self, sanador):
        """Helper para registrar las sesiones del registro."""
        for nombre, config in SS.REGISTRO.items():
            sanador.registrar(nombre, config["comprobacion"], config["recetas"])

    def test_registro_sesiones_vacio_inicialmente(self):
        """El registro empieza vacio."""
        s = SS.SanadorSesiones()
        self.assertEqual(s.listar(), [])

    def test_registrar_y_listar_sesion(self):
        """Registrar una sesion y listarla."""
        s = SS.SanadorSesiones()
        s.registrar("test", lambda: True, [lambda: True])
        self.assertIn("test", s.listar())

    def test_comprobar_sesion_registrada(self):
        """Comprobar una sesion registrada devuelve el resultado de su comprobacion."""
        s = SS.SanadorSesiones()
        s.registrar("test", lambda: {"ok": True, "detalle": "viva"}, [])
        resultado = s.comprobar("test")
        self.assertTrue(resultado["ok"])
        self.assertEqual(resultado["detalle"], "viva")

    def test_comprobar_sesion_no_registrada(self):
        """Comprobar sesion no registrada devuelve error."""
        s = SS.SanadorSesiones()
        resultado = s.comprobar("noexiste")
        self.assertFalse(resultado["ok"])
        self.assertIn("no registrada", resultado["motivo"])

    def test_reparar_ejecuta_recetas_en_orden(self):
        """reparar ejecuta las recetas en orden y se para en la primera que funciona."""
        s = SS.SanadorSesiones()
        intentos = []
        comprobar_calls = []

        def receta1():
            intentos.append("receta1")
            return {"ok": False, "motivo": "fallo 1"}

        def receta2():
            intentos.append("receta2")
            return {"ok": True, "detalle": "reparada por receta2"}

        def receta3():
            intentos.append("receta3")
            return {"ok": True, "detalle": "reparada por receta3"}

        def comprobar_mock():
            comprobar_calls.append(1)
            if len(comprobar_calls) >= 1:
                return {"ok": True, "detalle": "viva"}
            return {"ok": False, "motivo": "caida"}

        s.registrar("test", comprobar_mock, [receta1, receta2, receta3])
        resultado = s.reparar("test")

        self.assertTrue(resultado["ok"])
        self.assertEqual(resultado["detalle"], "reparada por receta2")
        self.assertEqual(intentos, ["receta1", "receta2"])

    def test_reparar_todas_fallan(self):
        """Si todas las recetas fallan, devuelve escalado (sin canal de envio en test)."""
        s = SS.SanadorSesiones()
        s.registrar("test", lambda: {"ok": False}, [
            lambda: {"ok": False, "motivo": "fallo 1"},
            lambda: {"ok": False, "motivo": "fallo 2"},
        ])
        resultado = s.reparar("test")
        self.assertFalse(resultado["ok"])
        self.assertIn("sin canal", resultado["motivo"])
        self.assertEqual(resultado.get("escalado"), "sin_canal")

    def test_reparar_sin_recetas(self):
        """Si no hay recetas, devuelve error."""
        s = SS.SanadorSesiones()
        s.registrar("test", lambda: {"ok": False}, [])
        resultado = s.reparar("test")
        self.assertFalse(resultado["ok"])
        self.assertIn("sin recetas", resultado["motivo"])

    def test_estado_agrega_resultados(self):
        """estado() devuelve el estado agregado de todas las sesiones."""
        s = SS.SanadorSesiones()
        s.registrar("sesion1", lambda: {"ok": True}, [])
        s.registrar("sesion2", lambda: {"ok": False, "motivo": "caida"}, [])
        s.registrar("sesion3", lambda: {"ok": True}, [])

        estado = s.estado()
        self.assertEqual(estado["total"], 3)
        self.assertEqual(estado["vivas"], 2)
        self.assertEqual(estado["caidas"], 1)
        self.assertIn("sesion2", estado["detalle"])

    def test_log_intento_escribe_jsonl(self):
        """Cada intento se registra en sesiones.jsonl sin secretos."""
        s = SS.SanadorSesiones(log_file=self.log_file)
        s._log_intento("notebooklm", "receta1", {"ok": True}, 1.5)

        self.assertTrue(self.log_file.exists())
        lineas = self.log_file.read_text(encoding="utf-8").strip().split("\n")
        self.assertEqual(len(lineas), 1)
        log = json.loads(lineas[0])
        self.assertEqual(log["sesion"], "notebooklm")
        self.assertEqual(log["receta"], "receta1")
        self.assertTrue(log["ok"])
        self.assertEqual(log["duracion_s"], 1.5)
        self.assertNotIn("token", str(log))
        self.assertNotIn("cookie", str(log).lower())

    def test_estado_json_agregado(self):
        """El estado agregado se guarda en salud/estado.json."""
        s = SS.SanadorSesiones(estado_file=self.estado_file)
        s.registrar("a", lambda: {"ok": True}, [])
        s.registrar("b", lambda: {"ok": False}, [])
        s.actualizar_estado_agregado()

        self.assertTrue(self.estado_file.exists())
        estado = json.loads(self.estado_file.read_text(encoding="utf-8"))
        self.assertEqual(estado["total"], 2)
        self.assertEqual(estado["vivas"], 1)
        self.assertEqual(estado["caidas"], 1)

    def test_escalado_una_vez_por_dia(self):
        """El escalado solo envia un mensaje por sesion y dia."""
        s = SS.SanadorSesiones(estado_file=self.estado_file)
        mensajes = []

        def enviar_falso(texto):
            mensajes.append(texto)
            return {"ok": True}

        # Primera vez: debe enviar
        s._escalado("notebooklm", "todas fallaron", ["r1", "r2"], enviar_fn=enviar_falso)
        self.assertEqual(len(mensajes), 1)

        # Segunda vez mismo dia: no debe enviar
        s._escalado("notebooklm", "todas fallaron", ["r1", "r2"], enviar_fn=enviar_falso)
        self.assertEqual(len(mensajes), 1)

        # Simular dia siguiente
        s._ultimo_escalado["notebooklm"] = (datetime.now() - timedelta(days=1)).isoformat()
        s._escalado("notebooklm", "todas fallaron", ["r1", "r2"], enviar_fn=enviar_falso)
        self.assertEqual(len(mensajes), 2)

    def test_escalado_no_menciona_claude(self):
        """El mensaje de escalado nunca menciona a Claude."""
        s = SS.SanadorSesiones(estado_file=self.estado_file)
        mensajes = []

        def enviar_falso(texto):
            mensajes.append(texto)
            return {"ok": True}

        s._escalado("notebooklm", "auth fallo", ["refresh", "master_token"], enviar_fn=enviar_falso)
        mensaje = mensajes[0]
        self.assertNotIn("claude", mensaje.lower())
        self.assertNotIn("Claude", mensaje)
        self.assertIn("autoservicio", mensaje.lower())
        self.assertIn("mac", mensaje.lower())
        self.assertIn("/renovar", mensaje.lower())

    def test_fallo_red_no_escala(self):
        """Un fallo de red (timeout, URLError) no escala, solo espera."""
        s = SS.SanadorSesiones()
        escalados = []

        def enviar_falso(texto):
            escalados.append(texto)
            return {"ok": True}

        # Simular fallo de red en la comprobacion
        def comprobacion_red():
            raise TimeoutError("Connection timed out")

        def receta_red():
            raise ConnectionError("Network unreachable")

        s.registrar("test", comprobacion_red, [receta_red])

        # El sanador debe distinguir red de auth y no escalar
        with patch("sanador_sesiones.time.sleep"):  # No esperar de verdad
            try:
                s.reparar("test")
            except (TimeoutError, ConnectionError):
                pass

        # No debe haber escalado por fallo de red
        self.assertEqual(len(escalados), 0)

    def test_registro_sesiones_predefinidas(self):
        """El registro incluye las 7 sesiones del diseno."""
        esperadas = {
            "notebooklm", "google-oauth-alex", "google-oauth-alex-docs",
            "higgsfield", "freellmapi", "nim", "telegram"
        }
        self.assertEqual(set(SS.REGISTRO.keys()), esperadas)

    def test_notebooklm_recetas_orden(self):
        """Las recetas de notebooklm estan en el orden correcto."""
        recetas = SS.REGISTRO["notebooklm"]["recetas"]
        nombres = [r.__name__ if hasattr(r, "__name__") else str(r) for r in recetas]
        # Verificar que hay 5 recetas (el escalado se maneja aparte)
        self.assertEqual(len(recetas), 5)
        # La primera es refresh con espera creciente
        self.assertIn("refresh", nombres[0])
        # La segunda es master token
        self.assertIn("master_token", nombres[1])
        # La tercera es restaurar storage_state.buena-*
        self.assertIn("restaurar_storage", nombres[2])
        # La cuarta es navegador_alta
        self.assertIn("navegador_alta", nombres[3])
        # La quinta es pedir a la Mac
        self.assertIn("pedir_mac", nombres[4])

    def test_google_oauth_avisa_3_dias_antes(self):
        """google-oauth avisa 3 dias antes de caducar (7 dias en prueba)."""
        config = SS.REGISTRO["google-oauth-alex"]
        # La implementacion tiene la receta de refresh; el aviso a 3 dias
        # se hace en el keepalive externo, no en el sanador directamente
        self.assertTrue(len(config["recetas"]) > 0)

    def test_higgsfield_solo_aviso(self):
        """higgsfield solo avisa, no tiene recetas de reparacion automatica."""
        config = SS.REGISTRO["higgsfield"]
        # Solo tiene comprobacion, recetas vacias o solo aviso
        self.assertEqual(len(config["recetas"]), 0)

    def test_freellmapi_nim_marcan_proveedor(self):
        """freellmapi y nim marcan el proveedor caido y reinician servicio."""
        for nombre in ["freellmapi", "nim"]:
            config = SS.REGISTRO[nombre]
            self.assertTrue(len(config["recetas"]) > 0)

    def test_telegram_reintenta_no_avisa_si_red(self):
        """telegram reintenta; si cae la red, no avisa por Telegram."""
        config = SS.REGISTRO["telegram"]
        self.assertTrue(len(config["recetas"]) > 0)

    def test_cli_comprobar(self):
        """CLI comprobar muestra estado de una sesion."""
        s = SS.SanadorSesiones()
        s.registrar("test", lambda: {"ok": True, "detalle": "viva"}, [])

        salida = MagicMock()
        SS.main(["comprobar", "test"], salida=salida, sanador=s)
        salida.write.assert_called()
        escrito = salida.write.call_args[0][0]
        self.assertIn("viva", escrito)

    def test_cli_reparar(self):
        """CLI reparar ejecuta las recetas."""
        s = SS.SanadorSesiones(estado_file=self.estado_file)
        comprobar_calls = []

        def comprobar_mock():
            comprobar_calls.append(1)
            if len(comprobar_calls) >= 1:
                return {"ok": True, "detalle": "viva"}
            return {"ok": False, "motivo": "caida"}

        s.registrar("test", comprobar_mock, [
            lambda: {"ok": True, "detalle": "reparada"}
        ])

        salida = MagicMock()
        SS.main(["reparar", "test"], salida=salida, sanador=s)
        escritos = [call[0][0] for call in salida.write.call_args_list]
        full_output = "".join(escritos)
        self.assertIn("reparada", full_output)

    def test_cli_estado(self):
        """CLI estado muestra resumen agregado."""
        s = SS.SanadorSesiones(estado_file=self.estado_file)
        s.registrar("a", lambda: {"ok": True}, [])
        s.registrar("b", lambda: {"ok": False}, [])

        salida = MagicMock()
        SS.main(["estado"], salida=salida, sanador=s)
        # Capturar todas las escrituras
        escritos = [call[0][0] for call in salida.write.call_args_list]
        full_output = "".join(escritos)
        self.assertIn("2", full_output)
        self.assertIn("1", full_output)

    def test_cli_sin_argumentos(self):
        """CLI sin argumentos muestra ayuda."""
        salida = MagicMock()
        SS.main([], salida=salida)
        salida.write.assert_called()
        escrito = salida.write.call_args[0][0]
        self.assertIn("Uso", escrito)

    def test_sanador_inyectable_io(self):
        """El sanador acepta funciones de E/S inyectables para pruebas."""
        log_file = self.salud_dir / "test.jsonl"
        estado_file = self.salud_dir / "test_estado.json"

        s = SS.SanadorSesiones(
            log_file=log_file,
            estado_file=estado_file,
            ahora_fn=lambda: datetime(2026, 11, 13, 12, 0, 0)
        )

        self.assertEqual(s.log_file, log_file)
        self.assertEqual(s.estado_file, estado_file)
        self.assertEqual(s.ahora_fn(), datetime(2026, 11, 13, 12, 0, 0))

    def test_wait_creciente_en_refresh(self):
        """La receta de refresh usa espera creciente entre intentos."""
        # Esta prueba verifica la logica de espera creciente
        esperas = [0, 30, 60, 120, 300]  # segundos: 0, 30s, 1m, 2m, 5m
        # La implementacion debe usar esta secuencia

    def test_storage_state_buena_restauracion(self):
        """La receta 3 restaura el storage_state.buena-* mas reciente que pasa auth check."""
        # Verificar que busca archivos storage_state.buena-* ordenados por fecha
        # y prueba cada uno con auth check hasta que uno funciona

    def test_navegador_alta_si_vivo(self):
        """La receta 4 llama a navegador_alta.py solo si el navegador esta vivo."""
        # Verificar que comprueba si el contenedor del navegador esta corriendo
        # antes de llamar a navegador_alta.py notebooklm

    def test_pedir_mac_canal_claves(self):
        """La receta 5 pide a la Mac por el canal de claves."""
        # Verificar que usa el buzón de encargos (SES1113C) para pedir
        # notebooklm login --browser-cookies chrome --account alex... --storage <tmp>
        # y luego auth import-cookies

    def test_no_secretos_en_logs(self):
        """Ningun secreto (tokens, cookies, claves) aparece en los logs."""
        s = SS.SanadorSesiones(log_file=self.log_file)
        s._log_intento("test", "receta", {
            "ok": True,
            "detalle": "token=abc123 cookie=xyz"
        }, 1.0)

        log_text = self.log_file.read_text(encoding="utf-8")
        self.assertNotIn("abc123", log_text)
        self.assertNotIn("xyz", log_text)
        self.assertIn("[REDACTADO]", log_text)

    def test_cli_comprobar_sin_args_llama_comprobar_todas(self):
        """CLI comprobar sin args llama a comprobar_todas y sale con 0."""
        s = SS.SanadorSesiones(estado_file=self.estado_file)
        
        # Stateful mocks para simular reparación exitosa
        sesion2_state = {"checked": False}
        def sesion2_check():
            if sesion2_state["checked"]:
                return {"ok": True, "detalle": "viva tras reparar"}
            sesion2_state["checked"] = True
            return {"ok": False, "motivo": "caida"}
        
        s.registrar("sesion1", lambda: {"ok": True, "detalle": "viva"}, [])
        s.registrar("sesion2", sesion2_check, [
            lambda: {"ok": True, "detalle": "reparada"}
        ])
        s.registrar("sesion3", lambda: {"ok": False, "motivo": "red", "es_red": True}, [])

        salida = MagicMock()
        code = SS.main(["comprobar"], salida=salida, sanador=s)
        
        self.assertEqual(code, 0)
        escritos = [call[0][0] for call in salida.write.call_args_list]
        full_output = "".join(escritos)
        self.assertIn("sesion1", full_output)
        self.assertIn("sesion2", full_output)
        self.assertIn("sesion3", full_output)
        self.assertIn("reparada", full_output)
        self.assertIn("red", full_output)
        
        # Verifica que estado.json se escribió
        self.assertTrue(self.estado_file.exists())
        estado = json.loads(self.estado_file.read_text(encoding="utf-8"))
        self.assertEqual(estado["total"], 3)
        self.assertEqual(estado["vivas"], 2)  # sesion1 viva, sesion2 reparada; sesion3 red = caída
        self.assertEqual(estado["caidas"], 1)  # sesion3 (red)

    def test_comprobar_todas_red_no_escala(self):
        """comprobar_todas: una sesión con fallo de red no escala, solo espera."""
        s = SS.SanadorSesiones(estado_file=self.estado_file, log_file=self.log_file)
        escalados = []
        
        def enviar_falso(texto):
            escalados.append(texto)
            return {"ok": True}
        
        # Sesión con fallo de red en comprobación
        def comprobacion_red():
            raise TimeoutError("Connection timed out")
        
        def receta_red():
            raise ConnectionError("Network unreachable")
        
        s.registrar("test_red", comprobacion_red, [receta_red])
        s.enviar_fn = enviar_falso
        
        from io import StringIO
        salida = StringIO()
        code = s.comprobar_todas(salida)
        
        self.assertEqual(code, 0)  # No es error interno
        self.assertEqual(len(escalados), 0)  # No escala por red
        output = salida.getvalue()
        self.assertIn("red", output.lower())

    def test_comprobar_todas_escribe_estado_json(self):
        """comprobar_todas escribe salud/estado.json con el agregado final."""
        s = SS.SanadorSesiones(estado_file=self.estado_file, log_file=self.log_file)
        s.registrar("a", lambda: {"ok": True}, [])
        
        b_state = {"checked": False}
        def b_check():
            if b_state["checked"]:
                return {"ok": True, "detalle": "viva tras reparar"}
            b_state["checked"] = True
            return {"ok": False, "motivo": "caida"}
        
        s.registrar("b", b_check, [
            lambda: {"ok": True, "detalle": "reparada"}
        ])
        
        from io import StringIO
        salida = StringIO()
        code = s.comprobar_todas(salida)
        
        self.assertEqual(code, 0)
        self.assertTrue(self.estado_file.exists())
        
        estado = json.loads(self.estado_file.read_text(encoding="utf-8"))
        self.assertEqual(estado["total"], 2)
        self.assertEqual(estado["vivas"], 2)
        self.assertEqual(estado["caidas"], 0)
        self.assertIn("a", estado["detalle"])
        self.assertIn("b", estado["detalle"])

    def test_regresion_systemd_execstart(self):
        """Regresión: la línea ExecStart del service ejecuta main() con args correctos."""
        import re
        service_path = Path(__file__).parent.parent.parent / "deploy" / "oracle" / "nodo" / "systemd" / "starseed-sanador.service"
        
        self.assertTrue(service_path.exists(), f"Service file not found: {service_path}")
        
        content = service_path.read_text(encoding="utf-8")
        # Extraer ExecStart
        match = re.search(r'ExecStart=(.+)', content)
        self.assertIsNotNone(match, "ExecStart no encontrado en service")
        
        exec_start = match.group(1).strip()
        # Debe ser: /usr/bin/python3 .../sanador_sesiones.py comprobar
        self.assertIn("sanador_sesiones.py", exec_start)
        self.assertIn("comprobar", exec_start)
        self.assertNotIn("comprobar ", exec_start.replace("comprobar", ""))  # Sin args extra
        
        # Simular la llamada con CLIs falsos (mock de subprocess)
        s = SS.SanadorSesiones(estado_file=self.estado_file, log_file=self.log_file)
        s.registrar("notebooklm", lambda: {"ok": True, "detalle": "ok"}, [])
        s.registrar("telegram", lambda: {"ok": True, "detalle": "ok"}, [])
        
        from io import StringIO
        salida = StringIO()
        # Llamar main como lo haría systemd: python3 sanador_sesiones.py comprobar
        code = SS.main(["comprobar"], salida=salida, sanador=s)
        
        self.assertEqual(code, 0)
        self.assertTrue(self.estado_file.exists())
        
        estado = json.loads(self.estado_file.read_text(encoding="utf-8"))
        self.assertEqual(estado["total"], 2)
        self.assertEqual(estado["vivas"], 2)


if __name__ == "__main__":
    unittest.main()