import type { DayType, OutlookType } from '../../types/outlooks';
import { OUTLOOK_LABEL_TO_TYPE } from './types';

export const OUTLOOK_TYPES = new Set<OutlookType>(['categorical', 'tornado', 'wind', 'hail', 'totalSevere', 'day4-8']);
const ELEMENT_NODE = 1;

const isElementNode = (node: ChildNode): node is Element => node.nodeType === ELEMENT_NODE;
const localTagName = (node: Element): string =>
  (node.localName ?? node.tagName.replace(/^[^:]+:/, '')).toLowerCase();

// @codescene(disable:"String Heavy Function Arguments")
export const getExtendedDataValue = (placemark: Element, key: string): string | null => {
  const dataNodes = placemark.getElementsByTagName('Data');
  for (let index = 0; index < dataNodes.length; index += 1) {
    const node = dataNodes[index];
    if (node.getAttribute('name') === key) {
      return node.getElementsByTagName('value')[0]?.textContent?.trim() ?? null;
    }
  }
  return null;
};

export const parseDayFromFolderName = (name: string): DayType | null => {
  const match = /^Day\s+(\d+)$/i.exec(name.trim());
  if (!match) return null;
  const day = Number(match[1]);
  return day >= 1 && day <= 8 ? day as DayType : null;
};

export const parseOutlookFromFolderName = (name: string): OutlookType | null =>
  OUTLOOK_LABEL_TO_TYPE[name.trim()] ?? null;

export const parsePlacemarkName = (name: string): { outlookType: OutlookType | null; probabilityKey: string | null } => {
  const trimmed = name.trim();
  for (const [label, outlookType] of Object.entries(OUTLOOK_LABEL_TO_TYPE)) {
    if (trimmed.startsWith(`${label} `)) {
      return { outlookType, probabilityKey: trimmed.slice(label.length + 1).trim() || null };
    }
  }
  return { outlookType: null, probabilityKey: trimmed || null };
};

// @codescene(disable:"Complex Conditional", disable:"Overall Code Complexity", disable:"String Heavy Function Arguments")
export const normalizeProbabilityKey = (value: string, isSignificant: boolean): string => {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('CIG') || trimmed.includes('#')) return trimmed;
  if (!isSignificant) return trimmed;
  return /^\d+%$/.test(trimmed) ? `${trimmed}#` : trimmed;
};

export interface FolderContext {
  day: DayType;
  outlookType: OutlookType | null;
}

export const findKmlElementsByLocalName = (root: Document | Element, name: string): Element[] => {
  const target = name.toLowerCase();
  return Array.from(root.getElementsByTagName('*')).filter((node) => localTagName(node) === target);
};

const childElements = (node: Element): Element[] => Array.from(node.childNodes).filter(isElementNode);

export const inferKmlFolderContext = (placemark: Element, defaultDay: DayType): FolderContext => {
  const context: FolderContext = { day: defaultDay, outlookType: null };
  let current = placemark.parentElement;
  while (current) {
    if (localTagName(current) === 'folder') {
      const folderName = childElements(current)
        .find((child) => localTagName(child) === 'name')?.textContent ?? '';
      context.day = parseDayFromFolderName(folderName) ?? context.day;
      context.outlookType = parseOutlookFromFolderName(folderName) ?? context.outlookType;
    }
    current = current.parentElement;
  }
  return context;
};
