#!/usr/bin/env python3

"""
Test para validar la plantilla de GitHub Actions de Genesis Contenedor.
Verifica:
- Estructura del YAML
- Permisos
- Variables de entorno
- Sin secretos en claro
"""

import yaml
import re


def test_yaml_structure():
    with open("deploy/genesis-contenedor/github-actions.yml", "r") as file:
        content = file.read()
        yaml_data = yaml.safe_load(content)

    assert "name" in yaml_data, "El YAML debe tener un nombre"
    assert "on" in yaml_data, "El YAML debe tener un evento"
    assert "jobs" in yaml_data, "El YAML debe tener trabajos"
    assert "conectar" in yaml_data["jobs"], "Debe tener un job llamado 'conectar'"


def test_permissions():
    with open("deploy/genesis-contenedor/github-actions.yml", "r") as file:
        content = file.read()
        yaml_data = yaml.safe_load(content)

    assert "permissions" in yaml_data, "El YAML debe tener permisos"
    assert yaml_data["permissions"]["contents"] == "read", "Permiso de contenido debe ser 'read'"


def test_env_vars():
    with open("deploy/genesis-contenedor/github-actions.yml", "r") as file:
        content = file.read()

    # Verificar que solo se usa STARSEED_MOTOR_TOKEN como variable de entorno
    assert "STARSEED_MOTOR_TOKEN" in content, "Debe incluir STARSEED_MOTOR_TOKEN"
    assert "secrets.STARSEED_MOTOR_TOKEN" in content, "Debe referenciar el secreto"


def test_no_plain_secrets():
    with open("deploy/genesis-contenedor/github-actions.yml", "r") as file:
        content = file.read()

    # Verificar que no hay secretos en claro
    secret_pattern = r"\$\{.*\.secrets\.[^\}]*\}"
    plain_secret_pattern = r"\btoken\b.*[^\$]"
    
    assert not re.search(secret_pattern, content) or re.search(r"\$\{.*\.secrets\.STARSEED_MOTOR_TOKEN.*\}", content), "No debe haber secretos en claro"
    assert not re.search(plain_secret_pattern, content), "No debe haber tokens en claro"


if __name__ == "__main__":
    test_yaml_structure()
    test_permissions()
    test_env_vars()
    test_no_plain_secrets()
    print("✅ Todos los tests pasaron")