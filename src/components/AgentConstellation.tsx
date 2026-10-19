import { useEffect, useState } from 'react';
import TiltedCard from './react-bits/TiltedCard';
import { agents } from '../data/agents';
import './AgentConstellation.css';

export default function AgentConstellation() {
  const [canTilt, setCanTilt] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine)');
    const hero = document.querySelector<HTMLElement>('.hero');
    const update = () => setCanTilt(preference.matches && hero?.dataset.motion === 'running');
    update();
    preference.addEventListener('change', update);
    document.addEventListener('lomi:hero-motion', update);
    return () => {
      preference.removeEventListener('change', update);
      document.removeEventListener('lomi:hero-motion', update);
    };
  }, []);

  return (
    <div className="agent-constellation" aria-hidden="true">
      {agents.map((agent) => (
        <div className={'agent-position agent-position--' + agent.id} key={agent.id} data-agent={agent.id}>
          <div className="agent-float">
            <TiltedCard
              containerWidth="100%"
              containerHeight="100%"
              imageWidth="100%"
              imageHeight="100%"
              rotateAmplitude={canTilt ? 12 : 0}
              scaleOnHover={canTilt ? 1.035 : 1}
              floating={false}
              gyroscope={false}
              intro={false}
              showTooltip={false}
              glare={canTilt ? 0.45 : 0}
              shadow={0}
              radius={17}
              className="agent-tilt"
              style={{ pointerEvents: canTilt ? 'auto' : 'none' }}
            >
              <div className={'agent-card agent-card--' + agent.id}>
                {agent.treatment === 'mono'
                  ? <span className="agent-card-icon agent-card-icon--mask" style={{ maskImage: 'url(/agents/' + agent.image + '.svg)', WebkitMaskImage: 'url(/agents/' + agent.image + '.svg)' }} />
                  : <img className="agent-card-icon" src={'/agents/' + agent.image + '.svg'} alt="" width="56" height="56" draggable={false} />}
                <span className="agent-card-name">{agent.name}</span>
              </div>
            </TiltedCard>
          </div>
        </div>
      ))}
    </div>
  );
}
