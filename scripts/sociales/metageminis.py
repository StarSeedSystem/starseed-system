#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""MetaGeminis · esqueleto ejecutable del agente social de MetaGenesis (2026-10-10).

Contrato: architecture/metageminis.md. Lo que hace una pasada, de punta a punta:

  1. Lee el directorio de sitios (src/lib/metageminis/directorio.ts, entre las marcas <datos-json>)
     y el contexto de StarSeed (CLAUDE.md §3–§6: tríada, arquitectura, fases, invariantes).
  2. Elige los sitios donde SUS REGLAS dejan redactar (no NLnet, no Hacker News, no LinkedIn…).
  3. Redacta un borrador por sitio con los modelos gratuitos del enjambre (solo NOMBRES de variables
     de entorno; ninguna clave vive en este archivo) o, sin clave, con una plantilla honesta.
  4. Pregunta a Jev (scripts/puente/decidir.py) si merece ir a la cola; si Jev calla, manda la regla.
  5. Deja el borrador PARA APROBAR: en la tabla metageminis_borradores (clave de servicio) o, si no
     hay base, en ~/.starseed/metageminis/cola.jsonl. Alex lo aprueba en MetaGenesis con un toque.

LO QUE ESTE ARCHIVO NUNCA HACE (y una prueba lo vigila):
  · enviar, publicar ni escribir en ningún sitio del directorio: la única red que toca son los
    proveedores de modelos gratuitos y la base de MetaGeminis (lista blanca de hosts);
  · crear cuentas, escribir contraseñas ni datos de pago;
  · saltarse la aprobación: solo inserta con estado «para_aprobar» (y la base lo fuerza con triggers);
  · leer páginas web ajenas (todo texto ajeno es no fiable: la rama investigadora lo hace aparte,
    en un contenedor sin claves).

Variables de entorno (solo nombres; los valores los pone Alex, nunca el repo):
  XKIRO_API_KEY · NVIDIA_API_KEY o NVIDIA_SHARED_KEY · AIHUBMIX_API_KEY · TOKENROUTER_API_KEY ·
  OPENROUTER_API_KEY o OPENROUTER_SHARED_KEY · LLM7_API_KEY (opcional: llm7 va sin clave)
  SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL) · SUPABASE_SERVICE_ROLE_KEY · METAGEMINIS_AGENTE_ID (uuid)
  STARSEED_MEDIO (enjambre|nube|oracle_a1|mac) · STARSEED_JEV=0 apaga a Jev.
También se leen de ~/.starseed/env (KEY=VALUE, chmod 600); el entorno manda sobre el archivo.

Uso:
  python3 scripts/sociales/metageminis.py plan [--prioridad-max 2] [--json]
  python3 scripts/sociales/metageminis.py borradores [--max 3] [--sitio ID] [--sin-llm] [--seco]
                                                     [--cola auto|local|supabase] [--json]
  python3 scripts/sociales/metageminis.py cola [--json]
  python3 scripts/sociales/metageminis.py cerrar --huella <sha256> --resultado respondido|descartado|sin_respuesta
  python3 scripts/sociales/metageminis.py estado
  python3 scripts/sociales/metageminis.py servir [--cada 3600] [--una-vez]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(AQUI))
RUTA_DIRECTORIO = os.path.join(RAIZ, "src", "lib", "metageminis", "directorio.ts")
RUTA_CLAUDE_MD = os.path.join(RAIZ, "CLAUDE.md")
RUTA_MIGRACION = os.path.join(RAIZ, "supabase", "migrations", "20261011090000_metageminis.sql")
CARPETA_ESTADO = os.path.join(os.path.expanduser("~"), ".starseed", "metageminis")

# Los mismos valores que la migración (una prueba los compara con el SQL).
RAMAS = ("investigadora", "redactora", "campanas", "estudio", "alianzas_ia", "fondos", "seguimiento")
CANALES = ("api_oficial", "formulario", "correo_propuesta", "manual_alex")
NIVELES = ("bajo", "medio", "alto")
ESTADO_INICIAL = "para_aprobar"
RAMAS_QUE_REDACTAN = ("redactora", "alianzas_ia", "fondos", "campanas")
RAMA_POR_CATEGORIA = {
    "red-agentes": "alianzas_ia",
    "registro": "redactora",
    "fondo": "fondos",
    "inversion": "fondos",
    "donaciones": "fondos",
    "crowdfunding": "fondos",
    "voluntariado": "redactora",
    "comunidad": "alianzas_ia",
    "canal": "campanas",
}

