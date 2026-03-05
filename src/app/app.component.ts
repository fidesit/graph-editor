import { Component, signal, viewChild, computed, AfterViewInit } from '@angular/core';
import { JsonPipe } from '@angular/common';
import { GraphEditorComponent, Graph, GraphEditorConfig, NodeTypeDefinition, ContextMenuEvent, SvgIconDefinition, ValidationResult, ValidationRule, ValidationError, ThemeConfig } from '@utisha/graph-editor';

/**
 * SVG path data for demo icons.
 * Stroke color is applied per-theme via buildIcons().
 */
const ICON_PATHS: Record<string, { viewBox: string; path: string }> = {
  process: {
    viewBox: '0 0 24 24',
    path: `M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z
           M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z`
  },
  decision: {
    viewBox: '0 0 24 24',
    path: `M12 3L21 12L12 21L3 12L12 3Z
           M12 8v4
           M12 16h.01`
  },
  start: {
    viewBox: '0 0 24 24',
    path: `M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10Z
           M10 8l6 4-6 4V8Z`
  },
  end: {
    viewBox: '0 0 24 24',
    path: `M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10Z
           M8 8h8v8H8V8Z`
  },
  database: {
    viewBox: '0 0 24 24',
    path: `M12 5c4.418 0 8 1.12 8 2.5v9c0 1.38-3.582 2.5-8 2.5s-8-1.12-8-2.5v-9C4 6.12 7.582 5 12 5Z
           M4 7.5c0 1.38 3.582 2.5 8 2.5s8-1.12 8-2.5
           M4 12c0 1.38 3.582 2.5 8 2.5s8-1.12 8-2.5`
  },
  api: {
    viewBox: '0 0 24 24',
    path: `M4 12h4l2-6 4 12 2-6h4
           M2 12h2
           M20 12h2`
  },
  approval: {
    viewBox: '0 0 24 24',
    path: `M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2
           M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z
           M16 11l2 2 4-4`
  }
};

/** Build icons with per-type stroke colors matching a theme palette. */
function buildIcons(colors: Record<string, string>, strokeWidth = 1.75): Record<string, SvgIconDefinition> {
  const icons: Record<string, SvgIconDefinition> = {};
  for (const [key, data] of Object.entries(ICON_PATHS)) {
    icons[key] = { viewBox: data.viewBox, fill: 'none', stroke: colors[key] ?? '#64748b', strokeWidth, path: data.path };
  }
  return icons;
}

// ── Per-theme icon color palettes ──────────────────────────────────
// Each theme gets its own icon stroke colors that sit naturally within
// the theme's overall color family.

/** Corporate — muted blues and grays, professional and understated */
const ICONS_CORPORATE = buildIcons({
  process:  '#3b82f6', // blue-500
  decision: '#6366f1', // indigo-500
  start:    '#22c55e', // green-500
  end:      '#ef4444', // red-500
  database: '#0ea5e9', // sky-500
  api:      '#f59e0b', // amber-500
  approval: '#8b5cf6', // violet-500
});

/** Emerald — greens and teals, fresh organic feel */
const ICONS_EMERALD = buildIcons({
  process:  '#059669', // emerald-600
  decision: '#0d9488', // teal-600
  start:    '#16a34a', // green-600
  end:      '#e11d48', // rose-600
  database: '#0891b2', // cyan-600
  api:      '#d97706', // amber-600
  approval: '#0e7490', // cyan-700
});

/** Blueprint — indigo/violet spectrum, technical precision */
const ICONS_BLUEPRINT = buildIcons({
  process:  '#4f46e5', // indigo-600
  decision: '#7c3aed', // violet-600
  start:    '#059669', // emerald-600
  end:      '#dc2626', // red-600
  database: '#2563eb', // blue-600
  api:      '#c026d3', // fuchsia-600
  approval: '#4338ca', // indigo-700
}, 2);

/** Midnight — high-contrast neons on dark, terminal/devops */
const ICONS_MIDNIGHT = buildIcons({
  process:  '#38bdf8', // sky-400
  decision: '#a78bfa', // violet-400
  start:    '#4ade80', // green-400
  end:      '#fb7185', // rose-400
  database: '#22d3ee', // cyan-400
  api:      '#fbbf24', // amber-400
  approval: '#2dd4bf', // teal-400
}, 1.5);

/**
 * Demo validation rules - basic workflow validation.
 */
