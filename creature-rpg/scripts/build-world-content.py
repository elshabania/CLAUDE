"""Generates src/data/content/encounters.json and trainers.json from design/world.md v2 (+ systems.md v2 §14.2).
Deterministic: generic trainer teams are derived from the listed families and level ranges using the
evolution-level legality rule (no stage above what its level allows)."""
import json, re, pathlib, hashlib
root = pathlib.Path(__file__).resolve().parent.parent
wm = (root / 'design/world.md').read_text().replace('**', '').replace('−', '-').replace('–', '-')
species = {s['id']: s for s in json.load(open(root / 'src/data/content/species.json'))}
fams = json.load(open(root / 'src/data/content/families.json'))['evolution']
out = root / 'src/data/content'

# ---------------- encounters ----------------
enc = {}
zone = None
for line in wm.splitlines():
    h = re.match(r'^#### (\w+)( - (upper|lower))?', line.replace('—', '-'))
    if h:
        zone = h.group(1) + ('' if not h.group(3) else '_' + h.group(3))
        continue
    if zone is None:
        continue
    m = re.match(r'^\| (c\d\d) \| [^|]+ \| [^|]+ \| (\d+)(?:-(\d+))? \| ([\d-]+|—) \| ([\d—.-]+)', line)
    if m:
        sid, lo, hi = m.group(1), int(m.group(2)), int(m.group(3) or m.group(2))
        a, b = m.group(4), m.group(5)
        if zone.startswith('cave'):
            w = int(a)
            row = {'species': sid, 'lo': lo, 'hi': hi, 'day': w, 'night': w}
        else:
            row = {'species': sid, 'lo': lo, 'hi': hi, 'day': 0 if a in ('—', '-') else int(a), 'night': 0 if b in ('—', '-') else int(float(b))}
        enc.setdefault(zone, []).append(row)
    if line.startswith('## 5.'):
        break
for z, rows in enc.items():
    for key in ('day', 'night'):
        s = sum(r[key] for r in rows)
        assert s == 100, (z, key, s)
    for r in rows:  # D23 legality
        sp = species[r['species']]
        if sp['stage'] > 1:
            ev = fams[sp['family']]
            need = ev['level2'] if sp['stage'] == 2 else ev['level3']
            assert r['lo'] >= need, (z, r)
WEATHER_MULT = {
    'rain': {'verdant': 1.5, 'toxin': 1.5, 'gale': 0.5, 'lumen': 0.75},
    'fog': {'shade': 2.0, 'lumen': 1.5, 'gale': 0.5},
    'snow': {'frost': 2.0, 'verdant': 0.25, 'toxin': 0.5},
    'sunlight': {'stone': 1.25, 'gale': 1.25, 'shade': 0.5, 'frost': 0.5},
}
json.dump({'tables': enc, 'weatherMult': WEATHER_MULT}, open(out / 'encounters.json', 'w'), indent=1)
print('encounters', {k: len(v) for k, v in enc.items()})

# ---------------- trainers ----------------
CLASS = {  # archetype -> (display title, payout class base, look)
    'kite_flyer': ('Kite Flyer', 16, 'youth'), 'villager_child': ('Village Kid', 16, 'villagerC'), 'scout': ('Trail Scout', 24, 'climber'),
    'hiker': ('Hiker', 24, 'hiker'), 'stillmark_engineer': ('Stillmark Engineer', 20, 'stillhand'), 'hall_tuner': ('Hall Tuner', 36, 'veteran'),
    'bell_ringer': ('Bell Ringer', 24, 'villagerB'), 'miner': ('Miner', 24, 'hiker'), 'fen_wader': ('Fen Wader', 24, 'angler'), 'angler': ('Angler', 24, 'angler'),
    'sail_hand': ('Sail Hand', 24, 'angler'), 'cliff_runner': ('Cliff Runner', 24, 'climber'), 'forge_hand': ('Forge Hand', 36, 'villagerB'),
    'pilgrim': ('Pilgrim', 36, 'veteran'), 'ski_patrol': ('Ski Patroller', 36, 'climber'), 'aurora_chaser': ('Aurora Chaser', 36, 'scholar'),
}
NAMED = {'Cass': ('Cass', 'Rival', 40, 'cass'), 'Wren': ('Wren Mossgrave', 'Cantor', 100, 'wren'), 'Dorran Shale': ('Dorran Shale', 'Cantor', 100, 'dorran'),
         'Nerys': ('Nerys Tidewell', 'Cantor', 100, 'nerys'), 'Tamsin': ('Tamsin Galloway', 'Cantor', 100, 'tamsin'), 'Bastian': ('Bastian Coalridge', 'Cantor', 100, 'bastian'),
         'Isaure': ('Isaure Frostmere', 'Cantor', 100, 'isaure'), 'Brann': ('Brann Coldcourt', 'Warden', 60, 'brann'), 'Vey': ('Vey Lanternlow', 'Warden', 60, 'vey'),
         'Odile': ('Odile Graven', 'Magister', 60, 'odile'), 'Rhea': ('Rhea Rookwell', 'the Concordant', 200, 'rhea')}
