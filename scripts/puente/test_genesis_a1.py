#!/usr/bin/env python3
"""
Test for Genesis A1 configuration.
Checks that:
1. STARSEED_LOCAL is not present in service or Caddyfile.
2. X-Real-IP header is present in Caddyfile for genesis block.
3. Service listens only on 127.0.0.1.
4. Caddyfile genesis block listens only on 127.0.0.1 (via reverse_proxy).
5. No real IPs or hosts (like 0.0.0.0, public IPs, or domain names) in the configs.
"""

import os
import re

def read_file(path):
    with open(path, 'r') as f:
        return f.read()

def test_no_starseed_local():
    service_content = read_file('deploy/oracle/nodo/systemd/starseed-genesis.service')
    caddy_content = read_file('deploy/oracle/nodo/Caddyfile.nodo')
    
    assert 'STARSEED_LOCAL' not in service_content, "STARSEED_LOCAL found in service file"
    assert 'STARSEED_LOCAL' not in caddy_content, "STARSEED_LOCAL found in Caddyfile"
    print("✓ No STARSEED_LOCAL in service or Caddyfile")

def test_x_real_ip_header():
    caddy_content = read_file('deploy/oracle/nodo/Caddyfile.nodo')
    # Find the start of the genesis block
    start_genesis = caddy_content.find('genesis.{$STARSEED_HOST} {')
    if start_genesis == -1:
        raise AssertionError("Genesis block start not found")
    
    # Find the header_up line
    start_header = caddy_content.find('header_up X-Real-IP')
    if start_header == -1:
        raise AssertionError("header_up X-Real-IP not found")
    
    # Check that start_header is after start_genesis
    if start_header < start_genesis:
        raise AssertionError("header_up X-Real-IP appears before genesis block start")
    
    # Check that between start_genesis and start_header, we haven't closed the genesis block prematurely
    brace_count = 0
    for ch in caddy_content[start_genesis:start_header]:
        if ch == '{':
            brace_count += 1
        elif ch == '}':
            brace_count -= 1
            if brace_count < 0:
                raise AssertionError("Closed too many braces before header_up, likely exited genesis block")
    # If we get here, the header_up is inside the genesis block (possibly in a nested block)
    print("✓ X-Real-IP header present in genesis block")

def test_listens_only_on_127_0_0_1():
    service_content = read_file('deploy/oracle/nodo/systemd/starseed-genesis.service')
    caddy_content = read_file('deploy/oracle/nodo/Caddyfile.nodo')
    
    # Check service: ExecStart should have -H 127.0.0.1
    assert '-H 127.0.0.1' in service_content, "Service does not listen on 127.0.0.1"
    # Ensure no other host like 0.0.0.0 or public IP
    # We'll check for patterns that indicate other hosts
    # This is a simple check; in reality we'd parse the ExecStart line
    if '0.0.0.0' in service_content:
        raise AssertionError("Service listens on 0.0.0.0")
    # Check for any IP address other than 127.0.0.1 in ExecStart line
    # We'll extract the ExecStart line and check for IPs
    exec_start_match = re.search(r'^ExecStart=.*', service_content, re.MULTILINE)
    if exec_start_match:
        exec_start = exec_start_match.group(0)
        # Find all IP addresses (simple pattern)
        ips = re.findall(r'\b(?:\d{1,3}\.){3}\d{1,3}\b', exec_start)
        for ip in ips:
            if ip != '127.0.0.1':
                raise AssertionError(f"Unexpected IP {ip} in ExecStart")
    
    # Check Caddyfile: genesis block reverse_proxy to 127.0.0.1:9002
    # Find the start of the genesis block
    start_genesis = caddy_content.find('genesis.{$STARSEED_HOST} {')
    if start_genesis == -1:
        raise AssertionError("Genesis block start not found")
    
    # Find the reverse_proxy line within the genesis block
    # We'll look for the line that contains "reverse_proxy 127.0.0.1:9002"
    # and ensure it's inside the genesis block by checking brace balance
    start_proxy = caddy_content.find('reverse_proxy 127.0.0.1:9002')
    if start_proxy == -1:
        raise AssertionError("Genesis block does not reverse_proxy to 127.0.0.1:9002")
    
    # Check that start_proxy is after start_genesis
    if start_proxy < start_genesis:
        raise AssertionError("reverse_proxy line appears before genesis block start")
    
    # Check that between start_genesis and start_proxy, we haven't closed the genesis block prematurely
    brace_count = 0
    for ch in caddy_content[start_genesis:start_proxy]:
        if ch == '{':
            brace_count += 1
        elif ch == '}':
            brace_count -= 1
            if brace_count < 0:
                raise AssertionError("Closed too many braces before reverse_proxy, likely exited genesis block")
    # If we get here, the reverse_proxy line is inside the genesis block (possibly in a nested block)
    
    # Additionally, we want to make sure that the reverse_proxy line is not inside a nested block that is not the intended one?
    # For simplicity, we'll also check that there is a 'header_up X-Real-IP' after this line but before closing the reverse_proxy block?
    # But the test only requires that it listens on 127.0.0.1:9002, which we have.
    
    print("✓ Service and Caddyfile listen only on 127.0.0.1")

