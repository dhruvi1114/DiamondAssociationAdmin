import { useEffect, useMemo } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import { StyleProvider } from '@ant-design/cssinjs';
import enGB from 'antd/locale/en_GB';
import { ToastHost } from '@/components/ui';
import { useBrandFavicon } from '@/hooks/useBranding';
import { useOrganisationDocumentTitle } from '@/hooks/useOrganisation';
import AppRoutes from '@/routes/AppRoutes';
import { useAppSelector } from '@/store';
import { buildAntdTheme } from '@/theme/antdTheme';
import { applyThemeMode } from '@/theme/cssVariables';

/**
 * `StyleProvider hashPriority="high"` emits AntD's styles as single-class
 * selectors instead of the usual `:where()` wrapper.
 *
 * That matters because Tailwind's preflight is disabled (AntD ships its own
 * reset) — without raising AntD's specificity to a plain class, a Tailwind
 * utility applied to an AntD component wins or loses unpredictably depending on
 * stylesheet order. This is the documented AntD + Tailwind pairing, and the
 * customer app uses the identical setup so the two render the same.
 */
export const App = () => {
  const themeMode = useAppSelector((state) => state.ui.themeMode);
  const antdTheme = useMemo(() => buildAntdTheme(themeMode), [themeMode]);

  /* The tab follows the association: its logo mark for the icon, its display
     name for the title — on every screen, including sign-in. */
  useBrandFavicon();
  useOrganisationDocumentTitle();

  useEffect(() => {
    applyThemeMode(themeMode);
  }, [themeMode]);

  return (
    <StyleProvider hashPriority="high">
      <ConfigProvider theme={antdTheme} locale={enGB}>
        <BrowserRouter>
          <AppRoutes />
          <ToastHost />
        </BrowserRouter>
      </ConfigProvider>
    </StyleProvider>
  );
};

export default App;
