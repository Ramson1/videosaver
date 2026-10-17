'use client';

import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { downloadApi } from '@/lib/api';
import { toast } from 'sonner';

interface VideoMetadata {
  id: string;
  title: string;
  thumbnail?: string;
  duration?: number;
  uploader?: string;
  formats: Array<{
    format_id: string;
    ext: string;
    resolution: string;
    filesize?: number;
    vcodec?: string;
    acodec?: string;
  }>;
}

interface DownloadResult {
  filename: string;
  filepath: string;
  title: string;
}

export function useDownload() {
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [downloadResult, setDownloadResult] = useState<DownloadResult | null>(null);

  const metadataMutation = useMutation({
    mutationFn: (url: string) => downloadApi.getMetadata(url),
    onSuccess: (data: any) => setMetadata(data),
    onError: (error: Error) => toast.error(error.message || 'Failed to fetch metadata'),
  });

  const downloadMutation = useMutation({
    mutationFn: ({ url, quality }: { url: string; quality?: string }) =>
      downloadApi.download(url, quality),
    onSuccess: (data: any) => {
      setDownloadResult(data);
      toast.success('Download complete!');
    },
    onError: (error: Error) => toast.error(error.message || 'Download failed'),
  });

  const getMetadata = useCallback(
    async (url: string) => {
      setMetadata(null);
      setDownloadResult(null);
      await metadataMutation.mutateAsync(url);
    },
    [metadataMutation],
  );

  const download = useCallback(
    async (url: string, quality?: string) => {
      await downloadMutation.mutateAsync({ url, quality });
    },
    [downloadMutation],
  );

  const reset = useCallback(() => {
    setMetadata(null);
    setDownloadResult(null);
  }, []);

  return {
    metadata,
    downloadResult,
    isFetchingMetadata: metadataMutation.isPending,
    isDownloading: downloadMutation.isPending,
    getMetadata,
    download,
    reset,
  };
}
