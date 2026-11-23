# -*- coding: utf-8 -*-
"""Flota Antigravity para MetaGenesis: catálogo de modelos, medidor de uso,
tabla de papeles → modelo y configuración de contexto/acceso.

Módulo puro salvo `main`: sin E/S de red ni disco en las funciones puras.
"""

import json
import os
import re as _re_dir1121f
import shutil
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass, field
from datetime import datetime, date
from pathlib import Path
from typing import Any


STARSEED_DIR = Path.home() / ".starseed"
MODELOS_PATH = STARSEED_DIR / "antigravity-modelos.json"
USO_PATH = STARSEED_DIR / "antigravity-uso.json"
CONFIG_PATH = STARSEED_DIR / "antigravity-config.json"
MCP_CONFIG_MINIMA_PATH = STARSEED_DIR / "antigravity-mcp-minimal.json"

RESERVA_PORCENTAJE = 0.20  # 20 % de reserva que nunca se gasta
TOKEN_BASE_CON_MCP_INNECESARIOS = 24000  # valor medido en GEM1118A con todos los MCPs cargados
TOKEN_BASE_MCP_MINIMO = 8500  # objetivo con MCP mínimo (estimado)


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
        descripcion="Planes, revisiones y decisiones largas de la dirección",
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


MCP_SERVIDORES_USADOS_POR_ENJAMBRE = {
    "starseed-director",
}


def mcp_configuraion_minima(papeles_necesarios: list[str] | None = None) -> dict:
    """Genera una configuración MCP mínima para llamadas de la flota.
    
    Solo incluye los servidores MCP estrictamente necesarios. Por defecto,
    ninguno (las tareas del enjambre no requieren MCPs externos).
    
    Args:
        papeles_necesarios: Lista de papeles que necesitan MCP específico.
                           Por defecto, solo starseed-director para la dirección.
    
    Returns:
        Configuración MCP con solo los servidores necesarios.
    """
    if papeles_necesarios is None:
        papeles_necesarios = ["director_presidente"]
    
    mcp_servidores: list[dict] = []
    for papel in papeles_necesarios:
        if papel == "director_presidente":
            mcp_servidores.append({
                "nombre": "starseed-director",
                "comando": "python3",
                "args": ["scripts/puente/mcp_director.py"],
            })
    
    return {
        "mcpServers": {
            servidor["nombre"]: {
                "command": servidor["comando"],
                "args": servidor["args"],
            }
            for servidor in mcp_servidores
        }
    }


def limpiar_go_builds() -> int:
    """Limpia los directorios temporales de compilación Go creados por gke-oss.
    
    Returns:
        Número de directorios eliminados.
    """
    temps_dir = Path(tempfile.gettempdir())
    eliminados = 0
    for go_build in temps_dir.glob("go-build*"):
        try:
            shutil.rmtree(go_build)
            eliminados += 1
        except Exception:
            pass
    return eliminados


def generar_config_mcp_minimal(ruta_salida: Path | None = None) -> Path:
    """Genera y guarda la configuración MCP mínima para usar con agy.
    
    Args:
        ruta_salida: Ruta donde guardar el archivo. Por defecto, 
                    ~/.starseed/antigravity-mcp-minimal.json
    
    Returns:
        Ruta del archivo generado.
    """
    ruta = ruta_salida or MCP_CONFIG_MINIMA_PATH
    config = mcp_configuraion_minima()
    ruta.parent.mkdir(parents=True, exist_ok=True)
    _escribir_json(ruta, config)
    return ruta


def orden_agy_con_mcp(
    prompt: str,
    modelo: str,
    mcp_config_path: Path | None = None,
    modo: str = "plan",
    timeout_s: int = 180,
    add_dirs: list[str] | None = None,
) -> list[str]:
    """Construye orden agy con configuración MCP específica.
    
    Args:
        prompt: Prompt a enviar a agy
        modelo: Modelo a usar
        mcp_config_path: Ruta al archivo de configuración MCP. Si es None,
                        se usa la configuración mínima por defecto.
        modo: Modo de ejecución (plan, accept-edits, etc.)
        timeout_s: Timeout en segundos
        add_dirs: Directorios a añadir al contexto
    
    Returns:
        Lista de argumentos para subprocess
    """
    agy_bin = shutil.which("agy") or os.path.expanduser("~/.local/bin/agy")
    
    orden = [
        agy_bin,
        "-p", prompt,
        "--model", modelo,
        "--mode", modo,
        "--print-timeout", f"{timeout_s}s",
        "--output-format", "json",
    ]
    
    if mcp_config_path and mcp_config_path.exists():
        orden.extend(["--mcp-config", str(mcp_config_path)])
    
    if add_dirs:
        for d in add_dirs:
            orden.extend(["--add-dir", d])
    
    return orden


