"use client";

import { useRef, useState, useCallback, useEffect } from 'react';
import { useMap, generateSegmentsForEdge } from '@/lib/map-context';
import type { MapNode, Edge, Segment } from '@/lib/types';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface HoveredSegment {
  edge: Edge;
  segment: Segment;
  x: number;
  y: number;
}

// Get traffic color based on traffic value (0-1)
function getTrafficColor(traffic: number): string {
  if (traffic <= 0.2) return '#22C55E'; // green - low traffic
  if (traffic <= 0.4) return '#84CC16'; // lime
  if (traffic <= 0.6) return '#EAB308'; // yellow
  if (traffic <= 0.8) return '#F97316'; // orange
  return '#EF4444'; // red - high traffic
}

// Generate SVG path for a segment with subtle curve
function generateSegmentPath(segment: Segment): string {
  const startPoint = { x: segment.startX, y: segment.startY };
  const endPoint = { x: segment.endX, y: segment.endY };
  
  const dx = endPoint.x - startPoint.x;
  const dy = endPoint.y - startPoint.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  
  if (dist < 1) return `M ${startPoint.x} ${startPoint.y} L ${endPoint.x} ${endPoint.y}`;
  
  // Very subtle curve offset (2% of distance, perpendicular)
  const curveAmount = dist * 0.02;
  const perpX = -dy / dist * curveAmount;
  const perpY = dx / dist * curveAmount;
  
  const midX = (startPoint.x + endPoint.x) / 2 + perpX;
  const midY = (startPoint.y + endPoint.y) / 2 + perpY;
  
  // Quadratic bezier for subtle curve
  return `M ${startPoint.x} ${startPoint.y} Q ${midX} ${midY}, ${endPoint.x} ${endPoint.y}`;
}