def test_no_real_ips_or_hosts():
    service_content = read_file('deploy/oracle/nodo/systemd/starseed-genesis.service')
    caddy_content = read_file('deploy/oracle/nodo/Caddyfile.nodo')
    
    # List of patterns that indicate real IPs or hosts
    # We'll exclude 127.0.0.1 and localhost
    # This is a simplified check; we'll look for IPs not in {127.0.0.1, 0.0.0.0} but 0.0.0.0 is also not allowed
    # Actually, we don't want any real IPs (like public IPs) or domain names that are not variables.
    # Since we use {$STARSEED_HOST} which is a variable, we allow that.
    # We'll check for IP addresses and reject if they are not 127.0.0.1
    # Also check for domain-like patterns that are not variables.
    
    combined = service_content + '\n' + caddy_content
    
    # Find all IP addresses
    ips = re.findall(r'\b(?:\d{1,3}\.){3}\d{1,3}\b', combined)
    for ip in ips:
        if ip not in ['127.0.0.1', '0.0.0.0']:  # 0.0.0.0 is also not allowed as it's a wildcard
            raise AssertionError(f"Real IP address found: {ip}")
    
    # Check for 0.0.0.0 specifically
    if '0.0.0.0' in combined:
        raise AssertionError("Wildcard IP 0.0.0.0 found")
    
    # Check for domain names that are not variables (i.e., not {$...})
    # This is tricky; we'll look for patterns that look like domain names but are not inside {$...}
    # We'll do a simple check: look for sequences of alphanumeric and dots that are not inside curly braces with dollar sign
    # Since we know the file uses {$STARSEED_HOST}, we can check that any host-like string is either that variable or localhost
    # For simplicity, we'll just ensure there are no obvious domain names like example.com
    # Given the context, we assume the only host variable is {$STARSEED_HOST}
    # We'll replace the variable placeholder and then check for remaining dots that look like domains
    temp = re.sub(r'\{\$[^}]+\}', '', combined)  # Remove {$...} variables
    # Now look for patterns that look like domain names (containing dot and not at start/end of string)
    # This is a heuristic; we'll avoid false positives by requiring at least one dot and not being an IP
    domain_pattern = r'\b[a-zA-Z0-9]+([.-][a-zA-Z0-9]+)*\.[a-zA-Z]{2,}\b'
    potential_domains = re.findall(domain_pattern, temp)
    for domain in potential_domains:
        # Exclude common false positives like 'service' or 'unit' but they don't have dots
        # If it has a dot, it's likely a domain
        if '.' in domain:
            raise AssertionError(f"Real domain name found: {domain}")
    
    print("✓ No real IPs or hostnames found")

if __name__ == '__main__':
    test_no_starseed_local()
    test_x_real_ip_header()
    test_listens_only_on_127_0_0_1()
    test_no_real_ips_or_hosts()
    print("All tests passed.")