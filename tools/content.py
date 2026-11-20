"""Builds the compendium sources (packs/_source/*) from the extracted Blades in the Dark SRD text.
Blades in the Dark is by John Harper / One Seven Design, licensed CC BY 3.0."""
import json, re, hashlib, os, shutil, html
SRC = os.environ.get('EXTRACT', '/home/claude/bitd/extract')
OUT = os.path.join(os.path.dirname(__file__), '..', 'packs', '_source')
SYS = 'duskwall'
pb = json.load(open(f'{SRC}/playbooks.json'))
sp = json.load(open(f'{SRC}/spirits.json'))
cr = json.load(open(f'{SRC}/crews.json'))
cl = json.load(open(f'{SRC}/claims.json'))

def did(*parts):
    h = hashlib.sha1('|'.join(parts).encode()).hexdigest()
    alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    n = int(h, 16); s = ''
    for _ in range(16): s += alphabet[n % 62]; n //= 62
    return s
def esc(s): return html.escape(s, quote=False)
def paras(ps): return ''.join(f'<p>{esc(p)}</p>' for p in ps if p)
def fix(s):
    s = s.replace("'", '’').replace('—', '—')
    s = re.sub(r'(\w)- (\w)', r'\1\2', s)  # rejoin hyphenated line breaks
    return s
TITLE_SMALL = {'a','an','the','to','of','in','on','and','or','be','with','into','as'}
def title(s):
    w = s.split(' ')
    return ' '.join(x if (i and x.lower() in TITLE_SMALL) else (x[:1].upper()+x[1:]) for i, x in enumerate(w))

packs = {k: [] for k in ['playbooks','abilities','gear','crew-types','crew-abilities','factions','rules']}
STATS = {"coreVersion": "14.367", "systemId": SYS, "systemVersion": "1.0.0"}
def item(pack, name, type_, system, img, sort=0, folder=None):
    _id = did(pack, type_, name, system.get('playbook', '') or system.get('crewType', ''))
    doc = {"_id": _id, "_key": f"!items!{_id}", "name": name, "type": type_, "img": img, "system": system,
           "effects": [], "folder": folder, "sort": sort, "flags": {}, "ownership": {"default": 0}, "_stats": STATS}
    packs[pack].append(doc); return doc
def folder(pack, name, type_, sort=0, color=None):
    _id = did('folder', pack, name)
    doc = {"_id": _id, "_key": f"!folders!{_id}", "name": name, "type": type_, "folder": None, "sorting": "m",
           "sort": sort, "color": color, "description": "", "flags": {}, "_stats": STATS}
    packs[pack].append(doc); return _id

ICON = {
 'cutter': 'systems/duskwall/assets/icons/cutter.svg', 'hound': 'systems/duskwall/assets/icons/hound.svg',
 'leech': 'systems/duskwall/assets/icons/leech.svg', 'lurk': 'systems/duskwall/assets/icons/lurk.svg',
 'slide': 'systems/duskwall/assets/icons/slide.svg', 'spider': 'systems/duskwall/assets/icons/spider.svg',
 'whisper': 'systems/duskwall/assets/icons/whisper.svg', 'ghost': 'systems/duskwall/assets/icons/ghost.svg',
 'hull': 'systems/duskwall/assets/icons/hull.svg', 'vampire': 'systems/duskwall/assets/icons/vampire.svg'}
ABILITY_IMG = 'systems/duskwall/assets/icons/ability.svg'
GEAR_IMG = 'systems/duskwall/assets/icons/gear.svg'
CREW_IMG = 'systems/duskwall/assets/icons/crew.svg'

STD_TRIGGERS = ['You expressed your beliefs, drives, heritage, or background.',
                'You struggled with issues from your vice or traumas during the session.']
STARTING = {'cutter': {'skirmish': 2, 'command': 1}, 'hound': {'hunt': 2, 'survey': 1}, 'leech': {'tinker': 2, 'wreck': 1},
            'lurk': {'prowl': 2, 'finesse': 1}, 'slide': {'sway': 2, 'consort': 1}, 'spider': {'consort': 2, 'study': 1},
            'whisper': {'attune': 2, 'study': 1}}
FRIEND_LABEL = {'cutter': 'Dangerous Friends', 'hound': 'Deadly Friends', 'leech': 'Clever Friends', 'lurk': 'Shady Friends',
                'slide': 'Sly Friends', 'spider': 'Shrewd Friends', 'whisper': 'Strange Friends',
                'ghost': 'Enemies & Rivals', 'hull': 'Master & Allies', 'vampire': 'Dark Servants'}

# --- Automation hints the system understands (data/ability.mjs) ---
AUTO = {
 ('cutter','Mule'): {'load': {'light': 5, 'normal': 7, 'heavy': 8}},
 ('cutter','Vigorous'): {'healingMax': 3},
 ('hound','Survivor'): {'stress': 1},
 ('cutter','Battleborn'): {'specialArmor': True}, ('hound','Focused'): {'specialArmor': True},
 ('leech','Fortitude'): {'specialArmor': True}, ('lurk','Shadow'): {'specialArmor': True},
 ('slide','Subterfuge'): {'specialArmor': True}, ('spider','Mastermind'): {'specialArmor': True},
 ('whisper','Warded'): {'specialArmor': True},
 ('hull','Compartments'): {'loadBonus': 2},
}
# Pushing with a special-ability "push" (no stress) is handled by the special-armor checkbox on the sheet.

