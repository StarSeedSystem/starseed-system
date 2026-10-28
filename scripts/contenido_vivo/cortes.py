"""Cortes y continuidad de la película (CVV1028, tarea M).

SSIM de pares vecinos con ffmpeg, contra la mediana del clip en `cortes` y
contra la mediana local de cada par en `continuidad`.
Contrato: architecture/contenido-vivo.md §5.
"""
import os, re, subprocess, sys, tempfile
from statistics import median

UMBRAL_CORTE = 0.45
UMBRAL_CONGELADO = 0.995
VENTANA = 3
MIN_PARES = 3
_EXTENSIONES = (".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff")
_SSIM = re.compile(r"All:([0-9.]+)")

def _mediana_local(serie, indice, ventana=VENTANA):
    """Mediana de los pares vecinos dentro de ±ventana, sin el propio."""
    inicio, fin = max(0, indice - ventana), min(len(serie), indice + ventana + 1)
    vecinos = [serie[j] for j in range(inicio, fin) if j != indice]
    return median(vecinos) if vecinos else serie[indice]

def puntuar(serie, local=True, ventana=VENTANA, mirar_congelados=True):
    """Veredicto de una serie de SSIM: cortes y congelados."""
    valores = [float(valor) for valor in serie]
    if len(valores) < MIN_PARES:
        return {"pasa": False, "motivos": [f"menos de {MIN_PARES} pares medidos"],
                "cortes": [], "congelados": [], "pares": len(valores)}
    mediana_clip = median(valores)
    referencias = [(_mediana_local(valores, i, ventana) if local else mediana_clip)
                   for i in range(len(valores))]
    cortes_en = [i for i, (valor, ref) in enumerate(zip(valores, referencias))
                 if ref and valor < UMBRAL_CORTE * ref]
    congelados_en = ([i for i, valor in enumerate(valores) if valor > UMBRAL_CONGELADO]
                     if mirar_congelados else [])
    motivos = []
    if cortes_en:
        motivos.append(f"{len(cortes_en)} corte(s) en los pares {cortes_en}")
    if len(congelados_en) > 2:
        motivos.append(f"{len(congelados_en)} fotogramas congelados, el tope es 2")
    return {"pasa": not motivos, "motivos": motivos, "cortes": cortes_en,
            "congelados": congelados_en, "pares": len(valores)}

def _stats(ffmpeg, entradas, filtro):
    """Ejecuta ffmpeg y devuelve la serie de SSIM de su archivo de estadísticas."""
    with tempfile.NamedTemporaryFile("w", suffix=".ssim", delete=False) as temporal:
        ruta = temporal.name
    try:
        orden = [ffmpeg, "-hide_banner", "-nostdin", "-loglevel", "error"]
        for entrada in entradas:
            orden += ["-i", entrada]
        orden += ["-filter_complex", filtro.format(stats=ruta), "-f", "null", "-"]
        try:
            proceso = subprocess.run(orden, capture_output=True, text=True, check=False)
        except OSError as error:
            raise RuntimeError(f"no se pudo lanzar ffmpeg: {error}") from error
        if proceso.returncode != 0:
            cola = proceso.stderr.strip().splitlines()
            raise RuntimeError("ffmpeg falló: " + (cola[-1] if cola else "sin detalle"))
        with open(ruta, encoding="utf-8") as flujo:
            return [float(m.group(1)) for m in map(_SSIM.search, flujo) if m]
    finally:
        os.unlink(ruta)

def _ssim_clip(clip, ffmpeg):
    filtro = ("[0:v]split=2[a][b];[a]trim=start_frame=1,setpts=PTS-STARTPTS[prev];"
              "[b]setpts=PTS-STARTPTS[cur];[prev][cur]ssim=stats_file={stats}")
    return _stats(ffmpeg, [clip], filtro)

def _ssim_par(primero, segundo, ffmpeg):
    serie = _stats(ffmpeg, [primero, segundo], "[0:v][1:v]ssim=stats_file={stats}")
    return serie[-1] if serie else 0.0

def _clave(ruta):
    return [int(p) if p.isdigit() else p.lower()
            for p in re.split(r"(\d+)", os.path.basename(ruta))]

def _fotogramas(carpeta):
    if not os.path.isdir(carpeta):
        raise RuntimeError(f"no existe la carpeta de fotogramas: {carpeta}")
    return sorted((os.path.join(carpeta, n) for n in os.listdir(carpeta)
                   if n.lower().endswith(_EXTENSIONES)), key=_clave)

def cortes(clip, ffmpeg="ffmpeg"):
    """Cortes dentro de un clip: cada par contra la mediana del clip entero."""
    return puntuar(_ssim_clip(clip, ffmpeg), local=False, mirar_congelados=False)

def continuidad(carpeta_fotogramas, paso=4, ffmpeg="ffmpeg"):
    """Cada fotograma contra el que está `paso` posiciones después, con mediana local."""
    fotogramas = _fotogramas(carpeta_fotogramas)
    paso = max(1, int(paso))
    serie = [_ssim_par(fotogramas[i], fotogramas[i + paso], ffmpeg)
             for i in range(len(fotogramas) - paso)]
    resultado = puntuar(serie, local=True, mirar_congelados=True)
    resultado.update({"fotogramas": len(fotogramas), "paso": paso})
    return resultado

def main(argumentos):
    if len(argumentos) < 3:
        print("Uso: cortes.py clip <archivo> | continuidad <carpeta> [paso]")
        return 2
    orden, objetivo = argumentos[1], argumentos[2]
    try:
        if orden == "clip":
            resultado = cortes(objetivo)
        elif orden == "continuidad":
            resultado = continuidad(objetivo, int(argumentos[3]) if len(argumentos) > 3 else 4)
        else:
            print("FALLA orden desconocida:", orden)
            return 2
    except (RuntimeError, ValueError) as error:
        print("FALLA", error)
        return 2
    for motivo in resultado["motivos"]:
        print("FALLA", motivo)
    print(("PASA" if resultado["pasa"] else "FALLA"), f"{resultado['pares']} pares medidos")
    return 0 if resultado["pasa"] else 1

if __name__ == "__main__":
    sys.exit(main(sys.argv))
