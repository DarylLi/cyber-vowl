import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
} from "d3-force";
import { select, type Selection } from "d3-selection";
import { drag } from "d3-drag";
import {
  zoom,
  zoomIdentity,
  type D3ZoomEvent,
  type ZoomBehavior,
  type ZoomTransform,
} from "d3-zoom";
import { nodes as defaultNodes, edges as defaultEdges } from "../data/nexus";
import type { GraphData } from "../lib/ontology";
import type { SimEdge, SimNode, Theme, VowlEdge } from "../lib/vowl";
import {
  arcGeometry,
  bezier,
  compact,
  curveFor,
  datatypeHalf,
  loopGeometry,
  nodeHalf,
} from "../lib/geometry";

export interface Filters {
  datatype: boolean;
  disjoint: boolean;
  subclass: boolean;
  external: boolean;
  pulses: boolean;
}

export interface SelectionInfo {
  kind: "node" | "edge";
  id: string;
}

interface Highlight {
  nodes: Set<string>;
  edges: Set<string>;
}

export interface VowlGraphProps {
  theme: Theme;
  data: GraphData;
  filters: Filters;
  gravity: number; // 0..100
  paused: boolean;
  search: string;
  selected: SelectionInfo | null;
  onHover: (sel: SelectionInfo | null) => void;
  onSelect: (sel: SelectionInfo | null) => void;
}

export interface VowlGraphHandle {
  zoomIn(): void;
  zoomOut(): void;
  fitView(): void;
  reheat(): void;
  exportSvg(): void;
}

const LABEL_FONT = "'Share Tech Mono', 'Courier New', monospace";
const NODE_FONT = "'Share Tech Mono', 'Courier New', monospace";

