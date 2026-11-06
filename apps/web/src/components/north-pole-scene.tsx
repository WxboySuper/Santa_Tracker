'use client';

import { useEffect, useRef, useState } from 'react';

const litWindows = new Set([0, 1, 3, 4, 6, 7, 9]);

function windowName(template: string, number: number): string {
  return template.replace('{number}', String(number));
}

export default function NorthPoleScene({
  label,
  windowOnLabel,
  windowOffLabel,
}: {
  label: string;
  windowOnLabel: string;
  windowOffLabel: string;
}) {
  const sceneRef = useRef<SVGSVGElement>(null);
  const [lit, setLit] = useState(litWindows);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const updateVisibility = () => setIsVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', updateVisibility);
    updateVisibility();
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let frame = 0;
    let nextX = 0;
    let nextY = 0;
    let currentX = 0;
    let currentY = 0;
    const paint = () => {
      currentX += (nextX - currentX) * 0.12;
      currentY += (nextY - currentY) * 0.12;
      scene.style.setProperty('--back-x', `${currentX * 0.2}px`);
      scene.style.setProperty('--mid-x', `${currentX * 0.45}px`);
      scene.style.setProperty('--front-x', `${currentX}px`);
      scene.style.setProperty('--back-y', `${currentY * 0.2}px`);
      scene.style.setProperty('--mid-y', `${currentY * 0.45}px`);
      scene.style.setProperty('--front-y', `${currentY}px`);
      if (Math.abs(nextX - currentX) > 0.1 || Math.abs(nextY - currentY) > 0.1) {
        frame = window.requestAnimationFrame(paint);
      } else {
        frame = 0;
      }
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(paint);
    };
    const pointerMove = (event: PointerEvent) => {
      nextX = ((event.clientX / window.innerWidth) - 0.5) * -18;
      nextY = ((event.clientY / window.innerHeight) - 0.5) * -10;
      schedule();
    };
    const scroll = () => {
      nextY = Math.max(-12, Math.min(12, window.scrollY * -0.018));
      schedule();
    };
    window.addEventListener('pointermove', pointerMove, { passive: true });
    window.addEventListener('scroll', scroll, { passive: true });
    return () => {
      window.removeEventListener('pointermove', pointerMove);
      window.removeEventListener('scroll', scroll);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  const toggleWindow = (number: number) => {
    setLit(previous => {
      const next = new Set(previous);
      if (next.has(number)) next.delete(number);
      else next.add(number);
      return next;
    });
  };

  const windowControl = (number: number, x: number, y: number, width = 28) => {
    const isLit = lit.has(number);
    const activate = () => toggleWindow(number);
    return (
      <g
        key={number}
        className={`village-window${isLit ? ' is-lit' : ''}`}
        role="button"
        tabIndex={0}
        aria-pressed={isLit}
        aria-label={windowName(isLit ? windowOffLabel : windowOnLabel, number + 1)}
        onClick={activate}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            activate();
          }
        }}
      >
        <rect x={x} y={y} width={width} height="24" rx="2" className="window-glass" />
        <path d={`M${x + width / 2} ${y}v24M${x} ${y + 12}h${width}`} className="window-mullion" />
        <rect x={x - 10} y={y - 8} width={width + 20} height="46" rx="8" className="window-focus" />
      </g>
    );
  };

  return (
    <svg
      ref={sceneRef}
      className={`north-pole-scene${isVisible ? '' : ' is-paused'}`}
      viewBox="0 0 1440 860"
      role="group"
      aria-label={label}
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="village-sky" x2=".15" y2="1">
          <stop stopColor="#0b1530" />
          <stop offset=".52" stopColor="#15364c" />
          <stop offset="1" stopColor="#315c66" />
        </linearGradient>
        <linearGradient id="village-snow" x2="0" y2="1">
          <stop stopColor="#f1eee0" />
          <stop offset="1" stopColor="#a8c3c8" />
        </linearGradient>
        <linearGradient id="aurora-teal" x2="0" y2="1">
          <stop stopColor="#b8f4d7" stopOpacity="0" />
          <stop offset=".48" stopColor="#65e3c0" stopOpacity=".48" />
          <stop offset="1" stopColor="#79c9ed" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="aurora-blue" x2="0" y2="1">
          <stop stopColor="#b3d9ff" stopOpacity="0" />
          <stop offset=".48" stopColor="#85bdf3" stopOpacity=".34" />
          <stop offset="1" stopColor="#a6e8d5" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="warm-window">
          <stop stopColor="#fff4bb" />
          <stop offset=".56" stopColor="#f5bd68" />
          <stop offset="1" stopColor="#d4854f" />
        </radialGradient>
        <radialGradient id="village-vignette">
          <stop offset=".35" stopColor="#091326" stopOpacity="0" />
          <stop offset="1" stopColor="#07101f" stopOpacity=".7" />
        </radialGradient>
        <filter id="window-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
        <filter id="aurora-soften" x="-20%" y="-30%" width="140%" height="160%">
          <feGaussianBlur stdDeviation="18" />
        </filter>
      </defs>

      <rect width="1440" height="860" fill="url(#village-sky)" />
      <g className="aurora-ribbon aurora-ribbon-teal" filter="url(#aurora-soften)">
        <path d="M-110 180C150 50 278 278 520 174s363-7 526-74 265-16 483 69v120c-223-84-313-46-489-10s-306 56-513 7S187 273-110 324Z" fill="url(#aurora-teal)" />
      </g>
      <g className="aurora-ribbon aurora-ribbon-blue" filter="url(#aurora-soften)">
        <path d="M-40 246c225-162 377-18 592-47s280-129 495-96 288 91 431 37v114c-172 79-291 2-454-10s-329 87-502 93S224 286-40 368Z" fill="url(#aurora-blue)" />
      </g>

      <g fill="#f8eaca" aria-hidden="true">
        <circle cx="101" cy="93" r="2" /><circle cx="188" cy="176" r="1.5" />
        <circle cx="322" cy="81" r="2" /><circle cx="440" cy="149" r="1.4" />
        <circle cx="580" cy="70" r="2" /><circle cx="677" cy="202" r="1.5" />
        <circle cx="799" cy="105" r="1.4" /><circle cx="910" cy="67" r="2" />
        <circle cx="1051" cy="154" r="1.6" /><circle cx="1174" cy="77" r="2" />
        <circle cx="1323" cy="182" r="1.5" /><circle cx="1386" cy="98" r="2" />
        <circle cx="252" cy="260" r="1.5" /><circle cx="1118" cy="268" r="1.5" />
        <path d="M731 72v12m-6-6h12" stroke="#f8eaca" strokeWidth="1" />
        <path d="M1262 228v11m-5.5-5.5h11" stroke="#f8eaca" strokeWidth="1" />
      </g>

      <g className="scene-layer scene-mountains-back" aria-hidden="true">
        <path d="m0 442 142-142 95 104 119-154 155 168 143-111 177 143 137-169 151 166 121-111 200 125v259H0Z" fill="#253d52" />
        <path d="m260 322 96-72 74 89-66-35-22 21-24-22Z" fill="#a7c5cb" opacity=".78" />
        <path d="m656 345 31-38 42 45-36-15-14 17Z" fill="#b6ced0" opacity=".55" />
        <path d="m1060 337 42-50 55 61-43-22-22 24Z" fill="#b6ced0" opacity=".62" />
      </g>
      <g className="scene-layer scene-mountains-mid" aria-hidden="true">
        <path d="m0 510 126-111 105 83 110-71 101 87 116-123 131 114 112-78 118 89 113-108 99 83 123-58 86 62v302H0Z" fill="#1b3547" />
        <path d="M0 552q190-72 354 4t346-10 382 16 358-28v326H0Z" fill="#1b3b49" />
      </g>

      <g className="scene-layer village-houses">
        <g className="house house-cabin">
          <path d="M143 548v-97l89-76 93 76v97Z" fill="#69493f" />
          <path d="m124 458 108-102 113 102-26 7-87-73-82 73Z" fill="#243c43" />
          <path d="M275 403v-49h25v70Z" fill="#70594b" />
          <path d="M270 354c0-17 19-17 17-34 22 16 3 27 18 33-7 11-24 11-35 1Z" className="smoke-puff" />
          <path d="M231 472v75" stroke="#3e2f31" strokeWidth="5" />
          {windowControl(0, 171, 476, 27)}{windowControl(1, 255, 476, 27)}
          <path d="M218 548v-45q14-21 28 0v45Z" fill="#392d31" />
          <path d="M128 454q101 25 211 0" fill="none" stroke="#e2dfcc" strokeWidth="8" />
        </g>
        <g className="house house-tall">
          <path d="M394 552V434l78-67 82 67v118Z" fill="#785345" />
          <path d="m377 439 96-91 99 91-23 6-76-70-74 70Z" fill="#30494a" />
          <path d="M495 400v-65h22v82Z" fill="#6d5549" />
          {windowControl(2, 418, 456, 23)}{windowControl(3, 493, 456, 23)}
          <path d="M451 552v-54q20-25 40 0v54Z" fill="#3a2e31" />
          <path d="M381 435q94 20 193 0" fill="none" stroke="#d9dfd5" strokeWidth="8" />
        </g>
        <g className="house house-broad">
          <path d="M590 567V457l93-80 100 80v110Z" fill="#63463e" />
          <path d="m572 463 111-102 119 102-24 7-95-79-91 79Z" fill="#263f45" />
          <path d="M625 458h117v22H625z" fill="#714f43" />
          {windowControl(4, 613, 479, 25)}{windowControl(5, 706, 479, 25)}
          <path d="M666 567v-45q19-22 38 0v45Z" fill="#382c30" />
          <path d="M577 458q106 21 220 0" fill="none" stroke="#e1e1d6" strokeWidth="8" />
        </g>
        <g className="house house-cabin house-small">
          <path d="M830 555v-88l73-65 76 65v88Z" fill="#795545" />
          <path d="m815 471 88-82 94 82-22 6-72-63-69 63Z" fill="#2d4649" />
          <path d="M884 480v69" stroke="#3d2f30" strokeWidth="4" />
          {windowControl(6, 850, 482, 24)}{windowControl(7, 922, 482, 24)}
          <path d="M881 555v-44q17-20 34 0v44Z" fill="#3a2d31" />
          <path d="M815 465q88 20 182 0" fill="none" stroke="#dfe2d8" strokeWidth="7" />
        </g>
        <g className="house house-tower">
          <path d="M1031 550V428l69-74 74 74v122Z" fill="#684a41" />
          <path d="m1016 435 84-91 90 91-20 5-70-72-66 72Z" fill="#2b4245" />
          <path d="M1090 372v-67h20v87Z" fill="#70564b" />
          {windowControl(8, 1055, 451, 22)}{windowControl(9, 1124, 451, 22)}
          <path d="M1081 550v-51q18-23 36 0v51Z" fill="#382d31" />
          <path d="M1019 430q80 19 170 0" fill="none" stroke="#dce2d8" strokeWidth="7" />
        </g>
        <g className="house house-round">
          <path d="M1222 558v-89q73-73 146 0v89Z" fill="#765348" />
          <path d="M1208 470q87-106 174 0l-23 7q-64-77-128 0Z" fill="#2b454a" />
          <path d="M1295 404v-52h20v75Z" fill="#70574a" />
          {windowControl(10, 1242, 478, 25)}{windowControl(11, 1322, 478, 25)}
          <path d="M1286 558v-44q18-22 36 0v44Z" fill="#3a2d31" />
          <path d="M1212 466q86 25 170 0" fill="none" stroke="#dfe3d9" strokeWidth="8" />
        </g>
      </g>

      <g className="scene-layer forest-back" aria-hidden="true" fill="#173941">
        <path d="m23 591 50-105 49 105H91l48 82H10l48-82Z" />
        <path d="m331 595 39-84 40 84h-25l38 69h-108l39-69Z" />
        <path d="m763 595 47-101 48 101h-31l45 81H744l50-81Z" />
        <path d="m1173 582 58-124 57 124h-37l54 93h-148l55-93Z" />
        <path d="m1384 600 39-84 40 84h-26l38 72h-105l38-72Z" />
      </g>
      <g className="scene-layer forest-front" aria-hidden="true" fill="#102c36">
        <path d="m0 665 56-118 57 118H77l54 95H-18l59-95Z" />
        <path d="m266 671 53-113 52 113h-34l47 84H251l48-84Z" />
        <path d="m510 680 40-87 43 87h-27l39 70h-108l39-70Z" />
        <path d="m965 672 54-119 54 119h-36l50 89H949l51-89Z" />
        <path d="m1321 673 55-120 57 120h-36l49 89h-148l52-89Z" />
      </g>

      <g className="scene-layer drifting-snow" fill="#f8ffff" aria-hidden="true">
        <circle cx="114" cy="324" r="3" /><circle cx="289" cy="529" r="2.4" />
        <circle cx="370" cy="299" r="2" /><circle cx="552" cy="541" r="2.5" />
        <circle cx="722" cy="380" r="2.4" /><circle cx="915" cy="313" r="3" />
        <circle cx="1023" cy="539" r="2" /><circle cx="1200" cy="345" r="2.5" />
        <circle cx="1358" cy="420" r="2" /><circle cx="184" cy="690" r="2" />
        <circle cx="454" cy="707" r="2.8" /><circle cx="839" cy="703" r="2" />
        <circle cx="1113" cy="691" r="2.8" /><circle cx="1284" cy="747" r="2" />
      </g>
      <path d="M0 690q157-47 312-8 136 34 261 6 137-31 283 6 141 37 278-2 171-48 306 9v159H0Z" fill="url(#village-snow)" />
      <path d="M0 744q176-44 359-3t326 4 328-6 427 11" fill="none" stroke="#fff" strokeOpacity=".54" strokeWidth="4" />
      <rect width="1440" height="860" fill="url(#village-vignette)" pointerEvents="none" />
    </svg>
  );
}
