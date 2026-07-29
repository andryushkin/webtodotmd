# Review

Markup of documents and prototypes, author → Claude. The engine is **not** in
this repository: it lives in `~/Server/smotr` and is shared across projects.
`run` here is a wrapper that points it at this repo's root.

```bash
./docs/review/run                 # http://localhost:8010
./docs/review/run --port 9000 --no-open
```

Marks are written next to the artefact as `<file>.review.json`. Improvements to
the engine itself belong in the smotr repository, not here.