const VowlGraph = forwardRef<VowlGraphHandle, VowlGraphProps>(function VowlGraph(
  { theme, data, filters, gravity, paused, search, selected, onHover, onSelect },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const worldRef = useRef<SVGGElement>(null);
  const simRef = useRef<Simulation<SimNode, SimEdge> | null>(null);
  const zoomBehRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const [, setTick] = useState(0);
  const [size, setSize] = useState({ w: 1200, h: 800 });
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  const [highlight, setHighlight] = useState<Highlight | null>(null);

  // ── build filtered node/edge model ──
  const graph = useMemo(() => {
    const rawNodes = data.nodes.length ? data.nodes : defaultNodes;
    const rawEdges = data.edges.length ? data.edges : defaultEdges;
    const visibleByKind = (e: VowlEdge) =>
      (e.kind !== "datatype" || filters.datatype) &&
      (e.kind !== "disjoint" || filters.disjoint) &&
      (e.kind !== "subclass" || filters.subclass);
    let visEdges = rawEdges.filter(visibleByKind);
    const externalIds = new Set(
      rawNodes.filter((n) => n.kind === "external").map((n) => n.id)
    );
    let visNodes = rawNodes;
    if (!filters.external) {
      visNodes = visNodes.filter((n) => n.kind !== "external");
      visEdges = visEdges.filter(
        (e) => !externalIds.has(e.source) && !externalIds.has(e.target)
      );
    }
    const degree = new Map<string, number>();
    visEdges.forEach((e) => {
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
    });
    const simNodes: SimNode[] = visNodes.map((n) => {
      const prev = positionsRef.current.get(n.id);
      return {
        ...n,
        x: prev?.x ?? (Math.random() - 0.5) * 900,
        y: prev?.y ?? (Math.random() - 0.5) * 900,
        radius:
          n.kind === "datatype"
            ? 0
            : 24 + Math.min(degree.get(n.id) ?? 0, 9) * 2.4,
        degree: degree.get(n.id) ?? 0,
      };
    });
    const byId = new Map(simNodes.map((n) => [n.id, n]));
    const simEdges: SimEdge[] = visEdges
      .filter((e) => byId.has(e.source) && byId.has(e.target))
      .map((e) => ({
        ...e,
        source: byId.get(e.source)!,
        target: byId.get(e.target)!,
      }));
    return { simNodes, simEdges };
  }, [data, filters]);

  // ── track container size ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── simulation ──
  useEffect(() => {
    graph.simNodes.forEach((n) =>
      positionsRef.current.set(n.id, { x: n.x, y: n.y })
    );
    const sim = forceSimulation(graph.simNodes)
      .force(
        "link",
        forceLink<SimNode, SimEdge>(graph.simEdges)
          .id((d) => d.id)
          .distance((e) =>
            e.kind === "object" ? 210 : e.kind === "datatype" ? 150 : e.kind === "subclass" ? 180 : 140
          )
          .strength(0.9)
      )
      .force("charge", forceManyBody().strength(-480))
      .force(
        "collide",
        forceCollide<SimNode>((n) =>
          n.kind === "datatype" ? nodeHalf(n).w / 2 + 36 : n.radius + 34
        )
      )
      .force("x", forceX(0).strength(0.03 + gravity * 0.0009))
      .force("y", forceY(0).strength(0.03 + gravity * 0.0009))
      .alphaDecay(0.026)
      .on("tick", () => setTick((t) => t + 1));
    simRef.current = sim;
    return () => {
      sim.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  // gravity slider → live force update
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    const g = 0.03 + gravity * 0.0009;
    sim.force("x", forceX(0).strength(g));
    sim.force("y", forceY(0).strength(g));
    sim.alpha(Math.max(0.4, sim.alpha())).restart();
  }, [gravity]);

  // pause / resume
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    if (paused) sim.stop();
    else sim.restart();
  }, [paused, graph]);

  // ── zoom behaviour ──
  useEffect(() => {
    const svg = select(svgRef.current!);
    const beh = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 5])
      .on("zoom", (ev: D3ZoomEvent<SVGSVGElement, unknown>) =>
        setTransform(ev.transform)
      );
    svg.call(beh).on("dblclick.zoom", null);
    zoomBehRef.current = beh;
    return () => {
      svg.on(".zoom", null);
    };
  }, []);

  // ── node dragging ──
  useEffect(() => {
    const sim = simRef.current;
    const world = worldRef.current;
    if (!sim || !world) return;
    const beh = drag<SVGGElement, SimNode>()
      .on("start", (ev, d) => {
        (ev.sourceEvent as Event | null)?.stopPropagation?.();
        if (!ev.active) sim.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (ev, d) => {
        d.fx = ev.x;
        d.fy = ev.y;
      })
      .on("end", (ev, d) => {
        if (!ev.active) sim.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });
    select(world)
      .selectAll<SVGGElement, SimNode>("g.vowl-node")
      .data(graph.simNodes)
      .call(beh);
  }, [graph]);

  // ── hover / selection helpers ──
  const hoverNode = useCallback(
    (id: string | null) => {
      if (!id) {
        setHighlight(null);
        onHover(null);
        return;
      }
      const nodesSet = new Set<string>([id]);
      const edgesSet = new Set<string>();
      graph.simEdges.forEach((e) => {
        if (e.source.id === id || e.target.id === id) {
          edgesSet.add(e.id);
          nodesSet.add(e.source.id);
          nodesSet.add(e.target.id);
        }
      });
      setHighlight({ nodes: nodesSet, edges: edgesSet });
      onHover({ kind: "node", id });
    },
    [graph, onHover]
  );

  const hoverEdge = useCallback(
    (id: string | null) => {
      if (!id) {
        setHighlight(null);
        onHover(null);
        return;
      }
      const e = graph.simEdges.find((x) => x.id === id);
      if (!e) return;
      setHighlight({
        nodes: new Set([e.source.id, e.target.id]),
        edges: new Set([e.id]),
      });
      onHover({ kind: "edge", id });
    },
    [graph, onHover]
  );

  const nodeOpacity = (id: string) =>
    highlight && !highlight.nodes.has(id) ? 0.08 : 1;
  const edgeOpacity = (id: string) =>
    highlight && !highlight.edges.has(id) ? 0.05 : 1;

  const searchHits = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return new Set<string>();
    return new Set(
      graph.simNodes
        .filter(
          (n) =>
            n.label.toLowerCase().includes(q) ||
            n.id.toLowerCase().includes(q)
        )
        .map((n) => n.id)
    );
  }, [search, graph]);

  // ── imperative controls ──
  const svgSelection = (): Selection<SVGSVGElement, unknown, null, undefined> =>
    select(svgRef.current!);

  useImperativeHandle(ref, () => ({
    zoomIn: () => zoomBehRef.current?.scaleBy(svgSelection(), 1.45),
    zoomOut: () => zoomBehRef.current?.scaleBy(svgSelection(), 1 / 1.45),
    fitView: () => {
      const ns = graph.simNodes;
      if (!ns.length) return;
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      ns.forEach((n) => {
        const m = nodeHalf(n);
        minX = Math.min(minX, n.x - m.w);
        maxX = Math.max(maxX, n.x + m.w);
        minY = Math.min(minY, n.y - m.h);
        maxY = Math.max(maxY, n.y + m.h);
      });
      const bw = Math.max(maxX - minX, 1);
      const bh = Math.max(maxY - minY, 1);
      const k = Math.min(size.w / (bw + 160), size.h / (bh + 160), 1.4);
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      zoomBehRef.current?.transform(
        svgSelection(),
        zoomIdentity.translate(size.w / 2 - k * cx, size.h / 2 - k * cy).scale(k)
      );
    },
    reheat: () => {
      const sim = simRef.current;
      if (!sim) return;
      sim.alpha(0.7).restart();
    },
    exportSvg: () => {
      const svg = svgRef.current;
      if (!svg) return;
      const clone = svg.cloneNode(true) as SVGSVGElement;
      clone
        .querySelectorAll(".pulse-dot, .search-ring, .node-hit")
        .forEach((el) => el.remove());
      const pad = 80;
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      graph.simNodes.forEach((n) => {
        const m = nodeHalf(n);
        minX = Math.min(minX, n.x - m.w);
        maxX = Math.max(maxX, n.x + m.w);
        minY = Math.min(minY, n.y - m.h);
        maxY = Math.max(maxY, n.y + m.h);
      });
      if (!isFinite(minX)) {
        minX = -400;
        minY = -300;
        maxX = 400;
        maxY = 300;
      }
      const vx = minX - pad;
      const vy = minY - pad;
      const vw = maxX - minX + pad * 2;
      const vh = maxY - minY + pad * 2;
      // bake the world transform (pan/zoom) into exported coordinates
      const world = clone.querySelector("g.vowl-world") as SVGGElement | null;
      if (world) {
        const { w, h } = size;
        world.setAttribute(
          "transform",
          `translate(${w / 2 + transform.x} ${h / 2 + transform.y}) scale(${transform.k})`
        );
      }
      clone.setAttribute("viewBox", `${vx} ${vy} ${vw} ${vh}`);
      clone.setAttribute("width", String(vw));
      clone.setAttribute("height", String(vh));
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      bg.setAttribute("x", String(vx));
      bg.setAttribute("y", String(vy));
      bg.setAttribute("width", String(vw));
      bg.setAttribute("height", String(vh));
      bg.setAttribute("fill", theme.bg);
      clone.insertBefore(bg, clone.firstChild);
      const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
      style.textContent = `text{font-family:${LABEL_FONT};}`;
      clone.insertBefore(style, clone.firstChild?.nextSibling ?? null);
      const blob = new Blob([new XMLSerializer().serializeToString(clone)], {
        type: "image/svg+xml",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "cyber-vowl-graph.svg";
      a.click();
      URL.revokeObjectURL(url);
    },
  }));

  // ── render geometry per edge: recomputed EVERY render so arcs follow the
  //    simulation ticks and node dragging in real time (no memoization) ──
  const buildEdgeGeom = () => {
    const map = new Map<
      string,
      ReturnType<typeof arcGeometry> | ReturnType<typeof loopGeometry>
    >();
    const pairCount = new Map<string, number>();
    graph.simEdges.forEach((e) => {
      const s = e.source as SimNode;
      const t = e.target as SimNode;
      if (s.id === t.id) {
        map.set(e.id, loopGeometry(s));
        return;
      }
      const key = [s.id, t.id].sort().join("|");
      const idx = pairCount.get(key) ?? 0;
      pairCount.set(key, idx + 1);
      const len = Math.hypot(t.x - s.x, t.y - s.y);
      map.set(e.id, arcGeometry(s, t, curveFor(idx, Math.max(len, 60))));
    });
    return map;
  };
  const edgeGeom = buildEdgeGeom();

  const nodeColor = (n: SimNode): string => {
    switch (n.kind) {
      case "external":
        return theme.external;
      case "deprecated":
        return theme.deprecated;
      case "datatype":
        return theme.datatype;
      default:
        return theme.klass;
    }
  };

  const edgeColor = (e: SimEdge): string => {
    switch (e.kind) {
      case "datatype":
        return theme.dtLabel;
      case "subclass":
        return theme.subclass;
      case "disjoint":
        return theme.disjoint;
      default:
        return theme.objLabel;
    }
  };

  const markerFor = (e: SimEdge): string | null => {
    switch (e.kind) {
      case "datatype":
        return `url(#arrow-dt-${theme.id})`;
      case "subclass":
        return `url(#arrow-sub-${theme.id})`;
      case "disjoint":
        return null;
      default:
        return `url(#arrow-obj-${theme.id})`;
    }
  };

  const worldTransform = `translate(${size.w / 2 + transform.x} ${
    size.h / 2 + transform.y
  }) scale(${transform.k})`;

  let streamIdx = 0;

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden">
      <svg
        ref={svgRef}
        className="h-full w-full cursor-grab active:cursor-grabbing"
        onClick={() => onSelect(null)}
      >
        <defs>
          <filter id="vowl-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="3.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="vowl-glow-soft" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {(
            [
              ["obj", theme.objLabel],
              ["dt", theme.dtLabel],
              ["sub", theme.subclass],
            ] as const
          ).map(([suffix, color]) => (
            <marker
              key={suffix + theme.id}
              id={`arrow-${suffix}-${theme.id}`}
              viewBox="0 0 10 10"
              refX="8.5"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
            </marker>
          ))}
        </defs>

        <g ref={worldRef} className="vowl-world" transform={worldTransform}>
          {/* ── edges ── */}
          {graph.simEdges.map((e) => {
            const geom = edgeGeom.get(e.id);
            if (!geom) return null;
            const color = edgeColor(e);
            const marker = markerFor(e);
            const isSel = selected?.kind === "edge" && selected.id === e.id;
            const hovered = highlight?.edges.has(e.id);
            const width = e.kind === "disjoint" ? 1.6 : isSel || hovered ? 2.6 : 1.8;
            return (
              <g key={e.id} opacity={edgeOpacity(e.id)} style={{ transition: "opacity .18s" }}>
                {/* wide invisible hit area */}
                <path
                  className="node-hit"
                  d={geom.d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={16}
                  pointerEvents="stroke"
                  cursor="pointer"
                  onMouseEnter={() => hoverEdge(e.id)}
                  onMouseLeave={() => hoverEdge(null)}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onSelect({ kind: "edge", id: e.id });
                  }}
                />
                <path
                  d={geom.d}
                  fill="none"
                  stroke={color}
                  strokeWidth={width}
                  strokeDasharray={e.kind === "disjoint" ? "8 6" : undefined}
                  strokeOpacity={e.kind === "disjoint" ? 0.9 : 0.75}
                  markerEnd={marker ?? undefined}
                  markerStart={e.inverseLabel ? marker ?? undefined : undefined}
                  filter={isSel || hovered ? "url(#vowl-glow)" : undefined}
                  style={{ transition: "stroke-width .15s" }}
                />
                {/* travelling data pulses */}
                {e.stream && filters.pulses && (
                  <g className="pulse-dot">
                    {[0, 1].map((k) => {
                      const i = streamIdx++;
                      return (
                        <circle
                          key={k}
                          r={k === 0 ? 6.5 : 2.4}
                          fill={color}
                          opacity={k === 0 ? 0.22 : 0.95}
                        >
                          <animateMotion
                            dur={`${2.4 + (i % 3) * 0.7}s`}
                            begin={`${i * 0.45}s`}
                            repeatCount="indefinite"
                            path={geom.d}
                          />
                        </circle>
                      );
                    })}
                  </g>
                )}
                {/* property label along the arc (WebVOWL: rotated mid-arc label) */}
                {"mid" in geom && (e.label || e.inverseLabel) && (
                  <g pointerEvents="none">
                    {e.label && (
                      <text
                        x={geom.mid.x}
                        y={geom.mid.y - (e.inverseLabel ? 7 : -4)}
                        textAnchor="middle"
                        transform={`rotate(${geom.angle} ${geom.mid.x} ${geom.mid.y})`}
                        fill={color}
                        fontSize={12}
                        fontFamily={LABEL_FONT}
                        paintOrder="stroke"
                        stroke={theme.bg}
                        strokeWidth={4}
                        style={{ textTransform: "none" }}
                      >
                        {e.label}
                      </text>
                    )}
                    {e.inverseLabel && (
                      <text
                        x={geom.mid.x}
                        y={geom.mid.y + 14}
                        textAnchor="middle"
                        transform={`rotate(${geom.angle} ${geom.mid.x} ${geom.mid.y})`}
                        fill={color}
                        fontSize={12}
                        fontFamily={LABEL_FONT}
                        paintOrder="stroke"
                        stroke={theme.bg}
                        strokeWidth={4}
                        opacity={0.85}
                      >
                        {`« ${e.inverseLabel}`}
                      </text>
                    )}
                  </g>
                )}
                {"mid" in geom && !e.label && e.kind === "disjoint" && (
                  <text
                    x={geom.mid.x}
                    y={geom.mid.y - 6}
                    textAnchor="middle"
                    transform={`rotate(${geom.angle} ${geom.mid.x} ${geom.mid.y})`}
                    fill={color}
                    fontSize={11}
                    fontFamily={LABEL_FONT}
                    paintOrder="stroke"
                    stroke={theme.bg}
                    strokeWidth={4}
                    opacity={0.9}
                  >
                    {e.label ?? "Disjoint With"}
                  </text>
                )}
                {/* UML-style cardinalities near the ends */}
                {"p0" in geom && e.sourceCardinality && (
                  <text
                    x={bezier(0.14, geom.p0, geom.pc, geom.p2).x}
                    y={bezier(0.14, geom.p0, geom.pc, geom.p2).y}
                    textAnchor="middle"
                    fill={theme.text}
                    fontSize={10}
                    fontFamily={LABEL_FONT}
                    paintOrder="stroke"
                    stroke={theme.bg}
                    strokeWidth={4}
                  >
                    {e.sourceCardinality}
                  </text>
                )}
                {"p0" in geom && e.targetCardinality && (
                  <text
                    x={bezier(0.86, geom.p0, geom.pc, geom.p2).x}
                    y={bezier(0.86, geom.p0, geom.pc, geom.p2).y}
                    textAnchor="middle"
                    fill={theme.text}
                    fontSize={10}
                    fontFamily={LABEL_FONT}
                    paintOrder="stroke"
                    stroke={theme.bg}
                    strokeWidth={4}
                  >
                    {e.targetCardinality}
                  </text>
                )}
              </g>
            );
          })}

          {/* ── nodes ── */}
          {graph.simNodes.map((n) => {
            const color = nodeColor(n);
            const hit = searchHits.has(n.id);
            if (n.kind === "datatype") {
              const { w, h } = datatypeHalf(n.label);
              return (
                <g
                  key={n.id}
                  className="vowl-node"
                  transform={`translate(${n.x} ${n.y})`}
                  opacity={nodeOpacity(n.id)}
                  style={{ transition: "opacity .18s" }}
                  onMouseEnter={() => hoverNode(n.id)}
                  onMouseLeave={() => hoverNode(null)}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onSelect({ kind: "node", id: n.id });
                  }}
                >
                  {hit && (
                    <rect
                      className="search-ring"
                      x={-w / 2 - 7}
                      y={-h / 2 - 7}
                      width={w + 14}
                      height={h + 14}
                      fill="none"
                      stroke={theme.accent}
                      strokeWidth={1.5}
                    />
                  )}
                  <rect
                    x={-w / 2}
                    y={-h / 2}
                    width={w}
                    height={h}
                    rx={3}
                    fill={color}
                    fillOpacity={0.1}
                    stroke={color}
                    strokeWidth={1.8}
                    filter="url(#vowl-glow)"
                    cursor="pointer"
                  />
                  <text
                    y={4}
                    textAnchor="middle"
                    fill={color}
                    fontSize={12}
                    fontFamily={NODE_FONT}
                    pointerEvents="none"
                  >
                    {n.label}
                  </text>
                </g>
              );
            }
            const equiv = Boolean(n.equivalentLabel);
            return (
              <g
                key={n.id}
                className="vowl-node"
                transform={`translate(${n.x} ${n.y})`}
                opacity={nodeOpacity(n.id)}
                style={{ transition: "opacity .18s" }}
                onMouseEnter={() => hoverNode(n.id)}
                onMouseLeave={() => hoverNode(null)}
                onClick={(ev) => {
                  ev.stopPropagation();
                  onSelect({ kind: "node", id: n.id });
                }}
              >
                {hit && (
                  <circle
                    className="search-ring"
                    r={n.radius + 12}
                    fill="none"
                    stroke={theme.accent}
                    strokeWidth={1.6}
                    strokeDasharray="4 4"
                  />
                )}
                {equiv && (
                  <circle
                    r={n.radius + 6}
                    fill="none"
                    stroke={color}
                    strokeWidth={1.4}
                    strokeDasharray="7 5"
                    opacity={0.7}
                    pointerEvents="none"
                  />
                )}
                <circle
                  r={n.radius}
                  fill={color}
                  fillOpacity={0.13}
                  stroke={color}
                  strokeWidth={2.2}
                  strokeDasharray={n.kind === "deprecated" ? "8 5" : undefined}
                  filter="url(#vowl-glow)"
                  cursor="pointer"
                />
                {/* inner tick ring – cyberpunk dial */}
                <circle
                  r={n.radius - 7}
                  fill="none"
                  stroke={color}
                  strokeWidth={0.7}
                  strokeDasharray="1.5 7"
                  opacity={0.55}
                  pointerEvents="none"
                />
                {typeof n.individuals === "number" && (
                  <text
                    y={n.radius - 14}
                    textAnchor="middle"
                    fill={color}
                    fontSize={10}
                    opacity={0.85}
                    fontFamily={NODE_FONT}
                    pointerEvents="none"
                  >
                    {n.individuals === Number.MAX_SAFE_INTEGER ? "∞" : compact(n.individuals)}
                  </text>
                )}
                {/* class label below the circle (VOWL) */}
                <text
                  y={n.radius + 18}
                  textAnchor="middle"
                  fill={theme.text}
                  fontSize={13}
                  fontFamily={NODE_FONT}
                  paintOrder="stroke"
                  stroke={theme.bg}
                  strokeWidth={4}
                  pointerEvents="none"
                >
                  {n.label}
                </text>
                {n.kind === "external" && (
                  <text
                    y={n.radius + 31}
                    textAnchor="middle"
                    fill={theme.dim}
                    fontSize={9}
                    fontFamily={NODE_FONT}
                    pointerEvents="none"
                  >
                    external
                  </text>
                )}
                {n.kind === "deprecated" && (
                  <text
                    y={n.radius + 31}
                    textAnchor="middle"
                    fill={theme.dim}
                    fontSize={9}
                    fontFamily={NODE_FONT}
                    pointerEvents="none"
                  >
                    deprecated
                  </text>
                )}
                {equiv && (
                  <text
                    y={n.radius + (n.kind === "external" || n.kind === "deprecated" ? 44 : 31)}
                    textAnchor="middle"
                    fill={theme.dim}
                    fontSize={9}
                    fontFamily={NODE_FONT}
                    pointerEvents="none"
                  >
                    {`[ ${n.equivalentLabel} ]`}
                  </text>
                )}
              </g>
            );
          })}

          {/* selection ring rendered last (above nodes) */}
          {selected?.kind === "node" &&
            (() => {
              const n = graph.simNodes.find((x) => x.id === selected.id);
              if (!n) return null;
              const m = nodeHalf(n);
              return n.kind === "datatype" ? (
                <rect
                  x={n.x - m.w / 2 - 6}
                  y={n.y - m.h / 2 - 6}
                  width={m.w + 12}
                  height={m.h + 12}
                  rx={4}
                  fill="none"
                  stroke={theme.hover}
                  strokeWidth={1.4}
                  pointerEvents="none"
                />
              ) : (
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={n.radius + 10}
                  fill="none"
                  stroke={theme.hover}
                  strokeWidth={1.4}
                  filter="url(#vowl-glow-soft)"
                  pointerEvents="none"
                />
              );
            })()}
        </g>
      </svg>
    </div>
  );
});

export default VowlGraph;
