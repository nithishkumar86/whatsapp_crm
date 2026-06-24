'use client';

import { useCallback, useEffect, useRef, useState, FormEvent } from 'react';

/**
 * Agent config tab.
 *
 * Layout:
 *   1. Large Instructions textarea.
 *   2. Model (OpenRouter Gemini select) + Temperature.
 *   3. Property Documents — pdf/doc, parsed and fed to the AI for replies.
 *   4. Property Files — images/brochures, sent directly to customers on WhatsApp.
 *
 * All data flows through API routes — the browser never talks to Supabase.
 */

interface AgentConfig {
  id: number;
  instructions: string;
  model: string;
  temperature: number;
  updated_at: string;
}

interface PropertyFile {
  id: string;
  file_name: string;
  file_type: string;
  file_url: string;
  summary: string | null;
  category?: string;
  uploaded_at: string;
}

// OpenRouter Gemini model IDs offered in the select-box (latest Gemini 3 family).
// Default = gemini-3.1-flash-lite (cheapest, strong multilingual).
const GEMINI_MODELS = [
  'google/gemini-3.1-flash-lite',
  'google/gemini-3.5-flash',
  'google/gemini-3.1-pro-preview',
  'google/gemini-3-flash-preview',
];

const FILE_BADGE: Record<string, string> = {
  pdf: 'bg-red-100 text-red-700',
  doc: 'bg-blue-100 text-blue-700',
  image: 'bg-emerald-100 text-emerald-700',
  video: 'bg-purple-100 text-purple-700',
};

export default function AgentTab() {
  const [instructions, setInstructions] = useState('');
  const [model, setModel] = useState(GEMINI_MODELS[0]);
  const [temperature, setTemperature] = useState(0.7);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/agent/config', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load config (${res.status})`);
      const data = (await res.json()) as AgentConfig;
      setInstructions(data.instructions ?? '');
      setModel(data.model || GEMINI_MODELS[0]);
      setTemperature(
        typeof data.temperature === 'number' ? data.temperature : 0.7,
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load config');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch('/api/agent/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructions, model, temperature }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || `Failed (${res.status})`);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const modelOptions = GEMINI_MODELS.includes(model)
    ? GEMINI_MODELS
    : [model, ...GEMINI_MODELS];

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex items-center gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Agent Configuration</h2>
          <p className="mt-1 text-sm text-gray-500">
            Tune how the AI replies and give it property knowledge to draw from.
          </p>
        </div>
        {loading && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-600">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-500" />
            Syncing…
          </span>
        )}
      </div>

      <div className="space-y-6">
        {/* Config form */}
        <form
          onSubmit={handleSave}
          className="space-y-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
        >
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-800">
              Instructions
            </label>
            <p className="mb-2 text-xs text-gray-400">
              The system prompt that shapes the AI agent&apos;s persona and rules.
            </p>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={14}
              placeholder="e.g. You are a friendly real-estate assistant for Digital Tamizha…"
              className="min-h-[260px] w-full resize-y rounded-xl border border-gray-300 bg-gray-50 p-4 text-sm leading-relaxed text-gray-800 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-300"
            />
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-800">
                Model
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full rounded-xl border border-gray-300 bg-white p-2.5 text-sm text-gray-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-300"
              >
                {modelOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-400">OpenRouter Gemini models.</p>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-800">
                Temperature ·{' '}
                <span className="text-indigo-600">{temperature.toFixed(2)}</span>
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
                className="mt-2 w-full accent-indigo-600"
              />
              <div className="flex justify-between text-[10px] text-gray-400">
                <span>0 — precise</span>
                <span>1 — creative</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            {error && <span className="text-xs text-red-500">{error}</span>}
            {saved && (
              <span className="text-xs font-medium text-emerald-600">
                ✓ Saved successfully
              </span>
            )}
          </div>
        </form>

        {/* Property Documents — parsed, fed to the AI */}
        <FilesSection
          category="document"
          title="Property Documents"
          description="PDF or DOC files. Their text is read and given to the AI so it can answer customer questions accurately."
          accept=".pdf,.doc,.docx"
          acceptHint="PDF, DOC, DOCX"
          accentText="text-indigo-700"
          accentBorder="border-indigo-200"
          accentBg="bg-indigo-50/50 hover:bg-indigo-50 hover:border-indigo-300"
          accentIcon="text-indigo-500"
        />

        {/* Property Files — media, sent to customers over WhatsApp */}
        <FilesSection
          category="media"
          title="Property Files"
          description="Images & brochures sent directly to customers on WhatsApp — your company products as pictures. These are NOT read by the AI."
          accept=".png,.jpg,.jpeg,.webp,.gif,.pdf"
          acceptHint="PNG, JPG, WEBP, GIF, PDF brochure"
          accentText="text-emerald-700"
          accentBorder="border-emerald-200"
          accentBg="bg-emerald-50/50 hover:bg-emerald-50 hover:border-emerald-300"
          accentIcon="text-emerald-500"
        />
      </div>
    </div>
  );
}

