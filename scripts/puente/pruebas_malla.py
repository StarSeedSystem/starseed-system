#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Conductor de pruebas de la malla: lista la batería, recoge registros, evalúa y deja el registro.

Subórdenes:
  listar [--bloque B4] [--ronda 1]
  siguiente
  empezar <id>          # anota inicio UTC en pruebas/registro.jsonl y publica en Chat Director
  recoger <id>          # copia registros recortados a la ventana de la prueba
  evaluar <id>          # aplica criterios y da ok/parcial/fallo con líneas que lo prueban
  cerrar <id> --resultado ok|parcial|fallo --nota
  informe [--ronda N]   # tabla breve que publica en el Chat Director
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Rutas base
RAIZ = Path(__file__).resolve().parents[2]
PRUEBAS_DIR = RAIZ / "starseed_memory_root" / "pruebas"
BATERIA_PATH = PRUEBAS_DIR / "bateria-1118.json"
REGISTRO_PATH = PRUEBAS_DIR / "registro.jsonl"
EVIDENCIAS_DIR = PRUEBAS_DIR / "evidencias"

# Aparatos y sus rutas de logs
LOGS_MAC = Path.home() / "Library" / "Logs" / "app.starseed.os"
LOGS_MAGGABOX_BASE = Path.home() / ".local" / "share" / "app.starseed.os"
SSH_MAGGABOX = "maggasukha@starseed-nodo-1.local"
SSH_KEY = Path.home() / ".ssh" / "starseed_nodo1"
SSH_KNOWN_HOSTS = Path.home() / ".ssh" / "known_hosts_starseed_nodo"


def cargar_bateria() -> dict[str, Any]:
    """Carga la batería de pruebas desde el JSON."""
    with open(BATERIA_PATH, encoding="utf-8") as f:
        return json.load(f)


def guardar_registro(entrada: dict[str, Any]) -> None:
    """Añade una línea al registro JSONL."""
    REGISTRO_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(REGISTRO_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(entrada, ensure_ascii=False) + "\n")


