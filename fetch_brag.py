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

def fetch_binary(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'StarSeed-OS'})
    with urllib.request.urlopen(req) as resp:
        return resp.read()

def is_binary_file(filename):
    binary_extensions = {'.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg', '.ttf', '.woff', '.woff2', '.eot', '.otf'}
    return any(filename.lower().endswith(ext) for ext in binary_extensions)

def copy_dir_contents(repo, source_path, dest_bases, base_path):
    """Recursively copy directory contents from GitHub repo"""
    items = fetch_json(f'https://api.github.com/repos/{repo}/contents/{source_path}')
    for item in items:
        if item['type'] == 'file' and item.get('download_url'):
            rel_path = item['path'].replace(source_path, '').lstrip('/')
            print(f"  File: {item['name']}")
            if is_binary_file(item['name']):
                content = fetch_binary(item['download_url'])
                mode = 'wb'
            else:
                content = fetch_text(item['download_url'])
                mode = 'w'
            for dest_base in dest_bases:
                dest_path = os.path.join(base, dest_base, rel_path)
                os.makedirs(os.path.dirname(dest_path), exist_ok=True)
                with open(dest_path, mode) as f:
                    f.write(content)
        elif item['type'] == 'dir':
            print(f"  Dir: {item['name']}")
            copy_dir_contents(repo, item['path'], dest_bases, base_path)

print("=== Fetching commit hashes ===")
beautify_commits = fetch_json('https://api.github.com/repos/oil-oil/beautify-github-readme/commits')
beautify_sha = beautify_commits[0]['sha']
print("beautify commit: " + beautify_sha)

brag_commits = fetch_json('https://api.github.com/repos/latent-spaces/brag/commits')
brag_sha = brag_commits[0]['sha']
print("brag commit: " + brag_sha)

print("\n=== Copying beautify-github-readme ===")
copy_dir_contents('oil-oil/beautify-github-readme', 'skills/beautify-github-readme', 
                  ['vendor/habilidades/beautify-github-readme', '.agent/skills/beautify-github-readme'], base)
print("done beautify")

print("\n=== Copying brag ===")
copy_dir_contents('latent-spaces/brag', 'skills/brag', 
                  ['vendor/habilidades/brag', '.agent/skills/brag'], base)
print("done brag references")

print("\n=== Copying brag-slim ===")
items = fetch_json('https://api.github.com/repos/latent-spaces/brag/contents/skills/brag-slim')
for item in items:
    if item['type'] == 'file' and item.get('download_url'):
        rel_path = item['path'].replace('skills/brag-slim/', '')
        print(f"  File: {item['name']}")
        if is_binary_file(item['name']):
            content = fetch_binary(item['download_url'])
            mode = 'wb'
        else:
            content = fetch_text(item['download_url'])
            mode = 'w'
        for dest_base in ['vendor/habilidades/brag-slim', '.agent/skills/brag-slim']:
            dest_path = os.path.join(base, dest_base, rel_path)
            os.makedirs(os.path.dirname(dest_path), exist_ok=True)
            with open(dest_path, mode) as f:
                f.write(content)
print("done brag-slim")

print("\n=== Copying LICENSE files ===")
for repo, dest in [('oil-oil/beautify-github-readme', 'vendor/habilidades/beautify-github-readme/LICENSE'),
                   ('latent-spaces/brag', 'vendor/habilidades/brag/LICENSE')]:
    lic = fetch_json(f'https://api.github.com/repos/{repo}/contents/LICENSE')
    if lic.get('download_url'):
        content = fetch_text(lic['download_url'])
        with open(os.path.join(base, dest), 'w') as f:
            f.write(content)
        print(f"Copied {repo} LICENSE")

print("\n=== ALL DONE ===")
print("beautify commit: " + beautify_sha)
print("brag commit: " + brag_sha)
print("beautify commit date: " + beautify_commits[0]['commit']['committer']['date'])
print("brag commit date: " + brag_commits[0]['commit']['committer']['date'])