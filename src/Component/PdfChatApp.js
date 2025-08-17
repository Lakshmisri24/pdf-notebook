import "./PdfChatApp.css";
import React, { useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

// pdfjs.GlobalWorkerOptions.workerSrc = new URL(
//   "pdfjs-dist/build/pdf.worker.min.mjs",
//   import.meta.url
// ).toString();

// Worker (Netlify-friendly CDN)
pdfjs.GlobalWorkerOptions.workerSrc =
  `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function PdfChatApp() {
  const API_BASE = "https://notebook-production-428c.up.railway.app";

  // UI state
  const [messages, setMessages] = useState([
    { role: "bot", text: "Upload a PDF and ask questions!" },
  ]);
  const [input, setInput] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [numPages, setNumPages] = useState(null);
  const [error, setError] = useState("");

  // File metadata from backend (docId + render URL)
  const [fileMeta, setFileMeta] = useState({
    docId: null,
    pdfUrl: null,
    name: null,
  });

  const fileInputRef = useRef(null);

  // Build absolute PDF URL when backend returns "/file/xyz.pdf"
  const pdfUrl = useMemo(() => {
    if (!fileMeta.pdfUrl) return null;
    return fileMeta.pdfUrl.startsWith("http")
      ? fileMeta.pdfUrl
      : `${API_BASE}${fileMeta.pdfUrl}`;
  }, [fileMeta.pdfUrl]);

  const handleFileChange = async (event) => {
    const selected = event.target.files?.[0];
    if (!selected) return;

    setError("");
    // client-side checks (mirror your backend)
    if (selected.type !== "application/pdf") {
      setError("Only PDF files are allowed (.pdf).");
      // allow re-uploading same file name by clearing input value
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      setError("Max file size is 10 MB.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const formData = new FormData();
    formData.append("pdf", selected);

    setIsUploading(true);
    try {
      const res = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const maybeJson = await res.json().catch(() => ({}));
        setError(maybeJson.error || "Failed to upload PDF.");
        return;
      }

      const data = await res.json();
      // Expecting: { docId: "...", pdfUrl: "/file/...", sizeBytes: ... }
      setFileMeta({
        docId: data.docId || selected.name,
        pdfUrl: data.pdfUrl || null,
        name: selected.name,
      });
      setNumPages(null);
      setMessages([
        {
          role: "bot",
          text: `Uploaded "${selected.name}". Ask your questions below.`,
        },
      ]);
    } catch (e) {
      console.error("Upload error:", e);
      setError("Error uploading PDF.");
    } finally {
      setIsUploading(false);
      // Clear input so picking the **same filename** triggers onChange next time
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onDocumentLoadSuccess = ({ numPages }) => setNumPages(numPages);

  const goToPage = (pageNum) => {
    const el = document.getElementById(`pdf_page_${pageNum}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.style.boxShadow = "0 0 0 4px #2563eb";
    setTimeout(() => (el.style.boxShadow = ""), 900);
  };

  const handleSend = async () => {
    if (!input.trim() || !fileMeta.docId) return;

    const userMsg = { role: "user", text: input };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");

    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: userMsg.text, docId: fileMeta.docId }),
      });

      const data = await res.json().catch(() => ({}));
      setMessages([
        ...next,
        {
          role: "bot",
          text: data.answer || "No response.",
          citations: Array.isArray(data.citations) ? data.citations : [],
        },
      ]);
    } catch (e) {
      console.error("Chat error:", e);
      setMessages([...next, { role: "bot", text: "Error getting response." }]);
    }
  };

  return (
    <div className="pdf-chat-app">
      <div className="pdf-chat-header">
        <p>Lakshmi Sri HL - PDF Chat Assistant</p>
      </div>

      <div className="pdf-chat-main">
        {/* Chat / Controls */}
        <div className="chat-section">
          <div className="pdf-upload-container">
            <label className="pdf-upload-btn">
              Upload PDF
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                style={{ display: "none" }}
                onChange={handleFileChange}
              />
            </label>

            {/* caption BELOW the button */}
            <div className="pdf-upload-caption">
              Only PDFs allowed. Max size <strong>10 MB</strong>.
            </div>

            {/* show errors inline */}
            {error && <div className="error-banner">{error}</div>}
          </div>

          <div className="chat-messages">
            {messages.map((m, i) => (
              <div key={i} className={`chat-message ${m.role}`}>
                {/* bot text keeps newlines */}
                <div className={m.role === "bot" ? "bot-text" : undefined}>
                  {m.text}
                </div>

                {/* citations (pages) */}
                {Array.isArray(m.citations) && m.citations.length > 0 && (
                  <div className="citations">
                    {m.citations.map((p) => (
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
          </div>

          <div className="chat-input">
            <input
              type="text"
              placeholder={
                fileMeta.docId
                  ? "Ask something about the PDF..."
                  : "Upload a PDF to start chatting..."
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              disabled={!fileMeta.docId}
            />
            <button onClick={handleSend} disabled={!fileMeta.docId || !input.trim()}>
              Send
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

          {!isUploading && pdfUrl && (
            <Document
              key={fileMeta.docId} // keeps viewer stable per doc
              file={pdfUrl}
              onLoadSuccess={onDocumentLoadSuccess}
            >
              {Array.from({ length: numPages || 0 }, (_, i) => (
                <div
                  key={`wrap_${i + 1}`}
                  id={`pdf_page_${i + 1}`}
                  style={{ marginBottom: 24, scrollMarginTop: 80 }}
                >
                  {/* Optional page number label on each page */}
                  <div className="page-badge">Page {i + 1}</div>
                  <Page
                    pageNumber={i + 1}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                    renderMode="canvas"
                  />
                </div>
              ))}
            </Document>
          )}
        </div>
      </div>
    </div>
  );
}
