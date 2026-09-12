#!/usr/bin/env python3
"""Ejecutor directo de tareas pendientes — procesa cola con opencode.

Simple, directo, sin orquestadores complejos que no arrancan.
"""

import json
import os
import subprocess
import time
from pathlib import Path

RAIZ = Path(os.environ.get("STARSEED_ROOT", "/Users/alex/Documents/starseed-os-main"))
COLA = RAIZ / "starseed_memory_root/olas/cola-reactivar-pendientes.json"
WT_BASE = Path(os.environ.get("STARSEED_WT", "~/Documents/starseed-wt")).expanduser()
LOG = RAIZ / "starseed_memory_root/logs/ejecutor-directo.log"

def log(msg):
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    with open(LOG, "a") as f:
        f.write(line + "\n")

def cargar_tareas():
    """Carga tareas pendientes de la cola"""
    if not COLA.exists():
        return []
    with open(COLA) as f:
        cola = json.load(f)
    return [t for t in cola if t.get("estado") == "pendiente"]

def ejecutar_tarea(tarea):
    """Ejecuta una tarea usando opencode"""
    tid = tarea["id"]
    archivos = tarea.get("archivos", [])
    prompt = tarea.get("prompt", "")
    modelo = tarea.get("modelo", "xkiro/qwen/qwen3-coder-plus:free")
    
    if not archivos or not prompt:
        log(f"❌ {tid}: sin archivos o prompt")
        return False
    
    # Crear worktree
    wt_path = WT_BASE / tid
    rama = f"ola/{tid}"
    
    try:
        # Crear rama y worktree
        subprocess.run(["git", "branch", rama], cwd=RAIZ, capture_output=True, timeout=10)
        if not wt_path.exists():
            subprocess.run(
                ["git", "worktree", "add", str(wt_path), rama],
                cwd=RAIZ, capture_output=True, timeout=15
            )
        
        # Prompt completo
        full_prompt = f"""Tarea: {tarea.get('titulo', tid)}
Archivos: {', '.join(archivos)}

{prompt}

Instrucciones:
1. Edita SOLO los archivos listados
2. Código en español con acentos
3. Sin `any`, con tipos estrictos
4. `cursor-pointer` en lo clicable
5. Tests con import {{ describe, it, expect }} from "vitest"
6. Commit con: git commit -am "fix: {tarea.get('titulo', tid)[:60]}"
"""
        
        log(f"✍️  {tid}: ejecutando opencode con {modelo}...")
        
        # Ejecutar opencode
        resultado = subprocess.run(
            ["opencode", "run", full_prompt, "--model", modelo],
            cwd=wt_path,
            capture_output=True,
            text=True,
            timeout=300  # 5 min máx
        )
        
        if resultado.returncode == 0:
            log(f"✅ {tid}: completado")
            return True
        else:
            log(f"❌ {tid}: falló (rc={resultado.returncode})")
            log(f"   stdout: {resultado.stdout[:200]}")
            log(f"   stderr: {resultado.stderr[:200]}")
            return False
            
    except subprocess.TimeoutExpired:
        log(f"⏰ {tid}: timeout")
        return False
    except Exception as e:
        log(f"❌ {tid}: excepción {e}")
        return False

def main():
    log("🚀 Ejecutor directo iniciado")
    
    while True:
        tareas = cargar_tareas()
        if not tareas:
            log("✅ No hay tareas pendientes")
            break
        
        log(f"📋 {len(tareas)} tareas pendientes")
        
        for tarea in tareas[:3]:  # Procesar de a 3
            ejecutar_tarea(tarea)
            time.sleep(5)
        
        time.sleep(10)

if __name__ == "__main__":
    main()
