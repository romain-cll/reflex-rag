import json, sqlite3, statistics as st
qs = {q["id"]: q for q in json.load(open("evals/dev/questions.json"))["questions"]}
out = json.load(open("/private/tmp/claude-reflex-trial/v1v2-results.json"))
db = sqlite3.connect(".reflex/index.db"); links = {}
for s, t in db.execute("select sourcePath, targetPath from links"): links.setdefault(s, set()).add(t)
print("calls", len(out), "tokens", sum(x["inputTokens"] for x in out), "latency p50", round(st.median(x["latencyMs"] for x in out)), "ms")
def measure(builder):
    comp = n = mh = empty = 0; precs = []; notes = []; cat = {}
    for x in out:
        q = qs[x["id"]]; groups = q["sourceGroups"]; src = {s for g in groups for s in g}
        ctx = builder(x)[:5]
        if groups:
            c = all(any(y in ctx for y in g) for g in groups); comp += c; n += 1; mh += c and q["category"] == "multi_hop"
            k = cat.setdefault(q["category"], [0, 0]); k[0] += c; k[1] += 1
        elif not ctx: empty += 1
        if ctx: precs.append(sum(y in src for y in ctx) / len(ctx))
        notes.append(len(ctx))
    return f"complete {comp}/{n} MH {mh}/15 T {cat['temporal'][0]}/12 C {cat['contradiction'][0]}/9 | precision {sum(precs)/len(precs):.2f} notes {sum(notes)/len(notes):.1f} | no-answer empty {empty}/12"
def per_note(v, keep=0.9, ans=0.7, linked_only=False):
    def b(x):
        j = {p: d for p, d in x[v].items() if d}
        kept = [p for p, d in j.items() if d.get("answer", 0) + d.get("step", 0) >= keep]
        answers = sorted([p for p in kept if j[p].get("answer", 0) >= ans], key=lambda p: -j[p]["answer"])
        steps = sorted([p for p in kept if p not in answers], key=lambda p: -j[p].get("step", 0))
        ctx = []
        for a in answers:
            ctx.append(a)
            for s in steps:
                if a in links.get(s, ()) and s not in ctx: ctx.append(s)
        if not linked_only or not answers:
            for s in steps:
                if s not in ctx: ctx.append(s)
        return ctx
    return b
def best_rule(v_steps, rel=0.5, none_max=0.5, step_t=0.7):
    def b(x):
        best = x["best"]
        if best.get("none", 0) >= none_max: return []
        ranked = sorted([p for p in x["paths"]], key=lambda p: -best.get(p, 0))
        top = best.get(ranked[0], 0)
        answers = [p for p in ranked if best.get(p, 0) >= rel * top and best.get(p, 0) > 0.05]
        j = {p: d for p, d in x[v_steps].items() if d}
        steps = sorted([p for p, d in j.items() if d.get("step", 0) >= step_t and p not in answers], key=lambda p: -j[p]["step"])
        ctx = []
        for a in answers:
            ctx.append(a)
            for s in steps:
                if a in links.get(s, ()) and s not in ctx: ctx.append(s)
        return ctx
    return b
print("first-turn notes only (no link opening), context cut at 5")
print("V0 current rule (as run)        ", measure(per_note("v0")))
print("V0 linked steps only            ", measure(per_note("v0", linked_only=True)))
print("V1 current rule                 ", measure(per_note("v1")))
print("V1 linked steps only            ", measure(per_note("v1", linked_only=True)))
for k in (0.8, 0.95):
    print(f"V1 linked, keep {k}            ", measure(per_note("v1", keep=k, linked_only=True)))
for rel in (0.3, 0.5, 0.7):
    print(f"V2 best (>= {rel} x top) + V1 linked steps", measure(best_rule("v1", rel)))
print(f"V2 best (>= 0.5 x top) + V0 linked steps", measure(best_rule("v0", 0.5)))
# how did Luis vs Aisha go on q-016
x = next(x for x in out if x["id"] == "q-016")
for p in x["paths"]:
    if any(n in p for n in ("Luis Whitaker", "Aisha Whitfield", "Harborview College account")):
        print("q-016", p.split("/")[-1][:40], "v0", {k: round(v, 2) for k, v in x["v0"][p].items()}, "v1", {k: round(v, 2) for k, v in x["v1"][p].items()}, "best", round(x["best"][p], 2))
print("\nhybrids: V0 linked-only, then drop the notes V1 calls none and V2 does not pick")
def hybrid(none_t, best_t):
    base = per_note("v0", linked_only=True)
    def b(x):
        ctx = base(x)
        return [p for p in ctx if not (x["v1"].get(p) and x["v1"][p].get("none", 0) >= none_t and x["best"].get(p, 0) < best_t)]
    return b
for none_t, best_t in [(0.5, 0.05), (0.6, 0.05), (0.7, 0.05), (0.7, 0.02), (0.8, 0.05)]:
    print(f"drop if V1 none >= {none_t} and best < {best_t}", measure(hybrid(none_t, best_t)))
