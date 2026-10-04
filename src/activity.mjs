// Transient operation progress. The saved-job allowlist deliberately excludes this state.
export function startActivity(job, notify, title, kind, sheetKey = null) {
  const activity = { title, kind, sheetKey, phase: 'preparing', startedAt: Date.now() };
  if (kind === 'sheet') {
    job.activities ||= {};
    job.activities[sheetKey] = activity;
  } else {
    job.activity = activity;
  }
  notify(job);
  return {
    update(phase, detail = '') {
      Object.assign(activity, { phase, detail });
      notify(job);
    },
    finish() {
      if (kind === 'sheet') {
        if (job.activities?.[sheetKey] === activity) delete job.activities[sheetKey];
        if (!Object.keys(job.activities || {}).length) delete job.activities;
      } else if (job.activity === activity) delete job.activity;
      notify(job);
    }
  };
}