const DEMO_VALIDATION_RULES: ValidationRule[] = [
  // Rule 1: Must have exactly one entry point (node with no incoming edges)
  {
    id: 'single-entry-point',
    message: 'Workflow must have exactly one entry point',
    validator: (graph) => {
      if (graph.nodes.length === 0) return [];
      const entryPoints = graph.nodes.filter(node =>
        !graph.edges.some(edge => edge.target === node.id)
      );
      if (entryPoints.length === 0) {
        return [{ rule: 'single-entry-point', message: 'Workflow must have at least one entry point (a node with no incoming edges)', severity: 'error' }];
      }
      if (entryPoints.length > 1) {
        return entryPoints.map(node => ({
          rule: 'single-entry-point',
          message: `Node "${node.data['name'] || node.id}" has no incoming edges. Connect it to another node or remove it.`,
          nodeId: node.id,
          severity: 'error'
        }));
      }
      return [];
    }
  },
  // Rule 2: Must have at least one end point (node with no outgoing edges)
  {
    id: 'has-end-point',
    message: 'Workflow should have at least one end point',
    validator: (graph) => {
      if (graph.nodes.length === 0) return [];
      const endPoints = graph.nodes.filter(node =>
        !graph.edges.some(edge => edge.source === node.id)
      );
      if (endPoints.length === 0) {
        return [{ rule: 'has-end-point', message: 'Workflow should have at least one end point (a node with no outgoing edges)', severity: 'warning' }];
      }
      return [];
    }
  },
  // Rule 3: No orphan nodes (nodes must be connected)
  {
    id: 'no-orphans',
    message: 'All nodes must be connected',
    validator: (graph) => {
      if (graph.nodes.length <= 1) return [];
      const connectedNodes = new Set<string>();
      graph.edges.forEach(edge => {
        connectedNodes.add(edge.source);
        connectedNodes.add(edge.target);
      });
      const orphans = graph.nodes.filter(node => !connectedNodes.has(node.id));
      return orphans.map(node => ({
        rule: 'no-orphans',
        message: `Node "${node.data['name'] || node.id}" is not connected to any other node`,
        nodeId: node.id,
        severity: 'error'
      }));
    }
  }
];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [GraphEditorComponent, JsonPipe],
  template: `
    <div class="demo-container">
      <header class="demo-header">
        <h1>&#64;utisha/graph-editor</h1>
        <p>Configuration-driven visual graph editor for Angular 19+</p>
        <div class="header-actions">
          <div class="theme-group">
            <span class="theme-label">Theme</span>
            <select class="theme-select" (change)="onThemeChange($event)" [value]="currentTheme()">
              <option value="minimal">Midnight</option>
              <option value="default">Corporate</option>
              <option value="compact">Emerald</option>
              <option value="detailed">Blueprint</option>
            </select>
          </div>
          <label class="readonly-toggle">
            <input type="checkbox" [checked]="readonlyMode()" (change)="readonlyMode.set($any($event.target).checked)" />
            <span>Readonly</span>
          </label>
          <div class="action-divider"></div>
          <button class="action-btn" (click)="validate()" title="Validate">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 12l2 2 4-4"/>
              <circle cx="12" cy="12" r="10"/>
            </svg>
            <span>Validate</span>
          </button>
          <button class="action-btn" (click)="exportGraph()" title="Export JSON">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <span>Export</span>
          </button>
          <button class="action-btn" [disabled]="readonlyMode()" (click)="showImport.set(true)" title="Import JSON">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <span>Import</span>
          </button>
          <button class="action-btn help-btn" (click)="showHelp.set(true)" title="Help">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
              <circle cx="12" cy="17" r="0.5" fill="currentColor"/>
            </svg>
          </button>
        </div>
      </header>

      <!-- Validation Panel -->
      @if (validationResult(); as result) {
        @if (!result.valid || result.errors.length > 0) {
          <div class="validation-panel" [class.has-errors]="!result.valid">
            <div class="validation-header">
              <span class="validation-icon">{{ result.valid ? '⚠️' : '❌' }}</span>
              <span class="validation-title">
                {{ result.valid ? 'Warnings' : 'Validation Errors' }} ({{ result.errors.length }})
              </span>
              <button class="validation-close" (click)="clearValidation()" title="Dismiss">×</button>
            </div>
            <ul class="validation-list">
              @for (error of result.errors; track error.rule + (error.nodeId ?? '')) {
                <li class="validation-item" [class.warning]="error.severity === 'warning'">
                  <span class="validation-item-icon">{{ error.severity === 'warning' ? '⚠️' : '●' }}</span>
                  <span class="validation-item-message">{{ error.message }}</span>
                  @if (error.nodeId) {
                    <button class="validation-item-link" (click)="focusNode(error.nodeId)">Show</button>
                  }
                </li>
              }
            </ul>
          </div>
        }
      }

      <main class="demo-main">
        <graph-editor
          #editor
          [config]="editorConfig()"
          [graph]="currentGraph()"
          [readonly]="readonlyMode()"
          (graphChange)="onGraphChange($event)"
          (nodeClick)="onNodeClick($event)"
          (nodeDoubleClick)="onNodeDoubleClick($event)"
          (edgeClick)="onEdgeClick($event)"
          (contextMenu)="onContextMenu($event)"
        />
      </main>

      <aside class="demo-sidebar">
        <h3>Graph Data</h3>
        <pre>{{ currentGraph() | json }}</pre>
      </aside>
    </div>

    @if (showHelp()) {
      <div class="help-overlay" (click)="showHelp.set(false)">
        <div class="help-popup" (click)="$event.stopPropagation()">
          <div class="help-header">
            <h2>Shortcuts</h2>
            <button class="close-btn" (click)="showHelp.set(false)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="help-columns">
            <div class="help-section">
              <h3>Canvas</h3>
              <dl>
                <div><dt><kbd>Scroll</kbd></dt><dd>Zoom in/out</dd></div>
                <div><dt><kbd>Drag</kbd></dt><dd>Pan view</dd></div>
                <div><dt><kbd>Shift+Drag</kbd></dt><dd>Box select</dd></div>
              </dl>
            </div>
            <div class="help-section">
              <h3>Nodes</h3>
              <dl>
                <div><dt><kbd>Click</kbd></dt><dd>Select</dd></div>
                <div><dt><kbd>Ctrl+Click</kbd></dt><dd>Toggle select</dd></div>
                <div><dt><kbd>Double-click</kbd></dt><dd>Edit name</dd></div>
                <div><dt><kbd>Drag</kbd></dt><dd>Move (all if multi-selected)</dd></div>
                <div><dt><kbd>Drag corner</kbd></dt><dd>Resize (Hand tool)</dd></div>
                <div><dt><kbd>Del</kbd></dt><dd>Remove selected</dd></div>
                <div><dt><kbd>\u2190\u2191\u2192\u2193</kbd></dt><dd>Nudge (Shift: 10px)</dd></div>
              </dl>
            </div>
            <div class="help-section">
              <h3>Edges</h3>
              <dl>
                <div><dt><kbd>Select node</kbd></dt><dd>Show ports</dd></div>
                <div><dt><kbd>Drag port</kbd></dt><dd>Connect to target</dd></div>
                <div><dt><kbd>Drag endpoint</kbd></dt><dd>Reconnect edge</dd></div>
                <div><dt><kbd>Click edge</kbd></dt><dd>Direction</dd></div>
                <div><dt><kbd>Ctrl+Click</kbd></dt><dd>Add waypoint</dd></div>
                <div><dt><kbd>Drag waypoint</kbd></dt><dd>Reshape edge</dd></div>
              </dl>
            </div>
            <div class="help-section">
              <h3>General</h3>
              <dl>
                <div><dt><kbd>Ctrl+Z</kbd></dt><dd>Undo</dd></div>
                <div><dt><kbd>Ctrl+Y</kbd></dt><dd>Redo</dd></div>
                <div><dt><kbd>Ctrl+C</kbd></dt><dd>Copy</dd></div>
                <div><dt><kbd>Ctrl+X</kbd></dt><dd>Cut</dd></div>
                <div><dt><kbd>Ctrl+V</kbd></dt><dd>Paste</dd></div>
                <div><dt><kbd>Esc</kbd></dt><dd>Cancel / Deselect</dd></div>
              </dl>
            </div>
            <div class="help-section">
              <h3>Layout</h3>
              <dl>
                <div><dt><kbd>Layout btn</kbd></dt><dd>Apply last-used layout</dd></div>
                <div><dt><kbd>Chevron ▾</kbd></dt><dd>Switch algorithm</dd></div>
                <div><dt><kbd>Hierarchical</kbd></dt><dd>Dagre top-down / left-right</dd></div>
                <div><dt><kbd>Compact</kbd></dt><dd>Tight grid-based layout</dd></div>
              </dl>
            </div>
            <div class="help-section">
              <h3>Theming</h3>
              <dl>
                <div><dt><kbd>Theme picker</kbd></dt><dd>Switch presets</dd></div>
                <div><dt><kbd>ThemeConfig</kbd></dt><dd>Canvas, nodes, edges, ports, toolbar</dd></div>
                <div><dt><kbd>ng-template</kbd></dt><dd>Custom node/edge rendering</dd></div>
                <div><dt><kbd>pathType</kbd></dt><dd>straight / bezier / step</dd></div>
                <div><dt><kbd>gridType</kbd></dt><dd>line / dot</dd></div>
              </dl>
            </div>
          </div>
        </div>
      </div>
    }

    @if (contextMenu()) {
      <div class="context-menu-overlay" (click)="closeContextMenu()">
        <div
          class="context-menu"
          [style.left.px]="contextMenu()!.position.x"
          [style.top.px]="contextMenu()!.position.y"
          (click)="$event.stopPropagation()"
        >
          @if (contextMenu()!.type === 'canvas') {
            <button class="context-menu-item" (click)="addNodeAtPosition()">
              <span class="context-menu-icon">➕</span>
              Add Node Here
            </button>
          }
          @if (contextMenu()!.type === 'node') {
            <button class="context-menu-item" (click)="duplicateNode()">
              <span class="context-menu-icon">📋</span>
              Duplicate
            </button>
            <button class="context-menu-item danger" (click)="deleteNode()">
              <span class="context-menu-icon">🗑️</span>
              Delete Node
            </button>
          }
          @if (contextMenu()!.type === 'edge') {
            <button class="context-menu-item" (click)="reverseEdge()">
              <span class="context-menu-icon">🔄</span>
              Reverse Direction
            </button>
            <button class="context-menu-item danger" (click)="deleteEdge()">
              <span class="context-menu-icon">🗑️</span>
              Delete Edge
            </button>
          }
        </div>
      </div>
    }

    @if (editingNode()) {
      <div class="edit-overlay" (click)="cancelEdit()">
        <div class="edit-dialog" (click)="$event.stopPropagation()">
          <h3>Edit Node</h3>
          <label>
            Name
            <input
              #editInput
              type="text"
              [value]="editingNode()!.data['name'] || editingNode()!.type"
              (keydown.enter)="saveEdit(editInput.value)"
              (keydown.escape)="cancelEdit()"
            />
          </label>
          <div class="edit-actions">
            <button class="edit-btn cancel" (click)="cancelEdit()">Cancel</button>
            <button class="edit-btn save" (click)="saveEdit(editInput.value)">Save</button>
          </div>
        </div>
      </div>
    }

    @if (showImport()) {
      <div class="import-overlay" (click)="cancelImport()">
        <div class="import-dialog" (click)="$event.stopPropagation()">
          <h3>Import Graph JSON</h3>
          <p class="import-hint">Paste a valid graph JSON with nodes and edges arrays</p>
          <textarea
            #importTextarea
            class="import-textarea"
            placeholder='{"nodes": [...], "edges": [...]}'
            (keydown.escape)="cancelImport()"
          ></textarea>
          @if (importError()) {
            <p class="import-error">{{ importError() }}</p>
          }
          <div class="import-actions">
            <button class="edit-btn cancel" (click)="cancelImport()">Cancel</button>
            <button class="edit-btn save" (click)="doImport(importTextarea.value)">Import</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .demo-container {
      display: grid;
      grid-template-rows: auto auto 1fr;
      grid-template-columns: 1fr 300px;
      height: 100vh;
      gap: 0;
    }

    .demo-header {
      grid-column: 1 / -1;
      padding: 16px 24px;
      background: white;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      align-items: center;
      gap: 24px;
    }

    .demo-header h1 {
      font-size: 18px;
      font-weight: 600;
      color: #111827;
    }

    .demo-header p {
      font-size: 14px;
      color: #6b7280;
    }

    .header-actions {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .theme-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .theme-label {
      font-size: 13px;
      font-weight: 500;
      color: #6b7280;
    }

    .readonly-toggle {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      font-weight: 500;
      color: #6b7280;
      cursor: pointer;
      user-select: none;
    }

    .readonly-toggle input {
      accent-color: #3b82f6;
      cursor: pointer;
    }

    .action-divider {
      width: 1px;
      height: 32px;
      background: #e5e7eb;
      margin: 0 8px;
    }

    .theme-select {
      padding: 8px 32px 8px 12px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      background: white url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E") no-repeat right 10px center;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
      color: #374151;
      appearance: none;
      -webkit-appearance: none;
    }

    .theme-select:hover {
      border-color: #d1d5db;
      background-color: #f9fafb;
    }

    .theme-select:focus {
      outline: none;
      border-color: #3b82f6;
      background-color: white;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .action-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      background: white;
      font-size: 13px;
      font-weight: 500;
      color: #374151;
      cursor: pointer;
      transition: all 0.15s;
    }

    .action-btn:hover {
      background: #f9fafb;
      border-color: #d1d5db;
      color: #111827;
    }

    .action-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
      pointer-events: none;
    }

    .action-btn:active {
      background: #f3f4f6;
      transform: translateY(1px);
    }

    .action-btn svg {
      flex-shrink: 0;
    }

    .help-btn {
      padding: 8px;
      color: #6b7280;
    }

    .help-btn:hover {
      color: #3b82f6;
      border-color: #3b82f6;
      background: #eff6ff;
    }

    .demo-main {
      background: #f8f9fa;
      overflow: hidden;
    }

    .demo-sidebar {
      background: white;
      border-left: 1px solid #e5e7eb;
      padding: 16px;
      overflow: auto;
    }

    .demo-sidebar h3 {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 12px;
      color: #374151;
    }

    .demo-sidebar pre {
      font-size: 12px;
      background: #f3f4f6;
      padding: 12px;
      border-radius: 6px;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }

    graph-editor {
      display: block;
      width: 100%;
      height: 100%;
    }

    .help-overlay {
      position: fixed;
      inset: 0;
      background: rgba(17, 24, 39, 0.6);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      animation: fadeIn 0.15s ease-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes slideUp {
      from { opacity: 0; transform: translateY(20px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    .help-popup {
      position: relative;
      background: white;
      border-radius: 12px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      max-width: 740px;
      width: 92%;
      padding: 0;
      animation: slideUp 0.2s ease-out;
    }

    .help-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid #e5e7eb;
    }

    .help-header h2 {
      font-size: 13px;
      font-weight: 600;
      color: #374151;
      margin: 0;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }

    .close-btn {
      background: none;
      border: none;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: #9ca3af;
      border-radius: 6px;
      transition: all 0.15s;
    }

    .close-btn:hover {
      background: #f3f4f6;
      color: #111827;
    }

    .help-columns {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0;
      padding: 12px 16px 16px;
    }

    .help-section {
      padding: 4px 12px;
    }

    .help-section:not(:last-child) {
      border-right: 1px solid #f3f4f6;
    }

    .help-section:nth-child(4) {
      border-right: 1px solid #f3f4f6;
    }

    .help-section:nth-child(n+4) {
      padding-top: 12px;
    }

    .help-section h3 {
      font-size: 11px;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin: 0 0 6px;
    }

    .help-section dl {
      margin: 0;
    }

    .help-section dl > div {
      display: flex;
      align-items: baseline;
      gap: 8px;
      padding: 2px 0;
    }

    .help-section dt {
      flex-shrink: 0;
    }

    .help-section dd {
      margin: 0;
      font-size: 11px;
      color: #6b7280;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    kbd {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 3px;
      padding: 1px 5px;
      font-family: inherit;
      font-size: 10px;
      font-weight: 500;
      color: #374151;
      box-shadow: 0 1px 0 rgba(0, 0, 0, 0.06);
      white-space: nowrap;
    }

    .context-menu-overlay {
      position: fixed;
      inset: 0;
      z-index: 1000;
    }

    .context-menu {
      position: fixed;
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
      border: 1px solid #e5e7eb;
      padding: 4px;
      min-width: 160px;
      animation: contextMenuIn 0.1s ease-out;
    }

    @keyframes contextMenuIn {
      from { opacity: 0; transform: scale(0.95); }
      to { opacity: 1; transform: scale(1); }
    }

    .context-menu-item {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 8px 12px;
      border: none;
      background: none;
      font-size: 13px;
      color: #374151;
      cursor: pointer;
      border-radius: 4px;
      text-align: left;
      transition: background 0.1s;
    }

    .context-menu-item:hover {
      background: #f3f4f6;
    }

    .context-menu-item.danger {
      color: #dc2626;
    }

    .context-menu-item.danger:hover {
      background: #fef2f2;
    }

    .context-menu-icon {
      font-size: 14px;
      width: 18px;
      text-align: center;
    }

    /* Validation Panel */
    .validation-panel {
      grid-column: 1 / -1;
      background: #fef3c7;
      border-bottom: 1px solid #fcd34d;
      padding: 8px 16px;
      font-size: 13px;
    }

    .validation-panel.has-errors {
      background: #fef2f2;
      border-bottom-color: #fca5a5;
    }

    .validation-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
    }

    .validation-icon {
      font-size: 14px;
    }

    .validation-title {
      font-weight: 600;
      color: #92400e;
    }

    .validation-panel.has-errors .validation-title {
      color: #991b1b;
    }

    .validation-close {
      margin-left: auto;
      background: none;
      border: none;
      font-size: 18px;
      cursor: pointer;
      color: #9ca3af;
      padding: 0 4px;
      line-height: 1;
    }

    .validation-close:hover {
      color: #6b7280;
    }

    .validation-list {
      list-style: none;
      margin: 0;
      padding: 0;
      max-height: 120px;
      overflow-y: auto;
    }

    .validation-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 0;
      color: #991b1b;
    }

    .validation-item.warning {
      color: #92400e;
    }

    .validation-item-icon {
      font-size: 10px;
      flex-shrink: 0;
    }

    .validation-item-message {
      flex: 1;
    }

    .validation-item-link {
      background: none;
      border: none;
      color: #2563eb;
      cursor: pointer;
      font-size: 12px;
      text-decoration: underline;
      padding: 0;
    }

    .validation-item-link:hover {
      color: #1d4ed8;
    }

    /* Edit Node Dialog */
    .edit-overlay {
      position: fixed;
      inset: 0;
      background: rgba(17, 24, 39, 0.5);
      backdrop-filter: blur(2px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      animation: fadeIn 0.15s ease-out;
    }

    .edit-dialog {
      background: white;
      border-radius: 12px;
      padding: 24px;
      min-width: 320px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
      animation: slideUp 0.2s ease-out;
    }

    .edit-dialog h3 {
      margin: 0 0 16px;
      font-size: 18px;
      font-weight: 600;
      color: #111827;
    }

    .edit-dialog label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      color: #374151;
      margin-bottom: 6px;
    }

    .edit-dialog input {
      display: block;
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 14px;
      margin-top: 6px;
      transition: border-color 0.15s, box-shadow 0.15s;
    }

    .edit-dialog input:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
    }

    .edit-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 20px;
    }

    .edit-btn {
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }

    .edit-btn.cancel {
      background: white;
      border: 1px solid #d1d5db;
      color: #374151;
    }

    .edit-btn.cancel:hover {
      background: #f9fafb;
      border-color: #9ca3af;
    }

    .edit-btn.save {
      background: #3b82f6;
      border: 1px solid #3b82f6;
      color: white;
    }

    .edit-btn.save:hover {
      background: #2563eb;
      border-color: #2563eb;
    }

    /* Import Dialog */
    .import-overlay {
      position: fixed;
      inset: 0;
      background: rgba(17, 24, 39, 0.5);
      backdrop-filter: blur(2px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      animation: fadeIn 0.15s ease-out;
    }

    .import-dialog {
      background: white;
      border-radius: 12px;
      padding: 24px;
      width: 500px;
      max-width: 90%;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
      animation: slideUp 0.2s ease-out;
    }

    .import-dialog h3 {
      margin: 0 0 8px;
      font-size: 18px;
      font-weight: 600;
      color: #111827;
    }

    .import-hint {
      margin: 0 0 16px;
      font-size: 13px;
      color: #6b7280;
    }

    .import-textarea {
      display: block;
      width: 100%;
      height: 200px;
      padding: 12px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-family: 'SF Mono', Monaco, Consolas, monospace;
      font-size: 12px;
      resize: vertical;
      transition: border-color 0.15s, box-shadow 0.15s;
    }

    .import-textarea:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
    }

    .import-error {
      margin: 12px 0 0;
      padding: 8px 12px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 6px;
      font-size: 13px;
      color: #dc2626;
    }

    .import-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 16px;
    }
  `]
})
export class AppComponent implements AfterViewInit {
  // Theme presets — four distinct institutional looks
  private readonly themes: Record<string, { nodeSize: { width: number; height: number }; gridSize: number; icons: Record<string, SvgIconDefinition>; theme: ThemeConfig }> = {
    // ── Corporate ─────────────────────────────────────────────────────
    // Clean white, trustworthy blue, line grid, straight edges, system font.
    default: {
      nodeSize: { width: 180, height: 80 },
      gridSize: 20,
      icons: ICONS_CORPORATE,
      theme: {
        shadows: true,
        canvas: { background: '#f8fafc', gridType: 'line', gridColor: '#e2e8f0' },
        node: {
          background: '#ffffff',
          borderColor: '#cbd5e1',
          borderWidth: 1.5,
          borderRadius: 10,
          selectedBorderColor: '#2563eb',
          selectedBorderWidth: 2.5,
          shadowColor: 'rgba(15, 23, 42, 0.06)',
          labelColor: '#1e293b',
          labelFont: 'system-ui, -apple-system, "Segoe UI", sans-serif',
          typeStyles: {
            'start':    { background: '#f0fdf4', borderColor: '#bbf7d0', accentColor: '#22c55e', accentTextColor: '#ffffff' },
            'end':      { background: '#fef2f2', borderColor: '#fecaca', accentColor: '#ef4444', accentTextColor: '#ffffff' },
            'process':  { background: '#eff6ff', borderColor: '#bfdbfe', accentColor: '#3b82f6', accentTextColor: '#ffffff' },
            'decision': { background: '#eef2ff', borderColor: '#c7d2fe', accentColor: '#6366f1', accentTextColor: '#ffffff' },
            'database': { background: '#f0f9ff', borderColor: '#bae6fd', accentColor: '#0ea5e9', accentTextColor: '#ffffff' },
            'api':      { background: '#fffbeb', borderColor: '#fde68a', accentColor: '#f59e0b', accentTextColor: '#ffffff' },
            'approval': { background: '#f5f3ff', borderColor: '#ddd6fe', accentColor: '#8b5cf6', accentTextColor: '#ffffff' },
          },
        },
        edge: {
          stroke: '#94a3b8', strokeWidth: 1.75, pathType: 'straight',
          selectedStroke: '#2563eb', markerColor: '#94a3b8', selectedMarkerColor: '#2563eb',
          label: { color: '#475569', background: 'rgba(248, 250, 252, 0.92)', borderColor: '#e2e8f0', borderWidth: 1 },
        },
        selection: { color: '#2563eb', boxFill: 'rgba(37, 99, 235, 0.08)', boxStroke: '#2563eb' },
        port: { fill: '#94a3b8', hoverFill: '#2563eb' },
        font: { family: 'system-ui, -apple-system, "Segoe UI", sans-serif' },
        toolbar: {
          background: 'rgba(255, 255, 255, 0.97)',
          shadow: '0 1px 4px rgba(15, 23, 42, 0.08)',
          buttonBackground: '#ffffff',
          buttonBorderColor: '#e2e8f0',
          buttonTextColor: '#475569',
          buttonHoverBackground: '#f1f5f9',
          buttonHoverAccent: '#2563eb',
          buttonActiveBackground: '#2563eb',
          buttonActiveTextColor: '#ffffff',
          dividerColor: '#e2e8f0',
        },
      }
    },

    // ── Emerald ───────────────────────────────────────────────────────
    // Mint canvas, teal-green accents, dot grid, bezier curves, compact.
    compact: {
      nodeSize: { width: 140, height: 60 },
      gridSize: 16,
      icons: ICONS_EMERALD,
      theme: {
        shadows: false,
        canvas: { background: '#f0fdf4', gridType: 'dot', gridColor: '#bbf7d0' },
        node: {
          background: '#ffffff',
          borderColor: '#a7f3d0',
          borderRadius: 8,
          borderWidth: 1,
          selectedBorderColor: '#059669',
          shadowColor: 'rgba(5, 150, 105, 0.06)',
          labelColor: '#064e3b',
          typeStyles: {
            'start':    { background: '#ecfdf5', borderColor: '#6ee7b7', accentColor: '#16a34a', accentTextColor: '#ffffff' },
            'end':      { background: '#fff1f2', borderColor: '#fda4af', accentColor: '#e11d48', accentTextColor: '#ffffff' },
            'process':  { background: '#f0fdfa', borderColor: '#99f6e4', accentColor: '#0d9488', accentTextColor: '#ffffff' },
            'decision': { background: '#f0fdfa', borderColor: '#5eead4', accentColor: '#0d9488', accentTextColor: '#ffffff' },
            'database': { background: '#ecfeff', borderColor: '#a5f3fc', accentColor: '#0891b2', accentTextColor: '#ffffff' },
            'api':      { background: '#fffbeb', borderColor: '#fde68a', accentColor: '#d97706', accentTextColor: '#ffffff' },
            'approval': { background: '#ecfeff', borderColor: '#67e8f9', accentColor: '#0e7490', accentTextColor: '#ffffff' },
          },
        },
        edge: {
          stroke: '#86efac', strokeWidth: 1.5, pathType: 'bezier',
          selectedStroke: '#059669', markerColor: '#86efac', selectedMarkerColor: '#059669',
          label: { color: '#065f46', background: 'rgba(240, 253, 244, 0.92)', borderColor: '#a7f3d0', borderWidth: 1 },
        },
        selection: { color: '#059669', boxFill: 'rgba(5, 150, 105, 0.08)', boxStroke: '#059669' },
        port: { fill: '#6ee7b7', hoverFill: '#059669' },
        font: { family: '"Inter", "Helvetica Neue", Arial, sans-serif' },
        toolbar: {
          background: 'rgba(255, 255, 255, 0.96)',
          shadow: '0 1px 6px rgba(5, 150, 105, 0.08)',
          buttonBackground: '#ffffff',
          buttonBorderColor: '#d1fae5',
          buttonTextColor: '#065f46',
          buttonHoverBackground: '#ecfdf5',
          buttonHoverAccent: '#059669',
          buttonActiveBackground: '#059669',
          buttonActiveTextColor: '#ffffff',
          dividerColor: '#d1fae5',
        },
      }
    },

    // ── Blueprint ─────────────────────────────────────────────────────
    // Lavender canvas, deep indigo, line grid, step routing, larger nodes.
    detailed: {
      nodeSize: { width: 220, height: 100 },
      gridSize: 24,
      icons: ICONS_BLUEPRINT,
      theme: {
        shadows: true,
        canvas: { background: '#eef2ff', gridType: 'line', gridColor: '#c7d2fe' },
        node: {
          background: '#ffffff',
          borderColor: '#a5b4fc',
          borderWidth: 2,
          borderRadius: 4,
          selectedBorderColor: '#4338ca',
          selectedBorderWidth: 2.5,
          shadowColor: 'rgba(67, 56, 202, 0.10)',
          labelColor: '#312e81',
          labelFont: '"Merriweather Sans", "Georgia", system-ui, serif',
          typeStyles: {
            'start':    { background: '#f0fdf4', borderColor: '#86efac', accentColor: '#059669', accentTextColor: '#ffffff' },
            'end':      { background: '#fef2f2', borderColor: '#fca5a5', accentColor: '#dc2626', accentTextColor: '#ffffff' },
            'process':  { background: '#eef2ff', borderColor: '#a5b4fc', accentColor: '#4f46e5', accentTextColor: '#ffffff' },
            'decision': { background: '#faf5ff', borderColor: '#d8b4fe', accentColor: '#7c3aed', accentTextColor: '#ffffff' },
            'database': { background: '#eff6ff', borderColor: '#93c5fd', accentColor: '#2563eb', accentTextColor: '#ffffff' },
            'api':      { background: '#fdf4ff', borderColor: '#f0abfc', accentColor: '#c026d3', accentTextColor: '#ffffff' },
            'approval': { background: '#eef2ff', borderColor: '#c7d2fe', accentColor: '#4338ca', accentTextColor: '#ffffff' },
          },
        },
        edge: {
          stroke: '#818cf8', strokeWidth: 2, pathType: 'step',
          selectedStroke: '#4338ca', markerColor: '#818cf8', selectedMarkerColor: '#4338ca',
          label: { color: '#3730a3', background: 'rgba(238, 242, 255, 0.92)', borderColor: '#a5b4fc', borderWidth: 1 },
        },
        selection: { color: '#4338ca', boxFill: 'rgba(67, 56, 202, 0.08)', boxStroke: '#4338ca' },
        port: { fill: '#818cf8', hoverFill: '#4338ca' },
        font: { family: '"Merriweather Sans", "Georgia", system-ui, serif' },
        toolbar: {
          background: 'rgba(238, 242, 255, 0.96)',
          shadow: '0 2px 8px rgba(67, 56, 202, 0.10)',
          buttonBackground: '#ffffff',
          buttonBorderColor: '#c7d2fe',
          buttonTextColor: '#3730a3',
          buttonHoverBackground: '#e0e7ff',
          buttonHoverAccent: '#4338ca',
          buttonActiveBackground: '#4338ca',
          buttonActiveTextColor: '#ffffff',
          dividerColor: '#c7d2fe',
        },
      }
    },

    // ── Midnight ──────────────────────────────────────────────────────
    // Deep navy, cyan accent, dot grid, bezier curves, monospace font.
    minimal: {
      nodeSize: { width: 160, height: 70 },
      gridSize: 20,
      icons: ICONS_MIDNIGHT,
      theme: {
        shadows: false,
        canvas: { background: '#0f172a', gridType: 'dot', gridColor: '#1e293b' },
        node: {
          background: '#1e293b',
          borderColor: '#334155',
          borderWidth: 1,
          borderRadius: 6,
          selectedBorderColor: '#06b6d4',
          labelColor: '#e2e8f0',
          typeStyles: {
            'start':    { background: '#1a2e1e', borderColor: '#166534', accentColor: '#4ade80', accentTextColor: '#052e16' },
            'end':      { background: '#2e1a1e', borderColor: '#9f1239', accentColor: '#fb7185', accentTextColor: '#1c0412' },
            'process':  { background: '#172554', borderColor: '#1e40af', accentColor: '#38bdf8', accentTextColor: '#0c1a3d' },
            'decision': { background: '#2e1065', borderColor: '#5b21b6', accentColor: '#a78bfa', accentTextColor: '#1a0536' },
            'database': { background: '#164e63', borderColor: '#155e75', accentColor: '#22d3ee', accentTextColor: '#083344' },
            'api':      { background: '#422006', borderColor: '#92400e', accentColor: '#fbbf24', accentTextColor: '#1c0a00' },
            'approval': { background: '#134e4a', borderColor: '#115e59', accentColor: '#2dd4bf', accentTextColor: '#042f2e' },
          },
        },
        edge: {
          stroke: '#475569', strokeWidth: 1.5, pathType: 'bezier',
          selectedStroke: '#06b6d4', markerColor: '#475569', selectedMarkerColor: '#06b6d4',
          label: { color: '#94a3b8', background: 'rgba(30, 41, 59, 0.92)', borderColor: '#334155', borderWidth: 1 },
        },
        selection: { color: '#06b6d4', boxFill: 'rgba(6, 182, 212, 0.10)', boxStroke: '#06b6d4' },
        port: { fill: '#475569', hoverFill: '#06b6d4', stroke: '#0f172a' },
        font: { family: '"JetBrains Mono", "SF Mono", "Fira Code", Consolas, monospace' },
        toolbar: {
          background: 'rgba(30, 41, 59, 0.96)',
          shadow: '0 2px 10px rgba(0, 0, 0, 0.5)',
          buttonBackground: '#1e293b',
          buttonBorderColor: '#334155',
          buttonTextColor: '#94a3b8',
          buttonHoverBackground: '#334155',
          buttonHoverAccent: '#06b6d4',
          buttonActiveBackground: '#06b6d4',
          buttonActiveTextColor: '#0f172a',
          dividerColor: '#334155',
        },
      }
    }
  };

