import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { I18nProvider } from './i18n';
import { installPlatformBridge } from './platform';
import { installInteractionFeedback } from './platform/haptics';
import './styles.css';

installPlatformBridge();
installInteractionFeedback();

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><I18nProvider><App /></I18nProvider></React.StrictMode>);
