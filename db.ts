
import { DailyLog, ConversationSegment } from './types';

const DB_NAME = 'DayTrackDB';
const STORE_LOGS = 'daily_logs';
const STORE_AUDIO = 'audio_files';
const VERSION = 2;

export const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_LOGS)) {
        db.createObjectStore(STORE_LOGS, { keyPath: 'date' });
      }
      if (!db.objectStoreNames.contains(STORE_AUDIO)) {
        db.createObjectStore(STORE_AUDIO);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

// --- Compression Utilities (GZIP) ---
async function compressBlob(blob: Blob): Promise<Blob> {
  const stream = blob.stream().pipeThrough(new CompressionStream('gzip'));
  return await new Response(stream).blob();
}

async function decompressBlob(blob: Blob): Promise<Blob> {
  const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).blob();
}

export const saveAudio = async (id: string, blob: Blob, shouldCompress: boolean = false): Promise<void> => {
  const db = await openDB();
  const finalBlob = shouldCompress ? await compressBlob(blob) : blob;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_AUDIO, 'readwrite');
    const store = transaction.objectStore(STORE_AUDIO);
    store.put({ 
      blob: finalBlob, 
      compressed: shouldCompress, 
      timestamp: Date.now() 
    }, id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

export const getAudio = async (id: string): Promise<Blob | null> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_AUDIO, 'readonly');
    const store = transaction.objectStore(STORE_AUDIO);
    const request = store.get(id);
    request.onsuccess = async () => {
      const result = request.result;
      if (!result) return resolve(null);
      if (result.compressed) {
        try {
          const decompressed = await decompressBlob(result.blob);
          resolve(decompressed);
        } catch (e) {
          console.error("Decompression failed, returning raw blob", e);
          resolve(result.blob); 
        }
      } else {
        resolve(result.blob);
      }
    };
    request.onerror = () => reject(request.error);
  });
};

export const autoCleanupAndCompress = async () => {
  const db = await openDB();
  const logs = await getAllLogs();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const transaction = db.transaction([STORE_LOGS, STORE_AUDIO], 'readwrite');
  const audioStore = transaction.objectStore(STORE_AUDIO);
  const logStore = transaction.objectStore(STORE_LOGS);

  for (const log of logs) {
    const logDate = new Date(log.date);
    if (logDate < thirtyDaysAgo) {
      let logUpdated = false;
      for (const segment of log.transcripts) {
        if (segment.audioId && !segment.isCompressed) {
          const audioReq = audioStore.get(segment.audioId);
          audioReq.onsuccess = async () => {
            const result = audioReq.result;
            if (result && !result.compressed) {
              const compressedBlob = await compressBlob(result.blob);
              audioStore.put({ ...result, blob: compressedBlob, compressed: true }, segment.audioId!);
            }
          };
          segment.isCompressed = true;
          logUpdated = true;
        }
      }
      if (logUpdated) {
        logStore.put(log);
      }
    }
  }
};

export const saveLog = async (log: DailyLog): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_LOGS, 'readwrite');
    const store = transaction.objectStore(STORE_LOGS);
    store.put(log);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

export const getLog = async (date: string): Promise<DailyLog | null> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_LOGS, 'readonly');
    const store = transaction.objectStore(STORE_LOGS);
    const request = store.get(date);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
};

export const getAllLogs = async (): Promise<DailyLog[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_LOGS, 'readonly');
    const store = transaction.objectStore(STORE_LOGS);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const deleteDayData = async (date: string, audioIds: string[]): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_LOGS, STORE_AUDIO], 'readwrite');
    transaction.objectStore(STORE_LOGS).delete(date);
    audioIds.forEach(id => {
      transaction.objectStore(STORE_AUDIO).delete(id);
    });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

export const wipeAllData = async (): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_LOGS, STORE_AUDIO], 'readwrite');
    transaction.objectStore(STORE_LOGS).clear();
    transaction.objectStore(STORE_AUDIO).clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

export const getStorageStats = async () => {
  if (navigator.storage && navigator.storage.estimate) {
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage || 0;
    const quota = estimate.quota || 0;
    return {
      usageMB: Math.round(usage / (1024 * 1024)),
      quotaMB: Math.round(quota / (1024 * 1024)),
      percentUsed: quota > 0 ? (usage / quota) * 100 : 0
    };
  }
  return { usageMB: 0, quotaMB: 0, percentUsed: 0 };
};
