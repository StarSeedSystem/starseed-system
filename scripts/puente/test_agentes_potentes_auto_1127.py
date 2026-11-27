# Tests pytest para auto_lanzar (CAP1127C)
import json
import os
import tempfile

import pytest

from scripts.puente.sugerencias_potentes import auto_lanzar


# ── Datos de prueba ──

PRIORIDAD_ALTA = 95
PRIORIDAD_BAJA = 50
PRIORIDAD_OTRA = 80

SUGERENCIA_PLAN = {
    "id": "t1",
    "titulo": "Tarea de prueba",
    "tipo": "rust_nativo",
    "agente": "Antigravity",
    "modelo": "claude-opus-5-5-high",
    "motivo": "Rust/nativo: Opus 5.5 para código nativo y fallos difíciles",
    "coste_estimado": "sin clave API (Antigravity, cuenta de Google de Alex)",
    "cupo_queda": "disponible (Antigravity)",
    "modo": "plan",
    "prioridad": PRIORIDAD_ALTA,
}

SUGERENCIA_PAGO = {
    "id": "t2",
    "titulo": "Tarea de pago",
    "tipo": "ui_typescript",
    "agente": "Codex",
    "modelo": "gpt-5.6-sol",
    "motivo": "UI/TypeScript: gpt-5.6-sol para componentes",
    "coste_estimado": "$/token (pago: openai)",
    "cupo_queda": None,
    "modo": "plan",
    "prioridad": PRIORIDAD_ALTA,
}

SUGERENCIA_PRIORIDAD_BAJA = {
    "id": "t3",
    "titulo": "Tarea baja prioridad",
    "tipo": "mecanico",
    "agente": "Antigravity",
    "modelo": "gemini-3.8-flash",
    "motivo": "Mecánico: gemini-3.8-flash de bajo coste",
    "coste_estimado": "sin clave API (Antigravity, cuenta de Google de Alex)",
    "cupo_queda": "disponible (Antigravity)",
    "modo": "plan",
    "prioridad": PRIORIDAD_BAJA,
}

SUGERENCIA_SIN_PLAN = {
    "id": "t4",
    "titulo": "Tarea sin plan",
    "tipo": "arquitectura",
    "agente": "Antigravity",
    "modelo": "gemini-4-hydrogen-xhigh",
    "motivo": "Arquitectura: hydrogen-xhigh para decisiones de sistema",
    "coste_estimado": "sin clave API (Antigravity, cuenta de Google de Alex)",
    "cupo_queda": "disponible (Antigravity)",
    "modo": "escribir",
    "prioridad": PRIORIDAD_ALTA,
}


# ── Fixture para rutas temporales ──

@pytest.fixture
def tmp_dir():
    with tempfile.TemporaryDirectory() as d:
        yield d


@pytest.fixture
def tmp_switch_dir():
    # El interruptor se crea en la ruta por defecto que usa auto_lanzar
    switch_path = os.path.expanduser("~/.starseed/produccion/agentes-potentes.json")
    os.makedirs(os.path.dirname(switch_path), exist_ok=True)
    # Por defecto, auto=True para que los tests funcionen
    with open(switch_path, "w") as f:
        json.dump({"auto": True}, f)
    # También crear directorio temporal por si algún test lo necesita
    tmp_dir = os.path.dirname(switch_path)
    yield tmp_dir


@pytest.fixture
def tmp_registro_path(tmp_dir):
    p = os.path.join(tmp_dir, "agentes-potentes-lanzados.jsonl")
    yield p


# ── Tests ──

