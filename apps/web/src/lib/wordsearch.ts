export interface WordsearchConfig {
  seed: number;
  words: string[];
}

export interface WordsearchPuzzle {
  grid: string[][];
  placements: { word: string; cells: number[] }[];
}

interface PlacementCandidate {
  row: number;
  column: number;
  rowStep: number;
  columnStep: number;
}

const DEFAULT_WORDS = ["CHIMNEY", "EMBER", "MITTENS", "LANTERN", "SOLSTICE", "EVERGREEN", "CINNAMON", "SNOWFALL", "CANDLE", "NIGHTSKY"];
const DIRECTIONS = [
  { row: -1, column: -1 }, { row: -1, column: 0 }, { row: -1, column: 1 },
  { row: 0, column: -1 }, { row: 0, column: 1 },
  { row: 1, column: -1 }, { row: 1, column: 0 }, { row: 1, column: 1 },
] as const;

export function parseWordsearch(payload: unknown): WordsearchConfig | null {
  if (!isRecord(payload) || payload.kind !== "wordsearch") return null;
  const seed = payload.seed === undefined ? 2026 : payload.seed;
  const words = payload.words === undefined ? DEFAULT_WORDS : payload.words;
  if (typeof seed !== "number" || !Number.isSafeInteger(seed)) return null;
  if (!isWordList(words)) return null;
  return { seed, words: [...words] };
}

function isWordList(value: unknown): value is string[] {
  if (!Array.isArray(value)) return false;
  if (value.length === 0) return false;
  if (value.length > 16) return false;
  if (!value.every(isWord)) return false;
  return new Set(value).size === value.length;
}

function isWord(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return /^[A-Z]{4,12}$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function randomFor(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

/** Place words longest first, trying seeded random starts and each of eight straight-line directions. */
export function generateWordsearch({ seed, words }: WordsearchConfig, size = 15): WordsearchPuzzle {
  const random = randomFor(seed);
  const grid: (string | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));
  const placements: WordsearchPuzzle["placements"] = [];
  const ordered = [...words].sort((a, b) => b.length - a.length || a.localeCompare(b));
  if (!placeWords(ordered, 0, grid, placements, size, random)) throw new Error("Unable to place every word");

  const filledGrid = grid.map((row) => row.map((cell) => cell ?? randomLetter(random)));
  return { grid: filledGrid, placements };
}

function randomLetter(random: () => number): string {
  return String.fromCharCode(65 + Math.floor(random() * 26));
}

function placeWords(words: string[], wordIndex: number, grid: (string | null)[][], placements: WordsearchPuzzle["placements"], size: number, random: () => number): boolean {
  if (wordIndex >= words.length) return true;
  const word = words[wordIndex];
  if (!word) return true;
  for (const candidate of getCandidates(word, size, random)) {
    if (!canPlace(grid, word, candidate.row, candidate.column, candidate.rowStep, candidate.columnStep)) continue;
    const { cells, added } = writeWord(grid, word, candidate, size);
    placements.push({ word, cells });
    if (placeWords(words, wordIndex + 1, grid, placements, size, random)) return true;
    placements.pop();
    for (const cell of added) grid[Math.floor(cell / size)]![cell % size] = null;
  }
  return false;
}

function getCandidates(word: string, size: number, random: () => number): PlacementCandidate[] {
  const candidates: PlacementCandidate[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      for (const direction of DIRECTIONS) {
        if (isInBounds(row, column, direction.row, direction.column, word.length, size)) {
          candidates.push({ row, column, rowStep: direction.row, columnStep: direction.column });
        }
      }
    }
  }
  return shuffled(candidates, random);
}

function isInBounds(row: number, column: number, rowStep: number, columnStep: number, wordLength: number, size: number): boolean {
  const endRow = row + rowStep * (wordLength - 1);
  const endColumn = column + columnStep * (wordLength - 1);
  return endRow >= 0 && endRow < size && endColumn >= 0 && endColumn < size;
}

function writeWord(grid: (string | null)[][], word: string, candidate: PlacementCandidate, size: number): { cells: number[]; added: number[] } {
  const added: number[] = [];
  const cells = word.split("").map((letter, index) => {
    const row = candidate.row + candidate.rowStep * index;
    const column = candidate.column + candidate.columnStep * index;
    if (grid[row]?.[column] === null) added.push(row * size + column);
    grid[row]![column] = letter;
    return row * size + column;
  });
  return { cells, added };
}

function shuffled<T>(values: T[], random: () => number): T[] {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [values[index], values[swap]] = [values[swap]!, values[index]!];
  }
  return values;
}

function canPlace(grid: (string | null)[][], word: string, row: number, column: number, rowStep: number, columnStep: number): boolean {
  const endRow = row + rowStep * (word.length - 1);
  const endColumn = column + columnStep * (word.length - 1);
  if (endRow < 0 || endRow >= grid.length || endColumn < 0 || endColumn >= grid.length) return false;
  return word.split("").every((letter, index) => {
    const cell = grid[row + rowStep * index]?.[column + columnStep * index];
    return cell === null || cell === letter;
  });
}

export function wordAtSelection(start: number, end: number, size: number): number[] | null {
  const startRow = Math.floor(start / size);
  const startColumn = start % size;
  const endRow = Math.floor(end / size);
  const endColumn = end % size;
  const rowDistance = endRow - startRow;
  const columnDistance = endColumn - startColumn;
  const length = Math.max(Math.abs(rowDistance), Math.abs(columnDistance));
  if (!isStraightSelection(rowDistance, columnDistance, length)) return null;
  const rowStep = Math.sign(rowDistance);
  const columnStep = Math.sign(columnDistance);
  return Array.from({ length: length + 1 }, (_, index) => (startRow + rowStep * index) * size + startColumn + columnStep * index);
}

function isStraightSelection(rowDistance: number, columnDistance: number, length: number): boolean {
  if (length === 0) return false;
  if (rowDistance === 0) return true;
  if (columnDistance === 0) return true;
  return Math.abs(rowDistance) === Math.abs(columnDistance);
}
