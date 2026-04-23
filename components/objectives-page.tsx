"use client";

import { useState, useRef, useEffect } from 'react';
import { useMap } from '@/lib/map-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumericInput } from '@/components/ui/numeric-input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { GripVertical, MapPin, Flag, X, Plus, Minus, Trash2, Car, Clock, Route, Package, Home } from 'lucide-react';
import type { Objective, Vehicle } from '@/lib/types';


// -- Add vehicle dialog
const VEHICLE_BLANK = { name: '', color: '#6366F1', speedMax: 120, fuelCapacity: 50, transportCapacity: 4 };

function AddVehicleDialog({ onAdd, onClose }: { onAdd: (v: Vehicle) => void; onClose: () => void }) {
  const [form, setForm] = useState({ ...VEHICLE_BLANK });
  const [error, setError] = useState('');

  function handleSubmit() {
    if (!form.name.trim()) { setError('Name is required.'); return; }
    if (form.speedMax <= 0 || form.fuelCapacity <= 0 || form.transportCapacity <= 0) {
      setError('Speed, fuel and capacity must be > 0.');
      return;
    }
    onAdd({
      id: `v-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: form.name.trim(),
      color: form.color,
      speedMax: form.speedMax,
      fuelCapacity: form.fuelCapacity,
      transportCapacity: form.transportCapacity,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md mx-4 bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold">Add Vehicle</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded-md">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Name</label>
            <Input
              placeholder="e.g. Ford Transit"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Max speed (km/h)</label>
              <NumericInput
                min={1} max={500}
                value={form.speedMax}
                parse={parseInt}
                format={v => String(Math.round(v))}
                onChange={v => setForm(f => ({ ...f, speedMax: v }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Fuel capacity (L)</label>
              <NumericInput
                min={1} max={10000}
                value={form.fuelCapacity}
                parse={parseInt}
                format={v => String(Math.round(v))}
                onChange={v => setForm(f => ({ ...f, fuelCapacity: v }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Transport capacity</label>
              <NumericInput
                min={1} max={10000}
                value={form.transportCapacity}
                parse={parseInt}
                format={v => String(Math.round(v))}
                onChange={v => setForm(f => ({ ...f, transportCapacity: v }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.color}
                  onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                  className="h-9 w-12 rounded border border-input cursor-pointer bg-transparent p-0.5"
                />
                <span className="text-xs text-muted-foreground font-mono">{form.color}</span>
              </div>
            </div>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-border">
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSubmit}>Add Vehicle</Button>
        </div>
      </div>
    </div>
  );
}

// -- Objectives page
export function ObjectivesPage() {
  const { mapData, vehicles, addVehicle, deleteVehicle, setObjectives, setCurrentStep, objectivesDraft, setObjectivesDraft } = useMap();

  // City state: 3 ordered arrays (starts, normals, ends)
  const [startCities, setStartCities] = useState<string[]>(objectivesDraft?.startCities ?? []);
  const [normalCities, setNormalCities] = useState<string[]>(objectivesDraft?.normalCities ?? []);
  const [endCities, setEndCities] = useState<string[]>(objectivesDraft?.endCities ?? []);
  const [orderedVisit, setOrderedVisit] = useState(objectivesDraft?.orderedVisit ?? false);
  const [returnToStart, setReturnToStart] = useState(objectivesDraft?.returnToStart ?? false);

  // Vehicle selection: vehicleId -> count
  const [vehicleSelection, setVehicleSelection] = useState<Record<string, number>>(objectivesDraft?.vehicleSelection ?? {});
  const [showAddVehicle, setShowAddVehicle] = useState(false);

  // Constraints
  const [maxTimeEnabled, setMaxTimeEnabled] = useState(objectivesDraft?.maxTimeEnabled ?? false);
  const [maxTime, setMaxTime] = useState(objectivesDraft?.maxTime ?? 60);
  const [maxDistanceEnabled, setMaxDistanceEnabled] = useState(objectivesDraft?.maxDistanceEnabled ?? false);
  const [maxDistance, setMaxDistance] = useState(objectivesDraft?.maxDistance ?? 200);
  const [totalUnits, setTotalUnits] = useState(objectivesDraft?.totalUnits ?? 0);
  const [vehicleLoads, setVehicleLoads] = useState<Record<string, number>>(objectivesDraft?.vehicleLoads ?? {});
  const [optimizeFor, setOptimizeFor] = useState<'time' | 'distance' | 'fuel'>(objectivesDraft?.optimizeFor ?? 'time');

  // Drag-and-drop state (normal cities only)
  const dragIndex = useRef<number | null>(null);
  const dragOverIndex = useRef<number | null>(null);
  const [dragActive, setDragActive] = useState<number | null>(null);

  // Persist draft on every state change
  useEffect(() => {
    setObjectivesDraft({
      startCities, normalCities, endCities, orderedVisit, returnToStart,
      vehicleSelection, maxTimeEnabled, maxTime,
      maxDistanceEnabled, maxDistance, totalUnits, vehicleLoads, optimizeFor,
    });
  }, [startCities, normalCities, endCities, orderedVisit, returnToStart, vehicleSelection,
      maxTimeEnabled, maxTime, maxDistanceEnabled, maxDistance,
      totalUnits, vehicleLoads, optimizeFor]);

  if (!mapData) return null;

  const mainNodes = mapData.nodes.filter(n => n.type === 'node');
  const allSelected = new Set([...startCities, ...normalCities, ...endCities]);

  // Effective vehicle count (sum of selection, min 1 if vehicles exist)
  const vehicleCount = Object.values(vehicleSelection).reduce((a, b) => a + b, 0);
  const effectiveCap = Math.max(1, vehicleCount);

  // Capacity calculations
  const totalSelectedCapacity = vehicles.reduce((sum, v) =>
    sum + (vehicleSelection[v.id] ?? 0) * v.transportCapacity, 0);

  // Auto-suggest: smallest vehicle that alone covers totalUnits; fall back to largest
  const autoVehicle: Vehicle | null = (() => {
    if (vehicleCount > 0 || vehicles.length === 0) return null;
    if (totalUnits === 0) return vehicles[0];
    const sorted = [...vehicles].sort((a, b) => a.transportCapacity - b.transportCapacity);
    return sorted.find(v => v.transportCapacity >= totalUnits) ?? sorted[sorted.length - 1];
  })();

  const capacityInsufficient = totalUnits > 0 && vehicleCount > 0 && totalSelectedCapacity < totalUnits;
  const autoCapacityInsufficient = totalUnits > 0 && vehicleCount === 0 && autoVehicle !== null && autoVehicle.transportCapacity < totalUnits;

  // City toggle: add/remove from citiesToVisit
  function handleCityToggle(nodeId: string) {
    if (allSelected.has(nodeId)) {
      setStartCities(p => p.filter(id => id !== nodeId));
      setNormalCities(p => p.filter(id => id !== nodeId));
      setEndCities(p => p.filter(id => id !== nodeId));
    } else {
      setNormalCities(p => [...p, nodeId]);
    }
  }

  // City role cycle (double-click): normal -> start -> end -> normal
  function handleRoleCycle(nodeId: string) {
    const isStart = startCities.includes(nodeId);
    const isEnd = endCities.includes(nodeId);
    const isNormal = !isStart && !isEnd;

    if (isNormal) {
      if (startCities.length < effectiveCap) {
        setNormalCities(p => p.filter(id => id !== nodeId));
        setStartCities(p => [...p, nodeId]);
      } else if (endCities.length < effectiveCap) {
        setNormalCities(p => p.filter(id => id !== nodeId));
        setEndCities(p => [...p, nodeId]);
      }
    } else if (isStart) {
      setStartCities(p => p.filter(id => id !== nodeId));
      if (endCities.length < effectiveCap) {
        setEndCities(p => [...p, nodeId]);
      } else {
        setNormalCities(p => [...p, nodeId]);
      }
    } else {
      setEndCities(p => p.filter(id => id !== nodeId));
      setNormalCities(p => [...p, nodeId]);
    }
  }

  // Drag-and-drop reordering for normal cities
  function handleDragStart(index: number) { dragIndex.current = index; setDragActive(index); }
  function handleDragOver(e: React.DragEvent, index: number) { e.preventDefault(); dragOverIndex.current = index; }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const from = dragIndex.current;
    const to = dragOverIndex.current;
    if (from !== null && to !== null && from !== to) {
      const list = [...normalCities];
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved);
      setNormalCities(list);
    }
    dragIndex.current = null; dragOverIndex.current = null; setDragActive(null);
  }
  function handleDragEnd() { dragIndex.current = null; dragOverIndex.current = null; setDragActive(null); }

  // Vehicle count stepper
  function setCount(vehicleId: string, delta: number) {
    setVehicleSelection(prev => {
      const cur = prev[vehicleId] ?? 0;
      const next = Math.max(0, cur + delta);
      // Reducing vehicle count: trim excess city assignments
      const newTotal = Object.entries({ ...prev, [vehicleId]: next })
        .reduce((s, [, c]) => s + c, 0);
      const cap = Math.max(1, newTotal);
      if (startCities.length > cap) {
        const excess = startCities.slice(cap);
        setStartCities(p => p.filter(id => !excess.includes(id)));
        setNormalCities(p => [...p, ...excess]);
      }
      if (endCities.length > cap) {
        const excess = endCities.slice(cap);
        setEndCities(p => p.filter(id => !excess.includes(id)));
        setNormalCities(p => [...p, ...excess]);
      }
      return { ...prev, [vehicleId]: next };
    });
  }

  // Form submission: build and commit the Objective
  function handleSubmit() {
    const effectiveSelection =
      vehicleCount === 0 && vehicles.length > 0
        ? { [(autoVehicle ?? vehicles[0]).id]: 1 }
        : vehicleSelection;

    const objective: Objective = {
      id: `obj-${Date.now()}`,
      citiesToVisit: [...startCities, ...normalCities, ...endCities],
      orderedVisit,
      vehicleSelection: effectiveSelection,
      startCities,
      endCities,
      maxTime: maxTimeEnabled ? maxTime : null,
      maxDistance: maxDistanceEnabled ? maxDistance : null,
      totalUnits,
      vehicleLoads,
      optimizeFor,
      returnToStart,
    };
    setObjectives(objective);
    setCurrentStep('simulation');
  }

  const canSubmit = allSelected.size >= 2 && vehicles.length > 0 && !capacityInsufficient && !autoCapacityInsufficient;
  const totalCities = allSelected.size;

  // Helper: node role by ID
  const roleOf = (id: string): 'start' | 'end' | 'normal' => {
    if (startCities.includes(id)) return 'start';
    if (endCities.includes(id)) return 'end';
    return 'normal';
  }

  return (
    <>
    <div className="flex-1 p-8 overflow-y-auto">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Set Objectives</h1>
          <p className="text-muted-foreground">Configure your route optimization parameters</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Cities to visit */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <CardTitle>Cities to Visit</CardTitle>
                  <CardDescription>
                    Select cities and set departure/arrival roles.
                    Double-click a city in the visit list to cycle its role.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0 pt-1">
                  <span className="flex items-center gap-1"><MapPin className="h-3 w-3 text-green-500" /> Start</span>
                  <span className="flex items-center gap-1"><Flag className="h-3 w-3 text-red-500" /> End</span>
                  <span className="opacity-50">· cap = {effectiveCap} vehicle{effectiveCap !== 1 ? 's' : ''}</span>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* Left: city checklist */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Available cities ({mainNodes.length})
                  </p>
                  <div className="space-y-0.5 max-h-72 overflow-y-auto pr-1">
                    {mainNodes.map(node => (
                      <label
                        key={node.id}
                        className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-accent cursor-pointer"
                      >
                        <Checkbox
                          checked={allSelected.has(node.id)}
                          onCheckedChange={() => handleCityToggle(node.id)}
                        />
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: node.color }} />
                        <span className="text-sm">{node.name}</span>
                        {roleOf(node.id) === 'start' && <MapPin className="h-3 w-3 text-green-500 ml-auto" />}
                        {roleOf(node.id) === 'end'   && <Flag    className="h-3 w-3 text-red-500   ml-auto" />}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Right: ordered visit list — starts → normals → ends */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Visit list ({totalCities})
                    </p>
                    <div className="flex flex-col gap-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={orderedVisit}
                        onCheckedChange={(v) => setOrderedVisit(v as boolean)}
                      />
                      <span className="text-xs text-muted-foreground">Visit in specified order</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={returnToStart}
                        onCheckedChange={(v) => setReturnToStart(v as boolean)}
                      />
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Home className="h-3 w-3" />
                        Return to starting point
                      </span>
                    </label>
                  </div>
                  </div>

                  {totalCities > 0 && (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Double-click</span> a city to set its role
                      {orderedVisit && <span className="ml-1 opacity-70">· drag normals to reorder</span>}
                    </p>
                  )}

                  {totalCities === 0 ? (
                    <div className="flex items-center justify-center h-32 border border-dashed border-border rounded-lg text-sm text-muted-foreground">
                      Select cities on the left
                    </div>
                  ) : (
                    <div className="space-y-1 max-h-72 overflow-y-auto pr-1">

                      {/* Start cities */}
                      {startCities.map((id, i) => {
                        const node = mapData.nodes.find(n => n.id === id);
                        return (
                          <div key={id} onDoubleClick={() => handleRoleCycle(id)}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-green-500/50 bg-green-500/10 cursor-pointer select-none">
                            <MapPin className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                            <span className="text-xs text-green-600 font-semibold w-4">{i + 1}</span>
                            <span className="text-sm flex-1 truncate">{node?.name}</span>
                            <span className="text-xs text-green-600/60 font-medium">start</span>
                            <button onClick={(e) => { e.stopPropagation(); handleCityToggle(id); }}
                              className="text-muted-foreground hover:text-foreground flex-shrink-0"><X className="h-3.5 w-3.5" /></button>
                          </div>
                        );
                      })}

                      {/* Normal cities */}
                      {normalCities.map((id, index) => {
                        const node = mapData.nodes.find(n => n.id === id);
                        const globalIdx = startCities.length + index + 1;
                        return (
                          <div key={id}
                            draggable={orderedVisit}
                            onDragStart={() => handleDragStart(index)}
                            onDragOver={(e) => handleDragOver(e, index)}
                            onDrop={handleDrop}
                            onDragEnd={handleDragEnd}
                            onDoubleClick={() => handleRoleCycle(id)}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border transition-colors select-none ${
                              dragActive === index ? 'opacity-40' : 'border-border hover:bg-accent'
                            } ${orderedVisit ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
                          >
                            {orderedVisit
                              ? <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              : <span className="w-4 text-center text-xs text-muted-foreground font-mono">{globalIdx}</span>
                            }
                            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: node?.color }} />
                            <span className="text-sm flex-1 truncate">{node?.name}</span>
                            {orderedVisit && <span className="text-xs text-muted-foreground font-mono">{globalIdx}</span>}
                            <button onClick={(e) => { e.stopPropagation(); handleCityToggle(id); }}
                              className="text-muted-foreground hover:text-foreground flex-shrink-0"><X className="h-3.5 w-3.5" /></button>
                          </div>
                        );
                      })}

                      {/* End cities */}
                      {endCities.map((id, i) => {
                        const node = mapData.nodes.find(n => n.id === id);
                        const globalIdx = startCities.length + normalCities.length + i + 1;
                        return (
                          <div key={id} onDoubleClick={() => handleRoleCycle(id)}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-red-500/50 bg-red-500/10 cursor-pointer select-none">
                            <Flag className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                            <span className="text-xs text-red-600 font-semibold w-4">{globalIdx}</span>
                            <span className="text-sm flex-1 truncate">{node?.name}</span>
                            <span className="text-xs text-red-600/60 font-medium">end</span>
                            <button onClick={(e) => { e.stopPropagation(); handleCityToggle(id); }}
                              className="text-muted-foreground hover:text-foreground flex-shrink-0"><X className="h-3.5 w-3.5" /></button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Counters */}
                  {totalCities > 0 && (
                    <div className="flex gap-4 pt-2 border-t border-border text-xs">
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-green-500" />
                        <span className={startCities.length > effectiveCap ? 'text-destructive font-semibold' : 'text-muted-foreground'}>
                          {startCities.length}/{effectiveCap} start{effectiveCap !== 1 ? 's' : ''}
                        </span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Flag className="h-3.5 w-3.5 text-red-500" />
                        <span className={endCities.length > effectiveCap ? 'text-destructive font-semibold' : 'text-muted-foreground'}>
                          {endCities.length}/{effectiveCap} end{effectiveCap !== 1 ? 's' : ''}{' '}
                          <span className="opacity-60">(optional)</span>
                        </span>
                      </span>
                      {endCities.length === 0 && <span className="text-muted-foreground opacity-60">· {returnToStart ? 'return to start' : 'optimal tour'}</span>}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Vehicles */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle>Vehicles</CardTitle>
                  <CardDescription>
                    Set how many of each vehicle type to deploy.
                    {vehicleCount === 0 && vehicles.length > 0 && autoVehicle && (
                      <span className={`ml-1 ${autoCapacityInsufficient ? 'text-destructive' : 'text-amber-500'}`}>
                        {autoCapacityInsufficient
                          ? `No vehicle can carry ${totalUnits} units — add a larger vehicle.`
                          : `No vehicles selected — will default to 1× ${autoVehicle.name}${totalUnits > 0 ? ` (${autoVehicle.transportCapacity} units)` : ''}.`}
                      </span>
                    )}
                  </CardDescription>
                </div>
                <Button size="sm" variant="outline" onClick={() => setShowAddVehicle(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Add Vehicle
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {vehicles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3 border border-dashed border-border rounded-lg text-muted-foreground">
                  <Car className="h-8 w-8 opacity-30" />
                  <p className="text-sm">No vehicles defined. Add one to continue.</p>
                  <Button size="sm" variant="outline" onClick={() => setShowAddVehicle(true)}>
                    <Plus className="h-4 w-4 mr-1" /> Add Vehicle
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {vehicles.map(vehicle => {
                    const count = vehicleSelection[vehicle.id] ?? 0;
                    return (
                      <div key={vehicle.id}
                        className="flex items-center gap-3 p-3 rounded-lg border border-border transition-colors"
                      >
                        {/* Color + info */}
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: vehicle.color }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{vehicle.name}</span>
                            {count > 0 && (
                              <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-semibold">
                                {count}×
                              </span>
                            )}
                          </div>
                          <div className="flex gap-3 mt-0.5 text-xs text-muted-foreground">
                            <span>{vehicle.speedMax} km/h</span>
                            <span>{vehicle.fuelCapacity} L</span>
                            <span>{vehicle.transportCapacity} units</span>
                          </div>
                        </div>

                        {/* Count stepper */}
                        <div className="flex items-center gap-1 shrink-0">
                          <Button variant="outline" size="icon" className="h-7 w-7"
                            onClick={() => setCount(vehicle.id, -1)} disabled={count === 0}>
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-6 text-center text-sm font-mono font-semibold">{count}</span>
                          <Button variant="outline" size="icon" className="h-7 w-7"
                            onClick={() => setCount(vehicle.id, 1)}>
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>

                        {/* Per-vehicle load override */}
                        {totalUnits > 0 && count > 0 && (
                          <div className="flex items-center gap-1 ml-1">
                            <Package className="h-3 w-3 text-muted-foreground" />
                            <NumericInput
                              min={0}
                              value={vehicleLoads[vehicle.id] ?? 0}
                              parse={parseInt}
                              format={v => String(Math.round(v))}
                              onChange={v => setVehicleLoads(prev => ({ ...prev, [vehicle.id]: v }))}
                              className="w-16 h-7 text-xs text-center px-1"
                              placeholder="auto"
                            />
                            <span className="text-xs text-muted-foreground">/{vehicle.transportCapacity}</span>
                          </div>
                        )}

                        {/* Delete */}
                        <button
                          onClick={() => {
                            deleteVehicle(vehicle.id);
                            setVehicleSelection(prev => {
                              const { [vehicle.id]: _, ...rest } = prev;
                              return rest;
                            });
                          }}
                          className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0 p-1"
                          title="Remove vehicle"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}

                  {/* Total */}
                  <div className="pt-2 border-t border-border text-xs text-muted-foreground text-right">
                    Total vehicles: <span className="font-semibold text-foreground">{vehicleCount}</span>
                    {vehicleCount === 0 && <span className="ml-1 text-amber-500">(will use 1 default)</span>}
                    {totalUnits > 0 && vehicleCount > 0 && (
                      <span className={`ml-2 ${capacityInsufficient ? 'text-destructive font-semibold' : 'text-green-600'}`}>
                        · capacity {totalSelectedCapacity}/{totalUnits} units{capacityInsufficient ? ' — insufficient!' : ''}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Constraints */}
          <Card>
            <CardHeader>
              <CardTitle>Constraints</CardTitle>
              <CardDescription>Optional limits — if no solution meets them, it will be flagged</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Time limit */}
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium flex-1">Max time per vehicle</span>
                  <Switch checked={maxTimeEnabled} onCheckedChange={setMaxTimeEnabled} />
                </div>
                {maxTimeEnabled && (
                  <div className="flex items-center gap-2 pl-7">
                    <NumericInput
                      value={maxTime}
                      min={1}
                      parse={parseInt}
                      format={v => String(Math.round(v))}
                      onChange={setMaxTime}
                      className="w-28"
                    />
                    <span className="text-sm text-muted-foreground">minutes</span>
                    <span className="text-xs text-amber-500 ml-2">impossible if exceeded</span>
                  </div>
                )}
              </div>

              {/* Distance limit */}
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <Route className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium flex-1">Max distance per vehicle</span>
                  <Switch checked={maxDistanceEnabled} onCheckedChange={setMaxDistanceEnabled} />
                </div>
                {maxDistanceEnabled && (
                  <div className="flex items-center gap-2 pl-7">
                    <NumericInput
                      value={maxDistance}
                      min={1}
                      parse={parseInt}
                      format={v => String(Math.round(v))}
                      onChange={setMaxDistance}
                      className="w-28"
                    />
                    <span className="text-sm text-muted-foreground">km</span>
                  </div>
                )}
              </div>

              {/* Cargo */}
              <div className="space-y-2 pt-2 border-t border-border">
                <div className="flex items-center gap-3">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium flex-1">Total units to distribute</span>
                  <NumericInput
                    value={totalUnits}
                    min={0}
                    parse={parseInt}
                    format={v => String(Math.round(v))}
                    onChange={setTotalUnits}
                    className="w-24"
                  />
                </div>
                <p className="text-xs text-muted-foreground pl-7">
                  {totalUnits === 0
                    ? 'No cargo — pure route optimisation'
                    : `${totalUnits} units will be spread across vehicles based on capacity`}
                </p>
                {totalUnits > 0 && vehicleCount > 0 && (
                  <p className={`text-xs pl-7 mt-1 ${capacityInsufficient ? 'text-destructive font-semibold' : 'text-green-600'}`}>
                    {capacityInsufficient
                      ? `⚠ Selected vehicles can only carry ${totalSelectedCapacity} of ${totalUnits} units`
                      : `✓ Capacity OK — ${totalSelectedCapacity} / ${totalUnits} units`}
                  </p>
                )}
                {totalUnits > 0 && vehicleCount === 0 && autoVehicle && (
                  <p className={`text-xs pl-7 mt-1 ${autoCapacityInsufficient ? 'text-destructive font-semibold' : 'text-amber-500'}`}>
                    {autoCapacityInsufficient
                      ? `⚠ No vehicle can carry ${totalUnits} units — add a larger vehicle`
                      : `Auto: ${autoVehicle.name} — ${autoVehicle.transportCapacity} units capacity`}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Optimization goal */}
          <Card>
            <CardHeader>
              <CardTitle>Optimization Goal</CardTitle>
              <CardDescription>What should be prioritized?</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { value: 'time',     label: 'Minimize Time',     desc: 'Find the fastest route' },
                  { value: 'distance', label: 'Minimize Distance', desc: 'Find the shortest route' },
                  { value: 'fuel',     label: 'Minimize Fuel',     desc: 'Find the most fuel-efficient route' },
                ].map(option => (
                  <div
                    key={option.value}
                    role="button"
                    onClick={() => setOptimizeFor(option.value as 'time' | 'distance' | 'fuel')}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      optimizeFor === option.value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                      optimizeFor === option.value ? 'border-primary' : 'border-muted-foreground'
                    }`}>
                      {optimizeFor === option.value && <div className="w-2 h-2 rounded-full bg-primary" />}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{option.label}</p>
                      <p className="text-xs text-muted-foreground">{option.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex justify-between gap-3 mt-8">
          <Button variant="outline" onClick={() => setCurrentStep('map-editor')}>
            Back to Editor
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} title={
            allSelected.size < 2 ? 'Select at least 2 cities'
            : !vehicles.length ? 'Add at least one vehicle'
            : capacityInsufficient ? `Selected vehicles can only carry ${totalSelectedCapacity} of ${totalUnits} units`
            : autoCapacityInsufficient ? `No vehicle can carry ${totalUnits} units`
            : undefined
          }>
            Run Simulation
          </Button>
          {allSelected.size < 2 && allSelected.size > 0 && (
            <p className="text-xs text-amber-500 mt-2 text-right">Select at least 2 cities</p>
          )}
        </div>
      </div>
    </div>

    {showAddVehicle && (
      <AddVehicleDialog
        onAdd={(v) => { addVehicle(v); setShowAddVehicle(false); }}
        onClose={() => setShowAddVehicle(false)}
      />
    )}
    </>
  );
}
