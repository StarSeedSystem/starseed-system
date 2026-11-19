#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Conductor de pruebas de la malla (PRU1118): lista la batería, recoge registros de los tres aparatos, evalúa y deja el registro.

Subórdenes:
  listar [--bloque B4] [--ronda 1]       lista las pruebas (filtra por bloque y/o ronda)
  siguiente                               siguiente prueba pendiente (por orden de batería)
  empezar <id>                            anota inicio UTC en pruebas/registro.jsonl y publica aviso en Chat Director
  recoger <id>                            copia evidencias a pruebas/evidencias/<id>-<fecha>/
  evaluar <id>                            aplica criterios (debe/no_debe) y da ok/parcial/fallo
  cerrar <id> --resultado ok|parcial|fallo --nota "..."  cierra la prueba con resultado
  informe [--ronda N]                     tabla breve que publica en el Chat Director

La lógica pura (ventanas de tiempo, evaluación de patrones, formato de informe) va en funciones
separadas con pruebas en test_pruebas_malla.py.
"""
import argparse
import datetime
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

DIR_RAIZ = Path(__file__).parent.parent.parent
PRUEBAS_DIR = DIR_RAIZ / "starseed_memory_root" / "pruebas"
BATERIA_PATH = PRUEBAS_DIR / "bateria-1118.json"
REGISTRO_PATH = PRUEBAS_DIR / "registro.jsonl"
EVIDENCIAS_DIR = PRUEBAS_DIR / "evidencias"


def cargar_bateria():
    with open(BATERIA_PATH, encoding="utf-8") as f:
        return json.load(f)


def guardar_registro(entrada):
    PRUEBAS_DIR.mkdir(parents=True, exist_ok=True)
    with open(REGISTRO_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(entrada, ensure_ascii=False) + "\n")


def leer_registro():
    if not REGISTRO_PATH.exists():
        return []
    with open(REGISTRO_PATH, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def ahora_iso():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def ahora_epoch():
    return datetime.datetime.now(datetime.timezone.utc).timestamp()


def fecha_corta():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d-%H%M%S")


# ── Lógica pura para pruebas ────────────────────────────────────────────────

def filtrar_pruebas(bateria, bloque=None, ronda=None):
    """PURA: filtra pruebas por bloque y/o ronda."""
    return [p for p in bateria["pruebas"] if (bloque is None or p["bloque"] == bloque) and (ronda is None or p["ronda"] == ronda)]


def siguiente_pendiente(bateria, registro):
    """PURA: devuelve la siguiente prueba sin entrada 'empezar' en el registro."""
    ids_empezados = {e["id"] for e in registro if e.get("accion") == "empezar"}
    for p in bateria["pruebas"]:
        if p["id"] not in ids_empezados:
            return p
    return None


def estado_prueba(registro, prueba_id):
    """PURA: devuelve el estado actual de una prueba según el registro."""
    eventos = [e for e in registro if e.get("id") == prueba_id]
    if not eventos:
        return "pendiente"
    ultima = eventos[-1]
    if ultima.get("accion") == "cerrar":
        return ultima.get("resultado", "cerrada")
    if ultima.get("accion") == "evaluar":
        return "evaluada"
    if ultima.get("accion") == "recoger":
        return "recogida"
    if ultima.get("accion") == "empezar":
        return "en-curso"
    return "pendiente"


def recortar_ventana(lineas, inicio_iso, fin_iso=None):
    """PURA: recorta líneas de log a la ventana de tiempo [inicio, fin].

    Las líneas deben empezar con ISO timestamp: 2026-11-18T12:30:05.123Z ...
    """
    if not lineas:
        return []
    inicio = datetime.datetime.fromisoformat(inicio_iso.replace("Z", "+00:00"))
    fin = datetime.datetime.fromisoformat(fin_iso.replace("Z", "+00:00")) if fin_iso else None
    patron = re.compile(r"^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z)")
    salida = []
    for l in lineas:
        m = patron.match(l)
        if not m:
            salida.append(l)
            continue
        try:
            t = datetime.datetime.fromisoformat(m.group(1).replace("Z", "+00:00"))
        except ValueError:
            salida.append(l)
            continue
        if t < inicio:
            continue
        if fin and t > fin:
            continue
        salida.append(l)
    return salida


def evaluar_patrones(lineas, criterios_debe, criterios_no_debe):
    """PURA: evalúa patrones 'debe' y 'no_debe' contra líneas de log.

    Returns: (ok, detalles) donde detalles = {cumplidos: [...], fallados: [...], no_debe_violados: [...]}
    """
    cumplidos = []
    fallados = []
    no_debe_violados = []

    for patron in criterios_debe:
        encontrado = any(re.search(patron, l) for l in lineas)
        if encontrado:
            cumplidos.append(patron)
        else:
            fallados.append(patron)

    for patron in criterios_no_debe:
        violado = any(re.search(patron, l) for l in lineas)
        if violado:
            no_debe_violados.append(patron)

    ok = len(fallados) == 0 and len(no_debe_violados) == 0
    return ok, {"cumplidos": cumplidos, "fallados": fallados, "no_debe_violados": no_debe_violados}


def evaluar_prueba_completa(lineas_por_aparato, criterios):
    """PURA: evalúa todos los aparatos de una prueba."""
    resultados = {}
    for aparato, lineas in lineas_por_aparato.items():
        crit = criterios.get(aparato, {})
        ok, det = evaluar_patrones(lineas, crit.get("debe", []), crit.get("no_debe", []))
        resultados[aparato] = {"ok": ok, **det}
    return resultados


def formatear_informe(bateria, registro, ronda=None):
    """PURA: genera tabla Markdown del informe."""
    pruebas = filtrar_pruebas(bateria, ronda=ronda)
    lineas = ["| ID | Título | Ronda | Bloque | Estado |", "|---|---|---:|---|---|"]
    for p in pruebas:
        est = estado_prueba(registro, p["id"])
        icono = {"pendiente": "⏳", "en-curso": "🔄", "recogida": "📥", "evaluada": "⚖️", "ok": "✅", "parcial": "⚠️", "fallo": "❌", "cerrada": "✅"}.get(est, "❓")
        lineas.append(f"| {p['id']} | {p['titulo']} | {p['ronda']} | {p['bloque']} | {icono} {est} |")
    return "\n".join(lineas)


# ── Lectura de logs reales ──────────────────────────────────────────────────

def leer_logs_mac(ventana_inicio, ventana_fin=None):
    """Lee ~/Library/Logs/app.starseed.os/*.log y recorta a la ventana."""
    log_dir = Path.home() / "Library" / "Logs" / "app.starseed.os"
    if not log_dir.exists():
        return {"enlaces.log": [], "control-neuronas.log": []}
    lineas_enlaces = []
    lineas_control = []
    for f in log_dir.glob("*.log"):
        try:
            with open(f, encoding="utf-8") as fh:
                lineas = fh.readlines()
        except OSError:
            continue
        if "enlaces" in f.name:
            lineas_enlaces.extend(recortar_ventana(lineas, ventana_inicio, ventana_fin))
        elif "control-neuronas" in f.name:
            lineas_control.extend(recortar_ventana(lineas, ventana_inicio, ventana_fin))
    return {"enlaces.log": lineas_enlaces, "control-neuronas.log": lineas_control}


def leer_logs_maggabox(ventana_inicio, ventana_fin=None):
    """Lee logs del Maggabox por SSH."""
    cmd = [
        "ssh", "-i", str(Path.home() / ".ssh" / "starseed_nodo1"),
        "-o", "IdentitiesOnly=yes",
        "-o", "BatchMode=yes",
        "-o", "ConnectTimeout=8",
        "-o", "UserKnownHostsFile=" + str(Path.home() / ".ssh" / "known_hosts_starseed_nodo"),
        "maggasukha@starseed-nodo-1.local",
        "cat ~/.local/share/app.starseed.os/*.log 2>/dev/null || true"
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        if result.returncode != 0:
            return {"error": f"SSH falló: {result.stderr.strip()}"}
        lineas = result.stdout.splitlines(keepends=True)
        lineas_enlaces = recortar_ventana(lineas, ventana_inicio, ventana_fin)
        lineas_control = recortar_ventana(lineas, ventana_inicio, ventana_fin)
        return {"enlaces.log": lineas_enlaces, "control-neuronas.log": lineas_control}
    except subprocess.TimeoutExpired:
        return {"error": "timeout SSH"}
    except Exception as e:
        return {"error": str(e)}


def leer_logs_tableta(ventana_inicio, ventana_fin=None):
    """Lee logs de la tableta por adb logcat."""
    try:
        result = subprocess.run(["adb", "devices"], capture_output=True, text=True, timeout=5)
        if "device" not in result.stdout or "unauthorized" in result.stdout:
            return {"error": "sin acceso: falta emparejar adb"}
        result = subprocess.run(["adb", "logcat", "-d", "-v", "time"], capture_output=True, text=True, timeout=10)
        lineas = result.stdout.splitlines(keepends=True)
        lineas_enlaces = recortar_ventana(lineas, ventana_inicio, ventana_fin)
        lineas_control = recortar_ventana(lineas, ventana_inicio, ventana_fin)
        return {"enlaces.log": lineas_enlaces, "control-neuronas.log": lineas_control}
    except subprocess.TimeoutExpired:
        return {"error": "timeout adb"}
    except FileNotFoundError:
        return {"error": "adb no instalado"}
    except Exception as e:
        return {"error": str(e)}


# ── Subórdenes ──────────────────────────────────────────────────────────────

def cmd_listar(args):
    bateria = cargar_bateria()
    pruebas = filtrar_pruebas(bateria, args.bloque, args.ronda)
    for p in pruebas:
        print(f"{p['id']}  R{p['ronda']}  {p['bloque']}-{p['par']}-{p['antena']}  {p['titulo']}")


def cmd_siguiente(args):
    bateria = cargar_bateria()
    registro = leer_registro()
    p = siguiente_pendiente(bateria, registro)
    if p:
        print(p["id"])
    else:
        print("ninguna pendiente")


def cmd_empezar(args):
    bateria = cargar_bateria()
    prueba = next((p for p in bateria["pruebas"] if p["id"] == args.id), None)
    if not prueba:
        print(f"error: prueba {args.id} no existe", file=sys.stderr)
        return 1
    registro = leer_registro()
    if any(e.get("id") == args.id and e.get("accion") == "empezar" for e in registro):
        print(f"la prueba {args.id} ya se empezó")
        return 0
    inicio = ahora_iso()
    entrada = {"id": args.id, "accion": "empezar", "inicio": inicio, "pasos": prueba["pasos"]}
    guardar_registro(entrada)
    # Publicar en Chat Director
    texto = f"🔬 **Prueba {args.id} iniciada** ({inicio})\n\n**Pasos para Alex:**\n" + "\n".join(f"{i+1}. {p}" for i, p in enumerate(prueba["pasos"]))
    subprocess.run([
        sys.executable, "-m", "scripts.puente.director_chat", "publicar",
        texto, "--de", "director-presidente", "--tipo", "aviso", "--tarea", args.id
    ], cwd=DIR_RAIZ, check=False)
    print(f"empezada {args.id} a las {inicio}")
    return 0


def cmd_recoger(args):
    bateria = cargar_bateria()
    prueba = next((p for p in bateria["pruebas"] if p["id"] == args.id), None)
    if not prueba:
        print(f"error: prueba {args.id} no existe", file=sys.stderr)
        return 1
    registro = leer_registro()
    inicio_evt = next((e for e in registro if e.get("id") == args.id and e.get("accion") == "empezar"), None)
    if not inicio_evt:
        print(f"error: la prueba {args.id} no se ha empezado", file=sys.stderr)
        return 1
    inicio = inicio_evt["inicio"]
    fin = ahora_iso()
    # Crear directorio de evidencias
    evid_dir = EVIDENCIAS_DIR / f"{args.id}-{fecha_corta()}"
    evid_dir.mkdir(parents=True, exist_ok=True)
    # Leer logs de cada aparato
    for aparato in prueba["aparatos"]:
        if aparato == "mac":
            logs = leer_logs_mac(inicio, fin)
        elif aparato == "maggabox":
            logs = leer_logs_maggabox(inicio, fin)
        elif aparato == "tableta":
            logs = leer_logs_tableta(inicio, fin)
        else:
            logs = {"error": f"aparato desconocido: {aparato}"}
        # Guardar
        for nombre, lineas in logs.items():
            if isinstance(lineas, list):
                (evid_dir / f"{aparato}-{nombre}").write_text("".join(lineas), encoding="utf-8")
            else:
                (evid_dir / f"{aparato}-error.txt").write_text(str(lineas), encoding="utf-8")
    # Anotar en registro
    entrada = {"id": args.id, "accion": "recoger", "fin": fin, "directorio": str(evid_dir)}
    guardar_registro(entrada)
    print(f"evidencias en {evid_dir}")
    return 0


def cmd_evaluar(args):
    bateria = cargar_bateria()
    prueba = next((p for p in bateria["pruebas"] if p["id"] == args.id), None)
    if not prueba:
        print(f"error: prueba {args.id} no existe", file=sys.stderr)
        return 1
    registro = leer_registro()
    recoger_evt = next((e for e in reversed(registro) if e.get("id") == args.id and e.get("accion") == "recoger"), None)
    if not recoger_evt:
        print(f"error: no hay evidencias para {args.id} (ejecuta 'recoger' primero)", file=sys.stderr)
        return 1
    evid_dir = Path(recoger_evt["directorio"])
    if not evid_dir.exists():
        print(f"error: directorio de evidencias no existe: {evid_dir}", file=sys.stderr)
        return 1
    # Leer evidencias por aparato
    lineas_por_aparato = {}
    for aparato in prueba["aparatos"]:
        lineas_todas = []
        for f in evid_dir.glob(f"{aparato}-*.log"):
            try:
                lineas_todas.extend(f.read_text(encoding="utf-8").splitlines(keepends=True))
            except OSError:
                pass
        lineas_por_aparato[aparato] = lineas_todas
    # Evaluar
    resultados = evaluar_prueba_completa(lineas_por_aparato, prueba["criterios"])
    # Determinar resultado global
    aparatos_ok = sum(1 for r in resultados.values() if r["ok"])
    total_aparatos = len(resultados)
    if aparatos_ok == total_aparatos:
        global_ok = "ok"
    elif aparatos_ok > 0:
        global_ok = "parcial"
    else:
        global_ok = "fallo"
    # Guardar evaluación
    entrada = {"id": args.id, "accion": "evaluar", "resultado": global_ok, "detalle": resultados}
    guardar_registro(entrada)
    # Mostrar
    for aparato, res in resultados.items():
        estado = "✅" if res["ok"] else "❌"
        print(f"  {aparato}: {estado} (debe: {len(res['cumplidos'])}, fallados: {len(res['fallados'])}, no_debe violados: {len(res['no_debe_violados'])})")
        if res["fallados"]:
            for p in res["fallados"]:
                print(f"    FALTA: {p}")
        if res["no_debe_violados"]:
            for p in res["no_debe_violados"]:
                print(f"    NO_DEBE: {p}")
    print(f"Resultado global: {global_ok}")
    return 0


def cmd_cerrar(args):
    bateria = cargar_bateria()
    prueba = next((p for p in bateria["pruebas"] if p["id"] == args.id), None)
    if not prueba:
        print(f"error: prueba {args.id} no existe", file=sys.stderr)
        return 1
    if args.resultado not in ("ok", "parcial", "fallo"):
        print("error: --resultado debe ser ok, parcial o fallo", file=sys.stderr)
        return 1
    entrada = {"id": args.id, "accion": "cerrar", "resultado": args.resultado, "nota": args.nota, "fin": ahora_iso()}
    guardar_registro(entrada)
    print(f"prueba {args.id} cerrada con resultado {args.resultado}")
    return 0


def cmd_informe(args):
    bateria = cargar_bateria()
    registro = leer_registro()
    tabla = formatear_informe(bateria, registro, args.ronda)
    print(tabla)
    # Publicar en Chat Director
    texto = f"📊 **Informe de pruebas de la malla** (batería {bateria['bateria']})"
    if args.ronda:
        texto += f" — ronda {args.ronda}"
    texto += f"\n\n{tabla}"
    subprocess.run([
        sys.executable, "-m", "scripts.puente.director_chat", "publicar",
        texto, "--de", "director-presidente", "--tipo", "informe", "--tarea", f"informe-r{args.ronda or 'todas'}"
    ], cwd=DIR_RAIZ, check=False)
    return 0


# ── Main ────────────────────────────────────────────────────────────────────

def main(argv=None):
    ap = argparse.ArgumentParser(description="Conductor de pruebas de la malla (PRU1118)")
    sub = ap.add_subparsers(dest="orden", required=True)

    p = sub.add_parser("listar", help="lista las pruebas")
    p.add_argument("--bloque")
    p.add_argument("--ronda", type=int)

    sub.add_parser("siguiente", help="siguiente prueba pendiente")

    p = sub.add_parser("empezar", help="inicia una prueba")
    p.add_argument("id")

    p = sub.add_parser("recoger", help="recoge evidencias de una prueba")
    p.add_argument("id")

    p = sub.add_parser("evaluar", help="evalúa una prueba con sus criterios")
    p.add_argument("id")

    p = sub.add_parser("cerrar", help="cierra una prueba con resultado")
    p.add_argument("id")
    p.add_argument("--resultado", required=True, choices=("ok", "parcial", "fallo"))
    p.add_argument("--nota", default="")

    p = sub.add_parser("informe", help="genera informe de pruebas")
    p.add_argument("--ronda", type=int)

    args = ap.parse_args(argv)
    if args.orden == "listar":
        return cmd_listar(args)
    if args.orden == "siguiente":
        return cmd_siguiente(args)
    if args.orden == "empezar":
        return cmd_empezar(args)
    if args.orden == "recoger":
        return cmd_recoger(args)
    if args.orden == "evaluar":
        return cmd_evaluar(args)
    if args.orden == "cerrar":
        return cmd_cerrar(args)
    if args.orden == "informe":
        return cmd_informe(args)
    return 0


if __name__ == "__main__":
    sys.exit(main())