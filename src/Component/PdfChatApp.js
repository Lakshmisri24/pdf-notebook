import "./PdfChatApp.css";
import React, { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

// pdfjs.GlobalWorkerOptions.workerSrc = new URL(
//   "pdfjs-dist/build/pdf.worker.min.mjs",
//   import.meta.url
// ).toString();

// Worker (Netlify/CDN friendly)
pdfjs.GlobalWorkerOptions.workerSrc =
  `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// Change this if you prefer env config later
const API_BASE =
  (typeof import !== "undefined" &&
    import.meta &&
    import.meta.env &&
    import.meta.env.VITE_BACKEND_URL) ||
  "https://notebook-production-428c.up.railway.app";

export default function PdfChatApp() {
  // viewer sizing
  const viewerRef = useRef(null);
  const [viewerWidth, setViewerWidth] = useState(0);

  // upload & document
  const [file, setFile] = useState(null);
  const [docId, setDocId] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  // chat
  const [messages, setMessages] = useState([
    { role: "bot", text: "Upload a PDF and ask questions!" },
  ]);
  const [input, setInput] = useState("");
  const [isPending, setIsPending] = useState(false);

  // measure viewer width for responsive Page width
  useEffect(() => {
    const measure = () => {
      if (viewerRef.current) {
        setViewerWidth(viewerRef.current.clientWidth);
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Scroll to & highlight a page
  const goToPage = (pageNum) => {
    const el = document.getElementById(`pdf_page_${pageNum}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.style.boxShadow = "0 0 0 4px #2563eb";
      setTimeout(() => (el.style.boxShadow = ""), 900);
    }
  };

  // Upload
  const onFileChange = async (event) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    setUploadError("");
    setIsUploading(true);
    setNumPages(null);
    setFile(null); // force re-render cleanly

    // Prepare form
    const formData = new FormData();
    formData.append("pdf", selectedFile);

    try {
      const resp = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        body: formData,
      });

      if (!resp.ok) {
        // back-end may return a JSON {error:"..."}
        let errText = "Failed to upload PDF.";
        try {
          const data = await resp.json();
          if (data?.error) errText = data.error;
        } catch {
          /* ignore parse error */
        }
        setUploadError(errText);
        return;
      }

      const data = await resp.json();
      // Expecting: { docId, pdfUrl }
      setFile(selectedFile);
      setDocId(data?.docId || selectedFile.name);
      setPdfUrl(`${API_BASE}${data?.pdfUrl || `/file/${encodeURIComponent(selectedFile.name)}`}`);
      setMessages([
        {
          role: "bot",
          text: `Uploaded "${selectedFile.name}". Ask your questions below.`,
        },
      ]);
    } catch (e) {
      console.error("Upload error:", e);
      setUploadError("Error uploading PDF.");
    } finally {
      setIsUploading(false);
      // allow selecting the same file again later
      event.target.value = "";
    }
  };

  const onDocumentLoadSuccess = ({ numPages }) => setNumPages(numPages);

  // Chat send
  const handleSend = async () => {
    if (!input.trim() || !docId) return;

    const newMessages = [...messages, { role: "user", text: input }];
    setMessages(newMessages);
    setInput("");
    setIsPending(true);

    try {
      const resp = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: input, docId }),
      });
      const data = await resp.json();

      setMessages([
        ...newMessages,
        {
          role: "bot",
          text: data?.answer || "No response.",
          citations: Array.isArray(data?.citations) ? data.citations : [],
        },
      ]);
    } catch (e) {
      console.error("Chat error:", e);
      setMessages([...newMessages, { role: "bot", text: "Error getting response." }]);
    } finally {
      setIsPending(false);
    }
  };

  // Render helper: paragraphs from answer (respect \n)
  const renderBotText = (text) =>
    String(text)
      .split(/\n+/)
      .map((line, i) => (
        <p key={i} style={{ margin: "0 0 6px 0", whiteSpace: "pre-wrap" }}>
          {line}
        </p>
      ));

  // Width for PDF pages (kept within sensible bounds)
  const pageWidth = Math.max(280, Math.min(900, (viewerWidth || 0) - 32));

  return (
    <div className="pdf-chat-app">
      <div className="pdf-chat-header">
        <p>Lakshmi Sri HL – PDF Chat Assistant</p>
      </div>

      <div className="pdf-chat-main">
        {/* Chat column */}
        <div className="chat-section">
          <div className="pdf-upload-container">
            <label className="pdf-upload-btn">
              Upload PDF
              <input
                type="file"
                accept="application/pdf"
                onChange={onFileChange}
                style={{ display: "none" }}
              />
            </label>

            <div className="upload-hint" aria-live="polite">
              <span className="hint-line">Only PDFs allowed.</span>
              <span className="hint-line">
                Max size <strong>10 MB</strong>.
              </span>
            </div>
          </div>

          {uploadError && <div className="upload-error">{uploadError}</div>}

          <div className="chat-messages">
            {messages.map((msg, idx) => (
              <div key={idx} className={`chat-message ${msg.role}`}>
                {msg.role === "bot" ? renderBotText(msg.text) : msg.text}

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

            {isPending && (
              <div className="pending-status" aria-live="polite">
                <span className="dot" />
                <span className="dot dot2" />
                <span className="dot dot3" />
                <span>thinking…</span>
              </div>
            )}
          </div>

          <div className="chat-input">
            <input
              type="text"
              placeholder={docId ? "Ask something about the PDF…" : "Upload a PDF first"}
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

        {/* Viewer column */}
        <div className="pdf-viewer" ref={viewerRef}>
          <h2>PDF Viewer</h2>

          {isUploading && (
            <div className="pdf-loader">
              <div className="spinner" />
              <p>Uploading PDF, please wait…</p>
            </div>
          )}

          {!isUploading && pdfUrl && (
            <Document file={pdfUrl} onLoadSuccess={onDocumentLoadSuccess}>
              {Array.from({ length: numPages || 0 }, (_, i) => {
                const pageNum = i + 1;
                return (
                  <div key={`wrap_${pageNum}`} id={`pdf_page_${pageNum}`} className="page-wrap">
                    <Page
                      pageNumber={pageNum}
                      width={pageWidth}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                      renderMode="canvas"
                    />
                    <div className="page-badge">{pageNum}</div>
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