interface FilesSectionProps {
  category: 'document' | 'media';
  title: string;
  description: string;
  accept: string;
  acceptHint: string;
  accentText: string;
  accentBorder: string;
  accentBg: string;
  accentIcon: string;
}

/**
 * Self-contained upload + list + delete section for one file category.
 * Loads from GET /api/agent/files?category=…, uploads with the category field,
 * deletes by id.
 */
function FilesSection({
  category,
  title,
  description,
  accept,
  acceptHint,
  accentText,
  accentBorder,
  accentBg,
  accentIcon,
}: FilesSectionProps) {
  const [files, setFiles] = useState<PropertyFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFiles = useCallback(async () => {
    try {
      const res = await fetch(`/api/agent/files?category=${category}`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = (await res.json()) as PropertyFile[];
      setFiles(Array.isArray(data) ? data : []);
    } catch {
      /* non-fatal */
    }
  }, [category]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('category', category);
      const res = await fetch('/api/agent/files', { method: 'POST', body: form });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || `Upload failed (${res.status})`);
      }
      await loadFiles();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setUploadError(null);
    try {
      const res = await fetch(`/api/agent/files?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || `Delete failed (${res.status})`);
      }
      setFiles((prev) => prev.filter((f) => f.id !== id));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
        <p className="text-xs text-gray-400">{description}</p>
      </div>

      <label
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${accentBorder} ${accentBg} ${
          uploading ? 'pointer-events-none opacity-60' : ''
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className={`mb-2 h-7 w-7 ${accentIcon}`}
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 16.5V6m0 0L8.25 9.75M12 6l3.75 3.75M4.5 18.75A2.25 2.25 0 0 0 6.75 21h10.5a2.25 2.25 0 0 0 2.25-2.25"
          />
        </svg>
        <span className={`text-sm font-medium ${accentText}`}>
          {uploading ? 'Uploading…' : 'Click to upload a file'}
        </span>
        <span className="mt-0.5 text-[11px] text-gray-400">{acceptHint}</span>
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={handleUpload}
          disabled={uploading}
          className="hidden"
        />
      </label>

      {uploadError && (
        <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
          {uploadError}
        </div>
      )}

      <div className="mt-5">
        {files.length === 0 ? (
          <div className="rounded-lg bg-gray-50 px-4 py-6 text-center text-sm text-gray-400">
            No files uploaded yet
          </div>
        ) : (
          <ul className="space-y-2">
            {files.map((f) => (
              <li
                key={f.id}
                className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm"
              >
                <span
                  className={`flex-shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                    FILE_BADGE[f.file_type] ?? 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {f.file_type}
                </span>
                <a
                  href={f.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 truncate text-sm text-gray-700 hover:text-indigo-600 hover:underline"
                >
                  {f.file_name}
                </a>
                <button
                  onClick={() => handleDelete(f.id)}
                  disabled={deletingId === f.id}
                  aria-label={`Delete ${f.file_name}`}
                  className="flex-shrink-0 rounded-lg p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                >
                  {deletingId === f.id ? (
                    <span className="text-[11px]">…</span>
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      className="h-4 w-4"
                      stroke="currentColor"
                      strokeWidth={1.8}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                      />
                    </svg>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
