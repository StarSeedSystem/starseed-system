import urllib.request, json, os
base = '/Users/alex/Documents/starseed-wt/RDM1113A'
def FJ(url): return json.load(urllib.request.urlopen(urllib.request.Request(url, headers={'UA':'OS'})))
def FT(url): return urllib.request.urlopen(urllib.request.Request(url, headers={'UA':'OS'})).read().decode('utf-8')

print("brag references audio (recursive):")
items = FJ('https://api.github.com/repos/latent-spaces/brag/contents/skills/brag/assets/music')
print("music count:", len(items))
for si in items:
 print("  " + si['name'] + " type: " + si['type'])
 if si['type'] == 'file':
   content = FT(si['download_url'])
   rel = si['path'].replace('skills/brag/', '')
 print("    file: " + rel)
   for d in ['vendor/habilidades/brag', '.agent/skills/brag']:
     os.makedirs(base + '/' + d + '/' + os.path.dirname(rel), exist_ok=True)
     open(base + '/' + d + '/' + rel, 'w').write(content)

print("brag references audio cues:")
items = FJ('https://api.github.com/repos/latent-spaces/brag/contents/skills/brag/assets/music/cues')
print("cues count:", len(items))
for si in items:
 print("  " + si['name'] + " type: " + si['type'])
 if si['type'] == 'file':
   content = FT(si['download_url'])
   rel = si['path'].replace('skills/brag/', '')
 print("    file: " + rel)
   for d in ['vendor/habilidades/brag', '.agent/skills/brag']:
     os.makedirs(base + '/' + d + '/' + os.path.dirname(rel), exist_ok=True)
     open(base + '/' + d + '/' + rel, 'w').write(content)
print("references audio cues done")

print("brag references sfx:")
items = FJ('https://api.github.com/repos/latent-spaces/brag/contents/skills/brag/assets/sfx')
print("sfx count:", len(items))
for si in items:
 print("  " + si['name'] + " type: " + si['type'])
 if si['type'] == 'file':
   content = FT(si['download_url'])
   rel = si['path'].replace('skills/brag/', '')
 print("    file: " + rel)
   for d in ['vendor/habilidades/brag', '.agent/skills/brag']:
     os.makedirs(base + '/' + d + '/' + os.path.dirname(rel), exist_ok=True)
     open(base + '/' + d + '/' + rel, 'w').write(content)
print("references sfx done")

print("brag references scripts:")
items = FJ('https://api.github.com/repos/latent-spaces/brag/contents/skills/brag/scripts')
print("scripts count:", len(items))
for si in items:
 print("  " + si['name'] + " type: " + si['type'])
 if si['type'] == 'file':
   content = FT(si['download_url'])
   rel = si['path'].replace('skills/brag/', '')
 print("    file: " + rel)
   for d in ['vendor/habilidades/brag', '.agent/skills/brag']:
     os.makeders(base + '/' + d + '/' + os.path.dirname(rel), exist_ok=True)
     open(base + '/' + d + '/' + rel, 'w').write(content)
print("references scripts done")

print("LICENSES:")
lic = FJ('https://api.github.com/repos/latent-spaces/brag/contents/LICENSE')
print("lic download_url:", lic.get('download_url'))
lic2 = FJ('https://api.github.com/repos/oil-oil/beautify-github_readme/contents/LICENSE')
print("lic2 download_url:", lic2.get('download_url'))
lic3 = FJ('https://api.github.com/repos/oil-oil/beautify-github_readme/contents/LICENSE.md')
print("lic3 download_url:", lic3.get('download_url'))
lic4 = FJ('https://api.github.com/repos/oil-oil/beautify-github_readme/contents/LICENSE.txt')
print("lic4 download_url:", lic4.get('download_url'))
print("DONE")
print("beautify commit date:", FJ('https://api.github.com/repos/oil-oil/beautify-github_readme/commits')[0]['commit']['committer']['date'])
print("brag commit date:", FJ('https://api.github.com/repos/latent-spaces/brag/commits')[0]['commit']['committer']['date'])
print("beautify commit:", FJ('https://api.github.com/repos/oil-oil/beautify-github_readme/commits')[0]['sha'])
print("brag commit:", FJ('https://api.github.com/repos/latent-spaces/brag/commits')[0]['sha'])