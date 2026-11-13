# -*- coding: utf-8 -*-
"""Extracción de contactos públicos del README (ALC1113).
Solo canales que el proyecto PUBLICA. Nada de commits ni perfiles personales.
"""
from __future__ import annotations
import re

RE_MATRIX = re.compile(r"(?:matrix[:\s#@]|#)([\w.-]+:[\w.-]+)", re.I)
RE_DISCORD = re.compile(r"discord\.gg/([\w-]+)", re.I)
RE_ZULIP = re.compile(r"([\w-]+)\.zulipchat\.com", re.I)
RE_FORO = re.compile(r"(?:foro|forum)[:\s]*https?://([\w./-]+)", re.I)
RE_EMAIL_PUB = re.compile(r"(?:contacto|contact|email|correo)[:\s]*([\w.+-]+@[\w-]+(?:\.[\w-]+)+)", re.I)

def extraer_contactos_readme(readme: str, repo_full: str) -> list[dict]:
    """Extrae SOLO canales que el proyecto PUBLICA. Nada de commits ni perfiles."""
    contactos = []
    texto = readme or ""
    for m in RE_MATRIX.finditer(texto):
        contactos.append({"medio": "matrix", "valor": f"#{m.group(1)}", "fuente_url": f"https://github.com/{repo_full}#readme"})
    for m in RE_DISCORD.finditer(texto):
        contactos.append({"medio": "discord", "valor": f"https://discord.gg/{m.group(1)}", "fuente_url": f"https://github.com/{repo_full}#readme"})
    for m in RE_ZULIP.finditer(texto):
        contactos.append({"medio": "zulip", "valor": f"https://{m.group(1)}.zulipchat.com", "fuente_url": f"https://github.com/{repo_full}#readme"})
    for m in RE_FORO.finditer(texto):
        contactos.append({"medio": "foro", "valor": f"https://{m.group(1)}", "fuente_url": f"https://github.com/{repo_full}#readme"})
    for m in RE_EMAIL_PUB.finditer(texto):
        contactos.append({"medio": "email", "valor": m.group(1), "fuente_url": f"https://github.com/{repo_full}#readme"})
    contactos.append({"medio": "github_discussions", "valor": f"https://github.com/{repo_full}/discussions", "fuente_url": f"https://github.com/{repo_full}"})
    # Dedup por medio+valor
    vistos = set()
    unicos = []
    for c in contactos:
        key = (c["medio"], c["valor"])
        if key not in vistos:
            vistos.add(key)
            unicos.append(c)
    return unicos