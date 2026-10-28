# -*- coding: utf-8 -*-
"""LNN1028D · pasada nocturna de LEANN (contrato architecture/leann-recuerdo-semantico.md §3 y §4).
Recoge los pendientes del día y los añade a su índice; reconstruye `repo-starseed` del checkout
del A1 solo si cambió `git rev-parse HEAD`. Puros y probados: trozos y archivos_del_repo."""
import json, os, subprocess

import leann_servidor as PUERTA

BLOQUE, SOLAPE = 60, 10
NOMBRE_REPO = "repo-starseed"


def trozos(ruta, texto):
    """PURA. Bloques de BLOQUE líneas con SOLAPE de solape; metadatos {alcance: "publica", ruta, desde, hasta}."""
    lineas, paso, salida, desde = texto.splitlines(), BLOQUE - SOLAPE, [], 0
    while desde < len(lineas):
        hasta = min(desde + BLOQUE, len(lineas))
        fragmento = "\n".join(lineas[desde:hasta])
        if fragmento.strip():
            salida.append({"texto": fragmento, "metadatos": {
                "alcance": "publica", "ruta": ruta, "desde": desde + 1, "hasta": hasta}})
        if hasta >= len(lineas):
            break
        desde += paso
    return salida


def archivos_del_repo(raiz):
    """PURA. Rutas relativas de `src/**/*.ts(x)`, `scripts/puente/*.py` (sin `test_*`) y `architecture/*.md`."""
    salida = []
    fuente = os.path.join(raiz, "src")
    if os.path.isdir(fuente):
        for carpeta, _hijas, nombres in os.walk(fuente):
            salida += [os.path.relpath(os.path.join(carpeta, n), raiz)
                       for n in nombres if n.endswith((".ts", ".tsx"))]
    puente, arquitectura = os.path.join(raiz, "scripts", "puente"), os.path.join(raiz, "architecture")
    if os.path.isdir(puente):
        salida += ["scripts/puente/" + n for n in sorted(os.listdir(puente))
                   if n.endswith(".py") and not n.startswith("test_")]
    if os.path.isdir(arquitectura):
        salida += ["architecture/" + n for n in sorted(os.listdir(arquitectura)) if n.endswith(".md")]
    return sorted(salida)


def registros_de_pendientes(lineas):
    """PURA. Líneas de JSONL → (registros válidos —texto, índice y metadatos—, líneas malas)."""
    validos, malas = [], []
    for linea in (l.strip() for l in lineas):
        if not linea:
            continue
        try:
            dato = json.loads(linea)
        except ValueError:
            malas.append(linea)
            continue
        if isinstance(dato, dict) and isinstance(dato.get("texto"), str) \
                and isinstance(dato.get("indice"), str) and dato.get("indice") \
                and isinstance(dato.get("metadatos"), dict):
            validos.append(dato)
        else:
            malas.append(linea)
    return validos, malas


def grupos_de_registros(registros):
    """PURA. {índice: [{texto, metadatos}]} en orden de llegada."""
    grupos = {}
    for registro in registros:
        grupos.setdefault(registro["indice"], []).append(
            {"texto": registro["texto"], "metadatos": registro["metadatos"]})
    return grupos


def recoger_pendientes(dir_indices, dir_pendientes, poner=None):
    """Impura (A1). Añade los textos de cada `*.jsonl` a su índice y borra el archivo si todo
    entró; las líneas malas quedan solas a la espera. Devuelve un resumen por archivo."""
    resumen = []
    if not os.path.isdir(dir_pendientes):
        return resumen
    for nombre in sorted(os.listdir(dir_pendientes)):
        if not nombre.endswith(".jsonl"):
            continue
        ruta = os.path.join(dir_pendientes, nombre)
        with open(ruta, encoding="utf-8") as fichero:
            validos, malas = registros_de_pendientes(fichero.readlines())
        por_indice = grupos_de_registros(validos)
        for indice, textos in sorted(por_indice.items()):
            (poner or PUERTA.poner_textos)(dir_indices, indice, textos)
        if malas:
            with open(ruta, "w", encoding="utf-8") as fichero:
                fichero.write("\n".join(malas) + "\n")
        else:
            os.remove(ruta)
        resumen.append({"archivo": nombre, "registros": len(validos), "malas": len(malas),
                        "indices": sorted(por_indice)})
    return resumen


def construir_indice_repo(dir_indices, raiz, cabeza, fabrica=None):
    """Impura (A1). Reconstruye `repo-starseed` con los trozos del checkout y guarda la cabeza
    en `cabeza.txt` al lado del índice; si ya era la misma, no toca nada y vuelve False."""
    carpeta = os.path.join(dir_indices, NOMBRE_REPO)
    marca = os.path.join(carpeta, "cabeza.txt")
    if os.path.exists(marca):
        with open(marca, encoding="utf-8") as fichero:
            if fichero.read().strip() == cabeza:
                return False
    os.makedirs(carpeta, exist_ok=True)
    if fabrica is None:
        from leann import LeannBuilder  # noqa: PLC0415  solo en el A1, como pide el contrato §3
        constructor = LeannBuilder(
            backend_name="hnsw", embedding_model="qwen3-embedding:0.6b", embedding_mode="ollama")
    else:
        constructor = fabrica()
    for relativa in archivos_del_repo(raiz):
        with open(os.path.join(raiz, relativa), encoding="utf-8", errors="replace") as fichero:
            contenido = fichero.read()
        for trozo in trozos(relativa, contenido):
            constructor.add_text(trozo["texto"], metadata=trozo["metadatos"])
    constructor.build_index(os.path.join(carpeta, "documents.leann"))
    with open(marca, "w", encoding="utf-8") as fichero:
        fichero.write(cabeza + "\n")
    return True


def cabeza_de_git(raiz):
    """HEAD del checkout del A1; cadena vacía si git no responde (entonces no se reconstruye)."""
    try:
        resultado = subprocess.run(["git", "rev-parse", "HEAD"], cwd=raiz, capture_output=True, timeout=20)
        return resultado.stdout.decode("utf-8").strip() if resultado.returncode == 0 else ""
    except OSError:
        return ""


def main():
    """La lanza el temporizador de noche (D3). Sin pendientes y con la misma cabeza no gasta nada."""
    dir_indices = os.environ.get("STARSEED_LEANN_DIR", PUERTA.DIR_DEFECTO)
    raiz = os.environ.get("STARSEED_REPO_RAIZ") or os.path.dirname(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    recogidos = recoger_pendientes(dir_indices, os.path.join(dir_indices, "pendientes"))
    reconstruido = construir_indice_repo(dir_indices, raiz, cabeza_de_git(raiz))
    print("pendientes: %r" % (recogidos,))
    print("repo-starseed reconstruido: %s" % ("sí" if reconstruido else "no (misma cabeza)"))


if __name__ == "__main__":
    main()
