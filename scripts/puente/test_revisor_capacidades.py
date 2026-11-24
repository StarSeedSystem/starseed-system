#!/usr/bin/env python3
"""Pruebas para revisor_capacidades.py: compara lo disponible con lo usado en 24h."""

import json
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import revisor_capacidades as rc


def _ejemplo_medios_disponibles() -> dict:
    return {
        "generado": "2026-11-20T10:00:00",
        "medios": [
            {"id": "mac", "nombre": "Esta Mac", "estado": "listo", "capacidad": "2 agentes · máx 3 (8.0 GB)", "detalle": "gobernador ok · RAM libre 1200 MB", "siguiente_paso": ""},
            {"id": "claude", "nombre": "Contenedor de Claude (Cowork)", "estado": "usable", "capacidad": "2 vCPU · 8 GB · 2 agentes", "detalle": "visto hace 120 min", "siguiente_paso": "pedir a Claude que arranque orquestador"},
            {"id": "nube-gh", "nombre": "GitHub Actions", "estado": "listo", "capacidad": "3 agentes/job · 4 vCPU · 16 GB", "detalle": "6 claves · 0 ejecuciones", "siguiente_paso": "python3 scripts/puente/nube-gh.py lanzar --tope 6"},
            {"id": "cloudroom", "nombre": "Cloudroom", "estado": "listo", "capacidad": "100 agentes/30 días gratis", "detalle": "0 hilos abiertos", "siguiente_paso": ""},
            {"id": "oracle", "nombre": "Oracle Always Free", "estado": "listo", "capacidad": "A1 2 OCPU · 12 GB", "detalle": "A1 RUNNING · nodo vivo", "siguiente_paso": ""},
            {"id": "agy", "nombre": "Antigravity CLI (agy)", "estado": "listo", "capacidad": "gemini-3.8-flash-medium · gemini-4-neon-high", "detalle": "sesión activa · 2 modelos con cuota", "siguiente_paso": ""},
            {"id": "ollama-a1", "nombre": "Ollama del A1 (qwen 4B)", "estado": "listo", "capacidad": "modelo privado 4B", "detalle": "A1 RUNNING · nodo vivo", "siguiente_paso": ""},
            {"id": "codex", "nombre": "Codex (ChatGPT)", "estado": "listo", "capacidad": "suscripción ChatGPT", "detalle": "sin marca de agotamiento", "siguiente_paso": ""},
            {"id": "opencode-zen", "nombre": "OpenCode Zen", "estado": "usable", "capacidad": "glm-5.3-flash · deepseek-v4.1-flash", "detalle": "opencode instalado sin modelos Zen", "siguiente_paso": "configurar proveedor zen"},
            {"id": "explabs", "nombre": "Experiential Labs", "estado": "listo", "capacidad": "Jev/Clef Flash gratis", "detalle": "decisiones gratis: Jev, Clef Flash", "siguiente_paso": ""},
            {"id": "hf", "nombre": "Hugging Face Spaces", "estado": "requiere_alex", "capacidad": "Docker gratis exige PRO", "detalle": "plan gratuito", "siguiente_paso": "solo con PRO"},
            {"id": "gcloud", "nombre": "Google Cloud", "estado": "usable", "capacidad": "Cloud Run 180k vCPU·s/mes", "detalle": "cuenta alex · proyecto starseed · 2 servicios", "siguiente_paso": "job Cloud Run"},
            {"id": "colab", "nombre": "Google Colab / Kaggle", "estado": "requiere_alex", "capacidad": "Colab 2 vCPU · 12 GB", "detalle": "sin API", "siguiente_paso": "cuaderno lanzador"},
            {"id": "abliteration", "nombre": "abliteration.ai", "estado": "listo", "capacidad": "10k peticiones/día", "detalle": "saldo 5.00 USD · gastado 0.10/0.50 USD", "siguiente_paso": ""},
        ]
    }


