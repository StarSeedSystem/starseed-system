# -*- coding: utf-8 -*-
"""Guardia de la config de opencode del enjambre (Ola 1025 · AGT1025E): el orquestador
(`refrescar_bloque_opencode` en starseed-enjambre.py) la escribe con apiKey solo
{env:VARIABLE} o «sin-clave», y lsp.typescript desactivado porque cada tsserver
gastaba ~2 GB en la Mac de 8 GB; un plugin o MCP por fuera (el instalador de
oh-my-opencode-slim) puede lanzar subagentes que se saltan el gobernador. La
auditoría es pura y nunca lanza; leer y main no escriben archivos: Alex decidirá
el enganche. Solo biblioteca estándar."""
import json, os, re, sys
from urllib.parse import urlsplit

REGEX_CLAVE = re.compile(r"^\{env:[A-Z][A-Z0-9_]*\}$")


def _hallazgo(ident, nivel, texto, arreglo):
    return {"id": ident, "nivel": nivel, "texto": texto, "arreglo": arreglo}


def _host_de(url):
    """Host de una URL: ni ruta ni parámetros (podrían traer token) ni credenciales."""
    netloc = urlsplit(url).netloc
    return netloc.rsplit("@", 1)[1] if "@" in netloc else netloc


def auditar_config_opencode(cfg, plugins_admitidos=()):
    """Pura: cfg → lista de hallazgos {"id","nivel","texto","arreglo"}. Nunca lanza:
    plugin externo y clave en claro bloquean; MCP activo, lsp encendido y vetos de
    bash ausentes avisan; entrada ilegible → único hallazgo «config-ilegible»."""
    if not isinstance(cfg, dict) or cfg.get("__ilegible__"):
        return [_hallazgo("config-ilegible", "bloquea",
                          "La configuración no se pudo leer como un objeto JSON válido.",
                          "Regenera ~/.config/opencode/opencode.json con JSON válido.")]
    hallazgos = []
    # Regla 1 · plugin: toda entrada fuera de la lista admitida de Alex → bloquea.
    plugins = cfg.get("plugin")
    if isinstance(plugins, list):
        admitidos = {p for p in plugins_admitidos if isinstance(p, str)}
        for entrada in plugins:
            nombre = entrada if isinstance(entrada, str) else repr(entrada)
            if nombre in admitidos:
                continue
            hallazgos.append(_hallazgo(
                "plugin-externo", "bloquea",
                "El plugin %s no está en la lista admitida del enjambre: puede lanzar "
                "subagentes en paralelo que se saltan el gobernador de recursos." % nombre,
                "Quítalo; solo Alex lo admite con STARSEED_PLUGINS_OPENCODE_ADMITIDOS."))
    # Regla 2 · mcp: activo salvo enabled False (gasta contexto en cada turno).
    mcp = cfg.get("mcp")
    if isinstance(mcp, dict):
        for nombre, definicion in mcp.items():
            if isinstance(definicion, dict) and definicion.get("enabled") is False:
                continue
            destino = ""
            if isinstance(definicion, dict) and isinstance(definicion.get("url"), str):
                destino = " (%s)" % _host_de(definicion["url"])
            hallazgos.append(_hallazgo(
                "mcp-activo", "avisa",
                "El MCP %s está activo%s: gasta contexto en cada turno." % (nombre, destino),
                "Ponle enabled: false si el enjambre no lo necesita."))
    # Regla 3 · apiKey: solo «sin-clave» o {env:VARIABLE}; el texto da id y LONGITUD.
    proveedores = cfg.get("provider")
    if isinstance(proveedores, dict):
        for ident, bloque in proveedores.items():
            opciones = bloque.get("options") if isinstance(bloque, dict) else None
            if not isinstance(opciones, dict):
                continue
            clave = opciones.get("apiKey")
            valido = isinstance(clave, str) and (clave == "sin-clave" or bool(REGEX_CLAVE.match(clave)))
            if clave is None or valido:
                continue
            longitud = len(clave if isinstance(clave, str) else str(clave))
            hallazgos.append(_hallazgo(
                "clave-en-claro", "bloquea",
                "El proveedor %s tiene una apiKey de %d caracteres que no es «sin-clave» "
                "ni la sintaxis literal {env:VARIABLE}: clave en claro en el archivo."
                % (ident, longitud),
                "Sustitúyela por {env:VARIABLE_DE_ENTORNO} o «sin-clave»; el valor real "
                "vive solo en variables de entorno."))
    # Regla 4 · lsp.typescript: cada agente levantaba un tsserver de ~2 GB.
    lsp = cfg.get("lsp")
    typescript = lsp.get("typescript") if isinstance(lsp, dict) else None
    if not (isinstance(typescript, dict) and typescript.get("disabled") is True):
        hallazgos.append(_hallazgo(
            "lsp-typescript", "avisa",
            "lsp.typescript.disabled no está en True: un tsserver gasta ~2 GB en la Mac de 8 GB y puede tumbar el enjambre.",
            "Añade \"lsp\": {\"typescript\": {\"disabled\": true}}."))
    # Regla 5 · permission: la Mac de 8 GB lleva vetos en permission.bash.
    permisos = cfg.get("permission")
    if not isinstance(permisos, dict) or "bash" not in permisos:
        hallazgos.append(_hallazgo(
            "sin-vetos-bash", "avisa",
            "La sección permission no trae vetos de bash (falta, no es objeto o sin la "
            "clave «bash»).",
            "Deja los vetos de permission.bash como los escribe el orquestador."))
    return hallazgos


def leer_config(ruta):
    """JSON de la ruta: ausente → {}; roto o sin dict → {"__ilegible__": True}. Nunca lanza."""
    try:
        with open(os.path.expanduser(ruta), "r", encoding="utf-8") as fichero:
            dato = json.load(fichero)
    except FileNotFoundError:
        return {}
    except Exception:
        return {"__ilegible__": True}
    return dato if isinstance(dato, dict) else {"__ilegible__": True}


def main(argv=None):
    """Imprime {"hallazgos": [...], "bloquea": N} y devuelve 1 si alguno bloquea, 0 si
    no; plugins admitidos en STARSEED_PLUGINS_OPENCODE_ADMITIDOS. No escribe archivos."""
    if argv is None: argv = sys.argv[1:]  # noqa: E701
    ruta = argv[0] if argv else "~/.config/opencode/opencode.json"
    crudos = os.environ.get("STARSEED_PLUGINS_OPENCODE_ADMITIDOS", "")
    admitidos = tuple(p.strip() for p in crudos.split(",") if p.strip())
    hallazgos = auditar_config_opencode(leer_config(ruta), admitidos)
    bloquean = sum(1 for h in hallazgos if h["nivel"] == "bloquea")
    print(json.dumps({"hallazgos": hallazgos, "bloquea": bloquean}, ensure_ascii=False, indent=2))
    return 1 if bloquean else 0