AVISO_IA = (
    "Nota: este texto lo ha redactado MetaGeminis, un agente de IA de la sociedad StarSeed. "
    "Antes de enviarse, una persona de StarSeed (Alex Bordón Garrigós) lo revisa y lo aprueba. "
    "Si prefieres no recibir mensajes de agentes de IA, respóndenos «no» y no volveremos a escribirte."
)

# Las publicaciones propias (categoría «canal») tienen límite de caracteres: llevan un aviso corto. La cuenta
# además se declara agente de IA en su perfil (etiqueta de bot) y solo sale tras la aprobación de Alex.
AVISO_IA_CORTO = "— MetaGeminis, agente de IA de StarSeed"
LIMITE_PUBLICACION = 300

# Proveedores gratuitos del enjambre (OpenAI-compatibles). Solo NOMBRES de variables de entorno.
PROVEEDORES = {
    "xkiro": {"url": "https://api.xkiro.com/v1/chat/completions", "modelo": "minimax/minimax-m2.7-highspeed:free", "claves": ("XKIRO_API_KEY",)},
    "nim": {"url": "https://integrate.api.nvidia.com/v1/chat/completions", "modelo": "moonshotai/kimi-k3", "claves": ("NVIDIA_API_KEY", "NVIDIA_SHARED_KEY")},
    "aihubmix": {"url": "https://aihubmix.com/v1/chat/completions", "modelo": "coding-glm-5.3-free", "claves": ("AIHUBMIX_API_KEY",)},
    "tokenrouter": {"url": "https://api.tokenrouter.com/v1/chat/completions", "modelo": "z-ai/glm-5.3-free", "claves": ("TOKENROUTER_API_KEY",)},
    "openrouter": {"url": "https://openrouter.ai/api/v1/chat/completions", "modelo": "nvidia/nemotron-3-super-120b-a12b:free", "claves": ("OPENROUTER_API_KEY", "OPENROUTER_SHARED_KEY")},
    "llm7": {"url": "https://api.llm7.io/v1/chat/completions", "modelo": "gpt-oss", "claves": ()},  # sin clave
}
ORDEN_PROVEEDORES = ("xkiro", "nim", "tokenrouter", "aihubmix", "openrouter", "llm7")
USER_AGENT = "starseed-metageminis/1 (+starseed-os)"

_SECRETOS = [
    re.compile(r"\bsk-[A-Za-z0-9_\-]{16,}"),
    re.compile(r"\bgsk_[A-Za-z0-9]{16,}"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}"),
    re.compile(r"\bAIza[0-9A-Za-z_\-]{30,}"),
    re.compile(r"\bxox[abprs]-[A-Za-z0-9\-]{10,}"),
    re.compile(r"\bnvapi-[A-Za-z0-9_\-]{20,}"),
    re.compile(r"\bhf_[A-Za-z0-9]{20,}"),
    re.compile(r"\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{5,}"),
]


class HostNoPermitido(Exception):
    """Se intentó hablar con un sitio que no es un proveedor de modelos ni la base de MetaGeminis."""


def ahora():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def sanear(texto):
    t = texto or ""
    for p in _SECRETOS:
        t = p.sub("[REDACTADO]", t)
    return t


# ─────────────────────────────── entorno ───────────────────────────────

def leer_env(ruta=None, base=None):
    """El entorno (manda) sobre ~/.starseed/env. Nunca se imprime ni se registra."""
    fuera = {}
    ruta = ruta or os.path.join(os.path.expanduser("~"), ".starseed", "env")
    try:
        with open(ruta, encoding="utf-8") as f:
            for linea in f:
                linea = linea.strip()
                if not linea or linea.startswith("#") or "=" not in linea:
                    continue
                k, v = linea.split("=", 1)
                k = k.replace("export ", "").strip()
                fuera[k] = v.strip().strip('"').strip("'")
    except OSError:
        pass
    fuera.update(os.environ if base is None else base)
    return fuera


def proveedores_disponibles(env):
    """Nombres de los proveedores que tienen clave (o no la necesitan), en orden de uso."""
    return [n for n in ORDEN_PROVEEDORES if not PROVEEDORES[n]["claves"] or any(env.get(k) for k in PROVEEDORES[n]["claves"])]


def _clave_de(nombre, env):
    for k in PROVEEDORES[nombre]["claves"]:
        if env.get(k):
            return env[k]
    return env.get("LLM7_API_KEY") or "sin-clave" if nombre == "llm7" else None


def medio_actual(env):
    m = (env.get("STARSEED_MEDIO") or "").strip().lower()
    return m if m in ("enjambre", "nube", "oracle_a1", "mac") else "enjambre"


# ─────────────────────────────── directorio y contexto ───────────────────────────────

