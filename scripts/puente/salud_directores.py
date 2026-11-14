#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Directores: incidentes de salud de sesiones → olas de reparación automáticas (SES1113E).

Lo llama el líder tras cada `sanador_sesiones.py comprobar`. Si una sesión falla
todas las recetas dos veces seguidas, o aparece una firma de error nueva (hash
del mensaje normalizado), abre una tarea de diagnóstico y parche en
`starseed_memory_root/olas/cola-auto-salud-<fecha>.json`, con los registros
recortados y sin secretos, los archivos implicados y las pruebas que deben
pasar. Sin duplicados: una tarea abierta por firma.

El estado (caídas, recetas que funcionaron y tiempo sin servicio) queda en
`starseed_memory_root/salud/directores.json`: lo leen el parte diario, el panel
«Salud de sesiones» del Mando y la línea de la síntesis (`linea_sintesis`).

CLI: evaluar <sesion> [--comprobacion JSON] [--reparacion JSON] [--registros TXT]
     estado, linea
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

RAIZ_DEF = Path(__file__).parent.parent.parent
SALUD_DEF = RAIZ_DEF / "starseed_memory_root" / "salud"
OLAS_DEF = RAIZ_DEF / "starseed_memory_root" / "olas"
ESTADO_DEF = SALUD_DEF / "directores.json"

ARCHIVOS_SESION = ["scripts/puente/sanador_sesiones.py", "scripts/puente/test_sanador_sesiones.py"]
OLA_SALUD = "SES1113 · salud de directores"
MAX_FALLOS = 2


def _ahora_defecto() -> datetime:
    return datetime.now()


def _leer_json(ruta: Path, defecto=None):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def _escribir_atomico(ruta: Path, datos) -> None:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=ruta.parent, prefix=".tmp_")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False, indent=1)
            f.write("\n")
        os.replace(tmp, ruta)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


# Normalización de mensajes: lo que varía entre intentos (números, rutas, IPs,
# tiempos, secretos) se redacta para que la firma describa la CAUSA, no el caso.
_PATRONES_SECRETOS = [
    (re.compile(r"(?i)\b(sk-|gsk_|gh[pousr]_|AIza|nvapi-|hf_|xox[abprs]-)[A-Za-z0-9._\-]{6,}"), "[REDACTADO]"),
    (re.compile(r"(?i)token[\"']?\s*[:=]\s*[\"']?[A-Za-z0-9._\-]{3,}"), "token=[REDACTADO]"),
    (re.compile(r"(?i)cookie[\"']?\s*[:=]\s*[\"']?[A-Za-z0-9._\-]{3,}"), "cookie=[REDACTADO]"),
    (re.compile(r"(?i)password[\"']?\s*[:=]\s*[\"']?[A-Za-z0-9._\-]{3,}"), "password=[REDACTADO]"),
    (re.compile(r"(?i)secret[\"']?\s*[:=]\s*[\"']?[A-Za-z0-9._\-]{3,}"), "secret=[REDACTADO]"),
]

# Normalización de mensajes: lo que varía entre intentos (números, rutas, IPs,
# tiempos, secretos) se redacta para que la firma describa la CAUSA, no el caso.
_PATRONES = _PATRONES_SECRETOS + [
    (re.compile(r"\b\d{1,3}(\.\d{1,3}){3}\b"), "<IP>"),
    (re.compile(r"(?i)\b\d+(?:[.,]\d+)?\s*(?:s|seg|segundos|min|minutos|ms|h)\b"), "<TIEMPO>"),
    (re.compile(r"(?i)\b\d{4}-\d{2}-\d{2}[T ]?\d{0,2}:?\d{0,2}:?\d{0,2}\b"), "<FECHA>"),
    (re.compile(r"(?i)\b\d+(?:[.,]\d+)?%"), "<PCT>"),
    (re.compile(r"(?i)(?:/[\w.\-]+){2,}"), "<RUTA>"),
    (re.compile(r"\b\d+\b"), "<N>"),
    (re.compile(r"\s+"), " "),
]


def _redactar_secretos(texto: str) -> str:
    """Sustituye los secretos por [REDACTADO], sin tocar el resto del texto."""
    t = texto or ""
    for patron, sust in _PATRONES_SECRETOS:
        t = patron.sub(sust, t)
    return t


