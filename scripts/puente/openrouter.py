"""OpenRouter: lo que se configura POR PETICIÓN, sin tocar la cuenta de Alex.

(2026-09-20) Alex pidió «configurar el workspace de OpenRouter para mejorar sus contextos y
habilidades». Lo que su panel decide (privacidad, claves con tope, presets) lo hace él; esto es
lo que cada petición nuestra puede llevar y que mejora el enrutamiento de verdad:

- Atribución de app (`HTTP-Referer` + `X-Title`): OpenRouter identifica la app en su panel de
  actividad y en los rankings; sin ella, todo sale como «desconocido».
- Preferencias de proveedor para los gratuitos (`provider`): `require_parameters` obliga a
  enrutar solo a proveedores que soporten TODO lo que pedimos (herramientas incluidas — un
  gratuito sin tools devuelve «sin cambios» en segundos); `sort: throughput` prefiere el que
  más rápido emite; `allow_fallbacks` deja que OpenRouter pruebe otro proveedor del mismo
  modelo si el primero está saturado.
- `transforms: ["middle-out"]`: si el prompt no cabe, OpenRouter recorta el centro en vez
  de devolver 400 por contexto.
Todo son campos estándar del cuerpo o cabeceras: si OpenRouter los retira, los ignora.
"""

SITIO = "https://starseed-os.vercel.app"
# Solo ASCII: el fetch de Bun (opencode) rechaza el punto medio «·» con
# «Header 'x-title' has invalid value» y todo OpenRouter enmudecía (2026-09-20).
TITULO = "StarSeed OS - Puente de Mando"

CABECERAS = {"HTTP-Referer": SITIO, "X-Title": TITULO}

PREFERENCIAS_GRATUITOS = {
    "provider": {"require_parameters": True, "sort": "throughput", "allow_fallbacks": True},
    "transforms": ["middle-out"],
}


def es_openrouter(url):
    return "openrouter.ai" in str(url or "")


def cabeceras(url, base=None):
    """Las cabeceras de `base` más la atribución, solo si la URL es de OpenRouter."""
    fuera = dict(base or {})
    if es_openrouter(url):
        fuera.update(CABECERAS)
    return fuera


def cuerpo(url, cuerpo_base, con_herramientas=True):
    """El cuerpo con las preferencias de enrutamiento, solo para modelos `:free` de OpenRouter.

    `con_herramientas=False` quita `require_parameters`: una sonda de 16 tokens sin tools no
    debe exigir proveedores con tools, o marcaría «sin canal» a modelos que sí escriben."""
    fuera = dict(cuerpo_base or {})
    if not es_openrouter(url) or not str(fuera.get("model", "")).endswith(":free"):
        return fuera
    prefs = {k: (dict(v) if isinstance(v, dict) else list(v)) for k, v in PREFERENCIAS_GRATUITOS.items()}
    if not con_herramientas:
        prefs["provider"].pop("require_parameters", None)
    for k, v in prefs.items():
        fuera.setdefault(k, v)
    return fuera