GATHER = {}
fpb = folder('playbooks', 'Scoundrels', 'Item', 0)
fsp = folder('playbooks', 'Spirits', 'Item', 1)
fab = {}
for i, k in enumerate(['cutter','hound','leech','lurk','slide','spider','whisper','ghost','hull','vampire']):
    fab[k] = folder('abilities', title(k), 'Item', i)
fstd = folder('gear', 'Standard Items', 'Item', 0)
fgear = {k: folder('gear', title(k), 'Item', i+1) for i, k in enumerate(['cutter','hound','leech','lurk','slide','spider','whisper','vampire'])}


def strip_rules(rules, book):
    """The book repeats the rule before explaining it: drop the sentences that restate it."""
    if not book: return book
    nr = set(re.findall(r"[a-z0-9+]+", rules.lower()))
    first = re.split(r'(?<=[.!?”])\s+(?=[A-Z“])', book[0])
    keep = []; dropping = True
    for sent in first:
        w = re.findall(r"[a-z0-9+]+", sent.lower())
        if dropping and w and sum(x in nr for x in w) / len(w) >= 0.8: continue
        dropping = False; keep.append(sent)
    return ([' '.join(keep)] if keep else []) + book[1:]

def ability_doc(pbkey, a, sort):
    name = title(a['name']) if a['name'].islower() else a['name']
    rules = fix(a['rules'])
    book = [fix(p) for p in a.get('book', [])]
    book = strip_rules(rules, book)
    # Boxes as printed on the sheet (Veteran 3, Ghost Hunter 2, the Ghost's Veteran 4, the Vampire's 6…).
    mx = a.get('max', 1)
    system = {'playbook': pbkey, 'rules': rules, 'description': paras(book), 'max': max(1, min(mx, 6)),
              'taken': 0, 'auto': AUTO.get((pbkey, name), {}), 'starting': False}
    return item('abilities', name, 'ability', system, ABILITY_IMG, sort, fab[pbkey])

STD_ITEMS = [
 ('A Blade or Two', 1, 'weapons', 'Perhaps you carry a simple fighting knife. Or two curved swords. Or a rapier and stiletto. Or a heavy butcher’s cleaver.'),
 ('Throwing Knives', 1, 'weapons', 'Six small, light blades.'),
 ('A Pistol', 1, 'weapons', 'A heavy, single-shot, breech-loading firearm. Devastating at 20 paces, slow to reload.'),
 ('A 2nd Pistol', 1, 'weapons', 'Another pistol, for a second shot before you reload.'),
 ('A Large Weapon', 2, 'weapons', 'A weapon meant for two hands. A battle-axe, greatsword, warhammer, or pole-arm. A hunting rifle. A blunderbuss. A bow or crossbow.'),
 ('An Unusual Weapon', 1, 'weapons', 'A curiosity or tool turned into a weapon. A whip, a flail, a hatchet, a shovel, a length of chain, a razor-edged fan, steel-toed boots.'),
 ('Armor', 2, 'armor', 'A thick leather tunic plus reinforced gloves and boots.'),
 ('+Heavy', 3, 'heavy', 'The addition of chain mail, metal plates, a metal helm. The load for heavy armor is in addition to normal armor—5 load total.'),
 ('Burglary Gear', 1, 'gear', 'A set of lockpicks. A small pry-bar. Vials of oil to silence squeaky hinges. A coil of wire and fishing hooks. A small pouch of fine sand.'),
 ('Climbing Gear', 2, 'gear', 'A large coil of rope. A small coil of rope. Grappling hooks. A small pouch of chalk dust. A climbing harness with loops and metal rings. A set of iron pitons and a small mallet.'),
 ('Arcane Implements', 1, 'implements', 'A vial of quicksilver. A pouch of black salt. A spirit anchor in the form of a small stone. A spirit bottle. A vial of electroplasm, designed to break and splatter on impact.'),
 ('Documents', 1, 'documents', 'A collection of slim volumes on a variety of topics, including a registry of the nobility, City Watch commanders, and other notable citizens. Blank pages, a vial of ink, a pen. A number of interesting maps.'),
 ('Subterfuge Supplies', 1, 'supplies', 'A theatrical make-up kit. A selection of blank documents, ready for the forger’s hand. Costume jewelry. A reversible cloak and distinctive hat. A forged badge of office.'),
 ('Demolition Tools', 2, 'tools', 'A sledgehammer and iron spikes. Heavy drill. Crowbar.'),
 ('Tinkering Tools', 1, 'tools', 'An assortment for detailed mechanist work: jeweler’s loupe, tweezers, a small hammer, pliers, screwdriver, etc.'),
 ('Lantern', 1, 'gear', 'A simple oil lantern, a fancy electroplasmic lamp, or other light source.'),
]
std_refs = []
for i, (n, ld, cat, d) in enumerate(STD_ITEMS):
    doc = item('gear', n, 'gear', {'playbook': '', 'description': f'<p>{esc(d)}</p>', 'load': ld, 'category': cat,
                                   'standard': True, 'used': False, 'uses': 0, 'maxUses': 0}, GEAR_IMG, i, fstd)
    std_refs.append(doc['name'])

ITEM_CAT = {'weapon': 'weapons', 'pistol': 'weapons', 'rifle': 'weapons', 'sword': 'weapons', 'hook': 'weapons',
            'tools': 'tools', 'lockpicks': 'gear', 'climbing': 'gear', 'cloak': 'gear', 'goggles': 'gear',
            'disguise': 'supplies', 'identity': 'supplies', 'documents': 'documents', 'blueprints': 'documents',
            'mask': 'implements', 'charm': 'implements', 'key': 'implements', 'bottles': 'implements', 'vials': 'implements'}
