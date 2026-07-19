import { TwitterAdapter } from './twitter.adapter';
import { Platform, Quality, MediaType } from '../../../../common/interfaces/platform.interface';

describe('TwitterAdapter', () => {
  let adapter: TwitterAdapter;

  beforeEach(() => {
    const mockYtdlpService = { isAvailable: () => false, buildMetadata: async () => null } as any;
    adapter = new TwitterAdapter(mockYtdlpService);
  });

  // ──────────────────────────────────────────────
  //  Identity
  // ──────────────────────────────────────────────

  describe('identity', () => {
    it('should have the correct platform name', () => {
      expect(adapter.name).toBe(Platform.TWITTER);
    });

    it('should have a display name', () => {
      expect(adapter.displayName).toBe('Twitter / X');
    });

    it('should support video, gif, and image types', () => {
      const types = adapter.getSupportedTypes();
      expect(types).toContain(MediaType.VIDEO);
      expect(types).toContain(MediaType.GIF);
      expect(types).toContain(MediaType.IMAGE);
    });
  });

  // ──────────────────────────────────────────────
  //  URL Detection — canHandle()
  // ──────────────────────────────────────────────

  describe('canHandle', () => {
    it.each([
      'https://twitter.com/elonmusk/status/1234567890',
      'https://x.com/elonmusk/status/1234567890',
      'https://mobile.twitter.com/user/status/9876543210',
      'https://www.twitter.com/someone/status/1111111111',
      'https://www.x.com/someone/status/2222222222',
      'http://twitter.com/user/status/3333333333?s=20',
      'https://x.com/i/web/status/4444444444',
    ])('should accept valid Twitter/X URL: %s', (url) => {
      expect(adapter.canHandle(url)).toBe(true);
    });

    it.each([
      'https://facebook.com/user/status/123',
      'https://instagram.com/p/abc123',
      'https://twitter.com/elonmusk',
      'https://twitter.com/',
      'https://not-twitter.com/user/status/123',
    ])('should reject non-Twitter URL: %s', (url) => {
      expect(adapter.canHandle(url)).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  //  URL Parsing — parseUrl()
  // ──────────────────────────────────────────────

  describe('parseUrl', () => {
    it('should parse a standard twitter.com URL', () => {
      const result = adapter.parseUrl('https://twitter.com/elonmusk/status/1234567890');

      expect(result.isValid).toBe(true);
      expect(result.platform).toBe(Platform.TWITTER);
      expect(result.mediaId).toBe('1234567890');
      expect(result.normalizedUrl).toBe('https://x.com/i/status/1234567890');
    });

    it('should parse an x.com URL', () => {
      const result = adapter.parseUrl('https://x.com/user/status/9876543210');

      expect(result.isValid).toBe(true);
      expect(result.mediaId).toBe('9876543210');
      expect(result.normalizedUrl).toBe('https://x.com/i/status/9876543210');
    });

    it('should parse a mobile.twitter.com URL', () => {
      const result = adapter.parseUrl('https://mobile.twitter.com/user/status/5555555555');

      expect(result.isValid).toBe(true);
      expect(result.mediaId).toBe('5555555555');
    });

    it('should parse a URL with query parameters', () => {
      const result = adapter.parseUrl('https://twitter.com/user/status/1111111111?s=20&t=abc');

      expect(result.isValid).toBe(true);
      expect(result.mediaId).toBe('1111111111');
    });

    it('should parse /i/web/status/ URLs', () => {
      const result = adapter.parseUrl('https://x.com/i/web/status/7777777777');

      expect(result.isValid).toBe(true);
      expect(result.mediaId).toBe('7777777777');
    });

    it('should reject a URL without a tweet ID', () => {
      const result = adapter.parseUrl('https://twitter.com/elonmusk');

      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject a completely invalid URL', () => {
      const result = adapter.parseUrl('not-a-url');

      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject URLs from unrelated hosts', () => {
      const result = adapter.parseUrl('https://facebook.com/user/status/123');

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Unrecognised');
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
    it('should throw for an invalid parsed URL', async () => {
      const parsedUrl = adapter.parseUrl('https://twitter.com/elonmusk');

      await expect(adapter.extractMetadata(parsedUrl)).rejects.toThrow(
        'Cannot extract metadata from invalid URL',
      );
    });
  });
});
