import { Test, TestingModule } from '@nestjs/testing';
import { Platform, MediaType, Quality } from '../../../../common/interfaces/platform.interface';
import { SnapchatAdapter } from './snapchat.adapter';

describe('SnapchatAdapter', () => {
  let adapter: SnapchatAdapter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SnapchatAdapter],
    }).compile();

    adapter = module.get<SnapchatAdapter>(SnapchatAdapter);
  });

  it('should be defined', () => {
    expect(adapter).toBeDefined();
  });

  describe('metadata', () => {
    it('should have correct platform identity', () => {
      expect(adapter.name).toBe(Platform.SNAPCHAT);
      expect(adapter.displayName).toBe('Snapchat');
    });

    it('should support video and image types', () => {
      const types = adapter.getSupportedTypes();
      expect(types).toContain(MediaType.VIDEO);
      expect(types).toContain(MediaType.IMAGE);
    });
  });

  describe('canHandle', () => {
    it('should accept spotlight URLs', () => {
      expect(adapter.canHandle('https://www.snapchat.com/spotlight/abc123')).toBe(true);
      expect(adapter.canHandle('https://snapchat.com/spotlight/MyVideo-42')).toBe(true);
    });

    it('should accept public story URLs', () => {
      expect(adapter.canHandle('https://www.snapchat.com/add/username')).toBe(true);
      expect(adapter.canHandle('https://www.snapchat.com/stories/username/12345')).toBe(true);
    });

    it('should accept stories.snapchat.com URLs', () => {
      expect(adapter.canHandle('https://stories.snapchat.com/username')).toBe(true);
      expect(adapter.canHandle('https://stories.snapchat.com/user/story123')).toBe(true);
    });

    it('should accept snapch.at short links', () => {
      expect(adapter.canHandle('https://snapch.at/abc123')).toBe(true);
      expect(adapter.canHandle('http://snapch.at/xyz')).toBe(true);
    });

    it('should accept watch URLs', () => {
      expect(adapter.canHandle('https://www.snapchat.com/watch/spotlight-id')).toBe(true);
    });

    it('should reject non-Snapchat URLs', () => {
      expect(adapter.canHandle('https://www.youtube.com/watch?v=abc')).toBe(false);
      expect(adapter.canHandle('https://www.tiktok.com/@user/video/123')).toBe(false);
      expect(adapter.canHandle('https://www.instagram.com/reel/abc')).toBe(false);
    });

    it('should reject empty or invalid input', () => {
      expect(adapter.canHandle('')).toBe(false);
      expect(adapter.canHandle('not a url')).toBe(false);
    });
  });

  describe('parseUrl', () => {
    it('should parse spotlight URLs correctly', () => {
      const result = adapter.parseUrl('https://www.snapchat.com/spotlight/abc123xyz');
      expect(result.isValid).toBe(true);
      expect(result.platform).toBe(Platform.SNAPCHAT);
      expect(result.mediaId).toBe('abc123xyz');
      expect(result.normalizedUrl).toContain('https://');
    });

    it('should parse add URLs correctly', () => {
      const result = adapter.parseUrl('https://www.snapchat.com/add/cooluser');
      expect(result.isValid).toBe(true);
      expect(result.platform).toBe(Platform.SNAPCHAT);
      expect(result.mediaId).toBe('cooluser');
    });

    it('should parse stories subdomain URLs correctly', () => {
      const result = adapter.parseUrl('https://stories.snapchat.com/myuser');
      expect(result.isValid).toBe(true);
      expect(result.platform).toBe(Platform.SNAPCHAT);
      expect(result.mediaId).toBe('myuser');
    });

    it('should parse stories subdomain URLs with story ID', () => {
      const result = adapter.parseUrl('https://stories.snapchat.com/myuser/story456');
      expect(result.isValid).toBe(true);
      expect(result.mediaId).toBe('myuser/story456');
    });

    it('should parse snapch.at short links', () => {
      const result = adapter.parseUrl('https://snapch.at/abc');
      expect(result.isValid).toBe(true);
      expect(result.platform).toBe(Platform.SNAPCHAT);
      expect(result.mediaId).toBe('abc');
    });

    it('should parse watch URLs', () => {
      const result = adapter.parseUrl('https://www.snapchat.com/watch/my-video-42');
      expect(result.isValid).toBe(true);
      expect(result.mediaId).toBe('my-video-42');
    });

    it('should return invalid for empty URL', () => {
      const result = adapter.parseUrl('');
      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return invalid for URL without extractable ID', () => {
      const result = adapter.parseUrl('https://www.snapchat.com');
      expect(result.isValid).toBe(false);
    });

    it('should normalize HTTP to HTTPS', () => {
      const result = adapter.parseUrl('http://www.snapchat.com/spotlight/test123');
      expect(result.isValid).toBe(true);
      expect(result.normalizedUrl).toMatch(/^https:\/\//);
    });
  });

  describe('extractMetadata', () => {
    it('should throw for invalid parsed URL', async () => {
      const parsedUrl = {
        originalUrl: 'invalid',
        platform: Platform.SNAPCHAT,
        mediaId: '',
        normalizedUrl: '',
        isValid: false,
        error: 'Test error',
      };

      await expect(adapter.extractMetadata(parsedUrl)).rejects.toThrow(
        'Cannot extract metadata from invalid URL',
      );
    });
  });

  describe('download', () => {
    it('should throw for invalid parsed URL', async () => {
      const parsedUrl = {
        originalUrl: 'invalid',
        platform: Platform.SNAPCHAT,
        mediaId: '',
        normalizedUrl: '',
        isValid: false,
        error: 'Test error',
      };

      await expect(
        adapter.download(parsedUrl, Quality.HIGHEST, '/tmp'),
      ).rejects.toThrow('Cannot download from invalid URL');
    });
  });

  describe('isAvailable', () => {
    it('should return a boolean', async () => {
      const result = await adapter.isAvailable();
      expect(typeof result).toBe('boolean');
    });
  });
});