def cat_for(n):
    nl = n.lower()
    for k, v in ITEM_CAT.items():
        if k in nl: return v
    return ''
EXTRA_DESC = {'Electroplasm vials': 'Vials of electroplasm, which may be thrown to splatter a spirit or charge a device. Each vial is spent when used.',
              'Bandolier (3 uses)': '',}
def gear_docs(pbkey, items):
    names = []
    for i, it in enumerate(items):
        n = it['name']; d = it.get('desc') or EXTRA_DESC.get(n, '')
        uses = 3 if 'Bandolier' in n else 0
        copies = it.get('copies', 1)
        for c in range(copies):
            nn = n if copies == 1 else f'{n} {c+1}'.replace(' (3 uses)', '') if False else (n.replace(' (3 uses)', '') + (f' {c+1}' if copies > 1 else ''))
            doc = item('gear', nn, 'gear', {'playbook': pbkey, 'description': f'<p>{esc(fix(d))}</p>' if d else '',
                       'load': it['load'], 'category': cat_for(n), 'standard': False, 'used': False,
                       'uses': 0, 'maxUses': uses}, GEAR_IMG, i*10+c, fgear.get(pbkey))
            names.append(doc['name'])
    return names

def friends_of(lst):
    out = []
    for f in lst:
        f = fix(f).rstrip('.')
        if ', ' in f: n, d = f.split(', ', 1)
        else: n, d = f, ''
        out.append({'name': n, 'role': d})
    return out

PB_ORDER = ['cutter','hound','leech','lurk','slide','spider','whisper']
for i, k in enumerate(PB_ORDER):
    v = pb[k]
    ab = [ability_doc(k, a, j) for j, a in enumerate(v['abilities'])]
    gear = gear_docs(k, v['items'])
    system = {
        'key': k, 'spirit': '', 'tagline': fix(v['tagline']), 'description': f'<p>{esc(fix(v["intro"]))}</p>',
        'xpTriggers': [fix(v['xpTrigger'])] + STD_TRIGGERS, 'startingActions': STARTING[k],
        'friendsLabel': FRIEND_LABEL[k], 'friends': friends_of(v['friends']), 'gatherInfo': [fix(g) for g in v['gather']],
        'abilities': [a['name'] for a in ab], 'gear': gear, 'standardGear': True,
        'stress': 9, 'trauma': 4, 'playbookXp': 8, 'attributeXp': 6, 'maxRating': 4,
        'load': {'light': 3, 'normal': 5, 'heavy': 6}, 'healing': 4, 'hasCoin': True, 'hasVice': True,
        'stressLabel': 'stress', 'traumaLabel': 'trauma', 'traumaConditions': 'standard', 'extras': []}
    item('playbooks', title(k), 'playbook', system, ICON[k], i, fpb)

SPIRIT = {
 'ghost': dict(tagline='A disembodied spirit, craving vengeance', stress=9, trauma=4, playbookXp=8, attributeXp=6,
               desc=pb_desc if (pb_desc:=None) else None, stressLabel='drain', traumaLabel='gloom', traumaConditions='gloom',
               hasCoin=False, hasVice=False, standardGear=False, load={'light':0,'normal':0,'heavy':0},
               triggers=['You exacted vengeance upon those whom you deem deserving.',
                         'You expressed your outrage or anger, or settled scores from your heritage or background.',
                         'You struggled with issues from your need or glooms during the session.'],
               need='You have an intense need: life essence. To satisfy this need, possess a living victim and consume their spirit energy (this may be a downtime activity). When you do so, clear half your drain (round down).',
               extras=[]),
 'hull': dict(tagline='A spirit animating a spark-craft frame', stress=10, trauma=4, playbookXp=8, attributeXp=6,
              stressLabel='drain', traumaLabel='wear', traumaConditions='wear', hasCoin=False, hasVice=False, standardGear=True,
              load={'light':3,'normal':5,'heavy':7}, loadLabels={'light':'small','normal':'medium','heavy':'heavy'},
              triggers=['You fulfilled your functions despite difficulty or danger.',
                        'You suppressed or ignored your former human beliefs, drives, heritage, or background.',
                        'You struggled with issues from your wear during the session.'],
              need='Your spark-craft body runs on electroplasm. Recharge your capacitors by connecting to an industrial-grade generator (downtime activity). When you do this, clear 5 drain.',
              extras=[{'key':'functions','label':'Functions (choose three)','max':3,
                       'options':['to guard','to destroy','to discover','to acquire','to labor at']},
                      {'key':'frame','label':'Frame','max':2,'options':['Small (cat size, -1 scale)','Medium (human size)','Heavy (wagon size, +1 scale)']},
                      {'key':'features','label':'Frame Features','max':10,'options':['Levitation','Reflexes','Life-Like Appearance','Spider Climb','Interior Chamber','Plating','Phonograph','Sensors','Smoke Projectors','Spring-Leap Pistons']}]),
 'vampire': dict(tagline='A spirit animating an undead body', stress=12, trauma=4, playbookXp=10, attributeXp=8,
                 stressLabel='stress', traumaLabel='trauma', traumaConditions='vampire', hasCoin=True, hasVice=False, standardGear=True,
                 load={'light':3,'normal':5,'heavy':6},
                 triggers=['You displayed your dominance or slayed without mercy.',
                           'You expressed your beliefs, drives, heritage, or background.',
                           'You struggled with issues from your vice, traumas, or strictures during the session.'],
                 need='Your vice is life essence, consumed from a living human. Use 1 downtime activity to hunt prey and indulge your vice. Also, when you feed, erase all level 1 harm and mark 4 ticks on your healing clock. This is the only way you can heal.',
                 extras=[{'key':'strictures','label':'Strictures','max':5,
                          'options':['Slumber: In downtime, you must spend one activity resting in a dark, silent place (or else suffer 3 stress).',
                                     'Forbidden: You cannot enter a private residence without permission from the owner.',
                                     'Repelled: Spiritbane charms can hold you at bay. (Take 2 stress to resist the repulsion.)',
                                     'Bestial: When you suffer physical harm or overindulge your vice, your body twists into a horrific bestial form until you next feed without overindulging.',
                                     'Bound: Your spirit must remain in this body, or be destroyed.']}]),
}
SPIRIT_INTRO = {
 'ghost': 'A rogue spirit is a scourge upon Duskwall, hunted by Spirit Wardens and sought out as a servant by Whispers and cultists. But your righteous vengeance burns so bright and pure—you must not allow yourself to be thwarted by anyone.',
 'hull': 'You have become a pale echo of your living self, trapped in a metal body, forced into servitude. Is this all that remains of you?',
 'vampire': 'The apex of human existence is the vampire—the sublime, immortal union of spirit and flesh. Mortals are merely flawed reflections of this perfection, suitable only for recruitment into the ranks of the eternal, or fed upon as chattel.'}
