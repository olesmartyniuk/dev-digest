import { MAX_ROLLUP_FILES } from '../rollup/constants.js';

export function blastWeight(files: string[]): number {
  return Math.min(files.length, MAX_ROLLUP_FILES) * 2;
}
