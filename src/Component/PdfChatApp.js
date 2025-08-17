import "./PdfChatApp.css";
import React, { useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

// pdfjs.GlobalWorkerOptions.workerSrc = new URL(
//   "pdfjs-dist/build/pdf.worker.min.mjs",
//   import.meta.url
// ).toString();


// Netlify-friendly worker (pdfjs v5 uses .mjs worker)
pdfjs.GlobalWorkerOptions.workerSrc =
  `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function PdfChatApp() {
  const fileInputRef = useRef(null);

  // Store server truth, not just name
  const [doc, setDoc] = useState(null); // { docId, pdfUrl, displayName }
  const [numPages, setNumPages] = useState(null);

  const [messages, setMessages] = useState([
    { role: "bot", text: "Upload a PDF and ask questions!" },
  ]);

  const [input, setInput] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);

  // Keep as constant per your request (no env var move)
  const API_BASE = "https://notebook-production-428c.up.railway.app";

  // Smooth scroll + highlight when clicking a citation
  const goToPage = (pageNum) => {
    const el = document.getElementById(`pdf_page_${pageNum}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.style.boxShadow = "0 0 0 4px #2563eb";
      setTimeout(() => (el.style.boxShadow = ""), 900);
    }
  };

  const onFileClick = () => {
    // ensure onChange fires even for same file
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onFileChange = async (event) => {
    const selected = event.target.files?.[0];
    if (!selected) return;

    // quick client guard
    const name = selected.name || "";
    if (!name.toLowerCase().endsWith(".pdf")) {
      setMessages([{ role: "bot", text: "Only PDF files are allowed (.pdf)." }]);
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

      const { docId, pdfUrl } = await res.json();
      setDoc({ docId, pdfUrl: `${API_BASE}${pdfUrl}`, displayName: selected.name });
      setNumPages(null);
      setMessages([
        { role: "bot", text: `Uploaded "${selected.name}". Ask your questions below.` },
      ]);
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

  const onDocumentLoadSuccess = ({ numPages }) => setNumPages(numPages);

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
          </div>

          <div className="chat-messages">
            {messages.map((msg, idx) => (
              <div key={idx} className={`chat-message ${msg.role}`}>
                {/* Only bot answers show \n as new lines */}
                <div style={msg.role === "bot" ? { whiteSpace: "pre-line" } : undefined}>
                  {msg.text}
                </div>

                {Array.isArray(msg.citations) && msg.citations.length > 0 && (
                  <div
                    className="citations"
                    style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}
                  >
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
            <Document
              file={doc.pdfUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              options={{ disableRange: true }} // keep if server doesn't support 206
            >
              {Array.from({ length: numPages || 0 }, (_, index) => {
                const pageNum = index + 1;
                return (
                  <div
                    key={`page_${pageNum}`}
                    id={`pdf_page_${pageNum}`}
                    style={{
                      marginBottom: 24,
                      scrollMarginTop: 80,
                      position: "relative",
                      borderRadius: 8,
                      overflow: "hidden",
                    }}
                  >
                    {/* Page Number Badge */}
                    <div
                      style={{
                        position: "absolute",
                        top: 8,
                        left: 8,
                        zIndex: 2,
                        background: "rgba(0,0,0,0.6)",
                        color: "white",
                        padding: "2px 8px",
                        borderRadius: 12,
                        fontSize: 12,
                      }}
                    >
                      Page {pageNum}{numPages ? ` / ${numPages}` : ""}
                    </div>

                    <Page
                      pageNumber={pageNum}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                      renderMode="canvas"
                    />

                    {/* Optional: label below the page too */}
                    <div style={{ textAlign: "center", color: "#666", marginTop: 6, fontSize: 12 }}>
                      Page {pageNum}{numPages ? ` of ${numPages}` : ""}
                    </div>
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
