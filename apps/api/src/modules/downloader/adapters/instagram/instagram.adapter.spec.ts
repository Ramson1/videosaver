import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

import { InstagramAdapter } from './instagram.adapter';
import { Platform, MediaType, Quality } from '@common/interfaces/platform.interface';

describe('InstagramAdapter', () => {
  let adapter: InstagramAdapter;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        INSTAGRAM_APP_ID: 'test-app-id',
        INSTAGRAM_APP_SECRET: 'test-app-secret',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InstagramAdapter,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    adapter = module.get<InstagramAdapter>(InstagramAdapter);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Basic properties
  // ---------------------------------------------------------------------------

  describe('properties', () => {
    it('should have the correct platform name', () => {
      expect(adapter.name).toBe(Platform.INSTAGRAM);
    });

    it('should have a display name', () => {
      expect(adapter.displayName).toBe('Instagram');
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
      'https://www.instagram.com/p/ABC123/',
      'https://instagram.com/p/xyz789',
      'https://www.instagram.com/reel/ABC123/',
      'https://www.instagram.com/reels/ABC123/',
      'https://www.instagram.com/tv/ABC123/',
      'https://instagr.am/p/ABC123/',
      'https://www.instagram.com/stories/user/123456789/',
    ])('should handle %s', (url) => {
      expect(adapter.canHandle(url)).toBe(true);
    });

    it.each([
      'https://www.facebook.com/p/ABC123',
      'https://www.youtube.com/watch?v=abc',
      'https://twitter.com/user/status/123',
      'https://example.com/instagram',
    ])('should not handle %s', (url) => {
      expect(adapter.canHandle(url)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // parseUrl
  // ---------------------------------------------------------------------------

  describe('parseUrl', () => {
    it('should parse a standard /p/<shortcode> URL', () => {
      const result = adapter.parseUrl('https://www.instagram.com/p/CxYzAbCdEf/');
      expect(result.isValid).toBe(true);
      expect(result.mediaId).toBe('CxYzAbCdEf');
      expect(result.platform).toBe(Platform.INSTAGRAM);
    });

    it('should parse a /reel/<shortcode> URL', () => {
      const result = adapter.parseUrl('https://www.instagram.com/reel/CxYzAbCdEf/');
      expect(result.isValid).toBe(true);
      expect(result.mediaId).toBe('CxYzAbCdEf');
    });

    it('should parse a /reels/<shortcode> URL', () => {
      const result = adapter.parseUrl('https://www.instagram.com/reels/CxYzAbCdEf/');
      expect(result.isValid).toBe(true);
      expect(result.mediaId).toBe('CxYzAbCdEf');
    });

    it('should parse a /tv/<shortcode> URL', () => {
      const result = adapter.parseUrl('https://www.instagram.com/tv/CxYzAbCdEf/');
      expect(result.isValid).toBe(true);
      expect(result.mediaId).toBe('CxYzAbCdEf');
    });

    it('should parse a /stories/<user>/<id> URL', () => {
      const result = adapter.parseUrl('https://www.instagram.com/stories/someuser/1234567890/');
      expect(result.isValid).toBe(true);
      expect(result.mediaId).toBe('1234567890');
    });

    it('should parse an instagr.am short URL', () => {
      const result = adapter.parseUrl('https://instagr.am/p/CxYzAbCdEf/');
      expect(result.isValid).toBe(true);
      expect(result.mediaId).toBe('CxYzAbCdEf');
    });

    it('should return isValid=false for unrecognised URLs', () => {
      const result = adapter.parseUrl('https://www.instagram.com/explore/tags/cats');
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
    it('should include video, image, and carousel types', () => {
      const types = adapter.getSupportedTypes();
      expect(types).toContain(MediaType.VIDEO);
      expect(types).toContain(MediaType.IMAGE);
      expect(types).toContain(MediaType.CAROUSEL);
    });
  });

  // ---------------------------------------------------------------------------
  // isAvailable
  // ---------------------------------------------------------------------------

  describe('isAvailable', () => {
    it('should return true when Instagram is reachable', async () => {
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(null, { status: 200 }),
      );

      const result = await adapter.isAvailable();
      expect(result).toBe(true);
      expect(fetchSpy).toHaveBeenCalled();
    });

    it('should return false when Instagram is unreachable', async () => {
      jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

      const result = await adapter.isAvailable();
      expect(result).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // extractMetadata
  // ---------------------------------------------------------------------------

  describe('extractMetadata', () => {
    it('should extract metadata from a video post page', async () => {
      const html = `
        <html>
        <head>
          <meta property="og:title" content="Test Reel on Instagram" />
          <meta property="og:description" content="A great reel" />
          <meta property="og:image" content="https://example.com/thumb.jpg" />
          <meta property="og:type" content="video.other" />
          <meta property="og:video" content="https://scontent.xx.fbcdn.net/v/test.mp4" />
          <meta property="og:video:duration" content="30" />
          <meta property="og:article:author" content="testuser" />
        </head>
        <body>
          <script>
            var data = { video_url: "https://scontent.xx.fbcdn.net/v/test_hd.mp4" };
          </script>
        </body>
        </html>
      `;

      jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(html, { status: 200, headers: { 'Content-Type': 'text/html' } }),
      );

      const parsedUrl = adapter.parseUrl('https://www.instagram.com/reel/CxYzAbCdEf/');
      const metadata = await adapter.extractMetadata(parsedUrl);

      expect(metadata.platform).toBe(Platform.INSTAGRAM);
      expect(metadata.mediaId).toBe('CxYzAbCdEf');
      expect(metadata.title).toBe('Test Reel on Instagram');
      expect(metadata.description).toBe('A great reel');
      expect(metadata.thumbnailUrl).toBe('https://example.com/thumb.jpg');
      expect(metadata.mediaType).toBe(MediaType.VIDEO);
      expect(metadata.duration).toBe(30);
      expect(metadata.isDownloadable).toBe(true);
      expect(metadata.variants.length).toBeGreaterThanOrEqual(1);
    });

    it('should extract metadata from an image post', async () => {
      const html = `
        <html>
        <head>
          <meta property="og:title" content="Photo on Instagram" />
          <meta property="og:image" content="https://scontent.xx.fbcdn.net/v/image.jpg" />
          <meta property="og:type" content="article" />
        </head>
        <body></body>
        </html>
      `;

      jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(html, { status: 200 }),
      );

      const parsedUrl = adapter.parseUrl('https://www.instagram.com/p/CxYzAbCdEf/');
      const metadata = await adapter.extractMetadata(parsedUrl);

      expect(metadata.mediaType).toBe(MediaType.IMAGE);
      expect(metadata.isDownloadable).toBe(true);
      expect(metadata.variants.length).toBeGreaterThanOrEqual(1);
    });

    it('should detect carousel posts', async () => {
      const html = `
        <html>
        <head>
          <meta property="og:title" content="Carousel Post" />
          <meta property="og:image" content="https://example.com/thumb.jpg" />
          <meta property="og:type" content="article" />
        </head>
        <body>
          <script>
            var data = { carousel_media: [
              { display_url: "https://example.com/img1.jpg", video_url: null },
              { display_url: "https://example.com/img2.jpg", video_url: null },
              { display_url: "https://example.com/img3.jpg", video_url: null }
            ]};
          </script>
        </body>
        </html>
      `;

      jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(html, { status: 200 }),
      );

      const parsedUrl = adapter.parseUrl('https://www.instagram.com/p/CxYzAbCdEf/');
      const metadata = await adapter.extractMetadata(parsedUrl);

      expect(metadata.mediaType).toBe(MediaType.CAROUSEL);
      expect(metadata.isDownloadable).toBe(true);
      expect(metadata.variants.length).toBeGreaterThanOrEqual(3);
    });

    it('should return isDownloadable=false when no media found', async () => {
      const html = `
        <html>
        <head><meta property="og:title" content="Empty" /></head>
        <body><p>Sorry, this post is private</p></body>
        </html>
      `;

      jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(html, { status: 200 }),
      );

      const parsedUrl = adapter.parseUrl('https://www.instagram.com/p/CxYzAbCdEf/');
      const metadata = await adapter.extractMetadata(parsedUrl);

      expect(metadata.isDownloadable).toBe(false);
      expect(metadata.restrictionReason).toBeDefined();
    });

    it('should handle network errors gracefully', async () => {
      jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Connection refused'));

      const parsedUrl = adapter.parseUrl('https://www.instagram.com/p/CxYzAbCdEf/');
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
      const html = `
        <html>
        <head><meta property="og:title" content="Private" /></head>
        <body><p>Sorry, this post is private</p></body>
        </html>
      `;

      jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(html, { status: 200 }),
      );

      const parsedUrl = adapter.parseUrl('https://www.instagram.com/p/CxYzAbCdEf/');

      await expect(adapter.download(parsedUrl, Quality.P720, '/tmp/test')).rejects.toThrow(
        /not downloadable/i,
      );
    });
  });
});