export function MapCanvas() {
  const {
    mapData,
    zoom,
    setZoom,
    selectedNodeId,
    setSelectedNodeId,
    selectedEdgeId,
    setSelectedEdgeId,
    selectedSegmentId,
    setSelectedSegmentId,
    updateNode,
    addNode,
    addEdge,
    removeNode,
    removeEdge,
    removeSegmentFromEdge,
    resolveCrossings,
  } = useMap();

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [hoveredSegment, setHoveredSegment] = useState<HoveredSegment | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, width: 800, height: 600 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPos, setLastPanPos] = useState({ x: 0, y: 0 });

  // Calculate bounds of the graph
  const calculateGraphBounds = useCallback(() => {
    if (!mapData || mapData.nodes.length === 0) {
      return { minX: 0, minY: 0, maxX: 800, maxY: 600, width: 800, height: 600 };
    }

    const padding = 100;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const node of mapData.nodes) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x);
      maxY = Math.max(maxY, node.y);
    }

    const width = Math.max(maxX - minX + 2 * padding, 200);
    const height = Math.max(maxY - minY + 2 * padding, 150);

    return {
      minX: minX - padding,
      minY: minY - padding,
      maxX: maxX + padding,
      maxY: maxY + padding,
      width,
      height,
    };
  }, [mapData]);

  // Fit view to graph - ensures graph fits at 100% scale
  const fitToGraph = useCallback(() => {
    const bounds = calculateGraphBounds();
    const containerRect = containerRef.current?.getBoundingClientRect();
    
    if (!containerRect) {
      setViewBox({
        x: bounds.minX,
        y: bounds.minY,
        width: bounds.width,
        height: bounds.height,
      });
      setZoom(1);
      return;
    }
    
    // Calculate aspect ratios
    const containerAspect = containerRect.width / containerRect.height;
    const graphAspect = bounds.width / bounds.height;
    
    let viewWidth: number;
    let viewHeight: number;
    
    // Adjust viewBox to match container aspect ratio while fitting the graph
    if (graphAspect > containerAspect) {
      // Graph is wider than container - fit to width
      viewWidth = bounds.width;
      viewHeight = bounds.width / containerAspect;
    } else {
      // Graph is taller than container - fit to height
      viewHeight = bounds.height;
      viewWidth = bounds.height * containerAspect;
    }
    
    // Center the graph in the viewBox
    const centerX = bounds.minX + bounds.width / 2;
    const centerY = bounds.minY + bounds.height / 2;
    
    setViewBox({
      x: centerX - viewWidth / 2,
      y: centerY - viewHeight / 2,
      width: viewWidth,
      height: viewHeight,
    });
    setZoom(1);
  }, [calculateGraphBounds, setZoom]);

  // Auto-fit when map data changes
  useEffect(() => {
    if (mapData && mapData.nodes.length > 0) {
      // rAF ensures the container is laid out and measured before we fit
      requestAnimationFrame(() => fitToGraph());
    }
  }, [mapData?.seed]); // Only refit when seed changes (new map generated)

  // Handle wheel zoom - scales elements
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Convert mouse position to SVG coordinates
    const svgX = viewBox.x + (mouseX / rect.width) * viewBox.width;
    const svgY = viewBox.y + (mouseY / rect.height) * viewBox.height;
    
    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
    const newWidth = viewBox.width * zoomFactor;
    const newHeight = viewBox.height * zoomFactor;
    
    // Clamp zoom
    if (newWidth < 100 || newWidth > 5000) return;
    
    // Adjust viewBox to zoom toward mouse position
    const newX = svgX - (mouseX / rect.width) * newWidth;
    const newY = svgY - (mouseY / rect.height) * newHeight;
    
    setViewBox({
      x: newX,
      y: newY,
      width: newWidth,
      height: newHeight,
    });
    
    // Update zoom percentage for display (relative to base viewBox)
    const bounds = calculateGraphBounds();
    setZoom(bounds.width / newWidth);
  }, [viewBox, calculateGraphBounds, setZoom]);

  // Handle mouse down on canvas (for panning or adding nodes)
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && (e.altKey || e.ctrlKey))) {
      setIsPanning(true);
      setLastPanPos({ x: e.clientX, y: e.clientY });
    } else if (e.button === 0 && e.shiftKey && mapData) {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      
      // Convert screen coordinates to SVG coordinates
      const x = viewBox.x + (e.clientX - rect.left) / rect.width * viewBox.width;
      const y = viewBox.y + (e.clientY - rect.top) / rect.height * viewBox.height;
      
      if (mapData.nodes.length >= 100) return;
      
      const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];
      const newNode: MapNode = {
        id: `node-${Date.now()}`,
        name: `City ${mapData.nodes.filter(n => n.type === 'node').length + 1}`,
        x,
        y,
        color: colors[mapData.nodes.length % colors.length],
        type: 'node',
      };
      addNode(newNode);
    }
  }, [mapData, viewBox, addNode]);

  // Handle mouse move - updates node position which triggers edge rebuilding via context
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (isPanning) {
      const dx = (e.clientX - lastPanPos.x) / rect.width * viewBox.width;
      const dy = (e.clientY - lastPanPos.y) / rect.height * viewBox.height;
      setViewBox(prev => ({
        ...prev,
        x: prev.x - dx,
        y: prev.y - dy,
      }));
      setLastPanPos({ x: e.clientX, y: e.clientY });
    } else if (draggingNode && mapData) {
      // Convert screen coordinates to SVG coordinates
      const x = viewBox.x + (e.clientX - rect.left) / rect.width * viewBox.width;
      const y = viewBox.y + (e.clientY - rect.top) / rect.height * viewBox.height;
      
      // updateNode will automatically rebuild connected edges
      updateNode(draggingNode, { x, y });
    }
  }, [isPanning, lastPanPos, draggingNode, mapData, viewBox, updateNode]);

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    if (draggingNode) resolveCrossings();
    setIsPanning(false);
    setDraggingNode(null);
  }, [draggingNode, resolveCrossings]);

  // Handle node click
  const handleNodeClick = useCallback((e: React.MouseEvent, node: MapNode) => {
    e.stopPropagation();
    
    if (connectingFrom) {
      if (connectingFrom !== node.id && mapData) {
        const fromNode = mapData.nodes.find(n => n.id === connectingFrom);
        if (fromNode) {
          const segments = generateSegmentsForEdge(
            { x: fromNode.x, y: fromNode.y },
            { x: node.x, y: node.y },
            1
          );
          const totalDistance = segments.reduce((sum, s) => sum + s.distance, 0);
          
          addEdge({
            id: `edge-${Date.now()}`,
            nodeA: connectingFrom,
            nodeB: node.id,
            segments,
            totalDistance,
          });
        }
      }
      setConnectingFrom(null);
    } else {
      setSelectedNodeId(node.id);
      setSelectedEdgeId(null);
      setSelectedSegmentId(null);
    }
  }, [connectingFrom, mapData, setSelectedNodeId, setSelectedEdgeId, setSelectedSegmentId, addEdge]);

  // Handle node double click (start connecting)
  const handleNodeDoubleClick = useCallback((e: React.MouseEvent, node: MapNode) => {
    e.stopPropagation();
    setConnectingFrom(node.id);
  }, []);

  // Handle segment click
  const handleSegmentClick = useCallback((e: React.MouseEvent, edge: Edge, segment: Segment) => {
    e.stopPropagation();
    setSelectedEdgeId(edge.id);
    setSelectedSegmentId(segment.id);
    setSelectedNodeId(null);
  }, [setSelectedEdgeId, setSelectedSegmentId, setSelectedNodeId]);

  // Handle segment double click (select entire edge)
  const handleSegmentDoubleClick = useCallback((e: React.MouseEvent, edge: Edge) => {
    e.stopPropagation();
    setSelectedEdgeId(edge.id);
    setSelectedSegmentId(null);
    setSelectedNodeId(null);
  }, [setSelectedEdgeId, setSelectedSegmentId, setSelectedNodeId]);

  // Handle segment hover
  const handleSegmentHover = useCallback((e: React.MouseEvent, edge: Edge, segment: Segment) => {
    setHoveredSegment({
      edge,
      segment,
      x: e.clientX,
      y: e.clientY,
    });
  }, []);

  // Zoom in/out functions
  const zoomIn = useCallback(() => {
    const center = {
      x: viewBox.x + viewBox.width / 2,
      y: viewBox.y + viewBox.height / 2,
    };
    const newWidth = viewBox.width * 0.8;
    const newHeight = viewBox.height * 0.8;
    if (newWidth < 100) return;
    
    setViewBox({
      x: center.x - newWidth / 2,
      y: center.y - newHeight / 2,
      width: newWidth,
      height: newHeight,
    });
    
    const bounds = calculateGraphBounds();
    setZoom(bounds.width / newWidth);
  }, [viewBox, calculateGraphBounds, setZoom]);

  const zoomOut = useCallback(() => {
    const center = {
      x: viewBox.x + viewBox.width / 2,
      y: viewBox.y + viewBox.height / 2,
    };
    const newWidth = viewBox.width * 1.25;
    const newHeight = viewBox.height * 1.25;
    if (newWidth > 5000) return;
    
    setViewBox({
      x: center.x - newWidth / 2,
      y: center.y - newHeight / 2,
      width: newWidth,
      height: newHeight,
    });
    
    const bounds = calculateGraphBounds();
    setZoom(bounds.width / newWidth);
  }, [viewBox, calculateGraphBounds, setZoom]);

  // Escape to cancel connecting, Delete/Backspace to delete selected element
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger when typing in an input/textarea
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'Escape') {
        setConnectingFrom(null);
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeId) {
          removeNode(selectedNodeId);
        } else if (selectedEdgeId) {
          if (selectedSegmentId) {
            removeSegmentFromEdge(selectedEdgeId, selectedSegmentId);
          } else {
            removeEdge(selectedEdgeId);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeId, selectedEdgeId, selectedSegmentId, removeNode, removeEdge, removeSegmentFromEdge]);

  if (!mapData) return null;

  // Fixed base sizes - nodes scale less aggressively with zoom
  // At zoom 1 (100%), these are the base sizes
  const baseNodeRadius = 16;
  const baseSubnodeRadius = 8;
  const baseStrokeWidth = 4;
  
  // Apply subtle zoom scaling (square root for gentler effect)
  // This makes nodes slightly smaller when zoomed out, slightly larger when zoomed in
  const zoomScale = Math.pow(zoom, 0.15); // Very subtle: 0.15 power means zoom 2x only makes 1.1x bigger
  const nodeRadius = baseNodeRadius * zoomScale;
  const subnodeRadius = baseSubnodeRadius * zoomScale;
  const strokeWidth = baseStrokeWidth * Math.pow(zoom, 0.1); // Even more subtle for edges

  return (
    <div ref={containerRef} className="relative flex-1 overflow-hidden bg-muted/30 rounded-lg border border-border">
      {/* Zoom controls */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={zoomIn}
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <span className="text-xs text-center text-muted-foreground bg-card border border-border rounded px-1 py-0.5">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={zoomOut}
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 mt-1"
          onClick={fitToGraph}
          title="Fit to graph"
        >
          <Maximize className="h-4 w-4" />
        </Button>
      </div>

      {/* Instructions */}
      <div className="absolute top-4 right-4 z-10 bg-card/95 border border-border rounded-lg p-2 text-xs text-muted-foreground max-w-[180px]">
        <p><strong className="text-foreground">Shift+Click:</strong> Add node</p>
        <p><strong className="text-foreground">Drag:</strong> Move node</p>
        <p><strong className="text-foreground">2x Click node:</strong> Connect</p>
        <p><strong className="text-foreground">Alt+Drag:</strong> Pan</p>
        <p><strong className="text-foreground">Scroll:</strong> Zoom</p>
      </div>

      {/* Connecting indicator */}
      {connectingFrom && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm">
          Click another node to connect (Esc to cancel)
        </div>
      )}

      <svg
        ref={svgRef}
        className="w-full h-full"
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        preserveAspectRatio="xMidYMid meet"
        onWheel={handleWheel}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: isPanning ? 'grabbing' : connectingFrom ? 'crosshair' : 'default' }}
      >
        {/* Edges */}
        {mapData.edges.map(edge => {
          const isEdgeSelected = selectedEdgeId === edge.id;
          const maxDistance = Math.max(...edge.segments.map(s => s.distance), 1);
          
          return (
            <g key={edge.id}>
              {edge.segments.map((segment, segIdx) => {
                const isSegmentSelected = isEdgeSelected && selectedSegmentId === segment.id;
                const isEdgeFullySelected = isEdgeSelected && !selectedSegmentId;
                
                // Calculate stroke width based on distance ratio
                const distanceRatio = segment.distance / maxDistance;
                const baseWidth = strokeWidth * (0.8 + distanceRatio * 0.4);
                const finalStrokeWidth = (isSegmentSelected || isEdgeFullySelected) ? baseWidth + 2 : baseWidth;
                
                const pathD = generateSegmentPath(segment);
                
                return (
                  <g key={segment.id}>
                    {/* Hit area (invisible, larger) */}
                    <path
                      d={pathD}
                      stroke="transparent"
                      strokeWidth={finalStrokeWidth + 12}
                      fill="none"
                      className="cursor-pointer"
                      onClick={(e) => handleSegmentClick(e, edge, segment)}
                      onDoubleClick={(e) => handleSegmentDoubleClick(e, edge)}
                      onMouseEnter={(e) => handleSegmentHover(e, edge, segment)}
                      onMouseLeave={() => setHoveredSegment(null)}
                    />
                    {/* Selection background for edge */}
                    {isEdgeFullySelected && (
                      <path
                        d={pathD}
                        stroke="hsl(var(--primary))"
                        strokeWidth={finalStrokeWidth + 6}
                        fill="none"
                        strokeLinecap="round"
                        className="pointer-events-none"
                        style={{ opacity: 0.2 }}
                      />
                    )}
                    {/* Selection highlight for individual segment */}
                    {isSegmentSelected && (
                      <path
                        d={pathD}
                        stroke="hsl(var(--primary))"
                        strokeWidth={finalStrokeWidth + 8}
                        fill="none"
                        strokeLinecap="round"
                        className="pointer-events-none"
                        style={{ opacity: 0.3 }}
                      />
                    )}
                    {/* Visual path */}
                    <path
                      d={pathD}
                      stroke={getTrafficColor(segment.traffic)}
                      strokeWidth={finalStrokeWidth}
                      fill="none"
                      strokeLinecap="round"
                      className="pointer-events-none"
                    />
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* Nodes */}
        {mapData.nodes.map(node => {
          const isSelected = selectedNodeId === node.id;
          const isSubnode = node.type === 'subnode';
          const radius = isSubnode ? subnodeRadius : nodeRadius;
          const isConnecting = connectingFrom === node.id;
          
          return (
            <g key={node.id}>
              {/* Selection ring */}
              {isSelected && (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={radius + 6}
                  fill="none"
                  stroke="hsl(var(--primary))"
                  strokeWidth={3}
                  className="pointer-events-none"
                />
              )}
              {/* Connecting indicator */}
              {isConnecting && (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={radius + 8}
                  fill="none"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  strokeDasharray="4 2"
                  className="pointer-events-none animate-pulse"
                />
              )}
              {/* Node circle */}
              <circle
                cx={node.x}
                cy={node.y}
                r={radius}
                fill={isSubnode ? '#6B7280' : node.color}
                stroke={isSelected ? 'hsl(var(--primary))' : 'white'}
                strokeWidth={isSubnode ? 1.5 : 2.5}
                className="cursor-pointer"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setDraggingNode(node.id);
                }}
                onClick={(e) => handleNodeClick(e, node)}
                onDoubleClick={(e) => handleNodeDoubleClick(e, node)}
              />
              {/* Node label (only for main nodes) */}
              {!isSubnode && (
                <text
                  x={node.x}
                  y={node.y + radius + 14}
                  textAnchor="middle"
                  className="fill-foreground text-xs font-medium pointer-events-none select-none"
                  style={{ fontSize: 11 * zoomScale }}
                >
                  {node.name}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Hover tooltip */}
      {hoveredSegment && (
        <div 
          className="fixed z-50 bg-popover text-popover-foreground border border-border rounded-lg px-3 py-2 shadow-lg text-sm pointer-events-none"
          style={{ 
            left: hoveredSegment.x + 12, 
            top: hoveredSegment.y + 12,
          }}
        >
          <div className="flex flex-col gap-1">
            <span><strong>Distance:</strong> {hoveredSegment.segment.distance.toFixed(1)} km</span>
            <span><strong>Speed:</strong> {hoveredSegment.segment.speed} km/h</span>
            <span><strong>Traffic:</strong> {(hoveredSegment.segment.traffic * 100).toFixed(0)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
