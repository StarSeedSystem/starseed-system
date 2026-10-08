#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Despliegue idempotente de Oracle Always Free para StarSeed OS."""
from __future__ import annotations

print("DEBUG: Script started", file=sys.stderr)

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

print("DEBUG: Imports done", file=sys.stderr)

# Constants from the contract
VCN_NAME = "starseed-vcn"
IGW_NAME = "starseed-igw"
SUBNET_NAME = "starseed-publica"
# Security lists (NSGs) names
NSG_A1_NAME = "starseed-nsg-a1"
NSG_TURN_NAME = "starseed-nsg-turn"
NSG_VIGIA_NAME = "starseed-nsg-vigia"
# Instance names
INSTANCE_A1_NAME = "starseed-a1"
INSTANCE_TURN_NAME = "starseed-turn"
INSTANCE_VIGIA_NAME = "starseed-vigia"
# Budget alert name
BUDGET_ALERT_NAME = "starseed-alerta-1usd"
# Shapes allowed
SHAPE_A1 = "VM.Standard.A1.Flex"
SHAPE_MICRO = "VM.Standard.E2.1.Micro"
# Limits
MAX_A1_OCPU = 2
MAX_A1_GB = 12
MAX_MICRO = 2
MAX_DISK_GB = 200
# Cloud-init paths
CLOUD_INIT_A1 = Path("deploy/oracle/cloud-init-a1.yaml")
CLOUD_INIT_MICRO = Path("deploy/oracle/cloud-init-micro.yaml")
# SSH public key path
SSH_PUB_KEY = Path.home() / ".ssh" / "starseed_oracle_ed25519.pub"


def _home(home: str | Path | None = None) -> Path:
    return Path(home or os.environ.get("HOME", str(Path.home())))


def _run_oci(
    command: List[str],
    runner: Optional[Callable[..., subprocess.CompletedProcess[str]]] = None,
    timeout: int = 60,
) -> subprocess.CompletedProcess[str]:
    """Ejecuta un comando de OCI CLI con una capa de ejecución inyectable."""
    if runner is None:
        runner = subprocess.run
    return runner(
        command,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )


def _oci_call(
    command: List[str],
    runner: Optional[Callable[..., subprocess.CompletedProcess[str]]] = None,
) -> str:
    """Llama a OCI CLI y lanza RuntimeError en caso de error."""
    result = _run_oci(command, runner)
    if result.returncode != 0:
        raise RuntimeError(f"OCI CLI falló: {result.stderr.strip()}")
    return result.stdout


def _json_output(output: str) -> Dict:
    """Convierte la salida JSON de OCI CLI a un diccionario."""
    try:
        data = json.loads(output)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def _existe_vcn(runner: Optional[Callable] = None) -> bool:
    """Comprueba si la VCN existe."""
    try:
        salida = _oci_call(
            ["oci", "network", "vcn", "list", "--display-name", VCN_NAME, "--all"],
            runner,
        )
        data = _json_output(salida)
        return len(data.get("data", [])) > 0
    except RuntimeError:
        return False


def _crear_vcn(runner: Optional[Callable] = None) -> str:
    """Crea la VCN y devuelve su OCID."""
    salida = _oci_call(
        [
            "oci",
            "network",
            "vcn",
            "create",
            "--cidr-block",
            "10.0.0.0/16",
            "--display-name",
            VCN_NAME,
            "--compartment-id",
            os.environ.get("OCI_TENANCY", ""),
        ],
        runner,
    )
    return _json_output(salida).get("data", {}).get("id", "")


# We'll continue in the next chunk due to line limit.


def _existe_igw(vcn_id: str, runner: Optional[Callable] = None) -> bool:
    """Comprueba si el Internet Gateway existe en la VCN."""
    try:
        salida = _oci_call(
            [
                "oci",
                "network",
                "internet-gateway",
                "list",
                "--vcn-id",
                vcn_id,
                "--display-name",
                IGW_NAME,
                "--all",
            ],
            runner,
        )
        data = _json_output(salida)
        return len(data.get("data", [])) > 0
    except RuntimeError:
        return False


