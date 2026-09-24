"""Builds src/data/content/species.json from design/creatures.md v2 + design/systems.md v2 + DECISIONS renames.
Re-runnable. The JSON is the runtime source of truth; this script documents where every field comes from."""
import json, re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
cm = (root / 'design/creatures.md').read_text()
sm = (root / 'design/systems.md').read_text().replace('**', '')
fam = json.load(open(root / 'src/data/content/families.json'))
RENAME = {'c24': 'Drapetide', 'c21': 'Samarch', 'c27': 'Emberfold', 'c30': 'Coronaleen', 'c11': 'Lullstalk'}
clean = lambda s: re.sub(r'\*\*|\(v2\)', '', s).strip()

species = {}
# roster §0
for line in cm.splitlines():
    m = re.match(r'^\| (c\d\d) \| ([^|]+) \| (f\d\d) \| (\d) \| ([^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \| (\w\w) \| ([^|]+) \|$', line)
    if m and m.group(1) not in species:
        cid = m.group(1)
        types = [t.strip() for t in clean(m.group(5)).replace('·', ',').split(',')]
        species[cid] = {'id': cid, 'name': RENAME.get(cid, clean(m.group(2))), 'family': m.group(3), 'stage': int(m.group(4)), 'types': types,
                        'heightM': float(re.search(r'[\d.]+', clean(m.group(7))).group()), 'bodyPlan': clean(m.group(6)), 'silhouette': m.group(9)}
assert len(species) == 30, len(species)
# stats §5 (last matching row wins, so v2 rows override)
for line in cm.splitlines():
    m = re.match(r'^\| (c\d\d) \| [^|]+ \| ([\d* ]+) \| ([\d* ]+) \| ([\d* ]+) \| ([\d* ]+) \| ([\d* ]+) \| ([\d* ]+) \| (\d+) \|', line)
    if m:
        v = [int(clean(x)) for x in m.groups()[1:7]]
        species[m.group(1)]['base'] = dict(zip(['hp', 'atk', 'def', 'spa', 'spd', 'spe'], v))
        assert sum(v) == int(m.group(8)), (m.group(1), v)
# systems derived
for line in sm.splitlines():
    m = re.match(r'^\| (c\d\d) \| (f\d\d) \| (\d) \| ([^|]+) \| (\d+) \| (\d+) \| (\d+) \| (\w+) \| `(tr_\w+)` \|$', line)
    if m:
        s = species[m.group(1)]
        s['catchRate'] = int(m.group(6)); s['xpYield'] = int(m.group(7)); s['growth'] = m.group(8); s['trait'] = m.group(9)
        assert sum(s['base'].values()) == int(m.group(5)), m.group(1)
# presentation §5.2
for line in cm.splitlines():
    m = re.match(r'^\| (c\d\d) \| ([\w-]+) \| (skittish|curious|territorial|wander) \| (\w+) \| ([\d.]+) \| (\d+) \|$', line)
    if m:
        s = species[m.group(1)]; s['temperament'] = m.group(3); s['attackStyle'] = m.group(4); s['sideYaw'] = int(m.group(6))
# personality rows as encyclopedia blurbs (first 'Personality' after each '#### cXX' header)
cur = None
for line in cm.splitlines():
    h = re.match(r'^#### (c\d\d)', line)
    if h: cur = h.group(1); continue
    m = re.match(r'^\| Personality[^|]*\| (.+) \|$', line)
    if cur and m and 'blurb' not in species[cur]:
        species[cur]['blurb'] = re.sub(r'\btrainers\b', 'Tuners', re.sub(r'\btrainer\b', 'Tuner', clean(m.group(1))))
    m = re.match(r'^\| Dominant colou?rs[^|]*\| (.+) \|$', line)
    if cur and m:
        species[cur]['colors'] = re.findall(r'#[0-9A-Fa-f]{6}', m.group(1))[:3]
# cries per family
cries = {}
for line in cm.splitlines():
    m = re.match(r'^\| (f\d\d) \| (fm|am|saw_formant|noise_formant) \| ([^|]+) \| (\d+) / (\d+) / (\d+) \| (\d+) / (\d+) / (\d+) \| ([^|]*) \|$', line)
    if m:
        contour = [[float(a), float(b.replace('−', '-').replace('+', ''))] for a, b in re.findall(r'\(([\d.]+),([+−-]?\d+)\)', m.group(3).replace('(.', '(0.'))]
        other = m.group(10)
        def num(k):
            mm = re.search(k + r' ([\d.]+)', other); return float(mm.group(1)) if mm else None
        cries[m.group(1)] = {'voice': m.group(2), 'contour': contour, 'pitch': [int(m.group(i)) for i in (4, 5, 6)], 'dur': [int(m.group(i)) for i in (7, 8, 9)],
                             'harmonicity': num('harmonicity'), 'modIndex': num('modIndex'), 'vibrato': num('vibrato'), 'noiseMix': num('noiseMix')}
assert len(cries) == 10, cries.keys()
for s in species.values():
    c = cries[s['family']]; st = s['stage'] - 1
    s['cry'] = {k: v for k, v in {'voice': c['voice'], 'basePitchHz': c['pitch'][st], 'contour': c['contour'], 'durationMs': c['dur'][st], 'harmonicity': c['harmonicity'], 'modIndex': c['modIndex'], 'vibrato': c['vibrato'], 'noiseMix': c['noiseMix']}.items() if v is not None}
    ev = fam['evolution'][s['family']]
    ids = sorted(x for x in species if species[x]['family'] == s['family'])
    if s['stage'] < 3:
        nxt = ids[s['stage']]
        if s['stage'] == 1: s['evolvesTo'] = {'species': nxt, 'level': ev['level2'], 'move': ev['move2']}
        else:
            s['evolvesTo'] = {'species': nxt, 'level': ev['level3'], 'move': ev['move3']}
            if ev['item3']: s['evolvesTo']['item'] = ev['item3']
    if s['stage'] > 1: s['evolvesFrom'] = ids[s['stage'] - 2]
    for k in ('base', 'catchRate', 'trait', 'colors', 'blurb', 'temperament'):
        assert k in s, (s['id'], k)
json.dump([species[k] for k in sorted(species)], open(root / 'src/data/content/species.json', 'w'), indent=1, ensure_ascii=False)
print('ok', len(species))
