"use client";

import { useMap } from '@/lib/map-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, AlertCircle, Clock, Route, Fuel, Package, MapPin, Flag, ChevronRight } from 'lucide-react';
import type { VehicleRoute } from '@/lib/types';

function StatBox({ label, value, unit, highlight }: { label: string; value: string | number; unit: string; highlight?: boolean }) {
  return (
    <div className={`p-3 rounded-lg border text-center ${highlight ? 'border-primary bg-primary/5' : 'border-border bg-muted/30'}`}>
      <p className={`text-2xl font-bold tabular-nums ${highlight ? 'text-primary' : ''}`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{unit}</p>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
    </div>
  );
}

function ConstraintCheck({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div className={`flex items-center gap-2 text-sm ${ok ? 'text-green-600' : 'text-destructive'}`}>
      {ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
      <span>{text}</span>
    </div>
  );
}

function RouteFlow({ route, mapData }: { route: string[]; mapData: NonNullable<ReturnType<typeof useMap>['mapData']> }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {route.map((id, i) => {
        const node = mapData.nodes.find(n => n.id === id);
        const isFirst = i === 0, isLast = i === route.length - 1;
        return (
          <div key={`${id}-${i}`} className="flex items-center gap-1">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/60 border border-border">
              {isFirst && <MapPin className="h-3 w-3 text-green-500 shrink-0" />}
              {isLast && !isFirst && <Flag className="h-3 w-3 text-red-500 shrink-0" />}
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: node?.color }} />
              <span className="text-xs font-medium">{node?.name ?? id}</span>
            </div>
            {i < route.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
          </div>
        );
      })}
    </div>
  );
}

