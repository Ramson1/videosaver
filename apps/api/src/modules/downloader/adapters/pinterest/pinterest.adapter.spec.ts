import { PinterestAdapter } from './pinterest.adapter';
import { Platform, MediaType } from '../../../../common/interfaces/platform.interface';

describe('PinterestAdapter', () => {
  let adapter: PinterestAdapter;

  beforeEach(() => {
    adapter = new PinterestAdapter();
  });

  // ──────────────────────────────────────────────
  //  Identity
  // ──────────────────────────────────────────────

  describe('identity', () => {
    it('should have the correct platform name', () => {
      expect(adapter.name).toBe(Platform.PINTEREST);
    });

    it('should have a display name', () => {
      expect(adapter.displayName).toBe('Pinterest');
    });

    it('should support image and video types', () => {
      const types = adapter.getSupportedTypes();
      expect(types).toContain(MediaType.IMAGE);
      expect(types).toContain(MediaType.VIDEO);
      expect(types).not.toContain(MediaType.GIF);
    });
  });

  // ──────────────────────────────────────────────
  //  URL Detection — canHandle()
  // ──────────────────────────────────────────────

  describe('canHandle', () => {
    it.each([
      'https://www.pinterest.com/pin/1234567890/',
      'https://pinterest.com/pin/9876543210',
      'https://www.pinterest.co.uk/pin/1111111111/',
      'https://pin.it/abc123XYZ',
      'https://vm.tiktok.com/abc123', // should NOT match — negative
      'https://www.pinterest.com/username/board-name/',
    ])('should handle Pinterest URL: %s', (url) => {
      // The last two are valid Pinterest URLs (board / pin.it),
      // but only pin URLs are fully parseable. canHandle checks host-level match.
      const isPinterestHost =
        url.includes('pinterest.com') ||
        url.includes('pinterest.co.') ||
        url.includes('pin.it');
      expect(adapter.canHandle(url)).toBe(isPinterestHost);
    });

    it.each([
      'https://facebook.com/pin/123',
      'https://instagram.com/p/abc123',
      'https://twitter.com/user/status/123',
    ])('should reject non-Pinterest URL: %s', (url) => {
      expect(adapter.canHandle(url)).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  //  URL Parsing — parseUrl()
  // ──────────────────────────────────────────────

  describe('parseUrl', () => {
    it('should parse a standard pinterest.com/pin/ URL', () => {
      const result = adapter.parseUrl('https://www.pinterest.com/pin/1234567890/');

      expect(result.isValid).toBe(true);
      expect(result.platform).toBe(Platform.PINTEREST);
      expect(result.mediaId).toBe('1234567890');
      expect(result.normalizedUrl).toBe('https://www.pinterest.com/pin/1234567890/');
    });

    it('should parse a pinterest.com/pin/<id>/<slug>/ URL', () => {
      const result = adapter.parseUrl(
        'https://www.pinterest.com/pin/5555555555/cool-recipe-idea/',
      );

      expect(result.isValid).toBe(true);
      expect(result.mediaId).toBe('5555555555');
    });

    it('should parse a regional domain URL', () => {
      const result = adapter.parseUrl('https://www.pinterest.co.uk/pin/7777777777/');

      expect(result.isValid).toBe(true);
      expect(result.mediaId).toBe('7777777777');
    });

    it('should parse a pin.it short link', () => {
      const result = adapter.parseUrl('https://pin.it/abc123XYZ');

      expect(result.isValid).toBe(true);
      expect(result.mediaId).toBe('short:abc123XYZ');
    });

    it('should reject a board URL (no pin ID)', () => {
      const result = adapter.parseUrl('https://www.pinterest.com/username/board-name/');

      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject an empty pin.it link', () => {
      const result = adapter.parseUrl('https://pin.it/');

      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject a completely invalid URL', () => {
      const result = adapter.parseUrl('not-a-url');

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid URL format');
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
  //  Metadata Extraction
  // ──────────────────────────────────────────────

  describe('extractMetadata', () => {
    it('should throw for an invalid parsed URL', async () => {
      const parsedUrl = adapter.parseUrl('https://www.pinterest.com/username/board/');

      await expect(adapter.extractMetadata(parsedUrl)).rejects.toThrow(
        'Cannot extract metadata from invalid URL',
      );
    });
  });
});
