"use client";

import { useEffect, useState, useRef } from 'react';
import { useMap } from '@/lib/map-context';
import { Button } from '@/components/ui/button';
import type { MapData, Objective, Vehicle, SimulationResult, VehicleRoute, Segment } from '@/lib/types';

// -- SVG helpers

function segPath(seg: Segment): string {
  const dx = seg.endX - seg.startX, dy = seg.endY - seg.startY;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 1) return `M ${seg.startX} ${seg.startY} L ${seg.endX} ${seg.endY}`;
  const cv = d * 0.02;
  const mx = (seg.startX + seg.endX) / 2 - (dy / d) * cv;
  const my = (seg.startY + seg.endY) / 2 + (dx / d) * cv;
  return `M ${seg.startX} ${seg.startY} Q ${mx} ${my} ${seg.endX} ${seg.endY}`;
}

function computeViewBox(nodes: { x: number; y: number }[], pad = 60): string {
  if (!nodes.length) return '0 0 800 600';
  const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
  const minX = Math.min(...xs) - pad, minY = Math.min(...ys) - pad;
  const maxX = Math.max(...xs) + pad, maxY = Math.max(...ys) + pad;
  return `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;
}

// -- Graph data structures and routing algorithms

interface GEdge { id: string; from: string; to: string; dist: number; time: number; fuel: number }
interface DResult {
  cost: Map<string, number>;
  prev: Map<string, string | null>;
  prevEdge: Map<string, string | null>;
}

function buildAdj(mapData: MapData, vehicleSpeedMax = Infinity): Map<string, GEdge[]> {
  const adj = new Map<string, GEdge[]>();
  for (const n of mapData.nodes) adj.set(n.id, []);
  for (const e of mapData.edges) {
    let dist = 0, time = 0, fuel = 0;
    for (const s of e.segments) {
      dist += s.distance;
      const eff = Math.max(0.05, 1 - s.traffic * 0.6);
      // Effective speed is capped by the vehicle's own maximum.
      const effectiveSpeed = Math.min(s.speed, vehicleSpeedMax) * eff;
      time += (s.distance / effectiveSpeed) * 60;
      fuel += s.distance * (0.07 + s.traffic * 0.05);
    }
    if (!dist) dist = e.totalDistance;
    const add = (from: string, to: string) => {
      if (!adj.has(from)) adj.set(from, []);
      adj.get(from)!.push({ id: e.id, from, to, dist, time, fuel });
    };
    add(e.nodeA, e.nodeB);
    add(e.nodeB, e.nodeA);
  }
  return adj;
}

function dijkstra(adj: Map<string, GEdge[]>, source: string, key: 'dist' | 'time' | 'fuel'): DResult {
  const cost = new Map<string, number>();
  const prev = new Map<string, string | null>();
  const prevEdge = new Map<string, string | null>();
  for (const [id] of adj) { cost.set(id, Infinity); prev.set(id, null); prevEdge.set(id, null); }
  cost.set(source, 0);
  const pq: [number, string][] = [[0, source]];
  const vis = new Set<string>();
  while (pq.length) {
    pq.sort((a, b) => a[0] - b[0]);
    const [c, u] = pq.shift()!;
    if (vis.has(u)) continue;
    vis.add(u);
    for (const e of adj.get(u) ?? []) {
      const nc = c + e[key];
      if (nc < (cost.get(e.to) ?? Infinity)) {
        cost.set(e.to, nc); prev.set(e.to, u); prevEdge.set(e.to, e.id);
        pq.push([nc, e.to]);
      }
    }
  }
  return { cost, prev, prevEdge };
}

function getPath(r: DResult, src: string, tgt: string): { nodes: string[]; edges: string[]; cost: number } {
  const c = r.cost.get(tgt) ?? Infinity;
  if (c === Infinity) return { nodes: [], edges: [], cost: Infinity };
  const nodes: string[] = [], edges: string[] = [];
  let cur: string | null = tgt;
  while (cur !== null && cur !== src) {
    nodes.unshift(cur);
    const e = r.prevEdge.get(cur); if (e) edges.unshift(e);
    cur = r.prev.get(cur) ?? null;
  }
  nodes.unshift(src);
  return { nodes, edges, cost: c };
}

function pathMetrics(pathEdges: string[], mapData: MapData) {
  let distance = 0, time = 0, fuel = 0;
  for (const eid of pathEdges) {
    const edge = mapData.edges.find(e => e.id === eid);
    if (!edge) continue;
    distance += edge.totalDistance;
    for (const s of edge.segments) {
      const eff = Math.max(0.05, 1 - s.traffic * 0.6);
      time += (s.distance / (s.speed * eff)) * 60;
      fuel += s.distance * (0.07 + s.traffic * 0.05);
    }
  }
  return { distance, time, fuel };
}

interface VInst {
  instanceId: string; instanceIndex: number;
  vehicle: Vehicle;
  startCity: string | null; endCity: string | null;
  cities: string[]; unitsToCarry: number;
}

function createInstances(obj: Objective, vehicles: Vehicle[]): VInst[] {
  const instances: VInst[] = [];
  for (const v of vehicles) {
    for (let i = 0; i < (obj.vehicleSelection[v.id] ?? 0); i++)
      instances.push({ instanceId: `${v.id}-${i}`, instanceIndex: i, vehicle: v, startCity: null, endCity: null, cities: [], unitsToCarry: 0 });
  }
  if (!instances.length && vehicles.length)
    instances.push({ instanceId: `${vehicles[0].id}-0`, instanceIndex: 0, vehicle: vehicles[0], startCity: null, endCity: null, cities: [], unitsToCarry: 0 });
  if (!instances.length) return [];

  const normals = obj.citiesToVisit.filter(id => !obj.startCities.includes(id) && !obj.endCities.includes(id));
  obj.startCities.forEach((c, i) => { if (i < instances.length) instances[i].startCity = c; });
  obj.endCities.forEach((c, i) => { if (i < instances.length) instances[i].endCity = c; });
  normals.forEach((c, i) => instances[i % instances.length].cities.push(c));

  if (obj.totalUnits > 0) {
    let remaining = obj.totalUnits, autoInsts: VInst[] = [];
    for (const inst of instances) {
      const ov = obj.vehicleLoads[inst.vehicle.id] ?? 0;
      if (ov > 0) { inst.unitsToCarry = ov; remaining -= ov; } else autoInsts.push(inst);
    }
    if (autoInsts.length && remaining > 0) {
      const cap = autoInsts.reduce((s, i) => s + i.vehicle.transportCapacity, 0);
      for (const inst of autoInsts)
        inst.unitsToCarry = cap > 0 ? Math.round(remaining * inst.vehicle.transportCapacity / cap) : Math.round(remaining / autoInsts.length);
    }
  }
  return instances;
}

function solveTSP(normals: string[], start: string | null, end: string | null, costs: Map<string, number>): string[] {
  const getC = (a: string, b: string) => costs.get(`${a}|${b}`) ?? costs.get(`${b}|${a}`) ?? Infinity;
  if (!normals.length) return [start, end].filter(Boolean) as string[];

  const toVisit = [...normals];
  const route: string[] = [];
  let current: string;
  if (start) { route.push(start); current = start; }
  else {
    // Select the most central city as the default tour start.
    let best = toVisit[0], bestAvg = Infinity;
    for (const c of toVisit) {
      const avg = toVisit.filter(o => o !== c).reduce((s, o) => s + getC(c, o), 0) / (toVisit.length - 1 || 1);
      if (avg < bestAvg) { bestAvg = avg; best = c; }
    }
    toVisit.splice(toVisit.indexOf(best), 1);
    route.push(best); current = best;
  }
  while (toVisit.length) {
    let nn = '', nd = Infinity;
    for (const c of toVisit) { const d = getC(current, c); if (d < nd) { nd = d; nn = c; } }
    if (!nn) { route.push(...toVisit); break; }
    toVisit.splice(toVisit.indexOf(nn), 1); route.push(nn); current = nn;
  }
  // Append the end city only when it is not already the last element; handles circular routes without duplication.
  if (end && route[route.length - 1] !== end) route.push(end);

  // 2-opt improvement; the fixed start and end positions are excluded from swaps.
  const sf = start ? 1 : 0, ef = end ? 1 : 0;
  const cost = (r: string[]) => r.slice(0, -1).reduce((s, _, i) => s + getC(r[i], r[i + 1]), 0);
  let imp = true;
  for (let it = 0; it < 20 && imp; it++) {
    imp = false;
    for (let i = sf; i < route.length - 1 - ef; i++) {
      for (let j = i + 1; j < route.length - ef; j++) {
        const nr = [...route.slice(0, i + 1), ...route.slice(i + 1, j + 1).reverse(), ...route.slice(j + 1)];
        if (cost(nr) < cost(route) - 0.001) { route.splice(0, route.length, ...nr); imp = true; }
      }
    }
  }
  return route;
}

type PairPaths = Map<string, { nodes: string[]; edges: string[]; cost: number }>;

function buildFullPath(route: string[], pairs: PairPaths) {
  if (route.length <= 1) return { pathNodes: [...route], pathEdges: [] as string[] };
  const pathNodes: string[] = [], pathEdges: string[] = [];
  for (let i = 0; i < route.length - 1; i++) {
    const p = pairs.get(`${route[i]}|${route[i + 1]}`);
    if (!p || !p.nodes.length) { if (!i) pathNodes.push(route[i]); pathNodes.push(route[i + 1]); continue; }
    if (!i) pathNodes.push(...p.nodes); else pathNodes.push(...p.nodes.slice(1));
    pathEdges.push(...p.edges);
  }
  return { pathNodes, pathEdges };
}

interface Frame {
  phase: 'init' | 'dijkstra' | 'routing' | 'done';
  log: string;
  edgeColors: Record<string, string>;
  currentPathNodes: string[];
  vehicleRoutes: { color: string; edges: string[] }[];
}

function compute(mapData: MapData, obj: Objective, vehicles: Vehicle[]): { frames: Frame[]; result: SimulationResult } {
  const costKey: 'dist' | 'time' | 'fuel' = obj.optimizeFor === 'time' ? 'time' : obj.optimizeFor === 'fuel' ? 'fuel' : 'dist';
  const uniqueCities = [...new Set(obj.citiesToVisit)];
  const nn = (id: string) => mapData.nodes.find(n => n.id === id)?.name ?? id;
  const gray0 = Object.fromEntries(mapData.edges.map(e => [e.id, '#d1d5db']));
  const unit = obj.optimizeFor === 'time' ? 'min' : obj.optimizeFor === 'fuel' ? 'L' : 'km';

  // Phase 1: solve routes
  // One adjacency graph per distinct speed cap so time costs correctly reflect each vehicle's maximum.
  const adjBySpeedMax = new Map<number, Map<string, GEdge[]>>();
  const getAdj = (speedMax: number) => {
    if (!adjBySpeedMax.has(speedMax)) adjBySpeedMax.set(speedMax, buildAdj(mapData, speedMax));
    return adjBySpeedMax.get(speedMax)!;
  };

  // Precompute shortest paths between every city pair, once per distinct vehicle speed cap.
  const pairPathsBySpeedMax = new Map<number, PairPaths>();
  const pairCostsBySpeedMax = new Map<number, Map<string, number>>();
  const uniqueSpeedMaxes = [...new Set(vehicles.map(v => v.speedMax))];
  if (!uniqueSpeedMaxes.length) uniqueSpeedMaxes.push(Infinity);
  for (const speedMax of uniqueSpeedMaxes) {
    const vAdj = getAdj(speedMax);
    const pp: PairPaths = new Map();
    const pc = new Map<string, number>();
    for (const src of uniqueCities) {
      const r = dijkstra(vAdj, src, costKey);
      for (const tgt of uniqueCities) {
        if (tgt === src) continue;
        const p = getPath(r, src, tgt);
        pp.set(`${src}|${tgt}`, p);
        pc.set(`${src}|${tgt}`, p.cost);
      }
    }
    pairPathsBySpeedMax.set(speedMax, pp);
    pairCostsBySpeedMax.set(speedMax, pc);
  }

  const instances = createInstances(obj, vehicles);
  const vehicleRoutes: VehicleRoute[] = [];
  for (const inst of instances) {
    const vName = inst.vehicle.name + (inst.instanceIndex > 0 ? ` #${inst.instanceIndex + 1}` : '');
    const vSpeedMax = inst.vehicle.speedMax;
    const pairPaths = pairPathsBySpeedMax.get(vSpeedMax) ?? pairPathsBySpeedMax.values().next().value!;
    const pairCosts = pairCostsBySpeedMax.get(vSpeedMax) ?? pairCostsBySpeedMax.values().next().value!;
    // Close the route back to the departure city when returnToStart is set and no explicit arrival is defined.
    const effectiveEndCity = (obj.returnToStart && inst.startCity && !inst.endCity)
      ? inst.startCity
      : inst.endCity;
    const route = obj.orderedVisit
      ? [...(inst.startCity ? [inst.startCity] : []), ...inst.cities, ...(effectiveEndCity ? [effectiveEndCity] : [])]
      : solveTSP(inst.cities, inst.startCity, effectiveEndCity, pairCosts);
    if (route.length < 1) continue;
    const { pathNodes, pathEdges } = buildFullPath(route, pairPaths);
    const m = pathMetrics(pathEdges, mapData);
    const breaches: string[] = [];
    if (obj.maxTime !== null && m.time > obj.maxTime) breaches.push(`Time ${m.time.toFixed(1)} min > max ${obj.maxTime} min`);
    if (obj.maxDistance !== null && m.distance > obj.maxDistance) breaches.push(`Distance ${m.distance.toFixed(1)} km > max ${obj.maxDistance} km`);
    if (obj.totalUnits > 0 && inst.unitsToCarry > inst.vehicle.transportCapacity) breaches.push(`Load ${inst.unitsToCarry} > capacity ${inst.vehicle.transportCapacity}`);
    if (route.length > 1 && !pathEdges.length) breaches.push('No path found between some cities');
    vehicleRoutes.push({
      vehicleId: inst.vehicle.id, vehicleName: vName, color: inst.vehicle.color,
      instanceIndex: inst.instanceIndex, route, pathNodes, pathEdges,
      totalTime: Math.round(m.time * 10) / 10,
      totalDistance: Math.round(m.distance * 10) / 10,
      fuelUsed: Math.round(m.fuel * 10) / 10,
      unitsCarried: inst.unitsToCarry,
      feasible: !breaches.length, constraintBreaches: breaches,
    });
  }

  // Phase 2: generate animation frames
  const frames: Frame[] = [];

  // For mixed-fleet maps, animation uses the first speed group's pair paths as a reference.
  const fallbackSpeed = uniqueSpeedMaxes[0];
  const pairPaths = pairPathsBySpeedMax.get(fallbackSpeed) ?? new Map<string, { nodes: string[]; edges: string[]; cost: number }>();

  frames.push({ phase: 'init', log: `Graph: ${mapData.nodes.length} nodes · ${mapData.edges.length} edges · ${uniqueCities.length} cities`, edgeColors: { ...gray0 }, currentPathNodes: [], vehicleRoutes: [] });

  // Dijkstra frames — limited to pairs actually used by the computed routes
  const usedPairs = new Set<string>();
  for (const vr of vehicleRoutes)
    for (let i = 0; i < vr.route.length - 1; i++) usedPairs.add(`${vr.route[i]}|${vr.route[i + 1]}`);

  const explored = new Set<string>();
  let pairCount = 0;
  for (const key of usedPairs) {
    if (pairCount++ > 20) break; // limit to 20 Dijkstra frames to avoid flooding the animation
    const [src, tgt] = key.split('|');
    const p = pairPaths.get(key);
    if (!p || p.cost === Infinity) {
      frames.push({ phase: 'dijkstra', log: `No path: ${nn(src)} → ${nn(tgt)}`, edgeColors: { ...gray0 }, currentPathNodes: [src, tgt], vehicleRoutes: [] });
      continue;
    }
    const ec1 = { ...gray0, ...Object.fromEntries([...explored].map(e => [e, '#374151'])) };
    for (const e of p.edges) ec1[e] = '#f59e0b';
    frames.push({ phase: 'dijkstra', log: `Routing: ${nn(src)} → ${nn(tgt)} · ${p.nodes.length} nodes`, edgeColors: ec1, currentPathNodes: p.nodes, vehicleRoutes: [] });
    const ec2 = { ...gray0, ...Object.fromEntries([...explored].map(e => [e, '#374151'])) };
    for (const e of p.edges) { ec2[e] = '#3b82f6'; explored.add(e); }
    const viaNames = p.nodes.slice(1, -1).map(id => mapData.nodes.find(n => n.id === id)?.name ?? id);
    const viaStr = viaNames.length ? ` [${viaNames.join(' · ')}]` : ' (direct)';
    frames.push({ phase: 'dijkstra', log: `  ✓ ${nn(src)} → ${nn(tgt)}${viaStr} · ${p.cost.toFixed(1)} ${unit}`, edgeColors: ec2, currentPathNodes: p.nodes, vehicleRoutes: [] });
  }

  // Routing frames (per vehicle)
  const doneVehicleRoutes: { color: string; edges: string[] }[] = [];
  for (const vr of vehicleRoutes) {
    const baseColors = () => ({
      ...gray0,
      ...Object.fromEntries(doneVehicleRoutes.flatMap(r => r.edges.map(e => [e, r.color]))),
    });
    const routeMethod = obj.orderedVisit ? 'fixed order' : 'nearest-neighbor + 2-opt';
    frames.push({ phase: 'routing', log: `${vr.vehicleName} — ${vr.route.map(nn).join(' → ')} (${routeMethod})`, edgeColors: baseColors(), currentPathNodes: vr.route, vehicleRoutes: [...doneVehicleRoutes] });
    for (let i = 1; i < vr.route.length; i++) {
      const from = vr.route[i - 1], to = vr.route[i];
      const partial = vr.route.slice(0, i + 1);
      const segP = pairPaths.get(`${from}|${to}`);
      const segNodes = segP?.nodes ?? [from, to];
      const segCost = (segP?.cost ?? 0).toFixed(1);
      const interNames = segNodes.slice(1, -1).map(id => mapData.nodes.find(n => n.id === id)?.name ?? id);
      const interStr = interNames.length ? ` [${interNames.join(' · ')}]` : '';
      const role = obj.endCities.includes(to) ? 'arrive'
        : obj.startCities.includes(to) ? 'depart'
        : obj.orderedVisit ? 'ordered'
        : i === 1 && !obj.startCities.includes(from) ? 'TSP start'
        : 'TSP opt';
      const { pathEdges: pe } = buildFullPath(partial, pairPaths);
      const ec = { ...baseColors(), ...Object.fromEntries(pe.map(e => [e, vr.color])) };
      frames.push({ phase: 'routing', log: `  ${nn(from)} → ${nn(to)}${interStr} · ${segCost} ${unit} (${role})`, edgeColors: ec, currentPathNodes: segNodes, vehicleRoutes: [...doneVehicleRoutes, { color: vr.color, edges: pe }] });
    }
    doneVehicleRoutes.push({ color: vr.color, edges: vr.pathEdges });
    const icon = vr.feasible ? '✓' : '⚠';
    frames.push({ phase: 'routing', log: `${icon} ${vr.vehicleName}: ${vr.pathNodes.length} nodes · ${vr.totalDistance} km · ${vr.totalTime} min · ${vr.fuelUsed} L`, edgeColors: baseColors(), currentPathNodes: vr.pathNodes, vehicleRoutes: [...doneVehicleRoutes] });
  }

  const feasible = vehicleRoutes.every(r => r.feasible) && vehicleRoutes.length > 0;
  const allBreaches = vehicleRoutes.flatMap(r => r.constraintBreaches);
  const totalTime = vehicleRoutes.length ? Math.max(...vehicleRoutes.map(r => r.totalTime)) : 0;
  const totalDist = vehicleRoutes.reduce((s, r) => s + r.totalDistance, 0);
  const totalFuel = vehicleRoutes.reduce((s, r) => s + r.fuelUsed, 0);
  const score = obj.optimizeFor === 'time' ? totalTime : obj.optimizeFor === 'fuel' ? totalFuel : totalDist;
  const finalColors = { ...gray0, ...Object.fromEntries(doneVehicleRoutes.flatMap(r => r.edges.map(e => [e, r.color]))) };

  frames.push({ phase: 'done', log: feasible ? `✓ Done — best score: ${score.toFixed(1)} ${unit}` : `⚠ Done with ${allBreaches.length} constraint violation(s)`, edgeColors: finalColors, currentPathNodes: [], vehicleRoutes: doneVehicleRoutes });

  const result: SimulationResult = {
    id: `sim-${Date.now()}`, vehicleRoutes,
    totalTime: Math.round(totalTime * 10) / 10,
    totalDistance: Math.round(totalDist * 10) / 10,
    fuelUsed: Math.round(totalFuel * 10) / 10,
    feasible, constraintBreaches: allBreaches,
    optimizeScore: Math.round(score * 10) / 10,
  };
  return { frames, result };
}

