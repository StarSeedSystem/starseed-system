#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""opencode-zen_config · deja OpenCode Zen listo para escribir y comprueba que responde.

Por qué existe (CAP1119). OpenCode Zen es el escritor principal de la nube desde el
21-10 (`glm-5.3-flash-free`, `deepseek-v4.1-flash-free`, `minimax-m3.1-flash-free`,
`big-pickle`), pero `medios_disponibles.py` lo da por «usable» mientras no haya un
proveedor `opencode` en `~/.config/opencode/opencode.json` con esos modelos, y
`revisor_capacidades.py` pide «activar» sin que nadie lo haga. Este guion hace las dos
cosas: ESCRIBE el bloque (solo si falta o está incompleto, respetando lo que haya a
mano) y LUEGO sondea un modelo con `sonda_escritor` para decir si Zen escribe de verdad.

Reglas que respeta:
  · La clave NUNCA se escribe: opencode la lee de `{env:OPENCODE_API_KEY}` o de su
    `auth.json` (`opencode auth login`). Aquí solo se comprueba que exista.
  · No toca proveedores ajenos ni el resto de la configuración.
  · Lo puro (qué bloque falta, si está completo) vive aquí y se prueba sin red ni disco.

Uso:
    python3 scripts/puente/opencode-zen_config.py            → configura y sondea
    python3 scripts/puente/opencode-zen_config.py --config    → solo deja el bloque
    python3 scripts/puente/opencode-zen_config.py --json      → informe en JSON
