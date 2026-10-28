import { PanelSection, PanelSectionRow, SliderField, ToggleField, staticClasses } from '@decky/ui';
import { definePlugin } from '@decky/api';
import { useState } from 'react';
import { HeroTrailers } from './HeroTrailers';
import { NameLogos } from './NameLogos';
import { loadSettings, saveSettings, type Settings } from './settings';

let settings: Settings = loadSettings();
const trailers = new HeroTrailers(() => settings);
const logos = new NameLogos(() => settings);

/** Ícone do painel: claquete de filme com "play", no mesmo desenho de assets/icon.svg (cor herdada do tema). */
const PluginIcon = () => (
  <svg viewBox="0 0 512 512" width="1em" height="1em" fill="currentColor" aria-hidden="true">
    <path fillRule="evenodd" d="M112 16h288c53 0 96 43 96 96v288c0 53-43 96-96 96H112c-53 0-96-43-96-96V112c0-53 43-96 96-96zm-24 72a10 10 0 0 0-10 10v24a10 10 0 0 0 10 10h24a10 10 0 0 0 10-10V98a10 10 0 0 0-10-10zm0 68a10 10 0 0 0-10 10v24a10 10 0 0 0 10 10h24a10 10 0 0 0 10-10v-24a10 10 0 0 0-10-10zm0 68a10 10 0 0 0-10 10v24a10 10 0 0 0 10 10h24a10 10 0 0 0 10-10v-24a10 10 0 0 0-10-10zm0 68a10 10 0 0 0-10 10v24a10 10 0 0 0 10 10h24a10 10 0 0 0 10-10v-24a10 10 0 0 0-10-10zm0 68a10 10 0 0 0-10 10v24a10 10 0 0 0 10 10h24a10 10 0 0 0 10-10v-24a10 10 0 0 0-10-10zm336-272a10 10 0 0 0-10 10v24a10 10 0 0 0 10 10h24a10 10 0 0 0 10-10V98a10 10 0 0 0-10-10zm0 68a10 10 0 0 0-10 10v24a10 10 0 0 0 10 10h24a10 10 0 0 0 10-10v-24a10 10 0 0 0-10-10zm0 68a10 10 0 0 0-10 10v24a10 10 0 0 0 10 10h24a10 10 0 0 0 10-10v-24a10 10 0 0 0-10-10zm0 68a10 10 0 0 0-10 10v24a10 10 0 0 0 10 10h24a10 10 0 0 0 10-10v-24a10 10 0 0 0-10-10zm0 68a10 10 0 0 0-10 10v24a10 10 0 0 0 10 10h24a10 10 0 0 0 10-10v-24a10 10 0 0 0-10-10zM206 166v180l154-90z" />
  </svg>
);

function Content() {
  const [current, setCurrent] = useState(settings);
  const change = (patch: Partial<Settings>) => {
    settings = { ...settings, ...patch };
    saveSettings(settings);
    setCurrent(settings);
  };
  return (
    <>
    <PanelSection title="Game page">
      <PanelSectionRow>
        <ToggleField label="Play trailers" description="Replaces the hero image." checked={current.enabled} onChange={enabled => change({ enabled })} />
      </PanelSectionRow>
      <PanelSectionRow>
        <SliderField label="Start after" description="Seconds on the game page." value={current.delaySeconds} min={1} max={15} step={1} showValue valueSuffix=" s" onChange={delaySeconds => change({ delaySeconds })} />
      </PanelSectionRow>
    </PanelSection>
    <PanelSection title="Game selection">
      <PanelSectionRow>
        <ToggleField label="Play trailers" description="Home background, for the focused game." checked={current.selectionEnabled} onChange={selectionEnabled => change({ selectionEnabled })} />
      </PanelSectionRow>
      <PanelSectionRow>
        <SliderField label="Start after" description="Seconds with the same game focused." value={current.selectionDelaySeconds} min={3} max={30} step={1} showValue valueSuffix=" s" onChange={selectionDelaySeconds => change({ selectionDelaySeconds })} />
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField label="Logo instead of name" description="Shows the focused game's logo; without one, the name stays." checked={current.selectionLogo} onChange={selectionLogo => change({ selectionLogo })} />
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField label="Pin to the left corner" description="Logo above the first card instead of the focused card." checked={current.logoFixedLeft} disabled={!current.selectionLogo} onChange={logoFixedLeft => change({ logoFixedLeft })} />
      </PanelSectionRow>
      <PanelSectionRow>
        <SliderField label="Logo size" description="Height in pixels." value={current.logoHeight} min={30} max={200} step={5} showValue valueSuffix=" px" disabled={!current.selectionLogo} onChange={logoHeight => change({ logoHeight })} />
      </PanelSectionRow>
      <PanelSectionRow>
        <SliderField label="Logo shadow" description="Soft black shadow behind the logo (0 = none)." value={current.logoShadow} min={0} max={100} step={5} showValue disabled={!current.selectionLogo} onChange={logoShadow => change({ logoShadow })} />
      </PanelSectionRow>
      <PanelSectionRow>
        <SliderField label="Horizontal offset" description="Pixels to the right (negative = left)." value={current.logoOffsetX} min={-300} max={300} step={1} showValue valueSuffix=" px" disabled={!current.selectionLogo} onChange={logoOffsetX => change({ logoOffsetX })} />
      </PanelSectionRow>
      <PanelSectionRow>
        <SliderField label="Vertical offset" description="Pixels down (negative = up)." value={current.logoOffsetY} min={-300} max={300} step={1} showValue valueSuffix=" px" disabled={!current.selectionLogo} onChange={logoOffsetY => change({ logoOffsetY })} />
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField label="Hide last played" description="Removes the text under the focused game's name." checked={current.hideLastPlayed} onChange={hideLastPlayed => change({ hideLastPlayed })} />
      </PanelSectionRow>
    </PanelSection>
    <PanelSection title="General">
      <PanelSectionRow>
        <ToggleField label="Sound" checked={current.sound} onChange={sound => change({ sound })} />
      </PanelSectionRow>
    </PanelSection>
    </>
  );
}

export default definePlugin(() => {
  trailers.start();
  logos.start();
  (window as any).__trailerHero = trailers;
  (window as any).__trailerLogos = logos; // diagnóstico: __trailerHero.status
  return {
    name: 'Trailer Hero',
    titleView: <div className={staticClasses.Title}>Trailer Hero</div>,
    content: <Content />,
    icon: <PluginIcon />,
    onDismount() {
      trailers.stop();
      logos.stop();
      delete (window as any).__trailerHero;
      delete (window as any).__trailerLogos;
    },
  };
});
