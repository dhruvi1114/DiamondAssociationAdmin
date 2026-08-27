import { useEffect, useReducer } from 'react';
import { ENDPOINTS } from '@/constant/endpoints';
import { API_ORIGIN } from '@/services/BaseService';
import type { BrandingSlot } from '@/services/settingsService';

/**
 * Whether the association has uploaded an image into a branding slot, and the
 * URL to draw it from.
 *
 * Resolved by *loading the image*, not by reading SystemSettings. The settings
 * list is behind `settings.manage` + super admin, and the sidebar is on screen
 * for every staff member — a permission-gated read would leave most of the app
 * with no logo at all. `/public/branding/:slot` is unauthenticated and 404s when
 * the slot is empty, so a load either succeeds (draw it) or fails (fall back to
 * the bundled asset). One probe answers both questions.
 *
 * State is module-level rather than per-component: the shell, the sign-in screen
 * and the settings preview all ask for the same two images, and a probe per
 * mount would re-ask on every navigation.
 */

type SlotStatus = 'unknown' | 'present' | 'absent';

const status: Record<BrandingSlot, SlotStatus> = {
  logo: 'unknown',
  'logo-mark': 'unknown',
  signature: 'unknown',
};
const inFlight = new Set<BrandingSlot>();
const listeners = new Set<() => void>();

/**
 * Bumped on upload and removal, and appended to the URL.
 *
 * The public URL is fixed per slot, so a replaced logo would keep serving the
 * old bytes out of the browser cache until the ETag revalidated — the admin
 * uploads and the sidebar does not change. A different URL cannot be cached.
 */
let version = 0;

const notify = () => {
  listeners.forEach((listener) => listener());
};

/* Absolute: the API is a separate origin, and the browser fetches this one itself. */
const urlFor = (slot: BrandingSlot) => `${API_ORIGIN}${ENDPOINTS.brandingImage(slot)}?v=${version}`;

const probe = (slot: BrandingSlot) => {
  if (inFlight.has(slot)) {
    return;
  }

  inFlight.add(slot);

  const image = new Image();
  const settle = (next: SlotStatus) => () => {
    inFlight.delete(slot);
    status[slot] = next;
    notify();
  };

  image.onload = settle('present');
  image.onerror = settle('absent');
  image.src = urlFor(slot);
};

/**
 * Re-probe both slots — call after an upload or a removal.
 *
 * Exported for `SystemSettings`, which is the only screen that changes these
 * images. Without it the admin uploads a logo and the rail beside them keeps
 * showing the old one until a reload.
 */
export const refreshBranding = () => {
  version += 1;
  inFlight.clear();
  status.logo = 'unknown';
  status['logo-mark'] = 'unknown';
  notify();

  probe('logo');
  probe('logo-mark');
};

/** The uploaded image's URL, or `null` while unknown and when the slot is empty. */
export const useBrandingImage = (slot: BrandingSlot): string | null => {
  const [, rerender] = useReducer((count: number) => count + 1, 0);

  useEffect(() => {
    listeners.add(rerender);

    if (status[slot] === 'unknown') {
      probe(slot);
    }

    return () => {
      listeners.delete(rerender);
    };
  }, [slot]);

  return status[slot] === 'present' ? urlFor(slot) : null;
};

/**
 * The shipped ILGDA mark, used for the tab until an association uploads its own.
 *
 * Its own file rather than `logo.png` or `diamond.png`: the lockup is 3:1 and
 * turns to mush at 16px, and `diamond.png` is the sign-in render — a soft, wide
 * illustration that reads as a grey smudge in a tab. This is the diamond cropped
 * out of the lockup at `BrandGlyph`'s measured ink bounds, squared, and set on a
 * white rounded plate so it stays legible on a dark tab strip as well as a
 * light one — a favicon cannot follow the theme, so it has to carry its own.
 */
const FALLBACK_FAVICON = '/brand/favicon.png';

/**
 * Point the browser tab at the uploaded logo mark.
 *
 * The mark, not the logo: a favicon is rendered at 16px, where a wordmark is a
 * grey smear. Mounted once in `App`, so the sign-in tab is branded too.
 */
export const useBrandFavicon = () => {
  const mark = useBrandingImage('logo-mark');

  useEffect(() => {
    const href = mark ?? FALLBACK_FAVICON;

    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");

    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }

    if (link.getAttribute('href') !== href) {
      link.setAttribute('href', href);
    }
  }, [mark]);
};