  currentTheme = signal<string>('minimal');

  // Base node types — icons are injected per-theme in editorConfig computed
  private readonly nodeTypes: Omit<NodeTypeDefinition, 'size' | 'iconSvg'>[] = [
    { type: 'process', label: 'Process', component: null as any, defaultData: { name: 'New Process' } },
    { type: 'decision', label: 'Decision', component: null as any, defaultData: { name: 'Decision' } },
    { type: 'start', label: 'Start', component: null as any, defaultData: { name: 'Start' } },
    { type: 'end', label: 'End', component: null as any, defaultData: { name: 'End' } },
    { type: 'database', label: 'Database', component: null as any, defaultData: { name: 'Database' } },
    { type: 'api', label: 'API', component: null as any, defaultData: { name: 'API Call' } },
    { type: 'approval', label: 'Approval', component: null as any, defaultData: { name: 'Review' } }
  ];

  // Computed config based on theme
  editorConfig = computed<GraphEditorConfig>(() => {
    const preset = this.themes[this.currentTheme()];
    const readonly = this.readonlyMode();
    return {
      nodes: {
        types: this.nodeTypes.map(t => ({ ...t, size: preset.nodeSize, iconSvg: preset.icons[t.type] })),
        defaultSize: preset.nodeSize,
        iconPosition: 'top-left'
      },
      edges: {
        component: null as any,
        style: { stroke: '#94a3b8', strokeWidth: 2, markerEnd: 'arrow' }
      },
      canvas: {
        grid: { enabled: true, size: preset.gridSize, snap: true },
        zoom: { enabled: true, min: 0.25, max: 2.0, step: 0.1, wheelEnabled: true },
        pan: { enabled: true }
      },
      palette: { enabled: !readonly, position: 'left' },
      toolbar: readonly ? { items: ['layout', 'fit'] } : undefined,
      theme: preset.theme,
      validation: { validators: DEMO_VALIDATION_RULES, validateOnChange: false }
    };
  });

