// ── Ontology import: WebVOWL JSON + RDF (Turtle / N-Triples / RDF/XML) ──
import * as $rdf from "rdflib";
import type { OntologyMeta, VowlEdge, VowlNode } from "./vowl";

export interface GraphData {
  nodes: VowlNode[];
  edges: VowlEdge[];
  meta?: OntologyMeta;
}

export class ParseError extends Error {}

export function parseOntologyFile(fileName: string, text: string): GraphData {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "json") return parseWebvowlJson(text);
  if (["ttl", "n3", "nt", "rdf", "owl", "xml"].includes(ext)) {
    return parseRdf(text, ext, fileName);
  }
  // content sniffing fallback
  const t = text.trim();
  if (t.startsWith("{")) return parseWebvowlJson(text);
  return parseRdf(text, "ttl", fileName);
}

/* ═══════════════════ WebVOWL / OWL2VOWL JSON ═══════════════════ */
/* schema (see WebVOWL repo src/app/data/*.json):
   { header, namespace,
     class:        [{ id, type: "owl:Class"|"rdfs:Literal"|"owl:Thing"|"owl:equivalentClass" }],
     classAttribute: [{ id, iri, label: {"IRI-based"|"en"|"undefined"}, individuals?, attributes?: ["external"|"equivalent"|"deprecated"] }],
     property:     [{ id, type: "owl:objectProperty"|"owl:datatypeProperty"|"rdfs:SubClassOf"|"owl:disjointWith" }],
     propertyAttribute: [{ id, iri, label, domain?, range?, inverse?, cardinality?, attributes?: [...] }] }
   also accepts the app's own simple shape: { nodes: [...], edges: [...] } */

interface WvLabel {
  "IRI-based"?: string;
  en?: string;
  undefined?: string;
  [lang: string]: string | undefined;
}

function wvLabel(l: WvLabel | undefined, fallback: string): string {
  if (!l) return fallback;
  return l.en ?? l["undefined"] ?? l["IRI-based"] ?? fallback;
}

