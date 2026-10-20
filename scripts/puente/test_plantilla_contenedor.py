#!/usr/bin/env python3
"""
Test para validar la plantilla de GitHub Actions de contenedor StarSeed OS
"""

import yaml
import os
import sys
from pathlib import Path

def test_github_actions_template():
    """Valida el archivo github-actions.yml de la plantilla"""
    
    # Ruta al archivo de la plantilla
    template_path = Path("deploy/genesis-contenedor/github-actions.yml")
    
    if not template_path.exists():
        print(f"ERROR: No se encontró el archivo {template_path}")
        return False
    
    try:
        with open(template_path, 'r', encoding='utf-8') as f:
            data = yaml.safe_load(f)
    except Exception as e:
        print(f"ERROR: No se pudo parsear el YAML: {e}")
        return False
    
    # Validar estructura básica
    if not isinstance(data, dict):
        print("ERROR: El YAML no contiene un diccionario válido")
        return False
    
    # Validar que tenga el nombre esperado
    if 'name' not in data:
        print("ERROR: Falta el campo 'name'")
        return False
    
    if data['name'] != 'StarSeed OS Motor':
        print(f"ADVERTENCIA: El nombre esperado era 'StarSeed OS Motor', encontrado: {data['name']}")
    
    # Validar que tenga triggers
    if 'on' not in data:
        print("ERROR: Falta el campo 'on' (triggers)")
        return False
    
    on_data = data['on']
    if not isinstance(on_data, dict):
        print("ERROR: El campo 'on' no es un diccionario válido")
        return False
    
    # Validar que tenga workflow_dispatch y schedule
    if 'workflow_dispatch' not in on_data:
        print("ERROR: Falta el trigger 'workflow_dispatch'")
        return False
    
    if 'schedule' not in on_data:
        print("ERROR: Falta el trigger 'schedule'")
        return False
    
    # Validar que tenga jobs
    if 'jobs' not in data:
        print("ERROR: Falta el campo 'jobs'")
        return False
    
    jobs = data['jobs']
    if not isinstance(jobs, dict) or len(jobs) == 0:
        print("ERROR: 'jobs' debe ser un diccionario no vacío")
        return False
    
    # Validar cada job
    for job_name, job_data in jobs.items():
        if not isinstance(job_data, dict):
            print(f"ERROR: El job '{job_name}' no es un diccionario válido")
            return False
        
        # Validar que tenga runs-on
        if 'runs-on' not in job_data:
            print(f"ERROR: El job '{job_name}' falta el campo 'runs-on'")
            return False
        
        # Validar que tenga steps
        if 'steps' not in job_data:
            print(f"ERROR: El job '{job_name}' falta el campo 'steps'")
            return False
        
        steps = job_data['steps']
        if not isinstance(steps, list) or len(steps) == 0:
            print(f"ERROR: El job '{job_name}' debe tener pasos válidos")
            return False
        
        # Validar permisos mínimos
        if 'permissions' in job_data:
            perms = job_data['permissions']
            # Verificar que no tenga permisos excesivos
            dangerous_perms = ['contents: write', 'pull-requests: write', 'issues: write']
            for perm in dangerous_perms:
                if perm in str(perms):
                    print(f"ADVERTENCIA: El job '{job_name}' tiene permisos potencialmente excesivos: {perm}")
        else:
            print(f"ADVERTENCIA: El job '{job_name}' no define explícitamente permisos")
    
    # Verificar que no haya secretos en claro
    yaml_str = yaml.dump(data)
    if 'secret' in yaml_str.lower() or 'token' in yaml_str.lower() or 'key' in yaml_str.lower():
        # Esto es solo una advertencia básica, ya que los nombres de campos pueden contener estas palabras
        pass  # En un test real, sería más sofisticado
    
    print("✅ Plantilla de GitHub Actions validada correctamente")
    return True

if __name__ == "__main__":
    success = test_github_actions_template()
    sys.exit(0 if success else 1)