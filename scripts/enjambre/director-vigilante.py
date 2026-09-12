#!/usr/bin/env python3
"""StarSeed Director Vigilante — Verifica y reporta el progreso del enjambre
cada 30 segundos, detecta agentes colgados y avisa automáticamente.

Se ejecuta como proceso persistente en background.
"""

import json
import os
import time
import subprocess
from pathlib import Path

RAIZ = Path(os.environ.get("STARSEED_ROOT", "/Users/alex/Documents/starseed-os-main"))
OLAS = RAIZ / "starseed_memory_root/olas"
LOG = RAIZ / "starseed_memory_root/logs/director-vigilante.log"
INTERVALO = 30  # segundos entre verificaciones
QUIETO_MAX = 600  # 10 minutos sin avance = colgada

def log(msg):
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    with open(LOG, "a") as f:
        f.write(line + "\n")

def leer_latidos():
    """Lee todos los archivos de latido"""
    latidos = {}
    if not OLAS.exists():
        return latidos
    for f in OLAS.glob("latidos-*.json"):
        try:
            data = json.loads(f.read_text())
            cola = data.get("cola", f.stem.replace("latidos-", ""))
            for tid, info in data.get("tareas", {}).items():
                info["_cola"] = cola
                info["_archivo"] = str(f)
                latidos[f"{cola}|{tid}"] = info
        except (json.JSONDecodeError, OSError):
            continue
    return latidos

def verificar():
    """Verifica el estado del enjambre y reporta problemas"""
    latidos = leer_latidos()
    if not latidos:
        log("⚠️  No hay latidos activos")
        return

    vivos = []
    colgados = []
    hechas = 0
    total_bytes = 0

    for key, info in latidos.items():
        fase = info.get("fase", "?")
        bytes_val = info.get("bytes", 0)
        avance = info.get("avance", 0)
        total_bytes += bytes_val

        if fase == "hecho":
            hechas += 1
            continue

        # Verificar si está colgado
        ahora = time.time()
        quieto = ahora - avance if avance > 0 else 0

        if quieto > QUIETO_MAX and fase not in ("esperando_aprobacion", "integrado"):
            colgados.append({
                "id": key,
                "fase": fase,
                "modelo": info.get("modelo", "?"),
                "bytes": bytes_val,
                "quieto_s": int(quieto),
            })
        else:
            vivos.append({
                "id": key,
                "fase": fase,
                "modelo": info.get("modelo", "?"),
                "bytes": bytes_val,
                "minutos": info.get("minutos", 0),
            })

    # Reporte
    total = len(latidos)
    log(f"📊 Progreso: {hechas}/{total} hechas | {len(vivos)} activas | {len(colgados)} colgadas | {total_bytes:,} bytes total")

    if vivos:
        for v in vivos[:5]:
            log(f"   ✍️  {v['id']}: {v['fase']} | {v['modelo']} | {v['bytes']:,}B | {v['minutos']}min")

    if colgados:
        for c in colgados:
            log(f"   🚨 COLGADA: {c['id']}: {c['fase']} | {c['modelo']} | quieto {c['quieto_s']}s | {c['bytes']:,}B")
            # Marcar para soltar automáticamente
            marcar_soltar(c["id"])

def marcar_soltar(tid):
    """Marca una tarea colgada para soltar"""
    cola = tid.split("|")[0] if "|" in tid else "cola-reactivar-pendientes"
    control_path = OLAS / f"control-{cola}.json"
    
    try:
        control = {}
        if control_path.exists():
            control = json.loads(control_path.read_text())
        
        if tid not in control:
            control[tid] = {
                "accion": "soltar",
                "quien": "director-vigilante",
                "t": time.strftime("%Y-%m-%d %H:%M:%S"),
                "donde": "mac",
                "motivo": "colgada detectada por vigilancia",
            }
            control_path.write_text(json.dumps(control, ensure_ascii=False, indent=1))
            log(f"   ✅ Orden soltar escrita para {tid}")
    except Exception as e:
        log(f"   ❌ Error marcando soltar para {tid}: {e}")

def verificar_orquestador():
    """Verifica que el orquestador esté vivo"""
    try:
        result = subprocess.run(
            ["pgrep", "-f", "starseed-enjambre"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode != 0:
            log("🚨 ORQUESTADOR MUERTO — no se detecta proceso")
            return False
        pids = result.stdout.strip().split("\n")
        log(f"✅ Orquestador vivo (PIDs: {', '.join(pids[:3])})")
        return True
    except Exception as e:
        log(f"❌ Error verificando orquestador: {e}")
        return False

def main():
    log("🛡️  Director Vigilante iniciado")
    log(f"Intervalo: {INTERVALO}s | Quieto máx: {QUIETO_MAX}s")
    
    while True:
        try:
            verificar_orquestador()
            verificar()
        except Exception as e:
            log(f"❌ Error en verificación: {e}")
        
        time.sleep(INTERVALO)

if __name__ == "__main__":
    main()