def normalizar(texto: str) -> str:
    """Mensaje normalizado: minúsculas, secretos y números fuera, espacios colapsados."""
    t = _redactar_secretos((texto or "").lower().strip())
    for patron, sust in _PATRONES[len(_PATRONES_SECRETOS):]:
        t = patron.sub(sust, t)
    return t.strip()


def firma(texto: str) -> str:
    """Hash del mensaje normalizado: 16 hex que identifican la causa del error."""
    return hashlib.sha256(normalizar(texto).encode("utf-8")).hexdigest()[:16]


def recortar(texto: str | list[str], max_lineas: int = 12, max_chars: int = 200) -> list[str]:
    """Registros recortados y sin secretos: máx N líneas, máx M caracteres por línea."""
    lineas = "\n".join(texto) if isinstance(texto, list) else (texto or "")
    lineas = _redactar_secretos(lineas or "").strip().splitlines()
    return [l.strip()[:max_chars] for l in lineas[-max_lineas:] if l.strip()]


class SaludDirectores:
    """Núcleo puro con E/S inyectable: evalúa incidentes y abre olas de reparación."""

    def __init__(self, raiz: Path | None = None, ahora_fn: Callable[[], datetime] | None = None,
                 estado_file: Path | None = None, olas_dir: Path | None = None,
                 firmas_conocidas: set[str] | None = None):
        self.raiz = Path(raiz) if raiz else RAIZ_DEF
        self.ahora_fn = ahora_fn or _ahora_defecto
        self.estado_file = Path(estado_file) if estado_file else self.raiz / "starseed_memory_root" / "salud" / "directores.json"
        self.olas_dir = Path(olas_dir) if olas_dir else self.raiz / "starseed_memory_root" / "olas"
        self._firmas_seed = set(firmas_conocidas or ())

    # ── Estado persistente (salud/directores.json) ──

    def _cargar(self) -> dict[str, Any]:
        e = _leer_json(self.estado_file, {}) or {}
        if not isinstance(e.get("sesiones"), dict):
            e["sesiones"] = {}
        if not isinstance(e.get("firmas"), dict):
            e["firmas"] = {}
        for f in self._firmas_seed:
            e["firmas"].setdefault(f, {"sesion": "(semilla)", "ts": "", "tarea_id": ""})
        return e

    def _guardar(self, estado: dict[str, Any]) -> None:
        _escribir_atomico(self.estado_file, estado)

    def estado(self) -> dict[str, Any]:
        return self._cargar()

    def _sesion(self, estado: dict[str, Any], nombre: str) -> dict[str, Any]:
        s = estado["sesiones"].setdefault(nombre, {})
        s.setdefault("fallos_seguidos", 0)
        s.setdefault("caida_desde", None)
        s.setdefault("receta_efectiva", "")
        s.setdefault("tiempo_sin_servicio_s", 0)
        return s

    def _marcar_viva(self, estado: dict[str, Any], nombre: str, receta: str = "") -> dict[str, Any]:
        s = self._sesion(estado, nombre)
        s["fallos_seguidos"] = 0
        if receta:
            s["receta_efectiva"] = receta
        if s["caida_desde"]:
            caida = datetime.fromisoformat(s["caida_desde"])
            s["tiempo_sin_servicio_s"] += int((self.ahora_fn() - caida).total_seconds())
            s["caida_desde"] = None
        self.cerrar_firma_si_resuelta(estado, nombre)
        return s

    # ── Evaluación (llama el líder tras cada comprobar del sanador) ──

    def evaluar(self, sesion: str, comprobacion: dict[str, Any],
                reparacion: dict[str, Any] | None = None,
                registros: str | list[str] = "") -> dict[str, Any]:
        """Evalúa un incidente; abre tarea si toca y devuelve {accion, id?, causa?}."""
        estado = self._cargar()
        s = self._sesion(estado, sesion)
        viva = bool(comprobacion.get("ok")) or bool((reparacion or {}).get("ok"))
        receta = ""
        if viva and reparacion and reparacion.get("ok"):
            recetas = reparacion.get("recetas") or []
            receta = str(recetas[-1]) if recetas else ""
        if viva:
            self._marcar_viva(estado, sesion, receta)
            self._guardar(estado)
            return {"accion": "viva", "fallos_seguidos": 0}
        return self._incidente(estado, sesion, s, comprobacion, reparacion, registros)

    def _incidente(self, estado: dict[str, Any], sesion: str, s: dict[str, Any],
                   comprobacion: dict[str, Any], reparacion: dict[str, Any] | None,
                   registros: str | list[str]) -> dict[str, Any]:
        mensaje = str(comprobacion.get("motivo") or (reparacion or {}).get("motivo") or "caída")
        fir = firma(mensaje)
        s["fallos_seguidos"] = int(s.get("fallos_seguidos", 0)) + 1
        if not s.get("caida_desde"):
            s["caida_desde"] = self.ahora_fn().isoformat()
        ya = estado["firmas"].get(fir, {})
        if ya.get("tarea_id"):
            self._guardar(estado)
            return {"accion": "ya_abierta", "id": ya["tarea_id"], "firma": fir}
        causa = ""
        if fir not in estado["firmas"]:
            causa = "firma-nueva"
        elif int(s.get("fallos_seguidos", 0)) >= MAX_FALLOS:
            causa = "dos-seguidas"
        if not causa:
            self._guardar(estado)
            return {"accion": "espera", "fallos_seguidos": s["fallos_seguidos"], "firma": fir}
        tarea = self._crear_tarea(estado, sesion, fir, mensaje, causa, registros)
        self._guardar(estado)
        return {"accion": "tarea_abierta", "id": tarea["id"], "causa": causa, "firma": fir}

    def _crear_tarea(self, estado: dict[str, Any], sesion: str, fir: str, mensaje: str,
                     causa: str, registros: str | list[str]) -> dict[str, Any]:
        ahora = self.ahora_fn()
        tid = "SAL%s-%s" % (ahora.strftime("%m%d"), fir[:6].upper())
        reg = recortar(registros)
        prompt = (
            "Tarea automática de salud (%s, causa %s): la sesión «%s» falló su comprobación y "
            "las recetas del sanador no la levantaron. Firma de error: %s. Mensaje normalizado: "
            "«%s». Diagnostica la CAUSA y parchea; no toques archivos ajenos a la sesión; no "
            "muestres claves (usa nombres de variables de entorno). Archivos implicados: %s. "
            "Registros recortados y sin secretos:\n```\n%s\n```\nPruebas que deben pasar: "
            "python3 scripts/puente/test_salud_directores.py y python3 "
            "scripts/puente/test_sanador_sesiones.py."
            % (ahora.strftime("%Y-%m-%d %H:%M"), causa, sesion, fir, normalizar(mensaje),
               ", ".join(ARCHIVOS_SESION), "\n".join(reg) or "(sin registros)")
        )
        tarea = {
            "id": tid, "ola": OLA_SALUD, "titulo": "Reparar sesión %s: %s" % (sesion, normalizar(mensaje)[:70]),
            "archivos": list(ARCHIVOS_SESION), "depende": [], "origen": "salud-directores",
            "firma": fir, "prompt": prompt,
        }
        fecha = ahora.strftime("%Y-%m-%d")
        ruta_cola = self.olas_dir / ("cola-auto-salud-%s.json" % fecha)
        cola = _leer_json(ruta_cola, None)
        if not isinstance(cola, dict):
            cola = {"ola": OLA_SALUD, "tareas": []}
        cola.setdefault("ola", OLA_SALUD)
        cola.setdefault("tareas", []).append(tarea)
        _escribir_atomico(ruta_cola, cola)
        estado["firmas"][fir] = {"sesion": sesion, "ts": ahora.isoformat(), "tarea_id": tid,
                                 "causa": causa}
        return tarea

    # ── Resumen para el parte diario, el Mando y la síntesis ──

    def resumen(self) -> dict[str, Any]:
        """Caídas, recetas que funcionaron y tiempo sin servicio, por sesión."""
        estado = self._cargar()
        ahora = self.ahora_fn()
        sesiones = {}
        for nombre, s in estado["sesiones"].items():
            caida_s = 0.0
            if s.get("caida_desde"):
                caida_s = (ahora - datetime.fromisoformat(s["caida_desde"])).total_seconds()
            sesiones[nombre] = {
                "estado": "caída" if s.get("caida_desde") else "viva",
                "fallos_seguidos": s.get("fallos_seguidos", 0),
                "receta_efectiva": s.get("receta_efectiva", ""),
                "tiempo_sin_servicio_s": int(s.get("tiempo_sin_servicio_s", 0)),
                "sin_servicio_ahora_s": int(caida_s),
            }
        return {"ts": ahora.isoformat(), "sesiones": sesiones}

    def linea_sintesis(self) -> str:
        """Una línea de salud para la síntesis diaria."""
        r = self.resumen()
        partes = []
        for nombre, s in r["sesiones"].items():
            trozo = "%s: %s" % (nombre, s["estado"])
            if s["receta_efectiva"]:
                trozo += " (recuperada por %s)" % s["receta_efectiva"]
            trozo += ", tiempo sin servicio %d s" % s["tiempo_sin_servicio_s"]
            partes.append(trozo)
        return "Salud de sesiones: " + ("; ".join(partes) if partes else "sin datos") + "."

    def cerrar_firma_si_resuelta(self, estado: dict[str, Any], sesion: str) -> None:
        """Al volver la sesión, la tarea abierta por firma deja de estar abierta."""
        for fir, d in estado["firmas"].items():
            if d.get("sesion") == sesion and d.get("tarea_id"):
                d["tarea_id"] = ""
                d["resuelta"] = self.ahora_fn().isoformat()


