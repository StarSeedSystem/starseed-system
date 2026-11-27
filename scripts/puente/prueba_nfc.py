#!/usr/bin/env python3
"""NFC1126H · pruebas de MetaGenesis del NFC de las neuronas (contrato: architecture/nfc-neuronas.md).

Qué hace, sin que nadie acerque nada:
  1. Corre las pruebas de la lógica NFC (`src/lib/nfc`): tarjetas firmadas, preferencias,
     decisión de opciones, encuentros, traspaso al transporte y nodos.
  2. Mira por adb qué aparatos tienen NFC (`pm list features | grep nfc`).
  3. Arma el informe del canal Principal: lo que ya probó MetaGenesis y lo que SOLO se puede
     probar acercando dos teléfonos (guion de la ronda en aparatos).
"""
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from typing import Callable, Optional

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CARPETA_PRUEBAS = "src/lib/nfc"
FICHAS = ("Maggaboard", "Maggadroid")  # nombres de los aparatos de la ronda

# Escenarios que cubren las pruebas automáticas (archivo de prueba → qué simula). El contrato manda.
ESCENARIOS = {
    "tarjeta.test.ts": "tarjeta firmada: NDEF, vigencia de 30 s, nonce repetido, firma falsa",
    "nfc1126a.test.ts": "preferencias por relación: misma cuenta, otra cuenta, nodos, etiquetas",
    "decidir.test.ts": "decisión de opciones: automáticas, ofrecidas, ignorar, recordar",
    "estado-cercania.test.ts": "estado de «NFC y cercanía» en las cuatro puertas",
    "nfc1126e.test.ts": "traspaso al mejor transporte: BLE, Wi‑Fi y malla; toque y límite de 32 KB",
    "nfc1126f.test.ts": "nodos y etiquetas: oferta, privacidad del visitante, eventos",
    "nfc1126g.test.ts": "respaldo sin NFC: BLE por cercanía y código QR",
}

# Lo que solo se comprueba con dos aparatos en la mano.
PASOS_RONDA = (
    "Android ↔ Android, misma cuenta: acercar; en ambos sale «Cerca de ti» con las opciones propias.",
    "Android ↔ Android, otra cuenta nueva: acercar; solo se muestran opciones, nada se ejecuta solo.",
    "Alternar lector y emulador (HCE): acercar dos veces cambiando quién apoya la espalda.",
    "Archivo de 5 MB por el vínculo: el toque «aceptar» aparece y el archivo va por BLE/Wi‑Fi, no por NFC.",
    "Etiqueta NDEF escrita desde la Protomolécula: al tocarla sale la oferta del nodo.",
    "Audífonos o bocina con etiqueta de emparejamiento Bluetooth: tocar y conectar sin listas.",
    "Ignorar y recordar: ignorar una neurona y comprobar que ya no avisa; recordar y ver sus preferencias.",
    "Sin NFC (aparato sin chip): el respaldo por QR abre la misma tarjeta firmada.",
)


@dataclass
class ResultadoVitest:
    ok: bool
    archivos: int = 0
    pruebas: int = 0
    falladas: int = 0
    resumen_visto: bool = False


@dataclass
class Aparato:
    serie: str
    estado: str
    nfc: Optional[bool] = None  # None = no se pudo preguntar
    nombre: str = ""


@dataclass
class Informe:
    vitest: ResultadoVitest
    aparatos: list = field(default_factory=list)


def analizar_vitest(codigo: int, salida: str) -> ResultadoVitest:
    """El silencio NO es aprobación: sin el resumen de vitest no se ha comprobado nada."""
    archivos = re.search(r"Test Files\s+(?:(\d+) failed \| )?(\d+) passed \((\d+)\)", salida)
    pruebas = re.search(r"Tests\s+(?:(\d+) failed \| )?(\d+) passed \((\d+)\)", salida)
    if not archivos or not pruebas:
        return ResultadoVitest(ok=False)
    falladas = int(pruebas.group(1) or 0)
    return ResultadoVitest(
        ok=codigo == 0 and falladas == 0 and not archivos.group(1),
        archivos=int(archivos.group(3)),
        pruebas=int(pruebas.group(3)),
        falladas=falladas,
        resumen_visto=True,
    )


