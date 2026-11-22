# -*- coding: utf-8 -*-
"""Flota Antigravity para MetaGenesis: catálogo de modelos, medidor de uso,
tabla de papeles → modelo y configuración de contexto/acceso.

Módulo puro salvo `main`: sin E/S de red ni disco en las funciones puras.
"""

import json
import os
import re as _re_dir1121f
import subprocess
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, date
from pathlib import Path
from typing import Any


STARSEED_DIR = Path.home() / ".starseed"
MODELOS_PATH = STARSEED_DIR / "antigravity-modelos.json"
USO_PATH = STARSEED_DIR / "antigravity-uso.json"
CONFIG_PATH = STARSEED_DIR / "antigravity-config.json"

RESERVA_PORCENTAJE = 0.20  # 20 % de reserva que nunca se gasta


@dataclass
class ModeloAgy:
    """Modelo disponible en Antigravity."""
    nombre: str
    familia: str
    nivel: str  # low, medium, high, xhigh
    descripcion: str = ""

    @property
    def id_completo(self) -> str:
        return f"{self.familia}-{self.nivel}"


@dataclass
class UsoModelo:
    """Registro de uso de un modelo en un día."""
    modelo: str
    fecha: str  # YYYY-MM-DD
    llamadas: int = 0
    tiempo_total_seg: float = 0.0
    errores_cuota: int = 0
    textos_errores_cuota: list[str] = field(default_factory=list)

    def a_dict(self) -> dict:
        return {
            "modelo": self.modelo,
            "fecha": self.fecha,
            "llamadas": self.llamadas,
            "tiempo_total_seg": self.tiempo_total_seg,
            "errores_cuota": self.errores_cuota,
            "textos_errores_cuota": self.textos_errores_cuota,
        }

    @staticmethod
    def desde_dict(d: dict) -> "UsoModelo":
        return UsoModelo(
            modelo=d["modelo"],
            fecha=d["fecha"],
            llamadas=d.get("llamadas", 0),
            tiempo_total_seg=d.get("tiempo_total_seg", 0.0),
            errores_cuota=d.get("errores_cuota", 0),
            textos_errores_cuota=d.get("textos_errores_cuota", []),
        )


@dataclass
class PapelModelo:
    """Mapeo de papel → modelo principal y alternativas."""
    papel: str
    modelo_principal: str
    alternativa_agy: str | None = None
    alternativas_fuera_agy: list[str] = field(default_factory=list)
    descripcion: str = ""


# Tabla pura de papeles → modelo (sin E/S)
TABLA_PAPELES: tuple[PapelModelo, ...] = (
    PapelModelo(
        papel="director_presidente",
        modelo_principal="gemini-4-hydrogen-high",
        alternativa_agy="claude-opus-5-5-high",
        alternativas_fuera_agy=["hermes", "codex"],
        descripcion="Dirección principal: planes, revisiones, decisiones largas",
    ),
    PapelModelo(
        papel="directores_produccion_pruebas_capacidad",
        modelo_principal="gemini-4-neon-medium",
        alternativa_agy=None,
        alternativas_fuera_agy=["hermes", "codex", "nim/kimi-k3"],
        descripcion="Directores de producción, pruebas y capacidad",
    ),
    PapelModelo(
        papel="escritores_enjambre",
        modelo_principal="gemini-3.8-flash-medium",
        alternativa_agy=None,
        alternativas_fuera_agy=["nim/kimi-k3", "nim/deepseek-v4-flash", "xkiro/qwen3-coder-plus"],
        descripcion="Escritores del enjambre; tras 2 fallos → claude-sonnet-5-5-medium",
    ),
    PapelModelo(
        papel="revisores",
        modelo_principal="claude-sonnet-5-5-medium",
        alternativa_agy=None,
        alternativas_fuera_agy=["aihubmix", "nim/deepseek-v4-pro", "openrouter:free"],
        descripcion="Revisores: modelo de otra familia que el escritor",
    ),
    PapelModelo(
        papel="tareas_mecanicas",
        modelo_principal="gemini-3.8-flash-low",
        alternativa_agy=None,
        alternativas_fuera_agy=["nim/gpt-oss-20b", "llm7/minimax-m2.7", "openrouter:free"],
        descripcion="Tareas mecánicas: renombrar, formatear, resumir, scrape",
    ),
)


