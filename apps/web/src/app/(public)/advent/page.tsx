import { isAdventEnabled } from "@/lib/config";
import { notFound } from "next/navigation";
import Link from "next/link";

export default function AdventPage() {
  if (!isAdventEnabled()) notFound();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 text-white">
      <nav className="mb-8 flex gap-4">
        <Link href="/" className="hover:underline">Home</Link>
        <Link href="/tracker" className="hover:underline">Tracker</Link>
        <Link href="/advent" className="font-bold">Village</Link>
      </nav>
      <h1 className="text-4xl font-bold mb-4">Advent Village</h1>
      <p className="opacity-80 mb-6">Daily unlocks December 1–24. Client fetches /api/advent/manifest.</p>
      <div id="advent-manifest" className="bg-white/10 backdrop-blur-md rounded-xl p-6 max-w-2xl w-full">Loading…</div>
      <script dangerouslySetInnerHTML={{ __html: `
        (async function(){
          const el=document.getElementById('advent-manifest');
          try{
            const res=await fetch('/api/advent/manifest');
            if(!res.ok){ el.textContent='Advent disabled or error '+res.status; return; }
            const data=await res.json();
            el.innerHTML='<p>Total days: '+data.total_days+'</p>' + data.days.map(d=>'<div class="py-2 border-b border-white/20"><strong>Day '+d.day+': '+d.title+'</strong> - '+(d.is_unlocked?'Unlocked':'Locked')+' <small>'+d.unlock_time+'</small></div>').join('');
          }catch(e){ el.textContent='Error: '+e.message; }
        })();
      `}} />
    </div>
  );
}
