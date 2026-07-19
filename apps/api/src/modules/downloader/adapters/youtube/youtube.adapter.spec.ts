import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { YouTubeAdapter } from './youtube.adapter';
import { Platform, MediaType } from '../../../../common/interfaces/platform.interface';

describe('YouTubeAdapter', () => {
  let adapter: YouTubeAdapter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        YouTubeAdapter,
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

    adapter = module.get<YouTubeAdapter>(YouTubeAdapter);
  });

  // ──────────────────────────────────────────────
  //  Identity
  // ──────────────────────────────────────────────

  describe('identity', () => {
    it('should have the correct platform name', () => {
      expect(adapter.name).toBe(Platform.YOUTUBE);
    });

    it('should have a display name', () => {
      expect(adapter.displayName).toBe('YouTube');
    });

    it('should support video type', () => {
      const types = adapter.getSupportedTypes();
      expect(types).toContain(MediaType.VIDEO);
    });
  });

  // ──────────────────────────────────────────────
  //  URL Detection — canHandle()
  // ──────────────────────────────────────────────

  describe('canHandle', () => {
    it.each([
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://m.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://www.youtube.com/live/dQw4w9WgXcQ',
      'http://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120',
      'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
    ])('should accept valid YouTube URL: %s', (url) => {
      expect(adapter.canHandle(url)).toBe(true);
    });

    it.each([
      'https://facebook.com/user/video/123',
      'https://instagram.com/p/abc123',
      'https://tiktok.com/@user/video/123',
      'https://www.youtube.com/',
      'https://www.youtube.com/channel/UC12345',
      'https://www.youtube.com/playlist?list=PL12345',
      'https://not-youtube.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/results?search_query=test',
    ])('should reject non-YouTube URL: %s', (url) => {
      expect(adapter.canHandle(url)).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  //  URL Parsing — parseUrl()
  // ──────────────────────────────────────────────

  describe('parseUrl', () => {
    it('should parse a standard watch URL', () => {
      const result = adapter.parseUrl(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      );

      expect(result.isValid).toBe(true);
      expect(result.platform).toBe(Platform.YOUTUBE);
      expect(result.mediaId).toBe('dQw4w9WgXcQ');
      expect(result.normalizedUrl).toBe(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      );
    });

    it('should parse a youtu.be short URL', () => {
      const result = adapter.parseUrl('https://youtu.be/dQw4w9WgXcQ');

      expect(result.isValid).toBe(true);
      expect(result.mediaId).toBe('dQw4w9WgXcQ');
      expect(result.normalizedUrl).toBe(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      );
    });

    it('should parse a Shorts URL', () => {
      const result = adapter.parseUrl(
        'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      );

      expect(result.isValid).toBe(true);
      expect(result.mediaId).toBe('dQw4w9WgXcQ');
    });

    it('should parse a mobile YouTube URL', () => {
      const result = adapter.parseUrl(
        'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
      );

      expect(result.isValid).toBe(true);
      expect(result.mediaId).toBe('dQw4w9WgXcQ');
    });

    it('should parse an embed URL', () => {
      const result = adapter.parseUrl(
        'https://www.youtube.com/embed/dQw4w9WgXcQ',
      );

      expect(result.isValid).toBe(true);
      expect(result.mediaId).toBe('dQw4w9WgXcQ');
    });

    it('should parse a live URL', () => {
      const result = adapter.parseUrl(
        'https://www.youtube.com/live/dQw4w9WgXcQ',
      );

      expect(result.isValid).toBe(true);
      expect(result.mediaId).toBe('dQw4w9WgXcQ');
    });

    it('should parse a URL with extra query parameters', () => {
      const result = adapter.parseUrl(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120s&list=PL12345',
      );

      expect(result.isValid).toBe(true);
      expect(result.mediaId).toBe('dQw4w9WgXcQ');
    });

    it('should parse a youtu.be URL with query parameters', () => {
      const result = adapter.parseUrl('https://youtu.be/dQw4w9WgXcQ?t=42');

      expect(result.isValid).toBe(true);
      expect(result.mediaId).toBe('dQw4w9WgXcQ');
    });

    it('should reject a URL without a video ID', () => {
      const result = adapter.parseUrl('https://www.youtube.com/');

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

    it('should reject channel URLs', () => {
      const result = adapter.parseUrl(
        'https://www.youtube.com/channel/UCuAXFkgsw1L7xaCfnd5JJOw',
      );

      expect(result.isValid).toBe(false);
    });

    it('should reject playlist URLs', () => {
      const result = adapter.parseUrl(
        'https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf',
      );

      expect(result.isValid).toBe(false);
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
    it('should throw for an invalid parsed URL', () => {
      const parsedUrl = {
        originalUrl: 'https://www.youtube.com/',
        platform: Platform.YOUTUBE,
        mediaId: '',
        normalizedUrl: 'https://www.youtube.com/',
        isValid: false,
        error: 'Could not extract YouTube video ID from URL',
      };

      expect(adapter.extractMetadata(parsedUrl)).rejects.toThrow(
        'Cannot extract metadata from invalid URL',
      );
    });

    it('should throw for an empty mediaId', () => {
      const parsedUrl = {
        originalUrl: 'https://www.youtube.com/watch?v=invalid',
        platform: Platform.YOUTUBE,
        mediaId: '',
        normalizedUrl: 'https://www.youtube.com/watch?v=',
        isValid: false,
      };

      expect(adapter.extractMetadata(parsedUrl)).rejects.toThrow(
        'Cannot extract metadata from invalid URL',
      );
    });
  });
});