FIRST = ['Tam', 'Ilse', 'Bram', 'Orla', 'Pell', 'Mira', 'Coll', 'Nessa', 'Hob', 'Ysa', 'Jory', 'Lark', 'Fen', 'Wyn', 'Rook', 'Sable', 'Dunn', 'Elsie', 'Grig', 'Hettie', 'Kit', 'Lowri', 'Mabon', 'Nia', 'Osric', 'Pim', 'Quill', 'Rosa', 'Sully', 'Tove', 'Ula', 'Vance', 'Willa', 'Yarrow', 'Zeb']
LINES = {
    'intro': ['Hold up! Your troupe looks ready for a tune-up.', 'I heard you coming three hedges back. Let\'s see if your kin are as loud!', 'A Tuner! Finally. My kin have been practising all morning.', 'You\'re in my spot. Battle for it?', 'Every good song needs a second voice. Care to be mine?'],
    'lose': ['Well played. That was a proper chord.', 'Ah — you out-tuned me. Fair and square.', 'My kin need a nap. So do I.', 'I\'ll practise my scales and try again.'],
    'win': ['Ha! Back to the Hearthrest with you.', 'Keep at it — every Tuner loses a verse now and then.'],
}
STILL = {'intro': ['Pardon us. We\'re only servicing the stone.', 'Work order says this area is off-limits. Terribly sorry.', 'Guild business. Please step back — ah, you won\'t. Very well.'],
         'lose': ['I\'ll have to file a report about this.', 'That… was not in the work order.', 'The Magister will want to hear about you.'],
         'win': ['Please don\'t make me write you up twice.']}
def stage_for(fam, level):
    ev = fams[fam]
    ids = sorted(k for k, v in species.items() if v['family'] == fam)
    if level >= ev['level3']: return ids[2]
    if level >= ev['level2']: return ids[1]
    return ids[0]
def h(s): return int(hashlib.md5(s.encode()).hexdigest()[:8], 16)

trainers = []
sec = wm[wm.index('### 2.9 Trainers'):wm.index('## 3. Gates')]
for line in sec.splitlines():
    m = re.match(r'^\| (t_\w+) \| (\w+) \| \(([-\d.]+),([-\d.]+)\) \| ([^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$', line)
    if not m: continue
    tid, zone, x, z, arch, size, lv, famcol, mo = [g.strip() for g in m.groups()]
    mandatory = mo.startswith('M')
    t = {'id': tid, 'zone': zone, 'at': [float(x), float(z)], 'mandatory': mandatory}
    if arch in NAMED:
        name, title, base, look = NAMED[arch]
    else:
        title, base, look = CLASS[arch]
        name = FIRST[h(tid) % len(FIRST)]
    t.update({'name': name, 'title': title, 'look': look, 'classBase': base})
    team = []
    if tid == 't_odile':
        t['phases'] = [
            {'attuned': None, 'team': [{'species': 'c24', 'level': 42}, {'species': 'c29', 'level': 43}, {'species': 'c26', 'level': 44}]},
            {'attuned': 'frost', 'team': [{'species': 'c27', 'level': 46}]},
        ]
        team = t['phases'][0]['team'] + t['phases'][1]['team']
    elif tid == 't_rival_post':
        team = [{'species': 'RS3', 'level': 55}, {'species': 'c21', 'level': 53}, {'species': 'c15', 'level': 53}, {'species': 'c18', 'level': 54}, {'species': 'c27', 'level': 54}, {'species': 'c12', 'level': 53}]
    else:
        explicit = ['RS1'] if 'rival starter' in famcol else re.findall(r'(c\d\d|RS\d)', famcol)
        lvls = [int(v) for v in re.findall(r'\d+', lv)]
        n = int(re.match(r'\d+', size).group())
        if explicit and len(explicit) >= n:
            if len(lvls) == n:
                team = [{'species': explicit[i], 'level': lvls[i]} for i in range(n)]
            else:
                lo, hi = lvls[0], lvls[-1]
                team = [{'species': explicit[i], 'level': lo + (i * (hi - lo)) // max(1, n - 1)} for i in range(n)]
        else:
            famlist = re.findall(r'f\d\d', famcol)
            lo, hi = lvls[0], lvls[-1]
            for i in range(n):
                f = famlist[i % len(famlist)]
                level = lo + (i * (hi - lo)) // max(1, n - 1)
                sid = explicit[i] if i < len(explicit) else stage_for(f, level)
                team.append({'species': sid, 'level': level})
    for mem in team:  # legality
        if mem['species'].startswith('RS'): continue
        sp = species[mem['species']]
        if sp['stage'] > 1:
            ev = fams[sp['family']]
            need = ev['level2'] if sp['stage'] == 2 else ev['level3']
            if mem['level'] < need - 4:  # systems allows story aces up to 4 below
                raise SystemExit(f'illegal {tid} {mem}')
    t['team'] = team
    story = arch in NAMED
    t['ai'] = 'normal' if (tid in ('t_rival_1', 't_rival_2') or not story) else 'hard'
    t['potential'] = 15 if tid == 't_champion' else 13 if tid == 't_odile' else 12 if story else 6
    t['items'] = ['i_salve_3', 'i_salve_3'] if story and tid not in ('t_rival_1', 't_rival_2') else (['i_salve_1'] if story else [])
    if tid in ('t_champion', 't_odile'): t['items'] = ['i_salve_4', 'i_salve_4', 'i_cure_all']
    pool = STILL if arch == 'stillmark_engineer' else LINES
    if not story:
        t['lines'] = {k: v[h(tid + k) % len(v)] for k, v in pool.items()}
    t['sight'] = 0 if story else 8
    t['payout'] = base * max(m_['level'] for m_ in team)
    trainers.append(t)
assert len(trainers) == 71, len(trainers)
json.dump(trainers, open(out / 'trainers.json', 'w'), indent=1)
print('trainers', len(trainers), 'mandatory', sum(t['mandatory'] for t in trainers))
