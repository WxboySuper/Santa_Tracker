export default function NorthPoleScene({ label }: { label: string }) {
  return (
    <svg
      className="north-pole-scene"
      viewBox="0 0 1200 420"
      role="img"
      aria-label={label}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="night" x2="0" y2="1">
          <stop stopColor="#14243a" />
          <stop offset="1" stopColor="#24384a" />
        </linearGradient>
        <linearGradient id="snow" x2="0" y2="1">
          <stop stopColor="#edf4f1" />
          <stop offset="1" stopColor="#b9ccd0" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect width="1200" height="420" rx="22" fill="url(#night)" />
      <g fill="#f8ead0" opacity=".8">
        <circle cx="95" cy="64" r="2" />
        <circle cx="243" cy="112" r="2" />
        <circle cx="422" cy="55" r="2" />
        <circle cx="958" cy="73" r="2" />
        <circle cx="1085" cy="122" r="2" />
      </g>
      <g fill="#d9e8e7" opacity=".85">
        <circle className="scene-snow snow-a" cx="184" cy="159" r="4" />
        <circle className="scene-snow snow-b" cx="511" cy="112" r="3" />
        <circle className="scene-snow snow-c" cx="1001" cy="171" r="4" />
        <circle className="scene-snow snow-a" cx="759" cy="88" r="3" />
        <circle className="scene-snow snow-b" cx="329" cy="210" r="3" />
      </g>
      <path
        d="M0 306 160 206l122 94 170-141 148 145 156-130 151 136 143-120 150 105v105H0Z"
        fill="#304859"
      />
      <g>
        <path d="m119 258 66-66 68 66v115H119Z" fill="#523f3c" />
        <path d="m103 262 82-86 87 86Z" fill="#35494d" />
        <path d="M185 176v-31" stroke="#e8d7a8" strokeWidth="5" />
        <path d="M169 224h30v30h-30zM169 276h30v29h-30z" fill="#f3c976" filter="url(#glow)" />
        <path d="m352 279 75-80 77 80v94H352Z" fill="#594542" />
        <path d="m332 284 95-105 98 105Z" fill="#425458" />
        <path d="M391 240h26v28h-26zM438 240h26v28h-26z" fill="#ffd58a" filter="url(#glow)" />
        <path d="m760 259 70-75 73 75v114H760Z" fill="#5b4540" />
        <path d="m739 264 91-98 94 98Z" fill="#384c50" />
        <path d="M805 218h29v29h-29zM849 218h29v29h-29z" fill="#f5cc7a" filter="url(#glow)" />
        <path d="m965 282 66-68 70 68v91H965Z" fill="#574340" />
        <path d="m946 286 85-90 88 90Z" fill="#405459" />
        <path d="M1017 239h28v27h-28z" fill="#ffd58a" filter="url(#glow)" />
      </g>
      <g fill="#244a3c">
        <path d="m628 151 31-59 31 59h-20l34 54h-29l39 61h-110l39-61h-29l34-54Z" />
        <path d="m554 257 25-48 25 48h-16l28 43h-74l28-43Z" />
        <path d="m706 273 21-40 22 40h-14l25 38h-65l25-38Z" />
      </g>
      <path d="M0 346q175-53 354 0t352 0 346 0 148 0v74H0Z" fill="url(#snow)" />
      <path
        d="M0 375q225-42 425 0t398-3 377 2"
        fill="none"
        stroke="#fff"
        strokeOpacity=".65"
        strokeWidth="3"
      />
    </svg>
  );
}
