import type {ScheduledPayload} from '../../../../packages/shared/src/queue';
import type {SendPolicyStore} from './send-policy-store';
import type {QueueStore} from './queue-store';
// Called only after encryption resolves, with the worker-pinned payload.
export function createPolicyCheckedJob(queue:QueueStore,policy:SendPolicyStore,payload:ScheduledPayload,previewId:string,dueAt:string,zone:string,ciphertext:Buffer){
 policy.assertAllowed(payload.accountId,payload.recipient,payload.purpose);
 return queue.create(payload.accountId,previewId,payload.recipient,dueAt,zone,ciphertext,payload.purpose);
}
