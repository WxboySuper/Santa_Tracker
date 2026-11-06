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

interface PlacementBounds {
  row: number;
  column: number;
  rowStep: number;
  columnStep: number;
  wordLength: number;
  size: number;
}

interface PlacementSearch {
  words: string[];
  wordIndex: number;
  grid: (string | null)[][];
  placements: WordsearchPuzzle["placements"];
  size: number;
  random: () => number;
}

interface PlacementCheck {
  grid: (string | null)[][];
  word: string;
  candidate: PlacementCandidate;
  size: number;
}

interface CandidateOptions {
  word: string;
  size: number;
  random: () => number;
}

type WritePlacement = PlacementCheck;

interface ValueContext {
  value: unknown;
}

interface SeedContext {
  seed: number;
}

interface RandomContext {
  random: () => number;
}

interface WordSelection {
  startCell: number;
  endCell: number;
  gridSize: number;
}

interface SelectionVector {
  rowDistance: number;
  columnDistance: number;
  length: number;
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
  const parsedWords = isWordList({ value: words });
  if (parsedWords === null) return null;
  return { seed, words: parsedWords };
}

function isWordList({ value }: ValueContext): string[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length === 0) return null;
  if (value.length > 16) return null;
  const words: string[] = [];
  for (const candidate of value) {
    const candidateContext = { value: candidate };
    if (!isWord(candidateContext)) return null;
    words.push(candidateContext.value);
  }
  if (new Set(words).size !== words.length) return null;
  return words;
}

function isWord(context: ValueContext): context is ValueContext & { value: string } {
  const { value } = context;
  if (typeof value !== "string") return false;
  return /^[A-Z]{4,12}$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function randomFor({ seed }: SeedContext): () => number {
  let state = seed | 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

/** Place longest words first, using seeded candidate order and backtracking when a later word cannot fit. */
export function generateWordsearch({ seed, words }: WordsearchConfig): WordsearchPuzzle {
  const size = 15;
  const random = randomFor({ seed });
  const grid: (string | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));
  const placements: WordsearchPuzzle["placements"] = [];
  const ordered = [...words].sort((a, b) => b.length - a.length || a.localeCompare(b));
  const search = { words: ordered, wordIndex: 0, grid, placements, size, random };
  if (!placeWords(search)) throw new Error("Unable to place every word");

  const filledGrid = grid.map((row) => row.map((cell) => cell ?? randomLetter({ random })));
  return { grid: filledGrid, placements };
}

function randomLetter({ random }: RandomContext): string {
  return String.fromCharCode(65 + Math.floor(random() * 26));
}

function placeWords(search: PlacementSearch): boolean {
  const { words, wordIndex, grid, placements, size, random } = search;
  if (wordIndex >= words.length) return true;
  const word = words[wordIndex];
  if (!word) return true;
  for (const candidate of getCandidates({ word, size, random })) {
    if (!canPlace({ grid, word, candidate, size })) continue;
    const { cells, added } = writeWord({ grid, word, candidate, size });
    placements.push({ word, cells });
    if (placeWords({ ...search, wordIndex: wordIndex + 1 })) return true;
    placements.pop();
    for (const cell of added) grid[Math.floor(cell / size)]![cell % size] = null;
  }
  return false;
}

function getCandidates({ word, size, random }: CandidateOptions): PlacementCandidate[] {
  const candidates: PlacementCandidate[] = [];
  for (let row = 0; row < size; row += 1) {
    appendCandidates({ row, word, size, candidates });
  }
  return shuffled({ values: candidates, random });
}

function appendCandidates({ row, word, size, candidates }: { row: number; word: string; size: number; candidates: PlacementCandidate[] }): void {
  for (let column = 0; column < size; column += 1) {
    for (const direction of DIRECTIONS) {
      const bounds = { row, column, rowStep: direction.row, columnStep: direction.column, wordLength: word.length, size };
      if (isInBounds(bounds)) candidates.push({ row, column, rowStep: direction.row, columnStep: direction.column });
    }
  }
}

function isInBounds({ row, column, rowStep, columnStep, wordLength, size }: PlacementBounds): boolean {
  const endRow = row + rowStep * (wordLength - 1);
  const endColumn = column + columnStep * (wordLength - 1);
  if (endRow < 0 || endRow >= size) return false;
  if (endColumn < 0 || endColumn >= size) return false;
  return true;
}

function writeWord({ grid, word, candidate, size }: WritePlacement): { cells: number[]; added: number[] } {
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

function shuffled<T>({ values, random }: { values: T[]; random: () => number }): T[] {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [values[index], values[swap]] = [values[swap]!, values[index]!];
  }
  return values;
}

function canPlace({ grid, word, candidate, size }: PlacementCheck): boolean {
  const { row, column, rowStep, columnStep } = candidate;
  if (!isInBounds({ row, column, rowStep, columnStep, wordLength: word.length, size })) return false;
  return word.split("").every((letter, index) => {
    const cell = grid[row + rowStep * index]?.[column + columnStep * index];
    return cell === null || cell === letter;
  });
}

export function wordAtSelection({ startCell, endCell, gridSize }: WordSelection): number[] | null {
  const startRow = Math.floor(startCell / gridSize);
  const startColumn = startCell % gridSize;
  const endRow = Math.floor(endCell / gridSize);
  const endColumn = endCell % gridSize;
  const rowDistance = endRow - startRow;
  const columnDistance = endColumn - startColumn;
  const length = Math.max(Math.abs(rowDistance), Math.abs(columnDistance));
  if (!isStraightSelection({ rowDistance, columnDistance, length })) return null;
  const rowStep = Math.sign(rowDistance);
  const columnStep = Math.sign(columnDistance);
  return Array.from({ length: length + 1 }, (_, index) => (startRow + rowStep * index) * gridSize + startColumn + columnStep * index);
}

function isStraightSelection({ rowDistance, columnDistance, length }: SelectionVector): boolean {
  if (length === 0) return false;
  if (rowDistance === 0) return true;
  if (columnDistance === 0) return true;
  return Math.abs(rowDistance) === Math.abs(columnDistance);
}
