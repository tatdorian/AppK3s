import { startBackupWorker } from './backup.worker.js';
import { startAlertWorker } from './alert.worker.js';

export async function startWorkers(): Promise<void> {
  try {
    await startBackupWorker();
    console.log('[workers] Backup worker started');
  } catch (err) {
    console.error('[workers] Failed to start backup worker:', err);
  }

  try {
    await startAlertWorker();
    console.log('[workers] Alert worker started');
  } catch (err) {
    console.error('[workers] Failed to start alert worker:', err);
  }
}
