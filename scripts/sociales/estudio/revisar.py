"""revisar.py — la revisión automática que decide qué llega a «Para aprobar».

  python3 scripts/sociales/estudio/revisar.py <carpeta> [--seco]

Lee el manifiesto renderizado de una campaña y, por pieza, verifica:
  (a) el archivo existe y su sha256 coincide con el manifiesto
  (b) `fila_valida()` de su fila
  (c) `nucleo.mentiras_en` sobre todo texto visible o publicado
  (d) controles de medios (ffprobe, contraste, destellos, sonoridad, QR) SOLO a través de
      `comprobar_medios(ruta, entrada)`, inyectable: por defecto importa `verificar`;
      si falta ffprobe, numpy u OpenCV, lo apunta en `no_comprobado`
  (e) puntuación de Jev con `consultar(texto)`, inyectable: por defecto
      `scripts/puente/decidir.py puntuar`; si calla, la regla

Escribe `revision.json` junto al manifiesto.

  --seco  imprime y no escribe
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

AIKU = Path(__file__).resolve().parent
sys.path.insert(0, str(AIKU))

import nucleo

try:
    import verificar
    TIENE_VERIFICAR = True
except ImportError:
    TIENE_VERIFICAR = False

PREGUNTA_JEV = "¿Cumple la pieza verdad, legibilidad y tono?"
NIVELES_JEV = ["bajo", "medio", "alto"]
REGLA_JEV = "medio"


def sha256_archivo(ruta: Path) -> str:
    h = hashlib.sha256()
    with open(ruta, "rb") as f:
        for bloque in iter(lambda: f.read(1 << 20), b""):
            h.update(bloque)
    return h.hexdigest()


def comprobar_medios(ruta: Path, entrada: dict) -> dict:
    """Controles de medios: ffprobe, contraste, destellos, sonoridad, QR.
    Devuelve {ok: bool, problemas: [...], no_comprobado: [...]}.
    Si faltan herramientas, apunta en no_comprobado.
    """
    problemas = []
    no_comprobado = []

    verif = entrada.get("verificacion", {})

    try:
        s = subprocess.run(
            ["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(ruta)],
            capture_output=True, text=True, timeout=60
        )
        if s.returncode == 0:
            d = json.loads(s.stdout)
            vstr = next((st for st in d.get("streams", []) if st.get("codec_type") == "video"), None)
            if not vstr:
                no_comprobado.append("ffprobe no encontró stream de video")
        else:
            no_comprobado.append("ffprobe falló")
    except (subprocess.TimeoutExpired, FileNotFoundError):
        no_comprobado.append("ffprobe no disponible")
    except Exception:
        no_comprobado.append("error de ffprobe")

    if verif.get("contraste_fallos") and verif["contraste_fallos"] > 0:
        problemas.append(f"{verif['contraste_fallos']} textos bajo contraste AA")

    if verif.get("zona_segura_ok") is False:
        problemas.append("texto fuera de la zona segura")

    if verif.get("destellos_por_segundo", 0) > 3:
        problemas.append(f"destellos: {verif['destellos_por_segundo']}")

    v = verif.get("video", True)
    if v and verif.get("sonoridad_lufs") is not None:
        lufs = verif["sonoridad_lufs"]
        if lufs is None or abs(lufs + 14.0) > 1.5:
            problemas.append(f"sonoridad {lufs} LUFS (objetivo −14 ±1,5)")

    if verif.get("problemas"):
        problemas.extend(verif["problemas"])

    return {"ok": not problemas and not no_comprobado, "problemas": problemas, "no_comprobado": no_comprobado}


def consultar_jev(estado_json: str) -> dict | None:
    """Consulta a Jev para puntuar. Por defecto llama a decidir.py puntuar;
    si calla o falla, devuelve None para usar la regla."""
    try:
        r = subprocess.run(
            ["python3", str(AIKU.parent.parent / "puente" / "decidir.py"),
             "puntuar", "--estado", estado_json,
             "--pregunta", PREGUNTA_JEV, "--niveles", ",".join(NIVELES_JEV), "--regla", REGLA_JEV],
            capture_output=True, text=True, timeout=30
        )
        if r.returncode == 0:
            d = json.loads(r.stdout)
            return d
    except Exception:
        pass
    return None


def textos_visibles_de_entrada(entrada: dict, campana: dict) -> list[str]:
    """Extrae todo el texto visible o publicado de una pieza."""
    pieza_id = entrada.get("pieza", "")
    pieza = next((p for p in campana.get("piezas", []) if p.get("id") == pieza_id), None)
    if not pieza:
        return []

    textos = []
    for clave, por_idioma in (campana.get("guiones") or {}).items():
        for idioma, beats in por_idioma.items():
            lista = beats if isinstance(beats, list) else [beats]
            for b in lista:
                if not isinstance(b, dict):
                    continue
                for k in ("kicker", "titular", "sub", "cuerpo", "cta", "aviso", "pie", "pie_derecha", "qr_texto", "desliza", "numero"):
                    if isinstance(b.get(k), str):
                        textos.append(b[k])
                for it in b.get("lista") or []:
                    if isinstance(it, str):
                        textos.append(it)
                    elif isinstance(it, dict) and isinstance(it.get("texto"), str):
                        textos.append(it["texto"])
                for t in b.get("tarjetas") or []:
                    if isinstance(t, dict):
                        if isinstance(t.get("titulo"), str):
                            textos.append(t["titulo"])
                        if isinstance(t.get("texto"), str):
                            textos.append(t["texto"])
    return textos


def revision_pieza(entrada: dict, campana: dict, comprobar_medios_fn=None, consultar_fn=None) -> dict:
    """Revisa una pieza y devuelve {id, ok, motivos, no_comprobado, jev, sha_correcto}."""
    motivos = []
    no_comprobado = []

    if comprobar_medios_fn is None:
        comprobar_medios_fn = comprobar_medios
    if consultar_fn is None:
        consultar_fn = lambda t: consultar_jev(json.dumps({"texto": t[:500]}))

    sha_manifiesto = entrada.get("tabla", {}).get("sha256", "")
    sha_correcto = True
    ruta_abs = Path(campana["outputs"]) / entrada.get("ruta", "")

    if not sha_manifiesto:
        motivos.append("sha256 vacío en manifiesto")
        sha_correcto = False
    elif not ruta_abs.is_file():
        motivos.append("archivo falta")
    else:
        sha_real = sha256_archivo(ruta_abs)
        if sha_real != sha_manifiesto:
            motivos.append("sha256 distinto del manifiesto")
            sha_correcto = False

    fila_problemas = nucleo.fila_valida(entrada.get("tabla", {}))
    if fila_problemas:
        motivos.append(", ".join(fila_problemas))

    textos = textos_visibles_de_entrada(entrada, campana)
    for t in textos:
        mentiras = nucleo.mentiras_en(t)
        for m in mentiras:
            motivos.append(f"texto afirma lo prohibido: {m}")

    if sha_correcto and ruta_abs.is_file():
        resultados_medios = comprobar_medios_fn(ruta_abs, entrada)
        motivos.extend(resultados_medios.get("problemas", []))
        if resultados_medios.get("no_comprobado"):
            no_comprobado.append("controles de medios no realizados (faltan herramientas)")

    texto_jev = " | ".join(textos[:5])
    jev_crudo = consultar_fn(texto_jev) if texto_jev else None

    if jev_crudo:
        jev = jev_crudo
    else:
        jev = {"respuesta": REGLA_JEV, "p": None, "medio": "regla", "quien": "revisar.py"}

    ok = len(motivos) == 0 and len(no_comprobado) == 0 and sha_correcto

    return {
        "id": entrada.get("id", ""),
        "ok": ok,
        "motivos": motivos,
        "no_comprobado": no_comprobado,
        "jev": jev,
        "sha_correcto": sha_correcto,
    }


def revisar(carpeta: str, consultar=None, comprobar_medios_fn=None) -> dict:
    """Revisa una campaña y devuelve el dict de revisión."""
    salida = Path(carpeta)
    mf_path = salida / "manifiesto.json"

    if not mf_path.is_file():
        return {"error": "no hay manifiesto.json", "carpeta": carpeta, "piezas": []}

    mf = json.loads(mf_path.read_text(encoding="utf8"))

    campana = {
        "id": mf.get("campana", {}).get("id", ""),
        "piezas": [],
        "guiones": mf.get("guiones", {}),
        "outputs": salida,
    }

    for pz in mf.get("piezas", []):
        campana["piezas"].append({"id": pz.get("pieza", pz.get("id", ""))})

    resultados = []
    for entrada in mf.get("piezas", []):
        r = revision_pieza(entrada, campana, comprobar_medios_fn, consultar)
        resultados.append(r)

    t = sum(1 for r in resultados if r["ok"])
    return {
        "t": mf.get("t"),
        "ok": t == len(resultados),
        "piezas": resultados,
    }


def main(argv=None) -> int:
    import argparse

    ap = argparse.ArgumentParser(description=__doc__.strip().split("\n")[0])
    ap.add_argument("carpeta", help="carpeta con manifiesto.json")
    ap.add_argument("--seco", action="store_true", help="imprimir y no escribir")
    args = ap.parse_args(argv)

    salida = Path(args.carpeta)
    if not (salida / "manifiesto.json").is_file():
        print(f"✗ no hay manifiesto.json en {salida}", file=sys.stderr)
        return 1

    result = revisar(args.carpeta)

    if args.seco:
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0

    (salida / "revision.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(f"revision.json escrito en {salida}")
    return 0


if __name__ == "__main__":
    sys.exit(main())