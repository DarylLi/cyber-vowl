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
    return parseRdf(text, ext);
  }
  // content sniffing fallback
  const t = text.trim();
  if (t.startsWith("{")) return parseWebvowlJson(text);
  return parseRdf(text, "ttl");
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

function parseRdf(text: string, ext: string): GraphData {
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

  for (const s of store.statements) {
    if (s.predicate.uri !== RDF_NS + "type" || !isUriNode(s.subject) || !isUriNode(s.object)) {
      continue;
    }
    const subj = s.subject.uri;
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

  // external detection: namespaces outside the most common class namespace
  const nsCount = new Map<string, number>();
  classUris.forEach((u) => {
    const ns = namespaceOf(u);
    nsCount.set(ns, (nsCount.get(ns) ?? 0) + 1);
  });
  const baseNs = [...nsCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";

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
    const ext = baseNs && namespaceOf(u) !== baseNs;
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

  // use labels already resolved for nodes referenced by edges only
  const meta: OntologyMeta = {
    iri: baseNs || "imported ontology",
    title: baseNs ? shortName(baseNs.replace(/[#/]$/, "")) || "IMPORTED ONTOLOGY" : "IMPORTED ONTOLOGY",
    version: "—",
    authors: [],
    description: `Imported from RDF (${contentType}) · ${nodes.length} nodes · ${edges.length} edges. External classes reuse other namespaces; equivalence-folded classes show a double ring.`,
  };

  if (!edges.length) {
    throw new ParseError("ontology parsed but contains no properties to display");
  }
  return { nodes, edges, meta };
}
