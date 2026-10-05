"""Herramienta ADN de diseno: validar, compilar, comprobar y capturar.

Referencia: architecture/diseno-referencias/adn-diseno.md y §9 de
architecture/director-diseno.md. dna.json es el registro (nunca entra en un
prompt); PROMPT.md es la carga de 2 KB para el modelo.
"""

import argparse
import json
import os
import re
import subprocess
import sys

TOPE_PROMPT = 2048
FRASE_FINAL = (
    "Antes de devolver nada, ejecuta cada prueba de la autocomprobacion y "
    "nombra su resultado. Si alguna falla, repara y vuelve a probar. Nunca "
    "devuelvas una salida con una prueba fallida y una nota que la justifique."
)
PATRON_NOMBRE_TECNICO = re.compile(r"^[a-z]+-\d+$", re.IGNORECASE)


class ErrorAdn(Exception):
    pass


def cargar_dna(carpeta):
    ruta = os.path.join(carpeta, "dna.json")
    if not os.path.isfile(ruta):
        raise ErrorAdn("falta dna.json en " + carpeta)
    with open(ruta, encoding="utf-8") as f:
        return json.load(f)


def validar_dna(dna):
    """Devuelve la lista de errores (vacia si el ADN es sano)."""
    errores = []
    firmas = dna.get("firmas") or []
    if not 3 <= len(firmas) <= 9:
        errores.append("firmas: hay %d y hacen falta 3-9" % len(firmas))
    prohibiciones = dna.get("prohibiciones") or []
    if len(prohibiciones) < 5:
        errores.append("prohibiciones: hay %d y hacen falta >=5" % len(prohibiciones))
    pruebas = dna.get("pruebas") or []
    if len(pruebas) < 8:
        errores.append("pruebas: hay %d y hacen falta >=8" % len(pruebas))
    errores += _validar_paleta(dna.get("paleta") or [])
    errores += _validar_tipo(dna.get("tipo") or {})
    if not (dna.get("jugada_rara") or {}).get("que"):
        errores.append("jugada_rara: ausente o sin 'que'")
    return errores


def _validar_paleta(paleta):
    errores = []
    if not paleta:
        return ["paleta: vacia"]
    suma = sum(float(e.get("cobertura") or 0) for e in paleta)
    if not 95 <= suma <= 105:
        errores.append("paleta: la cobertura suma %.1f, debe dar 95-105" % suma)
    for e in paleta:
        nombre = (e.get("nombre") or "").strip()
        if not nombre:
            errores.append("paleta: entrada sin nombre descriptivo (%s)" % e.get("rol", "?"))
        elif PATRON_NOMBRE_TECNICO.match(nombre):
            errores.append(
                "paleta: nombre tecnico «%s»; usa uno descriptivo" % nombre
            )
    return errores


def _validar_tipo(tipo):
    errores = []
    for fam in tipo.get("familias") or []:
        if not fam.get("fallback"):
            errores.append(
                "tipo: la familia «%s» no tiene fallback" % fam.get("nombre", "?")
            )
    return errores


def _imagen_referencia(carpeta):
    ref = os.path.join(carpeta, "referencia")
    if not os.path.isdir(ref):
        return None
    for nombre in sorted(os.listdir(ref)):
        if not nombre.startswith("."):
            return os.path.join("referencia", nombre)
    return None


def construir_prompt(carpeta, dna):
    """Compone PROMPT.md en el orden exacto de la referencia."""
    partes = []
    imagen = _imagen_referencia(carpeta)
    if not imagen:
        raise ErrorAdn("sin imagen de referencia: el prompt nunca va sin ella")
    partes.append("Referencia (mirala primero): " + imagen + "\n")
    alma = dna.get("alma") or {}
    partes.append(alma.get("una_linea", ""))
    jr = dna.get("jugada_rara") or {}
    partes.append(
        "La jugada rara: %s. %s" % (jr.get("que", ""), jr.get("como", ""))
    )
    firmas = "\n".join(
        "- %s: %s" % (f.get("jugada", ""), f.get("como", ""))
        for f in dna.get("firmas") or []
    )
    partes.append("Firmas (como proporciones):\n" + firmas)
    prohib = "\n".join("- " + p for p in dna.get("prohibiciones") or [])
    partes.append("Prohibido:\n" + prohib)
    paleta = "; ".join(
        "%s %s%% (%s)" % (e.get("rol", "?"), e.get("cobertura", "?"), e.get("nombre", ""))
        for e in dna.get("paleta") or []
    )
    tipo = dna.get("tipo") or {}
    familias = "; ".join(
        "%s (%s)" % (f.get("rol", f.get("nombre", "?")), f.get("fallback", ""))
        for f in tipo.get("familias") or []
    )
    partes.append("Paleta por cobertura: " + paleta + ". Tipo: " + familias)
    arq = "\n".join(
        "- %s: %s" % (a.get("id", "?"), a.get("funcion", ""))
        for a in dna.get("arquetipos") or []
    )
    partes.append("Arquetipos, y cuando usar cada uno:\n" + arq)
    auto = "\n".join(
        "- %s: %s" % (p.get("id", "?"), p.get("comprobacion", ""))
        for p in dna.get("pruebas") or []
    )
    partes.append("Autocomprobacion:\n" + auto)
    partes.append(FRASE_FINAL)
    return "\n\n".join(p for p in partes if p.strip())


REGLAS_RECORTE = [
    ("firmas", "junta dos firmas en una (el tope son 9, no el minimo de texto)"),
    ("prohibiciones", "resume las prohibiciones en frases mas cortas"),
    ("arquetipos", "recorta la funcion de cada arquetipo a una frase"),
    ("paleta", "quita comportamientos; quedate con rol y cobertura"),
]


