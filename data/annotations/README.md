# annotations

Research-first record kind. Each file is one
`annotation` record (see src/types/record.ts). Folder starts EMPTY — records are added
only when real and sourced (no fabrication — records must be real and sourced). Empty folder bakes to
`public/data/records/*.json` as `[]`, which the loaders handle.