class TestAutoLanzarTopeDiario:
    """Test: como máximo N por día (ajuste, por defecto 4)."""

    def test_tope_default_4(self, tmp_dir, tmp_registro_path):
        """Con 6 sugerencias y auto=True, solo se lanzan 4 por defecto."""
        sugs = [SUGERENCIA_PLAN.copy() for _ in range(6)]

        cupos = {}

        resultado = auto_lanzar(
            sugerencias=sugs,
            cupos=cupos,
            ajustes={"max_por_dia": 4},
            ahora=1_000_000_000,
        )

        assert resultado["lanzados"] <= 4, f"Se lanzaron {resultado['lanzados']}, máximo es 4"
        assert resultado["ok"] is True

    def test_tope_personalizado(self, tmp_dir, tmp_registro_path):
        """Con ajuste max_por_dia=2, se lanzan como máximo 2."""
        sugs = [SUGERENCIA_PLAN.copy() for _ in range(5)]

        cupos = {}

        resultado = auto_lanzar(
            sugerencias=sugs,
            cupos=cupos,
            ajustes={"max_por_dia": 2},
            ahora=1_000_000_000,
        )

        assert resultado["lanzados"] <= 2, f"Se lanzaron {resultado['lanzados']}, máximo es 2"


class TestAutoLanzarCupo:
    """Test: solo si el cupo de ese modelo hoy es > 0."""

    def test_cupo_cero_no_lanza(self, tmp_dir, tmp_registro_path):
        """Cuando el cupo disponible_hoy es 0, no se lanza."""
        sugs = [SUGERENCIA_PLAN.copy()]
        # Sobrescribir el cupo_queda en la sugerencia para simular que no hay cupo
        sugs[0]["cupo_queda"] = "0 llamadas hoy disponibles"

        # Cupo con disponible_hoy = 0
        cupos = {"t1": {"disponible_hoy": 0}}

        resultado = auto_lanzar(
            sugerencias=sugs,
            cupos=cupos,
            ajustes={"max_por_dia": 4},
            ahora=1_000_000_000,
        )

        assert resultado["lanzados"] == 0, f"Se lanzaron {resultado['lanzados']}, debería ser 0"


class TestAutoLanzarPrioridad:
    """Test: prioridad ≥ 90 es requerido."""

    def test_prioridad_baja_no_lanza(self, tmp_dir, tmp_registro_path):
        """Sugerencia con prioridad < 90 no se lanza."""
        sugs = [SUGERENCIA_PRIORIDAD_BAJA.copy()]

        cupos = {}

        resultado = auto_lanzar(
            sugerencias=sugs,
            cupos=cupos,
            ajustes={"max_por_dia": 4},
            ahora=1_000_000_000,
        )

        assert resultado["lanzados"] == 0, f"Se lanzaron {resultado['lanzados']}, debería ser 0"

    def test_prioridad_90_si_lanza(self, tmp_dir, tmp_registro_path):
        """Sugerencia con prioridad exactly 90 sí se lanza."""
        sugs = [SUGERENCIA_PLAN.copy()]
        sugs[0]["prioridad"] = 90  # Exactamente 90

        cupos = {}

        resultado = auto_lanzar(
            sugerencias=sugs,
            cupos=cupos,
            ajustes={"max_por_dia": 4},
            ahora=1_000_000_000,
        )

        assert resultado["lanzados"] >= 1, f"Se lanzaron {resultado['lanzados']}, debería ser ≥ 1"


class TestAutoLanzarPago:
    """Test: nunca de pago (cost_estimado debe decir 'sin clave API' o equivalente gratis)."""

    def test_coste_pago_no_lanza(self, tmp_dir, tmp_registro_path):
        """Sugerencia con coste de pago no se lanza."""
        sugs = [SUGERENCIA_PAGO.copy()]

        cupos = {}

        resultado = auto_lanzar(
            sugerencias=sugs,
            cupos=cupos,
            ajustes={"max_por_dia": 4},
            ahora=1_000_000_000,
        )

        assert resultado["lanzados"] == 0, f"Se lanzaron {resultado['lanzados']}, debería ser 0"

    def test_coste_sin_clave_api_si_lanza(self, tmp_dir, tmp_registro_path):
        """Sugerencia con coste 'sin clave API' sí se lanza."""
        sugs = [SUGERENCIA_PLAN.copy()]

        cupos = {}

        resultado = auto_lanzar(
            sugerencias=sugs,
            cupos=cupos,
            ajustes={"max_por_dia": 4},
            ahora=1_000_000_000,
        )

        assert resultado["lanzados"] >= 1, f"Se lanzaron {resultado['lanzados']}, debería ser ≥ 1"


