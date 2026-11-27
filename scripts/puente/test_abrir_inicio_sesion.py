#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""SES1126A · pruebas de abrir_inicio_sesion.py. No abre nada real: open, Telegram y las CLI se simulan."""
from __future__ import annotations

import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import abrir_inicio_sesion as ais  # noqa: E402

T0 = datetime(2026, 11, 26, 12, 0, tzinfo=timezone.utc)


class Falsos:
    """Registra las llamadas a lo externo."""

    def __init__(self, abre: bool = True, telegram_ok: bool = True) -> None:
        self.abiertos: list[Path] = []
        self.mensajes: list[str] = []
        self.vigias: list[tuple[str, Path, Path]] = []
        self._abre, self._tg = abre, telegram_ok

    def abrir(self, guion: Path) -> bool:
        self.abiertos.append(guion)
        return self._abre

    def enviar(self, msg: str) -> dict:
        self.mensajes.append(msg)
        return {"ok": True} if self._tg else {"ok": False, "motivo": "sin red"}

    def vigia(self, sesion: str, guion: Path, estado: Path) -> None:
        self.vigias.append((sesion, guion, estado))


class GuionTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())

    def test_macos_usa_command_y_los_pasos_de_claude(self) -> None:
        guion, estado = ais.generar_guion("claude", self.tmp / "g", "darwin", self.tmp)
        texto = guion.read_text(encoding="utf-8")
        self.assertEqual(guion.suffix, ".command")
        self.assertIn("claude auth login || RC=1", texto)
        self.assertIn("claude setup-token || RC=1", texto)
        self.assertIn(str(estado), texto)
        self.assertTrue(guion.stat().st_mode & 0o100)

    def test_linux_usa_sh(self) -> None:
        guion, _ = ais.generar_guion("gh", self.tmp / "g", "linux", self.tmp)
        self.assertEqual(guion.suffix, ".sh")
        self.assertIn("gh auth login --web", guion.read_text(encoding="utf-8"))

    def test_la_clave_se_pide_oculta_y_nunca_va_escrita(self) -> None:
        guion, _ = ais.generar_guion("higgsfield-clave", self.tmp / "g", "darwin", self.tmp)
        texto = guion.read_text(encoding="utf-8")
        self.assertIn("read -r -s CLAVE", texto)
        self.assertIn("chmod 600", texto)
        self.assertIn(str(self.tmp / ".starseed" / "env"), texto)
        self.assertNotIn("echo $CLAVE", texto)
        self.assertNotIn("echo \"$CLAVE\"", texto)


class IniciarTest(unittest.TestCase):
    def setUp(self) -> None:
        self.home = Path(tempfile.mkdtemp())
        self.f = Falsos()

    def _iniciar(self, sesion: str = "claude", ahora: datetime = T0, entorno: dict | None = None, **kw):
        return ais.iniciar(sesion, "caída", home=self.home, plataforma=kw.get("plataforma", "darwin"),
                           entorno={} if entorno is None else entorno, abrir_fn=self.f.abrir,
                           enviar_fn=self.f.enviar, vigia_fn=self.f.vigia, ahora_fn=lambda: ahora)

    def test_sesion_sin_receta(self) -> None:
        r = self._iniciar("nada")
        self.assertFalse(r["ok"])
        self.assertEqual(self.f.abiertos, [])

    def test_con_sesion_grafica_abre_la_terminal_avisa_y_lanza_el_vigia(self) -> None:
        orig = ais._hay_sesion_grafica
        ais._hay_sesion_grafica = lambda p, e: True  # type: ignore[assignment]
        try:
            r = self._iniciar()
        finally:
            ais._hay_sesion_grafica = orig  # type: ignore[assignment]
        self.assertEqual(r["via"], "terminal")
        self.assertEqual(len(self.f.abiertos), 1)
        self.assertEqual(len(self.f.mensajes), 1)
        self.assertEqual(self.f.vigias[0][0], "claude")

    def test_sin_pantalla_manda_el_comando_exacto_por_telegram(self) -> None:
        orig = ais._hay_sesion_grafica
        ais._hay_sesion_grafica = lambda p, e: False  # type: ignore[assignment]
        try:
            r = self._iniciar()
        finally:
            ais._hay_sesion_grafica = orig  # type: ignore[assignment]
        self.assertEqual(r["via"], "telegram")
        self.assertEqual(self.f.abiertos, [])
        self.assertIn(f"bash {self.f.vigias[0][1]}", self.f.mensajes[0])

    def test_sin_terminal_ni_telegram_no_se_anota_y_dice_que_no(self) -> None:
        self.f = Falsos(abre=False, telegram_ok=False)
        r = self._iniciar(plataforma="linux")
        self.assertFalse(r["ok"])
        self.assertEqual(self.f.vigias, [])
        self.assertFalse((self.home / ".starseed" / "inicio_sesion_avisos.json").exists())

    def test_un_solo_aviso_por_sesion_cada_6_horas(self) -> None:
        self._iniciar(plataforma="linux")
        r2 = self._iniciar(plataforma="linux", ahora=T0 + timedelta(hours=5, minutes=59))
        self.assertEqual(r2["via"], "ya_avisado")
        self.assertEqual(len(self.f.mensajes), 1)
        self._iniciar(plataforma="linux", ahora=T0 + timedelta(hours=6, minutes=1))
        self.assertEqual(len(self.f.mensajes), 2)

    def test_otra_sesion_no_hereda_el_silencio(self) -> None:
        self._iniciar("claude", plataforma="linux")
        r = self._iniciar("gh", plataforma="linux")
        self.assertNotEqual(r["via"], "ya_avisado")


class VigilarTest(unittest.TestCase):
    def setUp(self) -> None:
        self.estado = Path(tempfile.mkdtemp()) / "estado-claude.txt"
        self.avisos: list[str] = []

    def _vigilar(self, comprueba: bool, dormir=lambda s: None, espera: float = 30) -> str:
        return ais.vigilar("claude", self.estado, comprobar_fn=lambda argv: comprueba,
                           enviar_fn=lambda m: self.avisos.append(m) or {"ok": True},
                           espera_s=espera, sondeo_s=10, dormir=dormir)

    def test_estado_y_sesion_buena_avisa_una_vez(self) -> None:
        self.estado.write_text("ok\n")
        self.assertEqual(self._vigilar(True), "ok")
        self.assertEqual(len(self.avisos), 1)

    def test_estado_pero_la_cli_no_responde_es_fallo(self) -> None:
        self.estado.write_text("ok\n")
        self.assertEqual(self._vigilar(False), "fallo")
        self.assertEqual(len(self.avisos), 1)

    def test_espera_el_archivo_y_luego_comprueba(self) -> None:
        pasos: list[float] = []

        def dormir(s: float) -> None:
            pasos.append(s)
            if len(pasos) == 2:
                self.estado.write_text("ok\n")

        self.assertEqual(self._vigilar(True, dormir), "ok")
        self.assertEqual(len(pasos), 2)

    def test_sin_estado_caduca_y_avisa_una_vez(self) -> None:
        self.assertEqual(self._vigilar(True), "caducado")
        self.assertEqual(len(self.avisos), 1)


if __name__ == "__main__":
    unittest.main()
