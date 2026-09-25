import type { GraphData } from "../lib/ontology";
import type { Theme, VowlEdge, VowlNode } from "../lib/vowl";
import type { SelectionInfo } from "./VowlGraph";

interface DetailsProps {
  data: GraphData;
  hover: SelectionInfo | null;
  selected: SelectionInfo | null;
  theme: Theme;
}

function Row({ k, v, color }: { k: string; v: React.ReactNode; color?: string }) {
  return (
    <div className="detail-row">
      <span className="detail-key">{k}</span>
      <span className="detail-val" style={color ? { color } : undefined}>
        {v}
      </span>
    </div>
  );
}

function nodeType(n: VowlNode): string {
  switch (n.kind) {
    case "external":
      return "owl:Class · external";
    case "deprecated":
      return "owl:DeprecatedClass";
    case "datatype":
      return "rdfs:Datatype";
    default:
      return "owl:Class";
  }
}

function edgeType(e: VowlEdge): string {
  switch (e.kind) {
    case "datatype":
      return "owl:DatatypeProperty";
    case "subclass":
      return "rdfs:subClassOf";
    case "disjoint":
      return "owl:disjointWith";
    default:
      return "owl:ObjectProperty";
  }
}

export default function Details({ data, hover, selected, theme }: DetailsProps) {
  const nodes = data.nodes;
  const edges = data.edges;
  const ontology = data.meta;
  const pinned = selected ?? hover;
  const node = pinned?.kind === "node" ? nodes.find((n) => n.id === pinned.id) : undefined;
  const edge = pinned?.kind === "edge" ? edges.find((e) => e.id === pinned.id) : undefined;

  const connected = node
    ? edges.filter((e) => e.source === node.id || e.target === node.id)
    : [];

  return (
    <aside className="hud-panel flex w-[300px] shrink-0 flex-col gap-4 overflow-y-auto">
      {/* ONTOLOGY INFO (always visible, like WebVOWL sidebar) */}
      <section>
        <div className="hud-section-title">◈ ONTOLOGY INFO</div>
        <div className="mb-2 font-[Orbitron] text-[15px] tracking-[0.2em]" style={{ color: theme.klass }}>
          {ontology?.title ?? "ONTOLOGY"}
        </div>
        <Row k="IRI" v={<span className="break-all">{ontology?.iri ?? "—"}</span>} />
        <Row k="VERSION" v={ontology?.version ?? "—"} />
        {ontology?.authors && ontology.authors.length > 0 && (
          <Row k="AUTHORS" v={ontology.authors.join(" · ")} />
        )}
        <p className="mt-2 text-[11px] leading-relaxed opacity-75">
          {ontology?.description ?? ""}
        </p>
      </section>

      {/* SELECTION DETAILS */}
      <section className="min-h-[160px]">
        <div className="hud-section-title">
          {pinned ? "◈ SELECTION // LOCKED" : "◈ SELECTION"}
        </div>
        {!pinned && (
          <p className="text-[11px] opacity-60">
            hover or click a node / arc to inspect its VOWL element data…
          </p>
        )}

        {node && (
          <div>
            <div
              className="mb-2 border-l-2 pl-2 font-[Orbitron] text-[14px] tracking-wider"
              style={{ borderColor: theme.klass, color: theme.text }}
            >
              {node.label}
            </div>
            <Row k="TYPE" v={nodeType(node)} color={theme.klass} />
            <Row k="IRI" v={`nex:${node.label.replace(/\s+/g, "")}`} />
            {node.equivalentLabel && (
              <Row k="EQUIV." v={node.equivalentLabel} color={theme.accent} />
            )}
            {typeof node.individuals === "number" && (
              <Row
                k="INDIVIDUALS"
                v={node.individuals === Number.MAX_SAFE_INTEGER ? "∞" : node.individuals.toLocaleString()}
              />
            )}
            {node.description && (
              <p className="mt-2 text-[11px] leading-relaxed opacity-75">{node.description}</p>
            )}
            <div className="mt-3 text-[10px] tracking-widest opacity-60">CONNECTED PROPERTIES</div>
            <ul className="mt-1 flex flex-col gap-[3px]">
              {connected.map((e) => {
                const out = e.source === node.id;
                const otherId = out ? e.target : e.source;
                const other = nodes.find((n) => n.id === otherId);
                return (
                  <li key={e.id} className="text-[11px] leading-tight">
                    <span style={{ color: e.kind === "datatype" ? theme.dtLabel : e.kind === "disjoint" ? theme.disjoint : theme.objLabel }}>
                      {e.label ?? edgeType(e)}
                    </span>{" "}
                    <span className="opacity-70">{out ? "→" : "←"} {other?.label ?? otherId}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {edge && (
          <div>
            <div
              className="mb-2 border-l-2 pl-2 font-[Orbitron] text-[14px] tracking-wider"
              style={{
                borderColor:
                  edge.kind === "datatype"
                    ? theme.dtLabel
                    : edge.kind === "disjoint"
                      ? theme.disjoint
                      : edge.kind === "subclass"
                        ? theme.subclass
                        : theme.objLabel,
                color: theme.text,
              }}
            >
              {edge.label ?? edgeType(edge)}
            </div>
            <Row k="TYPE" v={edgeType(edge)} color={theme.objLabel} />
            <Row
              k="DOMAIN"
              v={nodes.find((n) => n.id === edge.source)?.label ?? edge.source}
            />
            <Row
              k="RANGE"
              v={nodes.find((n) => n.id === edge.target)?.label ?? edge.target}
            />
            {edge.inverseLabel && <Row k="INVERSE" v={edge.inverseLabel} color={theme.accent} />}
            {edge.sourceCardinality && <Row k="CARD ◦ SRC" v={edge.sourceCardinality} />}
            {edge.targetCardinality && <Row k="CARD ◦ TGT" v={edge.targetCardinality} />}
            {(edge.characteristics?.length ?? 0) > 0 && (
              <Row
                k="CHARACTER."
                v={
                  <span className="flex gap-1">
                    {edge.characteristics!.map((c) => (
                      <span
                        key={c}
                        className="rounded-sm border px-1 text-[9px] uppercase tracking-wider"
                        style={{ borderColor: theme.accent, color: theme.accent }}
                      >
                        {c}
                      </span>
                    ))}
                  </span>
                }
              />
            )}
            {edge.description && (
              <p className="mt-2 text-[11px] leading-relaxed opacity-75">{edge.description}</p>
            )}
          </div>
        )}
      </section>
    </aside>
  );
}
