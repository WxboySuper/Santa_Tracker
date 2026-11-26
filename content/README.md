# Stop card data contract

Cards are keyed by the stable generator candidate ID in `place_id`. The route may select a different subset or ordering without changing the card lookup. Keep one JSON record per candidate in `stop-cards.json`.

Each record has `country`, `note`, `sources`, `topic_key`, `photo`, and `review_status`. Use `note: null` and `topic_key: null` when research does not support a concise cultural note. `sources` must still contain at least one HTTPS source for the place record. A photo is either `null` or a complete object with its image URL, dimensions, author, allowed license name, license URL, and source page.

Accepted review states are `draft`, `approved`, and `stale`. Only approved notes should be shown to users. `allow_duplicate_topic: true` records an explicit country-level exception. The validator also checks note similarity using normalized three-word shingles with a Jaccard threshold of 0.72.

Validate the data with `pnpm content:validate`. Research drafts can be generated with `node tools/research-stop-cards.mjs content/drafts <candidate-id> ...`. The research tool never writes approved notes. A person must write and source each note in original language.
