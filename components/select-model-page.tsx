"use client";

import { useState, useRef } from 'react';
import { useMap } from '@/lib/map-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GenerationParamsDialog } from '@/components/generation-params-dialog';
import type { GenerationParams } from '@/lib/types';

export function SelectModelPage() {
  const { generateRandomMap, createEmptyMap, loadMapFromSeed } = useMap();
  const [seedInput, setSeedInput] = useState('');
  const [seedError, setSeedError] = useState('');
  const [fileError, setFileError] = useState('');
  const [showParamsDialog, setShowParamsDialog] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleGenerate() {
    const trimmed = seedInput.trim();
    setSeedError('');
    if (trimmed) {
      const ok = loadMapFromSeed(trimmed);
      if (!ok) setSeedError('Code invalide. Entrez un code M2. (seed exporté) ou un seed hex (ex: A7F3B291) pour une génération procédurale.');
    } else {
      // Blank → open params dialog
      setShowParamsDialog(true);
    }
  }

  function handleParamsGenerate(params: GenerationParams) {
    setShowParamsDialog(false);
    generateRandomMap(undefined, params);
  }

  function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError('');
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['geojson', 'json', 'csv'].includes(ext ?? '')) {
      setFileError('Unsupported format. Expected .geojson, .json or .csv');
      return;
    }
    setFileError('Geographic import is not yet implemented.');
  }

  return (
    <>
    <div className="flex flex-col items-center justify-center flex-1 p-8">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-foreground mb-4">Map Visualization Tool</h1>
        <p className="text-lg text-muted-foreground max-w-2xl">
          Generate, create, or import maps to visualize and optimize routes.
        </p>
      </div>

      {/* ── Solver Mode Toggle removed — engine auto-detected at runtime ── */}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full">

        {/* Generate Map */}
        <Card className="hover:shadow-lg transition-shadow group">
          <CardHeader>
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
              <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <CardTitle>Generate Map</CardTitle>
            <CardDescription>
              Randomly generate a fully connected graph. Paste an export seed (M2.xxx) to reproduce an exact map, or enter a hex seed for deterministic generation, or leave blank for a new random one.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Input
              placeholder="Seed M2. ou hex (optionnel)"
              value={seedInput}
              onChange={e => { setSeedInput(e.target.value); setSeedError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleGenerate()}
            />
            {seedError && <p className="text-xs text-destructive">{seedError}</p>}
            <Button onClick={handleGenerate} className="w-full">
              Generate
            </Button>
          </CardContent>
        </Card>

        {/* Create Map */}
        <Card className="hover:shadow-lg transition-shadow group">
          <CardHeader>
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
              <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <CardTitle>Create Map</CardTitle>
            <CardDescription>
              Start with a blank canvas and manually add nodes and connections.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={createEmptyMap} variant="secondary" className="w-full">
              Empty Canvas
            </Button>
          </CardContent>
        </Card>

        {/* Load Map */}
        <Card className="hover:shadow-lg transition-shadow group">
          <CardHeader>
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
              <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </div>
            <CardTitle>Load Map</CardTitle>
            <CardDescription>
              <span className="block">Import a geographic file — the algorithm will reconstruct the graph automatically.</span>
              <span className="block font-semibold mt-2">File requirements:</span>
              <span className="block mt-1">
                <span className="font-mono text-xs">GeoJSON (.geojson / .json)</span>
                {" — "}FeatureCollection with <code className="text-xs">Point</code> features (nodes, must include a <code className="text-xs">name</code> property) and <code className="text-xs">LineString</code> features (edges).
              </span>
              <span className="block mt-1">
                <span className="font-mono text-xs">CSV (.csv)</span>
                {" — "}columns: <code className="text-xs">id, name, lat, lon, connections</code> where <code className="text-xs">connections</code> is a semicolon-separated list of target node IDs.
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".geojson,.json,.csv"
              className="hidden"
              onChange={handleFileImport}
            />
            {fileError && <p className="text-xs text-destructive">{fileError}</p>}
            <Button
              onClick={() => fileRef.current?.click()}
              variant="outline"
              className="w-full"
            >
              Browse File
            </Button>
          </CardContent>
        </Card>

      </div>
    </div>

    {showParamsDialog && (
      <GenerationParamsDialog
        onGenerate={handleParamsGenerate}
        onClose={() => setShowParamsDialog(false)}
      />
    )}
    </>
  );
}
