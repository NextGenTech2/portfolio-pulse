import React, { useState, useRef } from "react";
import { supabase } from "../supabaseClient";
import { Upload, CheckCircle2, AlertCircle } from "lucide-react";
import Papa from "papaparse";

export default function PortfolioUpload({ user, currentHoldings, onUploadSuccess }) {
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [isExpanded, setIsExpanded] = useState(!currentHoldings || currentHoldings.length === 0);
  const fileInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const processCSV = (file) => {
    setLoading(true);
    setStatus({ type: "", message: "" });

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = results.data;
          if (!rows || rows.length === 0) {
            throw new Error("The CSV file is empty.");
          }

          // Identify the column holding the stock ticker/symbol
          const sampleRow = rows[0];
          const keys = Object.keys(sampleRow);
          
          let tickerKey = keys.find(k => {
            const keyNormalized = k.toLowerCase().trim();
            return (
              keyNormalized === "instrument" ||
              keyNormalized === "symbol" ||
              keyNormalized === "ticker" ||
              keyNormalized === "stock name" ||
              keyNormalized === "stock"
            );
          });

          if (!tickerKey) {
            throw new Error(
              "Could not find a valid ticker column (e.g., Instrument, Symbol, Ticker, Stock Name) in the CSV."
            );
          }

          const parsedTickers = new Set();

          rows.forEach((row) => {
            const rawTicker = row[tickerKey];
            if (!rawTicker) return;

            let ticker = rawTicker.toString().trim().toUpperCase();

            // Ignore rows that represent totals or empty metadata
            if (
              ticker === "" || 
              ticker.startsWith("TOTAL") || 
              ticker.startsWith("GRAND TOTAL") ||
              ticker.includes("SUMMARY")
            ) {
              return;
            }

            // Remove any numbers or extra tags if the broker appends them (e.g. "INFY-EQ" -> "INFY")
            if (ticker.endsWith("-EQ")) {
              ticker = ticker.substring(0, ticker.length - 3);
            }

            // Standardize and add
            parsedTickers.add(ticker);
          });

          const holdingsArray = Array.from(parsedTickers);

          if (holdingsArray.length === 0) {
            throw new Error("No valid stock symbols extracted from the CSV file.");
          }

          // Update Supabase Database 'profiles' Table
          const { error } = await supabase
            .from("profiles")
            .upsert({
              id: user.id, // Supabase uses user.id (UUID)
              email: user.email,
              holdings: holdingsArray,
              updated_at: new Date().toISOString()
            });

          if (error) {
            throw error;
          }

          setStatus({
            type: "success",
            message: `Successfully parsed and loaded ${holdingsArray.length} holdings into your profile.`
          });
          
          setIsExpanded(false); // Collapse after successful upload

          if (onUploadSuccess) {
            onUploadSuccess(holdingsArray);
          }
        } catch (err) {
          console.error("CSV Processing Error:", err);
          setStatus({ type: "error", message: err.message || "Failed to parse CSV file." });
        } finally {
          setLoading(false);
        }
      },
      error: (error) => {
        console.error("PapaParse Error:", error);
        setStatus({ type: "error", message: "Failed to read file." });
        setLoading(false);
      }
    });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processCSV(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      processCSV(e.target.files[0]);
    }
  };

  const onButtonClick = (e) => {
    e.stopPropagation();
    fileInputRef.current.click();
  };

  return (
    <div className="upload-container">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
      
      {!isExpanded && currentHoldings && currentHoldings.length > 0 ? (
        <div className="upload-collapsed-bar" onClick={() => setIsExpanded(true)}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Upload size={14} style={{ color: "hsl(var(--text-secondary))" }} />
            <span style={{ fontWeight: 600, fontSize: "0.85rem", color: "#ffffff" }}>Import Portfolio (CSV)</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8rem" }}>
            <span style={{ color: "hsl(var(--text-muted))" }}>{currentHoldings.length} stocks</span>
            <span style={{ color: "hsl(var(--border-subtle))" }}>|</span>
            <span className="upload-new-link" style={{ color: "hsl(var(--accent-primary))", fontWeight: 600 }}>Upload New</span>
          </div>
        </div>
      ) : (
        <div>
          <div 
            className={`dropzone ${dragActive ? "active" : ""}`}
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={onButtonClick}
          >
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
              <div className="upload-icon-circle">
                <Upload size={20} />
              </div>
              <span className="dropzone-label">
                {loading ? "Parsing holdings..." : "Import Portfolio (CSV)"}
              </span>
              <span className="dropzone-text">
                Drag holdings from your broker.
              </span>
            </div>
          </div>

          {currentHoldings && currentHoldings.length > 0 && (
            <div className="upload-footer-stats">
              <span>Current profile: {currentHoldings.length} stocks</span>
              <span className="upload-new-link" onClick={() => setIsExpanded(false)}>Collapse</span>
            </div>
          )}
        </div>
      )}

      {status.type === "success" && (
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "1rem", color: "hsl(var(--accent-success))", fontSize: "0.85rem", justifyContent: "center" }}>
          <CheckCircle2 size={16} />
          <span>{status.message}</span>
        </div>
      )}

      {status.type === "error" && (
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "1rem", color: "hsl(var(--accent-warning))", fontSize: "0.85rem", justifyContent: "center" }}>
          <AlertCircle size={16} />
          <span>{status.message}</span>
        </div>
      )}
    </div>
  );
}
