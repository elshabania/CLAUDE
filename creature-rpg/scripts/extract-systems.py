"""One-shot extraction of the systems design tables (design/systems.md) into content JSON.
Re-runnable; the JSON files are the source of truth after extraction (hand edits allowed)."""
import json, re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
md = (root / 'design/systems.md').read_text().replace('**', '')
out = root / 'src/data/content'
TYPES = ['fire','water','electric','verdant','stone','frost','gale','toxin','shade','lumen']

# ---- type matrix
matrix = {}
for line in md.splitlines():
    m = re.match(r'\| (\w+) \|(.*)\|$', line)
    if m and m.group(1) in TYPES and len(m.group(2).split('|')) == 10 and m.group(1) not in matrix:
        cells = [c.strip().replace('*','') for c in m.group(2).split('|')]
        conv = {'½':1,'1':2,'2':4,'0':0}
        matrix[m.group(1)] = {TYPES[i]: conv[c] for i,c in enumerate(cells)}
assert len(matrix) == 10, matrix.keys()
json.dump({'ids': TYPES, 'matrix': matrix}, open(out/'types.json','w'), indent=1)

# ---- moves
def parse_effects(s):
    s = s.strip()
    effs = []
    if s in ('—',''): return effs
    for part in [p.strip() for p in re.split(r';\s*(?![^()]*\))', s)]:
        m = re.match(r'^(burn|poison|paralysis|sleep|frostbite) (\d+)%$', part)
        if m: effs.append({'kind':'status','status':m.group(1),'chance':int(m.group(2))}); continue
        m = re.match(r'^(self|foe) ((?:\w+ [+−-]\d+,? ?)+?)(?: (\d+)%)?$', part)
        if m:
            chance = int(m.group(3)) if m.group(3) else 100
            for sm in re.finditer(r'(\w+) ([+−-]\d+)', m.group(2)):
                effs.append({'kind':'stat','target':m.group(1),'stat':sm.group(1),'delta':int(sm.group(2).replace('−','-')),'chance':chance})
            continue
        m = re.match(r'^flinch (\d+)%$', part)
        if m: effs.append({'kind':'flinch','chance':int(m.group(1))}); continue
        m = re.match(r'^dizzy (\d+)%$', part)
        if m: effs.append({'kind':'dizzy','chance':int(m.group(1))}); continue
        m = re.match(r'^recoil 1/3$', part)
        if m: effs.append({'kind':'recoil','num':1,'den':3}); continue
        if part == 'drain 1/2': effs.append({'kind':'drain','num':1,'den':2}); continue
        m = re.match(r'^heal 1/2(?: \((.*)\))?$', part)
        if m:
            e = {'kind':'heal','num':1,'den':2,'weather':{}}
            if m.group(1):
                for w in m.group(1).split(';'):
                    w = w.strip()
                    wm = re.match(r'([\w/]+) (\d)/(\d)', w)
                    for ww in wm.group(1).split('/'):
                        e['weather'][ww] = [int(wm.group(2)), int(wm.group(3))]
            effs.append(e); continue
        m = re.match(r'^weather (\w+) \(5\)$', part)
        if m: effs.append({'kind':'weather','weather':m.group(1)}); continue
        if part == 'crit+1': effs.append({'kind':'critStage','delta':1}); continue
        if part == 'hits exactly 2': effs.append({'kind':'hits','count':2}); continue
        if part == 'shield': effs.append({'kind':'shield'}); continue
        if part.startswith('sap'): effs.append({'kind':'sap'}); continue
        if part == 'cleanse': effs.append({'kind':'cleanse'}); continue
        if part.startswith('clearAll'): effs.append({'kind':'clearAll'}); continue
        if part == 'power ×2 if target poisoned': effs.append({'kind':'powerIfTargetStatus','status':'poison','mult':2}); continue
        m = re.match(r'^(rain|snow): never misses$', part)
        if m: effs.append({'kind':'neverMissIn','weather':m.group(1)}); continue
        m = re.match(r'^sunlight: acc (\d+)$', part)
        if m: effs.append({'kind':'accIn','weather':'sunlight','accuracy':int(m.group(1))}); continue
        if part.startswith('user loses floor(maxHp/4)'): effs.append({'kind':'recoilMaxHp','num':1,'den':4}); continue
        if part.startswith('used automatically') or part == 'cannot be learned': continue
        if 'rain: never misses' in part:
            effs.append({'kind':'neverMissIn','weather':'rain'}); continue
        raise ValueError('unparsed effect: ' + part)
    return effs

moves = []
for line in md.splitlines():
    m = re.match(r'^\| (m\d{3}) \| \*(.+?)\* \| (\w+) \| (\w+) \| ([\d—]+) \| ([\d—]+) \| ([\d∞]+) \| ([+\d−-]+) \| (\w+) \| (.*?) \| (\w+) \|$', line)
    if not m: continue
    mid,name,typ,cat,pw,acc,ch,pri,tgt,eff,anim = m.groups()
    # m070 effects field contains 'dizzy 30%; rain: never misses'
    moves.append({'id':mid,'name':name,'type':typ,'category':cat,
        'power': None if pw=='—' else int(pw), 'accuracy': None if acc=='—' else int(acc),
        'charges': None if ch=='∞' else int(ch), 'priority': int(pri.replace('+','').replace('−','-')),
        'target': tgt, 'effects': parse_effects(eff), 'anim': anim})
assert len(moves) == 101, len(moves)
json.dump(moves, open(out/'moves.json','w'), indent=1)

# ---- learnsets & evolutions
learn = {}
for line in md.splitlines():
    m = re.match(r'^\| (f\d\d) \w+ \| (\d.*) \|$', line)
    if m and ':' in m.group(2):
        entries = []
        for e in m.group(2).split(','):
            e = e.strip()
            em = re.match(r'^(★)?(\d+|\(st3\)): (m\d{3})$', e)
            assert em, e
            if em.group(1):
                entries.append({'evo': True, 'level': None if em.group(2)=='(st3)' else int(em.group(2)), 'move': em.group(3)})
            else:
                entries.append({'level': int(em.group(2)), 'move': em.group(3)})
        learn[m.group(1)] = entries
assert len(learn) == 10, learn.keys()
evo = {}
for line in md.splitlines():
    m = re.match(r'^\| (f\d\d) \w+ \| (.*?) \| (.*?) \| st2 (m\d{3}), st3 (m\d{3}).*\|$', line)
    if m:
        l1 = int(re.search(r'\d+', m.group(2)).group())
        l2m = re.search(r'Lv (\d+)', m.group(3))
        evo[m.group(1)] = {'level2': l1, 'level3': int(l2m.group(1)), 'item3': 'i_evo_prism' if 'prism' in m.group(3).lower() else None,
                           'move2': m.group(4), 'move3': m.group(5)}
assert len(evo) == 10, evo
cov = {}
m = re.search(r'f01: gale.*', md)
for part in m.group(0).split('·'):
    fm = re.match(r'\s*(f\d\d): (.*)', part.strip())
    cov[fm.group(1)] = [t.strip().rstrip('.') for t in fm.group(2).split(',')]
growth = dict(re.findall(r'(f\d\d) (fast|medium|slow)', re.search(r'`growth` per family:(.*)', md).group(1)))
json.dump({'learnsets': learn, 'evolution': evo, 'discCoverage': cov, 'growth': growth}, open(out/'families.json','w'), indent=1)
print('ok', len(moves), 'moves')
