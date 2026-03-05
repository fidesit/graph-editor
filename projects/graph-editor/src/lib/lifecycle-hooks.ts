import { Graph, GraphEdge, GraphNode } from './graph.model';

/**
 * Connection endpoint descriptor passed to lifecycle hooks.
 */
export interface ConnectionEndpoint {
  nodeId: string;
  port: string;
}

/**
 * Lifecycle hooks for intercepting graph mutations.
 *
 * Hooks are invoked on **user-initiated** actions (palette add, keyboard
 * delete/cut, drag-to-connect). Programmatic API calls (`addNode`,
 * `removeNode`, `removeEdge`) do NOT trigger hooks — consumers calling
 * those methods have already decided the mutation should happen.
 *
 * Async hooks (`beforeNodeAdd`, `beforeNodeRemove`, `beforeEdgeAdd`,
 * `beforeEdgeRemove`) may return a `Promise<boolean>` and can therefore
 * display confirmation dialogs or perform server-side validation.
 *
 * The sync hook (`canConnect`) is called on every mousemove during
 * drag-to-connect and **must** return immediately.
 */
export interface LifecycleHooks {
  /**
   * Called before a node is added via the palette.
   * Return `false` (or resolve to `false`) to cancel.
   *
   * @param type  Node type identifier about to be created.
   * @param graph Current graph state.
   */
  beforeNodeAdd?: (type: string, graph: Graph) => boolean | Promise<boolean>;

  /**
   * Called before nodes are removed (Delete / Backspace / Cut).
   * Receives every node about to be deleted.
   * Return `false` to cancel the entire removal.
   *
   * @param nodes Nodes that will be removed.
   * @param graph Current graph state.
   */
  beforeNodeRemove?: (nodes: GraphNode[], graph: Graph) => boolean | Promise<boolean>;

  /**
   * Called before an edge is created via drag-to-connect.
   * Return `false` to cancel edge creation.
   *
   * @param edge   Partial edge descriptor (source, target, ports).
   * @param graph  Current graph state.
   */
  beforeEdgeAdd?: (
    edge: { source: string; target: string; sourcePort: string; targetPort: string },
    graph: Graph,
  ) => boolean | Promise<boolean>;

  /**
   * Called before edges are removed (Delete / Backspace / Cut).
   * Receives every edge about to be deleted (including edges orphaned
   * by the removal of their source/target nodes).
   * Return `false` to cancel the entire removal.
   *
   * @param edges Edges that will be removed.
   * @param graph Current graph state.
   */
  beforeEdgeRemove?: (edges: GraphEdge[], graph: Graph) => boolean | Promise<boolean>;

  /**
   * Synchronous connection validator called on every mousemove during
   * drag-to-connect and edge reconnection. When this returns `false`
   * the target port will **not** highlight and the connection will not
   * be created on drop.
   *
   * ⚠️  Must be synchronous — called inside the mousemove handler.
   *
   * @param source Source endpoint (node + port).
   * @param target Target endpoint (node + port).
   * @param graph  Current graph state.
   */
  canConnect?: (source: ConnectionEndpoint, target: ConnectionEndpoint, graph: Graph) => boolean;
}

// ── Hook invocation helpers ─────────────────────────────────────────────────

/**
 * Invoke an async-capable lifecycle hook.
 * Returns `true` when the hook is not defined, returns/resolves `true`,
 * or is not a function. Returns `false` when the hook returns/resolves
 * `false` **or** throws.
 */
export async function invokeAsyncHook<TArgs extends unknown[]>(
  hook: ((...args: TArgs) => boolean | Promise<boolean>) | undefined,
  ...args: TArgs
): Promise<boolean> {
  if (!hook) return true;
  try {
    return await hook(...args);
  } catch {
    return false;
  }
}

/**
 * Invoke a synchronous lifecycle hook.
 * Returns `true` when the hook is not defined or returns `true`.
 * Returns `false` when the hook returns `false` or throws.
 */
export function invokeSyncHook<TArgs extends unknown[]>(
  hook: ((...args: TArgs) => boolean) | undefined,
  ...args: TArgs
): boolean {
  if (!hook) return true;
  try {
    return hook(...args);
  } catch {
    return false;
  }
}
