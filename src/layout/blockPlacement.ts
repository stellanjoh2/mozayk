import type { MosaicBlock } from "../types";

function canPlace(
  occupied: boolean[][],
  row: number,
  col: number,
  width: number,
  height: number,
  rows: number,
  columns: number,
): boolean {
  if (col + width > columns || row + height > rows) return false;
  for (let r = row; r < row + height; r++) {
    for (let c = col; c < col + width; c++) {
      if (occupied[r][c]) return false;
    }
  }
  return true;
}

export function buildOccupiedGrid(
  blocks: MosaicBlock[],
  columns: number,
  rows: number,
  excludeIndex?: number,
): boolean[][] {
  const occupied = Array.from({ length: rows }, () =>
    Array<boolean>(columns).fill(false),
  );
  blocks.forEach((block, index) => {
    if (index === excludeIndex || !block.color) return;
    for (let r = block.row; r < block.row + block.height; r++) {
      for (let c = block.col; c < block.col + block.width; c++) {
        if (r >= 0 && r < rows && c >= 0 && c < columns) {
          occupied[r][c] = true;
        }
      }
    }
  });
  return occupied;
}

export function hitTestBlock(
  blocks: MosaicBlock[],
  col: number,
  row: number,
): number | null {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    if (!block.color) continue;
    if (
      col >= block.col &&
      col < block.col + block.width &&
      row >= block.row &&
      row < block.row + block.height
    ) {
      return i;
    }
  }
  return null;
}

export type GridSlot = { col: number; row: number };

export function findDropTargets(
  blocks: MosaicBlock[],
  blockIndex: number,
  columns: number,
  rows: number,
): GridSlot[] {
  const block = blocks[blockIndex];
  if (!block) return [];

  const { width, height } = block;
  const occupied = buildOccupiedGrid(blocks, columns, rows, blockIndex);
  const targets: GridSlot[] = [];

  for (let row = 0; row <= rows - height; row++) {
    for (let col = 0; col <= columns - width; col++) {
      if (block.col === col && block.row === row) continue;
      if (canPlace(occupied, row, col, width, height, rows, columns)) {
        targets.push({ col, row });
      }
    }
  }

  return targets;
}

export function canMoveBlock(
  blocks: MosaicBlock[],
  blockIndex: number,
  toCol: number,
  toRow: number,
  columns: number,
  rows: number,
): boolean {
  const block = blocks[blockIndex];
  if (!block) return false;
  if (block.col === toCol && block.row === toRow) return false;

  const occupied = buildOccupiedGrid(blocks, columns, rows, blockIndex);
  return canPlace(
    occupied,
    toRow,
    toCol,
    block.width,
    block.height,
    rows,
    columns,
  );
}

export function moveBlock(
  blocks: MosaicBlock[],
  blockIndex: number,
  toCol: number,
  toRow: number,
): MosaicBlock[] {
  return blocks.map((block, index) =>
    index === blockIndex ? { ...block, col: toCol, row: toRow } : block,
  );
}

export function slotMatchesTarget(
  slot: GridSlot,
  col: number,
  row: number,
  width: number,
  height: number,
): boolean {
  return (
    col >= slot.col &&
    col < slot.col + width &&
    row >= slot.row &&
    row < slot.row + height
  );
}

export type GridCorner = { col: number; row: number };

type GridEdge = {
  from: GridCorner;
  to: GridCorner;
};

function cellKey(col: number, row: number): string {
  return `${col},${row}`;
}

function edgeId(edge: GridEdge): string {
  return `${edge.from.col},${edge.from.row}-${edge.to.col},${edge.to.row}`;
}

export function getDropTargetCellSet(
  dropTargets: GridSlot[],
  blockSize: { width: number; height: number },
): Set<string> {
  const cells = new Set<string>();
  for (const slot of dropTargets) {
    for (let row = slot.row; row < slot.row + blockSize.height; row++) {
      for (let col = slot.col; col < slot.col + blockSize.width; col++) {
        cells.add(cellKey(col, row));
      }
    }
  }
  return cells;
}

export function buildDropZoneBoundaryEdges(cells: Set<string>): GridEdge[] {
  const edges: GridEdge[] = [];
  for (const key of cells) {
    const [col, row] = key.split(",").map(Number);
    if (!cells.has(cellKey(col, row - 1))) {
      edges.push({ from: { col, row }, to: { col: col + 1, row } });
    }
    if (!cells.has(cellKey(col + 1, row))) {
      edges.push({
        from: { col: col + 1, row },
        to: { col: col + 1, row: row + 1 },
      });
    }
    if (!cells.has(cellKey(col, row + 1))) {
      edges.push({
        from: { col: col + 1, row: row + 1 },
        to: { col, row: row + 1 },
      });
    }
    if (!cells.has(cellKey(col - 1, row))) {
      edges.push({ from: { col, row: row + 1 }, to: { col, row } });
    }
  }
  return edges;
}

export function chainDropZoneBoundaryLoops(edges: GridEdge[]): GridCorner[][] {
  const outgoing = new Map<string, GridEdge[]>();
  for (const edge of edges) {
    const key = cellKey(edge.from.col, edge.from.row);
    if (!outgoing.has(key)) outgoing.set(key, []);
    outgoing.get(key)!.push(edge);
  }

  const used = new Set<string>();
  const loops: GridCorner[][] = [];

  for (const start of edges) {
    if (used.has(edgeId(start))) continue;

    const loop: GridCorner[] = [start.from];
    let edge: GridEdge | undefined = start;

    while (edge) {
      loop.push(edge.to);
      used.add(edgeId(edge));

      if (edge.to.col === start.from.col && edge.to.row === start.from.row) {
        break;
      }

      const nextKey = cellKey(edge.to.col, edge.to.row);
      edge = outgoing.get(nextKey)?.find((candidate) => !used.has(edgeId(candidate)));
    }

    if (loop.length >= 4) loops.push(loop);
  }

  return loops;
}

export function buildDropZoneLoops(
  dropTargets: GridSlot[],
  blockSize: { width: number; height: number },
): GridCorner[][] {
  if (dropTargets.length === 0) return [];
  const cells = getDropTargetCellSet(dropTargets, blockSize);
  const edges = buildDropZoneBoundaryEdges(cells);
  return chainDropZoneBoundaryLoops(edges);
}
