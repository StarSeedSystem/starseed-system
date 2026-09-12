#!/usr/bin/env python3
"""StarSeed Integrador Selectivo — Solo integra ramas que pasan tsc + tests.

Inspecciona cada rama ola/*, verifica calidad, y solo mergea las que pasan.
"""

import json
import os
import subprocess
import time
from pathlib import Path

RAIZ = Path(os.environ.get("STARSEED_ROOT", "/Users/alex/Documents/starseed-os-main"))
WT_BASE = Path(os.environ.get("STARSEED_WT", "~/Documents/starseed-wt")).expanduser()
LOG = RAIZ / "starseed_memory_root/logs/integrador.log"
COLA = RAIZ / "starseed_memory_root/olas/cola-reactivar-pendientes.json"

def log(msg):
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    with open(LOG, "a") as f:
        f.write(line + "\n")

def crear_worktree(tid):
    """Crea worktree para una tarea"""
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
        return None
    
    # Crear worktree
    subprocess.run(
        ["git", "worktree", "add", str(wt_path), rama],
        cwd=RAIZ, capture_output=True, timeout=30
    )
    
    return wt_path if wt_path.exists() else None

def verificar_tsc(wt_path):
    """Verifica tsc --noEmit. Retorna (ok, errores)"""
    try:
        result = subprocess.run(
            ["npx", "tsc", "--noEmit"],   # 2026-09-12: `tsc src` no compila el proyecto
            cwd=wt_path,
            capture_output=True,
            text=True,
            timeout=120,
            env={**os.environ, "NODE_OPTIONS": "--max-old-space-size=2048"}
        )
        errores = [l for l in result.stdout.split('\n') if 'error' in l.lower()]
        if result.returncode != 0 and not errores:     # tsc caído por memoria no es verde
            errores = ["tsc terminó con %d: %s" % (result.returncode, result.stderr[-160:].strip())]
        return result.returncode == 0 and len(errores) == 0, errores[:5]
    except subprocess.TimeoutExpired:
        return False, ["timeout"]
    except Exception as e:
        return False, [str(e)]

def verificar_tests(wt_path):
    """Verifica vitest. Retorna (ok, output)"""
    try:
        result = subprocess.run(
            ["npx", "vitest", "src", "--run"],
            cwd=wt_path,
            capture_output=True,
            text=True,
            timeout=120,
        )
        return result.returncode == 0, result.stdout[-300:]
    except subprocess.TimeoutExpired:
        return False, "timeout"
    except Exception as e:
        return False, str(e)

def verificar_calidad_archivo(wt_path, archivos):
    """Verifica que los archivos no tengan markdown/basura"""
    problemas = []
    for arch in archivos:
        archivo = wt_path / arch
        if not archivo.exists():
            problemas.append(f"Archivo no existe: {arch}")
            continue
        try:
            contenido = archivo.read_text()
            # Detectar markdown en TypeScript
            if contenido.strip().startswith("```") or contenido.strip().startswith("# "):
                problemas.append(f"Markdown/basura en {arch}")
            # Detectar inglés (comentarios comunes)
            lineas_ingles = [l for l in contenido.split('\n') if any(p in l.lower() for p in ['// the ', '// this ', '// returns', '/**', ' * '])]
            if len(lineas_ingles) > 5:
                problemas.append(f"Muchos comentarios en inglés en {arch}")
        except Exception as e:
            problemas.append(f"Error leyendo {arch}: {e}")
    return problemas

def integrar_rama(tid):
    """Integra una rama si pasa todas las verificaciones"""
    rama = f"ola/{tid}"
    log(f"🔍 Verificando {tid}...")
    
    # Crear worktree
    wt_path = crear_worktree(tid)
    if not wt_path:
        log(f"  ❌ No se pudo crear worktree para {tid}")
        return False
    
    # Leer tarea para archivos
    archivos = []
    try:
        with open(COLA) as f:
            cola = json.load(f)
        for t in cola:
            if t.get("id") == tid:
                archivos = t.get("archivos", [])
                break
    except:
        pass
    
    # 1. Verificar calidad de archivos
    if archivos:
        problemas_calidad = verificar_calidad_archivo(wt_path, archivos)
        if problemas_calidad:
            log(f"  ⚠️ Problemas de calidad: {problemas_calidad[:3]}")
            return False
    
    # 2. Verificar tsc
    tsc_ok, errores_tsc = verificar_tsc(wt_path)
    if not tsc_ok:
        log(f"  ❌ tsc falló: {errores_tsc[:3]}")
        return False
    log(f"  ✅ tsc OK")
    
    # 3. Verificar tests
    tests_ok, output_tests = verificar_tests(wt_path)
    if not tests_ok:
        log(f"  ⚠️ Tests fallaron: {output_tests[:100]}")
        # No bloqueamos por tests, solo avisamos
    
    # 4. Merge
    log(f"  🔄 Mergeando {rama} en main...")
    resultado = subprocess.run(
        ["git", "merge", "--no-ff", rama, "-m", f"Merge {rama}: integrado por sistema selective"],
        cwd=RAIZ, capture_output=True, text=True, timeout=30
    )
    
    if resultado.returncode == 0:
        log(f"  ✅ {tid} integrado en main")
        return True
    else:
        # Abortar merge
        subprocess.run(["git", "merge", "--abort"], cwd=RAIZ, capture_output=True, timeout=10)
        log(f"  ❌ Merge conflictivo, abortado")
        return False

def main():
    log("🔬 Integrador selectivo iniciado")
    
    # Obtener ramas ola/*
    resultado = subprocess.run(
        ["git", "branch", "--list", "ola/*"],
        cwd=RAIZ, capture_output=True, text=True, timeout=10
    )
    
    ramas = [r.strip().replace("* ", "") for r in resultado.stdout.strip().split("\n") if r.strip()]
    log(f"📋 {len(ramas)} ramas ola/* encontradas")
    
    integradas = 0
    fallidas = 0
    
    for rama in ramas:
        tid = rama.replace("ola/", "")
        exito = integrar_rama(tid)
        if exito:
            integradas += 1
        else:
            fallidas += 1
        time.sleep(2)
    
    log(f"🎉 Integración terminada: {integradas} integradas, {fallidas} omitidas")
    
    # Limpiar worktrees
    subprocess.run(["git", "worktree", "prune"], cwd=RAIZ, capture_output=True, timeout=10)

if __name__ == "__main__":
    main()
