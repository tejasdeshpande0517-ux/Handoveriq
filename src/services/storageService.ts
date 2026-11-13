import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytesResumable,
} from 'firebase/storage';
import { api } from '../lib/api';
import { firebaseStorage } from '../lib/firebase';
import type { SourceDocument } from '../types';

export const ALLOWED_UPLOAD_EXTENSIONS = ['pdf', 'docx', 'txt', 'csv', 'json'];
export const MAX_UPLOAD_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

export interface FileUploadProgress {
  fileName: string;
  progressPercent: number;
  status: 'VALIDATING' | 'UPLOADING' | 'PROCESSING' | 'COMPLETED' | 'ERROR';
  errorMessage?: string;
}

export function validateUploadFile(file: File): { valid: boolean; error?: string } {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (!ALLOWED_UPLOAD_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: `Unsupported file format ".${ext}". Supported formats: PDF, DOCX, TXT, CSV, JSON.`,
    };
  }
  if (file.size === 0) {
    return {
      valid: false,
      error: `File "${file.name}" is empty (0 bytes).`,
    };
  }
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return {
      valid: false,
      error: `File "${file.name}" exceeds maximum allowed size of 15 MB.`,
    };
  }
  return { valid: true };
}

function readFileAsBase64(
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (ev) => {
      if (ev.lengthComputable && onProgress) {
        onProgress(Math.round((ev.loaded / ev.total) * 50));
      }
    };
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error(`Failed to read file "${file.name}"`));
    reader.readAsDataURL(file);
  });
}

/**
 * HandoverIQ Firebase Storage & Source Upload Service
 * Validates file format & size, tracks upload progress, uploads to Firebase Storage,
 * processes content + sensitive data redaction on backend, and supports authorized deletion.
 */
export const storageService = {
  validateFile: validateUploadFile,

  async uploadHandoverSourceFile(
    handoverId: string,
    file: File,
    onProgress?: (state: FileUploadProgress) => void
  ): Promise<{
    source: SourceDocument;
    redactionDetails: { ruleName: string; category: string; count: number }[];
  }> {
    onProgress?.({
      fileName: file.name,
      progressPercent: 5,
      status: 'VALIDATING',
    });

    const check = validateUploadFile(file);
    if (!check.valid) {
      onProgress?.({
        fileName: file.name,
        progressPercent: 0,
        status: 'ERROR',
        errorMessage: check.error,
      });
      throw new Error(check.error);
    }

    onProgress?.({
      fileName: file.name,
      progressPercent: 20,
      status: 'UPLOADING',
    });

    // Attempt resumable upload to Firebase Cloud Storage bucket (non-blocking if rules require custom token)
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `handovers/${handoverId}/uploads/${safeName}`;
    try {
      const storageRef = ref(firebaseStorage, storagePath);
      const uploadTask = uploadBytesResumable(storageRef, file);
      await Promise.race([
        new Promise<void>((resolve) => {
          uploadTask.on(
            'state_changed',
            (snap) => {
              if (snap.totalBytes > 0) {
                const pct = Math.min(
                  60,
                  20 + Math.round((snap.bytesTransferred / snap.totalBytes) * 40)
                );
                onProgress?.({
                  fileName: file.name,
                  progressPercent: pct,
                  status: 'UPLOADING',
                });
              }
            },
            () => resolve(),
            async () => {
              await getDownloadURL(uploadTask.snapshot.ref).catch(() => null);
              resolve();
            }
          );
        }),
        new Promise<void>((resolve) => setTimeout(resolve, 1200)),
      ]);
    } catch {
      // Continue to backend storage & redaction pipeline
    }

    const contentBase64 = await readFileAsBase64(file, (pct) => {
      onProgress?.({
        fileName: file.name,
        progressPercent: 20 + pct,
        status: 'UPLOADING',
      });
    });

    onProgress?.({
      fileName: file.name,
      progressPercent: 80,
      status: 'PROCESSING',
    });

    const result = await api.handovers.uploadFile(handoverId, {
      fileName: file.name,
      contentBase64,
      mimeType: file.type,
    });

    onProgress?.({
      fileName: file.name,
      progressPercent: 100,
      status: 'COMPLETED',
    });

    return result;
  },

  async deleteHandoverSourceFile(
    handoverId: string,
    source: SourceDocument
  ): Promise<{ success: boolean; deletedSourceId: string }> {
    if (source.storagePath) {
      try {
        const storageRef = ref(firebaseStorage, source.storagePath);
        await deleteObject(storageRef).catch(() => null);
      } catch {
        // Continue with backend storage deletion
      }
    }
    return api.handovers.deleteSource(handoverId, source.id);
  },
};

