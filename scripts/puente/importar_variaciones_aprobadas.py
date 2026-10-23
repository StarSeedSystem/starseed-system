"""Variaciones de identidad aprobadas: parte PURA (DSN1019Kc).

Carga y valida las fichas de `starseed_memory_root/diseno/variaciones-aprobadas/`
(formato de `variaciones-de-identidad.md` §3, `estado: "aprobada"`), construye las
filas para `os_variaciones` y para `library_public_items`, elige el destino y aplica
la idempotencia por clave+nombre. La capa de red y el CLI van en
`importar_variaciones_red.py`. Claves solo por NOMBRE de variable; sin llamadas de red.
"""
import json
import re
from pathlib import Path

TABLA_OS = "os_variaciones"
TABLA_LIB = "library_public_items"
ENV_URL = "NEXT_PUBLIC_SUPABASE_URL"
ENV_CLAVE = "SUPABASE_SERVICE_ROLE_KEY"
ENV_AUTOR = "STARSEED_SUPABASE_AUTOR_UUID"

_CLAVE = re.compile(r"^[A-Za-z0-9_-]+:[A-Za-z0-9_-]+(?:#[A-Za-z0-9_-]+)?$")


def raiz_repo() -> Path:
    return Path(__file__).resolve().parent.parent.parent


def carpeta_variaciones(raiz=None) -> Path:
    raiz = Path(raiz) if raiz else raiz_repo()
    return raiz / "starseed_memory_root" / "diseno" / "variaciones-aprobadas"


def load_variations(carpeta=None) -> list:
    """Fichas con estado «aprobada» de la carpeta ([] si no existe o el JSON falla)."""
    carpeta = Path(carpeta) if carpeta else carpeta_variaciones()
    if not carpeta.is_dir():
        return []
    fichas = []
    for ruta in sorted(carpeta.glob("*.json")):
        try:
            ficha = json.loads(ruta.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if isinstance(ficha, dict) and ficha.get("estado") == "aprobada":
            fichas.append(ficha)
    return fichas


def validar_ficha(ficha) -> list:
    """Errores según el §3 de variaciones-de-identidad ([] = la ficha es válida)."""
    errores, clave = [], str(ficha.get("clave", ""))
    if not _CLAVE.match(clave):
        errores.append("clave inválida (formato familia:id)")
    elif ficha.get("familia") != clave.split(":")[0]:
        errores.append("la familia no coincide con la clave")
    for campo, motivo in (("nombre", "falta el nombre"), ("registro", "falta el registro"),
                          ("licencia", "falta la licencia")):
        if not str(ficha.get(campo, "")).strip():
            errores.append(motivo)
    movimiento = ficha.get("movimientoReducido")
    if not isinstance(movimiento, dict) or not movimiento.get("duracionMs"):
        errores.append("falta movimientoReducido con su duracionMs")
    for campo, esperado, texto in (("parametros", dict, "un objeto"), ("referencias", list, "una lista")):
        if not isinstance(ficha.get(campo, {} if esperado is dict else []), esperado):
            errores.append(f"{campo} debe ser {texto}")
    return errores


def generar_descripcion(ficha) -> str:
    texto = f"Variación de identidad de la familia {ficha.get('familia', '')} (registro {ficha.get('registro', '')})."
    fundamentos = ficha.get("fundamentos") or []
    return texto + " Fundamentos: " + ", ".join(str(f) for f in fundamentos) + "." if fundamentos else texto


def etiquetas_de(ficha) -> list:
    partes = [ficha.get("familia", ""), ficha.get("registro", "")]
    partes.extend(str(f) for f in (ficha.get("fundamentos") or []))
    etiquetas: list = []
    for parte in partes:
        parte = parte.strip().lower()
        if parte and parte not in etiquetas:
            etiquetas.append(parte)
    return etiquetas


def fila_para_os_variaciones(ficha, autor="") -> dict:
    """Fila de `os_variaciones` (contrato de architecture/variaciones-publicas.md §6)."""
    fila = {
        "clave": ficha["clave"], "familia": ficha["familia"], "tipo": "variacion",
        "titulo": ficha["nombre"][:200], "descripcion": generar_descripcion(ficha),
        "payload": ficha, "version": ficha.get("version", "1.0.0"), "licencia": ficha["licencia"],
        "etiquetas": etiquetas_de(ficha),
    }
    if autor:
        fila["autor"] = autor
    return fila


def fila_para_library_public_items(ficha) -> dict:
    """Categoría diseño, carpeta de su familia, etiquetas y ficha en el payload."""
    return {
        "category": "design", "folder": f"diseño/{ficha.get('familia', '')}",
        "name": ficha["nombre"][:200], "kind": "variacion",
        "payload": {"description": generar_descripcion(ficha), "mime": "application/json", "variacion": ficha},
        "tags": etiquetas_de(ficha),
    }


def destino_de(tabla_os_existe: bool, autor: str) -> str:
    """`os_variaciones` exige al menos un uuid de autor; sin él, la Librería pública."""
    return TABLA_OS if tabla_os_existe and autor else TABLA_LIB


def sin_ya_publicadas(fichas, publicadas) -> list:
    """Idempotencia por clave+nombre: quita las fichas ya publicadas."""
    ya = {(clave, nombre) for (clave, nombre) in publicadas}
    return [ficha for ficha in fichas if (ficha.get("clave"), ficha.get("nombre")) not in ya]


def es_tabla_ausente(estado: int, cuerpo: str) -> bool:
    """PostgREST avisa así cuando la tabla no existe en el proyecto (404 o PGRST205)."""
    return estado == 404 or "PGRST205" in cuerpo or "Could not find the table" in cuerpo
