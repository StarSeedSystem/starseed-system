"""Cortes y continuidad de la película (CVV1028, tarea M).

Uso:
  python3 scripts/contenido_vivo/cortes.py <clip.mp4>
  python3 scripts/contenido_vivo/cortes.py <carpeta_de_fotogramas>

Mide la SSIM de pares vecinos con ffmpeg y juzga cada par contra su mediana
local (ventana de 3 a cada lado), nunca contra un umbral fijo.
Solo biblioteca estándar. Contrato: architecture/contenido-vivo.md §5.
"""
import os
import re
import statistics
import subprocess
import sys
VENTANA = 3
MINIMO_PARES = 3
CORTE = 0.45
CONGELADO = 0.995
_ALL = re.compile(r"All:([0-9.]+)")

def mediana_local(serie, indice, ventana=VENTANA):
    """Mediana de la serie alrededor del par, incluido el propio par."""
    desde = max(0, indice - ventana)
    hasta = min(len(serie), indice + ventana + 1)
    return statistics.median(serie[desde:hasta])

def juzgar_pares(serie, local=True, minimo=MINIMO_PARES, corte=CORTE,
                 congelado=CONGELADO, ventana=VENTANA):
    """Juzga cada par contra su mediana local o la del clip entero."""
    valores = [float(v) for v in serie]
    if not valores:
        return {"pares": 0, "cortes": [], "congelados": [], "pasa": False,
                "motivo": "no hay pares medidos"}
    del_clip = statistics.median(valores)
    cortes, congelados = [], []
    for indice, ssim in enumerate(valores):
        base = mediana_local(valores, indice, ventana) if local else del_clip
        if base > 0 and ssim < corte * base:
            cortes.append(indice)
        elif local and ssim > congelado:
            congelados.append(indice)
    if len(valores) < minimo:
        motivo = f"solo hay {len(valores)} pares medidos, hacen falta {minimo}"
    elif cortes:
        motivo = (f"{len(cortes)} corte(s) bajo el umbral local" if local
                  else f"{len(cortes)} corte(s) bajo la mediana del clip")
    elif len(congelados) > 2:
        motivo = f"{len(congelados)} pares congelados, el tope es 2"
    else:
        motivo = "sin cortes y con movimiento suficiente"
    pasa = len(valores) >= minimo and not cortes and len(congelados) <= 2
    return {"pares": len(valores), "cortes": cortes, "congelados": congelados,
            "pasa": pasa, "motivo": motivo}

def _ffmpeg(argumentos):
    orden = ["ffmpeg", "-hide_banner", "-loglevel", "error"] + argumentos
    proceso = subprocess.run(orden, capture_output=True, text=True)
    if proceso.returncode != 0:
        raise RuntimeError(proceso.stderr.strip() or "ffmpeg falló")
    return proceso.stdout

def _pares_ssim(clip):
    """SSIM de cada par vecino: el fotograma i contra el i-1."""
    sonda = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_frames",
         "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", clip],
        capture_output=True, text=True)
    try:
        total = int(sonda.stdout.strip().split(",")[0])
    except ValueError:
        raise RuntimeError("no se pudo contar los fotogramas del clip")
    salida = _ffmpeg([
        "-i", clip, "-i", clip, "-filter_complex",
        "[0:v]trim=start_frame=1,setpts=PTS-STARTPTS[a];"
        f"[1:v]trim=end_frame={max(total - 1, 0)},setpts=PTS-STARTPTS[b];"
        "[a][b]ssim=stats_file=-",
        "-f", "null", "-",
    ])
    return [float(v) for v in _ALL.findall(salida)]

def _pares_carpeta(carpeta, paso=4):
    """SSIM entre fotogramas separados por el paso indicado."""
    nombres = sorted(n for n in os.listdir(carpeta)
                     if n.lower().endswith((".png", ".jpg", ".jpeg", ".webp")))
    muestras = nombres[::max(1, int(paso))]
    pares = []
    for antes, despues in zip(muestras, muestras[1:]):
        salida = _ffmpeg([
            "-i", os.path.join(carpeta, antes), "-i", os.path.join(carpeta, despues),
            "-lavfi", "ssim=stats_file=-", "-f", "null", "-",
        ])
        valores = _ALL.findall(salida)
        if valores:
            pares.append(float(valores[-1]))
    return pares

def cortes(clip):
    """Cortes dentro de un clip: par vecino muy por debajo de la mediana."""
    return juzgar_pares(_pares_ssim(clip), local=False)

def continuidad(carpeta_fotogramas, paso=4):
    """Continuidad de toda la película: cada par contra su mediana local."""
    return juzgar_pares(_pares_carpeta(carpeta_fotogramas, paso))

def main(argumentos):
    if len(argumentos) != 2:
        print("Uso: python3 scripts/contenido_vivo/cortes.py <clip.mp4 | carpeta_de_fotogramas>")
        return 2
    ruta = argumentos[1]
    informe = continuidad(ruta) if os.path.isdir(ruta) else cortes(ruta)
    print(f"Pares medidos: {informe['pares']}")
    for clave in ("cortes", "congelados"):
        if informe[clave]:
            pares = ", ".join(str(i) for i in informe[clave])
            print(f"{clave.capitalize()} en los pares: {pares}")
    print(("PASA " if informe["pasa"] else "FALLA ") + informe["motivo"])
    return 0 if informe["pasa"] else 1
if __name__ == "__main__":
    sys.exit(main(sys.argv))
