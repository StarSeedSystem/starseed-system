#!/usr/bin/env python3
"""starseed-director · meta-orquestador INTELIGENTE que sincroniza el máximo
de agentes posible usando Apinex como proveedor prioritario.

Funciona en 3 fases:
  1. ESCANEA todas las colas vivas y encuentra tareas ejecutables
  2. CALCULA el paralelismo máximo según memoria y dependencias
  3. LANZA agentes IA (opencode) con modelos de Apinex, rotando proveedores

Los directores son agentes IA que monitorean y reorganizan continuamente.
"""

import glob, json, os, re, subprocess, sys, time, threading
from pathlib import Path
from datetime import datetime

ROOT = os.environ.get("STARSEED_ROOT") or str(Path.home() / "Documents" / "starseed-os-main")
WT_BASE = os.path.expanduser("~/Documents/starseed-wt")
MEMORIA_LIMITE_MB = 1400

# ── Proveedores en orden de prioridad ────────────────────────────────────────
PROVEEDORES = [
    {"nombre": "apinex", "modelos": [
        "free/gemini-3.8-flash", "free/muse-spark-1.3", "free/glm-5.3-flash",
        "free/deepseek-v4-flash-0731", "free/deepseek-v4-pro-0813", "free/qwen-3.8-max",
        "free/gpt-5.6-luna", "free/gemini-3.1-pro",
    ], "clave_var": "STARSEED_PASARELA_APINEX_KEY"},
    {"nombre": "llm7", "modelos": ["minimax-m2.7", "gpt-oss"], "clave_var": None},
    {"nombre": "xkiro", "modelos": [
        "qwen/qwen3-coder-plus:free", "minimax/minimax-m3:free",
        "qwen/qwen3.8-max:free", "deepseek/deepseek-v4-pro",
    ], "clave_var": "XKIRO_API_KEY"},
    {"nombre": "nvidia", "modelos": [
        "moonshotai/kimi-k3", "deepseek-ai/deepseek-v4-flash-0731", "deepseek-ai/deepseek-v4-pro-0813",
    ], "clave_var": "NVIDIA_API_KEY"},
    {"nombre": "tokenrouter", "modelos": ["z-ai/glm-5.3-free"], "clave_var": "TOKENROUTER_API_KEY"},
    {"nombre": "openrouter", "modelos": ["nvidia/nemotron-3.5-lightning:free"], "clave_var": "OPENROUTER_API_KEY"},
]

def leer_env(*rutas):
    env = {}
    for ruta in rutas:
        ruta = os.path.expanduser(ruta)
        if not os.path.exists(ruta):
            continue
        for linea in open(ruta):
            linea = linea.strip()
            if not linea or linea.startswith("#"):
                continue
            if "=" in linea:
                k, v = linea.split("=", 1)
                env[k.strip()] = v.strip()
    return env

def memoria_libre_mb():
    try:
        salida = subprocess.check_output(["vm_stat"], text=True)
        paginas_libre = 0
        for linea in salida.split("\n"):
            if "Pages free" in linea:
                paginas_libre += int(re.search(r"\d+", linea).group())
            elif "Pages inactive" in linea:
                paginas_libre += int(re.search(r"\d+", linea).group())
        return (paginas_libre * 4096) / (1024 * 1024)
    except Exception:
        return 9999

def worktrees_activos():
    try:
        salida = subprocess.check_output(["git", "worktree", "list", "--porcelain"], text=True)
        return [l.split()[1] for l in salida.splitlines() if l.startswith("worktree ")]
    except Exception:
        return []

def tareas_ejecutables(cola_ruta):
    cola = json.load(open(cola_ruta))
    ids_hechos = {t["id"] for t in cola if t.get("estado") in ("hecho", "integrado")}
    
    ejecutables = []
    for t in cola:
        if t.get("aprobacion"):
            continue
        if t.get("estado") in ("hecho", "integrado", "bloqueado"):
            continue
        deps = t.get("depende", []) or []
        deps_pendientes = [d for d in deps if d not in ids_hechos and any(d == ot["id"] for ot in cola)]
        if not deps_pendientes:
            ejecutables.append(t)
    return ejecutables

