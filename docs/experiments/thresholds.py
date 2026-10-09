import json, sqlite3, sys, itertools
d = sys.argv[1]
recs = [json.loads(l) for l in list(open(d + "/trace.jsonl"))[1:] if l.strip()]
qs = {q["id"]: q for q in json.load(open("evals/dev/questions.json"))["questions"]}
db = sqlite3.connect(".reflex/index.db")
links = {}
for s, t in db.execute("select sourcePath, targetPath from links"): links.setdefault(s, set()).add(t)
def context(j, ta, ts, budget=5):
    answers = sorted([p for p, v in j.items() if v["answer"] >= ta], key=lambda p: -j[p]["answer"])
    steps = sorted([p for p, v in j.items() if v["step"] >= ts and p not in answers], key=lambda p: -j[p]["step"])
    ctx = []
    for a in answers:
        if a not in ctx: ctx.append(a)
        for s in steps:
            if a in links.get(s, ()) and s not in ctx: ctx.append(s)
    for s in steps:
        if s not in ctx: ctx.append(s)
    return ctx[:budget]
print("ta   ts   complete  precision notes  multi_hop  temporal  contra  no_answer_empty")
for ta, ts in itertools.product([0.5, 0.6, 0.7, 0.8], [0.5, 0.6, 0.7, 0.8, 0.9]):
    comp = n = 0; precs = []; notes = []; cat = {}; empty_na = 0
    for r in recs:
        if r["grade"]["failure"] == "loop_error": continue
        q = qs[r["id"]]; ctx = context(r["loop"]["judged"], ta, ts)
        groups = q["sourceGroups"]; src = {s for g in groups for s in g}
        if groups:
            c = all(any(x in ctx for x in g) for g in groups); comp += c; n += 1
            k = cat.setdefault(q["category"], [0, 0]); k[0] += c; k[1] += 1
        elif not ctx: empty_na += 1
        if ctx: precs.append(sum(x in src for x in ctx) / len(ctx))
        notes.append(len(ctx))
    print(f"{ta:.1f}  {ts:.1f}  {comp}/{n}    {sum(precs)/len(precs):.2f}      {sum(notes)/len(notes):.1f}    {cat['multi_hop'][0]}/15      {cat['temporal'][0]}/12     {cat['contradiction'][0]}/9    {empty_na}/12")
