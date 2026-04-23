"use client";

import { MapProvider, useMap } from '@/lib/map-context';
import { NavigationBreadcrumb } from '@/components/navigation-breadcrumb';
import { SelectModelPage } from '@/components/select-model-page';
import { MapEditorPage } from '@/components/map-editor-page';
import { ObjectivesPage } from '@/components/objectives-page';
import { SimulationPage } from '@/components/simulation-page';
import { ResultsPage } from '@/components/results-page';

function AppContent() {
  const { currentStep } = useMap();

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-background">
      <NavigationBreadcrumb />
      
      {currentStep === 'select-model' && <SelectModelPage />}
      {currentStep === 'map-editor' && <MapEditorPage />}
      {currentStep === 'objectives' && <ObjectivesPage />}
      {currentStep === 'simulation' && <SimulationPage />}
      {currentStep === 'results' && <ResultsPage />}
    </div>
  );
}

export default function Home() {
  return (
    <MapProvider>
      <AppContent />
    </MapProvider>
  );
}
