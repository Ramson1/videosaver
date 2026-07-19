import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TikTokAdapter } from './tiktok.adapter';
import { Platform, MediaType } from '../../../../common/interfaces/platform.interface';

describe('TikTokAdapter', () => {
  let adapter: TikTokAdapter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TikTokAdapter,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const map: Record<string, unknown> = {
                'app.storage.signedUrlExpirySeconds': 3600,
                'app.storage.tempDir': './tmp/downloads',
              };
              return map[key];
            }),
          },
        },
      ],
    }).compile();

    adapter = module.get<TikTokAdapter>(TikTokAdapter);
  });

  // ──────────────────────────────────────────────
  //  Identity
  // ──────────────────────────────────────────────

  describe('identity', () => {
    it('should have the correct platform name', () => {
      expect(adapter.name).toBe(Platform.TIKTOK);
    });

    it('should have a display name', () => {
      expect(adapter.displayName).toBe('TikTok');
    });

    it('should support video, image, and carousel types', () => {
      const types = adapter.getSupportedTypes();
      expect(types).toContain(MediaType.VIDEO);
      expect(types).toContain(MediaType.IMAGE);
      expect(types).toContain(MediaType.CAROUSEL);
    });
  });

  // ──────────────────────────────────────────────
  //  URL Detection — canHandle()
  // ──────────────────────────────────────────────

  describe('canHandle', () => {
    it.each([
      'https://www.tiktok.com/@user/video/7123456789012345678',
      'https://tiktok.com/@creator/video/7123456789012345678',
      'https://www.tiktok.com/@user/photo/7123456789012345678',
      'https://vm.tiktok.com/ZMabcdefg/',
      'https://vt.tiktok.com/ZSabcdefg/',
      'https://www.tiktok.com/t/ZTabcdefg/',
      'https://m.tiktok.com/v/7123456789012345678',
      'http://www.tiktok.com/@someone/video/7123456789012345678',
      'https://www.tiktok.com/embed/v2/7123456789012345678',
    ])('should accept valid TikTok URL: %s', (url) => {
      expect(adapter.canHandle(url)).toBe(true);
    });

    it.each([
      'https://facebook.com/user/video/123',
      'https://instagram.com/p/abc123',
      'https://youtube.com/watch?v=abc',
      'https://not-tiktok.com/@user/video/123',
      'https://www.tiktok.com/@user',
      'https://www.tiktok.com/',
      'https://www.tiktok.com/foryou',
    ])('should reject non-TikTok URL: %s', (url) => {
      expect(adapter.canHandle(url)).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  //  URL Parsing — parseUrl()
  // ──────────────────────────────────────────────

  describe('parseUrl', () => {
    it('should parse a standard video URL', () => {
      const result = adapter.parseUrl(
        'https://www.tiktok.com/@user/video/7123456789012345678',
      );

      expect(result.isValid).toBe(true);
      expect(result.platform).toBe(Platform.TIKTOK);
      expect(result.mediaId).toBe('7123456789012345678');
    });

    it('should parse a photo URL', () => {
      const result = adapter.parseUrl(
        'https://www.tiktok.com/@creator/photo/7123456789012345678',
      );

      expect(result.isValid).toBe(true);
      expect(result.mediaId).toBe('7123456789012345678');
    });

    it('should parse a mobile TikTok URL', () => {
      const result = adapter.parseUrl(
        'https://m.tiktok.com/v/7123456789012345678',
      );

      expect(result.isValid).toBe(true);
      expect(result.mediaId).toBe('7123456789012345678');
    });

    it('should parse a URL with query parameters', () => {
      const result = adapter.parseUrl(
        'https://www.tiktok.com/@user/video/7123456789012345678?is_from_webapp=1&sender_device=pc',
      );

      expect(result.isValid).toBe(true);
      expect(result.mediaId).toBe('7123456789012345678');
    });

    it('should accept short URLs without an immediate mediaId', () => {
      const result = adapter.parseUrl('https://vm.tiktok.com/ZMabcdefg/');

      expect(result.isValid).toBe(true);
      expect(result.platform).toBe(Platform.TIKTOK);
      // mediaId is empty for short URLs until redirect resolution
      expect(result.mediaId).toBe('');
    });

    it('should accept vt.tiktok.com short URLs', () => {
      const result = adapter.parseUrl('https://vt.tiktok.com/ZSabcdefg/');

      expect(result.isValid).toBe(true);
      expect(result.mediaId).toBe('');
    });

    it('should accept /t/ short URLs', () => {
      const result = adapter.parseUrl('https://www.tiktok.com/t/ZTabcdefg/');

      expect(result.isValid).toBe(true);
      expect(result.mediaId).toBe('');
    });

    it('should reject a URL without a video ID', () => {
      const result = adapter.parseUrl('https://www.tiktok.com/@user');

      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject a completely invalid URL', () => {
      const result = adapter.parseUrl('not-a-url');

      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject URLs from unrelated hosts', () => {
      const result = adapter.parseUrl('https://facebook.com/user/video/123');

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('does not match');
    });
  });

  // ──────────────────────────────────────────────
  //  Availability
  // ──────────────────────────────────────────────

  describe('isAvailable', () => {
    it('should return a boolean', async () => {
      const result = await adapter.isAvailable();
      expect(typeof result).toBe('boolean');
    });
  });

  // ──────────────────────────────────────────────
  //  Metadata Extraction (integration-level)
  // ──────────────────────────────────────────────

  describe('extractMetadata', () => {
    it('should throw for a short URL that cannot be resolved', async () => {
      const parsedUrl = adapter.parseUrl('https://vm.tiktok.com/invalid/');

      // This will attempt a real HTTP request; in a unit test environment
      // without network access it should throw or return non-downloadable metadata.
      await expect(adapter.extractMetadata(parsedUrl)).rejects.toThrow();
    });

    it('should throw for a URL with an unresolvable video ID', async () => {
      const parsedUrl = {
        originalUrl: 'https://www.tiktok.com/@user/video/0000000000000000000',
        platform: Platform.TIKTOK,
        mediaId: '0000000000000000000',
        normalizedUrl: 'https://www.tiktok.com/_/item/0000000000000000000',
        isValid: true,
      };

      // Real HTTP request will likely fail or return empty content
      await expect(adapter.extractMetadata(parsedUrl)).rejects.toThrow();
    });
  });
});