def _leer_json(path: Path, default: Any) -> Any:
    try:
        with path.open(encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return default


def _escribir_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.replace(path)


def obtener_modelos_agy() -> list[ModeloAgy]:
    """Ejecuta `agy models` y devuelve la lista parseada de modelos."""
    try:
        resultado = subprocess.run(
            ["agy", "models"],
            capture_output=True,
            text=True,
            timeout=60,
            cwd=Path.cwd(),
            stdin=subprocess.DEVNULL,
        )
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError) as e:
        raise RuntimeError(f"No se pudo ejecutar 'agy models': {e}") from e

    if resultado.returncode != 0:
        raise RuntimeError(f"'agy models' falló (rc={resultado.returncode}): {resultado.stderr.strip()}")

    modelos: list[ModeloAgy] = []
    for linea in resultado.stdout.strip().splitlines():
        linea = linea.strip()
        if not linea or linea.startswith("#"):
            continue
        # DIR1121F (2026-11-21, medido): la salida real de `agy models` es «id<TAB>Nombre visible», precedida de la línea
        # «Fetching available models...». El formato con barras «id | Google | descripción» era una suposición: con él se
        # leían 0 modelos y el medidor decía «sin sesión de Google» con la sesión activa. Se aceptan los dos.
        if "|" in linea:
            partes = [p.strip() for p in linea.split("|")]
            if len(partes) < 2:
                continue
            nombre = partes[0]
            descripcion = partes[2] if len(partes) > 2 else ""
        else:
            trozos = _re_dir1121f.split(r"\t+|\s{2,}", linea, maxsplit=1)
            nombre = trozos[0].strip()
            descripcion = trozos[1].strip() if len(trozos) > 1 else ""
        if not _re_dir1121f.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._\-]*", nombre):
            continue  # avisos como «Fetching available models...»: no son un id de modelo
        # Parsear familia y nivel del nombre
        # Ej: gemini-4-hydrogen-high, gemini-3.8-flash-medium, claude-opus-5-5-high
        familia_nivel = _parsear_familia_nivel(nombre)
        modelos.append(ModeloAgy(
            nombre=nombre,
            familia=familia_nivel[0],
            nivel=familia_nivel[1],
            descripcion=descripcion,
        ))
    return modelos


def _parsear_familia_nivel(nombre: str) -> tuple[str, str]:
    """Extrae familia y nivel del nombre del modelo."""
    # Patrones conocidos:
    # gemini-4-hydrogen-high -> (gemini-4-hydrogen, high)
    # gemini-3.8-flash-medium -> (gemini-3.8-flash, medium)
    # claude-opus-5-5-high -> (claude-opus-5-5, high)
    # gpt-oss-120b-medium -> (gpt-oss-120b, medium)
    partes = nombre.split("-")
    if len(partes) >= 2 and partes[-1] in ("low", "medium", "high", "xhigh"):
        nivel = partes[-1]
        familia = "-".join(partes[:-1])
        return familia, nivel
    return nombre, "unknown"


def cargar_modelos_guardados() -> list[ModeloAgy]:
    """Carga el catálogo guardado desde ~/.starseed/antigravity-modelos.json."""
    data = _leer_json(MODELOS_PATH, [])
    return [ModeloAgy(**m) for m in data]


def guardar_modelos(modelos: list[ModeloAgy]) -> None:
    """Guarda el catálogo en ~/.starseed/antigravity-modelos.json."""
    _escribir_json(MODELOS_PATH, [{"nombre": m.nombre, "familia": m.familia, "nivel": m.nivel, "descripcion": m.descripcion} for m in modelos])


def cmd_modelos() -> int:
    """Comando `modelos`: lee `agy models` y guarda el catálogo."""
    try:
        modelos = obtener_modelos_agy()
        guardar_modelos(modelos)
        print(f"Catálogo guardado en {MODELOS_PATH}: {len(modelos)} modelos")
        for m in modelos:
            print(f"  {m.nombre}  ({m.familia}, {m.nivel})")
        return 0
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


def cargar_uso() -> dict[str, list[UsoModelo]]:
    """Carga el medidor de uso desde ~/.starseed/antigravity-uso.json."""
    data = _leer_json(USO_PATH, {})
    resultado: dict[str, list[UsoModelo]] = {}
    for modelo, lista in data.items():
        resultado[modelo] = [UsoModelo.desde_dict(d) for d in lista]
    return resultado