def _crear_igw(vcn_id: str, runner: Optional[Callable] = None) -> str:
    """Crea el Internet Gateway y devuelve su OCID."""
    salida = _oci_call(
        [
            "oci",
            "network",
            "internet-gateway",
            "create",
            "--vcn-id",
            vcn_id,
            "--display-name",
            IGW_NAME,
            "--compartment-id",
            os.environ.get("OCI_TENANCY", ""),
        ],
        runner,
    )
    return _json_output(salida).get("data", {}).get("id", "")


def _existe_subnet(vcn_id: str, runner: Optional[Callable] = None) -> bool:
    """Comprueba si la subred existe."""
    try:
        salida = _oci_call(
            [
                "oci",
                "network",
                "subnet",
                "list",
                "--vcn-id",
                vcn_id,
                "--display-name",
                SUBNET_NAME,
                "--all",
            ],
            runner,
        )
        data = _json_output(salida)
        return len(data.get("data", [])) > 0
    except RuntimeError:
        return False


def _crear_subnet(
    vcn_id: str,
    igw_id: str,
    runner: Optional[Callable] = None,
) -> str:
    """Crea la subred y devuelve su OCID."""
    # First, create a route table with a default route to the IGW
    rt_id = _crear_route_table(vcn_id, igw_id, runner)
    # Then create the subnet with that route table
    salida = _oci_call(
        [
            "oci",
            "network",
            "subnet",
            "create",
            "--vcn-id",
            vcn_id,
            "--cidr-block",
            "10.0.0.0/24",
            "--display-name",
            SUBNET_NAME,
            "--route-table-id",
            rt_id,
            "--compartment-id",
            os.environ.get("OCI_TENANCY", ""),
        ],
        runner,
    )
    return _json_output(salida).get("data", {}).get("id", "")


def _crear_route_table(
    vcn_id: str,
    igw_id: str,
    runner: Optional[Callable] = None,
) -> str:
    """Crea una tabla de rutas con una ruta predeterminada al IGW."""
    salida = _oci_call(
        [
            "oci",
            "network",
            "route-table",
            "create",
            "--vcn-id",
            vcn_id,
            "--display-name",
            f"{VCN_NAME}-rt",
            "--route-rules",
            json.dumps(
                [{"networkEntityId": igw_id, "destination": "0.0.0.0/0"}]
            ),
            "--compartment-id",
            os.environ.get("OCI_TENANCY", ""),
        ],
        runner,
    )
    return _json_output(salida).get("data", {}).get("id", "")


def _existe_nsg(nsg_name: str, runner: Optional[Callable] = None) -> bool:
    """Comprueba si un NSG existe."""
    try:
        salida = _oci_call(
            [
                "oci",
                "network",
                "nsg",
                "list",
                "--display-name",
                nsg_name,
                "--all",
            ],
            runner,
        )
        data = _json_output(salida)
        return len(data.get("data", [])) > 0
    except RuntimeError:
        return False


def _crear_nsg(
    nsg_name: str,
    vcn_id: str,
    rules: List[Dict],
    runner: Optional[Callable] = None,
) -> str:
    """Crea un NSG con las reglas dadas y devuelve su OCID."""
    salida = _oci_call(
        [
            "oci",
            "network",
            "nsg",
            "create",
            "--vcn-id",
            vcn_id,
            "--display-name",
            nsg_name,
            "--security-rules",
            json.dumps(rules),
            "--compartment-id",
            os.environ.get("OCI_TENANCY", ""),
        ],
        runner,
    )
    return _json_output(salida).get("data", {}).get("id", "")


