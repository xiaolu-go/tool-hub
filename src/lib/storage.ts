import { calculatePlan, MODEL_VERSION } from '../features/pension-calculator/domain/calculate';
import { toDraft, validateDraft } from '../features/pension-calculator/domain/validation';
import type { CalculationResult, PlanDraft, PlanInput } from '../features/pension-calculator/domain/types';

export const STORAGE_KEY = 'tool-hub:pension-calculator:v1';
export interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
export type RestoreResult = { status: 'empty' } | { status: 'invalid' } | { status: 'restored'; draft: PlanDraft; result: CalculationResult };

export function restorePlan(storage: StoragePort): RestoreResult {
  try {
    const text = storage.getItem(STORAGE_KEY);
    if (text === null) return { status: 'empty' };
    const stored = JSON.parse(text);
    if (!stored || stored.storageVersion !== 1 || ![1, MODEL_VERSION].includes(stored.modelVersion) || typeof stored.savedAt !== 'string') return { status: 'invalid' };
    // Version 1 only supported calendar years; preserve those inputs without reinterpreting them as ages.
    const input = stored.modelVersion === 1 && stored.input && typeof stored.input === 'object' && !('timeBasis' in stored.input)
      ? { ...stored.input, timeBasis: 'year', startAge: '35', withdrawalStartAge: '60', withdrawalEndAge: '85' }
      : stored.input;
    const validated = validateDraft(input);
    if (!validated.ok) return { status: 'invalid' };
    return { status: 'restored', draft: toDraft(validated.value), result: calculatePlan(validated.value) };
  } catch {
    return { status: 'invalid' };
  }
}

export function savePlan(storage: StoragePort, input: PlanInput, savedAt: string): boolean {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ storageVersion: 1, modelVersion: MODEL_VERSION, savedAt, input: toDraft(input) }));
    return true;
  } catch { return false; }
}

export function clearPlan(storage: StoragePort): boolean {
  try { storage.removeItem(STORAGE_KEY); return true; } catch { return false; }
}

// Access itself can throw when a browser disables localStorage.
export function browserStorage(): StoragePort {
  return {
    getItem: key => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
    removeItem: key => window.localStorage.removeItem(key),
  };
}
