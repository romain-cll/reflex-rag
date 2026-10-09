import json, sqlite3, sys
qs = {q["id"]: q for q in json.load(open("evals/dev/questions.json"))["questions"]}
db = sqlite3.connect(".reflex/index.db"); links = {}
for s, t in db.execute("select sourcePath, targetPath from links"): links.setdefault(s, set()).add(t)
recs = [json.loads(l) for l in list(open(sys.argv[1] + "/trace.jsonl"))[1:] if l.strip()]
def kept(v): return v["answer"] + v["step"] >= 0.9
def build(j, mode, budget, ans_t=0.7):
    k = [p for p, v in j.items() if kept(v)]
    answers = sorted([p for p in k if j[p]["answer"] >= ans_t], key=lambda p: -j[p]["answer"])
    if not answers and mode != "current":
        answers = sorted(k, key=lambda p: -j[p]["answer"])[:1]
    steps = sorted([p for p in k if p not in answers], key=lambda p: -j[p]["step"])
    ctx = []
    for a in answers:
        if a not in ctx: ctx.append(a)
        for s in steps:
            if a in links.get(s, ()) and s not in ctx: ctx.append(s)
    if mode == "current":
        for s in steps:
            if s not in ctx: ctx.append(s)
    return ctx[:budget]
def score(mode, budget, ans_t=0.7):
    comp = n = mh = empty = 0; precs = []; notes = []
    for r in recs:
        q = qs[r["id"]]; groups = q["sourceGroups"]; src = {s for g in groups for s in g}
        ctx = build(r["loop"]["judged"], mode, budget, ans_t)
        if groups:
            c = all(any(x in ctx for x in g) for g in groups); comp += c; n += 1; mh += c and q["category"] == "multi_hop"
        elif not ctx: empty += 1
        if ctx: precs.append(sum(x in src for x in ctx) / len(ctx))
        notes.append(len(ctx))
    return f"complete {comp}/{n}  multi_hop {mh}/15  precision {sum(precs)/len(precs):.2f}  notes {sum(notes)/len(notes):.1f}  no_answer_empty {empty}/12"
print("replay of the as-run judged notes (", sys.argv[1].split("/")[-1], ")")
print("current rule, 5 notes                 ", score("current", 5))
print("only steps linked to an answer, 5     ", score("linked", 5))
print("only steps linked to an answer, 3     ", score("linked", 3))
print("current rule, 3 notes                 ", score("current", 3))
print("linked, answers >= 0.85, 5            ", score("linked", 5, 0.85))
print("linked, answers >= 0.9, 5             ", score("linked", 5, 0.9))