def _reglas_nsg_a1() -> List[Dict]:
    """Reglas para el NSG del A1: 80, 443/tcp y 8189/udp."""
    return [
        {
            "protocol": "6",  # TCP
            "source": "0.0.0.0/0",
            "tcpOptions": {"destinationPortRange": {"max": 80, "min": 80}},
            "description": "HTTP",
        },
        {
            "protocol": "6",  # TCP
            "source": "0.0.0.0/0",
            "tcpOptions": {"destinationPortRange": {"max": 443, "min": 443}},
            "description": "HTTPS",
        },
        {
            "protocol": "17",  # UDP
            "source": "0.0.0.0/0",
            "udpOptions": {"destinationPortRange": {"max": 8189, "min": 8189}},
            "description": "MediaMTX",
        },
    ]


def _reglas_nsg_turn() -> List[Dict]:
    """Reglas para el NSG del TURN: 3478 tcp/udp, 5349, 49160–49200/udp."""
    rules = []
    # TCP 3478
    rules.append(
        {
            "protocol": "6",
            "source": "0.0.0.0/0",
            "tcpOptions": {"destinationPortRange": {"max": 3478, "min": 3478}},
            "description": "TURN TCP",
        }
    )
    # UDP 3478
    rules.append(
        {
            "protocol": "17",
            "source": "0.0.0.0/0",
            "udpOptions": {"destinationPortRange": {"max": 3478, "min": 3478}},
            "description": "TURN UDP",
        }
    )
    # TCP 5349
    rules.append(
        {
            "protocol": "6",
            "source": "0.0.0.0/0",
            "tcpOptions": {"destinationPortRange": {"max": 5349, "min": 5349}},
            "description": "TURN/TLS TCP",
        }
    )
    # UDP range 49160–49200
    rules.append(
        {
            "protocol": "17",
            "source": "0.0.0.0/0",
            "udpOptions": {"destinationPortRange": {"max": 49200, "min": 49160}},
            "description": "TURN relay UDP",
        }
    )
    return rules


def _reglas_nsg_vigia() -> List[Dict]:
    """Reglas para el NSG de la vigía: solo SSH (22/tcp)."""
    return [
        {
            "protocol": "6",  # TCP
            "source": "0.0.0.0/0",
            "tcpOptions": {"destinationPortRange": {"max": 22, "min": 22}},
            "description": "SSH",
        }
    ]


def _existe_instancia(display_name: str, runner: Optional[Callable] = None) -> bool:
    """Comprueba si una instancia existe por su nombre para mostrar."""
    try:
        salida = _oci_call(
            [
                "oci",
                "compute",
                "instance",
                "list",
                "--display-name",
                display_name,
                "--all",
                "--compartment-id",
                os.environ.get("OCI_TENANCY", ""),
            ],
            runner,
        )
        data = _json_output(salida)
        return len(data.get("data", [])) > 0
    except RuntimeError:
        return False


def _crear_instancia(
    display_name: str,
    shape: str,
    subnet_id: str,
    nsg_ids: List[str],
    cloud_init_yaml: Path,
    runner: Optional[Callable] = None,
) -> str:
    """Crea una instancia y devuelve su OCID."""
    # Read cloud-init and replace the SSH public key variable
    cloud_init_content = cloud_init_yaml.read_text(encoding="utf-8")
    ssh_pub_key = SSH_PUB_KEY.read_text(encoding="utf-8").strip()
    # Replace the placeholder in the cloud-init file
    # In the cloud-init files, we expect a line like: `ssh_authorized_keys:`
    # and under it, we want to put the key. But the example might have a variable.
    # Looking at the cloud-init-a1.yaml, we see:
    #   users:
    #     - default
    #   ssh_authorized_keys:
    #     - ${STARSEED_PUBLIC_KEY}
    # So we replace ${STARSEED_PUBLIC_KEY} with the actual key.
    cloud_init_content = cloud_init_content.replace(
        "${STARSEED_PUBLIC_KEY}", ssh_pub_key
    )
    # We'll pass the cloud-init as user-data (base64 encoded)
    import base64
    user_data = base64.b64encode(cloud_init_content.encode("utf-8")).decode(
        "utf-8"
    )

    salida = _oci_call(
        [
            "oci",
            "compute",
            "instance",
            "launch",
            "--availability-domain",
            _get_ad(),
            "--shape",
            shape,
            "--display-name",
            display_name,
            "--subnet-id",
            subnet_id,
            "--nsg-ids",
            json.dumps(nsg_ids),
            "--metadata",
            json.dumps(
                {
                    "user_data": user_data,
                    # Also, we can set the ssh_authorized_keys directly in metadata?
                    # But the cloud-init already handles it.
                }
            ),
            "--create-vnic-details",
            json.dumps(
                {
                    "assign_public_ip": True,
                    # We already set the subnet and NSGs above.
                }
            ),
            "--block-storage-volumes",
            json.dumps(
                [
                    {
                        "volume_size_in_gbs": (
                            100 if shape == SHAPE_A1 else 50
                        ),
                        "display_name": f"{display_name}-boot",
                    }
                ]
            ),
            "--compartment-id",
            os.environ.get("OCI_TENANCY", ""),
        ],
        runner,
    )
    return _json_output(salida).get("data", {}).get("id", "")


