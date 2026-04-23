"""
Map Visualization Tool - Python Backend Models

These classes define the data structures for the map visualization tool.
They serve as the backend model that can be connected to the frontend via JSON.

The models include:
- Node: Main city/location points
- Subnode: Junction points for route intersections
- Segment: Individual road segments with traffic data
- Edge: Complete routes between nodes
- Vehicle: Transportation options for simulation
- MapData: Complete map structure
- Objective: Route optimization goals
- SimulationResult: Optimization results
"""

from dataclasses import dataclass, field
from typing import Optional
import json
import random
import string
import math


@dataclass
class Node:
    """
    Represents a main location (city) on the map.
    
    Attributes:
        id: Unique identifier for the node
        name: Display name (must be unique)
        x: X coordinate on the map
        y: Y coordinate on the map
        color: Hex color code for visualization
        node_type: 'node' for cities, 'subnode' for junctions
    """
    id: str
    name: str
    x: float
    y: float
    color: str = "#3B82F6"
    node_type: str = "node"  # 'node' or 'subnode'
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "x": self.x,
            "y": self.y,
            "color": self.color,
            "type": self.node_type
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> "Node":
        return cls(
            id=data["id"],
            name=data["name"],
            x=data["x"],
            y=data["y"],
            color=data.get("color", "#3B82F6"),
            node_type=data.get("type", "node")
        )


@dataclass
class Subnode(Node):
    """
    Represents a junction point where routes can intersect.
    Subnodes allow routes to split and merge without being full cities.
    """
    def __init__(self, id: str, name: str, x: float, y: float, color: str = "#94A3B8"):
        super().__init__(id, name, x, y, color, node_type="subnode")


@dataclass
class Segment:
    """
    Represents a single segment of a road between two points.
    
    Attributes:
        id: Unique identifier
        start_x, start_y: Starting coordinates
        end_x, end_y: Ending coordinates
        traffic_index: Local traffic level (0-10 scale)
        curve_offset: Offset for creating curved roads
    """
    id: str
    start_x: float
    start_y: float
    end_x: float
    end_y: float
    traffic_index: int = 0  # 0-10 scale
    curve_offset: float = 0.0  # For bezier curve rendering
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "startX": self.start_x,
            "startY": self.start_y,
            "endX": self.end_x,
            "endY": self.end_y,
            "trafficIndex": self.traffic_index,
            "curveOffset": self.curve_offset
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> "Segment":
        return cls(
            id=data["id"],
            start_x=data["startX"],
            start_y=data["startY"],
            end_x=data["endX"],
            end_y=data["endY"],
            traffic_index=data.get("trafficIndex", 0),
            curve_offset=data.get("curveOffset", 0.0)
        )
    
    @property
    def length(self) -> float:
        """Calculate the segment length."""
        dx = self.end_x - self.start_x
        dy = self.end_y - self.start_y
        return math.sqrt(dx * dx + dy * dy)


@dataclass
class Edge:
    """
    Represents a complete route (edge) between two nodes.
    
    Attributes:
        id: Unique identifier
        node_a: ID of the starting node
        node_b: ID of the ending node (A → B)
        segments: List of road segments that make up this edge
        general_traffic_index: Average traffic level across the edge
    """
    id: str
    node_a: str  # Starting node ID
    node_b: str  # Ending node ID
    segments: list[Segment] = field(default_factory=list)
    general_traffic_index: int = 0
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "nodeA": self.node_a,
            "nodeB": self.node_b,
            "segments": [s.to_dict() for s in self.segments],
            "generalTrafficIndex": self.general_traffic_index
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> "Edge":
        return cls(
            id=data["id"],
            node_a=data["nodeA"],
            node_b=data["nodeB"],
            segments=[Segment.from_dict(s) for s in data.get("segments", [])],
            general_traffic_index=data.get("generalTrafficIndex", 0)
        )
    
    @property
    def total_length(self) -> float:
        """Calculate total edge length."""
        return sum(s.length for s in self.segments)
    
    def calculate_general_traffic(self) -> int:
        """Calculate average traffic index from segments."""
        if not self.segments:
            return 0
        avg = sum(s.traffic_index for s in self.segments) / len(self.segments)
        return round(avg)


@dataclass
class Vehicle:
    """
    Represents a vehicle for route simulation.
    
    Attributes:
        id: Unique identifier
        name: Display name
        speed_max: Maximum speed in km/h
        fuel_capacity: Fuel tank size in liters
        transport_capacity: Cargo/passenger capacity (units)
        color: Hex color for visualization
    """
    id: str
    name: str
    speed_max: float  # km/h
    fuel_capacity: float  # liters
    transport_capacity: int  # units
    color: str = "#3B82F6"
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "speedMax": self.speed_max,
            "fuelCapacity": self.fuel_capacity,
            "transportCapacity": self.transport_capacity,
            "color": self.color
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> "Vehicle":
        return cls(
            id=data["id"],
            name=data["name"],
            speed_max=data["speedMax"],
            fuel_capacity=data["fuelCapacity"],
            transport_capacity=data["transportCapacity"],
            color=data.get("color", "#3B82F6")
        )
    
    def fuel_consumption_for_distance(self, distance_km: float, consumption_rate: float = 8.0) -> float:
        """
        Calculate fuel consumption for a given distance.
        Default consumption rate: 8L per 100km
        """
        return distance_km * consumption_rate / 100
    
    def time_for_distance(self, distance_km: float, traffic_factor: float = 1.0) -> float:
        """
        Calculate time in minutes for a given distance.
        Traffic factor: 1.0 = free flow, 2.0 = heavy traffic
        """
        effective_speed = self.speed_max / traffic_factor
        hours = distance_km / effective_speed
        return hours * 60


