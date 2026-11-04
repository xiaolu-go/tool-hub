import type { PlanInput } from './types';

export const timeUnit = (input: PlanInput) => input.timeBasis === 'age' ? '岁' : '年';
export const timeLabel = (input: PlanInput, coordinate: number) => `${coordinate} ${timeUnit(input)}`;