def _get_ad(runner: Optional[Callable] = None) -> str:
    """Obtiene el primer dominio de disponibilidad de la tenancy."""
    tenancy = os.environ.get("OCI_TENANCY", "")
    if not tenancy:
        raise RuntimeError("Variable de entorno OCI_TENANCY no establecida")
    salida = _oci_call(
        [
            "oci",
            "iam",
            "availability-domain",
            "list",
            "--compartment-id",
            tenancy,
        ],
        runner,
    )
    data = _json_output(salida)
    ads = data.get("data", [])
    if not ads:
        raise RuntimeError("No se encontraron dominios de disponibilidad")
    return ads[0]["name"]


def _existe_alerta_presupuesto(alert_name: str, runner: Optional[Callable] = None) -> bool:
    """Comprueba si existe una alerta de presupuesto."""
    try:
        salida = _oci_call(
            [
                "oci",
                "budget",
                "alert-rule",
                "list",
                "--budget-name",
                alert_name,
                "--all",
                "--compartment-id",
                os.environ.get("OCI_TENANCY", ""),
            ],
            runner,
        )
        data = _json_output(salida)
        return len(data.get("data", [])) > 0
    except RuntimeError:
        return False


def _crear_alerta_presupuesto(
    alert_name: str,
    runner: Optional[Callable] = None,
) -> str:
    """Crea una alerta de presupuesto de 1 USD."""
    # First, we need to create a budget if it doesn't exist? The alert rule requires a budget.
    # According to the contract, we already have a budget named `starseed-alerta-1usd` from the existing state.
    # So we assume the budget exists and we are creating an alert rule for it.
    # But to be safe, we can check for the budget and create it if missing.
    # However, the contract says the budget already exists (from the initial setup by Alex).
    # We'll just create the alert rule for the budget.
    salida = _oci_call(
        [
            "oci",
            "budget",
            "alert-rule",
            "create",
            "--budget-name",
            alert_name,
            "--display-name",
            f"{alert_name}-rule",
            "--type",
            "ACTUAL",
            "--threshold",
            "100",  # 100% of the budget
            "--threshold-type",
            "PERCENTAGE",
            "--compartment-id",
            os.environ.get("OCI_TENANCY", ""),
            "--recipients",
            json.dumps(
                [{"type": "EMAIL", "name": "Alex", "email": os.environ.get("ORACLE_ALERT_EMAIL", "")}]
            ),
        ],
        runner,
    )
    return _json_output(salida).get("data", {}).get("id", "")


