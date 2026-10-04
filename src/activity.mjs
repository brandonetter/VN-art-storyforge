// Transient operation progress. The saved-job allowlist deliberately excludes this state.
export function startActivity(job, notify, title, kind, sheetKey = null) {
  const activity = { title, kind, sheetKey, phase: 'preparing', startedAt: Date.now() };
  job.activity = activity;
  notify(job);
  return {
    update(phase, detail = '') {
      Object.assign(activity, { phase, detail });
      notify(job);
    },
    finish() {
      if (job.activity === activity) delete job.activity;
      notify(job);
    }
  };
}
