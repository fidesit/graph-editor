import { Component, signal, viewChild, computed } from '@angular/core';
import { JsonPipe } from '@angular/common';
import { GraphEditorComponent, Graph, GraphEditorConfig, NodeTypeDefinition, ContextMenuEvent, SvgIconDefinition, ValidationResult, ValidationRule, ValidationError, ThemeConfig } from '@utisha/graph-editor';

/**
 * Demo icons - simple geometric shapes for demonstration.
 * In production, consumers would provide their own branded icons.
 */
const DEMO_ICONS: Record<string, SvgIconDefinition> = {
  process: {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: '#6366f1',
    strokeWidth: 1.75,
    path: `M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z
           M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z`
  },
  decision: {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: '#8b5cf6',
    strokeWidth: 1.75,
    path: `M12 3L21 12L12 21L3 12L12 3Z
           M12 8v4
           M12 16h.01`
  },
  start: {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: '#22c55e',
    strokeWidth: 1.75,
    path: `M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10Z
           M10 8l6 4-6 4V8Z`
  },
  end: {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: '#ef4444',
    strokeWidth: 1.75,
    path: `M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10Z
           M8 8h8v8H8V8Z`
  },
  database: {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: '#0ea5e9',
    strokeWidth: 1.75,
    path: `M12 5c4.418 0 8 1.12 8 2.5v9c0 1.38-3.582 2.5-8 2.5s-8-1.12-8-2.5v-9C4 6.12 7.582 5 12 5Z
           M4 7.5c0 1.38 3.582 2.5 8 2.5s8-1.12 8-2.5
           M4 12c0 1.38 3.582 2.5 8 2.5s8-1.12 8-2.5`
  },
  api: {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: '#f59e0b',
    strokeWidth: 1.75,
    path: `M4 12h4l2-6 4 12 2-6h4
           M2 12h2
           M20 12h2`
  },
  approval: {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: '#14b8a6',
    strokeWidth: 1.75,
    path: `M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2
           M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z
           M16 11l2 2 4-4`
  }
};

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
              <option value="default">Default (Straight)</option>
              <option value="compact">Compact (Bezier + Dot Grid)</option>
              <option value="detailed">Detailed (Step + Type Styles)</option>
              <option value="minimal">Dark (Bezier + Dot Grid)</option>
            </select>
          </div>
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
          <button class="action-btn" (click)="showImport.set(true)" title="Import JSON">
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
          <button class="close-btn" (click)="showHelp.set(false)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
          <div class="help-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"/>
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
              <circle cx="12" cy="17" r="0.5" fill="currentColor"/>
            </svg>
          </div>
          <h2>Keyboard & Mouse</h2>
          <p class="help-subtitle">Quick reference for graph editor controls</p>
          <div class="help-grid">
            <div class="help-card">
              <div class="card-icon">🖱️</div>
              <h3>Canvas</h3>
              <ul>
                <li><kbd>Scroll</kbd> <span>Zoom in/out</span></li>
                <li><kbd>Drag</kbd> <span>Pan view</span></li>
                <li><kbd>Shift+Drag</kbd> <span>Box select</span></li>
              </ul>
            </div>
            <div class="help-card">
              <div class="card-icon">⬡</div>
              <h3>Nodes</h3>
              <ul>
                <li><kbd>Click</kbd> <span>Select</span></li>
                <li><kbd>Ctrl+Click</kbd> <span>Toggle select</span></li>
                <li><kbd>Double-click</kbd> <span>Edit name</span></li>
                <li><kbd>Drag</kbd> <span>Move (all if multi-selected)</span></li>
                <li><kbd>Drag corner</kbd> <span>Resize (Hand tool)</span></li>
                <li><kbd>Del</kbd> <span>Remove selected</span></li>
                <li><kbd>↑↓←→</kbd> <span>Nudge (Shift: 10px)</span></li>
              </ul>
            </div>
            <div class="help-card">
              <div class="card-icon">↗</div>
              <h3>Edges</h3>
              <ul>
                <li><kbd>Line tool</kbd> <span>Draw mode</span></li>
                <li><kbd>Click → Click</kbd> <span>Connect</span></li>
                <li><kbd>Click edge</kbd> <span>Direction</span></li>
                <li><kbd>Ctrl+Click</kbd> <span>Toggle select</span></li>
              </ul>
            </div>
            <div class="help-card">
              <div class="card-icon">⌨</div>
              <h3>General</h3>
              <ul>
                <li><kbd>Ctrl+Z</kbd> <span>Undo</span></li>
                <li><kbd>Ctrl+Y</kbd> <span>Redo</span></li>
                <li><kbd>Esc</kbd> <span>Cancel / Deselect</span></li>
              </ul>
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
      border-radius: 16px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      max-width: 520px;
      width: 90%;
      padding: 32px;
      text-align: center;
      animation: slideUp 0.2s ease-out;
    }

    .close-btn {
      position: absolute;
      top: 16px;
      right: 16px;
      background: #f3f4f6;
      border: none;
      border-radius: 8px;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: #6b7280;
      transition: all 0.15s;
    }

    .close-btn:hover {
      background: #e5e7eb;
      color: #111827;
    }

    .help-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 56px;
      background: linear-gradient(135deg, #3b82f6, #8b5cf6);
      border-radius: 14px;
      color: white;
      margin-bottom: 16px;
    }

    .help-popup h2 {
      font-size: 20px;
      font-weight: 700;
      color: #111827;
      margin: 0 0 4px;
    }

    .help-subtitle {
      font-size: 14px;
      color: #6b7280;
      margin: 0 0 24px;
    }

    .help-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      text-align: left;
    }

    .help-card {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 16px;
    }

    .card-icon {
      font-size: 20px;
      margin-bottom: 8px;
    }

    .help-card h3 {
      font-size: 13px;
      font-weight: 600;
      color: #374151;
      margin: 0 0 10px;
    }

    .help-card ul {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .help-card li {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: #4b5563;
      margin-bottom: 6px;
    }

    .help-card li:last-child {
      margin-bottom: 0;
    }

    .help-card li span {
      color: #6b7280;
    }

    kbd {
      background: white;
      border: 1px solid #d1d5db;
      border-radius: 4px;
      padding: 2px 6px;
      font-family: inherit;
      font-size: 11px;
      font-weight: 500;
      color: #374151;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
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
export class AppComponent {
  // Theme presets — each showcases different ThemeConfig capabilities
  private readonly themes: Record<string, { nodeSize: { width: number; height: number }; gridSize: number; theme: ThemeConfig }> = {
    default: {
      nodeSize: { width: 180, height: 80 },
      gridSize: 20,
      theme: {
        shadows: true,
        edge: { pathType: 'straight' },
      }
    },
    compact: {
      nodeSize: { width: 140, height: 60 },
      gridSize: 15,
      theme: {
        shadows: false,
        canvas: { background: '#f0f4f8', gridType: 'dot', gridColor: '#94a3b8' },
        node: {
          background: '#ffffff',
          borderColor: '#cbd5e1',
          borderRadius: 8,
          borderWidth: 1,
          selectedBorderColor: '#6366f1',
          labelColor: '#334155',
        },
        edge: { stroke: '#64748b', pathType: 'bezier', selectedStroke: '#6366f1', markerColor: '#64748b', selectedMarkerColor: '#6366f1' },
        selection: { color: '#6366f1' },
        toolbar: {
          buttonHoverAccent: '#6366f1',
          buttonActiveBackground: '#6366f1',
        },
        port: { fill: '#64748b', hoverFill: '#6366f1' },
      }
    },
    detailed: {
      nodeSize: { width: 220, height: 100 },
      gridSize: 25,
      theme: {
        shadows: true,
        canvas: { background: '#fafaf9', gridType: 'line', gridColor: '#e7e5e4' },
        node: {
          background: '#fffbeb',
          borderColor: '#fcd34d',
          borderWidth: 2,
          borderRadius: 16,
          selectedBorderColor: '#f59e0b',
          shadowColor: 'rgba(245, 158, 11, 0.12)',
          labelColor: '#78350f',
          typeStyles: {
            'start': { background: '#ecfdf5', borderColor: '#6ee7b7', accentColor: '#059669' },
            'end': { background: '#fef2f2', borderColor: '#fca5a5', accentColor: '#dc2626' },
            'decision': { background: '#f5f3ff', borderColor: '#c4b5fd', accentColor: '#7c3aed' },
            'database': { background: '#eff6ff', borderColor: '#93c5fd', accentColor: '#2563eb' },
          },
        },
        edge: { stroke: '#d97706', strokeWidth: 2.5, pathType: 'step', selectedStroke: '#f59e0b', markerColor: '#d97706', selectedMarkerColor: '#f59e0b' },
        selection: { color: '#f59e0b', boxFill: 'rgba(245, 158, 11, 0.1)', boxStroke: '#f59e0b' },
        font: { family: 'Georgia, "Times New Roman", serif' },
        toolbar: {
          background: 'rgba(255, 251, 235, 0.95)',
          buttonBorderColor: '#fcd34d',
          buttonTextColor: '#78350f',
          buttonHoverAccent: '#f59e0b',
          buttonActiveBackground: '#f59e0b',
          dividerColor: '#fcd34d',
        },
      }
    },
    minimal: {
      nodeSize: { width: 160, height: 70 },
      gridSize: 20,
      theme: {
        shadows: false,
        canvas: { background: '#18181b', gridType: 'dot', gridColor: '#3f3f46' },
        node: {
          background: '#27272a',
          borderColor: '#3f3f46',
          borderWidth: 1,
          borderRadius: 6,
          selectedBorderColor: '#22d3ee',
          labelColor: '#e4e4e7',
        },
        edge: { stroke: '#52525b', pathType: 'bezier', selectedStroke: '#22d3ee', markerColor: '#52525b', selectedMarkerColor: '#22d3ee' },
        selection: { color: '#22d3ee', boxFill: 'rgba(34, 211, 238, 0.1)', boxStroke: '#22d3ee' },
        port: { fill: '#52525b', hoverFill: '#22d3ee', stroke: '#18181b' },
        font: { family: '"SF Mono", Monaco, Consolas, monospace' },
        toolbar: {
          background: 'rgba(39, 39, 42, 0.95)',
          shadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
          buttonBackground: '#3f3f46',
          buttonBorderColor: '#52525b',
          buttonTextColor: '#a1a1aa',
          buttonHoverBackground: '#52525b',
          buttonHoverAccent: '#22d3ee',
          buttonActiveBackground: '#22d3ee',
          buttonActiveTextColor: '#18181b',
          dividerColor: '#52525b',
        },
      }
    }
  };

  currentTheme = signal<string>('default');

  // Base node types with demo icons
  // Consumers would provide their own branded icons matching their design system
  private readonly nodeTypes: Omit<NodeTypeDefinition, 'size'>[] = [
    { type: 'process', label: 'Process', iconSvg: DEMO_ICONS['process'], component: null as any, defaultData: { name: 'New Process' } },
    { type: 'decision', label: 'Decision', iconSvg: DEMO_ICONS['decision'], component: null as any, defaultData: { name: 'Decision' } },
    { type: 'start', label: 'Start', iconSvg: DEMO_ICONS['start'], component: null as any, defaultData: { name: 'Start' } },
    { type: 'end', label: 'End', iconSvg: DEMO_ICONS['end'], component: null as any, defaultData: { name: 'End' } },
    { type: 'database', label: 'Database', iconSvg: DEMO_ICONS['database'], component: null as any, defaultData: { name: 'Database' } },
    { type: 'api', label: 'API', iconSvg: DEMO_ICONS['api'], component: null as any, defaultData: { name: 'API Call' } },
    { type: 'approval', label: 'Approval', iconSvg: DEMO_ICONS['approval'], component: null as any, defaultData: { name: 'Review' } }
  ];

  // Computed config based on theme
  editorConfig = computed<GraphEditorConfig>(() => {
    const preset = this.themes[this.currentTheme()];
    return {
      nodes: {
        types: this.nodeTypes.map(t => ({ ...t, size: preset.nodeSize })),
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
      palette: { enabled: true, position: 'left' },
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
  showHelp = signal(false);
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
