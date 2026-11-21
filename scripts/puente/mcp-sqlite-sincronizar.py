#!/usr/bin/env python3
"""Script de sincronización para skill mcp-sqlite.
Se ejecuta como parte del flujo CAP1119: Conectar servidor MCP sqlite.
"""

from pathlib import Path

SINCRONIZAR_A = Path(__file__).resolve().parent / ".." / ".." / "mcp-sqlite-sincronizado.py"

def registrar_skill():
    """Genera el archivo de registro para el orquestador."""
    contenido = '''#!/usr/bin/env python3
"""Registro de skill mcp-sqlite para el enjambre."""

SKILLS = {
    "mcp-sqlite": {
        "ruta": ".agent/skills/mcp-sqlite",
        "servidor": "bin/mcp-sqlite-server.js",
        "puerto": 2083,
        "descripcion": "Servidor MCP para bases de datos SQLite",
        "herramientas": [
            "sqlite_consultar",
            "sqlite_taberas", 
            "sqlite_esquema",
            "sqlite_contar"
        ]
    }
}

def get_skills():
    return SKILLS

if __name__ == "__main__":
    import json
    print(json.dumps(SKILLS, indent=2))
'''
    SINCRONIZAR_A.write_text(contenido)
    print(f"Skill registrado en {SINCRONIZAR_A}")

if __name__ == "__main__":
    registrar_skill()