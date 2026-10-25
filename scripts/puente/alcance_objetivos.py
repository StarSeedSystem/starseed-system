"""alcance_objetivos · almacén PRIVADO del agente de alcance (R1, R5, R8).
`~/.starseed/alcance/` (carpeta 700, archivos 600), NUNCA bajo `starseed_memory_root`
que se espeja a Drive (R5); de lo delicado, SOLO hashes SHA-256. Módulo puro de stdlib."""
import hashlib
import json
import os

ARCHIVO_OBJETIVOS, ARCHIVO_SUPRESION = "objetivos.json", "supresion.json"
PERMISO_CARPETA, PERMISO_ARCHIVO = 0o700, 0o600
TIPOS, NIVELES = ("persona", "proyecto", "organizacion"), ("alto", "medio", "bajo")
CATEGORIAS = ("activista", "desarrollador", "influencer", "proyecto-afin", "fundacion", "otro")
AFINIDAD_MAXIMA, DIA, TOPE_DIARIO_DEFECTO = 300, 86400, 5
PLAZO_RECORDATORIO, PAUSA_RECHAZO_ALEX, PAUSA_RECHAZO_DESTINATARIO = 14 * DIA, 90 * DIA, 180 * DIA
# R5: nada de salud, religión o creencias personales, orientación, política personal, familia, ubicación privada, ingresos ni teléfonos personales.
TEXTOS_PROHIBIDOS = ("domicilio;diagnóstico;diagnostico;enfermedad;medicación;medicacion;"
                     "salud;ansiedad;depresión;depresion;religio;creencias;"
                     "orientación;orientacion;política personal;partido;esposa;esposo;pareja;"
                     "hijos;familia;ingresos;sueldo;salario;teléfono personal;telefono personal").split(";")

def hash_sha256(texto):
    """Huella SHA-256: la única forma en que un dato sensible entra aquí (R5)."""
    return hashlib.sha256(texto.encode("utf-8")).hexdigest()

def texto_prohibido(texto):
    """¿Este texto habla de salud, creencias, familia, ingresos u otro dato R5?"""
    return any(prohibido in texto.lower() for prohibido in TEXTOS_PROHIBIDOS)

def carpeta_alcance(home):
    """Crea (si falta) la carpeta privada con permisos 700 y devuelve su ruta."""
    ruta = os.path.join(home, ".starseed", "alcance")
    os.makedirs(ruta, mode=PERMISO_CARPETA, exist_ok=True)
    os.chmod(ruta, PERMISO_CARPETA)
    return ruta

def _leer(ruta, por_defecto):
    try:
        with open(ruta, "r", encoding="utf-8") as archivo:
            return json.load(archivo)
    except FileNotFoundError:
        return por_defecto

def _guardar(ruta, datos):
    with open(ruta, "w", encoding="utf-8") as archivo:
        json.dump(datos, archivo, ensure_ascii=False, indent=1, sort_keys=True)
    os.chmod(ruta, PERMISO_ARCHIVO)

def crear_objetivo(*, nombre_publico, tipo, categoria, urls_oficiales, canal_contacto=None,
                   nivel="", afinidad=0, estado="nuevo", ahora=0.0, id_opaco=""):
    """Crea el objetivo con id opaco (obj-…); sin nivel explícito es ALTO (R8)."""
    return {
        "id": id_opaco or f"obj-{hash_sha256(f'{nombre_publico}|{ahora}|{id_opaco}')[:12]}",
        "nombre_publico": nombre_publico,
        "tipo": tipo, "categoria": categoria,
        "nivel": nivel or "alto", "afinidad": afinidad,
        "urls_oficiales": list(urls_oficiales),
        "canal_contacto": dict(canal_contacto) if canal_contacto else {},
        "estado": estado, "fechas": {"alta": ahora},
    }

