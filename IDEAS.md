# Ideas

Deferred ideas. Not planned: revisit only if the evals call for them.

## A′: simple RAG + system-one relevance filter

Config A followed by the Clef relevance step, with no loop (config C with a 0-hop budget). It separates the gain that comes from the judge from the gain that comes from the loop, and answers the "a reranker would close the gap" objection to baseline A. Nearly a config switch once C exists. Candidate for phase 4.

## External benchmark check

Run A / B / C on a slice of [EnterpriseRAG-Bench](https://github.com/onyx-dot-app/EnterpriseRAG-Bench) (Onyx, MIT code, ~500K synthetic documents for a fictional company) to show the results do not depend on a corpus we built ourselves, whose prose was written by the same model family as the LLM under test.

Caveats: no wikilinks between documents (link following has nothing to follow), no temporal question category, dataset license not stated.