@dataclass
class MapData:
    """
    Complete map data structure.
    
    Attributes:
        nodes: List of all nodes (cities and subnodes)
        edges: List of all edges (roads)
        seed: Seed string for map generation
    """
    nodes: list[Node] = field(default_factory=list)
    edges: list[Edge] = field(default_factory=list)
    seed: str = ""
    
    def to_dict(self) -> dict:
        return {
            "nodes": [n.to_dict() for n in self.nodes],
            "edges": [e.to_dict() for e in self.edges],
            "seed": self.seed
        }
    
    def to_json(self) -> str:
        return json.dumps(self.to_dict(), indent=2)
    
    @classmethod
    def from_dict(cls, data: dict) -> "MapData":
        return cls(
            nodes=[Node.from_dict(n) for n in data.get("nodes", [])],
            edges=[Edge.from_dict(e) for e in data.get("edges", [])],
            seed=data.get("seed", "")
        )
    
    @classmethod
    def from_json(cls, json_str: str) -> "MapData":
        return cls.from_dict(json.loads(json_str))
    
    def get_node_by_id(self, node_id: str) -> Optional[Node]:
        """Find a node by its ID."""
        return next((n for n in self.nodes if n.id == node_id), None)
    
    def get_edges_for_node(self, node_id: str) -> list[Edge]:
        """Get all edges connected to a node."""
        return [e for e in self.edges if e.node_a == node_id or e.node_b == node_id]


@dataclass
class Objective:
    """
    Route optimization objectives.
    
    Attributes:
        id: Unique identifier
        cities_to_visit: List of node IDs that must be visited
        ordered_visit: Whether to visit in specified order
        selected_vehicles: List of vehicle IDs available for the route
        max_time: Maximum allowed time in minutes
        optimize_for: Optimization goal ('time', 'distance', 'fuel')
    """
    id: str
    cities_to_visit: list[str]
    ordered_visit: bool = False
    selected_vehicles: list[str] = field(default_factory=list)
    max_time: int = 120
    optimize_for: str = "time"  # 'time', 'distance', 'fuel'
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "citiesToVisit": self.cities_to_visit,
            "orderedVisit": self.ordered_visit,
            "selectedVehicles": self.selected_vehicles,
            "maxTime": self.max_time,
            "optimizeFor": self.optimize_for
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> "Objective":
        return cls(
            id=data["id"],
            cities_to_visit=data["citiesToVisit"],
            ordered_visit=data.get("orderedVisit", False),
            selected_vehicles=data.get("selectedVehicles", []),
            max_time=data.get("maxTime", 120),
            optimize_for=data.get("optimizeFor", "time")
        )


@dataclass
class SimulationResult:
    """
    Result of a route simulation.
    
    Attributes:
        id: Unique identifier
        route: Ordered list of node IDs representing the path
        total_time: Total travel time in minutes
        total_distance: Total distance in kilometers
        fuel_used: Total fuel consumption in liters
        success: Whether the route meets all constraints
    """
    id: str
    route: list[str]
    total_time: float
    total_distance: float
    fuel_used: float
    success: bool
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "route": self.route,
            "totalTime": self.total_time,
            "totalDistance": self.total_distance,
            "fuelUsed": self.fuel_used,
            "success": self.success
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> "SimulationResult":
        return cls(
            id=data["id"],
            route=data["route"],
            total_time=data["totalTime"],
            total_distance=data["totalDistance"],
            fuel_used=data["fuelUsed"],
            success=data["success"]
        )


# ============================================================================
# C Interface Placeholder
# ============================================================================