def cargar_directorio(ruta=None):
    """Los sitios del directorio, leídos del mismo .ts que usa el panel (JSON entre marcas)."""
    with open(ruta or RUTA_DIRECTORIO, encoding="utf-8") as f:
        s = f.read()
    m = re.search(r"// <datos-json>\s*export const DIRECTORIO[^=]*=\s*(.*?);\s*// </datos-json>", s, re.S)
    if not m:
        raise ValueError("directorio.ts no tiene el bloque <datos-json>")
    return json.loads(m.group(1))


def _sin_actuacion(s):
    return s.get("estado") in ("cerrado", "no-encaja")


def puede_redactar(s):
    """Mismas reglas que consulta.ts: ¿puede MetaGeminis preparar texto para este sitio?"""
    if s.get("ia_en_texto") == "no-aceptada":
        return False
    if s.get("agentes") in ("prohibido", "solo-lectura", "sin-verificar"):
        return False
    return not _sin_actuacion(s)


def puede_enviar_el_agente(s):
    """¿Podría un agente ENVIARLO por sí mismo tras la aprobación? (Este archivo nunca envía.)"""
    if not puede_redactar(s) or s.get("estado") == "revisar":
        return False
    # Solo se confía en lo que se leyó en la propia página (igual que consulta.ts): lo conocido por terceros
    # o por el buscador nunca se envía solo.
    if s.get("verificacion") != "pagina-leida":
        return False
    return s.get("agentes") in ("diseñado-para-agentes", "api-oficial-con-aviso")


def motivo_no_redactable(s):
    if s.get("ia_en_texto") == "no-aceptada":
        return "el sitio no acepta texto generado por IA"
    if s.get("agentes") == "prohibido":
        return "las reglas del sitio vetan a los agentes"
    if s.get("agentes") == "solo-lectura":
        return "solo lectura: el agente vigila pero no escribe"
    if s.get("agentes") == "sin-verificar":
        return "reglas sin leer todavía"
    if _sin_actuacion(s):
        return "cerrado o no encaja"
    return None


def canal_para(s):
    """Por dónde saldría: solo canales que el sitio ofrece. Lo que pide cuenta humana o es «solo-humano»
    lo envía una persona (manual_alex); el agente solo usa API oficial tras la aprobación."""
    if s.get("agentes") == "solo-humano" or s.get("acceso") == "cuenta-humana":
        return "manual_alex"
    if s.get("acceso") == "api" and puede_enviar_el_agente(s):
        return "api_oficial"
    if s.get("acceso") == "formulario" and puede_enviar_el_agente(s):
        return "formulario"
    return "manual_alex"


def rama_para(s):
    ramas = list(s.get("ramas") or [])
    preferida = RAMA_POR_CATEGORIA.get(s.get("categoria"))
    if preferida in ramas:
        return preferida
    for r in ramas:
        if r in RAMAS_QUE_REDACTAN:
            return r
    return preferida or "redactora"


def plan(directorio, prioridad_max=2, solo_sitio=None):
    """Qué sitios tendrían borrador y por qué los demás no. Orden: prioridad, plazo, nombre."""
    elegidos, excluidos = [], []
    for s in sorted(directorio, key=lambda x: (x["prioridad"], x.get("vence") or "9999-12-31", x["nombre"])):
        if solo_sitio and s["id"] != solo_sitio:
            continue
        motivo = motivo_no_redactable(s)
        if motivo is None and s["prioridad"] > prioridad_max and not solo_sitio:
            motivo = "prioridad %d: no toca todavía" % s["prioridad"]
        if motivo is None and s["prioridad"] >= 5:
            motivo = "prioridad 5: no actuar"
        fila = {"id": s["id"], "nombre": s["nombre"], "prioridad": s["prioridad"], "rama": rama_para(s), "canal": canal_para(s)}
        if motivo:
            fila["motivo"] = motivo
            excluidos.append(fila)
        else:
            elegidos.append(fila)
    return elegidos, excluidos


def contexto_starseed(ruta=None, max_chars=3200):
    """CLAUDE.md §3–§6 (tríada, arquitectura, fases, invariantes), recortado. Si falta, un resumen mínimo."""
    minimo = (
        "StarSeed es un sistema operativo social abierto y descentralizado (código abierto) con identidad soberana, "
        "democracia directa y tecnología al servicio del bien común. Su plan tiene tres fases: Semilla (centros sociales y "
        "economía híbrida con donaciones conscientes), Fruto (vivienda y automatización) y Cosecha (gratuidad sistémica)."
    )
    try:
        with open(ruta or RUTA_CLAUDE_MD, encoding="utf-8") as f:
            s = f.read()
    except OSError:
        return minimo
    m = re.search(r"^## 3\..*?(?=^## 7\.)", s, re.S | re.M)
    if not m:
        return minimo
    t = re.sub(r"[ \t]+", " ", m.group(0)).strip()
    return t if len(t) <= max_chars else t[:max_chars].rsplit(" ", 1)[0] + " …"


