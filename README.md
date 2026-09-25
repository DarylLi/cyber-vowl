# CYBER//VOWL — Neon Ontology Viewer

A **cyberpunk neon skin** of the [WebVOWL](https://github.com/VisualDataWeb/WebVOWL) ontology graph visualization. It renders OWL ontologies with the VOWL 2 visual notation — force-directed, fully interactive, drenched in neon.

![stack](https://img.shields.io/badge/react-19-00f0ff) ![stack](https://img.shields.io/badge/d3--force-3-b967ff) ![stack](https://img.shields.io/badge/rdflib-2.4-39ff14)

## ✦ Features

- **VOWL 2 notation** — classes as neon circles, datatypes as amber rectangles, labelled arcs with UML-style cardinalities (`1..*`), dashed disjointness links, arrowed subclass relations, double-ring merged equivalent classes, double-headed inverse-property arcs, self-loops.
- **Force-directed layout** (d3-force) — drag nodes, scroll to zoom, hover to trace connected subgraph, click to lock selection; physics pause / gravity slider / reheat.
- **Import ontologies** — drag & drop or pick a file:
  - `.json` — WebVOWL / OWL2VOWL format (also plain `{ nodes, edges }`)
  - `.ttl` / `.n3` / `.nt` — Turtle / Notation3 / N-Triples
  - `.rdf` / `.owl` / `.xml` — RDF/XML
  - Characteristics (functional / transitive / symmetric / …), external namespaces, deprecated classes and equivalences are detected automatically. A bundled **FOAF** sample demonstrates WebVOWL-JSON import.
- **3 neon color themes** — NEON-2077, ICE PROTOCOL, ACID RAIN.
- **Cyberpunk chrome** — deep-space grid, scanlines, glow filters, data-pulse animations along streams, search with pulse highlight, SVG export, telemetry HUD.
- Ships with a bundled cyberpunk sample ontology: **NEXUS://CITY**.

## ✦ Develop

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build → dist/
npm run preview    # serve the production build
```

## ✦ Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/import?repository-url=https://github.com/DarylLi/cyber-vowl)

Vercel auto-detects Vite — no extra settings needed (`vercel.json` already provides the SPA fallback).

## ✦ Credits

Visual notation & original color scheme reference: [VisualDataWeb/WebVOWL](https://github.com/VisualDataWeb/WebVOWL) (VOWL 2 spec).
