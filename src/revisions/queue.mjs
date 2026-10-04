// Keep at most one revision request in page memory and run it only when the pipeline is idle.
// Refreshing forgets queued instructions; generated review candidates are saved by the service.
import { validateTarget, revisionInstruction } from './targets.mjs';

export function createRevisionQueue({ isBusy, getAuth, execute, notify = () => {} }) {
  let request = null;
  let running = false;
  let pumping = false;

  function publish() { notify(request); }

  return {
    get request() { return request; },
    get running() { return running; },

    enqueue(job, target, instruction) {
      if (request || job.pendingRevision) throw Error('Finish or cancel the existing revision first.');
      request = { job, target: validateTarget(job, target), instruction: revisionInstruction(instruction), status: 'queued', error: '', startedAt: Date.now() };
      publish();
    },

    cancel() {
      if (running) throw Error('A revision already generating cannot be cancelled here.');
      request = null;
      publish();
    },

    async pump() {
      if (!request || running || pumping || isBusy()) return;
      pumping = true;
      const current = request;
      try {
        let auth;
        try {
          auth = getAuth(current.job.provider);
        } catch (error) {
          current.status = 'needs-key';
          current.error = 'Close this dialog, check your provider and key in Setup, then retry. ' + error.message;
          publish();
          return;
        }
        running = true;
        current.status = 'generating';
        current.startedAt = Date.now();
        current.error = '';
        publish();
        try {
          await execute(current, auth);
          request = null;
        } catch (error) {
          current.status = 'failed';
          current.error = error.message;
          if (current.job.pendingRevision) request = null;
        } finally {
          running = false;
          publish();
        }
      } finally {
        pumping = false;
      }
    }
  };
}
