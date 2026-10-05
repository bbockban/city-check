import type { SpatialTreeItem } from '@thatopen/fragments';

/** IFC Name / long name when the fragment tree exposes it (often absent). */
const spatialTreeName = (node: SpatialTreeItem) => {
  const n = node as SpatialTreeItem & { longName?: unknown; name?: unknown };
  const pick = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

  return pick(n.name) || pick(n.longName);
};

/**
 * Node objects (by reference, not localId — some aggregate nodes have
 * localId === null) to keep visible while pruning: a match's entire
 * subtree (every descendant, not just descendants that also match on
 * their own text — a matched element's other clickable children must
 * stay reachable), plus the ancestor chain leading down to any match.
 * Used to force-open branches and, while a search is active, to prune
 * non-matching nodes.
 */
export const collectNodesToReveal = (
  tree: SpatialTreeItem,
  matches: (node: SpatialTreeItem) => boolean,
): Set<SpatialTreeItem> => {
  const nodesToReveal = new Set<SpatialTreeItem>();

  const revealSubtree = (node: SpatialTreeItem) => {
    nodesToReveal.add(node);

    for (const child of node.children ?? []) revealSubtree(child);
  };

  const visit = (node: SpatialTreeItem): boolean => {
    if (matches(node)) {
      revealSubtree(node);

      return true;
    }

    let childMatched = false;

    for (const child of node.children ?? []) {
      if (visit(child)) childMatched = true;
    }

    if (childMatched) nodesToReveal.add(node);

    return childMatched;
  };

  visit(tree);

  return nodesToReveal;
};

/**
 * Single line for the tree: optional instance name + IFC type + localId.
 * Many nodes have no `name` in the spatial tree (aggregates, or export without IfcRoot attributes).
 */
export const spatialTreeRowLabel = (node: SpatialTreeItem) => {
  const typePart = ifcCategoryLabel(node.category);
  const namePart = spatialTreeName(node);
  const idPart = node.localId != null ? ` #${node.localId}` : '';

  if (namePart) {
    return `${namePart} · ${typePart}${idPart}`;
  }

  return `${typePart}${idPart}`;
};

/** A node's own localId plus every descendant's localId (skipping nulls), for recursive show/hide. */
export const collectSubtreeLocalIds = (node: SpatialTreeItem): number[] => {
  const ids: number[] = [];

  const visit = (n: SpatialTreeItem) => {
    if (n.localId != null) ids.push(n.localId);

    for (const child of n.children ?? []) visit(child);
  };

  visit(node);

  return ids;
};

export const ifcCategoryLabel = (category: string | null) => {
  if (!category) return '—';

  const u = category.toUpperCase();

  if (!u.startsWith('IFC')) return category;

  const rest = u.slice(3);

  return `Ifc${rest.charAt(0)}${rest.slice(1).toLowerCase()}`;
};
