import { useEffect, useReducer } from 'react';
import SettingsService from '@/services/settingsService';

/**
 * The association's own name, for the parts of the shell that are not a page.
 *
 * Read from `/public/settings` rather than the admin settings list: that list is
 * behind `settings.manage` + super admin, and the browser tab is on screen for
 * every staff member and on the sign-in screen, where there is no session at
 * all. `organisation.name` is flagged `is_public` in the seed, and its own
 * description names this as the use — "used in emails, invoices and page titles".
 *
 * Fetched once per page load and held at module level. It is one small request
 * and the answer is the same for every component that asks.
 */

const DISPLAY_NAME_KEY = 'organisation.name';

let displayName: string | null = null;
let requested = false;
const listeners = new Set<() => void>();

const load = () => {
  if (requested) {
    return;
  }

  requested = true;

  void SettingsService.publicList()
    .then((res) => {
      const value = res.data.find((row) => row.key === DISPLAY_NAME_KEY)?.value.trim();

      // Only a non-empty answer replaces the fallback: an association that has
      // blanked the field should get the shipped title, not an empty tab.
      if (value) {
        displayName = value;
        listeners.forEach((listener) => listener());
      }
    })
    .catch(() => {
      // Silent by design. A tab that cannot be renamed is not worth a toast, and
      // the fallback below is already a correct title.
      requested = false;
    });
};

/** Re-read after a save — the display name is editable on the settings screen. */
export const refreshOrganisation = () => {
  requested = false;
  load();
};

/** The saved display name, or `null` until it arrives. */
export const useOrganisationName = (): string | null => {
  const [, rerender] = useReducer((count: number) => count + 1, 0);

  useEffect(() => {
    listeners.add(rerender);
    load();

    return () => {
      listeners.delete(rerender);
    };
  }, []);

  return displayName;
};

/** Shipped title, and the suffix that keeps the tab distinct from the member portal. */
const FALLBACK_NAME = 'Association';
const SUFFIX = 'Admin';

/**
 * Name the browser tab after the association.
 *
 * `"<display name> Admin"`, not the display name alone: an operator commonly has
 * this and the member portal open side by side, and two tabs reading "ILGDA"
 * cannot be told apart. Mounted once in `App`, so it covers sign-in too.
 */
export const useOrganisationDocumentTitle = () => {
  const name = useOrganisationName();

  useEffect(() => {
    document.title = `${name ?? FALLBACK_NAME} ${SUFFIX}`;
  }, [name]);
};
