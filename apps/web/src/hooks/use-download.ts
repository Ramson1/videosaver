'use client';

import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { downloadApi } from '@/lib/api';
import { toast } from 'sonner';

interface MediaMetadata {
  platform: string;
  mediaId: string;
  title: string;
  author: { name: string; username?: string };
  thumbnailUrl?: string;
  duration?: number;
  mediaType: string;
  variants: Array<{
    quality: string;
    format: string;
    hasVideo: boolean;
    hasAudio: boolean;
    width?: number;
    height?: number;
    fileSize?: number;
  }>;
  isDownloadable: boolean;
  restrictionReason?: string;
}

export function useDownload() {
  const [metadata, setMetadata] = useState<MediaMetadata | null>(null);
  const [downloadProgress, setDownloadProgress] = useState({
    step: 'metadata' as const,
    percent: 0,
    message: '',
  });

  const extractMetadataMutation = useMutation({
    mutationFn: (url: string) => downloadApi.getMetadata(url),
    onSuccess: (data: any) => {
      setMetadata(data);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to extract metadata');
    },
  });

  const downloadMutation = useMutation({
    mutationFn: ({ url, quality }: { url: string; quality: string }) =>
      downloadApi.download(url, quality),
    onMutate: () => {
      setDownloadProgress({ step: 'metadata', percent: 10, message: 'Starting download...' });
    },
    onSuccess: (data: any) => {
      setDownloadProgress({ step: 'complete', percent: 100, message: 'Download complete!' });

      if (data?.result?.signedUrl) {
        // Trigger browser download
        window.open(data.result.signedUrl, '_blank');
      }

      toast.success('Download ready!');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Download failed');
      setDownloadProgress({ step: 'metadata', percent: 0, message: '' });
    },
  });

  const extractMetadata = useCallback(
    async (url: string) => {
      setMetadata(null);
      await extractMetadataMutation.mutateAsync(url);
    },
    [extractMetadataMutation],
  );

  const startDownload = useCallback(
    async (url: string, quality: string) => {
      setDownloadProgress({ step: 'downloading', percent: 30, message: 'Downloading media...' });

      // Simulate progress steps
      setTimeout(() => setDownloadProgress({ step: 'processing', percent: 60, message: 'Processing file...' }), 1000);
      setTimeout(() => setDownloadProgress({ step: 'uploading', percent: 80, message: 'Preparing download link...' }), 2000);

      await downloadMutation.mutateAsync({ url, quality });
    },
    [downloadMutation],
  );

  const reset = useCallback(() => {
    setMetadata(null);
    setDownloadProgress({ step: 'metadata', percent: 0, message: '' });
  }, []);

  return {
    metadata,
    isExtracting: extractMetadataMutation.isPending,
    isDownloading: downloadMutation.isPending,
    downloadProgress,
    extractMetadata,
    startDownload,
    reset,
  };
}