# ─────────────────────────────── redacción ───────────────────────────────

def normalizar(texto):
    return re.sub(r"\s+", " ", (texto or "").strip().lower())


def huella(sitio_id, cuerpo):
    """sha256 de sitio + cuerpo normalizado: el mismo mensaje no se propone dos veces al mismo sitio."""
    return hashlib.sha256((sitio_id + "\n" + normalizar(cuerpo)).encode("utf-8")).hexdigest()


def construir_prompt(s, contexto):
    pide = {
        "red-agentes": "una presentación breve de StarSeed dirigida a otros agentes y a sus dueños, proponiendo colaborar",
        "registro": "el texto para solicitar el alta o el reconocimiento de StarSeed",
        "fondo": "una carta de consulta previa: describe el proyecto en cinco líneas y pregunta si encaja en la convocatoria",
        "inversion": "una carta de consulta previa para una finanza ética o inversión de impacto, sin prometer rendimientos",
        "donaciones": "la descripción del proyecto para su página de donaciones, clara y verificable",
        "crowdfunding": "la descripción de una campaña de micromecenazgo con objetivo, uso del dinero y plazos honestos",
        "voluntariado": "la oferta de un puesto de voluntariado: tareas, tiempo y qué se aprende",
        "comunidad": "un saludo breve que explique qué hace StarSeed y pregunte si encaja con la comunidad",
        "canal": "una publicación breve (máximo 280 caracteres) que invite a conocer StarSeed",
    }.get(s.get("categoria"), "un mensaje breve y respetuoso")
    return (
        "Eres MetaGeminis, un agente de IA de la sociedad StarSeed. Escribe en español claro y cálido, sin exageraciones.\n"
        "Reglas: no inventes cifras, premios, personas ni apoyos; no prometas dinero ni resultados; no pidas datos "
        "personales ni de pago; di siempre que eres un agente de IA; nada de presión ni de mensajes masivos.\n"
        "Si el sitio pide algo que no sabes, dilo con una pregunta en vez de inventar.\n\n"
        "== Qué es StarSeed (contexto interno) ==\n" + contexto + "\n\n"
        "== Destino ==\nSitio: %s (%s)\nQué es: %s\nPor qué nos sirve: %s\nSus reglas sobre IA y agentes: %s\n\n"
        "== Tarea ==\nRedacta %s. Devuelve solo el texto, sin comentarios."
        % (s["nombre"], s["url"], s.get("que_es", ""), s.get("utilidad", ""), s.get("reglas", ""), pide)
    )


def plantilla(s):
    """Texto de reserva cuando no hay modelo disponible: corto, veraz y sin promesas."""
    base = (
        "Hola, somos StarSeed: un sistema operativo social abierto y descentralizado, de código abierto, con identidad "
        "soberana y democracia directa, que se construye por fases (Semilla, Fruto, Cosecha). "
    )
    cat = s.get("categoria")
    if cat in ("fondo", "inversion"):
        cuerpo = base + "Antes de preparar una solicitud completa queremos preguntar si %s encaja con lo que hacemos y qué necesitaríais ver." % s["nombre"]
    elif cat in ("donaciones", "crowdfunding"):
        cuerpo = base + "Queremos publicar una página de proyecto en %s con objetivos y uso del dinero claros. ¿Qué datos pedís para validarla?" % s["nombre"]
    elif cat == "voluntariado":
        cuerpo = base + "Buscamos personas voluntarias para tareas concretas y acotadas. Publicamos la oferta en %s; ¿qué formato prefiere la plataforma?" % s["nombre"]
    elif cat == "canal":
        cuerpo = "StarSeed: un sistema operativo social abierto, descentralizado y de código abierto. Si te interesa, mira cómo se construye."
    else:
        cuerpo = base + "Nos gustaría saber si StarSeed encaja en %s y cómo colaborar de forma respetuosa con vuestras normas." % s["nombre"]
    return cuerpo


def _post_json(url, cuerpo, cabeceras, permitidos, timeout=60, abrir=None):
    """La ÚNICA salida a la red de este archivo. Solo https y solo hosts de la lista blanca."""
    u = urllib.parse.urlparse(url)
    if u.scheme != "https" or (u.hostname or "") not in permitidos:
        raise HostNoPermitido("host no permitido: %s" % (u.hostname or url))
    req = urllib.request.Request(url, data=json.dumps(cuerpo).encode("utf-8"), headers=dict(cabeceras, **{"Content-Type": "application/json", "User-Agent": USER_AGENT}), method="POST")
    with (abrir or urllib.request.urlopen)(req, timeout=timeout) as r:
        crudo = r.read().decode("utf-8", "ignore")
    return json.loads(crudo) if crudo.strip() else {}