  currentGraph = signal<Graph>({
    nodes: [
      { id: 'start', type: 'start', data: { name: 'Start' }, position: { x: 100, y: 100 } },
      { id: 'process1', type: 'process', data: { name: 'Fetch Data' }, position: { x: 300, y: 100 } },
      { id: 'db1', type: 'database', data: { name: 'Users DB' }, position: { x: 300, y: 250 } },
      { id: 'decision1', type: 'decision', data: { name: 'Valid?' }, position: { x: 500, y: 100 } },
      { id: 'api1', type: 'api', data: { name: 'Send Update' }, position: { x: 700, y: 50 } },
      { id: 'approval1', type: 'approval', data: { name: 'Review' }, position: { x: 700, y: 180 } },
      { id: 'end', type: 'end', data: { name: 'Complete' }, position: { x: 900, y: 100 } }
    ],
    edges: [
      { id: 'e1', source: 'start', target: 'process1' },
      { id: 'e2', source: 'process1', target: 'db1' },
      { id: 'e3', source: 'db1', target: 'decision1' },
      { id: 'e4', source: 'decision1', target: 'api1' },
      { id: 'e5', source: 'decision1', target: 'approval1' },
      { id: 'e6', source: 'api1', target: 'end' },
      { id: 'e7', source: 'approval1', target: 'end' }
    ]
  });

