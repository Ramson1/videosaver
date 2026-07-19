import { LinkedInAdapter } from './linkedin.adapter';
import { Platform, MediaType } from '../../../../common/interfaces/platform.interface';

describe('LinkedInAdapter', () => {
  let adapter: LinkedInAdapter;

  beforeEach(() => {
    adapter = new LinkedInAdapter();
  });

  // ──────────────────────────────────────────────
  //  Identity
  // ──────────────────────────────────────────────

  describe('identity', () => {
    it('should have the correct platform name', () => {
      expect(adapter.name).toBe(Platform.LINKEDIN);
    });

    it('should have a display name', () => {
      expect(adapter.displayName).toBe('LinkedIn');
    });

    it('should support video and image types', () => {
      const types = adapter.getSupportedTypes();
      expect(types).toContain(MediaType.VIDEO);
      expect(types).toContain(MediaType.IMAGE);
      expect(types).not.toContain(MediaType.GIF);
      expect(types).not.toContain(MediaType.AUDIO);
    });
  });

  // ──────────────────────────────────────────────
  //  URL Detection — canHandle()
  // ──────────────────────────────────────────────

  describe('canHandle', () => {
    it.each([
      'https://www.linkedin.com/posts/johndoe_activity-7123456789012345678',
      'https://linkedin.com/posts/janedoe/7123456789012345678',
      'https://www.linkedin.com/post/urn:li:activity:7123456789012345678',
      'https://www.linkedin.com/feed/urn:li:activity:7123456789012345678',
      'https://www.linkedin.com/pulse/some-article-slug',
      'https://www.linkedin.com/posts/someone?urn=urn:li:activity:1234567890123456789',
    ])('should accept valid LinkedIn URL: %s', (url) => {
      expect(adapter.canHandle(url)).toBe(true);
    });

    it.each([
      'https://twitter.com/user/status/123',
      'https://facebook.com/user/posts/123',
      'https://not-linkedin.com/posts/123',
      'https://linkedin.com/in/johndoe',
    ])('should reject non-post LinkedIn URL or other platform: %s', (url) => {
      // /in/ profile URLs should not match
      const isProfileUrl = url.includes('/in/');
      expect(adapter.canHandle(url)).toBe(!isProfileUrl && (
        url.includes('linkedin.com/posts') ||
        url.includes('linkedin.com/pulse') ||
        url.includes('linkedin.com/feed') ||
        url.includes('linkedin.com/post/') ||
        url.includes('urn=urn:li')
      ));
    });
  });

  // ──────────────────────────────────────────────
  //  URL Parsing — parseUrl()
  // ──────────────────────────────────────────────

  describe('parseUrl', () => {
    it('should parse a post URL with activity ID', () => {
      const result = adapter.parseUrl(
        'https://www.linkedin.com/posts/johndoe_activity-7123456789012345678',
      );

      expect(result.isValid).toBe(true);
      expect(result.platform).toBe(Platform.LINKEDIN);
      expect(result.mediaId).toBe('7123456789012345678');
    });

    it('should parse a post URL with numeric ID only', () => {
      const result = adapter.parseUrl(
        'https://linkedin.com/posts/janedoe/7123456789012345678',
      );

      expect(result.isValid).toBe(true);
      expect(result.mediaId).toBe('7123456789012345678');
    });

    it('should parse a URN-based post URL', () => {
      const result = adapter.parseUrl(
        'https://www.linkedin.com/post/urn:li:activity:7123456789012345678',
      );

      expect(result.isValid).toBe(true);
      expect(result.mediaId).toBe('7123456789012345678');
    });

    it('should parse a feed URN URL', () => {
      const result = adapter.parseUrl(
        'https://www.linkedin.com/feed/urn:li:activity:7123456789012345678',
      );

      expect(result.isValid).toBe(true);
      expect(result.mediaId).toBe('7123456789012345678');
    });

    it('should parse a pulse/article URL', () => {
      const result = adapter.parseUrl(
        'https://www.linkedin.com/pulse/my-great-article-slug',
      );

      expect(result.isValid).toBe(true);
      expect(result.mediaId).toBe('pulse:my-great-article-slug');
    });

    it('should parse a URL with urn query parameter', () => {
      const result = adapter.parseUrl(
        'https://www.linkedin.com/posts/someone?urn=urn:li:activity:1234567890123456789',
      );

      expect(result.isValid).toBe(true);
      expect(result.mediaId).toBe('1234567890123456789');
    });

    it('should reject a profile URL', () => {
      const result = adapter.parseUrl('https://www.linkedin.com/in/johndoe');

      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject a non-LinkedIn URL', () => {
      const result = adapter.parseUrl('https://twitter.com/user/status/123');

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Unrecognised');
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
      const parsedUrl = adapter.parseUrl('https://www.linkedin.com/in/johndoe');

      await expect(adapter.extractMetadata(parsedUrl)).rejects.toThrow(
        'Cannot extract metadata from invalid URL',
      );
    });
  });
});