def _ejemplo_salud_proveedores() -> dict:
    return {
        "proveedores": [
            {"proveedor": "groq", "agotado": False, "renueva_en_min": None, "motivo": None, "alternativa": None},
            {"proveedor": "nim", "agotado": False, "renueva_en_min": None, "motivo": None, "alternativa": None},
            {"proveedor": "xkiro", "agotado": True, "renueva_en_min": 45, "motivo": "429", "alternativa": "nim"},
            {"proveedor": "openrouter", "agotado": True, "renueva_en_min": 120, "motivo": "cuota", "alternativa": "nim"},
            {"proveedor": "freellmapi", "agotado": True, "renueva_en_min": 300, "motivo": "402", "alternativa": "nim"},
            {"proveedor": "aihubmix", "agotado": False, "renueva_en_min": None, "motivo": None, "alternativa": None},
            {"proveedor": "llm7", "agotado": False, "renueva_en_min": None, "motivo": None, "alternativa": None},
            {"proveedor": "tokenrouter", "agotado": False, "renueva_en_min": None, "motivo": None, "alternativa": None},
            {"proveedor": "apinex", "agotado": True, "renueva_en_min": 0, "motivo": "402", "alternativa": "nim"},
        ]
    }


def _ejemplo_uso_24h() -> dict:
    """Lo que se usó realmente en las últimas 24h (simulado)."""
    return {
        "medios_usados": {
            "mac": {"tareas": 12, "agentes_max": 2, "horas_activas": 8},
            "nube-gh": {"tareas": 3, "agentes_max": 3, "horas_activas": 2},
            "oracle": {"tareas": 1, "agentes_max": 1, "horas_activas": 1},
        },
        "proveedores_usados": {
            "nim": {"peticiones": 150, "modelos": ["kimi-k3", "deepseek-v4-flash"]},
            "groq": {"peticiones": 20, "modelos": ["llama-3.3-70b"]},
            "aihubmix": {"peticiones": 5, "modelos": ["coding-glm-5.3-free"]},
        },
        "modelos_agy_usados": {
            "gemini-3.8-flash-medium": {"llamadas": 8, "tiempo_seg": 120},
            "gemini-4-neon-high": {"llamadas": 2, "tiempo_seg": 45},
        },
        "herramientas_usadas": {
            "opencode": {"invocaciones": 20},
            "starseed-sub": {"invocaciones": 5},
            "starseed-fuentes": {"invocaciones": 3},
        },
        "mcp_conexiones_usadas": ["github", "filesystem"],
        "skills_usadas": {
            "react-components": {"invocaciones": 5},
            "shadcn-ui": {"invocaciones": 3},
            "design-md": {"invocaciones": 2},
        },
    }


def test_clasificar_infrautilizados_medios():
    medios = _ejemplo_medios_disponibles()
    uso = _ejemplo_uso_24h()
    resultado = rc.clasificar_infrautilizados_medios(medios, uso)
    # cloudroom está listo pero 0 hilos -> infrautilizado
    assert any(r["id"] == "cloudroom" and r["accion"] == "activar" for r in resultado)
    # claude usable pero no usado -> redistribuir
    assert any(r["id"] == "claude" and r["accion"] == "redistribuir" for r in resultado)
    # opencode-zen usable pero no configurado -> activar
    assert any(r["id"] == "opencode-zen" and r["accion"] == "activar" for r in resultado)
    # hf/gcloud/colab requiere_alex -> pedir a Alex
    assert any(r["id"] == "hf" and r["accion"] == "pedir_alex" for r in resultado)
    assert any(r["id"] == "colab" and r["accion"] == "pedir_alex" for r in resultado)
    print("✓ test_clasificar_infrautilizados_medios")