def hosts_permitidos(env):
    hosts = {urllib.parse.urlparse(p["url"]).hostname for p in PROVEEDORES.values()}
    base = env.get("SUPABASE_URL") or env.get("NEXT_PUBLIC_SUPABASE_URL") or ""
    h = urllib.parse.urlparse(base).hostname
    if h:
        hosts.add(h)
    return hosts


def generar_texto(s, contexto, env, proveedor=None, llamar=None):
    """Un borrador con el primer proveedor gratuito que responda. Devuelve (texto, proveedor, modelo) o
    (None, None, None). `llamar(url, cuerpo, cabeceras)` se puede inyectar (pruebas)."""
    prompt = construir_prompt(s, contexto)
    orden = [proveedor] if proveedor else proveedores_disponibles(env)
    permitidos = hosts_permitidos(env)
    for nombre in orden:
        if nombre not in PROVEEDORES:
            continue
        cfg = PROVEEDORES[nombre]
        clave = _clave_de(nombre, env)
        cab = {"Authorization": "Bearer " + clave} if clave else {}
        cuerpo = {"model": cfg["modelo"], "messages": [{"role": "user", "content": prompt}], "max_tokens": 900, "temperature": 0.4}
        try:
            r = (llamar or (lambda u, c, h: _post_json(u, c, h, permitidos)))(cfg["url"], cuerpo, cab)
            texto = ((r.get("choices") or [{}])[0].get("message") or {}).get("content") or ""
        except HostNoPermitido:
            raise
        except Exception:
            continue
        texto = sanear(texto).strip()
        if 60 <= len(texto) <= 9000 and "[REDACTADO]" not in texto:
            return texto, nombre, cfg["modelo"]
    return None, None, None


def componer_cuerpo(texto, s=None):
    """El texto + el aviso de agente de IA (siempre). Una publicación propia lleva el aviso corto y cabe
    en LIMITE_PUBLICACION caracteres; el resto de textos, el aviso completo con la salida «no»."""
    if s is not None and s.get("categoria") == "canal":
        aviso = " " + AVISO_IA_CORTO
        t = texto.strip()
        if len(t) + len(aviso) > LIMITE_PUBLICACION:
            t = t[: LIMITE_PUBLICACION - len(aviso) - 1].rsplit(" ", 1)[0].rstrip(" ,;:") + "…"
        return t + aviso
    return texto.strip() + "\n\n" + AVISO_IA


# ─────────────────────────────── puntuación con Jev ───────────────────────────────

def regla_de_nivel(s):
    if s.get("estado") == "revisar" or s.get("verificacion") == "busqueda":
        return "bajo"
    if s.get("prioridad") == 1 and s.get("estado") in ("abierto", "continuo") and s.get("verificacion") == "pagina-leida":
        return "alto"
    return "medio"


def puntuar(s, cuerpo, consultar=None):
    """(nivel, p, medio, experiencia). Jev solo orienta: si calla, manda la regla (medio «regla»)."""
    regla = regla_de_nivel(s)
    if consultar is None:
        carpeta_puente = os.path.join(RAIZ, "scripts", "puente")
        if carpeta_puente not in sys.path:
            sys.path.insert(0, carpeta_puente)
        try:
            import decidir  # type: ignore

            consultar = decidir.consultar
        except Exception:
            return regla, None, "regla", None
    estado = {"sitio": {k: s.get(k) for k in ("id", "categoria", "prioridad", "estado", "vence", "verificacion", "agentes", "ia_en_texto")}, "borrador": cuerpo[:600]}
    pregunta = "¿Qué probabilidad hay de que este borrador merezca la atención de Alex y de una respuesta útil del sitio?"
    try:
        r = consultar("puntuar", estado, pregunta, niveles=list(NIVELES), regla=regla, quien="metageminis", dominio="metageminis")
    except Exception:
        return regla, None, "regla", None
    nivel = r.get("respuesta") if r.get("respuesta") in NIVELES else regla
    p = r.get("p")
    return nivel, (round(float(p), 4) if isinstance(p, (int, float)) else None), str(r.get("medio") or "regla")[:40], r.get("experiencia")


# ─────────────────────────────── colas ───────────────────────────────

