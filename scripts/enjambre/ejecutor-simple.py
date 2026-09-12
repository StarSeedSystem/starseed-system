#!/usr/bin/env python3
"""StarSeed Ejecutor Simple — Procesa cola con Ollama local."""

import json
import os
import subprocess
import time
import urllib.request
from pathlib import Path

RAIZ = Path(os.environ.get("STARSEED_ROOT", "/Users/alex/Documents/starseed-os-main"))
COLA = RAIZ / "starseed_memory_root/olas/cola-reactivar-pendientes.json"
WT_BASE = Path(os.environ.get("STARSEED_WT", "~/Documents/starseed-wt")).expanduser()
LOG = RAIZ / "starseed_memory_root/logs/ejecutor-simple.log"
OLLAMA_URL = "http://localhost:11434"

def log(msg):
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    with open(LOG, "a") as f:
        f.write(line + "\n")

def verificar_ollama():
    try:
        req = urllib.request.Request(f"{OLLAMA_URL}/api/tags")
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())
            modelos = data.get("models", [])
            if modelos:
                return modelos[0]["name"]
    except Exception:
        pass
    return None

def llamar_ollama(prompt, modelo, max_tokens=4096):
    payload = {
        "model": modelo,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "options": {"num_predict": max_tokens},
    }
    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(f"{OLLAMA_URL}/api/chat", data=data,
                                    headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=180) as resp:
            result = json.loads(resp.read())
            return result.get("message", {}).get("content", "")
    except Exception as e:
        log(f"Error Ollama: {e}")
        return ""

def cargar_tareas():
    with open(COLA) as f:
        return json.load(f)

def guardar_tareas(cola):
    with open(COLA, "w") as f:
        json.dump(cola, f, ensure_ascii=False, indent=1)

def crear_worktree(tid):
    rama = f"ola/{tid}"
    wt_path = WT_BASE / tid
    if wt_path.exists():
        return wt_path
    subprocess.run(["git", "branch", rama], cwd=RAIZ, capture_output=True, timeout=10)
    result = subprocess.run(["git", "worktree", "add", str(wt_path), rama],
                            cwd=RAIZ, capture_output=True, text=True, timeout=30)
    if result.returncode == 0:
        return wt_path
    return None

def procesar_tarea(tarea, modelo):
    tid = tarea["id"]
    titulo = tarea.get("titulo", tid)
    prompt = tarea.get("prompt", "")
    archivos = tarea.get("archivos", [])
    
    if not prompt or not archivos:
        log(f"❌ {tid}: sin prompt o archivos")
        return False
    
    log(f"📋 {tid}: {titulo}")
    
    wt_path = crear_worktree(tid)
    if not wt_path:
        log(f"❌ {tid}: no se pudo crear worktree")
        return False
    
    archivo_path = wt_path / archivos[0]
    if not archivo_path.exists():
        log(f"❌ {tid}: archivo no existe {archivos[0]}")
        return False
    
    contenido_actual = archivo_path.read_text()
    
    # Limitar contexto a 50 líneas para no saturar al modelo
    lineas = contenido_actual.split('\n')
    if len(lineas) > 50:
        contenido_limitado = '\n'.join(lineas[:50]) + f'\n... ({len(lineas)-50} líneas más) ...'
    else:
        contenido_limitado = contenido_actual
    
    prompt_ollama = f"""Archivo ({archivos[0]}):
{contenido_limitado}

Tarea: {titulo}
{prompt[:500]}

Responde SOLO con el código completo del archivo. Sin explicaciones."""
    
    log(f"🧠 {tid}: llamando a Ollama...")
    respuesta = llamar_ollama(prompt_ollama, modelo)
    
    if not respuesta:
        log(f"❌ {tid}: Ollama no respondió")
        return False
    
    archivo_path.write_text(respuesta)
    log(f"✍️  {tid}: escrito ({len(respuesta)} chars)")
    
    subprocess.run(["git", "add", "."], cwd=wt_path, capture_output=True, timeout=10)
    subprocess.run(["git", "commit", "-m", f"fix: {titulo[:60]}"], cwd=wt_path, capture_output=True, timeout=15)
    
    log(f"✅ {tid}: completado")
    return True

def main():
    log("🚀 Ejecutor simple iniciado")
    
    modelo = verificar_ollama()
    if not modelo:
        log("❌ Ollama no disponible")
        return
    log(f"✅ Ollama: {modelo}")
    
    cola = cargar_tareas()
    pendientes = [t for t in cola if t.get("estado") == "pendiente"]
    log(f"📋 {len(pendientes)} tareas pendientes")
    
    for tarea in pendientes:
        exito = procesar_tarea(tarea, modelo)
        # Actualizar estado
        cola = cargar_tareas()
        for t in cola:
            if t.get("id") == tarea["id"]:
                t["estado"] = "hecho" if exito else "fallo"
        guardar_tareas(cola)
        time.sleep(2)
    
    log("🎉 Procesamiento terminado")

if __name__ == "__main__":
    main()
