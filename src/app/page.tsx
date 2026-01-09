"use client";

import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import ReactMarkdown from "react-markdown";

interface Message {
  id: number;
  text: string;
  sender: "user" | "bot";
  markdown?: boolean;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [useMarkdown, setUseMarkdown] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfContent, setPdfContent] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load chat history
  useEffect(() => {
    const saved = localStorage.getItem("chatHistory");
    if (saved) setMessages(JSON.parse(saved));
  }, []);

  // Save chat history
  useEffect(() => {
    localStorage.setItem("chatHistory", JSON.stringify(messages));
  }, [messages]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Load PDF.js
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js";
    script.onload = () => {
      // @ts-ignore
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";
    };
    document.body.appendChild(script);
  }, []);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setPdfFile(file);
    console.log("File uploaded:", file.name);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        // @ts-ignore
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(reader.result as ArrayBuffer) }).promise;
        let textContent = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const text = await page.getTextContent();
          textContent += text.items.map((item: any) => item.str).join(" ") + "\n";
        }
        setPdfContent(textContent);
        console.log("Parsed PDF content:", textContent);
      } catch (err) {
        console.error("Error parsing PDF:", err);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now(),
      text: input,
      sender: "user",
      markdown: useMarkdown,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const contents = messages
        .concat(userMessage)
        .map((msg) => ({
          role: msg.sender === "user" ? "user" : "model",
          parts: [{ text: msg.text }],
        }));

      if (pdfContent) {
        contents.push({
          role: "user",
          parts: [{ text: `\n\n[Attached PDF content for context]:\n${pdfContent}` }],
        });
      }

      const body: any = { contents };
      body.generationConfig = { response_mime_type: "text/plain" };

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.NEXT_PUBLIC_GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errorText}`);
      }

      const data = await res.json();
      const botReply =
        data?.candidates?.[0]?.content?.parts?.[0]?.text ||
        "Sorry, I couldn’t get a response.";

      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, text: botReply, sender: "bot", markdown: useMarkdown },
      ]);
    } catch (error) {
      console.error("Error calling Gemini API:", error);
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, text: "Error: Unable to fetch response.", sender: "bot", markdown: false },
      ]);
    } finally {
      setLoading(false);
      setPdfFile(null);
      setPdfContent("");
    }
  };

  return (
    <main className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
      <h1 className="text-3xl font-bold mb-6 text-gray-800 text-center">
        My Chatbot
      </h1>

      <Card className="w-full max-w-xl flex flex-col h-[600px]">
        <CardContent className="flex-1 p-0">
          <ScrollArea className="h-full px-4 py-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`my-2 flex ${
                  msg.sender === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`px-4 py-2 rounded-lg max-w-xs break-words ${
                    msg.sender === "user"
                      ? "bg-blue-500 text-white"
                      : "bg-gray-200 text-gray-800"
                  }`}
                >
                  {msg.markdown && msg.sender === "bot" ? (
                    <ReactMarkdown>{msg.text}</ReactMarkdown>
                  ) : (
                    msg.text
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="my-2 flex justify-start">
                <div className="px-4 py-2 rounded-lg max-w-xs bg-gray-200 text-gray-800 italic">
                  Typing...
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </ScrollArea>
        </CardContent>

        {/* PDF Upload Line */}
        <div className="p-4 border-t flex items-center gap-2">
          <input
            type="file"
            accept="application/pdf"
            onChange={handleFileUpload}
            className="border rounded p-1"
          />
          {pdfFile && <span className="text-sm text-gray-600">1 file uploaded</span>}
        </div>

        {/* Chat Input Line */}
        <div className="p-4 border-t flex gap-2">
          <Input
            className="flex-1"
            placeholder="Type your message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
          />
          <Button onClick={handleSend}>Send</Button>
          <Button
            variant={useMarkdown ? "default" : "outline"}
            onClick={() => setUseMarkdown((prev) => !prev)}
          >
            {useMarkdown ? "MD On" : "MD Off"}
          </Button>
        </div>
      </Card>
    </main>
  );
}
