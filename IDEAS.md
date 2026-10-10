# Ideas

Deferred ideas. Not planned: revisit only if the evals call for them.

## A′: simple RAG + system-one relevance filter

Config A followed by the Clef relevance step, with no loop (config C with a 0-hop budget). It separates the gain that comes from the judge from the gain that comes from the loop, and answers the "a reranker would close the gap" objection to baseline A. Nearly a config switch once C exists. Candidate for phase 4.

## External benchmark check

Run A / B / C on a slice of [EnterpriseRAG-Bench](https://github.com/onyx-dot-app/EnterpriseRAG-Bench) (Onyx, MIT code, ~500K synthetic documents for a fictional company) to show the results do not depend on a corpus we built ourselves, whose prose was written by the same model family as the LLM under test.

Caveats: no wikilinks between documents (link following has nothing to follow), no temporal question category, dataset license not stated.

## Categories at ceiling for config A

Config A gets every no-answer question right (12/12 on both splits) and 17 of the 18 contradiction questions (runs `2026-10-08T19-34-26-262Z-A-tuning` and `2026-10-08T19-36-50-711Z-A-test`). The absent topics are absent from the whole vault, so nothing close to them is retrieved and the answerer abstains easily; the two divergent notes of a contradiction share their subject, so simple retrieval finds both. On these categories the loop can only lose, which makes them regression checks rather than places to gain. Harder variants: near-miss no-answer questions (an attribute documented only for a sibling entity) and contradictions whose second note is one link away.

## A later note one link away

The three questions C+ still misses on the tuning split (`runs/2026-10-10T14-03-44-798Z-C-tuning`) share one template, "Who is Larkspur's contact at the supplier building the X enclosure?". In q-018 and q-027, the tooling sign-off that changed the supplier is never retrieved; it sits in the frontier, linked from the project page, and both judges keep the earlier enclosure review naming the old supplier (B fails both too, `runs/2026-10-10T11-29-35-570Z-B-tuning`). A generic lever for both configs: when a kept answer note records a decision, open its links (or its project's) to notes dated after it, so that a superseding note is judged. It would change B and C alike, not the comparison, and is tuned on a single template.

In q-014, Jev keeps the sign-off as the answer (it names the supplier, 0.89) and leaves the supplier page, which holds the contact, at answer + step 0.83, under the keep threshold; its own sufficiency says 0.43. Calling the fallback also when the judge says the answer is incomplete would add 8 Haiku calls in 8 questions on that run for this one note, and Haiku as fallback already rejected that page in an earlier run (`runs/2026-10-10T11-29-39-582Z-C-tuning`).
