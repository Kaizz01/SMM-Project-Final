# SMM Route Optimizer

A route optimization tool built with Next.js. Generate or import a road network, assign vehicles and objectives, then visualize the optimal routes computed by Dijkstra + TSP — either in pure JavaScript or via a Python solver backend.

---

## Prerequisites — WSL Setup

Open a PowerShell or CMD terminal.

**Check if Ubuntu is already installed:**
```
wsl --list --verbose
```

**Install Ubuntu:**
```
wsl --install -d Ubuntu
```

**If you need to reset a broken installation:**
```
wsl --unregister Ubuntu
```

---

## Open the Project in VS Code

1. Open an Ubuntu terminal
2. Navigate to the project folder and run:
```
code .
```
3. Accept the workspace trust prompt

---

## Running the App

Double-click `launch.bat` at the project root, then choose a mode:

| Option | Description |
|--------|-------------|
| `1` — Frontend | Next.js with the built-in JavaScript solver |
| `2` — Python | Next.js + FastAPI Python solver (auto-detected at runtime) |

The browser opens automatically once the server is ready.

---

## Features

**Map generation**
Generate a random road network with configurable parameters: number of nodes, edge density, speed limits, traffic conditions and more. Reproduce any map exactly using its export seed (`M2.xxx`) or generate a deterministic one from a hex seed.

**Manual map editor**
Place nodes, draw edges, adjust speed limits and road geometry directly on the canvas. Promote intersections, split segments, and fine-tune the graph before running any optimization.

**Objectives**
Select which cities to visit, assign departure and arrival roles, configure vehicle fleets with capacity constraints, and set optional limits on time or distance per route.

**Route optimization**
Runs Dijkstra for shortest paths then a TSP solver to minimize total time, distance, or fuel consumption across all vehicles. Supports mixed fleets with different speeds and capacities.

**Simulation playback**
Watch the optimized routes animate step by step on the map, with per-vehicle color coding and real-time stats.

**Results**
Detailed breakdown per vehicle: route taken, distance, estimated time, fuel used, cargo load, and feasibility against the defined constraints.