def analizar_adb_devices(salida: str) -> list:
    aparatos = []
    for linea in salida.splitlines()[1:]:
        partes = linea.split()
        if len(partes) >= 2:
            aparatos.append(Aparato(serie=partes[0], estado=partes[1]))
    return aparatos


def tiene_nfc(caracteristicas: str) -> bool:
    """`pm list features`: el chip es `android.hardware.nfc`; `.hce` solo habla de la emulación."""
    return re.search(r"^feature:android\.hardware\.nfc\s*$", caracteristicas, re.M) is not None


def completar_nfc(aparato: Aparato, preguntar: Callable[[str], str]) -> None:
    """Pregunta solo a los aparatos autorizados; el resto queda sin dato."""
    if aparato.estado != "device":
        return
    aparato.nfc = tiene_nfc(preguntar(aparato.serie))


def guion_ronda() -> list:
    return [f"{i}. {p}" for i, p in enumerate(PASOS_RONDA, 1)]


def componer_informe(inf: Informe) -> str:
    v = inf.vitest
    if v.ok:
        lineas = [f"NFC de las neuronas · MetaGenesis probó sola {v.pruebas} pruebas en {v.archivos} archivos: todo en verde."]
    elif not v.resumen_visto:
        lineas = ["NFC de las neuronas · las pruebas no dieron resumen: no se comprobó nada."]
    else:
        lineas = [f"NFC de las neuronas · FALLAN {v.falladas} de {v.pruebas} pruebas. Antes de la ronda hay que arreglarlas."]
    lineas.append("Cubierto sin aparatos: " + "; ".join(ESCENARIOS.values()) + ".")
    con_nfc = [a for a in inf.aparatos if a.nfc]
    if not inf.aparatos:
        lineas.append("Aparatos: ninguno conectado por adb.")
    else:
        lineas.append(f"Aparatos por adb: {len(inf.aparatos)}, {len(con_nfc)} con NFC.")
    if v.ok and len(con_nfc) >= 2:
        lineas.append("Dos aparatos con NFC listos para la ronda.")
    elif v.ok and inf.aparatos:
        lineas.append("Para la ronda falta un segundo aparato con NFC.")
    if v.ok:
        lineas.append("Ronda en aparatos (solo esto necesita acercar dos teléfonos):")
        lineas.extend(guion_ronda())
    return "\n".join(lineas)


def ejecutar(
    correr_vitest: Callable[[], tuple],
    listar_adb: Callable[[], str],
    preguntar_nfc: Callable[[str], str],
    avisar: Callable[[str, str, str, Optional[str]], None],
) -> int:
    codigo, salida = correr_vitest()
    vitest = analizar_vitest(codigo, salida)
    try:
        aparatos = analizar_adb_devices(listar_adb())
    except (FileNotFoundError, subprocess.SubprocessError, OSError):
        aparatos = []
    for a in aparatos:
        try:
            completar_nfc(a, preguntar_nfc)
        except (subprocess.SubprocessError, OSError):
            a.nfc = None
    avisar(componer_informe(Informe(vitest, aparatos)), "prueba-nfc", "informe", None)
    return 0 if vitest.ok else 1


def _vitest_real() -> tuple:
    entorno = dict(os.environ, NODE_ENV="test")
    r = subprocess.run(
        ["npx", "vitest", "run", CARPETA_PRUEBAS],
        cwd=RAIZ, capture_output=True, text=True, timeout=600, env=entorno,
    )
    return r.returncode, r.stdout + r.stderr


def _adb(*args: str) -> str:
    return subprocess.run(["adb", *args], capture_output=True, text=True, timeout=20).stdout


def _avisar_real(msg: str, quien: str, tipo: str, tarea: Optional[str]) -> None:
    """Sin canal enlazado, el informe sale por la salida estándar (el vigía lo lleva al canal Principal)."""
    print(msg)


if __name__ == "__main__":
    sys.exit(ejecutar(
        _vitest_real,
        lambda: _adb("devices", "-l"),
        lambda serie: _adb("-s", serie, "shell", "pm", "list", "features"),
        _avisar_real,
    ))
