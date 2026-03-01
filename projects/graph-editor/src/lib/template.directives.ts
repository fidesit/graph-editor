import {Directive, TemplateRef, inject} from '@angular/core';
import {GraphNode, GraphEdge} from './graph.model';
import {NodeTypeDefinition} from './graph-editor.config';

// ============================================================
// Template context interfaces
// ============================================================

/**
 * Context provided to node templates (both HTML and SVG).
 *
 * Usage:
 * ```html
 * <ng-template geNodeHtml let-ctx>
 *   <div>{{ ctx.node.data.name }}</div>
 * </ng-template>
 * ```
 */
export interface NodeTemplateContext {
  $implicit: {
    /** The raw node data */
    node: GraphNode;
    /** The node type definition from config */
    type: NodeTypeDefinition;
    /** Whether this node is currently selected */
    selected: boolean;
    /** Current node width (respects resize) */
    width: number;
    /** Current node height (respects resize) */
    height: number;
  };
}

/**
 * Context provided to edge templates.
 *
 * Usage:
 * ```html
 * <ng-template geEdge let-ctx>
 *   <svg:path [attr.d]="ctx.path" stroke="red" />
 * </ng-template>
 * ```
 */
export interface EdgeTemplateContext {
  $implicit: {
    /** The raw edge data */
    edge: GraphEdge;
    /** Computed SVG path string */
    path: string;
    /** Whether this edge is currently selected */
    selected: boolean;
  };
}

// ============================================================
// Template directives
// ============================================================

/**
 * Marks an `<ng-template>` as a custom HTML node renderer.
 * Content is rendered inside an `<svg:foreignObject>` — write standard HTML/CSS.
 *
 * @example
 * ```html
 * <graph-editor [config]="config" [graph]="graph">
 *   <ng-template geNodeHtml let-ctx>
 *     <div class="my-node" [class.selected]="ctx.selected">
 *       <div class="header">{{ ctx.type.label }}</div>
 *       <div class="body">{{ ctx.node.data.name }}</div>
 *     </div>
 *   </ng-template>
 * </graph-editor>
 * ```
 */
@Directive({
  standalone: true,
  selector: 'ng-template[geNodeHtml]',
})
export class NodeHtmlTemplateDirective {
  public templateRef = inject<TemplateRef<NodeTemplateContext>>(TemplateRef);

  static ngTemplateContextGuard(
    _dir: NodeHtmlTemplateDirective,
    _ctx: unknown
  ): _ctx is NodeTemplateContext {
    return true;
  }
}

/**
 * Marks an `<ng-template>` as a custom SVG node renderer.
 * Content is rendered inside an `<svg:g>` — use `svg:` prefixed elements.
 *
 * @example
 * ```html
 * <graph-editor [config]="config" [graph]="graph">
 *   <ng-template geNodeSvg let-ctx>
 *     <svg:rect [attr.width]="ctx.width" [attr.height]="ctx.height"
 *               rx="8" fill="white" stroke="#ccc" />
 *     <svg:text x="10" y="24">{{ ctx.node.data.name }}</svg:text>
 *   </ng-template>
 * </graph-editor>
 * ```
 *
 * **Important:** All SVG elements inside the template MUST use the `svg:` prefix
 * (e.g. `<svg:rect>`, `<svg:text>`, `<svg:g>`).
 */
@Directive({
  standalone: true,
  selector: 'ng-template[geNodeSvg]',
})
export class NodeSvgTemplateDirective {
  public templateRef = inject<TemplateRef<NodeTemplateContext>>(TemplateRef);

  static ngTemplateContextGuard(
    _dir: NodeSvgTemplateDirective,
    _ctx: unknown
  ): _ctx is NodeTemplateContext {
    return true;
  }
}

/**
 * Marks an `<ng-template>` as a custom edge renderer.
 * Content is rendered inside an `<svg:g>` — use `svg:` prefixed elements.
 * The library still handles the invisible hit-area and endpoint circles.
 *
 * @example
 * ```html
 * <graph-editor [config]="config" [graph]="graph">
 *   <ng-template geEdge let-ctx>
 *     <svg:path [attr.d]="ctx.path"
 *               [attr.stroke]="ctx.selected ? 'blue' : 'gray'"
 *               stroke-width="2" fill="none" />
 *   </ng-template>
 * </graph-editor>
 * ```
 */
@Directive({
  standalone: true,
  selector: 'ng-template[geEdge]',
})
export class EdgeTemplateDirective {
  public templateRef = inject<TemplateRef<EdgeTemplateContext>>(TemplateRef);

  static ngTemplateContextGuard(
    _dir: EdgeTemplateDirective,
    _ctx: unknown
  ): _ctx is EdgeTemplateContext {
    return true;
  }
}