const PHASE_LABEL: Record<string, string> = { init: 'Initialising', dijkstra: 'Finding shortest paths', routing: 'Building routes', done: 'Complete' };

export function SimulationPage() {
  const { mapData, objectives, vehicles, setSimulationResults, setCurrentStep } = useMap();
  const [frames, setFrames] = useState<Frame[]>([]);
  const [frameIdx, setFrameIdx] = useState(0);
  const [done, setDone] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [logEntries, setLogEntries] = useState<string[]>([]);
  const [waiting, setWaiting] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startAnimation(f: Frame[], r: SimulationResult) {
    setWaiting(false);
    setFrames(f);
    setResult(r);
    intervalRef.current = setInterval(() => {
      setFrameIdx(prev => {
        const next = prev + 1;
        if (next >= f.length) {
          clearInterval(intervalRef.current!);
          setDone(true);
          return prev;
        }
        return next;
      });
    }, 70);
  }

  // On mount, probe the Python solver and fall back to the JS implementation if unavailable.
  useEffect(() => {
    if (!mapData || !objectives) return;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 600);

    fetch('http://localhost:8000/health', { signal: controller.signal })
      .then(res => res.ok ? 'python' : 'js')
      .catch(() => 'js')
      .then((engine: string) => {
        clearTimeout(timeoutId);
        if (engine === 'python') {
          setWaiting(true);
          fetch('http://localhost:8000/solve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mapData, objective: objectives, vehicles }),
          })
            .then(res => {
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              return res.json();
            })
            .then(({ frames: f, result: r }) => {
              startAnimation(f as Frame[], r as SimulationResult);
            })
            .catch(() => {
              // Python solver failed mid-request; fall back to the JS implementation.
              const { frames: f, result: r } = compute(mapData, objectives, vehicles);
              startAnimation(f, r);
            });
        } else {
          const { frames: f, result: r } = compute(mapData, objectives, vehicles);
          startAnimation(f, r);
        }
      });

    return () => { clearTimeout(timeoutId); if (intervalRef.current) clearInterval(intervalRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const frame = frames[frameIdx];
    if (frame?.log) {
      setLogEntries(prev => [...prev.slice(-150), frame.log]);
      setTimeout(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, 0);
    }
  }, [frameIdx, frames]);

  const skipToEnd = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setFrameIdx(frames.length - 1);
    setDone(true);
    if (frames.length) setLogEntries(frames.map(f => f.log));
  };

  const viewResults = () => {
    if (result) { setSimulationResults([result]); setCurrentStep('results'); }
  };

  if (!mapData || !objectives) return null;

  if (waiting) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <svg className="animate-spin h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        <p className="text-sm">Computing…</p>
      </div>
    );
  }

  const frame = frames[frameIdx] ?? frames[0];
  const progress = frames.length > 1 ? Math.round((frameIdx / (frames.length - 1)) * 100) : 0;
  const viewBox = computeViewBox(mapData.nodes);
  const mainNodes = mapData.nodes.filter(n => n.type === 'node');
  const subNodes = mapData.nodes.filter(n => n.type === 'subnode');

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 py-3 border-b border-border flex items-center gap-4 shrink-0">
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold truncate">Route Simulation</h1>
          <p className="text-xs text-muted-foreground">{frame ? PHASE_LABEL[frame.phase] : 'Preparing…'}</p>
        </div>
        <div className="w-40 shrink-0">
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-75" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 text-right">{progress}%</p>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Map SVG */}
        <div className="flex-[3] relative overflow-hidden bg-background">
          <svg viewBox={viewBox} className="w-full h-full" style={{ display: 'block' }}>
            {/* Edges */}
            {mapData.edges.map(edge => {
              const col = frame?.edgeColors[edge.id] ?? '#d1d5db';
              const isVehicle = frame?.vehicleRoutes.some(r => r.edges.includes(edge.id));
              return (
                <g key={edge.id}>
                  {edge.segments.map(seg => (
                    <path key={seg.id} d={segPath(seg)} stroke={col}
                      strokeWidth={isVehicle ? 3.5 : 1.5} fill="none" strokeLinecap="round" />
                  ))}
                </g>
              );
            })}
            {/* Subnodes */}
            {subNodes.map(n => (
              <circle key={n.id} cx={n.x} cy={n.y} r={2.5} fill={n.color} opacity={0.5} />
            ))}
            {/* Main nodes */}
            {mainNodes.map(node => {
              const isSelected = objectives.citiesToVisit.includes(node.id);
              const isStart = objectives.startCities.includes(node.id);
              const isEnd = objectives.endCities.includes(node.id);
              const isCurrent = frame?.currentPathNodes.includes(node.id);
              const r = isSelected ? 7 : 4;
              const ringR = r + 5;
              const ringColor = isStart ? '#22c55e' : isEnd ? '#ef4444' : '#6366f1';
              return (
                <g key={node.id}>
                  {isSelected && <circle cx={node.x} cy={node.y} r={ringR} fill="none" stroke={ringColor} strokeWidth={isCurrent ? 2.5 : 1.5} opacity={isCurrent ? 1 : 0.6} />}
                  <circle cx={node.x} cy={node.y} r={r} fill={isCurrent ? '#ffffff' : node.color} stroke={isCurrent ? node.color : 'none'} strokeWidth={2} />
                  {isSelected && (
                    <text x={node.x + r + 5} y={node.y + 4} fontSize={9} fill="currentColor" className="fill-foreground pointer-events-none select-none">{node.name}</text>
                  )}
                </g>
              );
            })}
          </svg>
          {/* Phase badge overlay */}
          {frame && (
            <div className="absolute top-3 left-3 text-xs bg-background/80 backdrop-blur-sm border border-border rounded-md px-2 py-1 font-medium text-muted-foreground">
              {PHASE_LABEL[frame.phase]}
            </div>
          )}
        </div>

        {/* Log panel */}
        <div className="flex-[2] flex flex-col border-l border-border min-w-0">
          <div className="px-4 py-2 border-b border-border shrink-0">
            <p className="text-sm font-semibold">Algorithm log</p>
          </div>

          <div ref={logRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5 font-mono text-xs">
            {logEntries.map((entry, i) => (
              <p key={i} className={
                entry.startsWith('✓') ? 'text-green-500' :
                entry.startsWith('⚠') ? 'text-amber-500' :
                entry.startsWith('  ') ? 'text-muted-foreground' :
                'text-foreground'
              }>{entry}</p>
            ))}
            {!done && <span className="text-primary animate-pulse">▌</span>}
          </div>

          {/* Current path display */}
          {frame?.currentPathNodes && frame.currentPathNodes.length > 1 && (
            <div className="px-3 py-2 border-t border-border shrink-0">
              <p className="text-xs text-muted-foreground font-semibold mb-1">Current path:</p>
              <p className="text-xs font-mono text-primary break-words leading-5">
                {frame.currentPathNodes
                  .map(id => mapData.nodes.find(n => n.id === id)?.name ?? id)
                  .join(' → ')}
                <span className="text-muted-foreground ml-1">({frame.currentPathNodes.length} nodes)</span>
              </p>
            </div>
          )}

          {/* Controls */}
          <div className="px-3 py-3 border-t border-border flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => setCurrentStep('objectives')}>Back</Button>
            <div className="flex-1" />
            {!done && <Button variant="outline" size="sm" onClick={skipToEnd}>Skip</Button>}
            {done && (
              <Button size="sm" onClick={viewResults}
                className={result?.feasible ? 'bg-green-600 hover:bg-green-700 text-white' : ''}>
                {result?.feasible ? '✓ View Results' : '⚠ View Results'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
