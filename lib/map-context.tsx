"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { AppStep, MapData, MapNode, Edge, Segment, Vehicle, Objective, ObjectivesDraft, SimulationResult, GenerationParams } from './types';

const SEGMENT_LIMITS = {
  minDistance: 0.1,
  maxDistance: 100,
  minSpeed: 20,
  maxSpeed: 130,
  minTraffic: 0,
  maxTraffic: 1,
  maxSegmentsPerEdge: 10,
};

// Fixed speed values allowed on any segment (km/h) — road-speed classes
export const SPEED_VALUES = [20, 30, 50, 70, 80, 90, 110, 130] as const;

function snapSpeed(v: number): number {
  return SPEED_VALUES.reduce((best, cur) =>
    Math.abs(cur - v) < Math.abs(best - v) ? cur : best
  );
}

// Picks a fixed speed class based on segment distance and the allowed range [min, max].
// Short segments (<5 km) favour urban speeds; long segments (>20 km) favour highway speeds.
function pickSpeed(distKm: number, min: number, max: number, rng: () => number): number {
  let primary: readonly number[];
  let secondary: readonly number[];
  let primaryChance: number;

  if (distKm < 5) {
    primary = [20, 30, 50]; secondary = [50, 70]; primaryChance = 0.70;
  } else if (distKm > 20) {
    primary = [80, 90, 110, 130]; secondary = [70, 80, 90]; primaryChance = 0.70;
  } else {
    primary = [70, 80, 90]; secondary = SPEED_VALUES; primaryChance = 0.65;
  }

  const src = rng() < primaryChance ? primary : secondary;
  const filtered = src.filter(v => v >= min && v <= max);
  // Fallback: any value in range, then full list
  const pool = filtered.length
    ? filtered
    : SPEED_VALUES.filter(v => v >= min && v <= max).length
      ? SPEED_VALUES.filter(v => v >= min && v <= max)
      : [...SPEED_VALUES];
  return pool[Math.floor(rng() * pool.length)];
}

interface MapContextType {
  currentStep: AppStep;
  setCurrentStep: (step: AppStep) => void;
  mapData: MapData | null;
  setMapData: (data: MapData | null) => void;
  vehicles: Vehicle[];
  setVehicles: (vehicles: Vehicle[]) => void;
  addVehicle: (vehicle: Vehicle) => void;
  deleteVehicle: (id: string) => void;
  objectives: Objective | null;
  setObjectives: (objectives: Objective | null) => void;
  objectivesDraft: ObjectivesDraft | null;
  setObjectivesDraft: (draft: ObjectivesDraft | null) => void;
  simulationResults: SimulationResult[];
  setSimulationResults: (results: SimulationResult[]) => void;
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  selectedEdgeId: string | null;
  setSelectedEdgeId: (id: string | null) => void;
  selectedSegmentId: string | null;
  setSelectedSegmentId: (id: string | null) => void;
  zoom: number;
  setZoom: (zoom: number) => void;
  // Actions
  addNode: (node: MapNode) => void;
  updateNode: (id: string, updates: Partial<MapNode>) => void;
  removeNode: (id: string) => void;
  promoteSubnodeToNode: (id: string) => void;
  demoteNodeToSubnode: (id: string) => void;
  canDemoteNode: (id: string) => boolean;
  addEdge: (edge: Edge) => void;
  updateEdge: (id: string, updates: Partial<Edge>) => void;
  removeEdge: (id: string) => void;
  updateSegment: (edgeId: string, segmentId: string, updates: Partial<Segment>) => void;
  addSegmentToEdge: (edgeId: string) => void;
  removeSegmentFromEdge: (edgeId: string, segmentId: string) => void;
  rebuildEdgeSegments: (edgeId: string) => void;
  resolveCrossings: () => void;
  generateRandomMap: (seed?: string, params?: GenerationParams) => void;
  createEmptyMap: () => void;
  loadMapFromSeed: (seed: string) => boolean;
  isGraphValid: () => boolean;
  segmentLimits: typeof SEGMENT_LIMITS;
}

const MapContext = createContext<MapContextType | null>(null);

