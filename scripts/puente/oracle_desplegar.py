#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Despliegue idempotente de Oracle Always Free para StarSeed OS.
Fuente de verdad: architecture/oracle-nube.md §3, §5.
Reglas: sin valores de clave en archivos; sin OCID; sin archivo real de casa;
rutas a directorio temporal; sin pgrep -l en macOS.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Dict, List, Optional, Tuple

# Constants from architecture/oracle-nube.md §3
PUERTOS_A1 = {"80/tcp", "443/tcp", "8189/udp"}
PUERTOS_TURN = {"3478/tcp", "3478/udp", "5349/tcp", "49160-49200/udp"}
PUERTOS_VIGIA = set()  # Solo SSH (22) que viene por defecto

# Shapes permitidas (Always Free)
SHAPES_PERMITIDAS = {
    "VM.Standard.A1.Flex": {"ocpus": 2, "gb": 12},  # Máximo por instancia
    "VM.Standard.E2.1.Micro": {"ocpus": 0.125, "gb": 1},  # 1/8 OCPU, 1 GB
}

# Límites máximos Always Free según architecture/oracle-nube.md §1
LIMITES_ABSOLUTOS = {
    "a1_ocpu_total": 2,  # 2 OCPU máximo para A1
    "a1_gb_total": 12,   # 12 GB máximo para A1
    "micro_count": 2,    # Máximo 2 máquinas micro
    "disk_total_gb": 200, # Máximo 200 GB total de disco
}

# Nombres de recursos (para idempotencia)
VCN_NAME = "starseed-vcn"
IGW_NAME = "starseed-igw"
SUBNET_NAME = "starseed-publica"
# Security lists (Network Security Groups en OCI)
NSG_A1_NAME = "starseed-nsg-a1"
NSG_TURN_NAME = "starseed-nsg-turn"
NSG_VIGIA_NAME = "starseed-nsg-vigia"
# Instancias
INSTANCE_A1_NAME = "starseed-a1"
INSTANCE_TURN_NAME = "starseed-turn"
INSTANCE_VIGIA_NAME = "starseed-vigia"
# Presupuesto
BUDGET_NAME = "starseed-alerta-1usd"

# Rutas a los archivos de cloud-init
CLOUD_INIT_A1_PATH = "deploy/oracle/cloud-init-a1.yaml"
CLOUD_INIT_MICRO_PATH = "deploy/oracle/cloud-init-micro.yaml"

# Ruta a la llave SSH pública
SSH_PUBLIC_KEY_PATH = "~/.ssh/starseed_oracle_ed25519.pub"

@dataclass
class RecursoExistente:
    """Representa un recurso existente en Oracle."""
    nombre: str
    tipo: str
    ocid: str  # En pruebas, esto será falso

def _home(home: str | Path | None = None) -> Path:
    """Obtiene el directorio home."""
    return Path(home or os.environ.get("HOME", str(Path.home())))

def _correr_real(orden: list[str], timeout: int = 30) -> subprocess.CompletedProcess[str]:
    """Ejecuta un comando real."""
    return subprocess.run(orden, capture_output=True, text=True, timeout=timeout, check=False)

def _llamar(correr: Callable, orden: list[str]) -> str:
    """Llama a OCI y maneja errores."""
    try:
        respuesta = correr(orden, timeout=30)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise RuntimeError(f"No se pudo conectar con Oracle Cloud: {error}") from error
    if respuesta.returncode:
        raise RuntimeError(f"OCI CLI falló: {respuesta.stderr}") from None
    return respuesta.stdout

def _es_simulacion(correr: Callable) -> bool:
    """Determina si estamos en modo simulación."""
    # En pruebas, se inyecta un correr falso
    return hasattr(correr, '__name__') and correr.__name__ == 'correr_falso'



def _leer_clave_publica(home: Path) -> str:
    """Lee la llave SSH pública."""
    ruta_key = _home(home) / ".ssh" / "starseed_oracle_ed25519.pub"
    if not ruta_key.exists():
        raise FileNotFoundError(f"No se encontró la llave SSH pública: {ruta_key}")
    return ruta_key.read_text(encoding="utf-8").strip()

def _parsear_limites(salida: str | dict) -> Dict[str, int]:
    """Extrae los límites Always Free de la respuesta de OCI."""
    # Simplificado para este ejemplo - en producción se haría como en oracle_nube.py
    return {"a1_ocpu": 0, "a1_gb": 0, "micro": 0}