def main(argv: list[str] | None = None, salida=None) -> int:
    """CLI: evaluar <sesion> [--comprobacion JSON --reparacion JSON --registros TXT], estado, linea."""
    argv = list(argv) if argv is not None else sys.argv[1:]
    salida = salida or sys.stdout
    sd = SaludDirectores()
    if not argv or argv[0] in ("-h", "--ayuda"):
        salida.write(
            "Uso: python3 salud_directores.py <comando>\n"
            "Comandos:\n"
            "  evaluar <sesion> [--comprobacion JSON --reparacion JSON --registros TXT]\n"
            "  estado   Resumen (caídas, recetas que funcionaron, tiempo sin servicio)\n"
            "  linea    Una línea de salud para la síntesis diaria\n"
        )
        return 0
    cmd = argv[0]
    if cmd == "linea":
        salida.write(sd.linea_sintesis() + "\n")
        return 0
    if cmd == "estado":
        r = sd.resumen()
        for nombre, s in r["sesiones"].items():
            salida.write("%s: %s · fallos seguidos %d · receta %s · sin servicio %d s\n"
                         % (nombre, s["estado"], s["fallos_seguidos"],
                            s["receta_efectiva"] or "-", s["tiempo_sin_servicio_s"]))
        return 0
    if cmd == "evaluar":
        if len(argv) < 2:
            salida.write("Falta <sesion>\n")
            return 2
        r = _evaluar_cli(sd, argv[1:], salida)
        salida.write(json.dumps(r, ensure_ascii=False) + "\n")
        return 0 if r.get("accion") != "error" else 1
    salida.write("Comando desconocido: %s\n" % cmd)
    return 2


def _evaluar_cli(sd: SaludDirectores, args: list[str], salida) -> dict[str, Any]:
    """Modo evaluar del CLI: admite JSON explícito o lee el estado del sanador."""
    sesion = args[0]
    comprobacion: dict[str, Any] | None = None
    reparacion: dict[str, Any] | None = None
    registros = ""
    i = 1
    while i < len(args):
        if args[i] == "--comprobacion" and i + 1 < len(args):
            comprobacion = json.loads(args[i + 1])
            i += 2
        elif args[i] == "--reparacion" and i + 1 < len(args):
            reparacion = json.loads(args[i + 1])
            i += 2
        elif args[i] == "--registros" and i + 1 < len(args):
            registros = args[i + 1]
            i += 2
        else:
            salida.write("Argumento desconocido: %s\n" % args[i])
            i += 1
    if comprobacion is None:
        return {"accion": "error", "motivo": "falta --comprobacion JSON"}
    return sd.evaluar(sesion, comprobacion, reparacion, registros)


if __name__ == "__main__":
    sys.exit(main())


if __name__ == "__main__":
    sys.exit(main())
