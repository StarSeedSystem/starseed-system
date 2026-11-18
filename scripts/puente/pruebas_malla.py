#!/usr/bin/env python3
"""
pruebas_malla — Conductor de pruebas de la malla (Mac, Maggabox, tableta).
Lee la batería, ejecuta subórdenes y deja registro en pruebas/registro.jsonl y evidencias.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
PRUEBAS_DIR = ROOT / "starseed_memory_root" / "pruebas"
BATERIA_FILE = PRUEBAS_DIR / "bateria-1118.json"
REGISTRO_FILE = PRUEBAS_DIR / "registro.jsonl"
EVIDENCIAS_DIR = PRUEBAS_DIR / "evidencias"

MAC_LOGS = Path.home() / "Library" / "Logs" / "app.starseed.os"
MAGGABOX_SSH = "maggasukha@starseed-nodo-1.local"
MAGGABOX_SSH_KEY = Path.home() / ".ssh" / "starseed_nodo1"
MAGGABOX_LOGS = Path("~/.local/share/app.starseed.os").expanduser()
TABLET_ADB_IDENTIFIER = "app.starseed.os"


@dataclass
class Prueba:
    id: str
    bloque: str
    par: str
    antena: str
    titulo: str
    pasos: list[str]
    aparatos: list[str]
    antena_id: str
    criterios: dict[str, dict[str, list[str]]]


@dataclass
class RegistroPrueba:
    id: str
    inicio: str
    fin: str | None = None
    resultado: str | None = None
    nota: str | None = None
    evidencias: dict[str, str] = field(default_factory=dict)


def cargar_bateria() -> list[Prueba]:
    with BATERIA_FILE.open(encoding="utf-8") as f:
        data = json.load(f)
    return [Prueba(**p) for p in data["pruebas"]]


def guardar_registro(reg: RegistroPrueba) -> None:
    PRUEBAS_DIR.mkdir(parents=True, exist_ok=True)
    line = json.dumps(reg.__dict__, ensure_ascii=False)
    with REGISTRO_FILE.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


def leer_registro() -> list[RegistroPrueba]:
    if not REGISTRO_FILE.exists():
        return []
    out = []
    with REGISTRO_FILE.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                out.append(RegistroPrueba(**json.loads(line)))
    return out


def obtener_prueba_abierta() -> RegistroPrueba | None:
    vistos: set[str] = set()
    for r in reversed(leer_registro()):
        if r.id in vistos:
            continue
        vistos.add(r.id)
        if r.fin is None:
            return r
    return None


def _ultimo_por_id() -> dict[str, RegistroPrueba]:
    out: dict[str, RegistroPrueba] = {}
    for r in leer_registro():
        out[r.id] = r
    return out


def cmd_listar(args: argparse.Namespace) -> int:
    pruebas = cargar_bateria()
    if args.bloque:
        pruebas = [p for p in pruebas if p.bloque == args.bloque]
    if args.ronda:
        pass  # la batería actual es ronda 1
    ultimos = _ultimo_por_id()
    for p in pruebas:
        r = ultimos.get(p.id)
        if r is None:
            estado = "pendiente"
        elif r.resultado:
            estado = r.resultado
        elif r.fin is None:
            estado = "en curso"
        else:
            estado = "pendiente"
        print(f"{p.id:12} | {p.titulo:50} | {estado}")
    return 0


def cmd_siguiente(args: argparse.Namespace) -> int:
    pruebas = cargar_bateria()
    ultimos = _ultimo_por_id()
    hechas = {id for id, r in ultimos.items() if r.resultado}
    for p in pruebas:
        if p.id not in hechas:
            print(p.id)
            return 0
    print("todas completadas")
    return 0


def publicar_chat_director(mensaje: str, tipo: str = "aviso") -> None:
    try:
        subprocess.run(
            [
                sys.executable,
                str(ROOT / "scripts/puente/director_chat.py"),
                "publicar",
                "--de",
                "director-presidente",
                "--tipo",
                tipo,
                mensaje,
            ],
            check=False,
            capture_output=True,
            timeout=10,
        )
    except Exception:
        pass


def cmd_empezar(args: argparse.Namespace) -> int:
    pruebas = {p.id: p for p in cargar_bateria()}
    if args.id not in pruebas:
        print(f"Prueba {args.id} no encontrada", file=sys.stderr)
        return 1
    if obtener_prueba_abierta():
        print("Ya hay una prueba en curso. Ciérrala primero.", file=sys.stderr)
        return 1
    p = pruebas[args.id]
    inicio = datetime.now(timezone.utc).isoformat(timespec="seconds")
    reg = RegistroPrueba(id=args.id, inicio=inicio)
    guardar_registro(reg)
    pasos_texto = "\n".join(f"  {i+1}. {paso}" for i, paso in enumerate(p.pasos))
    mensaje = f"🧪 **{args.id}** — {p.titulo}\n**Aparatos:** {', '.join(p.aparatos)}\n**Pasos:**\n{pasos_texto}"
    publicar_chat_director(mensaje, "aviso")
    print(f"Iniciada {args.id} a las {inicio}")
    return 0


def recortar_ventana(lineas: list[str], desde: str, hasta: str | None = None) -> list[str]:
    desde_dt = datetime.fromisoformat(desde.replace("Z", "+00:00"))
    hasta_dt = datetime.fromisoformat(hasta.replace("Z", "+00:00")) if hasta else datetime.now(timezone.utc)
    patron = re.compile(r"^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)")
    out = []
    for l in lineas:
        m = patron.match(l)
        if m:
            ts = datetime.fromisoformat(m.group(1).replace("Z", "+00:00"))
            if desde_dt <= ts <= hasta_dt:
                out.append(l)
        else:
            out.append(l)
    return out


def leer_logs_mac() -> list[str]:
    logs = []
    for f in MAC_LOGS.glob("*.log"):
        try:
            logs.extend(f.read_text(encoding="utf-8", errors="ignore").splitlines())
        except Exception:
            pass
    return logs


def leer_logs_maggabox() -> list[str]:
    try:
        cmd = [
            "ssh",
            "-i",
            str(MAGGABOX_SSH_KEY),
            "-o",
            "IdentitiesOnly=yes",
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=8",
            "-o",
            f"UserKnownHostsFile={Path.home() / '.ssh' / 'known_hosts_starseed_nodo'}",
            MAGGABOX_SSH,
            "cat ~/.local/share/app.starseed.os/*.log 2>/dev/null || true",
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
        return res.stdout.splitlines()
    except Exception:
        return []


def leer_logs_tableta() -> list[str]:
    try:
        res = subprocess.run(["adb", "devices"], capture_output=True, text=True, timeout=5)
        if "device\n" not in res.stdout and "device\r\n" not in res.stdout:
            return ["sin acceso: falta emparejar adb"]
        res = subprocess.run(
            ["adb", "logcat", "-d", "-v", "time", f"{TABLET_ADB_IDENTIFIER}:* *:S"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        return res.stdout.splitlines()
    except Exception:
        return ["sin acceso: falta emparejar adb"]


def cmd_recoger(args: argparse.Namespace) -> int:
    reg_abierta = obtener_prueba_abierta()
    if not reg_abierta or reg_abierta.id != args.id:
        print(f"No hay prueba {args.id} en curso", file=sys.stderr)
        return 1
    pruebas = {p.id: p for p in cargar_bateria()}
    p = pruebas[args.id]
    fin = datetime.now(timezone.utc).isoformat(timespec="seconds")
    evidencias_dir = EVIDENCIAS_DIR / f"{args.id}-{fin[:10]}"
    evidencias_dir.mkdir(parents=True, exist_ok=True)
    logs_mac = recortar_ventana(leer_logs_mac(), reg_abierta.inicio, fin)
    logs_mgb = recortar_ventana(leer_logs_maggabox(), reg_abierta.inicio, fin)
    logs_tab = recortar_ventana(leer_logs_tableta(), reg_abierta.inicio, fin)
    (evidencias_dir / "mac.log").write_text("\n".join(logs_mac), encoding="utf-8")
    (evidencias_dir / "maggabox.log").write_text("\n".join(logs_mgb), encoding="utf-8")
    (evidencias_dir / "tableta.log").write_text("\n".join(logs_tab), encoding="utf-8")
    reg_abierta.evidencias = {
        "mac": str(evidencias_dir / "mac.log"),
        "maggabox": str(evidencias_dir / "maggabox.log"),
        "tableta": str(evidencias_dir / "tableta.log"),
    }
    reg_abierta.fin = fin
    guardar_registro(reg_abierta)
    print(f"Evidencias guardadas en {evidencias_dir}")
    return 0


def evaluar_patrones(lineas: list[str], debe: list[str], no_debe: list[str]) -> tuple[list[str], list[str], list[str]]:
    encontrados = []
    faltantes = []
    prohibidos = []
    for patron in debe:
        if any(patron in l for l in lineas):
            encontrados.append(patron)
        else:
            faltantes.append(patron)
    for patron in no_debe:
        if any(patron in l for l in lineas):
            prohibidos.append(patron)
    return encontrados, faltantes, prohibidos


def cmd_evaluar(args: argparse.Namespace) -> int:
    reg = next((r for r in reversed(leer_registro()) if r.id == args.id), None)
    if not reg or not reg.evidencias:
        print(f"No hay evidencias para {args.id}. Ejecuta 'recoger' primero.", file=sys.stderr)
        return 1
    pruebas = {p.id: p for p in cargar_bateria()}
    p = pruebas[args.id]
    resultados = {}
    for aparato in p.aparatos:
        criterios = p.criterios.get(aparato, {"debe": [], "no_debe": []})
        log_file = reg.evidencias.get(aparato.lower())
        lineas = []
        if log_file and Path(log_file).exists():
            lineas = Path(log_file).read_text(encoding="utf-8", errors="ignore").splitlines()
        enc, fal, pro = evaluar_patrones(lineas, criterios["debe"], criterios["no_debe"])
        resultados[aparato] = {"encontrados": enc, "faltantes": fal, "prohibidos": pro}
        print(f"\n=== {aparato} ===")
        print(f"  Encontrados ({len(enc)}): {enc}")
        print(f"  Faltantes ({len(fal)}): {fal}")
        print(f"  Prohibidos ({len(pro)}): {pro}")
    total_faltantes = sum(len(r["faltantes"]) for r in resultados.values())
    total_prohibidos = sum(len(r["prohibidos"]) for r in resultados.values())
    if total_faltantes == 0 and total_prohibidos == 0:
        print("\n✅ OK")
    elif total_prohibidos > 0:
        print("\n❌ FALLO (patrones prohibidos presentes)")
    else:
        print("\n⚠️ PARCIAL (algunos patrones esperados no aparecen)")
    return 0


def cmd_cerrar(args: argparse.Namespace) -> int:
    reg = next((r for r in reversed(leer_registro()) if r.id == args.id), None)
    if not reg:
        print(f"Prueba {args.id} no encontrada", file=sys.stderr)
        return 1
    if reg.resultado:
        print(f"Prueba {args.id} ya cerrada con {reg.resultado}", file=sys.stderr)
        return 1
    reg.resultado = args.resultado
    reg.nota = args.nota
    reg.fin = reg.fin or datetime.now(timezone.utc).isoformat(timespec="seconds")
    guardar_registro(reg)
    mensaje = f"✅ **{args.id}** cerrada — **{args.resultado.upper()}**\n{args.nota or ''}"
    publicar_chat_director(mensaje, "hecho" if args.resultado == "ok" else "aviso")
    print(f"Cerrada {args.id} con {args.resultado}")
    return 0


def cmd_informe(args: argparse.Namespace) -> int:
    ultimos = _ultimo_por_id()
    if args.ronda:
        pass  # filtro futuro
    print("\n=== INFORME RONDA 1 ===")
    print(f"{'ID':12} | {'Resultado':8} | {'Nota'}")
    print("-" * 70)
    for r in ultimos.values():
        nota = (r.nota or "")[:50]
        estado = r.resultado or ("en curso" if r.fin is None else "pendiente")
        print(f"{r.id:12} | {estado:8} | {nota}")
    mensaje = "📊 **Informe Ronda 1**\n" + "\n".join(
        f"`{r.id}` → {r.resultado or ('en curso' if r.fin is None else 'pendiente')}" for r in ultimos.values()
    )
    publicar_chat_director(mensaje, "hecho")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(prog="pruebas_malla", description="Conductor de pruebas de la malla")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_listar = sub.add_parser("listar", help="Lista la batería")
    p_listar.add_argument("--bloque", help="Filtrar por bloque (ej. B4)")
    p_listar.add_argument("--ronda", type=int, help="Filtrar por ronda")

    sub.add_parser("siguiente", help="ID de la siguiente prueba pendiente")

    p_empezar = sub.add_parser("empezar", help="Inicia una prueba (anota UTC y publica en Chat Director)")
    p_empezar.add_argument("id", help="ID de la prueba (ej. B4-MT-A1)")

    p_recoger = sub.add_parser("recoger", help="Recoge logs de los tres aparatos en la ventana de la prueba")
    p_recoger.add_argument("id", help="ID de la prueba en curso")

    p_evaluar = sub.add_parser("evaluar", help="Evalúa criterios contra evidencias recogidas")
    p_evaluar.add_argument("id", help="ID de la prueba")

    p_cerrar = sub.add_parser("cerrar", help="Cierra una prueba con resultado")
    p_cerrar.add_argument("id", help="ID de la prueba")
    p_cerrar.add_argument("--resultado", choices=["ok", "parcial", "fallo"], required=True)
    p_cerrar.add_argument("--nota", default="")

    p_informe = sub.add_parser("informe", help="Publica tabla resumen en Chat Director")
    p_informe.add_argument("--ronda", type=int, help="Número de ronda")

    args = parser.parse_args()
    cmds = {
        "listar": cmd_listar,
        "siguiente": cmd_siguiente,
        "empezar": cmd_empezar,
        "recoger": cmd_recoger,
        "evaluar": cmd_evaluar,
        "cerrar": cmd_cerrar,
        "informe": cmd_informe,
    }
    return cmds[args.cmd](args)


if __name__ == "__main__":
    sys.exit(main())