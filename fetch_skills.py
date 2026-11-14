import urllib.request
import json
import os

base = '/Users/alex/Documents/starseed-wt/RDM1113A'

def fetch_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'StarSeed-OS'})
    with urllib.request.urlopen(req) as resp:
        return json.load(resp)

def fetch_text(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'StarSeed-OS'})
    with urllib.request.urlopen(req) as resp:
        return resp.read().decode('utf-8')

print("=== Creating directories ===")
dirs = [
    'vendor/habilidades/beautify-github-readme',
    'vendor/habilidades/brag',
    'vendor/habilidades/brag-slim',
    '.agent/skills/beautify-github-readme',
    '.agent/skills/beautify-github-readme/references',
    '.agent/skills/brag',
    '.agent/skills/brag/references',
    '.agent/skills/brag-slim',
]
for d in dirs:
    os.makedirs(os.path.join(base, d), exist_ok=True)
print("Created directories")

print("\n=== Fetching commit hashes ===")
beautify_commits = fetch_json('https://api.github.com/repos/oil-oil/beautify-github-readme/commits')
beautify_sha = beautify_commits[0]['sha']
print("beautify commit: " + beautify_sha)

brag_commits = fetch_json('https://api.github.com/repos/latent-spaces/brag/commits')
brag_sha = brag_commits[0]['sha']
print("brag commit: " + brag_sha)

print("\n=== Copying beautify-github-readme ===")
source_base = 'skills/beautify-github-readme/'
items = fetch_json('https://api.github.com/repos/oil-oil/beautify-github-readme/contents/skills/beautify-github-readme')
for item in items:
    if item['type'] == 'file':
        content = fetch_text(item['download_url'])
        rel_path = item['path'].replace(source_base, '')
        print("  File: " + item['name'])
        for dest_base in ['vendor/habilidades/beautify-github-readme', '.agent/skills/beautify-github-readme']:
            dest_path = os.path.join(base, dest_base, rel_path)
            os.makedirs(os.path.dirname(dest_path), exist_ok=True)
            with open(dest_path, 'w') as f:
                f.write(content)
print("done beautify")

print("\n=== Copying brag-slim ===")
source_base = 'skills/brag-slim/'
items = fetch_json('https://api.github.com/repos/latent-spaces/brag/contents/skills/brag-slim')
for item in items:
    content = fetch_text(item['download_url'])
    print("  File: " + item['name'])
    for dest_base in ['vendor/habilidades/brag-slim', '.agent/skills/brag-slim']:
        dest_path = os.path.join(base, dest_base, item['name'])
            os.makedirs(os.path.dirname(dest_path), exist_ok=True)
            with open(dest_path, 'w') as f:
                f.write(content)

print("\n=== DONE ===")
print("beautify commit: " + beautify_sha)
print("brag commit: " + brag_sha)
print("beautify commit date: " + beautify_commits[0]['commit']['committer']['date'])
print("brag commit date: " + brag_commits[0]['commit']['committer']['date'])
print("Now create config/repos-libreria-1113.json and references/brag.md")
