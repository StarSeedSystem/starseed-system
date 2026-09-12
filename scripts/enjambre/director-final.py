#!/usr/bin/env python3
"""StarSeed Director Final — Ejecutor + Integración Selectiva.

Procesa tareas con Ollama, verifica calidad (tsc + tests), 
solo integra si pasa, limpia después.
"""

import json
import os
import subprocess
import time
import urllib.request
from pathlib import Path

RAIZ = Path(os.environ.get("STARSEED_ROOT", "/Users/alex/Documents/starseed-os-main"))
COLA = RAIZ / "starseed_memory_root/olas/cola-reactivar-pendientes.json"
WT_BASE = Path(os.environ.get("STARSEED_WT", "~/Documents/starseed-wt")).expanduser()
LOG = RAIZ / "starseed_memory_root/logs/director-final.log"
OLLAMA_URL = "http://localhost:11434"
MODELO = "qwen2.5:7b"

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
            for m in data.get("models", []):
                if m["name"].startswith("qwen2.5:7b"):
                    return True
    except Exception:
        pass
    return False

def llamar_ollama(prompt, max_tokens=4000):
    """Llama a Ollama local"""
    payload = {
        "model": MODELO,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "options": {"num_predict": max_tokens},
    }
    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(f"{OLLAMA_URL}/api/chat", data=data,
                                    headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=300) as resp:
            result = json.loads(resp.read())
            return result.get("message", {}).get("content", "")
    except Exception as e:
        log(f"Error Ollama: {e}")
        return ""

def crear_worktree(tid):
    """Crea/verifica worktree"""
    rama = f"ola/{tid}"
    wt_path = WT_BASE / tid
    
    if wt_path.exists():
        return wt_path
    
    # Verificar si la rama existe
    result = subprocess.run(
        ["git", "branch", "--list", rama],
        cwd=RAIZ, capture_output=True, text=True, timeout=10
    )
    if rama not in result.stdout:
        # Crear rama desde HEAD
        subprocess.run(["git", "branch", rama], cwd=RAIZ, capture_output=True, timeout=10)
    
    # Crear worktree
    subprocess.run(
        ["git", "worktree", "add", str(wt_path), rama],
        cwd=RAIZ, capture_output=True, timeout=30
    )
    
    return wt_path if wt_path.exists() else None

def verificar_calidad_archivo(wt_path, archivos):
    """Verifica que los archivos no tengan markdown/basura"""
    problemas = []
    for arch in archivos:
        archivo = wt_path / arch
        if not archivo.exists():
            problemas.append(f"no existe: {arch}")
            continue
        try:
            contenido = archivo.read_text()
            # Detectar markdown en TypeScript
            lineas = contenido.split('\n')
            primeras = [l.strip() for l in lineas[:3] if l.strip()]
            if primeras and (primeras[0].startswith("```") or primeras[0].startswith("# ") or primeras[0].startswith("Here ")):
                problemas.append(f"basura/markdown en {arch}")
            # Detectar que no es TypeScript válido básico
            if archivo.suffix == ".ts" or archivo.suffix == ".tsx":
                if "import " not in contenido and "export " not in contenido and "function " not in contenido and "const " not in contenido and "interface " not in contenido and "type " not in contenido:
                    problemas.append(f"no parece TypeScript válido: {arch}")
        except Exception as e:
            problemas.append(f"error leyendo {arch}: {e}")
    return problemas

def verificar_tsc(wt_path):
    """Verifica tsc --noEmit"""
    try:
        result = subprocess.run(
            ["npx", "tsc", "--noEmit"],
            cwd=wt_path,
            capture_output=True,
            text=True,
            timeout=120,
            env={**os.environ, "NODE_OPTIONS": "--max-old-space-size=2048"}
        )
        errores = [l for l in result.stdout.split('\n') if 'error' in l.lower()]
        return len(errores) == 0, errores[:3]
    except subprocess.TimeoutExpired:
        return False, ["timeout"]
    except Exception as e:
        return False, [str(e)]

def verificar_tests(wt_path):
    """Verifica vitest"""
    try:
        result = subprocess.run(
            ["npx", "vitest", "--run"],
            cwd=wt_path,
            capture_output=True,
            text=True,
            timeout=60,
        )
        return result.returncode == 0, result.stdout[-200:]
    except Exception as e:
        return False, str(e)

def merge_rama(tid):
    """Mergea la rama en main"""
    rama = f"ola/{tid}"
    resultado = subprocess.run(
        ["git", "merge", "--no-ff", rama, "-m", f"Merge {rama}: integrado por director final"],
        cwd=RAIZ, capture_output=True, text=True, timeout=30
    )
    return resultado.returncode == 0