def validar_objetivo(objetivo):
    """RECHAZA campos prohibidos, URL sin https y canal sin fuente_url (R1, R5)."""
    canal = objetivo.get("canal_contacto") or {}
    reglas = (
        (not str(objetivo.get("id", "")).startswith("obj-"), "id debe ser opaco (obj-…)"),
        (objetivo.get("tipo") not in TIPOS, "tipo no válido"),
        (objetivo.get("nivel", "alto") not in NIVELES, "nivel no válido"),
        (objetivo.get("categoria", "otro") not in CATEGORIAS, "categoría no válida"),
        (type(objetivo.get("afinidad", 0)) is not int
         or not 0 <= objetivo["afinidad"] <= AFINIDAD_MAXIMA, f"afinidad de 0 a {AFINIDAD_MAXIMA}"),
        (canal and (not canal.get("medio") or not canal.get("valor")), "canal_contacto necesita medio y valor"),
        (canal and not str(canal.get("fuente_url", "")).startswith("https://"),
         "solo el canal que la entidad publica: fuente_url https (R1)"),
    )
    errores = [mensaje for falla, mensaje in reglas if falla]
    if any(not str(url).startswith("https://") for url in objetivo.get("urls_oficiales", [])):
        errores.append("las urls_oficiales deben ser https")
    errores += [f"campo prohibido en «{campo}» (R5)" for campo, valor in objetivo.items()
                if isinstance(valor, str) and texto_prohibido(valor)]
    return errores

def guardar_objetivos(home, objetivos):
    """Escribe el almacén privado (archivo 600) y devuelve la lista."""
    _guardar(os.path.join(carpeta_alcance(home), ARCHIVO_OBJETIVOS), objetivos)
    return objetivos

def suprimir(home, *, correo="", dominio="", nombre=""):
    """Guarda en la supresión SOLO hashes: del correo, del dominio y del dominio+nombre (R5)."""
    ruta = os.path.join(carpeta_alcance(home), ARCHIVO_SUPRESION)
    claves = [x for x in (correo, dominio, f"{dominio}|{nombre}" if dominio and nombre else "") if x]
    lista = _leer(ruta, []); nuevas = [hash_sha256(clave) for clave in claves if hash_sha256(clave) not in lista]
    if nuevas:
        _guardar(ruta, lista + nuevas)
    return nuevas

def esta_suprimido(home, *, correo="", dominio="", nombre=""):
    """¿Está este correo (o todo su dominio), o este dominio+nombre, en la supresión?"""
    claves = [x for x in (correo, correo.split("@")[-1] if correo else "",
                          dominio, f"{dominio}|{nombre}" if dominio and nombre else "") if x]
    guardados = set(_leer(os.path.join(carpeta_alcance(home), ARCHIVO_SUPRESION), []))
    return any(hash_sha256(clave) in guardados for clave in claves)

def puede_contactar(objetivo, registro, ahora, tope_diario=TOPE_DIARIO_DEFECTO, automatico=True):
    """(permitido, motivo): supresión, un mensaje + un recordatorio, pausas y tope diario (R8)."""
    if registro.get("suprimido"):
        return False, "suprimido"
    if objetivo.get("nivel") == "alto" and automatico:
        return False, "nivel alto: contacto solo manual (R8)"
    envios = list(registro.get("envios", []))
    if len(envios) >= 2 or registro.get("recordatorio"):
        return False, "ya hubo un mensaje y su recordatorio"
    if len(envios) == 1 and ahora - envios[0] < PLAZO_RECORDATORIO:
        return False, "el recordatorio va a los 14 días como máximo"
    for campo, pausa in (("rechazo_alex", PAUSA_RECHAZO_ALEX), ("rechazo_destinatario", PAUSA_RECHAZO_DESTINATARIO)):
        momento = registro.get(campo)
        if momento is not None and ahora - momento < pausa:
            return False, f"en pausa {pausa // DIA} días tras {campo.replace('_', ' ')}"
    if registro.get("envios_hoy", 0) >= tope_diario or sum(1 for ts in envios if ahora - ts < DIA) >= tope_diario:
        return False, "tope diario alcanzado"
    return True, ""
