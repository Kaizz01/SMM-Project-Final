"""
"""Route optimizer — Python solver backend.

Endpoints:
  GET  /health  liveness probe
  POST /solve   body: { mapData, objective, vehicles } -> { frames, result }
"""

from __future__ import annotations
import heapq, math
from dataclasses import dataclass, field
from typing import Any
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Route Optimizer — Python Solver")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["*"],
)

# -- Request/response models


class Segment(BaseModel):
    id: str
    startX: float
    startY: float
    endX: float
    endY: float
    distance: float          # km
    speed: float             # km/h
    traffic: float           # 0–1

class Edge(BaseModel):
    id: str
    nodeA: str
    nodeB: str
    segments: list[Segment]
    totalDistance: float

class MapNode(BaseModel):
    id: str
    name: str
    x: float
    y: float
    color: str
    type: str                # 'node' | 'subnode'

class MapData(BaseModel):
    nodes: list[MapNode]
    edges: list[Edge]
    seed: str = ""

class Vehicle(BaseModel):
    id: str
    name: str
    speedMax: float
    fuelCapacity: float
    transportCapacity: int
    color: str = "#3B82F6"

class Objective(BaseModel):
    id: str
    citiesToVisit: list[str]
    orderedVisit: bool = False
    vehicleSelection: dict[str, int] = {}
    startCities: list[str] = []
    endCities: list[str] = []
    maxTime: float | None = None
    maxDistance: float | None = None
    totalUnits: int = 0
    vehicleLoads: dict[str, int] = {}
    optimizeFor: str = "time"
    returnToStart: bool = False

class SolveRequest(BaseModel):
    mapData: MapData
    objective: Objective
    vehicles: list[Vehicle]

# -- Graph utilities


@dataclass
class GEdge:
    id: str
    frm: str
    to: str
    dist: float
    time: float
    fuel: float

    def __getitem__(self, key: str) -> float:
        return getattr(self, key)


def build_adj(map_data: MapData, vehicle_speed_max: float = math.inf) -> dict[str, list[GEdge]]:
    adj: dict[str, list[GEdge]] = {n.id: [] for n in map_data.nodes}
    for e in map_data.edges:
        dist = time_ = fuel = 0.0
        for s in e.segments:
            dist += s.distance
            eff = max(0.05, 1 - s.traffic * 0.6)
            effective_speed = min(s.speed, vehicle_speed_max) * eff
            time_ += (s.distance / effective_speed) * 60
            fuel += s.distance * (0.07 + s.traffic * 0.05)
        if not dist:
            dist = e.totalDistance
        def add(frm: str, to: str, eid: str = e.id,
                d: float = dist, t: float = time_, f: float = fuel) -> None:
            if frm not in adj:
                adj[frm] = []
            adj[frm].append(GEdge(eid, frm, to, d, t, f))
        add(e.nodeA, e.nodeB)
        add(e.nodeB, e.nodeA)
    return adj


def dijkstra(adj: dict[str, list[GEdge]], source: str, key: str
             ) -> tuple[dict[str, float], dict[str, str | None], dict[str, str | None]]:
    cost: dict[str, float] = {n: math.inf for n in adj}
    prev: dict[str, str | None] = {n: None for n in adj}
    prev_edge: dict[str, str | None] = {n: None for n in adj}
    cost[source] = 0.0
    pq: list[tuple[float, str]] = [(0.0, source)]
    vis: set[str] = set()
    while pq:
        c, u = heapq.heappop(pq)
        if u in vis:
            continue
        vis.add(u)
        for e in adj.get(u, []):
            val = getattr(e, key)
            nc = c + val
            if nc < cost.get(e.to, math.inf):
                cost[e.to] = nc
                prev[e.to] = u
                prev_edge[e.to] = e.id
                heapq.heappush(pq, (nc, e.to))
    return cost, prev, prev_edge


def get_path(cost: dict[str, float], prev: dict[str, str | None],
             prev_edge: dict[str, str | None], src: str, tgt: str
             ) -> dict[str, Any]:
    c = cost.get(tgt, math.inf)
    if math.isinf(c):
        return {"nodes": [], "edges": [], "cost": math.inf}
    nodes: list[str] = []
    edges: list[str] = []
    cur: str | None = tgt
    while cur is not None and cur != src:
        nodes.insert(0, cur)
        e = prev_edge.get(cur)
        if e:
            edges.insert(0, e)
        cur = prev.get(cur)
    nodes.insert(0, src)
    return {"nodes": nodes, "edges": edges, "cost": c}


def path_metrics(path_edges: list[str], map_data: MapData) -> dict[str, float]:
    edge_map = {e.id: e for e in map_data.edges}
    distance = time_ = fuel = 0.0
    for eid in path_edges:
        edge = edge_map.get(eid)
        if not edge:
            continue
        distance += edge.totalDistance
        for s in edge.segments:
            eff = max(0.05, 1 - s.traffic * 0.6)
            time_ += (s.distance / (s.speed * eff)) * 60
            fuel += s.distance * (0.07 + s.traffic * 0.05)
    return {"distance": distance, "time": time_, "fuel": fuel}

# -- Vehicle instance assignment


@dataclass
class VInst:
    instance_id: str
    instance_index: int
    vehicle: Vehicle
    start_city: str | None
    end_city: str | None
    cities: list[str] = field(default_factory=list)
    units_to_carry: int = 0


def create_instances(obj: Objective, vehicles: list[Vehicle]) -> list[VInst]:
    instances: list[VInst] = []
    for v in vehicles:
        for i in range(obj.vehicleSelection.get(v.id, 0)):
            instances.append(VInst(f"{v.id}-{i}", i, v, None, None))
    if not instances and vehicles:
        instances.append(VInst(f"{vehicles[0].id}-0", 0, vehicles[0], None, None))
    if not instances:
        return []

    normals = [c for c in obj.citiesToVisit
               if c not in obj.startCities and c not in obj.endCities]
    for i, c in enumerate(obj.startCities):
        if i < len(instances):
            instances[i].start_city = c
    for i, c in enumerate(obj.endCities):
        if i < len(instances):
            instances[i].end_city = c
    for i, c in enumerate(normals):
        instances[i % len(instances)].cities.append(c)

    if obj.totalUnits > 0:
        remaining = obj.totalUnits
        auto_insts: list[VInst] = []
        for inst in instances:
            ov = obj.vehicleLoads.get(inst.vehicle.id, 0)
            if ov > 0:
                inst.units_to_carry = ov
                remaining -= ov
            else:
                auto_insts.append(inst)
        if auto_insts and remaining > 0:
            cap = sum(i.vehicle.transportCapacity for i in auto_insts)
            for inst in auto_insts:
                if cap > 0:
                    inst.units_to_carry = round(remaining * inst.vehicle.transportCapacity / cap)
                else:
                    inst.units_to_carry = round(remaining / len(auto_insts))
    return instances

# -- TSP: nearest-neighbour construction + 2-opt improvement


def solve_tsp(normals: list[str], start: str | None, end: str | None,
              costs: dict[str, float]) -> list[str]:
    def get_c(a: str, b: str) -> float:
        return min(costs.get(f"{a}|{b}", math.inf),
                   costs.get(f"{b}|{a}", math.inf))

    if not normals:
        return [c for c in [start, end] if c is not None]

    to_visit = list(normals)
    route: list[str] = []

    if start:
        route.append(start)
        current = start
    else:
        best = to_visit[0]
        best_avg = math.inf
        for c in to_visit:
            others = [o for o in to_visit if o != c]
            avg = sum(get_c(c, o) for o in others) / max(len(others), 1)
            if avg < best_avg:
                best_avg = avg
                best = c
        to_visit.remove(best)
        route.append(best)
        current = best

    while to_visit:
        nn = ""
        nd = math.inf
        for c in to_visit:
            d = get_c(current, c)
            if d < nd:
                nd = d
                nn = c
        if not nn:
            route.extend(to_visit)
            break
        to_visit.remove(nn)
        route.append(nn)
        current = nn

    if end and route[-1] != end:
        route.append(end)

    # 2-opt
    sf = 1 if start else 0
    ef = 1 if end else 0

    def cost(r: list[str]) -> float:
        return sum(get_c(r[i], r[i + 1]) for i in range(len(r) - 1))

    improved = True
    for _ in range(20):
        if not improved:
            break
        improved = False
        for i in range(sf, len(route) - 1 - ef):
            for j in range(i + 1, len(route) - ef):
                nr = route[: i + 1] + route[i + 1: j + 1][::-1] + route[j + 1:]
                if cost(nr) < cost(route) - 0.001:
                    route = nr
                    improved = True

    return route


def build_full_path(route: list[str], pairs: dict[str, dict]) -> tuple[list[str], list[str]]:
    if len(route) <= 1:
        return list(route), []
    path_nodes: list[str] = []
    path_edges: list[str] = []
    for i in range(len(route) - 1):
        p = pairs.get(f"{route[i]}|{route[i + 1]}")
        if not p or not p["nodes"]:
            if not i:
                path_nodes.append(route[i])
            path_nodes.append(route[i + 1])
            continue
        if not i:
            path_nodes.extend(p["nodes"])
        else:
            path_nodes.extend(p["nodes"][1:])
        path_edges.extend(p["edges"])
    return path_nodes, path_edges

# -- Route computation and animation frame generation


def compute(map_data: MapData, obj: Objective, vehicles: list[Vehicle]) -> dict[str, Any]:
    cost_key = {"time": "time", "fuel": "fuel", "distance": "dist"}.get(obj.optimizeFor, "time")
    unit = {"time": "min", "fuel": "L", "distance": "km"}.get(obj.optimizeFor, "min")
    unique_cities = list(dict.fromkeys(obj.citiesToVisit))
    node_map = {n.id: n for n in map_data.nodes}

    def nn(nid: str) -> str:
        return node_map[nid].name if nid in node_map else nid

    gray0 = {e.id: "#d1d5db" for e in map_data.edges}

    # One adjacency graph per distinct speed cap.
    adj_by_speed: dict[float, dict] = {}
    def get_adj(speed_max: float) -> dict:
        if speed_max not in adj_by_speed:
            adj_by_speed[speed_max] = build_adj(map_data, speed_max)
        return adj_by_speed[speed_max]

    # Precompute shortest paths for every city pair, once per distinct vehicle speed cap.
    pairs_by_speed: dict[float, dict[str, dict]] = {}
    costs_by_speed: dict[float, dict[str, float]] = {}
    unique_speed_maxes = list(dict.fromkeys(v.speedMax for v in vehicles)) or [math.inf]

    for speed_max in unique_speed_maxes:
        v_adj = get_adj(speed_max)
        pp: dict[str, dict] = {}
        pc: dict[str, float] = {}
        for src in unique_cities:
            c, prev, prev_edge = dijkstra(v_adj, src, cost_key)
            for tgt in unique_cities:
                if tgt == src:
                    continue
                p = get_path(c, prev, prev_edge, src, tgt)
                pp[f"{src}|{tgt}"] = p
                pc[f"{src}|{tgt}"] = p["cost"]
        pairs_by_speed[speed_max] = pp
        costs_by_speed[speed_max] = pc

    fallback_speed = unique_speed_maxes[0]
    instances = create_instances(obj, vehicles)
    vehicle_routes: list[dict] = []

    for inst in instances:
        v_name = inst.vehicle.name + (f" #{inst.instance_index + 1}" if inst.instance_index > 0 else "")
        spd = inst.vehicle.speedMax
        pair_paths = pairs_by_speed.get(spd, pairs_by_speed.get(fallback_speed, {}))
        pair_costs = costs_by_speed.get(spd, costs_by_speed.get(fallback_speed, {}))

        effective_end = (inst.start_city
                         if obj.returnToStart and inst.start_city and not inst.end_city
                         else inst.end_city)

        if obj.orderedVisit:
            route = (([inst.start_city] if inst.start_city else []) +
                     inst.cities +
                     ([effective_end] if effective_end else []))
        else:
            route = solve_tsp(inst.cities, inst.start_city, effective_end, pair_costs)

        if not route:
            continue

        path_nodes, path_edges = build_full_path(route, pair_paths)
        m = path_metrics(path_edges, map_data)
        breaches: list[str] = []
        if obj.maxTime is not None and m["time"] > obj.maxTime:
            breaches.append(f"Time {m['time']:.1f} min > max {obj.maxTime} min")
        if obj.maxDistance is not None and m["distance"] > obj.maxDistance:
            breaches.append(f"Distance {m['distance']:.1f} km > max {obj.maxDistance} km")
        if obj.totalUnits > 0 and inst.units_to_carry > inst.vehicle.transportCapacity:
            breaches.append(f"Load {inst.units_to_carry} > capacity {inst.vehicle.transportCapacity}")
        if len(route) > 1 and not path_edges:
            breaches.append("No path found between some cities")

        vehicle_routes.append({
            "vehicleId": inst.vehicle.id,
            "vehicleName": v_name,
            "color": inst.vehicle.color,
            "instanceIndex": inst.instance_index,
            "route": route,
            "pathNodes": path_nodes,
            "pathEdges": path_edges,
            "totalTime": round(m["time"] * 10) / 10,
            "totalDistance": round(m["distance"] * 10) / 10,
            "fuelUsed": round(m["fuel"] * 10) / 10,
            "unitsCarried": inst.units_to_carry,
            "feasible": len(breaches) == 0,
            "constraintBreaches": breaches,
        })

    # Animation frames
    frames: list[dict] = []
    frames.append({"phase": "init",
                   "log": f"[Python solver] Graph: {len(map_data.nodes)} nodes · {len(map_data.edges)} edges · {len(unique_cities)} cities",
                   "edgeColors": dict(gray0),
                   "currentPathNodes": [],
                   "vehicleRoutes": []})

    # Dijkstra frames
    used_pairs: set[str] = set()
    for vr in vehicle_routes:
        for i in range(len(vr["route"]) - 1):
            used_pairs.add(f"{vr['route'][i]}|{vr['route'][i + 1]}")

    explored: set[str] = set()
    pair_paths_ref = pairs_by_speed.get(fallback_speed, {})
    for idx, key in enumerate(list(used_pairs)[:20]):
        src, tgt = key.split("|")
        p = pair_paths_ref.get(key)
        if not p or math.isinf(p["cost"]):
            frames.append({"phase": "dijkstra",
                           "log": f"No path: {nn(src)} → {nn(tgt)}",
                           "edgeColors": dict(gray0),
                           "currentPathNodes": [src, tgt],
                           "vehicleRoutes": []})
            continue
        ec1 = {**gray0, **{e: "#374151" for e in explored}}
        for e in p["edges"]:
            ec1[e] = "#f59e0b"
        frames.append({"phase": "dijkstra",
                       "log": f"Routing: {nn(src)} → {nn(tgt)} · {len(p['nodes'])} nodes",
                       "edgeColors": ec1,
                       "currentPathNodes": p["nodes"],
                       "vehicleRoutes": []})
        ec2 = {**gray0, **{e: "#374151" for e in explored}}
        for e in p["edges"]:
            ec2[e] = "#3b82f6"
            explored.add(e)
        via = [node_map[nid].name for nid in p["nodes"][1:-1] if nid in node_map]
        via_str = f" [{' · '.join(via)}]" if via else " (direct)"
        frames.append({"phase": "dijkstra",
                       "log": f"  ✓ {nn(src)} → {nn(tgt)}{via_str} · {p['cost']:.1f} {unit}",
                       "edgeColors": ec2,
                       "currentPathNodes": p["nodes"],
                       "vehicleRoutes": []})

    # Routing frames
    done_vehicle_routes: list[dict] = []

    def base_colors() -> dict[str, str]:
        ec = dict(gray0)
        for dvr in done_vehicle_routes:
            for e in dvr["edges"]:
                ec[e] = dvr["color"]
        return ec

    route_method = "fixed order" if obj.orderedVisit else "nearest-neighbor + 2-opt"
    for vr in vehicle_routes:
        frames.append({"phase": "routing",
                       "log": f"{vr['vehicleName']} — {' → '.join(nn(r) for r in vr['route'])} ({route_method})",
                       "edgeColors": base_colors(),
                       "currentPathNodes": vr["route"],
                       "vehicleRoutes": list(done_vehicle_routes)})

        partial_edges: list[str] = []
        for i in range(1, len(vr["route"])):
            frm, to = vr["route"][i - 1], vr["route"][i]
            seg_key = f"{frm}|{to}"
            seg_p = pair_paths_ref.get(seg_key)
            seg_nodes = seg_p["nodes"] if seg_p else [frm, to]
            seg_cost = seg_p["cost"] if seg_p else 0.0
            inter = [node_map[nid].name for nid in seg_nodes[1:-1] if nid in node_map]
            inter_str = f" [{' · '.join(inter)}]" if inter else ""
            _, partial_path_edges = build_full_path(vr["route"][:i + 1], pair_paths_ref)
            ec = {**base_colors(), **{e: vr["color"] for e in partial_path_edges}}
            frames.append({"phase": "routing",
                           "log": f"  {nn(frm)} → {nn(to)}{inter_str} · {seg_cost:.1f} {unit}",
                           "edgeColors": ec,
                           "currentPathNodes": seg_nodes if seg_p else [frm, to],
                           "vehicleRoutes": list(done_vehicle_routes) + [{"color": vr["color"], "edges": partial_path_edges}]})

        done_vehicle_routes.append({"color": vr["color"], "edges": vr["pathEdges"]})
        icon = "✓" if vr["feasible"] else "⚠"
        frames.append({"phase": "routing",
                       "log": f"{icon} {vr['vehicleName']}: {len(vr['pathNodes'])} nodes · {vr['totalDistance']} km · {vr['totalTime']} min · {vr['fuelUsed']} L",
                       "edgeColors": base_colors(),
                       "currentPathNodes": vr["pathNodes"],
                       "vehicleRoutes": list(done_vehicle_routes)})

    # Aggregate final result
    feasible = all(vr["feasible"] for vr in vehicle_routes) and len(vehicle_routes) > 0
    all_breaches = [b for vr in vehicle_routes for b in vr["constraintBreaches"]]
    total_time = max((vr["totalTime"] for vr in vehicle_routes), default=0)
    total_dist = sum(vr["totalDistance"] for vr in vehicle_routes)
    total_fuel = sum(vr["fuelUsed"] for vr in vehicle_routes)
    score = (total_time if obj.optimizeFor == "time" else
             total_fuel if obj.optimizeFor == "fuel" else total_dist)

    final_colors = {**gray0}
    for dvr in done_vehicle_routes:
        for e in dvr["edges"]:
            final_colors[e] = dvr["color"]

    frames.append({"phase": "done",
                   "log": (f"✓ Done — best score: {score:.1f} {unit}" if feasible
                           else f"⚠ Done with {len(all_breaches)} constraint violation(s)"),
                   "edgeColors": final_colors,
                   "currentPathNodes": [],
                   "vehicleRoutes": done_vehicle_routes})

    import time as _time
    result = {
        "id": f"sim-{int(_time.time() * 1000)}",
        "vehicleRoutes": vehicle_routes,
        "totalTime": round(total_time * 10) / 10,
        "totalDistance": round(total_dist * 10) / 10,
        "fuelUsed": round(total_fuel * 10) / 10,
        "feasible": feasible,
        "constraintBreaches": all_breaches,
        "optimizeScore": round(score * 10) / 10,
    }
    return {"frames": frames, "result": result}


@app.post("/solve")
def solve(req: SolveRequest) -> dict[str, Any]:
    return compute(req.mapData, req.objective, req.vehicles)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "solver": "python"}
