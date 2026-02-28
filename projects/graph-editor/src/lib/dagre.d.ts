declare module 'dagre' {
  namespace graphlib {
    class Graph {
      setGraph(options: Record<string, unknown>): void;
      setDefaultEdgeLabel(fn: () => Record<string, unknown>): void;
      setNode(id: string, label: Record<string, unknown>): void;
      setEdge(source: string, target: string): void;
      node(id: string): { x: number; y: number; width: number; height: number } | undefined;
    }
  }
  function layout(graph: graphlib.Graph): void;

  const dagre: {
    graphlib: typeof graphlib;
    layout: typeof layout;
  };

  export default dagre;
}