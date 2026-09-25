import { useRef, useState } from "react";
import type { Filters } from "./VowlGraph";
import { THEMES, type Theme } from "../lib/vowl";

export interface ImportMsg {
  ok: boolean;
  text: string;
}

interface HudProps {
  theme: Theme;
  onTheme: (id: string) => void;
  filters: Filters;
  onToggleFilter: (key: keyof Filters) => void;
  gravity: number;
  onGravity: (v: number) => void;
  paused: boolean;
  onPaused: (v: boolean) => void;
  search: string;
  onSearch: (v: string) => void;
  onImportText: (fileName: string, text: string) => void;
  importMsg: ImportMsg | null;
  onReset: () => void;
  onLoadSample: () => void;
  onFit: () => void;
  onReheat: () => void;
  onExport: () => void;
  stats: { classes: number; objProps: number; dtProps: number };
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="hud-section-title">
      <span className="text-[theme.accent]" style={{ color: "inherit" }}>
        ▸
      </span>{" "}
      {children}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  accent,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  accent: string;
}) {
  return (
    <button
      className="flex w-full items-center justify-between py-[5px] text-left"
      onClick={onChange}
    >
      <span className="hud-label">{label}</span>
      <span
        className="hud-toggle"
        style={
          checked
            ? { borderColor: accent, boxShadow: `0 0 8px ${accent}66` }
            : undefined
        }
      >
        <span
          className="hud-toggle-knob"
          style={
            checked
              ? { transform: "translateX(14px)", background: accent, boxShadow: `0 0 8px ${accent}` }
              : undefined
          }
        />
      </span>
    </button>
  );
}

export default function Hud(p: HudProps) {
  const t = p.theme;
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const text = await file.text();
    p.onImportText(file.name, text);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <aside className="hud-panel flex w-[264px] shrink-0 flex-col gap-4 overflow-y-auto">
      {/* SEARCH */}
      <section>
        <SectionTitle>TARGET SEARCH</SectionTitle>
        <div className="relative">
          <input
            className="hud-input w-full"
            placeholder="search nodes…"
            value={p.search}
            onChange={(e) => p.onSearch(e.target.value)}
            spellCheck={false}
          />
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] opacity-60">
            ⌕
          </span>
        </div>
      </section>

      {/* MODE */}
      <section>
        <SectionTitle>COLOR MODE</SectionTitle>
        <div className="flex flex-col gap-1">
          {THEMES.map((th) => (
            <button
              key={th.id}
              className={`hud-chip ${th.id === t.id ? "hud-chip-active" : ""}`}
              style={
                th.id === t.id
                  ? { borderColor: th.accent, color: th.accent, boxShadow: `0 0 12px ${th.accent}55, inset 0 0 12px ${th.accent}22` }
                  : undefined
              }
              onClick={() => p.onTheme(th.id)}
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: th.klass, boxShadow: `0 0 6px ${th.klass}` }}
              />
              {th.name}
            </button>
          ))}
        </div>
      </section>

      {/* FILTER */}
      <section>
        <SectionTitle>FILTERS</SectionTitle>
        <Toggle label="datatype properties" checked={p.filters.datatype} onChange={() => p.onToggleFilter("datatype")} accent={t.dtLabel} />
        <Toggle label="disjoint classes" checked={p.filters.disjoint} onChange={() => p.onToggleFilter("disjoint")} accent={t.disjoint} />
        <Toggle label="subclass links" checked={p.filters.subclass} onChange={() => p.onToggleFilter("subclass")} accent={t.subclass} />
        <Toggle label="external classes" checked={p.filters.external} onChange={() => p.onToggleFilter("external")} accent={t.external} />
        <Toggle label="data streams" checked={p.filters.pulses} onChange={() => p.onToggleFilter("pulses")} accent={t.accent} />
      </section>

      {/* PHYSICS */}
      <section>
        <SectionTitle>PHYSICS</SectionTitle>
        <div className="mb-1 flex items-center justify-between">
          <span className="hud-label">gravity</span>
          <span className="hud-value">{p.gravity}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={p.gravity}
          onChange={(e) => p.onGravity(Number(e.target.value))}
          className="hud-range w-full"
          style={{ ["--acc" as string]: t.klass }}
        />
        <div className="mt-2 flex gap-2">
          <button
            className="hud-btn flex-1"
            style={{ ["--acc" as string]: t.accent }}
            onClick={() => p.onPaused(!p.paused)}
          >
            {p.paused ? "▶ RESUME" : "⏸ PAUSE"}
          </button>
          <button
            className="hud-btn flex-1"
            style={{ ["--acc" as string]: t.klass}}
            onClick={p.onReheat}
          >
            ↻ REHEAT
          </button>
        </div>
      </section>

      {/* IMPORT */}
      <section>
        <SectionTitle>IMPORT ONTOLOGY</SectionTitle>
        <div
          className={`hud-dropzone ${dragOver ? "hud-dropzone-active" : ""}`}
          style={{ ["--acc" as string]: t.klass }}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void handleFiles(e.dataTransfer.files);
          }}
        >
          <input
            ref={fileRef}
            type="file"
            hidden
            accept=".json,.ttl,.n3,.nt,.rdf,.owl,.xml,.txt"
            onChange={(e) => void handleFiles(e.target.files)}
          />
          <div className="text-[13px] tracking-[0.2em]">⇪ DROP FILE / CLICK</div>
          <div className="mt-1 text-[9px] tracking-wider opacity-55">
            WebVOWL .json · Turtle .ttl · N-Triples .nt · RDF/XML .rdf/.owl
          </div>
        </div>
        {p.importMsg && (
          <div className={`mt-2 text-[10px] leading-snug ${p.importMsg.ok ? "hud-msg-ok" : "hud-msg-err"}`}>
            {p.importMsg.ok ? "✓ " : "✕ "}
            {p.importMsg.text}
          </div>
        )}
        <div className="mt-2 flex gap-2">
          <button
            className="hud-btn flex-1"
            style={{ ["--acc" as string]: t.klass }}
            onClick={p.onLoadSample}
          >
            ⇪ FOAF SAMPLE
          </button>
          <button
            className="hud-btn flex-1"
            style={{ ["--acc" as string]: t.dim }}
            onClick={p.onReset}
          >
            ⟲ DEFAULT
          </button>
        </div>
      </section>

      {/* EXPORT */}
      <section>
        <SectionTitle>EXPORT</SectionTitle>
        <button className="hud-btn w-full" style={{ ["--acc" as string]: t.dtLabel }} onClick={p.onExport}>
          ⬇ DOWNLOAD SVG
        </button>
      </section>

      {/* STATS */}
      <section className="mt-auto">
        <SectionTitle>TELEMETRY</SectionTitle>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            [p.stats.classes, "CLASSES"],
            [p.stats.objProps, "OBJ PROP"],
            [p.stats.dtProps, "DT PROP"],
          ].map(([v, l]) => (
            <div key={l as string} className="hud-stat">
              <div className="hud-stat-num" style={{ color: t.klass }}>
                {v}
              </div>
              <div className="hud-stat-label">{l}</div>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}
