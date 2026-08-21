import Link from "next/link";

export default function TrackerPage() {
  const adventEnabled = process.env.ADVENT_ENABLED === "true" || process.env.ADVENT_ENABLED === "True";
  return (
    <>
      <nav className="glass-nav fixed top-4 left-1/2 -translate-x-1/2 z-40 bg-white/20 backdrop-blur-md rounded-full px-6 py-2 flex gap-4">
        <Link href="/" className="nav-link text-white/80 hover:text-white">Home</Link>
        <Link href="/tracker" className="nav-link nav-link-active text-white font-semibold">Tracker</Link>
        {adventEnabled && <Link href="/advent" className="nav-link text-white/80 hover:text-white">Village</Link>}
      </nav>
      <div className="map-fullscreen relative w-screen h-screen">
        <div id="map" className="map w-full h-full bg-blue-950 flex items-center justify-center" aria-label="Interactive map showing Santa's current location and route" role="application" tabIndex={0}>
          <p className="text-white/70">Map loading… Leaflet will initialize here. Route data available at /api equivalent via static JSON.</p>
        </div>
        <div className="countdown-hud absolute top-20 right-4 bg-black/40 backdrop-blur-md rounded-xl p-4 text-white">
          <p className="countdown-hud-label text-xs opacity-70">Countdown to Takeoff</p>
          <div id="countdown" className="countdown-hud-value font-mono text-lg" aria-live="polite">Loading…</div>
        </div>
      </div>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" async></script>
      <script dangerouslySetInnerHTML={{ __html: `
        (function(){
          function update(){
            var el=document.getElementById('countdown');
            if(!el) return;
            var target=new Date(Date.UTC(new Date().getUTCFullYear(),11,24,10,0,0));
            var diff=target-new Date();
            if(diff<=0){ el.textContent='Santa is flying!'; return; }
            var d=Math.floor(diff/86400000),h=Math.floor(diff%86400000/3600000),m=Math.floor(diff%3600000/60000);
            el.textContent=d+'d '+h+'h '+m+'m';
          }
          update(); setInterval(update,1000);
          // attempt to load route data
          fetch('/data/santa_route.json').then(r=>r.json()).then(j=>{ console.log('route loaded', (j.route_nodes||j.route||[]).length); }).catch(()=>{});
        })();
      `}} />
    </>
  );
}