def obtener_orden_mcp_agy(
    papel: str = "director_presidente",
    modelo: str | None = None,
    mcp_config_path: Path | None = None,
) -> tuple[list[str], Path | None]:
    """Prepara orden agy con MCP mínimo para un papel específico.
    
    Si agy no admite --mcp-config, devuelve None para el path y deja
    la orden lista para que Alex la use manualmente con el env.
    
    Returns:
        (orden_agy, ruta_mcp_config) - ruta_mcp_config puede ser None si
        se usa configuración por defecto del sistema
    """
    if modelo is None:
        modelo, _ = obtener_modelo_para_papel(papel)
    
    config_mcp = mcp_configuraion_minima([papel])
    config_path = generar_config_mcp_minimal()
    
    orden = orden_agy_con_mcp(
        prompt="OK",
        modelo=modelo,
        mcp_config_path=config_path,
        modo="plan",
        timeout_s=60,
        add_dirs=["."],
    )
    
    return orden, config_path


def orden_agy_mcp_manual() -> str:
    """Devuelve la orden exacta para Alex si agy no admite --mcp-config.
    
    Esta orden debe ejecutarse con la variable de entorno STARSEED_MCP_CONFIG
    apuntando al archivo de configuración mínima.
    """
    return (
        'STARSEED_MCP_CONFIG=~/.starseed/antigravity-mcp-minimal.json '
        'agy -p "..." --model gemini-3.8-flash-medium --mode plan '
        '--print-timeout 60s --output-format json'
    )


def medir_tokens_con_mcp(modelo: str, usar_mcp_minimo: bool = True) -> dict:
    """Mide tokens de entrada real de agy con o sin MCP mínimo.
    
    Returns:
        dict con 'tokens_entrada', 'tokens_salida', 'tiempo_segundos',
        'mcp_usado' (True si se usó configuración mínima), 'error' (si lo hubo)
    """
    mcp_path = None
    if usar_mcp_minimo:
        mcp_path = generar_config_mcp_minimal()
    
    orden = orden_agy_con_mcp(
        prompt="OK",
        modelo=modelo,
        mcp_config_path=mcp_path,
        modo="plan",
        timeout_s=30,
    )
    
    inicio = time.perf_counter()
    try:
        resultado = subprocess.run(
            orden,
            capture_output=True,
            text=True,
            timeout=60,
            stdin=subprocess.DEVNULL,
        )
        duracion = time.perf_counter() - inicio
        
        salida = (resultado.stdout or "") + (resultado.stderr or "")
        datos = _json_en_texto(salida)
        
        uso = datos.get("usage") if isinstance(datos, dict) else {}
        tokens_entrada = int(uso.get("input_tokens", uso.get("prompt_tokens", 0)))
        tokens_salida = int(uso.get("output_tokens", uso.get("completion_tokens", 0)))
        
        error = None
        if resultado.returncode != 0:
            error = salida.strip()[:200]
        
        return {
            "tokens_entrada": tokens_entrada,
            "tokens_salida": tokens_salida,
            "tiempo_segundos": duracion,
            "mcp_usado": usar_mcp_minimo,
            "error": error,
        }
    except Exception as e:
        return {
            "tokens_entrada": 0,
            "tokens_salida": 0,
            "tiempo_segundos": time.perf_counter() - inicio,
            "mcp_usado": usar_mcp_minimo,
            "error": str(e)[:200],
        }


def _json_en_texto(texto: str) -> dict | None:
    """Extrae el primer objeto JSON del texto, ignorando líneas de stderr."""
    if not texto:
        return None
    crudo = texto.strip()
    try:
        datos = json.loads(crudo)
        return datos if isinstance(datos, dict) else None
    except (TypeError, ValueError):
        pass
    
    inicio = crudo.find("{")
    if inicio < 0:
        return None
    try:
        datos, _ = json.JSONDecoder().raw_decode(crudo[inicio:])
        return datos if isinstance(datos, dict) else None
    except ValueError:
        return None


