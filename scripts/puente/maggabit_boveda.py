#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Maggabit: bóveda cifrada de claves (MAG1117).

La imagen cifrada la crea y la abre Alex: este módulo NUNCA pide, lee ni
recibe la contraseña y jamás abre un diálogo. Si la bóveda no está «abierta»
no se copia nada y no se espera (principio 0). Decisión pura (`plan`,
`ordenes`), E/S fina inyectable, todo subprocess con timeout, nunca se borra
en el origen y el registro solo guarda rutas y tamaños, jamás contenido."""
import argparse, fnmatch, glob, os, subprocess
from typing import Any, Callable, Dict, List, Optional

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RUTA_EXCLUSIONES = os.path.join(RAIZ, "config", "respaldo-exclusiones.txt")
BOVEDA = "/Volumes/MaggabitBoveda"
IMAGEN_BOVEDA = "/Volumes/Maggabit/MetaGenesis/imagenes/boveda.sparsebundle"
DESTINO_RAIZ = BOVEDA + "/claves"
DOCUMENTOS = os.path.expanduser("~/Documents")
FUENTES = ("~/.starseed/env", "~/.starseed/env.*", "~/.hermes", "~/.astraura", "~/.oci")
JAMAS = (".credentials.json",)
SEGUNDOS_LIMITE = 900
SIN_RESPUESTA = "sin-respuesta"


def motivo(boveda_estado: str) -> str:
    """PURA: por qué no hay copia cuando la bóveda no está abierta."""
    return ("bóveda sin crear: sin copia" if boveda_estado == "sin-crear"
            else "" if boveda_estado == "abierta" else "bóveda cerrada: sin copia")


def patrones_claves(texto: str) -> Dict[str, List[str]]:
    """PURA: sección CLAVES de la lista única → patrones secretos y excepciones."""
    secretos: List[str] = []; excepciones: List[str] = []; dentro = False
    for linea in (texto or "").splitlines():
        limpia = linea.strip()
        if limpia.startswith("#"):
            dentro = "CLAVES" in limpia.upper()
        elif limpia and dentro:
            (excepciones if limpia.startswith("!") else secretos).append(limpia.lstrip("!"))
    return {"secretos": secretos, "excepciones": excepciones}


def es_clave(ruta: str, patrones: Dict[str, List[str]]) -> bool:
    """PURA: ¿es un secreto de la sección CLAVES? Los de JAMAS jamás."""
    base = os.path.basename(ruta)
    if base in JAMAS or any(fnmatch.fnmatch(base, p) for p in patrones.get("excepciones", [])):
        return False
    return any(fnmatch.fnmatch(base, p) for p in patrones.get("secretos", []))


def destino_para(ruta: str, hogar: Optional[str] = None) -> str:
    """PURA: destino en la bóveda conservando la ruta relativa al hogar."""
    return os.path.join(DESTINO_RAIZ, os.path.relpath(ruta, hogar or os.path.expanduser("~")))


def plan(boveda_estado: str, fuentes_existentes: List[str]) -> List[Dict[str, Any]]:
    """PURA: tareas de copia; lista vacía (con `motivo`) si no está «abierta»."""
    if boveda_estado != "abierta":
        return []
    return [{"origen": f, "destino": destino_para(f)}
            for f in fuentes_existentes if os.path.basename(f) not in JAMAS]


def ordenes(tareas: List[Dict[str, Any]], simulacro: bool = False) -> List[List[str]]:
    """PURA: un `rsync -a` por tarea, sin `--delete`: jamás se borra en el origen."""
    return [["rsync", "-a"] + (["--dry-run"] if simulacro else []) + [t["origen"], t["destino"]]
            for t in tareas]

def fuentes_hogar(expande: Optional[Callable[[str], List[str]]] = None) -> List[str]:
    expande = expande or (lambda p: glob.glob(os.path.expanduser(p)))
    return sorted({ruta for patron in FUENTES for ruta in expande(patron)})


def claves_documentos(texto: str, camina: Optional[Callable[..., Any]] = None) -> List[str]:
    """E/S: archivos de la sección CLAVES bajo ~/Documents (`.credentials.json` fuera)."""
    camina = camina or os.walk
    patrones = patrones_claves(texto)
    return [os.path.join(raiz, n) for raiz, _carpetas, nombres in camina(DOCUMENTOS)
            for n in sorted(nombres) if es_clave(n, patrones)]


def copiar(ejecutar=None, existe=None, expande=None, camina=None, medir=None,
           texto: Optional[str] = None, simulacro: bool = False) -> Dict[str, Any]:
    """E/S fina: reúne fuentes, planea y copia. Bóveda no abierta: no ejecuta nada."""
    ejecutar = ejecutar or subprocess.run; existe = existe or os.path.exists
    medir = medir or os.path.getsize
    estado = "abierta" if existe(BOVEDA) else "cerrada" if existe(IMAGEN_BOVEDA) else "sin-crear"
    if estado != "abierta":
        return {"estado": estado, "motivo": motivo(estado), "copias": []}
    if texto is None:
        try:
            texto = open(RUTA_EXCLUSIONES, encoding="utf-8").read()
        except OSError:
            texto = ""
    fuentes = fuentes_hogar(expande) + claves_documentos(texto, camina)
    copias: List[Dict[str, Any]] = []
    for argv in ordenes(plan("abierta", fuentes), simulacro=simulacro):
        try:
            hecho = ejecutar(argv, capture_output=True, text=True, timeout=SEGUNDOS_LIMITE)
            codigo = getattr(hecho, "returncode", None)
        except subprocess.TimeoutExpired:
            codigo = SIN_RESPUESTA
        copias.append({"origen": argv[-2], "destino": argv[-1],
                       "estado": ("ok" if codigo == 0 else SIN_RESPUESTA
                                  if codigo == SIN_RESPUESTA else "fallo"),
                       "tam_bytes": medir(argv[-2])})
    return {"estado": estado, "copias": copias}


def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser(description="Copia de claves a la bóveda Maggabit.")
    p.add_argument("--simulacro", action="store_true", help="Ensayo con --dry-run.")
    resultado = copiar(simulacro=p.parse_args(argv).simulacro)
    print(resultado.pop("motivo", "") or "%s: %d copia(s)"
          % (resultado["estado"], len(resultado["copias"])))
    return 1 if any(c["estado"] == "fallo" for c in resultado["copias"]) else 0


if __name__ == "__main__":
    raise SystemExit(main())
