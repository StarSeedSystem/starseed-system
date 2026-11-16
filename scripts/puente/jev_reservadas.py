# -*- coding: utf-8 -*-
"""JLA1116A · Decisiones que Jev y Laya nunca toman solos: la lista RESERVADAS como código.

Contrato: architecture/jev-entrena-laya.md §7. Módulo puro: sin red, sin disco, sin reloj.

La regla vigente (`decidir.py`, `autopublicar.py:628`) ya dice que Jev es consejero con
umbral: puede vetar, nunca convierte un «no» en «sí» y si calla manda la regla. Para lo
reservado ni eso: pueden vetar y avisar, nunca aprobar; lo decide una persona.
"""
from __future__ import annotations

import re

# Dominios (en kebab-case, forma canónica) que ni Jev ni Laya aprueban solos, con
# confianza alta o sin ella (jev-entrena-laya.md §7, «No lo decide Jev ni Laya solo»).
RESERVADAS = (
    "integrar-main",
    "publicar",
    "push",
    "desplegar",
    "borrar-datos",
    "bajar-privacidad",
    "gasto-sobre-techo",
    "claves-permisos",
    "migraciones",
    "funciona-verificacion",
    "informe-veraz",
    "cambiar-umbrales-propios",
)

# Por qué cada dominio es reservado: lo que ninguna decisión de un clasificador barato
# puede sustituir, aunque diga tener confianza alta. Texto para el aviso de veto.
MOTIVOS = {
    "integrar-main": "cambiar el código que todos usan se decide tras las puertas, con una persona delante",
    "publicar": "salir al mundo público necesita la palabra expresa de la persona, no de un modelo",
    "push": "enviar a un remoto es un acto irreversible sobre el repositorio compartido",
    "desplegar": "lanzar una versión toca el servicio vivo de todos, no solo el resultado local",
    "borrar-datos": "borrar cuentas o datos sin copia no se deshace: solo una persona responde a eso",
    "bajar-privacidad": "decidir qué es privado lo decide la persona; el detector falla aquí por medición",
    "gasto-sobre-techo": "el dinero y el crédito tienen techos fijados por la persona, no negociables por un modelo",
    "claves-permisos": "claves, permisos y reglas de acceso no pasan por ningún clasificador, jamás",
    "migraciones": "una migración cambia el esquema de datos de todos y solo se aplica aprobada",
    "funciona-verificacion": "que algo funciona lo verifican pruebas y localhost, no la opinión de un modelo barato",
    "informe-veraz": "que un informe sea verdadero no lo puede certificar quien lo generó",
    "cambiar-umbrales-propios": "el juez no se reajusta solo: sus umbrales y capas los cambia una persona",
}

# Normalización: minúsculas, espacios, tabulaciones y subrayados a guión, guiones
# repetidos colapsados y guiones de los bordes fuera. Con eso, «Integrar Main»,
# «BORRAR_datos» y « push » caen en la forma canónica de RESERVADAS.
_RE_ESPACIOS = re.compile(r"[\s_]+")
_RE_GUIONES = re.compile(r"-{2,}")


def normalizar_dominio(dominio: str) -> str:
    """Devuelve el dominio en forma canónica; vacío si no hay nada que normalizar."""
    texto = _RE_ESPACIOS.sub("-", str(dominio or "").strip().lower())
    texto = _RE_GUIONES.sub("-", texto)
    return texto.strip("-")


def exige_humano(dominio: str) -> bool:
    """True solo si el dominio (normalizado) está en RESERVADAS; desconocido -> False."""
    return normalizar_dominio(dominio) in RESERVADAS


def solo_puede_vetar(dominio: str) -> tuple[bool, str]:
    """(puede_vetar, motivo) para el dominio dado.

    Alias de `exige_humano` que dice por qué: en lo reservado devuelve True y el motivo
    de `MOTIVOS`; en un dominio normal o desconocido, (False, «»).
    """
    clave = normalizar_dominio(dominio)
    if clave in MOTIVOS:
        return True, MOTIVOS[clave]
    return False, ""