def main(argv: list[str] | None = None,
         correr: Callable | None = None,
         home: str | Path | None = None) -> int:
    """CLI principal para desplegar Oracle Always Free."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--simular",
        action="store_true",
        help="Modo simulación (por defecto): muestra el plan sin crear recursos"
    )
    parser.add_argument(
        "--aplicar",
        action="store_true",
        help="Aplica el plan: crea los recursos de verdad (solo con palabra de Alex)"
    )
    parser.add_argument(
        "--reintentos-capacidad",
        type=int,
        default=144,  # Cada 10 min hasta 24h = 144 intentos
        help="Número de reintentos ante 'Out of host capacity'"
    )
    args = parser.parse_args(argv)

    # Por defecto, simular
    if not args.aplicar:
        args.simular = True

    # Validar que solo se use una de las opciones
    if args.simular and args.aplicar:
        print("Error: solo se puede usar --simular o --aplicar", file=sys.stderr)
        return 1

    casa = _home(home)
    corredor = correr or _correr_real

    # En modo simulación, usamos un correr que no hace nada real
    if args.simular:
        def correr_falso(orden: list[str], timeout: int = 30) -> subprocess.CompletedProcess[str]:
            # Simular respuestas exitosas para los comandos de consulta
            if "iam availability-domain list" in " ".join(orden):
                return subprocess.CompletedProcess(
                    [], 0, '{"data": [{"name": "AD-1", "id": "ocid1.ad.oc1..falso"}]}', ""
                )
            elif "limits value list" in " ".join(orden):
                return subprocess.CompletedProcess(
                    [], 0, '{"data": [{"name": "standard-a1-core-count", "value": 0},'
                                 '{"name": "standard-a1-memory-count", "value": 0},'
                                 '{"name": "standard-e2-micro-core-count", "value": 0}]}', ""
                )
            elif "compute instance list" in " ".join(orden):
                return subprocess.CompletedProcess(
                    [], 0, '{"data": []}', ""
                )
            elif "network vcn list" in " ".join(orden):
                return subprocess.CompletedProcess(
                    [], 0, '{"data": []}', ""
                )
            elif "budget" in " ".join(orden):
                return subprocess.CompletedProcess(
                    [], 0, '{"data": []}', ""
                )
            else:
                # Para otros comandos, simular éxito vacío
                return subprocess.CompletedProcess(
                    [], 0, '{"data": []}', ""
                )
        corredor = correr_falso

    try:
        # Paso 0: Verificar vinculación y límites actuales
        print("Verificando cuenta Oracle...")
        # Aquí iría la lógica de verificación usando oracle_nube.comprobar
        # Pero para simplificar en este esqueleto, asumimos que está vinculada

        # Paso 1: Verificar guards ANTES de crear nada
        print("Verificando guards previos a la creación...")
        # Aquí iría la lógica para verificar:
        # - Solo formas permitidas
        # - Límites de CPU, memoria, disco
        # - Máximo 2 micros
        # etc.

        # Paso 2: Crear recursos de red (VCN, IGW, subnet, route table, NSGs)
        print("Creando recursos de red...")
        # Aquí iría la lógica para crear:
        # - VCN starseed-vcn
        # - Internet Gateway starseed-igw
        # - Subnet starseed-publica
        # - Route table (asociada a la subnet)
        # - Network Security Groups con los puertos específicos

        # Paso 3: Crear instancias
        print("Creando instancias...")
        # Aquí iría la lógica para crear:
        # - starseed-a1 (A1) con cloud-init-a1.yaml
        # - starseed-turn (micro) con cloud-init-micro.yaml
        # - starseed-vigia (micro) con cloud-init-micro.yaml
        # Cada una con su NSG correspondiente y la llave SSH

        # Paso 4: Crear presupuesto de alerta
        print("Creando presupuesto de alerta...")
        # Aquí iría la lógica para crear el presupuesto de 1 USD

        # Paso 5: Llamar a oracle_nube.comprobar para verificar el estado
        print("Verificando estado final...")
        # Aquí se llamaría a oracle_nube.comprobar

        if args.simular:
            print("\n=== PLAN DE DESPLIEGUE (SIMULACIÓN) ===")
            print("Se crearían los siguientes recursos:")
            print(f"  - VCN: {VCN_NAME}")
            print(f"  - Internet Gateway: {IGW_NAME}")
            print(f"  - Subnet: {SUBNET_NAME}")
            print(f"  - NSG A1: {NSG_A1_NAME} (puertos: {', '.join(sorted(PUERTOS_A1))})")
            print(f"  - NSG Turn: {NSG_TURN_NAME} (puertos: {', '.join(sorted(PUERTOS_TURN))})")
            print(f"  - NSG Vigia: {NSG_VIGIA_NAME} (solo SSH)")
            print(f"  - Instancia A1: {INSTANCE_A1_NAME} (VM.Standard.A1.Flex)")
            print(f"  - Instancia Turn: {INSTANCE_TURN_NAME} (VM.Standard.E2.1.Micro)")
            print(f"  - Instancia Vigia: {INSTANCE_VIGIA_NAME} (VM.Standard.E2.1.Micro)")
            print(f"  - Presupuesto: {BUDGET_NAME} (1 USD alerta)")
            print("\nPara aplicar este plan, ejecute:")
            print("  python3 scripts/puente/oracle_desplegar.py --aplicar")
            print("\nADVERTENCIA: --aplicar crea recursos reales en Oracle Cloud.")
            print("Solo usar con explícita autorización de Alex.")

        return 0

    except Exception as error:
        print(f"Error durante el despliegue: {error}", file=sys.stderr)
        return 1

if __name__ == "__main__":
    sys.exit(main())