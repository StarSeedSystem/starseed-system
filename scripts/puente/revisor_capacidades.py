#!/usr/bin/env python3
"""Revisor de capacidades: compara lo disponible con lo usado en 24h y reporta al Chat Director.

Corre cada día (y a demanda desde Genesis). Publica informe corto de lo infrautilizado
con acción concreta (activar, redistribuir, pedir a Alex con enlace) y abre tareas
para lo que el enjambre pueda arreglar.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path
from typing import Any

RAIZ = Path(os.environ.get("STARSEED_ROOT") or Path.home() / "Documents" / "starseed-os-main")
OLAS = RAIZ / "starseed_memory_root" / "olas"
MANDO = RAIZ / "starseed_memory_root" / "mando"

ESTADOS_MEDIO = ("listo", "usable", "requiere_alex", "no_disponible")

SKILLS_DISPONIBLES = [
    "agent-reach", "awesome-design-md", "claude-video-studio", "coop-qa",
    "coop-sync-testing", "design-md", "design-taste-frontend", "enhance-prompt",
    "frontend-slides", "grafo-codigo", "inbox-zero", "react-components",
    "remotion", "shadcn-ui", "spacedrive-cli", "stitch-loop"
]

MCP_DISPONIBLES = [
    "github", "filesystem", "sqlite", "postgres", "brave-search", "notion", "google-drive"
]

MODELOS_AGY_POR_PAPEL = {
    "director_presidente": ["gemini-4-hydrogen-high", "claude-opus-5-5-high"],
    "directores_produccion_pruebas_capacidad": ["gemini-4-neon-high"],
    "escritores_enjambre": ["gemini-3.8-flash-medium"],
    "revisores": ["claude-sonnet-5-5-medium"],
    "tareas_mecanicas": ["gemini-3.8-flash-low"],
}


def _leer_json(ruta: Path, default: Any = None) -> Any:
    try:
        with ruta.open(encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return default


def _escribir_json(ruta: Path, data: Any) -> None:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    tmp = ruta.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.replace(ruta)


def _ahora() -> float:
    return time.time()


# ── Clasificación de infrautilizados ────────────────────────────────────────

def clasificar_infrautilizados_medios(medios: dict, uso: dict) -> list[dict]:
    """Medios listos/usables que no se usaron o se usaron poco en 24h."""
    usados = uso.get("medios_usados", {})
    resultado = []
    for m in medios.get("medios", []):
        mid = m["id"]
        estado = m["estado"]
        usado = usados.get(mid, {})
        tareas = usado.get("tareas", 0)
        
        if estado == "listo" and tareas == 0:
            if mid in ("cloudroom", "oracle", "ollama-a1", "abliteration"):
                resultado.append({"id": mid, "nombre": m["nombre"], "accion": "activar",
                                  "detalle": f"{m['nombre']} está listo pero no se usó en 24h",
                                  "siguiente": m.get("siguiente_paso") or "usar en próxima ola"})
            elif mid in ("nube-gh",):
                resultado.append({"id": mid, "nombre": m["nombre"], "accion": "redistribuir",
                                  "detalle": f"{m['nombre']} listo con 0 tareas · repartir cola",
                                  "siguiente": m.get("siguiente_paso") or "lanzar jobs"})
        elif estado == "usable" and tareas == 0:
            if mid in ("claude", "opencode-zen", "codex"):
                resultado.append({"id": mid, "nombre": m["nombre"], "accion": "activar" if mid == "opencode-zen" else "redistribuir",
                                  "detalle": f"{m['nombre']} usable pero sin tareas",
                                  "siguiente": m.get("siguiente_paso") or "configurar y usar"})
        elif estado == "requiere_alex":
            resultado.append({"id": mid, "nombre": m["nombre"], "accion": "pedir_alex",
                              "detalle": f"{m['nombre']} requiere acción de Alex: {m.get('detalle', '')}",
                              "siguiente": m.get("siguiente_paso") or "enlace a docs/consola"})
    return resultado


def clasificar_infrautilizados_proveedores(salud: dict, uso: dict) -> list[dict]:
    """Proveedores vivos poco usados o agotados sin relevo."""
    usados = uso.get("proveedores_usados", {})
    resultado = []
    for p in salud.get("proveedores", []):
        nombre = p["proveedor"]
        agotado = p["agotado"]
        usado = usados.get(nombre, {})
        peticiones = usado.get("peticiones", 0)
        
        if agotado:
            # Agotado: verificar si se intentó usar en 24h
            if peticiones == 0:
                alt = p.get("alternativa") or "nim"
                resultado.append({"proveedor": nombre, "accion": "redistribuir",
                                  "detalle": f"{nombre} agotado ({p.get('motivo')}) y no se usó · relevo a {alt}",
                                  "siguiente": f"relevo automático a {alt}"})
        else:
            # Vivo: si poco usado, activar más
            if peticiones > 0 and peticiones < 20:
                resultado.append({"proveedor": nombre, "accion": "activar",
                                  "detalle": f"{nombre} vivo pero solo {peticiones} peticiones en 24h",
                                  "siguiente": "aumentar cuota en enrutador"})
            elif peticiones == 0 and nombre in ("llm7", "aihubmix", "tokenrouter", "nim", "groq"):
                resultado.append({"proveedor": nombre, "accion": "activar",
                                  "detalle": f"{nombre} disponible y no se usó en 24h",
                                  "siguiente": "incluir en rotación de escritores/revisores"})
    return resultado


def clasificar_infrautilizados_agy(medidor: dict, uso: dict, ahora: float) -> list[dict]:
    """Modelos Antigravity disponibles pero no usados según su papel."""
    usados = uso.get("modelos_agy_usados", {})
    resultado = []
    for papel, modelos in MODELOS_AGY_POR_PAPEL.items():
        for modelo in modelos:
            if modelo not in medidor:
                continue
            m = medidor[modelo]
            pausado = float(m.get("pausado_hasta") or 0) > ahora
            if pausado:
                continue
            usado = usados.get(modelo, {})
            if usado.get("llamadas", 0) == 0:
                resultado.append({"modelo": modelo, "papel": papel, "accion": "activar",
                                  "detalle": f"{modelo} ({papel}) con cuota y sin uso en 24h",
                                  "siguiente": f"asignar tarea de {papel}"})
    return resultado


def clasificar_infrautilizados_herramientas(skills_disponibles: list[str], uso: dict) -> list[dict]:
    """Skills del OS no usadas en 24h."""
    usadas = set(uso.get("skills_usadas", {}).keys())
    resultado = []
    for skill in skills_disponibles:
        if skill not in usadas:
            resultado.append({"herramienta": skill, "accion": "activar",
                              "detalle": f"Skill {skill} disponible pero no invocada en 24h",
                              "siguiente": "usar en tarea adecuada (diseño, código, testing, etc.)"})
    return resultado


def clasificar_infrautilizados_mcp(mcp_disponibles: list[str], uso: dict) -> list[dict]:
    """Servidores MCP no usados en 24h."""
    usados = set(uso.get("mcp_conexiones_usadas", []))
    resultado = []
    for servidor in mcp_disponibles:
        if servidor not in usados:
            resultado.append({"servidor": servidor, "accion": "activar",
                              "detalle": f"MCP {servidor} configurado pero no usado en 24h",
                              "siguiente": "conectar en tarea que necesite esa capacidad"})
    return resultado


# ── Generación de informe y tareas ──────────────────────────────────────────

def generar_informe(medios: dict, salud: dict, uso: dict, medidor_agy: dict,
                    skills: list[str], mcp: list[str], ahora: float | None = None) -> str:
    ahora = ahora or _ahora()
    
    infra_medios = clasificar_infrautilizados_medios(medios, uso)
    infra_provs = clasificar_infrautilizados_proveedores(salud, uso)
    infra_agy = clasificar_infrautilizados_agy(medidor_agy, uso, ahora)
    infra_skills = clasificar_infrautilizados_herramientas(skills, uso)
    infra_mcp = clasificar_infrautilizados_mcp(mcp, uso)
    
    lineas = []
    lineas.append("📊 INFORME DE CAPACIDADES INFRAUTILIZADAS — " + time.strftime("%Y-%m-%d %H:%M"))
    lineas.append("")
    
    if infra_medios:
        lineas.append("## Medios de cómputo")
        for r in infra_medios:
            lineas.append(f"- **{r['nombre']}** ({r['accion']}): {r['detalle']} → {r['siguiente']}")
        lineas.append("")
    
    if infra_provs:
        lineas.append("## Proveedores de IA")
        for r in infra_provs:
            lineas.append(f"- **{r['proveedor']}** ({r['accion']}): {r['detalle']} → {r['siguiente']}")
        lineas.append("")
    
    if infra_agy:
        lineas.append("## Modelos Antigravity (agy)")
        for r in infra_agy:
            lineas.append(f"- **{r['modelo']}** ({r['papel']}, {r['accion']}): {r['detalle']} → {r['siguiente']}")
        lineas.append("")
    
    if infra_skills:
        lineas.append("## Skills del OS (.agent/skills)")
        for r in infra_skills[:8]:  # limitar a 8 para no saturar
            lineas.append(f"- **{r['herramienta']}** ({r['accion']}): {r['detalle']} → {r['siguiente']}")
        if len(infra_skills) > 8:
            lineas.append(f"  ... y {len(infra_skills) - 8} más")
        lineas.append("")
    
    if infra_mcp:
        lineas.append("## Conexiones MCP")
        for r in infra_mcp:
            lineas.append(f"- **{r['servidor']}** ({r['accion']}): {r['detalle']} → {r['siguiente']}")
        lineas.append("")
    
    total = len(infra_medios) + len(infra_provs) + len(infra_agy) + len(infra_skills) + len(infra_mcp)
    lineas.append(f"---")
    lineas.append(f"Total ítems infrautilizados: **{total}**")
    lineas.append("Acciones: **activar** = poner en uso ya | **redistribuir** = mover carga a otro medio/proveedor | **pedir_alex** = necesita intervención humana")
    
    return "\n".join(lineas)


def abrir_tareas_enjambre(medios: dict, salud: dict, uso: dict, medidor_agy: dict,
                          skills: list[str], mcp: list[str]) -> list[dict]:
    """Genera tareas para el enjambre (cosas que se pueden arreglar por código)."""
    ahora = _ahora()
    infra_medios = clasificar_infrautilizados_medios(medios, uso)
    infra_provs = clasificar_infrautilizados_proveedores(salud, uso)
    infra_skills = clasificar_infrautilizados_herramientas(skills, uso)
    infra_mcp = clasificar_infrautilizados_mcp(mcp, uso)
    
    tareas = []
    
    # Tareas para medios configurables por el enjambre
    for r in infra_medios:
        if r["accion"] == "activar" and r["id"] in ("opencode-zen", "cloudroom"):
            tareas.append({
                "id": f"CAP-{r['id']}-config",
                "ola": "CAP1119",
                "titulo": f"Configurar y activar {r['nombre']}",
                "archivos": [f"scripts/puente/{r['id']}_config.py"],
                "depende": [],
                "prompt": f"{r['siguiente']}. Crear script de configuración y prueba de {r['nombre']}."
            })
    
    # Tareas para proveedores: añadir a rotación
    for r in infra_provs:
        if r["accion"] == "activar" and r["proveedor"] in ("llm7", "aihubmix", "tokenrouter"):
            tareas.append({
                "id": f"CAP-prov-{r['proveedor']}-rotacion",
                "ola": "CAP1119",
                "titulo": f"Añadir {r['proveedor']} a rotación de escritores/revisores",
                "archivos": ["src/ai/astraura/free-catalog.ts", "scripts/puente/medios_disponibles.py"],
                "depende": [],
                "prompt": f"Incluir {r['proveedor']} en el catálogo gratuito y en la rotación del enjambre. {r['detalle']}"
            })
    
    # Tareas para skills: documentar uso
    for r in infra_skills[:5]:  # máximo 5 skills
        if r["accion"] == "activar":
            tareas.append({
                "id": f"CAP-skill-{r['herramienta']}-uso",
                "ola": "CAP1119",
                "titulo": f"Integrar skill {r['herramienta']} en flujo de trabajo",
                "archivos": [f".agent/skills/{r['herramienta']}/README.md"],
                "depende": [],
                "prompt": f"Documentar y crear ejemplo de uso de la skill {r['herramienta']} para que el enjambre la use."
            })
    
    # Tareas para MCP: conectar
    for r in infra_mcp[:3]:  # máximo 3 MCP
        if r["accion"] == "activar":
            tareas.append({
                "id": f"CAP-mcp-{r['servidor']}-conectar",
                "ola": "CAP1119",
                "titulo": f"Conectar servidor MCP {r['servidor']}",
                "archivos": ["scripts/puente/mcp_director.py", f".agent/skills/mcp-{r['servidor']}/"],
                "depende": [],
                "prompt": f"Configurar y probar conexión MCP {r['servidor']} para uso en tareas."
            })
    
    # Guardar tareas en cola del enjambre
    if tareas:
        cola_path = OLAS / "cola-capacidades.json"
        _escribir_json(cola_path, {"ola": "CAP1119", "tareas": tareas})
    
    return tareas


# ── Carga de datos ──────────────────────────────────────────────────────────

def cargar_datos() -> tuple[dict, dict, dict, dict]:
    """Carga medios, salud, uso 24h y medidor agy desde archivos/entorno."""
    # Medios
    medios_path = Path(os.environ.get("STARSEED_MEDIOS_JSON") or OLAS / "medios.json")
    medios = _leer_json(medios_path, {"medios": []})
    
    # Salud proveedores
    salud_path = Path(os.environ.get("STARSEED_SALUD_PROVEEDORES_JSON") or Path.home() / ".starseed" / "salud-proveedores.json")
    salud = _leer_json(salud_path, {"proveedores": []})
    
    # Uso 24h (se genera desde route logs, chat, progreso)
    uso_path = Path(os.environ.get("STARSEED_USO_24H_JSON") or MANDO / "uso-24h.json")
    uso = _leer_json(uso_path, {"medios_usados": {}, "proveedores_usados": {}, "modelos_agy_usados": {}, "herramientas_usadas": {}, "mcp_conexiones_usadas": [], "skills_usadas": {}})
    
    # Medidor agy
    agy_path = Path(os.environ.get("STARSEED_AGY_USO_JSON") or Path.home() / ".starseed" / "antigravity-uso.json")
    medidor_agy = _leer_json(agy_path, {})
    
    return medios, salud, uso, medidor_agy


def publicar_chat_director(informe: str) -> bool:
    """Publica el informe en el Chat Director vía starseed-puente decir."""
    try:
        import subprocess
        resultado = subprocess.run(
            ["starseed-puente", "decir", informe, "--de", "revisor-capacidades", "--tipo", "hecho", "--tarea", "CAP1119"],
            capture_output=True, text=True, timeout=30
        )
        return resultado.returncode == 0
    except Exception:
        return False


# ── Main ────────────────────────────────────────────────────────────────────

def main(args: list[str] | None = None) -> int:
    args = args or sys.argv[1:]
    salida_json = "--json" in args
    
    medios, salud, uso, medidor_agy = cargar_datos()
    ahora = _ahora()
    
    informe = generar_informe(medios, salud, uso, medidor_agy, SKILLS_DISPONIBLES, MCP_DISPONIBLES, ahora)
    tareas = abrir_tareas_enjambre(medios, salud, uso, medidor_agy, SKILLS_DISPONIBLES, MCP_DISPONIBLES)
    
    # Publicar en Chat Director
    publicado = publicar_chat_director(informe)
    
    resultado = {
        "informe": informe,
        "tareas_creadas": len(tareas),
        "tareas": tareas,
        "publicado_chat_director": publicado,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S")
    }
    
    if salida_json:
        print(json.dumps(resultado, ensure_ascii=False, indent=2))
    else:
        print(informe)
        print(f"\n--- Tareas creadas: {len(tareas)} ---")
        for t in tareas:
            print(f"  {t['id']}: {t['titulo']}")
    
    return 0


if __name__ == "__main__":
    sys.exit(main())