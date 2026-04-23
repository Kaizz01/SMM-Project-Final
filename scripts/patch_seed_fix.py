with open('/home/kaizz/project/idk/lib/map-context.tsx', 'r') as f:
    c = f.read()

ok = []

# ── 1. Remove useEffect from import ─────────────────────────────────────────
o = "import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';"
n = "import React, { createContext, useContext, useState, useCallback } from 'react';"
assert o in c, 'FAIL 1'; c = c.replace(o, n, 1); ok.append('1: useEffect removed from import')

# ── 2. Remove the useEffect block entirely ───────────────────────────────────
o = """\n  // Update seed fingerprint whenever the graph is modified by the user
  useEffect(() => {
    if (!mapData) return;
    const fingerprint = computeGraphSeed(mapData.nodes, mapData.edges);
    if (fingerprint !== mapData.seed) {
      setMapData(prev => prev ? { ...prev, seed: fingerprint } : null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapData?.nodes, mapData?.edges]);\n"""
n = '\n'
assert o in c, 'FAIL 2'; c = c.replace(o, n, 1); ok.append('2: useEffect block removed')

# ── 3. addNode — update seed inline ─────────────────────────────────────────
o = "      return { ...prev, nodes: [...prev.nodes, node] };"
n = """      const newNodes = [...prev.nodes, node];
      return { ...prev, nodes: newNodes, seed: computeGraphSeed(newNodes, prev.edges) };"""
assert o in c, 'FAIL 3'; c = c.replace(o, n, 1); ok.append('3: addNode seed')

# ── 4. removeNode — update seed inline ──────────────────────────────────────
o = """      return {
        ...prev,
        nodes: prev.nodes.filter(n => n.id !== id),
        edges: updatedEdges,
      };"""
n = """      const newNodes = prev.nodes.filter(n => n.id !== id);
      return {
        ...prev,
        nodes: newNodes,
        edges: updatedEdges,
        seed: computeGraphSeed(newNodes, updatedEdges),
      };"""
assert o in c, 'FAIL 4'; c = c.replace(o, n, 1); ok.append('4: removeNode seed')

# ── 5. promoteSubnodeToNode — update seed inline ─────────────────────────────
o = "      return { ...prev, nodes: updatedNodes, edges: updatedEdges };\n    });\n    \n    setSelectedNodeId(null);\n  }, []);\n\n  // Demote"
n = "      return { ...prev, nodes: updatedNodes, edges: updatedEdges, seed: computeGraphSeed(updatedNodes, updatedEdges) };\n    });\n    \n    setSelectedNodeId(null);\n  }, []);\n\n  // Demote"
assert o in c, 'FAIL 5'; c = c.replace(o, n, 1); ok.append('5: promoteSubnodeToNode seed')

# ── 6. demoteNodeToSubnode — update seed inline ──────────────────────────────
o = "      return { ...prev, nodes: updatedNodes, edges: updatedEdges };\n    });\n    \n    setSelectedNodeId(null);\n  }, [getConnectedEdges]);"
n = "      return { ...prev, nodes: updatedNodes, edges: updatedEdges, seed: computeGraphSeed(updatedNodes, updatedEdges) };\n    });\n    \n    setSelectedNodeId(null);\n  }, [getConnectedEdges]);"
assert o in c, 'FAIL 6'; c = c.replace(o, n, 1); ok.append('6: demoteNodeToSubnode seed')

# ── 7. addEdge — update seed inline ─────────────────────────────────────────
o = "      return { ...prev, edges: [...prev.edges, edge] };"
n = """      const newEdges = [...prev.edges, edge];
      return { ...prev, edges: newEdges, seed: computeGraphSeed(prev.nodes, newEdges) };"""
assert o in c, 'FAIL 7'; c = c.replace(o, n, 1); ok.append('7: addEdge seed')

# ── 8. removeEdge — update seed inline ──────────────────────────────────────
o = """      return {
        ...prev,
        edges: prev.edges.filter(e => e.id !== id),
      };"""
n = """      const filteredEdges = prev.edges.filter(e => e.id !== id);
      return {
        ...prev,
        edges: filteredEdges,
        seed: computeGraphSeed(prev.nodes, filteredEdges),
      };"""
assert o in c, 'FAIL 8'; c = c.replace(o, n, 1); ok.append('8: removeEdge seed')

# ── 9. Add isGraphValid to context interface ─────────────────────────────────
o = "  generateRandomMap: (seed?: string) => void;\n  createEmptyMap: () => void;\n  segmentLimits: typeof SEGMENT_LIMITS;"
n = "  generateRandomMap: (seed?: string) => void;\n  createEmptyMap: () => void;\n  isGraphValid: () => boolean;\n  segmentLimits: typeof SEGMENT_LIMITS;"
assert o in c, 'FAIL 9'; c = c.replace(o, n, 1); ok.append('9: isGraphValid to interface')

# ── 10. Add isGraphValid implementation before return ────────────────────────
o = "  }, []);\n\n  return (\n    <MapContext.Provider value={{"
n = """  }, []);

  const isGraphValid = useCallback((): boolean => {
    if (!mapData || mapData.nodes.length === 0) return true; // empty = valid
    const parent: Record<string, string> = {};
    for (const n of mapData.nodes) parent[n.id] = n.id;
    const find = (id: string): string => {
      if (parent[id] !== id) parent[id] = find(parent[id]);
      return parent[id];
    };
    for (const e of mapData.edges) {
      const ra = find(e.nodeA), rb = find(e.nodeB);
      if (ra !== rb) parent[ra] = rb;
    }
    const root = find(mapData.nodes[0].id);
    return mapData.nodes.every(n => find(n.id) === root);
  }, [mapData]);

  return (
    <MapContext.Provider value={{"""
assert o in c, 'FAIL 10'; c = c.replace(o, n, 1); ok.append('10: isGraphValid implementation')

# ── 11. Add isGraphValid to context value ────────────────────────────────────
o = "      generateRandomMap,\n      createEmptyMap,\n      segmentLimits: SEGMENT_LIMITS,"
n = "      generateRandomMap,\n      createEmptyMap,\n      isGraphValid,\n      segmentLimits: SEGMENT_LIMITS,"
assert o in c, 'FAIL 11'; c = c.replace(o, n, 1); ok.append('11: isGraphValid to context value')

with open('/home/kaizz/project/idk/lib/map-context.tsx', 'w') as f:
    f.write(c)

for msg in ok: print(msg)
print(f'\nAll {len(ok)}/11 patches applied.')
