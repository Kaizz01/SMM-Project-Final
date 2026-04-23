export interface MapNode {
  id: string;
  name: string;
  x: number;
  y: number;
  color: string;
  type: 'node' | 'subnode';
}

export interface Segment {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  distance: number; // km (0.1-100)
  speed: number;    // km/h (10-200)
  traffic: number;  // 0-1
}

export interface Edge {
  id: string;
  nodeA: string; // endpoint node ID
  nodeB: string; // endpoint node ID
  segments: Segment[];
  totalDistance: number; // km
}

export interface Vehicle {
  id: string;
  name: string;
  speedMax: number;           // km/h
  fuelCapacity: number;       // L
  transportCapacity: number;  // units
  color: string;
}

export interface MapData {
  nodes: MapNode[];
  edges: Edge[];
  seed: string;
}

export interface Objective {
  id: string;
  citiesToVisit: string[];                    // Node IDs ordered: starts → normals → ends
  orderedVisit: boolean;
  vehicleSelection: Record<string, number>;   // vehicleId → count (≥0)
  startCities: string[];                      // Node IDs assigned as departure
  endCities: string[];                        // Node IDs assigned as arrival (optional)
  maxTime: number | null;                     // minutes, null = no limit
  maxDistance: number | null;                 // km, null = no limit
  totalUnits: number;                         // units of cargo to distribute (0 = no cargo)
  vehicleLoads: Record<string, number>;       // vehicleId → units override (0 = auto-distribute)
  optimizeFor: 'time' | 'distance' | 'fuel';
  returnToStart: boolean;
}

// Temporary draft saved while navigating away from the objectives form
export interface ObjectivesDraft {
  startCities: string[];
  normalCities: string[];
  endCities: string[];
  orderedVisit: boolean;
  vehicleSelection: Record<string, number>;
  maxTimeEnabled: boolean;
  maxTime: number;
  maxDistanceEnabled: boolean;
  maxDistance: number;
  totalUnits: number;
  vehicleLoads: Record<string, number>;
  optimizeFor: 'time' | 'distance' | 'fuel';
  returnToStart: boolean;
}

export interface VehicleRoute {
  vehicleId: string;
  vehicleName: string;
  color: string;
  instanceIndex: number;    // index among vehicles of the same type (0-based)
  route: string[];          // visited city IDs in visit order
  pathNodes: string[];      // all node IDs traversed, including subnodes
  pathEdges: string[];      // edge IDs traversed
  totalTime: number;        // minutes
  totalDistance: number;    // km
  fuelUsed: number;         // L
  unitsCarried: number;
  feasible: boolean;
  constraintBreaches: string[];
}

export interface SimulationResult {
  id: string;
  vehicleRoutes: VehicleRoute[];
  totalTime: number;      // max across vehicles, minutes
  totalDistance: number;  // sum across vehicles, km
  fuelUsed: number;       // sum across vehicles, L
  feasible: boolean;
  constraintBreaches: string[];
  optimizeScore: number;       // lower = better, unit depends on optimizeFor
}

export type AppStep = 'select-model' | 'map-editor' | 'objectives' | 'simulation' | 'results';

export interface GenerationParams {
  nodeCount: number;          // 5–80, default 30
  edgeDensity: number;        // edges per node ratio 1.0–3.5, default 1.8
  maxSegmentsPerEdge: number; // 1–10, default 3
  trafficMean: number;        // 0–1, default 0.22
  trafficVariation: number;   // 0–0.5, default 0.10
  speedMin: number;           // min allowed fixed speed (km/h), default 30
  speedMax: number;           // max allowed fixed speed (km/h), default 110
  subnodeDensity: number;     // ratio of subnodes to nodes 0–0.5, default 0.12
}

export interface AppState {
  currentStep: AppStep;
  mapData: MapData | null;
  objectives: Objective | null;
  vehicles: Vehicle[];
  simulationResults: SimulationResult[];
}
