import React from 'react';
import { Download, Share2, Copy } from 'lucide-react';
import type { PackageGrade } from '../../utils/verificationV2';
import { useShareCardActions } from './useShareCardActions';

interface ShareCardProps {
  pkg: PackageGrade;
  captureMap: () => Promise<HTMLImageElement | null>;
  addToast: (message: string, type?: 'info' | 'success' | 'error') => void;
}

/** Anonymous grade-plus-map share card with download, share, and copy actions. */
const ShareCard: React.FC<ShareCardProps> = ({ pkg, captureMap, addToast }) => {
  const { busy, handleDownload, handleShare, handleCopy } = useShareCardActions(pkg, captureMap, addToast);

  return (
    <div className="fg-section">
      <div className="fg-section-body pt-4">
        <div className="mb-2 text-sm font-semibold">Share this grade</div>
        <p className="mb-3 text-xs text-slate-500">Anonymous grade-plus-map card. No identity included.</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="fg-touch inline-flex items-center gap-2 rounded-lg border border-slate-300/50 px-3 py-2 text-sm disabled:opacity-50"
            onClick={handleDownload}
            disabled={busy}
          >
            <Download className="h-4 w-4" /> Download
          </button>
          <button
            type="button"
            className="fg-touch inline-flex items-center gap-2 rounded-lg border border-slate-300/50 px-3 py-2 text-sm disabled:opacity-50"
            onClick={handleShare}
            disabled={busy}
          >
            <Share2 className="h-4 w-4" /> Share
          </button>
          <button
            type="button"
            className="fg-touch inline-flex items-center gap-2 rounded-lg border border-slate-300/50 px-3 py-2 text-sm disabled:opacity-50"
            onClick={handleCopy}
            disabled={busy}
          >
            <Copy className="h-4 w-4" /> Copy
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShareCard;