def nueva_fila(s, cuerpo, nivel, p, medio_jev, agente_id=None, asunto=None):
    """La fila de metageminis_borradores. NUNCA nace aprobada; la base lo vuelve a forzar."""
    return {
        "rama_id": rama_para(s),
        "agente_id": agente_id,
        "sitio_id": s["id"],
        "canal": canal_para(s),
        "asunto": (asunto or ("StarSeed · %s" % s["nombre"]))[:200],
        "cuerpo": cuerpo,
        "idioma": "es",
        "puntuacion_nivel": nivel,
        "puntuacion_p": p,
        "puntuacion_medio": medio_jev,
        "estado": ESTADO_INICIAL,
        "huella": huella(s["id"], cuerpo),
    }


class ColaLocal:
    """~/.starseed/metageminis/cola.jsonl: una fila por línea. Alex la ve en MetaGenesis cuando se sincroniza."""

    nombre = "local"

    def __init__(self, ruta=None):
        self.ruta = ruta or os.path.join(CARPETA_ESTADO, "cola.jsonl")

    def leer(self):
        try:
            with open(self.ruta, encoding="utf-8") as f:
                return [json.loads(l) for l in f if l.strip()]
        except OSError:
            return []

    def agregar(self, fila):
        if any(x.get("huella") == fila["huella"] for x in self.leer()):
            return False
        os.makedirs(os.path.dirname(self.ruta), exist_ok=True)
        with open(self.ruta, "a", encoding="utf-8") as f:
            f.write(json.dumps(dict(fila, creado_en=ahora()), ensure_ascii=False) + "\n")
        return True


class ColaSupabase:
    """Inserta en metageminis_borradores con la clave de servicio (variable, nunca en el repo). Solo INSERT en
    «para_aprobar»: aprobar es cosa de un dueño por la RPC metageminis_decidir_borrador."""

    nombre = "supabase"
    COLUMNAS = ("rama_id", "agente_id", "sitio_id", "canal", "asunto", "cuerpo", "idioma", "puntuacion_nivel", "puntuacion_p", "puntuacion_medio", "estado", "huella")

    def __init__(self, env, abrir=None):
        self.url = (env.get("SUPABASE_URL") or env.get("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/")
        self._clave = env.get("SUPABASE_SERVICE_ROLE_KEY") or ""
        self.agente_id = env.get("METAGEMINIS_AGENTE_ID") or None
        self.permitidos = hosts_permitidos(env)
        self.abrir = abrir

    def disponible(self):
        return bool(self.url.startswith("https://") and self._clave)

    def agregar(self, fila):
        cuerpo = {k: fila.get(k) for k in self.COLUMNAS}
        cuerpo["agente_id"] = cuerpo.get("agente_id") or self.agente_id
        cab = {"apikey": self._clave, "Authorization": "Bearer " + self._clave, "Prefer": "resolution=ignore-duplicates,return=minimal"}
        _post_json(self.url + "/rest/v1/metageminis_borradores?on_conflict=huella", cuerpo, cab, self.permitidos, abrir=self.abrir)
        return True


def elegir_cola(modo, env, local=None):
    if modo in ("auto", "supabase"):
        c = ColaSupabase(env)
        if c.disponible():
            return c
        if modo == "supabase":
            raise SystemExit("falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY (solo se leen nombres de variable; no se imprime nada)")
    return local or ColaLocal()


# ─────────────────────────────── cerrar el ciclo con Jev ───────────────────────────────

def ruta_experiencias(cola=None):
    carpeta = os.path.dirname(cola.ruta) if isinstance(cola, ColaLocal) else CARPETA_ESTADO
    return os.path.join(carpeta, "experiencias.jsonl")


def guardar_experiencia(huella_, experiencia, nivel, ruta):
    """Recuerda qué experiencia de Jev corresponde a cada borrador, para confirmar después si acertó."""
    if not experiencia:
        return False
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, "a", encoding="utf-8") as f:
        f.write(json.dumps({"huella": huella_, "experiencia": experiencia, "nivel": nivel, "ts": ahora()}) + "\n")
    return True


def acierto_de(nivel, estado_final):
    """¿Acertó la puntuación de Jev? «alto» y «medio» dicen «merece la pena»; «bajo», «no».
    estado_final: respondido | descartado | sin_respuesta. None si todavía no se puede saber."""
    merece = nivel in ("alto", "medio")
    if estado_final == "respondido":
        return merece
    if estado_final in ("descartado", "sin_respuesta"):
        return not merece
    return None


