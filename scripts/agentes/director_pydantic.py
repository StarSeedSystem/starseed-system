# -*- coding: utf-8 -*-
"""Director tipado de ejemplo (AGF1023C): decisión validada por tarea bloqueada.

Recibe la ficha de una tarea que no avanza y devuelve una ``DecisionTarea`` (prioridad
0–1, motivo ≤ 200 caracteres, acción reintentar/transformar/pedir-a-alex). El modelo
sale SIEMPRE del enrutador propio de AGF1023B (gratis primero), nunca de una nube del
autor del motor, y las trazas de terceros se apagan. Sin red en las pruebas.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Any, Literal, Mapping

ACCIONES = ("reintentar", "transformar", "pedir-a-alex")
MAX_MOTIVO, MAX_TEXTO = 200, 500
SISTEMA = (
    "Eres el director de una tarea bloqueada del enjambre de StarSeed OS. Decide una sola acción: "
    "reintentar (fallo pasajero), transformar (cambiar enfoque o reducir alcance) o pedir-a-alex "
    "(hace falta decidir a mano). Prioridad 0–1; motivo ≤ 200 caracteres. Español, sin rodeos."
)
_VALIDACION = None
@dataclass(frozen=True)
class DecisionTarea:
    """Decisión ya validada: es la salida del director y no admite sorpresas."""
    prioridad: float
    motivo: str
    accion: Literal["reintentar", "transformar", "pedir-a-alex"]

    def __post_init__(self) -> None:
        p = self.prioridad
        if isinstance(p, bool) or not isinstance(p, (int, float)) or not 0.0 <= float(p) <= 1.0:
            raise ValueError("la prioridad tiene que ser un número entre 0 y 1")
        motivo = self.motivo.strip() if isinstance(self.motivo, str) else ""
        if not 1 <= len(motivo) <= MAX_MOTIVO:
            raise ValueError(f"el motivo tiene que tener entre 1 y {MAX_MOTIVO} caracteres")
        if self.accion not in ACCIONES:
            raise ValueError("la acción tiene que ser reintentar, transformar o pedir-a-alex")
        object.__setattr__(self, "prioridad", float(p))
        object.__setattr__(self, "motivo", motivo)

    def como_dict(self) -> dict[str, object]:
        return {"prioridad": self.prioridad, "motivo": self.motivo, "accion": self.accion}

def _texto(valor: object) -> str:
    return valor if isinstance(valor, str) else ("" if valor is None else str(valor))

def construir_indicacion(tarea: Mapping[str, object] | str) -> str:
    if isinstance(tarea, str):
        return "Tarea bloqueada:\n" + tarea.strip()[:MAX_TEXTO * 4]
    datos = dict(tarea or {})
    lineas = ["Tarea bloqueada del enjambre. Decide la siguiente acción.",
              "Acciones posibles: reintentar · transformar · pedir-a-alex."]
    etiquetas = (("id", "Id"), ("titulo", "Título"), ("area", "Área"),
                 ("motivo", "Motivo del bloqueo"), ("intentos", "Intentos"),
                 ("ultimo_error", "Último error"), ("dependencias", "Dependencias"))
    for clave, etiqueta in etiquetas:
        valor = _texto(datos.get(clave)).strip()
        if valor:
            lineas.append(f"{etiqueta}: {valor[:MAX_TEXTO]}")
    return "\n".join(lineas)

def a_decision(salida: object) -> DecisionTarea:
    if isinstance(salida, DecisionTarea):
        return salida
    if hasattr(salida, "model_dump"):
        salida = salida.model_dump()
    if isinstance(salida, Mapping):
        return DecisionTarea(salida.get("prioridad"), _texto(salida.get("motivo")),
                             _texto(salida.get("accion")).strip())
    return DecisionTarea(getattr(salida, "prioridad", None),
                         _texto(getattr(salida, "motivo", None)),
                         _texto(getattr(salida, "accion", None)).strip())

def modelo_de_validacion() -> Any:
    global _VALIDACION
    if _VALIDACION is None:
        from pydantic import BaseModel, Field
        class _Decision(BaseModel):
            prioridad: float = Field(ge=0.0, le=1.0)
            motivo: str = Field(min_length=1, max_length=MAX_MOTIVO)
            accion: Literal["reintentar", "transformar", "pedir-a-alex"]
        _VALIDACION = _Decision
    return _VALIDACION

def modelo_desde_cliente(cliente: Any) -> Any:
    from pydantic_ai.providers.openai import OpenAIProvider
    try:
        from pydantic_ai.models.openai import OpenAIChatModel as _Modelo
    except ImportError:
        from pydantic_ai.models.openai import OpenAIModel as _Modelo
    return _Modelo(cliente.modelo, provider=OpenAIProvider(
        base_url=cliente.base_url, api_key=cliente.clave or "starseed-sin-clave"))

def modelo_del_enrutador(capacidad: str = "decision", **puente: Any) -> Any | None:
    try:  # admite ``scripts.agentes.director_pydantic`` y el import plano
        from . import modelos_propios
    except ImportError:
        import modelos_propios  # type: ignore[no-redef]
    cliente = modelos_propios.cliente_openai_compatible(capacidad, **puente)
    return modelo_desde_cliente(cliente) if cliente else None

def crear_agente(modelo: Any) -> Any:
    from pydantic_ai import Agent
    agente = Agent(modelo, output_type=modelo_de_validacion(), system_prompt=SISTEMA,
                   retries=2)
    agente.instrument = False  # trazas de terceros apagadas
    return agente

def decidir_tarea(tarea: Mapping[str, object] | str, *, agente: Any | None = None,
                  modelo: Any | None = None) -> DecisionTarea:
    if agente is None:
        modelo = modelo if modelo is not None else modelo_del_enrutador()
        if modelo is None:
            raise RuntimeError("el enrutador propio no tiene ninguna fuente disponible")
        agente = crear_agente(modelo)
    resultado = agente.run_sync(construir_indicacion(tarea))
    salida = getattr(resultado, "output", None)
    if salida is None:
        salida = getattr(resultado, "data", None)
    return a_decision(salida)
