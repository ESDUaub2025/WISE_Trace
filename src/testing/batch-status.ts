import type { Lot } from '../lib/domain';

/**
 * In the testing file, the review is recorded on packed kishk, so a batch's own status is derived from its packs:
 *
 *   any pack waiting for review  -> the batch is waiting for review
 *   otherwise any pack on hold   -> on hold
 *   every pack rejected          -> rejected
 *   released packs, stock left   -> released
 *   released packs, none left    -> closed (PRD FR-BAT-11: all packaged stock sold, distributed or written off)
 *
 * A batch that was stopped before packing keeps its "rejected" state. Batches with no packs are left alone.
 * On the WISE server these transitions are made by the database; this is only for the server-less test build.
 */
export function settleTestBatches(lots: Lot[]) {
  for (const batch of lots) {
    if (batch.type !== 'batch' || batch.facts.abandoned) continue;
    const packs = lots.filter((lot) => lot.type === 'packaging' && lot.facts.batch_id === batch.id);
    if (!packs.length) continue;
    const released = packs.filter((lot) => lot.state === 'released');
    if (packs.some((lot) => lot.state === 'awaiting_review')) batch.state = 'awaiting_review';
    else if (packs.some((lot) => lot.state === 'hold')) batch.state = 'hold';
    else if (!released.length) batch.state = 'rejected';
    else batch.state = released.some((lot) => (lot.available ?? 0) > 0) ? 'released' : 'closed';
  }
}
