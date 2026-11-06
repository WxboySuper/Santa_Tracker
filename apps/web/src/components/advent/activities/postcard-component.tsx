"use client";

import { useMemo, useRef, useState, type RefObject } from "react";
import { createTranslator } from "@santa-tracker/localization";
import { layoutPostcard, limitPostcardInput, type PostcardConfig, type PostcardLayout, type WinterScene } from "@/lib/postcard";
import { WinterSceneArt } from "./winter-scene-art";

const sceneOptions: WinterScene[] = ["cabin", "harbor", "street", "forest"];
const greetingOptions = ["advent.activity.postcard.greeting.1", "advent.activity.postcard.greeting.2", "advent.activity.postcard.greeting.3"] as const;
const signoffOptions = ["advent.activity.postcard.signoff.1", "advent.activity.postcard.signoff.2", "advent.activity.postcard.signoff.3"] as const;

export function PostcardActivity({ config, locale }: { config: PostcardConfig; locale: string }) {
  const translator = createTranslator({ locale });
  const [scene, setScene] = useState<WinterScene>(config.scene);
  const [greetingChoice, setGreetingChoice] = useState<string>(greetingOptions[0]);
  const [customGreeting, setCustomGreeting] = useState("");
  const [signoffChoice, setSignoffChoice] = useState<string>(signoffOptions[0]);
  const [includePostmark, setIncludePostmark] = useState(false);
  const [city, setCity] = useState("");
  const [date, setDate] = useState("");
  const [downloadMessage, setDownloadMessage] = useState("");
  const svgRef = useRef<SVGSVGElement>(null);
  const greeting = greetingChoice === "custom" ? customGreeting : translator.t(greetingChoice as typeof greetingOptions[number]);
  const signoff = translator.t(signoffChoice as typeof signoffOptions[number]);
  const layout = useMemo(() => layoutPostcard({ greeting, signoff, city, date, includePostmark }), [city, date, greeting, includePostmark, signoff]);

  function selectGreeting(value: string) {
    setGreetingChoice(value);
    if (value !== "custom") setCustomGreeting("");
  }

  function updateCustomGreeting(value: string) {
    setCustomGreeting(limitPostcardInput({ value, maximum: 140 }));
  }

  function download() {
    setDownloadMessage("");
    const svg = svgRef.current;
    if (!svg) {
      setDownloadMessage(translator.t("advent.activity.postcard.downloadError"));
      return;
    }
    const exportSvg = svg.cloneNode(true) as SVGSVGElement;
    exportSvg.setAttribute("width", "1200");
    exportSvg.setAttribute("height", "800");
    exportSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 800;
      const context = canvas.getContext("2d");
      if (!context) {
        setDownloadMessage(translator.t("advent.activity.postcard.downloadError"));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) {
          setDownloadMessage(translator.t("advent.activity.postcard.downloadError"));
          return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "winter-postcard.png";
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }, "image/png");
    };
    image.onerror = () => setDownloadMessage(translator.t("advent.activity.postcard.downloadError"));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(exportSvg))}`;
  }

  return (
    <section className="space-y-4" aria-labelledby="postcard-title">
      <h2 id="postcard-title" className="text-2xl font-bold">{translator.t("advent.activity.postcard.title")}</h2>
      <p>{translator.t("advent.activity.postcard.intro")}</p>
      <PostcardPreview scene={scene} layout={layout} previewLabel={translator.t("advent.activity.postcard.preview")} svgRef={svgRef} />
      <fieldset className="space-y-2">
        <legend className="font-semibold">{translator.t("advent.activity.postcard.scene")}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {sceneOptions.map((option) => <button key={option} type="button" aria-pressed={scene === option} onClick={() => setScene(option)} className={`rounded-lg border-2 p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 ${scene === option ? "border-amber-600" : "border-slate-300"}`}>
            <svg viewBox="0 0 100 75" aria-hidden="true" className="mb-1 aspect-[4/3] w-full rounded"><WinterSceneArt scene={option} /></svg>{translator.t(`advent.activity.postcard.scene.${option}`)}
          </button>)}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid min-w-0 gap-1">{translator.t("advent.activity.postcard.greeting")}
          <select value={greetingChoice} onChange={(event) => selectGreeting(event.currentTarget.value)} className="w-full min-w-0 max-w-full rounded border border-slate-400 p-2">
            {greetingOptions.map((option) => <option key={option} value={option}>{translator.t(option)}</option>)}
            <option value="custom">{translator.t("advent.activity.postcard.custom")}</option>
          </select>
        </label>
        {greetingChoice === "custom" ? <label className="grid gap-1">{translator.t("advent.activity.postcard.customGreeting")}
          <textarea value={customGreeting} onChange={(event) => updateCustomGreeting(event.currentTarget.value)} maxLength={280} rows={3} className="rounded border border-slate-400 p-2" />
          <span className="text-sm">{translator.t("advent.activity.postcard.characterCount", { count: Array.from(customGreeting).length })}</span>
        </label> : null}
        <label className="grid min-w-0 gap-1">{translator.t("advent.activity.postcard.signoff")}
          <select value={signoffChoice} onChange={(event) => setSignoffChoice(event.currentTarget.value)} className="w-full min-w-0 max-w-full rounded border border-slate-400 p-2">
            {signoffOptions.map((option) => <option key={option} value={option}>{translator.t(option)}</option>)}
          </select>
        </label>
      </div>
      <div className="space-y-3 rounded-lg border border-slate-300 p-3">
        <label className="flex items-center gap-2"><input type="checkbox" checked={includePostmark} onChange={(event) => setIncludePostmark(event.currentTarget.checked)} />{translator.t("advent.activity.postcard.includePostmark")}</label>
        {includePostmark ? <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1">{translator.t("advent.activity.postcard.city")}<input value={city} onChange={(event) => setCity(event.currentTarget.value)} maxLength={60} className="min-w-0 rounded border border-slate-400 p-2" /></label>
          <label className="grid gap-1">{translator.t("advent.activity.postcard.date")}<input type="date" value={date} onChange={(event) => setDate(event.currentTarget.value)} className="min-w-0 rounded border border-slate-400 p-2" /></label>
        </div> : null}
        <p className="text-sm">{translator.t("advent.activity.postcard.postmarkNote")}</p>
      </div>
      <button type="button" onClick={download} className="rounded-lg bg-slate-800 px-4 py-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500">{translator.t("advent.activity.postcard.download")}</button>
      <p className="text-sm" aria-live="polite">{downloadMessage}</p>
    </section>
  );
}

function PostcardPreview({ scene, layout, previewLabel, svgRef }: { scene: WinterScene; layout: PostcardLayout; previewLabel: string; svgRef: RefObject<SVGSVGElement | null> }) {
  return <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-xl shadow-lg">
    <svg ref={svgRef} viewBox="0 0 1200 800" className="block h-auto w-full" role="img" aria-label={previewLabel}>
      <rect width="1200" height="800" fill="#f4edda" />
      <rect x="24" y="24" width="1152" height="752" rx="12" fill="none" stroke="#344d56" strokeWidth="4" />
      <PostcardSceneImage scene={scene} />
      <path d="M64 454h1072" stroke="#a8aaa2" strokeWidth="2" />
      <TextLines lines={layout.greeting} x={80} y={510} lineHeight={44} size={36} weight="600" />
      <TextLines lines={layout.signoff} x={80} y={730} lineHeight={32} size={30} />
      {layout.postmark.length ? <g fill="#6e5050" fontFamily="Georgia,serif" fontSize="20" textAnchor="end"><TextLines lines={layout.postmark} x={1110} y={662} lineHeight={28} size={20} align="end" /></g> : null}
      <path d="M1025 520h88m-88 9h88m-88 9h88" stroke="#8e6363" strokeWidth="2" opacity=".8" />
    </svg>
  </div>;
}

function PostcardSceneImage({ scene }: { scene: WinterScene }) {
  return <svg x="64" y="64" width="1072" height="360" viewBox="0 0 100 75" preserveAspectRatio="xMidYMid slice"><WinterSceneArt scene={scene} /></svg>;
}

function TextLines({ lines, x, y, lineHeight, size, weight, align = "start" }: { lines: string[]; x: number; y: number; lineHeight: number; size: number; weight?: string; align?: "start" | "end" }) {
  const occurrences = new Map<string, number>();
  let firstLine = true;
  const children = lines.map((line) => {
    const occurrence = occurrences.get(line) ?? 0;
    occurrences.set(line, occurrence + 1);
    const dy = firstLine ? 0 : lineHeight;
    firstLine = false;
    return <tspan key={`${line}-${occurrence}`} x={x} dy={dy}>{line}</tspan>;
  });
  return <text x={x} y={y} fill="#283a3b" fontFamily="Georgia,serif" fontSize={size} fontWeight={weight} textAnchor={align}>{children}</text>;
}
