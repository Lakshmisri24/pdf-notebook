import "./PdfChatApp.css";
import React, { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

// pdfjs.GlobalWorkerOptions.workerSrc = new URL(
//   "pdfjs-dist/build/pdf.worker.min.mjs",
//   import.meta.url
// ).toString();

//for netlify
pdfjs.GlobalWorkerOptions.workerSrc =
  `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

export default function PdfChatApp() {
  const [file, setFile] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [messages, setMessages] = useState([
    { role: "bot", text: "Upload a PDF and ask questions!" },
  ]);
  const [input, setInput] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const API_BASE = "https://notebook-production-428c.up.railway.app";

  const onFileChange = async (event) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    const formData = new FormData();
    formData.append("pdf", selectedFile);

    setIsUploading(true);

    try {
      const response = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        setFile(selectedFile);
        setNumPages(null);
        setMessages([
          {
            role: "bot",
            text: `Uploaded "${selectedFile.name}". Ask your questions below.`,
          },
        ]);
      } else {
        setMessages([{ role: "bot", text: "Failed to upload PDF." }]);
      }
    } catch (error) {
      console.error("Upload error:", error);
      setMessages([{ role: "bot", text: "Error uploading PDF." }]);
    } finally {
      setIsUploading(false);
    }
  };

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
  };

  const goToPage = (pageNum) => {
    const el = document.getElementById(`pdf_page_${pageNum}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.style.boxShadow = "0 0 0 4px #2563eb";
      setTimeout(() => {
        el.style.boxShadow = "";
      }, 1000);
    }
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const newMessages = [...messages, { role: "user", text: input }];
    setMessages(newMessages);
    setInput("");

    try {
      const response = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: input, docId: file?.name }),
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
      setMessages([
        ...newMessages,
        { role: "bot", text: "Error getting response." },
      ]);
    }
  };

  const pdfUrl = file && `${API_BASE}/file/${encodeURIComponent(file.name)}`;

  return (
    
    <div className="pdf-chat-app">  
      <div className="pdf-chat-header">
        <p>Lakshmi Sri HL- PDF Chat Assistant</p>
        
        </div> 
      <div className="pdf-chat-main">
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
          </div>

          <div className="chat-messages">
            {messages.map((msg, idx) => (
              <div key={idx} className={`chat-message ${msg.role}`}>
                <div>{msg.text}</div>

                {Array.isArray(msg.citations) && msg.citations.length > 0 && (
                  <div
                    className="citations"
                    style={{
                      marginTop: 8,
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
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
          </div>

          <div className="chat-input">
            <input
              type="text"
              placeholder="Ask something about the PDF..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              disabled={!file}
            />
            <button
              onClick={handleSend}
              disabled={!file || !input.trim()}
            >
              Send
            </button>
          </div>
        </div>

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
          {!isUploading && file && (
            <Document file={pdfUrl} onLoadSuccess={onDocumentLoadSuccess}>
              {Array.from({ length: numPages }, (_, index) => (
                <div
                  key={`page_${index + 1}`}
                  id={`pdf_page_${index + 1}`}
                  style={{ marginBottom: "24px", scrollMarginTop: "80px" }}
                >
                  <Page
                    pageNumber={index + 1}
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
