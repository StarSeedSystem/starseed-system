#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PRU1118A · Conductor de pruebas de la malla.

Subórdenes:
  listar [--bloque B4] [--ronda 1]
  siguiente
  empezar <id>
  recoger <id> [--captura]
  evaluar <id>
  cerrar <id> --resultado ok|parcial|fallo --nota
  lanzar <id> --duracion <ms> --fuente <auto|proyeccion|malla>
  informe [--ronda N]

Lógica pura (testable): recortar_ventana, evaluar_patrones, formatear_informe,
filtrar_bateria, linea_registro_inicio, linea_registro_fin.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
import registro_pruebas_logica as RPL  # noqa: E402


# ──────────────────────────────────────────────────────────────────────────────
# Rutas y constantes
# ──────────────────────────────────────────────────────────────────────────
RAIZ_REPO = Path(__file__).resolve().parents[2]
MEMORIA_ROOT = RAIZ_REPO / "starseed_memory_root"
PRUEBAS_DIR = MEMORIA_ROOT / "pruebas"
BATERIA_JSON = PRUEBAS_DIR / "bateria-1118.json"
REGISTRO_JSONL = PRUEBAS_DIR / "registro.jsonl"
EVIDENCIAS_DIR = PRUEBAS_DIR / "evidencias"

APARATOS = ("mac", "maggabox", "tableta")
ANTenas = ("ble", "wifi", "malla")

MAC_LOGS = Path.home() / "Library/Logs/app.starseed.os"
MAGGABOX_HOST = "maggasukha@starseed-nodo-1.local"
MAGGABOX_KEY = Path.home() / ".ssh/starseed_nodo1"
MAGGABOX_LOGS = Path("~/.local/share/app.starseed.os").expanduser()
TABLETA_PKG = "app.starseed.os"

# Rutas y configuración para la orden prueba-control
ORDEN_PRUEBA_CONTROL = "prueba-control"
FUENTES_VALIDAS = ("auto", "proyeccion", "malla")
MAX_DURACION_MS = 120_000
MIN_DURACION_MS = 10_000
CADUCA_ORDEN_MS = 300_000
ESPERA_RESULTADO_S = 30.0

EQUIVALENCIAS_JSON = RAIZ_REPO / "config" / "pruebas-equivalencias.json"
DATOS_APP = Path(os.environ.get("STARSEED_APP_DATOS") or Path.home() / "Library/Application Support/app.starseed.os")
BANCO_DIR = Path(os.environ.get("STARSEED_PRODUCCION_DIR") or Path.home() / ".starseed" / "produccion") / "banco-llamadas"
_RE_HUELLA = re.compile(r"^[0-9a-f]{64}$")
_RE_NOMBRE = re.compile(r"^[^\s/]{1,64}$")
_ERRORES_FUENTE = ("SSH_ERROR", "SSH_TIMEOUT", "SSH_EXCEPTION", "SIN_ACCESO", "ADB_")


# ──────────────────────────────────────────────────────────────────────────────
# Lógica pura: ventanas de tiempo
# ──────────────────────────────────────────────────────────────────────────────

_RE_FECHA_LINEA = re.compile(r"^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)")
_RE_FECHA_JSON = re.compile(r'"t"\s*:\s*"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)"')


def _parsear_fecha_linea(linea: str) -> datetime | None:
    """Extrae la fecha ISO al inicio de la línea (enlaces.log) o del campo "t" (control-neuronas.log JSON)."""
    ln = linea.strip()
    m = _RE_FECHA_LINEA.match(ln)
    if m:
        try:
            return datetime.fromisoformat(m.group(1).replace("Z", "+00:00"))
        except ValueError:
            pass
    # Intentar extraer del JSON (campo "t")
    m = _RE_FECHA_JSON.search(ln)
    if m:
        try:
            return datetime.fromisoformat(m.group(1).replace("Z", "+00:00"))
        except ValueError:
            pass
    return None


def recortar_ventana(
    lineas: list[str], inicio: datetime | None, fin: datetime | None
) -> list[str]:
    """Devuelve solo las líneas cuya fecha cae en [inicio, fin] (incluyentes).

    Si inicio es None, no hay límite inferior. Si fin es None, no hay límite superior.
    Líneas sin fecha reconocible se descartan.
    """
    if inicio is None and fin is None:
        return lineas[:]
    out: list[str] = []
    for ln in lineas:
        dt = _parsear_fecha_linea(ln)
        if dt is None:
            continue
        if inicio is not None and dt < inicio:
            continue
        if fin is not None and dt > fin:
            continue
        out.append(ln)
    return out