VAMP_SERVANTS = [{'name':'Rutherford','role':'a butler'},{'name':'Lylandra','role':'a consort'},{'name':'Kira','role':'a bodyguard'},{'name':'Otto','role':'a coachman'},{'name':'Edrik','role':'an envoy'}]
VAMP_ITEMS = [{'name':'Fine clothes and accoutrements','desc':'','load':0},{'name':'Fine personal weapon','desc':'','load':1},
              {'name':'Fine shadow cloak','desc':'Dark, cloud-like fabric that blends with shadows.','load':1},
              {'name':'Demonbane charm','desc':'An arcane trinket that demons prefer to avoid.','load':0},
              {'name':'Spiritbane charm','desc':'A small arcane trinket that ghosts prefer to avoid.','load':0}]
for i, k in enumerate(['ghost','hull','vampire']):
    v = sp[k]; S = SPIRIT[k]
    ab = []
    for j, a in enumerate(v['abilities']):
        d = ability_doc(k, a, j)
        if j == 0: d['system']['starting'] = True
        ab.append(d)
    gear = gear_docs('vampire', VAMP_ITEMS) if k == 'vampire' else []
    system = {
        'key': k, 'spirit': k, 'tagline': S['tagline'], 'description': f'<p>{esc(SPIRIT_INTRO[k])}</p><p><strong>{esc(S["need"])}</strong></p>',
        'xpTriggers': S['triggers'], 'startingActions': v['start'], 'friendsLabel': FRIEND_LABEL[k],
        'friends': VAMP_SERVANTS if k == 'vampire' else [], 'gatherInfo': [fix(g) for g in v['gather']],
        'abilities': [a['name'] for a in ab], 'gear': gear, 'standardGear': S['standardGear'],
        'stress': S['stress'], 'trauma': S['trauma'], 'playbookXp': S['playbookXp'], 'attributeXp': S['attributeXp'],
        'maxRating': 4, 'load': S['load'], 'healing': 4, 'hasCoin': S['hasCoin'], 'hasVice': S['hasVice'],
        'stressLabel': S['stressLabel'], 'traumaLabel': S['traumaLabel'], 'traumaConditions': S['traumaConditions'],
        'need': S['need'], 'extras': S['extras']}
    item('playbooks', title(k), 'playbook', system, ICON[k], 10+i, fsp)

# ---------------- crews ----------------
HG_DEFS = {
 'assassins': {'Accident':'A killing with no telltale signs of murder.','Disappearance':'The victim vanishes without a trace.','Murder':'An obvious killing that sends a message.','Ransom':'A kidnapping and demand for payment for their return.'},
 'bravos': {'Battle':'Defeat an enemy with overwhelming force.','Extortion':'Threaten violence unless you’re paid off.','Sabotage':'Hurt an opponent by destroying something.','Smash & Grab':'A fast and violent armed robbery.'},
 'cult': {'Acquisition':'Procure an arcane artifact and attune it to your god.','Augury':'Do what you must to attract the god’s attention and counsel.','Consecration':'Anoint a place for your deity.','Sacrifice':'Destroy what is valuable or good in honor of your god.'},
 'hawkers': {'Sale':'A significant transaction with a special buyer of illicit product.','Supply':'A transaction to acquire new product or establish a new supplier.','Show of Force':'Make an example of an enemy to dominate territory.','Socialize':'Improve customer and/or supplier relations with a social event.'},
 'shadows': {'Burglary':'Theft by breaking and entering.','Espionage':'Obtain secret information by covert or clandestine means.','Robbery':'Theft by force or threats.','Sabotage':'Hurt an opponent by destroying something.'},
 'smugglers': {'Arcane/Weird':'Spirit essences, ghosts, cult materials.','Arms':'Restricted military weapons, heavy ordnance, explosives.','Contraband':'High-tax luxuries, drugs, banned art, etc.','Passengers':'People or livestock traveling in secret.'},
}
START_UP = {
 'assassins': {'training': {'insight': 1, 'prowess': 1}, 'lair': {}, 'cohort': None, 'text': 'Training: Insight. Training: Prowess.'},
 'bravos': {'training': {'prowess': 1}, 'lair': {}, 'cohort': {'kind': 'gang', 'type': 'Thugs'}, 'text': 'Training: Prowess. Cohort: a gang of Thugs.'},
 'cult': {'training': {'resolve': 1}, 'lair': {}, 'cohort': {'kind': 'gang', 'type': 'Adepts'}, 'text': 'Training: Resolve. Cohort: a gang of Adepts.'},
 'hawkers': {'training': {'resolve': 1}, 'lair': {'secure': 1}, 'cohort': None, 'text': 'Training: Resolve. Lair: Secure.'},
 'shadows': {'training': {'prowess': 1}, 'lair': {'hidden': 1}, 'cohort': None, 'text': 'Training: Prowess. Lair: Hidden.'},
 'smugglers': {'training': {'prowess': 1}, 'lair': {'vehicle': 1}, 'cohort': None, 'text': 'Training: Prowess. Vehicle: a boat or carriage.'},
}
EXTRA_UPGRADES = {'cult': [('Ordained', 3, 'Each PC gets +1 trauma box. This costs three upgrades to unlock, not just one. This may bring a PC with 4 trauma back into play if you wish.')],
                  'hawkers': [('Composed', 3, 'Each PC gets +1 stress box. This costs three upgrades to unlock, not just one.')],
                  'smugglers': [('Steady', 3, 'Each PC gets +1 stress box. This costs three upgrades to unlock, not just one.')]}
