#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Genera bateria-1118.json a partir de la especificación de bloques B1-B10.

Estructura por bloque:
- Cada bloque tiene 2 pruebas (pares): A1 y A2
- 3 antenas: ble, wifi, malla (rotando)
- 2 rondas por bloque
- Criterios debe/no_debe por aparato (mac, maggabox, tableta)
"""
import json
from pathlib import Path

RAIZ_REPO = Path(__file__).resolve().parents[2]
PRUEBAS_DIR = RAIZ_REPO / "starseed_memory_root" / "pruebas"
BATERIA_JSON = PRUEBAS_DIR / "bateria-1118.json"

ANTenas = ("ble", "wifi", "malla")
APARATOS = ("mac", "maggabox", "tableta")

# Patrones base por antena para criterios
PATRONES_ANTENA = {
    "ble": {
        "debe": [
            r"ble.*l2cap-kbps",
            r"ble.*enlace=\w+",
        ],
        "no_debe": [
            r"ble.*timeout",
            r"ble.*desconectado",
        ],
    },
    "wifi": {
        "debe": [
            r"wifi.*tx-mbps",
            r"wifi.*rssi=-\d+",
        ],
        "no_debe": [
            r"wifi.*desasociado",
            r"wifi.*auth-fail",
        ],
    },
    "malla": {
        "debe": [
            r"malla.*relevo.*ok",
            r"malla.*latencia-ms=\d+",
        ],
        "no_debe": [
            r"malla.*relevo.*fallo",
            r"malla.*sin-ruta",
        ],
    },
}

# Patrones base por aparato
PATRONES_APARATO = {
    "mac": {
        "debe": [
            r"enlaces\.log.*ble",
            r"control-neuronas\.log.*sesion",
        ],
        "no_debe": [
            r"enlaces\.log.*error",
            r"control-neuronas\.log.*rechazo",
        ],
    },
    "maggabox": {
        "debe": [
            r"malla.*neurona.*activa",
            r"relevo.*entregado",
        ],
        "no_debe": [
            r"malla.*neurona.*caida",
            r"relevo.*perdido",
        ],
    },
    "tableta": {
        "debe": [
            r"logcat.*V.*sesion",
            r"logcat.*V.*enlace",
        ],
        "no_debe": [
            r"logcat.*E.*crash",
            r"logcat.*W.*timeout",
        ],
    },
}

# Pasos base por tipo de prueba
PASOS_BASE = {
    "apertura": [
        "Activar indicador nativo en el aparato origen",
        "Verificar que la sesión de control se abre (nivel=controlar, alcance=total)",
        "Confirmar enlace BLE/WiFi/Malla establecido (kbps/mbps > 0)",
        "Registrar hora de inicio en UTC",
    ],
    "transito": [
        "Enviar trama de prueba (ping/echo) por la antena indicada",
        "Verificar recepción en el aparato destino (ack/echo-reply)",
        "Medir latencia y ancho de banda (ms / kbps-mbps)",
        "Confirmar que no hay pérdidas en la ventana de 30 s",
    ],
    "cierre": [
        "Cerrar sesión de control desde el indicador nativo",
        "Verificar fin de sesión (motivo=la-persona-desde-el-indicador)",
        "Confirmar que el enlace se desconecta ordenadamente",
        "Registrar hora de fin en UTC",
    ],
}

def generar_pruebas():
    """Genera la lista de pruebas para bloques B1-B10."""
    pruebas = []
    for bloque_num in range(1, 11):
        bloque = f"B{bloque_num}"
        for par_num in (1, 2):  # A1, A2
            for ronda in (1, 2):
                # Rotar antena: B1->ble, B2->wifi, B3->malla, B4->ble...
                antena_idx = (bloque_num + par_num + ronda) % 3
                antena = ANTenas[antena_idx]

                # Rotar aparatos: cada prueba usa 2 de 3 aparatos
                aparatos_idx = (bloque_num + par_num) % 3
                aparatos = [APARATOS[aparatos_idx], APARATOS[(aparatos_idx + 1) % 3]]

                id_prueba = f"{bloque}-MT-A{par_num}-R{ronda}"
                titulo = f"{bloque} · Malla · Antena {antena.upper()} · Ronda {ronda} · Par A{par_num}"

                # Construir criterios por aparato
                criterios = {}
                for aparato in aparatos:
                    crit_debe = []
                    crit_no_debe = []

                    # Añadir patrones de la antena
                    crit_debe.extend(PATRONES_ANTENA[antena]["debe"])
                    crit_no_debe.extend(PATRONES_ANTENA[antena]["no_debe"])

                    # Añadir patrones del aparato
                    crit_debe.extend(PATRONES_APARATO[aparato]["debe"])
                    crit_no_debe.extend(PATRONES_APARATO[aparato]["no_debe"])

                    criterios[aparato] = {
                        "debe": crit_debe,
                        "no_debe": crit_no_debe,
                    }

                # Pasos: apertura + tránsito + cierre
                pasos = []
                pasos.extend(PASOS_BASE["apertura"])
                pasos.extend(PASOS_BASE["transito"])
                pasos.extend(PASOS_BASE["cierre"])

                prueba = {
                    "id": id_prueba,
                    "titulo": titulo,
                    "bloque": bloque,
                    "ronda": ronda,
                    "aparatos": aparatos,
                    "antena": antena,
                    "pasos": pasos,
                    "criterios": criterios,
                }
                pruebas.append(prueba)

    return pruebas


def main():
    PRUEBAS_DIR.mkdir(parents=True, exist_ok=True)

    bateria = {
        "bateria": "1118",
        "version": 1,
        "descripcion": "Batería completa de pruebas de malla PRU1118A - Bloques B1-B10, pares, antenas, rondas",
        "pruebas": generar_pruebas(),
    }

    with BATERIA_JSON.open("w", encoding="utf-8") as f:
        json.dump(bateria, f, ensure_ascii=False, indent=2)

    print(f"✅ Batería generada en {BATERIA_JSON}")
    print(f"   Total pruebas: {len(bateria['pruebas'])}")
    print(f"   Bloques: B1-B10")
    print(f"   Rondas por bloque: 2")
    print(f"   Pares por bloque: 2 (A1, A2)")
    print(f"   Antenas: ble, wifi, malla (rotando)")


if __name__ == "__main__":
    main()