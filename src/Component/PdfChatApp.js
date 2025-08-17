import "./PdfChatApp.css";
import React, { useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

// pdfjs.GlobalWorkerOptions.workerSrc = new URL(
//   "pdfjs-dist/build/pdf.worker.min.mjs",
//   import.meta.url
// ).toString();

// Worker for Netlify/production (CDN), falls back to local if needed
pdfjs.GlobalWorkerOptions.workerSrc =
  `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function PdfChatApp() {
  // ---- config ----
  const API_BASE = "https://notebook-production-428c.up.railway.app";
  const MAX_MB = 10;

  // ---- state ----
  const [docId, setDocId] = useState(null);
  const [pdfUrl, setPdfUrl] = useState("");     // full URL for viewer
  const [numPages, setNumPages] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingStatus, setPendingStatus] = useState(""); // "Uploading…"/"Thinking…"
  const [uploadError, setUploadError] = useState("");

  const [messages, setMessages] = useState([
    { role: "bot", text: "Upload a PDF and ask questions!" },
  ]);
  const [input, setInput] = useState("");

  const inputRef = useRef(null);

  // ---- helpers ----
  const toMB = (bytes) => Math.round((bytes / (1024 * 1024)) * 10) / 10;
  const resetFileInput = () => {
    if (inputRef.current) inputRef.current.value = "";
  };

  // Scroll to a specific page (used by citations)
  const goToPage = (pageNum) => {
    const el = document.getElementById(`pdf_page_${pageNum}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    // quick highlight flash
    el.style.boxShadow = "0 0 0 4px #2563eb";
    setTimeout(() => (el.style.boxShadow = ""), 1000);
  };

  // ---- upload ----
  const onFileChange = async (event) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    // basic validations
    setUploadError("");
    if (!selectedFile.name.toLowerCase().endsWith(".pdf")) {
      setUploadError("Only PDF files are allowed (.pdf).");
      resetFileInput();
      return;
    }
    if (selectedFile.size > MAX_MB * 1024 * 1024) {
      setUploadError(`File too large (${toMB(selectedFile.size)} MB). Max ${MAX_MB} MB.`);
      resetFileInput();
      return;
    }

    const formData = new FormData();
    formData.append("pdf", selectedFile);

    setIsUploading(true);
    setPendingStatus("Uploading…");

    try {
      const response = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        // Try to show server error (e.g., validation from backend)
        let msg = "Failed to upload PDF.";
        try {
          const err = await response.json();
          if (err?.error) msg = err.error;
        } catch (_) {}
        setUploadError(msg);
        setMessages((m) => [...m, { role: "bot", text: "Failed to upload PDF." }]);
        return;
      }

      const data = await response.json();
      // expected: { docId, pdfUrl }
      const nextDocId = data?.docId ?? selectedFile.name;
      // pdfUrl may be relative => prefix with API_BASE
      const nextPdfUrl = data?.pdfUrl
        ? data.pdfUrl.startsWith("http")
          ? data.pdfUrl
          : `${API_BASE}${data.pdfUrl}`
        : `${API_BASE}/file/${encodeURIComponent(selectedFile.name)}`;

      setDocId(nextDocId);
      setPdfUrl(nextPdfUrl);
      setNumPages(null);
      setMessages([{ role: "bot", text: `Uploaded "${selectedFile.name}". Ask your questions below.` }]);
      resetFileInput();
    } catch (error) {
      console.error("Upload error:", error);
      setUploadError("Error uploading PDF. Please try again.");
      setMessages((m) => [...m, { role: "bot", text: "Error uploading PDF." }]);
    } finally {
      setIsUploading(false);
      setPendingStatus("");
    }
  };

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
  };

  // ---- chat ----
  const handleSend = async () => {
    if (!input.trim() || !docId) return;

    const newMessages = [...messages, { role: "user", text: input }];
    setMessages(newMessages);
    setInput("");
    setPendingStatus("Thinking…");

    try {
      const response = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: input, docId }),
      });

      const data = await response.json();
      setMessages([
        ...newMessages,
        {
          role: "bot",
          text: data?.answer || "No response.",
          citations: Array.isArray(data?.citations) ? data.citations : [],
        },
      ]);
    } catch (error) {
      console.error("Chat error:", error);
      setMessages([...newMessages, { role: "bot", text: "Error getting response." }]);
    } finally {
      setPendingStatus("");
    }
  };

  return (
    <div className="pdf-chat-app">
      <div className="pdf-chat-header">
        <p>Lakshmi Sri HL — PDF Chat Assistant</p>
      </div>

      <div className="pdf-chat-main">
        {/* LEFT: Chat */}
        <div className="chat-section">
          {/* Upload box */}
          <div className="pdf-upload-container">
            <label className="pdf-upload-btn">
              Upload PDF
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf"
                onChange={onFileChange}
                style={{ display: "none" }}
              />
            </label>

            <div className="upload-hint">
              <div className="hint-line">Only PDFs allowed.</div>
              <div className="hint-line">
                Max size <strong>{MAX_MB} MB</strong>.
              </div>
            </div>
          </div>

          {/* any upload validation/server error */}
          {uploadError && <div className="upload-error">{uploadError}</div>}

          {/* Chat log */}
          <div className="chat-messages">
            {messages.map((msg, idx) => (
              <div key={idx} className={`chat-message ${msg.role}`}>
                <div className="msg-text" style={{ whiteSpace: "pre-line" }}>
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

            {/* Pending status bubble (Uploading… / Thinking…) */}
            {pendingStatus && (
              <div className="pending-status">
                <span className="dot dot1" />
                <span className="dot dot2" />
                <span className="dot dot3" />
                <span style={{ marginLeft: 8 }}>{pendingStatus}</span>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="chat-input">
            <input
              type="text"
              placeholder="Ask something about the PDF…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              disabled={!docId}
            />
            <button onClick={handleSend} disabled={!docId || !input.trim()}>
              Send
            </button>
          </div>
        </div>

        {/* RIGHT: PDF Viewer */}
        <div className="pdf-viewer">
          <div className="view">
            <h2>PDF Viewer</h2>
          </div>

          {isUploading && (
            <div className="pdf-loader">
              <div className="spinner" />
              <p>Uploading PDF, please wait…</p>
            </div>
          )}

          {!isUploading && pdfUrl && (
            <Document file={pdfUrl} onLoadSuccess={onDocumentLoadSuccess}>
              {Array.from({ length: numPages || 0 }, (_, index) => {
                const page = index + 1;
                return (
                  <div
                    key={`pagewrap_${page}`}
                    id={`pdf_page_${page}`}
                    className="page-wrap"
                  >
                    <Page
                      pageNumber={page}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                      renderMode="canvas"
                    />
                    <div className="page-badge">{page}</div>
                  </div>
                );
              })}
            </Document>
          )}
        </div>
      </div>
    </div>
  );
}