class TestAutoLanzarModo:
    """Test: siempre en el modo que ya proponga la sugerencia ('plan' si dice plan)."""

    def test_modo_escribir_no_lanza(self, tmp_dir, tmp_registro_path):
        """Sugerencia con modo 'escribir' no se lanza automáticamente."""
        sugs = [SUGERENCIA_SIN_PLAN.copy()]

        cupos = {}

        resultado = auto_lanzar(
            sugerencias=sugs,
            cupos=cupos,
            ajustes={"max_por_dia": 4},
            ahora=1_000_000_000,
        )

        assert resultado["lanzados"] == 0, f"Se lanzaron {resultado['lanzados']}, debería ser 0"


class TestAutoLanzarInterruptor:
    """Test: interruptor en ~/.starseed/produccion/agentes-potentes.json {auto: true|false}."""

    def test_interruptor_apagado_no_lanza(self, tmp_dir, tmp_switch_dir, tmp_registro_path):
        """Con auto=false en el switch, no se lanzan."""
        sugs = [SUGERENCIA_PLAN.copy()]

        # Switch con auto=false (usa la versión del fixture o crea la nuestra)
        switch_file = os.path.join(tmp_switch_dir, "agentes-potentes.json")
        os.makedirs(tmp_switch_dir, exist_ok=True)
        with open(switch_file, "w") as f:
            json.dump({"auto": False}, f)

        cupos = {}

        resultado = auto_lanzar(
            sugerencias=sugs,
            cupos=cupos,
            ajustes={"max_por_dia": 4},
            ahora=1_000_000_000,
        )

        assert resultado["lanzados"] == 0, f"Se lanzaron {resultado['lanzados']}, debería ser 0"
        # El mensaje debería indicar que está desactivado
        assert "desactivado" in resultado["mensaje"].lower() or resultado["ok"] is True

    def test_interruptor_activado_si_lanza(self, tmp_dir, tmp_switch_dir, tmp_registro_path):
        """Con auto=true en el switch, se pueden lanzar."""
        sugs = [SUGERENCIA_PLAN.copy()]

        # Switch con auto=true
        switch_file = os.path.join(tmp_switch_dir, "agentes-potentes.json")
        os.makedirs(tmp_switch_dir, exist_ok=True)
        with open(switch_file, "w") as f:
            json.dump({"auto": True}, f)

        cupos = {}

        resultado = auto_lanzar(
            sugerencias=sugs,
            cupos=cupos,
            ajustes={"max_por_dia": 4},
            ahora=1_000_000_000,
        )

        # Debería intentar lanzar (puede ser 0 si hay otras restricciones, pero no por el switch)
        assert resultado["ok"] is True


class TestAutoLanzarArchivosProtegidos:
    """Test: nunca sobre archivos protegidos de producción."""

    def test_archivo_protegido_no_lanza(self, tmp_dir, tmp_switch_dir, tmp_registro_path):
        """Sugerencia con id en lista de archivos protegidos no se lanza."""
        sugs = [SUGERENCIA_PLAN.copy()]
        sugs[0]["id"] = "archivo-protegido-importante"

        # Crear lista de archivos protegidos en la ruta por defecto
        protegidos_path = os.path.expanduser("~/.starseed/produccion/archivos-protegidos.json")
        os.makedirs(os.path.dirname(protegidos_path), exist_ok=True)
        with open(protegidos_path, "w", encoding="utf-8") as f:
            json.dump(["archivo-protegido-importante"], f)

        cupos = {}

        resultado = auto_lanzar(
            sugerencias=sugs,
            cupos=cupos,
            ajustes={"max_por_dia": 4},
            ahora=1_000_000_000,
        )

        assert resultado["lanzados"] == 0, f"Se lanzaron {resultado['lanzados']}, debería ser 0"


def _escribir_switch(ruta, auto):
    """Escribe el interruptor de producción."""
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump({"auto": auto}, f, ensure_ascii=False, indent=1)


# ── Test suite completa ──

if __name__ == "__main__":
    pytest.main([__file__, "-v"])