UP_AUTO = {'Hardened': {'trauma': 1}, 'Ordained': {'trauma': 1}, 'Composed': {'stress': 1}, 'Steady': {'stress': 1}}
CLAIM_ALIAS = {'Fighting Pits': 'During downtime, roll dice equal to your Tier. You earn coin equal to the highest result, minus your heat. The locals love to gamble away their hard-won coin on the bloodsports you host.',
               'Surplus Caches': 'You get +2 coin in payoff for scores that involve product sale or supply. You have an abundance of product, which pads your pockets every now and then.',
               'Covert Drops': 'You get +2 coin in payoff for scores that involve espionage or sabotage. The perfect hidden exchange point is worth the extra coin to discerning clientele.',
               'Warehouse': 'You get +1d to acquire asset rolls. You have space to hold all the various items and supplies you end up with from your smuggling runs. They can be useful on their own or for barter when you need it.'}
# Claim automation keys understood by the crew model.
def claim_auto(name, effect):
    e = effect.lower(); a = {}
    if 'heat per score' in e: a['heatPerScore'] = -2
    if '+1 rep per score' in e: a['repPerScore'] = 1
    if 'gather info' in e: a['gatherInfo'] = 1
    if 'healing' in e: a['healing'] = 1
    if 'acquire' in e: a['acquire'] = 1
    if '(tier roll) - heat' in e: a['income'] = True
    m = re.search(r'engagement(?: roll)? for ([a-z ,and]+?) plans', e)
    if m: a['engagement'] = [p.strip() for p in re.split(r',| and ', m.group(1)) if p.strip()]
    if 'reduce heat' in e: a['reduceHeat'] = 1
    return a
def upgrades_of(k):
    txt = cr[k]['upgradesText']
    ups = []
    for u in cr[k]['upgrades']:
        n = re.sub(r'\s*\(.*', '', u['name']).strip()
        n = n.replace("Hawker's", 'Hawker').replace("Smuggler's", 'Smuggler').replace('Underground maps & passkeys', 'Underground Maps and Passkeys')
        n = ' '.join(w[:1].upper() + w[1:] if w not in ('in', 'and') else w for w in n.split(' '))
        m = re.search(re.escape(n) + r': (.*?)(?= \x90| [A-Z][a-z]+(?: [A-Za-z]+){0,4}: | \d{3}$|$)', txt, re.I)
        d = m.group(1).strip() if m else ''
        if n.startswith('Elite '):
            t = n.split(' ', 1)[1]; s1 = t[:-1]
            d = f'All of your cohorts with the {t} type get +1d to quality rolls for {s1}-related actions.'
        ups.append({'name': n, 'boxes': u['boxes'], 'description': fix(d), 'value': 0, 'auto': UP_AUTO.get(n, {})})
    for n, b, d in EXTRA_UPGRADES.get(k, []):
        ups.append({'name': n, 'boxes': b, 'description': d, 'value': 0, 'auto': UP_AUTO.get(n, {})})
    return ups
