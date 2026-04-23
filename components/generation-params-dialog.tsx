"use client";

import { useState } from 'react';
import type { GenerationParams } from '@/lib/types';
import { SPEED_VALUES } from '@/lib/map-context';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { X } from 'lucide-react';

const DEFAULTS: GenerationParams = {
  nodeCount: 30,
  edgeDensity: 1.8,
  maxSegmentsPerEdge: 3,
  trafficMean: 0.22,
  trafficVariation: 0.10,
  speedMin: 30,
  speedMax: 110,
  subnodeDensity: 0.12,
};

interface Props {
  onGenerate: (params: GenerationParams) => void;
  onClose: () => void;
}

function fmt(v: number, decimals = 0) {
  return v.toFixed(decimals);
}

function Row({
  label,
  hint,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium">{label}</Label>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <span className="text-sm font-mono tabular-nums w-16 text-right">{display}</span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        className="w-full"
      />
    </div>
  );
}

export function GenerationParamsDialog({ onGenerate, onClose }: Props) {
  const [p, setP] = useState<GenerationParams>({ ...DEFAULTS });

  const set = <K extends keyof GenerationParams>(key: K, value: GenerationParams[K]) =>
    setP(prev => ({ ...prev, [key]: value }));

  function handleReset() {
    setP({ ...DEFAULTS });
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-lg mx-4 bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold">Generation Parameters</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Configure the random map generation</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">

          {/* Structure */}
          <section className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Structure</h3>

            <Row
              label="Nodes"
              hint="Number of main city nodes"
              value={p.nodeCount}
              min={5} max={80} step={1}
              display={String(Math.round(p.nodeCount))}
              onChange={v => set('nodeCount', v)}
            />

            <Row
              label="Edge density"
              hint="Average connections per node"
              value={p.edgeDensity}
              min={1.0} max={3.5} step={0.1}
              display={fmt(p.edgeDensity, 1) + '×'}
              onChange={v => set('edgeDensity', v)}
            />

            <Row
              label="Subnode density"
              hint="Junction subnodes relative to node count"
              value={p.subnodeDensity}
              min={0} max={0.5} step={0.01}
              display={Math.round(p.subnodeDensity * 100) + '%'}
              onChange={v => set('subnodeDensity', v)}
            />

            <Row
              label="Segments per edge"
              hint="Max road segments per edge (1 = single straight segment)"
              value={p.maxSegmentsPerEdge}
              min={1} max={10} step={1}
              display={String(Math.round(p.maxSegmentsPerEdge))}
              onChange={v => set('maxSegmentsPerEdge', v)}
            />
          </section>

          <Separator />

          {/* Traffic */}
          <section className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Traffic</h3>

            <Row
              label="Average traffic"
              hint="Mean traffic load across all segments (0 = free flow, 1 = congested)"
              value={p.trafficMean}
              min={0} max={1} step={0.01}
              display={Math.round(p.trafficMean * 100) + '%'}
              onChange={v => set('trafficMean', v)}
            />

            <Row
              label="Traffic variation"
              hint="Spread around the mean (±)"
              value={p.trafficVariation}
              min={0} max={0.5} step={0.01}
              display={'±' + Math.round(p.trafficVariation * 100) + '%'}
              onChange={v => set('trafficVariation', Math.min(v, Math.min(p.trafficMean, 1 - p.trafficMean)))}
            />
          </section>

          <Separator />

          {/* Speed */}
          <section className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Speed</h3>
            <p className="text-xs text-muted-foreground -mt-2">
              Road segments are assigned one of the fixed speed classes below. Set the allowed range.
            </p>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Minimum speed</Label>
                <span className="text-sm font-mono tabular-nums">{p.speedMin} km/h</span>
              </div>
              <div className="flex gap-1 flex-wrap">
                {SPEED_VALUES.map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => set('speedMin', Math.min(v, p.speedMax))}
                    className={`px-2.5 py-1 rounded text-xs font-mono border transition-colors ${
                      v === p.speedMin
                        ? 'bg-primary text-primary-foreground border-primary'
                        : v <= p.speedMax
                        ? 'bg-background border-border hover:border-primary/50'
                        : 'bg-muted/40 border-border text-muted-foreground opacity-50'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Maximum speed</Label>
                <span className="text-sm font-mono tabular-nums">{p.speedMax} km/h</span>
              </div>
              <div className="flex gap-1 flex-wrap">
                {SPEED_VALUES.map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => set('speedMax', Math.max(v, p.speedMin))}
                    className={`px-2.5 py-1 rounded text-xs font-mono border transition-colors ${
                      v === p.speedMax
                        ? 'bg-primary text-primary-foreground border-primary'
                        : v >= p.speedMin
                        ? 'bg-background border-border hover:border-primary/50'
                        : 'bg-muted/40 border-border text-muted-foreground opacity-50'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </section>
        </div>

        {/* Preview chips */}
        <div className="px-6 py-3 border-t border-border bg-muted/30 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="bg-background border rounded-full px-2.5 py-0.5">
            ~{Math.round(p.nodeCount)} nodes
          </span>
          <span className="bg-background border rounded-full px-2.5 py-0.5">
            ~{Math.round(p.nodeCount * p.edgeDensity)} edges
          </span>
          <span className="bg-background border rounded-full px-2.5 py-0.5">
            ~{Math.round(p.nodeCount * p.subnodeDensity)} junctions
          </span>
          <span className="bg-background border rounded-full px-2.5 py-0.5">
            {Math.round(p.trafficMean * 100)}% avg traffic
          </span>
          <span className="bg-background border rounded-full px-2.5 py-0.5">
            {p.speedMin}–{p.speedMax} km/h
          </span>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-6 py-4 border-t border-border">
          <Button variant="ghost" size="sm" onClick={handleReset} className="text-muted-foreground">
            Reset defaults
          </Button>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => onGenerate(p)}>
            Generate
          </Button>
        </div>
      </div>
    </div>
  );
}
