"use client";

import { MapCanvas } from './map-canvas';
import { EditorPanel } from './editor-panel';

export function MapEditorPage() {
  return (
    <div className="flex flex-1 min-h-0">
      <MapCanvas />
      <EditorPanel />
    </div>
  );
}