function getRandomColor(): string {
  const h = Math.floor(Math.random() * 360);
  const s = 60 + Math.floor(Math.random() * 30); // 60-90%
  const l = 38 + Math.floor(Math.random() * 22); // 38-60%
  const sl = s / 100;
  const ll = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sl * Math.min(ll, 1 - ll);
  const f = (n: number) => ll - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

function calculateDistance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  // Convert pixels to km (1 pixel = 0.1 km for visualization)
  return Math.sqrt(dx * dx + dy * dy) * 0.1;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function segmentsIntersect(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  p4: { x: number; y: number }
): { intersects: boolean; point?: { x: number; y: number }; t1?: number; t2?: number } {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;
  
  const cross = d1x * d2y - d1y * d2x;
  
  if (Math.abs(cross) < 0.0001) {
    return { intersects: false };
  }
  
  const dx = p3.x - p1.x;
  const dy = p3.y - p1.y;
  
  const t1 = (dx * d2y - dy * d2x) / cross;
  const t2 = (dx * d1y - dy * d1x) / cross;
  
  // Intersection must lie strictly within both segments (not at endpoints).
  const epsilon = 0.05;
  if (t1 > epsilon && t1 < 1 - epsilon && t2 > epsilon && t2 < 1 - epsilon) {
    return {
      intersects: true,
      t1,
      t2,
      point: {
        x: p1.x + t1 * d1x,
        y: p1.y + t1 * d1y,
      },
    };
  }
  
  return { intersects: false };
}

export function generateSegmentsForEdge(
  nodeA: { x: number; y: number },
  nodeB: { x: number; y: number },
  numSegments: number,
  existingSegments?: Segment[]
): Segment[] {
  const segments: Segment[] = [];
  
  const totalDist = Math.sqrt(Math.pow(nodeB.x - nodeA.x, 2) + Math.pow(nodeB.y - nodeA.y, 2));
  const segmentPixelLength = totalDist / numSegments;
  
  const dx = (nodeB.x - nodeA.x) / numSegments;
  const dy = (nodeB.y - nodeA.y) / numSegments;
  
  for (let i = 0; i < numSegments; i++) {
    const startX = nodeA.x + i * dx;
    const startY = nodeA.y + i * dy;
    const endX = nodeA.x + (i + 1) * dx;
    const endY = nodeA.y + (i + 1) * dy;
    
    const distance = segmentPixelLength * 0.1; // 1 pixel = 0.1 km
    
    const existingSeg = existingSegments?.[i];
    
    segments.push({
      id: existingSeg?.id || `seg-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 5)}`,
      startX,
      startY,
      endX,
      endY,
      distance: clamp(distance, SEGMENT_LIMITS.minDistance, SEGMENT_LIMITS.maxDistance),
      speed: existingSeg?.speed ?? pickSpeed(
        clamp(distance, SEGMENT_LIMITS.minDistance, SEGMENT_LIMITS.maxDistance),
        SEGMENT_LIMITS.minSpeed, SEGMENT_LIMITS.maxSpeed,
        Math.random
      ),
      traffic: existingSeg?.traffic ?? clamp(0.15 + Math.random() * 0.20, SEGMENT_LIMITS.minTraffic, SEGMENT_LIMITS.maxTraffic),
    });
  }
  
  return segments;
}

function calculateTotalDistance(segments: Segment[]): number {
  return segments.reduce((sum, seg) => sum + seg.distance, 0);
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Seeded PRNG (mulberry32) — identical seed always yields the same sequence
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRng(seed: number) {
  let s = seed;
  return function (): number {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Seed system ─────────────────────────────────────────────────────────────
// Format M2.<base64url> — full graph state:
//   Nodes/Subnodes : position (x, y), color, name, type
//   Connections    : via edge index references (a → b in node array)
//   Edges          : nodeA index, nodeB index, ordered segment list
//   Segments       : explicit positions (x1,y1,x2,y2) + speed, distance, traffic
//
// Determinism: values are rounded before encoding so the same visual state
// always produces the same seed. Empty graph → seed ''.
// Backward-compatible decode of legacy G1./v2./v1- codes.
// Hex seed (e.g. "A7F3B291") still accepted on import for procedural generation.

function newSeedString(): string {
  return Array.from({ length: 8 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('').toUpperCase();
}

function isHexSeed(s: string): boolean {
  return /^[0-9A-Fa-f]{1,16}$/.test(s);
}

// Rounding helpers for deterministic encoding
function r1(v: number) { return Math.round(v * 10) / 10; }
function r2(v: number) { return Math.round(v * 100) / 100; }
function r3(v: number) { return Math.round(v * 1000) / 1000; }

// Encode full graph state as a portable seed (M2. prefix + base64url).
// Stores: node/subnode positions + type + color + name;
//         edges with nodeA/nodeB indices, and per-segment positions + data.
// Same graph state → identical seed. Empty graph → ''.
function encodeGraphState(nodes: MapNode[], edges: Edge[]): string {
  if (nodes.length === 0 && edges.length === 0) return '';
  const nodeIndex = new Map<string, number>();
  nodes.forEach((n, i) => nodeIndex.set(n.id, i));
  const data = {
    v: 2,
    n: nodes.map(n => ({
      t: n.type === 'node' ? 0 : 1,
      x: r1(n.x),
      y: r1(n.y),
      c: n.color,
      nm: n.name,
    })),
    e: edges.map(e => ({
      a: nodeIndex.get(e.nodeA) ?? 0,
      b: nodeIndex.get(e.nodeB) ?? 0,
      // Each segment stores its explicit canvas positions + road data
      s: e.segments.map(s => ({
        x1: r1(s.startX),
        y1: r1(s.startY),
        x2: r1(s.endX),
        y2: r1(s.endY),
        sp: Math.round(s.speed),
        d: r2(s.distance),
        tr: r3(s.traffic),
      })),
    })),
  };
  const json = JSON.stringify(data);
  const bytes = new TextEncoder().encode(json);
  let binStr = '';
  bytes.forEach(b => { binStr += String.fromCharCode(b); });
  const b64 = btoa(binStr).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return 'M2.' + b64;
}

// Decode a seed back to graph state (returns null if invalid).
// M2. seeds restore exact segment positions.
// Legacy G1./v2./v1- seeds derive segment positions from node coordinates.
function decodeGraphState(code: string): { nodes: MapNode[]; edges: Edge[] } | null {
  try {
    let payload: string;
    let isLegacy = false;
    if (code.startsWith('M2.')) payload = code.slice(3);
    else if (code.startsWith('G1.')) { payload = code.slice(3); isLegacy = true; }
    else if (code.startsWith('v2.')) { payload = code.slice(3); isLegacy = true; }
    else if (code.startsWith('v1-')) { payload = code.slice(3); isLegacy = true; }
    else return null;

    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const binStr = atob(b64);
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
    const json = new TextDecoder().decode(bytes);
    const data = JSON.parse(json);
    if (!Array.isArray(data.n) || !Array.isArray(data.e)) return null;

    const nodes: MapNode[] = data.n.map((n: { nm: string; x: number; y: number; c: string; t: number }) => ({
      id: generateId(n.t === 0 ? 'node' : 'subnode'),
      name: String(n.nm),
      x: Number(n.x),
      y: Number(n.y),
      color: String(n.c),
      type: (n.t === 0 ? 'node' : 'subnode') as 'node' | 'subnode',
    }));

    const edges: Edge[] = data.e.map((e: { a: number; b: number; s: { sp: number; d: number; tr: number; x1?: number; y1?: number; x2?: number; y2?: number }[] }) => {
      const nodeA = nodes[e.a];
      const nodeB = nodes[e.b];
      if (!nodeA || !nodeB) throw new Error('bad ref');
      const segCount = e.s.length;
      const segments: Segment[] = e.s.map((s, i) => {
        // M2: use stored segment positions; legacy G1/v2/v1: derive from node positions
        const startX = !isLegacy && s.x1 !== undefined ? Number(s.x1) : nodeA.x + (nodeB.x - nodeA.x) * (i / segCount);
        const startY = !isLegacy && s.y1 !== undefined ? Number(s.y1) : nodeA.y + (nodeB.y - nodeA.y) * (i / segCount);
        const endX   = !isLegacy && s.x2 !== undefined ? Number(s.x2) : nodeA.x + (nodeB.x - nodeA.x) * ((i + 1) / segCount);
        const endY   = !isLegacy && s.y2 !== undefined ? Number(s.y2) : nodeA.y + (nodeB.y - nodeA.y) * ((i + 1) / segCount);
        return {
          id: generateId('seg'),
          startX,
          startY,
          endX,
          endY,
          speed: snapSpeed(Number(s.sp)),
          distance: Number(s.d),
          traffic: Number(s.tr),
        };
      });
      return {
        id: generateId('edge'),
        nodeA: nodeA.id,
        nodeB: nodeB.id,
        segments,
        totalDistance: segments.reduce((sum: number, sg: Segment) => sum + sg.distance, 0),
      };
    });

    return { nodes, edges };
  } catch {
    return null;
  }
}

// ── Graph validity & seed helpers ──

// Slice an edge's segments between two t-parameters [tFrom, tTo] (0..1 along the edge).
// Preserves speed and traffic; scales distance proportionally.
// Used when splitting edges at intersection points.
function sliceEdgeSegments(
  edge: Edge,
  tFrom: number,
  tTo: number,
  fromNode: { x: number; y: number },
  toNode: { x: number; y: number },
): Segment[] {
  const n = edge.segments.length;
  if (n === 0 || tTo <= tFrom + 0.0001) {
    return [{
      id: generateId('seg'),
      startX: fromNode.x, startY: fromNode.y,
      endX: toNode.x, endY: toNode.y,
      distance: clamp(
        Math.sqrt(Math.pow(toNode.x - fromNode.x, 2) + Math.pow(toNode.y - fromNode.y, 2)) * 0.1,
        SEGMENT_LIMITS.minDistance, SEGMENT_LIMITS.maxDistance,
      ),
      speed: edge.segments[0]?.speed ?? 60,
      traffic: edge.segments[0]?.traffic ?? 0.2,
    }];
  }

  const fracFrom = tFrom * n;
  const fracTo = tTo * n;
  const kFrom = Math.floor(Math.min(fracFrom, n - 1));
  const kTo = Math.floor(Math.min(fracTo - 0.0001, n - 1));
  const result: Segment[] = [];

  for (let i = kFrom; i <= kTo; i++) {
    const seg = edge.segments[i];
    const localFrom = i === kFrom ? fracFrom - kFrom : 0;
    const localTo   = i === kTo   ? Math.min(fracTo - i, 1) : 1;
    if (localTo - localFrom < 0.001) continue;

    result.push({
      id: generateId('seg'),
      startX: seg.startX + localFrom * (seg.endX - seg.startX),
      startY: seg.startY + localFrom * (seg.endY - seg.startY),
      endX:   seg.startX + localTo   * (seg.endX - seg.startX),
      endY:   seg.startY + localTo   * (seg.endY - seg.startY),
      distance: clamp(seg.distance * (localTo - localFrom), SEGMENT_LIMITS.minDistance, SEGMENT_LIMITS.maxDistance),
      speed: seg.speed,
      traffic: seg.traffic,
    });
  }

  if (result.length === 0) {
    return [{
      id: generateId('seg'),
      startX: fromNode.x, startY: fromNode.y,
      endX: toNode.x, endY: toNode.y,
      distance: clamp(
        Math.sqrt(Math.pow(toNode.x - fromNode.x, 2) + Math.pow(toNode.y - fromNode.y, 2)) * 0.1,
        SEGMENT_LIMITS.minDistance, SEGMENT_LIMITS.maxDistance,
      ),
      speed: edge.segments[0]?.speed ?? 60,
      traffic: edge.segments[0]?.traffic ?? 0.2,
    }];
  }

  // Pin exact endpoints to prevent floating-point drift
  result[0] = { ...result[0], startX: fromNode.x, startY: fromNode.y };
  result[result.length - 1] = { ...result[result.length - 1], endX: toNode.x, endY: toNode.y };
  return result;
}

// Check if all nodes/subnodes form a single connected component (no isolated nodes or groups)
function isGraphFullyConnected(nodes: MapNode[], edges: Edge[]): boolean {
  if (nodes.length === 0) return true;
  const adj = new Map<string, string[]>();
  nodes.forEach(n => adj.set(n.id, []));
  edges.forEach(e => {
    adj.get(e.nodeA)?.push(e.nodeB);
    adj.get(e.nodeB)?.push(e.nodeA);
  });
  const visited = new Set<string>([nodes[0].id]);
  const queue = [nodes[0].id];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const nb of adj.get(cur) ?? []) {
      if (!visited.has(nb)) { visited.add(nb); queue.push(nb); }
    }
  }
  return visited.size === nodes.length;
}

// Check whether any two non-adjacent edges cross
function hasEdgeCrossings(nodes: MapNode[], edges: Edge[]): boolean {
  const pos = new Map<string, { x: number; y: number }>();
  nodes.forEach(n => pos.set(n.id, { x: n.x, y: n.y }));
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const ea = edges[i], eb = edges[j];
      if (ea.nodeA === eb.nodeA || ea.nodeA === eb.nodeB ||
          ea.nodeB === eb.nodeA || ea.nodeB === eb.nodeB) continue;
      const pA = pos.get(ea.nodeA), pB = pos.get(ea.nodeB);
      const pC = pos.get(eb.nodeA), pD = pos.get(eb.nodeB);
      if (!pA || !pB || !pC || !pD) continue;
      if (segmentsIntersect(pA, pB, pC, pD).intersects) return true;
    }
  }
  return false;
}

// Compute the seed. Returns '' when the graph is:
//  • empty (no nodes, no edges)
//  • disconnected (isolated nodes or disconnected subgroups)
//  • invalid (crossing edges)
function computeSeed(nodes: MapNode[], edges: Edge[]): string {
  if (nodes.length === 0 && edges.length === 0) return '';
  if (!isGraphFullyConnected(nodes, edges)) return '';
  if (hasEdgeCrossings(nodes, edges)) return '';
  return encodeGraphState(nodes, edges);
}

// ── Crossing resolution ──

// Resolve ALL crossing edge-pairs by inserting junction subnodes at each
// intersection and splitting both edges. Iterates until no crossings remain.
function resolveAllCrossings(
  inputNodes: MapNode[],
  inputEdges: Edge[],
): { nodes: MapNode[]; edges: Edge[] } {
  let nodes = [...inputNodes];
  let edges = [...inputEdges];
  let maxIter = 500;

  while (maxIter-- > 0) {
    const pos = new Map<string, { x: number; y: number }>();
    nodes.forEach(n => pos.set(n.id, { x: n.x, y: n.y }));

    let found = false;
    for (let i = 0; i < edges.length && !found; i++) {
      for (let j = i + 1; j < edges.length && !found; j++) {
        const ea = edges[i], eb = edges[j];
        if (
          ea.nodeA === eb.nodeA || ea.nodeA === eb.nodeB ||
          ea.nodeB === eb.nodeA || ea.nodeB === eb.nodeB
        ) continue;

        const pA = pos.get(ea.nodeA), pB = pos.get(ea.nodeB);
        const pC = pos.get(eb.nodeA), pD = pos.get(eb.nodeB);
        if (!pA || !pB || !pC || !pD) continue;

        const result = segmentsIntersect(pA, pB, pC, pD);
        if (
          !result.intersects ||
          !result.point ||
          result.t1 === undefined ||
          result.t2 === undefined
        ) continue;

        const subnode: MapNode = {
          id: generateId('subnode'),
          name: 'Junction',
          x: Math.round(result.point.x * 10) / 10,
          y: Math.round(result.point.y * 10) / 10,
          color: '#6B7280',
          type: 'subnode',
        };

        const ea1 = sliceEdgeSegments(ea, 0, result.t1, pA, subnode);
        const ea2 = sliceEdgeSegments(ea, result.t1, 1, subnode, pB);
        const eb1 = sliceEdgeSegments(eb, 0, result.t2, pC, subnode);
        const eb2 = sliceEdgeSegments(eb, result.t2, 1, subnode, pD);

        nodes = [...nodes, subnode];
        edges = [
          ...edges.filter((_, idx) => idx !== i && idx !== j),
          { id: generateId('edge'), nodeA: ea.nodeA, nodeB: subnode.id, segments: ea1, totalDistance: calculateTotalDistance(ea1) },
          { id: generateId('edge'), nodeA: subnode.id, nodeB: ea.nodeB, segments: ea2, totalDistance: calculateTotalDistance(ea2) },
          { id: generateId('edge'), nodeA: eb.nodeA, nodeB: subnode.id, segments: eb1, totalDistance: calculateTotalDistance(eb1) },
          { id: generateId('edge'), nodeA: subnode.id, nodeB: eb.nodeB, segments: eb2, totalDistance: calculateTotalDistance(eb2) },
        ];
        found = true;
      }
    }
    if (!found) break;
  }
  return { nodes, edges };
}

// Ensure the graph is a single connected component.
// Removes isolated nodes, then bridges disconnected groups with the shortest
// possible edges. Calls resolveAllCrossings at the end to fix any bridges
// that might cross existing edges.
function bridgeComponents(
  inputNodes: MapNode[],
  inputEdges: Edge[],
): { nodes: MapNode[]; edges: Edge[] } {
  // Remove nodes with no edges
  const connectedIds = new Set<string>();
  inputEdges.forEach(e => { connectedIds.add(e.nodeA); connectedIds.add(e.nodeB); });
  let workNodes = inputNodes.filter(n => connectedIds.has(n.id));
  let workEdges = [...inputEdges];

  if (workNodes.length === 0) return { nodes: workNodes, edges: workEdges };

  const nodePos = new Map<string, { x: number; y: number }>();
  workNodes.forEach(n => nodePos.set(n.id, { x: n.x, y: n.y }));

  const findComponents = (ns: MapNode[], es: Edge[]): string[][] => {
    const adj = new Map<string, string[]>();
    ns.forEach(n => adj.set(n.id, []));
    es.forEach(e => {
      adj.get(e.nodeA)?.push(e.nodeB);
      adj.get(e.nodeB)?.push(e.nodeA);
    });
    const visited = new Set<string>();
    const comps: string[][] = [];
    for (const n of ns) {
      if (visited.has(n.id)) continue;
      const comp: string[] = [];
      const q = [n.id];
      visited.add(n.id);
      while (q.length) {
        const cur = q.shift()!;
        comp.push(cur);
        for (const nb of adj.get(cur) ?? []) {
          if (!visited.has(nb)) { visited.add(nb); q.push(nb); }
        }
      }
      comps.push(comp);
    }
    return comps;
  };

  let components = findComponents(workNodes, workEdges);
  while (components.length > 1) {
    let bestDist = Infinity, bestA = '', bestB = '', bestCi = 1;
    for (let ci = 1; ci < components.length; ci++) {
      for (const aid of components[0]) {
        for (const bid of components[ci]) {
          const pA = nodePos.get(aid)!, pB = nodePos.get(bid)!;
          const d = (pB.x - pA.x) ** 2 + (pB.y - pA.y) ** 2;
          if (d < bestDist) { bestDist = d; bestA = aid; bestB = bid; bestCi = ci; }
        }
      }
    }
    const pA = nodePos.get(bestA)!, pB = nodePos.get(bestB)!;
    const segs = generateSegmentsForEdge(pA, pB, 1);
    workEdges.push({
      id: generateId('edge'),
      nodeA: bestA,
      nodeB: bestB,
      segments: segs,
      totalDistance: calculateTotalDistance(segs),
    });
    components[0] = [...components[0], ...components[bestCi]];
    components.splice(bestCi, 1);
  }
  return resolveAllCrossings(workNodes, workEdges);
}

// Deterministic color from PRNG
function seededColor(rng: () => number): string {
  const h = Math.floor(rng() * 360);
  const s = 60 + Math.floor(rng() * 30);
  const l = 38 + Math.floor(rng() * 22);
  const sl = s / 100;
  const ll = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sl * Math.min(ll, 1 - ll);
  const f = (n: number) => ll - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

// Deterministic segments from PRNG, using optional generation params for traffic/speed
function seededSegments(
  nodeA: { x: number; y: number },
  nodeB: { x: number; y: number },
  numSegments: number,
  rng: () => number,
  params?: Pick<GenerationParams, 'trafficMean' | 'trafficVariation' | 'speedMin' | 'speedMax'>,
): Segment[] {
  const trafficMean = params?.trafficMean ?? 0.22;
  const trafficVar  = params?.trafficVariation ?? 0.10;
  const speedMin = params?.speedMin ?? 30;
  const speedMax = params?.speedMax ?? 110;

  const segments: Segment[] = [];
  const totalDist = Math.sqrt(Math.pow(nodeB.x - nodeA.x, 2) + Math.pow(nodeB.y - nodeA.y, 2));
  const segPixLen = totalDist / numSegments;
  const dx = (nodeB.x - nodeA.x) / numSegments;
  const dy = (nodeB.y - nodeA.y) / numSegments;
  for (let i = 0; i < numSegments; i++) {
    const distance = segPixLen * 0.1;
    segments.push({
      id: `seg-s-${i}-${Math.floor(rng() * 1e9)}`,
      startX: nodeA.x + i * dx,
      startY: nodeA.y + i * dy,
      endX: nodeA.x + (i + 1) * dx,
      endY: nodeA.y + (i + 1) * dy,
      distance: clamp(distance, SEGMENT_LIMITS.minDistance, SEGMENT_LIMITS.maxDistance),
      speed: pickSpeed(
        clamp(distance, SEGMENT_LIMITS.minDistance, SEGMENT_LIMITS.maxDistance),
        speedMin, speedMax, rng
      ),
      traffic: clamp(trafficMean - trafficVar + rng() * trafficVar * 2, SEGMENT_LIMITS.minTraffic, SEGMENT_LIMITS.maxTraffic),
    });
  }
  return segments;
}

export function MapProvider({ children }: { children: React.ReactNode }) {
  const [currentStep, setCurrentStep] = useState<AppStep>('select-model');
  const [mapData, setMapData] = useState<MapData | null>(null);
  const DEFAULT_VEHICLES: Vehicle[] = [
    { id: 'v1', name: 'Car', speedMax: 120, fuelCapacity: 50, transportCapacity: 4, color: '#3B82F6' },
    { id: 'v2', name: 'Truck', speedMax: 80, fuelCapacity: 200, transportCapacity: 20, color: '#10B981' },
    { id: 'v3', name: 'Motorcycle', speedMax: 150, fuelCapacity: 15, transportCapacity: 1, color: '#F59E0B' },
  ];
  const [vehicles, setVehicles] = useState<Vehicle[]>(DEFAULT_VEHICLES);

  // Load vehicles from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('vehicles');
      if (stored) {
        const parsed = JSON.parse(stored) as Vehicle[];
        if (Array.isArray(parsed) && parsed.length > 0) setVehicles(parsed);
      }
    } catch {}
  }, []);

  const persistVehicles = useCallback((vs: Vehicle[]) => {
    setVehicles(vs);
    try { localStorage.setItem('vehicles', JSON.stringify(vs)); } catch {}
  }, []);

  const addVehicle = useCallback((vehicle: Vehicle) => {
    setVehicles(prev => {
      const next = [...prev, vehicle];
      try { localStorage.setItem('vehicles', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const deleteVehicle = useCallback((id: string) => {
    setVehicles(prev => {
      const next = prev.filter(v => v.id !== id);
      try { localStorage.setItem('vehicles', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);
  const [objectives, setObjectives] = useState<Objective | null>(null);
  const [objectivesDraft, setObjectivesDraft] = useState<ObjectivesDraft | null>(null);
  const [simulationResults, setSimulationResults] = useState<SimulationResult[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  const isConnected = useCallback((nodeId: string, edges: Edge[]): boolean => {
    return edges.some(e => e.nodeA === nodeId || e.nodeB === nodeId);
  }, []);

  const getConnectedEdges = useCallback((nodeId: string, edges: Edge[]): Edge[] => {
    return edges.filter(e => e.nodeA === nodeId || e.nodeB === nodeId);
  }, []);

  const canDemoteNode = useCallback((nodeId: string): boolean => {
    if (!mapData) return false;
    const node = mapData.nodes.find(n => n.id === nodeId);
    if (!node || node.type !== 'node') return false;
    
    return isConnected(nodeId, mapData.edges);
  }, [mapData, isConnected]);

  const addNode = useCallback((node: MapNode) => {
    setMapData(prev => {
      if (!prev) return prev;
      if (prev.nodes.length >= 100) return prev;
      const newNodes = [...prev.nodes, node];
      return { ...prev, nodes: newNodes, seed: computeSeed(newNodes, prev.edges) };
    });
  }, []);

  const updateNode = useCallback((id: string, updates: Partial<MapNode>) => {
    setMapData(prev => {
      if (!prev) return prev;
      
      const updatedNodes = prev.nodes.map(n => n.id === id ? { ...n, ...updates } : n);
      
      // Rebuild all edges connected to the moved node.
      if (updates.x !== undefined || updates.y !== undefined) {
        const updatedEdges = prev.edges.map(edge => {
          const isConnected = edge.nodeA === id || edge.nodeB === id;
          if (!isConnected) return edge;
          
          const nodeA = updatedNodes.find(n => n.id === edge.nodeA);
          const nodeB = updatedNodes.find(n => n.id === edge.nodeB);
          if (!nodeA || !nodeB) return edge;
          
          const newSegments = generateSegmentsForEdge(
            { x: nodeA.x, y: nodeA.y },
            { x: nodeB.x, y: nodeB.y },
            edge.segments.length,
            edge.segments
          );
          
          return {
            ...edge,
            segments: newSegments,
            totalDistance: calculateTotalDistance(newSegments),
          };
        });
        
        return { ...prev, nodes: updatedNodes, edges: updatedEdges, seed: computeSeed(updatedNodes, updatedEdges) };
      }
      
      return { ...prev, nodes: updatedNodes, seed: computeSeed(updatedNodes, prev.edges) };
    });
  }, []);

  const removeNode = useCallback((id: string) => {
    setMapData(prev => {
      if (!prev) return prev;
      
      const updatedEdges = prev.edges.filter(e => e.nodeA !== id && e.nodeB !== id);
      
      const newNodes = prev.nodes.filter(n => n.id !== id);
      return {
        ...prev,
        nodes: newNodes,
        edges: updatedEdges,
        seed: computeSeed(newNodes, updatedEdges),
      };
    });
    setSelectedNodeId(null);
  }, []);

  const promoteSubnodeToNode = useCallback((subnodeId: string) => {
    setMapData(prev => {
      if (!prev) return prev;
      
      const subnode = prev.nodes.find(n => n.id === subnodeId && n.type === 'subnode');
      if (!subnode) return prev;
      
      const newNodeId = generateId('node');
      
      const promotedNode: MapNode = {
        ...subnode,
        id: newNodeId,
        type: 'node',
        color: getRandomColor(),
        name: `City ${prev.nodes.filter(n => n.type === 'node').length + 1}`,
      };
      
      const updatedEdges = prev.edges.map(edge => {
        let updated = { ...edge };
        if (edge.nodeA === subnodeId) {
          updated.nodeA = newNodeId;
        }
        if (edge.nodeB === subnodeId) {
          updated.nodeB = newNodeId;
        }
        return updated;
      });
      
      const updatedNodes = prev.nodes.filter(n => n.id !== subnodeId);
      updatedNodes.push(promotedNode);
      
      return { ...prev, nodes: updatedNodes, edges: updatedEdges, seed: computeSeed(updatedNodes, updatedEdges) };
    });
    
    setSelectedNodeId(null);
  }, []);

  const demoteNodeToSubnode = useCallback((nodeId: string) => {
    setMapData(prev => {
      if (!prev) return prev;
      
      const node = prev.nodes.find(n => n.id === nodeId && n.type === 'node');
      if (!node) return prev;
      
      const connectedEdges = getConnectedEdges(nodeId, prev.edges);
      if (connectedEdges.length === 0) return prev;
      
      const newSubnodeId = generateId('subnode');
      
      const demotedSubnode: MapNode = {
        ...node,
        id: newSubnodeId,
        type: 'subnode',
        color: '#6B7280',
      };
      
      const updatedEdges = prev.edges.map(edge => {
        let updated = { ...edge };
        if (edge.nodeA === nodeId) {
          updated.nodeA = newSubnodeId;
        }
        if (edge.nodeB === nodeId) {
          updated.nodeB = newSubnodeId;
        }
        return updated;
      });
      
      const updatedNodes = prev.nodes.filter(n => n.id !== nodeId);
      updatedNodes.push(demotedSubnode);
      
      return { ...prev, nodes: updatedNodes, edges: updatedEdges, seed: computeSeed(updatedNodes, updatedEdges) };
    });
    
    setSelectedNodeId(null);
  }, [getConnectedEdges]);

  const addEdge = useCallback((edge: Edge) => {
    setMapData(prev => {
      if (!prev) return prev;
      const { nodes, edges } = resolveAllCrossings(prev.nodes, [...prev.edges, edge]);
      return { ...prev, nodes, edges, seed: computeSeed(nodes, edges) };
    });
  }, []);

  // Resolves edge crossings; typically called after a drag operation.
  const resolveCrossings = useCallback(() => {
    setMapData(prev => {
      if (!prev) return prev;
      const { nodes, edges } = resolveAllCrossings(prev.nodes, prev.edges);
      return { ...prev, nodes, edges, seed: computeSeed(nodes, edges) };
    });
  }, []);

  const updateEdge = useCallback((id: string, updates: Partial<Edge>) => {
    setMapData(prev => {
      if (!prev) return prev;
      const updatedEdges = prev.edges.map(e => {
        if (e.id !== id) return e;
        const updated = { ...e, ...updates };
        if (updates.segments) {
          updated.totalDistance = calculateTotalDistance(updates.segments);
        }
        return updated;
      });
      return { ...prev, edges: updatedEdges, seed: computeSeed(prev.nodes, updatedEdges) };
    });
  }, []);

  const removeEdge = useCallback((id: string) => {
    setMapData(prev => {
      if (!prev) return prev;
      const filteredEdges = prev.edges.filter(e => e.id !== id);
      return {
        ...prev,
        edges: filteredEdges,
        seed: computeSeed(prev.nodes, filteredEdges),
      };
    });
    setSelectedEdgeId(null);
    setSelectedSegmentId(null);
  }, []);

  const updateSegment = useCallback((edgeId: string, segmentId: string, updates: Partial<Segment>) => {
    setMapData(prev => {
      if (!prev) return prev;
      const updatedEdges = prev.edges.map(e => {
        if (e.id !== edgeId) return e;
        const updatedSegments = e.segments.map(s => {
          if (s.id !== segmentId) return s;
          return {
            ...s,
            ...updates,
            distance: updates.distance !== undefined
              ? clamp(updates.distance, SEGMENT_LIMITS.minDistance, SEGMENT_LIMITS.maxDistance)
              : s.distance,
            speed: updates.speed !== undefined
              ? snapSpeed(updates.speed)
              : s.speed,
            traffic: updates.traffic !== undefined
              ? clamp(updates.traffic, SEGMENT_LIMITS.minTraffic, SEGMENT_LIMITS.maxTraffic)
              : s.traffic,
          };
        });
        return { ...e, segments: updatedSegments, totalDistance: calculateTotalDistance(updatedSegments) };
      });
      return { ...prev, edges: updatedEdges, seed: computeSeed(prev.nodes, updatedEdges) };
    });
  }, []);

  const addSegmentToEdge = useCallback((edgeId: string) => {
    setMapData(prev => {
      if (!prev) return prev;
      const updatedEdges = prev.edges.map(e => {
        if (e.id !== edgeId) return e;
        if (e.segments.length >= SEGMENT_LIMITS.maxSegmentsPerEdge) return e;
        const nodeA = prev.nodes.find(n => n.id === e.nodeA);
        const nodeB = prev.nodes.find(n => n.id === e.nodeB);
        if (!nodeA || !nodeB) return e;
        const newSegments = generateSegmentsForEdge(
          { x: nodeA.x, y: nodeA.y },
          { x: nodeB.x, y: nodeB.y },
          e.segments.length + 1,
          e.segments
        );
        return { ...e, segments: newSegments, totalDistance: calculateTotalDistance(newSegments) };
      });
      return { ...prev, edges: updatedEdges, seed: computeSeed(prev.nodes, updatedEdges) };
    });
  }, []);

  const removeSegmentFromEdge = useCallback((edgeId: string, segmentId: string) => {
    setMapData(prev => {
      if (!prev) return prev;
      
      const edge = prev.edges.find(e => e.id === edgeId);
      if (!edge) return prev;
      
      // Deleting the last segment removes the entire edge.
      if (edge.segments.length <= 1) {
        setSelectedEdgeId(null);
        setSelectedSegmentId(null);
        const remainingEdges = prev.edges.filter(e => e.id !== edgeId);
        return { ...prev, edges: remainingEdges, seed: computeSeed(prev.nodes, remainingEdges) };
      }
      
      const nodeA = prev.nodes.find(n => n.id === edge.nodeA);
      const nodeB = prev.nodes.find(n => n.id === edge.nodeB);
      if (!nodeA || !nodeB) return prev;
      
      // Regenerate all segments for the edge with one fewer subdivision.
      const newSegments = generateSegmentsForEdge(
        { x: nodeA.x, y: nodeA.y },
        { x: nodeB.x, y: nodeB.y },
        edge.segments.length - 1
      );
      
      const rebuiltEdges = prev.edges.map(e => {
        if (e.id !== edgeId) return e;
        return { ...e, segments: newSegments, totalDistance: calculateTotalDistance(newSegments) };
      });
      return { ...prev, edges: rebuiltEdges, seed: computeSeed(prev.nodes, rebuiltEdges) };
    });
    setSelectedSegmentId(null);
  }, []);

  const rebuildEdgeSegments = useCallback((edgeId: string) => {
    setMapData(prev => {
      if (!prev) return prev;
      const updatedEdges = prev.edges.map(e => {
        if (e.id !== edgeId) return e;
        const nodeA = prev.nodes.find(n => n.id === e.nodeA);
        const nodeB = prev.nodes.find(n => n.id === e.nodeB);
        if (!nodeA || !nodeB) return e;
        const newSegments = generateSegmentsForEdge(
          { x: nodeA.x, y: nodeA.y },
          { x: nodeB.x, y: nodeB.y },
          e.segments.length,
          e.segments
        );
        return { ...e, segments: newSegments, totalDistance: calculateTotalDistance(newSegments) };
      });
      return { ...prev, edges: updatedEdges, seed: computeSeed(prev.nodes, updatedEdges) };
    });
  }, []);

  const generateRandomMap = useCallback((seed?: string, params?: GenerationParams) => {
    const seedStr = (seed && isHexSeed(seed)) ? seed.toUpperCase() : newSeedString();
    const rng = makeRng(hashString(seedStr));

    // ── Generation parameters (with defaults) ──
    const p: Required<GenerationParams> = {
      nodeCount:          params?.nodeCount          ?? 30,
      edgeDensity:        params?.edgeDensity        ?? 1.8,
      maxSegmentsPerEdge: params?.maxSegmentsPerEdge ?? 3,
      trafficMean:        params?.trafficMean        ?? 0.22,
      trafficVariation:   params?.trafficVariation   ?? 0.10,
      speedMin:           params?.speedMin           ?? 30,
      speedMax:           params?.speedMax           ?? 110,
      subnodeDensity:     params?.subnodeDensity     ?? 0.12,
    };

    // Deterministic node and edge placement
    const numNodes = Math.max(2, Math.round(p.nodeCount));
    const maxSubnodes = Math.max(0, Math.round(numNodes * p.subnodeDensity));

    const nodes: MapNode[] = [];
    const edges: Edge[] = [];
    const subnodes: MapNode[] = [];

    const canvasWidth = 2400;
    const canvasHeight = 1800;
    const margin = 150;
    const minSpacing = 160;

    for (let i = 0; i < numNodes; i++) {
      let attempts = 0;
      let x = 0, y = 0;
      let valid = false;
      do {
        x = margin + rng() * (canvasWidth - 2 * margin);
        y = margin + rng() * (canvasHeight - 2 * margin);
        valid = nodes.every(n => {
          const dist = Math.sqrt(Math.pow(n.x - x, 2) + Math.pow(n.y - y, 2));
          return dist >= minSpacing;
        });
        attempts++;
      } while (!valid && attempts < 150);

      nodes.push({
        id: `node-${i}`,
        name: `City ${i + 1}`,
        x,
        y,
        color: seededColor(rng),
        type: 'node',
      });
    }

    const numTargetEdges = Math.floor(numNodes * p.edgeDensity);
    const connectedPairs = new Set<string>();

    interface EdgeLine {
      p1: { x: number; y: number };
      p2: { x: number; y: number };
      edgeId: string;
    }
    const edgeLines: EdgeLine[] = [];

    const potentialEdges: { nodeA: MapNode; nodeB: MapNode; distance: number }[] = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dist = Math.sqrt(
          Math.pow(nodes[j].x - nodes[i].x, 2) +
          Math.pow(nodes[j].y - nodes[i].y, 2)
        );
        potentialEdges.push({ nodeA: nodes[i], nodeB: nodes[j], distance: dist });
      }
    }
    potentialEdges.sort((a, b) => a.distance - b.distance);

    let subnodeCounter = 0;
    let edgeCounter = 0;

    for (const potential of potentialEdges) {
      if (edges.length >= numTargetEdges) break;

      const pairKey = [potential.nodeA.id, potential.nodeB.id].sort().join('-');
      if (connectedPairs.has(pairKey)) continue;

      const p1 = { x: potential.nodeA.x, y: potential.nodeA.y };
      const p2 = { x: potential.nodeB.x, y: potential.nodeB.y };

      const intersections: {
        point: { x: number; y: number };
        edgeId: string;
        t1: number;
        t2: number;
      }[] = [];

      for (const existingLine of edgeLines) {
        const result = segmentsIntersect(p1, p2, existingLine.p1, existingLine.p2);
        if (result.intersects && result.point && result.t1 !== undefined && result.t2 !== undefined) {
          intersections.push({ point: result.point, edgeId: existingLine.edgeId, t1: result.t1, t2: result.t2 });
        }
      }

      if (intersections.length > 0) {
        if (subnodes.length >= maxSubnodes) continue;

        intersections.sort((a, b) => a.t1 - b.t1);
        const intersection = intersections[0];

        const subnodeId = `subnode-${subnodeCounter}`;
        const subnode: MapNode = {
          id: subnodeId,
          name: `Junction ${++subnodeCounter}`,
          x: intersection.point.x,
          y: intersection.point.y,
          color: '#6B7280',
          type: 'subnode',
        };
        subnodes.push(subnode);

        const existingEdgeIndex = edges.findIndex(e => e.id === intersection.edgeId);
        if (existingEdgeIndex !== -1) {
          const existingEdge = edges[existingEdgeIndex];
          const existingNodeA = [...nodes, ...subnodes].find(n => n.id === existingEdge.nodeA);
          const existingNodeB = [...nodes, ...subnodes].find(n => n.id === existingEdge.nodeB);

          if (existingNodeA && existingNodeB) {
            edges.splice(existingEdgeIndex, 1);

            const seg1 = seededSegments({ x: existingNodeA.x, y: existingNodeA.y }, { x: subnode.x, y: subnode.y }, 1, rng, p);
            const eId1 = `edge-${edgeCounter++}`;
            edges.push({ id: eId1, nodeA: existingNodeA.id, nodeB: subnodeId, segments: seg1, totalDistance: calculateTotalDistance(seg1) });

            const seg2 = seededSegments({ x: subnode.x, y: subnode.y }, { x: existingNodeB.x, y: existingNodeB.y }, 1, rng, p);
            const eId2 = `edge-${edgeCounter++}`;
            edges.push({ id: eId2, nodeA: subnodeId, nodeB: existingNodeB.id, segments: seg2, totalDistance: calculateTotalDistance(seg2) });

            const oldLineIndex = edgeLines.findIndex(l => l.edgeId === existingEdge.id);
            if (oldLineIndex !== -1) edgeLines.splice(oldLineIndex, 1);
            edgeLines.push({ p1: { x: existingNodeA.x, y: existingNodeA.y }, p2: { x: subnode.x, y: subnode.y }, edgeId: eId1 });
            edgeLines.push({ p1: { x: subnode.x, y: subnode.y }, p2: { x: existingNodeB.x, y: existingNodeB.y }, edgeId: eId2 });
          }
        }

        const ns1 = seededSegments(p1, { x: subnode.x, y: subnode.y }, 1, rng, p);
        const ne1 = `edge-${edgeCounter++}`;
        edges.push({ id: ne1, nodeA: potential.nodeA.id, nodeB: subnodeId, segments: ns1, totalDistance: calculateTotalDistance(ns1) });
        edgeLines.push({ p1, p2: { x: subnode.x, y: subnode.y }, edgeId: ne1 });

        const ns2 = seededSegments({ x: subnode.x, y: subnode.y }, p2, 1, rng, p);
        const ne2 = `edge-${edgeCounter++}`;
        edges.push({ id: ne2, nodeA: subnodeId, nodeB: potential.nodeB.id, segments: ns2, totalDistance: calculateTotalDistance(ns2) });
        edgeLines.push({ p1: { x: subnode.x, y: subnode.y }, p2, edgeId: ne2 });

        connectedPairs.add(pairKey);
      } else {
        const numSegments = 1 + Math.floor(rng() * p.maxSegmentsPerEdge);
        const segments = seededSegments(p1, p2, numSegments, rng, p);
        const eId = `edge-${edgeCounter++}`;
        edges.push({ id: eId, nodeA: potential.nodeA.id, nodeB: potential.nodeB.id, segments, totalDistance: calculateTotalDistance(segments) });
        connectedPairs.add(pairKey);
        edgeLines.push({ p1, p2, edgeId: eId });
      }
    }

    // Ensure minimum subnodes based on subnodeDensity param
    const allNodes = [...nodes, ...subnodes];
    const minSubnodes = maxSubnodes;

    if (subnodes.length < minSubnodes) {
      const directEdges = edges
        .filter(e => nodes.some(n => n.id === e.nodeA) && nodes.some(n => n.id === e.nodeB))
        .sort((a, b) => b.totalDistance - a.totalDistance);

      for (const longEdge of directEdges) {
        if (subnodes.length >= minSubnodes) break;

        const nA = allNodes.find(n => n.id === longEdge.nodeA);
        const nB = allNodes.find(n => n.id === longEdge.nodeB);
        if (!nA || !nB) continue;

        const midX = (nA.x + nB.x) / 2;
        const midY = (nA.y + nB.y) / 2;

        const midSubnodeId = `subnode-${subnodeCounter}`;
        const midSubnode: MapNode = {
          id: midSubnodeId,
          name: `Junction ${++subnodeCounter}`,
          x: midX,
          y: midY,
          color: '#6B7280',
          type: 'subnode',
        };
        subnodes.push(midSubnode);
        allNodes.push(midSubnode);

        const edgeIdx = edges.findIndex(e => e.id === longEdge.id);
        if (edgeIdx !== -1) edges.splice(edgeIdx, 1);

        const s1 = seededSegments({ x: nA.x, y: nA.y }, { x: midX, y: midY }, 1, rng, p);
        edges.push({ id: `edge-${edgeCounter++}`, nodeA: nA.id, nodeB: midSubnodeId, segments: s1, totalDistance: calculateTotalDistance(s1) });

        const s2 = seededSegments({ x: midX, y: midY }, { x: nB.x, y: nB.y }, 1, rng, p);
        edges.push({ id: `edge-${edgeCounter++}`, nodeA: midSubnodeId, nodeB: nB.id, segments: s2, totalDistance: calculateTotalDistance(s2) });
      }
    }

    // Post-generation: resolve crossings and bridge isolated components.
    const allFinalNodes = [...nodes, ...subnodes];
    const { nodes: rxNodes, edges: rxEdges } = resolveAllCrossings(allFinalNodes, edges);
    const { nodes: finalNodes, edges: finalEdges } = bridgeComponents(rxNodes, rxEdges);

    setMapData({ nodes: finalNodes, edges: finalEdges, seed: computeSeed(finalNodes, finalEdges) });
    setZoom(1);
    setCurrentStep('map-editor');
  }, []);

  const createEmptyMap = useCallback(() => {
    setMapData({
      nodes: [],
      edges: [],
      seed: '',
    });
    setZoom(1);
    setCurrentStep('map-editor');
  }, []);

  const loadMapFromSeed = useCallback((seed: string): boolean => {
    const trimmed = seed.trim();
    // Hex seed → procedural generation
    if (isHexSeed(trimmed)) {
      generateRandomMap(trimmed.toUpperCase());
      return true;
    }
    // Export code → full graph decode
    const result = decodeGraphState(trimmed);
    if (!result) return false;
    setMapData({ nodes: result.nodes, edges: result.edges, seed: computeSeed(result.nodes, result.edges) });
    setZoom(1);
    setCurrentStep('map-editor');
    return true;
  }, [generateRandomMap]);

  const isGraphValid = useCallback((): boolean => {
    if (!mapData || mapData.nodes.length === 0) return true;
    // Check 1: no isolated nodes
    for (const node of mapData.nodes) {
      const connected = mapData.edges.some(e => e.nodeA === node.id || e.nodeB === node.id);
      if (!connected) return false;
    }
    // Check 2: no crossing edges (edges that don't share an endpoint but intersect)
    const getPos = (id: string) => mapData.nodes.find(n => n.id === id);
    for (let i = 0; i < mapData.edges.length; i++) {
      for (let j = i + 1; j < mapData.edges.length; j++) {
        const ea = mapData.edges[i];
        const eb = mapData.edges[j];
        if (
          ea.nodeA === eb.nodeA || ea.nodeA === eb.nodeB ||
          ea.nodeB === eb.nodeA || ea.nodeB === eb.nodeB
        ) continue;
        const pA = getPos(ea.nodeA);
        const pB = getPos(ea.nodeB);
        const pC = getPos(eb.nodeA);
        const pD = getPos(eb.nodeB);
        if (!pA || !pB || !pC || !pD) continue;
        if (
          segmentsIntersect(
            { x: pA.x, y: pA.y },
            { x: pB.x, y: pB.y },
            { x: pC.x, y: pC.y },
            { x: pD.x, y: pD.y }
          ).intersects
        ) return false;
      }
    }
    return true;
  }, [mapData]);

  return (
    <MapContext.Provider value={{
      currentStep,
      setCurrentStep,
      mapData,
      setMapData,
      vehicles,
      setVehicles: persistVehicles,
      addVehicle,
      deleteVehicle,
      objectives,
      setObjectives,
      objectivesDraft,
      setObjectivesDraft,
      simulationResults,
      setSimulationResults,
      selectedNodeId,
      setSelectedNodeId,
      selectedEdgeId,
      setSelectedEdgeId,
      selectedSegmentId,
      setSelectedSegmentId,
      zoom,
      setZoom,
      addNode,
      updateNode,
      removeNode,
      promoteSubnodeToNode,
      demoteNodeToSubnode,
      canDemoteNode,
      addEdge,
      updateEdge,
      removeEdge,
      updateSegment,
      addSegmentToEdge,
      removeSegmentFromEdge,
      rebuildEdgeSegments,
      resolveCrossings,
      generateRandomMap,
      createEmptyMap,
      loadMapFromSeed,
      isGraphValid,
      segmentLimits: SEGMENT_LIMITS,
    }}>
      {children}
    </MapContext.Provider>
  );
}

export function useMap() {
  const context = useContext(MapContext);
  if (!context) {
    throw new Error('useMap must be used within a MapProvider');
  }
  return context;
}