def guardar_uso(uso: dict[str, list[UsoModelo]]) -> None:
    """Guarda el medidor de uso en ~/.starseed/antigravity-uso.json."""
    data = {modelo: [u.a_dict() for u in lista] for modelo, lista in uso.items()}
    _escribir_json(USO_PATH, data)


def registrar_uso(modelo: str, duracion_seg: float, error_cuota: str | None = None) -> None:
    """Registra una llamada al modelo con su duración y posible error de cuota."""
    uso = cargar_uso()
    hoy = date.today().isoformat()
    if modelo not in uso:
        uso[modelo] = []
    # Buscar o crear entrada de hoy
    entrada_hoy = None
    for u in uso[modelo]:
        if u.fecha == hoy:
            entrada_hoy = u
            break
    if entrada_hoy is None:
        entrada_hoy = UsoModelo(modelo=modelo, fecha=hoy)
        uso[modelo].append(entrada_hoy)
    entrada_hoy.llamadas += 1
    entrada_hoy.tiempo_total_seg += duracion_seg
    if error_cuota:
        entrada_hoy.errores_cuota += 1
        entrada_hoy.textos_errores_cuota.append(error_cuota)
    # Mantener solo últimos 30 días
    uso[modelo] = [u for u in uso[modelo] if (date.today() - date.fromisoformat(u.fecha)).days <= 30]
    guardar_uso(uso)


def estimar_cuota_diaria(modelo: str) -> dict[str, float]:
    """Estima la cuota diaria disponible para un modelo basada en el historial.
    
    Returns:
        dict con 'cuota_estimada', 'reserva_20%', 'disponible_hoy'
    """
    uso = cargar_uso()
    if modelo not in uso or not uso[modelo]:
        return {"cuota_estimada": 0.0, "reserva_20%": 0.0, "disponible_hoy": 0.0}
    
    # Usar los últimos 7 días (excluyendo hoy) para estimar
    hoy = date.today().isoformat()
    historicos = [u for u in uso[modelo] if u.fecha != hoy]
    ultimos = sorted(historicos, key=lambda u: u.fecha)[-7:]
    if not ultimos:
        return {"cuota_estimada": 0.0, "reserva_20%": 0.0, "disponible_hoy": 0.0}
    
    # Cuota estimada = promedio de llamadas/día * factor de seguridad
    # Si hay errores de cuota, la cuota real está cerca del máximo observado
    max_llamadas = max(u.llamadas for u in ultimos)
    promedio_llamadas = sum(u.llamadas for u in ultimos) / len(ultimos)
    
    # Si hay errores de cuota recientes, usar el máximo como estimación de la cuota real
    hay_errores_recientes = any(u.errores_cuota > 0 for u in ultimos[-3:])
    cuota_estimada = max_llamadas if hay_errores_recientes else promedio_llamadas * 1.5
    
    reserva = cuota_estimada * RESERVA_PORCENTAJE
    disponible = cuota_estimada - reserva
    
    return {
        "cuota_estimada": round(cuota_estimada, 1),
        "reserva_20%": round(reserva, 1),
        "disponible_hoy": round(max(0, disponible), 1),
    }


def en_reserva(modelo: str) -> bool:
    """True si el modelo está en su zona de reserva (últimas 24h cerca del límite)."""
    estimacion = estimar_cuota_diaria(modelo)
    uso = cargar_uso()
    hoy = date.today().isoformat()
    llamadas_hoy = 0
    if modelo in uso:
        for u in uso[modelo]:
            if u.fecha == hoy:
                llamadas_hoy = u.llamadas
                break
    # En reserva si ya gastó más del 80% de la cuota estimada
    if estimacion["cuota_estimada"] > 0:
        return llamadas_hoy >= estimacion["cuota_estimada"] * (1 - RESERVA_PORCENTAJE)
    return False


