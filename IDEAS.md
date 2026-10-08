# Ideas

Deferred ideas. Not planned: revisit only if the evals call for them.

## A′: simple RAG + system-one relevance filter

Config A followed by the Clef relevance step, with no loop (config C with a 0-hop budget). It separates the gain that comes from the judge from the gain that comes from the loop, and answers the "a reranker would close the gap" objection to baseline A. Nearly a config switch once C exists. Candidate for phase 4.

## External benchmark check

Run A / B / C on a slice of [EnterpriseRAG-Bench](https://github.com/onyx-dot-app/EnterpriseRAG-Bench) (Onyx, MIT code, ~500K synthetic documents for a fictional company) to show the results do not depend on a corpus we built ourselves, whose prose was written by the same model family as the LLM under test.

Caveats: no wikilinks between documents (link following has nothing to follow), no temporal question category, dataset license not stated.

## Categories at ceiling for config A

Config A gets every no-answer question right (12/12 on both splits) and 17 of the 18 contradiction questions (runs `2026-10-08T19-34-26-262Z-A-tuning` and `2026-10-08T19-36-50-711Z-A-test`). The absent topics are absent from the whole vault, so nothing close to them is retrieved and the answerer abstains easily; the two divergent notes of a contradiction share their subject, so simple retrieval finds both. On these categories the loop can only lose, which makes them regression checks rather than places to gain. Harder variants: near-miss no-answer questions (an attribute documented only for a sibling entity) and contradictions whose second note is one link away.
