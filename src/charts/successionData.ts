/**
 * successionData.ts — pure data builder for SuccessionSankey (extracted).
 *
 * Resolves a ruler's succession chain (who they succeeded via ruler.succeeds,
 * and who succeeded them) into nodes + links for the three-column Sankey.
 * Split out of SuccessionSankey.tsx so that component module exports only the
 * React component (Fast Refresh requires component-only modules), and so this
 * pure builder is independently testable.
 */
import { loadRecords } from '@/data/loaders';
import type { RawRecord } from '@/data/loaders';

/** A resolved node in the succession flow. */
export interface SuccessionNode {
  /** Ruler record id. */
  id: string;
  /** Display name. */
  label: string;
  /** "pred" | "self" | "succ" */
  side: 'pred' | 'self' | 'succ';
}

/** A flow link between two nodes. */
export interface SuccessionLink {
  from: string;
  to: string;
}

/** Full succession data for rendering. */
export interface SuccessionData {
  nodes: SuccessionNode[];
  links: SuccessionLink[];
}

// ── Data builder (pure, testable) ─────────────────────────────────────────────

function rulerName(rec: RawRecord): string {
  return typeof rec.name === 'string' && rec.name.length > 0 ? rec.name : rec.id;
}

/**
 * Build succession nodes and links for the given ruler id.
 *
 * Predecessors: the ruler record whose .succeeds field equals rulerId.
 * The central ruler: the record itself.
 * Successors: ruler records whose .succeeds field equals rulerId.
 *
 * Returns null when there is no succession data (honest empty state).
 */
export function buildSuccessionData(rulerId: string): SuccessionData | null {
  const rulers = loadRecords('ruler');

  // Find the central ruler record.
  const self = rulers.find((r) => r.id === rulerId);
  if (!self) return null;

  const selfLabel = rulerName(self);

  // Predecessor: the ruler this ruler succeeded.
  const predecessors: SuccessionNode[] = [];
  const predId = typeof self.succeeds === 'string' ? self.succeeds : null;
  if (predId) {
    const predRec = rulers.find((r) => r.id === predId);
    const predLabel = predRec ? rulerName(predRec) : predId;
    predecessors.push({ id: predId, label: predLabel, side: 'pred' });
  }

  // Successors: all rulers whose .succeeds points to this ruler.
  const successors: SuccessionNode[] = rulers
    .filter((r) => r.id !== rulerId && r.succeeds === rulerId)
    .map((r) => ({ id: r.id, label: rulerName(r), side: 'succ' as const }));

  if (predecessors.length === 0 && successors.length === 0) return null;

  const selfNode: SuccessionNode = { id: rulerId, label: selfLabel, side: 'self' };

  const nodes: SuccessionNode[] = [...predecessors, selfNode, ...successors];

  const links: SuccessionLink[] = [
    ...predecessors.map((p) => ({ from: p.id, to: rulerId })),
    ...successors.map((s)  => ({ from: rulerId, to: s.id })),
  ];

  return { nodes, links };
}

