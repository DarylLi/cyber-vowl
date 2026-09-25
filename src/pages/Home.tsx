import { useEffect, useMemo, useRef, useState } from "react";
import "../App.css";
import VowlGraph, {
  type Filters,
  type SelectionInfo,
  type VowlGraphHandle,
} from "../components/VowlGraph";
import Hud, { type ImportMsg } from "../components/Hud";
import Details from "../components/Details";
import { edges, nodes, ontology } from "../data/nexus";
import foafJson from "../data/foaf.json";
import { parseOntologyFile, type GraphData } from "../lib/ontology";
import { THEMES } from "../lib/vowl";

const TICKER =
  "NEXUS://CITY KNOWLEDGE GRAPH ONLINE ▚ VOWL 2 NOTATION // CYBERPUNK SKIN ▚ HOVER TO TRACE CONNECTIONS · CLICK TO LOCK SELECTION ▚ IMPORT .json / .ttl / .nt / .rdf ONTOLOGIES FROM THE LEFT PANEL ▚ MEGACORP WATCH: ARASAKA-TOWER SIGNAL INTERCEPTED ▚ NEURAL TRAFFIC +12.7% ▚ ";

const DEFAULT_DATA: GraphData = { nodes, edges, meta: ontology };

export default function Home() {
  const graphRef = useRef<VowlGraphHandle>(null);
  const [themeId, setThemeId] = useState(THEMES[0].id);
  const [graphData, setGraphData] = useState<GraphData>(DEFAULT_DATA);
  const [importMsg, setImportMsg] = useState<ImportMsg | null>(null);
  const [filters, setFilters] = useState<Filters>({
    datatype: true,
    disjoint: true,
    subclass: true,
    external: true,
    pulses: true,
  });
  const [gravity, setGravity] = useState(35);
  const [paused, setPaused] = useState(false);
  const [search, setSearch] = useState("");
  const [hover, setHover] = useState<SelectionInfo | null>(null);
  const [selected, setSelected] = useState<SelectionInfo | null>(null);

  const theme = THEMES.find((t) => t.id === themeId) ?? THEMES[0];

  const stats = useMemo(
    () => ({
      classes: graphData.nodes.filter((n) => n.kind !== "datatype").length,
      objProps: graphData.edges.filter((e) => e.kind === "object").length,
      dtProps: graphData.edges.filter((e) => e.kind === "datatype").length,
    }),
    [graphData]
  );

  const toggleFilter = (key: keyof Filters) =>
    setFilters((f) => ({ ...f, [key]: !f[key] }));

  const handleImport = (fileName: string, text: string) => {
    try {
      const parsed = parseOntologyFile(fileName, text);
      setGraphData(parsed);
      setSelected(null);
      setHover(null);
      setImportMsg({
        ok: true,
        text: `${fileName} — ${parsed.nodes.length} nodes / ${parsed.edges.length} edges loaded`,
      });
    } catch (e) {
      setImportMsg({
        ok: false,
        text: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const handleReset = () => {
    setGraphData(DEFAULT_DATA);
    setSelected(null);
    setHover(null);
    setImportMsg(null);
    graphRef.current?.reheat();
  };

  const handleLoadSample = () => {
    handleImport("foaf.json (bundled sample)", JSON.stringify(foafJson));
  };

  return (
    <div
      className="cyber-app relative flex h-screen w-screen flex-col overflow-hidden"
      style={{
        background: theme.bg,
        color: theme.text,
        ["--acc" as string]: theme.accent,
        ["--klass" as string]: theme.klass,
      }}
    >
      {/* background layers */}
      <div className="bg-grid" style={{ backgroundImage: `linear-gradient(${theme.grid} 1px, transparent 1px), linear-gradient(90deg, ${theme.grid} 1px, transparent 1px)` }} />
      <div className="bg-vignette" />
      <div className="bg-scanlines" />
      <div className="bg-sweep" style={{ background: `radial-gradient(600px 400px at 20% 0%, ${theme.klass}14, transparent 70%)` }} />

      {/* ── header ── */}
      <header className="relative z-10 flex h-[52px] shrink-0 items-center justify-between border-b px-4"
        style={{ borderColor: `${theme.klass}33`, background: `${theme.bg}cc` }}
      >
        <div className="flex items-center gap-3">
          <span className="font-[Orbitron] text-[17px] font-bold tracking-[0.25em] neon-text" style={{ color: theme.klass }}>
            CYBER<span style={{ color: theme.accent }}>//</span>VOWL
          </span>
          <span className="hidden rounded-sm border px-2 py-[2px] text-[9px] tracking-[0.3em] md:inline-block"
            style={{ borderColor: `${theme.accent}66`, color: theme.accent }}
          >
            NEON ONTOLOGY VIEWER
          </span>
        </div>
        <div className="flex items-center gap-4 text-[10px] tracking-[0.25em]" style={{ color: theme.dim }}>
          <span className="hidden sm:inline">SKIN: VOWL-2</span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-[7px] w-[7px] animate-pulse rounded-full" style={{ background: theme.dtLabel, boxShadow: `0 0 8px ${theme.dtLabel}` }} />
            SYS.ONLINE
          </span>
          <Clock />
        </div>
      </header>

      {/* ── main ── */}
      <main className="relative z-10 flex min-h-0 flex-1">
        <Hud
          theme={theme}
          onTheme={setThemeId}
          filters={filters}
          onToggleFilter={toggleFilter}
          gravity={gravity}
          onGravity={setGravity}
          paused={paused}
          onPaused={setPaused}
          search={search}
          onSearch={setSearch}
          onImportText={handleImport}
          importMsg={importMsg}
          onReset={handleReset}
          onLoadSample={handleLoadSample}
          onFit={() => graphRef.current?.fitView()}
          onReheat={() => graphRef.current?.reheat()}
          onExport={() => graphRef.current?.exportSvg()}
          stats={stats}
        />

        {/* graph canvas with HUD chrome */}
        <div className="relative min-w-0 flex-1">
          <VowlGraph
            ref={graphRef}
            theme={theme}
            data={graphData}
            filters={filters}
            gravity={gravity}
            paused={paused}
            search={search}
            selected={selected}
            onHover={setHover}
            onSelect={setSelected}
          />
          {/* corner brackets */}
          <div className="pointer-events-none absolute inset-3">
            <span className="corner corner-tl" style={{ borderColor: theme.klass }} />
            <span className="corner corner-tr" style={{ borderColor: theme.klass }} />
            <span className="corner corner-bl" style={{ borderColor: theme.klass }} />
            <span className="corner corner-br" style={{ borderColor: theme.klass }} />
          </div>

          {/* bottom-left zoom cluster */}
          <div className="absolute bottom-4 left-4 flex gap-2">
            <button className="hud-btn" style={{ ["--acc" as string]: theme.klass }} onClick={() => graphRef.current?.zoomIn()}>＋</button>
            <button className="hud-btn" style={{ ["--acc" as string]: theme.klass }} onClick={() => graphRef.current?.zoomOut()}>－</button>
            <button className="hud-btn" style={{ ["--acc" as string]: theme.klass }} onClick={() => graphRef.current?.fitView()}>⌂ FIT</button>
          </div>

          {/* bottom-right status */}
          <div className="absolute bottom-4 right-4 text-right text-[9px] tracking-[0.3em]" style={{ color: theme.dim }}>
            <div>DRAG NODES // SCROLL TO ZOOM</div>
            <div style={{ color: theme.accent }}>{paused ? "PHYSICS: SUSPENDED" : "PHYSICS: ACTIVE"}</div>
          </div>
        </div>

        <Details data={graphData} hover={hover} selected={selected} theme={theme} />
      </main>

      {/* ── ticker ── */}
      <footer className="relative z-10 h-[26px] shrink-0 overflow-hidden border-t" style={{ borderColor: `${theme.klass}33`, background: `${theme.bg}dd` }}>
        <div className="ticker-track font-[Share_Tech_Mono] text-[11px] leading-[26px] tracking-[0.2em]" style={{ color: theme.dim }}>
          {TICKER}
          {TICKER}
        </div>
      </footer>
    </div>
  );
}

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <span className="font-[Share_Tech_Mono]">
      {pad(now.getHours())}:{pad(now.getMinutes())}:{pad(now.getSeconds())}
    </span>
  );
}