function parseWebvowlJson(text: string): GraphData {
  let d: any;
  try {
    d = JSON.parse(text);
  } catch {
    throw new ParseError("invalid JSON file");
  }

  // simple native shape passthrough
  if (Array.isArray(d?.nodes) && Array.isArray(d?.edges)) {
    return { nodes: d.nodes as VowlNode[], edges: d.edges as VowlEdge[] };
  }

  const classes = d?.class;
  const classAttrs = d?.classAttribute ?? [];
  const props = d?.property ?? [];
  const propAttrs = d?.propertyAttribute ?? [];
  if (!Array.isArray(classes) || !Array.isArray(props)) {
    throw new ParseError(
      "unrecognized JSON: expected WebVOWL format (class/property) or { nodes, edges }"
    );
  }

  const attrById = new Map<string, any>(classAttrs.map((a: any) => [String(a.id), a]));
  const nodes: VowlNode[] = classes.map((c: any) => {
    const a = attrById.get(String(c.id)) ?? {};
    const iri: string = a.iri ?? "";
    const attrs: string[] = a.attributes ?? [];
    const type: string = c.type ?? "owl:Class";
    let kind: VowlNode["kind"] = "class";
    if (type === "rdfs:Literal" || type === "rdfs:Datatype") {
      kind = "datatype";
    } else {
      if (attrs.includes("external")) kind = "external";
      if (attrs.includes("deprecated")) kind = "deprecated";
    }
    return {
      id: `n${c.id}`,
      label: wvLabel(a.label, iri.split(/[#/]/).pop() ?? `n${c.id}`),
      kind,
      equivalentLabel: type === "owl:equivalentClass" || attrs.includes("equivalent")
        ? wvLabel(a.label, "")
        : undefined,
      individuals: typeof a.individuals === "number" ? a.individuals : undefined,
      description: a.iri,
    };
  });

  const pAttrById = new Map<string, any>(propAttrs.map((a: any) => [String(a.id), a]));
  const edges: VowlEdge[] = [];
  for (const p of props) {
    const a = pAttrById.get(String(p.id)) ?? {};
    const type: string = p.type ?? "owl:objectProperty";
    const attrs: string[] = a.attributes ?? [];
    const domain = a.domain != null ? `n${a.domain}` : null;
    const range = a.range != null ? `n${a.range}` : null;
    const kind: VowlEdge["kind"] =
      type === "owl:datatypeProperty"
        ? "datatype"
        : type === "rdfs:SubClassOf"
          ? "subclass"
          : type === "owl:disjointWith"
            ? "disjoint"
            : "object";
    const characteristics = attrs.filter((x) =>
      ["functional", "inverse functional", "transitive", "symmetric"].includes(x)
    );
    const inv = a.inverse != null ? pAttrById.get(String(a.inverse)) : null;
    edges.push({
      id: `e${p.id}`,
      source: domain ?? range ?? "",
      target: range ?? domain ?? "",
      kind,
      label:
        kind === "subclass"
          ? undefined
          : kind === "disjoint"
            ? "Disjoint With"
            : wvLabel(a.label, a.iri?.split(/[#/]/).pop() ?? `e${p.id}`),
      inverseLabel: inv ? wvLabel(inv.label, "") : undefined,
      targetCardinality: a.cardinality ? String(a.cardinality) : undefined,
      characteristics: characteristics.length ? characteristics : undefined,
      description: a.iri,
    });
  }

  const header = d?.header ?? {};
  const meta: OntologyMeta = {
    iri: header.uri ?? header.baseIris?.[0] ?? "imported ontology",
    title: (header.title?.["undefined"] ?? header.title?.en ?? fileBase(header.uri)) || "IMPORTED ONTOLOGY",
    version: header.version ?? "—",
    authors: Array.isArray(header.author) ? header.author.map((x: any) => x.name ?? String(x)) : [],
    description: `Imported from WebVOWL JSON · ${nodes.length} nodes · ${edges.length} edges.`,
  };

  // keep only edges whose endpoints exist
  const ids = new Set(nodes.map((n) => n.id));
  let cleanEdges = edges.filter((e) => ids.has(e.source) && ids.has(e.target));

  // WebVOWL emits one owl:Thing node per imported base IRI — merge them
  const thingIds = nodes.filter((n) => n.label === "Thing").map((n) => n.id);
  if (thingIds.length > 1) {
    const keep = thingIds[0];
    const remap = new Map(thingIds.slice(1).map((id) => [id, keep]));
    cleanEdges = cleanEdges.map((e) => ({
      ...e,
      source: remap.get(e.source) ?? e.source,
      target: remap.get(e.target) ?? e.target,
    }));
    for (let i = nodes.length - 1; i >= 0; i--) {
      if (remap.has(nodes[i].id)) nodes.splice(i, 1);
    }
  }
  return { nodes, edges: cleanEdges, meta };
}

function fileBase(uri: unknown): string {
  if (typeof uri !== "string" || !uri) return "";
  return uri.split(/[#/]/).pop() ?? "";
}

/* ═══════════════════ RDF (Turtle / N3 / N-Triples / RDF+XML) ═══════════════════ */

const RDF_NS = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const RDFS_NS = "http://www.w3.org/2000/01/rdf-schema#";
const OWL_NS = "http://www.w3.org/2002/07/owl#";

function shortName(uri: string): string {
  const cut = Math.max(uri.lastIndexOf("#"), uri.lastIndexOf("/"));
  return cut > 0 ? uri.slice(cut + 1) : uri;
}

function namespaceOf(uri: string): string {
  const cut = Math.max(uri.lastIndexOf("#"), uri.lastIndexOf("/"));
  return cut > 0 ? uri.slice(0, cut + 1) : uri;
}

const CONTENT_TYPES: Record<string, string> = {
  ttl: "text/turtle",
  n3: "text/n3",
  nt: "application/n-triples",
  rdf: "application/rdf+xml",
  owl: "application/rdf+xml",
  xml: "application/rdf+xml",
};

function parseRdf(text: string, ext: string, fileName: string): GraphData {
  const store = $rdf.graph();
  const contentType = CONTENT_TYPES[ext] ?? "text/turtle";
  try {
    $rdf.parse(text, store, "http://imported.ontology/", contentType);
  } catch (e) {
    throw new ParseError(
      `RDF parse failed (${contentType}): ${e instanceof Error ? e.message : String(e)}`
    );
  }
  if (!store.statements.length) {
    throw new ParseError("no RDF statements found in file");
  }

  const RDF = $rdf.Namespace(RDF_NS);
  const RDFS = $rdf.Namespace(RDFS_NS);
  const OWL = $rdf.Namespace(OWL_NS);

  const isUriNode = (t: unknown): t is { termType: string; uri: string } =>
    !!t && (t as { termType?: string }).termType === "NamedNode";

  const labelOf = (uri: string): string | undefined => {
    const l = store.any($rdf.sym(uri), RDFS("label")) as
      | { termType: string; value: string }
      | null
      | undefined;
    return l && l.termType === "Literal" ? l.value : undefined;
  };
  const typesOf = (uri: string): string[] =>
    (store.each($rdf.sym(uri), RDF("type")) as unknown[])
      .filter(isUriNode)
      .map((t) => t.uri);
  const hasType = (uri: string, ...types: string[]) => {
    const ts = typesOf(uri);
    return types.some((t) => ts.includes(t));
  };

  // ── collect entities ──
  const classUris = new Set<string>();
  const thingUris = new Set<string>();
  const objPropUris = new Set<string>();
  const dtPropUris = new Set<string>();
  const equivPairs: Array<[string, string]> = [];
  /** every URI subject → its rdf:type class URIs (instances AND declarations) */
  const typeIndex = new Map<string, string[]>();

  for (const s of store.statements) {
    if (s.predicate.uri !== RDF_NS + "type" || !isUriNode(s.subject) || !isUriNode(s.object)) {
      continue;
    }
    const subj = s.subject.uri;
    const arr = typeIndex.get(subj) ?? [];
    arr.push(s.object.uri);
    typeIndex.set(subj, arr);
    switch (s.object.uri) {
      case OWL_NS + "Class":
      case RDFS_NS + "Class":
        classUris.add(subj);
        break;
      case OWL_NS + "Thing":
        thingUris.add(subj);
        break;
      case OWL_NS + "ObjectProperty":
        objPropUris.add(subj);
        break;
      case OWL_NS + "DatatypeProperty":
        dtPropUris.add(subj);
        break;
    }
  }
  for (const s of store.statementsMatching(null, $rdf.sym(OWL_NS + "equivalentClass"))) {
    if (isUriNode(s.subject) && isUriNode(s.object)) {
      equivPairs.push([s.subject.uri, s.object.uri]);
    }
  }

  // plain rdf:Property without explicit kind → decide by range
  for (const s of store.statements) {
    if (s.predicate.uri !== RDF_NS + "type" || !isUriNode(s.subject) || !isUriNode(s.object)) {
      continue;
    }
    if (s.object.uri !== RDF_NS + "Property") continue;
    const subj = s.subject.uri;
    if (objPropUris.has(subj) || dtPropUris.has(subj)) continue;
    const range = store.any($rdf.sym(subj), RDFS("range"));
    if (isUriNode(range) && hasType(range.uri, OWL_NS + "Class", RDFS_NS + "Class")) {
      objPropUris.add(subj);
    } else {
      dtPropUris.add(subj);
    }
  }

  // external detection by host: classes whose host differs from the
  // majority host (declared classes + instanced classes) render as external
  const hostOf = (u: string): string => {
    try {
      return new URL(u).host;
    } catch {
      return u;
    }
  };
  /** rdf:type values that describe the schema, not instances */
  const META_TYPES = new Set([
    OWL_NS + "Class",
    OWL_NS + "Thing",
    OWL_NS + "Nothing",
    OWL_NS + "NamedIndividual",
    OWL_NS + "ObjectProperty",
    OWL_NS + "DatatypeProperty",
    OWL_NS + "AnnotationProperty",
    OWL_NS + "Ontology",
    OWL_NS + "DeprecatedClass",
    OWL_NS + "DeprecatedProperty",
    OWL_NS + "FunctionalProperty",
    OWL_NS + "InverseFunctionalProperty",
    OWL_NS + "TransitiveProperty",
    OWL_NS + "SymmetricProperty",
    OWL_NS + "Restriction",
    OWL_NS + "AllDisjointClasses",
    RDFS_NS + "Class",
    RDFS_NS + "Datatype",
    RDFS_NS + "Literal",
    RDF_NS + "Property",
  ]);

  const instancedClassUris = new Set<string>();
  typeIndex.forEach((cs) =>
    cs.forEach((c) => {
      if (!META_TYPES.has(c)) instancedClassUris.add(c);
    })
  );
  const hostCount = new Map<string, number>();
  const countHost = (u: string) => {
    const h = hostOf(u);
    hostCount.set(h, (hostCount.get(h) ?? 0) + 1);
  };
  classUris.forEach(countHost);
  instancedClassUris.forEach(countHost);
  const baseHost = [...hostCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  const baseNs = [...new Set([...classUris, ...instancedClassUris])]
    .map(namespaceOf)
    .sort((a, b) => a.length - b.length)[0] ?? "";

  // merge equivalent classes: second element folds into first
  const folded = new Map<string, string>(); // foldedUri -> keptUri
  for (const [a, b] of equivPairs) {
    if (classUris.has(a) && classUris.has(b) && !folded.has(a) && !folded.has(b)) {
      folded.set(b, a);
    }
  }
  const canonical = (uri: string) => {
    let u = uri;
    const seen = new Set<string>();
    while (folded.has(u) && !seen.has(u)) {
      seen.add(u);
      u = folded.get(u)!;
    }
    return u;
  };

  const nodes: VowlNode[] = [];
  const nodeIds = new Set<string>();
  const addNode = (uri: string, kind: VowlNode["kind"]) => {
    const key = canonical(uri);
    if (nodeIds.has(key)) return;
    nodeIds.add(key);
    const eq = [...folded.entries()].find(([, keep]) => keep === key)?.[0];
    nodes.push({
      id: key,
      label: labelOf(key) ?? shortName(key),
      kind,
      equivalentLabel: eq ? labelOf(eq) ?? shortName(eq) : undefined,
      individuals: undefined,
      description: key,
    });
  };

  classUris.forEach((u) => {
    if (folded.has(u)) return;
    const dep = hasType(u, OWL_NS + "DeprecatedClass");
    const ext = baseHost !== "" && hostOf(u) !== baseHost;
    addNode(u, dep ? "deprecated" : ext ? "external" : "class");
  });
  thingUris.forEach((u) => addNode(u, "class"));

  const thingId = OWL_NS + "Thing";

  const datatypeId = (rangeUri: string): string => {
    const id = `dt:${rangeUri}`;
    if (!nodeIds.has(id)) {
      nodeIds.add(id);
      nodes.push({
        id,
        label: shortName(rangeUri),
        kind: "datatype",
        description: rangeUri,
      });
    }
    return id;
  };

  const edges: VowlEdge[] = [];
  let seq = 0;
  const addEdge = (e: Omit<VowlEdge, "id">) => edges.push({ id: `r${seq++}`, ...e });

  const characteristicsOf = (uri: string): string[] | undefined => {
    const chars: string[] = [];
    if (hasType(uri, OWL_NS + "FunctionalProperty")) chars.push("functional");
    if (hasType(uri, OWL_NS + "InverseFunctionalProperty")) chars.push("inverse functional");
    if (hasType(uri, OWL_NS + "TransitiveProperty")) chars.push("transitive");
    if (hasType(uri, OWL_NS + "SymmetricProperty")) chars.push("symmetric");
    return chars.length ? chars : undefined;
  };

  const domainRange = (uri: string): { dom: string; ran: string } => {
    const d = store.any($rdf.sym(uri), RDFS("domain"));
    const r = store.any($rdf.sym(uri), RDFS("range"));
    let dom = isUriNode(d) ? canonical(d.uri) : thingId;
    let ran = isUriNode(r) ? canonical(r.uri) : thingId;
    if (!nodeIds.has(dom) && !classUris.has(dom) && !thingUris.has(dom)) dom = thingId;
    if (!nodeIds.has(ran) && !classUris.has(ran) && !thingUris.has(ran)) ran = thingId;
    if (dom === thingId) addNode(thingId, "class");
    if (ran === thingId) addNode(thingId, "class");
    return { dom, ran };
  };

  objPropUris.forEach((u) => {
    const { dom, ran } = domainRange(u);
    const dep = hasType(u, OWL_NS + "DeprecatedProperty");
    const inv = store.any($rdf.sym(u), OWL("inverseOf"));
    addEdge({
      source: dom,
      target: ran,
      kind: "object",
      label: labelOf(u) ?? shortName(u),
      inverseLabel: isUriNode(inv) ? labelOf(inv.uri) ?? shortName(inv.uri) : undefined,
      characteristics: characteristicsOf(u),
      description: dep ? `${u} (deprecated)` : u,
    });
  });

  dtPropUris.forEach((u) => {
    const d = store.any($rdf.sym(u), RDFS("domain"));
    const r = store.any($rdf.sym(u), RDFS("range"));
    const dom = isUriNode(d) ? canonical(d.uri) : thingId;
    if (dom === thingId) addNode(thingId, "class");
    const ranId = isUriNode(r)
      ? hasType(r.uri, OWL_NS + "Class", RDFS_NS + "Class")
        ? canonical(r.uri)
        : datatypeId(r.uri)
      : datatypeId(RDFS_NS + "Literal");
    addEdge({
      source: dom,
      target: ranId,
      kind: "datatype",
      label: labelOf(u) ?? shortName(u),
      characteristics: characteristicsOf(u),
      description: u,
    });
  });

  // subclass + disjoint links
  for (const s of store.statementsMatching(null, $rdf.sym(RDFS_NS + "subClassOf"))) {
    if (!isUriNode(s.subject) || !isUriNode(s.object)) continue;
    const a = canonical(s.subject.uri);
    const b = canonical(s.object.uri);
    if (!nodeIds.has(a) || !nodeIds.has(b) || a === b) continue;
    addEdge({ source: a, target: b, kind: "subclass" });
  }
  for (const s of store.statementsMatching(null, $rdf.sym(OWL_NS + "disjointWith"))) {
    if (!isUriNode(s.subject) || !isUriNode(s.object)) continue;
    const a = canonical(s.subject.uri);
    const b = canonical(s.object.uri);
    if (!nodeIds.has(a) || !nodeIds.has(b)) continue;
    addEdge({ source: a, target: b, kind: "disjoint", label: "Disjoint With" });
  }

  // ── ABox inference: aggregate instance-level links into class-level VOWL
  //    edges (for data files that contain individuals but no property
  //    declarations, e.g. PMD material test data) ──
  const SKIP_PRED_PREFIX = [
    RDF_NS,
    RDFS_NS,
    OWL_NS,
    "http://purl.org/dc/elements/1.1/",
    "http://purl.org/dc/terms/",
  ];
  const skippedPred = (p: string) => SKIP_PRED_PREFIX.some((ns) => p.startsWith(ns));

  // add nodes for classes that only appear as instance types
  instancedClassUris.forEach((u) => {
    if (META_TYPES.has(u)) return;
    const cu = canonical(u);
    if (nodeIds.has(cu)) return;
    const dep = hasType(cu, OWL_NS + "DeprecatedClass");
    const ext = baseHost !== "" && hostOf(cu) !== baseHost;
    addNode(cu, dep ? "deprecated" : ext ? "external" : "class");
  });

  const edgeKey = (e: { kind: string; source: string; target: string; label?: string }) =>
    `${e.kind}|${e.source}|${e.target}|${e.label ?? ""}`;
  const edgeKeys = new Set(edges.map(edgeKey));
  let inferredEdges = 0;
  const addInferredEdge = (e: Omit<VowlEdge, "id">) => {
    const k = edgeKey(e);
    if (edgeKeys.has(k)) return;
    edgeKeys.add(k);
    addEdge(e);
    inferredEdges++;
  };

  // count individuals per class for the WebVOWL-style instance numbers
  const indivCount = new Map<string, number>();
  typeIndex.forEach((cs) => {
    cs.forEach((c) => {
      if (META_TYPES.has(c)) return;
      const cu = canonical(c);
      indivCount.set(cu, (indivCount.get(cu) ?? 0) + 1);
    });
  });

  for (const s of store.statements) {
    if (skippedPred(s.predicate.uri) || !isUriNode(s.subject)) continue;
    const sTypes = (typeIndex.get(s.subject.uri) ?? []).filter((c) => !META_TYPES.has(c));
    if (!sTypes.length) continue;
    const pLabel = labelOf(s.predicate.uri) ?? shortName(s.predicate.uri);
    if (isUriNode(s.object)) {
      const oTypes = (typeIndex.get(s.object.uri) ?? []).filter((c) => !META_TYPES.has(c));
      if (!oTypes.length) continue;
      for (const c1 of sTypes) {
        for (const c2 of oTypes) {
          if (s.subject.uri === s.object.uri && c1 === c2) continue;
          addInferredEdge({
            source: canonical(c1),
            target: canonical(c2),
            kind: "object",
            label: pLabel,
          });
        }
      }
    } else if (s.object.termType === "Literal") {
      const dtUri =
        (s.object as { datatype?: { uri?: string } }).datatype?.uri ?? RDFS_NS + "Literal";
      for (const c1 of sTypes) {
        addInferredEdge({
          source: canonical(c1),
          target: datatypeId(dtUri),
          kind: "datatype",
          label: pLabel,
        });
      }
    }
  }

  // stamp instance counts on class nodes
  nodes.forEach((n) => {
    if (n.kind === "datatype") return;
    const c = indivCount.get(n.id);
    if (c) n.individuals = c;
  });

  // resolve a human title: owl:Ontology declaration (rdfs:label / dc:title)
  // → file name
  const DC = $rdf.Namespace("http://purl.org/dc/elements/1.1/");
  const ontoDecl = store.statements.find(
    (s) =>
      s.predicate.uri === RDF_NS + "type" &&
      isUriNode(s.subject) &&
      isUriNode(s.object) &&
      s.object.uri === OWL_NS + "Ontology"
  );
  const ontoUri =
    ontoDecl && isUriNode(ontoDecl.subject) ? ontoDecl.subject.uri : null;
  const literalValue = (t: unknown): string | undefined => {
    const v = t as { termType?: string; value?: string } | null | undefined;
    return v && v.termType === "Literal" && v.value ? v.value : undefined;
  };
  const ontologyTitleOf = (uri: string): string | undefined => {
    for (const pred of [RDFS("label"), DC("title")]) {
      const v = literalValue(store.any($rdf.sym(uri), pred));
      if (v) return v;
    }
    return undefined;
  };
  let title = "";
  if (ontoUri) title = ontologyTitleOf(ontoUri) ?? shortName(ontoUri);
  if (!title) title = fileBase(fileName).replace(/\.[^.]+$/, "");
  if (!title) title = "IMPORTED ONTOLOGY";
  const authors = ontoUri
    ? store
        .each($rdf.sym(ontoUri), DC("creator"))
        .map((c) => {
          const t = c as unknown as { termType?: string; value?: string; uri?: string };
          return t.termType === "Literal" ? (t.value ?? "") : shortName(t.uri ?? "");
        })
        .filter(Boolean)
        .slice(0, 4)
    : [];

  const meta: OntologyMeta = {
    iri: ontoUri ?? baseNs ?? "imported ontology",
    title,
    authors,
    version: "—",
    description:
      `Imported from RDF (${contentType}) · ${nodes.length} nodes · ${edges.length} edges.` +
      (inferredEdges > 0
        ? ` Instance data aggregated to class level (${typeIndex.size} typed individuals, ${inferredEdges} inferred relations).`
        : " External classes reuse other namespaces; equivalence-folded classes show a double ring."),
  };

  if (!edges.length) {
    throw new ParseError(
      "no displayable content: the file has no property declarations, no subclass/disjoint relations, and no typed instance links"
    );
  }
  return { nodes, edges, meta };
}
