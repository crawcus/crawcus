import type { ProjectionName } from '../types/ids.js';

/**
 * Compliance manifest field keys have shape `<ProjectionName>.<fieldKey>`
 * (e.g., `'Course.learnerAge'`). These helpers construct + parse them.
 */

export type FieldPath = `${string}.${string}`;

export function fieldPath(projection: ProjectionName, fieldKey: string): FieldPath {
  return `${projection}.${fieldKey}` as FieldPath;
}

export function parseFieldPath(path: FieldPath): { projection: string; fieldKey: string } | null {
  const dot = path.indexOf('.');
  if (dot < 1 || dot === path.length - 1) return null;
  return {
    projection: path.slice(0, dot),
    fieldKey: path.slice(dot + 1),
  };
}