export function ResultsPage() {
  const { mapData, objectives, vehicles, simulationResults, setCurrentStep, setSimulationResults, setObjectives } = useMap();

  if (!mapData || !objectives || !simulationResults.length) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">No simulation results available</p>
          <Button onClick={() => setCurrentStep('objectives')}>Go to Objectives</Button>
        </div>
      </div>
    );
  }

  const result = simulationResults[0];
  const { vehicleRoutes, totalTime, totalDistance, fuelUsed, feasible, constraintBreaches, optimizeScore } = result;

  const unit = objectives.optimizeFor === 'time' ? 'min' : objectives.optimizeFor === 'fuel' ? 'L' : 'km';
  const scoreLabel = objectives.optimizeFor === 'time' ? 'Total time' : objectives.optimizeFor === 'fuel' ? 'Fuel used' : 'Total distance';
  const optimizeLabel = objectives.optimizeFor === 'time' ? 'Minimize Time' : objectives.optimizeFor === 'fuel' ? 'Minimize Fuel' : 'Minimize Distance';

  const hasTimeLimit = objectives.maxTime !== null;
  const hasDistLimit = objectives.maxDistance !== null;
  const hasCargo = objectives.totalUnits > 0;

  const timeMet = !hasTimeLimit || vehicleRoutes.every(r => r.totalTime <= (objectives.maxTime ?? Infinity));
  const distMet = !hasDistLimit || vehicleRoutes.every(r => r.totalDistance <= (objectives.maxDistance ?? Infinity));
  const cargoMet = !hasCargo || vehicleRoutes.every(r => r.unitsCarried <= r.feasible || !r.constraintBreaches.some(b => b.includes('Load')));

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold mb-1">Simulation Results</h1>
            <p className="text-muted-foreground text-sm">
              {vehicleRoutes.length} vehicle{vehicleRoutes.length !== 1 ? 's' : ''} · {objectives.citiesToVisit.length} cities · optimised for {objectives.optimizeFor}
            </p>
          </div>
          <Badge
            variant={feasible ? 'default' : 'destructive'}
            className={`text-base px-4 py-2 ${feasible ? 'bg-green-600 hover:bg-green-600' : ''}`}
          >
            {feasible ? '✓ All constraints met' : `⚠ ${constraintBreaches.length} violation${constraintBreaches.length !== 1 ? 's' : ''}`}
          </Badge>
        </div>

        {/* ── Overview stats ─────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Overview</CardTitle>
            <CardDescription>Aggregated across all vehicles</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatBox label="Max trip time" value={totalTime} unit="minutes" highlight={objectives.optimizeFor === 'time'} />
              <StatBox label="Total distance" value={totalDistance} unit="km" highlight={objectives.optimizeFor === 'distance'} />
              <StatBox label="Total fuel" value={fuelUsed} unit="litres" highlight={objectives.optimizeFor === 'fuel'} />
              <StatBox label={scoreLabel} value={optimizeScore} unit={unit} highlight />
            </div>

            {/* Objective achievement */}
            <div className={`mt-4 p-3 rounded-lg border flex items-center gap-3 ${feasible ? 'border-green-500/40 bg-green-500/5' : 'border-amber-500/40 bg-amber-500/5'}`}>
              {feasible
                ? <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                : <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />}
              <div>
                <p className="text-sm font-semibold">
                  Objective: <span className="text-primary">{optimizeLabel}</span>
                  {feasible ? ' — achieved' : ' — achieved with violations'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Score: {optimizeScore} {unit} across {vehicleRoutes.length} vehicle{vehicleRoutes.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Constraint summary ─────────────────────────────── */}
        {(hasTimeLimit || hasDistLimit || hasCargo) && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Constraint Checks</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {hasTimeLimit && (
                <ConstraintCheck
                  ok={timeMet}
                  text={timeMet
                    ? `Time limit: all vehicles within ${objectives.maxTime} min (max: ${Math.max(...vehicleRoutes.map(r => r.totalTime)).toFixed(1)} min)`
                    : `Time limit exceeded: ${vehicleRoutes.filter(r => r.totalTime > (objectives.maxTime ?? 0)).map(r => `${r.vehicleName} ${r.totalTime.toFixed(1)} min`).join(', ')} > ${objectives.maxTime} min → Impossible`}
                />
              )}
              {hasDistLimit && (
                <ConstraintCheck
                  ok={distMet}
                  text={distMet
                    ? `Distance limit: all vehicles within ${objectives.maxDistance} km`
                    : `Distance limit exceeded: ${vehicleRoutes.filter(r => r.totalDistance > (objectives.maxDistance ?? 0)).map(r => `${r.vehicleName} ${r.totalDistance.toFixed(1)} km`).join(', ')} > ${objectives.maxDistance} km`}
                />
              )}
              {hasCargo && vehicleRoutes.map(r => {
                const breach = r.constraintBreaches.find(b => b.includes('Load'));
                const v = vehicles.find(v => v.id === r.vehicleId);
                return (
                  <ConstraintCheck
                    key={r.vehicleId + r.instanceIndex}
                    ok={!breach}
                    text={breach
                      ? `${r.vehicleName}: ${breach}`
                      : `${r.vehicleName}: load ${r.unitsCarried} / ${v?.transportCapacity ?? '?'} units ✓`}
                  />
                );
              })}
              {!hasTimeLimit && !hasDistLimit && !hasCargo && (
                <p className="text-sm text-muted-foreground">No constraints defined.</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Per-vehicle routes ─────────────────────────────── */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Vehicle Routes</h2>
          {vehicleRoutes.map((vr: VehicleRoute) => (
            <Card key={`${vr.vehicleId}-${vr.instanceIndex}`} className={`border-l-4`} style={{ borderLeftColor: vr.color }}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: vr.color }} />
                  <CardTitle className="text-base">{vr.vehicleName}</CardTitle>
                  {vr.feasible
                    ? <Badge variant="default" className="bg-green-600 hover:bg-green-600 text-xs ml-auto">OK</Badge>
                    : <Badge variant="destructive" className="text-xs ml-auto">{vr.constraintBreaches.length} violation{vr.constraintBreaches.length !== 1 ? 's' : ''}</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Route */}
                <RouteFlow route={vr.route} mapData={mapData} />

                {/* Stats row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="flex items-center gap-1.5 text-xs">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Time:</span>
                    <span className={`font-semibold ${hasTimeLimit && vr.totalTime > (objectives.maxTime ?? Infinity) ? 'text-destructive' : ''}`}>
                      {vr.totalTime.toFixed(1)} min
                    </span>
                    {hasTimeLimit && <span className="text-muted-foreground">/ {objectives.maxTime}</span>}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <Route className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Dist:</span>
                    <span className={`font-semibold ${hasDistLimit && vr.totalDistance > (objectives.maxDistance ?? Infinity) ? 'text-destructive' : ''}`}>
                      {vr.totalDistance.toFixed(1)} km
                    </span>
                    {hasDistLimit && <span className="text-muted-foreground">/ {objectives.maxDistance}</span>}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <Fuel className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Fuel:</span>
                    <span className="font-semibold">{vr.fuelUsed.toFixed(1)} L</span>
                  </div>
                  {hasCargo && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <Package className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Load:</span>
                      <span className={`font-semibold ${vr.constraintBreaches.some(b => b.includes('Load')) ? 'text-destructive' : ''}`}>
                        {vr.unitsCarried} units
                      </span>
                    </div>
                  )}
                </div>

                {/* Constraint breaches */}
                {vr.constraintBreaches.length > 0 && (
                  <div className="space-y-1">
                    {vr.constraintBreaches.map((b, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-destructive">
                        <XCircle className="h-3.5 w-3.5 shrink-0" />
                        <span>{b}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── Impossible message ─────────────────────────────── */}
        {!feasible && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-destructive">Solution infeasible under current constraints</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    No configuration of the selected vehicles can satisfy all constraints simultaneously.
                    Try relaxing the time limit, distance limit, or reducing the number of cities.
                  </p>
                  <ul className="mt-2 space-y-1">
                    {constraintBreaches.map((b, i) => (
                      <li key={i} className="text-xs text-destructive">• {b}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Actions ────────────────────────────────────────── */}
        <div className="flex justify-between pt-2 flex-wrap gap-3">
          <Button variant="outline" onClick={() => setCurrentStep('objectives')}>Modify Objectives</Button>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setCurrentStep('map-editor')}>Edit Map</Button>
            <Button onClick={() => { setSimulationResults([]); setObjectives(null); setCurrentStep('select-model'); }}>
              New Project
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
