import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { installPlatformBridge } from './platform';
import { installInteractionFeedback } from './platform/haptics';
import './styles.css';

installPlatformBridge();
installInteractionFeedback();

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