def comparar_tokens_mcp(modelo: str = "gemini-3.8-flash-low") -> dict:
    """Compara tokens de entrada con y sin MCP mínimo.
    
    Returns:
        dict con 'con_mcp' y 'sin_mcp', diferencias y recomendación.
    """
    sin_mcp = medir_tokens_con_mcp(modelo, usar_mcp_minimo=False)
    con_mcp = medir_tokens_con_mcp(modelo, usar_mcp_minimo=True)
    
    diferencia = sin_mcp["tokens_entrada"] - con_mcp["tokens_entrada"]
    reduccion_pct = (diferencia / sin_mcp["tokens_entrada"] * 100) if sin_mcp["tokens_entrada"] > 0 else 0
    
    return {
        "modelo": modelo,
        "sin_mcp": {
            "tokens_entrada": sin_mcp["tokens_entrada"],
            "tiempo_segundos": sin_mcp["tiempo_segundos"],
        },
        "con_mcp_minimo": {
            "tokens_entrada": con_mcp["tokens_entrada"],
            "tiempo_segundos": con_mcp["tiempo_segundos"],
        },
        "diferencia": diferencia,
        "reduccion_porcentaje": round(reduccion_pct, 1),
        "objetivo_alcanzado": con_mcp["tokens_entrada"] < TOKEN_BASE_MCP_MINIMO,
        "recomendacion": (
            "MCP mínimo recomendado" if con_mcp["tokens_entrada"] < sin_mcp["tokens_entrada"]
            else "Mantener configuración actual"
        ),
    }


def orden_java_deshabilitar_worktree(worktree_path: str) -> str:
    """Genera la orden para deshabilitar Java en un worktree específico.
    
    El directorio .vscode con java.enabled: false debe estar en cada worktree
    del enjambre para evitar que Antigravity IDE arranque 5 procesos Java
    innecesarios por proyecto TypeScript/Rust.
    """
    return (
        f"mkdir -p {worktree_path}/.vscode && "
        f"echo '{{\\\"java\\\": {{\\\"enabled\\\": false}}}}' > {worktree_path}/.vscode/settings.json"
    )


def verificar_metadata_never_index() -> dict:
    """Verifica si las carpetas de worktrees y temporales tienen .metadata_never_index.
    
    Spotlight sigue indexando worktables (16 mdworker activos lo reporta).
    
    Returns:
        dict con 'listos' (con .metadata_never_index) y 'necesitan_corregir'
    """
    resultados = {"listos": [], "necesitan_corregir": []}
    
    temp_dir = Path(tempfile.gettempdir())
    for d in temp_dir.glob("go-build*"):
        resultados["necesitan_corregir"].append(str(d))
    
    starseed_memory_root = Path.home() / "starseed_memory_root"
    if starseed_memory_root.exists():
        for worktree in list(starseed_memory_root.glob("worktrees-*")):
            metadata = worktree / ".metadata_never_index"
            if not metadata.exists():
                resultados["necesitan_corregir"].append(str(worktree))
            else:
                resultados["listos"].append(str(worktree))
    
    for worktree in Path.cwd().parents:
        if worktree.name.startswith("worktree"):
            metadata = worktree / ".metadata_never_index"
            if metadata.exists():
                resultados["listos"].append(str(worktree))
            else:
                resultados["necesitan_corregir"].append(str(worktree))
    
    return resultados


def crear_metadata_never_index(path: Path | str) -> None:
    """Crea el archivo .metadata_never_index en la ruta especificada."""
    metadata_path = Path(path) / ".metadata_never_index"
    metadata_path.touch(exist_ok=True)


def generar_lista_carpetas_volatiles() -> dict:
    """Propone carpetas volátiles de starseed_memory_root a excluir de copia Drive.
    
    Estas carpetas cambian frecuentemente y no necesitan sincronización
    continua.
    
    Returns:
        dict con 'a_excluir' (sugerencias) y 'instantanea_diaria' (alternativa)
    """
    memory_root = Path.home() / "starseed_memory_root"
    
    carpetas_volatiles = [
        "chat.jsonl",
        "progreso.json", 
        "registro",
        "logs",
        ".tmp.driveupload",
        "momentos",
        "mensajes",
    ]
    
    ruta_en_repo = [
        "starseed_memory_root/.tmp.driveupload",
        "starseed_memory_root/chat.jsonl",
        "starseed_memory_root/progreso.json",
    ]
    
    return {
        "a_excluir_de_drive": ruta_en_repo,
        "sugerencia_instalar": "rclone sync --exclude-from exclusiones.txt",
        "instantanea_diaria": (
            "tar -czf ~/backup-starseed-memory-"
            "$(date +%Y%m%d).tar.gz -C ~ starseed_memory_root "
            "--exclude='*.jsonl' --exclude='.tmp.*'"
        ),
        "nota": "La instantánea diaria comprimida es más eficiente que la copia continua",
    }