def test_clasificar_infrautilizados_proveedores():
    salud = _ejemplo_salud_proveedores()
    uso = _ejemplo_uso_24h()
    resultado = rc.clasificar_infrautilizados_proveedores(salud, uso)
    # xkiro agotado pero no se usó en 24h (no está en uso) -> redistribuir a nim
    # openrouter agotado, no usado -> redistribuir
    # freellmapi agotado, no usado -> redistribuir
    # apinex agotado, no usado -> redistribuir
    assert any(r["proveedor"] == "xkiro" and r["accion"] == "redistribuir" for r in resultado)
    assert any(r["proveedor"] == "openrouter" and r["accion"] == "redistribuir" for r in resultado)
    # aihubmix vivo pero poco usado (5 peticiones) -> activar más
    assert any(r["proveedor"] == "aihubmix" and r["accion"] == "activar" for r in resultado)
    # llm7 vivo pero no usado -> activar
    assert any(r["proveedor"] == "llm7" and r["accion"] == "activar" for r in resultado)
    print("✓ test_clasificar_infrautilizados_proveedores")


def test_clasificar_infrautilizados_agy():
    uso = _ejemplo_uso_24h()
    # Simular medidor de agy con modelos disponibles
    medidor = {
        "gemini-3.8-flash-medium": {"pausado_hasta": 0},
        "gemini-4-neon-high": {"pausado_hasta": 0},
        "gemini-4-hydrogen-high": {"pausado_hasta": 0},
        "claude-opus-5-5-high": {"pausado_hasta": 0},
        "claude-sonnet-5-5-medium": {"pausado_hasta": 0},
        "gpt-oss-120b-medium": {"pausado_hasta": 0},
    }
    ahora = 1732100000  # timestamp fijo
    resultado = rc.clasificar_infrautilizados_agy(medidor, uso, ahora)
    # gemini-4-hydrogen-high disponible pero no usado -> activar para dirección
    assert any(r["modelo"] == "gemini-4-hydrogen-high" and r["accion"] == "activar" for r in resultado)
    # claude-opus-5-5-high disponible pero no usado -> activar
    assert any(r["modelo"] == "claude-opus-5-5-high" and r["accion"] == "activar" for r in resultado)
    print("✓ test_clasificar_infrautilizados_agy")


def test_clasificar_infrautilizados_herramientas():
    uso = _ejemplo_uso_24h()
    # Todas las habilidades disponibles en .agent/skills
    skills_disponibles = [
        "agent-reach", "awesome-design-md", "claude-video-studio", "coop-qa",
        "coop-sync-testing", "design-md", "design-taste-frontend", "enhance-prompt",
        "frontend-slides", "grafo-codigo", "inbox-zero", "react-components",
        "remotion", "shadcn-ui", "spacedrive-cli", "stitch-loop"
    ]
    resultado = rc.clasificar_infrautilizados_herramientas(skills_disponibles, uso)
    # Muchas skills no usadas -> activar
    assert any(r["herramienta"] == "remotion" and r["accion"] == "activar" for r in resultado)
    assert any(r["herramienta"] == "claude-video-studio" and r["accion"] == "activar" for r in resultado)
    assert any(r["herramienta"] == "coop-qa" and r["accion"] == "activar" for r in resultado)
    print("✓ test_clasificar_infrautilizados_herramientas")


def test_clasificar_infrautilizados_mcp():
    uso = _ejemplo_uso_24h()
    mcp_disponibles = ["github", "filesystem", "sqlite", "postgres", "brave-search", "notion", "google-drive"]
    resultado = rc.clasificar_infrautilizados_mcp(mcp_disponibles, uso)
    # sqlite, postgres, brave-search, notion, google-drive no usados -> activar
    assert any(r["servidor"] == "sqlite" and r["accion"] == "activar" for r in resultado)
    assert any(r["servidor"] == "brave-search" and r["accion"] == "activar" for r in resultado)
    print("✓ test_clasificar_infrautilizados_mcp")