fct = folder('crew-types', 'Crew Types', 'Item', 0)
fca = {k: folder('crew-abilities', title(k), 'Item', i) for i, k in enumerate(cr)}
for i, (k, v) in enumerate(cr.items()):
    abil = []
    for j, a in enumerate(v['abilities']):
        rules = fix(a['rules']); book = [fix(p.split(' Vehicle Edges')[0]) for p in a.get('book', [])]
        book = strip_rules(rules, book)
        mx = a.get('max', 1)
        d = item('crew-abilities', a['name'], 'crewAbility', {'crewType': k, 'rules': rules, 'description': paras(book),
                 'max': mx, 'taken': 0}, ABILITY_IMG, j, fca[k])
        abil.append(d['name'])
    tiles = []
    for t in cl[k]['tiles']:
        desc = t.get('desc') or CLAIM_ALIAS.get(t['name'], '')
        tiles.append({'name': t['name'], 'effect': t['effect'], 'description': fix(desc), 'held': t['lair'],
                      'turf': t['turf'], 'lair': t['lair'], 'auto': claim_auto(t['name'], t['effect'])})
    hg = [{'name': n, 'description': d} for n, d in HG_DEFS[k].items()]
    contacts = friends_of(v['contacts'])
    system = {'key': k, 'tagline': fix(v['tagline']), 'description': f'<p>{esc(fix(v["intro"]))}</p>',
              'xpTriggers': [fix(x) for x in v['xp']], 'huntingGroundsLabel': 'Hunting Grounds' if k != 'cult' else 'Sacred Sites' if False else 'Hunting Grounds',
              'huntingGrounds': hg, 'contacts': contacts, 'startingUpgrades': START_UP[k], 'claims': {'tiles': tiles, 'links': cl[k]['links']},
              'upgrades': upgrades_of(k), 'abilities': abil, 'deity': k == 'cult', 'vehicle': k == 'smugglers'}
    item('crew-types', title(k), 'crewType', system, CREW_IMG, i, fct)

# ---------------- factions ----------------
FACTIONS = {
 'Underworld': [('The Unseen',4,'S'),('The Hive',4,'S'),('The Circle of Flame',3,'S'),('The Silver Nails',3,'S'),('Lord Scurlock',3,'S'),('The Crows',2,'W'),('The Lampblacks',2,'W'),('The Red Sashes',2,'W'),('The Dimmer Sisters',2,'S'),('The Grinders',2,'W'),('The Billhooks',2,'W'),('The Wraiths',2,'W'),('The Gray Cloaks',2,'S'),('Ulf Ironborn',1,'S'),('The Fog Hounds',1,'W'),('The Lost',1,'W')],
 'Institutions': [('Imperial Military',6,'S'),('City Council',5,'S'),('Ministry of Preservation',5,'S'),('Leviathan Hunters',5,'S'),('Ironhook Prison',4,'S'),('Sparkwrights',4,'S'),('Spirit Wardens',4,'S'),('Bluecoats',3,'S'),('Inspectors',3,'S'),('Iruvian Consulate',3,'S'),('Skovlan Consulate',3,'W'),('The Brigade',2,'S'),('Severosi Consulate',1,'S'),('Dagger Isles Consulate',1,'S')],
 'Labor & Trade': [('The Foundation',4,'S'),('Dockers',3,'S'),('Gondoliers',3,'S'),('Sailors',3,'W'),('Laborers',3,'W'),('Cabbies',2,'W'),('Cyphers',2,'S'),('Ink Rakes',2,'W'),('Rail Jacks',2,'W'),('Servants',2,'W')],
 'Citizenry': [('Whitecrown',5,'S'),('Brightstone',4,'S'),('Charterhall',4,'S'),('Six Towers',3,'W'),('Silkshore',2,'S'),('Nightmarket',2,'S'),('Crow’s Foot',2,'S'),('The Docks',2,'S'),('Barrowcleft',2,'S'),('Coalridge',2,'W'),('Charhollow',1,'S'),('Dunslough',1,'W')],
 'The Fringe': [('The Church of Ecstasy',4,'S'),('The Horde',3,'S'),('The Path of Echoes',3,'S'),('The Forgotten Gods',3,'W'),('The Reconciled',3,'S'),('Skovlander Refugees',3,'W'),('The Weeping Lady',2,'S'),('Deathlands Scavengers',2,'W')],
}
CATKEY = {'Underworld':'underworld','Institutions':'institutions','Labor & Trade':'labor','Citizenry':'citizenry','The Fringe':'fringe'}
for ci, (cat, lst) in enumerate(FACTIONS.items()):
    fid = did('folder', 'factions', cat)
    packs['factions'].append({"_id": fid, "_key": f"!folders!{fid}", "name": cat, "type": "Actor", "folder": None, "sorting": "m",
                              "sort": ci, "color": None, "description": "", "flags": {}, "_stats": STATS})
    for j, (n, t, h) in enumerate(lst):
        _id = did('faction', n)
        packs['factions'].append({"_id": _id, "_key": f"!actors!{_id}", "name": n, "type": "faction",
            "img": 'systems/duskwall/assets/icons/faction.svg',
            "system": {'category': CATKEY[cat], 'tier': t, 'hold': 'strong' if h == 'S' else 'weak', 'status': 0,
                       'turf': '', 'notables': '', 'assets': '', 'allies': '', 'enemies': '', 'situation': '', 'notes': '', 'clocks': [], 'atWar': False},
            "items": [], "effects": [], "folder": fid, "sort": j, "flags": {}, "ownership": {"default": 0}, "_stats": STATS,
            "prototypeToken": {"name": n, "actorLink": True, "texture": {"src": 'systems/duskwall/assets/icons/faction.svg'}}})