def cerrar_ciclo(huella_, estado_final, ruta, confirmar=None):
    """Confirma a Jev (decidir.py confirmar) si la puntuación de ese borrador acertó. Devuelve True/False si se
    pudo confirmar, None si no hay experiencia guardada o aún no se sabe."""
    try:
        with open(ruta, encoding="utf-8") as f:
            filas = [json.loads(l) for l in f if l.strip()]
    except OSError:
        return None
    fila = next((x for x in reversed(filas) if x.get("huella") == huella_), None)
    acierto = acierto_de(fila.get("nivel"), estado_final) if fila else None
    if fila is None or acierto is None:
        return None
    if confirmar is None:
        carpeta_puente = os.path.join(RAIZ, "scripts", "puente")
        if carpeta_puente not in sys.path:
            sys.path.insert(0, carpeta_puente)
        try:
            import decidir  # type: ignore

            confirmar = decidir.confirmar
        except Exception:
            return None
    confirmar(fila["experiencia"], acierto, "metageminis: %s tras puntuar %s" % (estado_final, fila.get("nivel")))
    return acierto


# ─────────────────────────────── una pasada ───────────────────────────────

def ciclo(directorio, env, cola, maximo=3, prioridad_max=2, solo_sitio=None, sin_llm=False, llamar=None, consultar=None,
          contexto=None, seco=False, proveedor=None):
    """Genera hasta `maximo` borradores, los puntúa y los deja PARA APROBAR. No envía nada."""
    elegidos, excluidos = plan(directorio, prioridad_max, solo_sitio)
    por_id = {s["id"]: s for s in directorio}
    contexto = contexto if contexto is not None else contexto_starseed()
    hechos, repetidos, en_espera = [], [], []
    ya_esperan = sitios_con_borrador_pendiente(cola)
    for e in elegidos:
        if len(hechos) >= maximo:
            break
        if e["id"] in ya_esperan:
            en_espera.append(e["id"])
            continue
        s = por_id[e["id"]]
        texto, prov, modelo = (None, None, None) if sin_llm else generar_texto(s, contexto, env, proveedor, llamar)
        origen = "%s/%s" % (prov, modelo) if prov else "plantilla"
        if texto is None:
            texto = plantilla(s)
        cuerpo = componer_cuerpo(texto, s)
        nivel, p, medio_jev, exp = puntuar(s, cuerpo, consultar)
        fila = nueva_fila(s, cuerpo, nivel, p, medio_jev)
        if seco:
            hechos.append({"sitio": s["id"], "origen": origen, "nivel": nivel, "canal": fila["canal"], "rama": fila["rama_id"], "cola": None})
            continue
        if cola.agregar(fila):
            guardar_experiencia(fila["huella"], exp, nivel, ruta_experiencias(cola))
            hechos.append({"sitio": s["id"], "origen": origen, "nivel": nivel, "canal": fila["canal"], "rama": fila["rama_id"], "cola": cola.nombre, "experiencia": exp})
        else:
            repetidos.append(s["id"])
    return {"hechos": hechos, "repetidos": repetidos, "en_espera": en_espera, "excluidos": len(excluidos), "elegibles": len(elegidos)}


def sitios_con_borrador_pendiente(cola):
    """Sitios que ya tienen un borrador «para_aprobar» en la cola LOCAL: no se les redacta otro.

    (OPO1010, 2026-10-10) `servir` corre 24/7 en el A1 de Oracle. Sin esto, cada pasada volvía a
    elegir los MISMOS primeros sitios del plan y, como el texto del modelo cambia, la huella también:
    la cola de Alex habría recibido un borrador casi igual por sitio y por hora. Mientras un sitio
    espera la decisión de Alex, se pasa al siguiente; cuando todos esperan, la pasada no hace nada.
    La base de Supabase solo admite INSERT desde aquí (no se puede leer): ahí la huella y la RLS mandan."""
    if not isinstance(cola, ColaLocal):
        return set()
    return {str(f.get("sitio_id")) for f in cola.leer()
            if (f.get("estado") or ESTADO_INICIAL) == ESTADO_INICIAL and f.get("sitio_id")}


def escribir_latido(env, resultado, ruta=None):
    ruta = ruta or os.path.join(CARPETA_ESTADO, "latido.json")
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump({"ts": ahora(), "medio": medio_actual(env), "borradores": len(resultado.get("hechos", [])),
                   "repetidos": len(resultado.get("repetidos", [])), "en_espera": len(resultado.get("en_espera", []))}, f)


# ─────────────────────────────── línea de órdenes ───────────────────────────────

def _imprimir(obj, como_json):
    if como_json:
        print(json.dumps(obj, ensure_ascii=False, indent=2))


