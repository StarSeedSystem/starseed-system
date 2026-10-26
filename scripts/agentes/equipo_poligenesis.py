#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Equipo de PoliGenesis con traspasos (AGF1023D): moderador → redactor →
revisor con guarda de salida (sin datos personales), sobre OpenAI Agents SDK y el
cliente ``AsyncOpenAI`` del enrutador propio (AGF1023B), sin trazas de terceros.
"""
from __future__ import annotations

import asyncio
import re
import sys

try:
    from . import modelos_propios as enrutador
except ImportError:
    import modelos_propios as enrutador

PATRONES = {
    "correo": re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"),
    "telefono": re.compile(r"(?<!\d)(?:\+34[\s.-]?)?[6789]\d{2}[\s.-]?\d{3}[\s.-]?\d{3}(?!\d)"),
    "dni": re.compile(r"(?<![A-Za-z0-9])(?:\d{8}[A-Za-z]|[XYZxyz]\d{7}[A-Za-z])(?![A-Za-z0-9])"),
    "iban": re.compile(r"(?<![A-Za-z0-9])ES\d{2}(?:[\s-]?\d{4}){5}(?![A-Za-z0-9])"),
}
MARCA = "[dato personal]"
GUARDA = "No repitas correos, teléfonos, DNI/NIE, IBAN ni datos que identifiquen a una persona: descríbelos como «dato personal» y sigue."
INSTRUCCIONES = {
    "moderador": "Ordena la petición, fija tema y límites y traspasa al redactor con un encargo claro; no redactes la propuesta.",
    "redactor": "Redacta una propuesta breve, concreta y accionable del encargo; sin datos personales ni cifras inventadas.",
    "revisor": "Comprueba que la propuesta responde, no promete lo inexistente y no lleva datos personales. Devuelve la versión final en español. " + GUARDA,
}
TRASPASOS = {"moderador": ("redactor",), "redactor": ("revisor",), "revisor": ()}
ROLES = tuple(TRASPASOS)

def detectar_datos_personales(texto: object) -> list[str]:
    """Etiquetas de los datos hallados; nunca el valor. PURO."""
    limpio = str(texto or "")
    return [nombre for nombre, patron in PATRONES.items() if patron.search(limpio)]

def contiene_datos_personales(texto: object) -> bool:
    """True si el texto lleva algún dato personal reconocible. PURO."""
    return bool(detectar_datos_personales(texto))

def sanear_salida(texto: object) -> str:
    """Sustituye cada dato personal por una marca neutra. PURO."""
    for patron in PATRONES.values():
        texto = patron.sub(MARCA, str(texto or ""))
    return str(texto)

def guarda_salida(texto: object) -> dict:
    """Seguro, motivos y texto saneado. PURO."""
    motivos = detectar_datos_personales(texto)
    return {"seguro": not motivos, "motivos": motivos, "texto": sanear_salida(texto) if motivos else str(texto or "")}

def _sdk():
    """Módulos del SDK o un error claro si falta la dependencia."""
    try:
        import agents
        from openai import AsyncOpenAI
    except ImportError as exc:
        raise RuntimeError("Falta openai-agents: pip install openai-agents") from exc
    return agents, AsyncOpenAI

def construir_modelo(cliente=None):
    """Modelo del SDK contra el enrutador propio, con trazas apagadas."""
    agents, AsyncOpenAI = _sdk()
    agents.set_tracing_disabled(True)
    cliente = cliente or enrutador.cliente_openai_compatible("texto")
    if cliente is None:
        raise RuntimeError("El enrutador propio no tiene ninguna fuente disponible")
    return agents.OpenAIChatCompletionsModel(
        model=cliente.modelo, openai_client=AsyncOpenAI(
            base_url=cliente.base_url, api_key=cliente.clave or "sin-clave"))

def construir_equipo(modelo=None, *, sdk=None):
    """Moderador → redactor → revisor; la guarda vive en el revisor."""
    agents = sdk if sdk is not None else _sdk()[0]
    agents.set_tracing_disabled(True)
    modelo = modelo or construir_modelo()

    @agents.output_guardrail
    async def sin_datos(ctx, agente, salida):
        veredicto = guarda_salida(salida)
        return agents.GuardrailFunctionOutput(
            output_info={"motivos": veredicto["motivos"]}, tripwire_triggered=not veredicto["seguro"])

    revisor = agents.Agent(name="revisor", instructions=INSTRUCCIONES["revisor"],
                           model=modelo, output_guardrails=[sin_datos])
    redactor = agents.Agent(name="redactor", instructions=INSTRUCCIONES["redactor"],
                            model=modelo, handoffs=[revisor])
    return agents.Agent(name="moderador", instructions=INSTRUCCIONES["moderador"],
                        model=modelo, handoffs=[redactor])

async def ejecutar(mensaje: str, *, modelo=None, sdk=None):
    """Corre el equipo y devuelve la salida final saneada."""
    agents = sdk if sdk is not None else _sdk()[0]
    try:
        resultado = await agents.Runner.run(
            construir_equipo(modelo, sdk=agents), mensaje)
    except agents.OutputGuardrailTripwireTriggered:
        return "Propuesta bloqueada: contenía datos personales."
    return sanear_salida(resultado.final_output)

def main(argv=None) -> int:
    argumentos = list(argv if argv is not None else sys.argv[1:])
    if not argumentos:
        print('uso: equipo_poligenesis.py "<petición>"')
        return 2
    try:
        print(asyncio.run(ejecutar(" ".join(argumentos))))
    except RuntimeError as exc:
        print("equipo_poligenesis: " + str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
