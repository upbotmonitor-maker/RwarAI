import express from "express";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// API route first
app.post("/api/chat", async (req, res) => {
  const { messages, apiKey, searchMode } = req.body;

  // Validate we have some messages
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Messages array is required" });
  }

  // Determine which key to use
  const activeKey = apiKey || process.env.GEMINI_API_KEY;
  if (!activeKey) {
    return res.status(400).json({ error: "Gemini API anahtarı bulunamadı. Lütfen sol menüdeki Ayarlar'dan bir API anahtarı girin." });
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: activeKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        }
      }
    });

    // Format chat history for Gemini API.
    // Translates user messages to roles: 'user' and 'model'
    const contents = messages.map(msg => {
      const parts: any[] = [{ text: msg.content }];
      if (msg.image && msg.image.mimeType && msg.image.data) {
        parts.push({
          inlineData: {
            mimeType: msg.image.mimeType,
            data: msg.image.data
          }
        });
      }
      return {
        role: msg.role === "assistant" ? "model" : "user",
        parts: parts
      };
    });

    const systemInstruction = `Sen Rwar'sın. ChatGPT benzeri gelişmiş ve samimi bir yapay zeka asistanısın.

KİŞİLİK ÖZELLİKLERİ:
- Samimi ve sıcak bir tavrın var
- İnsan gibi konuşuyorsun, robot değilsin
- Espri yapabilirsin ama zorlama değil
- Yardım etmeyi seviyorsun
- Sabırlı ve anlayışlısın

YAZMA STİLİ:
- Konuşma diliyle yazıyorsun (resmi değil)
- Cümlelerin doğal akıyor
- Düşünerek yazıyormuş gibi (streaming efekti)
- Noktalama işaretlerini doğru kullanıyorsun
- Kısa ve öz cümleler kuruyorsun

CEVAP VERME KURALLARI:
- Sadece Türkçe cevap ver
- Bilmediğin konularda "Bilmiyorum, araştırayım mı?" de
- Zararlı, etik dışı veya yasa dışı içerik üretme
- Kullanıcıyı dinlediğini hissettir
- Sorulara net ve anlaşılır cevap ver`;

    const config: any = {
      systemInstruction: systemInstruction,
      temperature: 0.7,
      topP: 0.9,
      maxOutputTokens: 8192,
    };

    if (searchMode) {
      config.tools = [{ googleSearch: {} }];
    }

    const responseStream = await ai.models.generateContentStream({
      model: "gemini-3.5-flash",
      contents: contents,
      config: config
    });

    // Set up SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    for await (const chunk of responseStream) {
      const text = chunk.text;
      const groundingMetadata = chunk.candidates?.[0]?.groundingMetadata;
      if (text || groundingMetadata) {
        res.write(`data: ${JSON.stringify({ text, groundingMetadata })}\n\n`);
      }
    }

    res.write("data: [DONE]\n\n");
    res.end();

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    // If headers have not been sent yet, we can send a JSON error.
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || "Bir hata oluştu" });
    } else {
      res.write(`data: ${JSON.stringify({ error: error.message || "Bir hata oluştu" })}\n\n`);
      res.end();
    }
  }
});

// Vite middleware and static serving setup
async function setupServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

setupServer();
