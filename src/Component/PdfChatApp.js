import "./PdfChatApp.css";
import React, {
  useRef,
  useState,
  useMemo,
  useCallback,
  useEffect,
} from "react";
import { Document, Page, pdfjs } from "react-pdf";

// pdfjs.GlobalWorkerOptions.workerSrc = new URL(
//   "pdfjs-dist/build/pdf.worker.min.mjs",
//   import.meta.url
// ).toString();

// Netlify-friendly worker (pdfjs v5 uses .mjs)
pdfjs.GlobalWorkerOptions.workerSrc =
  `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// Memoized PDF viewer so typing in chat doesn't re-render the PDF
const PdfViewer = React.memo(function PdfViewer({ url, onNumPages, numPages }) {
  const pdfOptions = useMemo(() => ({ disableRange: true }), []);
  const handleLoad = useCallback(({ numPages: n }) => onNumPages(n), [onNumPages]);

  if (!url) return null;

  return (
    <Document file={url} options={pdfOptions} onLoadSuccess={handleLoad}>
      {Array.from({ length: numPages || 0 }, (_, index) => {
        const pageNum = index + 1;
        return (
          <div key={`page_${pageNum}`} id={`pdf_page_${pageNum}`} className="pdf-page-wrap">
            <Page
              pageNumber={pageNum}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              renderMode="canvas"
            />
            <div className="pdf-page-caption">
              Page {pageNum}{numPages ? ` of ${numPages}` : ""}
            </div>
          </div>
        );
      })}
    </Document>
  );
});

export default function PdfChatApp() {
  const fileInputRef = useRef(null);
  const chatContainerRef = useRef(null);

  // { docId, pdfUrl, displayName }
  const [doc, setDoc] = useState(null);
  const [numPages, setNumPages] = useState(null);

  const [messages, setMessages] = useState([
    { role: "bot", text: "Upload a PDF and ask questions!" },
  ]);

  const [input, setInput] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);

  // Keep constant per your request
  const API_BASE = "https://notebook-production-428c.up.railway.app";
  const MAX_MB = 10;
  const MAX_BYTES = MAX_MB * 1024 * 1024;

  // ----- Restore last doc from localStorage on mount -----
  useEffect(() => {
    try {
      const raw = localStorage.getItem("lastDoc");
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.docId && saved?.pdfUrl) {
          setDoc(saved);
          setMessages([
            { role: "bot", text: `Reopened "${saved.displayName || saved.docId}". You can ask questions now.` },
          ]);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // ----- Auto-scroll chat to bottom whenever messages change -----
  useEffect(() => {
    const el = chatContainerRef.current;
    if (!el) return;
    // Use setTimeout to allow DOM to paint new message first
    const id = setTimeout(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }, 0);
    return () => clearTimeout(id);
  }, [messages]);

  const goToPage = (pageNum) => {
    const el = document.getElementById(`pdf_page_${pageNum}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.style.boxShadow = "0 0 0 4px #2563eb";
      setTimeout(() => (el.style.boxShadow = ""), 900);
    }
  };

  const onFileClick = () => {
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onFileChange = async (event) => {
    const selected = event.target.files?.[0];
    if (!selected) return;

    // Client-side validations
    const name = selected.name || "";
    const type = selected.type || "";
    const size = selected.size || 0;

    if (!name.toLowerCase().endsWith(".pdf") || !(type === "application/pdf" || type === "")) {
      setMessages([{ role: "bot", text: "Only PDF files are allowed (.pdf)." }]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (size > MAX_BYTES) {
      setMessages([{ role: "bot", text: `File too large. Max size is ${MAX_MB} MB.` }]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const formData = new FormData();
    formData.append("pdf", selected);

    setIsUploading(true);
    try {
      const res = await fetch(`${API_BASE}/upload`, { method: "POST", body: formData });

      if (!res.ok) {
        let msg = "Failed to upload PDF.";
        try {
          const j = await res.json();
          if (j?.error) msg = j.error;
        } catch {}
        setDoc(null);
        setNumPages(null);
        setMessages([{ role: "bot", text: msg }]);
        return;
      }

      // Expect { docId, pdfUrl }
      const { docId, pdfUrl } = await res.json();
      const nextDoc = { docId, pdfUrl: `${API_BASE}${pdfUrl}`, displayName: selected.name };
      setDoc(nextDoc);
      setNumPages(null);
      setMessages([{ role: "bot", text: `Uploaded "${selected.name}". Ask your questions below.` }]);

      // Persist to localStorage
      try {
        localStorage.setItem("lastDoc", JSON.stringify(nextDoc));
      } catch {
        // ignore
      }
    } catch (e) {
      console.error("Upload error:", e);
      setDoc(null);
      setNumPages(null);
      setMessages([{ role: "bot", text: "Error uploading PDF." }]);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleNumPages = useCallback((n) => setNumPages(n), []);

  const handleSend = async () => {
    if (!input.trim() || !doc?.docId) return;

    const next = [...messages, { role: "user", text: input }];
    setMessages(next);
    setInput("");
    setIsChatLoading(true);

    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: input, docId: doc.docId }),
      });

      if (!res.ok) {
        let msg = `Chat failed (${res.status})`;
        try {
          const j = await res.json();
          if (j?.error) msg = j.error;
        } catch {}
        setMessages([...next, { role: "bot", text: msg }]);
        return;
      }

      const data = await res.json();
      setMessages([
        ...next,
        {
          role: "bot",
          text: data?.answer || "No response.",
          citations: Array.isArray(data?.citations) ? data.citations : [],
        },
      ]);
    } catch (e) {
      console.error("Chat error:", e);
      setMessages([...next, { role: "bot", text: "Error getting response." }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  return (
    <div className="pdf-chat-app">
      <div className="pdf-chat-header">
        <p>Lakshmi Sri HL - PDF Chat Assistant</p>
      </div>

      <div className="pdf-chat-main">
        {/* Chat Section */}
        <div className="chat-section">
          <div className="pdf-upload-container">
            <label className="pdf-upload-btn">
              Upload PDF
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                onClick={onFileClick}
                onChange={onFileChange}
                style={{ display: "none" }}
              />
            </label>
            <div className="pdf-upload-note">
              Only PDFs allowed. Max size <strong>10 MB</strong>.
            </div>
          </div>

          <div className="chat-messages" ref={chatContainerRef}>
            {messages.map((msg, idx) => (
              <div key={idx} className={`chat-message ${msg.role}`}>
                {/* Only bot answers show \n as new lines */}
                <div style={msg.role === "bot" ? { whiteSpace: "pre-line" } : undefined}>
                  {msg.text}
                </div>

                {Array.isArray(msg.citations) && msg.citations.length > 0 && (
                  <div className="citations">
                    {msg.citations.map((p) => (
                      <button
                        key={p}
                        className="citation-link"
                        onClick={() => goToPage(p)}
                        disabled={!numPages}
                        title={`Go to page ${p}`}
                      >
                        📄 Page {p}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {isChatLoading && (
              <div className="chat-message bot">
                <em>Thinking…</em>
              </div>
            )}
          </div>

          <div className="chat-input">
            <input
              type="text"
              placeholder="Ask something about the PDF..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              disabled={!doc?.docId}
            />
            <button onClick={handleSend} disabled={!doc?.docId || !input.trim() || isChatLoading}>
              {isChatLoading ? "Sending…" : "Send"}
            </button>
          </div>
        </div>

        {/* PDF Viewer */}
        <div className="pdf-viewer">
          <div className="view">
            <h2>PDF Viewer</h2>
          </div>

          {isUploading && (
            <div className="pdf-loader">
              <div className="spinner" />
              <p>Uploading PDF, please wait...</p>
            </div>
          )}

          {!isUploading && doc?.pdfUrl && (
            <PdfViewer url={doc.pdfUrl} onNumPages={handleNumPages} numPages={numPages} />
          )}
        </div>
      </div>
    </div>
  );
}
