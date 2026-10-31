import { createRoot } from 'react-dom/client';
import '../../design/tokens.css';
import './design/base.css';
import './design/app.css';
import { App } from './app/App';
import { installProbe } from './audio/probe';

document.documentElement.dataset.platform = window.howl.system.platform;
installProbe();
createRoot(document.getElementById('root')!).render(<App />);
