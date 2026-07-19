import { Test, TestingModule } from '@nestjs/testing';
import { Platform, MediaType, Quality } from '../../../../common/interfaces/platform.interface';
import { WhatsAppAdapter } from './whatsapp.adapter';

describe('WhatsAppAdapter', () => {
  let adapter: WhatsAppAdapter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsAppAdapter],
    }).compile();

    adapter = module.get<WhatsAppAdapter>(WhatsAppAdapter);
  });

  it('should be defined', () => {
    expect(adapter).toBeDefined();
  });

  describe('metadata', () => {
    it('should have correct platform identity', () => {
      expect(adapter.name).toBe(Platform.WHATSAPP);
      expect(adapter.displayName).toBe('WhatsApp');
    });

    it('should support video and image types', () => {
      const types = adapter.getSupportedTypes();
      expect(types).toContain(MediaType.VIDEO);
      expect(types).toContain(MediaType.IMAGE);
    });
  });

  describe('canHandle', () => {
    it('should accept web.whatsapp.com URLs', () => {
      expect(adapter.canHandle('https://web.whatsapp.com/')).toBe(true);
      expect(adapter.canHandle('https://web.whatsapp.com/send?phone=1234567890')).toBe(true);
    });

    it('should accept www.whatsapp.com URLs', () => {
      expect(adapter.canHandle('https://www.whatsapp.com/')).toBe(true);
      expect(adapter.canHandle('https://whatsapp.com/')).toBe(true);
    });

    it('should accept wa.me short links', () => {
      expect(adapter.canHandle('https://wa.me/1234567890')).toBe(true);
      expect(adapter.canHandle('http://wa.me/9876543210')).toBe(true);
    });

    it('should reject non-WhatsApp URLs', () => {
      expect(adapter.canHandle('https://www.youtube.com/watch?v=abc')).toBe(false);
      expect(adapter.canHandle('https://www.snapchat.com/spotlight/abc')).toBe(false);
      expect(adapter.canHandle('https://www.tiktok.com/@user/video/123')).toBe(false);
      expect(adapter.canHandle('https://telegram.org/')).toBe(false);
    });

    it('should reject empty or invalid input', () => {
      expect(adapter.canHandle('')).toBe(false);
      expect(adapter.canHandle('not a url')).toBe(false);
    });
  });

  describe('parseUrl', () => {
    it('should parse web.whatsapp.com URLs', () => {
      const result = adapter.parseUrl('https://web.whatsapp.com/');
      expect(result.isValid).toBe(true);
      expect(result.platform).toBe(Platform.WHATSAPP);
    });

    it('should parse wa.me short links', () => {
      const result = adapter.parseUrl('https://wa.me/1234567890');
      expect(result.isValid).toBe(true);
      expect(result.platform).toBe(Platform.WHATSAPP);
      expect(result.mediaId).toContain('contact_');
    });

    it('should parse general whatsapp.com URLs', () => {
      const result = adapter.parseUrl('https://www.whatsapp.com/faq');
      expect(result.isValid).toBe(true);
      expect(result.platform).toBe(Platform.WHATSAPP);
    });

    it('should return invalid for empty URL', () => {
      const result = adapter.parseUrl('');
      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should normalize HTTP to HTTPS', () => {
      const result = adapter.parseUrl('http://web.whatsapp.com/');
      expect(result.isValid).toBe(true);
      expect(result.normalizedUrl).toMatch(/^https:\/\//);
    });
  });

  describe('extractMetadata', () => {
    it('should return isDownloadable: false when account is not linked', async () => {
      const parsedUrl = {
        originalUrl: 'https://web.whatsapp.com/',
        platform: Platform.WHATSAPP,
        mediaId: 'test',
        normalizedUrl: 'https://web.whatsapp.com/',
        isValid: true,
      };

      const metadata = await adapter.extractMetadata(parsedUrl);

      expect(metadata.isDownloadable).toBe(false);
      expect(metadata.platform).toBe(Platform.WHATSAPP);
      expect(metadata.variants).toHaveLength(0);
      expect(metadata.restrictionReason).toBeDefined();
      expect(metadata.restrictionReason).toContain('account linking');
    });

    it('should include privacy-focused restriction message', async () => {
      const parsedUrl = {
        originalUrl: 'https://web.whatsapp.com/',
        platform: Platform.WHATSAPP,
        mediaId: 'test',
        normalizedUrl: 'https://web.whatsapp.com/',
        isValid: true,
      };

      const metadata = await adapter.extractMetadata(parsedUrl);

      expect(metadata.restrictionReason).toContain('end-to-end encryption');
      expect(metadata.restrictionReason).toContain('OWN WhatsApp Status');
      expect(metadata.restrictionReason).toContain('consent');
    });
  });

  describe('download', () => {
    it('should throw an error explaining account linking requirement', async () => {
      const parsedUrl = {
        originalUrl: 'https://web.whatsapp.com/',
        platform: Platform.WHATSAPP,
        mediaId: 'test',
        normalizedUrl: 'https://web.whatsapp.com/',
        isValid: true,
      };

      await expect(
        adapter.download(parsedUrl, Quality.HIGHEST, '/tmp'),
      ).rejects.toThrow('WhatsApp media download is not currently available');
    });

    it('should mention encryption in the error message', async () => {
      const parsedUrl = {
        originalUrl: 'https://web.whatsapp.com/',
        platform: Platform.WHATSAPP,
        mediaId: 'test',
        normalizedUrl: 'https://web.whatsapp.com/',
        isValid: true,
      };

      await expect(
        adapter.download(parsedUrl, Quality.HIGHEST, '/tmp'),
      ).rejects.toThrow('end-to-end encryption');
    });
  });

  describe('privacy design', () => {
    it('should report account as not linked by default', () => {
      expect(adapter.isAccountLinked()).toBe(false);
    });

    it('should clear thumbnail cache without error', () => {
      expect(() => adapter.clearThumbnailCache()).not.toThrow();
    });
  });

  describe('isAvailable', () => {
    it('should return a boolean', async () => {
      const result = await adapter.isAvailable();
      expect(typeof result).toBe('boolean');
    });
  });
});
