import sys, json, urllib.request

print("Starting...")

for repo in ["oil-oil/beautify-github-readme", "latent-spaces/brag"]:
    url = f"https://api.github.com/repos/{repo}/commits"
    req = urllib.request.Request(url, headers={'User-Agent': 'StarSeed-OS'})
    with urllib.request.urlopen(req) as resp:
        commits = json.load(resp)
    print(f"=== {repo} ===")
    result = []
    for c in commits[:5]:
        sha = c['sha'][:8]
        date = c['commit']['committer']['date']
        msg = c['commit']['message'][:100]
        result.append({'sha': sha, 'date': date, 'message': msg})
    print(json.dumps(result, indent=2))
    print()

print("Done")