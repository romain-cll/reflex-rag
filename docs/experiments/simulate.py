import json, sqlite3, sys
d = sys.argv[1]
recs = [json.loads(l) for l in open(d + "/trace.jsonl") if l.strip()][1:]
qs = {q["id"]: q for q in json.load(open("evals/dev/questions.json"))["questions"]}
db = sqlite3.connect(".reflex/index.db")
links = {}
for s, t in db.execute("select sourcePath, targetPath from links"): links.setdefault(s, set()).add(t)
def measures(q, ctx):
    groups = q["sourceGroups"]; src = {s for g in groups for s in g}
    complete = all(any(n in ctx for n in g) for g in groups) if groups else None
    prec = (sum(n in src for n in ctx) / len(ctx)) if ctx else None
    return complete, prec
rules = {
  "current (answer + link ancestors)": None,
  "+ step notes linking to a kept note": "linking",
  "+ every step note": "all",
}
for name, mode in rules.items():
    comp, precs, n, notes = 0, [], 0, []
    bycat = {}
    for r in recs:
        if r["grade"]["failure"] == "loop_error": continue
        q = qs[r["id"]]
        if mode is None:
            ctx = r["contextNotes"]
        else:
            j = r["loop"]["judged"]
            kept = sorted([p for p, v in j.items() if v["answer"] >= 0.5], key=lambda p: -j[p]["answer"])
            steps = sorted([p for p, v in j.items() if v["step"] >= 0.5 and p not in kept], key=lambda p: -j[p]["step"])
            if mode == "linking":
                steps = [p for p in steps if links.get(p, set()) & set(kept)]
            ctx = []
            for p in kept:
                ctx.append(p)
                for s in steps:
                    if s in links and p in links[s] and s not in ctx: ctx.append(s)
            for s in steps:
                if s not in ctx: ctx.append(s)
            ctx = ctx[:5] if kept or mode == "all" else []
        c, p = measures(q, ctx)
        cat = bycat.setdefault(q["category"], [0, 0])
        if c is not None:
            n += 1; comp += c; cat[0] += c; cat[1] += 1
        if p is not None: precs.append(p)
        notes.append(len(set(ctx)))
    print(f"{name:40} complete {comp}/{n}  precision {sum(precs)/len(precs):.2f}  notes {sum(notes)/len(notes):.1f}  " + " ".join(f"{k}:{v[0]}/{v[1]}" for k, v in bycat.items() if v[1]))
