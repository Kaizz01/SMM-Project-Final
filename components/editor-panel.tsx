"use client";

import { useMap, SPEED_VALUES } from '@/lib/map-context';
import { NumericInput } from '@/components/ui/numeric-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Trash2, Plus, ChevronLeft, MapPin, Circle, Route, GitBranch, ArrowUp, ArrowDown } from 'lucide-react';

export function EditorPanel() {
  const {
    mapData,
    selectedNodeId,
    selectedEdgeId,
    selectedSegmentId,
    setSelectedNodeId,
    setSelectedEdgeId,
    setSelectedSegmentId,
    updateNode,
    removeNode,
    promoteSubnodeToNode,
    demoteNodeToSubnode,
    canDemoteNode,
    removeEdge,
    updateSegment,
    addSegmentToEdge,
    removeSegmentFromEdge,
    setCurrentStep,
    isGraphValid,
    segmentLimits,
  } = useMap();

  if (!mapData) return null;

  const selectedNode = mapData.nodes.find(n => n.id === selectedNodeId);
  const selectedEdge = mapData.edges.find(e => e.id === selectedEdgeId);
  const selectedSeg = selectedEdge?.segments.find(s => s.id === selectedSegmentId);
  const isSubnode = selectedNode?.type === 'subnode';

  const totalEdgeDistance = selectedEdge 
    ? selectedEdge.segments.reduce((sum, s) => sum + s.distance, 0) 
    : 0;

  const getNodeName = (nodeId: string) => {
    const node = mapData.nodes.find(n => n.id === nodeId);
    return node?.name || nodeId;
  };

  const nodeCanBeDemoted = selectedNode ? canDemoteNode(selectedNode.id) : false;

  return (
    <div className="w-72 bg-card border-l border-border flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto p-3">
        {/* Header */}
        <div className="flex items-center gap-2 mb-3 text-sm font-medium">
          {selectedNode && !isSubnode && <><MapPin className="h-4 w-4 text-primary" /> Node</>}
          {selectedNode && isSubnode && <><Circle className="h-4 w-4 text-muted-foreground" /> Subnode</>}
          {selectedEdge && !selectedSegmentId && <><Route className="h-4 w-4 text-primary" /> Edge</>}
          {selectedEdge && selectedSegmentId && <><GitBranch className="h-4 w-4 text-primary" /> Segment</>}
          {!selectedNode && !selectedEdge && <span className="text-muted-foreground">Properties</span>}
        </div>

        {/* Node Editor */}
        {selectedNode && (
          <div className="space-y-2">
            {/* Name and Color row */}
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground">Name</Label>
                <Input
                  value={selectedNode.name}
                  onChange={(e) => updateNode(selectedNode.id, { name: e.target.value })}
                  className="h-7 text-sm"
                  placeholder={isSubnode ? "Junction name" : "City name"}
                />
              </div>
              <Input
                type="color"
                value={selectedNode.color}
                onChange={(e) => updateNode(selectedNode.id, { color: e.target.value })}
                className="h-7 w-9 p-0.5 cursor-pointer"
              />
            </div>

            {/* Position row */}
            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground">X</Label>
                <NumericInput
                  value={Math.round(selectedNode.x)}
                  parse={parseFloat}
                  format={v => String(Math.round(v))}
                  onChange={v => updateNode(selectedNode.id, { x: v })}
                  className="h-7 text-sm"
                />
              </div>
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground">Y</Label>
                <NumericInput
                  value={Math.round(selectedNode.y)}
                  parse={parseFloat}
                  format={v => String(Math.round(v))}
                  onChange={v => updateNode(selectedNode.id, { y: v })}
                  className="h-7 text-sm"
                />
              </div>
            </div>

            {/* Node/Subnode ID badge */}
            <Badge variant="secondary" className="text-xs w-full justify-center">
              ID: {selectedNode.id}
            </Badge>

            {/* Actions */}
            <div className="flex gap-2 pt-1 flex-wrap">
              {isSubnode && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-7 text-xs"
                  onClick={() => promoteSubnodeToNode(selectedNode.id)}
                >
                  <ArrowUp className="h-3 w-3 mr-1" />
                  Promote
                </Button>
              )}
              {!isSubnode && nodeCanBeDemoted && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-7 text-xs"
                  onClick={() => demoteNodeToSubnode(selectedNode.id)}
                >
                  <ArrowDown className="h-3 w-3 mr-1" />
                  Demote
                </Button>
              )}
              <Button
                variant="destructive"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  removeNode(selectedNode.id);
                  setSelectedNodeId(null);
                }}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Delete
              </Button>
            </div>
          </div>
        )}

        {/* Edge Editor (no segment selected) */}
        {selectedEdge && !selectedSegmentId && (
          <div className="space-y-2">
            {/* Edge connection info */}
            <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
              <span className="font-medium text-foreground">{getNodeName(selectedEdge.nodeA)}</span>
              <span className="text-muted-foreground">{' '} to {' '}</span>
              <span className="font-medium text-foreground">{getNodeName(selectedEdge.nodeB)}</span>
            </div>

            {/* Edge stats */}
            <div className="flex items-center justify-between text-xs">
              <Badge variant="outline">
                {selectedEdge.segments.length} segment{selectedEdge.segments.length > 1 ? 's' : ''}
              </Badge>
              <Badge className="bg-primary">
                Total: {totalEdgeDistance.toFixed(1)} km
              </Badge>
            </div>

            <Separator />

            {/* Segments list */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <Label className="text-xs text-muted-foreground">Segments</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1.5 text-xs"
                  onClick={() => addSegmentToEdge(selectedEdge.id)}
                  disabled={selectedEdge.segments.length >= segmentLimits.maxSegmentsPerEdge}
                >
                  <Plus className="h-3 w-3 mr-0.5" />
                  Add
                </Button>
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                {selectedEdge.segments.map((seg, idx) => {
                  const widthPercent = totalEdgeDistance > 0 
                    ? (seg.distance / totalEdgeDistance) * 100 
                    : 100 / selectedEdge.segments.length;
                  
                  return (
                    <div
                      key={seg.id}
                      className="group flex items-center gap-1.5 p-1.5 rounded border border-border hover:border-primary/50 cursor-pointer transition-colors bg-background"
                      onClick={() => setSelectedSegmentId(seg.id)}
                    >
                      <span className="text-xs text-muted-foreground w-3">{idx + 1}</span>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary rounded-full transition-all" 
                          style={{ width: `${Math.max(widthPercent, 5)}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap w-16 text-right">
                        {seg.distance.toFixed(1)}km
                      </span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap w-12 text-right">
                        {seg.speed}km/h
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <Separator />

            <Button
              variant="destructive"
              size="sm"
              className="w-full h-7 text-xs"
              onClick={() => {
                removeEdge(selectedEdge.id);
                setSelectedEdgeId(null);
              }}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Delete Edge
            </Button>
          </div>
        )}

        {/* Segment Editor */}
        {selectedEdge && selectedSeg && (
          <div className="space-y-2">
            {/* Back button and segment info */}
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs px-2"
                onClick={() => setSelectedSegmentId(null)}
              >
                <ChevronLeft className="h-3 w-3 mr-0.5" />
                Back
              </Button>
              <Badge variant="secondary" className="text-xs">
                Segment {selectedEdge.segments.findIndex(s => s.id === selectedSeg.id) + 1}/{selectedEdge.segments.length}
              </Badge>
            </div>

            <Separator />

            {/* Distance - numeric input */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <Label className="text-xs text-muted-foreground">Distance (km)</Label>
                <span className="text-xs text-muted-foreground">
                  {segmentLimits.minDistance} - {segmentLimits.maxDistance}
                </span>
              </div>
              <NumericInput
                value={selectedSeg.distance}
                min={segmentLimits.minDistance}
                max={segmentLimits.maxDistance}
                step={0.1}
                parse={parseFloat}
                format={v => v.toFixed(1)}
                onChange={v => updateSegment(selectedEdge.id, selectedSeg.id, { distance: v })}
                className="h-7 text-sm"
              />
            </div>

            {/* Speed - fixed values grid */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <Label className="text-xs text-muted-foreground">Max Speed (km/h)</Label>
                <span className="text-xs font-mono font-semibold">{selectedSeg.speed} km/h</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {SPEED_VALUES.map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => updateSegment(selectedEdge.id, selectedSeg.id, { speed: v })}
                    className={`flex-1 min-w-[2.8rem] py-1 rounded text-xs font-mono border transition-colors ${
                      selectedSeg.speed === v
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background border-border hover:border-primary/50'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {/* Traffic */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <Label className="text-xs text-muted-foreground">Traffic Index</Label>
                <span className="text-xs font-mono">{selectedSeg.traffic.toFixed(2)}</span>
              </div>
              <Slider
                value={[selectedSeg.traffic]}
                min={segmentLimits.minTraffic}
                max={segmentLimits.maxTraffic}
                step={0.01}
                onValueChange={([value]) => updateSegment(selectedEdge.id, selectedSeg.id, { traffic: value })}
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
                <span>0</span>
                <span className="text-center">Avg: 0.2-0.3</span>
                <span>1</span>
              </div>
            </div>

            <Separator />

            <Button
              variant="destructive"
              size="sm"
              className="w-full h-7 text-xs"
              onClick={() => {
                removeSegmentFromEdge(selectedEdge.id, selectedSeg.id);
              }}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              {selectedEdge.segments.length <= 1 ? 'Delete Edge' : 'Delete Segment'}
            </Button>
          </div>
        )}

        {/* No selection state */}
        {!selectedNode && !selectedEdge && (
          <div className="text-center text-muted-foreground text-sm py-4">
            <p className="mb-2">Select an element</p>
            <div className="text-xs space-y-0.5 text-left bg-muted/50 rounded-lg p-2">
              <p><strong>Shift+click</strong>: Add node</p>
              <p><strong>Double-click node</strong>: Create edge</p>
              <p><strong>Click segment</strong>: Select</p>
              <p><strong>Double-click segment</strong>: Select edge</p>
            </div>
          </div>
        )}

        <Separator className="my-2" />

        {/* Map Stats */}
        <Card className="bg-muted/30">
          <CardHeader className="py-1.5 px-2">
            <CardTitle className="text-xs">Statistics</CardTitle>
          </CardHeader>
          <CardContent className="py-1.5 px-2 text-xs space-y-0.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Nodes:</span>
              <span>{mapData.nodes.filter(n => n.type === 'node').length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subnodes:</span>
              <span>{mapData.nodes.filter(n => n.type === 'subnode').length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Edges:</span>
              <span>{mapData.edges.length}</span>
            </div>
          </CardContent>
        </Card>

        {/* Seed Display */}
        <Card className="mt-2 bg-muted/30">
          <CardHeader className="py-1.5 px-2">
            <CardTitle className="text-xs">Code</CardTitle>
          </CardHeader>
          <CardContent className="py-1.5 px-2">
            {mapData.seed ? (
              <>
                <code className="block w-full p-1 bg-background rounded text-[10px] font-mono break-all border max-h-20 overflow-y-auto leading-tight">
                  {mapData.seed}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-1.5 h-6 text-xs"
                  onClick={() => navigator.clipboard.writeText(mapData.seed)}
                >
                  Copy
                </Button>
              </>
            ) : (
              <>
                <div className="w-full p-1 bg-background rounded text-xs text-muted-foreground border border-dashed min-h-[1.75rem] flex items-center justify-center">
                  &mdash;
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-1.5 h-6 text-xs opacity-40 cursor-not-allowed"
                  disabled
                >
                  Copy
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Continue Button */}
      <div className="p-3 border-t border-border">
        <Button
          className="w-full h-8"
          onClick={() => setCurrentStep('objectives')}
          disabled={mapData.nodes.filter(n => n.type === 'node').length < 2}
        >
          Continue to Objectives
        </Button>
      </div>
    </div>
  );
}
