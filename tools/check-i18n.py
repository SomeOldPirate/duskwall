import json,re,glob,sys
L=json.load(open('lang/en.json'))
flat={}
def walk(d,p=''):
    for k,v in d.items():
        if isinstance(v,dict): walk(v,p+k+'.')
        else: flat[p+k]=v
walk(L)
used=set()
for f in glob.glob('module/**/*.mjs',recursive=True)+glob.glob('templates/**/*.hbs',recursive=True):
    for m in re.findall(r'["\'`](DW\.[A-Za-z0-9_.]+)["\'`]',open(f).read()): used.add((m,f))
missing=sorted({k for k,f in used if k not in flat and not k.endswith('.')})
# dynamic families
dyn=[]
for a in ['hunt','study','survey','tinker','finesse','prowl','skirmish','wreck','attune','command','consort','sway']:
    dyn+= [f'DW.Action.{a}',f'DW.ActionHint.{a}']
for k in ['acquire','project','recover','heat']: dyn+=[f'DW.Downtime.{k}Hint',f'DW.Downtime.{k}Claim']
for r in ['critical','success','partial','failure']: dyn+=[f'DW.Engagement.{r}',f'DW.Engagement.{r}Hint',f'DW.Fortune.{r}']
for pos in ['controlled','risky','desperate']:
    for r in ['partial','failure']: dyn.append(f'DW.Outcome.{pos}.{r}')
for t in ['play','gear','people','notes','crew','upgrades','score','contacts']: dyn.append(f'DW.Tab.{t}')
for v in ['attractTrouble','brag','lost','tapped']: dyn+=[f'DW.Vice.{v}',f'DW.Vice.{v}Hint']
for x in ['insight','prowess','resolve','playbook']: dyn.append(f'DW.Xp.{x}')
for x in ['armor','heavy','special']: dyn.append(f'DW.Armor.{x}')
for x in ['gear','ability','cohort','crewAbility']: dyn.append(f'DW.New.{x}')
for x in ['carriage','boat','hidden','quarters','secure','vault','workshop','vehicle','insight','prowess','resolve','personal','mastery','documents','gear','implements','supplies','tools','weapons']: dyn+=[f'DW.Upgrade.{x}',f'DW.Upgrade.{x}Hint']
for x in ['arrest','cooperation','demonicNotice','flipped','gangTrouble','interrogation','questioning','reprisals','rivals','showOfForce','unquietDead','usualSuspects']: dyn+=[f'DW.Entanglement.{x}.name',f'DW.Entanglement.{x}.text']
for x in ['playbook','ability','gear','crewType','crewAbility','cohort']: dyn.append(f'TYPES.Item.{x}')
missing+= [d for d in dyn if d not in flat]
# config-referenced keys
cfg=open('module/config.mjs').read()
missing+= [k for k in re.findall(r'"(DW\.[A-Za-z0-9_.]+)"',cfg) if k not in flat]
print('missing:',sorted(set(missing)))
print(len(flat),'keys')