# ---------------- rules reference journal ----------------
RULES = [
 ('The Action Roll', """
<p>When a scoundrel does something challenging, make an <strong>action roll</strong>.</p>
<ol><li>The player states their goal for the action.</li><li>The player chooses the action rating that matches what their character is doing in the fiction.</li>
<li>The GM sets the <strong>position</strong> for the roll.</li><li>The GM sets the <strong>effect level</strong> for the action.</li><li>Add bonus dice.</li><li>The player rolls the dice and we judge the result.</li></ol>
<p>Roll 1d for each action rating dot. <strong>+1d</strong> if a teammate assists (they take 1 stress). <strong>+1d</strong> if you push yourself (take 2 stress) <em>or</em> accept a Devil’s Bargain. With zero dice, roll 2d and take the lowest.</p>
<p>Read the single highest die. <strong>Critical</strong> (two or more 6s): you do it with increased effect. <strong>6</strong>: full success. <strong>4/5</strong>: partial success, with a consequence. <strong>1-3</strong>: bad outcome.</p>
<h3>Controlled</h3><p>You act on your terms. You exploit a dominant advantage.</p>
<p><strong>4/5:</strong> You hesitate. Withdraw and try a different approach, or else do it with a minor consequence: a minor complication occurs, you have reduced effect, you suffer lesser harm, you end up in a risky position. <strong>1-3:</strong> You falter. Press on by seizing a risky opportunity, or withdraw and try a different approach.</p>
<h3>Risky</h3><p>You go head to head. You act under fire. You take a chance.</p>
<p><strong>4/5:</strong> You do it, but there’s a consequence: you suffer harm, a complication occurs, you have reduced effect, you end up in a desperate position. <strong>1-3:</strong> Things go badly. You suffer harm, a complication occurs, you end up in a desperate position, you lose this opportunity.</p>
<h3>Desperate</h3><p>You overreach your capabilities. You’re in serious trouble. Each time you roll a desperate action, mark xp in that action’s attribute.</p>
<p><strong>4/5:</strong> You do it, but there’s a consequence: you suffer severe harm, a serious complication occurs, you have reduced effect. <strong>1-3:</strong> It’s the worst outcome. You suffer severe harm, a serious complication occurs, you lose this opportunity for action.</p>
<p>The GM sets the consequences according to the situation. You may suffer one, some, or all of the listed consequences. You may attempt to avoid or reduce a consequence with a resistance roll.</p>"""),
 ('Effect', """
<p><strong>Great</strong>: you achieve more than usual. <strong>Standard</strong>: you achieve what we’d expect. <strong>Limited</strong>: you achieve a partial or weak effect.</p>
<p>The GM may assess three factors that modify effect: <strong>potency</strong> (a particular weakness or advantage), <strong>quality/Tier</strong> (the effectiveness of tools, weapons or resources; fine items count +1 quality), and <strong>scale</strong> (numbers, size, scope of influence). Each factor in your favour may increase effect a level; each against you may reduce it. If effect would drop below limited, the action is impossible as stated.</p>
<p>You can trade position for effect, or vice versa, when it makes sense in the fiction.</p>"""),
 ('Resistance & Armor', """
<ol><li>The player chooses to resist a consequence.</li><li>The GM determines if the consequence will be reduced or negated, depending on the situation.</li>
<li>The GM determines which attribute applies (Insight, Prowess, or Resolve).</li><li>The player rolls the dice for that attribute.</li>
<li>The PC takes stress equal to 6 minus the highest die result, and the consequence is negated or reduced. On a critical, clear 1 stress instead.</li></ol>
<p><strong>Armor:</strong> mark an armor box (armor, heavy, or special) to reduce or avoid a consequence without a roll. Armor uses are recovered in downtime.</p>
<p><strong>Stress:</strong> when you mark your last stress box, you suffer a trauma: clear your stress, mark a trauma condition, and you’re out of action for this scene. When you mark your fourth trauma, your character must retire.</p>"""),
 ('Harm & Healing', """
<p><strong>Level 1</strong> (lesser): less effect. <strong>Level 2</strong> (moderate): -1d. <strong>Level 3</strong> (severe): need help; you can’t act without assistance. <strong>Level 4</strong>: fatal or catastrophic.</p>
<p>If you would take harm at a level that’s full, it moves up to the next level. Push yourself to act despite severe harm.</p>
<p>In downtime, <strong>recover</strong> to tick your healing clock (a 4-clock). When it fills, each harm is reduced by one level.</p>"""),
 ('Teamwork', """
<p><strong>Assist:</strong> take 1 stress to give another player +1d. You might also suffer consequences from the roll. Only one person may assist a roll.</p>
<p><strong>Lead a group action:</strong> roll for each character who participates. The best single roll counts as the action result for everyone. The leader takes 1 stress for each participant who rolled 1-3.</p>
<p><strong>Protect:</strong> face danger for a teammate. Step in to suffer a consequence in their place. You may roll to resist as normal.</p>
<p><strong>Set up:</strong> set up another character with your action. If you achieve it, team members who follow up get +1 effect or improved position.</p>"""),
 ('Fortune Rolls & Flashbacks', """
<p><strong>Fortune roll:</strong> the GM determines a dice pool (generally 1 to 4) from the trait that applies (morale, toughness, quality, Tier, magnitude…). Read the highest die: 1-3 poor, 4/5 limited, 6 full, critical exceptional.</p>
<p><strong>Flashbacks:</strong> the player announces a flashback to an action performed in the past which impacts the current situation. The GM sets a stress cost: <strong>0</strong> for an ordinary action with easy opportunity; <strong>1</strong> for a complex action or unlikely opportunity; <strong>2 or more</strong> for an elaborate action involving special opportunities or contingencies. The PC takes the stress and attempts the flashback action, rolling if it’s challenging.</p>"""),
 ('Planning & Engagement', """
<p>Choose a plan and provide the detail. Each player chooses their load for the operation.</p>
<ul><li><strong>Assault:</strong> point of attack.</li><li><strong>Deception:</strong> method.</li><li><strong>Stealth:</strong> entry point.</li><li><strong>Occult:</strong> arcane power.</li><li><strong>Social:</strong> connection.</li><li><strong>Transport:</strong> route.</li></ul>
<p><strong>Engagement roll:</strong> 1d for sheer luck. +1d for each major advantage, -1d for each major disadvantage (bold and daring plans, the target’s vulnerability, friends and contacts helping, crew abilities). <strong>Critical:</strong> you’ve already overcome the first obstacle and are in a controlled position. <strong>6:</strong> controlled. <strong>4/5:</strong> risky. <strong>1-3:</strong> desperate.</p>
<p><strong>Load:</strong> light (3) — you look like a normal citizen; normal (5) — you look like a scoundrel ready for trouble; heavy (6) — you look like an operative on a dangerous mission. Items in italics have no load.</p>"""),
 ('Payoff, Heat & Entanglements', """
<p>After the score, resolve Payoff, Heat, Entanglements, then Downtime—in that order.</p>
<h3>Payoff</h3><p>The crew earns 2 rep per score, +1 per Tier the target is higher, -1 per Tier lower (minimum zero). Keep the job completely quiet and earn zero rep. Coin: 2 minor job; 4 small job; 6 standard score; 8 big score; 10+ major score. Subtract coin equal to Tier+1 if you pay a tithe.</p>
<h3>Heat</h3><p>0 smooth & quiet; 2 contained; 4 loud & chaotic; 6 wild. +1 for a high-profile or well-connected target; +1 on hostile turf; +1 if at war; +2 if killing was involved. When heat reaches 9, wanted level rises by 1 and heat resets (carrying over the excess).</p>
<h3>Entanglements</h3><p>Roll dice equal to your wanted level (0 dice: 2d, take the lowest) and read the result on the column for your heat.</p>
<table><tr><th></th><th>Heat 0-3</th><th>Heat 4/5</th><th>Heat 6+</th></tr>
<tr><td>1-3</td><td>Gang Trouble or The Usual Suspects</td><td>Gang Trouble or Questioning</td><td>Flipped or Interrogation</td></tr>
<tr><td>4/5</td><td>Rivals or Unquiet Dead</td><td>Reprisals or Unquiet Dead</td><td>Demonic Notice or Show of Force</td></tr>
<tr><td>6</td><td>Cooperation</td><td>Show of Force</td><td>Arrest</td></tr></table>"""),
 ('Downtime', """
<p>Between scores, each PC may pursue two downtime activities, and recovers all armor uses. Additional activities cost 1 coin or 1 rep each. Add +1d if a friend or contact helps. After the roll, spend 1 coin per step to raise the result level.</p>
<ul><li><strong>Acquire Asset:</strong> roll the crew’s Tier. 1-3 inferior (Tier-1), 4/5 standard (Tier), 6 fine (Tier+1), critical exceptional (Tier+2).</li>
<li><strong>Long-Term Project:</strong> roll an action and tick the project clock: 1-3 one, 4/5 two, 6 three, critical five.</li>
<li><strong>Recover:</strong> get treatment and tick your healing clock the same way.</li>
<li><strong>Reduce Heat:</strong> say how, roll an action and reduce heat: 1-3 one, 4/5 two, 6 three, critical five.</li>
<li><strong>Train:</strong> mark 1 xp in an attribute or your playbook (+1 with the matching crew training upgrade). Each track may be trained once per downtime.</li>
<li><strong>Indulge Vice:</strong> roll dice equal to your lowest attribute and clear stress equal to the highest die. Clear more than you had and you <strong>overindulge</strong>: Attract Trouble, Brag (+2 heat), Lost, or Tapped. If you don’t indulge, take stress equal to your trauma.</li></ul>"""),
 ('Factions & Advancement', """
<p><strong>Status</strong> runs from -3 (war) to +3 (allies). While at war, the crew takes +1 heat from scores, temporarily loses 1 hold, and PCs get only one free downtime activity.</p>
<p><strong>Development:</strong> fill the rep tracker (12, less 1 per turf held). If hold is weak, it becomes strong. If hold is strong, pay coin equal to your new Tier × 8 to advance Tier; hold becomes weak. Reset rep (keep turf).</p>
<p><strong>PC xp:</strong> mark attribute xp for each desperate roll. At session end, mark 1 xp (or 2 if it happened a lot) for each trigger, on any track. Fill a track to take an advance: an action dot (attribute track) or a special ability (playbook track). Action ratings are capped at 3 until the crew unlocks Mastery.</p>
<p><strong>Crew xp:</strong> at session end, mark 1 or 2 for each crew trigger. Fill the track for a new crew ability or two upgrade boxes. Each PC gets stash equal to Tier+2.</p>"""),
]
fr = did('journal', 'rules')
pages = []
for i, (n, h) in enumerate(RULES):
    pid = did('page', n)
    pages.append({"_id": pid, "_key": f"!journal.pages!{fr}.{pid}", "name": n, "type": "text", "title": {"show": True, "level": 1},
                  "text": {"format": 1, "content": h.strip()}, "sort": (i+1)*100000, "flags": {}, "ownership": {"default": -1}, "_stats": STATS})
packs['rules'].append({"_id": fr, "_key": f"!journal!{fr}", "name": "Rules Reference", "pages": pages, "folder": None, "sort": 0,
                       "flags": {}, "ownership": {"default": 0}, "_stats": STATS})

for pack, docs in packs.items():
    os.makedirs(OUT, exist_ok=True)
    json.dump(docs, open(os.path.join(OUT, f"{pack}.json"), "w"), indent=1, ensure_ascii=False)
    print(pack, len(docs))