def leer_registro() -> list[dict[str, Any]]:
    """Lee todo el registro JSONL."""
    if not REGISTRO_PATH.exists():
        return []
    with open(REGISTRO_PATH, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def obtener_prueba(bateria: dict, pid: str) -> dict[str, Any] | None:
    """Busca una prueba por su id en la batería."""
    for p in bateria.get("pruebas", []):
        if p["id"] == pid:
            return p
    return None


def ahora_iso() -> str:
    """Hora actual en ISO 8601 UTC."""
    return datetime.now(timezone.utc).isoformat()


def listar(bloque: str | None = None, ronda: int | None = None) -> None:
    """Lista las pruebas de la batería, opcionalmente filtradas."""
    bateria = cargar_bateria()
    pruebas = bateria.get("pruebas", [])
    if bloque:
        pruebas = [p for p in pruebas if str(p["bloque"]) == str(bloque)]
    if ronda:
        # Por ahora, la ronda no está en la estructura; se ignora
        pass
    for p in pruebas:
        print(f"{p['id']}  [{p['bloque']}-{p['par']}-{p['antena']}]  {p['titulo']}")
        print(f"  Aparatos: {', '.join(p['aparatos'])}  Antena: {p['antena_nombre']}")
        print(f"  Pasos: {len(p['pasos'])}")


def siguiente() -> None:
    """Muestra la primera prueba pendiente (sin entrada 'empezar' en el registro)."""
    bateria = cargar_bateria()
    registro = leer_registro()
    empezadas = {e["prueba"] for e in registro if e.get("accion") == "empezar"}
    for p in bateria.get("pruebas", []):
        if p["id"] not in empezadas:
            print(p["id"])
            return
    print("Todas las pruebas tienen entrada 'empezar'")


def publicar_chat_director(texto: str, tipo: str = "aviso", tarea: str | None = None) -> None:
    """Publica un mensaje en el Chat Director usando director_chat.py."""
    cmd = [
        sys.executable,
        str(RAIZ / "scripts" / "puente" / "director_chat.py"),
        "publicar",
        texto,
        "--de", "director-presidente",
        "--tipo", tipo,
    ]
    if tarea:
        cmd.extend(["--tarea", tarea])
    subprocess.run(cmd, check=False, capture_output=True)


def empezar(pid: str) -> None:
    """Marca el inicio de una prueba y publica los pasos en el Chat Director."""
    bateria = cargar_bateria()
    prueba = obtener_prueba(bateria, pid)
    if not prueba:
        print(f"Prueba {pid} no encontrada", file=sys.stderr)
        sys.exit(1)

    inicio = ahora_iso()
    entrada = {
        "t": inicio,
        "accion": "empezar",
        "prueba": pid,
        "bloque": prueba["bloque"],
        "par": prueba["par"],
        "antena": prueba["antena"],
    }
    guardar_registro(entrada)

    # Publicar en Chat Director
    pasos_texto = "\n".join(f"  {i+1}. {paso}" for i, paso in enumerate(prueba["pasos"]))
    texto = (
        f"🧪 Prueba {pid} iniciada ({prueba['titulo']})\n"
        f"Bloque {prueba['bloque']} · Par {prueba['par']} · Antena {prueba['antena']}\n"
        f"Aparatos: {', '.join(prueba['aparatos'])}\n"
        f"Antena: {prueba['antena_nombre']}\n\n"
        f"Pasos para Alex:\n{pasos_texto}"
    )
    publicar_chat_director(texto, tipo="aviso", tarea=pid)
    print(f"Prueba {pid} iniciada a las {inicio}")


def recortar_ventana(lineas: list[str], inicio: str, fin: str | None = None) -> list[str]:
    """Recorta líneas de log a la ventana temporal [inicio, fin]."""
    try:
        t_inicio = datetime.fromisoformat(inicio.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return lineas
    t_fin = datetime.now(timezone.utc).timestamp()
    if fin:
        try:
            t_fin = datetime.fromisoformat(fin.replace("Z", "+00:00")).timestamp()
        except ValueError:
            pass

    out = []
    for linea in lineas:
        # Extraer timestamp ISO al inicio de la línea
        m = re.match(r"^(\d{4}-\d\d-\d\dT[\d:.]+Z)", linea)
        if m:
            try:
                t_linea = datetime.fromisoformat(m.group(1).replace("Z", "+00:00")).timestamp()
                if t_inicio <= t_linea <= t_fin:
                    out.append(linea)
            except ValueError:
                out.append(linea)
        else:
            out.append(linea)
    return out


def leer_logs_mac(inicio: str, fin: str | None = None) -> dict[str, list[str]]:
    """Lee los logs de la Mac recortados a la ventana."""
    resultado = {"enlaces.log": [], "control-neuronas.log": [], "servidor-local.log": []}
    for nombre in resultado.keys():
        ruta = LOGS_MAC / nombre
        if ruta.exists():
            lineas = ruta.read_text(encoding="utf-8", errors="ignore").splitlines()
            resultado[nombre] = recortar_ventana(lineas, inicio, fin)
    return resultado


def leer_logs_maggabox(inicio: str, fin: str | None = None) -> dict[str, list[str]]:
    """Lee los logs del Maggabox por SSH recortados a la ventana."""
    resultado = {"enlaces.log": [], "control-neuronas.log": []}
    for nombre in resultado.keys():
        ruta_remota = LOGS_MAGGABOX_BASE / nombre
        cmd = [
            "ssh", "-i", str(SSH_KEY),
            "-o", "IdentitiesOnly=yes",
            "-o", "BatchMode=yes",
            "-o", "ConnectTimeout=8",
            "-o", f"UserKnownHostsFile={SSH_KNOWN_HOSTS}",
            SSH_MAGGABOX,
            f"cat {ruta_remota} 2>/dev/null || true"
        ]
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
            lineas = proc.stdout.splitlines()
            resultado[nombre] = recortar_ventana(lineas, inicio, fin)
        except (subprocess.TimeoutExpired, subprocess.SubprocessError):
            resultado[nombre] = [f"# Error SSH leyendo {nombre}"]
    return resultado


def leer_logs_tableta(inicio: str, fin: str | None = None) -> dict[str, list[str]]:
    """Lee logs de la tableta por adb logcat filtrado por la app."""
    resultado = {"logcat": []}
    # Verificar si hay dispositivo adb
    try:
        proc = subprocess.run(["adb", "devices"], capture_output=True, text=True, timeout=5)
        lineas = proc.stdout.strip().splitlines()
        if len(lineas) < 2 or not any("device" in l and not l.startswith("List") for l in lineas):
            resultado["logcat"] = ["# sin acceso: falta emparejar adb"]
            return resultado
    except (subprocess.TimeoutExpired, subprocess.SubprocessError, FileNotFoundError):
        resultado["logcat"] = ["# sin acceso: adb no disponible"]
        return resultado

    # Filtrar por identificador de la app (paquete)
    cmd = ["adb", "logcat", "-d", "-v", "time", "*:S", "starseed:V"]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        lineas = proc.stdout.splitlines()
        resultado["logcat"] = recortar_ventana(lineas, inicio, fin)
    except (subprocess.TimeoutExpired, subprocess.SubprocessError):
        resultado["logcat"] = ["# error ejecutando adb logcat"]
    return resultado


def leer_logs_malla(aparato: str, inicio: str, fin: str | None = None) -> dict[str, list[str]]:
    """Lee logs compartidos por la malla (si la app ya los comparte).
    Devuelve dict vacío si no hay compartición por malla."""
    # Por ahora no hay implementación de compartición por malla;
    # cuando exista, se leerá de la ruta compartida.
    return {}


def prefijo_aparato(aparato: str) -> str:
    """Devuelve el prefijo de archivo para un aparato."""
    if aparato == "mac":
        return "mac-"
    elif aparato in ("tablet", "maggaboard", "tableta"):
        return "tableta-"
    else:
        return "maggabox-"


def recoger(pid: str) -> None:
    """Copia los registros de los tres aparatos a pruebas/evidencias/<id>-<fecha>/."""
    bateria = cargar_bateria()
    prueba = obtener_prueba(bateria, pid)
    if not prueba:
        print(f"Prueba {pid} no encontrada", file=sys.stderr)
        sys.exit(1)

    registro = leer_registro()
    inicio_entradas = [e for e in registro if e.get("prueba") == pid and e.get("accion") == "empezar"]
    if not inicio_entradas:
        print(f"La prueba {pid} no tiene entrada 'empezar'", file=sys.stderr)
        sys.exit(1)
    inicio = inicio_entradas[-1]["t"]

    # Directorio de evidencias
    fecha = datetime.now().strftime("%Y%m%dT%H%M%S")
    dir_evidencia = EVIDENCIAS_DIR / f"{pid}-{fecha}"
    dir_evidencia.mkdir(parents=True, exist_ok=True)

    # Leer logs de cada aparato (primero intenta malla, luego local/SSH/adb)
    todos_logs: dict[str, dict[str, list[str]]] = {}
    for aparato in prueba["aparatos"]:
        logs_malla = leer_logs_malla(aparato, inicio)
        if logs_malla and any(logs_malla.values()):
            todos_logs[aparato] = logs_malla
        elif aparato == "mac":
            todos_logs[aparato] = leer_logs_mac(inicio)
        elif aparato in ("maggabox", "maggaboard"):
            todos_logs[aparato] = leer_logs_maggabox(inicio)
        elif aparato in ("tablet", "tableta"):
            todos_logs[aparato] = leer_logs_tableta(inicio)
        else:
            todos_logs[aparato] = {}

    # Guardar
    for aparato, logs in todos_logs.items():
        pref = prefijo_aparato(aparato)
        for nombre, lineas in logs.items():
            (dir_evidencia / f"{pref}{nombre}").write_text("\n".join(lineas) + "\n", encoding="utf-8")

    # Metadatos
    meta = {
        "prueba": pid,
        "inicio": inicio,
        "recogida": ahora_iso(),
        "aparatos": prueba["aparatos"],
    }
    (dir_evidencia / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    entrada = {
        "t": ahora_iso(),
        "accion": "recoger",
        "prueba": pid,
        "directorio": str(dir_evidencia.relative_to(RAIZ)),
    }
    guardar_registro(entrada)
    print(f"Evidencias guardadas en {dir_evidencia.relative_to(RAIZ)}")


def evaluar_patrones(lineas: list[str], patrones_debe: list[str], patrones_no_debe: list[str]) -> dict[str, Any]:
    """Evalúa una lista de líneas contra patrones debe/no_debe."""
    resultados = {"debe": [], "no_debe": [], "ok": True, "lineas_prueba": []}

    for patron in patrones_debe:
        encontrado = False
        for i, linea in enumerate(lineas):
            if patron in linea:
                encontrado = True
                resultados["lineas_prueba"].append({"patron": patron, "linea": i, "texto": linea[:200]})
                break
        resultados["debe"].append({"patron": patron, "encontrado": encontrado})
        if not encontrado:
            resultados["ok"] = False

    for patron in patrones_no_debe:
        encontrado = False
        for i, linea in enumerate(lineas):
            if patron in linea:
                encontrado = True
                resultados["lineas_prueba"].append({"patron": f"!{patron}", "linea": i, "texto": linea[:200]})
                break
        resultados["no_debe"].append({"patron": patron, "encontrado": encontrado})
        if encontrado:
            resultados["ok"] = False

    return resultados


def evaluar(pid: str) -> None:
    """Aplica los criterios de la prueba a las evidencias recogidas."""
    bateria = cargar_bateria()
    prueba = obtener_prueba(bateria, pid)
    if not prueba:
        print(f"Prueba {pid} no encontrada", file=sys.stderr)
        sys.exit(1)

    registro = leer_registro()
    recoger_entradas = [e for e in registro if e.get("prueba") == pid and e.get("accion") == "recoger"]
    if not recoger_entradas:
        print(f"La prueba {pid} no tiene evidencias recogidas", file=sys.stderr)
        sys.exit(1)
    dir_evidencia = RAIZ / recoger_entradas[-1]["directorio"]

    criterios = prueba.get("criterios", {})
    resultados_aparatos = {}
    global_ok = True

    for aparato, crit in criterios.items():
        # Leer todos los logs de ese aparato en el directorio
        lineas_todas = []
        pref = prefijo_aparato(aparato)
        for archivo in dir_evidencia.glob(f"{pref}*"):
            if archivo.suffix != ".json":
                lineas_todas.extend(archivo.read_text(encoding="utf-8", errors="ignore").splitlines())

        res = evaluar_patrones(lineas_todas, crit.get("debe", []), crit.get("no_debe", []))
        resultados_aparatos[aparato] = res
        if not res["ok"]:
            global_ok = False

    # Determinar veredicto global
    if global_ok:
        veredicto = "ok"
    else:
        # Parcial si al menos un aparato pasa
        if any(r["ok"] for r in resultados_aparatos.values()):
            veredicto = "parcial"
        else:
            veredicto = "fallo"

    resultado = {
        "prueba": pid,
        "veredicto": veredicto,
        "aparatos": resultados_aparatos,
        "evaluado": ahora_iso(),
    }
    (dir_evidencia / "evaluacion.json").write_text(json.dumps(resultado, ensure_ascii=False, indent=2), encoding="utf-8")

    entrada = {
        "t": ahora_iso(),
        "accion": "evaluar",
        "prueba": pid,
        "veredicto": veredicto,
    }
    guardar_registro(entrada)

    print(f"Veredicto: {veredicto}")
    for aparato, res in resultados_aparatos.items():
        print(f"  {aparato}: {'OK' if res['ok'] else 'FALLO'}")
        for item in res["lineas_prueba"]:
            prefijo = "✓" if not item["patron"].startswith("!") else "✗"
            print(f"    {prefijo} {item['patron']}: {item['texto']}")


def cerrar(pid: str, resultado: str, nota: str) -> None:
    """Cierra una prueba con resultado final y nota."""
    if resultado not in ("ok", "parcial", "fallo"):
        print("Resultado debe ser ok, parcial o fallo", file=sys.stderr)
        sys.exit(1)

    bateria = cargar_bateria()
    prueba = obtener_prueba(bateria, pid)
    if not prueba:
        print(f"Prueba {pid} no encontrada", file=sys.stderr)
        sys.exit(1)

    entrada = {
        "t": ahora_iso(),
        "accion": "cerrar",
        "prueba": pid,
        "resultado": resultado,
        "nota": nota,
    }
    guardar_registro(entrada)

    # Actualizar evaluación si existe
    registro_completo = leer_registro()
    recoger_entradas = [e for e in registro_completo if e.get("prueba") == pid and e.get("accion") == "recoger"]
    if recoger_entradas:
        dir_evidencia = RAIZ / recoger_entradas[-1]["directorio"]
        eval_path = dir_evidencia / "evaluacion.json"
        if eval_path.exists():
            eval_data = json.loads(eval_path.read_text(encoding="utf-8"))
            eval_data["resultado_final"] = resultado
            eval_data["nota_final"] = nota
            eval_data["cerrado"] = ahora_iso()
            eval_path.write_text(json.dumps(eval_data, ensure_ascii=False, indent=2), encoding="utf-8")

    texto = f"✅ Prueba {pid} cerrada: {resultado.upper()}\nNota: {nota}"
    publicar_chat_director(texto, tipo="hecho", tarea=pid)
    print(f"Prueba {pid} cerrada con resultado {resultado}")


def formatear_informe(bateria: dict, registro: list[dict[str, Any]], ronda: int | None = None) -> str:
    """Genera la tabla de informe (función pura para tests)."""
    # Estado de cada prueba
    estados = {}
    for e in registro:
        pid = e.get("prueba")
        if pid:
            if e["accion"] == "cerrar":
                estados[pid] = {"resultado": e["resultado"], "nota": e.get("nota", ""), "t": e["t"]}
            elif e["accion"] == "evaluar":
                if pid not in estados:
                    estados[pid] = {"resultado": e["veredicto"], "nota": "evaluado", "t": e["t"]}
            elif e["accion"] == "empezar":
                if pid not in estados:
                    estados[pid] = {"resultado": "en curso", "nota": "", "t": e["t"]}

    # Filtrar por ronda si se especifica (por bloque)
    pruebas = bateria.get("pruebas", [])
    if ronda:
        pruebas = [p for p in pruebas if p["bloque"] == ronda]

    # Tabla
    lineas = ["| ID | Título | Estado | Resultado | Nota |", "|---|---|---|---|---|"]
    for p in pruebas:
        pid = p["id"]
        est = estados.get(pid, {"resultado": "pendiente", "nota": "", "t": ""})
        lineas.append(f"| {pid} | {p['titulo']} | {est['resultado']} | {est.get('resultado', '-') } | {est['nota'][:50]} |")

    return "\n".join(lineas)


def informe(ronda: int | None = None) -> None:
    """Genera y publica un informe tabular de las pruebas."""
    bateria = cargar_bateria()
    registro = leer_registro()
    tabla = formatear_informe(bateria, registro, ronda)
    texto = f"📊 Informe de pruebas de la malla{' (bloque ' + str(ronda) + ')' if ronda else ''}\n\n{tabla}"
    publicar_chat_director(texto, tipo="informe")
    print(tabla)


def main() -> None:
    parser = argparse.ArgumentParser(prog="pruebas_malla", description="Conductor de pruebas de la malla")
    sub = parser.add_subparsers(dest="orden", required=True)

    s = sub.add_parser("listar", help="Lista la batería")
    s.add_argument("--bloque", help="Filtrar por bloque (ej. B4)")
    s.add_argument("--ronda", type=int, help="Filtrar por ronda/bloque")

    sub.add_parser("siguiente", help="Prueba pendiente")

    s = sub.add_parser("empezar", help="Inicia una prueba")
    s.add_argument("id", help="ID de la prueba (ej. B1-MT-A1)")

    s = sub.add_parser("recoger", help="Recoge evidencias")
    s.add_argument("id", help="ID de la prueba")

    s = sub.add_parser("evaluar", help="Evalúa criterios")
    s.add_argument("id", help="ID de la prueba")

    s = sub.add_parser("cerrar", help="Cierra una prueba")
    s.add_argument("id", help="ID de la prueba")
    s.add_argument("--resultado", required=True, choices=["ok", "parcial", "fallo"])
    s.add_argument("--nota", required=True)

    s = sub.add_parser("informe", help="Informe tabular")
    s.add_argument("--ronda", type=int, help="Bloque/ronda a informar")

    args = parser.parse_args()

    if args.orden == "listar":
        listar(args.bloque, args.ronda)
    elif args.orden == "siguiente":
        siguiente()
    elif args.orden == "empezar":
        empezar(args.id)
    elif args.orden == "recoger":
        recoger(args.id)
    elif args.orden == "evaluar":
        evaluar(args.id)
    elif args.orden == "cerrar":
        cerrar(args.id, args.resultado, args.nota)
    elif args.orden == "informe":
        informe(args.ronda)


if __name__ == "__main__":
    main()