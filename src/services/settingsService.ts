import { ENDPOINTS } from '@/constant/endpoints';
import { BaseService } from '@/services/BaseService';

/** How to parse `value` — the row never says what shape it is in, this does. */
export type SettingValueType = 'STRING' | 'NUMBER' | 'BOOLEAN' | 'JSON';

export interface SystemSetting {
  key: string;
  /** Always a string on the wire, whatever `value_type` says it means. */
  value: string;
  value_type: SettingValueType;
  group: string;
  description: string | null;
  is_public: boolean;
  /**
   * Whether THIS API will accept a write. Computed server-side from the
   * validation allow-list rather than stored, so the screen never offers a
   * control the API would refuse.
   */
  editable: boolean;
  updatedAt: string;
}

export interface SettingChange {
  key: string;
  value: string;
}

/** The two images the platform holds. The URL segment, not the setting key. */
export type BrandingSlot = 'logo' | 'logo-mark';

export interface BrandingUploadResult {
  key: string;
  value: string;
  mime: string;
  size: number;
}

/** The public subset: value only, none of the admin-facing commentary. */
export interface PublicSetting {
  key: string;
  value: string;
  value_type: SettingValueType;
}

export const SettingsService = {
  list: () => BaseService.get<SystemSetting[]>(ENDPOINTS.SETTINGS),

  /**
   * The `is_public` rows. Callable with no session and by any role — the full
   * list is super-admin only, and the tab has to be named for everyone else too.
   */
  publicList: () => BaseService.get<PublicSetting[]>(ENDPOINTS.PUBLIC_SETTINGS),

  /**
   * One request for the whole batch. The screen commits everything the admin
   * changed in a single press, and the server applies them in a transaction —
   * so a dropped connection leaves the settings exactly as they were rather
   * than half-applied.
   */
  update: (settings: SettingChange[]) =>
    BaseService.patch<{ updated: number }>(ENDPOINTS.SETTINGS, { settings }),

  /**
   * Replace a branding image.
   *
   * Its own call, not part of the batch save: the value is a storage key the
   * server decides, so there is nothing for the form to hold in its draft. The
   * upload IS the save — press it and the logo has changed.
   */
  uploadBranding: (slot: BrandingSlot, file: File) => {
    const body = new FormData();

    body.append('file', file);

    return BaseService.post<BrandingUploadResult>(ENDPOINTS.brandingUpload(slot), body);
  },

  removeBranding: (slot: BrandingSlot) =>
    BaseService.delete<{ key: string; value: string }>(ENDPOINTS.brandingUpload(slot)),
};

export default SettingsService;