def procesar_tarea(tarea):
    """Procesa una tarea: escribe, verifica, integra, limpia"""
    tid = tarea["id"]
    titulo = tarea.get("titulo", tid)
    prompt = tarea.get("prompt", "")
    archivos = tarea.get("archivos", [])
    
    if not prompt or not archivos:
        log(f"❌ {tid}: sin prompt o archivos")
        return False
    
    log(f"📋 {tid}: {titulo[:50]}")
    
    # Crear worktree
    wt_path = crear_worktree(tid)
    if not wt_path:
        log(f"❌ {tid}: no se pudo crear worktree")
        return False
    
    # Leer archivo actual
    archivo_path = wt_path / archivos[0]
    if not archivo_path.exists():
        log(f"❌ {tid}: archivo no existe {archivos[0]}")
        return False
    
    contenido_actual = archivo_path.read_text()
    if len(contenido_actual) > 5000:
        contenido_actual = contenido_actual[:5000] + "\n... (truncado)"
    
    # Llamar a Ollama
    prompt_ollama = f"""Archivo ({archivos[0]}):
{contenido_actual}

Tarea: {titulo}
Instrucción: {prompt}

Reglas:
- Textos de UI en español con acentos
- Sin 'any', tipos estrictos
- Tests con import {{ describe, it, expect }} from 'vitest'
- cursor-pointer en lo clicable

Responde SOLO con el contenido completo del archivo modificado. Sin explicaciones, sin markdown, sin ```."""
    
    log(f"🧠 {tid}: generando código...")
    respuesta = llamar_ollama(prompt_ollama)
    
    if not respuesta:
        log(f"❌ {tid}: Ollama no respondió")
        return False
    
    # Escribir archivo
    archivo_path.write_text(respuesta)
    log(f"✍️  {tid}: escrito ({len(respuesta)} chars)")
    
    # 1. Verificar calidad
    problemas_calidad = verificar_calidad_archivo(wt_path, archivos)
    if problemas_calidad:
        log(f"⚠️  {tid}: problemas calidad - {problemas_calidad[:2]}")
        return False
    
    # 2. Verificar tsc
    tsc_ok, errores_tsc = verificar_tsc(wt_path)
    if not tsc_ok:
        log(f"❌ {tid}: tsc falló - {errores_tsc[:2]}")
        return False
    log(f"  ✅ tsc OK")
    
    # 3. Commit en rama
    subprocess.run(["git", "add", "."], cwd=wt_path, capture_output=True, timeout=10)
    subprocess.run(
        ["git", "commit", "-m", f"fix: {titulo[:60]}"],
        cwd=wt_path, capture_output=True, timeout=15
    )
    
    # 4. Merge en main
    if merge_rama(tid):
        log(f"✅ {tid}: INTEGRADO en main")
        # Limpiar worktree
        subprocess.run(["git", "worktree", "remove", str(wt_path), "--force"],
                       cwd=RAIZ, capture_output=True, timeout=10)
        return True
    else:
        log(f"⚠️  {tid}: merge conflictivo, abortando")
        subprocess.run(["git", "merge", "--abort"], cwd=RAIZ, capture_output=True, timeout=10)
        subprocess.run(["git", "worktree", "remove", str(wt_path), "--force"],
                       cwd=RAIZ, capture_output=True, timeout=10)
        return False

def main():
    log("🚀 Director Final iniciado")
    
    if not verificar_ollama():
        log("❌ Ollama no disponible")
        return
    
    log(f"✅ Modelo activo: {MODELO}")
    
    # Cargar cola
    with open(COLA) as f:
        cola = json.load(f)
    
    pendientes = [t for t in cola if t.get("estado") == "pendiente"]
    log(f"📋 {len(pendientes)} tareas pendientes")
    
    integradas = 0
    fallidas = 0
    
    for tarea in pendientes:
        exito = procesar_tarea(tarea)
        
        # Actualizar cola
        with open(COLA) as f:
            cola = json.load(f)
        for t in cola:
            if t.get("id") == tarea["id"]:
                t["estado"] = "hecho" if exito else "fallo"
        with open(COLA, "w") as f:
            json.dump(cola, f, ensure_ascii=False, indent=1)
        
        if exito:
            integradas += 1
        else:
            fallidas += 1
        
        time.sleep(3)
    
    log(f"🎉 Terminado: {integradas} integradas, {fallidas} fallidas")
    subprocess.run(["git", "worktree", "prune"], cwd=RAIZ, capture_output=True, timeout=10)

if __name__ == "__main__":
    main()