"""

import argparse
import json
import os
import sys

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)
if os.path.join(DIRECTORIO, "..", "enjambre") not in sys.path:
    sys.path.insert(0, os.path.join(DIRECTORIO, "..", "enjambre"))

#: Proveedor de Zen en opencode: nativo (sin `npm`), la clave la pone `opencode auth login`.
PROVEEDOR = "opencode"
#: Los cuatro modelos GRATIS de Zen (los de pago —claude-*, gpt-*, gemini-*— NUNCA entran).
MODELOS_ZEN_GRATIS = (
    "glm-5.3-flash-free",
    "deepseek-v4.1-flash-free",
    "minimax-m3.1-flash-free",
    "big-pickle",
)
#: Modelo con el que se sondea (el más rápido medido: ~39 s una edición real).
MODELO_SONDA = MODELOS_ZEN_GRATIS[0]
#: Config de opencode del usuario (la misma que lee el orquestador).
RUTA_CONFIG = os.path.expanduser("~/.config/opencode/opencode.json")


# ── decisiones puras (sin red ni disco) ──────────────────────────────────────

def bloque_zen_completo(modelos):
    """PURA: ¿la lista de modelos incluye los cuatro gratuitos de Zen?"""
    tiene = set(modelos or ())
    return all(m in tiene for m in MODELOS_ZEN_GRATIS)


def es_proveedor_zen(nombre):
    """PURA: ¿este proveedor de opencode es Zen? (llama «opencode» o «zen»)."""
    n = str(nombre or "").strip().lower()
    return n in ("opencode", "zen")


def bloque_faltante(cfg):
    """PURA: el bloque `provider` que hay que escribir, o None si Zen ya está completo.

    Devuelve SIEMPRE una copia nueva (no muta `cfg`). Si el proveedor ya existe pero
    le faltan modelos, los añade sin borrar los que hubiera; si no existe, lo crea con
    los cuatro gratuitos. La clave jamás se escribe: opencode la resuelve por
    `{env:OPENCODE_API_KEY}` o por su `auth.json`.
    """
    cfg = cfg if isinstance(cfg, dict) else {}
    provs = cfg.get("provider")
    provs = dict(provs) if isinstance(provs, dict) else {}
    actual = provs.get(PROVEEDOR)
    actual = actual if isinstance(actual, dict) else {}
    modelos = dict(actual.get("models") or {})
    if bloque_zen_completo(modelos):
        return None
    for nombre in MODELOS_ZEN_GRATIS:
        modelos.setdefault(nombre, {"name": nombre})
    nuevo = dict(actual)
    nuevo["models"] = modelos
    nuevo.setdefault("options", {"apiKey": "{env:OPENCODE_API_KEY}"})
    nuevo.setdefault("name", "OpenCode Zen")
    provs[PROVEEDOR] = nuevo
    salida = dict(cfg)
    salida["provider"] = provs
    salida.setdefault("lsp", {"typescript": {"disabled": True}})
    return salida


def hay_clave_zen(entorno=None, ruta_auth=None):
    """¿Hay credencial de Zen? Clave en el entorno o proveedor «opencode» en auth.json.

    Solo mira si EXISTE; nunca devuelve ni registra el valor.
    """
    entorno = os.environ if entorno is None else entorno
    if str((entorno or {}).get("OPENCODE_API_KEY") or "").strip():
        return True
    ruta = ruta_auth or os.path.expanduser("~/.local/share/opencode/auth.json")
    try:
        with open(ruta, encoding="utf-8") as f:
            return PROVEEDOR in (json.load(f) or {})
    except (OSError, ValueError, TypeError):
        return False


# ── efectos (disco y red) ────────────────────────────────────────────────────

def leer_config(ruta=None):
    """La config de opencode leída de disco, o {} si no existe o está mal."""
    ruta = ruta or RUTA_CONFIG
    try:
        with open(ruta, encoding="utf-8") as f:
            cfg = json.load(f)
        return cfg if isinstance(cfg, dict) else {}
    except (OSError, ValueError):
        return {}


def escribir_config(cfg, ruta=None):
    """Deja la config en disco de forma atómica (temporal + replace). No devuelve nada.

    Crea la carpeta si falta. Si falla, lo dice por excepción (que el CLI recoge).
    """
    ruta = ruta or RUTA_CONFIG
    try:
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
    except OSError:
        pass
    temporal = "%s.%d.tmp" % (ruta, os.getpid())
    with open(temporal, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
    os.replace(temporal, ruta)


def sondear_zen(modelo=None, cfg=None, entorno=None):
    """(apto, motivo) de un modelo de Zen con `sonda_escritor`. Sin destino → «sin sonda».

    Zen gratis solo responde DENTRO de opencode: su API da 403 FreeTierError a
    cualquier sonda HTTP, y `sonda_escritor.clasificar` ya lo entiende como apto.
    """
    try:
        import sonda_escritor as SE
    except Exception:
        return None, "sonda_escritor no disponible"
    modelo = modelo or ("%s/%s" % (PROVEEDOR, MODELO_SONDA))
    cfg = RUTA_CONFIG if cfg is None else cfg
    entorno = os.environ if entorno is None else entorno
    apto, motivo, _horas, _muerto = SE.sondear(modelo, cfg, entorno)
    return apto, motivo


def configurar(ruta=None, sondear=True):
    """Configura Zen y (opcional) lo sondea. Devuelve el informe (dict) para el CLI."""
    cfg = leer_config(ruta)
    nuevo = bloque_faltante(cfg)
    escrito = False
    if nuevo is not None:
        escribir_config(nuevo, ruta)
        escrito = True
        cfg = nuevo
    informe = {
        "proveedor": PROVEEDOR,
        "modelos": list(MODELOS_ZEN_GRATIS),
        "escrito": escrito,
        "clave_presente": hay_clave_zen(),
    }
    if sondear:
        apto, motivo = sondear_zen(cfg=cfg)
        informe["sondeo"] = {"modelo": "%s/%s" % (PROVEEDOR, MODELO_SONDA),
                             "apto": apto, "motivo": motivo}
    return informe


def _texto(informe):
    """Informe legible para la terminal (español, sin emojis)."""
    lineas = ["OpenCode Zen · proveedor «%s»" % informe["proveedor"]]
    lineas.append("  config: %s" % ("actualizada" if informe["escrito"] else "ya estaba completa"))
    lineas.append("  clave: %s" % ("presente" if informe["clave_presente"]
                                    else "FALTA (opencode auth login o OPENCODE_API_KEY)"))
    s = informe.get("sondeo")
    if s:
        lineas.append("  sondeo %s: %s — %s" % (s["modelo"],
                      "escribe" if s["apto"] else "no escribe", s["motivo"]))
    return "\n".join(lineas)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Configura y prueba OpenCode Zen.")
    parser.add_argument("--config", action="store_true", help="solo deja el bloque, sin sondear")
    parser.add_argument("--json", action="store_true", help="informe en JSON")
    args = parser.parse_args(argv)
    informe = configurar(sondear=not args.config)
    if args.json:
        print(json.dumps(informe, ensure_ascii=False, indent=1))
    else:
        print(_texto(informe))
    return 0


if __name__ == "__main__":
    sys.exit(main())