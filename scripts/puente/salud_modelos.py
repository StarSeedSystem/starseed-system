#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Salud de modelos (AUT1121D): cuarentena común y orden por tasa de éxito real por tipo de tarea.

1) Cuarentena COMÚN: un modelo colgado o saturado 3 veces en una hora se salta 2 h para todos;
   vuelve con una sonda barata (petición mínima de 16 tokens).
2) Orden de modelos por tasa de éxito real por tipo de tarea (interfaz, puente en Python,
   Rust/nativo, pruebas, textos), medida de eventos.jsonl y de las puertas (tsc/vitest).

Módulo PURO: recibe eventos y catálogo, no lee disco ni red, no imprime valores de clave.
"""

from __future__ import annotations

import json
import os
import tempfile
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

# ─── Constantes ──────────────────────────────────────────────────────────────
CUARENTENA_VENTANA_S = 3600          # 1 hora: ventana para contar 3 colgados/saturados
CUARENTENA_DURACION_S = 7200         # 2 horas: tiempo que el modelo queda en cuarentena
UMBRAL_COLGADOS = 3                  # 3 eventos en la ventana → cuarentena
SONDA_TOKENS = 16                    # tokens de la sonda barata para verificar recuperación

# Tipos de tarea reconocidos (claves estables)
TIPOS_TAREA = (
    "interfaz",
    "puente",
    "rust",
    "pruebas",
    "textos",
    "general",
)

# Eventos que cuentan como «colgado» o «saturado»
EVENTOS_CUARENTENA = {"estancado", "proveedor_caido", "saturada"}


@dataclass
class EstadisticasModelo:
    """Estadísticas agregadas de un modelo por tipo de tarea."""
    exitos: int = 0
    fallos: int = 0
    segundos_promedio: float = 0.0
    # Fallos por puerta
    fallos_tsc: int = 0
    fallos_vitest: int = 0
    # Eventos de cuarentena en la ventana actual
    eventos_cuarentena: list[float] = field(default_factory=list)
    # Timestamp de entrada en cuarentena (epoch seconds)
    en_cuarentena_desde: float | None = None
    # Timestamp de última sonda
    ultima_sonda: float | None = None

    @property
    def total(self) -> int:
        return self.exitos + self.fallos

    @property
    def tasa_exito(self) -> float:
        if self.total == 0:
            return 0.5  # prior neutro
        return self.exitos / self.total

    @property
    def en_cuarentena(self) -> bool:
        return self.en_cuarentena_desde is not None

    def registrar_exito(self, segundos: float) -> None:
        self.exitos += 1
        self._actualizar_promedio(segundos)

    def registrar_fallo(self, puerta: str | None = None) -> None:
        self.fallos += 1
        if puerta == "tsc":
            self.fallos_tsc += 1
        elif puerta == "vitest":
            self.fallos_vitest += 1

    def _actualizar_promedio(self, segundos: float) -> None:
        n = self.exitos
        self.segundos_promedio = round(
            (self.segundos_promedio * (n - 1) + max(0.0, segundos)) / n, 3
        )

    def registrar_evento_cuarentena(self, ahora: float) -> None:
        """Registra un evento que cuenta para cuarentena y limpia la ventana."""
        self.eventos_cuarentena.append(ahora)
        self._limpiar_ventana(ahora)

    def _limpiar_ventana(self, ahora: float) -> None:
        """Elimina eventos fuera de la ventana de 1 hora."""
        corte = ahora - CUARENTENA_VENTANA_S
        self.eventos_cuarentena = [t for t in self.eventos_cuarentena if t >= corte]

    def debe_entrar_cuarentena(self, ahora: float) -> bool:
        """True si tiene ≥ UMBRAL_COLGADOS eventos en la ventana y no está ya en cuarentena."""
        if self.en_cuarentena:
            return False
        self._limpiar_ventana(ahora)
        return len(self.eventos_cuarentena) >= UMBRAL_COLGADOS

    def entrar_cuarentena(self, ahora: float) -> None:
        self.en_cuarentena_desde = ahora
        self.ultima_sonda = None

    def puede_salir_cuarentena(self, ahora: float) -> bool:
        """True si han pasado 2 horas desde la entrada en cuarentena."""
        if not self.en_cuarentena:
            return True
        return ahora - self.en_cuarentena_desde >= CUARENTENA_DURACION_S

    def salir_cuarentena(self, ahora: float) -> None:
        self.en_cuarentena_desde = None
        self.ultima_sonda = ahora
        self.eventos_cuarentena.clear()

    def registrar_sonda(self, ahora: float) -> None:
        self.ultima_sonda = ahora


@dataclass
class EstadoSaludModelos:
    """Estado global de salud de modelos por tipo de tarea."""
    por_tipo: dict[str, dict[str, EstadisticasModelo]] = field(default_factory=dict)
    # Modelo → timestamp de última vez que se usó (para desempate por recencia)
    ultima_vez_usado: dict[str, float] = field(default_factory=dict)

    def __post_init__(self):
        for tipo in TIPOS_TAREA:
            self.por_tipo.setdefault(tipo, {})

    def get_modelo(self, tipo: str, modelo: str) -> EstadisticasModelo:
        return self.por_tipo[tipo].setdefault(modelo, EstadisticasModelo())

    def registrar_uso(self, modelo: str, ahora: float) -> None:
        self.ultima_vez_usado[modelo] = ahora


# ─── Funciones puras de procesamiento de eventos ─────────────────────────────

def _extraer_modelo_de_evento(evento: dict[str, Any]) -> str | None:
    """Extrae el identificador del modelo desde un evento del orquestador."""
    datos = evento.get("datos") or {}
    # El orquestador registra el modelo en varios campos posibles
    for clave in ("modelo", "model", "motor", "proveedor"):
        if clave in datos and datos[clave]:
            return str(datos[clave])
    # Fallback: buscar en texto
    texto = evento.get("texto", "")
    for prefijo in ("nim/", "openrouter/", "xkiro/", "aihubmix/", "tokenrouter/", "gemini/", "llm7/", "ollama/", "freellmapi/"):
        if prefijo in texto:
            # Extraer modelo completo
            inicio = texto.find(prefijo)
            fin = inicio
            while fin < len(texto) and texto[fin] not in (" ", "\n", "\t", ",", ")", "]"):
                fin += 1
            return texto[inicio:fin]
    return None


def _extraer_tipo_tarea(evento: dict[str, Any]) -> str:
    """Determina el tipo de tarea desde el evento."""
    datos = evento.get("datos") or {}
    if "area" in datos:
        area = str(datos["area"]).lower()
        if area in TIPOS_TAREA:
            return area
    # Inferir desde archivos o título
    tarea_id = evento.get("tarea", "")
    if not tarea_id:
        return "general"
    # Buscar en el texto del evento
    texto = (evento.get("texto", "") + " " + str(datos.get("archivos", ""))).lower()
    if any(k in texto for k in ("component", "page.tsx", "layout.tsx", ".css", "interfaz", "ui")):
        return "interfaz"
    if any(k in texto for k in ("scripts/", ".py", "puente", "orquest")):
        return "puente"
    if any(k in texto for k in (".rs", "rust", "cargo", "nativo")):
        return "rust"
    if any(k in texto for k in ("test", "spec", "vitest", "pytest", "prueba")):
        return "pruebas"
    if any(k in texto for k in (".md", "docs/", "document", "texto", "markdown")):
        return "textos"
    return "general"


def _parsear_timestamp(ts: str | float | None) -> float:
    """Convierte timestamp del evento a epoch seconds."""
    if ts is None:
        return time.time()
    if isinstance(ts, (int, float)):
        return float(ts)
    if isinstance(ts, str):
        # Formato orquestador: "YYYY-MM-DD HH:MM:SS"
        if len(ts) == 19 and ts[10] == " ":
            from datetime import datetime
            return datetime.strptime(ts, "%Y-%m-%d %H:%M:%S").timestamp()
        # ISO 8601
        try:
            from datetime import datetime
            return datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()
        except Exception:
            pass
    return time.time()


def procesar_eventos(
    eventos: list[dict[str, Any]],
    estado: EstadoSaludModelos | None = None,
) -> EstadoSaludModelos:
    """Procesa una lista de eventos y actualiza el estado de salud.

    Args:
        eventos: Lista de eventos (como los de eventos.jsonl).
        estado: Estado previo o None para crear uno nuevo.

    Returns:
        EstadoSaludModelos actualizado.
    """
    if estado is None:
        estado = EstadoSaludModelos()

    ahora = time.time()

    for ev in eventos:
        tipo_ev = ev.get("tipo")
        if not tipo_ev:
            continue

        modelo = _extraer_modelo_de_evento(ev)
        if not modelo:
            continue

        tipo_tarea = _extraer_tipo_tarea(ev)
        stats = estado.get_modelo(tipo_tarea, modelo)
        ts = _parsear_timestamp(ev.get("t"))
        estado.registrar_uso(modelo, ts)

        # Eventos de éxito (commit, verificado)
        if tipo_ev in ("commit", "verificado"):
            # Estimar duración: buscar en datos o usar 0
            segundos = float(ev.get("datos", {}).get("duracion_s", 0) or 0)
            stats.registrar_exito(segundos)

        # Eventos de fallo en puertas
        elif tipo_ev in ("verificacion_fallida", "fallo"):
            puerta = ev.get("datos", {}).get("puerta")
            stats.registrar_fallo(puerta)

        # Eventos que cuentan para cuarentena
        elif tipo_ev in EVENTOS_CUARENTENA:
            stats.registrar_evento_cuarentena(ts)

        # Latidos: actualizar estado de cuarentena
        elif tipo_ev == "latido":
            if stats.en_cuarentena and stats.puede_salir_cuarentena(ts):
                stats.salir_cuarentena(ts)

    return estado


# ─── Cuarentena y ordenación ─────────────────────────────────────────────────

def modelos_en_cuarentena(estado: EstadoSaludModelos, ahora: float | None = None) -> list[str]:
    """Devuelve la lista de modelos que están actualmente en cuarentena (global)."""
    ahora = ahora or time.time()
    en_cuarentena = set()
    for tipo in TIPOS_TAREA:
        for modelo, stats in estado.por_tipo.get(tipo, {}).items():
            if stats.en_cuarentena and not stats.puede_salir_cuarentena(ahora):
                en_cuarentena.add(modelo)
    return sorted(en_cuarentena)


def modelo_disponible(modelo: str, estado: EstadoSaludModelos, ahora: float | None = None) -> bool:
    """True si el modelo NO está en cuarentena en ningún tipo de tarea."""
    return modelo not in modelos_en_cuarentena(estado, ahora)


def _puntuacion_orden(modelo: str, stats: EstadisticasModelo, ahora: float) -> float:
    """Calcula la puntuación de ordenación para un modelo en un tipo de tarea.

    Prioridad:
    1. Modelos en cuarentena → -inf (se excluyen antes)
    2. Tasa de éxito (0-100)
    3. Menos fallos de tsc/vitest (penalización)
    4. Rapidez (segundos_promedio inverso, máx 20 pts)
    5. Experiencia (log2(total+1)*5, máx 20 pts)
    6. Recencia de uso (desempate)
    """
    if stats.en_cuarentena and not stats.puede_salir_cuarentena(ahora):
        return float("-inf")

    base = stats.tasa_exito * 100.0

    # Penalizar fallos de puertas
    penalty = (stats.fallos_tsc + stats.fallos_vitest) * 5.0

    # Rapidez
    rapidez = 20.0 / (1.0 + stats.segundos_promedio / 300.0) if stats.segundos_promedio else 10.0

    # Experiencia
    experiencia = min(20.0, __import__("math").log2(stats.total + 1) * 5.0)

    # Recencia (últimos 30 min = 1800s)
    ultima = stats.ultima_sonda or 0
    recencia = max(0.0, 5.0 * (1.0 - (ahora - ultima) / 1800.0)) if ultima else 0.0

    return round(base - penalty + rapidez + experiencia + recencia, 6)


def ordenar_modelos_por_tarea(
    tipo: str,
    estado: EstadoSaludModelos,
    candidatos: list[str] | None = None,
    ahora: float | None = None,
) -> list[str]:
    """Devuelve modelos ordenados por mejor tasa de éxito real para un tipo de tarea.

    Args:
        tipo: Tipo de tarea (interfaz, puente, rust, pruebas, textos, general).
        estado: EstadoSaludModelos con las estadísticas.
        candidatos: Lista opcional de modelos a ordenar (si None, usa todos conocidos).
        ahora: Timestamp actual (epoch seconds).

    Returns:
        Lista de modelos ordenados de mejor a peor.
    """
    ahora = ahora or time.time()
    tipo = tipo.lower()
    if tipo not in TIPOS_TAREA:
        tipo = "general"

    modelos_tipo = estado.por_tipo.get(tipo, {})
    if not modelos_tipo:
        return candidatos or []

    if candidatos is None:
        candidatos = list(modelos_tipo.keys())

    puntuados = []
    for modelo in candidatos:
        if modelo not in modelos_tipo:
            continue
        stats = modelos_tipo[modelo]
        if stats.en_cuarentena and not stats.puede_salir_cuarentena(ahora):
            continue  # excluir modelos en cuarentena
        score = _puntuacion_orden(modelo, stats, ahora)
        if score > float("-inf"):
            puntuados.append((score, modelo))

    # Desempate estable: mayor score, luego más reciente, luego nombre
    puntuados.sort(key=lambda x: (-x[0], -estado.ultima_vez_usado.get(x[1], 0), x[1]))
    return [m for _, m in puntuados]


def siguiente_sonda_cuarentena(
    estado: EstadoSaludModelos,
    ahora: float | None = None,
) -> list[tuple[str, str]]:
    """Modelos que pueden salir de cuarentena y necesitan sonda.

    Returns:
        Lista de (modelo, tipo_tarea) listos para sonda.
    """
    ahora = ahora or time.time()
    sondas = []
    for tipo in TIPOS_TAREA:
        for modelo, stats in estado.por_tipo.get(tipo, {}).items():
            if stats.en_cuarentena and stats.puede_salir_cuarentena(ahora):
                sondas.append((modelo, tipo))
    return sondas


def registrar_sonda_exitosa(
    estado: EstadoSaludModelos,
    modelo: str,
    tipo: str,
    ahora: float | None = None,
) -> None:
    """Marca que la sonda fue exitosa y saca al modelo de cuarentena."""
    ahora = ahora or time.time()
    stats = estado.get_modelo(tipo, modelo)
    stats.salir_cuarentena(ahora)
    stats.registrar_sonda(ahora)


def registrar_sonda_fallida(
    estado: EstadoSaludModelos,
    modelo: str,
    tipo: str,
    ahora: float | None = None,
) -> None:
    """Marca sonda fallida: el modelo vuelve a cuarentena por otras 2h."""
    ahora = ahora or time.time()
    stats = estado.get_modelo(tipo, modelo)
    stats.entrar_cuarentena(ahora)


def resumen_salud(estado: EstadoSaludModelos, ahora: float | None = None) -> dict[str, Any]:
    """Resumen legible para el panel de Genesis / síntesis diaria."""
    ahora = ahora or time.time()
    cuare = modelos_en_cuarentena(estado, ahora)
    por_tipo_resumen = {}
    for tipo in TIPOS_TAREA:
        modelos = []
        for modelo, stats in sorted(estado.por_tipo.get(tipo, {}).items(),
                                    key=lambda x: -x[1].tasa_exito):
            if stats.total == 0:
                continue
            modelos.append({
                "modelo": modelo,
                "tasa_exito": round(stats.tasa_exito * 100, 1),
                "total": stats.total,
                "fallos_tsc": stats.fallos_tsc,
                "fallos_vitest": stats.fallos_vitest,
                "segundos_promedio": stats.segundos_promedio,
                "en_cuarentena": stats.en_cuarentena and not stats.puede_salir_cuarentena(ahora),
            })
        if modelos:
            por_tipo_resumen[tipo] = modelos[:10]  # top 10
    return {
        "timestamp": ahora,
        "modelos_en_cuarentena": cuare,
        "por_tipo": por_tipo_resumen,
    }


# ─── CLI ─────────────────────────────────────────────────────────────────────

def main(argv: list[str] | None = None) -> int:
    import json
    import sys

    argv = argv or sys.argv[1:]
    if not argv or argv[0] in ("-h", "--help", "--ayuda"):
        print(
            "Uso: python3 salud_modelos.py <comando>\n"
            "Comandos:\n"
            "  procesar <archivo_eventos.jsonl> [--estado estado.json]  Procesa eventos y guarda estado\n"
            "  ordenar <tipo> [--estado estado.json] [--modelos m1,m2]  Ordena modelos por tipo\n"
            "  cuarentena [--estado estado.json]                          Lista modelos en cuarentena\n"
            "  resumen [--estado estado.json]                             Resumen completo\n"
            "  sonda [--estado estado.json]                               Modelos listos para sonda"
        )
        return 0

    cmd = argv[0]

    # Cargar estado previo si existe
    estado_file = "starseed_memory_root/salud/modelos.json"
    for i, arg in enumerate(argv):
        if arg == "--estado" and i + 1 < len(argv):
            estado_file = argv[i + 1]

    estado = EstadoSaludModelos()
    import os
    if os.path.exists(estado_file):
        try:
            with open(estado_file, encoding="utf-8") as f:
                data = json.load(f)
            # Reconstruir estado (simplificado)
            for tipo, modelos in data.get("por_tipo", {}).items():
                for modelo, stats_data in modelos.items():
                    stats = estado.get_modelo(tipo, modelo)
                    stats.exitos = stats_data.get("exitos", 0)
                    stats.fallos = stats_data.get("fallos", 0)
                    stats.segundos_promedio = stats_data.get("segundos_promedio", 0.0)
                    stats.fallos_tsc = stats_data.get("fallos_tsc", 0)
                    stats.fallos_vitest = stats_data.get("fallos_vitest", 0)
                    stats.eventos_cuarentena = stats_data.get("eventos_cuarentena", [])
                    stats.en_cuarentena_desde = stats_data.get("en_cuarentena_desde")
                    stats.ultima_sonda = stats_data.get("ultima_sonda")
            estado.ultima_vez_usado = data.get("ultima_vez_usado", {})
        except Exception:
            pass

    if cmd == "procesar":
        if len(argv) < 2:
            print("Falta archivo de eventos", file=sys.stderr)
            return 2
        eventos_file = argv[1]
        eventos = []
        try:
            with open(eventos_file, encoding="utf-8") as f:
                for linea in f:
                    linea = linea.strip()
                    if linea:
                        eventos.append(json.loads(linea))
        except Exception as e:
            print(f"Error leyendo eventos: {e}", file=sys.stderr)
            return 1
        estado = procesar_eventos(eventos, estado)
        # Guardar
        os.makedirs(os.path.dirname(estado_file), exist_ok=True)
        _guardar_estado(estado, estado_file)
        print(f"Procesados {len(eventos)} eventos → {estado_file}")
        return 0

    if cmd == "ordenar":
        if len(argv) < 2:
            print("Falta <tipo>", file=sys.stderr)
            return 2
        tipo = argv[1]
        modelos = None
        for i, arg in enumerate(argv):
            if arg == "--modelos" and i + 1 < len(argv):
                modelos = [m.strip() for m in argv[i + 1].split(",")]
        ordenados = ordenar_modelos_por_tarea(tipo, estado, modelos)
        print(json.dumps(ordenados, ensure_ascii=False))
        return 0

    if cmd == "cuarentena":
        cuare = modelos_en_cuarentena(estado)
        print(json.dumps(cuare, ensure_ascii=False))
        return 0

    if cmd == "resumen":
        print(json.dumps(resumen_salud(estado), ensure_ascii=False, indent=1))
        return 0

    if cmd == "sonda":
        sondas = siguiente_sonda_cuarentena(estado)
        print(json.dumps(sondas, ensure_ascii=False))
        return 0

    print(f"Comando desconocido: {cmd}", file=sys.stderr)
    return 2


def _guardar_estado(estado: EstadoSaludModelos, ruta: str) -> None:
    data = {
        "por_tipo": {},
        "ultima_vez_usado": estado.ultima_vez_usado,
    }
    for tipo, modelos in estado.por_tipo.items():
        data["por_tipo"][tipo] = {}
        for modelo, stats in modelos.items():
            data["por_tipo"][tipo][modelo] = {
                "exitos": stats.exitos,
                "fallos": stats.fallos,
                "segundos_promedio": stats.segundos_promedio,
                "fallos_tsc": stats.fallos_tsc,
                "fallos_vitest": stats.fallos_vitest,
                "eventos_cuarentena": stats.eventos_cuarentena,
                "en_cuarentena_desde": stats.en_cuarentena_desde,
                "ultima_sonda": stats.ultima_sonda,
            }
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(ruta), prefix=".tmp_")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=1)
            f.write("\n")
        os.replace(tmp, ruta)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


if __name__ == "__main__":
    import sys
    sys.exit(main())