# -*- coding: utf-8 -*-
"""Bóveda cifrada de claves del Maggabit (MAG1117).
Imagen APFS cifrada que Alex crea y abre a mano: este módulo NUNCA pide, lee ni recibe la contraseña
ni abre un diálogo. Con la bóveda «abierta» copia a `claves/` las fuentes fijas y los archivos de la
sección CLAVES de la lista única hallados bajo ~/Documents, conservando la ruta relativa al home.
Decisión PURA; E/S fina con todo inyectable (reloj, subprocess con timeout, disco). Bóveda cerrada o
sin crear: lista vacía y un motivo en claro; disco ausente: nada falla ni espera; nunca se borra en el
origen; `.credentials.json` no se copia a ningún sitio; registro de solo rutas y tamaños.
"""
from __future__ import annotations
import fnmatch, glob, json, os, subprocess, time

BOVEDA = "/Volumes/MaggabitBoveda"
DESTINO = BOVEDA + "/claves"
FUENTES = ("~/.starseed/env", "~/.starseed/env.*", "~/.hermes", "~/.astraura", "~/.oci")
NUNCA_COPIAR = (".credentials.json",)
TOPE_S = 600  # timeout de cada rsync: el volumen exFAT puede no responder
ABIERTA, SIN_RESPUESTA, SIN_DISCO = "abierta", "sin-respuesta", "sin-disco"
LISTA_UNICA = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "config", "respaldo-exclusiones.txt")
PODAR = ("node_modules", ".next", ".turbo", ".gitnexus", "venv", ".venv", "__pycache__", ".gradle", "target")
MOTIVOS = {"cerrada": "bóveda cerrada: nada se copia", "sin-crear": "bóveda sin crear: nada se copia"}

def patrones_claves(texto: str) -> list[str]:
    """PURA. Patrones de la sección CLAVES de la lista única de exclusiones."""
    patrones, en_claves = [], False
    for limpia in (l.strip() for l in (texto or "").splitlines()):
        if not limpia or limpia.startswith("#"): en_claves = "CLAVES" in limpia.upper()
        elif en_claves: patrones.append(limpia)
    return patrones

def copiable(ruta: str) -> bool:
    """PURA. False para lo que no se copia a ningún sitio (.credentials.json)."""
    return os.path.basename(ruta) not in NUNCA_COPIAR

def de_patrones(rutas: list[str], patrones: list[str]) -> list[str]:
    """PURA. De las rutas halladas, las que casan con la sección CLAVES y son copiables."""
    return sorted(r for r in set(rutas or []) if copiable(r) and any(
        fnmatch.fnmatch(os.path.basename(r), p) for p in (patrones or [])))

def motivo(boveda_estado: str) -> str:
    """PURA. Por qué no hay copias si la bóveda no está «abierta» ('' si lo está)."""
    if boveda_estado == ABIERTA: return ""
    return MOTIVOS.get(boveda_estado, "bóveda en estado «%s»: nada se copia" % boveda_estado)

def destino_de(fuente: str, home: str, raiz: str = DESTINO) -> str:
    """PURA. Dónde aterriza la copia: la misma ruta, relativa al home (fuera del home: por su nombre)."""
    relativa = os.path.relpath(fuente, home)
    return os.path.join(raiz, os.path.basename(fuente) if relativa.startswith("..") else relativa)

def plan(boveda_estado: str, fuentes_existentes: list[str], home: str | None = None) -> list[dict]:
    """PURA. Copias a hacer; lista vacía (con su motivo en `motivo`) si no está «abierta».
    Cada copia lleva solo rutas: {"fuente", "destino"} — nunca contenido."""
    if boveda_estado != ABIERTA: return []
    home = home or os.path.expanduser("~")
    return [{"fuente": f, "destino": destino_de(f, home)}
            for f in sorted(set(fuentes_existentes or [])) if copiable(f)]

def ordenes(plan_copias: list[dict]) -> list[list[str]]:
    """PURA. `rsync -a` de cada fuente al padre de su destino: la ruta relativa al home queda igual
    en la bóveda y repetir la copia actualiza en el sitio, sin anidar."""
    return [["rsync", "-a", c["fuente"], os.path.dirname(c["destino"])]
            for c in (plan_copias or [])]

def fuentes_fijas(expander=os.path.expanduser, existe=os.path.exists, globar=None) -> list[str]:
    """Fuentes fijas (FUENTES) que existan, ya expandidas; nunca lanza."""
    globar = globar or glob.glob; halladas = set()
    for patron in FUENTES:
        try:
            halladas.update(r for r in (globar(expander(patron)) or []) if existe(r) and copiable(r))
        except OSError: pass
    return sorted(halladas)

def buscar_documentos(raiz: str, patrones: list[str], caminar=os.walk, existe=os.path.exists) -> list[str]:
    """Archivos de la sección CLAVES bajo ~/Documents; nunca entra en lo regenerable."""
    try:
        if not existe(raiz): return []
        halladas: list[str] = []
        for d, carpetas, archivos in caminar(raiz):
            carpetas[:] = [c for c in carpetas if c not in PODAR]
            halladas += [os.path.join(d, a) for a in archivos]
        return de_patrones(halladas, patrones)
    except OSError: return []

def copiar(plan_copias: list[dict], existe=os.path.exists, crear=None, medir=None,
           ejecutar=None, reloj=time.time) -> dict:
    """Ejecuta cada orden con timeout y anota el registro (solo rutas y tamaños). Disco ausente:
    «sin-disco» sin llamar a rsync (principio 0); volumen mudo: «sin-respuesta» y se sigue; la salida
    de rsync se descarta y nunca borra en el origen."""
    crear = crear or os.makedirs; medir = medir or os.path.getsize; ejecutar = ejecutar or subprocess.run; cuando = int(reloj())
    if not existe(BOVEDA):
        return {"estado": SIN_DISCO, "motivo": "bóveda no montada", "cuando": cuando, "copias": []}
    registro = {"estado": "ok", "motivo": "", "cuando": cuando, "copias": []}
    for copia, orden in zip(plan_copias or [], ordenes(plan_copias)):
        try:
            crear(os.path.dirname(copia["destino"]), exist_ok=True)
            hecho = ejecutar(orden, capture_output=True, text=True, timeout=TOPE_S)
            estado = "ok" if getattr(hecho, "returncode", 1) == 0 else "fallo"
        except subprocess.TimeoutExpired: estado = SIN_RESPUESTA
        except OSError: estado = "fallo"
        try: tamano = int(medir(copia["fuente"]))
        except OSError: tamano = None
        registro["copias"].append({"ruta": copia["fuente"], "destino": copia["destino"],
                                   "bytes": tamano, "estado": estado})
        if estado != "ok": registro["estado"] = "con-avisos"
    return registro

def main() -> int:
    """Pasada completa: mide la bóveda, descubre las fuentes, planifica y copia."""
    import maggabit_medio
    estado = str((maggabit_medio.leer() or {}).get("boveda") or "sin-crear")
    try:
        with open(LISTA_UNICA, encoding="utf-8") as f: patrones = patrones_claves(f.read())
    except OSError: patrones = []
    copias = plan(estado, fuentes_fijas() + buscar_documentos(os.path.expanduser("~/Documents"), patrones))
    registro = copiar(copias) if copias else {"estado": "renuncia", "motivo": motivo(estado), "cuando": int(time.time()), "copias": []}
    print(json.dumps(registro, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if registro["estado"] in ("ok", "renuncia", SIN_DISCO) else 1

if __name__ == "__main__":
    raise SystemExit(main())