class CInterface:
    """
    Placeholder class for interfacing Python with C code.
    
    This class provides a structure for implementing C bindings
    without writing actual C code. You can implement these methods
    using ctypes or cffi when the C library is ready.
    
    Example usage with ctypes:
        from ctypes import cdll, c_double, c_int, POINTER
        
        lib = cdll.LoadLibrary("./libmap.so")
        lib.calculate_shortest_path.argtypes = [...]
        lib.calculate_shortest_path.restype = ...
    """
    
    def __init__(self, library_path: Optional[str] = None):
        """
        Initialize the C interface.
        
        Args:
            library_path: Path to the compiled C library (.so/.dll)
        """
        self.library = None
        self.library_path = library_path
        
        # Placeholder - implement when C library is ready
        # if library_path:
        #     from ctypes import cdll
        #     self.library = cdll.LoadLibrary(library_path)
    
    def calculate_shortest_path(self, nodes: list[Node], edges: list[Edge], 
                                start_id: str, end_id: str) -> list[str]:
        """
        Calculate shortest path using C implementation.
        
        Placeholder: Returns empty list until C library is implemented.
        """
        # TODO: Implement with actual C bindings
        return []
    
    def optimize_route(self, map_data: MapData, objective: Objective) -> list[SimulationResult]:
        """
        Run route optimization using C implementation.
        
        Placeholder: Returns empty list until C library is implemented.
        """
        # TODO: Implement with actual C bindings
        return []


# ============================================================================
# Utility Functions
# ============================================================================

def generate_seed() -> str:
    """Generate a random seed string."""
    chars = string.ascii_lowercase + string.digits
    return ''.join(random.choice(chars) for _ in range(24))


def generate_random_color() -> str:
    """Generate a random hex color from a predefined palette."""
    colors = [
        "#3B82F6", "#10B981", "#F59E0B", "#EF4444",
        "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16"
    ]
    return random.choice(colors)


def generate_segments(start: Node, end: Node, num_segments: int = 4) -> list[Segment]:
    """
    Generate curved road segments between two nodes.
    
    Args:
        start: Starting node
        end: Ending node
        num_segments: Number of segments to create (default: 4)
    
    Returns:
        List of Segment objects
    """
    segments = []
    
    for i in range(num_segments):
        t1 = i / num_segments
        t2 = (i + 1) / num_segments
        
        sx = start.x + (end.x - start.x) * t1
        sy = start.y + (end.y - start.y) * t1
        ex = start.x + (end.x - start.x) * t2
        ey = start.y + (end.y - start.y) * t2
        
        segments.append(Segment(
            id=f"seg-{random.randint(1000, 9999)}",
            start_x=sx,
            start_y=sy,
            end_x=ex,
            end_y=ey,
            traffic_index=random.randint(0, 10),
            curve_offset=(random.random() - 0.5) * 30
        ))
    
    return segments


def generate_random_map(num_nodes: int = 8, num_edges: int = 12) -> MapData:
    """
    Generate a random map with nodes and edges.
    
    Args:
        num_nodes: Number of nodes to generate
        num_edges: Number of edges to generate
    
    Returns:
        MapData object with random nodes and edges
    """
    nodes = []
    edges = []
    
    # Generate nodes
    for i in range(num_nodes):
        nodes.append(Node(
            id=f"node-{i}",
            name=f"City {chr(65 + i)}",  # A, B, C, ...
            x=100 + random.random() * 600,
            y=100 + random.random() * 400,
            color=generate_random_color()
        ))
    
    # Generate edges
    connected_pairs = set()
    edge_count = 0
    
    while edge_count < num_edges and edge_count < num_nodes * (num_nodes - 1) // 2:
        a = random.randint(0, num_nodes - 1)
        b = random.randint(0, num_nodes - 1)
        
        if a == b:
            continue
        
        pair = tuple(sorted([a, b]))
        if pair in connected_pairs:
            continue
        
        connected_pairs.add(pair)
        
        segments = generate_segments(nodes[a], nodes[b])
        avg_traffic = sum(s.traffic_index for s in segments) // len(segments)
        
        edges.append(Edge(
            id=f"edge-{edge_count}",
            node_a=nodes[a].id,
            node_b=nodes[b].id,
            segments=segments,
            general_traffic_index=avg_traffic
        ))
        
        edge_count += 1
    
    return MapData(
        nodes=nodes,
        edges=edges,
        seed=generate_seed()
    )


# ============================================================================
# Example Usage
# ============================================================================

if __name__ == "__main__":
    # Generate a random map
    map_data = generate_random_map(num_nodes=6, num_edges=8)
    
    # Print as JSON (for frontend)
    print("Generated Map Data:")
    print(map_data.to_json())
    
    # Create some vehicles
    vehicles = [
        Vehicle("v1", "Car", speed_max=120, fuel_capacity=50, transport_capacity=4, color="#3B82F6"),
        Vehicle("v2", "Truck", speed_max=80, fuel_capacity=200, transport_capacity=20, color="#10B981"),
        Vehicle("v3", "Motorcycle", speed_max=150, fuel_capacity=15, transport_capacity=1, color="#F59E0B"),
    ]
    
    print("\nVehicles:")
    for v in vehicles:
        print(f"  - {v.name}: {v.speed_max}km/h, {v.fuel_capacity}L tank")
    
    # Create an objective
    objective = Objective(
        id="obj-1",
        cities_to_visit=[n.id for n in map_data.nodes[:3]],
        ordered_visit=False,
        selected_vehicles=["v1"],
        max_time=120,
        optimize_for="time"
    )
    
    print("\nObjective:")
    print(json.dumps(objective.to_dict(), indent=2))