# ──────────────────────────────────────────────────────────────────────────────
# Lógica pura: evaluación de patrones
# ──────────────────────────────────────────────────────────────────────────────

def evaluar_patrones(lineas: list[str], criterios: dict[str, list[str]]) -> dict[str, Any]:
    """Aplica listas `debe` (regex que DEBEN aparecer) y `no_debe` (regex que NO deben).

    Retorna dict con:
      ok: bool (True si todos los debe están y ningún no_debe aparece)
      debe_cumplidos: int
      debe_faltantes: list[str] (patrones que no matchearon)
      no_debe_cumplidos: int (patrones que correctamente NO aparecieron)
      no_debe_violados: list[str] (patrones que aparecieron y no debían)
      evidencias: dict[patrón, list[str]] (líneas que matchearon cada patrón)
    """
    debe = criterios.get("debe", [])
    no_debe = criterios.get("no_debe", [])
    evidencias: dict[str, list[str]] = {}
    debe_cumplidos = 0
    debe_faltantes: list[str] = []
    no_debe_cumplidos = 0
    no_debe_violados: list[str] = []

    for pat in debe:
        rx = re.compile(pat, re.IGNORECASE)
        matches = [ln for ln in lineas if rx.search(ln)]
        if matches:
            debe_cumplidos += 1
            evidencias[pat] = matches[:5]  # máx 5 líneas de evidencia
        else:
            debe_faltantes.append(pat)

    for pat in no_debe:
        rx = re.compile(pat, re.IGNORECASE)
        matches = [ln for ln in lineas if rx.search(ln)]
        if matches:
            no_debe_violados.append(pat)
            evidencias[pat] = matches[:5]
        else:
            no_debe_cumplidos += 1

    ok = (len(debe_faltantes) == 0) and (len(no_debe_violados) == 0)
    return {
        "ok": ok,
        "debe_cumplidos": debe_cumplidos,
        "debe_faltantes": debe_faltantes,
        "no_debe_cumplidos": no_debe_cumplidos,
        "no_debe_violados": no_debe_violados,
        "evidencias": evidencias,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Lógica pura: formato de informe
# ──────────────────────────────────────────────────────────────────────────────

_ICONO = {"ok": "✅", "parcial": "⚠️", "fallo": "❌"}


def formatear_informe(resultados: list[dict[str, Any]], ronda: int | None = None) -> str:
    """Genera tabla Markdown para el Chat Director."""
    lineas: list[str] = []
    if ronda is not None:
        lineas.append(f"## Informe de pruebas · Ronda {ronda}")
    else:
        lineas.append("## Informe de pruebas")
    lineas.append("")
    if not resultados:
        lineas.append("Sin pruebas en esta ronda.")
        return "\n".join(lineas)

    lineas.append("| ID | Título | Resultado | Aparatos |")
    lineas.append("|----|--------|-----------|----------|")
    for r in resultados:
        rid = r.get("id", "?")
        titulo = r.get("titulo", "")
        res = r.get("resultado", "?")
        icono = _ICONO.get(res, "❓")
        aparatos = ", ".join(r.get("aparatos", []))
        nota = r.get("nota")
        lineas.append(f"| {rid} | {titulo} | {icono} {res} | {aparatos} |")
        if nota:
            lineas.append(f"| | *Nota:* {nota} | | |")
    return "\n".join(lineas)


# ──────────────────────────────────────────────────────────────────────────────
# Lógica pura: carga y filtrado de batería
# ──────────────────────────────────────────────────────────────────────────────

def cargar_bateria() -> dict[str, Any]:
    if not BATERIA_JSON.exists():
        raise FileNotFoundError(
            f"Batería no encontrada: {BATERIA_JSON}. "
            f"Genera el archivo con: python3 scripts/puente/generar_bateria_1118.py"
        )
    with BATERIA_JSON.open("r", encoding="utf-8") as f:
        return json.load(f)


def filtrar_bateria(
    bateria: dict[str, Any], bloque: str | None = None, ronda: int | None = None
) -> list[dict[str, Any]]:
    """Filtra pruebas por bloque (prefijo ID) y/o número de ronda."""
    pruebas = bateria.get("pruebas", [])
    out = []
    for p in pruebas:
        if bloque and not p.get("id", "").startswith(f"{bloque}-"):
            continue
        if ronda is not None and p.get("ronda") != ronda:
            continue
        out.append(p)
    return out


# ──────────────────────────────────────────────────────────────────────────────
# Lógica pura: líneas de registro.jsonl
# ──────────────────────────────────────────────────────────────────────────────

def linea_registro_inicio(prueba_id: str, inicio_iso: str) -> str:
    return json.dumps(
        {"tipo": "inicio", "id": prueba_id, "inicio": inicio_iso},
        ensure_ascii=False,
        separators=(",", ":"),
    )


def linea_registro_fin(prueba_id: str, resultado: str, nota: str | None = None) -> str:
    obj: dict[str, Any] = {"tipo": "fin", "id": prueba_id, "resultado": resultado}
    if nota:
        obj["nota"] = nota
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


# ──────────────────────────────────────────────────────────────────────────────
# Utilidades de E/S (no puras, para los subcomandos reales)
# ──────────────────────────────────────────────────────────────────────────────

def _leer_archivo_log(ruta: Path) -> list[str]:
    if not ruta.exists():
        return []
    try:
        return ruta.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return []


def _ejecutar_ssh(comando: str) -> list[str]:
    """Ejecuta comando por SSH en Maggabox. Devuelve líneas de stdout."""
    cmd = [
        "ssh",
        "-i",
        str(MAGGABOX_KEY),
        "-o",
        "IdentitiesOnly=yes",
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=8",
        "-o",
        "AddressFamily=inet",
        "-o",
        f"UserKnownHostsFile={Path.home() / '.ssh/known_hosts_starseed_nodo'}",
        MAGGABOX_HOST,
        comando,
    ]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        if res.returncode != 0:
            return [f"SSH_ERROR: {res.stderr.strip()}"]
        return res.stdout.splitlines()
    except subprocess.TimeoutExpired:
        return ["SSH_TIMEOUT"]
    except Exception as e:
        return [f"SSH_EXCEPTION: {e}"]


def _ejecutar_adb() -> list[str]:
    """Ejecuta adb logcat para la tableta. Devuelve líneas filtradas."""
    # Primero verificar que hay dispositivo
    try:
        res = subprocess.run(["adb", "devices"], capture_output=True, text=True, timeout=5)
        if "device\n" not in res.stdout and "device\r\n" not in res.stdout:
            return ["SIN_ACCESO: falta emparejar adb"]
    except Exception:
        return ["SIN_ACCESO: adb no disponible"]

    try:
        res = subprocess.run(
            ["adb", "logcat", "-d", "-v", "time", f"{TABLETA_PKG}:V", "*:S"],
            capture_output=True,
            text=True,
            timeout=15,
        )
        return res.stdout.splitlines()
    except subprocess.TimeoutExpired:
        return ["ADB_TIMEOUT"]
    except Exception as e:
        return [f"ADB_EXCEPTION: {e}"]


def _recoger_logs_mac(inicio: datetime, fin: datetime) -> dict[str, list[str]]:
    """Recoge enlaces.log y control-neuronas.log de la Mac recortados a la ventana."""
    out = {}
    for nombre in ("enlaces.log", "control-neuronas.log"):
        ruta = MAC_LOGS / nombre
        lineas = _leer_archivo_log(ruta)
        out[nombre] = recortar_ventana(lineas, inicio, fin)
    return out


def _recoger_logs_maggabox(inicio: datetime, fin: datetime) -> dict[str, list[str]]:
    """Recoge logs de Maggabox por SSH."""
    out = {}
    # Listar archivos en el directorio de logs
    lista = _ejecutar_ssh(f"ls -1 {MAGGABOX_LOGS}/*.log 2>/dev/null || true")
    for linea in lista:
        linea = linea.strip()
        if not linea:
            continue
        nombre = Path(linea).name
        cmd = f"cat {linea}"
        lineas = _ejecutar_ssh(cmd)
        out[nombre] = recortar_ventana(lineas, inicio, fin)
    return out


def _recoger_logs_tableta(inicio: datetime, fin: datetime) -> dict[str, list[str]]:
    """Recoge logcat de la tableta filtrado por paquete."""
    lineas = _ejecutar_adb()
    if lineas and lineas[0].startswith("SIN_ACCESO"):
        return {"logcat.txt": lineas}
    return {"logcat.txt": recortar_ventana(lineas, inicio, fin)}


def _guardar_evidencias(prueba_id: str, inicio: datetime, logs: dict[str, dict[str, list[str]]]) -> Path:
    """Guarda evidencias en pruebas/evidencias/<id>-<fecha>/."""
    fecha_str = inicio.strftime("%Y%m%d-%H%M%S")
    dir_ev = EVIDENCIAS_DIR / f"{prueba_id}-{fecha_str}"
    dir_ev.mkdir(parents=True, exist_ok=True)
    for aparato, archivos in logs.items():
        for nombre, lineas in archivos.items():
            (dir_ev / f"{aparato}_{nombre}").write_text(
                "\n".join(lineas) + ("\n" if lineas else ""), encoding="utf-8"
            )
    return dir_ev


def _publicar_chat_director(mensaje: str, tipo: str = "aviso") -> None:
    """Publica en el Chat Director vía director_chat.py."""
    try:
        subprocess.run(
            [
                sys.executable,
                "-m",
                "scripts.puente.director_chat",
                "publicar",
                "--de",
                "director-presidente",
                "--tipo",
                tipo,
                mensaje,
            ],
            check=False,
            timeout=10,
        )
    except Exception:
        pass  # no bloquear la prueba por fallo de chat


# ──────────────────────────────────────────────────────────────────────────────
# Subcomandos
# ──────────────────────────────────────────────────────────────────────────────

def _fines_canonicos() -> dict[str, dict[str, Any]]:
    """BAP1127Z: `fin` del registro (también las manuales) por id canónico."""
    fines: dict[str, dict[str, Any]] = {}
    for o in RPL.leer_registro(REGISTRO_JSONL):
        if o.get("tipo") != "fin":
            continue
        canon = RPL.id_canonico(str(o.get("id") or ""), EQUIVALENCIAS_JSON)
        if canon:
            fines[canon] = o
    return fines


def _canon(prueba_id: str) -> str:
    return RPL.id_canonico(prueba_id, EQUIVALENCIAS_JSON) or prueba_id


def cmd_listar(args: argparse.Namespace) -> int:
    try:
        bateria = cargar_bateria()
    except FileNotFoundError as e:
        print(str(e))
        return 1
    pruebas = filtrar_bateria(bateria, args.bloque, args.ronda)
    if not pruebas:
        print("Sin pruebas que coincidan.")
        return 0
    for p in pruebas:
        aparatos = ", ".join(p.get("aparatos", []))
        antena = p.get("antena", "?")
        ronda = p.get("ronda", "?")
        print(f"{p['id']}  [{ronda}]  {p['titulo']}  ·  {aparatos}  ·  {antena}")
    return 0


def cmd_siguiente(args: argparse.Namespace) -> int:
    try:
        bateria = cargar_bateria()
    except FileNotFoundError as e:
        print(str(e))
        return 1
    pruebas = bateria.get("pruebas", [])
    if not pruebas:
        print("Batería vacía.")
        return 1
    hechas = set(_fines_canonicos())
    for p in pruebas:
        if _canon(p["id"]) not in hechas:
            print(p["id"])
            return 0
    print("Todas las pruebas tienen registro de fin.")
    return 1


def cmd_empezar(args: argparse.Namespace) -> int:
    try:
        bateria = cargar_bateria()
    except FileNotFoundError as e:
        print(str(e))
        return 1
    prueba = next((p for p in bateria.get("pruebas", []) if p["id"] == args.id), None)
    if not prueba:
        print(f"Prueba {args.id} no encontrada en la batería.")
        return 1

    inicio = datetime.now(timezone.utc)
    inicio_iso = inicio.strftime("%Y-%m-%dT%H:%M:%SZ")

    # Anotar inicio en registro.jsonl
    REGISTRO_JSONL.parent.mkdir(parents=True, exist_ok=True)
    with REGISTRO_JSONL.open("a", encoding="utf-8") as f:
        f.write(linea_registro_inicio(args.id, inicio_iso) + "\n")

    # Publicar pasos en Chat Director
    pasos = "\n".join(f"  {i+1}. {p}" for i, p in enumerate(prueba.get("pasos", [])))
    msg = (
        f"🧪 **Prueba iniciada**: `{args.id}` — {prueba.get('titulo', '')}\n"
        f"Inicio: {inicio_iso}\n"
        f"Aparatos: {', '.join(prueba.get('aparatos', []))}\n"
        f"Antena: {prueba.get('antena', '?')}\n"
        f"Pasos:\n{pasos}"
    )
    _publicar_chat_director(msg, "aviso")
    print(f"Iniciada {args.id} a las {inicio_iso}")
    return 0


def _recoger_aparatos(inicio: datetime, fin: datetime) -> tuple[dict[str, dict[str, list[str]]], dict[str, str]]:
    """BAP1127Z: espejo-<aparato>.log primero; SSH/adb solo si el aparato no tiene ninguna línea."""
    logs: dict[str, dict[str, list[str]]] = {}
    fuentes: dict[str, str] = {}
    desde, hasta = inicio.isoformat(), fin.isoformat()
    for aparato in APARATOS:
        texto = "\n".join(_leer_archivo_log(DATOS_APP / f"espejo-{aparato}.log"))
        espejo = RPL.lineas_espejo(texto, desde, hasta)
        if espejo:
            logs[aparato], fuentes[aparato] = {"espejo.log": espejo}, "espejo"
            continue
        if aparato == "mac":
            logs[aparato] = _recoger_logs_mac(inicio, fin)
            fuente = "espejo"  # enlaces.log de la Mac es el agregado del espejo
        elif aparato == "maggabox":
            logs[aparato] = _recoger_logs_maggabox(inicio, fin)
            fuente = "ssh"
        else:
            logs[aparato] = _recoger_logs_tableta(inicio, fin)
            fuente = "adb"
        reales = [x for v in logs[aparato].values() for x in v if not x.startswith(_ERRORES_FUENTE)]
        for nombre in logs[aparato]:
            logs[aparato][nombre] = [x for x in logs[aparato][nombre] if not x.startswith(_ERRORES_FUENTE)]
        fuentes[aparato] = fuente if reales else "sin-acceso"
    return logs, fuentes


def cmd_recoger(args: argparse.Namespace) -> int:
    # Leer inicio desde registro.jsonl
    inicio = None
    if REGISTRO_JSONL.exists():
        for linea in REGISTRO_JSONL.read_text(encoding="utf-8").splitlines():
            try:
                obj = json.loads(linea)
                if obj.get("tipo") == "inicio" and obj.get("id") == args.id:
                    inicio = datetime.fromisoformat(obj["inicio"].replace("Z", "+00:00"))
                    break
            except Exception:
                pass
    if inicio is None:
        print(f"No hay registro de inicio para {args.id}. Usa 'empezar' primero.")
        return 1

    fin = datetime.now(timezone.utc)
    print(f"Recogiendo logs entre {inicio.isoformat()} y {fin.isoformat()}...")

    logs, fuentes = _recoger_aparatos(inicio, fin)
    dir_ev = _guardar_evidencias(args.id, inicio, logs)
    resumen = {
        "id": args.id,
        "ventana": {"inicio": inicio.isoformat(), "fin": fin.isoformat()},
        "aparatos": {a: {"lineas": sum(len(v) for v in logs[a].values()), "fuente": fuentes[a]} for a in logs},
    }
    (dir_ev / "resumen.json").write_text(json.dumps(resumen, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Evidencias guardadas en {dir_ev}")

    if getattr(args, "captura", False):
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        import captura_aparatos

        for aparato in APARATOS:
            captura_aparatos.capturar(aparato, "foto", 0, args.id)
    return 0


def cmd_lanzar(args: argparse.Namespace) -> int:
    """BAP1127Z: escribe la orden `prueba-control` en el buzón del banco y espera el .resultado.json."""
    if not _RE_NOMBRE.match(args.id or "") or not _RE_NOMBRE.match(args.origen or ""):
        print("id u origen no válidos (sin espacios ni «/», ≤ 64).")
        return 1
    if not _RE_HUELLA.match(args.destino or ""):
        print("destino no válido: se espera la huella de 64 hex.")
        return 1
    if not MIN_DURACION_MS <= args.duracion <= MAX_DURACION_MS:
        print(f"duración fuera de rango ({MIN_DURACION_MS}–{MAX_DURACION_MS} ms).")
        return 1
    if args.fuente not in FUENTES_VALIDAS:
        print(f"fuente no válida: {', '.join(FUENTES_VALIDAS)}.")
        return 1
    BANCO_DIR.mkdir(parents=True, exist_ok=True)
    resultado = BANCO_DIR / f"{args.id}.resultado.json"
    resultado.unlink(missing_ok=True)
    orden = {
        "v": 1, "tipo": ORDEN_PRUEBA_CONTROL, "id": args.id, "origen": args.origen, "destino": args.destino,
        "duracion_ms": args.duracion, "fuente": args.fuente, "caduca_ms": int(time.time() * 1000) + CADUCA_ORDEN_MS,
    }
    tmp = BANCO_DIR / f"orden.json.tmp-{os.getpid()}"
    tmp.write_text(json.dumps(orden), encoding="utf-8")
    os.replace(tmp, BANCO_DIR / "orden.json")
    limite = time.monotonic() + ESPERA_RESULTADO_S
    while True:
        if resultado.exists():
            try:
                datos = json.loads(resultado.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                datos = None
            if isinstance(datos, dict):
                print(f"{'ok' if datos.get('ok') else 'fallo'}: {datos.get('motivo', '')}")
                return 0 if datos.get("ok") else 1
        if time.monotonic() >= limite:
            print("sin respuesta de la app de dirección")
            return 2
        time.sleep(min(0.5, ESPERA_RESULTADO_S / 10))


def cmd_evaluar(args: argparse.Namespace) -> int:
    try:
        bateria = cargar_bateria()
    except FileNotFoundError as e:
        print(str(e))
        return 1
    prueba = next((p for p in bateria.get("pruebas", []) if p["id"] == args.id), None)
    if not prueba:
        print(f"Prueba {args.id} no encontrada.")
        return 1

    # Buscar directorio de evidencias más reciente
    patron = f"{args.id}-*"
    dirs = sorted(EVIDENCIAS_DIR.glob(patron), reverse=True)
    if not dirs:
        print(f"No hay evidencias para {args.id}. Usa 'recoger' primero.")
        return 1
    dir_ev = dirs[0]

    criterios = prueba.get("criterios", {})
    resultados_aparato: dict[str, dict[str, Any]] = {}
    global_ok = True

    for aparato, crit in criterios.items():
        # Buscar archivo de log correspondiente
        archivos = list(dir_ev.glob(f"{aparato}_*"))
        if not archivos:
            resultados_aparato[aparato] = {"ok": False, "error": "sin logs"}
            global_ok = False
            continue
        # Unir todas las líneas de ese aparato
        lineas: list[str] = []
        for arch in archivos:
            lineas.extend(_leer_archivo_log(arch))
        res = evaluar_patrones(lineas, crit)
        resultados_aparato[aparato] = res
        if not res["ok"]:
            global_ok = False

    # Imprimir resumen
    estado = "ok" if global_ok else ("parcial" if any(r.get("ok") for r in resultados_aparato.values()) else "fallo")
    print(f"Resultado global: {estado}")
    for aparato, res in resultados_aparato.items():
        if "error" in res:
            print(f"  {aparato}: {res['error']}")
        else:
            ok_str = "✅" if res["ok"] else "❌"
            print(f"  {aparato}: {ok_str}  debe={res['debe_cumplidos']}/{res['debe_cumplidos']+len(res['debe_faltantes'])}  no_debe={res['no_debe_cumplidos']}/{res['no_debe_cumplidos']+len(res['no_debe_violados'])}")
            if res["debe_faltantes"]:
                for pat in res["debe_faltantes"]:
                    print(f"    FALTA: {pat}")
            if res["no_debe_violados"]:
                for pat in res["no_debe_violados"]:
                    print(f"    VIOLADO: {pat}")

    return 0


def cmd_cerrar(args: argparse.Namespace) -> int:
    fin = datetime.now(timezone.utc)
    fin_iso = fin.strftime("%Y-%m-%dT%H:%M:%SZ")
    with REGISTRO_JSONL.open("a", encoding="utf-8") as f:
        f.write(linea_registro_fin(args.id, args.resultado, args.nota) + "\n")
    msg = f"✅ **Prueba cerrada**: `{args.id}` — resultado: **{args.resultado}**\nNota: {args.nota or '(sin nota)'}"
    _publicar_chat_director(msg, "hecho")
    print(f"Cerrada {args.id} con resultado {args.resultado}")
    return 0


def cmd_informe(args: argparse.Namespace) -> int:
    try:
        bateria = cargar_bateria()
    except FileNotFoundError as e:
        print(str(e))
        return 1
    pruebas = filtrar_bateria(bateria, None, args.ronda)

    resultados_map = {
        k: {"resultado": o.get("resultado") or "pendiente", "nota": o.get("nota")}
        for k, o in _fines_canonicos().items()
    }

    filas = []
    for p in pruebas:
        rid = p["id"]
        res_info = resultados_map.get(_canon(rid), {"resultado": "pendiente", "nota": None})
        filas.append(
            {
                "id": rid,
                "titulo": p.get("titulo", ""),
                "resultado": res_info["resultado"],
                "aparatos": p.get("aparatos", []),
                "nota": res_info["nota"],
            }
        )

    md = formatear_informe(filas, args.ronda)
    print(md)
    if not getattr(args, "sin_publicar", False):
        _publicar_chat_director(md, "hecho")
    return 0


# ──────────────────────────────────────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────────────────────────────────────

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="pruebas_malla", description="Conductor de pruebas de la malla")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_listar = sub.add_parser("listar", help="Lista pruebas de la batería")
    p_listar.add_argument("--bloque", help="Filtrar por bloque (ej. B4)")
    p_listar.add_argument("--ronda", type=int, help="Filtrar por número de ronda")
    p_listar.set_defaults(func=cmd_listar)

    p_sig = sub.add_parser("siguiente", help="Muestra la siguiente prueba pendiente")
    p_sig.set_defaults(func=cmd_siguiente)

    p_empezar = sub.add_parser("empezar", help="Inicia una prueba (anota UTC y publica pasos)")
    p_empezar.add_argument("id", help="ID de la prueba (ej. B4-MT-A1)")
    p_empezar.set_defaults(func=cmd_empezar)

    p_recoger = sub.add_parser("recoger", help="Recoge logs de los tres aparatos en la ventana de la prueba")
    p_recoger.add_argument("id", help="ID de la prueba")
    p_recoger.add_argument("--captura", action="store_true", help="Captura también la pantalla de cada aparato")
    p_recoger.set_defaults(func=cmd_recoger)

    p_lanzar = sub.add_parser("lanzar", help="Lanza una prueba-control entre neuronas por el buzón del banco")
    p_lanzar.add_argument("id", help="ID de la orden (sin espacios ni «/»)")
    p_lanzar.add_argument("--origen", required=True, help="Neurona que ejecuta la prueba")
    p_lanzar.add_argument("--destino", required=True, help="Huella (64 hex) de la neurona destino")
    p_lanzar.add_argument("--duracion", type=int, default=60_000, help="Duración en ms (10000–120000)")
    p_lanzar.add_argument("--fuente", default="auto", help="auto | proyeccion | malla")
    p_lanzar.set_defaults(func=cmd_lanzar)

    p_eval = sub.add_parser("evaluar", help="Aplica criterios debe/no_debe a las evidencias recogidas")
    p_eval.add_argument("id", help="ID de la prueba")
    p_eval.set_defaults(func=cmd_evaluar)

    p_cerrar = sub.add_parser("cerrar", help="Cierra la prueba con resultado y nota")
    p_cerrar.add_argument("id", help="ID de la prueba")
    p_cerrar.add_argument("--resultado", required=True, choices=["ok", "parcial", "fallo"])
    p_cerrar.add_argument("--nota", default="")
    p_cerrar.set_defaults(func=cmd_cerrar)

    p_inf = sub.add_parser("informe", help="Genera tabla Markdown de resultados para el Chat Director")
    p_inf.add_argument("--ronda", type=int, help="Filtrar por ronda")
    p_inf.add_argument("--sin-publicar", action="store_true", help="No publica en el Chat Director")
    p_inf.set_defaults(func=cmd_informe)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())