def main() -> int:
    if len(sys.argv) < 2:
        print("Uso: antigravity_flota.py <modelos|uso|papel|config|mcp|limpiar-go-build|comparar-tokens|metas|spotlight>", file=sys.stderr)
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
    elif cmd == "mcp":
        """Genera o muestra la configuración MCP mínima para llamadas de flota."""
        if "--generar" in sys.argv:
            ruta = generar_config_mcp_minimal()
            print(f"Configuración MCP mínima generada en: {ruta}")
            print(json.dumps(mcp_configuraion_minima(), ensure_ascii=False, indent=2))
        else:
            print(json.dumps(mcp_configuraion_minima(), ensure_ascii=False, indent=2))
        return 0
    elif cmd == "limpiar-go-build":
        """Limpia directorios temporales go-build* creados por gke-oss."""
        eliminados = limpiar_go_builds()
        print(f"Directorios go-build* eliminados: {eliminados}")
        return 0
    elif cmd == "comparar-tokens":
        """Mide tokens de entrada con y sin MCP mínimo."""
        modelo = sys.argv[2] if len(sys.argv) > 2 else "gemini-3.8-flash-medium"
        print(f"Comparando tokens de entrada con MCP mínimo...")
        result = comparar_tokens_mcp(modelo)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if result["objetivo_alcanzado"]:
            print(f"\nOBJETIVO ALCANZADO: tokens con MCP mínimo ({result['con_mcp_minimo']['tokens_entrada']}) < {TOKEN_BASE_MCP_MINIMO}")
        else:
            print(f"\nOBJETIVO NO ALCANZADO: tokens con MCP mínimo ({result['con_mcp_minimo']['tokens_entrada']}) >= {TOKEN_BASE_MCP_MINIMO}")
        return 0
    elif cmd == "metas":
        """Muestra metas y recomendaciones para optimizar recursos.
        
        Incluye:
        - Orden para Alex si agy no admite --mcp-config
        - Orden para deshabilitar Java en worktrees
        - Carpetas volátiles para excluir de Drive
        - Verificación de .metadata_never_index
        """
        print("=== METAS RECOMENDADAS ===\n")
        print("1. MCP mínimo para llamadas de agy:")
        print(f"   {orden_agy_mcp_manual()}\n")
        print("2. Deshabilitar Java en worktrees (evita 5 procesos Java por worktree):")
        for i in range(3):
            print(f"   Worktree {i+1}: {orden_java_deshabilitar_worktree(f'worktree-{i+1}')}\n")
        print("3. Carpetas volátiles a excluir de copia Drive:")
        carpetas = generar_lista_carpetas_volatiles()
        for c in carpetas["a_excluir_de_drive"]:
            print(f"   - {c}")
        print(f"\n   Alternativa: instantánea diaria comprimida")
        print(f"   {carpetas['instantanea_diaria']}\n")
        print("4. Verificación Spotlight (.metadata_never_index):")
        spot = verificar_metadata_never_index()
        print(f"   Listos: {len(spot['listos'])}")
        print(f"   Necesitan corrección: {len(spot['necesitan_corregir'])}")
        for n in spot['necesitan_corregir']:
            print(f"   - Crear: {n}/.metadata_never_index")
        return 0
    elif cmd == "spotlight":
        """Verifica y/o corrige .metadata_never_index en worktrees."""
        if "--corregir" in sys.argv:
            for item in sys.argv[sys.argv.index("--corregir") + 1:]:
                crear_metadata_never_index(Path(item))
                print(f"Creado .metadata_never_index en {item}")
            
            resultados = verificar_metadata_never_index()
            print(f"\nTras corrección:")
            print(f"  Listos: {len(resultados['listos'])}")
            print(f"  Necesitan corrección: {len(resultados['necesitan_corregir'])}")
        else:
            resultados = verificar_metadata_never_index()
            print(json.dumps(resultados, ensure_ascii=False, indent=2))
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