  private editor = viewChild.required<GraphEditorComponent>('editor');

  ngAfterViewInit(): void {
    // Auto-layout vertically and fit on initial load
    setTimeout(async () => {
      await this.editor().applyLayout('dagre-tb');
      this.editor().fitToScreen();
    });
  }

  showHelp = signal(false);
  readonlyMode = signal(false);
  contextMenu = signal<ContextMenuEvent | null>(null);
  validationResult = signal<ValidationResult | null>(null);
  editingNode = signal<import('@utisha/graph-editor').GraphNode | null>(null);
  showImport = signal(false);
  importError = signal<string | null>(null);

  onGraphChange(graph: Graph): void {
    this.currentGraph.set(graph);
  }

  onNodeClick(node: any): void {
    console.log('Node clicked:', node);
  }

  onEdgeClick(edge: any): void {
    console.log('Edge clicked:', edge);
  }

  onNodeDoubleClick(node: import('@utisha/graph-editor').GraphNode): void {
    if (this.readonlyMode()) return;
    this.editingNode.set(node);
    // Focus input after dialog renders
    setTimeout(() => {
      const input = document.querySelector('.edit-dialog input') as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
      }
    });
  }

  saveEdit(newName: string): void {
    const node = this.editingNode();
    if (!node || !newName.trim()) return;
    
    const graph = this.currentGraph();
    this.currentGraph.set({
      ...graph,
      nodes: graph.nodes.map(n => 
        n.id === node.id 
          ? { ...n, data: { ...n.data, name: newName.trim() } }
          : n
      )
    });
    this.editingNode.set(null);
  }

  cancelEdit(): void {
    this.editingNode.set(null);
  }

  onThemeChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.currentTheme.set(select.value);
    // Re-layout after theme change since node sizes differ per preset
    setTimeout(() => this.editor().applyLayout(), 50);
  }


  autoLayout(): void {
    this.editor().applyLayout();
  }

  fitToScreen(): void {
    this.editor().fitToScreen();
  }

  validate(): void {
    const result = this.editor().validate();
    this.validationResult.set(result);
  }

  clearValidation(): void {
    this.validationResult.set(null);
  }

  focusNode(nodeId: string): void {
    this.editor().selectNode(nodeId);
  }

  // Context menu handlers
  onContextMenu(event: ContextMenuEvent): void {
    if (this.readonlyMode()) return;
    this.contextMenu.set(event);
  }

  closeContextMenu(): void {
    this.contextMenu.set(null);
  }

  addNodeAtPosition(): void {
    const menu = this.contextMenu();
    if (!menu) return;
    const graph = this.currentGraph();
    const newNode = {
      id: `node_${Date.now()}`,
      type: 'process',
      data: { name: 'New Process' },
      position: menu.position
    };
    this.currentGraph.set({
      ...graph,
      nodes: [...graph.nodes, newNode]
    });
    this.closeContextMenu();
  }

  duplicateNode(): void {
    const menu = this.contextMenu();
    if (!menu?.nodeId) return;
    const graph = this.currentGraph();
    const node = graph.nodes.find(n => n.id === menu.nodeId);
    if (!node) return;
    const newNode = {
      ...node,
      id: `node_${Date.now()}`,
      position: { x: node.position.x + 40, y: node.position.y + 40 }
    };
    this.currentGraph.set({
      ...graph,
      nodes: [...graph.nodes, newNode]
    });
    this.closeContextMenu();
  }

  deleteNode(): void {
    const menu = this.contextMenu();
    if (!menu?.nodeId) return;
    const graph = this.currentGraph();
    this.currentGraph.set({
      nodes: graph.nodes.filter(n => n.id !== menu.nodeId),
      edges: graph.edges.filter(e => e.source !== menu.nodeId && e.target !== menu.nodeId)
    });
    this.closeContextMenu();
  }

  reverseEdge(): void {
    const menu = this.contextMenu();
    if (!menu?.edgeId) return;
    const graph = this.currentGraph();
    this.currentGraph.set({
      ...graph,
      edges: graph.edges.map(e => 
        e.id === menu.edgeId
          ? { ...e, source: e.target, target: e.source }
          : e
      )
    });
    this.closeContextMenu();
  }

  deleteEdge(): void {
    const menu = this.contextMenu();
    if (!menu?.edgeId) return;
    const graph = this.currentGraph();
    this.currentGraph.set({
      ...graph,
      edges: graph.edges.filter(e => e.id !== menu.edgeId)
    });
    this.closeContextMenu();
  }

  // Import/Export
  exportGraph(): void {
    const json = JSON.stringify(this.currentGraph(), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'graph.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  cancelImport(): void {
    this.showImport.set(false);
    this.importError.set(null);
  }

  doImport(jsonText: string): void {
    this.importError.set(null);
    try {
      const parsed = JSON.parse(jsonText);
      if (!parsed || typeof parsed !== 'object') {
        this.importError.set('Invalid JSON: must be an object');
        return;
      }
      if (!Array.isArray(parsed.nodes)) {
        this.importError.set('Invalid graph: missing "nodes" array');
        return;
      }
      if (!Array.isArray(parsed.edges)) {
        this.importError.set('Invalid graph: missing "edges" array');
        return;
      }
      // Basic validation of nodes
      for (const node of parsed.nodes) {
        if (!node.id || !node.type || !node.position) {
          this.importError.set(`Invalid node: missing id, type, or position`);
          return;
        }
      }
      // Basic validation of edges
      for (const edge of parsed.edges) {
        if (!edge.id || !edge.source || !edge.target) {
          this.importError.set(`Invalid edge: missing id, source, or target`);
          return;
        }
      }
      this.currentGraph.set(parsed as Graph);
      this.showImport.set(false);
    } catch (e) {
      this.importError.set(`Parse error: ${(e as Error).message}`);
    }
  }
}
