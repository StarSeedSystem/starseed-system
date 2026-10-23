"""Importa a la Librería las variaciones que Alex aprobó en el estudio (DSN1019K).
Fichas: starseed_memory_root/diseno/variaciones-aprobadas/*.json (variaciones-de-identidad.md §3).
Destino: os_variaciones si existe; si no, library_public_items (categoría diseño, carpeta = familia).
Claves por NOMBRE de variable de .env.local, nunca impresas. Idempotente por clave+nombre. --seco no escribe."""
import argparse, json, os, urllib.error, urllib.parse, urllib.request
from pathlib import Path
from typing import Callable, Dict, List, Optional, Tuple

RAIZ = Path(__file__).resolve().parent.parent.parent
FICHAS = RAIZ / "starseed_memory_root" / "diseno" / "variaciones-aprobadas"
FAMILIAS = {"animacion", "transicion", "elemento-3d", "tipografia", "composicion", "icono", "sonido", "tema"}
OBLIGATORIOS = ("clave", "nombre", "familia", "licencia", "movimientoReducido", "parametros")
Transporte = Callable[[str, str, Optional[dict], Dict[str, str]], Tuple[int, object]]


def validar(ficha: dict) -> List[str]:
    fallos = [f"falta «{c}»" for c in OBLIGATORIOS if c not in ficha]
    clave, familia = str(ficha.get("clave", "")), ficha.get("familia")
    if familia not in FAMILIAS:
        fallos.append(f"familia desconocida «{familia}»")
    if ":" not in clave or clave.split(":", 1)[0] != familia:
        fallos.append("la clave debe ser <familia>:<id>")
    if ficha.get("estado") != "aprobada":
        fallos.append("la ficha no está aprobada")
    return fallos


def cargar_fichas(carpeta: Path = FICHAS) -> Tuple[List[dict], Dict[str, List[str]]]:
    validas: List[dict] = []
    rechazadas: Dict[str, List[str]] = {}
    for archivo in sorted(carpeta.glob("*.json")) if carpeta.exists() else []:
        try:
            ficha = json.loads(archivo.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            rechazadas[archivo.name] = ["JSON ilegible"]
            continue
        if not isinstance(ficha, dict) or ficha.get("estado") != "aprobada":
            continue
        fallos = validar(ficha)
        if fallos:
            rechazadas[archivo.name] = fallos
        else:
            validas.append(ficha)
    return validas, rechazadas


def a_fila_variacion(ficha: dict, autor: str) -> dict:
    campos = ("parametros", "movimientoReducido", "fundamentos", "ejemplo", "referencias", "registro")
    payload = {k: ficha.get(k) for k in campos}
    return {"clave": ficha["clave"], "familia": ficha["familia"], "tipo": "variacion", "titulo": ficha["nombre"],
            "descripcion": ficha.get("descripcion"), "payload": payload, "licencia": ficha["licencia"],
            "etiquetas": [ficha["familia"], *map(str, ficha.get("fundamentos", []))], "tema": ficha.get("registro"),
            "autor": autor}


def a_fila_biblioteca(ficha: dict, autor: str) -> dict:
    fila = a_fila_variacion(ficha, autor)
    payload = {**fila["payload"], "clave": ficha["clave"], "licencia": ficha["licencia"]}
    return {"owner": autor, "category": "diseno", "folder": ficha["familia"], "name": ficha["nombre"],
            "kind": "variacion", "payload": payload, "tags": [f"clave:{ficha['clave']}", *fila["etiquetas"]]}


def _http(metodo: str, url: str, cuerpo: Optional[dict], cabeceras: Dict[str, str]) -> Tuple[int, object]:
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    try:
        with urllib.request.urlopen(urllib.request.Request(url, datos, cabeceras, method=metodo), timeout=30) as r:
            return r.status, json.loads(r.read().decode() or "null")
    except urllib.error.HTTPError as e:
        return e.code, None


def publicar(ficha: dict, base: str, cabeceras: Dict[str, str], autor: str, seco: bool, http: Transporte = _http) -> str:
    """Devuelve «creada», «actualizada» o «seca»; idempotente por clave+nombre."""
    nueva = http("GET", f"{base}/os_variaciones?select=id&limit=1", None, cabeceras)[0] == 200
    tabla = "os_variaciones" if nueva else "library_public_items"
    fila = (a_fila_variacion if nueva else a_fila_biblioteca)(ficha, autor)
    filtro = ({"clave": f"eq.{ficha['clave']}", "titulo": f"eq.{ficha['nombre']}"} if nueva else
              {"name": f"eq.{ficha['nombre']}", "category": "eq.diseno", "folder": f"eq.{ficha['familia']}",
               "tags": "cs.{" + json.dumps(f"clave:{ficha['clave']}") + "}"})
    consulta = urllib.parse.urlencode(filtro, safe=".,:{}\"")
    _, existentes = http("GET", f"{base}/{tabla}?select=id&{consulta}", None, cabeceras)
    previa = existentes[0]["id"] if isinstance(existentes, list) and existentes else None
    if seco:
        return "seca"
    http("PATCH" if previa else "POST", f"{base}/{tabla}" + (f"?id=eq.{previa}" if previa else ""), fila, cabeceras)
    return "actualizada" if previa else "creada"


def _env(nombre: str) -> str:
    try:
        lineas = (RAIZ / ".env.local").read_text(encoding="utf-8").splitlines()
    except OSError:
        lineas = []
    local = {k: v.strip().strip("\"'") for k, _, v in (l.partition("=") for l in lineas)}
    return os.environ.get(nombre) or local.get(nombre, "")


def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser(description="Importar variaciones aprobadas a la Librería")
    p.add_argument("--seco", action="store_true", help="solo muestra lo que haría")
    p.add_argument("--carpeta", type=Path, default=FICHAS)
    a = p.parse_args(argv)
    fichas, rechazadas = cargar_fichas(a.carpeta)
    [print(f"[descartada] {n}: {'; '.join(f)}") for n, f in rechazadas.items()]
    url, clave, autor = _env("NEXT_PUBLIC_SUPABASE_URL"), _env("SUPABASE_SERVICE_ROLE_KEY"), _env("STARSEED_VARIACIONES_AUTOR")
    if not a.seco and not (url and clave and autor):
        print("Faltan NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o STARSEED_VARIACIONES_AUTOR en .env.local.")
        return 2
    base = url.rstrip("/") + "/rest/v1"
    cab = {"apikey": clave, "Authorization": f"Bearer {clave}", "Content-Type": "application/json"}
    for f in fichas:
        res = "seca" if a.seco and not url else publicar(f, base, cab, autor, a.seco)
        print(f"[{res}] {f['clave']}: {f['nombre']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