def test_generar_informe():
    medios = _ejemplo_medios_disponibles()
    salud = _ejemplo_salud_proveedores()
    uso = _ejemplo_uso_24h()
    medidor_agy = {
        "gemini-3.8-flash-medium": {"pausado_hasta": 0},
        "gemini-4-neon-high": {"pausado_hasta": 0},
        "gemini-4-hydrogen-high": {"pausado_hasta": 0},
        "claude-opus-5-5-high": {"pausado_hasta": 0},
    }
    skills = ["react-components", "shadcn-ui", "design-md", "remotion", "claude-video-studio"]
    mcp = ["github", "filesystem", "sqlite", "brave-search"]
    
    informe = rc.generar_informe(medios, salud, uso, medidor_agy, skills, mcp, ahora=1732100000)
    
    assert "INFORME DE CAPACIDADES INFRAUTILIZADAS" in informe
    assert "cloudroom" in informe.lower()
    assert "xkiro" in informe.lower()
    assert "remotion" in informe.lower()
    assert "sqlite" in informe.lower()
    # Debe incluir acciones concretas
    assert "activar" in informe.lower()
    assert "redistribuir" in informe.lower()
    assert "pedir_alex" in informe.lower()
    print("✓ test_generar_informe")


def test_abrir_tareas_enjambre():
    medios = _ejemplo_medios_disponibles()
    salud = _ejemplo_salud_proveedores()
    uso = _ejemplo_uso_24h()
    medidor_agy = {}
    skills = ["remotion", "claude-video-studio"]
    mcp = ["sqlite", "brave-search"]
    
    tareas = rc.abrir_tareas_enjambre(medios, salud, uso, medidor_agy, skills, mcp)
    
    # Debe generar tareas para cosas que el enjambre puede arreglar
    # p.ej. configurar opencode-zen, activar cloudroom, etc.
    assert len(tareas) > 0
    ids = {t["id"] for t in tareas}
    # Verificar que hay tareas para medios configurables
    assert any("opencode-zen" in t["id"] or "zen" in t["id"] for t in tareas)
    print("✓ test_abrir_tareas_enjambre")


def test_main_con_archivos_temporales():
    """Test de integración con archivos temporales simulando el entorno."""
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        
        # Crear archivos simulados
        medios_file = tmp / "medios.json"
        salud_file = tmp / "salud-proveedores.json"
        uso_file = tmp / "uso-24h.json"
        medidor_agy_file = tmp / "antigravity-uso.json"
        
        medios_file.write_text(json.dumps(_ejemplo_medios_disponibles()))
        salud_file.write_text(json.dumps(_ejemplo_salud_proveedores()))
        uso_file.write_text(json.dumps(_ejemplo_uso_24h()))
        medidor_agy_file.write_text(json.dumps({
            "gemini-3.8-flash-medium": {"pausado_hasta": 0},
            "gemini-4-neon-high": {"pausado_hasta": 0},
            "gemini-4-hydrogen-high": {"pausado_hasta": 0},
        }))
        
        # Configurar variables de entorno para que apunten a nuestros archivos
        os.environ["STARSEED_MEDIOS_JSON"] = str(medios_file)
        os.environ["STARSEED_SALUD_PROVEEDORES_JSON"] = str(salud_file)
        os.environ["STARSEED_USO_24H_JSON"] = str(uso_file)
        os.environ["STARSEED_AGY_USO_JSON"] = str(medidor_agy_file)
        os.environ["STARSEED_ROOT"] = str(tmp)
        
        try:
            # Ejecutar main (debería generar informe y tareas sin errores)
            rc.main(["--json"])
        finally:
            for k in ["STARSEED_MEDIOS_JSON", "STARSEED_SALUD_PROVEEDORES_JSON", "STARSEED_USO_24H_JSON", "STARSEED_AGY_USO_JSON", "STARSEED_ROOT"]:
                os.environ.pop(k, None)
        
        print("✓ test_main_con_archivos_temporales")


# ── Nuevas pruebas para SUP1124F: filtrado por git ignore ────────────────────

