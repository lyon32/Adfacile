import { queue } from '@trigger.dev/sdk';
import { QUEUE_CONCURRENCY } from './queue-limits';

// Déclaration des files auprès de Trigger.dev (ARCHITECTURE §8.4). Une tâche choisit sa file avec `queue: queues.agents`.
export const queues = {
  mediaFal: queue({ name: 'media-fal', concurrencyLimit: QUEUE_CONCURRENCY['media-fal'] }),
  mediaHiggsfield: queue({
    name: 'media-higgsfield',
    concurrencyLimit: QUEUE_CONCURRENCY['media-higgsfield'],
  }),
  mediaByteplusVideo: queue({
    name: 'media-byteplus-video',
    concurrencyLimit: QUEUE_CONCURRENCY['media-byteplus-video'],
  }),
  agents: queue({ name: 'agents', concurrencyLimit: QUEUE_CONCURRENCY.agents }),
} as const;