def obtener_modelo_para_papel(papel: str, modelo_actual: str | None = None) -> tuple[str, list[str]]:
    """Devuelve (modelo_principal, alternativas) para un papel.
    
    Si el modelo principal está en reserva, devuelve la primera alternativa disponible.
    """
    for pm in TABLA_PAPELES:
        if pm.papel == papel:
            principal = pm.modelo_principal
            alternativas: list[str] = []
            if pm.alternativa_agy and not en_reserva(pm.alternativa_agy):
                alternativas.append(pm.alternativa_agy)
            for alt in pm.alternativas_fuera_agy:
                alternativas.append(alt)
            # Si el principal está en reserva, mover la primera alternativa al frente
            if en_reserva(principal) and alternativas:
                return alternativas[0], [principal] + alternativas[1:]
            return principal, alternativas
    # Papel desconocido: fallback a tareas mecánicas
    return "gemini-3.8-flash-low", ["nim/gpt-oss-20b", "llm7/minimax-m2.7"]


def medir_tiempo_arranque_agy(modelo: str, prompt: str = "OK") -> tuple[float, int]:
    """Mide el tiempo de arranque y tokens de base de `agy` con un prompt corto.
    
    Returns:
        (tiempo_segundos, tokens_entrada_estimados)
    """
    inicio = time.perf_counter()
    try:
        resultado = subprocess.run(
            ["agy", "-p", prompt, "--model", modelo, "--mode", "plan", "--print-timeout", "30s", "--output-format", "json"],
            capture_output=True,
            text=True,
            timeout=60,
            cwd=Path.cwd(),
            stdin=subprocess.DEVNULL,
        )
        duracion = time.perf_counter() - inicio
        # Estimar tokens de entrada: prompt + contexto base (~24k tokens observados)
        tokens_base = 24000  # valor medido en GEM1118A
        return duracion, tokens_base
    except Exception:
        return 0.0, 0


def proponer_reduccion_tokens_base() -> list[str]:
    """Propone formas de reducir los tokens de base por turno."""
    return [
        "Usar agente propio con indicación corta (system prompt mínimo)",
        "Reutilizar conversación con `--conversation` / `--continue`",
        "Limitar `--add-dir` a solo lo necesario (no todo starseed_memory_root)",
        "Desactivar MCP innecesarios para la tarea",
    ]


def cargar_config_agy() -> dict:
    """Carga la configuración de contexto y MCP para agentes agy."""
    return _leer_json(CONFIG_PATH, {
        "add_dirs": ["starseed_memory_root", "."],
        "memorias_metagenesis": [
            "relevo",
            "plan_de_pruebas",
            "registro_de_pruebas",
            "orquestacion-economica.md",
        ],
        "mcp_servidores": [],  # lista de {"nombre": "...", "comando": "..."}
        "cuenta_google_modo_lectura": True,
    })


def guardar_config_agy(config: dict) -> None:
    """Guarda la configuración de contexto y MCP."""
    _escribir_json(CONFIG_PATH, config)


def main() -> int:
    if len(sys.argv) < 2:
        print("Uso: antigravity_flota.py <modelos|uso|papel|config|medir-arranque>", file=sys.stderr)
        return 1
    
    cmd = sys.argv[1]
    if cmd == "modelos":
        return cmd_modelos()
    elif cmd == "uso":
        uso = cargar_uso()
        print(json.dumps({m: [u.a_dict() for u in lst] for m, lst in uso.items()}, ensure_ascii=False, indent=2))
        return 0
    elif cmd == "papel":
        if len(sys.argv) < 3:
            print("Uso: antigravity_flota.py papel <nombre_papel>", file=sys.stderr)
            return 1
        papel = sys.argv[2]
        principal, alts = obtener_modelo_para_papel(papel)
        print(f"Papel: {papel}")
        print(f"  Principal: {principal}")
        print(f"  Alternativas: {', '.join(alts) if alts else 'ninguna'}")
        return 0
    elif cmd == "config":
        config = cargar_config_agy()
        print(json.dumps(config, ensure_ascii=False, indent=2))
        return 0
    elif cmd == "medir-arranque":
        if len(sys.argv) < 3:
            print("Uso: antigravity_flota.py medir-arranque <modelo>", file=sys.stderr)
            return 1
        modelo = sys.argv[2]
        tiempo, tokens = medir_tiempo_arranque_agy(modelo)
        print(f"Modelo: {modelo}")
        print(f"  Tiempo de arranque: {tiempo:.2f}s")
        print(f"  Tokens base estimados: {tokens}")
        for prop in proponer_reduccion_tokens_base():
            print(f"  - {prop}")
        return 0
    else:
        print(f"Comando desconocido: {cmd}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())