def _datos_base_para_tareas() -> tuple[dict, dict, dict, dict, list[str], list[str]]:
    """Devuelve tuplas (medios, salud, uso, medidor_agy, skills, mcp) para tests de tareas."""
    medios = _ejemplo_medios_disponibles()
    salud = _ejemplo_salud_proveedores()
    uso = _ejemplo_uso_24h()
    medidor_agy = {}
    skills = ["agent-reach", "awesome-design-md", "claude-video-studio"]
    mcp = ["brave-search", "sqlite"]
    return medios, salud, uso, medidor_agy, skills, mcp


def test_abrir_tareas_enjambre_skill_con_skillmd_seguido():
    """CAP-skill de agent-reach usa SKILL.md cuando README.md está ignorado y SKILL.md seguido."""
    medios, salud, uso, medidor_agy, skills, mcp = _datos_base_para_tareas()
    
    # Simular: .agent/ ignorado, pero .agent/skills/agent-reach/SKILL.md seguido
    ignorado = lambda r: r.startswith(".agent/")
    seguido = lambda r: r == ".agent/skills/agent-reach/SKILL.md"
    
    with tempfile.TemporaryDirectory() as tmpdir:
        original_olas = rc.OLAS
        rc.OLAS = Path(tmpdir)
        try:
            tareas = rc.abrir_tareas_enjambre(
                medios, salud, uso, medidor_agy, skills, mcp,
                ignorado=ignorado, seguido=seguido
            )
        finally:
            rc.OLAS = original_olas
    
    # Buscar la tarea CAP-skill-agent-reach-uso
    tarea_agent_reach = next((t for t in tareas if t["id"] == "CAP-skill-agent-reach-uso"), None)
    assert tarea_agent_reach is not None, "Debería existir tarea para agent-reach"
    assert tarea_agent_reach["archivos"] == [".agent/skills/agent-reach/SKILL.md"], \
        f"Archivos esperados ['.agent/skills/agent-reach/SKILL.md'], got {tarea_agent_reach['archivos']}"
    assert "Se amplía la sección de uso de SKILL.md" in tarea_agent_reach["prompt"]
    print("✓ test_abrir_tareas_enjambre_skill_con_skillmd_seguido")


def test_abrir_tareas_enjambre_skill_sin_skillmd_no_se_encola():
    """Skill sin SKILL.md seguido no se encola (README.md ignorado y sin alternativa)."""
    medios, salud, uso, medidor_agy, skills, mcp = _datos_base_para_tareas()
    
    # Simular: .agent/ ignorado, y NADA seguido en .agent/
    ignorado = lambda r: r.startswith(".agent/")
    seguido = lambda r: False
    
    with tempfile.TemporaryDirectory() as tmpdir:
        original_olas = rc.OLAS
        rc.OLAS = Path(tmpdir)
        try:
            tareas = rc.abrir_tareas_enjambre(
                medios, salud, uso, medidor_agy, skills, mcp,
                ignorado=ignorado, seguido=seguido
            )
        finally:
            rc.OLAS = original_olas
    
    # Ninguna tarea de skill debería encolarse porque todas sus rutas están ignoradas
    tareas_skill = [t for t in tareas if t["id"].startswith("CAP-skill-")]
    assert len(tareas_skill) == 0, f"Skills sin archivos seguidos no deberían encolarse, got {tareas_skill}"
    print("✓ test_abrir_tareas_enjambre_skill_sin_skillmd_no_se_encola")


