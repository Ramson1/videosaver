import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

import { FacebookAdapter } from './facebook.adapter';
import { Platform, MediaType, Quality } from '@common/interfaces/platform.interface';

describe('FacebookAdapter', () => {
  let adapter: FacebookAdapter;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        FACEBOOK_APP_ID: 'test-app-id',
        FACEBOOK_APP_SECRET: 'test-app-secret',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FacebookAdapter,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    adapter = module.get<FacebookAdapter>(FacebookAdapter);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Basic properties
  // ---------------------------------------------------------------------------

  describe('properties', () => {
    it('should have the correct platform name', () => {
      expect(adapter.name).toBe(Platform.FACEBOOK);
    });

    it('should have a display name', () => {
      expect(adapter.displayName).toBe('Facebook');
    });

    it('should define URL patterns', () => {
      expect(adapter.urlPatterns.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // canHandle
  // ---------------------------------------------------------------------------

  describe('canHandle', () => {
    it.each([
      'https://www.facebook.com/watch/?v=123456789',
      'https://facebook.com/user/videos/987654321',
      'https://m.facebook.com/watch/?v=111222333',
      'https://web.facebook.com/user/posts/444555666',
      'https://fb.watch/abc123',
      'https://www.facebook.com/reel/1234567890',
      'https://www.facebook.com/share/r/1234567890',
    ])('should handle %s', (url) => {
      expect(adapter.canHandle(url)).toBe(true);
    });

    it.each([
      'https://www.youtube.com/watch?v=abc',
      'https://twitter.com/user/status/123',
      'https://www.instagram.com/p/abc123',
      'https://example.com/facebook',
    ])('should not handle %s', (url) => {
      expect(adapter.canHandle(url)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // parseUrl
  // ---------------------------------------------------------------------------

  describe('parseUrl', () => {
    it('should parse a standard video URL', () => {
      const result = adapter.parseUrl('https://www.facebook.com/watch/?v=1234567890');
      expect(result.isValid).toBe(true);
      expect(result.mediaId).toBe('1234567890');
      expect(result.platform).toBe(Platform.FACEBOOK);
    });

    it('should parse a /videos/<id> URL', () => {
      const result = adapter.parseUrl('https://www.facebook.com/someuser/videos/9876543210');
      expect(result.isValid).toBe(true);
      expect(result.mediaId).toBe('9876543210');
    });

    it('should parse a /reel/<id> URL', () => {
      const result = adapter.parseUrl('https://www.facebook.com/reel/5556667778');
      expect(result.isValid).toBe(true);
      expect(result.mediaId).toBe('5556667778');
    });

    it('should parse an fb.watch short URL', () => {
      const result = adapter.parseUrl('https://fb.watch/abc123XY');
      expect(result.isValid).toBe(true);
      expect(result.mediaId).toBe('abc123XY');
    });

    it('should parse a mobile URL', () => {
      const result = adapter.parseUrl('https://m.facebook.com/watch/?v=1112223334');
      expect(result.isValid).toBe(true);
      expect(result.mediaId).toBe('1112223334');
    });

    it('should parse a /posts/<id> URL', () => {
      const result = adapter.parseUrl('https://www.facebook.com/user/posts/4445556667');
      expect(result.isValid).toBe(true);
      expect(result.mediaId).toBe('4445556667');
    });

    it('should parse a bare numeric ID URL', () => {
      const result = adapter.parseUrl('https://www.facebook.com/12345678901');
      expect(result.isValid).toBe(true);
      expect(result.mediaId).toBe('12345678901');
    });

    it('should return isValid=false for unrecognised URLs', () => {
      const result = adapter.parseUrl('https://www.facebook.com/somepage');
      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return isValid=false for malformed URLs', () => {
      const result = adapter.parseUrl('not-a-url');
      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // getSupportedTypes
  // ---------------------------------------------------------------------------

  describe('getSupportedTypes', () => {
    it('should include video and image types', () => {
      const types = adapter.getSupportedTypes();
      expect(types).toContain(MediaType.VIDEO);
      expect(types).toContain(MediaType.IMAGE);
    });
  });

  // ---------------------------------------------------------------------------
  // isAvailable
  // ---------------------------------------------------------------------------

  describe('isAvailable', () => {
    it('should return true when Facebook is reachable', async () => {
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(null, { status: 200 }),
      );

      const result = await adapter.isAvailable();
      expect(result).toBe(true);
      expect(fetchSpy).toHaveBeenCalled();
    });

    it('should return false when Facebook is unreachable', async () => {
      jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

      const result = await adapter.isAvailable();
      expect(result).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // extractMetadata
  // ---------------------------------------------------------------------------

  describe('extractMetadata', () => {
    it('should extract metadata from a page with og tags', async () => {
      const html = `
        <html>
        <head>
          <meta property="og:title" content="Test Video" />
          <meta property="og:description" content="A test video description" />
          <meta property="og:image" content="https://example.com/thumb.jpg" />
          <meta property="og:type" content="video.other" />
          <meta property="og:video:duration" content="120" />
        </head>
        <body>
          <script>
            var data = { browser_native_hd_url: "https://video.xx.fbcdn.net/v/test_hd.mp4?oh=abc" };
            var data2 = { browser_native_sd_url: "https://video.xx.fbcdn.net/v/test_sd.mp4?oh=def" };
          </script>
        </body>
        </html>
      `;

      jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(html, { status: 200, headers: { 'Content-Type': 'text/html' } }),
      );

      const parsedUrl = adapter.parseUrl('https://www.facebook.com/watch/?v=1234567890');
      const metadata = await adapter.extractMetadata(parsedUrl);

      expect(metadata.platform).toBe(Platform.FACEBOOK);
      expect(metadata.mediaId).toBe('1234567890');
      expect(metadata.title).toBe('Test Video');
      expect(metadata.description).toBe('A test video description');
      expect(metadata.thumbnailUrl).toBe('https://example.com/thumb.jpg');
      expect(metadata.mediaType).toBe(MediaType.VIDEO);
      expect(metadata.duration).toBe(120);
      expect(metadata.isDownloadable).toBe(true);
      expect(metadata.variants.length).toBeGreaterThanOrEqual(2);
    });

    it('should return isDownloadable=false when no variants found', async () => {
      const html = `
        <html>
        <head>
          <meta property="og:title" content="Private Post" />
        </head>
        <body>
          <p>This content is currently unavailable</p>
        </body>
        </html>
      `;

      jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(html, { status: 200 }),
      );

      const parsedUrl = adapter.parseUrl('https://www.facebook.com/watch/?v=9999999999');
      const metadata = await adapter.extractMetadata(parsedUrl);

      expect(metadata.isDownloadable).toBe(false);
      expect(metadata.restrictionReason).toBeDefined();
    });

    it('should handle network errors gracefully', async () => {
      jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Connection refused'));

      const parsedUrl = adapter.parseUrl('https://www.facebook.com/watch/?v=1234567890');
      const metadata = await adapter.extractMetadata(parsedUrl);

      expect(metadata.isDownloadable).toBe(false);
      expect(metadata.restrictionReason).toContain('Connection refused');
    });
  });

  // ---------------------------------------------------------------------------
  // download
  // ---------------------------------------------------------------------------

  describe('download', () => {
    it('should throw when content is not downloadable', async () => {
      const html = '<html><body>This content is currently unavailable</body></html>';

      jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(html, { status: 200 }),
      );

      const parsedUrl = adapter.parseUrl('https://www.facebook.com/watch/?v=1234567890');

      await expect(adapter.download(parsedUrl, Quality.P720, '/tmp/test')).rejects.toThrow(
        /not downloadable/i,
      );
    });
  });
});