def lanzar_agente(tarea, modelo, worktree, env):
    """Lanza un agente opencode en un worktree."""
    try:
        os.makedirs(os.path.dirname(worktree), exist_ok=True)
        
        # Crear worktree si no existe
        if not os.path.exists(os.path.join(worktree, ".git")):
            subprocess.run(
                ["git", "worktree", "add", "-b", f"ola/{tarea['id']}", worktree, "main"],
                capture_output=True, timeout=30
            )
        
        # Construir prompt para el agente
        prompt = f"""Eres un agente de orquestación de StarSeed OS.
Tarea: {task['titulo']}
Archivos: {', '.join(task.get('archivos', []))}

Instrucciones:
1. Lee los archivos indicados
2. Ejecuta la tarea descrita
3. Guarda los cambios
4. Ejecuta: git add -A && git commit -m "feat: {task['id']} - {task['titulo'][:50]}"

Prompt completo:
{task.get('prompt', 'Ejecuta la tarea asignada.')}

NO edites archivos fuera de tu lista. NO hagas build. NO instales dependencias.
"""
        
        # Lanzar opencode
        cmd = ["opencode", "run", "--model", modelo]
        proc = subprocess.Popen(
            cmd, cwd=worktree,
            stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )
        proc.stdin.write(prompt.encode())
        proc.stdin.close()
        
        return proc.pid
    except Exception as e:
        print(f"   ❌ Error lanzando {tarea['id']}: {e}")
        return None

def main():
    env = leer_env(os.path.join(ROOT, ".env.local"), "~/.hermes/.env", "~/.starseed/env")
    max_trabajadores = int(sys.argv[sys.argv.index("--max-trabajadores") + 1]) if "--max-trabajadores" in sys.argv else 8
    dry_run = "--dry-run" in sys.argv
    
    print(f"[{datetime.now().strftime('%H:%M:%S')}] 🎯 Director de orquestación StarSeed OS")
    print(f"   Proveedor prioritario: Apinex (8 modelos gratis)")
    print()
    
    # ── 1. Recolectar TODAS las tareas ejecutables ───────────────────────────
    todas_ejecutables = []
    for cola_ruta in sorted(glob.glob(os.path.join(ROOT, "starseed_memory_root/olas/cola-*.json"))):
        ejecutables = tareas_ejecutables(cola_ruta)
        for t in ejecutables:
            t["_cola"] = os.path.basename(cola_ruta)
            todas_ejecutables.append(t)
    
    if not todas_ejecutables:
        print("✅ No hay tareas ejecutables. Sistema al día.")
        return
    
    # ── 2. Limitar por memoria ──────────────────────────────────────────────
    memoria = memoria_libre_mb()
    workers_posibles = min(max_trabajadores, int(memoria / MEMORIA_LIMITE_MB))
    workers_posibles = max(1, workers_posibles)
    
    # ── 3. Seleccionar tareas (prioridad: olas recientes, menos dependientes) ─
    # Ordenar por ola (más reciente primero)
    def orden_ola(t):
        match = re.search(r"Ola (\d+)", t.get("_cola", ""))
        return -int(match.group(1)) if match else 0
    
    todas_ejecutables.sort(key=orden_ola)
    tareas_seleccionadas = todas_ejecutables[:workers_posibles]
    
    print(f"📊 Resumen:")
    print(f"   Tareas ejecutables encontradas: {len(todas_ejecutables)}")
    print(f"   Memoria libre: {memoria:.0f} MB → {workers_posibles} trabajadores posibles")
    print(f"   Tareas seleccionadas para lanzar: {len(tareas_seleccionadas)}")
    print()
    
    # ── 4. Lanzar agentes ───────────────────────────────────────────────────
    worktrees = worktrees_activos()
    lanzados = 0
    modelo_idx = 0
    
    for i, t in enumerate(tareas_seleccionadas):
        # Rotar modelos de Apinex
        modelo = f"apinex/{PROVEEDORES[0]['modelos'][modelo_idx % len(PROVEEDORES[0]['modelos'])]}"
        modelo_idx += 1
        
        worktree = os.path.join(WT_BASE, t["id"])
        
        print(f"🚀 Lanzando: {t['id']} ({t['_cola']})")
        print(f"   Modelo: {modelo}")
        print(f"   Archivos: {', '.join(t.get('archivos', []))[:60]}")
        
        if dry_run:
            print(f"   [DRY RUN] No se lanza")
            continue
        
        pid = lanzar_agente(t, modelo, worktree, env)
        if pid:
            print(f"   ✅ PID: {pid} → {worktree}")
            lanzados += 1
        
        print()
    
    print(f"✅ {lanzados} agentes lanzados de {len(tareas_seleccionadas)} planificados")
    print(f"   Próximo escaneo en 60 segundos...")

if __name__ == "__main__":
    main()