def test_abrir_tareas_enjambre_mcp_solo_director():
    """CAP-mcp queda solo con scripts/puente/mcp_director.py (carpeta .agent/ ignorada)."""
    medios, salud, uso, medidor_agy, skills, mcp = _datos_base_para_tareas()
    
    # Simular: .agent/ ignorado, scripts/puente/ seguido
    ignorado = lambda r: r.startswith(".agent/")
    seguido = lambda r: not r.startswith(".agent/")
    
    with tempfile.TemporaryDirectory() as tmpdir:
        original_olas = rc.OLAS
        rc.OLAS = Path(tmpdir)
        try:
            tareas = rc.abrir_tareas_enjambre(
                medios, salud, uso, medidor_agy, skills, mcp,
                ignorado=ignorado, seguido=seguido
            )
        finally:
            rc.OLAS = original_olas
    
    # Buscar tarea MCP brave-search
    tarea_mcp = next((t for t in tareas if t["id"] == "CAP-mcp-brave-search-conectar"), None)
    assert tarea_mcp is not None, "Debería existir tarea para brave-search"
    assert tarea_mcp["archivos"] == ["scripts/puente/mcp_director.py"], \
        f"Archivos esperados ['scripts/puente/mcp_director.py'], got {tarea_mcp['archivos']}"
    print("✓ test_abrir_tareas_enjambre_mcp_solo_director")


def test_abrir_tareas_enjambre_sin_ignorado_mismo_comportamiento():
    """Con ignorado=lambda r: False las tareas son las mismas que hoy (sin filtrado)."""
    medios, salud, uso, medidor_agy, skills, mcp = _datos_base_para_tareas()
    
    # Sin ignorar nada
    ignorado = lambda r: False
    seguido = lambda r: True
    
    with tempfile.TemporaryDirectory() as tmpdir:
        original_olas = rc.OLAS
        rc.OLAS = Path(tmpdir)
        try:
            tareas = rc.abrir_tareas_enjambre(
                medios, salud, uso, medidor_agy, skills, mcp,
                ignorado=ignorado, seguido=seguido
            )
        finally:
            rc.OLAS = original_olas
    
    # Verificar que las tareas esperadas existen con sus archivos originales
    ids_esperados = {
        "CAP-cloudroom-config",
        "CAP-opencode-zen-config",
        "CAP-prov-llm7-rotacion",
        "CAP-prov-aihubmix-rotacion",
        "CAP-prov-tokenrouter-rotacion",
        "CAP-skill-agent-reach-uso",
        "CAP-skill-awesome-design-md-uso",
        "CAP-skill-claude-video-studio-uso",
        "CAP-mcp-brave-search-conectar",
        "CAP-mcp-sqlite-conectar",
    }
    ids_obtenidos = {t["id"] for t in tareas}
    assert ids_esperados.issubset(ids_obtenidos), f"Faltan tareas: {ids_esperados - ids_obtenidos}"
    
    # Verificar archivos de una skill (README.md)
    tarea_skill = next(t for t in tareas if t["id"] == "CAP-skill-agent-reach-uso")
    assert tarea_skill["archivos"] == [".agent/skills/agent-reach/README.md"]
    
    # Verificar archivos de MCP (ambos)
    tarea_mcp = next(t for t in tareas if t["id"] == "CAP-mcp-brave-search-conectar")
    assert tarea_mcp["archivos"] == ["scripts/puente/mcp_director.py", ".agent/skills/mcp-brave-search/"]
    
    print("✓ test_abrir_tareas_enjambre_sin_ignorado_mismo_comportamiento")


if __name__ == "__main__":
    test_clasificar_infrautilizados_medios()
    test_clasificar_infrautilizados_proveedores()
    test_clasificar_infrautilizados_agy()
    test_clasificar_infrautilizados_herramientas()
    test_clasificar_infrautilizados_mcp()
    test_generar_informe()
    test_abrir_tareas_enjambre()
    test_main_con_archivos_temporales()
    # Nuevas pruebas SUP1124F
    test_abrir_tareas_enjambre_skill_con_skillmd_seguido()
    test_abrir_tareas_enjambre_skill_sin_skillmd_no_se_encola()
    test_abrir_tareas_enjambre_mcp_solo_director()
    test_abrir_tareas_enjambre_sin_ignorado_mismo_comportamiento()
    print("\n✅ TODAS LAS PRUEBAS PASARON")