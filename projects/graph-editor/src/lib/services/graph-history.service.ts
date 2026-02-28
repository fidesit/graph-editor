import { Injectable, signal } from '@angular/core';
import { Graph } from '../graph.model';

/**
 * Service for managing undo/redo history of graph state.
 * 
 * Uses a simple snapshot-based approach where each history entry
 * is a deep copy of the entire graph state.
 */
@Injectable()
export class GraphHistoryService {
  private history: Graph[] = [];
  private historyIndex = -1;
  private maxHistorySize = 100;
  
  /** Signal to track if an undo/redo operation is in progress */
  readonly isUndoRedo = signal(false);

  /**
   * Initialize history with the given graph state.
   * Clears any existing history.
   */
  init(graph: Graph): void {
    this.history = [structuredClone(graph)];
    this.historyIndex = 0;
  }

  /**
   * Push a new state to the history stack.
   * If we're not at the end of history, truncates future states.
   * Prevents duplicate consecutive states.
   * 
   * @returns true if state was pushed, false if it was a duplicate
   */
  push(graph: Graph): boolean {
    const currentState = structuredClone(graph);
    
    // Don't push if state hasn't changed
    if (this.historyIndex >= 0 && this.historyIndex < this.history.length) {
      const lastState = this.history[this.historyIndex];
      if (JSON.stringify(lastState) === JSON.stringify(currentState)) {
        return false;
      }
    }
    
    // If we're not at the end of history, truncate future states
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }
    
    // Add new state
    this.history.push(currentState);
    this.historyIndex = this.history.length - 1;
    
    // Enforce max history size
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
      this.historyIndex--;
    }
    
    return true;
  }

  /**
   * Undo the last action.
   * @returns The previous graph state, or null if nothing to undo
   */
  undo(): Graph | null {
    if (this.historyIndex <= 0) {
      return null;
    }
    
    this.historyIndex--;
    this.isUndoRedo.set(true);
    const state = structuredClone(this.history[this.historyIndex]);
    // Note: caller should set isUndoRedo back to false after applying state
    return state;
  }

  /**
   * Redo the last undone action.
   * @returns The next graph state, or null if nothing to redo
   */
  redo(): Graph | null {
    if (this.historyIndex >= this.history.length - 1) {
      return null;
    }
    
    this.historyIndex++;
    this.isUndoRedo.set(true);
    const state = structuredClone(this.history[this.historyIndex]);
    // Note: caller should set isUndoRedo back to false after applying state
    return state;
  }

  /**
   * Complete an undo/redo operation.
   * Call this after applying the state returned by undo() or redo().
   */
  completeUndoRedo(): void {
    this.isUndoRedo.set(false);
  }

  /** Check if undo is available */
  canUndo(): boolean {
    return this.historyIndex > 0;
  }

  /** Check if redo is available */
  canRedo(): boolean {
    return this.historyIndex < this.history.length - 1;
  }

  /** Clear history and reset to given state */
  clear(graph: Graph): void {
    this.init(graph);
  }

  /** Get current history size */
  get size(): number {
    return this.history.length;
  }

  /** Get current position in history (0-indexed) */
  get position(): number {
    return this.historyIndex;
  }

  /** Set maximum history size */
  setMaxSize(size: number): void {
    this.maxHistorySize = size;
    // Trim history if necessary
    while (this.history.length > this.maxHistorySize) {
      this.history.shift();
      this.historyIndex--;
    }
  }
}
