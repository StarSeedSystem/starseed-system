#!/usr/bin/env python3
"""Ejecutor directo con API de TokenRouter — sin OpenCode.

Llama directamente a la API de TokenRouter para generar código.
"""

import json
import os
import subprocess
import time
import urllib.request
import urllib.error
from pathlib import Path

RAIZ = Path(os.environ.get("STARSEED_ROOT", "/Users/alex/Documents/starseed-os-main"))
COLA = RAIZ / "starseed_memory_root/olas/cola-reactivar-pendientes.json"
WT_BASE = Path(os.environ.get("STARSEED_WT", "~/Documents/starseed-wt")).expanduser()
LOG = RAIZ / "starseed_memory_root/logs/ejecutor-directo.log"

def cargar_env():
    """Carga variables desde archivos .env"""
    env_paths = [
        os.path.expanduser("~/.hermes/.env"),
        os.path.expanduser("~/.starseed/env"),
    ]
    for path in env_paths:
        if not os.path.exists(path):
            continue
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key and value and key.replace("_", "").isalnum():
                    os.environ[key] = value

cargar_env()
TOKENROUTER_KEY = os.environ.get("TOKENROUTER_API_KEY", "")
TOKENROUTER_URL = "https://api.tokenrouter.com/v1/chat/completions"

def log(msg):
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    with open(LOG, "a") as f:
        f.write(line + "\n")

def cargar_tareas():
    if not COLA.exists():
        return []
    with open(COLA) as f:
        cola = json.load(f)
    return [t for t in cola if t.get("estado") == "pendiente"]

def llamar_llm(messages, max_tokens=2000):
    """Llama a TokenRouter API"""
    if not TOKENROUTER_KEY:
        return None, "TOKENROUTER_API_KEY no configurada"
    
    payload = {
        "model": "z-ai/glm-5.3-free",
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.3,
    }
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {TOKENROUTER_KEY}",
    }
    
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(TOKENROUTER_URL, data=data, headers=headers, method="POST")
    
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            return result, None
    except Exception as e:
        return None, str(e)

def escribir_archivo(ruta, contenido):
    """Escribe contenido en un archivo"""
    try:
        ruta.parent.mkdir(parents=True, exist_ok=True)
        with open(ruta, "w") as f:
            f.write(contenido)
        return True
    except Exception as e:
        log(f"Error escribiendo {ruta}: {e}")
        return False

def ejecutar_tarea(tarea):
    """Ejecuta una tarea usando LLM directo"""
    tid = tarea["id"]
    archivos = tarea.get("archivos", [])
    prompt = tarea.get("prompt", "")
    titulo = tarea.get("titulo", tid)
    
    if not archivos or not prompt:
        log(f"❌ {tid}: sin archivos o prompt")
        return False
    
    wt_path = WT_BASE / tid
    rama = f"ola/{tid}"
    
    try:
        # Crear worktree si no existe
        if not wt_path.exists():
            subprocess.run(["git", "branch", rama], cwd=RAIZ, capture_output=True, timeout=10)
            subprocess.run(
                ["git", "worktree", "add", str(wt_path), rama],
                cwd=RAIZ, capture_output=True, timeout=15
            )
            log(f"  Worktree creado: {wt_path}")
        
        # Leer archivos actuales
        contexto_archivos = ""
        for archivo in archivos:
            archivo_path = wt_path / archivo
            if archivo_path.exists():
                try:
                    contenido = archivo_path.read_text()
                    contexto_archivos += f"\n--- {archivo} ---\n{contenido}\n"
                except:
                    contexto_archivos += f"\n--- {archivo} ---\n[no se pudo leer]\n"
        
        # Prompt para el LLM
        messages = [
            {
                "role": "system",
                "content": "Eres un desarrollador TypeScript/React experto. Editas archivos de código. Respondes SOLO con el contenido completo del archivo modificado, sin explicaciones."
            },
            {
                "role": "user",
                "content": f"Tarea: {titulo}\n\nArchivos actuales:\n{contexto_archivos}\n\nInstrucciones:\n{prompt}\n\nResponde SOLO con el contenido completo del archivo modificado."
            }
        ]
        
        log(f"✍️  {tid}: llamando a TokenRouter...")
        result, error = llamar_llm(messages)
        
        if error:
            log(f"❌ {tid}: error LLM: {error}")
            return False
        
        if not result or "choices" not in result:
            log(f"❌ {tid}: respuesta inválida")
            return False
        
        contenido = result["choices"][0]["message"]["content"]
        
        # Escribir en el primer archivo
        primer_archivo = wt_path / archivos[0]
        escribir_archivo(primer_archivo, contenido)
        
        # Commit
        subprocess.run(["git", "add", "."], cwd=wt_path, capture_output=True, timeout=10)
        subprocess.run(
            ["git", "commit", "-m", f"fix: {titulo[:60]}"],
            cwd=wt_path, capture_output=True, timeout=15
        )
        
        log(f"✅ {tid}: completado y commiteado")
        return True
        
    except Exception as e:
        log(f"❌ {tid}: excepción {e}")
        return False

def main():
    log("🚀 Ejecutor directo (API) iniciado")
    
    if not TOKENROUTER_KEY:
        log("❌ TOKENROUTER_API_KEY no configurada")
        return
    
    while True:
        tareas = cargar_tareas()
        if not tareas:
            log("✅ No hay tareas pendientes")
            break
        
        log(f"📋 {len(tareas)} tareas pendientes")
        
        for tarea in tareas[:2]:
            ejecutar_tarea(tarea)
            time.sleep(3)
        
        time.sleep(5)

if __name__ == "__main__":
    main()
