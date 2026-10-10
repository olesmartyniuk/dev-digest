import type { PinResponse } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { ConflictError, NotFoundError } from '../../platform/errors.js';
import { PinsRepository } from './repository.js';
import { MAX_PINS_PER_WORKSPACE } from './constants.js';
import { normalizeNote } from './helpers.js';

export class PinsService {
  private repo: PinsRepository;

  constructor(private container: Container) {
    this.repo = new PinsRepository(container.db);
  }

  async pin(workspaceId: string, pullId: string, note?: string): Promise<PinResponse> {
    const pull = await this.container.reviewRepo.getPull(workspaceId, pullId);
    if (!pull) throw new NotFoundError('Pull request not found');
    if ((await this.repo.count(workspaceId)) >= MAX_PINS_PER_WORKSPACE) {
      throw new ConflictError('Pin limit reached');
    }
    return this.repo.insert(workspaceId, pullId, normalizeNote(note));
  }
}
