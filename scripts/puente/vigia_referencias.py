#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Vigía de referencias: vigilas las novedades de config/referencias-inspiracion.json.

Por entrada mira SOLO los canales de `actualizacion` permitidos: RSS, sitemap con
lastmod, GitHub, npm y la API de Fontshare. Cada novedad se marca con fecha y el
estado vive en starseed_memory_root/referencias/estado.json, donde solo se guardan
URL, título y fecha; nunca contenido de terceros.

Una vez al mes descarga la página de `terminos` de cada entrada y compara su
huella (SHA-256): si cambió, la entrada queda marcada «a revisar» sin tocar su
clase de uso (la juzga una persona, no el vigía).

Buenas maneras: pausa de 10 s por dominio, agente de usuario descriptivo y
robots.txt respetado en los sitemaps. La red, el reloj y la espera son
inyectables: son funciones puras que se prueban sin conexión.
"""

import json
import os
import time
import hashlib
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from urllib.robotparser import RobotFileParser
from xml.etree import ElementTree

RAIZ = os.getcwd()
CONFIG_PATH = os.path.join(RAIZ, "config", "referencias-inspiracion.json")
ESTADO_PATH = os.path.join(RAIZ, "starseed_memory_root", "referencias", "estado.json")
AGENTE_USUARIO = "StarSeedOS-vigia-referencias/1.0 (+https://starseed-os.vercel.app; vigía de novedades de referencias)"
PAUSA_DOMINIO_S = 10.0  # pausa mínima entre peticiones al mismo dominio
DIAS_MES = 30  # «una vez al mes» para la página de términos
MAX_NOVEDADES = 50  # novedades guardadas por entrada
MAX_NOVEDADES_POR_CANAL = 20  # peticiones resumidas por canal revisado
MAX_URLS_FEED = 30  # URLs de feed (vistas) que se recuerdan por canal
MAX_URLS_SITEMAP = 500  # entradas {url: lastmod} guardadas por sitemap


def pedir_url(url, timeout=30):
    """Petición GET con el agente de usuario del vigía: (status, bytes).

    Sin levantar excepciones: un fallo de red es («0», vacío) y entra en la
    cuenta de peticiones del dominio igualmente, para pagar su pausa.
    """
    pedido = urllib.request.Request(url, headers={"User-Agent": AGENTE_USUARIO})
    try:
        with urllib.request.urlopen(pedido, timeout=timeout) as respuesta:
            return respuesta.status, respuesta.read()
    except urllib.error.HTTPError as e:
        try:
            return e.code, e.read()
        except Exception:
            return e.code, b""
    except Exception:
        return 0, b""


def _es_canal_vigilado(canal):
    """True solo para los canales de actualización que esta tarea vigila."""
    tipo = canal.get("tipo")
    if tipo in ("rss", "sitemap", "sitemap-lastmod", "sitemap-parcial",
                "sitemap-respetando-robots", "github", "github-releases", "npm"):
        return True
    if tipo == "api":
        destino = canal.get("url") or canal.get("ref") or ""
        return "fontshare.com" in destino
    return False


def _fecha_iso(texto):
    """Normaliza la fecha de un feed (RFC 822 o ISO 8601) a ISO 8601 UTC o None."""
    if not texto or not isinstance(texto, str):
        return None
    texto = texto.strip()
    try:
        exon = parsedate_to_datetime(texto)
    except (TypeError, ValueError, IndexError):
        try:
            exon = datetime.fromisoformat(texto.replace("Z", "+00:00"))
        except ValueError:
            return None
    if exon.tzinfo is None:
        exon = exon.replace(tzinfo=timezone.utc)
    return exon.astimezone(timezone.utc).isoformat()


def _a_marca(fecha):
    """Convierte una fecha ISO (o texto de feed ya normalizado) a marca de tiempo."""
    if not fecha:
        return None
    try:
        exon = datetime.fromisoformat(str(fecha).replace("Z", "+00:00"))
    except ValueError:
        try:
            return parsedate_to_datetime(str(fecha)).timestamp()
        except (TypeError, ValueError, IndexError):
            return None
    if exon.tzinfo is None:
        exon = exon.replace(tzinfo=timezone.utc)
    return exon.timestamp()


def _elementos_feed(texto, nombre):
    """Lista de elementos «item» o «entry» de un XML de feed; XML roto → []."""
    try:
        raiz = ElementTree.fromstring(texto)
    except ElementTree.ParseError:
        return []
    return [
        e
        for e in raiz.iter()
        if isinstance(e.tag, str) and e.tag.rsplit("}", 1)[-1] == nombre
    ]


def _texto_de(elem, hijo):
    """Texto del primer hijo directo cuyo nombre local coincida, o None."""
    for pos in elem:
        if isinstance(pos.tag, str) and pos.tag.rsplit("}", 1)[-1] == hijo:
            return (pos.text or "").strip()
    return None


def parsear_feed(texto):
    """RSS 2.0 o Atom a [(url, titulo, fecha_iso)] desde el texto del feed."""
    salida = []
    for elem in _elementos_feed(texto, "item") or _elementos_feed(texto, "entry"):
        enlace = _texto_de(elem, "link")
        if enlace is None or enlace == "":
            for pos in elem:  # Atom lleva el enlace como atributo href
                if isinstance(pos.tag, str) and pos.tag.rsplit("}", 1)[-1] == "link":
                    enlace = pos.attrib.get("href") or ""
                    break
        titulo = _texto_de(elem, "title") or ""
        fecha = _fecha_iso(
            (_texto_de(elem, "pubDate") or _texto_de(elem, "updated") or _texto_de(elem, "published"))
        )
        if enlace:
            salida.append((enlace, titulo, fecha))
    return salida


def decidir_rss(texto, estado):
    """Decide las novedades de un feed RSS/Atom a partir de su texto.

    Con estado previo, es novedad una entrada cuyo URL no se había visto o cuya
    fecha es posterior a la última anotada. Devuelve (estado_nuevo, novedades),
    con novedades como pares {url, titulo, fecha} sin decorar la entrada.
    """
    estado_c = dict(estado or {})
    es_primera = "urls_vistas" not in estado_c
    vistas = list(estado_c.get("urls_vistas", []))
    ultima = estado_c.get("ultima_fecha")
    marca_ultima = _a_marca(ultima) if ultima else None
    nuevas = []
    vistos = set(vistas)
    items = parsear_feed(texto)
    for url, titulo, fecha in items:
        es_nueva = url not in vistos
        if fecha and marca_ultima and _a_marca(fecha) > marca_ultima:
            es_nueva = True
        if not es_nueva or es_primera:
            continue
        nuevas.append({"url": url, "titulo": titulo, "fecha": fecha or None})
    fechas = [f for _, _, f in items if f]
    estado_c["urls_vistas"] = list(dict.fromkeys(u for u, _, _ in items))[:MAX_URLS_FEED]
    if fechas:
        estado_c["ultima_fecha"] = max(fechas, key=lambda f: _a_marca(f) or 0)
    return estado_c, nuevas[:MAX_NOVEDADES_POR_CANAL]


def parsear_sitemap(texto):
    """Sitemap XML (urlset o índice) a {url: lastmod_isó_o_None}; XML roto → {}."""
    try:
        raiz = ElementTree.fromstring(texto)
    except ElementTree.ParseError:
        return {}
    locales = {}
    for elem in raiz.iter():
        if not isinstance(elem.tag, str):
            continue
        hijo = elem.tag.rsplit("}", 1)[-1]
        if hijo not in ("url", "sitemap"):
            continue
        redes = {
            pos.tag.rsplit("}", 1)[-1]: (pos.text or "").strip()
            for pos in elem if isinstance(pos.tag, str)
        }
        loc = redes.get("loc")
        if loc:
            locales[loc] = _fecha_iso(redes.get("lastmod"))
    return locales


def decidir_sitemap(texto, estado):
    """Sitemap con lastmod: genera novedades si hay URL nueva o lastmod cambiado."""
    estado_c = dict(estado or {})
    es_primera = "url_fechas" not in estado_c
    previo = estado_c.get("url_fechas", {})
    actual = parsear_sitemap(texto)
    nuevas = []
    for urlr, fecha in actual.items():
        previa = previo.get(urlr)
        if (previa is None or previa != fecha) and not es_primera:
            nuevas.append({"url": urlr, "titulo": "", "fecha": fecha or None})
    if previo and not actual:
        return dict(estado_c), []
    nuevo_mapa = dict(actual)
    quequedan = [
        (u, f) for u, f in previo.items() if u not in actual
    ]
    if len(nuevo_mapa) < MAX_URLS_SITEMAP and quequedan:
        for u, f in quequedan[:MAX_URLS_SITEMAP - len(nuevo_mapa)]:
            nuevo_mapa.setdefault(u, f)
    estado_c["url_fechas"] = nuevo_mapa
    return estado_c, nuevas[:MAX_NOVEDADES_POR_CANAL]


def url_github(tipo, ref):
    """URL de la API de GitHub para el último commit o la última release."""
    base = "https://api.github.com/repos/" + ref
    if tipo == "github-releases":
        return base + "/releases/latest"
    return base + "/commits?per_page=1"


def _url_npm(paquete):
    """URL del registro npm para la última versión publicada del paquete."""
    return "https://registry.npmjs.org/" + urllib.parse.quote(paquete, safe="") + "/latest"


def decidir_github(cuerpo, estado):
    """Última referencia de GitHub (sha o tag): novedad si cambia la anterior."""
    estado_c = dict(estado or {})
    try:
        datos = json.loads(cuerpo)
    except ValueError:
        return estado_c, []
    nueva = None
    fecha = None
    if isinstance(datos, list) and datos:
        commit = datos[0].get("commit") or {}
        committer = commit.get("committer") or {}
        nueva = datos[0].get("sha")
        fecha = _fecha_iso(committer.get("date"))
    elif isinstance(datos, dict):
        nueva = datos.get("tag_name")
        fecha = _fecha_iso(datos.get("published_at"))
    if not nueva:
        return estado_c, []
    anterior = estado_c.get("ref_ultima")
    estado_c["ref_ultima"] = nueva
    if fecha:
        estado_c["ultima_fecha_ref"] = fecha
    si_hubo = bool(anterior and nueva != anterior)
    novedad = [{"url": None, "titulo": nueva, "fecha": fecha or None}] if si_hubo else []
    return estado_c, novedad


def decidir_npm(cuerpo, estado):
    """Última versión de un paquete npm: novedad si la versión es otra."""
    estado_c = dict(estado or {})
    try:
        datos = json.loads(cuerpo)
    except ValueError:
        return estado_c, []
    version = datos.get("version") if isinstance(datos, dict) else None
    if not version:
        return estado_c, []
    anterior = estado_c.get("version_ultima")
    estado_c["version_ultima"] = version
    fecha = _fecha_iso(datos.get("_npmUser", {}).get("date")) if isinstance(datos, dict) else None
    si_hubo = bool(anterior and version != anterior)
    novedad = [{"url": None, "titulo": version, "fecha": fecha or None}] if si_hubo else []
    return estado_c, novedad


def decidir_huella(cuerpo, estado):
    """Huella SHA-256 de una respuesta (API de Fontshare): novedad si cambia."""
    estado_c = dict(estado or {})
    huella = _hash_contenido(
        cuerpo.encode("utf-8") if isinstance(cuerpo, str) else cuerpo
    )
    anterior = estado_c.get("huella")
    estado_c["huella"] = huella
    si_hubo = bool(anterior and huella != anterior)
    novedad = [{"url": None, "titulo": huella[:12], "fecha": None}] if si_hubo else []
    return estado_c, novedad


def decidir_terminos(cuerpo, hash_previo):
    """Huella de una página de términos: (hash_actual, cambio).

    La primera vez no marca cambio (no hay con qué comparar); cuando ya hay
    hash previo y la página cambió, la entrada queda «a revisar».
    """
    hash_actual = _hash_contenido(cuerpo)
    cambio = bool(hash_previo and hash_actual != hash_previo)
    return hash_actual, cambio


def _debe_verificar_terminos(ultima_verificacion, ahora):
    """True si la última verificación de términos fue hace más de un mes."""
    if not ultima_verificacion:
        return True
    try:
        ultima = datetime.fromisoformat(str(ultima_verificacion).replace("Z", "+00:00"))
    except ValueError:
        return True
    if ultima.tzinfo is None:
        ultima = ultima.replace(tzinfo=timezone.utc)
    return (ahora - ultima).total_seconds() >= timedelta(days=DIAS_MES).total_seconds()


def _robots_permite(texto_robots, url, agente):
    """True si el robots.txt del texto permite pedir esa URL.

    Un robots.txt que no se puede leer no bloquea: sin reglas no hay veto.
    """
    filtro = RobotFileParser()
    if texto_robots:
        filtro.parse(texto_robots.splitlines())
        return filtro.can_fetch(agente, url)
    return True  # robots.txt ausente o ilegible: sin reglas no hay veto


def _esperar_dominio(dominio, ultimo_uso, reloj, dormir, pausa=PAUSA_DOMINIO_S):
    """Aplica la pausa mínima por dominio ANTES de una petición.

    Anota el dominio con el instante de esta petición (que es ahora): la
    siguiente petición al mismo dominio tendrá que esperar lo que falte.
    """
    si_hubo = ultimo_uso.get(dominio)
    instante = reloj()
    if si_hubo is not None:
        falta = pausa - (instante - si_hubo)
        if falta > 0:
            dormir(round(falta, 3))
            instante = reloj()
    ultimo_uso[dominio] = instante


def _procesar_canal(canal, estado, descargar, ahora_iso, reloj, dormir, ultimo_uso):
    """Un canal de actualización: descarga, decide y devuelve (estado_nuevo, novedades).

    Las novedades ya vienen decoradas con fecha, canal y URL de la entrada.
    Los canales no vigilados (blog, changelog, hash-html, youtube…) pasan de
    largo sin marcar nada y sin pedir nada, como pide la tarea.
    """
    tipo = canal.get("tipo")
    destino = canal.get("ref") or canal.get("url") or ""
    if not _es_canal_vigilado(canal) or not destino:
        return dict(estado or {}), []
    dominio = _obtener_dominio(destino)
    if tipo.startswith("sitemap"):
        # Primera petición al dominio: su robots.txt, con la misma pausa.
        _esperar_dominio(dominio, ultimo_uso, reloj, dormir)
        estado_robots, cuerpo_robots = descargar("https://" + dominio + "/robots.txt")
        texto_robots = (
            cuerpo_robots.decode("utf-8", "replace") if estado_robots == 200 else ""
        )
        if not _robots_permite(texto_robots, destino, AGENTE_USUARIO):
            return dict(estado or {}), []
        _esperar_dominio(dominio, ultimo_uso, reloj, dormir)
        estado_http, cuerpo = descargar(destino)
        if estado_http != 200:
            return dict(estado or {}), []
        return decidir_sitemap(cuerpo.decode("utf-8", "replace"), estado)
    _esperar_dominio(dominio, ultimo_uso, reloj, dormir)
    estado_http, cuerpo = descargar(
        url_github(tipo, destino) if tipo.startswith("github")
        else _url_npm(destino) if tipo == "npm"
        else destino
    )
    if estado_http != 200:
        return dict(estado or {}), []
    texto = cuerpo.decode("utf-8", "replace")
    if tipo == "rss":
        estado_nuevo, novedades = decidir_rss(texto, estado)
    elif tipo.startswith("github"):
        estado_nuevo, novedades = decidir_github(texto, estado)
    elif tipo == "npm":
        estado_nuevo, novedades = decidir_npm(texto, estado)
    else:  # API de Fontshare: huella de la respuesta
        estado_nuevo, novedades = decidir_huella(texto, estado)
    return estado_nuevo, novedades


def vigilar(config, estado=None, ahora=None, reloj=time.monotonic, dormir=time.sleep,
            descargar=pedir_url):
    """Vigila el catálogo entero: (estado_nuevo, cambios) sin tocar su disco.

    Solo los canales permitidos de cada entrada piden nada; los demás quedan
    anotados como no vigilados. Los `terminos` se comprueban como mucho una
    vez al mes: si su página cambió, la entrada queda «a revisar» y la clase de
    uso, intacta. El estado solo lleva URL, título, fecha y huellas.
    """
    ahora = ahora or datetime.now(timezone.utc)
    ahora_iso = ahora.isoformat()
    estado = dict(estado or {})
    ultimo_uso = {}
    estado_nuevo = {}
    cambios = []
    for entrada in (config or {}).get("entradas", []):
        id_entrada = entrada.get("id")
        if not id_entrada:
            continue
        st = dict(estado.get(id_entrada) or {})
        st["nombre"] = entrada.get("nombre", "")
        st["clase_uso"] = entrada.get("clase_uso")
        nuevas_novedades = []
        no_vigilados = []
        canales = dict(st.get("canales") or {})
        for canal in entrada.get("actualizacion", []):
            if not _es_canal_vigilado(canal):
                if canal.get("tipo"):
                    no_vigilados.append(canal["tipo"])
                continue
            st_canal = dict(canales.get(canal.get("tipo")) or {})
            estado_c, novedades = _procesar_canal(
                canal, st_canal, descargar, ahora_iso, reloj, dormir, ultimo_uso
            )
            if estado_c:
                st_canal = estado_c
                canales[canal.get("tipo")] = st_canal
            for cada_nueva in novedades:
                nuevas_novedades.append({
                    "fecha": ahora_iso,
                    "canal": canal.get("tipo"),
                    "url": cada_nueva.get("url") or entrada.get("url"),
                    "titulo": cada_nueva.get("titulo") or "",
                })
        st["canales"] = canales
        if no_vigilados:
            st["canales_no_vigilados"] = no_vigilados
        if nuevas_novedades:
            resumen = {
                "id": id_entrada,
                "nombre": entrada.get("nombre", ""),
                "tipo": "novedades",
                "fecha": ahora_iso,
                "canales": sorted({n["canal"] for n in nuevas_novedades}),
                "cuantas": len(nuevas_novedades),
            }
            cambios.append(resumen)
        terminos = entrada.get("terminos")
        if terminos and _debe_verificar_terminos(st.get("ultima_verificacion_terminos"), ahora):
            _esperar_dominio(
                _obtener_dominio(terminos) or "terminos", ultimo_uso, reloj, dormir
            )
            estado_http, cuerpo = descargar(terminos)
            if estado_http == 200:
                hash_nuevo, cambio = decidir_terminos(
                    cuerpo, st.get("hash_terminos")
                )
                st["hash_terminos"] = hash_nuevo
                if cambio:
                    st["a_revisar"] = True  # la clase de uso NO se cambia sola
                    cambios.append({
                        "id": id_entrada,
                        "nombre": entrada.get("nombre", ""),
                        "tipo": "terminos",
                        "fecha": ahora_iso,
                        "url": terminos,
                    })
            st["ultima_verificacion_terminos"] = ahora_iso
        st["novedades"] = (nuevas_novedades + list(st.get("novedades") or []))[:MAX_NOVEDADES]
        st["ultima_verificacion"] = ahora_iso
        estado_nuevo[id_entrada] = st
    return estado_nuevo, cambios


def _cargar_json(ruta, por_defecto):
    """Carga un archivo JSON; si no existe o no es válido, devuelve el defecto."""
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return por_defecto


def _guardar_json(ruta, datos):
    """Guarda datos como JSON, creando el directorio si hace falta."""
    carpeta = os.path.dirname(ruta)
    if carpeta:
        os.makedirs(carpeta, exist_ok=True)
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)


def _obtener_dominio(url):
    """Devuelve el dominio (netloc) de una URL, en minúsculas; «» si no parsea."""
    try:
        return urllib.parse.urlparse(url).netloc.lower()
    except ValueError:
        return ""


def _hash_contenido(contenido):
    """Huella SHA-256 de unos bytes, en hexadecimal."""
    return hashlib.sha256(contenido).hexdigest()


def ejecutar(raiz=None, descargar=pedir_url, reloj=None, dormir=None):
    """Carga catálogo y estado del disco, vigila y guarda el estado nuevo."""
    base = raiz or RAIZ
    config = _cargar_json(
        os.path.join(base, "config", "referencias-inspiracion.json"), {"entradas": []}
    )
    estado = _cargar_json(
        os.path.join(base, "starseed_memory_root", "referencias", "estado.json"), {}
    )
    opciones = {"descargar": descargar}
    if reloj is not None:
        opciones["reloj"] = reloj
    if dormir is not None:
        opciones["dormir"] = dormir
    estado_nuevo, cambios = vigilar(config, estado, **opciones)
    _guardar_json(
        os.path.join(base, "starseed_memory_root", "referencias", "estado.json"),
        estado_nuevo,
    )
    return cambios


def main(argv=None, imprimir=print):
    """Punto de entrada: vigila e imprime los avisos como línea de cada uno."""
    try:
        cambios = ejecutar()
        novedades = [c for c in cambios if c["tipo"] == "novedades"]
        terminos = [c for c in cambios if c["tipo"] == "terminos"]
        imprimir(
            "Vigía de referencias: %d entradas con novedades, %d con términos cambiados"
            % (len(novedades), len(terminos))
        )
        for c in novedades:
            imprimir(
                " avisar novedades · %s · canales %s (%d)"
                % (c["nombre"], ", ".join(c["canales"]), c["cuantas"])
            )
        for c in terminos:
            imprimir(" avisar a revisar · %s · sus términos cambiaron: %s" % (c["nombre"], c["url"]))
        return 0
    except Exception as e:  # el vigilante no tumba al que lo invoca
        imprimir("Vigía de referencias: error inesperado - %s" % e)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
