// ── VOWL element model (cyberpunk skin of the WebVOWL visual notation) ──
// Reference: VisualDataWeb/WebVOWL – vowl.css + VOWL 2 spec elements:
// classes = circles, datatypes = rectangles, object properties = labelled
// arcs with UML-style cardinalities, disjointness = dashed link,
// subclasses = arrow links, external classes recolored with an "external" hint.

export type NodeKind = "class" | "external" | "deprecated" | "datatype";

export interface VowlNode {
  id: string;
  label: string;
  kind: NodeKind;
  /** equivalent classes merged into one element -> double ring, bracketed label */
  equivalentLabel?: string;
  /** individuals count rendered inside class circles (WebVOWL instance count) */
  individuals?: number;
  description?: string;
}

export type EdgeKind = "object" | "datatype" | "subclass" | "disjoint";

export interface VowlEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  label?: string;
  /** inverse property rendered on the same double-headed arc */
  inverseLabel?: string;
  /** UML-style cardinality rendered near the source end */
  sourceCardinality?: string;
  /** UML-style cardinality rendered near the target end (arrow side) */
  targetCardinality?: string;
  /** owl property characteristics, listed in the details panel */
  characteristics?: string[];
  /** enable travelling data-pulse animation along the arc */
  stream?: boolean;
  description?: string;
}

export interface OntologyMeta {
  iri: string;
  title: string;
  version: string;
  authors: string[];
  description: string;
}

// ── Simulation node (d3-force mutates x/y/vx/vy/fx/fy) ──
export interface SimNode extends VowlNode {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  radius: number;
  degree: number;
}

export interface SimEdge extends Omit<VowlEdge, "source" | "target"> {
  source: SimNode;
  target: SimNode;
}

// ── Cyberpunk color themes ──
export interface Theme {
  id: string;
  name: string;
  /** deep space background */
  bg: string;
  /** grid line color */
  grid: string;
  /** class circles (VOWL #acf) */
  klass: string;
  /** external classes (VOWL #36c) */
  external: string;
  /** deprecated elements (VOWL #ccc) */
  deprecated: string;
  /** datatype rectangles (VOWL #fc3) */
  datatype: string;
  /** object property labels (VOWL #69c) */
  objLabel: string;
  /** datatype property labels (VOWL #9c6) */
  dtLabel: string;
  /** rdf property / misc (VOWL #c9c) */
  rdf: string;
  /** disjoint links (VOWL #f00 dashed) */
  disjoint: string;
  /** subclass arrows (VOWL: white) */
  subclass: string;
  /** primary text */
  text: string;
  /** dim / secondary text */
  dim: string;
  /** accent for UI chrome */
  accent: string;
  /** hover highlight (VOWL #f00) */
  hover: string;
}

export const THEMES: Theme[] = [
  {
    id: "neon-2077",
    name: "NEON-2077",
    bg: "#04010f",
    grid: "#120b2e",
    klass: "#00f0ff",
    external: "#b967ff",
    deprecated: "#5f5f78",
    datatype: "#ffd319",
    objLabel: "#5fd9ff",
    dtLabel: "#39ff14",
    rdf: "#ff2bd6",
    disjoint: "#ff2050",
    subclass: "#e8f6ff",
    text: "#d9fbff",
    dim: "#5f7f95",
    accent: "#ff2bd6",
    hover: "#ffffff",
  },
  {
    id: "ice-protocol",
    name: "ICE PROTOCOL",
    bg: "#010a12",
    grid: "#062033",
    klass: "#7df9ff",
    external: "#4d9fff",
    deprecated: "#55606e",
    datatype: "#cfefff",
    objLabel: "#9fe8ff",
    dtLabel: "#7dffd4",
    rdf: "#a9c6ff",
    disjoint: "#ff4d6d",
    subclass: "#ffffff",
    text: "#eafcff",
    dim: "#51778f",
    accent: "#4d9fff",
    hover: "#ffffff",
  },
  {
    id: "acid-rain",
    name: "ACID RAIN",
    bg: "#050f08",
    grid: "#0c2415",
    klass: "#39ff14",
    external: "#ffd319",
    deprecated: "#5a6357",
    datatype: "#00ffa3",
    objLabel: "#a4ffbe",
    dtLabel: "#e8ff47",
    rdf: "#ff9f1c",
    disjoint: "#ff5533",
    subclass: "#eaffea",
    text: "#e2ffe2",
    dim: "#5f8f6a",
    accent: "#e8ff47",
    hover: "#ffffff",
  },
];