def cmd_compilar(carpeta):
    dna = cargar_dna(carpeta)
    errores = validar_dna(dna)
    if errores:
        raise ErrorAdn("compilar exige un ADN valido: " + "; ".join(errores))
    texto = construir_prompt(carpeta, dna)
    if len(texto.encode("utf-8")) > TOPE_PROMPT:
        sugerencias = [
            s for clave, s in REGLAS_RECORTE
            if len(json.dumps(dna.get(clave) or [], ensure_ascii=False)) > 200
        ]
        raise ErrorAdn(
            "PROMPT.md pesaria %d bytes (tope %d). Recorta: %s."
            % (len(texto.encode("utf-8")), TOPE_PROMPT, "; ".join(sugerencias or ["las firmas"]))
        )
    with open(os.path.join(carpeta, "PROMPT.md"), "w", encoding="utf-8") as f:
        f.write(texto)
    return texto


def ejecutar_pruebas(carpeta, metricas):
    """Corre check.py pasandole las metricas medidas y parsea el resultado.

    Espera lineas «<id>: aprobado|suspenso» en la salida. Devuelve
    (aprobado_global, {id: bool}).
    """
    ruta_check = os.path.join(carpeta, "check.py")
    if not os.path.isfile(ruta_check):
        raise ErrorAdn("falta check.py en " + carpeta)
    proc = subprocess.run(
        [sys.executable, ruta_check],
        input=json.dumps(metricas),
        capture_output=True,
        text=True,
        cwd=carpeta,
    )
    resultados = {}
    for linea in proc.stdout.splitlines():
        if ":" in linea:
            pid, _, veredicto = linea.partition(":")
            veredicto = veredicto.strip().lower()
            if veredicto in ("aprobado", "suspenso"):
                resultados[pid.strip()] = veredicto == "aprobado"
    if not resultados and proc.returncode != 0:
        raise ErrorAdn("check.py murio sin dictamen: " + proc.stderr.strip())
    return all(resultados.values()) and proc.returncode == 0, resultados


def cmd_capturar(ruta, base_adn=None):
    """Crea el esqueleto de un ADN nuevo con la captura en referencia/."""
    if base_adn is None:
        base = os.path.dirname(os.path.abspath(__file__))
        base_adn = os.path.abspath(
            os.path.join(base, "..", "..", "memory", "diseno", "adn"))
    slug = re.sub(r"[^a-z0-9]+", "-", os.path.splitext(
        os.path.basename(ruta))[0].lower()).strip("-")
    destino = os.path.join(base_adn, slug)
    os.makedirs(os.path.join(destino, "referencia"), exist_ok=True)
    os.makedirs(os.path.join(destino, "ejemplo"), exist_ok=True)
    nombre = os.path.basename(ruta)
    with open(ruta, "rb") as origen, open(
        os.path.join(destino, "referencia", nombre), "wb"
    ) as copia:
        copia.write(origen.read())
    esqueleto = {
        "meta": {"nombre": slug, "slug": slug, "fuentes": [nombre],
                 "fecha": "", "medio_origen": "", "no_copiado": []},
        "alma": {"una_linea": "", "adjetivos": [], "linaje": "",
                 "distancia_lectura": "",
                 "energia": {"densidad": 5, "variacion": 5,
                             "contraste": 5, "calidez": 5}},
        "paleta": [], "tipo": {"familias": []}, "espacio": {},
        "superficie": {}, "firmas": [],
        "jugada_rara": {"que": "", "como": "", "por_que": ""},
        "arquetipos": [], "movimiento": {}, "voz": {},
        "prohibiciones": [], "pruebas": [],
        "reconstruccion": {"intentada": False, "huecos": [], "pasadas": 0},
        "inferido": [],
    }
    with open(os.path.join(destino, "dna.json"), "w", encoding="utf-8") as f:
        json.dump(esqueleto, f, ensure_ascii=False, indent=2)
    return destino


def main(argv=None):
    parser = argparse.ArgumentParser(prog="diseno_adn.py")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("validar").add_argument("carpeta")
    sub.add_parser("compilar").add_argument("carpeta")
    p_comp = sub.add_parser("comprobar")
    p_comp.add_argument("carpeta")
    p_comp.add_argument("--metricas", required=True,
                        help="ruta a un JSON con las metricas medidas")
    sub.add_parser("capturar").add_argument("ruta")
    args = parser.parse_args(argv)
    try:
        if args.cmd == "validar":
            errores = validar_dna(cargar_dna(args.carpeta))
            for e in errores:
                print("error: " + e)
            print("sano" if not errores else "enfermo: %d errores" % len(errores))
            return 0 if not errores else 1
        if args.cmd == "compilar":
            construir = cmd_compilar(args.carpeta)
            print("PROMPT.md escrito (%d bytes)" % len(construir.encode("utf-8")))
            return 0
        if args.cmd == "comprobar":
            with open(args.metricas, encoding="utf-8") as f:
                metricas = json.load(f)
            aprobado, resultados = ejecutar_pruebas(args.carpeta, metricas)
            for pid, ok in resultados.items():
                print("%s: %s" % (pid, "aprobado" if ok else "suspenso"))
            print("aprobado" if aprobado else "suspenso")
            return 0 if aprobado else 1
        if args.cmd == "capturar":
            print(cmd_capturar(args.ruta))
            return 0
    except (ErrorAdn, OSError, json.JSONDecodeError) as exc:
        print("error: " + str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
