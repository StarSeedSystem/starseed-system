#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Vigía de referencias (Ola 1018R · tarea RFI1018Lb).

Lee config/referencias-inspiracion.json y, por entrada, SOLO sus canales de
`actualizacion` permitidos (RSS, sitemap con lastmod, GitHub, npm y la API de
Fontshare): marca novedades con fecha y guarda el estado en
starseed_memory_root/referencias/estado.json (nunca contenido de terceros,
solo URL, título y fecha). Una vez al mes descarga la página de `terminos` y
compara su huella SHA-256: si cambió, deja la entrada «a revisar» sin tocar
jamás su clase de uso. Pausa mínima de 10 s por dominio, agente de usuario
descriptivo y robots.txt respetado antes de cada petición.

La red, el reloj y la espera son inyectables, así que las pruebas son puras
y sin conexión: `vigilar_referencias(raiz, obtener_url, dormir, ahora)`.
"""

import hashlib
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib.robotparser import RobotFileParser

# Raíz del repositorio: este archivo vive en scripts/puente/, así que son dos niveles por encima
# de su carpeta (la misma forma que aprobador_automatico.py, asignar_huecos.py y los demás vecinos).
DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(DIRECTORIO))
CONFIG_PATH = os.path.join(RAIZ, "config", "referencias-inspiracion.json")
ESTADO_PATH = os.path.join(RAIZ, "starseed_memory_root", "referencias", "estado.json")
AGENTE_USUARIO = "StarSeedOS-VigiaReferencias/1.0 (+https://starseed-os.vercel.app; vigía de novedades de la Biblioteca)"
PAUSA_POR_DOMINIO_S = 10.0
HORAS_MES = 24 * 30
MAX_NOVEDADES = 20

# Canales que la tarea permite rastrear; cualquier otro (blog, changelog,
# página, canal de YouTube, hash-html, sitemap sin lastmod…) se salta.
TIPOS_PERMITIDOS = ("rss", "sitemap-lastmod", "github", "github-releases", "npm", "api")


def cargar_json(ruta, por_defecto):
    """Devuelve el JSON de `ruta`, o `por_defecto` si falta o está roto."""
    try:
        with open(ruta, encoding="utf-8") as fichero:
            return json.load(fichero)
    except (OSError, ValueError):
        return por_defecto


def guardar_json(ruta, datos):
    """Escribe `datos` como JSON, creando la carpeta si no existe."""
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, "w", encoding="utf-8") as fichero:
        json.dump(datos, fichero, ensure_ascii=False, indent=1)


def canal_permitido(canal):
    """True solo si el canal de `actualizacion` es de los permitidos por la tarea."""
    tipo = canal.get("tipo")
    if tipo not in TIPOS_PERMITIDOS:
        return False
    if tipo == "api":
        url = canal.get("ref") or canal.get("url") or ""
        # La única API permitida como canal es la de Fontshare (ITF FFL).
        return "fontshare.com" in url
    return True


def obtener_dominio(url):
    """Dominio en minúsculas de una URL, o cadena vacía si no sabe sacarlo."""
    try:
        return urllib.parse.urlparse(url).netloc.lower()
    except (ValueError, AttributeError):
        return ""


def huella_sha256(contenido):
    """Huella SHA-256 hexadecimal del contenido en bytes."""
    return hashlib.sha256(contenido).hexdigest()


def fecha_a_iso(texto):
    """Convierte la fecha de un feed o sitemap a ISO UTC («…Z»); None si no se entiende."""
    limpio = (texto or "").strip()
    if not limpio:
        return None
    try:
        fecha = parsedate_to_datetime(limpio)
    except (TypeError, ValueError):
        try:
            fecha = datetime.fromisoformat(limpio.replace("Z", "+00:00"))
        except ValueError:
            return None
    if fecha.tzinfo is None:
        fecha = fecha.replace(tzinfo=timezone.utc)
    return fecha.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _nodo_texto(padre, etiqueta):
    """Texto recortado del primer hijo `etiqueta`, o None."""
    nodo = padre.find(etiqueta)
    if nodo is not None and nodo.text and nodo.text.strip():
        return nodo.text.strip()
    return None


def parsear_rss(cuerpo):
    """Extrae [{titulo, url, fecha}] de un feed RSS 2.0 o Atom; puro, sin red."""
    try:
        raiz_xml = ET.fromstring(cuerpo)
    except ET.ParseError:
        return []
    atom = "{http://www.w3.org/2005/Atom}"
    dc = "{http://purl.org/dc/elements/1.1/}"
    items = []
    for elemento in list(raiz_xml.iter(f"{atom}entry")) + list(raiz_xml.iter("item")):
        if elemento.tag == f"{atom}entry":
            titulo = _nodo_texto(elemento, f"{atom}title") or ""
            enlace = None
            for hipervinculo in elemento.findall(f"{atom}link"):
                destino = hipervinculo.get("href")
                if destino and destino.strip():
                    enlace = destino.strip()
                    break
                enlace = destino
            fecha = _nodo_texto(elemento, f"{atom}published") or _nodo_texto(elemento, f"{atom}updated")
        else:
            titulo = _nodo_texto(elemento, "title") or ""
            enlace = _nodo_texto(elemento, "link")
            fecha = (_nodo_texto(elemento, "pubDate") or _nodo_texto(elemento, "date")
                     or _nodo_texto(elemento, f"{dc}date"))
        fecha_iso = fecha_a_iso(fecha)
        if enlace:
            items.append({"titulo": titulo, "url": enlace, "fecha": fecha_iso})
    return items


def parsear_sitemap(cuerpo):
    """Extrae {url: lastmod_iso} de un sitemap <urlset>; puro, sin red.

    Solo guarda las <url> que traen <lastmod> entendible: sin fecha de
    última modificación el canal no se puede vigilar por lastmod.
    """
    try:
        raiz_xml = ET.fromstring(cuerpo)
    except ET.ParseError:
        return {}
    urls = {}
    for nodo in raiz_xml.iter():
        if nodo.tag.rsplit("}", 1)[-1] != "url":
            continue
        localizacion = None
        ultima_modificacion = None
        for hijo in nodo:
            nombre = hijo.tag.rsplit("}", 1)[-1]
            if nombre == "loc" and hijo.text and hijo.text.strip():
                localizacion = hijo.text.strip()
            elif nombre == "lastmod" and hijo.text and hijo.text.strip():
                ultima_modificacion = hijo.text.strip()
        if localizacion and ultima_modificacion:
            iso = fecha_a_iso(ultima_modificacion)
            if iso:
                urls[localizacion] = iso
    return urls


def novedades_rss(items, ultima_fecha, limite=MAX_NOVEDADES):
    """Elementos del feed posteriores a la última fecha vista; puro.

    La primera pasada (sin `ultima_fecha`) solo fija el punto de partida del
    canal: no suelta novedades porque serían el histórico entero.
    """
    if not items or not ultima_fecha:
        return []
    nuevas = [i for i in items if i.get("fecha") and i["fecha"] > ultima_fecha]
    nuevas.sort(key=lambda i: i["fecha"], reverse=True)
    return nuevas[:limite]


def novedades_sitemap(ultima_modificacion, checkpoint, limite=MAX_NOVEDADES):
    """URLs con lastmod posterior al checkpoint; puro. Devuelve (novedades, checkpoint).

    La primera pasada (sin `checkpoint`) solo fija la línea base del sitemap.
    """
    maximo = max((f for f in ultima_modificacion.values() if f), default="")
    base = checkpoint or ""
    novedades = []
    if base:
        for url, fecha in sorted(ultima_modificacion.items(), key=lambda par: par[1], reverse=True):
            if fecha > base:
                novedades.append({"url": url, "titulo": url, "fecha": fecha})
        novedades = novedades[:limite]
    nuevo_checkpoint = max(maximo, base) if (maximo or base) else ""
    return novedades, nuevo_checkpoint


def url_github(referencia, releases=False):
    """URL oficial de la API de GitHub para commits o última release del repo."""
    if releases:
        return f"https://api.github.com/repos/{referencia}/releases/latest"
    return f"https://api.github.com/repos/{referencia}/commits?per_page=1"


def extraer_marca_github(cuerpo, releases):
    """Marca de comparación (sha del último commit o tag de la release); puro."""
    try:
        datos = json.loads(cuerpo)
    except (ValueError, TypeError):
        return None
    try:
        return datos.get("tag_name") if releases else datos[0].get("sha")
    except (AttributeError, IndexError):
        return None


def url_npm(paquete):
    """URL del registro npm con la última versión del paquete."""
    return f"https://registry.npmjs.org/{urllib.parse.quote(paquete, safe='@/')}/latest"


def extraer_version_npm(cuerpo):
    """Versión «dist-tags.latest» que responde el registro npm; puro."""
    try:
        datos = json.loads(cuerpo)
    except (ValueError, TypeError):
        return None
    version = datos.get("version") if isinstance(datos, dict) else None
    return version if isinstance(version, str) and version else None


def huella_fontshare(cuerpo):
    """Huella corta del catálogo de fuentes de Fontshare (solo ids); puro.

    Devuelve «<total>/<prefijo del hash de los ids ordenados>» o None si la
    respuesta no se entiende; nunca guardamos los ids, solo su huella.
    """
    try:
        datos = json.loads(cuerpo)
    except (ValueError, TypeError):
        return None
    fuentes = datos.get("fonts") if isinstance(datos, dict) else datos
    if not isinstance(fuentes, list):
        return None
    ids = sorted(str(f.get("id", "")) if isinstance(f, dict) else str(f) for f in fuentes)
    huella = huella_sha256(json.dumps(ids, ensure_ascii=False).encode("utf-8"))[:16]
    return f"{len(ids)}/{huella}"


def robots_permiten(texto, url, agente=AGENTE_USUARIO):
    """True si robots.txt no prohíbe la URL a nuestro agente; puro (sin red).

    Sin robots.txt disponible se considera permitido (así lo treatan los
    rastreadores estándar: un 404 de robots.txt no prohíbe nada).
    """
    if not texto:
        return True
    robot = RobotFileParser()
    robot.parse(texto.decode("utf-8", "replace").splitlines())
    try:
        return bool(robot.can_fetch(agente, url))
    except Exception:
        return True


def pausa_restante(segundos_previos, segundos_ahora, minimo=PAUSA_POR_DOMINIO_S):
    """Segundos que faltan para volver a pedir al mismo dominio; puro."""
    if segundos_previos is None:
        return 0.0
    faltante = minimo - (segundos_ahora - segundos_previos)
    return faltante if faltante > 0 else 0.0


def _debe_verificar_terminos(verificacion_iso, ahora):
    """True si toca releer los términos: nunca verificados o hace más de un mes."""
    if not verificacion_iso:
        return True
    try:
        ultima = datetime.fromisoformat(str(verificacion_iso).replace("Z", "+00:00"))
        despegue = (ahora - ultima).total_seconds()
    except ValueError:
        return True
    return abs(despegue) >= HORAS_MES * 3600


def obtener_url_http(url, timeout=30):
    """GET con agente de usuario descriptivo; los bytes o None en error de red."""
    peticion = urllib.request.Request(url, headers={"User-Agent": AGENTE_USUARIO})
    try:
        with urllib.request.urlopen(peticion, timeout=timeout) as respuesta:
            return respuesta.read()
    except (urllib.error.URLError, OSError, ValueError):
        return None


def _descargar(url, contexto):
    """Pide una URL respetando robots.txt y la pausa por dominio; None si no toca.

    `contexto` lleva obtener_url (inyectable), dormir (inyectable), y los
    registros de última petición por dominio y la caché de robots.txt.
    """
    dominio = obtener_dominio(url)
    if not dominio:
        return None
    robots_vistos = contexto["robots_vistos"]
    if dominio not in robots_vistos:
        robots_vistos[dominio] = robots_permiten(
            contexto["obtener_url"](f"https://{dominio}/robots.txt"), url)
    if not robots_vistos[dominio]:
        return None
    registros = contexto["registros"]
    contexto["dormir"](pausa_restante(registros.get(dominio), time.monotonic()))
    registros[dominio] = time.monotonic()
    return contexto["obtener_url"](url)


def _canal_rss(url, estado, contexto):
    """Devuelve las novedades de un feed RSS/Atom y actualiza su checkpoint."""
    cuerpo = _descargar(url, contexto)
    if not cuerpo:
        return []
    items = parsear_rss(cuerpo)
    fechas = [i["fecha"] for i in items if i.get("fecha")]
    maximo = max(fechas) if fechas else None
    ultima = estado.get("ultima_fecha_rss")
    if maximo and (not ultima or maximo > ultima):
        estado["ultima_fecha_rss"] = maximo
    return novedades_rss(items, ultima)


def _canal_sitemap(url, estado, contexto):
    """Devuelve las URLs con lastmod nuevo y actualiza el checkpoint del sitemap."""
    cuerpo = _descargar(url, contexto)
    if not cuerpo:
        return []
    ultimas = parsear_sitemap(cuerpo)
    novedades, checkpoint = novedades_sitemap(ultimas, estado.get("ultima_fecha_sitemap"))
    if checkpoint:
        estado["ultima_fecha_sitemap"] = checkpoint
    return novedades


def _canal_github(tipo, referencia, estado, fecha_iso, contexto):
    """Compara el último commit o tag de release de un repo de GitHub."""
    if "/" not in referencia:
        return []
    es_release = tipo == "github-releases"
    marca = extraer_marca_github(_descargar(url_github(referencia, es_release), contexto), es_release)
    if not marca:
        return []
    clave = "marca_release" if es_release else "marca_commit"
    anterior = estado.get(clave)
    estado[clave] = marca
    if not anterior or marca == anterior:
        return []  # primera revisión (fija la línea base) o sin cambios
    return [{"tipo": tipo, "url": f"https://github.com/{referencia}",
             "titulo": f"{referencia} → {marca}", "fecha": fecha_iso}]


def _canal_npm(paquete, estado, fecha_iso, contexto):
    """Compara la última versión del paquete en el registro npm."""
    version = extraer_version_npm(_descargar(url_npm(paquete), contexto))
    if not version:
        return []
    anterior = estado.get("version_npm")
    estado["version_npm"] = version
    if not anterior or version == anterior:
        return []
    return [{"tipo": "npm", "url": f"https://www.npmjs.com/package/{paquete}",
             "titulo": f"{paquete} {version}", "fecha": fecha_iso}]


def _canal_fontshare(url, estado, fecha_iso, contexto):
    """Compara la huella del catálogo de fuentes de la API de Fontshare."""
    marca = huella_fontshare(_descargar(url, contexto))
    if not marca:
        return []
    anterior = estado.get("huella_fontshare")
    estado["huella_fontshare"] = marca
    if not anterior or marca == anterior:
        return []
    return [{"tipo": "api", "url": url, "titulo": "Fontshare: catálogo de fuentes cambiado",
             "fecha": fecha_iso}]


def _rastrear_canal(canal, estado, fecha_iso, contexto):
    """Vigila un canal de `actualizacion` si es permitido; si no, lo salta."""
    if not canal_permitido(canal):
        return []
    url = canal.get("ref") or canal.get("url")
    tipo = canal.get("tipo")
    if not url:
        return []
    if tipo == "rss":
        resultados = _canal_rss(url, estado, contexto)
    elif tipo == "sitemap-lastmod":
        resultados = _canal_sitemap(url, estado, contexto)
    elif tipo in ("github", "github-releases"):
        resultados = _canal_github(tipo, url, estado, fecha_iso, contexto)
    elif tipo == "npm":
        resultados = _canal_npm(url, estado, fecha_iso, contexto)
    elif tipo == "api":
        resultados = _canal_fontshare(url, estado, fecha_iso, contexto)
    else:
        resultados = []
    for novedad in resultados:
        novedad.setdefault("tipo", tipo)
    return resultados


def _verificar_terminos(entrada, estado, fecha_iso, momento, contexto, salida):
    """Lee la página de `terminos` al mes y deja la entrada «a revisar» si cambió.

    Nunca borra el aviso ni toca la clase de uso: eso lo revisa Claude o Alex.
    """
    url = entrada.get("terminos")
    if not url or not _debe_verificar_terminos(estado.get("verificacion_terminos"), momento):
        return
    cuerpo = _descargar(url, contexto)
    if cuerpo:
        huella = huella_sha256(cuerpo)
        anterior = estado.get("huella_terminos")
        if anterior and anterior != huella:
            estado["a_revisar"] = True
            salida.append({"id": entrada.get("id", ""), "nombre": entrada.get("nombre", ""),
                           "tipo": "terminos", "url": url,
                           "titulo": f"{entrada.get('nombre', '')} cambió sus términos",
                           "fecha": fecha_iso})
        estado["huella_terminos"] = huella
    estado["verificacion_terminos"] = fecha_iso


def vigilar_referencias(raiz=RAIZ, obtener_url=obtener_url_http, dormir=time.sleep, ahora=None):
    """Recorre el catálogo y devuelve las novedades encontradas (también en estado).

    Todo es inyectable: la raíz (para los caminos de config y estado), cómo
    se piden las URLs (HTTP real o falso en pruebas), cómo se espera la
    pausa de 10 s por dominio (dormir real o registrado en pruebas) y el reloj.
    """
    config = cargar_json(os.path.join(raiz, "config", "referencias-inspiracion.json"),
                         {"entradas": []})
    ruta_estado = os.path.join(raiz, "starseed_memory_root", "referencias", "estado.json")
    estado = cargar_json(ruta_estado, {})
    momento = ahora or datetime.now(timezone.utc)
    fecha_iso = momento.strftime("%Y-%m-%dT%H:%M:%SZ")
    contexto = {"obtener_url": obtener_url, "dormir": dormir, "registros": {}, "robots_vistos": {}}
    salida = []
    for entrada in config.get("entradas", []):
        identificador = entrada.get("id")
        if not identificador:
            continue
        estado_entrada = estado.setdefault(identificador, {})
        nuevas = []
        for canal in entrada.get("actualizacion") or []:
            nuevas.extend(_rastrear_canal(canal, estado_entrada, fecha_iso, contexto))
        nuevas = nuevas[:MAX_NOVEDADES]
        if nuevas:
            previas = estado_entrada.get("novedades") or []
            estado_entrada["novedades"] = (nuevas + previas)[:MAX_NOVEDADES]
        _verificar_terminos(entrada, estado_entrada, fecha_iso, momento, contexto, salida)
        estado_entrada["ultima_revision"] = fecha_iso
        nombre = entrada.get("nombre", identificador)
        for novedad in nuevas:
            salida.append({"id": identificador, "nombre": nombre, **novedad})
    guardar_json(ruta_estado, estado)
    return salida


def main():
    """Punto de entrada del vigía: una revisión completa por consola."""
    try:
        novedades = vigilar_referencias()
    except Exception as error:  # noqa: BLE001 — el latido nunca muere por un canal
        print(f"Vigía de referencias: error inesperado — {error}")
        return 1
    if novedades:
        print(f"Vigía de referencias: {len(novedades)} novedades")
        for novedad in novedades:
            print(f"  - {novedad['nombre']} ({novedad['tipo']}): {novedad['titulo']} · {novedad['fecha']}")
    else:
        print("Vigía de referencias: sin novedades")
    return 0


if __name__ == "__main__":
    exit(main())