def main(argv=None):
    ap = argparse.ArgumentParser(description="MetaGeminis · agente social de MetaGenesis (nunca envía: solo prepara para aprobar)")
    sub = ap.add_subparsers(dest="orden", required=True)
    p1 = sub.add_parser("plan", help="qué sitios tendrían borrador y por qué los demás no")
    p1.add_argument("--prioridad-max", type=int, default=2)
    p1.add_argument("--json", action="store_true")
    p2 = sub.add_parser("borradores", help="genera borradores y los deja para aprobar")
    p2.add_argument("--max", type=int, default=3)
    p2.add_argument("--prioridad-max", type=int, default=2)
    p2.add_argument("--sitio")
    p2.add_argument("--proveedor", choices=sorted(PROVEEDORES))
    p2.add_argument("--sin-llm", action="store_true")
    p2.add_argument("--seco", action="store_true", help="no guarda nada, solo enseña")
    p2.add_argument("--cola", choices=("auto", "local", "supabase"), default="auto")
    p2.add_argument("--json", action="store_true")
    p3 = sub.add_parser("cola", help="lista la cola local")
    p3.add_argument("--json", action="store_true")
    sub.add_parser("estado", help="resumen sin secretos")
    p4 = sub.add_parser("cerrar", help="confirma a Jev si acertó su puntuación de un borrador ya resuelto")
    p4.add_argument("--huella", required=True)
    p4.add_argument("--resultado", required=True, choices=("respondido", "descartado", "sin_respuesta"))
    p5 = sub.add_parser("servir", help="bucle de servicio (Oracle A1, nube o enjambre)")
    p5.add_argument("--cada", type=int, default=3600, help="segundos entre pasadas")
    p5.add_argument("--una-vez", action="store_true")
    p5.add_argument("--max", type=int, default=3)
    a = ap.parse_args(argv)

    env = leer_env()
    directorio = cargar_directorio()

    if a.orden == "plan":
        el, ex = plan(directorio, a.prioridad_max)
        if a.json:
            _imprimir({"elegibles": el, "excluidos": ex}, True)
        else:
            print("%d sitios con borrador posible, %d sin él." % (len(el), len(ex)))
            for e in el:
                print("  + %-26s p%d  %-12s %s" % (e["id"], e["prioridad"], e["rama"], e["canal"]))
            for e in ex:
                print("  - %-26s p%d  %s" % (e["id"], e["prioridad"], e["motivo"]))
        return 0

    if a.orden == "borradores":
        cola = elegir_cola(a.cola, env)
        r = ciclo(directorio, env, cola, a.max, a.prioridad_max, a.sitio, a.sin_llm, proveedor=a.proveedor, seco=a.seco)
        if a.json:
            _imprimir(r, True)
        else:
            print("%d borradores %s (cola %s); %d repetidos; %d sitios excluidos." % (len(r["hechos"]), "mostrados" if a.seco else "para aprobar", cola.nombre, len(r["repetidos"]), r["excluidos"]))
            for h in r["hechos"]:
                print("  · %-24s %-8s %-14s %s" % (h["sitio"], h["nivel"], h["canal"], h["origen"]))
        return 0

    if a.orden == "cola":
        filas = ColaLocal().leer()
        if a.json:
            _imprimir(filas, True)
        else:
            print("%d borradores en la cola local (todos «%s» hasta que Alex los apruebe en MetaGenesis)." % (len(filas), ESTADO_INICIAL))
            for f in filas:
                print("  · %-24s %-8s %-14s %s" % (f.get("sitio_id"), f.get("puntuacion_nivel"), f.get("canal"), (f.get("asunto") or "")[:50]))
        return 0

    if a.orden == "cerrar":
        r = cerrar_ciclo(a.huella, a.resultado, ruta_experiencias(ColaLocal()))
        print({True: "Jev confirmado: acertó.", False: "Jev confirmado: falló.", None: "Sin experiencia guardada para esa huella (o aún no se sabe)."}[r])
        return 0

    if a.orden == "estado":
        el, ex = plan(directorio)
        print(json.dumps({
            "directorio": len(directorio), "con_borrador_posible": len(el), "excluidos": len(ex),
            "proveedores_con_clave": proveedores_disponibles(env), "base": ColaSupabase(env).disponible(),
            "cola_local": len(ColaLocal().leer()), "medio": medio_actual(env), "jev_apagado": (env.get("STARSEED_JEV", "1").lower() in ("0", "no", "false", "off")),
        }, ensure_ascii=False, indent=2))
        return 0

    if a.orden == "servir":
        while True:
            cola = elegir_cola("auto", env)
            r = ciclo(directorio, env, cola, a.max)
            escribir_latido(env, r)
            print("[%s] %d borradores nuevos (cola %s)" % (ahora(), len(r["hechos"]), cola.nombre), flush=True)
            if a.una_vez:
                return 0
            time.sleep(max(60, a.cada))
    return 2


if __name__ == "__main__":
    sys.exit(main())
