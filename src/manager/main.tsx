import {StrictMode, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {PresetsPage} from './PresetsPage';
import {WorksPage} from './WorksPage';
import {WorkPage} from './WorkPage';
import {ServicesPage} from './ServicesPage';
import {text} from './text';
import './styles.css';

type Area = 'presets' | 'assets' | 'services';
// Three areas, each with its own data: presets (presets.json), the works' assets (works/<work>/), image services (image-presets.json).
// The address remembers the area and the open work, so a reload stays where it was.
function App() {
  const [area, setArea] = useState<Area>(location.hash.startsWith('#works') ? 'assets' : location.hash === '#services' ? 'services' : 'presets');
  const [work, setWork] = useState<string | null>(() => /^#works\/(.+)$/.exec(location.hash)?.[1] ?? null);
  const go = (next: Area, id: string | null = null) => {
    setArea(next);setWork(id);
    history.replaceState(null, '', next === 'presets' ? '#presets' : next === 'services' ? '#services' : id ? `#works/${id}` : '#works');
  };
  return (
    <>
      <header className="top">
        <div className="brand">vnify.<small>{text.brand}</small></div>
        <nav className="areas" aria-label={text.brand}>
          <button aria-current={area === 'presets' ? 'page' : undefined} onClick={() => go('presets')}>{text.areas.presets}</button>
          <button aria-current={area === 'assets' ? 'page' : undefined} onClick={() => go('assets')}>{text.areas.assets}</button>
          <button aria-current={area === 'services' ? 'page' : undefined} onClick={() => go('services')}>{text.areas.services}</button>
        </nav>
      </header>
      {area === 'presets' ? <PresetsPage /> : area === 'services' ? <ServicesPage />
        : work ? <WorkPage key={work} id={decodeURIComponent(work)} onBack={() => go('assets')} />
          : <WorksPage onOpen={id => go('assets', encodeURIComponent(id))} />}
    </>
  );
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