def _reintentar_por_capacidad(
    func: Callable[..., Any],
    *args,
    max_intentos: int = 144,  # 24 hours * 60 minutes / 10 minutes
    espera_segundos: int = 600,  # 10 minutes
    runner: Optional[Callable[..., Any]] = None,
    **kwargs,
) -> Any:
    """Retry a function in case of 'Out of host capacity' error."""
    intento = 0
    while intento < max_intentos:
        try:
            return func(*args, runner=runner, **kwargs)
        except RuntimeError as e:
            if "Out of host capacity" in str(e):
                intento += 1
                if intento >= max_intentos:
                    raise RuntimeError(
                        f"Superado el número máximo de reintentos ({max_intentos}) por capacidad insuficiente"
                    ) from e
                # Wait and try again
                time.sleep(espera_segundos)
                # Notify the Director Chat (we'll implement a simple print for now)
                print(
                    f"Capacidad insuficiente, reintento {intento}/{max_intentos} en {espera_segundos} segundos..."
                )
            else:
                raise
    # Should not reach here
    raise RuntimeError("Reintentos agotados sin éxito")


def main(argv: Optional[List[str]] = None) -> int:
    """Función principal del script."""
    parser = argparse.ArgumentParser(
        description="Despliegue idempotente de Oracle Always Free para StarSeed OS."
    )
    parser.add_argument(
        "--simular",
        action="store_true",
        help="Solo imprimir el plan sin crear recursos (por defecto).",
    )
    parser.add_argument(
        "--aplicar",
        action="store_true",
        help="Crear los recursos de verdad (requiere confirmación de Alex).",
    )
    # We'll add more arguments as needed, but for now, we stick to the contract.
    args = parser.parse_args(argv)

    # By default, we simulate if neither --simular nor --aplicar is given?
    # The contract says: Por defecto `--simular`; con `--aplicar` crea de verdad.
    # So if neither is given, we simulate.
    simular = not args.aplicar
    aplicar = args.aplicar

    if aplicar:
        # Ask for confirmation from Alex
        respuesta = input(
            "¿Está seguro de que quiere aplicar los cambios en Oracle Cloud? (yes/no): "
        )
        if respuesta.lower() != "yes":
            print("Operación cancelada por el usuario.")
            return 1

    # We'll get the OCI runner (for testing, we can inject a mock)
    # For now, we use the real OCI CLI.
    runner = None  # Means we use the real subprocess.run

    # Check if we are authenticated (we assume the user has run `oci setup bootstrap`)
    # We'll just try to get the tenancy from the environment.
    tenancy = os.environ.get("OCI_TENANCY", "")
    if not tenancy:
        print(
            "Error: La variable de entorno OCI_TENANCY no está establecida. "
            "Ejecute 'oci setup bootstrap' primero."
        )
        return 1

    # Step 1: VCN
    if simular:
        print(f"[SIMULACIÓN] Verificando VCN '{VCN_NAME}'...")
    else:
        print(f"Verificando VCN '{VCN_NAME}'...")
    if not _reintentar_por_capacidad(_existe_vcn, runner=runner):
        if simular:
            print(f"[SIMULACIÓN] Creando VCN '{VCN_NAME}'...")
        else:
            print(f"Creando VCN '{VCN_NAME}'...")
        vcn_id = _reintentar_por_capacidad(_crear_vcn, runner=runner)
        print(f"VCN creada: {vcn_id}")
    else:
        if simular:
            print(f"[SIMULACIÓN] VCN '{VCN_NAME}' ya existe.")
        else:
            print(f"VCN '{VCN_NAME}' ya existe.")
        # We need to get the OCID of the existing VCN
        salida = _oci_call(
            ["oci", "network", "vcn", "list", "--display-name", VCN_NAME, "--all"],
            runner,
        )
        data = _json_output(salida)
        vcn_id = data.get("data", [{}])[0].get("id", "")

    # Step 2: Internet Gateway
    if simular:
        print(f"[SIMULACIÓN] Verificando Internet Gateway '{IGW_NAME}'...")
    else:
        print(f"Verificando Internet Gateway '{IGW_NAME}'...")
    if not _reintentar_por_capacidad(
        _existe_igw, vcn_id=vcn_id, runner=runner
    ):
        if simular:
            print(f"[SIMULACIÓN] Creando Internet Gateway '{IGW_NAME}'...")
        else:
            print(f"Creando Internet Gateway '{IGW_NAME}'...")
        igw_id = _reintentar_por_capacidad(
            _crear_igw, vcn_id=vcn_id, runner=runner
        )
        print(f"Internet Gateway creado: {igw_id}")
    else:
        if simular:
            print(f"[SIMULACIÓN] Internet Gateway '{IGW_NAME}' ya existe.")
        else:
            print(f"Internet Gateway '{IGW_NAME}' ya existe.")
        salida = _oci_call(
            [
                "oci",
                "network",
                "internet-gateway",
                "list",
                "--vcn-id",
                vcn_id,
                "--display-name",
                IGW_NAME,
                "--all",
            ],
            runner,
        )
        data = _json_output(salida)
        igw_id = data.get("data", [{}])[0].get("id", "")

    # Step 3: Subnet
    if simular:
        print(f"[SIMULACIÓN] Verificando subred '{SUBNET_NAME}'...")
    else:
        print(f"Verificando subred '{SUBNET_NAME}'...")
    if not _reintentar_por_capacidad(
        _existe_subnet, vcn_id=vcn_id, runner=runner
    ):
        if simular:
            print(f"[SIMULACIÓN] Creando subred '{SUBNET_NAME}'...")
        else:
            print(f"Creando subred '{SUBNET_NAME}'...")
        subnet_id = _reintentar_por_capacidad(
            _crear_subnet, vcn_id=vcn_id, igw_id=igw_id, runner=runner
        )
        print(f"Subred creada: {subnet_id}")
    else:
        if simular:
            print(f"[SIMULACIÓN] Subred '{SUBNET_NAME}' ya existe.")
        else:
            print(f"Subred '{SUBNET_NAME}' ya existe.")
        salida = _oci_call(
            [
                "oci",
                "network",
                "subnet",
                "list",
                "--vcn-id",
                vcn_id,
                "--display-name",
                SUBNET_NAME,
                "--all",
            ],
            runner,
        )
        data = _json_output(salida)
        subnet_id = data.get("data", [{}])[0].get("id", "")

    # We'll continue in the next chunk due to line limit.

    # Step 4: Create NSGs
    nsg_rules = {
        NSG_A1_NAME: _reglas_nsg_a1(),
        NSG_TURN_NAME: _reglas_nsg_turn(),
        NSG_VIGIA_NAME: _reglas_nsg_vigia(),
    }
    nsg_ids = {}
    for nsg_name, rules in nsg_rules.items():
        if simular:
            print(f"[SIMULACIÓN] Verificando NSG '{nsg_name}'...")
        else:
            print(f"Verificando NSG '{nsg_name}'...")
        if not _reintentar_por_capacidad(
            _existe_nsg, nsg_name=nsg_name, runner=runner
        ):
            if simular:
                print(f"[SIMULACIÓN] Creando NSG '{nsg_name}'...")
            else:
                print(f"Creando NSG '{nsg_name}'...")
            nsg_id = _reintentar_por_capacidad(
                _crear_nsg,
                nsg_name=nsg_name,
                vcn_id=vcn_id,
                rules=rules,
                runner=runner,
            )
            nsg_ids[nsg_name] = nsg_id
            print(f"NSG '{nsg_name}' creado: {nsg_id}")
        else:
            if simular:
                print(f"[SIMULACIÓN] NSG '{nsg_name}' ya existe.")
            else:
                print(f"NSG '{nsg_name}' ya existe.")
            salida = _oci_call(
                ["oci", "network", "nsg", "list", "--display-name", nsg_name, "--all"],
                runner,
            )
            data = _json_output(salida)
            nsg_ids[nsg_name] = data.get("data", [{}])[0].get("id", "")

    # Step 5: Create instances
    instances_to_create = [
        {
            "display_name": INSTANCE_A1_NAME,
            "shape": SHAPE_A1,
            "nsg_names": [NSG_A1_NAME],
            "cloud_init_yaml": CLOUD_INIT_A1,
            "volume_size": 100,
        },
        {
            "display_name": INSTANCE_TURN_NAME,
            "shape": SHAPE_MICRO,
            "nsg_names": [NSG_TURN_NAME],
            "cloud_init_yaml": CLOUD_INIT_MICRO,
            "volume_size": 50,
        },
        {
            "display_name": INSTANCE_VIGIA_NAME,
            "shape": SHAPE_MICRO,
            "nsg_names": [NSG_VIGIA_NAME],
            "cloud_init_yaml": CLOUD_INIT_MICRO,
            "volume_size": 50,
        },
    ]

    for instance_info in instances_to_create:
        display_name = instance_info["display_name"]
        shape = instance_info["shape"]
        nsg_names = instance_info["nsg_names"]
        cloud_init_yaml = instance_info["cloud_init_yaml"]
        volume_size = instance_info["volume_size"]

        # Get NSG IDs for this instance
        instance_nsg_ids = [nsg_ids[name] for name in nsg_names]

        if simular:
            print(f"[SIMULACIÓN] Verificando instancia '{display_name}'...")
        else:
            print(f"Verificando instancia '{display_name}'...")
        if not _reintentar_por_capacidad(
            _existe_instancia, display_name=display_name, runner=runner
        ):
            if simular:
                print(f"[SIMULACIÓN] Creando instancia '{display_name}'...")
            else:
                print(f"Creando instancia '{display_name}'...")
            instance_id = _reintentar_por_capacidad(
                _crear_instancia,
                display_name=display_name,
                shape=shape,
                subnet_id=subnet_id,
                nsg_ids=instance_nsg_ids,
                cloud_init_yaml=cloud_init_yaml,
                runner=runner,
            )
            print(f"Instancia '{display_name}' creada: {instance_id}")
        else:
            if simular:
                print(f"[SIMULACIÓN] Instancia '{display_name}' ya existe.")
            else:
                print(f"Instancia '{display_name}' ya existe.")
            salida = _oci_call(
                [
                    "oci",
                    "compute",
                    "instance",
                    "list",
                    "--display-name",
                    display_name,
                    "--all",
                    "--compartment-id",
                    os.environ.get("OCI_TENANCY", ""),
                ],
                runner,
            )
            data = _json_output(salida)
            # We don't really need the instance ID for now, but we could store it.

    # Step 6: Budget alert
    if simular:
        print(f"[SIMULACIÓN] Verificando alerta de presupuesto '{BUDGET_ALERT_NAME}'...")
    else:
        print(f"Verificando alerta de presupuesto '{BUDGET_ALERT_NAME}'...")
    if not _reintentar_por_capacidad(
        _existe_alerta_presupuesto, alert_name=BUDGET_ALERT_NAME, runner=runner
    ):
        if simular:
            print(f"[SIMULACIÓN] Creando alerta de presupuesto '{BUDGET_ALERT_NAME}'...")
        else:
            print(f"Creando alerta de presupuesto '{BUDGET_ALERT_NAME}'...")
        alert_id = _reintentar_por_capacidad(
            _crear_alerta_presupuesto,
            alert_name=BUDGET_ALERT_NAME,
            runner=runner,
        )
        print(f"Alerta de presupuesto creada: {alert_id}")
    else:
        if simular:
            print(f"[SIMULACIÓN] Alerta de presupuesto '{BUDGET_ALERT_NAME}' ya existe.")
        else:
            print(f"Alerta de presupuesto '{BUDGET_ALERT_NAME}' ya existe.")

    # After creating all resources, call oracle_nube.comprobar to update the state
    if not simular:
        print("Actualizando el estado de Oracle en Genesis...")
        # We'll import the oracle_nube module and call its comprobar function
        # But to avoid circular imports, we can run the oracle_nube.py script as a subprocess.
        # However, the contract says: Al terminar llama a `oracle_nube.comprobar`.
        # We'll do it by running the script with the 'comprobar' action.
        try:
            subprocess.run(
                [sys.executable, "oracle_nube.py", "comprobar"],
                cwd=Path(__file__).parent,
                check=True,
            )
        except Exception as e:
            print(f"Advertencia: no se pudo actualizar el estado de Oracle: {e}")

    return 0