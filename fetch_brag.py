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

print("=== Fetching commit hashes ===")
beautify_commits = fetch_json('https://api.github.com/repos/oil-oil/beautify-github_readme/commits')
beautify_sha = beautify_commits[0]['sha']
print("beautify commit: " + beautify_sha)

brag_commits = fetch_json('https://api.github.com/repos/latent-spaces/brag/commits')
brag_sha = brag_commits[0]['sha']
print("brag commit: " + brag_sha)

print("\n=== Copying brag references ===")
source_base = 'skills/brag/'
items = fetch_json('https://api.github.com/repos/latent-spaces/brag/contents/skills/brag')
for item in items:
    print("  Checking: " + item['path'])
    if item['type'] == 'file':
        content = fetch_text(item['download_url'])
        rel_path = item['path'].replace(source_base, '')
        print("  File: " + item['name'])
        for dest_base in ['vendor/habilidades/brag', '.agent/skills/brag']:
            dest_path = os.path.join(base, dest_base, rel_path)
            os.makedirs(os.path.dirname(dest_path), exist_ok=True)
            with open(dest_path, 'w') as f:
                f.write(content)
    else:
        print("  Dir: " + item['name'])
        sub_items = fetch_json(item['url'])
        for si in sub_items:
            print("    Sub: " + si['name'])
            content = fetch_text(si['download_url'])
            rel_path = si['path'].replace(source_base, '')
            print("      File: " + si['name'])
            for dest_base in ['vendor/habilidades/brag', '.agent/skills/brag']:
                dest_path = os.path.join(base, dest_base, rel_path)
                os.makedirs(os.path.dirname(dest_path), exist_ok=True)
                with open(dest_path, 'w') as f:
                    f.write(content)
print("done brag references")

print("\n=== Copying brag-slim ===")
source_base = 'skills/brag-slim/'
items = fetch_json('https://api.github.com/repos/latent-spaces/brag/contents/skills/brag-slim')
for item in items:
    print("  Item: " + item['name'])
    content = fetch_text(item['download_url'])
    print("    File: " + item['name'])
    for dest_base in ['vendor/habilidades/brag-slim', '.agent/skills/brag-slim']:
        dest_path = os.path.join(base, dest_base, item['name'])
            os.makedirs(os.path.dirname(dest_path), exist_ok=True)
            with open(dest_path, 'w') as f:
                f.write(content)
print("done brag-slim")

print("\n=== Copying LICENSE files ===")
lic = fetch_json('https://api.github.com/repos/oil-oil/beautify-github_readme/contents/LICENSE')
if lic.get('download_url'):
    content = fetch_text(lic['download_url'])
    with open(os.path.join(base, 'vendor/habilidades/beautify-github_readme/LICENSE'), 'w') as f:
        f.write(content)
    print("Copied beautify LICENSE")

lic = fetch_json('https://api.github.com/repos/latent-spaces/brag/contents/LICENSE')
if lic.get('download_url'):
    content = fetch_text(lic['download_url'])
    with open(os.path.join(base, 'vendor/habilidades/brag/LICENSE'), 'w') as f:
        f.write(content)
    print("Copied brag LICENSE")

print("\n=== ALL DONE ===")
print("Now create config/repos_libreria_1113.json and references/brag.md")
print("beautify commit: " + beautify_sha)
print("brag commit: " + brag_sha)
print("beautify commit date: " + beautify_commits[0]['commit']['committer']['date'])
print("brag commit date: " + brag_commits[0]['commit']['committer']['date'])